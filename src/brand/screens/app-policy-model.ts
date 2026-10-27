import { FALLBACK_NAME, appsOf, enforces, fallbackRule, type AccessDecision, type App, type Group, type Policy, type Rule, type User } from '../data'
import { CANT_TELL } from '../decision-words'
import type { FaceItem } from '../faces'
import type { MenuItem } from '../kit'
import type { PickerOption } from '../picker'
import { normaliseWho, ruleMatchesEveryone } from '../rule-who'
import { appUserRows, type AppUserRow } from './app-people-tabs-model'
import { listPhrase, whyNotDeciding } from './app-policies'
import type { StandRow } from './app-standing'
import { shadowedBy } from './diagnostics'
import { predicateSentence, ruleLabel, whoSentence, type NameLookup } from './predicate-prose'
import { fallbackOf, type SimEnv } from './simulate'
import { signInActivity, type ActivityRow } from './sign-in-tests/activity'
import { askOfRule } from './sign-in-tests/conflicts'
import { emptyDraft } from './sign-in-tests/sign-in-card'
import { MONITOR_MODE, offersMonitoringView, statusOptions } from './status-options'
import { DENY_REASON_WORD } from './testing/deny-reason'
import { patchFor } from './testing/prefill'
import type { TestingSessionState } from './testing/session-state'
import { defaultBoardForm, type SignInForm } from './testing/sign-in-form'

/* -----------------------------------------------------------------------------
   An application's Policies tab, as data (docs/specs/APP-POLICY-TAB.md, §8.2).

   The tab reads top to bottom as the engine does: the policy's rules in
   first-match order, its "Nothing else matched", then — outside it — the Global
   Default, which decides for everybody the policy does not cover. Each row
   carries what it says (who, if, outcome) and, from the application's own
   modelled week (`appReport`, activity.ts), how many sign-ins it decided and
   when it last did. Everything else on the tab — the status menu, the state
   line, the covered count, the person finder — is a small pure answer here,
   so the view only draws. PURE.
   -------------------------------------------------------------------------- */

/** A row of the chain: a rule's id, the policy's last row, or the Global Default behind it. */
export type ChainKey = string | 'last' | 'default'

export interface ChainRow {
  key: ChainKey
  kind: 'rule' | 'last' | 'default'
  /** The rule's number, 1-based as the builder numbers it; null for the last row and the Global Default. */
  n: number | null
  name: string
  /** The rule's groups and people as faces; [] for everyone covered (and on the last and default rows). */
  whoFaces: FaceItem[]
  /** "Engineering" · "Everyone covered" · "Everyone covered except Contractors" · "Anyone not matched above" · "Everyone else". */
  whoSaid: string
  /** "In zone Operating countries" · "Any sign-in"; '' on the last and default rows, which have no If. */
  ifSaid: string
  /** The outcome; null while a draft's rule has none chosen yet ("Outcome not chosen yet"). */
  decision: AccessDecision | null
  /** "Password" · "Password, miniOrange Push" · the deny message in quotes; null when there is nothing to add. */
  factorSaid: string | null
  /** The Global Default's own rule count, said before its last row's outcome ("2 rules, then"); 'default' only. */
  rulesBefore: number | null
  enabled: boolean
  /** The 1-based rule that matches every sign-in this row could see first, or null. */
  blockedBy: number | null
  /* Whether the row can decide a sign-in today: its policy decides (on, or the
     system policy), the row is on and nothing above takes all of it. The
     Global Default row is reached when it is what decides for everybody the
     policy does not cover — never when the policy covers everyone. */
  reached: boolean
}

export interface ChainLook {
  resolve: NameLookup
  groups: readonly Group[]
  users: readonly User[]
  /** The application's name, for the Global Default's Who while the policy decides nothing: "Everyone on Box". */
  appName?: string
}

/** Turned on, or the system policy: the rows can decide a sign-in. */
const decides = (p: Policy) => enforces(p)

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "Password", "Password, miniOrange Push", or the deny message in quotes. */
function factorOf(rule: Rule): string | null {
  if (rule.pristine === true) return null
  if (rule.decision === 'deny') {
    const message = rule.denyMessage?.trim()
    return message ? `“${message}”` : null
  }
  const ask = askOfRule(rule)
  return [ask.first, ask.second].filter((s): s is string => !!s).join(', ') || null
}

