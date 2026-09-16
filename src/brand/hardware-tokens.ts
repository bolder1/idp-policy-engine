/* -----------------------------------------------------------------------------
   Display tokens — the hardware keyfobs behind the Display Token method.

   Mirrors the live console's "Assign Hardware Token To Users" page, which has
   two halves: Token Management (the tenant's inventory, added one at a time or
   from a CSV) and Assignments (which person holds which token). The rules here
   are the ones miniOrange's admin guide states, not ones invented for the
   prototype:

     - Four token types: miniOrange, Feitian C100, Feitian C200 and TOTP.
     - A serial number is unique across the tenant.
     - A person can hold several tokens; a token belongs to one person at most.
     - An assigned token cannot be deleted. Unassign it first.
     - Assigning skips tokens the person already holds.
     - A Feitian C100 counts button presses, so it drifts and can be synced by
       entering three consecutive codes.
     - Tokens are assigned before the method is switched on.

   The guide publishes neither the CSV column layout nor the algorithm behind
   the miniOrange-branded fob, so both are defined here and said so where they
   are.

   Pure: no React, no clock. Every function that stamps a date takes `now`.
   -------------------------------------------------------------------------- */

export type TokenTypeId = 'miniorange' | 'feitian-c100' | 'feitian-c200' | 'totp'

export interface TokenType {
  id: TokenTypeId
  label: string
  algorithm: 'hotp' | 'totp'
  /** Event-based: the server tracks how many codes the fob has issued. */
  counter: boolean
  /** Can be resynced from three consecutive codes. */
  sync: boolean
  blurb: string
}

export const TOKEN_TYPES: TokenType[] = [
  /* The guide does not say how the miniOrange fob generates codes. Treated as
     time-based, like the TOTP option, because it has no counter to enter and
     no sync action on the live page — the two things an event-based fob needs. */
  { id: 'miniorange', label: 'miniOrange', algorithm: 'totp', counter: false, sync: false, blurb: 'miniOrange keyfob with a time-based code.' },
  { id: 'feitian-c100', label: 'Feitian C100', algorithm: 'hotp', counter: true, sync: true, blurb: 'Counts button presses.' },
  { id: 'feitian-c200', label: 'Feitian C200', algorithm: 'totp', counter: false, sync: false, blurb: 'New code every 60 seconds.' },
  { id: 'totp', label: 'TOTP', algorithm: 'totp', counter: false, sync: false, blurb: 'Any standard time-based token.' },
]

/** Codes are six digits on every supported type. */
export const TOKEN_DIGITS = 6

const TYPE_BY_ID = new Map(TOKEN_TYPES.map((t) => [t.id, t]))

export function tokenType(id: TokenTypeId): TokenType {
  const t = TYPE_BY_ID.get(id)
  if (!t) throw new Error(`Unknown token type: ${id}`)
  return t
}

const isTokenTypeId = (v: string): v is TokenTypeId => TYPE_BY_ID.has(v as TokenTypeId)

/** A type from free text — its id or its label, any case. Null when neither. */
export function matchTokenType(value: string): TokenTypeId | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  return TOKEN_TYPES.find((t) => t.id === v || t.label.toLowerCase() === v)?.id ?? null
}

export interface HardwareToken {
  serial: string
  type: TokenTypeId
  /* The secret key is deliberately NOT here.

     In the real product the secret goes to the server that verifies codes and
     is never shown again. This prototype has no server, so the only honest
     thing to do with a secret is check that it is shaped like one and then
     drop it — keeping it in client state, where every React devtools panel can
     read it, would model exactly the leak the real console is built to avoid. */
  /** Event-based types only: codes issued so far, as the server believes. */
  counter?: number
  /** Who holds it, or null while it sits in inventory. */
  userId: string | null
  addedAt: string
  assignedAt?: string
  /** Last resync from three consecutive codes. Event-based types only. */
  syncedAt?: string
}

/** The add-a-token form, as typed. */
export interface TokenDraft {
  serial: string
  secret: string
  type: TokenTypeId | ''
  counter: string
}

export const emptyDraft: TokenDraft = { serial: '', secret: '', type: '', counter: '' }

// --- Serial numbers -----------------------------------------------------------

export const SERIAL_MAX = 64
export const COUNTER_MAX = 99_999_999

