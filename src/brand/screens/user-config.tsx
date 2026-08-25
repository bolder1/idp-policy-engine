import { useId, useState } from 'react'
import { Check, Pencil, QrCode, ShieldCheck, Smartphone, X } from 'lucide-react'

import { Button, Toggle } from '../kit'
import type { AuthMethod } from '../methods'
import { SECURITY_QUESTIONS, enrolShapeFor, type EnrolShape } from '../user-methods'
import { MethodIcon } from './recovery'

/* -----------------------------------------------------------------------------
   A method, from the person's side.

   The same card as the admin's, deliberately — same tile, same name row, same
   corner for the controls — because it is the same object and an admin who has
   just enabled something should recognise what the person is looking at. Three
   things differ, and each of them is a difference in what the control MEANS
   rather than in how it looks:

   · The badge says `Configured`, not "needs setup". On the admin side that
     chip is about the tenant's connection to a provider; here it is about
     whether this person has enrolled. Both can be true independently, which is
     why they are two different words rather than one shared one.
   · The toggle sets the ACTIVE method rather than enabling one. There is one
     active method at a time, so switching a method on switches the previous one
     off — see `onActivate`.
   · Edit opens the form INSIDE the card, and only one card is open at a time.
     That is measured, not chosen: the live end-user page expands the card in
     place rather than opening a dialog, and it is the better answer here for
     the reason it usually is — the form is three fields, and a dialog for three
     fields costs you the list you were reading.
   -------------------------------------------------------------------------- */

