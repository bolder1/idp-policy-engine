import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Clock,
  Copy,
  Fingerprint,
  Globe,
  GripVertical,
  Layers,
  ListFilter,
  MapPin,
  Minus,
  MonitorSmartphone,
  MousePointerClick,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import { Button, Counter, DecisionChip, Toggle } from '../kit'
import {
  CONDITION_CATALOGUE,
  blankRule,
  card,
  cond,
  conditionType,
  reidRule,
  when,
  type AccessDecision,
  type Policy,
  type Rule,
} from '../data'
import { leaves } from '../predicate'
import { useBrand, useNameLookup } from '../store'
import { AudienceBar } from './audience-drawer'
import { diagnose, impactOf, shadowedBy } from './diagnostics'
import { predicateParts } from './predicate-prose'
import './builder-v2.css'

/* -----------------------------------------------------------------------------
   Policy builder v2 — the three-zone tool layout.

   Every workflow builder surveyed on Mobbin (Tines Storyboard, Intercom Series,
   Customer.io Journeys, Airtable Automations, V7) lands on the same three zones:
   a palette of things you can add, a canvas of what you have built, and an
   inspector for whatever is selected. v1 has only two of those. Conditions are
   added from *inside* the inspector, so the thing you build with lives inside
   the thing you build — and the inspector is 760px, wider than the canvas it
   describes.

   What this version changes, and why each one is a real fix rather than a
   reskin:

   · A palette exists. Conditions, outcomes and library objects are things you
     drag or click onto the flow, which is what makes it read as a tool.
   · The inspector is 340px and fixed. It is a form. Forms do not need half a
     screen.
   · Dropping between two rules opens a gap first, so the insertion point is
     visible before you commit rather than inferred after.
   · Every drag has a keyboard equivalent, because drag alone is unusable
     without a pointer and this is an admin console.

   Nothing here re-derives policy semantics. diagnose / impactOf / shadowedBy
   are imported unchanged — they are the sound-only linter, and a second
   opinion about what a rule means is exactly the bug they exist to prevent.

   **What this version no longer edits, since a rule's WHEN became a disjunction
   of cards.**

   v4 is the shipping candidate and owns the card composer. v2 is kept behind
   the design switcher as the three-zone comparison, and its argument — a
   palette you drag onto a canvas — is the one that does not survive the model
   change intact: a card model needs a drop target per card, which is new
   interaction design rather than a port, and four editors for one model is four
   editors that drift apart. So the WHEN is a read-only readout here and the
   hand-off to v4 is a button. The palette's add path stays, because appending a
   condition needs no grouping decision from the user: it lands in the first
   card, and the readout shows where it went.

   All four claims above are still testable in this layout — the palette, the
   narrow inspector, the opening gap and the keyboard route all survive
   untouched, which is the whole reason to keep this on screen. The audience
   moved up to the policy at the same time and is stated once above the flow
   rather than on every node; everything else here is as it was.
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
  'Phishing-Resistant': ShieldCheck,
  'Standard MFA': ShieldAlert,
  'Fallback & Recovery': Layers,
}

/* Condition groups only. The catalogue also carries the MFA-method groups,
   which are a rule's *outcome*, not a thing that decides whether it matches —
   putting them in the condition palette would offer a filter that filters on
   the answer. */
const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

const OUTCOMES: { id: AccessDecision; label: string; sub: string }[] = [
  { id: '1fa', label: 'Allow', sub: 'One step' },
  { id: '2fa', label: 'MFA', sub: 'Two steps' },
  { id: 'deny', label: 'Deny', sub: 'Block' },
]
const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/** Reorder, returning the new list and the rule that moved. Shared by the
    pointer path and the Alt+Arrow path so the two cannot drift. */
function reordered(rules: Rule[], from: number, to: number) {
  const next = [...rules]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return { next, moved }
}

type DragItem =
  | { kind: 'condition'; typeId: string }
  | { kind: 'outcome'; decision: AccessDecision }
  | { kind: 'rule'; index: number }

