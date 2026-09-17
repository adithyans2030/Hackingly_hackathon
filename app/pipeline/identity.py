"""Identity matching: does the document belong to the person registering?

Indian names vary a lot between a form and an ID: initials ("R. Kumar"), reordered
tokens ("Kumar Ramesh"), dropped surnames, transliteration ("Mohd"/"Mohammed",
"Laxmi"/"Lakshmi"). A naive string compare would block many genuine participants, so we
normalise aggressively and treat compatible initials as a match.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from app.config import settings
from app.pipeline.signals import Signal, skipped

try:
    from rapidfuzz import fuzz  # type: ignore
except Exception:  # pragma: no cover
    fuzz = None

HONORIFICS = {"mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kumari", "km", "prof", "master"}
VARIANTS = {
    "mohd": "mohammed", "md": "mohammed", "muhammad": "mohammed", "mohammad": "mohammed",
    "laxmi": "lakshmi", "luxmi": "lakshmi", "sreenivas": "srinivas", "shrinivas": "srinivas",
    "venkat": "venkata", "kumaar": "kumar", "siddarth": "siddharth", "sidharth": "siddharth",
    "sk": "shaikh", "sheikh": "shaikh", "shaik": "shaikh", "chowdhury": "choudhary",
    "chaudhary": "choudhary", "chaudhari": "choudhary", "choudhury": "choudhary",
    "priyaa": "priya", "aishwariya": "aishwarya", "ayesha": "aisha",
}
# optional suffixes that are often dropped on forms
DROPPABLE = {"devi", "kumari", "bai", "ben", "bhai", "singh", "kaur", "kumar"}


def normalise(name: str) -> list[str]:
    s = re.sub(r"[^a-z\s.]", " ", (name or "").lower()).replace(".", " ")
    toks = [t for t in s.split() if t and t not in HONORIFICS]
    return [VARIANTS.get(t, t) for t in toks]


def _ratio(a: str, b: str) -> float:
    if fuzz:
        return float(fuzz.ratio(a, b))
    return SequenceMatcher(None, a, b).ratio() * 100


def _token_set(a: list[str], b: list[str]) -> float:
    if fuzz:
        return float(fuzz.token_set_ratio(" ".join(a), " ".join(b)))
    sa, sb = set(a), set(b)
    inter = " ".join(sorted(sa & sb))
    ra = " ".join(sorted(sa - sb)); rb = " ".join(sorted(sb - sa))
    c1 = (inter + " " + ra).strip(); c2 = (inter + " " + rb).strip()
    return max(_ratio(inter, c1) if inter else 0, _ratio(inter, c2) if inter else 0, _ratio(c1, c2))


def name_similarity(form_name: str, doc_name: str) -> tuple[float, str]:
    a, b = normalise(form_name), normalise(doc_name)
    if not a or not b:
        return 0.0, "empty"
    base = _token_set(a, b)

    # Initial-aware alignment: every token on one side must be matched on the other
    # either fully (fuzzy >= 85) or as an initial.
    def covered(src: list[str], dst: list[str]) -> float:
        hits = 0.0
        for t in src:
            if any(_ratio(t, d) >= 85 for d in dst):
                hits += 1
            elif len(t) == 1 and any(d.startswith(t) for d in dst):
                hits += 0.9
            elif any(len(d) == 1 and t.startswith(d) for d in dst):
                hits += 0.9
            elif t in DROPPABLE:
                hits += 0.8
        return hits / len(src)

    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    cov_short = covered(short, long_)
    cov_long = covered(long_, short)
    aligned = 100 * (0.7 * cov_short + 0.3 * cov_long)
    score = max(base, aligned)
    method = "initials/token alignment" if aligned > base else "token-set fuzzy match"
    # guard: a single shared common token ("kumar") must not produce a match
    if cov_short < 0.5:
        score = min(score, 60)
    # a single name vs a full name (e.g. just "Kumar") is plausible but not proof -> review
    meaningful_long = [t for t in long_ if len(t) > 1 and (t not in DROPPABLE or t == short[0])]
    if len(short) == 1 and len(meaningful_long) >= 2:
        score = min(score, 85)
    return round(score, 1), method


def name_signal(form_name: str | None, doc_name: str | None) -> Signal:
    if not form_name:
        return skipped("name_match", "identity", "No name on the registration form")
    if not doc_name:
        return Signal("name_match", "identity", "warn", 0.4,
                      "Could not read a name from the document, so it can't be compared with the form.", weight=1.0)
    score, method = name_similarity(form_name, doc_name)
    data = {"form": form_name, "document": doc_name, "similarity": score, "method": method}
    if score >= settings.name_match_ok:
        return Signal("name_match", "identity", "pass", score / 100,
                      f"Name on the document matches the form ({score:.0f}%).", weight=1.5, data=data)
    if score >= settings.name_match_review:
        return Signal("name_match", "identity", "warn", score / 100,
                      f"Name is similar but not identical: form says “{form_name}”, document says “{doc_name}” "
                      f"({score:.0f}%).", weight=1.5, data=data)
    return Signal("name_match", "identity", "critical", score / 100,
                  f"Name does not match: form says “{form_name}”, document says “{doc_name}” ({score:.0f}%).",
                  weight=1.5, data=data)


def face_signal(similarity: float | None, selfie_given: bool, provider_on: bool,
                id_face_found: bool) -> Signal:
    if not selfie_given:
        return skipped("face_match", "identity", "No selfie provided")
    if not provider_on:
        return skipped("face_match", "identity", "Face matching is not configured")
    if not id_face_found:
        return Signal("face_match", "identity", "warn", 0.45,
                      "Couldn't find a clear face on the ID to compare with the selfie.", weight=1.0)
    if similarity is None:
        return Signal("face_match", "identity", "warn", 0.45,
                      "Couldn't find a clear face in the selfie. Ask the participant to retake it.", weight=1.0,
                      data={"resubmit": True})
    data = {"similarity": round(similarity, 1)}
    if similarity >= settings.face_match_ok:
        return Signal("face_match", "identity", "pass", similarity / 100,
                      f"Selfie matches the ID photo ({similarity:.0f}% similar).", weight=2.0, data=data)
    if similarity >= settings.face_match_review:
        return Signal("face_match", "identity", "warn", similarity / 100,
                      f"Selfie is a partial match to the ID photo ({similarity:.0f}%). ID photos are often "
                      "old or low-resolution, so a person should check.", weight=2.0, data=data)
    return Signal("face_match", "identity", "critical", similarity / 100,
                  f"Selfie does not match the ID photo ({similarity:.0f}% similar).", weight=2.0, data=data)
