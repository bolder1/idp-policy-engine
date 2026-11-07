import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

import { MIGRATION_FIRST } from './migrate/phase'
import type { ActivityKind, ActivityLog } from './policy-activity'
import {
  addedToday,
  consoleStamp,
  memberGroupIds,
  newId,
  reidRule,
  templates as seedTemplates,
  uniqueName,
  type AccessDecision,
  type App,
  type Group,
  type MethodSet,
  type Policy,
  type PolicyStatus,
  type Rule,
  type Scenario,
  type Template,
  type User,
  type Zone,
} from './data'
import { type FingerprintProfile } from './fingerprint'
import { logChange, seedChangeLog, type ChangeEntry } from './change-log'
import { asStored, changedBeyondStamp, keptOrNew, lastSaved, openForEditing, withSavedDraft } from './policy-draft'
import { isRevisit } from './revisit'
import { EMPTY_RISK_PROFILE, riskScale, type RiskProfile } from './risk-signals'
import type { SavedSignIn } from './saved-sign-ins'
import { normaliseHook, type Hook } from './hooks'
/* Unfinished means draft, for both policy types (fixtures.ts): `settled`
   stores an unfinished policy as a draft — a sign-in one with no
   application, a post sign-in one with a rule or "Nothing else matched"
   left without an action — and `refusesStatus` refuses switching either on
   before that, and a post sign-in one to Monitoring ever. */
import { refusesStatus, settled, showcaseTenant, tenantAt, type Tenant } from './fixtures'
import { SHOWCASE } from './showcase'
import { EMPTY_LEGACY, MIGRATE_SCALE, showcaseLegacy, type DeadlineView, type LegacyEstate } from './migrate/legacy'
import { scaleApps, scaleLegacy } from './migrate/scale-seed'

const NO_APPS: App[] = []
import type { MovePlan, MoveLine, RuleSource } from './migrate/plan'

/** One move, while it runs and after. */
export interface MoveJob {
  total: number
  done: number
  /** The new policies' ids, in the order they were saved. */
  ids: string[]
  status: 'running' | 'done' | 'stopped'
  /** Every policy the move makes, in order, with the old rows it takes: what the Moving screen draws still to come. */
  queue: { key: string; name: string; appIds: string[]; sourceIds: string[]; joins: boolean }[]
  /** Zones the move makes: the Move story counts them. */
  zones: number
}

/** A moved policy's record of where it came from: Review's Before side, its Changes and Left out, its Approve. */
export interface MovedInfo {
  sourceIds: string[]
  moves: MoveLine[]
  changes: MoveLine[]
  leftOut: MoveLine[]
  ruleSource: Record<string, RuleSource>
  approved: boolean
  /** The admin approved it in the builder (owner, 6 Nov 2026): Draft, then Approved, then Active once published. */
  reviewed?: true
  /** The old rows joined a policy the application already had, rather than making a new one. */
  joined?: true
  /** A joined policy's new rules, held until Approve adds them. */
  pending?: Rule[]
}

/** How long one policy takes to move: long enough to watch, short enough that a hundred is a coffee, not a lunch. */
const MOVE_TICK_MS = 380
import type { ConfigField } from './method-config'
import type { MfaValues } from './mfa-join'
import { SEED_ENROLMENT, type UserEnrolment } from './user-methods'
import {
  assignTokens,
  deleteTokens,
  formatDay,
  serialKey,
  syncToken,
  unassignTokens,
  withTokenState,
  type HardwareToken,
} from './hardware-tokens'
import { allOn, type AuthMethod } from './methods'
import { TAB_SCREEN, personaById, type PersonaId } from './personas'
import { featuresOf, type Edition, type Features } from './edition'
import type { BreakInAcceptance } from './screens/break-in-model'
import type { FixItem } from './screens/sign-in-tests/conflict-fix'
import type { NameLookup } from './screens/predicate-prose'
import { toastDuration, toastTone, type ToastTone } from './toast-tone'

/* Who is looking. Not a permission check — the prototype has no auth — but the
   same split the real product makes: an admin decides what may exist, a person
   decides which of those they use. */
export type Role = 'admin' | 'user'

export type BrandScreen =
  | { name: 'policies' }
  /** The Dashboard: the Policy builder's What's new hub, then the move's next steps (migrate/HomeHub.tsx). */
  | { name: 'home' }
  /* `open` lets a caller hand off INTO a surface rather than merely near it.
     The policy list can say "this one has four holes" and land you in the
     gauntlet for that policy, instead of in a builder where you still have to
     find the button. */
  | { name: 'builder'; policyId: string; open?: 'gauntlet' | 'impact' }
  /* Builder v2 — the board, and the one a policy opens in. The same policy,
     store and evaluator under a different shape: a chain of cards on a stage,
     an inspector beside it. See docs/archive/builder-board.md.

     `open` is not the field the trail has, though it has the same purpose: a
     caller that knows why you are coming can land you on the answer rather
     than near it. Each opens the board in test mode (Policy testing): `try`,
     `person` and `saved` on that tab of the panel, `break-in` on the
     Break-in test pushed over Saved sign-ins. It
     named two sheets over the stage as well, Check and What changes, until
     M4 retired them. `rule` selects a rule on arrival — its id, or
     'fallback' for the last row. `fix` is Access checks' "Fix in policy": a
     break-in card and the application it was played on, fixed in the draft
     on arrival (break-in-app.ts `fixOnArrival`, 1 Oct 2026) — or a Why finding's fix, its Apply (conflict-fix.ts,
     6 Oct 2026): every fix of that run, the one pressed applied on arrival (7 Oct 2026). */
  | {
      name: 'board'
      policyId: string
      open?: 'try' | 'person' | 'saved' | 'break-in'
      rule?: string
      fix?: { card: string; app: string } | { conflicts: FixItem[]; pressed: number }
      /* Opened from an application's page (New policy, Edit policy, Add a
         copy): the bar's way back names that application and returns to its
         Policies tab. A navigation inside the board that drops it falls back
         to Policies. */
      from?: { appId: string }
    }
  /* The tenant's Sign-in tests (Policy testing V4, §3): the tester, the saved
     sign-ins, people and runs for every policy at once. A policy's board keeps
     only its own; its test panel links here, carrying the tab. */
  | { name: 'sign-in-tests'; tab?: 'try' | 'saved' | 'people' | 'runs' }
  /* The week's sign-ins across every application, and why any were refused (screens/SignInActivity.tsx), opened from Access checks.
     An application's Policies tab opens it narrowed (spec APP-POLICY-TAB.md): `appId` filters to that
     application, `view` picks Sign-ins or Policy changes, and `q` is the search it opens with. `from` is the
     application it was opened from: its crumb goes back to that application's Policies tab. */
  | { name: 'sign-in-activity'; appId?: string; view?: 'sign-ins' | 'changes'; q?: string; from?: { appId: string } }
  /* The policy's own three facts — name, applications, audience — on one page.

     They used to be scattered across a top-bar input, a dialog and a card at
     the top of the rules list, which made the frame the rules are written
     inside look like the first step of writing them. */
  | {
      name: 'policy-details'
      policyId: string
      /* Which builder to go back to.

         The screen sent everybody to the trail, so opening "Edit details" from
         the board was a one-way door: you came back to a different editor than
         the one you left, with the draft you had been holding gone. Defaults
         to the trail for callers that predate the board. */
      from?: PolicyDetailsFrom
    }
  /* Move policies (migrate/): the old console's sign-in policies, selected, explained and reviewed on one page. */
  /* `pick`: the old rows to start selected, when opened from one row or from an adaptive policy's users. */
  | { name: 'move-policies'; pick?: string[] }
  | { name: 'review-moved' }
  /* The old console's Policies section (migrate/OldPolicies.tsx), one page per rail item, as the live console has them. */
  | { name: 'old-login' }
  | { name: 'old-password' }
  | { name: 'old-adaptive' }
  | { name: 'templates' }
  | { name: 'zones' }
  | { name: 'fingerprint' }
  /* The tenant's one risk-signal weighting. Sits beside the device profiles
     because they are the two halves of what a device is worth: whether it is
     the same one as last time, and whether anything about it is suspicious. */
  | { name: 'risk-signals' }
  | { name: 'hooks' }
  | {
      name: 'methods'
      /* Set by the Display tokens page's back link, so focus lands on the
         Hardware Token row that page was opened from rather than on <body>. */
      from?: 'display-tokens'
    }
  /* Display Token's tokens, and who holds each one — the live console's
     "Assign Hardware Token To Users" page. Reached from Authentication methods
     (Display Token's Set up or Manage tokens, and Hardware Token's "Assign
     hardware tokens" setting), and a page of its own rather than pages pushed
     inside that slider, on the owner's word (15 Sep 2026).

     `tab` is here rather than in the screen's state so switching tabs is a
     change of place: it survives a remount, and a caller can land on either. */
  | { name: 'display-tokens'; tab?: DisplayTokenTab }
  /* `create` has gone. Creating a policy was a screen — a gallery of templates
     that asked for the policy's name only after you had chosen one — and it is
     a form opened in place from the list now, so there is nothing to route to.
     The templates it carried are offered from the empty board instead. */
  /* The admin's application catalogue — the console's Apps page.

     NOT `apps`. That name is taken directly below by the end-user launcher,
     and `store.apps` already means the admin's list, so a route called `apps`
     that means the launcher while the collection called `apps` means the
     catalogue is an ambiguity worth not compounding. The misleading name stays
     confined to the one place it already is. */
  | { name: 'applications' }
  /* Add application (spec APP-CREATE-AND-ACCESS.md §3): Choose application, the
     catalogue, while `catalogId` is unset; the set-up steps for that entry
     once one is picked. One route, so the catalogue's way back from the steps
     is a route change rather than a page's own state. */
  | { name: 'application-new'; catalogId?: string }
  /* One application's own page: Basic, Policies, Users and Groups. Opened from the Apps list.

     The route owns the tab, so a link can land on one. `group` filters the
     Users tab to one group (a Groups-tab count). `flash` is the policy the
     board just came back from, lit and focused in the list. `from` is the
     group page this was opened from, which the back link then names. */
  | {
      name: 'application'
      appId: string
      tab?: AppTab
      group?: string
      /* Filters the Users tab to the people this policy decides for (its Policy filter): the
         Policies tab's "{n} people" (spec APP-POLICY-TAB.md, A2). */
      policy?: string
      flash?: string
      from?: { groupId: string }
      /* One-shot, consumed on arrival like `flash`: a drawer to open on the
         Policies tab. Set when the unsaved application's Policies tab saves
         the application first and then carries on (spec §3.2, the live "Save
         Application" gate made to continue). */
      open?: 'add-existing'
    }
  /* Manage > Users > User List, and User Roles. `role` filters the list to one role (a User roles link). */
  | { name: 'users'; role?: string }
  | { name: 'user-roles' }
  /* Manage > Groups > Manage Groups; `groupId` opens one group's page, on
     `tab`. `from` is the application page it was opened from, which the back
     link then names. */
  | { name: 'groups'; groupId?: string; tab?: 'basic' | 'assignment' | 'applications'; from?: { appId: string } }
  /* End-user only: the app launcher the person lands on. The real product's
     end-user site has exactly two places — this and Setup 2FA — which is why
     it has a top bar and no rail to put one in. */
  | { name: 'apps' }

