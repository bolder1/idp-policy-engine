import { describe, expect, it } from 'vitest'

import {
  OS_ATTRIBUTES,
  alwaysOn,
  attrOf,
  blockedAttributes,
  offeredAttributes,
  profileIssue,
  stepsFor,
  TIER_WEIGHT,
} from '../fingerprint'
import {
  agentNote,
  arrive,
  canOpenStep,
  checkValue,
  draftOf,
  filterAttributes,
  initialWizard,
  reviewSections,
  stepDone,
  stepIssue,
  toggleRun,
  withConfig,
  withMode,
  withWeight,
  withWizardReach,
  wizardStarted,
  wizardSteps,
  type WizardState,
} from './device-profile-wizard-model'

/* The full-page create wizard, versions 1 (inline) and 3 (split). The page is
   a rendering of these answers, so the answers are pinned here. */

const state = (over: Partial<WizardState> = {}): WizardState => ({ ...initialWizard(), ...over })
const ids = (steps: { id: string }[]) => steps.map((s) => s.id)
const roster = { fileName: 'fleet.csv', rows: 12, uploadedAt: '15 Sep 2026' }

describe('which steps a profile takes', () => {
  it('asks Devices of a trusted device only, and ends on a review', () => {
    expect(ids(wizardSteps('os', 'inline'))).toEqual(['profile', 'items', 'review'])
    expect(ids(wizardSteps('device', 'inline'))).toEqual(['profile', 'devices', 'items', 'review'])
    expect(ids(wizardSteps('os', 'split'))).toEqual(['profile', 'choose', 'values', 'review'])
    expect(ids(wizardSteps('device', 'split'))).toEqual(['profile', 'devices', 'choose', 'values', 'review'])
  })

  it('names the steps as the model does, with the kind’s own noun', () => {
    expect(wizardSteps('os', 'inline').map((s) => s.label)).toEqual([...stepsFor('os'), 'Review'])
    expect(wizardSteps('device', 'split').map((s) => s.label)).toEqual([
      'Profile',
      'Devices',
      'Choose signals',
      'Set values',
      'Review',
    ])
    expect(wizardSteps('os', 'split')[1].label).toBe('Choose checks')
  })
})

describe('what stops each step', () => {
  it('needs a name no other profile has', () => {
    expect(stepIssue('profile', state(), [])).toBe('Enter a profile name.')
    expect(stepIssue('profile', state({ name: 'Laptops' }), ['laptops'])).toBe('A profile with this name already exists.')
    expect(stepIssue('profile', state({ name: 'Laptops' }), ['Phones'])).toBeNull()
  })

  it('needs the collector answered, and a roster when only approved devices may sign in', () => {
    const device = state({ name: 'Fleet', mode: 'device' })
    expect(stepIssue('devices', device, [])).toBe('Choose what the collector can read.')
    expect(stepIssue('devices', { ...device, reach: 'agentless' }, [])).toBeNull()
    const preApproved = { ...device, reach: 'agent' as const, registration: 'pre-approved' as const, maxDevices: null }
    expect(stepIssue('devices', preApproved, [])).toBe('Upload a device roster.')
    expect(stepIssue('devices', { ...preApproved, roster }, [])).toBeNull()
  })

  it('needs a check on a health profile, but a trusted device has its always-on signals', () => {
    for (const step of ['items', 'choose', 'values'] as const) {
      expect(stepIssue(step, state({ name: 'A' }), [])).toBe('Add at least one check.')
      expect(stepIssue(step, state({ name: 'A', mode: 'device', reach: 'agentless' }), [])).toBeNull()
    }
  })

  it('checks typed versions where values are set, not where checks are only chosen', () => {
    const bad = state({ name: 'A', picked: ['browser-chrome'], config: { 'browser-chrome': { op: 'gte', value: 'latest' } } })
    expect(stepIssue('choose', bad, [])).toBeNull()
    expect(stepIssue('values', bad, [])).toBe('Enter a version for Chrome.')
    expect(stepIssue('items', bad, [])).toBe('Enter a version for Chrome.')
  })

  it('ignores a bad value on a row that is not ticked', () => {
    const unticked = state({ name: 'A', picked: ['device-type'], config: { 'browser-chrome': { op: 'gte', value: '' } } })
    expect(stepIssue('items', unticked, [])).toBeNull()
  })

  it('needs MAC ticked to match a roster', () => {
    const s = state({
      name: 'Kiosk',
      mode: 'device',
      reach: 'agent',
      registration: 'pre-approved',
      maxDevices: null,
      roster,
    })
    expect(stepIssue('choose', s, [])).toBe('Add MAC address to match the roster.')
    expect(stepIssue('items', { ...s, picked: ['mac'] }, [])).toBeNull()
  })

  it('reviews with the same answer the page saves with', () => {
    const s = state({ name: 'Corp', picked: ['os-windows'] })
    expect(stepIssue('review', s, ['Corp'])).toBe(profileIssue(draftOf(s), ['Corp']))
    expect(stepIssue('review', s, [])).toBeNull()
  })
})

