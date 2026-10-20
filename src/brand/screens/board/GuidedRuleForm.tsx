import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AppWindow, ArrowRight, Check, ChevronDown, Gauge, Globe, MonitorSmartphone, Plus, SlidersHorizontal, type LucideIcon } from 'lucide-react'

import type { AccessDecision, RuleWho } from '../../data'
import type { DescribeTenant } from '../../create/describe-model'
import { DecisionMark } from '../../decision-badge'
import { DECISION_BADGE_TONE, DECISION_PHRASE, DECISION_WORDS } from '../../decision-words'
import { Face } from '../../faces'
import { AppLogo } from '../../logos/AppLogo'
import { PickCombo, type PickOption } from '../pick-combo'
import { WhoCombo } from '../who-combo'
import type { NewRulePick } from './guided-setup'

/* -----------------------------------------------------------------------------
   Guided setup's New rule form (GuidedSetup.tsx; docs/specs/GUIDED-SETUP.md),
   as approved 19 Oct 2026 (owner: "the form view should be simple; all the
   things should be shown on click … different states for all the sections …
   icons and colour based on need").

   Four sections, in the kept order, each ONE ROW at rest — its state mark, its
   label, its value with its marks, a chevron:

     ✓ Applications   ▣ HRMS                     — logos; two when both fit whole, else the first and "+N"
     ✓ What happens   (k) Allow with 2FA          — the decision's own mark and colour
     ⊕ Who            Everyone                    — faces; "Finance and 5 more"
     ⊕ Conditions     Any place, any device       — the condition's icon and its name ("India"), as Applications

   The mark says the state: a grey tick once answered, a dashed ring with a plus
   while it is empty or the default (Who's Everyone, Conditions' anywhere) —
   whose words are muted. A press on a row (or Enter, Space) opens it in place;
   one open at a time; Esc closes it and gives the focus back to its row.
   Opened: Applications and Conditions are chip fields like Who (pick-combo.tsx,
   the Access checks Identity field's shape — chips inside, a portalled list);
   What happens is three full-width rows, each its coloured mark, its name and a
   short gloss, the one picked tinted in its own decision tone with a tick; Who
   is the Identity field itself (who-combo.tsx). A Deny already denies, so
   Conditions stand down for it.

   Under the rows, the rule as one sentence with its marks inline — a face for
   the first of who, a logo for the first application, "and N more" for the
   rest (named on hover), the decision's mark before its words, each
   condition's icon — and the ink Add rule (never orange), waiting for an
   application.
   -------------------------------------------------------------------------- */

export interface GuidedForm {
  /** The policy's applications: ticked to begin with. */
  apps: readonly string[]
  /** The sign-in policy that already holds an application, if another does. */
  taken: (appId: string) => string | undefined
  onAdd: (pick: NewRulePick) => void
}

export type SectionId = 'apps' | 'decision' | 'who' | 'conds'

/** Where the form starts, other than empty and closed: the static-markup tests draw an open section and a filled rule. */
export interface GuidedFormStart {
  open?: SectionId
  decision?: AccessDecision
  who?: RuleWho
  /** Condition ids: `z:<zone>`, `f:<profile>`, `risk`. */
  conds?: readonly string[]
}

const EASE = [0.2, 0, 0, 1] as const

/* What happens: the three decisions in their own words, each with a short plain gloss. */
const CHOICES: readonly { decision: AccessDecision; gloss: string }[] = [
  { decision: '2fa', gloss: 'Password, then a second factor' },
  { decision: '1fa', gloss: 'Password only' },
  { decision: 'deny', gloss: 'Refused, with a message' },
]

/* Conditions, from what this tenant has — every zone and profile, since the list scrolls and searches: where a sign-in
   comes from, what it comes from, and the risk. One zone and one profile at most — a second of the same kind takes
   the first one's place — and always in that order, zone, profile, risk, whatever order they were picked in. */
interface Cond {
  id: string
  kind: 'zone' | 'profile' | 'risk'
  /** The list, the hover and a screen reader: "Only from India". */
  label: string
  /** The chip and the row's value, beside the kind's icon (the field and the row already say Conditions): "India". */
  short: string
  /** The thing it names, for the sentence: "India". */
  name: string
}
const COND_ICON: Record<Cond['kind'], LucideIcon> = { zone: Globe, profile: MonitorSmartphone, risk: Gauge }

