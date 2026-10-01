import { motion } from 'motion/react'
import { Check, Fingerprint } from 'lucide-react'

import { isPressing, isScanning, usePlay } from './play-state'

/* -----------------------------------------------------------------------------
   The things a person holds instead of a phone: a hardware token showing its
   code, a security key they touch, a smart card going into its reader, a
   fingerprint reader on the desk. Each is one widget, in the slot the phone
   uses; motion owns every movement on them.
   -------------------------------------------------------------------------- */

/** A keyfob with its code on a small screen, and the bar that counts it down. */
export function TokenFob({ label, code }: { label: string; code: string }) {
  const { reduced } = usePlay()
  return (
    <div className="tph tph--fob">
      <span className="tph__lcd">
        <span className="tph__lcdcode">{code}</span>
        <span className="tph__bar" aria-hidden>
          <motion.span
            className="tph__barfill"
            style={{ originX: 0 }}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: reduced ? 0.6 : 0.35 }}
            transition={{ duration: reduced ? 0 : 3, ease: 'linear' }}
          />
        </span>
      </span>
      <span className="tph__label">{label}</span>
    </div>
  )
}

/** A USB security key: the plug, the body, the disc the person touches. */
export function SecurityKey({ touched }: { touched: boolean }) {
  const p = usePlay()
  const pressing = isPressing(p, 'key')
  return (
    <div className="tph tph--key">
      <span className="tph__plug" aria-hidden />
      <span className="tph__keybody">
        <span className={`tph__disc${touched ? ' is-on' : ''}`} aria-hidden>
          {pressing && !p.reduced && (
            <motion.span
              key={p.key}
              className="tph__glow"
              initial={{ opacity: 0.7, scale: 0.8 }}
              animate={{ opacity: 0, scale: 2 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          )}
        </span>
      </span>
    </div>
  )
}

/** A smart card, pushed into its reader. */
export function SmartCard({ inserted, person }: { inserted: boolean; person: string }) {
  const { reduced } = usePlay()
  return (
    <div className="tph tph--card">
      <motion.span
        className="tph__cardbody"
        initial={false}
        animate={{ y: inserted ? 40 : 0 }}
        transition={{ duration: reduced ? 0 : 0.36, ease: [0.4, 0, 0.2, 1] }}
      >
        <span className="tph__chip" aria-hidden />
        <span className="tph__cardname">{person}</span>
      </motion.span>
      <span className={`tph__slot${inserted ? ' is-on' : ''}`} aria-hidden />
    </div>
  )
}

/** A fingerprint reader: the pad, the finger's pulse, and a tick once read. */
export function FingerprintReader({ read }: { read: boolean }) {
  const p = usePlay()
  const scanning = isScanning(p, 'reader') && !p.reduced
  /* The scan's beat holds the scene it ends on: the tick waits until the finger has been read. */
  const done = read && !isScanning(p, 'reader')
  return (
    <div className="tph tph--reader">
      <span className={`tph__pad${done ? ' is-done' : ''}`} aria-hidden>
        {scanning && (
          <motion.span
            key={p.key}
            className="tph__glow"
            initial={{ opacity: 0.6, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
        {done ? <Check size={20} strokeWidth={3} /> : <Fingerprint size={26} strokeWidth={1.6} />}
      </span>
    </div>
  )
}

