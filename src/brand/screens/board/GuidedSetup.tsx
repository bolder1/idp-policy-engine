import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AppWindow, Check, ChevronRight, Columns2, Gauge, Globe, ListChecks, MonitorSmartphone, PanelLeft, PanelRight, Plus, Square, SquareDashedMousePointer, Trash2, Undo2, X, type LucideIcon } from 'lucide-react'

import type { Policy, Rule, RuleWho } from '../../data'
import type { DescribeTenant } from '../../create/describe-model'
import { DecisionMark } from '../../decision-badge'
import { Face } from '../../faces'
import { Badge, Button, IconButton, RowMenu } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { whoKey } from '../../rule-who'
import { WhoCombo } from '../who-combo'
import { DecisionChoices, GuidedRuleForm } from './GuidedRuleForm'
import { useGuidedPlay } from './describe-stage'
import { lineText, type SaidLine, type SaidPart } from './describe-said'
import { GUIDED_SIDES, lastRowReached, quickActions, type GuidedAct, type GuidedCutoffs, type GuidedEntry, type GuidedSide, type GuidedStep } from './guided-setup'
import { conditionIcon } from './tones'
import './describe.css'
import './guided-setup.css'

/* -----------------------------------------------------------------------------
   Guided setup (docs/specs/GUIDED-SETUP.md, 19 Oct 2026) — Describe it,
   renamed, on picks and forms only. The basic admin's lane: a rule in a few
   clicks, said back in plain lines, then Save policy. The power admin keeps
   the canvas and the rule panel, which can stand beside it.

   Top to bottom:
     Header    — the mark and "Guided setup", the side switch (On the left /
                 On the right / Beside the rule panel), ×.
     Context   — what the next action applies to: "New rule", or the card
                 selected on the canvas ("Rule 2 · Contractors in India", × to
                 go back to New rule).
     Result    — the latest action only: while it plays, its steps ticking at
                 the picked tempo; then "Understood" (folded, no count) and one
                 plain line per decision it made, each led by its mark, with
                 logos and faces on the names, and Undo on the last line.
                 Decision colour belongs to these lines and to the panel's
                 decision pickers (the New rule form's What happens row, its
                 choices and its sentence; a rule's What happens and Everyone
                 else, the same rows compact); the history's marks are grey.
     History   — the actions before it, muted lines with grey marks and no
                 controls; past three, folded into "Earlier changes".
     Next      — ONE docked card, outside the scroller: the New rule form
                 (GuidedRuleForm.tsx: four section rows and the sentence), or
                 the selected rule's quick actions; at its foot Everyone else
                 (the last row) and, for a rule, + Add a rule.

   The board plans and writes (BoardBuilder, guided-setup.ts); this draws, and
   plays each action: the step lines, then the canvas beat, where the board is
   written (`onCommit`). Stop, Esc or closing finishes at once; reduced motion
   lands at once. While an action plays the Next card is inert.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const
const SIDE_ICON: Record<GuidedSide, LucideIcon> = { left: PanelLeft, right: PanelRight, beside: Columns2 }
/** The history shown before "Earlier changes" folds the rest. */
const HISTORY_SHOWN = 3
const NONE: ReadonlySet<number> = new Set()

/* A line's parts: an application with its logo, a group or person with their face, a condition with its family's
   icon — the words always printed beside, so each mark is decorative. */
function Parts({ parts, quiet = false }: { parts: readonly SaidPart[]; quiet?: boolean }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <Fragment key={i}>{p.text}</Fragment>
        if (p.kind === 'app')
          return (
            <span key={i} className="bgs__tok">
              <AppLogo appId={p.id} name={p.name} size={quiet ? 16 : 18} />
              <span className="bgs__tokname">{p.name}</span>
            </span>
          )
        if (p.kind === 'who')
          return (
            <span key={i} className="bgs__tok">
              <Face kind={p.who} name={p.name} size="sm" decorative />
              <span className="bgs__tokname">{p.name}</span>
            </span>
          )
        const Icon = conditionIcon(p.type, '')
        return (
          <span key={i} className="bgs__tok is-cond">
            <Icon size={14} strokeWidth={2} className="bgs__condicon" aria-hidden />
            <span className="bgs__tokname">{p.words}</span>
          </span>
        )
      })}
    </>
  )
}

/* The mark a line leads with: its decision's, coloured in the result and grey in the history; an application line's
   own mark, grey. */
