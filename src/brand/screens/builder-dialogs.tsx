import { AlertTriangle, CopyPlus, Info, ListX, XCircle } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'

import { FALLBACK_NAME, evaluates, fallbackRule, nameTaken, type Policy, type Rule } from '../data'
import { EmptyState } from '../empty'
import { Badge, Button, DecisionChip, Field, Modal, StatusPill, TipDot, TipMark } from '../kit'
import { lastSaved, type CommitIntent } from '../policy-draft'
import { useBrand, useNameLookup } from '../store'
import { narrowToAudience } from './board/apply-template'
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

/* --- Prose -----------------------------------------------------------------

   Was six divergent implementations of "condition, joiner, condition". Now one,
   in predicate-prose.ts, re-exported here so the callers that import it from
   this module keep working. */

export { ruleSentence, type NameLookup, type RuleProse } from './predicate-prose'
import { ruleLabel, ruleSentence } from './predicate-prose'

/* `AssignAppsDialog` is gone.

   It was a filtered, multi-select catalogue with a "select all" row, and a
   policy protects one application — so it was a dialog for making a choice the
   model no longer has. The application is chosen where the name and the
   audience are, on the policy's own details page, which is also the only place
   that ever needed to know how to render the app list. */

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: Info }

/** One linter finding, as the review dialog prints it. Exported for the board's inspector. */
export function DiagnosticRow({ d }: { d: Diagnostic }) {
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
  onCommit,
  from = 'builder',
}: {
  open: boolean
  /** The builder's draft being reviewed. Its status is not read: the saved policy's is. */
  policy: Policy
  onClose: () => void
  /** Both builders store `committed(saved, draft, intent)`. */
  onCommit: (intent: CommitIntent) => void
  /** Which builder Edit details returns to. */
  from?: 'builder' | 'board'
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const reduce = useReducedMotion()
  /* The status comes from the store, not the draft: it can be switched from the
     bar while an edit is open, and the footer below is chosen by it. */
  const saved = store.policyById(policy.id) ?? policy
  const isDraft = saved.status === 'draft'

  const diagnostics = diagnose(policy, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints })
  /* Only errors on rules that actually run can block the save. diagnose()
     leaves `blank`, `nomethods` and `unreachable` unguarded by rule.enabled
     (unlike the duplicate/subsumed checks), so without this filter a rule you
     have deliberately switched off holds the policy hostage — and the offending
     row renders at 0.6 opacity because it is off, which makes the block look
     like a bug rather than a rule. */
  const errors = diagnostics.filter(
    (d) => d.severity === 'error' && policy.rules[d.ruleIndex]?.enabled !== false,
  )
  const noApps = policy.appIds.length === 0 && !policy.isSystem
  const blocked = errors.length > 0
  /* The policy's own last rule, read the way the engine and the board read it.
     This row used to be hard-coded to one factor, so a deny-by-default policy
     was described as the opposite at the moment of saving. */
  const fallback = policy.fallback ?? fallbackRule()

  /* One commit rule (policy-draft.ts `committed`), so the buttons name what it
     will do. Without applications the result is a draft, and an unfinished
     policy is allowed to be one, so errors do not block that case. */
  const commit = isDraft ? (
    noApps ? (
      <Button variant="brand" onClick={() => onCommit('keep-off')}>
        Save draft
      </Button>
    ) : (
      <>
        <Button variant="secondary" onClick={() => onCommit('keep-off')} disabled={blocked}>
          Save, keep off
        </Button>
        <Button variant="brand" onClick={() => onCommit('turn-on')} disabled={blocked}>
          Save and turn on
        </Button>
      </>
    )
  ) : noApps ? (
    <Button variant="brand" onClick={() => onCommit('keep-off')}>
      Save and move to draft
    </Button>
  ) : (
    <Button variant="brand" onClick={() => onCommit('keep-off')} disabled={blocked}>
      Save changes
    </Button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review your policy"
      width={680}
      footer={
        <>
          {/* The count went from here. Every one of those errors is printed
              in full against its own rule in the list above — a number beside
              the button was the same fact, worse, and second. */}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {commit}
        </>
      }
    >
      <div className="bdlg bdlg-rev">
        <header className="bdlg-rev__head">
          <h3>{policy.name}</h3>
          <Badge tone="neutral">{policy.type}</Badge>
          <StatusPill status={saved.status} />
        </header>

        <AnimatePresence initial={false}>
          {noApps && (
            <motion.div
              className="bdlg-warn"
              initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
            >
              <AlertTriangle size={15} aria-hidden />
              <span>
                {isDraft
                  ? 'No applications. Assign one to turn this policy on.'
                  : evaluates(saved)
                    ? 'No applications, so this policy becomes a draft and stops deciding sign-ins.'
                    : 'No applications, so this policy becomes a draft.'}{' '}
                {/* Straight to the page that owns it. This used to open a
                    dialog behind this dialog, or — with no handler — just
                    close, which is a "go and do that" link that does not.
                    `go` is leave-guarded, so an unsaved draft gets asked
                    about rather than dropped. */}
                <button
                  type="button"
                  className="bdlg-warn__go"
                  onClick={() => {
                    onClose()
                    store.go({ name: 'policy-details', policyId: policy.id, from })
                  }}
                >
                  Assign applications
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Findings about the policy as a whole (who it applies to) belong to
            no rule row, and one of them can disable the buttons below. */}
        {diagnostics.some((d) => d.ruleIndex === -1) && (
          <div className="bdlg-rev__policydiag">
            {diagnostics
              .filter((d) => d.ruleIndex === -1)
              .map((d) => (
                <DiagnosticRow key={d.id} d={d} />
              ))}
          </div>
        )}

        <ol className="bdlg-rev__rules">
          {policy.rules.map((rule, i) => {
            const { who, iff, then } = ruleSentence(rule, resolve)
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
                  <strong>{ruleLabel(rule)}</strong>
                  <span className="bdlg-rev__arrow" aria-hidden>
                    →
                  </span>
                  <DecisionChip decision={rule.decision} size="sm" />
                </p>
                {/* Who on its own line, never inside If. Absent for everyone. */}
                {who && (
                  <p className="bdlg-rev__prose">
                    <span className="bdlg-rev__key">Who:</span> {who}
                  </p>
                )}
                <p className="bdlg-rev__prose">
                  <span className="bdlg-rev__key">If:</span> {iff}
                </p>
                <p className="bdlg-rev__prose">
                  <span className="bdlg-rev__key">Then:</span>{' '}
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
              <strong>{FALLBACK_NAME}</strong>
              <span className="bdlg-rev__arrow" aria-hidden>
                →
              </span>
              <DecisionChip decision={fallback.decision} size="sm" />
            </p>
            {/* Not the fallback's predicate: nothing evaluates it. What reaches
                this row is whatever the rules above did not catch. */}
            <p className="bdlg-rev__prose">
              <span className="bdlg-rev__key">If:</span> no rule above matched
            </p>
            <p className="bdlg-rev__prose">
              <span className="bdlg-rev__key">Then:</span>{' '}
              <span className="bdlg-rev__arrow" aria-hidden>
                →
              </span>{' '}
              {ruleSentence(fallback, resolve).then}
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
  const store = useBrand()
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

  /* Which rules applying the template will actually write. Applying narrows
     every rule to the template's audience (the policy's), and a rule whose Who
     shares nobody with it is left out — so this list says so before saving
     rather than the board saying so after. */
  const kept = useMemo(
    () => policy.rules.map((r) => narrowToAudience(r, policy.audience, store.users) !== null),
    [policy.rules, policy.audience, store.users],
  )
  const keptCount = kept.filter(Boolean).length

  const trimmed = name.trim()
  const taken = nameTaken(trimmed, store.scenarios.map((s) => s.name))
  const reason =
    policy.rules.length === 0
      ? 'Add a rule before saving this policy as a template.'
      : keptCount === 0
        ? 'None of these rules apply to anyone in this policy.'
        : taken
          ? 'A template with this name already exists.'
          : !trimmed
            ? 'Enter a template name.'
            : null
  const ready = reason === null
  const save = () => {
    if (ready) onSave({ name: trimmed, description: description.trim(), category })
  }

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
          <span title={reason ?? undefined}>
            <Button variant="brand" disabled={!ready} onClick={save}>
              Save template
            </Button>
          </span>
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
            maxLength={50}
            required
            placeholder={`e.g. ${policy.name}`}
            aria-invalid={taken || undefined}
            aria-describedby={taken ? `${uid}-taken` : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              save()
            }}
          />
          {taken && (
            <p id={`${uid}-taken`} className="bdlg-error" role="alert">
              A template with this name already exists.
            </p>
          )}
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

        {policy.rules.length === 0 ? (
          <EmptyState compact icon={ListX} title="No rules" blurb="Add a rule before saving this policy as a template." />
        ) : (
          <section className="bdlg-tpl__includes">
            <p className="u-label">Rules</p>
            <ul>
              {policy.rules.map((r, i) => (
                <li key={r.id} className={kept[i] ? '' : 'is-dropped'}>
                  <span className="bdlg-tpl__n">{i + 1}</span>
                  <span className="bdlg-tpl__rule">{ruleLabel(r)}</span>
                  {!kept[i] && (
                    <>
                      <Badge tone="neutral">Not included</Badge>
                      <TipDot text="Its Who shares nobody with this policy." label={`Why ${ruleLabel(r)} is not included`} />
                    </>
                  )}
                  <DecisionChip decision={r.decision} size="sm" />
                </li>
              ))}
            </ul>
            {keptCount === 0 && (
              <p className="bdlg-error" role="alert">
                None of these rules apply to anyone in this policy.
              </p>
            )}
          </section>
        )}
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
      diagnose({ ...from, isSystem: false, rules: [probe] }, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints }).map((d) => d.title),
    )

    return store.policies
      .filter((p) => p.id !== from.id && p.type === from.type && !p.isSystem)
      .map((p) => {
        /* Against what the target's builder opens on — its saved draft when it
           has one — because that is where the copy is written. */
        const base = lastSaved(p)
        const at = base.rules.length
        const would: Policy = { ...p, rules: [...base.rules, probe], fallback: base.fallback }
        const found = diagnose(would, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints })
          .filter((d) => d.ruleIndex === at)
          /* Who outside the policy is never intrinsic: each target governs its
             own people, so it is judged against the target every time. */
          .filter((d) => d.code === 'PE151' || !intrinsic.has(d.title))
        const notes = found.filter((d) => d.severity !== 'error')
        return {
          policy: p,
          at,
          blocking: found.find((d) => d.severity === 'error'),
          /* A copy that applies to nobody there is the first thing to say. */
          notes: [...notes.filter((d) => d.code === 'PE151'), ...notes.filter((d) => d.code !== 'PE151')],
        }
      })
  }, [store.policies, store.groups, store.hooks, store.users, store.zones, store.fingerprints, from, rule])

  const chosen = targets.find((t) => t.policy.id === picked)

  const copy = () => {
    if (!rule || !chosen) return
    /* Into the target's draft when it is published, so the copy goes through
       its Review & save rather than deciding sign-ins at once. */
    const done = store.copyRuleInto(chosen.policy.id, rule)
    if (!done) return
    const where = done.intoDraft ? `the ${chosen.policy.name} draft` : chosen.policy.name
    store.showToast(
      `“${ruleLabel(rule)}” added to ${where} as rule ${done.at}.${chosen.blocking ? ' It cannot run there.' : ''}`,
    )
    onClose()
  }

  return (
    <Modal
      open={open && !!rule}
      onClose={onClose}
      title={rule ? `Copy “${ruleLabel(rule)}” to…` : 'Copy rule'}
      width={680}
      footer={
        <>
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
          <EmptyState
            compact
            icon={CopyPlus}
            title="No policy to copy into"
            blurb={`A rule can only be copied to another ${from.type} policy.`}
          />
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
                      <span className="u-sr-only">Added as rule {t.at + 1}.</span>
                      <TipMark text={`Added last, as rule ${t.at + 1}.`} />
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
