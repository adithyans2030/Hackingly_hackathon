const SEVERITY_COLORS = {
  critical: 'var(--red)',
  warn:     'var(--amber)',
  pass:     'var(--green)',
  info:     'var(--indigo)',
  skipped:  'var(--text-muted)',
}

const SEVERITY_ICONS = {
  critical: '⛔',
  warn:     '⚠️',
  pass:     '✅',
  info:     'ℹ️',
  skipped:  '⏭️',
}

export default function SignalRow({ signal }) {
  return (
    <div className={`signal-row ${signal.severity}`}>
      <div className={`signal-dot ${signal.severity}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="signal-name" style={{ fontSize: '0.82rem' }}>
          {SEVERITY_ICONS[signal.severity]} {signal.name.replace(/_/g, ' ')}
        </div>
        {signal.reason && (
          <div className="signal-reason" style={{ fontSize: '0.8rem' }}>{signal.reason}</div>
        )}
      </div>
      {signal.score != null && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {Math.round(signal.score * 100)}%
        </div>
      )}
    </div>
  )
}
