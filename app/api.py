"""TrustGate HTTP API.

Hackingly integration = one call from the registration flow:

    POST /v1/verify   (multipart: event_id, name, email, ..., id_image, [selfie])

Synchronous by default (~2s). Pass async_mode=true to get 202 + a webhook when done.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import threading
import uuid
from collections import Counter
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import db
from app.config import ROOT, settings
from app.pipeline import quality
from app.pipeline.orchestrator import PIPELINE_VERSION, Applicant, verify
from app.pipeline.rules import ALL_DOCS, EventConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("trustgate")

API_KEY = os.getenv("API_KEY", "").split("#")[0].strip()
ORGANIZER_KEY = os.getenv("ORGANIZER_KEY", "").split("#")[0].strip()
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", settings.hmac_secret)
MAX_UPLOAD = 10 * 1024 * 1024
STATIC = Path(__file__).parent / "static"
DECISIONS = ("APPROVED", "NEEDS_REVIEW", "REJECTED", "RESUBMIT")

app = FastAPI(title="TrustGate", version=PIPELINE_VERSION,
              description="Identity & eligibility verification for Hackingly registrations.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=STATIC), name="static")

# Pipeline stages hold OpenCV/ONNX objects; serialise runs to keep memory predictable on small boxes.
_pipeline_lock = threading.Semaphore(int(os.getenv("PIPELINE_CONCURRENCY", "2")))


def require_key(x_api_key: str = Header(default="")) -> None:
    if API_KEY and not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(401, "Invalid or missing X-API-Key")


def require_organizer(x_organizer_key: str = Header(default="")) -> None:
    """Guard the organizer surface: the review queue, case detail, artifacts and audit log.

    These expose every applicant's name, email, masked ID and ID photograph, so they are
    the most sensitive endpoints in the service. Set ORGANIZER_KEY to require a header;
    left unset the dashboard stays open, which is fine for a laptop demo and is not
    acceptable once real participant data is loaded.
    """
    if ORGANIZER_KEY and not hmac.compare_digest(x_organizer_key, ORGANIZER_KEY):
        raise HTTPException(401, "Invalid or missing X-Organizer-Key")


DEFAULT_EVENTS = [
    {"event_id": "aibc-blr", "name": "AI Build Challenge Bengaluru", "event_date": "2026-09-18", "min_age": 18},
    {"event_id": "campus-hack", "name": "Campus Hack (students only)", "event_date": "2026-10-10",
     "min_age": 16, "student_only": True, "accepted_docs": ["COLLEGE_ID"]},
]


@app.on_event("startup")
def _startup() -> None:
    if not db.list_events():
        for e in DEFAULT_EVENTS:
            db.upsert_event(e["event_id"], e["name"], EventConfig.from_dict(e).to_dict())
    log.info("TrustGate %s ready (ocr=%s face=%s llm=%s)", PIPELINE_VERSION, settings.ocr_provider,
             settings.face_provider, settings.llm_provider)


# ---------------------------------------------------------------------------
# pages
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def dashboard_page():
    return FileResponse(STATIC / "index.html")


@app.get("/register", include_in_schema=False)
def register_page():
    return FileResponse(STATIC / "index.html")


@app.get("/v1/health")
def health():
    return {"ok": True, "version": PIPELINE_VERSION, "ocr": settings.ocr_provider,
            "face": settings.face_provider, "llm": settings.llm_provider}


# ---------------------------------------------------------------------------
# events
# ---------------------------------------------------------------------------
class EventIn(BaseModel):
    event_id: str = Field(pattern=r"^[a-z0-9][a-z0-9\-]{1,62}$")
    name: str
    event_date: str
    min_age: int | None = None
    max_age: int | None = None
    student_only: bool = False
    accepted_docs: list[str] = Field(default_factory=lambda: list(ALL_DOCS))
    require_selfie: bool = False
    allowed_institutions: list[str] = Field(default_factory=list)
    check_institution_matches_form: bool = True
    webhook_url: str = ""


@app.get("/v1/events")
def list_events():
    return db.list_events()


@app.post("/v1/events", dependencies=[Depends(require_key)])
def upsert_event(ev: EventIn):
    bad = set(ev.accepted_docs) - set(ALL_DOCS)
    if bad:
        raise HTTPException(422, f"Unknown document types: {sorted(bad)}")
    cfg = EventConfig.from_dict(ev.model_dump())
    db.upsert_event(ev.event_id, ev.name, cfg.to_dict())
    db.audit(None, "event_upsert", "api", {"event_id": ev.event_id})
    return db.get_event(ev.event_id)


@app.get("/v1/events/{event_id}")
def get_event(event_id: str):
    ev = db.get_event(event_id)
    if not ev:
        raise HTTPException(404, "Event not found")
    return ev


# ---------------------------------------------------------------------------
# verification
# ---------------------------------------------------------------------------
async def _read_image(f: UploadFile | None, label: str) -> bytes | None:
    if f is None or not f.filename:
        return None
    data = await f.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"{label} is larger than 10 MB")
    if not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[8:12] == b"WEBP"
            or data[4:12] in (b"ftypheic", b"ftypmif1")):
        raise HTTPException(415, f"{label} must be a JPEG, PNG or WebP image")
    return data


def _send_webhook(url: str, payload: dict) -> None:
    try:
        import requests

        body = db.dumps(payload).encode()
        sig = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        requests.post(url, data=body, timeout=10, headers={
            "content-type": "application/json", "x-trustgate-signature": f"sha256={sig}"})
    except Exception as e:  # webhook failures never break verification
        log.warning("Webhook to %s failed: %s", url, e)


def _run(vid: str, cfg: EventConfig, applicant: Applicant, img: bytes, selfie: bytes | None) -> dict:
    try:
        with _pipeline_lock:
            result = verify(vid, cfg, applicant, img, selfie)
        db.finish_verification(vid, result)
        db.audit(vid, "decision", "system", {"decision": result["decision"], "confidence": result["confidence"]})
    except Exception as e:
        log.exception("Verification %s failed", vid)
        db.fail_verification(vid, str(e))
        result = {"verification_id": vid, "decision": "NEEDS_REVIEW", "confidence": 0.0,
                  "reasons": ["Automatic verification failed; a person needs to check this registration."],
                  "summary": "Automatic verification failed.", "participant_message":
                  "Thanks! Your ID is being reviewed by the organizers.", "error": str(e)}
    if cfg.webhook_url:
        _send_webhook(cfg.webhook_url, _public(result))
    return result


def _sanitize_for_json(obj):
    import numpy as np
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return _sanitize_for_json(obj.tolist())
    return obj


def _public(result: dict) -> dict:
    """Slim payload for Hackingly's registration flow."""
    keys = ("verification_id", "event_id", "decision", "confidence", "summary", "reasons",
            "participant_message", "extracted", "applicant")
    return {k: result.get(k) for k in keys}


