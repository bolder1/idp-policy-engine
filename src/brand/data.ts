/* ---------------------------------------------------------------------------
   The model, kept as the current prototype has it.

   This is deliberately NOT the reworked engine from the other version. The
   brief for this pass is a brand and experience revamp with the existing
   functions left where they are, so the shape here mirrors what ships today:
   a policy contains ordered rules, rules are evaluated top to bottom, first
   match wins, and a pinned default rule catches the rest.
   --------------------------------------------------------------------------- */

export type PolicyType = 'App Access' | 'Session' | 'Account Management'

/* `monitor` is the framework doc's report-only, and it is the reason the two
   predicates below exist.

   Entra ships it as a first-class policy state and the doc lists it as an open
   question with its own answer already attached — "would meaningfully de-risk
   rollout and should be cheap if we design the PDP to log decisions
   regardless." It is also §6.4's migration mechanism: run the new engine
   alongside the old one, log both, flip when they agree.

   A monitor policy **evaluates and does not enforce.** That is one sentence and
   two different questions, which every surface in this console was previously
   answering with `status !== 'inactive'` — a test that silently counts a
   monitor policy as protection the moment the state exists. Hence: */
/* `draft` is not `inactive`, and the difference is the whole reason it exists.

   Inactive is a DECISION: this policy was published and somebody has since
   switched it off, which is a state an auditor can ask about. Draft is the
   absence of one — nobody has said anything about it yet. Both are off, and
   collapsing them was costing the list its most useful sort: a tenant with
   nine policies could not tell the two they had deliberately parked from the
   four somebody had started and abandoned.

   It enforces nothing and evaluates nothing, and it gets that for free from
   `enforces` below rather than from a rule of its own — the two predicates
   name the statuses that DO act, so a status that does not act needs no
   entry. */
export type PolicyStatus = 'draft' | 'active' | 'inactive' | 'monitor' | 'always-on'

/** Decides real sign-ins. The question Coverage, conflicts and cover-counts ask. */
export const enforces = (p: { status: PolicyStatus }) =>
  p.status === 'active' || p.status === 'always-on'

/** Runs and records what it would have done. Enforcing implies evaluating. */
export const evaluates = (p: { status: PolicyStatus }) => enforces(p) || p.status === 'monitor'

/* What the console calls "App Type", and it is NOT the protocol.

   The live page types its one row "Desktop" while naming it "Default API App",
   which does not parse as a protocol family — so this is a separate field and
   it deliberately does not track `protocol`. Slack, Zoom and Box are SAML and
   OIDC apps typed Desktop here.

   The vocabulary is borrowed rather than invented, and says so: `Desktop` is
   the only value ever observed on that page; the other two are lifted from the
   protocol filter on the add-application screen, which is a different control
   on a different page. Widen this union from that filter's list if a fixture
   needs more — never from imagination. */
export type AppType = 'SAML/WS-FED' | 'OAuth/OpenID' | 'Desktop'

export interface App {
  id: string
  name: string
  protocol: 'SAML' | 'OIDC'
  glyph: string
  tint: string
  type: AppType
  /* Pre-formatted, exactly as `Policy.lastModified` is two hundred lines down,
     and for the same reason: the console prints one shape, nothing here
     computes a second, so the fixture holds what the page shows.

     FABRICATED, and named as fabricated the way the `users` note is — there is
     no audit trail behind these timestamps. The FORMAT is real, taken from the
     live page ("Aug 14, 2026, 14:25:51"); the values are not. Anything that
     sorts on this must sort on the order the fixture states, not on a parse of
     the string. */
  lastUpdated: string
}

export interface Group {
  id: string
  name: string
  memberCount: number
}

// --- Conditions --------------------------------------------------------------

/* `Joiner` is deleted rather than renamed.

   There is no joiner in this model — the card IS the joiner. Keeping the name
   while changing the meaning is how half of ninety call sites get missed, so
   the type goes and every site that wanted one becomes a compile error. */

export interface ConditionType {
  id: string
  label: string
  group: string
  hint: string
  operators: string[]
  /** Where the value comes from: a library object, a fixed list, or free text. */
  valueKind: 'zone' | 'fingerprint' | 'hook' | 'group' | 'user' | 'list' | 'text' | 'range' | 'time'
  options?: string[]
  /* True when only an installed agent can read this.

     Not a preference — a hard limit on what the browser can see. A page cannot
     read a MAC address or an OS build number, so a rule that tests one on an
     agentless estate is not misconfigured, it is inert: the value never
     arrives, so it never matches. Marked on the attribute so the picker can say
     so before the row is added rather than after it never fires. */
  agent?: true
}

/* The nine major components the condition catalogue is organised by.

   The old picker's top level was the twenty-four types, with every zone and
   every fingerprint profile listed beside them as if each were its own
   condition. That put the CONTENTS of a library in the place where its NAME
   belongs — a zone is a value, "Network Zone" is the condition — and it meant
   the list grew every time somebody saved a zone. */
export const CONDITION_GROUPS = [
  'Network',
  'Location',
  'Time',
  'Device',
  'Risk',
  'User',
  'Group',
  'Custom attributes',
  'Webhooks',
] as const

/* The order the picker leads with, chosen rather than derived.

   Everything else in the catalogue is filed by component — Network, Location,
   Device — which is the right taxonomy for finding a thing you already know the
   name of, and the wrong one for the first row of a new rule. The question a
   rule opens with is nearly always "who is this for", and the answers to it sit
   in three different components.

   So these seven come first, in this order, above the categories. It is a
   stated order and not a usage statistic: nothing here counts clicks, and a
   list that reordered itself as people used it would move the row somebody was
   reaching for. */
export const CONDITION_ORDER = [
  'group',
  'user',
  'user-role',
  'user-attr',
  'group-attr',
  'zone',
  'webhook',
] as const

/** Where an id sits in the lead order, or past the end when it is not in it. */
export const conditionRank = (id: string) => {
  const i = (CONDITION_ORDER as readonly string[]).indexOf(id)
  return i === -1 ? CONDITION_ORDER.length : i
}

export const CONDITION_CATALOGUE: ConditionType[] = [
  /* One condition, four forms.

     The parameter sheet lists IPv4 single, IPv4 range, IPv4 CIDR and IPv6 range
     as four rows, and they are four ways of writing one thing rather than four
     decisions — the same argument that keeps VPN detection from being five
     dials. Each is a value this accepts, and the comment column's "multiple
     should be supported" is what makes it multi-valued rather than what makes
     it four conditions. */
  { id: 'ip', label: 'IP address', group: 'Network', hint: 'A single address, a range, a CIDR block, or IPv6', operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'zone', label: 'Network Zone', group: 'Network', hint: 'Match by named zone from your library', operators: ['in zone', 'not in zone'], valueKind: 'zone' },

  { id: 'country', label: 'Country', group: 'Location', hint: 'Match by country', operators: ['is', 'is not'], valueKind: 'list', options: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore'] },
  { id: 'state', label: 'State / Province', group: 'Location', hint: 'Match by state or region', operators: ['is', 'is not'], valueKind: 'list', options: ['Maharashtra', 'Karnataka', 'California', 'Texas'] },
  { id: 'city', label: 'City', group: 'Location', hint: 'Match by city', operators: ['is', 'is not'], valueKind: 'list', options: ['Pune', 'Bengaluru', 'London', 'Austin'] },
  { id: 'coords', label: 'Coordinates', group: 'Location', hint: 'Match within a geographic radius', operators: ['within'], valueKind: 'range' },

  { id: 'time', label: 'Time of day', group: 'Time', hint: 'A window in the tenant’s timezone', operators: ['between', 'not between'], valueKind: 'time' },
  /* Separate from the window, because they answer different questions and get
     asked separately: "office hours" is a time, "not at the weekend" is a day,
     and a rule usually wants one or the other rather than a single control that
     means both. */
  { id: 'day', label: 'Day of week', group: 'Time', hint: 'Match particular days', operators: ['is', 'is not'], valueKind: 'list', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },

  { id: 'device-type', label: 'Device Type', group: 'Device', hint: 'Mobile, PC, tablet, etc.', operators: ['is', 'is not'], valueKind: 'list', options: ['Mobile', 'PC', 'Tablet', 'Other'] },
  { id: 'mac', label: 'MAC address', group: 'Device', hint: 'Match device MAC addresses', operators: ['is', 'is not'], valueKind: 'text', agent: true },
  { id: 'os', label: 'Operating system', group: 'Device', hint: 'Match OS name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'ChromeOS'], agent: true },
  { id: 'mdm', label: 'MDM Managed', group: 'Device', hint: 'Require MDM enrollment', operators: ['is', 'is not'], valueKind: 'list', options: ['Enrolled', 'Not enrolled'] },
  { id: 'browser', label: 'Browser', group: 'Device', hint: 'Match browser name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Chrome', 'Edge', 'Safari', 'Firefox'] },
  { id: 'device-risk', label: 'Device Risk Score', group: 'Risk', hint: 'Device risk management score', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'ml-risk', label: 'ML Risk Score', group: 'Risk', hint: 'AI-derived overall risk score', operators: ['is', 'is not'], valueKind: 'list', options: ['Low', 'Medium', 'High'] },
  { id: 'device-count', label: 'Number of Devices', group: 'Device', hint: 'Limit registered devices per user', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'device-reg', label: 'Device Registration', group: 'Device', hint: 'Registered, pending, or unregistered', operators: ['is', 'is not'], valueKind: 'list', options: ['Registered', 'Pending', 'Unregistered'] },
  /* Replaced the old Device Posture Policy condition. Posture asked whether a
     device was healthy; this asks whether it is the same device as last time,
     which is what the fingerprint profiles actually decide. */
  { id: 'fingerprint', label: 'Device fingerprint', group: 'Device', hint: 'Match by saved fingerprint profile from your library', operators: ['recognised by', 'not recognised by'], valueKind: 'fingerprint' },
  /* Posture is back, and it is not the fingerprint.

     It was removed once, on the argument that "posture asked whether a device
     was healthy, which is a different question from whether it is the same
     device". That argument was right and it is the reason these are two
     attributes rather than one: the fingerprint says it is the same handset,
     posture says the handset is in a state you are willing to accept. A
     recognised device with disk encryption switched off is both. */
  { id: 'posture', label: 'Device posture', group: 'Device', hint: 'Checks an MDM reports about the device’s state', operators: ['passes', 'fails'], valueKind: 'list', options: ['Disk encryption', 'Screen lock', 'OS up to date', 'Antivirus running', 'Firewall on'], agent: true },

  { id: 'group', label: 'Group Membership', group: 'Group', hint: "Match by the user's group", operators: ['in', 'not in'], valueKind: 'group' },
  { id: 'user', label: 'Specific people', group: 'User', hint: 'Match named individuals from the directory', operators: ['is', 'is not'], valueKind: 'user' },
  { id: 'user-type', label: 'User Type', group: 'User', hint: 'Employee, contractor, or partner', operators: ['is', 'is not'], valueKind: 'list', options: ['Employee', 'Contractor', 'Partner'] },
  { id: 'user-role', label: 'User Role', group: 'User', hint: 'Match by assigned user role', operators: ['is', 'is not'], valueKind: 'list', options: ['Admin', 'Manager', 'Member', 'Auditor'] },
  { id: 'auth-state', label: 'Auth State', group: 'User', hint: 'First login, MFA reset, preferred method', operators: ['is'], valueKind: 'list', options: ['First time login', 'MFA recently reset', 'No MFA configured', 'Normal returning user'] },
  { id: 'trust-age', label: 'Device Trust Age', group: 'User', hint: 'Known device trust duration', operators: ['under', 'over'], valueKind: 'range' },

  { id: 'group-attr', label: 'Group Attribute', group: 'Group', hint: "Match by group's custom attributes", operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'user-attr', label: 'User Attribute', group: 'Custom attributes', hint: 'Match email, designation, age, and more', operators: ['is', 'is not', 'contains'], valueKind: 'text' },
  /* Was a free-text box. It is now a reference to a Hook, for the same reason
     the network condition references a Zone rather than carrying a CIDR: every
     rule that consults the fraud service consults the same fraud service, and
     an endpoint written into each condition makes rotating a URL an audit of
     every policy in the tenant. See hooks.ts. */
  { id: 'webhook', label: 'External hook', group: 'Webhooks', hint: 'Ask an external endpoint, and use its answer as a condition', operators: ['returns true', 'returns false'], valueKind: 'hook' },
]

export function conditionType(id: string): ConditionType {
  return CONDITION_CATALOGUE.find((c) => c.id === id) ?? CONDITION_CATALOGUE[0]
}

/* Which half of a zone a condition tests.

   A zone has two sections and they are ANDed — the network half (addresses,
   CIDR blocks, ASNs) and the geographic half (countries, states, cities, a
   radius). "Reliance Jio · India" is inside neither alone. So a rule that says
   "in zone X" has always had a third thing to say that it could not: whether it
   means the whole zone, or only where the request came from on the network, or
   only where it came from on the map.

   `undefined` is BOTH, and that is the only correct default: a zone means the
   conjunction of its halves, so a condition that says nothing extra must mean
   the zone as written. Absent rather than a stored `'both'` because every dirty
   check in this app is a `JSON.stringify` comparison — materialising the
   default would light the save bar on every rule anybody opened. */
export type ZoneScope = 'ip' | 'location'

export const ZONE_SCOPE_LABEL: Record<'both' | ZoneScope, string> = {
  both: 'IP and location',
  ip: 'IP networks only',
  location: 'Locations only',
}

/** A single predicate. `values: []` means UNSET — a first-class, diagnosable state. */
export interface Condition {
  id: string
  typeId: string
  operator: string
  values: string[]
  /* Which half of the named zones to test. Zone conditions only; absent = both.

     It lives on the CONDITION rather than on the zone because it is a property
     of this rule's question, not of the zone: the same "Reliance Jio · India"
     is asked about as a network by one rule and as a place by another, and
     storing the answer on the zone would make one rule's narrowing silently
     rewrite the other's. */
  scope?: ZoneScope
}

/* An AND-set, and the unit of grouping.

   Never empty: removing the last condition removes the card. That invariant is
   what makes `cards.length === 1` a sound test for "this rule is one unbroken
   run of ANDs", which is the sentence the whole linter is built on. */
/* How a run of things is joined. Two levels carry one, and both default to
   what the model meant before they existed — a card is an AND-run, and cards
   are alternatives — so every seeded rule keeps its exact meaning and nothing
   written against the old shape has to change. */
export type Joiner = 'and' | 'or'

export interface ConditionCard {
  id: string
  /** The author's name for this alternative — "Corp laptops". Optional. */
  label?: string
  /** How THIS card's own conditions are joined. Defaults to 'and'. */
  join?: Joiner
  /* Whether the AUTHOR made this a group, as opposed to it merely being a
     second alternative the model happens to hold.

     Presentation only — nothing in the evaluator, the linter or the simulator
     reads it, and a rule means exactly the same thing with it set or unset.
     It exists because the two states look identical in the model and are not
     the same thing to the person who wrote the rule: conditions typed one after
     another are independent, and a group is a bracket somebody asked for. Drawn
     without this, adding a group put a frame around the conditions that were
     already there, which is precisely the thing they had not done. */
  grouped?: boolean
  conditions: Condition[]
}

/* A rule's WHEN: a disjunction of cards, exactly two levels, forever.

     match ⟺ cards.length === 0 || cards.some(k => k.conditions.every(pass))

   `cards: []` is the catch-all. It replaces every `conditions.length === 0`
   test the codebase used to make. See predicate.ts for the reasoning. */
export interface Predicate {
  cards: ConditionCard[]
  /** How the cards are joined to each other. Defaults to 'or'. */
  join?: Joiner
}

// --- Rules -------------------------------------------------------------------

export type AccessDecision = 'deny' | '1fa' | '2fa'

export const DECISION_LABEL: Record<AccessDecision, string> = {
  deny: 'Deny',
  '1fa': '1 factor',
  '2fa': '2 factors',
}

export const DECISION_CAPTION: Record<AccessDecision, string> = {
  deny: 'Block access',
  '1fa': 'One step',
  '2fa': 'Two steps',
}

export interface Rule {
  id: string
  name: string
  /* `description` has gone from a rule.

     It was an optional sentence under the name - "what is this for? a
     regulator, an incident, an audit finding" - and it earned its place while
     the panel had room for it. It does not now: the panel asks two questions,
     and the note was the largest control above both of them, present on every
     rule and filled on almost none.

     The rationale it carried has a better home than a free-text box nobody
     fills: the rule's NAME, which every surface already prints. */
  enabled: boolean
  /* The audience used to live here, as `appliesTo: string[]`.

     It has moved to the policy. Audience is a standing fact about who a policy
     governs, not a per-rule predicate — the shipping product agrees, binding an
     application to a user group one level above the adaptive policy — and
     holding it per rule let a policy build "rule 1 covers Finance, rule 2
     covers everyone", which reads as a scoped policy and is not one.

     Narrowing INSIDE a policy is still expressible, and now says so: it is a
     `group` or `user-type` condition in the rule's WHEN, evaluated like every
     other condition instead of being a second, invisible gate. */
  when: Predicate
  decision: AccessDecision
  firstFactor: 'Password' | 'Any' | 'Specific'
  /** Which method, when firstFactor is 'Specific'. */
  firstFactorMethod?: string
  secondFactor: 'any' | 'specific' | 'chain' | 'preferred'
  /** Chosen methods, when secondFactor is 'specific'. */
  secondFactorMethods?: string[]
  /** Ordered steps, when secondFactor is 'chain'. */
  methodChain?: string[]
  /** Fallback method, when secondFactor is 'preferred' and the user set none. */
  preferredFallback?: string
  rememberMfa: boolean
  /** How long a remembered device stays trusted. */
  rememberDays?: number
  /** Prompt for MFA every login even on a remembered device. */
  forceMfaEachLogin?: boolean
  allowDisable2fa: boolean
  /** Rough population the rule matches — shown live while editing. */
  matchEstimate: number
}

/* Who a policy governs.

   `everyone` is a flag rather than a magic id in `groupIds`: a synthetic "All
   Employees" row living in the same list as real groups is a row you can tick
   alongside Finance, and "All AND Finance" reads narrower than it is. As a flag
   the contradiction cannot be typed. */
export interface Audience {
  everyone: boolean
  groupIds: string[]
  /* Named individuals, alongside groups rather than instead of them. A person
     already inside a selected group is legal and sometimes deliberate — an
     exception you want to survive someone editing the group — so this is a
     union, and the picker says when a name is redundant rather than refusing it. */
  userIds: string[]
}

export const EVERYONE: Audience = { everyone: true, groupIds: [], userIds: [] }

/* The one policy that is not bound to an application.

   `allApps` used to be a flag any policy could set, which let a tenant hold
   several policies each claiming every app with nothing to say which won. It is
   gone. The only thing that applies everywhere is the tenant's own default —
   already marked as the system policy, so this is derived from that mark and
   cannot drift from it. */
export const coversEveryApp = (p: Policy): boolean => p.isSystem === true

export const audienceOf = (groupIds: string[], userIds: string[] = []): Audience => ({
  everyone: false,
  groupIds,
  userIds,
})

export interface User {
  id: string
  name: string
  email: string
  groupId: string
  userType: 'Employee' | 'Contractor' | 'Partner'
  role: string
}

export interface Policy {
  id: string
  name: string
  type: PolicyType
  /* The one application this policy protects.

     It was `appIds: string[]` with an `allApps` flag beside it, and neither is
     a thing this product does. A policy is written against an application —
     that is what makes "Finance Team – High Security" a sentence rather than a
     folder — and one covering three of them could not be reasoned about: its
     name described one, its audience described the union, and the coverage grid
     drew it three times as if three separate decisions had been made.

     Optional, for the two cases that genuinely have no application: a policy
     before one is chosen, and the tenant's own default, which applies wherever
     no app-specific policy does. */
  appId?: string
  /** Who this policy governs. Every rule inherits it; no rule can be broader. */
  audience: Audience
  /* What happens to a sign-in that matched no rule — as a RULE.

     This was hardcoded to `1fa` in the evaluator, then a bare `AccessDecision`
     edited from a three-item menu. Both were wrong about what it is. The last
     row of a policy decides sign-ins, has an outcome, and is reached in order:
     it IS a rule, whose condition happens to be "everything above missed".

     As a bare decision it was the one outcome in the whole builder that could
     not carry a second factor, a first-factor choice, a method chain or a
     remember-device window — so "everyone else gets in with a password" was
     expressible and "…with a password and a second factor" was not.

     Three things about it stay fixed: its name, its place at the bottom, and
     the fact that it exists. Every ordered list needs a terminal, and an engine
     that falls off the end of one has to do something. */
  fallback?: Rule
  status: PolicyStatus
  lastModified: string
  modifiedBy: string
  rules: Rule[]
  /** The current prototype shows a red dot with no explanation; here it says why. */
  configIssue?: string
  isSystem?: boolean
}

// --- Library objects ---------------------------------------------------------

/* One zone type, two optional sections, combined with AND.

   The old model made the administrator pick a kind up front — IP or Geo or ASN —
   which forced "Reliance Jio, but only inside India" to be two zones that could
   not be intersected. A single zone with two sections expresses it directly.

   An empty section means MATCH ANY, not match none. That is the whole subtlety
   of the model and the reason the UI says "Any location" rather than leaving a
   field blank: blank reads as unset, and unset reads as restrictive, which is
   the opposite of what it does. */
export interface ZoneLocation {
  countries: string[]
  states: string[]
  cities: string[]
  /** A circle on the map, for sites without a clean administrative boundary. */
  radius?: { km: number; lat: number; lon: number; label?: string }
}

/* What a zone is *for*. A zone is only a boundary — it says where a request
   came from, not what to do about it — but in practice every one is written
   with an intention, and leaving that intention unrecorded meant a list of
   zones read as a list of undifferentiated address blocks. Naming it lets the
   list group, and lets a rule-writer see whether a zone is somewhere you trust
   or somewhere you do not before opening it. */
export type ZoneKind = 'allowed' | 'blocked' | 'custom'

export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  /** IPv4/IPv6 addresses, CIDR blocks, and ranges. */
  ip: string[]
  /** Autonomous System Numbers — a whole network operator at once. */
  asn: string[]
  location: ZoneLocation
  /* A zone's SHAPE is derived, never stored — `shapeOf` in the zones screen
     reads it off the two halves. A `matchOn` field stood here for the second
     design, which asked the question up front instead; it went with that
     design, because a stored kind sitting beside a derived shape is exactly the
     drift the derivation exists to avoid. */
  usedIn: number
  /* The two defaults ship with the tenant and every rule can assume they
     exist, so they are editable but not removable. Deleting them would break
     that assumption for every policy written after them. */
  locked?: boolean
}

