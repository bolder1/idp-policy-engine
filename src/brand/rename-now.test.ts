import { describe, expect, it } from 'vitest'

import { nameIssue, profileChangeParts, profileReview, seedProfiles, type FingerprintProfile } from './fingerprint'
import { keepName, nameRefusal } from './rename-now'
import { GENERAL_GROUP, groupSections } from './review-rows'
import {
  blankRiskProfile,
  riskChangeNames,
  riskProfileNameProblem,
  riskReviewRows,
  setSignalOn,
  type RiskProfile,
} from './risk-signals'

/* A rename saves itself (owner, 1 Oct 2026): the name field's ✓ on a stored
   item writes the name to the store at once, only the name, and the draft's
   name follows — so the review never lists it, and the draft's other edits
   stay unsaved. The pages wire this up; what is pinned here is what they
   write and what the review then says. */

describe('keeping a typed name on a stored item', () => {
  const stored: RiskProfile = blankRiskProfile('Remote workforce', 'rp-remote')
  const others = ['Branch offices']
  const issue = (name: string) => riskProfileNameProblem(name, others)

  it('saves only the name, trimmed, never the draft', () => {
    /* A signal switched off a minute ago, still unsaved. */
    const draft = setSignalOn(stored, 'tor', false)
    const kept = keepName(stored, '  Field sales ', issue)
    expect(kept).toEqual({ kind: 'saved', name: 'Field sales', stored: { ...stored, name: 'Field sales' } })
    if (kept.kind !== 'saved') return
    // What reaches the store still has Tor on: the draft's edit is not in it.
    expect(kept.stored.off).toEqual(stored.off)
    expect(kept.stored.off).not.toEqual(draft.off)

    /* The draft's name follows, so Review changes has no Name row and the
       save footer no "Name" — and still lists the signal. */
    const followed = { ...draft, name: kept.name }
    const rows = riskReviewRows(kept.stored, followed)
    expect(rows.some((r) => r.label === 'Name')).toBe(false)
    expect(rows.some((r) => r.label === 'Signal: Tor exit node')).toBe(true)
    expect(riskChangeNames(kept.stored, followed)).toEqual(['Signals'])
    // A rename alone leaves nothing to save.
    expect(riskReviewRows(kept.stored, { ...stored, name: kept.name })).toEqual([])
  })

  it('saves nothing for a blank name or the name it has, and puts that name back', () => {
    expect(keepName(stored, '   ', issue)).toEqual({ kind: 'same', name: 'Remote workforce' })
    expect(keepName(stored, ' Remote workforce ', issue)).toEqual({ kind: 'same', name: 'Remote workforce' })
    // A blank name is put back, not refused: no error under the field.
    expect(nameRefusal(stored, '', issue)).toBeNull()
  })

  it("refuses a name another item has, in the page's own words", () => {
    expect(keepName(stored, 'branch offices ', issue)).toEqual({
      kind: 'refused',
      problem: 'A risk profile with this name already exists.',
    })
    expect(nameRefusal(stored, 'Branch offices', issue)).toBe('A risk profile with this name already exists.')
    // Its own name in another case is a rename, not a clash.
    expect(keepName(stored, 'remote workforce', issue)).toMatchObject({ kind: 'saved', name: 'remote workforce' })
    expect(nameRefusal(stored, 'Field sales', issue)).toBeNull()
  })
})

describe('a device profile renamed with an unsaved draft', () => {
  const corp = seedProfiles.find((p) => p.id === 'fp-corp') as FingerprintProfile
  const others = seedProfiles.filter((p) => p.id !== corp.id).map((p) => p.name)
  const issue = (name: string) => nameIssue(name, others)

  it('stores the new name with the stored checks, and reviews only the checks', () => {
    const draft: FingerprintProfile = { ...corp, enabled: ['device-type', 'browser-chrome'] }
    const kept = keepName(corp, 'Corporate laptops', issue)
    if (kept.kind !== 'saved') throw new Error('expected the rename to save')
    expect(kept.stored).toEqual({ ...corp, name: 'Corporate laptops' })
    // The setup flag is the stored one: a rename answers nothing.
    expect(kept.stored.restrictionSet).toBe(corp.restrictionSet)

    const followed = { ...draft, name: kept.name }
    const rows = profileReview(kept.stored, followed)
    expect(rows.map((r) => r.label)).toEqual(['Checks: added Chrome version', 'Checks: removed Windows OS version'])
    expect(profileChangeParts(kept.stored, followed)).toEqual(['1 check added', '1 check removed'])
    // No name, so no Basic details section either: only what was changed.
    expect(groupSections(rows).map((x) => x.title)).toEqual(['Checks'])
    expect(groupSections(rows).map((x) => x.title)).not.toContain(GENERAL_GROUP)
  })

  it("refuses another profile's name", () => {
    const taken = others[0]
    expect(keepName(corp, taken, issue)).toEqual({ kind: 'refused', problem: 'A profile with this name already exists.' })
  })
})
