import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BrandApp } from './brand/BrandApp'

// Brand revamp (default) — tokens generated from the design-system repo.
import './brand/tokens.css'
import './brand/kit.css'
/* picker.css belongs HERE, not in picker.tsx, and the reason is a bug it caused
   for as long as it lived there.

   `main.tsx` imports `BrandApp` on its first line, so the entire eager module
   graph — Shell, Policies, kit.tsx, picker.tsx — is evaluated before the CSS
   imports below it are reached. picker.css therefore landed BEFORE kit.css.

   That matters because `.bx-picker__trigger` (0,1,0) and kit's
   `.brand-root :where(button)` reset (also 0,1,0 — `:where()` contributes
   nothing but `.brand-root` is a class) are a specificity TIE, resolved on
   source order. The reset won, and it says `border: none; background: none`.

   Every Picker in the product was rendering as bare text: no box, no edge, no
   fill. Thirty-two of them on the risk-signal screen alone, where they are the
   controls that set what a signal is worth. Nothing catches this — it type-
   checks, it lints, the stylesheet test only reads braces, and a dropdown that
   looks like a label looks deliberate in a screenshot. */
import './brand/picker.css'
import './brand/setting-field.css'
import './brand/shell.css'
import './brand/user-shell.css'
import './brand/screens.css'
import './brand/empty.css'
import './brand/edition.css'
import './brand/persona.css'
/* Every per-screen stylesheet is here rather than in the screen module that
   renders it, and that is deliberate — it was tried the other way.

   The screens are lazily loaded, so importing their CSS from the screen would
   move ~186 kB out of the entry stylesheet, which is worth wanting. It cannot
   be done while console-theme.css works the way it does. That sheet is loaded
   LAST on purpose: it re-states `.bpage h2`, `.bpage h3`, `.bx-btn--brand` and
   a dozen more at the same specificity as the screen rules it is correcting,
   and wins purely on source order. Put a screen's stylesheet in a chunk and it
   arrives after console-theme, so the order flips and the screen wins instead:
   measured, that turned the methods h2 from 16px to 20px, the hooks h3 from
   14px/600 to 16px/500, and gave the zones view-switch buttons padding they are
   not supposed to have.

   The fix is cascade layers — @layer base, screens, console — which would make
   the precedence explicit instead of positional and let the sheets travel
   wherever they like. That is a change to every stylesheet in the app, so it is
   not a thing to slip into a cleanup. Until then, these stay eager. */
import './brand/screens/coverage.css'
import './brand/screens/builder-v4.css'
import './brand/screens/gauntlet.css'
import './brand/screens/impact-arena.css'
import './brand/screens/recovery.css'
import './brand/screens/method-forms.css'
import './brand/screens/auth-methods.css'
import './brand/screens/hooks.css'
import './brand/screens/zones-final.css'
import './brand/screens/device-fingerprint-v2.css'
import './brand/screens/used-by.css'
import './brand/screens/applications.css'
import './brand/create/create.css'
import './brand/create/interview.css'
import './brand/tour/tour.css'
// After tour.css, which owns the card, scrim, ring and beak this one extends.
import './brand/tour/board-tour.css'
import './brand/tour/demo-player.css'
// Last — it overrides both the token values and a handful of shell rules to
// match the console in production. See above for what depends on that.
import './brand/console-theme.css'
// After that, and only while the Rebrand switch is on: the live-console rebrand.
import './brand/rebrand.css'
// One partial per area, after the shared layer, so an area rule wins a tie with it.
import './brand/rebrand/shell.css'
import './brand/rebrand/policies.css'
import './brand/rebrand/applications.css'
import './brand/rebrand/zones.css'
import './brand/rebrand/devices.css'
import './brand/rebrand/risk.css'
import './brand/rebrand/auth-methods.css'
import './brand/rebrand/trail-builder.css'
import './brand/rebrand/board.css'
import './brand/rebrand/create.css'
import { applyBrand, readBrand } from './brand/brand-mode'

/* Before the first paint, so a reload in the rebrand does not flash the current
   look for a frame. */
applyBrand(readBrand())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandApp />
  </StrictMode>,
)
