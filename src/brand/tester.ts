import type { Features } from './edition'
import type { BrandScreen } from './store'

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
export const TESTER: boolean = import.meta.env.MODE === 'tester'

/* Favorites, not templates (owner, 18 Nov 2026: "don't call it Mark as template, call it Mark as favorite"; "Your
   templates … Your favorites or something"). The words only: the star, the flag and the shelf are the same. */
export const MARK_LABEL = TESTER ? 'Mark as favorite' : 'Mark as template'
export const UNMARK_LABEL = TESTER ? 'Remove from favorites' : 'Remove from templates'
export const YOURS_LABEL = TESTER ? 'Your favorites' : 'Your templates'
export const YOURS_LINE = TESTER ? 'Marked by your team' : 'Built by your team'

/** Save rule (owner, 18 Nov 2026): a rule stays Unsaved on its card until the rule panel's Save rule stores it. */
export const RULE_SAVE: boolean = TESTER

/** How long Save rule's call to the API takes, so the admin sees it work. */
export const RULE_SAVE_MS = 900

/** The build's features with the testing surfaces off: Check access in the builder, Access checks, Break-in. */
export const testerFeatures = (f: Features): Features => ({ ...f, policyTesting: false, trySignIn: false, breakInTest: false })

/** Pages the tester build withholds on top of the edition's (edition-screens.ts reads this). */
export const TESTER_WITHHELD: ReadonlyArray<BrandScreen['name']> = ['sign-in-activity', 'risk-signals', 'hooks']

/** Rule conditions the tester build withholds: they read the withheld Risk signal profile and External hooks. */
export const TESTER_WITHHELD_CONDITIONS: readonly string[] = ['device-risk', 'ml-risk', 'webhook']
