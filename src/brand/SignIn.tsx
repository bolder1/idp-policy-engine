import { useState } from 'react'
import type { FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { Button } from './kit'
import { DesignLock } from './DesignLock'
import { lineForEmail, signIn } from './lines'
import './sign-in.css'

/* -----------------------------------------------------------------------------
   The one way in (owner, 19 Nov 2026). The email decides the line; Design asks for the passphrase first (DesignLock).
   Shown only when nothing is signed in (main.tsx); the tester deploy skips it.
   -------------------------------------------------------------------------- */

export function SignIn() {
  const reduce = useReducedMotion() === true
  const [email, setEmail] = useState('')
  const [refused, setRefused] = useState(false)
  const [locking, setLocking] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const line = lineForEmail(email)
    if (!line) {
      setRefused(true)
      return
    }
    if (line === 'design') setLocking(true)
    else signIn(email, line)
  }

  return (
    <main className="bsi">
      <motion.form
        className="bsi__card"
        onSubmit={submit}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <img className="bsi__logo" src="/xecurify-logo.png" alt="xecurify" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <h1 className="bsi__title">Sign in</h1>
        <p className="bsi__sub">IdP Policy Engine prototype</p>

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
          aria-invalid={refused}
          aria-describedby={refused ? 'bsi-msg' : undefined}
          onChange={(e) => {
            setEmail(e.target.value)
            setRefused(false)
          }}
        />
        {refused && (
          <p id="bsi-msg" className="bsi__msg" role="alert">
            This email has no access to the prototype.
          </p>
        )}

        <Button variant="brand" type="submit" block disabled={!email.trim()}>
          Sign in
        </Button>
      </motion.form>

      {locking && (
        <DesignLock
          email={email.trim().toLowerCase()}
          from="sign-in"
          onClose={() => setLocking(false)}
          onUnlocked={() => signIn(email, 'design')}
        />
      )}
    </main>
  )
}
