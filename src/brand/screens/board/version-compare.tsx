import { ArrowLeftRight, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Rule } from '../../data'
import { Badge, Button, IconButton, Toggle } from '../../kit'
import { Picker, type PickerOption } from '../../picker'
import { useNameLookup } from '../../store'
import type { AlignedRow } from './policy-versions'
import { RuleCard, TerminalCard } from './RuleCard'

/* -----------------------------------------------------------------------------
   COMPARE, SIDE BY SIDE (V3, draft-v3.tsx; owner, 23 Nov 2026: "showcase both things side by side … the left side is
   read-only, and the right side can be the new version. The user can compare multiple … It should go in an animated
   way. Think about how we can make the compare part more interactive, more useful, and better").

   Over the whole board: version A on the left, version B on the right, both read only, each picked from its own
   dropdown and swapped with one press, so any two versions (and the draft) can be set against each other. The rules
   are lined up row by row (policy-versions.ts `alignRules`): a rule both have sits on one row; one B added stands on
   the right beside an empty slot, one B removed on the left beside the slot it left.

   THE CARDS ARE THE CANVAS'S OWN (owner, 24 Nov 2026: "make the compare cards look like the canvas cards"): the
   builder's RuleCard and TerminalCard, read only and folding on a press, as an application's Policies tab draws them.
   The change is said in the card's head, where the canvas says Complete: Added, Removed or Changed; what changed and
   where a rule moved from is one quiet line under the right-hand card. Unfolding a card unfolds its row, both sides,
   so Who, If and Then are read against each other; Expand all opens every row.

   Motion: the rows come in one after another, A's side from the left and B's from the right, and slide to their new
   places when either side is changed (Motion's layout animation, keyed by rule), so a move is seen as a move.
   Reduced motion: no slide, no stagger.
   -------------------------------------------------------------------------- */

export interface CompareSide {
  key: string
  title: string
  pill?: { word: string; tone: 'neutral' | 'info' | 'notice' | 'negative' | 'positive' }
  who: string
  fallback?: Rule
}

const KIND_PILL = {
  added: { word: 'Added', tone: 'positive' },
  removed: { word: 'Removed', tone: 'negative' },
  changed: { word: 'Changed', tone: 'info' },
} as const

const LAST = 'fallback'
const nothing = () => {}

