import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Copy,
  CopyPlus,
  FileDown,
  Info,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Redo2,
  ScrollText,
  Sparkles,
  Trash2,
  GraduationCap,
  Undo2,
  Wand2,
  XCircle,
} from 'lucide-react'

import { Button, DecisionChip, IconButton, MenuButton, Toggle, type MenuItem } from '../kit'
import { blankRule, type Audience, type Policy, type Rule } from '../data'
import { useBrand, useNameLookup } from '../store'
import { AudienceDrawer } from './audience-drawer'
import { predicateSummary, ruleSentence } from './predicate-prose'
import { AssignAppsDialog, CopyRuleDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog } from './builder-test'
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
import { DEC_KEY, ThenSection, WhenSection, ruleState } from './rule-form'
import type { SimEnv } from './simulate'
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

/* Below this the rules panel stops being a column and floats over the
   playground. 320px of a 900px window is a third of it spent on a list you
   consult, while the thing being edited is the reason you are here. */
const RAIL_FLOATS = '(max-width: 900px)'

function useFloatingRail() {
  const [floating, setFloating] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(RAIL_FLOATS).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(RAIL_FLOATS)
    const on = () => setFloating(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return floating
}

export function PolicyBuilderMain({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selected, setSelected] = useState(0)
  const [stage, setStage] = useState<Stage>('rules')
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [live, setLive] = useState('')
  const [hoverShadow, setHoverShadow] = useState<number | null>(null)
  const [cmd, setCmd] = useState(false)
  const [overview, setOverview] = useState(false)
  const features = store.features
  const [interview, setInterview] = useState(false)
  const [tour, setTour] = useState(false)
  const [learn, setLearn] = useState(false)
  const [dialog, setDialog] = useState<null | 'log' | 'apps' | 'template' | 'gauntlet' | 'impact' | 'review' | 'copy'>(
    open ?? null,
  )

  const stageEl = useRef<HTMLDivElement | null>(null)
  const work = useRef<HTMLDivElement | null>(null)

  /* --- The flow's width, dragged. v1's grammar ---------------------------------
     Clamped against the room that actually exists, so the flow never claims a
     width the window cannot give it, and the trail always keeps TRAIL_MIN. */
  /* Open by default and collapsible, the way a side panel behaves rather than
     the way a drawer does: it holds the sequence, which is half of what this
     screen is about, so hiding it is a choice rather than the resting state.

     Narrow, it is a drawer again — over the playground, with a scrim, closing
     as soon as it has been used. Docked it does none of those things, because a
     column that vanishes every time you pick a rule is not a column. */
  const floating = useFloatingRail()
  const [flowOpen, setFlowOpen] = useState(!floating)

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

  const resolve = useNameLookup()
  const draft = hist.present

  if (!saved || !draft.id) {
    return (
      <div className="bpage bf is-main">
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

  /* A policy with no rules has nothing to grade, nothing to undo, nothing to
     trace and nothing to publish, so it shows none of those.

     Every one of them was answering a question about rules that do not exist —
     and the gauntlet was doing worse than nothing, dealing thirteen sign-ins at
     an empty policy and reporting an F, which is a grade for a race nobody
     entered. The bar earns its controls back the moment there is a first rule. */
  const empty = rules.length === 0

  const mine = diagnostics.filter((d) => d.scope === 'rule' && d.ruleIndex === index)

  const patch = (p: Partial<Policy>) => setHist((h) => commit(h, { ...h.present, ...p }))
  const patchRuleAt = (at: number, p: Partial<Rule>) =>
    patch({ rules: rules.map((r, n) => (n === at ? { ...r, ...p } : r)) })

  const blockers = diagnostics.filter(
    (d) => d.severity === 'error' && (d.scope === 'policy' || rules[d.ruleIndex]?.enabled !== false),
  ).length


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
  /* Rule-scoped actions, on the rule. In the top bar they had to say "this
     rule" to be unambiguous, and sat beside policy-wide ones that the same
     gesture could not undo. */
  const ruleItems: MenuItem[] = [
    { id: 'add', label: 'Add a rule below', icon: Plus },
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { id: 'copy', label: 'Copy to another policy…', icon: CopyPlus, hint: 'An independent copy' },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
  ]

  /* What used to be a "Policy" dropdown, spread across the bar as buttons.

     A menu of four items is a click to find out there were four items, and the
     four it held are the whole of what this screen can do to the policy rather
     than to a rule — which makes them the bar, not a thing the bar points at.

     Three of its old rows left with it. "Test a sign-in" and the docked tester
     both ran hypothetical sign-ins against unsaved rules, which is the gauntlet
     with one row; "Assign apps" now belongs to Edit details, where the rest of
     the policy's identity lives; "All commands" was a palette over a menu over
     a bar, three ways to reach the same six things. */
  const tools: { id: string; label: string; icon: typeof ScrollText }[] = [
    { id: 'log', label: 'Decision log', icon: ScrollText },
    { id: 'overview', label: 'Read it end to end', icon: BookOpen },
    { id: 'template', label: 'Save as template', icon: FileDown },
    /* v0 §8. Restored whenever the Review step is withheld: taking the publish
       gate away must not also take away the only way to read a policy back and
       commit it, which is a v0 requirement rather than one of ours. */
    ...(features.reviewStep ? [] : [{ id: 'review', label: 'Review & Save', icon: ClipboardCheck }]),
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
    <div className="bpage bf is-main">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* --- Top bar. One primary, one group of tools, one group of actions. --- */}
      {/* No bar at all on an empty policy. Everything it held was answering a
          question about rules that do not exist, and the back button — the one
          thing that still meant something — moved up to the heading. */}
      {!empty && (
      <header className="bf__bar">
        <div className="bf__baracts">
          {!empty && (
          <>
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
          {tools.map((t) => (
            <IconButton key={t.id} icon={t.icon} label={t.label} size="sm" tone="ghost" onClick={() => onAction(t.id)} />
          ))}
          <span className="bf__sep" aria-hidden />
          <IconButton icon={Undo2} label="Undo" size="sm" tone="ghost" disabled={!canUndo(hist)} onClick={() => setHist(undo)} />
          <IconButton icon={Redo2} label="Redo" size="sm" tone="ghost" disabled={!canRedo(hist)} onClick={() => setHist(redo)} />
          {/* One primary per view. In the review stage the primary is the
              Publish button at the end of the checks, so this one stands down
              rather than competing with it. In lite there is no review stage to
              send anyone to; v0 commits from Review & Save in the Policy menu. */}
          {features.publish && stage !== 'review' && (
            <Button variant="secondary" onClick={() => setStage('review')}>
              {blockers > 0 ? `${blockers} to fix` : 'Review & publish'}
            </Button>
          )}
          </>
          )}
        </div>
      </header>
      )}

      <div className={`bf__work ${flowOpen ? 'is-flowopen' : ''}`} ref={work}>
        {/* Dismisses on a click anywhere off the panel. Only in the DOM while
            the panel is, so it can never swallow a click on the work. */}
        {flowOpen && floating && (
          <button type="button" className="bf__flowscrim" aria-label="Close the sequence" onClick={() => setFlowOpen(false)} />
        )}

        {/* --- The sequence: a column here, a drawer when there is no room -- */}
        <div className="bf__flowdock" style={{ ['--flow-w' as string]: `${FLOW_W}px` }} aria-hidden={!flowOpen}>
          <FlowRail
            policy={draft}
            selected={index}
            diagnostics={diagnostics}
            shadowed={shadowed}
            onSelect={(i) => {
              jump(i)
              if (floating) setFlowOpen(false)
            }}
            onInsert={(at) => {
              addRule(at)
              if (floating) setFlowOpen(false)
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
              {/* The audience card is gone from here.

                  It was numbered 1 with the rules numbered 2, which framed the
                  policy's own scope as the first step of writing rules. It is
                  not a step — it is the frame they are written inside — so it
                  lives in the policy bar above every builder now, with the name
                  and the applications it belongs beside. */}
              {/* The stage is a playground for ONE rule now, not a list of all
                  of them.

                  An accordion asked the screen to be two things at once: the
                  sequence AND the rule, with the rule's own room shrinking as
                  the sequence grew. The sequence has its own panel; this has
                  everything else. */}
              {!empty && (
              <div className="bf__ruleshead">
                <button
                  type="button"
                  className="bf__flowbtn"
                  aria-expanded={flowOpen}
                  onClick={() => setFlowOpen((v) => !v)}
                >
                  <ListOrdered size={13} strokeWidth={1.9} aria-hidden />
                  {flowOpen ? 'Hide rules' : 'Rules'}
                  <span>{rules.length}</span>
                </button>
                <em>
                  Rule {index + 1} of {rules.length} · evaluated top to bottom, first match wins
                </em>
                <MenuButton label="Rule actions" iconOnly icon={MoreHorizontal} size="sm" align="end" items={ruleItems} onSelect={onAction} />
              </div>
              )}

              {rules.length === 0 ? (
                <div className="bf__blank">
                  <Sparkles size={22} strokeWidth={1.6} aria-hidden />
                  <h2>No rules yet</h2>
                  <p>
                    A rule is a condition and an outcome: when this is true, do that. Sign-ins fall down
                    the list and the first rule that matches decides — until there is one, every sign-in
                    goes straight to the last row.
                  </p>
                  <div className="bf__blankacts">
                    {/* The named action is the primary, alone on its row. Guided setup and
                        the tour are the two other ways in — worth offering, and not worth
                        standing beside the thing somebody came here to do. */}
                    <Button variant="primary" icon={Plus} onClick={() => addRule()}>
                      Add the first rule
                    </Button>
                  </div>

                  <div className="bf__blankmore">
                    {features.guidedSetup && (
                      <button type="button" onClick={() => setInterview(true)}>
                        <Wand2 size={13} strokeWidth={1.9} aria-hidden />
                        Answer five questions instead
                      </button>
                    )}
                    <button type="button" onClick={() => setLearn(true)}>
                      <GraduationCap size={13} strokeWidth={1.9} aria-hidden />
                      Learn the builder
                    </button>
                  </div>
                </div>
              ) : (
                rule && (
                  <ol className="bf__rules">
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      index={index}
                      open
                      diagnostics={mine}
                      features={features}
                      onOpen={() => {}}
                      onPatch={(p) => patchRuleAt(index, p)}
                      onAction={onAction}
                      onJump={jump}
                    />
                  </ol>
                )
              )}
            </div>
          )}

          {/* The docked tester is gone, and so is "Test a sign-in".

              Both ran one hypothetical sign-in against unsaved rules and read
              the answer back, which is what the gauntlet does thirteen times
              with cases somebody thought about — and the strip did it in a row
              of four dropdowns nailed across the bottom of the playground, so
              the cost was paid on every screen whether or not anybody was
              asking. The condition rows no longer light up green or grey for a
              context nobody chose, which is the part that was actively
              misleading. */}

          {/* --- One bar, docked. Unsaved changes and the way forward. ------- */}
          {/* No rules, nothing to say about them — and no "Check & review" for
              a policy with nothing to check. The bar returns with the first
              rule, or earlier if there is something unsaved to report. */}
          {(!empty || dirty) && (
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

            {!empty && (stage === 'rules' ? (
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
            ))}
          </footer>
          )}
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
                <WhenSection rule={rule} onPatch={onPatch} chrome />
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
