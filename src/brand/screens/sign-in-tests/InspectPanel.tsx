import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AppWindow,
  ArrowLeft,
  ArrowUpRight,
  Asterisk,
  Check,
  ChevronRight,
  ChevronsLeftRight,
  ChevronsRightLeft,
  CircleDashed,
  CircleHelp,
  Columns2,
  Copy,
  FilePen,
  History,
  Info,
  Link2,
  ListOrdered,
  ListTree,
  MessageSquareText,
  Minus,
  Pin,
  PinOff,
  Puzzle,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

import { DEFAULT_DENY_MESSAGE, TENANT_DENY_CONTACT, audienceSummary, blankPolicy, type AccessDecision, type Policy } from '../../data'
import { DecisionBadge } from '../../decision-badge'
import { DECISION_WORDS } from '../../decision-words'
import { Button, StatusPill, Tabs } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { IfBlock } from '../board/IfBlock'
import { ReadAsTextBody } from '../board/ReadAsTextPanel'
import { useDraftDiff, useLines } from '../board/use-lines'
import { policySentences } from '../predicate-prose'
import { readFoot, storedVersions } from '../board/read-as-text'
import type { EngineRun } from './engine-run'
import { FATE_WORDS, evidenceOf, fateOf, PEEK_FALLBACK, isPeek, ruleList, sameTarget, ruleOf, targetLabel, type Evidence, type InspectTarget, type RuleFate } from './inspect-model'
import { objectsOfRule, peekNames, PEEK_LIBRARY } from './peek-model'
import { KindMark, PeekView, Section, Row } from './PeekViews'
import { compareFacts, factsOf } from './inspect-facts'
import { READ_AS_TEXT_TAB } from './phase'
import { PANEL_SLIDE as SLIDE } from './sign-in-card'
import './inspect.css'

/* -----------------------------------------------------------------------------
   The inspector (docs/specs/CHECK-ACCESS-INSPECTOR.md): a name on the run — a
   policy, a rule, a zone, a person — opens here, in the page's right-hand
   panel, read-only, and says what the thing is AND what it did to this sign-in.
   One shell, a view per kind (owner, 6 Oct 2026: "a panel per kind").

     ┌ ← [▤] Policy                      ⧉ ⌖ | >< × ┐   the kind's mark, its kind, its name
     │      AWS for engineering teams                 │
     ├────────────────────────────────────────────────┤
     │ AWS for engineering teams › Rule 1             │   the way back (a long one folds to …)
     │ ┌ ✓ Decided this sign-in ───────────────────┐  │   what it did to THIS sign-in, in its tone
     │ └   Rule 2 · Allow on 1 factor              ┘  │
     │ [Details] [Read as text]                       │   (the text tab: READ_AS_TEXT_TAB)
     │ ⓘ About        Status, applications, audience  │   sections in the builder inspector's
     │ ≡ Rules        1 · 2 · 3 · Nothing else …      │   grammar: a brand-coloured mark, a
     │ 🔗 Related     the sign-in, what is pinned     │   semibold heading, a guide rule
     ├────────────────────────────────────────────────┤
     │                              [Edit in builder ↗]│   the one way out, at the foot
     └────────────────────────────────────────────────┘

   Pin keeps a thing a press away for this visit, and a pinned thing of the same
   kind offers Compare (inspect-facts.ts). Copy puts the view on the clipboard.
   Tokens only (inspect.css); nothing moves but the panel.
   -------------------------------------------------------------------------- */

export interface InspectPanelProps {
  /** The way in, oldest first: the last is on screen; earlier ones are the way back. */
  stack: readonly InspectTarget[]
  /** The run on screen, for how each rule fared. */
  plan: EngineRun
  reduced: boolean
  wide: boolean
  onToggleWidth: () => void
  onClose: () => void
  /** A name pressed inside the panel: the next step in the stack. */
  onPush: (t: InspectTarget) => void
  /** A step of the way back pressed: the stack is cut to it (index into `stack`). */
  onGoTo: (index: number) => void
  /** Edit in builder ↗ for a policy or a rule; the library page for anything else. The only ways out. */
  onEdit: (t: InspectTarget) => void
  /** Pinned this visit, oldest first; a pin is a way back to a thing and the other side of Compare. */
  pins: readonly InspectTarget[]
  onPin: (t: InspectTarget) => void
  /** Who is signing in to what, so both are a press away (a person, an application). */
  signIn: { personId: string | null; appId: string | null }
}

