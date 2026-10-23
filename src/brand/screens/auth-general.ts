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
