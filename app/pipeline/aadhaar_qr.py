"""Aadhaar QR decoding.

Secure QR (2019+): a big decimal integer -> bytes -> gzip -> fields separated by 0xFF,
followed by a JPEG2000 photo and a 256-byte RSA-SHA256 signature by UIDAI.
Legacy QR (older cards): plain XML <PrintLetterBarcodeData uid=".." name=".." dob=".."/>
which is unsigned and therefore only a weak signal.

The printed DOB/name must match the QR. If someone edits the printed DOB in Photoshop,
they cannot regenerate a validly signed QR. That makes this the strongest tamper check.
"""
from __future__ import annotations

import logging
import re
import zlib
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

import cv2
import numpy as np

from app.config import settings

log = logging.getLogger(__name__)

SECURE_FIELDS = ["email_mobile_indicator", "reference_id", "name", "dob", "gender", "care_of",
                 "district", "landmark", "house", "location", "pincode", "post_office", "state",
                 "street", "sub_district", "vtc"]


@dataclass
class AadhaarQR:
    kind: str  # "secure" | "legacy_xml"
    name: str | None = None
    dob: str | None = None  # as printed in QR (DD-MM-YYYY) or year
    yob: str | None = None
    gender: str | None = None
    last4: str | None = None
    signature_verified: bool | None = None  # None = not checked (no cert configured)
    has_photo: bool = False
    photo: bytes | None = field(default=None, repr=False)
    raw_fields: dict = field(default_factory=dict)


def decode_qr_strings(bgr: np.ndarray) -> list[str]:
    """Try pyzbar first (best for dense QR), then OpenCV, on several preprocessings."""
    variants = [bgr]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    variants.append(cv2.cvtColor(cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                                       cv2.THRESH_BINARY, 31, 5), cv2.COLOR_GRAY2BGR))
    h, w = gray.shape
    if max(h, w) < 2000:
        variants.append(cv2.resize(bgr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
    out: list[str] = []
    try:
        from pyzbar import pyzbar  # type: ignore

        for v in variants:
            for sym in pyzbar.decode(v):
                s = sym.data.decode("utf-8", "ignore")
                if s and s not in out:
                    out.append(s)
            if out:
                return out
    except Exception:
        pass
    det = cv2.QRCodeDetector()
    for v in variants:
        try:
            s, _, _ = det.detectAndDecode(v)
        except cv2.error:
            s = ""
        if s and s not in out:
            out.append(s)
            break
    return out


def _verify_signature(signed: bytes, signature: bytes) -> bool | None:
    if not settings.uidai_cert_path:
        return None
    try:
        pem = open(settings.uidai_cert_path, "rb").read()
    except OSError as e:
        # A missing/misconfigured cert path is our problem, not evidence of tampering.
        # Returning False here would turn a config typo into a "not signed by UIDAI"
        # critical fraud signal on every single Aadhaar QR.
        log.warning("Could not read UIDAI cert at %s (%s); QR signature not checked",
                    settings.uidai_cert_path, e)
        return None
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        try:
            cert = x509.load_pem_x509_certificate(pem)
        except ValueError:
            cert = x509.load_der_x509_certificate(pem)
        cert.public_key().verify(signature, signed, padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception as e:
        log.info("Secure QR signature did not verify: %s", e)
        return False


def parse_secure(payload: str) -> AadhaarQR | None:
    if not payload.isdigit() or len(payload) < 100:
        return None
    n = int(payload)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    data = None
    for wbits in (16 + zlib.MAX_WBITS, zlib.MAX_WBITS, -zlib.MAX_WBITS):
        try:
            data = zlib.decompress(raw, wbits)
            break
        except zlib.error:
            continue
    if data is None:
        return None
    parts = data.split(b"\xff")
    offset = 0
    version = None
    if parts and parts[0][:1] == b"V":
        version = parts[0].decode("latin-1")
        offset = 1
    n_fields = len(SECURE_FIELDS) + (1 if version and version >= "V4" else 0)  # V4 adds mobile last4
    fields = {}
    for i, key in enumerate(SECURE_FIELDS):
        idx = offset + i
        if idx < len(parts):
            fields[key] = parts[idx].decode("latin-1", "ignore")
    # locate where text fields end, the remainder is photo + (optional hashes) + signature
    text_len = sum(len(p) + 1 for p in parts[: offset + n_fields])
    tail = data[text_len:]
    signature = data[-256:] if len(data) > 256 + text_len else b""
    photo = tail[:-256] if len(tail) > 256 else b""
    ref = fields.get("reference_id", "")
    dob = fields.get("dob", "")
    q = AadhaarQR(kind="secure", name=fields.get("name") or None,
                  dob=dob if re.search(r"\d{2}[-/]\d{2}[-/]\d{4}", dob) else None,
                  yob=dob if re.fullmatch(r"\d{4}", dob or "") else None,
                  gender=fields.get("gender") or None,
                  last4=ref[:4] if len(ref) >= 4 and ref[:4].isdigit() else None,
                  has_photo=len(photo) > 100, photo=photo or None,
                  raw_fields={k: v for k, v in fields.items() if k in ("name", "dob", "gender", "state", "version")})
    if version:
        q.raw_fields["version"] = version
    if signature:
        q.signature_verified = _verify_signature(data[:-256], signature)
    return q


def parse_legacy_xml(payload: str) -> AadhaarQR | None:
    if "PrintLetterBarcodeData" not in payload:
        return None
    try:
        start = payload.index("<PrintLetterBarcodeData")
        el = ET.fromstring(payload[start: payload.index("/>", start) + 2])
    except (ValueError, ET.ParseError):
        return None
    a = el.attrib
    uid = a.get("uid", "")
    return AadhaarQR(kind="legacy_xml", name=a.get("name"), dob=a.get("dob"), yob=a.get("yob"),
                     gender=a.get("gender"), last4=uid[-4:] if uid else None, signature_verified=None)


def read(bgr: np.ndarray) -> AadhaarQR | None:
    for s in decode_qr_strings(bgr):
        q = parse_secure(s) or parse_legacy_xml(s)
        if q:
            return q
    return None


# ---------------------------------------------------------------------------
# Test helper: build an (unsigned) Secure-QR-format payload. Used by sample generator.
# ---------------------------------------------------------------------------
def build_secure_payload(name: str, dob: str, gender: str, last4: str, version: str = "V2") -> str:
    ref = f"{last4}20260101120000000"
    values = ["0", ref, name, dob, gender, "", "Bengaluru", "", "", "", "560034", "", "Karnataka", "", "", ""]
    body = b"\xff".join([version.encode()] + [v.encode() for v in values]) + b"\xff"
    body += b"\x00" * 256  # placeholder signature (unsigned test payload)
    comp = zlib.compressobj(9, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
    gz = comp.compress(body) + comp.flush()
    return str(int.from_bytes(gz, "big"))
