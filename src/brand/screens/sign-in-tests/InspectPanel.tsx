import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsLeftRight,
  ChevronsRightLeft,
  CircleDashed,
  CircleHelp,
  Copy,
  CornerDownRight,
  Minus,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
  type LucideIcon,
} from 'lucide-react'

import { DEFAULT_DENY_MESSAGE, TENANT_DENY_CONTACT, audienceSummary, blankPolicy, type AccessDecision, type Policy, type Rule } from '../../data'
import { GRANT_ENDED, dateSaid } from './temp-access'
import { DecisionBadge } from '../../decision-badge'
import { DECISION_WORDS } from '../../decision-words'
import { Button, StatusPill } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { IfBlock } from '../board/IfBlock'
import { useDraftDiff } from '../board/use-lines'
import { readFoot, storedVersions } from '../board/read-as-text'
import type { EngineRun } from './engine-run'
import { FATE_WORDS, PEEK_FALLBACK, evidenceOf, isPeek, ruleList, ruleOf, targetLabel, type Evidence, type InspectTarget, type PeekTarget, type RuleFate, type RuleListRow } from './inspect-model'
import { factsOf } from './inspect-facts'
import { objectsOfRule, peekNames, PEEK_LIBRARY } from './peek-model'
import { Block, Facts, Hero, KindMark, PeekPage } from './PeekViews'
import { PANEL_SLIDE as SLIDE } from './sign-in-card'
import './inspect.css'

/* -----------------------------------------------------------------------------
   The details panel (docs/specs/CHECK-ACCESS-INSPECTOR.md), as the owner asked
   for it the second time (6 Oct 2026): "I don't want this multi-page thing. I
   want a single page where at the top we have a card bearing the overview of
   the policy, then the rules — rules can be opened in the same page. Remove the
   related part, and move it to the top: on a click on the name you can open the
   name in the right panel, and for the app the same."

     ┌ Policy                                       ⧉ | >< × ┐
     │ ┌──────────────────────────────────────────────────┐ │
     │ │ [▤] AWS for engineering teams          [Active]   │ │  the overview card
     │ │ Applications  AWS Console   Audience  3 groups    │ │
     │ │ Last change   Changed 3 days ago by …             │ │
     │ │ ✓ Decided this sign-in · Rule 2 · Allow on 1 …   │ │  what it did to THIS sign-in
     │ └──────────────────────────────────────────────────┘ │
     │ Rules                                       In order │
     │ ▸ 1 Contractors away from the office  ✕ Not matched  │
     │ ▾ 2 Engineers on a compliant device   ✓ Decided      │  open in place: this sign-in,
     │     This sign-in · Checks · Uses · What they're told  │  the rule, what it uses
     │ ▸ * Nothing else matched              — Not reached  │
     ├──────────────────────────────────────────────────────┤
     │                                  [Edit in builder ↗] │
     └──────────────────────────────────────────────────────┘

   One thing at a time and no way back: a press on a name on the canvas puts it
   here, fresh. A rule pressed on the canvas opens its policy's page with that
   rule open and brought into view. What a rule uses (a zone, a device profile)
   opens in place under it, never as a page over this one. The person and the
   application are pressed on the sign-in line at the top of the canvas
   (classic2-pill.tsx), not listed here.

   Tokens only (inspect.css); nothing moves but the panel.
   -------------------------------------------------------------------------- */

export interface InspectPanelProps {
  /** The one thing on the page. A rule is its policy's page, that rule open. */
  target: InspectTarget
  /** The run on screen, for how each rule fared. */
  plan: EngineRun
  reduced: boolean
  wide: boolean
  onToggleWidth: () => void
  onClose: () => void
  /** Edit in builder ↗ for a policy or a rule; the library page for anything else. The only ways out. */
  onEdit: (t: InspectTarget) => void
}

/** What the panel's bar says it is showing. */
function kindOf(t: InspectTarget): string {
  if (isPeek(t)) return PEEK_FALLBACK[t.kind]
  return 'Policy'
}

