"""End-to-end verification pipeline.

    quality -> OCR (+ existing DOB pipeline) -> structure -> Aadhaar QR -> DOB resolution
    -> validators -> tamper forensics -> duplicates -> identity -> eligibility -> fusion
"""
from __future__ import annotations

import io
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from app import db
from app.config import settings
from app.pipeline import aadhaar_qr, duplicates, extraction, fusion, identity, quality, rules, tamper
from app.pipeline import validators as V
from app.pipeline.signals import Signal, skipped
from app.providers import llm
from app.providers.face import crop_largest_face, get_face
from app.providers.legacy_dob import extract_dob_legacy
from app.providers.ocr import get_ocr

log = logging.getLogger(__name__)
PIPELINE_VERSION = "1.0.0"


@dataclass
class Applicant:
    name: str
    email: str = ""
    phone: str = ""
    institution: str = ""
    dob: str = ""           # optional, as typed on the form
    external_ref: str = ""  # Hackingly registration id

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def _normalise_image(raw: bytes) -> tuple[bytes, np.ndarray]:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    if max(img.size) > 2400:
        img.thumbnail((2400, 2400), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=95)
    return buf.getvalue(), cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def _artifact_dir(vid: str) -> Path:
    p = settings.data_dir / "artifacts" / vid
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# DOB resolution across independent sources
# ---------------------------------------------------------------------------
def resolve_dob(ex: extraction.Extracted, legacy, qr: aadhaar_qr.AadhaarQR | None,
                form_dob: str) -> tuple[rules.DOBResolution, list[Signal], dict]:
    sig: list[Signal] = []
    votes: dict[str, float] = defaultdict(float)
    sources: dict[str, list[str]] = defaultdict(list)
    best_conf: dict[str, float] = defaultdict(float)

    printed = [c for c in ex.dob_candidates]
    for c in printed:
        votes[c["value"]] += c["confidence"]
        sources[c["value"]].append(c["source"])
        best_conf[c["value"]] = max(best_conf[c["value"]], c["confidence"])
    legacy_date = V.parse_date(legacy.raw) if legacy else None
    if legacy_date:
        k = legacy_date.isoformat()
        votes[k] += legacy.confidence / 100
        sources[k].append("existing_textract_pipeline")
        best_conf[k] = max(best_conf[k], legacy.confidence / 100)

    qr_date = V.parse_date(qr.dob) if qr and qr.dob else None
    qr_weight = 0.0
    if qr_date:
        qr_weight = 3.0 if qr.signature_verified else (1.5 if qr.kind == "secure" else 1.0)
        k = qr_date.isoformat()
        votes[k] += qr_weight
        sources[k].append(f"aadhaar_qr_{qr.kind}{'_signed' if qr.signature_verified else ''}")
        best_conf[k] = max(best_conf[k], 0.99 if qr.signature_verified else 0.9)

    debug = {"candidates": {k: {"votes": round(v, 2), "sources": sources[k]} for k, v in votes.items()}}

    if not votes:
        yob = int(ex.yob.value) if ex.yob.value and ex.yob.value.isdigit() else None
        if qr and qr.yob and qr.yob.isdigit():
            if yob and int(qr.yob) != yob:
                sig.append(Signal("aadhaar_qr_match", "tamper", "critical", 0.05,
                                  f"Birth year printed on the card ({yob}) differs from the Aadhaar QR ({qr.yob}).",
                                  weight=3.0))
            yob = int(qr.yob)
        return rules.DOBResolution(None, yob, ex.yob.confidence if yob else 0.0,
                                   ex.yob.source or "none", 1 if yob else 0), sig, debug

    winner = max(votes, key=votes.get)
    n_sources = len(sources[winner])
    conf = min(0.99, best_conf[winner] + 0.05 * (n_sources - 1))
    distinct_printed = {c["value"] for c in printed}

    # Printed vs QR: the strongest tamper evidence we have
    if qr_date:
        printed_values = distinct_printed | ({legacy_date.isoformat()} if legacy_date else set())
        if printed_values and qr_date.isoformat() not in printed_values:
            shown = sorted(printed_values)[0]
            sig.append(Signal("aadhaar_qr_match", "tamper", "critical", 0.02,
                              f"Date of birth printed on the card ({shown}) does not match the Aadhaar QR code "
                              f"({qr_date.isoformat()}). The printed date may have been edited.",
                              weight=3.0, data={"printed": shown, "qr": qr_date.isoformat(),
                                                "qr_signed": qr.signature_verified}))
            # trust the QR, but flag the uncertainty
            winner, conf = qr_date.isoformat(), 0.6
        else:
            sig.append(Signal("dob_consistency", "validity", "pass", 0.97,
                              "Printed date of birth matches the Aadhaar QR code.", weight=1.5))
    elif len(distinct_printed | ({legacy_date.isoformat()} if legacy_date else set())) > 1:
        sig.append(Signal("dob_consistency", "validity", "warn", 0.5,
                          "The existing OCR pipeline and the new extractor read different dates of birth "
                          f"({', '.join(sorted(votes))}). Likely an OCR misread; a person should confirm.",
                          weight=1.0, data=debug))
        conf = min(conf, 0.7)
    elif n_sources > 1:
        sig.append(Signal("dob_consistency", "validity", "pass", 0.9,
                          f"Date of birth confirmed by {n_sources} independent readers.", weight=1.0))

    d = V.to_date(winner)
    if d:
        ok, why = V.dob_sanity(d)
        if not ok:
            sig.append(Signal("dob_sanity", "validity", "warn", 0.3, why + " (possible OCR error).", weight=1.0))
            conf = min(conf, 0.5)
    if form_dob:
        fd = V.parse_date(form_dob) or V.to_date(form_dob)
        if fd and d and fd != d:
            sig.append(Signal("form_dob_match", "identity", "warn", 0.4,
                              f"Date of birth on the form ({fd.isoformat()}) differs from the document "
                              f"({d.isoformat()}).", weight=1.0))
        elif fd and d:
            sig.append(Signal("form_dob_match", "identity", "pass", 0.95,
                              "Date of birth on the form matches the document.", weight=0.8))
    return rules.DOBResolution(d, d.year if d else None, conf, "+".join(sources[winner]), n_sources), sig, debug


