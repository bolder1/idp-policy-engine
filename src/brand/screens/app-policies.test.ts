import { describe, expect, it } from 'vitest'

import { apps, blankPolicy, coversEveryApp, policies, type Policy, type Rule } from '../data'
import { appsAt, policiesAt, type Depth } from '../fixtures'
import {
  attachKind,
  attachTo,
  attachableTo,
  decidesFor,
  detachFrom,
  orderOf,
  policiesForApp,
  protectionOf,
  summarise,
  whyNotDeciding,
} from './app-policies'

/* -----------------------------------------------------------------------------
   The property this file holds: an application's protection is read from the
   policies themselves, and reading it can never invent, lose or reorder one.

   Two claims carry most of the weight.

   The first is that "has no application" and "is the tenant default" are
   DIFFERENT FACTS. Both look like a missing `appId`. One is a draft somebody
   started; the other is the fall-through that covers everything by being the
   system policy. Anything that conflates them offers to attach the
   fall-through to Salesforce, which would be a serious thing to get wrong
   quietly.

   The second is that a precedence number has to be EARNED. The panel numbers
   the policies that decide a sign-in; the coverage grid draws a cell under the
   same condition. Those two tests are written once, in `decidesFor`, precisely
   so this file can pin them together — a screen that numbers a switched-off
   policy 2 of 3 while the grid leaves its column blank makes one of the two a
   liar, and there is no way to tell from either screen which.
   -------------------------------------------------------------------------- */

const DEPTHS: Depth[] = ['none', 'small', 'medium', 'large']

let n = 0
const ruleOf = (enabled: boolean): Rule =>
  ({ id: `r${++n}`, name: 'r', enabled, decision: '1fa', when: { cards: [] }, matchEstimate: 0 }) as unknown as Rule

function policy(over: Partial<Policy> = {}): Policy {
  return {
    id: `p${++n}`,
    name: 'A policy',
    type: 'App Access',
    status: 'active',
    lastModified: 'Yesterday',
    modifiedBy: 'Someone',
    audience: { everyone: true, groupIds: [], userIds: [] },
    rules: [ruleOf(true)],
    ...over,
  } as Policy
}

const SYSTEM = policies.find((p) => p.isSystem)!

describe('policiesForApp', () => {
  it('returns every match in store order, not the first', () => {
    /* Four policies really do name Google Workspace, and they are the
       document's Scenario 5: one per group — Admin, DevOps, End-Users — plus
       the application's own baseline. The relation is one-app-to-many-policies
       and a screen that showed only the first would be hiding three sets of
       rules that decide sign-ins. */
    const on = policiesForApp('google-workspace', policiesAt('medium'))
    expect(on.length).toBe(4)
    expect(on.map((p) => p.id)).toEqual(['s5-admin', 's5-devops', 's5-endusers', 's5-baseline'])
  })

  it('returns an array, never undefined, for an app nothing names', () => {
    expect(policiesForApp('zoom', policiesAt('medium'))).toEqual([])
    expect(policiesForApp('servicenow', policiesAt('medium'))).toEqual([])
  })

  it('never returns an unattached policy', () => {
    expect(
      policiesForApp('google-workspace', policiesAt('medium')).every((p) => p.appIds.includes('google-workspace')),
    ).toBe(true)
  })

  it('never returns the system policy, though it covers every app', () => {
    expect(coversEveryApp(SYSTEM)).toBe(true)
    for (const a of apps) {
      expect(policiesForApp(a.id, policiesAt('medium')).some((p) => p.isSystem)).toBe(false)
    }
  })
})

describe('protectionOf', () => {
  it('finds the tenant default by coversEveryApp and keeps it out of own', () => {
    const got = protectionOf('workday', policiesAt('medium'))
    expect(got.fallback?.id).toBe('global-default')
    expect(got.own.some((p) => p.isSystem)).toBe(false)
  })

  it('reports an unprotected app as own-empty with the fallback still there', () => {
    const got = protectionOf('zoom', policiesAt('medium'))
    expect(got.own).toEqual([])
    expect(got.decides).toEqual([])
    expect(got.fallback?.id).toBe('global-default')
  })
})

