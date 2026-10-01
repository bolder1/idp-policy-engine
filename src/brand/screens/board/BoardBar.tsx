import { ArrowLeft } from 'lucide-react'
import { Activity, ChevronRight, GraduationCap, ListChecks, Pencil } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import { DemoButton } from '../../tour/DemoButton'
import { Button, IconButton, NameField } from '../../kit'
import type { Policy } from '../../data'
import { ChangeState } from '../../leave-guard'
import { POLICY_NAME_MAX, policyNameIssue } from '../../policy-name'
import { useBrand } from '../../store'
import { StatusControl } from '../status-control'

/* -----------------------------------------------------------------------------
   The board's top row.

   The policy's header used to FLOAT over the canvas — 76px of opaque strip laid
   across the top of the stage, with a focus mode that slid it away so you could
   have the space back. That bought the canvas its full height and cost
   something worse: nothing on this screen had a fixed home. The header covered
   the chain's first node until you panned; the publishing cluster hovered in
   the top-right corner and stepped sideways whenever the panel opened; and the
   one way to see the whole board was to learn that a button in the zoom toolbar
   hid the title.

   So the strip stops floating and starts being a region. It is 48px, flat, and
   in the flow — a breadcrumb on the left, the publishing verbs on the right,
   one rule underneath it — and the canvas below it is a region of its own with
   the config panel beside it rather than on top of it. Three bands, three
   jobs, and no piece of chrome standing on another piece's work.

   Not `PolicyBar` with a `slim` prop. Two reasons, and both are about what the
   bar CONTAINS rather than how tall it is: everything the board's bar gained —
   Discard, Review & publish, the Check and What-changes readings — closes over
   `BoardBuilder`'s draft state, which a component shared with the trail cannot
   reach; and the trail's bar is the anchor for a tour stop that a test asserts
   by name. Leaving it alone is the version of this change that breaks nothing.

   Where the space came from, since 48px is a third of what the old strip used:

   · The application stops being a labelled FACT. It was a 16px mark (and a
     "+N") on the name chip; since 21 Sep 2026 it is not in the bar at all —
     the start node names the applications and opens the pane that edits
     them, and the name is a heading renamed in place.
   · `policy.type` goes. "App Access" is true of almost every policy here and
     is not a thing anybody navigates by.
   · The audience goes too. It was the last labelled fact standing, and it is
     the one thing in the row that is neither where you are nor what you can do
     to the draft — a reading, in a bar whose job is to be quiet. Each rule's
     Who pane says who that rule covers, which is where the narrowing is
     actually done.
   -------------------------------------------------------------------------- */

