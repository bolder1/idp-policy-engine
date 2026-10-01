import { AnimatePresence, motion } from 'motion/react'
import { Check, Fingerprint, MessageSquare, Phone as PhoneIcon, PhoneOff, QrCode, ShieldCheck } from 'lucide-react'

import { EASE_OUT, PRESS, PRESS_T, isPressing, isScanning, usePlay, useTyped } from './play-state'
import type { PhoneScreen } from './script'

/* -----------------------------------------------------------------------------
   The phone beside the browser: a text arriving on the lock screen, a call,
   an authenticator's code with its countdown, a push to approve, a camera
   reading a code. It slides in from the right edge and away again once it
   has done its part (SignInPlayer places it). Motion owns its x and every
   press on it; player.css only positions and colours.

   Each screen carries its own surface — the dark lock screen, the light
   app, the camera — with the status row on it, and a new screen fades in
   over the one before, which stays put under it until it is covered. So
   a lock screen turning into the app never passes through an empty phone.
   -------------------------------------------------------------------------- */

/** The time on every lock screen in this film: the one mock-ups use, so it reads as a picture. */
const CLOCK = '9:41'

/** How long a new screen takes to fade in over the last, in s. */
const SWAP = 0.18

export function Phone({ screen }: { screen: PhoneScreen }) {
  const { reduced } = usePlay()
  /* A lock screen, or a call: dark, in the shell's colours. */
  const lock = (screen.kind === 'sms' && !screen.approved) || (screen.kind === 'push' && screen.phase === 'notice') || screen.kind === 'call'
  return (
    <div className="tpp">
      <span className="tpp__notch" aria-hidden />
      <AnimatePresence initial={false}>
        <motion.div
          key={screenKey(screen)}
          className={`tpp__screen${lock ? ' is-lock' : ''}${screen.kind === 'scan' ? ' is-camera' : ''}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          /* Under the new screen until it is in, then gone. */
          exit={reduced ? { opacity: 1 } : { opacity: 0, transition: { duration: 0.01, delay: SWAP } }}
          transition={{ duration: reduced ? 0 : SWAP }}
        >
          {/* A lock screen says the time large, and not again in the corner. */}
          <div className="tpp__status">{lock ? '' : CLOCK}</div>
          <div className="tpp__body">
            <ScreenBody screen={screen} />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const screenKey = (s: PhoneScreen) =>
  s.kind === 'push' ? `push:${s.phase === 'biometric' ? 'ask' : s.phase}` : s.kind === 'sms' ? `sms:${s.approved}` : s.kind === 'call' ? `call:${s.answered}` : s.kind

function ScreenBody({ screen }: { screen: PhoneScreen }) {
  switch (screen.kind) {
    case 'sms':
      return screen.approved ? (
        <Approved title="Sign-in approved" />
      ) : (
        <LockScreen>
          <Notice icon={<MessageSquare size={10} strokeWidth={2.4} />} tone="positive" app="Messages">
            {screen.code && <b>{screen.code} </b>}
            {screen.text}
            {screen.link && (
              <>
                {' '}
                <Tapped target="phone-link" className="tpp__link">
                  {screen.link}
                </Tapped>
              </>
            )}
          </Notice>
        </LockScreen>
      )
    case 'call':
      return <Call answered={screen.answered} code={screen.code} />
    case 'authenticator':
      return <Authenticator app={screen.app} issuer={screen.issuer} account={screen.account} code={screen.code} />
    case 'push':
      if (screen.phase === 'notice')
        return (
          <LockScreen>
            <Notice icon={<ShieldCheck size={10} strokeWidth={2.4} />} tone="info" app={screen.short}>
              Approve your sign-in?
            </Notice>
          </LockScreen>
        )
      if (screen.phase === 'approved') return <Approved title="Approved" />
      return <Push short={screen.short} account={screen.account} number={screen.number} typed={screen.typed} biometric={screen.phase === 'biometric'} />
    case 'scan':
      return <Scan app={screen.app} done={screen.done} />
  }
}

function LockScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="tpp__lock">
      <span className="tpp__clock">{CLOCK}</span>
      {children}
    </div>
  )
}

/** A notification landing on the lock screen, a beat after the phone does. */
function Notice({ icon, tone, app, children }: { icon: React.ReactNode; tone: 'positive' | 'info'; app: string; children: React.ReactNode }) {
  const { reduced } = usePlay()
  return (
    <motion.div
      className="tpp__notice"
      initial={reduced ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: reduced ? 0 : 0.34, ease: EASE_OUT }}
    >
      <span className="tpp__nhead">
        <span className={`tpp__napp is-${tone}`} aria-hidden>
          {icon}
        </span>
        <span className="tpp__nname">{app}</span>
      </span>
      <span className="tpp__ntext">{children}</span>
    </motion.div>
  )
}

/** Something on the phone the person taps: a small press, and a touch ring where the finger lands. */
function Tapped({ target, className, children }: { target: 'phone-link' | 'phone-approve' | 'phone-answer'; className: string; children: React.ReactNode }) {
  const p = usePlay()
  const pressing = isPressing(p, target) && !p.reduced
  return (
    <motion.span
      key={pressing ? p.key : 'still'}
      className={`${className}${isPressing(p, target) ? ' is-pressed' : ''}`}
      initial={false}
      animate={pressing ? PRESS : { scale: 1 }}
      transition={PRESS_T}
    >
      {children}
      {pressing && (
        <motion.span
          className="tpp__touch"
          aria-hidden
          initial={{ opacity: 0.5, scale: 0.3 }}
          animate={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        />
      )}
    </motion.span>
  )
}

function Approved({ title }: { title: string }) {
  const { reduced } = usePlay()
  return (
    <div className="tpp__approved">
      <motion.span
        className="tpp__ok"
        aria-hidden
        initial={reduced ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 24 }}
      >
        <Check size={18} strokeWidth={3} />
      </motion.span>
      <span className="tpp__title">{title}</span>
    </div>
  )
}

function Call({ answered, code }: { answered: boolean; code: string }) {
  return (
    <div className="tpp__call">
      <span className="tpp__caller" aria-hidden>
        <PhoneIcon size={16} strokeWidth={2} />
      </span>
      <span className="tpp__title">miniOrange</span>
      {answered ? (
        <>
          <span className="tpp__sub">Your code is</span>
          <span className="tpp__spoken">{code.split('').join(' ')}</span>
        </>
      ) : (
        <>
          <span className="tpp__sub">Incoming call</span>
          <span className="tpp__callbtns">
            <span className="tpp__round is-decline" aria-hidden>
              <PhoneOff size={12} strokeWidth={2.4} />
            </span>
            <Tapped target="phone-answer" className="tpp__round is-answer">
              <PhoneIcon size={12} strokeWidth={2.4} aria-hidden />
            </Tapped>
          </span>
        </>
      )}
    </div>
  )
}

/* The authenticator's one account: the tenant as issuer, the person's
   address, the code, and a ring counting its 30 seconds down. */
function Authenticator({ app, issuer, account, code }: { app: string; issuer: string; account: string; code: string }) {
  const { reduced } = usePlay()
  const R = 6
  const C = 2 * Math.PI * R
  return (
    <div className="tpp__app">
      <span className="tpp__apphead">{app}</span>
      <div className="tpp__otp">
        <span className="tpp__issuer">{issuer}</span>
        {account && <span className="tpp__acct">{account}</span>}
        <span className="tpp__otprow">
          <span className="tpp__otpcode">
            {code.slice(0, 3)} {code.slice(3)}
          </span>
          <svg className="tpp__ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r={R} className="tpp__ringbg" />
            <motion.circle
              cx="8"
              cy="8"
              r={R}
              className="tpp__ringfg"
              strokeDasharray={C}
              initial={{ strokeDashoffset: reduced ? C * 0.35 : C * 0.1 }}
              animate={{ strokeDashoffset: C * 0.35 }}
              transition={{ duration: reduced ? 0 : 3, ease: 'linear' }}
            />
          </svg>
        </span>
      </div>
      {/* The person's other accounts in the app, as blocks. */}
      <span className="tpp__rows" aria-hidden>
        <span className="tpp__row" />
        <span className="tpp__row" />
      </span>
    </div>
  )
}

function Push({ short, account, number, typed, biometric }: { short: string; account: string; number: string | null; typed: string; biometric: boolean }) {
  const p = usePlay()
  const { text, typing } = useTyped('number', typed)
  const scanning = isScanning(p, 'phone') && !p.reduced
  return (
    <div className="tpp__push">
      <span className="tpp__apphead">{short}</span>
      {/* With a number to enter, the number is what ties the phone to the page. */}
      {!number && (
        <span className="tpp__shield" aria-hidden>
          <ShieldCheck size={16} strokeWidth={2} />
        </span>
      )}
      <span className="tpp__title">Are you trying to sign in?</span>
      {account && !number && <span className="tpp__sub">{account}</span>}
      {number && (
        <span className="tpp__enter">
          <span className="tpp__sub is-wrap">Enter the number shown</span>
          <span className={`tpp__numbox${typing ? ' is-focus' : ''}`}>{text || ' '}</span>
        </span>
      )}
      {biometric ? (
        <span className="tpp__bio" aria-hidden>
          {scanning && (
            <motion.span
              key={p.key}
              className="tpp__bioring"
              initial={{ opacity: 0.6, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.8 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
          )}
          <Fingerprint size={20} strokeWidth={1.8} />
        </span>
      ) : (
        <span className="tpp__choices">
          <Tapped target="phone-approve" className="tpp__choice is-yes">
            Approve
          </Tapped>
          <span className="tpp__choice">Deny</span>
        </span>
      )}
    </div>
  )
}

function Scan({ app, done }: { app: string; done: boolean }) {
  const p = usePlay()
  const scanning = isScanning(p, 'phone') && !p.reduced
  /* The scan's beat holds the scene it ends on: the tick waits until it has scanned. */
  const read = done && !isScanning(p, 'phone')
  return (
    <div className="tpp__cam">
      <span className="tpp__apphead is-light">{app}</span>
      <span className={`tpp__finder${read ? ' is-done' : ''}`} aria-hidden>
        {read ? (
          <Check size={22} strokeWidth={3} />
        ) : (
          <>
            <QrCode size={40} strokeWidth={1.4} />
            {scanning && (
              <motion.span
                className="tpp__scanline"
                initial={{ y: 0 }}
                animate={{ y: [0, 44, 0] }}
                transition={{ duration: 0.9, ease: 'easeInOut' }}
              />
            )}
          </>
        )}
      </span>
    </div>
  )
}
