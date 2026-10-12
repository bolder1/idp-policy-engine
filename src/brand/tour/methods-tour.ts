/* -----------------------------------------------------------------------------
   What moved — the Authentication methods tour, for admins who knew the old
   pages (owner, 7 Oct 2026: "we revamped our methods page … we want our users
   a tour that what changed, where things are now, and how they can find
   things now … so the old users can easily walk through the new UI").

   The live console spreads this over five pages under 2-Factor Authentication
   (read off it on 7 Oct 2026, docs/research/2026-10-07-live-console-2fa-pages.md).
   This page holds them in one list, so the tour is a map from the old place to
   the new one: every stop names where a thing WAS, lights where it IS, and
   says in one sentence how it works now.

   How it is offered, from the research behind it:
   · Pulled, never pushed (NN/g, "Onboarding Tutorials vs. Contextual Help",
     2023): an announcement above the tabs says what changed in four lines and
     carries the tour, and it stays (owner, 7 Oct 2026: "no need to add a hide
     option") — so the tour is always one press away, and never starts itself.
   · Said where it moved (Google, change aversion, CHI'13): every stop names
     the old place, and a moved setting says where it was — the console already
     does this in words ("The following options have been moved to product
     settings").

   Copy rule, the builder tour's: one sentence per stop. Where a stop needs
   the page in another state, it gets there the way a reader would — a click
   on the row, the tab, the gear — so what it shows is the page's own
   behaviour, not a picture of it.

   No stop for the admin's own second factor: the old Setup 2FA for Admin page
   held it, and the prototype has not built it (User Dashboard is an end user's
   view), so a stop pointing anywhere would send people to the wrong place.
   -------------------------------------------------------------------------- */

/* The page as each stop needs it: the list, a family's drawer, a settings page, or the Recovery tab. */
export type MovedView = 'list' | 'sms' | 'grid' | 'recovery'

/* What the reader does at a stop (owner, 7 Oct 2026: "they have to be a part of the tour" — then "no need to
   add the action button in the cards; add a highlight on the click part, so the user either clicks or goes
   next"). The part to click pulses (`hint`); the card says Next throughout. Done, the card says what the
   reader caused; skipped, the next stop opens what it needs itself. */
export type MovedTask =
  /** A switch flipped: done once it reads differently from when the stop opened. The hint is the switch. */
  | { kind: 'switch'; hint: string; done: string }
  /** A press that opens something: done once `doneWhen` is on the page, and then the light moves to `lights` —
      what it opened. The row it pressed is under a drawer by then (owner, 7 Oct 2026: "fix this spotlight"). */
  | { kind: 'click'; hint: string; doneWhen: string; lights: string; done: string }

export interface MovedStop {
  id: string
  /** `data-tour` value of the element to light. */
  anchor: string
  /** Where it was in the live console, where there was a place. */
  was?: string
  heading: string
  body: string
  view: MovedView
  task?: MovedTask
}

/* The page's own elements, by what a reader would click. Drawers are named by their title (kit Drawer). */
export const SEL = {
  callSwitch: '[data-tour="methods-row-otp-call"] [role="switch"]',
  smsRow: '[data-tour="methods-row-sms"]',
  smsOpen: '[data-tour="methods-row-sms"] .bm8__open',
  smsDrawer: 'aside[aria-label="SMS"]',
  methodsTab: '[data-tour="drawer-tab-methods"]',
  settingsTab: '[data-tour="drawer-tab-settings"]',
  settingsPane: '[data-tour="drawer-settings"]',
  gridGear: '[data-tour="methods-row-grid"] button[aria-label="Grid Pattern settings"]',
  gridDrawer: 'aside[aria-label="Grid Pattern"]',
  recoveryTab: '[data-tour="methods-tab-recovery"]',
  recoveryOn: '[data-tour="methods-tab-recovery"][aria-selected="true"]',
  recoveryPane: '[data-tour="methods-recovery"]',
} as const

/* The owner's order (7 Oct 2026): the new tab, then the three kinds of row — a switch alone, a row with a page
   of its own, a switch with one settings page — then Recovery. */
