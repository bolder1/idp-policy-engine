import { motion, useReducedMotion } from 'motion/react'

import type { HeroId } from './tour-stops'

/* -----------------------------------------------------------------------------
   The six figures.

   Schematic, never screenshots. A screenshot of the builder goes stale the
   first time a padding value changes; a drawing of "first match wins" stays
   true for as long as the engine does.

   They use the same tokens as the thing they depict — a Deny chip here is the
   same `--fb-negative-*` as a Deny chip in the flow — because a tour with its
   own palette is a tour about a different product.

   Reduced motion gets the final frame of every loop. The frame is the message;
   the movement is only how it gets read, so nothing is lost.
   -------------------------------------------------------------------------- */

const LOOP = { repeat: Infinity, repeatDelay: 0.7, duration: 1.5, ease: [0.2, 0, 0, 1] as const }

export function TourHero({ id }: { id: HeroId }) {
  const reduce = useReducedMotion()
  const F = FIGURES[id]
  return (
    <div className="btr__hero" aria-hidden>
      <svg viewBox="0 0 320 150" role="presentation">
        <F reduce={!!reduce} />
      </svg>
    </div>
  )
}

type FigureProps = { reduce: boolean }

/* 1 — three decision chips settling onto a spine. The same drawing the create
   page uses for the same idea, so the tour opens on something familiar. */
function Welcome({ reduce }: FigureProps) {
  const chips = [
    { y: 18, w: 150, tone: 'negative', label: 'Deny' },
    { y: 62, w: 176, tone: 'notice', label: 'MFA' },
    { y: 106, w: 132, tone: 'positive', label: 'Allow' },
  ]
  return (
    <>
      <line x1="72" y1="14" x2="72" y2="136" stroke="var(--border-default)" strokeWidth="1" />
      {chips.map((c, i) => (
        <motion.g
          key={c.label}
          initial={reduce ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { ...LOOP, delay: i * 0.22, repeatDelay: 1.4 }}
        >
          <rect x="58" y={c.y} width={c.w} height="28" rx="8" fill="var(--surface-raised)" stroke="var(--border-subtle)" />
          <circle cx="76" cy={c.y + 14} r="5" fill={`var(--fb-${c.tone}-dot)`} />
          <text x="92" y={c.y + 18} fontSize="11" fill={`var(--fb-${c.tone}-fg)`}>
            {c.label}
          </text>
        </motion.g>
      ))}
    </>
  )
}

/* 2 — the one that matters. A sign-in falls past two rules, lands on the third,
   and everything below it dims because it will never be reached. */
function Order({ reduce }: FigureProps) {
  const rows = [30, 62, 94]
  return (
    <>
      <line x1="52" y1="14" x2="52" y2="140" stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3" />
      {rows.map((y, i) => (
        <motion.g
          key={y}
          initial={false}
          animate={reduce ? { opacity: i === 2 ? 1 : 0.35 } : { opacity: [1, 1, i < 2 ? 1 : 1, i === 2 ? 1 : 0.3] }}
          transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2.4, times: [0, 0.4, 0.7, 1] }}
        >
          <rect
            x="66"
            y={y}
            width="184"
            height="26"
            rx="7"
            fill={i === 2 ? 'var(--fb-positive-bg)' : 'var(--surface-raised)'}
            stroke={i === 2 ? 'var(--fb-positive-border)' : 'var(--border-subtle)'}
          />
          <text x="80" y={y + 17} fontSize="10" fill="var(--text-tertiary)">
            {`Rule ${i + 1}`}
          </text>
          <text x="122" y={y + 17} fontSize="10" fill={i === 2 ? 'var(--fb-positive-fg)' : 'var(--text-muted)'}>
            {i === 2 ? 'matches — stop' : 'no match'}
          </text>
        </motion.g>
      ))}

      <rect x="66" y="126" width="184" height="18" rx="6" fill="var(--surface-sunken)" strokeDasharray="3 3" stroke="var(--border-default)" />
      <text x="80" y="139" fontSize="9" fill="var(--text-disabled)">
        never reached
      </text>

      <motion.circle
        r="6"
        cx="52"
        fill="var(--brand)"
        initial={reduce ? false : { cy: 12, opacity: 0 }}
        animate={reduce ? { cy: 107 } : { cy: [12, 43, 75, 107, 107], opacity: [0, 1, 1, 1, 1] }}
        transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2.4, times: [0, 0.25, 0.5, 0.75, 1] }}
      />
    </>
  )
}

/* 3 — the trail filling left to right, Review lighting last. */
function Trail({ reduce }: FigureProps) {
  const steps = ['Who', 'When', 'Then', 'Check', 'Review']
  return (
    <>
      {steps.map((s, i) => (
        <motion.g
          key={s}
          initial={reduce ? false : { opacity: 0.3 }}
          animate={{ opacity: 1 }}
          transition={reduce ? { duration: 0 } : { ...LOOP, duration: 0.45, delay: i * 0.3, repeatDelay: 1.6 }}
        >
          <rect
            x={14 + i * 60}
            y="58"
            width="52"
            height="30"
            rx="15"
            fill={i === 4 ? 'var(--brand-subtle-bg)' : 'var(--surface-raised)'}
            stroke={i === 4 ? 'var(--brand)' : 'var(--border-subtle)'}
          />
          <text x={40 + i * 60} y="77" fontSize="10" textAnchor="middle" fill={i === 4 ? 'var(--brand-active)' : 'var(--text-secondary)'}>
            {s}
          </text>
        </motion.g>
      ))}
      {steps.slice(0, 4).map((_, i) => (
        <line key={i} x1={66 + i * 60} y1="73" x2={74 + i * 60} y2="73" stroke="var(--border-default)" strokeWidth="1" />
      ))}
    </>
  )
}

