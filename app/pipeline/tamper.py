"""Tamper forensics. Each detector is a WEAK signal on its own; we say so in the reasons
and never auto-reject on them. Strong evidence (QR mismatch) lives in orchestrator.py.
"""
from __future__ import annotations

import io
import logging

import cv2
import numpy as np
from PIL import ExifTags, Image

from app.config import settings
from app.pipeline.signals import Signal, skipped
from app.providers import llm

log = logging.getLogger(__name__)

EDITORS = ("photoshop", "gimp", "canva", "picsart", "snapseed", "lightroom", "pixlr", "paint.net",
           "affinity", "fotor", "remini", "photopea", "inshot", "meitu", "illustrator", "coreldraw")


# ---------------------------------------------------------------------------
# 1. Metadata
# ---------------------------------------------------------------------------
def exif_signal(image_bytes: bytes) -> Signal:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        tags = {ExifTags.TAGS.get(k, str(k)): str(v) for k, v in exif.items()}
        info = img.info or {}
        software = " ".join(filter(None, [tags.get("Software", ""), str(info.get("Software", "")),
                                          str(info.get("software", ""))])).strip()
    except Exception as e:
        return skipped("metadata", "tamper", f"Could not read image metadata ({e})")
    data = {"software": software or None, "make": tags.get("Make"), "model": tags.get("Model"),
            "format": img.format}
    hit = next((e for e in EDITORS if e in software.lower()), None)
    if hit:
        return Signal("metadata", "tamper", "warn", 0.35,
                      f"Image was last saved by editing software ({software}).", weight=1.0, data=data)
    if tags.get("Make") or tags.get("Model"):
        return Signal("metadata", "tamper", "pass", 0.8,
                      f"Camera metadata present ({tags.get('Make', '')} {tags.get('Model', '')}).".replace("  ", " "),
                      weight=0.4, data=data)
    # Messaging apps and screenshots strip EXIF; this is common and not suspicious by itself.
    return Signal("metadata", "tamper", "info", 0.6,
                  "No camera metadata (normal for screenshots and forwarded images).", weight=0.2, data=data)


