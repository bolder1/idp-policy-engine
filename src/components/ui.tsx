import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { AdaptiveAction } from '../engine/model'

/* -----------------------------------------------------------------------------
   Shared primitives.

   The colour rule that governs everything here: green / amber / red are
   reserved exclusively for Allow / Challenge / Deny. They never appear on a
   button, a nav item, a chart or a badge that means anything else. That single
   constraint is what makes the coverage grid readable at a glance — amber is
   always, only, Challenge.
   -------------------------------------------------------------------------- */

export function OutcomeDot({ action }: { action: AdaptiveAction }) {
  return <span className={`outcome-dot outcome-dot--${action}`} aria-hidden />
}

export function OutcomeChip({
  action,
  label,
  size = 'md',
  layoutId,
}: {
  action: AdaptiveAction
  label?: string
  size?: 'sm' | 'md' | 'lg'
  layoutId?: string
}) {
  const text = label ?? { allow: 'Allow', challenge: 'Challenge', deny: 'Deny' }[action]
  return (
    <motion.span layoutId={layoutId} className={`outcome-chip outcome-chip--${action} outcome-chip--${size}`}>
      <OutcomeDot action={action} />
      {text}
    </motion.span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'info' | 'proposed'
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

/**
 * Marks a surface that does not exist in the shipping engine. The brief was
 * fidelity to the real product, so anything proposed is labelled rather than
 * quietly implied to work.
 */
export function ProposedBadge({ what }: { what: string }) {
  return (
    <span className="proposed" title={`${what} is not in the shipping engine — proposed, needs backend work.`}>
      <span className="proposed__dot" aria-hidden />
      Proposed
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="toggle__knob"
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T
  options: { value: T; label: string; disabled?: boolean; hint?: string }[]
  onChange: (v: T) => void
  name: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.hint}
          className={`segmented__opt ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${name}`}
              className="segmented__bg"
              transition={{ type: 'spring', stiffness: 600, damping: 45 }}
            />
          )}
          <span className="segmented__label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Spring-damped number. Impact figures change constantly as an admin edits;
 * jump-cutting between them reads as a glitch, and it hides the direction of
 * travel — whether a change widened or narrowed the blast radius.
 */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const frame = useRef(0)
  const from = useRef(value)
  const start = useRef(0)

  useEffect(() => {
    if (value === display) return
    from.current = display
    start.current = performance.now()
    const duration = 420

    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / duration)
      // easeOutQuint — fast commitment, gentle settle.
      const eased = 1 - Math.pow(1 - t, 5)
      setDisplay(Math.round(from.current + (value - from.current) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display.toLocaleString()}</span>
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  )
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn'
  children: ReactNode
}) {
  return <div className={`callout callout--${tone}`}>{children}</div>
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`btn btn--${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function AppGlyph({ glyph, tint, size = 20 }: { glyph: string; tint: string; size?: number }) {
  return (
    <span
      className="app-glyph"
      style={{
        background: tint,
        width: size,
        height: size,
        fontSize: size * 0.55,
        borderRadius: size * 0.28,
      }}
      aria-hidden
    >
      {glyph}
    </span>
  )
}
