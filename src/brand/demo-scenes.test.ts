import { describe, expect, it } from 'vitest'

import { blankPolicy, enforces, type Policy } from './data'
import { checkRowView, checksFor, describedPolicy, runChecks, whatChangesFor, type CheckContext } from './create/describe-checks'
import { compose, dictionaryOf, openChoices, readText, summaryOf, type DescribeTenant } from './create/describe-model'
import { showcaseTenant } from './fixtures'
import type { SavedSignIn } from './saved-sign-ins'
import { ENTRY_DELAY, FIRST_RUN, openRun, runAfterPatch, travelStops } from './screens/board/try-sign-in-run'
import { columnView, columnsFor, routeOf, runColumns, wouldChangeIf, type ColumnResult } from './screens/board/try-sign-in'
import { breakInRows, countsSpoken, fixButton, fixLine, groupRows, offeredFix } from './screens/break-in-model'
import { runBreakIn } from './screens/gauntlet'
import { breakInSummary, checksSummary, decidingValue, guardOpens, readSignIn, runGuard, whatChangesBlocks, withPolicy } from './screens/guard'
import { envOf, resolveSignIn, type TenantResolution } from './screens/tenant-resolver'
import { boundariesOf } from './screens/testing/boundaries'
import { devicePreset } from './screens/testing/device-presets'
import { lineText, type CardEvidence } from './screens/testing/evidence'
import { rowsRead } from './screens/testing/rows-read'
import { screensOf, stepLabel } from './screens/testing/screens-of'
import { pageRoute, ruleOf, tryResult } from './screens/testing/selectors'
import { changedBy, defaultBoardForm, defaultForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from './screens/testing/sign-in-form'
import { whichPolicyRows } from './screens/testing/which-policy'
import { whatChangesSaid } from './screens/what-changes'

/* -----------------------------------------------------------------------------
   The pitch, beat by beat: the ten beats of the team doc's demo script, asked
   of a clean showcase tenant — the one the store opens on, HRMS Inactive and
   nothing touched. The script's own rule is that every result must be
   reproduced on a clean load before it is said aloud; this is that rehearsal,
   run on every change.

   Each beat is pinned on the functions its screen prints from — Policy
   testing's selectors, the board's Try a sign-in, the Break-in test, Before
   turning on, Describe it — so a change that would leave a presenter saying
   something the screen no longer shows fails here first. The words pinned are
   the product's. Where the script paraphrases the screen ("needs 13 or later",
   "Not in audience: Contractors", "2 of 2 devices registered"), the beat pins
   what is printed and says so beside it.

   Where the script puts a beat on a screen that does not show part of it, the
   beat pins that part where it IS shown and says so. Beat 1 is scripted on
   Policy testing, which prints the failing check alone and has no Would change
   if: the ticked checks are pinned as the model's, not as a screen claim, and
   Would change if is shown on the Device compliance board's Try a sign-in
   (press T), which the presenter opens for that half.

   Two beats lean on surfaces that are not built, and those halves are not
   pinned: Test a group instead and factor readiness in beat 7 (Neha has no
   Google Authenticator; Add OTP over Email as a fallback), and Compare in
   beat 8. What the rest of each beat shows is.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
/* Try defaults to today; the script's sign-ins are the seed's Monday. */
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const person = (id: string) => t.directory.people.find((u) => u.id === id)!
const appName = (id: string) => t.apps.find((a) => a.id === id)?.name ?? id

const HRMS = policy('sc-hrms-office')
const DEVICES = policy('sc-corporate-devices')
const COMPLIANCE = policy('sc-device-compliance')

/** The board's sign-in for a policy, as test mode opens it, with a change. */
const board = (p: Policy, patch: Partial<SignInForm> = {}): SignInForm => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })

/** The board's run for a form: every column, the route down the right-most one, and Would change if. */
function onBoard(saved: Policy, form: SignInForm) {
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns(columnsFor(saved, saved, form.appId), t.policies, facts, env)
  const right = cols.at(-1)!
  return {
    facts,
    cols,
    right,
    route: routeOf(right, saved, facts, env, t.policies),
    chips: wouldChangeIf({ form, saved, draft: saved, right, policies: t.policies, env, zones: t.zones, methods: t.methods }),
  }
}