function LineMark({ line, quiet }: { line: SaidLine; quiet: boolean }) {
  if (line.decision) return <DecisionMark decision={line.decision} size={quiet ? 'xs' : 'md'} muted={quiet || line.removed} />
  return (
    <span className={`bx-dmark is-neutral is-${quiet ? 'xs' : 'md'} is-muted`} aria-hidden>
      <AppWindow size={quiet ? 10 : 14} strokeWidth={2.2} />
    </span>
  )
}

function Lines({ lines, quiet = false, fresh = false, undo }: { lines: readonly SaidLine[]; quiet?: boolean; fresh?: boolean; undo?: () => void }) {
  return (
    <ul className={`bgs__lines${quiet ? ' is-quiet' : ''}`}>
      {lines.map((l, i) => (
        <motion.li
          key={`${l.key}-${i}`}
          className="bgs__line"
          initial={fresh ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.08 + i * 0.06, ease: EASE }}
        >
          <LineMark line={l} quiet={quiet} />
          <span className="bgs__said">
            <Parts parts={l.parts} quiet={quiet} />
          </span>
          {undo && i === lines.length - 1 && (
            <span className="bgs__undo">
              <Button variant="ghost" size="sm" icon={Undo2} onClick={undo}>
                Undo
              </Button>
            </span>
          )}
        </motion.li>
      ))}
    </ul>
  )
}

/* A step's mark: a faint ring waiting, a spinning arc working, a tick done (describe.css `.bdst__mark`). */
function StepMark({ state, reduced }: { state: 'done' | 'working' | 'waiting'; reduced: boolean }) {
  if (state !== 'done') return <span className={`bdst__mark is-${state}`} aria-hidden />
  return (
    <motion.span
      className="bdst__mark is-done"
      initial={reduced ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      aria-hidden
    >
      <Check size={11} strokeWidth={3} />
    </motion.span>
  )
}

const CANVAS: GuidedStep = { key: 'canvas', working: 'Updating the canvas', label: 'Updated the canvas', parts: [] }

/* The steps of an action: while it plays, each a spinner that turns into a tick with what it found; done, the same
   list folded under "Understood". */
function StepList({ steps, step, reduced }: { steps: readonly GuidedStep[]; step: number; reduced: boolean }) {
  return (
    <ol className="bdst__list">
      {[...steps, CANVAS].map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'working' : 'waiting'
        return (
          <motion.li
            key={s.key + i}
            className={`bdst__line is-${state}`}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.05, ease: EASE }}
          >
            <StepMark state={state} reduced={reduced} />
            <span className="bdst__text">
              {state === 'done' ? (
                s.key === 'canvas' ? (
                  s.label
                ) : (
                  <>
                    <span className="bdst__label">{s.label}</span>{' '}
                    <span className="bdst__found bgs__found">
                      {s.decision && <DecisionMark decision={s.decision} size="xs" muted />}
                      <Parts parts={s.parts} quiet />
                    </span>
                  </>
                )
              ) : (
                <span className={state === 'working' ? 'bdst__shimmer' : ''}>{s.working}</span>
              )}
            </span>
          </motion.li>
        )
      })}
    </ol>
  )
}

/* The selected rule's quick actions: What happens, Only from / Only on / Deny at high risk, Change who, Delete rule —
   neutral, red only inside the confirm. Keyed by the rule and its who, so a draft who or an open confirm never
   outlives the rule it was for. */
