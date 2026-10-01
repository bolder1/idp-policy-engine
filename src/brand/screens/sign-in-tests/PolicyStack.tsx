import { AnimatePresence, motion } from 'motion/react'
import { memo, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { AppWindow, Check, ChevronDown, ChevronRight, Clock, CornerDownRight, Gauge, Globe, ListFilter, MapPin, Minus, MonitorSmartphone, TriangleAlert, Users, X, type LucideIcon } from 'lucide-react'

import { Tip } from '../../kit'
import { CONDITION_WORDS, type LineStatus } from '../testing/evidence'
import type { FormField } from '../testing/sign-in-form'
import { RuleOutcome } from '../testing/TracePills'
import type { PillCategory } from '../testing/trace-pills'
import { NOT_STATED_WORD, checkPhase, ruleFolded, rulePhase, type CheckRow, type EnginePolicy, type EngineRule, type NodeId, type RowPhase, type RuleLine } from './engine-run'

/* -----------------------------------------------------------------------------
   The policies that could govern the sign-in, as the engine run draws them
   (TESTING-V4 §8.6, §12.4): ONE card, titled with the application, its rows
   the policies in the order the engine asks them, the one that decides
   becoming the container of its rules.

     ┌ Policies on GitHub Enterprise ─────────────────────────────┐
     │ ┌ 1  Developer tools — office and device checks  Decides ⌄ ┐ │
     │ │      Rules                                Show all checks │ │
     │ │      1  In the office on a compliant device     No match  │ │
     │ │         Network  Home broadband is not in Corporate …  ✕  │ │
     │ │      2  Compliant device, working remotely [Allow w/ 2FA] │ │
     │ │         Who     Engineering, DevOps · Arun Patel       ✓  │ │
     │ │         Device  Compliant devices · Windows 11 …   ⌄   ✓  │ │
     │ └      ↳  Nothing else matched                Not reached ┘ │
     │   2  Global Default Policy                    Not reached › │
     └─────────────────────────────────────────────────────────────┘

   Readability (§12.4). Each row: its order number, the name at 14 px, the
   result in plain words on the right — "Switched off", "Kavya Menon is not
   in it", "Not reached", "Decides" — then one control track (the chevron),
   so every right edge in the card lines up: a policy's chevron, a rule's
   answer, a check's mark. A policy that did not decide is quiet — its name
   in secondary words, its reason in tertiary (colour tokens, ≥ 4.5:1, never
   opacity on words) — and never opens by itself; pressing it opens it to its
   rules as titles, read-only, and again closes it. No boxes inside boxes:
   the card, and inside it only the one container, the policy that decides.
   Its rules lie on its surface, a rule being read or the one that matched
   picked out by a tint and the rail, never by a box of its own.

   The search (§12.4). The card arrives with its rows as skeletons; each row
   takes a soft accent tint as the engine asks it, and a solid accent line
   fills under it for as long as the row's scan (a pseudo-element, clipped
   open), its name coming up and its reason landing as the engine moves on;
   the one that decides has a solid accent ring drawn once around its edge
   (an SVG rect, motion's pathLength), then settles to the accent ring and
   "Decides"; only then does it open, and its rules appear inside it. Flat,
   one hue: no gradients, no orange.

   In the one that decides, a rule the engine left without a match folds to
   the row that failed, said as one line: the rows before it close up, and the
   failing row keeps its place, its icon, its word and its ✕ — only its words
   change, from "Corporate offices / Home broadband" to "Home broadband is not
   in Corporate offices" — so what failed is readable the whole way through.
   The rule that matched stays open, every row ✓; the rules after it are
   ghosted titles. One quiet switch opens every folded rule again (Show all
   checks), the rows after the failing one "Not checked".

   Motion. Motion owns what it moves here — a policy's body opening
   (`.tj-pol__open`, `.tj-pol__body`), a check row's height (`.tj-crowwrap`,
   eased to its content's measured height, so a row arriving, leaving or
   folding to one line never jumps and nothing under it does), a row's words
   (`.tj-crow__say`), a mark's pop (`.tj-mark`), a word arriving
   (`.tj-appear`), the ring drawn round the one that decides
   (`.tj-light__ring`) — and journey.css gives none of them a transform or a
   transition. What moves in CSS is only what motion never touches: a row's
   ring and edge (`.tj-pol`, `.tj-r__card`), its scan line (a pseudo-element's
   clip), a row's tint (`.tj-crow`), the rail.

   Hover. The card grows under a pointer that has not moved — the admin
   pressed Run, or a saved sign-in, right where the policies then appear — and
   a row sliding under a still pointer is not the admin pointing at it. So a
   row is only ever "hot" from a pointer that MOVED over it, and only once the
   run is done; and the tooltips are not there at all until the run is done
   and the pointer has moved (`hoverable`). Focus is a real act, and counts
   once the run is done.

   Cost. The canvas renders once a step. A row or a rule is drawn again only
   when what it shows has changed (memo): at any step, the rule being read,
   and nothing else.
   -------------------------------------------------------------------------- */

const CATEGORY_ICON: Record<PillCategory, LucideIcon> = {
  who: Users,
  network: Globe,
  place: MapPin,
  device: MonitorSmartphone,
  time: Clock,
  risk: Gauge,
  app: AppWindow,
  other: ListFilter,
}

/** Decelerating: what arrives. */
const EASE_OUT = [0.2, 0, 0, 1] as const
/** A drawer opening: quick to start, long to settle. */
const EASE_OPEN = [0.32, 0.72, 0, 1] as const
/** What changes size in place, or leaves. */
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const

/** The engine working on something: an arc that turns (a static arc under reduced motion). */
export function Spinner({ small = false }: { small?: boolean }) {
  return <span className={`tj-spin${small ? ' is-small' : ''}`} aria-hidden />
}

/** A pointer that moved: a move the layout made under a still pointer carries no movement. */
const moved = (e: PointerEvent) => e.movementX !== 0 || e.movementY !== 0

/* The kit's tooltip, or — while it may not open — its wrapper alone, so the
   layout is the same either way. No text, no tooltip. */
function MaybeTip({ on, text, placement, children }: { on: boolean; text: ReactNode; placement?: 'top' | 'bottom'; children: ReactNode }) {
  if (on && text) {
    return (
      <Tip text={text} placement={placement}>
        {children}
      </Tip>
    )
  }
  return <span className="bx-tip">{children}</span>
}

/* A word arriving where there was none — "Decides", a reason, "No match":
   it fades in, never pops; a policy's name comes up a beat into its sweep. */
function Appear({ animate, className, delay = 0, children }: { animate: boolean; className: string; delay?: number; children: ReactNode }) {
  return (
    <motion.span
      className={`tj-appear ${className}`}
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: animate ? 0.2 : 0, delay: animate ? delay : 0, ease: EASE_OUT }}
    >
      {children}
    </motion.span>
  )
}

