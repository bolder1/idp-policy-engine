import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

// Brand revamp (default) — tokens generated from the design-system repo.
import './brand/tokens.css'
import './brand/kit.css'
import './brand/setting-field.css'
import './brand/shell.css'
import './brand/screens.css'
// The archived builders carry their own stylesheets so both travel in their
// own chunk — see BuilderPage. Only v4's ships with the entry.
import './brand/screens/coverage.css'
import './brand/screens/builder-v4.css'
import './brand/screens/gauntlet.css'
import './brand/screens/impact-arena.css'
import './brand/screens/zones.css'
import './brand/screens/auth-methods.css'
import './brand/screens/auth-methods-v5.css'
import './brand/screens/auth-methods-v6.css'
import './brand/screens/auth-methods-v7.css'
import './brand/screens/auth-methods-v8.css'
import './brand/screens/method-sets.css'
import './brand/screens/hooks.css'
import './brand/screens/zones-v2.css'
import './brand/screens/zones-v3.css'
import './brand/screens/zones-v4.css'
import './brand/screens/zones-v5.css'
import './brand/screens/zones-final.css'
import './brand/screens/device-fingerprint.css'
import './brand/screens/device-fingerprint-v2.css'
import './brand/edition.css'
import './brand/persona.css'
import './brand/create/create.css'
import './brand/create/interview.css'
import './brand/tour/tour.css'
// Last — it overrides both the token values and a handful of shell rules to
// match the console in production.
import './brand/console-theme.css'

// Model concept (second version, reachable from the switcher).
import './theme/concept-tokens.css'
import './components/ui.css'
import './components/Shell.css'
import './screens/Coverage.css'
import './screens/Builder.css'
import './screens/Simulate.css'
import './screens/Resolution.css'
import './screens/NamedObjects.css'
import './version-flag.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