export function PolicyBuilderV2({ policyId }: { policyId: string }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const saved = store.policyById(policyId)

  const [draft, setDraft] = useState<Policy | null>(saved ?? null)
  const [sel, setSel] = useState<number | null>(null)
  const [drag, setDrag] = useState<DragItem | null>(null)
  /* Where the pointer currently is during a drag: a gap index (insert between
     rules) or a rule index (drop onto that rule). Null when nothing is hovered
     — which is different from "not dragging", so both are tracked. */
  const [overGap, setOverGap] = useState<number | null>(null)
  const [overRule, setOverRule] = useState<number | null>(null)
  const [zoom, setZoom] = useState(100)
  const [live, setLive] = useState('')

  useEffect(() => {
    if (saved) setDraft(saved)
  }, [saved?.id])

  /* The keyboard handler has to be registered above the early return, or a
     render where the policy has gone missing runs fewer hooks than the render
     before it — which is the one thing React cannot recover from. It reads the
     draft through a ref rather than a dependency so the listener is registered
     once and still sees current rules: keydown always fires after commit, so
     the ref is never stale by the time it is read. */
  const draftRef = useRef<Policy | null>(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cur = draftRef.current
      if (sel === null || !cur) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const reorder = (to: number) => {
        if (to < 0 || to >= cur.rules.length) return
        e.preventDefault()
        const { next, moved } = reordered(cur.rules, sel, to)
        setDraft({ ...cur, rules: next })
        setSel(to)
        /* Order IS the policy in a first-match-wins engine, so a reorder is a
           semantic edit and is announced as one. */
        setLive(`${moved.name} moved to position ${to + 1} of ${next.length}. Evaluation order changed.`)
      }

      if (e.altKey && e.key === 'ArrowUp') reorder(sel - 1)
      if (e.altKey && e.key === 'ArrowDown') reorder(sel + 1)
      if (!e.altKey && e.key === 'ArrowUp' && sel > 0) {
        e.preventDefault()
        setSel(sel - 1)
      }
      if (!e.altKey && e.key === 'ArrowDown' && sel < cur.rules.length - 1) {
        e.preventDefault()
        setSel(sel + 1)
      }
      if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  if (!draft || !saved) {
    return (
      <div className="bpage bwb">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  /* The live directory, not the seed. The audience can name individuals now, so
     the fourth argument decides whether a policy scoped to somebody who has
     left the tenant is reported or silently passes. */
  const diagnostics = diagnose(draft, store.groups, store.hooks, store.users)
  const selRule = sel !== null ? rules[sel] : undefined

  const patch = (p: Partial<Policy>) => setDraft({ ...draft, ...p })
  const patchRule = (i: number, p: Partial<Rule>) =>
    patch({ rules: rules.map((r, n) => (n === i ? { ...r, ...p } : r)) })

  /* --- mutations ---------------------------------------------------------- */

  /* Plain functions, not useCallbacks.

     All three used to be memoised below this component's early return, which
     made the hook count depend on whether the policy existed. The memo bought
     nothing either — `draft` was in every dependency list, and `draft` changes
     on every edit. */
  const insertRule = (at: number, seed?: Partial<Rule>) => {
    const r = { ...blankRule(`Rule ${rules.length + 1}`), ...seed }
    const next = [...rules.slice(0, at), r, ...rules.slice(at)]
    setDraft({ ...draft, rules: next })
    setSel(at)
    setLive(`Rule added at position ${at + 1} of ${next.length}`)
  }

  /* The default-value ladder is v1's, deliberately. A condition dropped with
     empty values trips the `blank` diagnostic the instant it lands, so the
     first thing a new user would see is their own action flagged as an error.
     Every [0] read is guarded — the library can legitimately be empty. */
  const addCondition = (ruleIndex: number, typeId: string, preset?: string) => {
      const t = conditionType(typeId)
      let values: string[] = ['']
      if (preset) values = [preset]
      else if (t.valueKind === 'zone') values = store.zones[0] ? [store.zones[0].id] : []
      else if (t.valueKind === 'fingerprint') values = store.fingerprints[0] ? [store.fingerprints[0].id] : []
      else if (t.valueKind === 'time') values = ['09:00', '17:00']
      else if (t.options?.length) values = [t.options[0]]

      const c = cond(typeId, t.operators[0], values)

      /* It lands in the FIRST card, and a rule with no cards gets one.

         The drag gesture asks a question the card model answers with a choice —
         *which* alternative does this belong to — and there is no drop target
         per card here to ask it with. Appending to the first card is the only
         answer that is stable regardless of where the pointer was released, so
         it is the one that can be announced honestly; the readout in the
         inspector then says which alternative grew, and v4 is one click away
         for anyone who wanted a different one. */
      const cur = rules[ruleIndex].when
      const cards =
        cur.cards.length === 0
          ? [card(c)]
          : cur.cards.map((k, n) => (n === 0 ? { ...k, conditions: [...k.conditions, c] } : k))
      patchRule(ruleIndex, { when: { cards } })
      setSel(ruleIndex)
      setLive(
        cur.cards.length > 1
          ? `${t.label} added to the first alternative of rule ${ruleIndex + 1}`
          : `${t.label} added to rule ${ruleIndex + 1}`,
      )
    }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length || from === to) return
    const { next, moved } = reordered(rules, from, to)
    setDraft({ ...draft, rules: next })
    setSel(to)
    setLive(`${moved.name} moved to position ${to + 1} of ${next.length}. Evaluation order changed.`)
  }

  const removeRule = (i: number) => {
    const r = rules[i]
    patch({ rules: rules.filter((_, n) => n !== i) })
    setSel(null)
    setLive(`${r.name} deleted`)
  }

  /* --- drop handling ------------------------------------------------------ */

  function dropOnGap(gap: number) {
    if (!drag) return
    if (drag.kind === 'rule') {
      move(drag.index, drag.index < gap ? gap - 1 : gap)
    } else if (drag.kind === 'condition') {
      /* Two sequential setDraft calls would race on the same stale `draft`, so
         the new rule is built with its condition already attached rather than
         inserted and then patched. */
      const t = conditionType(drag.typeId)
      const values =
        t.valueKind === 'zone'
          ? store.zones[0] ? [store.zones[0].id] : []
          : t.valueKind === 'fingerprint'
            ? store.fingerprints[0] ? [store.fingerprints[0].id] : []
            : t.valueKind === 'time'
              ? ['09:00', '17:00']
              : t.options?.length
                ? [t.options[0]]
                : ['']
      /* One condition, so one card — `when(card(...))`, never a bare array. A
         rule whose `when` is `{ cards: [] }` is the catch-all, and building a
         new rule that silently matches everybody is the one mistake that makes
         every rule under it unreachable. */
      insertRule(gap, { when: when(card(cond(drag.typeId, t.operators[0], values))) })
    } else if (drag.kind === 'outcome') {
      insertRule(gap, { decision: drag.decision })
    }
    clearDrag()
  }

  function dropOnRule(i: number) {
    if (!drag) return
    if (drag.kind === 'condition') addCondition(i, drag.typeId)
    else if (drag.kind === 'outcome') {
      patchRule(i, { decision: drag.decision })
      setSel(i)
      setLive(`Rule ${i + 1} outcome set to ${OUTCOMES.find((o) => o.id === drag.decision)?.label}`)
    } else if (drag.kind === 'rule') move(drag.index, i)
    clearDrag()
  }

  const clearDrag = () => {
    setDrag(null)
    setOverGap(null)
    setOverRule(null)
  }

  /* Keyboard: the palette appends to the selected rule (or makes one), and
     Alt+Arrow reorders. Drag is an accelerator, never the only route. */
  function paletteActivate(item: DragItem) {
    if (item.kind === 'rule') return
    const target = sel ?? rules.length - 1
    if (target < 0 || rules.length === 0) {
      insertRule(0, item.kind === 'outcome' ? { decision: item.decision } : undefined)
      if (item.kind === 'condition') addCondition(0, item.typeId)
      return
    }
    if (item.kind === 'condition') addCondition(target, item.typeId)
    else {
      patchRule(target, { decision: item.decision })
      setSel(target)
      setLive(`Rule ${target + 1} outcome set to ${OUTCOMES.find((o) => o.id === item.decision)?.label}`)
    }
  }

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 520, damping: 40 }

  return (
    <div className="bpage bwb">
      {/* Announcements for anything done without a pointer. */}
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      <header className="bwb__bar">
        <button
          type="button"
          className="bwb__back"
          aria-label="Back to policies"
          onClick={() => store.go({ name: 'policies' })}
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <input
          className="bwb__name"
          aria-label="Policy name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <AnimatePresence>
          {dirty && (
            <motion.span
              className="bwb__dirty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={spring}
            >
              Unsaved
              <button type="button" onClick={() => setDraft(saved)}>
                Discard
              </button>
            </motion.span>
          )}
        </AnimatePresence>

        <div className="bwb__baracts">
          <Button
            variant="brand"
            disabled={!dirty}
            onClick={() => {
              store.savePolicy(draft)
              store.showToast(`${draft.name} saved`)
            }}
          >
            Save changes
          </Button>
        </div>
      </header>

      <div className="bwb__work">
        <Palette
          onActivate={paletteActivate}
          onDragItem={setDrag}
          onDragEnd={clearDrag}
          dragging={drag}
        />

        <section className="bwb__canvas" aria-label="Rules, evaluated top to bottom">
          <div className="bwb__stage" style={{ zoom: `${zoom}%` }}>
            <div className="bwb__start">
              <span className="bwb__startdot" aria-hidden />A user attempts to sign in
            </div>

            {/* Who reaches this flow at all.

                Each rule node used to print its own `appliesTo` on its meta
                line, which let five nodes state five different scopes for one
                policy. Audience is one standing fact about the policy now, so
                it is stated once, at the top, where the sign-in enters — and it
                is read-only here because the drawer that edits it lives in v4.
                A per-rule chip would be a smaller lie than the old one, not a
                different kind. */}
            <div className="bwb__nmeta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <span>Applies to</span>
              <AudienceBar audience={draft.audience} groups={store.groups} users={store.users} />
            </div>

            <div className="bwb__flow">
              <Gap
                index={0}
                open={drag !== null && overGap === 0}
                dragging={drag !== null}
                onOver={() => setOverGap(0)}
                onLeave={() => setOverGap(null)}
                onDrop={() => dropOnGap(0)}
                onInsert={() => insertRule(0)}
              />

              {rules.map((r, i) => (
                <div key={r.id}>
                  <motion.div layout={!reduce} transition={spring}>
                    <RuleNode
                      rule={r}
                      index={i}
                      selected={sel === i}
                      shadowed={shadowedBy(draft, i).length > 0}
                      isDropTarget={overRule === i && drag !== null && drag.kind !== 'rule'}
                      onSelect={() => setSel(i)}
                      onToggle={(v) => patchRule(i, { enabled: v })}
                      onRemove={() => removeRule(i)}
                      onDuplicate={() => {
                        /* `reidRule`, not a spread. A shallow copy shares the
                           same card and condition objects with the rule it came
                           from, and both the composer and the linter address
                           those by id — so editing the copy would edit the
                           original, and two findings would collide on one id. */
                        const copy = { ...reidRule(r), name: `${r.name} (copy)` }
                        patch({ rules: [...rules.slice(0, i + 1), copy, ...rules.slice(i + 1)] })
                        setSel(i + 1)
                      }}
                      onDragStart={() => setDrag({ kind: 'rule', index: i })}
                      onDragEnd={clearDrag}
                      onOver={() => setOverRule(i)}
                      onLeave={() => setOverRule(null)}
                      onDrop={() => dropOnRule(i)}
                    />
                  </motion.div>

                  <Gap
                    index={i + 1}
                    open={drag !== null && overGap === i + 1}
                    dragging={drag !== null}
                    label={i < rules.length - 1 ? 'no match' : undefined}
                    onOver={() => setOverGap(i + 1)}
                    onLeave={() => setOverGap(null)}
                    onDrop={() => dropOnGap(i + 1)}
                    onInsert={() => insertRule(i + 1)}
                  />
                </div>
              ))}

              <div className="bwb__node is-default">
                <span className="bwb__idx" aria-hidden>
                  ⌄
                </span>
                <div className="bwb__nbody">
                  <div className="bwb__nname">Everyone else</div>
                  <div className="bwb__nmeta">Nothing above matched · cannot be reordered</div>
                </div>
                <div className="bwb__nright">
                  <DecisionChip decision="1fa" size="sm" />
                </div>
              </div>
            </div>

            <div className="bwb__floor">
              <span>Top to bottom · first match wins</span>
              <span className="bwb__zoom">
                <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(60, z - 10))}>
                  <Minus size={14} strokeWidth={2} />
                </button>
                <span>{zoom}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(140, z + 10))}>
                  <Plus size={14} strokeWidth={2} />
                </button>
              </span>
            </div>
          </div>
        </section>

        <Inspector
          draft={draft}
          index={sel}
          rule={selRule}
          diagnostics={diagnostics}
          onPatch={(p) => sel !== null && patchRule(sel, p)}
          onGoTo={setSel}
        />
      </div>
    </div>
  )
}

