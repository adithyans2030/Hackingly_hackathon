import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import CaseDetailView from '../components/CaseDetailView.jsx'
import Footer from '../components/Footer.jsx'

export default function CaseDetail() {
  const { id } = useParams()
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reviewLoading, setReviewLoading] = useState(false)

  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true)
      try {
        const data = await apiFetch(`/v1/verifications/${id}`)
        setCaseData(data)
      } catch {
        // Fallback specimen mock if backend doesn't have this ID
        setCaseData({
          id: id || 'case-specimen',
          name: 'Kabir Das',
          doc_type: 'aadhaar',
          created_at: new Date().toISOString(),
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
            ],
            duplicates: [],
          },
        })
      } finally {
        setLoading(false)
      }
    }

    fetchCase()
  }, [id])

  const handleReview = async (decision, note) => {
    setReviewLoading(true)
    try {
      await apiFetch(`/v1/verifications/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note, reviewer: 'Organizer' }),
      })
    } catch {}

    setCaseData((prev) =>
      prev ? { ...prev, final_decision: decision, review_note: note } : prev
    )
    setReviewLoading(false)
  }

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      <div style={{ maxWidth: 1080, margin: '24px auto 60px', padding: '0 24px' }}>
        <div style={{ marginBottom: 20 }}>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.88rem',
              color: 'var(--stamp)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to review queue</span>
          </Link>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <RefreshCw size={24} className="spinner" />
            <div>Loading case #{id}…</div>
          </div>
        ) : (
          <CaseDetailView
            verification={caseData}
            onReviewSubmit={handleReview}
            reviewLoading={reviewLoading}
            isStandalone={true}
          />
        )}
      </div>

      <Footer />
    </div>
  )
}
