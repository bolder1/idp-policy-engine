import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Fingerprint,
  Gauge,
  Grid3x3,
  Hash,
  HelpCircle,
  KeyRound,
  Languages,
  Link2,
  Server,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react'

import { Toggle, TipDot } from './kit'
import { SOURCE_LABEL, type MfaSetting } from './mfa-settings'
import type { MfaValue } from './mfa-join'

/* -----------------------------------------------------------------------------
   One settings row, and the three controls it can carry.

   Its own module because two screens render it and it kept acquiring an
   invisible dependency: the old version lived in AuthMethodsV5.tsx and its
   number input was styled by `.bv5 .bv5__dnum input`, so anything rendering it
   outside a `.bv5` ancestor silently lost the styling. A form control should
   not need to know which screen it is on.

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

/* An icon per setting. Not decoration — in a column of forty-two rows it is the
   thing that lets you find "the timing one" without reading every label. Keyed
   by id with a suffix fallback, because ids are stable and labels are not. */
const ICON: { match: RegExp; icon: LucideIcon }[] = [
  { match: /length$/, icon: Hash },
  { match: /validity|timeout|expiry|drift/, icon: Timer },
  { match: /rate|limit/, icon: Gauge },
  { match: /sender|issuer|subject/, icon: Type },
  { match: /provider|gateway/, icon: Server },
  { match: /language/, icon: Languages },
  { match: /^bio-/, icon: Fingerprint },
  { match: /^push-/, icon: Bell },
  { match: /^kba-/, icon: HelpCircle },
  { match: /^grid-/, icon: Grid3x3 },
  { match: /qr-email|auth-type/, icon: Smartphone },
  { match: /backup|token-type/, icon: KeyRound },
  { match: /magic/, icon: Link2 },
  { match: /attestation|uv|passkeys/, icon: ShieldCheck },
]

