import type { Policy } from '../data'
import { DISPLAY_TOKEN_METHOD_ID } from '../hardware-tokens'
import { methodBlocker, type AuthMethod } from '../methods'
import { familySettingsFor, methodSettingsFor, mfaMethodFor } from '../mfa-join'
import type { BrandScreen } from '../store'

/* -----------------------------------------------------------------------------
   The Authentication methods slider, and which rows open it.

   Every family row used to open the slider, whatever it held — so six of the
   eleven opened onto a single method. A chevron promises a choice, and those six
   delivered a panel with nothing in it to choose between, one click away from a
   switch that could have been on the row.

   The row now goes somewhere only when there is somewhere to go. A family with
   variants opens onto them. A family of one IS its method: the row is named for
   the method, carries its switch, and opens only when there is a page behind it
   — the family's settings, or a configuration worth coming back to.
   -------------------------------------------------------------------------- */

export type FamilyRow =
  /* More than one method: the row opens the family. */
  | { opens: true }
  /* One method: its controls sit on the row. `settings` says whether the
     family has a settings page for the row to open. */
  | { opens: false; method: AuthMethod; settings: boolean }

/** `inside` is the family's methods under the current filter — the same list
    the slider would show, so a row never claims more or less than opening it
    would reveal. */
export function familyRow(channel: string, inside: AuthMethod[]): FamilyRow {
  if (inside.length !== 1) return { opens: true }
  const [method] = inside
  return {
    opens: false,
    method,
    settings: familySettingsFor(channel).length + methodSettingsFor(method.id).length > 0,
  }
}

/* Whether a method has a configuration worth returning to once it is set up.

   RSA only. Nearly every method in the catalogue has a config schema, so keying
   this on "has a form" put an Edit button on twenty-one rows — and for most of
   them the form is four fields nobody revisits. RSA is the one integration whose
   configuration is genuinely worth returning to: twenty-six fields, half of them
   values you have to read off the RSA Security Console.

   Display Token is the other method that ships unconfigured, and it is not a
   form: its Set up button, and Manage tokens afterwards, open the Display tokens
   page (see `setupTargetFor`), so it needs no Edit here. */
export const hasConfigPage = (m: Pick<AuthMethod, 'id'>): boolean => m.id === 'rsa'

export type RowTarget =
  | { kind: 'family' }
  | { kind: 'settings' }
  | { kind: 'setup'; method: AuthMethod }

/** Where a family row goes when it is clicked, or null when it goes nowhere.
    A row with a target is clickable end to end and ends in a chevron; a row
    without one ends in its switch. There is no separate Settings button: a
    row that has a page behind it IS the way to that page. */
export function rowTarget(row: FamilyRow): RowTarget | null {
  if (row.opens) return { kind: 'family' }
  if (row.settings) return { kind: 'settings' }
  /* Not before setup: an unconfigured method's row carries a Set up button,
     and a row that also opened the same form would be two ways to one place. */
  if (row.method.configured && hasConfigPage(row.method)) return { kind: 'setup', method: row.method }
  return null
}

/* The slider's pages, deepest last.

   One panel that pushes and pops, instead of one that closes so a modal can
   open. Setup used to shut the slider and centre a dialog over the list: the
   family you had been looking at was gone by the time you pressed Save, and
   Cancel dropped you on the list, a click further from where you started. Now
   setup is a page in the same panel, and Back returns to the one under it. */
export type PanelPage =
  | { kind: 'family'; channel: string }
  /* A family's settings on their own — for a family of one, whose row opens
     straight onto them rather than onto a panel with a one-row Methods tab. */
  | { kind: 'settings'; channel: string }
  | { kind: 'setup'; methodId: string }
  /* `tokens` stood here: Display Token's inventory as a list page inside this
     slider, with Add, Assign, Upload and Sync pushed over it. The owner asked
     for it on a page of its own (15 Sep 2026) — the live console's "Assign
     Hardware Token To Users" is one, with two tabs — so it is the
     `display-tokens` screen now, and the slider only leads to it. */

export const pageKey = (p: PanelPage): string => (p.kind === 'setup' ? `setup:${p.methodId}` : `${p.kind}:${p.channel}`)

/* Where a method's Set up button goes: a page in this slider, or another
   screen. Every method opens its setup form or card in the slider, except
   Display Token, whose setup is adding tokens and assigning them — so its
   button leaves for the Display tokens page instead. */
export type SetupTarget = { kind: 'panel'; page: PanelPage } | { kind: 'screen'; screen: BrandScreen }

export const setupTargetFor = (m: Pick<AuthMethod, 'id'>): SetupTarget =>
  m.id === DISPLAY_TOKEN_METHOD_ID
    ? { kind: 'screen', screen: { name: 'display-tokens' } }
    : { kind: 'panel', page: { kind: 'setup', methodId: m.id } }

/* Settings rows that are a way through to another screen (`field.kind` link),
   by setting id. Assigning hardware tokens lands on the page's Assignments tab,
   the half of it the row is named for. */
export const LINK_SCREENS: Record<string, BrandScreen> = {
  'token-assign': { name: 'display-tokens', tab: 'assignments' },
}

