import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import InkStamp from '../components/InkStamp.jsx'
import ClosingBand from '../components/ClosingBand.jsx'
import Footer from '../components/Footer.jsx'
import './Landing.css'

const CASES = [
  {
    name: 'Kabir Das',
    type: 'QR Mismatch',
    file: '/specimens/kabir-das-qr-mismatch.jpg',
    alt: 'Specimen Aadhaar card for Kabir Das showing discrepancy between printed DOB and encoded QR data',
    sentence: "The printed date of birth doesn't match the Aadhaar QR.",
    verdict: 'NEEDS_REVIEW',
  },
  {
    name: 'Ishaan Rao',
    type: 'Tamper Forensics',
    file: '/specimens/ishaan-rao-jpeg-ghost.jpg',
    alt: 'Specimen Aadhaar card for Ishaan Rao with JPEG ghost compression trace anomaly',
    sentence: 'The date lacks the compression trace the rest of the card carries — pasted in later.',
    verdict: 'NEEDS_REVIEW',
  },
  {
    name: 'Sneha Kulkarni',
    type: 'Duplicate ID Number',
    file: '/specimens/sneha-kulkarni-reused-id.jpg',
    alt: 'Specimen Aadhaar card for Sneha Kulkarni showing duplicate registration fingerprint',
    sentence: 'The same ID is already on file, under a different name.',
    verdict: 'NEEDS_REVIEW',
  },
]

const GENUINE_GUARANTEES = [
  {
    title: 'Four outcomes, not two',
    desc: 'Most doubt routes to organizer review, never an automatic rejection. Only unequivocal policy violations reject.',
  },
  {
    title: 'Rejection requires confident DOB',
    desc: 'Automatic rejection triggers only when a date of birth is extracted with high confidence and zero document anomalies.',
  },
  {
    title: 'Checksum failures warn rather than reject',
    desc: 'A failed Verhoeff checksum warns because an OCR misread digit also fails checksum validation.',
  },
  {
    title: 'Indian name variations handled',
    desc: 'Tolerates initials (e.g. R. Arjun vs Arjun Ramesh), token reordering, and common phonetic transliteration variants.',
  },
  {
    title: 'Blurry photos prompt retakes',
    desc: 'Under-threshold image quality immediately invites the participant to retake their photo rather than rejecting their application.',
  },
]

const SIGNAL_SET = [
  { text: 'Quality gate passed', color: '#4ADE80', icon: '✓' },
  { text: 'OCR extraction complete', color: '#A5B4FC', icon: '◉' },
  { text: 'Aadhaar QR cross-checked', color: '#4ADE80', icon: '✓' },
  { text: 'Verhoeff checksum valid', color: '#4ADE80', icon: '✓' },
  { text: 'No JPEG ghost detected', color: '#4ADE80', icon: '✓' },
  { text: 'No screen moiré (FFT clean)', color: '#4ADE80', icon: '✓' },
  { text: 'Identity: Arjun R. matched', color: '#4ADE80', icon: '✓' },
  { text: 'APPROVED · 1.6s check', color: '#4ADE80', icon: '●', bold: true },
]

