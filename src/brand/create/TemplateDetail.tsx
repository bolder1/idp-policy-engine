import { useState } from 'react'
import { motion } from 'motion/react'

import { Button, DecisionChip } from '../kit'
import type { Policy } from '../data'
import { ReadOnlyCanvas } from '../screens/sign-in-tests/InspectPanel'
import { UsedBy, catKey, type CardModel } from './TemplateCard'

/* -----------------------------------------------------------------------------
   A template's own page, inside the popup that lists it (owner, 2 Nov 2026: "on click, change the whole popup, don't
   open one after another … a way to change template, or back"; "show the whole canvas").

   Laid out for its content (owner, same day: "this part is very bad, give more space … fix the layout for the
   content"): a header across the full width, with the shelf, the name and what it does on the left and Change and Use
   on the right; then the rules on the builder's canvas, read only, across
   the full width, every card open ("by default make the card open"). Each card says its outcome where its state pill
   was. It fades in where the grid was; nothing on it moves after that.
   -------------------------------------------------------------------------- */

export function TemplateDetail({
  m,
  policy,
  changeLabel,
  useLabel,
  onBack,
  onUse,
}: {
  m: CardModel
  /** The rules as Use would write them, in a policy the canvas can draw. */
  policy: Policy
  /** "Change template": back to the grid, beside Use. */
  changeLabel: string
  useLabel: string
  onBack: () => void
  /** Absent where it cannot be used: no rules apply. */
  onUse?: () => void
}) {
  const hue = m.category ? catKey(m.category) : (m.tone ?? 'neutral')
  /* Every card open to start with; a press on one folds it, and another opens it again. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([...policy.rules.map((r) => r.id), 'fallback']))
  const toggle = (id: string | null) => {
    if (id === null) return
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const head = (id: string) => {
    const d = id === 'fallback' ? policy.fallback?.decision : policy.rules.find((r) => r.id === id)?.decision
    return d ? <DecisionChip decision={d} size="sm" /> : undefined
  }

  return (
    /* A plain fade in (owner, same day: "change the preview animation to a basic one"). */
    <motion.section
      className={`bdetail is-cat-${hue}`}
      aria-label={m.name}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="bdetail__head">
        <div className="bdetail__words">
          {m.category && <span className="bdetail__cat">{m.category}</span>}
          <h3 className="bdetail__name">{m.name}</h3>
          {m.apps && m.apps.length > 0 ? <UsedBy apps={m.apps} /> : <p className="bdetail__sub">{m.description}</p>}
          {(m.dropped?.length ?? 0) > 0 && <p className="bprev__note">Not included: {m.dropped!.join(', ')}. These rules apply to nobody.</p>}
          {(m.needs ?? []).map((n) => (
            <p key={n} className="bprev__note">
              {n === 'zone' ? 'Needs a network zone. Add one, then choose it in the rule.' : 'Needs a device profile. Add one, then choose it in the rule.'}
            </p>
          ))}
        </div>
        {/* Change beside Use, where Back and the facts line were (owner, same day: "remove this, and add a Change
            template button with Use this template, to save space"; the facts: "remove"). */}
        <div className="bdetail__actions">
          <Button onClick={onBack}>{changeLabel}</Button>
          {onUse && (
            <Button variant="brand" onClick={onUse}>
              {useLabel}
            </Button>
          )}
        </div>
      </header>
      <div className="bdetail__canvas">
        <ReadOnlyCanvas policy={policy} traced={[]} still idPrefix="tpl-" cardHead={head} open={open} onOpen={toggle} />
      </div>
    </motion.section>
  )
}
