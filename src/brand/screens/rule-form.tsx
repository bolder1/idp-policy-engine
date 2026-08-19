import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  CopyPlus,
  Fingerprint,
  Globe,
  Info,
  ListFilter,
  MapPin,
  Minus,
  MonitorSmartphone,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Webhook,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Counter, DecisionChip, TipDot, Toggle } from '../kit'
import {
  CONDITION_CATALOGUE,
  cond,
  conditionType,
  type AccessDecision,
  type Condition,
  type ConditionType,
  type Policy,
  type Rule,
} from '../data'
import { useBrand } from '../store'
import { modeLabel } from '../fingerprint'
import { ruleSentence } from './builder-dialogs'
import { impactOf, type Diagnostic } from './diagnostics'
import { SITUATIONS, sweep } from './impact-arena'
import {
  AUTH_STATES,
  DEVICE_OPTIONS,
  PLACES,
  RISKS,
  SIM_USERS,
  evalCond,
  evalRule,
  walk,
  type SimContext,
  type SimEnv,
} from './simulate'

/* -----------------------------------------------------------------------------
   The rule form, and the live preview that answers it.

   Pulled out of v4 the moment v5 needed the same form in three different
   layouts. Two implementations of a form this long is two places for the factor
   configuration to drift, and drift in THIS form means two screens disagreeing
   about what a rule does.

   So: v4 gives the form a permanent middle column, v5 hosts it inside an
   expanding step or a fixed inspector, and both are rendering these components.
   The host owns layout, selection and history; this module owns the fields.
   -------------------------------------------------------------------------- */

const GROUP_ICON: Record<string, LucideIcon> = {
  Network: Globe,
  Location: MapPin,
  Device: MonitorSmartphone,
  User: Fingerprint,
  Group: Users,
  Time: Clock,
  'Custom attributes': ListFilter,
  Webhooks: Webhook,
}
/* One feedback triad per condition category. Eight groups, seven distinct tones
   and neutral for the rest — and never `negative`, because red means danger in
   this kit and a network condition is not a danger. */
const GROUP_TONE: Record<string, string> = {
  Network: 'info',
  Location: 'lime',
  Device: 'accent',
  User: 'magenta',
  Group: 'positive',
  Time: 'notice',
  'Custom attributes': 'neutral',
  Webhooks: 'neutral',
}

const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

export const OUTCOMES: { id: AccessDecision; label: string; sub: string; icon: LucideIcon }[] = [
  { id: '1fa', label: 'Allow', sub: 'One factor, nothing further asked', icon: Users },
  { id: '2fa', label: 'Require MFA', sub: 'A second factor before access', icon: ShieldCheck },
  { id: 'deny', label: 'Deny', sub: 'The sign-in is refused outright', icon: ShieldAlert },
]
export const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/** The console's first-factor catalogue, in its order — same list v1 uses. */
const METHODS = [
  'miniOrange Push',
  'TOTP Authenticator',
  'WebAuthn / FIDO2',
  'SMS / OTP',
  'Email OTP',
  'Hardware Token',
  'Security Questions',
]

export const FORM_SECTIONS = [
  { id: 'identity', label: 'Name' },
  { id: 'audience', label: 'Who it applies to' },
  { id: 'if', label: 'When it applies' },
  { id: 'then', label: 'What happens' },
  { id: 'checks', label: 'Checks & impact' },
] as const
export type SectionId = (typeof FORM_SECTIONS)[number]['id']

export type RuleState = 'ready' | 'setup' | 'warn'

export function ruleState(diags: Diagnostic[]): RuleState {
  if (diags.some((d) => d.severity === 'error')) return 'setup'
  if (diags.some((d) => d.severity === 'warning')) return 'warn'
  return 'ready'
}

/** All-AND, all-OR, or a mix the model reads strictly left to right. */
export type MatchMode = 'all' | 'any' | 'custom'
export function matchMode(r: Rule): MatchMode {
  if (r.conditions.length < 2) return 'all'
  const joiners = new Set(r.conditions.slice(1).map((c) => c.joiner))
  if (joiners.size > 1) return 'custom'
  return joiners.has('OR') ? 'any' : 'all'
}

/* A new condition opens on a usable value rather than an empty one — a blank
   value is a rule that can never fire, and diagnose() rightly calls that an
   error, so seeding is the difference between adding a condition and adding a
   defect. Same rule V0 follows. */
export function seedValues(t: ConditionType, zoneId?: string, postureId?: string, hookId?: string): string[] {
  if (t.valueKind === 'zone') return zoneId ? [zoneId] : []
  if (t.valueKind === 'fingerprint') return postureId ? [postureId] : []
  if (t.valueKind === 'hook') return hookId ? [hookId] : []
  if (t.valueKind === 'time') return ['09:00', '17:00']
  if (t.options?.length) return [t.options[0]]
  return ['']
}

export interface PreviewState {
  userId: string
  place: string
  device: string
  authState: string
  risk: string
}