/** Trimmed, with runs of inner whitespace collapsed to one space. */
export function normaliseSerial(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/* The form two serials are compared in; use it to key a Map or Set.

   Case-insensitive. A fob printed "ft-c100-004512" and a CSV row reading
   "FT-C100-004512" are the same piece of plastic, and treating them as two
   would let one token be added twice and assigned to two people. */
export const serialKey = (s: string): string => normaliseSerial(s).toLowerCase()

const findToken = (tokens: readonly HardwareToken[], serial: string) => {
  const key = serialKey(serial)
  return tokens.find((t) => serialKey(t.serial) === key)
}

// --- Validation ---------------------------------------------------------------

export type TokenField = 'serial' | 'secret' | 'type' | 'counter'
export type TokenErrors = Partial<Record<TokenField, string>>

const HEX = /^[0-9a-f]+$/i
/* Base32 is case-insensitive in practice — authenticator apps print it in
   lower case as often as upper — so the check is too. */
const BASE32 = /^[a-z2-7]+=*$/i

function secretShapeOk(raw: string): boolean {
  const s = raw.replace(/\s+/g, '')
  if (HEX.test(s) && s.length % 2 === 0 && s.length >= 20 && s.length <= 128) return true
  return BASE32.test(s) && s.length >= 16 && s.length <= 128
}

function serialError(raw: string, existing: readonly Pick<HardwareToken, 'serial'>[]): string | undefined {
  const serial = normaliseSerial(raw)
  if (!serial) return 'Enter a serial number.'
  if (serial.length > SERIAL_MAX) return `Use ${SERIAL_MAX} characters or fewer.`
  if (!/^[A-Za-z0-9_-]+$/.test(serial)) return 'Use letters, numbers, hyphens or underscores.'
  const key = serial.toLowerCase()
  if (existing.some((t) => serialKey(t.serial) === key)) return 'This serial number is already added.'
  return undefined
}

function counterError(raw: string): string | undefined {
  const c = raw.trim()
  if (c === '') return undefined // blank means the fob is new: 0
  if (!/^\d+$/.test(c)) return 'Enter a whole number, 0 or more.'
  if (Number(c) > COUNTER_MAX) return 'Use 99,999,999 or less.'
  return undefined
}

/** Everything wrong with a draft, keyed by field. Empty when it can be added. */
export function tokenErrors(draft: TokenDraft, existing: readonly Pick<HardwareToken, 'serial'>[]): TokenErrors {
  const errors: TokenErrors = {}
  const serial = serialError(draft.serial, existing)
  if (serial) errors.serial = serial

  if (!draft.secret.replace(/\s+/g, '')) errors.secret = 'Enter the secret key.'
  else if (!secretShapeOk(draft.secret)) errors.secret = 'Use the hex or base32 key that came with the token.'

  if (!draft.type || !isTokenTypeId(draft.type)) errors.type = 'Choose a token type.'
  // Only an event-based fob has a counter; on the others the field is ignored.
  else if (tokenType(draft.type).counter) {
    const counter = counterError(draft.counter)
    if (counter) errors.counter = counter
  }
  return errors
}

const firstError = (e: TokenErrors): string | undefined => e.serial ?? e.secret ?? e.type ?? e.counter

/** The stored token for a draft that passed `tokenErrors`. The secret is dropped here. */
export function tokenFromDraft(draft: TokenDraft, now: string): HardwareToken {
  if (!draft.type || !isTokenTypeId(draft.type)) throw new Error('tokenFromDraft needs a token type')
  const token: HardwareToken = { serial: normaliseSerial(draft.serial), type: draft.type, userId: null, addedAt: now }
  if (tokenType(draft.type).counter) token.counter = draft.counter.trim() === '' ? 0 : Number(draft.counter.trim())
  return token
}

/** '14 Sep 2026' — the date format the seed and the console use. */
export function formatDay(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// --- CSV ----------------------------------------------------------------------

/* The guide offers a sample file to download but never prints its columns, so
   this layout is ours. Snake case to match what bulk-import files in IdP
   consoles conventionally use; `counter` is optional and read only for
   event-based rows. */
export const TOKEN_CSV_HEADER = ['serial_number', 'secret_key', 'token_type', 'counter'] as const
export const ASSIGNMENT_CSV_HEADER = ['username', 'serial_number'] as const

/** The largest file either upload accepts, in data rows. */
export const CSV_ROW_LIMIT = 5000

export const TOKEN_CSV_SAMPLE = [
  TOKEN_CSV_HEADER.join(','),
  'MO-DT-2001,JBSWY3DPEHPK3PXPJBSWY3DP,miniOrange,',
  'FT-C100-004601,3132333435363738393031323334353637383930,Feitian C100,0',
  'FT-C200-118301,GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ,Feitian C200,',
].join('\n') + '\n'

export const ASSIGNMENT_CSV_SAMPLE = [
  ASSIGNMENT_CSV_HEADER.join(','),
  'priya@mo.com,MO-DT-2001',
  'ravi.m@mo.com,FT-C100-004601',
].join('\n') + '\n'

export interface CsvRow {
  /** 1-based line in the file where the row starts. */
  line: number
  cells: string[]
}

/* A small CSV reader, RFC 4180 plus the things spreadsheets actually export:
   a UTF-8 byte-order mark, CRLF or LF, quoted cells holding commas, line breaks
   or doubled quotes, and spaces around cells. Blank lines are skipped, and a
   row's line number is the line it starts on — a quoted line break inside a
   cell does not throw every later number off. */
export function parseCsv(text: string): CsvRow[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: CsvRow[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1

  const endCell = () => {
    cells.push(cell.trim())
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (cells.some((c) => c !== '')) rows.push({ line: rowLine, cells })
    cells = []
  }

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && src[i + 1] === '\n') i += 1
        cell += '\n'
        line += 1
      } else cell += ch
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      // Opening quote; any spaces before it are not part of the value.
      cell = ''
      quoted = true
    } else if (ch === ',') endCell()
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      endRow()
      line += 1
      rowLine = line
    } else cell += ch
  }
  endRow()
  return rows
}

