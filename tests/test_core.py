"""Fast, offline unit tests. Run: pytest -q"""
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATA_DIR", _tmp)
os.environ.setdefault("DB_PATH", str(Path(_tmp) / "t.db"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline import aadhaar_qr, fusion, rules  # noqa: E402
from app.pipeline import validators as V  # noqa: E402
from app.pipeline.identity import name_similarity  # noqa: E402
from app.pipeline.signals import Signal  # noqa: E402


# ---- validators ---------------------------------------------------------------
def test_verhoeff_roundtrip():
    base = "23456789012"
    full = base + V.verhoeff_generate(base)
    assert V.verhoeff_valid(full)
    bad = full[:-1] + str((int(full[-1]) + 1) % 10)
    assert not V.verhoeff_valid(bad)


def test_aadhaar_rules():
    base = "12345678901"
    assert not V.validate_aadhaar(base + V.verhoeff_generate(base))[0]  # starts with 1
    assert not V.validate_aadhaar("2345")[0]
    assert V.mask_aadhaar("234567890123") == "XXXX XXXX 0123"


def test_pan():
    ok, _, info = V.validate_pan("ABCPV1234K", "Rahul Verma")
    assert ok and info["surname_initial_ok"]
    assert not V.validate_pan("ABCCV1234K")[0]  # company PAN
    assert not V.validate_pan("AB1PV1234K")[0]


def test_dates_and_age():
    assert V.parse_date("DOB : 14/03/2002") == date(2002, 3, 14)
    assert V.parse_date("2002-03-14") == date(2002, 3, 14)
    assert V.parse_date("14 Mar 2002") == date(2002, 3, 14)
    assert V.parse_date("31/02/2002") is None
    assert V.age_on(date(2008, 9, 19), date(2026, 9, 18)) == 17  # birthday is tomorrow
    assert V.age_on(date(2008, 9, 18), date(2026, 9, 18)) == 18


# ---- names -------------------------------------------------------------------
def test_name_variants_match():
    for a, b in [("R. Arjun", "Arjun Ramesh"), ("Mohd Farhan Shaikh", "Farhan Shaikh"),
                 ("Priya Sharma", "PRIYA SHARMA"), ("Laxmi Devi", "Lakshmi"), ("Kumar Ramesh", "Ramesh Kumar")]:
        assert name_similarity(a, b)[0] >= 85, (a, b, name_similarity(a, b))


def test_single_token_goes_to_review():
    assert 72 <= name_similarity("Kumar", "Rahul Kumar")[0] < 88


def test_different_names_do_not_match():
    for a, b in [("Karan Mehta", "Priya Sharma"), ("Rahul Kumar", "Amit Kumar"), ("Aditya Kapoor", "Deepa Menon")]:
        assert name_similarity(a, b)[0] < 72, (a, b, name_similarity(a, b))


# ---- Aadhaar QR --------------------------------------------------------------------
def test_secure_qr_roundtrip():
    payload = aadhaar_qr.build_secure_payload("Priya Sharma", "14-03-2002", "F", "4821")
    q = aadhaar_qr.parse_secure(payload)
    assert q and q.name == "Priya Sharma" and q.dob == "14-03-2002" and q.last4 == "4821"
    assert q.signature_verified is None  # no cert configured


def test_legacy_xml_qr():
    xml = '<?xml version="1.0"?><PrintLetterBarcodeData uid="234567890123" name="Priya" gender="F" yob="2002"/>'
    q = aadhaar_qr.parse_legacy_xml(xml)
    assert q.kind == "legacy_xml" and q.last4 == "0123" and q.yob == "2002"


# ---- rules ------------------------------------------------------------------------
def _dob(d, conf=0.95):
    return rules.DOBResolution(d, d.year, conf, "test", 1)


def test_age_on_event_date():
    cfg = rules.EventConfig("e", event_date="2026-09-18", min_age=18)
    sig, out = rules.evaluate(cfg, "AADHAAR", _dob(date(2008, 9, 19)), None, None, None, False)
    assert out["hard_fail"] and not out["eligible"]
    sig, out = rules.evaluate(cfg, "AADHAAR", _dob(date(2008, 9, 18)), None, None, None, False)
    assert out["eligible"]


def test_year_only_borderline_goes_to_review():
    cfg = rules.EventConfig("e", event_date="2026-09-18", min_age=18)
    res = rules.DOBResolution(None, 2008, 0.9, "t", 1)  # 17 or 18
    sig, out = rules.evaluate(cfg, "AADHAAR", res, None, None, None, False)
    age = next(s for s in sig if s.name == "age")
    assert age.severity == "warn" and not out["hard_fail"]


def test_student_only_requires_college_id():
    cfg = rules.EventConfig("e", event_date="2026-09-18", student_only=True)
    _, out = rules.evaluate(cfg, "PAN", _dob(date(2000, 1, 1)), None, None, None, False)
    assert out["resubmit"]


# ---- fusion ----------------------------------------------------------------------------
def _s(name, cat, sev, score=0.9, w=1.0):
    return Signal(name, cat, sev, score, name, weight=w)


def test_fusion_never_rejects_on_low_confidence_dob():
    sigs = [_s("age", "eligibility", "critical", 0.05)]
    out = fusion.decide(sigs, {"hard_fail": True}, dob_confidence=0.6, extraction_conf=0.8)
    assert out["decision"] == "NEEDS_REVIEW"


def test_fusion_rejects_verified_ineligible():
    sigs = [_s("x", "extraction", "pass"), _s("age", "eligibility", "critical", 0.05)]
    out = fusion.decide(sigs, {"hard_fail": True}, dob_confidence=0.95, extraction_conf=0.9)
    assert out["decision"] == "REJECTED"


def test_fusion_tamper_blocks_reject_and_approve():
    sigs = [_s("age", "eligibility", "critical", 0.05), _s("aadhaar_qr_match", "tamper", "critical", 0.02)]
    out = fusion.decide(sigs, {"hard_fail": True}, dob_confidence=0.95, extraction_conf=0.9)
    assert out["decision"] == "NEEDS_REVIEW"


def test_fusion_skipped_checks_do_not_penalise():
    base = [_s("a", "extraction", "pass", 0.95), _s("b", "identity", "pass", 0.95)]
    with_skip = base + [Signal("face_match", "identity", "skipped", 0.0, "no selfie", weight=0.0)]
    assert fusion.trust_score(base, 0.9) == fusion.trust_score(with_skip, 0.9)


def test_fraud_outranks_resubmit():
    sigs = [_s("id_reuse", "duplicate", "critical", 0.05)]
    out = fusion.decide(sigs, {"resubmit": True}, 0.9, 0.9)
    assert out["decision"] == "NEEDS_REVIEW"


def test_participant_message_hides_fraud_details():
    sigs = [_s("id_reuse", "duplicate", "critical", 0.05)]
    out = fusion.decide(sigs, {}, 0.9, 0.9)
    assert "reuse" not in out["participant_message"].lower()
