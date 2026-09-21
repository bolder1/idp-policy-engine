/* -----------------------------------------------------------------------------
   The showcase build.

   Owner, 21 Sep 2026: "the main goal is to showcase the final prototype, so all
   the options we have for A/B testing or for reviewing changes — hide all this
   and only showcase the selected and final things."

   So every comparison switch, preview picker and prototype-only control reads
   this one flag. While it is on, none of them renders, and each setting they
   governed is pinned to the version that was chosen — whatever an older visit
   left in localStorage. Nothing is deleted: turn this off and every switch comes
   back, with the stored values they had.

   Pinned at the call sites rather than inside the `read…()` helpers, so those
   still say what storage holds (their tests describe storage, not the build),
   and so each pin is visible where it is applied.
   -------------------------------------------------------------------------- */
export const SHOWCASE = true
