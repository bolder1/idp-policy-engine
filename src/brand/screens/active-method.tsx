import { ShieldAlert } from 'lucide-react'

import type { AuthMethod } from '../methods'
import type { UserEnrolment } from '../user-methods'
import { MethodIcon } from './recovery'

/* -----------------------------------------------------------------------------
   The one method that runs.

   A person opening this page is nearly always asking one question — what
   happens when I sign in — and a list of nine rows answers it only by making
   them read every row until they find the enrolled one. This states it before
   the catalogue, on one line: the label, and the method as a pill beside it.

   It has been trimmed twice, and both trims were the same correction. It began
   as a panel — a 56px logo, the name at --fs-3xl, a description, and a pair of
   facts under a rule giving the address it reaches you at and whether anything
   else was set up — on a brand-tinted field. Then a bordered row with a live
   pill and a chevron. Every version was accurate; each was still the largest
   object on a screen whose job is the list underneath it. A one-word answer
   should be the size of one word.

   Nothing is clickable here now. The pill is a statement, and the method it
   names is a row in the list directly below with everything you can do to it —
   a second, smaller way in was a target that looked like a label.
   -------------------------------------------------------------------------- */

export function ActiveMethod({
  methods,
  enrolment,
}: {
  methods: AuthMethod[]
  enrolment: UserEnrolment
}) {
  const m = methods.find((x) => x.id === enrolment.active) ?? null

  return (
    <div className="bmact">
      <h2 className="bmact__head">Active method</h2>

      {m ? (
        <span className="bmact__pill">
          {/* The same mark the row below carries, so a method looks like itself
              wherever it appears. */}
          <MethodIcon name={m.name} size={17} />
          {m.name}
        </span>
      ) : (
        /* Nothing active is the opposite of this, not a quieter version, so it
           is not the same colour. */
        <span className="bmact__pill is-none">
          <ShieldAlert size={14} strokeWidth={2} aria-hidden />
          No method set up yet
        </span>
      )}
    </div>
  )
}
