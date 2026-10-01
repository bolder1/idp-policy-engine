import { motion } from 'motion/react'
import { Check, FileBadge, Fingerprint } from 'lucide-react'

import { EASE_OUT, PRESS, PRESS_T, isPressing, isScanning, usePlay } from './play-state'
import { SIGN_IN_DOMAIN, type Sheet } from './script'

/* -----------------------------------------------------------------------------
   The browser's own sheets, over the page: the passkey prompt with its
   fingerprint, and the certificate a smart card offers. The scrim is a plain
   element with a colour; the sheet is motion's, and slides down a little as
   the browser's own do.
   -------------------------------------------------------------------------- */

export function BrowserSheet({ sheet }: { sheet: Sheet }) {
  const { reduced } = usePlay()
  return (
    <motion.div
      className="tps"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
    >
      <motion.div
        className="tps__sheet"
        initial={reduced ? false : { y: -14 }}
        animate={{ y: 0 }}
        transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
      >
        {sheet.kind === 'passkey' ? <Passkey account={sheet.account} done={sheet.done} /> : <Certificate person={sheet.person} chosen={sheet.chosen} />}
      </motion.div>
    </motion.div>
  )
}

function Passkey({ account, done }: { account: string; done: boolean }) {
  const p = usePlay()
  const scanning = isScanning(p, 'sheet') && !p.reduced
  /* The scan's beat holds the scene it ends on: the tick waits until the finger has been read. */
  const read = done && !isScanning(p, 'sheet')
  return (
    <>
      <p className="tps__title">Use your passkey</p>
      <p className="tps__sub">for {SIGN_IN_DOMAIN}</p>
      <span className={`tps__print${read ? ' is-done' : ''}`} aria-hidden>
        {scanning && (
          <motion.span
            key={p.key}
            className="tps__ring"
            initial={{ opacity: 0.6, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 0.9, repeat: 1, ease: 'easeOut' }}
          />
        )}
        {read ? <Check size={20} strokeWidth={2.6} /> : <Fingerprint size={22} strokeWidth={1.8} />}
      </span>
      {account && <p className="tps__sub">{account}</p>}
    </>
  )
}

function Certificate({ person, chosen }: { person: string; chosen: boolean }) {
  const p = usePlay()
  const pressing = isPressing(p, 'sheet')
  return (
    <>
      <p className="tps__title">Select a certificate</p>
      <span className={`tps__cert${chosen || pressing ? ' is-on' : ''}`}>
        <FileBadge size={14} strokeWidth={2} aria-hidden />
        <span>{person}</span>
      </span>
      <motion.span
        key={pressing ? p.key : 'still'}
        className="tps__ok"
        initial={false}
        animate={pressing && !p.reduced ? PRESS : { scale: 1 }}
        transition={PRESS_T}
      >
        OK
      </motion.span>
    </>
  )
}
