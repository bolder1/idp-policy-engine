import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../../fixtures'
import { runColumns, type ColumnSpec } from '../../../board/try-sign-in'
import { envOf } from '../../../tenant-resolver'
import { rowsRead } from '../../../testing/rows-read'
import { screensOf } from '../../../testing/screens-of'
import { factsOf, originPatch, type SignInForm } from '../../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../../engine-run'
import { emptyDraft, forRun, withDefaults } from '../../sign-in-card'
import { answer, chipsFor, didLine, isRunAction, narration, plain, runAction, suggestionsFor, type Answer, type AskProps, type Suggestion, type Target } from './intents'
import { readSignIn } from './read-sign-in'
import { previewOf, rankWhatIfs, variationsOf, type WhatIfDeps } from './what-if'

/* -----------------------------------------------------------------------------
   The assistant's words over REAL runs of the showcase tenant, built as the
   page builds them (layouts-render.test.tsx), with the previews the dock
   hands in (what-if.ts) and the tenant's names (read-sign-in.ts): the
   suggestions each run offers make sense for it and never repeat, every
   answer's words are the plan's (names, rule numbers, failing checks), every
   citation names a real thing, every action carries real ids, and the words
   act only when they command.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const deps: WhatIfDeps = { policies: t.policies, zones: t.zones, fingerprints: t.fingerprints, users: t.directory.people, apps: t.apps, methods: t.methods, defaultMethodId: undefined, env }
const dict = { people: t.directory.people, groups: t.groups, apps: t.apps }

interface Run {
  plan: EngineRun
  form: SignInForm
  props: AskProps
}

function runOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm> } = {}): Run {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], t.policies, facts, env)[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  const screens = screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person })
  const whatIfs = rankWhatIfs(variationsOf(form, rows).flatMap((v) => previewOf(form, v.patch, deps, plan, v) ?? []), plan)
  const preview = (patch: Partial<SignInForm>) => previewOf(form, patch, deps, plan)
  const noop = () => {}
  return { plan, form, props: { asGroup: null, screens, form, rows, whatIfs, preview, dict, onAsGroup: noop, onAdd: noop, onOpenRule: noop, onOpenPolicy: noop, onRunWith: noop, onReplay: noop, onPressPerson: noop, onReviewBreakIn: noop } }
}

const A = runOf('Aisha Khan', 'Google Workspace')
const B = runOf('Arun Patel', 'GitHub Enterprise', { origin: 'home' })
const C = runOf('Maya Iyer', 'AWS Console')
const GD = runOf('Ravi Menon', 'AWS Console')
const DENY = runOf('Devon Rao', 'AWS Console', { origin: 'home' })
const DEP = runOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const OFF = runOf('Priya Sharma', 'HRMS')
const ALL = { A, B, C, GD, DENY, DEP, OFF }

const opening = (r: Run) => suggestionsFor(r.plan, r.props)
const labels = (xs: readonly Suggestion[]) => xs.map((s) => s.label)
const ask = (r: Run, q: string, last?: Answer) => answer(q, r.plan, r.props, undefined, last)
const press = (r: Run, label: string, from: readonly Suggestion[] = opening(r)): Answer => {
  const s = from.find((x) => x.label === label)
  if (!s?.ask) throw new Error(`no question "${label}" — offered: ${labels(from).join(' | ')}`)
  return answer(s.ask, r.plan, r.props, s.label)
}
const follow = (r: Run, a: Answer, asked: string[] = [a.id]) => suggestionsFor(r.plan, r.props, asked, a)
const words = (a: Answer) => [plain(a.sentence), ...(a.more ?? []).map(plain)].join(' / ')

/* Every target an answer cites is a real thing of the run; every action carries real ids. */
function targetsReal(r: Run, a: Answer) {
  const policies = new Set(r.plan.policies.map((p) => p.policyId))
  const rules = new Map(r.plan.rules.map((x) => [x.id, x]))
  const ok = (tg: Target) => {
    if (tg === 'person' || tg === 'outcome' || tg === 'screens') return true
    if (tg.startsWith('policy:')) return policies.has(tg.slice(7))
    if (tg.startsWith('rule:')) return rules.has(tg.slice(5))
    if (tg.startsWith('check:')) {
      const [, ruleId, cat] = tg.split(':')
      return rules.get(ruleId)?.checks.some((c) => c.category === cat) ?? false
    }
    return false
  }
  const cited = [...a.sentence, ...(a.more ?? []).flat()].flatMap((p) => (p.cite ? [p.cite] : []))
  for (const tg of [...cited, ...(a.focus ? [a.focus] : [])]) expect(ok(tg), `${a.id}: target ${tg}`).toBe(true)
  expect(a.actions.length).toBeLessThanOrEqual(3)
  for (const act of a.actions) {
    if (act.kind === 'openRule') expect(t.policies.find((p) => p.id === act.policyId)?.rules.some((x) => x.id === act.ruleId), `${a.id}: action rule`).toBe(true)
    if (act.kind === 'openPolicy' || act.kind === 'assumeOn') expect(t.policies.some((p) => p.id === act.policyId), `${a.id}: action policy`).toBe(true)
    if (act.kind === 'asGroup') expect(r.plan.asEachGroup?.groups.some((g) => g.id === act.groupId), `${a.id}: action group`).toBe(true)
    expect(act.label.length).toBeGreaterThan(3)
  }
  expect(a.say).toBe(plain(a.sentence))
  expect(a.say.length).toBeGreaterThan(10)
}

