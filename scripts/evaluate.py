"""Run the full pipeline over a labelled set and report the numbers judges care about.

    python scripts/evaluate.py                       # samples/manifest.json, fresh temp DB
    python scripts/evaluate.py --manifest path.json --json report.json

Labels in the manifest `expect` field:
    APPROVED      genuine & eligible (must not be blocked)
    NOT_APPROVED  fraud / suspicious (anything but APPROVED is a catch)
    REJECTED      verified ineligible
    RESUBMIT      participant-fixable problem
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=str(ROOT / "samples" / "manifest.json"))
    ap.add_argument("--json", help="write full report here")
    ap.add_argument("--keep-db", action="store_true", help="use the app DB (populates the dashboard)")
    args = ap.parse_args()

    app_data_dir = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
    if not args.keep_db:
        tmp = tempfile.mkdtemp(prefix="trustgate-eval-")
        os.environ["DB_PATH"] = str(Path(tmp) / "eval.db")
        os.environ["DATA_DIR"] = tmp

    from app import db
    from app.pipeline.orchestrator import Applicant, verify
    from app.pipeline.rules import EventConfig

    manifest_path = Path(args.manifest)
    m = json.loads(manifest_path.read_text())
    base = manifest_path.parent
    for ev in m["events"].values():
        db.upsert_event(ev["event_id"], ev.get("name", ev["event_id"]), ev)

    rows, t0 = [], time.time()
    for case in m["cases"]:
        ev = EventConfig.from_dict(m["events"][case["event_id"]])
        form = case["form"]
        app_ = Applicant(name=form["name"], email=form.get("email", ""), institution=form.get("institution", ""),
                         dob=form.get("dob", ""))
        vid = "v_" + uuid.uuid4().hex[:12]
        db.create_verification(vid, ev.event_id, app_.to_dict(), ground_truth=case["expect"])
        img = (base / case["file"]).read_bytes()
        selfie = (base / case["selfie"]).read_bytes() if case.get("selfie") else None
        res = verify(vid, ev, app_, img, selfie)
        db.finish_verification(vid, res)
        exp, got = case["expect"], res["decision"]
        ok = (got != "APPROVED") if exp == "NOT_APPROVED" else (got == exp)
        rows.append({**case, "decision": got, "confidence": res["confidence"], "ok": ok,
                     "flags": [s["name"] for s in res["signals"] if s["severity"] in ("critical", "warn")],
                     "reason": res["reasons"][0] if res["reasons"] else "", "ms": res["timings_ms"]["total"]})
        mark = "PASS" if ok else "FAIL"
        print(f"{mark} {case['file']:<42} expect={exp:<13} got={got:<13} conf={res['confidence']:.2f}  "
              f"{', '.join(rows[-1]['flags'])[:70]}")

    genuine = [r for r in rows if r["expect"] == "APPROVED"]
    fraud = [r for r in rows if r["expect"] == "NOT_APPROVED"]
    inelig = [r for r in rows if r["expect"] == "REJECTED"]
    fixable = [r for r in rows if r["expect"] == "RESUBMIT"]

    def pct(a, b):
        return f"{100 * a / b:.0f}%" if b else "n/a"

    false_reject = sum(r["decision"] == "REJECTED" for r in genuine)
    blocked = sum(r["decision"] != "APPROVED" for r in genuine)
    caught = sum(r["decision"] != "APPROVED" for r in fraud)
    wrongly_rejected_fraud = sum(r["decision"] == "REJECTED" for r in fraud)
    summary = {
        "cases": len(rows),
        "accuracy": pct(sum(r["ok"] for r in rows), len(rows)),
        "genuine_auto_approved": pct(len(genuine) - blocked, len(genuine)),
        "genuine_hard_rejected (false reject)": pct(false_reject, len(genuine)),
        "fraud_caught (not auto-approved)": pct(caught, len(fraud)),
        "fraud_auto_rejected_without_human": pct(wrongly_rejected_fraud, len(fraud)),
        "ineligible_rejected": pct(sum(r["decision"] == "REJECTED" for r in inelig), len(inelig)),
        "fixable_sent_back": pct(sum(r["decision"] == "RESUBMIT" for r in fixable), len(fixable)),
        "avg_latency_ms": int(sum(r["ms"] for r in rows) / max(1, len(rows))),
        "wall_time_s": round(time.time() - t0, 1),
    }
    labels = ["APPROVED", "NEEDS_REVIEW", "REJECTED", "RESUBMIT"]
    print("\nConfusion (rows = expected, cols = decision)")
    print(f"{'':<14}" + "".join(f"{l:>14}" for l in labels))
    for exp in ["APPROVED", "NOT_APPROVED", "REJECTED", "RESUBMIT"]:
        sub = [r for r in rows if r["expect"] == exp]
        if sub:
            print(f"{exp:<14}" + "".join(f"{sum(r['decision'] == l for r in sub):>14}" for l in labels))
    print()
    for k, v in summary.items():
        print(f"  {k:<40} {v}")
    report = json.dumps({"summary": summary, "rows": rows}, indent=2, default=str)
    app_data_dir.mkdir(parents=True, exist_ok=True)
    (app_data_dir / "eval_report.json").write_text(report)  # shown on the dashboard's metrics page
    if args.json:
        Path(args.json).write_text(report)


if __name__ == "__main__":
    main()