# ---------------------------------------------------------------------------
def _validity_signals(ex: extraction.Extracted, qr) -> list[Signal]:
    sig: list[Signal] = []
    idv = ex.id_number.value
    if ex.doc_type == "AADHAAR":
        if not idv:
            sig.append(Signal("id_number_valid", "validity", "warn", 0.45,
                              "Couldn't read the Aadhaar number.", weight=0.8))
        else:
            ok, why = V.validate_aadhaar(idv)
            if ok:
                sig.append(Signal("id_number_valid", "validity", "pass", 0.95, why + ".", weight=1.0))
            else:
                sig.append(Signal("id_number_valid", "validity", "warn", 0.35,
                                  f"{why}. This can be a misread digit, or an invented number.", weight=1.2))
            if qr and qr.last4 and len(V.aadhaar_digits(idv)) >= 4:
                if qr.last4 != V.aadhaar_digits(idv)[-4:]:
                    sig.append(Signal("aadhaar_qr_number", "tamper", "critical", 0.05,
                                      "Last 4 digits of the printed Aadhaar number don't match the QR code.",
                                      weight=2.5))
                else:
                    sig.append(Signal("aadhaar_qr_number", "tamper", "pass", 0.95,
                                      "Printed Aadhaar number matches the QR code.", weight=1.0))
        if qr and qr.name and ex.name.value:
            s, _ = identity.name_similarity(qr.name, ex.name.value)
            if s < 70:
                sig.append(Signal("aadhaar_qr_name", "tamper", "critical", 0.05,
                                  f"Name printed on the card (“{ex.name.value}”) doesn't match the QR code "
                                  f"(“{qr.name}”).", weight=2.5))
        if qr is None:
            sig.append(Signal("aadhaar_qr_match", "tamper", "info", 0.6,
                              "Aadhaar QR code not readable in this photo, so printed details couldn't be "
                              "cross-checked (common with phone photos).", weight=0.3))
        elif qr.signature_verified is False:
            sig.append(Signal("aadhaar_qr_signature", "tamper", "critical", 0.05,
                              "Aadhaar QR code is not signed by UIDAI.", weight=2.5))
        elif qr.signature_verified:
            sig.append(Signal("aadhaar_qr_signature", "tamper", "pass", 0.99,
                              "Aadhaar QR code carries a valid UIDAI digital signature.", weight=2.0))
    elif ex.doc_type == "PAN":
        if idv:
            ok, why, info = V.validate_pan(idv, ex.name.value)
            sig.append(Signal("id_number_valid", "validity", "pass" if ok else "warn", 0.9 if ok else 0.35,
                              why + ".", weight=1.0, data=info))
            if ok and info.get("surname_initial_ok") is False:
                sig.append(Signal("pan_surname", "validity", "info", 0.6,
                                  "PAN's 5th letter doesn't match the name's initials (fine if the name changed "
                                  "or is written differently).", weight=0.3))
        else:
            sig.append(Signal("id_number_valid", "validity", "warn", 0.45, "Couldn't read the PAN.", weight=0.8))
    elif idv:
        sig.append(Signal("id_number_valid", "validity", "pass", 0.75, "ID number found on the card.", weight=0.5))
    else:
        sig.append(Signal("id_number_valid", "validity", "info", 0.5, "No ID number could be read.", weight=0.4))
    return sig


