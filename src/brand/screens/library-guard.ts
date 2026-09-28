import { enforces, rangeText, type App, type Policy, type Zone, type ZoneLocation, type ZoneRange } from '../data'
import { CANT_TELL, DECISION_WORDS } from '../decision-words'
import type { FingerprintProfile } from '../fingerprint'
import type { CheckFinding, ReviewLine } from '../review-rows'
import { riskReviewRows, riskScale, type RiskProfile } from '../risk-signals'
import type { SavedSignIn } from '../saved-sign-ins'
import {
  SWEEP_AT,
  blockLine,
  checkName,
  checkOf,
  checkSaid,
  checkValue,
  readSignIn,
  sortChecks,
  sweptApps,
  type Reading,
  type SignInCheck,
  type Verdict,
} from './guard'
import { sweepTenant, type TenantSweep } from './impact-arena'
import { envWith } from './sim-env'
import type { SimEnv } from './simulate'
import { policiesUsing, policiesUsingType } from './usage'
import { WHAT_CHANGES, whatChangesLine, whatChangesSaid, type WhatChangesLine } from './what-changes'
import { zoneChanges } from './zone-entries'

/* -----------------------------------------------------------------------------
   The checks before a zone, a device profile or the risk profile in use is
   saved — or another risk profile is put in use (final spec D.6, D3).

   Saving one of these changes no policy and yet changes what policies decide:
   every rule that names the zone matches other sign-ins the moment it is
   saved. So the Review changes dialog the page already opens gains rows under
   Also changes, and they answer the guard's questions for this kind of edit
   (spec D §3.5):

     Active policies                        the enforcing policies that read it
     What changes                           what moves on their applications
     one row per saved sign-in that moved   what it gets now

   An edit that moves nothing the checks can see — a rename, a Use that
   changes no score — adds no rows at all, so a clean review stays clean.

   A Must pass or Protected sign-in that passed and now fails stops the save,
   exactly as it stops a policy's — and the ready fix is the smallest edit to
   the object that lets it pass again: keep the network the draft took away,
   leave out the one it added, or put the saved object back. A note that moves
   is listed and never stops anything; a reading that can't be told is grey
   and never stops anything either.

   The deciding policy for a sign-in is chosen by application and audience,
   never by a zone or a profile, so an edit here moves decisions only inside
   the policies that read the object. What changes counts only the modelled
   sign-ins those policies decide, each once, however many of them share an
   application.

   The modelled sign-ins are a sample, and an edit can sit outside it: the one
   modelled Android device fails the compliance profile on other checks, so a
   lowered Android floor moves none of them. When the sample moves nothing and
   a saved sign-in moves all the same, What changes says Can't tell in grey,
   not four zeros the dialog contradicts a line further down.

   React-free: every number and label the dialog prints is pinned here.
   -------------------------------------------------------------------------- */

/** The tenant the checks read, as it is stored. */
export interface LibraryTenant {
  policies: readonly Policy[]
  /** The env as the tenant stands: its zones, device profiles and risk scale. */
  env: SimEnv
  apps: readonly App[]
  savedSignIns: readonly SavedSignIn[]
  adminId: string
}

/** One enforcing policy that reads the object. */
export interface ActivePolicy {
  policyId: string
  name: string
}

/** A ready fix: its label, and the page's draft with it made. */
export interface LibraryFix<T> {
  /** "Keep 203.0.113.0/24", "Restore the saved zone". */
  label: string
  value: T
}

export interface LibraryGuard<T> {
  /** The enforcing policies whose rules read the object, or that decide a saved sign-in that moved, in the tenant's order. */
  policies: ActivePolicy[]
  /** What moves on those policies' applications, where they decide. Null when the checks ran without the sweeps, or no enforcing policy reads the object. */
  whatChanges: WhatChangesLine | null
  /** Saved sign-ins whose reading moved: the ones that stop the save, then fails, can't tell and passes — so a trimmed list never shows a note in a blocker's place. */
  checks: SignInCheck[]
  /** Must pass and Protected sign-ins that passed and now fail. */
  blocking: SignInCheck[]
  /** The first candidate that clears every blocker without making another, when something blocks. */
  fix: LibraryFix<T> | null
}

/** Whether to sweep the modelled sign-ins as well, or only read the saved ones (a leave dialog asks only whether the save is stopped). */
export interface LibraryOptions {
  sweep?: boolean
}

/* One kind of object, described for the run: who reads it, the env with a
   version of it in place, and the fixes worth trying, in order. */
interface Edit<T> {
  uses: readonly Policy[]
  envFor: (value: T) => SimEnv
  draft: T
  candidates: () => LibraryFix<T>[]
}

