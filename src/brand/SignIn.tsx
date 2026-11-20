import { useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ChevronRight } from 'lucide-react'

import { Button } from './kit'
import { LINE_NAMES, lineForEmail, logAttempt, passphraseMatches, signIn } from './lines'
import type { Line } from './lines'
import { RoleAvatar } from './role-avatar'
import './sign-in.css'

/* -----------------------------------------------------------------------------
   The one way in (owner, 19 Nov 2026), in two steps (20 Nov: "first the user selects which version they want, then
   based on that we ask the mail … every version is locked with the dummy mail, and Design with the mail and the
   password").

     1  Version   Design, Dev handoff or Tester, each with its badge (role-avatar.tsx).
     2  Sign in   the email for that version only (lines.ts SEED_EMAILS); Design also asks for its password.

   Shown only when nothing is signed in (main.tsx); the tester deploy skips it. A wrong email or password says so
   under its field; Design's attempts go to the access log as the Design lock's do.
   -------------------------------------------------------------------------- */

const VERSIONS: { line: Line; caption: string }[] = [
  { line: 'design', caption: 'Latest design work' },
  { line: 'handoff', caption: 'For developers' },
  { line: 'tester', caption: 'Phase 1 testing' },
]

export function SignIn() {
  const reduce = useReducedMotion() === true
  const [line, setLine] = useState<Line | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailWrong, setEmailWrong] = useState(false)
  const [passwordWrong, setPasswordWrong] = useState(false)
  const [busy, setBusy] = useState(false)

  const pick = (l: Line | null) => {
    setLine(l)
    setEmail('')
    setPassword('')
    setEmailWrong(false)
    setPasswordWrong(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!line || busy) return
    const clean = email.trim().toLowerCase()
    /* Each version opens with its own email only. */
    if (lineForEmail(clean) !== line) {
      setEmailWrong(true)
      return
    }
    if (line === 'design') {
      setBusy(true)
      const passed = await passphraseMatches(password)
      logAttempt({ email: clean, from: 'sign-in', passed })
      setBusy(false)
      if (!passed) {
        setPasswordWrong(true)
        return
      }
    }
    signIn(clean, line)
  }

  const slide = (dir: 1 | -1) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
      : { initial: { opacity: 0, x: 16 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 * dir } }

  return (
    <main className="bsi">
      <motion.div
        className="bsi__card"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <img className="bsi__logo" src="/xecurify-logo.png" alt="xecurify" onError={(e) => (e.currentTarget.style.display = 'none')} />

        <AnimatePresence mode="wait" initial={false}>
          {!line ? (
            <motion.div key="pick" className="bsi__step" {...slide(-1)} transition={{ duration: 0.18 }}>
              <h1 className="bsi__title">Sign in</h1>
              <p className="bsi__sub">Choose a version</p>
              <div className="bsi__versions" role="list">
                {VERSIONS.map((v) => (
                  <button key={v.line} type="button" role="listitem" className="bsi__version" onClick={() => pick(v.line)}>
                    <RoleAvatar line={v.line} size={36} />
                    <span className="bsi__vtext">
                      <strong>{LINE_NAMES[v.line]}</strong>
                      <em>{v.caption}</em>
                    </span>
                    <ChevronRight className="bsi__vgo" size={16} strokeWidth={1.8} aria-hidden />
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.form key="creds" className="bsi__step" onSubmit={submit} {...slide(1)} transition={{ duration: 0.18 }}>
              <button type="button" className="bsi__back" onClick={() => pick(null)}>
                <ArrowLeft size={14} strokeWidth={1.9} aria-hidden />
                Change version
              </button>
              <div className="bsi__chosen">
                <RoleAvatar line={line} size={36} />
                <div className="bsi__vtext">
                  <h1 className="bsi__title">{LINE_NAMES[line]}</h1>
                  <em>{VERSIONS.find((v) => v.line === line)?.caption}</em>
                </div>
              </div>

              <label className="bsi__label" htmlFor="bsi-email">
                Email
              </label>
              <input
                id="bsi-email"
                className="bsi__input"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                aria-invalid={emailWrong}
                aria-describedby={emailWrong ? 'bsi-email-msg' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailWrong(false)
                }}
              />
              {emailWrong && (
                <p id="bsi-email-msg" className="bsi__msg" role="alert">
                  This email can't open {LINE_NAMES[line]}.
                </p>
              )}

              {line === 'design' && (
                <>
                  <label className="bsi__label" htmlFor="bsi-password">
                    Password
                  </label>
                  <input
                    id="bsi-password"
                    className="bsi__input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    aria-invalid={passwordWrong}
                    aria-describedby={passwordWrong ? 'bsi-password-msg' : undefined}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setPasswordWrong(false)
                    }}
                  />
                  {passwordWrong && (
                    <p id="bsi-password-msg" className="bsi__msg" role="alert">
                      Wrong password.
                    </p>
                  )}
                </>
              )}

              <Button variant="brand" type="submit" block disabled={!email.trim() || (line === 'design' && !password) || busy}>
                Sign in
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
