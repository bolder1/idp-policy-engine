import { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, Plus, X } from 'lucide-react'

import { Button, Modal } from '../kit'
import { configFor, missingFields, setField, type ConfigField } from '../method-config'
import type { AuthMethod } from '../methods'

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
        {f.help && <p>{f.help}</p>}
      </div>

      <div className="bmc__control">
        {f.kind === 'text' && (
          <input
            id={`${uid}-c`}
            type="text"
            value={f.value}
            placeholder={f.placeholder}
            aria-invalid={missing}
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
          <select id={`${uid}-c`} value={f.value} onChange={(e) => onChange(f.id, e.target.value)}>
            {f.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}

        {f.kind === 'number' && (
          <span className="bmc__number">
            <input
              id={`${uid}-c`}
              type="number"
              min={f.min}
              max={f.max}
              value={f.value}
              onChange={(e) => {
                // Clamped on the way in — the bounds are the guidance, so a
                // value outside them should not be reachable by typing either.
                const n = Number(e.target.value)
                onChange(f.id, Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.min)
              }}
            />
            {f.unit && <em>{f.unit}</em>}
            <span className="bmc__bounds">
              {f.min}–{f.max}
            </span>
          </span>
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
          <div className="bmc__radios" role="radiogroup" aria-label={f.label}>
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

/* --- The dialog ------------------------------------------------------------- */

export function ConfigureMethodDialog({
  open,
  method,
  onClose,
  onSave,
}: {
  open: boolean
  method: AuthMethod | null
  onClose: () => void
  onSave: (id: string, configured: boolean) => void
}) {
  const base = useMemo(() => (method ? configFor(method.id) : null), [method])
  const [fields, setFields] = useState<ConfigField[]>(base?.fields ?? [])

  // Reopening on a different method must not carry the previous one's values.
  useEffect(() => {
    setFields(base?.fields ?? [])
  }, [base, open])

  if (!method) return null
  const missing = missingFields(fields)
  const ready = missing.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Configure ${method.name}`}
      width={720}
      footer={
        <>
          <span className="bmc__foot">
            {ready ? (
              <>
                <Check size={13} strokeWidth={2.6} aria-hidden /> Everything required is filled in.
              </>
            ) : (
              <>
                <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                {missing.length} required field{missing.length === 1 ? '' : 's'} still blank —{' '}
                {missing.map((f) => f.label).join(', ')}
              </>
            )}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* Saving an incomplete configuration is allowed and does NOT mark the
              method configured. Blocking the save would lose work on a form
              whose credentials often have to be fetched from somewhere else. */}
          <Button variant="brand" onClick={() => onSave(method.id, ready)}>
            {ready ? 'Save and mark configured' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="bmc">
        <p className="bmc__blurb">{base?.blurb}</p>
        {!base && <p className="bmc__blurb">This method has nothing to connect — it is ready as soon as it is switched on.</p>}
        <ConfigFields fields={fields} onChange={(id, v) => setFields((f) => setField(f, id, v))} />
      </div>
    </Modal>
  )
}
