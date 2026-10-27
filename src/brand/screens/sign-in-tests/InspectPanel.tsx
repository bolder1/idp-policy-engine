import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
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
  MonitorPlay,
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
import { Board } from '../board/Board'
import type { Selection } from '../board/model'
import { IfBlock } from '../board/IfBlock'
import { useDraftDiff } from '../board/use-lines'
import { containWhileScrolling } from '../scroll-contain'
import { readFoot, storedVersions } from '../board/read-as-text'
import type { EngineRun } from './engine-run'
import { FATE_WORDS, PEEK_FALLBACK, SEE_TITLE, evidenceOf, isPeek, ruleList, ruleOf, targetLabel, type Evidence, type InspectTarget, type PeekTarget, type RuleFate, type RuleListRow, type SeeRun } from './inspect-model'
import { factsOf } from './inspect-facts'
import { objectsOfRule, peekNames, PEEK_LIBRARY } from './peek-model'
import { AppsPeek } from '../apps-peek'
import { Block, CountTip, Facts, Hero, KindMark, PeekPage } from './PeekViews'
import { PANEL_SLIDE as SLIDE } from './sign-in-card'
import { seeSteps } from './see-model'
import { Face } from '../../faces'
import { AppLogo } from '../../logos/AppLogo'
import { WhatTheySee } from '../testing/WhatTheySee'
import type { SignInScreens } from '../testing/screens-of'
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
  /** The sign-in the run on screen is of, for What they see (20 Oct 2026); null where it has no page to show. */
  see?: SeeRun | null
  /** A name pressed inside the page: that thing's page takes this one's place (one page, no way back; 6 Oct 2026). */
  onOpen?: (t: InspectTarget) => void
}

/** What the panel's bar says it is showing. */
function kindOf(t: InspectTarget): string {
  if (t.kind === 'see') return SEE_TITLE
  if (isPeek(t)) return PEEK_FALLBACK[t.kind]
  return 'Policy'
}

/** "Aisha Khan", or "Anyone in Finance". */
const whoOf = (see: SeeRun, users: readonly { id: string; name: string }[]): string =>
  see.group ? `Anyone in ${see.group}` : (users.find((u) => u.id === see.personId)?.name ?? 'Choose a person')

