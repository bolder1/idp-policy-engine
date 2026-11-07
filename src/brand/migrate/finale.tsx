import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, CheckCircle2, Globe, Lock, Maximize2, Minimize2, Plus, Power, ShieldCheck } from 'lucide-react'
import { Button, Confirm } from '../kit'
import { useBrand } from '../store'
import { AppTile } from './parts'
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

/** The whole page while a move runs: the conveyor, the bar, the latest to land. */
export function MovingShowcase() {
  const store = useBrand()
  const reduce = useReducedMotion()
  const job = store.moveJob
  if (!job) return null
  const share = job.total ? job.done / job.total : 0
  const recent = job.ids.slice(-5).reverse()
  return (
    <section className="bfn" aria-label="Moving your policies" aria-live="polite">
      <span className="bfn__min">
        <Button variant="secondary" size="sm" icon={Minimize2} onClick={() => store.setMoveMinimized(true)}>
          Minimize
        </Button>
      </span>
      <div className="bfn__stage" aria-hidden>
        <span className="bfn__lane">
          {[0, 1, 2].map((n) => (
            <motion.span
              key={n}
              className="bfn__old"
              initial={false}
              animate={reduce ? { opacity: 1 } : { left: ['-4%', '34%', '34%'], opacity: [0, 1, 0] }}
              transition={reduce ? undefined : { duration: 2.4, times: [0, 0.6, 1], repeat: Infinity, delay: n * 0.8, ease: 'easeInOut' }}
            >
              <span className="bfn__oldhead">{n % 2 ? <Globe size={11} strokeWidth={2.2} /> : <Lock size={11} strokeWidth={2.2} />}</span>
              <i />
              <i className="is-short" />
            </motion.span>
          ))}
        </span>
        <span className="bfn__core">
          {!reduce && <motion.span className="bfn__ring" animate={{ rotate: 360 }} transition={{ duration: 6, ease: 'linear', repeat: Infinity }} />}
          <ShieldCheck size={26} strokeWidth={2} />
        </span>
        <span className="bfn__lane is-out">
          {[0, 1, 2].map((n) => (
            <motion.span
              key={n}
              className="bfn__new"
              initial={false}
              animate={reduce ? { opacity: 1 } : { left: ['58%', '78%', '100%'], opacity: [0, 1, 0] }}
              transition={reduce ? undefined : { duration: 2.4, times: [0, 0.4, 1], repeat: Infinity, delay: 1.2 + n * 0.8, ease: 'easeInOut' }}
            >
              <ShieldCheck size={12} strokeWidth={2.2} />
              <i />
            </motion.span>
          ))}
        </span>
      </div>

      <div className="bfn__words">
        <h2>Moving your policies</h2>
        <p>
          {job.done} of {job.total}, in the background. Keep working.
        </p>
        <div className="bfn__bar" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done} aria-label="Policies moved">
          <motion.span animate={{ width: `${share * 100}%` }} transition={{ duration: reduce ? 0 : 0.35 }} />
        </div>
      </div>

      {recent.length > 0 && (
        <ul className="bfn__recent" aria-label="Just moved">
          <AnimatePresence initial={false} mode="popLayout">
            {recent.map((id) => {
              const p = store.migratedById(id)
              if (!p) return null
              return (
                <motion.li key={id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <span className="bfn__logos">
                    {p.appIds.slice(0, 2).map((a) => (
                      <AppTile key={a} appId={a} size={18} />
                    ))}
                  </span>
                  <b>{p.name}</b>
                  <span className="bfn__draft">Draft</span>
                  <Check size={14} strokeWidth={2.4} className="bfn__tick" aria-hidden />
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

/** The move folded into a bar: it keeps running; Expand opens the stage again. */
export function MovingBar() {
  const store = useBrand()
  const reduce = useReducedMotion()
  const job = store.moveJob
  if (!job) return null
  const share = job.total ? job.done / job.total : 0
  return (
    <section className="bfb is-moving" aria-label="Moving your policies" aria-live="polite">
      <span className="bfb__mark" aria-hidden>
        <span className="bfb__spin" />
      </span>
      <span className="bfb__words">
        <b>Moving your policies</b>
        <span>
          {job.done} of {job.total}, in the background
        </span>
        <span className="bfb__bar" aria-hidden>
          <motion.i animate={{ width: `${share * 100}%` }} transition={{ duration: reduce ? 0 : 0.35 }} />
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
    store.revealHeld()
  }, [key, store.held.length, store])
  /* Every row in: the tour starts, once a move (owner, 6 Nov 2026). */
  const toured = useRef<string | null>(null)
  const settled = reveal.current === key && store.held.length === 0 && store.landing.length === 0
  useEffect(() => {
    if (!key || !settled || toured.current === key) return
    toured.current = key
    const t = window.setTimeout(() => store.setMoveTour(true), 900)
    return () => window.clearTimeout(t)
  }, [key, settled, store])
  return null
}

/** The banner after review: add the approved rows, make them all active, then done. Null when none applies. */
export function MoveFinale() {
  const store = useBrand()
  const [confirm, setConfirm] = useState(false)
  const held = store.held.length
  const draftList = store.policies.filter((p) => p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0)
  const drafts = draftList.length
  /* Publish all can skip Approve; then the confirm asks the admin to take it on (owner, 6 Nov 2026). */
  const unreviewed = draftList.filter((p) => !store.moved[p.id]?.reviewed).length
  const done = store.migrationDone
  
  const toReview = Object.values(store.moved).filter((m) => !m.approved).length
  const adding = !store.activating && store.landing.length > 0
  const addTotal = store.landing.length + held
  let body: { key: string; icon: typeof Plus; title: string; line: string; action?: { label: string; icon: typeof Plus; run: () => void }; also?: { label: string; run: () => void }; share?: number } | null = null
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
  else if (drafts > 0)
    body = {
      key: 'drafts',
      icon: Power,
      title: 'Publish your moved policies',
      line: 'Open each to approve it, then publish from the table or the builder, or all at once. Publishing deletes the old policies they came from.',
      action: { label: 'Publish all', icon: Power, run: () => setConfirm(true) },
    }
  if (!body) return null
  const Icon = body.icon
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={body.key} className={`bfb${done ? ' is-done' : ''}`} aria-label="Migration" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          <span className="bfb__mark" aria-hidden>
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="bfb__words">
            <b>{body.title}</b>
            <span>{body.line}</span>
            {body.share !== undefined && (
              <span className="bfb__bar" aria-hidden>
                <motion.i animate={{ width: `${body.share * 100}%` }} transition={{ duration: 0.3 }} />
              </span>
            )}
          </span>
          {(store.activating || body.key === 'adding') && <span className="bfb__spin" aria-hidden />}
          {body.also && (
            <Button variant="ghost" size="sm" onClick={body.also.run}>
              {body.also.label}
            </Button>
          )}
          {body.action && (
            <Button variant="secondary" size="sm" icon={body.action.icon} onClick={body.action.run}>
              {body.action.label}
            </Button>
          )}
        </motion.section>
      </AnimatePresence>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={drafts === 1 ? 'Publish 1 policy?' : `Publish ${drafts} policies?`}
        confirmLabel="Publish"
        confirmIcon={ArrowRight}
        ack={unreviewed ? `I am publishing ${unreviewed === 1 ? '1 policy' : `${unreviewed} policies`} without a review, and I am responsible for how they decide sign-ins.` : undefined}
        onConfirm={() => {
          setConfirm(false)
          store.activateMoved()
        }}
      >
        {unreviewed ? `${unreviewed === drafts ? 'None of them has' : `${unreviewed} of them have not`} been approved yet. They start deciding sign-ins straight away.` : 'They start deciding sign-ins straight away, and move to New policies.'}
      </Confirm>
    </>
  )
}
