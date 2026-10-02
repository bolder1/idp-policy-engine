import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../../fixtures'
import { runColumns, type ColumnSpec } from '../../../board/try-sign-in'
import { envOf } from '../../../tenant-resolver'
import { rowsRead } from '../../../testing/rows-read'
import { screensOf } from '../../../testing/screens-of'
import { factsOf, originPatch, type SignInForm } from '../../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../../engine-run'
import { emptyDraft, forRun, withDefaults } from '../../sign-in-card'
import { answer, chipsFor, narration, plain, runAction, type Answer, type AskProps, type Target } from './intents'

/* -----------------------------------------------------------------------------
   The assistant's words over REAL runs of the showcase tenant, built as the
   page builds them (layouts-render.test.tsx): the chips each run offers make
   sense for it, every answer's words are the plan's (names, rule numbers,
   failing checks), every citation names a real thing, and every action
   carries real ids.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

interface Run {
  plan: EngineRun
  props: AskProps
}

function runOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; group?: boolean } = {}): Run {
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
  return { plan, props: { asGroup: null, screens, onAsGroup: () => {}, onAdd: () => {}, onOpenRule: () => {}, onOpenPolicy: () => {} } }
}

const A = runOf('Aisha Khan', 'Google Workspace')
const B = runOf('Arun Patel', 'GitHub Enterprise', { origin: 'home' })
const C = runOf('Maya Iyer', 'AWS Console')
const GD = runOf('Ravi Menon', 'AWS Console')
const DENY = runOf('Devon Rao', 'AWS Console', { origin: 'home' })
const DEP = runOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })

const labels = (r: Run) => chipsFor(r.plan, r.props).map((c) => c.label)
const ask = (r: Run, q: string) => answer(q, r.plan, r.props)
const askChip = (r: Run, label: string): Answer => {
  const chip = chipsFor(r.plan, r.props).find((c) => c.label === label)
  if (!chip) throw new Error(`no chip "${label}" — chips: ${labels(r).join(' | ')}`)
  return answer(chip.id, r.plan, r.props, chip.label)
}
const words = (a: Answer) => [plain(a.sentence), ...(a.more ?? []).map(plain)].join(' / ')

/* Every target an answer cites is a real thing of the run. */
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
  const act = a.action
  if (act?.kind === 'openRule') expect(t.policies.find((p) => p.id === act.policyId)?.rules.some((x) => x.id === act.ruleId), `${a.id}: action rule`).toBe(true)
  if (act?.kind === 'openPolicy') expect(t.policies.some((p) => p.id === act.policyId), `${a.id}: action policy`).toBe(true)
  if (act?.kind === 'asGroup') expect(r.plan.asEachGroup?.groups.some((g) => g.id === act.groupId), `${a.id}: action group`).toBe(true)
  expect(a.say).toBe(plain(a.sentence))
  expect(a.say.length).toBeGreaterThan(10)
}

describe('the chips: only questions this run has a real answer to', () => {
  it('base A, Aisha Khan → Google Workspace (clean, one factor): no "why not", no group, no device', () => {
    const l = labels(A)
    expect(l).toEqual(expect.arrayContaining(['What will Aisha see?', 'Show every check', 'Open rule 1']))
    expect(l.some((x) => /^Why not rule/.test(x))).toBe(false)
    expect(l.some((x) => /only$/.test(x))).toBe(false)
    expect(l.some((x) => /^Set the/.test(x))).toBe(false)
    expect(l.some((x) => /Who else|Global Default/.test(x))).toBe(false)
  })

  it('base B, Arun Patel → GitHub from home: why not rule 1, open rule 2', () => {
    const l = labels(B)
    expect(l[0]).toBe('Why not rule 1?')
    expect(l).toContain('Open rule 2')
    expect(l).not.toContain('Why not rule 2?')
  })

  it('base C, Maya Iyer → AWS Console: why not rule 1, who else covers Maya, each of her two groups', () => {
    const l = labels(C)
    expect(l).toEqual(expect.arrayContaining(['Why not rule 1?', 'Who else covers Maya?', 'As Finance only']))
    expect(l).not.toContain('Why the Global Default?')
    expect(l.length).toBeLessThanOrEqual(6)
  })

  it('Ravi Menon → AWS Console: why the Global Default — and no "who else"', () => {
    const l = labels(GD)
    expect(l[0]).toBe('Why the Global Default?')
    expect(l.some((x) => /Who else/.test(x))).toBe(false)
    expect(l.some((x) => /only$/.test(x))).toBe(false)
  })

  it('Devon Rao → AWS Console from home: why denied first', () => {
    expect(labels(DENY)[0]).toBe('Why denied?')
  })

  it('Arun Patel → GitHub, device not stated: why it depends, then set the device; no "show every check" or "open rule"', () => {
    const l = labels(DEP)
    expect(l[0]).toBe('Why does it depend?')
    expect(l).toContain('Set the device')
    expect(l).not.toContain('Show every check')
    expect(l.some((x) => /^Open rule/.test(x))).toBe(false)
  })

  it('a group picked ("Anyone in …") offers no per-group runs', () => {
    const g = { ...C, props: { ...C.props, asGroup: 'Engineering' } }
    expect(labels(g).some((x) => /only$/.test(x))).toBe(false)
    expect(labels(g)).toContain('What will they see?')
  })
})

