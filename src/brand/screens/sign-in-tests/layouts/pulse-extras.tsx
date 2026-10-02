import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Info, TriangleAlert } from 'lucide-react'

import { WhatTheySee } from '../../testing/WhatTheySee'
import type { Finding } from '../conflicts'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   What opens under Pulse's answer (PulseLayout.tsx): the findings, each with
   its fix, or What they see — one at a time, on demand, brought into view.
   -------------------------------------------------------------------------- */

export function OutcomeExtras({ props, open, findings }: { props: RunLayoutProps; open: 'see' | 'findings' | null; findings: readonly Finding[] }) {
  const { screens, form, reduced } = props
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' }))
    return () => window.cancelAnimationFrame(id)
  }, [open, reduced])
  if (open === 'findings' && findings.length > 0) {
    return (
      <motion.div ref={ref} className="rl-pulse__card rl-pulse__extra" data-card role="note" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2 }}>
        <ul className="rl-pulse__flist">
          {findings.map((f, i) => (
            <li key={`${f.kind}:${i}`} className={f.tone === 'conflict' ? 'is-conflict' : undefined}>
              <span className="rl-pulse__fhead">
                {f.tone === 'conflict' ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                {f.title}
              </span>
              {f.line && f.line !== f.title && <span className="rl-pulse__fline">{f.line}</span>}
              {f.fix && <span className="rl-pulse__dfix">{f.fix}</span>}
            </li>
          ))}
        </ul>
      </motion.div>
    )
  }
  if (open === 'see' && screens.length > 0 && form.appId) {
    return (
      <motion.div ref={ref} className="rl-pulse__card rl-pulse__extra is-see" data-card initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2 }}>
        <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
      </motion.div>
    )
  }
  return null
}
