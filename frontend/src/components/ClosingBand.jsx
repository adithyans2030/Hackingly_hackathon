import React from 'react'
import { Link } from 'react-router-dom'

export default function ClosingBand() {
  return (
    <section
      style={{
        background: 'linear-gradient(140deg, #120604 0%, #1e0a05 50%, #2a1208 100%)',
        padding: '96px 0',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderTop: '1px solid rgba(181, 69, 27, 0.2)',
      }}
    >
      {/* Background brick texture */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(181, 69, 27, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(181, 69, 27, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Glow orb */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 300,
          background: 'radial-gradient(ellipse, rgba(181, 69, 27, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(40px)',
        }}
      />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <p style={{
          fontSize: '0.82rem',
          color: 'rgba(232, 146, 74, 0.8)',
          marginBottom: 16,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}>
          Ready to run your registration checks
        </p>

        <h2 style={{
          fontSize: '2.2rem',
          color: '#fdf0e8',
          fontWeight: 800,
          lineHeight: 1.2,
          marginBottom: 12,
          letterSpacing: '-0.025em',
          fontFamily: 'var(--font-sans)',
        }}>
          Verify participant identity before your hackathon begins.
          <span style={{ display: 'block', fontWeight: 400, color: 'rgba(220, 185, 162, 0.7)', fontSize: '1.1rem', marginTop: 8 }}>
            No genuine participants blocked. No fraudulent entries through.
          </span>
        </h2>

        {/* Two audience CTAs */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 36 }}>
          <Link
            to="/verify"
            id="closing-cta-student"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '13px 28px',
              background: 'linear-gradient(135deg, #B5451B, #C9613A)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.95rem',
              borderRadius: '4px',
              textDecoration: 'none',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              boxShadow: '0 4px 20px rgba(181, 69, 27, 0.45)',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(181,69,27,0.6)' }}
            onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(181, 69, 27, 0.45)' }}
          >
            🎓 Students — Verify your ID
          </Link>

          <Link
            to="/dashboard"
            id="closing-cta-organizer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 28px',
              background: 'rgba(181, 69, 27, 0.1)',
              color: '#E8924A',
              fontWeight: 600,
              fontSize: '0.95rem',
              borderRadius: '4px',
              textDecoration: 'none',
              border: '1px solid rgba(181, 69, 27, 0.35)',
              transition: 'background 0.2s ease, border-color 0.2s ease',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(181, 69, 27, 0.18)'; e.currentTarget.style.borderColor = 'rgba(181,69,27,0.6)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(181, 69, 27, 0.1)'; e.currentTarget.style.borderColor = 'rgba(181,69,27,0.35)' }}
          >
            🏛️ Organizers — Open dashboard
          </Link>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'rgba(220, 185, 162, 0.45)', marginTop: 28 }}>
          Uses specimen cards for demo. No real data stored beyond your event window.
        </p>
      </div>
    </section>
  )
}
