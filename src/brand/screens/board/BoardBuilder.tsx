import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Keyboard, ListOrdered, PanelRightClose, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'

import { Button, Modal } from '../../kit'
import { fallbackRule, reidRule, blankRule, type Policy, type Rule, type Scenario } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { TemplateSheet } from '../../create/TemplateSheet'
import { ReviewDialog } from '../builder-dialogs'
import { CommandBar, type Cmd } from '../command-bar'
import { BoardBar, BoardBarActions } from './BoardBar'
import { BoardEmpty } from './BoardEmpty'
import { BoardSheet } from './BoardSheet'
import { diagnose, shadowedBy } from '../diagnostics'
import { runGauntlet } from '../gauntlet'
import { compare, sweep } from '../impact-arena'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from '../history'
import { walk, type SimEnv } from '../simulate'
import { Board } from './Board'
import { Inspector } from './Inspector'
import { nextPart, ruleAt, type Part, type Selection, type Tab, type Trace } from './model'

import './board.css'

/* -----------------------------------------------------------------------------
   The board's host — state, and the two regions it feeds.

   Owns the draft (a history, so undo is one keystroke), the selection, the
   inspector's width and the rehearsal in flight. Everything the stage and the
   inspector do comes back here as a patch to the draft, which is the only way
   either of them changes anything.
   -------------------------------------------------------------------------- */

/* The bindings, in one place, so the sheet and the handler cannot drift.

   Written as data rather than as markup because it is documentation of
   behaviour that lives elsewhere: if a binding changes in the handler and not
   here, the sheet lies — and a lying shortcut sheet is worse than none.
   Keeping the two adjacent is the cheapest guard short of generating one from
   the other. */
const SHORTCUTS: [string, string][] = [
  ['↑ ↓', 'Select the previous or next rule, staying on the part you are on'],
  ['⌥↑ ⌥↓', 'Move the selected rule up or down'],
  ['[ ]', 'Who, Condition or Then, on the selected rule'],
  ['⌘D', 'Duplicate the selected rule'],
  ['Del', 'Delete the selected rule'],
  ['E', 'Switch the selected rule on or off'],
  ['⌘K', 'Command palette'],
  ['⌘↵', 'Review and publish'],
  ['⌘\\', 'Show or hide the panel, while a card is selected'],
  ['⌘Z ⇧⌘Z', 'Undo, redo'],
  ['Esc', 'Clear the rehearsal, then the selection'],
  ['?', 'This list'],
]

/* Referentially stable "no overrides", so the deck is not re-dealt on every
   render for a tenant that has overruled nothing. */
const NO_OVERRIDES: Record<string, never> = {}

