import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Command,
  Check,
  Copy,
  CopyPlus,
  FileDown,
  Grid3x3,
  Info,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Redo2,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  Trash2,
  GraduationCap,
  Undo2,
  X,
  Wand2,
  XCircle,
} from 'lucide-react'

import { Button, IconButton, MenuButton, Tip, Toggle, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { blankRule, reach, type AccessDecision, type Audience, type Policy, type Rule } from '../data'
import { useBrand, useNameLookup } from '../store'
import { AudienceBar, AudienceDrawer } from './audience-drawer'
import { ruleSentence, type NameLookup } from './predicate-prose'
import { AssignAppsDialog, CopyRuleDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import { describeChanges } from './changes'
import { CommandBar, baseCommands } from './command-bar'
import { diagnose, shadowedBy } from './diagnostics'
import { tourSeen } from '../tour/tour-stops'

/* Both are mounted only while they are open, and both are the whole reason the
   builder's chunk was carrying the create flow and six animated figures it does
   not need to render a rule. `tour-stops` stays eager — it is a data module, and
   the first-run check has to run before the chunk is worth fetching. */
const Interview = lazy(() => import('../create/Interview').then((m) => ({ default: m.Interview })))
const Tour = lazy(() => import('../tour/Tour').then((m) => ({ default: m.Tour })))
const LearnPanel = lazy(() => import('../tour/LearnPanel').then((m) => ({ default: m.LearnPanel })))
import { FALLBACK_SUB, FlowRail } from './flow-rail'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from './history'
import { PolicyOverview } from './overview'
import { ReviewStep } from './review-step'
import { applyFix } from './gauntlet'
import { GauntletDialog, GauntletPip } from './gauntlet-dialog'
import { ImpactArenaDialog, ImpactPip } from './impact-arena-dialog'
import {
  DEC_KEY,
  DEFAULT_PREVIEW,
  METHODS,
  PREVIEW_CAVEAT,
  WhenSection,
  previewContext,
  type PreviewState,
} from './rule-form'
import { DEVICE_OPTIONS, PLACES, RISKS, SIM_USERS, evalRule, walk, type SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   Policy builder v4 — the trail.

   The previous v4 put a 720px form in the middle of a capped page and pinned a
   268px answer rail beside it. Measured, that spent 31% of a 1920 window on
   nothing while the form scrolled 2.1 screens and the rail overflowed with five
   rules. The rail was not under-used; it was over-subscribed, holding an
   outline, a tab pair and two panels that had to take turns.

   This pass changes three things and leaves the engine alone.

   · **The left side is v1's flow.** A start node, a spine you can insert
     between, decision-coloured tiles, drag to reorder. It draws what a list
     could only assert: a sign-in falls through the sequence until something
     catches it.

   · **The middle is a trail, not a scroll.** Who → When → Then → Check →
     Review, one step at a time, with the whole rule reviewable in one piece
     whenever you want it. Review is a place on the trail rather than a modal
     behind Publish.

   · **The right rail is gone.** What it held is now summoned: the live preview
     and the publish gate open as cards under the step you are on, and close
     when you are done with them. Nothing permanent, nothing taking turns.

   The buttons follow one grammar: one primary per view (Publish, or the step's
   Next), secondary for the rest, icon buttons where the icon is unambiguous,
   and a menu button wherever a group of actions would otherwise become a row of
   them.
   -------------------------------------------------------------------------- */

/* Two stages, not five steps.

   `rules` is where the work happens: an ordered list of rule cards, one open at
   a time, each showing its When and its Then together. `review` is the policy's
   own final stage — the linter, the gauntlet, the blast radius and the ship
   button — entered once, when the rules are done.

   The five-step trail this replaces made a rule feel like a form to be walked,
   and put Check and Review inside a rule when both are questions about the
   whole policy. */
type Stage = 'rules' | 'review'

/* The sequence is a panel you summon, not a column you live beside.

   It was a resizable grid column taking 380px of every window forever — a third
   of a 1024 screen spent on a list you consult, while the thing you are
   actually editing was squeezed. And it could only ever be one width for both
   jobs: wide enough to draw a diagram, narrow enough not to starve the editor.

   Now it floats over the work and closes when it has been used, which is what
   it was already doing below 1120 — that behaviour was right, it was just
   conditional on the window being small. */
const FLOW_W = 340

export function PolicyBuilderBench({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selected, setSelected] = useState(0)
  const [stage, setStage] = useState<Stage>('rules')
  const [audienceOpen, setAudienceOpen] = useState(false)
  /* Which card the condition catalogue is adding to, by id.

     It lives here rather than inside the composer because the catalogue is an
     overlay on the bench, outside the scrolling canvas — that is the whole
     reason opening it costs zero vertical pixels — so the bench has to know
     about it. */
  const [catalogue, setCatalogue] = useState<string | null>(null)
  const [live, setLive] = useState('')
  const [pv, setPv] = useState<PreviewState>(DEFAULT_PREVIEW)
  const [hoverShadow, setHoverShadow] = useState<number | null>(null)
  const [cmd, setCmd] = useState(false)
  const [overview, setOverview] = useState(false)
  const features = store.features
  const [interview, setInterview] = useState(false)
  const [tour, setTour] = useState(false)
  const [learn, setLearn] = useState(false)
  const [dialog, setDialog] = useState<null | 'log' | 'test' | 'apps' | 'template' | 'gauntlet' | 'impact' | 'review' | 'copy'>(
    open ?? null,
  )

  const stageEl = useRef<HTMLDivElement | null>(null)
  const work = useRef<HTMLDivElement | null>(null)

  /* --- The flow's width, dragged. v1's grammar ---------------------------------
     Clamped against the room that actually exists, so the flow never claims a
     width the window cannot give it, and the trail always keeps TRAIL_MIN. */
  /* The rail is the rule list, so it is open by default — it cannot be the only
     place the order lives AND be hidden. `railOpen` collapses it on a wide
     window; `flowOpen` slides it in as an overlay on a narrow one, where a
     320px column would be a third of the screen. */
  const [railOpen, setRailOpen] = useState(true)
  const [flowOpen, setFlowOpen] = useState(false)

  /* Escape closes it, because a panel that floats over the work has to be
     dismissible without aiming at anything. */
  useEffect(() => {
    if (!flowOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlowOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [flowOpen])

  useEffect(() => {
    if (open) setDialog(open)
  }, [open])

  /* First arrival only, and never on top of something else. Opening the builder
     straight into the gauntlet from the policy list is a person who already
     knows what they came for. The settle delay is so the tour measures a laid
     out screen rather than a mounting one. */
  useEffect(() => {
    if (open || tourSeen()) return
    const t = window.setTimeout(() => setTour(true), 600)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (saved) setHist(historyOf(saved))
  }, [saved?.id])

  /* Switching to lite while the review stage is open would leave somebody on a
     screen the edition says does not exist, with the only way back being a
     button that has just been re-labelled. */
  useEffect(() => {
    if (!features.reviewStep) setStage('rules')
  }, [features.reviewStep])

  /* Registered above the early return, so the hook count cannot depend on
     whether the policy still exists. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* The shortcut goes with the feature. Leaving it bound would make the
         palette reachable in an edition whose menu says it does not exist. */
      if (features.commands && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
        return
      }
      const action = historyKey(e)
      if (action) {
        e.preventDefault()
        setHist(action === 'redo' ? redo : undo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Rebound when the edition changes, or the shortcut keeps working in an
    // edition that has taken the palette away.
  }, [features.commands])

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
    }),
    [store],
  )

  const ctx = useMemo(() => previewContext(pv), [pv])
  const resolve = useNameLookup()
  const draft = hist.present

  if (!saved || !draft.id) {
    return (
      <div className="bpage bf is-bench">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const changes = dirty ? describeChanges(saved, draft) : []
  const diagnostics = diagnose(draft, store.groups, store.hooks, store.users)
  const index = Math.min(selected, Math.max(0, rules.length - 1))
  const rule: Rule | undefined = rules[index]

  const patch = (p: Partial<Policy>) => setHist((h) => commit(h, { ...h.present, ...p }))
  const patchRuleAt = (at: number, p: Partial<Rule>) =>
    patch({ rules: rules.map((r, n) => (n === at ? { ...r, ...p } : r)) })

  const mine = diagnostics.filter((d) => d.scope === 'rule' && d.ruleIndex === index)
  const blockers = diagnostics.filter(
    (d) => d.severity === 'error' && (d.scope === 'policy' || rules[d.ruleIndex]?.enabled !== false),
  ).length

  const a = draft.audience
  const emptyAudience = !a.everyone && a.groupIds.length === 0 && a.userIds.length === 0

  /* One walk, feeding both the docked tester's verdict and the highlight on the
     card that carried the match. It is the same evaluator every other surface
     answers through, so the builder cannot disagree with the test dialog. */
  const trace = walk(draft, ctx, env)
  const hitCard = trace.hitIndex === index ? (evalRule(rules[index], ctx, env).card ?? null) : null
  const shadowed = hoverShadow === null ? [] : shadowedBy(draft, hoverShadow)

  const addRule = (at = rules.length) => {
    const r = blankRule(`Rule ${rules.length + 1}`)
    patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
    setSelected(at)
    setStage('rules')
    setLive(`Rule added at position ${at + 1}`)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    patch({ rules: next })
    setSelected(to)
    setLive(`${r.name} moved to position ${to + 1}. Evaluation order changed.`)
  }

  const jump = (i: number) => {
    setSelected(i)
    setCatalogue(null)
    setDialog(null)
    setCmd(false)
    setOverview(false)
    setStage('rules')
  }

  const duplicate = () => {
    if (!rule) return
    const copy = { ...rule, id: `r${Date.now()}`, name: `${rule.name} (copy)` }
    patch({ rules: [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)] })
    setSelected(index + 1)
    store.showToast(`${rule.name} duplicated`)
  }

  const remove = () => {
    if (!rule) return
    patch({ rules: rules.filter((_, n) => n !== index) })
    setSelected(Math.max(0, index - 1))
    setLive(`${rule.name} deleted`)
  }

  /* One menu in the top bar, and it holds only what is true of the *policy*.

     There were two — Tools and Actions — and Actions carried "Delete this rule"
     next to "Save as template", which is a footgun and a category error in the
     same row: one is scoped to the rule you happen to have selected, the other
     to the whole policy. Rule-scoped actions moved onto the rule (the ⋯ beside
     its name), which is both where they belong and where they stop needing a
     "this rule" in their label to be unambiguous. */
  const policyItems: MenuItem[] = [
    { id: 'test', label: 'Test a sign-in', icon: Sparkles, hint: 'One person, end to end' },
    ...(features.gauntlet
      ? [{ id: 'gauntlet', label: 'Policy gauntlet', icon: Swords, hint: '13 attempts against these rules' }]
      : []),
    ...(features.blastRadius ? [{ id: 'impact', label: 'Blast radius', icon: Target, hint: 'What publishing moves' }] : []),
    { id: 'log', label: 'Decision log', icon: ScrollText, hint: 'What the engine actually did' },
    { id: 'overview', label: 'Read it end to end', icon: BookOpen },
    { id: 'apps', label: `Assign apps (${draft.allApps ? 'all' : draft.appIds.length})`, icon: Grid3x3, divide: true },
    { id: 'template', label: 'Save as template', icon: FileDown },
    /* v0 §8. Restored whenever the Review step is withheld: taking the publish
       gate away must not also take away the only way to read a policy back and
       commit it, which is a v0 requirement rather than one of ours. */
    ...(features.reviewStep
      ? []
      : [{ id: 'review', label: 'Review & Save', icon: ClipboardCheck, hint: 'Read it back, then commit' }]),
    ...(features.commands ? [{ id: 'cmd', label: 'All commands', icon: Command, kbd: '⌘K' }] : []),
    { id: 'learn', label: 'Learn the builder', icon: GraduationCap, hint: 'The tour, and five guides', divide: true },
  ]

  const onAction = (id: string) => {
    if (id === 'add') return addRule(index + 1)
    if (id === 'duplicate') return duplicate()
    if (id === 'copy') return setDialog('copy')
    if (id === 'delete') return remove()
    if (id === 'cmd') return setCmd(true)
    if (id === 'overview') return setOverview(true)
    if (id === 'learn') return setLearn(true)
    if (id === 'review') return setDialog('review')
    setDialog(id as typeof dialog)
  }

  return (
    <div className="bpage bf is-bench">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* --- Top bar. One primary, one group of tools, one group of actions. --- */}
      <header className="bf__bar">
        <IconButton icon={ArrowLeft} label="Back to policies" tone="ghost" onClick={() => store.go({ name: 'policies' })} />
        <input className="bf__name" aria-label="Policy name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />

        <div className="bf__baracts">
          {/* The blast-radius pip only exists once there is a blast radius. It
              used to sit here permanently reading "no change", which is a
              control occupying the bar to report nothing — and it made the one
              case that matters, a draft that moves people, look like more of
              the same furniture. */}
          <span className="bf__pips" data-tour="gauntlet">
            {features.gauntlet && <GauntletPip policy={draft} onOpen={() => setDialog('gauntlet')} />}
            {features.blastRadius && dirty && <ImpactPip draft={draft} saved={saved} onOpen={() => setDialog('impact')} />}
          </span>
          <span className="bf__sep" aria-hidden />
          {/* On the bar, not in a menu. The tour used to be reachable only from
              the Policy menu, which makes "show me that again" a search — and
              everything else explanatory had nowhere to live at all. */}
          <IconButton
            icon={PanelLeft}
            label={railOpen ? 'Hide the sequence' : 'Show the sequence'}
            size="sm"
            tone="ghost"
            onClick={() => {
              setRailOpen((v) => !v)
              setFlowOpen((v) => !v)
            }}
          />
          <IconButton icon={GraduationCap} label="Learn the builder" size="sm" tone="ghost" onClick={() => setLearn(true)} />
          <IconButton icon={Undo2} label="Undo" size="sm" tone="ghost" disabled={!canUndo(hist)} onClick={() => setHist(undo)} />
          <IconButton icon={Redo2} label="Redo" size="sm" tone="ghost" disabled={!canRedo(hist)} onClick={() => setHist(redo)} />
          <MenuButton label="Policy" items={policyItems} onSelect={onAction} />
          {/* One primary per view. In the review stage the primary is the
              Publish button at the end of the checks, so this one stands down
              rather than competing with it. In lite there is no review stage to
              send anyone to; v0 commits from Review & Save in the Policy menu. */}
          {features.publish && stage !== 'review' && (
            <Button variant="secondary" disabled={rules.length === 0} onClick={() => setStage('review')}>
              {blockers > 0 ? `${blockers} to fix` : 'Review & publish'}
            </Button>
          )}
        </div>
      </header>

      <div className={`bf__work ${flowOpen ? 'is-flowopen' : ''} ${railOpen ? '' : 'is-railshut'}`} ref={work}>
        {/* Dismisses on a click anywhere off the panel. Only in the DOM while
            the panel is, so it can never swallow a click on the work. */}
        {flowOpen && (
          <button type="button" className="bf__flowscrim" aria-label="Close the sequence" onClick={() => setFlowOpen(false)} />
        )}

        {/* --- The sequence, floating ---------------------------------------- */}
        <div className="bf__flowdock" style={{ ['--flow-w' as string]: `${FLOW_W}px` }} aria-hidden={!flowOpen}>
          <FlowRail
            policy={draft}
            selected={index}
            diagnostics={diagnostics}
            shadowed={shadowed}
            onSelect={(i) => {
              jump(i)
              setFlowOpen(false)
            }}
            onInsert={(at) => {
              addRule(at)
              setFlowOpen(false)
            }}
            onMove={move}
            onReorder={move}
            onHover={setHoverShadow}
            onClose={() => setFlowOpen(false)}
            onFallback={(fallback) => patch({ fallback })}
            audience={<AudienceBar audience={draft.audience} groups={store.groups} users={store.users} max={3} />}
            reach={reach(draft.audience, store.groups, store.users)}
            emptyAudience={emptyAudience}
            onAudience={() => setAudienceOpen(true)}
          />
        </div>

        {/* --- The bench ------------------------------------------------------

            One rule at a time, in a pane whose top is the outcome.

            The accordion list this replaces put WHEN above THEN inside a shared
            scroller, so the outcome — the thing an auditor reads first — was
            pushed further down the page with every condition added. Of the
            fourteen automation builders surveyed, not one does that; the two
            that come close survive only by bounding the condition side, and
            this model has unbounded alternatives.

            So THEN stops being a section of the rule and becomes the chrome of
            the rule: a fixed header that cannot scroll, cannot grow, and does
            not move by a pixel no matter how large WHEN gets. The canvas
            beneath it owns the only unbounded scroll in the builder. */}
        <section className="bf__bench">
          {stage === 'review' ? (
            <div className="bf__reviewstage" ref={stageEl}>
              <button type="button" className="bf__backrules" onClick={() => setStage('rules')}>
                <ArrowLeft size={13} strokeWidth={2} aria-hidden />
                Back to rules
              </button>
              <ReviewStep
                draft={draft}
                saved={saved}
                env={env}
                onJump={jump}
                onOpen={(d) => setDialog(d)}
                onPublish={(status) => {
                  const shipped = { ...draft, status }
                  patch({ status })
                  store.savePolicy(shipped)
                  store.showToast(
                    status === 'monitor'
                      ? `${draft.name} is monitoring — evaluating every sign-in, enforcing nothing`
                      : `${draft.name} published and enforcing`,
                  )
                }}
              />
            </div>
          ) : !rule ? (
            <div className="bf__blank">
              <Sparkles size={22} strokeWidth={1.6} aria-hidden />
              <h2>This policy has no rules</h2>
              <p>Every sign-in falls through to “{FALLBACK_SUB[draft.fallback ?? '1fa']}” until there is one.</p>
              <div className="bf__blankacts">
                {features.guidedSetup && (
                  <Button variant="primary" icon={Wand2} onClick={() => setInterview(true)}>
                    Guided setup
                  </Button>
                )}
                <Button icon={Plus} onClick={() => addRule()}>
                  Add the first rule
                </Button>
              </div>
            </div>
          ) : (
            <>
              <VerdictHeader
                rule={rule}
                index={index}
                onPatch={(p) => patchRuleAt(index, p)}
                onAction={onAction}
                resolve={resolve}
              />

              <div className="bf__canvas" ref={stageEl} data-tour="stage" tabIndex={0} role="region" aria-label="Conditions">
                <WhenSection
                  rule={rule}
                  ctx={ctx}
                  onPatch={(p) => patchRuleAt(index, p)}
                  hit={trace.hitIndex === index ? hitCard : null}
                  onCatalogue={setCatalogue}
                  catalogue={catalogue}
                />
              </div>

              {/* Pinned. A finding about the rule you are editing is not
                  something to scroll for — and it is the Check step's content,
                  so lite, which withholds that step, does not get the bar. */}
              {features.checkStep && (
              <footer className="bf__checksbar">
                {mine.length === 0 ? (
                  <p className="bf__checkclear">
                    <Check size={12} strokeWidth={2.6} aria-hidden />
                    Nothing to fix on this rule
                  </p>
                ) : (
                  mine.slice(0, 4).map((d) => (
                    <p key={d.id} className={`bf__rulecheck is-${d.severity}`}>
                      {d.severity === 'error' ? (
                        <XCircle size={12} strokeWidth={2} aria-hidden />
                      ) : d.severity === 'warning' ? (
                        <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                      ) : (
                        <Info size={12} strokeWidth={2} aria-hidden />
                      )}
                      <span>
                        <strong>{d.title}</strong> {d.detail}
                      </span>
                      {d.relatedIndex !== undefined && (
                        <button type="button" onClick={() => jump(d.relatedIndex!)}>
                          Rule {d.relatedIndex + 1}
                        </button>
                      )}
                    </p>
                  ))
                )}
              </footer>
              )}
            </>
          )}
        </section>

      </div>

      {/* --- The tester. ------------------------------------------------------

          One line, always on, under everything. It is not optional polish: it
          is the only writer of the preview context every condition in the
          builder is evaluated against, so hiding it behind a toggle froze the
          whole screen's answer to "would this match" on a default nobody chose,
          with nothing saying so. */}
      {rules.length > 0 && stage === 'rules' && (
        <footer className="bf__try" data-tour="try">
          <span className="u-label">Try it</span>
          <Picker
            label="Person"
            value={pv.userId}
            options={SIM_USERS.map((u) => ({ value: u.id, label: u.name, meta: u.groupName }))}
            onChange={(userId) => setPv({ ...pv, userId })}
          />
          <em>from</em>
          <Picker
            label="Where from"
            value={pv.place}
            options={PLACES.map((p) => ({ value: p, label: p }))}
            onChange={(place) => setPv({ ...pv, place })}
          />
          <em>on</em>
          <Picker
            label="Device"
            value={pv.device}
            options={DEVICE_OPTIONS.map((d) => ({ value: d, label: d }))}
            onChange={(device) => setPv({ ...pv, device })}
          />
          <Picker
            label="Risk"
            value={pv.risk}
            options={RISKS.map((r) => ({ value: r, label: `${r} risk` }))}
            onChange={(risk) => setPv({ ...pv, risk })}
          />

          <span className={`bf__tryout is-${DEC_KEY[trace.decision]}`}>
            {trace.outOfAudience ? (
              <>Not governed — this policy does not apply to {ctx.user.name}</>
            ) : trace.hitIndex === null ? (
              <>Nothing matched — {FALLBACK_SUB[draft.fallback ?? '1fa']}</>
            ) : (
              <>
                Rule {trace.hitIndex + 1} · {rules[trace.hitIndex].name}
              </>
            )}
          </span>

          <Tip text={PREVIEW_CAVEAT} placement="top">
            <span className="bf__trynote" aria-label="How this is calculated">
              ?
            </span>
          </Tip>
        </footer>
      )}

      <footer className={`bf__stepnav ${dirty ? 'is-dirty' : ''}`}>
        <span className="bf__stepwhere">
          {dirty ? (
            <>
              <b>{changes[0]}</b>
              {changes.length > 1 && <i>and {changes.length - 1} more</i>}
            </>
          ) : stage === 'review' ? (
            'Read it back, then ship it'
          ) : (
            `${rules.length} rule${rules.length === 1 ? '' : 's'} · first match wins`
          )}
        </span>

        {dirty && (
          <Button variant="ghost" onClick={() => setHist(historyOf(saved))}>
            Discard
          </Button>
        )}

        {stage === 'rules' ? (
          features.reviewStep ? (
            <Button
              variant="primary"
              iconRight={ArrowRight}
              disabled={rules.length === 0}
              onClick={() => setStage('review')}
            >
              {blockers > 0 ? `${blockers} to fix` : 'Check & review'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setDialog('review')}>
              Review &amp; save
            </Button>
          )
        ) : (
          <Button variant="secondary" icon={ArrowLeft} onClick={() => setStage('rules')}>
            Keep editing
          </Button>
        )}
      </footer>

      <AudienceDrawer
        open={audienceOpen}
        audience={draft.audience}
        groups={store.groups}
        users={store.users}
        unlisted={store.unlistedUsers}
        onClose={() => setAudienceOpen(false)}
        onApply={(audience: Audience) => patch({ audience })}
      />

      <AnimatePresence>
        {features.commands && cmd && (
          <CommandBar
            commands={baseCommands(rules, { canUndo: canUndo(hist), canRedo: canRedo(hist) })}
            onClose={() => setCmd(false)}
            onRun={(id) => {
              setCmd(false)
              if (id.startsWith('rule:')) return jump(Number(id.slice(5)))
              if (id === 'add') return addRule()
              if (id === 'undo') return setHist(undo)
              if (id === 'redo') return setHist(redo)
              if (id === 'publish') return setStage('review')
              setDialog(id as typeof dialog)
            }}
          />
        )}
      </AnimatePresence>

      <PolicyOverview open={overview} policy={draft} resolve={resolve} diagnostics={diagnostics} onClose={() => setOverview(false)} onJump={jump} />

      {/* Scoped to the builder. The create flow already has guided setup; this
          is for the screen you land on afterwards. */}
      {learn && (
        <Suspense fallback={null}>
          <LearnPanel open={learn} onClose={() => setLearn(false)} onStartTour={() => setTour(true)} />
        </Suspense>
      )}

      {tour && (
        <Suspense fallback={null}>
          <Tour
            open={tour}
            onClose={() => setTour(false)}
            onFinish={() => setDialog('gauntlet')}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {interview && (
          <Suspense fallback={null}>
          <Interview
            open={interview}
            onClose={() => setInterview(false)}
            onCreate={(built, builtName, audience) => {
              patch({ rules: built, audience, name: draft.name === 'Untitled policy' ? builtName : draft.name })
              setInterview(false)
              setSelected(0)
              store.showToast(`${built.length} rules written — review them before publishing`)
            }}
          />
          </Suspense>
        )}
      </AnimatePresence>

      <DecisionLogDialog open={dialog === 'log'} policy={draft} onClose={() => setDialog(null)} />
      <TestPolicyDialog open={dialog === 'test'} policy={draft} onClose={() => setDialog(null)} />
      <GauntletDialog
        open={features.gauntlet && dialog === 'gauntlet'}
        policy={draft}
        onClose={() => setDialog(null)}
        onJumpToRule={jump}
        onApplyFix={(fix) => {
          patch({ rules: applyFix(rules, fix) })
          setSelected(fix.at)
          const what = fix.kind === 'insert' ? 'inserted as' : 'now'
          setLive(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
          store.showToast(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
        }}
      />
      <ReviewDialog
        open={dialog === 'review'}
        policy={draft}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          store.savePolicy(draft)
          setDialog(null)
          store.showToast(`${draft.name} saved`)
        }}
        onAssignApps={() => setDialog('apps')}
      />

      <ImpactArenaDialog open={features.blastRadius && dialog === 'impact'} draft={draft} saved={saved} onClose={() => setDialog(null)} onJumpToRule={jump} />
      <AssignAppsDialog
        open={dialog === 'apps'}
        policy={draft}
        onClose={() => setDialog(null)}
        onChange={(appIds, allApps) => patch({ appIds, allApps })}
      />
      <CopyRuleDialog open={dialog === 'copy'} rule={rule} from={draft} onClose={() => setDialog(null)} />
      <SaveTemplateDialog
        open={dialog === 'template'}
        policy={draft}
        onClose={() => setDialog(null)}
        onSave={(t) => {
          setDialog(null)
          store.showToast(`${t.name} saved as a template`)
        }}
      />
    </div>
  )
}

/* -----------------------------------------------------------------------------
   The verdict — the outcome as the bench's chrome.

   `ThenSection` was about 316px: three outcome tiles over five stacked property
   rows, which is a form. A form beneath an unbounded condition block is a form
   nobody sees. Compressed to three fixed rows it becomes affordable to pin, and
   pinning it is the only arrangement where "the more work you do, the further
   away the outcome gets" cannot be true.

   Row A  the decision, as one three-segment control
   Row B  the settings, as chips that never wrap
   Row C  the whole rule as one line of prose

   The height is fixed and tiered by viewport height. It never scrolls. The
   moment it can scroll it has stopped being the fix.
   -------------------------------------------------------------------------- */

const VERDICTS: { id: AccessDecision; label: string; sub: string }[] = [
  { id: 'deny', label: 'Deny', sub: 'The sign-in is refused outright' },
  { id: '1fa', label: 'Allow', sub: 'The first factor alone is enough' },
  { id: '2fa', label: 'Allow + 2nd factor', sub: 'A second factor before access' },
]

function VerdictHeader({
  rule,
  index,
  onPatch,
  onAction,
  resolve,
}: {
  rule: Rule
  index: number
  onPatch: (p: Partial<Rule>) => void
  onAction: (id: string) => void
  resolve: NameLookup
}) {
  const sentence = ruleSentence(rule, resolve)
  const line = `${VERDICTS.find((v) => v.id === rule.decision)?.label} — when ${sentence.iff}`

  return (
    <header className="bf__verdict">
      <div className="bf__vseg">
        <span className={`bf__ruleno is-${DEC_KEY[rule.decision]}`}>{index + 1}</span>

        {/* One control over one field.

            The two outcome tiles and the "require a second factor" switch were
            two controls writing to `decision`, and you could only discover that
            the settings belonged to both by picking one of them. Three explicit
            positions, and the chips below appear and disappear as you move
            between them. */}
        <div className="bf__vsegctl" role="radiogroup" aria-label="What happens">
          {VERDICTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={rule.decision === v.id}
              title={v.sub}
              className={`is-${DEC_KEY[v.id]} ${rule.decision === v.id ? 'is-on' : ''}`}
              onClick={() => onPatch({ decision: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>

        <input
          className="bf__ruleName"
          aria-label="Rule name"
          value={rule.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />

        <label className="bf__ruleon">
          <Toggle checked={rule.enabled} onChange={(v) => onPatch({ enabled: v })} label={`Enable ${rule.name}`} size="sm" />
        </label>

        <MenuButton
          label={`${rule.name} actions`}
          iconOnly
          icon={MoreHorizontal}
          size="sm"
          align="end"
          items={[
            { id: 'add', label: 'Add a rule below', icon: Plus },
            { id: 'duplicate', label: 'Duplicate', icon: Copy },
            { id: 'copy', label: 'Copy to another policy…', icon: CopyPlus },
            { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
          ]}
          onSelect={onAction}
        />
      </div>

      <FactorChips rule={rule} onPatch={onPatch} />

      <p className="bf__vline" title={`${line}. ${sentence.then}`}>
        {line}
      </p>
    </header>
  )
}

/* The five property rows, as chips.

   Off states are ghost chips rather than omissions, so the shape of the outcome
   is constant and nobody has to remember that a setting exists. Depth goes
   sideways into a popover, never downward into the header — that is what keeps
   the height provably fixed at every width. */
function FactorChips({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  if (rule.decision === 'deny') {
    return (
      <div className="bf__vprops">
        <span className="bf__pchip is-ghost">No prompt, no alternate path</span>
      </div>
    )
  }

  const second =
    rule.secondFactor === 'specific'
      ? (rule.secondFactorMethods ?? []).join(' or ') || 'nothing chosen'
      : rule.secondFactor === 'chain'
        ? `${(rule.methodChain ?? []).length}-step chain`
        : rule.secondFactor === 'preferred'
          ? 'their preferred'
          : 'any enabled'

  const noMethods = rule.secondFactor === 'specific' && (rule.secondFactorMethods ?? []).length === 0

  return (
    <div className="bf__vprops">
      <Chip label="First factor" value={rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'Specific') : rule.firstFactor}>
        <div className="bf__seg">
          {(['Password', 'Any', 'Specific'] as const).map((f) => (
            <button key={f} type="button" className={rule.firstFactor === f ? 'is-on' : ''} onClick={() => onPatch({ firstFactor: f })}>
              {f}
            </button>
          ))}
        </div>
        {rule.firstFactor === 'Specific' && (
          <Picker
            label="First-factor method"
            width="fill"
            value={rule.firstFactorMethod ?? METHODS[0]}
            options={METHODS.map((m) => ({ value: m, label: m }))}
            onChange={(firstFactorMethod) => onPatch({ firstFactorMethod })}
          />
        )}
      </Chip>

      {rule.decision === '2fa' && (
        <>
          <Chip label="Second factor" value={second} tone={noMethods ? 'negative' : undefined}>
            <Picker
              label="Second factor mode"
              width="fill"
              value={rule.secondFactor}
              options={[
                { value: 'any', label: 'Any enabled method' },
                { value: 'specific', label: 'Specific method(s)' },
                { value: 'chain', label: 'Method chain', meta: 'Every step, in order' },
                { value: 'preferred', label: 'The user’s preferred method' },
              ]}
              onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
            />
            {rule.secondFactor === 'specific' && (
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
            )}
            {rule.secondFactor === 'chain' && <ChainEditor rule={rule} onPatch={onPatch} />}
            {rule.secondFactor === 'preferred' && (
              <Picker
                label="Fallback method"
                width="fill"
                value={rule.preferredFallback ?? METHODS[0]}
                options={METHODS.map((m) => ({ value: m, label: m }))}
                onChange={(preferredFallback) => onPatch({ preferredFallback })}
              />
            )}
          </Chip>

          <Chip
            label="Remembered"
            value={rule.rememberMfa ? `${rule.rememberDays ?? 30} days` : 'no'}
            ghost={!rule.rememberMfa}
          >
            <label className="bf__switchrow">
              <Toggle checked={rule.rememberMfa} onChange={(v) => onPatch({ rememberMfa: v })} label="Remember this device" size="sm" />
              <span>Skip the second factor on a device that already passed</span>
            </label>
            {rule.rememberMfa && (
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
            )}
          </Chip>

          <Chip
            label="Every login"
            value={rule.forceMfaEachLogin ? 'yes' : 'no'}
            ghost={!rule.forceMfaEachLogin}
          >
            <label className="bf__switchrow">
              <Toggle
                checked={rule.forceMfaEachLogin ?? false}
                onChange={(v) => onPatch({ forceMfaEachLogin: v })}
                label="Force MFA on every login"
                size="sm"
              />
              <span>Prompt every time anyway, remembered device or not</span>
            </label>
          </Chip>

          <Chip
            label="Users may disable"
            value={rule.allowDisable2fa ? 'yes' : 'no'}
            ghost={!rule.allowDisable2fa}
            tone={rule.allowDisable2fa ? 'notice' : undefined}
          >
            <label className="bf__switchrow">
              <Toggle checked={rule.allowDisable2fa} onChange={(v) => onPatch({ allowDisable2fa: v })} label="Allow users to disable 2FA" size="sm" />
              <span>Let users switch their own second factor off</span>
            </label>
          </Chip>
        </>
      )}
    </div>
  )
}

/* A chip that opens one property. The popover is portalled for the same reason
   the Picker's is: the header is a fixed-height grid row, and anything that
   opened inside it would either be clipped or make it grow. */
function Chip({
  label,
  value,
  ghost,
  tone,
  children,
}: {
  label: string
  value: string
  ghost?: boolean
  tone?: 'negative' | 'notice'
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      if (!a) return
      const w = pop.current?.getBoundingClientRect().width ?? 280
      setPos({ top: a.bottom + 5, left: Math.max(8, Math.min(a.left, window.innerWidth - w - 8)) })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={`bf__pchip ${ghost ? 'is-ghost' : ''} ${tone ? `is-${tone}` : ''} ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <em>{label}</em>
        {value}
        <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="dialog"
            aria-label={label}
            className="bf__pchippop"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            <h4 className="u-label">{label}</h4>
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

function ChainEditor({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const chain = rule.methodChain ?? ['TOTP Authenticator']
  return (
    <div className="bf__chain">
      {chain.map((step, si) => (
        <span className="bf__chainstep" key={si}>
          <b>{si + 1}</b>
          <Picker
            label={`Chain step ${si + 1}`}
            width="fill"
            value={step}
            options={['Password', ...METHODS].map((m) => ({ value: m, label: m }))}
            onChange={(v) => {
              const next = [...chain]
              next[si] = v
              onPatch({ methodChain: next })
            }}
          />
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
    </div>
  )
}
