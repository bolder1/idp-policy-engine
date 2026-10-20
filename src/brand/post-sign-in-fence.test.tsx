/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME, audienceOf, card, cond, conditionType, rule, when, UNKNOWN_CONDITION, type Policy } from './data'
import { refusesStatus, settled, showcaseTenant } from './fixtures'
import { leaves } from './predicate'
import { eventsFor, isPostSignIn, linkApp, linkedTo, postSignInRefuses, settledPostSignIn, setupOf, turnOnIssue, unlinkApp } from './post-sign-in'
import { BrandProvider } from './store'
import { AddExistingPolicy } from './screens/AddExistingPolicy'
import { attachableTo, policiesForApp, protectionOf, summarise } from './screens/app-policies'
import { appStanding, deciderForGroup, deciderForUser } from './screens/app-standing'
import { SAMPLE_DAY } from './screens/monitor-sample'
import { signInActivity } from './screens/sign-in-tests/activity'
import { engineRun } from './screens/sign-in-tests/engine-run'
import { policiesForPerson, policiesOnApp, usedByPolicies } from './screens/sign-in-tests/peek-model'
import { emptyDraft } from './screens/sign-in-tests/sign-in-card'
import { rowMenu, statusConfirmCopy, statusOptions } from './screens/status-options'
import { deciderFor, envOf, governingPolicy, resolveSignIn } from './screens/tenant-resolver'
import { rowsRead } from './screens/testing/rows-read'
import { TestingSessionProvider } from './screens/testing/session'
import { factsOf } from './screens/testing/sign-in-form'
import coverageSrc from './screens/Coverage.tsx?raw'
import statusChangeSrc from './screens/use-status-change.tsx?raw'

/* -----------------------------------------------------------------------------
   The fence around post sign-in policies (owner, 13 Oct 2026; spec
   POST-SIGN-IN-POLICIES.md): "kept apart". A post sign-in policy is built in
   the board, as a sign-in policy is, with real rules — Who / If / Then, the If
   naming zones and post sign-in conditions — and it is still never part of the
   sign-in engine, Access checks, an application's Policies tab, Add existing
   policy, the Apps list's Protection cell or Sign-in activity: not even when an
   application is linked to it, with its events, from outside.

   Each surface is asked the same question twice — with a tenant holding the
   seeded post sign-in policies and a louder one of this test's own, and with
   them all taken out — and must give the same answer. Then the seed itself,
   and the status rules: independent of applications, so on with none linked;
   on only when complete; never Monitoring.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const people = t.directory.people
const signInOnly = t.policies.filter((p) => !isPostSignIn(p))
const post = t.policies.filter(isPostSignIn)
const byId = (id: string) => t.policies.find((p) => p.id === id)!
const dataExport = byId('ps-data-export')
const collab = byId('ps-collab')
const APPS = ['salesforce', 'workday', 'slack', 'github']
const ALL_APPS = [...APPS, 'hrms', 'outlook']

/* The strongest stand-in: live and complete, first in the list, for a custom
   group, linked to two more applications, with a rule whose Who names that
   group — the place and tier that would win a sign-in if the engine let it race. */
const sales: Policy = {
  ...linkApp(linkApp({ ...dataExport, id: 'ps-first', name: 'Sales first' }, 'hrms', ['ip-change', 'risk-change']), 'outlook', ['ms-download']),
  audience: audienceOf(['sales']),
  rules: [rule({ name: 'Sales', who: { groupIds: ['sales'], userIds: [] }, when: when(card(cond('zone', 'in zone', ['corp-offices']))), action: 'deny' }), ...dataExport.rules],
}
const loud: Policy[] = [sales, ...t.policies]
const POST_IDS = new Set([...post.map((p) => p.id), sales.id])

/* The post sign-in conditions the seed uses, as the catalogue contract
   (13 Oct 2026) writes them: numbers as one numeric string, above or below;
   lists as option strings, is or is not. The zone is the catalogue's own. */
const CONTRACT: Record<string, { valueKind: string; operators: string[]; options?: string[] }> = {
  records: { valueKind: 'number', operators: ['above', 'below'] },
  label: { valueKind: 'list', operators: ['is', 'is not'], options: ['Public', 'Internal', 'Confidential', 'Restricted'] },
  'user-risk': { valueKind: 'list', operators: ['is', 'is not'], options: ['Low', 'Medium', 'High'] },
  'device-compliance': { valueKind: 'list', operators: ['is', 'is not'], options: ['Compliant', 'Not compliant'] },
  zone: { valueKind: 'zone', operators: ['in zone', 'not in zone'] },
}

