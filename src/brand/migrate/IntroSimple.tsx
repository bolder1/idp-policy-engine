import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '../kit'
import { NewBuilderButton } from './new-builder-button'
import { IntroWidget } from './intro-widgets'
import './move-dialog.css'
import { SceneCanvas, SceneCheck, SceneGroups, SceneOnePolicy, SceneParts } from './intro-scenes'
import './intro-simple.css'

/* -----------------------------------------------------------------------------
   The intro (owner, 9 Nov 2026: "simple version, no video"; 10 Nov: Carousel is final, the rest removed):
   words on the left, one drawing on the right, a few slides (What's new, What's changed), Back and Next,
     one basic drawing per slide; the last slide ends in Migrate.
   The drawings are still SVG in the console's tokens, with no motion inside them.
   -------------------------------------------------------------------------- */

interface Slide {
  kind: "What's new" | "What's changed" | 'Migration'
  title: string
  body: string
  facts?: string[]
  /** Where it was, and where it is now: two short lines under the words. */
  change?: [before: string, now: string]
  art: (reduce: boolean) => ReactNode
}

/* The order tells one story, old to new (owner, 10 Nov 2026: "the user flow should make sense"): what changed from the
   pages you know, then what is new to work with, then bring them over. Every picture draws the policy the same way. */
const SLIDES: Slide[] = [
  {
    kind: "What's changed",
    title: 'One policy for each application',
    body: 'App Login and Adaptive Access were two pages. Now both live in the application’s policy.',
    change: ['App Login and Adaptive Access, two pages', 'One policy for the application'],
    art: (reduce) => <SceneOnePolicy reduce={reduce} />,
  },
  {
    kind: "What's changed",
    title: 'Groups become rules',
    body: 'Each group row in App Login becomes a rule: who it is for, and how they sign in.',
    facts: ['Everyone else is the last rule'],
    change: ['A row for each group', 'A rule for each group'],
    art: (reduce) => <SceneGroups reduce={reduce} />,
  },
  {
    kind: "What's new",
    title: 'Rules are read from the top',
    body: 'A sign-in is checked against each rule in order. The first one that matches decides.',
    facts: ['Drag rules to change the order'],
    change: ['Each group row stood alone', 'Rules are read from the top'],
    art: (reduce) => <SceneCanvas reduce={reduce} />,
  },
  {
    kind: "What's new",
    title: 'Zones and device profiles',
    body: 'IP ranges and locations become zones. Device limits become device profiles.',
    facts: ['Set them up once', 'Use them in any rule'],
    change: ['IP, location and device checks typed into each policy', 'Named once, used in any rule'],
    art: (reduce) => <SceneParts reduce={reduce} />,
  },
  {
    kind: "What's new",
    title: 'Check access',
    body: 'Pick a user and an application, and see which rule decides.',
    facts: ['Works on drafts'],
    change: ['Sign in as the user to find out', 'See the deciding rule first'],
    art: (reduce) => <SceneCheck reduce={reduce} />,
  },
  {
    kind: 'Migration',
    title: 'Bring your old policies over',
    body: 'Each application’s old policy arrives as a draft. Nothing changes for sign-ins until you publish it.',
    facts: ['Review and approve each one', 'Old policies stay in the Old policies tab'],
    art: ArtCircle,
  },
]

export function IntroSimple({
  onMigrate,
  onLater,
}: {
  onMigrate: () => void
  onLater: () => void
}) {
  const reduce = useReducedMotion() === true
  const slides = SLIDES
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)

  const go = (to: number) => {
    setDir(to >= i ? 1 : -1)
    setI(Math.max(0, Math.min(slides.length - 1, to)))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const slide = slides[Math.min(i, slides.length - 1)]
  const last = i >= slides.length - 1
  const t = { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <div className="bis">
      <div className="bis__side">
        <AnimatePresence mode="wait" initial={false}>

          <motion.div
            key={i}
            className="bis__copy"
            aria-live="polite"
            initial={{ opacity: 0, x: reduce ? 0 : 12 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : -12 * dir }}
            transition={t}
          >
            <span className={`bis__kind${slide.kind === "What's changed" ? ' is-changed' : ''}`}>{slide.kind}</span>
            <h2>{slide.title}</h2>
            <p>{slide.body}</p>
            {slide.change && (
              <dl className="bis__change">
                <div>
                  <dt>Before</dt>
                  <dd>{slide.change[0]}</dd>
                </div>
                <div>
                  <dt>Now</dt>
                  <dd>{slide.change[1]}</dd>
                </div>
              </dl>
            )}
            {slide.facts && (
              <ul className="bis__facts">
                {slide.facts.map((f) => (
                  <li key={f}>
                    <Check size={14} strokeWidth={2.4} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>

        </AnimatePresence>

        <footer className="bis__foot">
          <span className="bis__gap" />
          {i > 0 ? (
            <Button variant="secondary" icon={ArrowLeft} onClick={() => go(i - 1)}>
              Back
            </Button>
          ) : (
            <Button variant="secondary" onClick={onLater}>
              Not now
            </Button>
          )}
          {/* One path, one consent (owner, 9 Nov 2026: "the buttons all say the same"): the intro opens the Migrate popup,
              whose Continue leads to the consent and its Start migration. */}
          {last ? (
            <NewBuilderButton label="Continue" door={false} onOpen={onMigrate} />
          ) : (
            <Button variant="secondary" iconRight={ArrowRight} onClick={() => go(i + 1)}>
              Next
            </Button>
          )}
        </footer>
      </div>

      <div className="bis__stage">
        {slides.length > 1 && (
          <span className="bis__dots" role="group" aria-label={`Slide ${i + 1} of ${slides.length}`}>
            {slides.map((s, n) => (
              <button key={s.title} type="button" className={n === i ? 'is-on' : ''} aria-label={`Go to ${s.title}`} onClick={() => go(n)}>
                <span />
              </button>
            ))}
          </span>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={i}
            aria-hidden
            className="bis__art"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t}
          >
            {slide.art(reduce)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* --- The pictures: intro-simple-art.tsx; the close uses the apps circle ------------------- */

/* The applications circling the shield: the old close screen's picture (owner, 9 Nov 2026: "use the circle"). */
function ArtCircle(reduce: boolean) {
  return (
    <div className="bis__circle">
      <IntroWidget id="move" reduce={reduce} />
    </div>
  )
}
