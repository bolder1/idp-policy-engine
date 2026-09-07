import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Maximize2, Plus, X } from 'lucide-react'

import { Modal, Toggle } from '../../kit'
import { restConditions } from '../../audience-ops'
import { fallbackRule, type Audience, type Policy, type Rule } from '../../data'
import { PARTS, TONE, type Part, type Selection } from './model'
import { PART_LABEL } from './parts'
import { WhatEditor } from './WhatEditor'
import { WhenEditor } from './WhenEditor'
import { WhoEditor } from './WhoEditor'

/* -----------------------------------------------------------------------------
   The inspector — the right pane, for whatever is selected on the board.

   It had three tabs. The first answered for the selection; the other two —
   Check and Impact — were about the whole policy and did not change with it,
   which is exactly why they did not belong beside it. A pane dedicated to the
   thing you clicked cannot also be a pane about everything, and the tab strip
   was the seam: click a card, and whether you saw it depended on which tab you
   were last on.

   So the tabs are gone and this is one pane. Click a card, its settings are
   here. CheckTab.tsx and ImpactTab.tsx are untouched — those questions are
   real, they just need a home that is not stapled to the selection.

   The rule pane lost two sections with them. `Checks` restated the diagnostics
   the card already marks, and `Reach` was an estimate with three different
   caveats about when it is wrong — both were reference, in the space the
   editing needs.
   -------------------------------------------------------------------------- */

export function Inspector({
  draft,
  selection,
  onPatchRule,
  onPatchFallback,
  onOpenPart,
  onClose,
}: {
  draft: Policy
  selection: Selection
  onPatchRule: (i: number, p: Partial<Rule>) => void
  onPatchFallback: (p: Partial<Rule>) => void
  /* The one part-changing control the PANEL owns, and it exists for exactly
     one state: a Who pane that has stood down on an OR-shaped rule has to be
     able to hand you to the pane that can do the job. It is not a switcher —
     one button, one condition, one direction. */
  onOpenPart: (part: Part) => void
  onClose: () => void
}) {
  /* Resolved once. `at` is -1 when the selected rule is gone — undone, deleted,
     discarded — but the board no longer mounts this component in that case, so
     the -1 is a guard rather than a state anybody sees. */
  const at = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const rule = at >= 0 ? draft.rules[at] : undefined
  const part = selection.kind === 'rule' ? selection.part : null
  /* The whole rule, in a room. The panel is 400px because a condition row needs
     a mark, an operator and a value side by side; the three parts are separate
     panes here, and this is the one surface that shows all of them at once. */
  const [focus, setFocus] = useState(false)
  const patch = (p: Partial<Rule>) => onPatchRule(at, p)

  /* Two names, because the panel and the room are showing different things.
     The panel shows one part and says which; the room shows all three. */
  const what = rule && part ? `Rule ${at + 1} · ${PART_LABEL[part]}` : 'The default'
  const roomTitle = rule ? `Rule ${at + 1}` : 'The default'

  const pane =
    !rule || !part ? null : part === 'who' ? (
      <WhoPane rule={rule} audience={draft.audience} onPatch={patch} onOpenPart={onOpenPart} />
    ) : (
      <ConditionPane rule={rule} onPatch={patch} />
    )

  return (
    <aside className="bb__insp" aria-label="Inspector">
      <div className="bb__inspbar">
        <b>{what}</b>
        {/* Not a wider version of this panel any more — it is a different view,
            and the label says which. */}
        <button type="button" className="bb__act" aria-label="Open the whole rule" title="Whole rule" onClick={() => setFocus(true)}>
          <Maximize2 size={14} strokeWidth={2} />
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Full-bleed, not a wider box.

          It was a 1100px dialog centred on the board, which is the shape you
          reach for when a form is long — and this is not a long form, it is
          three questions that were being squeezed into a column each. At 1100
          the conditions wrapped, the time fields stacked, and the right half
          ran out of content two thirds of the way down. Giving it the screen
          lets the halves be the width they actually need. */}
      <Modal open={focus} onClose={() => setFocus(false)} title={roomTitle} width={2400}>
        <div className="bb__focus">
          {rule ? (
            <WholeRulePane rule={rule} index={at} openOn={part} audience={draft.audience} onPatch={patch} onOpenPart={onOpenPart} />
          ) : (
            <FallbackPane rule={draft.fallback ?? fallbackRule()} onPatch={onPatchFallback} />
          )}
        </div>
      </Modal>

      {/* `id` because the card's three part buttons carry
          `aria-controls="bb-insp-body"` — they open this. */}
      <div className="bb__inspbody" id="bb-insp-body">
        {focus ? (
          /* Not rendered while the whole-rule view is open — two live copies of
             one editor is two sets of inputs writing the same rule. */
          <p className="bb__secnote">Open in the whole-rule view.</p>
        ) : rule && part ? (
          <>
            {/* The identity block is NOT one of the parts, and it is NOT inside
                the part's key.

                What the rule is called, what it is for and whether it is on are
                the same facts whichever third you are editing. Re-fading them
                on a part switch would be the panel announcing a change of
                subject that did not happen — and it would remount a controlled
                text input under somebody's cursor.

                So: two keys. Changing rule fades both; changing part fades only
                the form, which is the only thing that changed. The old single
                key omitted the part entirely and still COMPILES with one on the
                selection, so Who to Condition would have been the one change of
                subject on this surface that does not fade — the behavioural
                break the type checker cannot catch. */}
            <motion.div key={`head:${rule.id}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
              <RuleHead rule={rule} index={at} onPatch={patch} />
            </motion.div>
            {/* The two questions, as tabs on the form.

                They were a row of buttons on the CARD, which put the
                navigation on the canvas and the thing it navigated in the
                panel — so choosing what to edit meant looking away from where
                the editing happens, and every card carried two more controls
                whether or not it was the one you were working on.

                On the form they are where the work is, they cost the canvas
                nothing, and the card goes back to being a reading of the rule
                rather than a control surface. Clicking a card still opens Who,
                which is the first question and the one people start with. */}
            <div className="bb__panetabs" role="tablist" aria-label="Which part of this rule">
              {PARTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={part === p}
                  className={part === p ? 'is-on' : ''}
                  onClick={() => onOpenPart(p)}
                >
                  {PART_LABEL[p]}
                </button>
              ))}
            </div>
            <motion.div key={`pane:${rule.id}:${part}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
              {pane}
            </motion.div>
          </>
        ) : selection.kind === 'fallback' ? (
          /* Branching on `kind`, not on `rule` being truthy. The old test sent
             a selection of `none` into the fallback pane and was saved only by
             the board declining to mount this at all. */
          <motion.div key="fallback" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
            <FallbackPane rule={draft.fallback ?? fallbackRule()} onPatch={onPatchFallback} />
          </motion.div>
        ) : null}
      </div>
    </aside>
  )
}

