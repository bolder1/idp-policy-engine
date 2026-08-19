import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { ArrowRight, Layers, Minus, Sparkles, TriangleAlert, X } from 'lucide-react'

import { Button } from './kit'
import { gapsFor, type Gap } from './edition'
import { useBrand } from './store'

/* -----------------------------------------------------------------------------
   The edition switch, and the argument against the edition it switches to.

   Two halves of one brief. The switch delivers the console as it was asked for
   — v0's scope, nothing beyond it. The panel beside it says what that costs,
   because a stripped build with no counter-argument reads as agreement.

   Where the panel deliberately does not go: it never blocks, never nags, and
   never appears in the full edition. It is one quiet control that opens a list
   of questions the lite edition cannot answer, each with the answer the full
   one gives and a way to go and see it. Somebody who disagrees closes it and
   carries on, which is the right amount of pressure for a design argument.

   Written as questions rather than features on purpose. "No blast radius" is a
   missing checkbox and persuades nobody; "you cannot tell who a change moves
   until it has moved them" is a Monday morning and persuades everybody.
   -------------------------------------------------------------------------- */

export function EditionBar() {
  const store = useBrand()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  const lite = store.edition === 'lite'
  const gaps = gapsFor(store.features)

  return (
    <div className="bed">
      <div className="bed__switch" role="radiogroup" aria-label="Console edition">
        <span className="bed__label">Edition</span>
        <button
          type="button"
          role="radio"
          aria-checked={lite}
          className={lite ? 'is-on' : ''}
          onClick={() => store.setEdition('lite')}
          title="The scope as requested — v0 and nothing beyond it"
        >
          <Minus size={12} strokeWidth={2.4} aria-hidden />
          Lite
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!lite}
          className={!lite ? 'is-on' : ''}
          onClick={() => store.setEdition('full')}
          title="Everything this prototype argues for"
        >
          <Layers size={12} strokeWidth={2.2} aria-hidden />
          Full
        </button>
      </div>

      {/* Only in lite, and only when something is actually withheld. */}
      {lite && gaps.length > 0 && (
        <button type="button" className="bed__gapbtn" onClick={() => setOpen(true)}>
          <TriangleAlert size={13} strokeWidth={2} aria-hidden />
          {gaps.length} things this cannot answer
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="bed__scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="bed__panel"
              role="dialog"
              aria-label="What the lite edition cannot answer"
              initial={{ opacity: 0, x: reduce ? 0 : 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : 32 }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
            >
              <header>
                <div>
                  <span className="bed__eyebrow">Lite edition</span>
                  <h2>{gaps.length} questions it cannot answer</h2>
                </div>
                <button type="button" className="bed__x" aria-label="Close" onClick={() => setOpen(false)}>
                  <X size={16} strokeWidth={2} />
                </button>
              </header>

              <p className="bed__intro">
                Everything below was removed on request. This is what each one was doing, so the trade is a decision
                rather than a surprise.
              </p>

              <ol className="bed__gaps">
                {gaps.map((g) => (
                  <GapRow
                    key={g.id}
                    gap={g}
                    onSee={() => {
                      store.setEdition('full')
                      setOpen(false)
                      store.showToast(`Full edition — ${g.title} is back`)
                    }}
                  />
                ))}
              </ol>

              <footer>
                <span>Switching does not change your policies.</span>
                <Button
                  variant="brand"
                  size="sm"
                  iconRight={ArrowRight}
                  onClick={() => {
                    store.setEdition('full')
                    setOpen(false)
                  }}
                >
                  Switch to Full
                </Button>
              </footer>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function GapRow({ gap, onSee }: { gap: Gap; onSee: () => void }) {
  return (
    <li className={`bed__gap is-${gap.weight}`}>
      <div className="bed__gaphead">
        <span className="bed__surface">{gap.surface}</span>
        <strong>{gap.title}</strong>
        <span className={`bed__weight is-${gap.weight}`}>{gap.weight} risk</span>
      </div>

      {/* The question first. It is the only line somebody skimming will read,
          so it carries the argument on its own. */}
      <p className="bed__q">{gap.question}</p>
      <p className="bed__cost">{gap.cost}</p>

      <div className="bed__covered">
        <Sparkles size={12} strokeWidth={2} aria-hidden />
        <span>{gap.covered}</span>
      </div>

      <button type="button" className="bed__see" onClick={onSee}>
        See it in Full
        <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
      </button>
    </li>
  )
}
