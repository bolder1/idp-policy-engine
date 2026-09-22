import { useId } from 'react'
import { Pencil, QrCode, ShieldCheck, Smartphone, X } from 'lucide-react'

import { Badge, Button, TipDot, Toggle } from '../kit'
import { Picker } from '../picker'
import type { AuthMethod } from '../methods'
import {
  SECURITY_QUESTIONS,
  enrolIssue,
  enrolShapeFor,
  isEmail,
  isPhone,
  questionPlan,
  type EnrolShape,
} from '../user-methods'
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

   The form's working copy is held by the page, not by the form: opening another
   card, closing the panel or leaving the page all go through the one leave
   guard, which has to be able to see what was typed and save it.
   -------------------------------------------------------------------------- */

export function UserMethodCard({
  m,
  enrolled,
  ready,
  isActive,
  open,
  onOpen,
  onCancel,
  onActivate,
  draft,
  onDraft,
  onSave,
  questions,
}: {
  m: AuthMethod
  enrolled: boolean
  /** Can be switched on: enrolled, nothing to set up, or a token the admin assigned. See `readyFor`. */
  ready: boolean
  isActive: boolean
  open: boolean
  /** Edit or Set up pressed: open the form, or close it (asking first when something was typed). */
  onOpen: (open: boolean) => void
  /** The form's Cancel: close it and drop what was typed. */
  onCancel: () => void
  onActivate: (on: boolean) => void
  /** The open form's working copy. */
  draft: Record<string, string>
  onDraft: (key: string, value: string) => void
  onSave: () => void
  /** Security Questions: how many questions the admin asks each person to set. */
  questions: number
}) {
  const shape = enrolShapeFor(m.id)
  const nothingToSetUp = shape.kind === 'none'
  /* A token an admin hands out. There is no setup for the person to do, and no
     switch until they hold one — so, before that, the card says who does it. */
  const adminIssued = shape.kind === 'assigned'

  return (
    <div className={`bm8__card bm8__card--method bmu__card ${open ? 'is-open' : ''}`}>
      <div className="bmu__head">
        <span className="bm8__tile bm8__tile--logo" aria-hidden>
          <MethodIcon name={m.name} size={36} />
        </span>

        <div className="bm8__info">
          <span className="bm8__name">
            {m.name}
            {/* The tip against the name, then the chips, as on the admin's rows. */}
            {m.summary && <TipDot text={m.description} label={`About ${m.name}`} />}
            {enrolled && <Badge tone="positive">Configured</Badge>}
            {m.tier === 'Phishing-resistant' && (
              <i className="bm8__badge">
                <ShieldCheck size={11} strokeWidth={2.2} aria-hidden />
                Phishing-resistant
              </i>
            )}
          </span>
          {/* The line, as on the admin's rows. */}
          <span className="bm8__blurb">{m.summary ?? m.description}</span>
        </div>

        {/* One control per state. Before enrolment there is nothing to turn on,
            so there is no switch — not a disabled one, no switch. After
            enrolment there are two real and different choices: change what you
            gave us, and use this one or not. */}
        <div className="bm8__right">
          {ready ? (
            <div className="bm8__ctlrow">
              {!nothingToSetUp && !adminIssued && (
                <Button variant="secondary" size="sm" onClick={() => onOpen(!open)}>
                  <Pencil size={13} strokeWidth={2} aria-hidden />
                  Edit
                </Button>
              )}
              <Toggle checked={isActive} onChange={onActivate} label={`Use ${m.name}`} />
            </div>
          ) : adminIssued ? (
            <span className="bmu__hint">{shape.note}</span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onOpen(!open)}>
              <Pencil size={13} strokeWidth={2} aria-hidden />
              Set up
            </Button>
          )}
        </div>
      </div>

      {open && !adminIssued && (
        <div className="bmu__form">
          <EnrolForm
            shape={shape}
            draft={draft}
            onDraft={onDraft}
            questions={questions}
            onCancel={onCancel}
            onSave={onSave}
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

const EMAIL_ERROR = 'Enter a valid email address.'
const PHONE_ERROR = 'Enter a phone number with country code.'

function EnrolForm({
  shape,
  draft,
  onDraft,
  questions,
  onCancel,
  onSave,
}: {
  shape: EnrolShape
  draft: Record<string, string>
  onDraft: (key: string, value: string) => void
  questions: number
  onCancel: () => void
  onSave: () => void
}) {
  const uid = useId()
  const issue = enrolIssue(shape.kind, draft, questions)
  const value = (k: string) => (draft[k] ?? '').trim()
  /* Said only once something is typed: a blank field is not wrong, it is not done yet. */
  const emailError = value('email') && !isEmail(value('email')) ? EMAIL_ERROR : null
  const phoneError = value('phone') && !isPhone(value('phone')) ? PHONE_ERROR : null

  const footer = (saveLabel = 'Save') => (
    <div className="bmu__foot">
      <Button variant="brand" size="sm" disabled={issue !== null} onClick={onSave}>
        {saveLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )

  const errorLine = (id: string, text: string | null) =>
    text ? (
      <p id={id} className="bmu__error">
        {text}
      </p>
    ) : null

  switch (shape.kind) {
    case 'phone':
    case 'email':
    case 'alt-email': {
      const key = shape.kind === 'phone' ? 'phone' : 'email'
      const error = key === 'phone' ? phoneError : emailError
      return (
        <>
          {shape.changeLink && <p className="bmu__changelink">{shape.changeLink}</p>}
          <label className="bmu__field">
            <span>{shape.label}</span>
            <input
              type={shape.kind === 'phone' ? 'tel' : 'email'}
              value={draft[key] ?? ''}
              placeholder={shape.placeholder}
              aria-invalid={!!error}
              aria-describedby={error ? `${uid}-err` : undefined}
              onChange={(e) => onDraft(key, e.target.value)}
            />
          </label>
          {errorLine(`${uid}-err`, error)}
          {footer()}
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
              <input
                type="tel"
                value={draft.phone ?? ''}
                placeholder="+1"
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? `${uid}-perr` : undefined}
                onChange={(e) => onDraft('phone', e.target.value)}
              />
              {errorLine(`${uid}-perr`, phoneError)}
            </label>
            <label className="bmu__field">
              <span>Email</span>
              <input
                type="email"
                value={draft.email ?? ''}
                placeholder="you@company.com"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? `${uid}-eerr` : undefined}
                onChange={(e) => onDraft('email', e.target.value)}
              />
              {errorLine(`${uid}-eerr`, emailError)}
            </label>
          </div>
          {footer()}
        </>
      )

    case 'questions': {
      /* As many as the admin's "Questions to configure" asks for: most from the
         list, the rest written by the person. */
      const { presets, custom } = questionPlan(questions)
      const picked = Array.from({ length: presets }, (_, i) => draft[`q${i}`] ?? '')
      return (
        <>
          <p className="bmu__hint">
            Pick {presets} from the list and write {custom} of your own. Answers are not case sensitive.
          </p>
          {Array.from({ length: presets }, (_, i) => (
            <div className="bmu__pair" key={`p${i}`}>
              <label className="bmu__field">
                <span className="u-sr-only">Question {i + 1}</span>
                <Picker
                  label={`Security question ${i + 1}`}
                  width="fill"
                  value={draft[`q${i}`] || null}
                  placeholder="Select question"
                  /* A question already picked in another row is not offered again. */
                  options={SECURITY_QUESTIONS.filter((q) => q === picked[i] || !picked.includes(q)).map((q) => ({
                    value: q,
                    label: q,
                  }))}
                  onChange={(v) => onDraft(`q${i}`, v)}
                />
              </label>
              <label className="bmu__field">
                <span className="u-sr-only">Answer {i + 1}</span>
                <input value={draft[`a${i}`] ?? ''} placeholder="Answer" onChange={(e) => onDraft(`a${i}`, e.target.value)} />
              </label>
            </div>
          ))}
          {Array.from({ length: custom }, (_, j) => {
            const i = presets + j
            return (
              <div className="bmu__pair" key={`c${i}`}>
                <label className="bmu__field">
                  <span className="u-sr-only">Your own question {j + 1}</span>
                  <input
                    value={draft[`q${i}`] ?? ''}
                    placeholder="Your own question"
                    onChange={(e) => onDraft(`q${i}`, e.target.value)}
                  />
                </label>
                <label className="bmu__field">
                  <span className="u-sr-only">Answer {i + 1}</span>
                  <input value={draft[`a${i}`] ?? ''} placeholder="Answer" onChange={(e) => onDraft(`a${i}`, e.target.value)} />
                </label>
              </div>
            )
          })}
          {errorLine(`${uid}-qerr`, issue?.message || null)}
          {footer()}
        </>
      )
    }

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
              <p className="bmu__hint">Scan this in the app, then enter the 6-digit code it shows.</p>
              <label className="bmu__field bmu__field--code">
                <span id={`${uid}-code`}>Code from the app</span>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={draft.code ?? ''}
                  placeholder="000000"
                  aria-labelledby={`${uid}-code`}
                  onChange={(e) => onDraft('code', e.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
          </div>
          {footer('Verify and save')}
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
            <input value={draft.serial ?? ''} placeholder={shape.placeholder} onChange={(e) => onDraft('serial', e.target.value)} />
          </label>
          {footer()}
        </>
      )

    case 'passkey':
      return (
        <>
          <p className="bmu__hint">
            Your browser asks for Face ID, a fingerprint or your security key. The credential stays on the device.
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
