import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, ListFilter, Minus, Users, X } from 'lucide-react'

import type { Policy } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { EmptyState } from '../empty'
import { Badge, Button, Callout, Field, Tip, TipDot } from '../kit'
import { useBrand, useNameLookup } from '../store'
import {
  BREAK_IN_TIP,
  COUNT_CELLS,
  REASON_MAX,
  acceptanceFor,
  acceptanceOptions,
  acceptedSaid,
  breakInRows,
  canAccept,
  changedCounts,
  countsMoved,
  countsSpoken,
  decidedBySaid,
  factsSaid,
  fixButton,
  fixLine,
  fixRuleRef,
  fixToast,
  applyBreakInFix,
  groupRows,
  groupsById,
  movedRows,
  needsSaid,
  offeredFix,
  possibleSaid,
  rowLayoutId,
  rowSpoken,
  secondFactorSaid,
  skippedSaid,
  type BreakInGroup,
  type BreakInRow,
  type CountKey,
  type FixPreview,
} from './break-in-model'
import { runBreakIn, type BreakInCounts, type BreakInResult } from './gauntlet'
import type { SimEnv } from './simulate'
import { useTestingSay } from './testing/session-state'
import { whatChangesSaid } from './what-changes'
import './break-in.css'

/* -----------------------------------------------------------------------------
   The Break-in test: fifteen scripted sign-ins against one policy's rules,
   counted by what came back.

   Four counts, each a cell that filters the list to its group and says what it
   counts in one line. No grade, no exposure figure: a letter is a judgement,
   and what an administrator acts on is how many of which (owner, 25 Sep
   2026). The rows under the counts are every card the policy governs, in
   groups with no count of their own — the holes, the costs, "Less than asked"
   and "Can't tell" (which have no cell), then Held.

   A row opens to the sign-in it scripts, the rule that decided it, and — when
   its card names one — a fix, with what the fix would do before it is done.
   A fix is never looser (break-in-model.ts). On the board the fix applies to
   the draft, undoably; anywhere else the button opens the policy on the board
   at the rule it would change, because a testing page does not edit policies.

   A result the tenant agrees with can be accepted, with a reason, and the row
   moves to Held saying who accepted it and when. Restore expectation undoes it.

   Motion explains a change and nothing else. The first run — a new policy
   included — fades the rows in, in order, opacity only. After that, a row
   whose group moved slides to its new place (framer `layout`, position only)
   and it and any count that moved get an outline that fades over 1.2 s — an
   outline, never a transform, on the element framer moves. Under reduced
   motion there is no movement: the row says "Changed" until the next change.
   -------------------------------------------------------------------------- */

const MARK: Record<BreakInGroup, { icon: typeof X; tone: string }> = {
  'got-through': { icon: X, tone: 'negative' },
  'weaker-factor': { icon: X, tone: 'negative' },
  'less-than-asked': { icon: X, tone: 'negative' },
  'locked-out': { icon: X, tone: 'notice' },
  'extra-prompts': { icon: X, tone: 'notice' },
  'cant-tell': { icon: Minus, tone: 'unknown' },
  held: { icon: Check, tone: 'positive' },
}

/** The first run's fade: each row 120 ms, 40 ms after the one above, fifteen at most. */
const FADE = { duration: 0.12, step: 0.04, cap: 15 }
const MOVE = { duration: 0.24, ease: [0.2, 0, 0, 1] as const }

/* What the test keeps for a host that unmounts it for a while and brings it
   back — the board's panel, whose column a rule opened from the test takes
   until the rule's × — so coming back is not a first run. The run last seen,
   so nothing fades in again and the counts are not said again, only what
   moved while it was away; and the count pressed and the row open. The host
   owns the holder and empties it when the test starts afresh. */
export interface BreakInKept {
  policyId: string
  groups: Record<string, BreakInGroup>
  counts: BreakInCounts
  filter: BreakInGroup | null
  openId: string | null
}

const keptFor = (kept: { current: BreakInKept | null } | undefined, policyId: string): BreakInKept | null =>
  kept?.current?.policyId === policyId ? kept.current : null

interface Marks {
  /** Bumped on every run, so an outline restarts when the same row moves again. */
  n: number
  first: boolean
  rows: string[]
  cells: CountKey[]
  /** What the status region says for this run, or null. */
  spoken: string | null
}

