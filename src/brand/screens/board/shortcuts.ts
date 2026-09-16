/* -----------------------------------------------------------------------------
   The board's keyboard sheet, as data.

   Written beside nothing but itself so it can be tested: the sheet has to list
   the bindings the handler in BoardBuilder actually has, in the edition that is
   running, in the key names of the platform it is running on. A sheet that
   shows ⌘ on Windows, or a palette that Lite does not have, is a sheet that
   lies.
   -------------------------------------------------------------------------- */

export type Modifier = 'mod' | 'alt' | 'shift'

/** True on macOS and iOS, where the primary modifier is Command. */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent || '')
}

const MAC_GLYPH: Record<Modifier, string> = { shift: '⇧', alt: '⌥', mod: '⌘' }
const PC_NAME: Record<Modifier, string> = { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }
/* The order each platform prints modifiers in: ⇧⌘Z on a Mac, Ctrl+Shift+Z elsewhere. */
const MAC_ORDER: Modifier[] = ['alt', 'shift', 'mod']
const PC_ORDER: Modifier[] = ['mod', 'alt', 'shift']

/** One key combination, spelt the way the platform spells it. */
export function chord(mods: Modifier[], key: string, mac: boolean): string {
  if (mac) {
    const k = key === 'Enter' ? '↵' : key
    return MAC_ORDER.filter((m) => mods.includes(m)).map((m) => MAC_GLYPH[m]).join('') + k
  }
  return [...PC_ORDER.filter((m) => mods.includes(m)).map((m) => PC_NAME[m]), key].join('+')
}

export interface ShortcutOptions {
  mac: boolean
  /** The command palette exists (Full edition). */
  commands: boolean
  /** Rehearsals can be run, so Escape has one to clear. */
  gauntlet: boolean
  /** There is a publish step; Lite reviews and saves. */
  publish: boolean
}

/** Each entry is the keys, space-separated for one <kbd> each, and what they do. */
export function boardShortcuts(o: ShortcutOptions): [string, string][] {
  const c = (mods: Modifier[], key: string) => chord(mods, key, o.mac)
  return [
    ['↑ ↓', 'Select the previous or next rule'],
    [`${c(['alt'], '↑')} ${c(['alt'], '↓')}`, 'Move the selected rule up or down'],
    ['[ ]', 'Previous or next section'],
    [c(['mod'], 'D'), 'Duplicate the selected rule'],
    ['Del', 'Delete the selected rule'],
    ['E', 'Switch the selected rule on or off'],
    ...(o.commands ? ([[c(['mod'], 'K'), 'Command palette']] as [string, string][]) : []),
    [c(['mod'], 'Enter'), o.publish ? 'Review and publish' : 'Review and save'],
    [c(['mod'], '\\'), 'Show or hide the panel'],
    [`${c(['mod'], 'Z')} ${c(['mod', 'shift'], 'Z')}`, 'Undo, redo'],
    ['Esc', o.gauntlet ? 'Clear the rehearsal, then the selection' : 'Clear the selection'],
    ['?', 'Keyboard shortcuts'],
  ]
}
