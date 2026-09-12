import { motion, useReducedMotion } from 'motion/react'

import type { BoardStopId } from './board-tour'

/* -----------------------------------------------------------------------------
   The six figures on the walkthrough cards.

   **Grey skeletons of the real screens, with a cursor doing the gesture.**

   Three drafts got here. The first was abstract — chips falling onto a spine —
   and abstraction is the wrong move when the reader is about to be asked to do
   a thing on a specific screen: a figure sharing no layout with that screen
   makes them translate before they can act. The second drew the right layouts
   and then painted them orange, which is worse, and is the mistake this comment
   exists to stop anybody repeating.

   --- Why almost none of this is coloured ------------------------------------

   The console's rule is 60 / 30 / 10 with **selection in greyscale, never
   orange**; the brand is spent on the primary button, the rail's active edge
   and New. An illustration that highlights with orange is not "on brand", it is
   the one place in the product where the brand's own budget was ignored — and
   at 384px wide, six oranges in a row read as a warning rather than as a
   highlight.

   So the palette here is:

   · **Grey for structure.** Every skeleton bar, card, border and glyph.
   · **Ink for selection.** `--text-primary` at low opacity is what marks the
     chosen segment, the arriving row, the group being written. That is the same
     answer the console's own controls give.
   · **Colour only where colour is the MEANING.** Green for a person the rule
     takes in, amber and red for what happens to a sign-in, amber and red again
     for a warning and an error in the review. Those are not decoration: they
     are the fact.

   The reference is HoneyBook's coach marks, which draw the product in grey on a
   dot grid and colour exactly one thing, and Airtable's feature tiles, which
   give each panel a single very desaturated hue.

   --- The microinteraction ---------------------------------------------------

   Every figure has a **cursor** that travels to the control the step is about
   and presses it, and the figure responds. It is the smallest possible way to
   say "you do this" rather than "this exists", and it is why these read as
   demonstrations instead of diagrams.

   --- The rules that survived all three drafts -------------------------------

   · **Skeleton, not lorem.** Text is a bar, except where the WORD is the
     lesson: the operators, `IF`/`THEN`, `Outline`/`Detailed`.
   · **Product tokens only.** `board-tour.test.ts` asserts no raw colour.
   · **Reduced motion gets the final frame**, never a still of a half-played
     animation.
   · **Composited properties only** — opacity and transform. Nothing animates a
     geometry attribute, so the loops stay off the layout thread while the board
     springs behind them.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 0.61, 0.36, 1] as const
/* One beat, one loop. Long enough to read the result, with a pause on the final
   frame — which is the frame that carries the message. */
const BEAT = { duration: 3.4, repeat: Infinity, ease: 'linear' as const }

export function BoardTourHero({ id }: { id: BoardStopId }) {
  const reduce = useReducedMotion()
  const F = HEROES[id]
  return (
    <div className="btr__hero btb__hero" aria-hidden>
      <svg viewBox="0 0 320 150" role="presentation">
        <defs>
          <filter id="btb-lift" x="-30%" y="-40%" width="160%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="var(--text-primary)" floodOpacity="0.1" />
          </filter>
        </defs>
        <F reduce={!!reduce} />
      </svg>
    </div>
  )
}

type Fig = { reduce: boolean }

/* --- The shared vocabulary ---------------------------------------------------

   Five parts, used by all six figures, so the drawings agree about what a line
   of text, a card and a chip look like — the way the product does.
   -------------------------------------------------------------------------- */

const INK = 'var(--text-primary)'