function facesOf(rule: Rule, look: ChainLook): FaceItem[] {
  const w = normaliseWho(rule.who)
  if (!w) return []
  const name = (kind: 'group' | 'user', id: string) =>
    look.resolve(kind, id) ?? (kind === 'group' ? look.groups.find((g) => g.id === id)?.name : look.users.find((u) => u.id === id)?.name) ?? id
  return [
    ...w.groupIds.map((id): FaceItem => ({ kind: 'group', key: `g:${id}`, name: name('group', id) })),
    ...w.userIds.map((id): FaceItem => ({ kind: 'user', key: `u:${id}`, name: name('user', id) })),
  ]
}

/* Who a rule is for, in the row's words. A rule with no Who is for everyone
   the policy covers — "Everyone covered" — or, on the Global Default, which
   covers everybody, "Everyone". Exceptions are kept: "Everyone covered except
   Contractors". */
function whoOf(rule: Rule, look: ChainLook, everyone: string): string {
  const said = whoSentence(rule.who, look.resolve)
  return said ? said.replace(/^Everyone\b/, everyone) : everyone
}

function ruleRows(p: Policy, look: ChainLook): ChainRow[] {
  const live = decides(p)
  const everyone = p.isSystem ? 'Everyone' : 'Everyone covered'
  const rows = p.rules.map((rule, i): ChainRow => {
    const blocked = blockedBy(p, i)
    return {
      key: rule.id,
      kind: 'rule',
      n: i + 1,
      name: ruleLabel(rule),
      whoFaces: facesOf(rule, look),
      whoSaid: whoOf(rule, look, everyone),
      ifSaid: rule.when.cards.length === 0 ? 'Any sign-in' : capital(predicateSentence(rule.when, look.resolve)),
      decision: rule.pristine === true ? null : rule.decision,
      factorSaid: factorOf(rule),
      rulesBefore: null,
      enabled: rule.enabled,
      blockedBy: blocked,
      reached: live && rule.enabled && blocked === null,
    }
  })
  const last = p.fallback ?? fallbackRule()
  const lastBlocked = blockedBy(p, p.rules.length)
  rows.push({
    key: 'last',
    kind: 'last',
    n: null,
    name: FALLBACK_NAME,
    whoFaces: [],
    whoSaid: 'Anyone not matched above',
    ifSaid: '',
    decision: last.pristine === true ? null : last.decision,
    factorSaid: factorOf(last),
    rulesBefore: null,
    enabled: true,
    blockedBy: lastBlocked,
    reached: live && lastBlocked === null,
  })
  return rows
}

/* The whole decision chain the tab lists (spec C): the policy's rules in
   order, its last row, then the Global Default it sits in front of. With no
   policy, the Global Default IS the chain: its own rules and last row, and
   nothing behind it (§6). `everyoneElse` is what decides for somebody the
   policy does not cover (`appStanding(...).everyoneElse`). */
export function chainRows(policy: Policy | null, globalDefault: Policy | null, everyoneElse: Policy | null, look: ChainLook): ChainRow[] {
  if (!policy) return globalDefault ? ruleRows(globalDefault, look) : []
  const rows = ruleRows(policy, look)
  if (!globalDefault || policy.isSystem) return rows
  const reached = everyoneElse !== null && everyoneElse.id === globalDefault.id
  const whoSaid = !reached ? 'Nobody outside it' : decides(policy) ? 'Everyone else' : look.appName ? `Everyone on ${look.appName}` : 'Everyone'
  rows.push({
    key: 'default',
    kind: 'default',
    n: null,
    name: globalDefault.name,
    whoFaces: [],
    whoSaid,
    ifSaid: '',
    decision: fallbackOf(globalDefault),
    factorSaid: null,
    rulesBefore: globalDefault.rules.length,
    enabled: true,
    blockedBy: null,
    reached,
  })
  return rows
}

/* The 1-based rule that matches every sign-in rule `index` could see before
   it does — on, no conditions, and a Who covering all of its people — or null
   (`shadowedBy`, diagnostics.ts, the linter's own test). `index` equal to the
   rule count asks about the last row, which only a rule for everyone with no
   conditions takes all of. */
export function blockedBy(policy: Policy, index: number): number | null {
  if (index === policy.rules.length) {
    const i = policy.rules.findIndex((r) => r.enabled && ruleMatchesEveryone(r))
    return i === -1 ? null : i + 1
  }
  for (let j = 0; j < index; j++) if (shadowedBy(policy, j).includes(index)) return j + 1
  return null
}

export interface RowTraffic {
  /** The sign-ins of the modelled week this row decided. */
  weight: number
  /** When it last decided one. */
  last: { date: string; time: string } | null
}

