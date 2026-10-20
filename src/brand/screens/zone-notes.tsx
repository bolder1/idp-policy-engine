import { motion, useReducedMotion } from 'motion/react'

import { Note } from '../kit'
import { FilterTabs } from './page-bar'
import { NOTE_STYLES, examplesOf, factsOf, useNoteStyle, type Example, type NoteStyle, type ZoneHalf } from './zone-notes-model'

/* -----------------------------------------------------------------------------
   The zone page's side note, in two versions behind one switch.

   Owner, 1 Oct 2026, on "What you can add": "I need multiple iterations for
   this, either with colours or with an actual note with a roll-out animation,
   a sticky-note type thing, so it feels like these are examples — as of now it
   feels like it's what the user added." Four versions went up that day, then
   Classic came back beside the sticky note, then the paper notes thinned out
   (2 Oct 2026: "Remove Note pile, Index card"), then Blue joined and became
   the default (5 and 9 Oct 2026).

   On 16 Oct 2026 the owner made the What's new card on Authentication methods
   the one note ("use this as a common note component … change this
   globally"), so Classic and Blue are that note now, one version called Note:

     Note          the kit's `Note`: the white card, the info mark, "What you
                   can add" in the info blue, then one row per kind — the kind
                   on the left, the example in monospace on the right — and, on
                   Locations, the two facts under a rule. Static.
     Sticky note   a paper note taped to the page, that unrolls once

   What made the old note read as the admin's own entries was two things
   together: the examples were set in the monospace of a typed value, one per
   line, the way the list beside them is; and they were the zone's own places.
   So both versions use the SAME four, picked to be plainly someone else's —
   Japan, California, Toronto, 50 km round Berlin — and the Note sets each
   beside its kind, so it reads as a sample rather than an entry.

   The IP networks tab has its own note, and the switch flips both tabs
   together.

   The sticky note arrives once per page visit, tab and version (`rollOut`),
   with motion props only: no stylesheet transform or transition is ever on a
   motion element, because motion writes `transform` inline and a stylesheet
   one would fight it. Under reduced motion, or on a second showing, it is
   drawn in its final state, still. The app's own face throughout — a
   handwriting face would be a costume.

   PREVIEW. The switch is a pending decision, so it shows in the showcase build
   too, where every other comparison switch is hidden (showcase.ts). It and
   the version not chosen go once the owner picks one.

   What the notes say, and which version is on, is zone-notes-model.ts.
   -------------------------------------------------------------------------- */

/** The switch, for the zone page head's preview slot — see `PageHead`. */
export function NoteStyleSwitch() {
  const [style, setStyle] = useNoteStyle()
  return (
    <div className="bwidth">
      <span className="bwidth__label" aria-hidden>
        Note style
      </span>
      <FilterTabs label="Note style" value={style} options={NOTE_STYLES} onChange={setStyle} />
    </div>
  )
}

/* --- The note, in the aside ------------------------------------------------------ */

type NoteProps = {
  half: ZoneHalf
  /** Arrive with motion. False once it has, so a tab switch does not replay it. */
  rollOut: boolean
  onRolled?: () => void
}

export function ZoneNote({
  half,
  style,
  rollOut = false,
  onRolled,
}: {
  half: ZoneHalf
  style: NoteStyle
  rollOut?: boolean
  onRolled?: () => void
}) {
  if (style === 'sticky') return <StickyNote half={half} rollOut={rollOut} onRolled={onRolled} />
  return <AddNote half={half} />
}

/* Every arrival eases out on the same curve the console's other motion uses. */
const EASE: [number, number, number, number] = [0.2, 0, 0, 1]

/* The example, then its kind. On screen the type sets the two apart; a screen
   reader, which hears no type, gets "Japan, a country" from the comma. The
   sticky note has it too (2 Oct 2026): without it, it read "Japana country".
   The comma is out of the layout, so the note looks as it did. */
function Said({ e, glossClass }: { e: Example; glossClass?: string }) {
  return (
    <>
      <strong>{e.text}</strong>
      <span className="u-sr-only">, </span>
      <span className={glossClass}>{e.gloss}</span>
    </>
  )
}

/* Note. The kit's one note (owner, 16 Oct 2026), holding what Blue held (owner,
   5 Oct 2026: "a revamped classic style featuring better text … an example of
   static text"): the heading, then one row per kind — the kind in the UI face
   on the left, the example in monospace on the right — and, on Locations, the
   two facts as a short list under a rule. Static: no motion, nothing to press.
   `AcceptsNote`, `PlacesNote` and `BlueNote` stood here: Classic's two cards
   and the blue-tinted one, both folded into this on the same day. */
function AddNote({ half }: { half: ZoneHalf }) {
  const facts = factsOf(half)
  return (
    <Note title="What you can add" className="bz7n-note">
      <dl className="bz7n-note__rows">
        {examplesOf(half).map((e) => (
          <div key={e.text} className="bz7n-note__row">
            <dt>{kindOf(e.gloss)}</dt>
            <dd>
              <code>{e.text}</code>
            </dd>
          </div>
        ))}
      </dl>
      {facts.length > 0 && (
        <ul className="bz7n-note__facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </Note>
  )
}

/** "an IPv4 or IPv6 address" → "IPv4 or IPv6 address": the kind without its article, for a row's label. */
const kindOf = (gloss: string): string => {
  const bare = gloss.replace(/^(an?|the)\s+/i, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}

/* Sticky note. A paper note, taped on, that unrolls from the tape once per
   page visit.

   The unroll is a clip-path that opens from the top and the tilt is `rotate`,
   both on the one motion element. Insets in percent at both ends so the two
   values interpolate; the negative ones leave room for the tape and the
   shadow, which a zero inset would cut off. */
const ROLLED = 'inset(-12% -6% -12% -6%)'
const FURLED = 'inset(-12% -6% 100% -6%)'
const TILT = -1

function StickyNote({ half, rollOut, onRolled }: NoteProps) {
  const reduce = useReducedMotion()
  const still = !!reduce || !rollOut
  return (
    <motion.div
      className="bz7n-sticky"
      initial={still ? false : { clipPath: FURLED, rotate: 0 }}
      animate={{ clipPath: ROLLED, rotate: TILT }}
      transition={{ clipPath: { duration: 0.42, ease: EASE }, rotate: { duration: 0.5, ease: [0.3, 0, 0.2, 1] } }}
      onAnimationComplete={onRolled}
    >
      <span className="bz7n-sticky__tape" aria-hidden />
      <h3 className="bz7n-sticky__label">Examples</h3>
      <ul className="bz7n-sticky__list">
        {examplesOf(half).map((e) => (
          <li key={e.text}>
            <Said e={e} />
          </li>
        ))}
      </ul>
      {factsOf(half).map((f) => (
        <p key={f} className="bz7n-sticky__fact">
          {f}
        </p>
      ))}
    </motion.div>
  )
}

/* `ColourNote`, `ExampleRows`, `ZoneTip` and its `TipSentence`, `Chip` and
   `Eg` stood here: the Colours, Example rows and Inline tip versions,
   withdrawn on 1 Oct 2026 (owner: "I only like the sticky note … remove the
   rest of them"). `NotePile` and `IndexCard` followed them on 2 Oct 2026
   (owner: "Remove Note pile, Index card"). */