/** The two halves of the Display tokens page. */
export type DisplayTokenTab = 'assignments' | 'tokens'

/* An application page's tabs, in the live console's order with ours between
   (spec APP-CREATE-AND-ACCESS.md §4). Metadata is a SAML application's,
   Endpoints an OAuth one's; a route naming the other lands on Policies. */
export type AppTab = 'basic' | 'advanced' | 'sign-in' | 'attributes' | 'policies' | 'post-sign-in' | 'users' | 'groups' | 'metadata' | 'endpoints'

/** The four Policy testing views. Tabs, and a route parameter, so a caller can land on one. */
export type TestingView = 'try' | 'person' | 'saved' | 'samples'

/** Where Policy details returns to. `policies` is the list: "Assign applications" from a turn-on it refused. */
export type PolicyDetailsFrom = 'builder' | 'board' | 'policies'

/* The one toast. `id` changes on every call, so the same message twice is two
   toasts: each gets its full time on screen and is announced again. */
export interface ToastMessage {
  id: number
  text: string
  /** One verb beside the text — Undo after a removal. It stays up longer. */
  action?: ToastAction
  /** What kind of news it is: its colour, its mark and its bar. See toast-tone.ts. */
  tone: ToastTone
  /** How long it stays, in ms — the bar along its foot runs for exactly this. */
  duration: number
}

export interface ToastAction {
  label: string
  run: () => void
}

/* Who is signed in, for the account menu. The prototype has no auth, so these
   are fixed: the admin who runs the console, and the person whose Setup 2FA and
   launcher the User Dashboard shows. The end user is a directory person, so the
   tokens assigned to them in the Display Token inventory are theirs. */
export interface Account {
  id: string
  name: string
  username: string
  initials: string
}

export const ADMIN_ACCOUNT: Account = { id: 'jaspreet', name: 'Jaspreet Toor', username: 'jaspreet_t', initials: 'JT' }
export const END_USER_ACCOUNT: Account = { id: 'priya', name: 'Priya Sharma', username: 'priya', initials: 'PS' }

/* Account recovery, as the Recovery tab sets it. Everything off to begin with:
   recovery is a decision in both directions, so the start grants nothing.
   `choice` and `codeKind` are what each section shows once switched on. */
export interface RecoverySettings {
  forgot: boolean
  choice: string
  userPick: boolean
  codes: boolean
  codeKind: string
}

export const RECOVERY_DEFAULTS: RecoverySettings = {
  forgot: false,
  choice: 'kba',
  userPick: false,
  codes: false,
  codeKind: 'static',
}

/* A screen's answer to "may I leave?" — functions, so the dialog reads the
   screen's state at the moment someone tries to leave rather than when the
   guard was registered. */
export interface LeaveGuard {
  /** True while there is something to lose. */
  dirty: () => boolean
  /** Commits the work. Returns false when it could not, and the dialog stays. */
  save?: () => boolean
  /** The save button's label: "Save as draft" in a builder, "Save" elsewhere. */
  saveLabel?: () => string
  /** Why saving is not possible right now, or null. */
  blocked?: () => string | null
}

export interface PendingLeave {
  saveLabel: string
  canSave: boolean
  blocked: string | null
}

export interface BrandStore {
  apps: App[]
  groups: Group[]
  /* The directory. Fabricated fixture data — see the note on `users` in
     data.ts. A policy audience can name individuals, so there has to be a
     directory to name them from. */
  users: User[]
  /** People the tenant has that this fixture does not list, for the pickers to admit to. */
  unlistedUsers: number
  zones: Zone[]
  fingerprints: FingerprintProfile[]
  /* External hooks. A library object like zones, for the reason set out in
     hooks.ts: the endpoint is shared, the rules that consult it are not. */
  hooks: Hook[]
  /* Which edition is on screen, and the capabilities it grants. Read the
     flags, never the name: a screen that asks `edition === 'lite'` has to be
     revisited every time a third edition is imagined. */
  edition: Edition
  features: Features
  setEdition: (e: Edition) => void
  /* Which persona's tenant is loaded.

     Not a view filter. Changing it replaces the contents of every tab —
     policies, zones, fingerprint profiles, method sets, hooks, and the group
     directory the rule previews count against — because the doc's archetypes
     differ by company size and a 200-person tenant is a different product
     experience from a 20,000-person one rather than the same one scaled.

     Editing state is dropped on the swap, deliberately: carrying a draft
     written against three policies into an estate of twenty-three would leave
     rules pointing at zones that tenant does not have. */
  persona: PersonaId

  /* Whose console this is. It sits on the store rather than inside the methods
     screen because it no longer only changes a screen: an end user gets
     different chrome, a different landing screen and a nav with two items in
     it, none of which a screen can decide for itself. */
  role: Role
  setRole: (r: Role) => void
  /** Who the account menu names: the admin on the console, the end user on the User Dashboard. */
  account: Account
  /** The end user whose Setup 2FA this is. Their Display Tokens are `hardwareTokens` with this `userId`. */
  viewerId: string
  /** Loads another persona's tenant into every tab and remounts the screen. Picking the current persona does nothing. */
  setPersona: (p: PersonaId) => void
  methodSets: MethodSet[]
  /* The catalogue is the same eleven methods for every tenant; only how many
     people have enrolled in each moves with the persona. */
  methods: AuthMethod[]
  setMethods: Dispatch<SetStateAction<AuthMethod[]>>

  /* The Display Token inventory: every fob the tenant has added, and who holds
     each. Changing it also keeps the `display-token` method honest — see
     `withTokenState` in hardware-tokens.ts. Every action below reads the
     latest tokens, including ones changed earlier in the same event handler. */
  hardwareTokens: HardwareToken[]
  /** Adds validated tokens; any whose serial is already present is ignored. */
  addHardwareTokens: (ts: HardwareToken[]) => void
  /** Deletes unassigned tokens; assigned ones come back in `blocked`. */
  deleteHardwareTokens: (serials: string[]) => { deleted: string[]; blocked: string[] }
  /** Gives tokens to one person, skipping unknown, taken or already-held serials. */
  assignHardwareTokens: (userId: string, serials: string[]) => { assigned: string[]; skipped: { serial: string; reason: string }[] }
  /** Returns tokens to inventory. */
  unassignHardwareTokens: (serials: string[]) => void
  /** Records a resync on an event-based token; call after `syncErrors` passes. */
  syncHardwareToken: (serial: string) => void

  /* The Authentication methods screens' settings. On the store rather than in
     the screen, because the screen unmounts on every tab change and every
     navigation, and these are tenant settings that commit as they change. Each
     pair is a drop-in for a `useState` pair. A persona switch resets them. */
  /** The Recovery tab. */
  recovery: RecoverySettings
  setRecovery: Dispatch<SetStateAction<RecoverySettings>>
  /** Method and family settings, keyed as the settings sheet keys them. */
  mfaBehaviour: MfaValues
  setMfaBehaviour: Dispatch<SetStateAction<MfaValues>>
  /** The tenant default method. `undefined` until one is chosen: the screen shows its first defaultable method then. */
  defaultMethodId: string | null | undefined
  setDefaultMethodId: Dispatch<SetStateAction<string | null | undefined>>
  /** What each integration's setup form was saved with, per method id. */
  methodConfig: Record<string, ConfigField[]>
  setMethodConfig: Dispatch<SetStateAction<Record<string, ConfigField[]>>>
  /** What a setup card chose, per method id (Microsoft Push's NPS server). */
  setupChoice: Record<string, string>
  setSetupChoice: Dispatch<SetStateAction<Record<string, string>>>
  /** The end user's own enrolment (`viewerId`). */
  enrolment: UserEnrolment
  setEnrolment: Dispatch<SetStateAction<UserEnrolment>>

  templates: Template[]
  policies: Policy[]

  screen: BrandScreen
  /** Bumped whenever the open screen must start again even if its name is unchanged: a confirmed leave (Discard throws the draft away), a rail click on the screen already open, and a persona switch. */
  visit: number
  /** Navigates through the leave guard. Going to the library or list screen already open reopens it at its list. */
  go: (s: BrandScreen) => void
  /* Every screen that edits a local draft registers one, through `useLeaveGuard`
     in leave-guard.tsx, and every way out asks it: `go` for navigation, and
     `requestLeave` for in-page backs that never touch `go` ("All profiles").
     One dialog in the shell answers for all of them — Save (or Save as draft),
     Discard, Keep editing — so no screen can lose work silently again. */
  registerLeaveGuard: (g: LeaveGuard) => void
  /** Drops `g` if it is still the registered guard; a newer screen's is left alone. */
  releaseLeaveGuard: (g: LeaveGuard) => void
  /** Runs `run` now when nothing would be lost; otherwise holds it for the leave dialog. */
  requestLeave: (run: () => void, opts?: { canSave?: boolean }) => void
  /** What the leave dialog shows, or null when no leave is waiting. */
  pendingLeave: PendingLeave | null
  leaveSave: () => void
  leaveDiscard: () => void
  leaveStay: () => void

  appById: (id: string) => App
  /** Replaces the application with this id, stamping Last updated now. An unknown id changes nothing. */
  saveApp: (app: App) => void
  /** Adds an application (Add application), stamping Last updated now. Returns the id it is stored under: its own, or a fresh one when that is taken. */
  addApp: (app: App) => string
  groupById: (id: string) => Group
  /** Replaces the group with this id, stamping Last modified now. An unknown id changes nothing. */
  saveGroup: (g: Group) => void
  /* Puts people in a group, or takes them out, and returns their records as
     they were, for Undo (`restoreUsers`). Only the people it changed come
     back. Taking somebody out of their first group promotes their next one,
     or leaves them in none. */
  setMembership: (userIds: readonly string[], groupId: string, member: boolean) => User[]
  /** Writes these records back over the people with the same ids — `setMembership`'s Undo. */
  restoreUsers: (prev: readonly User[]) => void
  /* Returns undefined for an unknown id, deliberately — no `?? users[0]`.

     `groupById` below falls back to the first group, which is why a stale group
     reference renders as a real group instead of failing. That bug is not
     copied to people: a policy that names somebody who has left should say so,
     not silently point at a colleague. */
  userById: (id: string) => User | undefined
  zoneById: (id: string) => Zone | undefined
  fingerprintById: (id: string) => FingerprintProfile | undefined
  hookById: (id: string) => Hook | undefined
  /* Every `add*` below stores the item under an id nothing else has — its own
     id when that is free, otherwise one from `newId` — and returns the id it
     used. Open the item by the RETURNED id. The `*ById` lookups see an item
     added earlier in the same event handler. */
  /** Adds a hook, trimmed (see `normaliseHook`). Returns the stored id. */
  addHook: (h: Hook) => string
  updateHook: (h: Hook) => void
  removeHook: (id: string) => void
  /** Returns the stored id. */
  addFingerprint: (p: FingerprintProfile) => string
  updateFingerprint: (p: FingerprintProfile) => void
  removeFingerprint: (id: string) => void

