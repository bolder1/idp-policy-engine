/* -----------------------------------------------------------------------------
   FOCUS'S TWO VIEWS (owner, 5 Oct 2026: "I want 2 views … so 2 views and 2
   functions … Vertical by default, with an option for the horizontal").

     vertical    the run top to bottom, Classic v2's chain of cards
     horizontal  the run left to right, the route map (focus2-overview.ts)

   One is always on; Brief and Questions are the two functions over either
   (focus2-canvasbar.tsx). The cards one at a time are not a view: a station
   pressed on the horizontal opens them, and Back returns (Focus2Layout.tsx).

   Kept under a NEW key, so nothing stored before can pick the view: the
   overview's `idp.focus-arrange` and the views' `idp.focus-views` are read
   for nothing here, and a viewer who once chose the overview or the cards
   still lands on Vertical. The brief's own flag stays where
   focus2-brief-model.ts keeps it.
   -------------------------------------------------------------------------- */

export type FocusView = 'vertical' | 'horizontal'

export const FOCUS_VIEW_KEY = 'idp.focus-view'
const FOCUS_VIEWS: readonly FocusView[] = ['vertical', 'horizontal']

/** What a viewer who never chose gets. */
export const FIRST_FOCUS_VIEW: FocusView = 'vertical'

/** The viewer's last view on this browser; Vertical when there is none, or storage refuses. */
export function readFocusView(): FocusView {
  try {
    if (typeof window === 'undefined') return FIRST_FOCUS_VIEW
    const v = window.localStorage.getItem(FOCUS_VIEW_KEY)
    return FOCUS_VIEWS.includes(v as FocusView) ? (v as FocusView) : FIRST_FOCUS_VIEW
  } catch {
    return FIRST_FOCUS_VIEW
  }
}

export function writeFocusView(v: FocusView): void {
  try {
    window.localStorage.setItem(FOCUS_VIEW_KEY, v)
  } catch {
    /* Storage refused: the pick holds for as long as the view does. */
  }
}