# ---------------------------------------------------------------------------
# 2. Error Level Analysis
# ---------------------------------------------------------------------------
def ela(image_bytes: bytes, quality: int = 90) -> tuple[np.ndarray, np.ndarray]:
    """Returns (ela_gray float32 0..255, heatmap BGR uint8)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    resaved = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    a = np.asarray(img, dtype=np.int16)
    b = np.asarray(resaved, dtype=np.int16)
    diff = np.abs(a - b).max(axis=2).astype(np.float32)
    diff = cv2.GaussianBlur(diff, (0, 0), 1.2)
    scale = 255.0 / max(1.0, np.percentile(diff, 99.7))
    vis = np.clip(diff * scale, 0, 255).astype(np.uint8)
    heat = cv2.applyColorMap(vis, cv2.COLORMAP_INFERNO)
    return diff, heat


def ela_signal(image_bytes: bytes, focus_boxes: dict[str, dict] | None = None,
               artifact_path: str | None = None) -> Signal:
    try:
        diff, heat = ela(image_bytes)
    except Exception as e:
        return skipped("error_level_analysis", "tamper", f"ELA failed ({e})")
    H, W = diff.shape
    if artifact_path:
        cv2.imwrite(artifact_path, heat)

    # Compare ELA energy inside key fields (DOB, name, ID number) with text elsewhere.
    # Edited text is re-compressed differently and usually stands out from its neighbours.
    edges = cv2.Canny(cv2.cvtColor(np.asarray(Image.open(io.BytesIO(image_bytes)).convert("RGB")),
                                   cv2.COLOR_RGB2GRAY), 60, 160) > 0
    baseline = float(np.median(diff[edges])) if edges.any() else float(np.median(diff))
    baseline = max(baseline, 0.5)
    ratios = {}
    for key, bb in (focus_boxes or {}).items():
        if not bb:
            continue
        x0, y0 = int(bb["left"] * W), int(bb["top"] * H)
        x1, y1 = int((bb["left"] + bb["width"]) * W), int((bb["top"] + bb["height"]) * H)
        region = diff[max(0, y0):y1, max(0, x0):x1]
        redges = edges[max(0, y0):y1, max(0, x0):x1]
        if region.size < 50:
            continue
        val = float(np.median(region[redges])) if redges.any() else float(np.median(region))
        ratios[key] = round(val / baseline, 2)

    # Grid scan for any unusually "hot" block
    gh, gw = 8, 12
    cells = []
    for gy in range(gh):
        for gx in range(gw):
            c = diff[gy * H // gh:(gy + 1) * H // gh, gx * W // gw:(gx + 1) * W // gw]
            cells.append(float(np.percentile(c, 95)))
    cells_arr = np.array(cells)
    med = float(np.median(cells_arr)) or 1.0
    hot = int((cells_arr > med * 4.0).sum())

    worst_field = max(ratios, key=ratios.get) if ratios else None
    worst = ratios.get(worst_field, 0) if worst_field else 0
    data = {"field_ratios": ratios, "hot_cells": hot, "baseline": round(baseline, 2)}
    if worst >= 2.2:
        return Signal("error_level_analysis", "tamper", "warn", 0.3,
                      f"Compression pattern around the {worst_field.replace('_', ' ')} differs from the rest "
                      f"of the card ({worst:.1f}× baseline), which can indicate editing.", weight=1.2, data=data)
    if hot >= 6:
        return Signal("error_level_analysis", "tamper", "info", 0.6,
                      f"{hot} regions show uneven compression; often caused by stickers, glare or re-saving.",
                      weight=0.6, data=data)
    return Signal("error_level_analysis", "tamper", "pass", 0.85,
                  "Compression is consistent across the card's text fields.", weight=0.8, data=data)


# ---------------------------------------------------------------------------
# 2b. JPEG ghosts (Farid, 2009): detect regions that were NOT part of an earlier compression
# ---------------------------------------------------------------------------
_GHOST_QS = list(range(50, 100, 5))


def _ghost_curves(image_bytes: bytes) -> np.ndarray:
    img = np.asarray(Image.open(io.BytesIO(image_bytes)).convert("L")).astype(np.float32)
    maps = []
    for q in _GHOST_QS:
        buf = io.BytesIO()
        Image.fromarray(img.astype(np.uint8)).save(buf, "JPEG", quality=q)
        r = np.asarray(Image.open(buf)).astype(np.float32)
        maps.append(cv2.blur((img - r) ** 2, (16, 16)))
    m = np.stack(maps)
    return (m - m.min(0)) / (m.max(0) - m.min(0) + 1e-6)


def _region_curve(curves: np.ndarray, bb: dict) -> np.ndarray | None:
    _, H, W = curves.shape
    x0, y0 = int(bb["left"] * W), int(bb["top"] * H)
    x1, y1 = int((bb["left"] + bb["width"]) * W), int((bb["top"] + bb["height"]) * H)
    reg = curves[:, max(0, y0):y1, max(0, x0):x1]
    return reg.reshape(len(_GHOST_QS), -1).mean(1) if reg[0].size >= 64 else None


def jpeg_ghost_signal(image_bytes: bytes, focus_boxes: dict[str, dict] | None) -> Signal:
    """If an image was saved at quality Q1 and later at Q2, the untouched areas keep a 'ghost'
    minimum at Q1. Text pasted in between lacks that ghost. We compare each key field's curve
    with the card's reference curve at the ghost quality."""
    boxes = {k: v for k, v in (focus_boxes or {}).items() if v}
    if not boxes:
        return skipped("jpeg_ghost", "tamper", "No field positions available for compression analysis")
    try:
        if Image.open(io.BytesIO(image_bytes)).format != "JPEG":
            return skipped("jpeg_ghost", "tamper", "Not a JPEG; compression history analysis not applicable")
        curves = _ghost_curves(image_bytes)
    except Exception as e:
        return skipped("jpeg_ghost", "tamper", f"Compression analysis failed ({e})")
    ref = _region_curve(curves, {"left": 0.2, "top": 0.2, "width": 0.6, "height": 0.6})
    gmin = int(ref.argmin())
    ghost = None
    for i in range(1, gmin):  # local minimum before the final-save minimum
        depth = min(ref[i - 1], ref[i + 1]) - ref[i]
        if ref[i] < ref[i - 1] and ref[i] < ref[i + 1] and depth > 0.05 and ref[i] < 0.15:
            ghost = i
            break
    data = {"final_quality": _GHOST_QS[gmin], "ghost_quality": _GHOST_QS[ghost] if ghost else None}
    if ghost is None:
        return Signal("jpeg_ghost", "tamper", "pass", 0.75,
                      "Single compression history; no sign of content added after an earlier save.",
                      weight=0.4, data=data)
    odd = {}
    for key, bb in boxes.items():
        c = _region_curve(curves, bb)
        if c is None:
            continue
        gap = float(c[ghost] - ref[ghost])
        data[f"{key}_gap"] = round(gap, 3)
        if gap > 0.15:
            odd[key] = gap
    if odd:
        k = max(odd, key=odd.get)
        return Signal("jpeg_ghost", "tamper", "critical" if odd[k] > 0.2 else "warn", 0.15,
                      f"The {k.replace('_', ' ')} lacks the compression trace (from an earlier save at quality "
                      f"{_GHOST_QS[ghost]}) that the rest of the card carries, so it was likely added "
                      "afterwards.", weight=1.8, data={**data, "suspect_field": k})
    return Signal("jpeg_ghost", "tamper", "pass", 0.85,
                  f"Image was re-saved (earlier quality {_GHOST_QS[ghost]}), and all key fields share that history.",
                  weight=0.8, data=data)