/* Each chain row's sign-ins over the modelled week: the application's own
   sample (`appReport` through `signInActivity`, so the tab and the Sign-in
   activity page count the same sign-ins), each landing on the row that decided
   it (`chainKeyOf`). A sign-in nothing could decide yet — a fact the model
   cannot state, as a Tor exit's place — lands on no row. Only rows with a
   sign-in are in the map. Empty for an application added this session. */
export function trafficByRow(
  appId: string,
  policy: Policy | null,
  globalDefault: Policy | null,
  policies: readonly Policy[],
  env: SimEnv,
  today: Date,
  apps: readonly Pick<App, 'id' | 'name' | 'addedAt'>[],
): Map<ChainKey, RowTraffic> {
  const out = new Map<ChainKey, RowTraffic>()
  const app = apps.find((a) => a.id === appId)
  if (!app) return out
  for (const r of signInActivity(policies, env, today, [app])) {
    const key = chainKeyOf(r, policy, globalDefault)
    if (!key) continue
    const time = r.facts.when?.time ?? ''
    const was = out.get(key)
    const later = !was?.last || `${r.date} ${time}` > `${was.last.date} ${was.last.time}`
    out.set(key, { weight: (was?.weight ?? 0) + r.weight, last: later ? { date: r.date, time } : was.last })
  }
  return out
}

/* How many directory people this policy actually decides for on the
   application, and how many it leaves to everybody else's decider — read
   from the Users tab's own rows (`appUserRows`, the engine's `deciderFor`), so
   the tab, the Users tab and Access checks cannot disagree. A policy that is
   off decides for nobody, so everybody is "everyone else". The two add up to
   the directory. */
export function coverageOf(
  appId: string,
  policy: Policy | null,
  policies: readonly Policy[],
  users: readonly User[],
  groups: readonly Group[],
): { covered: number; everyoneElse: number } {
  const rows = appUserRows(appId, policies, users, groups)
  const covered = policy ? rows.filter((r) => r.decider?.id === policy.id).length : 0
  return { covered, everyoneElse: rows.length - covered }
}

export type TabNotice =
  | { kind: 'waiting'; draft: Policy; replaces: Policy | null }
  | { kind: 'also'; others: Policy[] }
  | { kind: 'pending'; added: string[]; removed: string[] }
  | { kind: 'draft' | 'inactive' | 'monitor'; said: string; plan: string | null }

/* The one thing the state line says, or null (spec B): a draft waiting to take
   over first, then another policy on the application — the ruling bars that
   one, so it is the thing to clean up — then a live policy's unpublished
   changes, then why the policy decides nothing. `plan` is the monitoring plan
   line ("If turned on: …"), kept for a monitoring policy only.

   WAITING OUTRANKS ALSO because the two look identical to `appStanding` and
   mean opposite things. While Replace made a draft copy (app-policies.ts
   `REPLACE_MAKES_DRAFT`), a second policy on the application was the normal
   end of a replace, not stray data: it is the admin's own next step, sitting
   where they left it. Read as "Also on {app}" it came with Remove as its one
   labelled exit — housekeeping for a mistake — which is the opposite of what
   it is. The match is deliberately narrow: the one other policy, and a draft.
   Anything else is still a stray and still reads as one.

   Since 24 Oct 2026 a replace is the live swap (`replaceOnApp`) and leaves no
   draft behind, so a replace no longer ends here. A draft copy made for this
   application alone still does — Duplicate for {app} in the shared-policy
   slider — and reads the same, because it means the same. */
export function tabNotice(
  row: StandRow,
  others: readonly StandRow[],
  diff: { added: string[]; removed: string[] } | null,
  plan: string | null,
): TabNotice | null {
  if (others.length === 1 && others[0].policy.status === 'draft') {
    /* What it takes over from is derived, never stored: whatever decides here now. Nothing on the draft says
       "I replace X", so the line stays true when the live policy changes under it, and a draft made any other
       way — New policy, a duplicate — reads the same because it means the same. */
    return { kind: 'waiting', draft: others[0].policy, replaces: row.state === 'decides' ? row.policy : null }
  }
  if (others.length > 0) return { kind: 'also', others: others.map((o) => o.policy) }
  if (diff && (diff.added.length > 0 || diff.removed.length > 0)) return { kind: 'pending', added: [...diff.added], removed: [...diff.removed] }
  if (row.state === 'draft' || row.state === 'inactive' || row.state === 'monitor') {
    return { kind: row.state, said: whyNotDeciding(row.policy) ?? '', plan: row.state === 'monitor' ? plan : null }
  }
  return null
}

