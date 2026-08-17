import { motion, useReducedMotion } from 'motion/react'

import type { FigureId } from './tutorials'

/* -----------------------------------------------------------------------------
   The five tutorial figures.

   These are doing a different job from the tour's heroes. A hero sits beside a
   sentence and sets a mood; these sit above a guide somebody opened on purpose,
   and they have to carry the argument on their own — because a reader who
   understood the picture will skim the paragraph, and that is a win, not a
   failure of the paragraph.

   Three rules came out of drawing them:

   · **Show the mistake, not only the right answer.** `order` runs the wrong
     order first and lets a sign-in through, then swaps the rules and catches
     it. A drawing of the correct arrangement teaches you to recognise the
     correct arrangement; a drawing of the failure teaches you what to look for.

   · **Draw the cursor when the lesson is an action.** Magnific put a pointer
     into its walkthrough art for the same reason: an arrow between two boxes
     says "these are related", a cursor dragging one says "you do this".

   · **Same tokens as the product.** A Deny chip here is the same
     `--fb-negative-*` as a Deny chip in the flow. A tour with its own palette
     is a tour about a different product.

   Reduced motion gets the resolved frame of every sequence — the frame is the
   message and the movement is only how it gets read, so nothing is lost.
   -------------------------------------------------------------------------- */

const W = 320
const H = 176

/* One beat, reused, so the five figures share a tempo instead of each inventing
   one. A long repeatDelay because these loop under text somebody is reading. */
const beat = (duration: number, delay = 0) => ({
  duration,
  delay,
  repeat: Infinity,
  repeatDelay: 2.2,
  ease: [0.2, 0, 0, 1] as const,
})

export function TutorialFigure({ id }: { id: FigureId }) {
  const reduce = useReducedMotion()
  const F = FIGURES[id]
  return (
    <div className="btr__figure" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} role="presentation">
        <F reduce={!!reduce} />
      </svg>
    </div>
  )
}

type P = { reduce: boolean }

/* A drawn pointer. Small, and it never appears without something to point at —
   a cursor idling in a diagram is decoration wearing a uniform. */
function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path
        d="M0 0 L0 13 L3.4 10 L5.6 15 L8 14 L5.8 9.2 L10 9 Z"
        fill="var(--text-primary)"
        stroke="var(--surface-raised)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </g>
  )
}

function Slot({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height="26" rx="7" fill="var(--surface-sunken)" stroke="var(--border-default)" strokeDasharray="4 3" />
      <text x={x + 11} y={y + 17} fontSize="9.5" fill="var(--text-disabled)" letterSpacing="0.4">
        {label}
      </text>
    </>
  )
}

/* 1 — a rule assembling out of its three answers, dropped in by a cursor. The
   empty slots are drawn first and stay visible, because the lesson is that
   there are exactly three and they are always the same three. */
function Anatomy({ reduce }: P) {
  const parts = [
    { y: 34, label: 'WHO', fill: 'var(--fb-magenta-bg)', border: 'var(--fb-magenta-border)', dot: 'var(--fb-magenta-dot)', text: 'Finance · 86 people' },
    { y: 74, label: 'WHEN', fill: 'var(--fb-info-bg)', border: 'var(--fb-info-border)', dot: 'var(--fb-info-dot)', text: 'Device is unmanaged' },
    { y: 114, label: 'THEN', fill: 'var(--fb-notice-bg)', border: 'var(--fb-notice-border)', dot: 'var(--fb-notice-dot)', text: 'Ask for a second factor' },
  ]
  return (
    <>
      <rect x="18" y="16" width="284" height="146" rx="12" fill="var(--surface-raised)" stroke="var(--border-subtle)" />
      <text x="32" y="30" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        RULE 1
      </text>

      {parts.map((p) => (
        <Slot key={p.label} x={32} y={p.y} w={256} label={p.label} />
      ))}

      {parts.map((p, i) => (
        <motion.g
          key={p.text}
          initial={reduce ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduce ? { duration: 0 } : beat(0.42, i * 0.5)}
        >
          <rect x="32" y={p.y} width="256" height="26" rx="7" fill={p.fill} stroke={p.border} />
          <circle cx="46" cy={p.y + 13} r="4" fill={p.dot} />
          <text x="58" y={p.y + 17} fontSize="10" fill="var(--text-body)">
            {p.text}
          </text>
        </motion.g>
      ))}

      {!reduce && (
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 1, 0], x: [0, 0, 0, 0, 0], y: [0, 40, 80, 80, 80] }}
          transition={beat(1.6, 0)}
        >
          <Cursor x={276} y={38} />
        </motion.g>
      )}
    </>
  )
}

