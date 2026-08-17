import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

/* -----------------------------------------------------------------------------
   Honest scope.

   The brief was fidelity to miniOrange's shipping engine, so anything this
   prototype shows that the engine cannot currently do is named here rather than
   quietly implied to work. Three things qualify. Everything else on these
   screens runs against the engine as it exists — including the resolution
   explainer, which only surfaces arithmetic the engine already performs.
   -------------------------------------------------------------------------- */

const ITEMS = [
  {
    title: 'Per-condition evaluation in the log',
    where: 'Simulate · Why this policy won',
    status: 'Needs backend work',
    body: 'The Adaptive Authentication Report records the outcome, the IP, the location and whether the user registered a device — but not which policy applied or which conditions matched. Until the engine records that, replaying a real sign-in is a projection rather than ground truth. This is the one dependency worth pushing for: it is what turns both Simulate and the resolution explainer from convincing into authoritative.',
  },
  {
    title: 'Shadow mode',
    where: 'Review dialog · policy status',
    status: 'Does not exist today',
    body: 'A policy that evaluates on every sign-in and logs what it would have done, without enforcing it. Entra defaults new Conditional Access policies to report-only; Okta admins invented "canary rules" to fake the same thing. This engine has no monitor mode at all, so today the only way to find out what a policy does is to turn it on.',
  },
  {
    title: 'Draft → publish → revert',
    where: 'Not built',
    status: 'Proposed, not prototyped',
    body: 'No version history, no diff between what is live and what you are about to save, no rollback. Almost nobody in this category ships it well — an entire third-party backup market exists to fill the same gap in Entra — which makes it the clearest differentiation opportunity rather than table stakes. Deliberately not mocked up here: a fake version history would be more misleading than an honest absence.',
  },
]

export function ProposedPanel() {
  const [open, setOpen] = useState(false)

  return (
    <section className="propose">
      <button type="button" className="propose__toggle" onClick={() => setOpen((o) => !o)}>
        <span className="propose__dot" aria-hidden />
        Three things here go beyond the shipping engine
        <span className={`propose__chev ${open ? 'is-open' : ''}`} aria-hidden>
          ›
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="propose__items">
              {ITEMS.map((it) => (
                <article key={it.title} className="propose__item">
                  <header>
                    <h4>{it.title}</h4>
                    <span className="propose__status">{it.status}</span>
                  </header>
                  <p className="propose__where">{it.where}</p>
                  <p className="propose__body">{it.body}</p>
                </article>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