/* A box's own height, measured, so motion can ease a wrapper to it: a row
   arriving, a row folding to one line, a category's checks opening. Null
   until measured (and in a server render), when the wrapper is `auto`. */
function useHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [h, setH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return h
}

/* A policy's body opening and closing by height, so what is under it moves
   with it and the wires follow: the height eases open like a drawer, and the
   rules inside fade in a beat behind it, clipped by it as it grows — never
   scaled, never squashed. */
function Opening({ open, animate, children, id }: { open: boolean; animate: boolean; children: ReactNode; id?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="open"
          id={id}
          className="tj-pol__open"
          initial={animate ? { height: 0 } : false}
          animate={{ height: 'auto', transition: { duration: animate ? 0.32 : 0, ease: EASE_OPEN } }}
          exit={{ height: 0, transition: { duration: animate ? 0.24 : 0, ease: EASE_IN_OUT } }}
        >
          <motion.div
            className="tj-pol__body"
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: { duration: animate ? 0.2 : 0, delay: animate ? 0.05 : 0, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: animate ? 0.12 : 0 } }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// --- The card, and a policy ------------------------------------------------------------------

/* The one card that holds the policies, titled with the application. The
   spine meets it at its top and leaves from its foot (`data-node="which"`). */
export function WhichCard({ appName, children }: { appName: string; children: ReactNode }) {
  const title = `Policies on ${appName}`
  return (
    <div className="tj-which" data-node="which">
      <p className="tj-which__head">{title}</p>
      <ol className="tj-pstack" aria-label={title}>
        {children}
      </ol>
    </div>
  )
}

export interface PolicyCardProps {
  p: EnginePolicy
  /** A skeleton, being asked, or settled (engine-run.ts `policyPhase`). */
  phase: RowPhase
  /** The one that decides, found: its ring drawn once around it (engine-run.ts `policyFound`). */
  found?: boolean
  /** How long its scan line takes to fill: its scan step's length, at the pace the run plays at. */
  sweepMs?: number
  /** How long its ring takes to draw: its found step's length. */
  lightMs?: number
  /** Its body is open: the one that decides once the engine opens it, or one pressed open. */
  open: boolean
  /** It can be pressed: the run is done. */
  interactive: boolean
  /** Its tooltip may open: the run is done and the pointer has moved since. */
  hoverable?: boolean
  onToggle: (policyId: string, open: boolean) => void
  hot: boolean
  active: boolean
  animate: boolean
  onHover: (n: NodeId | null) => void
  /** The rules of the one that decides. Absent, it holds its rules as titles (`RuleLines`). */
  body?: ReactNode
  onOpenRule: (policyId: string, ruleId: string) => void
  /** It also covers the person (RunNodes.tsx `PoliciesStop`): said in place of its reason — in the notice tone, pulsing as it lands, where it would answer otherwise. */
  flag?: PolicyFlag
}

/** A policy after the one that decides that also covers the person: what its row says instead of its reason. */
export interface PolicyFlag {
  tone: 'conflict' | 'info'
  text: string
}

/** The ring round the one that decides is drawn in this share of its step, then held as the accent ring takes its place. */
const RING_DRAW = 0.82
const RING_EASE = [0.45, 0, 0.3, 1] as const

/* A policy's row: a skeleton until the scan reaches it; being asked (its
   tint, the scan line filling under it, its name coming up, a spinner where
   its result will be); the one that decides, found (its ring drawn once);
   then settled — the one
   that decides ringed with the accent and "Decides", the rest quiet with
   their reason. Its head is a disclosure: it opens and closes the body. */
export const PolicyCard = memo(function PolicyCard({
  p,
  phase,
  found = false,
  sweepMs = 480,
  lightMs = 620,
  open,
  interactive,
  hoverable = interactive,
  onToggle,
  hot,
  active,
  animate,
  onHover,
  body,
  onOpenRule,
  flag,
}: PolicyCardProps) {
  const bodyId = useId()
  if (phase === 'waiting') {
    return (
      <li className="tj-pol is-waiting" data-node={p.node} aria-hidden>
        <div className="tj-pol__head is-skel" data-port>
          <span className="tj-pol__num">{p.order}</span>
          <span className="tj-skel is-line" />
          <span className="tj-skel is-word" />
          <span className="tj-pol__chev" />
        </div>
      </li>
    )
  }
  const settled = phase === 'settled'
  const tone = found ? ' is-found' : !settled ? ' is-working' : p.decides ? ' is-decides' : flag ? ` has-flag is-${flag.tone}` : ' is-dim'
  const Chev = open ? ChevronDown : ChevronRight
  /* A rule inside it answers for itself: the pointer over one of the rules
     of the one that decides makes that rule hot, not the policy. */
  const onMove = (e: PointerEvent<HTMLLIElement>) => {
    if (!interactive || !moved(e) || hot) return
    if (p.decides && (e.target as Element).closest?.('[data-node^="rule:"]')) return
    onHover(p.node)
  }
  /* The scan line and the ring are as long as their steps: journey.css reads the one, motion draws the other. */
  const style = { '--tj-sweep': `${Math.max(1, Math.round(sweepMs))}ms` } as CSSProperties
  return (
    <li
      className={`tj-pol${tone}${open ? ' is-open' : ''}${hot ? ' is-hot' : ''}`}
      data-node={p.node}
      style={style}
      {...(active ? { 'data-active': '' } : null)}
      onPointerMove={onMove}
      onPointerLeave={() => interactive && onHover(null)}
    >
      {/* A conflict, found: a pulse round the row as it lands, twice, so the eye goes to it (owner, 1 Oct: "very hard to find"). */}
      {settled && flag?.tone === 'conflict' && animate && (
        <motion.span
          className="tj-pol__pulse"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.2, 1, 0] }}
          transition={{ duration: 2.2, delay: 0.25, times: [0, 0.2, 0.45, 0.65, 1], ease: 'easeInOut' }}
        />
      )}
      {found && animate && (
        <svg className="tj-light" aria-hidden focusable="false">
          <motion.rect
            className="tj-light__ring"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: (Math.max(1, lightMs) / 1000) * RING_DRAW, ease: RING_EASE }}
          />
        </svg>
      )}
      <MaybeTip on={hoverable} text={p.tip} placement="top">
        <button
          type="button"
          className="tj-pol__head"
          data-port
          aria-expanded={settled ? open : undefined}
          aria-controls={open ? bodyId : undefined}
          onClick={() => interactive && settled && onToggle(p.policyId, !open)}
          onFocus={() => interactive && onHover(p.node)}
          onBlur={() => interactive && onHover(null)}
          tabIndex={interactive && settled ? 0 : -1}
        >
          <span className="tj-pol__num" aria-hidden>
            {p.order}
          </span>
          <Appear animate={animate} delay={!settled && !found ? (sweepMs / 1000) * 0.3 : 0} className="tj-pol__name">
            {p.name}
          </Appear>
          <span className="tj-pol__end">
            {settled && p.decides ? (
              <Appear animate={animate} className="tj-pol__word">
                Decides
              </Appear>
            ) : settled && flag ? (
              <Appear animate={animate} className={`tj-pol__flag is-${flag.tone}`}>
                {flag.tone === 'conflict' && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
                {flag.text}
              </Appear>
            ) : settled && p.reason ? (
              <Appear animate={animate} className="tj-pol__reason">
                {p.reason}
              </Appear>
            ) : !settled && !found ? (
              <Spinner small />
            ) : null}
          </span>
          <span className="tj-pol__chev" aria-hidden>
            {settled && <Chev size={14} strokeWidth={2} />}
          </span>
        </button>
      </MaybeTip>
      <Opening open={open} animate={animate} id={bodyId}>
        {body ?? <RuleLines lines={p.lines} policyId={p.policyId} onOpen={onOpenRule} />}
      </Opening>
    </li>
  )
})

