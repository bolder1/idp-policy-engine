import { shows } from './rollout'

/* Who, as counts (rollout.ts `whoCount`; owner, 26 Nov 2026: "just showcase the number … in blue text … the same goes
   inside the card … for both user and group"). The panel's Groups and People rows and a rule card's who say the same
   words, from here. */

/** Who reads as counts on this line. */
export const WHO_COUNT: boolean = shows('whoCount')

/** "1 group", "3 groups", "1 person", "4 people". */
export function countWord(kind: 'group' | 'user', n: number): string {
  if (kind === 'group') return `${n} ${n === 1 ? 'group' : 'groups'}`
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

/** The card's who: "2 groups · 3 people", either part left out when it is none. */
export function whoCountWords(groups: number, users: number): string {
  return [groups > 0 ? countWord('group', groups) : null, users > 0 ? countWord('user', users) : null].filter(Boolean).join(' · ')
}
