import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Filter, RefreshCw } from 'lucide-react'
import { apiFetch, ago, pct, DOC_LABELS } from '../lib/api.js'
import { verdictLabel } from '../lib/verdict.js'
import CaseDetailView from '../components/CaseDetailView.jsx'
import Footer from '../components/Footer.jsx'

// Fallback synthetic queue when database is fresh or empty
const SYNTHETIC_CASES = [
  {
    id: 'case-01-kabir',
    name: 'Kabir Das',
    doc_type: 'aadhaar',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    decision: 'NEEDS_REVIEW',
    document_url: '/specimens/kabir-das-qr-mismatch.jpg',
    ela_url: '/specimens/kabir-das-qr-mismatch.jpg',
    event_name: 'AI Build Challenge Bengaluru',
    email: 'kabir.das@example.org',
    result: {
      confidence: 0.68,
      summary: "The printed date of birth (1995-04-12) doesn't match the Aadhaar QR (2009-04-12).",
      extracted: {
        name: 'Kabir Das',
        dob: '1995-04-12',
        qr_dob: '2009-04-12',
        gender: 'Male',
        id_number: 'XXXX XXXX 8912',
      },
      signals: [
        { severity: 'critical', code: 'QR_DOB_MISMATCH', label: 'QR↔Print DOB Mismatch', detail: 'Printed DOB 1995-04-12 conflicts with UIDAI signed QR DOB 2009-04-12.' },
        { severity: 'warn', code: 'TAMPER_SUSPECT', label: 'Potential Text Splice', detail: 'Date font weight deviates from UIDAI template baseline.' },
        { severity: 'pass', code: 'VERHOEFF_VALID', label: 'Verhoeff Checksum Valid', detail: 'Aadhaar 12-digit number satisfies Verhoeff algorithm.' },
        { severity: 'pass', code: 'FACE_MATCH', label: 'Facial Biometrics Match', detail: 'Applicant selfie matches ID crop with 89.2% confidence.' },
        { severity: 'info', code: 'QR_OFFLINE_DECODE', label: 'Secure QR Decoded', detail: 'Decoded without remote UIDAI server dependencies.' },
      ],
      duplicates: [],
    },
  },
  {
    id: 'case-02-ishaan',
    name: 'Ishaan Rao',
    doc_type: 'aadhaar',
    created_at: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
    decision: 'NEEDS_REVIEW',
    document_url: '/specimens/ishaan-rao-jpeg-ghost.jpg',
    ela_url: '/specimens/ishaan-rao-jpeg-ghost.jpg',
    event_name: 'AI Build Challenge Bengaluru',
    email: 'ishaan.rao@techhub.in',
    result: {
      confidence: 0.71,
      summary: 'The date lacks the compression trace the rest of the card carries — pasted in later.',
      extracted: {
        name: 'Ishaan Rao',
        dob: '1999-08-20',
        gender: 'Male',
        id_number: 'XXXX XXXX 6231',
      },
      signals: [
        { severity: 'critical', code: 'JPEG_GHOST_DOB', label: 'JPEG Ghost Detected', detail: 'High variance in quantization coefficients across DOB bounding rectangle.' },
        { severity: 'pass', code: 'NAME_MATCH', label: 'Name Exact Match', detail: 'Registrant name matches card text perfectly.' },
        { severity: 'pass', code: 'VERHOEFF_VALID', label: 'Verhoeff Checksum Valid', detail: 'Checksum satisfies Verhoeff check.' },
        { severity: 'info', code: 'FFT_NO_MOIRE', label: 'FFT Frequency Normal', detail: 'No screen recapture moiré grid observed.' },
      ],
      duplicates: [],
    },
  },
  {
    id: 'case-03-sneha',
    name: 'Sneha Kulkarni',
    doc_type: 'aadhaar',
    created_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    decision: 'NEEDS_REVIEW',
    document_url: '/specimens/sneha-kulkarni-reused-id.jpg',
    ela_url: '/specimens/sneha-kulkarni-reused-id.jpg',
    event_name: 'AI Build Challenge Bengaluru',
    email: 'sneha.k@codecamp.co',
    result: {
      confidence: 0.74,
      summary: 'The same ID is already on file, under a different name.',
      extracted: {
        name: 'Sneha Kulkarni',
        dob: '2001-11-04',
        gender: 'Female',
        id_number: 'XXXX XXXX 9918',
      },
      signals: [
        { severity: 'critical', code: 'DUPLICATE_ID', label: 'Duplicate ID Number', detail: 'HMAC fingerprint matches registration from Priya Sharma submitted 3 days ago.' },
        { severity: 'pass', code: 'QUALITY_GOOD', label: 'Image Quality Passed', detail: 'Sharp image with clear edges and balanced contrast.' },
        { severity: 'pass', code: 'VERHOEFF_VALID', label: 'Verhoeff Checksum Valid', detail: 'Valid Aadhaar checksum.' },
      ],
      duplicates: [{ prior_name: 'Priya Sharma', time: '3 days ago' }],
    },
  },
  {
    id: 'case-04-arjun',
    name: 'Arjun Ramesh',
    doc_type: 'aadhaar',
    created_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    decision: 'APPROVED',
    document_url: '/specimens/kabir-das-qr-mismatch.jpg',
    ela_url: '/specimens/kabir-das-qr-mismatch.jpg',
    event_name: 'AI Build Challenge Bengaluru',
    email: 'arjun.ramesh@gmail.com',
    result: {
      confidence: 0.96,
      summary: 'Genuine Aadhaar card. All forensic and cryptographic validations passed.',
      extracted: {
        name: 'Arjun Ramesh',
        dob: '1998-03-15',
        gender: 'Male',
        id_number: 'XXXX XXXX 4521',
      },
      signals: [
        { severity: 'pass', code: 'NAME_MATCH', label: 'Name Verified', detail: 'Exact token agreement.' },
        { severity: 'pass', code: 'DOB_ELIGIBLE', label: 'Age Requirement Met', detail: 'Age 26 meets event threshold >= 18.' },
        { severity: 'pass', code: 'VERHOEFF_VALID', label: 'Verhoeff Checksum Valid', detail: 'Valid algorithm checksum.' },
        { severity: 'pass', code: 'FACE_MATCH', label: 'Biometrics Match', detail: 'Similarity 94.1%.' },
      ],
      duplicates: [],
    },
  },
]

