import { useState } from 'react'
import { motion } from 'motion/react'

import { ArrowLeft, Eye } from 'lucide-react'

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

/** The preview's heading, which sits in the popup's header (owner, 3 Nov 2026: "move the heading and subheading to the header,
    a sticky footer, and the rules scrolling between"): Back, the name with a Preview chip, then what it is or where it runs. */
export function DetailHead({ m, backLabel, onBack }: { m: CardModel; backLabel: string; onBack: () => void }) {
  return (
    <div className="bdetail__head">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
        {backLabel}
      </Button>
      <div className="bdetail__words">
        <div className="bdetail__titlerow">
          <h3 className="bdetail__name">{m.name}</h3>
        </div>
        {m.apps && m.apps.length > 0 ? <UsedBy apps={m.apps} /> : <p className="bdetail__sub">{m.description}</p>}
        {(m.dropped?.length ?? 0) > 0 && <p className="bprev__note">Not included: {m.dropped!.join(', ')}. These rules apply to nobody.</p>}
        {(m.needs ?? []).map((n) => (
          <p key={n} className="bprev__note">
            {n === 'zone' ? 'Needs a network zone. Add one, then choose it in the rule.' : 'Needs a device profile. Add one, then choose it in the rule.'}
          </p>
        ))}
      </div>
    </div>
  )
}

export function TemplateDetail({
  m,
  policy,
  useLabel,
  onUse,
}: {
  m: CardModel
  /** The rules as Use would write them, in a policy the canvas can draw. */
  policy: Policy
  useLabel: string
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
      <div className="bdetail__canvas">
        {/* A read-only preview, said on the canvas itself (owner, 3 Nov 2026: "move the preview inside the canvas, a good preview chip"). */}
        <span className="bdetail__chip">
          <Eye size={14} strokeWidth={2} aria-hidden />
          Preview
        </span>
        <ReadOnlyCanvas policy={policy} traced={[]} still idPrefix="tpl-" cardHead={head} open={open} onOpen={toggle} />
      </div>
      <footer className="bdetail__foot">
        <p className="bdetail__footnote">{m.category ? "Only the template's rules are brought in. The template is not changed." : 'Only the rules are brought in, not its applications. The original policy is not changed.'}</p>
        {onUse && (
          <Button variant="brand" onClick={onUse}>
            {useLabel}
          </Button>
        )}
      </footer>
    </motion.section>
  )
}
