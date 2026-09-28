import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react'
import { RefreshCw } from 'lucide-react'

import { ChangeList, ChangeSection, type ChangeBlock, type ChangeItem } from '../change-list'
import { DECISION_WORDS } from '../decision-words'
import { Badge, Button, Callout, Drawer, Field, TipDot } from '../kit'
import { reviewKind, reviewItemName, type ReviewLine } from '../review-rows'
import { REASON_MAX, BREAK_IN_TIP } from './break-in-model'
import { Seg } from './board/Section'
import {
  DECIDING_WORDS,
  blockLine,
  breakInSummary,
  checkName,
  checkValue,
  checksSummary,
  decidingSummary,
  decidingValue,
  guardSpoken,
  overridable,
  whatChangesBlocks,
  type CheckValue,
  type GuardKind,
  type GuardResult,
  type ReadyFix,
  type SignInCheck,
} from './guard'
import { LIBRARY_STOP } from './library-guard'
import { planParts, type MonitorPlan } from './monitor-sample'
import { changeCount } from './rule-changes'
import { whatChangesSaid } from './what-changes'

import './guard.css'

/* -----------------------------------------------------------------------------
   The guard pages: what a change does, read before it is made (final spec D.3).

   One drawer at 680 px for five moments — saving an enforcing policy's rules,
   saving its applications, turning it on, turning it off, switching it to
   monitoring — and one list of rows in each, every row a title, a one-line
   summary and at most one link. A row opens to the sign-ins behind
   its summary; the rows with something failing, something that can't be told,
   or somebody newly let in open by themselves.

   It stops the change only for a Must pass or Protected saved sign-in that
   newly fails, and then says so above the rows, where the reason can be read,
   with the ready fix beside it — never in the footer, which holds buttons and
   nothing else. A Must pass can be expected otherwise, with a reason; a
   Protected one can't. Turning off and switching to monitoring inform and
   never block: an admin can always switch a policy off, even when something
   the page read has changed since it opened (assumption 24).

   The rows arrive with the drawer's own spring. On a re-run — a fix, a version
   switched, a new expectation — only a row whose summary moved fades back in
   (opacity, 160 ms), and never while somebody is typing. The banner that
   clears folds away by height and opacity, not by transform: the element
   framer animates carries no stylesheet transform.
   -------------------------------------------------------------------------- */

const TITLE: Record<GuardKind, string> = {
  save: 'Before saving: your edits',
  apps: 'Before saving: applications',
  'turn-on': 'Before turning on',
  'turn-off': 'Before turning off',
  'to-monitor': 'Before switching to monitoring',
}

/** The banner's heading, for the kinds that can be stopped. */
const CANT: Partial<Record<GuardKind, string>> = { save: "Can't save", apps: "Can't save", 'turn-on': "Can't turn on" }

export type GuardVersion = 'edits' | 'stored'

export interface GuardVersionChoice {
  value: GuardVersion
  /** One line each: "Unsaved edits on this board", "Saved 2 hours ago by Jaspreet Toor". */
  tips: Record<GuardVersion, string>
  onChange: (v: GuardVersion) => void
}

/* Somebody is typing: a re-run does not flicker the rows under their cursor. */
const typing = () => {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
}

/* A row that fades back in when its summary moved on a re-run. Opacity only,
   on a wrapper that carries the list's subgrid and no transform. */
function Fade({ said, children }: { said: string; children: ReactNode }) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()
  const last = useRef(said)
  useEffect(() => {
    if (last.current === said) return
    last.current = said
    if (reduced || !scope.current || typing()) return
    animate(scope.current, { opacity: [0.4, 1] }, { duration: 0.16, ease: [0.2, 0, 0, 1] })
  }, [said, reduced, animate, scope])
  return (
    <div ref={scope} className="bgd__row">
      {children}
    </div>
  )
}