describe('the profile the answers make', () => {
  it('enables only what is offered at the reach, plus the always-on signals, and prunes values', () => {
    const s = state({
      name: ' Fleet ',
      mode: 'device',
      reach: 'agentless',
      picked: ['mac', 'locale'],
      weights: { mac: 30, locale: 30, canvas: 10 },
    })
    const d = draftOf(s)
    const always = alwaysOn('device').map((a) => a.id)
    expect(d.name).toBe('Fleet')
    expect(d.enabled).toEqual([...always, 'locale'])
    expect(d.weights).toEqual({ locale: 30 })
    expect(d.restrictionSet).toBe(true)
    expect(d.id).toBe('')
  })

  it('keeps a roster only for pre-approved, and says a health profile was never asked about enrolment', () => {
    expect(draftOf(state({ roster })).roster).toBeNull()
    expect(draftOf(state({ name: 'A' })).restrictionSet).toBe(false)
    expect(draftOf(state({ name: 'A' })).reach).toBe('agentless')
  })

  it('is valid when every step is', () => {
    const s = state({ name: 'Windows floor', picked: ['os-windows', 'integrity'] })
    for (const step of wizardSteps('os', 'split')) expect(stepIssue(step.id, s, [])).toBeNull()
    expect(profileIssue(draftOf(s), [])).toBeNull()
  })
})

describe('answers that undo other answers', () => {
  it('clears ticks, values and the collector when the type changes, and the roster with it', () => {
    const s = state({
      name: 'X',
      mode: 'device',
      reach: 'agent',
      picked: ['mac'],
      weights: { mac: 10 },
      registration: 'pre-approved',
      maxDevices: null,
      roster,
    })
    const os = withMode(s, 'os')
    expect([os.picked, os.config, os.weights, os.reach, os.registration, os.roster, os.maxDevices]).toEqual([
      [],
      {},
      {},
      null,
      'self',
      null,
      3,
    ])
    expect(os.name).toBe('X')
    expect(withMode(s, 'device')).toBe(s)
  })

  it('takes the roster away when the collector goes agentless, and keeps the ticks for the way back', () => {
    const s = state({ mode: 'device', reach: 'agent', picked: ['mac'], registration: 'pre-approved', maxDevices: null, roster })
    const off = withWizardReach(s, 'agentless')
    expect([off.registration, off.roster, off.maxDevices, off.picked]).toEqual(['self', null, 3, ['mac']])
    expect(withWizardReach(off, 'agent').picked).toEqual(['mac'])
  })

  it('writes nothing for a value or a tier a check already has', () => {
    const s = state()
    const windows = attrOf('os', 'os-windows')!
    const current = windows.config && 'value' in windows.config ? windows.config.value : undefined
    expect(withConfig(s, 'os-windows', current as never)).toBe(s)
    expect(withConfig(s, 'os-windows', { op: 'gte', value: '11' }).config['os-windows']).toEqual({ op: 'gte', value: '11' })
    const d = state({ mode: 'device' })
    const mac = attrOf('device', 'mac')!
    expect(withWeight(d, 'mac', mac.weight)).toBe(d)
    expect(withWeight(d, 'mac', TIER_WEIGHT.Low).weights.mac).toBe(TIER_WEIGHT.Low)
  })

  it('counts any answer as work to lose, and a fresh page as none', () => {
    expect(wizardStarted(initialWizard())).toBe(false)
    expect(wizardStarted(state({ name: 'a' }))).toBe(true)
    expect(wizardStarted(withMode(initialWizard(), 'device'))).toBe(true)
  })
})

