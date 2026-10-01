/* -----------------------------------------------------------------------------
   What the testing surface is called, said once (owner, 1 Oct 2026: "instead
   of calling it Try a sign-in or Sign-in tests, can we call it something
   related to access"). It was "Sign-in tests" as a page and "Try a sign-in"
   as the button that opens it. Now the page is where access checks live,
   and every button that starts one says what it does, verb first: All
   Policies' button, the page's own, and the builder's bar.

   Change them here and every place that names the surface follows.
   -------------------------------------------------------------------------- */

/** The button that starts one: All Policies', the page's, the builder's bar. */
export const ACCESS_CHECK = 'Check access'

/** The page they live on: its crumb and its title. */
export const ACCESS_CHECKS = 'Access checks'