export const MOVED_STOPS: MovedStop[] = [
  {
    id: 'rail',
    anchor: 'rail-methods',
    was: 'the 2-Factor Authentication menu, five pages',
    heading: 'Authentication methods has its own place',
    body: 'Everything from the five 2-Factor Authentication pages is on this one page now.',
    view: 'list',
  },
  {
    id: 'switch',
    anchor: 'methods-row-otp-call',
    was: '2FA Options For EndUsers › Allowed 2FA Methods',
    heading: 'Some methods are just a switch',
    body: 'OTP over Phone Call needs no setup, so the switch on its row turns it on and lets people choose it.',
    view: 'list',
    task: { kind: 'switch', hint: SEL.callSwitch, done: 'Switched on the row, with no page to open.' },
  },
  {
    id: 'family',
    anchor: 'methods-row-sms',
    was: 'Setup 2FA for Admin › SMS, and Edit on each method',
    heading: 'Some open a page of their own',
    body: 'SMS holds three methods, so clicking its row opens them together.',
    view: 'list',
    task: { kind: 'click', hint: SEL.smsRow, doneWhen: SEL.smsDrawer, lights: SEL.smsDrawer, done: 'SMS is open.' },
  },
  {
    id: 'family-methods',
    anchor: 'drawer-methods',
    was: '2FA Options For EndUsers › Allowed and Default methods',
    heading: 'A switch for each method, and the default',
    body: 'Turn each SMS method on or off here; once one is on, Make default picks the one new users get.',
    view: 'sms',
  },
  {
    id: 'family-settings',
    anchor: 'drawer-tab-settings',
    heading: 'Settings the family shares',
    body: 'OTP length and validity apply to every SMS method, so they sit once, on the Settings tab.',
    view: 'sms',
    task: { kind: 'click', hint: SEL.settingsTab, doneWhen: SEL.settingsPane, lights: SEL.settingsPane, done: 'These apply to all three SMS methods.' },
  },
  {
    id: 'gear',
    anchor: 'methods-row-grid',
    was: '2FA Options For EndUsers › Advanced Options',
    heading: 'A switch and one settings page',
    body: 'Grid Pattern turns on from its switch, and clicking its gear opens its only settings page.',
    view: 'list',
    task: { kind: 'click', hint: SEL.gridGear, doneWhen: SEL.gridDrawer, lights: SEL.gridDrawer, done: 'Grid Pattern’s settings are open.' },
  },
  {
    id: 'gear-page',
    anchor: 'drawer-settings',
    heading: 'Moved settings say where they were',
    body: 'Grid size and pattern length came from Advanced Options, and say so beside their name.',
    view: 'grid',
  },
  {
    id: 'recovery',
    anchor: 'methods-tab-recovery',
    was: 'Alternate 2FA Login Methods · Static Code Generation',
    heading: 'Recovery has its own tab',
    body: 'Forgot Phone and security codes moved here from their own pages.',
    view: 'list',
    task: { kind: 'click', hint: SEL.recoveryTab, doneWhen: SEL.recoveryOn, lights: SEL.recoveryPane, done: 'Recovery is open.' },
  },
  {
    id: 'recovery-page',
    anchor: 'methods-recovery',
    heading: 'Everything about getting back in',
    body: 'Turn on Forgot Phone, let people pick their recovery method, and allow security codes, all on this tab.',
    view: 'recovery',
  },
]

/** The announcement above the tabs: what changed, in four lines a returning admin reads in a glance. */
export const NEW_LAYOUT = {
  /* Owner, 7 Oct 2026: "call it What's new; for the sub heading use the current heading". */
  title: 'What’s new',
  /* The closed card's one line (owner, same day: "this takes a lot of space — a one-liner and the tour button,
     collapsed, so the user can open it to read"). */
  line: 'Authentication methods has a new layout',
  points: [
    'All five 2-Factor Authentication pages, now on one page',
    'Methods grouped by channel, each with its own switch',
    'Default, setup and settings inside each family',
    'Forgot Phone and security codes on the Recovery tab',
  ],
}

/* Where a setting used to be (mfa-settings.ts `source`), said beside it on the family's Settings tab — the
   answer to "where did that go" at the setting itself, for whoever skips the tour. Only what was read off the
   live console on 7 Oct 2026: Advanced Options held grid size and length, push biometric and number matching,
   and the menu held token assignment. "Product Settings" comes from the settings sheet alone, so it is not said
   until it is checked there. */
export const SETTING_WAS: Partial<Record<'prod' | 'advanced' | '2fa' | 'new', string>> = {
  advanced: 'Was in Advanced Options',
  '2fa': 'Was in 2-Factor Authentication',
}