const iconFor = (id: string): LucideIcon => ICON.find((x) => x.match.test(id))?.icon ?? Hash

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
  const Icon = iconFor(setting.id)
  const num = f.kind === 'number' ? Number(value) : 0
  const warn = f.kind === 'number' && f.warnAbove && num > f.warnAbove.value ? f.warnAbove.why : null

  /* Who moved the value decides whether it animates. A drag has to be 1:1 —
     easing a thumb that is under the user's finger reads as lag — but a typed
     value is a jump, and a jump with no travel between the old position and the
     new one is a control that appears to teleport. The box sets this when it
     commits, the slider clears it when it drags, and the class is on for
     exactly the render that needs it. */
  const [tween, setTween] = useState(false)

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

  return (
    <div className={`bsf ${f.kind === 'number' ? 'is-range' : ''}`}>
      <div className="bsf__head">
        <span className="bsf__ico" aria-hidden>
          <Icon size={15} strokeWidth={1.9} />
        </span>

        <span className="bsf__label">
          {setting.label}
          {/* The help sentence, one hover away. It used to sit under every
              label as a second line of grey, which is what made a column of
              these read as a wall rather than a form. */}
          {/* Help and provenance share one tip. The "Moved from Product
              Settings" chip used to sit on the row and it was the busiest thing
              on it — a footnote about where a setting used to live, drawn at
              the same weight as the setting. It still matters during the
              migration, so it is folded into the same hover rather than
              dropped. */}
          {(setting.help || setting.source) && (
            <TipDot
              label={`About ${setting.label}`}
              text={
                <>
                  {setting.help}
                  {setting.source && (
                    <>
                      {setting.help && <br />}
                      <em className="bsf__tipsrc">{SOURCE_LABEL[setting.source]}</em>
                    </>
                  )}
                </>
              }
            />
          )}
          {extra}
        </span>

        <span className="bsf__ctl">
          {f.kind === 'toggle' && (
            <Toggle checked={Boolean(value)} onChange={onChange} label={setting.label} size="sm" />
          )}
          {f.kind === 'number' && (
            <NumberBox
              value={num}
              min={f.min}
              max={f.max}
              unit={f.unit}
              label={setting.label}
              warn={Boolean(warn)}
              onChange={(v) => onChange(v)}
              onTween={setTween}
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

        {onRemove && (
          <button type="button" className="bsf__drop" aria-label={`Remove ${setting.label}`} onClick={onRemove}>
            <Trash2 size={14} strokeWidth={1.9} />
          </button>
        )}
      </div>

      {/* Full width, under the label — a slider squeezed into a right-hand
          column is a slider you cannot aim at. */}
      {f.kind === 'number' && (
        <Slider
          min={f.min}
          max={f.max}
          value={num}
          label={setting.label}
          unit={f.unit}
          warnAbove={f.warnAbove?.value}
          presets={f.presets}
          tween={tween}
          onChange={(v) => {
            setTween(false)
            onChange(v)
          }}
          onJump={(v) => {
            setTween(true)
            onChange(v)
          }}
        />
      )}

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
              value={child.read(s.id, s.field.value)}
              onChange={(v) => child.write(s.id, v)}
              child={child}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* --- The number, typed -------------------------------------------------------------
   The second way in. A slider alone answers "roughly where in the range" and
   refuses to answer "exactly 45" — on OTP validity, 1 to 30 in a 300px track,
   every step is ten pixels and picking one is a test of aim. So the readout is
   the input: the same large number it always was, now with a caret in it.

   The smart part is all in when it commits.

   · **Digits only, from anything.** A pasted "60 seconds" or "6 digits" — which
     is exactly what you get copying the value out of the row above — becomes 60
     and 6. Stripping is kinder than rejecting.
   · **Live while it is valid, patient while it is not.** Type "4" on the way to
     "45" in a 15-to-120 range and a control that clamps per keystroke snaps you
     to 15 and eats the 5. So an out-of-range draft is left alone and marked;
     only a valid one moves the slider as you type.
   · **Clamped on the way out.** Enter or blur settles whatever is in the box
     into the range. Escape puts back what was there before.
   · **Arrows step**, ten at a time with Shift — because the fine end of a
     1-to-300 range is where typing is least pleasant.
   -------------------------------------------------------------------------- */
function NumberBox({
  value,
  min,
  max,
  unit,
  label,
  warn,
  onChange,
  onTween,
}: {
  value: number
  min: number
  max: number
  unit?: string
  label: string
  warn: boolean
  onChange: (v: number) => void
  onTween: (on: boolean) => void
}) {
  /* Null means "not being edited", and the box shows the real value. A string
     means the user is mid-thought and it is theirs until they leave. */
  const [draft, setDraft] = useState<string | null>(null)

  /* A draft only outranks the real value while the box is the thing changing
     it. Drag the slider with a half-typed number still in the box and the box
     would otherwise keep showing the number it was holding — a row reading 5
     next to a slider sitting on 7. So: remember what this box last committed,
     and the moment the value arrives as something else, the draft is stale and
     goes. (A pointer drag normally blurs the box first and settles it that way;
     this is for the paths that do not, like the arrow keys on the range.) */
  const mine = useRef<number | null>(null)
  useEffect(() => {
    if (mine.current !== value) setDraft(null)
    mine.current = value
  }, [value])

  const shown = draft ?? String(value)
  const parsed = draft === null ? value : Number(draft)
  const outOfRange =
    draft !== null && draft !== '' && Number.isFinite(parsed) && (parsed < min || parsed > max)

  const commit = (n: number) => {
    const v = Math.min(max, Math.max(min, Math.round(n)))
    mine.current = v
    onTween(true)
    onChange(v)
    return v
  }

  const type = (raw: string) => {
    const clean = raw.replace(/[^\d]/g, '')
    setDraft(clean)
    const n = Number(clean)
    if (clean !== '' && Number.isFinite(n) && n >= min && n <= max) commit(n)
  }

  const settle = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft !== '' && Number.isFinite(n)) commit(n)
    setDraft(null)
  }

  const key = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') return e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(null)
      return e.currentTarget.blur()
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const base = draft === null || draft === '' ? value : Number(draft)
    const by = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
    setDraft(String(commit((Number.isFinite(base) ? base : value) + by)))
  }

  return (
    <span className={`bsf__num ${warn ? 'is-warn' : ''} ${outOfRange ? 'is-bad' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        className="bsf__numin"
        value={shown}
        /* Sized to the widest value it can hold, so the row does not reflow as
           the digits change and a column of rows keeps its right edge. */
        style={{ width: `${String(max).length}ch` }}
        aria-label={`${label}, ${min} to ${max}${unit ? ` ${unit}` : ''}`}
        onFocus={(e) => {
          setDraft(String(value))
          e.currentTarget.select()
        }}
        onChange={(e) => type(e.target.value)}
        onBlur={settle}
        onKeyDown={key}
      />
      {unit && <em>{unit}</em>}
      {/* Says what the box will do to the number rather than doing it mid-word.
          It replaces the unit, so the row does not grow a fourth thing. */}
      {outOfRange && (
        <i className="bsf__numhint">
          {min}–{max}
        </i>
      )}
    </span>
  )
}

/* --- Slider ----------------------------------------------------------------------
   A real input[type=range] carries the behaviour — keyboard, screen reader,
   touch — and none of the appearance. It sits transparent on top and every
   visible part is painted underneath as its own element.

   That is the change from the gradient version: a fill painted into the track's
   background cannot be animated (a gradient stop is not reliably interpolable
   across engines) and the native thumb cannot be animated at all, since it
   follows the input's value the instant it changes. Separate elements can both
   be transitioned, which is what makes a typed value travel to its new position
   instead of appearing there.

   The geometry is the one fiddly part: a native thumb is inset by half its own
   width at each end, so a fill of `50%` and a thumb at `left: 50%` do not line
   up with where the browser actually puts it. Both are laid out in the same
   reduced span — `10px + (100% - 20px) * ratio` — so they track each other and
   the invisible input exactly. */
function Slider({
  min,
  max,
  value,
  label,
  unit,
  warnAbove,
  presets,
  tween,
  onChange,
  onJump,
}: {
  min: number
  max: number
  value: number
  label: string
  unit?: string
  warnAbove?: number
  presets?: number[]
  tween: boolean
  /** From the track — instant, because a drag must be 1:1. */
  onChange: (v: number) => void
  /** From a preset — eased, because it is a jump. */
  onJump: (v: number) => void
}) {
  const ratio = (n: number) => (max === min ? 0 : (n - min) / (max - min))
  /* One tick per step while the range is small enough to count. Past a dozen
     they stop being landmarks and become texture. */
  const steps = max - min
  const ticks = steps > 0 && steps <= 12 ? Array.from({ length: steps + 1 }, (_, i) => min + i) : null
  const over = warnAbove !== undefined && value > warnAbove
  /* The ceiling, marked on the track. It was only ever stated after you crossed
     it — a warning under a row you have already changed. A notch says where the
     edge is while you are still deciding, which is the difference between a
     guard rail and a complaint. */
  const markAt = warnAbove !== undefined && warnAbove > min && warnAbove < max ? warnAbove : null

  return (
    <div className={`bsf__slider ${tween ? 'is-tween' : ''} ${over ? 'is-warn' : ''}`}>
      <div className="bsf__rail" style={{ '--p': ratio(value) } as React.CSSProperties}>
        <input
          type="range"
          className="bsf__range"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="bsf__trackbg" aria-hidden />
        <span className="bsf__fill" aria-hidden />
        {markAt !== null && (
          <span
            className="bsf__mark"
            style={{ '--m': ratio(markAt) } as React.CSSProperties}
            title={`Recommended maximum: ${markAt}${unit ? ` ${unit}` : ''}`}
          />
        )}
        <span className="bsf__thumb" aria-hidden />
      </div>

      {ticks ? (
        <div className="bsf__ticks" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className={t <= value ? 'is-past' : ''}>
              {t}
            </span>
          ))}
        </div>
      ) : (
        <div className="bsf__ends" aria-hidden>
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}

      {/* The three values anyone actually picks.

          The slider and the box between them answer "roughly where" and
          "exactly what". Neither answers "what is normal", and on a range of
          286 seconds that is the only question most people have. Sits under the
          scale rather than above the track, so it reads as a shortcut to the
          control rather than a replacement for it. */}
      {presets && presets.length > 0 && (
        <div className="bsf__presets">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={value === p}
              className={value === p ? 'is-on' : ''}
              onClick={() => onJump(p)}
            >
              {p}
              {unit ? <em>{shortUnit(unit)}</em> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* Chips are narrow, and "seconds" spelled out on three of them is a row of text
   rather than a row of choices. Only the units that actually appear on a preset
   are abbreviated; anything else is left alone rather than guessed at. */
const SHORT: Record<string, string> = { seconds: 's', minutes: 'min', sends: 'sends' }
const shortUnit = (u: string) => SHORT[u] ?? u

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
function Dropdown({
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
        </ul>
      )}
    </span>
  )
}