const conditionsOf = (p: Policy) => p.rules.flatMap((r) => leaves(r.when))
const said = (p: Policy) => p.rules.map((r) => [r.name, r.action, leaves(r.when).map((c) => [c.typeId, c.operator, c.values])])

describe('the showcase seed', () => {
  it('holds the two post sign-in policies after every sign-in policy', () => {
    expect(post.map((p) => [p.id, p.name, p.status])).toEqual([
      ['ps-data-export', 'Data export protection', 'active'],
      ['ps-collab', 'Collaboration tools', 'draft'],
    ])
    expect(t.policies.slice(-2).map((p) => p.id)).toEqual(['ps-data-export', 'ps-collab'])
    for (const p of post) {
      expect(p.type, p.id).toBe('Session')
      expect(p.audience.everyone, p.id).toBe(true)
      expect(p.fallback?.name, p.id).toBe(FALLBACK_NAME)
    }
  })

  it('has the live one complete: four rules with their actions, then Allow on Nothing else matched', () => {
    expect(said(dataExport)).toEqual([
      ['Large export', 'deny', [['records', 'above', ['1000']]]],
      ['Confidential file', 'step-up', [['label', 'is', ['Confidential']]]],
      ['High risk', 'terminate', [['user-risk', 'is', ['High']]]],
      ['Non-compliant device', 'block-device', [['device-compliance', 'is', ['Not compliant']]]],
    ])
    expect(dataExport.rules.every((r) => r.enabled && !r.who)).toBe(true)
    expect(dataExport.fallback?.action).toBe('allow')
    expect(turnOnIssue(dataExport)).toBeNull()
  })

  it('links the live one to Salesforce, then Workday, each with its events in catalogue order', () => {
    expect(setupOf(dataExport).links).toEqual([
      { appId: 'salesforce', eventIds: ['sf-report-export', 'sf-api-query', 'sf-file-download', 'device-compliance', 'risk-change'] },
      { appId: 'workday', eventIds: ['wd-bank', 'wd-export'] },
    ])
    expect(dataExport.appIds).toEqual(['salesforce', 'workday'])
  })

  it('leaves the draft with no action on Nothing else matched, so the board says so', () => {
    expect(said(collab)).toEqual([['Outside the office', 'step-up', [['zone', 'not in zone', ['corp-offices']]]]])
    expect(collab.fallback?.action).toBeUndefined()
    expect(turnOnIssue(collab)).toBe('Choose an action for Nothing else matched.')
    expect(setupOf(collab).links).toEqual([
      { appId: 'slack', eventIds: ['sl-download', 'sl-external-invite'] },
      { appId: 'github', eventIds: ['gh-token'] },
    ])
    expect(collab.appIds).toEqual(['slack', 'github'])
  })

  it('writes every condition as the catalogue contract does, with values it offers and zones the tenant has', () => {
    const zoneIds = new Set(t.zones.map((z) => z.id))
    for (const p of post) {
      for (const c of conditionsOf(p)) {
        const want = CONTRACT[c.typeId]
        expect(want, `${p.id} ${c.typeId}`).toBeDefined()
        expect(want.operators, `${p.id} ${c.typeId}`).toContain(c.operator)
        if (want.valueKind === 'number') expect(c.values, `${p.id} ${c.typeId}`).toEqual([expect.stringMatching(/^\d+$/)])
        if (want.options) for (const v of c.values) expect(want.options, `${p.id} ${c.typeId}`).toContain(v)
        if (want.valueKind === 'zone') for (const v of c.values) expect(zoneIds.has(v), `${p.id} ${v}`).toBe(true)
      }
    }
  })

  /* The board reads the catalogue, so the seed must open there with every
     condition named and offered on this type: a post sign-in one or one both
     types share, never one only a sign-in asks. */
  it('names only conditions the catalogue offers on a post sign-in policy', () => {
    for (const p of post) {
      for (const c of conditionsOf(p)) {
        const def = conditionType(c.typeId)
        expect(def, `${p.id} ${c.typeId}`).not.toBe(UNKNOWN_CONDITION)
        expect(def.valueKind, `${p.id} ${c.typeId}`).toBe(CONTRACT[c.typeId].valueKind)
        expect(def.operators, `${p.id} ${c.typeId}`).toEqual(CONTRACT[c.typeId].operators)
        if (CONTRACT[c.typeId].options) expect(def.options, `${p.id} ${c.typeId}`).toEqual(CONTRACT[c.typeId].options)
        expect(def.phase, `${p.id} ${c.typeId}`).not.toBe('sign-in')
      }
    }
  })

  it('links only events the catalogue has, and no event to two policies', () => {
    for (const p of post) for (const l of setupOf(p).links) for (const id of l.eventIds) expect(eventsFor(l.appId).some((e) => e.id === id), `${p.id} ${l.appId} ${id}`).toBe(true)
    for (const appId of APPS) {
      const ids = linkedTo(appId, t.policies).flatMap((l) => l.eventIds)
      expect(new Set(ids).size, appId).toBe(ids.length)
    }
  })

  it('gives every rule, card and condition an id no other in the tenant has', () => {
    const rules = t.policies.flatMap((p) => [...p.rules, ...(p.fallback ? [p.fallback] : [])])
    const ruleIds = rules.map((r) => r.id)
    expect(new Set(ruleIds).size).toBe(ruleIds.length)
    const condIds = rules.flatMap((r) => leaves(r.when).map((c) => c.id))
    expect(new Set(condIds).size).toBe(condIds.length)
    const cardIds = rules.flatMap((r) => r.when.cards.map((k) => k.id))
    expect(new Set(cardIds).size).toBe(cardIds.length)
  })
})

