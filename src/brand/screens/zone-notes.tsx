import { motion, useReducedMotion } from 'motion/react'
import { Info } from 'lucide-react'

import { FilterTabs } from './page-bar'
import { NOTE_STYLES, examplesOf, factsOf, useNoteStyle, type Example, type NoteStyle, type ZoneHalf } from './zone-notes-model'

/* -----------------------------------------------------------------------------
   The zone page's side note, in four versions behind one switch.

   Owner, 1 Oct 2026, on "What you can add": "I need multiple iterations for
   this, either with colours or with an actual note with a roll-out animation,
   a sticky-note type thing, so it feels like these are examples — as of now it
   feels like it's what the user added." Four versions went up that day:
   Colours, Sticky note, Example rows and Inline tip.

   Then, the same day: "I only like the sticky note, so have the old one as a
   classic as we used to have, and the sticky note. Remove the rest of them and
   give me some more good options like the sticky note. Check Mobbin and come
   up with some more iterations." So Colours, Example rows and Inline tip are
   gone, the original note is back as Classic, and more paper notes joined the
   sticky one, each from something real products do (Mobbin, 1 Oct 2026). Two
   of those went the next day (owner, 2 Oct 2026: "Remove Note pile, Index
   card"), which leaves:

     Classic       the note as it was: a card, "What you can add", the zone's
                   kind of places in monospace (India, Maharashtra, Pune)
     Sticky note   a paper note taped to the page, that unrolls once
     Clipboard     a sheet clipped to a board (FigJam's clipboard widget); the
                   clip snaps once as it lands
     Pointer       a tinted tip with a notch pointing at the list it is about
                   (Flodesk's notched tip, Turo's field tips, the connectors in
                   Zoho and ClickUp, Plane's mint sticky)

   What made the old note read as the admin's own entries was two things
   together: the examples were set in the monospace of a typed value, one per
   line, the way the list beside them is; and they were the zone's own places.
   So every version but Classic drops the monospace for the places and uses
   the SAME four, picked to be plainly someone else's — Japan, California,
   Toronto, 50 km round Berlin. Classic is the original exactly, so it keeps
   its own.

   The IP networks tab has its own note, so it gets all four, and the switch
   flips both tabs together.

   Every paper version arrives once per page visit, tab and version
   (`rollOut`), with motion props only: no stylesheet transform or transition
   is ever on a motion element, because motion writes `transform` inline and a
   stylesheet one would fight it. Under reduced motion, or on a second
   showing, each is drawn in its final state, still. The app's own face
   throughout — a handwriting face would be a costume.

   PREVIEW. The switch is a pending decision, so it shows in the showcase build
   too, where every other comparison switch is hidden (showcase.ts). It and
   the versions not chosen go once the owner picks one.

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
  const props = { half, rollOut, onRolled }
  if (style === 'blue') return <BlueNote half={half} />
  if (style === 'sticky') return <StickyNote {...props} />
  if (style === 'clip') return <Clipboard {...props} />
  if (style === 'pointer') return <PointerNote {...props} />
  return half === 'net' ? <AcceptsNote /> : <PlacesNote />
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

/* Classic. The note as it stood until 1 Oct 2026, restored as it was: a card,
   "What you can add", the samples in monospace one per line with their kind
   under each. The owner asked for it back beside the sticky note, so these are
   its own words and examples, not the shared set the paper versions use. */
export function AcceptsNote() {
  return (
    <div className="bz7__side">
      <h3 className="bz7__sidehead">
        <Info size={14} strokeWidth={2} aria-hidden />
        What you can add
      </h3>
      <ul className="bz7__sidelist">
        <li>
          <code>10.0.0.1</code>
          <em>An IPv4 or IPv6 address</em>
        </li>
        <li>
          <code>192.168.0.0/24</code>
          <em>A CIDR block</em>
        </li>
        <li>
          <code>192.168.0.1-192.168.0.254</code>
          <em>An IPv4 range</em>
        </li>
        <li>
          <code>AS15169</code>
          <em>An ASN</em>
        </li>
      </ul>
      {/* The paste line stood here — "Paste a list to add several at once…"
          (owner, 23 Sep 2026: "remove"). The examples are what the note is
          for; pasting is something the field does whether or not it is
          announced. */}
    </div>
  )
}

