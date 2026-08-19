import { AlertTriangle, Info, XCircle } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'

import {
  conditionType,
  enforces,
  zones as seedZones,
  type Group,
  type Policy,
  type PolicyType,
  type Rule,
} from '../data'
import { seedProfiles } from '../fingerprint'
import { seedHooks } from '../hooks'
import { Badge, Button, Counter, DecisionChip, Field, Modal, StatusPill, Tabs } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import { diagnose, type Diagnostic } from './diagnostics'

import './builder-dialogs.css'

/* -----------------------------------------------------------------------------
   The three builder dialogs V0 reaches from its toolbar — Assign apps, Review &
   Save, Save as template.

   Each takes the policy as a prop and reports back through a callback. Nothing
   here owns policy state: a dialog that kept its own copy would drift the moment
   the builder edited the same policy behind it, and the assign dialog in
   particular is open while its count is read by the toolbar underneath.

   The store is still read for reference data — the app catalogue, the group
   directory, live zone and fingerprint names — because that data is the tenant's,
   not the dialog's.
   -------------------------------------------------------------------------- */

/* --- Prose ----------------------------------------------------------------- */

export interface RuleProse {
  /** Everything after "IF:" — audience, then the conditions with their joiners. */
  iff: string
  /** Everything after "THEN: →" — what the decision does, in one sentence. */
  then: string
}

/* Zone and fingerprint conditions store an id, and the object it points at can be
   renamed after the rule was written. The resolver is how a caller hands in the
   live directory; without one the seed is used, which is right for tests and
   for any caller that has no store. */
type NameLookup = (kind: 'zone' | 'fingerprint' | 'hook', id: string) => string | undefined


function seedName(kind: 'zone' | 'fingerprint' | 'hook', id: string) {
  if (kind === 'zone') return seedZones.find((z) => z.id === id)?.name
  if (kind === 'hook') return seedHooks.find((h) => h.id === id)?.name
  return seedProfiles.find((p) => p.id === id)?.name
}

/* One condition as English.

   The type label is dropped for zone and fingerprint because the object's own name
   already says which field it is — "Not recognised by Corporate managed" reads
   as a sentence where "Device Fingerprint not recognised by Corporate managed"
   reads as a form field. Every other kind keeps its label, because
   "is not India" alone does not say what is not India. */
function conditionSentence(
  c: { typeId: string; operator: string; values: string[] },
  resolve?: NameLookup,
): string {
  const t = conditionType(c.typeId)
  const raw = c.values.filter((v) => v.trim() !== '')

  let value: string
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook') {
    const kind = t.valueKind
    value = raw.map((v) => resolve?.(kind, v) ?? seedName(kind, v) ?? v).join(', ')
  } else if (t.valueKind === 'time' || t.valueKind === 'range') {
    value = raw.join('–')
  } else {
    value = raw.join(', ')
  }

  // Said out loud rather than left blank: diagnose() calls this an error, and
  // the prose has to agree with the panel next to it.
  if (!value) value = '(no value set)'

  /* The type label is dropped wherever the object's own name already says which
     field this is. "Fraud score lookup returns true" reads as a sentence;
     "External hook Fraud score lookup returns true" reads as a form field with
     its label left on. */
  const body =
    t.valueKind === 'zone' || t.valueKind === 'fingerprint'
      ? `${c.operator} ${value}`
      : t.valueKind === 'hook'
        ? `${value} ${c.operator}`
        : `${t.label} ${c.operator} ${value}`

  /* Not capitalised: this is only ever embedded mid-sentence, after "users in
     X AND ". For zone/fingerprint the label is dropped so `body` starts with the
     operator, and capitalising gave "... AND Not recognised by Corporate
     Managed". Those two valueKinds were the only cases where it fired at all —
     everywhere else the label already carried a capital. */
  return body
}

function decisionSentence(rule: Rule): string {
  if (rule.decision === 'deny') return 'Access is blocked. No alternative path.'

  if (rule.decision === '2fa') {
    if (rule.secondFactor === 'specific') {
      const named = rule.secondFactorMethods ?? []
      return named.length > 0
        ? `The user completes a second factor — ${named.join(' or ')} — before access is granted.`
        : 'The user completes a second factor before access is granted, but no method is chosen yet.'
    }
    if (rule.secondFactor === 'chain') {
      const steps = rule.methodChain ?? []
      return steps.length > 0
        ? `The user completes every step in order — ${steps.join(' → ')} — before access is granted.`
        : 'The user completes an ordered chain of factors before access is granted.'
    }
    if (rule.secondFactor === 'preferred') {
      return 'The user completes their preferred second factor before access is granted.'
    }
    return 'The user completes any enabled second factor before access is granted.'
  }

  if (rule.firstFactor === 'Any') {
    return 'Access is granted after any single enabled factor. Nothing further is asked.'
  }
  if (rule.firstFactor === 'Specific') {
    return `Access is granted after ${rule.firstFactorMethod ?? 'the chosen factor'} alone. Nothing further is asked.`
  }
  return 'Access is granted after the password alone. No second factor is requested.'
}