describe('suggestions inside the chat: the opening, ≤ 4', () => {
  it('each case opens with why this answer, the next thing worth asking, what would change it and what they see', () => {
    expect(labels(opening(A))).toEqual(['Why allowed?', 'What would change it?', 'What will Aisha see?'])
    expect(labels(opening(B))).toEqual(['Why allowed?', 'Why not rule 1?', 'What would change it?', 'What will Arun see?'])
    expect(labels(opening(C))).toEqual(['Why allowed?', 'Who else covers Maya?', 'What would change it?', 'What will Maya see?'])
    expect(labels(opening(GD))).toEqual(['Why allowed?', 'Why the Global Default?', 'What would change it?', 'What will Ravi see?'])
    expect(labels(opening(DENY))[0]).toBe('Why denied?')
    expect(labels(opening(DEP))[0]).toBe('Why does it depend?')
  })

  it('every suggestion is ≤ 6 words, a question ends "?", and its answer id is the answer it gives', () => {
    for (const r of Object.values(ALL)) {
      for (const s of opening(r)) {
        expect(s.label.split(/\s+/).length, s.label).toBeLessThanOrEqual(6)
        expect(s.label.endsWith('?')).toBe(true)
        expect(s.icon).toBe('question')
        expect(answer(s.ask!, r.plan, r.props, s.label).id).toBe(s.answerId)
      }
    }
  })

  it('a run with no change that moves it offers no "What would change it?"', () => {
    const still = { ...C, props: { ...C.props, whatIfs: C.props.whatIfs!.filter((w) => !w.changed) } }
    expect(labels(opening(still))).not.toContain('What would change it?')
  })

  it('a group picked ("Anyone in …") offers no per-group runs and says "they"', () => {
    const g = { ...C, props: { ...C.props, asGroup: 'Engineering' } }
    expect(labels(opening(g))).toContain('What will they see?')
    const others = answer('ask:others', g.plan, g.props)
    expect(others.actions.some((x) => x.kind === 'asGroup')).toBe(false)
  })

  it('chipsFor (kept for old callers) is the opening questions', () => {
    expect(chipsFor(C.plan, C.props).map((c) => c.label)).toEqual(labels(opening(C)))
  })
})

