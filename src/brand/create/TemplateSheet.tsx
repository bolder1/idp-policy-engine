import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useRef } from 'react'
import { BookmarkPlus, LayoutTemplate, Store, X } from 'lucide-react'

import { Button, SearchBox } from '../kit'
import { useDialogChrome } from '../dialog-chrome'
import { EmptyState, NoMatches } from '../empty'
import { Picker } from '../picker'
import type { AccessDecision, Scenario } from '../data'
import { useBrand } from '../store'
import type { TemplateLibrary } from '../screens/board/apply-template'
import type { WhoDirectory } from '../rule-who'
import { TemplateCard, TemplatePreview, scenarioCard } from './TemplateCard'

/* -----------------------------------------------------------------------------
   The template picker.

   It was the second half of a Create Policy PAGE: you clicked "New policy",
   met a gallery, chose a template, and only then were asked what the policy
   was called. That put the catalogue before the decision it decorates — most
   people know what they are protecting before they know which ready-made set
   of rules to start from. The order is reversed now: the form comes first and
   lands you in the builder, and the catalogue is offered from the empty board,
   where taking a template is an edit to a real policy that undo can put back.

   TWO AXES, TWO CONTROLS. The rail used to carry six entries — All, Yours, and
   the four content categories — which is one control doing two unrelated jobs:
   who wrote it, and what it is for. Picked apart, the shelf is a two-way choice
   that belongs in the rail, and the category is a filter that belongs above the
   grid it filters. So: two entries down the side, one dropdown over one flat
   list.

   Note the consequence, because it is real and it is not a bug: both templates
   this tenant wrote are Compliance ones, so filtering the Xecurify shelf to
   Compliance shows one of the three the catalogue holds. The dropdown shows no
   counts, and the page and its empty state point at the other shelf when that
   is where the rest are.
   -------------------------------------------------------------------------- */

/** Who wrote it. The rail's whole job. */
type Shelf = 'mine' | 'xecurify'

/** What it is for. The dropdown's whole job. `Uncategorized` is listed only when the shelf holds one. */
const CATS = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized'] as const
type Cat = (typeof CATS)[number]

