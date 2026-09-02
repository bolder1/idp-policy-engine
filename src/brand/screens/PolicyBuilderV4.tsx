import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Command,
  Copy,
  CopyPlus,
  FileDown,
  Grid3x3,
  Info,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Redo2,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  Trash2,
  GraduationCap,
  Undo2,
  Users,
  Wand2,
  XCircle,
} from 'lucide-react'

import { Button, Counter, DecisionChip, IconButton, MenuButton, Tip, Toggle, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { blankRule, reach, type Audience, type Policy, type Rule } from '../data'
import { useBrand, useNameLookup } from '../store'
import { AudienceBar, AudienceDrawer } from './audience-drawer'
import { predicateSummary, ruleSentence } from './predicate-prose'
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
import { FlowRail } from './flow-rail'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from './history'
import { PolicyOverview } from './overview'
import { ReviewStep } from './review-step'
import { applyFix } from './gauntlet'
import { GauntletDialog, GauntletPip } from './gauntlet-dialog'
import { ImpactArenaDialog, ImpactPip } from './impact-arena-dialog'
import {
  DEC_KEY,
  DEFAULT_PREVIEW,
  PREVIEW_CAVEAT,
  ThenSection,
  WhenSection,
  previewContext,
  ruleState,
  type PreviewState,
} from './rule-form'
import { DEVICE_OPTIONS, PLACES, RISKS, SIM_USERS, evalRule, walk, type SimEnv } from './simulate'
import type { Diagnostic } from './diagnostics'

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

export function PolicyBuilderV4({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selected, setSelected] = useState(0)
  const [stage, setStage] = useState<Stage>('rules')
  const [audienceOpen, setAudienceOpen] = useState(false)
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
      <div className="bpage bf">
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
    <div className="bpage bf">
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

      <div className={`bf__work ${flowOpen ? 'is-flowopen' : ''}`} ref={work}>
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
          />
        </div>

        {/* --- Middle: the trail --------------------------------------------- */}
        <main className="bf__main">
          {/* --- The rules, or the review. Two scopes, drawn as two scopes. ---

              There was a five-step trail here — Who, When, Then, Check, Review
              — and it is gone. Who is a property of the policy, so it is in the
              header above. Check and Review are about the whole policy, so they
              are one stage at the end. What is left is a rule, and a rule is
              one card that shows its When and its Then together, which is what
              "figma style when and then" means: a conditional is a thing that
              contains its branches, not a wizard you walk. */}
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
          ) : (
            <div className="bf__stage" ref={stageEl} data-tour="stage">
              {/* --- Step one: who. -----------------------------------------

                  This was a caption on a strip between the top bar and the
                  work, and it read as metadata — the kind of line you scan past
                  on the way to the thing you came to do. It is not metadata. It
                  is the first decision the policy makes and the widest claim it
                  makes, and on a new policy it is the first thing that should
                  be answered.

                  So it is a step, in the stage, above the rules, with the same
                  card treatment they have. The sequence a person reads down the
                  page — who, then the rules, then check and review — is the
                  order the work actually happens in. */}
              <section className={`bf__who ${emptyAudience ? 'is-empty' : ''}`} data-tour="audience">
                <span className="bf__stepn" aria-hidden>
                  1
                </span>
                <div className="bf__whobody">
                  <h2>Who this policy applies to</h2>
                  {emptyAudience ? (
                    <p className="bf__wholine is-empty">
                      No groups and no people are selected, so none of these rules can ever run.
                    </p>
                  ) : (
                    <p className="bf__wholine">
                      <AudienceBar audience={draft.audience} groups={store.groups} users={store.users} max={6} />
                      <span className="bf__whocount">
                        <Counter value={reach(draft.audience, store.groups, store.users)} /> people
                      </span>
                    </p>
                  )}
                  <p className="bf__whonote">
                    Every rule below inherits this. No rule can reach further than the policy does.
                  </p>
                </div>
                <Button
                  variant={emptyAudience ? 'primary' : 'secondary'}
                  icon={Users}
                  onClick={() => setAudienceOpen(true)}
                >
                  {draft.audience.everyone ? 'Narrow this' : 'Change'}
                </Button>
              </section>

              <div className="bf__ruleshead">
                <span className="bf__stepn" aria-hidden>
                  2
                </span>
                <h2>Rules</h2>
                <em>{rules.length === 0 ? 'None yet' : 'Evaluated top to bottom — the first one that matches decides'}</em>
                {/* The way into the sequence, at every width. It carries the
                    count so the rail's one permanently-useful fact is on screen
                    even while the rail is not. */}
                <button
                  type="button"
                  className="bf__flowbtn"
                  aria-expanded={flowOpen}
                  onClick={() => setFlowOpen((v) => !v)}
                >
                  <ListOrdered size={13} strokeWidth={1.9} aria-hidden />
                  Order
                  <span>{rules.length}</span>
                </button>
              </div>

              {rules.length === 0 ? (
                <div className="bf__blank">
                  <Sparkles size={22} strokeWidth={1.6} aria-hidden />
                  <h2>This policy has no rules</h2>
                  <p>Every sign-in falls through to the engine default until there is one.</p>
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
                <ol className="bf__rules">
                  {rules.map((r, i) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      index={i}
                      open={i === index}
                      ctx={ctx}
                      hit={i === index ? hitCard : null}
                      diagnostics={diagnostics.filter((d) => d.ruleIndex === i)}
                      features={features}
                      onOpen={() => jump(i)}
                      onPatch={(p) => patchRuleAt(i, p)}
                      onAction={(a) => {
                        setSelected(i)
                        onAction(a)
                      }}
                      onJump={jump}
                    />
                  ))}
                  <li className="bf__addrule">
                    <button type="button" onClick={() => addRule()}>
                      <Plus size={13} strokeWidth={2.4} aria-hidden />
                      Add a rule
                    </button>
                  </li>
                </ol>
              )}
            </div>
          )}

          {/* --- The tester, docked. -------------------------------------------

              This used to be one of three panels taking turns behind an icon in
              the top right. It is not optional: it is the only writer of the
              preview context every condition is evaluated against, so hiding it
              behind a toggle froze the whole builder's answer to "would this
              match" on a default nobody chose, with nothing on screen saying
              so. Always on, one line, at the bottom of the work. */}
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
                  <>No rule matched · falls through to the default</>
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

          {/* --- One bar, docked. Unsaved changes and the way forward. ------- */}
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
                `${rules.length} rule${rules.length === 1 ? '' : 's'} · evaluated top to bottom, first match wins`
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
                /* Lite has no publish gate. v0 commits from Review & Save in
                   the Policy menu, which is a v0 requirement rather than one of
                   ours, so the menu keeps it and this stands down. */
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
        </main>
      </div>

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
   One rule, one card.

   Collapsed it is a row you can scan: order, name, what it decides, what it
   matches on, and whether anything is wrong with it. Open it is the whole rule
   — When and Then side by side on a wide window — with the linter's findings
   about it in a strip at the bottom.

   This is what replaced the five-step trail and the "All together" toggle. The
   toggle existed to answer "show me this whole rule at once"; the answer is now
   structural rather than a mode, because a rule IS one card and every part of
   it is on screen at the same time.
   -------------------------------------------------------------------------- */
