import { describe, expect, it } from 'vitest'

import type { Policy, PolicyDraft } from '../data'
import { showcaseTenant } from '../fixtures'
import {
  asksFirst,
  guardFor,
  offersMonitorAfterSave,
  offersMonitoringView,
  rowMenu,
  statusConfirmCopy,
  statusOptions,
  statusToast,
  turnOnExtras,
  watchAfter,
} from './status-options'

const targets = (...args: Parameters<typeof statusOptions>) => statusOptions(...args).map((o) => o.label)

describe('statusOptions', () => {
  it('lists the switches by how much they enforce, leaving out the current status', () => {
    expect(targets({ status: 'active' })).toEqual(['Monitor', 'Turn off'])
    expect(targets({ status: 'inactive' })).toEqual(['Turn on', 'Monitor'])
    expect(targets({ status: 'monitor' })).toEqual(['Turn on', 'Turn off'])
  })

  it('pairs each label with the status it switches to', () => {
    expect(statusOptions({ status: 'active' })).toEqual([
      { target: 'monitor', label: 'Monitor' },
      { target: 'inactive', label: 'Turn off' },
    ])
    expect(statusOptions({ status: 'monitor' })).toEqual([
      { target: 'active', label: 'Turn on' },
      { target: 'inactive', label: 'Turn off' },
    ])
  })

  it('offers nothing for a draft, the always-on status or the system policy', () => {
    expect(statusOptions({ status: 'draft' })).toEqual([])
    expect(statusOptions({ status: 'always-on' })).toEqual([])
    expect(statusOptions({ status: 'active', isSystem: true })).toEqual([])
  })

  it('offers no Monitor where the edition has none', () => {
    expect(targets({ status: 'active' }, { monitor: false })).toEqual(['Turn off'])
    expect(targets({ status: 'inactive' }, { monitor: false })).toEqual(['Turn on'])
  })

  it('offers no Monitor on a policy that decides no sign-in', () => {
    /* Session and Account Management policies have no sign-in decision to watch. */
    expect(targets({ status: 'active', type: 'Session' })).toEqual(['Turn off'])
    expect(targets({ status: 'inactive', type: 'Account Management' })).toEqual(['Turn on'])
  })

  it('still lets a monitoring policy be switched either way when Monitor is withheld', () => {
    expect(targets({ status: 'monitor' }, { monitor: false })).toEqual(['Turn on', 'Turn off'])
  })
})

describe('asksFirst', () => {
  it('asks whenever somebody starts or stops being decided for', () => {
    expect(asksFirst('inactive', 'active', false)).toBe(true)
    expect(asksFirst('monitor', 'active', false)).toBe(true)
    expect(asksFirst('active', 'inactive', false)).toBe(true)
    expect(asksFirst('active', 'monitor', false)).toBe(true)
  })

  it('switches between Inactive and Monitoring at once: nobody is decided for either way', () => {
    expect(asksFirst('inactive', 'monitor', false)).toBe(false)
    expect(asksFirst('monitor', 'inactive', false)).toBe(false)
    expect(asksFirst('monitor', 'inactive', true)).toBe(false)
  })

  it('asks before monitoring when edits or a saved draft are held back from it', () => {
    expect(asksFirst('inactive', 'monitor', true)).toBe(true)
  })
})

describe('statusToast', () => {
  it('names the status the policy is now in', () => {
    expect(statusToast('HRMS', 'inactive', 'active').text).toBe('HRMS is on')
    expect(statusToast('HRMS', 'active', 'inactive').text).toBe('HRMS is off')
    expect(statusToast('HRMS', 'active', 'monitor').text).toBe('HRMS is monitoring')
  })

  it('offers Undo only between Inactive and Monitoring', () => {
    expect(statusToast('HRMS', 'inactive', 'monitor').undo).toBe('inactive')
    expect(statusToast('HRMS', 'monitor', 'inactive').undo).toBe('monitor')
    /* Undo here would restore enforcement without its confirmation. */
    expect(statusToast('HRMS', 'active', 'monitor').undo).toBeNull()
    expect(statusToast('HRMS', 'active', 'inactive').undo).toBeNull()
    expect(statusToast('HRMS', 'monitor', 'active').undo).toBeNull()
    expect(statusToast('HRMS', 'inactive', 'active').undo).toBeNull()
  })
})

