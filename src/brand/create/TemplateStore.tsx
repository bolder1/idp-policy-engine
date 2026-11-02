import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutTemplate, Store, X } from 'lucide-react'

import { SearchBox } from '../kit'
import { useDialogChrome } from '../dialog-chrome'
import { EmptyState, NoMatches } from '../empty'
import type { Scenario } from '../data'
import { useBrand } from '../store'
import { addedFromStore, scenarioFromStore } from '../template-from-policy'
import type { TemplateLibrary } from '../screens/board/apply-template'
import type { WhoDirectory } from '../rule-who'
import { TemplateCard, TemplatePreview, scenarioCard } from './TemplateCard'

/* -----------------------------------------------------------------------------
   The Xecurify template store (owner, 30 Oct 2026: "move this Xecurify template to a dedicated popup … as a store …
   how Figma Community works, treat it like that").

   The Templates page is the tenant's own shelf, as Figma's Drafts are a person's own files; the templates miniOrange
   ships live here, apart from it, as the Community does. In Figma a Community file's page shows the file and a preview,
   and "Open in Figma" puts a copy in your drafts that later changes to the original never reach (help.figma.com,
   "Duplicate Community files"). So a card here does one thing, Add: it copies the template into Your templates
   (`scenarioFromStore`) and then says Added where the button was. The copy is the tenant's to use, keep or delete;
   deleting it brings Add back.

   The categories are the rail, because in the store they are the one way to narrow it: the board's gallery has two
   shelves to choose between and puts the category in a dropdown, and here there is one shelf. The sheet, the band
   with the search and the grid are the gallery's own (`.bmarket`, create.css), so the two catalogues look alike.
   -------------------------------------------------------------------------- */

const CATS = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized'] as const
type Cat = (typeof CATS)[number]

function hit(s: Scenario, q: string) {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

export function TemplateStore({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useBrand()
  const { scenarios, users, zones, fingerprints } = store
  const [cat, setCat] = useState<Cat | 'All'>('All')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)
  const sheet = useRef<HTMLDivElement>(null)

  /* Built the way Use builds them, so a card shows the rules a policy made from the copy would get. */
  const library = useMemo<TemplateLibrary>(() => ({ zones, fingerprints }), [zones, fingerprints])
  const shipped = useMemo(() => scenarios.filter((s) => s.provided), [scenarios])
  const added = useMemo(() => addedFromStore(scenarios), [scenarios])
  /* Only categories something is filed under, so no entry leads to nothing. */
  const cats = CATS.filter((c) => shipped.some((s) => s.category === c))
  const list = shipped.filter((s) => (cat === 'All' || s.category === cat) && hit(s, q))
  const searching = q.trim() !== '' || cat !== 'All'

  /* Focus in, Tab kept inside, Escape peels one layer, focus back on close. */
  useDialogChrome(open, onClose, sheet)

  /* Cleared when it opens, so a search typed on one visit is not still filtering the next. */
  useEffect(() => {
    if (!open) return
    setCat('All')
    setQ('')
    setPreview(null)
  }, [open])

  /* A copy into Your templates, once: a template already there says Added and offers nothing. Undo takes the copy away. */
  const add = (s: Scenario) => {
    if (added.has(s.id)) return
    const id = store.addScenario(scenarioFromStore(s))
    store.showToast(`${s.name} added to your templates`, { label: 'Undo', run: () => store.removeScenario(id) })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bmarket"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-modal="true"
          aria-label="Xecurify templates"
        >
          <motion.div
            ref={sheet}
            tabIndex={-1}
            style={{ outline: 'none' }}
            className="bmarket__sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <button type="button" className="bmarket__x" onClick={onClose} aria-label="Close Xecurify templates">
              <X size={18} strokeWidth={1.9} />
            </button>

            <header className="bmarket__hero">
              <span className="bmarket__mark" aria-hidden>
                <Store size={17} strokeWidth={1.8} />
              </span>
              <h2>Xecurify templates</h2>
              <p className="bmarket__by">By miniOrange</p>
              <div className="bmarket__searchbox">
                <SearchBox block placeholder="Search templates" label="Search Xecurify templates" value={q} onChange={setQ} />
              </div>
            </header>

            <div className="bmarket__work">
              <aside className="bmarket__rail">
                <p className="bmarket__railhead">Categories</p>
                <div className="bmarket__cats" role="tablist" aria-label="Categories">
                  {(['All', ...cats] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={cat === c}
                      className={`bmarket__cat ${cat === c ? 'is-on' : ''}`}
                      onClick={() => setCat(c)}
                    >
                      <span>{c === 'All' ? 'All templates' : c}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="bmarket__body">
                <div className="bmarket__shelf">
                  <h3 className="bgal__section">{cat === 'All' ? 'All templates' : cat}</h3>
                </div>

                {list.length > 0 ? (
                  <div className="bgal__grid">
                    {list.map((s) => (
                      <StoreCard
                        key={s.id}
                        s={s}
                        directory={users}
                        library={library}
                        added={added.has(s.id)}
                        onAdd={() => add(s)}
                        onPreview={() => setPreview(s)}
                      />
                    ))}
                  </div>
                ) : searching ? (
                  <NoMatches
                    compact
                    noun="templates"
                    query={q}
                    filtered={cat !== 'All'}
                    onClear={() => {
                      setQ('')
                      setCat('All')
                    }}
                  />
                ) : (
                  <EmptyState compact icon={LayoutTemplate} title="No Xecurify templates" />
                )}
              </div>
            </div>
          </motion.div>

          {/* The template's own page: its rules in full, and the same Add. */}
          <TemplatePreview
            m={preview ? scenarioCard(preview, users, library) : null}
            onClose={() => setPreview(null)}
            useLabel="Add to your templates"
            onUse={
              preview && !added.has(preview.id)
                ? () => {
                    add(preview)
                    setPreview(null)
                  }
                : undefined
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StoreCard({
  s,
  directory,
  library,
  added,
  onAdd,
  onPreview,
}: {
  s: Scenario
  directory: WhoDirectory
  library: TemplateLibrary
  added: boolean
  onAdd: () => void
  onPreview: () => void
}) {
  const m = useMemo(() => scenarioCard(s, directory, library), [s, directory, library])
  return <TemplateCard m={m} onUse={onAdd} onPreview={onPreview} useLabel="Add" done={added ? 'Added' : undefined} />
}