/** A column as its header and line read: "Today · Global Default Policy · Baseline access · 1fa". */
const said = (c: ColumnResult, saved: Policy) => {
  const v = columnView(c, saved.id, t.policies, appName)
  return `${v.label} · ${v.policyName ?? '—'} · ${v.line} · ${v.decision ?? v.status}`
}

/** A card's lines as the chain prints them: label, "actual · required", and the word's status. */
const lines = (e: CardEvidence) => e.lines.map((l) => [l.label, lineText(l), l.status])

/** What they see, for a resolution. */
const pages = (res: TenantResolution, personId: string | null, substitute?: Policy) =>
  screensOf(res, { policies: t.policies, substitute, methods: t.methods, defaultMethodId: undefined, person: personId ? person(personId) : null })

/** A sign-in saved the way the script saves it, on the seed's Monday. */
const saved = (id: string, name: string, facts: SavedSignIn['facts'], expected: SavedSignIn['expected'], level: SavedSignIn['level']): SavedSignIn => ({
  id,
  name,
  facts: { ...facts, when: { date: TODAY, time: '09:30', timeZone: 'Asia/Kolkata', source: 'stated' } },
  expected,
  level,
  savedBy: 'Jaspreet Toor',
  savedAt: '2026-09-28T09:30:00+05:30',
})

describe('the clean tenant the script opens on', () => {
  it('has HRMS built and not yet on, and the other three policies live', () => {
    expect(HRMS.status).toBe('inactive')
    expect(enforces(HRMS)).toBe(false)
    expect([DEVICES, COMPLIANCE, policy('sc-dev-tools')].every(enforces)).toBe(true)
  })
})

// --- 1. Troubleshoot a complaint -------------------------------------------------------------

describe('Beat 1: Devon Rao on Dropbox, on an Android 12 phone', () => {
  const form: SignInForm = { ...defaultForm(t.directory.people, t.apps, TODAY), personId: 'devon', appId: 'dropbox', device: { kind: 'preset', id: 'android-12' } }
  const r = tryResult(t.policies, form, env, t.zones)

  it('is refused by Device compliance, by its last row', () => {
    expect(r.shown.status).toBe('decided')
    expect(r.shown.decidedBy?.policyName).toBe('Device compliance for Outlook and Dropbox')
    expect(r.shown.decision).toBe('deny')
    expect(ruleOf(r.shown, COMPLIANCE)?.name).toBe('Nothing else matched')
  })

  /* The script reads "Android 12 · needs 13 or later"; the chain prints the
     check's label and "actual · required", the floor as the trace states it.
     The script's "other checks ticked" is NOT on this screen: the chain prints
     the profile line and the failing check only (spec A.6, evidence.ts). The
     three passing checks are pinned below as what the model found, so a
     presenter says them from the profile line's "3 of 4 checks pass", not from
     ticks on screen. */
  it('crosses the Android floor, and only that: the profile line and the one failing check', () => {
    const route = pageRoute(r.shown, COMPLIANCE, r.facts, env)
    expect(route.rules.map((x) => [x.rule.name, x.evidence.word])).toEqual([['Compliant device', 'No match']])
    expect(lines(route.rules[0].evidence)).toEqual([
      ['Device profile', 'Compliant devices · 3 of 4 checks pass', 'fail'],
      ['Android OS version', '12 · ≥ 13', 'fail'],
    ])
    // The model's checks, not the screen's lines.
    const checks = r.shown.trace!.steps[0].conditions[0].checks!
    expect(checks.filter((c) => c.status === 'pass').map((c) => c.label)).toEqual(['Device integrity', 'Screen lock', 'miniOrange Authenticator version'])
    expect(checks.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['os-android'])
  })

  it('shows him the message he saw, word for word', () => {
    expect(pages(r.shown, 'devon').map((s) => s.steps)).toEqual([[{ kind: 'deny', message: COMPLIANCE.fallback!.denyMessage }]])
    expect(COMPLIANCE.fallback!.denyMessage).toBe('Your device does not meet the security requirements. Update it, or contact IT.')
  })

  /* Not on Policy testing, where the beat is scripted: Would change if is the
     board's (SignInPanel), so this half is shown on the Device compliance
     board with Try a sign-in open. */
  it('would let him in on one factor on Android 13, and says so under Would change if on the board', () => {
    const b = onBoard(COMPLIANCE, board(COMPLIANCE, { personId: 'devon', appId: 'dropbox', device: { kind: 'preset', id: 'android-12' } }))
    expect(b.cols.map((c) => said(c, COMPLIANCE))).toEqual(['Live · Device compliance for Outlook and Dropbox · Nothing else matched · deny'])
    expect(b.chips.map((c) => [c.text, c.decision])).toEqual([['Android OS version 13', '1fa']])
  })
})