/* The titles of a policy that did not decide, pressed open: each rule's
   number, name and THEN, the last row last. Each opens that rule on its
   board, as a rule of the one that decides does. */
export const RuleLines = memo(function RuleLines({ lines, policyId, onOpen }: { lines: readonly RuleLine[]; policyId: string; onOpen: (policyId: string, ruleId: string) => void }) {
  return (
    <ol className="tj-rlist is-lines">
      {lines.map((l) => (
        <li key={l.id} className="tj-r is-line">
          <Rails last={l.index === null} />
          <div className="tj-r__card">
            <button type="button" className="tj-r__head" onClick={() => onOpen(policyId, l.id)}>
              <Idx index={l.index} />
              <span className="tj-r__name">
                {l.index !== null && <span className="u-sr-only">Rule {l.index + 1}: </span>}
                {l.name}
              </span>
              {l.enabled ? <RuleOutcome decision={l.decision} lit={false} /> : <span className="tj-r__word">Switched off</span>}
            </button>
          </div>
        </li>
      ))}
    </ol>
  )
})

/* The rail through the rules' numbers: into this one from the gap above,
   and out of it towards the next — each lit once the engine has walked it. */
function Rails({ last, into = false, out = false }: { last: boolean; into?: boolean; out?: boolean }) {
  return (
    <>
      <span className={`tj-r__rail is-in${into ? ' is-lit' : ''}`} aria-hidden />
      {!last && <span className={`tj-r__rail is-out${out ? ' is-lit' : ''}`} aria-hidden />}
    </>
  )
}

