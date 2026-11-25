import { shows } from '../rollout'

/* The tenant's general rules for two-step verification (owner, 21 Oct 2026): who must use it, and the rules around it. */
export interface AuthGeneral {
  /** Two-step verification is required of: this admin, every user, the other admins. */
  forMe: boolean
  forUsers: boolean
  forAdmins: boolean
  /** How long a device that passed two-step verification is trusted: days; 0 is never. */
  rememberDays: string
  /** Days a person may sign in before they must set a method up; 0 is none. */
  graceDays: string
  /** People pick which of the methods on offer they use. */
  choose: boolean
  /** Ask again before a sensitive change (a method, a password, a recovery option). */
  reauth: boolean
  /** Tell the person when a method is added or removed. */
  notify: boolean
  /** Failed attempts in a row before the person is locked out for a while. */
  lockAfter: string
  /** The name authenticator apps show above the code. */
  mobileIssuer: string
  /** Days a registered device profile stays trusted before the device must be verified again; 0 is never. */
  deviceExpiryDays: string
}

export const AUTH_GENERAL_SEED: AuthGeneral = {
  forMe: true,
  forUsers: true,
  forAdmins: true,
  rememberDays: '30',
  graceDays: '7',
  choose: true,
  reauth: true,
  notify: true,
  lockAfter: '5',
  mobileIssuer: 'miniOrange',
  deviceExpiryDays: '90',
}

/* Device profile expiry, after Mobile issuer name (owner, 20 Nov 2026: "under authentication method, add a new option
   for device profile expiry"). The rollout table's `deviceProfileExpiry` entry; other lines have no such row. */
export const DEVICE_PROFILE_EXPIRY: boolean = shows('deviceProfileExpiry')

/* The Users row of "Two-step verification is required for" goes, and Mobile issuer name comes in after Additional
   admins (owner, 19 Nov 2026: "Hide this and add mobile issuer name"). Both follow the rollout table's `mobileIssuer`
   entry; a line without it keeps the Users row and has no issuer field. Kept, not deleted. */
export const MOBILE_ISSUER: boolean = shows('mobileIssuer')
export const USERS_2FA_ROW: boolean = !MOBILE_ISSUER

/* The two typed values, Mobile issuer name and Device profile expiry, wait for Save in a footer with Cancel beside it
   (owner, 25 Nov 2026: "to store this two value we need a footer with save and cancel button"). The rollout table's
   `generalSave` entry; a line without it saves them as they are typed, as before. */
export const GENERAL_SAVE: boolean = shows('generalSave')

/** The fields that wait for Save. Everything else on the tab is picked, and a pick saves as it is made. */
export const TYPED_GENERAL = ['mobileIssuer', 'deviceExpiryDays'] as const
export type TypedGeneral = Pick<AuthGeneral, (typeof TYPED_GENERAL)[number]>

export const typedGeneral = (g: AuthGeneral): TypedGeneral => ({ mobileIssuer: g.mobileIssuer, deviceExpiryDays: g.deviceExpiryDays })

/** Device profile expiry's bounds, the number field's own min and max. */
export const EXPIRY_DAYS = { min: 1, max: 3650 } as const

/** What is wrong with each typed value, said under its question; nothing for a value that can be saved. */
export function typedIssues(t: TypedGeneral): Partial<Record<keyof TypedGeneral, string>> {
  const out: Partial<Record<keyof TypedGeneral, string>> = {}
  if (!t.mobileIssuer.trim()) out.mobileIssuer = 'Enter a mobile issuer name'
  const days = Number(t.deviceExpiryDays)
  if (t.deviceExpiryDays === '' || !Number.isInteger(days) || days < EXPIRY_DAYS.min || days > EXPIRY_DAYS.max) {
    out.deviceExpiryDays = `Enter a number of days from ${EXPIRY_DAYS.min} to ${EXPIRY_DAYS.max}`
  }
  return out
}

/* The Verification rules slide-over: the button beside the page's heading and the panel it opens
   (auth-general-settings.tsx). Off (owner, 21 Oct 2026: "hide this for now"). The same rows are on the page's own
   General settings tab, which is the other half of the comparison he asked for — "add a general settings tab side by
   side to compare our choices" — so this one flag is the whole difference between the two: on, the button and the
   slide-over are back beside the tab; off, the tab is the only way in. Nothing it gates is removed. */
export const VERIFICATION_RULES_DRAWER: boolean = false

/* The rest of the General settings: the Sign-in section (Remember this device, Grace period, Let people choose their
   method, Lock after failed attempts), the Changes to methods section (Ask again before a sensitive change, Tell the
   person), and the Me row inside who must verify. Off (owner, 22 Oct 2026, selecting them on the page: "Hide this two",
   then "hide this as well … The me"). What is left is the two switches that say who two-step verification is required
   of: Users and Additional admins.

   ONE flag for the three of them, so bringing them back is one decision rather than three. It gates them inside
   `GeneralSettings`, so the slide-over loses them too and his two containers stay the same settings in two shapes.
   Every row, every word and every option is kept. */
export const MORE_GENERAL_SETTINGS: boolean = false
