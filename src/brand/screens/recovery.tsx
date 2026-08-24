/* -----------------------------------------------------------------------------
   Recovery, and the method mark.

   What is left of what used to be AuthMethodsV5.tsx. That file held a whole
   five-tab screen plus these two pieces, and the screen was one of five
   alternatives kept side by side while the direction was being chosen. The
   direction is chosen — the categories screen is it — so the alternatives are
   gone and only the parts the survivor actually renders are still here.

   Both are genuinely shared rather than left over. `RecoveryTab` is the one tab
   the brief left alone ("recovery is fine as we have in v5"), so the honest way
   to keep it identical is to render the same component rather than reimplement
   it and hope the two stay in step. `MethodIcon` is the vendor mark, and a
   method should look the same wherever it appears.
   -------------------------------------------------------------------------- */

import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import {
  Check,
  CreditCard,
  Fingerprint,
  HelpCircle,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  Ticket,
  type LucideIcon,
} from 'lucide-react'

import { TipDot, Toggle } from '../kit'
import { methodBlocker, type AuthMethod } from '../methods'

/* -----------------------------------------------------------------------------
   V5 · MFA experience.

   A faithful rebuild of the V5 variant on the deployed prototype, read off its
   own DOM rather than from a screenshot: three tiers on the Methods tab and
   lettered sections on Recovery. Spec and the capture it came from are in
   docs/v5-mfa-experience.md.

   Two things about the rebuild are worth stating plainly.

   V5 groups methods into three tiers where our catalogue carries four. The
   mapping is not a guess — Standard MFA is our App-based plus Delivery-based,
   and Fallback & Recovery is Knowledge & tokens — but it is a lossy one, so the
   original tier is still shown on each card rather than thrown away.

   V5 has no Method Sets tab, and this rebuild no longer adds one — the other
   version owns that editor, and two screens both claiming to be where sets are
   edited is worse than one screen not having them.
   -------------------------------------------------------------------------- */

/* Three tabs. Method Sets and Enrollment were dropped: the first duplicated a
   surface the other version already owns, and rendering the same editor twice
   meant two screens both claiming to be where sets are edited. Enrollment went
   with it — it configured how users join methods, which is a different job from
   deciding which methods exist. */
/* --- Method identity --------------------------------------------------------
   A real logo where a real vendor exists, and a channel icon everywhere else.

   Deliberately not a logo for all of them: there is no "SMS logo" or "security
   questions logo", and inventing a mark for a delivery channel would be
   decoration pretending to be identification. The vendors we genuinely ship
   logos for are miniOrange, Google and Microsoft; the rest get an icon that
   says what the channel is, which is the honest amount of information.

   Shared by every tab, so a method looks the same wherever it appears. */
const VENDOR_LOGO: { match: RegExp; src: string; name: string }[] = [
  {
    match: /minioranges?|mo /i,
    src: '/logos/miniorange.png',
    name: 'miniOrange',
  },
  { match: /google/i, src: '/logos/google.ico', name: 'Google' },
  { match: /microsoft/i, src: '/logos/m365.ico', name: 'Microsoft' },
]

const CHANNEL_ICON: { match: RegExp; icon: LucideIcon }[] = [
  { match: /passkey|fido|webauthn|biometric/i, icon: Fingerprint },
  { match: /smart ?card|cac|piv/i, icon: CreditCard },
  { match: /sms|text/i, icon: MessageSquare },
  { match: /email|mail/i, icon: Mail },
  { match: /call|voice|phone/i, icon: Phone },
  { match: /question|kba|grid/i, icon: HelpCircle },
  { match: /token|yubikey|display|hardware/i, icon: KeyRound },
  { match: /push|authenticator|otp|totp|qr/i, icon: Smartphone },
]

export function MethodIcon({ name, size = 24 }: { name: string; size?: number }) {
  const vendor = VENDOR_LOGO.find((v) => v.match.test(name))
  if (vendor) {
    return (
      <img
        className="bv5__mico bv5__mico--logo"
        src={vendor.src}
        alt=""
        aria-hidden
        loading="lazy"
        width={size}
        height={size}
        /* Sized by style, not by the width/height attributes alone. Attributes
           are presentational hints and lose to `.bv5__mico`s own width, so a
           logo asked for at 30px rendered at the class default of 26 next to a
           30px icon — which is why every list here kept needing its own size
           override. */
        style={{ width: size, height: size }}
        title={vendor.name}
      />
    )
  }
  const Ico = CHANNEL_ICON.find((c) => c.match.test(name))?.icon ?? ShieldCheck
  return (
    <span className="bv5__mico" aria-hidden style={{ width: size, height: size }}>
      <Ico size={Math.round(size * 0.68)} strokeWidth={1.8} />
    </span>
  )
}

