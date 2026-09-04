import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ArrowRight, Award, Lock, ShieldCheck, TrendingDown, TrendingUp, Unlock } from 'lucide-react'

import { Button, Counter, Modal } from '../kit'
import type { Policy } from '../data'
import { useBrand } from '../store'
import { diagnose } from './diagnostics'
import {
  LANES,
  SITUATIONS,
  SWEEP_AXES,
  SWEEP_TIMES,
  badges,
  compare,
  guardedShare,
  openShare,
  sweep,
  type Lane,
} from './impact-arena'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   The Impact arena, on screen.

   The game here is not a score — it is a tug-of-war you cannot win outright.
   Two meters sit against each other: how much of the modelled world is guarded,
   and how much of it signs in unimpeded. Every rule you add moves both, and the
   arena refuses to pretend that pushing one up is free.

   The dot field is the whole point. 1,440 dots, one per modelled situation, in
   a stable order — so the same dot is the same situation before and after, and
   watching the field change is watching your edit land. A bar chart would show
   the totals and hide the fact that the situations which moved are not the ones
   you meant.

   The badges are assertions about that field, each one losable, each one naming
   what broke it. They are the closest thing here to a reward, and they are all
   things a security reviewer would have asked for anyway.
   -------------------------------------------------------------------------- */

type View = 'after' | 'before' | 'moved'

const LANE_KEY: Record<Lane, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

