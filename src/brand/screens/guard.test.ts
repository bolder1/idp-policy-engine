import { describe, expect, it } from 'vitest'

import { blankRule, type Policy, type Rule } from '../data'
import { showcaseTenant, showcaseTenantHrmsOn } from '../fixtures'
import { committed } from '../policy-draft'
import {
  blockLine,
  breakInSummary,
  checkName,
  checkSaid,
  checkValue,
  checksSummary,
  decidingSummary,
  editsTip,
  decidingValue,
  guardOpens,
  guardSpoken,
  isStale,
  overridable,
  overridePatch,
  patchSignIns,
  readSignIn,
  runGuard,
  whatChangesBlocks,
  withPolicy,
  type GuardInput,
  type GuardKind,
  type GuardResult,
} from './guard'
import { asksFirst, guardFor, statusConfirmCopy } from './status-options'
import { envOf } from './tenant-resolver'
import { whatChangesSaid } from './what-changes'

/* -----------------------------------------------------------------------------
   The checks before an enforcing policy is saved, turned on, turned off or
   switched to monitoring — pinned on the showcase tenant with the numbers the
   final spec's acceptance checks read (D.9: A1–A6, A3b).

   The saves, the switch-offs and the applications change are about HRMS as
   an enforcing policy, so they run on the tenant once HRMS is turned on. The
   seed opens with it Inactive (Phase 4); Before turning on reads the seed as
   it opens, which is the pitch's own Turn on.
   -------------------------------------------------------------------------- */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const HRMS = stored('sc-hrms-office')
const DEVICES = stored('sc-corporate-devices')
const COMPLIANCE = stored('sc-device-compliance')

/* A save on the board: the stored policy, and the draft committed over it. */
function save(saved: Policy, draft: Policy, extra: Partial<GuardInput> = {}): GuardResult {
  return runGuard({
    kind: 'save',
    before: saved,
    after: committed(saved, draft, 'keep-off'),
    changedFrom: saved,
    policies: t.policies,
    env,
    apps: t.apps,
    savedSignIns: t.savedSignIns,
    adminId: 'jaspreet',
    breakIn: {},
    ...extra,
  })
}

/* A status switch, from the list: the policy as stored, and after. */
function switchTo(kind: GuardKind, policies: readonly Policy[], id: string, status: Policy['status']): GuardResult {
  const was = policies.find((p) => p.id === id)!
  const decidesToday = was.status === 'active' || was.status === 'always-on'
  return runGuard({
    kind,
    before: decidesToday ? was : null,
    after: { ...was, status },
    changedFrom: kind === 'turn-on' ? was : null,
    policies,
    env,
    apps: t.apps,
    savedSignIns: t.savedSignIns,
    adminId: 'jaspreet',
    breakIn: kind === 'turn-off' || kind === 'to-monitor' ? null : {},
  })
}

const valueOf = (r: GuardResult, id: string) => {
  const c = [...r.saved, ...r.protectedOwn].find((x) => x.signIn.id === id)!
  return checkSaid(checkValue(c, r.subjectId, r.kind))
}

const denyHr: Rule = { ...blankRule('Deny Human Resources'), pristine: undefined, decision: 'deny', who: { groupIds: ['hr'], userIds: [] } }

describe('reading a saved sign-in', () => {
  it('passes every seeded one on load', () => {
    for (const s of t.savedSignIns) expect(readSignIn(s, t.policies, env).verdict).toBe('pass')
  })

  it('says which rule decided it', () => {
    const kavya = t.savedSignIns.find((s) => s.id === 'ssi-kavya-office')!
    expect(readSignIn(kavya, t.policies, env)).toMatchObject({ decision: '2fa', ruleIndex: 0, ruleName: 'In a corporate office' })
  })
})

