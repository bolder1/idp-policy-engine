import { motion } from 'motion/react'
import { Check, KeyRound } from 'lucide-react'

import { BOOTH_W, type GatesGeo } from './gates-geometry'

/* -----------------------------------------------------------------------------
   The booths (GatesLayout.tsx): an allow with extra factors puts one booth per
   extra factor between the turnstile and the door — "OTP over Email". The
   token steps into each on its way to the door; each one passed turns green
   (an extra factor is not a warning: it is part of the allow).
   -------------------------------------------------------------------------- */

const BOOTH_H = 52

export function GatesBooths({ names, geo, landed, animate, at }: { names: readonly string[]; geo: GatesGeo; landed: boolean; animate: boolean; at: readonly number[] }) {
  return (
    <>
      {names.map((name, i) => (
        <div
          key={`${name}:${i}`}
          className={`rl-gates__booth${landed ? ' is-passed' : ''}`}
          style={{ left: geo.boothX[i], top: geo.outY - BOOTH_H / 2, width: BOOTH_W }}
          data-card
          role="img"
          aria-label={`Extra factor: ${name}${landed ? ', asked' : ''}`}
          title={name}
        >
          <span className="rl-gates__boothframe" style={{ height: BOOTH_H }}>
            <KeyRound className="rl-gates__boothicon" size={12} strokeWidth={2.2} aria-hidden />
            {landed && (
              <motion.span
                className="rl-gates__boothok"
                initial={animate ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: animate ? 0.2 : 0, delay: animate ? (at[i] ?? 0) : 0 }}
              >
                <Check size={11} strokeWidth={3} aria-hidden />
              </motion.span>
            )}
          </span>
          <span className="rl-gates__boothname">{name}</span>
        </div>
      ))}
    </>
  )
}
