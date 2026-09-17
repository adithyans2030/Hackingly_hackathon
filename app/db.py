"""SQLite persistence (swap for Postgres by changing `connect`; the SQL is portable)."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone

from app.config import settings

_local = threading.local()


def _default(o):
    """JSON fallback for numpy scalars/arrays and dates."""
    if hasattr(o, "item"):
        return o.item()
    if hasattr(o, "tolist"):
        return o.tolist()
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def dumps(obj) -> str:
    return json.dumps(obj, default=_default)

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,              -- processing | done | error
    decision TEXT,                     -- APPROVED | NEEDS_REVIEW | REJECTED | RESUBMIT
    confidence REAL,
    applicant TEXT NOT NULL,           -- JSON: name, email, phone, institution, external_ref
    result TEXT,                       -- JSON: full result payload
    final_decision TEXT,               -- after human review (or = decision)
    reviewed_by TEXT,
    review_note TEXT,
    reviewed_at TEXT,
    ground_truth TEXT                  -- optional label for evaluation
);
CREATE INDEX IF NOT EXISTS idx_ver_event ON verifications(event_id, created_at);
CREATE TABLE IF NOT EXISTS fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verification_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    kind TEXT NOT NULL,                -- id_hmac | phash
    value TEXT NOT NULL,
    name_norm TEXT,
    email TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fp_kind_value ON fingerprints(kind, value);
CREATE TABLE IF NOT EXISTS face_embeddings (
    verification_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verification_id TEXT,
    action TEXT NOT NULL,
    actor TEXT,
    detail TEXT,
    at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        c = sqlite3.connect(settings.db_path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)
        _local.conn = c
    return c


def audit(verification_id: str | None, action: str, actor: str = "system", detail: dict | None = None) -> None:
    conn().execute("INSERT INTO audit_log (verification_id, action, actor, detail, at) VALUES (?,?,?,?,?)",
                   (verification_id, action, actor, json.dumps(detail or {}), now()))
    conn().commit()


# ---- events -----------------------------------------------------------------
def upsert_event(event_id: str, name: str, config: dict) -> None:
    conn().execute("INSERT INTO events (id, name, config, created_at) VALUES (?,?,?,?) "
                   "ON CONFLICT(id) DO UPDATE SET name=excluded.name, config=excluded.config",
                   (event_id, name, dumps(config), now()))
    conn().commit()


def get_event(event_id: str) -> dict | None:
    r = conn().execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return {"id": r["id"], "name": r["name"], "config": json.loads(r["config"])} if r else None


def list_events() -> list[dict]:
    rows = conn().execute("SELECT * FROM events ORDER BY created_at DESC").fetchall()
    return [{"id": r["id"], "name": r["name"], "config": json.loads(r["config"])} for r in rows]


# ---- verifications ------------------------------------------------------------
def create_verification(vid: str, event_id: str, applicant: dict, ground_truth: str | None = None) -> None:
    conn().execute("INSERT INTO verifications (id, event_id, created_at, status, applicant, ground_truth) "
                   "VALUES (?,?,?,?,?,?)", (vid, event_id, now(), "processing", json.dumps(applicant), ground_truth))
    conn().commit()


def finish_verification(vid: str, result: dict) -> None:
    conn().execute("UPDATE verifications SET status='done', decision=?, confidence=?, result=?, final_decision=? "
                   "WHERE id=?", (result["decision"], result["confidence"], dumps(result),
                                  result["decision"], vid))
    conn().commit()


def fail_verification(vid: str, error: str) -> None:
    conn().execute("UPDATE verifications SET status='error', decision='NEEDS_REVIEW', final_decision='NEEDS_REVIEW', "
                   "result=? WHERE id=?", (json.dumps({"error": error, "decision": "NEEDS_REVIEW"}), vid))
    conn().commit()


def _row(r: sqlite3.Row, full: bool = True) -> dict:
    d = {k: r[k] for k in r.keys()}
    d["applicant"] = json.loads(d["applicant"])
    d["result"] = json.loads(d["result"]) if d.get("result") and full else None
    return d


def get_verification(vid: str) -> dict | None:
    r = conn().execute("SELECT * FROM verifications WHERE id=?", (vid,)).fetchone()
    return _row(r) if r else None


def list_verifications(event_id: str | None = None, decision: str | None = None, q: str | None = None,
                       limit: int = 200) -> list[dict]:
    sql = "SELECT * FROM verifications WHERE 1=1"
    args: list = []
    if event_id:
        sql += " AND event_id=?"; args.append(event_id)
    if decision:
        sql += " AND final_decision=?"; args.append(decision)
    if q:
        sql += " AND applicant LIKE ?"; args.append(f"%{q}%")
    sql += " ORDER BY created_at DESC LIMIT ?"; args.append(limit)
    out = []
    for r in conn().execute(sql, args).fetchall():
        d = _row(r)
        res = d.pop("result") or {}
        d["summary"] = res.get("summary")
        d["doc_type"] = (res.get("extracted") or {}).get("doc_type")
        d["flags"] = [s["name"] for s in res.get("signals", []) if s["severity"] in ("critical", "warn")]
        d["latency_ms"] = (res.get("timings_ms") or {}).get("total")
        d["confidence"] = res.get("confidence", d.get("confidence"))
        out.append(d)
    return out


def review(vid: str, decision: str, actor: str, note: str) -> None:
    conn().execute("UPDATE verifications SET final_decision=?, reviewed_by=?, review_note=?, reviewed_at=? WHERE id=?",
                   (decision, actor, note, now(), vid))
    conn().commit()
    audit(vid, "review", actor, {"decision": decision, "note": note})


# ---- fingerprints ----------------------------------------------------------------
def add_fingerprint(vid: str, event_id: str, kind: str, value: str, name_norm: str, email: str) -> None:
    conn().execute("INSERT INTO fingerprints (verification_id, event_id, kind, value, name_norm, email, created_at) "
                   "VALUES (?,?,?,?,?,?,?)", (vid, event_id, kind, value, name_norm, email, now()))
    conn().commit()


def fingerprints(kind: str) -> list[sqlite3.Row]:
    return conn().execute("SELECT * FROM fingerprints WHERE kind=?", (kind,)).fetchall()


def delete_verification(vid: str) -> None:
    c = conn()
    for t, col in (("fingerprints", "verification_id"), ("face_embeddings", "verification_id"),
                   ("verifications", "id")):
        c.execute(f"DELETE FROM {t} WHERE {col}=?", (vid,))
    c.commit()
    audit(vid, "erase", "system", {})