  /* A library of risk-signal weightings, and exactly one of them in use.

     `riskScale` is the reason this is on the store rather than in the screen's
     own state: it replaces `RISK_SCORE`, which the evaluator reads on every
     rehearsal, every deck card and all 1,440 swept situations. A weighting
     nothing could read would be a second one of those — the device profiles
     already carry a risk mode whose `scoreOf` has no product callers at all.

     Which brings the one real decision a library forces. `Risk score above 60`
     is a threshold against A scale, and with several profiles something has to
     say WHICH. Two honest answers existed: let each rule name a profile, the
     way it names a zone; or keep one tenant-wide answer and let the library be
     about drafting alternatives to it.

     The second, and not merely because it is smaller. A rule naming its own
     risk profile would mean two rules in one policy could disagree about what
     "60" is worth — the number is the same, the scale behind it is not — and
     the condition renders as a bare number with no room to say whose. That is
     a footgun the `device-risk` condition has no way to defuse. So: one
     `activeRiskProfileId`, stated on the row and on the page, and switching it
     is a deliberate act with a toast. */
  riskProfiles: RiskProfile[]
  activeRiskProfileId: string
  /** Returns the stored id. */
  addRiskProfile: (p: RiskProfile) => string
  updateRiskProfile: (p: RiskProfile) => void
  removeRiskProfile: (id: string) => void
  useRiskProfile: (id: string) => void
  /** Derived: what Low, Medium and High are worth under the profile in use. */
  riskScale: Record<string, number>
  policyById: (id: string) => Policy | undefined

  /* Gauntlet expectations the tenant has overruled, per policy.

     Per policy rather than tenant-wide on purpose: "an executive from a Tor
     exit should be blocked" is a judgement about the apps a policy governs, and
     the same scenario can legitimately warrant different treatment on a finance
     system and on a status page. Tenant-wide would force one answer for both.

     Held in the store rather than in the dialog because the toolbar pip reads
     the same grade — a dialog-local override would put a different letter on
     the button than inside the panel it opens. */
  gauntletOverrides: Record<string, Record<string, AccessDecision>>
  setGauntletOverride: (policyId: string, cardId: string, want: AccessDecision | null) => void

  /* Break-in results the tenant has accepted, per policy and then per card
     (break-in-model.ts): the decision it now expects, and who accepted it,
     when and why. Per policy for the reason the overrides above are — the
     same scripted sign-in can deserve a different answer on another
     application. Reset per persona. */
  breakInAccepted: Record<string, Record<string, BreakInAcceptance>>
  /** Records an acceptance, or with null restores the card's own expectation. */
  acceptBreakIn: (policyId: string, cardId: string, a: BreakInAcceptance | null) => void

  /* Sign-ins the tenant expects a decision for (saved-sign-ins.ts). Tenant
     data, on the store for the reason zones are: the checks before a policy is
     saved or turned on read them with no testing screen mounted. Reset per
     persona, like every other tenant collection. */
  savedSignIns: SavedSignIn[]
  /** Adds at the end. Returns the stored id. */
  addSavedSignIn: (s: SavedSignIn) => string
  /** Merges `patch` into the saved sign-in with this id; an unknown id changes nothing. */
  updateSavedSignIn: (id: string, patch: Partial<Omit<SavedSignIn, 'id'>>) => void
  removeSavedSignIn: (id: string) => void

  /** Who changed which policy, when and what — one entry per save that changed a policy (change-log.ts). The showcase tenant starts with a few seeded entries. */
  changeLog: readonly ChangeEntry[]
  savePolicy: (p: Policy) => void
  /* Save as draft. On a policy still in draft the edits land in the policy
     itself; on a published one they are kept in `pendingDraft` and the live
     rules go on deciding sign-ins. Publishing clears it — callers pass
     `pendingDraft: undefined` to `savePolicy`. `checks` (Describe it's) are
     kept on a policy still in draft, beside the rules they were tried on. */
  saveDraft: (policyId: string, d: { rules: Rule[]; fallback?: Rule; checks?: Policy['checks'] }) => void
  /** Switches a published policy on, off or to monitoring. Leaves its rules and any saved draft alone. Ignored for the system policy, for any status but draft on a sign-in policy with no applications or a post sign-in policy not yet complete, and for Monitoring on a post sign-in policy (`refusesStatus`). */
  setPolicyStatus: (id: string, status: PolicyStatus) => void
  discardDraft: (policyId: string) => void
  /** Adds at the top of the list; a policy with no applications is stored as a draft. Returns the stored id. */
  addPolicy: (p: Policy) => string
  /* Copy a rule into another policy as an independent rule.

     Copied, never linked, and the distinction is the whole design. Zones and
     method sets are *referenced* — editing one reaches every rule that names
     it, which is what makes "Corporate Network" mean one thing across twenty
     policies. A rule is not that. Two policies can want the same conditions
     today and diverge next quarter, and a rule that propagated its edits would
     make the second policy change without anybody touching it.

     So: fresh id, fresh identity, no back-reference. Whoever copies it owns
     the copy.

     It lands where the builders would see it: in the policy while it is a
     draft, and in its saved draft once it is published, so the live rules are
     untouched until Review & save. Returns the rule's 1-based position and
     whether it went into a saved draft, or null for an unknown policy. */
  copyRuleInto: (targetPolicyId: string, rule: Rule) => { at: number; intoDraft: boolean } | null
  /** Returns the stored id. */
  addZone: (z: Zone) => string
  updateZone: (z: Zone) => void
  removeZone: (id: string) => void
  deletePolicy: (id: string) => void
  /** The old console's sign-in policies, still enforcing until the policy each moved to is turned on. */
  legacy: LegacyEstate
  /** What last happened to each policy in this visit: added, edited or opened (policy-activity.ts). */
  activity: ActivityLog
  /** Old policy id → the id of the new policy it moved to. */
  movedLegacy: Readonly<Record<string, string>>
  /** How the new builder opens: empty (no sign-in policies of its own, where the move starts) or with the seeded ones.
      A preview switch on All Policies sets it (owner, 3 Nov 2026). */
  builderStart: 'empty' | 'seeded'
  setBuilderStart: (s: 'empty' | 'seeded') => void
  /** Which moment the move banner is drawn at (owner, 4 Nov 2026: "three different states for time left"): today, or
      as if 45 or 7 days were left. A preview switch on the Old policy pages sets it. */
  deadlineView: DeadlineView
  setDeadlineView: (v: DeadlineView) => void
  /** The Policy builder intro (migrate/IntroCarousel.tsx), a popup over any page: `learn` from a What's new note,
      `migrate` from Start migration, where it ends in the move (owner, 4 Nov 2026: it plays every time). */
  intro: { mode: 'learn' | 'migrate'; pick?: string[] } | null
  openIntro: (mode: 'learn' | 'migrate', pick?: string[]) => void
  closeIntro: () => void
  /** The Start migration popup (migrate/MoveDialog.tsx; owner, 4 Nov 2026): a summary and the pick list, then the move
      runs in the background. `pick` preselects old policies. */
  moveDialog: { pick?: string[] } | null
  /** Review as a popup (migrate/ReviewDialog.tsx; owner, 5 Nov 2026), over any page. */
  reviewOpen: boolean
  openReview: () => void
  closeReview: () => void
  openMoveDialog: (pick?: string[]) => void
  /** Migrate has been pressed in the Migrate popup (migrate/phase.ts MIGRATION_FIRST): the rail opens the new Policies. */
  migrationStarted: boolean
  /** The Migrate popup's Migrate: the move starts, the rail swaps, and the console lands on New policies. */
  beginMigration: (plan: MovePlan) => void
  /** Approve in the builder, without publishing; false takes it back. */
  reviewMoved: (policyId: string, reviewed: boolean) => void
  closeMoveDialog: () => void
  /** What moves have made, waiting or added: Review's Created panel lists them. */
  movedProfiles: readonly FingerprintProfile[]
  /** After a move: which of Done's next steps the admin has taken (migrate/done-stage.tsx), and the tour of where
      everything landed (migrate/MoveTour.tsx), which crosses pages so it lives here. */
  setupDone: readonly string[]
  markSetup: (id: string) => void
  moveTour: boolean
  setMoveTour: (on: boolean) => void
  /** The tenant's applications and the ones only old policies name: what every Move screen looks names up in. */
  moveApps: readonly App[]
  /** The move running, or the last one, or null (migrate/MovePolicies.tsx; the top bar's pill reads it). */
  moveJob: MoveJob | null
  /** What each moved policy came from and what changed on the way, by new policy id; Review reads and approves it. */
  moved: Readonly<Record<string, MovedInfo>>
  /** Policies that arrived in the last move, for the Policies list to show arriving. */
  imported: readonly string[]
  /** Saves a plan from Move policies in the background: its zones at once, then one policy at a time (as drafts), at
      the top of the list, so the move runs while the admin works anywhere else. */
  startMove: (plan: MovePlan) => void
  /** Stops after the policy being saved: what has moved stays moved; the rest stays old. */
  stopMove: () => void
  /** Approve sends a moved policy to the list (a draft) or adds its rules to the policy it joined; false takes it back. */
  approveMoved: (policyId: string, approved: boolean) => void
  /** Moved policies waiting for review, outside the policy list. */
  staged: readonly Policy[]
  /** A moved policy, waiting or approved. */
  migratedById: (id: string) => Policy | undefined
  clearImported: () => void
  /* The migration's finale (owner, 5 Nov 2026): approved policies wait off the list until Add to Policies lays them
     in row by row; Make all active turns every moved draft active, one row at a time, and deletes the old policies
     they came from; then a done state. */
  /** Approved moved policies not yet laid into the list. */
  held: readonly string[]
  /** Rows lighting up right now (being added, or being made active). */
  landing: readonly string[]
  /** Lays the held policies into the list, one row at a time. */
  revealHeld: () => void
  /** True while Make all active runs. */
  activating: boolean
  /** Makes every moved draft active, one row at a time, then deletes the old policies they came from. */
  activateMoved: () => void
  /** The migration is finished: every moved policy active, the old ones deleted. Null until then. */
  migrationDone: { active: number; deleted: number } | null
  /** The move's full-page stage folded into a banner (owner, 5 Nov 2026): it keeps running either way. */
  moveMinimized: boolean
  setMoveMinimized: (v: boolean) => void
  closeMigrationDone: () => void
  /** Publishes moved drafts (owner, 6 Nov 2026): each becomes active, one row at a time, and the old policies it came from
      are deleted. Returns how many were published. */
  publishMoved: (ids: readonly string[]) => number
  /** Copies a policy as a draft with fresh rule ids, named "X (copy)", "X (copy 2)"… within 50 characters. Returns the copy's id; `policyById` finds it at once.
      `appIds` gives the copy those applications instead of the original's (an application page's "Add a copy"). */
  duplicatePolicy: (id: string, opts?: { appIds?: string[] }) => string | null
  /** Templates the board offers: the ones Xecurify ships and the ones this tenant saved. Reset per persona. */
  scenarios: Scenario[]
  /** Adds at the top. Returns the stored id. */
  addScenario: (s: Scenario) => string
  /** Takes one of this tenant's own templates away. Policies already made from it are copies and are not touched; a
      template Xecurify ships is not this tenant's to remove, so it is left. */
  removeScenario: (id: string) => void

