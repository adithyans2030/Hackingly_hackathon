"""OCR providers.

Both providers return the same OCRResult so everything downstream is provider-agnostic.
Bounding boxes are normalised (0..1) like Textract's, so the dashboard can draw them
regardless of which engine produced them.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field

from PIL import Image

from app.config import settings

log = logging.getLogger(__name__)


@dataclass
class BBox:
    left: float
    top: float
    width: float
    height: float

    def to_dict(self) -> dict:
        return {"left": round(self.left, 4), "top": round(self.top, 4),
                "width": round(self.width, 4), "height": round(self.height, 4)}


@dataclass
class Line:
    text: str
    confidence: float  # 0..100
    bbox: BBox
    word_confidences: list[float] = field(default_factory=list)


@dataclass
class QueryAnswer:
    alias: str
    text: str
    confidence: float
    bbox: BBox | None = None


@dataclass
class OCRResult:
    provider: str
    lines: list[Line]
    queries: dict[str, QueryAnswer] = field(default_factory=dict)

    @property
    def full_text(self) -> str:
        return "\n".join(l.text for l in self.lines)

    def find_line(self, needle: str) -> Line | None:
        n = needle.replace(" ", "").lower()
        for line in self.lines:
            if n and n in line.text.replace(" ", "").lower():
                return line
        return None


# ---------------------------------------------------------------------------
# Textract (production)
# ---------------------------------------------------------------------------
TEXTRACT_QUERIES = [
    ("NAME", "What is the full name of the card holder?"),
    ("DOB", "What is the date of birth?"),
    ("YOB", "What is the year of birth?"),
    ("ID_NUMBER", "What is the ID number, card number or enrollment number?"),
    ("INSTITUTION", "What is the name of the college, university or institution?"),
    ("VALID_TILL", "Until what date is this card valid?"),
    ("GENDER", "What is the gender?"),
]


class TextractOCR:
    name = "textract"

    def __init__(self) -> None:
        import boto3  # lazy import

        self.client = boto3.client("textract", region_name=settings.aws_region)

    @staticmethod
    def _bbox(geom: dict | None) -> BBox:
        b = (geom or {}).get("BoundingBox") or {}
        return BBox(b.get("Left", 0), b.get("Top", 0), b.get("Width", 0), b.get("Height", 0))

    def run(self, image_bytes: bytes) -> OCRResult:
        resp = self.client.analyze_document(
            Document={"Bytes": image_bytes},
            FeatureTypes=["QUERIES"],
            QueriesConfig={"Queries": [{"Text": q, "Alias": a} for a, q in TEXTRACT_QUERIES]},
        )
        blocks = resp.get("Blocks", [])
        by_id = {b["Id"]: b for b in blocks}

        lines: list[Line] = []
        for b in blocks:
            if b["BlockType"] != "LINE":
                continue
            word_confs = []
            for rel in b.get("Relationships", []):
                if rel["Type"] == "CHILD":
                    word_confs = [by_id[i].get("Confidence", 0) for i in rel["Ids"] if i in by_id]
            lines.append(Line(b.get("Text", ""), b.get("Confidence", 0),
                              self._bbox(b.get("Geometry")), word_confs))

        queries: dict[str, QueryAnswer] = {}
        for b in blocks:
            if b["BlockType"] != "QUERY":
                continue
            alias = b.get("Query", {}).get("Alias", "")
            for rel in b.get("Relationships", []):
                if rel["Type"] != "ANSWER":
                    continue
                for aid in rel["Ids"]:
                    ans = by_id.get(aid)
                    if ans and (alias not in queries or ans.get("Confidence", 0) > queries[alias].confidence):
                        queries[alias] = QueryAnswer(alias, ans.get("Text", ""), ans.get("Confidence", 0),
                                                     self._bbox(ans.get("Geometry")))
        return OCRResult("textract", lines, queries)


# ---------------------------------------------------------------------------
# Tesseract (offline development / fallback)
# ---------------------------------------------------------------------------
class TesseractOCR:
    name = "tesseract"

    def run(self, image_bytes: bytes) -> OCRResult:
        import pytesseract
        from pytesseract import Output
        import os, sys

        # Windows: winget installs Tesseract to Program Files but doesn't add it to PATH.
        # Auto-detect common install locations so the user doesn't need to configure PATH.
        if sys.platform == "win32" and not pytesseract.pytesseract.tesseract_cmd.endswith(".exe"):
            for candidate in [
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Tesseract-OCR", "tesseract.exe"),
            ]:
                if os.path.isfile(candidate):
                    pytesseract.pytesseract.tesseract_cmd = candidate
                    break

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        W, H = img.size
        # Upscale small images: Tesseract is much better at ~300dpi-equivalent sizes.
        scale = 1.0
        if max(W, H) < 1400:
            scale = 1400 / max(W, H)
            img = img.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
        d = pytesseract.image_to_data(img, output_type=Output.DICT, config="--psm 11")
        # --psm 11 (sparse text) handles ID-card layouts better; regroup into lines by row.
        words = []
        for i, txt in enumerate(d["text"]):
            if txt.strip() and float(d["conf"][i]) >= 0:
                words.append((d["left"][i] / scale, d["top"][i] / scale, d["width"][i] / scale,
                              d["height"][i] / scale, txt.strip(), float(d["conf"][i])))
        words.sort(key=lambda w: (w[1] + w[3] / 2, w[0]))
        rows: list[list[tuple]] = []
        for w in words:
            cy = w[1] + w[3] / 2
            if rows:
                last = rows[-1]
                lcy = sum(x[1] + x[3] / 2 for x in last) / len(last)
                lh = sum(x[3] for x in last) / len(last)
                if abs(cy - lcy) < max(lh, w[3]) * 0.55:
                    last.append(w)
                    continue
            rows.append([w])

        lines: list[Line] = []
        for row in rows:
            row.sort(key=lambda w: w[0])
            # split a row into separate lines when there is a big horizontal gap (two columns)
            segments: list[list[tuple]] = [[row[0]]]
            for w in row[1:]:
                prev = segments[-1][-1]
                gap = w[0] - (prev[0] + prev[2])
                if gap > max(prev[3], w[3]) * 3.5:
                    segments.append([w])
                else:
                    segments[-1].append(w)
            for seg in segments:
                l = min(w[0] for w in seg); t = min(w[1] for w in seg)
                r = max(w[0] + w[2] for w in seg); b = max(w[1] + w[3] for w in seg)
                confs = [w[5] for w in seg]
                lines.append(Line(" ".join(w[4] for w in seg), sum(confs) / len(confs),
                                  BBox(l / W, t / H, (r - l) / W, (b - t) / H), confs))
        return OCRResult("tesseract", lines, {})


def get_ocr():
    if settings.ocr_provider == "textract":
        try:
            return TextractOCR()
        except Exception as e:  # pragma: no cover
            log.warning("Textract unavailable (%s); falling back to Tesseract", e)
    return TesseractOCR()
