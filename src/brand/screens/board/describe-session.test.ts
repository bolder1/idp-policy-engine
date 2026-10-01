import { describe, expect, it } from 'vitest'

import { EVERYONE, blankPolicy, rule, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { EXAMPLES, compose, dictionaryOf, openChoices, readText, type DescribeTenant } from '../../create/describe-model'
import { historyOf, undo } from '../history'
import {
  LEFT_OUT,
  UNTITLED_NAME,
  answerAsk,
  asksOf,
  bodyOf,
  carryPicks,
  changeLine,
  changedCards,
  describeSession,
  describedDraft,
  emptyDescribe,
  extendText,
  followUps,
  revertDescribed,
  saidKeys,
  sendTurn,
  skipChoice,
  turnKeys,
  turnView,
  undoTurn,
  writeDescribed,
  type BoardBody,
  type DescribeState,
} from './describe-session'

/* One opening of Describe it is one step on the undo stack, however many
   answers it writes (describe spec, §4.8 and §8.5). */

const base = blankPolicy('Untitled policy', [])
const withRules = (...names: string[]): Policy => ({ ...base, rules: names.map((name) => rule({ name })) })

describe('a Describe it session in the history', () => {
  it('commits its first write and amends every later one, so one Undo takes it all back', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('first'), s))
    expect(h.past).toHaveLength(1)
    expect(s.wrote).toBe(true)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('second'), s))
    ;({ hist: h, session: s } = writeDescribed(h, withRules('third', 'and another'), s))
    expect(h.past).toHaveLength(1)
    expect(h.present.rules.map((r) => r.name)).toEqual(['third', 'and another'])
    expect(undo(h).present).toBe(base)
  })

  it('writes nothing when the rules and the last row are what the draft already has', () => {
    const h = historyOf(base)
    const s = describeSession(EVERYONE)
    const out = writeDescribed(h, { ...base, name: 'Renamed' }, s)
    expect(out.hist).toBe(h)
    expect(out.session.wrote).toBe(false)
  })

  it('commits afresh after something else moved the history, rather than overwriting it', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('first'), s))
    /* ⌘Z with the panel open: the present is no longer the session's write. */
    h = undo(h)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('again'), s))
    expect(h.past).toEqual([base])
    expect(h.present.rules.map((r) => r.name)).toEqual(['again'])
    expect(h.future).toEqual([])
  })

  it('remembers the audience the policy had when the panel opened', () => {
    expect(describeSession({ everyone: false, groupIds: ['hr'], userIds: [] }).audienceBefore.groupIds).toEqual(['hr'])
  })

  it('starts the visit with an empty box and nothing read', () => {
    const e = emptyDescribe()
    expect(e.text).toBe('')
    expect(e.reading.choices).toEqual([])
    expect(e.reading.answers.signIn).toEqual({})
  })
})

describe('the names Describe it may replace', () => {
  it('are the ones the product gave a new draft, and only those', () => {
    for (const n of ['Untitled policy', 'Untitled policy 2', 'Untitled policy 14']) expect(UNTITLED_NAME.test(n), n).toBe(true)
    for (const n of ['Untitled policy copy', 'My untitled policy', 'HRMS from Corporate offices']) expect(UNTITLED_NAME.test(n), n).toBe(false)
  })
})
