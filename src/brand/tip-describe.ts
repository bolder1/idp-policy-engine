import { FOCUSABLE } from './dialog-chrome'

/* -----------------------------------------------------------------------------
   What a tooltip tells a screen reader (kit.tsx, `Tip`; V4 review MAP-6).

   A reader takes a description off the control that has focus, so while a
   tip is open the control inside it is described by it. This is the part of
   that which needs no browser: which control, what the tip adds to that
   control's own name, and the attribute bookkeeping.

   What the tip adds, by how it reads beside the name:

     name "Replay", tip "Replay"                       nothing: it only repeats
     name "Not added: Tor. No such zone.",
          tip "No such zone."                          nothing: the name says it
     name "Documentation",
          tip "Documentation. Coming soon."            the rest: "Coming soon."
     name "Try Priya on Outlook: Deny",
          tip "Global Default Policy · Baseline"       all of it

   Compared without case, spacing or a closing full stop, so "Replay." and
   "replay" are the same words.
   -------------------------------------------------------------------------- */

export type TipAdds = { kind: 'none' } | { kind: 'all' } | { kind: 'rest'; text: string }

const plain = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '').toLowerCase()

/* What is left of the tip once the name it starts with is taken off, with the
   punctuation that joined them. */
const LEAD = /^[\s.,:;·—–-]+/

export function tipAdds(said: string, name: string): TipAdds {
  const s = plain(said)
  if (!s) return { kind: 'none' }
  const n = plain(name)
  if (!n) return { kind: 'all' }
  if (n.includes(s)) return { kind: 'none' }
  const whole = said.replace(/\s+/g, ' ').trim()
  const lead = name.replace(/\s+/g, ' ').trim()
  /* The name, as whole words: "Run" does not open "Running checks". */
  const after = whole.slice(lead.length)
  if (whole.toLowerCase().startsWith(lead.toLowerCase()) && LEAD.test(after)) {
    const rest = after.replace(LEAD, '')
    return plain(rest) ? { kind: 'rest', text: rest } : { kind: 'none' }
  }
  return { kind: 'all' }
}

/** A control's name as a reader says it, near enough to tell a tip that only repeats it. */
export const nameOf = (el: Pick<Element, 'getAttribute' | 'textContent'>): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()

type Wrap = Pick<Element, 'contains' | 'querySelector'>

/* The control a tip describes: the one inside it with focus, else the first
   one inside it. Never the wrapper, and never a control around it — a
   TipMark in a row-sized button leaves the row's name to say its words. A
   wrapper with no control inside (a badge, a line of text) describes
   nothing. */
export function tipTarget(wrap: Wrap | null, active: Element | null): Element | null {
  if (!wrap) return null
  if (active && active !== (wrap as unknown) && wrap.contains(active)) return active
  return wrap.querySelector(FOCUSABLE)
}

type Described = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>

/* Adds `id` to the control's `aria-describedby`, after any description of its
   own, and hands back what takes it off again — leaving the control's own
   ids as they were, and no empty attribute behind. Null when it is there
   already. */
export function describeBy(el: Described, id: string): (() => void) | null {
  const own = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  if (own.includes(id)) return null
  el.setAttribute('aria-describedby', [...own, id].join(' '))
  return () => {
    const left = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id)
    if (left.length > 0) el.setAttribute('aria-describedby', left.join(' '))
    else el.removeAttribute('aria-describedby')
  }
}
