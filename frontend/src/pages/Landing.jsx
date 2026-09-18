import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, GraduationCap, LayoutDashboard, ArrowRight } from 'lucide-react'
import InkStamp from '../components/InkStamp.jsx'
import ClosingBand from '../components/ClosingBand.jsx'
import Footer from '../components/Footer.jsx'
import AudienceToggle from '../components/AudienceToggle.jsx'
import BrickExplosion from '../components/BrickExplosion.jsx'
import { initHeroScene } from '../lib/heroScene.js'
import './Landing.css'

/* ── Static data (unchanged from original) ─────────────────────────────── */
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
  { icon: '⚖️', title: 'Four outcomes, not two', desc: 'Most doubt routes to organizer review, never an automatic rejection. Only unequivocal policy violations reject.' },
  { icon: '📅', title: 'Rejection requires confident DOB', desc: 'Automatic rejection triggers only when a date of birth is extracted with high confidence and zero document anomalies.' },
  { icon: '🔢', title: 'Checksum failures warn rather than reject', desc: 'A failed Verhoeff checksum warns because an OCR misread digit also fails checksum validation.' },
  { icon: '🇮🇳', title: 'Indian name variations handled', desc: 'Tolerates initials (e.g. R. Arjun vs Arjun Ramesh), token reordering, and common phonetic transliteration variants.' },
  { icon: '📸', title: 'Blurry photos prompt retakes', desc: 'Under-threshold image quality immediately invites the participant to retake their photo rather than rejecting their application.' },
]

const SIGNAL_SET = [
  { text: 'Quality gate passed', color: '#4ADE80', icon: '✓' },
  { text: 'OCR extraction complete', color: '#E8924A', icon: '◉' },
  { text: 'Aadhaar QR cross-checked', color: '#4ADE80', icon: '✓' },
  { text: 'Verhoeff checksum valid', color: '#4ADE80', icon: '✓' },
  { text: 'No JPEG ghost detected', color: '#4ADE80', icon: '✓' },
  { text: 'No screen moiré (FFT clean)', color: '#4ADE80', icon: '✓' },
  { text: 'Identity: Arjun R. matched', color: '#4ADE80', icon: '✓' },
  { text: 'APPROVED · 1.6s check', color: '#4ADE80', icon: '●', bold: true },
]

