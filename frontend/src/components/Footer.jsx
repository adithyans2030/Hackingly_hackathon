import React from 'react'
import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: '#0d0402',
        borderTop: '1px solid rgba(181, 69, 27, 0.18)',
        padding: '64px 0 40px',
        color: '#fdf0e8',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 40,
          marginBottom: 48,
        }}>
          {/* Brand Column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 4,
                background: 'linear-gradient(135deg, #B5451B, #E8924A)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(181, 69, 27, 0.4)',
              }}>
                <Layers size={16} strokeWidth={2.5} />
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em', color: '#fdf0e8' }}>
                BrickWall
              </span>
            </div>
            <p style={{
              fontSize: '0.85rem',
              color: 'rgba(220, 185, 162, 0.65)',
              lineHeight: 1.55,
              maxWidth: 260,
              marginBottom: 16,
            }}>
              Identity and eligibility verification for Hackingly registrations. Wraps AWS Textract with zero pipeline disruption.
            </p>
            <div style={{ fontSize: '0.75rem', color: 'rgba(181, 69, 27, 0.7)' }}>
              Built for Hackingly Platform
            </div>
          </div>

          {/* Product Column */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E8924A', marginBottom: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Product
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              {[
                { to: '/verify',    label: 'Verify an ID' },
                { to: '/dashboard', label: 'Review Queue Dashboard' },
                { to: '/metrics',   label: 'Test Set Metrics' },
                { to: '/demo',      label: 'Interactive Live Demo' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} style={{ color: 'rgba(220, 185, 162, 0.65)', textDecoration: 'none', transition: 'color 0.15s ease' }}
                    onMouseOver={e => e.currentTarget.style.color = '#E8924A'}
                    onMouseOut={e => e.currentTarget.style.color = 'rgba(220, 185, 162, 0.65)'}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Forensics Column */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E8924A', marginBottom: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Forensic Pipeline
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'rgba(220, 185, 162, 0.65)' }}>
              <li>Aadhaar QR Cross-Checking</li>
              <li>JPEG Ghost &amp; ELA Forensics</li>
              <li>Screen Moiré &amp; FFT Analysis</li>
              <li>HMAC Duplicate ID Detection</li>
              <li>Side-by-Side Face Matching</li>
            </ul>
          </div>

          {/* Compliance Column */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E8924A', marginBottom: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Data &amp; Standards
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'rgba(220, 185, 162, 0.65)' }}>
              <li>DPDP Data Minimisation</li>
              <li>Masked ID Storage (Aadhaar Act)</li>
              <li>Post-Event Ephemeral Purge</li>
              <li>Labelled 17-Case Synthetic Benchmark</li>
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{
          borderTop: '1px solid rgba(181, 69, 27, 0.18)',
          paddingTop: 24,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          fontSize: '0.8rem',
          color: 'rgba(220, 185, 162, 0.4)',
        }}>
          <div>
            © {new Date().getFullYear()} BrickWall. All test metrics cited are from the 17-case labelled synthetic test set.
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <span>DPDP Compliant</span>
            <span style={{ color: 'rgba(181,69,27,0.4)' }}>·</span>
            <span>Hackingly Wrapper</span>
            <span style={{ color: 'rgba(181,69,27,0.4)' }}>·</span>
            <span>Version 1.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
