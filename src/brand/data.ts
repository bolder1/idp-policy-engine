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
export type PolicyStatus = 'active' | 'inactive' | 'monitor' | 'always-on'

/** Decides real sign-ins. The question Coverage, conflicts and cover-counts ask. */
export const enforces = (p: { status: PolicyStatus }) =>
  p.status === 'active' || p.status === 'always-on'

/** Runs and records what it would have done. Enforcing implies evaluating. */
export const evaluates = (p: { status: PolicyStatus }) => enforces(p) || p.status === 'monitor'

export interface App {
  id: string
  name: string
  protocol: 'SAML' | 'OIDC'
  glyph: string
  tint: string
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

export const CONDITION_CATALOGUE: ConditionType[] = [
  { id: 'ip', label: 'IP Address', group: 'Network', hint: 'Match by IPv4/IPv6 address, range, or CIDR', operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'zone', label: 'Network Zone', group: 'Network', hint: 'Match by named zone from your library', operators: ['in zone', 'not in zone'], valueKind: 'zone' },

  { id: 'country', label: 'Country', group: 'Location', hint: 'Match by country', operators: ['is', 'is not'], valueKind: 'list', options: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore'] },
  { id: 'state', label: 'State / Province', group: 'Location', hint: 'Match by state or region', operators: ['is', 'is not'], valueKind: 'list', options: ['Maharashtra', 'Karnataka', 'California', 'Texas'] },
  { id: 'city', label: 'City', group: 'Location', hint: 'Match by city', operators: ['is', 'is not'], valueKind: 'list', options: ['Pune', 'Bengaluru', 'London', 'Austin'] },
  { id: 'coords', label: 'Coordinates', group: 'Location', hint: 'Match within a geographic radius', operators: ['within'], valueKind: 'range' },

  { id: 'time', label: 'Time', group: 'Time', hint: 'Match by login time, timezone, and day of week', operators: ['between', 'not between'], valueKind: 'time' },

  { id: 'device-type', label: 'Device Type', group: 'Device', hint: 'Mobile, PC, tablet, etc.', operators: ['is', 'is not'], valueKind: 'list', options: ['Mobile', 'PC', 'Tablet', 'Other'] },
  { id: 'mac', label: 'MAC Address', group: 'Device', hint: 'Match device MAC addresses', operators: ['is', 'is not'], valueKind: 'text' },
  { id: 'os', label: 'Operating System', group: 'Device', hint: 'Match OS name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'ChromeOS'] },
  { id: 'mdm', label: 'MDM Managed', group: 'Device', hint: 'Require MDM enrollment', operators: ['is', 'is not'], valueKind: 'list', options: ['Enrolled', 'Not enrolled'] },
  { id: 'browser', label: 'Browser', group: 'Device', hint: 'Match browser name and version', operators: ['is', 'is not'], valueKind: 'list', options: ['Chrome', 'Edge', 'Safari', 'Firefox'] },
  { id: 'device-risk', label: 'Device Risk Score', group: 'Risk', hint: 'Device risk management score', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'ml-risk', label: 'ML Risk Score', group: 'Risk', hint: 'AI-derived overall risk score', operators: ['is', 'is not'], valueKind: 'list', options: ['Low', 'Medium', 'High'] },
  { id: 'device-count', label: 'Number of Devices', group: 'Device', hint: 'Limit registered devices per user', operators: ['above', 'below'], valueKind: 'range' },
  { id: 'device-reg', label: 'Device Registration', group: 'Device', hint: 'Registered, pending, or unregistered', operators: ['is', 'is not'], valueKind: 'list', options: ['Registered', 'Pending', 'Unregistered'] },
  /* Replaced the old Device Posture Policy condition. Posture asked whether a
     device was healthy; this asks whether it is the same device as last time,
     which is what the fingerprint profiles actually decide. */
  { id: 'fingerprint', label: 'Device Fingerprint', group: 'Device', hint: 'Match by saved fingerprint profile from your library', operators: ['recognised by', 'not recognised by'], valueKind: 'fingerprint' },

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

/** A single predicate. `values: []` means UNSET — a first-class, diagnosable state. */
export interface Condition {
  id: string
  typeId: string
  operator: string
  values: string[]
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
  /* Why this rule exists, in the author's words.

     A name says what a rule does; it cannot say what it is for. "Off-network
     finance access" tells the next administrator the predicate and nothing
     about the decision behind it — whether it exists because of a regulator,
     because of an incident, or because somebody was experimenting in March.
     Those three have completely different answers to "can I delete this".

     The framework doc's third persona is defined by wanting exactly this:
     "every rule needs a name, a description, a rationale". Two of the three
     had nowhere to live. Optional rather than required, because forcing a
     sentence out of somebody mid-edit produces "asdf" and teaches everyone
     afterwards that the field is noise. */
  description?: string
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
  { id: 'salesforce', name: 'Salesforce', protocol: 'SAML', glyph: '☁', tint: '#199fd8' },
  { id: 'workday', name: 'Workday', protocol: 'SAML', glyph: '▲', tint: '#f5a623' },
  { id: 'github', name: 'GitHub Enterprise', protocol: 'OIDC', glyph: '◐', tint: '#24292e' },
  { id: 'm365', name: 'Microsoft 365', protocol: 'SAML', glyph: '▦', tint: '#e14c2a' },
  { id: 'jira', name: 'Jira', protocol: 'OIDC', glyph: '◆', tint: '#2684ff' },
  { id: 'slack', name: 'Slack', protocol: 'SAML', glyph: '✳', tint: '#611f69' },
  { id: 'aws', name: 'AWS Console', protocol: 'SAML', glyph: '◢', tint: '#ff9900' },
  { id: 'zoom', name: 'Zoom', protocol: 'SAML', glyph: '▣', tint: '#2d8cff' },
  { id: 'box', name: 'Box', protocol: 'OIDC', glyph: '▢', tint: '#0061d5' },
  { id: 'servicenow', name: 'ServiceNow', protocol: 'SAML', glyph: '◉', tint: '#62d84e' },
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
export function cond(typeId: string, operator: string, values: string[] = []): Condition {
  return { id: nextCondId(), typeId, operator, values }
}

/** One alternative. Throws on empty, because an empty card matches everything. */
export function card(...conditions: Condition[]): ConditionCard {
  if (conditions.length === 0) throw new Error('A card must hold at least one condition')
  return { id: nextCardId(), conditions }
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
    when: {
      join: r.when.join,
      cards: r.when.cards.map((k) => ({
        ...k,
        id: nextCardId(),
        conditions: k.conditions.map((c) => ({ ...c, id: nextCondId() })),
      })),
    },
  }
}

export const policies: Policy[] = [
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
  {
    id: 'finance-high',
    name: 'Finance Team – High Security',
    type: 'App Access',
    appId: 'workday',
    status: 'active',
    lastModified: '2 hours ago',
    modifiedBy: 'Mehak Garg',
    audience: EVERYONE,
    rules: [
      rule({
        name: 'Block compromised devices',
        when: when(card(cond('fingerprint', 'not recognised by', ['fp-corp']))),
        decision: 'deny',
        matchEstimate: 108,
      }),
      rule({
        name: 'Off-network finance access',
        description: 'Required by the FY26 audit finding on remote access to ledger systems. The 09:00–17:00 window is the auditor’s, not ours — check with Compliance before widening it.',
        when: when(
          card(cond('group', 'in', ['finance']), cond('zone', 'not in zone', ['office']), cond('time', 'between', ['09:00', '17:00'])),
          card(cond('group', 'in', ['finance']), cond('device-type', 'is', ['Mobile', 'Tablet'])),
        ),
        decision: '2fa',
        matchEstimate: 85,
      }),
      rule({
        name: 'Executive step-up',
        when: when(card(cond('group', 'in', ['executives']), cond('ml-risk', 'is', ['High']), cond('zone', 'not in zone', ['office']))),
        decision: '2fa',
        secondFactor: 'specific',
        /* "Specific" with nothing named is a rule that cannot be satisfied —
           the diagnostics checker found this gap in the seed.

           These are matched against the live catalogue BY NAME (see
           `rulesUsing` in AuthMethods.tsx), so they have to be names that
           actually exist in methods.ts. They were 'WebAuthn / FIDO2 + Passkeys'
           and 'miniOrange Authenticator' — spellings from the older catalogue
           in this file, which nothing reads any more. Neither resolved, so the
           join found nothing and "Used in N policy rules" rendered on none of
           the twenty-one method cards. */
        secondFactorMethods: ['FIDO2 / Passkey', 'miniOrange Push'],
        matchEstimate: 12,
      }),
      rule({
        name: 'Contractor baseline',
        when: when(card(cond('group', 'in', ['contractors']), cond('user-type', 'is', ['Contractor']))),
        decision: '1fa',
        matchEstimate: 154,
      }),
    ],
  },
  /* The one seeded policy built to survive the gauntlet.

     Every other policy here is realistic, which is to say it has holes — and a
     product where the best available score is F teaches its user that the score
     only ever says "bad", at which point they stop reading it. This one exists
     so the top of the ladder is visible in the product and not just in the
     grading function.

     It is also the shape the checks argue for, in order: refuse what cannot be
     legitimate, refuse what cannot complete a challenge, then step up on risk,
     on unmanaged hardware, and on the two moments an account is most
     impersonated. Everything left is a managed device on a known network, which
     is the only case that earns a single factor. */
  {
    id: 'zero-trust',
    name: 'Zero-Trust Baseline',
    type: 'App Access',
    appId: 'salesforce',
    status: 'active',
    lastModified: '4 hours ago',
    modifiedBy: 'Mehak Garg',
    audience: EVERYONE,
    rules: [
      rule({
        name: 'Block anonymised sources',
        description: 'No legitimate sign-in to this app has ever arrived from a Tor exit or a hosting ASN. Written after the March access review; delete only if a customer is genuinely behind one of these networks.',
        when: when(card(cond('zone', 'in zone', ['anon']))),
        decision: 'deny',
        matchEstimate: 31,
      }),
      rule({
        name: 'Block accounts with no second factor',
        description: 'A challenge nobody can complete is a lockout dressed as security. Refusing the sign-in outright sends the user to enrolment instead of to the help desk.',
        when: when(card(cond('auth-state', 'is', ['No MFA configured']))),
        decision: 'deny',
        matchEstimate: 6,
      }),
      rule({
        name: 'Verify elevated risk',
        when: when(card(cond('ml-risk', 'is', ['High']))),
        decision: '2fa',
        matchEstimate: 64,
      }),
      rule({
        name: 'Verify unmanaged devices',
        when: when(card(cond('mdm', 'is', ['Not enrolled']))),
        decision: '2fa',
        matchEstimate: 410,
      }),
      /* Redundant against the rule above for anyone on unmanaged hardware, and
         deliberately kept: a first login from a *managed* device is still the
         one moment an account is worth binding to a person. */
      rule({
        name: 'Verify first login and resets',
        description: 'Redundant against the unmanaged-device rule above for most people, and kept deliberately: a first login from a managed device is still the one moment an account is worth binding to a person.',
        when: when(
          card(cond('auth-state', 'is', ['First time login'])),
          card(cond('auth-state', 'is', ['MFA recently reset'])),
        ),
        decision: '2fa',
        matchEstimate: 60,
      }),
    ],
  },
  {
    id: 'contractor-session',
    name: 'Contractor Session Limits',
    type: 'Session',
    appId: 'slack',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Jaspreet T.',
    audience: audienceOf(['contractors']),
    rules: [
      rule({ name: 'Cap session length',when: when(card(cond('user-type', 'is', ['Contractor']))), decision: '1fa', matchEstimate: 154 }),
      rule({ name: 'Re-auth after idle',when: when(card(cond('trust-age', 'over', ['30']))), decision: '2fa', matchEstimate: 96 }),
    ],
  },
  {
    id: 'account-recovery',
    name: 'Account Recovery Verification',
    type: 'Account Management',
    status: 'active',
    lastModified: '3 days ago',
    modifiedBy: 'Mehak Garg',
    configIssue: 'No application assigned — this policy cannot take effect until one is attached.',
    audience: EVERYONE,
    rules: [
      rule({ name: 'First login enforcement',when: when(card(cond('auth-state', 'is', ['First time login']))), decision: '2fa', matchEstimate: 42 }),
      rule({ name: 'After MFA reset',when: when(card(cond('auth-state', 'is', ['MFA recently reset']))), decision: '2fa', matchEstimate: 18 }),
      rule({ name: 'No MFA configured',when: when(card(cond('auth-state', 'is', ['No MFA configured']))), decision: 'deny', matchEstimate: 6 }),
    ],
  },
  {
    id: 'exec-stepup',
    name: 'Executive Step-up Authentication',
    type: 'App Access',
    appId: 'm365',
    status: 'active',
    lastModified: '5 days ago',
    modifiedBy: 'Mehak Garg',
    audience: audienceOf(['executives']),
    rules: [
      rule({ name: 'Deny anonymized traffic',when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny', matchEstimate: 12 }),
      /* The Lenskart/Oberoi shape, seeded so the capability is exercised rather
         than merely available: a condition this engine cannot evaluate, asked
         of a system that can. Paired with a fail-open hook on a deny rule
         deliberately — the linter reports it, and a warning nobody can trigger
         is a warning nobody trusts. */
      rule({
        name: 'External risk verdict',
        description: 'The risk platform sees payment history this console never will. Owner is the risk team; changes to the threshold happen there, not here.',
        when: when(card(cond('webhook', 'returns true', ['hk-fraud']))),
        decision: 'deny',
        matchEstimate: 3,
      }),
      rule({ name: 'New country',when: when(card(cond('country', 'is not', ['India']))), decision: '2fa', matchEstimate: 9 }),
      rule({ name: 'Unmanaged device',when: when(card(cond('mdm', 'is', ['Not enrolled']))), decision: '2fa', matchEstimate: 7 }),
      rule({ name: 'High ML risk',when: when(card(cond('ml-risk', 'is', ['High']))), decision: '2fa', matchEstimate: 4 }),
      rule({ name: 'Trusted office access',when: when(card(cond('zone', 'in zone', ['office']))), decision: '1fa', matchEstimate: 12 }),
    ],
  },
  {
    id: 'default-workforce',
    name: 'Default Workforce Access',
    type: 'App Access',
    appId: 'zoom',
    status: 'inactive',
    lastModified: '1 week ago',
    modifiedBy: 'System',
    audience: EVERYONE,
    rules: [rule({ name: 'Everyone', decision: '1fa', matchEstimate: 1240 })],
  },
  {
    id: 'partner-portal',
    name: 'Partner Portal Access',
    type: 'App Access',
    appId: 'box',
    status: 'inactive',
    lastModified: '2 weeks ago',
    modifiedBy: 'Jaspreet T.',
    configIssue: 'No rules configured — every sign-in falls straight through to the default rule.',
    audience: audienceOf(['contractors']),
    rules: [],
  },
  {
    id: 'eng-vpn',
    name: 'Engineering VPN Policy',
    type: 'App Access',
    appId: 'github',
    /* Seeded in monitor rather than inactive, so the state exists in the demo
       estate and not only in the type. Its first rule denies everything off the
       corporate ASN, which is precisely the kind of rule nobody should switch
       on without watching it for a week first. */
    status: 'monitor',
    lastModified: '2 weeks ago',
    modifiedBy: 'Mehak Garg',
    audience: audienceOf(['engineering']),
    rules: [
      rule({ name: 'Require corporate ASN', description: 'Written during the VPN migration and never revisited. Engineering now works from home two days a week, so this may be denying more than it was meant to.',when: when(card(cond('zone', 'not in zone', ['asn']))), decision: 'deny', matchEstimate: 310 }),
      rule({ name: 'Known device',when: when(card(cond('device-reg', 'is', ['Registered']))), decision: '1fa', matchEstimate: 280 }),
      rule({ name: 'Everything else',decision: '2fa', matchEstimate: 30 }),
    ],
  },
  {
    id: 'idle-session',
    name: 'Idle Session Timeout',
    type: 'Session',
    appId: 'jira',
    status: 'active',
    lastModified: '3 weeks ago',
    modifiedBy: 'System',
    audience: EVERYONE,
    rules: [
      rule({ name: 'Standard idle window',when: when(card(cond('trust-age', 'over', ['15']))), decision: '1fa', matchEstimate: 1240 }),
      rule({ name: 'Shorter for contractors',when: when(card(cond('group', 'in', ['contractors']), cond('user-type', 'is', ['Contractor']))), decision: '2fa', matchEstimate: 154 }),
    ],
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
    status: 'inactive',
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
