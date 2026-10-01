import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import { buildTemplate } from './board/apply-template'
import {
  COUNT_CELLS,
  GROUP_ORDER,
  acceptanceFor,
  acceptanceOptions,
  acceptedSaid,
  applyBreakInFix,
  breakInDefault,
  breakInPolicies,
  breakInRows,
  canAccept,
  changedCounts,
  countsMoved,
  countsSpoken,
  decidedBySaid,
  factsSaid,
  fixButton,
  fixFor,
  fixLine,
  fixRuleRef,
  fixToast,
  groupRows,
  groupsById,
  methodsSaid,
  movedRows,
  needsSaid,
  offeredFix,
  possibleSaid,
  rowLayoutId,
  rowSpoken,
  secondFactorSaid,
  skippedSaid,
  stampSaid,
  statusMeta,
  versionWord,
  type Accepted,
} from './break-in-model'
import { runBreakIn } from './gauntlet'
import type { NameLookup } from './predicate-prose'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The Break-in test's view model, on the showcase tenant: the counts, rows and
   groups it prints (spec D §8, A11 to A15), the fixes it offers and the ones
   it withholds, and what accepting a result does.
   -------------------------------------------------------------------------- */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const HRMS = stored('sc-hrms-office')
const TOOLS = stored('sc-dev-tools')
const COMPLIANCE = stored('sc-device-compliance')
const resolve: NameLookup = (kind, id) =>
  kind === 'zone' ? t.zones.find((z) => z.id === id)?.name : kind === 'fingerprint' ? t.fingerprints.find((p) => p.id === id)?.name : undefined
const rowsOf = (p: Policy, accepted?: Accepted) => {
  const run = runBreakIn(p, env, acceptanceOptions(accepted))
  return { run, rows: breakInRows(run, p, accepted) }
}
const row = (p: Policy, cardId: string, accepted?: Accepted) => rowsOf(p, accepted).rows.find((r) => r.id === cardId)!

describe('the counts', () => {
  it('are four cells — no grade, and no cell for Less than asked or Can’t tell', () => {
    expect(COUNT_CELLS.map((c) => c.word)).toEqual(['Got through', 'Weaker factor', 'Locked out', 'Extra prompts'])
    expect(COUNT_CELLS.map((c) => c.group)).not.toContain('less-than-asked')
    expect(COUNT_CELLS.map((c) => c.group)).not.toContain('cant-tell')
    for (const c of COUNT_CELLS) expect(c.tip.split('\n')).toHaveLength(1)
  })

  it('read HRMS as 0 · 0 · 1 · 0, and say so to the status region (A11)', () => {
    const { run } = rowsOf(HRMS)
    expect(countsSpoken(run.counts)).toBe('Break-in test: got through 0, weaker factor 0, locked out 1, extra prompts 0.')
    expect(skippedSaid(run)).toBe('10 skipped: outside Human Resources, Finance')
  })

  /* The audience drawer can leave nobody chosen, and the board's draft is
     tested as it stands: every card is skipped, the empty state says why, and
     the footer does not add "outside nobody chosen". */
  it('say nothing under the empty state when the policy names nobody', () => {
    const nobody = { ...HRMS, audience: { everyone: false, groupIds: [], userIds: [] } }
    const { run } = rowsOf(nobody)
    expect(run.rounds).toEqual([])
    expect(run.counts.skipped).toBe(15)
    expect(run.skipped.every((s) => s.audience === null)).toBe(true)
    expect(skippedSaid(run)).toBeNull()
  })

  it('name only the counts that moved', () => {
    const before = rowsOf(HRMS).run.counts
    const after = { ...before, lockedOut: 0 }
    expect(changedCounts(before, after)).toEqual(['lockedOut'])
    expect(countsMoved(before, after)).toBe('Locked out now 0.')
    expect(countsMoved(before, before)).toBeNull()
  })
})