export type StatusMenuId = 'active' | 'monitor' | 'inactive' | 'view-monitoring' | 'remove' | 'delete'

/* The status pill's menu (spec A1): the switches by strength
   (`statusOptions`), View monitoring while it monitors, then Remove from this
   application; a draft has no switch, so Remove, and Delete draft when it may
   be deleted. None for the system policy or an always-on one. A switch acts on
   the whole policy, so on a shared one each carries a hint naming the other
   applications ("With Dropbox"); Remove changes this application only. No item
   is `danger`: red is the confirm's. */
export function statusMenu(
  policy: Policy,
  app: Pick<App, 'id' | 'name'>,
  apps: readonly App[],
  opts: { monitor: boolean; deletable: boolean },
): MenuItem[] {
  if (policy.isSystem || policy.status === 'always-on') return []
  const remove: MenuItem = { id: 'remove', label: `Remove from ${app.name}` }
  if (policy.status === 'draft') return [remove, ...(opts.deletable ? [{ id: 'delete', label: 'Delete draft' }] : [])]
  const others = appsOf(policy, [...apps]).filter((a) => a.id !== app.id)

  /* TWO SCOPES, SAID AS TWO (owner, 22 Oct 2026: "why don't we have 2 options by default — show that inactive
     for this app, where we remove the app from the policy, or inactive for all").

     Both already existed and neither said so. A status belongs to the POLICY, so Inactive stopped it on every
     application it is on, and the only per-application off switch was Remove, sitting in another group under a
     name that reads as housekeeping rather than as the other half of the same decision. An admin standing on
     Google Workspace, wanting Google Workspace off, had the choice but no way to see it.

     So where the policy is shared the two are named along the axis that separates them — everywhere, or here —
     and each says what becomes of the rest. Removing IS the per-application off switch: the application stops
     using the policy and falls to whatever decides next; nothing is deleted. Where the policy is on one
     application the distinction does not exist, and the labels stay plain. */
  const shared = others.length > 0
  const alsoOn = `${listPhrase(others.map((a) => a.name))} too`
  const switches: MenuItem[] = statusOptions(policy, { monitor: opts.monitor }).map((o) => ({
    id: o.target,
    label: shared ? `${o.label} everywhere` : o.label,
    ...(shared ? { hint: alsoOn } : null),
  }))
  if (shared) remove.hint = `Only ${app.name}; the rest keep it`
  /* Monitoring is off for now (owner, 22 Oct 2026: "Monitor should go to coming soon ... just add coming soon and
     hide the function"), and the edition flag that hides it is `monitorMode` in edition.ts. It stays on the menu,
     disabled, so the state is announced rather than quietly missing: a switch that vanishes reads as a switch
     that never existed. Everything behind it is kept — flip the flag and it is a live option again. */
  /* Announced only where there is no real switch to offer: the phase hides monitoring (MONITOR_MODE) and the
     caller has already folded that into `opts.monitor` (monitorOffered). Where a caller does offer monitoring —
     a build with the phase on, or a test that asks for it — statusOptions supplies the live switch above and
     there is nothing to announce. */
  const soon: MenuItem[] = !MONITOR_MODE && !opts.monitor ? [{ id: 'monitor', label: 'Monitoring', hint: 'Coming soon', disabled: true }] : []
  const view: MenuItem[] = offersMonitoringView(policy, { monitor: opts.monitor }) ? [{ id: 'view-monitoring', label: 'View monitoring' }] : []
  /* WHAT IS COMING SITS TOGETHER, AT THE END (owner, 22 Oct 2026, of Monitoring: "move it down with the other
     coming soon items"). It sat between Inactive and Remove, so the one item on the menu that cannot be pressed
     was in the middle of the ones that can, breaking the run of live switches to announce a phase. The reads the
     tab adds after this list are announced the same way, so the tail is one group with one rule above it: what
     this policy can do now, then what it will be able to do. */
  const before = [...switches, ...view]
  const later = soon.map((i, n) => ({ ...i, ...(n === 0 ? { divide: true } : null) }))
  return [...before, { ...remove, ...(before.length > 0 ? { divide: true } : null) }, ...later]
}

/* The rule a change-log line quotes, by its name as it stands — "Added
   “Designers, where we operate”" — or null when it quotes none (a rename
   quotes the old name and the new; the new one is the rule's). */