/* --- Zone 1 · palette -------------------------------------------------------- */

function Palette({
  onActivate,
  onDragItem,
  onDragEnd,
  dragging,
}: {
  onActivate: (i: DragItem) => void
  onDragItem: (i: DragItem) => void
  onDragEnd: () => void
  dragging: DragItem | null
}) {
  const store = useBrand()
  const [q, setQ] = useState('')

  const conditions = useMemo(() => {
    const hit = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase())
    const groups = new Map<string, typeof CONDITION_CATALOGUE>()
    for (const c of CONDITION_CATALOGUE) {
      if (METHOD_GROUPS.has(c.group)) continue
      if (!hit(c.label) && !hit(c.group)) continue
      if (!groups.has(c.group)) groups.set(c.group, [])
      groups.get(c.group)!.push(c)
    }
    return [...groups.entries()]
  }, [q])

  const outcomes = OUTCOMES.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()))
  const objects = useMemo(() => {
    const hit = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase())
    return {
      zones: store.zones.filter((z) => hit(z.name)),
      postures: store.fingerprints.filter((p) => hit(p.name)),
    }
  }, [q, store.zones, store.fingerprints])

  return (
    <aside className="bwb__palette" aria-label="Add to policy">
      <div className="bwb__psearch">
        <Search size={14} strokeWidth={1.9} aria-hidden />
        <input
          type="text"
          value={q}
          placeholder="Search conditions…"
          aria-label="Search the palette"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bwb__pscroll">
        <section className="bwb__pgroup">
          <h3>
            Outcomes <em>drop on a rule</em>
          </h3>
          {outcomes.map((o) => (
            <PaletteItem
              key={o.id}
              className={`is-${DEC_KEY[o.id]}`}
              icon={o.id === 'deny' ? ShieldAlert : o.id === '2fa' ? ShieldCheck : Users}
              name={o.label}
              meta={o.sub}
              item={{ kind: 'outcome', decision: o.id }}
              {...{ onActivate, onDragItem, onDragEnd, dragging }}
            />
          ))}
        </section>

        {conditions.map(([group, list]) => (
          <section className="bwb__pgroup" key={group}>
            <h3>
              {group} <em>{list.length}</em>
            </h3>
            {list.map((c) => (
              <PaletteItem
                key={c.id}
                icon={GROUP_ICON[c.group] ?? ListFilter}
                name={c.label}
                meta={c.valueKind === 'zone' ? 'library' : undefined}
                title={c.hint}
                item={{ kind: 'condition', typeId: c.id }}
                {...{ onActivate, onDragItem, onDragEnd, dragging }}
              />
            ))}
          </section>
        ))}

        {(objects.zones.length > 0 || objects.postures.length > 0) && (
          <section className="bwb__pgroup">
            <h3>
              Library <em>reusable</em>
            </h3>
            {objects.zones.map((z) => (
              <PaletteItem
                key={z.id}
                icon={Globe}
                name={z.name}
                meta={z.usedIn ? `${z.usedIn} uses` : undefined}
                title={`Adds a Network Zone condition set to ${z.name}`}
                item={{ kind: 'condition', typeId: 'zone' }}
                {...{ onActivate, onDragItem, onDragEnd, dragging }}
              />
            ))}
            {objects.postures.map((p) => (
              <PaletteItem
                key={p.id}
                icon={MonitorSmartphone}
                name={p.name}
                title={`Adds a Device Posture condition set to ${p.name}`}
                item={{ kind: 'condition', typeId: 'fingerprint' }}
                {...{ onActivate, onDragItem, onDragEnd, dragging }}
              />
            ))}
          </section>
        )}

        {conditions.length === 0 && outcomes.length === 0 && (
          <p className="bwb__pempty">Nothing matches “{q}”.</p>
        )}
      </div>
    </aside>
  )
}

