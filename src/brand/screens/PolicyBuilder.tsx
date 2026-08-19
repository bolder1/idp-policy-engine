import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { diagnose, impactOf, shadowedBy, type Diagnostic, type Impact } from './diagnostics'
import { describeZone } from './zone-validation'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Boxes,
  Globe,
  Home,
  Info,
  KeyRound,
  MonitorSmartphone,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
  UserCheck,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { AppLogo } from './../logos/AppLogo'
import {

  Badge,
  Button,
  Callout,
  Chip,
  Counter,
  DecisionChip,
  Drawer,
  Modal,
  Toggle,
} from '../kit'
import {
  CONDITION_CATALOGUE,
  DECISION_CAPTION,
  DECISION_LABEL,
  blankRule,
  conditionType,
  cond,
  decisionLog,
  enforces,
  type AccessDecision,
  type Condition,
  type Policy,
  type Rule,
  ipSectionEmpty,
  locationEmpty,
} from '../data'
import { useBrand } from '../store'
import './builder-canvas.css'
import './builder-branch.css'
import './builder-panels.css'

/* -----------------------------------------------------------------------------
   Policy builder — a canvas tool, not a page with a list.

   The model is untouched: a policy holds ordered rules, they evaluate top to
   bottom, the first match wins, and a pinned default rule catches the rest.
   Per-pair AND/OR joiners stay, because that is what the engine does today.

   The layout is the one every flow tool converges on: the diagram in the
   middle, a contextual inspector on the right, chrome out of the way. Our
   evaluation really is a diagram — each rule branches right on match to its
   outcome and falls through on no-match — so the canvas draws exactly that
   waterfall and nothing it cannot honour. No free-form graph: the engine has
   one spine, so the canvas has one spine.

   Running a test animates a sign-in down that spine — each rule it passes says
   why it did not stop there, and the one that matches lands the outcome. The
   trace comes from the same walk the test drawer computes, so the animation
   cannot disagree with the verdict.
   -------------------------------------------------------------------------- */

/** One visited node in an animated test run. */
interface TraceStep {
  idx: number
  kind: 'off' | 'miss'
}
interface Trace {
  steps: TraceStep[]
  /** Rule index that matched, or null when the walk lands on the default rule. */
  hit: number | null
}

