import { describe, expect, it } from 'vitest'

import { card, cond, when } from '../data'
import { conditionSentence } from './predicate-prose'
import { PLACE_FACTS, evalCond, type SimContext } from './simulate'

/* -----------------------------------------------------------------------------
   A zone has two halves, and a condition may now name one of them.

   Which is only worth having if the three things that READ a condition all know
   about it: the evaluator, so a narrowed rule is graded on the half it asked
   about; the prose, so the change list and the read-back can tell two such
   rules apart; and the fixtures, so the evaluator has a fact to grade against
   rather than an assumption.

   The third is the one that makes the other two honest. `PlaceFacts.zonesIn`
   said an origin was inside a zone without saying which half put it there, so a
   scoped rule would have been graded against the whole zone and the trace would
   have reported a verdict it had not earned — the one failure this simulator is
   written to avoid.
   -------------------------------------------------------------------------- */

const ctx = (place: string): SimContext => ({
  user: { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com', groupId: 'finance', groupName: 'Finance', userType: 'Employee', role: 'Member' },
  place,
  device: 'Known < 90 days',
  authState: 'Normal returning user',
  risk: 'Low',
  nowMinutes: 570,
})

describe('the fixtures say which half puts an origin in a zone', () => {
  /* The invariant the evaluator depends on. Break it and a zone becomes
     reachable through one half and unreachable through the pair, which is not a
     state a real origin can be in. */
  it('keeps zonesIn as exactly the union of the two halves', () => {
    for (const [place, f] of Object.entries(PLACE_FACTS)) {
      if (f.zonesIn === null) {
        expect(f.zonesByIp, place).toEqual([])
        expect(f.zonesByLocation, place).toEqual([])
        continue
      }
      expect(new Set([...f.zonesByIp, ...f.zonesByLocation]), place).toEqual(new Set(f.zonesIn))
    }
  })
})

describe('the evaluator grades a zone on the half the condition asked about', () => {
  it('passes on the network half for an origin that is in the zone by address', () => {
    const c = cond('zone', 'in zone', ['office'], 'ip')
    expect(evalCond(c, ctx('Office Network')).state).toBe('pass')
  })

  /* The whole point. "Office Network" is an address block with no geographic
     section, so an origin inside it is inside it on the network and NOT by
     location — and a rule that asked about the map must not be satisfied by a
     match on the wire. */
  it('fails on the geographic half for the same origin', () => {
    const c = cond('zone', 'in zone', ['office'], 'location')
    expect(evalCond(c, ctx('Office Network')).state).toBe('fail')
  })

  it('passes unscoped, because that is the zone as written', () => {
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx('Office Network')).state).toBe('pass')
  })

  /* Undecided beats a guess. An origin with no fixed place cannot answer a zone
     test on either half, and answering it anyway is how a rehearsal becomes
     something nobody should trust. */
  it('stays undecided on an unpinned origin whatever the half', () => {
    for (const scope of [undefined, 'ip', 'location'] as const) {
      expect(evalCond(cond('zone', 'in zone', ['office'], scope), ctx('Any location')).state).toBe('unknown')
    }
  })

  /* The fixtures are the point of this pair. An origin geolocating to Germany
     is inside "EU Countries" — that zone has no address section at all, and an
     empty section means ANY — so a location-scoped rule about it has to be able
     to pass. It could not: the geographic column was empty for every origin,
     which made the whole half of this feature unreachable in a rehearsal. */
  it('passes on the geographic half for an origin inside a zone by its map alone', () => {
    expect(evalCond(cond('zone', 'in zone', ['eu'], 'location'), ctx('Known proxy')).state).toBe('pass')
    expect(evalCond(cond('zone', 'in zone', ['pune-hq'], 'location'), ctx('Office Network')).state).toBe('pass')
  })

  /* And the contradiction that went with it: "Known proxy" answered PASS to
     "Country is Germany" and FAIL to "in zone EU Countries" in one trace. */
  it('agrees with the country test on the same origin', () => {
    expect(evalCond(cond('country', 'is', ['Germany']), ctx('Known proxy')).state).toBe('pass')
    expect(evalCond(cond('zone', 'in zone', ['eu']), ctx('Known proxy')).state).toBe('pass')
  })

  /* The detail is built from the half that was tested, not from the origin's
     whole membership — it read "this sign-in is in Office Network by location"
     directly beneath the word FAIL. */
  it('never asserts membership the verdict just rejected', () => {
    const r = evalCond(cond('zone', 'in zone', ['office'], 'location'), ctx('Office Network'))
    expect(r.state).toBe('fail')
    expect(r.detail).not.toContain('Office Network')
  })

  it('names the half in the detail, so the trace says what it tested', () => {
    expect(evalCond(cond('zone', 'in zone', ['office'], 'ip'), ctx('Office Network')).detail).toContain('on the network')
    expect(evalCond(cond('zone', 'in zone', ['office']), ctx('Office Network')).detail).not.toContain('on the network')
  })
})

describe('the read-back tells the two halves apart', () => {
  it('says which half, and only when it is narrower than the zone', () => {
    expect(conditionSentence(cond('zone', 'not in zone', ['office'], 'ip'))).toBe('not in zone Office Network, on the network only')
    expect(conditionSentence(cond('zone', 'not in zone', ['office']))).toBe('not in zone Office Network')
  })

  /* Values are ORed by the evaluator, so a comma — which reads as a list of
     requirements — described a narrower rule than the one that would run. */
  it('joins several values with “or”, which is what the evaluator does', () => {
    expect(conditionSentence(cond('zone', 'in zone', ['office', 'eu']))).toBe('in zone Office Network or EU Countries')
    expect(conditionSentence(cond('country', 'is', ['India', 'Germany']))).toBe('Country is India or Germany')
  })
})

/* The sig/ckey side of this is pinned in when-ops.test.ts, and the linter side
   in diagnostics.test.ts — both of which had to learn that two halves of one
   zone are two questions rather than one repeated. */
describe('a scoped condition is a different condition', () => {
  it('does not collide with the same zone asked about unscoped', () => {
    const a = when(card(cond('zone', 'in zone', ['office'], 'ip')))
    const b = when(card(cond('zone', 'in zone', ['office'])))
    expect(JSON.stringify(a.cards[0].conditions[0].scope)).not.toBe(JSON.stringify(b.cards[0].conditions[0].scope))
  })
})