// --- 2. A finding across the tenant ------------------------------------------------------------

/* The script reads "Not in audience: Contractors"; the resolver names the
   audience he is outside of, which is the policy's. */
describe('Beat 2: Devon opens GitHub', () => {
  const form: SignInForm = { ...defaultForm(t.directory.people, t.apps, TODAY), personId: 'devon', appId: 'github', device: { kind: 'preset', id: 'android-12' } }
  const r = tryResult(t.policies, form, env, t.zones)

  it('passes Developer tools, which does not govern a contractor, and the Global Default lets him in on one factor', () => {
    expect(r.shown.decidedBy).toMatchObject({ policyName: 'Global Default Policy', isGlobalDefault: true })
    expect(r.shown.decision).toBe('1fa')
    const rows = whichPolicyRows(r.shown, t.policies, 'github')
    expect(rows.on.map((x) => [x.name, x.reason, x.struck])).toEqual([
      ['Global Default Policy', 'Decides this sign-in', false],
      ['Developer tools — office and device checks', 'Not in audience: Engineering, DevOps', true],
    ])
  })
})

// --- 3. Test a policy that is off ----------------------------------------------------------------

describe('Beat 3: HRMS, Inactive, on the board — Kavya from the office network', () => {
  const form = board(HRMS, originPatch('office'))
  const b = onBoard(HRMS, form)

  it('opens on Kavya Menon, HRMS, the office network, at 09:30 in Kolkata', () => {
    expect(form).toMatchObject({ personId: 'u-hr-1', appId: 'hrms', origin: 'office', address: '203.0.113.24', time: '09:30', timeZone: 'Asia/Kolkata' })
    expect(person(form.personId!).name).toBe('Kavya Menon')
  })

  it('reads Today beside the Stored version: the Global Default on one factor, and rule 1 with 2FA', () => {
    expect(b.cols.map((c) => said(c, HRMS))).toEqual([
      'Today · Global Default Policy · Baseline access · 1fa',
      'Stored version · HRMS access from corporate offices · Rule 1 · In a corporate office · 2fa',
    ])
    expect(b.route.decision).toMatchObject({ status: 'decided', decision: '2fa', line: 'HRMS access from corporate offices · Rule 1 · In a corporate office' })
  })

  it('lands on rule 1 with the Google Authenticator prompt', () => {
    expect(b.route.stages[b.route.landing]).toBe(`rule:${HRMS.rules[0].id}`)
    const [only] = pages(b.right.resolution, 'u-hr-1', b.right.spec.substitute)
    expect(only.steps.map(stepLabel)).toEqual(['Password', 'Google Authenticator'])
  })

  it('plays the route once on opening, inside the motion budget, and never again for a typed edit', () => {
    const run = openRun(FIRST_RUN)
    expect(run.travel).toBe(true)
    const stops = travelStops(b.route.landing, run.delay)
    expect(stops).toHaveLength(b.route.landing)
    expect(stops.at(-1)!.ms).toBeLessThanOrEqual(ENTRY_DELAY + 1100)
    expect(stops.at(-1)!.ms).toBeLessThan(1600)
    expect(runAfterPatch(run, typedAddressPatch('192.0.2.50'))).toBe(run)
  })
})

