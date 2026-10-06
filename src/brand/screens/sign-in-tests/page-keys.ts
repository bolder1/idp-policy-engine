import { hasOpenDialog } from '../../dialog-chrome'

/* -----------------------------------------------------------------------------
   The Access checks page's Escape and focus, as its right-hand panels meet
   them (SignInTests.tsx). Two rules, kept here so a test can hold them without
   a browser.

   ESCAPE WAITS FOR A POPUP, NEVER FOR A ROW. The page shuts its panel on
   Escape, on the way down — unless something is open over it that takes that
   Escape itself: a picker's list, a menu, a fact's panel, Save sign-in, Use a
   saved sign-in, the Identity field's list. It used to wait for ANYTHING
   expanded in a panel, and an attempt row opened in Break-in attempts is
   `aria-expanded` too, so one open row held the panel up until it was shut
   again by hand (review, 6 Oct 2026; the held fold had been made a native
   <details> for the same reason). A popup's trigger says that it is one —
   `aria-haspopup` (the console's Picker, Menu and RowMenu, the Identity
   field, every popover trigger in the form) or a combobox's own role — and a
   disclosure never does: an attempt row, the Brief's rule checks, What they
   see, Classic v2's rules on the canvas. So the test is the trigger's, and a
   disclosure opened in any panel, now or later, never holds the Escape. A
   kit dialog open over the page (the Identity field's Choose a user) holds
   it as well: it owns its Escape, and the panel under it stays.

   THE FOCUS GOES BACK TO WHAT OPENED THE PANEL. The page used to hand it to
   the doors of the layouts that came first — the answer's strip, the quiet
   link, the engine's Replay, the empty canvas's Check access — none of which
   Focus draws, so a panel shut on Focus left the focus on nothing (review,
   6 Oct 2026). Now the element that had the focus as a panel opened is kept —
   a name on a card, Break-in attempts on the canvas's bar, the strip, Edit
   sign-in — and the focus goes back to it while it is on the page, outside
   the panels, and takes the focus (a name in a card folded since does not).
   A panel opened from inside another (the why's Review attempts, a name
   pressed in the why) keeps the first one's: that is still where the chain
   began. Else the page's doors, the old layouts' and then Focus's own.
   -------------------------------------------------------------------------- */

/** Where the page's right-hand panels are drawn: the form, the saved sign-ins, the why, the attempts, the inspector. */
export const PANEL = '.sit-panel'

/** One element's attributes, as `getAttribute` reads them. */
export type AttrOf = (name: string) => string | null

/* An expanded popup trigger, which takes the Escape itself: the panel stays.
   An expanded disclosure — `aria-expanded` alone — does not. */
export function holdsEscape(attr: AttrOf): boolean {
  if (attr('aria-expanded') !== 'true') return false
  const pop = attr('aria-haspopup')
  return (pop !== null && pop !== 'false') || attr('role') === 'combobox'
}

/* Something open over the panels that takes the Escape itself, so the page's
   stands back: a popup open inside a panel, or a kit dialog open anywhere —
   the Identity field's Choose a user, which opens from a row with no
   `aria-expanded` and portals out of the panel. A dialog owns its Escape
   (dialog-chrome.ts): before, one Escape shut the dialog and the panel
   under it together. */
export function popupOpen(root: ParentNode = document, dialogOpen: () => boolean = hasOpenDialog): boolean {
  return dialogOpen() || Array.from(root.querySelectorAll(`${PANEL} [aria-expanded="true"]`)).some((el) => holdsEscape((n) => el.getAttribute(n)))
}

/** Where an element stands: inside a panel or not (`Element.closest`). */
export interface Placed {
  closest(selector: string): unknown
}

/** What the focus can go back to: an element of the page, or a stand-in for one in a test. */
export interface Door extends Placed {
  readonly isConnected: boolean
  focus(): void
}

/* What a panel opening keeps as its opener: what had the focus, outside the
   panels — never the page itself — or, opened from inside a panel that is
   open, the opener that one kept (`kept`; null when no panel was open). */
export function openerOf<T extends Placed>(active: T | null, kept: T | null, body: unknown): T | null {
  if (active && active.closest(PANEL)) return kept
  return active && active !== body ? active : null
}

/* The focus back on the opener: true when it took it — on the page still,
   outside the panels, and focusable (hidden or inert, the focus stays put). */
export function refocus(door: Door | null, active: () => unknown = () => document.activeElement): boolean {
  if (!door || !door.isConnected || door.closest(PANEL)) return false
  door.focus()
  return active() === door
}