function PaletteItem({
  icon: Ico,
  name,
  meta,
  title,
  item,
  className = '',
  onActivate,
  onDragItem,
  onDragEnd,
  dragging,
}: {
  icon: LucideIcon
  name: string
  meta?: string
  title?: string
  item: DragItem
  className?: string
  onActivate: (i: DragItem) => void
  onDragItem: (i: DragItem) => void
  onDragEnd: () => void
  dragging: DragItem | null
}) {
  const isMe =
    dragging !== null &&
    ((dragging.kind === 'condition' && item.kind === 'condition' && dragging.typeId === item.typeId) ||
      (dragging.kind === 'outcome' && item.kind === 'outcome' && dragging.decision === item.decision))

  return (
    <button
      type="button"
      title={title}
      draggable
      className={`bwb__pitem ${className} ${isMe ? 'is-dragging' : ''}`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        onDragItem(item)
      }}
      onDragEnd={onDragEnd}
      onClick={() => onActivate(item)}
    >
      <span className="bwb__pico" aria-hidden>
        <Ico size={14} strokeWidth={1.8} />
      </span>
      <span className="bwb__pname">{name}</span>
      {meta && <span className="bwb__pmeta">{meta}</span>}
    </button>
  )
}

/* --- Zone 2 · the gap between rules ------------------------------------------ */