/**
 * The rule as the two lines V0 prints under its name. Generated from the same
 * condition array the editor writes, joiner included — the current prototype
 * rewrites OR as AND in its review copy, and one source makes that class of bug
 * impossible.
 */
export function ruleSentence(rule: Rule, groups: Group[], resolve?: NameLookup): RuleProse {
  const who = rule.appliesTo.map((id) => groups.find((g) => g.id === id)?.name ?? id).join(', ')

  const iff =
    rule.conditions.length === 0
      ? `users in ${who} — any sign-in that reaches this rule`
      : `users in ${who} AND ${rule.conditions
          .map((c, i) =>
            i === 0 ? conditionSentence(c, resolve) : `${c.joiner} ${conditionSentence(c, resolve)}`,
          )
          .join(' ')}`

  return { iff, then: decisionSentence(rule) }
}

/* --- Assign apps ------------------------------------------------------------ */

type TypeFilter = 'All' | PolicyType
const TYPE_FILTERS: TypeFilter[] = ['All', 'App Access', 'Session', 'Account Management']

export function AssignAppsDialog({
  open,
  policy,
  onClose,
  onChange,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  onChange: (appIds: string[], allApps: boolean) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<TypeFilter>('All')

  // A filter left over from the last time this was open is a filter the user
  // cannot see the cause of.
  useEffect(() => {
    if (open) setFilter('All')
  }, [open])

  const allApps = policy.allApps ?? false
  const selected = policy.appIds

  /* An App carries no type of its own — type belongs to the policy. So the tabs
     filter by the only type information that exists: which kinds of policy
     already govern each app. "Session" answers "which apps does a session
     policy touch today", which is the question the tab is worth asking. */
  const typesByApp = useMemo(() => {
    const m = new Map<string, Set<PolicyType>>()
    for (const p of store.policies) {
      for (const id of p.appIds) {
        const set = m.get(id) ?? new Set<PolicyType>()
        set.add(p.type)
        m.set(id, set)
      }
    }
    return m
  }, [store.policies])

  /* Attaching an app that another live policy already governs is how two
     policies end up fighting over one sign-in. The current prototype attaches
     silently; this says so on the row. */
  const conflictsByApp = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of store.policies) {
      // Only enforcing policies can fight over a sign-in. A monitor policy
      // sharing an app is not a conflict — it is how you trial one safely.
      if (p.id === policy.id || !enforces(p)) continue
      for (const id of p.appIds) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [store.policies, policy.id])

  const countFor = (f: TypeFilter) =>
    f === 'All' ? store.apps.length : store.apps.filter((a) => typesByApp.get(a.id)?.has(f)).length

  const list =
    filter === 'All' ? store.apps : store.apps.filter((a) => typesByApp.get(a.id)?.has(filter))

  const count = allApps ? store.apps.length : selected.length

  const toggleApp = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    // Naming an app explicitly is a statement that the policy covers those apps
    // and not everything, so it turns "all apps" off rather than fighting it.
    onChange(next, false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign apps to ${policy.name}`}
      width={620}
      footer={
        <>
          <span className="bdlg-foot__note">
            {reduce ? count : <Counter value={count} />} selected
            {allApps && <em>every app, including ones added later</em>}
          </span>
          <Button variant="brand" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="bdlg bdlg-apps">
        <div className="bdlg-apps__bar">
          <Tabs
            name="App type"
            value={filter}
            onChange={setFilter}
            options={TYPE_FILTERS.map((f) => ({ value: f, label: f, count: countFor(f) }))}
          />
        </div>

        <label className={`bdlg-row bdlg-row--all ${allApps ? 'is-on' : ''}`}>
          <input
            type="checkbox"
            checked={allApps}
            onChange={() => onChange(selected, !allApps)}
            aria-label="All apps"
          />
          <span className="bdlg-row__text">
            All apps
            <em>Every application in this tenant, and any added later.</em>
          </span>
          <span className="bdlg-row__meta">{store.apps.length}</span>
        </label>

        <motion.div
          key={filter}
          className="bdlg-apps__list"
          initial={{ opacity: 0, y: reduce ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
        >
          {list.length === 0 && (
            <p className="bdlg-empty">No app is governed by a {filter} policy yet.</p>
          )}

          {list.map((a) => {
            const on = selected.includes(a.id)
            const clashes = conflictsByApp.get(a.id) ?? 0
            return (
              <label
                key={a.id}
                className={`bdlg-row ${on ? 'is-on' : ''} ${allApps ? 'is-covered' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleApp(a.id)}
                  aria-label={a.name}
                />
                <AppLogo appId={a.id} name={a.name} size={22} />
                <span className="bdlg-row__text">
                  {a.name}
                  {allApps ? (
                    <em>Covered by All apps</em>
                  ) : (
                    clashes > 0 && (
                      <em className="is-warn">
                        Also governed by {clashes} other live polic{clashes === 1 ? 'y' : 'ies'}
                      </em>
                    )
                  )}
                </span>
                <span className="bdlg-row__meta">{a.protocol}</span>
              </label>
            )
          })}
        </motion.div>
      </div>
    </Modal>
  )
}

