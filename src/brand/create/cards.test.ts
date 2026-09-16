import { describe, expect, it } from 'vitest'

import { audienceOf, blankRule, card, cond, EVERYONE, groups, scenarios, when, type Audience, type Rule, type Scenario } from '../data'
import { legacyWhoConditions, whoPasses } from '../rule-who'
import { sig } from '../predicate'
import { buildTemplate, buildTemplateRules, narrowToAudience } from '../screens/board/apply-template'

/* -----------------------------------------------------------------------------
   Card stress tests.

   The gallery's whole premise is that a card is a fixed box — turning it must
   never resize it, or the grid reflows every time someone compares two
   templates. The layout guarantees that with a fixed height and an internally
   scrolling rule list; these tests guard the *content* side of the bargain, so
   a new template can't quietly break it.

   Budgets are derived from the rendered box: a 296px-wide card gives roughly
   38 characters per line at 13px, the front face allows three lines of
   description, and the back face fits five rules before it scrolls.
   -------------------------------------------------------------------------- */

const NAME_BUDGET = 42
const DESC_BUDGET = 132
const IF_BUDGET = 64
const MAX_RULES_BEFORE_SCROLL = 5

describe('template card content budgets', () => {
  it('every template has a name, a description and at least one rule', () => {
    for (const s of scenarios) {
      expect(s.name.trim().length, `${s.id} name`).toBeGreaterThan(0)
      expect(s.description.trim().length, `${s.id} description`).toBeGreaterThan(0)
      expect(s.rules.length, `${s.id} rules`).toBeGreaterThan(0)
    }
  })

  it('names fit the card head without wrapping past two lines', () => {
    for (const s of scenarios) {
      expect(s.name.length, `${s.id}: "${s.name}"`).toBeLessThanOrEqual(NAME_BUDGET)
    }
  })

  it('descriptions fit the three lines the front face allows', () => {
    for (const s of scenarios) {
      expect(s.description.length, `${s.id}: "${s.description}"`).toBeLessThanOrEqual(DESC_BUDGET)
    }
  })

  it('rule names and IF text stay on one line each — they ellipsize, so overlong text is unreadable rather than wrapped', () => {
    for (const s of scenarios) {
      for (const r of s.rules) {
        expect(r.name.length, `${s.id} / "${r.name}"`).toBeLessThanOrEqual(NAME_BUDGET)
        expect(r.ifText.length, `${s.id} / "${r.ifText}"`).toBeLessThanOrEqual(IF_BUDGET)
      }
    }
  })

  it('carries multi-rule templates, so the scrolling back face is actually exercised', () => {
    const deep = scenarios.filter((s) => s.rules.length >= 4)
    /* Two, and it was three. The condition catalogue shrank and two templates
       went with it: `s-firstlogin` was one rule gated on `auth-state`, which no
       longer exists, and `s-contractor-life` lost the same rule and dropped
       from four to three.

       The number is a census of the fixture rather than the thing being
       protected — what this test is for is that SOME template is deep enough to
       need the back face to scroll, and the assertion below still pins a
       five-rule one. Lowering the census to match the fixture keeps that;
       inventing a fourth rule to keep the number at three would be padding the
       fixture to satisfy a count. */
    expect(deep.length, 'templates with 4+ rules').toBeGreaterThanOrEqual(2)
    expect(Math.max(...scenarios.map((s) => s.rules.length))).toBeGreaterThanOrEqual(5)
  })

  it('no template exceeds what a human will read on a card back', () => {
    // Past this the back is a wall of text and the template should be split.
    for (const s of scenarios) {
      expect(s.rules.length, `${s.id}`).toBeLessThanOrEqual(8)
    }
  })

  it('rules over the scroll threshold still resolve to a real decision', () => {
    // A rule that scrolls out of view must still be sound — this catches
    // placeholder rows added just to pad a template out.
    for (const s of scenarios) {
      for (const r of s.rules.slice(MAX_RULES_BEFORE_SCROLL)) {
        expect(['deny', '1fa', '2fa']).toContain(r.decision)
      }
    }
  })

  it('every template builds rules that match what the card advertised', () => {
    // The card promises N rules; the builder must receive exactly N.
    for (const s of scenarios) {
      const built = s.rules.map((r) => r.build())
      expect(built.length, `${s.id}`).toBe(s.rules.length)
      for (const b of built) {
        expect(b.id, `${s.id} rule id`).toBeTruthy()
        expect(b.name.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('template ids are unique', () => {
    const ids = scenarios.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ownership segregation', () => {
  // The gallery splits on `provided`. If every template ended up on one side the
  // headings would still render, but one of the two groups would vanish with no
  // error — so both sides are asserted rather than just the flag existing.
  const mine = scenarios.filter((s) => !s.provided)
  const provided = scenarios.filter((s) => s.provided)

  it('has templates on both sides of the split', () => {
    expect(mine.length, 'tenant-authored').toBeGreaterThan(0)
    expect(provided.length, 'provided by Xecurify').toBeGreaterThan(0)
    expect(mine.length + provided.length).toBe(scenarios.length)
  })

  /* The picker's dropdown is built from a hard-coded list of four categories and
     counts them against the shelf you are on. Two ways that goes wrong silently:
     a scenario carrying a fifth category simply never appears under any filter,
     and a category with nothing provided offers an option that resolves to an
     empty grid.

     The second one is nearly true already and deliberately allowed: Compliance
     holds exactly one provided template because both of the tenant's own are
     Compliance. That is what the "N more are your team's" line under the grid
     exists to say, so the floor here is one, not two — but it is a floor, and if
     it ever reaches zero the dropdown is offering a dead end. */
  const CATS = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance'] as const

  it('never carries a category the picker cannot offer', () => {
    for (const s of scenarios) {
      expect(CATS as readonly string[], `${s.id}`).toContain(s.category)
    }
  })

  it('has at least one provided template under every category the dropdown lists', () => {
    for (const c of CATS) {
      expect(provided.filter((s) => s.category === c).length, `provided in ${c}`).toBeGreaterThan(0)
    }
  })

  it("the tenant's own templates say who wrote them and when", () => {
    // Their card meta reads `author · when`, so a missing one renders
    // "undefined · undefined" rather than failing.
    for (const s of mine) {
      expect(s.author?.trim(), `${s.id} author`).toBeTruthy()
      expect(s.when?.trim(), `${s.id} when`).toBeTruthy()
    }
  })

  it('provided templates carry no author, so nothing claims a name it lacks', () => {
    for (const s of provided) expect(s.author, `${s.id}`).toBeUndefined()
  })
})

/* -----------------------------------------------------------------------------
   A template keeps its audience on the board.

   New policies govern everyone, and the board used to commit a template's rules
   without its audience — so "Stricter auth for contractors" stepped up every
   sign-in and "Regulated data access" denied everyone's unmanaged device.
   `buildTemplateRules` writes the audience into each rule's `who`, and never
   touches the WHEN cards.

   The reach checks are worst case: every condition is assumed to pass, so the
   who alone decides. A rule that reaches someone outside the audience under
   that assumption is wider than its template.
   -------------------------------------------------------------------------- */

const person = (groupId: string, id = `someone-in-${groupId}`) => ({ id, groupId })
const reaches = (r: Rule, groupId: string, userId?: string) => whoPasses(r.who, person(groupId, userId))
const inside = (a: Audience, groupId: string) => a.everyone || a.groupIds.includes(groupId)

describe('applying a template keeps its audience', () => {
  const narrowed = scenarios.filter((s) => !s.audience.everyone)

  it('covers the templates that narrow only through their audience, deny rules included', () => {
    const ids = narrowed.map((s) => s.id)
    for (const id of ['s-contractor', 's-session', 's-regulated', 's-contractor-life']) expect(ids).toContain(id)
    expect(narrowed.some((s) => s.rules.some((r) => r.decision === 'deny'))).toBe(true)
  })

  it('every rule of a narrowed template names the audience in its who', () => {
    for (const s of narrowed) {
      const built = buildTemplateRules(s)
      expect(built.length, s.id).toBe(s.rules.length)
      for (const r of built) {
        if (s.audience.groupIds.length > 0) {
          expect(r.who?.groupIds.length, `${s.id} / ${r.name}`).toBeGreaterThan(0)
          for (const g of r.who!.groupIds) expect(s.audience.groupIds, `${s.id} / ${r.name}`).toContain(g)
        }
        for (const u of s.audience.userIds) expect(r.who?.userIds, `${s.id} / ${r.name}`).toContain(u)
      }
    }
  })

  it('never writes people or groups into a card', () => {
    for (const s of scenarios) {
      for (const r of buildTemplateRules(s)) expect(legacyWhoConditions(r.when), `${s.id} / ${r.name}`).toEqual([])
    }
  })

  it('leaves the WHEN exactly as built', () => {
    for (const s of scenarios) {
      const plain = s.rules.map((r) => r.build())
      const built = buildTemplateRules(s)
      expect(built.map((r) => sig(r.when)), s.id).toEqual(plain.map((r) => sig(r.when)))
    }
  })

  it('no rule reaches a group outside its template audience, and every rule still reaches inside it', () => {
    for (const s of narrowed) {
      for (const r of buildTemplateRules(s)) {
        for (const g of groups) {
          expect(reaches(r, g.id), `${s.id} / ${r.name} / ${g.id}`).toBe(inside(s.audience, g.id))
        }
      }
    }
  })

  it('leaves templates for everyone exactly as built', () => {
    for (const s of scenarios.filter((x) => x.audience.everyone)) {
      for (const r of s.rules.map((x) => x.build())) expect(narrowToAudience(r, EVERYONE)).toBe(r)
    }
  })

  it('s-passwordless names the executives group, once, and has no conditions', () => {
    const s = scenarios.find((x) => x.id === 's-passwordless')!
    expect(s.audience.groupIds).toEqual(['executives'])
    expect(groups.some((g) => g.id === 'executives')).toBe(true)
    const [r] = buildTemplateRules(s)
    expect(r.who).toEqual({ groupIds: ['executives'], userIds: [] })
    expect(r.when.cards).toEqual([])
  })
})

describe('narrowing a rule that already says who', () => {
  const ruleWith = (who?: Rule['who'], w: Rule['when'] = { cards: [] }): Rule => ({ ...blankRule('Test'), ...(who ? { who } : null), when: w })

  it('intersects a group list the rule already names', () => {
    const r = narrowToAudience(ruleWith({ groupIds: ['executives', 'contractors'], userIds: [] }), audienceOf(['contractors']))
    expect(r?.who).toEqual({ groupIds: ['contractors'], userIds: [] })
  })

  it('drops the rule rather than widening it when the rule names a different group', () => {
    expect(narrowToAudience(ruleWith({ groupIds: ['executives'], userIds: [] }), audienceOf(['contractors']))).toBeNull()
  })

  it('reports a dropped rule by name from the template build', () => {
    const t: Scenario = {
      id: 't-drop',
      name: 'Drop test',
      description: 'x',
      category: 'Compliance',
      audience: audienceOf(['contractors']),
      rules: [
        { name: 'Executives only', ifText: 'x', decision: 'deny', build: () => ruleWith({ groupIds: ['executives'], userIds: [] }) },
        { name: 'Everyone', ifText: 'x', decision: '2fa', build: () => ruleWith() },
      ],
    }
    const built = buildTemplate(t)
    expect(built.dropped).toEqual(['Executives only'])
    expect(built.rules.map((r) => r.who)).toEqual([{ groupIds: ['contractors'], userIds: [] }])
    expect(buildTemplateRules(t)).toHaveLength(1)
  })

  it('keeps an exception, and never covers the excepted group', () => {
    const r = narrowToAudience(ruleWith({ groupIds: [], userIds: [], exceptGroupIds: ['contractors'] }), audienceOf(['contractors', 'finance']))!
    expect(reaches(r, 'finance')).toBe(true)
    expect(reaches(r, 'contractors')).toBe(false)
    expect(r.who?.groupIds).toEqual(['finance'])
  })

  it('names people when the audience is people', () => {
    const r = narrowToAudience(ruleWith(), audienceOf([], ['priya']))!
    expect(r.who?.userIds).toEqual(['priya'])
    expect(reaches(r, 'engineering', 'priya')).toBe(true)
    expect(reaches(r, 'engineering', 'someone-else')).toBe(false)
  })

  it('keeps groups and people a union, whatever the WHEN looks like', () => {
    const a = audienceOf(['finance'], ['u-x'])
    const orCard = { ...card(cond('zone', 'in zone', ['office']), cond('day', 'is', ['Monday'])), join: 'or' as const }
    const shapes: Rule['when'][] = [
      { cards: [] },
      when(card(cond('zone', 'in zone', ['office']))),
      when(card(cond('zone', 'in zone', ['office'])), card(cond('day', 'is', ['Monday']))),
      when(orCard),
    ]
    for (const w of shapes) {
      const r = narrowToAudience(ruleWith(undefined, w), a)!
      expect(reaches(r, 'finance')).toBe(true)
      expect(reaches(r, 'engineering', 'u-x')).toBe(true)
      expect(reaches(r, 'engineering')).toBe(false)
      expect(r.when).toBe(w)
    }
  })
})
