import { useReducedMotion } from 'motion/react'
import { AppWindow, ArrowRight, Check, ListChecks, ScanSearch, ShieldCheck, Shapes } from 'lucide-react'
import { PageHead } from '../Shell'
import { Button } from '../kit'
import { useBrand } from '../store'
import { IntroWidget } from './intro-widgets'
import './intro.css'
import { useSetupSteps } from './setup-steps'
import './move-policies.css'
import './move-done.css'
import './home-hub.css'

/* -----------------------------------------------------------------------------
   The Dashboard: where an admin lands, so where the Policy builder is introduced first
   (owner, 4 Nov 2026: "a new place where the user comes first and can see a card").

   One hub card at the top, the shape the references share (Stripe's home, Deputy's
   landing, Claude's feature card): a picture made of the product, a New tag, one
   heading, three plain facts and the way in.
   · Before the move: Start migration (it plays the intro) and See what's new.
   · After it: the same slot carries the move's next steps (Vercel's checklist card).
   · Once every step is taken, the card goes.
   Under it, the places an admin opens most.
   -------------------------------------------------------------------------- */

export function HomeHub() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const setup = useSetupSteps()
  const unmoved = store.legacy.policies.some((lp) => !store.movedLegacy[lp.id])
  const reviewing = Object.values(store.moved).some((m) => !m.approved) || store.moveJob?.status === 'running'

  return (
    <div className="bpage bhome">
      <PageHead title="Dashboard" caption="Your tenant, and what is new in it." />

      {setup.any && setup.next && !reviewing ? (
        <section className="bhub bhub--steps" aria-label="Finish moving to the new builder">
          <div className="bhub__text">
            <span className="bhub__new">Policy builder</span>
            <h2>Finish moving to the new builder</h2>
            <p>
              {setup.done} of {setup.steps.length} steps done. Next: {setup.next.title.toLowerCase()}.
            </p>
            <span className="bmv__progress" aria-hidden>
              <span style={{ width: `${(setup.done / setup.steps.length) * 100}%` }} />
            </span>
            <div className="bhub__actions">
              <Button variant="brand" iconRight={ArrowRight} onClick={() => setup.take(setup.next!)}>
                {setup.next.action}
              </Button>
              <Button variant="ghost" onClick={() => store.go({ name: 'move-policies' })}>
                See all steps
              </Button>
            </div>
          </div>
          <ol className="bhub__steps">
            {setup.steps.map((s) => {
              const isDone = store.setupDone.includes(s.id)
              return (
                <li key={s.id} className={isDone ? 'is-done' : s === setup.next ? 'is-next' : ''}>
                  <span className="bhub__tick" aria-hidden>
                    {isDone ? <Check size={12} strokeWidth={2.8} /> : <s.icon size={13} strokeWidth={2} />}
                  </span>
                  {s.title}
                </li>
              )
            })}
          </ol>
        </section>
      ) : unmoved || reviewing ? (
        <section className="bhub" aria-label="The new Policy builder">
          <div className="bhub__text">
            <span className="bhub__new">New</span>
            <h2>The new Policy builder</h2>
            <p>App Login and Adaptive Access policies become one policy per application, with rules you can test before they decide.</p>
            <ul className="bhub__facts">
              <li>
                <Shapes size={16} strokeWidth={1.9} aria-hidden />
                Zones, device profiles and risk signals, built once and used in any rule
              </li>
              <li>
                <ScanSearch size={16} strokeWidth={1.9} aria-hidden />
                Check access shows who gets in, before a policy is on
              </li>
              <li>
                <ShieldCheck size={16} strokeWidth={1.9} aria-hidden />
                Moved policies arrive as drafts, so nothing changes until you make them active
              </li>
            </ul>
            <div className="bhub__actions">
              {reviewing ? (
                <Button variant="brand" iconRight={ArrowRight} onClick={() => store.go({ name: 'move-policies' })}>
                  Continue migration
                </Button>
              ) : (
                <Button variant="brand" iconRight={ArrowRight} onClick={() => store.openIntro('migrate')}>
                  Start migration
                </Button>
              )}
              <Button variant="secondary" onClick={() => store.openIntro('learn')}>
                See what’s new
              </Button>
            </div>
          </div>
          <div className="bhub__art bin" aria-hidden>
            <div className="bin__stage">
              <IntroWidget id="merge" reduce={reduce} />
            </div>
          </div>
        </section>
      ) : null}

      <section aria-label="Shortcuts">
        <h3 className="bmv__lanehead">Go to</h3>
        <ul className="bmd__places">
          <Shortcut icon={AppWindow} name="Applications" line="Connect apps and give each its sign-in policy" onOpen={() => store.go({ name: 'applications' })} />
          <Shortcut icon={ShieldCheck} name="Policies" line="Who signs in to what, and how" onOpen={() => store.go({ name: 'policies' })} />
          <Shortcut icon={ScanSearch} name="Access checks" line="Test a sign-in against your policies" onOpen={() => store.go({ name: 'sign-in-tests' })} />
          <Shortcut icon={ListChecks} name="Sign-in activity" line="Recent sign-ins and what decided them" onOpen={() => store.go({ name: 'sign-in-activity' })} />
        </ul>
      </section>
    </div>
  )
}

function Shortcut({ icon: Icon, name, line, onOpen }: { icon: typeof Check; name: string; line: string; onOpen: () => void }) {
  return (
    <li className="bmd__place">
      <span className="bmd__placeicon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <b>{name}</b>
      <span className="bmd__placeline">{line}</span>
      <button type="button" className="bmd__open" onClick={onOpen}>
        Open {name}
        <ArrowRight size={14} strokeWidth={2} aria-hidden />
      </button>
    </li>
  )
}