function RuleNext({
  rule,
  rules,
  tenant,
  cutoffs,
  onAct,
}: {
  rule: Rule
  rules: readonly Rule[]
  tenant: DescribeTenant
  cutoffs: GuidedCutoffs
  onAct: (act: GuidedAct) => void
}) {
  const [who, setWho] = useState<RuleWho | undefined>(rule.who)
  const [confirm, setConfirm] = useState(false)
  /* The confirm takes the focus on its safe answer, Keep; Keep (or Escape) gives it back to Delete rule. */
  const confirmBox = useRef<HTMLDivElement | null>(null)
  const deleteRow = useRef<HTMLSpanElement | null>(null)
  const asked = useRef(false)
  useEffect(() => {
    if (confirm) confirmBox.current?.querySelector<HTMLElement>('button')?.focus()
    else if (asked.current) deleteRow.current?.querySelector<HTMLElement>('button')?.focus()
    asked.current = confirm
  }, [confirm])
  const keep = () => setConfirm(false)
  const quick = quickActions(rule, rules, tenant, cutoffs)
  const whoChanged = whoKey(who) !== whoKey(rule.who)
  const offers = quick.zones.length + quick.profiles.length + (quick.denyRisk ? 1 : 0) > 0
  return (
    <>
      <div className="bgs__group">
        <span className="bgs__label">What happens</span>
        <DecisionChoices label="What happens" compact writes value={rule.decision} onPick={(decision) => onAct({ kind: 'decision', ruleId: rule.id, decision })} />
      </div>
      {offers && (
        <div className="bgs__chips" role="group" aria-label="Quick actions">
          {quick.zones.map((z) => (
            <button key={z.id} type="button" className="bgs__chipbtn" onClick={() => onAct({ kind: 'only-zone', ruleId: rule.id, zoneId: z.id })}>
              <Globe size={14} strokeWidth={2} aria-hidden />
              Only from {z.name}
            </button>
          ))}
          {quick.profiles.map((f) => (
            <button key={f.id} type="button" className="bgs__chipbtn" onClick={() => onAct({ kind: 'only-profile', ruleId: rule.id, profileId: f.id })}>
              <MonitorSmartphone size={14} strokeWidth={2} aria-hidden />
              Only on {f.name}
            </button>
          ))}
          {quick.denyRisk && (
            <button type="button" className="bgs__chipbtn" onClick={() => onAct({ kind: 'deny-risk', ruleId: rule.id })}>
              <Gauge size={14} strokeWidth={2} aria-hidden />
              Deny at high risk
            </button>
          )}
        </div>
      )}
      <div className="bgs__group">
        <span className="bgs__label">Who</span>
        <WhoCombo who={who} onChange={setWho} users={tenant.users} groups={tenant.groups} />
        {whoChanged && (
          <span className="bgs__row is-end">
            <Button variant="ghost" size="sm" onClick={() => setWho(rule.who)}>
              Cancel
            </Button>
            <button type="button" className="bgs__ink" onClick={() => onAct({ kind: 'who', ruleId: rule.id, who })}>
              Change who
            </button>
          </span>
        )}
      </div>
      {confirm ? (
        <div
          ref={confirmBox}
          className="bgs__confirm"
          role="group"
          aria-labelledby="bgs-confirmq"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            e.stopPropagation()
            keep()
          }}
        >
          <span id="bgs-confirmq" className="bgs__confirmq">
            Delete this rule?
          </span>
          <span className="bgs__row">
            <Button variant="ghost" size="sm" onClick={keep}>
              Keep
            </Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => onAct({ kind: 'delete', ruleId: rule.id })}>
              Delete
            </Button>
          </span>
        </div>
      ) : (
        <span ref={deleteRow} className="bgs__row">
          <Button variant="neutral" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>
            Delete rule
          </Button>
        </span>
      )}
    </>
  )
}

/* The first control of the Next card, once it is drawn and no longer inert: where focus goes after an action lands,
   an Undo, a context left, and on opening — never <body>. One frame for React to draw it, and a second try in case
   a closing menu or dialog put focus elsewhere first. */
const NEXT_FIRST = '.bgs__next :is(button, input, [href], [tabindex]):not([disabled]):not([tabindex="-1"])'
function focusIn(root: HTMLElement | null, selector: string) {
  const go = () => root?.querySelector<HTMLElement>(selector)?.focus()
  window.requestAnimationFrame(go)
  window.setTimeout(() => {
    const active = document.activeElement
    if (!active || active === document.body || !root?.contains(active)) go()
  }, 150)
}