describe('moving between steps', () => {
  const steps = wizardSteps('device', 'inline')

  it('ticks MAC on the way past Devices for a pre-approved profile, and only then', () => {
    const s = state({ mode: 'device', reach: 'agent', registration: 'pre-approved', maxDevices: null, roster })
    expect(arrive(s, steps, 1, 2).picked).toEqual(['mac'])
    expect(arrive(s, steps, 0, 3).picked).toEqual(['mac'])
    expect(arrive(s, steps, 2, 1)).toBe(s)
    expect(arrive({ ...s, registration: 'self' }, steps, 1, 2).picked).toEqual([])
    expect(arrive({ ...s, picked: ['mac'] }, steps, 1, 2).picked).toEqual(['mac'])
  })

  it('opens any done step, and a later one only once visited and with the way there clear', () => {
    const clear = () => null
    expect(canOpenStep(steps, 2, 2, 0, clear)).toBe(true)
    expect(canOpenStep(steps, 2, 2, 2, clear)).toBe(false)
    expect(canOpenStep(steps, 0, 0, 1, clear)).toBe(false)
    expect(canOpenStep(steps, 0, 3, 3, clear)).toBe(true)
    expect(canOpenStep(steps, 0, 3, 3, (id) => (id === 'devices' ? 'Choose what the collector can read.' : null))).toBe(false)
  })

  it('ticks a step behind, or one ahead already passed, while nothing on it is wrong', () => {
    const clear = () => null
    // On Signals, having come straight here: Profile and Devices are done, Review is not.
    expect(steps.map((_, i) => stepDone(steps, 2, 2, i, clear))).toEqual([true, true, false, false])
    // Back on Profile after reaching Review: Devices and Signals were passed, Review only arrived at.
    expect(steps.map((_, i) => stepDone(steps, 0, 3, i, clear))).toEqual([false, true, true, false])
    // A name cleared on the way back takes its tick off.
    const noName = (id: string) => (id === 'profile' ? 'Enter a profile name.' : null)
    expect(stepDone(steps, 2, 2, 0, noName)).toBe(false)
  })
})

describe('the inline list', () => {
  const offered = offeredAttributes('device', 'agentless')

  it('puts the always-on signals first, and narrows by search, category and selection', () => {
    const all = filterAttributes(offered, '', '', [])
    const always = all.filter((a) => a.always)
    expect(all.slice(0, always.length)).toEqual(always)
    expect(filterAttributes(offered, 'TIME', '', []).every((a) => `${a.name} ${a.purpose} ${a.category}`.toLowerCase().includes('time'))).toBe(true)
    expect(filterAttributes(offered, '', 'Browser', []).every((a) => a.category === 'Browser')).toBe(true)
    const picked = [offered.find((a) => !a.always)!.id]
    expect(filterAttributes(offered, '', '@selected', picked).map((a) => a.id)).toEqual([...always.map((a) => a.id), ...picked])
  })

  it('ticks one row, or a shift run from the last one pressed, skipping always-on rows', () => {
    const rows = filterAttributes(OS_ATTRIBUTES, '', '', [])
    const [a, b, c] = rows
    expect(toggleRun([], rows, null, a.id, false)).toEqual([a.id])
    expect(toggleRun([a.id], rows, a.id, a.id, false)).toEqual([])
    expect(toggleRun([], rows, a.id, c.id, true)).toEqual([a.id, b.id, c.id])
    expect(toggleRun([a.id, b.id, c.id], rows, a.id, c.id, true)).toEqual([])
    const trusted = filterAttributes(offered, '', '', [])
    const firstFree = trusted.findIndex((x) => !x.always)
    const run = toggleRun([], trusted, trusted[0].id, trusted[firstFree].id, true)
    expect(run).toEqual([trusted[firstFree].id])
  })

  it('names what an agent would unlock', () => {
    const blocked = blockedAttributes('device', 'agentless')
    expect(agentNote(blocked.slice(0, 1))).toBe(`${blocked[0].name} needs an agent.`)
    expect(agentNote(blocked)).toMatch(new RegExp(`and ${blocked.length - 3} more need an agent\\.$`))
  })
})