describe('the rows', () => {
  it('list HRMS’s lockout first and its four held cards last (A11)', () => {
    const groups = groupRows(rowsOf(HRMS).rows)
    expect(groups.map((g) => [g.word, g.rows.length])).toEqual([
      ['Locked out', 1],
      ['Held', 4],
    ])
    const [lock] = groups[0].rows
    expect([lock.name, lock.expected, lock.got, lock.ruleLabel, lock.ruleRef]).toEqual(['Finance working from home', '2fa', 'deny', 'Last row', 'fallback'])
    expect(rowSpoken(lock)).toBe('Finance working from home. Locked out. Expected Allow with 2FA, got Deny.')
    expect(decidedBySaid(lock)).toEqual({ label: 'Last row · Nothing else matched', reason: 'No rule above matched' })
  })

  it('keep the group order, and list Less than asked under its own heading (A5)', () => {
    const groups = groupRows(rowsOf(COMPLIANCE).rows)
    expect(groups.map((g) => g.group)).toEqual(GROUP_ORDER.filter((g) => groups.some((x) => x.group === g)))
    expect(groups.map((g) => [g.word, g.rows.length])).toEqual([
      ['Got through', 5],
      ['Less than asked', 2],
      ['Locked out', 2],
      ['Held', 6],
    ])
  })

  it('filter to one group when a count cell is pressed', () => {
    const { rows } = rowsOf(COMPLIANCE)
    expect(groupRows(rows, 'locked-out').map((g) => g.word)).toEqual(['Locked out'])
    expect(groupRows(rows, 'weaker-factor')).toEqual([])
  })

  it('put a round a missing fact could turn either way under Can’t tell, with what it could be and what it needs', () => {
    const template = t.scenarios.find((s) => s.id === 'st-office')!
    const officeOnly = { ...blankPolicy('Office only', ['salesforce']), status: 'active' as const, rules: buildTemplate(template, t.directory.people, { zones: t.zones, fingerprints: t.fingerprints }).rules }
    const roaming = row(officeOnly, 'roaming-unknown-origin')
    expect(roaming.group).toBe('cant-tell')
    expect(roaming.got).toBeNull()
    expect(roaming.ruleLabel).toBe('')
    expect(decidedBySaid(roaming)).toBeNull()
    expect(possibleSaid(roaming)).toBe('Deny by rule 1, or Allow on 1 factor by the last row')
    expect(needsSaid(roaming)).toBe('IP address, Place')
    expect(canAccept(roaming)).toBe(false)
  })

  it('read out the sign-in a card scripts, each fact with where it came from', () => {
    const relay = row(TOOLS, 'aitm-relay')
    const said = factsSaid(relay.round, env)
    for (const s of ['Arun Patel', '192.0.2.82 (typed)', 'Frankfurt (looked up)', 'Windows 10.0.22631 laptop', 'Registered to this person: No', 'Device Agent: No', 'Mon 28 Sep 2026 10:40 Asia/Kolkata (stated)', 'Risk 12 (stated)']) {
      expect(said).toContain(s)
    }
  })

  it('see which rows moved between two runs of one policy, and none on a first run', () => {
    const { rows } = rowsOf(HRMS)
    const moved = rows.map((r) => (r.id === 'finance-home' ? { ...r, group: 'held' as const } : r))
    expect(movedRows(groupsById(rows), moved)).toEqual(['finance-home'])
    expect(movedRows(null, moved)).toEqual([])
  })

  it('pair a row across runs of one policy only, so a new policy fades in and never slides', () => {
    expect(rowLayoutId('b', HRMS.id, 'finance-home')).toBe(`b-${HRMS.id}-finance-home`)
    expect(rowLayoutId('b', HRMS.id, 'finance-home')).not.toBe(rowLayoutId('b', TOOLS.id, 'finance-home'))
  })
})

describe('Accept this result', () => {
  const at = '2026-09-26T08:35:00.000Z'

  it('moves the row to Held, clears its count, and says who accepted it and when (A12)', () => {
    const lock = row(HRMS, 'finance-home')
    expect(canAccept(lock)).toBe(true)
    const a = acceptanceFor(lock.round, 'Jaspreet Toor', at, '  HRMS is office-only  ')!
    expect(a).toEqual({ want: 'deny', factorOk: false, by: 'Jaspreet Toor', at, reason: 'HRMS is office-only' })
    const { run, rows } = rowsOf(HRMS, { 'finance-home': a })
    expect(run.counts.lockedOut).toBe(0)
    const held = rows.find((r) => r.id === 'finance-home')!
    expect(held.group).toBe('held')
    expect(held.accepted).toBe(a)
    expect(acceptedSaid(a)).toBe('Accepted by Jaspreet Toor · 26 Sep 2026, 14:05')
  })

  it('is not offered on a held row, and records nothing for one', () => {
    const held = rowsOf(HRMS).rows.find((r) => r.group === 'held')!
    expect(canAccept(held)).toBe(false)
    expect(acceptanceFor(held.round, 'Jaspreet Toor', at, 'x')).toBeNull()
  })

  it('accepts a weaker factor as held without changing the decision', () => {
    const relay = row(TOOLS, 'aitm-relay')
    const a = acceptanceFor(relay.round, 'Jaspreet Toor', at, 'Push is what we have')!
    expect(a).toMatchObject({ want: '2fa', factorOk: true })
    expect(acceptanceOptions({ 'aitm-relay': a })).toEqual({ overrides: { 'aitm-relay': '2fa' }, factorOk: new Set(['aitm-relay']) })
    expect(rowsOf(TOOLS, { 'aitm-relay': a }).run.counts.weakerFactor).toBe(0)
  })

  it('writes the date in the tenant’s time zone, 24-hour, short month', () => {
    expect(stampSaid('2026-09-26T08:35:00.000Z')).toBe('26 Sep 2026, 14:05')
    expect(stampSaid('2026-01-02T20:00:00.000Z')).toBe('3 Jan 2026, 01:30')
    expect(stampSaid('not a date')).toBe('not a date')
  })
})

