import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Ban, Check, ChevronLeft, ChevronRight, Fingerprint, KeyRound, Lock, Mail, QrCode, RotateCw, Smartphone, CreditCard } from 'lucide-react'

import { initials } from '../../../data'
import { AppLogo } from '../../../logos/AppLogo'
import { EASE_OUT, PRESS, PRESS_T, isPressing, usePlay, useTyped } from './play-state'
import { SIGN_IN_DOMAIN, type FieldKey, type Page, type Remember, type Sheet, type WaitIcon } from './script'
import { BrowserSheet } from './Sheets'

/* -----------------------------------------------------------------------------
   The browser window: the tenant's sign-in page at mo.xecurify.com, the
   application's mark over every page, and the application's own home once
   the person is in — at an address of its own, as any browser shows one.
   The tenant does not know the application's real address, so it is a
   stand-in built from the application, and drawn quieter than the tenant's.

   A picture of somebody else's page, so every button on it is ink and none
   is a control: the tab order goes past it, and the stage says what it
   shows in one label (SignInPlayer). Motion owns every transform here —
   the page's slide, the press, the shake — and no rule in player.css gives
   these elements one.
   -------------------------------------------------------------------------- */

export function Browser({
  appId,
  appName,
  person,
  page,
  sheet,
  pageKey,
  covered,
}: {
  appId: string
  appName: string
  person: { name: string; email: string } | null
  page: Page
  sheet: Sheet | null
  /** Changes when the page does, so it slides in. */
  pageKey: string
  /** A phone or a key is in front of the browser's right side (player.css works out how much of it). */
  covered: boolean
}) {
  const { reduced } = usePlay()
  const home = page.kind === 'signed-in'
  return (
    <motion.div className="tpw" initial={false} animate={{ '--tp-in': covered ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.42, ease: EASE_OUT }}>
      <div className="tpw__bar">
        <ChevronLeft size={12} strokeWidth={2} aria-hidden className="tpw__nav" />
        <ChevronRight size={12} strokeWidth={2} aria-hidden className="tpw__nav" />
        <span className="tpw__url">
          <Lock size={10} strokeWidth={2.4} aria-hidden />
          <span className={`tpw__domain${home ? ' is-app' : ''}`}>{home ? appHostOf(appId) : SIGN_IN_DOMAIN}</span>
        </span>
      </div>
      <div className="tpw__view">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={home ? 'home' : 'sign-in'}
            className={`tpw__screen ${home ? 'is-home' : 'is-sign-in'}`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            {home ? (
              <AppHome appId={appId} appName={appName} person={person} />
            ) : (
              <div className="tpw__card">
                <div className="tpw__brand">
                  <AppLogo appId={appId} name={appName} size={18} />
                  <span>Sign in to {appName}</span>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={pageKey}
                    className="tpw__page"
                    initial={reduced ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 1 } : { opacity: 0, x: -12 }}
                    transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
                  >
                    <PageBody page={page} />
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence initial={false}>{sheet && <BrowserSheet key={sheet.kind} sheet={sheet} />}</AnimatePresence>
      </div>
    </motion.div>
  )
}

/** The application's home, as an address: a stand-in from its id ("hrms.app"). */
const appHostOf = (appId: string) => `${appId}.app`

// --- The pages -------------------------------------------------------------------------------

function PageBody({ page }: { page: Page }) {
  switch (page.kind) {
    case 'identify':
      return (
        <>
          <Field label="Username" field="username" value={page.username} />
          <Btn>Next</Btn>
        </>
      )
    case 'password':
      return (
        <>
          <Account email={page.username} />
          <Field label="Password" field="password" value={page.password} secret />
          <Btn>Sign in</Btn>
        </>
      )
    case 'passkey-start':
      return (
        <>
          <p className="tpw__ask">No password needed</p>
          <Btn icon={<Fingerprint size={14} strokeWidth={2} aria-hidden />}>Sign in with a passkey</Btn>
        </>
      )
    case 'code':
      return (
        <>
          <Heading title={page.title} ask={page.ask} />
          <CodeBoxes value={page.code} length={page.length} />
          <RememberBox remember={page.remember} />
          <Btn>Verify</Btn>
        </>
      )
    case 'wait':
      return (
        <>
          <Heading title={page.title} ask={page.ask} />
          {page.number && (
            <span className="tpw__number" aria-hidden>
              {page.number}
            </span>
          )}
          <Waiting icon={page.icon} done={page.done} />
          <RememberBox remember={page.remember} />
        </>
      )
    case 'qr':
      return (
        <>
          <p className="tpw__ask">{page.ask}</p>
          <span className={`tpw__qr${page.done ? ' is-done' : ''}`} aria-hidden>
            <QrCode size={56} strokeWidth={1.5} />
            {page.done && <Done />}
          </span>
          <RememberBox remember={page.remember} />
        </>
      )
    case 'questions':
      return (
        <>
          {page.items.map((q, i) => (
            <Field key={q.question} label={q.question} field={i === 0 ? 'answer-0' : 'answer-1'} value={q.answer} secret />
          ))}
          <RememberBox remember={page.remember} />
          <Btn>Verify</Btn>
        </>
      )
    case 'grid':
      return <Grid size={page.size} pattern={page.pattern} lit={page.lit} remember={page.remember} />
    case 'key-otp':
      return (
        <>
          <p className="tpw__ask">{page.ask}</p>
          <Field label="One-time key" field="otp" value={page.otp} mono />
          <RememberBox remember={page.remember} />
        </>
      )
    case 'continue':
      return (
        <>
          <Heading title={page.title} ask={page.ask} />
          <RememberBox remember={page.remember} />
          {page.done ? <Waiting icon="key" done /> : <Btn>{page.button}</Btn>}
        </>
      )
    case 'unavailable':
      return (
        <div className="tpw__end">
          <span className="tpw__mark is-neutral" aria-hidden>
            <Ban size={16} strokeWidth={2} />
          </span>
          <p className="tpw__h">{page.name} is not available</p>
          <p className="tpw__msg">Contact your administrator.</p>
          <span className="tpw__link">Back to sign in</span>
        </div>
      )
    case 'denied':
      return <Denied message={page.message} />
    case 'signed-in':
      return null
  }
}

function Heading({ title, ask }: { title: string; ask: string }) {
  return (
    <div className="tpw__heading">
      <p className="tpw__h">{title}</p>
      <p className="tpw__ask">{ask}</p>
    </div>
  )
}

function Field({ label, field, value, secret = false, mono = false }: { label: string; field: FieldKey; value: string; secret?: boolean; mono?: boolean }) {
  const { text, typing } = useTyped(field, value)
  return (
    <span className="tpw__field">
      <span className="tpw__label">{label}</span>
      <span className={`tpw__box${typing ? ' is-focus' : ''}${secret ? ' is-secret' : ''}${mono ? ' is-mono' : ''}`}>
        <span className="tpw__text">{text}</span>
        {typing && <span className="tpw__caret" aria-hidden />}
      </span>
    </span>
  )
}

function Account({ email }: { email: string }) {
  return (
    <span className="tpw__account">
      <span className="tpw__avatar is-sm" aria-hidden>
        {initials(email.split('@')[0].replace(/[._]/g, ' ') || '?')}
      </span>
      <span className="tpw__email">{email}</span>
    </span>
  )
}

/** An ink "button": a label, pressed by the film. */
function Btn({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  const p = usePlay()
  const pressing = isPressing(p, 'primary')
  return (
    <motion.span
      key={pressing ? p.key : 'still'}
      className={`tpw__btn${pressing ? ' is-pressed' : ''}`}
      initial={false}
      animate={pressing && !p.reduced ? PRESS : { scale: 1 }}
      transition={PRESS_T}
    >
      {icon}
      {children}
    </motion.span>
  )
}

function CodeBoxes({ value, length }: { value: string; length: number }) {
  const { text, typing } = useTyped('code', value)
  const { reduced } = usePlay()
  return (
    <span className="tpw__code" aria-hidden>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={`tpw__digit${typing && i === text.length ? ' is-focus' : ''}`}>
          {i < text.length && (
            <motion.span
              initial={reduced || !typing ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              {text[i]}
            </motion.span>
          )}
        </span>
      ))}
    </span>
  )
}

function RememberBox({ remember }: { remember: Remember | null }) {
  const p = usePlay()
  if (!remember) return null
  const ticking = p.action?.kind === 'tick'
  return (
    <span className={`tpw__remember${remember.ticked ? ' is-on' : ''}`}>
      <motion.span
        key={ticking ? p.key : 'still'}
        className="tpw__tick"
        initial={false}
        animate={ticking && !p.reduced ? PRESS : { scale: 1 }}
        transition={PRESS_T}
        aria-hidden
      >
        {remember.ticked && <Check size={10} strokeWidth={3} />}
      </motion.span>
      Don’t ask again on this device for {remember.days} days
    </span>
  )
}

const WAIT_ICON: Record<WaitIcon, typeof Smartphone> = { phone: Smartphone, mail: Mail, key: KeyRound, fingerprint: Fingerprint, card: CreditCard }

function Waiting({ icon, done }: { icon: WaitIcon; done: boolean }) {
  const Icon = WAIT_ICON[icon]
  return (
    <span className={`tpw__wait${done ? ' is-done' : ''}`}>
      {done ? (
        <>
          <Done />
          Verified
        </>
      ) : (
        <>
          <span className="tpw__wicon" aria-hidden>
            <Icon size={14} strokeWidth={2} />
          </span>
          <span className="tpw__spin" aria-hidden>
            <RotateCw size={12} strokeWidth={2} />
          </span>
          Waiting
        </>
      )}
    </span>
  )
}

function Done() {
  const { reduced } = usePlay()
  return (
    <motion.span
      className="tpw__done"
      initial={reduced ? false : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      aria-hidden
    >
      <Check size={12} strokeWidth={3} />
    </motion.span>
  )
}

function Grid({ size, pattern, lit, remember }: { size: number; pattern: number[]; lit: number; remember: Remember | null }) {
  const p = usePlay()
  const typing = p.action?.kind === 'type' && p.action.field === 'grid'
  const on = typing ? pattern.slice(0, p.shown) : pattern.slice(0, lit)
  return (
    <>
      <p className="tpw__ask">Select your pattern</p>
      <span className="tpw__grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} aria-hidden>
        {Array.from({ length: size * size }, (_, i) => {
          const order = on.indexOf(i)
          return (
            <span key={i} className={`tpw__cell${order >= 0 ? ' is-on' : ''}`}>
              {order >= 0 ? order + 1 : ''}
            </span>
          )
        })}
      </span>
      <RememberBox remember={remember} />
      <Btn>Verify</Btn>
    </>
  )
}

function Denied({ message }: { message: string }) {
  const { reduced } = usePlay()
  return (
    <motion.div
      className="tpw__end"
      initial={reduced ? false : { x: 0 }}
      animate={reduced ? { x: 0 } : { x: [0, -7, 7, -5, 5, -2, 0] }}
      transition={{ duration: 0.5, delay: 0.18, ease: 'easeInOut' }}
    >
      <motion.span
        className="tpw__mark is-negative"
        aria-hidden
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 480, damping: 22 }}
      >
        <Lock size={16} strokeWidth={2} />
      </motion.span>
      <p className="tpw__h">Access denied</p>
      <p className="tpw__msg">{message}</p>
      <span className="tpw__link">Back to sign in</span>
    </motion.div>
  )
}

