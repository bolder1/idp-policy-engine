import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MoveVersions, StepList } from './move-versions'
import { ArrowRight, CheckCircle2, Globe, Layers, Lock, MapPin, MonitorSmartphone, Power, ShieldCheck } from 'lucide-react'
import { Button, Modal } from '../kit'
import { useBrand } from '../store'
import { blockedReason, mergeOffers, planMove, type MoveContext, type MovePlan } from './plan'
import './move-dialog.css'

/* -----------------------------------------------------------------------------
   Move policies, the form (owner, 5 Nov 2026: "I don't need actual data, I just need an
   overview that helps the user understand the process").

   An infographic of the four steps in the order the move runs them, all on one screen
   (owner, 5 Nov 2026: "4 steps in one screen"): merge your policies, zones and device
   profiles where needed, review, make active. A numbered track across the top, a
   column each below with its picture and words. Generic pieces, no tenant data. The page fits the screen; the footer sits under the stage. Move starts
   it for every old policy that can move; the count is said once, on the button. With
   nothing left to move, it says so.
   -------------------------------------------------------------------------- */

/** What a move would do now: the old policies that can move and the plan for them. */
function useMovePlan(pick?: string[]) {
  const store = useBrand()
  const { legacy, movedLegacy, moveApps: apps, groups, zones, policies, users, methods, staged, fingerprints } = store
  const ctx = useMemo<MoveContext>(
    () => ({ apps, groups, users, zones, policies, staged, methods: methods.map((m) => m.name), fingerprints }),
    [apps, groups, users, zones, policies, staged, methods, fingerprints],
  )
  const pending = legacy.policies.filter((lp) => !movedLegacy[lp.id])
  const movable = pending.filter((lp) => !blockedReason(lp, ctx))
  const selected = useMemo(() => movable.filter((lp) => !pick || pick.includes(lp.id)), [movable, pick])
  const offers = useMemo(() => mergeOffers(selected, ctx), [selected, ctx])
  const plan = useMemo(() => planMove(selected, legacy, ctx, offers.map((o) => o.key)), [selected, legacy, ctx, offers])
  const count = selected.length
  const newCount = plan.policies.filter((pp) => !pp.into).length
  return { plan, count, newCount }
}

/* What moves, counted once (owner, 6 Nov 2026: "show how many policies are actually moving"). */
function MoveSum({ plan, count, newCount }: ReturnType<typeof useMovePlan>) {
  return (
    <section className="bmpk__sum" aria-label="What moves">
      <span className="bmpk__fig">
        <b>{count}</b>
        <span>{count === 1 ? 'old policy' : 'old policies'}</span>
        <em>App Login and Adaptive Access</em>
      </span>
      <ArrowRight size={18} strokeWidth={2} className="bmpk__figto" aria-hidden />
      <span className="bmpk__fig is-new">
        <b>{newCount}</b>
        <span>{newCount === 1 ? 'new policy' : 'new policies'}</span>
        <em>One per application, or shared</em>
      </span>
      <span className="bmpk__fig">
        <b>{plan.zones.length}</b>
        <span>{plan.zones.length === 1 ? 'zone' : 'zones'}</span>
        <em>From IP ranges and locations</em>
      </span>
      <span className="bmpk__fig">
        <b>{plan.profiles.length}</b>
        <span>{plan.profiles.length === 1 ? 'device profile' : 'device profiles'}</span>
        <em>From device limits</em>
      </span>
    </section>
  )
}

/* -----------------------------------------------------------------------------
   The Migrate popup (owner, 6 Nov 2026): where the intro's Migrate now lands, and the
   one point of no return. What moves, counted; the four steps; what does not change.
   Migrate starts the move, swaps the rail to the new Policy and lands on New policies.
   Cancel goes back to the old pages, nothing changed.
   -------------------------------------------------------------------------- */
export function MigratePopup() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  /* The switch-over (owner, 6 Nov 2026: "after this we can show the transition"): a door grows out of Migrate and
     covers the console; under it the rail swaps to the new Policy and New policies opens with the move running; then
     the door clears. Reduced motion goes straight across. */
  const [door, setDoor] = useState<{ x: number; y: number } | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const migrate = (plan: MovePlan, from: HTMLElement | null) => {
    if (reduce || !from) return store.beginMigration(plan)
    const r = from.getBoundingClientRect()
    setDoor({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    timers.current.push(
      window.setTimeout(() => store.beginMigration(plan), 900),
      window.setTimeout(() => setDoor(null), 2300),
    )
  }
  return (
    <>
      {store.moveDialog && <MigrateBody pick={store.moveDialog.pick} onMigrate={migrate} />}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {door && (
              <motion.div
                className="bmgd"
                aria-live="polite"
                initial={{ clipPath: `circle(0px at ${door.x}px ${door.y}px)` }}
                animate={{ clipPath: `circle(150vmax at ${door.x}px ${door.y}px)` }}
                exit={{ opacity: 0, transition: { duration: 0.4 } }}
                transition={{ duration: 0.7, ease: DOOR_EASE }}
              >
                <motion.div className="bmgd__in" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4, ease: DOOR_EASE }}>
                  <span className="bmgd__marks" aria-hidden>
                    <motion.span className="bmgd__mark is-old" initial={{ opacity: 1, x: 0 }} animate={{ opacity: 0.45, x: -4 }} transition={{ delay: 0.6, duration: 0.4 }}>
                      <Layers size={28} strokeWidth={1.8} />
                    </motion.span>
                    <motion.span className="bmgd__line" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.55, duration: 0.45, ease: DOOR_EASE }} />
                    <motion.span className="bmgd__mark is-new" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 280, damping: 16 }}>
                      <ShieldCheck size={30} strokeWidth={1.8} />
                    </motion.span>
                  </span>
                  <b className="bmgd__title">Switching to the new Policy builder</b>
                  <span className="bmgd__line2">Old policies stay in effect until you publish.</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}