describe('the review', () => {
  it('says each part once, in step order, with Edit pointing at the step that asks it', () => {
    const health = state({ name: 'Corp', picked: ['os-windows', 'device-type'] })
    const inline = reviewSections(health, 'inline')
    expect(inline.map((s) => [s.step, s.title])).toEqual([
      ['profile', 'Profile'],
      ['items', 'Checks'],
    ])
    expect(inline[0].facts).toEqual([
      { label: 'Name', value: 'Corp' },
      { label: 'Type', value: 'Device health', pill: true },
    ])
    expect(inline[1].facts.map((f) => [f.label, f.value])).toEqual([
      ['Windows OS version', 'Windows 10 or later'],
      ['Device type', 'Laptop'],
    ].sort((x, y) => OS_ATTRIBUTES.findIndex((a) => a.name === x[0]) - OS_ATTRIBUTES.findIndex((a) => a.name === y[0])))
    expect(reviewSections(health, 'split')[1].step).toBe('values')
    /* What a folded section says while it is shut: the type, and the count. */
    expect(inline.map((s) => s.summary)).toEqual(['Device health', '2 checks'])
  })

  it('states the enrolment answers and each signal’s weight on a trusted device', () => {
    const s = state({ name: 'Fleet', mode: 'device', reach: 'agent', picked: ['mac'], weights: { mac: TIER_WEIGHT.Low }, autoRegister: true })
    const [, devices, signals] = reviewSections(s, 'inline')
    expect(devices.facts.map((f) => [f.label, f.value])).toEqual([
      ['What it can read', 'Agent-based'],
      ['How a device gets registered', 'Users register their own devices'],
      ['Devices per person', '3'],
      ['Register silently on first sign-in', 'On'],
    ])
    const rostered = reviewSections({ ...s, registration: 'pre-approved', maxDevices: null, roster }, 'inline')[1]
    expect(rostered.facts[2]).toEqual({ label: 'Approved device roster', value: 'fleet.csv, 12 devices' })
    /* A roster line is a file name and a count, so it is not a pill; the
       answers chosen from a fixed set are. */
    expect(rostered.facts[2].pill).toBeUndefined()
    const single = reviewSections({ ...s, registration: 'pre-approved', maxDevices: null, roster: { ...roster, rows: 1 } }, 'inline')[1]
    expect(single.facts[2].value).toBe('fleet.csv, 1 device')
    expect(signals.title).toBe('Signals')
    expect(signals.facts.find((f) => f.label === 'MAC address')?.value).toBe('Low weight')
    expect(signals.facts).toHaveLength(alwaysOn('device').length + 1)
  })

  it('reads a health check as words, not as an operator', () => {
    const windows = attrOf('os', 'os-windows')!
    expect(checkValue(windows, { op: 'gte', value: '11' })).toBe('Windows 11 or later')
    expect(checkValue(windows, undefined)).toBe('Windows 10 or later')
  })
})