export const emptyLocation = (): ZoneLocation => ({ countries: [], states: [], cities: [] })

/** True when the section places no constraint, i.e. it matches anything. */
export const ipSectionEmpty = (z: Zone) => z.ip.length === 0 && z.asn.length === 0
export const locationEmpty = (l: ZoneLocation) =>
  l.countries.length === 0 && l.states.length === 0 && l.cities.length === 0 && !l.radius

export interface MethodSet {
  id: string
  name: string
  /* Why this set exists, in the author's words.

     Not decoration. A set is referenced from a rule by name alone, so the
     next administrator sees "Phishing-resistant only" and has to infer both
     what is in it and when to reach for it. One sentence at the point of
     authoring is the cheapest way to stop a second, nearly-identical set being
     created six months later by someone who could not tell what this one was
     for. */
  description?: string
  /** Method names from AUTH_METHODS — never variant names. */
  methods: string[]
  usedIn: number
}

export interface Template {
  id: string
  name: string
  category: 'Quick Protection' | 'Device-based' | 'Risk-based' | 'Compliance' | 'Uncategorized'
  description: string
  ruleCount: number
  author: string
  when: string
  provided?: boolean
  /** Same dated attribution as Scenario — see the note there. */
  reviewed?: { by: string; on: string }
  rules: { name: string; ifText: string; decision: AccessDecision }[]
}

// --- Seed --------------------------------------------------------------------

export const apps: App[] = [
  { id: 'salesforce', name: 'Salesforce', protocol: 'SAML', glyph: '☁', tint: '#199fd8', type: 'SAML/WS-FED', lastUpdated: 'Aug 14, 2026, 14:25:51' },
  { id: 'workday', name: 'Workday', protocol: 'SAML', glyph: '▲', tint: '#f5a623', type: 'SAML/WS-FED', lastUpdated: 'Aug 02, 2026, 09:11:04' },
  { id: 'github', name: 'GitHub Enterprise', protocol: 'OIDC', glyph: '◐', tint: '#24292e', type: 'OAuth/OpenID', lastUpdated: 'Jul 28, 2026, 17:40:22' },
  { id: 'm365', name: 'Microsoft 365', protocol: 'SAML', glyph: '▦', tint: '#e14c2a', type: 'SAML/WS-FED', lastUpdated: 'Aug 21, 2026, 11:03:47' },
  { id: 'jira', name: 'Jira', protocol: 'OIDC', glyph: '◆', tint: '#2684ff', type: 'OAuth/OpenID', lastUpdated: 'Jun 09, 2026, 08:52:19' },
  { id: 'slack', name: 'Slack', protocol: 'SAML', glyph: '✳', tint: '#611f69', type: 'Desktop', lastUpdated: 'Aug 30, 2026, 16:18:35' },
  { id: 'aws', name: 'AWS Console', protocol: 'SAML', glyph: '◢', tint: '#ff9900', type: 'SAML/WS-FED', lastUpdated: 'May 17, 2026, 13:07:58' },
  { id: 'zoom', name: 'Zoom', protocol: 'SAML', glyph: '▣', tint: '#2d8cff', type: 'Desktop', lastUpdated: 'Jul 03, 2026, 10:44:12' },
  { id: 'box', name: 'Box', protocol: 'OIDC', glyph: '▢', tint: '#0061d5', type: 'Desktop', lastUpdated: 'Apr 26, 2026, 15:29:06' },
  { id: 'servicenow', name: 'ServiceNow', protocol: 'SAML', glyph: '◉', tint: '#62d84e', type: 'SAML/WS-FED', lastUpdated: 'Sep 01, 2026, 07:33:41' },

  /* --- The applications the use-case document names --------------------------

     `ruleset-usecase-scenarios.md` describes twenty-three policies against
     twenty-one applications, and ten of them were the whole app list. Seeding
     the scenarios against the nearest existing app was the alternative and it
     is worse than it sounds: half of them have no near neighbour — there is no
     wiki, no CRM, no ERP, no vault, no PAM gateway — so "Trading Platform"
     would have been written against Salesforce and the policy's name would
     have stopped describing the thing it protects. A scenario whose app is a
     stand-in cannot be read as the scenario.

     Fabricated exactly as the ten above are: the FORMAT of `lastUpdated` is the
     live console's, the values are not, and nothing may sort on a parse of it.
     Protocol and type follow the class of product — an internal portal behind
     the IdP is SAML, a modern SaaS console is OIDC, a desktop client is
     Desktop. Tints are the vendors' own where a vendor exists and a neutral
     slate where the app is a generic internal one, because a made-up brand
     colour on a made-up product is detail pretending to be data. */
  { id: 'hr-portal', name: 'Internal HR Portal', protocol: 'SAML', glyph: '▤', tint: '#4b6bfb', type: 'SAML/WS-FED', lastUpdated: 'Aug 19, 2026, 10:22:13' },
  { id: 'finance-dashboard', name: 'Finance Dashboard', protocol: 'SAML', glyph: '▦', tint: '#0f9d7a', type: 'SAML/WS-FED', lastUpdated: 'Aug 27, 2026, 08:41:55' },
  { id: 'google-workspace', name: 'Google Workspace', protocol: 'SAML', glyph: '◍', tint: '#4285f4', type: 'SAML/WS-FED', lastUpdated: 'Aug 25, 2026, 12:09:38' },
  { id: 'corporate-email', name: 'Corporate Email', protocol: 'SAML', glyph: '✉', tint: '#d93025', type: 'SAML/WS-FED', lastUpdated: 'Aug 29, 2026, 15:52:07' },
  { id: 'vpn-portal', name: 'VPN Portal', protocol: 'SAML', glyph: '⛨', tint: '#5b6470', type: 'SAML/WS-FED', lastUpdated: 'Aug 11, 2026, 07:14:46' },
  { id: 'admin-console', name: 'Admin Console', protocol: 'OIDC', glyph: '⚙', tint: '#8a5cf6', type: 'OAuth/OpenID', lastUpdated: 'Sep 02, 2026, 09:30:11' },
  { id: 'payroll', name: 'Payroll System', protocol: 'SAML', glyph: '₹', tint: '#c2410c', type: 'SAML/WS-FED', lastUpdated: 'Aug 06, 2026, 16:47:29' },
  { id: 'wiki', name: 'Internal Wiki', protocol: 'OIDC', glyph: '▨', tint: '#0891b2', type: 'OAuth/OpenID', lastUpdated: 'Jul 22, 2026, 11:35:02' },
  { id: 'crm', name: 'Customer Database', protocol: 'OIDC', glyph: '◫', tint: '#0369a1', type: 'OAuth/OpenID', lastUpdated: 'Aug 18, 2026, 14:03:50' },
  { id: 'trading', name: 'Trading Platform', protocol: 'SAML', glyph: '◭', tint: '#15803d', type: 'SAML/WS-FED', lastUpdated: 'Sep 03, 2026, 06:58:24' },
  { id: 'erp', name: 'ERP System', protocol: 'SAML', glyph: '▩', tint: '#7c3aed', type: 'SAML/WS-FED', lastUpdated: 'Aug 15, 2026, 13:26:40' },
  { id: 'dms', name: 'Document Management', protocol: 'OIDC', glyph: '▧', tint: '#b45309', type: 'OAuth/OpenID', lastUpdated: 'Aug 31, 2026, 17:12:33' },
  { id: 'pam', name: 'Privileged Access Gateway', protocol: 'SAML', glyph: '⛭', tint: '#b91c1c', type: 'SAML/WS-FED', lastUpdated: 'Sep 04, 2026, 08:05:19' },
  { id: 'monitoring', name: 'Production Monitoring', protocol: 'OIDC', glyph: '◠', tint: '#ea580c', type: 'OAuth/OpenID', lastUpdated: 'Aug 23, 2026, 20:44:57' },
  { id: 'knowledge-base', name: 'Internal Knowledge Base', protocol: 'OIDC', glyph: '▥', tint: '#0d9488', type: 'OAuth/OpenID', lastUpdated: 'Jul 30, 2026, 09:19:15' },
  { id: 'vault', name: 'Legal Document Vault', protocol: 'SAML', glyph: '⛁', tint: '#334155', type: 'SAML/WS-FED', lastUpdated: 'Sep 05, 2026, 11:41:08' },
]

