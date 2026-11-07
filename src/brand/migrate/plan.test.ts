import { describe, expect, it } from 'vitest'
import { FALLBACK_NAME } from '../data'
import { showcaseTenant } from '../fixtures'
import { countdown, daysLeft, showcaseLegacy, urgencyOf, windowGone } from './legacy'
import { blockedReason, mergeOffers, planMove, type MoveContext } from './plan'

const t = showcaseTenant()
const ctx: MoveContext = { apps: t.apps, groups: t.groups, users: t.directory.people, zones: t.zones, policies: t.policies }
const movable = showcaseLegacy.policies.filter((p) => !blockedReason(p, ctx))
const plan = (merged: string[] = []) => planMove(movable, showcaseLegacy, ctx, merged)
const policyFor = (appId: string, merged: string[] = []) => plan(merged).policies.find((p) => p.appIds.includes(appId))!

describe('Move policies: one application, one policy', () => {
  it('refuses nothing in the showcase: an application with a policy is joined, not blocked', () => {
    expect(showcaseLegacy.policies.filter((p) => blockedReason(p, ctx))).toEqual([])
  })

  it('adds the old rows to the policy the application already has, as rules, and keeps its last row', () => {
    const slack = plan().policies.find((p) => p.appIds.includes('slack'))!
    expect(slack.into).toEqual({ id: 'sc-slack-everyone', name: 'Slack access' })
    expect(slack.policy.fallback).toBeUndefined()
    expect(slack.leftOut.map((l) => l.after)).toEqual(["Slack access's own last row decides"])
    const aws = plan().policies.find((p) => p.appIds.includes('aws'))!
    expect(aws.into?.id).toBe('sc-aws-engineering')
    expect(aws.policy.rules.map((r) => r.name)).toEqual(['Engineering'])
  })

  it('never makes two policies for one application', () => {
    const apps = plan().policies.flatMap((p) => p.appIds)
    expect(new Set(apps).size).toBe(apps.length)
  })
})

describe('Move policies: the plan', () => {
  it('makes one draft policy per application, with every source named', () => {
    const p = plan()
    const made = p.policies.filter((x) => !x.into)
    expect(made.map((x) => x.appIds)).toEqual([['salesforce'], ['servicenow'], ['workday'], ['zoom']])
    for (const x of made) {
      expect(x.policy.status).toBe('draft')
      expect(x.policy.movedFrom?.length).toBeGreaterThan(0)
      expect(x.policy.fallback?.name).toBe(FALLBACK_NAME)
    }
  })

  it('turns the DEFAULT row into the last row, and denies outsiders where there is none', () => {
    expect(policyFor('salesforce').policy.fallback?.decision).toBe('1fa')
    expect(policyFor('servicenow').policy.fallback?.decision).toBe('deny')
  })

  it('puts the stricter group first and names the person in both groups', () => {
    const sn = policyFor('servicenow')
    expect(sn.policy.rules.map((r) => r.name)).toEqual(['Contractors, Contractor network not met', 'Contractors', 'Engineering'])
    expect(sn.policy.rules[0].decision).toBe('deny')
    const weight = sn.changes.find((c) => c.before.includes('weight'))
    expect(weight?.name).toBe('Leo Fernandes')
  })

  it('turns the device count into a Trusted device profile, and makes a zone for the contractor network', () => {
    expect(policyFor('servicenow').leftOut.map((l) => l.before)).toEqual([])
    const fp = plan().profiles
    expect(fp.map((p) => [p.mode, p.maxDevices, p.fromOld])).toEqual([['device', 2, 'waiting']])
    const z = plan().zones
    expect(z.map((x) => x.name)).toEqual(['Contractor network'])
    expect(z[0].ip).toEqual(['203.0.113.0/24'])
  })

  it('reuses the India zone rather than making a second one', () => {
    const sf = policyFor('salesforce')
    expect(sf.moves.some((m) => m.after === 'Uses your India zone')).toBe(true)
    const finance = sf.policy.rules.find((r) => r.name.startsWith('Finance,'))!
    expect(finance.when.cards[0].conditions[0]).toMatchObject({ typeId: 'zone', operator: 'not in zone', values: ['india'], scopes: { india: 'location' } })
  })

  it('splits working hours into two ways to fail: outside the hours, or on a day off', () => {
    const sales = policyFor('salesforce').policy.rules.find((r) => r.name.startsWith('Sales,'))!
    expect(sales.when.cards.map((k) => k.conditions[0].typeId)).toEqual(['time', 'day'])
    expect(sales.when.cards[1].conditions[0].values).toEqual(['Saturday', 'Sunday'])
    expect(sales.decision).toBe('2fa')
  })

  it('carries over remember, force and turn-off settings', () => {
    const wd = policyFor('workday').policy.fallback!
    expect(wd).toMatchObject({ rememberMfa: true, rememberDays: 30, allowDisable2fa: true, secondFactor: 'any' })
    const contractors = policyFor('servicenow').policy.rules[1]
    expect(contractors).toMatchObject({ forceMfaEachLogin: true, secondFactor: 'specific', secondFactorMethods: ['OTP over SMS'] })
  })

  it('offers Workday and Zoom as one policy, and merges them when taken', () => {
    const offers = mergeOffers(movable, ctx)
    expect(offers).toEqual([{ key: 'workday+zoom', appIds: ['workday', 'zoom'] }])
    const merged = plan(['workday+zoom'])
    expect(merged.policies.filter((p) => !p.into)).toHaveLength(3)
    expect(policyFor('zoom', ['workday+zoom']).policy).toMatchObject({ name: 'Workday and Zoom sign-in', appIds: ['workday', 'zoom'] })
  })
})

describe('Old policies: the deadline', () => {
  it('counts whole days to Aug 31, 2027 and never below zero', () => {
    expect(daysLeft(new Date(2026, 10, 3, 23, 0))).toBe(301)
    expect(daysLeft(new Date(2027, 7, 31))).toBe(0)
    expect(daysLeft(new Date(2027, 9, 1))).toBe(0)
  })

  it('counts down in calendar months and days, and the window fills from release to close', () => {
    expect(countdown(new Date(2026, 10, 3, 18, 0))).toEqual({ months: 9, days: 27, hours: 6, minutes: 0 })
    expect(countdown(new Date(2027, 7, 31, 1, 0))).toEqual({ months: 0, days: 0, hours: 0, minutes: 0 })
    expect(windowGone(new Date(2026, 10, 3))).toBe(0)
    expect(windowGone(new Date(2027, 7, 31))).toBe(1)
  })

  it('turns amber from 60 days and red in the last 14', () => {
    expect([92, 61, 60, 15, 14, 0].map(urgencyOf)).toEqual(['info', 'info', 'notice', 'notice', 'negative', 'negative'])
  })
})