// --- 4. Find the edge --------------------------------------------------------------------------

describe('Beat 4: 192.0.2.50, then the distance ruler', () => {
  const office = board(HRMS, originPatch('office'))
  const typed = { ...office, ...typedAddressPatch('192.0.2.50') }
  const b = onBoard(HRMS, typed)
  const lib = { zones: t.zones, fingerprints: t.fingerprints }
  const ruler = (f: SignInForm) => boundariesOf(f, rowsRead(t.policies, HRMS, f.appId, lib), { substitute: b.right.spec.substitute }, t.policies, env, t.zones).distance!
  const bands = (f: SignInForm) => ruler(f).bands.map((x) => `${x.from}–${x.to} ${x.decision}`)

  it('is refused by the last row, and names the typed address as what changed it', () => {
    expect(b.cols.map((c) => said(c, HRMS))).toEqual([
      'Today · Global Default Policy · Baseline access · 1fa',
      'Stored version · HRMS access from corporate offices · Nothing else matched · deny',
    ])
    expect(changedBy(office, typed)).toBe('address')
  })

  it('fails the network and passes the place: the location passes', () => {
    expect(lines(b.route.cards[HRMS.rules[0].id])).toEqual([
      ['Who', 'Kavya Menon · Human Resources, Finance', 'pass'],
      ['Network', '192.0.2.50 · in 203.0.113.0/24, 198.51.100.0/24', 'fail'],
      ['Place', 'Pune (looked up) · within 25 km of Pune, or Bengaluru, Mumbai', 'pass'],
    ])
  })

  it('shows the deny message word for word', () => {
    expect(pages(b.right.resolution, 'u-hr-1', b.right.spec.substitute)[0].steps).toEqual([
      { kind: 'deny', message: 'HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.' },
    ])
  })

  /* On 192.0.2.50 the network fails whatever the distance, so the ruler reads
     Deny on both sides: the presenter picks Office network again, and then the
     printed 25 km edge is where the answer turns. */
  it('prints the 25 km boundary, and it flips the result from the office network', () => {
    expect(ruler(office)).toMatchObject({ centre: 'Pune', edge: 25 })
    expect(bands(office)).toEqual(['0–25 2fa', '26–100 deny'])
    const at = (km: number) =>
      resolveSignIn(t.policies, factsOf({ ...office, place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km } }, t.zones).facts, env, { substitute: b.right.spec.substitute })
        .decision
    expect([at(25), at(26)]).toEqual(['2fa', 'deny'])
    expect(bands(typed)).toEqual(['0–25 deny', '26–100 deny'])
  })
})

// --- 5. Trusted devices ------------------------------------------------------------------------

describe('Beat 5: Access the app through corporate devices only', () => {
  const failing = (e: CardEvidence) => lines(e).filter(([, , status]) => status === 'fail')

  /* No preset is a MacBook: Edit details on the Device row states one. */
  const macbook = {
    source: 'stated' as const,
    platform: 'macos' as const,
    osVersion: '14.5',
    formFactor: 'Laptop' as const,
    browser: { family: 'safari' as const, version: '17.5' },
    integrity: null,
    screenLock: null,
    authenticatorVersion: null,
    agentInstalled: false,
    agentVersion: null,
    registeredToPerson: false,
    registeredCount: 0,
  }

  /* The script reads "not a registered corporate device": the checks that
     fail say which parts, and the page he gets says it in the policy's words. */
  it('refuses Vikram Nair on a personal MacBook: no Device Agent, not registered', () => {
    const b = onBoard(DEVICES, board(DEVICES, { personId: 'u-exec-2', device: { kind: 'custom', facts: macbook } }))
    expect(b.cols.map((c) => said(c, DEVICES))).toEqual(['Live · Access the app through corporate devices only · Nothing else matched · deny'])
    expect(failing(b.route.cards[DEVICES.rules[0].id])).toEqual([
      ['Device profile', 'Corporate devices · 1 of 3 checks pass', 'fail'],
      ['Device Agent', 'macOS · Installed, on Windows', 'fail'],
      ['Registration', 'not registered · Registered to this person', 'fail'],
    ])
    expect(pages(b.right.resolution, 'u-exec-2')[0].steps).toEqual([{ kind: 'deny', message: 'Google Workspace opens only on a registered corporate device.' }])
  })

  /* The script reads "2 of 2 devices registered"; the limit's line says it as
     the profile does. The preset is edited to state the two already there. */
  it('refuses Emily Carter on a third device, at the limit of two', () => {
    const third = { ...devicePreset('win11-unregistered').facts, registeredCount: 2 }
    const b = onBoard(DEVICES, board(DEVICES, { personId: 'u-sales-3', device: { kind: 'custom', facts: third } }))
    expect(b.right.resolution.decision).toBe('deny')
    expect(failing(b.route.cards[DEVICES.rules[0].id])).toContainEqual(['Device limit', '2 already registered · at most 2', 'fail'])
  })
})

