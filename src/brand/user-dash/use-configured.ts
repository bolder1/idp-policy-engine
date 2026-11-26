import { useMemo } from 'react'

import { DISPLAY_TOKEN_METHOD_ID, tokensOf } from '../hardware-tokens'
import { methodBlocker } from '../methods'
import { useBrand } from '../store'
import { configuredMethodIds } from '../user-methods'
import { checkup } from './checkup'

/** The person's set-up methods, read exactly as Setup 2FA reads them (AuthMethods.tsx), and the checkup they give. */
export function useCheckup() {
  const store = useBrand()
  return useMemo(() => {
    const reachable = store.methods.filter((m) => m.use !== 'primary' && !methodBlocker(m))
    const held = tokensOf(store.hardwareTokens, store.viewerId).length
    const ids = configuredMethodIds(reachable, store.enrolment, (id) => (id === DISPLAY_TOKEN_METHOD_ID ? held : 0))
    return checkup(ids, store.userDash.passwordAgeDays)
  }, [store.methods, store.hardwareTokens, store.viewerId, store.enrolment, store.userDash.passwordAgeDays])
}
