import type { AuthMethod } from '../methods'

/* -----------------------------------------------------------------------------
   CAC Card's trusted CA chains (owner, 21 Sep 2026; a list since 30 Sep).

   The live console's "Add trusted CA or certificate chain (.pem format)"
   dialog, opened from the CAC Card row as a slider rather than a centred
   dialog (see "slider pages over centred modals"). On 30 Sep the owner asked
   for it to hold many: "this upload can be multiple — add a list view of all
   uploaded files". So the slider opens on the tenant's list of chains, and Add
   CA chain pushes the upload page, which takes one file or many at once.

   Each file keeps the live dialog's two fields — an alias, and the chain itself
   as a PEM file. Files are read in the browser and never leave it: this
   prototype has nowhere to send them, and pretending otherwise would be a form
   that looks like it works. After a real upload, miniOrange support enables
   the chain, which is why a new chain says "Waiting for support" rather than
   claiming it is live.

   Everything here is pure; the slider is ca-chain-drawer.tsx and the session's
   list is ca-chains.ts.
   -------------------------------------------------------------------------- */

/** The one method whose row carries the CA chains. */
export const CA_CHAIN_METHOD_ID = 'cac'

export const takesCaChain = (m: Pick<AuthMethod, 'id'>): boolean => m.id === CA_CHAIN_METHOD_ID

/** What the file chooser offers. PEM text is what counts; .crt and .cer are often PEM too. */
export const CA_FILE_ACCEPT = '.pem,.crt,.cer'

export const isCaFileName = (name: string): boolean => /\.(pem|crt|cer)$/i.test(name.trim())

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g

/** How many PEM certificates a file holds. A chain is one or more. */
export const pemCertCount = (text: string): number => (text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length

/* --- Reading a certificate ------------------------------------------------------

   Just enough DER to say what a chain is: the subject's common name and when it
   stops being valid. A certificate is SEQUENCE { tbsCertificate, … } and the
   fields wanted sit at fixed places in tbsCertificate: an optional [0] version,
   then serial, signature, issuer, VALIDITY and SUBJECT. Nothing is verified —
   the console's support team enables a chain, not this page. */

/** What the list shows about one certificate. */
export interface CertFacts {
  /** The subject's common name, or its organisation where it has no CN. */
  subject: string
  /** Its notAfter, as an ISO string. */
  notAfter: string
}

interface Der {
  tag: number
  start: number
  end: number
}

function node(b: Uint8Array, at: number, limit: number): Der | null {
  if (at + 2 > limit) return null
  const tag = b[at]
  let len = b[at + 1]
  let start = at + 2
  if (len & 0x80) {
    const n = len & 0x7f
    if (n === 0 || n > 4 || start + n > limit) return null
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i]
    start += n
  }
  const end = start + len
  return end > limit ? null : { tag, start, end }
}

function kids(b: Uint8Array, parent: Der): Der[] | null {
  const out: Der[] = []
  for (let at = parent.start; at < parent.end; ) {
    const c = node(b, at, parent.end)
    if (!c) return null
    out.push(c)
    at = c.end
  }
  return out
}

const ascii = (b: Uint8Array, n: Der) => String.fromCharCode(...b.subarray(n.start, n.end))

function time(b: Uint8Array, n: Der | undefined): string | null {
  if (!n) return null
  const s = ascii(b, n)
  /* UTCTime has a two-digit year (50–99 are 1900s); GeneralizedTime has four. */
  const m =
    n.tag === 0x17
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s)
      : n.tag === 0x18
        ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s)
        : null
  if (!m) return null
  const y = n.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1])
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function text(b: Uint8Array, n: Der): string {
  const bytes = b.subarray(n.start, n.end)
  if (n.tag === 0x1e) {
    /* BMPString: UTF-16, big-endian. */
    let s = ''
    for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
    return s
  }
  return new TextDecoder().decode(bytes)
}

const OID_CN = '55 04 03'
const OID_O = '55 04 0a'
const hex = (b: Uint8Array, n: Der) =>
  Array.from(b.subarray(n.start, n.end), (x) => x.toString(16).padStart(2, '0')).join(' ')

function nameOf(b: Uint8Array, name: Der): string | null {
  const found: Record<string, string> = {}
  for (const rdn of kids(b, name) ?? []) {
    for (const atv of kids(b, rdn) ?? []) {
      const [oid, value] = kids(b, atv) ?? []
      if (oid?.tag !== 0x06 || !value) continue
      const key = hex(b, oid)
      if ((key === OID_CN || key === OID_O) && !(key in found)) found[key] = text(b, value).trim()
    }
  }
  return found[OID_CN] || found[OID_O] || null
}