/* A row with nothing behind it, which does not open: no saved sign-ins at all. */
function HeadOnly({ title, summary }: { title: string; summary: string }) {
  return (
    <section className="bx-cl__sec">
      <div className="bx-cl__head">
        <h3 className="bx-cl__title">
          {title}
          <span className="bx-cl__count"> {summary}</span>
        </h3>
      </div>
    </section>
  )
}

/* A saved sign-in's value: what it gets, what it was or should be, and the
   rule — a link that shows it on the board, where there is a board. Can't
   tell is grey throughout, and a failure this change did not cause says so in
   grey. */
function CheckValueView({ v, onRevealRule }: { v: CheckValue; onRevealRule?: (index: number | null) => void }) {
  if (v.unknown) return <span className="bgd__grey">{v.text}</span>
  const rule = v.rule
  return (
    <>
      {v.text}
      {rule && (
        <>
          {' · '}
          {onRevealRule ? (
            <button type="button" className="bgd__rule" onClick={() => onRevealRule(rule.index)}>
              {rule.label}
            </button>
          ) : (
            rule.label
          )}
        </>
      )}
      {!rule && v.other && ` · ${v.other}`}
      {v.note && <span className="bgd__grey">{v.note}</span>}
    </>
  )
}

function checkBlocks(checks: readonly SignInCheck[], result: GuardResult, onRevealRule?: (index: number | null) => void): ChangeBlock[] {
  const item = (c: SignInCheck): ChangeItem => ({
    id: c.signIn.id,
    name: checkName(c),
    after: <CheckValueView v={checkValue(c, result.subjectId, result.kind)} onRevealRule={onRevealRule} />,
  })
  const of = (v: SignInCheck['after']['verdict']) => checks.filter((c) => c.after.verdict === v).map(item)
  const blocks: ChangeBlock[] = [
    { tone: 'fail', label: 'Fails', items: of('fail') },
    { tone: 'neutral', label: "Can't tell", items: of('cant-tell') },
    { tone: 'pass', label: 'Passes', items: of('pass') },
  ]
  return blocks.filter((b) => b.items.length > 0)
}

const attention = (checks: readonly SignInCheck[]) => checks.some((c) => c.after.verdict !== 'pass')

/* What you changed on the rules: the Review words, a chip per kind. */
function ruleBlocks(result: GuardResult): ChangeBlock[] {
  const changes = result.changes ?? []
  const of = (kind: 'added' | 'changed' | 'removed') =>
    changes
      .filter((c) => c.kind === kind)
      .map((c, i): ChangeItem => (kind === 'removed' ? { id: `${kind}-${i}`, name: c.name, before: c.value, leaving: true } : { id: `${kind}-${i}`, name: c.name, after: c.value }))
  const blocks: ChangeBlock[] = [
    { tone: 'added', label: 'Added', items: of('added') },
    { tone: 'changed', label: 'Changed', items: of('changed') },
    { tone: 'removed', label: 'Removed', items: of('removed') },
  ]
  return blocks.filter((b) => b.items.length > 0)
}

/* What you changed on the applications: detailsChanges' rows, filed the same way. */
function appBlocks(rows: readonly ReviewLine[]): ChangeBlock[] {
  const edits = rows.filter((r) => !r.effect)
  const of = (kind: 'added' | 'changed' | 'removed') =>
    edits
      .filter((r) => reviewKind(r) === kind)
      .map((r, i): ChangeItem => (kind === 'removed' ? { id: `${kind}-${i}`, name: reviewItemName(r), before: r.before, leaving: true } : { id: `${kind}-${i}`, name: reviewItemName(r), after: r.after }))
  const effects = rows.filter((r) => r.effect).map((r, i): ChangeItem => ({ id: `effect-${i}`, name: r.label, after: r.after }))
  const blocks: ChangeBlock[] = [
    { tone: 'added', label: 'Added', items: of('added') },
    { tone: 'changed', label: 'Changed', items: of('changed') },
    { tone: 'removed', label: 'Removed', items: of('removed') },
    { tone: 'effect', label: 'Also changes', items: effects },
  ]
  return blocks.filter((b) => b.items.length > 0)
}