export default function Dashboard() {
  const { vid } = useParams()
  const navigate = useNavigate()

  const [queue, setQueue] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailNotFound, setDetailNotFound] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewLoading, setReviewLoading] = useState(false)

  // Load review queue from backend API
  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/v1/verifications')
      if (Array.isArray(data) && data.length > 0) {
        setQueue(data)
        if (!selectedId && !vid) setSelectedId(data[0].id)
      } else {
        // Use synthetic queue if database has zero verifications yet
        setQueue(SYNTHETIC_CASES)
        if (!selectedId && !vid) setSelectedId(SYNTHETIC_CASES[0].id)
      }
    } catch {
      setQueue(SYNTHETIC_CASES)
      if (!selectedId && !vid) setSelectedId(SYNTHETIC_CASES[0].id)
    } finally {
      setLoading(false)
    }
  }, [selectedId, vid])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    if (vid) {
      setSelectedId(vid)
    }
  }, [vid])

  // The list endpoint (GET /v1/verifications) deliberately omits the full `result`
  // blob for payload size — it only has flattened top-level fields (confidence,
  // doc_type, flags, summary). The detail endpoint has everything (extracted
  // fields, signals, field boxes, artifacts), so fetch it per selection. This
  // 404s harmlessly for the synthetic fallback queue's mock ids, which already
  // carry a full embedded `result` and don't need a backend fetch at all.
  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailNotFound(false); return }
    let cancelled = false
    setDetailNotFound(false)
    apiFetch(`/v1/verifications/${selectedId}`)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((err) => {
        if (cancelled) return
        setDetail(null)
        // Real ids (v_...) that 404 genuinely no longer exist — the DB was reset
        // or the record was deleted out from under a stale URL/selection. The
        // synthetic demo queue's mock ids ("case-01-kabir", ...) 404 by design
        // and already carry a full embedded result, so they aren't an error.
        if (err?.status === 404 && selectedId.startsWith('v_')) setDetailNotFound(true)
      })
    return () => { cancelled = true }
  }, [selectedId])

  const handleCaseSelect = (id) => {
    setSelectedId(id)
    navigate(`/dashboard/${id}`, { replace: true })
  }

  // Handle Review Action (Approve / Reject / Resubmit)
  const handleReview = async (decision, note) => {
    if (!selectedId) return
    setReviewLoading(true)
    try {
      await apiFetch(`/v1/verifications/${selectedId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note, reviewer: 'Organizer' }),
      })
    } catch {
      // Local optimistic update if running standalone mock
    }

    setQueue((prev) =>
      prev.map((item) =>
        item.id === selectedId
          ? { ...item, final_decision: decision, review_note: note }
          : item
      )
    )
    setDetail((prev) =>
      prev && prev.id === selectedId ? { ...prev, final_decision: decision, review_note: note } : prev
    )
    setReviewLoading(false)
  }

  // Filter and search queue
  const filteredQueue = queue.filter((item) => {
    const verdict = item.final_decision || item.decision || 'NEEDS_REVIEW'
    if (filter !== 'ALL' && verdict !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = (item.applicant?.name || item.name || '').toLowerCase().includes(q)
      const matchId = (item.id || '').toLowerCase().includes(q)
      return matchName || matchId
    }
    return true
  })

  const selectedInQueue = queue.find((item) => item.id === selectedId)
  // A confirmed-gone id should show as gone, not silently swap in whatever the
  // first filtered row happens to be — that would show the wrong case's data
  // under a URL that still names the deleted one.
  const selectedListItem = selectedInQueue || (detailNotFound ? null : filteredQueue[0])
  // Prefer the fully-fetched detail record; fall back to the list row (covers the
  // synthetic queue, whose mock ids 404 the detail endpoint but already embed `result`).
  const selectedCase = (detail && detail.id === selectedListItem?.id) ? detail : selectedListItem

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      {/* ── Subheader ── */}
      <div
        style={{
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--surface)',
          padding: '16px 32px',
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-2)', fontWeight: 500 }}>
              Organizer review queue
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>
              Registration Decisions & Forensics
            </h1>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchQueue}
            style={{ fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* ── Two-Pane Layout (Stacks on mobile) ── */}
      <div style={{ maxWidth: 1400, margin: '24px auto 60px', padding: '0 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 380px) 1fr',
            gap: 24,
            alignItems: 'flex-start',
          }}
          className="dashboard-two-panes"
        >
          {/* ── LEFT PANE: Queue & Search Sidebar ── */}
          <div className="panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--ink-2)' }} />
              <input
                type="text"
                placeholder="Search applicant or ID…"
                className="input"
                style={{ paddingLeft: 34, fontSize: '0.85rem' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'All' },
                { key: 'NEEDS_REVIEW', label: 'Review' },
                { key: 'APPROVED', label: 'Approved' },
                { key: 'REJECTED', label: 'Not eligible' },
                { key: 'RESUBMIT', label: 'Resubmit' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)',
                    backgroundColor: filter === f.key ? 'var(--stamp)' : 'transparent',
                    color: filter === f.key ? '#FFFFFF' : 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
              {filteredQueue.map((item) => {
                const verdict = item.final_decision || item.decision || 'NEEDS_REVIEW'
                const isSelected = item.id === selectedId
                // The list endpoint flattens signals into `flags` (plain name strings);
                // the synthetic fallback queue instead embeds full signal objects — support both.
                const topFlags = (item.flags || (item.result?.signals || [])
                  .filter((s) => s.severity === 'critical' || s.severity === 'warn')
                  .map((s) => s.name || s.code || s.label))
                  .slice(0, 2)
                  .map((f) => (f || '').replace(/_/g, ' '))

                return (
                  <div
                    key={item.id}
                    onClick={() => handleCaseSelect(item.id)}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: isSelected ? 'var(--paper)' : 'var(--surface)',
                      border: `1px solid ${isSelected ? 'var(--stamp)' : 'var(--rule)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--ink)' }}>
                        {item.applicant?.name || item.name || 'Applicant'}
                      </span>
                      <span className={`verdict-chip ${verdict}`}>
                        {verdictLabel(verdict)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-2)', marginBottom: 6 }}>
                      <span>{DOC_LABELS[item.doc_type] || 'Aadhaar'}</span>
                      <span className="tabular-nums">{ago(item.created_at || new Date())}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--ink-2)' }}>
                        Confidence: <strong className="tabular-nums">
                          {(() => {
                            const c = item.confidence ?? item.result?.confidence
                            return c != null ? `${Math.round(c * 100)}%` : '—'
                          })()}
                        </strong>
                      </span>
                      {topFlags.length > 0 && (
                        <span style={{ color: 'var(--bad)', fontWeight: 600, fontSize: '0.72rem' }}>
                          {topFlags.join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {filteredQueue.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2)', fontSize: '0.85rem' }}>
                  No applications match current filters.
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT PANE: Case Detail Inspection View ── */}
          <div>
            {detailNotFound && !selectedInQueue ? (
              <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-2)' }}>
                <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  Case #{selectedId?.slice(0, 8)} could not be found.
                </p>
                <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                  It may have been deleted, or the review database changed since you opened this link.
                </p>
                <button type="button" className="btn-secondary" onClick={fetchQueue}>
                  Refresh queue
                </button>
              </div>
            ) : (
              <CaseDetailView
                verification={selectedCase}
                onReviewSubmit={handleReview}
                reviewLoading={reviewLoading}
              />
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
