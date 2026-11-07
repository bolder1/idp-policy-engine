import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { useBrand } from '../store'
import './announce-strip.css'

/* -----------------------------------------------------------------------------
   The launch strip (owner, 4 Nov 2026: "a good announcement strip at the top, with
   good colours ... make it exciting", and "no need to follow the system" for it).
   The full width of the content column, above the page, on the pages the Policy
   builder touches. A colour of its own, a soft light that sweeps it now and then,
   a line that says the news, and one white button into the intro. Dismissed for the
   visit; it goes for good once nothing old is left to move. Reduced motion holds the
   light still.
   -------------------------------------------------------------------------- */

/* Not App Login or Adaptive Access: their closing banner already says it (owner, 4 Nov 2026). */
const ON = ['applications', 'zones', 'fingerprint', 'old-password']

const LINE: Record<string, string> = {
  applications: 'One policy per application, built on a canvas and checked before it goes live.',
  zones: 'A zone you make here works in every policy you build.',
  fingerprint: 'New: check the device someone signs in from, before they get in.',
}
const OLD_LINE = 'App Login and Adaptive Access policies are moving into one place.'

type Look = 'strip' | 'card'
const LOOK_KEY = 'idp.announce.look'
/* The strip only, for now (owner, 6 Nov 2026: "only strip, shown by default, no need for the swap"). The card and
   its switch stay for later: true brings both back. */
const LOOK_SWITCH = false
function readLook(): Look {
  if (!LOOK_SWITCH) return 'strip'
  try {
    return localStorage.getItem(LOOK_KEY) === 'strip' ? 'strip' : 'card'
  } catch {
    return 'card'
  }
}

export function AnnounceStrip() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const [shut, setShut] = useState(false)
  const [look, setLook] = useState<Look>(readLook)
  const unmoved = store.legacy.policies.some((lp) => !store.movedLegacy[lp.id])
  if (shut || !unmoved || !ON.includes(store.screen.name)) return null
  const pick = (v: Look) => {
    setLook(v)
    try {
      localStorage.setItem(LOOK_KEY, v)
    } catch {
      /* the pick just isn't remembered */
    }
  }
  /* Two looks to show (owner, 5 Nov 2026: "give me both options"): the full-width strip, and the inset card after
     Google Workspace's. A small switch inside it flips between them. */
  const toggle = LOOK_SWITCH && (
    <span className="bann__look" role="group" aria-label="Banner look">
      {(['strip', 'card'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={look === v} onClick={() => pick(v)}>
          {v === 'strip' ? 'Strip' : 'Card'}
        </button>
      ))}
    </span>
  )
  if (look === 'strip')
    return (
      <section className="bann is-strip" aria-label="The new Policy builder">
        {!reduce && (
          <motion.span className="bann__sweep" aria-hidden initial={{ x: '-40%' }} animate={{ x: '260%' }} transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 4.5 }} />
        )}
        <span className="bann__orb is-a" aria-hidden />
        <span className="bann__orb is-b" aria-hidden />
        <div className="bann__in">
          <BannerMark reduce={reduce} />
          <p className="bann__text">
            <b>Meet the new Policy builder</b>
            <span>{LINE[store.screen.name] ?? OLD_LINE}</span>
          </p>
          {toggle}
          <button type="button" className="bann__go" onClick={() => store.openIntro('learn')}>
            See what’s new
            <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
          </button>
          <button type="button" className="bann__x" aria-label="Dismiss" onClick={() => setShut(true)}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </section>
    )
  return (
    <section className="bann is-card" aria-label="The new Policy builder">
      {!reduce && (
        <motion.span className="bann__shine" aria-hidden initial={{ x: '-30%' }} animate={{ x: '420%' }} transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 5 }} />
      )}
      <BannerMark reduce={reduce} />
      <p className="bann__text">
        <b>Meet the new Policy builder</b>
        <span>{LINE[store.screen.name] ?? OLD_LINE}</span>
      </p>
      {toggle}
      <button type="button" className="bann__go" onClick={() => store.openIntro('learn')}>
        See what’s new
      </button>
      <button type="button" className="bann__x" aria-label="Dismiss" onClick={() => setShut(true)}>
        <X size={18} strokeWidth={2} />
      </button>
    </section>
  )
}

/* The mark: the old policies as three pages fanned behind, the new shield in front with its check. The shield settles
   in, the pages ease apart, then all of it rests. */
/** The strip's mark: three old pages fanned, the shield joining them. Also the old pages' banner's (move-banner.tsx). */
export function BannerMark({ reduce }: { reduce: boolean }) {
  return (
    <svg className="bann__mark" viewBox="0 0 72 64" aria-hidden>
      <defs>
        <linearGradient id="bann-page" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b95f7" />
          <stop offset="1" stopColor="#2c66d9" />
        </linearGradient>
        <linearGradient id="bann-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dce8fe" />
          <stop offset="1" stopColor="#9fbff8" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((n) => (
        <motion.rect
          key={n}
          x="6"
          y="10"
          width="30"
          height="40"
          rx="6"
          fill="url(#bann-page)"
          opacity={0.55 + n * 0.2}
          style={{ originX: 0.5, originY: 1 }}
          initial={reduce ? false : { rotate: 0 }}
          animate={{ rotate: (n - 2) * 9 }}
          transition={{ delay: reduce ? 0 : 0.2 + n * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      <rect x="11" y="19" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="11" y="26" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.4)" />
      <motion.g initial={reduce ? false : { x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <path d="M46 8 L64 15 V31 C64 43 56 51 46 56 C36 51 28 43 28 31 V15 Z" fill="url(#bann-shield)" stroke="#0a3a9c" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M38 31 L44 37 L55 25" fill="none" stroke="#0a3a9c" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  )
}