def _extraction_signal(ex: extraction.Extracted) -> tuple[Signal, float]:
    fields = {"name": ex.name, "date_of_birth": ex.dob if ex.dob.value else ex.yob, "id_number": ex.id_number}
    present = {k: f.confidence for k, f in fields.items() if f.value}
    coverage = len(present) / len(fields)
    mean_conf = sum(present.values()) / len(present) if present else 0.0
    conf = round(coverage * mean_conf * 0.5 + coverage * 0.25 + ex.doc_type_confidence * 0.25, 3)
    missing = [k.replace("_", " ") for k in fields if k not in present]
    if coverage == 1 and mean_conf >= 0.8:
        s = Signal("extraction", "extraction", "pass", conf, "All key fields were read clearly.", weight=1.0)
    elif coverage >= 2 / 3:
        s = Signal("extraction", "extraction", "info", conf,
                   f"Most fields were read; missing or unclear: {', '.join(missing) or 'none'}.", weight=1.0)
    else:
        s = Signal("extraction", "extraction", "warn", conf,
                   f"Only part of the card could be read (missing: {', '.join(missing)}).", weight=1.0)
    s.data = {"field_confidence": {k: round(v, 2) for k, v in present.items()}, "doc_type": ex.doc_type}
    return s, conf


def _mask_and_save(vid: str, norm_bytes: bytes, ex: extraction.Extracted, qr) -> None:
    """Store only a masked copy. UIDAI requires masking the first 8 Aadhaar digits.

    If we can't locate the number to mask it, we don't gamble on storing an unmasked
    Aadhaar card — the whole image is withheld rather than saved with a partial mask.
    """
    art = _artifact_dir(vid)
    targets = [("id_masked.jpg", cv2.imdecode(np.frombuffer(norm_bytes, np.uint8), cv2.IMREAD_COLOR))]
    ela_path = art / "ela.png"
    if ela_path.exists():
        targets.append(("ela.png", cv2.imread(str(ela_path))))
    bb = ex.id_number.bbox
    mask_unconfirmed = ex.doc_type == "AADHAAR" and not bb
    for name, img in targets:
        H, W = img.shape[:2]
        if mask_unconfirmed:
            img[:] = (30, 30, 30)
            cv2.putText(img, "Aadhaar number location unconfirmed - image withheld",
                       (20, H // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (170, 170, 170), 1, cv2.LINE_AA)
        elif ex.doc_type == "AADHAAR" and bb:
            x0, y0 = int(bb["left"] * W), int(bb["top"] * H)
            w, h = int(bb["width"] * W), int(bb["height"] * H)
            cv2.rectangle(img, (x0 - 3, y0 - 3), (x0 + int(w * 0.68), y0 + h + 3), (45, 45, 45), -1)
        if not mask_unconfirmed and qr is not None and qr.kind == "legacy_xml":  # legacy QR holds the full number
            ok, pts = cv2.QRCodeDetector().detect(img)
            if ok and pts is not None:
                x, y, w, h = cv2.boundingRect(pts.astype(np.int32))
                img[y:y + h, x:x + w] = cv2.GaussianBlur(img[y:y + h, x:x + w], (51, 51), 0)
        if name.endswith(".jpg"):
            cv2.imwrite(str(art / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        else:
            cv2.imwrite(str(art / name), img)
    if settings.keep_raw_images:
        (art / "id_raw.jpg").write_bytes(norm_bytes)


# ---------------------------------------------------------------------------
def verify(vid: str, event: rules.EventConfig, applicant: Applicant, id_image: bytes,
           selfie: bytes | None = None) -> dict:
    t0 = time.perf_counter()
    timings: dict[str, int] = {}

    def lap(name: str, start: float) -> float:
        now = time.perf_counter()
        timings[name] = int((now - start) * 1000)
        return now

    art = _artifact_dir(vid)
    norm_bytes, bgr = _normalise_image(id_image)
    face = get_face()
    signals: list[Signal] = []

    # 1. quality -------------------------------------------------------------
    q_sigs, q_metrics = quality.assess(bgr)
    signals += q_sigs
    t = lap("quality", t0)
    if any(s.severity == "critical" for s in q_sigs):
        cv2.imwrite(str(art / "id_masked.jpg"), cv2.GaussianBlur(bgr, (0, 0), 6))
        out = fusion.decide(signals, {"resubmit": True}, 0.0, 0.0)
        return _assemble(vid, event, applicant, out, signals, extraction.Extracted(), None,
                         {"quality": q_metrics}, timings, t0, artifacts=["id_masked.jpg"])

    # 2. OCR + existing pipeline ---------------------------------------------------
    ocr = get_ocr().run(norm_bytes)
    legacy = extract_dob_legacy(norm_bytes, ocr)
    t = lap("ocr", t)

    # 3. structure ------------------------------------------------------------------
    ex = extraction.parse(ocr)
    ex = extraction.llm_refine(ocr, ex)
    ext_sig, ext_conf = _extraction_signal(ex)
    signals.append(ext_sig)
    t = lap("extraction", t)

    # 4. Aadhaar QR -------------------------------------------------------------------
    qr = aadhaar_qr.read(bgr) if ex.doc_type in ("AADHAAR", "UNKNOWN") else None
    if qr and ex.doc_type == "UNKNOWN":
        ex.doc_type, ex.doc_type_confidence = "AADHAAR", 0.8
    if qr and not ex.name.value and qr.name:
        ex.name = extraction.Field(qr.name, 0.85, f"aadhaar_qr_{qr.kind}")
    t = lap("qr", t)

    # 5. DOB resolution + validators ------------------------------------------------------
    dob_res, dob_sigs, dob_debug = resolve_dob(ex, legacy, qr, applicant.dob)
    signals += dob_sigs
    signals += _validity_signals(ex, qr)
    t = lap("validation", t)

    # 6. tamper forensics ------------------------------------------------------------------
    portrait, portrait_bbox = crop_largest_face(norm_bytes)
    if portrait:
        (art / "portrait.jpg").write_bytes(portrait)
    focus = {"date_of_birth": ex.dob.bbox, "name": ex.name.bbox, "id_number": ex.id_number.bbox}
    signals.append(tamper.exif_signal(id_image))
    signals.append(tamper.ela_signal(id_image, focus, str(art / "ela.png")))
    signals.append(tamper.jpeg_ghost_signal(id_image, focus))
    signals.append(tamper.copy_move_signal(bgr))
    signals.append(tamper.recapture_signal(bgr))
    key_lines = {k: next((l for l in ocr.lines if f.bbox and l.bbox.to_dict() == f.bbox), None)
                 for k, f in (("date_of_birth", ex.dob), ("name", ex.name), ("id_number", ex.id_number))}
    signals.append(tamper.ocr_anomaly_signal(ocr, key_lines))
    signals.append(tamper.portrait_signal(ex.doc_type, portrait_bbox))
    signals.append(tamper.llm_forensics_signal(norm_bytes, str(art / "ela.png"), ex.doc_type))
    t = lap("tamper", t)

    # 7. duplicates ---------------------------------------------------------------------------
    signals += duplicates.check_and_record(vid, event.event_id, applicant.name, applicant.email, ex.doc_type,
                                           ex.id_number.value, norm_bytes, portrait, face)
    t = lap("duplicates", t)

    # 8. identity -------------------------------------------------------------------------------
    signals.append(identity.name_signal(applicant.name, ex.name.value))
    similarity = None
    if selfie:
        selfie_norm, _ = _normalise_image(selfie)
        (art / "selfie.jpg").write_bytes(selfie_norm)
        if face and portrait:
            try:
                similarity = face.compare(portrait, selfie_norm)
            except Exception as e:
                log.warning("face compare failed: %s", e)
    signals.append(identity.face_signal(similarity, bool(selfie), face is not None, portrait is not None))
    t = lap("identity", t)

    # 9. eligibility + fusion ---------------------------------------------------------------------
    el_sigs, outcome = rules.evaluate(event, ex.doc_type, dob_res, ex.institution.value, ex.valid_till.value,
                                      applicant.institution, bool(selfie))
    signals += el_sigs
    decision = fusion.decide(signals, outcome, dob_res.confidence, ext_conf)
    lap("decision", t)

    _mask_and_save(vid, norm_bytes, ex, qr)
    artifacts = [p.name for p in art.iterdir()]
    extra = {
        "quality": q_metrics,
        "dob_resolution": {"dob": V.iso(dob_res.dob), "year_of_birth": dob_res.yob,
                           "confidence": round(dob_res.confidence, 3), "sources": dob_res.source,
                           "agreeing_sources": dob_res.agreeing_sources, **dob_debug},
        "eligibility": {**outcome, "event_date": event.on_date.isoformat()},
        "aadhaar_qr": None if not qr else {"kind": qr.kind, "name": qr.name, "dob": qr.dob or qr.yob,
                                           "last4": qr.last4, "signature_verified": qr.signature_verified},
        "portrait_bbox": portrait_bbox,
        "ocr_lines": len(ocr.lines),
    }
    return _assemble(vid, event, applicant, decision, signals, ex, legacy, extra, timings, t0, artifacts)


def _assemble(vid, event, applicant, decision, signals, ex, legacy, extra, timings, t0, artifacts) -> dict:
    timings["total"] = int((time.perf_counter() - t0) * 1000)
    boxes = {k: getattr(ex, k).bbox for k in ("name", "dob", "id_number", "institution", "valid_till")
             if getattr(ex, k).bbox}
    suspicious = []
    ela_sig = next((s for s in signals if s.name == "error_level_analysis"), None)
    if ela_sig and ela_sig.severity == "warn":
        ratios = ela_sig.data.get("field_ratios", {})
        key = max(ratios, key=ratios.get) if ratios else None
        map_key = {"date_of_birth": "dob", "name": "name", "id_number": "id_number"}.get(key)
        if map_key and map_key in boxes:
            suspicious.append({"field": map_key, "bbox": boxes[map_key], "why": "compression anomaly"})
    ghost = next((s for s in signals if s.name == "jpeg_ghost" and s.severity in ("warn", "critical")), None)
    if ghost:
        f = {"date_of_birth": "dob", "name": "name", "id_number": "id_number"}.get(ghost.data.get("suspect_field"))
        if f in boxes:
            suspicious.append({"field": f, "bbox": boxes[f], "why": "added after the card was first saved"})
    if any(s.name == "aadhaar_qr_match" and s.severity == "critical" for s in signals) and "dob" in boxes:
        suspicious.append({"field": "dob", "bbox": boxes["dob"], "why": "doesn't match QR"})

    face = get_face()
    return {
        "verification_id": vid,
        "event_id": event.event_id,
        "applicant": {"name": applicant.name, "email": applicant.email, "external_ref": applicant.external_ref},
        **decision,
        "extracted": {
            "doc_type": ex.doc_type,
            "name": ex.name.value,
            "dob": ex.dob.value,
            "year_of_birth": ex.yob.value,
            "id_number": V.mask_aadhaar(ex.id_number.value) if ex.doc_type == "AADHAAR" and ex.id_number.value
            else ex.id_number.value,
            "institution": ex.institution.value,
            "valid_till": ex.valid_till.value,
            "gender": ex.gender.value,
            "field_confidence": {k: round(getattr(ex, k).confidence, 2)
                                 for k in ("name", "dob", "id_number", "institution") if getattr(ex, k).value},
            "legacy_pipeline_dob": legacy.raw if legacy else None,
        },
        "field_boxes": boxes,
        "suspicious_regions": suspicious,
        "signals": [s.to_dict() for s in sorted(signals, key=lambda s: fusion.SEVERITY_ORDER[s.severity])],
        "artifacts": {a.rsplit(".", 1)[0]: f"/v1/verifications/{vid}/artifacts/{a}" for a in sorted(artifacts)},
        "timings_ms": timings,
        "providers": {"ocr": settings.ocr_provider, "face": face.name if face else "off",
                      "llm": settings.llm_provider if llm.enabled() else "off"},
        "pipeline_version": PIPELINE_VERSION,
        **extra,
    }