export function BoardBar({
  policy,
  unsaved = false,
  draftSaved = false,
  actions,
  onLearn,
  onWatchDemo,
}: {
  policy: Policy
  /* The change-state pill beside the status: edits since the last save, or a
     saved draft that is not live yet. */
  unsaved?: boolean
  draftSaved?: boolean
  /* The publishing verbs, which belong to the builder's draft rather than to
     the policy. Passed in rather than reached for: this component knows what a
     policy IS, and the host knows what is unsaved about it. */
  actions?: ReactNode
  /* The way back into the guided demo.

     On the bar rather than in a menu, for the reason the trail's tour button
     was moved onto its bar: the person who needs it is the person least likely
     to know which menu it is in. Optional, so a caller that has no walkthrough
     to offer simply does not draw one. */
  onLearn?: () => void
  /* And the way to the recording, which is a peer of it rather than something
     inside it: watching and doing are two answers to one question, and burying
     one of them a click behind the other makes the product pick for you. */
  onWatchDemo?: () => void
}) {
  const store = useBrand()
  /* Renaming in place, as on the library pages: the heading and an
     always-shown pencil, and the kit's NameField while it is open.

     Saved straight to the policy on ✓, Enter or leaving the field — a name is
     a fact about the policy, not a rule edit, so it stays out of the rules'
     draft and undo stack (see PolicyDetails.tsx). The builder reads the name
     back from the store, so the heading and Review agree at once. */
  const [renaming, setRenaming] = useState(false)
  /* Where focus goes when the rename ends. The field unmounts with the focus in
     it, and focus on <body> is where the board's single-key shortcuts act. Only
     rescued when it actually landed on <body> after a leave: a click or Tab to
     a real control keeps it. */
  const pencil = useRef<HTMLSpanElement | null>(null)
  const focusPencil = (onlyIfLost = false) =>
    requestAnimationFrame(() => {
      const at = document.activeElement
      if (onlyIfLost && at && at !== document.body) return
      pencil.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    })
  const [name, setName] = useState(policy.name)
  const [nameErr, setNameErr] = useState<string | null>(null)
  const problem = policyNameIssue(name, store.policies, policy.id)
  const keepName = () => {
    const saved = store.policyById(policy.id)
    const trimmed = name.trim()
    if (!saved || problem || trimmed === saved.name) return
    store.savePolicy({ ...saved, name: trimmed })
    store.showToast('Name saved')
  }
  const applyName = () => {
    if (problem) {
      setNameErr(problem)
      return
    }
    keepName()
    setRenaming(false)
    focusPencil()
  }
  const cancelName = () => {
    setName(policy.name)
    setNameErr(null)
    setRenaming(false)
    focusPencil()
  }

  return (
    <header className="bbtop">
      <nav className="bbtop__crumbs" aria-label="Where this policy sits">
        <button type="button" className="bbtop__back" aria-label="Back to policies" onClick={() => store.go({ name: 'policies' })}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" className="bbtop__crumb" onClick={() => store.go({ name: 'policies' })}>
          Policies
        </button>

        <ChevronRight size={13} strokeWidth={2} className="bbtop__sl" aria-hidden />

        {/* The applications are not in this row any more. The mark and the
            "+N" beside the name said which apps the policy protects; the start
            node at the head of the chain says it in words and opens the pane
            that edits them, so the bar keeps to where you are and what the
            policy is called. */}
        {renaming ? (
          <div className="bbtop__rename">
            <NameField
              value={name}
              max={POLICY_NAME_MAX}
              label="Policy name"
              errorId={nameErr ? 'bbtop-name-err' : undefined}
              invalid={!!nameErr}
              onChange={(v) => {
                setName(v)
                setNameErr(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyName()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelName()
                }
              }}
              onLeave={keepName}
              onClose={() => {
                if (problem) setNameErr(problem)
                else {
                  setRenaming(false)
                  focusPencil(true)
                }
              }}
              onApply={applyName}
              onCancel={cancelName}
            />
            {nameErr && (
              <p id="bbtop-name-err" className="bbtop__nameerr" role="alert">
                {nameErr}
              </p>
            )}
          </div>
        ) : (
          <>
            <h1 className="bbtop__title" title={policy.name}>
              {policy.name}
            </h1>
            <span className="bbtop__pencil" ref={pencil}>
              <IconButton
                icon={Pencil}
                size="sm"
                tone="ghost"
                label="Rename"
                onClick={() => {
                  setName(policy.name)
                  setNameErr(null)
                  setRenaming(true)
                }}
              />
            </span>
          </>
        )}

        {/* Read from the store, not this bar's copy: the status is switched
            here, and it is not part of the draft. */}
        <StatusControl policyId={policy.id} />
        <ChangeState unsaved={unsaved} draft={draftSaved} />
      </nav>

      {/* Who it governs stood here — a glyph, a phrase, a count and a hover
          panel listing the groups. Removed: it is the one thing in this row
          that is neither where you are nor what you can do to the draft, and
          the bar is meant to be quiet. The rules themselves say who they cover on
          the Who pane, per rule, which is where the narrowing actually happens. */}

      <div className="bbtop__acts">
        {onWatchDemo && <DemoButton onClick={onWatchDemo} />}
        {onLearn && (
          <button
            type="button"
            className="bbtop__learn"
            aria-label="Learn the board"
            title="Learn the board — a two-minute demo, or five steps that build a rule"
            onClick={onLearn}
          >
            <GraduationCap size={16} strokeWidth={1.9} aria-hidden />
          </button>
        )}
        {actions}
      </div>
    </header>
  )
}

/* --- The readings, and the verbs ---------------------------------------------

   Two pips that carry their own answer — "Check · A · 2 through" is a finding,
   where a pip that only opens a panel is a menu item — and then the two things
   that end a draft. Both pips are withheld in the lite edition, which is why
   the divider before them is conditional: rendered unconditionally it became
   the row's FIRST child, a hairline dividing nothing from Discard.
   -------------------------------------------------------------------------- */

