import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, Clock, FileText, type LucideIcon, Search, ShieldCheck, UserRound, Users, Library } from 'lucide-react'

import { appRoot, useDialogChrome } from './dialog-chrome'
import { buildIndex, hitFor, pushRecent, search, type Hit, type HitKind, type SearchSources } from './global-search'
import { useBrand } from './store'

/* Global search: the top bar's field and the palette it opens (global-search.ts). */

const KIND_ICON: Record<HitKind, LucideIcon> = {
  page: FileText,
  policy: ShieldCheck,
  app: AppWindow,
  user: UserRound,
  group: Users,
  library: Library,
}

/* The pages opened most recently, for this visit: a prototype with seed data has nothing to remember between visits. */
let recent: string[] = []

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function GlobalSearch({ pages }: { pages: SearchSources['pages'] }) {
  const store = useBrand()
  const { screen, go } = store
  const [open, setOpen] = useState(false)
  const key = isMac() ? '⌘K' : 'Ctrl+K'

  const index = useMemo(
    () =>
      buildIndex({
        pages,
        policies: store.policies,
        apps: store.apps,
        users: store.users,
        groups: store.groups,
        zones: store.zones,
        fingerprints: store.fingerprints,
        riskProfiles: store.riskProfiles,
        hooks: store.hooks,
      }),
    [pages, store.policies, store.apps, store.users, store.groups, store.zones, store.fingerprints, store.riskProfiles, store.hooks],
  )

  /* Every place opened goes to the front of Recent. */
  const indexRef = useRef(index)
  indexRef.current = index
  useEffect(() => {
    const hit = hitFor(indexRef.current, screen)
    if (hit) recent = pushRecent(recent, hit.id)
  }, [screen])

  /* Ctrl+K (⌘K on a Mac) opens it from anywhere, and shuts it again. */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  return (
    <>
      <button type="button" className="bsearch__field" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
        <Search size={16} strokeWidth={1.8} aria-hidden />
        <span className="bsearch__ph">Search</span>
        <kbd className="bsearch__kbd">{key}</kbd>
      </button>
      <Palette
        open={open}
        onClose={() => setOpen(false)}
        index={index}
        onPick={(hit) => {
          setOpen(false)
          go(hit.screen)
        }}
      />
    </>
  )
}

function Palette({ open, onClose, index, onPick }: { open: boolean; onClose: () => void; index: Hit[]; onPick: (hit: Hit) => void }) {
  const panel = useRef<HTMLDivElement | null>(null)
  useDialogChrome(open, onClose, panel)
  const reduced = useReducedMotion() ?? false
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = useId()

  useEffect(() => {
    if (open) {
      setQ('')
      setAt(0)
    }
  }, [open])

  const groups = q.trim()
    ? search(index, q)
    : [
        {
          kind: 'recent' as const,
          heading: 'Recent',
          hits: recent.map((id) => index.find((h) => h.id === id)).filter((h): h is Hit => !!h),
        },
      ].filter((g) => g.hits.length)
  const flat = groups.flatMap((g) => g.hits)
  const current = flat[Math.min(at, flat.length - 1)]

  /* The highlighted row stays in view as the arrows move it. */
  useEffect(() => {
    if (!current) return
    panel.current?.querySelector(`[data-hit="${CSS.escape(current.id)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="bx-scrim bsearch__scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : undefined}
          onClick={onClose}
        >
          <motion.div
            className="bsearch"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            ref={panel}
            tabIndex={-1}
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bsearch__bar">
              <Search size={18} strokeWidth={1.8} aria-hidden />
              <input
                className="bsearch__input"
                autoFocus
                value={q}
                placeholder="Search"
                aria-label="Search"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={list}
                aria-activedescendant={current ? `${list}-${current.id}` : undefined}
                aria-autocomplete="list"
                onChange={(e) => {
                  setQ(e.target.value)
                  setAt(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    if (!flat.length) return
                    setAt((i) => (Math.min(i, flat.length - 1) + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length)
                  } else if (e.key === 'Enter' && current) {
                    e.preventDefault()
                    onPick(current)
                  }
                }}
              />
            </div>
            <div className="bsearch__list" id={list} role="listbox" aria-label="Results">
              {groups.map((g) => (
                <div key={g.kind} role="group" aria-label={g.heading} className="bsearch__group">
                  <p className="bsearch__heading" aria-hidden>
                    {g.heading}
                  </p>
                  {g.hits.map((hit) => {
                    const Ico = g.kind === 'recent' ? Clock : KIND_ICON[hit.kind]
                    const on = hit === current
                    return (
                      <div
                        key={hit.id}
                        id={`${list}-${hit.id}`}
                        data-hit={hit.id}
                        role="option"
                        aria-selected={on}
                        className={`bsearch__hit${on ? ' is-on' : ''}`}
                        onPointerMove={() => setAt(flat.indexOf(hit))}
                        onClick={() => onPick(hit)}
                      >
                        <Ico className="bsearch__ico" size={16} strokeWidth={1.8} aria-hidden />
                        <span className="bsearch__label">{hit.label}</span>
                        {hit.meta && <span className="bsearch__meta">{hit.meta}</span>}
                      </div>
                    )
                  })}
                </div>
              ))}
              {q.trim() && !flat.length && <p className="bsearch__empty">No results for “{q.trim()}”</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    appRoot(),
  )
}
