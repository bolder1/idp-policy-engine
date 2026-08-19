import type { Depth } from './fixtures'
import type { BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   The personas, and which of the Policy tab's inner tabs each one lives in.

   Straight out of the framework doc's *Gaps & Personas* and *Conclusion*: three
   admin archetypes, plus the two the doc names and then sets aside — the
   integrator whose conditions live in someone else's system, and the bulk
   operator it explicitly calls "a task mode, not a persona". Both are here as
   entries anyway, because "not really a persona" is not the same as "does not
   need the product to work for them", and the 700-IP-range case is the one that
   decides whether the UI collapses under weight.

   Plus one the doc does not name because it is not an archetype: the tenant on
   its first morning. Every persona is that tenant once.

   --- What this is FOR -------------------------------------------------------

   Not a dashboard. The Policy tab already has the six surfaces these people
   use; what it has never had is any way to ask **whether each persona is
   actually served by them**, or to show a room what the same product looks like
   for a 200-person tenant and a 20,000-person one.

   So a persona is declared as data — the question they arrive with, the tabs
   they touch, and the capability each of those tabs has to provide — and two
   things read that declaration:

   · the demo switcher, which lands you where that persona lands and marks the
     tabs they use;
   · `personas.test.ts`, which asserts every declared need maps to a tab that
     exists. That test is the reason this file is a registry rather than a
     paragraph in a doc: a need nobody built is a failing test, not a sentence
     somebody has to remember to re-read.
   -------------------------------------------------------------------------- */

export type PersonaId = 'first-run' | 'generalist' | 'manager' | 'architect' | 'integrator' | 'bulk'

/** The Policy tab's inner tabs. Anything outside this list is outside the revamp. */
export type TabId = 'policies' | 'templates' | 'zones' | 'fingerprint' | 'methods' | 'hooks'

export const TAB_LABEL: Record<TabId, string> = {
  policies: 'All Policies',
  templates: 'Templates',
  zones: 'Zones',
  fingerprint: 'Device Fingerprint',
  methods: 'Method Sets',
  hooks: 'External Hooks',
}

export const TAB_SCREEN: Record<TabId, BrandScreen> = {
  policies: { name: 'policies' },
  templates: { name: 'templates' },
  zones: { name: 'zones' },
  fingerprint: { name: 'fingerprint' },
  methods: { name: 'methods' },
  hooks: { name: 'hooks' },
}

/* One thing a persona needs, and the tab that has to provide it.

   `met` is the honest part. A need the product does not serve yet stays in the
   list with `met: false` and a note saying what is missing — the alternative is
   a registry that only ever contains victories, which tells a meeting nothing
   it did not already believe. */
export interface Need {
  what: string
  tab: TabId
  met: boolean
  /** When unmet: what is actually missing. When met: where it lives. */
  note: string
}

export interface Persona {
  id: PersonaId
  label: string
  /** The doc's own name for them, where it gives one. */
  archetype: string
  size: string
  /** The one question they arrive with. */
  question: string
  /** How the doc says they move through the product. */
  flow: string
  /** Named customers or evidence the doc attaches. */
  evidence?: string
  /** Where the demo should land for them. */
  landing: TabId
  /* How much is in their tenant.

     A property of the persona rather than a second dial, because the doc gives
     every archetype a company size and the sizes are the point: a 200-person
     tenant and a 20,000-person one are not the same product with bigger
     numbers, they are different problems. Picking a persona loads their
     tenant into every tab. */
  depth: Depth
  needs: Need[]
}

export const PERSONAS: Persona[] = [
  {
    id: 'first-run',
    label: 'New admin · hour one',
    archetype: 'Day zero',
    size: 'Any',
    question: 'What do I do first, and what is happening until I do it?',
    flow: 'Arrives from onboarding with nothing configured. Has never seen a policy builder and does not want to.',
    evidence: 'Not a persona in the doc — the state every persona starts in, and the one the product is least often designed for.',
    landing: 'templates',
    depth: 'none',
    needs: [
      {
        what: 'Be told what happens before anything is configured',
        tab: 'policies',
        met: true,
        note: 'The Global Default Policy is pinned to the top of the list as always-on, so the fall-through is visible rather than implied.',
      },
      {
        what: 'Start from a pre-written policy instead of a blank builder',
        tab: 'templates',
        met: true,
        note: 'All five templates the doc names ship, with a preview of the rules before they are applied.',
      },
      {
        what: 'Be walked through the first policy',
        tab: 'templates',
        met: true,
        note: 'The five-question guided build composes the rules and grades them.',
      },
      {
        what: 'A zero state that teaches rather than an empty table',
        tab: 'zones',
        met: true,
        note: 'Zones and Device Fingerprint both have written empty states. The policy list does not — it shows a filter-empty row.',
      },
    ],
  },
  {
    id: 'generalist',
    label: 'IT Generalist',
    archetype: 'The Delegator',
    size: '50–500 employees',
    question: 'Is protection on, and did anything break overnight?',
    flow: 'New Policy → template → assign apps → Review → Activate. Never enters the rule editor.',
    evidence: 'The largest segment by volume. IAM is one of fifteen responsibilities.',
    landing: 'policies',
    depth: 'small',
    needs: [
      {
        what: 'See at a glance which policies are live',
        tab: 'policies',
        met: true,
        note: 'Status pill per row; the footer counts what is enforcing and what is in monitor.',
      },
      {
        what: 'Be told when a policy cannot work',
        tab: 'policies',
        met: true,
        note: 'The config-issue marker names the problem — no apps attached, or no rules — instead of showing a bare red dot.',
      },
      {
        what: 'Find what is protected by nothing',
        tab: 'policies',
        met: true,
        note: 'The Coverage tab: apps across, groups down, gaps as the default reading.',
      },
      {
        what: 'Reuse one policy across many apps',
        tab: 'policies',
        met: true,
        note: 'Assign apps takes many, and flags apps another live policy already governs.',
      },
      {
        what: 'Try a policy without risking a lockout',
        tab: 'policies',
        met: true,
        note: 'Monitor status — evaluates every sign-in, enforces nothing. Offered at the publish gate.',
      },
    ],
  },
  {
    id: 'manager',
    label: 'Security IT Manager',
    archetype: 'The Configurator',
    size: '500–5,000 employees',
    question: 'Where is my policy weak, and did the scenario I wrote actually land?',
    flow: 'From scratch → builder → picks a named Zone and fingerprint profile → sets THEN → copies the rule into a second policy.',
    evidence: 'SIB/HRS. Device trust with a 90-day TTL, enrolment-state forks, preferred-method inheritance.',
    landing: 'policies',
    depth: 'medium',
    needs: [
      {
        what: 'Fork one segment on how long a device has been trusted',
        tab: 'policies',
        met: true,
        note: 'SIB/HRS pattern 2 — the `trust-age` condition, under/over N days.',
      },
      {
        what: 'Treat first login and MFA reset as their own condition',
        tab: 'policies',
        met: true,
        note: "SIB/HRS pattern 1 — `auth-state`, which is user enrolment state rather than group membership.",
      },
      {
        what: "Let the THEN resolve from the user's own preferred method",
        tab: 'policies',
        met: true,
        note: 'SIB/HRS pattern 3 — a dynamic THEN with a named fallback.',
      },
      {
        what: 'Decide what counts as the same device as last time',
        tab: 'fingerprint',
        met: true,
        note: 'Named profiles, referenced from a rule the way a zone is. Attribute-match or risk-scored, with the tolerance chosen per profile.',
      },
      {
        what: 'Chain factors for n-factor authentication',
        tab: 'methods',
        met: true,
        note: 'Ordered method chains on the rule; the catalogue and tenant-wide enablement live on Method Sets.',
      },
      {
        what: 'Reuse a rule they already built in a second policy',
        tab: 'policies',
        met: true,
        note: 'Copy rule to another policy — an independent copy, with a warning where it would land unreachable.',
      },
      {
        what: 'Know what a policy lets through before shipping it',
        tab: 'policies',
        met: true,
        note: 'The thirteen-attempt gauntlet, graded, with the leaking policies sortable from the list.',
      },
    ],
  },
  {
    id: 'architect',
    label: 'Enterprise Security Architect',
    archetype: 'The Systematiser',
    size: '5,000+ employees',
    question: 'Is the estate coherent, and what breaks if I touch this object?',
    flow: 'Builds zones, fingerprint profiles and method sets first, then policies that reference them. Audits fan-out.',
    evidence: 'Thinks in a policy matrix — user segments down, apps across, access requirements in the cells.',
    landing: 'zones',
    depth: 'large',
    needs: [
      {
        what: 'See which policies depend on a shared object before editing it',
        tab: 'zones',
        met: true,
        note: 'Zones, Method Sets, Device Fingerprint and External Hooks all name the referencing policies and rules.',
      },
      {
        what: 'Record why a rule exists, not just what it does',
        tab: 'policies',
        met: true,
        note: 'A rationale field on every rule, surfaced in the review summary and named by the save bar when it changes.',
      },
      {
        what: 'Audit the device-identity rules the same way as any other shared object',
        tab: 'fingerprint',
        met: true,
        note: 'Each profile names the policies and rules referencing it, so its blast radius is readable before an attribute is changed.',
      },
      {
        what: 'Read the estate as a matrix',
        tab: 'policies',
        met: true,
        note: 'The Coverage tab, resolved the way the engine resolves — first match wins, inactive policies are not cover.',
      },
      {
        what: 'Export policies for version control and review',
        tab: 'policies',
        met: false,
        note: 'Not built. No JSON export or import anywhere in the tab.',
      },
      {
        what: 'Be told when two live policies disagree about the same app and group',
        tab: 'policies',
        met: false,
        note: 'Not built. Coverage shows the winner; nothing surfaces the disagreement behind it.',
      },
      {
        what: 'Order policies against each other, not just rules within one',
        tab: 'policies',
        met: false,
        note: "Not built. §6.2 proposes priority across scopes; policies are currently independent islands.",
      },
    ],
  },
  {
    id: 'integrator',
    label: 'Platform Integrator',
    archetype: 'The Integrator',
    size: 'Any — usually large',
    question: 'Are my external calls healthy, and what do they decide when they are not?',
    flow: 'The policy builder is one piece of infrastructure they already run. Thinks in endpoints, timeouts and retries.',
    evidence: 'Lenskart and Oberoi Group. Conditions evaluated by an external API — synchronous hook, or attribute sync.',
    landing: 'hooks',
    depth: 'large',
    needs: [
      {
        what: 'Gate a rule on an answer from an external system',
        tab: 'hooks',
        met: true,
        note: 'External hooks are a library object; a rule references one the way a network condition references a zone.',
      },
      {
        what: 'Decide what happens when the endpoint does not answer',
        tab: 'hooks',
        met: true,
        note: 'A required failure mode, stated in consequences rather than jargon, with four linter checks reading it.',
      },
      {
        what: 'Bound the latency an external call adds to a sign-in',
        tab: 'hooks',
        met: true,
        note: 'A timeout per hook, and a warning on every rule that pays it.',
      },
      {
        what: 'Sync attributes in and write ordinary conditions against them',
        tab: 'hooks',
        met: false,
        note: 'Half built. Attribute-sync hooks can be configured, but no condition reads a synced attribute or checks its freshness.',
      },
    ],
  },
  {
    id: 'bulk',
    label: 'Bulk operator',
    archetype: 'A task mode, not a person',
    size: 'Any',
    question: 'Did my 700 ranges land, and is what landed sane?',
    flow: 'Any of the three archetypes, once. Creates a zone, loads a large range list, never opens it again.',
    evidence: 'The doc: “this isn’t a persona, it’s a task mode. The system needs to not collapse under the weight of it.”',
    landing: 'zones',
    depth: 'large',
    needs: [
      {
        what: 'Add hundreds of ranges without adding them one at a time',
        tab: 'zones',
        met: true,
        note: 'One field takes a pasted block and separates addresses from ASNs, reporting anything it could not parse.',
      },
      {
        what: 'Never have to render 700 entries in a rule',
        tab: 'policies',
        met: true,
        note: 'A rule names the zone. The entries live in the zone and the builder never draws them.',
      },
      {
        what: 'Upload a file rather than paste',
        tab: 'zones',
        met: false,
        note: 'Not built. Paste-many covers most of it; there is no CSV or JSON upload.',
      },
      {
        what: 'Get the rejected rows back in a form they can fix',
        tab: 'zones',
        met: false,
        note: 'Not built. Bad values are named on screen, which is a transcription exercise at 240 of them.',
      },
    ],
  },
]

export const personaById = (id: PersonaId): Persona => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]

/** The tabs a persona touches, in tab order rather than declaration order. */
export function tabsFor(p: Persona): TabId[] {
  const order: TabId[] = ['policies', 'templates', 'zones', 'fingerprint', 'methods', 'hooks']
  const used = new Set(p.needs.map((n) => n.tab))
  return order.filter((t) => used.has(t))
}

/** Everything still to build, worst-served persona first. Drives the backlog. */
export function unmetNeeds(): { persona: Persona; need: Need }[] {
  return PERSONAS.flatMap((persona) => persona.needs.filter((n) => !n.met).map((need) => ({ persona, need })))
}
