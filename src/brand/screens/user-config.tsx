import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Monitor, QrCode, Settings, ShieldCheck, Smartphone, X } from 'lucide-react'

import { Button, IconButton, TipDot, Toggle } from '../kit'
import { Picker } from '../picker'
import { useBrand } from '../store'
import type { AuthMethod } from '../methods'
import {
  SECURITY_QUESTIONS,
  enrolIssue,
  PROFILE,
  PROFILE_LABEL,
  enrolShapeFor,
  isEmail,
  isPhone,
  profileFieldsFor,
  questionPlan,
  type EnrolShape,
  type ProfileField,
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

/* The apps a person installs and registers, as the live end-user page words them (read 7 Oct 2026):
   which stores it offers, whether it gives a secret to type instead of the QR, and whether a passcode is typed back. */
const APP_FLOW: Record<string, { app: string; stores: string[]; secret: boolean }> = {
  'google-auth': { app: 'Google Authenticator', stores: ['Android', 'iOS'], secret: true },
  'ms-auth': { app: 'Microsoft Authenticator', stores: ['Android', 'iOS'], secret: true },
  authy: { app: 'Authy Authenticator', stores: ['Android', 'iOS'], secret: true },
  'mo-otp': { app: 'miniOrange Authenticator', stores: ['Android', 'iOS', 'Windows'], secret: false },
  'mo-qr': { app: 'miniOrange Authenticator', stores: ['Android', 'iOS', 'Windows'], secret: false },
  'mo-push': { app: 'miniOrange Authenticator', stores: ['Android', 'iOS', 'Windows'], secret: false },
}
/* Not a real secret: the prototype enrols nothing. */
const DUMMY_SECRET = 'KJ2F 6W3Q 9HDM 4XPB'
const tokenName = (id: string) => (id === 'yubikey' ? 'Yubikey' : 'token')
const PASSKEY_GROUPS = [
  {
    title: 'Platform authenticators',
    blurb: 'Built-in authenticators on a device (phone, laptop, or tablet) that create and use passkeys locally. User verification is done with biometrics or a device PIN.',
    options: ['Fingerprint recognition', 'Face recognition', 'Device PIN'],
  },
  {
    title: 'Cross-platform authenticators',
    blurb: 'External authenticators such as USB, NFC, or Bluetooth security keys that store passkeys on the hardware itself. Authentication requires user presence, such as a touch, button press, or PIN.',
    options: ['Security key', 'Phone / tablet'],
  },
]

/* Numbered steps, as the live page draws them. */
function Steps({ children }: { children: ReactNode }) {
  return <ol className="bmu__steps">{children}</ol>
}
function Step({ n, title, aside, children }: { n: number; title?: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <li className="bmu__step">
      <span className="bmu__stepn" aria-hidden>
        {n}
      </span>
      <div className="bmu__stepbody">
        <div className="bmu__steprow">
          {title && <p className="bmu__steptitle">{title}</p>}
          {aside}
        </div>
        {children}
      </div>
    </li>
  )
}

/* The setup key: grouped in fours, monospaced, copied whole without the spaces. */
function SecretKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="bmu__secret">
      <span className="bmu__secretlabel">Setup key</span>
      <div className="bmu__secretrow">
        <code>{value}</code>
        <IconButton
          icon={copied ? Check : Copy}
          size="sm"
          label={copied ? 'Copied' : 'Copy key'}
          onClick={() => {
            void navigator.clipboard?.writeText(value.replace(/\s/g, '')).catch(() => undefined)
            setCopied(true)
          }}
        />
      </div>
      <span className="u-sr-only" aria-live="polite">
        {copied ? 'Key copied' : ''}
      </span>
    </div>
  )
}