function readDer(b: Uint8Array): CertFacts | null {
  const cert = node(b, 0, b.length)
  if (!cert || cert.tag !== 0x30) return null
  const tbs = kids(b, cert)?.[0]
  if (!tbs || tbs.tag !== 0x30) return null
  let f = kids(b, tbs)
  if (!f) return null
  if (f[0]?.tag === 0xa0) f = f.slice(1)
  const [, , , validity, subject] = f
  if (validity?.tag !== 0x30 || subject?.tag !== 0x30) return null
  const notAfter = time(b, kids(b, validity)?.[1])
  const cn = nameOf(b, subject)
  return notAfter && cn ? { subject: cn, notAfter } : null
}

/** Every certificate in a PEM file, in file order, or null if any of them cannot be read. */
export function readPemChain(pem: string): CertFacts[] | null {
  const out: CertFacts[] = []
  for (const m of pem.matchAll(PEM_BLOCK)) {
    let bytes: Uint8Array
    try {
      bytes = Uint8Array.from(atob(m[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0))
    } catch {
      return null
    }
    const facts = readDer(bytes)
    if (!facts) return null
    out.push(facts)
  }
  return out
}

/** A chain stops working when its first certificate does. */
export const chainValidUntil = (certs: readonly CertFacts[]): string =>
  certs.reduce((min, c) => (c.notAfter < min ? c.notAfter : min), certs[0]?.notAfter ?? '')

/* --- One chosen file -------------------------------------------------------------- */

export interface CaFileRead {
  certs: CertFacts[]
  /** Why the file cannot be uploaded, or null. Said under the file, as it is chosen. */
  issue: string | null
}

/** A chosen file, checked as it is chosen rather than when Upload is pressed. */
export function readCaFile(name: string, text: string, now: Date): CaFileRead {
  if (!isCaFileName(name)) return { certs: [], issue: 'Choose a .pem, .crt or .cer file.' }
  if (pemCertCount(text) === 0) return { certs: [], issue: 'No PEM certificate found in this file.' }
  const certs = readPemChain(text)
  if (!certs || certs.length === 0) return { certs: [], issue: 'A certificate in this file could not be read.' }
  if (new Date(chainValidUntil(certs)).getTime() <= now.getTime()) return { certs, issue: 'A certificate in this chain has expired.' }
  return { certs, issue: null }
}

/** Why a chosen file cannot be used, or null. */
export const caFileIssue = (name: string, text: string, now: Date = new Date()): string | null =>
  readCaFile(name, text, now).issue

/* --- Aliases --------------------------------------------------------------------- */

export const ALIAS_MAX = 64

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** `base`, or `base 2`, `base 3` … — whichever nothing in `taken` already uses. */
export function uniqueAlias(base: string, taken: readonly string[]): string {
  if (!taken.some((t) => same(t, base))) return base
  for (let n = 2; ; n++) {
    const next = `${base} ${n}`
    if (!taken.some((t) => same(t, next))) return next
  }
}

/** The alias a file is offered: its name without the extension, separators as
    spaces, its first letter raised for sentence case and the rest left as the
    file has it. */
export function aliasFromName(fileName: string, taken: readonly string[] = []): string {
  const stem = fileName
    .trim()
    .replace(/\.(pem|crt|cer)$/i, '')
    .replace(/[\s._-]+/g, ' ')
    .trim()
    .slice(0, ALIAS_MAX)
    .trim()
  const said = stem.charAt(0).toUpperCase() + stem.slice(1)
  return uniqueAlias(said || 'CA chain', taken)
}

/** Why an alias cannot be used, or null. `others` is every alias already taken. */
export function aliasIssue(alias: string, others: readonly string[]): string | null {
  if (alias.trim() === '') return 'Enter an alias.'
  if (alias.trim().length > ALIAS_MAX) return `Use ${ALIAS_MAX} characters or fewer.`
  if (others.some((o) => same(o, alias))) return 'This alias is already in use.'
  return null
}

/* --- The list --------------------------------------------------------------------- */

export interface CaChain {
  id: string
  alias: string
  fileName: string
  certCount: number
  /** The first certificate's subject CN. */
  subject: string
  /** When the chain stops being valid: its earliest notAfter, ISO. */
  validUntil: string
  uploadedBy: string
  /** ISO. */
  uploadedAt: string
  /** miniOrange support has enabled it. A new or replaced file has not been. */
  enabled: boolean
  /** The file's text, kept in the browser so Download gives it back. */
  pem: string
}

export type CaChainStatus = 'enabled' | 'waiting' | 'expired'

export const CA_STATUS_LABEL: Record<CaChainStatus, string> = {
  enabled: 'Enabled by support',
  waiting: 'Waiting for support',
  expired: 'Expired',
}

/** Expired outranks everything: an enabled chain past its date checks nothing. */
export const chainStatus = (c: Pick<CaChain, 'validUntil' | 'enabled'>, now: Date): CaChainStatus =>
  new Date(c.validUntil).getTime() <= now.getTime() ? 'expired' : c.enabled ? 'enabled' : 'waiting'

const DAY = 86_400_000

/** Whole days left, rounded up; zero or less once it has expired. */
export const daysLeft = (c: Pick<CaChain, 'validUntil'>, now: Date): number =>
  Math.ceil((new Date(c.validUntil).getTime() - now.getTime()) / DAY)

/** How close to its date a chain is before its row warns. */
export const EXPIRY_WARN_DAYS = 30

export const expiresSoon = (c: Pick<CaChain, 'validUntil'>, now: Date): boolean => {
  const left = daysLeft(c, now)
  return left > 0 && left <= EXPIRY_WARN_DAYS
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Mar 2029". Spelled here rather than by the browser, whose en-GB says "Sept". */
export const caDate = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "today", "yesterday", or the date. */
export function uploadedWhen(iso: string, now: Date): string {
  const days = Math.round((dayOf(now) - dayOf(new Date(iso))) / DAY)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : caDate(iso)
}

export const certsSaid = (n: number): string => `${n} ${n === 1 ? 'certificate' : 'certificates'}`

/** The row's figure on the Authentication methods list. */
export const chainsSaid = (n: number): string => (n === 0 ? 'No CA chains' : `${n} CA ${n === 1 ? 'chain' : 'chains'}`)

/* --- The upload page ------------------------------------------------------------ */

/** A chosen file on the upload page, before Upload. */
export interface PendingCaFile extends CaFileRead {
  key: string
  fileName: string
  text: string
  alias: string
}

/** Chosen files as pending rows. Each good file is offered an alias nothing else holds. */
export function pendingFiles(
  files: readonly { name: string; text: string }[],
  taken: readonly string[],
  now: Date,
  key: () => string,
): PendingCaFile[] {
  const used = [...taken]
  return files.map((f) => {
    const read = readCaFile(f.name, f.text, now)
    const alias = read.issue ? '' : aliasFromName(f.name, used)
    if (alias) used.push(alias)
    return { key: key(), fileName: f.name, text: f.text, alias, ...read }
  })
}

export interface UploadPlan {
  /** The rows Upload adds. */
  ready: PendingCaFile[]
  /** Files that cannot be uploaded and are left out. */
  skipped: number
  /** Alias errors by row key. Any one stops the upload, so it can be fixed. */
  aliasErrors: Record<string, string>
  /** Why nothing can be uploaded, said under the drop zone; or null. */
  blocker: string | null
}

/** What Upload does with the page as it stands. It only goes ahead when `blocker` is null and no alias has an error. */
export function planUpload(pending: readonly PendingCaFile[], existing: readonly string[]): UploadPlan {
  const good = pending.filter((p) => !p.issue)
  const aliasErrors: Record<string, string> = {}
  good.forEach((p, i) => {
    const issue = aliasIssue(p.alias, [...existing, ...good.slice(0, i).map((q) => q.alias)])
    if (issue) aliasErrors[p.key] = issue
  })
  const blocker =
    pending.length === 0
      ? 'Choose at least one certificate file.'
      : good.length === 0
        ? 'None of these files can be uploaded.'
        : null
  return { ready: good, skipped: pending.length - good.length, aliasErrors, blocker }
}

export const canUpload = (plan: UploadPlan): boolean => plan.blocker === null && Object.keys(plan.aliasErrors).length === 0

/** The toast after Upload. */
export function uploadedSaid(n: number, skipped: number): string {
  const head = n === 1 ? 'CA chain uploaded' : `${n} CA chains uploaded`
  return skipped === 0 ? head : `${head}, ${skipped} ${skipped === 1 ? 'file' : 'files'} skipped`
}

/** A pending row as a chain on the list: new, so support has not enabled it yet. */
export function chainFrom(p: PendingCaFile, by: string, now: Date, id: string): CaChain {
  return {
    id,
    alias: p.alias.trim(),
    fileName: p.fileName,
    certCount: p.certs.length,
    subject: p.certs[0]?.subject ?? '',
    validUntil: chainValidUntil(p.certs),
    uploadedBy: by,
    uploadedAt: now.toISOString(),
    enabled: false,
    pem: p.text,
  }
}

/** Replace file on a row: the new file's facts, uploaded again, waiting for support again. */
export function replaceChainFile(
  c: CaChain,
  file: { name: string; text: string },
  by: string,
  now: Date,
): { chain: CaChain; issue: null } | { chain: null; issue: string } {
  const read = readCaFile(file.name, file.text, now)
  if (read.issue) return { chain: null, issue: read.issue }
  return {
    chain: {
      ...c,
      fileName: file.name,
      certCount: read.certs.length,
      subject: read.certs[0]?.subject ?? '',
      validUntil: chainValidUntil(read.certs),
      uploadedBy: by,
      uploadedAt: now.toISOString(),
      enabled: false,
      pem: file.text,
    },
    issue: null,
  }
}
