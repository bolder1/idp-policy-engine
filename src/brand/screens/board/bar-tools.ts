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