/* 2 — the failure first. Relief on top, a sign-in takes the easy path and
   leaks; the two rules swap; the same sign-in is caught. Shown as one loop, in
   that order, because the order is the whole lesson. */
function Order({ reduce }: P) {
  const A = { y: 40 }
  const B = { y: 84 }
  const swap = reduce
    ? { relief: B.y, guard: A.y }
    : { relief: [A.y, A.y, B.y, B.y], guard: [B.y, B.y, A.y, A.y] }
  const times = [0, 0.42, 0.56, 1]

  return (
    <>
      <text x="20" y="22" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        EVALUATION ORDER
      </text>

      {/* The relief rule — allow on the office network. */}
      <motion.g
        initial={false}
        animate={{ y: swap.relief }}
        transition={reduce ? { duration: 0 } : { ...beat(2.6), times }}
      >
        <rect x="20" y="0" width="196" height="34" rx="9" fill="var(--fb-positive-bg)" stroke="var(--fb-positive-border)" />
        <circle cx="36" cy="17" r="4.5" fill="var(--fb-positive-dot)" />
        <text x="48" y="21" fontSize="10" fill="var(--fb-positive-fg)">
          Office network → allow
        </text>
      </motion.g>

      {/* The guard rule — MFA for unmanaged devices. */}
      <motion.g
        initial={false}
        animate={{ y: swap.guard }}
        transition={reduce ? { duration: 0 } : { ...beat(2.6), times }}
      >
        <rect x="20" y="0" width="196" height="34" rx="9" fill="var(--fb-notice-bg)" stroke="var(--fb-notice-border)" />
        <circle cx="36" cy="17" r="4.5" fill="var(--fb-notice-dot)" />
        <text x="48" y="21" fontSize="10" fill="var(--fb-notice-fg)">
          Unmanaged device → MFA
        </text>
      </motion.g>

      {/* The sign-in. Stops at whichever rule is on top, so the same token
          leaks in the first half of the loop and is caught in the second. */}
      <motion.circle
        r="6"
        cx="234"
        fill="var(--brand)"
        initial={false}
        animate={reduce ? { cy: 57 } : { cy: [14, 57, 57, 57], opacity: [0.2, 1, 1, 1] }}
        transition={reduce ? { duration: 0 } : { ...beat(2.6), times }}
      />

      {/* Two verdicts, cross-fading on the same swap. */}
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 0 } : { opacity: [1, 1, 0, 0] }}
        transition={reduce ? { duration: 0 } : { ...beat(2.6), times }}
      >
        <rect x="20" y="128" width="280" height="30" rx="8" fill="var(--fb-negative-bg)" stroke="var(--fb-negative-border)" />
        <text x="34" y="147" fontSize="10" fill="var(--fb-negative-fg)">
          An unmanaged laptop in the office signs in on one factor
        </text>
      </motion.g>
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 1 } : { opacity: [0, 0, 1, 1] }}
        transition={reduce ? { duration: 0 } : { ...beat(2.6), times }}
      >
        <rect x="20" y="128" width="280" height="30" rx="8" fill="var(--fb-positive-bg)" stroke="var(--fb-positive-border)" />
        <text x="34" y="147" fontSize="10" fill="var(--fb-positive-fg)">
          Guard on top — the same laptop is asked for a second factor
        </text>
      </motion.g>

      {!reduce && <Cursor x={228} y={64} />}
    </>
  )
}

