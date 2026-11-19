/* -----------------------------------------------------------------------------
   The Dashboard's widget catalog: every widget, the need it answers, how it
   shows its data by default, and the sizes it reads well at.

   Widths are columns of 12 (`w` is where it arrives, `minW` and `maxW` the
   range a bar between two widgets can take it through). Heights are pixels.
   A widget alone in a row always takes the row's full width; its maximum only
   holds against a neighbour.

   Pure data: no imports at run time, so the layout, the model and the
   templates can all read it.
   -------------------------------------------------------------------------- */

export type Category = 'posture' | 'activity' | 'engine' | 'people' | 'admin'
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'posture', label: 'Posture' },
  { value: 'activity', label: 'Sign-in activity' },
  { value: 'engine', label: 'Policies' },
  { value: 'people', label: 'People' },
  { value: 'admin', label: 'Admin' },
]

/** The ways a widget can show its data. */
export type Kind =
  | 'stat'
  | 'area'
  | 'bars'
  | 'barlist'
  | 'donut'
  | 'gauge'
  | 'catbar'
  | 'heat'
  | 'tracker'
  | 'funnel'
  | 'list'
  | 'feed'
  | 'table'
  | 'checklist'
  | 'meters'
  | 'grid'
  | 'actions'
  | 'form'
  | 'strip'
  | 'note'

export type WidgetId =
  | 'active-policies'
  | 'mfa'
  | 'phishing'
  | 'coverage'
  | 'apps-without'
  | 'health'
  | 'expiring'
  | 'risky-users'
  | 'sign-ins-total'
  | 'blocked-total'
  | 'success-rate'
  | 'sign-ins'
  | 'heatmap'
  | 'blocked'
  | 'top-apps'
  | 'funnel'
  | 'methods'
  | 'mfa-delivery'
  | 'locations'
  | 'risk-signals'
  | 'recent-sign-ins'
  | 'migration'
  | 'changes'
  | 'top-rules'
  | 'check'
  | 'blocks'
  | 'directory'
  | 'user-types'
  | 'registrations'
  | 'dormant'
  | 'approvals'
  | 'provisioning'
  | 'groups'
  | 'admin-activity'
  | 'connections'
  | 'license'
  | 'setup'
  | 'shortcuts'
  | 'whats-new'

/** One way a widget can be drawn, where it has more than one. The first is the default. */
export interface ViewChoice {
  id: string
  label: string
  kind: Kind
}

export interface WidgetMeta {
  name: string
  /** One line for the library: what it answers. */
  blurb: string
  category: Category
  kind: Kind
  /** Columns of 12: where it arrives, and the narrowest and widest it reads at beside a neighbour. */
  w: number
  minW: number
  maxW: number
  /** Pixels: the height it arrives at, and the shortest and tallest it reads at. */
  h: number
  minH: number
  maxH: number
  views?: ViewChoice[]
  /** Library search matches these too. */
  words?: string
}

const AREA_OR_BARS: ViewChoice[] = [
  { id: 'area', label: 'Area', kind: 'area' },
  { id: 'bars', label: 'Bars', kind: 'bars' },
]
const BARS_OR_AREA: ViewChoice[] = [
  { id: 'bars', label: 'Bars', kind: 'bars' },
  { id: 'area', label: 'Area', kind: 'area' },
]
const BARS_OR_DONUT: ViewChoice[] = [
  { id: 'bars', label: 'Bars', kind: 'barlist' },
  { id: 'donut', label: 'Donut', kind: 'donut' },
]
const DONUT_OR_BARS: ViewChoice[] = [
  { id: 'donut', label: 'Donut', kind: 'donut' },
  { id: 'bars', label: 'Bars', kind: 'barlist' },
]

/* The sizes each kind of content reads well at. */
const STAT = { kind: 'stat' as const, w: 3, minW: 2, maxW: 6, h: 176, minH: 160, maxH: 360 }
const LIST = { w: 4, minW: 3, maxW: 8, h: 368, minH: 240, maxH: 720 }
const CHART = { w: 8, minW: 4, maxW: 12, h: 368, minH: 240, maxH: 720 }