export function InspectPanel({ target, plan, reduced, wide, onToggleWidth, onClose, onEdit, see = null, onOpen }: InspectPanelProps) {
  const present = useIsPresent()
  const lib = useBrand()
  const { policies, zones, fingerprints, hooks, riskProfiles, users, apps, showToast } = lib
  const names = useMemo(() => peekNames({ zones, fingerprints, hooks, riskProfiles, users, apps }), [zones, fingerprints, hooks, riskProfiles, users, apps])
  const heading = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  /* A rule is shown as its policy's page; the key is the page, so a new thing starts it afresh (its open rules too). */
  const page: InspectTarget = target.kind === 'rule' ? { kind: 'policy', policyId: target.policyId } : target
  const pageKey = `${page.kind}:${page.kind === 'see' ? '' : isPeek(page) ? page.id : page.policyId}:${target.kind === 'rule' ? String(target.ruleId) : ''}`
  /* What they see names the sign-in it is of: "Aisha Khan to Google Workspace". */
  const name = page.kind === 'see' ? (see ? `${whoOf(see, users)} to ${apps.find((a) => a.id === see.appId)?.name ?? plan.appName}` : SEE_TITLE) : targetLabel(page, policies, names)
  /* The rule the policy's footer opens the builder on: the one open, where exactly one is. */
  const [openOne, setOpenOne] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), reduced ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, [])
  /* A page that takes another's place (a name pressed inside it, 20 Oct 2026) hands the focus to the bar's title: the
     press that opened it has gone with the page it was on. */
  const firstKey = useRef(pageKey)
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
    if (pageKey !== firstKey.current) titleRef.current?.focus({ preventScroll: true })
  }, [pageKey])
  const copy = () => {
    const text = bodyRef.current?.innerText ?? ''
    if (!navigator.clipboard) return showToast('Could not copy the text')
    navigator.clipboard.writeText(`${kindOf(page)}: ${name}\n\n${text}`).then(() => showToast('Copied'), () => showToast('Could not copy the text'))
  }
  /* What they see's way out: the builder on the rule that decided it, or its policy where none did (a run that Depends). */
  const seeOut = page.kind === 'see' ? seeExit(plan, policies) : null
  /* The foot's way out: the builder for a policy (on its open rule, where one is), a library page for the rest; a person has none. */
  const out = page.kind === 'person' ? null : page.kind === 'see' ? (seeOut ? 'Edit in builder' : null) : isPeek(page) ? `Open in ${PEEK_LIBRARY[page.kind]}` : 'Edit in builder'
  const edit = () => {
    if (page.kind === 'see') {
      if (seeOut) onEdit(seeOut)
    } else if (page.kind === 'policy' && openOne !== undefined) onEdit({ kind: 'rule', policyId: page.policyId, ruleId: openOne })
    else onEdit(page)
  }
  /* What they see, from the policy that decided this sign-in (its "Decided this sign-in"): only where there is a page to show. */
  const preview = see && see.screens.length > 0 && onOpen ? () => onOpen({ kind: 'see' }) : undefined

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
          {page.kind === 'see' ? SEE_TITLE : `${kindOf(page)} details`}
          <span className="u-sr-only">: {name}</span>
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
        {page.kind === 'see' ? (
          <SeePage see={see} plan={plan} onOpen={onOpen} />
        ) : isPeek(page) ? (
          <PeekPage target={page} plan={plan} />
        ) : (
          <PolicyPage policyId={page.policyId} focus={target.kind === 'rule' ? target.ruleId : undefined} plan={plan} onEdit={onEdit} onOpenOne={setOpenOne} onPreview={preview} />
        )}
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
const DECISION_TONE: Record<AccessDecision, Tone> = { '1fa': 'positive', '2fa': 'positive', deny: 'negative' }
const DECISION_MARK: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': ShieldAlert, deny: ShieldX }
/** A decision as a class word: the decided rule's edge (inspect.css `is-d-*`). */
const DECISION_KEY: Record<AccessDecision, string> = { '1fa': 'allow', '2fa': 'mfa', deny: 'deny' }

