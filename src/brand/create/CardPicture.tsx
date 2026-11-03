import { Check, Laptop, MapPin, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

import { DecisionChip } from '../kit'

/* -----------------------------------------------------------------------------
   The template card's picture: a small piece of the product its shelf is about, in place of the template's live rules
   (owner, 2 Nov 2026: "real-time showcase might be a problem"; "one generic per category … five of them"; then, 3 Nov,
   "make the illustration a little towards a skeleton, with only a few words or none, based on need, but generic so we
   can scale").

   One panel per shelf, the same for every template on it, so a new template needs nothing drawn. Each keeps its shape
   and the one thing that says what it is about, and draws everything else as grey skeleton bars:
   · Quick protection: a second factor's code screen (its MFA chip, six code boxes).
   · Device-based: a device check (three rows, each ticked).
   · Risk-based: a risk gauge (the arc filled to its score).
   · Compliance: where a sign-in may come from (a place allowed, anywhere else denied).
   · A tenant's own policy (the reuse picker), or anything without a shelf: a policy's rules and their outcomes.
   Light mode, tokens only. On hover the panel lifts a little and plays its use, then holds: the code boxes fill, the
   checks tick, the gauge fills, the rows reveal. Motion props move it; with reduced motion nothing does.
   -------------------------------------------------------------------------- */

type Kind = 'quick' | 'device' | 'risk' | 'compliance' | 'policy'

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const lift: Variants = {
  rest: { y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
  hot: { y: -3, transition: { duration: 0.4, ease: EASE_OUT } },
}
/** A part that plays in on hover, `custom` seconds in. At rest it is simply there. */
const reveal: Variants = {
  rest: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  hot: (d: number) => ({ opacity: [0, 1], y: [4, 0], transition: { delay: d, duration: 0.35, ease: EASE_OUT } }),
}
const fill: Variants = {
  rest: { pathLength: 0.72, transition: { duration: 0.3, ease: EASE_OUT } },
  hot: { pathLength: [0.15, 0.72], transition: { duration: 0.8, ease: EASE_OUT } },
}

/** Which panel: a shelf's key (TemplateCard.tsx `catKey`), or the tone of a card that has none. */
const kindOf = (hue: string): Kind => (hue === 'quick' || hue === 'device' || hue === 'risk' || hue === 'compliance' ? hue : 'policy')

/** A skeleton line of words: `long`, `mid` or `short`. */
function Bar({ w, faint }: { w: 'long' | 'mid' | 'short'; faint?: boolean }) {
  return <span className={`bgviz__bar is-${w}${faint ? ' is-faint' : ''}`} aria-hidden />
}

/** The panel's head: its icon in the shelf's colour, a skeleton title, and what it ends on. */
function Head({ icon: Icon, end }: { icon: LucideIcon; end?: ReactNode }) {
  return (
    <span className="bgviz__head">
      <span className="bgviz__icon" aria-hidden>
        <Icon size={13} strokeWidth={2} />
      </span>
      <Bar w="mid" />
      {end}
    </span>
  )
}

function Quick() {
  return (
    <>
      <Head icon={Smartphone} end={<DecisionChip decision="2fa" size="sm" />} />
      <span className="bgviz__code">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="bgviz__box">
            <motion.span className="bgviz__dot" variants={reveal} custom={0.08 + i * 0.07} />
          </span>
        ))}
      </span>
      <Bar w="mid" faint />
    </>
  )
}

function Device() {
  return (
    <>
      <Head icon={Laptop} end={<span className="bgviz__pill is-blank" aria-hidden />} />
      {(['long', 'mid', 'long'] as const).map((w, i) => (
        <span key={i} className="bgviz__row">
          <Bar w={w} />
          <motion.span className="bgviz__tickbox" variants={reveal} custom={0.12 + i * 0.12}>
            <Check className="bgviz__tick" size={14} strokeWidth={2.4} aria-hidden />
          </motion.span>
        </span>
      ))}
    </>
  )
}

function Risk() {
  return (
    <span className="bgviz__gauge">
      <svg viewBox="0 0 200 124" aria-hidden>
        <path className="bgviz__track" d="M20 100 A80 80 0 0 1 180 100" />
        <motion.path className="bgviz__arc" d="M20 100 A80 80 0 0 1 180 100" variants={fill} />
      </svg>
      <span className="bgviz__score">
        <Bar w="short" faint />
        <span className="bgviz__scorebar" aria-hidden />
      </span>
    </span>
  )
}

function Compliance() {
  return (
    <>
      <Head icon={MapPin} />
      {(
        [
          ['mid', '1fa'],
          ['long', 'deny'],
        ] as const
      ).map(([w, d], i) => (
        <motion.span key={i} className="bgviz__row" variants={reveal} custom={0.1 + i * 0.12}>
          <span className="bgviz__where">
            <MapPin size={13} strokeWidth={2} aria-hidden />
            <Bar w={w} />
          </span>
          <DecisionChip decision={d} size="sm" />
        </motion.span>
      ))}
    </>
  )
}

function Policy() {
  return (
    <>
      <Head icon={ShieldCheck} />
      {(
        [
          ['long', '1fa'],
          ['mid', '2fa'],
          ['long', 'deny'],
        ] as const
      ).map(([w, d], i) => (
        <motion.span key={i} className="bgviz__row" variants={reveal} custom={0.1 + i * 0.1}>
          <Bar w={w} />
          <DecisionChip decision={d} size="sm" />
        </motion.span>
      ))}
    </>
  )
}

const LABEL: Record<Kind, string> = {
  quick: 'A second-factor code screen',
  device: 'A device check',
  risk: 'A risk score gauge',
  compliance: 'Sign-in locations, allowed and not',
  policy: "A sign-in policy's rules",
}

export function CardPicture({ hue, hot }: { hue: string; hot: boolean }) {
  const kind = kindOf(hue)
  const still = useReducedMotion()
  return (
    <motion.span
      className={`bgviz is-${kind}`}
      role="img"
      aria-label={LABEL[kind]}
      initial={false}
      animate={hot && !still ? 'hot' : 'rest'}
      variants={lift}
    >
      {kind === 'quick' && <Quick />}
      {kind === 'device' && <Device />}
      {kind === 'risk' && <Risk />}
      {kind === 'compliance' && <Compliance />}
      {kind === 'policy' && <Policy />}
    </motion.span>
  )
}