/* "Expect Deny instead": the new expectation, and why. */
function ExpectForm({ decision, onSave, onCancel }: { decision: string; onSave: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const id = useId()
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => input.current?.focus(), [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setSaid('Enter a reason')
      input.current?.focus()
      return
    }
    onSave(reason.trim())
  }
  return (
    <form
      className="bgd__expect"
      aria-label={`Expect ${decision} instead`}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onCancel()
      }}
    >
      <Field label="Reason" htmlFor={`${id}-r`}>
        <input
          ref={input}
          id={`${id}-r`}
          type="text"
          value={reason}
          maxLength={REASON_MAX}
          required
          aria-invalid={said ? true : undefined}
          aria-describedby={said ? `${id}-e` : undefined}
          onChange={(e) => {
            setReason(e.target.value)
            if (said) setSaid(null)
          }}
        />
      </Field>
      {said && (
        <p id={`${id}-e`} className="bgd__said" role="alert">
          {said}
        </p>
      )}
      <div className="bgd__acts">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="neutral" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
}

/* --- Review changes: a saved sign-in a library save moves ---------------------------

   The value of a saved sign-in's row under Also changes when a zone, a device
   profile or the risk profile in use is saved (library-review.tsx): what it
   gets now, and — when it stops the save — why, beside the row and never in
   the footer, with what would let it through. The fix is offered once, under
   the first blocker, because it clears every one of them. The deciding policy
   is not named again: the Active policies row above names it. */
export function LibraryCheckValue({
  c,
  fix,
  onOverride,
  stop = LIBRARY_STOP,
}: {
  c: SignInCheck
  fix: { label: string; run: () => void } | null
  onOverride: (c: SignInCheck, reason: string) => void
  /** What the held action is called: "Can't save", or "Can't use this profile" on Use. */
  stop?: string
}) {
  const [expecting, setExpecting] = useState(false)
  const v = checkValue(c, '', 'save')
  if (v.unknown) return <span className="bgd__grey">{v.text}</span>
  const said: ReactNode = (
    <>
      {v.text}
      {v.note && <span className="bgd__grey">{v.note}</span>}
    </>
  )
  if (!c.blocks) return said
  const decision = DECISION_WORDS[c.after.decision!]
  const overrides = overridable(c)
  return (
    <span className="blg">
      <span>{said}</span>
      <span className="blg__stop" role="group" aria-label={stop}>
        <span className="blg__line">{blockLine(c)}</span>
        {!expecting && (fix || overrides) && (
          <span className="bgd__acts">
            {fix && (
              <Button variant="neutral" size="sm" onClick={fix.run}>
                {fix.label}
              </Button>
            )}
            {overrides && (
              <Button variant="ghost" size="sm" onClick={() => setExpecting(true)}>
                {`Expect ${decision} instead`}
              </Button>
            )}
          </span>
        )}
        {expecting && (
          <ExpectForm
            decision={decision}
            onSave={(reason) => {
              setExpecting(false)
              onOverride(c, reason)
            }}
            onCancel={() => setExpecting(false)}
          />
        )}
      </span>
    </span>
  )
}

