import { ArrowRight, ShieldCheck, ShieldX } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Badge, Button } from '../../kit'
import { shows } from '../../rollout'
import { AnchoredPopover } from '../testing/AnchoredPopover'
import type { DefaultFlip } from './default-flip'
import './default-flip.css'

/* -----------------------------------------------------------------------------
   What the default's turn says (default-flip.ts; rollout.ts `defaultFlips`).

   The card changes colour where it stands and a ring runs round it (default-flip.css), so the eye goes to it; then
   this note opens beside it, once the card has settled under the rule that pushed it down. It shows the change itself,
   the old outcome struck through and the new one arriving, then one line on why. To Deny it offers Allow instead, which
   keeps the policy open and marks that as the admin's choice, and Got it. Back to Allow it only says so.

   It takes no focus: the admin is writing the rule they just added, and a press anywhere else puts it away.
   -------------------------------------------------------------------------- */

/* The card's layout spring, and a beat to see the colour change before the words. */
const AFTER_MS = 420

/* In colour (rollout.ts `flipNoteLook`; owner, 26 Nov 2026: "add some colors … focus on the allow and deny part so the
   user easily gets it … add some animation … both [buttons] have the same hierarchy"). The swap stands in a band of the
   new outcome's tint: the old outcome struck and faded, the arrow sliding in, the new one arriving with its shield and a
   single ping. The title colours the outcome's word. One primary: Keep Deny in the solid accent (never a second orange:
   the bar has Activate policy), Allow instead beside it as the secondary with Allow's green shield. */
const LOOK: boolean = shows('flipNoteLook')
/** The hero's three rings, innermost first, in px: the confirm hero's ripple at this card's size. */
const RINGS = [96, 150, 204] as const

function FlipLook({ toDeny, onAllow, onClose }: { toDeny: boolean; onAllow: () => void; onClose: () => void }) {
  const reduce = useReducedMotion()
  const was = toDeny ? 'Allow' : 'Deny'
  const now = toDeny ? 'Deny' : 'Allow'
  const after = (delay: number, from: Record<string, number>) =>
    reduce ? { initial: false as const } : { initial: from, animate: { opacity: 1, x: 0, scale: 1 }, transition: { type: 'spring' as const, stiffness: 520, damping: 26, delay } }
  return (
    <>
      {/* A hero, as the confirm popups have (owner, 26 Nov 2026: "make the top hero section bigger, as we have in the
          other, like discard or the popups"): a band washed in the new outcome's colour, rings rippling out from the
          middle, and the swap on a lit pill at its centre. The glow breathes; reduced motion holds it still. */}
      <div className="bdf__band" aria-hidden>
        <span className="bdf__rings">
          {RINGS.map((size, i) => (
            <motion.i
              key={size}
              style={{ width: size, height: size }}
              initial={reduce ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.2, 0, 0, 1], delay: 0.05 + i * 0.08 }}
            />
          ))}
        </span>
        <motion.span className="bdf__swaprow" {...after(0, { opacity: 0, scale: 0.92 })}>
          <span className="bdf__was">
            <Badge tone={toDeny ? 'positive' : 'negative'}>{was}</Badge>
          </span>
          <motion.span className="bdf__arrowwrap" {...after(0.12, { opacity: 0, x: -6 })}>
            <ArrowRight size={16} strokeWidth={2.2} className="bdf__arrow" />
          </motion.span>
          <span className="bdf__now">
            {!reduce && (
              <motion.span
                className="bdf__ping"
                initial={{ opacity: 0.55, scale: 1 }}
                animate={{ opacity: 0, scale: 1.7 }}
                transition={{ duration: 0.9, ease: [0.2, 0, 0, 1], delay: 0.4 }}
              />
            )}
            <motion.span className="bdf__nowbadge" {...after(0.24, { opacity: 0, scale: 0.6 })}>
              <Badge tone={toDeny ? 'negative' : 'positive'} icon={toDeny ? ShieldX : ShieldCheck}>
                {now}
              </Badge>
            </motion.span>
          </span>
        </motion.span>
      </div>
      <div className="bdf__body">
        <p className="bdf__title">
          {toDeny ? 'Nothing else matched is now ' : 'Nothing else matched is '}
          <span className="bdf__word">{now}</span>
          {toDeny ? '' : ' again'}
        </p>
        <p className="bdf__line">
          {toDeny
            ? 'With a rule in place, a sign-in that no rule matches is denied. With no rules, every sign-in was allowed with a password.'
            : 'With no rules, every sign-in is allowed with a password.'}
        </p>
        <div className="bdf__acts">
          {toDeny && (
            <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={onAllow}>
              Allow instead
            </Button>
          )}
          {/* The note's one primary, in the solid accent (default-flip.css `.bdf.is-look`). */}
          <Button variant="neutral" size="sm" onClick={onClose}>
            {toDeny ? 'Keep Deny' : 'Got it'}
          </Button>
        </div>
      </div>
    </>
  )
}

export function DefaultFlipNote({ flip, stamp, onAllow, onClose }: { flip: DefaultFlip; stamp: number; onAllow: () => void; onClose: () => void }) {
  const reduce = useReducedMotion()
  const anchor = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(false)
    const t = window.setTimeout(
      () => {
        anchor.current = document.getElementById('bb-terminal-title')?.closest<HTMLElement>('.bb__card') ?? null
        /* No card on screen (the start chooser came back with no rules left): nothing to point at. */
        if (anchor.current) setOpen(true)
        else onClose()
      },
      reduce ? 0 : AFTER_MS,
    )
    return () => window.clearTimeout(t)
    /* Once per turn: `stamp` is new each time. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, reduce])

  const toDeny = flip === 'to-deny'
  const was = toDeny ? 'Allow' : 'Deny'
  const now = toDeny ? 'Deny' : 'Allow'
  return (
    <AnchoredPopover
      anchor={anchor}
      open={open}
      onClose={onClose}
      label="Nothing else matched changed"
      width={340}
      focusFirst={false}
      follow
      beside
      className={LOOK ? `bdf is-look ${toDeny ? 'is-to-deny' : 'is-to-allow'}` : 'bdf'}
    >
      {LOOK ? (
        <FlipLook toDeny={toDeny} onAllow={onAllow} onClose={onClose} />
      ) : (
      <>
      <div className="bdf__swap" aria-hidden>
        <span className="bdf__was">
          <Badge tone={toDeny ? 'positive' : 'negative'}>{was}</Badge>
        </span>
        <ArrowRight size={14} strokeWidth={2} className="bdf__arrow" />
        <motion.span
          className="bdf__now"
          initial={reduce ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 24, delay: 0.22 }}
        >
          <Badge tone={toDeny ? 'negative' : 'positive'}>{now}</Badge>
        </motion.span>
      </div>
      <p className="bdf__title">{toDeny ? 'Nothing else matched is now Deny' : 'Nothing else matched is Allow again'}</p>
      <p className="bdf__line">
        {toDeny
          ? 'With a rule in place, a sign-in that no rule matches is denied. With no rules, every sign-in was allowed with a password.'
          : 'With no rules, every sign-in is allowed with a password.'}
      </p>
      <div className="bdf__acts">
        {toDeny && (
          <Button variant="secondary" size="sm" onClick={onAllow}>
            Allow instead
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Got it
        </Button>
      </div>
      </>
      )}
    </AnchoredPopover>
  )
}
