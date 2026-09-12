import type { AuthMethod } from '../methods'
import { familySettingsFor, methodSettingsFor } from '../mfa-join'

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

   Display Token is the other method that ships unconfigured and gets a Set up
   button; if it should gain Edit too, this is the line to widen. */
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

export const pageKey = (p: PanelPage): string =>
  p.kind === 'setup' ? `setup:${p.methodId}` : `${p.kind}:${p.channel}`
