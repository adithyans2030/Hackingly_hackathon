"""Turn OCR output into structured fields for common Indian IDs.

Two layers:
1. Deterministic parser (always runs; offline; explainable)
2. Optional LLM structurer that fills gaps. Every LLM value is GROUNDED: it must appear
   in the OCR text, otherwise it is discarded. This makes hallucinated fields impossible.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher

from app.pipeline import validators as V
from app.providers import llm
from app.providers.ocr import OCRResult

DOC_TYPES = ("AADHAAR", "PAN", "COLLEGE_ID", "DRIVING_LICENCE", "VOTER_ID", "PASSPORT", "UNKNOWN")


@dataclass
class Field:
    value: str | None = None
    confidence: float = 0.0  # 0..1
    source: str = ""
    bbox: dict | None = None


@dataclass
class Extracted:
    doc_type: str = "UNKNOWN"
    doc_type_confidence: float = 0.0
    name: Field = field(default_factory=Field)
    dob: Field = field(default_factory=Field)          # ISO yyyy-mm-dd
    yob: Field = field(default_factory=Field)          # year-only cards
    id_number: Field = field(default_factory=Field)
    institution: Field = field(default_factory=Field)
    valid_till: Field = field(default_factory=Field)   # ISO
    gender: Field = field(default_factory=Field)
    dob_candidates: list[dict] = field(default_factory=list)

    def to_dict(self, mask: bool = True) -> dict:
        d = asdict(self)
        if mask and self.doc_type == "AADHAAR" and self.id_number.value:
            d["id_number"]["value"] = V.mask_aadhaar(self.id_number.value)
        return d


_STOP = set("""government govt india of authority unique identification card department income tax
dob date birth male female student university college institute valid father address signature
permanent account number specimen sample identity year roll enrollment enrolment course branch
issued republic election commission elector licence license driving passport valid upto till
holder principal registrar batch program programme dept blood group mobile phone email document
aadhaar mera pehchaan aam aadmi adhikar""".split())

_DOB_LABEL = re.compile(r"(d\.?\s?o\.?\s?b|date\s*of\s*birth|birth|जन्म)", re.I)
_YOB_LABEL = re.compile(r"(year\s*of\s*birth|yob)", re.I)
_VALID_LABEL = re.compile(r"(valid\s*(up\s*to|upto|till|thru|through)|expir|validity)", re.I)
_NAME_LABEL = re.compile(r"^\s*(student'?s?\s*)?name\s*[:\-]?\s*(.*)$", re.I)
_AADHAAR_NUM = re.compile(r"\b([2-9]\d{3}\s?\d{4}\s?\d{4})\b")
_PAN_NUM = re.compile(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b")
_ROLL = re.compile(r"(roll|enrol+ment|enrolment|reg(?:istration)?|student\s*id|id|admission|usn|prn)"
                   r"\s*(no\.?|number|#)?\s*[:\-.]?\s*([A-Z0-9][A-Z0-9/\-]{3,})", re.I)
_INSTITUTION = re.compile(r"(college|university|institute|iit|nit|iiit|school\s+of|vidyalaya|"
                          r"academy|polytechnic|engineering|technology)", re.I)
_EPIC = re.compile(r"\b([A-Z]{3}[0-9]{7})\b")
_DL = re.compile(r"\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}\s?\d{7})\b")
_PASSPORT = re.compile(r"\b([A-PR-WY][1-9]\d\s?\d{4}[1-9])\b")


def classify(text: str) -> tuple[str, float]:
    t = text.lower()
    scores = {
        "AADHAAR": 2 * ("aadhaar" in t or "aadhar" in t) + ("unique identification" in t)
                   + ("government of india" in t) + 2 * bool(_AADHAAR_NUM.search(text)) + ("आधार" in text),
        "PAN": 2 * ("income tax" in t) + 2 * ("permanent account" in t) + 2 * bool(_PAN_NUM.search(text)),
        "COLLEGE_ID": 2 * bool(_INSTITUTION.search(text)) + ("student" in t) + ("identity card" in t)
                      + bool(re.search(r"roll|enrol|usn|prn|course|branch|batch", t)),
        "DRIVING_LICENCE": 3 * ("driving licence" in t or "driving license" in t) + bool(_DL.search(text)),
        "VOTER_ID": 3 * ("election commission" in t) + bool(_EPIC.search(text)) + ("elector" in t),
        "PASSPORT": 3 * ("passport" in t) + ("republic of india" in t) + bool(_PASSPORT.search(text)),
    }
    best = max(scores, key=scores.get)
    if scores[best] < 2:
        return "UNKNOWN", 0.2
    ordered = sorted(scores.values(), reverse=True)
    margin = ordered[0] - ordered[1]
    return best, min(0.99, 0.55 + 0.1 * scores[best] + 0.05 * margin)


def _strip_noise(s: str) -> str:
    """Drop OCR junk glued to a name, e.g. 'a, Ishaan Rao' from portrait texture."""
    toks = s.strip().split()
    while len(toks) > 1 and (len(toks[0]) <= 2 and (not toks[0][:1].isupper() or not toks[0].isalpha())):
        toks.pop(0)
    while len(toks) > 1 and (len(toks[-1]) <= 2 and (not toks[-1][:1].isupper() or not toks[-1].isalpha())):
        toks.pop()
    return " ".join(toks)


def _is_name_like(s: str) -> bool:
    s = _strip_noise(s)
    if not (3 <= len(s) <= 40) or re.search(r"\d", s):
        return False
    words = re.findall(r"[A-Za-z]+", s)
    if not (1 <= len(words) <= 5):
        return False
    if any(w.lower() in _STOP for w in words):
        return False
    letters = sum(c.isalpha() for c in s)
    return letters / max(1, len(s.replace(" ", "").replace(".", ""))) > 0.9


def _clean_name(s: str) -> str:
    s = _strip_noise(s)
    s = re.sub(r"[^A-Za-z .]", " ", s)
    return re.sub(r"\s+", " ", s).strip().title()


def _bbox(line) -> dict | None:
    return line.bbox.to_dict() if line else None


def parse(ocr: OCRResult) -> Extracted:
    lines = ocr.lines
    text = ocr.full_text
    ex = Extracted()
    ex.doc_type, ex.doc_type_confidence = classify(text)

    # ---- DOB / YOB --------------------------------------------------------
    for i, ln in enumerate(lines):
        if _YOB_LABEL.search(ln.text) and not ex.yob.value:
            y = V.parse_year(ln.text) or (V.parse_year(lines[i + 1].text) if i + 1 < len(lines) else None)
            if y:
                ex.yob = Field(str(y), ln.confidence / 100, "label:year_of_birth", _bbox(ln))
        if _DOB_LABEL.search(ln.text) and not _VALID_LABEL.search(ln.text):
            d = V.parse_date(ln.text)
            src_line = ln
            if not d and i + 1 < len(lines):
                d = V.parse_date(lines[i + 1].text); src_line = lines[i + 1]
            if d:
                ex.dob_candidates.append({"value": d.isoformat(), "confidence": src_line.confidence / 100,
                                          "source": "ocr_label", "bbox": _bbox(src_line)})
    if not ex.dob_candidates and ex.doc_type == "PAN":
        # PAN cards print the DOB without a label on older designs
        for ln in lines:
            d = V.parse_date(ln.text)
            if d:
                ex.dob_candidates.append({"value": d.isoformat(), "confidence": ln.confidence / 100 * 0.9,
                                          "source": "ocr_unlabelled", "bbox": _bbox(ln)})
                break
    for q in ("DOB",):
        if q in ocr.queries:
            d = V.parse_date(ocr.queries[q].text)
            if d:
                ex.dob_candidates.append({"value": d.isoformat(), "confidence": ocr.queries[q].confidence / 100,
                                          "source": "textract_query",
                                          "bbox": ocr.queries[q].bbox.to_dict() if ocr.queries[q].bbox else None})
    if ex.dob_candidates:
        best = max(ex.dob_candidates, key=lambda c: c["confidence"])
        ex.dob = Field(best["value"], best["confidence"], best["source"], best["bbox"])

    # ---- ID number --------------------------------------------------------
    def first(rx, group=1, transform=lambda s: s):
        for ln in lines:
            m = rx.search(ln.text.upper() if rx in (_PAN_NUM, _EPIC, _DL, _PASSPORT) else ln.text)
            if m:
                return Field(transform(m.group(group)), ln.confidence / 100, "ocr_pattern", _bbox(ln))
        return None

    idf = None
    if ex.doc_type == "AADHAAR":
        idf = first(_AADHAAR_NUM, transform=lambda s: V.aadhaar_digits(s))
    elif ex.doc_type == "PAN":
        idf = first(_PAN_NUM)
    elif ex.doc_type == "VOTER_ID":
        idf = first(_EPIC)
    elif ex.doc_type == "DRIVING_LICENCE":
        idf = first(_DL, transform=lambda s: re.sub(r"[\s\-]", "", s))
    elif ex.doc_type == "PASSPORT":
        idf = first(_PASSPORT, transform=lambda s: s.replace(" ", ""))
    elif ex.doc_type == "COLLEGE_ID":
        for ln in lines:
            m = _ROLL.search(ln.text)
            if m and re.search(r"\d", m.group(3)):
                idf = Field(m.group(3).upper(), ln.confidence / 100, "ocr_label", _bbox(ln))
                break
    if "ID_NUMBER" in ocr.queries and not idf:
        q = ocr.queries["ID_NUMBER"]
        idf = Field(q.text.strip(), q.confidence / 100, "textract_query", q.bbox.to_dict() if q.bbox else None)
    if idf:
        ex.id_number = idf

    # ---- Name ---------------------------------------------------------------
    name = None
    for i, ln in enumerate(lines):
        m = _NAME_LABEL.match(ln.text)
        if m and not re.search(r"father|mother|guardian|institut|college", ln.text, re.I):
            val = m.group(2).strip()
            if _is_name_like(val):
                name = Field(_clean_name(val), ln.confidence / 100, "label:name", _bbox(ln)); break
            if i + 1 < len(lines) and _is_name_like(lines[i + 1].text):
                name = Field(_clean_name(lines[i + 1].text), lines[i + 1].confidence / 100, "label:name",
                             _bbox(lines[i + 1])); break
    if not name and ex.doc_type == "AADHAAR":
        # Aadhaar: the name line sits directly above the DOB/YOB line
        anchor = next((i for i, ln in enumerate(lines) if _DOB_LABEL.search(ln.text) or _YOB_LABEL.search(ln.text)), None)
        if anchor is not None:
            for j in range(anchor - 1, max(-1, anchor - 4), -1):
                if _is_name_like(lines[j].text):
                    name = Field(_clean_name(lines[j].text), lines[j].confidence / 100 * 0.9,
                                 "layout:above_dob", _bbox(lines[j])); break
    if not name and ex.doc_type == "PAN":
        for i, ln in enumerate(lines):
            if re.search(r"income\s*tax|govt", ln.text, re.I):
                for j in range(i + 1, min(len(lines), i + 4)):
                    if _is_name_like(lines[j].text):
                        name = Field(_clean_name(lines[j].text), lines[j].confidence / 100 * 0.85,
                                     "layout:after_header", _bbox(lines[j])); break
            if name:
                break
    if not name and "NAME" in ocr.queries:
        q = ocr.queries["NAME"]
        name = Field(_clean_name(q.text), q.confidence / 100, "textract_query", q.bbox.to_dict() if q.bbox else None)
    if not name:
        cands = [ln for ln in lines if _is_name_like(ln.text) and ln.bbox.height > 0]
        if cands:
            ln = max(cands, key=lambda l: l.bbox.height * l.confidence)
            name = Field(_clean_name(ln.text), ln.confidence / 100 * 0.6, "heuristic:largest_name_like", _bbox(ln))
    if name:
        ex.name = name

    # ---- Institution / validity / gender ------------------------------------
    for ln in lines:
        if _INSTITUTION.search(ln.text) and not re.search(r"roll|course|branch", ln.text, re.I) and len(ln.text) > 6:
            ex.institution = Field(re.sub(r"\s+", " ", ln.text).strip(), ln.confidence / 100, "ocr_keyword", _bbox(ln))
            break
    if not ex.institution.value and "INSTITUTION" in ocr.queries:
        q = ocr.queries["INSTITUTION"]
        ex.institution = Field(q.text, q.confidence / 100, "textract_query")
    for i, ln in enumerate(lines):
        if _VALID_LABEL.search(ln.text):
            d = V.parse_date(ln.text) or (V.parse_date(lines[i + 1].text) if i + 1 < len(lines) else None)
            if d:
                ex.valid_till = Field(d.isoformat(), ln.confidence / 100, "label:valid", _bbox(ln)); break
            y = re.search(r"\b(20\d{2})\b", ln.text)
            if y:
                ex.valid_till = Field(f"{y.group(1)}-12-31", ln.confidence / 100 * 0.8, "label:valid_year", _bbox(ln)); break
    g = re.search(r"\b(male|female|transgender)\b", text, re.I)
    if g:
        ex.gender = Field(g.group(1).upper(), 0.9, "ocr_keyword")
    return ex


# ---------------------------------------------------------------------------
# Optional LLM structurer (grounded)
# ---------------------------------------------------------------------------
_SYSTEM = ("You extract fields from OCR text of Indian identity documents. Return ONLY a JSON object. "
           "Copy values exactly as they appear in the text. If a field is not present, use null. Never guess.")

_PROMPT = """OCR lines (top to bottom):
{text}

