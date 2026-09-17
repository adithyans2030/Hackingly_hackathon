"""Quality gate. A bad photo is a RESUBMIT, never a rejection.

A large share of false rejections in real KYC flows come from blur and glare, not fraud,
so we catch them first (the browser runs the same blur check before upload).
"""
from __future__ import annotations

import cv2
import numpy as np

from app.config import settings
from app.pipeline.signals import Signal


def _blur_score(gray: np.ndarray) -> float:
    # Normalise size so the Laplacian variance is comparable across resolutions.
    h, w = gray.shape
    s = 1000 / max(h, w)
    g = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def _glare_ratio(bgr: np.ndarray) -> float:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # blown-out highlights: very bright AND desaturated, in connected blobs
    mask = ((hsv[..., 2] > 250) & (hsv[..., 1] < 25)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    total = gray_area = bgr.shape[0] * bgr.shape[1]
    big = sum(stats[i, cv2.CC_STAT_AREA] for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > total * 0.002)
    return big / gray_area


def _card_coverage(gray: np.ndarray) -> float:
    """Fraction of the frame covered by the largest 4-sided contour (card detection)."""
    h, w = gray.shape
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8))
    cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = 0.0
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 0.15 * h * w:
            continue
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) == 4:
            best = max(best, area / (h * w))
    return best


def assess(bgr: np.ndarray) -> tuple[list[Signal], dict]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    blur = _blur_score(gray)
    glare = _glare_ratio(bgr)
    coverage = _card_coverage(gray)
    metrics = {"blur": round(blur, 1), "glare": round(glare, 4), "width": w, "height": h,
               "card_coverage": round(coverage, 3)}
    sig: list[Signal] = []
    problems: list[str] = []

    if min(h, w) < settings.min_side_px:
        problems.append(f"Image is too small ({w}×{h}px). Use a photo at least {settings.min_side_px}px on the short side.")
    if blur < settings.blur_threshold:
        problems.append("Photo is blurry. Hold the phone steady and tap to focus on the card.")
    if glare > settings.glare_threshold:
        problems.append("Glare is covering part of the card. Tilt it away from the light.")

    if problems:
        sig.append(Signal("image_quality", "quality", "critical", 0.2, " ".join(problems),
                          weight=1.0, data={**metrics, "resubmit": True, "problems": problems}))
    else:
        score = min(1.0, 0.6 + blur / (settings.blur_threshold * 10))
        sig.append(Signal("image_quality", "quality", "pass", score,
                          "Photo is sharp, well lit and large enough.", weight=0.5, data=metrics))
    return sig, metrics


def quick_check(image_bytes: bytes) -> dict:
    """Used by POST /v1/quality-check for instant feedback before submission."""
    from app.providers.face import to_bgr

    signals, metrics = assess(to_bgr(image_bytes))
    s = signals[0]
    return {"ok": s.severity != "critical", "problems": s.data.get("problems", []), "metrics": metrics}
