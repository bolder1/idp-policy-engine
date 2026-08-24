import { useId, useState } from 'react'
import { Eye, EyeOff, Plus, X } from 'lucide-react'

import { NumberStepper, TipDot } from '../kit'
import type { ConfigField } from '../method-config'

/* -----------------------------------------------------------------------------
   The configuration form.

   One renderer over the schema in method-config.ts, rather than a hand-built
   form per method. Twenty-one bespoke forms is twenty-one places for a label to
   drift, a required marker to go missing, or a secret to be rendered as plain
   text — and the last of those is the one that matters.

   Every kind here earns its place by describing data the others describe badly:

     text      a value the admin types and can read back
     secret    the same, except it must not be readable over a shoulder
     select    a closed set where every option is equally valid
     radio     a closed set where the options have consequences worth stating,
               so each carries its own line of help
     number    a bounded quantity with a unit, where the bound is the guidance
     toggle    a binary with a stated consequence
     textarea  content long enough that a single line would hide the end of it
     list      a set the admin grows — origins, security questions
   -------------------------------------------------------------------------- */

export function ConfigFields({
  fields,
  onChange,
}: {
  fields: ConfigField[]
  onChange: (id: string, value: unknown) => void
}) {
  return (
    <div className="bmc__fields">
      {fields.map((f) => (
        <FieldRow key={f.id} f={f} onChange={onChange} />
      ))}
    </div>
  )
}

function FieldRow({ f, onChange }: { f: ConfigField; onChange: (id: string, value: unknown) => void }) {
  const uid = useId()
  const [reveal, setReveal] = useState(false)
  const missing = (f.kind === 'text' || f.kind === 'secret') && !!f.required && f.value.trim() === ''

  return (
    <div className={`bmc__field is-${f.kind} ${missing ? 'is-missing' : ''}`}>
      <div className="bmc__label">
        <label htmlFor={`${uid}-c`}>
          {f.label}
          {'required' in f && f.required && (
            <b aria-hidden title="Required before this method can be used">
              *
            </b>
          )}
        </label>
        {/* The help on a tip rather than under the label.

            RSA is twenty-six fields, and every one carried a sentence of vendor
            prose beneath its name — a form where most of the vertical space is
            explanation you read once and then scroll past forever. The words
            still matter: half of these are values you can only read off the RSA
            Security Console, and "Access ID" alone tells you nothing. So they
            move to the dot: available on the row that needs it, absent on the
            twenty-five that do not.

            The sentence is ALSO kept in the DOM, hidden, and pointed at by the
            control's `aria-describedby`. `Tip` puts `aria-describedby` on its
            own trigger and only while open, which describes the question mark
            rather than the field — so without this, deferring the prose
            visually would have deleted it outright for anyone not using a
            pointer. */}
        {f.help && (
          <>
            <TipDot text={f.help} label={`About ${f.label}`} />
            <p id={`${uid}-help`} className="u-sr-only">
              {f.help}
            </p>
          </>
        )}
      </div>

      <div className="bmc__control">
        {f.kind === 'text' && (
          <input
            id={`${uid}-c`}
            type="text"
            value={f.value}
            placeholder={f.placeholder}
            aria-invalid={missing}
            aria-describedby={f.help ? `${uid}-help` : undefined}
            onChange={(e) => onChange(f.id, e.target.value)}
          />
        )}

        {f.kind === 'secret' && (
          /* Masked by default and revealable on demand. A write-only field is
             worse than useless here: the admin cannot check a value they pasted
             wrong, so they clear it and paste again, which is how a working
             integration gets broken while being verified. */
          <span className="bmc__secret">
            <input
              id={`${uid}-c`}
              type={reveal ? 'text' : 'password'}
              value={f.value}
              autoComplete="off"
              aria-invalid={missing}
              aria-describedby={f.help ? `${uid}-help` : undefined}
              onChange={(e) => onChange(f.id, e.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? `Hide ${f.label}` : `Show ${f.label}`}
            >
              {reveal ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
            </button>
          </span>
        )}

        {f.kind === 'select' && (
          <select
            id={`${uid}-c`}
            value={f.value}
            aria-describedby={f.help ? `${uid}-help` : undefined}
            onChange={(e) => onChange(f.id, e.target.value)}
          >
            {f.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}

        {f.kind === 'number' && (
          /* Clamping now happens on commit rather than per keystroke. The old
             version rewrote the field on every character, which made most of
             each range untypable — see NumberStepper. */
          <NumberStepper
            id={`${uid}-c`}
            label={f.label}
            value={f.value}
            min={f.min}
            max={f.max}
            unit={f.unit}
            onChange={(n) => onChange(f.id, n)}
          />
        )}

        {f.kind === 'toggle' && (
          <label className="bmc__switch">
            <input
              id={`${uid}-c`}
              type="checkbox"
              checked={f.value}
              onChange={(e) => onChange(f.id, e.target.checked)}
            />
            <span>{f.value ? 'On' : 'Off'}</span>
          </label>
        )}

        {f.kind === 'radio' && (
          <div
            className="bmc__radios"
            role="radiogroup"
            aria-label={f.label}
            aria-describedby={f.help ? `${uid}-help` : undefined}
          >
            {f.options.map((o) => (
              <label key={o.value} className={f.value === o.value ? 'is-on' : ''}>
                <input
                  type="radio"
                  name={`${uid}-r`}
                  checked={f.value === o.value}
                  onChange={() => onChange(f.id, o.value)}
                />
                <span>
                  <strong>{o.label}</strong>
                  {o.help && <em>{o.help}</em>}
                </span>
              </label>
            ))}
          </div>
        )}

        {f.kind === 'textarea' && (
          <textarea
            id={`${uid}-c`}
            rows={f.rows ?? 3}
            value={f.value}
            aria-describedby={f.help ? `${uid}-help` : undefined}
            onChange={(e) => onChange(f.id, e.target.value)}
          />
        )}

        {f.kind === 'list' && <ListField f={f} onChange={onChange} />}
      </div>
    </div>
  )
}

function ListField({ f, onChange }: { f: Extract<ConfigField, { kind: 'list' }>; onChange: (id: string, v: unknown) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    // Silently ignoring a duplicate is better than a validation message here:
    // the list is a set, and the user's intent is already satisfied.
    if (!v || f.value.includes(v)) return setDraft('')
    onChange(f.id, [...f.value, v])
    setDraft('')
  }

  return (
    <div className="bmc__list">
      <ul>
        {f.value.map((v) => (
          <li key={v}>
            <span>{v}</span>
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(f.id, f.value.filter((x) => x !== v))}>
              <X size={12} strokeWidth={2.2} />
            </button>
          </li>
        ))}
        {f.value.length === 0 && <li className="is-empty">No {f.itemLabel} yet.</li>}
      </ul>
      <div className="bmc__listadd">
        <input
          value={draft}
          placeholder={`Add a ${f.itemLabel}…`}
          aria-label={`Add a ${f.itemLabel}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>
          <Plus size={13} strokeWidth={2.2} /> Add
        </button>
      </div>
    </div>
  )
}

