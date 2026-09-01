import { Fragment, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Globe, KeyRound, MonitorSmartphone, Plus, Tag, TriangleAlert, UserRound } from 'lucide-react'

import { Badge, Button, Chip, Counter, DecisionChip } from '../kit'
import { AssignAppsDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import {
  DECISION_CAPTION,
  DECISION_LABEL,
  blankRule,
  locationEmpty,
  type AccessDecision,
  type MethodSet,
  type Policy,
  type Rule,
  type Zone,
} from '../data'
import { useBrand, useNameLookup } from '../store'
import { modeLabel } from '../fingerprint'
import { impactOf } from './diagnostics'
import { predicateParts, predicateSentence, predicateSummary } from './predicate-prose'
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

   One thing here is no longer a recreation, and it is the middle column's IF
   block. A rule's WHEN is a disjunction of cards now — alternatives, each one
   an unbroken run of ANDs — and V0's editor is a flat list of rows with a
   joiner dropdown between them. A flat list cannot say which alternative a row
   belongs to; the only ways to make it try are to flatten the cards, which
   prints a rule that catches different people than the one that runs, or to
   grow a drop target per card, which is new interaction design rather than a
   recreation of anything. So the conditions are READ ONLY here, rendered
   through the one shared prose renderer, with a way back to v4 underneath.
   Everything else — the flow column, the decision ladder, the rail, the
   toolbar and its five dialogs — behaves exactly as it did.
   -------------------------------------------------------------------------- */

/* The `Store` alias went with the three functions that took one. Every reader
   left in this file is a component and calls `useBrand()` itself. */

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

/* `valueText` and `predicateText` used to live here: a local reading of a rule's
   conditions, resolving zone and fingerprint ids to names, dropping the type
   label where the object's own name already said which field it was, and
   walking the flat array's joiners.

   Both are gone, and nothing like them comes back. There were six of these
   across the codebase and they had already drifted from one another; they are
   now one module, `predicate-prose.ts`, which is also the renderer the review
   dialog uses when it promises the reader that the sentence and the rule cannot
   disagree. A seventh implementation in here would be a seventh chance for that
   promise to be false — and with alternatives in the model, a renderer that
   flattens them describes a rule that catches different sign-ins than the one
   the engine runs. The capitalisation helper above stays: it is punctuation,
   not prose. */

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

/* `seedValues` went with the condition picker.

   It opened a newly added condition on a usable value — the first zone, the
   first option, 09:00–17:00 — because a blank value is a rule that can never
   fire and diagnose() rightly calls it an error. Nothing in this file adds a
   condition any more, so the only thing it could seed is a row nobody can
   create. v4's composer makes the same argument in its own way, and the
   argument is worth reading there rather than kept alive here as dead code. */

export function PolicyBuilderV0({ policyId }: { policyId: string }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const resolve = useNameLookup()
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

  /* `addingGroup` and `addingCond` are gone with the two menus they opened —
     the group picker under "Applies to" and the condition catalogue under IF.
     Neither has anything left to add: audience is the policy's now, and
     conditions are read-only here. */

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
  /* `patchCond` — operator and value edits on one row — and `attach`, which
     dropped a zone or a device profile onto the selected rule as one more
     condition, are both removed. Each of them appended to or rewrote a flat
     `conditions` array that no longer exists, and neither has an honest
     replacement here: "add this zone to the rule" now has to answer WHICH
     alternative it joins, and V0 has nowhere to ask. */

  const addRule = () => {
    const r = blankRule(`Rule ${rules.length + 1}`)
    patch({ rules: [...rules, r] })
    setSelectedId(r.id)
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
  /* The top bar's one-liner, from the shared renderer. It is longer than the
     old hand-built one for a rule with alternatives, which is the honest
     outcome: a rule with two alternatives IS longer to say, and the line
     truncates rather than lies. */
  const firstText = firstRule ? sentence(predicateSentence(firstRule.when, resolve)) : ''

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
              <p className="bv0__summary" title={`${firstText} → ${DECISION_LABEL[firstRule.decision]}`}>
                <span>{firstText}</span>
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
                    onClick={() => setSelectedId(r.id)}
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
                      {/* "3 conditions" was counted off the flat array. The
                          shared summary counts the same leaves and adds the
                          one fact a count cannot carry — whether they are all
                          required, or alternatives. */}
                      <span className="bv0__rulecount">{predicateSummary(r.when)}</span>
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
              {/* --- Applies to ---------------------------------------------
                  This was the rule's own audience: a removable chip per group,
                  an "Add group" menu beside them, and a rule that the last chip
                  could not be removed because a rule governing nobody matches
                  nobody. All of it is deleted rather than ported.

                  Audience is a standing fact about the policy now, not a
                  per-rule predicate. Held per rule it let this very screen build
                  "rule 1 covers Finance, rule 2 covers everyone" — which reads
                  as a scoped policy and is not one, and which the flow column
                  above cannot show at all. So what is left is the POLICY's
                  audience, stated once, in the same chips, read-only: this rule
                  inherits it, and nothing typed in this column can widen it.
                  Narrowing inside a policy is still expressible and now says so
                  — it is a group condition in the IF below, evaluated like any
                  other rather than as a second, invisible gate. */}
              <div className="bv0__block">
                <span className="bv0__blocklabel">Applies to</span>
                <div className="bv0__chips">
                  {draft.audience.everyone ? (
                    <Chip>
                      <Tag size={11} strokeWidth={1.9} aria-hidden />
                      Everyone
                    </Chip>
                  ) : (
                    <>
                      {draft.audience.groupIds.map((id) => (
                        <Chip key={id}>
                          <Tag size={11} strokeWidth={1.9} aria-hidden />
                          {store.groupById(id).name}
                        </Chip>
                      ))}
                      {/* A named individual whose account has gone is shown as
                          the id it still points at rather than resolved to
                          somebody else — `userById` returns undefined for an
                          unknown id precisely so this can be honest. */}
                      {draft.audience.userIds.map((id) => (
                        <Chip key={id}>
                          <UserRound size={11} strokeWidth={1.9} aria-hidden />
                          {store.userById(id)?.name ?? id}
                        </Chip>
                      ))}
                      {draft.audience.groupIds.length === 0 &&
                        draft.audience.userIds.length === 0 && (
                          <span className="bv0__none">
                            Nobody. This policy governs no one until an audience is chosen.
                          </span>
                        )}
                    </>
                  )}
                </div>
                <p className="bv0__caption">
                  The policy&rsquo;s audience, inherited by every rule in it. Set it in v4.
                </p>
              </div>

              <div className="bv0__block">
                <div className="bv0__blockhead">
                  <span className="bv0__blocklabel bv0__blocklabel--if">IF</span>
                  <h3>Conditions</h3>
                  <span className="bv0__live" aria-live="polite">
                    ~<Counter value={impact.matches} /> users match
                  </span>
                </div>

                {/* The editor that stood here was one row per condition: type
                    label, operator dropdown, value control, remove button, and
                    an AND/OR select between the rows. It is replaced by a
                    readout of the same rule, not by a narrower editor.

                    The reason is the joiner. In the old model each condition
                    carried the joiner to the one before it and the whole run was
                    read left to right with no precedence, so "everything on this
                    screen is one list" was true. It is not true any more: the
                    conditions are grouped into alternatives, the rule matches if
                    ANY alternative is satisfied in full, and a flat list has no
                    place to put the grouping. Rendering one anyway would print a
                    rule that catches different sign-ins than the one the engine
                    runs — the exact failure the single prose renderer exists to
                    prevent — and adding a drop target per alternative would make
                    this a fourth grouping editor to keep in step with v4's.

                    So: cards down the block, each an unbroken run joined by a
                    lowercase "and", OR between them, straight from
                    `predicateParts` — the same call the review dialog makes. */}
                <Readout rule={selected} />

                <p className="bv0__caption">
                  Read-only in v0. Conditions are grouped into alternatives now, and this
                  version&rsquo;s editor has no way to say which alternative a row belongs to.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => store.go({ name: 'builder', policyId: draft.id })}
                >
                  Edit in v4
                </Button>

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
            {/* The "+ Add" on zones and on device profiles is gone with the
                condition editor it fed. Both built a condition and appended it
                to the selected rule, and appending is the one thing that cannot
                be done blind under alternatives: "add Office Network to this
                rule" has to answer whether it narrows every alternative or
                becomes a new one, and those are different rules. The rows stay
                as what the column header already claims they are — objects
                defined once, with the count of rules referencing them — and
                "New" still opens the library that owns them. */}
            {store.zones.map((z) => (
              <ObjRow key={z.id} name={z.name} kind={zoneKind(z)} usedIn={z.usedIn} />
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
              <ObjRow key={p.id} name={p.name} kind={modeLabel(p)} usedIn={p.usedIn} />
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

/* `onAdd` is optional now. A method set still lands on a rule — it sets the
   second factor, which is a field and not a condition — so that row keeps its
   button; zones and device profiles have nowhere to land and render without
   one. The prop rather than a second component, because the row is otherwise
   identical and two of them would drift. */
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
  disabled?: boolean
  onAdd?: () => void
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
      {onAdd && (
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
      )}
    </div>
  )
}

/* --- The readout -------------------------------------------------------------
   What is left of the IF block: the selected rule's WHEN, as prose.

   `Menu`, `ConditionPicker` and `ValueControl` used to live below this line and
   are all deleted. The menu shell was shared by the group picker and the
   condition catalogue; the catalogue was the twenty-four types grouped by their
   nine components with a search box over them; the value control followed each
   condition's own `valueKind`, so a zone offered the zone library and a country
   offered countries. Every one of them existed to WRITE a condition, and this
   screen no longer writes conditions — see the note in the IF block above.

   They are not preserved as dead code, because a picker that compiles and is
   unreachable is worse than a deleted one: the next person to read this file
   would take it for a feature that had broken. The living versions are v4's,
   in `rule-form.tsx`, where they gained the thing V0's could never express.

   Nothing here re-implements the prose. `predicateParts` is the same call the
   review dialog makes, returning the same clauses the sentence is built from;
   this only decides which of them get a line of their own. */
function Readout({ rule }: { rule: Rule }) {
  const resolve = useNameLookup()
  const parts = predicateParts(rule.when, resolve)

  if (parts.length === 0) {
    return (
      <p className="bv0__none">No conditions. This rule matches every sign-in that reaches it.</p>
    )
  }

  return (
    <ul className="bv0__conds">
      {parts.map((k, i) => (
        <Fragment key={k.id}>
          {/* Cards are alternatives with no order between them, so the
              separator is the operator itself and not "then". It is uppercase
              where the "and" inside a card is lowercase, which is the whole
              hierarchy said in two words: `and` is punctuation, `or` is a
              branch. */}
          {i > 0 && (
            <li className="bv0__cond">
              <span className="bv0__eyebrow">or</span>
            </li>
          )}
          <li className="bv0__cond">
            {/* The letter is only worth showing when there is more than one
                alternative to tell apart; a lone card is just the rule. The
                author's own label wins over the letter wherever they gave one,
                because it says what they thought the alternative WAS. */}
            {(parts.length > 1 || k.label) && (
              <span className="bv0__condtype">{k.label ?? `Alternative ${k.letter}`}</span>
            )}
            <span>
              {k.clauses.map((cl, j) => (
                <Fragment key={cl.id}>
                  {/* `bv0__gaptext` is borrowed rather than a new class,
                      because this file's stylesheet is not mine to extend on
                      this pass and it is already the muted-small token pair
                      this needs. */}
                  {j > 0 && <em className="bv0__gaptext"> and </em>}
                  {cl.text}
                </Fragment>
              ))}
            </span>
          </li>
        </Fragment>
      ))}
    </ul>
  )
}