describe('statusConfirmCopy', () => {
  const draft: PolicyDraft = { rules: [], savedAt: '25 Sep 2026', savedBy: 'Asha' }
  const hrms = (status: 'active' | 'inactive' | 'monitor', pendingDraft?: PolicyDraft) => ({ name: 'HRMS', status, pendingDraft })

  it('says what starts or stops being decided when turning on or off', () => {
    expect(statusConfirmCopy(hrms('inactive'), 'active', false, 'HRMS')).toEqual({
      title: 'Turn on HRMS?',
      lines: ['It starts deciding sign-ins to HRMS.'],
      verb: 'Turn on',
    })
    expect(statusConfirmCopy(hrms('active'), 'inactive', false, 'HRMS')).toEqual({
      title: 'Turn off HRMS?',
      lines: ['It stops deciding sign-ins to HRMS.'],
      verb: 'Turn off',
    })
  })

  it('tells Turn on that a saved draft is not what turns on', () => {
    expect(statusConfirmCopy(hrms('inactive', draft), 'active', false, 'HRMS').lines).toEqual([
      'It starts deciding sign-ins to HRMS.',
      'Your saved draft is not included.',
    ])
  })

  it('asks Active → Monitoring in the M1 words, and only those', () => {
    const m1 = { title: 'Switch HRMS to monitoring?', lines: ['It stops deciding sign-ins to HRMS and records what it would decide.'], verb: 'Monitor' }
    expect(statusConfirmCopy(hrms('active'), 'monitor', false, 'HRMS')).toEqual(m1)
    /* Spec C §3.3: the held-back line is M2's. M1 says the same with edits or a draft. */
    expect(statusConfirmCopy(hrms('active', draft), 'monitor', true, 'HRMS')).toEqual(m1)
  })

  it('asks Inactive → Monitoring in the M2 words, naming what is held back', () => {
    expect(statusConfirmCopy(hrms('inactive'), 'monitor', true, 'HRMS')).toEqual({
      title: 'Monitor HRMS?',
      lines: ["Sign-ins to HRMS don't change.", 'Your unsaved changes are not included.'],
      verb: 'Monitor',
    })
    expect(statusConfirmCopy(hrms('inactive', draft), 'monitor', false, 'HRMS').lines).toEqual([
      "Sign-ins to HRMS don't change.",
      'Your saved draft is not included.',
    ])
    /* Unsaved edits are the nearer thing, so they are the one named. */
    expect(statusConfirmCopy(hrms('inactive', draft), 'monitor', true, 'HRMS').lines[1]).toBe('Your unsaved changes are not included.')
  })

  it('leaves out the applications when there are none to name', () => {
    expect(statusConfirmCopy(hrms('active'), 'inactive', false, null).lines).toEqual(['It stops deciding sign-ins.'])
    expect(statusConfirmCopy(hrms('inactive'), 'monitor', false, null).lines).toEqual(["Sign-ins don't change."])
  })
})

describe('offersMonitorAfterSave', () => {
  it('offers Monitor on the save that takes a draft out of draft and leaves it off', () => {
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'inactive' })).toBe(true)
  })

  it('offers nothing when the save turned it on, kept it a draft, or it was already published', () => {
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'active' })).toBe(false)
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'draft' })).toBe(false)
    expect(offersMonitorAfterSave({ status: 'inactive' }, { status: 'inactive' })).toBe(false)
  })

  it('offers nothing the status menu would not', () => {
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'inactive' }, { monitor: false })).toBe(false)
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'inactive', type: 'Session' })).toBe(false)
    expect(offersMonitorAfterSave({ status: 'draft' }, { status: 'inactive', isSystem: true })).toBe(false)
  })
})