describe('the sign-in engine', () => {
  it('gives a post sign-in policy no standing at all, not even "not an app access policy"', () => {
    for (const appId of ALL_APPS) {
      const facts = { appId, personId: 'u-sales-1' }
      const r = resolveSignIn(loud, facts, env)
      expect(r.standings.some((s) => POST_IDS.has(s.policyId)), appId).toBe(false)
      expect(r, appId).toEqual(resolveSignIn(signInOnly, facts, env))
      expect(governingPolicy(loud, facts, env).decider?.id, appId).toBe(governingPolicy(signInOnly, facts, env).decider?.id)
    }
  })

  it('never lets one decide for a person or a group on an application linked to it', () => {
    for (const appId of ALL_APPS) {
      for (const u of people) {
        expect(deciderForUser(loud, appId, u)?.id, `${appId} ${u.id}`).toBe(deciderForUser(signInOnly, appId, u)?.id)
        expect(deciderFor(loud, appId, u)?.id, `${appId} ${u.id}`).toBe(deciderFor(signInOnly, appId, u)?.id)
      }
      for (const g of [null, ...t.groups.map((x) => x.id)]) expect(deciderForGroup(loud, appId, g)?.id).toBe(deciderForGroup(signInOnly, appId, g)?.id)
    }
  })
})

describe("an application's Policies tab and the Apps list", () => {
  it('lists none on a linked application, not even as one that never decides', () => {
    for (const appId of ALL_APPS) {
      expect(policiesForApp(appId, loud).some(isPostSignIn), appId).toBe(false)
      expect(appStanding(appId, loud, people), appId).toEqual(appStanding(appId, signInOnly, people))
      expect(protectionOf(appId, loud), appId).toEqual(protectionOf(appId, signInOnly))
    }
  })

  it('leaves the Protection cell as it is without them', () => {
    for (const appId of ALL_APPS) expect(summarise(appId, loud, people), appId).toEqual(summarise(appId, signInOnly, people))
  })

  it('never offers one in Add existing policy', () => {
    for (const appId of ['hrms', 'aws', ...APPS]) expect(attachableTo(appId, loud).some(isPostSignIn), appId).toBe(false)
    /* Unlinked too: a post sign-in policy linked to nothing is still not a sign-in policy to add. */
    expect(attachableTo('box', [unlinkApp(unlinkApp(collab, 'slack'), 'github'), ...signInOnly]).some(isPostSignIn)).toBe(false)
    const out = renderToStaticMarkup(
      <BrandProvider>
        <TestingSessionProvider>
          <AddExistingPolicy open app={t.apps.find((a) => a.id === 'slack')!} onClose={() => {}} onAdd={() => true} onCopy={() => true} />
        </TestingSessionProvider>
      </BrandProvider>,
    )
    expect(out).toContain('Slack access')
    expect(out).not.toContain('Collaboration tools')
    expect(out).not.toContain('Data export protection')
  })

  it('is never cover on the Coverage grid', () => {
    expect(coverageSrc).toContain('if (!enforces(p) || isPostSignIn(p)) return null')
  })
})