describe('the answers: every word from the plan', () => {
  it('base A: what Aisha sees, every check (her fact and the rule’s audience said apart), open rule 1', () => {
    const see = askChip(A, 'What will Aisha see?')
    expect(plain(see.sentence)).toBe('Aisha Khan is asked for the password, then is in.')
    expect(see.focus).toBe('screens')
    const checks = askChip(A, 'Show every check')
    expect(plain(checks.sentence)).toBe('Rule 1 · Low risk — password reads three checks, and all pass:')
    expect(words(checks)).toContain('Who: Aisha Khan is in Sales · Rule 1 is for Sales, Finance +1')
    expect(words(checks)).not.toContain('Aisha Khan is in Sales, Finance')
    expect(words(checks)).toContain('Risk: Risk score 12 is below 40')
    const open = askChip(A, 'Open rule 1')
    expect(open.action).toMatchObject({ kind: 'openRule', policyId: 'sc-corporate-devices', label: 'Open rule 1 ↗' })
    for (const a of [see, checks, open]) targetsReal(A, a)
  })

  it('base B: rule 1 failed on the network, rule 2 decided with a second factor', () => {
    const why = askChip(B, 'Why not rule 1?')
    expect(plain(why.sentence)).toBe("Rule 1 · In the office on a compliant device doesn't apply: Home broadband is not in Corporate offices, so the engine reads on to rule 2.")
    expect(why.tone).toBe('negative')
    expect(why.focus).toMatch(/^check:.*:network$/)
    const verdict = ask(B, 'what does she get?')
    expect(plain(verdict.sentence)).toContain('Arun Patel gets allow with 2FA')
    expect(plain(verdict.sentence)).toContain('rule 2 · Compliant device, working remotely is its first rule that matches')
    expect(words(verdict)).toContain('the password, then miniOrange Push')
    for (const a of [why, verdict]) targetsReal(B, a)
  })

  it('base C: rule 1 ✕ on who, and the second policy that also covers Maya', () => {
    const why = askChip(C, 'Why not rule 1?')
    expect(plain(why.sentence)).toContain("Rule 1 · Contractors away from the office doesn't apply: Maya Iyer is not in Contractors")
    const others = askChip(C, 'Who else covers Maya?')
    expect(plain(others.sentence)).toBe('AWS billing for Finance also covers Maya via Finance and would allow with 2FA (rule 1) — it isn’t used: AWS for engineering teams comes first, and only the first policy that covers someone applies.')
    expect(others.tone).toBe('notice')
    expect(others.focus).toBe('policy:sc-aws-finance')
    expect(others.action).toMatchObject({ kind: 'openRule', policyId: 'sc-aws-engineering', label: 'Open rule 2 ↗' })
    const fin = askChip(C, 'As Finance only')
    expect(plain(fin.sentence)).toBe('As Finance alone, Maya would get allow with 2FA — AWS billing for Finance · rule 1.')
    expect(fin.action).toEqual({ kind: 'asGroup', groupId: 'finance', label: 'Run as Finance only' })
    expect(ask(C, 'run as finance only').id).toBe('group:finance')
    for (const a of [why, others, fin]) targetsReal(C, a)
  })

  it('Ravi Menon: the Global Default, and the three policies that do not cover him', () => {
    const gd = askChip(GD, 'Why the Global Default?')
    expect(plain(gd.sentence)).toBe('No AWS Console policy covers Ravi Menon (IT Admins), so the tenant’s fallback, the Global Default Policy, decides.')
    expect(words(gd)).toContain('1. AWS for engineering teams · Covers Engineering, DevOps, Contractors')
    expect(gd.more).toHaveLength(3)
    targetsReal(GD, gd)
    /* Asked of a run the Global Default does not decide, it says why not. */
    expect(plain(ask(A, 'why not the global default?').sentence)).toContain("Global Default Policy isn't used: Access the app through corporate devices only covers Aisha first")
  })

  it('Devon Rao: denied by rule 1, with the message the person sees', () => {
    const deny = askChip(DENY, 'Why denied?')
    expect(plain(deny.sentence)).toBe('Devon Rao is denied: AWS for engineering teams is the first policy on AWS Console that covers Devon, and rule 1 · Contractors away from the office is its first rule that matches.')
    expect(deny.tone).toBe('negative')
    expect(words(deny)).toContain('Rule 1 matches: Devon Rao is in Contractors and Home broadband is not in Corporate offices')
    expect(words(deny)).toContain('“Contractors reach AWS from a corporate office only.”')
    const see = askChip(DENY, 'What will Devon see?')
    expect(plain(see.sentence)).toBe('Devon Rao is blocked, with “Contractors reach AWS from a corporate office only.”.')
    for (const a of [deny, see]) targetsReal(DENY, a)
  })

  it('Arun Patel, device not stated: why it depends, each answer it could be, set the device', () => {
    const dep = askChip(DEP, 'Why does it depend?')
    expect(plain(dep.sentence)).toBe("It depends on the device: it is not stated, so rule 1 and rule 2 can't tell.")
    expect(dep.tone).toBe('notice')
    expect(dep.more?.map(plain)).toEqual(['If rule 1 matches: allow on 1 factor', 'If rule 2 matches: allow with 2FA', 'If not: deny'])
    expect(dep.action).toEqual({ kind: 'add', field: 'device', label: 'Set the device' })
    const set = askChip(DEP, 'Set the device')
    expect(plain(set.sentence)).toBe("The device is not stated, so rule 1 and rule 2 can't tell. State it to see which rule decides.")
    const see = ask(DEP, 'what will he see')
    expect(words(see)).toContain('If not: blocked, with')
    for (const a of [dep, set, see]) targetsReal(DEP, a)
  })

  it('typed asks find their intent; an unknown ask says so honestly', () => {
    expect(ask(B, 'why did rule one fail?').id).toBe('why-rule:1')
    expect(ask(B, 'Open rule 1').action).toMatchObject({ kind: 'openRule', label: 'Open rule 1 ↗' })
    expect(ask(C, 'any conflict?').id).toBe('others')
    expect(ask(A, 'show me all the checks').id).toBe('checks')
    expect(ask(A, 'why not rule 7').sentence.map((p) => p.text).join('')).toContain('there is no rule 7')
    expect(ask(A, 'why not rule 1').id).toBe('why-rule:1')
    expect(plain(ask(A, 'why not rule 1').sentence)).toContain('Rule 1 · Low risk — password matches')
    const u = ask(A, 'what is the weather like')
    expect(u.known).toBe(false)
    expect(plain(u.sentence)).toBe("I can explain this sign-in's policies, rules and outcome — try one of these.")
    expect(ask(A, 'as finance only').sentence.map((p) => p.text).join('')).toContain('is only in Sales')
  })

  it('every chip of every case answers, cites real things and never throws', () => {
    for (const r of [A, B, C, GD, DENY, DEP]) {
      for (const c of chipsFor(r.plan, r.props)) {
        const a = answer(c.id, r.plan, r.props, c.label)
        expect(a.known, `${c.label}`).toBe(true)
        expect(a.ask).toBe(c.label)
        targetsReal(r, a)
      }
      for (const q of ['', '   ', 'rule 99', 'open', 'device', 'network', 'who is this', 'groups', 'conflict', 'depends', 'see', 'deny']) expect(() => answer(q, r.plan, r.props)).not.toThrow()
    }
  })
})

describe('acting and narrating', () => {
  it('runAction calls the layout’s own way out, with the ids', () => {
    const calls: string[] = []
    const props: AskProps = { ...C.props, onAsGroup: (g) => calls.push(`group ${g}`), onOpenRule: (p, r) => calls.push(`rule ${p} ${r}`), onAdd: (f) => calls.push(`add ${f}`), onOpenPolicy: (p) => calls.push(`policy ${p}`) }
    const fin = askChip(C, 'As Finance only')
    if (fin.action) runAction(fin.action, props)
    const others = askChip(C, 'Who else covers Maya?')
    if (others.action) runAction(others.action, props)
    const dep = askChip(DEP, 'Set the device')
    if (dep.action) runAction(dep.action, props)
    const rule2 = C.plan.rules[1]
    expect(calls).toEqual(['group finance', `rule sc-aws-engineering ${rule2.id}`, 'add device'])
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