@app.post("/v1/verify", dependencies=[Depends(require_key)])
async def verify_endpoint(
    background: BackgroundTasks,
    event_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(""),
    phone: str = Form(""),
    institution: str = Form(""),
    dob: str = Form(""),
    external_ref: str = Form(""),
    consent: bool = Form(True),
    async_mode: bool = Form(False),
    detail: bool = Form(True),
    id_image: UploadFile = File(...),
    selfie: UploadFile | None = File(None),
):
    if not consent:
        raise HTTPException(400, "Participant consent is required to process identity documents")
    ev = db.get_event(event_id)
    if not ev:
        raise HTTPException(404, f"Unknown event '{event_id}'")
    img = await _read_image(id_image, "ID image")
    sf = await _read_image(selfie, "Selfie")
    cfg = EventConfig.from_dict({**ev["config"], "event_id": event_id})
    applicant = Applicant(name=name.strip(), email=email.strip().lower(), phone=phone.strip(),
                          institution=institution.strip(), dob=dob.strip(), external_ref=external_ref)
    vid = "v_" + uuid.uuid4().hex[:16]
    db.create_verification(vid, event_id, applicant.to_dict())
    if async_mode:
        background.add_task(_run, vid, cfg, applicant, img, sf)
        return JSONResponse({"verification_id": vid, "status": "processing"}, status_code=202)
    result = _run(vid, cfg, applicant, img, sf)
    res = result if detail else _public(result)
    return JSONResponse(content=_sanitize_for_json(res))


@app.post("/v1/quality-check")
async def quality_check(image: UploadFile = File(...)):
    data = await _read_image(image, "Image")
    return quality.quick_check(data)


@app.get("/v1/verifications", dependencies=[Depends(require_organizer)])
def list_verifications(event_id: str | None = None, decision: str | None = Query(None),
                       q: str | None = None, limit: int = 200):
    if decision and decision not in DECISIONS:
        raise HTTPException(422, f"decision must be one of {DECISIONS}")
    return db.list_verifications(event_id, decision, q, min(limit, 500))


@app.get("/v1/verifications/{vid}/status", dependencies=[Depends(require_key)])
def verification_status(vid: str):
    """Poll an async verification.

    async_mode=true returns 202 and then delivers the result by webhook. A caller that
    cannot receive webhooks (a local integration, a retry after a missed delivery) had
    no way to find out what happened; this closes that hole.

    Guarded by the same key as /v1/verify, since it is part of the registration flow
    rather than the organizer surface, and it returns the slim public payload only.
    """
    v = db.get_verification(vid)
    if not v:
        raise HTTPException(404, "Verification not found")
    out = {"verification_id": vid, "status": v["status"]}
    if v["status"] == "processing":
        return out
    result = v.get("result") or {}
    return {**out, **_sanitize_for_json(_public({**result, "verification_id": vid,
                                                 "event_id": v["event_id"]}))}