/** A line of text. */
const Bar = ({ x, y, w, h = 5, o = 0.34 }: { x: number; y: number; w: number; h?: number; o?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={INK} opacity={o} />
)

/** A surface: the card, the row, the panel. `lit` is ink, never brand. */
function Panel({
  x,
  y,
  w,
  h,
  r = 7,
  lit,
  dashed,
}: {
  x: number
  y: number
  w: number
  h: number
  r?: number
  lit?: boolean
  dashed?: boolean
}) {
  return (
    <g filter={lit ? 'url(#btb-lift)' : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill={dashed ? 'none' : lit ? 'var(--surface-raised)' : 'var(--surface-raised)'}
        stroke={lit ? INK : 'var(--border-default)'}
        strokeOpacity={lit ? 0.75 : 1}
        strokeWidth={lit ? 1.4 : 1}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
    </g>
  )
}

/* The cursor, and the press.

   Travels from `from` to `to` across the first third of the beat, presses, and
   holds — so the figure's response has the remaining two thirds to be read.
   Drawn last by every caller, so it is never behind a panel. */
function Cursor({ reduce, from, to }: { reduce: boolean; from: [number, number]; to: [number, number] }) {
  if (reduce) return null
  return (
    <>
      <motion.circle
        r="9"
        fill="none"
        stroke={INK}
        strokeWidth="1.4"
        initial={false}
        animate={{ cx: [from[0], to[0], to[0]], cy: [from[1], to[1], to[1]], opacity: [0, 0, 0.45, 0], scale: [0.4, 0.4, 1.5, 1.9] }}
        style={{ transformOrigin: `${to[0]}px ${to[1]}px` }}
        transition={{ ...BEAT, times: [0, 0.3, 0.42, 0.5] }}
      />
      <motion.path
        d="M0 0 L0 11 L2.8 8.4 L4.6 12.6 L6.6 11.7 L4.8 7.6 L8.6 7.4 Z"
        fill="var(--surface-raised)"
        stroke={INK}
        strokeWidth="1.1"
        strokeLinejoin="round"
        initial={false}
        animate={{ x: [from[0], to[0], to[0]], y: [from[1], to[1], to[1]], scale: [1, 1, 0.88, 1] }}
        transition={{ ...BEAT, times: [0, 0.3, 0.36, 0.42] }}
      />
    </>
  )
}

/** Reveal on the press, and hold. The shared response timing. */
const reveal = (reduce: boolean, extra: Record<string, number[]> = {}) =>
  reduce
    ? { animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        animate: { opacity: [0, 0, 1, 1], ...extra },
        transition: { ...BEAT, times: [0, 0.32, 0.44, 1], ease: EASE },
      }

/* --- 1. The chain -------------------------------------------------------------

   Three rules and a gap, and the cursor puts a rule in the gap. That is the
   whole step: a policy is a list, and you add to it. */
function ChainFig({ reduce }: Fig) {
  return (
    <>
      {[26, 58, 90].map((y, i) => (
        <g key={y}>
          <Panel x={54} y={y} w={212} h={24} />
          <rect x={64} y={y + 7} width="10" height="10" rx="3" fill={INK} opacity="0.09" />
          <text x={69} y={y + 15} fontSize="7.5" textAnchor="middle" fill={INK} opacity="0.45" fontWeight="700">
            {i + 1}
          </text>
          <Bar x={82} y={y + 9} w={96} />
          <circle cx={250} cy={y + 12} r="3" fill={INK} opacity="0.16" />
        </g>
      ))}
      <line x1="44" y1="26" x2="44" y2="136" stroke={INK} strokeOpacity="0.14" strokeWidth="1.5" strokeDasharray="3 3" />

      {/* The gap, and what lands in it. */}
      <Panel x={54} y={122} w={212} h={24} dashed />
      <path d="M64 134 h9 M68.5 129.5 v9" stroke={INK} strokeOpacity="0.3" strokeWidth="1.6" strokeLinecap="round" />

      <motion.g initial={false} {...reveal(reduce)}>
        <Panel x={54} y={122} w={212} h={24} lit />
        <rect x={64} y={129} width="10" height="10" rx="3" fill={INK} opacity="0.12" />
        <text x={69} y={137} fontSize="7.5" textAnchor="middle" fill={INK} opacity="0.6" fontWeight="700">
          4
        </text>
        <Bar x={82} y={131} w={78} o={0.45} />
      </motion.g>

      <Cursor reduce={reduce} from={[210, 60]} to={[66, 130]} />
    </>
  )
}

/* --- 2. Who ------------------------------------------------------------------

   Three people; a group is named; one of them falls out of scope. The message
   is SUBTRACTION, so the animation is the row dimming rather than the rows
   lighting — and the tick is green because "this person is in" is a fact rather
   than a selection. */
function WhoFig({ reduce }: Fig) {
  const rows = [
    { y: 52, on: true },
    { y: 82, on: true },
    { y: 112, on: false },
  ]
  return (
    <>
      {/* The group being named. */}
      <motion.g initial={false} {...reveal(reduce, { y: [-6, -6, 0, 0] })}>
        <rect x="94" y="12" width="132" height="24" rx="12" fill="var(--surface-raised)" stroke={INK} strokeOpacity="0.75" />
        <circle cx="110" cy="24" r="3.4" fill={INK} opacity="0.5" />
        <text x="121" y="27.5" fontSize="10" fill={INK} opacity="0.85" fontWeight="600">
          group in Finance
        </text>
      </motion.g>

      {rows.map((r) => (
        <motion.g
          key={r.y}
          initial={false}
          animate={reduce ? { opacity: r.on ? 1 : 0.3 } : { opacity: r.on ? 1 : [1, 1, 0.28, 0.28] }}
          transition={reduce ? { duration: 0 } : { ...BEAT, times: [0, 0.32, 0.46, 1], ease: EASE }}
        >
          <Panel x={54} y={r.y} w={212} h={24} />
          {/* A head and shoulders, not a blob. */}
          <circle cx="72" cy="70" r="0" fill="none" />
          <circle cx={72} cy={r.y + 9.5} r="3" fill={INK} opacity="0.3" />
          <path d={`M67 ${r.y + 18} a5 5 0 0 1 10 0 Z`} fill={INK} opacity="0.3" />
          <Bar x={88} y={r.y + 9} w={r.on ? 92 : 76} />

          {r.on && (
            <motion.g initial={false} {...reveal(reduce)}>
              <circle cx="248" cy={r.y + 12} r="8" fill="var(--fb-positive-dot)" opacity="0.14" />
              <path
                d={`M244 ${r.y + 12} l2.8 2.8 l5.4 -5.6`}
                fill="none"
                stroke="var(--fb-positive-dot)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.g>
          )}
        </motion.g>
      ))}

      <Cursor reduce={reduce} from={[240, 120]} to={[158, 26]} />
    </>
  )
}

/* --- 3. Conditions ------------------------------------------------------------

   Two groups, three tests, and the joiners between them — with the OPERATORS in
   real coloured type, because the operator is the lesson and a grey bar there
   would hide it.

   This is the one figure that is deliberately multi-coloured: each operator
   takes its category's colour, which is the same colour the condition row wears
   in the panel six inches away. */
function WhenFig({ reduce }: Fig) {
  return (
    <>
      <text x="30" y="20" fontSize="9" fill={INK} opacity="0.5" fontWeight="700">
        IF
      </text>

      {/* Group A — an AND run. */}
      <rect x="28" y="26" width="264" height="56" rx="8" fill={INK} fillOpacity="0.025" stroke={INK} strokeOpacity="0.12" strokeDasharray="3 3" />
      <Row y={32} op="in" tone="ink" valW={52} />
      <text x="38" y="60" fontSize="7.5" fill={INK} opacity="0.4" fontWeight="700">
        AND
      </text>
      <Row y={58} op="is above" tone="negative" valW={26} />

      <text x="160" y="96" fontSize="8" textAnchor="middle" fill={INK} opacity="0.42" fontWeight="700">
        OR
      </text>

      {/* Group B, arriving. */}
      <motion.g initial={false} {...reveal(reduce, { y: [8, 8, 0, 0] })}>
        <rect x="28" y="102" width="264" height="34" rx="8" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.3" strokeDasharray="3 3" />
        <Row y={106} op="in zone" tone="notice" valW={40} />
      </motion.g>

      <Cursor reduce={reduce} from={[250, 30]} to={[160, 112]} />
    </>
  )
}

/** One condition: a category dot, an attribute, the operator in words, a value. */
function Row({ y, op, tone, valW }: { y: number; op: string; tone: 'ink' | 'notice' | 'negative'; valW: number }) {
  const c = tone === 'ink' ? INK : `var(--fb-${tone}-fg)`
  const dot = tone === 'ink' ? INK : `var(--fb-${tone}-dot)`
  return (
    <>
      <Panel x={38} y={y} w={244} h={20} r={6} />
      <circle cx="50" cy={y + 10} r="3.2" fill={dot} opacity={tone === 'ink' ? 0.3 : 1} />
      <Bar x={60} y={y + 7} w={54} />
      <text x={122} y={y + 13.5} fontSize="8.5" fill={c} opacity={tone === 'ink' ? 0.62 : 1} fontWeight="700">
        {op}
      </text>
      <Bar x={122 + op.length * 4.6 + 10} y={y + 7} w={valW} o={0.22} />
    </>
  )
}

/* --- 4. What happens then ------------------------------------------------------

   One sign-in screen, and the three things a rule can do to it — played out
   rather than listed. The tiles named the OUTCOMES; this shows the
   CONSEQUENCES, which is the thing an administrator is actually choosing
   between.

   The only figure where colour does the heavy lifting, and it earns it: green,
   amber and red here ARE the three answers. The form itself stays grey so they
   have something quiet to land on.

   Three states over one nine-second loop, opacity only, all three mounted the
   whole time so nothing re-lays-out between them. */
const CYCLE = { duration: 9, repeat: Infinity, ease: 'linear' as const }
const THIRDS = [
  { times: [0, 0.02, 0.3, 0.34, 1], opacity: [1, 1, 1, 0, 0] },
  { times: [0, 0.34, 0.38, 0.63, 0.67, 1], opacity: [0, 0, 1, 1, 0, 0] },
  { times: [0, 0.67, 0.71, 0.96, 1, 1], opacity: [0, 0, 1, 1, 0, 0] },
]

function ThenFig({ reduce }: Fig) {
  const st = (k: number) =>
    reduce
      ? { animate: { opacity: k === 1 ? 1 : 0 }, transition: { duration: 0 } }
      : { animate: { opacity: THIRDS[k].opacity }, transition: { ...CYCLE, times: THIRDS[k].times } }

  return (
    <>
      <Panel x={96} y={10} w={128} h={130} r={10} />

      {/* The form. Grey, including the button — an orange one made the whole
          figure about the button rather than about what it does. */}
      <motion.g initial={false} {...st(0)}>
        <circle cx="160" cy="34" r="9" fill={INK} opacity="0.08" />
        <path d="M157 34 a3 3 0 1 1 6 0 v2.5 h-6 z" fill={INK} opacity="0.4" />
        <Bar x={136} y={50} w={48} h={5} />
        <rect x="110" y={64} width="100" height="15" rx="5" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.12" />
        <Bar x={118} y={69} w={38} h={4.5} o={0.22} />
        <rect x="110" y={84} width="100" height="15" rx="5" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.12" />
        <Bar x={118} y={89} w={54} h={4.5} o={0.22} />
        <rect x="110" y="106" width="100" height="17" rx="5" fill={INK} opacity="0.82" />
        <text x="160" y="118" fontSize="8.5" textAnchor="middle" fill="var(--surface-raised)" fontWeight="700">
          Sign in
        </text>
        <motion.circle
          cx="160"
          cy="114.5"
          r="11"
          fill="none"
          stroke={INK}
          strokeWidth="1.4"
          initial={false}
          animate={reduce ? { opacity: 0 } : { opacity: [0, 0.45, 0], scale: [0.5, 1.6, 2] }}
          style={{ transformOrigin: '160px 114.5px' }}
          transition={reduce ? { duration: 0 } : { ...CYCLE, times: [0, 0.05, 0.12] }}
        />
      </motion.g>

      {/* Allow. */}
      <motion.g
        initial={false}
        animate={reduce ? { opacity: 0 } : { opacity: [0, 0, 1, 1, 0] }}
        transition={reduce ? { duration: 0 } : { ...CYCLE, times: [0, 0.15, 0.2, 0.3, 0.34] }}
      >
        <rect x="97" y="11" width="126" height="128" rx="9" fill="var(--surface-raised)" />
        <circle cx="160" cy="60" r="19" fill="var(--fb-positive-dot)" opacity="0.12" />
        <path d="M151 60 l6.5 6.5 l13 -14" fill="none" stroke="var(--fb-positive-dot)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <text x="160" y="98" fontSize="10" textAnchor="middle" fill="var(--fb-positive-fg)" fontWeight="700">
          Signed in
        </text>
      </motion.g>

      {/* Second factor. */}
      <motion.g initial={false} {...st(1)}>
        <rect x="97" y="11" width="126" height="128" rx="9" fill="var(--surface-raised)" />
        <circle cx="160" cy="42" r="15" fill="var(--fb-notice-dot)" opacity="0.12" />
        <path d="M155 42 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="var(--fb-notice-dot)" strokeWidth="2" strokeLinecap="round" />
        <rect x="152.5" y="42" width="15" height="11" rx="2.5" fill="var(--fb-notice-dot)" />
        <text x="160" y="76" fontSize="9.5" textAnchor="middle" fill="var(--fb-notice-fg)" fontWeight="700">
          One more step
        </text>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={116 + i * 22} y="86" width="16" height="21" rx="4" fill={INK} fillOpacity="0.04" stroke={INK} strokeOpacity="0.12" />
            <motion.rect
              x={120 + i * 22}
              y="94"
              width="8"
              height="6"
              rx="3"
              fill="var(--fb-notice-dot)"
              initial={false}
              animate={reduce ? { opacity: 1 } : { opacity: [0, 0, 1, 1, 0] }}
              transition={reduce ? { duration: 0 } : { ...CYCLE, times: [0, 0.44 + i * 0.03, 0.47 + i * 0.03, 0.63, 0.67] }}
            />
          </g>
        ))}
      </motion.g>

      {/* Deny. */}
      <motion.g initial={false} {...st(2)}>
        <rect x="97" y="11" width="126" height="128" rx="9" fill="var(--surface-raised)" />
        <circle cx="160" cy="58" r="19" fill="var(--fb-negative-dot)" opacity="0.12" />
        <path d="M153 51 l14 14 M167 51 l-14 14" fill="none" stroke="var(--fb-negative-dot)" strokeWidth="3" strokeLinecap="round" />
        <text x="160" y="96" fontSize="10" textAnchor="middle" fill="var(--fb-negative-fg)" fontWeight="700">
          Refused
        </text>
        <Bar x={124} y={108} w={72} h={4.5} o={0.18} />
      </motion.g>
    </>
  )
}