/* Six boxes, one digit each: typing moves on, Backspace moves back, a paste fills them all. */
function CodeBoxes({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus()
  const put = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '')
    if (!typed) return
    /* Never leave a gap: a digit typed past the end lands at the end. */
    const at = Math.min(i, value.length)
    const next = [...digits]
    typed.slice(0, 6 - at).split('').forEach((c, k) => (next[at + k] = c))
    onChange(next.join(''))
    focus(at + typed.length)
  }
  return (
    <div className="bmu__codes" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="bmu__codebox"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          value={d}
          aria-label={`Digit ${i + 1}`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => put(i, e.target.value)}
          onPaste={(e) => {
            e.preventDefault()
            put(0, e.clipboardData.getData('text'))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              const at = d ? i : i - 1
              if (at < 0) return
              onChange(value.slice(0, at) + value.slice(at + 1))
              focus(at)
            } else if (e.key === 'ArrowLeft') focus(i - 1)
            else if (e.key === 'ArrowRight') focus(i + 1)
          }}
        />
      ))}
    </div>
  )
}

export function UserMethodCard({
  m,
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
  /* SMS, call and email send to what is on the profile: nothing to set up here, only to switch on. */
  const fromProfile = profileFieldsFor(m.id) !== null

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
          {fromProfile ? (
            ready ? (
              <div className="bm8__ctlrow">
                <Toggle checked={isActive} onChange={onActivate} label={`Use ${m.name}`} />
              </div>
            ) : (
              <span className="bmu__hint">Not on your profile</span>
            )
          ) : ready ? (
            <div className="bm8__ctlrow">
              {!nothingToSetUp && !adminIssued && (
                <IconButton icon={Settings} size="sm" tone="ghost" label={`Edit ${m.name}`} onClick={() => onOpen(!open)} />
              )}
              <Toggle checked={isActive} onChange={onActivate} label={`Use ${m.name}`} />
            </div>
          ) : adminIssued ? (
            <span className="bmu__hint">{shape.note}</span>
          ) : (
            <Button variant="link" size="sm" onClick={() => onOpen(!open)}>
              Configure
              <span className="u-sr-only"> {m.name}</span>
            </Button>
          )}
        </div>
      </div>

      {open && !adminIssued && !fromProfile && (
        <div className="bmu__form">
          <EnrolForm
            methodId={m.id}
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

export function EnrolForm({
  shape,
  draft,
  onDraft,
  questions,
  onCancel,
  onSave,
  bare = false,
  methodId = '',
}: {
  shape: EnrolShape
  draft: Record<string, string>
  onDraft: (key: string, value: string) => void
  questions: number
  onCancel: () => void
  onSave: () => void
  /** The slider holds Cancel and Save in its footer: none under the fields. */
  bare?: boolean
  /** The method it is for: the apps and tokens each have their own steps. */
  methodId?: string
}) {
  const uid = useId()
  const { showToast: toast } = useBrand()
  const issue = enrolIssue(shape.kind, draft, questions, shape.setup)
  const value = (k: string) => (draft[k] ?? '').trim()
  /* Said only once something is typed: a blank field is not wrong, it is not done yet. */
  const emailError = value('email') && !isEmail(value('email')) ? EMAIL_ERROR : null
  const phoneError = value('phone') && !isPhone(value('phone')) ? PHONE_ERROR : null

  const footer = (saveLabel = 'Save') => bare ? null : (
    <div className="bmu__foot">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="brand" size="sm" disabled={issue !== null} onClick={onSave}>
        {saveLabel}
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

    case 'push-app':
    case 'authenticator': {
      if (shape.setup === 'unavailable') {
        return (
          <>
            <p className="bmu__hint">{shape.note}</p>
            <div className="bmu__foot">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Close
              </Button>
            </div>
          </>
        )
      }
      const flow = APP_FLOW[methodId] ?? APP_FLOW['google-auth']
      return (
        <>
          <Steps>
            <Step
              n={1}
              title={`Install ${flow.app}`}
              aside={
                <span className="bmu__stores">
                  {flow.stores.map((p) => (
                    <Button key={p} variant="secondary" size="sm" icon={p === 'Windows' ? Monitor : Smartphone} onClick={() => toast(`${p} download is not live in this prototype.`)}>
                      {p}
                    </Button>
                  ))}
                </span>
              }
            />
            <Step n={2} title={flow.secret ? 'Scan the QR code, or enter the key' : 'Scan the QR code'}>
              <div className="bmu__scan">
                {/* A drawn stand-in, not a real code. A prototype that renders a
                    scannable QR is a prototype that enrolls a real device. */}
                <span className="bmu__qr" aria-hidden>
                  <QrCode size={88} strokeWidth={1.1} />
                </span>
                {flow.secret && <SecretKey value={DUMMY_SECRET} />}
              </div>
            </Step>
            {!shape.setup && (
              <Step
                n={3}
                title="Enter the 6-digit code"
              >
                <CodeBoxes value={draft.code ?? ''} label={`Code from ${flow.app}`} onChange={(v) => onDraft('code', v)} />
              </Step>
            )}
          </Steps>
          {/* The live page registers a scan by itself; a prototype has nothing to watch for it, so the press says it. */}
          {footer(shape.setup ? 'Confirm registration' : 'Save')}
        </>
      )
    }

    case 'token': {
      /* RSA is not a serial you type: three steps, and a test that your admin set you up (live page, 7 Oct 2026). */
      if (methodId === 'rsa') {
        return (
          <>
            <Steps>
              <Step n={1}>
                <p className="bmu__hint">Make sure you are registered and present in the RSA Authentication Manager.</p>
              </Step>
              <Step n={2}>
                <p className="bmu__hint">Confirm if admin has configured the MFA for you.</p>
              </Step>
              <Step n={3}>
                <p className="bmu__hint">Test whether RSA Authenticator (SecurID) is configured for your account, then save.</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    onDraft('serial', 'tested')
                    toast('RSA Authenticator (SecurID) is configured for your account.')
                  }}
                >
                  Click here to test if MFA is configured for me
                </Button>
              </Step>
            </Steps>
            {footer()}
          </>
        )
      }
      return (
        <>
          <Steps>
            <Step n={1}>
              <p className="bmu__hint">Insert your Hardware Token into a USB port.</p>
            </Step>
            <Step n={2}>
              <p className="bmu__hint">Click on Enter Your OTP field, and touch the Hardware Token button.</p>
            </Step>
            <Step n={3}>
              <p className="bmu__hint">When the OTP is entered in the field below, click on Save to save the configuration.</p>
              <label className="bmu__field">
                <span>Add {tokenName(methodId)}</span>
                <input value={draft.serial ?? ''} placeholder="Enter your OTP" onChange={(e) => onDraft('serial', e.target.value)} />
              </label>
            </Step>
          </Steps>
          {footer()}
        </>
      )
    }

    case 'passkey':
      /* Two kinds of authenticator, as the live page groups them; one picked, then Add device. */
      return (
        <>
          {PASSKEY_GROUPS.map((g) => (
            <section key={g.title} className="bmu__pkgroup">
              <h4>{g.title}</h4>
              <p className="bmu__hint">{g.blurb}</p>
              <div className="bmu__pkopts" role="radiogroup" aria-label={g.title}>
                {g.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={draft.device === o}
                    className={`bmu__pkopt${draft.device === o ? ' is-on' : ''}`}
                    onClick={() => onDraft('device', o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {footer('Add device')}
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

/* What the profile holds for the methods in this panel, read only (owner, 7 Oct 2026: "a card with the email and the
   phone number in a non-editable format"). One card for the panel: the fields its methods send to, each with what is
   on file, or "Not added". Changing them is on the profile page, not here. */
export function ProfileFacts({ methods }: { methods: readonly Pick<AuthMethod, 'id'>[] }) {
  const fields = [...new Set(methods.flatMap((m) => profileFieldsFor(m.id) ?? []))] as ProfileField[]
  if (fields.length === 0) return null
  return (
    <section className="bmu__profile" aria-label="From your profile">
      <h3 className="bmu__profilehead">From your profile</h3>
      <dl className="bmu__profilegrid">
        {fields.map((k) => (
          <div key={k}>
            <dt>{PROFILE_LABEL[k]}</dt>
            <dd className={PROFILE[k] ? undefined : 'is-empty'}>{PROFILE[k] || 'Not added'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
