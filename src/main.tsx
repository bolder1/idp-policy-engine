import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { BrandApp } from './brand/BrandApp'

// Brand revamp (default) — tokens generated from the design-system repo.
import './brand/tokens.css'
import './brand/kit.css'
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
import './brand/screens/auth-methods-v2.css'
import './brand/screens/hooks.css'
import './brand/screens/zones-final.css'
import './brand/screens/device-fingerprint-v2.css'
import './brand/screens/used-by.css'
import './brand/create/create.css'
import './brand/create/interview.css'
import './brand/tour/tour.css'
// Last — it overrides both the token values and a handful of shell rules to
// match the console in production. See above for what depends on that.
import './brand/console-theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandApp />
  </StrictMode>,
)