function condsOf(tenant: DescribeTenant): Cond[] {
  return [
    ...tenant.zones.map((z): Cond => ({ id: `z:${z.id}`, kind: 'zone', label: `Only from ${z.name}`, short: z.name, name: z.name })),
    ...tenant.fingerprints.map((f): Cond => ({ id: `f:${f.id}`, kind: 'profile', label: `Only on ${f.name}`, short: f.name, name: f.name })),
    { id: 'risk', kind: 'risk', label: 'Deny at high risk', short: 'High risk', name: 'deny at high risk' },
  ]
}

/** "A", "A and B", "A, B and C" — for a hover, which may name everyone. */
const joinNames = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/* A condition's icon in the grey square a chip and a list row hold it in, where an application holds its logo. */
function CondArt({ kind, size = 'sm' }: { kind: Cond['kind']; size?: 'sm' | 'md' }) {
  const Icon = COND_ICON[kind]
  return (
    <span className={`bgf__condart is-${size}`} aria-hidden>
      <Icon size={size === 'md' ? 14 : 12} strokeWidth={2} />
    </span>
  )
}

/* A section's state: a grey tick once answered, a dashed ring with a plus while it is empty or the default. */
function StateMark({ set, reduced }: { set: boolean; reduced: boolean }) {
  if (!set)
    return (
      <span className="bgf__state is-empty" aria-hidden>
        <Plus size={12} strokeWidth={2.4} />
      </span>
    )
  return (
    <motion.span
      key="set"
      className="bgf__state is-set"
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      aria-hidden
    >
      <Check size={12} strokeWidth={3} />
    </motion.span>
  )
}

