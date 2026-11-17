/* -----------------------------------------------------------------------------
   What the device profile wizard shows in this version (owner, 10 Nov 2026: "hide the Signals step as of now";
   "hide Agent-based as well"). Finished work, kept behind flags, not deleted.
   · AGENT_REACH: the Agent-based restriction type, and with it the roster registration method.
   · SIGNALS_STEP: the Signals step of a device profile. Off, a new profile starts with every first-phase signal its
     restriction type offers, and the stepper is Profile, Devices, Review.
   ----------------------------------------------------------------------------- */
export const AGENT_REACH = false
export const SIGNALS_STEP = false
/* ENROL_OPTIONS: "Enable mobile device restriction" and "Enable device auto-registration", on the Devices step. */
export const ENROL_OPTIONS = false
