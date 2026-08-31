import { describe, expect, it } from 'vitest'

import { AUTH_METHODS, methodBlocker, methodById } from './methods'
import { SEED_ENROLMENT, enrolShapeFor } from './user-methods'

/* The join between the admin's catalogue and the person's side of it.

   These two files describe one thing from two directions, and the failure mode
   is silent: a seeded enrolment for a method the tenant does not offer produces
   a person who has "configured" something their screen cannot show them, and
   nothing throws. The first version of SEED_ENROLMENT had exactly that bug —
   it enrolled all three Email methods when the seed only offers one. */

describe('the person can only be enrolled in what they can reach', () => {
  it('seeds no enrolment for a method end users cannot reach', () => {
    for (const id of SEED_ENROLMENT.configured) {
      const m = methodById(id)
      expect(m, `"${id}" is not in the catalogue at all`).toBeDefined()
      expect(
        methodBlocker(m!),
        `"${id}" is seeded as configured, but end users cannot reach it: `,
      ).toBeNull()
    }
  })

  it('seeds an active method that is also enrolled', () => {
    const { active, configured } = SEED_ENROLMENT
    if (active === null) return
    expect(configured, `"${active}" is active but not configured`).toContain(active)
  })

  it('holds values only for methods it claims are configured', () => {
    for (const id of Object.keys(SEED_ENROLMENT.values)) {
      expect(SEED_ENROLMENT.configured, `values seeded for unconfigured "${id}"`).toContain(id)
    }
  })
})

/* Scoped to SECOND FACTORS, which is what these invariants were always about.

   The catalogue gained the three ways a session can start — password, passkeys,
   magic link — and none of them has the things asserted below: no provider
   integration to configure, no enrolment ceremony to walk a person through, no
   delivery family, and no row on the MFA sheet. Password in particular is on
   for everyone and configured by nobody.

   Asserting over the whole array would have forced a form and a shape to be
   invented for each of them just to keep a test quiet, which is the test
   changing the product. */
const FACTORS = AUTH_METHODS.filter((m) => m.use === 'second')

describe('every method knows what to ask a person for', () => {
  it('gives each method in the catalogue an enrolment shape', () => {
    /* Falling through to 'none' is a legitimate answer for CAC and the grid,
       and a bug for anything that genuinely needs a form — so the assertion is
       that the fall-through set is exactly the two we decided on, not that
       every method has an entry. */
    const fellThrough = FACTORS.filter((m) => enrolShapeFor(m.id).kind === 'none').map((m) => m.id)
    expect(fellThrough.sort()).toEqual(['cac', 'grid'])
  })

  it('asks for a field wherever it says it will', () => {
    for (const m of FACTORS) {
      const s = enrolShapeFor(m.id)
      if (s.kind === 'phone' || s.kind === 'email' || s.kind === 'alt-email' || s.kind === 'token') {
        expect(s.label, `${m.name} (${s.kind}) has no field label`).toBeTruthy()
      }
      if (s.kind === 'none') {
        expect(s.note, `${m.name} has nothing to set up and does not say so`).toBeTruthy()
      }
    }
  })
})
