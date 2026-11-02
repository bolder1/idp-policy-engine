import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blankRule, users, type Policy, type Rule } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BoardBarActions } from './BoardBar'
import { BoardEmpty } from './BoardEmpty'
import { copiedRules, copyableRules, copyNotes, copySources, rulesSaid } from './copy-rules'
import boardBuilderSrc from './BoardBuilder.tsx?raw'
import dialogSrc from './RulePicker.tsx?raw'

/* -----------------------------------------------------------------------------
   Copy rules from a policy (owner, 2 Nov 2026). A one-time copy, so the test that matters most is that the copy and the
   source share nothing. Static markup only: the dialog is portalled and its ticks are the browser's, so what a press
   does is read from the source and walked by hand.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const tenant = { groups: t.groups, hooks: t.hooks, users, zones: t.zones, fingerprints: t.fingerprints }
const box = t.policies.find((p) => p.name === 'Box access')!
const target: Policy = { ...box, id: 'target', name: 'Target', rules: [], pendingDraft: undefined }

describe('where rules can come from', () => {
  it('offers the same type only, and never the policy itself', () => {
    const from = copySources(t.policies, box)
    expect(from.length).toBeGreaterThan(0)
    expect(from.map((p) => p.id)).not.toContain(box.id)
    expect(from.every((p) => p.type === box.type)).toBe(true)
  })

  it('leaves out a policy with nothing to copy', () => {
    const empty: Policy = { ...box, id: 'empty', rules: [], pendingDraft: undefined }
    expect(copySources([empty, box], target).map((p) => p.id)).toEqual([box.id])
  })

  it('leaves out a blank rule and a person’s temporary access', () => {
    const grant: Rule = { ...box.rules[0], id: 'grant', tempAccess: { until: '2026-12-01', by: 'Admin', reason: 'Audit' } as Rule['tempAccess'] }
    const blank: Rule = { ...blankRule('Untouched'), pristine: true }
    const held: Policy = { ...box, id: 'held', rules: [box.rules[0], grant, blank], pendingDraft: undefined }
    expect(copyableRules(held).map((r) => r.id)).toEqual([box.rules[0].id])
  })

  it('reads what the source’s builder would open: its saved draft when it has one', () => {
    const saved = { ...box.rules[0], id: 'in-draft', name: 'Waiting in the draft' }
    const drafted = { ...box, pendingDraft: { rules: [saved], fallback: box.fallback } } as Policy
    expect(copyableRules(drafted).map((r) => r.id)).toEqual(['in-draft'])
  })
})

describe('the copies', () => {
  it('share nothing with the source: new ids all the way down', () => {
    const [copy] = copiedRules([box.rules[0]], [])
    expect(copy.id).not.toBe(box.rules[0].id)
    expect(copy.name).toBe(box.rules[0].name)
    expect(copy.decision).toBe(box.rules[0].decision)
    const before = new Set(box.rules[0].when.cards.flatMap((k) => [k.id, ...k.conditions.map((c) => c.id)]))
    for (const k of copy.when.cards) {
      expect(before.has(k.id)).toBe(false)
      for (const c of k.conditions) expect(before.has(c.id)).toBe(false)
    }
  })

  it('keep the order they were given', () => {
    const picked = box.rules.slice(0, 2)
    expect(copiedRules(picked, []).map((r) => r.name)).toEqual(picked.map((r) => r.name))
  })

  it('take a name of their own only where the policy already has it, also among themselves', () => {
    const r = box.rules[0]
    expect(copiedRules([r], [{ name: r.name }])[0].name).toBe(`${r.name} (copy)`)
    expect(copiedRules([r, r], []).map((x) => x.name)).toEqual([r.name, `${r.name} (copy)`])
  })

  it('count in plain words', () => {
    expect(rulesSaid(1)).toBe('1 rule')
    expect(rulesSaid(3)).toBe('3 rules')
  })
})

describe('what a copy would cause where it lands', () => {
  it('says nothing about a rule that lands clean', () => {
    expect(copyNotes(target, [], tenant).size).toBe(0)
  })

  it('warns when a rule already on the policy would catch every sign-in first', () => {
    const first: Rule = { ...blankRule('Catches everyone'), pristine: undefined, when: { cards: [] } }
    const later: Rule = { ...box.rules[0], who: undefined, when: { cards: [] } }
    const notes = copyNotes({ ...target, rules: [first] }, [later], tenant)
    expect(notes.get(later.id)).toBeTruthy()
  })

  it('warns when a rule names people outside this policy’s audience', () => {
    const narrow: Policy = { ...target, audience: { everyone: false, groupIds: [t.groups[0].id], userIds: [] } }
    const elsewhere = t.groups[1].id
    const named: Rule = { ...box.rules[0], who: { groupIds: [elsewhere], userIds: [] } }
    expect(copyNotes(narrow, [named], tenant).get(named.id)).toBeTruthy()
  })
})

describe('the doors', () => {
  const chooser = (extra: Partial<Parameters<typeof BoardEmpty>[0]> = {}) =>
    renderToStaticMarkup(<BoardEmpty onUseTemplate={() => {}} onScratch={() => {}} {...extra} />)

  it('adds a card on the empty board, sized as a third, only when there is a policy to copy from', () => {
    const on = chooser({ onCopyRules: () => {} })
    expect(on).toContain('Reuse an existing policy')
    expect(on).toContain('bb__starts has-three')
    const off = chooser()
    expect(off).not.toContain('Reuse an existing policy')
    expect(off).not.toContain('has-three')
  })

  it('writes through commitDraft as one edit, with Undo, and keeps the source untouched', () => {
    const body = boardBuilderSrc.slice(boardBuilderSrc.indexOf('const copyRules = '), boardBuilderSrc.indexOf('/* A template, applied to a policy'))
    expect(body).toContain('commitDraft({ ...draft, rules: [...draft.rules, ...copies] })')
    expect(body).toContain('offerUndo(')
    expect(body).not.toContain('savePolicy')
    expect(body).not.toContain('copyRuleInto')
  })

  it('is not offered on a post sign-in policy', () => {
    expect(boardBuilderSrc).toContain('const copyOffered = COPY_RULES && !post && copySources(store.policies, draft).length > 0')
  })

  it('is a slider with two buttons', () => {
    expect(dialogSrc).toContain('<Drawer')
    expect(dialogSrc.match(/<Button /g)).toHaveLength(2)
  })

  it('never calls the copy a link: nothing in the popup says inherit', () => {
    expect(dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase()).not.toContain('inherit')
  })

  it('reads as a row in the bar’s ⋯ beside Save as template', () => {
    const src = BoardBarActions.toString()
    expect(src).toContain('Copy rules from a policy')
    expect(src).toContain('Save as template')
  })
})