/* The synthetic `all` row is gone.

   "All Employees" was a group id sitting in the same list as Finance and
   Engineering, which meant a picker could tick both and build "All AND
   Finance" — a selection that reads narrower than it is. Everyone is now a
   flag on `Audience`, so the contradiction cannot be expressed. */
export const groups: Group[] = [
  { id: 'finance', name: 'Finance', memberCount: 86 },
  { id: 'engineering', name: 'Engineering', memberCount: 310 },
  { id: 'executives', name: 'Executives', memberCount: 12 },
  { id: 'contractors', name: 'Contractors', memberCount: 154 },
  { id: 'it-admins', name: 'IT Admins', memberCount: 9 },

  /* --- The groups the use-case document targets ------------------------------

     Five groups could not carry twenty-three scenarios: the document assigns
     policies to Employees, Accounts, DevOps, Support, Traders and a dozen more,
     and mapping each onto the nearest of the five would have made most of them
     the same policy written six times. `Notice-Period` is not `Contractors`.

     Counts are stated rather than derived and they add up deliberately:
     `employees` is the broad population at 1,180 of the tenant's 1,240, and the
     departmental groups are subsets of it rather than a partition — a person is
     in Employees AND Engineering, which is the shape the document's own
     multi-group collision finding (#1) depends on being possible. */
  { id: 'employees', name: 'Employees', memberCount: 1180 },
  { id: 'accounts', name: 'Accounts', memberCount: 34 },
  { id: 'admin', name: 'Admin', memberCount: 6 },
  { id: 'devops', name: 'DevOps', memberCount: 28 },
  { id: 'end-users', name: 'End-Users', memberCount: 1042 },
  { id: 'support', name: 'Support', memberCount: 72 },
  { id: 'traders', name: 'Traders', memberCount: 41 },
  { id: 'global-ops', name: 'Global-Operations', memberCount: 217 },
  { id: 'legal', name: 'Legal-Department', memberCount: 19 },
  { id: 'privileged', name: 'Privileged-Users', memberCount: 14 },

  /* Temporary by design, and the document says so: notice-period and travel
     memberships must be removed by the provisioning system on a date (finding
     #9), and a break-glass group holds two accounts on purpose so that one dead
     war-room terminal does not lock the tenant out (S16). Small counts here are
     the fixture agreeing with that, not a shortage of invention. */
  { id: 'acquired', name: 'Acquired-Co-Employees', memberCount: 128 },
  { id: 'notice-period', name: 'Notice-Period', memberCount: 3 },
  { id: 'japan-travel', name: 'Japan-Travel', memberCount: 1 },
  { id: 'break-glass', name: 'Break-Glass Accounts', memberCount: 2 },

  /* --- Two groups that are never a target ------------------------------------

     `On-Call` and `Matter-Acme-Litigation` exist to be read by a `group`
     CONDITION inside a rule, which is the distinction the document draws in
     finding #15: a fast-rotating operational group belongs in a condition,
     because targeting it would mean re-assigning a policy on every rotation,
     and a matter group belongs in a condition because membership of it is what
     the rule is asking about rather than which rule applies.

     Nothing in this fixture marks them as condition-only. That is the gap, not
     an omission: the model has no way to say "this group is not an assignment
     target", so the audience picker will offer both. */
  { id: 'on-call', name: 'On-Call', memberCount: 4 },
  { id: 'matter-acme', name: 'Matter-Acme-Litigation', memberCount: 7 },
]

/** Everyone the tenant claims, for the audience readout. */
export const HEADCOUNT_ALL = 1240

/* ---------------------------------------------------------------------------
   The directory. FABRICATED.

   There was no user directory in this prototype before this pass — no `User`
   type, no list, nothing on the store. The only people anywhere were the four
   simulator fixtures in simulate.ts. A policy audience that can name
   individuals needs a directory to name them from, so here is one.

   The four simulator people keep their identities and lead their groups, so
   the person you test a policy against is a row in the same directory you
   scoped it with, rather than a parallel universe. Everyone else is invented.

   Twenty-four named people against a tenant that claims 1,240: the pickers say
   so rather than pretending the list is complete. Generating 1,240 rows nobody
   will scroll would make the fixture look like data.
   --------------------------------------------------------------------------- */
export const users: User[] = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com', groupId: 'finance', userType: 'Employee', role: 'Member' },
  { id: 'u-fin-2', name: 'Rohan Kulkarni', email: 'rohan.k@mo.com', groupId: 'finance', userType: 'Employee', role: 'Manager' },
  { id: 'u-fin-3', name: 'Anita Desai', email: 'anita.d@mo.com', groupId: 'finance', userType: 'Employee', role: 'Member' },
  { id: 'u-fin-4', name: 'Thomas Byrne', email: 'thomas.b@mo.com', groupId: 'finance', userType: 'Employee', role: 'Auditor' },
  { id: 'u-fin-5', name: 'Leena Iyer', email: 'leena.i@mo.com', groupId: 'finance', userType: 'Employee', role: 'Member' },

  { id: 'arun', name: 'Arun Patel', email: 'arun@mo.com', groupId: 'engineering', userType: 'Employee', role: 'Member' },
  { id: 'u-eng-2', name: 'Sofia Marchetti', email: 'sofia.m@mo.com', groupId: 'engineering', userType: 'Employee', role: 'Manager' },
  { id: 'u-eng-3', name: 'Kenji Watanabe', email: 'kenji.w@mo.com', groupId: 'engineering', userType: 'Employee', role: 'Member' },
  { id: 'u-eng-4', name: 'Grace Oyelaran', email: 'grace.o@mo.com', groupId: 'engineering', userType: 'Employee', role: 'Member' },
  { id: 'u-eng-5', name: 'Daniel Fischer', email: 'daniel.f@mo.com', groupId: 'engineering', userType: 'Employee', role: 'Member' },

  { id: 'mehak', name: 'Mehak Garg', email: 'mehak@mo.com', groupId: 'executives', userType: 'Employee', role: 'Admin' },
  { id: 'u-exec-2', name: 'Vikram Nair', email: 'vikram.n@mo.com', groupId: 'executives', userType: 'Employee', role: 'Admin' },
  { id: 'u-exec-3', name: 'Helen Osei', email: 'helen.o@mo.com', groupId: 'executives', userType: 'Employee', role: 'Manager' },
  { id: 'u-exec-4', name: 'Marco Silveira', email: 'marco.s@mo.com', groupId: 'executives', userType: 'Employee', role: 'Manager' },

  { id: 'devon', name: 'Devon Rao', email: 'devon@ext.com', groupId: 'contractors', userType: 'Contractor', role: 'Member' },
  { id: 'u-con-2', name: 'Ivy Zhang', email: 'ivy.z@ext.com', groupId: 'contractors', userType: 'Contractor', role: 'Member' },
  { id: 'u-con-3', name: 'Peter Ahlgren', email: 'peter.a@ext.com', groupId: 'contractors', userType: 'Contractor', role: 'Member' },
  { id: 'u-con-4', name: 'Nadia Haddad', email: 'nadia.h@ext.com', groupId: 'contractors', userType: 'Partner', role: 'Member' },
  { id: 'u-con-5', name: 'Sam Okonkwo', email: 'sam.o@ext.com', groupId: 'contractors', userType: 'Contractor', role: 'Member' },

  { id: 'u-it-1', name: 'Ravi Menon', email: 'ravi.m@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Admin' },
  { id: 'u-it-2', name: 'Clara Boucher', email: 'clara.b@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Admin' },
  { id: 'u-it-3', name: 'Yusuf Demir', email: 'yusuf.d@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Admin' },
  { id: 'u-it-4', name: 'Bethany Cole', email: 'bethany.c@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Auditor' },
  { id: 'u-it-5', name: 'Omar Haddadi', email: 'omar.h@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Member' },

  /* --- The four people the use-case document names ---------------------------

     Every other person here is invented to fill a group. These four are named
     in the scenarios themselves and each is named because a rule singles them
     out: the CFO who may sign in from anywhere with two factors (S9), the
     break-glass account that exists for the day the MFA provider is down (S16),
     the developer serving a notice period (S17), and the VP travelling to Japan
     (S18).

     Their addresses are the document's own — `@acme.com`, not this fixture's
     `@mo.com` — deliberately. The scenarios write `Primary email =
     'cfo@acme.com'` as a literal, and a rule whose stated value matches nobody
     in the directory is a rule that reads as configured and fires never. If the
     tenant's domain changes, both have to change together, which is exactly the
     fragility the document's finding #13 is about. */
  /* --- Members for the groups the scenarios target ---------------------------

     Fifteen groups arrived with the use-case document and thirteen of them had
     nobody in them, which is worse than it sounds: `reach()` counts directory
     rows, the audience picker prints that count, and the simulator picks a
     person to test against. A policy assigned to `devops` with an empty
     `devops` was a policy that read as configured and could be tested against
     nobody — the same failure mode as a condition that never evaluates, one
     level up.

     Two or three each, not the `memberCount` on the group. That number is the
     tenant's claim and this list is a sample of it — the file already says so
     above, and `unlistedUsers` is what the pickers print. Matching 1,180 rows
     for Employees would make the fixture look like data.

     `groupId` is singular, so each person is in exactly one group. That is the
     model's limit and it is a real one: Scenario 21's whole point is an
     engineer who is ALSO on the on-call rotation, and Scenario 23 needs a
     lawyer who is also assigned to a matter. Neither is expressible, so the
     `on-call` and `matter-acme` rows below hold people who are ONLY that —
     which is not what either scenario describes. See the gap register, G8. */
  { id: 'u-emp-1', name: 'Sanjay Bhatt', email: 'sanjay.b@mo.com', groupId: 'employees', userType: 'Employee', role: 'Member' },
  { id: 'u-emp-2', name: 'Hannah Lowe', email: 'hannah.l@mo.com', groupId: 'employees', userType: 'Employee', role: 'Member' },
  { id: 'u-emp-3', name: 'Ifeoma Nwosu', email: 'ifeoma.n@mo.com', groupId: 'employees', userType: 'Employee', role: 'Member' },

  { id: 'u-acc-1', name: 'Deepa Nair', email: 'deepa.n@mo.com', groupId: 'accounts', userType: 'Employee', role: 'Member' },
  { id: 'u-acc-2', name: 'Marco Bianchi', email: 'marco.b@mo.com', groupId: 'accounts', userType: 'Employee', role: 'Auditor' },

  { id: 'u-adm-1', name: 'Karan Malhotra', email: 'karan.m@mo.com', groupId: 'admin', userType: 'Employee', role: 'Admin' },
  { id: 'u-adm-2', name: 'Sofia Almeida', email: 'sofia.a@mo.com', groupId: 'admin', userType: 'Employee', role: 'Admin' },

  { id: 'u-dev-1', name: 'Arjun Pillai', email: 'arjun.p@mo.com', groupId: 'devops', userType: 'Employee', role: 'Admin' },
  { id: 'u-dev-2', name: 'Nadia Haddad', email: 'nadia.h@mo.com', groupId: 'devops', userType: 'Employee', role: 'Member' },
  { id: 'u-dev-3', name: 'Tom Whelan', email: 'tom.w@mo.com', groupId: 'devops', userType: 'Employee', role: 'Member' },

  { id: 'u-eu-1', name: 'Ritika Joshi', email: 'ritika.j@mo.com', groupId: 'end-users', userType: 'Employee', role: 'Member' },
  { id: 'u-eu-2', name: 'Daniel Osei', email: 'daniel.o@mo.com', groupId: 'end-users', userType: 'Employee', role: 'Member' },

  { id: 'u-sup-1', name: 'Farhan Qureshi', email: 'farhan.q@mo.com', groupId: 'support', userType: 'Employee', role: 'Member' },
  { id: 'u-sup-2', name: 'Grace Okafor', email: 'grace.o@mo.com', groupId: 'support', userType: 'Employee', role: 'Member' },

  { id: 'u-trd-1', name: 'Vikram Shetty', email: 'vikram.s@mo.com', groupId: 'traders', userType: 'Employee', role: 'Member' },
  { id: 'u-trd-2', name: 'Elena Petrova', email: 'elena.p@mo.com', groupId: 'traders', userType: 'Employee', role: 'Member' },

  { id: 'u-glo-1', name: 'Lars Andersen', email: 'lars.a@mo.com', groupId: 'global-ops', userType: 'Employee', role: 'Manager' },
  { id: 'u-glo-2', name: 'Sneha Rao', email: 'sneha.r@mo.com', groupId: 'global-ops', userType: 'Employee', role: 'Member' },
  { id: 'u-glo-3', name: 'Miguel Santos', email: 'miguel.s@mo.com', groupId: 'global-ops', userType: 'Employee', role: 'Member' },

  { id: 'u-leg-1', name: 'Anjali Verma', email: 'anjali.v@mo.com', groupId: 'legal', userType: 'Employee', role: 'Manager' },
  { id: 'u-leg-2', name: 'Peter Halloran', email: 'peter.h@mo.com', groupId: 'legal', userType: 'Employee', role: 'Member' },

  { id: 'u-prv-1', name: 'Rajesh Kannan', email: 'rajesh.k@mo.com', groupId: 'privileged', userType: 'Employee', role: 'Admin' },
  { id: 'u-prv-2', name: 'Ingrid Volkov', email: 'ingrid.v@mo.com', groupId: 'privileged', userType: 'Employee', role: 'Admin' },

  /* Contractors of the acquired company, which is why they are `Contractor`
     during the integration window rather than `Employee` — Scenario 15 gates
     them on a legacy HR system precisely because our own directory does not
     vouch for them yet. */
  { id: 'u-acq-1', name: 'Bilal Rehman', email: 'bilal.r@acquired.example', groupId: 'acquired', userType: 'Contractor', role: 'Member' },
  { id: 'u-acq-2', name: 'Julia Kowalski', email: 'julia.k@acquired.example', groupId: 'acquired', userType: 'Contractor', role: 'Member' },

  { id: 'u-bg-2', name: 'Break-glass Secondary', email: 'breakglass2@acme.com', groupId: 'break-glass', userType: 'Employee', role: 'Admin' },

  /* Only-on-call and only-on-the-matter, which neither scenario means. See the
     note above. */
  { id: 'u-oncall-1', name: 'Nikhil Rane', email: 'nikhil.r@mo.com', groupId: 'on-call', userType: 'Employee', role: 'Member' },
  { id: 'u-oncall-2', name: 'Aoife Byrne', email: 'aoife.b@mo.com', groupId: 'on-call', userType: 'Employee', role: 'Member' },

  { id: 'u-matter-1', name: 'Rohit Sethi', email: 'rohit.s@mo.com', groupId: 'matter-acme', userType: 'Employee', role: 'Member' },
  { id: 'u-matter-2', name: 'Claire Dubois', email: 'claire.d@mo.com', groupId: 'matter-acme', userType: 'Employee', role: 'Member' },

  { id: 'u-cfo', name: 'Meera Raghavan', email: 'cfo@acme.com', groupId: 'finance', userType: 'Employee', role: 'Manager' },
  { id: 'u-breakglass', name: 'Break-glass Operator', email: 'breakglass@acme.com', groupId: 'break-glass', userType: 'Employee', role: 'Admin' },
  { id: 'u-notice', name: 'Dev Singh', email: 'dev.singh@acme.com', groupId: 'notice-period', userType: 'Employee', role: 'Member' },
  { id: 'u-vpsales', name: 'Aditi Rao', email: 'aditi.rao@acme.com', groupId: 'japan-travel', userType: 'Employee', role: 'Manager' },
]

