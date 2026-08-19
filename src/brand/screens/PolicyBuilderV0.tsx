import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Globe, KeyRound, MonitorSmartphone, Plus, Tag, TriangleAlert, X } from 'lucide-react'

import { Badge, Button, Chip, Counter, DecisionChip } from '../kit'
import { AssignAppsDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import {
  CONDITION_CATALOGUE,
  DECISION_CAPTION,
  DECISION_LABEL,
  blankRule,
  cond,
  conditionType,
  locationEmpty,
  type AccessDecision,
  type Condition,
  type MethodSet,
  type Policy,
  type Rule,
  type Zone,
} from '../data'
import { useBrand } from '../store'
import { modeLabel } from '../fingerprint'
import { impactOf } from './diagnostics'
import './builder-v0.css'

/* -----------------------------------------------------------------------------
   Policy builder V0 — the deployed prototype, recreated as it stands.

   This is not a proposal. v1/v2/v3 each argue for a different shape; V0 is the
   control they are argued against, so anything that "improves" it here destroys
   the only thing it is for. Where the captured spec (docs/v0-policy-flow.md §3)
   names a label, that label is reproduced verbatim; where it is silent, the
   nearest honest reading of the existing model is used and said so in a comment.

   Three columns, left to right: the ordered flow, the editor for whichever rule
   is selected, and the library rail whose objects attach to that rule. The
   editor never leaves the middle column, so selection in column one is the only
   navigation the screen has.

   Toolbar dialogs (decision log, test, assign, template, review) are owned by a
   separate module. The flags they mount against are here and wired; the mount
   points are marked.
   -------------------------------------------------------------------------- */

type Store = ReturnType<typeof useBrand>

/* V0's order, which is not the model's declaration order: strictest first, so
   the list reads as a ladder down from blocked to two steps. */
const DECISION_ORDER: AccessDecision[] = ['deny', '1fa', '2fa']

/** Tone class per decision. Kept apart from the label map so copy edits to one
    cannot silently repaint the other. */
const DECISION_TONE: Record<AccessDecision, string> = { deny: 'deny', '1fa': 'allow', '2fa': 'mfa' }

/* The explanatory line under the chosen decision. Only Deny's wording survives
   in the capture; the other two are written to its pattern — what the user
   experiences, then what they do not get. */
const DECISION_COPY: Record<AccessDecision, string> = {
  deny: 'Blocked users see an access-denied page. No MFA prompt, no alternate path.',
  '1fa': 'Users complete one step — their first factor. No second factor is requested.',
  '2fa': 'Users complete two steps — their first factor, then a method from the action set.',
}

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Values as a person would read them: library objects by name, never by id. */
function valueText(c: Condition, store: Store): string {
  const t = conditionType(c.typeId)
  if (t.valueKind === 'zone') return c.values.map((v) => store.zoneById(v)?.name ?? v).join(', ')
  if (t.valueKind === 'fingerprint') return c.values.map((v) => store.fingerprintById(v)?.name ?? v).join(', ')
  if (t.valueKind === 'time') return c.values.filter(Boolean).join('–')
  return c.values.filter(Boolean).join(', ')
}

/* The top bar's one-liner — "Not compliant with Corporate Managed → Deny".

   It quotes the operator and the value and drops the condition's type label,
   which looks like an omission and is not: "Device Posture Policy not compliant
   with Corporate Managed" says the same thing twice, and the whole point of the
   line is that it fits on one. */
function predicateText(rule: Rule, store: Store): string {
  if (rule.conditions.length === 0) return 'Everyone'
  const parts = rule.conditions.map((c, i) => {
    const body = `${c.operator} ${valueText(c, store) || '…'}`
    return i === 0 ? sentence(body) : `${c.joiner.toLowerCase()} ${body}`
  })
  return parts.join(' ')
}

/* What a zone is made of, derived rather than stored — the model has no `kind`
   field, and a zone may constrain address AND location at once, so a single
   fixed label would have to lie about the ones that do both. */
function zoneKind(z: Zone): string {
  const parts: string[] = []
  if (z.ip.length > 0) parts.push('IP')
  if (z.asn.length > 0) parts.push('ASN')
  if (!locationEmpty(z.location)) parts.push('Geo')
  return parts.join(' + ') || 'Any'
}

/* A new condition opens on a usable value instead of an empty one. A blank
   value is a rule that can never fire, and diagnose() correctly reports it as
   an error — so seeding is the difference between adding a condition and
   adding a defect. */
function seedValues(typeId: string, store: Store): string[] {
  const t = conditionType(typeId)
  if (t.valueKind === 'zone') return store.zones[0] ? [store.zones[0].id] : []
  if (t.valueKind === 'fingerprint') return store.fingerprints[0] ? [store.fingerprints[0].id] : []
  if (t.valueKind === 'time') return ['09:00', '17:00']
  if (t.options?.length) return [t.options[0]]
  return ['']
}

export function PolicyBuilderV0({ policyId }: { policyId: string }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const saved = store.policyById(policyId)

  const [draft, setDraft] = useState<Policy | null>(saved ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(saved?.rules[0]?.id ?? null)

  /* Toolbar surfaces. The dialogs live in another module and are deliberately
     not imported — they may not exist when this compiles. These are the flags
     they will mount against, wired now so the buttons are never dead. */
  const [showLog, setShowLog] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [showReview, setShowReview] = useState(false)

  const [addingGroup, setAddingGroup] = useState(false)
  const [addingCond, setAddingCond] = useState(false)

  // A different policy is a different draft; keeping the old one would let you
  // edit A while looking at B's name.
  useEffect(() => {
    if (!saved) return
    setDraft(saved)
    setSelectedId(saved.rules[0]?.id ?? null)
  }, [saved?.id])

  if (!draft) {
    return (
      <div className="bv0">
        <p className="bv0__gone">That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const found = rules.findIndex((r) => r.id === selectedId)
  const selIndex = found === -1 ? (rules.length > 0 ? 0 : -1) : found
  const selected = selIndex === -1 ? null : rules[selIndex]
  const impact = selected ? impactOf(draft, selIndex, store.groups) : null

  const patch = (p: Partial<Policy>) => setDraft({ ...draft, ...p })
  const patchRule = (p: Partial<Rule>) => {
    if (selIndex === -1) return
    patch({ rules: rules.map((r, n) => (n === selIndex ? { ...r, ...p } : r)) })
  }
  const patchCond = (ci: number, p: Partial<Condition>) => {
    if (!selected) return
    patchRule({ conditions: selected.conditions.map((c, n) => (n === ci ? { ...c, ...p } : c)) })
  }

  const addRule = () => {
    const r = blankRule(`Rule ${rules.length + 1}`)
    patch({ rules: [...rules, r] })
    setSelectedId(r.id)
  }

  /** Attach a library object to the selected rule as one more condition. */
  const attach = (c: Condition, what: string) => {
    if (!selected) return
    patchRule({ conditions: [...selected.conditions, c] })
    store.showToast(`${what} added to ${selected.name}`)
  }

  /* Method sets have no entry in the condition catalogue — they are not
     something a sign-in can be tested against — so the only place a set can
     land on a rule is its second-factor list. That is what "+ Add" means here,
     and it is why this one does not build a condition. */
  const attachMethodSet = (s: MethodSet) => {
    if (!selected) return
    patchRule({ secondFactor: 'specific', secondFactorMethods: s.methods })
    store.showToast(`${s.name} set as the second factor for ${selected.name}`)
  }

  const appCount = draft.allApps ? 'All' : draft.appIds.length
  const unassigned = !draft.allApps && draft.appIds.length === 0
  const firstRule = rules[0]

  return (
    <div className="bv0">
      {/* --- Top bar ---------------------------------------------------------- */}
      <header className="bv0__bar">
        <div className="bv0__ident">
          <nav className="bv0__crumb" aria-label="Breadcrumb">
            <button type="button" onClick={() => store.go({ name: 'policies' })}>
              Policies
            </button>
            <span aria-hidden>/</span>
            <b>{draft.name}</b>
          </nav>
          <div className="bv0__identmeta">
            <Badge tone="neutral">{draft.type}</Badge>
            {firstRule && (
              <p className="bv0__summary" title={`${predicateText(firstRule, store)} → ${DECISION_LABEL[firstRule.decision]}`}>
                <span>{predicateText(firstRule, store)}</span>
                <span className="bv0__arrow" aria-hidden>
                  →
                </span>
                <DecisionChip decision={firstRule.decision} size="sm" />
              </p>
            )}
          </div>
        </div>

        <div className="bv0__tools">
          <Button size="sm" onClick={() => setShowLog(true)}>
            Decision log
          </Button>
          <Button size="sm" onClick={() => setShowTest(true)}>
            Test policy
          </Button>
          <Button size="sm" onClick={() => setShowAssign(true)}>
            Assign apps ({appCount})
          </Button>
          <Button size="sm" onClick={() => setShowTemplate(true)}>
            Save as template
          </Button>
          <Button size="sm" variant="brand" onClick={() => setShowReview(true)}>
            Review &amp; Save
          </Button>
        </div>
      </header>

      <DecisionLogDialog open={showLog} policy={draft} onClose={() => setShowLog(false)} />
      <TestPolicyDialog open={showTest} policy={draft} onClose={() => setShowTest(false)} />
      <AssignAppsDialog
        open={showAssign}
        policy={draft}
        onClose={() => setShowAssign(false)}
        onChange={(appIds, allApps) => patch({ appIds, allApps })}
      />
      <SaveTemplateDialog
        open={showTemplate}
        policy={draft}
        onClose={() => setShowTemplate(false)}
        onSave={(t) => {
          setShowTemplate(false)
          store.showToast(`${t.name} saved as a template`)
        }}
      />
      {/* Review & Save is where the draft commits. Nothing else on this screen
          writes to the store, which is V0's behaviour — the builder is a draft
          until you confirm it. */}
      <ReviewDialog
        open={showReview}
        policy={draft}
        onClose={() => setShowReview(false)}
        onConfirm={() => {
          store.savePolicy(draft)
          setShowReview(false)
          store.showToast(`${draft.name} saved`)
        }}
      />

      {unassigned && (
        <div className="bv0__banner" role="status">
          <TriangleAlert size={15} strokeWidth={1.9} aria-hidden />
          <p>No apps assigned — this policy isn&rsquo;t protecting anything yet.</p>
          <button type="button" className="bv0__bannerlink" onClick={() => setShowAssign(true)}>
            Assign apps →
          </button>
        </div>
      )}

      <div className="bv0__cols">
        {/* --- 1. Flow ------------------------------------------------------- */}
        <section className="bv0__col bv0__col--flow" aria-label="Flow">
          <header className="bv0__colhead">
            <h2>Flow</h2>
            <p>Top to bottom. First match wins.</p>
          </header>

          <ol className="bv0__flow">
            <li>
              <div className="bv0__start">User attempts login</div>
              <Gap />
            </li>

            {rules.map((r, i) => {
              const on = r.id === selected?.id
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`bv0__rule ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      setSelectedId(r.id)
                      setAddingGroup(false)
                      setAddingCond(false)
                    }}
                  >
                    {/* The marker travels between rules rather than blinking out
                        and in, so the eye keeps hold of which rule the editor
                        on the right now belongs to. */}
                    {on &&
                      (reduce ? (
                        <span className="bv0__rulesel" aria-hidden />
                      ) : (
                        <motion.span
                          className="bv0__rulesel"
                          layoutId="bv0-rulesel"
                          transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                          aria-hidden
                        />
                      ))}
                    <span className="bv0__ruleidx">{i + 1}</span>
                    <span className="bv0__ruletext">
                      <span className="bv0__rulename">{r.name}</span>
                      <span className="bv0__rulecount">
                        {r.conditions.length} condition{r.conditions.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="bv0__rulematch">
                      <span aria-hidden>Match →</span>
                      <DecisionChip decision={r.decision} size="sm" />
                    </span>
                  </button>
                  <Gap />
                </li>
              )
            })}

            <li>
              <button type="button" className="bv0__addrule" onClick={addRule}>
                <Plus size={13} strokeWidth={2.2} aria-hidden />
                Add Rule
              </button>
              <Gap />
            </li>

            <li>
              {/* Pinned, unremovable, and not selectable — it is the engine's
                  fall-through rather than a rule you authored. */}
              <div className="bv0__default">
                <span className="bv0__defaultname">Default Rule</span>
                <span className="bv0__defaultdash" aria-hidden>
                  —
                </span>
                <span className="bv0__defaultwho">Everyone</span>
                <span className="bv0__arrow" aria-hidden>
                  →
                </span>
                <DecisionChip decision="1fa" size="sm" />
              </div>
            </li>
          </ol>
        </section>

        {/* --- 2. Editor ----------------------------------------------------- */}
        <section className="bv0__col bv0__col--editor" aria-label="Rule editor">
          {!selected || !impact ? (
            <div className="bv0__empty">
              <p>This policy has no rules. Every sign-in falls straight through to the default.</p>
              <Button variant="brand" size="sm" onClick={addRule}>
                Add the first rule
              </Button>
            </div>
          ) : (
            <>
              <div className="bv0__block">
                <span className="bv0__blocklabel">Applies to</span>
                <div className="bv0__chips">
                  {selected.appliesTo.map((id) => {
                    const g = store.groupById(id)
                    return (
                      <Chip
                        key={id}
                        // A rule with no audience matches nobody, so the last
                        // chip cannot be removed — only replaced.
                        removable={selected.appliesTo.length > 1}
                        onRemove={() =>
                          patchRule({ appliesTo: selected.appliesTo.filter((x) => x !== id) })
                        }
                      >
                        <Tag size={11} strokeWidth={1.9} aria-hidden />
                        {g.name}
                      </Chip>
                    )
                  })}
                  <button
                    type="button"
                    className="bv0__add"
                    aria-expanded={addingGroup}
                    onClick={() => setAddingGroup((v) => !v)}
                  >
                    <Plus size={12} strokeWidth={2.2} aria-hidden />
                    Add group
                  </button>
                </div>

                {addingGroup && (
                  <Menu title="Add a group" onClose={() => setAddingGroup(false)}>
                    {store.groups
                      .filter((g) => !selected.appliesTo.includes(g.id))
                      .map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="bv0__menuitem"
                          onClick={() => {
                            /* "All Employees" is the whole directory, not one
                               group among many — it replaces a selection rather
                               than joining it, or you could build "All AND
                               Finance", which reads narrower than it is. */
                            const next =
                              g.id === 'all'
                                ? ['all']
                                : [...selected.appliesTo.filter((x) => x !== 'all'), g.id]
                            patchRule({ appliesTo: next })
                            setAddingGroup(false)
                          }}
                        >
                          <strong>{g.name}</strong>
                          <em>{g.memberCount.toLocaleString()} members</em>
                        </button>
                      ))}
                  </Menu>
                )}
              </div>

              <div className="bv0__block">
                <div className="bv0__blockhead">
                  <span className="bv0__blocklabel bv0__blocklabel--if">IF</span>
                  <h3>Conditions</h3>
                  <span className="bv0__live" aria-live="polite">
                    ~<Counter value={impact.matches} /> users match
                  </span>
                </div>

                {selected.conditions.length === 0 ? (
                  <p className="bv0__none">
                    No conditions. This rule matches every sign-in that reaches it.
                  </p>
                ) : (
                  <ul className="bv0__conds">
                    <AnimatePresence initial={false}>
                      {selected.conditions.map((c, ci) => {
                        const t = conditionType(c.typeId)
                        const blank = c.values.length === 0 || c.values.every((v) => !v.trim())
                        return (
                          <motion.li
                            key={c.id}
                            className={`bv0__cond ${blank ? 'is-blank' : ''}`}
                            initial={reduce ? false : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                            transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
                          >
                            <span className="bv0__condtype">{t.label}</span>
                            <select
                              className="bv0__op"
                              aria-label={`${t.label} operator`}
                              value={c.operator}
                              onChange={(e) => patchCond(ci, { operator: e.target.value })}
                            >
                              {t.operators.map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                            </select>
                            <ValueControl
                              type={t}
                              values={c.values}
                              onChange={(values) => patchCond(ci, { values })}
                            />
                            <button
                              type="button"
                              className="bv0__condx"
                              aria-label={`Remove ${t.label}`}
                              onClick={() =>
                                patchRule({
                                  conditions: selected.conditions.filter((_, n) => n !== ci),
                                })
                              }
                            >
                              <X size={13} strokeWidth={2.2} aria-hidden />
                            </button>
                          </motion.li>
                        )
                      })}
                    </AnimatePresence>
                  </ul>
                )}

                <button
                  type="button"
                  className="bv0__add"
                  aria-expanded={addingCond}
                  onClick={() => setAddingCond((v) => !v)}
                >
                  <Plus size={12} strokeWidth={2.2} aria-hidden />
                  Add condition
                </button>

                {addingCond && (
                  <ConditionPicker
                    onClose={() => setAddingCond(false)}
                    onPick={(typeId) => {
                      const t = conditionType(typeId)
                      patchRule({
                        conditions: [
                          ...selected.conditions,
                          cond(typeId, t.operators[0], seedValues(typeId, store)),
                        ],
                      })
                      setAddingCond(false)
                    }}
                  />
                )}

                <p className="bv0__caption">When these conditions match…</p>
              </div>

              <div className="bv0__block">
                <div className="bv0__blockhead">
                  <span className="bv0__blocklabel bv0__blocklabel--then">THEN</span>
                  <h3>Apply when conditions match</h3>
                </div>

                <div className="bv0__actionset">
                  <span className="bv0__eyebrow">Action set</span>

                  {/* Labelled by the heading that is already on screen rather
                      than by an aria-label repeating it — two names for one
                      group is how a control ends up announced twice. */}
                  <div className="bv0__decisions" role="radiogroup" aria-labelledby="bv0-decision-label">
                    <span className="bv0__eyebrow" id="bv0-decision-label">
                      Access decision
                    </span>
                    <div className="bv0__decisionrow">
                      {DECISION_ORDER.map((d) => {
                        const on = selected.decision === d
                        return (
                          <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            className={`bv0__decision is-${DECISION_TONE[d]} ${on ? 'is-on' : ''}`}
                            onClick={() => patchRule({ decision: d })}
                          >
                            <span className="bv0__decisionmark" aria-hidden />
                            <strong>{DECISION_LABEL[d]}</strong>
                            <em>{DECISION_CAPTION[d]}</em>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <p className="bv0__decisioncopy">{DECISION_COPY[selected.decision]}</p>

                  <p className="bv0__ml">
                    The ML engine may escalate this decision based on behavioral signals.
                    {selected.decision === 'deny' ? ' A Deny here is always final.' : ''}{' '}
                    <button type="button" className="bv0__link">
                      Learn more →
                    </button>
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* --- 3. Reusable objects ------------------------------------------- */}
        <aside className="bv0__col bv0__col--rail" aria-label="Reusable objects">
          <header className="bv0__colhead">
            <h2>Reusable objects</h2>
            <p>Defined once, referenced by any rule.</p>
          </header>

          <RailSection
            title="Zones"
            icon={<Globe size={13} strokeWidth={1.9} aria-hidden />}
            onNew={() => store.go({ name: 'zones' })}
          >
            {store.zones.map((z) => (
              <ObjRow
                key={z.id}
                name={z.name}
                kind={zoneKind(z)}
                usedIn={z.usedIn}
                disabled={!selected}
                onAdd={() => attach(cond('zone', 'in zone', [z.id]), z.name)}
              />
            ))}
            {/* V0 puts a file input here. Import belongs to the zone library and
                is built there, so this routes to it rather than opening a file
                dialog that nothing is listening to. */}
            <button type="button" className="bv0__raillink" onClick={() => store.go({ name: 'zones' })}>
              Import zones from file →
            </button>
          </RailSection>

          <RailSection
            title="Device posture"
            icon={<MonitorSmartphone size={13} strokeWidth={1.9} aria-hidden />}
            onNew={() => store.go({ name: 'fingerprint' })}
          >
            {store.fingerprints.map((p) => (
              <ObjRow
                key={p.id}
                name={p.name}
                kind={modeLabel(p)}
                usedIn={p.usedIn}
                disabled={!selected}
                onAdd={() => attach(cond('fingerprint', 'recognised by', [p.id]), p.name)}
              />
            ))}
          </RailSection>

          <RailSection
            title="Method sets"
            icon={<KeyRound size={13} strokeWidth={1.9} aria-hidden />}
            onNew={() => store.go({ name: 'methods' })}
          >
            {store.methodSets.map((s) => (
              <ObjRow
                key={s.id}
                name={s.name}
                kind={`${s.methods.length} method${s.methods.length === 1 ? '' : 's'}`}
                usedIn={s.usedIn}
                disabled={!selected}
                onAdd={() => attachMethodSet(s)}
              />
            ))}
          </RailSection>
        </aside>
      </div>
    </div>
  )
}

/* --- Flow connector ----------------------------------------------------------
   Decorative: the label repeats what the ordering already encodes, so it is
   hidden from the accessibility tree rather than read out between every rule. */
function Gap() {
  return (
    <div className="bv0__gap" aria-hidden>
      <span className="bv0__gapline" />
      <span className="bv0__gaptext">No match ↓</span>
      <span className="bv0__gapline" />
    </div>
  )
}

/* --- Rail ------------------------------------------------------------------- */

function RailSection({
  title,
  icon,
  onNew,
  children,
}: {
  title: string
  icon: React.ReactNode
  onNew: () => void
  children: React.ReactNode
}) {
  return (
    <section className="bv0__railsec">
      <header className="bv0__railhead">
        <span className="bv0__railico">{icon}</span>
        <h3>{title}</h3>
        <button type="button" className="bv0__railnew" onClick={onNew}>
          <Plus size={11} strokeWidth={2.4} aria-hidden />
          New
        </button>
      </header>
      <div className="bv0__railbody">{children}</div>
    </section>
  )
}

function ObjRow({
  name,
  kind,
  usedIn,
  disabled,
  onAdd,
}: {
  name: string
  kind: string
  usedIn: number
  disabled: boolean
  onAdd: () => void
}) {
  return (
    <div className="bv0__obj">
      <span className="bv0__objname" title={name}>
        {name}
      </span>
      <span className="bv0__objkind">{kind}</span>
      <span className="bv0__objused">
        <span className="bv0__sr">Used in </span>
        {usedIn}
        <span className="bv0__sr"> rules</span>
      </span>
      <button
        type="button"
        className="bv0__objadd"
        disabled={disabled}
        title={disabled ? 'Select a rule first' : `Add ${name} to the selected rule`}
        onClick={onAdd}
      >
        <Plus size={11} strokeWidth={2.4} aria-hidden />
        Add
      </button>
    </div>
  )
}

/* --- Menus ------------------------------------------------------------------- */

function Menu({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bv0__menu" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="bv0__menuhead">
        <strong>{title}</strong>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </header>
      <div className="bv0__menubody">{children}</div>
    </div>
  )
}

function ConditionPicker({
  onPick,
  onClose,
}: {
  onPick: (typeId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const m = new Map<string, typeof CONDITION_CATALOGUE>()
    const needle = q.trim().toLowerCase()
    for (const c of CONDITION_CATALOGUE) {
      if (needle && !c.label.toLowerCase().includes(needle) && !c.group.toLowerCase().includes(needle))
        continue
      if (!m.has(c.group)) m.set(c.group, [])
      m.get(c.group)!.push(c)
    }
    return [...m.entries()]
  }, [q])

  return (
    <Menu title="Add a condition" onClose={onClose}>
      <input
        autoFocus
        type="search"
        className="bv0__menusearch"
        placeholder="Search conditions…"
        aria-label="Search conditions"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {groups.map(([g, list]) => (
        <div className="bv0__menugroup" key={g}>
          <h4>{g}</h4>
          {list.map((c) => (
            <button key={c.id} type="button" className="bv0__menuitem" onClick={() => onPick(c.id)}>
              <strong>{c.label}</strong>
              <em>{c.hint}</em>
            </button>
          ))}
        </div>
      ))}
      {groups.length === 0 && <p className="bv0__menuempty">Nothing matches “{q}”.</p>}
    </Menu>
  )
}

/* --- Value control -----------------------------------------------------------
   Follows the condition's own valueKind, so a zone offers the zone library and
   a country offers countries. One free-text box for all of them is what turns a
   builder into a form over a database. */
function ValueControl({
  type,
  values,
  onChange,
}: {
  type: ReturnType<typeof conditionType>
  values: string[]
  onChange: (v: string[]) => void
}) {
  const store = useBrand()
  const v = values[0] ?? ''

  if (type.valueKind === 'zone') {
    return (
      <select className="bv0__val" aria-label="Zone" value={v} onChange={(e) => onChange([e.target.value])}>
        <option value="">Choose a zone…</option>
        {store.zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    )
  }

  if (type.valueKind === 'fingerprint') {
    return (
      <select
        className="bv0__val"
        aria-label="Device posture"
        value={v}
        onChange={(e) => onChange([e.target.value])}
      >
        <option value="">Choose a posture…</option>
        {store.fingerprints.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    )
  }

  if (type.options?.length) {
    return (
      <select className="bv0__val" aria-label={type.label} value={v} onChange={(e) => onChange([e.target.value])}>
        <option value="">Choose…</option>
        {type.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }

  if (type.valueKind === 'time') {
    return (
      <span className="bv0__val bv0__times">
        <input
          type="time"
          aria-label="From"
          value={values[0] ?? '09:00'}
          onChange={(e) => onChange([e.target.value, values[1] ?? '17:00'])}
        />
        <input
          type="time"
          aria-label="To"
          value={values[1] ?? '17:00'}
          onChange={(e) => onChange([values[0] ?? '09:00', e.target.value])}
        />
      </span>
    )
  }

  return (
    <input
      type="text"
      className="bv0__val"
      aria-label={type.label}
      placeholder="Enter a value…"
      value={v}
      onChange={(e) => onChange([e.target.value])}
    />
  )
}