export function BoardBuilder({
  policyId,
  openSheet,
}: {
  policyId: string
  openSheet?: Tab
}) {
  const store = useBrand()
  const { registerLeaveGuard } = store
  /* The edition, which this surface ignored entirely.

     The trail gates eleven things on it; the board gated none, so Lite showed
     the palette, the publish gate and the whole Check/Impact apparatus that
     Lite exists to withhold — a demo of the paid tier, reachable from the Lite
     tenant by pressing one button on the policy bar. */
  const features = store.features
  const saved = store.policyById(policyId)
  const resolve = useNameLookup()

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [trace, setTrace] = useState<Trace | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [review, setReview] = useState(false)
  const [cmd, setCmd] = useState(false)
  const [keys, setKeys] = useState(false)
  /* Seeded from the route, not forced by it.

     A caller that knows why you are coming — "this policy has four holes" —
     lands you on the answer. `useState`'s initialiser rather than an effect,
     so it opens with the first paint and closing it does not fight a prop that
     is still set: after that the sheet is yours. */
  const [sheet, setSheet] = useState<Tab | null>(openSheet ?? null)
  /* The template catalogue, offered from the empty board.

     It used to be a page you met BEFORE the policy existed — you browsed
     templates, chose one, and only then were asked what the policy was called.
     Here the policy is already real, so taking a template is an ordinary edit:
     it goes through `commitDraft` like every other one, undo puts it back, and
     nothing is saved until you publish. */
  const [picking, setPicking] = useState(false)
  const [inspOpen, setInspOpen] = useState(true)
  /* The inspector's width, dragged rather than fixed.

     400px was chosen for the condition rows and it is right for them and wrong
     for everything else — a long rule name, a chain of four methods, a group of
     six conditions all want more, and a stage you are arranging wants less.
     The number was never going to suit both regions at once, so it stops being
     a constant and becomes a handle. */
  /* 560, and the number follows the row rather than the other way round.

     A condition is a joiner, an attribute, an operator, a value and a delete on
     ONE line. Measured, that wants about 510px INSIDE the block — the container
     query is on the content box, so the block's own 12px padding comes off
     first — which makes a 560px panel. At 480 the attribute picker elides to
     "Group M…" and the operator to "not in z…", which is a row nobody can read
     and therefore not a row worth keeping on one line.

     The old 400 was chosen when a condition was a run of chips that wrapped
     anyway, so no width had ever been right. Below the breakpoint the row folds
     to two deliberate lines instead of crushing — that is what the named grid
     areas at the foot of board.css are for. The grip moves it 320 to 720, and
     closing the panel gives the canvas the whole region. */
  const [inspW, setInspW] = useState(560)
  /* How much of itself every card shows, and the per-card exceptions.

     Two pieces of state rather than one, because they answer different
     questions. `density` is the chain-wide default — "show me the order" or
     "show me the rules" — and it is what the toolbar switch sets. `folds` holds
     the cards somebody has since opened or closed by hand, keyed by rule id so
     an override survives a reorder, a rename and an undo.

     Flipping the switch CLEARS the overrides, deliberately. The alternative is
     a chain where "Detailed" leaves three rules folded because of clicks made
     several minutes ago, and no way to say "all of them" except by finding and
     unfolding each one. A chain-wide control that cannot actually reach the
     whole chain is not worth having. */
  /* Outline, not detailed.

     The first question a policy answers is what order it decides in, and the
     chain is the only surface that shows it. Opening every card fully meant a
     four-rule policy did not fit on a screen — so the thing the canvas exists
     to show was the thing you had to scroll to see, and the conditions, which
     the panel edits properly anyway, were what filled the space.

     Unfolding is one click on a card, or one on the toolbar for all of them. */
  const [density, setDensity] = useState<'outline' | 'detailed'>('outline')
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const expandedOf = (ruleId: string) => folds[ruleId] ?? density === 'detailed'
  const toggleExpand = (ruleId: string) => setFolds((f) => ({ ...f, [ruleId]: !expandedOf(ruleId) }))
  const setChainDensity = (d: 'outline' | 'detailed') => {
    setDensity(d)
    setFolds({})
  }
  /* On only while the grip is held.

     The panel's width is written straight to the DOM during a drag, and the
     three things that offset by it — both right-hand toolbars and the sheet —
     are transitioned so they glide when the panel opens. That transition is
     wrong mid-drag: it makes them trail the edge you are dragging by a quarter
     of a second. The class turns it off for exactly as long as the drag lasts. */
  const [gripping, setGripping] = useState(false)
  const shell = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; w: number; at: number } | null>(null)

  /* Written to the DOM during the drag, committed to state on release.

     `setInspW` per pointermove re-rendered this component, the board and every
     card on it, sixty times a second, to change one width — the same trap the
     pan was in before it moved to a ref. The custom property is all the layout
     needs, so the drag writes that and React hears about it once, at the end. */
  const setW = useCallback((w: number) => {
    const next = Math.max(320, Math.min(720, w))
    shell.current?.style.setProperty('--bb-insp', `${next}px`)
    return next
  }, [])

  /* The two ends the panel's own button steps between, and the test that says
     which end you are at.

     560 is the width a condition row needs to stay on one line — see the note
     on `inspW`. 380 is under the 430px container query, so the narrow state is
     genuinely a different shape rather than a squeezed one: the rows fold to
     two deliberate lines and the panel becomes a column you can still read
     beside a canvas you are arranging.

     `> NARROW` rather than `=== WIDE`, because the grip can leave the width
     anywhere in 320–720 and the button still has to know which way to go. */
  const NARROW = 380
  const wide = inspW > NARROW

  const onGrab = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, w: inspW, at: inspW }
      setGripping(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [inspW],
  )

  const onDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      /* Dragging left widens: the handle is on the panel's left edge, so the
         panel grows as the pointer moves away from it. Clamped rather than
         free — under 320 the condition rows stack and stop being rows, and over
         720 the stage is no longer the thing you are working on. */
      d.at = setW(d.w + (d.x - e.clientX))
    },
    [setW],
  )

  const onDrop = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGripping(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (d) setInspW(d.at)
  }, [])

  useEffect(() => {
    if (saved) setHist(historyOf(saved))
  }, [saved?.id])


  const draft = hist.present

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )

  const diagnostics = useMemo(() => (saved ? diagnose(draft, store.groups, store.hooks, store.users) : []), [draft, store.groups, store.hooks, store.users, saved])
  const shadowed = useMemo(() => (hover === null ? [] : shadowedBy(draft, hover)), [draft, hover])
  const dirty = !!saved && JSON.stringify({ r: saved.rules, f: saved.fallback }) !== JSON.stringify({ r: draft.rules, f: draft.fallback })

  /* The draft lives in this component, so leaving the board destroys it.

     That was silent: the layout switch on the policy bar, "Edit details", the
     back arrow and every nav-rail item all called `store.go` straight through,
     and an unsaved policy went with the unmount. The guard says "safe to leave
     when clean"; `go` holds the navigation and hands it back as
     `store.pendingNav` when it is not, and the dialog below decides.

     Cleared on unmount, or the guard would keep answering for whatever screen
     came next. */
  useEffect(() => {
    registerLeaveGuard(() => !dirty)
    return () => registerLeaveGuard(null)
  }, [dirty, registerLeaveGuard])

  /* A rehearsal shown while you edit would go stale. Re-walked on every draft,
     silently — same run, updated verdicts — so the cards say what the rules
     now do without replaying the cascade. */
  useEffect(() => {
    setTrace((t) => (t ? { ...t, result: walk(draft, t.ctx, env) } : t))
  }, [draft, env])

  /* --- Keys -------------------------------------------------------------------

     The board had two bindings — undo/redo and Escape — and the trail next to
     it had a command palette. Everything else was a round trip to the mouse:
     selecting the next rule, moving one, duplicating, deleting, publishing.

     Every binding here acts on the SELECTED rule, so each one needs the
     selection resolved from its id first; `at` is -1 when nothing is selected
     or the selected rule has gone, and every branch bails on that rather than
     acting on rule 0 by accident.

     Nothing fires while a dialog is open or a field has focus. `typing` covers
     the fields; the dialog check is the same one Escape uses, and it matters
     most for the single-letter bindings — `e` and `?` would otherwise be
     unusable characters anywhere on the board. */
  /* The handler in a ref, and one listener for the life of the board.

     The dependency array here was `[trace]` while the handler read two keys'
     worth of state. That was survivable when it did undo/redo and Escape;
     with eleven bindings acting on the selected rule it is not — the closure
     froze `draft`, `selection` and every mutator at the render `trace` last
     changed on, so ⌘D would duplicate against a stale rule list and the
     arrow keys saw a selection that had moved on.

     Listing every dependency would re-register the listener on each render,
     because the mutators are rebuilt each time. A ref rewritten during render
     is the usual way out: the listener is stable, and what it calls is always
     the current closure. */
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const modal = !!document.querySelector('[role="dialog"], .bx-scrim')
    const action = historyKey(e)
    if (action && !typing) {
      e.preventDefault()
      setHist(action === 'redo' ? redo : undo)
      return
    }

    if (typing || modal) return

    const cmd = e.metaKey || e.ctrlKey
    const rules = draft.rules
    const at = selection.kind === 'rule' ? rules.findIndex((r) => r.id === selection.id) : -1
    /* Arrowing down the chain KEEPS the part: rule 3's Condition steps to rule
       4's Condition. The panel becomes a lens you slide down the chain — "what
       does each of these check?" — which is the reading that makes a
       column-wise arrow model worth having. From nothing selected there is no
       part to keep, and `ruleAt` supplies Who.

       Through `select`, not `setSelection` plus its own `setInspOpen`. That
       was this function open-coding the one door, and it now has a default to
       apply as well — doing that in two places is how the two disagree. */
    const partNow: Part = selection.kind === 'rule' ? selection.part : 'who'
    const pick = (i: number) => {
      const r = rules[i]
      if (r) select(ruleAt(r.id, partNow))
    }

    /* ⌘K — the palette the trail has had all along. */
    if (features.commands && cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setCmd((v) => !v)
      return
    }
    /* ⌘↵ — straight to the gate, which is where a finished edit is going. */
    if (cmd && e.key === 'Enter') {
      e.preventDefault()
      if (dirty) setReview(true)
      return
    }
    /* ⌘ — the panel is a lot of the screen, and reading the chain is a
       thing people do between edits.

       Only while something is selected. With nothing selected there is no
       panel, so an unguarded toggle would flip a piece of state nothing on
       screen reflects — and then the NEXT card you clicked would open to a
       collapsed panel for no reason you could trace back to a keystroke. */
    if (cmd && e.key === '\\') {
      e.preventDefault()
      if (at >= 0 || selection.kind === 'fallback') setInspOpen((v) => !v)
      return
    }
    if (cmd && e.key.toLowerCase() === 'd') {
      if (at < 0) return
      e.preventDefault()
      duplicate(at)
      return
    }

    /* ⌥↑ / ⌥↓ move the rule; bare ↑ / ↓ move the selection. Same axis, and
       the modifier is the difference between reading the chain and editing
       it — which is the distinction every list editor draws this way. */
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1
      if (e.altKey) {
        if (at < 0) return
        e.preventDefault()
        move(at, at + dir)
      } else {
        e.preventDefault()
        /* From nothing, ↓ takes the first rule and ↑ the last, so the
           keyboard has a way in that does not require a click first. */
        pick(at < 0 ? (dir === 1 ? 0 : rules.length - 1) : Math.min(Math.max(at + dir, 0), rules.length - 1))
      }
      return
    }

    /* [ and ] — the previous or next part of the selected rule.

       Not ← / →, and the reason is mechanical rather than aesthetic. Two
       focused controls on this surface already handle the horizontal arrows
       and neither calls `stopPropagation`, so this window listener would fire
       as well: the resize grip below, and — worse — `Seg`, which is the
       operator control inside the Who panel this feature exists to build.
       Pressing ← there would flip `in`/`not in` AND switch the part,
       unmounting the form mid-edit.

       `[` and `]` are the standard previous/next-pane idiom, are unbound here,
       and ⌘[ / ⌘] (browser back and forward) are excluded by `!cmd`. */
    if ((e.key === '[' || e.key === ']') && !cmd && selection.kind === 'rule' && at >= 0) {
      e.preventDefault()
      select({ ...selection, part: nextPart(selection.part, e.key === ']' ? 1 : -1) })
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && at >= 0) {
      e.preventDefault()
      remove(at)
      return
    }
    /* Unmodified `e`, because it is a toggle you reach for repeatedly while
       narrowing down which rule is doing something. */
    if (e.key.toLowerCase() === 'e' && at >= 0 && !cmd) {
      e.preventDefault()
      patchRule(at, { enabled: !rules[at].enabled })
      return
    }
    if (e.key === '?') {
      e.preventDefault()
      setKeys((v) => !v)
      return
    }
    /* Not past a dialog.

       This is a window listener, so it saw the Escape that closed the
       condition picker as well — the picker shut AND the rule deselected, so
       backing out of choosing an attribute threw away the whole panel you
       were working in. Anything modal owns Escape while it is open; the
       board only gets it when nothing is over the board. */
    if (e.key === 'Escape' && !typing && !document.querySelector('[role="dialog"], .bx-scrim')) {
      if (trace) setTrace(null)
      else setSelection({ kind: 'none' })
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* The deck and the before/after sweep, back with the pips they feed.

     Memoised on the draft, so the cost is one deal and two sweeps per edit
     rather than per keystroke — the editor patches a rule on change, not on
     keypress, and `overrides` comes through a stable empty object when the
     tenant has set none.

     The deck is not dealt at a policy with no enabled rules. Every attempt
     falls straight to the default, so the grade measures the default and
     nothing else: a new policy opened with one blank rule was being handed an
     F and told five hostile sign-ins got through, which is true of the empty
     policy and says nothing about the one being written. No rules, no grade. */
  const overrides = store.gauntletOverrides[draft.id] ?? NO_OVERRIDES
  const gradable = draft.rules.some((r) => r.enabled)
  const test = useMemo(() => (gradable ? runGauntlet(draft, env, overrides) : null), [gradable, draft, env, overrides])
  const movement = useMemo(
    () => (dirty && saved ? compare(sweep(saved, env, 570), sweep(draft, env, 570)) : null),
    [dirty, saved, draft, env],
  )
  const blockers = diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled)).length

  const selAt = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const selName = selAt >= 0 ? draft.rules[selAt].name : ''

  /* Whether there is anything for the panel to be about.

     Not `selection.kind !== 'none'`, and the difference is a real state rather
     than a nicety: a selection names a rule by id, and the rule it names can
     stop existing while the selection still holds the id — undo shortens the
     list, a delete lands, a discard rolls the draft back. `selAt` is -1 for all
     of those, and the panel has nothing to draw.

     The panel used to answer that case with the rule library, which is why it
     could always be open. The library has moved out, so the honest answer is
     now the empty one: no subject, no panel. */
  const hasSubject = selection.kind === 'fallback' || selAt >= 0

  /* One way in, for both doors.

     Board's own handler has forced the panel open on any selection since the
     day a click behind a collapsed panel selected something nobody could then
     edit. The sheet selects rules too — that is what "Open rule 3" on a finding
     does — and it was handed `setSelection` bare, so the same click through the
     sheet lit the card and opened nothing. Harmless while the panel was always
     up; now that it is not, it is a dead end with nothing on screen to explain
     it. Two callers, one handler. */
  const select = (s: Selection) => {
    setSelection(s)
    if (s.kind !== 'none') setInspOpen(true)
  }
  /* The panel is on screen only when it has something to say AND has not been
     collapsed. One class for both, because the layout must not be able to tell
     them apart: either way the stage has the width back.

     What reads the class has shrunk to one thing — `.bb`'s own
     `grid-template-columns`. It used to be four: two floating toolbars and the
     sheet each subtracting the panel's width by hand, and Fit measuring it out
     of the DOM. The panel is a track now, so collapsing the track is the whole
     of the adjustment and everything drawn inside the stage follows for
     free. */
  const panelShown = hasSubject && inspOpen
  const boardCommands: Cmd[] = [
    { id: 'add', label: 'Add a rule', icon: Plus },
    ...(selAt >= 0
      ? ([
          { id: 'dup', label: `Duplicate rule ${selAt + 1} · ${selName}`, kbd: '⌘D', icon: Copy },
          { id: 'del', label: `Delete rule ${selAt + 1} · ${selName}`, kbd: 'Del', icon: Trash2, danger: true },
        ] as Cmd[])
      : []),
    ...(dirty ? ([{ id: 'publish', label: 'Review and publish', kbd: '⌘↵', icon: Check }] as Cmd[]) : []),
    ...(canUndo(hist) ? ([{ id: 'undo', label: 'Undo', kbd: '⌘Z', icon: Undo2 }] as Cmd[]) : []),
    ...(canRedo(hist) ? ([{ id: 'redo', label: 'Redo', kbd: '⇧⌘Z', icon: Redo2 }] as Cmd[]) : []),
    ...(hasSubject ? ([{ id: 'panel', label: inspOpen ? 'Hide the panel' : 'Show the panel', kbd: '⌘\\', icon: PanelRightClose }] as Cmd[]) : []),
    { id: 'keys', label: 'Keyboard shortcuts', kbd: '?', icon: Keyboard },
    ...draft.rules.map((r, i) => ({ id: `rule:${i}`, label: `Go to rule ${i + 1} · ${r.name}`, icon: ListOrdered }) as Cmd),
  ]

  if (!saved) return <div className="bpage">This policy no longer exists.</div>

  /* --- Edits -------------------------------------------------------------------- */
  const commitDraft = (next: Policy) => setHist((h) => commit(h, next))
  const patchRule = (i: number, p: Partial<Rule>) => commitDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  const patchFallback = (p: Partial<Rule>) => commitDraft({ ...draft, fallback: { ...(draft.fallback ?? fallbackRule()), ...p } })

  const insert = (rule: Rule, at: number) => {
    const rules = [...draft.rules]
    rules.splice(at, 0, rule)
    commitDraft({ ...draft, rules })
    /* Through `select`, which is the only door — this line has bypassed it
       since it was written, so inserting a rule with the panel collapsed gave
       you a selected card and no panel. */
    select(ruleAt(rule.id))
  }

  /* No selection fix-up. The selection names the rule, so moving the rule
     moves the selection with it — this used to re-point the index at the
     destination slot, which was right for the dragged rule and wrong for
     every other selection the move shifted. */
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.rules.length || from === to) return
    const rules = [...draft.rules]
    const [r] = rules.splice(from, 1)
    rules.splice(to, 0, r)
    commitDraft({ ...draft, rules })
  }

  const remove = (i: number) => {
    const gone = draft.rules[i]
    commitDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })
    if (selection.kind === 'rule' && selection.id === gone?.id) setSelection({ kind: 'none' })
  }
  const duplicate = (i: number) => insert(reidRule({ ...draft.rules[i], name: `${draft.rules[i].name} (copy)` }), i + 1)

  /* A template, applied to a policy that already exists.

     One `commitDraft`, which is the whole point of routing it through here:
     the rules land on the undo stack, `dirty` notices, and Review & publish
     wakes up. `setHist(historyOf(next))` would look identical on screen and be
     un-undoable — that call belongs to publish and discard, and undo is the
     only thing standing between a mis-clicked template and lost work.

     Rules ONLY. A `Scenario` also declares an audience, and writing it into the
     draft would commit an edit that can never be saved: `dirty` compares rules
     and the fallback, so the publish button would stay disabled over a policy
     whose audience had silently changed. Who a policy governs is a standing
     fact, edited where the other standing facts are.

     The panel lands on rule 1 rather than on nothing, the same courtesy
     `insert` does — five rules arriving with an empty inspector beside them
     reads as a screen that has not finished loading. */
  const applyTemplate = (t: Scenario) => {
    const built = t.rules.map((r) => r.build())
    commitDraft({ ...draft, rules: built })
    if (built[0]) select(ruleAt(built[0].id))
    store.showToast(`${t.name} applied — ${built.length} rule${built.length === 1 ? '' : 's'}, not saved yet`)
  }

  const publish = () => {
    /* Publishing is what ends a draft.

       A draft that stayed a draft through its own publish step would make the
       status decorative — the one transition the word implies is the one thing
       it could not do. It becomes `inactive`: a real, published policy that is
       switched off, which is the promise the create flow has always made and
       the only landing that cannot start refusing sign-ins without being asked.

       Any other status publishes unchanged. Republishing an active policy must
       not quietly park it. */
    const status = draft.status === 'draft' ? 'inactive' : draft.status
    const next = { ...draft, status, lastModified: 'Just now', modifiedBy: 'You' }
    /* `next`, not `draft`. This saved the pre-stamp object while seeding the
       history from the stamped one, so the store and the undo stack disagreed
       about the record by two fields from the moment it was published. */
    store.savePolicy(next)
    setHist(historyOf(next))
    setReview(false)
    store.showToast(
      draft.status === 'draft'
        ? `${draft.name} published — switched off until you turn it on`
        : `${draft.name} published`,
    )
  }
  const discard = () => {
    setHist(historyOf(saved))
    setTrace(null)
  }

  return (
    <>
      {/* The policy, above the work.

          A sibling of `.bb` rather than a child, so the shell's flex column
          places it and the board below it takes what is left. The verbs in it
          act on the DRAFT, which is why this component renders the bar rather
          than the page above it. */}
      <BoardBar
        policy={draft}
        actions={
          <BoardBarActions
            test={test}
            movement={movement}
            sheet={sheet}
            dirty={dirty}
            blockers={blockers}
            onSheet={setSheet}
            onDiscard={discard}
            onReview={() => setReview(true)}
          />
        }
      />

    <div
      ref={shell}
      className={`bb ${panelShown ? '' : 'is-insp-closed'} ${gripping ? 'is-gripping' : ''}`}
      style={{ '--bb-insp': `${inspW}px` } as React.CSSProperties}
    >
      {/* The canvas comes into existence when there is something on it.

          A policy with no rules used to draw the chooser INSIDE the pan-and-zoom
          world, which meant the first thing anybody met could be panned off
          screen. `BoardEmpty` is an ordinary screen; `Board` is the canvas; and
          the board only ever mounts one of them. */}
      {draft.rules.length === 0 ? (
        <BoardEmpty onUseTemplate={() => setPicking(true)} onScratch={() => insert(blankRule(), 0)} />
      ) : (
      <Board
        policy={draft}
        selection={selection}
        diagnostics={diagnostics}
        shadowed={shadowed}
        trace={trace}
        resolve={resolve}
        onSelect={select}
        expandedOf={expandedOf}
        onToggleExpand={toggleExpand}
        onInsert={(at) => insert(blankRule(), at)}
        onMove={move}
        onToggle={(i, on) => patchRule(i, { enabled: on })}
        onDuplicate={duplicate}
        onDelete={remove}
        onHover={setHover}
        /* Everything that changes the VIEW, into the one centre toolbar `Board`
           draws. Zoom is already in there because zoom state lives in `Board`;
           these three used to sit in three separate corners.

           Order is the order you reach for them: get the chrome out of the way,
           step back through what you did, then how much of each rule. */
        tools={
          <>
            {/* A panel toggle stood here, and before that in the publishing
                cluster. It is gone from both.

                The panel has one way out — the × in its own bar, on the thing
                being closed — and three ways back: click a card, arrow to one,
                or ⌘\. A fourth control, on the far side of the canvas from the
                panel it acts on, was a second door for a room that was not
                short of them. */}
            <button type="button" className="bb__act" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo(hist)} onClick={() => setHist(undo)}>
              <Undo2 size={14} strokeWidth={2} />
            </button>
            <button type="button" className="bb__act" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
              <Redo2 size={14} strokeWidth={2} />
            </button>
          </>
        }
        /* Density gets a pill of its own, docked to the left of the toolbar.

           It is the one control down there that is a MODE — two named states,
           one of them on, and it stays on until you say otherwise — where
           everything beside it is a momentary press. Sitting inside that strip
           it read as two buttons that happen to have words instead of glyphs;
           in its own container it reads as the choice it is.

           A radiogroup, not a toggle button. Both states are worth naming:
           "Outline" is a claim about what you get, and a single button reading
           "Outline" cannot say whether that is what you are in or what you
           would switch to. */
        aside={
          <div className="bb__float bb__density" role="radiogroup" aria-label="How much of each rule to show">
              {(['outline', 'detailed'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={density === d}
                  tabIndex={density === d ? 0 : -1}
                  className={density === d ? 'is-on' : ''}
                  title={d === 'outline' ? 'Names and outcomes only' : 'Every condition, on every card'}
                  onClick={() => setChainDensity(d)}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                    e.preventDefault()
                    setChainDensity(d === 'outline' ? 'detailed' : 'outline')
                  }}
                >
                  {d === 'outline' ? 'Outline' : 'Detailed'}
                </button>
              ))}
          </div>
        }
      />
      )}


      {panelShown && (
        <div
          className="bb__grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the inspector"
          aria-valuenow={inspW}
          aria-valuemin={320}
          aria-valuemax={720}
          tabIndex={0}
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onDrop}
          /* Arrow keys move it too. A divider that only responds to a drag is a
             divider somebody navigating by keyboard cannot move at all. */
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setInspW((w) => setW(w + 24))
            else if (e.key === 'ArrowRight') setInspW((w) => setW(w - 24))
            else return
            e.preventDefault()
          }}
        />
      )}

      {/* Mounted only when it has a subject.

          Not hidden with CSS — unmounted. The panel holds the editors for one
          rule, and an editor for a rule nobody is looking at is a form that
          keeps its own state about something that may since have been deleted.
          Unmounting also collapses its grid track — an explicitly-sized track
          outlives the item in it, which is why `.bb.is-insp-closed` rewrites
          the template rather than trusting the empty column to disappear. */}
      {panelShown && (
        <Inspector
          draft={draft}
          selection={selection}
          onPatchRule={patchRule}
          onPatchFallback={patchFallback}
          /* The one part-changing control the panel owns: the stood-down Who
             pane handing you to the one that can do the job. */
          onOpenPart={(part) => {
            if (selection.kind === 'rule') select({ ...selection, part })
          }}
          onClose={() => setInspOpen(false)}
          wide={wide}
          onToggleWidth={() => setInspW(setW(wide ? NARROW : 560))}
        />
      )}

      {/* The palette, over the board's own verbs.

          `CommandBar` is reused; `buildCommands` is not. The trail's list
          offers the gauntlet dialog, the decision log, "Assign applications"
          and "Save as template" — four things this surface does not have, and a
          palette that lists actions the screen cannot perform is worse than no
          palette. Same component, own commands. */}
      {features.commands && cmd && (
        <CommandBar
          commands={boardCommands}
          onClose={() => setCmd(false)}
          onRun={(id) => {
            setCmd(false)
            if (id === 'add') insert(blankRule(), draft.rules.length)
            else if (id === 'undo') setHist(undo)
            else if (id === 'redo') setHist(redo)
            else if (id === 'publish') setReview(true)
            else if (id === 'panel') setInspOpen((v) => !v)
            else if (id === 'keys') setKeys(true)
            else if (id === 'dup' && selAt >= 0) duplicate(selAt)
            else if (id === 'del' && selAt >= 0) remove(selAt)
            else if (id.startsWith('rule:')) {
              const r = draft.rules[Number(id.slice(5))]
              if (r) select(ruleAt(r.id))
            }
          }}
        />
      )}

      {/* Every binding on one card, opened by the key it documents.

          Discoverability is the whole point: none of these is guessable, and a
          shortcut nobody knows about is a shortcut nobody has. `?` is the
          convention, and it is listed here too so the sheet explains how it
          was reached. */}
      <Modal open={keys} onClose={() => setKeys(false)} title="Keyboard" width={480}>
        <dl className="bb__keys">
          {SHORTCUTS.map(([k, what]) => (
            <div key={k}>
              <dt>
                {k.split(' ').map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Modal>

      <BoardSheet
        tab={sheet}
        onTab={setSheet}
        onClose={() => setSheet(null)}
        draft={draft}
        saved={saved}
        dirty={dirty}
        env={env}
        diagnostics={diagnostics}
        trace={trace}
        onTrace={setTrace}
        onSelect={select}
        onApplyRules={(rules, note) => {
          commitDraft({ ...draft, rules })
          store.showToast(note)
        }}
      />

      {/* The catalogue, raised from the empty board.

          Mounted here rather than inside `Board` because it writes to the
          draft, and `commitDraft` is the one door. It carries `role="dialog"`
          of its own, which the key handler above reads — without it, browsing
          templates would leave Del, ⌘D and the arrow keys live on the rule
          underneath. */}
      <TemplateSheet open={picking} onClose={() => setPicking(false)} onChoose={applyTemplate} />

      <ReviewDialog open={review} policy={draft} onClose={() => setReview(false)} onConfirm={publish} />

      {/* Named, and it says what leaving costs.

          Not a `confirm()`: the count comes from the same diff that drives the
          Discard button, so the number in the sentence is the number of rules
          that would go. "Keep editing" is the default action because it is the
          recoverable one — discarding a draft cannot be undone once the
          component is gone. */}
      <Modal
        open={!!store.pendingNav}
        onClose={store.cancelNav}
        title="Leave without publishing?"
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={store.cancelNav}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={store.confirmNav}>
              Discard and leave
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          This draft has changes that are not published. Leaving the builder discards them — there is nothing to come
          back to.
        </p>
      </Modal>
    </div>
    </>
  )
}
