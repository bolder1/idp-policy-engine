import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, ListChecks, X } from 'lucide-react'

import type { Policy, Rule } from '../../data'
import type { Diagnostic } from '../diagnostics'
import type { SimEnv } from '../simulate'
import { CheckTab } from './CheckTab'
import { ImpactTab } from './ImpactTab'
import type { Selection, Tab, Trace } from './model'

/* -----------------------------------------------------------------------------
   Where the whole-policy questions live.

   "Is this safe?" and "what changes?" spent a while in the inspector's tab
   strip, and were taken out of it for a good reason: the inspector is about
   the card you clicked, and a pane dedicated to one rule cannot also be a pane
   about all of them. The seam showed — clicking a card and seeing its settings
   depended on which tab you had been on last.

   But taking them out left them nowhere, so for a while nothing imported
   either file and neither question could be asked at all.

   A sheet over the stage is the answer, and the shape carries the argument:
   it is MODAL to the board rather than beside it, because reading impact and
   editing a rule are different activities and the screen should say so. It
   covers the cards, which is the point — you are not editing while you are
   here — and the inspector keeps its own space to the right, still showing
   whatever is selected, so jumping from a finding to the rule it names leaves
   you somewhere that makes sense.

   Not a Modal from the kit: a scrim would put the board behind glass, and the
   board is the thing every row in here points at. The chain stays lit, and
   clicking a rule the sheet names takes you to it.
   -------------------------------------------------------------------------- */

const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: 'check', label: 'Check', icon: ListChecks },
  { id: 'impact', label: 'What changes', icon: Activity },
]

export function BoardSheet({
  tab,
  onTab,
  onClose,
  draft,
  saved,
  dirty,
  env,
  diagnostics,
  trace,
  onTrace,
  onSelect,
  onApplyRules,
}: {
  /** Null when the sheet is shut. */
  tab: Tab | null
  onTab: (t: Tab) => void
  onClose: () => void
  draft: Policy
  saved: Policy
  dirty: boolean
  env: SimEnv
  diagnostics: Diagnostic[]
  trace: Trace | null
  onTrace: (t: Trace | null) => void
  onSelect: (s: Selection) => void
  onApplyRules: (rules: Rule[], note: string) => void
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  /* Focus goes in and comes back.

     Remembered before the sheet takes focus, restored when it closes, so
     opening Check from the toolbar and shutting it again leaves the keyboard
     where it was rather than at the top of the document. */
  useEffect(() => {
    if (!tab) return
    returnTo.current = document.activeElement as HTMLElement
    const id = requestAnimationFrame(() => panel.current?.focus())
    return () => {
      cancelAnimationFrame(id)
      returnTo.current?.focus?.()
    }
  }, [!!tab])

  /* Escape shuts the sheet and stops there.

     The board's own Escape clears the rehearsal and then the selection, and it
     is bound to `window`. Without `stopPropagation` one press would close the
     sheet AND throw away whichever rule you had been looking at — the same
     leak the condition picker had. */
  useEffect(() => {
    if (!tab) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [tab, onClose])

  return (
    <AnimatePresence>
      {tab && (
        <motion.section
          ref={panel}
          className="bb__sheet"
          tabIndex={-1}
          role="region"
          aria-label="Checks and impact"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 40 }}
        >
          <header className="bb__sheethead">
            <div className="bb__sheettabs" role="tablist" aria-label="Checks and impact">
              {TABS.map((t) => {
                const Ico = t.icon
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`bb-sheet-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls="bb-sheet-panel"
                    tabIndex={tab === t.id ? 0 : -1}
                    className={tab === t.id ? 'is-on' : ''}
                    onClick={() => onTab(t.id)}
                    onKeyDown={(e) => {
                      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key as 'ArrowRight']
                      if (!d) return
                      e.preventDefault()
                      const i = TABS.findIndex((x) => x.id === tab)
                      onTab(TABS[(i + d + TABS.length) % TABS.length].id)
                    }}
                  >
                    <Ico size={14} strokeWidth={2} aria-hidden />
                    {t.label}
                  </button>
                )
              })}
            </div>
            <button type="button" className="bb__act" aria-label="Close" title="Close (Esc)" onClick={onClose}>
              <X size={15} strokeWidth={2} />
            </button>
          </header>

          {/* A real tabpanel, named by its tab. The inspector's old strip never
              had one — no `aria-controls`, no `role="tabpanel"` — so the tabs
              announced themselves as controlling nothing. */}
          <div className="bb__sheetbody" id="bb-sheet-panel" role="tabpanel" aria-labelledby={`bb-sheet-tab-${tab}`}>
            {tab === 'check' ? (
              <CheckTab
                draft={draft}
                saved={saved}
                dirty={dirty}
                env={env}
                diagnostics={diagnostics}
                trace={trace}
                onTrace={onTrace}
                onSelect={onSelect}
                onTab={onTab}
                onClose={onClose}
                onApplyRules={onApplyRules}
              />
            ) : (
              <ImpactTab draft={draft} saved={saved} dirty={dirty} env={env} diagnostics={diagnostics} onSelect={onSelect} onClose={onClose} />
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
