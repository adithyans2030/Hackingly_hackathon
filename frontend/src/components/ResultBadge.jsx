export const DECISION_MAP = {
  APPROVED:     { label: 'Approved',     icon: '✅', cls: 'approved',     color: 'var(--green)' },
  NEEDS_REVIEW: { label: 'Needs Review', icon: '🔍', cls: 'needs_review', color: 'var(--amber)' },
  REJECTED:     { label: 'Rejected',     icon: '🚫', cls: 'rejected',     color: 'var(--red)' },
  RESUBMIT:     { label: 'Resubmit',     icon: '📎', cls: 'resubmit',     color: 'var(--cyan)' },
  processing:   { label: 'Processing',   icon: '⏳', cls: 'processing',   color: 'var(--text-muted)' },
}

export default function ResultBadge({ decision, size = 'md' }) {
  const d = DECISION_MAP[decision] || DECISION_MAP['processing']
  const cls = `badge badge-${d.cls}`
  return <span className={cls}>{d.icon} {d.label}</span>
}
