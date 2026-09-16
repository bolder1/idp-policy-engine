import {
  TOKEN_DIGITS,
  serialKey,
  tokenType,
  tokensOf,
  unassigned,
  type DirectoryUser,
  type HardwareToken,
} from '../hardware-tokens'

/* -----------------------------------------------------------------------------
   The Display tokens page's decisions, without React.

   The inventory rules themselves live in hardware-tokens.ts. What is here is
   the part the screen adds on top: which rows each tab shows for a search and a
   filter, what a selection can have done to it, how an upload's pairs are
   handed to the store, and the few sentences whose wording depends on a count.
   -------------------------------------------------------------------------- */

export type TokenFilter = 'all' | 'unassigned' | 'assigned'

/* No counts on these: a number appears once per view, and a filter is not the
   place for it. */
export const TOKEN_FILTERS: { id: TokenFilter; label: string }[] = [
  { id: 'all', label: 'All tokens' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'assigned', label: 'Assigned' },
]

/** "1 token", "3 tokens". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/* Spaces and hyphens are ignored on both sides for a serial, because a fob
   prints "FT C100 004512" as often as "FT-C100-004512" and neither form should
   hide it. */
const tight = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '')

function serialHit(serial: string, needle: string): boolean {
  const s = serial.toLowerCase()
  const t = tight(needle)
  return s.includes(needle) || (!!t && tight(serial).includes(t))
}

/* Token management's search reaches the serial, the type and the holder — the
   three things on a row. */
export function filterTokens(
  tokens: readonly HardwareToken[],
  users: readonly DirectoryUser[],
  query: string,
  filter: TokenFilter,
): HardwareToken[] {
  const needle = query.trim().toLowerCase()
  const byId = new Map(users.map((u) => [u.id, u]))
  return tokens.filter((t) => {
    if (filter === 'assigned' && !t.userId) return false
    if (filter === 'unassigned' && t.userId) return false
    if (!needle) return true
    if (serialHit(t.serial, needle)) return true
    if (tokenType(t.type).label.toLowerCase().includes(needle)) return true
    const holder = t.userId ? byId.get(t.userId) : undefined
    return !!holder && (holder.name.toLowerCase().includes(needle) || holder.email.toLowerCase().includes(needle))
  })
}

/* --- Assignments ----------------------------------------------------------------- */

export interface Assignment {
  token: HardwareToken
  /** Null when the holder is no longer in the directory — the row still has to be unassignable. */
  person: DirectoryUser | null
}

/* One row per assigned token, the live console's Assignments table.

   By person, then serial, rather than in inventory order: somebody holding two
   fobs is one person to read about, and their rows belong together. A holder
   missing from the directory sorts last, under the name the row shows. */
export function assignmentsOf(tokens: readonly HardwareToken[], users: readonly DirectoryUser[]): Assignment[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const name = (a: Assignment) => a.person?.name ?? '￿'
  return tokens
    .filter((t) => t.userId)
    .map((t) => ({ token: t, person: byId.get(t.userId ?? '') ?? null }))
    .sort((a, b) => name(a).localeCompare(name(b)) || a.token.serial.localeCompare(b.token.serial))
}

/** Assignments whose person (name or email), serial or type matches. */
export function filterAssignments(rows: readonly Assignment[], query: string): Assignment[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]
  return rows.filter(
    ({ token, person }) =>
      serialHit(token.serial, needle) ||
      tokenType(token.type).label.toLowerCase().includes(needle) ||
      (!!person && (person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle))),
  )
}

/* What the Assignments tab says when it has no rows. With no tokens at all
   there is nothing to assign, and the way forward is the other tab; with tokens
   waiting, it is assigning them. */
export type AssignmentsEmpty = 'no-tokens' | 'none-assigned'
export const assignmentsEmpty = (tokens: readonly HardwareToken[]): AssignmentsEmpty =>
  tokens.length === 0 ? 'no-tokens' : 'none-assigned'

/* --- Selection -------------------------------------------------------------------- */

export interface SelectionPlan {
  /** The selected tokens that still exist, in the order given. */
  picked: HardwareToken[]
  /** What Unassign would act on. */
  assigned: HardwareToken[]
  /** What Delete would act on; assigned tokens are skipped. */
  deletable: HardwareToken[]
}

export function selectionPlan(tokens: readonly HardwareToken[], selected: readonly string[]): SelectionPlan {
  const keys = new Set(selected.map(serialKey))
  const picked = tokens.filter((t) => keys.has(serialKey(t.serial)))
  return {
    picked,
    assigned: picked.filter((t) => t.userId),
    deletable: picked.filter((t) => !t.userId),
  }
}

/** Adds or removes one serial. */
export function toggleSelected(selected: readonly string[], serial: string): string[] {
  const key = serialKey(serial)
  return selected.some((s) => serialKey(s) === key)
    ? selected.filter((s) => serialKey(s) !== key)
    : [...selected, serial]
}