/* --- The three panes ---------------------------------------------------------

   Three different forms, not one form with two thirds hidden. A two-list picker
   with its own operators; a predicate builder with an add button in its header;
   a decision and a numbered ladder at full height with nothing above them
   competing for the room.

   And they are separately MOUNTED, which is the point rather than a side
   effect: leaving Condition throws away the catalogue you left half open, and
   it should. */

function WhoPane({
  rule,
  audience,
  onPatch,
  onOpenPart,
}: {
  rule: Rule
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
  onOpenPart: (part: Part) => void
}) {
  return (
    /* No heading. The tab directly above says "Who", and a pane whose first
       line repeats the control that opened it is the panel introducing itself
       twice. */
    <div className="bb__ask bb__ask--pane">
      <WhoEditor rule={rule} audience={audience} onPatch={onPatch} onOpenPart={onOpenPart} />
    </div>
  )
}

function ConditionPane({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  /* `openAt` gets its setter back.

     It was threaded DEAD from here — `const [openAt] = useState(null)`, never
     anything but null — so the effect in `WhenEditor` that opens the catalogue
     could never fire. It was written for a section header's `+` that went with
     the accordion. A pane of its own has a header again, and this is what it
     is for. */
  const [openAt, setOpenAt] = useState<{ nonce: number } | null>(null)
  const n = restConditions(rule.when).length
  return (
    <div className="bb__ask bb__ask--pane">
      {/* The head stays because the count and the `+` need somewhere to live;
          the heading itself goes, for the same reason as the Who pane's. */}
      <div className="bb__ask__head">
        {n > 0 && <span className="bb__count">{n}</span>}
        <button
          type="button"
          className="bb__secact"
          aria-label="Add a condition"
          title="Add a condition"
          onClick={() => setOpenAt({ nonce: Date.now() })}
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>
      <WhenEditor rule={rule} onPatch={onPatch} openAt={openAt} />

      {/* THEN, in the same pane, because it is the second half of the sentence
          the condition starts.

          It had a pane of its own for exactly as long as it took to use one:
          "when this happens, do that" is one thought, and answering it meant
          changing panes in the middle of it. Two sections under one header,
          which is the shape they had before the split — and the split's one
          good idea, that WHO is a different question, is the part that
          survives. */}
      <div className="bb__ask bb__ask--next">
        <div className="bb__ask__head">
          <h3>Then</h3>
          <p>What happens when it matches?</p>
        </div>
        <WhatEditor rule={rule} onPatch={onPatch} />
      </div>
    </div>
  )
}

/* The identity block: what this rule is called, and what it is for.

   The description used to be a collapsible section of its own, headed "Why
   this rule exists" and carrying two sentences explaining why the field was
   there. Three lines of chrome around one textarea — and it sat below the
   name, separated by a section border, so the two halves of the rule's
   identity read as unrelated things.

   They are one thing. The name is what every other surface prints; the
   description is what the next person reads before deciding whether they are
   allowed to delete it. So they share a block, the heading is gone, and the
   placeholder does the explaining. Both save as typed.

   In the whole-rule view it is one line. The panel needs the name and the note
   stacked because it is 400px wide; full screen it does not, and a two-row
   textarea across 2400px is a field with a paragraph of empty space in it. */
function RuleHead({
  rule,
  index,
  focus,
  onPatch,
}: {
  rule: Rule
  index: number
  focus?: boolean
  onPatch: (p: Partial<Rule>) => void
}) {
  return (
    <div className={`bb__insphead ${focus ? 'is-focus' : ''}`}>
      <span className={`bb__idx is-${TONE[rule.decision]}`} aria-hidden>
        {index + 1}
      </span>
      <div className="bb__inspname">
        <input className="bb__input bb__input--title" aria-label="Rule name" value={rule.name} placeholder="Name this rule" onChange={(e) => onPatch({ name: e.target.value })} />
      </div>
      <Toggle checked={rule.enabled} onChange={(enabled) => onPatch({ enabled })} label={rule.enabled ? 'On' : 'Off'} size="sm" />
    </div>
  )
}

/* --- A rule, as sections ------------------------------------------------------ */

function WholeRulePane({
  rule,
  index,
  openOn,
  audience,
  onPatch,
  onOpenPart,
}: {
  rule: Rule
  index: number
  /** Which part the panel was showing, so the room opens where you were. */
  openOn: Part | null
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
  onOpenPart: (part: Part) => void
}) {
  /* Still dead here, and honestly so: the live one lives in `ConditionPane`,
     which has a header with a `+` in it. This view has no such header — it
     shows all three parts at once and adds nothing above them. */
  const [openAt] = useState<{ nonce: number } | null>(null)

  /* It opens where you were. The card is the navigation and this covers the
     board, so inside here the card is unreachable — which is exactly why this
     is the one surface showing all three parts at once. Asking for more room
     should not cost you your place. */
  useEffect(() => {
    if (openOn) document.getElementById(`bb-ask-${openOn}`)?.scrollIntoView({ block: 'start' })
  }, [openOn])
  /* The rule that catches whatever this one lets through was resolved here and
     handed to THEN, which printed it as a sentence: "everyone else falls to
     rule 3, Executive step-up". It is the arrow the chain draws on the canvas,
     which the panel only ever opens beside — the same fact, told twice, in the
     half of the panel with the least room for it. */

  return (
    <>
      {/* The identity block: what this rule is called, and what it is for.

          The description used to be a collapsible section of its own, headed
          "Why this rule exists" and carrying two sentences explaining why the
          field was there. Three lines of chrome around one textarea — and it
          sat below the name, separated from it by a section border, so the two
          halves of the rule's identity read as unrelated things.

          They are one thing. The name is what every other surface prints; the
          description is what the next person reads before deciding whether
          they are allowed to delete it. So they share a block, the heading is
          gone, and the placeholder does the explaining. Both save as typed. */}
      {/* The identity block, and in focus mode it is one line.

          The panel needs the name and the note stacked because it is 400px
          wide. Full screen it does not: a two-row textarea across 2400px is a
          field with a paragraph of empty space in it, and it pushed the two
          halves — the part somebody opened focus mode to see — below the fold.
          The note becomes a single line that grows only if there is something
          in it. */}
      <RuleHead rule={rule} index={index} focus onPatch={onPatch} />

      {/* One block, and no accordion on it.

          IF and THEN were two collapsible sections, which made a rule look like
          two settings that happen to be near each other. A rule is one
          sentence: these conditions, therefore this outcome. Splitting the
          sentence across two headers you can close independently let you look
          at a rule with half of it folded away — and the half most likely to be
          folded is the one that says what actually happens.

          Nothing here collapses now. The two halves sit under one header with
          the conditions above and the outcome below, in the order they are
          read. In focus mode the grid puts them side by side instead; same
          editors either way. */}
      {/* Two questions, and the numbers on them have gone.

          They were added to say there are two halves and which comes first.
          The words already do that: `If` and `Then` are a sequence in English,
          they sit side by side in reading order, and each carries a caption
          saying what it asks. A numeral in a filled circle in front of a word
          that is already an ordinal is the form telling you how to read two
          words — and it cost the heading its whole left edge, so `If` started
          further right than everything under it. */}
      <section className="bb__rule is-focus">
        <div className="bb__rulebody">
          <div className="bb__rulehalf">
            {/* Who first, then the circumstances.

                Writing a rule starts with a person — "for contractors, when
                they are off the office network, ask for a second factor" — and
                the form used to open on the second clause. Groups and people
                were two attributes among twenty-eight in a catalogue, reached
                the same way as Day of week, so the question everybody starts
                with was the one you had to go looking for.

                It is a VIEW, not a new field: it reads and writes the `group`
                and `user` conditions the rule could always hold. See
                `audience-ops.ts` for why that matters — an audience held beside
                the conditions is a gate the linter and the simulator cannot
                see, which is exactly why `Rule.appliesTo` was removed. */}
            <div className="bb__ask" id="bb-ask-who">
              <div className="bb__ask__head">
                <h3>Who</h3>
                <p>Which people is this rule about?</p>
              </div>
              <WhoEditor rule={rule} audience={audience} onPatch={onPatch} onOpenPart={onOpenPart} />
            </div>

            <div className="bb__ask bb__ask--next" id="bb-ask-when">
              <div className="bb__ask__head">
                {/* `Condition` here too, so the room and the card say one word
                    for one question. The `if` the block below prints is the
                    predicate's own grammar and stays. */}
                <h3>Condition</h3>
                <p>And in what circumstances?</p>
              </div>
              <WhenEditor rule={rule} onPatch={onPatch} openAt={openAt} />
            </div>
          </div>

          <div className="bb__rulehalf">
            <div className="bb__ask" id="bb-ask-then">
              <div className="bb__ask__head">
                <h3>Then</h3>
                <p>What happens when it matches?</p>
              </div>
              {/* `focus` and `next` are gone from its props along with the two
                  paragraphs that needed them. `next` fed a sentence naming the
                  rule that catches whatever this one lets past — which is the
                  arrow the chain on the canvas draws, and `focus` existed only
                  to suppress that sentence when the panel was wide. */}
              <WhatEditor rule={rule} onPatch={onPatch} />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function FallbackPane({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  return (
    <>
      <div className="bb__insphead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>Nothing else matched</h2>
          <p>
            The default at the bottom. Its name and place are fixed; what it does is yours. It has no Who and no
            Condition — it is what happens when nothing else matched.
          </p>
        </div>
      </div>
      <section className="bb__rule">
        <div className="bb__rulehead">
          <h3>Then</h3>
        </div>
        <div className="bb__rulebody">
          <div className="bb__rulehalf">
            <WhatEditor rule={rule} onPatch={onPatch} terminal />
          </div>
        </div>
      </section>
    </>
  )
}