describe('a draft', () => {
  it('decides nothing, however many enabled rules it has', () => {
    /* It gets this from `enforces`, which names the statuses that DO act — so
       a status that does not act needs no entry anywhere. This pins that the
       free behaviour is the right behaviour. */
    expect(decidesFor(policy({ status: 'draft', rules: [ruleOf(true), ruleOf(true)] }))).toBe(false)
  })

  it('is reported as unpublished, not as switched off', () => {
    // Telling somebody they switched off a thing they never published is the
    // kind of small lie that costs a screen its credibility.
    expect(whyNotDeciding(policy({ status: 'draft' }))).toBe('Still a draft — it has never decided a sign-in.')
    expect(whyNotDeciding(policy({ status: 'inactive' }))).toBe('Switched off — skipped.')
  })

  it('is what a new policy starts as', () => {
    expect(blankPolicy('New one', ['workday']).status).toBe('draft')
  })

  it('takes no precedence number, and does not push the ones below it down', () => {
    expect(orderOf([policy({ status: 'draft' }), policy(), policy({ status: 'draft' }), policy()])).toEqual([
      null, 1, null, 2,
    ])
  })
})

describe('decidesFor', () => {
  it('is false for a monitor policy however many rules it has', () => {
    expect(decidesFor(policy({ status: 'monitor', rules: [ruleOf(true), ruleOf(true)] }))).toBe(false)
  })

  it('is false for an active policy with no rules at all', () => {
    expect(decidesFor(policy({ rules: [] }))).toBe(false)
  })

  it('is false for an active policy whose every rule is switched off', () => {
    expect(decidesFor(policy({ rules: [ruleOf(false), ruleOf(false)] }))).toBe(false)
  })

  it('is true for an active policy with one enabled rule', () => {
    expect(decidesFor(policy({ rules: [ruleOf(false), ruleOf(true)] }))).toBe(true)
  })

  it('is true for the always-on system policy', () => {
    expect(decidesFor(SYSTEM)).toBe(true)
  })
})

describe('orderOf', () => {
  it('numbers only the rows that decide, and does not renumber around them', () => {
    const rows = [policy(), policy({ status: 'inactive' }), policy()]
    expect(orderOf(rows)).toEqual([1, null, 2])
  })

  it('gives no number to an active policy with nothing enabled', () => {
    // The assertion that keeps this screen and the coverage grid in agreement:
    // both ask `enforces AND an enabled rule`, so neither can count a policy
    // the other ignores.
    expect(orderOf([policy({ rules: [ruleOf(false)] }), policy()])).toEqual([null, 1])
  })

  it('returns one entry per input row', () => {
    const rows = [policy(), policy({ status: 'monitor' }), policy(), policy({ status: 'inactive' })]
    expect(orderOf(rows).length).toBe(rows.length)
  })
})

describe('whyNotDeciding', () => {
  it('is null for a policy that does decide', () => {
    expect(whyNotDeciding(policy())).toBeNull()
  })

  it('reports switched-off first when a policy is both off and empty', () => {
    // Precedence, not a set. Being switched off explains the rest and is the
    // only one of the two worth acting on first.
    expect(whyNotDeciding(policy({ status: 'inactive', rules: [] }))).toBe('Switched off — skipped.')
  })

  it('distinguishes watching from deciding', () => {
    expect(whyNotDeciding(policy({ status: 'monitor' }))).toBe('Records what it would have done. Decides nothing.')
  })

  it('names an empty rule list as the reason when the policy is otherwise live', () => {
    expect(whyNotDeciding(policy({ rules: [ruleOf(false)] }))).toBe(
      'No rules enabled — every sign-in falls straight through.',
    )
  })
})

describe('attachKind', () => {
  it('calls the real tenant default system, not fresh', () => {
    /* The reason this module exists. `global-default` has no `appId`, so a
       check that asks about `appId` before `isSystem` classifies the
       fall-through as an unattached draft and offers to attach it to one
       application — which would turn the policy that catches everything into a
       policy that catches Salesforce. */
    expect(SYSTEM.appIds).toEqual([])
    expect(attachKind(SYSTEM, 'salesforce')).toBe('system')
  })

  it('separates fresh, already-here and also', () => {
    expect(attachKind(policy({ appIds: [] }), 'workday')).toBe('fresh')
    expect(attachKind(policy({ appIds: ['workday'] }), 'workday')).toBe('already-here')
    /* `also`, not `move`. A policy on Slack gains Workday rather than being
       taken off Slack, which is the whole of what the list changed here. */
    expect(attachKind(policy({ appIds: ['slack'] }), 'workday')).toBe('also')
  })

  it('is already-here when the app is one of several', () => {
    // The `includes` case: a policy on three applications is already on each of
    // them, not on the first and moveable to the rest.
    expect(attachKind(policy({ appIds: ['slack', 'workday', 'jira'] }), 'workday')).toBe('already-here')
  })
})

