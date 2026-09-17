"""Decision fusion.

Four outcomes:
  APPROVED     - consistent evidence, no concerns on key checks
  NEEDS_REVIEW - anything uncertain or suspicious goes to a human (never silently blocked)
  REJECTED     - only for verified facts: a confidently-read DOB that is out of range,
                 with nothing else putting that DOB in doubt
  RESUBMIT     - the participant can fix it themselves (blurry photo, wrong document)

The LLM is never consulted here. Reasons come from the signals that drove the decision.
"""
from __future__ import annotations

from app.config import settings
from app.pipeline.signals import Signal

KEY_WARN_CATEGORIES = {"identity", "duplicate", "eligibility", "validity"}
SEVERITY_ORDER = {"critical": 0, "warn": 1, "info": 2, "pass": 3, "skipped": 4}


def trust_score(signals: list[Signal], extraction_conf: float) -> float:
    active = [s for s in signals if s.severity != "skipped" and s.weight > 0]
    if not active:
        return 0.0
    num = sum(s.score * s.weight for s in active)
    den = sum(s.weight for s in active)
    score = num / den
    n_crit = sum(s.severity == "critical" for s in active)
    if n_crit:
        score = min(score, 0.5 - 0.1 * (n_crit - 1))
    # blend with how well we could read the document at all
    score = 0.8 * score + 0.2 * extraction_conf
    return round(max(0.0, min(1.0, score)), 3)


def decide(signals: list[Signal], eligibility: dict, dob_confidence: float,
           extraction_conf: float) -> dict:
    ordered = sorted(signals, key=lambda s: (SEVERITY_ORDER[s.severity], -s.weight))
    crit = [s for s in signals if s.severity == "critical"]
    warns = [s for s in signals if s.severity == "warn"]
    score = trust_score(signals, extraction_conf)

    quality_fail = any(s.category == "quality" and s.severity == "critical" for s in signals)
    fraud_crit = [s for s in crit if s.category in ("tamper", "duplicate", "identity")]
    # A fixable problem goes back to the participant, UNLESS there is fraud evidence that a
    # human should see first (otherwise a fraudster just gets told how to try again).
    resubmit = quality_fail or (eligibility.get("resubmit") and not fraud_crit)
    doubt_on_dob = [s for s in crit if s.category in ("tamper", "duplicate", "identity")] + \
                   [s for s in warns if s.name in ("aadhaar_qr_match", "dob_consistency", "error_level_analysis", "jpeg_ghost")]

    if resubmit:
        decision = "RESUBMIT"
        drivers = [s for s in crit if s.data.get("resubmit") or s.category == "quality"] or crit
        confidence = 0.9
    elif eligibility.get("hard_fail") and dob_confidence >= settings.reject_dob_confidence and not doubt_on_dob:
        decision = "REJECTED"
        drivers = [s for s in crit if s.category == "eligibility"]
        confidence = round(dob_confidence, 3)
    elif crit:
        decision = "NEEDS_REVIEW"
        drivers = crit + warns
        confidence = score
    elif score >= settings.approve_threshold and not any(
            s.category in KEY_WARN_CATEGORIES or (s.category == "tamper" and s.weight >= 1.0) for s in warns):
        decision = "APPROVED"
        drivers = [s for s in ordered if s.severity == "pass"][:4]
        confidence = score
    else:
        decision = "NEEDS_REVIEW"
        drivers = warns or [s for s in ordered if s.severity != "skipped"][:3]
        if score < settings.approve_threshold and not warns:
            drivers = [Signal("low_confidence", "extraction", "warn", score,
                              f"Overall confidence {score:.0%} is below the auto-approve bar "
                              f"({settings.approve_threshold:.0%}).")] + drivers
        confidence = score

    def rank(s: Signal):
        return (SEVERITY_ORDER[s.severity], 0 if s.category in KEY_WARN_CATEGORIES else 1, -s.weight)
    if decision != "APPROVED":
        drivers = sorted(drivers, key=rank)
    reasons = [s.reason for s in drivers][:6]
    return {
        "decision": decision,
        "confidence": confidence,
        "trust_score": score,
        "reasons": reasons,
        "summary": _summary(decision, reasons),
        "participant_message": _participant_message(decision, drivers),
    }


def _summary(decision: str, reasons: list[str]) -> str:
    head = {
        "APPROVED": "Verified and eligible.",
        "NEEDS_REVIEW": "Needs a quick human check.",
        "REJECTED": "Not eligible for this event.",
        "RESUBMIT": "Participant needs to upload again.",
    }[decision]
    return f"{head} {reasons[0]}" if reasons else head


def _participant_message(decision: str, drivers: list[Signal]) -> str:
    """What the participant sees. Never reveals fraud-detection details."""
    if decision == "APPROVED":
        return "You're verified. See you at the event!"
    if decision == "RESUBMIT":
        fixes = []
        for s in drivers:
            if s.category == "quality":
                fixes.extend(s.data.get("problems", []))
            elif s.data.get("resubmit"):
                fixes.append(s.reason)
        return "We couldn't verify your ID yet. " + " ".join(dict.fromkeys(fixes) or ["Please upload a clearer photo."])
    if decision == "REJECTED":
        elig = next((s for s in drivers if s.category == "eligibility"), None)
        return (elig.reason if elig else "You don't meet this event's eligibility criteria.") + \
            " If you think this is wrong, reply to your confirmation email."
    return "Thanks! Your ID is being reviewed by the organizers. You'll hear back shortly."
