import { useState } from 'react'

import { AuthMethods } from './AuthMethods'
import { AuthMethodsV5 } from './AuthMethodsV5'
import { AuthMethodsV7 } from './AuthMethodsV7'
import { AuthMethodsV6 } from './AuthMethodsV6'
import { AuthMethodsV8 } from './AuthMethodsV8'

/* Three versions on the same data, behind a switch.

   V5 is the deployed prototype's variant rebuilt as-is — three bands, lettered
   sections, and the better-looking of the two tabbed screens. It shipped with
   four tabs because the deployed screen has four, which meant it was missing
   Method Sets: the surface the nav item on the left is actually named after.
   Being faithful to a screen is not a reason to be missing a page.

   It has five tabs now, and the fifth renders `MethodSetsTab` — the same
   component the Current version renders. One implementation of set editing,
   because two would drift, and set membership is referenced by name from every
   policy rule that asks for one.

   V6 is the default now, and it is the answer to the thing both of the others
   have in common: they file this subject into tabs. Methods, Enrolment,
   Recovery, Hardware Tokens and Method Sets are not five topics — they are one
   lifecycle seen from five angles, and a tab bar makes each one look like a
   separate screen. V6 puts the whole catalogue on the left, the tenant-wide
   surfaces in it as peers, and an inspector on the right that answers for
   whatever is selected. See the header of AuthMethodsV6.tsx. */
export function AuthMethodsPage() {
  const [v, setV] = useState<'final' | 'v7' | 'v6' | 'sets' | 'v5'>('final')

  const VERSIONS: { id: typeof v; label: string; blurb: string }[] = [
    { id: 'final', label: 'Final · categories', blurb: 'Two tabs, a list of eleven categories, and the methods on an inner page' },
    { id: 'v7', label: 'V7 · families', blurb: 'Grouped the way the settings sheet groups them, with a default-method section' },
    { id: 'v6', label: 'V6 · one workspace', blurb: 'No tabs — one catalogue and an inspector' },
    { id: 'sets', label: 'Current · with method sets', blurb: 'Five tabs, full depth' },
    { id: 'v5', label: 'V5 · MFA experience', blurb: 'The deployed prototype, rebuilt as-is' },
  ]

  return (
    <>
      <div className="bzver">
        <span>Authentication methods design</span>
        <div className="bviewswitch" role="tablist" aria-label="Authentication methods version">
          {VERSIONS.map((o) => (
            <button
              key={o.id}
              role="tab"
              title={o.blurb}
              aria-selected={v === o.id}
              className={v === o.id ? 'is-on' : ''}
              onClick={() => setV(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {v === 'final' ? (
        <AuthMethodsV8 />
      ) : v === 'v7' ? (
        <AuthMethodsV7 />
      ) : v === 'v6' ? (
        <AuthMethodsV6 />
      ) : v === 'sets' ? (
        <AuthMethods initialTab="sets" />
      ) : (
        <AuthMethodsV5 />
      )}
    </>
  )
}
