import { useState } from 'react'
import { motion } from 'motion/react'
import { ChevronsLeftRight, ChevronsRightLeft, Plus, X } from 'lucide-react'

import { Toggle } from '../../kit'
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
  wide,
  onToggleWidth,
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
  /** Whether the panel is at its full width, and the way to change that. */
  wide: boolean
  onToggleWidth: () => void
}) {
  /* Resolved once. `at` is -1 when the selected rule is gone — undone, deleted,
     discarded — but the board no longer mounts this component in that case, so
     the -1 is a guard rather than a state anybody sees. */
  const at = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const rule = at >= 0 ? draft.rules[at] : undefined
  const part = selection.kind === 'rule' ? selection.part : null
  const patch = (p: Partial<Rule>) => onPatchRule(at, p)

  const what = rule && part ? `Rule ${at + 1} · ${PART_LABEL[part]}` : 'The default'

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
        {/* Narrow, or full width. Nothing else.

            A `Maximize2` stood here and opened the WHOLE RULE in a 2400px
            modal — all three parts side by side, over the board. Two objections
            and they compound: it was a third editor for a rule that already has
            two (the card and this panel), so the same fields existed in three
            places and this one had to blank itself while the modal was up; and
            it read as "make the panel bigger", which is the thing somebody
            actually wants from a control in this position and is not what it
            did.

            So it is that thing now. One button, two widths: the panel's full
            width, and a narrow one for when the canvas is what you are working
            on. At the narrow end it goes back to full, which is the whole
            behaviour — no third state, nothing to learn.

            The grip in the gutter still sets any width between; this is the
            two ends of it without the drag. */}
        <button
          type="button"
          className="bb__act"
          aria-label={wide ? 'Narrow the panel' : 'Widen the panel'}
          title={wide ? 'Narrow' : 'Widen'}
          onClick={onToggleWidth}
        >
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* The whole-rule room stood here: a 2400px `Modal` holding
          `WholeRulePane`, which drew Who, Condition and Then side by side over
          the whole board. Removed with the button that opened it — see the
          note in the bar above. */}

      {/* `id` because the card's three part buttons carry
          `aria-controls="bb-insp-body"` — they open this. */}
      <div className="bb__inspbody" id="bb-insp-body">
        {rule && part ? (
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

   It had a `focus` variant that laid the name and the note on one line for the
   2400px room. The room has gone and so has the variant — there is one width
   this block is ever drawn at now, and it is the panel's. */
function RuleHead({
  rule,
  index,
  onPatch,
}: {
  rule: Rule
  index: number
  onPatch: (p: Partial<Rule>) => void
}) {
  return (
    <div className="bb__insphead">
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

/* `WholeRulePane` stood here — the rule's three parts laid out side by side
   for the 2400px room. Gone with the room. Its editors are the same ones the
   panel mounts one at a time (`WhoEditor`, `WhenEditor`, `WhatEditor`); nothing
   was unique to it except the two-column grid it put them in. */

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
