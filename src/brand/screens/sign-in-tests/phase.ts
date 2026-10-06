/* -----------------------------------------------------------------------------
   What this phase of Access checks shows, said once.

   Saved sign-ins are a later phase (owner, 1 Oct 2026: "as of now hide the
   saved sign-ins as well and focus on Check access only; saved sign-ins will
   come in a different phase"). Off, the page and the builder's Check access
   show none of them: no Saved sign-ins on the empty canvas, no Use a saved
   sign-in in the form, no Save sign-in in its foot, no Saved sign-ins panel,
   and a route that named them opens the page as it is. Their code and their
   tests are kept; flip this to bring every one of them back.

   Break-in attempts come here instead of the builder (owner, 1 Oct 2026:
   "can we implement it in the check part? as a suggestion inside conflicts or
   somewhere else" — then "go with your picks, start building"). The fifteen
   scripted sign-ins, played on the run's application across the tenant
   (break-in-app.ts): their own section in the Why panel under the conflicts,
   the outcome strip when attempts get through and nothing louder is said, and
   the attempts panel behind Review attempts. Shown only with the edition's
   Break-in test on as well (`features.breakInTest`); the builder's own stays
   hidden (board/test-mode.ts). No Accept here yet — that is a later phase —
   but a result accepted in the builder is honoured. Flip this to take every
   one of them off the page.
   -------------------------------------------------------------------------- */

/* The run's canvas in more than one layout, side by side for the owner to
   choose from (owner, 1 Oct 2026: "give me a fresh approach … not the same
   orientation … spread out the cards … so I want some more options"). On,
   the page's bar carries a Canvas switch (run-layout.ts); off, the run is
   drawn as it was, one column. A review switch, not a product control: it
   reads its own flag, not SHOWCASE, so the comparison can be seen in the
   showcase build until a layout is chosen. */
export const CANVAS_OPTIONS: boolean = true

/** Saved sign-ins: the panel, the form's row, Save sign-in. Off for this phase. */
export const SAVED_SIGN_INS: boolean = false

/** Break-in attempts on Access checks: the Why section, the strip, the attempts panel. On, with `features.breakInTest`. */
export const BREAK_IN_ATTEMPTS: boolean = true

/** Denial reasons (docs/specs/DENIAL-REASONS.md): the cause of a refusal, said in plain words under the message. Off until the owner flips it. */
export const DENIAL_REASONS: boolean = true
