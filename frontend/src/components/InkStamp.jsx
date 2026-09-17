import React from 'react'
import { VERDICT } from '../lib/verdict.js'

// Decorative extras that aren't part of the shared VERDICT map (label/color
// come from there instead, so this stamp can't drift from the rest of the UI).
const STAMP_EXTRA = {
  APPROVED:     { borderStyle: 'solid',  subtext: 'GENUINE · IDENTITY VERIFIED' },
  NEEDS_REVIEW: { borderStyle: 'dashed', subtext: 'FLAGGED · HUMAN REVIEW REQ' },
  REJECTED:     { borderStyle: 'solid',  subtext: 'POLICY CHECK FAILED' },
  RESUBMIT:     { borderStyle: 'dashed', subtext: 'QUALITY ISSUE · RETAKE REQ' },
}

export default function InkStamp({ decision = 'APPROVED', size = 'normal', rotation = -7, className = '' }) {
  const normKey = (decision || '').toUpperCase()
  const verdict = VERDICT[normKey] || VERDICT.NEEDS_REVIEW
  const extra = STAMP_EXTRA[normKey] || STAMP_EXTRA.NEEDS_REVIEW
  const config = { label: verdict.label.toUpperCase(), color: verdict.color, ...extra }

  const isSmall = size === 'small'
  const isLarge = size === 'large'

  const padding = isSmall ? '2px 8px' : isLarge ? '8px 20px' : '4px 14px'
  const fontSize = isSmall ? '0.75rem' : isLarge ? '1.25rem' : '0.95rem'
  const subFontSize = isSmall ? '0.55rem' : isLarge ? '0.7rem' : '0.62rem'
  const borderWidth = isSmall ? '1.5px' : isLarge ? '3px' : '2px'

  return (
    <div
      className={`ink-verdict-stamp ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
        color: config.color,
        border: `${borderWidth} ${config.borderStyle} ${config.color}`,
        borderRadius: '4px',
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        userSelect: 'none',
        lineHeight: 1.1,
        letterSpacing: '0.08em',
        fontFamily: 'monospace, "JetBrains Mono", sans-serif',
        boxShadow: `inset 0 0 0 1px ${config.color}`,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        textTransform: 'uppercase',
      }}
      aria-label={`Verdict Stamp: ${config.label}`}
    >
      <span style={{ fontWeight: 800, fontSize, letterSpacing: '0.12em' }}>
        {config.label}
      </span>
      <span
        style={{
          fontSize: subFontSize,
          fontWeight: 600,
          opacity: 0.85,
          marginTop: 2,
          letterSpacing: '0.06em',
        }}
      >
        {config.subtext}
      </span>
    </div>
  )
}