export function VersionCompare({
  options,
  a,
  b,
  onA,
  onB,
  onSwap,
  rows,
  ruleLines,
  policyLines,
  fallbackLines,
  changesOnly,
  onChangesOnly,
  action,
  onClose,
}: {
  options: PickerOption[]
  a: CompareSide
  b: CompareSide
  onA: (key: string) => void
  onB: (key: string) => void
  onSwap: () => void
  rows: AlignedRow[]
  /** What changed on a rule both sides have, by rule id: "Moved to position 2", "Switched off". */
  ruleLines: Record<string, string[]>
  /** Changes to the policy itself: its applications, its audience. */
  policyLines: string[]
  /** Changes to the last row. */
  fallbackLines: string[]
  changesOnly: boolean
  onChangesOnly: (v: boolean) => void
  /** What can be done with the right-hand version, at the bar's end: Restore as draft. */
  action?: ReactNode
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const resolve = useNameLookup()
  const root = useRef<HTMLElement | null>(null)
  /* Focus comes into the view as it opens, so Escape and Tab start here. */
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  /* Which rows are unfolded: a row unfolds on both sides at once. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const fold = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const shown = changesOnly ? rows.filter((r) => r.kind !== 'same' || r.moved) : rows
  const lastChanged = fallbackLines.length > 0
  const lastShown = (!changesOnly || lastChanged) && !!a.fallback && !!b.fallback
  const empty = shown.length === 0 && !lastChanged && policyLines.length === 0
  const ids = [...shown.map((r) => r.id), ...(lastShown ? [LAST] : [])]
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id))

  const slide = (side: 'a' | 'b', i: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
      : {
          initial: { opacity: 0, x: side === 'a' ? -14 : 14 },
          animate: { opacity: 1, x: 0 },
          transition: { type: 'spring' as const, stiffness: 380, damping: 34, delay: Math.min(i * 0.035, 0.35) },
        }

  const pillOf = (p: { word: string; tone: 'positive' | 'negative' | 'info' } | null) => (p ? <Badge tone={p.tone}>{p.word}</Badge> : undefined)

  /* One side of a row: the canvas's card, read only. Its press unfolds the whole row. */
  const card = (rowId: string, rule: Rule, n: number, side: 'a' | 'b', i: number, kind: string, head?: ReactNode, note?: string) => (
    <motion.div className={`bv3c__cell${kind ? ` is-${kind}` : ''}`} {...slide(side, i)}>
      <RuleCard
        rule={rule}
        index={n - 1}
        openPart={null}
        state="ready"
        shadowed={false}
        dragging={false}
        expanded={open.has(rowId)}
        onToggleExpand={() => fold(rowId)}
        resolve={resolve}
        canUp={false}
        canDown={false}
        locked
        onOpen={() => fold(rowId)}
        onToggle={nothing}
        onMove={nothing}
        onDuplicate={nothing}
        onDelete={nothing}
        onGrip={nothing}
        onHover={nothing}
        cardRef={nothing}
        foldOnPress
        head={head}
        idPrefix={`cmp-${side}-`}
      />
      {note && <p className="bv3c__note">{note}</p>}
    </motion.div>
  )

  const slot = (text: string, side: 'a' | 'b', i: number) => (
    <motion.div className="bv3c__slot" {...slide(side, i)}>
      {text}
    </motion.div>
  )

  const head = (s: CompareSide, which: 'a' | 'b') => (
    <div className={`bv3c__colhead is-${which}`}>
      <b>{s.title}</b>
      {s.pill && <Badge tone={s.pill.tone}>{s.pill.word}</Badge>}
      <span>{s.who}</span>
    </div>
  )

  const last = (s: CompareSide, side: 'a' | 'b', i: number) =>
    s.fallback ? (
      <motion.div className={`bv3c__cell${side === 'b' && lastChanged ? ' is-changed' : ''}`} {...slide(side, i)}>
        <TerminalCard
          rule={s.fallback}
          resolve={resolve}
          selected={false}
          expanded={open.has(LAST)}
          onSelect={() => fold(LAST)}
          onToggleExpand={() => fold(LAST)}
          cardRef={nothing}
          foldOnPress
          head={side === 'b' && lastChanged ? pillOf(KIND_PILL.changed) : undefined}
          idPrefix={`cmp-${side}-`}
        />
        {side === 'b' && lastChanged && <p className="bv3c__note">{fallbackLines.join(' · ')}</p>}
      </motion.div>
    ) : null

  return (
    <motion.section
      ref={root}
      className="bv3c"
      aria-label={`Compare ${a.title} with ${b.title}`}
      tabIndex={-1}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 360, damping: 34 }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <header className="bv3c__bar">
        <h2 className="bv3c__title">Compare</h2>
        <div className="bv3c__pickers">
          <Picker label="Left version" size="sm" value={a.key} options={options} onChange={onA} />
          <IconButton icon={ArrowLeftRight} size="sm" tone="ghost" label="Swap sides" onClick={onSwap} />
          <Picker label="Right version" size="sm" value={b.key} options={options} onChange={onB} />
        </div>
        <label className="bv3c__only">
          <Toggle size="sm" checked={changesOnly} onChange={onChangesOnly} label="Changes only" />
          <span>Changes only</span>
        </label>
        <Button variant="ghost" size="sm" icon={allOpen ? ChevronsDownUp : ChevronsUpDown} onClick={() => setOpen(allOpen ? new Set() : new Set(ids))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
        <span className="bv3c__end">
          {action}
          <IconButton icon={X} size="sm" tone="ghost" label="Close Compare" onClick={onClose} />
        </span>
      </header>

      <div className="bv3c__scroll">
        <div className="bv3c__grid">
          {head(a, 'a')}
          {head(b, 'b')}

          {policyLines.length > 0 && (
            <div className="bv3c__policy">
              <span className="u-label">Policy</span>
              <ul>
                {policyLines.map((l, k) => (
                  <li key={k}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <LayoutGroup>
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((r, i) => {
                const pill = r.kind === 'same' ? null : KIND_PILL[r.kind]
                /* What became of it, said once under the right-hand card: where it moved from, and what changed. */
                const said = [...(r.moved && r.a ? [`Was rule ${r.a.n}`] : []), ...(r.kind === 'changed' ? (ruleLines[r.id] ?? []).filter((l) => !/^Moved to position/.test(l)) : [])].join(' · ')
                return (
                  <motion.div
                    key={r.id}
                    className={`bv3c__row is-${r.kind}${r.moved ? ' is-moved' : ''}`}
                    layout={reduce ? false : 'position'}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  >
                    {r.a ? card(r.id, r.a.rule, r.a.n, 'a', i, r.kind === 'removed' ? 'removed' : '', r.kind === 'removed' ? pillOf(pill) : undefined) : slot(`Not in ${a.title}`, 'a', i)}
                    {r.b ? card(r.id, r.b.rule, r.b.n, 'b', i, r.kind === 'same' ? '' : r.kind, r.kind !== 'same' ? pillOf(pill) : undefined, said || undefined) : slot(`Not in ${b.title}`, 'b', i)}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </LayoutGroup>

          {lastShown && (
            <div className="bv3c__row is-last">
              {last(a, 'a', shown.length)}
              {last(b, 'b', shown.length)}
            </div>
          )}

          {empty && <p className="bv3c__none">No differences between {a.title} and {b.title}</p>}
        </div>
      </div>
    </motion.section>
  )
}