// --- 6. Break-in test --------------------------------------------------------------------------

describe('Beat 6: the Break-in test on Device compliance', () => {
  const hannah = saved('ssi-hannah', 'Hannah Lowe on an iPhone', { personId: 'u-emp-2', appId: 'outlook', device: { ...devicePreset('iphone').facts, osVersion: '18' } }, '1fa', 'must-pass')
  const devon = saved('ssi-devon', 'Devon Rao on Dropbox', { personId: 'devon', appId: 'dropbox', device: devicePreset('android-12').facts }, 'deny', 'note')
  const run = runBreakIn(COMPLIANCE, env)
  const rows = breakInRows(run, COMPLIANCE)

  it('saves Hannah on iOS 18 as Must pass on one factor, and Devon as Deny, and both pass', () => {
    expect(person('u-emp-2').name).toBe('Hannah Lowe')
    for (const s of [hannah, devon]) expect([s.name, readSignIn(s, t.policies, env).verdict]).toEqual([s.name, 'pass'])
    expect(readSignIn(hannah, t.policies, env)).toMatchObject({ decision: '1fa', ruleName: 'Compliant device' })
  })

  it('counts Got through · Weaker factor · Locked out · Extra prompts, and nothing else as a cell', () => {
    expect(countsSpoken(run.counts)).toBe('Break-in test: got through 5, weaker factor 0, locked out 2, extra prompts 0.')
    expect(groupRows(rows).map((g) => [g.word, g.rows.length])).toEqual([
      ['Got through', 5],
      ['Less than asked', 2],
      ['Locked out', 2],
      ['Held', 6],
    ])
  })

  it('opens a failing row on a fix, with what it would do before it is applied', () => {
    const proxy = rows.find((r) => r.id === 'proxy-finance')!
    expect(proxy.group).toBe('got-through')
    const offer = offeredFix(proxy.round, COMPLIANCE, env, {}, t.policies, run.counts)!
    expect(fixButton(offer.fix, COMPLIANCE)).toBe('Add this rule')
    expect(fixLine(offer.fix, COMPLIANCE)).toBe('Deny sign-ins from outside India — If not in zone India → Deny · at position 1')
    expect(offer.preview.counts.gotThrough).toBe(1)
    expect(offer.preview.changed).toEqual(['gotThrough'])
    /* Stricter only: nobody is let in more easily for it. */
    expect(offer.preview.line.counts).toMatchObject({ nowAllowed: 0, nowOn1Factor: 0 })
  })
})

// --- 7. Who it moves ---------------------------------------------------------------------------

/* Turning HRMS on, as What changes reads it: HR and Finance on HRMS, across
   the modelled places and devices. Test a group instead, Vary and factor
   readiness are not built, so the names are the modelled directory's and
   Neha's missing Google Authenticator is not shown. */