describe('follow-ups: ≤ 3 under the latest answer, none asked, none the answer’s own button', () => {
  it('after why: what would change it, what they see — Open rule 2 is already the answer’s button', () => {
    const why = press(C, 'Why allowed?')
    expect(why.actions.map((x) => x.label)).toEqual(['Open rule 2'])
    expect(labels(follow(C, why))).toEqual(['What would change it?', 'What will Maya see?', 'Who else covers Maya?'])
  })

  it('after who else: Run as Finance only (an action, a run) is first', () => {
    const others = press(C, 'Who else covers Maya?')
    const f = follow(C, others)
    expect(others.actions.map((x) => x.label)).toEqual(['Run as Finance only', 'Open rule 2'])
    expect(f.every((s) => s.label !== 'Run as Finance only')).toBe(true)
    expect(f.length).toBeLessThanOrEqual(3)
  })

  it('after what would change it: the run presses; after a depends: run with a value, add the fact', () => {
    const change = press(DENY, 'What would change it?')
    expect(change.actions.map((x) => x.label)).toEqual(['Run with Office network', 'Run with Branch office'])
    const dep = press(DEP, 'Why does it depend?')
    expect(dep.actions.map((x) => x.label)).toEqual(['Run with Windows 10 laptop', 'Run with Windows 11 laptop · registered', 'Add the device'])
    expect(dep.actions.slice(0, 2).every(isRunAction)).toBe(true)
  })

  it('an off policy covering them: "Run as if … were on" follows; it never repeats once asked', () => {
    const why = press(OFF, 'Why allowed?')
    const f = follow(OFF, why)
    const on = f.find((s) => s.action?.kind === 'assumeOn')
    expect(on?.label).toBe('Run as if HRMS access from corporate offices were on')
    expect(on?.icon).toBe('run')
    const again = suggestionsFor(OFF.plan, OFF.props, [why.id, on!.id], why)
    expect(again.some((s) => s.id === on!.id)).toBe(false)
  })

  it('a hole in the break-in attempts: "Review break-in attempts" follows', () => {
    const counts = { held: 10, gotThrough: 2, weakerFactor: 0, lessThanAsked: 0, lockedOut: 0, extraPrompts: 0, undecided: 0, skipped: 0 }
    const r = { ...C, props: { ...C.props, breakIn: { open: false, summary: { appId: 'aws', appName: 'AWS Console', counts, holes: 2 } } } }
    const see = press(r, 'What will Maya see?')
    expect(labels(follow(r, see))).toContain('Review break-in attempts')
    const b = ask(r, 'can anyone break in?')
    expect(plain(b.sentence)).toBe('Break-in attempts on AWS Console: 2 got through, 10 held.')
    expect(b.actions[0]).toEqual({ kind: 'breakIn', label: 'Review break-in attempts' })
    expect(plain(ask(C, 'can anyone break in?').sentence)).toBe('Break-in attempts come once the run is done.')
  })

  it('an unknown ask says so and offers the opening', () => {
    const u = ask(A, 'what is the weather like')
    expect(u.known).toBe(false)
    expect(plain(u.sentence)).toBe('I can answer about this sign-in:')
    expect(labels(follow(A, u))).toEqual(['Why allowed?', 'What would change it?', 'What will Aisha see?'])
  })
})

