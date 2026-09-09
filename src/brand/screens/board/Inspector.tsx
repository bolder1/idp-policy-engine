import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChevronsLeftRight, ChevronsRightLeft, Plus, X } from 'lucide-react'

import { Toggle } from '../../kit'
import { restConditions } from '../../audience-ops'
import { fallbackRule, type Policy, type Rule } from '../../data'
import { TONE, type Part, type Selection } from './model'
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

  /* The bar names the RULE, not a third of it. It used to append the open part
     — "Rule 1 · Condition" — which was the tab strip saying its own state
     twice. There is no tab strip. */
  const what = rule ? `Rule ${at + 1}` : 'The default'

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
            {/* ONE panel, three sections, all of them open.

                They were two tabs — Who and Condition, with Then living inside
                the second. A rule is one sentence: these people, when this
                holds, do that. Tabs cut it in half and made the reader hold the
                first half in their head to check the second, and nothing on
                this panel ever showed the whole rule at once. Worse, the two
                tabs were the SECOND switcher on the surface: Who's own
                groups/people control sat directly under them, two near-identical
                strips back to back asking unrelated questions.

                Sections instead. Each is a small heading and a hairline, with no
                box — a bordered card per section is three frames inside a
                frame, and the boxes were most of why this panel read as a stack
                of unrelated widgets rather than as one form.

                The selection's part survives and still does its two useful jobs:
                the card marks which third you opened, and the bracket keys still
                move between them. What it no longer does is HIDE the other
                two. */}
            <motion.div key={`pane:${rule.id}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
              <Section id="who" title="Who" hint="Leave empty for everyone this policy governs" focused={part === 'who'}>
                <WhoEditor rule={rule} audience={draft.audience} onPatch={patch} onOpenPart={onOpenPart} />
              </Section>

              <ConditionSection rule={rule} onPatch={patch} focused={part === 'when'} />

              <Section id="then" title="Then" hint="What happens when the rule matches">
                <WhatEditor rule={rule} onPatch={patch} />
              </Section>
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

/* --- A section of the panel --------------------------------------------------

   A heading, an optional hint, an optional action, and a hairline under the
   lot. No box: three bordered cards inside a bordered panel is four frames to
   draw one form, and the boxes were most of why this panel read as a pile of
   widgets rather than as a sentence.

   `focused` carries the selection's part, and it does the one job the tabs did
   that was worth keeping — saying which third of the rule you arrived at. It
   tints the heading rather than hiding the other two. */
function Section({
  id,
  title,
  hint,
  action,
  focused,
  children,
}: {
  id: string
  title: string
  hint?: string
  action?: ReactNode
  focused?: boolean
  children: ReactNode
}) {
  return (
    <section className={`bb__sec ${focused ? 'is-focused' : ''}`} aria-labelledby={`bb-sec-${id}`}>
      <div className="bb__sec__head">
        <h3 id={`bb-sec-${id}`}>{title}</h3>
        {hint && <p>{hint}</p>}
        {action}
      </div>
      {children}
    </section>
  )
}

function ConditionSection({
  rule,
  onPatch,
  focused,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  focused: boolean
}) {
  /* The section header's add button, anchored by a nonce so the same button
     pressed twice opens twice.

     It was threaded DEAD from the old pane — declared with no setter, never
     anything but null — so the effect in `WhenEditor` that opens the catalogue
     could never fire from here at all. */
  const [openAt, setOpenAt] = useState<{ nonce: number } | null>(null)
  const n = restConditions(rule.when).length
  return (
    <Section
      id="if"
      title="If"
      hint={n === 0 ? 'Every sign-in that reaches this rule matches' : undefined}
      focused={focused}
      action={
        <button
          type="button"
          className="bb__secact"
          aria-label="Add a condition"
          title="Add a condition"
          onClick={() => setOpenAt({ nonce: Date.now() })}
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      }
    >
      <WhenEditor rule={rule} onPatch={onPatch} openAt={openAt} />
    </Section>
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