describe('Before saving', () => {
  it('stays one click for a clean save (A1)', () => {
    const draft = { ...COMPLIANCE, rules: COMPLIANCE.rules.map((r, i) => (i === 0 ? { ...r, name: 'Compliant device only' } : r)) }
    const r = save(COMPLIANCE, draft)
    expect(r.interrupt).toBe(false)
    expect(guardOpens(r)).toBe(false)
    expect(r.changes).toHaveLength(1)
    expect(guardSpoken(r, 'save')).toBe('Ready to save.')
  })

  it('opens without blocking when somebody is newly allowed (A2)', () => {
    const r = save(HRMS, { ...HRMS, fallback: { ...HRMS.fallback!, decision: '1fa' } })
    expect(whatChangesSaid(r.whatChanges)).toBe('Of 360 modelled sign-ins: Now allowed 72 · Now on 1 factor 0 · Now asked for 2FA 0 · Now denied 0')
    expect(whatChangesBlocks(r.whatChanges)[0]).toEqual({
      key: 'nowAllowed',
      word: 'Now allowed',
      items: [{ name: 'Priya Sharma (Finance)', value: 'No IP address, Austin, Tor exit, Proxy in Germany' }],
    })
    expect(breakInSummary(r.breakIn!)).toBe('Got through 2 (was 0) · Weaker factor 0 · Locked out 0 (was 1) · Extra prompts 0')
    expect(r.blocking).toEqual([])
    expect(r.newlyAllowed).toBe(true)
    expect(guardOpens(r)).toBe(true)
    for (const id of ['ssi-kavya-office', 'ssi-aisha-hrms', 'ssi-ravi-hrms']) {
      expect([...r.saved, ...r.protectedOwn].find((c) => c.signIn.id === id)!.after.verdict).toBe('pass')
    }
    expect(guardSpoken(r, 'save')).toBe('Checks done. Now allowed: Priya Sharma.')
  })

  it('blocks a Must pass that newly fails, with a ready fix (A3)', () => {
    const draft = { ...HRMS, rules: [denyHr, ...HRMS.rules] }
    const r = save(HRMS, draft)
    expect(r.blocking.map((c) => c.signIn.id)).toEqual(['ssi-kavya-office'])
    expect(blockLine(r.blocking[0])).toBe('Kavya Menon in the office must pass and would get Deny.')
    expect(guardSpoken(r, 'save')).toBe("Can't save. Kavya Menon in the office must pass and would get Deny.")
    expect(r.fix?.label).toBe('Leave Kavya Menon out of rule 1')
    expect(overridable(r.blocking[0])).toBe(true)
    expect(valueOf(r, 'ssi-kavya-office')).toBe('Deny · expected Allow with 2FA · Rule 1')
    expect(checksSummary(r.saved, true)).toBe('1 failing')

    /* The fix clears it, and Kavya is decided by the office rule, now rule 2. */
    const fixed = save(HRMS, r.fix!.policy)
    expect(fixed.blocking).toEqual([])
    expect(valueOf(fixed, 'ssi-kavya-office')).toBe('Allow with 2FA · Rule 2')
    expect(guardSpoken(fixed, 'save')).toBe('Ready to save.')
  })

  it('clears a Must pass by expecting its new decision, with a reason (A3b)', () => {
    const draft = { ...HRMS, rules: [denyHr, ...HRMS.rules] }
    const r = save(HRMS, draft)
    const patch = overridePatch(r.blocking[0], ' HR offboarding test ', 'Jaspreet Toor', '2026-09-27T10:00:00+05:30')
    expect(patch).toEqual({ expected: 'deny', reason: 'HR offboarding test', changedBy: 'Jaspreet Toor', changedAt: '2026-09-27T10:00:00+05:30' })
    expect(overridePatch(r.blocking[0], '   ', 'x', 'y')).toBeNull()
    const again = save(HRMS, draft, { savedSignIns: patchSignIns(t.savedSignIns, 'ssi-kavya-office', patch!) })
    expect(again.blocking).toEqual([])
  })

  it('blocks a Protected one with no way to expect otherwise, and restores the rule (A4)', () => {
    const draft = {
      ...DEVICES,
      rules: DEVICES.rules.map((r, i) => (i === 0 ? { ...r, decision: 'deny' as const } : i === 2 ? { ...r, name: 'High risk — refuse' } : r)),
    }
    const r = save(DEVICES, draft)
    expect(r.blocking.map((c) => blockLine(c))).toEqual(['Vikram Nair on a corporate laptop is protected and would get Deny.'])
    expect(overridable(r.blocking[0])).toBe(false)
    expect(r.fix?.label).toBe('Restore rule 1')
    expect(r.whatChanges.counts.nowDenied).toBe(5)
    expect(checkName(r.blocking[0])).toBe('Vikram Nair on a corporate laptop · Protected')

    /* Only the rename is left. */
    const fixed = save(DEVICES, r.fix!.policy)
    expect(fixed.blocking).toEqual([])
    expect(fixed.changes?.map((c) => c.value)).toEqual(['Renamed from High risk — deny'])
  })

  it('offers a move back when the deciding rule only moved', () => {
    const tail: Rule = { ...denyHr, id: 'tail', who: { groupIds: ['finance'], userIds: [] }, name: 'Deny Finance' }
    const live = { ...HRMS, rules: [...HRMS.rules, tail] }
    const policies = withPolicy(t.policies, live)
    const moved = { ...live, rules: [tail, HRMS.rules[0]] }
    /* Nobody saved Finance, so nothing blocks — a Must pass for Priya would. */
    const priya = { ...t.savedSignIns[0], id: 'ssi-priya', name: 'Priya in the office', facts: { ...t.savedSignIns[0].facts, personId: 'priya' } }
    const r = save(live, moved, { policies, savedSignIns: [...t.savedSignIns, priya] })
    expect(r.blocking.map((c) => c.signIn.id)).toEqual(['ssi-priya'])
    expect(r.fix?.label).toBe('Move rule 1 back to position 2')
  })
})

