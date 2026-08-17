import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Compass, Lightbulb, RotateCcw } from 'lucide-react'

import { Button, Drawer } from '../kit'
import { STOPS, tourSeen } from './tour-stops'
import { TUTORIALS, markTutorialRead, readTutorials, type Tutorial } from './tutorials'
import { TutorialFigure } from './TutorialFigure'

/* -----------------------------------------------------------------------------
   Learn the builder.

   One place that owns everything explanatory, reachable from a button that is
   always on the bar. Before this, the tour was behind a menu item and ran once
   — which meant the answer to "can I see that again" was "find the Policy menu
   and hope", and the answer to anything the tour was too short to cover was
   nothing at all.

   The shape is Xero's setup guide rather than a help centre: a short, countable
   list with progress on it, so the panel can say what is left instead of only
   what exists. Five guides, and the count is the point — a list that says
   "3 of 5 read" gets finished, and a list of forty gets closed.

   Two levels, one panel. The list pushes to a guide and the guide pops back,
   rather than opening a second surface on top of the first: this is reference
   material, and reference material that stacks windows is reference material
   nobody comes back to.
   -------------------------------------------------------------------------- */

export function LearnPanel({
  open,
  onClose,
  onStartTour,
}: {
  open: boolean
  onClose: () => void
  onStartTour: () => void
}) {
  const reduce = useReducedMotion()
  const [openId, setOpenId] = useState<string | null>(null)
  const [read, setRead] = useState<string[]>([])
  const [seen, setSeen] = useState(false)

  /* Read on open rather than on mount: the tour can be taken and a guide can be
     read while this is closed, and a panel that reports stale progress is worse
     than one that reports none. */
  useEffect(() => {
    if (!open) return
    setRead(readTutorials())
    setSeen(tourSeen())
    setOpenId(null)
  }, [open])

  const current = useMemo(() => TUTORIALS.find((t) => t.id === openId) ?? null, [openId])
  const doneCount = read.length

  function openGuide(t: Tutorial) {
    setOpenId(t.id)
    markTutorialRead(t.id)
    setRead((r) => (r.includes(t.id) ? r : [...r, t.id]))
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={current ? current.title : 'Learn the builder'}
      width={520}
      resizable
      minWidth={420}
      maxWidth={760}
    >
      {/* Keyed, not wrapped in AnimatePresence.

          `mode="wait"` serialises exit-then-enter, which means the incoming view
          is gated on an animation completing — and animations do not complete in
          a backgrounded tab. Coming back to a panel still showing the view you
          navigated away from is a worse bug than the missing 200ms of cross-fade
          this trades away. React swaps; motion only animates what arrives. */}
      <div className="btr__pane">
        {current ? (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: reduce ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
          >
            <button type="button" className="btr__crumb" onClick={() => setOpenId(null)}>
              <ArrowLeft size={13} strokeWidth={2} aria-hidden />
              All guides
            </button>

            <TutorialFigure id={current.figure} />

            <p className="btr__lead">{current.summary}</p>

            <ol className="btr__steps">
              {current.steps.map((s, i) => (
                <motion.li
                  key={s.heading}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : i * 0.05 }}
                >
                  <span className="btr__stepn">{i + 1}</span>
                  <div>
                    <h4>{s.heading}</h4>
                    <p>{s.body}</p>
                    {s.tip && (
                      <p className="btr__tip">
                        <Lightbulb size={13} strokeWidth={2} aria-hidden />
                        {s.tip}
                      </p>
                    )}
                  </div>
                </motion.li>
              ))}
            </ol>

            {/* Straight on to the next guide rather than back to the list. A
                reader who finished one is the likeliest person in the product to
                read another, and making them navigate for it wastes that. */}
            <NextGuide id={current.id} onOpen={openGuide} onDone={() => setOpenId(null)} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: reduce ? 0 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
          >
            {/* The tour, offered the way HubSpot offers one: what it is, how
                long it takes, and a way back to it once it has been taken. */}
            <div className="btr__tourcard">
              <span className="btr__tourico" aria-hidden>
                <Compass size={20} strokeWidth={1.8} />
              </span>
              <div>
                <h3>Take the tour</h3>
                <p>
                  {STOPS.length} stops on this screen, about a minute. It drives the builder as it goes, so you are
                  looking at the thing being described.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={seen ? RotateCcw : undefined}
                iconRight={seen ? undefined : ArrowRight}
                onClick={() => {
                  onClose()
                  onStartTour()
                }}
              >
                {seen ? 'Take it again' : 'Start'}
              </Button>
            </div>

            <div className="btr__listhead">
              <h3>Guides</h3>
              <span>
                {doneCount} of {TUTORIALS.length} read
              </span>
            </div>
            <div className="btr__meter" aria-hidden>
              <motion.span
                initial={false}
                animate={{ width: `${(doneCount / TUTORIALS.length) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.4, ease: [0.2, 0, 0, 1] }}
              />
            </div>

            <ul className="btr__guides">
              {TUTORIALS.map((t) => {
                const done = read.includes(t.id)
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => openGuide(t)}>
                      <span className={`btr__guidemark ${done ? 'is-done' : ''}`} aria-hidden>
                        {done ? <Check size={12} strokeWidth={3} /> : null}
                      </span>
                      <span className="btr__guidetext">
                        <strong>{t.title}</strong>
                        <em>{t.summary}</em>
                      </span>
                      <span className="btr__guidemins">
                        {t.minutes} min
                        <ArrowRight size={13} strokeWidth={2} aria-hidden />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </div>
    </Drawer>
  )
}

function NextGuide({
  id,
  onOpen,
  onDone,
}: {
  id: string
  onOpen: (t: Tutorial) => void
  onDone: () => void
}) {
  const i = TUTORIALS.findIndex((t) => t.id === id)
  const next = TUTORIALS[i + 1]
  if (!next) {
    return (
      <div className="btr__nextguide">
        <span>That is the last one.</span>
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onDone}>
          Back to the guides
        </Button>
      </div>
    )
  }
  return (
    <div className="btr__nextguide">
      <span>
        Next: <strong>{next.title}</strong>
      </span>
      <Button variant="secondary" size="sm" iconRight={ArrowRight} onClick={() => onOpen(next)}>
        Read it
      </Button>
    </div>
  )
}
