import { describe, expect, it } from 'vitest'

import { blankRule, type Policy } from '../../../data'
import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import type { NameLookup } from '../../predicate-prose'

import { envOf } from '../../tenant-resolver'
import { LAST_ROW } from '../../testing/evidence'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, formOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { blockedSignIns } from '../blocked'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { GRANT_ENDED, grantTempAccess } from '../temp-access'
import {
  RUN_ANY_OF_THESE,
  RUN_IF_NOT,
  RUN_NONE_ABOVE,
  RUN_SET_UP_MATCH,
  RUN_SWITCHED_OFF,
  boardIdOf,
  conflictNote,
  groupOf,
  groupsFormed,
  isWhoMiss,
  lanePart,
  runCards,
  runFoldOn,
  runGroups,
  runLane,
  runLink,
  tailWords,
  tokensOf,
  wordText,
  type RunCardModel,
} from './board-run-model'
import { walkEnd } from './classic2-model'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3's WORDS (20 Oct 2026; phase.ts BUILDER_CANVAS_CHECK): what
   each of the policy's own cards says of a sign-in, its marks, the connectors
   and the lane, over REAL runs of the showcase tenant. The cases are the
   spec's, each found from the seed rather than typed; the shapes a seed does
   not have (a rule switched off, a grant past its date, a blank rule first, an
   exception beside a plain who-miss) are made on a copy of the tenant, never in
   the engine.

   20 Oct 2026, evening (the owner on Maya Iyer → AWS Console: "If anything is
   not matched, be specific … Whatever is not reached can be collapsed … put it
   under it"; scan/spec.md §9): the words are now a second line under the name —
   a miss says the engine's own sentence, never "Not matched · Who"; the walk is
   read on that line in tokens, so no rule card opens on its own; the rules never
   reached fold into one label under the deciding card and walked misses that say
   the same stack into one card (`runGroups`); the conflict is one note on the
   deciding card (`conflictNote`); no rule card carries a badge. The pins below
   that said "Not matched · Who", the badges and `runFoldOn`'s third argument
   were rewritten for it.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const GW = t.policies.find((p) => p.name === 'Access the app through corporate devices only')!
const resolve: NameLookup = (kind, id) => (kind === 'group' ? t.groups.find((g) => g.id === id)?.name : kind === 'user' ? t.directory.people.find((u) => u.id === id)?.name : undefined)

function run(form: SignInForm, policies: readonly Policy[] = t.policies): EngineRun {
  const rows = rowsRead(policies, null, form.appId, lib)
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], policies, facts, env)[0].resolution
  return engineRun({ res, policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}
function planOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; policies?: readonly Policy[] } = {}): EngineRun {
  const policies = opts.policies ?? t.policies
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  return run({ ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm, policies)
}
/* The policy the engine walked, as Board draws it. */
const policyOf = (plan: EngineRun, policies: readonly Policy[] = t.policies) => (plan.decider ? (policies.find((p) => p.id === plan.decider!.id) ?? null) : null)
const last = (plan: EngineRun) => plan.steps.length - 1
const cardsAt = (plan: EngineRun, p = last(plan), policies: readonly Policy[] = t.policies, lock = false): RunCardModel[] => runCards(plan, policyOf(plan, policies), p, { asGroup: false, lock })
const said = (cards: readonly RunCardModel[]) => cards.map((c) => wordText(c.word))
const links = (plan: EngineRun, p = last(plan), tailOpen = false) => [...plan.rules.map((_, i) => runLink(plan, i, p, tailOpen)), runLink(plan, plan.rules.length, p, tailOpen)]
const groupsOf = (plan: EngineRun, person: string | null, policies: readonly Policy[] = t.policies) => runGroups(plan, policyOf(plan, policies), { person, resolve })

/* The day the owner looked (20 Oct 2026): the week of sign-in activity the Recently blocked list is read from. */
const ON_THE_DAY = new Date('2026-10-20T09:30:00Z')
const BLOCKED = blockedSignIns(t.policies, env, ON_THE_DAY, t.apps)
const blockedPlan = (who: string, app: string) => {
  const row = BLOCKED.find((r) => r.who === who && r.app === app)
  return row ? run(formOf(row.facts, t.zones)) : null
}
const AISHA = planOf('Aisha Khan', 'Google Workspace')
/* The owner's own screen: Recently blocked, Kavya Menon on HRMS from Frankfurt. HRMS's policy is inactive, so the Global
   Default decides, and it refuses a sign-in from outside the countries the company works in. */
const KAVYA = blockedPlan('Kavya Menon', 'HRMS')
/* Recently blocked, Priya Sharma on AWS Console: every AWS rule walked and missed, Nothing else matched refuses. */
const PRIYA_BLOCKED = blockedPlan('Priya Sharma', 'AWS Console')
const MAYA = planOf('Maya Iyer', 'AWS Console')
const THOMAS = planOf('Thomas Byrne', 'AWS Console')
const PRIYA = planOf('Priya Sharma', 'AWS Console', { origin: 'home' })
/* The owner's three-rule example: rule 1 misses on the network, rule 2 decides, rule 3 and Nothing else matched never reached. */
const SOFIA = planOf('Sofia Marchetti', 'GitHub Enterprise', { origin: 'home' })
const RAHUL = planOf('Rahul Verma', 'Google Workspace', { patch: { risk: '55' } as unknown as Partial<SignInForm> })
const EMILY = planOf('Emily Carter', 'Google Workspace', { patch: { risk: '86' } as unknown as Partial<SignInForm> })
const NO_DEVICE = { device: { kind: 'none' } } as Partial<SignInForm>
const AISHA_DEPENDS = planOf('Aisha Khan', 'Google Workspace', { patch: NO_DEVICE })
const KAVYA_DEPENDS = planOf('Kavya Menon', 'HRMS', { patch: NO_DEVICE })
const SHOWCASE_RUNS = [AISHA, MAYA, THOMAS, PRIYA, SOFIA, RAHUL, EMILY, AISHA_DEPENDS, KAVYA_DEPENDS, ...(KAVYA ? [KAVYA] : []), ...(PRIYA_BLOCKED ? [PRIYA_BLOCKED] : [])]

describe('Aisha Khan on Google Workspace: rule 1 decides', () => {
  const cards = cardsAt(AISHA)
  it('says Matches via Sales on the card that decided; the rules never reached say nothing — their label does', () => {
    expect(cards.map((c) => c.id)).toEqual([...GW.rules.map((r) => r.id), 'fallback'])
    expect(said(cards)).toEqual(['Matches · via Sales', '', '', ''])
    expect(cards.map((c) => c.state)).toEqual(['match', 'not-reached', 'not-reached', 'not-reached'])
    /* The group's name is a name: it is said apart from the machine's words, so it sharpens in and is never scrambled. */
    expect(cards[0].word).toMatchObject({ lead: 'Matches', name: 'via Sales', mark: 'pass', tone: 'match' })
  })
  it('tones only the card that decided, and carries no badge on any card (20 Oct 2026, evening)', () => {
    expect(cards.filter((c) => c.decided).map((c) => c.id)).toEqual([GW.rules[0].id])
    for (const c of cards) expect(Object.keys(c)).not.toContain('badge')
  })
  it('folds the rest under rule 1: the connector under it is the route, the outcome\'s own stands down, and no lane', () => {
    expect(links(AISHA)).toEqual(['taken', 'taken', 'skip', 'skip', 'hidden'])
    expect(runLane(AISHA, last(AISHA))).toBeNull()
  })
  it('opened by hand, the rest are dashed and the lane passes them into the outcome, at rest', () => {
    expect(links(AISHA, last(AISHA), true)).toEqual(['taken', 'skip', 'skip', 'skip', 'skip'])
    const lane = runLane(AISHA, last(AISHA), true)
    expect(lane).toMatchObject({ from: 0, kind: 'taken', ticks: [] })
    expect(lane!.step).toBeLessThanOrEqual(80)
    const n = AISHA.rules.length
    expect([0, 1, 2, 3, n].map((slot) => lanePart(lane, slot, n)?.part ?? null)).toEqual(['from', 'through', 'through', 'through', 'to'])
  })
  it('holds no rule card open on its own at any step, and the outcome once it is presented', () => {
    expect(runFoldOn(AISHA, last(AISHA))).toBe('outcome')
    expect(runFoldOn(AISHA, AISHA.rules[0].startAt)).toBeNull()
  })
  it('says nothing on a card the walk has not reached, and nothing about the person before the engine reads it', () => {
    const before = cardsAt(AISHA, AISHA.rules[0].startAt - 1)
    expect(before.every((c) => c.state === 'wait' && c.word === null)).toBe(true)
    expect(runLane(AISHA, AISHA.rules[0].startAt)).toBeNull()
  })
  it('locks the card that decided only inside the lock window, and only when asked', () => {
    const p = AISHA.rules[0].endAt
    expect(cardsAt(AISHA, p, t.policies, true)[0].lock).toBe(true)
    expect(cardsAt(AISHA, p, t.policies, false)[0].lock).toBe(false)
    expect(cardsAt(AISHA, last(AISHA), t.policies, true)[0].lock).toBe(false)
  })
  it('describes the card that decided for a screen reader with its outcome', () => {
    expect(cards[0].describe).toBe('Matches · via Sales, then Allow on 1 factor')
  })
})

describe('a miss says what failed, in the engine\'s own words (20 Oct 2026, evening: "be specific")', () => {
  it('Maya Iyer on AWS, rule 1: the who the engine read', () => {
    expect(wordText(cardsAt(MAYA)[0].word)).toBe('Not matched · Maya Iyer is not in Contractors')
  })
  it('Sofia Marchetti on GitHub from home, rule 1: the network', () => {
    expect(wordText(cardsAt(SOFIA)[0].word)).toBe('Not matched · Home broadband is not in Corporate offices')
  })
  it('Rahul Verma on Google Workspace at risk 55, rule 1: the risk score', () => {
    expect(wordText(cardsAt(RAHUL)[0].word)).toBe('Not matched · Risk score 55 is not below 40')
  })
  it('Kavya Menon blocked on HRMS, rules 1 and 2: the address', () => {
    expect(KAVYA, 'Recently blocked: Kavya Menon on HRMS').not.toBeNull()
    expect(said(cardsAt(KAVYA!)).slice(0, 2)).toEqual(['Not matched · 192.0.2.82 is not in Operating countries', 'Not matched · 192.0.2.82 is not in Operating countries'])
  })
  it('Priya Sharma blocked on AWS, rule 4: the device', () => {
    expect(PRIYA_BLOCKED, 'Recently blocked: Priya Sharma on AWS Console').not.toBeNull()
    expect(wordText(cardsAt(PRIYA_BLOCKED!)[3].word)).toBe('Not matched · Windows 10 laptop does not meet Compliant devices')
  })
  it('never says a category alone, on any card of any showcase run', () => {
    const categories = ['Who', 'Network', 'Place', 'Device', 'Time', 'Risk', 'Application', 'Check']
    for (const plan of SHOWCASE_RUNS) {
      for (const w of said(cardsAt(plan))) expect(categories.map((c) => `Not matched · ${c}`), `${plan.appName}: ${w}`).not.toContain(w)
    }
  })
  it('a miss is quiet: its mark a ✕, its tone never the decision\'s', () => {
    expect(cardsAt(MAYA)[0].word).toMatchObject({ lead: 'Not matched', why: 'Maya Iyer is not in Contractors', mark: 'fail', tone: 'quiet' })
  })
})

describe('the walk on the line: one token per check, the failing one lit, then the reason (20 Oct 2026, evening)', () => {
  const r0 = SOFIA.rules[0]
  it('reads Who, then Network, the network lit as its ✕ lands', () => {
    expect(r0.markAt.length).toBeGreaterThanOrEqual(2)
    const at = r0.markAt[1]
    expect(tokensOf(r0, at).map((k) => `${k.word} ${k.mark}${k.hit ? ' hit' : ''}`)).toEqual(['Who pass', 'Network fail hit'])
    /* The card is still being read for that beat: the line is the strip, not yet the reason. */
    const card = cardsAt(SOFIA, at)[0]
    expect(card.state).toBe('reading')
    expect(card.word).toMatchObject({ lead: 'Reading', mark: 'working', tone: 'work' })
    expect(card.word?.tokens?.map((k) => k.word)).toEqual(['Who', 'Network'])
  })
  it('a check reached but not yet read turns, unlit', () => {
    expect(tokensOf(r0, r0.checkAt[1]).map((k) => `${k.word} ${k.mark}${k.hit ? ' hit' : ''}`)).toEqual(['Who pass', 'Network working'])
  })
  it('settles to the engine\'s sentence as the engine folds the rule, the strip gone', () => {
    expect(r0.compactAt).not.toBeNull()
    const card = cardsAt(SOFIA, r0.compactAt!)[0]
    expect(card.state).toBe('miss')
    expect(card.word?.tokens).toBeUndefined()
    expect(card.word?.why).toBe('Home broadband is not in Corporate offices')
  })
  it('the next card waits with no words until the walk reaches it', () => {
    const card = cardsAt(SOFIA, r0.compactAt!)[1]
    expect(card).toMatchObject({ state: 'wait', word: null })
  })
})

describe('the groups: the rules never reached, and walked misses that say the same', () => {
  it('are not formed before the walk is over, and are constant through the run', () => {
    expect(groupsFormed(MAYA, walkEnd(MAYA) - 1)).toBe(false)
    expect(groupsFormed(MAYA, walkEnd(MAYA))).toBe(true)
    expect(groupsOf(MAYA, 'Maya Iyer')).toEqual(groupsOf(MAYA, 'Maya Iyer'))
  })
  it('Maya Iyer on AWS: rules 3–6 and Nothing else matched, folded under rule 2', () => {
    expect(groupsOf(MAYA, 'Maya Iyer')).toEqual([{ id: 'tail', kind: 'tail', from: 2, to: 6, words: 'Not reached · rules 3–6 and Nothing else matched', open: 'Not reached' }])
  })
  it('names the range by rule numbers, then Nothing else matched', () => {
    expect(groupsOf(AISHA, 'Aisha Khan').map((g) => g.words)).toEqual(['Not reached · rules 2–3 and Nothing else matched'])
    expect(groupsOf(SOFIA, 'Sofia Marchetti').map((g) => g.words)).toEqual(['Not reached · rule 3 and Nothing else matched'])
    expect(EMILY.landing).toBe(2)
    expect(groupsOf(EMILY, 'Emily Carter').map((g) => g.words)).toEqual(['Not reached · Nothing else matched'])
    expect([tailWords(2, 7), tailWords(5, 7), tailWords(6, 7)]).toEqual([
      'Not reached · rules 3–6 and Nothing else matched',
      'Not reached · rule 6 and Nothing else matched',
      'Not reached · Nothing else matched',
    ])
  })
  it('Kavya Menon blocked: the two misses that say the same stack into one card; Nothing else matched decided, so no tail', () => {
    const groups = groupsOf(KAVYA!, 'Kavya Menon')
    expect(groups).toEqual([
      { id: 'stack:0', kind: 'stack', from: 0, to: 1, words: '1–2', open: 'Rules 1–2', finding: '192.0.2.82 is not in Operating countries', names: KAVYA!.rules.slice(0, 2).map((r) => r.name).join(' · ') },
    ])
  })
  it('Thomas Byrne on AWS: three plain who-misses stack, said together from the rules\' own groups; rules 5–6 fold under rule 4', () => {
    const groups = groupsOf(THOMAS, 'Thomas Byrne')
    expect(groups.map((g) => [g.kind, g.from, g.to])).toEqual([
      ['stack', 0, 2],
      ['tail', 4, 6],
    ])
    expect(groups[0].finding).toBe('Thomas Byrne is not in Contractors, Engineering or DevOps')
  })
  it('Priya Sharma blocked on AWS: two stacks with the device miss alone between them, the second too many to list', () => {
    const groups = groupsOf(PRIYA_BLOCKED!, 'Priya Sharma')
    expect(groups.map((g) => [g.kind, g.from, g.to])).toEqual([
      ['stack', 0, 2],
      ['stack', 4, 5],
    ])
    expect(groups[1].finding).toBe(`Priya Sharma ${RUN_ANY_OF_THESE}`)
    expect(groupOf(groups, 3)).toBeUndefined()
    expect(groupOf(groups, 5)?.id).toBe('stack:4')
  })
  it('never stacks an exception: a who-miss by an exception beside a plain one stands alone', () => {
    const slack = t.policies.find((p) => p.id === 'sc-slack-everyone')!
    const plainFirst = { ...blankRule(), id: 'r-sales-first', name: 'Sales first', who: { groupIds: ['sales'], userIds: [] } }
    const policies = t.policies.map((p) => (p.id === slack.id ? { ...slack, rules: [plainFirst, ...slack.rules] } : p))
    const saved = t.savedSignIns.find((s) => s.id === 'ssi-leo-slack')!
    const plan = run(formOf(saved.facts, t.zones), policies)
    expect(plan.rules[0].state).toBe('no-match')
    expect(wordText(cardsAt(plan, last(plan), policies)[1].word)).toMatch(/an exception$/)
    expect(groupsOf(plan, 'Leo Fernandes', policies).filter((g) => g.kind === 'stack')).toEqual([])
  })
  it('a Depends forms no tail, and never stacks across the card that cannot be told', () => {
    expect(AISHA_DEPENDS.outcome.status).toBe('depends')
    expect(groupsOf(AISHA_DEPENDS, 'Aisha Khan')).toEqual([])
    expect(groupsOf(KAVYA_DEPENDS, 'Kavya Menon')).toEqual([])
  })
  it('a group\'s own run (no person) stacks no who-misses', () => {
    expect(groupsOf(THOMAS, null).filter((g) => g.kind === 'stack')).toEqual([])
  })
})

describe('the conflict: one note on the card that decided', () => {
  it('Maya Iyer on AWS: rule 2 decides via Engineering; rule 4 also matches via Finance', () => {
    const cards = cardsAt(MAYA)
    expect(said(cards).slice(0, 2)).toEqual(['Not matched · Maya Iyer is not in Contractors', 'Matches · via Engineering'])
    expect(conflictNote(MAYA)).toBe('Rule 4 also matches · via Finance · not used')
    expect(cards[1].note).toBe('Rule 4 also matches · via Finance · not used')
    expect(cards.filter((c) => c.note).length).toBe(1)
    expect(isWhoMiss(MAYA.rules[0])).toBe(true)
  })
  it('the also card says so once the tail is opened, in the notice', () => {
    const cards = cardsAt(MAYA)
    expect(cards[3]).toMatchObject({ state: 'also', settled: true })
    expect(wordText(cards[3].word)).toBe('Also matches · via Finance · not used')
    expect(cards[3].word?.tone).toBe('notice')
  })
  it('Thomas Byrne on AWS: rule 4 decides via Finance; rule 5 names him', () => {
    expect(conflictNote(THOMAS)).toBe('Rule 5 also matches · by name · not used')
    expect(wordText(cardsAt(THOMAS)[3].word)).toBe('Matches · via Finance')
  })
  it('no note where nothing else applies, and none before the walk is over', () => {
    expect(conflictNote(AISHA)).toBeNull()
    expect(cardsAt(MAYA, MAYA.rules[1].endAt)[1].note).toBeNull()
  })
  it('describes the deciding card with its outcome and its note; a miss without either', () => {
    const cards = cardsAt(MAYA)
    expect(cards[1].describe).toBe('Matches · via Engineering, then Allow on 1 factor. Rule 4 also matches · via Finance · not used')
    expect(cards[0].describe).not.toContain('then')
  })
})

describe('Kavya Menon on HRMS, blocked: the Global Default decides', () => {
  it('is in the seed', () => {
    expect(KAVYA!.decider?.isGlobalDefault).toBe(true)
    expect(KAVYA!.outcome.decision).toBe('deny')
  })
  it('says on Nothing else matched why it was the one, toned Deny', () => {
    const cards = cardsAt(KAVYA!)
    const end = cards[cards.length - 1]
    expect(end).toMatchObject({ id: 'fallback', state: 'match', decided: true })
    expect(wordText(end.word)).toBe(`Matches · ${RUN_NONE_ABOVE}`)
    expect(end.always).toMatchObject({ status: 'pass', working: false })
  })
  it('marks no who on a rule for everyone, and says the rows after the miss were never checked', () => {
    const first = cardsAt(KAVYA!)[0]
    expect(first.marks?.who ?? null).toBeNull()
    expect(first.marks?.skipped.length ?? 0).toBeGreaterThan(0)
  })
  it('takes every connector and draws no lane: Nothing else matched decided', () => {
    expect(links(KAVYA!).every((k) => k === 'taken')).toBe(true)
    expect(runLane(KAVYA!, last(KAVYA!))).toBeNull()
    expect(runLane(KAVYA!, last(KAVYA!), true)).toBeNull()
  })
})

describe('Can’t tell: nothing decided, the answer Depends', () => {
  it('Aisha Khan with no device: Can’t tell · Device not stated, the misses with their findings, and If not on the last row; no lock', () => {
    const cards = cardsAt(AISHA_DEPENDS, last(AISHA_DEPENDS), t.policies, true)
    expect(AISHA_DEPENDS.outcome.status).toBe('depends')
    expect(cards[0]).toMatchObject({ state: 'unknown', word: { lead: 'Can’t tell', why: 'Device not stated', mark: 'unknown', tone: 'notice' } })
    expect(wordText(cards[0].word)).toBe('Can’t tell · Device not stated')
    expect(said(cards).slice(1, 3).every((w) => /^Not matched · Risk score 12 is not /.test(w))).toBe(true)
    expect(cards[3]).toMatchObject({ id: 'fallback', state: 'possible', word: { mark: 'possible' } })
    expect(wordText(cards[3].word)).toBe(RUN_IF_NOT)
    expect(cards.some((c) => c.decided || c.lock || c.note)).toBe(false)
    /* Its lane is unchanged: from the first card that cannot be told, dashed in the notice. */
    expect(runLane(AISHA_DEPENDS, last(AISHA_DEPENDS))).toMatchObject({ from: 0, kind: 'possible' })
    expect(runLink(AISHA_DEPENDS, AISHA_DEPENDS.rules.length, last(AISHA_DEPENDS))).toBe('possible')
  })
  it('Kavya Menon with no device: a rule the engine says matched below the one that cannot be told only may, and joins the lane by a tick', () => {
    const cards = cardsAt(KAVYA_DEPENDS)
    expect(KAVYA_DEPENDS.rules[1].state).toBe('match')
    expect(cards[1].state).toBe('possible')
    expect(wordText(cards[1].word)).toBe(RUN_IF_NOT)
    expect(runLane(KAVYA_DEPENDS, last(KAVYA_DEPENDS))).toMatchObject({ from: 0, kind: 'possible', ticks: [1] })
  })
})

describe('the shapes a seed does not have', () => {
  const aisha = (policies: readonly Policy[]) => planOf('Aisha Khan', 'Google Workspace', { policies })
  const swap = (p: Policy) => t.policies.map((x) => (x.id === GW.id ? p : x))

  it('a rule switched off says so, with a dash for its mark', () => {
    const policies = swap({ ...GW, rules: GW.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) })
    const first = cardsAt(aisha(policies), undefined, policies)[0]
    expect(first).toMatchObject({ state: 'off', word: { mark: 'off', tone: 'faint' } })
    expect(wordText(first.word)).toBe(RUN_SWITCHED_OFF)
  })
  it('a grant past its date says Temporary access ended', () => {
    const person = t.directory.people.find((p) => p.name === 'Aisha Khan')!
    const policies = swap(grantTempAccess(GW, person, { until: '2026-09-30', reason: 'Audit', by: 'Admin' }))
    const first = cardsAt(aisha(policies), undefined, policies)[0]
    expect(first).toMatchObject({ state: 'off', word: { mark: 'off' } })
    expect(wordText(first.word)).toBe(GRANT_ENDED)
  })
  it('a blank rule first catches the sign-in, and says it was never set up', () => {
    const policies = swap({ ...GW, rules: [blankRule(), ...GW.rules] })
    const plan = aisha(policies)
    const first = cardsAt(plan, undefined, policies)[0]
    expect(first).toMatchObject({ state: 'match', decided: true })
    expect(wordText(first.word)).toBe(RUN_SET_UP_MATCH)
  })
})

