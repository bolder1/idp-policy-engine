import type { Features } from './edition'
import type { BrandScreen } from './store'
import { LINE } from './lines'

/* -----------------------------------------------------------------------------
   The phase 1 tester build (owner, 18 Nov 2026: "provide a link for our testers ... with a completely empty
   state ... we will only keep those things that we are planning to ship in phase 1").

   On only when Vite runs in the `tester` mode (`npm run dev:tester`, `npm run build:tester`); every other build,
   the showcase included, is unchanged. While it is on:
     - the tenant starts empty: the Global Default only (its catch-all rule), no zones, device profiles, post sign-in
       policies or saved sign-ins; applications, people, groups and methods stay (fixtures.ts `testerTenant`);
     - Check access, Access checks and Sign-in activity are withheld (store.tsx features, screenOffered);
     - Post sign-in, Risk signal profile and External hooks are withheld, with the two rule conditions that read
       them (Device risk score, External hook).
   Finished work, hidden for this build, not deleted.
   -------------------------------------------------------------------------- */
/* 19 Nov 2026: the line the sign-in chose (lines.ts); the tester deploy is always this line. */
export const TESTER: boolean = LINE === 'tester'

/* -----------------------------------------------------------------------------
   Promoted from the tester build to every build (owner, 18 Nov 2026: "we made some necessary changes in the testing
   part … make sure those changes are reflected on our dev server as well"). Each was born behind TESTER; the owner
   picked these six for dev and the handoff too. Each keeps its own switch, so one can be taken back alone.
   -------------------------------------------------------------------------- */

/** Favorites, not templates ("call it Mark as favorite"). The words only: the star, the flag and the shelf are the same. */
export const FAVORITES = true
export const MARK_LABEL = FAVORITES ? 'Mark as favorite' : 'Mark as template'
export const UNMARK_LABEL = FAVORITES ? 'Remove from favorites' : 'Remove from templates'
export const YOURS_LABEL = FAVORITES ? 'Your favorites' : 'Your templates'
export const YOURS_LINE = FAVORITES ? 'Marked by your team' : 'Built by your team'

/** Save rule: a rule stays Unsaved on its card until the rule panel's Save rule stores it. */
export const RULE_SAVE = true

/** Before saving, turning on or off as a critical popup with details on click, not the side drawer (guard-page.tsx). */
export const CRITICAL_GUARD = true

/** Move up and Move down, fit and zoom, undo and redo, whatever builder version is on screen (builder-version.ts). */
export const ARRANGE_TOOLS = true

/** The migration Approve card publishes the approved drafts only; there is no Publish all. */
export const NO_PUBLISH_ALL = true

/** The rail marks Authentication methods New, and Devices no longer (Shell.tsx). */
export const METHODS_NEW = true

/** How long Save rule's call to the API takes, so the admin sees it work. */
export const RULE_SAVE_MS = 900

/** The build's features with the testing surfaces off: Check access in the builder, Access checks, Break-in. */
export const testerFeatures = (f: Features): Features => ({ ...f, policyTesting: false, trySignIn: false, breakInTest: false })

/** Pages the tester build withholds on top of the edition's (edition-screens.ts reads this). */
export const TESTER_WITHHELD: ReadonlyArray<BrandScreen['name']> = ['sign-in-activity', 'risk-signals', 'hooks']

/** Rule conditions the tester build withholds: they read the withheld Risk signal profile and External hooks. */
export const TESTER_WITHHELD_CONDITIONS: readonly string[] = ['device-risk', 'ml-risk', 'webhook']
