// Single source of truth for how each of the four backend decision values is
// labeled and colored — imported by the dashboard, case detail, verify
// result, demo grid, and metrics benchmark, so there is exactly one place
// that decides what a decision string is called.
//
// The wire value from the API is always one of these four (see
// docs/INTEGRATION.md — Hackingly integration contract). REJECTED covers
// eligibility declines only: fusion.py can only reach it from an eligibility
// signal, never from a fraud/tamper one, so it's labeled "Not eligible"
// rather than "Rejected" — the decline is real and should stay visible
// (kept on --bad, not neutralized), it just shouldn't read as "fraud caught".
export const VERDICT = {
  APPROVED:     { label: 'Approved',     color: 'var(--ok)' },
  NEEDS_REVIEW: { label: 'Needs review', color: 'var(--review)' },
  REJECTED:     { label: 'Not eligible', color: 'var(--bad)' },
  RESUBMIT:     { label: 'Resubmit',     color: 'var(--fix)' },
}

export function verdictLabel(decision) {
  return VERDICT[decision]?.label || decision
}

export function verdictColor(decision) {
  return VERDICT[decision]?.color || 'var(--ink-2)'
}