/** What a target is, said over its name in the panel's head. */
function kickerOf(t: InspectTarget, policies: readonly Policy[]): string {
  if (isPeek(t)) return PEEK_FALLBACK[t.kind]
  if (t.kind === 'policy') return policies.find((p) => p.id === t.policyId)?.isSystem ? 'Default policy' : 'Policy'
  const p = policies.find((x) => x.id === t.policyId)
  if (!p || t.ruleId === null) return 'Last row'
  const i = p.rules.findIndex((r) => r.id === t.ruleId)
  return i < 0 ? 'Rule' : `Rule ${i + 1} of ${p.rules.length}`
}

/** The name in the head: a rule's own name, without the "Rule 2 ·" the kicker already says. */
function nameOf(t: InspectTarget, label: string, policies: readonly Policy[]): string {
  if (t.kind !== 'rule') return label
  if (t.ruleId === null) return label
  return policies.find((p) => p.id === t.policyId)?.rules.find((r) => r.id === t.ruleId)?.name ?? label
}

export function InspectPanel({ stack, plan, reduced, wide, onToggleWidth, onClose, onPush, onGoTo, onEdit, pins, onPin, signIn }: InspectPanelProps) {
  const present = useIsPresent()
  const lib = useBrand()
  const { policies, zones, fingerprints, hooks, riskProfiles, users, apps, showToast } = lib
  const names = useMemo(() => peekNames({ zones, fingerprints, hooks, riskProfiles, users, apps }), [zones, fingerprints, hooks, riskProfiles, users, apps])
  const label = (t: InspectTarget) => targetLabel(t, policies, names)
  const heading = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const top = stack[stack.length - 1]
  const topKey = top ? `${stack.length}:${label(top)}` : ''
  /* Compare belongs to the step it was opened on: a new step of the stack ends it, with no effect to do so. */
  const [cmp, setCmp] = useState<{ at: string; with: InspectTarget } | null>(null)
  const other = cmp && cmp.at === topKey ? cmp.with : null
  /* Its title takes the focus once it has arrived, and again when the stack moves. */
  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), reduced ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, [])
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
    bodyRef.current?.scrollTo({ top: 0 })
  }, [topKey])
  if (!top) return null
  const title = label(top)
  const pinned = pins.some((p) => sameTarget(p, top))
  const comparable = (p: InspectTarget) => !sameTarget(p, top) && p.kind === top.kind && factsOf(p, lib) !== null && factsOf(top, lib) !== null
  const copy = () => {
    const text = bodyRef.current?.innerText ?? ''
    if (!navigator.clipboard) return showToast('Could not copy the text')
    navigator.clipboard.writeText(`${kickerOf(top, policies)}: ${title}\n\n${text}`).then(() => showToast('Copied'), () => showToast('Could not copy the text'))
  }
  const related: InspectTarget[] = [
    ...(signIn.personId ? [{ kind: 'person', id: signIn.personId } as const] : []),
    ...(signIn.appId ? [{ kind: 'app', id: signIn.appId } as const] : []),
  ].filter((t) => !sameTarget(t, top))
  const pinnedOthers = pins.filter((p) => !sameTarget(p, top))
  /* The foot's way out: the builder for a policy or a rule, a library page for the rest; a person has none here. */
  const out = top.kind === 'person' ? null : isPeek(top) ? `Open in ${PEEK_LIBRARY[top.kind]}` : 'Edit in builder'

  return (
    <motion.aside
      className="bb__insp sit-panel insp"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule insp__bar">
        {stack.length > 1 && (
          <button type="button" className="bb__act" aria-label="Back" title="Back" onClick={() => onGoTo(stack.length - 2)}>
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
        )}
        <KindMark target={top} />
        <div className="insp__titles">
          <span className="insp__kicker">{kickerOf(top, policies)}</span>
          <h2 ref={titleRef} id={heading} className="insp__title" title={title} tabIndex={-1}>
            {nameOf(top, title, policies)}
          </h2>
        </div>
        <button type="button" className="bb__act" aria-label="Copy this view" title="Copy" onClick={copy}>
          <Copy size={14} strokeWidth={2} />
        </button>
        <button type="button" className={`bb__act${pinned ? ' is-on' : ''}`} aria-label={pinned ? 'Unpin' : 'Pin to compare'} title={pinned ? 'Unpin' : 'Pin'} aria-pressed={pinned} onClick={() => onPin(top)}>
          {pinned ? <PinOff size={14} strokeWidth={2} /> : <Pin size={14} strokeWidth={2} />}
        </button>
        <span className="bb__inspbar__sep" aria-hidden />
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="bb__inspbody insp__body" ref={bodyRef}>
        {stack.length > 1 && <Crumbs stack={stack} label={label} onGoTo={onGoTo} />}
        {other ? (
          <CompareView a={top} b={other} label={label} />
        ) : isPeek(top) ? (
          <PeekView target={top} onPush={onPush} />
        ) : top.kind === 'policy' ? (
          <PolicyView target={top} plan={plan} onPush={onPush} />
        ) : (
          <RuleView target={top} plan={plan} onPush={onPush} />
        )}
        {!other && (related.length > 0 || pinnedOthers.length > 0) && (
          <Section id="related" title="Related" icon={Link2}>
            {related.length > 0 && (
              <div className="insp__group" aria-label="Sign-in" role="group">
                <span className="insp__grouplabel">This sign-in</span>
                <ul className="insp__rows">
                  {related.map((t) => (
                    <li key={`${t.kind}-${label(t)}`}>
                      <Row mark={<KindMark target={t} small />} name={label(t)} meta={PEEK_FALLBACK[t.kind as 'person' | 'app']} onPress={() => onPush(t)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pinnedOthers.length > 0 && (
              <div className="insp__group" aria-label="Pinned" role="group">
                <span className="insp__grouplabel">Pinned</span>
                <ul className="insp__rows">
                  {pinnedOthers.map((t) => (
                    <li key={`${t.kind}-${label(t)}`} className="insp__pinrow">
                      <Row mark={<KindMark target={t} small />} name={label(t)} meta={kickerOf(t, policies)} onPress={() => onPush(t)} />
                      {comparable(t) && (
                        <button type="button" className="insp__cmpbtn" aria-label={`Compare with ${label(t)}`} title="Compare side by side" onClick={() => setCmp({ at: topKey, with: t })}>
                          <Columns2 size={13} strokeWidth={2} aria-hidden />
                          Compare
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}
      </div>

      {(out || other) && (
        <div className="bb__inspfoot insp__foot">
          {other && (
            <Button variant="ghost" size="sm" onClick={() => setCmp(null)}>
              Back to details
            </Button>
          )}
          {out && (
            <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => onEdit(top)}>
              {out}
            </Button>
          )}
        </div>
      )}
    </motion.aside>
  )
}

/* --- The way back ------------------------------------------------------------------------------------------------ */

function Crumbs({ stack, label, onGoTo }: { stack: readonly InspectTarget[]; label: (t: InspectTarget) => string; onGoTo: (i: number) => void }) {
  /* A long way in folds its middle into one step back: the first, …, the last two. */
  const folded = stack.length > 4
  return (
    <nav className="insp__crumbs" aria-label="Where you are">
      {stack.map((t, i) => {
        if (folded && i > 0 && i < stack.length - 2) {
          if (i !== 1) return null
          return (
            <span key="gap" className="insp__crumbstep">
              <ChevronRight size={12} strokeWidth={2} aria-hidden />
              <button type="button" className="insp__crumb" title={stack.slice(1, -2).map(label).join(' › ')} aria-label={`Back to ${label(stack[stack.length - 3])}`} onClick={() => onGoTo(stack.length - 3)}>
                …
              </button>
            </span>
          )
        }
        return (
          <span key={`${i}-${label(t)}`} className="insp__crumbstep">
            {i > 0 && <ChevronRight size={12} strokeWidth={2} aria-hidden />}
            {i < stack.length - 1 ? (
              <button type="button" className="insp__crumb" onClick={() => onGoTo(i)}>
                {label(t)}
              </button>
            ) : (
              <span className="insp__crumb is-here" aria-current="page">
                {label(t)}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/* --- What it did to this sign-in --------------------------------------------------------------------------------- */

type Tone = 'positive' | 'notice' | 'negative' | 'neutral'
const DECISION_TONE: Record<AccessDecision, Tone> = { '1fa': 'positive', '2fa': 'notice', deny: 'negative' }
const DECISION_MARK: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': ShieldAlert, deny: ShieldX }

/** The band under the head: how this thing met the sign-in on the canvas, in the outcome's own tone. */
function Verdict({ tone, icon: Icon, title, line }: { tone: Tone; icon: LucideIcon; title: string; line?: string }) {
  return (
    <div className={`insp__verdict is-${tone}`} role="status">
      <span className="insp__verdictmark" aria-hidden>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <span className="insp__verdicttext">
        <b>{title}</b>
        {line && <span>{line}</span>}
      </span>
    </div>
  )
}

const FATE_MARK: Record<RuleFate, LucideIcon> = { decided: Check, 'not-matched': X, 'cant-tell': CircleHelp, off: Minus, 'not-reached': Minus }

/* --- Two of a kind, side by side ----------------------------------------------------------------------------------- */

function CompareView({ a, b, label }: { a: InspectTarget; b: InspectTarget; label: (t: InspectTarget) => string }) {
  const lib = useBrand()
  const resolve = useNameLookup()
  const say = (p: Policy, ruleId: string | null) => {
    const lines = policySentences(p, resolve, (id) => lib.apps.find((x) => x.id === id)?.name ?? 'a deleted application')
    return lines.find((l) => (ruleId === null ? l.ruleId === 'fallback' : l.ruleId === ruleId))?.text ?? ''
  }
  const fa = factsOf(a, lib, say)
  const fb = factsOf(b, lib, say)
  if (!fa || !fb) return <p className="insp__gone">One of these is no longer there.</p>
  const rows = compareFacts(fa, fb)
  const differ = rows.filter((r) => !r.same).length
  return (
    <Section id="compare" title="Compare" icon={Columns2} aside={<span className="insp__secmeta">{differ === 0 ? 'No differences' : differ === 1 ? '1 difference' : `${differ} differences`}</span>}>
      <table className="insp__compare">
        <thead>
          <tr>
            <th scope="col">
              <span className="u-sr-only">Field</span>
            </th>
            <th scope="col">{label(a)}</th>
            <th scope="col">{label(b)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.same ? '' : 'is-differs'}>
              <th scope="row">{r.label}</th>
              <td>{r.a || '—'}</td>
              <td>{r.b || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/* --- A policy ---------------------------------------------------------------------------------------------------- */

function PolicyView({ target, plan, onPush }: { target: Extract<InspectTarget, { kind: 'policy' }>; plan: EngineRun; onPush: (t: InspectTarget) => void }) {
  const { policies, apps, groups, users } = useBrand()
  const policy = policies.find((p) => p.id === target.policyId)
  const [tab, setTab] = useState<'details' | 'text'>('details')
  const versions = useMemo(() => (policy ? storedVersions(policy) : { draft: blankPolicy(''), live: null }), [policy])
  const diff = useDraftDiff(versions)
  if (!policy) return <p className="insp__gone">This policy is no longer there.</p>
  const list = ruleList(policy, plan)
  const audience = policy.isSystem ? 'Everyone' : audienceSummary(policy.audience, groups, users).label || 'Nobody'
  const decided = plan.decider?.id === policy.id
  const by = decided ? list.find((r) => r.fate === 'decided') : undefined
  const changed = readFoot(policy).split(' · ').slice(1).join(' · ')
  return (
    <>
      <div className="insp__lead">
        {decided && by ? (
          <Verdict tone={DECISION_TONE[by.decision]} icon={DECISION_MARK[by.decision]} title="Decided this sign-in" line={`${by.n === null ? by.name : `Rule ${by.n} · ${by.name}`} · ${DECISION_WORDS[by.decision]}`} />
        ) : (
          <Verdict tone="neutral" icon={CircleDashed} title="Did not decide this sign-in" line={plan.decider ? `${plan.decider.name} did` : undefined} />
        )}
        {READ_AS_TEXT_TAB && (
          <Tabs<'details' | 'text'>
            className="bx-tabs--line insp__tabs"
            name="Policy view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'details', label: 'Details' },
              { value: 'text', label: 'Read as text' },
            ]}
          />
        )}
      </div>
      {tab === 'text' && READ_AS_TEXT_TAB ? (
        <div className="insp__text">
          <ReadTab policy={policy} />
        </div>
      ) : (
        <>
          <Section id="about" title="About" icon={Info}>
            <dl className="insp__facts">
              <Fact icon={ShieldCheck} label="Status">
                <StatusPill status={policy.status} />
              </Fact>
              <Fact icon={AppWindow} label="Applications">
                {policy.isSystem
                  ? 'Every application'
                  : policy.appIds.length === 0
                    ? 'None'
                    : policy.appIds.map((id) => {
                        const app = apps.find((a) => a.id === id)
                        return app ? (
                          <button key={id} type="button" className="insp__applink" onClick={() => onPush({ kind: 'app', id })}>
                            <KindMark target={{ kind: 'app', id }} small />
                            {app.name}
                          </button>
                        ) : (
                          <span key={id}>A deleted application</span>
                        )
                      })}
              </Fact>
              <Fact icon={Users} label="Audience">
                {audience}
              </Fact>
              {changed && (
                <Fact icon={History} label="Last change">
                  {changed}
                </Fact>
              )}
            </dl>
          </Section>
          {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
            <Section id="draft" title="Draft changes" icon={FilePen} aside={<span className="insp__secmeta">Not live yet</span>}>
              <ul className="insp__diff">
                {diff.removed.map((t) => (
                  <li key={`-${t}`} className="is-removed">
                    <span className="insp__diffword">Removed</span>
                    <span className="insp__difftext">{t}</span>
                  </li>
                ))}
                {diff.added.map((t) => (
                  <li key={`+${t}`} className="is-added">
                    <span className="insp__diffword">Added</span>
                    <span className="insp__difftext">{t}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section id="rules" title="Rules" icon={ListOrdered} aside={<span className="insp__secmeta">In order</span>}>
            <ul className="insp__rows">
              {list.map((r) => {
                const FateIcon = r.fate ? FATE_MARK[r.fate] : null
                return (
                  <li key={r.id ?? 'last'}>
                    <button type="button" className={`insp__rule${r.fate ? ` is-${r.fate}` : ''}`} onClick={() => onPush({ kind: 'rule', policyId: policy.id, ruleId: r.id })}>
                      <span className="insp__n" aria-hidden>
                        {r.n ?? <Asterisk size={12} strokeWidth={2.2} />}
                      </span>
                      <span className="insp__rmain">
                        <span className="insp__rname">{r.name}</span>
                        {r.fate && FateIcon && (
                          <span className={`insp__fate is-${r.fate}`}>
                            <FateIcon size={12} strokeWidth={2.4} aria-hidden />
                            {FATE_WORDS[r.fate]}
                          </span>
                        )}
                      </span>
                      <DecisionBadge decision={r.decision} />
                      <ChevronRight size={14} strokeWidth={2} aria-hidden className="insp__chev" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </Section>
        </>
      )}
    </>
  )
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="insp__fact">
      <dt>
        <Icon size={13} strokeWidth={2} aria-hidden />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/* Read as text, a tab beside the details (owner, 6 Oct 2026: it may not stay in the main product, so it is one tab,
   behind READ_AS_TEXT_TAB, and the details never depend on it). */
function ReadTab({ policy }: { policy: Policy }) {
  const versions = useMemo(() => storedVersions(policy), [policy])
  const { version, setVersion, lines } = useLines(versions)
  return <ReadAsTextBody lines={lines} version={versions.live ? version : null} onVersion={setVersion} foot={readFoot(policy)} />
}

/* --- A rule ------------------------------------------------------------------------------------------------------ */

const MARK = { pass: Check, fail: X, unknown: CircleHelp } as const

function RuleView({ target, plan, onPush }: { target: Extract<InspectTarget, { kind: 'rule' }>; plan: EngineRun; onPush: (t: InspectTarget) => void }) {
  const { policies, zones, fingerprints, hooks, riskProfiles, activeRiskProfileId, users, apps } = useBrand()
  const resolve = useNameLookup()
  const policy = policies.find((p) => p.id === target.policyId)
  const found = policy ? ruleOf(policy, target.ruleId) : null
  if (!policy || !found) return <p className="insp__gone">This rule is no longer there.</p>
  const { rule, terminal } = found
  const fate = fateOf(plan, policy.id, target.ruleId)
  const evidence: Evidence[] = evidenceOf(plan, policy.id, target.ruleId)
  const refuses = rule.decision === 'deny'
  const uses = objectsOfRule(rule, activeRiskProfileId)
  const names = peekNames({ zones, fingerprints, hooks, riskProfiles, users, apps })
  const failed = evidence.find((e) => e.status === 'fail')
  return (
    <>
      <div className="insp__lead">
        {fate === 'decided' ? (
          <Verdict tone={DECISION_TONE[rule.decision]} icon={DECISION_MARK[rule.decision]} title="Decided this sign-in" line={`${DECISION_WORDS[rule.decision]} · ${policy.name}`} />
        ) : fate === 'not-matched' ? (
          <Verdict tone="neutral" icon={X} title="Not matched" line={failed ? `${failed.word} did not match` : undefined} />
        ) : fate === 'not-reached' ? (
          <Verdict tone="neutral" icon={Minus} title="Not reached" line="An earlier rule decided, so this one was not checked." />
        ) : fate === 'cant-tell' ? (
          <Verdict tone="notice" icon={CircleHelp} title="Can’t tell" line="The sign-in does not say enough to decide this rule." />
        ) : fate === 'off' ? (
          <Verdict tone="neutral" icon={Minus} title="Switched off" />
        ) : (
          <Verdict tone="neutral" icon={CircleDashed} title="Not checked for this sign-in" line={`${policy.name} did not decide it`} />
        )}
      </div>

      {evidence.length > 0 && (
        <Section id="signin" title="This sign-in" icon={ScanSearch}>
          <ul className="insp__evidence">
            {evidence.map((e, i) => {
              const Mark = MARK[e.status]
              return (
                <li key={`${e.word}-${i}`} className={`is-${e.status}`}>
                  <span className="insp__evmark" aria-hidden>
                    <Mark size={12} strokeWidth={2.6} />
                  </span>
                  <span className="insp__evtext">
                    <b>{e.word}</b>
                    <span>{e.line}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section id="rule" title="The rule" icon={ListTree} aside={<span className="insp__secmeta">{policy.name}</span>}>
        <IfBlock rule={rule} resolve={resolve} terminal={terminal} />
      </Section>

      {uses.length > 0 && (
        <Section id="uses" title="Uses" icon={Puzzle}>
          <ul className="insp__rows">
            {uses.map((o) => (
              <li key={`${o.kind}-${o.id}`}>
                <Row mark={<KindMark target={o} small />} name={names[o.kind](o.id) ?? PEEK_FALLBACK[o.kind]} meta={PEEK_FALLBACK[o.kind]} onPress={() => onPush(o)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {refuses && (
        <Section id="told" title="What the person is told" icon={MessageSquareText}>
          <blockquote className="insp__quote">{rule.denyMessage ?? DEFAULT_DENY_MESSAGE}</blockquote>
          <dl className="insp__facts">
            {rule.denyAction && (
              <Fact icon={ChevronRight} label="Next step">
                {rule.denyAction}
              </Fact>
            )}
            <Fact icon={Users} label="Contact">
              {rule.denyContact ?? TENANT_DENY_CONTACT}
            </Fact>
          </dl>
        </Section>
      )}
    </>
  )
}

