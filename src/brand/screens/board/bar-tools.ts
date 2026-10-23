/* -----------------------------------------------------------------------------
   The builder bar's three quiet tools, hidden (owner, 1 Oct 2026, of the
   Demo · 1:16 button, Learn the board and Read as text: "Hide this 3 as of
   now"). It supersedes the showcase pick of 21 Sep ("keep demo + tour").

   Hidden, not deleted, the way SHOWCASE pins a preview (showcase.ts): each
   flag is read where its door is, and turning one back on brings the door
   back as it was, with everything behind it.

     demo   the bar's Demo · 1:16 (DemoButton) — and the walkthrough's own
            "watch the demo", since the walkthrough goes with `tour`
     tour   the bar's graduation cap, Learn the board, and the walkthrough
            that opened by itself on a first visit to the builder
     read   the bar's Read as text icon; the panel it opened is still the
            Policies row menu's Read as text, which this does not touch

   None has a key or a palette entry of its own; while a flag is off, nothing
   else on the builder opens what it hides.
   -------------------------------------------------------------------------- */

/** Demo · 1:16 on the builder's bar. */
export const BAR_DEMO: boolean = false

/** Learn the board on the builder's bar, and the walkthrough on a first visit. */
export const BAR_TOUR: boolean = false

/** Read as text on the builder's bar. */
export const BAR_READ: boolean = false

/* The rule on/off switch, hidden (owner, 23 Oct 2026: "Hide the toggle and
   remove this active inactive rule function as of now"). It sat on the rule
   card and in the panel's rule head. Hidden, not deleted: the card still reads
   `rule.enabled`, so turning this on brings the switch back as it was. */
export const RULE_ON_OFF: boolean = false

/* The panel's Narrow / Widen button, hidden (owner, 23 Oct 2026: "Remove this
   function as well, hide it ... a better, bigger, single-stack form size"). The
   panel is one width now, 640 to start, and the grip in the gutter still drags
   it between 480 and 880. Hidden, not deleted: turning this on brings the
   button back, though the narrow end it steps to is now only 380 wide. */
export const PANEL_WIDTH_BUTTON: boolean = false