/* Display Token's button, beside its switch once a token is assigned. Before
   that there is no switch (nobody could sign in with it), and the button is
   Set up like every other unconfigured method's. */
export const tokenButtonLabel = (m: Pick<AuthMethod, 'id' | 'configured'>): string | null =>
  m.id !== DISPLAY_TOKEN_METHOD_ID ? null : m.configured ? 'Manage tokens' : 'Set up'

/** The Back on a page, named for the page it returns to — or null where none is shown. */
export function backLabel(under: PanelPage | null): string | null {
  if (!under || under.kind === 'setup') return null
  return under.channel
}

/* --- The tenant default ------------------------------------------------------
   Email first, because every account has a mailbox; the rest in the same order
   of what they assume about the person. */
const DEFAULT_PREFERENCE = ['otp-email', 'email-link', 'otp-sms', 'otp-call']

/** Whether a method can be the tenant default now: the sheet allows it, it is on, and it can still send. */
export function canServeAsDefault(m: AuthMethod): boolean {
  return Boolean(mfaMethodFor(m.id)?.canBeDefault) && !methodBlocker(m) && m.balance?.remaining !== 0
}

/** The first method that can be the default, skipping `exclude` (the one being turned off). */
export function firstDefaultable(all: AuthMethod[], exclude?: string): string | null {
  const ok = (m: AuthMethod) => m.id !== exclude && canServeAsDefault(m)
  for (const id of DEFAULT_PREFERENCE) {
    const hit = all.find((m) => m.id === id && ok(m))
    if (hit) return hit.id
  }
  return all.find(ok)?.id ?? null
}

/** The default on screen. `undefined` means nobody chose one yet; a chosen one that can no longer serve moves on. */
export function resolveDefault(stored: string | null | undefined, all: AuthMethod[]): string | null {
  if (stored === undefined) return firstDefaultable(all)
  if (stored === null) return null
  const m = all.find((x) => x.id === stored)
  return m && canServeAsDefault(m) ? stored : firstDefaultable(all, stored)
}

/** How many live policy rules name a method. Rules name methods by name, in one of four fields. */
export function rulesUsingMethod(name: string, policies: Pick<Policy, 'rules'>[]): number {
  return policies.reduce(
    (n, p) =>
      n +
      p.rules.filter(
        (r) =>
          r.firstFactorMethod === name ||
          r.preferredFallback === name ||
          r.secondFactorMethods?.includes(name) ||
          r.methodChain?.includes(name),
      ).length,
    0,
  )
}

export interface TurnOffPlan {
  rules: number
  wasDefault: boolean
  /** The method that becomes the default, when the one turned off was it. */
  replacement: string | null
  /** Ask first: rules name it, or it is the default and nothing can take over. */
  confirm: boolean
}

/** What turning a method off does to the rules and the default. */
export function turnOffPlan(all: AuthMethod[], id: string, currentDefault: string | null, policies: Pick<Policy, 'rules'>[]): TurnOffPlan {
  const m = all.find((x) => x.id === id)
  const rules = m ? rulesUsingMethod(m.name, policies) : 0
  const wasDefault = currentDefault === id
  const replacement = wasDefault ? firstDefaultable(all, id) : null
  return { rules, wasDefault, replacement, confirm: rules > 0 || (wasDefault && replacement === null) }
}

/** People enrolled in a family: the largest method's figure, never more than the tenant has. One person can enrol in two methods. */
export function familyEnrolled(inside: Pick<AuthMethod, 'enrolled'>[], headcount?: number): number {
  const most = Math.max(0, ...inside.map((m) => m.enrolled ?? 0))
  return headcount !== undefined && headcount > 0 ? Math.min(most, headcount) : most
}

/** "SMS transactions" reads mid-sentence as it is; "Call transactions" becomes "call transactions". */
const midSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label)

/** The warning when a method with nothing left to send is switched on, or null. */
export function noBalanceWarning(m: Pick<AuthMethod, 'balance'>): string | null {
  return m.balance && m.balance.remaining === 0 ? `No ${midSentence(m.balance.label)} left. Codes won't send.` : null
}

/* --- Recovery ------------------------------------------------------------------ */

/** Why a recovery option can't be picked, or null. Each option needs the methods it sends through to be on. */
export function recoveryBlocker(option: string, kbaOn: boolean, altEmailOn: boolean): string | null {
  const needsKba = option === 'kba' || option === 'both'
  const needsEmail = option === 'email' || option === 'both'
  if (needsKba && needsEmail && !kbaOn && !altEmailOn) return 'Needs Security Questions and OTP over Alternate Email, which are off in Methods.'
  if (needsKba && !kbaOn) return 'Needs Security Questions, which is off in Methods.'
  if (needsEmail && !altEmailOn) return 'Needs OTP over Alternate Email, which is off in Methods.'
  return null
}

/* --- Security Questions settings ------------------------------------------------ */

/** "Questions to verify" can't be more than "Questions to configure": the largest option at or below the limit. */
export function clampVerify(verify: number, limit: number, options: number[]): number {
  if (verify <= limit) return verify
  const fit = options.filter((n) => n <= limit)
  return fit.length ? Math.max(...fit) : limit
}