describe('the answers: every word from the plan', () => {
  it('base A: what Aisha sees, every check (her fact and the rule’s audience said apart)', () => {
    const see = press(A, 'What will Aisha see?')
    expect(plain(see.sentence)).toBe('Aisha Khan is asked for the password, then is in.')
    expect(see.focus).toBe('screens')
    expect(see.actions[0]).toEqual({ kind: 'see', label: 'Show what Aisha sees' })
    const checks = ask(A, 'show me all the checks')
    expect(plain(checks.sentence)).toBe('Rule 1 · Low risk — password reads three checks, and all pass:')
    expect(words(checks)).toContain('Who: Aisha Khan is in Sales · Rule 1 is for Sales, Finance +1')
    expect(words(checks)).not.toContain('Aisha Khan is in Sales, Finance')
    expect(words(checks)).toContain('Risk: Risk score 12 is below 40')
    expect(checks.actions.map((x) => x.label)).toEqual(['Show every check', 'Open rule 1'])
    for (const a of [see, checks]) targetsReal(A, a)
  })

  it('verdict: the decision and the factors by name, decided by which policy and rule', () => {
    const v = ask(B, 'Can Arun get in?')
    expect(v.kind).toBe('verdict')
    expect(plain(v.sentence)).toBe('Arun Patel gets Allow with 2FA · Password → miniOrange Push.')
    expect(words(v)).toContain('Decided by Developer tools — office and device checks · rule 2')
    expect(v.actions[0]).toMatchObject({ kind: 'openRule', label: 'Open rule 2' })
    targetsReal(B, v)
    const d = ask(DENY, 'Can Devon get in?')
    expect(plain(d.sentence)).toBe('Devon Rao is denied: “Contractors reach AWS from a corporate office only.”.')
    targetsReal(DENY, d)
  })

  it('why: policy → rule → the checks that decided; why not rule 1: its failing check', () => {
    const why = press(B, 'Why allowed?')
    expect(plain(why.sentence)).toContain('rule 2 · Compliant device, working remotely is its first rule that matches')
    const not1 = press(B, 'Why not rule 1?')
    expect(plain(not1.sentence)).toBe("Rule 1 · In the office on a compliant device doesn't apply: Home broadband is not in Corporate offices, so the engine reads on to rule 2.")
    expect(not1.tone).toBe('negative')
    expect(not1.focus).toMatch(/^check:.*:network$/)
    expect(not1.actions[0]).toMatchObject({ kind: 'openRule', label: 'Open rule 1' })
    for (const a of [why, not1]) targetsReal(B, a)
  })

  it('Devon Rao: why denied names the rule, its checks and the message', () => {
    const deny = press(DENY, 'Why denied?')
    expect(plain(deny.sentence)).toBe('Devon Rao is denied: AWS for engineering teams is the first policy on AWS Console that covers Devon, and rule 1 · Contractors away from the office is its first rule that matches.')
    expect(deny.tone).toBe('negative')
    expect(words(deny)).toContain('Who: Devon Rao is in Contractors')
    expect(words(deny)).toContain('They see “Contractors reach AWS from a corporate office only.”')
    targetsReal(DENY, deny)
  })

  it('base C: the other policy that also covers Maya, the fix, and Run as Finance only', () => {
    const others = press(C, 'Who else covers Maya?')
    expect(plain(others.sentence)).toBe('AWS billing for Finance also covers Maya via Finance and would allow with 2FA (rule 1) — it isn’t used: AWS for engineering teams comes first, and only the first policy that covers someone applies.')
    expect(others.focus).toBe('policy:sc-aws-finance')
    expect(others.actions[0]).toEqual({ kind: 'asGroup', groupId: 'finance', label: 'Run as Finance only' })
    expect(others.actions[1]).toMatchObject({ kind: 'openRule', policyId: 'sc-aws-engineering', label: 'Open rule 2' })
    const fin = ask(C, 'what about as Finance only?')
    expect(plain(fin.sentence)).toBe('As Finance alone, Maya would get allow with 2FA — AWS billing for Finance · rule 1.')
    for (const a of [others, fin]) targetsReal(C, a)
  })

  it('Ravi Menon: the Global Default, and the three policies he is outside of', () => {
    const gd = press(GD, 'Why the Global Default?')
    expect(plain(gd.sentence)).toBe('No AWS Console policy covers Ravi Menon (IT Admins), so the tenant’s fallback, the Global Default Policy, decides.')
    expect(words(gd)).toContain('1. AWS for engineering teams · Covers Engineering, DevOps, Contractors')
    expect(gd.more).toHaveLength(3)
    targetsReal(GD, gd)
    expect(plain(ask(A, 'why not the global default?').sentence)).toContain("Global Default Policy isn't used: Access the app through corporate devices only covers Aisha first")
  })

  it('Arun, device not stated: why it depends, each answer, run with a value or add the device', () => {
    const dep = press(DEP, 'Why does it depend?')
    expect(plain(dep.sentence)).toBe("It depends on the device: it is not stated, so rule 1 and rule 2 can't tell.")
    expect(dep.tone).toBe('notice')
    expect(dep.more?.slice(0, 3).map(plain)).toEqual(['If rule 1 matches: allow on 1 factor', 'If rule 2 matches: allow with 2FA', 'If not: deny'])
    expect(dep.actions[2]).toEqual({ kind: 'add', field: 'device', label: 'Add the device' })
    const see = ask(DEP, 'what will he see')
    expect(words(see)).toContain('If not: blocked, with')
    for (const a of [dep, see]) targetsReal(DEP, a)
  })

  it('what would change it: only the previews that change it, as previews, and runs for the first two', () => {
    const c = press(DENY, 'What would change it?')
    expect(plain(c.sentence)).toContain('would change the answer — previews, not runs')
    expect(c.more?.map(plain)).toEqual(['From Office network → Allow with 2FA (rule 3)', 'From Branch office → Allow with 2FA (rule 3)'])
    expect(c.actions[0]).toMatchObject({ kind: 'runWith', field: 'address', patch: { origin: 'office' } })
    expect(c.previewing).toEqual(['address'])
  })

  it('what would change it: impersonal, a count that matches the list, every row one change or says it is two', () => {
    const c = press(DENY, 'What would change it?')
    const sentence = plain(c.sentence)
    expect(sentence).not.toMatch(/I|one-fact|tried/)
    for (const line of c.more ?? []) expect(plain(line)).not.toMatch(/I|tried|also sets/)
    const rows = (c.more ?? []).filter((x) => plain(x).includes(' → '))
    expect(sentence).toBe(`${rows.length} of the ${DENY.props.whatIfs!.length} previewed changes would change the answer — previews, not runs:`)
    expect(rows).toHaveLength(DENY.props.whatIfs!.filter((w) => w.changed).length)
    const none = ask({ ...DENY, props: { ...DENY.props, whatIfs: DENY.props.whatIfs!.filter((w) => !w.changed) } }, 'What would change it?')
    expect(plain(none.sentence)).toMatch(/^None of the \d+ previewed changes to the network, device and risk score would change the answer\.$/)
  })

  it('a "From" preview changes only the network, unless a rule reads a place the sign-in states: then it names both', () => {
    const rows = rowsRead(t.policies, null, DENY.form.appId!, lib)
    const without = new Set([...rows.rows].filter((r) => r !== 'place'))
    const from = (form: SignInForm, readsPlace: boolean) => variationsOf(form, { ...rows, rows: readsPlace ? new Set([...without, 'place' as const]) : without }).filter((v) => v.field === 'address')
    const stated = { ...DENY.form, place: { kind: 'stated', placeId: 'x' } } as SignInForm
    const derived = { ...DENY.form, place: { kind: 'from-address' } } as SignInForm
    /* Place not read, or already read off the address: the patch is the network alone — one field. */
    for (const v of [...from(stated, false), ...from(derived, true), ...from(derived, false)]) {
      expect(Object.keys(v.patch).sort()).toEqual(['address', 'addressSource', 'origin'])
      expect(v.label).not.toContain('place')
    }
    /* Read, and stated apart from the address: the place comes along, and every word that names the change says so. */
    const two = from(stated, true)
    expect(two.length).toBeGreaterThan(0)
    for (const v of two) {
      expect(v.patch.place).toEqual({ kind: 'from-address' })
      expect(v.label).toMatch(/ and its place$/)
      expect(v.value).toMatch(/ and its place$/)
    }
  })

  it('why not rule n: the rule the engine reads on to skips a switched-off rule', () => {
    const r1 = B.plan.rules.find((x) => x.index === 0)!
    const at = B.plan.rules.indexOf(r1)
    const rules = B.plan.rules.map((x, i) => (i === at + 1 ? { ...x, state: 'off' as const, visited: false } : x))
    const next = rules.slice(at + 1).find((x) => x.state !== 'off')!
    const plan = { ...B.plan, rules }
    const a = answer('Why not rule 1?', plan, B.props)
    const said = plain(a.sentence)
    expect(said).not.toContain(`reads on to rule ${at + 2},`)
    expect(said).toContain(`so the engine reads on to ${next.index === null ? 'Nothing else matched' : `rule ${next.index + 1}`}.`)
    /* Every later rule off: nothing to read, said plainly, never a rule that is switched off. */
    const none = { ...B.plan, rules: B.plan.rules.map((x, i) => (i > at && x.index !== null ? { ...x, state: 'off' as const, visited: false } : x)) }
    expect(plain(answer('Why not rule 1?', none, B.props).sentence)).toContain('reads on to Nothing else matched')
    const last = { ...B.plan, rules: B.plan.rules.map((x, i) => (i > at ? { ...x, state: 'off' as const, visited: false } : x)) }
    expect(plain(answer('Why not rule 1?', last, B.props).sentence)).toContain('no rule is left to read after it')
  })

  it('an off policy: what turning it on would do, and the press that runs it so', () => {
    const off = ask(OFF, 'what if HRMS access were on?')
    expect(plain(off.sentence)).toBe('HRMS access from corporate offices · Switched off — on, it would decide Allow with 2FA (rule 1).')
    expect(off.actions[0]).toEqual({ kind: 'assumeOn', policyId: 'sc-hrms-office', label: 'Run as if HRMS access from corporate offices were on' })
    expect(off.acts).toBe(false)
    targetsReal(OFF, off)
  })

  it('save is a later phase; edit and replay offer their press', () => {
    expect(plain(ask(C, 'save this as a test').sentence)).toBe('Saving a sign-in as a test comes in a later phase.')
    expect(ask(C, 'save this as a test').actions).toEqual([])
    expect(ask(C, 'Edit the sign-in').actions[0]).toEqual({ kind: 'edit', label: 'Edit the sign-in' })
    expect(ask(C, 'replay').actions[0]).toEqual({ kind: 'replay', label: 'Replay' })
  })

  it('every suggestion of every case answers, cites real things and never throws', () => {
    for (const r of Object.values(ALL)) {
      for (const s of opening(r)) {
        const a = answer(s.ask!, r.plan, r.props, s.label)
        expect(a.known, s.label).toBe(true)
        expect(a.ask).toBe(s.label)
        expect(a.acts).toBe(false)
        targetsReal(r, a)
        for (const f of follow(r, a)) if (f.ask) targetsReal(r, answer(f.ask, r.plan, r.props, f.label))
      }
      for (const q of ['', '   ', 'rule 99', 'open', 'device', 'network', 'who is this', 'groups', 'conflict', 'depends', 'see', 'deny', 'run', 'what if', 'turn on', 'Acme']) expect(() => answer(q, r.plan, r.props)).not.toThrow()
    }
  })
})