export function PolicyBuilder({ policyId }: { policyId: string }) {
  const store = useBrand()
  const original = store.policyById(policyId)
  const [draft, setDraft] = useState<Policy | null>(original ?? null)
  // -1 is a real state: nothing selected, the inspector shows the policy.
  const [selected, setSelected] = useState(-1)
  const [addingCondition, setAddingCondition] = useState(false)
  const [review, setReview] = useState(false)
  const [testing, setTesting] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [appsOpen, setAppsOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  /* Two readings of the same rules. Spine is compact and scales; Branch draws
     the fork each rule really makes — match goes right to its outcome, no-match
     carries on down — and lets the IF and THEN be edited on the node itself.
     One data shape, two views: nothing about the policy changes when you flip. */
  const [canvasView, setCanvasView] = useState<'spine' | 'branch'>('spine')
  /* Which rule is in the air, and where it would land. Held here rather than in
     the node so the whole spine can react — the gap opens where the rule will
     go, which is the only honest preview of a reorder that rewrites the logic. */
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  /* Hovering a rule shows what it costs the rules beneath it. First-match-wins
     hides this completely: a broad rule high up silently kills specific rules
     below, and until now the only place that was said was a sentence in the
     Checks panel, about a rule you might not be looking at. */
  const [hovered, setHovered] = useState(-1)
  const shadowed = useMemo(
    () => (hovered >= 0 && draft ? shadowedBy(draft, hovered) : []),
    [hovered, draft],
  )
  /* Which pane the narrow inspector is showing. Never switched automatically:
     yanking the panel to Checks while someone is typing is how a helpful
     feature becomes an obstacle. */
  const [pane, setPane] = useState<'edit' | 'impact' | 'checks'>('edit')

  /* Recomputed from the draft on every edit, so the panel can never disagree
     with the canvas — the same discipline as the plain-English summary. */
  const checks = useMemo(
    () => (draft ? diagnose(draft, store.groups, store.hooks) : []),
    [draft, store.groups],
  )
  /* The split is the user's to shape. Three working modes fall out of the
     width — roughly 20/40/60% of the container: slim (a nested, accordion
     inspector), mid (the standard editor), wide (everything laid flat with
     room to breathe). Thresholds are on the panel's own pixels, not the
     window, so the same drag position means the same mode everywhere. */
  const [inspectW, setInspectW] = useState(420)
  /* Measured, not requested. The grid column can be squeezed below the width we
     asked for when the window is small, and a panel that renders at 254px while
     believing it is 420px lays out for space it does not have. */
  const workRef = useRef<HTMLDivElement>(null)

  /* Clamped against the space that actually exists, so the panel never claims a
     width the window cannot give it — a panel rendering at 254px while
     believing it is 420px lays out for room it does not have. Recomputed on
     window resize rather than by observing the element: ResizeObserver is the
     obvious tool, but it does not fire reliably in every embedded browser, and
     a density ladder that silently stops working is worse than a simpler one
     that always does. The canvas keeps CANVAS_MIN whatever happens. */
  const CANVAS_MIN = 360
  const clamp = (want: number, avail: number) =>
    Math.min(760, Math.max(264, Math.min(want, Math.max(264, avail - CANVAS_MIN))))

  const [avail, setAvail] = useState(1200)
  useEffect(() => {
    const measure = () => setAvail(workRef.current?.getBoundingClientRect().width ?? window.innerWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const effectiveW = clamp(inspectW, avail)
  const mode: 'slim' | 'mid' | 'wide' = effectiveW < 350 ? 'slim' : effectiveW < 580 ? 'mid' : 'wide'

  /* One AbortController owns every listener and the body styles, so a cancelled
     pointer (touch interrupted mid-drag) or an unmount tears the whole thing
     down. Without pointercancel, an interrupted drag left the page stuck with
     col-resize and text selection disabled for the rest of the session. */
  const resizing = useRef<AbortController | null>(null)
  useEffect(() => () => endResize(), [])

  function endResize() {
    resizing.current?.abort()
    resizing.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    endResize()
    const ac = new AbortController()
    resizing.current = ac
    const startX = e.clientX
    const startW = inspectW
    /* Measured at pointer-down, not at mount. The value taken on mount goes
       stale the moment anything else reflows — the nav collapsing, the window
       resizing — and a stale ceiling silently caps the drag short of the width
       the user is asking for. */
    const room = workRef.current?.getBoundingClientRect().width ?? avail
    setAvail(room)
    const opts = { signal: ac.signal }
    window.addEventListener(
      'pointermove',
      (ev: PointerEvent) => setInspectW(clamp(startW + (startX - ev.clientX), room)),
      opts,
    )
    window.addEventListener('pointerup', endResize, opts)
    window.addEventListener('pointercancel', endResize, opts)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  /* Slim inspector nests IF/THEN into an accordion — one open at a time. In
     mid and wide the state is ignored and both stay flat. */
  const [openSec, setOpenSec] = useState<'if' | 'then'>('if')
  /* The reusable-objects shelf is its own dock at the inspector's foot —
     always reachable, closable, and independent of what is being edited. */
  const [dockOpen, setDockOpen] = useState(true)
  /** True while a dock row is being dragged over the IF block. */
  const [dropHot, setDropHot] = useState(false)
  const [trace, setTrace] = useState<Trace | null>(null)
  /* Which step of the trace the animation has reached. Counts through
     trace.steps and then one more, which is the landing. */
  const [flight, setFlight] = useState(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!trace) return
    const total = trace.steps.length + 1

    /* Reduced motion means no animation — it does not mean the same wait with
       the movement removed. This was a plain setInterval, which neither
       MotionConfig nor a CSS media query can reach, so a user who asked for
       less motion got no animation AND the full three seconds: strictly the
       worst of both. Jump straight to the answer instead. */
    if (reducedMotion) {
      setFlight(total)
      return
    }

    setFlight(0)
    /* Budget the whole walk, not each step. At a fixed 520ms a five-rule policy
       cost 3.1s and a twelve-rule one would cost 6.8 — the cost of reading the
       result grew with the size of the thing you were reading. */
    const per = Math.min(180, 900 / total)
    const t = setInterval(
      () =>
        setFlight((f) => {
          if (f + 1 >= total) {
            clearInterval(t)
            return total
          }
          return f + 1
        }),
      per,
    )
    return () => clearInterval(t)
  }, [trace, reducedMotion])

  if (!draft || !original) {
    return (
      <div className="bpage">
        <p>That policy no longer exists.</p>
        <Button onClick={() => store.go({ name: 'policies' })}>Back to policies</Button>
      </div>
    )
  }

  const rule: Rule | undefined = draft.rules[selected]
  const changes = diffPolicies(original, draft)

  const totalMatch = draft.rules.reduce((n, r) => Math.max(n, r.matchEstimate), 0)

  /* Scoped to the rule in hand, so the badge counts what you are looking at
     rather than the whole policy — a "3" that turns out to be about other
     rules is worse than no badge. */
  const ruleChecks = checks.filter((d) => d.ruleIndex === selected)
  const impact = rule ? impactOf(draft, selected, store.groups, original) : null

  function update(next: Partial<Policy>) {
    setDraft({ ...draft!, ...next })
    // Any edit invalidates a played trace — the walk it showed no longer exists.
    setTrace(null)
  }

  function updateRule(idx: number, patch: Partial<Rule>) {
    const rules = [...draft!.rules]
    rules[idx] = { ...rules[idx], ...patch }
    update({ rules })
  }

  function addRule() {
    const rules = [...draft!.rules, blankRule(`Rule ${draft!.rules.length + 1}`)]
    update({ rules })
    setSelected(rules.length - 1)
  }

  /** Insert at a position on the spine — the canvas offers this between nodes. */
  function insertRule(at: number) {
    const rules = [...draft!.rules]
    rules.splice(at, 0, blankRule(`Rule ${rules.length + 1}`))
    update({ rules })
    setSelected(at)
  }

  function removeRule(idx: number) {
    const rules = draft!.rules.filter((_, i) => i !== idx)
    update({ rules })
    setSelected((s) => Math.max(0, Math.min(s, rules.length - 1)))
  }

  function moveRule(idx: number, dir: -1 | 1) {
    reorder(idx, idx + dir)
  }

  /* Order is the logic here — first match wins, so moving a rule rewrites what
     the policy does. The move itself is one splice; what makes it safe is that
     it lands in the same draft/diff/discard path as every other edit, so the
     toolbar immediately shows an unsaved change naming it. */
  function reorder(from: number, to: number) {
    if (to < 0 || to >= draft!.rules.length || from === to) return
    const rules = [...draft!.rules]
    const [item] = rules.splice(from, 1)
    rules.splice(to, 0, item)
    update({ rules })
    setSelected(to)
  }

  /* One routine behind both gestures: clicking a dock row's attach action and
     dropping the row onto the IF block do exactly the same thing. */
  function attachObject(kind: string, id: string) {
    if (!rule) return
    if (kind === 'zones') {
      updateRule(selected, { conditions: [...rule.conditions, cond('zone', 'in zone', [id])] })
      store.showToast(`${store.zones.find((z) => z.id === id)?.name} attached as a condition`)
    } else if (kind === 'fingerprint') {
      updateRule(selected, {
        conditions: [...rule.conditions, cond('fingerprint', 'recognised by', [id])],
      })
      store.showToast(`${store.fingerprints.find((p) => p.id === id)?.name} attached as a condition`)
    } else if (kind === 'methods') {
      // Carry the set's methods onto the rule. Without this, attaching set A
      // and set B produced byte-identical rules while the toast claimed
      // otherwise — the action looked like it worked and configured nothing.
      const set = store.methodSets.find((m) => m.id === id)
      updateRule(selected, {
        decision: '2fa',
        secondFactor: 'specific',
        secondFactorMethods: set?.methods ?? [],
      })
      store.showToast(`${set?.name} set as the 2FA method set`)
    }
  }

  function addCondition(typeId: string) {
    if (!rule) return
    const t = conditionType(typeId)
    const value =
      t.valueKind === 'zone'
        ? [store.zones[0].id]
        : t.valueKind === 'fingerprint'
          ? [store.fingerprints[0].id]
          : t.options
            ? [t.options[0]]
            : t.valueKind === 'time'
              ? ['09:00', '17:00']
              : ['']
    updateRule(selected, { conditions: [...rule.conditions, cond(typeId, t.operators[0], value)] })
    setAddingCondition(false)
  }

  return (
    <div className="bpage bbuilder">
      {/* One toolbar, not three stacked headers. The sentence and the reach
          live in the inspector's overview — repeating them up here cost 130px
          of the canvas and said nothing new. */}
      <header className="bbuilder__bar">
        <button
          type="button"
          className="bbuilder__back"
          onClick={() => store.go({ name: 'policies' })}
          aria-label="Back to policies"
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <input
          className="bbuilder__name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Policy name"
        />
        <Badge tone="info">{draft.type}</Badge>

        {/* The floating save bar is gone — it parked itself over the canvas
            tools. Dirtiness lives here now, next to the action that resolves it. */}
        <AnimatePresence>
          {changes.length > 0 && (
            <motion.span
              className="bbuilder__dirty"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <em>{changes.length}</em> unsaved
              <button
                type="button"
                onClick={() => {
                  setDraft(original)
                  setTrace(null)
                }}
              >
                Discard
              </button>
            </motion.span>
          )}
        </AnimatePresence>

        <div className="bbuilder__baracts">
          <div className="bviewswitch" role="tablist" aria-label="Canvas view">
            <button
              role="tab"
              aria-selected={canvasView === 'spine'}
              className={canvasView === 'spine' ? 'is-on' : ''}
              onClick={() => setCanvasView('spine')}
              title="Compact list — scales to many rules"
            >
              Spine
            </button>
            <button
              role="tab"
              aria-selected={canvasView === 'branch'}
              className={canvasView === 'branch' ? 'is-on' : ''}
              onClick={() => setCanvasView('branch')}
              title="Draws each rule's fork — edit conditions on the node"
            >
              Branch
            </button>
          </div>
          <Button variant="ghost" onClick={() => setLogOpen(true)}>
            Decision log
          </Button>
          <Button onClick={() => setAppsOpen(true)}>
            Assign apps ({draft.allApps ? 'all' : draft.appIds.length})
          </Button>
          <Button variant="brand" onClick={() => setReview(true)}>
            Review &amp; enforce
          </Button>
        </div>
      </header>

      <div className="bbuilder__work" ref={workRef} style={{ ['--inspect-w' as string]: `${effectiveW}px` }}>
        {/* ---------------- canvas ---------------- */}
        <section
          className="bcanvas"
          aria-label="Evaluation order — top to bottom, first match wins"
          onClick={() => setSelected(-1)}
        >
          <div className="bcanvas__scroll">
            <div className="bcanvas__stage" style={{ zoom }}>
              <div className="bcanvas__start">
                <span className="bcanvas__startdot" aria-hidden />A user attempts to sign in
              </div>

              <LayoutGroup>
                {draft.rules.map((r, i) => {
                  const stepAt = trace?.steps.findIndex((s) => s.idx === i) ?? -1
                  const landed = trace !== null && flight > trace.steps.length
                  const anim =
                    trace === null
                      ? ''
                      : trace.hit === i && landed
                        ? // The landing lights up in its own outcome's colour —
                          // a matched Deny must never glow green.
                          `is-hit is-hit--${DEC_TONE[r.decision]}`
                        : stepAt === -1
                          ? ''
                          : flight === stepAt
                            ? 'is-eval'
                            : flight > stepAt
                              ? 'is-passed'
                              : ''
                  return (
                    <Fragment key={r.id}>
                      <SpineLink
                        label={i === 0 ? undefined : 'no match'}
                        onInsert={() => insertRule(i)}
                      />
                      <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 480, damping: 40 }}
                        className={`bdrag ${drag?.from === i ? 'is-lifted' : ''} ${
                          drag && drag.over === i && drag.from !== i
                            ? drag.from < i
                              ? 'is-under'
                              : 'is-over'
                            : ''
                        } ${shadowed.includes(i) ? 'is-shadowed' : ''} ${
                          hovered === i && shadowed.length > 0 ? 'is-shadowing' : ''
                        }`}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered((h) => (h === i ? -1 : h))}
                        onDragOver={(e) => {
                          if (!drag) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          if (drag.over !== i) setDrag({ ...drag, over: i })
                        }}
                        onDrop={(e) => {
                          if (!drag) return
                          e.preventDefault()
                          reorder(drag.from, i)
                          setDrag(null)
                        }}
                      >
                        {canvasView === 'spine' ? (
                          <FlowNode
                            rule={r}
                            index={i}
                            count={draft.rules.length}
                            selected={selected === i}
                            anim={anim}
                            passKind={stepAt >= 0 ? trace!.steps[stepAt].kind : 'miss'}
                            onSelect={() => setSelected(i)}
                            onToggle={(v) => updateRule(i, { enabled: v })}
                            onMove={(d) => moveRule(i, d)}
                            onRemove={() => removeRule(i)}
                            onDragStart={() => setDrag({ from: i, over: i })}
                            onDragEnd={() => setDrag(null)}
                          />
                        ) : (
                          <BranchNode
                            rule={r}
                            index={i}
                            count={draft.rules.length}
                            selected={selected === i}
                            anim={anim}
                            passKind={stepAt >= 0 ? trace!.steps[stepAt].kind : 'miss'}
                            onSelect={() => setSelected(i)}
                            onToggle={(v) => updateRule(i, { enabled: v })}
                            onMove={(d) => moveRule(i, d)}
                            onRemove={() => removeRule(i)}
                            onDecision={(d) => updateRule(i, { decision: d })}
                            onAddCondition={() => {
                              setSelected(i)
                              setAddingCondition(true)
                            }}
                            onRemoveCondition={(ci) =>
                              updateRule(i, { conditions: r.conditions.filter((_, x) => x !== ci) })
                            }
                            onJoiner={(ci) => {
                              const conditions = [...r.conditions]
                              conditions[ci] = {
                                ...conditions[ci],
                                joiner: conditions[ci].joiner === 'AND' ? 'OR' : 'AND',
                              }
                              updateRule(i, { conditions })
                            }}
                          />
                        )}
                      </motion.div>
                    </Fragment>
                  )
                })}
              </LayoutGroup>

              <SpineLink
                label={draft.rules.length > 0 ? 'no match' : undefined}
                onInsert={addRule}
                always
              />

              <div
                className={`bnode bnode--default ${
                  trace && trace.hit === null && flight > trace.steps.length ? 'is-hit is-hit--allow' : ''
                }`}
              >
                <div className="bnode__card">
                  <span className="bnode__idx bnode__idx--lock" aria-hidden>
                    <Home size={13} strokeWidth={1.8} />
                  </span>
                  <span className="bnode__body">
                    <strong>Default rule — everyone</strong>
                    <span className="bnode__cond">Catch-all · cannot be reordered</span>
                  </span>
                </div>
                <div className="bnode__branch" aria-hidden>
                  <span className="bnode__branchline" />
                  <span className="bnode__branchlabel">match</span>
                  <DecisionChip decision="1fa" size="sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Canvas chrome — pinned to the surface, not part of the diagram. */}
          <div className="bcanvas__hint">Top to bottom · first match wins</div>
          <div className="bcanvas__tools" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bcanvas__tool"
              onClick={() => setTesting(true)}
              title="Test this policy"
            >
              <Play size={14} strokeWidth={1.9} aria-hidden /> Test
            </button>
            <span className="bcanvas__zoom">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.65, Math.round((z - 0.1) * 10) / 10))}
                aria-label="Zoom out"
              >
                <ZoomOut size={14} strokeWidth={1.9} />
              </button>
              <button type="button" className="bcanvas__zoomval" onClick={() => setZoom(1)} title="Reset zoom">
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.3, Math.round((z + 0.1) * 10) / 10))}
                aria-label="Zoom in"
              >
                <ZoomIn size={14} strokeWidth={1.9} />
              </button>
            </span>
          </div>
        </section>

        {/* ---------------- split handle -------------
            Notion's grammar: an invisible corridor, a pill that fades in when
            the pointer is near, double-click to reset. Arrow keys work too. */}
        <div
          className="bsplit"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the inspector"
          aria-valuenow={inspectW}
          aria-valuemin={264}
          aria-valuemax={760}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setInspectW(420)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setInspectW((w) => Math.min(760, w + 24))
            if (e.key === 'ArrowRight') setInspectW((w) => Math.max(264, w - 24))
          }}
        >
          <span className="bsplit__pill" aria-hidden />
        </div>

        {/* ---------------- inspector ---------------- */}
        <aside
          className={`binspect binspect--${mode} ${rule ? `binspect--${rule.decision === 'deny' ? 'deny' : rule.decision === '2fa' ? 'mfa' : 'allow'}` : ''}`}
          data-mode={mode}
          onClick={(e) => e.stopPropagation()}
        >
          {/* The outcome breathes in the background — soft light in the
              decision's colour, so Deny feels different from Allow before you
              read a word. */}
          {rule && <span className="binspect__aura" aria-hidden />}

          {/* Narrow widths get tabs, because five stacked sections in one
              scroll makes the rule editor a needle in a haystack. Wide gets no
              tabs at all — keeping them when there is room to show everything
              would be the density ladder running backwards. */}
          {mode !== 'wide' && rule && (
            <div className="binspect__tabs" role="tablist" aria-label="Inspector panes">
              {(['edit', 'impact', 'checks'] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={pane === p}
                  className={pane === p ? 'is-on' : ''}
                  onClick={() => setPane(p)}
                >
                  {p === 'edit' ? 'Edit' : p === 'impact' ? 'Impact' : 'Checks'}
                  {p === 'checks' && ruleChecks.length > 0 && (
                    <em className={`binspect__badge is-${worstOf(ruleChecks)}`}>{ruleChecks.length}</em>
                  )}
                </button>
              ))}
            </div>
          )}

        <section className={`bedit ${mode !== 'wide' && rule && pane !== 'edit' ? 'is-hidden' : ''}`}>
          {!rule ? (
            draft.rules.length === 0 ? (
              <div className="bedit__empty">
                <h2>No rules yet</h2>
                <p>
                  Without a rule, every sign-in falls straight through to the default rule. Add the
                  first rule to start narrowing access.
                </p>
                <Button variant="brand" onClick={addRule}>
                  Add the first rule
                </Button>
              </div>
            ) : (
              /* Nothing selected — the inspector describes the policy, which is
                 what the old third column held plus the facts that used to be
                 scattered above the grid. */
              <div className="binspect__overview">
                <h2 className="u-label">Policy</h2>
                <p className="binspect__sentence">{summarize(draft, store)}</p>

                <dl className="binspect__facts">
                  <div>
                    <dt>Rules</dt>
                    <dd>{draft.rules.length}</dd>
                  </div>
                  <div>
                    <dt>Users reached</dt>
                    <dd>
                      <Counter value={totalMatch} />
                    </dd>
                  </div>
                  <div>
                    <dt>Protects</dt>
                    <dd>{draft.allApps ? 'All apps' : `${draft.appIds.length} apps`}</dd>
                  </div>
                </dl>

                <p className="binspect__nudge">Select a rule on the canvas to edit it.</p>
              </div>
            )
          ) : (
            <>
              {/* Minstrel-style head: what this node is, said with an icon tile
                  in the outcome's colour, and a way out. Sticky, so "which rule
                  am I editing" survives any amount of scrolling below it. */}
              <div className="bedit__head">
                <span className={`bedit__tile is-${rule.decision === 'deny' ? 'deny' : rule.decision === '2fa' ? 'mfa' : 'allow'}`} aria-hidden>
                  {rule.decision === 'deny' ? (
                    <ShieldAlert size={17} strokeWidth={1.8} />
                  ) : rule.decision === '2fa' ? (
                    <KeyRound size={17} strokeWidth={1.8} />
                  ) : (
                    <UserCheck size={17} strokeWidth={1.8} />
                  )}
                </span>
                <span className="bedit__headbody">
                  <input
                    className="bedit__title"
                    value={rule.name}
                    onChange={(e) => updateRule(selected, { name: e.target.value })}
                    aria-label="Rule name"
                  />
                  <span className="bedit__pos">
                    Rule {selected + 1} of {draft.rules.length} · evaluated {selected === 0 ? 'first' : `after rule ${selected}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="bedit__close"
                  onClick={() => setSelected(-1)}
                  aria-label="Close the rule editor"
                >
                  <X size={16} strokeWidth={1.9} />
                </button>
              </div>

              <div className="bedit__applies">
                <span className="u-label">Applies to</span>
                <div className="bedit__chips">
                  {rule.appliesTo.map((gid) => (
                    <Chip
                      key={gid}
                      removable={rule.appliesTo.length > 1}
                      onRemove={() => updateRule(selected, { appliesTo: rule.appliesTo.filter((g) => g !== gid) })}
                    >
                      {store.groupById(gid).name}
                      <em>{store.groupById(gid).memberCount}</em>
                    </Chip>
                  ))}
                  <select
                    className="bedit__addgroup"
                    aria-label="Add a group"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      updateRule(selected, { appliesTo: [...rule.appliesTo, e.target.value] })
                    }}
                  >
                    <option value="">+ Add group</option>
                    {store.groups
                      .filter((g) => !rule.appliesTo.includes(g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* ---- IF ---- */}
              <section
                className={`bblock ${dropHot ? 'is-drop' : ''}`}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-idp-object')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setDropHot(true)
                  }
                }}
                onDragLeave={() => setDropHot(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropHot(false)
                  try {
                    const { kind, id } = JSON.parse(e.dataTransfer.getData('application/x-idp-object'))
                    attachObject(kind, id)
                  } catch {
                    /* not ours */
                  }
                }}
              >
                <header
                  className={`bblock__head ${mode === 'slim' ? 'is-toggle' : ''}`}
                  onClick={mode === 'slim' ? () => setOpenSec('if') : undefined}
                >
                  <h3>
                    <span className="bblock__kw">If</span> these conditions match
                  </h3>
                  <span className="bblock__count">
                    <Counter value={rule.matchEstimate} /> users
                  </span>
                  {mode === 'slim' && (
                    <ChevronDown
                      className={`bblock__chev ${openSec === 'if' ? 'is-open' : ''}`}
                      size={15}
                      strokeWidth={1.9}
                      aria-hidden
                    />
                  )}
                </header>

                <AnimatePresence initial={false}>
                {(mode !== 'slim' || openSec === 'if') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                <div className="bblock__body">
                  {rule.conditions.length === 0 ? (
                    <div className="bcond__empty">
                      This rule has no conditions, so it matches every sign-in that reaches it. Add
                      a condition to narrow it.
                    </div>
                  ) : (
                    <div className="bcond__list">
                      {/* New cards draw themselves in — adding a condition is
                          the builder's most repeated act, and it should feel
                          like placing a piece, not refreshing a form. */}
                      <AnimatePresence mode="popLayout" initial={false}>
                        {rule.conditions.map((c, ci) => (
                          <motion.div
                            key={c.id}
                            layout
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
                            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                          >
                            <ConditionRow
                              condition={c}
                              index={ci}
                              onChange={(patch) => {
                                const conditions = [...rule.conditions]
                                conditions[ci] = { ...conditions[ci], ...patch }
                                updateRule(selected, { conditions })
                              }}
                              onRemove={() =>
                                updateRule(selected, { conditions: rule.conditions.filter((_, i) => i !== ci) })
                              }
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="bcond__addwrap">
                    <Button onClick={() => setAddingCondition(true)}>+ Add condition</Button>
                  </div>
                </div>
                </motion.div>
                )}
                </AnimatePresence>
              </section>

              {/* ---- THEN ---- */}
              <section className="bblock">
                <header
                  className={`bblock__head ${mode === 'slim' ? 'is-toggle' : ''}`}
                  onClick={mode === 'slim' ? () => setOpenSec('then') : undefined}
                >
                  <h3>
                    <span className="bblock__kw">Then</span> apply this outcome
                  </h3>
                  {mode === 'slim' && (
                    <ChevronDown
                      className={`bblock__chev ${openSec === 'then' ? 'is-open' : ''}`}
                      size={15}
                      strokeWidth={1.9}
                      aria-hidden
                    />
                  )}
                </header>
                <AnimatePresence initial={false}>
                {(mode !== 'slim' || openSec === 'then') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                <div className="bblock__body">
                  <div className="bdec">
                    {(['deny', '1fa', '2fa'] as AccessDecision[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`bdec__opt bdec__opt--${d} ${rule.decision === d ? 'is-on' : ''}`}
                        aria-pressed={rule.decision === d}
                        onClick={() => updateRule(selected, { decision: d })}
                      >
                        <span className="bdec__label">{DECISION_LABEL[d]}</span>
                        <span className="bdec__caption">{DECISION_CAPTION[d]}</span>
                      </button>
                    ))}
                  </div>

                  <AnimatePresence initial={false}>
                    {rule.decision !== 'deny' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="bfactors">
                          <div className="bfactors__row">
                            <span className="u-label">1st factor</span>
                            <div className="bx-tabs" role="radiogroup" aria-label="First factor">
                              {(['Password', 'Any', 'Specific'] as const).map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  role="radio"
                                  aria-checked={rule.firstFactor === f}
                                  className={`bx-tabs__tab ${rule.firstFactor === f ? 'is-on' : ''}`}
                                  onClick={() => updateRule(selected, { firstFactor: f })}
                                >
                                  <span className="bx-tabs__label">{f}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* "Specific" is a promise of a picker — without one
                              the choice configured nothing. */}
                          <AnimatePresence initial={false}>
                            {rule.firstFactor === 'Specific' && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="bfactors__row bfactors__row--sub">
                                  <span className="u-label">Method</span>
                                  <select
                                    aria-label="Specific first-factor method"
                                    value={rule.firstFactorMethod ?? FIRST_FACTOR_METHODS[0]}
                                    onChange={(e) =>
                                      updateRule(selected, { firstFactorMethod: e.target.value })
                                    }
                                  >
                                    {FIRST_FACTOR_METHODS.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {rule.decision === '2fa' && (
                            <div className="bfactors__row">
                              <span className="u-label">2nd factor</span>
                              <select
                                aria-label="Second factor"
                                value={rule.secondFactor}
                                onChange={(e) => updateRule(selected, { secondFactor: e.target.value as Rule['secondFactor'] })}
                              >
                                <option value="any">Any enabled method</option>
                                <option value="specific">Specific method(s)</option>
                                <option value="chain">Method chain</option>
                                <option value="preferred">User’s preferred method</option>
                              </select>
                            </div>
                          )}

                          {/* Each 2nd-factor choice opens its own configurator,
                              matching the prototype: a choice that configures
                              nothing is a label, not a setting. */}
                          {rule.decision === '2fa' && rule.secondFactor === 'specific' && (
                            <div className="bmeth" role="group" aria-label="Allowed second-factor methods">
                              {FIRST_FACTOR_METHODS.map((m) => {
                                const on = (rule.secondFactorMethods ?? []).includes(m)
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    className={`bmeth__chip ${on ? 'is-on' : ''}`}
                                    aria-pressed={on}
                                    onClick={() => {
                                      const cur = rule.secondFactorMethods ?? []
                                      updateRule(selected, {
                                        secondFactorMethods: on ? cur.filter((x) => x !== m) : [...cur, m],
                                      })
                                    }}
                                  >
                                    {m}
                                    {on && <em aria-hidden>×</em>}
                                  </button>
                                )
                              })}
                              {(rule.secondFactorMethods ?? []).length === 0 && (
                                <p className="bmeth__warn">Pick at least one method, or no one can complete this step.</p>
                              )}
                            </div>
                          )}

                          {rule.decision === '2fa' && rule.secondFactor === 'chain' && (
                            <div className="bchain">
                              {(rule.methodChain ?? ['TOTP Authenticator']).map((step, si, arr) => (
                                <Fragment key={si}>
                                  {si > 0 && (
                                    <span className="bchain__link" aria-hidden>
                                      <ChevronDown size={13} strokeWidth={2} />
                                    </span>
                                  )}
                                  <div className="bchain__step">
                                    <span className="bchain__idx">{si + 1}</span>
                                    <select
                                      aria-label={`Chain step ${si + 1}`}
                                      value={step}
                                      onChange={(e) => {
                                        const chain = [...arr]
                                        chain[si] = e.target.value
                                        updateRule(selected, { methodChain: chain })
                                      }}
                                    >
                                      {['Password', ...FIRST_FACTOR_METHODS].map((m) => (
                                        <option key={m} value={m}>
                                          {m}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="bchain__x"
                                      disabled={arr.length === 1}
                                      onClick={() =>
                                        updateRule(selected, { methodChain: arr.filter((_, i) => i !== si) })
                                      }
                                      aria-label={`Remove chain step ${si + 1}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </Fragment>
                              ))}
                              <button
                                type="button"
                                className="bchain__add"
                                onClick={() =>
                                  updateRule(selected, {
                                    methodChain: [...(rule.methodChain ?? ['TOTP Authenticator']), 'miniOrange Push'],
                                  })
                                }
                              >
                                + Add step
                              </button>
                              <p className="bchain__sum">
                                Chain: {(rule.methodChain ?? ['TOTP Authenticator']).join(' → ')} — completed in order, every step required.
                              </p>
                            </div>
                          )}

                          {rule.decision === '2fa' && rule.secondFactor === 'preferred' && (
                            <div className="bpref">
                              <div className="bfactors__row">
                                <span className="u-label">Fallback if no preferred method</span>
                                <select
                                  aria-label="Fallback method"
                                  value={rule.preferredFallback ?? FIRST_FACTOR_METHODS[0]}
                                  onChange={(e) => updateRule(selected, { preferredFallback: e.target.value })}
                                >
                                  {FIRST_FACTOR_METHODS.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <p className="bpref__note">Resolved at login time from the user’s own settings.</p>
                            </div>
                          )}

                          <div className="bfactors__checks">
                            <span className="u-label">Additional settings</span>
                            <label>
                              <input
                                type="checkbox"
                                checked={rule.rememberMfa}
                                onChange={(e) => updateRule(selected, { rememberMfa: e.target.checked })}
                              />
                              Remember MFA
                              {rule.rememberMfa && (
                                <span className="bfactors__days">
                                  <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={rule.rememberDays ?? 30}
                                    onChange={(e) =>
                                      updateRule(selected, { rememberDays: Number(e.target.value) || 30 })
                                    }
                                    aria-label="Days to remember MFA"
                                  />
                                  days
                                </span>
                              )}
                            </label>
                            {rule.rememberMfa && (
                              <label className="bfactors__nested">
                                <input
                                  type="checkbox"
                                  checked={rule.forceMfaEachLogin ?? false}
                                  onChange={(e) => updateRule(selected, { forceMfaEachLogin: e.target.checked })}
                                />
                                Force MFA on each login
                              </label>
                            )}
                            <label>
                              <input
                                type="checkbox"
                                checked={rule.allowDisable2fa}
                                onChange={(e) => updateRule(selected, { allowDisable2fa: e.target.checked })}
                              />
                              Allow end users to disable 2FA
                            </label>
                            {rule.allowDisable2fa && (
                              <p className="bfactors__warn">⚠ Users can opt out of their second factor.</p>
                            )}
                          </div>

                          <p className="bthen__ml">
                            The ML engine may escalate this decision based on behavioural signals. A
                            Deny is always final.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {rule.decision === 'deny' && (
                    <div className="bdec__note">
                      <Callout tone="negative" title="Blocked users see an access-denied page">
                        No MFA prompt, no alternate path. The ML engine may escalate other decisions
                        based on behavioural signals, but a Deny here is always final.
                      </Callout>
                    </div>
                  )}
                </div>
                </motion.div>
                )}
                </AnimatePresence>
              </section>

            </>
          )}
        </section>

        {/* ---- Reusable objects dock ----
            A block shelf, not an appendix. It keeps its place at the foot of
            the inspector whatever is being edited above it, opens and closes
            on its own header, and its rows attach straight into the selected
            rule. */}
        {/* Impact and Checks. At narrow widths they are the other two tabs; at
            wide they become a permanent rail beside the editor, which is the
            whole point of dragging the panel open. */}
        {rule && impact && (
          <div className={`binspect__rail ${mode === 'wide' ? 'is-rail' : 'is-pane'}`}>
            {(mode === 'wide' || pane === 'impact') && (
              <section className="bpanel">
                <h3 className="bpanel__head">Impact</h3>
                <ImpactPanel impact={impact} rule={rule} onGo={setSelected} />
              </section>
            )}
            {(mode === 'wide' || pane === 'checks') && (
              <section className="bpanel">
                <h3 className="bpanel__head">
                  Checks
                  {checks.length > 0 && (
                    <em className={`binspect__badge is-${worstOf(checks)}`}>{checks.length}</em>
                  )}
                </h3>
                {/* The whole policy at wide, where there is room for a worklist;
                    just this rule at narrow, where there is not. */}
                <ChecksPanel
                  items={mode === 'wide' ? checks : ruleChecks}
                  onGo={setSelected}
                  selected={selected}
                />
              </section>
            )}
          </div>
        )}

        <section className={`bdock ${dockOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="bdock__head"
            aria-expanded={dockOpen}
            onClick={() => setDockOpen((o) => !o)}
          >
            <Boxes size={15} strokeWidth={1.8} aria-hidden />
            Reusable objects
            <em>{store.zones.length + store.fingerprints.length + store.methodSets.length}</em>
            <ChevronDown
              className={`bdock__chev ${dockOpen ? 'is-open' : ''}`}
              size={15}
              strokeWidth={1.9}
              aria-hidden
            />
          </button>

          <AnimatePresence initial={false}>
            {dockOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="bdock__body">
                  {!rule && (
                    <p className="bdock__hint">
                      Select a rule on the canvas to attach one of these with a click.
                    </p>
                  )}
                  <ObjectsPanel
                    mode={mode}
                    canAttach={!!rule}
                    onAttachZone={(id) => attachObject('zones', id)}
                    onAttachFingerprint={(id) => attachObject('fingerprint', id)}
                    onUseMethods={(id) => attachObject('methods', id)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
        </aside>
      </div>

      {/* ---------------- overlays ---------------- */}
      <ConditionPicker open={addingCondition} onClose={() => setAddingCondition(false)} onPick={addCondition} />

      {/* The floating SaveBar is gone — it sat on top of the canvas tools.
          Its two jobs moved into the toolbar's dirty chip. */}

      <ReviewDialog
        open={review}
        onClose={() => setReview(false)}
        draft={draft}
        original={original}
        changes={changes}
        onConfirm={() => {
          store.savePolicy(draft)
          store.showToast(`${draft.name} saved`)
          setReview(false)
          store.go({ name: 'policies' })
        }}
        onStatus={(status) => update({ status })}
      />

      <TestDrawer open={testing} onClose={() => setTesting(false)} draft={draft} onTrace={setTrace} />
      <LogDrawer open={logOpen} onClose={() => setLogOpen(false)} name={draft.name} />
      <AppsDrawer
        open={appsOpen}
        onClose={() => setAppsOpen(false)}
        draft={draft}
        onChange={(ids) => update({ appIds: ids, allApps: false })}
      />
    </div>
  )
}

/* --- Canvas pieces ----------------------------------------------------------- */

const DEC_TONE: Record<AccessDecision, 'deny' | 'mfa' | 'allow'> = {
  deny: 'deny',
  '2fa': 'mfa',
  '1fa': 'allow',
}

/** The console's first-factor catalogue, in its order. */
const FIRST_FACTOR_METHODS = [
  'miniOrange Push',
  'TOTP Authenticator',
  'WebAuthn / FIDO2',
  'SMS / OTP',
  'Email OTP',
  'Hardware Token',
  'Security Questions',
]

/** A segment of the spine: the no-match line, with insert-here on hover.
    The insert is a diamond — the flowchart glyph for "a decision happens
    here", which is literally what inserting a rule at this point does. */
function SpineLink({
  label,
  onInsert,
  always,
}: {
  label?: string
  onInsert: () => void
  always?: boolean
}) {
  return (
    <div className={`bspine ${always ? 'bspine--always' : ''}`}>
      <span className="bspine__line" aria-hidden />
      {label && <span className="bspine__label">{label}</span>}
      <button
        type="button"
        className="bspine__add"
        onClick={(e) => {
          e.stopPropagation()
          onInsert()
        }}
        aria-label="Insert a rule here"
        title="Insert a rule here"
      >
        <Plus size={12} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  )
}

function FlowNode({
  rule: r,
  index,
  count,
  selected,
  anim,
  passKind,
  onSelect,
  onToggle,
  onMove,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  rule: Rule
  index: number
  count: number
  selected: boolean
  /** '' | 'is-eval' | 'is-passed' | 'is-hit' — the node's role in a played trace. */
  anim: string
  passKind: 'off' | 'miss'
  onSelect: () => void
  onToggle: (v: boolean) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const store = useBrand()
  const groups = r.appliesTo.includes('all')
    ? 'Everyone'
    : r.appliesTo.map((g) => store.groupById(g).name).join(', ')

  return (
    <div
      className={`bnode ${selected ? 'is-selected' : ''} ${r.enabled ? '' : 'is-off'} ${anim}`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      {/* A plain container, not role="button". It held the toggle and three
          real buttons, which ARIA forbids inside a button and which screen
          readers may swallow. The title below is the select affordance. */}
      <div className="bnode__card">
        {/* The index doubles as the grip. Only this handle starts a drag, so
            the card stays clickable and text stays selectable — the mistake is
            making the whole card draggable and losing both. */}
        <span
          className="bnode__idx"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            // Firefox refuses to start a drag without payload.
            e.dataTransfer.setData('text/plain', r.id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          title="Drag to change the evaluation order"
        >
          {index + 1}
        </span>
        {/* Icon tile in the outcome's colour — the Minstrel pattern. What the
            node does is readable from across the room, before any text. */}
        <span className={`bnode__tile is-${DEC_TONE[r.decision]}`} aria-hidden>
          {r.decision === 'deny' ? (
            <ShieldAlert size={16} strokeWidth={1.8} />
          ) : r.decision === '2fa' ? (
            <KeyRound size={16} strokeWidth={1.8} />
          ) : (
            <UserCheck size={16} strokeWidth={1.8} />
          )}
        </span>
        <span className="bnode__body">
          {/* The one focusable thing that selects the rule, and the only place
              the outcome is announced — the tile and the branch chip are both
              aria-hidden, so without this a screen reader never learns whether
              the rule denies, allows or challenges. */}
          <button
            type="button"
            className="bnode__select"
            aria-pressed={selected}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            <strong title={r.name}>{r.name}</strong>
            <span className="u-sr">
              — outcome: {DECISION_LABEL[r.decision]}, {r.enabled ? 'evaluating' : 'disabled'}
            </span>
          </button>
          <span className="bnode__chips">
            <span className="bnode__chip">
              {r.conditions.length === 0
                ? 'Always matches'
                : `${r.conditions.length} condition${r.conditions.length === 1 ? '' : 's'}`}
            </span>
            <span className="bnode__chip">
              ≈{r.matchEstimate.toLocaleString()} users
            </span>
          </span>
          <span className="bnode__meta" title={groups}>{groups}</span>
        </span>

        {/* Quiet until the node is the one being worked on. */}
        <span className="bnode__acts" onClick={(e) => e.stopPropagation()}>
          <Toggle size="sm" checked={r.enabled} label={`Enable ${r.name}`} onChange={onToggle} />
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${r.name} earlier`}>
            <ArrowUp size={13} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={`Move ${r.name} later`}
          >
            <ArrowDown size={13} strokeWidth={1.9} />
          </button>
          <button type="button" className="bnode__del" onClick={onRemove} aria-label={`Remove ${r.name}`}>
            <Trash2 size={13} strokeWidth={1.9} />
          </button>
        </span>

        {/* What the trace said as it went past. */}
        {anim === 'is-passed' && (
          <span className="bnode__verdict">{passKind === 'off' ? 'skipped — disabled' : 'no match'}</span>
        )}
        {/* startsWith, not equality — the landed class carries its outcome tone
            (`is-hit is-hit--deny`), so `=== 'is-hit'` was never true. */}
        {anim.startsWith('is-hit') && (
          <span className="bnode__verdict bnode__verdict--hit">matched — evaluation stops</span>
        )}
      </div>

      <div className="bnode__branch" aria-hidden>
        <span className="bnode__branchline" />
        <span className="bnode__branchlabel">match</span>
        <DecisionChip decision={r.decision} size="sm" />
      </div>
    </div>
  )
}