function Idx({ index, skel = false }: { index: number | null; skel?: boolean }) {
  if (skel) return <span className="tj-skel is-idx" />
  if (index === null)
    return (
      <span className="tj-r__idx is-last" aria-hidden>
        <CornerDownRight size={12} strokeWidth={2} />
      </span>
    )
  return (
    <span className="tj-r__idx" aria-hidden>
      {index + 1}
    </span>
  )
}

// --- A rule of the one that decides ----------------------------------------------------------

const WORD: Record<EngineRule['state'], string> = {
  match: 'Match',
  'no-match': 'No match',
  unknown: "Can't tell",
  possible: 'If not',
  off: 'Switched off',
  'not-reached': 'Not reached',
}

export interface RuleRowProps {
  rule: EngineRule
  s: number
  /** Show all checks: every folded rule open again, with every row. */
  showAll: boolean
  /** The engine walked into it: the rail above it is lit. */
  walked: boolean
  /** The engine walked on past it, to the next: the rail below it is lit. */
  onward: boolean
  interactive: boolean
  /** Its rows' tooltips may open: the run is done and the pointer has moved since. */
  hoverable?: boolean
  hot: boolean
  active: boolean
  animate: boolean
  reduced: boolean
  onHover: (n: NodeId | null) => void
  onOpen: (ruleId: string) => void
  onAdd: (field: FormField) => void
}

