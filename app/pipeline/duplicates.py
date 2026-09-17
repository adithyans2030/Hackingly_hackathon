"""Duplicate and reuse detection.

Three independent fingerprints:
  id_hmac : HMAC-SHA256 of the normalised ID number. Raw Aadhaar numbers are never stored.
  phash   : perceptual + text-stroke hashes of the upload (and its portrait). Catches the SAME
            photo/screenshot being shared and re-uploaded, even when OCR misreads the number.
            It is deliberately strict: ID cards share templates, so loose image hashing would
            flag different people. Re-photographed cards are caught by id_hmac and face search.
  face    : 1:N face search across all registrations. Catches one person using several IDs.

Policy (false-positive aware):
  same ID + same person (name ~ match or same email) -> info  (people join many hackathons)
  same ID + different name                             -> critical (reuse)
"""
from __future__ import annotations

import hashlib
import hmac
import io
import re

import cv2
import numpy as np
from PIL import Image

from app import db
from app.config import settings
from app.pipeline.identity import name_similarity, normalise
from app.pipeline.signals import Signal, skipped


def id_hmac(doc_type: str, id_number: str) -> str:
    norm = re.sub(r"[^A-Z0-9]", "", (id_number or "").upper())
    return hmac.new(settings.hmac_secret.encode(), f"{doc_type}:{norm}".encode(), hashlib.sha256).hexdigest()


def _hash_bits(bits: np.ndarray) -> str:
    return "%016x" % int("".join("1" if b else "0" for b in bits.flatten()), 2)


def phash(gray: np.ndarray) -> str:
    small = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    dct = cv2.dct(small)[:8, :8].flatten()
    med = np.median(dct[1:])
    return _hash_bits(dct > med)


