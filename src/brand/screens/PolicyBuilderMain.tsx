import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Asterisk,
  Copy,
  CopyPlus,
  FileText,
  FileX,
  Filter,
  GraduationCap,
  Info,
  LayoutTemplate,
  ListX,
  MoreHorizontal,
  PanelLeftOpen,
  Plus,
  ScrollText,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react'

import { Badge, Button, DecisionChip, IconButton, MenuButton, Modal, Tabs, Tip, TipDot, Toggle, type MenuItem } from '../kit'
import { blankRule, fallbackRule, reidRule, uniqueName, type Audience, type Policy, type Rule } from '../data'
import { hasOpenDialog } from '../dialog-chrome'
import { EmptyState } from '../empty'
import { scenarioFromPolicy } from '../template-from-policy'
import { useLeaveGuard } from '../leave-guard'
import { commitToast, committed, differsFromLive, hasUnsavedChanges, openForEditing, published, type CommitIntent } from '../policy-draft'
import { useBrand, useNameLookup } from '../store'
import { AudienceDrawer } from './audience-drawer'
import { nextRuleName, ruleLabel, ruleSentence, ruleSummary } from './predicate-prose'
import { withWho } from '../rule-who'
import { WhoPicker } from './who-picker'
import { CopyRuleDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
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
import { canRedo, canUndo, commit, historyKey, historyOf, redo, revertTo, undo, type History } from './history'
import { PolicyOverview } from './overview'
import { ReportUnsaved } from './policy-bar'
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

   · **The middle is the rule, then the review.** A rule card holds its Who
     above its When and its Then; Check and Review are one stage at the end,
     about the whole policy, rather than a modal behind Publish.

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

  /* Opened on the saved draft when there is one, not on the live rules. */
  const [hist, setHist] = useState<History>(() => historyOf(saved ? openForEditing(saved) : ({} as Policy)))
  const [selected, setSelected] = useState(0)
  /* The terminal rule is a row in the same list, so opening it is the same
     gesture — but it is not IN `rules`, so it cannot be an index. A separate
     flag rather than a `number | 'fallback'` selection, because every other
     consumer of `selected` (jump, move, delete, diagnostics) is about the
     ordered rules and would have to learn a sentinel it can do nothing with. */
  const [onTerminal, setOnTerminal] = useState(false)
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
  const [dialog, setDialog] = useState<null | 'log' | 'template' | 'gauntlet' | 'impact' | 'review' | 'copy'>(
    open ?? null,
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const stageEl = useRef<HTMLDivElement | null>(null)
  const work = useRef<HTMLDivElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)

  /* Layers this screen draws itself, outside the kit's dialog stack. While one
     is up, Escape and Ctrl+Z belong to it, not to the builder under it. */
  const layers = useRef(false)
  useEffect(() => {
    layers.current = tour || cmd || interview
  }, [tour, cmd, interview])

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

  /* Escape closes it while it floats, because a panel over the work has to be
     dismissible without aiming at anything. Docked it is a column, and Escape
     is not its key. Nor while a dialog, menu or the tour is up: that Escape
     closes the layer, not the panel under it. */
  useEffect(() => {
    if (!flowOpen || !floating) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || hasOpenDialog() || layers.current) return
      setFlowOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [flowOpen, floating])

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
    if (saved) setHist(historyOf(openForEditing(saved)))
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
      /* Not behind a dialog: undoing the draft under Review & save would
         change what its Save button commits. */
      if (action && !hasOpenDialog() && !layers.current) {
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
      hasZone: (id) => !!store.zoneById(id),
      hasFingerprint: (id) => !!store.fingerprintById(id),
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )

  const resolve = useNameLookup()
  const draft = hist.present

  /* Draft mode, computed above the early return so the guard's hook count is fixed.

     `unsaved` is against the last save or draft: the leave guard, Save draft
     and the pill. `changed` is against the live rules: the blast radius and,
     with a never-published policy, the publish gate. Name and audience are
     compared on their own — guided setup writes them — never the whole object,
     whose save stamps kept it dirty after every save. */
  const exists = saved !== undefined && !!draft.id
  const detailsEdited =
    exists && (draft.name !== saved.name || JSON.stringify(draft.audience) !== JSON.stringify(saved.audience))
  const unsaved = exists && (detailsEdited || hasUnsavedChanges(saved, draft))
  const changed = exists && differsFromLive(saved, draft)
  const toPublish = changed || detailsEdited || saved?.status === 'draft'
  const hasDraft = !!saved?.pendingDraft

  /* Focus for a control that is about to disable or unmount under the cursor —
     Save draft, Discard, a rule's ⋯ — so the keyboard is not dropped on <body>.
     The first candidate that exists, is enabled and is not in a hidden panel. */
  const focusSoon = (...candidates: (() => HTMLElement | null | undefined)[]) => {
    window.setTimeout(() => {
      for (const find of candidates) {
        const el = find()
        if (el && !(el as HTMLButtonElement).disabled && !el.closest('[aria-hidden="true"]')) {
          el.focus()
          return
        }
      }
    }, 0)
  }
  const inPage = (selector: string) => () => root.current?.querySelector<HTMLElement>(selector)
  /* The bar's last enabled button: Review & save, or Review & publish. */
  const barPrimary = () => {
    const all = root.current?.querySelectorAll<HTMLButtonElement>('.bf__bar button:not(:disabled)')
    return all && all.length > 0 ? all[all.length - 1] : null
  }

  const saveDraft = () => {
    if (!saved || !draft.id) return false
    /* Name and audience are not drafted; they save to the policy, as Edit details does. */
    if (detailsEdited) store.savePolicy({ ...saved, name: draft.name, audience: draft.audience })
    store.saveDraft(saved.id, { rules: draft.rules, fallback: draft.fallback })
    /* A published policy whose rules match what is live keeps no draft: the
       store drops it, so say that rather than "Draft saved". */
    const matchesLive = saved.status !== 'draft' && !differsFromLive(saved, draft)
    store.showToast(
      matchesLive ? (saved.pendingDraft ? 'Draft removed. Rules match the live policy.' : 'Details saved') : 'Draft saved',
    )
    focusSoon(barPrimary, inPage('.bf__ruleName'))
    return true
  }

  /* The back arrow and Edit details in the policy bar both leave through
     `store.go`, so this one guard covers them. */
  useLeaveGuard({ dirty: unsaved, save: saveDraft, saveLabel: 'Save as draft' })

  if (!saved || !draft.id) {
    return (
      <div className="bpage bf is-main">
        <EmptyState
          icon={FileX}
          title="Policy not found"
          blurb="It may have been deleted."
          action={
            <Button variant="primary" icon={ArrowLeft} onClick={() => store.go({ name: 'policies' })}>
              Back to policies
            </Button>
          }
        />
      </div>
    )
  }

  const rules = draft.rules
  /* Materialised rather than optional at the point of use: every policy has a
     terminal, older seed literals just did not store one. */
  const terminal = draft.fallback ?? fallbackRule()
  /* What Discard throws away, against the live rules — a saved draft included. */
  const changes = unsaved || hasDraft ? describeChanges(saved, draft, store.groups, store.users) : []
  const diagnostics = diagnose(draft, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints })
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
  /* A `who` in the patch goes through `withWho`, so choosing everyone again
     deletes the field rather than leaving `who: undefined` on the rule. The
     who is taken out of the patch before the spread, so withWho decides where
     the key sits (before `when`, as seeds have it) and a re-added who does not
     land at the end and light the save bar on a no-op. */
  const patchOne = (r: Rule, p: Partial<Rule>): Rule => {
    if (!('who' in p)) return { ...r, ...p }
    const { who, ...rest } = p
    return withWho({ ...r, ...rest }, who)
  }
  const patchRuleAt = (at: number, p: Partial<Rule>) =>
    patch({
      rules: rules.map((r, n) => (n !== at ? r : patchOne(r, p))),
    })

  const blockers = diagnostics.filter(
    (d) => d.severity === 'error' && (d.scope === 'policy' || rules[d.ruleIndex]?.enabled !== false),
  ).length


  const shadowed = hoverShadow === null ? [] : shadowedBy(draft, hoverShadow)

  const addRule = (at = rules.length) => {
    /* The lowest "Rule N" not already taken, so deleting Rule 1 and adding
       one does not make a second "Rule 2". */
    const r = blankRule(nextRuleName(rules))
    patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
    setSelected(at)
    setOnTerminal(false)
    setStage('rules')
    setLive(`Rule added at position ${at + 1}`)
    focusSoon(inPage('.bf__ruleName'))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    patch({ rules: next })
    setSelected(to)
    setLive(`${ruleLabel(r)} moved to position ${to + 1}. Evaluation order changed.`)
  }

  /* Every way of opening a rule — the panel, the overview, a finding, the
     palette — leaves the terminal card, so only one row is ever highlighted. */
  const jump = (i: number) => {
    setSelected(i)
    setOnTerminal(false)
    setDialog(null)
    setCmd(false)
    setOverview(false)
    setStage('rules')
  }

  const duplicate = () => {
    if (!rule) return
    /* Fresh ids for the rule, its cards and its conditions, as the board does.
       Numbered rather than stacked: "Rule (copy 2)", never "Rule (copy) (copy)". */
    const copy = { ...reidRule(rule), name: uniqueName(ruleLabel(rule), rules.map((r) => r.name), 50) }
    patch({ rules: [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)] })
    setSelected(index + 1)
    store.showToast(`${ruleLabel(rule)} duplicated`)
    focusSoon(inPage('.bf__ruleName'))
  }

  const remove = () => {
    if (!rule) return
    patch({ rules: rules.filter((_, n) => n !== index) })
    setSelected(Math.max(0, index - 1))
    setLive(`${ruleLabel(rule)} deleted`)
    store.showToast(`${ruleLabel(rule)} deleted. Press Ctrl+Z to undo.`)
    focusSoon(inPage('.bf__node.is-on .bf__nodeselect'), inPage('.bf__ruleName'), inPage('.bempty__action button'))
  }

  /* Discard goes back to the live rules, and always asks: it throws away every
     unsaved edit, and a saved draft too. It is recorded as one more step, so
     Ctrl+Z still brings the edits back. */
  const revert = () => setHist((h) => revertTo(h, { ...saved, pendingDraft: undefined }))
  const discard = () => setConfirmDiscard(true)

  /* Storing a commit, the board's way: history reseeded from what was stored,
     so `unsaved`, `changed` and `detailsEdited` all read clean straight after,
     and the draft's status catches up with the store's. */
  const storeCommit = (next: Policy) => {
    store.savePolicy(next)
    setHist(historyOf(next))
    store.showToast(commitToast(saved, next))
  }
  /* Review & save — one commit rule for both builders (policy-draft.ts). */
  const commitReview = (intent: CommitIntent) => {
    storeCommit(committed(saved, draft, intent))
    setDialog(null)
  }
  const discardButton = (
    <Button variant="danger" disabled={!unsaved && !hasDraft} onClick={discard}>
      Discard
    </Button>
  )

  /* Rule-scoped actions live on the rule card — `RuleCard` builds its own set
     beside the rule's name. They were in the top bar once, where every label
     had to say "this rule" to be unambiguous and each sat beside policy-wide
     ones the same gesture could not undo. */

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
    { id: 'overview', label: 'Read it end to end', icon: FileText },
    { id: 'template', label: 'Save as template', icon: LayoutTemplate },
    /* No Review & Save tool here. Lite's primary button already opens it. */
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
    <div className="bpage bf is-main" ref={root}>
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* --- Top bar. One primary, one group of tools, one group of actions. --- */}
      {/* No bar at all on an empty policy. Everything it held was answering a
          question about rules that do not exist, and the back button — the one
          thing that still meant something — moved up to the heading.
          Unless there is work to keep or throw away: deleting the last rule
          must still leave Discard, Save draft and Review. */}
      {(!empty || unsaved || changed || hasDraft) && (
      <header className="bf__bar">
        <div className="bf__baracts">
          {!empty && (
          <>
          {/* The blast-radius pip only exists once there is a blast radius. It
              used to sit here permanently reading "no change", which is a
              control occupying the bar to report nothing — and it made the one
              case that matters, a draft that moves people, look like more of
              the same furniture. In the review stage both pips stand down: the
              checks there already print the same gauntlet and movement figures,
              and the span stays mounted because the tour anchors on it. */}
          <span className="bf__pips" data-tour="gauntlet">
            {stage !== 'review' && features.gauntlet && <GauntletPip policy={draft} onOpen={() => setDialog('gauntlet')} />}
            {stage !== 'review' && features.blastRadius && changed && <ImpactPip draft={draft} saved={saved} onOpen={() => setDialog('impact')} />}
          </span>
          {stage !== 'review' && <span className="bf__sep" aria-hidden />}
          {/* On the bar, not in a menu. The tour used to be reachable only from
              the Policy menu, which makes "show me that again" a search — and
              everything else explanatory had nowhere to live at all. */}
          <IconButton icon={GraduationCap} label="Learn the builder" size="sm" tone="ghost" onClick={() => setLearn(true)} />
          {tools.map((t) => (
            <IconButton key={t.id} icon={t.icon} label={t.label} size="sm" tone="ghost" onClick={() => onAction(t.id)} />
          ))}
          </>
          )}
          {/* No undo/redo buttons. They were disabled on arrival and stayed
              that way through most of a session — two greyed arrows reporting
              that nothing had happened yet — and the two things they do are
              already reachable: ⌘Z / ⇧⌘Z stay bound, and the save bar names the
              change and offers Discard, which is the undo anybody looking for
              one is actually after. */}
          {/* One primary per view. In the review stage the primary is the
              Publish button at the end of the checks, so this one stands down
              rather than competing with it. In lite there is no review stage to
              send anyone to; lite commits from this bar's Review & save. */}
          {/* Named, not counted. The save bar this replaces said what had
              changed rather than "unsaved changes", and a Discard that will not
              say what it discards is a button nobody presses. */}
          {changes.length > 0 ? (
            <Tip text={changes.length > 1 ? `${changes[0]}, and ${changes.length - 1} more` : changes[0]}>
              {discardButton}
            </Tip>
          ) : (
            discardButton
          )}
          {/* Keeps the work without publishing it. */}
          <Button variant="secondary" disabled={!unsaved} onClick={saveDraft}>
            Save draft
          </Button>
          {/* The primary, and the only one on the screen. It used to be
              `secondary` because a docked save bar held a competing primary at
              the bottom; that bar is gone, so the one way forward looks like
              one. */}
          {features.publish && stage !== 'review' && (
            <Button variant="primary" onClick={() => setStage('review')}>
              {blockers > 0 ? 'Review errors' : 'Review & publish'}
            </Button>
          )}
          {/* Lite has no publish gate. v0 commits from Review & Save, which is
              a v0 requirement rather than one of ours. */}
          {/* Gated as the board's is: nothing to save on a clean published
              policy, always open on a draft. */}
          {!features.publish && stage === 'rules' && (
            <Button variant="primary" disabled={!toPublish} onClick={() => setDialog('review')}>
              Review &amp; save
            </Button>
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

        {/* Collapsed, the panel leaves a 40px stub rather than nothing.

            A panel that vanishes without trace has to be re-found; a stub in
            its own track keeps the way back exactly where the way out was, and
            costs the playground forty pixels rather than three hundred.
            On an empty policy too: the panel holds the default outcome, the
            one thing that decides sign-ins before there is a rule. */}
        {!flowOpen && (
          <div className="bf__railstub">
            <button
              type="button"
              aria-label="Show the rules panel"
              title="Show the rules panel"
              onClick={() => setFlowOpen(true)}
            >
              <PanelLeftOpen size={15} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        )}

        {/* --- The sequence: a column here, a drawer when there is no room -- */}
        <div className="bf__flowdock" style={{ ['--flow-w' as string]: `${FLOW_W}px` }} aria-hidden={!flowOpen}>
          <FlowRail
            policy={draft}
            selected={onTerminal ? -1 : index}
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
            fallbackOn={onTerminal}
            onFallback={() => {
              setOnTerminal(true)
              if (floating) setFlowOpen(false)
            }}
          />
        </div>

        {/* --- Middle: the trail --------------------------------------------- */}
        <main className="bf__main">
          {/* --- The rules, or the review. Two scopes, drawn as two scopes. ---

              There was a five-step trail here — Who, When, Then, Check, Review
              — and it is gone. Who the POLICY governs is in the header above.
              Who a RULE is for is `rule.who`, a field on the rule card above its
              When and Then — never a condition inside When. Check and Review
              are about the whole policy, so they are one stage at the end. */}
          {stage === 'review' ? (
            <div className="bf__reviewstage" ref={stageEl}>
              <button type="button" className="bf__backrules" onClick={() => setStage('rules')}>
                <ArrowLeft size={13} strokeWidth={2} aria-hidden />
                Back to rules
              </button>
              <ReviewStep
                draft={draft}
                saved={saved}
                toPublish={toPublish}
                env={env}
                onJump={jump}
                onOpen={(d) => setDialog(d)}
                onPublish={(status) => {
                  /* The applications rule holds here too: with none, nothing
                     leaves draft. ReviewStep disables these buttons in that
                     case; `committed` is the same rule at the door. Otherwise
                     the chosen status, and publishing ends the saved draft. */
                  const noApps = draft.appIds.length === 0 && !draft.isSystem
                  /* The system policy stays always on: "enforce" is what it already does. */
                  const to = saved.status === 'always-on' ? 'always-on' : status
                  storeCommit(noApps ? committed(saved, draft) : published({ ...draft, status: to }))
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
              {/* No heading bar over the playground.

                  It held three things that each belonged somewhere else: a
                  title for the RULES PANEL, printed over the rule; a caption
                  saying how evaluation works, which is a fact about the
                  sequence and now sits under the panel's own title; and a rule
                  menu duplicating the one on the rule card two rows below it.

                  What is left is the collapse, and a control that hides a panel
                  belongs to the panel — so it is in the panel's header, with a
                  stub in its place once it is gone. */}
              {/* The terminal first: it opens on an empty policy too, where it
                  is the only outcome deciding sign-ins. */}
              {onTerminal ? (
                <ol className="bf__rules">
                  <TerminalCard
                    rule={terminal}
                    onPatch={(p) => patch({ fallback: { ...terminal, ...p } })}
                  />
                </ol>
              ) : rules.length === 0 ? (
                <EmptyState
                  icon={ListX}
                  title="No rules yet"
                  blurb="Sign-ins with no matching rule get the default outcome."
                  action={
                    <>
                      <Button variant="primary" icon={Plus} onClick={() => addRule()}>
                        Add the first rule
                      </Button>
                      {features.guidedSetup && (
                        <Button variant="secondary" icon={Wand2} onClick={() => setInterview(true)}>
                          Answer five questions
                        </Button>
                      )}
                      <Button variant="ghost" icon={GraduationCap} onClick={() => setLearn(true)}>
                        Learn the builder
                      </Button>
                    </>
                  }
                />
              ) : (
                rule && (
                  <ol className="bf__rules">
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      index={index}
                      audience={draft.audience}
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

          {/* The docked save bar is gone.

              It was a second toolbar at the other end of the screen, carrying
              a primary that competed with the one in the top bar and a running
              commentary on the rules that the rules were already showing. What
              it genuinely held — Discard, and the way forward — is up in the
              bar, where the rest of the policy's controls already are. */}
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
            /* Only where there is a gauntlet to open. In Lite the last stop
               just ends the tour. */
            onFinish={() => {
              if (features.gauntlet) setDialog('gauntlet')
            }}
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
              setOnTerminal(false)
              store.showToast(features.publish ? 'Rules added. Review them before publishing.' : 'Rules added. Review them before saving.')
            }}
          />
          </Suspense>
        )}
      </AnimatePresence>

      {/* The saved policy, not the draft: a log is what the live rules decided,
          and a rule that exists only in this tab has decided nothing. */}
      <DecisionLogDialog open={dialog === 'log'} policy={saved} onClose={() => setDialog(null)} />
      <GauntletDialog
        open={features.gauntlet && dialog === 'gauntlet'}
        policy={draft}
        onClose={() => setDialog(null)}
        onJumpToRule={jump}
        onApplyFix={(fix) => {
          patch({ rules: applyFix(rules, fix) })
          setSelected(fix.at)
          setOnTerminal(false)
          const what = fix.kind === 'insert' ? 'inserted as' : 'now'
          setLive(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
          store.showToast(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
        }}
      />
      <ReviewDialog
        open={dialog === 'review'}
        policy={draft}
        from="builder"
        onClose={() => setDialog(null)}
        onCommit={commitReview}
      />

      {/* Names what goes, the way the save bar's Review changes does. */}
      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard changes?"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(false)
                if (hasDraft) store.discardDraft(saved.id)
                revert()
                store.showToast('Changes discarded. Press Ctrl+Z to undo.')
                focusSoon(inPage('.bf__ruleName'), barPrimary, inPage('.bempty__action button'))
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        <p className="bx-leave__body">
          {saved.status === 'draft' ? 'The policy goes back to its last save.' : 'The policy goes back to its live rules.'}
        </p>
        {changes.length > 0 && (
          <ul className="bf__discardlist">
            {changes.map((c, i) => (
              <li key={`${i}-${c}`}>{c}</li>
            ))}
          </ul>
        )}
      </Modal>

      <ReportUnsaved policyId={saved.id} unsaved={unsaved} />

      <ImpactArenaDialog open={features.blastRadius && dialog === 'impact'} draft={draft} saved={saved} onClose={() => setDialog(null)} onJumpToRule={jump} />
      <CopyRuleDialog open={dialog === 'copy'} rule={rule} from={draft} onClose={() => setDialog(null)} />
      <SaveTemplateDialog
        open={dialog === 'template'}
        policy={draft}
        onClose={() => setDialog(null)}
        onSave={(t) => {
          /* From the draft on screen, not the saved policy: what the admin sees is what the template holds. */
          store.addScenario(scenarioFromPolicy({ ...draft, pendingDraft: undefined }, t, Date.now(), resolve))
          setDialog(null)
          store.showToast('Template saved')
        }}
      />
    </div>
  )
}

/* -----------------------------------------------------------------------------
   The terminal rule, as a card.

   The same card as any other rule minus the three things that do not apply to
   it. Not a variant of `RuleCard` behind four booleans — the differences are
   structural rather than cosmetic, and a card whose header is four conditionals
   is a card nobody can read:

   · No name field. It has one name, and a rule you can rename is a rule you can
     lose track of; every diagnostic and every trace says "Nothing else matched"
     and has to keep saying it.
   · No enable toggle, no ⋯. It cannot be turned off, deleted, duplicated or
     moved — an ordered list has to end somewhere.
   · No WHEN. Its condition is a POSITION, not a predicate. Drawing an empty
     condition block on it would invite somebody to write one, and the one they
     wrote would be silently ignored.

   Everything else is the same, which is the point: the outcome is edited where
   every other outcome is edited, and it can finally say the same things.
   -------------------------------------------------------------------------- */

function TerminalCard({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const resolve = useNameLookup()

  return (
    <li className="bf__rule is-open is-terminal">
      <div className="bf__rulehead">
        <span className="bf__ruleno is-lock" aria-hidden>
          <Asterisk size={13} strokeWidth={1.9} />
        </span>
        <strong className="bf__rulefixed">{rule.name}</strong>
        <TipDot text="Always last. It cannot be moved, turned off or deleted." label="About this rule" />
        <DecisionChip decision={rule.decision} size="sm" />
      </div>

      <div className="bf__rulebody">
        <div className="bf__ruleinner">
          <p className="bf__terminalwhen">
            <span className="u-label">When it applies</span>
            Every sign-in that reached the bottom of the list without matching a rule above it.
          </p>

          {/* `bare`, like the rule card's — the numbered pip belongs to a
              five-step trail that no longer exists, and here it would number a
              step in a card that has exactly one. */}
          <ThenSection rule={rule} onPatch={onPatch} bare />

          <p className="bf__ruleprose">
            <span className="u-label">In words</span>
            {ruleSentence(rule, resolve).then}
          </p>
        </div>
      </div>
    </li>
  )
}

/** Which half of a rule the card is showing. */
type Pane = 'when' | 'then'

/* `RuleWhy` stood here — the collapsed "why this rule exists" note.

   It is gone with `Rule.description`. A rule explains itself with its name;
   an optional free-text box, present on every rule and filled on almost none,
   was the largest control above the two questions that decide sign-ins. */


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
  audience,
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
  /** The policy's audience, so Who can mark what the policy does not govern. */
  audience: Audience
  open: boolean
  diagnostics: Diagnostic[]
  features: { checkStep: boolean }
  onOpen: () => void
  onPatch: (p: Partial<Rule>) => void
  onAction: (id: string) => void
  onJump: (i: number) => void
}) {
  const reduce = useReducedMotion()
  const store = useBrand()
  const resolve = useNameLookup()
  const el = useRef<HTMLLIElement | null>(null)
  const st = ruleState(diagnostics)
  /* Errors and warnings everywhere, because the state pill names them; the
     notes ("Switched off", a repeated condition) with the Check step. */
  const checks = features.checkStep ? diagnostics : diagnostics.filter((d) => d.severity !== 'info')
  const paneId = useId()
  /* Per rule, and it resets when you move to another one: which half you were
     editing on rule 2 is not a claim about rule 5. `key` on the card does the
     reset, because the card is already remounted per rule. */
  const [pane, setPane] = useState<Pane>('when')

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
  /* A rule whose only errors are that another rule always matches first is not
     misconfigured — it is out of reach, and the pill says which. */
  const REACH = ['PE101', 'PE102', 'PE103']
  const errs = diagnostics.filter((d) => d.severity === 'error')
  const unreachable = errs.length > 0 && errs.every((d) => REACH.includes(d.code))
  const label = ruleLabel(rule)

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
            placeholder="Rule name"
            maxLength={50}
            value={rule.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        ) : (
          <button type="button" className="bf__ruleopen" onClick={onOpen}>
            <strong>{label}</strong>
            <em>{ruleSummary(rule, resolve)}</em>
          </button>
        )}

        <DecisionChip decision={rule.decision} size="sm" />

        {/* A tinted pill, never a dot. What it is about is in the list at the
            bottom of the card. */}
        {st === 'setup' ? (
          <Badge tone="negative">{unreachable ? 'Never runs' : 'Needs fixing'}</Badge>
        ) : st === 'warn' ? (
          <Badge tone="notice">Worth a look</Badge>
        ) : (
          <Badge tone="positive">Ready</Badge>
        )}

        <label className="bf__ruleon">
          <Toggle
            checked={rule.enabled}
            onChange={(v) => onPatch({ enabled: v })}
            label={`Enable ${label}`}
            size="sm"
          />
        </label>

        <MenuButton
          label={`${label} actions`}
          iconOnly
          icon={MoreHorizontal}
          size="sm"
          align="end"
          items={ruleItems}
          onSelect={onAction}
        />
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
              {/* `RuleWhy` has gone with `Rule.description`. A rule explains itself
                  with its name; a free-text box present on every rule and
                  filled on almost none was the largest control above the two
                  questions that matter. */}

              {/* WHEN and THEN, one at a time.

                  They were stacked in the only scroller on the screen, and they
                  are not read together: measured, a rule with two alternatives
                  of three conditions ran 1499px in a 699px stage, so changing
                  the outcome of a rule meant scrolling past every condition to
                  reach it. Nothing about a policy asks you to hold both halves
                  in view — the readback at the top of each says what the other
                  one is. */}

              {/* Who the rule is for. Its own field, above both halves and
                  outside the conditions: picking people never touches When,
                  whatever shape When has, and When never lists people. */}
              <div className="bf__who">
                <span className="bf__wholabel" aria-hidden>
                  Who
                </span>
                <WhoPicker
                  who={rule.who}
                  onChange={(who) => onPatch({ who })}
                  audience={audience}
                  directory={store.users}
                  groups={store.groups}
                />
              </div>

              <Tabs
                className="bf__panes"
                name={`Rule ${index + 1} — which half to edit`}
                panelId={paneId}
                value={pane}
                onChange={setPane}
                options={[
                  {
                    value: 'when' as Pane,
                    label: 'When it applies',
                    icon: Filter,
                  },
                  {
                    value: 'then' as Pane,
                    label: 'What happens',
                    icon: ArrowRight,
                    sub: <DecisionChip decision={rule.decision} size="sm" />,
                  },
                ]}
              />

              <div id={paneId} role="tabpanel" tabIndex={-1} className="bf__pane" aria-label={pane === 'when' ? 'When it applies' : 'What happens'}>
                {/* The tab above names the half, so neither pane draws a
                    heading — but WHEN keeps its readback, which is the only
                    place the whole predicate reads as a sentence. */}
                {pane === 'when' ? (
                  <WhenSection rule={rule} onPatch={onPatch} chrome />
                ) : (
                  <ThenSection rule={rule} onPatch={onPatch} bare />
                )}
              </div>

              {/* In every edition. A card that says "Needs fixing" or "Worth a
                  look" has to say what, and Lite has no Check step to say it
                  anywhere else. The Check step adds the notes (info) on top. */}
              {checks.length > 0 && (
                <div className="bf__rulechecks">
                  {checks.map((d) => (
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

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