export function UserMethodCard({
  m,
  enrolled,
  isActive,
  values,
  open,
  onOpen,
  onActivate,
  onSave,
}: {
  m: AuthMethod
  enrolled: boolean
  isActive: boolean
  values: Record<string, string>
  open: boolean
  onOpen: (open: boolean) => void
  onActivate: (on: boolean) => void
  onSave: (values: Record<string, string>) => void
}) {
  const shape = enrolShapeFor(m.id)
  const nothingToSetUp = shape.kind === 'none'
  /* Can this be switched on yet? Enrolling is what earns the switch — except
     for the methods that ask nothing of you, which are ready the moment they
     are offered. The live page gives the CAC row a toggle and no setup step for
     exactly that reason: the certificate is on the card, so there is nothing to
     wait for. */
  const ready = enrolled || nothingToSetUp

  return (
    <div className={`bm8__card bm8__card--method bmu__card ${open ? 'is-open' : ''}`}>
      <div className="bmu__head">
        <span className="bm8__tile bm8__tile--logo" aria-hidden>
          <MethodIcon name={m.name} size={36} />
        </span>

        <div className="bm8__info">
          <span className="bm8__name">
            {m.name}
            {enrolled && (
              <i className="bm8__badge bmu__badge--set">
                <Check size={11} strokeWidth={2.6} aria-hidden />
                Configured
              </i>
            )}
            {m.tier === 'Phishing-resistant' && (
              <i className="bm8__badge">
                <ShieldCheck size={11} strokeWidth={2.2} aria-hidden />
                Phishing-resistant
              </i>
            )}
          </span>
          <span className="bm8__desc">{m.description}</span>
        </div>

        {/* One control per state, which is the same rule the admin card already
            follows and this card was breaking.

            It shipped with Set up AND a switch side by side on a method nobody
            had enrolled in yet — and because you cannot be challenged by
            something you have not set up, the switch could not activate
            anything either. It opened the form. Two controls, one outcome, in
            the same corner: whichever you pressed, you got the form, so the
            second one taught you nothing and cost a decision.

            Before enrolment there is nothing to turn on, so there is no switch —
            not a disabled one, no switch. After enrolment there are two real and
            different choices, so there are two controls: change what you gave
            us, and use this one or not. */}
        <div className="bm8__right">
          {ready ? (
            <>
              <div className="bm8__ctlrow">
                {/* No Edit where there is nothing to edit. The CAC row on the
                    live page has a toggle and no Edit at all, and inventing one
                    would be inventing a form. */}
                {!nothingToSetUp && (
                  <Button variant="secondary" size="sm" onClick={() => onOpen(!open)}>
                    <Pencil size={13} strokeWidth={2} aria-hidden />
                    Edit
                  </Button>
                )}
                <Toggle checked={isActive} onChange={onActivate} label={`Use ${m.name}`} />
              </div>
              <span className={`bmu__state ${isActive ? 'is-on' : ''}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </>
          ) : (
            /* No state word either. "Inactive" on a method you have never set up
               describes a switch position rather than the truth, which is that
               there is nothing here yet. The button says that already. */
            <Button variant="secondary" size="sm" onClick={() => onOpen(!open)}>
              <Pencil size={13} strokeWidth={2} aria-hidden />
              Set up
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="bmu__form">
          <EnrolForm
            shape={shape}
            values={values}
            onCancel={() => onOpen(false)}
            onSave={(v) => {
              onSave(v)
              onOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

/* --- The forms ----------------------------------------------------------------
   One per shape rather than one schema-driven renderer, because these are not
   variations on a form — a phone number, a QR ceremony and three questions are
   three different kinds of asking, and the thing they share is a footer. */

function EnrolForm({
  shape,
  values,
  onCancel,
  onSave,
}: {
  shape: EnrolShape
  values: Record<string, string>
  onCancel: () => void
  onSave: (v: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(values)
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }))
  const uid = useId()

  const footer = (saveLabel = 'Save', can = true) => (
    <div className="bmu__foot">
      <Button variant="brand" size="sm" disabled={!can} onClick={() => onSave(draft)}>
        {saveLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )

  switch (shape.kind) {
    case 'phone':
    case 'email':
    case 'alt-email': {
      const key = shape.kind === 'phone' ? 'phone' : 'email'
      return (
        <>
          {/* The live page states the value and offers a link to change it,
              rather than presenting an editable field straight away. It is the
              right default for something you set once a year: the common visit
              is to check what is on file, not to change it. */}
          {shape.changeLink && <p className="bmu__changelink">{shape.changeLink}</p>}
          <label className="bmu__field">
            <span>{shape.label}</span>
            <input
              type={shape.kind === 'phone' ? 'tel' : 'email'}
              value={draft[key] ?? ''}
              placeholder={shape.placeholder}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
          {footer('Save', Boolean((draft[key] ?? '').trim()))}
        </>
      )
    }

    case 'phone-and-email':
      return (
        <>
          <p className="bmu__hint">This method sends to both, so both have to be on file.</p>
          <div className="bmu__pair">
            <label className="bmu__field">
              <span>Phone</span>
              <input type="tel" value={draft.phone ?? ''} placeholder="+1" onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label className="bmu__field">
              <span>Email</span>
              <input
                type="email"
                value={draft.email ?? ''}
                placeholder="you@company.com"
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
          </div>
          {footer('Save', Boolean((draft.phone ?? '').trim() && (draft.email ?? '').trim()))}
        </>
      )

    case 'questions':
      return (
        <>
          <p className="bmu__hint">
            Two from the list and one of your own. Answers are not case sensitive.
          </p>
          {[0, 1].map((i) => (
            <div className="bmu__pair" key={i}>
              <label className="bmu__field">
                <span className="u-sr-only">Question {i + 1}</span>
                <select value={draft[`q${i}`] ?? ''} onChange={(e) => set(`q${i}`, e.target.value)}>
                  <option value="">Select question</option>
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bmu__field">
                <span className="u-sr-only">Answer {i + 1}</span>
                <input value={draft[`a${i}`] ?? ''} placeholder="Answer" onChange={(e) => set(`a${i}`, e.target.value)} />
              </label>
            </div>
          ))}
          <div className="bmu__pair">
            <label className="bmu__field">
              <span className="u-sr-only">Your own question</span>
              <input value={draft.q2 ?? ''} placeholder="Enter your own question" onChange={(e) => set('q2', e.target.value)} />
            </label>
            <label className="bmu__field">
              <span className="u-sr-only">Answer 3</span>
              <input value={draft.a2 ?? ''} placeholder="Answer" onChange={(e) => set('a2', e.target.value)} />
            </label>
          </div>
          {footer(
            'Save',
            [0, 1].every((i) => draft[`q${i}`] && (draft[`a${i}`] ?? '').trim()) &&
              Boolean((draft.q2 ?? '').trim() && (draft.a2 ?? '').trim()),
          )}
        </>
      )

    case 'authenticator':
      return (
        <>
          <div className="bmu__scan">
            {/* A drawn stand-in, not a real code. A prototype that renders a
                scannable QR is a prototype that enrolls a real device. */}
            <span className="bmu__qr" aria-hidden>
              <QrCode size={92} strokeWidth={1.1} />
            </span>
            <div>
              <p className="bmu__hint">
                Scan this in the app, then type the six digits it shows to prove it worked.
              </p>
              <label className="bmu__field bmu__field--code">
                <span id={`${uid}-code`}>Code from the app</span>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={draft.code ?? ''}
                  placeholder="000000"
                  aria-labelledby={`${uid}-code`}
                  onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
          </div>
          {footer('Verify and save', (draft.code ?? '').length === 6)}
        </>
      )

    case 'push-app':
      return (
        <>
          <div className="bmu__scan">
            <span className="bmu__qr" aria-hidden>
              <Smartphone size={92} strokeWidth={1.1} />
            </span>
            <p className="bmu__hint">
              Open the app on the device you want to be asked on and accept the registration. The
              device stays registered until you remove it here.
            </p>
          </div>
          {footer('Register this device')}
        </>
      )

    case 'token':
      return (
        <>
          <label className="bmu__field">
            <span>{shape.label}</span>
            <input
              value={draft.serial ?? ''}
              placeholder={shape.placeholder}
              onChange={(e) => set('serial', e.target.value)}
            />
          </label>
          {footer('Save', Boolean((draft.serial ?? '').trim()))}
        </>
      )

    case 'passkey':
      return (
        <>
          <p className="bmu__hint">
            Your browser will ask for Face ID, a fingerprint, or your security key. Nothing is
            stored here — the credential stays on the device.
          </p>
          {footer('Create a passkey')}
        </>
      )

    default:
      return (
        <>
          <p className="bmu__hint">{shape.note ?? 'Nothing to set up.'}</p>
          <div className="bmu__foot">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X size={13} strokeWidth={2} aria-hidden />
              Close
            </Button>
          </div>
        </>
      )
  }
}