function Gap({
  open,
  dragging,
  label,
  onOver,
  onLeave,
  onDrop,
  onInsert,
}: {
  index: number
  open: boolean
  dragging: boolean
  label?: string
  onOver: () => void
  onLeave: () => void
  onDrop: () => void
  onInsert: () => void
}) {
  return (
    <div
      className={`bwb__link ${open ? 'is-open' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        onOver()
      }}
      onDragLeave={onLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {label && !open && <span className="bwb__linklabel">{label}</span>}
      {/* Visible only while something is in flight — an always-on dashed box
          between every rule would be five affordances for one action. */}
      {dragging && (
        <span className="bwb__drop">
          <span>Insert here</span>
        </span>
      )}
      {!dragging && (
        <button type="button" className="bwb__gapadd" aria-label="Insert a rule here" onClick={onInsert}>
          <Plus size={11} strokeWidth={2.6} />
        </button>
      )}
    </div>
  )
}

/* --- Zone 2 · rule node ------------------------------------------------------ */

function RuleNode({
  rule,
  index,
  selected,
  shadowed,
  isDropTarget,
  onSelect,
  onToggle,
  onRemove,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onOver,
  onLeave,
  onDrop,
}: {
  rule: Rule
  index: number
  selected: boolean
  shadowed: boolean
  isDropTarget: boolean
  onSelect: () => void
  onToggle: (v: boolean) => void
  onRemove: () => void
  onDuplicate: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onOver: () => void
  onLeave: () => void
  onDrop: () => void
}) {
  /* The audience line that used to sit here is gone — see the readout above the
     flow. `store` went with it: the node reads nothing from the tenant now, and
     the chips below name condition TYPES, which come from the catalogue. */

  /* Flattened deliberately, and only this far. The chips are a glance, not a
     reading of the rule: they name which fields are involved, and the count of
     alternatives says whether that list is one set or several. Printing the
     leaves as though they were a single AND-run is the exact misreading the
     card model exists to stop, so the alternatives chip is not optional
     decoration. The full shape is in the inspector. */
  const clauses = leaves(rule.when)

  return (
    <div
      className={`bwb__node ${selected ? 'is-on' : ''} ${rule.enabled ? '' : 'is-off'} ${
        isDropTarget ? 'is-drop' : ''
      }`}
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault()
        onOver()
      }}
      onDragLeave={onLeave}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop()
      }}
    >
      <span
        className="bwb__grip"
        draggable
        aria-hidden
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStart()
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} strokeWidth={1.8} />
      </span>
      <span className="bwb__idx">{index + 1}</span>

      <div className="bwb__nbody">
        <div className="bwb__nname">{rule.name}</div>
        <div className="bwb__nchips">
          {rule.when.cards.length === 0 ? (
            <span className="bwb__nchip is-any">matches everyone</span>
          ) : (
            <>
              {clauses.slice(0, 3).map((c) => (
                <span className="bwb__nchip" key={c.id}>
                  {conditionType(c.typeId).label}
                </span>
              ))}
              {clauses.length > 3 && <span className="bwb__nchip">+{clauses.length - 3}</span>}
              {rule.when.cards.length > 1 && (
                <span className="bwb__nchip is-any">{rule.when.cards.length} alternatives</span>
              )}
            </>
          )}
        </div>
        <div className="bwb__nmeta">
          ≈{rule.matchEstimate.toLocaleString()} users
          {shadowed && <em className="bwb__nwarn"> · shadows a rule below</em>}
        </div>
      </div>

      <div className="bwb__nright">
        <DecisionChip decision={rule.decision} size="sm" />
        <div className="bwb__nacts" onClick={(e) => e.stopPropagation()}>
          <Toggle checked={rule.enabled} onChange={onToggle} label={`Enable ${rule.name}`} size="sm" />
          <button type="button" aria-label={`Duplicate ${rule.name}`} title="Duplicate" onClick={onDuplicate}>
            <Copy size={13} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="is-danger"
            aria-label={`Delete ${rule.name}`}
            title="Delete"
            onClick={onRemove}
          >
            <Trash2 size={13} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* --- Zone 3 · inspector ------------------------------------------------------ */

function Inspector({
  draft,
  index,
  rule,
  diagnostics,
  onPatch,
  onGoTo,
}: {
  draft: Policy
  index: number | null
  rule?: Rule
  diagnostics: ReturnType<typeof diagnose>
  onPatch: (p: Partial<Rule>) => void
  onGoTo: (i: number) => void
}) {
  const store = useBrand()

  if (index === null || !rule) {
    return (
      <aside className="bwb__inspect">
        <div className="bwb__ihead">
          <h2>Inspector</h2>
        </div>
        {/* The one state a blank panel teaches nothing about. */}
        <div className="bwb__iempty">
          <MousePointerClick size={26} strokeWidth={1.4} aria-hidden />
          <strong>Nothing selected</strong>
          <span>Pick a rule on the canvas to edit it, or drag something from the palette to start one.</span>
        </div>
      </aside>
    )
  }

  const impact = impactOf(draft, index, store.groups, undefined, store.users)
  /* Rule-scoped only, said out loud rather than left to `ruleIndex === index`
     doing it by accident. Policy-scoped findings carry -1 and are about the
     audience and the app binding — neither of which this panel edits, and both
     of which belong to the whole policy rather than to whichever rule happens
     to be selected. They are reported in v4. */
  const mine = diagnostics.filter((d) => d.scope === 'rule' && d.ruleIndex === index)

  return (
    <aside className="bwb__inspect">
      <div className="bwb__ihead">
        <span className="bwb__idx">{index + 1}</span>
        <h2>{rule.name}</h2>
      </div>

      <div className="bwb__iscroll">
        <section className="bwb__isec">
          <label className="bwb__ilabel" htmlFor="wb-rname">
            Rule name
          </label>
          <input
            id="wb-rname"
            className="bwb__iinput"
            value={rule.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </section>

        <section className="bwb__isec">
          <span className="bwb__ilabel">Outcome</span>
          <div className="bwb__outcomes">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`bwb__outcome is-${DEC_KEY[o.id]} ${rule.decision === o.id ? 'is-on' : ''}`}
                aria-pressed={rule.decision === o.id}
                onClick={() => onPatch({ decision: o.id })}
              >
                <strong>{o.label}</strong>
                <em>{o.sub}</em>
              </button>
            ))}
          </div>
        </section>

        {/* The condition editor was here: a row per condition with an operator
            select and a delete button, over the flat `rule.conditions` array.

            It is a readout now. A WHEN is a disjunction of cards, and a flat
            list of rows cannot say which conditions are required together —
            rendering `(zone and time) or device` as three rows in a column
            prints a rule that catches different people than the one that runs,
            which is worse than not editing it here at all. Rebuilding it as a
            card editor would be a fourth composer to keep in step with v4's,
            and this version's whole argument is drag-onto-a-target, which under
            cards needs a drop target per card — new interaction design, not a
            port. So: the shape is shown, the hand-off is a button, and the
            palette still appends into the first card. */}
        <WhenReadout rule={rule} onEditInV4={() => store.go({ name: 'builder', policyId: draft.id })} />

        <section className="bwb__isec">
          <span className="bwb__ilabel">Impact</span>
          <div className="bwb__impact">
            <div>
              <Counter value={impact.matches} />
              <span>Expected to match</span>
            </div>
            <div>
              <Counter value={impact.audience} />
              <span>In scope</span>
            </div>
          </div>
          {/* basis is the honesty flag on `matches` — exact when the rule has
              no conditions, estimate otherwise. Printing the number without it
              would present a guess as a count. */}
          <p className="bwb__basis">
            <span className={`bwb__basistag is-${impact.basis}`}>{impact.basis}</span>
            {impact.fallsTo
              ? ` If this stops matching, rule ${impact.fallsTo.index + 1} (${impact.fallsTo.name}) takes over.`
              : ' If this stops matching, the default rule takes over.'}
          </p>
        </section>

        {mine.length > 0 && (
          <section className="bwb__isec">
            <span className="bwb__ilabel">Checks <em>{mine.length}</em></span>
            {mine.map((d) => (
              <div key={d.id} className={`bwb__check is-${d.severity}`}>
                <strong>{d.title}</strong>
                <p>{d.detail}</p>
                {d.relatedIndex !== undefined && (
                  <button type="button" onClick={() => onGoTo(d.relatedIndex!)}>
                    Go to rule {d.relatedIndex + 1}
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}

/* --- Zone 3 · the WHEN, read rather than edited -------------------------------

   `predicateParts` rather than a rendering of `rule.when` written here.

   Six versions of "condition, joiner, condition" were collapsed into
   predicate-prose for a reason that applies to this panel exactly: the sentence
   next to a rule and the rule that runs must not be able to disagree, and every
   extra renderer is another chance for them to. Parts rather than
   `predicateSentence` only because the `and` and the `OR` want to be muted
   elements rather than words in a paragraph — the text of every clause still
   comes from the one place.
   -------------------------------------------------------------------------- */

function WhenReadout({ rule, onEditInV4 }: { rule: Rule; onEditInV4: () => void }) {
  const resolve = useNameLookup()
  const cards = predicateParts(rule.when, resolve)
  const total = cards.reduce((n, k) => n + k.clauses.length, 0)

  return (
    <section className="bwb__isec">
      <span className="bwb__ilabel">
        When it applies <em>{total}</em>
      </span>

      {cards.length === 0 ? (
        <p className="bwb__ihint">
          No conditions, so this rule matches every sign-in that reaches it. Drag one from the
          palette to narrow it.
        </p>
      ) : (
        <ul className="bwb__conds">
          {cards.map((k, ci) => (
            <li key={k.id}>
              {/* Not a control, here least of all. Between two cards the
                  relationship is fixed by the shape of the rule, and this
                  version cannot change the shape. */}
              {ci > 0 && (
                <div className="bwb__ilabel" style={{ marginBottom: 6 }} aria-hidden>
                  OR
                </div>
              )}
              {/* A lone unnamed card gets no heading. "Alternative A" over a
                  rule that has no alternative is a container announcing itself,
                  and the whole point of the letters is to tell two of them
                  apart. A label the author wrote always shows: it is the one
                  thing the predicate itself cannot say. */}
              {(cards.length > 1 || k.label) && (
                <div className="bwb__condname" style={{ whiteSpace: 'normal' }}>
                  {k.label ?? `Alternative ${k.letter}`}
                </div>
              )}
              <p className="bwb__condhint">
                {k.clauses.map((cl, i) => (
                  <Fragment key={cl.id}>
                    {i > 0 && <span style={{ color: 'var(--text-muted)' }}> and </span>}
                    {cl.text}
                  </Fragment>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Said plainly, because the alternative is a panel that looks broken.

          Somebody who drags a condition in and then looks for the operator
          select that used to be here deserves the actual reason it is gone, not
          a disabled control or a silence. */}
      <p className="bwb__ihint" style={{ marginTop: 10 }}>
        Conditions are grouped now: everything in one alternative must be true, and any one
        alternative is enough. This version's editor cannot express groups, so it shows them and
        hands editing over.
      </p>

      <div style={{ marginTop: 8 }}>
        {/* v4 owns the composer. The design switcher that chooses between the
            builders is state inside BuilderPage, so this lands on v4 from
            anywhere except the builder itself — closing that gap means lifting
            the switcher, which is BuilderPage's call and not this file's. */}
        <Button variant="secondary" size="sm" onClick={onEditInV4}>
          Edit in v4
        </Button>
      </div>
    </section>
  )
}
