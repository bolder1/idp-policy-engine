import { motion, useReducedMotion } from 'motion/react'
import { ShieldPlus } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import './app-unlinked-art.css'

/* An application with no policy, drawn (rollout.ts `appEmptyLogo`; owner, 26 Nov 2026: "something related to the logo
   … the logo is not attached to any policy … think in a creative way", then of the first cut, two boxes and a broken
   link: "the boxes, I don't like … everything feels very static … have the Google whatever, and there is an
   application around it").

   The application's own logo at the centre, on a disc, with two orbits round it. Soft rings go out from the logo, one
   after another, as if it were calling for a policy, and a policy — a small shield with a plus — circles the outer
   orbit without ever landing. Nothing is boxed; the logo is the only solid thing. Reduced motion draws the same
   picture still: the rings, and the shield parked at the top right of its orbit. */

const W = 184
const H = 136
const CX = W / 2
const CY = H / 2
/** The logo's disc, the inner orbit and the outer one the shield travels. */
const DISC = 27
const INNER = 42
const OUTER = 59
/** One lap of the shield, and the beat between two rings going out. */
const LAP = 16
const PULSE = 3.4

export function AppUnlinkedArt({ appId, name }: { appId: string; name: string }) {
  const reduce = useReducedMotion()
  const lap = reduce ? { duration: 0 } : { duration: LAP, repeat: Infinity, ease: 'linear' as const }
  return (
    <span className="bunl" aria-hidden style={{ width: W, height: H }}>
      <svg className="bunl__rings" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
        {/* Calling out: two rings from the disc's edge, half a beat apart, fading as they reach the outer orbit. */}
        {!reduce &&
          [0, 1].map((i) => (
            <motion.circle
              key={i}
              cx={CX}
              cy={CY}
              stroke="var(--blue)"
              strokeWidth={1.25}
              initial={{ r: DISC, opacity: 0 }}
              animate={{ r: [DISC, OUTER + 6], opacity: [0.45, 0] }}
              transition={{ duration: PULSE, repeat: Infinity, ease: [0.2, 0, 0, 1], delay: i * (PULSE / 2) }}
            />
          ))}
        <circle cx={CX} cy={CY} r={INNER} stroke="var(--border-default)" strokeWidth={1.25} />
        {/* The outer orbit's dashes drift the way the shield goes, so the ring itself reads as moving. */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={OUTER}
          stroke="var(--border-strong)"
          strokeOpacity={0.45}
          strokeWidth={1.25}
          strokeDasharray="2 6"
          animate={reduce ? undefined : { strokeDashoffset: [0, -64] }}
          transition={reduce ? undefined : { duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </svg>
      <span className="bunl__disc" style={{ width: DISC * 2, height: DISC * 2, marginLeft: -DISC, marginTop: -DISC }}>
        <AppLogo appId={appId} name={name} size={30} />
      </span>
      {/* The orbit turns; the shield turns back as much, so it stays upright the whole way round. */}
      <motion.span className="bunl__orbit" style={{ width: OUTER * 2, height: OUTER * 2, marginLeft: -OUTER, marginTop: -OUTER }} initial={{ rotate: 40 }} animate={{ rotate: reduce ? 40 : 400 }} transition={lap}>
        <motion.span className="bunl__shield" initial={{ rotate: -40 }} animate={{ rotate: reduce ? -40 : -400 }} transition={lap}>
          <ShieldPlus size={13} strokeWidth={2.2} />
        </motion.span>
      </motion.span>
    </span>
  )
}
