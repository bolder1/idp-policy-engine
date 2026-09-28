import { useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon, Plus } from 'lucide-react'

import './seg.css'

/* -----------------------------------------------------------------------------
   An inspector section — Figma's grammar.

   A title row you can collapse, a count where a count means something, and an
   action on the right where adding is the point of the section. The body is
   whatever the section is about, at the panel's own padding.
   -------------------------------------------------------------------------- */

export function Section({
  title,
  count,
  action,
  actionIcon: ActionIcon = Plus,
  onAction,
  open: openProp,
  children,
  note,
}: {
  title: string
  count?: number | string
  /** Accessible name for the action button — "Add a condition". */
  action?: string
  actionIcon?: LucideIcon
  /** Receives the click so a popover can anchor to the button that opened it. */
  onAction?: (e: MouseEvent<HTMLButtonElement>) => void
  /** Initial state. Sections default to open; the ones you rarely need say so. */
  open?: boolean
  children: ReactNode
  note?: ReactNode
}) {
  const [open, setOpen] = useState(openProp ?? true)
  return (
    <section className={`bb__sec ${open ? '' : 'is-closed'}`}>
      <div className="bb__sechead">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={14} strokeWidth={2} className="bb__chev" aria-hidden />
          {title}
          {count !== undefined && count !== 0 && <span className="bb__count">{count}</span>}
        </button>
        {action && onAction && (
          <button type="button" className="bb__secact" aria-label={action} title={action} onClick={onAction}>
            <ActionIcon size={15} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="bb__secbody">
        {note && <p className="bb__secnote">{note}</p>}
        {children}
      </div>
    </section>
  )
}

/** A property row: the sentence on the left, its control on the right. */
export function Prop({ label, sub, indent, stack, children }: { label: ReactNode; sub?: ReactNode; indent?: boolean; stack?: boolean; children: ReactNode }) {
  return (
    <div className={`bb__prop ${indent ? 'is-indent' : ''} ${stack ? 'is-stack' : ''}`}>
      <span>
        {label}
        {sub && <em>{sub}</em>}
      </span>
      {children}
    </div>
  )
}

/** A segmented control. The kit has tabs and toggles; this is the third thing. */
/* `null` is a question nobody has answered yet: Describe it's choice rows ask
   with nothing picked, because a guess sitting pre-selected is a guess the
   admin has to notice before it is on the board (describe spec, §6.3). No
   option is checked, the first takes the tab stop, and the arrows move focus
   without choosing — Enter or Space chooses, as a click does. Every other
   caller passes a value and gets exactly the control it had. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  block,
}: {
  value: T | null
  /** `title` is the option's one-line tooltip. */
  options: { value: T; label: ReactNode; icon?: LucideIcon; title?: string }[]
  onChange: (v: T) => void
  label: string
  block?: boolean
}) {
  const unset = value === null
  return (
    /* A radiogroup, not a group of toggles.

       `aria-pressed` says "this button is currently pressed", which is true of
       each option independently — so a three-option segment announced three
       separate on/off states and gave no hint that choosing one unchooses the
       others. It is exactly one choice out of several, which is what
       radiogroup means, and the role brings the roving tabindex and the arrow
       keys with it. */
    <div className={`bb__seg ${block ? 'bb__seg--block' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const Ico = o.icon
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (unset && i === 0) ? 0 : -1}
            className={on ? 'is-on' : ''}
            title={o.title}
            onKeyDown={(e) => {
              const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
              if (!d) return
              e.preventDefault()
              const next = (i + d + options.length) % options.length
              /* Unanswered: move, do not choose. The buttons are siblings, so
                 the next one is found beside this one. */
              if (unset) {
                const row = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                row?.[next]?.focus()
                return
              }
              onChange(options[next].value)
            }}
            onClick={() => onChange(o.value)}
          >
            {Ico && <Ico size={12} strokeWidth={2} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
