import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Badge, Button } from '../../kit'
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
    <AnchoredPopover anchor={anchor} open={open} onClose={onClose} label="Nothing else matched changed" width={340} focusFirst={false} follow beside className="bdf">
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
    </AnchoredPopover>
  )
}