# ---------------------------------------------------------------------------
# 3. Copy-move (cloned digits/regions)
# ---------------------------------------------------------------------------
def copy_move_signal(bgr: np.ndarray) -> Signal:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    s = 1200 / max(gray.shape)
    if s < 1:
        gray = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    orb = cv2.ORB_create(nfeatures=3000)
    kps, des = orb.detectAndCompute(gray, None)
    if des is None or len(kps) < 50:
        return skipped("copy_move", "tamper", "Not enough texture for clone detection")
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(des, des, k=3)
    vecs = []
    for m in matches:
        for cand in m[1:]:  # m[0] is the keypoint itself
            if cand.distance > 12:
                continue
            p1, p2 = np.array(kps[cand.queryIdx].pt), np.array(kps[cand.trainIdx].pt)
            if np.linalg.norm(p1 - p2) < 40:
                continue
            vecs.append(tuple(np.round((p2 - p1) / 6).astype(int)))
    if not vecs:
        return Signal("copy_move", "tamper", "pass", 0.8, "No cloned regions found.", weight=0.5)
    from collections import Counter

    (vec, count), = Counter(vecs).most_common(1)
    data = {"cluster_size": count, "shift_px": [v * 6 for v in vec]}
    # Printed cards legitimately repeat patterns (guilloche, logos), so require a big cluster.
    if count >= 40:
        return Signal("copy_move", "tamper", "warn", 0.4,
                      f"A region appears duplicated elsewhere on the card ({count} matching points).",
                      weight=0.8, data=data)
    return Signal("copy_move", "tamper", "pass", 0.8, "No cloned regions found.", weight=0.5, data=data)


# ---------------------------------------------------------------------------
# 4. Screen recapture (photo of a screen -> moiré)
# ---------------------------------------------------------------------------
def recapture_signal(bgr: np.ndarray) -> Signal:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    s = 512 / max(gray.shape)
    g = cv2.resize(gray, (int(gray.shape[1] * s) // 2 * 2, int(gray.shape[0] * s) // 2 * 2))
    g = g - cv2.GaussianBlur(g, (0, 0), 3)  # keep high frequencies only
    win = np.outer(np.hanning(g.shape[0]), np.hanning(g.shape[1]))
    spec = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(g * win))))
    h, w = spec.shape
    yy, xx = np.ogrid[:h, :w]
    r = np.sqrt((yy - h / 2) ** 2 + (xx - w / 2) ** 2)
    band = spec[(r > min(h, w) * 0.18) & (r < min(h, w) * 0.48)]
    if band.size == 0:
        return skipped("screen_recapture", "tamper", "Image too small for recapture analysis")
    # Moiré shows up as isolated sharp peaks well above the local spectrum.
    peak_ratio = float((band.max() - np.median(band)) / (band.std() + 1e-6))
    data = {"peak_ratio": round(peak_ratio, 2)}
    if peak_ratio > settings.recapture_peak:
        return Signal("screen_recapture", "tamper", "warn", 0.35,
                      "Periodic screen-pixel pattern detected; this may be a photo of a screen rather than "
                      "the physical card.", weight=1.0, data=data)
    return Signal("screen_recapture", "tamper", "pass", 0.8,
                  "No screen-recapture pattern detected.", weight=0.5, data=data)


