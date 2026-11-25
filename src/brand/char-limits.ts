import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   Character limits, said on screen (owner, 25 Nov 2026, on the New zone name: "Add character limit to all of the
   needed places").

   Every field an admin types free text into (a name, a description, a message, a reason) has a limit, and with
   CHAR_COUNTS the count under it says how much of it is used: "12/50", the kit NameField's own count, in the same
   quiet type. Codes (a six-digit one-time code, a token's digits) and search boxes have no count: their length is
   not the admin's to manage.

   The rollout table's `charCounts`; a line without it draws no count, and the limits stay as they were.
   -------------------------------------------------------------------------- */
export const CHAR_COUNTS: boolean = shows('charCounts')

/** The limits a field with none of its own takes, by what it holds. A field that already has a limit keeps it. */
export const TEXT_MAX = {
  /** A name: of a zone, a profile, a policy, an application, a template. */
  name: 50,
  /** A short label or a value typed into a setting (an issuer name, an alias). */
  label: 50,
  /** A description or a note. */
  description: 250,
  /** A message shown to a person, or a reason given. */
  message: 300,
} as const