export function InspectPanel({ target, plan, reduced, wide, onToggleWidth, onClose, onEdit }: InspectPanelProps) {
  const present = useIsPresent()
  const lib = useBrand()
  const { policies, zones, fingerprints, hooks, riskProfiles, users, apps, showToast } = lib
  const names = useMemo(() => peekNames({ zones, fingerprints, hooks, riskProfiles, users, apps }), [zones, fingerprints, hooks, riskProfiles, users, apps])
  const heading = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  /* A rule is shown as its policy's page; the key is the page, so a new thing starts it afresh (its open rules too). */
  const page: InspectTarget = target.kind === 'rule' ? { kind: 'policy', policyId: target.policyId } : target
  const pageKey = `${page.kind}:${isPeek(page) ? page.id : page.policyId}:${target.kind === 'rule' ? String(target.ruleId) : ''}`
  const name = targetLabel(page, policies, names)
  /* The rule the policy's footer opens the builder on: the one open, where exactly one is. */
  const [openOne, setOpenOne] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), reduced ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, [])
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [pageKey])
  const copy = () => {
    const text = bodyRef.current?.innerText ?? ''
    if (!navigator.clipboard) return showToast('Could not copy the text')
    navigator.clipboard.writeText(`${kindOf(page)}: ${name}\n\n${text}`).then(() => showToast('Copied'), () => showToast('Could not copy the text'))
  }
  /* The foot's way out: the builder for a policy (on its open rule, where one is), a library page for the rest; a person has none. */
  const out = page.kind === 'person' ? null : isPeek(page) ? `Open in ${PEEK_LIBRARY[page.kind]}` : 'Edit in builder'
  const edit = () => {
    if (page.kind === 'policy' && openOne !== undefined) onEdit({ kind: 'rule', policyId: page.policyId, ruleId: openOne })
    else onEdit(page)
  }

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
        <h2 ref={titleRef} id={heading} className="insp__bartitle" tabIndex={-1}>
          {kindOf(page)} details<span className="u-sr-only">: {name}</span>
        </h2>
        <button type="button" className="bb__act" aria-label="Copy this view" title="Copy" onClick={copy}>
          <Copy size={14} strokeWidth={2} />
        </button>
        <span className="bb__inspbar__sep" aria-hidden />
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="bb__inspbody insp__body" ref={bodyRef} key={pageKey}>
        {isPeek(page) ? <PeekPage target={page} plan={plan} /> : <PolicyPage policyId={page.policyId} focus={target.kind === 'rule' ? target.ruleId : undefined} plan={plan} onEdit={onEdit} onOpenOne={setOpenOne} />}
      </div>

      {out && (
        <div className="bb__inspfoot insp__foot">
          <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={edit}>
            {out}
          </Button>
        </div>
      )}
    </motion.aside>
  )
}

/* --- What it did to this sign-in --------------------------------------------------------------------------------- */

type Tone = 'positive' | 'notice' | 'negative' | 'neutral'
const DECISION_TONE: Record<AccessDecision, Tone> = { '1fa': 'positive', '2fa': 'notice', deny: 'negative' }
const DECISION_MARK: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': ShieldAlert, deny: ShieldX }

/** The strip at the overview card's foot: how this thing met the sign-in on the canvas, in the outcome's own tone. */
function Verdict({ tone, icon: Icon, title, line }: { tone: Tone; icon: LucideIcon; title: string; line?: string }) {
  return (
    <div className={`insp__verdict is-${tone}`} role="status">
      <span className="insp__verdictmark" aria-hidden>
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <span className="insp__verdicttext">
        <b>{title}</b>
        {line && <span>{line}</span>}
      </span>
    </div>
  )
}

/* A run that Depends (6 Oct 2026). The policy the engine opened is the one
   that decides, but a rule in it could not be told, so no rule of it decided.
   It says the outcome's own word, "Depends", in the outcome's notice tone, and
   names the rules it is waiting on and what would settle them, as the folded
   policy on the canvas does ("Can’t tell: Device", journey.ts `policyWhy`).

   The rule the definite reading walks on to — a later rule that matched, or the
   last row — is "If not", as the canvas draws it (PolicyStack.tsx
   `WORD.possible`): what happens only if the rules above do not match. */
