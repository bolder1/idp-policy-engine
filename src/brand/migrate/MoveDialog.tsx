import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MoveVersions } from './move-versions'
import { useMovePlan } from './use-move-plan'
import { SceneOneWay } from './intro-scenes'
import { IntroWidget } from './intro-widgets'
import { NewBuilderButton } from './new-builder-button'
import './intro-simple.css'
import './old-policies.css'
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, FileInput, Plus, Send, Layers, Power, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button, Modal } from '../kit'
import { useBrand } from '../store'
import { type MovePlan } from './plan'
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
      {store.moveDialog && <MigrateBody pick={store.moveDialog.pick} consented={!!store.moveDialog.consented} onMigrate={migrate} />}
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

function MigrateBody({ pick, consented, onMigrate }: { pick?: string[]; consented: boolean; onMigrate: (plan: MovePlan, from: HTMLElement | null) => void }) {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const plan = useMovePlan(pick)
  const foot = useRef<HTMLDivElement | null>(null)
  /* The intro's frame (owner, 9 Nov 2026: "the same left and right side as the promotion"): words, count, steps and the
     buttons on the left; the picture on the right. Migrate swaps the words for the consent and the picture for the
     warning drawing; its tick arms Start migration. From the intro, which already asked, Start migration goes straight. */
  /* From the intro, which already showed the numbers, the popup opens on the consent (owner, 9 Nov 2026: one step). */
  const [confirming, setConfirming] = useState(consented)
  const [ack, setAck] = useState(false)
  const start = () => onMigrate(plan.plan, foot.current?.querySelector<HTMLElement>('.bnbb') ?? null)
  const t = { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const }
  /* The consent as the basic confirm, the same as Publish all's (owner, 10 Nov 2026: "after pressing Continue give me a
     basic popup like this"): the warning hero, one sentence, the tick, Start migration. */
  if (confirming)
    return (
      <Modal open onClose={() => (consented ? store.closeMoveDialog() : setConfirming(false))} title="Start the migration?" width={460} padded={false} bare>
        <div className="bsm">
          <h2>Start the migration?</h2>
          <div className="bsm__count" aria-label={`${plan.count} old policies become ${plan.newCount} new policies`}>
            <span>
              <b>{plan.count}</b>
              old {plan.count === 1 ? 'policy' : 'policies'}
            </span>
            <ArrowRight size={20} strokeWidth={1.8} aria-hidden />
            <span className="is-new">
              <b>{plan.newCount}</b>
              new {plan.newCount === 1 ? 'draft' : 'drafts'}
            </span>
          </div>
          <ul className="bsm__steps">
            <li>
              <Layers size={16} strokeWidth={1.9} aria-hidden />
              <span>
                <b>What happens</b>
                Each application's App Login and Adaptive Access policies become one draft policy.
              </span>
            </li>
            <li>
              <ShieldCheck size={16} strokeWidth={1.9} aria-hidden />
              <span>
                <b>What to expect</b>
                Sign-ins don't change until you approve and publish a draft.
              </span>
            </li>
            <li>
              <FileInput size={16} strokeWidth={1.9} aria-hidden />
              <span>
                <b>Where to find them</b>
                Drafts are under review in New policies. The old ones stay readable in Old policies.
              </span>
            </li>
          </ul>
          <label className="bsm__ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I understand the old pages won't come back
          </label>
          <footer className="bsm__foot" ref={foot}>
            <Button variant="secondary" onClick={() => (consented ? store.closeMoveDialog() : setConfirming(false))}>
              Cancel
            </Button>
            <NewBuilderButton label="Start migration" door={false} disabled={!ack} onOpen={start} />
          </footer>
        </div>
      </Modal>
    )
  return (
    <Modal open onClose={store.closeMoveDialog} title="Migrate your old policies" width={960} padded={false} bare>
      <div className="bis">
        <div className="bis__side">
          <AnimatePresence mode="wait" initial={false}>
            {confirming ? (
              <motion.div key="ask" className="bis__copy" initial={{ opacity: 0, x: reduce ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -12 }} transition={t}>
                <span className="bis__kind is-warn">
                  <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
                  Before you start
                </span>
                <h2>Start the migration?</h2>
                <p>{`Your ${plan.count} old ${plan.count === 1 ? 'policy becomes' : 'policies become'} ${plan.newCount} new ${plan.newCount === 1 ? 'policy' : 'policies'}, as drafts. You can't switch back to the old pages; every old policy stays readable in the Old policies tab.`}</p>
                <label className="bis__ack">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  I understand the old pages are replaced.
                </label>
              </motion.div>
            ) : (
              <motion.div key="sum" className="bis__copy" initial={{ opacity: 0, x: reduce ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -12 }} transition={t}>
                <span className="bis__kind">Migration</span>
                <h2>Migrate your old policies</h2>
                <p>Each application's old policies become one new policy, as a draft. Nothing changes for sign-ins until you publish.</p>
                <MoveCount count={plan.count} newCount={plan.newCount} />
              </motion.div>
            )}
          </AnimatePresence>
          <footer className="bis__foot" ref={foot}>
            <span className="bis__gap" />
            {confirming ? (
              <>
                <Button
                  variant="secondary"
                  icon={ArrowLeft}
                  onClick={() => {
                    if (consented) return store.closeMoveDialog()
                    setConfirming(false)
                    setAck(false)
                  }}
                >
                  Back
                </Button>
                <NewBuilderButton label="Start migration" door={false} disabled={!ack} onOpen={start} />
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={store.closeMoveDialog}>
                  Cancel
                </Button>
                <NewBuilderButton label="Continue" door={false} disabled={plan.count === 0} onOpen={() => setConfirming(true)} />
              </>
            )}
          </footer>
        </div>
        <div className="bis__stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={confirming ? 'ask' : 'sum'} aria-hidden className="bis__art" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
              {confirming ? (
                <SceneOneWay reduce={reduce} />
              ) : (
                <div className="bis__circle">
                  <IntroWidget id="move" reduce={reduce} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  )
}

/* How it works, basic (owner, 9 Nov 2026: "this feels too complex"): three steps, a word and a line each. */
const BASIC_STEPS = [
  { icon: FileInput, title: 'Migrate', line: 'Each old policy arrives as a draft.' },
  { icon: ClipboardCheck, title: 'Review', line: 'Compare it with the old one and approve.' },
  { icon: Send, title: 'Publish', line: 'The new policy starts deciding sign-ins.' },
]

export function MigrateEmpty({ onNew }: { /** Two tabs: New policy sits beside Migrate. */ onNew?: () => void } = {}) {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const plan = useMovePlan()
  /* The consent is part of this page, not a second popup (owner, 9 Nov 2026): Migrate swaps the summary for it, in place. */
  const [confirming, setConfirming] = useState(false)
  const [ack, setAck] = useState(false)
  const back = () => {
    setConfirming(false)
    setAck(false)
  }
  const go = () => {
    back()
    store.startMove(plan.plan)
    store.showToast('Moving your policies in the background')
  }
  const swap = reduce ? { duration: 0 } : { duration: 0.22 }
  return (
    <section className="bmge" aria-label="Migrate your old policies">
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div key="confirm" className="bmge__confirm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={swap}>
            <span className="bmge__hero" aria-hidden>
              <i />
              <i />
              <i />
              <span className="bmge__badge">
                <TriangleAlert size={26} strokeWidth={1.75} />
              </span>
            </span>
            <h2>Start moving your old policies?</h2>
            <p>
              {`Your ${plan.count} old ${plan.count === 1 ? 'policy becomes' : 'policies become'} ${plan.newCount} new ${plan.newCount === 1 ? 'policy' : 'policies'}, as drafts. This is one way: you can't switch back to the old pages. You can still read every old policy in the Old policies tab, and nothing changes for sign-ins until you publish.`}
            </p>
            <label className="bmge__ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I understand I can't switch back to the old pages.
            </label>
            <div className="bmge__actions">
              <Button variant="secondary" onClick={back}>
                Back
              </Button>
              <Button variant="brand" iconRight={ArrowRight} disabled={!ack} onClick={go}>
                Migrate
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="summary" className="bmge__summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={swap}>
            {/* Two columns across the page (owner, 9 Nov 2026: "utilize the space wisely"): what happens and the way in on the
                left, the count highlighted; the three steps on the right. */}
            <div className="bmge__lead">
              <h2>Migrate your old policies</h2>
              <p className="bmge__count">
                <span>
                  <b>{plan.count}</b> old {plan.count === 1 ? 'policy' : 'policies'}
                </span>
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
                <span>
                  <b>{plan.newCount}</b> new {plan.newCount === 1 ? 'policy' : 'policies'}
                </span>
              </p>
              <span className="bmpk__safe">
                <Power size={14} strokeWidth={2} aria-hidden />
                Sign-ins keep working. Old policies stay in effect until you publish each new one.
              </span>
              <span className="bmge__go">
                <Button variant="brand" iconRight={ArrowRight} disabled={plan.count === 0} onClick={() => setConfirming(true)}>
                  Migrate
                </Button>
                {onNew && (
                  <Button variant="secondary" icon={Plus} onClick={onNew}>
                    New policy
                  </Button>
                )}
              </span>
            </div>
            <ol className="bmge__steps" aria-label="How it works">
              {BASIC_STEPS.map((st, n) => (
                <li key={st.title}>
                  <span className="bmge__stepicon" aria-hidden>
                    <st.icon size={18} strokeWidth={2} />
                  </span>
                  <span className="bmge__steptext">
                    <b>{`${n + 1}. ${st.title}`}</b>
                    <span>{st.line}</span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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

/** The conversion, said once and big (owner, 9 Nov 2026): old policies in grey, new ones in blue. */
export function MoveCount({ count, newCount }: { count: number; newCount: number }) {
  return (
    <div className="bmgc" aria-label={`${count} old policies become ${newCount} new policies`}>
      <span className="bmgc__tile is-old">
        <b>{count}</b>
        <i>Old {count === 1 ? 'policy' : 'policies'}</i>
      </span>
      <span className="bmgc__to" aria-hidden>
        <ArrowRight size={18} strokeWidth={2.2} />
      </span>
      <span className="bmgc__tile is-new">
        <b>{newCount}</b>
        <i>New {newCount === 1 ? 'policy' : 'policies'}</i>
      </span>
    </div>
  )
}
