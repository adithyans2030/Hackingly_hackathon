import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { GraduationCap, LayoutDashboard, ArrowRight, CheckCircle2 } from 'lucide-react'

const STUDENT_POINTS = [
  'Upload your Aadhaar ID once — verified in under 2 seconds',
  'Camera selfie match ensures your photo is checked, not just your card',
  "Blurry photo? You'll be prompted to retake it, never silently rejected",
  'Four clear outcomes — no mystery "declined" with zero explanation',
]

const ORGANIZER_POINTS = [
  'Drop-in REST API — zero changes to your AWS Textract pipeline',
  'Dashboard shows every flagged case with one-click approve / reject',
  'Caught 9 of 9 fakes; 0 genuine participants blocked on our test set',
  'Full audit trail with confidence scores and plain-language summaries',
]

const tabs = [
  { id: 'student',   label: 'For Students',   Icon: GraduationCap,   checkColor: '#4ADE80' },
  { id: 'organizer', label: 'For Organizers',  Icon: LayoutDashboard, checkColor: '#E8924A' },
]

export default function AudienceToggle() {
  const [active, setActive] = useState('student')

  const isStudent = active === 'student'
  const points    = isStudent ? STUDENT_POINTS : ORGANIZER_POINTS
  const checkColor = isStudent ? '#4ADE80' : '#E8924A'
  const cta = isStudent
    ? { to: '/verify',    label: 'Verify your ID now',          id: 'audience-cta-student' }
    : { to: '/dashboard', label: 'Open organizer dashboard',    id: 'audience-cta-organizer' }

  return (
    <div className="audience-toggle-wrap">
      {/* Tab Pills */}
      <div className="audience-tab-row" role="tablist" aria-label="Select your role">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            aria-controls={`audience-panel-${id}`}
            id={`audience-tab-${id}`}
            className={`audience-tab${active === id ? ' active' : ''}`}
            onClick={() => setActive(id)}
          >
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Animated Content Panel */}
      <div
        className="audience-panel"
        role="tabpanel"
        id={`audience-panel-${active}`}
        aria-labelledby={`audience-tab-${active}`}
        aria-live="polite"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <ul className="audience-points" aria-label={`${active === 'student' ? 'Student' : 'Organizer'} benefits`}>
              {points.map((pt, i) => (
                <motion.li
                  key={pt}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.22 }}
                  className="audience-point"
                >
                  <CheckCircle2
                    size={15}
                    strokeWidth={2.5}
                    style={{ color: checkColor, flexShrink: 0, marginTop: 2 }}
                    aria-hidden="true"
                  />
                  <span>{pt}</span>
                </motion.li>
              ))}
            </ul>

            <Link to={cta.to} className="audience-cta" id={cta.id}>
              {cta.label}
              <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
