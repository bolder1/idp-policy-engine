import type { RowsRead } from '../../testing/rows-read'
import { sentenceTokens, type TokenId } from '../../testing/sign-in-sentence'

/* The source's sizes and what it shows (stream-source.tsx), for the source and the geometry. */

export function factTokens(rows: RowsRead): TokenId[] {
  return sentenceTokens(rows).filter((t) => t !== 'person' && t !== 'app')
}

/** The source's card height, for the geometry: its rows are fixed. */
export const sourceCardH = (facts: number): number => 100 + facts * 22

/** The card and the chips under it, as the geometry reserves them. */
export const sourceH = (facts: number, groups: readonly ('from' | 'device' | 'risk')[]): number =>
  sourceCardH(facts) + 46 + groups.reduce((n, g) => n + (g === 'device' ? 108 : g === 'risk' ? 46 : 76), 0)

export function chipGroups(rows: RowsRead): ('from' | 'device' | 'risk')[] {
  const out: ('from' | 'device' | 'risk')[] = ['from']
  if (rows.rows.has('device')) out.push('device')
  if (rows.rows.has('risk')) out.push('risk')
  return out
}
