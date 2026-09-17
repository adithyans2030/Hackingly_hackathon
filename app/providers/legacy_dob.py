"""Adapter for Hackingly's EXISTING Textract DOB-extraction pipeline.

The brief requires building on top of that pipeline with minimal changes. So TrustGate
never modifies it: we call it as-is and treat its output as one independent DOB source,
which is then cross-checked against our own extraction and the Aadhaar Secure QR.

HOW TO PLUG IN THE REAL PIPELINE
--------------------------------
Replace the body of `call_existing_pipeline` with an import of Hackingly's function, e.g.

    from hackingly.ocr.dob import extract_dob   # their existing code
    return extract_dob(image_bytes)

or an HTTP call if it runs as a service:

    r = requests.post(LEGACY_DOB_URL, files={"file": image_bytes}); return r.json()

It only needs to return {"dob": "<string as extracted>", "confidence": 0..100} or None.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger(__name__)

LEGACY_DOB_URL = os.getenv("LEGACY_DOB_URL", "")


@dataclass
class LegacyDOB:
    raw: str
    confidence: float
    source: str = "legacy_textract_pipeline"


def call_existing_pipeline(image_bytes: bytes, ocr_result=None) -> dict | None:
    """Default behaviour mirrors the existing pipeline: Textract's DOB answer.

    If a LEGACY_DOB_URL is configured we call the real service instead.
    """
    if LEGACY_DOB_URL:
        try:
            import requests

            r = requests.post(LEGACY_DOB_URL, files={"file": ("id.jpg", image_bytes)}, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            log.warning("Legacy DOB service failed: %s", e)
            return None
    if ocr_result is not None and "DOB" in ocr_result.queries:
        q = ocr_result.queries["DOB"]
        return {"dob": q.text, "confidence": q.confidence}
    return None


def extract_dob_legacy(image_bytes: bytes, ocr_result=None) -> LegacyDOB | None:
    out = call_existing_pipeline(image_bytes, ocr_result)
    if not out or not out.get("dob"):
        return None
    return LegacyDOB(str(out["dob"]), float(out.get("confidence", 0)))