export function PlacesNote() {
  return (
    <div className="bz7__side">
      <h3 className="bz7__sidehead">
        <Info size={14} strokeWidth={2} aria-hidden />
        What you can add
      </h3>
      <ul className="bz7__sidelist">
        <li>
          <code>India</code>
          <em>A country</em>
        </li>
        <li>
          <code>Maharashtra</code>
          <em>A state or region</em>
        </li>
        <li>
          <code>Pune</code>
          <em>A city</em>
        </li>
        <li>
          <code>Within 25 km of Pune</code>
          <em>A city with a range</em>
        </li>
      </ul>
      <p className="bz7__sidep">
        A country covers its states and cities, and a state covers its cities. The narrower ones stay
        in the list, marked as covered.
      </p>
      <p className="bz7__sidep">Matched on the sign-in's IP address. A VPN shows where it exits.</p>
    </div>
  )
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

/* Clipboard. A sheet on a board, held by a clip at the top edge. The board
   drops in; as it lands, the clip snaps shut on the sheet. The clip is
   drawing, so it is hidden from assistive tech. */
function Clipboard({ half, rollOut, onRolled }: NoteProps) {
  const reduce = useReducedMotion()
  const still = !!reduce || !rollOut
  const facts = factsOf(half)
  return (
    <motion.div
      className="bz7n-clip"
      initial={still ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <motion.span
        className="bz7n-clip__clip"
        aria-hidden
        animate={still ? { scaleY: 1 } : { scaleY: [1, 0.78, 1] }}
        transition={{ delay: 0.26, duration: 0.18, times: [0, 0.4, 1] }}
        onAnimationComplete={onRolled}
      />
      <div className="bz7n-clip__sheet">
        <h3 className="bz7n-clip__head">Examples</h3>
        <ul className="bz7n-clip__list">
          {examplesOf(half).map((e) => (
            <li key={e.text}>
              <Said e={e} glossClass="bz7n-clip__gloss" />
            </li>
          ))}
        </ul>
        {facts.length > 0 && (
          <div className="bz7n-clip__facts">
            {facts.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* Pointer. A tinted tip with a notch on its left edge pointing at the list it
   is about — on its top edge where the note drops below the list, so it
   points up at it. It grows out of the notch, once. Teal, from the
   categorical set: not the brand, and not a status. */
function PointerNote({ half, rollOut, onRolled }: NoteProps) {
  const reduce = useReducedMotion()
  const still = !!reduce || !rollOut
  const facts = factsOf(half)
  return (
    <motion.div
      className="bz7n-point"
      initial={still ? false : { opacity: 0, scale: 0.92, x: -6 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{ duration: 0.32, ease: EASE, opacity: { duration: 0.16 } }}
      onAnimationComplete={onRolled}
    >
      <h3 className="bz7n-point__head">Examples</h3>
      <ul className="bz7n-point__list">
        {examplesOf(half).map((e) => (
          <li key={e.text}>
            <Said e={e} glossClass="bz7n-point__gloss" />
          </li>
        ))}
      </ul>
      {facts.length > 0 && (
        <div className="bz7n-point__facts">
          {facts.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* `ColourNote`, `ExampleRows`, `ZoneTip` and its `TipSentence`, `Chip` and
   `Eg` stood here: the Colours, Example rows and Inline tip versions,
   withdrawn on 1 Oct 2026 (owner: "I only like the sticky note … remove the
   rest of them"). `NotePile` and `IndexCard` followed them on 2 Oct 2026
   (owner: "Remove Note pile, Index card"). */

/* Blue (owner, 5 Oct 2026: "add another version with a blue-tinted background, a revamped classic style featuring better
   text, and an improved experience so it can be distinguished — an example of static text"). Classic's card, tinted with
   the info blue, its words set so they read at a glance: the head, then one row per kind — the kind in the UI face on
   the left, the example in monospace on a white chip on the right — and, on Locations, the two facts as a short list
   under a rule. Static: no motion, nothing to press. It reads the shared examples, as the paper versions do. */
function BlueNote({ half }: { half: ZoneHalf }) {
  const examples = examplesOf(half)
  const facts = factsOf(half)
  return (
    <div className="bz7n-blue">
      <h3 className="bz7n-blue__head">
        <Info size={14} strokeWidth={2.2} aria-hidden />
        What you can add
      </h3>
      <dl className="bz7n-blue__rows">
        {examples.map((e) => (
          <div key={e.text} className="bz7n-blue__row">
            <dt>{kindOf(e.gloss)}</dt>
            <dd>
              <code>{e.text}</code>
            </dd>
          </div>
        ))}
      </dl>
      {facts.length > 0 && (
        <ul className="bz7n-blue__facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "an IPv4 or IPv6 address" → "IPv4 or IPv6 address": the kind without its article, for a row's label. */
const kindOf = (gloss: string): string => {
  const bare = gloss.replace(/^(an?|the)\s+/i, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}