/* 4 — two condition rows assembling in their category colours, the junction
   flipping between AND and OR. */
function Conditions({ reduce }: FigureProps) {
  return (
    <>
      {[
        { y: 22, tone: 'info', label: 'Network Zone' },
        { y: 92, tone: 'accent', label: 'Device Posture' },
      ].map((r, i) => (
        <motion.g
          key={r.label}
          initial={reduce ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduce ? { duration: 0 } : { ...LOOP, duration: 0.5, delay: i * 0.3, repeatDelay: 1.8 }}
        >
          <rect x="42" y={r.y} width="236" height="34" rx="8" fill="var(--surface-raised)" stroke="var(--border-subtle)" />
          <rect x="42" y={r.y} width="3.5" height="34" rx="2" fill={`var(--fb-${r.tone}-dot)`} />
          <rect x="54" y={r.y + 8} width="18" height="18" rx="5" fill={`var(--fb-${r.tone}-bg)`} />
          <text x="82" y={r.y + 22} fontSize="10.5" fill="var(--text-body)">
            {r.label}
          </text>
          <rect x="180" y={r.y + 8} width="86" height="18" rx="5" fill="var(--surface-sunken)" stroke="var(--border-subtle)" />
        </motion.g>
      ))}

      <line x1="160" y1="56" x2="160" y2="92" stroke="var(--border-default)" strokeWidth="1" />
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 1 } : { opacity: [1, 1, 0, 1] }}
        transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2.2, times: [0, 0.45, 0.5, 1] }}
      >
        <rect x="140" y="64" width="40" height="20" rx="10" fill="var(--fb-accent-bg)" stroke="var(--fb-accent-border)" />
        <text x="160" y="78" fontSize="9.5" textAnchor="middle" fill="var(--fb-accent-fg)" letterSpacing="0.5">
          AND
        </text>
      </motion.g>
    </>
  )
}

/* 5 — a persona changes and the verdict flips with it. */
function Answer({ reduce }: FigureProps) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx={64 + i * 34}
          cy="38"
          r="14"
          fill={i === 1 ? 'var(--surface-inverse)' : 'var(--surface-sunken)'}
          stroke="var(--border-default)"
          initial={false}
          animate={reduce ? { opacity: 1 } : { opacity: [0.55, 0.55, i === 1 ? 1 : 0.55] }}
          transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2 }}
        />
      ))}

      <rect x="46" y="70" width="228" height="20" rx="6" fill="var(--surface-sunken)" />
      <text x="58" y="84" fontSize="9.5" fill="var(--text-tertiary)">
        Office Network · Known device · Low risk
      </text>

      <motion.g
        initial={false}
        animate={reduce ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
        transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2.4, times: [0, 0.42, 0.5, 1] }}
      >
        <rect x="46" y="100" width="228" height="32" rx="8" fill="var(--fb-positive-bg)" stroke="var(--fb-positive-border)" />
        <circle cx="64" cy="116" r="5" fill="var(--fb-positive-dot)" />
        <text x="78" y="120" fontSize="10.5" fill="var(--fb-positive-fg)">
          Allow — rule 4 decides it
        </text>
      </motion.g>
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 0 } : { opacity: [0, 0, 1, 1] }}
        transition={reduce ? { duration: 0 } : { ...LOOP, duration: 2.4, times: [0, 0.42, 0.5, 1] }}
      >
        <rect x="46" y="100" width="228" height="32" rx="8" fill="var(--fb-notice-bg)" stroke="var(--fb-notice-border)" />
        <circle cx="64" cy="116" r="5" fill="var(--fb-notice-dot)" />
        <text x="78" y="120" fontSize="10.5" fill="var(--fb-notice-fg)">
          MFA — rule 2 decides it
        </text>
      </motion.g>
    </>
  )
}

/* 6 — the dial fills, two cards come back as breaches. Not a trophy: the grade
   this figure lands on is the grade a simple policy usually gets. */
function Publish({ reduce }: FigureProps) {
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <>
      <g transform="translate(60, 75)">
        <circle r={R} fill="none" stroke="var(--border-default)" strokeWidth="8" />
        <motion.circle
          r={R}
          fill="none"
          stroke="var(--fb-notice-dot)"
          strokeWidth="8"
          strokeLinecap="round"
          transform="rotate(-90)"
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * 0.31 }}
          transition={reduce ? { duration: 0 } : { ...LOOP, duration: 1.2, repeatDelay: 1.9 }}
        />
        <text y="6" fontSize="22" fontWeight="700" textAnchor="middle" fill="var(--text-primary)">
          C
        </text>
      </g>

      {[0, 1, 2, 3, 4, 5].map((i) => {
        const bad = i === 1 || i === 4
        return (
          <motion.rect
            key={i}
            x={122 + (i % 3) * 58}
            y={48 + Math.floor(i / 3) * 42}
            width="48"
            height="32"
            rx="7"
            fill={bad ? 'var(--fb-negative-bg)' : 'var(--surface-raised)'}
            stroke={bad ? 'var(--fb-negative-border)' : 'var(--border-subtle)'}
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformOrigin: `${146 + (i % 3) * 58}px ${64 + Math.floor(i / 3) * 42}px` }}
            transition={reduce ? { duration: 0 } : { ...LOOP, duration: 0.4, delay: 0.12 * i, repeatDelay: 1.9 }}
          />
        )
      })}
      <text x="122" y="132" fontSize="9.5" fill="var(--fb-negative-fg)">
        2 got through
      </text>
    </>
  )
}

const FIGURES: Record<HeroId, (p: FigureProps) => React.ReactElement> = {
  welcome: Welcome,
  order: Order,
  trail: Trail,
  conditions: Conditions,
  answer: Answer,
  publish: Publish,
}
