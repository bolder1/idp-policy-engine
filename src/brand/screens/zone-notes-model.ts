import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   What the zone page's side note says, and which version shows — the parts of
   zone-notes.tsx that are not drawing, in their own module so that one exports
   only components (fast refresh) and the tests can read these without a page.
   See zone-notes.tsx for why there are four versions (owner, 1 and 2 Oct 2026).
   -------------------------------------------------------------------------- */

export type NoteStyle = 'classic' | 'blue' | 'sticky' | 'clip' | 'pointer'

/* Classic first and the default: it is the note the page had before any of
   this, so a viewer who never touches the switch sees the page as it was.
   Note pile and Index card stood between the sticky note and the clipboard
   for a day (owner, 2 Oct 2026: "Remove Note pile, Index card"). */
export const NOTE_STYLES: { value: NoteStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'blue', label: 'Blue' },
  { value: 'sticky', label: 'Sticky note' },
  { value: 'clip', label: 'Clipboard' },
  { value: 'pointer', label: 'Pointer' },
]

export const NOTE_STYLE_KEY = 'idp.zones.noteStyle'

/** Only a stored value that names a version picks it; anything else is Classic.
    That covers every version withdrawn — 'colours', 'rows' and 'tip' on 1 Oct
    2026, 'pile' and 'card' on 2 Oct — so a viewer who had one on is back on
    the original note, not on a blank. */
export function parseNoteStyle(value: unknown): NoteStyle {
  return NOTE_STYLES.find((o) => o.value === value)?.value ?? 'classic'
}

function readNoteStyle(): NoteStyle {
  try {
    return parseNoteStyle(window.localStorage.getItem(NOTE_STYLE_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'classic'
  }
}

/* One value for every zone page, remembered per viewer, so the version flipped
   on one zone is the version on the next. Read on first use, not at import. */
let current: NoteStyle | null = null
const listeners = new Set<() => void>()

export function applyNoteStyle(style: NoteStyle): void {
  current = style
  try {
    window.localStorage.setItem(NOTE_STYLE_KEY, style)
  } catch {
    /* It still applies for this visit; it just will not be remembered. */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useNoteStyle(): [NoteStyle, (s: NoteStyle) => void] {
  const style = useSyncExternalStore(
    subscribe,
    () => (current ??= readNoteStyle()),
    () => 'classic' as NoteStyle,
  )
  return [style, applyNoteStyle]
}

/* --- The examples --------------------------------------------------------------
   One set, read by every version but Classic, which keeps the examples it
   always had (zone-notes.tsx). Each is the example and what kind of thing it
   is. The tone, the chip kind and the ghost row's own words that the
   withdrawn versions needed went with them (1 Oct 2026). */

export type ZoneHalf = 'net' | 'place'

export interface Example {
  /** What the example is: "Japan", "Within 50 km of Berlin". */
  text: string
  /** The kind, as a gloss after the example: "a country". */
  gloss: string
}

/* Plainly someone else's: far from the Indian offices the showcase tenant's
   zones hold, and named by none of them. */
export const PLACE_EXAMPLES: Example[] = [
  { text: 'Japan', gloss: 'a country' },
  { text: 'California', gloss: 'a state or region' },
  { text: 'Toronto', gloss: 'a city' },
  { text: 'Within 50 km of Berlin', gloss: 'a city with a range' },
]

/* The IP examples were never the zone's own: private, documentation and
   well-known values.

   The kinds are in the row tags' words — IPv4, IPv6, network, range, ASN — so
   the note and the list beside it name a kind one way. They read "Address",
   "Network", "Range" and "a CIDR block" first, while the rows said "IPv4" and
   "IPv4 network". Where the field takes both families the gloss says so, and
   the two examples show one of each: an IPv4 address, an IPv6 network. A
   range is IPv4 only, as the field's is. */
export const NET_EXAMPLES: Example[] = [
  { text: '10.0.0.1', gloss: 'an IPv4 or IPv6 address' },
  { text: '2001:db8::/32', gloss: 'an IPv4 or IPv6 network' },
  { text: '10.1.0.1-10.1.0.99', gloss: 'an IPv4 range' },
  { text: 'AS15169', gloss: 'an ASN' },
]

/* The two facts the Locations note always carried, in fewer words. The IP
   note has none: its paste line was removed on 23 Sep 2026. */
export const PLACE_FACTS = [
  'A country covers its states and cities; a state covers its cities. Narrower places stay, marked covered.',
  "Matched on the sign-in's IP, so a VPN shows where it exits.",
]

export const examplesOf = (half: ZoneHalf) => (half === 'net' ? NET_EXAMPLES : PLACE_EXAMPLES)
export const factsOf = (half: ZoneHalf) => (half === 'net' ? [] : PLACE_FACTS)

/* `TIP_SEEN_KEY`, `readTipSeen` and `markTipSeen` stood here: whether the
   withdrawn Inline tip opened folded. The tip went on 1 Oct 2026 (owner: "I
   only like the sticky note … remove the rest of them"). */