describe('attachableTo', () => {
  it('excludes the real system policy', () => {
    expect(attachableTo('salesforce', policiesAt('medium')).some((p) => p.isSystem)).toBe(false)
  })

  it('excludes policies already on this app and includes ones on another', () => {
    const got = attachableTo('google-workspace', policiesAt('medium')).map((p) => p.id)
    expect(got).not.toContain('s5-admin')
    expect(got).toContain('uc3-country-allowlist')
  })

  it('sorts the unassigned above the ones already protecting something', () => {
    const got = attachableTo('google-workspace', policiesAt('medium'))
    const firstAlso = got.findIndex((p) => p.appIds.length > 0)
    const lastFresh = got.map((p) => p.appIds.length === 0).lastIndexOf(true)
    expect(lastFresh).toBeLessThan(firstAlso)
  })

  it('offers the unattached policy to an app nothing protects', () => {
    const got = attachableTo('zoom', policiesAt('medium')).map((p) => p.id)
    /* The break-glass policy is the estate's only unattached one now — the
       document asks it to cover every application and the model has no such
       policy, so it sits with no app at all, as a draft. That is what makes it
       the thing an app with nothing on it is offered first. */
    expect(got).toContain('break-glass')
    expect(got).not.toContain('global-default')
  })
})

describe('attachTo', () => {
  it('does not mutate its input', () => {
    const before = policy({ appIds: [] })
    attachTo(before, 'workday', apps)
    expect(before.appIds).toEqual([])
  })

  it('changes appIds and nothing else a policy is judged by', () => {
    const before = policy({ appIds: [], status: 'inactive', rules: [ruleOf(true), ruleOf(false)] })
    const after = attachTo(before, 'workday', apps)
    expect(after).toEqual({ ...before, appIds: ['workday'] })
  })

  it('leaves the timestamp to whoever saves it', () => {
    const before = policy({ appIds: [], lastModified: 'Three weeks ago', modifiedBy: 'Priya' })
    const after = attachTo(before, 'jira', apps)
    expect(after.lastModified).toBe('Three weeks ago')
    expect(after.modifiedBy).toBe('Priya')
  })

  it('never switches a policy on', () => {
    expect(attachTo(policy({ appIds: [], status: 'inactive' }), 'jira', apps).status).toBe('inactive')
  })

  it('does not publish a draft it has just given an application to', () => {
    /* The counterpart to `detachFrom`'s demotion, and the reason the pair is
       not symmetric. An application is one of the things a draft was missing,
       not evidence that it is finished — promoting here would publish a policy
       because a picker was used. */
    expect(attachTo(policy({ appIds: [], status: 'draft' }), 'box', apps).status).toBe('draft')
  })

  it('adds rather than replaces, which is the whole change', () => {
    expect(attachTo(policy({ appIds: ['slack'] }), 'workday', apps).appIds).toEqual(['slack', 'workday'])
  })

  it('is a no-op on an application it already has', () => {
    // A list that could hold a duplicate would draw it twice and let one
    // removal leave the other behind.
    const before = policy({ appIds: ['workday'] })
    expect(attachTo(before, 'workday', apps)).toBe(before)
  })

  it('refuses an application the tenant does not have', () => {
    /* `store.appById` resolves an unknown id to `apps[0]`, so without this the
       bad write renders as Salesforce on six surfaces instead of failing. */
    expect(() => attachTo(policy(), 'not-an-app', apps)).toThrow(/not-an-app/)
  })

  it('keeps no record of where a moved policy came from', () => {
    // Documenting that the model has nowhere to put one: a policy has an
    // application, not a history of applications.
    const after = attachTo(policy({ appIds: ['slack'] }), 'workday', apps)
    expect(Object.keys(after).filter((k) => /previous|prior|was/i.test(k))).toEqual([])
    expect(after.appIds).toEqual(['slack', 'workday'])
  })
})

describe('detachFrom', () => {
  it('removes the one it is given, leaving an empty list', () => {
    const after = detachFrom(policy({ appIds: ['workday'] }), 'workday')
    expect(after.appIds).toEqual([])
  })

  it('removes only the one it is given', () => {
    /* The reason this takes an argument now. Removing GitHub from a policy that
       also protects AWS must leave AWS alone — the old signature could only
       empty the policy, which would have switched off enforcement on an
       application nobody touched. */
    const after = detachFrom(policy({ appIds: ['github', 'aws'], status: 'active' }), 'github')
    expect(after.appIds).toEqual(['aws'])
  })

  it('does not demote while an application is left', () => {
    expect(detachFrom(policy({ appIds: ['github', 'aws'], status: 'active' }), 'github').status).toBe('active')
  })

  it('ignores an application the policy does not have', () => {
    const before = policy({ appIds: ['github'], status: 'active' })
    const after = detachFrom(before, 'aws')
    expect(after.appIds).toEqual(['github'])
    expect(after.status).toBe('active')
  })

  it('sends the policy back to a draft rather than leaving it on with no app', () => {
    /* The state this replaces — active, no application, a warning hung off it —
       is not one the product has. A policy missing something it needs before it
       can be published is a draft, and nothing else. */
    const after = detachFrom(policy({ appIds: ['workday'], status: 'active' }), 'workday')
    expect(after.status).toBe('draft')
  })

  it('demotes an always-on policy too', () => {
    // The one status that would otherwise keep enforcing with nothing to enforce on.
    expect(detachFrom(policy({ appIds: ['workday'], status: 'always-on' }), 'workday').status).toBe('draft')
  })

  it('refuses the tenant default', () => {
    expect(() => detachFrom(SYSTEM, 'salesforce')).toThrow()
  })

  it('round-trips the application back, but does not republish', () => {
    /* Deliberately lossy in one field, and it is the field that decides
       sign-ins. Re-attaching restores the application; turning the policy back
       on is a decision an administrator makes, not one a round trip makes for
       them. */
    const before = policy({ appIds: ['workday'], status: 'active' })
    const round = attachTo(detachFrom(before, 'workday'), 'workday', apps)
    expect(round).toEqual({ ...before, status: 'draft' })
  })
})

