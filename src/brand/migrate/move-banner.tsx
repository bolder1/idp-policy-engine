import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { AlertArt } from './AlertArt'
import { NewBuilderButton } from './new-builder-button'
import { Button } from '../kit'
import { addedLabel } from '../data'
import { OLD_CLOSES, SHOW_TIME_DAYS, countdown, daysLeft, deadlineNow, stageOf, timeLeft, type DeadlineView } from './legacy'
import { MoveArt } from './MoveArt'
import { BannerMark } from './AnnounceStrip'
import './old-policies.css'

/* -----------------------------------------------------------------------------
   The move banner, in two places and two moods (owner, 4 Nov 2026).

   On the old pages it is the loud one. The heading says the closing day — once; nothing
   else repeats it. From three months out a countdown joins the button: a small clock and
   three tiles, days, hours and minutes, ticking every minute. Its colour climbs as the
   day nears (blue, amber from 60 days, red in the last 14), and the animation hurries.

   On the new builder's empty page it is quiet: the new builder does not close, so no
   dates and no urgency — a heading, a line, Start migration and the animation.
   -------------------------------------------------------------------------- */

/** The time now, again every minute. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}


/* The countdown: three tiles, days, hours and minutes. No date (the heading has it), no bar, no clock face (owner,
   4 Nov 2026): the number is the point. */
function Countdown({ now }: { now: Date }) {
  const reduce = useReducedMotion()
  /* More than 30 days: months and days. From 30 days: days, hours and minutes (owner, 4 Nov 2026). */
  const left = timeLeft(now)
  const cal = countdown(now)
  const fine = left.days <= 30
  const tiles: [number, string][] = fine
    ? [
        [left.days, left.days === 1 ? 'day' : 'days'],
        [left.hours, 'hrs'],
        [left.minutes, 'min'],
      ]
    : [
        [cal.months, cal.months === 1 ? 'month' : 'months'],
        [cal.days, cal.days === 1 ? 'day' : 'days'],
      ]
  const said = fine ? `${left.days} days, ${left.hours} hours and ${left.minutes} minutes left` : `${cal.months} months and ${cal.days} days left`
  return (
    <div className="bold__time" role="timer" aria-label={said}>
      <span className="bold__tiles" aria-hidden>
        {tiles.map(([n, unit]) => (
          <span key={unit} className="bold__tile">
            <span className="bold__tilenum">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={n} initial={reduce ? { opacity: 0 } : { y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { y: 12, opacity: 0 }} transition={{ duration: 0.25 }}>
                  {String(n).padStart(2, '0')}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="bold__tileunit">{unit}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

/* `secondary`: the new builder's list already has its orange (New policy), so the banner's button steps down there. */
export function MoveBanner({
  where,
  onAction,
  waiting,
  view = 'now',
  secondary = false,
  progress,
}: {
  where: 'old' | 'new'
  onAction: () => void
  waiting: number
  view?: DeadlineView
  secondary?: boolean
  /* The new builder's banner while a move is under way or waiting for review (owner, 4 Nov 2026): what is happening,
     and View details into the move. Nothing it made is in the list until it is approved. */
  progress?: { done: number; total: number; running: boolean; toReview: number }
}) {
  const today = useMinute()
  const reduce = useReducedMotion() === true
  if (where === 'new' && progress)
    return (
      <section className="bold__banner is-quiet" aria-label="Migration">
        <div className="bold__bannertext">
          <h2 className="bold__bannertitle">
            {progress.running ? 'Migration in progress' : 'Ready to review'}
          </h2>
          <p>
            {/* While it runs, only that it runs (owner, 5 Nov 2026): no count, no bar, no button. */}
            {progress.running
              ? 'Keep working; it runs in the background.'
              : `${progress.toReview === 1 ? '1 moved policy waits' : `${progress.toReview} moved policies wait`} for your approval. Approved ones join this list as drafts.`}
          </p>
          {!progress.running && (
            <div className="bold__banneractions">
              <Button variant={secondary ? 'secondary' : 'brand'} size="sm" iconRight={ArrowRight} onClick={onAction}>
                Review
              </Button>
            </div>
          )}
        </div>
        <div className="bold__scene">
          <MoveArt pace={progress.running ? 'busy' : 'calm'} />
        </div>
      </section>
    )
  if (where === 'new')
    return (
      <section className="bold__banner is-quiet" aria-label="Bring your old policies over">
        <div className="bold__bannertext">
          <h2 className="bold__bannertitle">Bring your old policies over</h2>
          <p>{waiting === 1 ? '1 policy from the old builder can move here, rules and all.' : `${waiting} policies from the old builder can move here, rules and all.`}</p>
          <div className="bold__banneractions">
            <Button variant={secondary ? 'secondary' : 'brand'} size="sm" iconRight={ArrowRight} onClick={onAction}>
              Start migration
            </Button>
          </div>
        </div>
        <div className="bold__scene">
          <MoveArt pace="calm" />
        </div>
      </section>
    )
  const now = deadlineNow(view, today)
  const days = daysLeft(now)
  const stage = stageOf(days)
  const showTime = days <= SHOW_TIME_DAYS
  /* The old pages' banner, redone (owner, 6 Nov 2026: "make it as interesting as you can ... like Google: the heading,
     the line and the button in one row, a small mark on the left, as the strip and card do"). One row on a soft
     tinted card: the strip's mark (the warning triangle in the last fortnight), the words, the countdown when it
     shows, then See what's new. A light sweeps across now and then; reduced motion holds it still. */
  return (
    <section className={`bold__banner is-row is-stage${stage}`} aria-label="Moving to the new policy builder">
      {!reduce && (
        <motion.span className="bold__sweep" aria-hidden initial={{ x: '-60%' }} animate={{ x: '420%' }} transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 6 }} />
      )}
      <span className="bold__mark" aria-hidden>
        {stage >= 3 ? <AlertArt hurry={stage === 4} /> : <BannerMark reduce={reduce} />}
      </span>
      <div className="bold__bannertext">
        <h2 className="bold__bannertitle">Old policies close on {addedLabel({ addedOn: OLD_CLOSES })}</h2>
        <p>Move them to the new builder. Anything still here then is merged for you.</p>
      </div>
      {showTime && <Countdown now={now} />}
      <span className="bold__go">
        <NewBuilderButton onOpen={onAction} />
      </span>
    </section>
  )
}