/* What a rule shows at step `s`: its phase, whether it has folded, and each
   read row's phase. Two steps that show the same are the same drawing. */
const ruleSig = (r: EngineRule, s: number) =>
  `${rulePhase(r, s)}|${ruleFolded(r, s) ? 1 : 0}|${r.checkAt.map((_a, k) => checkPhase(r, k, s)[0]).join('')}`

const sameRule = (a: RuleRowProps, b: RuleRowProps) =>
  a.rule === b.rule &&
  ruleSig(a.rule, a.s) === ruleSig(b.rule, b.s) &&
  a.showAll === b.showAll &&
  a.walked === b.walked &&
  a.onward === b.onward &&
  a.interactive === b.interactive &&
  a.hoverable === b.hoverable &&
  a.hot === b.hot &&
  a.active === b.active &&
  a.animate === b.animate &&
  a.reduced === b.reduced &&
  a.onHover === b.onHover &&
  a.onOpen === b.onOpen &&
  a.onAdd === b.onAdd

/* A rule, inside the policy that decides. A skeleton line until the engine
   opens it; then its head and its checks arriving one row at a time under the
   soft ring — each row arriving with a spinner, then its mark landing; then
   settled:

     match        the accent ring, every row ✓, its THEN in full tone
     no-match     for a beat the rows it read, the failing one ✕; then, as
                  the engine leaves it, the failing row alone, said as ONE line
     can't tell   the rows that could not be told, each with Add
     if not       the last row when the answer Depends: reached, flat, its
                  THEN unlit — what happens if the rules above do not match,
                  never a match
     not reached  its title, ghosted
     off          its title, ghosted, "Switched off"

   The head is the button (it opens the rule on its board, in test mode); the
   rows are not in it, so a row's own controls — its sub-checks, Add — are not
   buttons inside a button. */