describe('Beat 7: who turning HRMS on moves', () => {
  const g = runGuard({
    kind: 'turn-on',
    before: null,
    after: { ...HRMS, status: 'active' },
    changedFrom: HRMS,
    policies: t.policies,
    env,
    apps: t.apps,
    savedSignIns: t.savedSignIns,
    adminId: 'jaspreet',
    breakIn: {},
  })

  it('opens on Now allowed, with nobody in it, then the stricter moves with names', () => {
    expect(whatChangesSaid(g.whatChanges)).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72')
    expect(whatChangesBlocks(g.whatChanges)).toEqual([
      { key: 'nowAllowed', word: 'Now allowed', items: [] },
      { key: 'nowAskedFor2fa', word: 'Now asked for 2FA', items: [{ name: 'Priya Sharma (Finance)', value: 'Office network' }] },
      { key: 'nowDenied', word: 'Now denied', items: [{ name: 'Priya Sharma (Finance)', value: 'No IP address, Austin, Tor exit, Proxy in Germany' }] },
    ])
    expect(g.newlyAllowed).toBe(false)
  })
})

// --- 8. Compare, then turn on ------------------------------------------------------------------

/* Compare is not built. Before turning on is: the version with the board's
   edits — here the card given OTP over Email beside Google Authenticator. */
describe('Beat 8: Before turning on HRMS, with your edits', () => {
  const edits: Policy = { ...HRMS, rules: HRMS.rules.map((r, i) => (i === 0 ? { ...r, secondFactorMethods: ['Google Authenticator', 'OTP over Email'] } : r)) }
  const after: Policy = { ...edits, status: 'active' }
  const g = runGuard({
    kind: 'turn-on',
    before: null,
    after,
    changedFrom: HRMS,
    policies: t.policies,
    env,
    apps: t.apps,
    savedSignIns: t.savedSignIns,
    adminId: 'jaspreet',
    breakIn: {},
  })

  it('always opens, and nothing stops it', () => {
    expect(guardOpens(g)).toBe(true)
    expect(g.blocking).toEqual([])
  })

  it('lists what changed, who it starts deciding for, the saved and protected sign-ins, What changes and the Break-in counts', () => {
    expect(g.changes?.map((c) => [c.kind, c.name, c.value])).toEqual([['changed', 'Rule 1 · In a corporate office', 'Second factor: Google Authenticator, OTP over Email']])
    expect(g.deciding.map(decidingValue)).toEqual(['Human Resources, Finance · was Global Default Policy'])
    /* The two HRMS promises fail while HRMS is off, and pass once it is on. */
    expect(g.saved.map((c) => [c.signIn.name, c.before.verdict, c.after.verdict])).toEqual([
      ['Aisha Khan on HRMS', 'pass', 'pass'],
      ['Kavya Menon in the office', 'fail', 'pass'],
      ['Neha Kapoor at home', 'fail', 'pass'],
    ])
    expect(checksSummary(g.saved, g.anySaved)).toBe('All pass')
    expect(g.protectedOwn.map((c) => [c.signIn.name, c.after.verdict])).toEqual([['Ravi Menon on HRMS', 'pass']])
    expect(whatChangesSaid(g.whatChanges)).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72')
    expect(breakInSummary(g.breakIn!)).toBe('Got through 0 · Weaker factor 0 · Locked out 1 · Extra prompts 0')
  })

  it('puts live exactly the version it checked', () => {
    const live = withPolicy(t.policies, after)
    const kavya = resolveSignIn(live, t.savedSignIns.find((s) => s.id === 'ssi-kavya-office')!.facts, env)
    expect([kavya.decidedBy?.policyId, kavya.decision]).toEqual([HRMS.id, '2fa'])
    for (const s of t.savedSignIns) expect([s.id, readSignIn(s, live, env).verdict]).toEqual([s.id, 'pass'])
  })
})

// --- 9. Describe a new policy -------------------------------------------------------------------

