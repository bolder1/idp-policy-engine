import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, Compass, Globe, MonitorSmartphone, ScanSearch, ShieldCheck } from 'lucide-react'
import { Button } from '../kit'
import { useBrand } from '../store'
import { useSetupSteps } from './setup-steps'

/* -----------------------------------------------------------------------------
   Done: after the move (owner, 4 Nov 2026: "guided setup, prioritised based on need").

   What to do next, as a checklist in the order THIS tenant needs it: a protection the
   old console had and the new one does not get back first (the device count), then
   checking access before anything decides, then the pieces the move made, last turning
   the policies on. Each step opens the place it names and is ticked when taken. Below
   it, where everything is now, one card a place; and a tour of those places.
   -------------------------------------------------------------------------- */

export function DoneStage({ onPreview }: { onPreview?: () => void }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const { steps, done, next, take, drafts, zones } = useSetupSteps()

  return (
    <div className="bmd">
      <header className="bmd__head">
        <span className="bmd__mark" aria-hidden>
          <ShieldCheck size={22} strokeWidth={1.9} />
        </span>
        <div className="bmd__title">
          <h2>Your policies are in the new builder</h2>
          <p>They are drafts: nothing decides until you turn each on. Here is what to do next, most needed first.</p>
        </div>
        <span className="bmv__spacer" />
        {onPreview && (
          <Button variant="ghost" onClick={onPreview}>
            Move more policies
          </Button>
        )}
        <Button variant="secondary" icon={Compass} onClick={() => store.setMoveTour(true)}>
          Take the tour
        </Button>
      </header>

      <section className="bmd__list" aria-label="Next steps">
        <div className="bmd__listhead">
          <h3 className="bmv__lanehead">Next steps</h3>
          <span className="bmd__progress">
            {done} of {steps.length} done
          </span>
          <span className="bmv__progress" aria-hidden>
            <motion.span initial={false} animate={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
        </div>
        <ol className="blist bmd__steps">
          {steps.map((s, n) => {
            const isDone = store.setupDone.includes(s.id)
            const isNext = s === next
            return (
              <motion.li
                key={s.id}
                className={`bmd__step${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : n * 0.06, duration: 0.24 }}
              >
                <span className="bmd__tick" aria-hidden>
                  {isDone ? <Check size={14} strokeWidth={2.6} /> : n + 1}
                </span>
                <span className="bmd__steptext">
                  <b>
                    {s.title}
                    {s.gap && !isDone && <span className="bmd__gap">Gap</span>}
                  </b>
                  <span>{s.line}</span>
                </span>
                {/* The next one is the page's orange; the rest are quiet. */}
                <Button variant={isNext ? 'brand' : 'secondary'} size="sm" iconRight={isNext ? ArrowRight : undefined} onClick={() => take(s)}>
                  {isDone ? 'Open again' : s.action}
                </Button>
              </motion.li>
            )
          })}
        </ol>
      </section>

      <section aria-label="Where everything is">
        <h3 className="bmv__lanehead">Where everything is now</h3>
        <ul className="bmd__places">
          <Place icon={ShieldCheck} name="Policies" line={drafts === 1 ? '1 moved policy, in draft' : `${drafts} moved policies, in draft`} onOpen={() => store.go({ name: 'policies' })} />
          <Place icon={Globe} name="Zones" line={zones === 1 ? '1 zone from your old checks' : `${zones} zones from your old checks`} onOpen={() => store.go({ name: 'zones' })} />
          <Place icon={MonitorSmartphone} name="Device profiles" line="New: check the device in any rule" isNew onOpen={() => store.go({ name: 'fingerprint' })} />
          <Place icon={ScanSearch} name="Access checks" line="Test a sign-in before it decides" onOpen={() => store.go({ name: 'sign-in-tests' })} />
        </ul>
      </section>
    </div>
  )
}

function Place({ icon: Icon, name, line, isNew, onOpen }: { icon: typeof Check; name: string; line: string; isNew?: boolean; onOpen: () => void }) {
  return (
    <li className="bmd__place">
      <span className="bmd__placeicon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <b>
        {name}
        {isNew && <span className="bmd__new">New</span>}
      </b>
      <span className="bmd__placeline">{line}</span>
      <button type="button" className="bmd__open" onClick={onOpen}>
        Open {name}
        <ArrowRight size={14} strokeWidth={2} aria-hidden />
      </button>
    </li>
  )
}