type Shown = RuleFate | 'if-not'

const FATE_MARK: Record<Shown, LucideIcon> = { decided: Check, 'not-matched': X, 'cant-tell': CircleHelp, off: Minus, 'not-reached': Minus, 'if-not': CornerDownRight }
const FATE_SAID: Record<Shown, string> = { ...FATE_WORDS, 'if-not': 'If not' }
/** A rule off in the run because its temporary access ran out, not because someone switched it off (6 Oct 2026). */
const endedGrant = (rule: Pick<Rule, 'tempAccess' | 'enabled'> | undefined): boolean => !!rule?.tempAccess && rule.enabled !== false

/** This policy decides the run, but the answer Depends: a rule in it could not be told. */
const dependsIn = (plan: EngineRun, policyId: string): boolean => plan.decider?.id === policyId && (plan.outcome.status === 'depends' || !plan.rules.some((r) => r.state === 'match'))

/** How a row of the list fared, as the panel says it: on a run that Depends, the rule it walks on to is "If not". */
function shownFate(row: Pick<RuleListRow, 'id' | 'fate'>, depends: boolean): Shown | null {
  if (depends && (row.fate === 'decided' || (row.id === null && row.fate === 'cant-tell'))) return 'if-not'
  return row.fate
}

/** The rules of a policy it could not tell, in order: the ones a run that Depends is waiting on. */
const waitingOn = (list: readonly RuleListRow[]) => list.filter((r) => r.fate === 'cant-tell' && r.n !== null)

/** "Rule 1", "Rules 1 and 3", "Rules 1, 2 and 3"; '' for none. */
function rulesSaid(ns: readonly number[]): string {
  if (ns.length === 0) return ''
  if (ns.length === 1) return `Rule ${ns[0]}`
  return `Rules ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`
}

/** "Rule 1 · Compliant device · Can’t tell: Device": the rule it waits on (or "Rules 1 and 2"), and what would settle it. */
function dependsLine(waiting: readonly RuleListRow[], needs: readonly string[]): string {
  const rules = waiting.length === 1 ? `Rule ${waiting[0].n} · ${waiting[0].name}` : rulesSaid(waiting.map((r) => r.n ?? 0))
  const tell = needs.length > 0 ? `${FATE_WORDS['cant-tell']}: ${needs.join(', ')}` : FATE_WORDS['cant-tell']
  return [rules, tell].filter(Boolean).join(' · ')
}

/* --- A policy, on one page --------------------------------------------------------------------------------------- */

const rowKey = (id: string | null) => id ?? 'last'

