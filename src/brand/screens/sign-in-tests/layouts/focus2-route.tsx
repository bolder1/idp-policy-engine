import { CircleHelp, Minus, X, type LucideIcon } from 'lucide-react'
import { motion, type Transition } from 'motion/react'

import type { Tone } from './focus-model'
import { EASE_OUT } from './focus-shared'
import { rowLabel, type OverviewPlacement, type PlacedBranch, type PlacedRow, type RouteRow } from './focus2-overview'
import './focus2-overview.css'

/* -----------------------------------------------------------------------------
   THE ROUTE'S OWN MARKS (Focus2Layout.tsx, the Horizontal view): the line
   through the stations, the branches up and down to each column's rows, and
   the slim rows that are not cards. The stations — Classic v2's cards — and the
   rows that ARE cards of the story are Focus2Layout's slots, drawn over this
   layer, in the band, in world px (focus2-overview.ts says where).

   No station marker on the line: the stations ARE the cards (no decorative
   dots). The line is one bold stroke between their heads' middles, seen in the
   gaps.

   ITS MOTION, on Motion props only, in three moods:

     arriving   the cards fly out of the carousel first; once they are most of
                the way there (`drawAt`, focus2-overview.ts `lineAt`) the line
                draws itself left to right, each branch as the line passes its
                station, then the rows sharpen in.
     playing    the story is told on the route: a stretch of line draws as the
                next station is reached, a row as its item is decided.
     leaving    the rows fade, the line un-draws right to left, fast — then
                the cards fly back (Focus2Layout holds them for this).

   Reduced motion: everything in place at once, nothing drawn.
   -------------------------------------------------------------------------- */

/** How long the line takes to draw on the way in. */
export const LINE_S = 0.6
/** Leaving: the rows fade over this, the line un-draws over that. */
const ROWS_OUT = 0.15
const LINE_OUT = 0.25
/** One stretch, or one branch, drawn while the story is told. */
const DRAW_S = 0.42
const BRANCH_S = 0.26
const ROW_S = 0.3
/** The rows' arrival: the blur pull Focus uses for a card, lighter. */
const ROW_BLUR = 4
const STAGGER = 0.05

export type RouteMood = 'arriving' | 'playing' | 'settled'

export interface Focus2RouteProps {
  ov: OverviewPlacement
  /** The verdict's tone: the line takes it once the story lands. */
  tone: Tone
  landed: boolean
  mood: RouteMood
  /** Arriving: when the line starts to draw (s), once the cards are most of the way there. */
  drawAt: number
  reduced: boolean
  /** What the panel or the brief has lit: a row lights for its own policy or rule. */
  lit: string | null
  onRow: (row: RouteRow) => void
}

const LINE_TONE: Record<Tone, string> = { positive: 'ok', negative: 'bad', notice: 'warn', neutral: 'plain' }
const ROW_MARK: Record<Exclude<RouteRow['mark'], null>, LucideIcon> = { cross: X, help: CircleHelp, dash: Minus }

/* What a row says, inside its box: its name over what it came to, led by its mark — a card's meta line, small — and,
   for a policy that also covers the person, what it would have given, struck. */
export function RowFace({ row }: { row: RouteRow }) {
  const Mark = row.mark ? ROW_MARK[row.mark] : null
  return (
    <>
      <span className="f2o__rname">{row.name}</span>
      {row.kind !== 'more' && (
        <span className="f2o__rsays">
          {Mark && (
            <span className="f2o__rmark" aria-hidden>
              <Mark size={12} strokeWidth={2.6} />
            </span>
          )}
          <span className="f2o__rtext">
            {row.would && (
              <>
                <s>{row.would}</s>
                {' · '}
              </>
            )}
            {row.says}
          </span>
        </span>
      )}
    </>
  )
}