/* A sweep with every situation the listed policies do not decide passed over. */
const decidedBy = (s: TenantSweep, ids: ReadonlySet<string>): TenantSweep => ({
  ...s,
  decisions: s.decisions.map((d, i) => (ids.has(s.deciders[i] ?? '') ? d : null)),
})

function run<T>(t: LibraryTenant, edit: Edit<T>, opts: LibraryOptions): LibraryGuard<T> {
  const { policies, env, savedSignIns, adminId } = t
  const envAfter = edit.envFor(edit.draft)

  /* Saved sign-ins, read before and after. Only the ones that moved are
     listed: an edit to a zone says nothing about a sign-in it did not touch. */
  const before = new Map<string, Reading>()
  const moved: SignInCheck[] = []
  for (const s of savedSignIns) {
    const b = readSignIn(s, policies, env)
    before.set(s.id, b)
    const c = checkOf(s, b, readSignIn(s, policies, envAfter), 'save', adminId)
    if (c.changed) moved.push(c)
  }
  const sorted = sortChecks(moved)
  const blocking = sorted.filter((c) => c.blocks)
  /* Blockers lead. They are all fails, which sort first anyway, so this only
     puts them ahead of the notes that fail beside them. */
  const checks = [...blocking, ...sorted.filter((c) => !c.blocks)]

  /* The policies to list: every enforcing one whose live rules read the
     object, and — belt and braces — any enforcing one that decides a sign-in
     that moved. In the tenant's own order. */
  const ids = new Set(edit.uses.filter(enforces).map((p) => p.id))
  for (const c of checks) {
    for (const r of [c.before, c.after]) {
      const p = r.decidedBy ? policies.find((x) => x.id === r.decidedBy!.policyId) : undefined
      if (p && enforces(p)) ids.add(p.id)
    }
  }
  const affected = policies.filter((p) => ids.has(p.id))

  /* One line over every application those policies decide on, each swept
     once, counting only the situations they decide. */
  let whatChanges: WhatChangesLine | null = null
  if (opts.sweep !== false && affected.length > 0) {
    const apps = [...new Set(affected.flatMap((p) => sweptApps({ before: p, after: p, apps: t.apps }, policies)))]
    whatChanges = whatChangesLine(
      apps.map((a) => decidedBy(sweepTenant(policies, a, env, SWEEP_AT), ids)),
      apps.map((a) => decidedBy(sweepTenant(policies, a, envAfter, SWEEP_AT), ids)),
      /* Places named by the zones as they stand, before the edit. */
      env,
    )
  }

  /* The first fix under which no saved sign-in blocks: every blocker passes
     again, and nothing that passed is broken on the way. Saved sign-ins only,
     so trying each candidate stays cheap. */
  let fix: LibraryFix<T> | null = null
  if (blocking.length > 0) {
    fix =
      edit.candidates().find((cand) => {
        const e = edit.envFor(cand.value)
        return savedSignIns.every((s) => !checkOf(s, before.get(s.id)!, readSignIn(s, policies, e), 'save', adminId).blocks)
      }) ?? null
  }

  return { policies: affected.map((p) => ({ policyId: p.id, name: p.name })), whatChanges, checks, blocking, fix }
}

/** The line a stopped save is said with — "Kavya Menon in the office must pass and would get Deny." — or null when nothing stops it. */
export const stopLine = (g: Pick<LibraryGuard<unknown>, 'blocking'>): string | null => (g.blocking[0] ? blockLine(g.blocking[0]) : null)

/** The word the review's Save carries while a check stops it. */
export const LIBRARY_STOP = "Can't save"
/** The same on Use, where nothing is being saved. */
export const USE_STOP = "Can't use this profile"

/* --- The rows, as Review changes files them ------------------------------------------ */

/** A row under Also changes. A saved sign-in's row names it, so the dialog can say why it stops the save beside it. */
export interface LibraryLine extends ReviewLine {
  signInId?: string
  /** The value can't be told: drawn grey, never read as nothing moving. */
  unknown?: boolean
}

const FINDING: Record<Verdict, CheckFinding> = { fail: 'fail', 'cant-tell': 'neutral', pass: 'pass' }

const readingWord = (r: Reading): string => (r.decision ? DECISION_WORDS[r.decision] : CANT_TELL)

/* Whether any modelled sign-in moves. */
const movesAny = (line: WhatChangesLine | null): boolean => !!line && WHAT_CHANGES.some((m) => line.counts[m.key] > 0)

/* The consequences, in the order they are read (spec D §3.5): the policies
   that read the object, what moves where they decide, then each saved sign-in
   that moved under Fails, Can't tell or Passes. A sign-in's value does not
   name its deciding policy again — Active policies does, a line above:

     Active policies                        HRMS access from corporate offices, Developer tools — office and device checks
     What changes                           Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 24 · Now denied 18
     Kavya Menon in the office · Must pass  Deny · expected Allow with 2FA

   Nothing at all when nothing moves, modelled or saved. */