/* --- Review & Save ---------------------------------------------------------- */

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: Info }

function DiagnosticRow({ d }: { d: Diagnostic }) {
  const Icon = SEVERITY_ICON[d.severity]
  return (
    <div className={`bdlg-diag bdlg-diag--${d.severity}`}>
      <Icon size={14} aria-hidden />
      <span>
        <strong>{d.title}</strong>
        {d.detail}
      </span>
    </div>
  )
}

export function ReviewDialog({
  open,
  policy,
  onClose,
  onConfirm,
  onAssignApps,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  onConfirm: () => void
  /* Optional: the assign control lives on the builder toolbar behind this
     modal, so without a handler the warning's link falls back to closing —
     which is the honest thing a "go and do that" link can do from here. */
  onAssignApps?: () => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  const resolve: NameLookup = (kind, id) =>
    kind === 'zone'
      ? store.zoneById(id)?.name
      : kind === 'hook'
        ? store.hookById(id)?.name
        : store.fingerprintById(id)?.name

  const diagnostics = diagnose(policy, store.groups, store.hooks)
  /* Only errors on rules that actually run can block the save. diagnose()
     leaves `blank`, `nomethods` and `unreachable` unguarded by rule.enabled
     (unlike the duplicate/subsumed checks), so without this filter a rule you
     have deliberately switched off holds the policy hostage — and the offending
     row renders at 0.6 opacity because it is off, which makes the block look
     like a bug rather than a rule. */
  const errors = diagnostics.filter(
    (d) => d.severity === 'error' && policy.rules[d.ruleIndex]?.enabled !== false,
  )
  const unassigned = policy.appIds.length === 0 && !policy.allApps

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review your policy"
      width={680}
      footer={
        <>
          {errors.length > 0 && (
            <span className="bdlg-foot__note is-blocked">
              {errors.length} error{errors.length === 1 ? '' : 's'} to fix before this can be saved
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={onConfirm} disabled={errors.length > 0}>
            Confirm &amp; Save
          </Button>
        </>
      }
    >
      <div className="bdlg bdlg-rev">
        <header className="bdlg-rev__head">
          <h3>{policy.name}</h3>
          <Badge tone="neutral">{policy.type}</Badge>
          <StatusPill status={policy.status} />
        </header>

        <AnimatePresence initial={false}>
          {unassigned && (
            <motion.div
              className="bdlg-warn"
              initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
            >
              <AlertTriangle size={15} aria-hidden />
              <span>
                No apps assigned.{' '}
                <button type="button" className="bdlg-warn__go" onClick={onAssignApps ?? onClose}>
                  Assign apps →
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <ol className="bdlg-rev__rules">
          {policy.rules.map((rule, i) => {
            const { iff, then } = ruleSentence(rule, store.groups, resolve)
            const mine = diagnostics.filter((d) => d.ruleIndex === i)
            return (
              <motion.li
                key={rule.id}
                className={rule.enabled ? '' : 'is-off'}
                initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.18,
                  delay: reduce ? 0 : Math.min(i * 0.03, 0.18),
                  ease: [0.2, 0, 0, 1],
                }}
              >
                <p className="bdlg-rev__line">
                  <span className="bdlg-rev__n">{i + 1}</span>
                  <strong>{rule.name}</strong>
                  <span className="bdlg-rev__arrow" aria-hidden>
                    →
                  </span>
                  <DecisionChip decision={rule.decision} size="sm" />
                </p>
                {rule.description && <p className="bdlg-rev__why">{rule.description}</p>}
                <p className="bdlg-rev__prose">
                  <span className="bdlg-rev__key">IF:</span> {iff}
                </p>
                <p className="bdlg-rev__prose">
                  <span className="bdlg-rev__key">THEN:</span>{' '}
                  <span className="bdlg-rev__arrow" aria-hidden>
                    →
                  </span>{' '}
                  {then}
                </p>
                {mine.map((d) => (
                  <DiagnosticRow key={d.id} d={d} />
                ))}
              </motion.li>
            )
          })}

          {/* Pinned, unremovable, and drawn because first-match-wins is only
              legible if the last match is on screen too. */}
          <li className="is-default">
            <p className="bdlg-rev__line">
              <span className="bdlg-rev__n">—</span>
              <strong>Default Rule — Everyone</strong>
              <span className="bdlg-rev__arrow" aria-hidden>
                →
              </span>
              <DecisionChip decision="1fa" size="sm" />
            </p>
            <p className="bdlg-rev__prose">
              <span className="bdlg-rev__key">THEN:</span>{' '}
              <span className="bdlg-rev__arrow" aria-hidden>
                →
              </span>{' '}
              Anyone who reaches this point signs in with one factor.
            </p>
          </li>
        </ol>
      </div>
    </Modal>
  )
}

/* --- Save as template ------------------------------------------------------- */

const CATEGORIES = [
  'Quick Protection',
  'Device-based',
  'Risk-based',
  'Compliance',
  'Uncategorized',
] as const

export function SaveTemplateDialog({
  open,
  policy,
  onClose,
  onSave,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  onSave: (t: { name: string; description: string; category: string }) => void
}) {
  const uid = useId()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  /* Defaults to Uncategorized rather than the first option. A template filed
     under the wrong category by default is worse than one filed nowhere — the
     catalogue is browsed by category, so a wrong one hides it from the people
     it was written for. */
  const [category, setCategory] = useState<string>('Uncategorized')

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setCategory('Uncategorized')
  }, [open])

  const ready = name.trim().length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as template"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!ready}
            onClick={() => onSave({ name: name.trim(), description: description.trim(), category })}
          >
            Save template
          </Button>
        </>
      }
    >
      <div className="bdlg bdlg-tpl">
        <Field label="Template name" htmlFor={`${uid}-name`}>
          <input
            id={`${uid}-name`}
            className="bdlg-input"
            type="text"
            value={name}
            placeholder={`e.g. ${policy.name}`}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Description (optional)"
          htmlFor={`${uid}-desc`}
          hint="What this template is for, and when to reach for it."
        >
          <textarea
            id={`${uid}-desc`}
            className="bdlg-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <fieldset className="bdlg-tpl__cats">
          <legend className="u-label">Category</legend>
          {CATEGORIES.map((c) => (
            <label key={c} className={`bdlg-radio ${category === c ? 'is-on' : ''}`}>
              <input
                type="radio"
                name={`${uid}-category`}
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </fieldset>

        <section className="bdlg-tpl__includes">
          <p className="u-label">This template includes:</p>
          {policy.rules.length === 0 ? (
            <p className="bdlg-empty">
              This policy has no rules yet, so the template would carry nothing but its name.
            </p>
          ) : (
            <ul>
              {policy.rules.map((r, i) => (
                <li key={r.id}>
                  <span className="bdlg-tpl__n">{i + 1}</span>
                  <span className="bdlg-tpl__rule">{r.name}</span>
                  <DecisionChip decision={r.decision} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

/* --- Copy rule to another policy ---------------------------------------------

   Gap 3 in the framework doc, and the last step of the Configurator's own
   stated flow: build a rule, go to the second policy, copy it across, adjust
   one condition. Until now that meant rebuilding it — re-picking the same
   group, the same zone, the same THEN, with three chances to introduce a
   difference nobody meant.

   Three decisions this dialog makes, and why.

   **Same type only.** An App Access rule dropped into a Session policy is a
   category error the target has no way to reject: Session policies govern how
   long a session lasts once access is decided, not whether it is granted. The
   list is filtered rather than showing everything and warning, because a
   disabled row still invites the question "why not".

   **It says where the rule will land, and whether it can fire from there.**
   Appending is the only position that changes nothing already working, but
   under first-match-wins the end of a list is also where a rule goes to die.
   A copy that lands unreachable and reports success is worse than a refusal —
   so the row that would swallow it is named before the copy happens, not after.

   **The rule is copied, not linked.** Said out loud in the footer, because the
   objects immediately around it — zones, method sets — behave the opposite way,
   and an admin who has learned that shared objects propagate will reasonably
   assume this one does too. */
export function CopyRuleDialog({
  open,
  rule,
  from,
  onClose,
}: {
  open: boolean
  rule: Rule | undefined
  from: Policy
  onClose: () => void
}) {
  const store = useBrand()
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (open) setPicked(null)
  }, [open])

  /* Every candidate, with the one thing the admin cannot see from a policy
     name: what happens to this rule once it is at the bottom of that list.

     Computed by building the target as it *would* be and running the real
     linter over it, rather than by re-deriving "is this shadowed" here. Two
     implementations of reachability is two chances for this dialog to promise
     something the builder then contradicts. */
  const targets = useMemo(() => {
    if (!rule) return []
    const probe = { ...rule, id: 'copy-probe' }

    /* What is wrong with the rule *itself*, independent of where it lands.

       Without this subtraction the dialog reported the rule's own mixed-joiner
       note against all five candidate policies, which reads as "copying here
       causes a problem" five times over for a problem that travels with the
       rule and is already visible in the builder behind the dialog. The only
       findings worth a row here are the ones the move creates. */
    const intrinsic = new Set(
      diagnose({ ...from, isSystem: false, rules: [probe] }, store.groups, store.hooks).map((d) => d.title),
    )

    return store.policies
      .filter((p) => p.id !== from.id && p.type === from.type && !p.isSystem)
      .map((p) => {
        const at = p.rules.length
        const would: Policy = { ...p, rules: [...p.rules, probe] }
        const found = diagnose(would, store.groups, store.hooks)
          .filter((d) => d.ruleIndex === at)
          .filter((d) => !intrinsic.has(d.title))
        return {
          policy: p,
          at,
          blocking: found.find((d) => d.severity === 'error'),
          notes: found.filter((d) => d.severity !== 'error'),
        }
      })
  }, [store.policies, store.groups, from, rule])

  const chosen = targets.find((t) => t.policy.id === picked)

  const copy = () => {
    if (!rule || !chosen) return
    store.copyRuleInto(chosen.policy.id, rule)
    store.showToast(
      `“${rule.name}” copied into ${chosen.policy.name} as rule ${chosen.at + 1}${
        chosen.blocking ? ' — where it cannot fire. Reorder it there.' : ''
      }`,
    )
    onClose()
  }

  return (
    <Modal
      open={open && !!rule}
      onClose={onClose}
      title={rule ? `Copy “${rule.name}” to…` : 'Copy rule'}
      width={620}
      footer={
        <>
          <span className="bdlg-foot__note">
            An independent copy. Later edits to either one do not reach the other.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={copy} disabled={!chosen}>
            {chosen ? `Copy into ${chosen.policy.name}` : 'Copy'}
          </Button>
        </>
      }
    >
      <div className="bdlg bdlg-copy">
        {targets.length === 0 ? (
          <p className="bdlg-copy__none">
            There is no other <strong>{from.type}</strong> policy to copy into. A rule can only be copied to a
            policy of the same type — the conditions and the outcome mean different things in the others.
          </p>
        ) : (
          <ul className="bdlg-copy__list">
            {targets.map((t) => (
              <li key={t.policy.id}>
                <label className={picked === t.policy.id ? 'is-on' : ''}>
                  <input
                    type="radio"
                    name="copy-target"
                    checked={picked === t.policy.id}
                    onChange={() => setPicked(t.policy.id)}
                  />
                  <span className="bdlg-copy__main">
                    <span className="bdlg-copy__name">
                      {t.policy.name}
                      <StatusPill status={t.policy.status} />
                    </span>
                    <span className="bdlg-copy__meta">
                      {t.policy.rules.length === 0
                        ? 'No rules yet — the copy becomes rule 1'
                        : `${t.policy.rules.length} rule${t.policy.rules.length === 1 ? '' : 's'} — the copy lands last, as rule ${t.at + 1}`}
                    </span>
                    {t.blocking && (
                      <span className="bdlg-copy__warn">
                        <AlertTriangle size={13} strokeWidth={1.9} aria-hidden />
                        {t.blocking.detail}
                      </span>
                    )}
                    {!t.blocking && t.notes.length > 0 && (
                      <span className="bdlg-copy__note">
                        <Info size={13} strokeWidth={1.9} aria-hidden />
                        {t.notes[0].detail}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
