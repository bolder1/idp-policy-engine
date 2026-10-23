/* -----------------------------------------------------------------------------
   The board's keyboard sheet, as data.

   Written beside nothing but itself so it can be tested: the sheet has to list
   the bindings the handler in BoardBuilder actually has, in the edition that is
   running, in the key names of the platform it is running on. A sheet that
   shows ⌘ on Windows, or a palette that Lite does not have, is a sheet that
   lies.
   -------------------------------------------------------------------------- */

import { ACCESS_CHECK } from '../sign-in-tests/names'

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
  /** Check access is on the board (every edition that has it, from builder V3): T opens it, and Escape closes it first. */
  testing: boolean
  /** There is a publish step; Lite saves. */
  publish: boolean
  /* The builder's version and flags hide pieces at their doors (builder-version.ts, bar-tools.ts), and the keys are
     doors too, so the sheet lists a key only where it does something: ⌥↑ / ⌥↓ from V1 (`arrange`), undo and redo
     from V1 (`history`), and E only while the rule on/off switch is shown (`RULE_ON_OFF`, hidden 23 Oct 2026). */
  /** Rules can be reordered: ⌥↑ / ⌥↓ move the selected one. */
  arrange: boolean
  /** The dock has Undo and Redo. */
  history: boolean
  /** The rule on/off switch is shown: E flips the selected rule. */
  onOff: boolean
}

/** Each entry is the keys, space-separated for one <kbd> each, and what they do. */
export function boardShortcuts(o: ShortcutOptions): [string, string][] {
  const c = (mods: Modifier[], key: string) => chord(mods, key, o.mac)
  const when = (on: boolean, row: [string, string]): [string, string][] => (on ? [row] : [])
  return [
    ['↑ ↓', 'Select the previous or next rule'],
    ...when(o.arrange, [`${c(['alt'], '↑')} ${c(['alt'], '↓')}`, 'Move the selected rule up or down']),
    ['[ ]', 'Previous or next section'],
    [c(['mod'], 'D'), 'Duplicate the selected rule'],
    ['Del', 'Delete the selected rule'],
    ...when(o.onOff, ['E', 'Switch the selected rule on or off']),
    ...when(o.testing, ['T', ACCESS_CHECK]),
    ...when(o.commands, [c(['mod'], 'K'), 'Command palette']),
    /* In the bar's words: ⌘↵ saves at once, as the bar's button does. */
    [c(['mod'], 'Enter'), o.publish ? 'Publish policy' : 'Save policy'],
    [c(['mod'], '\\'), 'Show or hide the panel'],
    ...when(o.history, [`${c(['mod'], 'Z')} ${c(['mod', 'shift'], 'Z')}`, 'Undo, redo']),
    ['Esc', o.testing ? `Close ${ACCESS_CHECK}, then clear the selection` : 'Clear the selection'],
    ['?', 'Keyboard shortcuts'],
  ]
}