@app.get("/v1/verifications/{vid}", dependencies=[Depends(require_organizer)])
def get_verification(vid: str):
    v = db.get_verification(vid)
    if not v:
        raise HTTPException(404, "Verification not found")
    return v


class ReviewIn(BaseModel):
    decision: str
    note: str = ""
    reviewer: str = "organizer"


@app.post("/v1/verifications/{vid}/review", dependencies=[Depends(require_organizer)])
def review(vid: str, body: ReviewIn):
    if body.decision not in DECISIONS:
        raise HTTPException(422, f"decision must be one of {DECISIONS}")
    v = db.get_verification(vid)
    if not v:
        raise HTTPException(404, "Verification not found")
    db.review(vid, body.decision, body.reviewer, body.note)
    ev = db.get_event(v["event_id"])
    if ev and ev["config"].get("webhook_url"):
        _send_webhook(ev["config"]["webhook_url"], {"verification_id": vid, "decision": body.decision,
                                                    "reviewed_by": body.reviewer, "note": body.note})
    return db.get_verification(vid)


@app.delete("/v1/verifications/{vid}", dependencies=[Depends(require_key)])
def erase(vid: str):
    """Right to erasure (DPDP Act 2023): removes record, fingerprints, embeddings and images."""
    import shutil

    db.delete_verification(vid)
    shutil.rmtree(settings.data_dir / "artifacts" / vid, ignore_errors=True)
    return {"deleted": vid}


@app.get("/v1/verifications/{vid}/artifacts/{name}", include_in_schema=False,
         dependencies=[Depends(require_organizer)])
def artifact(vid: str, name: str):
    # `name`/`vid` must be a bare filename with no directory component. Checking only for
    # "/" and ".." is not enough on Windows: an absolute path like "C:\\Windows\\win.ini" or
    # "\\Windows\\win.ini" contains neither, but `Path(base) / name` silently discards `base`
    # and resolves to that absolute path (pathlib join semantics), letting a request read any
    # file on disk. Comparing against Path(name).name rejects any path/drive component.
    if not vid.startswith("v_") or vid != Path(vid).name or name != Path(name).name or not name:
        raise HTTPException(400, "Bad path")
    p = settings.data_dir / "artifacts" / vid / name
    if not p.exists() or name == "id_raw.jpg":
        raise HTTPException(404, "Not found")
    return FileResponse(p, headers={"cache-control": "private, max-age=300"})


# ---------------------------------------------------------------------------
# metrics
# ---------------------------------------------------------------------------
@app.get("/v1/metrics", dependencies=[Depends(require_organizer)])
def metrics(event_id: str | None = None):
    rows = db.list_verifications(event_id, None, None, 5000)
    done = [r for r in rows if r["status"] != "processing"]
    auto = Counter(r["decision"] for r in done)
    final = Counter(r["final_decision"] for r in done)
    reviewed = [r for r in done if r["reviewed_at"]]
    overturned = [r for r in reviewed if r["reviewed_at"] and r["final_decision"] != r["decision"]]
    review_outcomes = Counter(r["final_decision"] for r in reviewed if r["decision"] == "NEEDS_REVIEW")
    flags = Counter(f for r in done for f in r["flags"])
    latencies = [r["latency_ms"] for r in done if r.get("latency_ms")]
    latencies.sort()
    n = len(done) or 1
    report_path = settings.data_dir / "eval_report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else None
    return {
        "total": len(done),
        "auto_decisions": {d: auto.get(d, 0) for d in DECISIONS},
        "final_decisions": {d: final.get(d, 0) for d in DECISIONS},
        "automation_rate": round((auto.get("APPROVED", 0) + auto.get("REJECTED", 0) + auto.get("RESUBMIT", 0)) / n, 3),
        "reviewed": len(reviewed),
        "overturned": len(overturned),
        "overturned_auto_rejections": sum(r["decision"] == "REJECTED" for r in overturned),
        "review_outcomes": dict(review_outcomes),
        "top_flags": flags.most_common(8),
        "latency_ms": {"p50": latencies[len(latencies) // 2] if latencies else None,
                       "p95": latencies[int(len(latencies) * 0.95) - 1] if latencies else None},
        "evaluation": report.get("summary") if report else None,
        "evaluation_cases": report.get("rows") if report else None,
    }


@app.get("/v1/audit", dependencies=[Depends(require_organizer)])
def audit_log(limit: int = 100):
    rows = db.conn().execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(limit, 1000),)).fetchall()
    return [{k: r[k] for k in r.keys()} for r in rows]
