import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

import { Button, TipDot, Toggle } from './kit'
import { fieldValue, type MfaSetting } from './mfa-settings'
import type { MfaValue } from './mfa-join'

/* -----------------------------------------------------------------------------
   One settings row, and the three controls it can carry.

   Its own module because two screens render it and it kept acquiring an
   invisible dependency: the old version lived in AuthMethodsV5.tsx and its
   number input was styled by `.bv5 .bv5__dnum input`, so anything rendering it
   outside a `.bv5` ancestor silently lost the styling. A form control should
   not need to know which screen it is on.

   --- Stacked, not side by side -------------------------------------------------

   The label sits on its own line and the control fills the line below it, at
   the full width of the panel (owner, 18 Sep 2026: "don't use this kind of
   horizontal inputs anywhere — only the vertical one, label at the top, remove
   icons, and the selection at the bottom taking the full space").

   The row used to be icon / label / control-on-the-right. In a 560px drawer
   that gives the control about 170px and spends the rest on air between the
   two halves, so the eye crosses the panel for every value and the triggers
   read as a narrow right-hand column rather than as fields. Stacked, each
   setting is one field of the form the pane already is — the same shape the
   method setup cards use (method-forms.css) and the same one the pages use
   (label over field). The icons went with it: they named the subject a second
   time, under a label that already says it.

   A TOGGLE and a LINK keep the row form. Neither is a value you pick from a
   set: a switch is small enough to sit beside its label and stacking one
   spends a line saying nothing, and a link row is a door, the same shape as a
   list row that opens a page.

   --- What changed in the polish pass ------------------------------------------

   Every row used to be: bold label, grey help sentence underneath, control on
   the right. Forty-two of those in a column is a wall of grey — and the help
   was doing the damage, because it is the longest text on the row and the least
   often needed. It is on the label now, one hover away.

   The controls follow what enterprise consoles actually do with these types:

   · A bounded number is a SLIDER, not a spinner. "OTP length, 4 to 8" is a
     range you are choosing a point in, and a slider shows you the range; a
     number box shows you one number and hides the other seven. The value is
     read out large beside it, which is the Antimetal/Fruitful pattern.
   · Two or three options are a SEGMENTED control — all choices visible, one
     click, no popover for a decision that small.
   · Four or more are a DROPDOWN, and a custom one rather than `<select>`, so
     the chosen option can carry a tick and the list can breathe.
   -------------------------------------------------------------------------- */

/** How a row reaches the values of the settings it reveals. */
export interface ChildAccess {
  read: (id: string, fallback: MfaValue) => MfaValue
  write: (id: string, v: MfaValue) => void
}