export function ruleNamedIn(line: string, policy: Pick<Policy, 'rules'>): string | null {
  for (const m of line.matchAll(/“([^”]+)”/g)) {
    if (policy.rules.some((r) => r.name === m[1])) return m[1]
  }
  return null
}

/* The chain row a sign-in landed on: the policy's own rule or last row, the
   Global Default behind it, or — with no policy, where the Global Default is
   the chain — the Global Default's own rule or last row. Null for a sign-in
   nothing decided yet, or one a policy outside the chain decided. */
export function chainKeyOf(row: Pick<ActivityRow, 'policyId' | 'ruleKey'>, policy: Policy | null, globalDefault: Policy | null): ChainKey | null {
  if (row.ruleKey === null || row.policyId === null) return null
  const own = (p: Policy): ChainKey | null => (row.ruleKey === 'fallback' ? 'last' : p.rules.some((r) => r.id === row.ruleKey) ? row.ruleKey : null)
  if (policy && row.policyId === policy.id) return own(policy)
  if (globalDefault && row.policyId === globalDefault.id) return policy && !policy.isSystem ? 'default' : own(globalDefault)
  return null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* "Thu 8 Oct, 11:20": the day as well as the weekday, so two Thursdays of a
   sample are told apart. The date is a calendar day (UTC), as the sample
   states it; with no date, the time alone. */
export function whenSaid(date: string, time: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return time
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const day = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return time ? `${day}, ${time}` : day
}

/* The people a search names, for the person line (spec D1): the Users tab's
   rows, by name or email, in the directory's order, at most `max`. Nothing
   for an empty search. */
export function findPeople(q: string, rows: readonly AppUserRow[], max = 3): AppUserRow[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  return rows.filter((r) => `${r.user.name} ${r.user.email}`.toLowerCase().includes(needle)).slice(0, max)
}

/* The sign-in Check access opens on from this tab: the application, and the
   person asked about — else somebody the policy is for, the board's own pick
   (`defaultBoardForm`), else the directory's first — with every other fact at
   Access checks' own defaults (`emptyDraft`: the office, at half past nine,
   on the registered laptop at low risk). Nothing assumed on: it asks what
   happens now, which is what the person line says. */
export function checkFormFor(
  appId: string,
  policy: Policy | null,
  people: readonly User[],
  apps: readonly App[],
  today: string,
  personId?: string,
): SignInForm {
  const pick = personId ?? (policy ? defaultBoardForm(policy, people, apps, today).personId : (people[0]?.id ?? null))
  return { ...emptyDraft(today, '09:30'), appId, personId: pick }
}

/* What the Rules head's Check access fills in (spec §5: "It fills in the
   application and runs nothing until Run"): the form Access checks would open
   on — one filled in already, else the last run's sign-in, else its empty
   form — with this application, and nothing else changed. An assumption the
   application ends goes with it, as Try's own application change does. */
export function appCheckForm(
  appId: string,
  session: Pick<TestingSessionState, 'prefilled' | 'runId' | 'form'>,
  policies: readonly Policy[],
  today: string,
  time: string,
): SignInForm {
  const base = session.prefilled ?? (session.runId > 1 ? session.form : emptyDraft(today, time))
  return { ...base, ...patchFor(base, { appId }, policies) }
}

/* -----------------------------------------------------------------------------
   The tab at a glance (app-policy-view.tsx `APP_POLICY_GLANCE`, 20 Oct 2026):
   the rules and Sign-in activity side by side at one fixed height, the
   sign-ins paged, and a sign-in tied to the card that decided it. The owner
   (19 Oct 2026): "add a fixed height for all the sections, add pagination…
   the user is here to check the whole policy at a glance".
   -------------------------------------------------------------------------- */

/* The sign-ins a page holds, and so the height of both panels: the rules panel is as tall as the activity's bar, head
   and this many rows. One knob — 7 keeps both frames above the fold of a 1440 × 900 window (spec §14.3). It is the
   most: a shorter window takes fewer (`glanceRows`), never under GLANCE_MIN_ROWS. */
export const GLANCE_ROWS = 7
export const GLANCE_MIN_ROWS = 4

/* How many rows a page holds so both frames end above the fold (browser review, 20 Oct 2026: on a 1536 × 730 laptop
   the fixed seven ran 157px under it). `room` is the height left for the rows: from where the frames' rows would
   start to the window's bottom, less what each frame holds besides its rows and a small gap. Whole rows, at least
   GLANCE_MIN_ROWS, at most GLANCE_ROWS; GLANCE_ROWS when nothing could be measured. */
export function glanceRows(room: number, rowHeight: number): number {
  if (!Number.isFinite(room) || !(rowHeight > 0)) return GLANCE_ROWS
  return Math.min(GLANCE_ROWS, Math.max(GLANCE_MIN_ROWS, Math.floor(room / rowHeight)))
}

/** The activity's Rule filter: every row, or one row of the chain (a rule's id, 'last', 'default'). */
export type RuleFilter = 'all' | ChainKey

/* The card on the canvas a chain row is: a rule's id as it is, the last row the board's own 'fallback', and nothing
   for the Global Default, which is the rules panel's foot rather than a card. */
export function canvasTarget(key: ChainKey | null): string | null {
  if (key === null || key === 'default') return null
  return key === 'last' ? 'fallback' : key
}

/* Each card's outcome where its state pill was, so the chain reads at a glance: the rule's decision, the last row's.
   None for a rule that is off, a rule or last row whose outcome is not chosen yet (that card keeps its own word: Off,
   Not set up), or a card the policy does not have. */
export function cardOutcome(own: Policy, id: string): AccessDecision | null {
  if (id === 'fallback') return own.fallback?.pristine === true ? null : fallbackOf(own)
  const r = own.rules.find((x) => x.id === id)
  return !r || !r.enabled || r.pristine === true ? null : r.decision
}

/* The Rule filter's options, in the chain's order: every rule by its number with its name under it, Nothing else
   matched, then the Global Default where it stands behind a policy of the application's own. With no policy, the
   Global Default's own rules. */
export function ruleChoices(policy: Policy | null, globalDefault: Policy | null): PickerOption[] {
  const own = policy ?? globalDefault
  const out: PickerOption[] = [{ value: 'all', label: 'All rules' }]
  if (!own) return out
  own.rules.forEach((r, i) => out.push({ value: r.id, label: `Rule ${i + 1}`, meta: ruleLabel(r) }))
  out.push({ value: 'last', label: FALLBACK_NAME })
  if (policy && globalDefault && !policy.isSystem) out.push({ value: 'default', label: globalDefault.name })
  return out
}

/* What the closed Rule filter says after its prefix: "Rule  All rules", "Rule  2", "Rule  Nothing else matched". A
   rule no longer in the policy reads as every rule, which is what the list then shows. */
export function ruleSummary(v: RuleFilter, policy: Policy | null, globalDefault: Policy | null): string {
  if (v === 'last') return FALLBACK_NAME
  if (v === 'default') return globalDefault?.name ?? 'All rules'
  const i = v === 'all' ? -1 : ((policy ?? globalDefault)?.rules.findIndex((r) => r.id === v) ?? -1)
  return i === -1 ? 'All rules' : `${i + 1}`
}

/** The sign-ins that landed on one row of the chain (`chainKeyOf`), or every one. */
export function byRule(rows: readonly ActivityRow[], v: RuleFilter, policy: Policy | null, globalDefault: Policy | null): ActivityRow[] {
  return v === 'all' ? [...rows] : rows.filter((r) => chainKeyOf(r, policy, globalDefault) === v)
}

/* What a screen reader hears when a sign-in is picked: what decided it and, on a refusal, why — the words the row's
   open detail said before (activity-row.tsx `Detail`). A sign-in nothing could decide yet is Can't tell. */
export function decidedSaid(r: Pick<ActivityRow, 'decision' | 'policyName' | 'ruleLine' | 'reason'>): string {
  if (!r.decision || !r.policyName) return CANT_TELL
  return `Decided by ${r.policyName}${r.ruleLine ? ` · ${r.ruleLine}` : ''}${r.reason ? ` · ${DENY_REASON_WORD[r.reason]}` : ''}`
}

/* Where a scroll box has to go so an item sits wholly inside it, its padding clear ("nearest", as `scrollIntoView`
   says it) — or null when it already does. Measured by the caller, so the page's own scroll is never touched:
   `scrollIntoView` scrolls every scrolling ancestor, the console's main column with it. An item taller than the box
   shows its top. Never negative. */
export function revealTop(item: { top: number; height: number }, box: { scrollTop: number; height: number }, padTop: number, padBottom = padTop): number | null {
  const want = item.top - padTop
  const end = item.top + item.height + padBottom
  let y: number | null = null
  if (want < box.scrollTop || end - want > box.height) y = want
  else if (end > box.scrollTop + box.height) y = end - box.height
  if (y === null) return null
  const at = Math.max(0, y)
  return at === box.scrollTop ? null : at
}