def dhash(gray: np.ndarray) -> str:
    small = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA).astype(np.int16)
    return _hash_bits(small[:, 1:] > small[:, :-1])


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def text_hash(gray: np.ndarray) -> str:
    """1536-bit hash of dark text strokes with the background/template suppressed."""
    g = cv2.resize(gray, (640, 450), interpolation=cv2.INTER_AREA)
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    small = cv2.resize(bh, (48, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    return "%0384x" % int("".join("1" if b else "0" for b in (small > np.median(small)).flatten()), 2)


def _gray(image_bytes: bytes) -> np.ndarray:
    return cv2.cvtColor(np.asarray(Image.open(io.BytesIO(image_bytes)).convert("RGB")), cv2.COLOR_RGB2GRAY)


def image_fingerprint(image_bytes: bytes, portrait_bytes: bytes | None) -> str:
    """'phash|dhash|texthash|portrait_phash'."""
    g = cv2.equalizeHist(_gray(image_bytes))
    parts = [phash(g), dhash(g), text_hash(g)]
    parts.append(phash(cv2.equalizeHist(_gray(portrait_bytes))) if portrait_bytes else "")
    return "|".join(parts)


def _same_image(fp1: str, fp2: str) -> tuple[bool, int]:
    a, b = fp1.split("|"), fp2.split("|")
    if len(a) != 4 or len(b) != 4:
        return False, 999
    d_p, d_d, d_t = hamming(a[0], b[0]), hamming(a[1], b[1]), hamming(a[2], b[2])
    t = settings.phash_distance
    same = d_p <= t and d_d <= t + 4 and d_t <= 12  # 12/1536 bits: near-identical content only
    if same and a[3] and b[3]:
        same = hamming(a[3], b[3]) <= t + 2
    return same, d_t


def _applicant_label(vid: str) -> dict:
    v = db.get_verification(vid)
    if not v:
        return {"verification_id": vid}
    a = v["applicant"]
    return {"verification_id": vid, "name": a.get("name"), "email": a.get("email"),
            "event_id": v["event_id"], "created_at": v["created_at"], "decision": v["final_decision"]}


def check_and_record(vid: str, event_id: str, form_name: str, email: str, doc_type: str,
                     id_number: str | None, image_bytes: bytes, portrait_bytes: bytes | None,
                     face_provider=None) -> list[Signal]:
    signals: list[Signal] = []
    name_norm = " ".join(normalise(form_name))
    email = (email or "").strip().lower()

    def relation(row) -> str:
        same_email = bool(email) and row["email"] == email
        sim, _ = name_similarity(name_norm, row["name_norm"] or "")
        if same_email or sim >= settings.name_match_ok:
            return "same_person_same_event" if row["event_id"] == event_id else "same_person"
        return "different_person"

    # ---- 1. ID number ------------------------------------------------------
    if id_number:
        h = id_hmac(doc_type, id_number)
        rows = [r for r in db.fingerprints("id_hmac") if r["value"] == h and r["verification_id"] != vid]
        others = [(relation(r), r) for r in rows]
        diff = [r for rel, r in others if rel == "different_person"]
        same_ev = [r for rel, r in others if rel == "same_person_same_event"]
        if diff:
            matches = [_applicant_label(r["verification_id"]) for r in diff[:5]]
            names = ", ".join(f"“{m.get('name')}”" for m in matches)
            signals.append(Signal("id_reuse", "duplicate", "critical", 0.05,
                                  f"This ID number was already used by {len(diff)} other registration(s) under a "
                                  f"different name ({names}).", weight=2.5, data={"matches": matches}))
        elif same_ev:
            signals.append(Signal("id_reuse", "duplicate", "warn", 0.6,
                                  "This person already registered for this event with the same ID.", weight=0.5,
                                  data={"matches": [_applicant_label(r["verification_id"]) for r in same_ev[:5]]}))
        elif others:
            signals.append(Signal("id_reuse", "duplicate", "pass", 0.95,
                                  f"ID seen before for the same person at {len(others)} other event(s); "
                                  "returning participant.", weight=0.5,
                                  data={"matches": [_applicant_label(r['verification_id']) for _, r in others[:5]]}))
        else:
            signals.append(Signal("id_reuse", "duplicate", "pass", 0.9,
                                  "ID number has not been used by anyone else.", weight=1.0))
        db.add_fingerprint(vid, event_id, "id_hmac", h, name_norm, email)
    else:
        signals.append(skipped("id_reuse", "duplicate", "No ID number could be read, so number reuse was not checked"))

    # ---- 2. Same image ---------------------------------------------------------
    fp = image_fingerprint(image_bytes, portrait_bytes)
    hits = []
    for r in db.fingerprints("phash"):
        if r["verification_id"] == vid:
            continue
        same, dist = _same_image(fp, r["value"])
        if same:
            hits.append((relation(r), r, dist))
    diff_img = [(r, d) for rel, r, d in hits if rel == "different_person"]
    if diff_img:
        matches = [{**_applicant_label(r["verification_id"]), "distance": d} for r, d in diff_img[:5]]
        signals.append(Signal("image_reuse", "duplicate", "critical", 0.1,
                              f"The same ID photo was uploaded by {len(diff_img)} other registration(s) under a "
                              f"different name.", weight=2.0, data={"matches": matches}))
    else:
        signals.append(Signal("image_reuse", "duplicate", "pass", 0.9,
                              "This ID image hasn't been uploaded by anyone else.", weight=0.8,
                              data={"same_person_reuploads": len(hits)}))
    db.add_fingerprint(vid, event_id, "phash", fp, name_norm, email)

    # ---- 3. Same face, different identity ----------------------------------------
    if face_provider is None or portrait_bytes is None:
        signals.append(skipped("face_reuse", "duplicate",
                               "Face search skipped (no portrait found or face matching is off)"))
    else:
        try:
            matches = face_provider.index_and_search(portrait_bytes, vid, db.conn())
        except Exception as e:
            matches = []
            signals.append(skipped("face_reuse", "duplicate", f"Face search failed ({e})"))
        else:
            diff_face = []
            for m in matches:
                other = db.get_verification(m["verification_id"])
                if not other:
                    continue
                sim, _ = name_similarity(form_name, other["applicant"].get("name", ""))
                if sim < settings.name_match_review:
                    diff_face.append({**_applicant_label(m["verification_id"]), "similarity": m["similarity"]})
            if diff_face:
                signals.append(Signal("face_reuse", "duplicate", "critical", 0.1,
                                      f"The same face appears on {len(diff_face)} other registration(s) with a "
                                      "different name.", weight=2.0, data={"matches": diff_face}))
            else:
                signals.append(Signal("face_reuse", "duplicate", "pass", 0.9,
                                      "No other identity uses this face.", weight=0.8))
    return signals
