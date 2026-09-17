"""Central configuration.

Every external dependency is optional and toggled by env vars, so the system runs fully
offline (Tesseract + OpenCV) and upgrades to AWS (Textract / Rekognition / Bedrock) when
credentials exist.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:  # optional .env support
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(ROOT / ".env")
except Exception:  # pragma: no cover
    pass


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def _bool(key: str, default: bool = False) -> bool:
    return _env(key, str(default)).lower() in {"1", "true", "yes", "on"}


def _f(key: str, default: float) -> float:
    return float(_env(key, str(default)))


@dataclass
class Settings:
    # OCR: "textract" (production; wraps the existing DOB pipeline) | "tesseract" (offline dev)
    ocr_provider: str = field(default_factory=lambda: _env("OCR_PROVIDER", "tesseract"))
    aws_region: str = field(default_factory=lambda: _env("AWS_REGION", "ap-south-1"))
    s3_bucket: str = field(default_factory=lambda: _env("S3_BUCKET", ""))

    # Face: "rekognition" | "local" (OpenCV YuNet + SFace ONNX) | "off"
    face_provider: str = field(default_factory=lambda: _env("FACE_PROVIDER", "local"))
    rekognition_collection: str = field(
        default_factory=lambda: _env("REKOGNITION_COLLECTION", "trustgate-faces")
    )

    # LLM: "anthropic" | "bedrock" | "off".
    # Used ONLY to structure OCR text and narrate forensics. It never makes the decision.
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "off"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-sonnet-4-6"))
    bedrock_model_id: str = field(
        default_factory=lambda: _env("BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-6")
    )

    # Privacy
    hmac_secret: str = field(default_factory=lambda: _env("ID_HMAC_SECRET", "change-me-in-production"))
    keep_raw_images: bool = field(default_factory=lambda: _bool("KEEP_RAW_IMAGES", False))
    uidai_cert_path: str = field(default_factory=lambda: _env("UIDAI_CERT_PATH", ""))

    # Storage
    data_dir: Path = field(default_factory=lambda: Path(_env("DATA_DIR", str(ROOT / "data"))))
    db_path: Path = field(default_factory=lambda: Path(_env("DB_PATH", str(ROOT / "data" / "trustgate.db"))))
    models_dir: Path = field(default_factory=lambda: Path(_env("MODELS_DIR", str(ROOT / "models"))))

    # Decision thresholds (tune with scripts/evaluate.py)
    approve_threshold: float = field(default_factory=lambda: _f("APPROVE_THRESHOLD", 0.78))
    reject_dob_confidence: float = field(default_factory=lambda: _f("REJECT_DOB_CONFIDENCE", 0.85))

    # Quality gate
    blur_threshold: float = field(default_factory=lambda: _f("BLUR_THRESHOLD", 60))
    glare_threshold: float = field(default_factory=lambda: _f("GLARE_THRESHOLD", 0.10))
    min_side_px: int = field(default_factory=lambda: int(_f("MIN_SIDE_PX", 400)))

    # Forensics (calibrate on real samples: genuine phone photos score ~3-4)
    recapture_peak: float = field(default_factory=lambda: _f("RECAPTURE_PEAK", 5.5))

    # Matching
    phash_distance: int = field(default_factory=lambda: int(_f("PHASH_DISTANCE", 8)))
    name_match_ok: float = field(default_factory=lambda: _f("NAME_MATCH_OK", 88))
    name_match_review: float = field(default_factory=lambda: _f("NAME_MATCH_REVIEW", 72))
    face_match_ok: float = field(default_factory=lambda: _f("FACE_MATCH_OK", 90))
    face_match_review: float = field(default_factory=lambda: _f("FACE_MATCH_REVIEW", 70))

    def __post_init__(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "artifacts").mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