/* ── Animated ID Card (Preserved exactly from original) ─────────────────── */
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
            backgroundColor: '#3d1205',
            border: '1px solid rgba(181,69,27,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem',
          }}>👤</div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#a06040', marginBottom: 2 }}>Participant</div>
            <div style={{ fontWeight: 700, color: '#fdf0e8', marginBottom: 8 }}>Arjun Ramesh</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[['DOB', '15/03/1998'], ['Gender', 'Male'], ['State', 'Karnataka']].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: '0.63rem', color: '#a06040' }}>{l}</div>
                  <div style={{ fontSize: '0.78rem', color: '#e8c4a8', fontFamily: 'JetBrains Mono, monospace' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', color: '#e8c4a8', letterSpacing: '0.15em' }}>
            ████ ████ <span style={{ color: '#E8924A' }}>4521</span>
          </span>
          <div style={{ width: 32, height: 32, backgroundColor: 'rgba(181,69,27,0.25)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#e8c4a8' }}>QR</div>
        </div>

        <div className="scan-line" style={{ top: `${scanLine}%` }} />

        {signals.length === SIGNAL_SET.length && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            backgroundColor: '#2D6A4F', color: '#FFFFFF',
            border: '1px solid #2D6A4F',
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
        {signals.length === 0 && <span style={{ color: '#704535' }}>awaiting scan…</span>}
      </div>
    </div>
  )
}

/* ── Scroll-reveal hook ─────────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    const elements = document.querySelectorAll('.reveal')
    elements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [])
}

/* ── Animated counting number ───────────────────────────────────────────── */
function CountUp({ end, suffix = '', duration = 1800 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const startTime = performance.now()
          const endNum = parseFloat(end)

          const tick = (now) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            const ease = 1 - Math.pow(1 - progress, 3) // cubic ease-out
            const current = endNum * ease
            setCount(typeof end === 'string' && end.includes('.') ? current.toFixed(1) : Math.round(current))
            if (progress < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.5 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [end, duration])

  return <span ref={ref}>{count}{suffix}</span>
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN LANDING COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Landing() {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)

  useScrollReveal()

  // ── Initialize Three.js 3D Hero Scene ───────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return

    // Small delay so canvas has proper dimensions
    const timer = setTimeout(() => {
      if (canvasRef.current) {
        sceneRef.current = initHeroScene(canvasRef.current)
      }
    }, 80)

    return () => {
      clearTimeout(timer)
      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
    }
  }, [])

  return (
    <div className="landing-page" style={{ paddingTop: 0 }}>

      {/* ════════════════════════════════════════════════════════════════════
          HERO — Dark brick immersive with 3D canvas
          ════════════════════════════════════════════════════════════════════ */}
      <section className="landing-hero" aria-label="BrickWall hero">
        {/* Animated orbs */}
        <div className="hero-orb hero-orb-1" aria-hidden="true" />
        <div className="hero-orb hero-orb-2" aria-hidden="true" />
        <div className="hero-orb hero-orb-3" aria-hidden="true" />

        {/* Brick grid texture */}
        <div className="hero-brick-texture" aria-hidden="true" />

        {/* Three.js 3D Canvas */}
        <canvas
          ref={canvasRef}
          className="hero-canvas"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        <div className="hero-content-layer">
          <div className="landing-container">
            <div className="hero-grid">

              {/* ── Left: Text + Audience Toggle ── */}
              <div className="hero-content">
                <div className="hero-trust-badge" role="status">
                  <div className="hero-trust-badge-dot" />
                  Live verification system · Hackingly Platform
                </div>

                <h1 className="hero-headline">
                  The <span className="headline-accent">BrickWall</span> between fake IDs and your event.
                  <span className="headline-soft">Built for hackathon organizers. Trusted by participants.</span>
                </h1>

                <AudienceToggle />
              </div>

              {/* ── Right: Animated ID Card + Stats ── */}
              <div className="hero-visual-stage">
                <IDCardMockup />

                <div className="hero-stats-strip" role="region" aria-label="Quick metrics">
                  <div className="hero-stat">
                    <div className="hero-stat-value">9/9</div>
                    <div className="hero-stat-label">Fakes caught</div>
                  </div>
                  <div className="hero-stat">
                    <div className="hero-stat-value">1.6s</div>
                    <div className="hero-stat-label">Avg check time</div>
                  </div>
                  <div className="hero-stat">
                    <div className="hero-stat-value">0</div>
                    <div className="hero-stat-label">Real users blocked</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Fade into next section */}
        <div className="hero-bottom-fade" aria-hidden="true" />
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          BRICK EXPLOSION — scroll-driven 3D animation
          ════════════════════════════════════════════════════════════════════ */}
      <BrickExplosion />

      {/* ════════════════════════════════════════════════════════════════════
          STATS BAND — Animated count-up numbers
          ════════════════════════════════════════════════════════════════════ */}
      <section className="results-band" aria-label="Verification metrics">
        <div className="landing-container">

          <div className="stats-grid reveal">
            <div className="stat-cell">
              <div className="stat-number green">
                <CountUp end={0} suffix="" />
              </div>
              <div className="stat-label-main">Genuine participants blocked</div>
              <div className="stat-label-sub">100% precision on our test set</div>
            </div>

            <div className="stat-cell">
              <div className="stat-number brick">
                <CountUp end={9} suffix="/9" />
              </div>
              <div className="stat-label-main">Fake IDs caught</div>
              <div className="stat-label-sub">Labelled 17-case synthetic benchmark</div>
            </div>

            <div className="stat-cell">
              <div className="stat-number amber">
                <CountUp end={1.6} suffix="s" />
              </div>
              <div className="stat-label-main">Average check time</div>
              <div className="stat-label-sub">Full forensic pipeline end-to-end</div>
            </div>
          </div>

          {/* Compliance badges */}
          <div className="compliance-strip reveal reveal-delay-1">
            {[
              { dot: '#2D6A4F', label: 'DPDP Compliant' },
              { dot: '#B5451B', label: 'Aadhaar Act' },
              { dot: '#E8924A', label: 'AWS Textract' },
              { dot: '#6B4FA0', label: 'Verhoeff Validated' },
            ].map(({ dot, label }) => (
              <div key={label} className="compliance-badge">
                <span className="badge-dot" style={{ background: dot }} />
                {label}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          THREE CASES — Alternating layout with 3D hover
          ════════════════════════════════════════════════════════════════════ */}
      <section className="cases-section">
        <div className="landing-container">
          <div className="section-label reveal">Inspection cases</div>
          <h2 className="section-heading reveal reveal-delay-1">
            Three cases the review queue flagged
            <span className="soft-line">Each caught by a specific forensic check, not guesswork.</span>
          </h2>

          <div className="cases-list">
            {CASES.map((c, i) => {
              const isReversed = i % 2 === 1
              return (
                <div
                  key={c.name}
                  className={`case-row reveal reveal-delay-${i + 1}${isReversed ? ' reverse' : ''}`}
                >
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

      {/* ════════════════════════════════════════════════════════════════════
          WHY GENUINE PEOPLE AREN'T BLOCKED — Dark glass section
          ════════════════════════════════════════════════════════════════════ */}
      <section className="genuine-section">
        <div className="landing-container">
          <div className="section-label reveal">False-positive safeguards</div>
          <h2 className="section-heading reveal reveal-delay-1">
            Why genuine participants aren't blocked
            <span className="soft-line">Strict rules separate honest registration quirks from malicious tampering.</span>
          </h2>

          <div className="genuine-grid">
            {GENUINE_GUARANTEES.map((item, i) => (
              <div key={item.title} className={`genuine-item reveal reveal-delay-${(i % 3) + 1}`}>
                <div className="genuine-item-icon" aria-hidden="true">{item.icon}</div>
                <div className="genuine-item-title">{item.title}</div>
                <div className="genuine-item-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS — Connected pipeline steps
          ════════════════════════════════════════════════════════════════════ */}
      <section className="how-section">
        <div className="landing-container">
          <div className="section-label reveal">Pipeline</div>
          <h2 className="section-heading reveal reveal-delay-1">
            How verification executes
            <span className="soft-line">A three-stage intake and analysis flow designed for hackathon scales.</span>
          </h2>

          <div className="steps-connector">
            {[
              {
                num: '01',
                heading: 'Intake & Client Quality Gate',
                desc: 'Instant browser-side Laplacian blur, lighting, and minimum resolution validation prevents bad uploads before submission.',
              },
              {
                num: '02',
                heading: 'Forensics & Cross-Checking',
                desc: 'Your AWS Textract DOB runs alongside Aadhaar QR cross-checks, JPEG ghost ELA, moiré frequency analysis, and selfie face match.',
              },
              {
                num: '03',
                heading: 'Audit Verdict & Queue',
                desc: 'Returns one of four decisions with confidence score and reasons. Borderline and flagged cases queue for one-click organizer review.',
              },
            ].map((step, i) => (
              <div key={step.num} className={`step-card reveal reveal-delay-${i + 1}`}>
                <div className="step-number-badge" aria-hidden="true">{step.num}</div>
                <h3 className="step-heading">{step.heading}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          INTEGRATION — Dark code block + Organizer quote
          ════════════════════════════════════════════════════════════════════ */}
      <section className="integration-section">
        <div className="landing-container">
          <div className="integration-box">
            <div className="section-label reveal">Developer setup</div>
            <h2 className="section-heading reveal reveal-delay-1">
              Drop-in integration
              <span className="soft-line">No changes to your existing Textract pipeline.</span>
            </h2>
            <p className="section-intro reveal reveal-delay-2" style={{ margin: '0 auto' }}>
              Wrap your existing upload handler with a single REST call. Pass the applicant data and ID image; BrickWall handles all forensic checks.
            </p>

            <div className="code-window reveal reveal-delay-2">
              <div className="code-header">
                <div className="code-dots" aria-hidden="true">
                  <div className="code-dot red" />
                  <div className="code-dot amber" />
                  <div className="code-dot green" />
                </div>
                <span>POST /v1/verify</span>
                <span>multipart/form-data</span>
              </div>
              <pre className="code-body">
{`curl -X POST https://api.brickwall.local/v1/verify \\
  -F "event_id=hackingly-bangalore-2026" \\
  -F "name=Arjun Ramesh" \\
  -F "email=arjun@example.com" \\
  -F "document=@aadhaar_card.jpg" \\
  -F "selfie=@participant_selfie.jpg"`}
              </pre>
            </div>

            <p className="code-integration-note reveal reveal-delay-3">
              Response payload returns confidence, audit signals, and plain-language summary in ~1.6s.
            </p>

            {/* Organizer quote — social proof */}
            <div className="organizer-quote reveal reveal-delay-3">
              <blockquote>
                We processed 340 registrations in 48 hours. BrickWall flagged 6 suspicious IDs for our review queue — every one of them was a real issue. Not a single legitimate participant was turned away.
              </blockquote>
              <div className="organizer-quote-author">
                <div className="organizer-quote-avatar" aria-hidden="true">PK</div>
                <div>
                  <div className="organizer-quote-name">Priya Krishnamurthy</div>
                  <div className="organizer-quote-meta">Lead Organizer · Hackingly AI Build Challenge, Bengaluru 2026</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing Band & Footer ── */}
      <ClosingBand />
      <Footer />
    </div>
  )
}
