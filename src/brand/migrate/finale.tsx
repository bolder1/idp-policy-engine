import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CheckCircle2, ClipboardCheck, Eye, FolderInput, Maximize2, Minimize2, Plus, Power, Rocket, ShieldCheck } from 'lucide-react'
import { Button, Confirm, SplitButton } from '../kit'
import { PublishMovedConfirm } from './moved-panel'
import { useBrand } from '../store'
import { AppTile } from './parts'
import { NewBuilderButton } from './new-builder-button'
import { ReviewApproveCards } from './review-cards'
import { useBannerVariant } from './banner-variant'
import { isBuilt, useExperience, useReviewFacts } from './experience'
import './finale.css'

/* -----------------------------------------------------------------------------
   The migration, from Move to done, on the Policies page (owner, 5 Nov 2026).

     Moving        the whole page is the move: old pages slide in dashed, come out as
                   policy cards; the bar fills; the latest to land preview below it.
     Approved      a banner with Add to Policies: the approved rows lay in one by one,
                   each with a light sweep.
     Drafts        a banner with one thing to do, Make all active. The old policies stay,
                   readable in the Old policies tab.
     Done          a banner: every moved policy active, the old ones kept; Done.
   -------------------------------------------------------------------------- */

/** The whole page while a move runs, redone (owner, 9 Nov 2026: "brush up this animation, think creatively; it looks
 *  buggy"). A mosaic of the applications being moved: each waits as a faint dashed tile, the one moving now pulses, and
 *  each lands solid with a small pop and a tick. Above it the shield, its ring filling with the real progress. Nothing
 *  travels or overlaps, so a fast tick still reads calmly. No names, no counter. */