export function ImpactArenaDialog({
  open,
  draft,
  saved,
  onClose,
  onJumpToRule,
}: {
  open: boolean
  draft: Policy
  /** The published version. Same object as `draft` when nothing is unsaved. */
  saved: Policy
  onClose: () => void
  onJumpToRule?: (index: number) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const [timeIdx, setTimeIdx] = useState(1)
  const [view, setView] = useState<View>('after')

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )

  const at = SWEEP_TIMES[timeIdx]
  const dirty = JSON.stringify(saved.rules) !== JSON.stringify(draft.rules)

  const after = useMemo(() => sweep(draft, env, at.minutes), [draft, env, at.minutes])
  const before = useMemo(() => (dirty ? sweep(saved, env, at.minutes) : after), [dirty, saved, env, at.minutes, after])
  const movement = useMemo(() => (dirty ? compare(before, after) : null), [dirty, before, after])

  const errors = useMemo(
    () => diagnose(draft, store.groups, store.hooks).filter((d) => d.severity === 'error' && draft.rules[d.ruleIndex]?.enabled !== false).length,
    [draft, store.groups],
  )
  const earned = useMemo(() => badges(draft, after, movement, errors), [draft, after, movement, errors])

  /* Precomputed once: a per-dot inline delay makes the field sweep left to
     right instead of flashing, and computing it inside the map would rebuild
     1,440 style objects on every toggle. */
  const delays = useMemo(() => {
    // Must match the column count in impact-arena.css, or the sweep runs
    // diagonally across the field instead of left to right.
    const cols = 72
    return SITUATIONS.map((_, i) => `${((i % cols) * 1.1 + Math.floor(i / cols) * 5).toFixed(0)}ms`)
  }, [])

  const shown = view === 'before' ? before : after
  const guarded = guardedShare(shown)
  const open_ = openShare(shown)
  const guardedDelta = guardedShare(after) - guardedShare(before)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Blast radius"
      width={960}
      padded={false}
      footer={
        <>
          <span className="bia__foot">
            {SITUATIONS.length.toLocaleString()} modelled situations ={' '}
            {SWEEP_AXES.map((a) => `${a.values.length} ${a.name.toLowerCase()}`).join(' × ')}. Exact over that
            space, silent about the world beyond it.
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="bia">
        {/* --- Headline ----------------------------------------------------- */}
        <header className="bia__head">
          <div className="bia__headline">
            {movement ? (
              <>
                <h3>
                  <Counter value={movement.changed} /> of {SITUATIONS.length.toLocaleString()} situations change
                  treatment
                </h3>
                <p>
                  <span className="bia__up">
                    <TrendingUp size={13} strokeWidth={2} aria-hidden /> {movement.stricter} tightened
                  </span>
                  <span className={`bia__down ${movement.looser > 0 ? 'is-alarm' : ''}`}>
                    <TrendingDown size={13} strokeWidth={2} aria-hidden /> {movement.looser} loosened
                  </span>
                  {movement.looser > 0 && <b>Loosening is the direction worth being sure about.</b>}
                </p>
              </>
            ) : (
              <>
                <h3>Nothing is unpublished — this is the policy as it stands</h3>
                <p>
                  Edit a rule and come back to see what moves. Until then the field below is simply what these rules
                  do to every situation this simulator can construct.
                </p>
              </>
            )}
          </div>

          <div className="bia__time" role="group" aria-label="Time of day">
            {SWEEP_TIMES.map((t, i) => (
              <button
                key={t.label}
                type="button"
                className={i === timeIdx ? 'is-on' : ''}
                aria-pressed={i === timeIdx}
                title={t.caption}
                onClick={() => setTimeIdx(i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div className="bia__body">
          {/* --- The tug of war --------------------------------------------- */}
          <section className="bia__meters">
            <div className="bia__meter">
              <span className="u-label">
                <ShieldCheck size={13} strokeWidth={2} aria-hidden /> Guarded
              </span>
              <div className="bia__bar">
                <motion.i
                  className="is-guarded"
                  animate={{ width: `${guarded}%` }}
                  transition={{ type: reduce ? 'tween' : 'spring', duration: reduce ? 0 : undefined, stiffness: 120, damping: 22 }}
                />
              </div>
              <strong>
                {guarded}%
                {dirty && guardedDelta !== 0 && view !== 'before' && (
                  <em className={guardedDelta > 0 ? 'is-up' : 'is-down'}>
                    {guardedDelta > 0 ? '+' : ''}
                    {guardedDelta}
                  </em>
                )}
              </strong>
              <p>Situations that end in a second factor or a denial.</p>
            </div>

            <div className="bia__meter">
              <span className="u-label">
                <Unlock size={13} strokeWidth={2} aria-hidden /> Unimpeded
              </span>
              <div className="bia__bar">
                <motion.i
                  className="is-open"
                  animate={{ width: `${open_}%` }}
                  transition={{ type: reduce ? 'tween' : 'spring', duration: reduce ? 0 : undefined, stiffness: 120, damping: 22 }}
                />
              </div>
              <strong>{open_}%</strong>
              <p>Situations that sign in on one factor and are asked nothing further.</p>
            </div>
          </section>

          {/* --- The field --------------------------------------------------- */}
          <section className="bia__field">
            <div className="bia__fieldbar">
              <div className="bia__views" role="tablist" aria-label="Field view">
                {(['after', 'before', 'moved'] as View[]).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    type="button"
                    aria-selected={view === v}
                    className={view === v ? 'is-on' : ''}
                    disabled={!dirty && v !== 'after'}
                    onClick={() => setView(v)}
                  >
                    {v === 'after' ? 'Now' : v === 'before' ? 'Published' : 'What moved'}
                  </button>
                ))}
              </div>
              <ul className="bia__legend">
                {LANES.map((l) => (
                  <li key={l.id} title={l.caption}>
                    <i className={`is-${LANE_KEY[l.id]}`} aria-hidden />
                    {l.label}
                    <b>{shown.counts[l.id].toLocaleString()}</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`bia__dots ${view === 'moved' ? 'is-moved' : ''}`} aria-hidden>
              {SITUATIONS.map((s) => {
                const lane = LANE_KEY[shown.decisions[s.index]]
                const move = movement?.moves[s.index] ?? 'same'
                return (
                  <span
                    key={s.index}
                    className={`bia__dot is-${lane} is-${move}`}
                    style={{ transitionDelay: delays[s.index] }}
                  />
                )
              })}
            </div>

            <p className="bia__fieldnote">
              One dot per modelled sign-in situation, in a fixed order — the same dot is the same situation in every
              view, so the field can be compared rather than just looked at.
              {shown.fellThrough > 0 && (
                <>
                  {' '}
                  <b>{shown.fellThrough.toLocaleString()}</b> of them match no rule at all and are decided by the
                  engine default.
                </>
              )}
            </p>
          </section>

          {/* --- Where it went ----------------------------------------------- */}
          <AnimatePresence initial={false}>
            {movement && movement.changed > 0 && (
              <motion.section
                className="bia__flows"
                initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
              >
                <h4 className="u-label">Where the movement went</h4>
                <ul>
                  {movement.flows.map((f) => (
                    <li key={`${f.from}-${f.to}`}>
                      <span className={`bia__lane is-${LANE_KEY[f.from]}`}>{LANES.find((l) => l.id === f.from)!.label}</span>
                      <ArrowRight size={13} strokeWidth={2} aria-hidden />
                      <span className={`bia__lane is-${LANE_KEY[f.to]}`}>{LANES.find((l) => l.id === f.to)!.label}</span>
                      <b>{f.n.toLocaleString()}</b>
                    </li>
                  ))}
                </ul>

                <h4 className="u-label">Who moves most</h4>
                <ul className="bia__cohorts">
                  {movement.cohorts.map((c) => (
                    <li key={c.label}>
                      <span>{c.label}</span>
                      <b className={`is-${c.move}`}>
                        {c.move === 'stricter' ? '↑' : '↓'} {c.n}
                      </b>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}
          </AnimatePresence>

          {/* --- Rule reach --------------------------------------------------- */}
          <section className="bia__reach">
            <h4 className="u-label">What each rule actually catches</h4>
            <ul>
              {draft.rules.map((r, i) => {
                const n = after.reach[i]
                const pct = Math.round((n / SITUATIONS.length) * 100)
                return (
                  <li key={r.id} className={n === 0 && r.enabled ? 'is-dead' : ''}>
                    <button
                      type="button"
                      className="bia__reachname"
                      disabled={!onJumpToRule}
                      onClick={() => onJumpToRule?.(i)}
                    >
                      <span className="bia__reachn">{i + 1}</span>
                      {r.name}
                      {!r.enabled && <em>off</em>}
                    </button>
                    <span className="bia__reachbar">
                      <motion.i
                        className={`is-${LANE_KEY[r.decision]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, n > 0 ? 1 : 0)}%` }}
                        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : i * 0.04 }}
                      />
                    </span>
                    <b>{n === 0 && r.enabled ? 'catches nothing' : `${n.toLocaleString()} · ${pct}%`}</b>
                  </li>
                )
              })}
              <li className="is-default">
                <span className="bia__reachname is-static">
                  <span className="bia__reachn">—</span>
                  Engine default
                </span>
                <span className="bia__reachbar">
                  <i className="is-allow" style={{ width: `${Math.round((after.fellThrough / SITUATIONS.length) * 100)}%` }} />
                </span>
                <b>
                  {after.fellThrough.toLocaleString()} · {Math.round((after.fellThrough / SITUATIONS.length) * 100)}%
                </b>
              </li>
            </ul>
          </section>

          {/* --- Badges -------------------------------------------------------- */}
          <section className="bia__badges">
            <h4 className="u-label">
              <Award size={13} strokeWidth={2} aria-hidden /> Standing claims
            </h4>
            <div className="bia__badgegrid">
              {earned.map((b) => (
                <div key={b.id} className={`bia__badge ${b.earned ? 'is-earned' : ''}`}>
                  <span className="bia__badgemark" aria-hidden>
                    {b.earned ? <ShieldCheck size={15} strokeWidth={1.9} /> : <Lock size={15} strokeWidth={1.9} />}
                  </span>
                  <strong>{b.label}</strong>
                  <p>{b.earned ? b.claim : (b.detail ?? b.claim)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  )
}

/** The toolbar reading: the movement number, live, without opening anything. */
export function ImpactPip({ draft, saved, onOpen }: { draft: Policy; saved: Policy; onOpen: () => void }) {
  const store = useBrand()
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )
  const dirty = JSON.stringify(saved.rules) !== JSON.stringify(draft.rules)
  const n = useMemo(() => {
    if (!dirty) return null
    return compare(sweep(saved, env, 570), sweep(draft, env, 570))
  }, [dirty, saved, draft, env])

  return (
    <button type="button" className={`bia__pip ${n && n.looser > 0 ? 'is-alarm' : ''}`} onClick={onOpen}>
      <ShieldCheck size={12} strokeWidth={2} aria-hidden />
      Impact
      {n ? (
        <b>
          {n.changed} moved{n.looser > 0 ? ` · ${n.looser} looser` : ''}
        </b>
      ) : (
        <em>no change</em>
      )}
    </button>
  )
}
