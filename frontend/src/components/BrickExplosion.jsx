/**
 * BrickWall — Brick Explosion Scroll Animation
 * Uses GSAP ScrollTrigger to drive a scrubbed 3D explosion of bricks.
 * As the user scrolls through this section, bricks fly outward from
 * a tight wall formation, revealing the content below.
 *
 * Architecture:
 *  - 48 div bricks arranged in a staggered wall (8 cols × 6 rows)
 *  - CSS perspective + preserve-3d for depth
 *  - Each brick gets a unique random "explosion vector"
 *  - GSAP scrub=1 drives progress 0→1
 *  - Phase 1 (0→0.45): bricks assemble from scattered → wall
 *  - Phase 2 (0.45→1): wall EXPLODES outward in 3D
 */
import { useEffect, useRef, useMemo } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Brick dimensions
const COLS = 8
const ROWS = 6
const BRICK_W = 110   // px
const BRICK_H = 46    // px
const GAP_X   = 6
const GAP_Y   = 5
const MORTAR_OFFSET = 55  // stagger every other row

// Pre-generate brick data so it's stable between renders
function generateBricks() {
  const bricks = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const offsetX = r % 2 === 0 ? 0 : MORTAR_OFFSET
      const x = c * (BRICK_W + GAP_X) + offsetX
      const y = r * (BRICK_H + GAP_Y)

      // Random explosion vector (unique per brick)
      const angle  = Math.random() * Math.PI * 2
      const dist   = 280 + Math.random() * 420
      const tz     = 200 + Math.random() * 600
      const rx     = (Math.random() - 0.5) * 540
      const ry     = (Math.random() - 0.5) * 720
      const rz     = (Math.random() - 0.5) * 360
      const delay  = Math.random() * 0.18  // stagger within the scrub

      bricks.push({
        id: `brick-${r}-${c}`,
        x, y, r, c,
        ex: Math.cos(angle) * dist,
        ey: Math.sin(angle) * dist,
        etz: tz,
        erx: rx,
        ery: ry,
        erz: rz,
        delay,
        // Color variation — mix of brick reds, terracotta, mortar
        shade: r % 3 === 0
          ? '#B5451B'
          : r % 3 === 1
            ? '#9E3C18'
            : c % 2 === 0 ? '#C9613A' : '#A04028',
        mortar: '#2a1208',
      })
    }
  }
  return bricks
}

const BRICKS = generateBricks()

// Total wall pixel dimensions
const WALL_W = COLS * (BRICK_W + GAP_X) + MORTAR_OFFSET
const WALL_H = ROWS * (BRICK_H + GAP_Y)

export default function BrickExplosion() {
  const sectionRef  = useRef(null)
  const wallRef     = useRef(null)
  const brickRefs   = useRef([])
  const labelRef    = useRef(null)
  const ctRef       = useRef(null)   // ScrollTrigger instance

  useEffect(() => {
    const section = sectionRef.current
    const wall    = wallRef.current
    if (!section || !wall) return

    const brickEls = brickRefs.current

    // ── Set initial state: bricks scattered off-screen ─────────────────
    brickEls.forEach((el, i) => {
      if (!el) return
      const b = BRICKS[i]
      gsap.set(el, {
        x: b.ex,
        y: b.ey,
        z: b.etz * 0.3,
        rotateX: b.erx * 0.4,
        rotateY: b.ery * 0.4,
        rotateZ: b.erz * 0.4,
        opacity: 0,
      })
    })

    // ── Master GSAP timeline controlled by ScrollTrigger ────────────────
    const tl = gsap.timeline({ paused: true })

    // Phase 1: Bricks fly IN and form the wall (0 → 0.5)
    brickEls.forEach((el, i) => {
      if (!el) return
      const b = BRICKS[i]
      tl.to(el, {
        x: 0,
        y: 0,
        z: 0,
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0,
        opacity: 1,
        duration: 0.5 - b.delay * 0.2,
        ease: 'power3.out',
      }, b.delay * 0.4)       // stagger start
    })

    // Brief hold at wall assembled (0.5 → 0.6)
    tl.to({}, { duration: 0.1 })

    // Phase 2: Bricks EXPLODE outward (0.6 → 1)
    brickEls.forEach((el, i) => {
      if (!el) return
      const b = BRICKS[i]
      tl.to(el, {
        x: b.ex * 1.4,
        y: b.ey * 1.4,
        z: b.etz,
        rotateX: b.erx,
        rotateY: b.ery,
        rotateZ: b.erz,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.in',
      }, `>-=${0.38 - b.delay * 0.15}`)    // all explode together
    })

    // ── ScrollTrigger wires the timeline to scroll position ─────────────
    ctRef.current = ScrollTrigger.create({
      trigger: section,
      start: 'top 80%',
      end: 'bottom 20%',
      scrub: 1.2,
      animation: tl,
      // Fade the label in/out
      onUpdate: (self) => {
        if (labelRef.current) {
          const p = self.progress
          // Show label when wall is assembled (0.35–0.65)
          const opacity = p > 0.28 && p < 0.68
            ? Math.min(1, Math.min((p - 0.28) / 0.12, (0.68 - p) / 0.12))
            : 0
          labelRef.current.style.opacity = opacity
        }
      },
    })

    return () => {
      if (ctRef.current) ctRef.current.kill()
      tl.kill()
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="brick-explosion-section"
      aria-hidden="true"
      style={{
        position: 'relative',
        height: '380px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--paper, #FAF6F2)',
        borderBottom: '1px solid var(--rule, #E8D8CC)',
        perspective: '900px',
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* Wall container — transform-style: preserve-3d */}
      <div
        ref={wallRef}
        style={{
          position: 'relative',
          width: WALL_W,
          height: WALL_H,
          transformStyle: 'preserve-3d',
        }}
      >
        {BRICKS.map((b, i) => (
          <div
            key={b.id}
            ref={el => { brickRefs.current[i] = el }}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: BRICK_W,
              height: BRICK_H,
              backgroundColor: b.shade,
              borderRadius: '3px',
              boxShadow: `
                inset 0 1px 0 rgba(255,200,150,0.18),
                inset 0 -1px 0 rgba(0,0,0,0.35),
                2px 3px 8px rgba(0,0,0,0.4)
              `,
              willChange: 'transform, opacity',
              // Subtle crack/texture lines via gradient
              background: `
                linear-gradient(
                  180deg,
                  ${b.shade}ee 0%,
                  ${b.shade} 30%,
                  ${b.shade}cc 100%
                )
              `,
            }}
          />
        ))}
      </div>

      {/* Center label that appears when wall is assembled */}
      <div
        ref={labelRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
          opacity: 0,
          transition: 'opacity 0.1s ease',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#fdf0e8',
          textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          fontFamily: 'var(--font-sans)',
        }}>
          The wall stands firm
        </span>
        <span style={{
          fontSize: '0.68rem',
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: 'rgba(253,240,232,0.7)',
          textShadow: '0 1px 8px rgba(0,0,0,0.8)',
          fontFamily: 'var(--font-mono)',
        }}>
          scroll to break it
        </span>
      </div>
    </section>
  )
}
