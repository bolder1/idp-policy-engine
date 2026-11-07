import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, CheckCircle2, Minimize2 } from 'lucide-react'
import { Button, StatusPill } from '../kit'
import { useBrand } from '../store'
import { AppTile } from './parts'

/* -----------------------------------------------------------------------------
   Move: the store's background job, told as a story (owner, 4 Nov 2026: "in a skeleton
   way ... how your old policy converts into the new policy ... generic, no need to show
   all the data").

   Left, three beats on a loop, drawn in skeleton shapes — the old rows are read; apps
   with the same settings come together, and an app that has a policy keeps it; each
   group becomes a rule; the policy lands as a draft. Right, what is actually
   happening: how far along, what moved, what was shared or joined, the zones, the
   changes and what was left out, and the latest to land. Minimize leaves it running (the
   top bar's pill and a toast carry it); Review opens as soon as one has landed.
   -------------------------------------------------------------------------- */

const BEATS = [
  { title: 'Reading your old policies', line: 'App Login and Adaptive Access, row by row' },
  { title: 'Each group becomes a rule', line: 'One policy per application; restrictions become conditions' },
  { title: 'Saved as a draft', line: 'It decides nothing until you make it active' },
]
const BEAT_MS = 2800
const EASE = [0.22, 1, 0.36, 1] as const

function Bar({ w, className = '' }: { w: string; className?: string }) {
  return <span className={`bmvs__bar ${className}`} style={{ width: w }} />
}

/* --- The four beats, in skeleton shapes ------------------------------------------------ */

function ReadBeat({ reduce }: { reduce: boolean | null }) {
  return (
    <div className="bmvs__table">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bmvs__row">
          <span className="bmvs__dot" />
          <Bar w="42%" />
          <Bar w="18%" className="is-soft" />
          <Bar w="14%" className="is-soft" />
        </div>
      ))}
      {!reduce && (
        <motion.span className="bmvs__scan" initial={{ top: '0%' }} animate={{ top: ['0%', '78%', '0%'] }} transition={{ duration: BEAT_MS / 1000, ease: 'easeInOut' }} />
      )}
    </div>
  )
}

function RuleBeat({ reduce }: { reduce: boolean | null }) {
  return (
    <div className="bmvs__chain">
      <span className="bmvs__pill">
        <span className="bmvs__pilldot" />
        <Bar w="70px" className="is-soft" />
      </span>
      {['is-mfa', 'is-allow', 'is-deny'].map((chip, i) => (
        <motion.div
          key={chip}
          className="bmvs__rule"
          initial={reduce ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + i * 0.4, duration: 0.35, ease: EASE }}
        >
          <span className="bmvs__edge" />
          <Bar w="46%" />
          <span className={`bmvs__chip ${chip}`} />
        </motion.div>
      ))}
      <motion.div className="bmvs__rule is-last" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.3 }}>
        <Bar w="52%" className="is-soft" />
      </motion.div>
    </div>
  )
}

function MonitorBeat({ reduce }: { reduce: boolean | null }) {
  return (
    <div className="bmvs__land">
      <motion.div className="bmvs__card is-big" initial={reduce ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="bmvs__cardhead">
          <Bar w="44%" />
          <StatusPill status="draft" />
        </div>
        <Bar w="80%" className="is-soft" />
        <Bar w="64%" className="is-soft" />
      </motion.div>
      <motion.span className="bmvs__tick" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 320, damping: 14 }}>
        <CheckCircle2 size={28} strokeWidth={2} />
      </motion.span>
    </div>
  )
}

function Story({ running }: { running: boolean }) {
  const reduce = useReducedMotion()
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setBeat((b) => (b + 1) % BEATS.length), BEAT_MS)
    return () => window.clearInterval(t)
  }, [running])
  const shown = running ? beat : 2
  const Scene = [ReadBeat, RuleBeat, MonitorBeat][shown]
  return (
    <section className="bmvs" aria-label="How a policy moves">
      <div className="bmvs__steps" aria-hidden>
        {BEATS.map((b, i) => (
          <span key={b.title} className={`bmvs__step${i === shown ? ' is-on' : ''}${i < shown ? ' is-done' : ''}`} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={shown} className="bmvs__beat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
          <div className="bmvs__stage">
            <Scene reduce={reduce} />
          </div>
          <h3 className="bmvs__title">{BEATS[shown].title}</h3>
          <p className="bmvs__line">{BEATS[shown].line}</p>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

/* --- What is actually happening ----------------------------------------------------------- */

export function MovingStage({ onReview }: { onReview: () => void }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const job = store.moveJob
  if (!job) return null
  const running = job.status === 'running'
  const share = job.total ? job.done / job.total : 1
  const done = job.queue.slice(0, job.done)
  const rows = job.queue.reduce((n, q) => n + q.sourceIds.length, 0)
  const rowsDone = done.reduce((n, q) => n + q.sourceIds.length, 0)
  const infos = job.ids.map((id) => store.moved[id]).filter((m) => !!m)
  const stats: [string, number | string][] = [
    ['Old policies moved', `${rowsDone} of ${rows}`],
    ['New policies', done.filter((q) => !q.joins).length],
    ['Joined a policy', done.filter((q) => q.joins).length],
    ['Shared by apps', done.filter((q) => !q.joins && q.appIds.length > 1).length],
    ['Zones made', job.zones],
    ['Changes', infos.reduce((n, m) => n + m.changes.length, 0)],
    ['Left out', infos.reduce((n, m) => n + m.leftOut.length, 0)],
  ]
  const recent = job.ids.slice(-4).reverse()
  return (
    <div className="bmv__moving">
      <Story running={running} />
      <aside className="bmvx" aria-label="Progress">
        <h2 className="bmvx__head" aria-live="polite">
          {running ? (
            <>
              Moving <b>{job.done}</b> of {job.total}
            </>
          ) : (
            <>
              <CheckCircle2 size={20} strokeWidth={2} aria-hidden /> {job.status === 'stopped' ? 'Stopped' : 'All moved'}
            </>
          )}
        </h2>
        <div className="bmv__progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done} aria-label="Policies moved">
          <motion.span animate={{ width: `${share * 100}%` }} transition={{ duration: reduce ? 0 : 0.3 }} />
        </div>
        <dl className="bmvx__stats">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {recent.length > 0 && (
          <div className="bmvx__recent">
            <h3 className="bmv__lanehead">Just landed</h3>
            <ul>
              <AnimatePresence initial={false}>
                {recent.map((id) => {
                  const p = store.migratedById(id)
                  if (!p) return null
                  return (
                    <motion.li key={id} initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <span className="bmvx__logos">
                        {p.appIds.slice(0, 3).map((a) => (
                          <AppTile key={a} appId={a} size={20} />
                        ))}
                      </span>
                      <span className="bmvx__name">{p.name}</span>
                      {store.moved[id]?.joined && <span className="bmvx__tag">Joined</span>}
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </div>
        )}
        <div className="bmvx__actions">
          {running && (
            <>
              <Button variant="ghost" onClick={store.stopMove}>
                Stop
              </Button>
              <Button variant="secondary" icon={Minimize2} onClick={() => store.go({ name: 'policies' })}>
                Minimize
              </Button>
            </>
          )}
          <Button variant="brand" iconRight={ArrowRight} disabled={job.done === 0} onClick={onReview}>
            Review
          </Button>
        </div>
      </aside>
    </div>
  )
}