/* 3 — the three severities and what each one does to the publish button. The
   error is what stops it; the warning is what merely stands there. */
function Checks({ reduce }: P) {
  const rows = [
    { y: 24, tone: 'negative', label: 'No audience on rule 2', kind: 'Error' },
    { y: 62, tone: 'notice', label: 'Rule 4 can never be reached', kind: 'Warning' },
    { y: 100, tone: 'info', label: 'No catch-all for Contractors', kind: 'Note' },
  ]
  return (
    <>
      {rows.map((r, i) => (
        <motion.g
          key={r.kind}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : beat(0.4, i * 0.28)}
        >
          <rect x="18" y={r.y} width="284" height="30" rx="8" fill={`var(--fb-${r.tone}-bg)`} stroke={`var(--fb-${r.tone}-border)`} />
          <circle cx="34" cy={r.y + 15} r="4.5" fill={`var(--fb-${r.tone}-dot)`} />
          <text x="48" y={r.y + 19} fontSize="10" fontWeight="600" fill={`var(--fb-${r.tone}-fg)`}>
            {r.kind}
          </text>
          <text x={r.kind === 'Warning' ? 100 : 88} y={r.y + 19} fontSize="10" fill="var(--text-body)">
            {r.label}
          </text>
        </motion.g>
      ))}

      {/* Only the top row is wired to the button. */}
      <path d="M 34 54 L 34 140 L 196 140" fill="none" stroke="var(--fb-negative-border)" strokeWidth="1.5" strokeDasharray="4 3" />
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 1 } : { opacity: [0.35, 1, 1] }}
        transition={reduce ? { duration: 0 } : beat(0.5, 0.9)}
      >
        <rect x="200" y="126" width="100" height="30" rx="8" fill="var(--surface-sunken)" stroke="var(--border-default)" />
        <text x="250" y="145" fontSize="10" textAnchor="middle" fill="var(--text-disabled)">
          Publish
        </text>
        <circle cx="200" cy="126" r="8" fill="var(--fb-negative-bg)" stroke="var(--fb-negative-border)" />
        <text x="200" y="130" fontSize="10" fontWeight="700" textAnchor="middle" fill="var(--fb-negative-fg)">
          1
        </text>
      </motion.g>
    </>
  )
}

/* 4 — thirteen attempts dealt from a deck. Two come back red, and the dial
   lands on the grade those two produce rather than on an A. */
function Test({ reduce }: P) {
  const R = 26
  const C = 2 * Math.PI * R
  const cards = Array.from({ length: 13 }, (_, i) => i)
  const bad = new Set([3, 9])
  return (
    <>
      <text x="18" y="20" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        13 SIGN-IN ATTEMPTS
      </text>

      {cards.map((i) => {
        const col = i % 7
        const row = Math.floor(i / 7)
        const x = 18 + col * 30
        const y = 30 + row * 36
        return (
          <motion.rect
            key={i}
            x={x}
            y={y}
            width="24"
            height="30"
            rx="5"
            fill={bad.has(i) ? 'var(--fb-negative-bg)' : 'var(--surface-raised)'}
            stroke={bad.has(i) ? 'var(--fb-negative-border)' : 'var(--border-subtle)'}
            initial={reduce ? false : { opacity: 0, y: y - 14, rotate: -6 }}
            animate={{ opacity: 1, y, rotate: 0 }}
            style={{ transformOrigin: `${x + 12}px ${y + 15}px` }}
            transition={reduce ? { duration: 0 } : beat(0.34, i * 0.07)}
          />
        )
      })}

      <g transform="translate(258, 62)">
        <circle r={R} fill="none" stroke="var(--border-default)" strokeWidth="7" />
        <motion.circle
          r={R}
          fill="none"
          stroke="var(--fb-notice-dot)"
          strokeWidth="7"
          strokeLinecap="round"
          transform="rotate(-90)"
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (2 / 13) }}
          transition={reduce ? { duration: 0 } : beat(1.1, 1)}
        />
        <text y="6" fontSize="19" fontWeight="700" textAnchor="middle" fill="var(--text-primary)">
          C
        </text>
      </g>

      <rect x="18" y="126" width="284" height="32" rx="8" fill="var(--fb-negative-bg)" stroke="var(--fb-negative-border)" />
      <circle cx="34" cy="142" r="4.5" fill="var(--fb-negative-dot)" />
      <text x="46" y="146" fontSize="10" fill="var(--fb-negative-fg)">
        2 got through — rule 3 matched before rule 5 could
      </text>
    </>
  )
}