describe('Beat 9: Describe it — HR and Finance on Workday, from the office', () => {
  const text = 'HR and Finance open Workday only from the office with Google Authenticator'
  const blank = blankPolicy('Untitled policy 1', [])
  const policies: Policy[] = [blank, ...t.policies]
  const tenant: DescribeTenant = { ...t, users: t.directory.people, policies }
  const withDraft = envOf({ ...t, policies })
  const reading = readText(text, dictionaryOf(tenant))
  const c = compose(reading.answers, tenant)
  const draft = describedPolicy({ ...blank, rules: c.rules, fallback: c.fallback ?? blank.fallback }, reading.answers)
  const ctx: CheckContext = { draft, sources: c.sources, tenant, env: withDraft, adminId: 'jaspreet', today: TODAY }
  const runs = runChecks(checksFor(reading.answers, ctx), draft, policies, withDraft)

  it('reads every answer from the text, asks nothing and leaves nothing out', () => {
    expect(openChoices(reading)).toEqual([])
    expect(reading.notAdded).toEqual([])
    const a = reading.answers
    expect((['apps', 'who', 'where'] as const).map((k) => [summaryOf(k, a, tenant), a[k].origin])).toEqual([
      ['Workday', 'text'],
      ['Human Resources and Finance', 'text'],
      ['Only from Corporate offices · Any time', 'text'],
    ])
    expect([summaryOf('signIn', a, tenant), a.signIn.match?.origin]).toEqual(['Allow with 2FA · Google Authenticator', 'text'])
    expect(summaryOf('fallback', reading.answers, tenant)).toBe('Deny')
  })

  it('writes one card, marked with the words it came from', () => {
    expect(c.rules).toHaveLength(1)
    expect(Object.values(c.sources)).toEqual(['only from the office'])
  })

  it('tries the office, home and the edge case, each getting what the text asked, and one it leaves to the Global Default', () => {
    const rows = runs.map((r) => {
      const v = checkRowView(r, draft, tenant, policies)
      return [v.word, v.line, r.result.decision, r.verdict]
    })
    expect(rows).toEqual([
      ['Should pass', 'Kavya Menon · Workday · Office network · Windows 11 laptop · registered', '2fa', 'match'],
      ['Should stop', 'Kavya Menon · Workday · Home broadband · Windows 11 laptop · registered', 'deny', 'match'],
      ['Edge', 'Kavya Menon · Workday · Office network · London · Windows 11 laptop · registered', 'deny', 'match'],
      ['Not named', 'Sanjay Bhatt · Workday · Office network · Windows 11 laptop · registered', '1fa', 'match'],
    ])
    expect(checkRowView(runs[0], draft, tenant, policies).title).toBe('From your text: “only from the office”')
  })

  it('is a draft: nothing it says is live until the guard runs', () => {
    expect(enforces(draft)).toBe(false)
    const today = resolveSignIn(policies, runs[0].check.facts, withDraft)
    expect([today.decidedBy?.policyName, today.decision]).toEqual(['Global Default Policy', '1fa'])
    expect(whatChangesSaid(whatChangesFor(draft, policies, withDraft))).toBe(
      'Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72',
    )
  })
})

// --- 10. The manager's own sentence -------------------------------------------------------------

describe('Beat 10: “MFA for all sales team members accessing the CRM from outside the US”', () => {
  const tenant: DescribeTenant = { ...t, users: t.directory.people }
  const reading = readText('MFA for all sales team members accessing the CRM from outside the US', dictionaryOf(tenant))

  it('asks which application the CRM is, Salesforce first, and picks nothing', () => {
    expect(openChoices(reading).map((c) => [c.slot, c.span.phrase, c.options.map((o) => o.label)])).toEqual([['apps', 'the CRM', ['Salesforce', 'Another application']]])
    expect(reading.answers.apps.origin).toBe('unset')
    expect(summaryOf('apps', reading.answers, tenant)).toBe('Not set')
  })

  it('says there is no zone for the United States, offers to create one, and never invents one', () => {
    expect(reading.notAdded.map((n) => [n.span.phrase, n.reason, n.action])).toEqual([['outside the US', 'No zone for United States', 'create-zone']])
    expect(t.zones.map((z) => z.name)).toEqual(['Corporate offices', 'India'])
    expect(compose(reading.answers, tenant).rules.flatMap((r) => r.when.cards.flatMap((k) => k.conditions))).toEqual([])
  })

  it('reads what it can: Sales, and MFA as Allow with 2FA', () => {
    expect(summaryOf('who', reading.answers, tenant)).toBe('Sales')
    expect(summaryOf('signIn', reading.answers, tenant)).toBe('Allow with 2FA · Any enabled method')
  })
})