describe('guardFor', () => {
  /* Checks that say yes, and count how often they were asked. */
  const checks = (turnsOn = true, newlyAllows = true) => {
    const asked = { turnsOn: 0, newlyAllows: 0 }
    return {
      asked,
      guarded: true,
      turnsOn: () => {
        asked.turnsOn++
        return turnsOn
      },
      newlyAllows: () => {
        asked.newlyAllows++
        return newlyAllows
      },
    }
  }
  const on = (status: 'active' | 'inactive' | 'monitor' | 'draft', appIds = ['hrms']) => ({ status, appIds })

  it('opens Before turning on for every turn on, from Inactive and from Monitoring', () => {
    expect(guardFor(on('inactive'), 'active', checks())).toBe('turn-on')
    expect(guardFor(on('monitor'), 'active', checks())).toBe('turn-on')
  })

  it('never checks a turn on that is refused first: a draft, or no application', () => {
    const c = checks()
    expect(guardFor(on('draft'), 'active', c)).toBeNull()
    expect(guardFor(on('inactive', []), 'active', c)).toBeNull()
    expect(c.asked.turnsOn).toBe(0)
    /* The system policy has every application. */
    expect(guardFor({ ...on('inactive', []), isSystem: true }, 'active', checks())).toBe('turn-on')
  })

  it("leaves a turn on neither version can make to the Can't dialog", () => {
    expect(guardFor(on('inactive'), 'active', checks(false))).toBeNull()
  })

  it('opens Before turning off and switching to monitoring only when somebody is newly let in', () => {
    expect(guardFor(on('active'), 'inactive', checks())).toBe('turn-off')
    expect(guardFor(on('active'), 'monitor', checks())).toBe('to-monitor')
    expect(guardFor(on('active'), 'inactive', checks(true, false))).toBeNull()
    expect(guardFor(on('active'), 'monitor', checks(true, false))).toBeNull()
  })

  it('checks nothing where nobody is decided for either side, or Monitor has no application', () => {
    const c = checks()
    expect(guardFor(on('inactive'), 'monitor', c)).toBeNull()
    expect(guardFor(on('monitor'), 'inactive', c)).toBeNull()
    expect(guardFor(on('active', []), 'monitor', c)).toBeNull()
    expect(c.asked).toEqual({ turnsOn: 0, newlyAllows: 0 })
  })

  it('opens nothing where the edition has no checks', () => {
    const c = { ...checks(), guarded: false }
    expect(guardFor(on('inactive'), 'active', c)).toBeNull()
    expect(guardFor(on('active'), 'inactive', c)).toBeNull()
    expect(c.asked).toEqual({ turnsOn: 0, newlyAllows: 0 })
  })
})

describe('turnOnExtras', () => {
  it('offers Monitor instead from Inactive, and the While monitoring row from Monitoring', () => {
    expect(turnOnExtras({ status: 'inactive' })).toEqual({ monitorInstead: true, whileMonitoring: false })
    expect(turnOnExtras({ status: 'monitor' })).toEqual({ monitorInstead: false, whileMonitoring: true })
  })

  it('offers Monitor instead only where the menu would offer Monitor', () => {
    expect(turnOnExtras({ status: 'inactive' }, { monitor: false }).monitorInstead).toBe(false)
    expect(turnOnExtras({ status: 'inactive', type: 'Session' }).monitorInstead).toBe(false)
  })
})

/* View monitoring (spec C §3.1–3.2, final C.3): the row menu and the status
   control offer it for a monitoring policy only, and only where the edition
   has the Monitoring status. The Monitoring page reads the same answer to know
   whether it may stay open. */
describe('offersMonitoringView', () => {
  it('offers the Monitoring page for a monitoring policy', () => {
    expect(offersMonitoringView({ status: 'monitor' })).toBe(true)
  })

  it('offers it for no other status', () => {
    for (const status of ['draft', 'active', 'inactive', 'always-on'] as const) expect(offersMonitoringView({ status })).toBe(false)
  })

  it('offers it nowhere the edition has no Monitoring status', () => {
    expect(offersMonitoringView({ status: 'monitor' }, { monitor: false })).toBe(false)
  })
})

/* The row menu (final spec C.3 and C.9, checks 3 and 4): Edit policy, Try a
   sign-in, the switches by strength, View monitoring for a monitoring policy
   only, then the rest — Read as text directly before Save as template
   (describe spec, §7.2 and Assumption 14). The list draws these with their
   icons; the words and the order are pinned here. */