function PolicyPage({ policyId, focus, plan, onEdit, onOpenOne }: { policyId: string; focus: string | null | undefined; plan: EngineRun; onEdit: (t: InspectTarget) => void; onOpenOne: (id: string | null | undefined) => void }) {
  const { policies, apps, groups, users } = useBrand()
  const policy = policies.find((p) => p.id === policyId)
  const versions = useMemo(() => (policy ? storedVersions(policy) : { draft: blankPolicy(''), live: null }), [policy])
  const diff = useDraftDiff(versions)
  const list = policy ? ruleList(policy, plan) : []
  const depends = policy ? dependsIn(plan, policy.id) : false
  /* Open on arrival: the rule pressed on the canvas; else the one that decided; on a run that Depends, the ones it waits on. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    if (focus !== undefined) return new Set([rowKey(focus)])
    if (depends) return new Set(waitingOn(list).map((r) => rowKey(r.id)))
    const by = list.find((r) => r.fate === 'decided')
    return new Set(by ? [rowKey(by.id)] : [])
  })
  const focusRef = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (focus !== undefined) focusRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focus])
  useEffect(() => {
    const ids = [...open]
    onOpenOne(ids.length === 1 ? (ids[0] === 'last' ? null : ids[0]) : undefined)
  }, [open, onOpenOne])
  if (!policy) return <p className="insp__gone">This policy is no longer there.</p>
  const audience = policy.isSystem ? 'Everyone' : audienceSummary(policy.audience, groups, users).label || 'Nobody'
  const decided = plan.decider?.id === policy.id
  const by = decided && !depends ? list.find((r) => r.fate === 'decided') : undefined
  const changed = readFoot(policy).split(' · ').slice(1).join(' · ')
  const appsSaid = policy.isSystem ? (
    'Every application'
  ) : policy.appIds.length === 0 ? (
    'None'
  ) : (
    <span className="insp__apps">
      {policy.appIds.map((id) => {
        const app = apps.find((a) => a.id === id)
        return (
          <span key={id} className="insp__app">
            {app && <KindMark target={{ kind: 'app', id }} small />}
            {app?.name ?? 'A deleted application'}
          </span>
        )
      })}
    </span>
  )
  const toggle = (k: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  return (
    <>
      <Hero
        target={{ kind: 'policy', policyId: policy.id }}
        kicker={policy.isSystem ? 'Default policy' : 'Policy'}
        name={policy.name}
        badge={<StatusPill status={policy.status} />}
        facts={[
          { label: 'Applications', value: appsSaid, wide: !policy.isSystem && policy.appIds.length > 1 },
          { label: 'Audience', value: audience },
          ...(changed ? [{ label: 'Last change', value: changed, wide: true }] : []),
        ]}
        strip={
          depends ? (
            <Verdict tone="notice" icon={CircleHelp} title="Depends" line={dependsLine(waitingOn(list), plan.outcome.view.needs)} />
          ) : decided && by ? (
            <Verdict tone={DECISION_TONE[by.decision]} icon={DECISION_MARK[by.decision]} title="Decided this sign-in" line={`${by.n === null ? by.name : `Rule ${by.n} · ${by.name}`} · ${DECISION_WORDS[by.decision]}`} />
          ) : (
            <Verdict tone="neutral" icon={CircleDashed} title="Did not decide this sign-in" line={plan.decider ? `${plan.decider.name} did` : undefined} />
          )
        }
      />
      {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
        <Block title="Draft changes" aside="Not live yet">
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
        </Block>
      )}
      <Block title="Rules" aside="In order">
        <ul className="insp__accs">
          {list.map((r) => {
            const k = rowKey(r.id)
            const fate = shownFate(r, depends)
            const FateIcon = fate ? FATE_MARK[fate] : null
            const stored = r.id === null ? undefined : policy.rules.find((x) => x.id === r.id)
            const isOpen = open.has(k)
            const bodyId = `insp-rule-${policy.id}-${k}`
            return (
              <li key={k} ref={focus !== undefined && rowKey(focus) === k ? focusRef : undefined} className={`insp__acc${isOpen ? ' is-open' : ''}${fate ? ` is-${fate}` : ''}`}>
                <button type="button" className="insp__acchead" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(k)}>
                  <span className="insp__n" aria-hidden>
                    {r.n ?? '*'}
                  </span>
                  <span className="insp__rmain">
                    <span className="insp__rname">{r.name}</span>
                    {fate && FateIcon && (
                      <span className={`insp__fate is-${fate}`}>
                        <FateIcon size={12} strokeWidth={2.4} aria-hidden />
                        {fate === 'off' && endedGrant(stored) ? GRANT_ENDED : FATE_SAID[fate]}
                      </span>
                    )}
                  </span>
                  <DecisionBadge decision={r.decision} />
                  {isOpen ? <ChevronUp size={14} strokeWidth={2} aria-hidden className="insp__chev" /> : <ChevronDown size={14} strokeWidth={2} aria-hidden className="insp__chev" />}
                </button>
                {isOpen && (
                  <div id={bodyId} className="insp__accbody">
                    <RuleBody policy={policy} ruleId={r.id} plan={plan} shown={fate} list={list} onEdit={onEdit} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Block>
    </>
  )
}

/* --- A rule, open in place --------------------------------------------------------------------------------------- */

const MARK = { pass: Check, fail: X, unknown: CircleHelp } as const

function RuleBody({ policy, ruleId, plan, shown, list, onEdit }: { policy: Policy; ruleId: string | null; plan: EngineRun; shown: Shown | null; list: readonly RuleListRow[]; onEdit: (t: InspectTarget) => void }) {
  const lib = useBrand()
  const { zones, fingerprints, hooks, riskProfiles, activeRiskProfileId, users, apps } = lib
  const resolve = useNameLookup()
  const [use, setUse] = useState<string | null>(null)
  const found = ruleOf(policy, ruleId)
  if (!found) return <p className="insp__gone">This rule is no longer there.</p>
  const { rule, terminal } = found
  const evidence: Evidence[] = evidenceOf(plan, policy.id, ruleId)
  const refuses = rule.decision === 'deny'
  const uses = terminal ? [] : objectsOfRule(rule, activeRiskProfileId)
  const names = peekNames({ zones, fingerprints, hooks, riskProfiles, users, apps })
  const waiting = shown === 'if-not' ? waitingOn(list).map((r) => r.n ?? 0) : []
  const note =
    shown === 'if-not'
      ? waiting.length > 0
        ? `Applies only if ${rulesSaid(waiting).toLowerCase()} ${waiting.length === 1 ? 'does' : 'do'} not match.`
        : 'Applies only if the rules above do not match.'
      : shown === 'not-reached'
        ? 'An earlier rule decided, so this one was not checked.'
        : shown === 'cant-tell'
          ? `If it matches: ${DECISION_WORDS[rule.decision]}.`
          : shown === 'off' && endedGrant(rule)
            ? `Ran until ${dateSaid(rule.tempAccess!.until)}.`
            : shown === null
              ? `Not checked: ${policy.name} did not decide this sign-in.`
              : ''
  const picked = uses.find((o) => `${o.kind}:${o.id}` === use) ?? null
  return (
    <>
      {note && <p className="insp__accnote">{note}</p>}
      {evidence.length > 0 && (
        <div className="insp__part">
          <h4>This sign-in</h4>
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
        </div>
      )}
      <div className="insp__part">
        <h4>{terminal ? 'What it does' : 'What it checks'}</h4>
        <div className="insp__rulebody">
          <IfBlock rule={rule} resolve={resolve} terminal={terminal} />
        </div>
      </div>
      {uses.length > 0 && (
        <div className="insp__part">
          <h4>Uses</h4>
          <div className="insp__uses">
            {uses.map((o) => {
              const k = `${o.kind}:${o.id}`
              return (
                <button key={k} type="button" className={`insp__use${use === k ? ' is-on' : ''}`} aria-expanded={use === k} onClick={() => setUse(use === k ? null : k)}>
                  <KindMark target={o} small />
                  {names[o.kind](o.id) ?? PEEK_FALLBACK[o.kind]}
                  <em>{PEEK_FALLBACK[o.kind]}</em>
                </button>
              )
            })}
          </div>
          {picked && <UseFacts target={picked} onEdit={onEdit} />}
        </div>
      )}
      {refuses && (
        <div className="insp__part">
          <h4>What the person is told</h4>
          <blockquote className="insp__quote">{rule.denyMessage ?? DEFAULT_DENY_MESSAGE}</blockquote>
          <Facts rows={[...(rule.denyAction ? [['Next step', rule.denyAction] as [string, string]] : []), ['Contact', rule.denyContact ?? TENANT_DENY_CONTACT]]} />
        </div>
      )}
    </>
  )
}

/** A zone or a device profile a rule uses, opened in place under it: its facts, and the way to its own page. */
function UseFacts({ target, onEdit }: { target: PeekTarget; onEdit: (t: InspectTarget) => void }) {
  const lib = useBrand()
  const rows = factsOf(target, lib)
  if (!rows) return <p className="insp__gone">This is no longer there.</p>
  return (
    <div className="insp__usefacts">
      <Facts rows={rows} />
      {target.kind !== 'person' && (
        <button type="button" className="insp__link" onClick={() => onEdit(target)}>
          Open in {PEEK_LIBRARY[target.kind]}
          <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </div>
  )
}