describe('summarise', () => {
  it('says an app nothing names is not protected', () => {
    const s = summarise('zoom', policiesAt('medium'))
    expect(s).toMatchObject({ own: 0, decides: 0, label: 'Not protected', tag: null, tone: 'off' })
  })

  /* On a local fixture, not the estate.

     It read the seeds for an app with exactly one inactive policy on it, and
     the estate this console is reasoned about with no longer has one: every
     policy in the use-case document is written to be in force, and the single
     exception is in monitor rather than off. Rather than switch a scenario to
     `inactive` so a unit test can find it — inventing configuration to satisfy
     an assertion — this states the same property about a policy it makes
     itself. The estate-coupled assertions above are the ones that have to read
     the real seeds; this one never did. */
  it('marks one attached-but-inactive policy off rather than protected', () => {
    const s = summarise('workday', [policy({ appIds: ['workday'], status: 'inactive' })])
    expect(s.own).toBe(1)
    expect(s.decides).toBe(0)
    expect(s.tag).toBe('Off')
    expect(s.tone).toBe('off')
  })

  it('names the shortfall when some of several do not decide', () => {
    const list = [
      policy({ appIds: ['workday'] }),
      policy({ appIds: ['workday'], status: 'inactive' }),
      policy({ appIds: ['workday'] }),
    ]
    expect(summarise('workday', list)).toMatchObject({
      own: 3,
      decides: 2,
      label: '3 policies',
      tag: '1 not deciding',
      tone: 'part',
    })
  })

  it('carries no qualification when everything attached decides', () => {
    const s = summarise('workday', [policy({ appIds: ['workday'] }), policy({ appIds: ['workday'] })])
    expect(s).toMatchObject({ label: '2 policies', tag: null, tone: 'on' })
  })

  it('counts a monitor policy as attached but not deciding', () => {
    /* The M&A onboarding policy watches Document Management and refuses
       nothing — it is the document's Scenario 15, deliberately in monitor while
       an acquired company's devices migrate. A cell reading "1 policy" with no
       qualification would overstate the tenant's cover. */
    const s = summarise('dms', policiesAt('medium'))
    expect(s.own).toBe(1)
    expect(s.decides).toBe(0)
    expect(s.tone).toBe('off')
  })
})

describe('the fixtures themselves', () => {
  it('never attach a policy to an application the tenant does not have', () => {
    /* `policiesAt('small')` rewrites `appId` to undefined when the app is not
       in that depth's list, which is the only place this is enforced. Pinning
       it at every depth is what stops the Applications screen becoming the
       thing that breaks it. */
    for (const d of DEPTHS) {
      const ids = new Set(appsAt(d).map((a) => a.id))
      for (const p of policiesAt(d)) {
        for (const appId of p.appIds) {
          expect(`${d}:${p.id}:${appId}`).toBe(`${d}:${p.id}:${ids.has(appId) ? appId : 'MISSING'}`)
        }
      }
    }
  })

  it('keep coversEveryApp and isSystem saying the same thing', () => {
    for (const d of DEPTHS) {
      for (const p of policiesAt(d)) expect(coversEveryApp(p)).toBe(p.isSystem === true)
    }
  })

  it('give every application a type and a formatted timestamp', () => {
    for (const a of apps) {
      expect(a.type).toMatch(/^(SAML\/WS-FED|OAuth\/OpenID|Desktop)$/)
      // MMM DD, YYYY, HH:MM:SS — the shape the live page prints.
      expect(a.lastUpdated).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4}, \d{2}:\d{2}:\d{2}$/)
    }
  })
})
