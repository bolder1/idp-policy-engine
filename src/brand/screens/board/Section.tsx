import { useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, Plus, type LucideIcon } from 'lucide-react'

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
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  block,
}: {
  value: T
  options: { value: T; label: ReactNode; icon?: LucideIcon }[]
  onChange: (v: T) => void
  label: string
  block?: boolean
}) {
  return (
    <div className={`bb__seg ${block ? 'bb__seg--block' : ''}`} role="group" aria-label={label}>
      {options.map((o) => {
        const Ico = o.icon
        return (
          <button key={o.value} type="button" className={o.value === value ? 'is-on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {Ico && <Ico size={12} strokeWidth={2} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
