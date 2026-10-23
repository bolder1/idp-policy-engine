import { motion, useReducedMotion } from 'motion/react'

import { AppLogo } from '../logos/AppLogo'
import { Button, Modal } from '../kit'
import type { App, Policy } from '../data'

/* -----------------------------------------------------------------------------
   TURNING A SHARED POLICY OFF (owner, 23 Oct 2026: "remove this sub heading, and
   on click give options with a popup confirmation — inactive everywhere or for
   this app only — with a little context and an animated illustration; basic, just
   show logos based on the selection").

   The ⋯ menu on an application's Policies tab used to carry two rows with a
   sentence under each. It is one row now, and where the policy is on other
   applications the question is asked here instead, once: off for all of them, or
   only for this one, which is Remove. Two buttons, no cancel (the × is the way
   out), each naming its scope. The illustration is the applications themselves as
   logos, arriving one after another with this one ringed, so the scope is seen
   before it is read.

   THIS IS THE CONFIRMATION (23 Oct 2026, the popups pass: "if something can be
   removed, remove it"). Both answers used to open a second dialog — Everywhere
   the status switch's own "Turn off?", Only here the Remove dialog — so the admin
   answered one question twice. The caller writes the answer as given. The line
   that spelled the two buttons out as a sentence went too, and Only here carries
   the application's logo, as the fork slider's Duplicate does.
   -------------------------------------------------------------------------- */

export function StatusScopeDialog({
  open,
  policy,
  app,
  apps,
  onClose,
  onEverywhere,
  onHere,
}: {
  open: boolean
  policy: Policy
  /** The application whose tab this is. */
  app: App
  /** Every application the policy is on, this one included. */
  apps: App[]
  onClose: () => void
  /** The policy goes inactive on every application it is on. Already confirmed here: the caller asks nothing more. */
  onEverywhere: () => void
  /** Only this application stops using it. Already confirmed here, as Remove's own confirm would have. */
  onHere: () => void
}) {
  const reduce = useReducedMotion()
  const shown = apps.slice(0, 6)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Turn off this policy?"
      width={480}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onHere()
            }}
          >
            <span className="bfork__btnapp">
              Only <AppLogo appId={app.id} name="" size={16} /> {app.name}
            </span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onEverywhere()
            }}
          >
            Everywhere
          </Button>
        </>
      }
    >
      <div className="bscope">
        <ul className="bscope__logos" aria-label={apps.map((a) => a.name).join(', ')}>
          {shown.map((a, i) => (
            <motion.li
              key={a.id}
              className={a.id === app.id ? 'is-here' : undefined}
              title={a.name}
              initial={reduce ? false : { opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.06 * i, type: 'spring', stiffness: 420, damping: 24 }}
            >
              <AppLogo appId={a.id} name="" size={28} />
            </motion.li>
          ))}
          {apps.length > shown.length && <li className="bscope__more">+{apps.length - shown.length}</li>}
        </ul>
        <p className="bscope__said">
          <b>{policy.name}</b>
          <span>Used by {apps.length} applications.</span>
        </p>
      </div>
    </Modal>
  )
}