describe('acting on words: only a command acts, and a run only when the words say run', () => {
  it('a question never acts; it answers and offers the press', () => {
    for (const q of ['why?', 'Why denied?', "what if she's at home?", 'Can Maya get into GitHub from home on her Android?', 'turn on HRMS access?', 'who else covers her?', 'what will she see?']) {
      const r = q.includes('HRMS') ? OFF : C
      expect(ask(r, q).acts, q).toBe(false)
    }
  })

  it('a run-starting press acts only when the words say run', () => {
    expect(ask(C, 'run as Finance only')).toMatchObject({ id: 'group:finance', acts: true })
    expect(ask(C, 'as Finance only')).toMatchObject({ id: 'group:finance', acts: false })
    expect(ask(C, 'run with home broadband').acts).toBe(true)
    expect(ask(C, 'Set the device to Android 12 and run')).toMatchObject({ kind: 'what-if-value', acts: true })
    expect(ask(C, 'Set the device to Android 12').acts).toBe(false)
    expect(ask(C, 'run it again')).toMatchObject({ kind: 'replay', acts: true })
    expect(ask(C, 'replay').acts).toBe(true)
    expect(ask(OFF, 'run as if HRMS access from corporate offices were on')).toMatchObject({ kind: 'off', acts: true })
    expect(ask(OFF, 'turn on HRMS access').acts).toBe(false)
  })

  it('the others act on an imperative', () => {
    expect(ask(C, 'open the rule')).toMatchObject({ kind: 'open', acts: true })
    expect(ask(C, 'fix it')).toMatchObject({ kind: 'open', acts: true })
    expect(ask(C, 'show every check')).toMatchObject({ kind: 'checks', acts: true })
    expect(ask(C, 'show what Maya sees')).toMatchObject({ kind: 'see', acts: true })
    expect(ask(C, 'Edit the sign-in')).toMatchObject({ kind: 'edit', acts: true })
    expect(ask(DEP, 'add the device')).toMatchObject({ kind: 'add', acts: true })
  })

  it('"run it" after a preview runs what the preview offered', () => {
    const home = ask(C, "what if she's at home?")
    const run = ask(C, 'try it for real', home)
    expect(run.acts).toBe(true)
    expect(run.actions[0]).toMatchObject({ kind: 'runWith', label: 'Run with Home broadband' })
  })
})

