import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Search, Store, X } from 'lucide-react'

import { Button } from '../kit'
import { scenarios, type Scenario } from '../data'
import { TemplateCard, TemplatePreview, scenarioCard } from './TemplateCard'

/* -----------------------------------------------------------------------------
   The template picker.

   It was the second half of a Create Policy PAGE: you clicked "New policy",
   met a gallery, chose a template, and only then were asked what the policy
   was called. That put the catalogue before the decision it decorates — most
   people know what they are protecting before they know which ready-made set
   of rules to start from, and the ones who do not were being asked to browse
   twelve strangers' policies while holding an empty form in their head.

   So the order is reversed. The form comes first and lands you in the builder;
   the catalogue is here, offered from the empty board, where "how would you
   like to start?" is a question you are actually in a position to answer — and
   where the answer applies to a policy that already exists, so it is an edit
   you can undo rather than a fork in a wizard.

   A sheet rather than a dialog: this is a catalogue you browse, and a 560px box
   would put three cards on screen. It carries BOTH lists now — the tenant's own
   templates and Xecurify's — because the gallery page that used to hold the
   first one is gone, and a picker that can only offer somebody else's templates
   is not a picker.
   -------------------------------------------------------------------------- */

const MINE = scenarios.filter((s) => !s.provided)
const PROVIDED = scenarios.filter((s) => s.provided)

/* "All" and "Yours" are about WHERE a template came from; the other four are
   about what it is for. One rail either way — they filter the same grid, and
   splitting them into two controls would make the tenant's two templates a mode
   rather than a shelf. */
const CATEGORIES = ['All', 'Yours', 'Quick Protection', 'Device-based', 'Risk-based', 'Compliance'] as const
type Category = (typeof CATEGORIES)[number]

const LABEL: Record<Category, string> = {
  All: 'All templates',
  Yours: 'Your templates',
  'Quick Protection': 'Quick Protection',
  'Device-based': 'Device-based',
  'Risk-based': 'Risk-based',
  Compliance: 'Compliance',
}

function inCategory(s: Scenario, c: Category) {
  if (c === 'All') return true
  if (c === 'Yours') return !s.provided
  return s.category === c
}

function hit(s: Scenario, q: string) {
  if (!q) return true
  const t = q.toLowerCase()
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
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
  const [cat, setCat] = useState<Category>('All')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)

  const list = useMemo(() => scenarios.filter((s) => inCategory(s, cat) && hit(s, q)), [cat, q])
  /* Yours first, then whatever the shelf holds. Two templates somebody on this
     team wrote outrank twelve nobody here has met, and under "All" they would
     otherwise sit wherever `scenarios` happens to list them. */
  const mine = list.filter((s) => !s.provided)
  const theirs = list.filter((s) => s.provided)

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
    setCat('All')
    setQ('')
    setPreview(null)
  }, [open])

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
            <header className="bmarket__hero">
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
              {/* The rail is back, and this time it is a CARD rather than a
                  column.

                  It was a full-height 236px column and became a chip row
                  because at 750px tall it was six rows and six hundred pixels
                  of nothing. The emptiness was the column, not the rail: sized
                  to its own contents and stuck to the top of the scroll, six
                  categories are a compact index that stays put while the grid
                  moves past it — which is the thing a chip row cannot do and
                  the reason every catalogue of any size grows one. */}
              <aside className="bmarket__rail">
                <p className="bmarket__railhead">Categories</p>
                <div className="bmarket__cats" role="tablist" aria-label="Template categories">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      role="tab"
                      aria-selected={cat === c}
                      className={`bmarket__cat ${cat === c ? 'is-on' : ''}`}
                      onClick={() => setCat(c)}
                    >
                      <span>{LABEL[c]}</span>
                      <em>{scenarios.filter((x) => inCategory(x, c)).length}</em>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="bmarket__body">
                {mine.length > 0 && (
                  <>
                    <h3 className="bgal__section">
                      Your templates <em>{mine.length}</em>
                      <span>Built by your team</span>
                    </h3>
                    <div className="bgal__grid">
                      {mine.map((s) => (
                        <Card key={s.id} s={s} onUse={() => take(s)} onPreview={() => setPreview(s)} />
                      ))}
                    </div>
                  </>
                )}

                {theirs.length > 0 && (
                  <>
                    <h3 className="bgal__section">
                      Xecurify templates <em>{theirs.length}</em>
                      <span>by miniOrange</span>
                    </h3>
                    <div className="bgal__grid">
                      {theirs.map((s) => (
                        <Card key={s.id} s={s} onUse={() => take(s)} onPreview={() => setPreview(s)} />
                      ))}
                    </div>
                  </>
                )}

                {list.length === 0 && (
                  <div className="bgal__none">
                    <p>Nothing here matches “{q}”.</p>
                    <Button
                      onClick={() => {
                        setQ('')
                        setCat('All')
                      }}
                    >
                      Clear search
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
