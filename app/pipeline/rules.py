"""Per-event eligibility rules. Pure functions over extracted facts -> Signals."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date

from app.pipeline import validators as V
from app.pipeline.identity import name_similarity
from app.pipeline.signals import Signal, skipped

ALL_DOCS = ["AADHAAR", "PAN", "COLLEGE_ID", "DRIVING_LICENCE", "VOTER_ID", "PASSPORT"]


@dataclass
class EventConfig:
    event_id: str
    name: str = ""
    event_date: str = ""                 # ISO; age is computed ON this date
    min_age: int | None = None
    max_age: int | None = None
    student_only: bool = False
    accepted_docs: list[str] = field(default_factory=lambda: list(ALL_DOCS))
    require_selfie: bool = False
    allowed_institutions: list[str] = field(default_factory=list)
    check_institution_matches_form: bool = True
    webhook_url: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "EventConfig":
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def on_date(self) -> date:
        return V.to_date(self.event_date) or date.today()


@dataclass
class DOBResolution:
    dob: date | None
    yob: int | None
    confidence: float           # 0..1 how sure we are of the DOB value
    source: str                 # e.g. "aadhaar_qr+ocr+legacy"
    agreeing_sources: int


def evaluate(cfg: EventConfig, doc_type: str, dob: DOBResolution, institution: str | None,
             valid_till: str | None, form_institution: str | None, selfie_given: bool) -> tuple[list[Signal], dict]:
    sig: list[Signal] = []
    outcome = {"eligible": True, "hard_fail": False, "resubmit": False, "reasons": []}
    on = cfg.on_date

    # ---- document type -------------------------------------------------------
    if doc_type == "UNKNOWN":
        # Not recognising the document type is genuine uncertainty, not a fixable photo
        # problem — retaking the shot won't help if it's the classifier that's confused.
        # Route to a human instead of bouncing a real, valid ID back to the participant.
        sig.append(Signal("document_type", "eligibility", "critical", 0.2,
                          "Couldn't recognise the document type. An organizer should confirm it's an accepted ID.",
                          weight=1.0))
    elif doc_type not in cfg.accepted_docs:
        pretty = ", ".join(d.replace("_", " ").title() for d in cfg.accepted_docs)
        sig.append(Signal("document_type", "eligibility", "critical", 0.3,
                          f"{doc_type.replace('_', ' ').title()} is not accepted for this event. Accepted: {pretty}.",
                          weight=1.0, data={"resubmit": True}))
        outcome.update(resubmit=True)
    else:
        sig.append(Signal("document_type", "eligibility", "pass", 0.9,
                          f"{doc_type.replace('_', ' ').title()} is accepted for this event.", weight=0.5))

    # ---- age -------------------------------------------------------------------
    if cfg.min_age is None and cfg.max_age is None:
        sig.append(skipped("age", "eligibility", "Event has no age restriction"))
    elif dob.dob:
        age = V.age_on(dob.dob, on)
        ok_min = cfg.min_age is None or age >= cfg.min_age
        ok_max = cfg.max_age is None or age <= cfg.max_age
        data = {"age_on_event_date": age, "dob": dob.dob.isoformat(), "dob_confidence": round(dob.confidence, 2),
                "dob_source": dob.source, "event_date": on.isoformat()}
        if ok_min and ok_max:
            sig.append(Signal("age", "eligibility", "pass", 0.95 * max(dob.confidence, 0.6),
                              f"Age on event day is {age}, which meets the requirement.", weight=1.5, data=data))
        else:
            rule = f"at least {cfg.min_age}" if not ok_min else f"at most {cfg.max_age}"
            outcome["eligible"] = False
            outcome["reasons"].append(f"Participant will be {age} on {on:%d %b %Y}; this event requires {rule}.")
            if dob.confidence >= 0.0:  # hard-fail decision is made in fusion using confidence
                outcome["hard_fail"] = True
            sig.append(Signal("age", "eligibility", "critical", 0.05,
                              f"Age on event day is {age}; this event requires participants to be {rule}.",
                              weight=1.5, data=data))
    elif dob.yob:
        lo, hi = V.age_bounds_from_year(dob.yob, on)
        data = {"year_of_birth": dob.yob, "possible_ages": [lo, hi], "event_date": on.isoformat()}

        def ok(a):
            return (cfg.min_age is None or a >= cfg.min_age) and (cfg.max_age is None or a <= cfg.max_age)

        if ok(lo) and ok(hi):
            sig.append(Signal("age", "eligibility", "pass", 0.85,
                              f"Card shows only the birth year ({dob.yob}); age is {lo}–{hi}, eligible either way.",
                              weight=1.5, data=data))
        elif not ok(lo) and not ok(hi):
            outcome["eligible"] = False; outcome["hard_fail"] = True
            outcome["reasons"].append(f"Birth year {dob.yob} is outside the event's age range.")
            sig.append(Signal("age", "eligibility", "critical", 0.05,
                              f"Birth year {dob.yob} means age {lo}–{hi}, outside the event's age range.",
                              weight=1.5, data=data))
        else:
            sig.append(Signal("age", "eligibility", "warn", 0.5,
                              f"Card shows only the birth year ({dob.yob}); the participant may be {lo} or {hi} on "
                              "event day, so a second document with the full date is needed.",
                              weight=1.5, data=data))
    else:
        sig.append(Signal("age", "eligibility", "warn", 0.35,
                          "Couldn't read a date of birth, so age can't be confirmed.", weight=1.5,
                          data={"resubmit_hint": True}))

    # ---- student-only ------------------------------------------------------------
    if cfg.student_only:
        if doc_type != "COLLEGE_ID":
            sig.append(Signal("student_status", "eligibility", "critical", 0.3,
                              "This event is for students only; a valid college ID is required.", weight=1.2,
                              data={"resubmit": True}))
            outcome["resubmit"] = True
        else:
            vt = V.to_date(valid_till)
            if vt and vt < on:
                sig.append(Signal("student_status", "eligibility", "warn", 0.45,
                                  f"College ID expired on {vt:%d %b %Y}. The student may be between renewals; "
                                  "check a fee receipt or bonafide certificate.", weight=1.2,
                                  data={"valid_till": vt.isoformat()}))
            elif vt:
                sig.append(Signal("student_status", "eligibility", "pass", 0.9,
                                  f"College ID is valid until {vt:%d %b %Y}.", weight=1.2))
            else:
                sig.append(Signal("student_status", "eligibility", "pass", 0.7,
                                  "College ID found (no validity date printed).", weight=1.0))

    # ---- institution ------------------------------------------------------------
    if cfg.allowed_institutions:
        if not institution:
            sig.append(Signal("institution_allowed", "eligibility", "warn", 0.4,
                              "Couldn't read the institution name to check it against the allowed list.", weight=1.0))
        else:
            best = max((name_similarity(institution, a)[0], a) for a in cfg.allowed_institutions)
            if best[0] >= 80:
                sig.append(Signal("institution_allowed", "eligibility", "pass", 0.9,
                                  f"Institution matches allowed list ({best[1]}).", weight=1.0))
            else:
                outcome["eligible"] = False
                sig.append(Signal("institution_allowed", "eligibility", "critical", 0.2,
                                  f"“{institution}” is not on this event's list of participating institutions.",
                                  weight=1.0, data={"closest": best[1], "similarity": best[0]}))
    if cfg.check_institution_matches_form and form_institution and institution:
        s, _ = name_similarity(form_institution, institution)
        if s >= 75:
            sig.append(Signal("institution_match", "identity", "pass", s / 100,
                              "Institution on the ID matches the form.", weight=0.6))
        else:
            sig.append(Signal("institution_match", "identity", "warn", s / 100,
                              f"Form says “{form_institution}” but the ID says “{institution}”.", weight=0.6))

    # ---- selfie requirement --------------------------------------------------------
    if cfg.require_selfie and not selfie_given:
        sig.append(Signal("selfie_required", "eligibility", "critical", 0.3,
                          "This event requires a selfie for face verification.", weight=0.5, data={"resubmit": True}))
        outcome["resubmit"] = True

    return sig, outcome