export function Focus2Route({ ov, tone, landed, mood, drawAt, reduced, lit, onRow }: Focus2RouteProps) {
  const { line, branches, rows } = ov
  const segs = Math.max(0, line.xs.length - 1)
  const still = reduced || mood === 'settled'
  /* Where the line is when its station is passed, as a share of the whole: the branches under it start there. */
  const at = (col: number) => (segs > 0 ? Math.min(1, Math.max(0, col - 0.5) / segs) : 0)
  const colOf = (under: PlacedBranch['under']) => ov.route.stations.findIndex((st) => st.kind === under)
  const drawIn = !still
  const branchDelay = (b: { under: PlacedBranch['under']; order: number }) => (mood === 'arriving' ? drawAt + at(colOf(b.under)) * LINE_S + b.order * STAGGER : b.order * STAGGER * 0.5)

  return (
    <div className="f2o" aria-hidden={false}>
      <svg className="f2o__svg" width={ov.w} height={Math.max(ov.hOpen, line.y + 1)} aria-hidden focusable="false">
        {/* The branches first, so the line is drawn over where they leave it. */}
        {branches.map((b) => (
          <Branch key={`${b.key}:${b.tone}`} b={b} drawIn={drawIn} still={still} delay={branchDelay(b)} />
        ))}
        {Array.from({ length: segs }, (_, k) => {
          const shown = k + 1 < line.reached
          const reading = !landed && line.reading && k + 2 === line.reached
          const toneCls = landed ? LINE_TONE[tone] : reading ? 'work' : 'done'
          const t: Transition = still
            ? { duration: 0 }
            : mood === 'arriving'
              ? { pathLength: { delay: drawAt + (k * LINE_S) / segs, duration: LINE_S / segs, ease: 'linear' }, opacity: { delay: drawAt + (k * LINE_S) / segs, duration: 0.01 } }
              : { pathLength: { duration: DRAW_S, ease: EASE_OUT }, opacity: { duration: 0.01 } }
          return (
            <motion.path
              key={k}
              className={`f2o__line is-${toneCls}`}
              d={`M ${line.xs[k]} ${line.y} H ${line.xs[k + 1]}`}
              initial={drawIn ? { pathLength: 0, opacity: 0 } : false}
              animate={{ pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { pathLength: 0, transition: { delay: ((segs - 1 - k) * LINE_OUT) / segs, duration: LINE_OUT / segs, ease: 'linear' } }}
              transition={t}
            />
          )
        })}
      </svg>
      {rows.map((r) => (
        <Row key={r.row.key} r={r} lit={!!r.row.target && lit === r.row.target} drawIn={drawIn} still={still} delay={branchDelay(r) + BRANCH_S * 0.6} reduced={reduced} onRow={onRow} />
      ))}
    </div>
  )
}

function Branch({ b, drawIn, still, delay }: { b: PlacedBranch; drawIn: boolean; still: boolean; delay: number }) {
  /* A dashed branch cannot be drawn by its length — Motion's pathLength IS a dash pattern — so the amber one (also
     covers, not used) fades in where the others draw. */
  const dashed = b.tone === 'also'
  const t: Transition = still ? { duration: 0 } : dashed ? { opacity: { delay, duration: BRANCH_S } } : { pathLength: { delay, duration: BRANCH_S, ease: EASE_OUT }, opacity: { delay, duration: 0.01 } }
  const out = { duration: ROWS_OUT }
  return dashed ? (
    <motion.path className={`f2o__branch is-${b.tone}`} d={b.d} initial={drawIn ? { opacity: 0 } : false} animate={{ opacity: b.shown ? 1 : 0 }} exit={{ opacity: 0, transition: out }} transition={t} />
  ) : (
    <motion.path
      className={`f2o__branch is-${b.tone}`}
      d={b.d}
      initial={drawIn ? { pathLength: 0, opacity: 0 } : false}
      animate={{ pathLength: b.shown ? 1 : 0, opacity: b.shown ? 1 : 0 }}
      exit={{ opacity: 0, transition: out }}
      transition={t}
    />
  )
}

function Row({ r, lit, drawIn, still, delay, reduced, onRow }: { r: PlacedRow; lit: boolean; drawIn: boolean; still: boolean; delay: number; reduced: boolean; onRow: (row: RouteRow) => void }) {
  const { row, box, shown } = r
  const label = rowLabel(row)
  const sharp = { opacity: 1, filter: 'blur(0px)', y: 0 }
  const soft = { opacity: 0, filter: `blur(${ROW_BLUR}px)`, y: 4 }
  return (
    <motion.button
      type="button"
      className={`f2o__row is-${row.tone}${row.read ? ' is-read' : ''}${row.kind === 'more' ? ' is-more' : ''}${lit ? ' is-lit' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      initial={drawIn ? soft : false}
      animate={shown ? sharp : soft}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : ROWS_OUT } }}
      transition={still ? { duration: 0 } : { delay: shown ? delay : 0, duration: ROW_S, ease: EASE_OUT }}
      whileHover={reduced || !shown ? undefined : { y: -2 }}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown || undefined}
      aria-label={label}
      title={label}
      onClick={() => shown && onRow(row)}
    >
      <RowFace row={row} />
    </motion.button>
  )
}