export function GuidedSetup({
  tenant,
  draft,
  context,
  side,
  log,
  undoable,
  undone = NONE,
  cutoffs,
  appsTaken,
  onSide,
  onContext,
  onAct,
  onCommit,
  onUndo,
  onClose,
}: {
  tenant: DescribeTenant
  /** The board as it stands: rules, last row, and the policy's applications. */
  draft: Pick<Policy, 'rules' | 'fallback' | 'appIds'>
  /** The card the next action applies to; null is a new rule. */
  context: { ruleId: string; label: string } | null
  side: GuidedSide
  /** Every action this visit, oldest first. */
  log: readonly GuidedEntry[]
  /** The action whose Undo is live — the latest, while its write is still the board's present. */
  undoable: number | null
  /** The actions whose write is no longer on the board: undone here or in the bar, or discarded. */
  undone?: ReadonlySet<number>
  cutoffs: GuidedCutoffs
  /** The sign-in policy that already holds an application, if another does. */
  appsTaken: (appId: string) => string | undefined
  onSide: (side: GuidedSide) => void
  /** A rule as the context, or null for a new rule. */
  onContext: (ruleId: string | null) => void
  onAct: (act: GuidedAct) => void
  /** The canvas beat: write this action. */
  onCommit: (id: number) => void
  onUndo: (id: number) => void
  onClose: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const root = useRef<HTMLElement | null>(null)
  const { play, arrived, start, finish, busy } = useGuidedPlay({ onCommit })
  const latest = log.length > 0 ? log[log.length - 1] : null
  /* An action arriving from the board plays; those already written when the panel opened do not. */
  const started = useRef<number | null>(latest?.id ?? null)
  useEffect(() => {
    if (!latest || latest.after || latest.id === started.current) return
    started.current = latest.id
    start(latest.id, latest.plan.steps.length)
  }, [latest, start])

  /* Focus never falls to <body>. Opening puts it on the Next card's first control. An action pressed goes to Stop
     while it plays (the card is inert), and on to the next step's first control once it lands. */
  const focusNext = () => focusIn(root.current, NEXT_FIRST)
  useEffect(() => focusIn(root.current, NEXT_FIRST), [])
  const acting = useRef(false)
  const act = (a: GuidedAct) => {
    acting.current = true
    onAct(a)
  }
  const latestId = latest?.id ?? null
  useEffect(() => {
    if (!acting.current) return
    if (busy) {
      root.current?.querySelector<HTMLElement>('.bgs__stop button')?.focus()
      return
    }
    if (latestId !== null && arrived === latestId) {
      acting.current = false
      focusIn(root.current, NEXT_FIRST)
    }
  }, [busy, arrived, latestId])
  const undo = (id: number) => {
    onUndo(id)
    focusNext()
  }
  const toNewRule = () => {
    onContext(null)
    focusNext()
  }

  /* Esc while it plays finishes it, wherever the focus is — ahead of the board's own Escape, which would close the
     panel. Listening for the panel's whole life, not from the render that starts a play: Esc is taken only when
     `finish` had something to land. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !finish()) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finish])
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if ((e.target as HTMLElement).closest('[aria-expanded="true"], .bx-picker__pop, [role="menu"]')) return
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  const [foldOpen, setFoldOpen] = useState(false)
  const [olderOpen, setOlderOpen] = useState(false)
  useEffect(() => setFoldOpen(false), [latest?.id])

  const playing = play && latest && play.id === latest.id ? play : null
  const latestUndone = !!latest && undone.has(latest.id)
  /* The history: earlier actions still on the board, newest first. */
  const earlier = useMemo(() => log.slice(0, -1).filter((e) => !undone.has(e.id)).reverse(), [log, undone])
  const shown = earlier.slice(0, HISTORY_SHOWN)
  const older = earlier.slice(HISTORY_SHOWN)
  const rule = context ? draft.rules.find((r) => r.id === context.ruleId) : undefined
  const fallbackDecision = draft.fallback?.decision ?? '1fa'
  const reached = lastRowReached(draft.rules)
  const SideIcon = SIDE_ICON[side]
  const sideLabel = GUIDED_SIDES.find((s) => s.id === side)?.label ?? ''
  /* One live region for the panel's whole life: what the latest action did once it lands, and "Undone" when it is
     taken back — here or in the bar. */
  const announce = latest && !playing && latest.after ? `${latestUndone ? 'Undone' : 'Understood'}. ${latest.plan.lines.map(lineText).join(' ')}` : ''

  return (
    <aside ref={root} className={`bgs is-${side}`} aria-labelledby="bgs-title" onKeyDown={onKeyDown}>
      <header className="bgs__bar">
        <ListChecks size={16} strokeWidth={2} className="bgs__mark" aria-hidden />
        <h2 id="bgs-title" className="bgs__title">
          Guided setup
        </h2>
        <span className="bgs__barend">
          <RowMenu
            label={`Panel position: ${sideLabel}`}
            icon={SideIcon}
            items={GUIDED_SIDES.map((s) => ({ id: s.id, label: s.label, icon: SIDE_ICON[s.id], ...(s.id === side ? { hint: 'Current' } : null) }))}
            onSelect={(id) => onSide(id as GuidedSide)}
          />
          <IconButton icon={X} label="Close guided setup" size="sm" tone="ghost" onClick={onClose} />
        </span>
      </header>

      <div className="bgs__context">
        {context ? (
          <span className="bgs__ctx">
            <SquareDashedMousePointer size={12} strokeWidth={2} aria-hidden />
            <span className="bgs__ctxname">{context.label}</span>
            <button type="button" className="bgs__ctxx" aria-label="Back to new rule" onClick={toNewRule}>
              <X size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </span>
        ) : (
          <span className="bgs__ctx is-new">
            <Plus size={12} strokeWidth={2} aria-hidden />
            New rule
          </span>
        )}
      </div>

      <p className="u-sr-only" role="status">
        {announce}
      </p>

      {latest && (
        <div className="bgs__scroll">
          <section className="bgs__result" aria-label="Latest change">
            {playing ? (
              <div className="bdst" role="status" aria-live="polite">
                <p className="bdst__head bgs__playhead">
                  <span className="bdst__shimmer">Building the policy</span>
                  {/* Stop lands it whole, as Esc does. */}
                  <span className="bgs__stop">
                    <Button variant="ghost" size="sm" icon={Square} keys="Escape" onClick={finish}>
                      Stop
                    </Button>
                  </span>
                </p>
                <StepList steps={latest.plan.steps} step={playing.step} reduced={reduced} />
              </div>
            ) : latestUndone ? (
              <>
                {/* Taken back — here or in the bar: said, muted, with nothing to undo. A Redo in the bar brings it back. */}
                <p className="bgs__undone">Undone</p>
                <Lines lines={latest.plan.lines} quiet />
              </>
            ) : (
              <>
                <div className="bdst is-done">
                  <button type="button" className="bdst__fold" aria-expanded={foldOpen} onClick={() => setFoldOpen((v) => !v)}>
                    <motion.span className="bdst__chev" animate={{ rotate: foldOpen ? 90 : 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}>
                      <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                    </motion.span>
                    <span>Understood</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {foldOpen && (
                      <motion.div
                        key="steps"
                        className="bgs__fold"
                        initial={reduced ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.22, ease: EASE }}
                      >
                        <StepList steps={latest.plan.steps} step={latest.plan.steps.length + 1} reduced />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <Lines lines={latest.plan.lines} fresh={!reduced && arrived === latest.id} undo={undoable === latest.id ? () => undo(latest.id) : undefined} />
              </>
            )}
          </section>

          {shown.length > 0 && (
            <section className="bgs__history" aria-label="Earlier changes">
              {shown.map((e) => (
                <Lines key={e.id} lines={e.plan.lines} quiet />
              ))}
              {older.length > 0 && (
                <>
                  <button type="button" className="bdst__fold bgs__older" aria-expanded={olderOpen} onClick={() => setOlderOpen((v) => !v)}>
                    <motion.span className="bdst__chev" animate={{ rotate: olderOpen ? 90 : 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}>
                      <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                    </motion.span>
                    <span>Earlier changes</span>
                  </button>
                  {olderOpen && older.map((e) => <Lines key={e.id} lines={e.plan.lines} quiet />)}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {/* The one next step, docked: never scrolled away under the result. Inert while an action plays. */}
      <section className={`bgs__next${busy ? ' is-busy' : ''}${latest ? '' : ' is-first'}`} aria-label={rule ? 'Next' : 'New rule'} inert={busy}>
        {rule && context ? (
          <RuleNext key={`${rule.id}:${whoKey(rule.who)}`} rule={rule} rules={draft.rules} tenant={tenant} cutoffs={cutoffs} onAct={act} />
        ) : (
          <GuidedRuleForm key={draft.appIds.join(',')} tenant={tenant} guided={{ apps: draft.appIds, taken: appsTaken, onAdd: (pick) => act({ kind: 'add', pick }) }} />
        )}
        <div className="bgs__foot">
          <div className="bgs__resthead">
            <span className="bgs__label">Everyone else</span>
            {!reached && <Badge>Not reached</Badge>}
          </div>
          <DecisionChoices label="Everyone else" compact writes value={fallbackDecision} onPick={(decision) => act({ kind: 'rest', decision })} />
          {rule && (
            <span className="bgs__row">
              <Button variant="ghost" size="sm" icon={Plus} onClick={toNewRule}>
                Add a rule
              </Button>
            </span>
          )}
        </div>
      </section>
    </aside>
  )
}
