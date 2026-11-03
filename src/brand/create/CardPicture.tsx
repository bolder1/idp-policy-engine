import { Check, Laptop, MapPin, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

import { DecisionChip } from '../kit'

/* -----------------------------------------------------------------------------
   The template card's picture: a small piece of the product its shelf is about, in place of the template's live rules
   (owner, 2 Nov 2026: "real-time showcase might be a problem"; pointing at Profound's feature cards, "this kind of card
   design"; "one generic per category … five of them"; and, after a pass of bare skeletons, "the last one serves a
   purpose, revert to that concept").

   One panel per shelf, with real words and sample numbers, the same for every template on it, so a new template needs
   nothing drawn:
   · Quick protection: the second factor's code screen.
   · Device-based: a device check.
   · Risk-based: a risk score gauge.
   · Compliance: where a sign-in may come from.
   · A tenant's own policy (the reuse picker), or anything without a shelf: a sign-in policy's rules.
   Light mode, tokens only, 12px at the smallest. On hover the panel lifts a little and plays its use, then holds (owner,
   same day: "I like the whole hover animation as it used to be … it should give the user the overview of the use of
   that policy"): the code's digits arrive, the device's checks tick, the gauge fills to its score, the places reveal.
   Motion props move it; with reduced motion nothing does.
   -------------------------------------------------------------------------- */

type Kind = 'quick' | 'device' | 'risk' | 'compliance' | 'policy'

/** Which panel: a shelf's key (TemplateCard.tsx `catKey`), or the tone of a card that has none. */
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

const kindOf = (hue: string): Kind => (hue === 'quick' || hue === 'device' || hue === 'risk' || hue === 'compliance' ? hue : 'policy')

function Head({ icon: Icon, title, end }: { icon: LucideIcon; title: string; end?: ReactNode }) {
  return (
    <span className="bgviz__head">
      <span className="bgviz__icon" aria-hidden>
        <Icon size={13} strokeWidth={2} />
      </span>
      <span className="bgviz__title">{title}</span>
      {end}
    </span>
  )
}

function Quick() {
  return (
    <>
      <Head icon={Smartphone} title="Verify it's you" end={<DecisionChip decision="2fa" size="sm" />} />
      <span className="bgviz__code">
        {'482913'.split('').map((c, i) => (
          <motion.span key={i} variants={reveal} custom={0.08 + i * 0.07}>
            {c}
          </motion.span>
        ))}
      </span>
      <span className="bgviz__note">Sent to ••• 4821</span>
    </>
  )
}

function Device() {
  return (
    <>
      <Head icon={Laptop} title="Device check" end={<span className="bgviz__pill">Compliant</span>} />
      {['Registered device', 'OS up to date', 'Screen lock on'].map((label, i) => (
        <span key={label} className="bgviz__row">
          <span>{label}</span>
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
        <text className="bgviz__tickmark" x="20" y="122" textAnchor="middle">
          0
        </text>
        <text className="bgviz__tickmark" x="180" y="122" textAnchor="middle">
          100
        </text>
      </svg>
      <span className="bgviz__score">
        <span className="bgviz__note">Risk score</span>
        <strong>72</strong>
        <span className="bgviz__pill">High</span>
      </span>
    </span>
  )
}

function Compliance() {
  return (
    <>
      <Head icon={MapPin} title="Sign-in location" />
      <motion.span className="bgviz__row" variants={reveal} custom={0.1}>
        <span className="bgviz__where">
          <MapPin size={13} strokeWidth={2} aria-hidden />
          Allowed region
        </span>
        <DecisionChip decision="1fa" size="sm" />
      </motion.span>
      <motion.span className="bgviz__row" variants={reveal} custom={0.22}>
        <span className="bgviz__where">
          <MapPin size={13} strokeWidth={2} aria-hidden />
          Anywhere else
        </span>
        <DecisionChip decision="deny" size="sm" />
      </motion.span>
    </>
  )
}

function Policy() {
  return (
    <>
      <Head icon={ShieldCheck} title="Sign-in policy" />
      {(
        [
          ['Office network', '1fa'],
          ['New device', '2fa'],
          ['Everyone else', 'deny'],
        ] as const
      ).map(([label, d], i) => (
        <motion.span key={label} className="bgviz__row" variants={reveal} custom={0.1 + i * 0.1}>
          <span>{label}</span>
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