function IDCardMockup() {
  const [scanLine, setScanLine] = useState(0)
  const [signals, setSignals] = useState([])

  useEffect(() => {
    let line = 0
    let timeoutIds = []

    const runPass = () => {
      timeoutIds.forEach(clearTimeout)
      timeoutIds = []
      setSignals([])
      SIGNAL_SET.forEach((sig, i) => {
        const id = setTimeout(() => setSignals(prev => [...prev, sig]), 400 + i * 220)
        timeoutIds.push(id)
      })
    }

    const intervalId = setInterval(() => {
      line += 1.2
      if (line > 100) {
        line = 0
        runPass()
      }
      setScanLine(line)
    }, 20)

    runPass()

    return () => {
      clearInterval(intervalId)
      timeoutIds.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="id-card-mock">
      <div className="card-body">
        <div className="card-header">
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.12em', color: '#fff' }}>SPECIMEN AADHAAR</span>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'JetBrains Mono, monospace' }}>TEST HARNESS</span>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 60, height: 72, borderRadius: 6, flexShrink: 0,
            backgroundColor: '#2447B8',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem',
          }}>👤</div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#8892b0', marginBottom: 2 }}>Participant</div>
            <div style={{ fontWeight: 700, color: '#f0f2ff', marginBottom: 8 }}>Arjun Ramesh</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[['DOB', '15/03/1998'], ['Gender', 'Male'], ['State', 'Karnataka']].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: '0.63rem', color: '#8892b0' }}>{l}</div>
                  <div style={{ fontSize: '0.78rem', color: '#c7cee3', fontFamily: 'JetBrains Mono, monospace' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: '#c7cee3', letterSpacing: '0.15em' }}>
            ████ ████ <span style={{ color: '#8FB6FF' }}>4521</span>
          </span>
          <div style={{ width: 32, height: 32, backgroundColor: 'rgba(110,161,255,0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#c7cee3' }}>QR</div>
        </div>

        <div className="scan-line" style={{ top: `${scanLine}%` }} />

        {signals.length === SIGNAL_SET.length && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            backgroundColor: '#1C7C54', color: '#FFFFFF',
            border: '1px solid #1C7C54',
            borderRadius: 4, padding: '3px 8px',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
            transform: 'rotate(-6deg)',
          }}>✓ APPROVED</div>
        )}
      </div>

      <div className="signal-panel">
        {signals.map((s, i) => (
          <div key={i} style={{ color: s.color, display: 'flex', gap: 8, marginBottom: 4, fontWeight: s.bold ? 700 : 400 }}>
            <span style={{ opacity: 0.7 }}>{s.icon}</span>
            <span>{s.text}</span>
          </div>
        ))}
        {signals.length === 0 && <span style={{ color: '#6b7490' }}>awaiting scan…</span>}
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="landing-page" style={{ paddingTop: 60 }}>
      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="hero-grid">
            <div className="hero-content">
              <div className="hero-audience-tag">
                For organizers running Hackingly registrations
              </div>

              <h1 className="hero-headline">
                Catch fake and reused IDs before your event starts.
                <span className="headline-soft">Without blocking real participants.</span>
              </h1>

              <p className="hero-paragraph">
                TrustGate wraps your existing AWS Textract date-of-birth pipeline without changing it,
                and adds Aadhaar QR cross-checks, tamper forensics, duplicate detection, and face matching.
              </p>

              <div className="hero-cta-group">
                <Link to="/verify" className="btn-stamp-primary">
                  Verify an ID
                </Link>
                <Link to="/demo" className="btn-link">
                  See live demo
                </Link>
              </div>

              <div className="hero-specimen-note">
                Use a specimen card if you'd rather not upload your own ID.
              </div>
            </div>

            <div className="hero-visual-stage">
              <IDCardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── RESULTS BAND (Hard Stop) ────────────────────────────────────── */}
      <section className="results-band">
        <div className="landing-container">
          <div className="results-quiet-line">
            0 genuine participants blocked · 9 of 9 fakes caught · 1.6s average check
          </div>
          <div className="results-caveat">
            Measured on our 17-case labelled test set.
          </div>
        </div>
      </section>

      {/* ── THREE CASES (Alternating Wide Visual / Narrow Text) ──────────── */}
      <section className="cases-section">
        <div className="landing-container">
          <div className="section-label">Inspection cases</div>
          <h2 className="section-heading">
            Three cases the review queue flagged
            <span className="soft-line">Each caught by a specific forensic check, not guesswork.</span>
          </h2>

          <div className="cases-list">
            {CASES.map((c, i) => {
              const isReversed = i % 2 === 1
              return (
                <div key={c.name} className={`case-row${isReversed ? ' reverse' : ''}`}>
                  <div className="case-image-wrap">
                    <img src={c.file} alt={c.alt} loading="lazy" />
                  </div>
                  <div className="case-text-block">
                    <span className="case-tag">{c.type}</span>
                    <h3 className="case-title">{c.name}</h3>
                    <p className="case-sentence">{c.sentence}</p>
                    <div className="case-stamp-row">
                      <InkStamp decision={c.verdict} size="small" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── WHY GENUINE PEOPLE AREN'T BLOCKED ──────────────────────────── */}
      <section className="genuine-section">
        <div className="landing-container">
          <div className="section-label">False-positive safeguards</div>
          <h2 className="section-heading">
            Why genuine participants aren't blocked
            <span className="soft-line">Strict rules separate honest registration quirks from malicious tampering.</span>
          </h2>

          <div className="genuine-grid">
            {GENUINE_GUARANTEES.map((item) => (
              <div key={item.title} className="genuine-item">
                <div className="genuine-item-title">{item.title}</div>
                <div className="genuine-item-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="how-section">
        <div className="landing-container">
          <div className="section-label">Pipeline</div>
          <h2 className="section-heading">
            How verification executes
            <span className="soft-line">A three-stage intake and analysis flow designed for hackathon scales.</span>
          </h2>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-heading">Intake & Client Quality Gate</h3>
              <p className="step-desc">
                Instant browser-side Laplacian blur, lighting, and minimum resolution validation prevents bad uploads before submission.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-heading">Forensics & Cross-Checking</h3>
              <p className="step-desc">
                Your AWS Textract DOB runs alongside Aadhaar QR cross-checks, JPEG ghost ELA, moiré frequency analysis, and selfie face match.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-heading">Audit Verdict & Queue</h3>
              <p className="step-desc">
                Returns one of four decisions with confidence score and reasons. Borderline and flagged cases queue for one-click organizer review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTEGRATION ─────────────────────────────────────────────────── */}
      <section className="integration-section">
        <div className="landing-container">
          <div className="integration-box">
            <div className="section-label">Developer setup</div>
            <h2 className="section-heading">
              Drop-in integration
              <span className="soft-line">No changes to your existing Textract pipeline.</span>
            </h2>
            <p className="section-intro" style={{ margin: '0 auto' }}>
              Wrap your existing upload handler with a single REST call. Pass the applicant data and ID image; TrustGate handles all forensic checks.
            </p>

            <div className="code-window">
              <div className="code-header">
                <span>POST /v1/verify</span>
                <span>multipart/form-data</span>
              </div>
              <pre className="code-body">
{`curl -X POST https://api.trustgate.local/v1/verify \\
  -F "event_id=hackingly-bangalore-2026" \\
  -F "name=Arjun Ramesh" \\
  -F "email=arjun@example.com" \\
  -F "document=@aadhaar_card.jpg" \\
  -F "selfie=@participant_selfie.jpg"`}
              </pre>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--ink-2, #4A5470)' }}>
              Response payload returns confidence, audit signals, and plain-language summary in ~1.6s.
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING BAND & FOOTER ───────────────────────────────────────── */}
      <ClosingBand />
      <Footer />
    </div>
  )
}
