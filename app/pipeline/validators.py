"""Deterministic validators: cheap, explainable, and never hallucinate."""
from __future__ import annotations

import re
from datetime import date, datetime

# ---------------------------------------------------------------------------
# Verhoeff checksum (used by Aadhaar's 12th digit)
# ---------------------------------------------------------------------------
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def verhoeff_valid(num: str) -> bool:
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_generate(num: str) -> str:
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(_INV[c])


def aadhaar_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def validate_aadhaar(num: str) -> tuple[bool, str]:
    d = aadhaar_digits(num)
    if len(d) != 12:
        return False, f"Aadhaar number has {len(d)} digits (expected 12)"
    if d[0] in "01":
        return False, "Aadhaar numbers never start with 0 or 1"
    if not verhoeff_valid(d):
        return False, "Aadhaar checksum (Verhoeff) does not match"
    return True, "Aadhaar number format and checksum are valid"


def mask_aadhaar(num: str) -> str:
    d = aadhaar_digits(num)
    return f"XXXX XXXX {d[-4:]}" if len(d) >= 4 else "XXXX"


# ---------------------------------------------------------------------------
# PAN
# ---------------------------------------------------------------------------
PAN_RE = re.compile(r"^[A-Z]{3}[ABCFGHLJPTK][A-Z][0-9]{4}[A-Z]$")


def validate_pan(pan: str, name: str | None = None) -> tuple[bool, str, dict]:
    p = re.sub(r"\s", "", (pan or "").upper())
    info: dict = {}
    if not PAN_RE.match(p):
        return False, "PAN does not match the AAAAA9999A format", info
    info["holder_type"] = {"P": "individual", "C": "company", "H": "HUF", "F": "firm", "T": "trust"}.get(p[3], "other")
    if p[3] != "P":
        return False, f"PAN belongs to a {info['holder_type']}, not an individual", info
    if name:
        parts = [x for x in re.split(r"[\s.]+", name.upper()) if x]
        # 5th char is the first letter of the surname (usually last token, sometimes first)
        info["surname_initial_ok"] = bool(parts) and p[4] in {parts[-1][0], parts[0][0]}
    return True, "PAN format is valid for an individual", info


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------
_DATE_PATTERNS = [
    (re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"), "dmy"),
    (re.compile(r"\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{4})\b"), "dMy"),
]
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date(text: str) -> date | None:
    if not text:
        return None
    t = text.strip()
    for rx, kind in _DATE_PATTERNS:
        m = rx.search(t)
        if not m:
            continue
        try:
            if kind == "dmy":
                d, mo, y = map(int, m.groups())
            elif kind == "ymd":
                y, mo, d = map(int, m.groups())
            else:
                d, y = int(m.group(1)), int(m.group(3))
                mo = _MONTHS.get(m.group(2)[:3].lower())
                if not mo:
                    continue
            return date(y, mo, d)
        except ValueError:
            continue
    return None


def parse_year(text: str) -> int | None:
    m = re.search(r"\b(19[3-9]\d|20[0-4]\d)\b", text or "")
    return int(m.group(1)) if m else None


def age_on(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def age_bounds_from_year(yob: int, on: date) -> tuple[int, int]:
    """With only a year of birth, the true age is one of two values."""
    return on.year - yob - 1, on.year - yob


def dob_sanity(dob: date, today: date | None = None) -> tuple[bool, str]:
    today = today or date.today()
    if dob > today:
        return False, "Date of birth is in the future"
    a = age_on(dob, today)
    if a < 5:
        return False, f"Implausible age ({a})"
    if a > 100:
        return False, f"Implausible age ({a})"
    return True, "Date of birth is plausible"


def iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def to_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return parse_date(s)
