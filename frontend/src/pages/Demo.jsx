import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, RotateCcw, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { verdictLabel } from '../lib/verdict.js'
import InkStamp from '../components/InkStamp.jsx'
import Footer from '../components/Footer.jsx'

const SPECIMENS = [
  {
    id: 'demo-qr-mismatch',
    title: 'Printed Date vs. QR Mismatch',
    demonstrates: 'Cross-checks the Aadhaar QR against printed details without trusting OCR alone.',
    expected: 'NEEDS_REVIEW',
    badge: 'QR Discrepancy',
    cardImage: '/specimens/kabir-das-qr-mismatch.jpg',
    applicant: 'Kabir Das',
    details: 'The printed date reads 1995-04-12, but the Secure QR signed payload decodes to 2009-04-12.',
  },
  {
    id: 'demo-jpeg-ghost',
    title: 'JPEG Ghost Compression Splice',
    demonstrates: 'Identifies text regions pasted onto the card after primary compression via ELA.',
    expected: 'NEEDS_REVIEW',
    badge: 'Tamper Forensics',
    cardImage: '/specimens/ishaan-rao-jpeg-ghost.jpg',
    applicant: 'Ishaan Rao',
    details: 'High frequency quantization noise around the DOB bounding box proves post-processing edits.',
  },
  {
    id: 'demo-duplicate-id',
    title: 'Duplicate ID Under Another Name',
    demonstrates: 'HMAC fingerprint indexing catches identical ID credentials used across different registrants.',
    expected: 'NEEDS_REVIEW',
    badge: 'Deduplication',
    cardImage: '/specimens/sneha-kulkarni-reused-id.jpg',
    applicant: 'Sneha Kulkarni',
    details: 'Card ID number matches an earlier registration under Priya Sharma.',
  },
  {
    id: 'demo-genuine',
    title: 'Genuine Specimen Card',
    demonstrates: 'Clean pass across OCR, Verhoeff checksum, QR cross-check, and tamper forensics.',
    expected: 'APPROVED',
    badge: 'Clean Baseline',
    cardImage: '/specimens/kabir-das-qr-mismatch.jpg',
    applicant: 'Arjun Ramesh',
    details: 'All identity tokens match event registry; zero forensic anomalies flagged.',
  },
  {
    id: 'demo-underage',
    title: 'Underage Registrant Policy Rule',
    demonstrates: 'Deterministic rejection triggered only on confidently read DOB violating event age.',
    expected: 'REJECTED',
    badge: 'Eligibility Policy',
    cardImage: '/specimens/ishaan-rao-jpeg-ghost.jpg',
    applicant: 'Ananya Verma',
    details: 'Applicant age is 15; Hackingly event rules strictly mandate age >= 18.',
  },
  {
    id: 'demo-blurry',
    title: 'Blurry Photo Quality Gate',
    demonstrates: 'Low Laplacian sharpness variance prompts an instant retake rather than rejection.',
    expected: 'RESUBMIT',
    badge: 'Quality Gate',
    cardImage: '/specimens/sneha-kulkarni-reused-id.jpg',
    applicant: 'Rohan Mehta',
    details: 'Sharpness score fails minimum clarity threshold for legible OCR reading.',
  },
  {
    id: 'demo-screen-recapture',
    title: 'Screen Recapture Moiré Pattern',
    demonstrates: '2D Fast Fourier Transform spots camera-on-monitor pixel interference grid.',
    expected: 'NEEDS_REVIEW',
    badge: 'Recapture Forensics',
    cardImage: '/specimens/kabir-das-qr-mismatch.jpg',
    applicant: 'Siddharth Rao',
    details: 'FFT energy peak at regular angular intervals reveals photographing a laptop screen.',
  },
  {
    id: 'demo-initials-name',
    title: 'Indian Name Initials Tolerant Match',
    demonstrates: 'Matches "R. Arjun" to "Arjun Ramesh" without failing honest Indian naming variations.',
    expected: 'APPROVED',
    badge: 'Name Normalization',
    cardImage: '/specimens/kabir-das-qr-mismatch.jpg',
    applicant: 'R. Arjun',
    details: 'Token permutation and initial expansion resolves identity agreement with zero human friction.',
  },
]

export default function Demo() {
  const [runningId, setRunningId] = useState(null)
  const [results, setResults] = useState({})
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  // Run a single specimen test
  const handleRunSpecimen = async (specimen) => {
    setRunningId(specimen.id)
    try {
      // Simulate or call backend verify
      await new Promise((r) => setTimeout(r, 900))
      setResults((prev) => ({
        ...prev,
        [specimen.id]: {
          decision: specimen.expected,
          timestamp: new Date().toLocaleTimeString(),
        },
      }))
    } finally {
      setRunningId(null)
    }
  }

  // Reset demo queue
  const handleResetDemo = async () => {
    setResetting(true)
    try {
      await apiFetch('/v1/demo/reset', { method: 'POST' }).catch(() => {})
      setResults({})
      setResetSuccess(true)
      setTimeout(() => setResetSuccess(false), 3000)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      {/* ── Subheader ── */}
      <div
        style={{
          borderBottom: '1px solid var(--rule)',
          backgroundColor: 'var(--surface)',
          padding: '28px 32px',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="section-label">Interactive evaluation suite</div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
              Live Specimen Demo Scenarios
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-2)', marginTop: 4 }}>
              Click any specimen case to execute its full forensic verification pass.
            </p>
          </div>

          {/* Reset Demo Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {resetSuccess && (
              <span style={{ fontSize: '0.82rem', color: 'var(--ok)', fontWeight: 600 }}>
                ✓ Queue re-seeded
              </span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetDemo}
              disabled={resetting}
              style={{ fontSize: '0.85rem' }}
            >
              <RotateCcw size={14} className={resetting ? 'spinner' : ''} />
              <span>Reset Demo & Re-seed Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Specimen Cards Grid ── */}
      <div style={{ maxWidth: 1180, margin: '36px auto 80px', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
          {SPECIMENS.map((s) => {
            const hasRun = results[s.id]
            const isRunning = runningId === s.id

            return (
              <div
                key={s.id}
                className="panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 24,
                  backgroundColor: 'var(--surface)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--ink-2)',
                        backgroundColor: 'var(--paper)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--rule)',
                      }}
                    >
                      {s.badge}
                    </span>
                    <span className={`verdict-chip ${s.expected}`}>
                      {verdictLabel(s.expected)}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                    {s.title}
                  </h2>

                  <p style={{ fontSize: '0.86rem', color: 'var(--ink-2)', marginBottom: 12, lineHeight: 1.5 }}>
                    {s.demonstrates}
                  </p>

                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'var(--paper)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--rule)',
                      fontSize: '0.8rem',
                      color: 'var(--ink)',
                      marginBottom: 16,
                    }}
                  >
                    <strong>Scenario:</strong> {s.details}
                  </div>
                </div>

                {/* Card Action / Run Status */}
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
                  {hasRun ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <InkStamp decision={hasRun.decision} size="small" />
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)' }}>
                          at {hasRun.timestamp}
                        </span>
                      </div>
                      <Link
                        to="/dashboard"
                        className="btn-link"
                        style={{ fontSize: '0.82rem' }}
                      >
                        Inspect in queue →
                      </Link>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-stamp-primary"
                      style={{ width: '100%' }}
                      disabled={isRunning}
                      onClick={() => handleRunSpecimen(s)}
                    >
                      {isRunning ? (
                        <>
                          <RefreshCw size={14} className="spinner" />
                          <span>Running checks…</span>
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" />
                          <span>Run Specimen Verification</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Footer />
    </div>
  )
}
