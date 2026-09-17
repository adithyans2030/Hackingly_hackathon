import React from 'react'
import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: 'var(--paper, #F2F4F7)',
        borderTop: '1px solid var(--rule, #D8DDE5)',
        padding: '64px 0 40px',
        color: 'var(--ink, #16213A)',
        fontFamily: 'var(--font-sans, "Schibsted Grotesk", sans-serif)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 40,
            marginBottom: 48,
          }}
        >
          {/* Brand Col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  backgroundColor: 'var(--ink, #16213A)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Shield size={16} strokeWidth={2.5} />
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                TrustGate
              </span>
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--ink-2, #4A5470)',
                lineHeight: 1.55,
                maxWidth: 260,
                marginBottom: 16,
              }}
            >
              Identity and eligibility verification for Hackingly registrations. Wraps AWS Textract with zero pipeline disruption.
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-2, #4A5470)' }}>
              Built for Hackingly Platform
            </div>
          </div>

          {/* Product Col */}
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--ink, #16213A)',
                marginBottom: 16,
              }}
            >
              Product
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              <li>
                <Link to="/verify" style={{ color: 'var(--ink-2, #4A5470)', textDecoration: 'none' }}>
                  Verify an ID
                </Link>
              </li>
              <li>
                <Link to="/dashboard" style={{ color: 'var(--ink-2, #4A5470)', textDecoration: 'none' }}>
                  Review Queue Dashboard
                </Link>
              </li>
              <li>
                <Link to="/metrics" style={{ color: 'var(--ink-2, #4A5470)', textDecoration: 'none' }}>
                  Test Set Metrics
                </Link>
              </li>
              <li>
                <Link to="/demo" style={{ color: 'var(--ink-2, #4A5470)', textDecoration: 'none' }}>
                  Interactive Live Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Forensics Col */}
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--ink, #16213A)',
                marginBottom: 16,
              }}
            >
              Forensic Pipeline
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'var(--ink-2, #4A5470)' }}>
              <li>Aadhaar QR Cross-Checking</li>
              <li>JPEG Ghost & ELA Forensics</li>
              <li>Screen Moiré & FFT Analysis</li>
              <li>HMAC Duplicate ID Detection</li>
              <li>Side-by-Side Face Matching</li>
            </ul>
          </div>

          {/* Compliance Col */}
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--ink, #16213A)',
                marginBottom: 16,
              }}
            >
              Data Protection & Standards
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'var(--ink-2, #4A5470)' }}>
              <li>DPDP Data Minimisation</li>
              <li>Masked ID Storage (Aadhaar Act)</li>
              <li>Post-Event Ephemeral Purge</li>
              <li>Labelled 17-Case Synthetic Benchmark</li>
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            borderTop: '1px solid var(--rule, #D8DDE5)',
            paddingTop: 24,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            fontSize: '0.8rem',
            color: 'var(--ink-2, #4A5470)',
          }}
        >
          <div>
            © {new Date().getFullYear()} TrustGate. All test metrics cited are from the 17-case labelled synthetic test set.
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <span>DPDP Compliant</span>
            <span>·</span>
            <span>Hackingly Wrapper</span>
            <span>·</span>
            <span>Version 1.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
