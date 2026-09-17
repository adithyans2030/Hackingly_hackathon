import React, { useState } from 'react'
import { Check, AlertTriangle, XCircle, Info, Eye, Layers, UserCheck } from 'lucide-react'
import InkStamp from './InkStamp.jsx'
import { ago, DOC_LABELS } from '../lib/api.js'
import { verdictColor } from '../lib/verdict.js'

function boxStyle(box) {
  return {
    position: 'absolute',
    top: `${box.top * 100}%`,
    left: `${box.left * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  }
}

export default function CaseDetailView({
  verification,
  onReviewSubmit,
  reviewLoading,
  isStandalone = false,
}) {
  const [viewMode, setViewMode] = useState('card') // 'card' | 'compression'
  const [reviewNote, setReviewNote] = useState('')

  if (!verification) {
    return (
      <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-2)' }}>
        Select a verification case from the queue to review details.
      </div>
    )
  }

  const r = verification.result || {}
  const ex = r.extracted || {}
  const signals = r.signals || []
  const finalDecision = verification.final_decision || verification.decision || 'NEEDS_REVIEW'

  // Real field names from app/pipeline/signals.py: name, category, severity, score, reason, data.
  const needsAttention = signals.filter((s) => s.severity === 'critical' || s.severity === 'warn')
  const passed = signals.filter((s) => s.severity === 'pass')
  const notes = signals.filter((s) => s.severity === 'info')
  const notChecked = signals.filter((s) => s.severity === 'skipped')

  // Duplicates: either the synthetic demo shape (result.duplicates) or a real
  // critical id_reuse/image_reuse/face_reuse signal (app/pipeline/duplicates.py).
  const duplicateSignal = signals.find(
    (s) => ['id_reuse', 'image_reuse', 'face_reuse'].includes(s.name) && s.severity === 'critical'
  )
  const syntheticDuplicates = r.duplicates || []
  const hasDuplicates = syntheticDuplicates.length > 0 || !!duplicateSignal
  const duplicateNames = syntheticDuplicates.length > 0
    ? syntheticDuplicates.map((d) => d.prior_name)
    : (duplicateSignal?.data?.matches || []).map((m) => (typeof m === 'string' ? m : m.name || m.verification_id))

  // Face match: only real if a selfie was actually submitted (app/pipeline/identity.py face_signal).
  const faceSignal = signals.find((s) => s.name === 'face_match')
  const hasFaceResult = faceSignal && faceSignal.severity !== 'skipped' && faceSignal.data?.similarity != null

  // Forensics: real bounding boxes, not fixed positions (app/pipeline/orchestrator.py field_boxes/suspicious_regions).
  const fieldBoxes = r.field_boxes || {}
  const suspiciousRegions = r.suspicious_regions || []
  const elaSignal = signals.find((s) => s.name === 'error_level_analysis')

  // Extracted fields: real values + real per-field confidence, plus the Aadhaar QR
  // reading and Verhoeff result, which live outside `extracted` in the full result.
  const fieldConfidence = ex.field_confidence || {}
  const qrInfo = r.aadhaar_qr
  const verhoeffSignal = signals.find((s) => s.name === 'id_number_valid')
  const qrMismatch = signals.some((s) => s.name === 'aadhaar_qr_match' && s.severity === 'critical')
  const extractedFields = [
    { label: 'Name on ID', val: ex.name, score: fieldConfidence.name },
    {
      label: 'Date of Birth',
      val: ex.dob || (ex.year_of_birth ? `Year only: ${ex.year_of_birth}` : null),
      score: fieldConfidence.dob,
      warn: qrMismatch,
    },
    { label: 'ID Number', val: ex.id_number, score: fieldConfidence.id_number },
    { label: 'Gender', val: ex.gender, score: null },
    { label: 'Institution', val: ex.institution, score: fieldConfidence.institution },
    qrInfo && (qrInfo.dob || qrInfo.yob)
      ? {
          label: 'Aadhaar QR date of birth',
          val: qrInfo.dob || `Year: ${qrInfo.yob}`,
          score: qrInfo.signature_verified ? 0.99 : 0.9,
          warn: qrMismatch,
        }
      : null,
    verhoeffSignal
      ? {
          label: 'Verhoeff checksum',
          val: verhoeffSignal.severity === 'pass' ? 'Valid' : 'Failed or unclear',
          score: verhoeffSignal.score,
          warn: verhoeffSignal.severity !== 'pass',
        }
      : null,
  ].filter((f) => f && f.val != null && f.val !== '')

  // Forensics images: real masked artifact URLs (app/api.py serves these under
  // /v1/verifications/{vid}/artifacts/{name}), falling back to specimen art only
  // for the synthetic demo queue, which has no backend-served artifacts at all.
  const docImage = r.artifacts?.id_masked || verification.document_url || '/specimens/kabir-das-qr-mismatch.jpg'
  const elaImage = r.artifacts?.ela || verification.ela_url

  const applicantName = verification.applicant?.name || verification.name || ex.name || 'Unknown applicant'
  const applicantEmail = verification.applicant?.email || verification.email || null
  const eventLabel = verification.event_name || verification.event_id || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Applicant Header with Rotated Ink Stamp ── */}
      <div
        className="panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 20,
          padding: '28px 24px',
          borderLeftWidth: 4,
          borderLeftColor: verdictColor(finalDecision),
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-2)', fontWeight: 500 }}>
              Case #{verification.id?.slice(0, 8) || 'SPECIMEN'}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--rule)' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>
              {ago(verification.created_at || new Date().toISOString())}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--rule)' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>
              {DOC_LABELS[verification.doc_type || ex.doc_type] || 'Unknown document'}
            </span>
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            {applicantName}
          </h2>

          <div style={{ fontSize: '0.88rem', color: 'var(--ink-2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {applicantEmail && <span>Email: <strong>{applicantEmail}</strong></span>}
            {eventLabel && <span>Event: <strong>{eventLabel}</strong></span>}
            <span>
              Confidence:{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
              </strong>
            </span>
          </div>

          {/* One-sentence summary */}
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              backgroundColor: 'var(--paper)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              color: 'var(--ink)',
              maxWidth: 680,
            }}
          >
            {r.summary || 'No summary available for this case.'}
          </div>
        </div>

        {/* Rotated Ink Verdict Stamp */}
        <div style={{ padding: '8px 12px' }}>
          <InkStamp decision={finalDecision} size="normal" rotation={-8} />
        </div>
      </div>

      {/* ── Document Inspection with Field Outlines & Compression Toggle ── */}
      <div className="panel" style={{ padding: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)' }}>
              Document Forensics View
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>
              Inspect bounding boxes and tamper compression signatures.
            </p>
          </div>

          {/* Toggle between Card and Compression Map */}
          {elaImage && (
            <div
              style={{
                display: 'inline-flex',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('card')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewMode === 'card' ? 'var(--stamp)' : 'var(--surface)',
                  color: viewMode === 'card' ? '#FFFFFF' : 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Eye size={14} />
                <span>Original Card & Fields</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compression')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  borderLeft: '1px solid var(--rule)',
                  backgroundColor: viewMode === 'compression' ? 'var(--stamp)' : 'var(--surface)',
                  color: viewMode === 'compression' ? '#FFFFFF' : 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Layers size={14} />
                <span>Compression ELA Map</span>
              </button>
            </div>
          )}
        </div>

        {/* Visual Inspection Area */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#0F1322',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 320,
          }}
        >
          {viewMode === 'card' || !elaImage ? (
            <div style={{ position: 'relative', width: '100%', maxWidth: 640 }}>
              <img
                src={docImage}
                alt="Document inspection"
                style={{ width: '100%', display: 'block', objectFit: 'contain' }}
              />

              {/* Labelled field outline — only drawn where we actually located the field */}
              {fieldBoxes.name && (
                <div
                  style={{
                    ...boxStyle(fieldBoxes.name),
                    border: '1.5px dashed #2447B8',
                    backgroundColor: 'rgba(36, 71, 184, 0.12)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: -16, left: 0, fontSize: '0.65rem',
                      backgroundColor: '#2447B8', color: '#fff', padding: '1px 4px', fontFamily: 'monospace',
                    }}
                  >
                    FIELD: NAME
                  </span>
                </div>
              )}

              {/* Suspicious regions — only the ones this case's forensics actually flagged */}
              {suspiciousRegions.map((sr, i) => sr.bbox && (
                <div
                  key={i}
                  style={{
                    ...boxStyle(sr.bbox),
                    border: '2px solid #B42318',
                    backgroundColor: 'rgba(180, 35, 24, 0.18)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: -16, left: 0, fontSize: '0.65rem',
                      backgroundColor: '#B42318', color: '#fff', padding: '1px 4px',
                      fontFamily: 'monospace', fontWeight: 700,
                    }}
                  >
                    SUSPICIOUS: {sr.field?.replace(/_/g, ' ').toUpperCase()} ({sr.why})
                  </span>
                </div>
              ))}

              {!fieldBoxes.name && suspiciousRegions.length === 0 && (
                <div
                  style={{
                    position: 'absolute', bottom: 10, left: 10, fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace',
                  }}
                >
                  No field annotations available for this document.
                </div>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', maxWidth: 640, textAlign: 'center', padding: 20 }}>
              <img
                src={elaImage}
                alt="Error level analysis"
                style={{ width: '100%', display: 'block', objectFit: 'contain' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 20,
                  right: 20,
                  backgroundColor: 'rgba(0,0,0,0.75)',
                  padding: '6px 12px',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  textAlign: 'left',
                }}
              >
                {elaSignal?.reason || 'No compression analysis available for this case.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Extracted Fields with Per-Field Confidence Meters ── */}
      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
          Extracted Fields & Confidence
        </h3>

        {extractedFields.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {extractedFields.map((field) => (
              <div
                key={field.label}
                style={{
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  backgroundColor: field.warn ? 'rgba(168, 98, 0, 0.04)' : 'var(--surface)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: 4 }}>
                  {field.label}
                </div>
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: field.warn ? 'var(--review)' : 'var(--ink)',
                    marginBottom: 8,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {field.val}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      backgroundColor: 'var(--rule)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: field.score != null ? `${field.score * 100}%` : '0%',
                        height: '100%',
                        backgroundColor: field.warn ? 'var(--review)' : 'var(--ok)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--ink-2)',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                    }}
                  >
                    {field.score != null ? `${Math.round(field.score * 100)}%` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>
            No fields could be extracted from this document.
          </div>
        )}
      </div>

      {/* ── Side-by-Side Face Comparison — only when a selfie was actually submitted ── */}
      {hasFaceResult && (
        <div className="panel" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
            Biometric Face Comparison
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 100, height: 120, backgroundColor: 'var(--paper)', border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: 6,
                }}
              >
                👤
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>ID Document Crop</div>
            </div>

            {(() => {
              const sim = faceSignal.data.similarity
              const color = faceSignal.severity === 'pass' ? 'var(--ok)'
                : faceSignal.severity === 'warn' ? 'var(--review)' : 'var(--bad)'
              const label = faceSignal.severity === 'pass' ? 'Identity Match Confirmed'
                : faceSignal.severity === 'warn' ? 'Partial Match — Review' : 'Faces Do Not Match'
              return (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '12px 20px', backgroundColor: 'var(--paper)', border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <UserCheck size={24} style={{ color, marginBottom: 4 }} />
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>Similarity Score</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                    {sim}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color }}>{label}</div>
                </div>
              )
            })()}

            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 100, height: 120, backgroundColor: 'var(--paper)', border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: 6,
                }}
              >
                🧑
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-2)' }}>Live Selfie Capture</div>
            </div>
          </div>
        </div>
      )}

      {/* ── "Also Used By" Duplicates Panel ── */}
      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
          "Also Used By" Duplicates Index
        </h3>

        {hasDuplicates ? (
          <div
            style={{
              backgroundColor: 'rgba(168, 98, 0, 0.05)',
              border: '1px solid var(--review)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--review)', fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={16} />
              <span>Fingerprint Collision Detected</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink)', marginBottom: duplicateNames.length ? 8 : 0 }}>
              {duplicateSignal?.reason || 'This ID appears to have been used in another registration.'}
            </p>
            {duplicateNames.length > 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
                Also seen under: <strong>{duplicateNames.filter(Boolean).join(', ')}</strong>
              </p>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>
            ✓ No duplicate ID numbers, image hashes, or face matches found for this registration.
          </div>
        )}
      </div>

      {/* ── Grouped Findings (Needs Attention / Passed / Notes / Not Checked) ── */}
      <div className="panel" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
          Forensic Signal Groupings
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Group 1: Needs Attention */}
          <div>
            <div
              style={{
                fontSize: '0.82rem', fontWeight: 700, color: 'var(--bad)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <AlertTriangle size={14} />
              <span>Needs Attention ({needsAttention.length})</span>
            </div>
            {needsAttention.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {needsAttention.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                      backgroundColor: 'rgba(180, 35, 24, 0.05)', border: '1px solid var(--bad)',
                      borderRadius: 'var(--radius-sm)', fontSize: '0.88rem',
                    }}
                  >
                    <XCircle size={16} style={{ color: 'var(--bad)', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: 'var(--ink)' }}>{s.name.replace(/_/g, ' ')}</strong>
                      <div style={{ color: 'var(--ink-2)', fontSize: '0.82rem', marginTop: 2 }}>
                        {s.reason}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--ink-2)', fontStyle: 'italic' }}>
                No active anomalies or warning flags.
              </div>
            )}
          </div>

          {/* Group 2: Passed */}
          <div>
            <div
              style={{
                fontSize: '0.82rem', fontWeight: 700, color: 'var(--ok)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Check size={14} />
              <span>Passed ({passed.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {passed.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    backgroundColor: 'var(--paper)', border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
                  }}
                >
                  <Check size={14} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.name.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Group 3: Notes */}
          <div>
            <div
              style={{
                fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Info size={14} />
              <span>Notes & Audit Context ({notes.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notes.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: '0.82rem', color: 'var(--ink-2)', padding: '6px 10px',
                    backgroundColor: 'var(--paper)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  • {s.reason}
                </div>
              ))}
              {notes.length === 0 && (
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                  No additional notes for this case.
                </div>
              )}
            </div>
          </div>

          {/* Group 4: Not Checked */}
          <div>
            <div
              style={{
                fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 8,
              }}
            >
              Not Checked ({notChecked.length})
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {notChecked.length > 0
                ? notChecked.map((s) => s.name.replace(/_/g, ' ')).join(', ')
                : 'No checks were skipped for this case.'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Organizer Decision Actions & Note ── */}
      <div className="panel" style={{ padding: 24, backgroundColor: 'var(--surface)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          Organizer Action & Verdict Override
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-2)', marginBottom: 16 }}>
          Your decision will be recorded in the audit log with your reviewer stamp and optional note.
        </p>

        <textarea
          className="textarea"
          placeholder="Add an internal reviewer note for the audit trail (optional)"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-stamp-primary"
            style={{ backgroundColor: 'var(--ok)' }}
            disabled={reviewLoading}
            onClick={() => onReviewSubmit('APPROVED', reviewNote)}
          >
            Approve Registration
          </button>
          <button
            type="button"
            className="btn-stamp-primary"
            style={{ backgroundColor: 'var(--bad)' }}
            disabled={reviewLoading}
            onClick={() => onReviewSubmit('REJECTED', reviewNote)}
          >
            Reject as Ineligible
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={reviewLoading}
            onClick={() => onReviewSubmit('RESUBMIT', reviewNote)}
          >
            Ask to Resubmit Photo
          </button>
        </div>
      </div>
    </div>
  )
}