export function BreakInView({
  policy,
  policies,
  env,
  caption,
  onApplyFix,
  onOpenInBoard,
  kept,
}: {
  /** The rules to test: the board's draft, or a stored policy as the builders open it. */
  policy: Policy
  /** The tenant's policies, for what a fix changes across it. */
  policies: readonly Policy[]
  env: SimEnv
  /** Under the title: which version of the rules ran. */
  caption: string
  /** The board: apply a fix to the draft, with the toast that says so. */
  onApplyFix?: (next: Policy, toast: string) => void
  /** Everywhere else: open the policy on the board at a rule ('fallback' for the last row). */
  onOpenInBoard?: (rule?: string) => void
  /** The board's panel: what the test keeps while a rule it opened takes the column. */
  kept?: { current: BreakInKept | null }
}) {
  const { breakInAccepted, acceptBreakIn, account } = useBrand()
  const resolve = useNameLookup()
  const say = useTestingSay()
  const reduced = useReducedMotion() === true
  const headId = useId()
  const [filter, setFilter] = useState<BreakInGroup | null>(() => keptFor(kept, policy.id)?.filter ?? null)
  const [openId, setOpenId] = useState<string | null>(() => keptFor(kept, policy.id)?.openId ?? null)
  const [focusReq, setFocusReq] = useState<{ id: string; n: number } | null>(null)

  const accepted = breakInAccepted[policy.id]
  const options = useMemo(() => acceptanceOptions(accepted), [accepted])
  const run = useMemo<BreakInResult | null>(() => {
    try {
      return runBreakIn(policy, env, options)
    } catch (e) {
      console.error('Break-in test could not run', e)
      return null
    }
  }, [policy, env, options])
  const rows = useMemo(() => (run ? breakInRows(run, policy, accepted) : []), [run, policy, accepted])

  /* What moved since the last run of this policy, worked out as the run
     arrives — React's own pattern for state that follows a changed input. A
     new policy is a first run: nothing is outlined, and the rows fade in.
     Brought back by the host, the run it kept stands in for the last one. */
  const [seen, setSeen] = useState<{ policyId: string; run: BreakInResult | null; groups: Record<string, BreakInGroup>; counts: BreakInCounts } | null>(() => {
    const k = keptFor(kept, policy.id)
    return k && { policyId: k.policyId, run: null, groups: k.groups, counts: k.counts }
  })
  const [marks, setMarks] = useState<Marks>({ n: 0, first: true, rows: [], cells: [], spoken: null })
  if (run && seen?.run !== run) {
    const same = seen?.policyId === policy.id
    setSeen({ policyId: policy.id, run, groups: groupsById(rows), counts: run.counts })
    setMarks({
      n: marks.n + 1,
      first: !same,
      rows: same ? movedRows(seen.groups, rows) : [],
      cells: same ? changedCounts(seen.counts, run.counts) : [],
      spoken: same ? countsMoved(seen.counts, run.counts) : countsSpoken(run.counts),
    })
  }
  if (seen && seen.policyId !== policy.id && (filter !== null || openId !== null)) {
    setFilter(null)
    setOpenId(null)
  }

  useEffect(() => {
    if (marks.spoken) say(marks.spoken)
  }, [marks, say])

  useEffect(() => {
    if (kept && seen) kept.current = { policyId: seen.policyId, groups: seen.groups, counts: seen.counts, filter, openId }
  }, [kept, seen, filter, openId])

  /* After Accept, Restore or a fix, focus goes back to the row's toggle —
     which may have moved to another group, and so be another element. The
     row leaves the group a pressed count shows (an accepted row is Held, and
     Held has no count), so the filter goes in the same event: otherwise the
     row, its toggle and the focus would go with it. */
  useEffect(() => {
    if (focusReq) document.getElementById(focusReq.id)?.focus()
  }, [focusReq])
  const focusOn = (id: string) => setFocusReq((r) => ({ id, n: (r?.n ?? 0) + 1 }))
  const refocus = (rowId: string) => {
    setFilter(null)
    focusOn(toggleId(headId, rowId))
  }

  if (!run) {
    return (
      <section className="bbi" aria-labelledby={headId}>
        <Head id={headId} caption={caption} />
        <Callout tone="notice">Break-in test could not run.</Callout>
      </section>
    )
  }

  const skipped = skippedSaid(run)
  const groups = groupRows(rows, filter)
  const pressedCell = COUNT_CELLS.find((c) => c.group === filter)
  const order = new Map(groups.flatMap((g) => g.rows).map((r, i) => [r.id, i]))

  return (
    <section className="bbi" aria-labelledby={headId}>
      <Head id={headId} caption={caption} />

      {run.rounds.length === 0 ? (
        <EmptyState compact icon={Users} title="No scripted sign-ins for this audience" />
      ) : (
        <>
          <div className="bbi__counts" role="group" aria-label="Counts">
            {COUNT_CELLS.map((c) => {
              const pressed = filter === c.group
              const moved = marks.cells.includes(c.key)
              return (
                <Tip key={c.key} text={c.tip}>
                  <button
                    type="button"
                    id={cellId(headId, c.key)}
                    className={`bbi__cell${pressed ? ' is-pressed' : ''}`}
                    aria-pressed={pressed}
                    aria-label={`${c.word}, ${run.counts[c.key]}`}
                    onClick={() => setFilter(pressed ? null : c.group)}
                  >
                    <span className="bbi__num">{run.counts[c.key]}</span>
                    <span className="bbi__word">{c.word}</span>
                    {moved && !reduced && <span key={marks.n} className="bbi__flash" aria-hidden />}
                  </button>
                </Tip>
              )
            })}
          </div>

          {groups.length > 0 && (
            <div className="bbi__cols" aria-hidden>
              <span className="bbi__colname">Sign-in</span>
              <span>Expected</span>
              <span>Got</span>
              <span>Rule</span>
            </div>
          )}

          <div className="bbi__groups" key={policy.id}>
            {/* A pressed count of 0: its group has no rows to draw. */}
            {groups.length === 0 && pressedCell && (
              <EmptyState
                compact
                icon={ListFilter}
                title="No sign-ins"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFilter(null)
                      focusOn(cellId(headId, pressedCell.key))
                    }}
                  >
                    Clear filter
                  </Button>
                }
              />
            )}
            {groups.map((g) => (
              <div key={g.group} className="bbi__group">
                <h3 className="bbi__gh">{g.word}</h3>
                <ul className="bbi__list">
                  {g.rows.map((row) => (
                    <Row
                      key={row.id}
                      row={row}
                      policy={policy}
                      policies={policies}
                      env={env}
                      baseId={headId}
                      open={openId === row.id}
                      onToggle={() => setOpenId((v) => (v === row.id ? null : row.id))}
                      counts={run.counts}
                      options={options}
                      resolve={resolve}
                      fadeDelay={marks.first && !reduced ? Math.min(order.get(row.id) ?? 0, FADE.cap - 1) * FADE.step : null}
                      moved={marks.rows.includes(row.id)}
                      flashKey={marks.n}
                      reduced={reduced}
                      onRule={onOpenInBoard}
                      onFix={(fix) => {
                        if (onApplyFix) onApplyFix(applyBreakInFix(policy, fix), fixToast(fix, policy))
                        else onOpenInBoard?.(fixRuleRef(fix, policy))
                        refocus(row.id)
                      }}
                      fixLabel={onApplyFix ? undefined : 'Open in board'}
                      onAccept={(reason) => {
                        const a = acceptanceFor(row.round, account.name, new Date().toISOString(), reason)
                        if (a) acceptBreakIn(policy.id, row.id, a)
                        refocus(row.id)
                      }}
                      onRestore={() => {
                        acceptBreakIn(policy.id, row.id, null)
                        refocus(row.id)
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {skipped && <p className="bbi__foot">{skipped}</p>}
    </section>
  )
}

const toggleId = (base: string, cardId: string) => `${base}-row-${cardId}`
const cellId = (base: string, key: CountKey) => `${base}-count-${key}`

function Head({ id, caption }: { id: string; caption: string }) {
  return (
    <div className="bbi__head">
      <span className="bbi__titleline">
        <h2 id={id} className="bbi__title">
          Break-in test
        </h2>
        <TipDot text={BREAK_IN_TIP} label="About the break-in test" />
      </span>
      <p className="bbi__caption">{caption}</p>
    </div>
  )
}

/* One card's row: the toggle (its name, what it expected and what it got),
   the rule beside it as its own control, and the lines when it is open. */
function Row({
  row,
  policy,
  policies,
  env,
  baseId,
  open,
  onToggle,
  counts,
  options,
  resolve,
  fadeDelay,
  moved,
  flashKey,
  reduced,
  onRule,
  onFix,
  fixLabel,
  onAccept,
  onRestore,
}: {
  row: BreakInRow
  policy: Policy
  policies: readonly Policy[]
  env: SimEnv
  baseId: string
  open: boolean
  onToggle: () => void
  counts: BreakInCounts
  options: ReturnType<typeof acceptanceOptions>
  resolve: ReturnType<typeof useNameLookup>
  /** Seconds to wait before fading in on a first run; null: no fade. */
  fadeDelay: number | null
  moved: boolean
  flashKey: number
  reduced: boolean
  onRule?: (rule?: string) => void
  onFix: (fix: NonNullable<ReturnType<typeof offeredFix>>['fix']) => void
  /** The fix button's label where it opens the board instead of applying. */
  fixLabel?: string
  onAccept: (reason: string) => void
  onRestore: () => void
}) {
  const bodyId = `${baseId}-body-${row.id}`
  const mark = MARK[row.group]
  const Icon = mark.icon
  const heldAccepted = row.group === 'held' && row.accepted

  return (
    <motion.li
      layoutId={rowLayoutId(baseId, policy.id, row.id)}
      layout="position"
      className={`bbi__row${open ? ' is-open' : ''}`}
      initial={fadeDelay === null ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ opacity: { duration: FADE.duration, delay: fadeDelay ?? 0 }, layout: MOVE }}
    >
      <div className="bbi__line">
        <button type="button" id={toggleId(baseId, row.id)} className="bbi__toggle" aria-expanded={open} aria-controls={bodyId} aria-label={rowSpoken(row)} onClick={onToggle}>
          <span className={`bbi__mark is-${mark.tone}`} aria-hidden>
            <Icon size={14} strokeWidth={2.2} />
          </span>
          <span className="bbi__name">
            <span className="bbi__clip" title={row.name}>
              {row.name}
            </span>
            {heldAccepted && <Badge tone="neutral">Accepted</Badge>}
            {moved && reduced && <span className="bbi__changed">Changed</span>}
          </span>
          <span className="bbi__dec">{DECISION_WORDS[row.expected]}</span>
          <span className={`bbi__dec${row.got ? '' : ' is-unknown'}`}>{row.got ? DECISION_WORDS[row.got] : "Can't tell"}</span>
        </button>
        {row.ruleLabel && onRule && row.ruleRef ? (
          <button type="button" className="bbi__rule" aria-label={ruleSpoken(row)} onClick={() => onRule(row.ruleRef)}>
            {row.ruleLabel}
          </button>
        ) : (
          <span className="bbi__rule is-text">{row.ruleLabel}</span>
        )}
      </div>
      {open && (
        <Body
          id={bodyId}
          row={row}
          policy={policy}
          policies={policies}
          env={env}
          counts={counts}
          options={options}
          resolve={resolve}
          onFix={onFix}
          fixLabel={fixLabel}
          onAccept={onAccept}
          onRestore={onRestore}
        />
      )}
      {moved && !reduced && <span key={flashKey} className="bbi__flash" aria-hidden />}
    </motion.li>
  )
}

function ruleSpoken(row: BreakInRow): string {
  if (row.ruleIndex === null) return 'Open the last row on the board'
  const name = row.round.trace.steps[row.ruleIndex ?? 0]?.ruleName ?? ''
  return `Open ${row.ruleLabel.toLowerCase()}, ${name}, on the board`
}

function Body({
  id,
  row,
  policy,
  policies,
  env,
  counts,
  options,
  resolve,
  onFix,
  fixLabel,
  onAccept,
  onRestore,
}: {
  id: string
  row: BreakInRow
  policy: Policy
  policies: readonly Policy[]
  env: SimEnv
  counts: BreakInCounts
  options: ReturnType<typeof acceptanceOptions>
  resolve: ReturnType<typeof useNameLookup>
  onFix: (fix: NonNullable<ReturnType<typeof offeredFix>>['fix']) => void
  fixLabel?: string
  onAccept: (reason: string) => void
  onRestore: () => void
}) {
  const [accepting, setAccepting] = useState(false)
  const decided = decidedBySaid(row)
  const factor = secondFactorSaid(row, policy)
  const possible = possibleSaid(row)
  const needs = needsSaid(row)
  /* Computed for the open row only: a fix is a deck run and two tenant sweeps. */
  const offer = useMemo(() => offeredFix(row.round, policy, env, options, policies, counts), [row.round, policy, env, options, policies, counts])

  return (
    <div id={id} className="bbi__body">
      <p className="bbi__facts">{factsSaid(row.round, env)}</p>
      <dl className="bbi__lines">
        {decided && (
          <Line label="Decided by">
            {decided.label}
            {decided.reason && <span className="bbi__grey"> · {decided.reason}</span>}
          </Line>
        )}
        {factor && <Line label="Second factor">{factor}</Line>}
        {possible && <Line label="Possible">{possible}</Line>}
        {needs && <Line label="Needs">{needs}</Line>}
        {offer && <Line label="Fix">{fixLine(offer.fix, policy, resolve)}</Line>}
        {offer && (
          <Line label="After this fix">
            <AfterFix preview={offer.preview} />
          </Line>
        )}
      </dl>

      {row.accepted && (
        <div className="bbi__accepted">
          <p>{acceptedSaid(row.accepted)}</p>
          <p className="bbi__grey">Reason: {row.accepted.reason}</p>
        </div>
      )}

      {accepting ? (
        <AcceptForm
          onCancel={() => setAccepting(false)}
          onAccept={(reason) => {
            setAccepting(false)
            onAccept(reason)
          }}
        />
      ) : (
        (offer || (canAccept(row) && !row.accepted) || row.accepted) && (
          <div className="bbi__acts">
            {offer && (
              <Button variant="neutral" size="sm" onClick={() => onFix(offer.fix)}>
                {fixLabel ?? fixButton(offer.fix, policy)}
              </Button>
            )}
            {canAccept(row) && !row.accepted && (
              <Button variant="ghost" size="sm" onClick={() => setAccepting(true)}>
                Accept this result
              </Button>
            )}
            {row.accepted && (
              <Button variant="ghost" size="sm" onClick={onRestore}>
                Restore expectation
              </Button>
            )}
          </div>
        )
      )}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bbi__lr">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/* The four counts with the fix applied, each cell it moves outlined, then
   what changes across the tenant, the looser moves first. */
function AfterFix({ preview }: { preview: FixPreview }) {
  return (
    <span className="bbi__after">
      <span className="bbi__afterline">
        {COUNT_CELLS.map((c, i) => (
          <span key={c.key}>
            {i > 0 && ' · '}
            <span className={preview.changed.includes(c.key) ? 'bbi__moved' : undefined}>
              {c.word} {preview.counts[c.key]}
            </span>
          </span>
        ))}
      </span>
      <span className="bbi__afterline bbi__grey">{whatChangesSaid(preview.line)}</span>
    </span>
  )
}

/* Accept this result: a reason, then Accept. Never disabled — pressing it
   with no reason says "Enter a reason" under the field, where the answer
   goes (owner, 26 Sep 2026: a blocked step says why inside the form, and the
   buttons are only buttons). */
function AcceptForm({ onAccept, onCancel }: { onAccept: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const inputId = useId()
  const errId = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const empty = reason.trim() === ''
  /* The reason first: it is the one thing the form asks. */
  useEffect(() => {
    input.current?.focus()
  }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (empty) {
      setTried(true)
      return
    }
    onAccept(reason)
  }
  return (
    <form
      className="bbi__accept"
      aria-label="Accept this result"
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onCancel()
      }}
    >
      <Field label="Reason" htmlFor={inputId}>
        <input
          id={inputId}
          type="text"
          required
          maxLength={REASON_MAX}
          ref={input}
          value={reason}
          aria-invalid={tried && empty}
          aria-describedby={tried && empty ? errId : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {tried && empty && (
        <p id={errId} className="bbi__said" role="alert">
          Enter a reason
        </p>
      )}
      <div className="bbi__acts">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="neutral" size="sm" type="submit">
          Accept
        </Button>
      </div>
    </form>
  )
}
