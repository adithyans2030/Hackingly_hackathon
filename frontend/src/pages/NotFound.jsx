import React from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer.jsx'

export default function NotFound() {
  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: 'var(--paper, #F2F4F7)' }}>
      <div style={{ maxWidth: 580, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
        <div className="section-label">404 Error</div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--ink, #16213A)', marginBottom: 12 }}>
          Document Record Not Found
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--ink-2, #4A5470)', marginBottom: 28, lineHeight: 1.6 }}>
          The verification ID or route you requested does not exist in the TrustGate registry. Please check the URL or return to the review dashboard.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Link to="/" className="btn-stamp-primary">
            Return to Homepage
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            View Review Queue
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}