export const WIDGETS: Record<WidgetId, WidgetMeta> = {
  /* Posture */
  'active-policies': { ...STAT, name: 'Active sign-in policies', blurb: 'Policies deciding sign-ins now, and the apps they cover', category: 'posture', words: 'policy count' },
  mfa: { ...STAT, name: 'MFA coverage', blurb: 'Share of users with a second method set up', category: 'posture', words: 'two factor 2fa enrolled' },
  phishing: { name: 'Phishing-resistant sign-ins', blurb: 'Share of sign-ins made with a passkey or a hardware token', category: 'posture', kind: 'gauge', w: 3, minW: 3, maxW: 6, h: 368, minH: 240, maxH: 560, words: 'passkey fido webauthn hardware token' },
  coverage: { name: 'Policy coverage', blurb: 'Apps with an active policy, a policy that is not active, and none', category: 'posture', kind: 'catbar', w: 6, minW: 4, maxW: 12, h: 176, minH: 160, maxH: 320, words: 'apps gaps' },
  'apps-without': { ...LIST, name: 'Apps without a sign-in policy', blurb: 'Apps anyone can sign in to with no policy of their own', category: 'posture', kind: 'list', words: 'gaps coverage add policy' },
  health: { ...LIST, name: 'Policy health', blurb: 'Drafts, inactive policies and overlaps, each with its fix', category: 'posture', kind: 'checklist', words: 'drafts inactive monitoring overlaps' },
  expiring: { ...LIST, name: 'Expiring soon', blurb: 'Certificates, tokens and the license, by days left', category: 'posture', kind: 'list', words: 'saml certificate scim token secret renewal' },
  'risky-users': { ...LIST, name: 'Most blocked users', blurb: 'People whose sign-ins were blocked most, and why', category: 'posture', kind: 'list', words: 'risky users denied' },

  /* Sign-in activity */
  'sign-ins-total': { ...STAT, name: 'Sign-ins', blurb: 'Sign-ins in the range, against the range before', category: 'activity', words: 'total volume' },
  'blocked-total': { ...STAT, name: 'Blocked sign-ins', blurb: 'Sign-ins a policy refused, against the range before', category: 'activity', words: 'denied refused' },
  'success-rate': { ...STAT, name: 'Sign-in success rate', blurb: 'Share of sign-ins that got in', category: 'activity', words: 'allowed share' },
  'sign-ins': { ...CHART, name: 'Sign-ins over time', blurb: 'Allowed, asked for MFA and blocked, across the range', category: 'activity', kind: 'area', views: AREA_OR_BARS, words: 'chart trend wave' },
  heatmap: { ...CHART, name: 'When people sign in', blurb: 'Sign-ins by weekday and hour', category: 'activity', kind: 'heat', minW: 5, h: 304, maxH: 560, words: 'heat map busy hours weekday' },
  blocked: { ...LIST, name: 'Why sign-ins were blocked', blurb: 'The reasons policies refused sign-ins, most first', category: 'activity', kind: 'barlist', views: BARS_OR_DONUT, words: 'denied reasons zone device risk' },
  'top-apps': {
    ...LIST,
    name: 'Top apps by sign-ins',
    blurb: 'The apps people sign in to most',
    category: 'activity',
    kind: 'barlist',
    maxW: 12,
    views: [
      { id: 'bars', label: 'Bars', kind: 'barlist' },
      { id: 'grid', label: 'Grid', kind: 'grid' },
    ],
    words: 'applications usage sso',
  },
  funnel: { ...LIST, name: 'Sign-in funnel', blurb: 'From a sign-in started to a person signed in, step by step', category: 'activity', kind: 'funnel', maxW: 6, minH: 304, maxH: 560, words: 'drop off steps' },
  methods: { ...LIST, name: 'How people sign in', blurb: 'Second methods used, by share', category: 'activity', kind: 'donut', maxH: 560, views: DONUT_OR_BARS, words: 'authentication methods otp push passkey' },
  'mfa-delivery': { ...CHART, name: 'MFA delivery', blurb: 'Codes and prompts sent by SMS, email and push, and how many failed', category: 'activity', kind: 'bars', w: 6, words: 'otp sms email push failed' },
  locations: { ...LIST, name: 'Where sign-ins come from', blurb: 'Sign-ins by country, most first', category: 'activity', kind: 'barlist', words: 'country place geography' },
  'risk-signals': { ...LIST, name: 'Risk signals', blurb: 'The signals that raised sign-in risk, most first', category: 'activity', kind: 'barlist', words: 'adaptive new device impossible travel' },
  'recent-sign-ins': { name: 'Recent sign-ins', blurb: 'Who signed in to what, what decided it and why', category: 'activity', kind: 'table', w: 12, minW: 6, maxW: 12, h: 432, minH: 304, maxH: 800, words: 'table log activity' },

  /* Policies */
  migration: { name: 'Migration', blurb: 'The move from the old policies: days left and what has moved', category: 'engine', kind: 'strip', w: 12, minW: 6, maxW: 12, h: 112, minH: 112, maxH: 176, words: 'move old policies countdown' },
  changes: { ...LIST, name: 'Recent policy changes', blurb: 'Who changed which policy, and when', category: 'engine', kind: 'feed', words: 'change log history' },
  'top-rules': { ...CHART, name: 'Rules that decided most', blurb: 'The rules that ended the most sign-ins', category: 'engine', kind: 'barlist', w: 6, words: 'rule leaderboard' },
  check: { ...LIST, name: 'Check access', blurb: 'Pick a person and an app, and see what a sign-in gets', category: 'engine', kind: 'form', minH: 304, maxH: 560, words: 'test run decision' },
  blocks: { name: 'Building blocks', blurb: 'Zones, device profiles, methods and hooks your rules use', category: 'engine', kind: 'grid', w: 4, minW: 3, maxW: 12, h: 240, minH: 176, maxH: 480, words: 'zones device profiles hooks methods' },

  /* People */
  directory: { name: 'Directory', blurb: 'Users, groups, apps and policies, counted', category: 'people', kind: 'grid', w: 4, minW: 3, maxW: 12, h: 240, minH: 176, maxH: 480, words: 'users groups apps totals' },
  'user-types': { name: 'Users by type', blurb: 'Employees, contractors and partners', category: 'people', kind: 'catbar', w: 4, minW: 3, maxW: 12, h: 176, minH: 160, maxH: 320, words: 'employee contractor partner' },
  registrations: { ...CHART, name: 'New users', blurb: 'Users added across the range', category: 'people', kind: 'bars', w: 6, h: 304, views: BARS_OR_AREA, words: 'registrations sign ups joined' },
  dormant: { ...LIST, name: 'Dormant users', blurb: 'People who have not signed in for 60 days or more', category: 'people', kind: 'list', words: 'inactive stale' },
  approvals: { ...LIST, name: 'Pending approvals', blurb: 'App access requests to approve or reject', category: 'people', kind: 'list', words: 'requests access' },
  provisioning: { name: 'Provisioning', blurb: 'The last sync to each app: created, updated and failed', category: 'people', kind: 'table', w: 8, minW: 5, maxW: 12, h: 368, minH: 240, maxH: 800, words: 'scim sync' },
  groups: { ...LIST, name: 'Largest groups', blurb: 'Groups by number of members', category: 'people', kind: 'barlist', words: 'members' },

  /* Admin */
  'admin-activity': { ...LIST, name: 'Admin activity', blurb: 'What admins changed in the console, newest first', category: 'admin', kind: 'feed', words: 'audit log' },
  connections: { ...CHART, name: 'Connections', blurb: 'Identity sources and services, and how they ran for 30 days', category: 'admin', kind: 'tracker', w: 6, words: 'status uptime siem sms email directory' },
  license: { name: 'License', blurb: 'Users, SMS and email credits against their limits', category: 'admin', kind: 'meters', w: 4, minW: 3, maxW: 12, h: 304, minH: 112, maxH: 480, words: 'plan renewal credits' },
  setup: { ...LIST, name: 'Setup checklist', blurb: 'The steps to a working tenant, and the ones left', category: 'admin', kind: 'checklist', words: 'getting started onboarding' },
  shortcuts: { name: 'Quick actions', blurb: 'New policy, add an app, add a user, check access', category: 'admin', kind: 'actions', w: 4, minW: 2, maxW: 6, h: 368, minH: 176, maxH: 560, words: 'shortcuts create' },
  'whats-new': { name: "What's new", blurb: 'What the new policy builder brings', category: 'admin', kind: 'note', w: 4, minW: 3, maxW: 8, h: 240, minH: 176, maxH: 480, words: 'announcement release' },
}
export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[]

/** The view a widget is shown in: the one picked on it if the widget still has it, else the widget's first. */
export function viewOf(cell: { widget: WidgetId; view?: string }): ViewChoice | null {
  const views = WIDGETS[cell.widget].views
  if (!views) return null
  return views.find((v) => v.id === cell.view) ?? views[0]
}
export const kindOf = (cell: { widget: WidgetId; view?: string }): Kind => viewOf(cell)?.kind ?? WIDGETS[cell.widget].kind
