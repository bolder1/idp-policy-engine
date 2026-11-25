/* -----------------------------------------------------------------------------
   What the device profile wizard shows in this version. Finished work, kept behind flags, not deleted.
   10 Nov 2026 the owner hid the Signals step and Agent-based; 18 Nov 2026 he brought them back ("we have four
   steps, agent-based, agentless, and based on that we check all the inner part").
   · AGENT_REACH: the Agent-based restriction type, and with it the roster registration method.
   · SIGNALS_STEP: the Signals step of a device profile. Off, a new profile starts with every first-phase signal its
     restriction type offers, and the stepper is Profile, Devices, Review. On: Profile, Devices, Signals, Review.
   ----------------------------------------------------------------------------- */
import { shows } from '../rollout'

export const AGENT_REACH = true
export const SIGNALS_STEP = true
/* ENROL_OPTIONS: "Enable mobile device restriction" and "Enable device auto-registration", on the Devices step. */
export const ENROL_OPTIONS = true
/* REGISTRATION_MFA: a trusted device's "Registration MFA method", above those two (owner, 23 Nov 2026; the dev's
   `registration_mfa_method`). By line: rollout.ts `registrationMfa`. */
export const REGISTRATION_MFA: boolean = shows('registrationMfa')
/* LOCKED_SIGNALS: an always-on signal can't be unticked, so its priority can't be changed either, and Review leaves it
   out (owner, 23 Nov 2026). By line: rollout.ts `lockedSignals`. */
export const LOCKED_SIGNALS: boolean = shows('lockedSignals')
/* REVIEW_ALWAYS_ON: the wizard's Review step lists the always-on signals too, with the rest; only that step, never the
   live preview beside the others (owner, 25 Nov 2026). By line: rollout.ts `reviewAlwaysOn`. */
export const REVIEW_ALWAYS_ON: boolean = shows('reviewAlwaysOn')