export interface CsvSkip {
  line: number
  serial: string
  reason: string
}

/* Header names are matched without regard to case, order, or the difference
   between "serial_number", "Serial Number" and "serial-number" — the file has
   usually been through a spreadsheet by the time it is uploaded. */
const headerKey = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

function readTable(text: string): { rows: CsvRow[]; col: Map<string, number> } | { error: string } {
  const all = parseCsv(text)
  if (all.length === 0) return { error: 'The file is empty.' }
  const col = new Map<string, number>()
  all[0].cells.forEach((h, i) => {
    const k = headerKey(h)
    if (!col.has(k)) col.set(k, i)
  })
  return { rows: all.slice(1), col }
}

const cellOf = (row: CsvRow, col: Map<string, number>, name: string) => {
  const i = col.get(name)
  return i === undefined ? '' : (row.cells[i] ?? '')
}

function bodyError(rows: CsvRow[]): string | null {
  if (rows.length === 0) return 'The file has no rows under the header.'
  if (rows.length > CSV_ROW_LIMIT) return 'Upload 5,000 rows or fewer at a time.'
  return null
}

export interface TokenCsvResult {
  ready: HardwareToken[]
  skipped: CsvSkip[]
  error: string | null
}

/** Tokens from a Token Management upload. Nothing is added here; `ready` is what an import would add. */
export function parseTokenCsv(
  text: string,
  existing: readonly Pick<HardwareToken, 'serial'>[],
  now: string = formatDay(new Date()),
): TokenCsvResult {
  const table = readTable(text)
  if ('error' in table) return { ready: [], skipped: [], error: table.error }
  const { rows, col } = table
  if (!['serial_number', 'secret_key', 'token_type'].every((k) => col.has(k))) {
    return { ready: [], skipped: [], error: 'The file needs the columns serial_number, secret_key and token_type.' }
  }
  const body = bodyError(rows)
  if (body) return { ready: [], skipped: [], error: body }

  const ready: HardwareToken[] = []
  const skipped: CsvSkip[] = []
  /* The same rules as the form, with uniqueness checked through two Sets
     instead of `tokenErrors`' list scan — at 5,000 rows against a large
     inventory the scan is quadratic, and the answer is identical. */
  const inTenant = new Set(existing.map((t) => serialKey(t.serial)))
  const inFile = new Set<string>()
  for (const row of rows) {
    const typeCell = cellOf(row, col, 'token_type')
    const draft: TokenDraft = {
      serial: cellOf(row, col, 'serial_number'),
      secret: cellOf(row, col, 'secret_key'),
      type: matchTokenType(typeCell) ?? '',
      counter: cellOf(row, col, 'counter'),
    }
    const serial = normaliseSerial(draft.serial)
    const key = serial.toLowerCase()
    const errors = tokenErrors(draft, [])
    if (!errors.serial && inTenant.has(key)) errors.serial = 'This serial number is already added.'
    else if (!errors.serial && inFile.has(key)) errors.serial = 'Appears twice in this file.'
    /* In a file the form's "Choose a token type." is the wrong sentence when
       something WAS written — it says what the column accepts instead. */
    if (errors.type && typeCell.trim()) errors.type = 'Use miniOrange, Feitian C100, Feitian C200 or TOTP.'
    const reason = firstError(errors)
    if (reason) skipped.push({ line: row.line, serial, reason })
    else {
      inFile.add(key)
      ready.push(tokenFromDraft(draft, now))
    }
  }
  return { ready, skipped, error: null }
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
}