Return JSON:
{{"doc_type": one of {types},
 "name": string|null, "dob": "DD/MM/YYYY as printed"|null, "year_of_birth": string|null,
 "id_number": string|null, "institution": string|null, "valid_till": string|null}}"""


def _grounded(value: str | None, text: str) -> bool:
    if not value:
        return False
    v = re.sub(r"\W", "", value).lower()
    t = re.sub(r"\W", "", text).lower()
    if v in t:
        return True
    # allow small OCR noise for longer strings
    if len(v) >= 8:
        m = SequenceMatcher(None, v, t).find_longest_match(0, len(v), 0, len(t))
        return m.size / len(v) >= 0.85
    return False


def llm_refine(ocr: OCRResult, ex: Extracted) -> Extracted:
    if not llm.enabled():
        return ex
    text = ocr.full_text
    out = llm.complete_json(_SYSTEM, _PROMPT.format(text=text, types=list(DOC_TYPES)))
    if not out:
        return ex
    if ex.doc_type == "UNKNOWN" and out.get("doc_type") in DOC_TYPES:
        ex.doc_type, ex.doc_type_confidence = out["doc_type"], 0.6
    if not ex.name.value and _grounded(out.get("name"), text):
        ex.name = Field(_clean_name(out["name"]), 0.7, "llm_grounded")
    if _grounded(out.get("dob"), text):
        d = V.parse_date(out["dob"])
        if d:
            ex.dob_candidates.append({"value": d.isoformat(), "confidence": 0.7, "source": "llm_grounded", "bbox": None})
            if not ex.dob.value:
                ex.dob = Field(d.isoformat(), 0.7, "llm_grounded")
    if not ex.yob.value and _grounded(out.get("year_of_birth"), text):
        y = V.parse_year(out["year_of_birth"])
        if y:
            ex.yob = Field(str(y), 0.7, "llm_grounded")
    if not ex.id_number.value and _grounded(out.get("id_number"), text):
        val = out["id_number"]
        ex.id_number = Field(V.aadhaar_digits(val) if ex.doc_type == "AADHAAR" else val.upper(), 0.7, "llm_grounded")
    if not ex.institution.value and _grounded(out.get("institution"), text):
        ex.institution = Field(out["institution"], 0.7, "llm_grounded")
    if not ex.valid_till.value and _grounded(out.get("valid_till"), text):
        d = V.parse_date(out["valid_till"])
        if d:
            ex.valid_till = Field(d.isoformat(), 0.7, "llm_grounded")
    return ex
