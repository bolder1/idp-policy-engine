import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRightClose, PanelRightOpen, Redo2, Undo2 } from 'lucide-react'

import { Button } from '../../kit'
import { fallbackRule, reidRule, blankRule, type Policy, type Rule } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { ReviewDialog } from '../builder-dialogs'
import { diagnose, shadowedBy } from '../diagnostics'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from '../history'
import { walk, type SimEnv } from '../simulate'
import { Board } from './Board'
import { Inspector } from './Inspector'
import type { Selection, Trace } from './model'

import './board.css'

/* -----------------------------------------------------------------------------
   The board's host — state, and the two regions it feeds.

   Owns the draft (a history, so undo is one keystroke), the selection, the
   inspector's width and the rehearsal in flight. Everything the stage and the
   inspector do comes back here as a patch to the draft, which is the only way
   either of them changes anything.
   -------------------------------------------------------------------------- */

export function BoardBuilder({ policyId }: { policyId: string }) {
  const store = useBrand()
  const saved = store.policyById(policyId)
  const resolve = useNameLookup()

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [trace, setTrace] = useState<Trace | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [review, setReview] = useState(false)
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

  /* A rehearsal shown while you edit would go stale. Re-walked on every draft,
     silently — same run, updated verdicts — so the cards say what the rules
     now do without replaying the cascade. */
  useEffect(() => {
    setTrace((t) => (t ? { ...t, result: walk(draft, t.ctx, env) } : t))
  }, [draft, env])

  /* Keys: undo/redo, and Escape clears the rehearsal first, the selection second. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const action = historyKey(e)
      if (action && !typing) {
        e.preventDefault()
        setHist(action === 'redo' ? redo : undo)
        return
      }
      if (e.key === 'Escape' && !typing) {
        if (trace) setTrace(null)
        else setSelection({ kind: 'none' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trace])

  /* The deck and the before/after sweep were computed here for the three pips.
     They went with them — both are whole-policy questions, and running a
     thirteen-card gauntlet and two 1,440-situation sweeps on every keystroke to
     feed a toolbar nobody is looking at is not a cost worth carrying while
     those questions have no home. `runGauntlet`, `sweep` and `compare` are
     untouched and still tested. */
  const blockers = diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled)).length

  if (!saved) return <div className="bpage">This policy no longer exists.</div>

  /* --- Edits -------------------------------------------------------------------- */
  const commitDraft = (next: Policy) => setHist((h) => commit(h, next))
  const patchRule = (i: number, p: Partial<Rule>) => commitDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  const patchFallback = (p: Partial<Rule>) => commitDraft({ ...draft, fallback: { ...(draft.fallback ?? fallbackRule()), ...p } })

  const insert = (rule: Rule, at: number) => {
    const rules = [...draft.rules]
    rules.splice(at, 0, rule)
    commitDraft({ ...draft, rules })
    setSelection({ kind: 'rule', index: at })
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.rules.length || from === to) return
    const rules = [...draft.rules]
    const [r] = rules.splice(from, 1)
    rules.splice(to, 0, r)
    commitDraft({ ...draft, rules })
    if (selection.kind === 'rule' && selection.index === from) setSelection({ kind: 'rule', index: to })
  }
  const remove = (i: number) => {
    commitDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })
    if (selection.kind === 'rule') {
      if (selection.index === i) setSelection({ kind: 'none' })
      else if (selection.index > i) setSelection({ kind: 'rule', index: selection.index - 1 })
    }
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
          {/* Try a sign-in, Break-in test and What changes stood here, each
              opening a tab in the inspector. The inspector is one pane now —
              the rule you clicked — so they have nowhere to open, and the three
              of them were answering questions about the whole policy from a
              toolbar above one rule.

              CheckTab.tsx and ImpactTab.tsx are untouched and still build; when
              those questions get a home of their own, the pips come back with
              it. */}
          <span className="bb__float__sep" />
          {dirty && (
            <Button variant="ghost" size="sm" onClick={discard}>
              Discard
            </Button>
          )}
          <Button variant="brand" size="sm" disabled={!dirty} title={blockers > 0 ? `${blockers} error${blockers === 1 ? '' : 's'} to fix first` : undefined} onClick={() => setReview(true)}>
            Review &amp; publish
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

      <ReviewDialog open={review} policy={draft} onClose={() => setReview(false)} onConfirm={publish} />
    </div>
  )
}
