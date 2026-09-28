import { useMemo, useReducer, useState, type ReactNode } from 'react'

import { useBrand } from '../../store'
import { TestingSayContext, TestingSessionContext, initialSession, sessionReducer, type TestingSession } from './session-state'
import { defaultBoardForm, defaultForm, todayIn } from './sign-in-form'

/* The testing session's provider (session-state.ts has the why). Mounted once
   above both shells, so every testing surface — the board's Try a sign-in and
   each version of Policy testing — reads the same session, and a trip to the
   User Dashboard and back keeps it.

   It also holds Policy testing's status region (session-state.ts has the
   why): always in the page, empty until Try says something, and keeping its
   words while Try is closed, so coming back to the same answer says nothing
   twice. */
export function TestingSessionProvider({ children }: { children: ReactNode }) {
  const { users, apps, policyById, persona } = useBrand()
  const [state, dispatch] = useReducer(sessionReducer, null, () => initialSession(defaultForm(users, apps, todayIn())))
  const [said, say] = useState('')

  /* Another tenant starts again. Not by `key`: this sits around the shell, and
     a key would remount the rail the persona was picked from. Reset while
     rendering, the way React adjusts state to a changed input, so no screen
     renders the last tenant's person against this tenant's directory. */
  const [tenant, setTenant] = useState(persona)
  if (tenant !== persona) {
    setTenant(persona)
    dispatch({ type: 'reset', form: defaultForm(users, apps, todayIn()) })
    say('')
  }

  const value = useMemo<TestingSession>(
    () => ({
      ...state,
      patch: (patch, field) => dispatch({ type: 'patch', patch, field }),
      patchBoard: (policyId, patch, field) => {
        const policy = policyById(policyId)
        if (!policy) return
        dispatch({ type: 'patch-board', policyId, base: defaultBoardForm(policy, users, apps, todayIn()), patch, field })
      },
      loadBoard: (policyId, form) => dispatch({ type: 'load-board', policyId, form }),
      load: (form) => dispatch({ type: 'load', form }),
      replay: () => dispatch({ type: 'replay' }),
      setView: (view) => dispatch({ type: 'view', view }),
      openBreakIn: (policyId) => dispatch({ type: 'open-break-in', policyId }),
      closeBreakIn: () => dispatch({ type: 'close-break-in' }),
    }),
    [state, users, apps, policyById],
  )

  return (
    <TestingSessionContext.Provider value={value}>
      <TestingSayContext.Provider value={say}>
        {children}
        <p className="u-sr-only" role="status" aria-live="polite">
          {said}
        </p>
      </TestingSayContext.Provider>
    </TestingSessionContext.Provider>
  )
}
