import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  GripVertical,
  ListFilter,
  LogIn,
  MapPin,
  MonitorSmartphone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, Counter, Toggle } from '../kit'
import {
  CONDITION_CATALOGUE,
  blankRule,
  cond,
  conditionType,
  type AccessDecision,
  type Policy,
  type Rule,
} from '../data'
import { useBrand } from '../store'
import { diagnose, impactOf } from './diagnostics'
import { AssignAppsDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { GauntletDialog, GauntletPip } from './gauntlet-dialog'
import { ImpactArenaDialog, ImpactPip } from './impact-arena-dialog'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import './builder-v3.css'

/* -----------------------------------------------------------------------------
   Policy builder v3 — the Zap model.

   v2 put a palette on the left and an inspector on the right. That is the Tines
   / Airtable shape and it suits a graph. A policy is not a graph: it is an
   ordered list where the first match wins, and Zapier's editor is the tool
   built for exactly that shape — one centre column of numbered steps, each
   expanding in place to configure itself.

   The difference is not cosmetic. In a three-zone layout the thing you are
   editing and the form that edits it are in different halves of the screen, so
   your eye crosses the window on every change. Here the form opens inside the
   step, and the column reflows around it. The step is the thing.

   What Zapier does that this borrows, and why each earns its place:

   · A trigger step that is fixed and unremovable. Zapier's Zap always starts
     with one; our policy always starts with a sign-in attempt. Drawing it makes
     the sequence complete rather than starting mid-thought.
   · Per-step status — needs setup / ready / warning. A step that is not
     finished says so on its own face, so the publish button is never the first
     place you learn something is wrong.
   · A "+" on the connector, not a button at the bottom. Order matters, so
     insertion has to be positional.
   · Sentence-style summaries when collapsed (Notion Automations, monday.com
     recipes): "When Country is not India → require MFA" reads as the rule,
     where a chip row only lists its parts.

   Semantics are untouched: diagnose / impactOf are imported unchanged.
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
const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

const OUTCOMES: { id: AccessDecision; label: string; verb: string; sub: string }[] = [
  { id: '1fa', label: 'Allow', verb: 'let them in', sub: 'Password only' },
  { id: '2fa', label: 'MFA', verb: 'require a second factor', sub: 'Password, then a factor' },
  { id: 'deny', label: 'Deny', verb: 'block the sign-in', sub: 'No access' },
]
const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }
const outcomeOf = (d: AccessDecision) => OUTCOMES.find((o) => o.id === d)!

/* A step's own verdict on itself. Zapier shows this on the card face so the
   publish button is never where you first learn something is unfinished. */
type StepState = 'ready' | 'setup' | 'warn'

function stepState(rule: Rule, warned: boolean): StepState {
  if (rule.conditions.some((c) => c.values.length === 0 || c.values.every((v) => !v.trim()))) return 'setup'
  if (warned) return 'warn'
  return 'ready'
}

export function PolicyBuilderV3({ policyId }: { policyId: string }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const saved = store.policyById(policyId)

  const [draft, setDraft] = useState<Policy | null>(saved ?? null)
  const [open, setOpen] = useState<string | null>(null)
  const [picker, setPicker] = useState<number | null>(null)
  const [live, setLive] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)
  /* Gaps 3-7. v3 had the steps but none of the surfaces around them, so a
     policy could be built and never tested, reviewed, attached to an app, or
     explained. Same components V0 mounts — one implementation, two hosts. */
  const [dialog, setDialog] = useState<null | 'log' | 'test' | 'apps' | 'template' | 'review' | 'gauntlet' | 'impact'>(null)

  useEffect(() => {
    if (saved) setDraft(saved)
  }, [saved?.id])

  if (!draft || !saved) {
    return (
      <div className="bpage bz">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const diagnostics = diagnose(draft, store.groups, store.hooks)

  const patch = (p: Partial<Policy>) => setDraft({ ...draft, ...p })
  const patchRule = (i: number, p: Partial<Rule>) =>
    patch({ rules: rules.map((r, n) => (n === i ? { ...r, ...p } : r)) })

  const states = rules.map((r, i) =>
    stepState(r, diagnostics.some((d) => d.ruleIndex === i && d.severity !== 'info')),
  )
  const notReady = states.filter((s) => s === 'setup').length

  /* A plain function, not a useCallback.

     It used to be memoised, which put a hook after this component's early
     return — so on the render where a policy went missing, React saw a
     different number of hooks than the render before it. The memo was never
     doing anything either: `draft` was in the dependency list, and `draft`
     changes on every edit. */
  const insert =
    (at: number, typeId?: string, preset?: string) => {
      const seed: Partial<Rule> = {}
      if (typeId) {
        const t = conditionType(typeId)
        const values = preset
          ? [preset]
          :
          t.valueKind === 'zone'
            ? store.zones[0] ? [store.zones[0].id] : []
            : t.valueKind === 'fingerprint'
              ? store.fingerprints[0] ? [store.fingerprints[0].id] : []
              : t.valueKind === 'time'
                ? ['09:00', '17:00']
                : t.options?.length
                  ? [t.options[0]]
                  : ['']
        seed.conditions = [cond(typeId, t.operators[0], values)]
        /* A library pick names the step after the object, not the condition
           type — "Office Network" says more than "Network Zone". */
        seed.name = preset
          ? store.zones.find((z) => z.id === preset)?.name ??
            store.fingerprints.find((pp) => pp.id === preset)?.name ??
            t.label
          : t.label
      }
      const r = { ...blankRule(typeId ? conditionType(typeId).label : `Step ${rules.length + 2}`), ...seed }
      patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
      setOpen(r.id)
      setPicker(null)
      setJustAdded(r.id)
      window.setTimeout(() => setJustAdded(null), 900)
      setLive(`Step added at position ${at + 2}`)
    }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    patch({ rules: next })
    setLive(`${r.name} moved to step ${to + 2}. Evaluation order changed.`)
  }

  const ease = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 34 }

  return (
    <div className="bpage bz">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      <header className="bz__bar">
        <button
          type="button"
          className="bz__back"
          aria-label="Back to policies"
          onClick={() => store.go({ name: 'policies' })}
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <input
          className="bz__name"
          aria-label="Policy name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />

        <div className="bz__baracts">
          {/* The two played surfaces are not a v4/v5 feature — they answer
              questions every builder’s author has, so they hang off every
              builder’s toolbar. */}
          <GauntletPip policy={draft} onOpen={() => setDialog('gauntlet')} />
          <ImpactPip draft={draft} saved={saved} onOpen={() => setDialog('impact')} />
          <button type="button" className="bz__tool" onClick={() => setDialog('log')}>
            Decision log
          </button>
          <button type="button" className="bz__tool" onClick={() => setDialog('test')}>
            Test policy
          </button>
          <button type="button" className="bz__tool" onClick={() => setDialog('apps')}>
            Assign apps ({draft.allApps ? 'all' : draft.appIds.length})
          </button>
          <button type="button" className="bz__tool" onClick={() => setDialog('template')}>
            Save as template
          </button>
          {/* Zapier's publish button is disabled with a reason, never silently.
              The count is the reason. */}
          {notReady > 0 && (
            <span className="bz__blocked">
              {/* The verb agrees too — pluralising only the noun gives
                  "1 step need setup". */}
              {notReady === 1 ? '1 step needs setup' : `${notReady} steps need setup`}
            </span>
          )}
          <AnimatePresence>
            {dirty && (
              <motion.button
                type="button"
                className="bz__discard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDraft(saved)}
              >
                Discard
              </motion.button>
            )}
          </AnimatePresence>
          {/* Publish opens the review rather than committing blind. The rules
              are the thing being changed and they are worth reading once in
              prose before they start deciding sign-ins. */}
          <Button variant="brand" disabled={!dirty || notReady > 0} onClick={() => setDialog('review')}>
            Publish
          </Button>
        </div>
      </header>

      <GauntletDialog open={dialog === 'gauntlet'} policy={draft} onClose={() => setDialog(null)} />
      <ImpactArenaDialog
        open={dialog === 'impact'}
        draft={draft}
        saved={saved}
        onClose={() => setDialog(null)}
      />
      <DecisionLogDialog open={dialog === 'log'} policy={draft} onClose={() => setDialog(null)} />
      <TestPolicyDialog open={dialog === 'test'} policy={draft} onClose={() => setDialog(null)} />
      <AssignAppsDialog
        open={dialog === 'apps'}
        policy={draft}
        onClose={() => setDialog(null)}
        onChange={(appIds, allApps) => patch({ appIds, allApps })}
      />
      <SaveTemplateDialog
        open={dialog === 'template'}
        policy={draft}
        onClose={() => setDialog(null)}
        onSave={(t) => {
          setDialog(null)
          store.showToast(`${t.name} saved as a template`)
        }}
      />
      <ReviewDialog
        open={dialog === 'review'}
        policy={draft}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          store.savePolicy(draft)
          setDialog(null)
          store.showToast(`${draft.name} published`)
        }}
      />

      <div className="bz__scroll">
        <div className="bz__column">
          {/* V0 shows this and it is the single most useful warning in the
              flow: a policy with no app attached is syntactically fine and
              completely inert. Stated where the rules are, not buried in a
              review step you might never open. */}
          {!draft.allApps && draft.appIds.length === 0 && (
            <div className="bz__unattached">
              <AlertTriangle size={15} strokeWidth={1.9} aria-hidden />
              <span>
                <strong>No apps assigned.</strong> These rules are saved but never evaluated —
                nothing triggers them until an app is attached.
              </span>
            </div>
          )}
          {/* --- Step 1: the trigger. Fixed, like Zapier's. --------------- */}
          <article className="bz__step is-trigger">
            <div className="bz__stephead">
              <span className="bz__badge is-trigger" aria-hidden>
                <LogIn size={15} strokeWidth={1.9} />
              </span>
              <div className="bz__steptext">
                <span className="bz__eyebrow">Trigger</span>
                <h2>A user attempts to sign in</h2>
                <p>Every rule below is checked against this attempt, in order.</p>
              </div>
            </div>
          </article>

          <Connector onAdd={() => setPicker(0)} open={picker === 0} />
          {picker === 0 && <Picker onPick={(t, p) => insert(0, t, p)} onClose={() => setPicker(null)} />}

          {/* --- Steps 2..n: the rules ------------------------------------ */}
          {rules.map((r, i) => (
            <div key={r.id}>
              <motion.div layout={!reduce} transition={ease}>
                <Step
                  rule={r}
                  index={i}
                  state={states[i]}
                  policy={draft}
                  open={open === r.id}
                  pop={justAdded === r.id}
                  diagnostics={diagnostics.filter((d) => d.ruleIndex === i)}
                  onToggleOpen={() => setOpen(open === r.id ? null : r.id)}
                  onPatch={(p) => patchRule(i, p)}
                  onRemove={() => {
                    patch({ rules: rules.filter((_, n) => n !== i) })
                    setLive(`${r.name} deleted`)
                  }}
                  onDuplicate={() => {
                    const copy = { ...r, id: `r${Date.now()}`, name: `${r.name} (copy)` }
                    patch({ rules: [...rules.slice(0, i + 1), copy, ...rules.slice(i + 1)] })
                  }}
                  onMove={(d) => move(i, i + d)}
                  canUp={i > 0}
                  canDown={i < rules.length - 1}
                  reduce={!!reduce}
                />
              </motion.div>

              <Connector onAdd={() => setPicker(i + 1)} open={picker === i + 1} />
              {picker === i + 1 && <Picker onPick={(t, p) => insert(i + 1, t, p)} onClose={() => setPicker(null)} />}
            </div>
          ))}

          {/* --- The fall-through ----------------------------------------- */}
          <article className="bz__step is-fallback">
            <div className="bz__stephead">
              <span className="bz__badge is-fallback" aria-hidden>
                <Check size={15} strokeWidth={2.2} />
              </span>
              <div className="bz__steptext">
                <span className="bz__eyebrow">Otherwise</span>
                <h2>Everyone else is allowed in</h2>
                <p>Nothing above matched. This is the engine default and cannot be removed.</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}

