import { createContext } from 'react'
import { conditionType, zoneScopeOf, type Condition } from '../../data'

/** On while a moved policy's old-policy panel is open: only then do the condition rows carry `data-ct`, so every other
 *  board draws exactly the markup it always did. */
export const CondTagsContext = createContext(false)

/** What a condition asks, as tokens (`data-ct`): the old policy's details light the conditions an old check became by hover
 *  (owner, 12 Nov 2026). A zone says which half it tests, the network or the location; the rest are their own attribute. */
export function condTokens(c: Condition): string {
  if (conditionType(c.typeId).valueKind !== 'zone') return c.typeId
  const halves = new Set(c.values.filter(Boolean).map((v) => zoneScopeOf(c, v)))
  const both = halves.size === 0 || halves.has('both')
  return [both || halves.has('ip') ? 'zone:ip' : '', both || halves.has('location') ? 'zone:location' : ''].filter(Boolean).join(' ')
}