/** Two letters for an avatar. "Priya Sharma" → PS, "Devon" → DE. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

/* How many people an audience reaches.

   Overlapping groups are NOT deduplicated — the directory does not model
   multi-group membership, so the honest thing is to say "about" and to say in
   the picker that overlaps are counted twice, rather than to invent a precision
   the data cannot support. Named individuals already inside a chosen group ARE
   deduplicated, because that relationship IS modelled. */
export function reach(a: Audience, allGroups: Group[], allUsers: User[]): number {
  if (a.everyone) return HEADCOUNT_ALL
  const fromGroups = a.groupIds.reduce((n, id) => n + (allGroups.find((g) => g.id === id)?.memberCount ?? 0), 0)
  const named = a.userIds.filter((id) => {
    const u = allUsers.find((x) => x.id === id)
    return u ? !a.groupIds.includes(u.groupId) : false
  }).length
  return fromGroups + named
}

export const zones: Zone[] = [
  /* No shipped defaults.

     "Allowed locations" and "Blocked locations" used to be here, locked, on
     every tenant. They were built around a zone being an address set AND a
     location set evaluated together — and that pairing is gone, so a pair of
     undeletable zones named after it describes a concept the product no longer
     has. A day-one tenant now starts with none, which is also the honest
     answer: nothing is restricted until somebody says so. */
  /* Worked example 1 — address only. Inside the zone regardless of where it
     geolocates, which is what an office egress block should mean. */
  {
    id: 'office',
    kind: 'allowed',
    name: 'Office Network',
    ip: ['10.0.0.0/8', '192.168.1.0/24', '203.0.113.5', '198.51.100.0/24', '172.16.0.0/12', '2001:db8::/32'],
    asn: [],
    location: emptyLocation(),
    usedIn: 6,
  },
  /* Worked example 2 — location only. The remote-workforce case: the addresses
     rotate, so they cannot be enumerated. */
  {
    id: 'eu',
    kind: 'custom',
    name: 'EU Countries',
    ip: [],
    asn: [],
    location: { countries: ['Germany', 'France'], states: [], cities: [] },
    usedIn: 2,
  },
  {
    id: 'asn',
    kind: 'allowed',
    name: 'Corporate ASN',
    ip: [],
    asn: ['AS64512'],
    location: emptyLocation(),
    usedIn: 1,
  },
  /* Worked example 3 — the AND genuinely narrowing. One operator spans several
     countries and one country holds many operators, so neither half alone says
     what this zone says. */
  {
    id: 'jio-in',
    kind: 'custom',
    name: 'Reliance Jio · India',
    ip: [],
    asn: ['AS55836'],
    location: { countries: ['India'], states: [], cities: [] },
    usedIn: 0,
  },
  {
    id: 'pune-hq',
    name: 'Pune HQ · 25km',
    kind: 'custom',
    ip: [],
    asn: [],
    location: {
      countries: ['India'],
      states: ['Maharashtra'],
      cities: [],
      radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' },
    },
    usedIn: 0,
  },
  {
    id: 'anon',
    kind: 'blocked',
    name: 'Anonymizers',
    ip: ['185.220.101.0/24', '185.220.102.0/24'],
    asn: ['AS9009', 'AS16276'],
    location: emptyLocation(),
    usedIn: 4,
  },

  /* --- The named lists the use-case document needs ---------------------------

     A zone is this engine's only named-list primitive, and the document's
     finding #12 is exactly about that: inline value lists — office CIDRs,
     sanctioned countries — copied into every rule that needs them go stale
     independently. These three are the lists the twenty-three scenarios name,
     referenced rather than retyped.

     `sanctioned` is a location list where the other two are address lists, which
     is the same object doing two different jobs. That is the engine's shape, not
     a choice made here. */
  // --- appended to `zones` in data.ts ---
  {
    id: 'office-cidr',
    kind: 'allowed',
    name: 'Office egress · 203.0.113.0/24',
    ip: ['203.0.113.0/24'],
    asn: [],
    location: emptyLocation(),
    usedIn: 4,
  },


  {
    id: 'corp-network',
    kind: 'allowed',
    name: 'Corp network — HQ range + branch block',
    // classifyIp() in zone-validation.ts accepts 'a.b.c.d-e.f.g.h' as 'ipv4-range'.
    ip: ['198.51.100.1-198.51.100.254', '203.0.113.0/26'],
    asn: [],
    location: emptyLocation(),
    usedIn: 1,
  },

  /* Named list object for the sanctioned countries — Finding #12. Zone is the
     engine's only named-list primitive and its location half is a country list.
     Append to `zones`. Values are free string[], unconstrained by the `country`
     condition's five-item option list. */
  {
    id: 'sanctioned',
    kind: 'blocked',
    name: 'Sanctioned countries',
    ip: [],
    asn: [],
    location: {
      countries: ['Iran', 'North Korea', 'Syria', 'Cuba'],
      states: [],
      cities: [],
    },
    usedIn: 1,
  },
]

/** Known operators, so an ASN can be shown as more than a number. */
export const ASN_DIRECTORY: Record<string, string> = {
  AS15169: 'Google LLC',
  AS16509: 'Amazon AWS',
  AS55836: 'Reliance Jio',
  AS9498: 'Bharti Airtel',
  AS64512: 'Corporate (private range)',
  AS9009: 'M247 — hosting',
  AS16276: 'OVH — hosting',
}

export const methodSets: MethodSet[] = [
  /* Names must resolve against AUTH_METHODS in methods.ts — a set referencing a
     name that no longer exists silently contains nothing, which is why
     method-sets.test.ts asserts every one of them resolves. */
  {
    id: 'phishing-resistant',
    name: 'Phishing-resistant only',
    description: 'For rules protecting regulated data. Nothing here can be replayed, intercepted, or handed over by a user who was asked nicely.',
    methods: ['FIDO2 / Passkey', 'CAC Card'],
    usedIn: 2,
  },
  {
    id: 'standard',
    name: 'Standard workforce',
    description: 'The everyday set. Broad enough that nobody is locked out on a bad travel day, and deliberately not used on anything holding regulated records.',
    methods: ['miniOrange Push', 'miniOrange OTP', 'Google Authenticator', 'OTP over Email', 'Security Questions'],
    usedIn: 4,
  },
]

// --- Rule helpers ------------------------------------------------------------

let ruleSeq = 0
function rule(over: Partial<Rule> & Pick<Rule, 'name'>): Rule {
  ruleSeq += 1
  return {
    id: `r${ruleSeq}`,
    enabled: true,
    when: anySignIn(),
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 120,
    ...over,
  }
}

let condSeq = 0
let cardSeq = 0
const nextCondId = () => `c${(condSeq += 1)}`
const nextCardId = () => `k${(cardSeq += 1)}`

/* `cond` has lost its fourth positional `joiner` argument.

   That is deliberate: it turns every authored call site into an arity error
   rather than a silent no-op, which is the only reliable way to find seventy of
   them. */
export function cond(typeId: string, operator: string, values: string[] = [], scope?: ZoneScope): Condition {
  /* Spread-if-set rather than `scope` unconditionally. `{ scope: undefined }`
     and `{}` are the same object to every reader and two different strings to
     `JSON.stringify`, which is what the whole estate's dirty checking compares
     — so an authored `cond(...)` with no scope has to be byte-identical to one
     written before this parameter existed. */
  return { id: nextCondId(), typeId, operator, values, ...(scope ? { scope } : null) }
}

/** One alternative. Throws on empty, because an empty card matches everything. */
export function card(...conditions: Condition[]): ConditionCard {
  if (conditions.length === 0) throw new Error('A card must hold at least one condition')
  return { id: nextCardId(), conditions }
}

/* A group with nothing in it yet.

   `card()` throws on empty for a good reason: an empty card matches
   everything, and one arriving from a composer would quietly turn a rule into
   a catch-all. But "Add group" has to produce something before it can produce
   a condition — the alternative is what the editor used to do, which was open
   the attribute picker and build the group around whatever you chose, so
   "add a group" and "add a condition" were the same gesture with different
   labels.

   So the empty state is allowed, deliberately and only here. It is not
   silent: `diagnose` reports it as PE320 the moment it exists, and the publish
   gate blocks on it. An empty group names itself rather than being impossible
   to make. */
export function emptyGroup(): ConditionCard {
  return { id: nextCardId(), conditions: [], grouped: true }
}

/** A named alternative — the label the author gave this card. */
export function namedCard(label: string, ...conditions: Condition[]): ConditionCard {
  return { ...card(...conditions), label }
}

export function when(...cards: ConditionCard[]): Predicate {
  return { cards }
}

/** The catch-all: no conditions, so it decides every sign-in that reaches it. */
export const anySignIn = (): Predicate => ({ cards: [] })

/** A blank card with one unset condition of the given type — what "+ Add condition" inserts. */
export const blankCard = (typeId: string, operator: string): ConditionCard => card(cond(typeId, operator, []))

/* Deep clone with fresh ids, mandatory wherever a rule is reused.

   `store.copyRuleInto` and the three synthetic-tenant builders in fixtures.ts
   all shallow-spread rules today, so the same `Condition` object is aliased
   across policies estate-wide. That was harmless while ids were only React
   keys. It is not harmless now: diagnostics build finding ids as
   `${rule.id}-${condition.id}`, and the composer addresses cards and conditions
   by id — aliased ids mean editing one policy edits another. */
export function reidRule(r: Rule): Rule {
  ruleSeq += 1
  return {
    ...r,
    id: `r${ruleSeq}`,
    /* Copied, not shared.

       This re-id'd the rule, its cards and its conditions and then handed both
       copies the same `values`, `secondFactorMethods` and `methodChain` arrays
       — a spread is one level deep. Nothing ever mutated one of those in place,
       so nothing broke, and the safety was a property of every current caller
       rather than of this function.

       That stops being good enough the moment a rule outlives the policy it
       came from. `duplicate` and `copyRuleInto` re-id and immediately hand the
       result to a setter; a saved rule is held for the session and inserted
       into many policies, so a single shared array would reach all of them. */
    secondFactorMethods: r.secondFactorMethods ? [...r.secondFactorMethods] : undefined,
    methodChain: r.methodChain ? [...r.methodChain] : undefined,
    when: {
      join: r.when.join,
      cards: r.when.cards.map((k) => ({
        ...k,
        id: nextCardId(),
        conditions: k.conditions.map((c) => ({ ...c, id: nextCondId(), values: [...c.values] })),
      })),
    },
  }
}