/* --- The connector, with the insert affordance -------------------------------- */

function Connector({ onAdd, open }: { onAdd: () => void; open: boolean }) {
  return (
    <div className={`bz__link ${open ? 'is-open' : ''}`}>
      <span className="bz__linkline" aria-hidden />
      <button type="button" className="bz__plus" aria-label="Insert a step here" onClick={onAdd}>
        {open ? <X size={13} strokeWidth={2.4} /> : <Plus size={13} strokeWidth={2.4} />}
      </button>
    </div>
  )
}

/* --- The step picker ---------------------------------------------------------- */

function Picker({
  onPick,
  onClose,
}: {
  onPick: (typeId: string, preset?: string) => void
  onClose: () => void
}) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const m = new Map<string, typeof CONDITION_CATALOGUE>()
    for (const c of CONDITION_CATALOGUE) {
      if (METHOD_GROUPS.has(c.group)) continue
      if (q && !c.label.toLowerCase().includes(q.toLowerCase()) && !c.group.toLowerCase().includes(q.toLowerCase()))
        continue
      if (!m.has(c.group)) m.set(c.group, [])
      m.get(c.group)!.push(c)
    }
    return [...m.entries()]
  }, [q])

  return (
    <motion.div
      className="bz__picker"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="bz__pickhead">
        <strong>What should this step check?</strong>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      <input
        autoFocus
        className="bz__picksearch"
        placeholder="Search checks…"
        aria-label="Search checks"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="bz__pickbody">
        <button type="button" className="bz__pick is-blank" onClick={() => onPick('')}>
          <span className="bz__pickico" aria-hidden>
            <Sparkles size={15} strokeWidth={1.8} />
          </span>
          <span>
            <strong>Everyone</strong>
            <em>No check — applies to every sign-in that reaches it</em>
          </span>
        </button>
        {/* Gap 8. v2 gave the library its own rail; v3 has no third column to
            hang one on, and a permanent rail for objects you reach for
            occasionally would cost a column to save a click. It belongs in the
            picker — the moment you are already choosing what a step checks. */}
        {(() => {
          const hit = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase())
          const zones = store.zones.filter((z) => hit(z.name) || hit('zone'))
          const postures = store.fingerprints.filter((p) => hit(p.name) || hit('device'))
          if (zones.length === 0 && postures.length === 0) return null
          return (
            <div className="bz__pickgroup">
              <h4>From your library</h4>
              {zones.map((z) => (
                <button key={z.id} type="button" className="bz__pick" onClick={() => onPick('zone', z.id)}>
                  <span className="bz__pickico" aria-hidden>
                    <Globe size={15} strokeWidth={1.8} />
                  </span>
                  <span>
                    <strong>{z.name}</strong>
                    <em>Network zone{z.usedIn ? ` · used by ${z.usedIn} polic${z.usedIn === 1 ? 'y' : 'ies'}` : ''}</em>
                  </span>
                </button>
              ))}
              {postures.map((pp) => (
                <button key={pp.id} type="button" className="bz__pick" onClick={() => onPick('fingerprint', pp.id)}>
                  <span className="bz__pickico" aria-hidden>
                    <MonitorSmartphone size={15} strokeWidth={1.8} />
                  </span>
                  <span>
                    <strong>{pp.name}</strong>
                    <em>Device posture</em>
                  </span>
                </button>
              ))}
            </div>
          )
        })()}

        {groups.map(([g, list]) => {
          const Ico = GROUP_ICON[g] ?? ListFilter
          return (
            <div className="bz__pickgroup" key={g}>
              <h4>{g}</h4>
              {list.map((c) => (
                <button key={c.id} type="button" className="bz__pick" onClick={() => onPick(c.id)}>
                  <span className="bz__pickico" aria-hidden>
                    <Ico size={15} strokeWidth={1.8} />
                  </span>
                  <span>
                    <strong>{c.label}</strong>
                    <em>{c.hint}</em>
                  </span>
                </button>
              ))}
            </div>
          )
        })}
        {groups.length === 0 && <p className="bz__pickempty">Nothing matches “{q}”.</p>}
      </div>
    </motion.div>
  )
}

