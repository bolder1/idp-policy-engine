import { describe, expect, it } from 'vitest'

import {
  CANT_TELL,
  DECISION_PHRASE,
  DECISION_TONE,
  DECISION_WORDS,
  DEVICE_FACT_WORDS,
  FACT_WORDS,
  WOULD_WORDS,
  STRICTEST_FIRST,
  decisionsOr,
  factWords,
  strictestFirst,
} from './decision-words'
import type { FactKey } from './screens/sign-in-facts'

describe('the decision vocabulary', () => {
  it('says the three decisions in exactly the owner’s words', () => {
    expect(DECISION_WORDS).toEqual({ '1fa': 'Allow on 1 factor', '2fa': 'Allow with 2FA', deny: 'Deny' })
  })

  it('keeps the phrase and the would-form the same words as the badge', () => {
    for (const d of ['1fa', '2fa', 'deny'] as const) {
      /* Only the first letter moves. "2FA" stays in capitals mid-sentence. */
      expect(DECISION_PHRASE[d]).toBe(DECISION_WORDS[d].charAt(0).toLowerCase() + DECISION_WORDS[d].slice(1))
      expect(WOULD_WORDS[d]).toBe(`Would ${DECISION_PHRASE[d]}`)
    }
  })

  it('gives every decision a badge tone and never a grey one', () => {
    /* Grey is Can't tell's, and Can't tell is not a decision. */
    expect(DECISION_TONE).toEqual({ '1fa': 'positive', '2fa': 'notice', deny: 'negative' })
    expect(CANT_TELL).toBe("Can't tell")
  })

  it('lists the decisions a sign-in could reach, each once', () => {
    expect(decisionsOr(['1fa', 'deny'])).toBe('Allow on 1 factor or Deny')
    expect(decisionsOr(['2fa', 'deny', '2fa'])).toBe('Allow with 2FA or Deny')
    expect(decisionsOr(['deny'])).toBe('Deny')
  })

  it('orders a list with no path of its own strictest first, whatever order it came in', () => {
    expect(STRICTEST_FIRST).toEqual(['deny', '2fa', '1fa'])
    expect(strictestFirst(['2fa', 'deny'])).toEqual(['deny', '2fa'])
    expect(strictestFirst(['deny', '2fa'])).toEqual(['deny', '2fa'])
    expect(strictestFirst(['1fa', '1fa', 'deny', '2fa'])).toEqual(['deny', '2fa', '1fa'])
    expect(strictestFirst([])).toEqual([])
  })
})

describe('the fact words', () => {
  it('names each fact by the form row that states it', () => {
    expect(FACT_WORDS.address).toBe('IP address')
    expect(FACT_WORDS.asn).toBe('IP address')
    expect(FACT_WORDS['location.coordinates']).toBe('Place')
    expect(FACT_WORDS.date).toBe('When')
    expect(FACT_WORDS.risk).toBe('Device risk score')
    expect(FACT_WORDS.app).toBe('Application')
  })

  it('collapses every device fact to one word', () => {
    const device = (Object.keys(FACT_WORDS) as FactKey[]).filter((k) => k.startsWith('device.'))
    expect(device.length).toBe(Object.keys(DEVICE_FACT_WORDS).length)
    expect(new Set(device.map((k) => FACT_WORDS[k]))).toEqual(new Set(['Device']))
  })

  it('says a list of missing facts once per word, in the order they came', () => {
    expect(factWords(['address', 'location.city', 'asn', 'location'])).toEqual(['IP address', 'Place'])
    expect(factWords(['device.integrity', 'device.screenLock', 'time', 'date'])).toEqual(['Device', 'When'])
    expect(factWords([])).toEqual([])
  })

  it('writes every word in sentence case', () => {
    /* A capital after the first letter is only allowed in a name: the product's
       own nouns, and the platform words. */
    const NAMES = /\b(IP|2FA|miniOrange|Authenticator|Device Agent|OS)\b/g
    const words = [...Object.values(DECISION_WORDS), ...Object.values(WOULD_WORDS), ...Object.values(FACT_WORDS), ...Object.values(DEVICE_FACT_WORDS)]
    for (const w of words) {
      const rest = w.replace(NAMES, '').slice(1)
      expect(`${w}: ${rest === rest.toLowerCase()}`).toBe(`${w}: true`)
    }
  })
})
