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
   hidden (board/test-mode.ts). Accept as expected is built here since 5 Oct
   (ACCEPT_ATTEMPTS, below), and a result accepted in the builder is honoured
   too. Flip this to take every one of them off the page.
   -------------------------------------------------------------------------- */

/* The run's canvas in more than one layout, side by side for the owner to
   choose from (owner, 1 Oct 2026: "give me a fresh approach … not the same
   orientation … spread out the cards … so I want some more options"). It
   began as a temporary review switch; since 5 Oct 2026 it is the one that
   selects Focus. On, the page draws `shownLayout()` (run-layout.ts): Focus
   (`MAIN_VIEW`, with Classic v2's cards), and the Canvas picker only if
   CANVAS_PICKER is on (it is off). Off, the run is drawn as it was, one
   column. It reads its own flag, not SHOWCASE, so it is not hidden by the
   showcase pin. */
export const CANVAS_OPTIONS: boolean = true

/** Saved sign-ins: the panel, the form's row, Save sign-in. Off for this phase. */
export const SAVED_SIGN_INS: boolean = false

/** Break-in attempts on Access checks: the Why section, the strip, the attempts panel. On, with `features.breakInTest`. */
export const BREAK_IN_ATTEMPTS: boolean = true

/** Denial reasons (docs/specs/DENIAL-REASONS.md): the cause of a refusal, said in plain words under the message. */
export const DENIAL_REASONS: boolean = true

/** Accept as expected on a break-in attempt (a reason, who and when; Restore undoes it). The builder's acceptance is read either way. */
export const ACCEPT_ATTEMPTS: boolean = true

/** Temporary access from a refusal: the Why's Let in for a while, a first rule that ends by itself (temp-access.ts). */
export const TEMP_ACCESS: boolean = true

/** The Identity field takes several users and groups at once, one run each (IdentityField.tsx). Off: one person or one group, as it was (IdentityFieldSingle.tsx). Owner, 5 Oct 2026. */
export const MULTI_IDENTITY: boolean = false

/** The inspector: a name on the run (a policy, a rule) opens in the right-hand panel, read-only, with Edit in builder as the one way out (InspectPanel.tsx). */
export const INSPECTOR: boolean = true

/** Read as text, a tab beside the policy inspector's details. Off (owner, 6 Oct 2026, later: "Read as text is not used — only the details view, no tabs"); the details never depended on it. */
export const READ_AS_TEXT_TAB: boolean = false

/** Details in the canvas bar (the policy that decided, in the inspector). Off (owner, 6 Oct 2026: "remove this button, no need"): the names inside the cards are the way in. */
export const DETAILS_IN_BAR: boolean = false

/* The why in Focus (6 Oct 2026). How to get in, Let in for a while, What changed, Copy summary, the conflicts and As each
   group were built on 5 Oct into the why (WhyCard.tsx) — which only the column's answer opened, so Focus, the one view
   the owner presents, could not reach any of it. On: the outcome card's body ends in one quiet link ("Why", "Review
   conflict", "Why, and how to get in"), and the why opens in the page's right-hand panel, as the column's does
   (layouts/focus2-why.tsx). Inside a card, by his ruling — never on the canvas's bar, never an icon on a card's head.
   Off: Focus draws neither, as before. */
export const WHY_IN_FOCUS: boolean = true

/** Beside each row's ✓ or ✕ on the rule card, the sign-in's own value that the row read ("Office network", "Windows 11
    laptop"), sharpening in as the engine reads it — so a mark answers something on screen (6 Oct 2026, the run made to
    feel real). Off, the rows carry their marks alone, as the builder's do — the owner's pick the same day ("remove, no
    need"). */
export const ROW_EVIDENCE: boolean = false

/* One policy per application (owner, 20 Oct 2026: "only one policy per app, mostly. So we can merge the whole thing — the
   policy, and add their rules inside, so maybe one card"). The Policies card (the search, "Policy 1 of 2 applies", the
   applies / not reached list) and the Rule card become ONE Policy card: the policy that decides, its rules in order
   inside it with each rule's outcome, the deciding rule open, Nothing else matched last, and the Global Default as its
   quiet foot — the app Policies tab's 1:1 changes (20 Oct). When the Global Default decides, the card is the Global
   Default, and one line under its head says why. Off: the four-key chain, as it was. */
export const ONE_POLICY_CARD: boolean = true

/* Past and blocked sign-ins open straight into their run (owner, 20 Oct 2026: "when I'm in a blocked sign-in or try to
   click on any past sign-in, it should open immediately — no need to showcase the free-field form; it can start
   directly"). Overrides only-Run-runs for these opens alone: Blocked sign-ins (the empty canvas's Recently blocked and the
   Blocked panel) and the builder's Past sign-ins. The list stays beside the run with the row marked. A page that mounts on
   a run (Sign-in activity's or the app tab's Open in Check access) gives the canvas the focus and says the answer once.
   Off: a past or blocked sign-in fills the form and waits for Run, as it did. */
export const OPEN_AT_ONCE: boolean = true