/* The application's home, once the person is in: its bar with their face,
   the success mark, and the page it opens on, drawn as blocks. */
function AppHome({ appId, appName, person }: { appId: string; appName: string; person: { name: string; email: string } | null }) {
  const { reduced } = usePlay()
  const name = person?.name ?? ''
  return (
    <div className="tpw__home">
      <div className="tpw__appbar">
        <AppLogo appId={appId} name={appName} size={16} />
        <span className="tpw__appname">{appName}</span>
        {name && (
          <span className="tpw__avatar" aria-hidden>
            {initials(name)}
          </span>
        )}
      </div>
      <div className="tpw__welcome">
        <motion.span
          className="tpw__mark is-positive"
          aria-hidden
          initial={reduced ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20, delay: 0.12 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <motion.path
              d="M5 12.5l4.2 4.2L19 7"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.34, delay: 0.3, ease: EASE_OUT }}
            />
          </svg>
        </motion.span>
        <motion.div
          className="tpw__hello"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.36, ease: EASE_OUT }}
        >
          <p className="tpw__h">Signed in to {appName}</p>
          {name && <p className="tpw__msg">{name}</p>}
        </motion.div>
      </div>
      <div className="tpw__blocks" aria-hidden>
        <span className="tpw__block is-wide" />
        <span className="tpw__block" />
        <span className="tpw__block" />
      </div>
    </div>
  )
}
