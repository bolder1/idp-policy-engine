import type { ProfileMode } from '../fingerprint'

/* -----------------------------------------------------------------------------
   What the side column of a device profile says — as fixed copy.

   Owner, 18 Sep 2026: "make sure all of this is static, there's no need to add
   dynamic values here… just basic text based on steps or based on situations",
   pointing at the zone page's "What you can add" panel as the experience to
   match. So a panel explains the STEP the way a form's help does, and never
   mirrors the answers beside it.

   What it replaces: the panel read every check off the draft ("Laptops only.",
   "Windows 10 or later.", "Chrome 120 or later.", …). On a full health profile
   that was fifteen lines restating the list it sat next to, and it moved under
   the reader on every edit. The enrolment panel did the same with the answers
   and the device cap.

   Two shapes, both the zone panel's: short paragraphs, and — where the reader
   is choosing between named options — the option and one line on what it
   means, with a closing note under a rule.
   -------------------------------------------------------------------------- */

export interface ProfileNote {
  title: string
  /** One short paragraph each. */
  lines?: string[]
  /** A named option, and what choosing it means. */
  terms?: { term: string; note: string }[]
  /** One closing line, under a rule. */
  foot?: string
}

/* The Profile step and the type tiles: both types, so the panel reads the same
   before and after a choice is made. */
export const TYPE_NOTE: ProfileNote = {
  title: 'The two profile types',
  terms: [
    { term: 'Device health', note: 'Checks the OS, browser, integrity and app versions at every sign-in.' },
    { term: 'Trusted device', note: 'Recognises a machine it has seen before, by weighted signals.' },
  ],
  foot: 'The type can’t be changed once the profile is created.',
}

/* The Devices step, and the Basic details tab it becomes. */
export const DEVICES_NOTE: ProfileNote = {
  title: 'How devices enrol',
  terms: [
    { term: 'Agentless', note: 'Reads the browser, network and location of each sign-in. Nothing to install.' },
    { term: 'Agent-based', note: 'Adds hardware identifiers, and needs the miniOrange Device Agent on each device.' },
    { term: 'Self registration', note: 'Each user registers their own devices, up to the limit you set.' },
    { term: 'Pre-approved only', note: 'Only devices on the roster you upload can sign in, matched on MAC address.' },
  ],
  foot: 'A new device is challenged on its first sign-in before it is registered.',
}

export const CHECKS_NOTE: ProfileNote = {
  title: 'How checks work',
  lines: [
    'A device must pass every check you tick before it can sign in.',
    'A check’s value unlocks when you tick it.',
    'Integrity and screen lock are reported by the miniOrange app. A device without it fails those checks.',
  ],
}

export const SIGNALS_NOTE: ProfileNote = {
  title: 'How signals work',
  lines: ['What changed since the last sign-in adds up to a score, and the score picks the outcome.'],
  terms: [
    { term: 'High weight', note: 'Rarely changes, so a change counts for a lot.' },
    { term: 'Medium weight', note: 'Changes now and then.' },
    { term: 'Low weight', note: 'Changes often, so it counts for little.' },
  ],
  foot: 'Always-on signals can’t be removed.',
}

/** The checks step, in the words of the profile's own type. */
export const itemsNote = (mode: ProfileMode): ProfileNote => (mode === 'os' ? CHECKS_NOTE : SIGNALS_NOTE)

/* The risk signal profile page's panel, in the list shape. */
/* Not SIGNALS_NOTE's words. That panel explains a TRUSTED DEVICE profile, where
   a weight says how often an attribute changes and a change is the evidence.
   A risk signal does not change — it fires or it does not ("Emulator", "Rooted
   device", "Tor exit node"), and its weight says how much that firing proves. */
export const RISK_SIGNALS_NOTE: ProfileNote = {
  title: 'How the score is made',
  lines: [
    'Every signal that fires on a sign-in adds its weight to the score, and the score decides which band the sign-in lands in.',
  ],
  terms: [
    { term: 'High weight', note: 'Decisive on its own — the device or its runtime is not trustworthy.' },
    { term: 'Medium weight', note: 'Strong evidence, but not conclusive by itself.' },
    { term: 'Low weight', note: 'Counts for a little; it takes several to move the score.' },
  ],
  foot: 'A signal switched off is not collected at all. Only the mobile SDKs report these.',
}