/* Three options, and what actually separates them is how much proof each one
   asks for. That was buried in a sentence per row; it is a pill now, and the
   sentence is on the tip for anyone who wants the mechanics. */
const RECOVERY_OPTIONS: {
  id: string
  name: string
  sub: string
  icon: LucideIcon
}[] = [
  {
    id: 'kba',
    name: 'Security Questions',
    sub: 'Users answer the knowledge-based questions they configured at enrolment.',
    icon: HelpCircle,
  },
  {
    id: 'email',
    name: 'OTP over Alternate Email',
    sub: 'A one-time code sent to the backup email address on the account.',
    icon: Mail,
  },
  {
    id: 'both',
    /* Named by what it IS, not by its relationship to the two above it.

       "Both together" only means something if you have just read the other two
       options and still remember them — it is a word about the LIST rather than
       about the thing, so the one option that asks the most of a locked-out
       user was also the one whose label said the least. */
    name: 'Questions and email code',
    sub: 'Questions and a code from the backup address. The hardest to social-engineer, and the slowest for a locked-out user.',
    icon: ShieldCheck,
  },
]

/* One tone per vendor family, so a column of types is scannable rather than
   three near-identical grey pills. */
/* Exported so the final version can render it rather than own a second copy.

   Recovery is the one tab the brief left alone — "recovery is fine as we have
   in v5" — so the honest way to keep it identical is to render the same
   component, not to reimplement it and hope the two stay in step. */
/* The three kinds of security code, which the console offers as "Allow Static
   Long Lived Codes / Allow One-Time Backup Code / Allow Both Codes Types".

   Renamed on the same principle as the two switches above them: the console's
   labels lead with "Allow", so the three read as a column of Allows and the
   word that distinguishes them lands fourth. What actually separates them is
   whether a code survives being used, so that is what the label says and the
   sentence underneath explains what it costs.

   "Long lived" is kept out of the name deliberately — it describes the code's
   lifetime, and the thing an admin is choosing is its reusability. A code that
   is long lived and single use is a different product. */
const CODE_KINDS: { id: string; name: string; sub: string; icon: LucideIcon }[] = [
  {
    id: 'static',
    name: 'A reusable code',
    sub: 'One code per user that keeps working until an admin revokes it. Easiest to support, and the one worth stealing.',
    icon: KeyRound,
  },
  {
    id: 'once',
    name: 'One-time codes',
    sub: 'A printed set, each of which stops working the moment it is used. Safer, and users run out.',
    icon: Ticket,
  },
  {
    id: 'both',
    /* Same fix as the recovery-method row above: say the two things. */
    name: 'Reusable and one-time',
    sub: 'Users get a reusable code and a one-time set, and may sign in with either.',
    icon: ShieldCheck,
  },
]