export interface AssignmentCsvResult {
  ready: { userId: string; serial: string }[]
  skipped: CsvSkip[]
  error: string | null
}

/** Pairs from an Assignments upload. `serial` in `ready` is the token's stored spelling. */
export function parseAssignmentCsv(
  text: string,
  users: readonly DirectoryUser[],
  tokens: readonly HardwareToken[],
): AssignmentCsvResult {
  const table = readTable(text)
  if ('error' in table) return { ready: [], skipped: [], error: table.error }
  const { rows, col } = table
  if (!['username', 'serial_number'].every((k) => col.has(k))) {
    return { ready: [], skipped: [], error: 'The file needs the columns username and serial_number.' }
  }
  const body = bodyError(rows)
  if (body) return { ready: [], skipped: [], error: body }

  const ready: AssignmentCsvResult['ready'] = []
  const skipped: CsvSkip[] = []
  const byEmail = new Map<string, DirectoryUser>()
  const byId = new Map<string, DirectoryUser>()
  for (const u of users) {
    if (!byEmail.has(u.email.toLowerCase())) byEmail.set(u.email.toLowerCase(), u)
    if (!byId.has(u.id)) byId.set(u.id, u)
  }
  const tokenByKey = new Map<string, HardwareToken>()
  for (const t of tokens) if (!tokenByKey.has(serialKey(t.serial))) tokenByKey.set(serialKey(t.serial), t)
  const inFile = new Set<string>()

  for (const row of rows) {
    const username = cellOf(row, col, 'username').trim()
    const serial = normaliseSerial(cellOf(row, col, 'serial_number'))
    const skip = (reason: string) => skipped.push({ line: row.line, serial, reason })

    // The console's username is the sign-in email; the id is accepted too, exactly.
    const user = username ? (byEmail.get(username.toLowerCase()) ?? byId.get(username)) : undefined
    if (!user) {
      skip('No user with this username.')
      continue
    }
    const token = serial ? tokenByKey.get(serial.toLowerCase()) : undefined
    if (!token) {
      skip('No token with this serial number.')
      continue
    }
    if (token.userId === user.id) {
      skip('Already assigned to this user.')
      continue
    }
    if (token.userId) {
      skip(`Already assigned to ${byId.get(token.userId)?.name ?? 'another user'}.`)
      continue
    }
    const key = serialKey(token.serial)
    if (inFile.has(key)) {
      skip('Appears twice in this file.')
      continue
    }
    inFile.add(key)
    ready.push({ userId: user.id, serial: token.serial })
  }
  return { ready, skipped, error: null }
}

// --- Assignment ---------------------------------------------------------------

export interface AssignResult {
  tokens: HardwareToken[]
  /** Stored spellings of the serials that were assigned. */
  assigned: string[]
  skipped: { serial: string; reason: string }[]
}

/* One person, any number of tokens. Skipping rather than failing the batch is
   the live console's behaviour: tokens the person already holds are passed
   over and the rest go through. */
export function assignTokens(tokens: readonly HardwareToken[], userId: string, serials: readonly string[], now: string): AssignResult {
  const next = [...tokens]
  const index = new Map<string, number>()
  next.forEach((t, i) => {
    if (!index.has(serialKey(t.serial))) index.set(serialKey(t.serial), i)
  })
  const assigned: string[] = []
  const skipped: AssignResult['skipped'] = []
  for (const raw of serials) {
    const i = index.get(serialKey(raw))
    const token = i === undefined ? undefined : next[i]
    if (i === undefined || !token) skipped.push({ serial: normaliseSerial(raw), reason: 'No token with this serial number.' })
    else if (token.userId === userId) skipped.push({ serial: token.serial, reason: 'Already assigned to this user.' })
    else if (token.userId) skipped.push({ serial: token.serial, reason: 'Already assigned to another user.' })
    else {
      next[i] = { ...token, userId, assignedAt: now }
      assigned.push(token.serial)
    }
  }
  return { tokens: next, assigned, skipped }
}

