import { type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useRef } from 'react'
import {
  AlertTriangle,
  ChevronsLeftRight,
  ChevronsRightLeft,
  CornerDownRight,
  type LucideIcon,
  Split,
  Users,
  X,
  XCircle,
} from 'lucide-react'

import { Button, RowMenu, Toggle } from '../../kit'
import { SHOWCASE } from '../../showcase'
import { fallbackRule, type Policy, type Rule } from '../../data'
import type { Diagnostic } from '../diagnostics'
import { AppsPane } from './AppsPane'
import { type Selection } from './model'
import { settledName } from './parts'
import { WhatEditor } from './WhatEditor'
import { WhenEditor } from './WhenEditor'
import { WhoEditor } from './WhoEditor'
import { ruleMenu } from './rule-menu'

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
  diagnostics = [],
  onPatchRule,
  onPatchFallback,
  onRemoved,
  onAppsSaved,
  onClose,
  wide,
  onToggleWidth,
  leaving,
  onMoveRule,
  onDuplicateRule,
  onDeleteRule,
  canSave = false,
  saveLabel = 'Save rule',
  saveTitle,
  onSave,
}: {
  draft: Policy
  selection: Selection
  /** Findings for the selected rule, shown above its sections. */
  diagnostics?: Diagnostic[]
  onPatchRule: (i: number, p: Partial<Rule>) => void
  onPatchFallback: (p: Partial<Rule>) => void
  /** A condition or group was removed — the board offers Undo. */
  onRemoved?: (what: string) => void
  /** The Applications pane saved; the board closes the panel. */
  onAppsSaved?: () => void
  onClose: () => void
  /** Whether the panel is at its full width, and the way to change that. */
  wide: boolean
  onToggleWidth: () => void
  /** On its way out. The board keeps it mounted for the length of the slide. */
  leaving?: boolean
  /** The card's ⋯ actions, by rule index — the header's own ⋯ runs them. */
  onMoveRule?: (from: number, to: number) => void
  onDuplicateRule?: (i: number) => void
  onDeleteRule?: (i: number) => void
  /** Something to store, and nothing blocking it — the bar's own test. */
  canSave?: boolean
  /** "Save rule". Never the bar's own label — see the foot below. */
  saveLabel?: string
  /** Why it is off, when it is off. */
  saveTitle?: string
  /** Stores the policy. The same call the bar's Save makes. */
  onSave?: () => void
}) {
  /* Resolved once. `at` is -1 when the selected rule is gone — undone, deleted,
     discarded — but the board no longer mounts this component in that case, so
     the -1 is a guard rather than a state anybody sees. */
  const at = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const rule = at >= 0 ? draft.rules[at] : undefined
  const part = selection.kind === 'rule' ? selection.part : null
  const patch = (p: Partial<Rule>) => onPatchRule(at, p)

  /* ONE heading for a rule (owner, 22 Sep 2026: "merge these two — I want only
     one heading and to do everything there: the number, then an input for the
     rule name, and the toggle"). The bar said "Rule 1" over a second row that
     held the name and the switch; now the bar IS that row, with the panel's own
     two buttons at its end. Applications and the default keep a plain title. */
  const what = selection.kind === 'apps' ? 'Applications' : 'The default'
  const editingRule = !!(rule && part)

  return (
    <aside className={`bb__insp ${leaving ? 'is-leaving' : ''}`} aria-label="Inspector">
      <div className={`bb__inspbar${editingRule ? ' is-rule' : ''}`}>
        {editingRule && rule ? (
          <>
            {/* Keyed, so the name field starts fresh on each rule. */}
            <RuleHead key={rule.id} rule={rule} index={at} onPatch={patch} />
            {/* The card's ⋯, here too (owner, 22 Sep 2026: "add the three dots
                here as well"): move, duplicate and delete, from the same menu
                and through the same handlers as the card's. */}
            {onMoveRule && onDuplicateRule && onDeleteRule && (
              <RowMenu
                label={`Actions for rule ${at + 1}`}
                items={ruleMenu(at > 0, at < draft.rules.length - 1)}
                onSelect={(id) => {
                  if (id === 'up') onMoveRule(at, at - 1)
                  else if (id === 'down') onMoveRule(at, at + 1)
                  else if (id === 'dup') onDuplicateRule(at)
                  else if (id === 'del') onDeleteRule(at)
                }}
              />
            )}
            <span className="bb__inspbar__sep" aria-hidden />
          </>
        ) : (
          <b>{what}</b>
        )}
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
              {/* Not in the showcase (owner, 22 Sep 2026: "remove all the
                  missing or broken or conflict messages — we will showcase this
                  later"). `diagnose` still runs; only the panel's banner is off. */}
              {!SHOWCASE && <RuleFindings diagnostics={diagnostics} />}
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
              <Section id="who" title="Who" icon={Users} tour="insp-who" focused={part === 'who'}>
                <WhoEditor rule={rule} audience={draft.audience} onPatch={patch} />
              </Section>

              <ConditionSection rule={rule} onPatch={patch} onRemoved={onRemoved} focused={part === 'when'} />

              <Section id="then" title="Then" icon={CornerDownRight} tour="insp-then">
                <WhatEditor rule={rule} onPatch={patch} />
              </Section>
            </motion.div>
          </>
        ) : selection.kind === 'apps' ? (
          <motion.div key="apps" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
            <AppsPane policyId={draft.id} onSaved={onAppsSaved} />
          </motion.div>
        ) : selection.kind === 'fallback' ? (
          /* Branching on `kind`, not on `rule` being truthy. The old test sent
             a selection of `none` into the fallback pane and was saved only by
             the board declining to mount this at all. */
          <motion.div key="fallback" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.13 }}>
            <FallbackPane rule={draft.fallback ?? fallbackRule()} onPatch={onPatchFallback} />
          </motion.div>
        ) : null}
      </div>

      {/* The save, at the foot of the form it belongs to (owner, 23 Sep 2026:
          "we need a dedicated save button for this configure form").

          It stores the policy — the same call the bar's Save makes, disabled by
          the same test and saying the same thing when it is off. It is not a
          second kind of save: editing has not changed, the card beside the
          panel still follows every keystroke, and this is here because the work
          is here and the bar is a screen away at the top of the page.

          Not on the Applications pane, which has a Save of its own for the
          applications it is editing — two Saves on one pane, meaning two
          different things, is the one arrangement worth avoiding.

          SECONDARY, and named for the thing in front of you: the bar says
          "Save policy", this says "Save rule" (owner, 23 Sep 2026 — first
          "give them different names and a different button style", then
          "instead of saying save changes can we call it save rule"). Two brand
          buttons both reading "Save", one at each end of the screen, read as
          two different saves and made you stop to work out which.

          It stores the whole policy either way — that is the bar's business,
          and the bar's word for it. What the panel names is the work you are
          doing in the panel. The default at the foot of the chain is a rule
          too, so the word holds there as well. */}
      {selection.kind !== 'apps' && onSave && (
        <div className="bb__inspfoot">
          <Button variant="secondary" size="sm" disabled={!canSave} title={saveTitle} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      )}
    </aside>
  )
}