describe('the fixes', () => {
  it('ask the relay’s rule for a phishing-resistant factor, and preview the weaker factor gone (A13)', () => {
    const relay = row(TOOLS, 'aitm-relay')
    expect(relay.group).toBe('weaker-factor')
    expect(secondFactorSaid(relay, TOOLS)).toBe('miniOrange Push · standard · needs phishing-resistant')
    const { run } = rowsOf(TOOLS)
    const offer = offeredFix(relay.round, TOOLS, env, {}, t.policies, run.counts)!
    expect(offer.fix).toEqual({ kind: 'factor', fix: { ruleIndex: 1, methods: ['FIDO2 / Passkey'] } })
    expect(fixLine(offer.fix, TOOLS)).toBe('Rule 2 · Compliant device, working remotely → FIDO2 / Passkey')
    expect(fixButton(offer.fix, TOOLS)).toBe('Change second factor')
    expect(fixToast(offer.fix, TOOLS)).toBe('Second factor changed on rule 2. Not saved yet.')
    expect(fixRuleRef(offer.fix, TOOLS)).toBe(TOOLS.rules[1].id)
    expect(offer.preview.counts.weakerFactor).toBe(0)
    expect(offer.preview.changed).toEqual(['weakerFactor'])
    /* And applying it does what the preview said. */
    const fixed = applyBreakInFix(TOOLS, offer.fix)
    expect(fixed.rules[1]).toMatchObject({ secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey'] })
    expect(row(fixed, 'aitm-relay').group).toBe('held')
  })

  it('close the proxy with a rule inserted at the top, and preview Got through 1 (A14)', () => {
    const proxy = row(COMPLIANCE, 'proxy-finance')
    expect(proxy.group).toBe('got-through')
    const { run } = rowsOf(COMPLIANCE)
    const offer = offeredFix(proxy.round, COMPLIANCE, env, {}, t.policies, run.counts)!
    expect(fixLine(offer.fix, COMPLIANCE, resolve)).toBe('Deny sign-ins from outside India — If not in zone India → Deny · at position 1')
    expect(fixButton(offer.fix, COMPLIANCE)).toBe('Add this rule')
    expect(fixToast(offer.fix, COMPLIANCE)).toBe('Rule added. Not saved yet.')
    expect(offer.preview.counts.gotThrough).toBe(1)
    expect(offer.preview.changed).toEqual(['gotThrough'])
    /* Stricter only: the looser moves, listed first, are both zero. */
    expect(offer.preview.line.counts.nowAllowed).toBe(0)
    expect(offer.preview.line.counts.nowOn1Factor).toBe(0)
    expect(offer.preview.line.counts.nowDenied).toBeGreaterThan(0)
  })

  it('are never looser: a fix that would let anybody in more easily is not offered', () => {
    /* The card's own fix exists — a 2FA rule above the compliance rule — but
       sign-ins the last row denies today would then get in with 2FA. */
    const expired = row(COMPLIANCE, 'expired-trust')
    expect(fixFor(expired.round, COMPLIANCE, env)).not.toBeNull()
    expect(offeredFix(expired.round, COMPLIANCE, env, {}, t.policies, rowsOf(COMPLIANCE).run.counts)).toBeNull()
  })

  it('are never offered for a cost: a lockout is not repaired by loosening', () => {
    const lock = row(HRMS, 'finance-home')
    expect(fixFor(lock.round, HRMS, env)).toBeNull()
  })

  it('are withheld when they name something the tenant does not have', () => {
    const proxy = row(COMPLIANCE, 'proxy-finance')
    const noIndia = envOf({ ...t, zones: t.zones.filter((z) => z.id !== 'india') })
    expect(fixFor(proxy.round, COMPLIANCE, env)).not.toBeNull()
    expect(fixFor(proxy.round, COMPLIANCE, noIndia)).toBeNull()
  })

  it('say a rule that only moves as a move', () => {
    const r = COMPLIANCE.rules[0]
    const fix = { kind: 'rule' as const, fix: { kind: 'retune' as const, rule: r, at: 0, fromIndex: 0, why: '', placement: null, headline: '' } }
    expect(fixLine(fix, COMPLIANCE)).toBe('Rule 1 moves above rule 1')
    expect(fixButton(fix, COMPLIANCE)).toBe('Move rule 1 up')
    expect(fixToast(fix, COMPLIANCE)).toBe('Rule 1 moved. Not saved yet.')
    const changed = { kind: 'rule' as const, fix: { ...fix.fix, rule: { ...r, decision: 'deny' as const } } }
    expect(fixLine(changed, COMPLIANCE)).toBe(`Rule 1 · ${r.name} → Deny`)
    expect(fixButton(changed, COMPLIANCE)).toBe('Change rule 1')
  })

  it('say a rule’s second factor the way the board’s card does', () => {
    const base = { secondFactorMethods: ['FIDO2 / Passkey', 'CAC Card'], methodChain: ['OTP over Email', 'miniOrange Push'], preferredFallback: 'OTP over SMS' }
    expect(methodsSaid({ ...base, secondFactor: 'specific' })).toBe('FIDO2 / Passkey, CAC Card')
    expect(methodsSaid({ ...base, secondFactor: 'chain' })).toBe('OTP over Email → miniOrange Push')
    expect(methodsSaid({ ...base, secondFactor: 'preferred' })).toBe('Their preferred method, else OTP over SMS')
    expect(methodsSaid({ ...base, secondFactor: 'any' })).toBe('Any enabled method')
  })
})

describe('which policy it runs on', () => {
  it('offers App Access policies with an application, never the Global Default', () => {
    const ids = breakInPolicies(t.policies).map((p) => p.id)
    /* The four scenarios, then the troubleshooting estate (showcase-seed.ts,
       30 Sep 2026), then the owner's two-group example on Box (1 Oct 2026). */
    expect(ids).toEqual([
      'sc-hrms-office',
      'sc-corporate-devices',
      'sc-device-compliance',
      'sc-dev-tools',
      'sc-aws-engineering',
      'sc-aws-finance',
      'sc-aws-devops',
      'sc-slack-everyone',
      'sc-slack-engineering',
      'sc-code-review-finance',
      'sc-box-engineering',
      'sc-box-design',
    ])
    expect(t.policies.some((p) => p.isSystem && ids.includes(p.id))).toBe(false)
  })

  it('opens on the assumed policy, else the deciding one, else the first', () => {
    expect(breakInDefault(t.policies, { assumedId: 'sc-dev-tools', deciderId: 'sc-hrms-office' })).toBe('sc-dev-tools')
    expect(breakInDefault(t.policies, { deciderId: 'sc-hrms-office' })).toBe('sc-hrms-office')
    const system = t.policies.find((p) => p.isSystem)!.id
    expect(breakInDefault(t.policies, { deciderId: system })).toBe('sc-hrms-office')
    expect(breakInDefault([], {})).toBeNull()
  })

  it('names the version it runs, and the status the picker shows', () => {
    expect(versionWord(HRMS)).toBe('Live')
    expect(versionWord({ ...HRMS, status: 'inactive' })).toBe('Stored version')
    expect(versionWord({ ...HRMS, status: 'draft' })).toBe('Draft')
    expect(versionWord({ ...HRMS, status: 'monitor' })).toBe('Monitoring')
    expect(versionWord({ ...HRMS, pendingDraft: { rules: HRMS.rules, fallback: HRMS.fallback, savedAt: 'Just now', savedBy: 'You' } })).toBe('Saved draft')
    expect(statusMeta(HRMS)).toBe('Active')
    expect(statusMeta({ ...HRMS, status: 'inactive' })).toBe('Inactive')
  })
})
