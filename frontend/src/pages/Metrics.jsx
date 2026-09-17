import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { VERDICT, verdictLabel } from '../lib/verdict.js'
import Footer from '../components/Footer.jsx'

// Friendly labels + categories for the real signal names app/pipeline/*.py emits
// (db.py flattens each verification's critical/warn signals into `flags` by name).
const FLAG_INFO = {
  aadhaar_qr_match: { label: 'Printed DOB does not match Aadhaar QR', tag: 'Tamper' },
  aadhaar_qr_number: { label: 'Printed Aadhaar number does not match QR', tag: 'Tamper' },
  aadhaar_qr_signature: { label: 'Aadhaar QR not signed by UIDAI', tag: 'Tamper' },
  jpeg_ghost: { label: 'JPEG ghost (text pasted after saving)', tag: 'Tamper' },
  error_level_analysis: { label: 'Compression inconsistency (ELA)', tag: 'Tamper' },
  copy_move: { label: 'Cloned region on document', tag: 'Tamper' },
  screen_recapture: { label: 'Screen moiré (photo of a screen)', tag: 'Recapture' },
  metadata: { label: 'Suspicious edit-software EXIF tag', tag: 'Tamper' },
  ai_forensic_review: { label: 'AI examiner flagged possible editing', tag: 'Tamper' },
  id_reuse: { label: 'Same ID number already on file', tag: 'Reuse' },
  image_reuse: { label: 'Same ID image already on file', tag: 'Reuse' },
  face_reuse: { label: 'Same face already on file, different name', tag: 'Reuse' },
  id_number_valid: { label: 'ID number fails Verhoeff checksum', tag: 'Validity' },
  name_match: { label: "Applicant name doesn't match the ID", tag: 'Identity' },
  face_match: { label: "Selfie doesn't match the ID photo", tag: 'Identity' },
  form_dob_match: { label: 'Form date of birth differs from document', tag: 'Identity' },
  dob_consistency: { label: 'Readers disagree on date of birth', tag: 'Validity' },
  dob_sanity: { label: 'Date of birth looks implausible', tag: 'Validity' },
  document_type: { label: "Document type couldn't be recognised", tag: 'Eligibility' },
  age: { label: 'Age requirement not met', tag: 'Eligibility' },
  student_status: { label: 'Student-only event, non-student ID', tag: 'Eligibility' },
  institution_allowed: { label: 'Institution not on the allowed list', tag: 'Eligibility' },
  portrait_present: { label: 'No portrait photo found on document', tag: 'Quality' },
}

function flagInfo(name) {
  return FLAG_INFO[name] || { label: name.replace(/_/g, ' '), tag: 'Signal' }
}

const EVAL_SUMMARY_LABELS = {
  cases: 'Test cases',
  accuracy: 'Accuracy',
  genuine_auto_approved: 'Genuine auto-approved',
  'genuine_hard_rejected (false reject)': 'Genuine wrongly rejected',
  'fraud_caught (not auto-approved)': 'Fraud caught',
  fraud_auto_rejected_without_human: 'Fraud auto-rejected (no human)',
  ineligible_rejected: 'Ineligible correctly rejected',
  fixable_sent_back: 'Fixable issues sent back',
  avg_latency_ms: 'Average check time',
  wall_time_s: 'Total run time',
}