export function BoardBarActions({
  test,
  movement,
  sheet,
  toPublish,
  unsaved,
  canDiscard,
  blockers,
  saveBlocked,
  onSheet,
  onSaveDraft,
  onDiscard,
  onSave,
}: {
  test: { grade: string; gradeReason: string; breaches: number } | null
  movement: { changed: number; stricter: number; looser: number } | null
  sheet: 'check' | 'impact' | null
  /** Something differs from live, or the policy has never been published. */
  toPublish: boolean
  /** Edits since the last save or draft. */
  unsaved: boolean
  /** Unsaved edits or a saved draft to throw away. */
  canDiscard: boolean
  blockers: number
  /** An error on a rule that runs, on a policy that has an application. */
  saveBlocked: boolean
  onSheet: (t: 'check' | 'impact') => void
  onSaveDraft: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  const features = useBrand().features
  return (
    <>
      {/* The two readings, in one box so the demo can light them together.

          A wrapper with a real box rather than `display: contents`: a contents
          element has no rect at all, so the spotlight would measure zeros and
          fall back to a centred card pointing at nothing. When BOTH readings
          are withheld by the edition it collapses to an empty span, measures
          zero, and the tour centres its last card — which is the correct
          degradation, since there is then nothing to point at. */}
      <span className="bbtop__pips" data-tour="board-tools">
      {features.gauntlet && (
        <button
          type="button"
          className={`bb__pip ${sheet === 'check' ? 'is-on' : ''}`}
          title={test ? test.gradeReason : 'No rules are switched on, so there is nothing to grade'}
          onClick={() => onSheet('check')}
        >
          <ListChecks size={13} strokeWidth={2} aria-hidden />
          Check
          {/* With the sheet open on Check, the sheet carries the reading. */}
          {sheet !== 'check' &&
            (test ? (
              <>
                <span className={`bb__grade is-${test.grade}`}>{test.grade}</span>
                {test.breaches > 0 && <span className="bb__n">{test.breaches} through</span>}
              </>
            ) : (
              <span className="bb__n">—</span>
            ))}
        </button>
      )}
      {features.blastRadius && (
        <button
          type="button"
          className={`bb__pip ${sheet === 'impact' ? 'is-on' : ''} ${movement && movement.looser > 0 ? 'is-looser' : ''}`}
          title={movement ? `${movement.stricter} stricter · ${movement.looser} looser, of 1,440 modelled situations` : 'Nothing unsaved to compare'}
          onClick={() => onSheet('impact')}
        >
          <Activity size={13} strokeWidth={2} aria-hidden />
          What changes
          {sheet !== 'impact' && <span className="bb__n">{movement ? movement.changed.toLocaleString() : '—'}</span>}
        </button>
      )}
      </span>
      {(features.gauntlet || features.blastRadius) && <span className="bbtop__sep" />}

      {/* Always present, as in the trail; enabled only with something to throw away. */}
      {/* A disabled button says why. Discard is destructive, so it is the
          kit's danger outline. */}
      <Button variant="danger" size="sm" disabled={!canDiscard} title={canDiscard ? undefined : 'Nothing to discard'} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="secondary" size="sm" disabled={!unsaved} title={unsaved ? undefined : 'No changes to save'} onClick={onSaveDraft}>
        Save draft
      </Button>
      {/* One word, and it does that word (owner, 23 Sep 2026: "make it save
          only — hide the review part as of now, only show the save directly;
          will think about the review part later").

          It said "Review & save" and opened the read-back dialog, which then
          held the actual save behind a second press. The dialog is still in the
          tree and is still where the walkthrough takes you; nothing on this bar
          opens it. The one thing it alone offered — "Save and turn on" for a
          draft — is on the status pill beside the policy's name, which is where
          a draft is switched on from anyway.

          It keeps the dialog's GATE. An error on a rule that runs blocked the
          dialog's footer buttons, and bypassing the dialog would have quietly
          removed that; `saveBlocked` is the same test. Without applications the
          save produces a draft, and a draft is allowed to be unfinished, so
          errors do not block it — same rule as `committed`.

          The anchor is on a WRAPPER rather than on the button, because `Button`
          takes a fixed set of props and does not spread the rest — a
          `data-tour` handed to it would be dropped silently, and a walkthrough
          whose last step lights nothing is exactly the failure the anchor tests
          exist to catch. The span is `display: contents`-free on purpose: it
          needs a real box for the spotlight to measure. */}
      <span className="bbtop__reviewwrap" data-tour="review">
        <Button
          variant="brand"
          size="sm"
          disabled={!toPublish || saveBlocked}
          title={
            !toPublish
              ? 'Nothing to save'
              : saveBlocked
                ? `${blockers} error${blockers === 1 ? '' : 's'} to fix first`
                : undefined
          }
          onClick={onSave}
        >
          {/* Named for its SCOPE, because the rule panel has a save of its own
              at its foot and two buttons reading "Save" on one screen is two
              questions (owner, 23 Sep 2026: "I see two save buttons that look
              awkward at a glance — give them different names and a different
              button style"). This one is the policy's, it is the brand button,
              and it sits with Discard and Save draft, which are the policy's
              too. The panel's is a secondary "Save changes" — same act, said
              from where the work is, and drawn a weight quieter so the eye
              picks one of the two rather than choosing between twins. */}
          {features.publish ? 'Publish policy' : 'Save policy'}
        </Button>
      </span>
    </>
  )
}