const DOOR_EASE = [0.22, 1, 0.36, 1] as const

function MigrateBody({ pick, onMigrate }: { pick?: string[]; onMigrate: (plan: MovePlan, from: HTMLElement | null) => void }) {
  const store = useBrand()
  const plan = useMovePlan(pick)
  const foot = useRef<HTMLDivElement | null>(null)
  return (
    <Modal
      open
      onClose={store.closeMoveDialog}
      title="Migrate to the new Policy builder"
      width={920}
      footer={
        <div className="bmpk__foot is-popup" ref={foot}>
          <span className="bmpk__safe">
            <Power size={14} strokeWidth={2} aria-hidden />
            Sign-ins keep working. Old policies stay in effect until you publish each new one.
          </span>
          <Button variant="secondary" onClick={store.closeMoveDialog}>
            Cancel
          </Button>
          <Button variant="brand" iconRight={ArrowRight} disabled={plan.count === 0} onClick={() => onMigrate(plan.plan, foot.current?.querySelector<HTMLElement>('.bx-btn--brand') ?? null)}>
            Migrate
          </Button>
        </div>
      }
    >
      <MigrateLayout {...plan} />
    </Modal>
  )
}

/* The popup's body, redone (owner, 6 Nov 2026: "redo the whole layout based on the current content"). Two columns:
   what moves as one before-and-after picture, every number said once in it; how the move works as four short steps. */
function MigrateLayout({ plan, count, newCount }: ReturnType<typeof useMovePlan>) {
  const zones = plan.zones.length
  const profiles = plan.profiles.length
  return (
    <div className="bmg2">
      <section className="bmg2__what" aria-label="What moves">
        <div className="bmg2__side">
          <span className="bmg2__tag">Today</span>
          <div className="bmg2__stack">
            <span className="bmg2__big">{count}</span>
            <span className="bmg2__what1">{count === 1 ? 'old policy' : 'old policies'}</span>
            <span className="bmg2__pages">
              <span className="bmg2__page">
                <Lock size={13} strokeWidth={2} aria-hidden />
                App Login
              </span>
              <span className="bmg2__page">
                <Globe size={13} strokeWidth={2} aria-hidden />
                Adaptive Access
              </span>
            </span>
          </div>
        </div>
        <svg className="bmg2__flow" viewBox="0 0 120 44" aria-hidden>
          <path d="M20 2 C20 22, 60 18, 60 40 M100 2 C100 22, 60 18, 60 40 M60 2 V40" />
          <path d="M54 34 L60 41 L66 34" className="is-head" />
        </svg>
        <div className="bmg2__side">
          <span className="bmg2__tag is-new">After you migrate</span>
          <div className="bmg2__newcard">
            <span className="bmg2__shield" aria-hidden>
              <ShieldCheck size={20} strokeWidth={2} />
            </span>
            <span className="bmg2__newtext">
              <span className="bmg2__big is-new">{newCount}</span>
              <span className="bmg2__what1">{newCount === 1 ? 'new policy' : 'new policies'}</span>
              <span className="bmg2__note">One per application, or shared. They arrive as drafts.</span>
            </span>
          </div>
          <div className="bmg2__parts">
            <span className="bmg2__part">
              <MapPin size={15} strokeWidth={2} aria-hidden />
              <b>{zones}</b> {zones === 1 ? 'zone' : 'zones'}
            </span>
            <span className="bmg2__part">
              <MonitorSmartphone size={15} strokeWidth={2} aria-hidden />
              <b>{profiles}</b> {profiles === 1 ? 'device profile' : 'device profiles'}
            </span>
          </div>
        </div>
      </section>
      <section className="bmg2__how" aria-label="How the move works">
        <span className="bmg2__label">How it works</span>
        <StepList />
      </section>
    </div>
  )
}

/** The move form, on its own page. `onDone` leaves it. */
export function MovePick({ pick, onDone }: { pick?: string[]; onDone: () => void }) {
  const store = useBrand()
  const { plan, count, newCount } = useMovePlan(pick)
  const move = () => {
    store.startMove(plan)
    store.showToast('Moving your policies in the background')
    onDone()
  }

  if (count === 0)
    return (
      <div className="bmpk__empty">
        <span className="bmpk__emptymark" aria-hidden>
          <CheckCircle2 size={26} strokeWidth={1.8} />
        </span>
        <b>Nothing left to move</b>
        <p>Every old App Login and Adaptive Access policy is in the Policy builder, or waiting for your review.</p>
        <Button variant="secondary" onClick={onDone}>
          Go to Policies
        </Button>
      </div>
    )

  return (
    <div className="bmpk">
      <MoveSum plan={plan} count={count} newCount={newCount} />
      <MoveVersions />

      <footer className="bmpk__foot">
        <span className="bmpk__safe">
          <Power size={14} strokeWidth={2} aria-hidden />
          Nothing changes for sign-ins until you make them active
        </span>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="brand" iconRight={ArrowRight} onClick={move}>
          Start migration
        </Button>
      </footer>
    </div>
  )
}
