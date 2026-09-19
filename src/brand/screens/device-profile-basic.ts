import { MODE_META, asksReach, type FingerprintProfile } from '../fingerprint'

/* -----------------------------------------------------------------------------
   Device profiles · Basic details: the tests the tab and the save footer run.

   Basic details is the live form on its tab (16 Sep 2026). What is here is the
   bookkeeping around it that is worth a unit test, kept out of the screen
   because a `.tsx` that exports anything but components loses fast refresh.
   -------------------------------------------------------------------------- */

/* Whether this profile's basic details have been answered.

   `restrictionSet`, and nothing derived from the values. Every field it guards
   has a working default, so a profile nobody has answered is indistinguishable
   by value from one somebody deliberately set to exactly those defaults (see
   the field's comment in `fingerprint.ts`).

   It is false on a Version 2 profile straight out of the name dialog
   (`blankProfile`), and on a stored profile nobody has answered (`fp-unmanaged`
   is seeded that way on purpose). The create wizard's Devices step sets it,
   because that step asked. On the page, any answer on the Basic details tab
   sets it on the draft (`changeBasic`) — including a press on the reach already
   shown, which confirms the defaults. Read off the draft, not the stored
   profile, for that reason. */
export const basicDetailsSet = (p: Pick<FingerprintProfile, 'restrictionSet'>): boolean => p.restrictionSet

/* Why a NEW profile can't be created yet for want of basic details, or null.

   Creating a trusted device nobody set up used to be allowed and silent, and
   the stored profile then ran on answers nobody gave. That is a
   saved-but-unfinished profile, which the console does not have (unfinished
   means draft). So Create profile waits for an answer on the Basic details
   tab, and says so in the footer, on the button, in Review changes and in the
   leave dialog (review, 15 Sep 2026).

   Still creatable on every default: a press on the reach already shown sets
   the flag, which keeps the earlier owner decision that a trusted device is
   valid on them. Only a new profile — a stored one nobody set up
   (`fp-unmanaged`) is already in use, and refusing to save a weight on it
   until somebody answers a different question would hold the weight hostage.
   Only a type that asks: a health profile has no basic details to set up. */
export const basicSetupIssue = (p: Pick<FingerprintProfile, 'mode' | 'restrictionSet'>, isNew: boolean): string | null =>
  isNew && asksReach(p.mode) && !basicDetailsSet(p) ? 'Set up basic details.' : null

/* What the type is, and that nothing can change it — the tip on the page
   heading's type pill. Exported so the sentence has one home. */
export const modeFixedTip = (p: Pick<FingerprintProfile, 'mode'>): string =>
  `${MODE_META[p.mode].blurb} The type is fixed when the profile is created. To use the other type, create a new profile.`

/* `unsetAsideLines` stood here — the Basic details panel's copy, with the
   reach and the device cap written into its last line. The panel is
   `DEVICES_NOTE` (profile-notes.ts) now, and says the same whether the details
   are set or not (owner, 18 Sep 2026). */
