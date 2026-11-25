import { CHAR_COUNTS } from './char-limits'

/* The count under a text field: "12/50" (char-limits.ts). Nothing at all where CHAR_COUNTS is off, so a call site can
   draw it unconditionally. Hidden from screen readers, as NameField's count is: the field's own maxLength already
   stops the typing, and a number read on every keystroke is noise. `is-full` greys nothing and shouts nothing: at the
   limit it simply reads 50/50. */
export function CharCount({ value, max, className = '' }: { value: string; max: number; className?: string }) {
  if (!CHAR_COUNTS) return null
  return (
    <span className={`bx-charcount ${value.length >= max ? 'is-full' : ''} ${className}`.trim()} aria-hidden>
      {value.length}/{max}
    </span>
  )
}
