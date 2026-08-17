import { AlertTriangle, Check, Circle, Pause, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AuthMethod } from './methods'

export type MethodStatus = {
  /** Identity of the state, used to key the animated swap. */
  key: 'empty' | 'live' | 'idle' | 'paused' | 'setup'
  tone: string
  label: string
  detail: string
  icon: LucideIcon
}

/* 'Call transactions' is what finance calls it; 'calls' is what runs out. SMS is
   an acronym and already reads as a plural, so it is left alone. */
export function channelOf(label: string): string {
  const word = label.replace(/\s*transactions$/i, '')
  return word === word.toUpperCase() ? word : `${word.toLowerCase()}s`
}

/* One state per method, resolved once.

   An exhausted balance used to hang under the status pill as a second line of
   red text: it made two rows in twenty-one taller than the rest, and it put the
   most urgent fact on the page in the least prominent position on the row. It
   is not a footnote to the status — for a method that sends over a paid channel
   it IS the status, so it takes the pill and outranks everything else here. A
   method with nothing left to send cannot send, whatever else is true of it,
   and it is the only one of these states that costs money to clear. */
export function methodStatus(m: AuthMethod, blocked: boolean, idle: boolean): MethodStatus {
  if (m.balance && m.balance.remaining === 0) {
    return {
      key: 'empty',
      tone: 'empty',
      label: `Out of ${channelOf(m.balance.label)}`,
      detail:
        'This method sends over a purchased balance, and the balance is exhausted. It cannot deliver until it is topped up, whatever a policy asks for.',
      icon: AlertTriangle,
    }
  }
  if (!blocked) {
    return idle
      ? {
          key: 'idle',
          tone: 'idle',
          label: 'On · unused',
          detail: 'Switched on, and nobody has enrolled in it.',
          icon: Circle,
        }
      : {
          key: 'live',
          tone: 'live',
          label: 'Live',
          detail: 'Configured, switched on, and offered to users.',
          icon: Check,
        }
  }
  return m.configured
    ? {
        key: 'paused',
        tone: 'paused',
        label: 'Switched off',
        detail: 'Configured, but switched off for this tenant.',
        icon: Pause,
      }
    : {
        key: 'setup',
        tone: 'setup',
        label: 'Needs setup',
        detail: 'Not configured yet, so it cannot issue a factor.',
        icon: Settings2,
      }
}