export function SettingField({
  setting,
  value,
  onChange,
  extra,
  onRemove,
  child,
}: {
  setting: MfaSetting
  value: MfaValue
  onChange: (v: MfaValue) => void
  /** Badges after the label — priority, "not collected yet", that sort of thing. */
  extra?: ReactNode
  /** Shown on hover when the row can be taken out of the set. */
  onRemove?: () => void
  /* Supplied by the screen, because the screen owns the key scheme. Without it
     a revealed setting has nowhere to store its value, so the disclosure is
     simply not drawn — which is the honest failure: better a choice with no
     sub-fields than sub-fields that forget what you typed. */
  child?: ChildAccess
}) {
  const f = setting.field
  const num = f.kind === 'number' ? Number(value) : 0
  const warn = f.kind === 'number' && f.warnAbove && num > f.warnAbove.value ? f.warnAbove.why : null


  /* A toggle keys its disclosure on 'on'; a choice keys on the option's own
     label. Both come out of the same map, so the row does not need to know
     which kind it is holding. */
  const revealed = setting.reveals?.[f.kind === 'toggle' ? (value ? 'on' : 'off') : String(value)]

  /* A text value that breaks its own rule, stated as the rule rather than as an
     error. Empty is never a breach — a field you have not filled in yet is not
     a field you have filled in wrongly, and both gateway fields start blank. */
  const broken =
    f.kind === 'text' && f.rule && String(value) !== '' &&
    ((f.pattern !== undefined && !new RegExp(f.pattern).test(String(value))) ||
      (f.maxLength !== undefined && String(value).length > f.maxLength))
      ? f.rule
      : null

  /* A switch and a door stay beside their label; everything you pick a value
     from stacks under it. See the module note. */
  const inline = f.kind === 'toggle' || f.kind === 'link'

  const control = (
    <span className="bsf__ctl">
      {f.kind === 'toggle' && (
        <Toggle checked={Boolean(value)} onChange={onChange} label={setting.label} size="sm" />
      )}
      {f.kind === 'number' && (
        <NumberChoice
          value={num}
          options={f.options}
          unit={f.unit}
          label={setting.label}
          warn={Boolean(warn)}
          custom={f.custom}
          min={f.min}
          max={f.max}
          onChange={(v) => onChange(v)}
        />
      )}
      {f.kind === 'choice' &&
        (f.options.length <= 3 ? (
          <Segmented
            options={f.options}
            value={String(value)}
            label={setting.label}
            onChange={onChange}
          />
        ) : (
          <Dropdown
            options={f.options}
            value={String(value)}
            label={setting.label}
            onChange={onChange}
          />
        ))}
      {/* A door, not a dial. The row exists so the option is findable from
          the family it belongs to; the page it opens (Display tokens) is a
          page of this console, so it wears a chevron, not an arrow out of
          the product. `onChange` is how the screen hears the press. */}
      {f.kind === 'link' && (
        <Button variant="secondary" size="sm" onClick={() => onChange(String(Date.now()))}>
          {f.cta}
          <ChevronRight size={14} strokeWidth={2} aria-hidden />
        </Button>
      )}
      {f.kind === 'text' && (
        <TextBox
          value={String(value)}
          placeholder={f.placeholder}
          maxLength={f.maxLength}
          pattern={f.pattern}
          label={setting.label}
          onChange={onChange}
        />
      )}
    </span>
  )

  return (
    <div className={`bsf${inline ? ' is-inline' : ''}`}>
      {/* The setting's name, and what it does on the tip beside it: row details
          go in tooltips, not on a second line under the name. */}
      <div className="bsf__head">
        <span className="bsf__label">
          {setting.label}
          {setting.help && <TipDot text={setting.help} label={`About ${setting.label}`} />}
          {extra}
        </span>

        {inline && control}

        {onRemove && (
          <button type="button" className="bsf__drop" aria-label={`Remove ${setting.label}`} onClick={onRemove}>
            <Trash2 size={14} strokeWidth={1.9} />
          </button>
        )}
      </div>

      {!inline && control}

      {/* The carrier's rule, or the endpoint's. Shown only once the value
          actually breaks it — a constraint stated permanently under a field is
          another line of grey in a column that already lost its help text for
          being exactly that. */}
      {broken && (
        <p className="bsf__warn">
          <AlertTriangle size={12} strokeWidth={2} aria-hidden />
          {broken}
        </p>
      )}

      {warn && (
        <p className="bsf__warn">
          <AlertTriangle size={12} strokeWidth={2} aria-hidden />
          {warn}
        </p>
      )}

      {/* What this row's answer brought with it.

          Indented under the row that caused them rather than appended to the
          list, because their existence is conditional on it — a gateway URL
          sitting flush with "Sends per user per hour" reads as a peer of it and
          then vanishes when the provider changes, which is a list that
          rearranges itself for no visible reason. */}
      {revealed && revealed.length > 0 && child && (
        <div className="bsf__reveal">
          {revealed.map((s) => (
            <SettingField
              key={s.id}
              setting={s}
              value={child.read(s.id, fieldValue(s.field))}
              onChange={(v) => child.write(s.id, v)}
              child={child}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* --- A bounded number, as a choice between named values ----------------------------
   This was a slider with a typed box beside it. Both are gone.

   A slider is the right control for a continuous quantity and the wrong one for
   these: every setting here has a handful of defensible answers and a long tail
   of numbers nobody should pick. A push timeout of 287 seconds is not a
   considered decision, it is a slider that slipped — and the typed box that
   made 287 reachable made it reachable by accident too. Offering the set
   instead removes the tail, and removes the question "is 45 meaningfully
   different from 44" along with it.

   Always a dropdown, never a segmented row.

   The split used to be by shape — `4 5 6 7 8` inline, `30 60 120 180 300` in a
   dropdown — and it was defensible in isolation and wrong in a column. A panel
   of five settings drew two different controls for one kind of question, so
   the eye had to identify the control before it could read the value, and the
   right-hand edge of the form zig-zagged between a 200px row of buttons and a
   140px trigger.

   One control for one kind. The unit rides on each option — "6 digits", "3
   minutes" — because a dropdown's options are read one at a time with nothing
   beside them to borrow it from, and because the closed trigger then states
   the whole value rather than a bare number.

   A field marked `custom` keeps the set AND offers "Custom" as its last row.
   Choosing it opens a box UNDER the dropdown; the dropdown stays exactly where
   it was, reading "Custom" (owner, 18 Sep 2026: "when I select custom I don't
   want a dedicated view — add an input field under the dropdown, don't hide it
   or replace it with something else"). The set is still the answer for almost
   everybody; the box is for the tenant whose reason is not on the list.

   Leaving custom is picking a preset, which is why there is no third control
   to do it: the dropdown never went away. What the box takes is clamped to the
   field's own min and max, so "custom" never means "anything". */
function NumberChoice({
  value,
  options,
  unit,
  label,
  warn,
  custom = false,
  min,
  max,
  onChange,
}: {
  value: number
  options: number[]
  unit?: string
  label: string
  warn: boolean
  /** The field allows a number outside `options`, typed. */
  custom?: boolean
  min: number
  max: number
  onChange: (v: number) => void
}) {
  /* A value the set does not hold can only have been typed, so the box opens
     holding it rather than a dropdown that cannot show where it is. */
  const [typing, setTyping] = useState(custom && !options.includes(value))
  const [draft, setDraft] = useState(String(value))
  /* The "Custom" row unmounts with the list that holds it, so the button the
     admin just pressed leaves the DOM and focus falls to <body> — the next Tab
     restarts at the top of the console instead of entering the box they asked
     for. Moved on the PRESS, not in an effect on `typing`: `typing` can start
     true for a value the set does not hold, and that must not pull focus the
     moment a panel opens. */
  const box = useRef<HTMLInputElement | null>(null)

  /* A value arriving from outside — another family's settings under the same
     control, a panel reopened — replaces whatever is half-typed. */
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  /* Clamped on the way out, not on the way in: clamping as you type turns "40"
     into "30" at the "4", and then the "0" makes it "300". */
  const commit = () => {
    const n = Number(draft)
    const next = Number.isFinite(n) && draft !== '' ? Math.min(max, Math.max(min, Math.round(n))) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const typed = Number(draft)
  const outside = draft !== '' && Number.isFinite(typed) && (typed < min || typed > max)

  return (
    <span className={`bsf__num${warn ? ' is-warn' : ''}`}>
      <Dropdown
        options={options.map((n) => amount(n, unit))}
        /* "Custom" while the box below is holding the value: the trigger would
           otherwise read a number that is also on screen a line lower, and the
           row you chose would show no tick. */
        value={typing ? CUSTOM : amount(value, unit)}
        label={label}
        action={
          custom
            ? {
                label: CUSTOM,
                active: typing,
                onSelect: () => {
                  setTyping(true)
                  /* After the state flush has rendered the box, not before. */
                  requestAnimationFrame(() => box.current?.focus())
                },
              }
            : undefined
        }
        onChange={(v) => {
          /* Picking a preset is how you leave custom. */
          setTyping(false)
          onChange(Number(String(v).split(' ')[0]))
        }}
      />

      {typing && (
        <span className="bsf__customrow">
          <input
            ref={box}
            type="text"
            inputMode="numeric"
            className="bsf__text"
            value={draft}
            aria-label={unit ? `${label}, in ${unit}` : label}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              commit()
            }}
          />
          {unit && <i className="bsf__unit">{unit}</i>}
        </span>
      )}

      {typing && outside && (
        <p className="bsf__warn">
          <AlertTriangle size={12} strokeWidth={2} aria-hidden />
          {unit ? `Pick between ${min} and ${max} ${unit}.` : `Pick between ${min} and ${max}.`}
        </p>
      )}
    </span>
  )
}

/* The last row, and what the trigger reads while the box below is open. */
const CUSTOM = 'Custom'


/* "6 digits", "1 minute". The unit is written plural in the sheet because that
   is how it reads on almost every option; one of anything is not. */
function amount(n: number, unit?: string): string {
  if (!unit) return String(n)
  return `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`
}

/* --- Text, with the rule it has to keep -------------------------------------------
   Free text was the one kind that accepted anything, which is fine for an email
   subject and wrong for an SMS sender ID: carriers cap it at eleven
   alphanumeric characters and silently drop what breaks that, so the value
   fails at delivery time where nobody is looking.

   The field states its own limit — the counter appears as you approach it, not
   permanently — and marks itself when the pattern is broken. It does not block
   typing: a hard stop on the twelfth character is a field that appears broken,
   and the value is still a draft until the panel is saved. */
function TextBox({
  value,
  placeholder,
  maxLength,
  pattern,
  label,
  onChange,
}: {
  value: string
  placeholder?: string
  maxLength?: number
  pattern?: string
  label: string
  onChange: (v: string) => void
}) {
  /* Empty is never wrong. A field you have not filled in yet is not a field you
     have filled in badly, and both gateway fields open blank — marking them red
     on arrival is the panel accusing you of something before you have touched
     it. Emptiness is a save-time question, not a typing-time one. */
  const bad = value !== '' && Boolean(pattern) && !new RegExp(pattern!).test(value)
  const over = maxLength !== undefined && value.length > maxLength
  /* Quiet until it matters. A counter sitting at 8/11 from the moment the panel
     opens is decoration; one that appears at 9 is a warning. */
  const near = maxLength !== undefined && value.length >= maxLength - 2

  return (
    <span className={`bsf__textwrap ${bad || over ? 'is-bad' : ''}`}>
      <input
        type="text"
        className="bsf__text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={bad || over || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {maxLength !== undefined && near && (
        <i className="bsf__count">
          {value.length}/{maxLength}
        </i>
      )}
    </span>
  )
}

/* --- Segmented ------------------------------------------------------------------- */

function Segmented({
  options,
  value,
  label,
  onChange,
}: {
  options: string[]
  value: string
  label: string
  onChange: (v: string) => void
}) {
  return (
    <span className="bsf__seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={value === o ? 'is-on' : ''}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </span>
  )
}

/* --- Dropdown ---------------------------------------------------------------------
   Custom rather than `<select>` so the open list can show a tick against the
   current value and give each option room. A native select cannot do either,
   and on Windows it renders the OS list, which is the one element on the page
   that never matches the product. */
export function Dropdown({
  options,
  value,
  label,
  action,
  onChange,
}: {
  options: string[]
  value: string
  label: string
  /** A last row that opens a control of its own instead of setting a value. */
  action?: { label: string; active: boolean; onSelect: () => void }
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <span className="bsf__dd" ref={wrap}>
      <button
        type="button"
        className={`bsf__ddtrigger ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{value}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <ul className="bsf__ddlist" id={id} role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                className={o === value ? 'is-on' : ''}
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
              >
                <Check size={13} strokeWidth={2.6} aria-hidden />
                {o}
              </button>
            </li>
          ))}
          {/* An option like the others — it is a choice, and it ticks when it is
              the one in force — under a rule, because what it sets is typed
              below rather than named here. */}
          {action && (
            <li className="bsf__ddaction">
              <button
                type="button"
                role="option"
                aria-selected={action.active}
                className={action.active ? 'is-on' : ''}
                onClick={() => {
                  action.onSelect()
                  setOpen(false)
                }}
              >
                <Check size={13} strokeWidth={2.6} aria-hidden />
                {action.label}
              </button>
            </li>
          )}
        </ul>
      )}
    </span>
  )
}
