import { COPILOT_NAME } from './copilot-name'

/* -----------------------------------------------------------------------------
   The porthole's words (owner, 4 Oct 2026: a line about THIS run): the name
   of the press, then a request in the admin's own words about the run on
   the canvas — the Notion / Dropbox Dash pattern, a suggested ask worded as
   the user's request. Plain admin English, few words.
   -------------------------------------------------------------------------- */

export type EntryOutcome = 'allow' | 'deny' | 'conflict'

/** The run on the canvas: whose sign-in, and how it ended. */
export interface EntryAbout {
  person: string
  outcome: EntryOutcome
}

/** The press's name: what a reader hears, and the reveal's first line. */
export const entryName = (on: boolean): string => (on ? `Leave ${COPILOT_NAME}` : `Ask ${COPILOT_NAME}`)

/** The reveal's second line: about this run, a generic one without it, none inside Aruna. */
export function entryLine(on: boolean, about: EntryAbout | null | undefined, ran: boolean): string | null {
  if (on) return null
  if (!ran) return `Check access with ${COPILOT_NAME}`
  if (!about) return 'Walk through this check'
  const who = about.person.split(' ')[0] || about.person
  if (about.outcome === 'deny') return `Walk me through why ${who} is blocked`
  if (about.outcome === 'conflict') return `Walk me through why ${who}’s access is unclear`
  return `Walk me through why ${who} gets in`
}