export function MovingShowcase() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const job = store.moveJob
  if (!job) return null
  const share = job.total ? job.done / job.total : 0
  const queue = job.queue ?? []
  const SLOTS = 5
  /* Three grey lanes in (owner, 9 Nov 2026: "not one row but three rows coming from one side, then into one colourful
     row"): every waiting application keeps the lane its place in the queue gives it, so nothing hops between rows; each
     lane shows its next few, the next one nearest the shield. The newest done first, nearest the shield too. */
  const LANES = 3
  const ahead = queue.slice(job.done, job.done + SLOTS * LANES).map((q, k) => ({ q, at: job.done + k }))
  const lanes = Array.from({ length: LANES }, (_, l) => ahead.filter((a) => a.at % LANES === l))
  const landed = queue.slice(Math.max(0, job.done - SLOTS), job.done).reverse()
  /* Lane centres, for the funnel: tile 44px, gap 12px. */
  const LANE_H = 44
  const LANE_GAP = 12
  const FUNNEL_H = LANES * LANE_H + (LANES - 1) * LANE_GAP
  const laneY = (l: number) => l * (LANE_H + LANE_GAP) + LANE_H / 2
  const R = 40
  const C = 2 * Math.PI * R
  return (
    <section className="bfn" aria-label="Moving your policies" aria-live="polite">
      <span className="bfn__min">
        <Button variant="secondary" size="sm" icon={Minimize2} onClick={() => store.setMoveMinimized(true)}>
          Minimize
        </Button>
      </span>
      {/* Left to right, one at a time (owner, 9 Nov 2026): three grey lanes of applications still waiting, a funnel into
          the shield and its progress ring, then one lane of the ones done, in colour. Each tick, the next one leaves its
          lane, curves into the shield and comes out in colour. Fixed slots, so nothing overlaps. */}
      <div className="bfn__flow" aria-hidden>
        <span className="bfn__lanes">
          {lanes.map((lane, l) => (
            <span key={l} className="bfn__lane is-left">
              <AnimatePresence initial={false}>
                {lane.map(({ q }, n) => (
                  <motion.span
                    key={q.key}
                    layout={!reduce}
                    className="bfn__tile"
                    initial={reduce ? false : { opacity: 0, x: -24 }}
                    animate={{ opacity: 1 - n * 0.17, x: 0, y: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 96, y: laneY(1) - laneY(l), scale: 0.45, transition: { duration: 0.34, ease: 'easeIn' } }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {q.appIds[0] && <AppTile appId={q.appIds[0]} size={22} />}
                  </motion.span>
                ))}
              </AnimatePresence>
            </span>
          ))}
        </span>
        {/* The funnel: three lanes meet in the shield. */}
        <svg className="bfn__funnel" viewBox={`0 0 56 ${FUNNEL_H}`} preserveAspectRatio="none" aria-hidden>
          {Array.from({ length: LANES }, (_, l) => (
            <path key={l} d={`M0 ${laneY(l)} C 30 ${laneY(l)}, 26 ${FUNNEL_H / 2}, 56 ${FUNNEL_H / 2}`} className={job.done % LANES === l ? 'is-next' : ''} />
          ))}
        </svg>
        <span className="bfn__hub">
          <svg className="bfn__prog" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={R} className="is-track" />
            <motion.circle cx="50" cy="50" r={R} className="is-fill" strokeDasharray={C} initial={false} animate={{ strokeDashoffset: C * (1 - share) }} transition={{ duration: reduce ? 0 : 0.4, ease: 'easeOut' }} />
          </svg>
          <motion.span key={job.done} className="bfn__shield" initial={reduce ? false : { scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
            <ShieldCheck size={28} strokeWidth={2} />
          </motion.span>
        </span>
        <span className="bfn__link" aria-hidden />
        <span className="bfn__lane is-right">
          <AnimatePresence initial={false}>
            {landed.map((q, n) => (
              <motion.span
                key={q.key}
                layout={!reduce}
                className="bfn__tile is-done"
                initial={reduce ? false : { opacity: 0, x: -72, scale: 0.5 }}
                animate={{ opacity: 1 - n * 0.16, x: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              >
                {q.appIds[0] && <AppTile appId={q.appIds[0]} size={22} />}
                {n === 0 && (
                  <motion.span className="bfn__tick" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20, delay: reduce ? 0 : 0.2 }}>
                    <Check size={10} strokeWidth={3} />
                  </motion.span>
                )}
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
      </div>

      <div className="bfn__words">
        <h2>Moving your policies</h2>
        <p>In the background. Keep working.</p>
      </div>
    </section>
  )
}

/** The move folded into a bar: it keeps running; Expand opens the stage again. */
export function MovingBar() {
  const store = useBrand()
  const job = store.moveJob
  if (!job) return null
  return (
    <section className="bfb is-moving" aria-label="Moving your policies" aria-live="polite">
      <span className="bfb__mark" aria-hidden>
        <FolderInput size={18} strokeWidth={2} />
      </span>
      <span className="bfb__words">
        <b>Moving your policies</b>
        <span>In the background. The result shows here when it is done.</span>
        {/* No count: the loader said nothing, so this only says that work is under way. */}
        <span className="bfb__bar is-indeterminate" aria-hidden>
          <i />
        </span>
      </span>
      <Button variant="secondary" size="sm" icon={Maximize2} onClick={() => store.setMoveMinimized(false)}>
        Expand
      </Button>
    </section>
  )
}

/** When a move finishes, every moved policy is approved into Policies and laid in row by row: there is no review step
    (owner, 6 Nov 2026). Mounted once, for the whole console. */
export function AutoAdd() {
  const store = useBrand()
  const fired = useRef<string | null>(null)
  const job = store.moveJob
  const waiting = Object.entries(store.moved).filter(([, m]) => !m.approved).map(([id]) => id)
  const key = job && job.status === 'done' ? job.ids.join(',') : null
  useEffect(() => {
    if (!key || fired.current === key || waiting.length === 0) return
    fired.current = key
    waiting.forEach((id) => store.approveMoved(id, true))
  }, [key, waiting, store])
  /* Once they are held, lay them in. */
  const reveal = useRef<string | null>(null)
  useEffect(() => {
    if (!key || reveal.current === key || store.held.length === 0 || fired.current !== key) return
    reveal.current = key
    store.revealHeld(job?.quiet)
  }, [key, store.held.length, store, job?.quiet])
  /* Every row in: the tour starts, once a move (owner, 6 Nov 2026). Only on the Policies page: the tour opens by
     going to its first stop, so starting it while the admin is in a builder they opened mid-move would pull them out.
     Elsewhere it waits until they come back to Policies. Marked toured when it fires, so a cancelled timer re-arms. */
  const toured = useRef<string | null>(null)
  const settled = reveal.current === key && store.held.length === 0 && store.landing.length === 0
  const onPolicies = store.screen.name === 'policies'
  /* Assisted and Self-serve: no tour by itself (owner, 16 Nov 2026); the results are the first thing to see. */
  const experience = useExperience()
  useEffect(() => {
    /* The showcase's move on load is already done when the console opens: no tour (migrate/phase.ts). */
    if (!key || !settled || toured.current === key || !onPolicies || !isBuilt(experience) || job?.quiet) return
    const t = window.setTimeout(() => {
      toured.current = key
      store.setMoveTour(true)
    }, 900)
    return () => window.clearTimeout(t)
  }, [key, settled, onPolicies, experience, store, job?.quiet])
  return null
}

/** The banner after review: add the approved rows, make them all active, then done. Null when none applies. */
/** `origin`: which Policies list it sits on. The drafts waiting to be published are in Migrated policies, so their
 *  banner shows there only, not over New policies. */
export function MoveFinale({ origin = 'moved', place = 'top' }: { origin?: 'new' | 'moved'; /** `review`: only the Review and Approve cards, which belong to the Under review list (owner, 12 Nov 2026); `top`: every other banner, and the one-banner version of the drafts. */ place?: 'top' | 'review' } = {}) {
  const store = useBrand()
  const [confirm, setConfirm] = useState(false)
  /* Publish approved: the drafts somebody has approved, through the one publish confirm. */
  const [approvedAsk, setApprovedAsk] = useState<string[] | null>(null)
  const variant = useBannerVariant()
  const experience = useExperience()
  const liveFacts = useReviewFacts()
  /* Yesterday has no Reject: read no rejections. */
  const facts = experience === 'yesterday' ? {} as typeof liveFacts : liveFacts
  /* In the page again, as the banner it used to be, not the strip at the very top (owner, 9 Nov 2026). */
  const held = store.held.length
  const draftList = store.policies.filter((p) => p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
  const drafts = draftList.length
  /* Publish all can skip Approve; then the confirm asks the admin to take it on (owner, 6 Nov 2026). Rejected drafts
     (owner, 17 Nov 2026) are neither to review nor publishable: they wait for support. */
  const rejectedList = draftList.filter((p) => !!facts[p.id]?.rejected)
  const openList = draftList.filter((p) => !store.moved[p.id]?.reviewed && !facts[p.id]?.rejected)
  const unreviewed = openList.length
  const approvedIds = draftList.filter((p) => !!store.moved[p.id]?.reviewed && !facts[p.id]?.rejected).map((p) => p.id)
  const publishable = draftList.filter((p) => !facts[p.id]?.rejected)
  const done = store.migrationDone
  
  const toReview = Object.values(store.moved).filter((m) => !m.approved).length
  const adding = !store.activating && store.landing.length > 0
  const addTotal = store.landing.length + held
  let body: { key: string; icon: typeof Plus; title: string; line: string; action?: { label: string; icon: typeof Plus; run: () => void }; also?: { label: string; run: () => void }; review?: () => void; share?: number; stats?: { label: string; value: number }[] } | null = null
  if (done)
    body = {
      key: 'done',
      icon: CheckCircle2,
      title: 'Migration complete',
      line: 'Every moved policy is published and now sits in New policies. The old ones stay in the Old policies tab.',
      action: { label: 'Done', icon: Check, run: store.closeMigrationDone },
    }
  else if (store.activating) body = { key: 'activating', icon: Power, title: 'Publishing your policies', line: 'One at a time. They move to New policies as they land.' }
  else if (adding) body = { key: 'adding', icon: Plus, title: `Adding ${store.landing.length} of ${addTotal}`, line: 'Each arrives as a draft.', share: store.landing.length / Math.max(1, addTotal) }
  else if (held > 0)
    body = {
      key: 'held',
      icon: Plus,
      title: held === 1 ? '1 approved policy is ready' : `${held} approved policies are ready`,
      line: 'Add them to Policies as drafts. Nothing changes for sign-ins yet.',
      action: { label: 'Add to Policies', icon: Plus, run: store.revealHeld },
      /* One banner at a time (owner, 5 Nov 2026): the rest still waiting for review ride here as a second button. */
      also: toReview > 0 ? { label: 'Review the rest', run: store.openReview } : undefined,
    }
  else if (drafts > 0 && origin === 'moved')
    body = {
      key: 'drafts',
      icon: ClipboardCheck,
      title: 'Review your migrated policies',
      line: 'Start review walks them one by one in the builder: compare with the old policy, approve, publish.',
      /* The counts live in these cards, not in the sentence (numbers once). */
      stats: [
        { label: 'To review', value: unreviewed },
        { label: 'Approved', value: approvedIds.length },
        ...(experience === 'yesterday' ? [] : [{ label: 'Rejected', value: rejectedList.length }]),
      ],
      /* Where review starts (owner, 9 Nov 2026): the first draft in the builder; its Back and Next walk the rest. */
      review: () => store.go({ name: 'board', policyId: (openList[0] ?? draftList[0]).id }),
      action: { label: 'Publish all', icon: Rocket, run: () => setConfirm(true) },
    }
  if (!body) return null
  /* Assisted and Self-serve: the Migration list says all of this (migration-results.tsx). */
  if (!isBuilt(experience) && body.key === 'drafts') return null
  const asCards = body.key === 'drafts' && variant === 'cards'
  if (asCards !== (place === 'review')) return null
  const Icon = body.icon
  /* Two cards while drafts wait (owner, 12 Nov 2026); the other states keep the single banner. */
  const cards = (
    <ReviewApproveCards
      toReview={unreviewed}
      approved={approvedIds.length}
      rejected={rejectedList.length}
      showReject={experience !== 'yesterday'}
      onReview={() => openList[0] && store.go({ name: 'board', policyId: openList[0].id })}
      onPublishApproved={() => setApprovedAsk(approvedIds)}
      onPublishAll={() => setConfirm(true)}
      onContactSupport={() => store.showToast('Contact support: this flow is planned next')}
    />
  )
  const current = (
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={body.key} className={`bfb bann${done ? ' is-done' : body.key === 'adding' || body.key === 'activating' ? ' is-work' : body.key === 'drafts' ? ' is-ready is-review' : ' is-ready'}`} aria-label="Migration" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          <span className="bfb__mark" aria-hidden>
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="bfb__words">
            <b>{body.title}</b>
            <span>{body.line}</span>
            {body.share !== undefined ? (
              <span className="bfb__bar" aria-hidden>
                <motion.i animate={{ width: `${body.share * 100}%` }} transition={{ duration: 0.3 }} />
              </span>
            ) : (
              store.activating && (
                <span className="bfb__bar is-indeterminate" aria-hidden>
                  <i />
                </span>
              )
            )}
          </span>
          {body.stats && (
            <dl className="bfb__stats">
              {body.stats.map((s) => (
                <div key={s.label} className="bfb__stat">
                  <dd>{s.value}</dd>
                  <dt>{s.label}</dt>
                </div>
              ))}
            </dl>
          )}
          {body.also && (
            <Button variant="ghost" size="sm" onClick={body.also.run}>
              {body.also.label}
            </Button>
          )}
          {body.action && body.key === 'drafts' ? (
            /* A split button (owner, 10 Nov 2026): Publish all, or only the approved ones, with their number. */
            <SplitButton
              label={body.action.label}
              icon={body.action.icon}
              variant="secondary"
              size="sm"
              onPress={body.action.run}
              menuLabel="More ways to publish"
              items={[
                { id: 'all', label: 'Publish all' },
                { id: 'approved', label: `Publish approved (${approvedIds.length})`, disabled: approvedIds.length === 0 },
              ]}
              onSelect={(id) => (id === 'approved' ? setApprovedAsk(approvedIds) : setConfirm(true))}
            />
          ) : (
            body.action && (
              <Button variant="secondary" size="sm" icon={body.action.icon} onClick={body.action.run}>
                {body.action.label}
              </Button>
            )
          )}
          {body.review && <NewBuilderButton label="Start review" icon={Eye} blink door={false} onOpen={body.review} />}
        </motion.section>
      </AnimatePresence>
  )
  return (
    <>
      {asCards ? cards : current}
      <PublishMovedConfirm ids={approvedAsk} approving onClose={() => setApprovedAsk(null)} />
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={publishable.length === 1 ? 'Publish 1 policy?' : `Publish ${publishable.length} policies?`}
        confirmLabel="Publish"
        confirmIcon={Rocket}
        destructive={false}
        ack={unreviewed ? `I am publishing ${unreviewed === 1 ? '1 policy' : `${unreviewed} policies`} without a review, and I am responsible for how they decide sign-ins.` : undefined}
        onConfirm={() => {
          setConfirm(false)
          /* Rejected drafts stay behind: publish the rest one by one; with none rejected, the whole move as before. */
          if (rejectedList.length) store.publishMoved(publishable.map((p) => p.id))
          else store.activateMoved()
        }}
      >
        {unreviewed ? `${unreviewed === publishable.length ? 'None of them has' : `${unreviewed} of them have not`} been approved yet. They start deciding sign-ins straight away.` : 'They start deciding sign-ins straight away, and move to New policies.'}
      </Confirm>
    </>
  )
}