/* --- A section of the panel --------------------------------------------------

   A heading, an optional action, and a hairline under the lot. No box: three
   bordered cards inside a bordered panel is four frames to draw one form, and
   the boxes were most of why this panel read as a pile of widgets rather than
   as a sentence.

   THE HINT IS GONE, and so is the 10px tracked uppercase label it sat beside.

   `Who`, `If` and `Then` are the three parts of a rule and the only three
   headings in this panel, and they were drawn as the smallest type on it —
   10px, tracked, tertiary — with a grey sentence on the same line explaining
   what each section was for. So the word you navigate by was quieter than every
   control under it, and it was competing on its own line with a caption you
   read once. `Who` is now a heading at the panel's reading size, and what each
   section is for is said by the section's own empty state, where it is read at
   the moment it is useful rather than on every visit forever.

   `focused` carries the selection's part, and it does the one job the tabs did
   that was worth keeping — saying which third of the rule you arrived at. It
   darkens that section's mark and guide rule rather than hiding the other two. */
function Section({
  id,
  title,
  icon: Icon,
  action,
  focused,
  tour,
  children,
}: {
  id: string
  title: string
  /* The same mark the card beside this panel prints against the same word —
     `who` with people, `if` with a fork — so the heading here and the line on
     the card read as one vocabulary in two places. */
  icon: LucideIcon
  action?: ReactNode
  focused?: boolean
  /* What the board's guided demo lights when it talks about this section.

     A data attribute rather than a class, and passed rather than derived from
     `id`, for the reason `tour.test.ts` gives about the trail's anchors: a
     walkthrough breaks silently. Nobody opens it after their first week, so a
     section renamed out from under one just stops lighting anything and no
     test fails. Spelt out here, `board-tour.test.ts` can assert the literal. */
  tour?: string
  children: ReactNode
}) {
  return (
    <section className={`bb__sec ${focused ? 'is-focused' : ''}`} data-tour={tour} aria-labelledby={`bb-sec-${id}`}>
      <div className="bb__sec__head">
        <h3 id={`bb-sec-${id}`}>
          <Icon size={15} strokeWidth={2} aria-hidden />
          {title}
        </h3>
        {action}
      </div>
      {/* Everything that answers the heading hangs off it: set in past the
          mark, with a guide rule down its left — the card's own drawing, where
          `who`, `if` and `then` sit at the margin and what belongs to each is
          indented against a line. It is what makes three sections of controls
          read as three parts of one rule rather than as one long form. */}
      <div className="bb__sec__body">{children}</div>
    </section>
  )
}

