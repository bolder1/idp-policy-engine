import { motion } from 'motion/react'
import { X } from 'lucide-react'

import { Mark } from './synapse-parts'
import type { PeekLine } from './synapse-peek-utils'

/* A hovered, focused or pressed neuron's card (SynapseLayout.tsx); what it
   says is synapse-peek-utils.ts. */

export function PeekCard({ lines, x, y, w, pinned, play, onClose }: { lines: readonly PeekLine[]; x: number; y: number; w: number; pinned: boolean; play: boolean; onClose: () => void }) {
  if (lines.length === 0) return null
  return (
    <motion.div className={`rl-synapse__peek${pinned ? ' is-pinned' : ''}`} role="note" data-card style={{ left: x, top: y, width: w }} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.14 : 0 }}>
      <ul className="rl-synapse__peeklines">
        {lines.map((l, i) => (
          <li key={`${i}:${l.text}`} className={`${i === 0 ? 'is-lead' : ''}${l.quiet ? ' is-quiet' : ''}${l.tone ? ` is-${l.tone}` : ''}`}>
            <span className="rl-synapse__peektext">
              {l.text}
              {l.sub && <span className="rl-synapse__peeksub">{l.sub}</span>}
            </span>
            {l.mark && <Mark status={l.mark} size={12} />}
          </li>
        ))}
      </ul>
      {pinned && (
        <button type="button" className="rl-synapse__x rl-synapse__peekx" aria-label="Close" onClick={onClose}>
          <X size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </motion.div>
  )
}