describe('Before saving: applications', () => {
  it('blocks taking HRMS off its own policy, and keeps it as the fix', () => {
    const r = runGuard({
      kind: 'apps',
      before: HRMS,
      after: { ...HRMS, appIds: [], status: 'draft' },
      changedFrom: null,
      policies: t.policies,
      env,
      apps: t.apps,
      savedSignIns: t.savedSignIns,
      adminId: 'jaspreet',
      breakIn: null,
    })
    expect(r.deciding.map(decidingValue)).toEqual(['Human Resources, Finance · now Global Default Policy'])
    expect(r.blocking.map((c) => c.signIn.id)).toEqual(['ssi-kavya-office'])
    expect(r.fix?.label).toBe('Keep HRMS')
    expect(r.fix?.policy).toMatchObject({ appIds: ['hrms'], status: 'active' })
    expect(r.changes).toBeNull()
  })
})

describe('Before turning on (A6)', () => {
  const r = switchTo('turn-on', showcaseTenant().policies, HRMS.id, 'active')

  it('always opens', () => {
    expect(guardOpens(r)).toBe(true)
    expect(r.blocking).toEqual([])
  })

  it('says who it starts deciding for', () => {
    expect(r.deciding.map(decidingValue)).toEqual(['Human Resources, Finance · was Global Default Policy'])
    expect(decidingSummary(r.deciding)).toBe('HRMS')
  })

  it('reads the grid and the deck on the version turning on, with no was', () => {
    expect(whatChangesSaid(r.whatChanges)).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72')
    expect(breakInSummary(r.breakIn!)).toBe('Got through 0 · Weaker factor 0 · Locked out 1 · Extra prompts 0')
  })

  it('passes Kavya, who gets 2FA once it is on', () => {
    expect(valueOf(r, 'ssi-kavya-office')).toBe('Allow with 2FA · was Allow on 1 factor · Rule 1')
    expect(checksSummary(r.saved, true)).toBe('All pass')
  })
})