describe('Access checks', () => {
  it("leaves them out of the inspector's lists for an application, a person and a zone its rules name", () => {
    for (const appId of ALL_APPS) expect(policiesOnApp(loud, appId).some(isPostSignIn), appId).toBe(false)
    for (const u of people) expect(policiesForPerson(loud, u).some(isPostSignIn), u.id).toBe(false)
    /* Both name the corporate offices zone in a rule; neither is a sign-in rule using it. */
    expect(conditionsOf(collab).some((c) => c.values.includes('corp-offices'))).toBe(true)
    const zone = { kind: 'zone' as const, id: 'corp-offices' }
    expect(usedByPolicies(loud, zone, t.activeRiskProfileId, people).some(isPostSignIn)).toBe(false)
    expect(usedByPolicies(loud, zone, t.activeRiskProfileId, people)).toEqual(usedByPolicies(signInOnly, zone, t.activeRiskProfileId, people))
  })

  it('runs the engine past them: no policy row, no rule read, the same outcome', () => {
    for (const appId of ALL_APPS) {
      const f = { ...emptyDraft('2026-09-28', '09:30'), appId, personId: 'u-sales-1' }
      const { facts } = factsOf(f, t.zones)
      const runOf = (list: Policy[]) => {
        const res = resolveSignIn(list, facts, env)
        const rows = rowsRead(list, null, appId, { zones: t.zones, fingerprints: t.fingerprints })
        return engineRun({ res, policies: list, form: f, facts, env, ctx: { people, apps: t.apps, zones: t.zones, rows } })
      }
      const run = runOf(loud)
      expect(run.policies.some((p) => POST_IDS.has(p.policyId)), appId).toBe(false)
      expect(run.summary, appId).toBe(runOf(signInOnly).summary)
      expect(rowsRead(loud, null, appId, { zones: t.zones, fingerprints: t.fingerprints }), appId).toEqual(rowsRead(signInOnly, null, appId, { zones: t.zones, fingerprints: t.fingerprints }))
    }
  })

  it('leaves Sign-in activity as it is without them', () => {
    const apps = t.apps.filter((a) => ALL_APPS.includes(a.id))
    const rows = signInActivity(loud, env, SAMPLE_DAY, apps)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.policyName !== null && [...post, sales].some((p) => p.name === r.policyName))).toBe(false)
    expect(rows).toEqual(signInActivity(signInOnly, env, SAMPLE_DAY, apps))
  })
})

