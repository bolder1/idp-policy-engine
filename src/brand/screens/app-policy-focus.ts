import { createContext } from 'react'

/** Tests only: draws the Policies tab in one layout whatever `APP_POLICY_FOCUS` says (true: the policy alone, false: at a glance). */
export const AppPolicyFocusOverride = createContext<boolean | null>(null)