describe('previews: never the page’s sign-in, always with the press that makes it real', () => {
  it('a fact changed: the preview said, Run with that value', () => {
    const home = ask(C, "what if she's at home?")
    expect(home.kind).toBe('what-if-value')
    expect(plain(home.sentence)).toBe('From Home broadband: same answer — allow on 1 factor (rule 2).')
    expect(home.actions[0]).toMatchObject({ kind: 'runWith', field: 'address', patch: { origin: 'home' }, label: 'Run with Home broadband' })
    expect(home.previewing).toEqual(['address'])
    const android = ask(C, 'try an Android phone')
    expect(plain(android.sentence)).toBe('On Android 12 phone Maya is denied (Nothing else matched).')
    expect(android.tone).toBe('negative')
    const risk = ask(A, 'what if the risk is 86?')
    expect(plain(risk.sentence)).toBe('With risk 86 Aisha is denied (rule 3).')
    expect(risk.actions[0].label).toBe('Run with risk 86')
  })

  it('a sentence of its own: what it read, the preview, Run this sign-in', () => {
    const s = ask(C, 'Can Maya get into GitHub from home on her Android?')
    expect(s.kind).toBe('sign-in')
    expect(plain(s.sentence)).toBe('Read: Maya Iyer · GitHub Enterprise · Home broadband · Android 12 phone.')
    expect(words(s)).toContain('Maya Iyer on GitHub Enterprise: Deny')
    expect(s.actions[0]).toMatchObject({ kind: 'runWith', label: 'Run this sign-in', field: 'app', patch: { appId: 'github', origin: 'home', device: { kind: 'preset', id: 'android-12' } } })
    expect(s.actions[0].kind === 'runWith' && 'personId' in s.actions[0].patch).toBe(false)
  })

  it('a word it cannot place is said, never guessed', () => {
    const s = ask(C, 'Can Maya get into Acme VPN?')
    expect(plain(s.sentence)).toBe("I didn't recognise 'Acme VPN'.")
    expect(s.actions).toEqual([])
    expect(ask(C, 'Can Maya get into GitHub from Acme VPN?').more?.map(plain)).toContain("I didn't recognise 'Acme VPN'.")
  })
})