function ConditionSection({
  rule,
  onPatch,
  onRemoved,
  focused,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  onRemoved?: (what: string) => void
  focused: boolean
}) {
  /* No add button in the section header (owner, 22 Sep 2026: "remove the +").
     The If block adds from inside itself — the empty state's buttons, and
     "+ Add" under the conditions — so the header's `+` was a second door to
     the same room, far from where the row lands. */
  return (
    <Section
      id="if"
      title="If"
      icon={Split}
      /* `insp-when`, matching the MODEL's word for this part rather than the
         heading's. Ids follow the model and labels follow the person — see
         PART_LABEL in parts.ts, which draws the same distinction for the same
         field. */
      tour="insp-when"
      focused={focused}
    >
      <WhenEditor rule={rule} onPatch={onPatch} onRemoved={onRemoved} />
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
  /* The name as it was when the field took focus. Left blank or spaces only, the
     field goes back to it on blur rather than saving a rule with no name. */
  const before = useRef(rule.name)
  return (
    <>
      <span className="bb__inspnum">
        <span className="u-sr-only">Rule </span>
        {index + 1}
      </span>
      <div className="bb__inspname">
        <input
          className="bb__input bb__input--title"
          aria-label="Rule name"
          value={rule.name}
          placeholder="Name this rule"
          onFocus={() => {
            before.current = rule.name
          }}
          onChange={(e) => onPatch({ name: e.target.value })}
          onBlur={() => {
            const settled = settledName(rule.name, before.current, index)
            if (settled !== rule.name) onPatch({ name: settled })
          }}
        />
      </div>
      <Toggle checked={rule.enabled} onChange={(enabled) => onPatch({ enabled })} label={rule.enabled ? 'On' : 'Off'} size="sm" />
    </>
  )
}

/* What is wrong with this rule, where it is edited.

   The card's pill says "Needs setup" or "Check"; this says why. Errors first.
   A missing first or second factor method is said under its own picker in
   Then, so it is not said twice. */
const SHOWN_IN_THEN = new Set(['PE122', 'PE123'])

/* The two who-findings this panel does not print (owner, 18 Sep 2026).

   PE151 names every group and person the policy does not govern, IN FULL: a
   rule that picks the twenty-one groups in the directory drew a 300px
   paragraph of seventy names at the top of a 400px panel, above the rule it
   was about. PE153 only fires on a who whose exceptions cover its own choices,
   which this panel can no longer build.

   Neither is switched off — `diagnose` still raises both, so Review & save,
   the policy-level list and the duplicate-policy dialog still report them, and
   the card's own pill still turns. What changed is that the rule panel does not
   spend a screenful restating one of them. */
const SHOWN_ELSEWHERE = new Set(['PE151', 'PE153'])
function RuleFindings({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const shown = [...diagnostics].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1))
  const list = shown.filter((d) => d.severity !== 'info' && !SHOWN_IN_THEN.has(d.code) && !SHOWN_ELSEWHERE.has(d.code))
  if (list.length === 0) return null
  return (
    <div className="bb__findings" role="status">
      {list.map((d) => (
        <p key={d.id} className={`bb__diag is-${d.severity}`}>
          {d.severity === 'error' ? <XCircle size={13} strokeWidth={2} aria-hidden /> : <AlertTriangle size={13} strokeWidth={2} aria-hidden />}
          <span>
            <b>{d.title}.</b> {d.detail}
          </span>
        </p>
      ))}
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
          <p>Applies when no rule above matches. Its name and place are fixed.</p>
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