/* 5 — the draft and the published version as two separate things, with the
   publish that moves one onto the other and the history it leaves behind. */
function Ship({ reduce }: P) {
  return (
    <>
      <text x="18" y="20" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        DRAFT
      </text>
      <rect x="18" y="28" width="120" height="58" rx="9" fill="var(--surface-raised)" stroke="var(--brand)" strokeDasharray="5 3" />
      {[38, 52, 66].map((y, i) => (
        <rect key={y} x="30" y={y} width={i === 1 ? 74 : 92} height="7" rx="3.5" fill="var(--surface-inset)" />
      ))}

      <text x="200" y="20" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        LIVE
      </text>
      <rect x="200" y="28" width="102" height="58" rx="9" fill="var(--fb-positive-bg)" stroke="var(--fb-positive-border)" />
      {[38, 52, 66].map((y, i) => (
        <rect key={y} x="212" y={y} width={i === 1 ? 58 : 76} height="7" rx="3.5" fill="var(--fb-positive-border)" />
      ))}

      {/* The publish itself: a copy travelling right, not a state changing in
          place — the live version is replaced, never edited. */}
      <path d="M 146 57 L 190 57" stroke="var(--border-default)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
      <motion.g
        initial={reduce ? false : { opacity: 0, x: -34 }}
        animate={reduce ? { opacity: 0 } : { opacity: [0, 1, 1, 0], x: [-34, 0, 0, 8] }}
        transition={reduce ? { duration: 0 } : { ...beat(1.5, 0.4), times: [0, 0.35, 0.75, 1] }}
      >
        <rect x="150" y="46" width="36" height="22" rx="6" fill="var(--brand)" />
        <text x="168" y="61" fontSize="9" textAnchor="middle" fill="var(--text-on-brand)" letterSpacing="0.4">
          v7
        </text>
      </motion.g>

      <text x="18" y="110" fontSize="9" fill="var(--text-muted)" letterSpacing="0.8">
        HISTORY
      </text>
      {[
        { x: 18, v: 'v5', who: 'Priya · 12 Jun' },
        { x: 116, v: 'v6', who: 'You · 2 Aug' },
        { x: 214, v: 'v7', who: 'You · now' },
      ].map((h, i) => (
        <motion.g
          key={h.v}
          initial={reduce ? false : { opacity: i === 2 ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={reduce ? { duration: 0 } : beat(0.4, 1.4)}
        >
          <rect x={h.x} y="118" width="88" height="38" rx="8" fill="var(--surface-sunken)" stroke={i === 2 ? 'var(--brand)' : 'var(--border-subtle)'} />
          <text x={h.x + 12} y="133" fontSize="10" fontWeight="600" fill="var(--text-primary)">
            {h.v}
          </text>
          <text x={h.x + 12} y="147" fontSize="8.5" fill="var(--text-muted)">
            {h.who}
          </text>
        </motion.g>
      ))}
      {/* Rolling back is a publish of an older version, so the arrow returns
          along the row rather than reversing time. */}
      <path d="M 106 137 L 116 137 M 204 137 L 214 137" stroke="var(--border-default)" strokeWidth="1.5" />
    </>
  )
}

const FIGURES: Record<FigureId, (p: P) => React.ReactElement> = {
  anatomy: Anatomy,
  order: Order,
  checks: Checks,
  test: Test,
  ship: Ship,
}
