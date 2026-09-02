import { motion, useReducedMotion } from 'motion/react'
import { Trash2, X } from 'lucide-react'

import { IconButton } from '../kit'
import type { Rule } from '../data'
import { ThenSection, WhenSection } from './rule-form'
import type { SimContext } from './simulate'

/* -----------------------------------------------------------------------------
   The sheet — where a rule's structure is edited.

   Capped at 480px and pinned to the right of the grid, deliberately: the first
   three columns (`#`, `RULE`, `NARROWS TO`) and most of `WHEN` stay visible
   while you work, so you are editing a rule with the rules around it still on
   screen. A full-height detail pane structurally cannot promise that, which is
   the whole reason this is a sheet and not a pane.

   It hosts the shared composer rather than a copy of it. Both other builders
   render the same `WhenSection` and `ThenSection`, so a fix to either lands in
   all three — and the props it needs already exist: `chrome` off, because the
   grid row is the readback, and the catalogue hoisted, because the catalogue
   overlays a scroller and cannot live inside it.
   -------------------------------------------------------------------------- */

export function LedgerSheet({
  rule,
  index,
  ctx,
  catalogue,
  onCatalogue,
  onPatch,
  onClose,
  onDelete,
}: {
  rule: Rule
  index: number
  ctx: SimContext
  catalogue: string | null
  onCatalogue: (id: string | null) => void
  onPatch: (p: Partial<Rule>) => void
  onClose: () => void
  onDelete: () => void
}) {
  const reduce = useReducedMotion()

  return (
    <motion.aside
      className="bf3__sheet"
      role="dialog"
      aria-label={`Edit rule ${index + 1}`}
      initial={{ x: reduce ? 0 : 40, opacity: reduce ? 0 : 1 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: reduce ? 0 : 40, opacity: reduce ? 0 : 1 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <header className="bf3__sheethead">
        <span className="bf3__sheetn">{index + 1}</span>
        <input
          className="bf3__sheetname"
          aria-label="Rule name"
          value={rule.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        <IconButton icon={Trash2} label={`Delete ${rule.name}`} size="sm" tone="ghost" onClick={onDelete} />
        <IconButton icon={X} label="Close" size="sm" tone="ghost" onClick={onClose} />
      </header>

      <div className="bf3__sheetbody">
        <textarea
          className="bf3__sheetwhy"
          aria-label="Why this rule exists"
          rows={1}
          placeholder="Why does this rule exist? The next person will read this before changing it."
          value={rule.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />

        <WhenSection rule={rule} ctx={ctx} onPatch={onPatch} catalogue={catalogue} onCatalogue={onCatalogue} />
        <ThenSection rule={rule} onPatch={onPatch} bare />
      </div>
    </motion.aside>
  )
}
