/* -----------------------------------------------------------------------------
   Which "Create new profile" the Device profiles list opens.

   Four versions of one flow, side by side on one page so they can be tried
   against each other (owner, 15-16 Sep 2026):

     current Current    the slide-over the console had before the other three
     full    Version 1  a page of steps, each check's value on its own line
     name    Version 2  a name and a type, then the profile's own page
     values  Version 3  a page of steps, choosing and setting values apart

   `current` is first and is the fallback, because it is the shape the product
   actually shipped — the other three are the proposals being weighed against
   it, and a comparison whose baseline is missing is three options and no
   control. It was dropped when they landed (owner asked for it back, 16 Sep).

   Not gated on the edition's design switcher. The store opens on Lite, where
   that flag is off, and a comparison the owner has to find a setting for is
   one that does not get made.

   Remembered per viewer in localStorage, the way the brand switch is, so a
   reload keeps the version being tried. Storage that throws — tests, a private
   window, a policy — falls back to Current and the switch still works for
   the session.
   -------------------------------------------------------------------------- */

export type CreateVersion = 'current' | 'full' | 'name' | 'values'

export interface CreateVersionOption {
  id: CreateVersion
  label: string
  /** The version's short name, dropped from the switch where the header is narrow. */
  name: string
  /** What pressing Create does in this version, for the switch's tooltip. */
  tip: string
}

export const CREATE_VERSIONS: CreateVersionOption[] = [
  {
    id: 'current',
    label: 'Current',
    name: 'Slide-over',
    tip: 'The slide-over the console shipped: the same steps, over the list instead of replacing it.',
  },
  {
    id: 'full',
    label: 'Version 1',
    name: 'Full page',
    tip: 'A page of steps. Each check is ticked and set on one line, then reviewed.',
  },
  {
    id: 'name',
    label: 'Version 2',
    name: 'Name first',
    tip: 'Name and type in a dialog, then set everything on the profile’s own page.',
  },
  {
    id: 'values',
    label: 'Version 3',
    name: 'Values step',
    tip: 'A page of steps. Checks are chosen on one step and set on the next, then reviewed.',
  },
]

export const CREATE_VERSION_KEY = 'idp.deviceProfileCreate'

/** Only a stored version id counts; anything else is Current. */
export function parseCreateVersion(value: unknown): CreateVersion {
  return CREATE_VERSIONS.some((v) => v.id === value) ? (value as CreateVersion) : 'current'
}

export function readCreateVersion(): CreateVersion {
  try {
    return parseCreateVersion(window.localStorage.getItem(CREATE_VERSION_KEY))
  } catch {
    return 'current'
  }
}

export function writeCreateVersion(version: CreateVersion): void {
  try {
    window.localStorage.setItem(CREATE_VERSION_KEY, version)
  } catch {
    /* Kept for this session only. */
  }
}
