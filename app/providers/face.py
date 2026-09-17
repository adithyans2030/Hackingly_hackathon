"""Face detection, comparison and 1:N search.

rekognition : AWS Rekognition DetectFaces / CompareFaces / collections (production)
local       : OpenCV YuNet detector + SFace embeddings (ONNX, runs offline on CPU).
              Download models with `python scripts/download_models.py`.
Haar cascade is always available as a last-resort detector (presence check only).
"""
from __future__ import annotations

import io
import logging
import sqlite3
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.config import settings

log = logging.getLogger(__name__)

YUNET = "face_detection_yunet_2023mar.onnx"
SFACE = "face_recognition_sface_2021dec.onnx"


def to_bgr(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


@dataclass
class FaceBox:
    x: int
    y: int
    w: int
    h: int
    score: float
    raw: np.ndarray | None = None  # YuNet row (needed for alignment)


def haar_faces(bgr: np.ndarray) -> list[FaceBox]:
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
    return [FaceBox(int(x), int(y), int(w), int(h), 0.8) for x, y, w, h in faces]


class LocalFace:
    name = "local"

    def __init__(self) -> None:
        det = settings.models_dir / YUNET
        rec = settings.models_dir / SFACE
        if not det.exists() or not rec.exists():
            raise FileNotFoundError("ONNX face models missing; run scripts/download_models.py")
        self.detector = cv2.FaceDetectorYN.create(str(det), "", (320, 320), 0.7, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(rec), "")

    def detect(self, bgr: np.ndarray) -> list[FaceBox]:
        h, w = bgr.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(bgr)
        if faces is None:
            return []
        out = [FaceBox(int(f[0]), int(f[1]), int(f[2]), int(f[3]), float(f[14]), f) for f in faces]
        return sorted(out, key=lambda f: f.w * f.h, reverse=True)

    def embed(self, bgr: np.ndarray) -> np.ndarray | None:
        faces = self.detect(bgr)
        if not faces:
            return None
        aligned = self.recognizer.alignCrop(bgr, faces[0].raw)
        return self.recognizer.feature(aligned).flatten()

    def compare(self, a: bytes, b: bytes) -> float | None:
        ea, eb = self.embed(to_bgr(a)), self.embed(to_bgr(b))
        if ea is None or eb is None:
            return None
        cos = float(np.dot(ea, eb) / (np.linalg.norm(ea) * np.linalg.norm(eb)))
        # SFace cosine: 0.363 is OpenCV's recommended match threshold.
        # Map to a 0..100 "similarity" so thresholds are comparable with Rekognition.
        return float(np.clip((cos - 0.10) / (0.60 - 0.10), 0, 1) * 100)

    # --- 1:N search over stored embeddings (sqlite blob table) -----------------
    def index_and_search(self, image_bytes: bytes, verification_id: str, db: sqlite3.Connection,
                         threshold: float = 80.0) -> list[dict]:
        emb = self.embed(to_bgr(image_bytes))
        if emb is None:
            return []
        matches = []
        for row in db.execute("SELECT verification_id, embedding FROM face_embeddings"):
            other = np.frombuffer(row[1], dtype=np.float32)
            cos = float(np.dot(emb, other) / (np.linalg.norm(emb) * np.linalg.norm(other)))
            sim = float(np.clip((cos - 0.10) / 0.50, 0, 1) * 100)
            if sim >= threshold and row[0] != verification_id:
                matches.append({"verification_id": row[0], "similarity": round(sim, 1)})
        db.execute("INSERT OR REPLACE INTO face_embeddings VALUES (?, ?)",
                   (verification_id, emb.astype(np.float32).tobytes()))
        db.commit()
        return matches


class RekognitionFace:
    name = "rekognition"

    def __init__(self) -> None:
        import boto3

        self.client = boto3.client("rekognition", region_name=settings.aws_region)
        try:
            self.client.create_collection(CollectionId=settings.rekognition_collection)
        except self.client.exceptions.ResourceAlreadyExistsException:
            pass

    def detect(self, bgr: np.ndarray) -> list[FaceBox]:
        ok, buf = cv2.imencode(".jpg", bgr)
        resp = self.client.detect_faces(Image={"Bytes": buf.tobytes()})
        h, w = bgr.shape[:2]
        out = []
        for f in resp.get("FaceDetails", []):
            b = f["BoundingBox"]
            out.append(FaceBox(int(b["Left"] * w), int(b["Top"] * h), int(b["Width"] * w),
                               int(b["Height"] * h), f.get("Confidence", 0) / 100))
        return sorted(out, key=lambda f: f.w * f.h, reverse=True)

    def compare(self, a: bytes, b: bytes) -> float | None:
        try:
            resp = self.client.compare_faces(SourceImage={"Bytes": a}, TargetImage={"Bytes": b},
                                             SimilarityThreshold=0)
        except Exception as e:
            log.warning("CompareFaces failed: %s", e)
            return None
        m = resp.get("FaceMatches", [])
        if m:
            return float(max(x["Similarity"] for x in m))
        return 0.0 if resp.get("UnmatchedFaces") else None

    def index_and_search(self, image_bytes: bytes, verification_id: str, db=None,
                         threshold: float = 90.0) -> list[dict]:
        matches = []
        try:
            resp = self.client.search_faces_by_image(
                CollectionId=settings.rekognition_collection, Image={"Bytes": image_bytes},
                FaceMatchThreshold=threshold, MaxFaces=5)
            for m in resp.get("FaceMatches", []):
                ext = m["Face"].get("ExternalImageId")
                if ext and ext != verification_id:
                    matches.append({"verification_id": ext, "similarity": round(m["Similarity"], 1)})
        except self.client.exceptions.InvalidParameterException:
            return []  # no face in image
        self.client.index_faces(CollectionId=settings.rekognition_collection,
                                Image={"Bytes": image_bytes}, ExternalImageId=verification_id,
                                MaxFaces=1, QualityFilter="AUTO")
        return matches


_face = None
_face_loaded = False


def get_face():
    """Returns a face provider or None (face checks are then marked 'skipped')."""
    global _face, _face_loaded
    if _face_loaded:
        return _face
    _face_loaded = True
    try:
        if settings.face_provider == "rekognition":
            _face = RekognitionFace()
        elif settings.face_provider == "local":
            _face = LocalFace()
    except Exception as e:
        log.warning("Face provider '%s' unavailable: %s", settings.face_provider, e)
        _face = None
    return _face


def crop_largest_face(image_bytes: bytes, pad: float = 0.35) -> tuple[bytes | None, dict | None]:
    """Crop the portrait from an ID card. Returns (jpeg bytes, normalised bbox)."""
    bgr = to_bgr(image_bytes)
    prov = get_face()
    faces = []
    try:
        faces = prov.detect(bgr) if prov else []
    except Exception:
        faces = []
    if not faces:
        faces = haar_faces(bgr)
    if not faces:
        return None, None
    f = max(faces, key=lambda f: f.w * f.h)
    H, W = bgr.shape[:2]
    px, py = int(f.w * pad), int(f.h * pad)
    x0, y0 = max(0, f.x - px), max(0, f.y - py)
    x1, y1 = min(W, f.x + f.w + px), min(H, f.y + f.h + py)
    crop = bgr[y0:y1, x0:x1]
    if crop.size == 0:
        return None, None
    # upscale tiny ID portraits: recognisers need ~112px+ faces
    if crop.shape[0] < 200:
        s = 200 / crop.shape[0]
        crop = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
    bbox = {"left": x0 / W, "top": y0 / H, "width": (x1 - x0) / W, "height": (y1 - y0) / H}
    return buf.tobytes(), bbox
