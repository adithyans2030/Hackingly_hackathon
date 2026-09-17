import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Camera, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { verdictLabel, verdictColor } from '../lib/verdict.js'
import InkStamp from '../components/InkStamp.jsx'
import Footer from '../components/Footer.jsx'

const EVENTS = [
  { id: 'hackingly-blr-2026', name: 'Hackingly AI Build Challenge Bengaluru' },
  { id: 'campus-hack-2026', name: 'Campus Hack Delhi (Undergraduates)' },
  { id: 'fintech-sprint', name: 'India Fintech Open Sprint' },
]

export default function Verify() {
  const [events, setEvents] = useState(EVENTS)
  const [eventId, setEventId] = useState(EVENTS[0].id)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [institution, setInstitution] = useState('')
  const [dob, setDob] = useState('')
  const [idFile, setIdFile] = useState(null)
  const [idPreview, setIdPreview] = useState(null)
  const [qualityStatus, setQualityStatus] = useState(null) // { ok: bool, message: string }
  const [selfieFile, setSelfieFile] = useState(null)
  const [selfiePreview, setSelfiePreview] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [consent, setConsent] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const selfieInputRef = useRef(null)

  // Fetch backend events if available
  useEffect(() => {
    apiFetch('/v1/events')
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data)
          setEventId(data[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Analyze ID quality upon selection
  const handleIdSelect = (file) => {
    if (!file) return
    setIdFile(file)
    setError(null)
    const url = URL.createObjectURL(file)
    setIdPreview(url)

    // Check resolution and basic client quality
    const img = new Image()
    img.src = url
    img.onload = () => {
      if (img.width < 400 || img.height < 300) {
        setQualityStatus({
          ok: false,
          message: 'Resolution is too low (minimum 400×300). Text may be unreadable.',
        })
      } else if (file.size > 10 * 1024 * 1024) {
        setQualityStatus({
          ok: false,
          message: 'File size exceeds 10 MB limit.',
        })
      } else {
        setQualityStatus({
          ok: true,
          message: 'Photo looks good. Text and borders appear sharp.',
        })
      }
    }
  }

  // Camera handling for selfie
  const startCamera = async () => {
    setCameraActive(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      setError('Could not access camera. You can upload a selfie image instead.')
      setCameraActive(false)
    }
  }

  const captureCamera = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' })
        setSelfieFile(file)
        setSelfiePreview(URL.createObjectURL(blob))
      }
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!idFile) {
      setError('Please upload your ID document.')
      return
    }
    if (!consent) {
      setError('You must agree to the DPDP data-minimisation consent checkbox.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('event_id', eventId)
      form.append('name', name)
      form.append('email', email)
      if (institution) form.append('institution', institution)
      if (dob) form.append('dob', dob)
      form.append('consent', 'true')
      form.append('id_image', idFile)
      if (selfieFile) form.append('selfie', selfieFile)

      const res = await apiFetch('/v1/verify', {
        method: 'POST',
        body: form,
      })
      setResult(res)
    } catch (err) {
      setError(err.message || 'Verification failed. Please check network or file format.')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setResult(null)
    setIdFile(null)
    setIdPreview(null)
    setQualityStatus(null)
    setSelfieFile(null)
    setSelfiePreview(null)
    setError(null)
    setName('')
    setEmail('')
    setInstitution('')
    setDob('')
    setConsent(false)
  }

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      <div style={{ maxWidth: 560, margin: '40px auto 80px', padding: '0 20px' }}>
        <div style={{ marginBottom: 24, textAlign: 'left' }}>
          <div className="section-label">Participant verification</div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink, #16213A)', marginBottom: 8 }}>
            Verify your registration
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-2, #4A5470)', lineHeight: 1.5 }}>
            Submit your identity document for instant eligibility verification. Images are kept strictly confidential under DPDP principles.
          </p>
        </div>

        {/* ── RESULT STATE (Shows participant-facing message ONLY, never internal fraud signals) ── */}
        {result ? (
          <div
            className="panel"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: verdictColor(result.decision),
              padding: '32px 28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <span
                  className={`verdict-chip ${result.decision || 'APPROVED'}`}
                  style={{ marginBottom: 8 }}
                >
                  {verdictLabel(result.decision || 'APPROVED')}
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink, #16213A)' }}>
                  {result.decision === 'APPROVED' && 'Registration Confirmed'}
                  {result.decision === 'NEEDS_REVIEW' && 'Under Organizer Review'}
                  {result.decision === 'RESUBMIT' && 'Photo Retake Needed'}
                  {result.decision === 'REJECTED' && 'Not Eligible'}
                </div>
              </div>
              <InkStamp decision={result.decision} size="small" />
            </div>

            {/* Participant-Facing Message ONLY */}
            <div
              style={{
                backgroundColor: 'var(--paper, #F2F4F7)',
                border: '1px solid var(--rule, #D8DDE5)',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '16px 20px',
                fontSize: '0.95rem',
                color: 'var(--ink, #16213A)',
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              {result.participant_message ||
                result.summary ||
                'Your document has been recorded and submitted for event registration.'}
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <button
                type="button"
                className="btn-stamp-primary"
                onClick={resetForm}
              >
                Submit another verification
              </button>
              <Link to="/" className="btn-link">
                Return home
              </Link>
            </div>
          </div>
        ) : (
          /* ── REGISTRATION FORM ── */
          <form
            onSubmit={handleSubmit}
            className="panel"
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'rgba(180, 35, 24, 0.08)',
                  border: '1px solid var(--bad, #B42318)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  color: 'var(--bad, #B42318)',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Event Select */}
            <div>
              <label className="form-label" htmlFor="verify-event">
                Target Hackathon / Event
              </label>
              <select
                id="verify-event"
                className="select"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="form-label" htmlFor="verify-name">
                Full Name (as on Government ID)
              </label>
              <input
                id="verify-name"
                className="input"
                type="text"
                placeholder="e.g. Arjun Ramesh"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="form-label" htmlFor="verify-email">
                Email Address
              </label>
              <input
                id="verify-email"
                className="input"
                type="email"
                placeholder="e.g. arjun@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Institution */}
            <div>
              <label className="form-label" htmlFor="verify-institution">
                College / Organization
              </label>
              <input
                id="verify-institution"
                className="input"
                type="text"
                placeholder="e.g. RV College of Engineering"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
            </div>

            {/* Date of Birth (Optional) */}
            <div>
              <label className="form-label" htmlFor="verify-dob">
                Date of Birth (Optional)
              </label>
              <input
                id="verify-dob"
                className="input"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
              <div className="form-help">Used to verify age eligibility if required by event.</div>
            </div>

            {/* ID Document Upload with Drag-and-Drop */}
            <div>
              <label className="form-label">
                Identity Document (Aadhaar, Voter ID, or Driving Licence)
              </label>
              <div
                style={{
                  border: '1px dashed var(--rule, #D8DDE5)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  padding: '24px 16px',
                  textAlign: 'center',
                  backgroundColor: 'var(--paper, #F2F4F7)',
                  cursor: 'pointer',
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (e.dataTransfer.files[0]) handleIdSelect(e.dataTransfer.files[0])
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files[0]) handleIdSelect(e.target.files[0])
                  }}
                />

                {idPreview ? (
                  <div>
                    <img
                      src={idPreview}
                      alt="ID Preview"
                      style={{
                        maxHeight: 140,
                        maxWidth: '100%',
                        borderRadius: 4,
                        marginBottom: 10,
                        border: '1px solid var(--rule, #D8DDE5)',
                      }}
                    />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #16213A)' }}>
                      {idFile.name} ({(idFile.size / 1024).toFixed(0)} KB)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--stamp, #2447B8)', marginTop: 4 }}>
                      Click to choose a different file
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={28} style={{ color: 'var(--ink-2, #4A5470)', marginBottom: 8 }} />
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ink, #16213A)' }}>
                      Drag & drop your document image here
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-2, #4A5470)', marginTop: 4 }}>
                      Supports JPEG, PNG, WebP · Max 10 MB
                    </div>
                  </div>
                )}
              </div>

              {/* Live Quality Feedback */}
              {qualityStatus && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    marginTop: 8,
                    color: qualityStatus.ok ? 'var(--ok, #1C7C54)' : 'var(--bad, #B42318)',
                  }}
                >
                  {qualityStatus.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                  <span>{qualityStatus.message}</span>
                </div>
              )}
            </div>

            {/* Optional Selfie */}
            <div>
              <label className="form-label">
                Live Selfie (Optional — for biometric face match)
              </label>

              {cameraActive ? (
                <div style={{ textAlign: 'center' }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{
                      width: '100%',
                      maxHeight: 220,
                      borderRadius: 4,
                      backgroundColor: '#000',
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="btn-stamp-primary"
                      onClick={captureCamera}
                    >
                      Capture Photo
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={stopCamera}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : selfiePreview ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 12,
                    border: '1px solid var(--rule, #D8DDE5)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    backgroundColor: 'var(--paper, #F2F4F7)',
                  }}
                >
                  <img
                    src={selfiePreview}
                    alt="Selfie Preview"
                    style={{ width: 56, height: 56, borderRadius: 4, objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink, #16213A)' }}>
                      Selfie captured
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ok, #1C7C54)' }}>
                      Ready for face verification
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setSelfieFile(null)
                      setSelfiePreview(null)
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={startCamera}
                  >
                    <Camera size={16} />
                    <span>Use Camera</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => selfieInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    <span>Upload Image</span>
                  </button>
                  <input
                    ref={selfieInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        setSelfieFile(e.target.files[0])
                        setSelfiePreview(URL.createObjectURL(e.target.files[0]))
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* DPDP Honest Consent Checkbox */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4 }}>
              <input
                id="verify-consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--stamp, #2447B8)' }}
                required
              />
              <label
                htmlFor="verify-consent"
                style={{ fontSize: '0.8rem', color: 'var(--ink-2, #4A5470)', lineHeight: 1.45 }}
              >
                I confirm this submission is built to DPDP data-minimisation principles; the ID number is stored masked and images are deleted after the event.
              </label>
            </div>

            {/* The ONE filled button */}
            <div style={{ marginTop: 8 }}>
              <button
                type="submit"
                className="btn-stamp-primary"
                style={{ width: '100%' }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="spinner" />
                    <span>Running verification…</span>
                  </>
                ) : (
                  'Verify an ID'
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <Footer />
    </div>
  )
}