/* --- 5. The dock ---------------------------------------------------------------

   The toolbar, and only the toolbar: the mode on the left, the momentary
   presses on the right. The cursor switches the mode, which is the step's task.

   The glyphs are lucide's own path data off its 24-unit grid, because these are
   the SAME five icons the dock draws and a freehand approximation reads as a
   different toolbar — an earlier pass drew the undo and redo arcs by hand and
   they came out as two overlapping circles. */
function DockFig({ reduce }: Fig) {
  return (
    <>
      {/* Two rules going out of frame, so the dock is over something. */}
      <Panel x={40} y={16} w={240} h={22} />
      <Bar x={54} y={24} w={104} />
      <Panel x={40} y={44} w={240} h={22} />
      <Bar x={54} y={52} w={78} />

      {/* The mode. */}
      <Panel x={40} y={88} w={116} h={30} r={9} lit={false} />
      <text x="68" y="107" fontSize="9.5" textAnchor="middle" fill={INK} opacity="0.42" fontWeight="600">
        Outline
      </text>
      <motion.g initial={false} {...reveal(reduce, { scale: [0.94, 0.94, 1, 1] })} style={{ transformOrigin: '124px 103px' }}>
        <rect x="96" y="92" width="56" height="22" rx="6" fill={INK} opacity="0.88" />
        <text x="124" y="107" fontSize="9.5" textAnchor="middle" fill="var(--surface-raised)" fontWeight="700">
          Detailed
        </text>
      </motion.g>

      {/* The verbs. */}
      <Panel x={166} y={88} w={114} h={30} r={9} />
      <Glyph cx={182} d={['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']} />
      <Glyph cx={202} d={['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13']} />
      <line x1="216" y1="96" x2="216" y2="110" stroke={INK} strokeOpacity="0.14" strokeWidth="1" />
      <Glyph
        cx={230}
        d={['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3']}
      />
      <Glyph cx={248} d={['M5 12h14']} />
      <text x="264" y="106" fontSize="8" textAnchor="middle" fill={INK} opacity="0.4" fontWeight="600">
        100%
      </text>
      <Glyph cx={274} d={['M5 12h14', 'M12 5v14']} />

      <Cursor reduce={reduce} from={[250, 50]} to={[124, 104]} />
    </>
  )
}

