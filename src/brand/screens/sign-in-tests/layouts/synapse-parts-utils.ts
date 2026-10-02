import type { CheckRow } from '../engine-run'
import type { Via } from '../conflicts'

/* The network's small helpers (synapse-parts.tsx): the easing its pieces
   share, a check's fact and need in words, a person's first name. */

export const EASE = [0.2, 0, 0, 1] as const

/** A check's fact as the sign-in showed it; a Who that let the person in says how. */
export function factOf(c: CheckRow, via?: Via): string {
  if (c.missing || c.status === 'unknown') return c.value && c.value !== 'Not stated' && !c.missing ? c.value : 'Not stated'
  if (c.category === 'who' && c.status === 'pass' && via?.matches && via.say) return `${c.value} · ${via.say}`
  return c.value
}
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After|Any) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)
export const needOf = (c: CheckRow): string => (!c.requirement ? '' : /^Not in /.test(c.requirement) ? `needs outside ${c.requirement.slice(7)}` : `needs ${lowerFirst(c.requirement)}`)

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
