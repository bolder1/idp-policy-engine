import { useEffect, useMemo, useState } from 'react'

import type { Policy } from '../../data'
import { useBrand } from '../../store'
import { copyNotes, policySources, templateSources, type PickSource } from './copy-rules'

/** What the picker lists: policies to copy from, or templates to start from. */
export type PickFrom = 'policy' | 'template'

export const PICK_TITLE: Record<PickFrom, string> = { policy: 'Reuse an existing policy', template: 'Xecurify templates' }

/** The two shelves of Use template, should Use existing policy ever sit inside it. */
export type Shelf = 'templates' | 'policies'

export const SHELVES: { value: Shelf; label: string }[] = [
  { value: 'templates', label: 'Templates' },
  { value: 'policies', label: 'Your policies' },
]

/* The choosing behind Copy from a policy and Use a template, for every place that shows it: New policy's slider, and
   the builder's empty board and ⋯. One source at a time, taken whole; its rules are there to read, not to tick.

   `withPolicies` puts the tenant's own policies on a second shelf of Use a template, for the version where Copy from a
   policy is not a way of its own (owner, 2 Nov 2026). */
export function useRulePicker(open: boolean, target: Policy, from: PickFrom, withPolicies = false) {
  const { policies, apps, scenarios, users, groups, hooks, zones, fingerprints } = useBrand()
  const [q, setQ] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [shelf, setShelfState] = useState<Shelf>('templates')

  /* Empty each time it opens: a search or a pick from an earlier visit would be a choice nobody made on this one. */
  useEffect(() => {
    if (!open) return
    setQ('')
    setSourceId(null)
    setShelfState('templates')
  }, [open, from])

  const shelves = from === 'template' && withPolicies
  const lists: PickFrom = from === 'policy' || (shelves && shelf === 'policies') ? 'policy' : 'template'
  /* Built once per change to what they read, so a template's rules keep their ids while it is being looked at. */
  const sources = useMemo<PickSource[]>(
    () => (lists === 'policy' ? policySources(policies, target, apps) : templateSources(scenarios, users, { zones, fingerprints })),
    [lists, policies, target, apps, scenarios, users, zones, fingerprints],
  )
  const shown = sources.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()))
  /* Starts on the first, so the right side is never blank. */
  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const notes = useMemo(
    () => (open && source ? copyNotes(target, source.rules, { groups, hooks, users, zones, fingerprints }) : new Map<string, string>()),
    [open, source, target, groups, hooks, users, zones, fingerprints],
  )
  /* A shelf starts on its own first item, with the search cleared. */
  const setShelf = (s: Shelf) => {
    setShelfState(s)
    setSourceId(null)
    setQ('')
  }

  return { from, lists, q, setQ, shown, source, notes, choose: setSourceId, any: sources.length > 0, shelves, shelf, setShelf }
}

export type RulePicker = ReturnType<typeof useRulePicker>
