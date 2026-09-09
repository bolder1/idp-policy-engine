import { useEffect, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'

import { Button, Modal } from '../kit'
import { blankPolicy, type Policy } from '../data'
import { ApplicationField, ApplicationFixed } from '../screens/scope-fields'

/* -----------------------------------------------------------------------------
   Name your policy — the dialog, wherever the asking happens.

   It was step 2 of Create Policy and nothing else: a whole page with its own
   title, its own breadcrumb state, its own fixed-height column and footer bar,
   to ask two questions. It became a dialog over the gallery, and then the
   Applications screen needed to ask exactly the same two questions from an
   application row — at which point it had to stop being part of one screen.

   Extracted rather than copied. Two implementations of "what a new policy is"
   means two 50-character caps, two counters that appear at character 40, and
   two places for `blankPolicy` to be called with slightly different arguments;
   `scope-fields.tsx` exists in this codebase precisely because two screens once
   asked one question two ways and drifted.

   The dialog owns the answers and hands back a finished `Policy`. What happens
   to it next — where it is stored, what is toasted, whether the app navigates
   — belongs to the caller, and the two callers genuinely differ: from the
   gallery the errand was "I want to write a policy", so it ends in the builder;
   from an application row the errand was "this application has nothing of its
   own", and attaching completes it, so that caller stays where it is.
   -------------------------------------------------------------------------- */

export function NewPolicyDialog({
  open,
  onClose,
  onCreate,
  seedName = '',
  fixedAppId,
  onGuided,
}: {
  open: boolean
  onClose: () => void
  /** Hands out a finished policy. The caller stores it and decides where to go. */
  onCreate: (p: Policy) => void
  seedName?: string
  /** The application, stated rather than asked. See `ApplicationFixed`. */
  fixedAppId?: string
  /* Absent in lite, and absent from an application row: the guided build is
     withheld there, and a button that opens nothing is worse than no button. */
  onGuided?: (appIds: string[]) => void
}) {
  const [name, setName] = useState(seedName)
  const [appIds, setAppIds] = useState<string[]>(fixedAppId ? [fixedAppId] : [])
  const field = useRef<HTMLInputElement>(null)

  /* Cleared when it OPENS, not when it closes.

     `Modal` unmounts only its children, so state living above it survives a
     close and reopen — the same trap the zone naming dialog documents. Create
     one policy, open this again, and the field would still hold the last name. */
  useEffect(() => {
    if (!open) return
    setName(seedName)
    setAppIds(fixedAppId ? [fixedAppId] : [])
  }, [open, seedName, fixedAppId])

  /* `autoFocus` cannot win here: `Modal` focuses its own panel on the next
     animation frame, so React's mount-time focus is taken back a frame later
     and the field looks focusable but is not focused.

     Landing after it rather than racing it. `Modal` is this component's child,
     so its effect — and therefore its rAF — is registered first, and callbacks
     queued within one frame run in the order they were queued. The panel still
     gets focus for the instant the dialog announces itself; then the caret goes
     where the work is, which in a two-field form is the first field. */
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      if (field.current?.isConnected) field.current.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  /* Still read, for the line under the field — an optional question is
     allowed to say what leaving it blank will do. */
  const noApp = appIds.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Name your policy"
      width={560}
      footer={
        <>
          {/* Only when it explains a control you cannot press.

              The third state said "Created switched off. Nothing changes for
              users until you turn it on." — true, and reassurance for a worry
              nobody has while naming a thing. It sat in the footer of every
              valid form, so the note was on screen almost always and the two
              sentences that MATTER — the ones naming what is stopping the
              button — were the exception rather than the point.

              Nothing when the form is ready. The button is enabled; that is
              the message. */}
          {/* Only the name blocks now.

              Choosing an application used to be the second gate: the field was
              starred, the picker went red while empty, and Create stayed
              disabled until something was ticked. It is optional, and the model
              already had the state it produces — `blankPolicy` mints a DRAFT,
              and a policy with no application is exactly what a draft is. The
              form was refusing to create a shape the product carries on
              purpose, which is how the break-glass fixture is stored.

              The consequence is also already handled everywhere it lands: the
              policies table offers "Assign apps" on an unassigned row, and the
              board's readiness gate says the rules are saved but never
              evaluated. Neither of those needed a required field to work. */}
          {!name.trim() && <p className="bnp__note">Give the policy a name to continue.</p>}

          {/* Cancel, from both callers.

              It said "Back" from the gallery and "Cancel" from an application
              row, on the argument that one has a step behind it and the other
              does not. That is true and it is not what the button does: it
              abandons a half-filled form either way, and "Back" reads as a
              step in a sequence you can return forward through — which this is
              not, because the dialog clears itself on open. One word, and the
              prop that varied it is gone with the difference it was carrying. */}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          {/* Guided setup lives here rather than up on the gallery, because
              this is the moment somebody has decided to write the rules
              themselves and is looking at an empty form. Offering it as a fifth
              thing to choose between made it one more decision; offering it
              beside Create policy makes it a way out of the one you are already
              stuck on.

              It is the only animated control in the product: a slow sheen and a
              wand that lifts on hover. Everything else here is still, so one
              moving thing reads as an invitation instead of as noise — and it
              stops entirely under prefers-reduced-motion. */}
          {onGuided && (
            <button type="button" className="bguided" onClick={() => onGuided(appIds)}>
              <span className="bguided__sheen" aria-hidden />
              <Wand2 size={14} strokeWidth={1.9} aria-hidden />
              Guided setup
            </button>
          )}

          <Button
            variant="brand"
            onClick={() => onCreate(blankPolicy(name.trim() || 'Untitled policy', appIds))}
            disabled={!name.trim()}
          >
            Create policy
          </Button>
        </>
      }
    >
      {/* Two answers, one line each.

          It was a 59px name field above two 475px scrolling panels — the
          Application list and the Applies-to list, side by side, each with its
          own search box and the audience one with Groups/People TABS on top of
          that — laid out as a fixed-height page with a footer bar of its own.

          "Applies to" has since gone entirely. It was a required question on
          the POLICY and it is answered per RULE now by the Who step, which
          reads and writes the `group` and `user` conditions the rule already
          held. `blankPolicy` has always defaulted a new policy to `EVERYONE`
          with the reason written beside it — "a new policy governs everyone
          until somebody narrows it" — so asking for the narrowing here was
          asking for a decision the model was happy to defer and the rules are
          better placed to make. The application became required in the same
          move: a policy exists to govern access TO something, and one that
          names nothing is a set of rules no sign-in can ever reach. */}
      <div className="bnp">
        <div className="bname2__field">
          {/* The counter rides on the LABEL row rather than under the input.
              Below it, appearing at character 40 pushed everything after it
              down 18px mid-word. */}
          <span className="bname2__labelrow">
            <label htmlFor="np-name" className="bname2__label">
              Policy name <i>*</i>
            </label>
            {name.length > 39 && <span className="bname2__count">{50 - name.length} left</span>}
          </span>
          <input
            id="np-name"
            ref={field}
            type="text"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            placeholder="Finance Team – High Security"
          />
        </div>

        {/* Asked, or stated.

            No asterisk on the stated one: an asterisk means "you must answer
            this", and it is answered. Locked rather than hidden, because
            hiding it would undo the argument that made the field required in
            the first place — it would only move the invisible default from
            "no application" to "whichever one you happened to open this from".
            And stated rather than shown as a disabled combobox: a greyed
            control reads "you could change this, but not now", which is not
            true either. */}
        <div className="bname2__field">
          {/* Plural, and it is not cosmetic: the field takes several now, and a
              label reading "Application" over a control that accepts four is the
              form telling you it wants one. */}
          {/* No asterisk. It is optional, and a required marker on a field
              that does not block is the form contradicting its own button. */}
          <span className="bname2__label">Applications</span>
          {fixedAppId ? (
            <ApplicationFixed appId={fixedAppId} />
          ) : (
            <ApplicationField appIds={appIds} onChange={setAppIds} />
          )}
          {noApp && !fixedAppId && (
            <span className="bnp__optional">
              Optional. Left blank it is created as a draft, and you can assign applications later.
            </span>
          )}
        </div>

        {/* The template preview that stood here has gone with the step that
            fed it. A template is not chosen before the policy exists any more —
            it is offered from the empty board, applied to a policy that is
            already there, and undone with ⌘Z if it was the wrong one. There is
            nothing for this form to preview. */}
      </div>
    </Modal>
  )
}