/* --- Branch node -------------------------------------------------------------
   The same rule, drawn as the fork it actually is. The IF conditions are cards
   on the node and editable there; below them a decision diamond splits — match
   goes right to the outcome, no-match carries on down the spine to the next
   rule. Population rides the edges, the way Intercom and Customer.io label
   theirs, because "how many people take this path" is the question the diagram
   exists to answer.
   -------------------------------------------------------------------------- */
function BranchNode({
  rule: r,
  index,
  count,
  selected,
  anim,
  passKind,
  onSelect,
  onToggle,
  onMove,
  onRemove,
  onDecision,
  onAddCondition,
  onRemoveCondition,
  onJoiner,
}: {
  rule: Rule
  index: number
  count: number
  selected: boolean
  anim: string
  passKind: 'off' | 'miss'
  onSelect: () => void
  onToggle: (v: boolean) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onDecision: (d: AccessDecision) => void
  onAddCondition: () => void
  onRemoveCondition: (i: number) => void
  onJoiner: (i: number) => void
}) {
  const store = useBrand()
  const groups = r.appliesTo.includes('all')
    ? 'Everyone'
    : r.appliesTo.map((g) => store.groupById(g).name).join(', ')
  const tone = DEC_TONE[r.decision]

  return (
    <div
      className={`bbn ${selected ? 'is-selected' : ''} ${r.enabled ? '' : 'is-off'} ${anim}`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <div className="bbn__card">
        <header className="bbn__head">
          <span className="bbn__idx">{index + 1}</span>
          <span className={`bbn__tile is-${tone}`} aria-hidden>
            {r.decision === 'deny' ? (
              <ShieldAlert size={15} strokeWidth={1.8} />
            ) : r.decision === '2fa' ? (
              <KeyRound size={15} strokeWidth={1.8} />
            ) : (
              <UserCheck size={15} strokeWidth={1.8} />
            )}
          </span>
          <span className="bbn__headbody">
            <strong title={r.name}>{r.name}</strong>
            <span title={groups}>{groups}</span>
          </span>
          <span className="bbn__acts" onClick={(e) => e.stopPropagation()}>
            <Toggle size="sm" checked={r.enabled} label={`Enable ${r.name}`} onChange={onToggle} />
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${r.name} earlier`}>
              <ArrowUp size={13} strokeWidth={1.9} />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${r.name} later`}>
              <ArrowDown size={13} strokeWidth={1.9} />
            </button>
            <button type="button" className="bbn__del" onClick={onRemove} aria-label={`Remove ${r.name}`}>
              <Trash2 size={13} strokeWidth={1.9} />
            </button>
          </span>
        </header>

        {/* IF — the conditions, editable here rather than only in the panel. */}
        <div className="bbn__if" onClick={(e) => e.stopPropagation()}>
          <span className="bbn__kw">IF</span>
          {r.conditions.length === 0 ? (
            <span className="bbn__any">no conditions — matches everyone who reaches it</span>
          ) : (
            <span className="bbn__conds">
              <AnimatePresence mode="popLayout" initial={false}>
                {r.conditions.map((c, ci) => (
                  <motion.span
                    key={c.id}
                    layout
                    className="bbn__condwrap"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                  >
                    {ci > 0 && (
                      <button
                        type="button"
                        className={`bbn__joiner is-${c.joiner.toLowerCase()}`}
                        onClick={() => onJoiner(ci)}
                        title={`Joined with ${c.joiner}. Click to switch.`}
                      >
                        {c.joiner}
                      </button>
                    )}
                    <span className="bbn__cond">
                      <b>{conditionType(c.typeId).label}</b>
                      <i>{c.operator}</i>
                      {c.values.join(', ') || '—'}
                      <button
                        type="button"
                        className="bbn__condx"
                        onClick={() => onRemoveCondition(ci)}
                        aria-label={`Remove ${conditionType(c.typeId).label}`}
                      >
                        ×
                      </button>
                    </span>
                  </motion.span>
                ))}
              </AnimatePresence>
            </span>
          )}
          <button type="button" className="bbn__addcond" onClick={onAddCondition}>
            <Plus size={12} strokeWidth={2.4} aria-hidden /> Condition
          </button>
        </div>
      </div>

      {/* The fork. The diamond is the decision; match exits right, no-match
          continues down into the next spine segment. */}
      <div className="bbn__fork" aria-hidden>
        <span className="bbn__forkstem" />
        <span className="bbn__diamond">
          <span className="bbn__diamondi" />
        </span>
        <span className="bbn__forkarm" />
      </div>

      {/* THEN — the outcome, switchable straight from the canvas. */}
      <div className={`bbn__then is-${tone}`} onClick={(e) => e.stopPropagation()}>
        <span className="bbn__thenlabel">MATCH →</span>
        <div className="bbn__dec" role="radiogroup" aria-label={`Outcome for ${r.name}`}>
          {(['deny', '1fa', '2fa'] as AccessDecision[]).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={r.decision === d}
              className={`bbn__decopt is-${DEC_TONE[d]} ${r.decision === d ? 'is-on' : ''}`}
              onClick={() => onDecision(d)}
            >
              {DECISION_LABEL[d]}
            </button>
          ))}
        </div>
        <span className="bbn__reach">≈{r.matchEstimate.toLocaleString()} people take this path</span>
      </div>

      {anim === 'is-passed' && (
        <span className="bnode__verdict">{passKind === 'off' ? 'skipped — disabled' : 'no match'}</span>
      )}
      {anim.startsWith('is-hit') && (
        <span className="bnode__verdict bnode__verdict--hit">matched — evaluation stops</span>
      )}
    </div>
  )
}

