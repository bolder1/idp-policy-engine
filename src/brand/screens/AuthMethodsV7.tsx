import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Fingerprint,
  Grid3x3,
  HelpCircle,
  KeyRound,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  UserCog,
  UsbIcon,
} from 'lucide-react'

import { Toggle, TipDot } from '../kit'
import { useBrand } from '../store'
import {
  ADMIN_SETTINGS,
  ALTERNATE_SETTINGS,
  FAMILIES,
  SOURCE_LABEL,
  type GeneralSetting,
  type MfaFamily,
  type MfaMethod,
  type MfaSetting,
} from '../mfa-settings'

/* -----------------------------------------------------------------------------
   V7 — families, from the settings sheet.

   The previous versions all rendered one flat list of twenty-one methods. The
   sheet says that is the wrong unit: it groups by family, and the options it
   wants migrated are attached to families, not to methods. "Send Authenticator
   QR code via Email" is listed against Google, Microsoft, Microsoft Push and
   Authy — four rows, one setting — and the Suggestions column says in as many
   words to move it under the Authenticator settings.

   A flat list has nowhere to put a shared setting except on each method that
   shares it. That is how the old drawer ended up with the same checkbox four
   times, and it is most of why the forms read badly: a form that repeats itself
   is a form nobody believes.

   So: eleven families in a rail, one family open at a time, and each setting
   rendered exactly once at the level it actually belongs to. Family settings sit
   above the methods and say they apply to all of them; the two that genuinely
   belong to one method — miniOrange Push's biometric and number matching — sit
   under that method and nowhere else.

   --- Where the default method went, and why -----------------------------------

   The sheet leaves this open: *"Can have a separate section OR can give this
   option under specific mfa methods setting"*. It is a separate section here.

   Put it inside a method's settings and the control's location depends on the
   answer: to change the default from SMS to Email you must first know it is
   currently SMS, open SMS, and turn something off there. The setting is a
   property of the tenant — exactly one method holds it — so it belongs
   somewhere that does not move. It is the first thing on the page, above the
   families, with the eligible methods shown as options rather than hidden in a
   select.
   -------------------------------------------------------------------------- */

const FAMILY_ICON: Record<string, typeof KeyRound> = {
  sms: MessageSquare,
  email: Mail,
  authenticator: Smartphone,
  miniorange: Sparkles,
  call: Phone,
  hardware: UsbIcon,
  kba: HelpCircle,
  grid: Grid3x3,
  smartcard: KeyRound,
  rsa: ShieldCheck,
  biometric: Fingerprint,
}

type RailId = string | 'general'