export function libraryLines(g: Pick<LibraryGuard<unknown>, 'policies' | 'whatChanges' | 'checks'>): LibraryLine[] {
  const moves = movesAny(g.whatChanges)
  if (!moves && g.checks.length === 0) return []
  const lines: LibraryLine[] = []
  if (g.policies.length > 0) {
    lines.push({ label: 'Active policies', before: '', after: g.policies.map((p) => p.name).join(', '), effect: true })
  }
  if (g.whatChanges) {
    /* The sample moved nothing and a saved sign-in did: the sample can't see
       this edit, and its zeros would read as a pass they are not. */
    lines.push(
      moves
        ? { label: 'What changes', before: '', after: whatChangesSaid(g.whatChanges), effect: true }
        : { label: 'What changes', before: '', after: CANT_TELL, effect: true, unknown: true },
    )
  }
  for (const c of g.checks) {
    lines.push({
      label: checkName(c),
      before: readingWord(c.before),
      after: checkSaid({ ...checkValue(c, '', 'save'), other: null }),
      effect: true,
      check: FINDING[c.after.verdict],
      signInId: c.signIn.id,
    })
  }
  return lines
}

/* --- Whether a save is checked, and a fix made ------------------------------------- */

/** What the page holds, for whether its save is checked at all. */
export type LibrarySubject = { kind: 'zone' | 'device-profile'; isNew: boolean } | { kind: 'risk-profile'; inUse: boolean }

/** Whether saving it runs the checks (spec D.6): a zone or device profile once saved — a new one is named by no rule yet — and a risk profile only while it is in use, since no Risk score condition reads any other (acceptance A10). */
export const libraryChecked = (s: LibrarySubject): boolean => (s.kind === 'risk-profile' ? s.inUse : !s.isNew)

/** The page, as a fix reads it when pressed and again when undone. */
export interface FixPage<T> {
  draft: T
  /** Puts a value into the page's draft. */
  onFix?: (value: T) => void
  /** Whether a value is the object as saved, so nothing is left to save. */
  restored?: (value: T) => boolean
}

/** The console's toast, as a fix uses it. */
export type FixToast = (message: string, action?: { label: string; run: () => void }) => void

/* Pressing a ready fix: it goes into the page's draft, and the toast says so
   with an Undo that puts back the draft it replaced. A fix that restores the
   saved object leaves nothing to save and closes the review — and keeps its
   Undo all the same: a library page has no undo stack, so the toast is the
   only way back to the edits the fix threw away (spec D §3.7: every fix toast
   carries Undo). An Undo after other changes says so and leaves them alone. */
export function fixWithUndo<T>(page: () => FixPage<T>, toast: FixToast, value: T, label: string): void {
  const { draft: back, onFix, restored } = page()
  onFix?.(value)
  toast(restored?.(value) ? 'Nothing left to save' : `${label}. Not saved yet.`, {
    label: 'Undo',
    run: () => {
      const now = page()
      if (now.draft !== value) {
        toast('Other changes came after it.')
        return
      }
      now.onFix?.(back)
      toast('Restored')
    },
  })
}

/* --- Zones ------------------------------------------------------------------------- */

/* One entry of a zone, in each list it can sit in: the words a fix names it
   by, and how two of them are told apart. A range is its centre and distance,
   as the zone page's own diff keys it. */
type ZoneList = 'ip' | 'asn' | 'countries' | 'states' | 'cities' | 'ranges'
const ZONE_LISTS: readonly ZoneList[] = ['ip', 'asn', 'countries', 'states', 'cities', 'ranges']

type Entry = string | ZoneRange
const keyOf = (e: Entry): string => (typeof e === 'string' ? e : `${e.lat},${e.lon}:${e.km}`)
/* "within 25 km of Pune" inside a label; the rest as stored. */
const wordOf = (e: Entry): string => {
  if (typeof e === 'string') return e
  const t = rangeText(e)
  return t.charAt(0).toLowerCase() + t.slice(1)
}

function listOf(z: Zone, l: ZoneList): Entry[] {
  if (l === 'ip' || l === 'asn') return z[l]
  return z.location[l]
}

function withList(z: Zone, l: ZoneList, list: Entry[]): Zone {
  if (l === 'ip' || l === 'asn') return { ...z, [l]: list as string[] }
  const location: ZoneLocation = { ...z.location, [l]: list }
  return { ...z, location }
}

/* The fixes for a zone, in the order they are tried: keep what the draft took
   away, then leave out what it added, then its type, then the whole zone as
   saved. The first that clears every blocker is the one offered. */