describe('turning one on and off', () => {
  const unlinked = { ...unlinkApp(unlinkApp(dataExport, 'salesforce'), 'workday'), status: 'inactive' as const }
  const openRule = rule({ name: 'Idle', when: when(card(cond('idle-time', 'above', ['30']))) })

  it('is independent of applications: complete and linked to none, it may be on', () => {
    expect(unlinked.appIds).toEqual([])
    expect(turnOnIssue(unlinked)).toBeNull()
    expect(refusesStatus(unlinked, 'active')).toBe(false)
    expect(settled({ ...unlinked, status: 'active' }).status).toBe('active')
    expect(settled(unlinked).status).toBe('inactive')
    /* A sign-in policy with no application is still refused, and stored as a draft. */
    const bare = { ...byId('sc-dev-tools'), appIds: [] }
    expect(refusesStatus(bare, 'active')).toBe(true)
    expect(settled(bare).status).toBe('draft')
  })

  it('refuses on, or off, until every rule and Nothing else matched have an action, and allows a draft', () => {
    const withLast = { ...collab, fallback: { ...collab.fallback!, action: 'allow' as const } }
    for (const refuses of [postSignInRefuses, refusesStatus]) {
      expect(refuses(collab, 'active')).toBe(true)
      expect(refuses(collab, 'inactive')).toBe(true)
      expect(refuses(collab, 'draft')).toBe(false)
      expect(refuses({ ...dataExport, status: 'inactive' }, 'active')).toBe(false)
      expect(refuses({ ...dataExport, rules: [...dataExport.rules, openRule] }, 'active')).toBe(true)
      expect(refuses(withLast, 'active')).toBe(false)
    }
    /* A rule switched off decides nothing, so it is not asked about. */
    expect(refusesStatus({ ...dataExport, rules: [...dataExport.rules, { ...openRule, enabled: false }] }, 'active')).toBe(false)
    /* A sign-in policy is not the post sign-in guard's business. */
    expect(postSignInRefuses({ ...byId('sc-dev-tools'), appIds: [] }, 'active')).toBe(false)
  })

  it('never lets one be monitored, complete or not', () => {
    expect(refusesStatus(dataExport, 'monitor')).toBe(true)
    expect(refusesStatus(unlinked, 'monitor')).toBe(true)
    expect(refusesStatus(byId('sc-dev-tools'), 'monitor')).toBe(false)
  })

  it('stores one saved on with a rule or Nothing else matched open as a draft, its saved draft as its rules', () => {
    expect(settledPostSignIn({ ...collab, status: 'active' }).status).toBe('draft')
    expect(settled({ ...collab, status: 'inactive' }).status).toBe('draft')
    expect(settledPostSignIn(dataExport)).toBe(dataExport)
    expect(settled(dataExport)).toBe(dataExport)
    const signIn = byId('sc-dev-tools')
    expect(settledPostSignIn(signIn)).toBe(signIn)
    /* Live with an open rule and a saved draft: a draft never carries one, so its rules are the saved draft's. */
    const held = { rules: dataExport.rules.slice(0, 1), fallback: dataExport.fallback, savedAt: 'Just now', savedBy: 'You' }
    const half = settled({ ...dataExport, rules: [openRule], pendingDraft: held })
    expect(half.status).toBe('draft')
    expect(half.pendingDraft).toBeUndefined()
    expect(half.rules).toBe(held.rules)
    /* Complete, its saved draft waits as on a sign-in policy. */
    expect(settled({ ...dataExport, pendingDraft: held }).pendingDraft).toBe(held)
  })

  it('refuses Turn on in a toast in turnOnIssue’s words, before any confirm, and opens the board', () => {
    const branch = statusChangeSrc.slice(statusChangeSrc.indexOf('if (isPostSignIn(policy)) {'), statusChangeSrc.indexOf('let blocker'))
    expect(branch).toContain("const issue = target === 'active' ? turnOnIssue(edits ?? policy) : null")
    expect(branch).toContain("store.showToast(issue, here ? undefined : open, { tone: 'warning' })")
    expect(branch).toContain("store.go({ name: 'board', policyId: policy.id })")
    expect(branch.indexOf('store.showToast(issue')).toBeLessThan(branch.indexOf('setAsk('))
    expect(branch).not.toContain('post-sign-in')
    /* Having no application is no reason here. */
    expect(branch).not.toContain('appIds')
  })

  it("turns on the board's rules with it, in one write", () => {
    const commit = statusChangeSrc.slice(statusChangeSrc.indexOf('const commit = '), statusChangeSrc.indexOf('/* Blocking errors'))
    expect(commit).toContain('if (edits) store.savePolicy({ ...policy, rules: edits.rules, fallback: edits.fallback, pendingDraft: undefined, status: target })')
    expect(commit).toContain('else store.setPolicyStatus(policy.id, target)')
  })

  it('offers Turn on on a draft, and never Monitor', () => {
    expect(statusOptions(collab, { monitor: true }).map((o) => o.label)).toEqual(['Turn on'])
    expect(statusOptions(dataExport, { monitor: true }).map((o) => o.label)).toEqual(['Turn off'])
    expect(statusOptions({ ...dataExport, status: 'inactive' }, { monitor: true }).map((o) => o.label)).toEqual(['Turn on'])
    for (const p of post) for (const status of ['draft', 'active', 'inactive'] as const) expect(statusOptions({ ...p, status }, { monitor: true }).map((o) => o.target)).not.toContain('monitor')
    /* A sign-in draft still offers nothing: it leaves draft through Review and save. */
    expect(statusOptions({ ...byId('sc-dev-tools'), status: 'draft' }, { monitor: true })).toEqual([])
  })

  it("keeps the sign-in items out of its row menu: no trail, Read as text, template or Duplicate", () => {
    expect(rowMenu(dataExport, { monitor: true, trySignIn: true, trail: true }).map((i) => i.id)).toEqual(['edit', 'inactive', 'delete'])
    expect(rowMenu(collab, { monitor: true, trySignIn: true, trail: true }).map((i) => i.id)).toEqual(['edit', 'active', 'delete'])
    expect(rowMenu(byId('sc-dev-tools'), { monitor: true, trySignIn: true, trail: true }).map((i) => i.id)).toContain('duplicate')
  })

  it('says events, not sign-ins, when it asks, with or without applications', () => {
    expect(statusConfirmCopy(collab, 'active', false, 'Slack and GitHub Enterprise')).toEqual({
      title: 'Turn on Collaboration tools?',
      lines: ['It starts acting on events in Slack and GitHub Enterprise.'],
      verb: 'Turn on',
    })
    expect(statusConfirmCopy(dataExport, 'inactive', false, 'Salesforce and Workday').lines).toEqual(['It stops acting on events in Salesforce and Workday.'])
    expect(statusConfirmCopy(unlinked, 'active', false, null).lines).toEqual(['It starts acting on events.'])
  })
})
