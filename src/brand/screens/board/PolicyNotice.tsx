import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { appsOf, type App, type Policy } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'

/* -----------------------------------------------------------------------------
   WHAT THE ADMIN SHOULD KNOW BEFORE CHANGING THIS (owner, 23 Oct 2026: "after
   choosing Edit we should give them a note here inside the canvas, notice
   style, what might happen" and, for a copy, "show that only the current
   application is selected with the same things, then let the user decide").

   Two cases, one note:

     SHARED   The policy decides sign-ins for more than one application, so a
              save reaches all of them, and everyone the policy covers on them.
     COPY     The policy is a draft copied from another one. Only the
              application it was copied for is on it, the rules are the
              original's, and the original keeps its other applications. Nothing
              is decided for the admin; the note says what is true and they carry
              on.

   Not for post sign-in policies, which have no applications of their own. A
   copy that has been turned on is just a policy, so its note goes with the draft.
   So does a copy that has been renamed (23 Oct 2026, with the name's highlight):
   the rename takes `copiedFrom` off the policy (store.tsx `keepsCopyMark`), and
   the builder's draft reads it from the store, so the note goes at once.

   A STICKY NOTE, ON THE LEFT BESIDE THE RULES (owner, 23 Oct 2026: "we can use
   the sticky note and add it on the left side of the canvas beside the rules").
   The paper, tape and fold are the zones page's (`.bz7n-sticky`); it unrolls
   once on arrival and sits at a slight tilt, both Motion props, so nothing in
   the CSS may transform it.

   APPLICATIONS ARE SHOWN AS LOGOS (owner, 23 Oct 2026: "add logos for the apps",
   "place the icon with the name inside the paragraph", "if multiple we can add
   only logos"). One application: its logo and name inside the sentence. Several:
   a row of logos alone, five at most and a count for the rest, each named for a
   screen reader.
   -------------------------------------------------------------------------- */

/** "Sales and Finance", "Sales, Finance and 4 more": two names at most. */
function appNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

const ROLLED = 'inset(-12% -6% -12% -6%)'
const FURLED = 'inset(-12% -6% 100% -6%)'

/** Several applications, as logos only. */
function Logos({ apps }: { apps: App[] }) {
  const shown = apps.slice(0, 5)
  return (
    <ul className="bb__sticky__logos" aria-label={apps.map((a) => a.name).join(', ')}>
      {shown.map((a) => (
        <li key={a.id} title={a.name}>
          <AppLogo appId={a.id} name={a.name} size={22} />
        </li>
      ))}
      {apps.length > shown.length && <li className="bb__sticky__more">+{apps.length - shown.length}</li>}
    </ul>
  )
}

/** One application, inside a sentence: its logo, then its name. */
function AppInline({ app }: { app: App }) {
  return (
    <span className="bb__sticky__app">
      <AppLogo appId={app.id} name="" size={16} />
      {app.name}
    </span>
  )
}

/** A stable pseudo-random pair from the policy's id: a tilt and a small nudge, so the note looks stuck on by a hand
    and not set by a grid (owner, 23 Oct 2026: "place it a little more randomly … a little closer"). The same policy
    always gets the same placement. */
function scatter(id: string): { tilt: number; nudge: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const a = ((h >>> 0) % 1000) / 1000
  const b = (((h >>> 10) ^ (h >>> 3)) % 1000 + 1000) % 1000 / 1000
  return { tilt: -3.4 + a * 6, nudge: Math.round(-14 + b * 40) }
}

function Sticky({ id, title, logos, children }: { id: string; title: string; logos?: App[]; children: ReactNode }) {
  const reduce = useReducedMotion()
  const { tilt, nudge } = scatter(id)
  return (
    <div className="bb__notice" style={{ '--bb-nudge': `${nudge}px` } as CSSProperties}>
      <motion.div
        className="bz7n-sticky"
        role="note"
        initial={reduce ? false : { clipPath: FURLED, rotate: 0 }}
        animate={{ clipPath: ROLLED, rotate: tilt }}
        transition={{ clipPath: { duration: 0.42, ease: [0.2, 0, 0, 1] }, rotate: { duration: 0.5, ease: [0.3, 0, 0.2, 1] } }}
      >
        <span className="bz7n-sticky__tape" aria-hidden />
        <h3 className="bz7n-sticky__label">{title}</h3>
        {logos && logos.length > 1 && <Logos apps={logos} />}
        <p className="bb__sticky__text">{children}</p>
      </motion.div>
    </div>
  )
}

/** Who a save reaches, in a phrase: the groups and people the policy is narrowed to, or everyone. */
const whoText = (audience: string[] | null | undefined) => (audience && audience.length > 0 ? appNames(audience) : 'everyone')

export function PolicyNotice({ policy, audience }: { policy: Policy; audience?: string[] | null }) {
  const { apps } = useBrand()
  const on = appsOf(policy, apps)

  if (policy.copiedFrom && policy.status === 'draft') {
    return (
      <Sticky id={policy.id} title={`A copy of ${policy.copiedFrom}`} logos={on}>
        {on.length === 1 ? <>Only <AppInline app={on[0]} /> is on this copy.</> : on.length > 1 ? 'Only these applications are on this copy.' : 'No application is on this copy yet.'}{' '}
        The rules are the same; the original keeps its other applications.
      </Sticky>
    )
  }

  if (on.length > 1) {
    return (
      <Sticky id={policy.id} title="Shared policy" logos={on}>
        {`A save reaches all of these applications, and ${whoText(audience)} on them.`}
      </Sticky>
    )
  }

  return null
}