export const DEFAULT_PREVIEW: PreviewState = {
  userId: SIM_USERS[0].id,
  place: 'Office Network',
  device: 'Known < 90 days',
  authState: 'Normal returning user',
  risk: 'Low',
}

/** The context every preview and checklist in a host is answered against. */
export function previewContext(pv: PreviewState): SimContext {
  const now = new Date()
  return {
    user: SIM_USERS.find((u) => u.id === pv.userId) ?? SIM_USERS[0],
    place: pv.place,
    device: pv.device,
    authState: pv.authState,
    risk: pv.risk,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  }
}

/* --- The whole form ------------------------------------------------------------ */

export function RuleForm({
  policy,
  index,
  ctx,
  env,
  diagnostics,
  ifView,
  onIfView,
  onPatch,
  onJump,
  onDuplicate,
  onCopyTo,
  onDelete,
  sticky = true,
}: {
  policy: Policy
  index: number
  ctx: SimContext
  env: SimEnv
  diagnostics: Diagnostic[]
  ifView: 'build' | 'check'
  onIfView: (v: 'build' | 'check') => void
  onPatch: (p: Partial<Rule>) => void
  onJump: (i: number) => void
  onDuplicate?: () => void
  /** Gap 3 — copy this rule into another policy of the same type. */
  onCopyTo?: () => void
  onDelete?: () => void
  /** Hosts that already show the rule's identity above the form turn this off. */
  sticky?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const rule = policy.rules[index]
  if (!rule) return null

  return (
    <div className="bf__sheet">
      {sticky && (
        /* A long form scrolls the rule's own name off screen, and the one
           question you must never have to scroll up to answer is "which rule am
           I editing". */
        <div className="bf__sticky">
          <span className={`bf__stickyn is-${DEC_KEY[rule.decision]}`}>{index + 1}</span>
          <strong>{rule.name}</strong>
          <DecisionChip decision={rule.decision} size="sm" />
          <label className="bf__stickyswitch">
            <Toggle checked={rule.enabled} onChange={(v) => onPatch({ enabled: v })} label={`Enable ${rule.name}`} size="sm" />
            <span>{rule.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>
      )}

      <Section id="identity" n={1} title="Name this rule">
        <input
          className="bf__input bf__input--big"
          aria-label="Rule name"
          value={rule.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        {/* Second field, deliberately quieter than the first and never
            required. The name is what every other surface renders; this is what
            the person who inherits the policy reads before deciding whether
            they are allowed to remove it. Placeholder asks for the reason
            rather than a restatement, because "blocks off-network finance
            access" under a rule called "Off-network finance access" is the
            failure mode this field has in every product that ships it. */}
        <textarea
          className="bf__input bf__why"
          aria-label="Why this rule exists"
          rows={2}
          placeholder="Why does this rule exist? A regulator, an incident, a request — whatever the next person needs to know before changing it."
          value={rule.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </Section>

      <AudienceSection rule={rule} onPatch={onPatch} />

      <IfSection
        rule={rule}
        view={ifView}
        onView={onIfView}
        adding={adding}
        onAdding={setAdding}
        ctx={ctx}
        env={env}
        onPatch={onPatch}
      />

      <ThenSection rule={rule} onPatch={onPatch} />

      <ChecksSection policy={policy} index={index} env={env} diagnostics={diagnostics} onJump={onJump} />

      {(onDuplicate || onCopyTo || onDelete) && (
        <div className="bf__rowacts">
          {onDuplicate && (
            <button type="button" onClick={onDuplicate}>
              <Copy size={13} strokeWidth={1.9} aria-hidden /> Duplicate this rule
            </button>
          )}
          {onCopyTo && (
            <button type="button" onClick={onCopyTo}>
              <CopyPlus size={13} strokeWidth={1.9} aria-hidden /> Copy to another policy
            </button>
          )}
          {onDelete && (
            <button type="button" className="is-danger" onClick={onDelete}>
              <Trash2 size={13} strokeWidth={1.9} aria-hidden /> Delete this rule
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* --- A form section -----------------------------------------------------------

   The hint used to be a paragraph under every heading. Five of them accounted
   for a third of the words on the screen and none of them carried data, so they
   are demoted to a Tip on the heading: still one gesture away, no longer
   occupying the form.

   `bare` is for hosts that already supply the heading — the step trail names the
   step it is on, and a second copy of the same title inside it is furniture. */

export function Section({
  id,
  n,
  title,
  hint,
  aside,
  bare,
  children,
}: {
  id: SectionId
  n?: number
  title?: string
  hint?: string
  aside?: React.ReactNode
  bare?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`bf__sec ${bare ? 'is-bare' : ''}`} id={`sec-${id}`}>
      {!bare && (
        <header>
          {n !== undefined && <span className="bf__secn">{n}</span>}
          <div>
            <h2>
              {title}
              {hint && <TipDot text={hint} />}
            </h2>
          </div>
          {aside}
        </header>
      )}
      {/* Hosted by the trail. The trail's chip is an abbreviation — "When" — so
          the panel still says the whole thing once, with the demoted sentence
          on the dot beside it. */}
      {bare && (
        <div className="bf__secbar">
          <h2>
            {title}
            {hint && <TipDot text={hint} />}
          </h2>
          {aside}
        </div>
      )}
      <div className="bf__secbody">{children}</div>
    </section>
  )
}

/* --- Who it applies to --------------------------------------------------------- */

export function AudienceSection({
  rule,
  onPatch,
  bare,
  n = 2,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  bare?: boolean
  /** The host owns the numbering — v5 still counts the name section as 1. */
  n?: number
}) {
  const store = useBrand()
  return (
    <Section
      id="audience"
      n={n}
      bare={bare}
      title="Who it applies to"
      hint="The audience is checked before any condition. Somebody outside it never reaches this rule."
    >
      <div className="bf__groups">
        {store.groups.map((g) => {
          const all = g.id === 'all'
          const on = rule.appliesTo.includes(g.id)
          return (
            <button
              key={g.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={`bf__group ${on ? 'is-on' : ''}`}
              onClick={() => {
                /* "All Employees" is the whole directory, not one group among
                   many, so it replaces a selection rather than joining it —
                   otherwise you can build "All AND Finance", which reads
                   narrower than it is. */
                if (all) return onPatch({ appliesTo: ['all'] })
                const rest = rule.appliesTo.filter((x) => x !== 'all')
                const next = rest.includes(g.id) ? rest.filter((x) => x !== g.id) : [...rest, g.id]
                onPatch({ appliesTo: next.length ? next : ['all'] })
              }}
            >
              <span className="bf__groupcheck" aria-hidden>
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="bf__groupname">{g.name}</span>
              <span className="bf__groupn">{g.memberCount.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

/* --- IF: the condition composer ------------------------------------------------ */

export function IfSection({
  rule,
  view,
  onView,
  adding,
  onAdding,
  ctx,
  env,
  onPatch,
  bare,
  n = 3,
}: {
  rule: Rule
  view: 'build' | 'check'
  onView: (v: 'build' | 'check') => void
  adding: boolean
  onAdding: (v: boolean) => void
  ctx: SimContext
  env: SimEnv
  onPatch: (p: Partial<Rule>) => void
  bare?: boolean
  n?: number
}) {
  const store = useBrand()
  const mode = matchMode(rule)
  /* Attribute-sync hooks are not choosable here: they do not answer a question
     at sign-in, they populate user attributes that ordinary conditions then
     read. Offering one would produce a condition that can never resolve. */
  const syncHooks = store.hooks.filter((h) => h.mode === 'sync')

  const setConditions = (conditions: Condition[]) => onPatch({ conditions })
  const patchCondition = (i: number, p: Partial<Condition>) =>
    setConditions(rule.conditions.map((c, n) => (n === i ? { ...c, ...p } : c)))

  const add = (typeId: string, preset?: string) => {
    const t = conditionType(typeId)
    const values = preset ? [preset] : seedValues(t, store.zones[0]?.id, store.fingerprints[0]?.id, syncHooks[0]?.id)
    setConditions([...rule.conditions, cond(typeId, t.operators[0], values, mode === 'any' ? 'OR' : 'AND')])
    onAdding(false)
  }

  const setMode = (m: 'all' | 'any') =>
    setConditions(rule.conditions.map((c, i) => (i === 0 ? c : { ...c, joiner: m === 'any' ? 'OR' : 'AND' })))

  const verdict = evalRule(rule, ctx, env)

  const views = (
    <div className="bf__ifviews" role="tablist" aria-label="Condition view">
      <button role="tab" type="button" aria-selected={view === 'build'} className={view === 'build' ? 'is-on' : ''} onClick={() => onView('build')}>
        Build
      </button>
      <button role="tab" type="button" aria-selected={view === 'check'} className={view === 'check' ? 'is-on' : ''} onClick={() => onView('check')}>
        Checklist
      </button>
    </div>
  )

  return (
    <Section
      id="if"
      n={n}
      bare={bare}
      title="When it applies"
      hint="Leave this empty and the rule catches every sign-in that reaches it — valid, and it stops anything below it from ever running."
      aside={views}
    >
      <>
        {rule.conditions.length > 1 && (
          <div className="bf__match">
            <span className="u-label">Match</span>
            <div className="bf__matchseg">
              <button type="button" className={mode === 'all' ? 'is-on' : ''} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
                All of these
              </button>
              <button type="button" className={mode === 'any' ? 'is-on' : ''} aria-pressed={mode === 'any'} onClick={() => setMode('any')}>
                Any of these
              </button>
              {mode === 'custom' && <span className="bf__matchcustom">Custom</span>}
            </div>
            {mode === 'custom' && (
              <p className="bf__matchnote">
                <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                Mixed joiners have no grouping in this model — they are read strictly left to right. Pick one, or
                split the rule in two.
              </p>
            )}
          </div>
        )}

        {rule.conditions.length === 0 ? (
          <p className="bf__empty">
            No conditions. This rule matches everyone in its audience, every time.
          </p>
        ) : view === 'build' ? (
          <ul className="bf__conds">
            {rule.conditions.map((c, i) => (
              <ConditionRow
                key={c.id}
                c={c}
                i={i}
                onJoiner={() => patchCondition(i, { joiner: c.joiner === 'AND' ? 'OR' : 'AND' })}
                onOperator={(operator) => patchCondition(i, { operator })}
                onValues={(values) => patchCondition(i, { values })}
                onRemove={() => setConditions(rule.conditions.filter((_, n) => n !== i))}
              />
            ))}
          </ul>
        ) : (
          <Checklist rule={rule} ctx={ctx} env={env} />
        )}

        <div className="bf__addwrap">
          <button type="button" className="bf__add" onClick={() => onAdding(!adding)}>
            {adding ? <X size={13} strokeWidth={2.4} /> : <Plus size={13} strokeWidth={2.4} />}
            {adding ? 'Cancel' : 'Add a condition'}
          </button>

          <AnimatePresence>
            {adding && <FieldPicker onPick={add} onClose={() => onAdding(false)} />}
          </AnimatePresence>
        </div>

        {view === 'check' && (
          <p className={`bf__verdict ${verdict.match ? 'is-hit' : 'is-miss'}`}>
            {verdict.match ? <Check size={13} strokeWidth={3} aria-hidden /> : <X size={13} strokeWidth={2.6} aria-hidden />}
            <span>
              <strong>
                {verdict.match ? 'This rule matches' : 'This rule does not match'} {ctx.user.name}
              </strong>
              {verdict.reason}
            </span>
          </p>
        )}
      </>
    </Section>
  )
}

function ConditionRow({
  c,
  i,
  onJoiner,
  onOperator,
  onValues,
  onRemove,
}: {
  c: Condition
  i: number
  onJoiner: () => void
  onOperator: (v: string) => void
  onValues: (v: string[]) => void
  onRemove: () => void
}) {
  const t = conditionType(c.typeId)
  const Ico = GROUP_ICON[t.group] ?? ListFilter
  const blank = c.values.length === 0 || c.values.every((v) => !v.trim())

  return (
    <li className={`bf__cond ${blank ? 'is-blank' : ''}`}>
      {i > 0 && (
        <button
          type="button"
          className={`bf__joiner is-${c.joiner.toLowerCase()}`}
          aria-label={`Joined to the previous condition with ${c.joiner}. Click to change.`}
          onClick={onJoiner}
        >
          {c.joiner}
        </button>
      )}
      {/* The row is tinted by the condition's category, which the catalogue
          already records — so the colour is data rather than decoration, and a
          rule mixing four kinds of signal is legible before a word is read.
          Gorgias and Sprout Social both settle a long condition list this way.
          Never `danger`: red has one meaning in this kit. */}
      <div className={`bf__condrow is-${GROUP_TONE[t.group] ?? 'neutral'}`}>
        <span className="bf__condfield" title={t.hint}>
          <span className="bf__condicon" aria-hidden>
            <Ico size={13} strokeWidth={1.9} />
          </span>
          {t.label}
        </span>
        <select className="bf__op" aria-label={`${t.label} operator`} value={c.operator} onChange={(e) => onOperator(e.target.value)}>
          {t.operators.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <ValueControl type={t} values={c.values} onChange={onValues} />
        <button type="button" className="bf__condx" aria-label={`Remove ${t.label}`} onClick={onRemove}>
          <X size={13} strokeWidth={2} />
        </button>
      </div>
      {blank && <p className="bf__condwarn">No value set — as written, this condition can never match.</p>}
    </li>
  )
}

/* The value control follows the condition's own valueKind. `list` kinds render
   every option as a toggle chip rather than a single-select: `values` has
   always been an array on the model and "Country is India, United Kingdom or
   Germany" has always been expressible — no builder before this one let you
   say it. */
function ValueControl({
  type,
  values,
  onChange,
}: {
  type: ConditionType
  values: string[]
  onChange: (v: string[]) => void
}) {
  const store = useBrand()
  const v = values[0] ?? ''

  if (type.valueKind === 'zone' || type.valueKind === 'fingerprint' || type.valueKind === 'hook') {
    const items =
      type.valueKind === 'zone'
        ? store.zones.map((z) => ({ id: z.id, name: z.name, meta: z.usedIn ? `${z.usedIn} uses` : '' }))
        : type.valueKind === 'fingerprint'
          ? store.fingerprints.map((p) => ({ id: p.id, name: p.name, meta: modeLabel(p) }))
          : store.hooks
              .filter((h) => h.mode === 'sync')
              .map((h) => ({ id: h.id, name: h.name, meta: `${h.timeoutMs}ms` }))
    return (
      <span className="bf__val bf__val--select">
        <select
          aria-label={type.label}
          value={v}
          onChange={(e) => onChange([e.target.value])}
        >
          <option value="">Choose…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
              {it.meta ? ` · ${it.meta}` : ''}
            </option>
          ))}
        </select>
      </span>
    )
  }

  if (type.options?.length) {
    return (
      <span className="bf__val bf__val--chips" role="group" aria-label={type.label}>
        {type.options.map((o) => {
          const on = values.includes(o)
          return (
            <button
              key={o}
              type="button"
              className={`bf__vchip ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((x) => x !== o) : [...values.filter(Boolean), o])}
            >
              {o}
            </button>
          )
        })}
      </span>
    )
  }

  if (type.valueKind === 'time') {
    return (
      <span className="bf__val bf__val--time">
        <input type="time" aria-label="From" value={values[0] ?? '09:00'} onChange={(e) => onChange([e.target.value, values[1] ?? '17:00'])} />
        <em>to</em>
        <input type="time" aria-label="To" value={values[1] ?? '17:00'} onChange={(e) => onChange([values[0] ?? '09:00', e.target.value])} />
      </span>
    )
  }

  if (type.valueKind === 'range') {
    return (
      <span className="bf__val bf__val--range">
        <input
          type="number"
          aria-label={type.label}
          value={v}
          placeholder="0"
          onChange={(e) => onChange([e.target.value])}
        />
        <em>{type.id === 'trust-age' ? 'days' : type.id === 'coords' ? 'km' : 'score'}</em>
      </span>
    )
  }

  return (
    <span className="bf__val">
      <input aria-label={type.label} placeholder="Enter a value…" value={v} onChange={(e) => onChange([e.target.value])} />
    </span>
  )
}

/* The "to-do" reading of the IF. Same conditions, same order, same joiners —
   but each one carries its answer for the person in the rail, so the rule stops
   being a specification you have to run in your head. */
function Checklist({ rule, ctx, env }: { rule: Rule; ctx: SimContext; env: SimEnv }) {
  const mode = matchMode(rule)
  return (
    <div className="bf__checklist">
      <p className="bf__cl_head">
        {mode === 'any' ? 'Any one of these must be true' : mode === 'all' ? 'All of these must be true' : 'Read strictly left to right'}
        <span>for {ctx.user.name}</span>
      </p>
      <ul>
        {rule.conditions.map((c, i) => {
          const t = conditionType(c.typeId)
          const r = evalCond(c, ctx)
          const shown =
            t.valueKind === 'zone'
              ? c.values.map(env.zoneName).join(', ')
              : t.valueKind === 'fingerprint'
                ? c.values.map(env.fingerprintName).join(', ')
                : t.valueKind === 'time'
                  ? c.values.filter(Boolean).join('–')
                  : c.values.filter(Boolean).join(', ')
          return (
            <li key={c.id} className={`is-${r.state}`}>
              <span className="bf__clbox" aria-hidden>
                {r.state === 'pass' ? (
                  <Check size={12} strokeWidth={3} />
                ) : r.state === 'fail' ? (
                  <X size={12} strokeWidth={2.6} />
                ) : (
                  <Minus size={12} strokeWidth={2.6} />
                )}
              </span>
              <span className="bf__cltext">
                <strong>
                  {i > 0 && <b className={`bf__cljoin is-${c.joiner.toLowerCase()}`}>{c.joiner}</b>}
                  {t.label} {c.operator} {shown || '…'}
                </strong>
                <em>{r.detail}</em>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FieldPicker({ onPick, onClose }: { onPick: (typeId: string, preset?: string) => void; onClose: () => void }) {
  const store = useBrand()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const m = new Map<string, ConditionType[]>()
    for (const c of CONDITION_CATALOGUE) {
      if (METHOD_GROUPS.has(c.group)) continue
      if (q && !c.label.toLowerCase().includes(q.toLowerCase()) && !c.group.toLowerCase().includes(q.toLowerCase())) continue
      if (!m.has(c.group)) m.set(c.group, [])
      m.get(c.group)!.push(c)
    }
    return [...m.entries()]
  }, [q])

  const hit = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase())
  const zones = store.zones.filter((z) => hit(z.name) || hit('zone'))
  const postures = store.fingerprints.filter((p) => hit(p.name) || hit('device'))

  return (
    <motion.div
      className="bf__picker"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
    >
      <div className="bf__pickbar">
        <Search size={14} strokeWidth={2} aria-hidden />
        <input autoFocus aria-label="Search conditions" placeholder="Search conditions and library objects…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="bf__pickbody">
        {(zones.length > 0 || postures.length > 0) && (
          <div className="bf__pickgroup">
            <h4>From your library</h4>
            {zones.map((z) => (
              <button key={z.id} type="button" onClick={() => onPick('zone', z.id)}>
                <Globe size={14} strokeWidth={1.8} aria-hidden />
                <span>
                  <strong>{z.name}</strong>
                  <em>Network zone{z.usedIn ? ` · used by ${z.usedIn} polic${z.usedIn === 1 ? 'y' : 'ies'}` : ''}</em>
                </span>
              </button>
            ))}
            {postures.map((p) => (
              <button key={p.id} type="button" onClick={() => onPick('fingerprint', p.id)}>
                <MonitorSmartphone size={14} strokeWidth={1.8} aria-hidden />
                <span>
                  <strong>{p.name}</strong>
                  <em>Device fingerprint · {modeLabel(p)}</em>
                </span>
              </button>
            ))}
          </div>
        )}

        {groups.map(([g, list]) => {
          const Ico = GROUP_ICON[g] ?? ListFilter
          return (
            <div className="bf__pickgroup" key={g}>
              <h4>{g}</h4>
              {list.map((c) => (
                <button key={c.id} type="button" onClick={() => onPick(c.id)}>
                  <Ico size={14} strokeWidth={1.8} aria-hidden />
                  <span>
                    <strong>{c.label}</strong>
                    <em>{c.hint}</em>
                  </span>
                </button>
              ))}
            </div>
          )
        })}
        {groups.length === 0 && zones.length === 0 && postures.length === 0 && (
          <p className="bf__pickempty">Nothing matches “{q}”.</p>
        )}
      </div>
    </motion.div>
  )
}

/* --- THEN: the outcome, and everything behind it -------------------------------- */

export function ThenSection({
  rule,
  onPatch,
  bare,
  n = 4,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  bare?: boolean
  n?: number
}) {
  const chain = rule.methodChain ?? ['TOTP Authenticator']

  return (
    <Section
      id="then"
      n={n}
      bare={bare}
      title="What happens"
      hint="The decision, and the authentication it asks for. Evaluation stops here — nothing below this rule runs for anyone it matched."
    >
      <>
        <div className="bf__outs">
          {OUTCOMES.map((o) => {
            const Ico = o.icon
            return (
              <button
                key={o.id}
                type="button"
                className={`bf__out is-${DEC_KEY[o.id]} ${rule.decision === o.id ? 'is-on' : ''}`}
                aria-pressed={rule.decision === o.id}
                onClick={() => onPatch({ decision: o.id })}
              >
                <Ico size={17} strokeWidth={1.9} aria-hidden />
                <strong>{o.label}</strong>
                <em>{o.sub}</em>
              </button>
            )
          })}
        </div>

        <AnimatePresence initial={false}>
          {rule.decision === 'deny' ? (
            <motion.p key="deny" className="bf__denynote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Blocked users see an access-denied page. No prompt, no alternate path. The ML engine may escalate other
              decisions on behavioural signals, but a Deny here is final.
            </motion.p>
          ) : (
            <motion.div
              key="factors"
              className="bf__factors"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <Prop label="First factor">
                <div className="bf__seg">
                  {(['Password', 'Any', 'Specific'] as const).map((f) => (
                    <button key={f} type="button" className={rule.firstFactor === f ? 'is-on' : ''} aria-pressed={rule.firstFactor === f} onClick={() => onPatch({ firstFactor: f })}>
                      {f}
                    </button>
                  ))}
                </div>
              </Prop>

              {rule.firstFactor === 'Specific' && (
                <Prop label="Method" sub>
                  <select aria-label="First-factor method" value={rule.firstFactorMethod ?? METHODS[0]} onChange={(e) => onPatch({ firstFactorMethod: e.target.value })}>
                    {METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Prop>
              )}

              {rule.decision === '2fa' && (
                <Prop label="Second factor">
                  <select aria-label="Second factor" value={rule.secondFactor} onChange={(e) => onPatch({ secondFactor: e.target.value as Rule['secondFactor'] })}>
                    <option value="any">Any enabled method</option>
                    <option value="specific">Specific method(s)</option>
                    <option value="chain">Method chain</option>
                    <option value="preferred">The user’s preferred method</option>
                  </select>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'specific' && (
                <Prop label="Allowed" sub>
                  <div className="bf__val bf__val--chips" role="group" aria-label="Allowed second-factor methods">
                    {METHODS.map((m) => {
                      const on = (rule.secondFactorMethods ?? []).includes(m)
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`bf__vchip ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => {
                            const cur = rule.secondFactorMethods ?? []
                            onPatch({ secondFactorMethods: on ? cur.filter((x) => x !== m) : [...cur, m] })
                          }}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'specific' && (rule.secondFactorMethods ?? []).length === 0 && (
                <p className="bf__factorwarn">
                  <XCircle size={13} strokeWidth={2} aria-hidden />
                  Nothing is selected, so there is no method any user could complete. This rule cannot be satisfied.
                </p>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'chain' && (
                <Prop label="In order" sub>
                  <div className="bf__chain">
                    {chain.map((step, si) => (
                      <span className="bf__chainstep" key={si}>
                        <b>{si + 1}</b>
                        <select
                          aria-label={`Chain step ${si + 1}`}
                          value={step}
                          onChange={(e) => {
                            const next = [...chain]
                            next[si] = e.target.value
                            onPatch({ methodChain: next })
                          }}
                        >
                          {['Password', ...METHODS].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={chain.length === 1}
                          aria-label={`Remove step ${si + 1}`}
                          onClick={() => onPatch({ methodChain: chain.filter((_, n) => n !== si) })}
                        >
                          <X size={12} strokeWidth={2.2} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className="bf__chainadd" onClick={() => onPatch({ methodChain: [...chain, 'miniOrange Push'] })}>
                      <Plus size={12} strokeWidth={2.4} /> Add step
                    </button>
                    <p className="bf__chainsum">{chain.join(' → ')} — every step required, in this order.</p>
                  </div>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'preferred' && (
                <Prop label="Fallback" sub>
                  <select aria-label="Fallback method" value={rule.preferredFallback ?? METHODS[0]} onChange={(e) => onPatch({ preferredFallback: e.target.value })}>
                    {METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Prop>
              )}

              <Prop label="Remember device">
                <label className="bf__switchrow">
                  <Toggle checked={rule.rememberMfa} onChange={(v) => onPatch({ rememberMfa: v })} label="Remember this device" size="sm" />
                  <span>Skip the second factor on a device that already passed</span>
                </label>
              </Prop>

              {rule.rememberMfa && (
                <>
                  <Prop label="For" sub>
                    <span className="bf__val bf__val--range">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        aria-label="Days to remember"
                        value={rule.rememberDays ?? 30}
                        onChange={(e) => onPatch({ rememberDays: Number(e.target.value) || 30 })}
                      />
                      <em>days</em>
                    </span>
                  </Prop>
                  <Prop label="Override" sub>
                    <label className="bf__switchrow">
                      <Toggle
                        checked={rule.forceMfaEachLogin ?? false}
                        onChange={(v) => onPatch({ forceMfaEachLogin: v })}
                        label="Force MFA on every login"
                        size="sm"
                      />
                      <span>Prompt every time anyway, remembered device or not</span>
                    </label>
                  </Prop>
                </>
              )}

              <Prop label="End users">
                <label className="bf__switchrow">
                  <Toggle checked={rule.allowDisable2fa} onChange={(v) => onPatch({ allowDisable2fa: v })} label="Allow users to disable 2FA" size="sm" />
                  <span>Let users switch their own second factor off</span>
                </label>
              </Prop>

              {rule.allowDisable2fa && rule.decision === '2fa' && (
                <p className="bf__factorwarn is-warn">
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  This rule requires a second factor and also lets users turn theirs off. Anyone who does is no longer
                  covered by it.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    </Section>
  )
}

/** A Figma-style property row: label at a fixed measure, control beside it. */
function Prop({ label, sub, children }: { label: string; sub?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bf__prop ${sub ? 'is-sub' : ''}`}>
      <span className="bf__proplabel">{label}</span>
      <div className="bf__propctl">{children}</div>
    </div>
  )
}

/* --- Checks & impact ------------------------------------------------------------ */

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: Info }

export function ChecksSection({
  policy,
  index,
  env,
  diagnostics,
  onJump,
  bare,
  n = 5,
}: {
  policy: Policy
  index: number
  env: SimEnv
  diagnostics: Diagnostic[]
  onJump: (i: number) => void
  bare?: boolean
  n?: number
}) {
  const store = useBrand()
  const impact = impactOf(policy, index, store.groups)

  /* The reach number is swept, not estimated.

     `impactOf().matches` reads `matchEstimate`, which is seed data that never
     recomputes — honest enough beside a rule you are reading, and not honest
     enough beside a rule you are about to publish. The sweep answers the same
     question exactly over a space it can state: how many of the 1,440 modelled
     situations does THIS rule actually win, first-match and all.

     The two numbers in this row are deliberately in different units and say so.
     The audience is people and is exact. The reach is situations and is exact
     over the model. Presenting situations as people would be the same fake
     precision in a new costume. */
  const swept = useMemo(() => sweep(policy, env, 570), [policy, env])
  const reach = swept.reach[index] ?? 0
  const share = Math.round((reach / swept.total) * 100)
  const rule = policy.rules[index]
  const resolve = (kind: 'zone' | 'fingerprint' | 'hook', id: string) =>
    kind === 'zone'
      ? store.zoneById(id)?.name
      : kind === 'hook'
        ? store.hookById(id)?.name
        : store.fingerprintById(id)?.name
  const { iff, then } = ruleSentence(rule, store.groups, resolve)

  return (
    <Section id="checks" n={n} bare={bare} title="Checks &amp; impact">
      <>
        <div className="bf__prose">
          <p>
            <span>IF</span> {iff}
          </p>
          <p>
            <span>THEN</span> {then}
          </p>
        </div>

        <div className="bf__impact">
          <div>
            <strong>
              <Counter value={impact.audience} />
            </strong>
            <em>
              people in the audience <b className="bf__basis is-exact">exact</b>
            </em>
          </div>
          <div className={reach === 0 && policy.rules[index].enabled ? 'is-empty' : ''}>
            <strong>
              <Counter value={reach} />
            </strong>
            <em>
              {reach === 0 && policy.rules[index].enabled ? (
                <>
                  modelled situations reach it — nothing gets this far{' '}
                  <b className="bf__basis is-stale">check this</b>
                </>
              ) : (
                <>
                  of {SITUATIONS.length.toLocaleString()} modelled situations, {share}%{' '}
                  <b className="bf__basis is-exact">exact</b>
                </>
              )}
            </em>
          </div>
          <div>
            {impact.fallsTo ? (
              <>
                <strong className="bf__falls">
                  <button type="button" onClick={() => onJump(impact.fallsTo!.index)}>
                    Rule {impact.fallsTo.index + 1} · {impact.fallsTo.name}
                  </button>
                </strong>
                <em>takes over if this rule stops matching</em>
              </>
            ) : (
              <>
                <strong>Default rule</strong>
                <em>takes over if this rule stops matching</em>
              </>
            )}
          </div>
        </div>

        {diagnostics.length === 0 ? (
          <p className="bf__clean">
            <Check size={13} strokeWidth={3} aria-hidden />
            Nothing the linter can prove wrong about this rule.
          </p>
        ) : (
          <ul className="bf__diags">
            {diagnostics.map((d) => {
              const Ico = SEVERITY_ICON[d.severity]
              return (
                <li key={d.id} className={`is-${d.severity}`}>
                  <Ico size={14} strokeWidth={2} aria-hidden />
                  <span>
                    <strong>{d.title}</strong>
                    {d.detail}
                    {d.relatedIndex !== undefined && (
                      <button type="button" className="bf__diaggo" onClick={() => onJump(d.relatedIndex!)}>
                        Open rule {d.relatedIndex + 1} →
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </>
    </Section>
  )
}

/* --- The preview rail ------------------------------------------------------------ */

/** Stated wherever the preview is shown, never as a caption under it. */
export const PREVIEW_CAVEAT =
  'Heuristic, not the engine — the context here maps to condition values through a fixed table. The order and the first-match stop are real.'

export function PreviewPanel({
  policy,
  index,
  pv,
  onPv,
  ctx,
  env,
  onJump,
  hideHeading,
}: {
  policy: Policy
  index: number
  pv: { userId: string; place: string; device: string; authState: string; risk: string }
  onPv: (v: typeof pv) => void
  ctx: SimContext
  env: SimEnv
  onJump: (i: number) => void
  /** The card host draws its own title, so the panel does not repeat it. */
  hideHeading?: boolean
}) {
  const trace = useMemo(() => walk(policy, ctx, env), [policy, ctx, env])
  const winner = trace.hitIndex
  const isThisRule = winner === index

  const set = useCallback((k: keyof typeof pv, v: string) => onPv({ ...pv, [k]: v }), [pv, onPv])

  return (
    <div className="bf__preview">
      {!hideHeading && (
        <h3 className="u-label">
          Live preview
          {/* The caveat is the honest part and it is not a caption. It stays one
              gesture away rather than sitting under the panel as prose. */}
          <TipDot label="How this preview is calculated" text={PREVIEW_CAVEAT} />
        </h3>
      )}

      <div className="bf__pvusers">
        {SIM_USERS.map((u) => (
          <button
            key={u.id}
            type="button"
            className={u.id === pv.userId ? 'is-on' : ''}
            aria-pressed={u.id === pv.userId}
            onClick={() => set('userId', u.id)}
            title={`${u.name} · ${u.groupName}`}
          >
            {u.name.split(' ').map((p) => p[0]).join('')}
          </button>
        ))}
      </div>
      <p className="bf__pvwho">
        <strong>{ctx.user.name}</strong>
        <em>
          {ctx.user.groupName} · {ctx.user.userType}
        </em>
      </p>

      <PvAxis label="From" value={pv.place} options={PLACES} onChange={(v) => set('place', v)} />
      <PvAxis label="Device" value={pv.device} options={DEVICE_OPTIONS} onChange={(v) => set('device', v)} />
      <PvAxis label="State" value={pv.authState} options={AUTH_STATES} onChange={(v) => set('authState', v)} />
      <PvAxis label="Risk" value={pv.risk} options={RISKS} onChange={(v) => set('risk', v)} />

      <div className={`bf__pvverdict is-${DEC_KEY[trace.decision]}`}>
        <DecisionChip decision={trace.decision} size="sm" />
        <p>
          {winner === null ? (
            <>No rule matches — the engine default lets this sign-in through.</>
          ) : isThisRule ? (
            <>
              <strong>This rule decides it.</strong> Evaluation stops here.
            </>
          ) : (
            <>
              <button type="button" onClick={() => onJump(winner)}>
                Rule {winner + 1} · {policy.rules[winner].name}
              </button>{' '}
              matches first, so this rule is never reached for {ctx.user.name.split(' ')[0]}.
            </>
          )}
        </p>
      </div>

      <ol className="bf__pvtrace">
        {trace.steps.map((s) => (
          <li key={s.rule.id} className={`is-${s.kind} ${s.index === index ? 'is-current' : ''}`}>
            <span aria-hidden>
              {s.kind === 'hit' ? <Check size={10} strokeWidth={3} /> : s.kind === 'miss' ? <X size={10} strokeWidth={2.6} /> : <Circle size={7} strokeWidth={3} />}
            </span>
            <button type="button" onClick={() => onJump(s.index)}>
              {s.index + 1} · {s.rule.name}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PvAxis({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="bf__pvaxis">
      <span>{label}</span>
      <span className="bf__pvselect">
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <ChevronDown size={12} strokeWidth={2.2} aria-hidden />
      </span>
    </label>
  )
}