function RuleCard({
  rule,
  index,
  open,
  ctx,
  hit,
  diagnostics,
  features,
  onOpen,
  onPatch,
  onAction,
  onJump,
}: {
  rule: Rule
  index: number
  open: boolean
  ctx: ReturnType<typeof previewContext>
  hit: number | null
  diagnostics: Diagnostic[]
  features: { checkStep: boolean }
  onOpen: () => void
  onPatch: (p: Partial<Rule>) => void
  onAction: (id: string) => void
  onJump: (i: number) => void
}) {
  const reduce = useReducedMotion()
  const resolve = useNameLookup()
  const el = useRef<HTMLLIElement | null>(null)
  const st = ruleState(diagnostics)

  /* Open a rule from the flow rail, the command palette or a diagnostic's "open
     rule N" and the card expands wherever it happens to be — which, with five
     rules and one of them tall, is regularly off-screen in both directions.

     `block: 'nearest'` rather than 'start': a card already fully visible must
     not be yanked to the top, because the commonest way to open one is to click
     its own header and having the page jump under the cursor is worse than not
     scrolling at all. The delay lets the accordion lay out first, so the browser
     measures the open height rather than the closed one. */
  useEffect(() => {
    if (!open || !el.current) return
    const t = window.setTimeout(
      () => el.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }),
      reduce ? 0 : 240,
    )
    return () => window.clearTimeout(t)
  }, [open, reduce])
  const errors = diagnostics.filter((d) => d.severity === 'error').length

  const ruleItems: MenuItem[] = [
    { id: 'add', label: 'Add a rule below', icon: Plus },
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { id: 'copy', label: 'Copy to another policy…', icon: CopyPlus, hint: 'An independent copy' },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
  ]

  return (
    <li ref={el} className={`bf__rule ${open ? 'is-open' : ''} ${rule.enabled ? '' : 'is-off'}`}>
      <div className="bf__rulehead">
        <span className={`bf__ruleno is-${DEC_KEY[rule.decision]}`}>{index + 1}</span>

        {open ? (
          <input
            className="bf__ruleName"
            aria-label="Rule name"
            value={rule.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        ) : (
          <button type="button" className="bf__ruleopen" onClick={onOpen}>
            <strong>{rule.name}</strong>
            <em>{predicateSummary(rule.when)}</em>
          </button>
        )}

        <DecisionChip decision={rule.decision} size="sm" />

        {/* Dot and label, never colour alone. */}
        <span className={`bf__rulestate is-${st}`}>
          <i aria-hidden />
          {st === 'ready' ? 'Ready' : st === 'warn' ? 'Worth a look' : `${errors || 'Needs'} to fix`}
        </span>

        <label className="bf__ruleon">
          <Toggle
            checked={rule.enabled}
            onChange={(v) => onPatch({ enabled: v })}
            label={`Enable ${rule.name}`}
            size="sm"
          />
        </label>

        <MenuButton
          label={`${rule.name} actions`}
          iconOnly
          icon={MoreHorizontal}
          size="sm"
          align="end"
          items={ruleItems}
          onSelect={onAction}
        />

        <button
          type="button"
          className="bf__ruletoggle"
          aria-expanded={open}
          aria-label={open ? `Collapse ${rule.name}` : `Open ${rule.name}`}
          onClick={onOpen}
        >
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="bf__rulebody"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
          >
            <div className="bf__ruleinner">
              {/* Borderless until focused, so an empty one is an invitation and
                  a filled one reads as a caption rather than as a form field. */}
              <textarea
                className="bf__rulewhy"
                aria-label="Why this rule exists"
                rows={1}
                placeholder="Why does this rule exist? The next person will read this before changing it."
                value={rule.description ?? ''}
                onChange={(e) => onPatch({ description: e.target.value })}
              />

              {/* When and Then, together. Side by side once there is room —
                  which is the honest version of what "All together" was a
                  toggle for. */}
              <div className="bf__rulegrid">
                <WhenSection rule={rule} ctx={ctx} onPatch={onPatch} bare hit={hit} />
                <ThenSection rule={rule} onPatch={onPatch} bare />
              </div>

              {features.checkStep && diagnostics.length > 0 && (
                <div className="bf__rulechecks">
                  {diagnostics.map((d) => (
                    <p key={d.id} className={`bf__rulecheck is-${d.severity}`}>
                      {d.severity === 'error' ? (
                        <XCircle size={13} strokeWidth={2} aria-hidden />
                      ) : d.severity === 'warning' ? (
                        <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                      ) : (
                        <Info size={13} strokeWidth={2} aria-hidden />
                      )}
                      <span>
                        <strong>{d.title}</strong> {d.detail}
                      </span>
                      {d.relatedIndex !== undefined && (
                        <button type="button" onClick={() => onJump(d.relatedIndex!)}>
                          Open rule {d.relatedIndex + 1}
                        </button>
                      )}
                    </p>
                  ))}
                </div>
              )}

              <p className="bf__ruleprose">
                <span className="u-label">In words</span>
                {ruleSentence(rule, resolve).then}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
