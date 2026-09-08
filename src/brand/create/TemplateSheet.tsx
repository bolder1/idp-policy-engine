import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Search, Store, X } from 'lucide-react'

import { Button } from '../kit'
import { Picker } from '../picker'
import { scenarios, type Scenario } from '../data'
import { TemplateCard, TemplatePreview, catKey, scenarioCard } from './TemplateCard'

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
   Compliance shows one of the three the catalogue holds. The dropdown counts
   are drawn from the shelf you are ON for that reason — advertising three and
   delivering one is worse than saying one — and the empty state points at the
   other shelf when that is where the rest are.
   -------------------------------------------------------------------------- */

const MINE = scenarios.filter((s) => !s.provided)
const PROVIDED = scenarios.filter((s) => s.provided)

/** Who wrote it. The rail's whole job. */
type Shelf = 'mine' | 'xecurify'

/** What it is for. The dropdown's whole job. */
const CATS = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance'] as const
type Cat = (typeof CATS)[number]

function hit(s: Scenario, q: string) {
  if (!q) return true
  const t = q.toLowerCase()
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

/* Which state the header band paints. One word, because the band takes exactly
   one `data-tone` and the CSS holds one rule per value. The tenant's shelf is
   `mine` whatever the filter says — its two templates do not need a taxonomy
   between them. */
function toneOf(shelf: Shelf, cat: Cat | 'All') {
  if (shelf === 'mine') return 'mine'
  return cat === 'All' ? 'all' : catKey(cat)
}

export function TemplateSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean
  onClose: () => void
  /** Hands back the chosen template. What is done with its rules is the host's. */
  onChoose: (s: Scenario) => void
}) {
  const [shelf, setShelf] = useState<Shelf>('xecurify')
  const [cat, setCat] = useState<Cat | 'All'>('All')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)

  /* One flat list, filtered by three independent things. The old derivation
     split the result into `mine` and `theirs` and drew two headed sections; the
     shelf is a choice now, so there is one section and it needs no heading. */
  const shelved = shelf === 'mine' ? MINE : PROVIDED
  const list = useMemo(
    () => shelved.filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)),
    [shelved, cat, q],
  )

  /* Counts from the shelf you are on, never from all fourteen. Compliance holds
     three templates and exactly one of them is Xecurify's. */
  const counts = useMemo(() => {
    const n: Record<string, number> = { All: shelved.length }
    for (const c of CATS) n[c] = shelved.filter((s) => s.category === c).length
    return n
  }, [shelved])

  /** How many of this category are sitting on the OTHER shelf. */
  const elsewhere = cat === 'All' ? 0 : (shelf === 'mine' ? PROVIDED : MINE).filter((s) => s.category === cat).length

  /* The band blooms once as the sheet springs in rather than arriving already
     coloured. `@property` transitions do not fire on first computed style, so
     the tone is withheld for one frame and the initial grey is what it
     transitions FROM. */
  const [tone, setTone] = useState<string | null>(null)
  useEffect(() => {
    if (!open) {
      setTone(null)
      return
    }
    const id = requestAnimationFrame(() => setTone(toneOf(shelf, cat)))
    return () => cancelAnimationFrame(id)
  }, [open, shelf, cat])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      /* One layer at a time. This is a bare window listener rather than a
         member of the kit's dialog stack, so without the guard a single Escape
         would close the preview Modal on top of the sheet AND the sheet under
         it — and, from the board, hand the keystroke to a canvas whose own
         handler treats Escape as "clear the rehearsal, then the selection". */
      if (e.key !== 'Escape' || document.querySelector('.bx-scrim')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
          aria-label="Start from a template"
        >
          <motion.div
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
            <header className="bmarket__hero" data-tone={tone ?? undefined}>
              {/* A storefront, briefly. This is a shelf of things somebody else
                  wrote — the one surface in the product where you are choosing
                  between other people's work rather than editing your own — and
                  a mark, a big centred search and counts on every shelf are how
                  a catalogue says so. */}
              <span className="bmarket__mark" aria-hidden>
                <Store size={20} strokeWidth={1.7} />
              </span>
              <h2>Start from a template</h2>
              <p className="bmarket__lede">
                {MINE.length} written by your team, {PROVIDED.length} from miniOrange — free with your licence
              </p>
              <div className="bmarket__searchbox">
                <Search size={16} strokeWidth={2} aria-hidden />
                <input
                  type="search"
                  className="bmarket__search"
                  placeholder="Search templates"
                  aria-label="Search the gallery"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <p className="bmarket__note">
                Taking one writes its rules into this policy. Nothing is saved until you publish, and undo puts it back.
              </p>
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
                    <em>{MINE.length}</em>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={shelf === 'xecurify'}
                    className={`bmarket__cat ${shelf === 'xecurify' ? 'is-on' : ''}`}
                    onClick={() => pickShelf('xecurify')}
                  >
                    <span>Xecurify templates</span>
                    <em>{PROVIDED.length}</em>
                  </button>
                </div>
              </aside>

              <div className="bmarket__body">
                <div className="bmarket__shelf">
                  <h3 className="bgal__section">
                    {shelf === 'mine' ? 'Your templates' : 'Xecurify templates'} <em>{list.length}</em>
                    <span>{shelf === 'mine' ? 'Built by your team' : 'by miniOrange'}</span>
                  </h3>

                  {/* The filter, over the thing it filters, and only where it
                      has work to do: two tenant templates do not need a
                      taxonomy between them. Counts come from THIS shelf. */}
                  {shelf === 'xecurify' && (
                    <Picker
                      label="Filter by category"
                      value={cat}
                      size="md"
                      summary={cat === 'All' ? `All categories · ${counts.All}` : `${cat} · ${counts[cat]}`}
                      options={[
                        { value: 'All', label: 'All categories', meta: `${counts.All} templates` },
                        ...CATS.map((c) => ({
                          value: c,
                          label: c,
                          meta: counts[c] === 1 ? '1 template' : `${counts[c]} templates`,
                        })),
                      ]}
                      onChange={(v) => setCat(v as Cat | 'All')}
                    />
                  )}
                </div>

                <div className="bgal__grid">
                  {list.map((s) => (
                    <Card key={s.id} s={s} onUse={() => take(s)} onPreview={() => setPreview(s)} />
                  ))}
                </div>

                {/* Where the rest of them are. Both templates this tenant wrote
                    are Compliance ones, so filtering Xecurify to Compliance
                    shows one of three — and the two that are missing are one
                    click away rather than gone. */}
                {elsewhere > 0 && (
                  <p className="bmarket__elsewhere">
                    {elsewhere} more {cat} template{elsewhere === 1 ? ' is' : 's are'}{' '}
                    {shelf === 'mine' ? "in Xecurify's" : "your team's"}.{' '}
                    <button type="button" onClick={() => { pickShelf(shelf === 'mine' ? 'xecurify' : 'mine') }}>
                      {shelf === 'mine' ? 'Show Xecurify templates' : 'Show your templates'}
                    </button>
                  </p>
                )}

                {list.length === 0 && (
                  <div className="bgal__none">
                    <p>{q ? `Nothing here matches “${q}”.` : 'Nothing on this shelf yet.'}</p>
                    <Button
                      onClick={() => {
                        setQ('')
                        setCat('All')
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* The live preview draws the rules a template will create before it
              is chosen. Ungated: see the note on the card's face. */}
          <TemplatePreview
            m={preview ? scenarioCard(preview) : null}
            onClose={() => setPreview(null)}
            onUse={() => preview && take(preview)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Card({ s, onUse, onPreview }: { s: Scenario; onUse: () => void; onPreview: () => void }) {
  const m = useMemo(() => scenarioCard(s), [s])
  return <TemplateCard m={m} onUse={onUse} onPreview={onPreview} useLabel="Use" />
}
