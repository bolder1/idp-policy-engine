import { useId } from 'react'
import { KeyRound, LogOut, MonitorX, ShieldAlert, UserCheck, XCircle, type LucideIcon } from 'lucide-react'

import type { Rule } from '../../data'
import { POST_ACTIONS, POST_ACTION_NOTE, type PostAction } from '../../post-sign-in'
import { POST_TONE, usePostBoard } from './post-board'

/* -----------------------------------------------------------------------------
   THEN, on a post sign-in policy — one action of five (post-sign-in.ts).

   The same control the sign-in Then uses for its outcome: option cards, two
   to a row and the rest wrapping under them, each with its one line (owner,
   22 Sep 2026: "stackable cards with a one-liner"). The line is the action's
   note, `POST_ACTION_NOTE`, so the choice is made on what it does — and Block
   device says its scope there, on this application only. No tip beside the
   cards: the card already carries the line a tip would hold, and a tip is a
   button that cannot sit inside one.

   Nothing is chosen until the admin chooses (`Rule.action` absent), and no
   card is lit then. A rule or the last row left without one keeps the policy
   a draft; when a save or a Turn on is refused for it, the reason is said
   here, under the question it is about (26 Sep 2026: never a disabled
   button, the reason under the question).

   No factors and no deny message: a post sign-in action has none. Deny's
   message is the sign-in's ("You are not permitted to log in"), and an event
   refused mid-session is not that; it waits for its own words.
   -------------------------------------------------------------------------- */

const ACTION_ICON: Record<PostAction, LucideIcon> = {
  allow: UserCheck,
  deny: ShieldAlert,
  'step-up': KeyRound,
  terminate: LogOut,
  'block-device': MonitorX,
}

export function PostThen({ rule, terminal = false, onPatch }: { rule: Rule; terminal?: boolean; onPatch: (p: Partial<Rule>) => void }) {
  const { refusal } = usePostBoard()
  const reasonId = useId()
  const reason = refusal && refusal.at === (terminal ? 'fallback' : rule.id) ? refusal.text : null
  return (
    <div className="bb__thenparts">
      <div className="bb__thenfield">
        <div
          className="bb__outcards"
          role="radiogroup"
          aria-label={terminal ? 'What happens when nothing else matched' : 'What happens when this rule matches'}
          aria-describedby={reason ? reasonId : undefined}
        >
          {POST_ACTIONS.map((a) => {
            const on = rule.action === a.value
            const Icon = ACTION_ICON[a.value]
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={on}
                className={`bb__outcard is-${POST_TONE[a.value]}${on ? ' is-on' : ''}`}
                onClick={() => onPatch({ action: a.value })}
              >
                <span className="bb__outcard__ico" aria-hidden>
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="bb__outcard__text">
                  <b>{a.label}</b>
                  <em>{POST_ACTION_NOTE[a.value]}</em>
                </span>
              </button>
            )
          })}
        </div>
        {reason && (
          <p id={reasonId} className="bb__refusal" role="alert">
            <XCircle size={14} strokeWidth={2} aria-hidden />
            <span>{reason}</span>
          </p>
        )}
      </div>
    </div>
  )
}