describe('no card opens on its own, and the camera follows the one being read', () => {
  it('names no rule card at any step of any showcase run — only the outcome, or nothing', () => {
    for (const plan of SHOWCASE_RUNS) {
      for (let p = 0; p <= last(plan); p++) {
        const on = runFoldOn(plan, p)
        expect(on === null || on === 'outcome', `${plan.appName} at ${p}`).toBe(true)
      }
    }
  })
  it('follows the card being read, then the one that decided from its rule-end until the outcome', () => {
    const r1 = MAYA.rules[1]
    expect(cardsAt(MAYA, r1.startAt)[1].follow).toBe(true)
    expect(cardsAt(MAYA, r1.endAt)[1].follow).toBe(true)
    expect(cardsAt(MAYA, MAYA.at.outcome - 1)[1].follow).toBe(true)
    expect(cardsAt(MAYA, MAYA.at.outcome)[1].follow).toBe(false)
    expect(cardsAt(MAYA, last(MAYA)).some((c) => c.follow)).toBe(false)
  })
})

describe('ids', () => {
  it('names the last row by Board\'s own key for it', () => {
    expect(LAST_ROW).toBe('fallback')
    const end = AISHA.rules[AISHA.rules.length - 1]
    expect(end.index).toBeNull()
    expect(boardIdOf(end)).toBe('fallback')
    expect(boardIdOf(AISHA.rules[0])).toBe(GW.rules[0].id)
  })
})
