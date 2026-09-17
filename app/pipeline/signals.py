"""Every check emits Signals. Decision fusion only ever reads Signals.

This keeps each detector independent, unit-testable and explainable: the reason an
organizer sees is exactly the reason the engine used.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

# pass     - check ran and supports "genuine & consistent"
# info     - neutral note, shown but not penalised
# warn     - soft concern; lowers confidence, blocks auto-approve on key fields
# critical - must be seen by a human before approval
# skipped  - check could not run (missing selfie, provider off). NEVER penalised.
SEVERITIES = ("pass", "info", "warn", "critical", "skipped")

CATEGORIES = ("quality", "extraction", "validity", "tamper", "duplicate", "identity", "eligibility")


@dataclass
class Signal:
    name: str
    category: str
    severity: str
    score: float  # 0..1: how strongly this check supports "genuine & consistent"
    reason: str
    weight: float = 1.0
    data: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        assert self.severity in SEVERITIES, self.severity
        assert self.category in CATEGORIES, self.category
        self.score = max(0.0, min(1.0, float(self.score)))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["score"] = round(self.score, 3)
        return d


def skipped(name: str, category: str, reason: str) -> Signal:
    return Signal(name, category, "skipped", 0.0, reason, weight=0.0)