export function zoneCandidates(saved: Zone, draft: Zone): LibraryFix<Zone>[] {
  const keep: LibraryFix<Zone>[] = []
  const drop: LibraryFix<Zone>[] = []
  for (const l of ZONE_LISTS) {
    const was = listOf(saved, l)
    const now = listOf(draft, l)
    const nowKeys = new Set(now.map(keyOf))
    const wasKeys = new Set(was.map(keyOf))
    was.forEach((e, i) => {
      if (nowKeys.has(keyOf(e))) return
      /* Back where it stood in the saved list, as near as the draft allows. */
      const list = [...now]
      list.splice(Math.min(i, list.length), 0, e)
      keep.push({ label: `Keep ${wordOf(e)}`, value: withList(draft, l, list) })
    })
    for (const e of now) {
      if (wasKeys.has(keyOf(e))) continue
      drop.push({ label: `Remove ${wordOf(e)}`, value: withList(draft, l, now.filter((x) => keyOf(x) !== keyOf(e))) })
    }
  }
  const out = [...keep, ...drop]
  if (saved.kind !== draft.kind) out.push({ label: 'Restore the zone type', value: { ...draft, kind: saved.kind } })
  out.push({ label: 'Restore the saved zone', value: saved })
  return out
}

/** The checks for a zone edit: `saved` as stored, `draft` as the page holds it. */
export function zoneGuard(t: LibraryTenant, saved: Zone, draft: Zone, opts: LibraryOptions = {}): LibraryGuard<Zone> {
  const zones = t.env.library?.zones ?? []
  const inPlace = (z: Zone) => (zones.some((x) => x.id === z.id) ? zones.map((x) => (x.id === z.id ? z : x)) : [...zones, z])
  return run(
    t,
    {
      uses: policiesUsing('zone', saved.id, [...t.policies]).filter((u) => !u.draft).map((u) => u.policy),
      envFor: (z) => envWith(t.env, { zones: inPlace(z) }),
      draft,
      candidates: () => zoneCandidates(saved, draft),
    },
    opts,
  )
}

/** Whether a fix leaves the zone as it is saved: the review then has nothing left to save. */
export const zoneRestored = (saved: Zone, value: Zone): boolean => zoneChanges(saved, value).length === 0 && saved.kind === value.kind

/* --- Device profiles ------------------------------------------------------------------ */

/** The checks for a device profile edit. The one fix is the profile as saved. */
export function profileGuard(t: LibraryTenant, saved: FingerprintProfile, draft: FingerprintProfile, opts: LibraryOptions = {}): LibraryGuard<FingerprintProfile> {
  const profiles = t.env.library?.fingerprints ?? []
  const inPlace = (p: FingerprintProfile) =>
    profiles.some((x) => x.id === p.id) ? profiles.map((x) => (x.id === p.id ? p : x)) : [...profiles, p]
  return run(
    t,
    {
      uses: policiesUsing('fingerprint', saved.id, [...t.policies]).filter((u) => !u.draft).map((u) => u.policy),
      envFor: (p) => envWith(t.env, { fingerprints: inPlace(p) }),
      draft,
      candidates: () => [{ label: 'Restore the saved profile', value: saved }],
    },
    opts,
  )
}

/* --- The risk profile in use ----------------------------------------------------------- */

/* Every Risk score condition compares against the scale of the profile in
   use, so the policies are the ones with any such condition. `saved` is the
   profile whose scale the tenant reads today: the one being edited, or — for
   Use — the one in use now, with `draft` the profile about to be.

   Only the modelled sign-ins move here. A saved sign-in states its own device
   risk score, and the evaluator compares that number with the condition's
   threshold without reading the scale (simulate.ts, the facts path), so no
   edit or switch of a risk profile moves a saved sign-in. `checks`, `blocking`
   and `fix` are always empty, and the stop, the fix and Expect instead that
   the risk page and Use wire up never show. They stay wired — they are the
   zone's and the device profile's, and would be right the day a saved sign-in
   states its signals rather than a score — but nothing may count on them
   firing today. */
export function riskGuard(t: LibraryTenant, saved: RiskProfile, draft: RiskProfile, opts: LibraryOptions = {}): LibraryGuard<RiskProfile> {
  return run(
    t,
    {
      uses: policiesUsingType('device-risk', [...t.policies]).filter((u) => !u.draft).map((u) => u.policy),
      envFor: (p) => envWith(t.env, { riskScale: riskScale(p) }),
      draft,
      candidates: () => [{ label: 'Restore the saved profile', value: saved }],
    },
    opts,
  )
}

/* --- Putting another profile in use ------------------------------------------------ */

/** Use's own rows, ahead of the checks': the profile in use, and the bands that move with it. How the two profiles differ signal by signal is not what switching changes. */
export function switchLines(from: RiskProfile, to: RiskProfile): ReviewLine[] {
  return [{ label: 'Profile in use', before: from.name, after: to.name, kind: 'changed' }, ...riskReviewRows(from, to).filter((r) => r.effect)]
}