export function GuardDrawer({
  open,
  kind,
  policyName,
  result,
  run,
  primaryLabel,
  onConfirm,
  onClose,
  version,
  blockedReason,
  appChanges,
  storedSaid,
  stale = false,
  onRerun,
  onApplyFix,
  onOverride,
  onRevealRule,
  onOpenBreakIn,
  onMonitorInstead,
  monitoring,
  onViewMonitoring,
}: {
  open: boolean
  kind: GuardKind
  policyName: string
  result: GuardResult | 'error'
  /** Bumped on every run of the checks, so the live region speaks once per run. */
  run: number
  /** "Save policy", "Save applications", "Turn on", "Turn off", "Monitor". */
  primaryLabel: string
  onConfirm: () => void
  onClose: () => void
  /** Before turning on, when there are edits to turn on with: the version choice. */
  version?: GuardVersionChoice | null
  /** Why the chosen version cannot turn on whatever the checks say: an error on its rules. */
  blockedReason?: string | null
  /** Before saving: applications — the rows the Applications edit makes. */
  appChanges?: readonly ReviewLine[]
  /** Before turning on a stored policy: said under What you changed when the stored version is chosen — "Saved 2 hours ago by Jaspreet Toor". Absent, turning on lists its changes like a save. */
  storedSaid?: string
  /** Something the checks read was replaced while the page was open. */
  stale?: boolean
  onRerun?: () => void
  onApplyFix: (fix: ReadyFix) => void
  /** A Must pass, expected otherwise from here with a reason. */
  onOverride?: (check: SignInCheck, reason: string) => void
  /** The board: show a rule on the chain behind the drawer. Null is the last row. */
  onRevealRule?: (index: number | null) => void
  onOpenBreakIn?: () => void
  /** Before turning on, from Inactive: switch it to monitoring instead. */
  onMonitorInstead?: () => void
  /** Before turning on, from Monitoring: what the modelled sign-ins say turning it on does. */
  monitoring?: MonitorPlan | null
  onViewMonitoring?: () => void
}) {
  const reduced = useReducedMotion()
  const r = result === 'error' ? null : result
  const first = r?.blocking[0] ?? null
  const [expecting, setExpecting] = useState(false)
  /* A new blocker is a new question: a reason half-typed for the last one is not an answer to it. */
  const firstId = first?.signIn.id ?? null
  const [expectingFor, setExpectingFor] = useState<string | null>(firstId)
  if (expectingFor !== firstId) {
    setExpectingFor(firstId)
    setExpecting(false)
  }

  /* The live region, set after the page has mounted and once per run. */
  const [spoken, setSpoken] = useState('')
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => setSpoken(guardSpoken(result, kind, blockedReason)), 60)
    return () => window.clearTimeout(t)
  }, [open, run, result, kind, blockedReason])

  /* Turning off and switching to monitoring never hold the primary — not for
     a block, which they never have, and not for a stale page either: the line
     and the re-run are there, and the switch still works. */
  const stops = kind === 'turn-off' || kind === 'to-monitor'
  const blocked = !!first || !!blockedReason
  const holdsStale = stale && !stops
  const disabledWhy = holdsStale ? 'Changed since you opened this' : blocked ? (CANT[kind] ?? undefined) : undefined
  const primaryOn = !holdsStale && !blocked

  /* ⌘↵ presses the primary, when it can be pressed. */
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm
  useEffect(() => {
    if (!open || !primaryOn) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        confirmRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, primaryOn])

  const cancelWord = kind === 'save' || kind === 'apps' ? 'Keep editing' : 'Cancel'

  const ruleOf = (c: SignInCheck) =>
    c.after.decidedBy?.policyId === r?.subjectId && c.after.ruleIndex !== undefined
      ? { index: c.after.ruleIndex, label: c.after.ruleIndex === null ? 'Last row' : `Rule ${c.after.ruleIndex + 1}` }
      : null
  const firstRule = first ? ruleOf(first) : null

  const rows: ReactNode[] = []
  if (r) {
    if (kind === 'apps' && appChanges) {
      const edits = appChanges.filter((x) => !x.effect).length
      rows.push(
        <Fade key="changed" said={`${edits}`}>
          <ChangeSection title="What you changed" summary={edits === 0 ? 'No change' : `${edits} change${edits === 1 ? '' : 's'}`} layout="list" blocks={appBlocks(appChanges)} collapsible empty="No change" />
        </Fade>,
      )
    } else if (r.changes) {
      /* Turning on the stored version — chosen, or the only one there is —
         changes no rule: the row says which version it is, and when it was
         saved. A host with no stored version to name (a draft turned on from
         the board's review) lists its changes like a save. */
      const onStored = kind === 'turn-on' && !!storedSaid && (!version || version.value === 'stored')
      const summary = onStored ? 'Stored version' : r.changes.length === 0 ? 'No change' : changeCount(r.changes)
      rows.push(
        <Fade key="changed" said={summary}>
          <ChangeSection
            title="What you changed"
            summary={summary}
            layout="list"
            blocks={onStored ? [] : ruleBlocks(r)}
            collapsible
            empty={onStored ? storedSaid : 'No change'}
          />
        </Fade>,
      )
    }

    const decidingSaid = decidingSummary(r.deciding)
    rows.push(
      <Fade key="deciding" said={decidingSaid}>
        <ChangeSection
          title={stops ? 'Who it stops deciding for' : 'Who it starts deciding for'}
          summary={decidingSaid}
          layout="list"
          blocks={(['starts', 'stops', 'not'] as const)
            .map((k): ChangeBlock => ({
              tone: k === 'not' ? 'neutral' : 'changed',
              label: DECIDING_WORDS[k],
              items: r.deciding.filter((d) => d.kind === k).map((d, i) => ({ id: `${k}-${i}`, name: d.appName, after: decidingValue(d) })),
            }))
            .filter((b) => b.items.length > 0)}
          collapsible
          defaultOpen={kind !== 'save' && kind !== 'apps' && decidingSaid !== 'No change'}
          empty="No change"
        />
      </Fade>,
    )

    const savedSection = (key: string, title: string, checks: readonly SignInCheck[]) => {
      const summary = checksSummary(checks, r.anySaved)
      rows.push(
        <Fade key={key} said={summary}>
          {r.anySaved ? (
            <ChangeSection
              title={title}
              summary={summary}
              layout="list"
              blocks={checkBlocks(checks, r, onRevealRule)}
              collapsible
              defaultOpen={attention(checks)}
              empty="None for this policy"
            />
          ) : (
            <HeadOnly title={title} summary={summary} />
          )}
        </Fade>,
      )
    }
    savedSection('saved', 'Saved sign-ins', r.saved)
    savedSection('protected', 'Your own and protected sign-ins', r.protectedOwn)

    const wc = whatChangesSaid(r.whatChanges)
    const apps = r.whatChanges.appNames.join(', ') || 'this application'
    rows.push(
      <Fade key="what" said={wc}>
        <ChangeSection
          title="What changes"
          summary={wc}
          layout="list"
          blocks={whatChangesBlocks(r.whatChanges).map((b) => ({
            tone: 'neutral',
            label: b.word,
            items: b.items.length === 0 ? [{ id: `${b.key}-none`, after: '' }] : b.items.map((it, i) => ({ id: `${b.key}-${i}`, name: it.name, after: it.value })),
          }))}
          collapsible
          defaultOpen={r.whatChanges.counts.nowAllowed > 0}
          action={<TipDot text={`On ${apps} at 09:30; not real traffic.`} label="About what changes" />}
        />
      </Fade>,
    )

    if (r.breakIn) {
      const bi = breakInSummary(r.breakIn)
      rows.push(
        <Fade key="break-in" said={bi}>
          <ChangeSection
            title="Break-in test"
            summary={bi}
            layout="list"
            blocks={
              r.breakIn.moved.length === 0
                ? []
                : [{ tone: 'changed', label: 'Changed', items: r.breakIn.moved.map((m) => ({ id: m.cardId, name: m.name, after: `${m.now}, was ${m.was}` })) }]
            }
            collapsible
            defaultOpen={false}
            empty="No change"
            action={
              <span className="bgd__rowacts">
                <TipDot text={BREAK_IN_TIP} label="About the break-in test" />
                {onOpenBreakIn && (
                  <Button variant="link" size="sm" onClick={onOpenBreakIn}>
                    Open
                  </Button>
                )}
              </span>
            }
          />
        </Fade>,
      )
    }
  }

  if (monitoring) {
    const plan = planParts(monitoring)
    rows.push(
      <div key="monitoring" className="bgd__row">
        <ChangeSection
          title="While monitoring"
          layout="list"
          blocks={[
            {
              items: [
                {
                  id: 'plan',
                  after: (
                    <span className="bgd__plan">
                      {plan.head}
                      {plan.cantTell && <span className="bgd__grey">{plan.cantTell}</span>}.
                    </span>
                  ),
                },
              ],
            },
          ]}
          action={
            <span className="bgd__rowacts">
              <Badge tone="neutral">Sample</Badge>
              {onViewMonitoring && (
                <Button variant="link" size="sm" onClick={onViewMonitoring}>
                  View monitoring
                </Button>
              )}
            </span>
          }
        />
      </div>,
    )
  }

  const bannerExit = reduced ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.2, 0, 0, 1] as const } }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={TITLE[kind]}
      caption={policyName}
      width={680}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelWord}
          </Button>
          {onMonitorInstead && (
            <Button variant="secondary" onClick={onMonitorInstead}>
              Monitor instead
            </Button>
          )}
          <Button variant="brand" disabled={!primaryOn} title={disabledWhy} onClick={onConfirm}>
            {primaryLabel}
          </Button>
        </>
      }
    >
      <div className="bgd">
        {stale && (
          <div className="bgd__stale">
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
            <span>Changed since you opened this.</span>
            {onRerun && (
              <Button variant="link" size="sm" onClick={onRerun}>
                Run the checks again
              </Button>
            )}
          </div>
        )}

        {result === 'error' && <Callout tone="notice">Checks could not run.</Callout>}

        <AnimatePresence initial={false}>
          {first && (
            <motion.div key="block" className="bgd__block" exit={bannerExit}>
              <div className="bgd__blockin" role="group" aria-label={CANT[kind]}>
                <p className="bgd__blockhead">{CANT[kind]}</p>
                <p className="bgd__blockline">{blockLine(first)}</p>
                {!expecting && (
                  <div className="bgd__acts">
                    {r?.fix && (
                      <Button variant="neutral" size="sm" onClick={() => onApplyFix(r.fix!)}>
                        {r.fix.label}
                      </Button>
                    )}
                    {firstRule && onRevealRule && (
                      <Button variant="link" size="sm" onClick={() => onRevealRule(firstRule.index)}>
                        {firstRule.label}
                      </Button>
                    )}
                    {overridable(first) && onOverride && (
                      <Button variant="ghost" size="sm" onClick={() => setExpecting(true)}>
                        {`Expect ${DECISION_WORDS[first.after.decision!]} instead`}
                      </Button>
                    )}
                  </div>
                )}
                {expecting && onOverride && (
                  <ExpectForm
                    decision={DECISION_WORDS[first.after.decision!]}
                    onSave={(reason) => {
                      setExpecting(false)
                      onOverride(first, reason)
                    }}
                    onCancel={() => setExpecting(false)}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {blockedReason && !first && (
          <div className="bgd__block">
            <div className="bgd__blockin">
              <p className="bgd__blockhead">{CANT[kind] ?? "Can't turn on"}</p>
              <p className="bgd__blockline">{blockedReason}</p>
            </div>
          </div>
        )}

        {version && (
          <div className="bgd__version">
            <span className="bgd__label" aria-hidden>
              Version
            </span>
            <Seg
              label="Version"
              value={version.value}
              onChange={version.onChange}
              options={[
                { value: 'edits', label: 'With your edits', title: version.tips.edits },
                { value: 'stored', label: 'Stored version', title: version.tips.stored },
              ]}
            />
          </div>
        )}

        {rows.length > 0 && <ChangeList layout="list">{rows}</ChangeList>}

        <p className="u-sr-only" aria-live="polite">
          {spoken}
        </p>
      </div>
    </Drawer>
  )
}