  /** A message, and optionally one action beside it (Undo). The tone is read
      off the message unless it is given. */
  showToast: (m: string, action?: ToastAction, opts?: { tone?: ToastTone }) => void
  /** Close the toast now — its × button. */
  dismissToast: () => void
  /** Stop the toast's clock while the pointer or focus is on it (`held`), and run it on with the time it had left. By its id, so a newer toast is never held for an older one. */
  holdToast: (id: number, held: boolean) => void
}

const Ctx = createContext<BrandStore | null>(null)

/* The toast sits in its own context, and the reason is measurable.

   It used to be a field on the one store object. That object is memoized on a
   dependency list holding every collection in the app, so putting `toast` on it
   meant every toast changed the store's identity — twice, once to show and once
   to clear 2.8 seconds later. Every consumer of `useBrand()` re-rendered both
   times, and any downstream memo keyed on the store was invalidated with it:
   the policies screen re-ran its whole gauntlet over every policy because a
   zone had been renamed and said so.

   `showToast` stays on the main store — it is a stable useCallback, so it costs
   its callers nothing. Only the string moved, and only one node reads it. */
const ToastCtx = createContext<ToastMessage | null>(null)

/* A collection whose latest value can be read in the same event handler that
   changed it.

   `add*` has to hand back the id it stored, and a second add in the same
   handler (or a lookup of the first) has to see the first one. State alone
   cannot do that until the next render, so every write goes through `set`,
   which updates the ref first. */
function useCollection<T>(init: () => T[]) {
  const [items, setItems] = useState<T[]>(init)
  const ref = useRef(items)
  const set = useCallback((next: T[] | ((all: T[]) => T[])) => {
    const value = typeof next === 'function' ? next(ref.current) : next
    ref.current = value
    setItems(value)
  }, [])
  return [items, set, ref] as const
}

/* The id an added item is stored under: its own when nothing else has it,
   otherwise a fresh one from its name. */
function freeId<T extends { id: string }>(all: readonly T[], item: T, prefix: string, name: string): string {
  const taken = all.map((x) => x.id)
  return item.id && !taken.includes(item.id) ? item.id : newId(prefix, taken, name)
}

/* A copy stays a copy only under the name it was given (owner, 23 Oct 2026: "if the user renamed it once, we can
   remove the color"). `copiedFrom` is the store's own: `duplicatePolicy` sets it, a rename anywhere takes it away
   for good, and no save brings it back — a builder opened before the rename still holds the old record, and Save
   policy would otherwise write the mark back over the new name. With it go the name's highlight and the canvas's
   copy note (BoardBar.tsx, PolicyNotice.tsx). */
function keepsCopyMark(p: Policy, before: Policy | undefined): Policy {
  const { copiedFrom: _mark, ...rest } = p
  return before?.copiedFrom && p.name === before.name ? { ...rest, copiedFrom: before.copiedFrom } : rest
}

const MISSING_TINT = '#94a3b8'

/* A person put in a group: it becomes their first group when they have none,
   one of their others when they have one. The same record when they are in it
   already, so `setMembership` can tell who changed. */
function joinGroup(u: User, groupId: string): User {
  if (memberGroupIds(u).includes(groupId)) return u
  if (!u.groupId) return { ...u, groupId }
  return { ...u, alsoGroupIds: [...(u.alsoGroupIds ?? []), groupId] }
}

/* A person taken out of a group. Out of their first group, their next one
   moves up (`groupId` is what a picker files them under), or they are left in
   none — `''`, which `memberGroupIds` reads as no group. */
function leaveGroup(u: User, groupId: string): User {
  if (!memberGroupIds(u).includes(groupId)) return u
  const { alsoGroupIds = [], ...rest } = u
  const others = alsoGroupIds.filter((id) => id !== groupId)
  const first = u.groupId === groupId ? (others.shift() ?? '') : u.groupId
  return others.length > 0 ? { ...rest, groupId: first, alsoGroupIds: others } : { ...rest, groupId: first }
}

/* A sign-in policy the empty new builder keeps: the tenant's system policy, and every post sign-in policy (another tab). */
const keptWhenEmpty = (p: Policy) => !!p.isSystem || p.type === 'Session'