/* Select all, over the rows a search leaves — every page of them, not only the
   one on screen. Pressed with all of them already selected, it clears them;
   serials selected under an earlier search stay out of it either way. */
export function toggleAll(selected: readonly string[], shown: readonly string[]): string[] {
  const keys = new Set(shown.map(serialKey))
  const rest = selected.filter((s) => !keys.has(serialKey(s)))
  const all = shown.length > 0 && shown.every((s) => selected.some((x) => serialKey(x) === serialKey(s)))
  return all ? rest : [...rest, ...shown]
}

/* Whether unassigning these leaves nobody holding a token — the moment the
   store switches Display Token off, which a confirmation has to say before it
   happens rather than after. False when nothing is assigned to begin with:
   there is nothing left to lose. */
export function leavesNobody(tokens: readonly HardwareToken[], serials: readonly string[]): boolean {
  const keys = new Set(serials.map(serialKey))
  const held = tokens.filter((t) => t.userId)
  return held.length > 0 && held.every((t) => keys.has(serialKey(t.serial)))
}

/** "Has 2 tokens", or null for somebody who holds none. */
export function heldLabel(n: number): string | null {
  return n > 0 ? `Has ${plural(n, 'token')}` : null
}

/* Names for a confirmation, briefly: two, then a remainder. Each person once,
   in the order given, whatever number of their tokens are in the batch. */
export function namesBrief(names: readonly string[], max = 2): string {
  const unique = [...new Set(names)]
  if (unique.length <= max) return unique.join(' and ')
  return `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`
}

/** What the assign slider lists for a person: the tokens anyone can take, and the ones this person already holds. */
export function assignChoices(tokens: readonly HardwareToken[], userId: string | null) {
  return {
    free: unassigned(tokens),
    held: userId ? tokensOf(tokens, userId) : [],
  }
}

/* The store assigns to one person per call, and an assignment upload names
   many. Grouped by person in the order people first appear, each person's
   serials in file order, so the calls read the file top to bottom. */
export function groupPairs(pairs: readonly { userId: string; serial: string }[]): { userId: string; serials: string[] }[] {
  const out = new Map<string, string[]>()
  for (const p of pairs) {
    const list = out.get(p.userId)
    if (list) list.push(p.serial)
    else out.set(p.userId, [p.serial])
  }
  return [...out].map(([userId, serials]) => ({ userId, serials }))
}

/** "12 tokens imported", "12 tokens imported, 2 skipped". */
export function importSummary(done: number, skipped: number, verb: 'imported' | 'assigned'): string {
  const head = `${plural(done, 'token')} ${verb}`
  return skipped > 0 ? `${head}, ${skipped} skipped` : head
}

/** "MO-DT-1002 assigned to Priya Sharma", "2 tokens assigned to Priya Sharma". */
export function assignedToast(serials: readonly string[], name: string): string {
  return `${serials.length === 1 ? serials[0] : plural(serials.length, 'token')} assigned to ${name}`
}

/* What an assignment toast adds when the store passed tokens over. One is named
   with its reason, so the admin knows what to fix; more are counted, because a
   toast cannot hold a list. */
export function withSkips(head: string | null, skipped: readonly { serial: string; reason: string }[]): string {
  if (skipped.length === 0) return head ?? ''
  const [first] = skipped
  const note =
    skipped.length === 1
      ? `${first.serial} skipped: ${first.reason.charAt(0).toLowerCase()}${first.reason.slice(1)}`
      : `${skipped.length} skipped`
  /* Not capitalised: the note starts with a serial or a count, and a serial is
     an identifier — "ft-c100-9" upper-cased to "Ft-c100-9" names no token. */
  return head ? `${head}. ${note}` : note
}

/** "MO-DT-1002 unassigned", "3 tokens deleted" — one serial by name, more by count. */
export function actedToast(serials: readonly string[], verb: string): string {
  return `${serials.length === 1 ? serials[0] : plural(serials.length, 'token')} ${verb}`
}

/* A paste into the first code box that holds all three codes: eighteen digits,
   with or without spaces, hyphens or line breaks between them. Anything else is
   not three codes, and the box keeps what the browser pasted. */
export function splitCodes(raw: string): string[] | null {
  const digits = raw.replace(/[\s-]+/g, '')
  if (!new RegExp(`^\\d{${TOKEN_DIGITS * 3}}$`).test(digits)) return null
  return [0, 1, 2].map((i) => digits.slice(i * TOKEN_DIGITS, (i + 1) * TOKEN_DIGITS))
}

/** A download name for a sample, and whether a chosen file looks like a CSV. */
export const SAMPLE_NAME = { tokens: 'display-tokens-sample.csv', assignments: 'token-assignments-sample.csv' } as const
export const isCsvName = (name: string): boolean => /\.csv$/i.test(name.trim())