describe('Before turning off and switching to monitoring', () => {
  it('opens when somebody is newly allowed, and never blocks (A6, assumption 24)', () => {
    for (const kind of ['turn-off', 'to-monitor'] as const) {
      const r = switchTo(kind, t.policies, HRMS.id, kind === 'turn-off' ? 'inactive' : 'monitor')
      expect(r.whatChanges.counts.nowAllowed).toBe(72)
      expect(guardOpens(r)).toBe(true)
      /* Kavya's Must pass fails once HRMS stops deciding, and still blocks nothing. */
      const kavya = r.saved.find((c) => c.signIn.id === 'ssi-kavya-office')!
      expect(kavya.after.verdict).toBe('fail')
      expect(r.blocking).toEqual([])
      expect(r.deciding.map(decidingValue)).toEqual(['Human Resources, Finance · now Global Default Policy'])
      expect(r.breakIn).toBeNull()
    }
  })

  it('stays the plain confirm when nobody is newly allowed', () => {
    /* HRMS asked everybody for 2FA and kept nobody out: switching it off hands
       them to the Global Default Policy, which lets them in on one factor.
       That is a real change — What changes lists all 90 — but nobody is let in
       who was kept out, and Now on 1 factor never opens a page (assumption 4). */
    const open = { ...HRMS, rules: [], fallback: { ...HRMS.fallback!, decision: '2fa' as const } }
    const policies = withPolicy(t.policies, open)
    for (const [kind, status] of [
      ['turn-off', 'inactive'],
      ['to-monitor', 'monitor'],
    ] as const) {
      const r = switchTo(kind, policies, HRMS.id, status)
      expect(whatChangesSaid(r.whatChanges), kind).toBe('Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 90 · Now asked for 2FA 0 · Now denied 0')
      expect(r.deciding.map(decidingValue), kind).toEqual(['Human Resources, Finance · now Global Default Policy'])
      expect(r.newlyAllowed, kind).toBe(false)
      expect(guardOpens(r), kind).toBe(false)
      /* So the switch goes the plain way: no page, and the one-line confirm. */
      expect(guardFor(open, status, { guarded: true, turnsOn: () => true, newlyAllows: () => guardOpens(r) }), kind).toBeNull()
      expect(asksFirst('active', status, false)).toBe(true)
    }
    expect(statusConfirmCopy(open, 'inactive', false, 'HRMS')).toEqual({ title: `Turn off ${HRMS.name}?`, lines: ['It stops deciding sign-ins to HRMS.'], verb: 'Turn off' })
  })
})

describe('the words', () => {
  it('summarise a list of checks', () => {
    expect(checksSummary([], false)).toBe('None saved')
    expect(checksSummary([], true)).toBe('None for this policy')
  })

  it('call a check that already failed not this change’s doing', () => {
    const draft = { ...HRMS, rules: [denyHr, ...HRMS.rules] }
    const failing = t.savedSignIns.map((s) => (s.id === 'ssi-kavya-office' ? { ...s, expected: '1fa' as const } : s))
    const r = save(HRMS, draft, { savedSignIns: failing })
    expect(r.blocking).toEqual([])
    expect(valueOf(r, 'ssi-kavya-office')).toBe('Deny · expected Allow on 1 factor · Rule 1 · failing on live too')
  })

  it('say a sign-in another policy decides by that policy’s name', () => {
    const r = save(HRMS, { ...HRMS, fallback: { ...HRMS.fallback!, decision: '1fa' } })
    expect(valueOf(r, 'ssi-aisha-hrms')).toBe('Allow on 1 factor · Global Default Policy')
  })
})

describe('the live region', () => {
  it("says Can't turn on when the chosen version's own rules stop it, as the page does", () => {
    const off = withPolicy(t.policies, { ...HRMS, status: 'inactive' })
    const r = switchTo('turn-on', off, HRMS.id, 'active')
    expect(r.blocking).toEqual([])
    expect(guardSpoken(r, 'turn-on', 'Fix the error in its rules first.')).toBe("Can't turn on. Fix the error in its rules first.")
    expect(guardSpoken(r, 'turn-on', null)).toBe('Checks done.')
  })
})

describe("Before turning on's version title", () => {
  it('says where the edits version started, and the fixes made on the page since', () => {
    expect(editsTip('board', 0)).toBe('Unsaved edits on this board')
    expect(editsTip('board', 2)).toBe('Unsaved edits on this board and 2 fixes')
    expect(editsTip('draft', 0, { savedAt: 'Yesterday', savedBy: 'Jaspreet Toor' })).toBe('Saved draft · yesterday by Jaspreet Toor')
    expect(editsTip('draft', 1, { savedAt: 'Yesterday', savedBy: 'Jaspreet Toor' })).toBe('Saved draft and 1 fix')
    expect(editsTip('stored', 1)).toBe('Stored version and 1 fix')
    expect(editsTip('stored', 2)).toBe('Stored version and 2 fixes')
  })
})

describe('a stale review', () => {
  it('is any object the checks read being replaced', () => {
    const stamp = { policies: t.policies, zones: t.zones, fingerprints: t.fingerprints, riskScale: env.riskScale }
    expect(isStale(stamp, { ...stamp })).toBe(false)
    expect(isStale(stamp, { ...stamp, policies: [...t.policies] })).toBe(true)
    expect(isStale(stamp, { ...stamp, zones: [...t.zones] })).toBe(true)
  })
})