export const policies: Policy[] = [

  /* --- The policies, from the use-case document ------------------------------

     Twenty-eight policies covering the twenty-three scenarios in
     `ruleset-usecase-scenarios.md`. They replace ten invented ones.

     The invented ten were written to exercise the builder — a finance policy, a
     zero-trust baseline, a contractor limit — and they did that. What they could
     not do is answer the question this pass is about: can the engine express what
     the product has actually promised? A fixture you wrote to fit the model
     always fits the model. These were written from a document the model has never
     seen, and where one of them cannot be expressed the comment above it says so
     rather than the policy quietly becoming a different policy.

     Twenty-eight rather than twenty-three because four scenarios need more than
     one policy each: S5 assigns three group policies plus the application's own
     baseline, S9 pairs the Finance policy with a baseline, and S17 covers two
     applications. That is the document's own shape — a policy is reusable and an
     assignment binds it — and it is the first thing this engine cannot model:
     there is no assignment table, so a policy carries one `audience` and one
     `appId`, and "the same policy on two apps" becomes two policies.

     Every one of these keeps its Default Rule as `fallback`, which the model
     already had right: the last row of a policy is a rule, so it can DENY with a
     reason or ALLOW with a chain. The document's finding #3 asks for exactly
     that. */
  {
    id: 'global-default',
    name: 'Global Default Policy',
    type: 'App Access',
    /* No application, and that is what makes it the default: it is where a
       sign-in lands when no app-specific policy covers it. */
    status: 'always-on',
    lastModified: 'System',
    modifiedBy: 'System',
    isSystem: true,
    audience: EVERYONE,
    rules: [
      rule({
        name: 'Baseline access',
        decision: '1fa',
        matchEstimate: 1240,
      }),
    ],
  },

  /* Appended to `policies` in data.ts. `rule` is module-private, so this cannot
     live anywhere else without exporting it first.

     APP: the scenario says "Production Monitoring (Grafana/PagerDuty)". Neither
     exists in `apps`. Closest is `aws` (AWS Console) — the only production-
     operations surface in the fixture. `servicenow` is the runner-up (ITSM, not
     monitoring). Nothing in the catalogue is actually a monitoring product. */
  {
    id: 's21-oncall',
    name: 'Production Monitoring — On-Call Override',
    type: 'App Access',
    appId: 'monitoring',
    status: 'active',
    lastModified: '6 hours ago',
    modifiedBy: 'Ravi Menon',
    audience: audienceOf(['engineering']),
    rules: [
      rule({
        name: 'Office hours, anyone in Engineering',
        when: when(
          namedCard(
            'Weekday working window',
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            cond('time', 'between', ['09:00', '19:00']),
            // `Asia/Kolkata` HAS NO HOME. See gap 21-G3.
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        rememberMfa: false,
        allowDisable2fa: false,
        matchEstimate: 268,
      }),
      rule({
        /* "After-hours" is nowhere in this predicate. It is carried entirely by
           rule ordering — rule 1 ate the office-hours window. The engine's
           first-match-wins (`simulate.ts:421`) preserves that faithfully, so this
           one thing survives the mapping intact. */
        name: 'After hours, on-call rotation only',
        when: when(
          namedCard(
            'On the rotation, on a managed device',
            cond('group', 'in', ['on-call']),
            cond('mdm', 'is', ['Enrolled']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        // SetReAuthFrequency(8h) HAS NO HOME. See gap 21-G5.
        rememberMfa: false,
        allowDisable2fa: false,
        matchEstimate: 8,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      // DENY("After-hours access is for the on-call rotation") — reason lost. 21-G6.
      matchEstimate: 34,
    }),
  },

  /* Appended to `policies` in data.ts.

     content store. Neither is a knowledge base as such.

     TARGET: "Default Group | DEFAULT" is the one target in these three scenarios
     that maps exactly — `EVERYONE`. */
  {
    id: 's22-employment',
    name: 'Knowledge Base — Employment Type Matrix',
    type: 'App Access',
    appId: 'knowledge-base',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Clara Boucher',
    audience: EVERYONE,
    rules: [
      rule({
        name: 'Confirmed FTE, probation cleared',
        when: when(
          namedCard(
            'FTE past probation',
            /* THE ATTRIBUTE NAME IS NOT A FIELD. `Condition` is
               { id, typeId, operator, values, scope? } — there is nowhere to say
               WHICH custom attribute. The `key=value` string below is a
               convention I am inventing in this document; the engine defines
               nothing of the kind and no reader parses it. See 22-G1. */
            cond('user-attr', 'is', ['employment_type=FTE']),
            /* UNREPRESENTABLE. `user-attr` operators are ['is','is not','contains'].
               There is no `<`, no date type, and no `today`. The string below is a
               placeholder that compiles and means nothing. See 22-G2, 22-G3. */
            cond('user-attr', 'is', ['probation_until<today']),
          ),
        ),
        decision: '1fa',
        firstFactor: 'Password',
        secondFactor: 'any',
        // SetRememberMfaTimeout(30d) on a chain with NO second factor. See 22-G6.
        rememberMfa: true,
        rememberDays: 30,
        allowDisable2fa: false,
        matchEstimate: 780,
      }),
      rule({
        name: 'Probationary FTE',
        when: when(
          namedCard('FTE, probation not yet cleared',
            cond('user-attr', 'is', ['employment_type=FTE']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        rememberMfa: true,
        rememberDays: 7,
        allowDisable2fa: false,
        matchEstimate: 190,
      }),
      rule({
        name: 'Intern, office hours only',
        when: when(
          namedCard(
            'Intern on the office network in working hours',
            cond('user-attr', 'is', ['employment_type=INTERN']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            cond('time', 'between', ['09:00', '18:00']),   // no `Asia/Kolkata`
            /* The literal CIDR, because NO SEEDED ZONE CONTAINS IT. The `office`
               zone (data.ts:659) holds the single address `203.0.113.5`, not the
               /24. Using `cond('zone','in zone',['office'])` would silently widen
               this to 10.0.0.0/8 + 192.168.1.0/24 + 198.51.100.0/24 + 172.16/12
               + 2001:db8::/32. See 22-G8. */
            cond('ip', 'is', ['203.0.113.0/24']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        // SetRememberMfaTimeout(0) — the ONE settings node that maps. See 22-G6.
        rememberMfa: false,
        forceMfaEachLogin: true,
        allowDisable2fa: false,
        matchEstimate: 45,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      // DENY("Access not provisioned for your employment type") — reason lost.
      matchEstimate: 225,
    }),
  },

  /* Appended to `policies` in data.ts.

     worse fits. */
  {
    id: 's23-vault',
    name: 'Legal Document Vault — Clearance Ladder',
    type: 'App Access',
    appId: 'vault',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Mehak Garg',
    audience: audienceOf(['legal']),
    rules: [
      rule({
        name: 'Senior counsel, cleared, on matter',
        when: when(
          namedCard(
            'Role, matter and clearance all agree',
            /* `user-role` is a CLOSED enum: ['Admin','Manager','Member','Auditor']
               (data.ts:211). LEGAL_COUNSEL and GENERAL_COUNSEL are not in it and
               cannot be added per-tenant. The two values below are a substitution,
               not a translation. See 23-G3. */
            cond('user-role', 'is', ['Admin', 'Manager']),
            cond('group', 'in', ['matter-acme']),
            /* UNREPRESENTABLE twice over: no attribute key, and no `>=`.
               See 23-G4. */
            cond('user-attr', 'is', ['clearance_level>=3']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        // SetReAuthFrequency(4h) HAS NO HOME. See 23-G5.
        rememberMfa: false,
        allowDisable2fa: false,
        matchEstimate: 6,
      }),
      rule({
        name: 'Paralegal, cleared, on matter, from the office',
        when: when(
          namedCard(
            'Paralegal on the matter, on the office network',
            cond('user-role', 'is', ['Member']),      // PARALEGAL is not an option
            cond('group', 'in', ['matter-acme']),
            cond('user-attr', 'is', ['clearance_level>=2']),   // UNREPRESENTABLE
            cond('ip', 'is', ['203.0.113.0/24']),              // inlined again, 22-G8
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        // SetReAuthFrequency(2h) HAS NO HOME.
        rememberMfa: false,
        allowDisable2fa: false,
        matchEstimate: 9,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      // DENY("Vault access requires matter assignment and clearance") — lost.
      matchEstimate: 9,
    }),
  },

  // --- Scenario 5, appended to `policies` in data.ts ---

  /* Policy A — Admin */
  {
    id: 's5-admin',
    name: 'Workspace — Admin, office only',
    type: 'App Access',
    appId: 'google-workspace',
    audience: audienceOf(['admin']),
    status: 'active',
    lastModified: '3 hours ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Office only',
        when: when(card(cond('zone', 'in zone', ['office-cidr'], 'ip'))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator', 'miniOrange OTP'],
        matchEstimate: 9,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },


  /* Policy B — DevOps */
  {
    id: 's5-devops',
    name: 'Workspace — DevOps, office network and office device',
    type: 'App Access',
    appId: 'google-workspace',
    audience: audienceOf(['devops']),
    status: 'active',
    lastModified: '3 hours ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Office IP and office device',
        when: when(
          card(
            cond('zone', 'in zone', ['office-cidr'], 'ip'),
            cond('device-reg', 'is', ['Registered']),
            cond('mdm', 'is', ['Enrolled']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 268,
      }),
    ],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 0 }),
  },


  /* Policy C — End-Users */
  {
    id: 's5-endusers',
    name: 'Workspace — End users, office network',
    type: 'App Access',
    appId: 'google-workspace',
    /* 'End-Users' has no group. EVERYONE is the only available expression and it
       is WIDER than the scenario: it also covers it-admins and engineering. */
    audience: audienceOf(['end-users']),
    status: 'active',
    lastModified: '3 hours ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Office IP',
        when: when(card(cond('zone', 'in zone', ['office-cidr'], 'ip'))),
        decision: '1fa',
        firstFactor: 'Password',
        secondFactor: 'any',
        matchEstimate: 921,
      }),
    ],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 0 }),
  },


  /* Application Baseline Policy */
  {
    id: 's5-baseline',
    name: 'Workspace — Application baseline',
    type: 'App Access',
    appId: 'google-workspace',
    audience: EVERYONE,
    status: 'active',
    lastModified: '3 hours ago',
    modifiedBy: 'Mehak Garg',
    configIssue: 'No rules configured — every sign-in falls straight through to the default rule.',
    rules: [],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 0 }),
  },

  // --- Scenario 6, appended to `policies` in data.ts ---
  {
    id: 's6-mdm-os',
    name: 'Corporate Email — MDM OS matrix',
    type: 'App Access',
    appId: 'corporate-email',
    audience: EVERYONE,            // Default Group → everyone
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'Managed Apple',
        when: when(card(
          cond('mdm', 'is', ['Enrolled']),
          cond('os', 'is', ['iOS', 'macOS']),   // multi-value list == IN
        )),
        decision: '1fa',
        firstFactor: 'Specific',
        firstFactorMethod: 'FIDO2 / Passkey',   // AUTH_METHODS name; builder cannot produce it
        secondFactor: 'any',                    // required field, meaningless at 1fa
        matchEstimate: 214,
      }),
      rule({
        name: 'Managed Android and Windows',
        when: when(card(
          cond('mdm', 'is', ['Enrolled']),
          cond('os', 'is', ['Android', 'Windows']),
        )),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 596,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',            // "Unmanaged device" — reason is lost
      matchEstimate: 430,
    }),
  },

  // --- Scenario 7, appended to `policies` in data.ts ---
  {
    id: 's7-network-factor',
    name: 'VPN Portal — factor by network',
    type: 'App Access',
    /* There is no VPN portal in `apps`. `aws` is the closest infrastructure
       gateway; the fit is poor and the fixture says so. */
    appId: 'vpn-portal',
    /* `employees` is the document's own target and excludes contractors, which
      EVERYONE would not. */
    audience: audienceOf(['employees']),
    status: 'active',
    lastModified: '6 hours ago',
    modifiedBy: 'Jaspreet T.',
    rules: [
      rule({
        name: 'Corp network',
        when: when(card(cond('zone', 'in zone', ['corp-network'], 'ip'))),
        decision: '1fa',
        firstFactor: 'Specific',
        firstFactorMethod: 'miniOrange Push',
        secondFactor: 'any',
        matchEstimate: 640,
      }),
      rule({
        name: 'Known mobile',
        when: when(card(
          cond('device-type', 'is', ['Mobile']),
          cond('device-reg', 'is', ['Registered']),
        )),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 190,
      }),
    ],
    /* The Default Rule ALLOWS here, and the engine reads only the token '2fa'
       from it — the chain below is stored and never evaluated. */
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: '2fa',
      firstFactor: 'Password',
      secondFactor: 'specific',
      secondFactorMethods: ['Google Authenticator'],
      matchEstimate: 410,
    }),
  },

  // --- Scenario 8, appended to `policies` in data.ts ---
  {
    id: 's8-role-escalation',
    name: 'Admin Console — role escalation',
    type: 'App Access',
    appId: 'admin-console',
    audience: audienceOf(['it-admins']), // 'IT' → it-admins
    status: 'active',
    lastModified: '2 days ago',
    modifiedBy: 'Ravi Menon',
    rules: [
      rule({
        name: 'Super admin',
        // SUPER_ADMIN does not exist in the user-role enum. 'Admin' is the nearest.
        when: when(card(cond('user-role', 'is', ['Admin']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 3,
      }),
      rule({
        name: 'Helpdesk admin',
        /* HELPDESK has NO counterpart in ['Admin','Manager','Member','Auditor'].
           'Member' is written here and it is a rename, not a mapping: it catches
           every ordinary member of it-admins. */
        when: when(card(cond('user-role', 'is', ['Member']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 1,
      }),
    ],
    /* ALLOW → CHAIN [1F: Password, 2F: ALLOW_ANY (2-factor type)]
                + SetReAuthFrequency(12h)
       Only the token '2fa' is read. `secondFactor: 'any'` is the closest thing to
       ALLOW_ANY and carries no factor-type constraint. SetReAuthFrequency(12h)
       has no field and is DROPPED ENTIRELY. */
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: '2fa',
      firstFactor: 'Password',
      secondFactor: 'any',
      matchEstimate: 5,
    }),
  },

  // --- Scenario 9, appended to `policies` in data.ts ---

  /* Finance Policy */
  {
    id: 's9-finance',
    name: 'Payroll — Finance',
    type: 'App Access',
    appId: 'payroll',
    /* The scenario's claim is "no separate user-to-Policy assignment is required".
       But `inAudience` (simulate.ts:384) short-circuits ABOVE the rules, so a
       rule naming someone outside the audience never runs. Mehak Garg is in
       `executives`, so she must be added to the audience by name — which IS a
       user-to-policy assignment, the exact thing the scenario says it avoids. */
    audience: audienceOf(['finance']),
    status: 'active',
    lastModified: '4 days ago',
    modifiedBy: 'Mehak Garg',
    rules: [
      rule({
        name: 'CFO anywhere, hardened',
        /* `user-attr is cfo@acme.com` would be the literal reading, but user-attr
           has no evaluator case and would never match. `user` is modelled. */
        when: when(card(cond('user', 'is', ['mehak']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        /* SetRememberMfaTimeout(1h): `rememberDays` is DAYS and the editor floors
           it at 1. One hour cannot be written. `forceMfaEachLogin` (timeout 0) is
           the nearest and is STRICTER than asked. */
        rememberMfa: false,
        forceMfaEachLogin: true,
        matchEstimate: 1,
      }),
      rule({
        name: 'Finance office access',
        when: when(card(cond('zone', 'in zone', ['office-cidr'], 'ip'))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 74,
      }),
    ],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 12 }),
  },


  /* Application Baseline Policy */
  {
    id: 's9-baseline',
    name: 'Payroll — Application baseline',
    type: 'App Access',
    appId: 'payroll',
    audience: EVERYONE,
    status: 'active',
    lastModified: '4 days ago',
    modifiedBy: 'Mehak Garg',
    configIssue: 'No rules configured — every sign-in falls straight through to the default rule.',
    rules: [],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 1154 }),
  },

  /* Scenario 16 — Break-Glass Admin Account.
     Append inside the `policies` array in data.ts; `rule` is module-private. */
  {
    id: 'break-glass',
    name: 'Break-Glass Emergency Access',
    type: 'App Access',
    /* The document says "All Apps using the emergency Policy". Not
       expressible: `appId` is one application, and the only every-app policy is
       the `isSystem` singleton. Left unset, which the console reads as a
       configuration fault rather than as breadth — the honest encoding, and the
       gap register's G2. */
    appId: undefined,
    configIssue:
      'No application assigned — this policy cannot take effect until one is attached. The scenario asks for every application; the model has no such policy.',
    status: 'active',
    lastModified: '6 weeks ago',
    modifiedBy: 'Ravi Menon',
    /* The doc's shape is a dedicated `Break-Glass Accounts` group. It does not
       exist. Two closest encodings, both shown; the second is what the engine
       actually makes easy and the doc's Tier-4 preamble forbids. */
    audience: audienceOf(['break-glass']),
    rules: [
      rule({
        name: 'War-room terminal only',
        when: when(
          card(
            cond('ip', 'is', ['203.0.113.10']),
            cond('device-reg', 'is', ['Registered']),
          ),
        ),
        decision: '1fa',
        firstFactor: 'Password',
        /* SetRememberMfaTimeout(0) — the closest the model has. `rememberMfa:false`
           is "never remember"; `forceMfaEachLogin` is set for the same intent even
           though a 1fa rule has no MFA to force. */
        rememberMfa: false,
        forceMfaEachLogin: true,
        /* SetReAuthFrequency(15min) HAS NO FIELD. Silently dropped. */
        allowDisable2fa: false,
        matchEstimate: 2,
      }),
    ],
    fallback: rule({
      /* DENY("Break-glass usable only from war-room terminal") — the reason
         string has nowhere to live, so it is smuggled into the name, which is
         the only text any surface prints. */
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },

  /* Scenario 17 — Departing Employee. TWO POLICIES, because the scenario names
     two applications and `Policy.appId` is one app. The rules are byte-identical;
     the duplication is the gap, not a modelling choice. */
  {
    id: 'notice-period-github',
    name: 'Notice Period — Code Repository',
    type: 'App Access',
    /* Scenario says GitLab. No such app. Closest real id: `github`. */
    appId: 'github',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Clara Boucher',
    audience: audienceOf(['notice-period']),
    rules: [
      rule({
        name: 'Office, business hours only',
        when: when(
          card(
            cond('ip', 'is', ['203.0.113.0/24']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            /* Time 09:00–18:00 Asia/Kolkata. The TIMEZONE IS DROPPED — `time` is
               documented as "A window in the tenant's timezone", one tenant-wide
               setting, not a per-rule IANA zone. */
            cond('time', 'between', ['09:00', '18:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        /* SetRememberMfaTimeout(0) */
        rememberMfa: false,
        forceMfaEachLogin: true,
        /* SetReAuthFrequency(2h) — NO FIELD. Dropped. */
        allowDisable2fa: false,
        matchEstimate: 1,
      }),
    ],
    fallback: rule({
      name: 'Default rule',   // DENY("Access restricted during notice period")
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },


  {
    /* The identical policy again, because the second application needs its own.
       Two rows in the list, two things to edit, two things to forget to revoke. */
    id: 'notice-period-aws',
    name: 'Notice Period — Production Cloud Console',
    type: 'App Access',
    appId: 'aws',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Clara Boucher',
    audience: audienceOf(['notice-period']),
    rules: [
      rule({
        name: 'Office, business hours only',
        when: when(
          card(
            cond('ip', 'is', ['203.0.113.0/24']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            cond('time', 'between', ['09:00', '18:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        rememberMfa: false,
        forceMfaEachLogin: true,
        allowDisable2fa: false,
        matchEstimate: 1,
      }),
    ],
    fallback: rule({ name: 'Default rule', when: anySignIn(), decision: 'deny', matchEstimate: 0 }),
  },


  /* Scenario 18 — Traveling Executive. */
  {
    id: 'japan-travel',
    name: 'Japan Travel Exception',
    type: 'App Access',
    appId: 'salesforce',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Mehak Garg',
    /* Scenario targets a temporary `Japan-Travel` group. Does not exist.
       Closest real group is `executives`; the VP Sales is not separable from the
       other eleven, so this grants the Japan exception to all of them. The named
       -user form (`audienceOf([], ['u-exec-4'])`) is narrower and is what the
       engine actually makes easy. */
    audience: audienceOf(['japan-travel']),
    rules: [
      rule({
        name: 'Japan trip window',
        when: when(
          card(
            /* Country = JP. `cond('country','is',['Japan'])` TYPES but 'Japan' is
               not in the catalogue's `options`, so the picker cannot produce it
               and any option-driven renderer shows an unknown value. Zone form
               used instead — the only loadable encoding. */
            cond('zone', 'in zone', ['japan'], 'location'),
            cond('device-reg', 'is', ['Registered']),
            /* Risk score < 60. `device-risk` is the numeric one; `ml-risk` is the
               AI one and is a 3-value enum with no numbers in it. The parameter
               sheet has ONE attribute ("Risk score (Device Score / Device Trust)
               (AI included)"); the engine has two, and the scenario's number only
               fits the non-AI one. */
            cond('device-risk', 'below', ['60']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        /* SetRememberMfaTimeout(0) */
        rememberMfa: false,
        forceMfaEachLogin: true,
        allowDisable2fa: false,
        matchEstimate: 1,
      }),
      rule({
        name: 'Home countries normal',
        /* Country in [IN, US] — implicit multi-value IN on the `is` operator.
           Both values ARE in the option list, so this one is loadable literally. */
        when: when(card(cond('country', 'is', ['India', 'United States']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        allowDisable2fa: false,
        matchEstimate: 11,
      }),
    ],
    fallback: rule({
      name: 'Default rule',   // DENY("Location not permitted")
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },

  /* Scenario 19 — Hybrid Work Access. The canonical (A OR B) AND (C OR D).

     THE SHAPE IS EXPRESSIBLE, contrary to the "two-level DNF" framing: `Predicate
     .join` and `ConditionCard.join` (data.ts:278-308) let the trunk be AND while
     each card is OR, and `predicatePasses` reads exactly that. What is missing is
     HELPER support — `when()` and `card()` never set `join` — so the joins are
     spread on by hand. `drawsAsBracket` then returns true for both cards (their
     join disagrees with `outerJoin`), so the UI renders it as two brackets. */
  {
    id: 'hybrid-work',
    name: 'Hybrid Work Access',
    type: 'App Access',
    appId: 'jira',
    status: 'active',
    lastModified: '2 days ago',
    modifiedBy: 'Jaspreet T.',
    /* Scenario targets `Employees`. No such group. Union of the four
       non-contractor groups — 417 people — rather than EVERYONE, which would
       quietly hand this to 154 contractors. */
    audience: audienceOf(['employees']),
    rules: [
      {
        ...rule({
          name: 'Trusted network + trusted device',
          /* CHAIN [1F: ALLOW_SPECIFIC [FIDO2 (Passkey / Biometric), Password]] —
             A TWO-METHOD 1F SET. `firstFactor` is 'Password' | 'Any' | 'Specific'
             and `firstFactorMethod` is ONE optional string. The pair cannot be
             written. 'Any' chosen as the least-wrong: it admits the intended two
             and ALSO admits 'Magic link', the third primary-class method. */
          decision: '1fa',
          firstFactor: 'Any',
          /* SetRememberMfaTimeout(30d) */
          rememberMfa: true,
          rememberDays: 30,
          allowDisable2fa: false,
          matchEstimate: 300,
        }),
        when: {
          join: 'and',
          cards: [
            {
              ...card(
                cond('ip', 'is', ['203.0.113.0/24']),
                cond('ip', 'is', ['198.51.100.0/24']),
              ),
              join: 'or',
              grouped: true,
              label: 'Trusted network',
            },
            {
              ...card(
                cond('device-reg', 'is', ['Registered']),
                cond('mdm', 'is', ['Enrolled']),
              ),
              join: 'or',
              grouped: true,
              label: 'Trusted device',
            },
          ],
        },
      },
      {
        ...rule({
          name: 'One trust pair missing',
          decision: '2fa',
          firstFactor: 'Password',
          /* 2F: ALLOW_ANY (2-factor type) — maps exactly. */
          secondFactor: 'any',
          /* SetRememberMfaTimeout(1d) */
          rememberMfa: true,
          rememberDays: 1,
          allowDisable2fa: false,
          matchEstimate: 90,
        }),
        /* ANY OF ( IP in office/VPN CIDRs , MDM managed = true ) — one card, join
           'or'. With a single card, `outerJoin` reads the card's own join, so the
           whole rule renders as one OR bracket. Correct. */
        when: {
          cards: [
            {
              ...card(
                cond('ip', 'is', ['203.0.113.0/24', '198.51.100.0/24']),
                cond('mdm', 'is', ['Enrolled']),
              ),
              join: 'or',
              grouped: true,
              label: 'Any trust signal',
            },
          ],
        },
      },
    ],
    /* The Default Rule as ALLOW-with-heavy-chain, not DENY. This is the one thing
       the engine models RIGHT and better than a bare decision would: `fallback` is
       a full Rule, so it carries a factor plan and a remember window. */
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: '2fa',
      firstFactor: 'Password',
      secondFactor: 'specific',
      secondFactorMethods: ['Google Authenticator'],
      rememberMfa: false,
      forceMfaEachLogin: true,
      matchEstimate: 27,
    }),
  },


  /* Scenario 20 — Red-Flag Deny Guard. */
  {
    id: 'privileged-gateway',
    name: 'Privileged Access — Red-Flag Guard',
    type: 'App Access',
    appId: 'pam',
    status: 'active',
    lastModified: '4 hours ago',
    modifiedBy: 'Ravi Menon',
    /* Scenario targets `Privileged-Users`. Does not exist. Closest: `it-admins`. */
    audience: audienceOf(['privileged']),
    rules: [
      {
        ...rule({
          name: 'Any red flag',
          decision: 'deny',   // DENY("Access blocked — security policy") — reason dropped
          matchEstimate: 1,
        }),
        /* OR of four bad signals: ONE card, join 'or'. With a single card,
           `outerJoin` reads the card's own join, so the rule renders as one OR
           bracket. The SHAPE is right. Three of the four CONDITIONS are not. */
        when: {
          cards: [
            {
              ...card(
                /* Country in [sanctioned list] — via the named zone, because the
                   `country` condition's option list holds five friendly countries
                   and not one sanctioned one. */
                cond('zone', 'in zone', ['sanctioned'], 'location'),
                /* Risk score >= 80. `device-risk` has ONLY 'above'/'below'.
                   There is no >=. `above ['79']` is an OFF-BY-ONE HACK that is
                   wrong for any non-integer score. */
                cond('device-risk', 'above', ['79']),
                /* webhook(hr-system).status = 'suspended'. The engine can only ask
                   "returns true". The comparison has moved into the hook above and
                   the rule no longer says what it tests. */
                cond('webhook', 'returns true', ['hk-hr-suspended']),
                /* Posture: jailbroken = true. THE OPTION DOES NOT EXIST — posture
                   offers [Disk encryption, Screen lock, OS up to date, Antivirus
                   running, Firewall on]. THIS IS NOT THE SCENARIO'S CONDITION; it
                   is the nearest row in the list, and it does not detect a
                   jailbreak. The red flag is LOST. */
                cond('posture', 'fails', ['OS up to date']),
              ),
              join: 'or',
              grouped: true,
              label: 'Any red flag',
            },
          ],
        },
      },
      rule({
        name: 'Clean request',
        when: when(
          card(
            cond('mdm', 'is', ['Enrolled']),
            cond('device-reg', 'is', ['Registered']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        /* SetReAuthFrequency(4h) — NO FIELD. Dropped. */
        rememberMfa: false,
        allowDisable2fa: false,
        matchEstimate: 8,
      }),
    ],
    /* POLICY-WIDE METHOD CONSTRAINT — DISALLOW [OTP over SMS, SMS Link, OTP over
       SMS and Email, OTP over Phone Call, Security Questions] — HAS NO HOME.
       `Policy` has no method field. `MethodSet` is a library object that NO Rule
       field references (grep: nothing outside its own test reads it). The nearest
       approximation is naming the permitted method on each rule individually,
       which is what `secondFactorMethods: ['miniOrange Push']` above does — an
       allow-of-one standing in for a deny-of-five, enforced per rule rather than
       per policy, and silently absent from any rule that forgets it. */
    fallback: rule({
      name: 'Default rule',   // DENY("Privileged access requires managed, registered device")
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },


  {
    id: 's10-aws-posture',
    name: 'Production Cloud Console — Device Posture',
    type: 'App Access',
    appId: 'aws',
    status: 'active',
    lastModified: '6 hours ago',
    modifiedBy: 'Ravi Menon',
    // Doc target is `DevOps`. No such group in the fixtures — `engineering` is the
    // closest and is strictly broader (310 people, not a DevOps subset).
    audience: audienceOf(['devops']),
    rules: [
      rule({
        name: 'Full posture',
        when: when(
          card(
            cond('mdm', 'is', ['Enrolled']),
            cond('posture', 'passes', ['Disk encryption']),
            cond('posture', 'passes', ['Screen lock']),
            // Stands in for `os_patch_age_days < 30`. The catalogue has a boolean
            // 'OS up to date' and no numeric patch age.
            cond('posture', 'passes', ['OS up to date']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 214,
      }),
      rule({
        name: 'Posture degraded',
        when: when(card(cond('mdm', 'is', ['Enrolled']), cond('posture', 'passes', ['Disk encryption']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        // The doc says + SetReAuthFrequency(4h). Nothing on Rule holds it.
        rememberMfa: false,
        matchEstimate: 71,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      // "Device posture insufficient — contact IT" has nowhere to go.
      matchEstimate: 25,
    }),
  },


  {
    id: 's11-wiki-contractor',
    name: 'Internal Wiki — Contractor Control',
    type: 'App Access',
    // Doc app is "Internal Wiki". No such app; `jira` is the nearest
    // collaboration surface in the fixtures.
    appId: 'wiki',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet T.',
    audience: audienceOf(['contractors']),
    rules: [
      rule({
        name: 'Contract expired',
        // Doc: webhook(`hr-system`).contract_status = `expired`.
        // No `hr-system` hook; `hk-entitlement` is the closest sync boolean hook.
        // The field comparison lives in the hook's responsePath, not here.
        when: when(card(cond('webhook', 'returns false', ['hk-hr-contract']))),
        decision: 'deny',
        matchEstimate: 18,
      }),
      rule({
        name: 'Active, office',
        when: when(
          card(
            cond('webhook', 'returns true', ['hk-hr-contract']),
            cond('ip', 'is', ['203.0.113.0/24']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 96,
      }),
      rule({
        name: 'Active, remote',
        when: when(card(cond('webhook', 'returns true', ['hk-hr-contract']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 40,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 12,
    }),
  },


  {
    id: 's12-crm-risk',
    name: 'Customer Database — Risk Tiers',
    type: 'App Access',
    appId: 'crm',
    status: 'active',
    lastModified: '2 days ago',
    modifiedBy: 'Clara Boucher',
    // Doc target is `Support`. No such group; `it-admins` is the nearest by
    // function and far smaller than a real support organisation.
    audience: audienceOf(['support']),
    rules: [
      rule({
        name: 'Low risk, trusted device',
        // (risk < 30) AND (registered OR mdm-managed) — DNF requires the risk
        // leaf to be duplicated into both cards.
        when: when(
          namedCard('Registered device',
            cond('device-risk', 'below', ['30']),
            cond('device-reg', 'is', ['Registered']),
          ),
          namedCard('MDM-managed device',
            cond('device-risk', 'below', ['30']),
            cond('mdm', 'is', ['Enrolled']),
          ),
        ),
        // Doc: CHAIN [1F: Password, StepUpIfRiskAbove(70) -> 2F: miniOrange Push].
        // No conditional second factor exists. '1fa' drops the step-up entirely.
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 6,
      }),
      rule({
        name: 'Medium risk',
        when: when(card(cond('device-risk', 'below', ['70']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 2,
      }),
      rule({
        name: 'High risk',
        // Doc says `>= 70`. Only `above` / `below` exist, so this is `above 69`.
        when: when(card(cond('device-risk', 'above', ['69']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        // SetRememberMfaTimeout(0), as closely as the model allows.
        rememberMfa: false,
        forceMfaEachLogin: true,
        matchEstimate: 1,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 0,
    }),
  },


  {
    id: 's13-trading-compliance',
    name: 'Trading Platform — Compliance Gate',
    type: 'App Access',
    // Doc app is "Trading Platform". Nothing in the fixtures is in that class;
    // `workday` is the nearest regulated financial system of record.
    appId: 'trading',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Mehak Garg',
    // Doc target is `Traders`. No such group; `finance` is the nearest.
    audience: audienceOf(['traders']),
    rules: [
      rule({
        name: 'Training lapsed',
        // Doc: custom_attr(`compliance_training_expiry`) < today.
        // `user-attr` has no attribute-name field, no `<`, no date type and no
        // `today`. The attribute name is smuggled into the value string; the
        // date comparison is pre-computed outside the engine and reduced to a
        // string equality. This is a convention, not a feature.
        when: when(card(cond('user-attr', 'is', ['compliance_training_expiry:lapsed']))),
        decision: 'deny',
        matchEstimate: 4,
      }),
      rule({
        name: 'Floor terminal',
        when: when(
          card(
            // Doc: MacAddress in allowlist [floor-terminals] — a named list
            // object. Inlined, because no such object exists.
            cond('mac', 'is', ['00:1B:44:11:3A:B7', '00:1B:44:11:3A:B8', '00:1B:44:11:3A:B9']),
            cond('browser', 'is', ['Chrome', 'Edge']),
          ),
        ),
        decision: '1fa',
        firstFactor: 'Password',
        // Doc: + SetReAuthFrequency(24h). Nothing on Rule holds it, and
        // rememberDays is an MFA-remember window, meaningless on a 1fa rule.
        matchEstimate: 22,
      }),
      rule({
        name: 'Office, approved browser',
        when: when(
          card(
            cond('ip', 'is', ['203.0.113.0/24']),
            cond('browser', 'is', ['Chrome', 'Edge']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        // Catalogue spelling is 'RSA MFA (SecurID)', not the doc's
        // 'RSA Authenticator (SecurID)'. 'Display Token' matches exactly.
        secondFactorMethods: ['RSA MFA (SecurID)', 'Display Token'],
        matchEstimate: 48,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 12,
    }),
  },


  {
    id: 's14-erp-regional',
    name: 'ERP — Regional Office Hours',
    type: 'App Access',
    // Doc app is "ERP System". No ERP in the fixtures; `servicenow` is the
    // nearest enterprise system-of-record (`workday` is the other candidate and
    // is already standing in for S13's Trading Platform).
    appId: 'erp',
    status: 'active',
    lastModified: '1 week ago',
    modifiedBy: 'Mehak Garg',
    // Doc target is `Global-Operations`. No such group and no near-miss.
    // EVERYONE is strictly broader than the doc intends.
    audience: audienceOf(['global-ops']),
    rules: [
      rule({
        name: 'India office hours',
        when: when(
          card(
            cond('country', 'is', ['India']),
            cond('ip', 'is', ['203.0.113.0/24']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            // The doc pins this to Asia/Kolkata. `time` has no timezone field —
            // it evaluates in one implicit tenant-wide zone.
            cond('time', 'between', ['09:00', '19:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 640,
      }),
      rule({
        name: 'Germany office hours',
        when: when(
          card(
            cond('country', 'is', ['Germany']),
            cond('ip', 'is', ['198.51.100.0/24']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            // Europe/Berlin in the doc. Same implicit zone as the rule above.
            cond('time', 'between', ['08:00', '18:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 210,
      }),
      rule({
        name: 'US office hours',
        when: when(
          card(
            cond('country', 'is', ['United States']),
            cond('ip', 'is', ['192.0.2.0/24']),
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            // America/New_York in the doc.
            cond('time', 'between', ['08:00', '18:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 180,
      }),
      rule({
        name: 'After-hours, managed device',
        when: when(card(cond('mdm', 'is', ['Enrolled']), cond('device-reg', 'is', ['Registered']))),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        // SetRememberMfaTimeout(0)
        rememberMfa: false,
        forceMfaEachLogin: true,
        matchEstimate: 150,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 60,
    }),
  },


  {
    id: 's15-ma-onboarding',
    name: 'M&A Integration — Document Management',
    type: 'App Access',
    appId: 'dms',
    status: 'monitor',
    lastModified: '4 days ago',
    modifiedBy: 'Ravi Menon',
    // Doc target is `Acquired-Co-Employees`. No such group; `contractors` is the
    // nearest population (external people temporarily on the estate).
    audience: audienceOf(['acquired']),
    rules: [
      rule({
        name: 'Not yet in HR sync',
        // Doc: webhook(`legacy-hr`).employee_status != `active`.
        // No `legacy-hr` hook. `hk-hrms` is the right system but is
        // mode:'attribute-sync' with an empty responsePath, so it cannot answer a
        // rule condition. `hk-entitlement` is the closest usable sync boolean.
        when: when(card(cond('webhook', 'returns false', ['hk-hr-contract']))),
        decision: 'deny',
        matchEstimate: 31,
      }),
      rule({
        name: 'Migrated and compliant',
        when: when(
          card(
            cond('webhook', 'returns true', ['hk-hr-contract']),
            cond('mdm', 'is', ['Enrolled']),
            cond('posture', 'passes', ['Disk encryption']),
            cond('country', 'is', ['India', 'Germany']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        // Doc: + SetReAuthFrequency(8h). No field.
        matchEstimate: 62,
      }),
      rule({
        name: 'Migrated device, posture pending',
        when: when(
          card(
            cond('webhook', 'returns true', ['hk-hr-contract']),
            cond('mdm', 'is', ['Enrolled']),
            cond('country', 'is', ['India', 'Germany']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['Google Authenticator'],
        // Doc: + SetReAuthFrequency(4h) + SetRememberMfaTimeout(0).
        // Only the second half is expressible.
        rememberMfa: false,
        forceMfaEachLogin: true,
        matchEstimate: 28,
      }),
      rule({
        name: 'Unmigrated device, office only',
        when: when(
          card(
            cond('webhook', 'returns true', ['hk-hr-contract']),
            cond('ip', 'is', ['203.0.113.0/24']),
            cond('device-risk', 'below', ['50']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        secondFactorMethods: ['miniOrange Push'],
        rememberMfa: false,
        forceMfaEachLogin: true,
        matchEstimate: 19,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 14,
    }),
  },

  /* Scenario 1 — Office-Only Access (IP gate).
   */
  {
    id: 'uc1-office-only',
    name: 'HR Portal — Office or VPN only',
    type: 'App Access',
    appId: 'hr-portal',
    status: 'active',
    lastModified: '2 hours ago',
    modifiedBy: 'Mehak Garg',
    audience: audienceOf(['employees']),
    rules: [
      rule({
        name: 'Office or VPN',
        /* Multi-value on one attribute = the doc's OR form 1. `values` is ORed:
           predicate-prose.ts:64 — "A condition holds when ANY of its values
           match — the evaluator is `vals.some(...)`". But the OPERATOR is `is`,
           not `in`, so this reads "IP address is A or B". */
        when: when(card(cond('ip', 'is', ['203.0.113.0/24', '198.51.100.0/24']))),
        decision: '1fa',
        firstFactor: 'Password',
        matchEstimate: 291,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 126,
    }),
  },

  /* Scenario 2 — Business Hours Only (Time gate).
     (the only finance-function app in the catalogue). This puts a THIRD policy on
     'workday' alongside the seeded `finance-high` and the Scenario 1 fixture; see
     gap 2.9 — precedence between them is store array order and nothing else.
   */
  {
    id: 'uc2-business-hours',
    name: 'Finance Dashboard — working hours only',
    type: 'App Access',
    appId: 'finance-dashboard',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet T.',
    audience: audienceOf(['accounts']),
    rules: [
      rule({
        name: 'Working hours',
        /* Two of the scenario's three conditions. `Timezone = Asia/Kolkata` has
           NO condition in the catalogue and is dropped — see gap 2.2. */
        when: when(
          card(
            cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
            cond('time', 'between', ['09:00', '19:00']),
          ),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        /* Catalogue-true (`AUTH_METHODS`), editor-invisible (`rule-form.METHODS`).
           See gap 2.4. */
        secondFactorMethods: ['Google Authenticator'],
        matchEstimate: 71,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 15,
    }),
  },

  /* Scenario 3 — Country Allowlist (Location gate).
     Doc app: Salesforce — 'salesforce' EXISTS. It is already claimed by the
     seeded `zero-trust` policy (status 'active'); see gap 3.2.
     Doc target: `Default Group` (includes everyone) → the `EVERYONE` flag. */
  {
    id: 'uc3-country-allowlist',
    name: 'Salesforce — India and US only',
    type: 'App Access',
    appId: 'salesforce',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Mehak Garg',
    audience: EVERYONE,
    rules: [
      rule({
        name: 'Allowed countries',
        /* Multi-value = OR. Both values exist in the hardcoded five-item option
           list; a sixth country could not be named at all. See gap 3.3. */
        when: when(card(cond('country', 'is', ['India', 'United States']))),
        decision: '2fa',
        firstFactor: 'Password',
        /* The one clean mapping in all four scenarios:
           `2F: ALLOW_ANY (2-factor type)` → secondFactor: 'any'. */
        secondFactor: 'any',
        matchEstimate: 1183,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 57,
    }),
  },

  /* Scenario 4 — Registered Devices Only (Device gate).
     Doc app: "Code Repository (GitLab)" — GitLab does NOT exist in `apps`.
     Nearest real id: 'github' (GitHub Enterprise). Already claimed by the seeded
     `eng-vpn` policy, but at status 'monitor', which does not decide sign-ins
     (`app-policies.decidesFor` requires `enforces`), so there is no live
     precedence collision — only an indistinguishable pair of "assignments".
     Doc target: Group `Engineering` → 'engineering' EXISTS (310). */
  {
    id: 'uc4-registered-devices',
    name: 'Code repository — trusted device required',
    type: 'App Access',
    appId: 'github',
    status: 'active',
    lastModified: '4 days ago',
    modifiedBy: 'Mehak Garg',
    audience: audienceOf(['engineering']),
    rules: [
      rule({
        name: 'Trusted device (either root)',
        /* The doc's OR form 2 — cross-attribute ANY OF. Two cards ARE the
           disjunction: `Predicate.join` defaults to 'or' and each card's own
           join defaults to 'and', so this is exactly
           (device-reg = Registered) OR (mdm = Enrolled).
           This is the ONE predicate-shape requirement in S1–S4 and the model
           carries it natively. */
        when: when(
          namedCard('Registered with IAM', cond('device-reg', 'is', ['Registered'])),
          namedCard('Enrolled in MDM', cond('mdm', 'is', ['Enrolled'])),
        ),
        decision: '2fa',
        firstFactor: 'Password',
        secondFactor: 'specific',
        /* The ONLY method name in all four scenarios present in BOTH
           `AUTH_METHODS` and the editor's `rule-form.METHODS`. */
        secondFactorMethods: ['miniOrange Push'],
        matchEstimate: 268,
      }),
    ],
    fallback: rule({
      name: 'Default rule',
      when: anySignIn(),
      decision: 'deny',
      matchEstimate: 42,
    }),
  },
]

// --- Templates and scenarios -------------------------------------------------

export const templates: Template[] = [
  {
    id: 't-mfa', name: 'Require MFA for all users', category: 'Quick Protection',
    description: 'Org-wide second factor on every login.', ruleCount: 1,
    author: 'Mehak Garg', when: '2 days ago',
    rules: [{ name: 'Require MFA', ifText: 'All users, every login', decision: '2fa' }],
  },
  {
    id: 't-device', name: 'Adaptive device trust (90-day)', category: 'Device-based',
    description: 'Known devices skip extra auth; new devices verify.', ruleCount: 2,
    author: 'Mehak Garg', when: '1 week ago',
    rules: [
      { name: 'Trusted device', ifText: 'Known device trusted < 90 days', decision: '1fa' },
      { name: 'New or expired device', ifText: 'New, unrecognized, or expired device', decision: '2fa' },
    ],
  },
  {
    id: 't-anon', name: 'Block anonymized traffic', category: 'Risk-based',
    description: 'Deny Tor, VPN, and proxy traffic.', ruleCount: 1,
    author: 'System', when: '—',
    rules: [{ name: 'Block anonymizers', ifText: 'Source is Tor, VPN or a known proxy', decision: 'deny' }],
  },
  {
    id: 't-baseline', name: 'Baseline MFA', category: 'Quick Protection',
    description: 'Second factor for every user. A safe org-wide default.', ruleCount: 1,
    author: 'Xecurify', when: '—', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' },
    rules: [{ name: 'Require MFA', ifText: 'All users, every login', decision: '2fa' }],
  },
  {
    id: 't-zerotrust', name: 'Zero-Trust starter', category: 'Device-based',
    description: 'Device fingerprint + network + risk gating for sensitive apps.', ruleCount: 2,
    author: 'Xecurify', when: '—', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' },
    rules: [
      { name: 'Block unrecognised devices', ifText: 'Device not recognised by Corporate managed', decision: 'deny' },
      { name: 'Step up off-network', ifText: 'Outside Office Network', decision: '2fa' },
    ],
  },
]

export interface Scenario {
  id: string
  name: string
  description: string
  category: 'Quick Protection' | 'Device-based' | 'Risk-based' | 'Compliance'
  tag?: string
  badge?: string
  /** Shipped by Xecurify. Absent means this tenant authored it. */
  provided?: boolean
  /* When miniOrange last reviewed this template, and who signed it off.

     Deliberately a dated attribution rather than a rating. A star average on a
     security template makes popularity a proxy for appropriateness, and in this
     catalogue those rank in opposite directions — the one-rule "Require MFA for
     all users" is the easiest thing here to adopt, and "Regulated data access"
     with five ordered rules is the hardest. A review record is falsifiable, has
     a name against it, and decays honestly: an old date tells you the template
     may predate the current threat model, where a rating only ever rises. */
  reviewed?: { by: string; on: string }
  /** Who wrote it, on the tenant's own templates. */
  author?: string
  when?: string
  /* Who the policy this template builds should govern.

     It used to be stamped on each built rule, which meant a two-rule template
     could produce a policy whose rules disagreed about their own scope. One
     audience per template, applied to the policy it creates. */
  audience: Audience
  rules: { name: string; ifText: string; decision: AccessDecision; build: () => Rule }[]
}

export const scenarios: Scenario[] = [
  {
    id: 's-mfa', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-09' }, name: 'Require MFA for all users', category: 'Quick Protection', tag: 'Identity',
    description: 'Every user must verify with a second factor on every login.',
    audience: EVERYONE,
    rules: [{
      name: 'Require MFA', ifText: 'All users, every login', decision: '2fa',
      build: () => rule({ name: 'Require MFA',decision: '2fa', matchEstimate: 1240 }),
    }],
  },
  {
    id: 's-office', provided: true, name: 'Block access outside office network', category: 'Quick Protection', tag: 'Network',
    description: 'Deny login attempts from IPs outside your network zones.',
    audience: EVERYONE,
    rules: [{
      name: 'Outside office network', ifText: 'Not in Office Network', decision: 'deny',
      build: () => rule({ name: 'Outside office network',when: when(card(cond('zone', 'not in zone', ['office']))), decision: 'deny', matchEstimate: 340 }),
    }],
  },
  {
    id: 's-contractor', provided: true, name: 'Stricter auth for contractors', category: 'Quick Protection', tag: 'Identity',
    description: 'Contractors face stronger authentication requirements than employees.',
    audience: audienceOf(['contractors']),
    rules: [{
      name: 'Contractor step-up', ifText: 'User type is Contractor', decision: '2fa',
      build: () => rule({ name: 'Contractor step-up',when: when(card(cond('user-type', 'is', ['Contractor']))), decision: '2fa', matchEstimate: 154 }),
    }],
  },
  {
    id: 's-passwordless', provided: true, name: 'Passwordless for executives', category: 'Quick Protection', tag: 'Identity',
    description: 'Executives with miniOrange App can sign in with a push notification.',
    audience: audienceOf(['executives']),
    rules: [{
      name: 'Executive passwordless', ifText: 'Group is Executives', decision: '1fa',
      build: () => rule({ name: 'Executive passwordless',when: when(card(cond('group', 'in', ['Executives']))), decision: '1fa', firstFactor: 'Any', matchEstimate: 12 }),
    }],
  },
  {
    id: 's-trust', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' }, name: 'Adaptive device trust (90-day)', category: 'Device-based', tag: 'Device', badge: 'Recommended for SIB/HRS',
    description: 'Known devices skip extra auth. New or expired devices require full verification.',
    audience: EVERYONE,
    rules: [
      {
        name: 'Trusted device', ifText: 'Known device trusted < 90 days', decision: '1fa',
        build: () => rule({ name: 'Trusted device',when: when(card(cond('trust-age', 'under', ['90']))), decision: '1fa', matchEstimate: 980 }),
      },
      {
        name: 'New or expired device', ifText: 'New, unrecognized, or expired device', decision: '2fa',
        build: () => rule({ name: 'New or expired device',when: when(card(cond('device-reg', 'is', ['Unregistered']))), decision: '2fa', matchEstimate: 260 }),
      },
    ],
  },
  {
    id: 's-compromised', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-11' }, name: 'Block compromised devices', category: 'Device-based', tag: 'Device',
    description: 'Deny access from jailbroken, rooted, or unrecognised devices.',
    audience: EVERYONE,
    rules: [{
      name: 'Block compromised devices', ifText: 'Not recognised by Corporate managed', decision: 'deny',
      build: () => rule({ name: 'Block compromised devices',when: when(card(cond('fingerprint', 'not recognised by', ['fp-corp']))), decision: 'deny', matchEstimate: 108 }),
    }],
  },
  {
    id: 's-managed', provided: true, name: 'Managed devices only', category: 'Device-based', tag: 'Device',
    description: 'Restrict access to devices enrolled in your MDM.',
    audience: EVERYONE,
    rules: [{
      name: 'MDM enrolled only', ifText: 'MDM Managed is Not enrolled', decision: 'deny',
      build: () => rule({ name: 'MDM enrolled only',when: when(card(cond('mdm', 'is', ['Not enrolled']))), decision: 'deny', matchEstimate: 210 }),
    }],
  },
  {
    id: 's-suspicious', provided: true, name: 'Step up on suspicious login', category: 'Risk-based', tag: 'Risk',
    description: 'Challenge users when behavioral signals indicate elevated risk.',
    audience: EVERYONE,
    rules: [{
      name: 'Elevated risk', ifText: 'ML Risk Score is High', decision: '2fa',
      build: () => rule({ name: 'Elevated risk',when: when(card(cond('ml-risk', 'is', ['High']))), decision: '2fa', matchEstimate: 64 }),
    }],
  },
  {
    id: 's-anon', provided: true, reviewed: { by: 'miniOrange Security', on: '2025-06' }, name: 'Block anonymized traffic', category: 'Risk-based', tag: 'Network',
    description: 'Deny access from Tor, VPNs, and known proxies.',
    audience: EVERYONE,
    rules: [{
      name: 'Anonymized source', ifText: 'In zone Anonymizers', decision: 'deny',
      build: () => rule({ name: 'Anonymized source',when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny', matchEstimate: 31 }),
    }],
  },
  {
    id: 's-country', provided: true, name: 'New country detection', category: 'Risk-based', tag: 'Risk',
    description: 'Require additional verification from a new country.',
    audience: EVERYONE,
    rules: [{
      name: 'Unfamiliar country', ifText: 'Country is not India', decision: '2fa',
      build: () => rule({ name: 'Unfamiliar country',when: when(card(cond('country', 'is not', ['India']))), decision: '2fa', matchEstimate: 88 }),
    }],
  },
  {
    id: 's-firstlogin', author: 'Mehak Garg', when: '1 week ago', name: 'First login enforcement', category: 'Compliance', tag: 'Identity', badge: 'SIB/HRS',
    description: 'First-time users and users with reset MFA must complete a specific auth chain.',
    audience: EVERYONE,
    rules: [{
      name: 'First login chain', ifText: 'Auth state is First time login', decision: '2fa',
      build: () => rule({ name: 'First login chain',when: when(card(cond('auth-state', 'is', ['First time login']))), decision: '2fa', secondFactor: 'chain', matchEstimate: 42 }),
    }],
  },
  {
    id: 's-session', provided: true, name: 'Session limits for contractors', category: 'Compliance', tag: 'Identity',
    description: 'Cap session duration and require re-authentication for contractors.',
    audience: audienceOf(['contractors']),
    rules: [{
      name: 'Contractor session cap', ifText: 'User type is Contractor', decision: '2fa',
      build: () => rule({ name: 'Contractor session cap',when: when(card(cond('user-type', 'is', ['Contractor']))), decision: '2fa', matchEstimate: 154 }),
    }],
  },

  // --- Multi-rule templates -------------------------------------------------
  // Real policies are rarely one rule. These exercise the ordered-evaluation
  // model properly, and they are what the card back has to stay legible with.
  {
    id: 's-zerotrust', provided: true, reviewed: { by: 'miniOrange Security', on: '2026-01' }, name: 'Zero-Trust baseline', category: 'Device-based', tag: 'Device', badge: 'Recommended',
    description: 'Layered checks in order — block the broken, trust the known, verify everything in between.',
    audience: EVERYONE,
    rules: [
      { name: 'Block unrecognised devices', ifText: 'Device not recognised by Corporate managed', decision: 'deny',
        build: () => rule({ name: 'Block unrecognised devices',when: when(card(cond('fingerprint', 'not recognised by', ['fp-corp']))), decision: 'deny', matchEstimate: 108 }) },
      { name: 'Block anonymised sources', ifText: 'Connection is Tor, VPN or a known proxy', decision: 'deny',
        build: () => rule({ name: 'Block anonymised sources',when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny', matchEstimate: 31 }) },
      { name: 'Trusted office device', ifText: 'On Office Network and device registered', decision: '1fa',
        build: () => rule({ name: 'Trusted office device',when: when(card(cond('zone', 'in zone', ['office']), cond('device-reg', 'is', ['Registered']))), decision: '1fa', matchEstimate: 820 }) },
      { name: 'Off-network step-up', ifText: 'Outside Office Network', decision: '2fa',
        build: () => rule({ name: 'Off-network step-up',when: when(card(cond('zone', 'not in zone', ['office']))), decision: '2fa', matchEstimate: 340 }) },
      { name: 'Elevated risk', ifText: 'ML Risk Score is High', decision: '2fa',
        build: () => rule({ name: 'Elevated risk',when: when(card(cond('ml-risk', 'is', ['High']))), decision: '2fa', matchEstimate: 64 }) },
    ],
  },
  {
    id: 's-regulated', author: 'Mehak Garg', when: '3 days ago', name: 'Regulated data access', category: 'Compliance', tag: 'Identity', badge: 'SIB/HRS',
    description: 'For apps holding regulated records: managed devices, approved geography, working hours, and a phishing-resistant factor.',
    audience: audienceOf(['finance']),
    rules: [
      { name: 'Deny unmanaged devices', ifText: 'MDM Managed is Not enrolled', decision: 'deny',
        build: () => rule({ name: 'Deny unmanaged devices',when: when(card(cond('mdm', 'is', ['Not enrolled']))), decision: 'deny', matchEstimate: 42 }) },
      { name: 'Deny outside approved countries', ifText: 'Country is not India', decision: 'deny',
        build: () => rule({ name: 'Deny outside approved countries',when: when(card(cond('country', 'is not', ['India']))), decision: 'deny', matchEstimate: 18 }) },
      { name: 'Out-of-hours verification', ifText: 'Outside 09:00–18:00', decision: '2fa',
        build: () => rule({ name: 'Out-of-hours verification',when: when(card(cond('time', 'not between', ['09:00', '18:00']))), decision: '2fa', matchEstimate: 51 }) },
      { name: 'New device verification', ifText: 'Device trust age under 30 days', decision: '2fa',
        build: () => rule({ name: 'New device verification',when: when(card(cond('trust-age', 'under', ['30']))), decision: '2fa', matchEstimate: 26 }) },
      { name: 'Everything else in-office', ifText: 'On Office Network', decision: '1fa',
        build: () => rule({ name: 'Everything else in-office',when: when(card(cond('zone', 'in zone', ['office']))), decision: '1fa', matchEstimate: 86 }) },
    ],
  },
  {
    id: 's-contractor-life', author: 'Jaspreet T.', when: '2 weeks ago', name: 'Contractor lifecycle', category: 'Compliance', tag: 'Identity',
    description: 'Tighter treatment for non-employees across first login, device state, hours and session length.',
    audience: audienceOf(['contractors']),
    rules: [
      { name: 'First login chain', ifText: 'Auth state is First time login', decision: '2fa',
        build: () => rule({ name: 'First login chain',when: when(card(cond('auth-state', 'is', ['First time login']))), decision: '2fa', secondFactor: 'chain', matchEstimate: 22 }) },
      { name: 'Unregistered device', ifText: 'Device Registration is Unregistered', decision: 'deny',
        build: () => rule({ name: 'Unregistered device',when: when(card(cond('device-reg', 'is', ['Unregistered']))), decision: 'deny', matchEstimate: 37 }) },
      { name: 'Outside contract hours', ifText: 'Outside 09:00–18:00 Mon–Fri', decision: '2fa',
        build: () => rule({ name: 'Outside contract hours',when: when(card(cond('time', 'not between', ['09:00', '18:00']))), decision: '2fa', matchEstimate: 64 }) },
      { name: 'Standard contractor access', ifText: 'User type is Contractor', decision: '2fa',
        build: () => rule({ name: 'Standard contractor access',when: when(card(cond('user-type', 'is', ['Contractor']))), decision: '2fa', matchEstimate: 154 }) },
    ],
  },
]

export function blankRule(name = 'New rule'): Rule {
  return rule({ name, decision: '2fa', matchEstimate: 1240 })
}

/** The one name the terminal rule is allowed to have. */
export const FALLBACK_NAME = 'Nothing else matched'

/* The terminal rule.

   Its `when` is the always-true predicate and the builder never offers to edit
   it — "everything above missed" is a position in the list, not a condition you
   could write in a card, and drawing an empty WHEN section on it would invite
   somebody to try. */
export function fallbackRule(decision: AccessDecision = '1fa'): Rule {
  return rule({ name: FALLBACK_NAME, decision, matchEstimate: 0 })
}

export function blankPolicy(name: string, appId?: string): Policy {
  return {
    id: `p${Date.now()}`,
    name,
    type: 'App Access',
    appId,
    /* A policy nobody has published yet is a DRAFT, not something switched
       off. It has never been on. */
    status: 'draft',
    lastModified: 'Just now',
    modifiedBy: 'You',
    /* A new policy governs everyone until somebody narrows it. The opposite
       default — nobody — makes a policy that silently does nothing, which is
       the one failure an access console must never ship quietly. */
    audience: EVERYONE,
    fallback: fallbackRule('1fa'),
    rules: [],
  }
}

// --- Decision log ------------------------------------------------------------

export interface LogEntry {
  time: string
  user: string
  app: string
  matchedRule: string
  decision: 'Allow' | 'Deny' | 'Challenge'
  conditions: { label: string; matched: boolean }[]
  ip: string
  device: string
  place: string
  factor: string
  latency: string
  risk: string
  chain: { rule: string; outcome: string }[]
}

/* Every row's app is the app its matched rule's policy protects.

   That was free when a policy could cover five applications; under one app per
   policy it is a constraint, and the seed broke it in three places — two
   Salesforce sign-ins and a GitHub one all matching rules that belong to
   "Finance Team – High Security", which protects Workday. A log that shows a
   rule firing on an application its policy does not cover is a log that teaches
   the reader the wrong model of the engine.

   Only "Default Rule" is free to appear anywhere: it is the system policy's,
   and that is the one policy with no application. */
export const decisionLog: LogEntry[] = [
  {
    time: '11:48:02', user: 'priya@mo.com', app: 'Workday', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '115.160.205.254', device: 'MO-LT-0510', place: 'Pune, IN', factor: 'Push', latency: '142ms', risk: 'Low · ML Engine: No escalation',
    chain: [{ rule: 'Rule 1 · Block compromised devices', outcome: 'skipped (no match)' }, { rule: 'Rule 2 · Off-network finance access', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:47:51', user: 'arun@mo.com', app: 'Zoom', matchedRule: 'Default Rule', decision: 'Allow',
    conditions: [{ label: 'No rule matched', matched: false }],
    ip: '10.4.2.19', device: 'MO-LT-0233', place: 'Pune, IN', factor: 'Password', latency: '88ms', risk: 'Low',
    chain: [{ rule: 'Rules 1–4', outcome: 'skipped (no match)' }, { rule: 'Default Rule', outcome: 'applied' }],
  },
  {
    time: '11:47:30', user: 'contractor@ext.com', app: 'Workday', matchedRule: 'Block compromised devices', decision: 'Deny',
    conditions: [{ label: 'Not recognised by Corporate managed', matched: true }],
    ip: '185.220.101.12', device: 'unknown', place: 'Unknown (Tor exit)', factor: '—', latency: '61ms', risk: 'High · ML Engine: escalated',
    chain: [{ rule: 'Rule 1 · Block compromised devices', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:46:12', user: 'mehak@mo.com', app: 'Workday', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '49.36.12.8', device: 'MO-LT-0119', place: 'Bengaluru, IN', factor: 'OTP', latency: '210ms', risk: 'Medium',
    chain: [{ rule: 'Rule 1', outcome: 'skipped (no match)' }, { rule: 'Rule 2', outcome: 'matched — evaluation stopped' }],
  },
  {
    time: '11:45:03', user: 'jwttest@wttest.com', app: 'Salesforce', matchedRule: 'Default Rule', decision: 'Allow',
    conditions: [{ label: 'No rule matched', matched: false }],
    ip: '10.4.9.71', device: 'MO-DT-0044', place: 'Pune, IN', factor: 'Password', latency: '73ms', risk: 'Low',
    chain: [{ rule: 'Rules 1–4', outcome: 'skipped (no match)' }, { rule: 'Default Rule', outcome: 'applied' }],
  },
  {
    time: '11:44:20', user: 'ops@mo.com', app: 'Workday', matchedRule: 'Off-network finance access', decision: 'Challenge',
    conditions: [{ label: 'Group is Finance', matched: true }, { label: 'Outside Office Network', matched: true }],
    ip: '86.14.22.9', device: 'MO-MB-0091', place: 'London, UK', factor: 'Push', latency: '164ms', risk: 'Medium',
    chain: [{ rule: 'Rule 1', outcome: 'skipped (no match)' }, { rule: 'Rule 2', outcome: 'matched — evaluation stopped' }],
  },
]
