import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Check, Copy, Keyboard, ListChecks, ListOrdered, PanelRightClose, PanelRightOpen, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'

import { Button, Modal } from '../../kit'
import { fallbackRule, reidRule, blankRule, type Policy, type Rule } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { ReviewDialog } from '../builder-dialogs'
import { CommandBar, type Cmd } from '../command-bar'
import { BoardSheet } from './BoardSheet'
import { diagnose, shadowedBy } from '../diagnostics'
import { runGauntlet } from '../gauntlet'
import { compare, sweep } from '../impact-arena'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from '../history'
import { walk, type SimEnv } from '../simulate'
import { Board } from './Board'
import { Inspector } from './Inspector'
import type { Selection, Tab, Trace } from './model'

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
  ['↑ ↓', 'Select the previous or next rule'],
  ['⌥↑ ⌥↓', 'Move the selected rule up or down'],
  ['⌘D', 'Duplicate the selected rule'],
  ['Del', 'Delete the selected rule'],
  ['E', 'Switch the selected rule on or off'],
  ['⌘K', 'Command palette'],
  ['⌘↵', 'Review and publish'],
  ['⌘\\', 'Show or hide the panel'],
  ['⌘Z ⇧⌘Z', 'Undo, redo'],
  ['Esc', 'Clear the rehearsal, then the selection'],
  ['?', 'This list'],
]

/* Referentially stable "no overrides", so the deck is not re-dealt on every
   render for a tenant that has overruled nothing. */
const NO_OVERRIDES: Record<string, never> = {}

