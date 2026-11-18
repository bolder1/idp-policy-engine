/* -----------------------------------------------------------------------------
   What the device profile wizard shows in this version. Finished work, kept behind flags, not deleted.
   10 Nov 2026 the owner hid the Signals step and Agent-based; 18 Nov 2026 he brought them back ("we have four
   steps, agent-based, agentless, and based on that we check all the inner part").
   · AGENT_REACH: the Agent-based restriction type, and with it the roster registration method.
   · SIGNALS_STEP: the Signals step of a device profile. Off, a new profile starts with every first-phase signal its
     restriction type offers, and the stepper is Profile, Devices, Review. On: Profile, Devices, Signals, Review.
   ----------------------------------------------------------------------------- */
export const AGENT_REACH = true
export const SIGNALS_STEP = true
/* ENROL_OPTIONS: "Enable mobile device restriction" and "Enable device auto-registration", on the Devices step. */
export const ENROL_OPTIONS = true