/* --- A step ------------------------------------------------------------------- */

function Step({
  rule,
  index,
  state,
  policy,
  open,
  pop,
  diagnostics,
  onToggleOpen,
  onPatch,
  onRemove,
  onDuplicate,
  onMove,
  canUp,
  canDown,
  reduce,
}: {
  rule: Rule
  index: number
  state: StepState
  policy: Policy
  open: boolean
  pop: boolean
  diagnostics: ReturnType<typeof diagnose>
  onToggleOpen: () => void
  onPatch: (p: Partial<Rule>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (d: -1 | 1) => void
  canUp: boolean
  canDown: boolean
  reduce: boolean
}) {
  const store = useBrand()
  const impact = impactOf(policy, index, store.groups)
  const out = outcomeOf(rule.decision)

  /* The collapsed face is a sentence, not a chip row. Notion Automations and
     monday.com both do this and it is the reason their recipes read as rules
     rather than as a list of parts. */
  const sentence =
    rule.conditions.length === 0 ? (
      <>
        <em>Everyone</em> who reaches this step — {out.verb}
      </>
    ) : (
      <>
        When{' '}
        {rule.conditions.slice(0, 2).map((c, n) => {
          const t = conditionType(c.typeId)
          return (
            <span key={c.id}>
              {n > 0 && <span className="bz__joiner"> {c.joiner} </span>}
              <em>
                {t.label} {c.operator} {c.values.filter(Boolean).join(', ') || '…'}
              </em>
            </span>
          )
        })}
        {rule.conditions.length > 2 && <span className="bz__more"> +{rule.conditions.length - 2} more</span>} —{' '}
        {out.verb}
      </>
    )

  return (
    <motion.article
      className={`bz__step is-${state} ${open ? 'is-open' : ''} ${rule.enabled ? '' : 'is-off'}`}
      animate={pop && !reduce ? { scale: [0.97, 1.02, 1] } : {}}
      transition={{ duration: 0.36 }}
    >
      <button type="button" className="bz__stephead" onClick={onToggleOpen} aria-expanded={open}>
        <span className={`bz__badge is-${DEC_KEY[rule.decision]}`}>
          {index + 2}
          {/* The status pip. It sits on the number because the number is what
              your eye is already tracking down the column. */}
          <span className={`bz__pip is-${state}`} aria-hidden />
        </span>

        <div className="bz__steptext">
          <span className="bz__eyebrow">
            Step {index + 2}
            {state === 'setup' && <b className="bz__needs">Needs setup</b>}
            {state === 'warn' && <b className="bz__warns">{diagnostics.length} check{diagnostics.length === 1 ? '' : 's'}</b>}
          </span>
          <h2>{rule.name}</h2>
          <p className="bz__sentence">{sentence}</p>
        </div>

        <span className="bz__stepright">
          <span className={`bz__outpill is-${DEC_KEY[rule.decision]}`}>{out.label}</span>
          <motion.span
            className="bz__chev"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            aria-hidden
          >
            <ChevronDown size={16} strokeWidth={2} />
          </motion.span>
        </span>
      </button>

      {/* The row of controls only a pointer-user would hunt for. */}
      <div className="bz__stepacts">
        <button type="button" aria-label="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={!canDown} onClick={() => onMove(1)}>
          ↓
        </button>
        <button type="button" aria-label={`Duplicate ${rule.name}`} onClick={onDuplicate}>
          <Copy size={13} strokeWidth={1.9} />
        </button>
        <button type="button" className="is-danger" aria-label={`Delete ${rule.name}`} onClick={onRemove}>
          <Trash2 size={13} strokeWidth={1.9} />
        </button>
        <span className="bz__grip" aria-hidden>
          <GripVertical size={13} strokeWidth={1.8} />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="bz__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
          >
            <div className="bz__bodyinner">
              <Section n={1} title="Name this step">
                <input
                  className="bz__input"
                  aria-label="Step name"
                  value={rule.name}
                  onChange={(e) => onPatch({ name: e.target.value })}
                />
              </Section>

              {/* Gap 1. Every rule has an audience and impactOf() already reads
                  it, so a builder that renders it but cannot edit it is showing
                  you a value you are not allowed to touch. */}
              <Section n={2} title="Choose who it applies to" done={rule.appliesTo.length > 0}>
                <div className="bz__groups">
                  {store.groups.map((g) => {
                    const all = g.id === 'all'
                    const on = rule.appliesTo.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        className={`bz__group ${on ? 'is-on' : ''}`}
                        onClick={() => {
                          /* "All Employees" is not one group among many — it is
                             the whole directory, so it replaces a selection
                             rather than joining it. Leaving both selectable
                             would let you build "All AND Finance", which reads
                             as narrower than it is. */
                          if (all) return onPatch({ appliesTo: ['all'] })
                          const rest = rule.appliesTo.filter((x) => x !== 'all')
                          const next = rest.includes(g.id)
                            ? rest.filter((x) => x !== g.id)
                            : [...rest, g.id]
                          onPatch({ appliesTo: next.length ? next : ['all'] })
                        }}
                      >
                        <span className="bz__groupcheck" aria-hidden />
                        <span className="bz__groupname">{g.name}</span>
                        <span className="bz__groupn">{g.memberCount.toLocaleString()}</span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section n={3} title="Set up the check" done={rule.conditions.length > 0}>
                {rule.conditions.length === 0 ? (
                  <p className="bz__hint">
                    No check — this step catches every sign-in that reaches it. That is valid, and it
                    also means nothing below it can ever run.
                  </p>
                ) : (
                  <ul className="bz__conds">
                    {rule.conditions.map((c, ci) => {
                      const t = conditionType(c.typeId)
                      const blank = c.values.length === 0 || c.values.every((v) => !v.trim())
                      return (
                        <li key={c.id} className={blank ? 'is-blank' : ''}>
                          {/* Gap 2. The joiner is on the model and diagnose()
                              already warns when a rule mixes AND with OR, so
                              the warning existed for a control the user could
                              not reach. It sits on the condition it joins TO
                              the previous one, which is what `joiner` means. */}
                          {ci > 0 && (
                            <button
                              type="button"
                              className={`bz__jn is-${c.joiner.toLowerCase()}`}
                              aria-label={`Joiner before ${t.label}: ${c.joiner}. Click to change.`}
                              onClick={() =>
                                onPatch({
                                  conditions: rule.conditions.map((x, n) =>
                                    n === ci ? { ...x, joiner: x.joiner === 'AND' ? 'OR' : 'AND' } : x,
                                  ),
                                })
                              }
                            >
                              {c.joiner}
                            </button>
                          )}
                          <span className="bz__condname">{t.label}</span>
                          <select
                            aria-label={`${t.label} operator`}
                            value={c.operator}
                            onChange={(e) =>
                              onPatch({
                                conditions: rule.conditions.map((x, n) =>
                                  n === ci ? { ...x, operator: e.target.value } : x,
                                ),
                              })
                            }
                          >
                            {t.operators.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                          <ValueField
                            type={t}
                            values={c.values}
                            onChange={(values) =>
                              onPatch({
                                conditions: rule.conditions.map((x, n) => (n === ci ? { ...x, values } : x)),
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${t.label}`}
                            onClick={() =>
                              onPatch({ conditions: rule.conditions.filter((_, n) => n !== ci) })
                            }
                          >
                            <X size={13} strokeWidth={2} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              <Section n={4} title="Choose the outcome">
                <div className="bz__outs">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`bz__out is-${DEC_KEY[o.id]} ${rule.decision === o.id ? 'is-on' : ''}`}
                      aria-pressed={rule.decision === o.id}
                      onClick={() => onPatch({ decision: o.id })}
                    >
                      <span className="bz__outico" aria-hidden>
                        {o.id === 'deny' ? (
                          <ShieldAlert size={16} strokeWidth={1.9} />
                        ) : o.id === '2fa' ? (
                          <ShieldCheck size={16} strokeWidth={1.9} />
                        ) : (
                          <Users size={16} strokeWidth={1.9} />
                        )}
                      </span>
                      <strong>{o.label}</strong>
                      <em>{o.sub}</em>
                    </button>
                  ))}
                </div>
              </Section>

              <div className="bz__footer">
                <div className="bz__impact">
                  <span>
                    <Counter value={impact.matches} /> expected to match
                  </span>
                  <span className={`bz__basis is-${impact.basis}`}>{impact.basis}</span>
                </div>
                <label className="bz__enable">
                  <Toggle
                    checked={rule.enabled}
                    onChange={(v) => onPatch({ enabled: v })}
                    label={`Enable ${rule.name}`}
                    size="sm"
                  />
                  <span>{rule.enabled ? 'Step is on' : 'Step is off'}</span>
                </label>
              </div>

              {diagnostics.length > 0 && (
                <div className="bz__checks">
                  {diagnostics.map((d) => (
                    <div key={d.id} className={`bz__check is-${d.severity}`}>
                      <strong>{d.title}</strong>
                      <p>{d.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

/* `done` is only passed where completion is genuinely variable. A rule always
   has an outcome, so ticking that section would be a checkmark that can never
   be earned or lost — which teaches the reader that the ticks mean nothing. */
function Section({
  n,
  title,
  done,
  children,
}: {
  n: number
  title: string
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="bz__sec">
      <h3>
        <span className={`bz__secn ${done ? 'is-done' : ''}`}>{done ? <Check size={11} strokeWidth={3} /> : n}</span>
        {title}
      </h3>
      <div className="bz__seccontent">{children}</div>
    </section>
  )
}

/* The value control follows the condition's own valueKind, so a zone offers the
   zone library and a country offers countries. A single free-text box for all
   of them is what makes a builder feel like a form over a database. */
function ValueField({
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
      <select aria-label="Zone" value={v} onChange={(e) => onChange([e.target.value])}>
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
      <select aria-label="Device posture" value={v} onChange={(e) => onChange([e.target.value])}>
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
      <select aria-label={type.label} value={v} onChange={(e) => onChange([e.target.value])}>
        <option value="">Choose…</option>
        {type.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    )
  }
  if (type.valueKind === 'time') {
    return (
      <span className="bz__times">
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
      aria-label={type.label}
      placeholder="Enter a value…"
      value={v}
      onChange={(e) => onChange([e.target.value])}
    />
  )
}