export function BrandProvider({ children, fresh = false }: { children: ReactNode; fresh?: boolean }) {
  /* The tenant the console opens on. The showcase build loads the presentation
     tenant (showcase-seed.ts); every other build loads the Security IT
     Manager's, which is the default persona below. Chosen once, lazily, and
     read by every initialiser that follows. */
  const [seed] = useState<Tenant>(() => (SHOWCASE ? showcaseTenant() : tenantAt('medium')))
  /* `fresh` (the app passes it, tests do not): the new builder as a tenant first meets it, with no sign-in policies
     of its own yet, so the move from the old builder starts on an empty page (owner, 3 Nov 2026). */
  const [policies, setPolicies, policiesRef] = useCollection<Policy>(() => (fresh ? seed.policies.filter(keptWhenEmpty) : seed.policies))
  const [builderStart, setBuilderStartState] = useState<'empty' | 'seeded'>(fresh ? 'empty' : 'seeded')
  const [deadlineView, setDeadlineView] = useState<DeadlineView>('now')
  const [intro, setIntro] = useState<{ mode: 'learn' | 'migrate'; pick?: string[] } | null>(null)
  const [moveDialog, setMoveDialog] = useState<{ pick?: string[] } | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [setupDone, setSetupDone] = useState<string[]>([])
  const [moveTour, setMoveTour] = useState(false)
  const setBuilderStart = useCallback(
    (s: 'empty' | 'seeded') => {
      setBuilderStartState(s)
      const seededIds = new Set(seed.policies.map((p) => p.id))
      if (s === 'empty') setPolicies((all) => all.filter((p) => keptWhenEmpty(p) || !seededIds.has(p.id)))
      /* Back with the seeded policies, but never a second policy on an application that has one by now (one app, one
         policy): a seeded policy whose application already moved over stays out. */
      else
        setPolicies((all) => {
          const taken = new Set(all.filter((p) => !keptWhenEmpty(p)).flatMap((p) => p.appIds))
          return [...all, ...seed.policies.filter((p) => !all.some((x) => x.id === p.id) && !p.appIds.some((a) => taken.has(a)))]
        })
    },
    [seed, setPolicies],
  )
  const [changeLog, setChangeLog] = useState<ChangeEntry[]>(() => (SHOWCASE ? seedChangeLog(seed.policies, new Date()) : []))
  /* Zones are edited in place now that they carry two sections, so they need
     the same draft/commit treatment policies already had. */
  const [zones, setZones, zonesRef] = useCollection<Zone>(() => seed.zones)
  const [scenarios, setScenarios, scenariosRef] = useCollection<Scenario>(() => seed.scenarios)
  const [savedSignIns, setSavedSignIns, savedSignInsRef] = useCollection<SavedSignIn>(() => seed.savedSignIns)
  const [legacy, setLegacy] = useState<LegacyEstate>(() => (SHOWCASE ? (MIGRATE_SCALE ? scaleLegacy : showcaseLegacy) : EMPTY_LEGACY))
  const [movedLegacy, setMovedLegacy] = useState<Record<string, string>>({})
  const movedLegacyRef = useRef(movedLegacy)
  movedLegacyRef.current = movedLegacy
  const [activity, setActivity] = useState<ActivityLog>({})
  const [moveJob, setMoveJob] = useState<MoveJob | null>(null)
  const [moved, setMoved] = useState<Record<string, MovedInfo>>({})
  const movedRef = useRef(moved)
  movedRef.current = moved
  /* Policies a move made that have not been approved: kept out of `policies` (and so out of every list) until then. */
  const [staged, setStaged] = useState<Policy[]>([])
  const stagedRef = useRef<Policy[]>([])
  const [imported, setImported] = useState<string[]>([])
  const [held, setHeld] = useState<string[]>([])
  const heldRef = useRef(held)
  heldRef.current = held
  const [landing, setLanding] = useState<string[]>([])
  const [activating, setActivating] = useState(false)
  const [moveMinimized, setMoveMinimized] = useState(false)
  const [migrationDone, setMigrationDone] = useState<{ active: number; deleted: number } | null>(null)
  const finaleTimers = useRef<number[]>([])
  useEffect(() => () => finaleTimers.current.forEach((t) => window.clearTimeout(t)), [])
  const moveRef = useRef<{ plan: MovePlan; at: number; ids: string[] } | null>(null)
  /* The Migrate popup's press starts the move the same way Move policies does. */
  const startMoveRef = useRef<(plan: MovePlan) => void>(() => {})
  const touch = useCallback((ids: string[], kind: ActivityKind) => {
    const at = Date.now()
    setActivity((a) => ({ ...a, ...Object.fromEntries(ids.map((id) => [id, { kind, at }])) }))
  }, [])
  const [screen, setScreenState] = useState<BrandScreen>(MIGRATION_FIRST ? { name: 'old-login' } : { name: 'policies' })
  const [migrationStarted, setMigrationStarted] = useState(!MIGRATION_FIRST)
  /* The screen as of the last navigation, for `go` to compare against without
     waiting for a render. */
  const screenRef = useRef(screen)
  const setScreen = useCallback((s: BrandScreen) => {
    screenRef.current = s
    setScreenState(s)
  }, [])
  /* A ref, not state: the guard is read during navigation and must not cause a
     render when a screen registers or clears one. */
  const leaveGuard = useRef<LeaveGuard | null>(null)
  /* The leave that is waiting on the dialog. A ref, because it is a closure and
     rendering it would be meaningless; the dialog renders `pendingLeave`. */
  const pendingRun = useRef<(() => void) | null>(null)
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null)
  /* True while a confirmed leave runs, so a `go` inside that run is not stopped
     by the same guard a second time. */
  const leaving = useRef(false)

  /* The save-blocked reason only when Save is offered. A persona switch offers
     no Save, and a reason for a button that is not there is noise. */
  const describeLeave = (g: LeaveGuard, canSave = true): PendingLeave => {
    const offered = canSave && !!g.save
    return {
      saveLabel: g.saveLabel?.() ?? 'Save',
      canSave: offered,
      blocked: offered ? (g.blocked?.() ?? null) : null,
    }
  }

  const requestLeave = useCallback((run: () => void, opts?: { canSave?: boolean }) => {
    const g = leaveGuard.current
    if (!leaving.current && g && g.dirty()) {
      pendingRun.current = run
      setPendingLeave(describeLeave(g, opts?.canSave ?? true))
      return
    }
    run()
  }, [])

  /* A new policy nobody saved goes as its board does, whichever way out was taken and before the next screen paints, so
     no list draws it and no application's one slot is held by it (policy-draft.ts `newPolicy`). */
  useLayoutEffect(() => {
    const open = screen.name === 'board' ? screen.policyId : null
    setPolicies((all) => (all.some((p) => p.provisional && p.id !== open) ? all.filter((p) => !p.provisional || p.id === open) : all))
  }, [screen, setPolicies])

  const [visit, setVisit] = useState(0)
  const go = useCallback(
    (s: BrandScreen) =>
      requestLeave(() => {
        /* The rail item for the screen already open reopens it at its list;
           a tab, a testing view or the testing slider on the same screen does
           not (revisit.ts). */
        const again = isRevisit(screenRef.current, s)
        if (s.name === 'board' || s.name === 'builder') touch([s.policyId], 'opened')
        setScreen(s)
        if (leaving.current || again) setVisit((v) => v + 1)
      }),
    [requestLeave, setScreen, touch],
  )

  const registerLeaveGuard = useCallback((g: LeaveGuard) => {
    leaveGuard.current = g
  }, [])
  const releaseLeaveGuard = useCallback((g: LeaveGuard) => {
    if (leaveGuard.current === g) leaveGuard.current = null
  }, [])

  const finishLeave = useCallback(() => {
    const run = pendingRun.current
    pendingRun.current = null
    setPendingLeave(null)
    if (!run) return
    leaving.current = true
    try {
      run()
    } finally {
      leaving.current = false
    }
  }, [])

  const leaveSave = useCallback(() => {
    const g = leaveGuard.current
    if (!g?.save || !g.save()) {
      /* Could not save — say why, and stay. */
      if (g) setPendingLeave(describeLeave(g))
      return
    }
    finishLeave()
  }, [finishLeave])
  const leaveDiscard = finishLeave
  const leaveStay = useCallback(() => {
    pendingRun.current = null
    setPendingLeave(null)
  }, [])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastSeq = useRef(0)
  const [gauntletOverrides, setOverrides] = useState<Record<string, Record<string, AccessDecision>>>({})
  const [breakInAccepted, setBreakInAccepted] = useState<Record<string, Record<string, BreakInAcceptance>>>({})
  const [methodSets, setMethodSets] = useState<MethodSet[]>(() => seed.methodSets)
  /* Fingerprint profiles live here rather than on the screen: policy rules
     name them, so the linter and the simulator have to be able to resolve
     one without the Device Fingerprint page being mounted. */
  const [fingerprints, setFingerprints, fingerprintsRef] = useCollection<FingerprintProfile>(() => seed.fingerprints)
  const visibleFingerprints = useMemo(() => fingerprints.filter((f) => f.fromOld !== 'waiting'), [fingerprints])
  const [riskProfiles, setRiskProfiles, riskProfilesRef] = useCollection<RiskProfile>(() => seed.riskProfiles)
  const [activeRiskProfileId, setActiveRiskProfileId] = useState(seed.activeRiskProfileId)
  /* The scale comes from the profile in use, and falls back to the shipped
     weighting rather than to `undefined` if the id ever points at nothing —
     a tenant with a broken pointer should grade as they did on day one, not
     crash the evaluator. Kept out of the store's memo so it is the same object
     until the profiles change: `useSimEnv` rebuilds on it, and a new scale on
     every navigation rebuilt every env and every result memoised on one. */
  const scale = useMemo(
    () => riskScale(riskProfiles.find((p) => p.id === activeRiskProfileId) ?? EMPTY_RISK_PROFILE),
    [riskProfiles, activeRiskProfileId],
  )
  const [hooks, setHooks, hooksRef] = useCollection<Hook>(() => seed.hooks)
  const [hardwareTokens, setHardwareTokens] = useState<HardwareToken[]>(() => seed.tokens)
  /* The seeded catalogue ships Display Token unconfigured; the seeded drawer
     has fobs issued. `withTokenState` reconciles the two from the first
     render, so the method row never disagrees with the inventory. */
  const [methods, setMethods] = useState<AuthMethod[]>(() => allOn(withTokenState(seed.methods, seed.tokens)))
  /* The latest tokens, ahead of the next render. The actions return results
     synchronously, so they compute from here rather than from `hardwareTokens`
     — otherwise two calls in one handler (a CSV assigning to three people is
     three calls) would each start from the same stale list and the last would
     overwrite the others. */
  const tokensRef = useRef(hardwareTokens)
  const commitTokens = useCallback((next: HardwareToken[]) => {
    tokensRef.current = next
    setHardwareTokens(next)
    /* miniOrange assigns tokens before the method is enabled, so the method is
       configured only while a token is assigned, and switches off with the last. */
    setMethods((ms) => withTokenState(ms, next))
  }, [])
  const [recovery, setRecovery] = useState<RecoverySettings>(RECOVERY_DEFAULTS)
  const [mfaBehaviour, setMfaBehaviour] = useState<MfaValues>({})
  const [defaultMethodId, setDefaultMethodId] = useState<string | null | undefined>(undefined)
  const [methodConfig, setMethodConfig] = useState<Record<string, ConfigField[]>>({})
  const [setupChoice, setSetupChoice] = useState<Record<string, string>>({})
  const [enrolment, setEnrolment] = useState<UserEnrolment>(SEED_ENROLMENT)
  const [apps, setApps, appsRef] = useCollection<App>(() => seed.apps)
  /* With the old console at scale, the applications only its rows name (migrate/scale-seed.ts). They are not in the
     tenant's lists until a policy moves onto them: every other screen keeps the showcase's own thirteen. */
  const legacyApps = SHOWCASE && MIGRATE_SCALE ? scaleApps : NO_APPS
  const moveApps = useMemo(() => [...apps, ...legacyApps.filter((a) => !apps.some((x) => x.id === a.id))], [apps, legacyApps])
  const legacyAppsRef = useRef(legacyApps)
  const [groups, setGroups] = useState<Group[]>(() => seed.groups)
  const [directory, setDirectoryState] = useState(() => seed.directory)
  /* The latest directory, ahead of the next render, as `tokensRef` above:
     `setMembership` returns the records it replaced, so two calls in one
     handler must each start from the other's result. */
  const directoryRef = useRef(directory)
  const setDirectory = useCallback((next: Tenant['directory']) => {
    directoryRef.current = next
    setDirectoryState(next)
  }, [])
  /* `lite`, and nothing on screen changes it.

     It was `'full'` — everything this prototype argues for, switchable from a
     bar in the shell. The bar is hidden, so the initial value is now the only
     value, and it is the scope as requested rather than the scope as argued
     for. `setEdition` stays wired: the state, the flags and every gate that
     reads them are unchanged, so putting the switch back is a one-line edit in
     `Shell.tsx` and nothing else. */
  const [edition, setEdition] = useState<Edition>('lite')
  const [persona, setPersonaId] = useState<PersonaId>('manager')
  const personaRef = useRef(persona)
  const [role, setRoleState] = useState<Role>('admin')

  /* Switching role lands you somewhere that exists for it. An end user has no
     policies screen to return to, and an admin arriving on the app launcher
     would be looking at the one screen that is not theirs. The two shells are
     different components, so the screen remounts without a visit bump. */
  const setRole = useCallback(
    (r: Role) =>
      requestLeave(() => {
        setRoleState(r)
        setScreen(r === 'user' ? { name: 'apps' } : { name: 'policies' })
      }),
    [requestLeave, setScreen],
  )

  /* One swap, every tab. Held here rather than in the switcher so that a screen
     mounted at the time reads the new tenant on its next render instead of
     holding the old one until it is revisited. */
  /* Through the leave guard like any other way out, but with no Save: the swap
     replaces every policy, so a draft saved a moment before would go with it.

     Everything tenant-shaped is reset, including the risk profile in use, the
     saved templates and the Authentication methods settings, and `visit` is
     bumped so the screen remounts even when the new persona lands on the same
     one: an open zone, a search or a draft from the last tenant must not carry
     into this one. Picking the persona already loaded does nothing, because
     reloading it would silently undo every saved change. */
  const setPersona = useCallback(
    (id: PersonaId) => {
      if (id === personaRef.current) return
      requestLeave(
        () => {
          const { depth, landing } = personaById(id)
          const t = tenantAt(depth)
          personaRef.current = id
          setPersonaId(id)
          setPolicies(t.policies)
          setChangeLog([])
          setZones(t.zones)
          setScenarios(t.scenarios)
          setMethodSets(t.methodSets)
          tokensRef.current = t.tokens
          setHardwareTokens(t.tokens)
          setMethods(withTokenState(t.methods, t.tokens))
          setFingerprints(t.fingerprints)
          setRiskProfiles(t.riskProfiles)
          setActiveRiskProfileId(t.activeRiskProfileId)
          setHooks(t.hooks)
          setApps(t.apps)
          setGroups(t.groups)
          setDirectory(t.directory)
          setSavedSignIns(t.savedSignIns)
          setLegacy(EMPTY_LEGACY)
          setMovedLegacy({})
          setActivity({})
          moveRef.current = null
          setMoveJob(null)
          setMoved({})
          setImported([])
          stagedRef.current = []
          setStaged([])
          setOverrides({})
          setBreakInAccepted({})
          setRecovery(RECOVERY_DEFAULTS)
          setMfaBehaviour({})
          setDefaultMethodId(undefined)
          setMethodConfig({})
          setSetupChoice({})
          setEnrolment(SEED_ENROLMENT)
          setScreen(TAB_SCREEN[landing])
          setVisit((v) => v + 1)
        },
        { canSave: false },
      )
    },
    [requestLeave, setPolicies, setZones, setScenarios, setFingerprints, setRiskProfiles, setHooks, setSavedSignIns, setScreen, setDirectory, setApps],
  )

  /* With an action the toast stays six seconds rather than about three: long
     enough to read "Condition removed", decide, and reach Undo.

     And it waits while somebody is at it (review, 24 Oct 2026): the clock stops
     while the pointer is over the toast or focus is inside it, and runs on with
     the time it had left when they leave (`holdToast`, from Shell.tsx `Toast`).
     A plain timeout let a keyboard user tab towards Undo and lose it on the way —
     after a live swap the Undo is the only way back — and a toast that expired
     with focus on its button dropped focus to <body>. */
  const toastClock = useRef<{ id: number; timer: number | null; left: number; since: number } | null>(null)
  const stopToastClock = useCallback(() => {
    const c = toastClock.current
    if (c?.timer != null) window.clearTimeout(c.timer)
    toastClock.current = null
  }, [])
  const runToastClock = useCallback((id: number, ms: number) => {
    const timer = window.setTimeout(() => {
      toastClock.current = null
      setToast((t) => (t?.id === id ? null : t))
    }, ms)
    toastClock.current = { id, timer, left: ms, since: Date.now() }
  }, [])
  const showToast = useCallback(
    (m: string, action?: ToastAction, opts?: { tone?: ToastTone }) => {
      toastSeq.current += 1
      const id = toastSeq.current
      const duration = toastDuration(!!action)
      setToast({ id, text: m, action, tone: opts?.tone ?? toastTone(m), duration })
      stopToastClock()
      runToastClock(id, duration)
    },
    [stopToastClock, runToastClock],
  )
  const holdToast = useCallback(
    (id: number, held: boolean) => {
      const c = toastClock.current
      if (!c || c.id !== id) return
      if (held && c.timer !== null) {
        window.clearTimeout(c.timer)
        toastClock.current = { ...c, timer: null, left: Math.max(0, c.left - (Date.now() - c.since)) }
      } else if (!held && c.timer === null) {
        runToastClock(id, c.left)
      }
    },
    [runToastClock],
  )
  const dismissToast = useCallback(() => {
    stopToastClock()
    setToast(null)
  }, [stopToastClock])

  const value = useMemo<BrandStore>(
    () => ({
      apps,
      groups,
      users: directory.people,
      unlistedUsers: directory.unlisted,
      zones,
      /* A profile a move made is not listed until a policy using it is approved (fingerprintById still finds it). */
      fingerprints: visibleFingerprints,
      hooks,
      edition,
      /* The showcase pin (showcase.ts): lite, plus the tenant-wide testing
         page and the Break-in test the owner is comparing (25 Sep 2026). The
         one place any feature is pinned, so the store is where to look.
         Describe it was hidden on 30 Sep 2026 ("hide this, not needed as of
         now") and is back on (owner, 9 Oct 2026: the third start option) —
         the chooser card, the canvas door and the palette entry go with the
         flag; its checks stay on. */
      features: SHOWCASE
        ? { ...featuresOf(edition), policyTesting: true, breakInTest: true, describePolicy: true, draftChecks: true }
        : featuresOf(edition),
      setEdition,
      persona,
      setPersona,
      role,
      setRole,
      account: role === 'user' ? END_USER_ACCOUNT : ADMIN_ACCOUNT,
      viewerId: END_USER_ACCOUNT.id,
      methodSets,
      methods,
      setMethods,

      hardwareTokens,
      addHardwareTokens: (ts) => {
        const current = tokensRef.current
        const seen = new Set(current.map((t) => serialKey(t.serial)))
        const fresh = ts.filter((t) => !seen.has(serialKey(t.serial)) && !!seen.add(serialKey(t.serial)))
        if (fresh.length) commitTokens([...current, ...fresh])
      },
      deleteHardwareTokens: (serials) => {
        const r = deleteTokens(tokensRef.current, serials)
        if (r.deleted.length) commitTokens(r.tokens)
        return { deleted: r.deleted, blocked: r.blocked }
      },
      assignHardwareTokens: (userId, serials) => {
        const r = assignTokens(tokensRef.current, userId, serials, formatDay(new Date()))
        if (r.assigned.length) commitTokens(r.tokens)
        return { assigned: r.assigned, skipped: r.skipped }
      },
      unassignHardwareTokens: (serials) => {
        const current = tokensRef.current
        const next = unassignTokens(current, serials)
        if (next.some((t, i) => t !== current[i])) commitTokens(next)
      },
      syncHardwareToken: (serial) => {
        const r = syncToken(tokensRef.current, serial, formatDay(new Date()))
        if (!r.error) commitTokens(r.tokens)
      },

      recovery,
      setRecovery,
      mfaBehaviour,
      setMfaBehaviour,
      defaultMethodId,
      setDefaultMethodId,
      methodConfig,
      setMethodConfig,
      setupChoice,
      setSetupChoice,
      enrolment,
      setEnrolment,

      templates: seedTemplates,
      scenarios,
      addScenario: (s: Scenario) => {
        const id = freeId(scenariosRef.current, s, 's', s.name)
        setScenarios((all) => [{ ...s, id }, ...all])
        return id
      },
      removeScenario: (id: string) => setScenarios((all) => all.filter((s) => s.id !== id || s.provided)),
      policies,
      legacy,
      movedLegacy,
      activity,
      builderStart,
      setBuilderStart,
      deadlineView,
      setDeadlineView,
      intro,
      openIntro: (mode, pick) => setIntro({ mode, pick }),
      closeIntro: () => setIntro(null),
      moveDialog,
      reviewOpen,
      /* Review is a page now (owner, 5 Nov 2026). */
      openReview: () => go({ name: 'review-moved' }),
      closeReview: () => setReviewOpen(false),
      /* The move form is a page now (owner, 5 Nov 2026). */
      /* With migration first, the intro ends in the Migrate popup; the rail only swaps on its Migrate (owner, 6 Nov 2026). */
      openMoveDialog: (pick) => {
        if (MIGRATION_FIRST && !migrationStarted) {
          setMoveDialog({ pick })
          return
        }
        go({ name: 'move-policies', pick })
      },
      migrationStarted,
      closeMoveDialog: () => setMoveDialog(null),
      movedProfiles: fingerprints.filter((f) => !!f.fromOld),
      setupDone,
      markSetup: (id) => setSetupDone((d) => (d.includes(id) ? d : [...d, id])),
      moveTour,
      setMoveTour,
      moveApps,
      moveJob,
      moved,
      imported,
      /* Zones first and with their own ids: the plan's conditions already name them. */
      startMove: (plan) => {
        if (moveRef.current) return
        setZones((all) => [...all, ...plan.zones.filter((z) => !all.some((x) => x.id === z.id))])
        /* Device profiles the move made wait the same way, out of the Device profiles list until a policy using one is approved. */
        if (plan.profiles?.length) setFingerprints((all) => [...all, ...plan.profiles.filter((p) => !all.some((x) => x.id === p.id))])
        moveRef.current = { plan, at: 0, ids: [] }
        setImported([])
        const queue = plan.policies.map((p) => ({ key: p.key, name: p.policy.name, appIds: p.appIds, sourceIds: p.sourceIds, joins: !!p.into }))
        setMoveJob({ total: plan.policies.length, done: 0, ids: [], status: plan.policies.length ? 'running' : 'done', queue, zones: plan.zones.length })
      },
      beginMigration: (plan) => {
        setMoveDialog(null)
        setMigrationStarted(true)
        try {
          localStorage.setItem('brand-policies-type', 'sign-in')
        } catch {
          /* the tab just isn't remembered */
        }
        go({ name: 'policies' })
        startMoveRef.current(plan)
      },
      reviewMoved: (policyId, reviewed) =>
        setMoved((m) => {
          const info = m[policyId]
          if (!info || !!info.reviewed === reviewed) return m
          const next = { ...info }
          if (reviewed) next.reviewed = true
          else delete next.reviewed
          return { ...m, [policyId]: next }
        }),
      stopMove: () => {
        if (!moveRef.current) return
        moveRef.current = null
        setMoveJob((j) => (j ? { ...j, status: 'stopped' } : j))
      },
      /* Approve is the door into the policy list (owner, 4 Nov 2026). A new policy leaves `staged` and arrives as
         a draft; a joined one gets its pending rules — straight into a policy still in draft or monitoring, into the
         saved draft of one that decides sign-ins. Taking approval back undoes exactly that. */
      approveMoved: (policyId, approved) => {
        const info = movedRef.current[policyId]
        if (!info || info.approved === approved) return
        const stagedOne = stagedRef.current.find((p) => p.id === policyId)
        if (approved) {
          if (stagedOne) {
            stagedRef.current = stagedRef.current.filter((p) => p.id !== policyId)
            setStaged((all) => all.filter((p) => p.id !== policyId))
            setPolicies((all) => [stagedOne, ...all])
            setHeld((h) => (h.includes(policyId) ? h : [...h, policyId]))
            const joining = legacyAppsRef.current.filter((a) => stagedOne.appIds.includes(a.id) && !appsRef.current.some((x) => x.id === a.id))
            if (joining.length) setApps((all) => [...all, ...joining.filter((a) => !all.some((x) => x.id === a.id))])
            touch([policyId], 'added')
            setImported((i) => [...i.filter((x) => x !== policyId), policyId])
          } else if (info.pending?.length) {
            const add = info.pending
            const join = (t: Policy): Policy =>
              t.status === 'monitor' || t.status === 'draft'
                ? { ...t, rules: [...t.rules, ...add], lastModified: 'Just now', modifiedBy: 'You' }
                : withSavedDraft(t, { rules: [...(t.pendingDraft?.rules ?? t.rules), ...add], fallback: t.pendingDraft?.fallback ?? t.fallback })
            setPolicies((all) => all.map((t) => (t.id === policyId ? join(t) : t)))
            touch([policyId], 'edited')
          }
        } else {
          const live = policiesRef.current.find((p) => p.id === policyId)
          if (live && !info.joined) {
            setPolicies((all) => all.filter((p) => p.id !== policyId))
            setHeld((h) => h.filter((x) => x !== policyId))
            stagedRef.current = [live, ...stagedRef.current]
            setStaged((all) => [live, ...all])
            setImported((i) => i.filter((x) => x !== policyId))
          } else if (live && info.pending?.length) {
            const drop = new Set(info.pending.map((r) => r.id))
            const unjoin = (t: Policy): Policy =>
              t.pendingDraft
                ? { ...t, pendingDraft: { ...t.pendingDraft, rules: t.pendingDraft.rules.filter((r) => !drop.has(r.id)) } }
                : { ...t, rules: t.rules.filter((r) => !drop.has(r.id)) }
            setPolicies((all) => all.map((t) => (t.id === policyId ? unjoin(t) : t)))
          }
        }
        /* The zones a move made wait with its policies, out of the Zones list; the first approved policy using one
           brings it in. Taking that back leaves the zone: another approved policy may use it, and it is harmless. */
        if (approved) {
          const uses = JSON.stringify([stagedOne?.rules ?? [], info.pending ?? []])
          setZones((all) => (all.some((z) => z.fromOld === 'waiting' && uses.includes(`"${z.id}"`)) ? all.map((z) => (z.fromOld === 'waiting' && uses.includes(`"${z.id}"`) ? { ...z, fromOld: 'added' } : z)) : all))
          setFingerprints((all) => (all.some((f) => f.fromOld === 'waiting' && uses.includes(`"${f.id}"`)) ? all.map((f) => (f.fromOld === 'waiting' && uses.includes(`"${f.id}"`) ? { ...f, fromOld: 'added' } : f)) : all))
        }
        setMoved((m) => (m[policyId] ? { ...m, [policyId]: { ...m[policyId], approved } } : m))
      },
      staged,
      migratedById: (id) => stagedRef.current.find((p) => p.id === id) ?? policiesRef.current.find((p) => p.id === id),
      clearImported: () => setImported([]),
      held,
      landing,
      revealHeld: () => {
        const ids = [...heldRef.current]
        if (!ids.length) return
        setImported([])
        ids.forEach((id, n) => {
          finaleTimers.current.push(
            window.setTimeout(() => {
              setHeld((h) => h.filter((x) => x !== id))
              setLanding((l) => [...l, id])
            }, 160 * n),
          )
        })
        finaleTimers.current.push(window.setTimeout(() => setLanding([]), 160 * ids.length + 2200))
      },
      activating,
      activateMoved: () => {
        const ids = policiesRef.current.filter((p) => p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0).map((p) => p.id)
        if (!ids.length) return
        setActivating(true)
        setLanding([])
        ids.forEach((id, n) => {
          finaleTimers.current.push(
            window.setTimeout(() => {
              setPolicies((all) => all.map((x) => (x.id === id && x.status === 'draft' ? { ...x, status: 'active', lastModified: 'Just now', modifiedBy: 'You' } : x)))
              setLanding((l) => [...l, id])
            }, 140 * n),
          )
        })
        finaleTimers.current.push(
          window.setTimeout(() => {
            /* The old policies stay (owner, 6 Nov 2026): they remain readable in the Old policies tab. */
            touch(ids, 'edited')
            setActivating(false)
            setLanding([])
            setMigrationDone({ active: ids.length, deleted: 0 })
          }, 140 * ids.length + 900),
        )
      },
      migrationDone,
      moveMinimized,
      setMoveMinimized,
      closeMigrationDone: () => setMigrationDone(null),
      publishMoved: (ids) => {
        const list = policiesRef.current.filter((p) => ids.includes(p.id) && p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
        if (!list.length) return 0
        setLanding([])
        list.forEach((p, n) => {
          finaleTimers.current.push(
            window.setTimeout(() => {
              setPolicies((all) => all.map((x) => (x.id === p.id && x.status === 'draft' ? { ...x, status: 'active', lastModified: 'Just now', modifiedBy: 'You' } : x)))
              setLanding((l) => [...l, p.id])
            }, 120 * n),
          )
        })
        finaleTimers.current.push(
          window.setTimeout(() => {
            /* The old policies stay (owner, 6 Nov 2026): they remain readable in the Old policies tab. */
            touch(list.map((p) => p.id), 'edited')
            setLanding([])
          }, 120 * list.length + 1600),
        )
        return list.length
      },

      screen,
      visit,
      go,
      registerLeaveGuard,
      releaseLeaveGuard,
      requestLeave,
      pendingLeave,
      leaveSave,
      leaveDiscard,
      leaveStay,

      /* An unknown id falls back to the first app or group, and to a stand-in
         named by the id when the tenant has none (a day-one tenant), so a
         stale reference never throws. */
      appById: (id) =>
        apps.find((a) => a.id === id) ??
        apps[0] ?? { id, name: id, protocol: 'SAML', glyph: '?', tint: MISSING_TINT, type: 'Desktop', lastUpdated: '' },
      /* Stamped here, not by the caller: one writer of Last updated, as
         `savePolicy` is the one writer of a policy's. */
      saveApp: (app) => setApps((all) => all.map((a) => (a.id === app.id ? { ...app, lastUpdated: consoleStamp(new Date()) } : a))),
      /* Appended: the list sorts itself, by name unless somebody sorted it otherwise. */
      addApp: (app) => {
        const id = freeId(appsRef.current, app, 'app', app.name)
        const now = new Date()
        setApps((all) => [...all, { ...app, id, lastUpdated: consoleStamp(now), addedAt: now.getTime() }])
        return id
      },
      groupById: (id) => groups.find((g) => g.id === id) ?? groups[0] ?? { id, name: id, memberCount: 0 },
      saveGroup: (g) => setGroups((all) => all.map((x) => (x.id === g.id ? { ...g, lastModified: consoleStamp(new Date()) } : x))),
      userById: (id) => directory.people.find((u) => u.id === id),
      /* From the ref, so a second call in the same handler starts from the
         first one's result. `memberCount` is left alone: it is the stated size
         the Who picker counts with, and the directory is a sample of it. */
      setMembership: (userIds, groupId, member) => {
        const dir = directoryRef.current
        const prev: User[] = []
        const people = dir.people.map((u) => {
          if (!userIds.includes(u.id)) return u
          const next = member ? joinGroup(u, groupId) : leaveGroup(u, groupId)
          if (next !== u) prev.push(u)
          return next
        })
        if (prev.length > 0) setDirectory({ ...dir, people })
        return prev
      },
      restoreUsers: (prev) => {
        if (prev.length === 0) return
        const dir = directoryRef.current
        const was = new Map(prev.map((u) => [u.id, u]))
        setDirectory({ ...dir, people: dir.people.map((u) => was.get(u.id) ?? u) })
      },
      // Reads live state, not the seed — otherwise a deleted or renamed zone
      // keeps resolving everywhere it is referenced. The ref, so a zone added
      // earlier in the same handler resolves too.
      zoneById: (id) => zonesRef.current.find((z) => z.id === id),
      fingerprintById: (id) => fingerprintsRef.current.find((p) => p.id === id),
      hookById: (id) => hooksRef.current.find((h) => h.id === id),
      addHook: (h) => {
        const clean = normaliseHook(h)
        const id = freeId(hooksRef.current, clean, 'hk', clean.name)
        setHooks((all) => [...all, { ...clean, id }])
        return id
      },
      updateHook: (h) => {
        const clean = normaliseHook(h)
        setHooks((all) => all.map((x) => (x.id === clean.id ? clean : x)))
      },
      /* Same contract as zones and fingerprints: deleting does not unlink the
         rules naming it. The linter reports a condition pointing at nothing,
         which is a louder and more accurate signal than a rule that silently
         rewrote itself while nobody was looking. */
      removeHook: (id) => setHooks((all) => all.filter((h) => h.id !== id)),
      riskProfiles,
      activeRiskProfileId,
      addRiskProfile: (p) => {
        const id = freeId(riskProfilesRef.current, p, 'rp', p.name)
        setRiskProfiles((all) => [...all, { ...p, id }])
        return id
      },
      updateRiskProfile: (p) => setRiskProfiles((all) => all.map((x) => (x.id === p.id ? p : x))),
      /* Deleting the profile IN USE would leave the evaluator with no scale, so
         the active id falls back to the first survivor rather than dangling.
         The screen refuses the delete before it gets here; this is the guard
         that makes the refusal a policy rather than the only thing standing
         between a tenant and an undefined risk scale. */
      removeRiskProfile: (id) => {
        const left = riskProfilesRef.current.filter((p) => p.id !== id)
        setRiskProfiles(left)
        if (id === activeRiskProfileId && left[0]) setActiveRiskProfileId(left[0].id)
      },
      useRiskProfile: setActiveRiskProfileId,
      riskScale: scale,
      addFingerprint: (p) => {
        const id = freeId(fingerprintsRef.current, p, 'fp', p.name)
        setFingerprints((all) => [...all, { ...p, id }])
        return id
      },
      updateFingerprint: (p) => setFingerprints((all) => all.map((x) => (x.id === p.id ? p : x))),
      /* Deleting a profile does not unlink the rules naming it. ConfirmDelete
         moves any live policy that uses it to draft (a system policy blocks the
         delete), and the checks flag any rule left naming it (PE135), same as
         zones (PE134) and hooks (PE130). */
      removeFingerprint: (id) => setFingerprints((all) => all.filter((p) => p.id !== id)),
      policyById: (id) => policiesRef.current.find((p) => p.id === id),

      gauntletOverrides,
      /* Passing null clears the override rather than storing the card's own
         default, so "same as shipped" and "explicitly agreed with" are the same
         state. Two ways to spell one thing is how a count of overrides ends up
         lying about how much the tenant has actually decided. */
      setGauntletOverride: (policyId, cardId, want) =>
        setOverrides((all) => {
          const forPolicy = { ...(all[policyId] ?? {}) }
          if (want === null) delete forPolicy[cardId]
          else forPolicy[cardId] = want
          return { ...all, [policyId]: forPolicy }
        }),

      breakInAccepted,
      changeLog,
      /* Null removes the entry rather than storing the card's own
         expectation, as the overrides above do: "not accepted" is one state. */
      acceptBreakIn: (policyId, cardId, a) =>
        setBreakInAccepted((all) => {
          const forPolicy = { ...(all[policyId] ?? {}) }
          if (a === null) delete forPolicy[cardId]
          else forPolicy[cardId] = a
          return { ...all, [policyId]: forPolicy }
        }),

      savedSignIns,
      addSavedSignIn: (x) => {
        const id = freeId(savedSignInsRef.current, x, 'ssi', x.name)
        setSavedSignIns((all) => [...all, { ...x, id }])
        return id
      },
      updateSavedSignIn: (id, patch) =>
        setSavedSignIns((all) => all.map((x) => (x.id === id ? { ...x, ...patch, id } : x))),
      removeSavedSignIn: (id) => setSavedSignIns((all) => all.filter((x) => x.id !== id)),

      /* Stamped only when something changed. Saving an untouched policy used to
         record an edit nobody made. A policy saved with no applications is
         stored as a draft: unfinished means draft. So is a post sign-in
         policy saved on with a rule or "Nothing else matched" left without
         an action, though never for having no application (`settled`). */
      savePolicy: (p) => {
        const before = policiesRef.current.find((x) => x.id === p.id)
        const after = keptOrNew(settled(asStored(keepsCopyMark(p, before))), before)
        if (before && changedBeyondStamp(before, after)) {
          setChangeLog((l) => logChange(l, before, after, ADMIN_ACCOUNT.name, new Date(), groups, directory.people, appsRef.current))
          touch([p.id], 'edited')
        }
        setPolicies((all) =>
          all.map((x) => {
            if (x.id !== p.id) return x
            const next = keptOrNew(settled(asStored(keepsCopyMark(p, x))), x)
            return changedBeyondStamp(x, next) ? { ...next, lastModified: 'Just now', modifiedBy: 'You' } : x
          }),
        )
      },

      setPolicyStatus: (id, status) => {
        const before = policiesRef.current.find((x) => x.id === id)
        if (before && before.status !== status && !before.isSystem && !refusesStatus(before, status)) {
          const after = settled(asStored({ ...before, status, lastModified: 'Just now', modifiedBy: 'You' }))
          setChangeLog((l) => logChange(l, before, after, ADMIN_ACCOUNT.name, new Date(), undefined, undefined, appsRef.current))
          touch([id], 'edited')
        }
        setPolicies((all) =>
          all.map((x) => {
            if (x.id !== id || x.status === status || x.isSystem) return x
            if (refusesStatus(x, status)) return x
            return settled(asStored({ ...x, status, lastModified: 'Just now', modifiedBy: 'You' }))
          }),
        )
      },

      saveDraft: (policyId, d) => {
        touch([policyId], 'edited')
        setPolicies((all) => all.map((x) => (x.id === policyId ? keptOrNew(withSavedDraft(x, d), x) : x)))
      },

      discardDraft: (policyId) =>
        setPolicies((all) => all.map((x) => (x.id === policyId ? { ...x, pendingDraft: undefined } : x))),

      addPolicy: (p) => {
        const id = freeId(policiesRef.current, p, 'p', p.name)
        setPolicies((all) => [settled({ ...p, id, addedOn: p.addedOn ?? addedToday() }), ...all])
        touch([id], 'added')
        return id
      },

      /* Appended, not inserted. Under first-match-wins any other position is a
         guess about intent the copier has not expressed — dropping a rule into
         the middle of somebody else's ordered list silently changes what every
         rule below it decides. The end is the only position that changes
         nothing that already worked, and the dialog says so, and says whether
         the rule can still fire from there.

         Into what the builders open, not into the live rules. Writing the live
         rules of a published policy enforced the copy at once, with no review,
         and a saved draft on that policy then published over it and dropped it. */
      copyRuleInto: (targetPolicyId, r) => {
        const target = policiesRef.current.find((p) => p.id === targetPolicyId)
        if (!target) return null
        const base = lastSaved(target)
        /* Fresh ids all the way down, not just on the rule.

           A shallow spread shares every Condition and ConditionCard object
           with the original, and both the linter and the composer address
           those by id — so editing the copy would edit the rule it was copied
           from. */
        const next = withSavedDraft(target, { ...base, rules: [...base.rules, reidRule(r)] })
        setPolicies((all) => all.map((p) => (p.id === targetPolicyId ? next : p)))
        return { at: base.rules.length + 1, intoDraft: target.status !== 'draft' }
      },
      addZone: (z) => {
        const id = freeId(zonesRef.current, z, 'z', z.name)
        setZones((all) => [...all, { ...z, id }])
        return id
      },
      updateZone: (z) => setZones((all) => all.map((x) => (x.id === z.id ? z : x))),
      /* A deleted zone is not unlinked from the rules that name it. ConfirmDelete
         moves any live policy that uses it to draft (a system policy blocks the
         delete), and the checks flag any rule left naming it. */
      removeZone: (id) => setZones((all) => all.filter((z) => z.id !== id)),

      deletePolicy: (id) => setPolicies((all) => all.filter((p) => p.id !== id)),

      /* A draft, not a switched-off policy: nothing about a copy has been
         reviewed. It copies what the builder would open (a saved draft if there
         is one), and every rule gets new ids so editing one policy never edits
         the other. The name is one no other policy has, within the 50-character
         limit the details page enforces. */
      duplicatePolicy: (id, opts) => {
        const all = policiesRef.current
        const src = all.find((p) => p.id === id)
        if (!src || src.isSystem) return null
        const from = openForEditing(src)
        const name = uniqueName(src.name, all.map((p) => p.name), 50)
        const copy: Policy = {
          ...from,
          /* An application page copies a shared policy onto itself alone, so
             editing the copy changes that application and nothing else. */
          ...(opts?.appIds ? { appIds: [...opts.appIds] } : null),
          id: newId('p', all.map((p) => p.id), name),
          name,
          copiedFrom: src.name,
          status: 'draft',
          rules: from.rules.map(reidRule),
          fallback: from.fallback && reidRule(from.fallback),
          pendingDraft: undefined,
          isSystem: false,
          lastModified: 'Just now',
          modifiedBy: 'You',
          addedOn: addedToday(),
        }
        setPolicies([copy, ...all])
        touch([copy.id], 'added')
        return copy.id
      },

      showToast,
      dismissToast,
      holdToast,
    }),
    /* `pendingNav` belongs here and its absence was a silent dead end: `go`
       held the navigation via the guard ref, but the memoised store kept
       handing out `pendingNav: null`, so the dialog that is supposed to offer
       the choice never rendered. Pressing Trail with unsaved work did nothing
       at all — no move, no prompt, no explanation.

       The three callbacks are `useCallback`-stable, so listing them costs
       nothing and stops the next reader wondering whether they were left out
       on purpose. */
    [
      policies, scenarios, zones, fingerprints, riskProfiles, activeRiskProfileId, scale, hooks, apps, groups, directory, edition,
      persona, setPersona, role, setRole, methodSets, methods, hardwareTokens, commitTokens, screen, visit, go,
      registerLeaveGuard, releaseLeaveGuard, requestLeave, pendingLeave, leaveSave, leaveDiscard, leaveStay, showToast, dismissToast, holdToast,
      gauntletOverrides, breakInAccepted, changeLog, legacy, movedLegacy, activity, touch, builderStart, setBuilderStart, deadlineView, intro, moveDialog, reviewOpen, setupDone, moveTour, moveApps, moveJob, moved, imported, migrationStarted, held, landing, activating, migrationDone, moveMinimized, staged, recovery, mfaBehaviour, defaultMethodId, methodConfig, setupChoice, enrolment, savedSignIns,
      visibleFingerprints,
      setPolicies, setZones, setScenarios, setFingerprints, setRiskProfiles, setHooks, setSavedSignIns, setDirectory, setApps,
      policiesRef, zonesRef, scenariosRef, fingerprintsRef, riskProfilesRef, hooksRef, savedSignInsRef, appsRef,
    ],
  )
  startMoveRef.current = value.startMove

  /* The move's clock: one policy per tick, on a timer rather than animation frames, so it carries on while the pane is
     hidden or the admin is on another page. The last tick says so with a toast that opens Review. */
  useEffect(() => {
    if (moveJob?.status !== 'running') return
    const t = window.setInterval(() => {
      const run = moveRef.current
      if (!run) return
      const pp = run.plan.policies[run.at]
      if (!pp) return
      /* One application, one policy: rows for an application that already has one join it as rules after its own —
         straight into a policy still in draft or monitoring, into the saved draft of one that decides sign-ins. */
      /* Nothing a move makes reaches the policy list before it is reviewed (owner, 4 Nov 2026): a new policy waits in
         `staged`; rows joining a policy an application already has wait as `pending` rules on its record, and the
         policy itself is untouched until Approve. */
      const target = pp.into ? policiesRef.current.find((p) => p.id === pp.into?.id) : undefined
      let id: string
      if (target) {
        id = target.id
      } else {
        id = freeId([...policiesRef.current, ...stagedRef.current], pp.policy, 'p', pp.policy.name)
        const made = settled({ ...pp.policy, id, addedOn: addedToday() })
        stagedRef.current = [made, ...stagedRef.current]
        setStaged((all) => [made, ...all])
        /* The applications the old console protected are the tenant's: they join its list as their policy is made,
           so Review's canvas can name them. */
        const joining = legacyAppsRef.current.filter((a) => made.appIds.includes(a.id) && !appsRef.current.some((x) => x.id === a.id))
        if (joining.length) {
          setApps((all) => [...all, ...joining.filter((a) => !all.some((x) => x.id === a.id))])
        }
      }
      setMovedLegacy((m) => ({ ...m, ...Object.fromEntries(pp.sourceIds.map((s) => [s, id])) }))
      setMoved((m) => {
        const was = m[id]
        return {
          ...m,
          [id]: {
            sourceIds: [...(was?.sourceIds ?? []), ...pp.sourceIds],
            moves: [...(was?.moves ?? []), ...pp.moves],
            changes: [...(was?.changes ?? []), ...pp.changes],
            leftOut: [...(was?.leftOut ?? []), ...pp.leftOut],
            ruleSource: { ...(was?.ruleSource ?? {}), ...pp.ruleSource },
            approved: false,
            ...(target ? { joined: true as const, pending: [...(was?.pending ?? []), ...pp.policy.rules] } : null),
          },
        }
      })
      run.at += 1
      if (!run.ids.includes(id)) run.ids.push(id)
      const finished = run.at >= run.plan.policies.length
      setMoveJob((j) => (j ? { ...j, done: run.at, ids: [...run.ids], status: finished ? 'done' : 'running' } : j))
      if (finished) {
        moveRef.current = null
        const n = run.ids.length
        /* No review step (owner, 6 Nov 2026): every moved policy goes straight into Policies as a draft (AutoAdd, finale.tsx). */
        showToast(n === 1 ? '1 policy added to Policies as a draft' : `${n} policies added to Policies as drafts`, { label: 'View', run: () => go({ name: 'policies' }) })
      }
    }, MOVE_TICK_MS)
    return () => window.clearInterval(t)
  }, [moveJob?.status, policiesRef, appsRef, setApps, showToast, go])

  return (
    <Ctx.Provider value={value}>
      <ToastCtx.Provider value={toast}>{children}</ToastCtx.Provider>
    </Ctx.Provider>
  )
}

/** The current toast, or null. Separate from useBrand so a toast re-renders
    the toast and nothing else. A new `id` is a new toast, even with the same text. */
export function useToast(): ToastMessage | null {
  return useContext(ToastCtx)
}

export function useBrand(): BrandStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useBrand must be used inside BrandProvider')
  return s
}

/* Resolve an id stored in a condition to the live name of the thing it points
   at. Zones, device profiles, hooks, groups and people can all be renamed after
   a rule names them, so every surface that prints a rule needs this and every
   surface must use the same one — otherwise two screens disagree about what a
   rule says, which is the failure the single prose renderer exists to prevent. */
export function useNameLookup(): NameLookup {
  const s = useBrand()
  return useCallback<NameLookup>(
    (kind, id) =>
      kind === 'zone'
        ? s.zoneById(id)?.name
        : kind === 'hook'
          ? s.hookById(id)?.name
          : kind === 'group'
            ? s.groups.find((g) => g.id === id)?.name
            : kind === 'user'
              ? s.userById(id)?.name
              : s.fingerprintById(id)?.name,
    [s],
  )
}