export function RecoveryTab({ methods }: { methods: AuthMethod[] }) {
  /* Everything off to begin with.

     These three shipped on, which meant a tenant that had never opened this tab
     was already letting people recover an account and sign in with a static
     code — a self-service path to a live account, switched on by a default
     nobody chose. Recovery is a deliberate decision in both directions, so the
     starting position is the one that grants nothing.

     `choice` and `codeKind` stay seeded: they are what the section shows once
     its switch is on, and a revealed section with nothing selected is a second
     empty decision rather than a safer one. */
  const [forgot, setForgot] = useState(false)
  const [choice, setChoice] = useState('kba')
  const [userPick, setUserPick] = useState(false)
  const [codes, setCodes] = useState(false)
  const [codeKind, setCodeKind] = useState('static')

  const kba = methods.find((m) => m.id === 'kba' || m.name.startsWith('Security Question'))
  const kbaOn = kba ? !methodBlocker(kba) : false

  return (
    <div className="bv5__pane">
      <Section letter="A" title="Recovery method">
        <Row
          name="Enable Forgot Phone"
          desc="Let users recover access when they can't use their enrolled device."
          on={forgot}
          onChange={setForgot}
        />
        {forgot && (
          <>
            {/* Three cards across, not three rows down.

                Stacked full-width rows spent a third of the section's height on
                the whitespace either side of three short labels, and made a
                choice between three peers read as a list you work through. Side
                by side they are what they are — three alternatives, compared at
                a glance. The pattern is settled: Descript, User Interviews and
                Sprig all lay a small mutually-exclusive choice out this way, and
                all of them let the card's own border carry the selection rather
                than pairing every card with a radio dot. */}
            <div className="bv5__radios" role="radiogroup" aria-label="Recovery method">
              {RECOVERY_OPTIONS.map((o) => {
                const needsKba = o.id !== 'email'
                const blocked = needsKba && !kbaOn
                const on = choice === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={blocked}
                    className={`bv5__radio ${on ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`}
                    onClick={() => setChoice(o.id)}
                    title={
                      blocked
                        ? `${o.sub} Needs Security Questions, which is switched off in Methods.`
                        : o.sub
                    }
                  >
                    <span className="bv5__radio-ico" aria-hidden>
                      <o.icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="bv5__radio-body">
                      <strong>{o.name}</strong>
                    </span>
                    {/* The tick is the only thing that moves. It lands on the
                        card you picked, so the choice registers as an event
                        rather than as two cards quietly swapping tints.

                        One corner, one badge. A card can be both selected and
                        blocked — the saved choice stays put when Security
                        Questions goes off in Methods — and in that state the
                        lock is the fact that matters, so it takes the corner
                        and the border alone carries the selection. */}
                    <AnimatePresence initial={false}>
                      {on && !blocked && (
                        <motion.span
                          className="bv5__radio-tick"
                          aria-hidden
                          initial={{ scale: 0.3, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.3, opacity: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 700,
                            damping: 32,
                          }}
                        >
                          <Check size={11} strokeWidth={3.2} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {blocked && (
                      <span className="bv5__radio-lock" aria-hidden>
                        <Lock size={11} strokeWidth={2.2} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Only when it is a problem.

                This used to state the dependency in whichever direction held,
                so a correctly configured tenant carried a green line reporting
                that nothing was wrong — a permanent confirmation is noise, and
                it made the one case that matters look like more of the same.
                The off state stays, because without it the two KBA options are
                greyed out with no reason given. */}
            {!kbaOn && (
              <p className="bv5__dep is-warn">
                <Lock size={13} strokeWidth={2.2} aria-hidden />
                Security Questions is <strong>off</strong> in Methods
                <TipDot text="Both KBA options depend on it. Switch Security Questions on in Methods to use either one." />
              </p>
            )}
          </>
        )}
      </Section>

      {/* Both switches were "Enable end users to ..." — same six words, then the
          part that differs, arriving last. A column of two reads as one
          sentence repeated, and neither is scannable. They lead with the verb
          that separates them now, and each says what the user gets rather than
          what the checkbox does. */}
      <Section letter="B" title="What users can do for themselves" last>
        <Row
          name="Let users choose their recovery method"
          desc="Without this, everyone gets the method selected above. With it, users pick from the ones you allow."
          on={userPick}
          onChange={setUserPick}
        />
        <Row
          name="Let users sign in with a security code"
          desc="A code issued ahead of time, for when the enrolled device is not to hand."
          on={codes}
          onChange={setCodes}
        />

        {/* The console pairs this switch with three radios and we had the
            switch alone — so "security codes" meant whichever kind the reader
            assumed, and the stats below silently reported only one of them. */}
        {codes && (
          <div className="bv5__radios" role="radiogroup" aria-label="Kind of security code">
            {CODE_KINDS.map((k) => {
              const on = codeKind === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`bv5__radio ${on ? 'is-on' : ''}`}
                  title={k.sub}
                  onClick={() => setCodeKind(k.id)}
                >
                  <span className="bv5__radio-ico" aria-hidden>
                    <k.icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="bv5__radio-body">
                    <strong>{k.name}</strong>
                  </span>
                  {on && (
                    <span className="bv5__radio-tick" aria-hidden>
                      <Check size={11} strokeWidth={3.2} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

      </Section>
    </div>
  )
}

/* --- Shared bits ------------------------------------------------------------ */

function Section({
  letter,
  title,
  children,
  last,
}: {
  letter: string
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <section className={`bv5__sec ${last ? 'is-last' : ''}`}>
      <p className="bv5__seclabel">
        <span>{letter}</span> {title}
      </p>
      <div className="bv5__seccard">{children}</div>
    </section>
  )
}

/* The setting, and nothing else on the line.

   Every row carried a sentence explaining itself, which on a page of eight rows
   is eight sentences competing with the eight controls they describe. The
   sentence is not deleted — it is one gesture away on the name, where somebody
   who needs it will look and somebody who does not will not read it. */
function Row({
  name,
  desc,
  on,
  onChange,
}: {
  name: string
  desc: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="bv5__row">
      <span className="bv5__rn">
        {name}
        <TipDot text={desc} />
      </span>
      <Toggle checked={on} onChange={onChange} label={name} />
    </div>
  )
}