describe('rowMenu', () => {
  const t = showcaseTenant()
  const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
  const as = (status: Policy['status']): Policy => ({ ...hrms, status })
  const showcase = { monitor: true, trySignIn: true, trail: false }
  const labels = (p: Policy, opts = showcase) => rowMenu(p, opts).map((i) => i.label)

  it('reads Edit policy, Check access, Monitor, Turn off, … for an active policy (check 3)', () => {
    expect(labels(as('active'))).toEqual(['Edit policy', 'Check access', 'Monitor', 'Turn off', 'Read as text', 'Save as template', 'Duplicate', 'Delete policy'])
  })

  it('reads Turn on, Turn off, View monitoring for a monitoring policy (check 4)', () => {
    expect(rowMenu(as('monitor'), showcase).map((i) => i.id)).toEqual(['edit', 'test', 'active', 'inactive', 'monitoring', 'text', 'template', 'duplicate', 'delete'])
    expect(labels(as('monitor'))).toEqual(['Edit policy', 'Check access', 'Turn on', 'Turn off', 'View monitoring', 'Read as text', 'Save as template', 'Duplicate', 'Delete policy'])
  })

  it('offers View monitoring for no other status, and nowhere the edition has no Monitoring status', () => {
    for (const status of ['draft', 'active', 'inactive'] as const) expect(labels(as(status))).not.toContain('View monitoring')
    expect(labels(as('monitor'), { ...showcase, monitor: false })).toEqual(['Edit policy', 'Check access', 'Turn on', 'Turn off', 'Read as text', 'Save as template', 'Duplicate', 'Delete policy'])
  })

  it('offers the trail builder outside the showcase, after the switches', () => {
    expect(labels(as('inactive'), { ...showcase, trail: true })).toEqual([
      'Edit policy',
      'Check access',
      'Turn on',
      'Monitor',
      'Open in trail',
      'Read as text',
      'Save as template',
      'Duplicate',
      'Delete policy',
    ])
  })

  it('leaves out what a policy cannot do: Try without the edition, a template of no rules, Duplicate and Delete of the system policy', () => {
    expect(labels(as('active'), { ...showcase, trySignIn: false })).not.toContain('Check access')
    expect(labels({ ...as('active'), rules: [] })).not.toContain('Save as template')
    const system = t.policies.find((p) => p.isSystem)!
    expect(labels(system)).not.toContain('Duplicate')
    expect(labels(system)).not.toContain('Delete policy')
  })

  it('offers Read as text for every policy — no rules, the system policy, without Try — because it only reads', () => {
    const system = t.policies.find((p) => p.isSystem)!
    const cases: [Policy, typeof showcase][] = [
      [{ ...as('draft'), rules: [] }, showcase],
      [system, showcase],
      [as('active'), { ...showcase, trySignIn: false, monitor: false }],
    ]
    for (const [p, opts] of cases) expect(labels(p, opts)).toContain('Read as text')
    expect(labels({ ...as('draft'), rules: [] })).toEqual(['Edit policy', 'Check access', 'Read as text', 'Duplicate', 'Delete policy'])
  })
})

/* The Monitoring page (spec C §3.4 States): it shows while its policy is
   monitoring, shuts the moment it is not, and stays shut when an Undo takes
   the policy back to monitoring. */
describe('watchAfter', () => {
  const open = { policyId: 'sc-hrms-office', open: true }

  it('keeps the page as it is while the policy is monitoring', () => {
    expect(watchAfter(open, true)).toBe(open)
    expect(watchAfter(null, true)).toBeNull()
  })

  it('shuts it the moment the policy leaves monitoring, or is deleted', () => {
    expect(watchAfter(open, false)).toEqual({ policyId: 'sc-hrms-office', open: false })
  })

  it('leaves it shut when the policy is back to monitoring, until it is asked for again', () => {
    const shut = watchAfter(open, false)
    expect(watchAfter(shut, true)).toBe(shut)
    expect(watchAfter(shut, true)?.open).toBe(false)
  })
})

/* The Monitoring page's two switches go the way every switch goes (final spec
   C.2, C.9 checks 8 and 9): Turn off is made at once, with an Undo back to
   Monitoring, and no page or confirm; Turn on opens Before turning on, with
   the While monitoring row. */
describe('the Monitoring page’s switches', () => {
  const guard = { guarded: true, turnsOn: () => true, newlyAllows: () => true }
  const hrms = { status: 'monitor' as const, appIds: ['hrms'] }

  it('turns off at once, with Undo back to Monitoring', () => {
    expect(guardFor(hrms, 'inactive', guard)).toBeNull()
    expect(asksFirst('monitor', 'inactive', false)).toBe(false)
    expect(statusToast('HRMS', 'monitor', 'inactive')).toEqual({ text: 'HRMS is off', undo: 'monitor' })
  })

  it('turns on through Before turning on, with the While monitoring row', () => {
    expect(guardFor(hrms, 'active', guard)).toBe('turn-on')
    expect(turnOnExtras({ status: 'monitor' }).whileMonitoring).toBe(true)
  })
})
