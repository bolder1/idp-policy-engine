import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

import {
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
import { asStored, changedBeyondStamp, lastSaved, openForEditing, withSavedDraft } from './policy-draft'
import { EMPTY_RISK_PROFILE, riskScale, type RiskProfile } from './risk-signals'
import { normaliseHook, type Hook } from './hooks'
import { settled, showcaseTenant, tenantAt, type Tenant } from './fixtures'
import { SHOWCASE } from './showcase'
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
import type { AuthMethod } from './methods'
import { TAB_SCREEN, personaById, type PersonaId } from './personas'
import { featuresOf, type Edition, type Features } from './edition'
import type { NameLookup } from './screens/predicate-prose'
import { toastDuration, toastTone, type ToastTone } from './toast-tone'

/* Who is looking. Not a permission check — the prototype has no auth — but the
   same split the real product makes: an admin decides what may exist, a person
   decides which of those they use. */
export type Role = 'admin' | 'user'

export type BrandScreen =
  | { name: 'policies' }
  /* `open` lets a caller hand off INTO a surface rather than merely near it.
     The policy list can say "this one has four holes" and land you in the
     gauntlet for that policy, instead of in a builder where you still have to
     find the button. */
  | { name: 'builder'; policyId: string; open?: 'gauntlet' | 'impact' }
  /* Builder v2 — the board, and the one a policy opens in. The same policy,
     store and evaluator under a different shape: a chain of cards on a stage,
     an inspector beside it. See docs/builder-board.md.

     `open` is back, and it is not the field the trail has. On the trail it
     named an INSPECTOR TAB; here it names a SHEET — the check and impact
     panels that slide up over the stage. Same word, same two values, same
     purpose: a caller that knows why you are coming can land you on the
     answer rather than near it. The policy list says "this one has four
     holes"; it should not then make you go and find the gauntlet. */
  | { name: 'board'; policyId: string; open?: 'gauntlet' | 'impact' }
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
  /* End-user only: the app launcher the person lands on. The real product's
     end-user site has exactly two places — this and Setup 2FA — which is why
     it has a top bar and no rail to put one in. */
  | { name: 'apps' }

/** The two halves of the Display tokens page. */
export type DisplayTokenTab = 'assignments' | 'tokens'

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
  groupById: (id: string) => Group
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

  savePolicy: (p: Policy) => void
  /* Save as draft. On a policy still in draft the edits land in the policy
     itself; on a published one they are kept in `pendingDraft` and the live
     rules go on deciding sign-ins. Publishing clears it — callers pass
     `pendingDraft: undefined` to `savePolicy`. */
  saveDraft: (policyId: string, d: { rules: Rule[]; fallback?: Rule }) => void
  /** Switches a published policy on or off. Leaves its rules and any saved draft alone. Ignored for the system policy, and for any status but draft on a policy with no applications. */
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
  /** Copies a policy as a draft with fresh rule ids, named "X (copy)", "X (copy 2)"… within 50 characters. Returns the copy's id; `policyById` finds it at once. */
  duplicatePolicy: (id: string) => string | null
  /** Templates the board offers: the ones Xecurify ships and the ones this tenant saved. Reset per persona. */
  scenarios: Scenario[]
  /** Adds at the top. Returns the stored id. */
  addScenario: (s: Scenario) => string

  /** A message, and optionally one action beside it (Undo). The tone is read
      off the message unless it is given. */
  showToast: (m: string, action?: ToastAction, opts?: { tone?: ToastTone }) => void
  /** Close the toast now — its × button. */
  dismissToast: () => void
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

const MISSING_TINT = '#94a3b8'

export function BrandProvider({ children }: { children: ReactNode }) {
  /* The tenant the console opens on. The showcase build loads the presentation
     tenant (showcase-seed.ts); every other build loads the Security IT
     Manager's, which is the default persona below. Chosen once, lazily, and
     read by every initialiser that follows. */
  const [seed] = useState<Tenant>(() => (SHOWCASE ? showcaseTenant() : tenantAt('medium')))
  const [policies, setPolicies, policiesRef] = useCollection<Policy>(() => seed.policies)
  /* Zones are edited in place now that they carry two sections, so they need
     the same draft/commit treatment policies already had. */
  const [zones, setZones, zonesRef] = useCollection<Zone>(() => seed.zones)
  const [scenarios, setScenarios, scenariosRef] = useCollection<Scenario>(() => seed.scenarios)
  const [screen, setScreenState] = useState<BrandScreen>({ name: 'policies' })
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

  const [visit, setVisit] = useState(0)
  const go = useCallback(
    (s: BrandScreen) =>
      requestLeave(() => {
        /* The rail item for the screen already open reopens it at its list.
           Only for screens with no policy: a builder asked to open a sheet on
           its own policy must keep its draft. Nor for a tab named on the same
           screen — that is the page's own tab bar, and remounting under it
           would throw away the search and drop focus off the tab. */
        const again = screenRef.current.name === s.name && !('policyId' in s) && !('tab' in s)
        setScreen(s)
        if (leaving.current || again) setVisit((v) => v + 1)
      }),
    [requestLeave, setScreen],
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
  const [methodSets, setMethodSets] = useState<MethodSet[]>(() => seed.methodSets)
  /* Fingerprint profiles live here rather than on the screen: policy rules
     name them, so the linter and the simulator have to be able to resolve
     one without the Device Fingerprint page being mounted. */
  const [fingerprints, setFingerprints, fingerprintsRef] = useCollection<FingerprintProfile>(() => seed.fingerprints)
  const [riskProfiles, setRiskProfiles, riskProfilesRef] = useCollection<RiskProfile>(() => seed.riskProfiles)
  const [activeRiskProfileId, setActiveRiskProfileId] = useState(seed.activeRiskProfileId)
  const [hooks, setHooks, hooksRef] = useCollection<Hook>(() => seed.hooks)
  const [hardwareTokens, setHardwareTokens] = useState<HardwareToken[]>(() => seed.tokens)
  /* The seeded catalogue ships Display Token unconfigured; the seeded drawer
     has fobs issued. `withTokenState` reconciles the two from the first
     render, so the method row never disagrees with the inventory. */
  const [methods, setMethods] = useState<AuthMethod[]>(() => withTokenState(seed.methods, seed.tokens))
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
  const [apps, setApps] = useState<App[]>(() => seed.apps)
  const [groups, setGroups] = useState<Group[]>(() => seed.groups)
  const [directory, setDirectory] = useState(() => seed.directory)
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
          setOverrides({})
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
    [requestLeave, setPolicies, setZones, setScenarios, setFingerprints, setRiskProfiles, setHooks, setScreen],
  )

  /* With an action the toast stays six seconds rather than about three: long
     enough to read "Condition removed", decide, and reach Undo. */
  const showToast = useCallback((m: string, action?: ToastAction, opts?: { tone?: ToastTone }) => {
    toastSeq.current += 1
    const id = toastSeq.current
    const duration = toastDuration(!!action)
    setToast({ id, text: m, action, tone: opts?.tone ?? toastTone(m), duration })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), duration)
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  const value = useMemo<BrandStore>(
    () => ({
      apps,
      groups,
      users: directory.people,
      unlistedUsers: directory.unlisted,
      zones,
      fingerprints,
      hooks,
      edition,
      features: featuresOf(edition),
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
      policies,

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
      groupById: (id) => groups.find((g) => g.id === id) ?? groups[0] ?? { id, name: id, memberCount: 0 },
      userById: (id) => directory.people.find((u) => u.id === id),
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
      /* The scale comes from the profile in use, and falls back to the shipped
         weighting rather than to `undefined` if the id ever points at nothing —
         a tenant with a broken pointer should grade as they did on day one, not
         crash the evaluator. */
      riskScale: riskScale(riskProfiles.find((p) => p.id === activeRiskProfileId) ?? EMPTY_RISK_PROFILE),
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

      /* Stamped only when something changed. Saving an untouched policy used to
         record an edit nobody made. A policy saved with no applications is
         stored as a draft: unfinished means draft. */
      savePolicy: (p) =>
        setPolicies((all) =>
          all.map((x) => {
            if (x.id !== p.id) return x
            const next = settled(asStored(p))
            return changedBeyondStamp(x, next) ? { ...next, lastModified: 'Just now', modifiedBy: 'You' } : x
          }),
        ),

      setPolicyStatus: (id, status) =>
        setPolicies((all) =>
          all.map((x) => {
            if (x.id !== id || x.status === status || x.isSystem) return x
            if (x.appIds.length === 0 && status !== 'draft') return x
            return settled(asStored({ ...x, status, lastModified: 'Just now', modifiedBy: 'You' }))
          }),
        ),

      saveDraft: (policyId, d) =>
        setPolicies((all) => all.map((x) => (x.id === policyId ? withSavedDraft(x, d) : x))),

      discardDraft: (policyId) =>
        setPolicies((all) => all.map((x) => (x.id === policyId ? { ...x, pendingDraft: undefined } : x))),

      addPolicy: (p) => {
        const id = freeId(policiesRef.current, p, 'p', p.name)
        setPolicies((all) => [settled({ ...p, id }), ...all])
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
      duplicatePolicy: (id) => {
        const all = policiesRef.current
        const src = all.find((p) => p.id === id)
        if (!src || src.isSystem) return null
        const from = openForEditing(src)
        const name = uniqueName(src.name, all.map((p) => p.name), 50)
        const copy: Policy = {
          ...from,
          id: newId('p', all.map((p) => p.id), name),
          name,
          status: 'draft',
          rules: from.rules.map(reidRule),
          fallback: from.fallback && reidRule(from.fallback),
          pendingDraft: undefined,
          isSystem: false,
          lastModified: 'Just now',
          modifiedBy: 'You',
        }
        setPolicies([copy, ...all])
        return copy.id
      },

      showToast,
      dismissToast,
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
      policies, scenarios, zones, fingerprints, riskProfiles, activeRiskProfileId, hooks, apps, groups, directory, edition,
      persona, setPersona, role, setRole, methodSets, methods, hardwareTokens, commitTokens, screen, visit, go,
      registerLeaveGuard, releaseLeaveGuard, requestLeave, pendingLeave, leaveSave, leaveDiscard, leaveStay, showToast, dismissToast,
      gauntletOverrides, recovery, mfaBehaviour, defaultMethodId, methodConfig, setupChoice, enrolment,
      setPolicies, setZones, setScenarios, setFingerprints, setRiskProfiles, setHooks,
      policiesRef, zonesRef, scenariosRef, fingerprintsRef, riskProfilesRef, hooksRef,
    ],
  )

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
