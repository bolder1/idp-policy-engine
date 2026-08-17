import { motion } from 'motion/react'
import { useId, useState } from 'react'
import { ChevronDown, Check, Command, Copy, LayoutGrid, ListFilter, ListOrdered, Plus, Redo2, Search, Swords, Undo2, X, XCircle, type LucideIcon } from 'lucide-react'

import type { Rule } from '../data'

/* -----------------------------------------------------------------------------
   The command bar.

   A builder with three workspaces, seven dialogs, an undo stack and a rule list
   of unbounded length does not fit its controls on one toolbar. Rather than
   nesting them into menus — which trades one discovery problem for a worse one
   — every action is reachable by name, including "go to rule 4".

   The command list is supplied by the host rather than assembled here, because
   what is available genuinely differs between hosts: only one of them has
   workspaces to switch between, and undo is only offered when there is
   something to undo.
   -------------------------------------------------------------------------- */

export interface Cmd {
  id: string
  label: string
  hint?: string
  icon?: LucideIcon
}

/** The actions every host has. `extra` carries anything host-specific, and the
    rule list is appended last because it is the longest and the least often
    what you came for. */
export function baseCommands(rules: Rule[], opts: { canUndo: boolean; canRedo: boolean; extra?: Cmd[] }): Cmd[] {
  const out: Cmd[] = [...(opts.extra ?? [])]
  out.push({ id: 'add', label: 'Add a rule', icon: Plus })
  out.push({ id: 'gauntlet', label: 'Run the gauntlet', hint: 'Deal 13 sign-in attempts at this policy', icon: Swords })
  out.push({ id: 'impact', label: 'Open the blast radius', hint: 'What this change does to the modelled world', icon: LayoutGrid })
  out.push({ id: 'test', label: 'Test one person', icon: Search })
  out.push({ id: 'log', label: 'Decision log', icon: ListFilter })
  out.push({ id: 'apps', label: 'Assign applications', icon: LayoutGrid })
  out.push({ id: 'template', label: 'Save as template', icon: Copy })
  out.push({ id: 'publish', label: 'Review and publish', icon: Check })
  if (opts.canUndo) out.push({ id: 'undo', label: 'Undo', icon: Undo2 })
  if (opts.canRedo) out.push({ id: 'redo', label: 'Redo', icon: Redo2 })
  rules.forEach((r, i) => out.push({ id: `rule:${i}`, label: `Go to rule ${i + 1} · ${r.name}`, icon: ListOrdered }))
  return out
}

export function CommandBar({
  commands,
  onRun,
  onClose,
}: {
  commands: Cmd[]
  onRun: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const listId = useId()

  const shown = commands.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()))
  const active = Math.min(cursor, Math.max(0, shown.length - 1))
  const activeId = shown[active] ? `${listId}-${shown[active].id}` : undefined

  /* The arrow keys move a highlight that focus never follows — focus stays in
     the field so you can keep typing. That is the right behaviour and it is
     invisible to a screen reader unless the relationship is declared: the input
     is a combobox controlling a listbox, and `aria-activedescendant` is what
     names the highlighted row as it changes. Without it, arrowing through this
     list is silent. */

  return (
    <motion.div
      className="bm__cmdscrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bm__cmd"
        role="dialog"
        aria-label="Actions"
        initial={{ opacity: 0, y: -8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bm__cmdbar">
          <Command size={14} strokeWidth={2} aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-label="Search actions"
            aria-expanded={shown.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            placeholder="Type an action, or a rule name…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') return onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, shown.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              }
              if (e.key === 'Enter' && shown[active]) onRun(shown[active].id)
            }}
          />
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <ul className="bm__cmdlist" id={listId} role="listbox" aria-label="Actions">
          {shown.map((c, i) => {
            const Ico = c.icon ?? ChevronDown
            return (
              <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === active}>
                {/* tabIndex -1: the list is arrowed through, not tabbed into,
                    so these must not become a second set of tab stops behind
                    the field that is driving them. */}
                <button
                  type="button"
                  tabIndex={-1}
                  className={i === active ? 'is-on' : ''}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onRun(c.id)}
                >
                  <Ico size={14} strokeWidth={1.9} aria-hidden />
                  <span>
                    {c.label}
                    {c.hint && <em>{c.hint}</em>}
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && (
            <li className="bm__cmdempty">
              <XCircle size={14} strokeWidth={1.9} aria-hidden /> Nothing matches “{q}”.
            </li>
          )}
        </ul>
      </motion.div>
    </motion.div>
  )
}