function hit(s: Scenario, q: string) {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

/* `toneOf` stood here, mapping the shelf and the filter onto one of six words
   for the header band to paint itself with. The band paints one colour now —
   see the note on `.bmarket__hero` — so there is nothing to map.

   The category's colour did not go anywhere: it is on the cards, in
   `.bgcard__cat`, which is the surface the category is actually about.

*/

export function TemplateSheet({
  open,
  onClose,
  onChoose,
  fallback = '1fa',
}: {
  open: boolean
  onClose: () => void
  /** Hands back the chosen template. What is done with its rules is the host's. */
  onChoose: (s: Scenario) => void
  /** What the host policy's default decides, drawn as the last row of every template. */
  fallback?: AccessDecision
}) {
  const [shelf, setShelf] = useState<Shelf>('xecurify')
  const [cat, setCat] = useState<Cat | 'All'>('All')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)
  const sheet = useRef<HTMLDivElement>(null)

  /* From the store, so a template saved from a policy is on the tenant's shelf
     the next time this opens. The directory and library are the ones applying
     uses, so a card never lists a rule that applying leaves out. */
  const { scenarios, users, zones, fingerprints } = useBrand()
  const library = useMemo<TemplateLibrary>(() => ({ zones, fingerprints }), [zones, fingerprints])
  const tenantOwn = useMemo(() => scenarios.filter((s) => !s.provided), [scenarios])
  const shipped = useMemo(() => scenarios.filter((s) => s.provided), [scenarios])

  /* Focus in, Tab kept inside, Escape peels one layer, focus back on close. */
  useDialogChrome(open, onClose, sheet)

  /* One flat list, filtered by three independent things. The old derivation
     split the result into `mine` and `theirs` and drew two headed sections; the
     shelf is a choice now, so there is one section and it needs no heading. */
  const shelved = shelf === 'mine' ? tenantOwn : shipped
  /* Uncategorized is what a tenant files a template under by default. It is an
     option only where there is something in it, so it never adds "0 templates". */
  const cats = CATS.filter((c) => c !== 'Uncategorized' || shelved.some((s) => s.category === c))
  const list = useMemo(
    () => shelved.filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)),
    [shelved, cat, q],
  )

  /** The same search and category on the OTHER shelf — where the rest are. */
  const otherShelf: Shelf = shelf === 'mine' ? 'xecurify' : 'mine'
  const otherName = otherShelf === 'mine' ? 'Your templates' : 'Xecurify templates'
  const elsewhere = useMemo(
    () => (shelf === 'mine' ? shipped : tenantOwn).filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)).length,
    [shelf, shipped, tenantOwn, cat, q],
  )
  const searching = q.trim() !== '' || cat !== 'All'
  /* Changing shelf keeps the search, so the matches over there are what you see. */
  const showOther = () => {
    setShelf(otherShelf)
    setCat('All')
  }

  /* Cleared when it OPENS. The sheet's state lives above its own mount, so a
     search typed on one visit would still be filtering the grid on the next. */
  useEffect(() => {
    if (!open) return
    setShelf('xecurify')
    setCat('All')
    setQ('')
    setPreview(null)
  }, [open])

  /* Changing shelf clears the filter. A category chosen on one shelf means
     something different on the other — and with two templates on the tenant's,
     any filter at all is a way to see none of them. */
  const pickShelf = (next: Shelf) => {
    setShelf(next)
    setCat('All')
  }

  function take(s: Scenario) {
    setPreview(null)
    onClose()
    onChoose(s)
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
          /* `role="dialog"` is load-bearing beyond accessibility here: the
             board's keyboard handler stands down while `[role="dialog"]` or
             `.bx-scrim` matches, and without it Del, ⌘D, `e` and the arrow keys
             would still be acting on the rule underneath while somebody reads a
             template. */
          role="dialog"
          aria-modal="true"
          aria-label="Start from a template"
        >
          <motion.div
            ref={sheet}
            tabIndex={-1}
            /* Focused as a whole on open, so no ring round the whole sheet. */
            style={{ outline: 'none' }}
            className="bmarket__sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <button type="button" className="bmarket__x" onClick={onClose} aria-label="Close the gallery">
              <X size={18} strokeWidth={1.9} />
            </button>

            {/* A band of its own for the question and the one control that
                answers it fastest.

                The heading, the provenance line and the close used to share a
                24px header row with the filters crammed under them, and the
                catalogue started 60px from the top of the sheet. Somebody
                opening this is looking for one of fourteen things; give the
                looking a place to stand. Centred, on the page grey, with the
                search at the width a template name actually needs — and
                nothing else in it. */}
            <header className="bmarket__hero">
              {/* The shopfront, back and smaller. It was briefly a two-by-two
                  of the four category hues — a legend for the filter — which
                  was the last of six attempts to make this band say which
                  category was selected. It said it accurately and it was still
                  a second readout for something the dropdown states in words
                  and the cards state in pills. */}
              <span className="bmarket__mark" aria-hidden>
                <Store size={17} strokeWidth={1.8} />
              </span>
              <h2>Start from a template</h2>
              <div className="bmarket__searchbox">
                <SearchBox
                  block
                  placeholder="Search templates"
                  label="Search the gallery"
                  value={q}
                  onChange={setQ}
                />
              </div>
            </header>

            <div className="bmarket__work">
              {/* Two entries. Who wrote it, and nothing else — the four content
                  categories that used to share this rail are a dropdown over
                  the grid now, because "written by my team" and "about devices"
                  are not alternatives and a list that mixes them makes you pick
                  one to lose the other. */}
              <aside className="bmarket__rail">
                <p className="bmarket__railhead">Templates</p>
                <div className="bmarket__cats" role="tablist" aria-label="Whose templates">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={shelf === 'mine'}
                    className={`bmarket__cat ${shelf === 'mine' ? 'is-on' : ''}`}
                    onClick={() => pickShelf('mine')}
                  >
                    <span>Your templates</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={shelf === 'xecurify'}
                    className={`bmarket__cat ${shelf === 'xecurify' ? 'is-on' : ''}`}
                    onClick={() => pickShelf('xecurify')}
                  >
                    <span>Xecurify templates</span>
                  </button>
                </div>
              </aside>

              <div className="bmarket__body">
                <div className="bmarket__shelf">
                  {/* No count beside the heading: the cards under it are the count. */}
                  <h3 className="bgal__section">
                    {shelf === 'mine' ? 'Your templates' : 'Xecurify templates'}
                    <span>{shelf === 'mine' ? 'Built by your team' : 'By miniOrange'}</span>
                  </h3>

                  {/* The filter, over the thing it filters, and only where it
                      has work to do: two tenant templates do not need a
                      taxonomy between them. No counts in the options: the
                      cards are the count. */}
                  {shelf === 'xecurify' && (
                    <Picker
                      label="Filter by category"
                      value={cat}
                      size="md"
                      summary={cat === 'All' ? 'All categories' : cat}
                      options={[{ value: 'All', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]}
                      onChange={(v) => setCat(v as Cat | 'All')}
                    />
                  )}
                </div>

                {list.length > 0 && (
                  <div className="bgal__grid">
                    {list.map((s) => (
                      <Card
                        key={s.id}
                        s={s}
                        directory={users}
                        library={library}
                        fallback={fallback}
                        onUse={() => take(s)}
                        onPreview={() => setPreview(s)}
                      />
                    ))}
                  </div>
                )}

                {/* Where the rest of them are, for the same search and category.
                    Both templates this tenant wrote are Compliance ones, so
                    filtering Xecurify to Compliance shows one of three — and the
                    two that are missing are one click away rather than gone. */}
                {list.length > 0 && searching && elsewhere > 0 && (
                  <p className="bmarket__elsewhere">
                    {elsewhere} more in {otherName}.{' '}
                    <button type="button" onClick={showOther}>
                      Show {otherName.toLowerCase()}
                    </button>
                  </p>
                )}

                {list.length === 0 &&
                  (searching ? (
                    <NoMatches
                      compact
                      noun="templates"
                      query={q}
                      filtered={cat !== 'All'}
                      blurb={elsewhere > 0 ? `${elsewhere} in ${otherName}.` : undefined}
                      secondary={
                        elsewhere > 0 ? (
                          <Button variant="ghost" onClick={showOther}>
                            Show {otherName.toLowerCase()}
                          </Button>
                        ) : undefined
                      }
                      onClear={() => {
                        setQ('')
                        setCat('All')
                      }}
                    />
                  ) : shelf === 'mine' ? (
                    <EmptyState
                      compact
                      icon={BookmarkPlus}
                      title="No templates yet"
                      blurb="Save a policy as a template from its menu."
                      action={<Button onClick={showOther}>Show Xecurify templates</Button>}
                    />
                  ) : (
                    <EmptyState
                      compact
                      icon={LayoutTemplate}
                      title="No Xecurify templates"
                      blurb="Templates from miniOrange show here."
                      action={<Button onClick={showOther}>Show your templates</Button>}
                    />
                  ))}
              </div>
            </div>
          </motion.div>

          {/* The live preview draws the rules a template will create before it
              is chosen. Ungated: see the note on the card's face. */}
          <TemplatePreview
            m={preview ? scenarioCard(preview, users, library) : null}
            fallback={fallback}
            onClose={() => setPreview(null)}
            onUse={() => preview && take(preview)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Card({
  s,
  directory,
  library,
  fallback,
  onUse,
  onPreview,
}: {
  s: Scenario
  directory: WhoDirectory
  library: TemplateLibrary
  fallback: AccessDecision
  onUse: () => void
  onPreview: () => void
}) {
  const m = useMemo(() => scenarioCard(s, directory, library), [s, directory, library])
  return <TemplateCard m={m} fallback={fallback} onUse={onUse} onPreview={onPreview} useLabel="Use" />
}
