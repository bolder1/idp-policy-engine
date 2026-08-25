import { useState } from 'react'

import { useBrand } from '../store'
import { AuthMethods } from './AuthMethods'
import { AuthMethodsV2 } from './AuthMethodsV2'

/* Two layouts and two points of view over one screen.

   THE LAYOUTS are not two implementations. v2 imports the primary sign-in
   block, the default-method picker, the method card, the settings pane and the
   setup form from v1 — everything you can DO is literally the same code, and
   the only thing that differs is where the detail sits: a slide-over over the
   list in v1, a pane beside it in v2. A difference in arrangement is legible
   when nothing else moved.

   THE POINTS OF VIEW are the newer question, and the answer is the same one:
   not two screens, one screen that knows who is looking. The end-user page in
   the live product (moas/showenduserconfiguration) is already the same shape as
   v2 — a rail of the same ten families, a pane of method cards with a toggle
   and an Edit — so the two roles were never going to need different furniture.
   What they need is for the furniture to mean different things:

     admin  a toggle enables a method for the tenant; Edit opens the connection
     user   a toggle picks the one method that runs for you; Edit opens your own
            details, inline in the card, and you only see what the admin left on

   The switch is prototype furniture rather than a product control — nobody
   changes their own role — so it is gated with the rest of it. */

type V = 'v1' | 'v2'

const VERSIONS: { id: V; label: string; blurb: string }[] = [
  { id: 'v2', label: 'v2 · split', blurb: 'All methods on the left, the detail beside them on the same background' },
  { id: 'v1', label: 'v1 · slide-over', blurb: 'A list of eleven cards that opens a panel over itself' },
]

export function AuthMethodsPage() {
  const store = useBrand()
  /* v2 is the proposal, so it is what opens. */
  const [v, setV] = useState<V>('v2')

  /* Read, not owned. Switching sides is an account action taken from the
     avatar menu — it changes the chrome, the nav and the landing screen, none
     of which this page has any business deciding. It used to own a "Viewing
     as" dropdown here, which put a global move inside one tab.

     v1 has no end-user arrangement; it is the archived layout and giving it a
     second mode would mean maintaining four screens to compare two things. So
     an end user always gets v2. */
  const role = store.role

  return (
    <>
      {/* Prototype furniture, gated the same way the builder's is: a
          watered-down product should not advertise that it has another version
          of itself. */}
      {store.features.designSwitcher && role === 'admin' && (
        <div className="bzver">
          <span>Methods design</span>
          <div className="bviewswitch" role="tablist" aria-label="Methods version">
            {VERSIONS.map((o) => (
              <button
                key={o.id}
                role="tab"
                type="button"
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
      )}

      {v === 'v2' || role === 'user' ? <AuthMethodsV2 role={role} /> : <AuthMethods />}
    </>
  )
}
