import React from 'react'
import { Link } from 'react-router-dom'

export default function ClosingBand() {
  return (
    <section
      style={{
        borderTop: '1px solid var(--rule, #D8DDE5)',
        backgroundColor: 'var(--surface, #FFFFFF)',
        padding: '80px 0',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 24px' }}>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--ink-2, #4A5470)',
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          Ready to run your registration checks
        </p>
        <h2
          style={{
            fontSize: '2rem',
            color: 'var(--ink, #16213A)',
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: 28,
            letterSpacing: '-0.015em',
          }}
        >
          Verify participant identity and event eligibility before your hackathon begins, without blocking real entrants.
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
          <Link
            to="/verify"
            className="btn-stamp-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 28px',
              backgroundColor: 'var(--stamp, #2447B8)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.95rem',
              borderRadius: 'var(--radius-sm, 4px)',
              textDecoration: 'none',
              transition: 'background-color 0.15s ease',
            }}
          >
            Verify an ID
          </Link>
          <Link
            to="/demo"
            style={{
              fontSize: '0.95rem',
              color: 'var(--stamp, #2447B8)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            See live demo
          </Link>
        </div>
      </div>
    </section>
  )
}