/* One section: the row (a disclosure button — the label and the value are its name) and, open, its contents. */
function Section({
  id,
  label,
  set,
  muted,
  value,
  said,
  hover,
  open,
  disabled = false,
  reduced,
  onToggle,
  onClose,
  children,
}: {
  id: SectionId
  label: string
  /** Answered (a grey tick), or empty / the default (a dashed ring, the value muted). */
  set: boolean
  muted: boolean
  /** The value as drawn: marks and words. */
  value: ReactNode
  /** The value as read: every name. */
  said: string
  /** The value on hover, when the row shows only some of it. */
  hover?: string
  open: boolean
  disabled?: boolean
  reduced: boolean
  onToggle: (id: SectionId) => void
  onClose: () => void
  children: ReactNode
}) {
  const dom = useId()
  const head = useRef<HTMLButtonElement | null>(null)
  /* Esc inside an open section closes it and hands the focus back to its row — before the panel's own Escape. A field
     whose list is open has taken its Escape already. */
  const onKey = (e: ReactKeyboardEvent) => {
    if (!open || e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    onClose()
    head.current?.focus()
  }
  return (
    <div className={`bgf__sec is-${id}${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} onKeyDown={onKey}>
      <button
        ref={head}
        id={`${dom}-head`}
        type="button"
        className="bgf__head"
        aria-expanded={open}
        aria-controls={open ? `${dom}-body` : undefined}
        disabled={disabled}
        onClick={() => onToggle(id)}
      >
        <StateMark set={set} reduced={reduced} />
        <span className="bgf__label">{label}</span>
        <span className={`bgf__value${muted ? ' is-muted' : ''}`} title={hover} aria-hidden>
          {value}
        </span>
        <span className="u-sr-only">{said}</span>
        <motion.span className="bgf__chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: EASE }} aria-hidden>
          <ChevronDown size={14} strokeWidth={2} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            id={`${dom}-body`}
            role="region"
            aria-labelledby={`${dom}-head`}
            className="bgf__body"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
          >
            <div className="bgf__bodyin">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* The three decisions as full-width rows — one choice, so a radio group: the one picked checked, tinted in its own
   decision tone, with a tick at its end, and the only one in the tab order. In the New rule form (open What happens)
   each row has its gloss, and the arrow keys, Home and End move and choose — nothing is written until Add rule. The
   panel's other decision pickers (a selected rule's What happens, Everyone else) are the same rows, `compact` — one
   line, no gloss — and `writes`: each choice writes the board, so the keys only move, and Space or Enter chooses. */
export function DecisionChoices({
  label,
  value,
  onPick,
  compact = false,
  writes = false,
}: {
  label: string
  value: AccessDecision
  onPick: (d: AccessDecision) => void
  compact?: boolean
  writes?: boolean
}) {
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const n = CHOICES.length
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : dir ? (i + dir + n) % n : -1
    if (to < 0) return
    e.preventDefault()
    e.stopPropagation()
    if (!writes) onPick(CHOICES[to].decision)
    rows.current[to]?.focus()
  }
  return (
    <div className={`bgf__choices${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label={label}>
      {CHOICES.map((c, i) => {
        const on = value === c.decision
        return (
          <button
            key={c.decision}
            ref={(el) => {
              rows.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`bgf__choice is-${DECISION_BADGE_TONE[c.decision]}`}
            onClick={() => !(writes && on) && onPick(c.decision)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <DecisionMark decision={c.decision} size={compact ? 'sm' : 'md'} />
            <span className="bgf__choicetext">
              <span className="bgf__choicename">{DECISION_WORDS[c.decision]}</span>
              {!compact && <span className="bgf__gloss">{c.gloss}</span>}
            </span>
            <span className="bgf__choicetick" aria-hidden>
              {on && <Check size={14} strokeWidth={2.6} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* A name in the sentence or a row's value, with its mark before it — and, in the sentence, the word that leads it in
   ("from", "on", "and"), inside the same unbreakable piece, so a line breaks only between whole phrases. */
function Tok({ art, name, lead, className = '' }: { art: ReactNode; name: string; lead?: string; className?: string }) {
  return (
    <span className={`bgf__tok${className ? ` ${className}` : ''}`}>
      {lead && <span className="bgf__lead">{lead}</span>}
      {art}
      <span className="bgf__tokname">{name}</span>
    </span>
  )
}

/* "and 5 more", kept on one line, with the rest named on hover. */
const More = ({ rest }: { rest: readonly string[] }) =>
  rest.length > 0 ? (
    <>
      {' '}
      <span className="bgf__more" title={joinNames(rest)}>
        {`and ${rest.length} more`}
      </span>
    </>
  ) : null

/* A row's value of one or more names: two side by side only when both fit whole, else the first and "+N" — measured
   (as pick-combo.tsx measures its chip lines) whenever the names or the row's width change, in a layout effect so no
   frame shows a cut name. Past two, always the first and "+N". */
function FitValue({ items, names }: { items: readonly ReactNode[]; names: string }) {
  const box = useRef<HTMLSpanElement | null>(null)
  const [both, setBoth] = useState(true)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const row = box.current?.parentElement
    if (!row || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(row)
    return () => ro.disconnect()
  }, [])
  const key = `${names}|${width}`
  const measuredFor = useRef('')
  useLayoutEffect(() => {
    if (items.length !== 2) return
    if (measuredFor.current !== key) {
      measuredFor.current = key
      if (!both) {
        setBoth(true)
        return
      }
    }
    if (!both || !box.current) return
    const cut = Array.from(box.current.querySelectorAll<HTMLElement>('.bgf__tokname')).some((el) => el.scrollWidth > el.clientWidth + 0.5)
    if (cut) setBoth(false)
  }, [key, both, items.length])
  const two = items.length === 2 && both
  return (
    <span ref={box} className="bgf__fit">
      {two ? items : items.slice(0, 1)}
      {!two && items.length > 1 && <span className="bgf__plus">+{items.length - 1}</span>}
    </span>
  )
}

export function GuidedRuleForm({ tenant, guided, start }: { tenant: DescribeTenant; guided: GuidedForm; start?: GuidedFormStart }) {
  const reduced = useReducedMotion() ?? false
  const [apps, setApps] = useState<string[]>(() => [...guided.apps])
  const [decision, setDecision] = useState<AccessDecision>(start?.decision ?? '2fa')
  const [who, setWho] = useState<RuleWho | undefined>(start?.who)
  const [conds, setConds] = useState<string[]>(() => [...(start?.conds ?? [])])
  const [open, setOpen] = useState<SectionId | null>(start?.open ?? null)

  const condOptions = useMemo(() => condsOf(tenant), [tenant])
  /* A Deny already denies — no "only" to keep, no high-risk Deny to add — so Conditions stand down. */
  const condsOn = decision !== 'deny'
  const toggle = (id: SectionId) => setOpen((o) => (o === id ? null : id))
  const close = () => setOpen(null)

  /* Applications: the policy's own first; one another sign-in policy holds is off ("In use"). */
  const appOptions: PickOption[] = useMemo(
    () =>
      [...tenant.apps.filter((p) => guided.apps.includes(p.id)), ...tenant.apps.filter((p) => !guided.apps.includes(p.id))].map((p) => {
        const owner = guided.apps.includes(p.id) ? undefined : guided.taken(p.id)
        return { value: p.id, label: p.name, art: <AppLogo appId={p.id} name={p.name} size={18} />, ...(owner ? { meta: 'In use', disabled: true } : null) }
      }),
    [tenant.apps, guided],
  )
  const chosenApps = apps.map((id) => tenant.apps.find((a) => a.id === id)).filter((a): a is DescribeTenant['apps'][number] => !!a)
  const appNames = chosenApps.map((a) => a.name)

  const whoNames: { kind: 'group' | 'user'; name: string }[] = [
    ...(who?.groupIds ?? []).map((id) => ({ kind: 'group' as const, name: tenant.groups.find((g) => g.id === id)?.name ?? id })),
    ...(who?.userIds ?? []).map((id) => ({ kind: 'user' as const, name: tenant.users.find((u) => u.id === id)?.name ?? id })),
  ]

  const condPicks = condOptions.filter((c) => conds.includes(c.id))
  const condsLive = condsOn ? condPicks : []
  const condItems: PickOption[] = condOptions.map((c) => ({ value: c.id, label: c.label, chip: c.short, art: <CondArt kind={c.kind} size="md" /> }))
  /* Kept in kind order — zone, profile, risk — so the chips and the row read the same way however they were picked. */
  const condOrder = (id: string) => condOptions.findIndex((c) => c.id === id)
  const toggleCond = (id: string) =>
    setConds((x) =>
      (x.includes(id) ? x.filter((v) => v !== id) : [...(id !== 'risk' ? x.filter((v) => v.slice(0, 2) !== id.slice(0, 2)) : x), id]).sort(
        (a, b) => condOrder(a) - condOrder(b),
      ),
    )
  const toggleApp = (id: string) => setApps((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const ready = apps.length > 0
  const add = () => {
    if (!ready) return
    const zone = condsLive.find((c) => c.kind === 'zone')
    const profile = condsLive.find((c) => c.kind === 'profile')
    guided.onAdd({
      apps,
      decision,
      ...(who ? { who } : null),
      ...(zone ? { zoneId: zone.id.slice(2) } : null),
      ...(profile ? { profileId: profile.id.slice(2) } : null),
      denyHighRisk: condsLive.some((c) => c.kind === 'risk'),
    })
  }

  /* --- The rows' values: marks and words, never every name ---------------------------------------- */

  const appsValue =
    chosenApps.length === 0 ? (
      'Choose applications'
    ) : (
      <FitValue names={appNames.join('\n')} items={chosenApps.map((a) => <Tok key={a.id} art={<AppLogo appId={a.id} name={a.name} size={18} />} name={a.name} />)} />
    )
  const whoValue =
    whoNames.length === 0 ? (
      'Everyone'
    ) : (
      <>
        <Tok art={<Face kind={whoNames[0].kind} name={whoNames[0].name} size="sm" decorative />} name={whoNames[0].name} />
        {whoNames.length > 1 && <span className="bgf__plus">{`and ${whoNames.length - 1} more`}</span>}
      </>
    )
  const condsValue =
    condsLive.length === 0 ? (
      'Any place, any device'
    ) : (
      <FitValue names={condsLive.map((c) => c.id).join('\n')} items={condsLive.map((c) => <Tok key={c.id} art={<CondArt kind={c.kind} />} name={c.short} />)} />
    )

  /* --- The sentence: one line, its marks inline -------------------------------------------------- */

  const where = condsLive.filter((c) => c.kind !== 'risk')
  const risk = condsLive.some((c) => c.kind === 'risk')
  const sentence = (
    <>
      {whoNames.length === 0 ? (
        'Everyone'
      ) : (
        <>
          <Tok className="is-said" art={<Face kind={whoNames[0].kind} name={whoNames[0].name} size="sm" decorative />} name={whoNames[0].name} />
          <More rest={whoNames.slice(1).map((n) => n.name)} />
        </>
      )}
      {' signing in to '}
      {chosenApps.length === 0 ? (
        <span className="bgf__gap">which applications</span>
      ) : (
        <>
          <Tok className="is-said" art={<AppLogo appId={chosenApps[0].id} name={chosenApps[0].name} size={16} />} name={chosenApps[0].name} />
          <More rest={appNames.slice(1)} />
        </>
      )}
      {': '}
      <span className="bgf__outcome">
        <DecisionMark decision={decision} size="xs" />
        {DECISION_PHRASE[decision]}
      </span>
      {where.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 ? ', ' : ' '}
          <Tok className="is-said" lead={`${i === 0 ? 'only ' : ''}${c.kind === 'zone' ? 'from' : 'on'}`} art={<CondArt kind={c.kind} />} name={c.name} />
        </Fragment>
      ))}
      {risk && (where.length > 0 ? ', ' : ' ')}
      {risk && <Tok className="is-said" lead="and" art={<CondArt kind="risk" />} name="deny at high risk" />}
      {'.'}
    </>
  )

  return (
    <div className="bgf">
      <div className="bgf__rows">
        <Section
          id="apps"
          label="Applications"
          set={chosenApps.length > 0}
          muted={chosenApps.length === 0}
          value={appsValue}
          said={chosenApps.length === 0 ? 'Choose applications' : joinNames(appNames)}
          hover={chosenApps.length > 1 ? joinNames(appNames) : undefined}
          open={open === 'apps'}
          reduced={reduced}
          onToggle={toggle}
          onClose={close}
        >
          <PickCombo
            label="Applications"
            noun="applications"
            options={appOptions}
            value={apps}
            onToggle={toggleApp}
            empty="Choose applications"
            emptyArt={<AppWindow size={13} strokeWidth={1.9} />}
          />
        </Section>

        <Section
          id="decision"
          label="What happens"
          set
          muted={false}
          value={<Tok art={<DecisionMark decision={decision} size="sm" />} name={DECISION_WORDS[decision]} />}
          said={DECISION_WORDS[decision]}
          open={open === 'decision'}
          reduced={reduced}
          onToggle={toggle}
          onClose={close}
        >
          <DecisionChoices label="What happens" value={decision} onPick={setDecision} />
        </Section>

        <Section
          id="who"
          label="Who"
          set={whoNames.length > 0}
          muted={whoNames.length === 0}
          value={whoValue}
          said={whoNames.length === 0 ? 'Everyone' : joinNames(whoNames.map((n) => n.name))}
          hover={whoNames.length > 1 ? joinNames(whoNames.map((n) => n.name)) : undefined}
          open={open === 'who'}
          reduced={reduced}
          onToggle={toggle}
          onClose={close}
        >
          <WhoCombo who={who} onChange={setWho} users={tenant.users} groups={tenant.groups} />
        </Section>

        <Section
          id="conds"
          label="Conditions"
          set={condsLive.length > 0}
          muted={condsLive.length === 0}
          value={condsValue}
          said={condsLive.length === 0 ? 'Any place, any device' : joinNames(condsLive.map((c) => c.label))}
          hover={condsLive.length > 0 ? joinNames(condsLive.map((c) => c.label)) : undefined}
          open={condsOn && open === 'conds'}
          disabled={!condsOn}
          reduced={reduced}
          onToggle={toggle}
          onClose={close}
        >
          <PickCombo
            label="Conditions"
            noun="conditions"
            options={condItems}
            value={conds}
            onToggle={toggleCond}
            empty="Any place, any device"
            emptyArt={<SlidersHorizontal size={13} strokeWidth={1.9} />}
            answer
          />
        </Section>
      </div>

      {/* The rule as one sentence, as it is answered. */}
      <div className={`bgf__send${ready ? ' is-ready' : ''}`}>
        <p className="bgf__sentence" aria-live="polite">
          {sentence}
        </p>
        <button type="button" className="bgf__go" disabled={!ready} onClick={add}>
          Add rule
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