/** Back to inventory. Unknown and already-unassigned serials are ignored. */
export function unassignTokens(tokens: readonly HardwareToken[], serials: readonly string[]): HardwareToken[] {
  const wanted = new Set(serials.map(serialKey))
  return tokens.map((t) => {
    if (!t.userId || !wanted.has(serialKey(t.serial))) return t
    const { assignedAt: _dropped, ...rest } = t
    return { ...rest, userId: null }
  })
}

/** Why a token cannot be deleted, or null when it can. */
export function deleteBlocker(token: HardwareToken): string | null {
  return token.userId ? 'Unassign it first.' : null
}

export function deleteTokens(
  tokens: readonly HardwareToken[],
  serials: readonly string[],
): { tokens: HardwareToken[]; deleted: string[]; blocked: string[] } {
  const deleted: string[] = []
  const blocked: string[] = []
  const wanted = new Set(serials.map(serialKey))
  const kept = tokens.filter((t) => {
    if (!wanted.has(serialKey(t.serial))) return true
    if (deleteBlocker(t)) {
      blocked.push(t.serial)
      return true
    }
    deleted.push(t.serial)
    return false
  })
  return { tokens: kept, deleted, blocked }
}

// --- Sync ---------------------------------------------------------------------

/** What is wrong with three codes typed to resync a token, or null. */
export function syncErrors(codes: readonly string[]): string | null {
  const clean = codes.map((c) => c.replace(/\s+/g, ''))
  if (clean.length !== 3 || !clean.every((c) => c.length === TOKEN_DIGITS && /^\d+$/.test(c))) {
    return 'Enter the three codes the token shows, one after another.'
  }
  if (clean[0] === clean[1] && clean[1] === clean[2]) return 'Press the button between codes.'
  return null
}

export const canSync = (token: Pick<HardwareToken, 'type'>): boolean => tokenType(token.type).sync

/* The real server walks forward from its stored counter until three codes in a
   row line up, and keeps that position. There is no secret here to walk with,
   so the prototype records that a sync happened and puts the counter back to
   the start; `syncedAt` is what the screen should read. Validate the codes
   with `syncErrors` before calling. */
export function syncToken(
  tokens: readonly HardwareToken[],
  serial: string,
  now: string,
): { tokens: HardwareToken[]; error: string | null } {
  const token = findToken(tokens, serial)
  if (!token) return { tokens: [...tokens], error: 'No token with this serial number.' }
  if (!canSync(token)) return { tokens: [...tokens], error: 'Only event-based tokens can be synced.' }
  return { tokens: tokens.map((t) => (t === token ? { ...t, counter: 0, syncedAt: now } : t)), error: null }
}

// --- Selectors ----------------------------------------------------------------

export const tokensOf = (tokens: readonly HardwareToken[], userId: string): HardwareToken[] => tokens.filter((t) => t.userId === userId)
export const assignedCount = (tokens: readonly HardwareToken[]): number => tokens.filter((t) => t.userId).length
/** How many distinct people hold at least one token. */
export const holders = (tokens: readonly HardwareToken[]): number => new Set(tokens.flatMap((t) => (t.userId ? [t.userId] : []))).size
export const unassigned = (tokens: readonly HardwareToken[]): HardwareToken[] => tokens.filter((t) => !t.userId)

// --- The method it serves -----------------------------------------------------

export const DISPLAY_TOKEN_METHOD_ID = 'display-token'

/* Keeps the Display Token method honest about its inventory.

   miniOrange's guide says tokens are assigned to users before the method is
   enabled — a method that is on with nobody holding a fob can only reject
   every code. So the method counts as configured exactly while at least one
   token is assigned, and losing the last assignment also switches it off.
   Returns the same array when nothing changes, so a store can call it on
   every token edit without re-rendering the methods screen for nothing. */
export function withTokenState<M extends { id: string; configured: boolean; active: boolean }>(
  methods: M[],
  tokens: readonly HardwareToken[],
): M[] {
  const configured = assignedCount(tokens) > 0
  let changed = false
  const next = methods.map((m) => {
    if (m.id !== DISPLAY_TOKEN_METHOD_ID) return m
    const active = configured ? m.active : false
    if (m.configured === configured && m.active === active) return m
    changed = true
    return { ...m, configured, active }
  })
  return changed ? next : methods
}
