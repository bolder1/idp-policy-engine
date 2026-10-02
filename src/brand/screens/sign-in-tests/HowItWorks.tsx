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

                     ┌──────────────┐
                     │  sign-in  ⛉  │   the picture (`CheckArt`)
                     └──────────────┘
               Check what access someone gets
     Choose who signs in, to which application, and from where.
       Your policies are checked in order, as a real sign-in is.

                      [ ▸ Check access ]   — only with the panel shut, on the page

       ≡ Which policy decides   ☑ Which rule matched, and why
                       ▭ What the person sees

   The picture, the headline, ONE line of what is asked and how it is
   answered, and Check access — the panel, on the form. The picture is a
   spot illustration, not a diagram: a miniature of the run stood there, and
   went (owner, the same day: "remove"); then an empty state "with an
   illustration" was asked for (the same day, later). On the page the panel
   is open on arrival with the form in it, so Check access is left out while
   it is (`doorWhileOpen` off): the form is the way in, and Run in its foot
   the one orange. Shut, Check access comes back as the page's one orange
   button — the way back to the form. Inside a policy (`primary` off) it
   stays, secondary throughout and pressed while the form is open: the
   builder's bar keeps its own orange. Saved sign-ins beside it only where
   the page offers them (a later phase, phase.ts). Under it, what the run
   will show, three short phrases with their marks — no more words than
   that. Nothing here moves.
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
  doorWhileOpen = true,
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
  /** Check access stays, pressed, while the form is open. Off on the page, where the form open beside the canvas is the way in. */
  doorWhileOpen?: boolean
}) {
  const head = useId()
  const door = doorWhileOpen || open !== 'form'
  return (
    <section className="hiw" aria-labelledby={head}>
      <CheckArt />
      <h2 id={head} className="hiw__head">
        Check what access someone gets
      </h2>
      <p className="hiw__lede">Choose who signs in, to which application, and from where. Your policies are checked in order, as a real sign-in is.</p>

      {(door || onSaved) && (
        <div className="hiw__act">
          {door && (
            <Button variant={primary && open !== 'form' ? 'brand' : 'secondary'} icon={LogIn} pressed={open === 'form'} onClick={onCheck}>
              {ACCESS_CHECK}
            </Button>
          )}
          {onSaved && (
            <Button variant="secondary" icon={LayoutTemplate} pressed={open === 'saved'} onClick={onSaved}>
              Saved sign-ins
            </Button>
          )}
        </div>
      )}

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

/* The picture over the headline (owner, 1 Oct 2026: "for the empty state
   add a good empty state with an illustration"). The house language, the
   builder's empty policy's (BoardEmpty.tsx): a screen the product is about
   to show, drawn as a grey skeleton — here the sign-in a person meets, its
   address bar, the account chip, two fields and the button — and ONE
   colour, where the colour is the meaning: the shield over its corner, in
   the allow ramp. Not the run in miniature, and not its steps; both stood
   here and went. Four were drawn and set in this frame; this one read
   first. Still, as everything here is. */
function CheckArt() {
  return (
    <svg className="hiw__ill" viewBox="0 0 220 136" role="img" aria-label="A sign-in screen, its access checked">
      <rect className="hiw__ill-win" x="22.5" y="8.5" width="152" height="116" rx="8" />
      <path className="hiw__ill-rule" d="M23 26.5 H174" />
      <rect className="hiw__ill-addr" x="58.5" y="13.5" width="80" height="8" rx="4" />
      <rect className="hiw__ill-bar" x="64" y="16" width="30" height="3" rx="1.5" />
      <rect className="hiw__ill-field" x="68.5" y="35.5" width="60" height="16" rx="8" />
      <circle className="hiw__ill-bar" cx="77" cy="43.5" r="5" />
      <rect className="hiw__ill-bar" x="86" y="41.5" width="34" height="4" rx="2" />
      <rect className="hiw__ill-field" x="54.5" y="60.5" width="88" height="12" rx="4" />
      <rect className="hiw__ill-bar is-soft" x="60" y="64.5" width="34" height="4" rx="2" />
      <rect className="hiw__ill-field" x="54.5" y="78.5" width="88" height="12" rx="4" />
      <rect className="hiw__ill-bar is-soft" x="60" y="82.5" width="24" height="4" rx="2" />
      <rect className="hiw__ill-bar" x="54" y="97" width="89" height="13" rx="4" />
      {/* The shield: a gap of the window's own white around it, then the allow ramp. */}
      <path className="hiw__ill-gap" d={SHIELD} />
      <path className="hiw__ill-shield" d={SHIELD} />
      <path className="hiw__ill-tick" d="M166 107 L172 113 L183.5 101.5" />
    </svg>
  )
}

const SHIELD = 'M174.5 83 L196.5 89.5 V106.5 C196.5 119 187.5 127.5 174.5 131.5 C161.5 127.5 152.5 119 152.5 106.5 V89.5 Z'
