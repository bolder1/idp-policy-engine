import type { AccessDecision } from '../data'
import { FACTOR_RANK } from './factor-strength'
import { TENANT_SITUATIONS, type TenantSweep } from './impact-arena'
import { originWord, type OriginEnv } from './origin-words'
import { PLACES, SIM_USERS, type SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   What changes: two tenant sweeps, compared as four kinds of move.

   The looser two first, because they are the ones worth being sure about:

     Now allowed        was denied, now let in on either factor count
     Now on 1 factor    was asked for 2FA, now let in on one factor
     Now asked for 2FA  was let in on one factor, now asked for a second
     Now denied         was let in, now refused

   Each count is of modelled situations (`TENANT_SITUATIONS`, one per person,
   origin, device and risk on each application), never of people or of real
   traffic, and a situation no policy decides in either sweep is passed over.
   The line says so once, before the counts: "Of 360 modelled sign-ins: …".
   The names say who moved: "Priya Sharma (Finance)", with the origins it
   happened from in the grid's own order, each in the words the admin has
   seen — a Try a sign-in origin or a zone (origin-words.ts), never the grid's
   own chip names.

   One more move is counted and not named: a sign-in asked for 2FA both times,
   with a weaker second factor after. It is not one of the four — the decision
   did not move — but it loosens all the same, and `loosens` reads it. The
   Break-in test uses that to never offer a fix that loosens anything, and the
   checks before a save read the same line (spec D §5.4).
   -------------------------------------------------------------------------- */

/** A person who moved, and where from. */
export interface Named {
  personId: string
  /** "Priya Sharma (Finance)". */
  label: string
  /** The origins, in `PLACES` order, each once, as `originWord` says them: "Office network", "Tor exit". */
  origins: string[]
}

export interface WhatChangesCounts {
  nowAllowed: number
  nowOn1Factor: number
  nowAskedFor2fa: number
  nowDenied: number
}

export interface WhatChangesLine {
  /** The situations compared: 360 for each application swept. */
  total: number
  appNames: string[]
  nowAllowed: Named[]
  nowOn1Factor: Named[]
  nowAskedFor2fa: Named[]
  nowDenied: Named[]
  counts: WhatChangesCounts
  /** Still asked for 2FA, with a weaker second factor. Loosens; not one of the four. */
  weakerFactor: number
}

/** The four moves, looser first, with the words the line says them in. */
export const WHAT_CHANGES: readonly { key: keyof WhatChangesCounts; word: string }[] = [
  { key: 'nowAllowed', word: 'Now allowed' },
  { key: 'nowOn1Factor', word: 'Now on 1 factor' },
  { key: 'nowAskedFor2fa', word: 'Now asked for 2FA' },
  { key: 'nowDenied', word: 'Now denied' },
]

function moveOf(b: AccessDecision, a: AccessDecision): keyof WhatChangesCounts | null {
  if (b === 'deny' && a !== 'deny') return 'nowAllowed'
  if (b === '2fa' && a === '1fa') return 'nowOn1Factor'
  if (b === '1fa' && a === '2fa') return 'nowAskedFor2fa'
  if (b !== 'deny' && a === 'deny') return 'nowDenied'
  return null
}

/* Sweeps are paired by application, so the two lists need not share an order
   — only the applications. One only in `after` has nothing to compare with.
   The env names the applications and the zones an origin is in; without one,
   applications are named by id and origins by their Try origin or place. */
export function whatChangesLine(
  before: readonly TenantSweep[],
  after: readonly TenantSweep[],
  env: OriginEnv & Pick<SimEnv, 'appName'> = {},
): WhatChangesLine {
  const appName = env.appName ?? ((id: string) => id)
  const moved: Record<keyof WhatChangesCounts, Map<string, Set<string>>> = {
    nowAllowed: new Map(),
    nowOn1Factor: new Map(),
    nowAskedFor2fa: new Map(),
    nowDenied: new Map(),
  }
  const counts: WhatChangesCounts = { nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 0, nowDenied: 0 }
  let weakerFactor = 0
  let total = 0
  const apps: string[] = []

  for (const was of before) {
    const now = after.find((x) => x.appId === was.appId)
    if (!now) continue
    apps.push(was.appId)
    total += TENANT_SITUATIONS.length
    TENANT_SITUATIONS.forEach((s, i) => {
      const b = was.decisions[i]
      const a = now.decisions[i]
      if (b === null || a === null) return
      const move = b === a ? null : moveOf(b, a)
      if (move) {
        counts[move] += 1
        const places = moved[move].get(s.userId) ?? new Set<string>()
        places.add(s.place)
        moved[move].set(s.userId, places)
        return
      }
      const fb = was.factors[i]
      const fa = now.factors[i]
      if (b === '2fa' && a === '2fa' && fb !== null && fa !== null && FACTOR_RANK[fa] < FACTOR_RANK[fb]) weakerFactor += 1
    })
  }

  /* People in the grid's order, and each one's origins in the grid's order,
     so two runs that moved the same situations print the same line. Two
     origins can share a word (two chips inside one zone), and it is said once. */
  const words = new Map<string, string>()
  const wordOf = (chip: string) => {
    if (!words.has(chip)) words.set(chip, originWord(chip, env))
    return words.get(chip)!
  }
  const named = (m: Map<string, Set<string>>): Named[] =>
    SIM_USERS.filter((u) => m.has(u.id)).map((u) => ({
      personId: u.id,
      label: `${u.name} (${u.groupName})`,
      origins: [...new Set(PLACES.filter((p) => m.get(u.id)!.has(p)).map(wordOf))],
    }))

  return {
    total,
    appNames: apps.map(appName),
    nowAllowed: named(moved.nowAllowed),
    nowOn1Factor: named(moved.nowOn1Factor),
    nowAskedFor2fa: named(moved.nowAskedFor2fa),
    nowDenied: named(moved.nowDenied),
    counts,
    weakerFactor,
  }
}

/* "Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for
   2FA 18 · Now denied 72". The unit leads, once: the four counts are of
   modelled sign-ins, not people or traffic, and a bare "Now allowed 72" left
   the reader to guess of what (owner, 26 Sep 2026). */
export function whatChangesSaid(line: Pick<WhatChangesLine, 'counts' | 'total'>): string {
  if (line.total === 0) return 'No modelled sign-ins'
  return `Of ${line.total.toLocaleString('en-US')} modelled sign-ins: ${WHAT_CHANGES.map((m) => `${m.word} ${line.counts[m.key]}`).join(' · ')}`
}

/** Anything let in more easily than before: a looser decision, or a weaker second factor. */
export function loosens(line: Pick<WhatChangesLine, 'counts' | 'weakerFactor'>): boolean {
  return line.counts.nowAllowed > 0 || line.counts.nowOn1Factor > 0 || line.weakerFactor > 0
}
