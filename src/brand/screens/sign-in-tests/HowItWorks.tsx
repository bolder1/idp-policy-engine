import { useId } from 'react'
import { LayoutTemplate, Layers, ListChecks, LogIn, MonitorSmartphone, type LucideIcon } from 'lucide-react'

import { Button } from '../../kit'
import { ACCESS_CHECK } from './names'

/* -----------------------------------------------------------------------------
   The canvas before the first run of a visit: what an access check is, and
   the one way in (owner, 1 Oct 2026: "this doesn't go well with the current
   situation — come up with a better state, a better layout and a better
   experience"). It replaced four numbered stages on a spine, a card each,
   which told the engine's steps to someone who had not asked yet.

               Check what access someone gets
     Choose who signs in, to which application, and from where.
       Your policies are checked in order, as a real sign-in is.

                      [ ▸ Check access ]

       ≡ Which policy decides   ☑ Which rule matched, and why
                       ▭ What the person sees

   The headline, ONE line of what is asked and how it is answered, and Check
   access — the panel, on the form. Nothing over the headline: a miniature of
   the run stood there, and went (owner, the same day: "remove") — the run
   itself is the picture, a press away. Check access is the page's one orange
   button while the panel is shut; open, pressed and secondary, as Run in the
   panel's foot is then the one. Inside a policy (`primary` off) it is
   secondary throughout: the builder's bar keeps its own orange. Saved
   sign-ins beside it only where the page offers them (a later phase,
   phase.ts). Under it, what the run will show, three short phrases with
   their marks — no more words than that. Nothing here moves.
   -------------------------------------------------------------------------- */

/** What the run shows, under the button. */
const GETS: readonly { icon: LucideIcon; text: string }[] = [
  { icon: Layers, text: 'Which policy decides' },
  { icon: ListChecks, text: 'Which rule matched, and why' },
  { icon: MonitorSmartphone, text: 'What the person sees' },
]

export function HowItWorks({
  onCheck,
  onSaved,
  open = null,
  primary = true,
}: {
  /** Kept for the callers; nothing here moves now. */
  reduced?: boolean
  /** Check access: the panel, on the sign-in's form. */
  onCheck: () => void
  /** Saved sign-ins: the panel, on the saved ones. Absent — nothing saved, or not in this phase — the button is left out. */
  onSaved?: () => void
  /** Which the panel beside the canvas holds, if it is open: its button is pressed. */
  open?: 'form' | 'saved' | null
  /** Check access is the page's orange while the panel is shut. Off inside a policy, where the builder's bar keeps its own. */
  primary?: boolean
}) {
  const head = useId()
  return (
    <section className="hiw" aria-labelledby={head}>
      <h2 id={head} className="hiw__head">
        Check what access someone gets
      </h2>
      <p className="hiw__lede">Choose who signs in, to which application, and from where. Your policies are checked in order, as a real sign-in is.</p>

      <div className="hiw__act">
        <Button variant={primary && open !== 'form' ? 'brand' : 'secondary'} icon={LogIn} pressed={open === 'form'} onClick={onCheck}>
          {ACCESS_CHECK}
        </Button>
        {onSaved && (
          <Button variant="secondary" icon={LayoutTemplate} pressed={open === 'saved'} onClick={onSaved}>
            Saved sign-ins
          </Button>
        )}
      </div>

      <ul className="hiw__gets" aria-label="What the check shows">
        {GETS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={14} strokeWidth={1.9} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </section>
  )
}
