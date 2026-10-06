import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import type { Tenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { watchingSentence, watchingWords } from '../../watching-words'
import { engineRun, type EngineRun } from '../engine-run'
import { GROUP_PREFIX, emptyDraft, forRun, personPick, withDefaults } from '../sign-in-card'
import { answer, plain, type AskProps, type ChipId } from './assistant/intents'
import { previewOf, rankWhatIfs, variationsOf, wordsOfPlan, type WhatIf } from './assistant/what-if'
import { FAQ_EACH, FAQ_WATCHING, copyText, eachAnswer, faqOf, noteOf, presentAnswer, topQuestions, watchingAnswer, watchingLead, WATCHING_JOINS, PREVIEW_NOTE } from './focus2-faq'
import type { RunIdentity } from './types'

/* -----------------------------------------------------------------------------
   THE ANSWERS PANEL'S QUESTIONS, over REAL runs of the showcase tenant.

   The one property this file exists to hold, because it is the defect the
   panel was built to close:

     NO ANSWER IS INVENTED.

   Every row `faqOf` offers is swept over every showcase person × application
   and asserted to resolve to a real answer — `known`, not `unknown`, with
   words in it, and never the "there is no rule n" / "it doesn't depend on
   anything" correction branch. The allowed `ask` values are ENUMERATED, so a
   row added later with a new id fails here until it is proven the same way.

   The second property is the locally-composed answers: every word of
   `watchingAnswer` is either one of this file's own fixed phrases or a field
   of `WatchedResult`, said by `watching-words.ts`; and `eachAnswer` lists
   every identity of a Run once, read off that identity's own run.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

interface Run {
  name: string
  plan: EngineRun
  props: AskProps
}

function runOf(tenant: Tenant, personId: string | null, appId: string | null, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; previews?: boolean } = {}): Run {
  const person = personId === null ? null : (tenant.directory.people.find((p) => p.id === personId) ?? null)
  const rows = rowsRead(tenant.policies, null, appId, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId, appId }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, tenant.zones)
  const res = runColumns([AS_IT_STANDS], tenant.policies, facts, env)[0].resolution
  const ctx = { people: tenant.directory.people, apps: tenant.apps, zones: tenant.zones, rows }
  const plan = engineRun({ res, policies: tenant.policies, form, facts, env, ctx, intro: 'none' })
  let whatIfs: WhatIf[] | undefined
  if (opts.previews) {
    const deps = { policies: tenant.policies, zones: tenant.zones, fingerprints: tenant.fingerprints, users: tenant.directory.people, apps: tenant.apps, methods: tenant.methods, defaultMethodId: undefined, env }
    const out: WhatIf[] = []
    for (const v of variationsOf(form, rows)) {
      const w = previewOf(form, v.patch, deps, plan, v)
      if (w) out.push(w)
    }
    whatIfs = rankWhatIfs(out, plan)
  }
  const props: AskProps = {
    asGroup: null,
    screens: screensOf(res, { policies: tenant.policies, methods: tenant.methods, defaultMethodId: undefined, person }),
    form,
    rows,
    onAsGroup: () => {},
    onAdd: () => {},
    onOpenRule: () => {},
    onOpenPolicy: () => {},
    onRunWith: () => {},
    ...(whatIfs ? { whatIfs } : {}),
  }
  return { name: `${person?.name ?? 'nobody'} → ${tenant.apps.find((a) => a.id === appId)?.name ?? 'nothing'}`, plan, props }
}

/** Every person × every application: the widest sweep the plan can be built for. */
const everyone = (): Run[] => t.directory.people.flatMap((p) => t.apps.map((a) => runOf(t, p.id, a.id)))
/** A few runs with the one-fact previews actually computed, which is what question 12 is gated on. */
const withPreviews = (): Run[] => {
  const pick = (name: string, app: string, patch?: Partial<SignInForm>) => {
    const p = t.directory.people.find((x) => x.name === name)
    const a = t.apps.find((x) => x.name === app)
    if (!p || !a) throw new Error(`no ${name} or ${app} in the showcase`)
    return runOf(t, p.id, a.id, { previews: true, ...(patch ? { patch } : {}) })
  }
  return [
    pick('Maya Iyer', 'AWS Console'),
    pick('Arun Patel', 'GitHub Enterprise', { device: { kind: 'none' } } as Partial<SignInForm>),
    pick('Kavya Menon', 'HRMS'),
  ]
}

const CHIP = /^ask:/
const BAD_IDS = /:none$/

describe('no answer is invented', () => {
  it('offers only questions whose answer the run actually holds, for every showcase person and application', () => {
    const runs = [...everyone(), ...withPreviews()]
    let rows = 0
    for (const { name, plan, props } of runs) {
      for (const g of faqOf(plan, props)) {
        expect(g.rows.length, `${name} · ${g.key}`).toBeGreaterThan(0)
        for (const r of g.rows) {
          rows += 1
          const where = `${name} · ${r.id} · "${r.label}"`
          /* The allowed values, enumerated: a chip the dock can answer, or the one composed here. */
          if (r.ask === FAQ_WATCHING) {
            const a = watchingAnswer(plan)
            expect(a, where).not.toBeNull()
            expect(plain(a?.sentence ?? []).trim().length, where).toBeGreaterThan(0)
            continue
          }
          expect(r.ask, where).toMatch(CHIP)
          const a = answer(r.ask as ChipId, plan, props, r.label)
          expect(a.known, where).toBe(true)
          expect(a.kind, where).not.toBe('unknown')
          expect(plain(a.sentence).trim().length, where).toBeGreaterThan(0)
          /* The correction branches: "there is no rule 4", "it doesn't depend on anything". A question answered
             with one of those is a question that should never have been offered. */
          expect(a.id, where).not.toMatch(BAD_IDS)
        }
      }
    }
    /* The sweep is worth something only if it actually saw rows. */
    expect(rows).toBeGreaterThan(100)
  })

  it('tells the deciding policy once: there is no "Which policy decided?" row beside "Why allowed?"', () => {
    for (const { name, plan, props } of [...everyone(), ...withPreviews()]) {
      const ids = faqOf(plan, props).flatMap((g) => g.rows.map((r) => r.ask))
      expect(ids, name).not.toContain('ask:policy')
    }
  })

  it('files the application-wide break-in row under its own group, not under what this person sees', () => {
    const { plan, props } = withPreviews()[0]
    const groups = faqOf(plan, { ...props, breakIn: {} as unknown as NonNullable<AskProps['breakIn']> })
    const g = groups.find((x) => x.rows.some((r) => r.ask === 'ask:breakin'))
    expect(g?.key).toBe('app')
    expect(g?.rows[0].label).toMatch(/application/)
    expect(groups.find((x) => x.key === 'see')?.rows.some((r) => r.ask === 'ask:breakin') ?? false).toBe(false)
  })

  it('never offers a row twice, and groups it under one heading', () => {
    for (const { name, plan, props } of everyone()) {
      const ids = faqOf(plan, props).flatMap((g) => g.rows.map((r) => r.id))
      expect(new Set(ids).size, name).toBe(ids.length)
    }
  })

  it('offers nothing at all for a run with no person or no application', () => {
    const noOne = runOf(t, null, null)
    expect(noOne.plan.empty).toBe(true)
    expect(faqOf(noOne.plan, noOne.props)).toEqual([])
    const app = t.apps[0]
    expect(faqOf(runOf(t, null, app.id).plan, runOf(t, null, app.id).props)).toEqual([])
  })

  it('always has something to say once a run has landed — even where no policy decides', () => {
    for (const { name, plan, props } of everyone()) {
      if (plan.empty) continue
      const groups = faqOf(plan, props)
      expect(groups.length, name).toBeGreaterThan(0)
      /* Question 1 is always there, and its words follow the outcome. */
      const first = groups[0].rows[0]
      expect(groups[0].key, name).toBe('what')
      expect(first.label, name).toMatch(/^Why (allowed|denied|does it depend|does no policy decide)\?$/)
    }
  })

  it('only Run runs: no row starts a run, and no chip answer acts by itself', () => {
    for (const { name, plan, props } of [...everyone(), ...withPreviews()]) {
      for (const g of faqOf(plan, props)) {
        for (const r of g.rows) {
          if (r.ask === FAQ_WATCHING) {
            expect(watchingAnswer(plan)?.acts, name).toBe(false)
            continue
          }
          expect(answer(r.ask as ChipId, plan, props, r.label).acts, `${name} · ${r.id}`).toBe(false)
        }
      }
    }
  })

  it('names the questions it can answer, and leaves out the ones it cannot', () => {
    const maya = withPreviews()[0]
    const labels = faqOf(maya.plan, maya.props).flatMap((g) => g.rows.map((r) => r.label))
    expect(labels).toContain('Why allowed?')
    expect(labels.some((l) => /^What will \w+ see\?$/.test(l))).toBe(true)
    /* Deliberately absent: there is no population to count, no production log, and no score. */
    expect(labels.join(' | ')).not.toMatch(/how many users|in production|secure|score/i)
  })
})

describe('the hedge, the fix and the caution survive into the answer', () => {
  it("says 'might also apply' for a rule the trace could not tell, never 'also applies' — and the label says neither", () => {
    const runs = everyone().filter((r) => r.plan.conflicts?.rules.some((c) => c.match === 'unknown'))
    /* The showcase may have none on a given day; the shape of the claim is what is pinned. */
    for (const { name, plan, props } of runs) {
      const unsure = new Set(plan.conflicts?.rules.filter((c) => c.match === 'unknown').map((c) => c.ruleId))
      const rows = faqOf(plan, props).find((g) => g.key === 'rule')?.rows ?? []
      for (const r of rows) {
        const n = Number(r.ask.split(':')[2])
        const rule = plan.rules.find((x) => x.index !== null && x.index + 1 === n)
        if (!rule || !unsure.has(rule.id)) continue
        const said = (answer(r.ask as ChipId, plan, props, r.label).more ?? []).map((l) => plain(l)).join(' ')
        expect(said, name).toContain('might also apply')
        expect(said, name).not.toContain(' also applies')
        expect(r.label, name).not.toMatch(/also appl/)
      }
    }
  })

  it('shows a fix and its caution in the same answer, with no line dropped', () => {
    for (const { name, plan, props } of everyone()) {
      const f = (plan.conflicts?.findings ?? []).find((x) => x.tone === 'conflict' && x.fix && x.caution)
      if (!f) continue
      const others = faqOf(plan, props).find((g) => g.key === 'policy')?.rows.find((r) => r.ask === 'ask:others')
      if (!others) continue
      const a = answer('ask:others', plan, props, others.label)
      const lines = (a.more ?? []).map((l) => plain(l))
      expect(lines.some((l) => l.includes(f.fix.replace(/\.$/, '').slice(1))), `${name} · fix`).toBe(true)
      expect(lines.some((l) => l.includes(f.caution.replace(/\.$/, ''))), `${name} · caution`).toBe(true)
    }
  })

  it('labels a preview answer as previews, and only where the evidence has no label of its own', () => {
    const maya = withPreviews()[0]
    const change = faqOf(maya.plan, maya.props).find((g) => g.key === 'change')?.rows.find((r) => r.ask === 'ask:change')
    expect(change).toBeDefined()
    if (change) {
      const a = answer('ask:change', maya.plan, maya.props, change.label)
      expect(noteOf(a)).toBe(PREVIEW_NOTE)
      expect(plain(a.sentence)).toContain('previews, not runs')
    }
    /* `seeOf` ends its own evidence with "(An approximation of the sign-in page.)", so nothing is added. */
    const see = answer('ask:see', maya.plan, maya.props, 'What will Maya see?')
    expect(noteOf(see)).toBeNull()
    expect((see.more ?? []).map((l) => plain(l)).join(' ')).toContain('approximation')
  })

  it('copies the answer as the sentence and every line of its evidence', () => {
    const maya = withPreviews()[0]
    const a = answer('ask:why', maya.plan, maya.props, 'Why allowed?')
    const text = copyText(a)
    expect(text.split('\n')[0]).toBe(plain(a.sentence))
    expect(text.split('\n').length).toBe(1 + (a.more?.length ?? 0))
  })

  it('copies the words the screen shows: a policy name never takes its possessive on the clipboard either', () => {
    const maya = withPreviews()[0]
    const base = answer('ask:why', maya.plan, maya.props, 'Why allowed?')
    const a = { ...base, more: [], sentence: [{ text: "None of AWS for engineering teams's 3 rules match, so " }, { text: 'it is allowed.' }] }
    expect(copyText(a)).toBe('None of the 3 rules in AWS for engineering teams match, so it is allowed.')
    expect(copyText(a)).not.toContain("teams's")
  })

  it('lists every changed preview in "What would change the answer?", so the count and the list agree', () => {
    let saw = 0
    for (const { name, plan, props } of withPreviews()) {
      const changed = (props.whatIfs ?? []).filter((w) => w.changed)
      if (changed.length === 0) continue
      saw += 1
      const a = presentAnswer(answer('ask:change', plan, props, 'What would change the answer?'), plan, props)
      expect(a.more?.length, name).toBe(changed.length)
      expect(plain(a.sentence), name).toContain(`${changed.length} of the`)
      for (const w of changed) expect((a.more ?? []).some((l) => plain(l).startsWith(`${w.label} → `)), `${name} · ${w.label}`).toBe(true)
    }
    expect(saw).toBeGreaterThan(0)
  })

  it('relabels the checks action to what it does, and sends a Depends to the rule that cannot tell', () => {
    let saw = 0
    for (const { name, plan, props } of [...everyone(), ...withPreviews()]) {
      const g = faqOf(plan, props).flatMap((x) => x.rows).find((r) => r.ask === 'ask:checks')
      if (!g) continue
      const a = presentAnswer(answer('ask:checks', plan, props, g.label), plan, props)
      const act = a.actions.find((x) => x.kind === 'checks')
      if (!act) continue
      saw += 1
      expect(act.label, name).toBe(plan.outcome.status === 'depends' ? "Open the rule that can't tell" : 'Open the deciding rule')
      expect(a.actions.map((x) => x.label).join(' | '), name).not.toContain('Show every check')
    }
    expect(saw).toBeGreaterThan(0)
  })
})

describe('the one locally-composed answer', () => {
  const watchers = () => [...everyone(), ...withPreviews()].filter((r) => r.plan.outcome.view.watching.length > 0)

  it('is offered only where something is actually watching', () => {
    for (const { name, plan, props } of [...everyone(), ...withPreviews()]) {
      const offered = faqOf(plan, props).some((g) => g.rows.some((r) => r.ask === FAQ_WATCHING))
      expect(offered, name).toBe(plan.outcome.view.watching.length > 0)
      if (!offered) expect(watchingAnswer(plan), name).toBeNull()
    }
  })

  it('says nothing that is not a field of the run or one of its own fixed phrases', () => {
    const runs = watchers()
    for (const { name, plan } of runs) {
      const a = watchingAnswer(plan)
      expect(a, name).not.toBeNull()
      if (!a) continue
      const ws = plan.outcome.view.watching
      const allowed = new Set<string>([
        ...WATCHING_JOINS,
        watchingLead(ws.length, true, true),
        watchingLead(ws.length, true, false),
        watchingLead(ws.length, false, true),
        ...ws.map((w) => w.policyName),
        ...ws.map((w) => watchingSentence(w)),
        ...ws.flatMap((w) => (watchingWords(w).yields ? [watchingWords(w).yields as string] : [])),
      ])
      for (const p of [...a.sentence, ...(a.more ?? []).flat()]) expect(allowed.has(p.text), `${name} · "${p.text}"`).toBe(true)
      expect(a.known, name).toBe(true)
      expect(a.acts, name).toBe(false)
      expect(a.id, name).toBe(FAQ_WATCHING)
      /* Its lead claims a different decision only where every watcher has one to compare. */
      if (ws.some((w) => w.decision === null)) expect(a.sentence[0].text, name).not.toContain('differently')
      /* ... and only where the RUN has a definite decision to differ from: on a Depends it has none. */
      if (!(plan.outcome.status === 'decided' && plan.outcome.decision)) expect(a.sentence[0].text, name).not.toContain('differently')
    }
  })

  it('says "differently" only where the run itself has a decision to differ from', () => {
    expect(watchingLead(1, true, true)).toContain('differently')
    expect(watchingLead(2, true, true)).toContain('differently')
    expect(watchingLead(1, true, false)).not.toContain('differently')
    expect(watchingLead(2, true, false)).not.toContain('differently')
    expect(watchingLead(1, false, true)).not.toContain('differently')
  })

  it('cites and opens only a policy the canvas actually draws', () => {
    for (const { name, plan } of watchers()) {
      const a = watchingAnswer(plan)
      if (!a) continue
      const drawn = new Set(plan.policies.map((p) => p.policyId))
      for (const p of a.sentence) if (p.cite?.startsWith('policy:')) expect(drawn.has(p.cite.slice(7)), name).toBe(true)
      for (const act of a.actions) if (act.kind === 'openPolicy') expect(drawn.has(act.policyId), name).toBe(true)
      if (a.focus) expect(drawn.has(a.focus.slice(7)), name).toBe(true)
    }
  })
})

describe('the two questions under the verdict', () => {
  const find = (name: string, app: string, previews = false) => {
    const p = t.directory.people.find((x) => x.name === name)
    const a = t.apps.find((x) => x.name === app)
    if (!p || !a) throw new Error(`no ${name} or ${app} in the showcase`)
    return runOf(t, p.id, a.id, { previews })
  }

  it('puts the why first, and never more than two', () => {
    for (const { name, plan, props } of everyone()) {
      const faq = faqOf(plan, props)
      const top = topQuestions(faq, plan)
      expect(top.length, name).toBeLessThanOrEqual(2)
      if (faq.length > 0) expect(top[0]?.ask, name).toMatch(/^ask:(why|depends)$/)
      for (const r of top) expect(faq.some((g) => g.rows.includes(r)), name).toBe(true)
    }
  })

  it('prefers what would change the answer, then each group, and offers nothing for no questions', () => {
    const run = find('Maya Iyer', 'AWS Console', true)
    const faq = faqOf(run.plan, run.props)
    const asks = faq.flatMap((g) => g.rows.map((r) => r.ask))
    const top = topQuestions(faq, run.plan)
    if (asks.includes('ask:change')) expect(top.map((r) => r.ask)).toEqual(['ask:why', 'ask:change'])
    expect(topQuestions([], run.plan)).toEqual([])
    const multi = everyone().find((r) => (r.plan.asEachGroup?.groups.length ?? 0) > 1 && faqOf(r.plan, r.props).some((g) => g.rows.some((x) => x.ask === 'ask:group')))
    if (multi) {
      const fq = faqOf(multi.plan, multi.props).map((g) => ({ ...g, rows: g.rows.filter((x) => x.ask !== 'ask:change') }))
      expect(topQuestions(fq, multi.plan).map((r) => r.ask)).toEqual(['ask:why', 'ask:group'])
    }
  })

  it('never repeats the question the panel head is showing', () => {
    const run = find('Maya Iyer', 'AWS Console', true)
    const faq = faqOf(run.plan, run.props)
    const first = topQuestions(faq, run.plan)[0]
    expect(first).toBeDefined()
    const again = topQuestions(faq, run.plan, first.id)
    expect(again.some((r) => r.id === first.id)).toBe(false)
    expect(again.length).toBeGreaterThan(0)
  })
})

/* Several identities in one Run (owner, 5 Oct 2026: "one run each, switch"): "What does each one get?" is offered
   only for two or more, and its answer is read off each identity's own run — every one listed once, in pick order, a
   group named with the member it was tested as. */
describe('what each identity gets', () => {
  const people = t.directory.people
  const aws = t.apps.find((a) => a.name === 'AWS Console')!
  const user = (name: string, active = false): RunIdentity => {
    const p = people.find((x) => x.name === name)!
    return { key: p.id, kind: 'user', name: p.name, active, plan: runOf(t, p.id, aws.id).plan }
  }
  const group = (id: string, active = false): RunIdentity => {
    const key = `${GROUP_PREFIX}${id}`
    const g = t.groups.find((x) => x.id === id)!
    return { key, kind: 'group', name: g.name, active, plan: runOf(t, personPick(key, people).personId, aws.id).plan }
  }
  const maya = runOf(t, people.find((p) => p.name === 'Maya Iyer')!.id, aws.id)
  const three = () => [user('Maya Iyer', true), group('finance'), user('Ravi Menon')]
  const asks = (ids: RunIdentity[] | null) => faqOf(maya.plan, maya.props, ids).flatMap((g) => g.rows.map((r) => r.ask))

  it('is offered only for two or more identities, under its own heading right after the decision', () => {
    expect(asks(null)).not.toContain(FAQ_EACH)
    expect(asks(three().slice(0, 1))).not.toContain(FAQ_EACH)
    const groups = faqOf(maya.plan, maya.props, three())
    expect(groups[0].key).toBe('what')
    expect(groups[1]).toMatchObject({ key: 'each', title: 'Identities', rows: [{ id: FAQ_EACH, ask: FAQ_EACH, label: 'What does each one get?' }] })
    /* Keeps the per-group question for a person in several groups: a different question, about one identity. */
    if ((maya.plan.asEachGroup?.groups.length ?? 0) > 1) expect(asks(three())).toContain('ask:group')
    expect(eachAnswer(three().slice(0, 1), people)).toBeNull()
  })

  it('lists every identity once, in pick order, a group with the member it was tested as', () => {
    const ids = three()
    const a = eachAnswer(ids, people)!
    expect(a.id).toBe(FAQ_EACH)
    expect(a.known).toBe(true)
    expect(a.acts).toBe(false)
    expect(a.actions).toEqual([])
    const lines = (a.more ?? []).map((l) => plain(l))
    expect(lines.length).toBe(ids.length)
    const probe = people.find((p) => p.id === personPick(`${GROUP_PREFIX}finance`, people).personId)!.name
    expect(lines[0]).toMatch(/^Maya Iyer: /)
    expect(lines[1].startsWith(`Finance (tested as ${probe}): `), lines[1]).toBe(true)
    expect(lines[2]).toMatch(/^Ravi Menon: /)
    ids.forEach((i, n) => {
      expect(lines[n]).toContain(`: ${wordsOfPlan(i.plan)}`)
      /* Where it comes from: the deciding policy and its rule, or nothing where no policy decides. */
      if (i.plan.decider && i.plan.outcome.status === 'decided') expect(lines[n]).toContain(` · ${i.plan.decider.name} · `)
      else if (!i.plan.decider) expect(lines[n]).not.toContain(' · ')
    })
    /* Only the identity on the canvas is cited: its name lights the sign-in, its answer the outcome card. */
    const cited = (a.more ?? []).map((l) => l.filter((p) => p.cite).map((p) => p.cite))
    expect(cited[0]).toEqual(['person', 'outcome'])
    expect(cited[1]).toEqual([])
    expect(cited[2]).toEqual([])
    /* No count of them anywhere: the chips are the count. */
    expect(copyText(a)).not.toMatch(/\b\d+ (identities|people|picks)\b/)
  })

  it('says "They all get" only where every answer is the same, else that they do not', () => {
    const words = (ids: RunIdentity[]) => plain(eachAnswer(ids, people)!.sentence)
    const everyoneOnAws = people.map((p) => ({ key: p.id, kind: 'user' as const, name: p.name, active: false, plan: runOf(t, p.id, aws.id).plan }))
    const byWords = new Map<string, RunIdentity[]>()
    for (const i of everyoneOnAws) byWords.set(wordsOfPlan(i.plan), [...(byWords.get(wordsOfPlan(i.plan)) ?? []), i])
    const sameTwo = [...byWords.values()].find((xs) => xs.length >= 2)!
    expect(sameTwo, 'two people on AWS Console with the same answer').toBeDefined()
    const said = words(sameTwo.slice(0, 2))
    const d = sameTwo[0].plan.outcome.decision
    if (d === 'deny') expect(said).toBe('They are all denied.')
    else if (d) expect(said).toBe(`They all get ${wordsOfPlan(sameTwo[0].plan)}.`)
    expect(said).not.toContain("don't")
    const [a, b] = [...byWords.values()].map((xs) => xs[0])
    expect(b, 'two answers on AWS Console').toBeDefined()
    expect(words([a, b])).toBe("They don't all get the same answer.")
    expect(eachAnswer([a, b], people)!.tone).toBe('neutral')
  })

  it('puts it under the verdict after the why, when the Run covered several identities', () => {
    const top = topQuestions(faqOf(maya.plan, maya.props, three()), maya.plan)
    expect(top.map((r) => r.ask)).toEqual(['ask:why', FAQ_EACH])
    expect(topQuestions(faqOf(maya.plan, maya.props), maya.plan).map((r) => r.ask)).not.toContain(FAQ_EACH)
  })
})