export const RuleRow = memo(function RuleRow({ rule, s, showAll, walked, onward, interactive, hoverable = interactive, hot, active, animate, reduced, onHover, onOpen, onAdd }: RuleRowProps) {
  const phase = rulePhase(rule, s)
  const ghost = rule.state === 'not-reached' || rule.state === 'off'

  if (phase === 'waiting') {
    return (
      <li className="tj-r is-waiting" data-node={rule.node} aria-hidden>
        <Rails last={rule.index === null} />
        <div className="tj-r__card">
          <div className="tj-r__head is-skel" data-port>
            <Idx index={rule.index} skel />
            <span className="tj-skel is-line" />
          </div>
        </div>
      </li>
    )
  }

  const settled = phase === 'settled'
  const folded = settled && rule.state === 'no-match' && ruleFolded(rule, s) && !showAll
  const tone = !settled ? 'is-working' : ghost ? 'is-ghost' : rule.state === 'match' ? 'is-lit' : folded ? 'is-folded' : rule.state === 'possible' ? 'is-possible' : 'is-missed'
  /* The rows on the rule: the ones read so far while it works; settled, all
     of a match; the ones read of a no-match for its beat before it folds to
     its failing row, and every one under Show all; the untold ones of a
     can't-tell, or all. */
  const rows = rule.checks
    .map((row, k) => ({ row, k, skipped: k >= rule.checked }))
    .filter(({ row, k, skipped }) => {
      if (!settled) return checkPhase(rule, k, s) !== 'hidden'
      if (folded) return k === rule.failing
      if (rule.state === 'no-match') return showAll || !skipped
      if (rule.state === 'unknown') return showAll || row.status !== 'pass'
      return true
    })
  const end = !settled ? (
    <RuleOutcome decision={rule.decision} lit={false} />
  ) : rule.state === 'match' ? (
    <RuleOutcome decision={rule.decision} lit />
  ) : rule.state === 'possible' ? (
    <span className="tj-r__end">
      <Appear animate={animate} className="tj-r__word is-possible">
        {WORD.possible}
      </Appear>
      <RuleOutcome decision={rule.decision} lit={false} />
    </span>
  ) : (
    <Appear animate={animate} className={`tj-r__word is-${rule.state}`}>
      {WORD[rule.state]}
    </Appear>
  )

  return (
    <li
      className={`tj-r ${tone}${hot ? ' is-hot' : ''}`}
      data-node={rule.node}
      {...(active ? { 'data-active': '' } : null)}
      onPointerMove={(e) => interactive && moved(e) && !hot && onHover(rule.node)}
      onPointerLeave={() => interactive && onHover(null)}
    >
      <Rails last={rule.index === null} into={walked} out={onward} />
      <div className="tj-r__card">
        <button
          type="button"
          className="tj-r__head"
          data-port
          onClick={() => onOpen(rule.id)}
          onFocus={() => interactive && onHover(rule.node)}
          onBlur={() => interactive && onHover(null)}
          tabIndex={settled && interactive ? 0 : -1}
        >
          <Idx index={rule.index} />
          <Appear animate={animate} className="tj-r__name">
            {rule.index !== null && <span className="u-sr-only">Rule {rule.index + 1}: </span>}
            {rule.name}
          </Appear>
          {end}
          {settled && rule.state === 'match' && <span className="u-sr-only">, {WORD.match}</span>}
        </button>
        {!ghost && (
          <ul className="tj-checks" aria-label={`Checks in ${rule.name}`}>
            <AnimatePresence initial={false}>
              {rows.map(({ row, k, skipped }) => (
                <CheckRowView
                  key={row.key}
                  row={row}
                  working={!settled && checkPhase(rule, k, s) === 'working'}
                  skipped={settled && skipped}
                  line={folded}
                  animate={animate}
                  reduced={reduced}
                  settled={settled}
                  hoverable={hoverable}
                  onAdd={onAdd}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </li>
  )
}, sameRule)

/* One category of checks. Its word, what the rule asks, what this sign-in
   showed, and the mark on the right — a spinner while it is being read; grey
   "Not checked" and no mark for a row the engine never read because an
   earlier one ended the rule. A category with checks of its own (a device
   profile, a zone's two halves) opens them in place under a small chevron;
   they are never shown unasked. Not stated is grey words and Add, which opens
   the sign-in on that field.

   `line`: the rule has folded to this row, and it says what failed as one
   line — its icon, word and ✕ where they were, only its words changing.

   Its wrapper is eased to its content's measured height: arriving from
   nothing, leaving to nothing, and folding to one line, so neither it nor
   anything below it ever jumps. */
function CheckRowView({
  row,
  working,
  skipped,
  line,
  animate,
  reduced,
  settled,
  hoverable,
  onAdd,
}: {
  row: CheckRow
  working: boolean
  skipped: boolean
  line: boolean
  animate: boolean
  reduced: boolean
  settled: boolean
  hoverable: boolean
  onAdd: (field: FormField) => void
}) {
  const [open, setOpen] = useState(false)
  const inner = useRef<HTMLDivElement | null>(null)
  const h = useHeight(inner)
  const Icon = CATEGORY_ICON[row.category]
  const status = working ? 'working' : skipped ? 'skipped' : row.status
  const notStated = !working && !skipped && row.value === NOT_STATED_WORD
  const said = working ? 'Checking' : notStated ? NOT_STATED_WORD : CONDITION_WORDS[row.status]
  const subsOpen = open && !line
  /* Arriving: the height opens decelerating, the row brightening a little
     ahead of it. Folding to one line: the height eases once the rows before
     it have gone (below). Leaving: the height closes in and out, the row
     fading first, so what goes is gone before the space does. */
  const ease = animate ? { height: { duration: 0.18, ease: EASE_OUT }, opacity: { duration: 0.14, ease: EASE_OUT } } : { duration: 0 }
  return (
    <motion.li
      className="tj-crowwrap"
      initial={animate ? { height: 0, opacity: 0 } : false}
      animate={{ height: h ?? 'auto', opacity: 1 }}
      exit={reduced ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0, transition: { height: { duration: 0.24, ease: EASE_IN_OUT }, opacity: { duration: 0.12 } } }}
      transition={ease}
    >
      <div ref={inner} className="tj-crowin">
        <div className={`tj-crow is-${status}${line ? ' is-line' : ''}`}>
          <Icon className="tj-crow__icon" size={14} strokeWidth={2} aria-hidden />
          <span className="tj-crow__word">{row.word}</span>
          <MaybeTip on={hoverable && row.tip !== ''} text={<span className="tj-crow__tip">{row.tip}</span>} placement="bottom">
            <span className="tj-crow__text">
              <AnimatePresence initial={false} mode="popLayout">
                {/* The words change as the rows before this one close up,
                    in one short cross-fade — the old out by 140 ms, the
                    sentence in from 80 ms — so there is never a moment
                    with no words, and hardly one with two. */}
                {line ? (
                  <motion.span
                    key="line"
                    className="tj-crow__say is-line"
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1, transition: { duration: animate ? 0.18 : 0, delay: animate ? 0.08 : 0, ease: EASE_OUT } }}
                    exit={{ opacity: 0, transition: { duration: animate ? 0.1 : 0, delay: animate ? 0.04 : 0 } }}
                  >
                    {foldedWords(row)}
                  </motion.span>
                ) : (
                  <motion.span
                    key="full"
                    className="tj-crow__say"
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1, transition: { duration: animate ? 0.2 : 0, delay: animate ? 0.08 : 0, ease: EASE_OUT } }}
                    exit={{ opacity: 0, transition: { duration: animate ? 0.12 : 0 } }}
                  >
                    <span className="tj-crow__req">{row.requirement}</span>
                    <span className={`tj-crow__val${notStated ? ' is-unset' : ''}`}>{row.value}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </MaybeTip>
          {notStated && settled && row.missing ? (
            <button type="button" className="tj-crow__add" onClick={() => onAdd(row.missing!)} aria-label={`Add ${row.word.toLowerCase()}`}>
              Add
            </button>
          ) : row.subs.length > 0 && !working && !skipped && !line ? (
            <button
              type="button"
              className="tj-crow__more"
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} ${row.word.toLowerCase()} checks`}
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown size={13} strokeWidth={2} aria-hidden className={open ? 'is-open' : undefined} />
            </button>
          ) : skipped ? (
            <span className="tj-crow__skip">Not checked</span>
          ) : (
            <span className="tj-crow__slot" aria-hidden />
          )}
          <span className="tj-crow__mark">
            {working ? <Spinner small /> : skipped ? null : <Mark status={row.status} pop={animate} />}
            {!skipped && <span className="u-sr-only">{said}</span>}
          </span>
        </div>
        {subsOpen && (
          <ul className="tj-subs" aria-label={`${row.word} checks`}>
            {row.subs.map((sub) => (
              <li key={sub.key} className={`tj-sub is-${sub.status}`}>
                <span className="tj-sub__label">{sub.label}</span>
                <span className="tj-sub__val">
                  {sub.actual}
                  {sub.required && <span className="tj-sub__req"> · {sub.required}</span>}
                </span>
                <span className="tj-crow__mark">
                  <Mark status={sub.status} pop={false} />
                  <span className="u-sr-only">{CONDITION_WORDS[sub.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.li>
  )
}

/* The folded row's words: the finding, less a word the row already says in
   its own column — "Risk  Score 86 is not below 40", not "Risk  Risk score". */
const foldedWords = (row: CheckRow) => (row.category === 'risk' ? row.line.replace(/^Risk score /, 'Score ') : row.line)

/* A row's answer landing where its spinner was: the glyph grows from a
   little smaller than itself and settles, with the least of an overshoot. */
function Mark({ status, pop }: { status: LineStatus; pop: boolean }) {
  const glyph = status === 'pass' ? <Check size={13} strokeWidth={2.6} /> : status === 'fail' ? <X size={13} strokeWidth={2.6} /> : <Minus size={13} strokeWidth={2.4} />
  return (
    <motion.span
      className={`tj-mark is-${status}`}
      aria-hidden
      initial={pop ? { scale: 0.55, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 26 }, opacity: { duration: 0.1 } } : { duration: 0 }}
    >
      {glyph}
    </motion.span>
  )
}
