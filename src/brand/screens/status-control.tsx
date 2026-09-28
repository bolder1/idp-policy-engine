import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'

import { StatusPill } from '../kit'
import type { RuleSet } from '../policy-draft'
import { useBrand } from '../store'
import { offersMonitoringView, portalRoot, statusOptions } from './status-options'
import { useStatusChange } from './use-status-change'

import './status-control.css'

/* The status pill, as a menu button where the policy can be switched.

   `edits` is the builder's rules when it holds changes nobody has saved, and
   undefined otherwise. A switch reads and writes the stored policy, so the
   edits are never what is monitored or switched off; given, the confirmation
   says so. Turning on is the one switch that can take them: Before turning
   on offers them as a version beside the stored one.

   A monitoring policy's menu ends, after a rule, with View monitoring: the
   Monitoring page opens over the board, as it does over the list. */
export function StatusControl({
  policyId,
  edits,
  onEditsFix,
  onRevealRule,
  onOpenBreakIn,
}: {
  policyId: string
  edits?: RuleSet
  /** The board: Before turning on's ready fix lands on its draft, with Undo. */
  onEditsFix?: (next: RuleSet, toast: string) => void
  /** The board: a rule reference on Before turning on shows the rule on the chain. */
  onRevealRule?: (index: number | null) => void
  /** The board, in Version 3: the guard page's Break-in row opens the test in the board's panel. */
  onOpenBreakIn?: () => void
}) {
  const store = useBrand()
  const policy = store.policyById(policyId)
  const { request, viewMonitoring, dialog } = useStatusChange({ unsaved: edits !== undefined, edits, onEditsFix, onRevealRule, onOpenBreakIn })
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  /* Which item takes focus when the menu opens: the first, or the last. */
  const startAt = useRef<'first' | 'last'>('first')
  const menuId = useId()

  const options = policy ? statusOptions(policy, { monitor: store.features.monitorMode }) : []
  const canView = !!policy && offersMonitoringView(policy, { monitor: store.features.monitorMode })

  const items = () => Array.from(pop.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const shut = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
  }, [open])

  useEffect(() => {
    if (!open || !pos) return
    const list = items()
    ;(startAt.current === 'last' ? list[list.length - 1] : list[0])?.focus()
  }, [open, pos])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (trigger.current?.contains(t) || pop.current?.contains(t)) return
      setOpen(false)
    }
    const onMove = (e: Event) => {
      if (e.target instanceof Node && pop.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  if (!policy) return null
  if (options.length === 0) return <StatusPill status={policy.status} />

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const move = (i: number) => list[(i + list.length) % list.length]?.focus()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(at + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(at < 0 ? -1 : at - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(-1)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        shut(true)
        break
      case 'Tab':
        e.preventDefault()
        shut(true)
        break
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`bxsc ${open ? 'is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Change status"
        onClick={() => {
          startAt.current = 'first'
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            startAt.current = e.key === 'ArrowUp' ? 'last' : 'first'
            setOpen(true)
          }
        }}
      >
        <StatusPill status={policy.status} />
        <ChevronDown size={12} strokeWidth={2.2} className="bxsc__chev" aria-hidden />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={pop}
              id={menuId}
              role="menu"
              aria-label={`Status of ${policy.name}`}
              className="bx-menu__pop bxsc__pop"
              style={{ top: pos.top, left: pos.left }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.13, ease: [0.2, 0, 0, 1] }}
              onKeyDown={onMenuKey}
            >
              {options.map((o) => (
                <button
                  key={o.target}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="bx-menu__item"
                  onClick={() => {
                    shut(true)
                    request(policy, o.target)
                  }}
                >
                  <span>
                    <strong>{o.label}</strong>
                  </span>
                </button>
              ))}
              {canView && (
                <>
                  <div role="separator" className="bxsc__sep" />
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="bx-menu__item"
                    onClick={() => {
                      shut(true)
                      viewMonitoring(policy.id)
                    }}
                  >
                    <span>
                      <strong>View monitoring</strong>
                    </span>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        portalRoot(),
      )}

      {dialog}
    </>
  )
}