export function BoardBuilder({ policyId }: { policyId: string }) {
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
  const [sheet, setSheet] = useState<Tab | null>(null)
  const [inspOpen, setInspOpen] = useState(true)
  /* The inspector's width, dragged rather than fixed.

     400px was chosen for the condition rows and it is right for them and wrong
     for everything else — a long rule name, a chain of four methods, a group of
     six conditions all want more, and a stage you are arranging wants less.
     The number was never going to suit both regions at once, so it stops being
     a constant and becomes a handle. */
  const [inspW, setInspW] = useState(400)
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

  const onGrab = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, w: inspW, at: inspW }
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
    const pick = (i: number) => {
      const r = rules[i]
      if (r) {
        setSelection({ kind: 'rule', id: r.id })
        setInspOpen(true)
      }
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
       thing people do between edits. */
    if (cmd && e.key === '\\') {
      e.preventDefault()
      setInspOpen((v) => !v)
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
    { id: 'panel', label: inspOpen ? 'Hide the panel' : 'Show the panel', kbd: '⌘\\', icon: PanelRightClose },
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
    setSelection({ kind: 'rule', id: rule.id })
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

  const publish = () => {
    const next = { ...draft, lastModified: 'Just now', modifiedBy: 'You' }
    store.savePolicy(draft)
    setHist(historyOf(next))
    setReview(false)
    store.showToast(`${draft.name} published`)
  }
  const discard = () => {
    setHist(historyOf(saved))
    setTrace(null)
  }

  return (
    <div ref={shell} className={`bb ${inspOpen ? '' : 'is-insp-closed'}`} style={{ '--bb-insp': `${inspW}px` } as React.CSSProperties}>
      <Board
        policy={draft}
        selection={selection}
        diagnostics={diagnostics}
        shadowed={shadowed}
        trace={trace}
        resolve={resolve}
        onSelect={(s) => {
          setSelection(s)
          /* Clicking a card opens the panel, always. The inspector is the only
             place a rule can be edited, so a click that selects a card behind a
             collapsed panel selected nothing a person could act on. Collapsing
             stays available; it just does not survive the next click. */
          if (s.kind !== 'none') setInspOpen(true)
        }}
        onInsert={(at) => insert(blankRule(), at)}
        onMove={move}
        onToggle={(i, on) => patchRule(i, { enabled: on })}
        onDuplicate={duplicate}
        onDelete={remove}
        onHover={setHover}
      >
        <div className="bb__float bb__float--tl" role="toolbar" aria-label="History and view">
          <button type="button" className="bb__act" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo(hist)} onClick={() => setHist(undo)}>
            <Undo2 size={14} strokeWidth={2} />
          </button>
          <button type="button" className="bb__act" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
            <Redo2 size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="bb__float bb__float--tr" role="toolbar" aria-label="Publishing">
          {/* The pips are back, with the sheet that gives them somewhere to
              open — and with what made them worth having in the first place:
              each carries its own answer, so the toolbar reports the state of
              the policy without being opened. A pip that only opens a panel is
              a menu item; a pip reading "F · 5 through" is a finding. */}
          {features.gauntlet && (
            <button type="button" className={`bb__pip ${sheet === 'check' ? 'is-on' : ''}`} title={test ? test.gradeReason : 'No rules are switched on, so there is nothing to grade'} onClick={() => setSheet('check')}>
              <ListChecks size={13} strokeWidth={2} aria-hidden />
              Check
              {test ? (
                <>
                  <span className={`bb__grade is-${test.grade}`}>{test.grade}</span>
                  {test.breaches > 0 && <span className="bb__n">{test.breaches} through</span>}
                </>
              ) : (
                <span className="bb__n">—</span>
              )}
            </button>
          )}
          {features.blastRadius && (
            <button
              type="button"
              className={`bb__pip ${sheet === 'impact' ? 'is-on' : ''} ${movement && movement.looser > 0 ? 'is-looser' : ''}`}
              title={movement ? `${movement.stricter} stricter · ${movement.looser} looser, of 1,440 modelled situations` : 'Nothing unsaved to compare'}
              onClick={() => setSheet('impact')}
            >
              <Activity size={13} strokeWidth={2} aria-hidden />
              What changes
              <span className="bb__n">{movement ? movement.changed.toLocaleString() : '—'}</span>
            </button>
          )}
          <span className="bb__float__sep" />
          {dirty && (
            <Button variant="ghost" size="sm" onClick={discard}>
              Discard
            </Button>
          )}
          {/* The same two labels the trail uses, chosen the same way. Lite has
              no publish gate, so the button says what it actually does there
              rather than promising a review step that does not exist. */}
          <Button variant="brand" size="sm" disabled={!dirty} title={blockers > 0 ? `${blockers} error${blockers === 1 ? '' : 's'} to fix first` : undefined} onClick={() => setReview(true)}>
            {features.publish ? 'Review & publish' : 'Review & Save'}
          </Button>
          <span className="bb__float__sep" />
          <button type="button" className="bb__act" aria-label={inspOpen ? 'Hide the inspector' : 'Show the inspector'} aria-pressed={inspOpen} onClick={() => setInspOpen((v) => !v)}>
            {inspOpen ? <PanelRightClose size={14} strokeWidth={2} /> : <PanelRightOpen size={14} strokeWidth={2} />}
          </button>
        </div>
      </Board>

      {inspOpen && (
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

      <Inspector
        draft={draft}
        selection={selection}
        onPatchRule={patchRule}
        onPatchFallback={patchFallback}
        onInsert={insert}
        onClose={() => setInspOpen(false)}
      />

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
              if (r) {
                setSelection({ kind: 'rule', id: r.id })
                setInspOpen(true)
              }
            }
          }}
        />
      )}

      {/* Every binding on one card, opened by the key it documents.

          Discoverability is the whole point: none of these is guessable, and a
          shortcut nobody knows about is a shortcut nobody has. `?` is the
          convention, and it is listed here too so the sheet explains how it
          was reached. */}
      <Modal open={keys} onClose={() => setKeys(false)} title="Keyboard" width={460}>
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
        onSelect={setSelection}
        onApplyRules={(rules, note) => {
          commitDraft({ ...draft, rules })
          store.showToast(note)
        }}
      />

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
        width={460}
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
  )
}