# ---------------------------------------------------------------------------
# 5. OCR anomaly: a key field whose font size / confidence differs from its neighbours
# ---------------------------------------------------------------------------
def ocr_anomaly_signal(ocr, key_lines: dict[str, object]) -> Signal:
    lines = [l for l in ocr.lines if l.bbox.height > 0]
    if len(lines) < 4:
        return skipped("font_consistency", "tamper", "Too little text to compare field styling")
    med_conf = float(np.median([l.confidence for l in lines]))
    notes = []
    data = {}
    for key, line in key_lines.items():
        if line is None:
            continue
        # compare with lines of similar role (short lines near it)
        neighbours = [l for l in lines if l is not line and abs(l.bbox.top - line.bbox.top) < 0.35]
        if len(neighbours) < 2:
            continue
        nh = float(np.median([l.bbox.height for l in neighbours]))
        h_ratio = line.bbox.height / nh if nh else 1
        conf_drop = med_conf - line.confidence
        data[key] = {"height_ratio": round(h_ratio, 2), "confidence": round(line.confidence, 1)}
        if conf_drop > 25:
            notes.append(f"{key.replace('_', ' ')} text is much less legible than the rest of the card")
    if notes:
        return Signal("font_consistency", "tamper", "info", 0.55, "; ".join(notes).capitalize() + ".",
                      weight=0.5, data=data)
    return Signal("font_consistency", "tamper", "pass", 0.8,
                  "Key fields are printed consistently with the rest of the card.", weight=0.4, data=data)


# ---------------------------------------------------------------------------
# 6. Layout: every accepted photo ID should carry a portrait
# ---------------------------------------------------------------------------
def portrait_signal(doc_type: str, face_bbox: dict | None) -> Signal:
    needs_photo = doc_type in {"AADHAAR", "PAN", "COLLEGE_ID", "DRIVING_LICENCE", "VOTER_ID", "PASSPORT"}
    if not needs_photo:
        return skipped("portrait_present", "tamper", "Document type unknown; portrait check not applicable")
    if face_bbox:
        return Signal("portrait_present", "tamper", "pass", 0.85, "Card holder's photo found on the document.",
                      weight=0.5, data={"bbox": face_bbox})
    return Signal("portrait_present", "tamper", "warn", 0.45,
                  "No face photo found on the document (it may be the back side, covered, or cropped).",
                  weight=0.7)


# ---------------------------------------------------------------------------
# 7. Vision-LLM forensic review (optional; explanation, low weight)
# ---------------------------------------------------------------------------
_FSYS = ("You are a document forensics examiner. You look for signs of digital editing on Indian ID cards. "
         "Be conservative: normal wear, glare and low resolution are NOT tampering. Return JSON only.")
_FPROMPT = """Image 1 is an ID card of type {doc_type}. Image 2 is its Error Level Analysis map
(bright = recompressed differently). Look for: mismatched fonts or kerning in the date of birth, name or
ID number; misaligned text baselines; patches with different background texture; pasted photo edges.
Return: {{"tampering_likely": true|false, "confidence": 0..1, "suspicious_fields": [..],
"observations": "one or two sentences"}}"""


def llm_forensics_signal(image_bytes: bytes, heat_bgr_path: str | None, doc_type: str) -> Signal:
    if not llm.enabled():
        return skipped("ai_forensic_review", "tamper", "AI forensic review is turned off")
    imgs = [(image_bytes, "image/jpeg")]
    if heat_bgr_path:
        with open(heat_bgr_path, "rb") as f:
            imgs.append((f.read(), "image/png"))
    out = llm.complete_json(_FSYS, _FPROMPT.format(doc_type=doc_type), imgs, max_tokens=400)
    if not out:
        return skipped("ai_forensic_review", "tamper", "AI forensic review unavailable")
    conf = float(out.get("confidence", 0.5))
    obs = str(out.get("observations", ""))[:300]
    if out.get("tampering_likely") and conf >= 0.6:
        return Signal("ai_forensic_review", "tamper", "warn", 0.35, f"AI examiner: {obs}", weight=0.8, data=out)
    return Signal("ai_forensic_review", "tamper", "pass", 0.75, f"AI examiner: {obs or 'no signs of editing.'}",
                  weight=0.4, data=out)
