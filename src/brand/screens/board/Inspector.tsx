import { useState } from 'react'
import { motion } from 'motion/react'
import { Maximize2, X } from 'lucide-react'

import { Modal, Toggle } from '../../kit'
import { fallbackRule, type Policy, type Rule } from '../../data'
import { TONE, type Selection } from './model'
import { WhatEditor } from './WhatEditor'
import { WhenEditor } from './WhenEditor'

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
  onClose,
}: {
  draft: Policy
  selection: Selection
  onPatchRule: (i: number, p: Partial<Rule>) => void
  onPatchFallback: (p: Partial<Rule>) => void
  onClose: () => void
}) {
  /* Resolved once. `at` is -1 when the selected rule is gone — undone, deleted,
     discarded — but the board no longer mounts this component in that case, so
     the -1 is a guard rather than a state anybody sees. */
  const at = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const rule = at >= 0 ? draft.rules[at] : undefined
  const key = `${selection.kind}:${rule?.id ?? ''}`
  /* Focus mode. The panel is 400px because a condition row needs a mark, an
     operator and a value side by side; a rule with two groups of four outgrows
     that, and the answer to "this is cramped" should not be "drag the handle
     every time". Same panes, given a room. */
  const [focus, setFocus] = useState(false)

  const body = (inFocus: boolean) =>
    rule ? (
      <RulePane rule={rule} index={at} focus={inFocus} onPatch={(p) => onPatchRule(at, p)} />
    ) : (
      /* `?? fallbackRule()` rather than a truthiness gate: the default is drawn
         on the stage whether or not the policy has ever stored one, so
         selecting it has to open its panel too. Gating on `draft.fallback` sent
         every un-edited policy somewhere else, which read as the click having
         missed. */
      <FallbackPane rule={draft.fallback ?? fallbackRule()} onPatch={onPatchFallback} />
    )

  const what = rule ? `Rule ${at + 1}` : 'The default'

  return (
    <aside className="bb__insp" aria-label="Inspector">
      <div className="bb__inspbar">
        <b>{what}</b>
        <button type="button" className="bb__act" aria-label="Open in focus mode" title="Focus mode" onClick={() => setFocus(true)}>
          <Maximize2 size={14} strokeWidth={2} />
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Full-bleed, not a wider box.

          It was a 1100px dialog centred on the board, which is the shape you
          reach for when a form is long — and this is not a long form, it is two
          halves of one sentence that were being squeezed into a column each. At
          1100 the conditions wrapped, the time fields stacked, and the right
          half ran out of content two thirds of the way down. Giving it the
          screen lets the halves be the width they actually need and puts the
          rule's own name at the top of it rather than in a box inside a box. */}
      <Modal open={focus} onClose={() => setFocus(false)} title={what} width={2400}>
        <div className="bb__focus">{body(true)}</div>
      </Modal>

      <div className="bb__inspbody">
        {/* Keyed, so a change of subject fades the new panel in. No exit
            animation, deliberately: a presence-managed exit that gets
            interrupted can strand the old panel at 2% opacity and never mount
            the new one, and nobody misses a 130ms fade-out of a panel. */}
        {
          <motion.div key={key} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
            {/* Not rendered while focus mode is open — two live copies of one
                editor is two sets of inputs writing the same rule. */}
            {focus ? <p className="bb__secnote">Open in focus mode.</p> : body(false)}
          </motion.div>
        }
      </div>
    </aside>
  )
}

/* --- A rule, as sections ------------------------------------------------------ */

function RulePane({
  rule,
  index,
  onPatch,
  focus,
}: {
  rule: Rule
  index: number
  onPatch: (p: Partial<Rule>) => void
  /** In the wide dialog rather than the 400px column: IF and THEN sit side by
      side instead of one under the other. */
  focus?: boolean
}) {
  const [openAt] = useState<{ nonce: number } | null>(null)
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
      <div className={`bb__insphead ${focus ? 'is-focus' : ''}`}>
        <span className={`bb__idx is-${TONE[rule.decision]}`} aria-hidden>
          {index + 1}
        </span>
        <div className="bb__inspname">
          <input className="bb__input bb__input--title" aria-label="Rule name" value={rule.name} placeholder="Name this rule" onChange={(e) => onPatch({ name: e.target.value })} />
          <textarea
            className="bb__input bb__input--desc"
            rows={focus ? 1 : 2}
            aria-label="What this rule is for"
            placeholder="What is this for? A regulator, an incident, an audit finding…"
            value={rule.description ?? ''}
            onChange={(e) => onPatch({ description: e.target.value || undefined })}
          />
        </div>
        <Toggle checked={rule.enabled} onChange={(enabled) => onPatch({ enabled })} label={rule.enabled ? 'On' : 'Off'} size="sm" />
      </div>

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
      {/* Two questions, numbered, with a rail between them.

          It was one header reading "If and then" over an undivided body, which
          names both halves in one breath and then leaves the reader to find
          where one stops. Numbering them says there are two and says which
          comes first, and the caption under each says what it is asking — so
          nothing on the form has to be inferred from the shape of the controls
          below it. */}
      <section className={`bb__rule ${focus ? 'is-focus' : ''}`}>
        <div className="bb__rulebody">
          <div className="bb__rulehalf">
            <div className="bb__ask">
              <div className="bb__ask__head">
                <span className="bb__ask__n" aria-hidden>
                  1
                </span>
                <h3>If</h3>
                <p>When does this rule apply?</p>
              </div>
              <WhenEditor rule={rule} onPatch={onPatch} openAt={openAt} />
            </div>
          </div>

          <div className="bb__rulehalf">
            <div className="bb__ask">
              <div className="bb__ask__head">
                <span className="bb__ask__n" aria-hidden>
                  2
                </span>
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
          <p>The default at the bottom. Its name and place are fixed; what it does is yours.</p>
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