export function AuthMethodsV7() {
  const store = useBrand()
  const reduce = useReducedMotion()

  /* Which methods are on. Seeded from the families so the screen starts in a
     believable state rather than all-off. */
  const [on, setOn] = useState<Set<string>>(
    () => new Set(['sms-otp', 'email-otp', 'google-auth', 'ms-auth', 'mo-otp', 'mo-push', 'passkey']),
  )
  const [values, setValues] = useState<Record<string, string | number | boolean>>({})
  const [defaultId, setDefaultId] = useState('email-otp')
  const [userPicks, setUserPicks] = useState(true)
  const [sel, setSel] = useState<RailId>('sms')

  const family = FAMILIES.find((f) => f.id === sel) ?? null
  const countOn = (f: MfaFamily) => f.methods.filter((m) => on.has(m.id)).length

  const toggle = (id: string) =>
    setOn((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* Only methods that need no prior enrolment can be a tenant-wide default, and
     only ones that are switched on. Both filters are real: a default nobody has
     enrolled in is a default that cannot fire. */
  const defaultable = useMemo(
    () => FAMILIES.flatMap((f) => f.methods.filter((m) => m.canBeDefault && on.has(m.id)).map((m) => ({ m, f }))),
    [on],
  )

  return (
    <div className="bpage bm7">
      <header className="bm7__head">
        <div>
          <h1>Authentication methods</h1>
          <p>
            Which second factors this tenant offers, and how each one behaves. Grouped the way the settings are
            grouped — shared options live on the family, not repeated on every method that reads them.
          </p>
        </div>
      </header>

      {/* --- The default. First, and not inside anything. ------------------- */}
      <section className="bm7__default">
        <div className="bm7__defhead">
          <span className="bm7__defico" aria-hidden>
            <Star size={16} strokeWidth={1.9} />
          </span>
          <div>
            <h2>Default method</h2>
            <p>Used before a user has enrolled in anything, and whenever a policy rule does not name one.</p>
          </div>
        </div>

        {defaultable.length === 0 ? (
          <p className="bm7__defnone">
            Nothing eligible is switched on. A default has to work with no prior enrolment, so it can only be a method
            that delivers a code to something already on the account.
          </p>
        ) : (
          <div className="bm7__picks" role="radiogroup" aria-label="Default authentication method">
            {defaultable.map(({ m, f }) => {
              const Ico = FAMILY_ICON[f.id] ?? KeyRound
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={defaultId === m.id}
                  className={`bm7__pick ${defaultId === m.id ? 'is-on' : ''}`}
                  onClick={() => setDefaultId(m.id)}
                >
                  <Ico size={16} strokeWidth={1.8} aria-hidden />
                  <span>
                    <strong>{m.name}</strong>
                    <em>{f.name}</em>
                  </span>
                  {defaultId === m.id && (
                    <span className="bm7__picktick" aria-hidden>
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <label className="bm7__defrow">
          <span>
            Let users choose a different method at sign-in
            <TipDot text="With this off, everybody gets the default and nothing else — including users who have enrolled in something stronger." />
          </span>
          <Toggle checked={userPicks} onChange={setUserPicks} label="Let users choose at sign-in" size="sm" />
        </label>
      </section>

      <div className="bm7__work">
        <nav className="bm7__rail" aria-label="Method families">
          {FAMILIES.map((f) => {
            const Ico = FAMILY_ICON[f.id] ?? KeyRound
            const n = countOn(f)
            return (
              <button
                key={f.id}
                type="button"
                aria-current={sel === f.id}
                className={`bm7__railitem ${sel === f.id ? 'is-on' : ''}`}
                onClick={() => setSel(f.id)}
              >
                <Ico size={16} strokeWidth={1.8} aria-hidden />
                <span>{f.name}</span>
                <em className={n > 0 ? 'is-on' : ''}>
                  {n}/{f.methods.length}
                </em>
              </button>
            )
          })}

          <span className="bm7__railsep" aria-hidden />
          <button
            type="button"
            aria-current={sel === 'general'}
            className={`bm7__railitem ${sel === 'general' ? 'is-on' : ''}`}
            onClick={() => setSel('general')}
          >
            <UserCog size={16} strokeWidth={1.8} aria-hidden />
            <span>General</span>
          </button>
        </nav>

        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={String(sel)}
            className="bm7__pane"
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
          >
            {sel === 'general' ? (
              <GeneralPane values={values} setValues={setValues} />
            ) : family ? (
              <FamilyPane
                family={family}
                on={on}
                toggle={toggle}
                values={values}
                setValues={setValues}
                defaultId={defaultId}
                onOpenRsa={() => store.showToast('RSA settings open in their own modal')}
              />
            ) : null}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* --- One family ---------------------------------------------------------------
   Shared settings above, methods below. The order is the argument: you read what
   is true of the whole family once, then the list of ways it can be used. */

function FamilyPane({
  family,
  on,
  toggle,
  values,
  setValues,
  defaultId,
  onOpenRsa,
}: {
  family: MfaFamily
  on: Set<string>
  toggle: (id: string) => void
  values: Record<string, string | number | boolean>
  setValues: (v: Record<string, string | number | boolean>) => void
  defaultId: string
  onOpenRsa: () => void
}) {
  const anyOn = family.methods.some((m) => on.has(m.id))

  return (
    <>
      <header className="bm7__phead">
        <div>
          <h2>{family.name}</h2>
          <p>{family.blurb}</p>
        </div>
      </header>

      {family.settings && family.settings.length > 0 && (
        <div className="bm7__shared">
          <h3>
            Applies to all {family.methods.length} {family.name.toLowerCase()} method
            {family.methods.length === 1 ? '' : 's'}
          </h3>
          {/* Dimmed rather than hidden when nothing in the family is on: the
              settings still exist and are still what will apply, and hiding them
              would make switching a method on feel like it invented options. */}
          <div className={`bm7__fields ${anyOn ? '' : 'is-inert'}`}>
            {family.settings.map((s) => (
              <Field key={s.id} setting={s} values={values} setValues={setValues} disabled={!anyOn} />
            ))}
          </div>
        </div>
      )}

      <div className="bm7__methods">
        {family.methods.map((m) => (
          <MethodRow
            key={m.id}
            method={m}
            on={on.has(m.id)}
            isDefault={defaultId === m.id}
            onToggle={() => toggle(m.id)}
            values={values}
            setValues={setValues}
          />
        ))}
      </div>

      {family.id === 'rsa' && (
        <button type="button" className="bm7__link" onClick={onOpenRsa}>
          Open RSA settings
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </button>
      )}

      {family.note && (
        <p className="bm7__note">
          <Sparkles size={12} strokeWidth={2} aria-hidden />
          {family.note}
        </p>
      )}
    </>
  )
}

function MethodRow({
  method,
  on,
  isDefault,
  onToggle,
  values,
  setValues,
}: {
  method: MfaMethod
  on: boolean
  isDefault: boolean
  onToggle: () => void
  values: Record<string, string | number | boolean>
  setValues: (v: Record<string, string | number | boolean>) => void
}) {
  const empty = method.balance && method.balance.remaining === 0
  return (
    <div className={`bm7__method ${on ? 'is-on' : ''}`}>
      <div className="bm7__mrow">
        <span className="bm7__mname">
          {method.name}
          {isDefault && <i className="bm7__badge is-default">Default</i>}
          {empty && (
            <i className="bm7__badge is-empty">
              <AlertTriangle size={10} strokeWidth={2.4} aria-hidden />
              Out of {method.balance!.label.replace(/\s*transactions$/i, '')}
            </i>
          )}
        </span>
        <span className="bm7__mblurb">{method.blurb}</span>
        <span className="bm7__mtier">{method.tier}</span>
        <span className="bm7__menrolled">{method.enrolled ? method.enrolled.toLocaleString() : '—'}</span>
        <Toggle checked={on} onChange={onToggle} label={method.name} size="sm" />
      </div>

      {/* Method-level settings only appear when the method is on — unlike the
          family block, these have no meaning at all for a method nobody uses. */}
      <AnimatePresence initial={false}>
        {on && method.settings && method.settings.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="bm7__fields is-nested">
              {method.settings.map((s) => (
                <Field key={s.id} setting={s} values={values} setValues={setValues} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- The form ----------------------------------------------------------------
   One row per setting: the label and its one line of help on the left, the
   control on the right, and a chip saying where the option is moving from. The
   previous forms were a column of unlabelled inputs of guessable type; this is
   the same information with the two facts that were missing — what the control
   does, and why it has appeared somewhere new. */

function Field({
  setting,
  values,
  setValues,
  disabled,
}: {
  setting: MfaSetting
  values: Record<string, string | number | boolean>
  setValues: (v: Record<string, string | number | boolean>) => void
  disabled?: boolean
}) {
  const f = setting.field
  const raw = values[setting.id]
  const put = (v: string | number | boolean) => setValues({ ...values, [setting.id]: v })

  const numeric = f.kind === 'number' ? Number(raw ?? f.value) : 0
  const warn = f.kind === 'number' && f.warnAbove && numeric > f.warnAbove.value ? f.warnAbove.why : null

  return (
    <div className={`bm7__field ${disabled ? 'is-disabled' : ''}`}>
      <div className="bm7__flabel">
        <span>
          {setting.label}
          {setting.source && <i className="bm7__src">{SOURCE_LABEL[setting.source]}</i>}
        </span>
        {setting.help && <em>{setting.help}</em>}
      </div>

      <div className="bm7__fctl">
        {f.kind === 'toggle' && (
          <Toggle
            checked={Boolean(raw ?? f.value)}
            onChange={put}
            label={setting.label}
            size="sm"
            disabled={disabled}
          />
        )}

        {f.kind === 'text' && (
          <input
            type="text"
            className="bm7__text"
            value={String(raw ?? f.value)}
            placeholder={f.placeholder}
            aria-label={setting.label}
            onChange={(e) => put(e.target.value)}
          />
        )}

        {f.kind === 'number' && (
          <span className="bm7__num">
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={numeric}
              disabled={disabled}
              aria-label={setting.label}
              onChange={(e) => put(Number(e.target.value))}
            />
            {f.unit}
          </span>
        )}

        {f.kind === 'choice' && (
          <span className="bm7__seg" role="radiogroup" aria-label={setting.label}>
            {f.options.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={(raw ?? f.value) === o}
                disabled={disabled}
                className={(raw ?? f.value) === o ? 'is-on' : ''}
                onClick={() => put(o)}
              >
                {o}
              </button>
            ))}
          </span>
        )}
      </div>

      {/* Straight out of the sheet, and the reason the field is a warning rather
          than a hard cap: it is only true for tenants fronting RADIUS. */}
      {warn && (
        <p className="bm7__warn">
          <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
          {warn}
        </p>
      )}
    </div>
  )
}

/* --- General ------------------------------------------------------------------
   The sheet's trailing block: settings that govern the second factor rather than
   any one way of proving it. */

function GeneralPane({
  values,
  setValues,
}: {
  values: Record<string, string | number | boolean>
  setValues: (v: Record<string, string | number | boolean>) => void
}) {
  return (
    <>
      <header className="bm7__phead">
        <div>
          <h2>General</h2>
          <p>Settings that apply to the second factor as a whole, whichever method a user ends up using.</p>
        </div>
      </header>

      <div className="bm7__shared">
        <h3>Alternate login</h3>
        <div className="bm7__fields">
          {ALTERNATE_SETTINGS.map((s) => (
            <GeneralField key={s.id} setting={s} values={values} setValues={setValues} />
          ))}
        </div>
      </div>

      <div className="bm7__shared">
        <h3>Administrators</h3>
        <div className="bm7__fields">
          {ADMIN_SETTINGS.map((s) => (
            <GeneralField key={s.id} setting={s} values={values} setValues={setValues} />
          ))}
        </div>
      </div>

      <p className="bm7__note">
        <Sparkles size={12} strokeWidth={2} aria-hidden />
        Hardware token assignment and static code generation stay as their own sections under 2FA, which is what the
        sheet recommends.
      </p>
    </>
  )
}

function GeneralField({
  setting,
  values,
  setValues,
}: {
  setting: GeneralSetting
  values: Record<string, string | number | boolean>
  setValues: (v: Record<string, string | number | boolean>) => void
}) {
  return (
    <div className="bm7__field">
      <div className="bm7__flabel">
        <span>
          {setting.label}
          {setting.source && <i className="bm7__src">{SOURCE_LABEL[setting.source]}</i>}
        </span>
        {setting.help && <em>{setting.help}</em>}
      </div>
      <div className="bm7__fctl">
        <Toggle
          checked={Boolean(values[setting.id] ?? setting.value)}
          onChange={(v) => setValues({ ...values, [setting.id]: v })}
          label={setting.label}
          size="sm"
        />
      </div>
    </div>
  )
}