describe('readSignIn: a fixed reader of the tenant’s names', () => {
  it('people by full or first name, apps by name or their own word, origins, devices, risk, time', () => {
    const r = readSignIn('Can Maya get into GitHub from home on her Android?', dict)
    expect(r.read).toEqual(['Maya Iyer', 'GitHub Enterprise', 'Home broadband', 'Android 12 phone'])
    expect(r.fields).toEqual(['person', 'app', 'address', 'device'])
    expect(r.unread).toEqual([])
    expect(readSignIn('Aisha Khan on Google Workspace with risk score of 55 at 22:30', dict)).toMatchObject({ read: ['Aisha Khan', 'Google Workspace', '22:30', 'Risk 55'], patch: { risk: '55', time: '22:30' } })
    expect(readSignIn('on an unregistered Windows laptop from the branch', dict).patch).toMatchObject({ device: { kind: 'preset', id: 'win11-unregistered' }, origin: 'branch' })
    expect(readSignIn('Windows 10 at 9 pm', dict).patch).toMatchObject({ device: { kind: 'preset', id: 'win10' }, time: '21:00' })
    expect(readSignIn('with no device', dict).patch).toEqual({ device: { kind: 'none' } })
  })

  it('groups are said back, never a field; unknown names are unread', () => {
    const r = readSignIn('Can anyone in Finance reach Acme VPN on Monday?', dict)
    expect(r.groups.map((g) => g.name)).toEqual(['Finance'])
    expect(r.fields).toEqual([])
    expect(r.unread).toEqual(['Acme VPN', 'Monday'])
  })
})