export default function Metrics() {
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState(null)

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/v1/metrics')
      setMetrics(data)
    } catch {
      // Offline fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [])

  const total = metrics?.total || 0
  const finalDecisions = metrics?.final_decisions || {}
  const pctOf = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

  const dist = {
    APPROVED: pctOf(finalDecisions.APPROVED || 0),
    NEEDS_REVIEW: pctOf(finalDecisions.NEEDS_REVIEW || 0),
    REJECTED: pctOf(finalDecisions.REJECTED || 0),
    RESUBMIT: pctOf(finalDecisions.RESUBMIT || 0),
  }

  const topFlags = metrics?.top_flags || []
  const maxFlagCount = Math.max(1, ...topFlags.map(([, count]) => count))

  const reviewOutcomes = metrics?.review_outcomes || {}
  const reviewOutcomeTotal = Object.values(reviewOutcomes).reduce((a, b) => a + b, 0)

  const evalSummary = metrics?.evaluation
  const evalCases = metrics?.evaluation_cases

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      {/* ── Page Header ── */}
      <div
        style={{
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--surface)',
          padding: '28px 32px',
        }}
      >
        <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="section-label">System telemetry & benchmark</div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
              Forensic Metrics & Test Benchmarks
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-2)', marginTop: 4 }}>
              Live production rates from every registration checked, plus the labelled synthetic benchmark.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadMetrics}
            style={{ fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1140, margin: '36px auto 80px', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 36 }}>
        {!metrics && (
          <div style={{ fontSize: '0.9rem', color: 'var(--ink-2)' }}>
            {loading ? 'Loading telemetry…' : 'No telemetry available — is the backend running?'}
          </div>
        )}

        {metrics && (
          <>
            {/* ── ROW OF PLAIN LARGE FIGURES ON HAIRLINE RULES (No gradient stat cards) ── */}
            <div>
              <div className="section-label">Production verification volume</div>
              <div className="metrics-row">
                <div className="metrics-cell">
                  <div className="metric-figure tabular-nums">{total.toLocaleString()}</div>
                  <div className="metric-label">Registrations checked</div>
                </div>

                <div className="metrics-cell">
                  <div className="metric-figure tabular-nums">
                    {Math.round((metrics.automation_rate || 0) * 1000) / 10}%
                  </div>
                  <div className="metric-label">Decided without a person</div>
                </div>

                <div className="metrics-cell">
                  <div className="metric-figure tabular-nums">{pctOf(metrics.reviewed || 0)}%</div>
                  <div className="metric-label">Reviewed by organizers</div>
                </div>

                <div className="metrics-cell">
                  <div
                    className="metric-figure tabular-nums"
                    style={{ color: metrics.overturned_auto_rejections > 0 ? 'var(--review)' : 'var(--ok)' }}
                  >
                    {metrics.overturned_auto_rejections ?? 0}
                  </div>
                  <div className="metric-label">Auto-rejections overturned</div>
                </div>

                <div className="metrics-cell">
                  <div className="metric-figure tabular-nums">
                    {metrics.latency_ms?.p50 != null ? `${(metrics.latency_ms.p50 / 1000).toFixed(1)}s` : '—'}
                  </div>
                  <div className="metric-label">Median check time</div>
                </div>

                <div className="metrics-cell">
                  <div className="metric-figure tabular-nums">
                    {metrics.latency_ms?.p95 != null ? `${(metrics.latency_ms.p95 / 1000).toFixed(1)}s` : '—'}
                  </div>
                  <div className="metric-label">95th percentile</div>
                </div>
              </div>
            </div>

            {/* ── HORIZONTAL STACKED DISTRIBUTION BAR WITH A LEGEND ── */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="section-label">Outcome allocation</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                Registration Outcome Distribution
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 20 }}>
                Proportion of all {total.toLocaleString()} checked registrations terminating in immediate approval,
                human review, ineligibility, or a retake prompt.
              </p>

              {total > 0 ? (
                <>
                  <div
                    style={{
                      height: 28, borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex',
                      border: '1px solid var(--rule)', marginBottom: 16,
                    }}
                  >
                    <div style={{ width: `${dist.APPROVED}%`, backgroundColor: 'var(--ok)', transition: 'width 0.3s ease' }}
                         title={`Approved: ${dist.APPROVED}%`} />
                    <div style={{ width: `${dist.NEEDS_REVIEW}%`, backgroundColor: 'var(--review)', transition: 'width 0.3s ease' }}
                         title={`Needs Review: ${dist.NEEDS_REVIEW}%`} />
                    <div style={{ width: `${dist.REJECTED}%`, backgroundColor: 'var(--bad)', transition: 'width 0.3s ease' }}
                         title={`${VERDICT.REJECTED.label}: ${dist.REJECTED}%`} />
                    <div style={{ width: `${dist.RESUBMIT}%`, backgroundColor: 'var(--fix)', transition: 'width 0.3s ease' }}
                         title={`Resubmit: ${dist.RESUBMIT}%`} />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: '0.82rem' }}>
                    {[
                      ['APPROVED', 'var(--ok)', 'Approved'],
                      ['NEEDS_REVIEW', 'var(--review)', 'Needs Review'],
                      ['REJECTED', 'var(--bad)', VERDICT.REJECTED.label],
                      ['RESUBMIT', 'var(--fix)', 'Resubmit'],
                    ].map(([key, color, label]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 2 }} />
                        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{label}</span>
                        <span style={{ color: 'var(--ink-2)' }} className="tabular-nums">
                          {dist[key]}% ({finalDecisions[key] || 0})
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
                  No registrations checked yet.
                </div>
              )}
            </div>

            {/* ── HUMAN REVIEW OUTCOMES ── */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="section-label">Human-in-the-loop</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                What Organizers Decided On Flagged Cases
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 20 }}>
                Of the {metrics.reviewed || 0} case{metrics.reviewed === 1 ? '' : 's'} sent to review, here's how
                organizers actually resolved them.
              </p>

              {reviewOutcomeTotal > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['APPROVED', 'REJECTED', 'RESUBMIT'].filter((k) => reviewOutcomes[k]).map((key) => {
                    const count = reviewOutcomes[key]
                    const pct = Math.round((count / reviewOutcomeTotal) * 100)
                    const color = key === 'APPROVED' ? 'var(--ok)' : key === 'REJECTED' ? 'var(--bad)' : 'var(--fix)'
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 110, fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 600 }}>
                          {verdictLabel(key)}
                        </span>
                        <div style={{ flex: 1, height: 10, backgroundColor: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
                        </div>
                        <span className="tabular-nums" style={{ width: 70, textAlign: 'right', fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                          {count} ({pct}%)
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
                  No reviews completed yet.
                </div>
              )}
            </div>

            {/* ── TOP FLAGS (real production signals, ranked) ── */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="section-label">Incident telemetry</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Most Common Concerns
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 20 }}>
                Frequency rank of the forensic and policy signals actually raised across every registration checked.
              </p>

              {topFlags.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topFlags.map(([name, count], idx) => {
                    const info = flagInfo(name)
                    const barPct = Math.round((count / maxFlagCount) * 100)
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          className="tabular-nums"
                          style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            backgroundColor: 'var(--surface)', border: '1px solid var(--rule)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink)',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div style={{ flex: '0 0 260px', minWidth: 0 }}>
                          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {info.label}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-2)' }}>{info.tag}</div>
                        </div>
                        <div style={{ flex: 1, height: 10, backgroundColor: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                          <div style={{ width: `${barPct}%`, height: '100%', backgroundColor: 'var(--stamp)' }} />
                        </div>
                        <span className="tabular-nums" style={{ width: 100, textAlign: 'right', fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                          {count} · {pctOf(count)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
                  No forensic or policy signals have fired yet.
                </div>
              )}
            </div>

            {/* ── EVALUATION SUMMARY (real scripts/evaluate.py run, if one exists) ── */}
            {evalSummary && (
              <div className="panel" style={{ padding: 24 }}>
                <div className="section-label">Validation benchmark</div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  Latest Labelled Test Set Run
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 20 }}>
                  From the most recent <code>scripts/evaluate.py --keep-db</code> run against{' '}
                  {evalSummary.cases || evalCases?.length || 'the'} labelled cases.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {Object.entries(evalSummary).map(([key, val]) => (
                    <div key={key} style={{ padding: '12px 16px', backgroundColor: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: 4 }}>
                        {EVAL_SUMMARY_LABELS[key] || key.replace(/_/g, ' ')}
                      </div>
                      <div className="tabular-nums" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ink)' }}>
                        {key === 'avg_latency_ms' ? `${(val / 1000).toFixed(1)}s` : key === 'wall_time_s' ? `${val}s` : String(val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TEST-SET RESULTS TABLE (real per-case rows, or an honest "not run yet") ── */}
            <div className="panel" style={{ padding: 24 }}>
              <div className="section-label">Case-by-case</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Labelled Synthetic Test Set Results
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 20 }}>
                {evalCases
                  ? 'Ground-truth evaluation performed on each labelled synthetic test vector. All accuracy claims cite this explicit set.'
                  : 'No evaluation report found yet.'}
              </p>

              {evalCases ? (
                <div style={{ overflowX: 'auto', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Applicant</th>
                        <th>Scenario</th>
                        <th>Expected</th>
                        <th>Actual Verdict</th>
                        <th>Duration</th>
                        <th>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalCases.map((c) => (
                        <tr key={c.file}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.78rem', color: 'var(--ink-2)' }}>
                            {c.file}
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.form?.name}</td>
                          <td style={{ color: 'var(--ink-2)', fontSize: '0.82rem' }}>{c.scenario}</td>
                          <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{verdictLabel(c.expect)}</td>
                          <td>
                            <span className={`verdict-chip ${c.decision}`}>{verdictLabel(c.decision)}</span>
                          </td>
                          <td className="tabular-nums" style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                            {(c.ms / 1000).toFixed(2)}s
                          </td>
                          <td style={{ color: c.ok ? 'var(--ok)' : 'var(--review)', fontWeight: 600, fontSize: '0.82rem' }}>
                            {c.ok ? '✓ As expected' : `⚠ ${c.reason || 'Differs from expected'}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
                  Run <code>python scripts/evaluate.py --keep-db</code> to populate this table with real results.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  )
}