/** The strip at the overview card's foot: how this thing met the sign-in on the canvas, in the outcome's own tone. */
function Verdict({ tone, icon: Icon, title, line, onPreview }: { tone: Tone; icon: LucideIcon; title: string; line?: string; onPreview?: () => void }) {
  return (
    <div className={`insp__verdict is-${tone}`} role="status">
      <span className="insp__verdictmark" aria-hidden>
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <span className="insp__verdicttext">
        <b>{title}</b>
        {line && <span>{line}</span>}
      </span>
      {/* What they see, as a page of this panel (owner, 20 Oct 2026: "here we can open the preview part"): a quiet link,
          never a second orange. */}
      {onPreview && (
        <button type="button" className="insp__link insp__preview" aria-label="Preview what they see" title={SEE_TITLE} onClick={onPreview}>
          <MonitorPlay size={14} strokeWidth={2} aria-hidden />
          Preview
        </button>
      )}
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
/** No run on screen (the Policies list's details panel): no rule has a fate, and nothing is said about a sign-in. */
const NO_RUN: Pick<EngineRun, 'decider' | 'rules'> = { decider: null, rules: [] }

/* The policy's page. `plan` null is the page without a sign-in — the Policies list's details panel (owner, 6 Oct 2026:
   "add the Policy details view here as well, with an Open in builder"): the overview card and the rules, no verdict. */
export function PolicyPage({
  policyId,
  focus,
  plan,
  onEdit,
  onOpenOne,
  canvas = false,
  onPreview,
  preview = false,
}: {
  policyId: string
  focus: string | null | undefined
  plan: EngineRun | null
  /** Absent: nothing here edits, so its applications are listed with no Edit. */
  onEdit?: (t: InspectTarget) => void
  onOpenOne: (id: string | null | undefined) => void
  canvas?: boolean
  /** What they see for this sign-in, from the strip of the policy that decided it (20 Oct 2026); absent, no Preview. */
  onPreview?: () => void
  /* A policy read inside another form — Add existing policy's pick (review, 24 Oct 2026). The canvas is drawn still
     (ReadOnlyCanvas `still`): a sentence for the start node, cards that fold, and ids of its own, so they do not
     repeat the canvas of the page under the drawer. */
  preview?: boolean
}) {
  const { policies, apps, groups, users } = useBrand()
  const policy = policies.find((p) => p.id === policyId)
  const versions = useMemo(() => (policy ? storedVersions(policy) : { draft: blankPolicy(''), live: null }), [policy])
  const diff = useDraftDiff(versions)
  const list = policy ? ruleList(policy, plan ?? NO_RUN) : []
  const depends = policy && plan ? dependsIn(plan, policy.id) : false
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
  /* Its groups and people by name, under the pointer (`CountTip`); everyone has no list. */
  const audienceLists =
    policy.isSystem || policy.audience.everyone
      ? []
      : [
          { kind: 'Groups', names: policy.audience.groupIds.map((id) => groups.find((g) => g.id === id)?.name ?? 'A deleted group') },
          { kind: 'People', names: policy.audience.userIds.map((id) => users.find((u) => u.id === id)?.name ?? 'A deleted person') },
        ]
  const decided = plan?.decider?.id === policy.id
  const by = decided && !depends ? list.find((r) => r.fate === 'decided') : undefined
  const changed = readFoot(policy).split(' · ').slice(1).join(' · ')
  const appsSaid = policy.isSystem ? (
    'Every application'
  ) : policy.appIds.length === 0 ? (
    'None'
  ) : (
    /* One: its name. More: the Policies table's marks and list under the pointer (owner, 7 Oct 2026). */
    <AppsPeek
      apps={policy.appIds.flatMap((id) => apps.find((x) => x.id === id) ?? [])}
      policyName={policy.name}
      onEdit={onEdit && !preview ? () => onEdit({ kind: 'policy', policyId: policy.id }) : undefined}
    />
  )
  const audienceNames = audienceLists.flatMap((l) => l.names)
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
          { label: 'Applications', value: appsSaid, },
          { label: 'Audience', value: audienceNames.length === 1 ? audienceNames[0] : <CountTip label={audience} lists={audienceLists} /> },
          ...(changed ? [{ label: 'Last change', value: changed, wide: true }] : []),
        ]}
        strip={
          !plan ? undefined : depends ? (
            <Verdict tone="notice" icon={CircleHelp} title="Depends" line={dependsLine(waitingOn(list), plan.outcome.view.needs)} onPreview={onPreview} />
          ) : decided && by ? (
            <Verdict tone={DECISION_TONE[by.decision]} icon={DECISION_MARK[by.decision]} title="Decided this sign-in" line={`${by.n === null ? by.name : `Rule ${by.n} · ${by.name}`} · ${DECISION_WORDS[by.decision]}`} onPreview={onPreview} />
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
        {canvas ? (
          /* The builder's own canvas, read only (owner, 7 Oct 2026: "instead of this, the canvas itself"). */
          <ReadOnlyCanvas policy={policy} traced={by ? [by.id ?? 'fallback'] : []} {...(preview ? { still: true, idPrefix: 'preview-' } : null)} />
        ) : (
        <ul className="insp__accs">
          {list.map((r) => {
            const k = rowKey(r.id)
            const fate = shownFate(r, depends)
            const FateIcon = fate ? FATE_MARK[fate] : null
            const stored = r.id === null ? undefined : policy.rules.find((x) => x.id === r.id)
            const isOpen = open.has(k)
            const bodyId = `insp-rule-${policy.id}-${k}`
            return (
              <li key={k} ref={focus !== undefined && rowKey(focus) === k ? focusRef : undefined} className={`insp__acc${isOpen ? ' is-open' : ''}${fate ? ` is-${fate}` : ''}${fate === 'decided' ? ` is-d-${DECISION_KEY[r.decision]}` : ''}`}>
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
                    <RuleBody policy={policy} ruleId={r.id} plan={plan} shown={fate} list={list} onEdit={onEdit ?? noop} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        )}
      </Block>
    </>
  )
}

/* --- What they see, on one page ---------------------------------------------------------------------------------- */

/* The way out of What they see: the builder on the rule that decided the sign-in, or its policy where none did (a run
   that Depends); none when no policy decides. */
function seeExit(plan: EngineRun, policies: readonly Policy[]): InspectTarget | null {
  const policy = plan.decider ? policies.find((p) => p.id === plan.decider?.id) : undefined
  if (!policy) return null
  const by = dependsIn(plan, policy.id) ? undefined : ruleList(policy, plan).find((r) => r.fate === 'decided')
  return by ? { kind: 'rule', policyId: policy.id, ruleId: by.id } : { kind: 'policy', policyId: policy.id }
}

/* WHAT THEY SEE (owner, 20 Oct 2026, on the Preview's popover: "open in the right side panel as a specific view, with
   context and the important information that we can show"). In the panel's own grammar:

     ┌ What they see                                   ⧉ | >< × ┐
     │ ┌ Sign-in                                               ┐ │
     │ │ (AK) Aisha Khan → [G] Google Workspace  [Allow on 1 …] │ │  the sign-in, and its answer
     │ │ Decided by  Access the app … · Rule 2 · Managed laptops│ │  each name opens its own page here
     │ └───────────────────────────────────────────────────────┘ │
     │ [ the sign-in page, played ]  Password · Signed in  ↻     │  the player, its chips and replay
     │ Steps         1 Password · 2 Signed in                   │  what each page asks for
     │ What they are asked for / told                           │  the factors, or the deny message
     │ Reason   Admins only                                     │  a Deny's cause and Ref — never on their page
     ├───────────────────────────────────────────────────────────┤
     │                                     [Edit in builder ↗]  │
     └───────────────────────────────────────────────────────────┘

   The player plays as the page arrives (testing/player/SignInPlayer.tsx: in view, a beat after), and under reduced
   motion stands on its end. A run that Depends shows each way it could go: the player's own switch, and a list each. */
function SeePage({ see, plan, onOpen }: { see: SeeRun | null; plan: EngineRun; onOpen?: (t: InspectTarget) => void }) {
  const { users, apps, policies } = useBrand()
  if (!see || see.screens.length === 0) return <p className="insp__gone">No sign-in page to show.</p>
  const app = apps.find((a) => a.id === see.appId)
  const appName = app?.name ?? plan.appName
  const who = whoOf(see, users)
  const person = see.group ? null : (users.find((u) => u.id === see.personId) ?? null)
  const policy = plan.decider ? policies.find((p) => p.id === plan.decider?.id) : undefined
  const depends = policy ? dependsIn(plan, policy.id) : plan.outcome.status === 'depends'
  const list = policy ? ruleList(policy, plan) : []
  const by = policy && !depends ? list.find((r) => r.fate === 'decided') : undefined
  const decision = plan.outcome.status === 'decided' ? plan.outcome.decision : null
  const ways = see.screens
  const many = ways.length > 1
  /* A name inside the page opens that thing's page in this one's place, as a name on the canvas does. */
  const name = (label: string, t: InspectTarget | null, cls = '') =>
    t && onOpen ? (
      <button type="button" className={`insp__name${cls ? ` ${cls}` : ''}`} title={label} onClick={() => onOpen(t)}>
        {label}
      </button>
    ) : (
      <span className={`insp__name is-static${cls ? ` ${cls}` : ''}`} title={label}>
        {label}
      </span>
    )
  const ruleTarget: InspectTarget | null = policy && by ? { kind: 'rule', policyId: policy.id, ruleId: by.id } : null
  return (
    <>
      <section className="insp__hero" aria-label={`Sign-in: ${who} to ${appName}`}>
        <div className="insp__herohead">
          <div className="insp__heroname">
            <span className="insp__kicker">Sign-in</span>
            <span className="insp__signin">
              <span className="insp__signer">
                <Face kind={see.group ? 'group' : 'user'} name={see.group ?? who} size="sm" decorative />
                {name(who, person ? { kind: 'person', id: person.id } : null)}
              </span>
              <ArrowRight size={12} strokeWidth={2.2} aria-hidden className="insp__signarrow" />
              <span className="insp__signer">
                <AppLogo appId={see.appId} name={appName} size={16} />
                {name(appName, app ? { kind: 'app', id: app.id } : null)}
              </span>
            </span>
          </div>
          {decision ? <DecisionBadge decision={decision} /> : <span className="insp__rowmeta">Depends</span>}
        </div>
        {policy && (
          <dl className="insp__herogrid">
            <div className="insp__herofact is-wide">
              <dt>{depends ? 'Policy' : 'Decided by'}</dt>
              <dd className="insp__by">
                {name(policy.name, { kind: 'policy', policyId: policy.id })}
                {by && (
                  <>
                    <span aria-hidden> · </span>
                    {name(by.n === null ? by.name : `Rule ${by.n} · ${by.name}`, ruleTarget)}
                  </>
                )}
              </dd>
            </div>
            {depends && (
              <div className="insp__herofact is-wide">
                <dt>{FATE_WORDS['cant-tell']}</dt>
                <dd>{dependsLine(waitingOn(list), plan.outcome.view.needs)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {/* The person's page, played, full width: its chips, its replay, its caption. Its own title is the bar's. */}
      <div className="insp__see">
        <WhatTheySee screens={ways} appId={see.appId} collapsible={false} />
      </div>

      <Block title="Steps">
        {many ? (
          ways.map((w, i) => (
            <div key={`${w.decision}-${i}`} className="insp__part">
              <h4>
                {DECISION_WORDS[w.decision]} · {w.ruleName}
              </h4>
              <SeeStepList screens={w} appName={appName} />
            </div>
          ))
        ) : (
          <SeeStepList screens={ways[0]} appName={appName} />
        )}
      </Block>

    </>
  )
}

/** The steps of one way, numbered as the player's chips run: the step, and what its page asks for. */
function SeeStepList({ screens, appName }: { screens: SignInScreens; appName: string }) {
  const steps = seeSteps(screens, appName)
  return (
    <ol className="insp__steps">
      {steps.map((s) => (
        <li key={`${s.n}-${s.label}`}>
          <span className="insp__n" aria-hidden>
            {s.n}
          </span>
          <span className="insp__steptext">
            <b>{s.label}</b>
            {s.asks && <span>{s.asks}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* --- A rule, open in place --------------------------------------------------------------------------------------- */

const MARK = { pass: Check, fail: X, unknown: CircleHelp } as const

/* Exported for an application's Policies tab (app-policy-view.tsx), which opens each row of its chain on this body with
   no run on screen (`plan` null, `shown` null, `list` empty): what it checks, what it uses, what the person is told. */
export function RuleBody({ policy, ruleId, plan, shown, list, onEdit }: { policy: Policy; ruleId: string | null; plan: EngineRun | null; shown: Shown | null; list: readonly RuleListRow[]; onEdit: (t: InspectTarget) => void }) {
  const lib = useBrand()
  const { zones, fingerprints, hooks, riskProfiles, activeRiskProfileId, users, apps } = lib
  const resolve = useNameLookup()
  const [use, setUse] = useState<string | null>(null)
  const found = ruleOf(policy, ruleId)
  if (!found) return <p className="insp__gone">This rule is no longer there.</p>
  const { rule, terminal } = found
  const evidence: Evidence[] = plan ? evidenceOf(plan, policy.id, ruleId) : []
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
            : shown === null && plan
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

/* The builder's canvas, read only: `.bb.is-left-open` already draws it without insert points, switches, menus or grips
   (board.css), and every handler stands down. Pan and zoom stay. */
const NONE: Selection = { kind: 'none' }
const noop = () => {}
/* `framed` (an application's Policies tab, 20 Oct 2026): the chain at a glance in a panel of fixed height that
   scrolls it (board.css `.insp__canvas.is-framed`). A press anywhere on a card folds it — not while text in it is
   being selected — its title is its one keyboard stop, and the reorder number leaves the tab order. `open` and
   `onOpen` hold the one unfolded card for the host (the board's accordion, 23 Sep 2026), so a sign-in picked beside it
   can open its rule; left out, each card folds on its own, as here before. `cardHead` puts each card's outcome where
   its state pill was. Every one is opt-in: the details slider and the Add existing preview pass none of them. */
export function ReadOnlyCanvas({
  policy,
  traced,
  framed = false,
  open: openId,
  onOpen,
  cardHead,
  appFirst,
  still = false,
  idPrefix,
}: {
  policy: Policy
  traced: readonly string[]
  /** The application whose page this is: the start pill names it first (21 Oct 2026), the others after it. */
  appFirst?: string
  framed?: boolean
  /* Nothing on it edits (PolicyPage `preview`, review 24 Oct 2026). Unframed, a press on a card used to go to a no-op
     select and the start pill was a button to a panel that is not there: here a press folds the card, as on a framed
     canvas, and the start pill is the sentence alone (Board `still`). */
  still?: boolean
  /** Before every id the canvas draws, for a canvas drawn while another is in the page (Board `idPrefix`). */
  idPrefix?: string
  /* Which cards are open, when the caller holds that itself. ONE id is the accordion the framed panel and the
     details slider want: the canvas closes whatever else was open. A SET is for a caller that lets several stand
     open at once — the app's Policies tab since 22 Oct, which has an Expand all — and such a caller is handed the
     id that was pressed and does its own adding and removing. */
  open?: string | null | ReadonlySet<string>
  onOpen?: (id: string | null) => void
  cardHead?: (id: string) => ReactNode
}) {
  const { apps } = useBrand()
  const resolve = useNameLookup()
  const mine = policy.appIds.flatMap((id) => apps.find((a) => a.id === id) ?? []).sort((a, b) => Number(b.id === appFirst) - Number(a.id === appFirst))
  /* An overview, not a canvas: the chain at its own size in the page, no pan or zoom; a card unfolds to read its rule. */
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  /* The board's wheel handler zooms and cancels the scroll; here the wheel belongs to the slider, so it never gets there. */
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrap.current
    const stop = (e: WheelEvent) => e.stopPropagation()
    el?.addEventListener('wheel', stop, { capture: true })
    return () => el?.removeEventListener('wheel', stop, { capture: true })
  }, [])
  /* Framed, the canvas is its panel's scroller: it keeps the wheel only while it has something to scroll. */
  useEffect(() => {
    const el = wrap.current
    if (!framed || !el) return
    const stage = el.querySelector('.bb__stage')
    return containWhileScrolling(el, stage ? [stage] : [])
  }, [framed])
  const held = openId !== undefined
  const isHeldOpen = (id: string) => (openId instanceof Set ? openId.has(id) : openId === id)
  const toggle = (id: string) => {
    /* A set-holding caller toggles for itself, so it is always told which card was pressed; a single-id one is
       told what to open, and null to close the one that was. */
    if (held) onOpen?.(openId instanceof Set ? id : isHeldOpen(id) ? null : id)
    else setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  /* Text being selected inside the canvas is somebody reading, not pressing. */
  const selecting = () => {
    const s = typeof window === 'undefined' ? null : window.getSelection()
    return !!s && !s.isCollapsed && !!wrap.current?.contains(s.anchorNode)
  }
  const press = (s: Selection) => {
    if (selecting()) return
    if (s.kind === 'rule') toggle(s.id)
    else if (s.kind === 'fallback') toggle('fallback')
  }
  return (
    <div ref={wrap} className={`bb is-left-open insp__canvas${framed ? ' is-framed' : ''}`}>
      <Board
        policy={policy}
        destination={mine[0]?.name ?? (policy.isSystem ? 'any application' : null)}
        destinationAppId={mine[0]?.id ?? null}
        destinationMore={Math.max(mine.length - 1, 0)}
        selection={NONE}
        diagnostics={[]}
        shadowed={[]}
        fitKey={policy.id}
        traced={traced}
        resolve={resolve}
        onSelect={framed || still ? press : noop}
        onInsert={noop}
        onMove={noop}
        onToggle={noop}
        onDuplicate={noop}
        onDelete={noop}
        onHover={noop}
        expandedOf={held ? isHeldOpen : (id) => open.has(id)}
        onToggleExpand={toggle}
        locked={framed || still}
        foldOnPress={framed || still || undefined}
        cardHead={cardHead}
        still={still}
        idPrefix={idPrefix}
      />
    </div>
  )
}