describe('acting and narrating', () => {
  it('runAction calls the layout’s own way out, with the ids; the view’s own come back false', () => {
    const calls: string[] = []
    const props: AskProps = {
      ...C.props,
      onAsGroup: (g) => calls.push(`group ${g}`),
      onOpenRule: (p, r) => calls.push(`rule ${p} ${r}`),
      onAdd: (f) => calls.push(`add ${f}`),
      onOpenPolicy: (p) => calls.push(`policy ${p}`),
      onRunWith: (patch, f) => calls.push(`run ${f} ${JSON.stringify(patch)}`),
      onReplay: () => calls.push('replay'),
      onPressPerson: () => calls.push('edit'),
      onReviewBreakIn: (from) => calls.push(`break-in ${from}`),
    }
    const others = press(C, 'Who else covers Maya?')
    for (const a of others.actions) expect(runAction(a, props)).toBe(true)
    expect(runAction({ kind: 'assumeOn', policyId: 'sc-hrms-office', label: 'x' }, props)).toBe(true)
    expect(runAction({ kind: 'runWith', patch: { risk: '55' }, field: 'risk', label: 'x' }, props)).toBe(true)
    expect(runAction({ kind: 'replay', label: 'Replay' }, props)).toBe(true)
    expect(runAction({ kind: 'add', field: 'device', label: 'x' }, props)).toBe(true)
    expect(runAction({ kind: 'edit', label: 'x' }, props)).toBe(true)
    expect(runAction({ kind: 'breakIn', label: 'x' }, props)).toBe(true)
    expect(runAction({ kind: 'see', label: 'x' }, props)).toBe(false)
    expect(runAction({ kind: 'checks', label: 'x' }, props)).toBe(false)
    const rule2 = C.plan.rules[1]
    expect(calls).toEqual(['group finance', `rule sc-aws-engineering ${rule2.id}`, 'run assume-on {"assumeOn":"sc-hrms-office"}', 'run risk {"risk":"55"}', 'replay', 'add device', 'edit', 'break-in outcome'])
  })

  it('didLine: the thread’s one line for a press', () => {
    expect(didLine({ kind: 'asGroup', groupId: 'finance', label: 'Run as Finance only' })).toBe('Running as Finance only.')
    expect(didLine({ kind: 'runWith', patch: {}, field: 'address', label: 'Run with Home broadband' })).toBe('Running with Home broadband.')
    expect(didLine({ kind: 'openRule', policyId: 'p', ruleId: 'r', label: 'Open rule 2' })).toBe('Opening rule 2 in the builder.')
    expect(didLine({ kind: 'see', label: 'Show what Maya sees' })).toBe('Showing what Maya sees.')
    expect(didLine({ kind: 'replay', label: 'Replay' })).toBe('Replaying the run.')
  })

  it('narration: the run’s few lines, from the plan', () => {
    expect(narration(C.plan, C.props)).toMatchObject({
      start: 'Checking Maya Iyer on AWS Console.',
      policy: 'AWS for engineering teams covers Maya, through Engineering.',
      rules: "Rule one doesn't apply: Maya Iyer is not in Contractors. Rule two matches.",
      verdict: 'Allowed, on one factor.',
    })
    expect(narration(GD.plan, GD.props).policy).toBe('No AWS Console policy covers Ravi. The Global Default applies.')
    expect(narration(DENY.plan, DENY.props).verdict).toBe('Denied.')
    expect(narration(B.plan, B.props).verdict).toBe('Allowed, with a second factor: miniOrange Push.')
    expect(narration(DEP.plan, DEP.props).verdict).toBe('It depends on the device.')
  })
})

describe('How was it decided, typed (a view with `how`: Brief)', () => {
  it('a question answers with the press first; "show me" performs it, never the builder', () => {
    const how = (r: Run, q: string) => answer(q, r.plan, { ...r.props, how: true })
    const q = how(C, 'how was it decided?')
    expect(q.actions[0]).toEqual({ kind: 'how', label: 'How was it decided?' })
    expect(q.acts).toBe(false)
    const show = how(DENY, 'show me how it was decided')
    expect(show.actions[0]?.kind).toBe('how')
    expect(show.acts).toBe(true)
    /* Without `how` (Focus, Jarvis), as before. */
    expect(ask(C, 'how was it decided?').actions.some((a) => a.kind === 'how')).toBe(false)
  })
})