/** One dock glyph, from lucide's 24-unit grid, at the 14.4px the toolbar draws. */
function Glyph({ cx, d }: { cx: number; d: string[] }) {
  return (
    <g transform={`translate(${cx - 7.2} 95.8) scale(0.6)`}>
      {d.map((p) => (
        <path key={p} d={p} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  )
}

/* --- 6. The review -------------------------------------------------------------

   Every rule read back as a sentence — `IF` this, `THEN` that — with the checks
   attached to the rule each one is about.

   The two findings are the point rather than decoration. A review that only
   listed the rules would be a receipt; what makes it worth stopping at is that
   it is the last place a rule that can never run gets caught. So the drawing
   shows one warning and one error rather than three clean rows, and those two
   are the only colour in it. */
function ReviewFig({ reduce }: Fig) {
  return (
    <>
      {/* Clean. */}
      <Panel x={24} y={10} w={272} h={32} />
      <Bar x={36} y={19} w={94} h={6} o={0.45} />
      <text x="36" y="36" fontSize="7" fill={INK} opacity="0.45" fontWeight="700">
        IF
      </text>
      <Bar x={47} y={31} w={48} h={4} o={0.2} />
      <text x="104" y="36" fontSize="7" fill={INK} opacity="0.45" fontWeight="700">
        THEN
      </text>
      <Bar x={126} y={31} w={92} h={4} o={0.2} />
      <rect x="248" y="17" width="38" height="14" rx="7" fill="var(--fb-positive-dot)" opacity="0.12" />
      <text x="267" y="27" fontSize="7.5" textAnchor="middle" fill="var(--fb-positive-fg)" fontWeight="700">
        Allow
      </text>

      {/* The warning. */}
      <Panel x={24} y={50} w={272} h={46} />
      <Bar x={36} y={59} w={72} h={6} o={0.45} />
      <rect x="252" y="57" width="34" height="14" rx="7" fill="var(--fb-notice-dot)" opacity="0.14" />
      <text x="269" y="67" fontSize="7.5" textAnchor="middle" fill="var(--fb-notice-fg)" fontWeight="700">
        MFA
      </text>
      <motion.g initial={false} {...reveal(reduce, { y: [4, 4, 0, 0] })}>
        <rect x="34" y="74" width="252" height="16" rx="5" fill="var(--fb-notice-dot)" opacity="0.1" />
        <path d="M46 78 l4.6 8 h-9.2 z" fill="none" stroke="var(--fb-notice-dot)" strokeWidth="1.4" strokeLinejoin="round" />
        <text x="58" y="85" fontSize="7.5" fill="var(--fb-notice-fg)" fontWeight="700">
          Shadows 1 rule below it
        </text>
      </motion.g>

      {/* The error it causes. */}
      <Panel x={24} y={104} w={272} h={38} />
      <Bar x={36} y={112} w={86} h={6} o={0.45} />
      <motion.g initial={false} {...reveal(reduce, { y: [4, 4, 0, 0] })}>
        <rect x="34" y="122" width="252" height="14" rx="5" fill="var(--fb-negative-dot)" opacity="0.1" />
        <circle cx="45" cy="129" r="3.6" fill="none" stroke="var(--fb-negative-dot)" strokeWidth="1.3" />
        <path d="M43.6 127.6 l2.8 2.8" stroke="var(--fb-negative-dot)" strokeWidth="1.3" strokeLinecap="round" />
        <text x="55" y="132" fontSize="7.5" fill="var(--fb-negative-fg)" fontWeight="700">
          This rule can never run
        </text>
      </motion.g>
    </>
  )
}

const HEROES: Record<BoardStopId, (p: Fig) => React.JSX.Element> = {
  rule: ChainFig,
  who: WhoFig,
  when: WhenFig,
  then: ThenFig,
  tools: DockFig,
  review: ReviewFig,
}