/* --- Condition row --------------------------------------------------------- */

function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
}: {
  condition: Condition
  index: number
  onChange: (patch: Partial<Condition>) => void
  onRemove: () => void
}) {
  const store = useBrand()
  const t = conditionType(condition.typeId)

  return (
    <div className="bcond">
      {index > 0 && (
        <button
          type="button"
          className={`bcond__joiner bcond__joiner--${condition.joiner.toLowerCase()}`}
          onClick={() => onChange({ joiner: condition.joiner === 'AND' ? 'OR' : 'AND' })}
          aria-label={`Joined to the previous condition with ${condition.joiner}. Activate to switch.`}
        >
          {condition.joiner}
        </button>
      )}

      <div className="bcond__row">
        <span className="bcond__type">
          <span className="bcond__group">{t.group}</span>
          {t.label}
        </span>

        <select
          className="bcond__op"
          aria-label={`${t.label} operator`}
          value={condition.operator}
          onChange={(e) => onChange({ operator: e.target.value })}
        >
          {t.operators.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <span className="bcond__val">
          {t.valueKind === 'zone' && (
            <select aria-label="Zone" value={condition.values[0]} onChange={(e) => onChange({ values: [e.target.value] })}>
              {store.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          {t.valueKind === 'fingerprint' && (
            <select aria-label="Device posture" value={condition.values[0]} onChange={(e) => onChange({ values: [e.target.value] })}>
              {store.fingerprints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {t.valueKind === 'list' && (
            <span className="bcond__multi">
              {t.options!.map((o) => {
                const on = condition.values.includes(o)
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    className={`bcond__opt ${on ? 'is-on' : ''}`}
                    onClick={() =>
                      onChange({ values: on ? condition.values.filter((v) => v !== o) : [...condition.values, o] })
                    }
                  >
                    {o}
                  </button>
                )
              })}
            </span>
          )}
          {t.valueKind === 'time' && (
            <span className="bcond__time">
              <input
                type="text"
                aria-label="From"
                value={condition.values[0] ?? ''}
                onChange={(e) => onChange({ values: [e.target.value, condition.values[1] ?? ''] })}
              />
              <span>to</span>
              <input
                type="text"
                aria-label="To"
                value={condition.values[1] ?? ''}
                onChange={(e) => onChange({ values: [condition.values[0] ?? '', e.target.value] })}
              />
            </span>
          )}
          {(t.valueKind === 'text' || t.valueKind === 'range') && (
            <input
              type="text"
              aria-label={`${t.label} value`}
              value={condition.values[0] ?? ''}
              placeholder={t.valueKind === 'range' ? 'e.g. 60' : 'Enter a value'}
              onChange={(e) => onChange({ values: [e.target.value] })}
            />
          )}
        </span>

        <button type="button" className="bcond__x" onClick={onRemove} aria-label={`Remove ${t.label} condition`}>
          ×
        </button>
      </div>
    </div>
  )
}

/* --- Condition picker ------------------------------------------------------ */

function ConditionPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const filtered = CONDITION_CATALOGUE.filter(
      (c) => !q || c.label.toLowerCase().includes(q.toLowerCase()) || c.hint.toLowerCase().includes(q.toLowerCase()),
    )
    const byGroup = new Map<string, typeof CONDITION_CATALOGUE>()
    filtered.forEach((c) => {
      const arr = byGroup.get(c.group) ?? []
      arr.push(c)
      byGroup.set(c.group, arr)
    })
    return [...byGroup.entries()]
  }, [q])

  return (
    <Modal open={open} onClose={onClose} title="Add a condition" width={620} padded={false}>
      <div className="bpick">
        <div className="bpick__search">
          <input
            type="search"
            placeholder="Search conditions…"
            aria-label="Search conditions"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="bpick__scroll">
          {groups.map(([group, items]) => (
            <div key={group} className="bpick__group">
              <p className="u-label">{group}</p>
              {items.map((c) => (
                <button key={c.id} type="button" className="bpick__item" onClick={() => onPick(c.id)}>
                  <strong>{c.label}</strong>
                  <span>{c.hint}</span>
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="bnew__none">Nothing matches “{q}”.</p>}
        </div>
      </div>
    </Modal>
  )
}

/* --- Reusable objects -------------------------------------------------------
   The prototype's right panel, given the full treatment it only gestured at:
   collapsible sections, and every row expands into the thing itself — a zone's
   entries, a posture's requirements, a method set's methods — plus how many
   policies lean on it and a jump to its page. When a rule is selected, rows
   grow an attach action, so "use this zone in this rule" is one click instead
   of a trip through the condition picker.
   -------------------------------------------------------------------------- */

/** Loudest severity present — drives the badge's colour. */
function worstOf(items: Diagnostic[]) {
  return items.some((d) => d.severity === 'error')
    ? 'error'
    : items.some((d) => d.severity === 'warning')
      ? 'warning'
      : 'info'
}

/* --- Checks ------------------------------------------------------------------
   What separates a form from a tool: it tells you when what you built cannot do
   what you meant. Every row carries a jump to the rule it is about, because a
   lint list you cannot act on is just a scolding.
   -------------------------------------------------------------------------- */
function ChecksPanel({
  items,
  onGo,
  selected,
}: {
  items: Diagnostic[]
  onGo: (i: number) => void
  selected: number
}) {
  if (items.length === 0) {
    return (
      <div className="bchecks__clear">
        <span className="bchecks__clearmark" aria-hidden>
          <CheckCircle2 size={18} strokeWidth={1.8} />
        </span>
        <strong>No problems found</strong>
        <span>Every rule is reachable and internally consistent.</span>
      </div>
    )
  }

  return (
    <ul className="bchecks" role="list">
      {items.map((d) => (
        <li key={d.id} className={`bchecks__row is-${d.severity} ${d.ruleIndex === selected ? 'is-here' : ''}`}>
          <span className="bchecks__mark" aria-hidden>
            {d.severity === 'error' ? (
              <XCircle size={15} strokeWidth={1.9} />
            ) : d.severity === 'warning' ? (
              <AlertTriangle size={15} strokeWidth={1.9} />
            ) : (
              <Info size={15} strokeWidth={1.9} />
            )}
          </span>
          <span className="bchecks__body">
            <strong>
              <span className="u-sr">{d.severity}: </span>
              {d.title}
            </strong>
            <span>{d.detail}</span>
            <span className="bchecks__acts">
              <button type="button" onClick={() => onGo(d.ruleIndex)}>
                Go to rule {d.ruleIndex + 1}
              </button>
              {d.relatedIndex !== undefined && (
                <button type="button" onClick={() => onGo(d.relatedIndex!)}>
                  Show rule {d.relatedIndex + 1}
                </button>
              )}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* --- Impact ------------------------------------------------------------------
   Two of these numbers are exact and the rest are not, so the panel says which
   is which. `matchEstimate` is seed data that never recomputes — presenting it
   as a live count would mean confidently reporting the same figure after every
   condition had been deleted.
   -------------------------------------------------------------------------- */
function ImpactPanel({
  impact,
  rule,
  onGo,
}: {
  impact: Impact
  rule: Rule
  onGo: (i: number) => void
}) {
  const tone = DEC_TONE[rule.decision]
  return (
    <div className="bimp">
      <div className="bimp__row">
        <span className="bimp__k">In scope</span>
        <span className="bimp__v">
          <Counter value={impact.audience} /> people
          <em>exact</em>
        </span>
      </div>

      <div className="bimp__row">
        <span className="bimp__k">Expected to match</span>
        <span className={`bimp__v is-${impact.basis}`}>
          {impact.basis === 'stale' ? '—' : <Counter value={impact.matches} />}
          {impact.basis !== 'stale' && ' people'}
          <em>
            {impact.basis === 'exact'
              ? 'exact — no conditions'
              : impact.basis === 'stale'
                ? 'not recalculated'
                : 'estimate'}
          </em>
        </span>
      </div>

      {impact.basis === 'stale' ? (
        <p className="bimp__note">
          The conditions changed, so the previous estimate no longer describes this rule. The scope
          above is still exact — it is the most this rule can ever match.
        </p>
      ) : (
        <div className={`bimp__bar is-${tone}`} role="img" aria-label={`${impact.share}% of the audience`}>
          <span style={{ width: `${impact.share}%` }} />
        </div>
      )}

      <div className="bimp__row">
        <span className="bimp__k">If this stops matching</span>
        <span className="bimp__v bimp__v--wrap">
          {impact.fallsTo ? (
            <button type="button" className="bimp__link" onClick={() => onGo(impact.fallsTo!.index)}>
              falls to rule {impact.fallsTo.index + 1} · {impact.fallsTo.name}
              <i className={`bimp__dot is-${DEC_TONE[impact.fallsTo.decision]}`} aria-hidden />
            </button>
          ) : (
            <span className="bimp__plain">falls to the default rule</span>
          )}
        </span>
      </div>
    </div>
  )
}

function ObjectsPanel({
  mode,
  canAttach,
  onAttachZone,
  onAttachFingerprint,
  onUseMethods,
}: {
  mode: 'slim' | 'mid' | 'wide'
  canAttach: boolean
  onAttachZone?: (id: string) => void
  onAttachFingerprint?: (id: string) => void
  onUseMethods?: (id: string) => void
}) {
  const store = useBrand()
  // One section and one row open at a time — this is a reference shelf, not a tree view.
  const [openSec, setOpenSec] = useState<string | null>('zones')
  const [openRow, setOpenRow] = useState<string | null>(null)

  const usedBy = (typeId: string, objId: string) =>
    store.policies.filter((p) =>
      p.rules.some((r) => r.conditions.some((c) => c.typeId === typeId && c.values.includes(objId))),
    ).length

  const sections = [
    {
      id: 'zones',
      title: 'Zones',
      icon: Globe,
      manage: () => store.go({ name: 'zones' }),
      rows: store.zones.map((z) => ({
        id: z.id,
        name: z.name,
        /* A zone no longer has one kind — it has two sections combined with
           AND, so the tag says which halves are actually constrained. */
        tag: ipSectionEmpty(z) ? 'Geo' : locationEmpty(z.location) ? 'Network' : 'Both',
        used: usedBy('zone', z.id),
        detail: (
          <>
            <p className="bobj__and">{describeZone(z)}</p>
            <ul className="bobj__entries">
              {[...z.ip, ...z.asn].map((e) => (
                <li key={e}>
                  <code>{e}</code>
                </li>
              ))}
            </ul>
          </>
        ),
        attach: onAttachZone ? () => onAttachZone(z.id) : undefined,
        attachLabel: 'Add as condition',
      })),
    },
    {
      id: 'fingerprint',
      title: 'Device fingerprint',
      icon: MonitorSmartphone,
      manage: () => store.go({ name: 'fingerprint' }),
      rows: store.fingerprints.map((p) => ({
        id: p.id,
        name: p.name,
        tag: p.mode === 'match' ? 'Attribute match' : 'Risk score',
        used: p.usedIn,
        detail: (
          <dl className="bobj__reqs">
            <div>
              <dt>Attributes</dt>
              <dd>{p.enabled.length} on</dd>
            </div>
            <div>
              <dt>{p.mode === 'match' ? 'Tolerance' : 'Bands'}</dt>
              <dd>
                {p.mode === 'match'
                  ? `${p.tolerance} may drift, then ${p.onMismatch}`
                  : `allow ≤${p.bands.allow}, challenge ≤${p.bands.challenge}`}
              </dd>
            </div>
          </dl>
        ),
        attach: onAttachFingerprint ? () => onAttachFingerprint(p.id) : undefined,
        attachLabel: 'Require compliance',
      })),
    },
    {
      id: 'methods',
      title: 'Method sets',
      icon: KeyRound,
      manage: () => store.go({ name: 'methods' }),
      rows: store.methodSets.map((m) => ({
        id: m.id,
        name: m.name,
        tag: `${m.methods.length} methods`,
        used: m.usedIn,
        detail: (
          <ul className="bobj__entries">
            {m.methods.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ),
        attach: onUseMethods ? () => onUseMethods(m.id) : undefined,
        attachLabel: 'Use for 2FA',
      })),
    },
  ]

  return (
    <div className={`bobj bobj--${mode}`}>
      <div className="bobj__panelhead">
        <h2 className="u-label">Reusable objects</h2>
        <p>Referenced by conditions. Editing one changes every policy using it.</p>
      </div>

      {sections.map((sec) => {
        const SecIcon = sec.icon
        const open = openSec === sec.id
        return (
          <section key={sec.id} className="bobj__sec">
            <header>
              <button
                type="button"
                className="bobj__sechead"
                aria-expanded={open}
                onClick={() => setOpenSec(open ? null : sec.id)}
              >
                <SecIcon size={14} strokeWidth={1.8} aria-hidden />
                {sec.title}
                <em>{sec.rows.length}</em>
                <ChevronDown className={`bobj__chev ${open ? 'is-open' : ''}`} size={14} strokeWidth={1.9} aria-hidden />
              </button>
              <button type="button" className="bobj__manage" onClick={sec.manage}>
                + New
              </button>
            </header>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="bobj__rows">
                    {sec.rows.map((row) => {
                      const expanded = openRow === `${sec.id}:${row.id}`
                      return (
                        <div
                          key={row.id}
                          className={`bobj__row ${expanded ? 'is-open' : ''} ${canAttach && row.attach ? 'is-draggable' : ''}`}
                          draggable={canAttach && !!row.attach}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              'application/x-idp-object',
                              JSON.stringify({ kind: sec.id, id: row.id }),
                            )
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                        >
                          <button
                            type="button"
                            className="bobj__rowhead"
                            aria-expanded={expanded}
                            onClick={() => setOpenRow(expanded ? null : `${sec.id}:${row.id}`)}
                          >
                            <ChevronRight className={`bobj__rowchev ${expanded ? 'is-open' : ''}`} size={13} strokeWidth={2} aria-hidden />
                            <span className="bobj__name">{row.name}</span>
                            <span className="bobj__tag">{row.tag}</span>
                            <span className="bobj__used" title={`Referenced by ${row.used} polic${row.used === 1 ? 'y' : 'ies'}`}>
                              {row.used}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {expanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="bobj__detail">
                                  {row.detail}
                                  <div className="bobj__detailfoot">
                                    <span>
                                      Used in {row.used} polic{row.used === 1 ? 'y' : 'ies'}
                                    </span>
                                    <button type="button" onClick={sec.manage}>
                                      Open →
                                    </button>
                                  </div>
                                  {canAttach && row.attach && (
                                    <button type="button" className="bobj__attach" onClick={row.attach}>
                                      <Plus size={13} strokeWidth={2.2} aria-hidden />
                                      {row.attachLabel}
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}

/* --- Review ---------------------------------------------------------------- */

function ReviewDialog({
  open,
  onClose,
  draft,
  original,
  changes,
  onConfirm,
  onStatus,
}: {
  open: boolean
  onClose: () => void
  draft: Policy
  original: Policy
  changes: string[]
  onConfirm: () => void
  onStatus: (s: Policy['status']) => void
}) {
  const store = useBrand()
  const before = original.rules.reduce((n, r) => Math.max(n, r.matchEstimate), 0)
  const after = draft.rules.reduce((n, r) => Math.max(n, r.matchEstimate), 0)
  const denied = draft.rules.filter((r) => r.enabled && r.decision === 'deny').reduce((n, r) => n + r.matchEstimate, 0)
  const challenged = draft.rules.filter((r) => r.enabled && r.decision === '2fa').reduce((n, r) => n + r.matchEstimate, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review before enforcing"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back and edit
          </Button>
          <Button variant="brand" onClick={onConfirm}>
            {draft.status === 'inactive' ? 'Save as inactive' : 'Save & enforce'}
          </Button>
        </>
      }
    >
      {/* The library's rule: never save a rule without showing its delta. */}
      <div className="bimpact">
        <header>
          <h3>Impact if applied now</h3>
          <span>Evaluated against your current directory. Nothing changes until you save.</span>
        </header>
        <div className="bimpact__figure">
          <strong>
            <Counter value={after} />
          </strong>
          <span>users match these rules{before !== after && <em> · was {before.toLocaleString()}</em>}</span>
        </div>
        <div className="bimpact__rows">
          <div>
            <span className="bimpact__dot bimpact__dot--notice" aria-hidden />
            <Counter value={challenged} /> users will be challenged for a second factor
          </div>
          <div>
            <span className="bimpact__dot bimpact__dot--negative" aria-hidden />
            <Counter value={denied} /> users will be blocked outright
          </div>
        </div>
        <Button block onClick={() => store.showToast('Opens the full affected-member list')}>
          Preview affected members
        </Button>
      </div>

      <div className="breview__changes">
        <p className="u-label">What changed</p>
        {changes.length === 0 ? (
          <p className="u-muted">Nothing yet — this is the policy as it stands.</p>
        ) : (
          <ul>
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="breview__rules">
        <p className="u-label">Evaluation order</p>
        <ol>
          {draft.rules.map((r, i) => (
            <li key={r.id} className={r.enabled ? '' : 'is-off'}>
              <span className="breview__n">{i + 1}</span>
              <span className="breview__body">
                <strong>{r.name}</strong>
                <span>{ruleSentence(r, store)}</span>
              </span>
              <DecisionChip decision={r.decision} size="sm" />
            </li>
          ))}
          <li className="is-default">
            <span className="breview__n">—</span>
            <span className="breview__body">
              <strong>Default rule — everyone</strong>
              <span>Anyone who reaches this point is allowed with one factor.</span>
            </span>
            <DecisionChip decision="1fa" size="sm" />
          </li>
        </ol>
      </div>

      <div className="breview__status">
        <p className="u-label">Enforcement</p>
        <div className="bx-tabs" role="radiogroup" aria-label="Enforcement">
          {(['inactive', 'active'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={draft.status === s}
              className={`bx-tabs__tab ${draft.status === s ? 'is-on' : ''}`}
              onClick={() => onStatus(s)}
            >
              <span className="bx-tabs__label">{s === 'inactive' ? 'Inactive' : 'Active'}</span>
            </button>
          ))}
        </div>
        <p className="bx-field__hint">
          {draft.status === 'inactive'
            ? 'Saved but not evaluated. Nothing changes for users.'
            : 'Live. This policy changes what users experience on their next sign-in.'}
        </p>
      </div>
    </Modal>
  )
}

/* --- Test drawer ----------------------------------------------------------- */

function TestDrawer({
  open,
  onClose,
  draft,
  onTrace,
}: {
  open: boolean
  onClose: () => void
  draft: Policy
  onTrace: (t: Trace) => void
}) {
  const store = useBrand()
  const [user, setUser] = useState('priya@mo.com')
  const [place, setPlace] = useState('Any location')
  const [device, setDevice] = useState('Known < 90 days')
  const [authState, setAuthState] = useState('Normal returning user')
  const [risk, setRisk] = useState('Low')
  const [result, setResult] = useState<{
    rule: Rule
    index: number
    skipped: { rule: Rule; idx: number }[]
  } | null>(null)

  function run() {
    // Deterministic stand-in for the engine: the first enabled rule whose
    // conditions plausibly fit the chosen context.
    const matches = (r: Rule) => {
      if (risk === 'High' && r.decision !== '1fa') return true
      if (place === 'Outside all zones' && r.conditions.some((c) => c.typeId === 'zone')) return true
      if (device === 'Changed fingerprint' && r.conditions.some((c) => c.typeId === 'fingerprint')) return true
      if (authState === 'First time login' && r.conditions.some((c) => c.typeId === 'auth-state')) return true
      return false
    }

    /* The same walk the canvas animates — one computation, two renderings, so
       the moving dot and the written verdict cannot disagree. */
    const steps: TraceStep[] = []
    let hit: number | null = null
    for (let i = 0; i < draft.rules.length; i++) {
      const r = draft.rules[i]
      if (!r.enabled) {
        steps.push({ idx: i, kind: 'off' })
        continue
      }
      if (matches(r)) {
        hit = i
        break
      }
      steps.push({ idx: i, kind: 'miss' })
    }
    onTrace({ steps, hit })

    const hitRule = hit === null ? null : draft.rules[hit]
    setResult(
      hitRule
        ? {
            rule: hitRule,
            index: hit!,
            /* Carry the true index. Filtering first and then numbering by the
               filtered position renumbered the skipped rules, so the drawer and
               the canvas disagreed whenever a disabled rule came earlier. */
            skipped: draft.rules
              .slice(0, hit!)
              .map((r, idx) => ({ rule: r, idx }))
              .filter((x) => x.rule.enabled),
          }
        : null,
    )
    if (!hitRule) store.showToast('No rule matched — the default rule would apply')
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Test this policy"
      caption={draft.name}
      width={440}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="brand" onClick={run}>
            Run simulation
          </Button>
        </>
      }
    >
      <div className="btest">
        <label className="btest__field">
          <span className="u-label">Simulate for</span>
          <select value={user} onChange={(e) => setUser(e.target.value)}>
            <option>priya@mo.com</option>
            <option>arun@mo.com</option>
            <option>contractor@ext.com</option>
          </select>
        </label>
        <label className="btest__field">
          <span className="u-label">Connecting from</span>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            <option>Any location</option>
            <option>Office Network</option>
            <option>Outside all zones</option>
            <option>Tor exit node</option>
          </select>
        </label>
        <label className="btest__field">
          <span className="u-label">Device</span>
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option>Known &lt; 90 days</option>
            <option>New / unknown</option>
            <option>Expired trust</option>
            <option>Changed fingerprint</option>
          </select>
        </label>
        <label className="btest__field">
          <span className="u-label">Auth state</span>
          <select value={authState} onChange={(e) => setAuthState(e.target.value)}>
            <option>Normal returning user</option>
            <option>First time login</option>
            <option>MFA recently reset</option>
          </select>
        </label>
        <label className="btest__field">
          <span className="u-label">Risk signal</span>
          <select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>

        <AnimatePresence>
          {result && (
            <motion.div
              className="btest__result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <DecisionChip decision={result.rule.decision} />
              <p className="btest__matched">
                Matched <strong>{result.rule.name}</strong> (rule {result.index + 1})
              </p>
              {result.skipped.length > 0 && (
                <ul className="btest__chain">
                  {result.skipped.map(({ rule: r, idx }) => (
                    <li key={r.id}>
                      Rule {idx + 1} · {r.name} — skipped, no match
                    </li>
                  ))}
                  <li className="is-hit">
                    Rule {result.index + 1} · {result.rule.name} — matched, evaluation stopped
                  </li>
                </ul>
              )}
              <p className="u-label btest__seelabel">What the user would see</p>
              <ol className="btest__steps">
                {result.rule.decision === 'deny' ? (
                  <li>Access denied page</li>
                ) : (
                  <>
                    <li>Enter password</li>
                    {result.rule.decision === '2fa' && <li>Approve miniOrange Push</li>}
                  </>
                )}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Drawer>
  )
}

/* --- Decision log ---------------------------------------------------------- */

function LogDrawer({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  const [expanded, setExpanded] = useState<number | null>(0)
  const allowed = decisionLog.filter((l) => l.decision === 'Allow').length
  const denied = decisionLog.filter((l) => l.decision === 'Deny').length
  const challenged = decisionLog.filter((l) => l.decision === 'Challenge').length

  return (
    <Drawer open={open} onClose={onClose} title="Decision log" caption={name} width={520}>
      <p className="blog__summary">
        {decisionLog.length} evaluations in the last 24 hours — {allowed} allowed, {denied} denied,{' '}
        {challenged} challenged.
      </p>
      <div className="blog">
        {decisionLog.map((l, i) => (
          <div key={i} className={`blog__row ${expanded === i ? 'is-open' : ''}`}>
            <button type="button" className="blog__head" onClick={() => setExpanded(expanded === i ? null : i)} aria-expanded={expanded === i}>
              <span className="blog__time u-mono">{l.time}</span>
              <span className="blog__user">{l.user}</span>
              <span className="blog__app">{l.app}</span>
              <span
                className={`bx-decision bx-decision--sm bx-decision--${
                  l.decision === 'Allow' ? 'positive' : l.decision === 'Deny' ? 'negative' : 'notice'
                }`}
              >
                <i />
                {l.decision}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {expanded === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="blog__detail">
                    <div>
                      <p className="u-label">Condition evaluation</p>
                      <ul>
                        {l.conditions.map((c) => (
                          <li key={c.label} className={c.matched ? 'is-hit' : ''}>
                            {c.matched ? '✓' : '·'} {c.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="u-label">Context</p>
                      <ul className="blog__ctx">
                        <li className="u-mono">{l.ip}</li>
                        <li className="u-mono">{l.device}</li>
                        <li>
                          {l.place} · {l.factor} · {l.latency}
                        </li>
                        <li>{l.risk}</li>
                      </ul>
                    </div>
                    <div className="blog__chain">
                      <p className="u-label">Evaluation chain</p>
                      <ul>
                        {l.chain.map((c) => (
                          <li key={c.rule}>
                            <strong>{c.rule}</strong> — {c.outcome}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

/* --- Assign apps ----------------------------------------------------------- */

function AppsDrawer({
  open,
  onClose,
  draft,
  onChange,
}: {
  open: boolean
  onClose: () => void
  draft: Policy
  onChange: (ids: string[]) => void
}) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const list = store.apps.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assign apps"
      caption={`${draft.name} · ${draft.appIds.length} selected`}
      width={420}
      actions={
        <Button variant="brand" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="bapps__search">
        <input type="search" placeholder="Search apps…" aria-label="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bapps">
        {list.map((a) => {
          const on = draft.appIds.includes(a.id)
          const conflicts = store.policies.filter(
            (p) => p.id !== draft.id && enforces(p) && p.appIds.includes(a.id),
          )
          return (
            <label key={a.id} className="bapps__row">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? draft.appIds.filter((x) => x !== a.id) : [...draft.appIds, a.id])}
              />
              <AppLogo appId={a.id} name={a.name} size={22} />
              <span className="bapps__name">
                {a.name}
                {/* The current prototype attaches apps with no warning that
                    another live policy already governs them. */}
                {conflicts.length > 0 && (
                  <em>
                    also governed by {conflicts.length} other polic{conflicts.length === 1 ? 'y' : 'ies'}
                  </em>
                )}
              </span>
              <span className="bapps__proto">{a.protocol}</span>
            </label>
          )
        })}
      </div>
    </Drawer>
  )
}

/* --- Helpers --------------------------------------------------------------- */

type Store = ReturnType<typeof useBrand>

function conditionSentence(c: Condition, store: Store): string {
  const t = conditionType(c.typeId)
  let value = c.values.join(', ')
  if (t.valueKind === 'zone') value = store.zoneById(c.values[0])?.name ?? value
  if (t.valueKind === 'fingerprint') value = store.fingerprintById(c.values[0])?.name ?? value
  if (t.valueKind === 'time') value = c.values.join('–')
  return `${t.label} ${c.operator} ${value}`.trim()
}

/**
 * Renders the rule as a sentence from the same condition array the editor
 * writes, joiner included. In the current prototype the review dialog rewrites
 * OR as AND; generating from one source makes that class of bug impossible.
 */
function ruleSentence(r: Rule, store: Store): string {
  const who = r.appliesTo.map((g) => store.groupById(g).name).join(', ')
  if (r.conditions.length === 0) return `Anyone in ${who} who reaches this rule.`
  const parts = r.conditions.map((c, i) => (i === 0 ? conditionSentence(c, store) : `${c.joiner} ${conditionSentence(c, store)}`))
  return `${who} — ${parts.join(' ')}`
}

function summarize(p: Policy, store: Store): string {
  const enabled = p.rules.filter((r) => r.enabled)
  if (enabled.length === 0) return 'No active rules — every sign-in falls through to the default rule.'
  const first = enabled[0]
  const more = enabled.length - 1
  return `${conditionSummary(first, store)} → ${DECISION_LABEL[first.decision]}${more > 0 ? `, then ${more} more rule${more === 1 ? '' : 's'}` : ''}`
}

function conditionSummary(r: Rule, store: Store): string {
  if (r.conditions.length === 0) return r.name
  return r.conditions.map((c) => conditionSentence(c, store)).join(` ${r.conditions[1]?.joiner ?? 'AND'} `)
}

/** Names each change, so the save bar and review dialog can list them. */
function diffPolicies(a: Policy, b: Policy): string[] {
  const out: string[] = []
  if (a.name !== b.name) out.push(`Renamed to “${b.name}”`)
  if (a.status !== b.status) out.push(`Status set to ${b.status}`)
  if (a.appIds.length !== b.appIds.length) out.push(`${b.appIds.length - a.appIds.length > 0 ? 'Attached' : 'Detached'} apps`)
  if (a.rules.length !== b.rules.length) {
    const d = b.rules.length - a.rules.length
    out.push(d > 0 ? `Added ${d} rule${d === 1 ? '' : 's'}` : `Removed ${-d} rule${-d === 1 ? '' : 's'}`)
  }
  /* Matched by id, not by position. Comparing b.rules[i] to a.rules[i] meant a
     single drag reported eleven changes — and named things that never happened,
     like "Rule 1 renamed", because every shifted rule was being compared to a
     different rule. Moves are their own kind of change and say so. */
  const wasAt = new Map(a.rules.map((r, i) => [r.id, i]))
  const moved: number[] = []

  b.rules.forEach((r, i) => {
    const prevIdx = wasAt.get(r.id)
    if (prevIdx === undefined) return
    const prev = a.rules[prevIdx]
    if (prevIdx !== i) moved.push(i)
    if (prev.name !== r.name) out.push(`Rule ${i + 1} renamed to “${r.name}”`)
    if (prev.decision !== r.decision) out.push(`Rule ${i + 1} outcome → ${DECISION_LABEL[r.decision]}`)
    if (prev.enabled !== r.enabled) out.push(`Rule ${i + 1} ${r.enabled ? 'enabled' : 'disabled'}`)
    if (prev.conditions.length !== r.conditions.length) out.push(`Rule ${i + 1} conditions changed`)
    else if (JSON.stringify(prev.conditions) !== JSON.stringify(r.conditions)) out.push(`Rule ${i + 1} conditions edited`)
    if (JSON.stringify(prev.appliesTo) !== JSON.stringify(r.appliesTo)) out.push(`Rule ${i + 1} audience changed`)
  })

  /* One entry for the whole reorder. Order is the logic, so it is worth saying
     loudly — but it is one decision, not one per rule that shifted under it. */
  if (moved.length > 0) {
    out.unshift(
      moved.length === 1
        ? `Rule ${moved[0] + 1} moved — evaluation order changed`
        : `Evaluation order changed (${moved.length} rules moved)`,
    )
  }
  return out
}
