import { Fragment, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, BadgeCheck, Ban, CircleUser, FilePenLine, History, KeyRound, Laptop, Link2, MapPin, Smartphone, Users, Zap, type LucideIcon } from 'lucide-react'
import { AppLogo } from '../logos/AppLogo'

/* -----------------------------------------------------------------------------
   The guide's drawings, one thing at a time (owner, 10 Nov 2026: "show one thing at a time, take space, rethink").
   Redrawn the same day ("looks bad, add real logos and icons, make it simple, before and after"): every picture names
   the application with its real logo, says each method with its icon, and puts the old console and the Policy builder
   side by side, labelled Before and After. The words under a picture are a title and one line.
   -------------------------------------------------------------------------- */

type Step = { title: string; body: ReactNode; picture: ReactNode }

function Walkthrough({ label, steps }: { label: string; steps: Step[] }) {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion() === true
  const step = steps[i]
  return (
    <section className="mgw" aria-label={label}>
      <div className="mgw__stage" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={i}
            className="mgw__pic"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {step.picture}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mgw__words">
        <span className="mgw__count">
          Step {i + 1} of {steps.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
      <div className="mgw__nav">
        <button type="button" className="mgw__btn" onClick={() => setI(i - 1)} disabled={i === 0}>
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          Back
        </button>
        <span className="mgw__dots" role="group" aria-label="Steps">
          {steps.map((s, k) => (
            <button key={s.title} type="button" className={k === i ? 'is-on' : ''} aria-label={`Step ${k + 1}: ${s.title}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
              <span />
            </button>
          ))}
        </span>
        <button type="button" className="mgw__btn" onClick={() => setI(i + 1)} disabled={i === steps.length - 1}>
          Next
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </section>
  )
}

/* --- Pieces ----------------------------------------------------------------------------------------- */

const lit = (on: boolean) => (on ? ' is-lit' : '')

/** An application, by its real logo and name. */
function App({ id, name }: { id: string; name: string }) {
  return (
    <span className="mgw__app">
      <AppLogo appId={id} name={name} size={22} />
      {name}
    </span>
  )
}

const SALESFORCE = <App id="salesforce" name="Salesforce" />

type Method = 'password' | 'otp' | 'deny'
const METHOD: Record<Method, { label: string; Icon: LucideIcon }> = {
  password: { label: 'Password', Icon: KeyRound },
  otp: { label: 'OTP', Icon: Smartphone },
  deny: { label: 'Deny', Icon: Ban },
}

/** How someone signs in, each method as its icon and word. */
function Methods({ of }: { of: Method[] }) {
  return (
    <span className="mgw__methods">
      {of.map((m) => {
        const { label, Icon } = METHOD[m]
        return (
          <span key={m} className="mgw__chip">
            <Icon size={12} strokeWidth={2} aria-hidden />
            {label}
          </span>
        )
      })}
    </span>
  )
}

function OldRow({ a, b, on = false }: { a: ReactNode; b: ReactNode; on?: boolean }) {
  return (
    <div className={`mgw__orow${lit(on)}`}>
      <span>{a}</span>
      <i>{b}</i>
    </div>
  )
}

const Group = ({ name }: { name: string }) => (
  <>
    <Users size={13} strokeWidth={2} aria-hidden /> {name}
  </>
)

/** One old console page, as a card: its name, the application it is shown for, and the rows under it. */
function OldCard({ title, app, children, dim = false }: { title: string; app?: ReactNode; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`mgw__card${dim ? ' is-dim' : ''}`}>
      <div className="mgw__cardhead">
        <b>{title}</b>
        {app}
      </div>
      {children}
    </div>
  )
}

type Chip = { label: string; icon?: ReactNode; on?: boolean }

function Rule({ n, who, chips = [], then, on = false, last = false, past = false }: { n?: number; who: string; chips?: Chip[]; then: ReactNode; on?: boolean; last?: boolean; past?: boolean }) {
  return (
    <div className={`mgw__rule${lit(on)}${last ? ' is-last' : ''}${past ? ' is-past' : ''}`}>
      <span className="mgw__rn">{last ? '' : n}</span>
      <span className="mgw__who">
        <Users size={13} strokeWidth={2} aria-hidden />
        {who}
      </span>
      <span className="mgw__chips">
        {chips.map((c) => (
          <span key={c.label} className={`mgw__chip${c.on ? ' is-lit' : ''}`}>
            {c.icon}
            {c.label}
          </span>
        ))}
      </span>
      <span className="mgw__then">{then}</span>
    </div>
  )
}

function Sheet({ title, app, pill, children, on = false }: { title: string; app?: ReactNode; pill?: { label: string; tone: 'draft' | 'approved' | 'active' }; children: ReactNode; on?: boolean }) {
  return (
    <div className={`mgw__sheet${lit(on)}`}>
      <div className="mgw__cardhead">
        <b>{app ?? title}</b>
        {pill && <span className={`mgw__pill is-${pill.tone}`}>{pill.label}</span>}
      </div>
      {children}
    </div>
  )
}

const Between = ({ label }: { label: string }) => (
  <div className="mgw__between" aria-hidden>
    <ArrowRight size={18} strokeWidth={1.75} />
    <span>{label}</span>
  </div>
)

/** One side of a before and after pair. */
const Side = ({ kind, children }: { kind: 'before' | 'after'; children: ReactNode }) => (
  <div className={kind === 'before' ? 'mgw__before' : 'mgw__after'}>
    <span className={`mgw__tag${kind === 'after' ? ' is-new' : ''}`}>{kind === 'before' ? 'Before · old console' : 'After · Policy builder'}</span>
    {children}
  </div>
)

const OFFICE: Chip = { label: 'Office network', icon: <MapPin size={12} strokeWidth={2} aria-hidden /> }
const DEVICES: Chip = { label: 'Up to 2 devices', icon: <Laptop size={12} strokeWidth={2} aria-hidden /> }

const APPS = [
  { id: 'salesforce', name: 'Salesforce' },
  { id: 'workday', name: 'Workday' },
  { id: 'slack', name: 'Slack' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'github', name: 'GitHub' },
  { id: 'jira', name: 'Jira' },
]

/* --- 1. The migration, step by step ------------------------------------------------------------------ */

const STAGES: { label: string; Icon: LucideIcon }[] = [
  { label: 'Old policies', Icon: History },
  { label: 'Draft', Icon: FilePenLine },
  { label: 'Approved', Icon: BadgeCheck },
  { label: 'Active', Icon: Zap },
]

/** The life of a migrated policy: where it is now is lit, what is behind it is done. */
function Flow({ at, note }: { at: number; note: string }) {
  return (
    <div className="mgw__single is-wide">
      <div className="mgw__flow">
        {STAGES.map(({ label, Icon }, k) => (
          <Fragment key={label}>
            {k > 0 && <ArrowRight className="mgw__flowarrow" size={16} strokeWidth={1.75} aria-hidden />}
            <div className={`mgw__node${k === at ? ' is-now' : k < at ? ' is-done' : ''}`}>
              <span className="mgw__nodeicon">
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <b>{label}</b>
              <span className="mgw__logos">
                {APPS.slice(0, 3).map((a) => (
                  <AppLogo key={a.id} appId={a.id} name={a.name} size={20} />
                ))}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
      <p className="mgw__note">{note}</p>
    </div>
  )
}

export function ProcessWalk() {
  return (
    <Walkthrough
      label="The migration, step by step"
      steps={[
        {
          title: 'Migrate: each application gets a draft',
          body: 'Your old policies are rebuilt as one draft policy for each application. A draft decides nothing.',
          picture: <Flow at={1} note="Sign-ins carry on as they do today." />,
        },
        {
          title: 'Review: check the draft against the old policy',
          body: 'The old policy sits beside the draft. Change what is not right, then approve it.',
          picture: <Flow at={2} note="You approve each draft, or publish all." />,
        },
        {
          title: 'Publish: the policy goes live',
          body: 'It starts deciding sign-ins. The old policies stay readable, and nothing is deleted.',
          picture: <Flow at={3} note="The old policies stay in Old policies." />,
        },
      ]}
    />
  )
}

/* --- 2. How the old policies work -------------------------------------------------------------------- */

export function OldWalk() {
  const appLogin = (on: boolean) => (
    <OldCard title="App Login" app={SALESFORCE}>
      <OldRow a={<Group name="Sales" />} b={<Methods of={['password', 'otp']} />} on={on} />
      <OldRow a={<Group name="Contractors" />} b={<Methods of={['password']} />} on={on} />
      <OldRow a={<Group name="Default group" />} b={<Methods of={['password']} />} on={on} />
    </OldCard>
  )
  const adaptive = (
    <OldCard title="Adaptive Access" app={SALESFORCE}>
      <OldRow a={<><MapPin size={13} strokeWidth={2} aria-hidden /> IP range</>} b="Office network" on />
      <OldRow a={<><Laptop size={13} strokeWidth={2} aria-hidden /> Devices</>} b="Up to 2" on />
    </OldCard>
  )
  return (
    <Walkthrough
      label="How the old policies work"
      steps={[
        {
          title: 'App Login: how each group signs in',
          body: 'One row for each group. The default group covers everyone who is not listed.',
          picture: <div className="mgw__single">{appLogin(true)}</div>,
        },
        {
          title: 'Adaptive Access: a second page for conditions',
          body: 'Network and device checks are a separate policy, attached to a row of App Login.',
          picture: (
            <div className="mgw__row">
              {appLogin(false)}
              <div className="mgw__between" aria-hidden>
                <Link2 size={18} strokeWidth={1.75} />
                <span>Attached</span>
              </div>
              {adaptive}
            </div>
          ),
        },
        {
          title: 'The same again for every application',
          body: 'Each one keeps its own copy of the same checks. Changing an IP range means editing them all.',
          picture: (
            <div className="mgw__grid">
              {APPS.map((a) => (
                <div className="mgw__tile" key={a.id}>
                  <App id={a.id} name={a.name} />
                  <span className="mgw__chip">
                    <MapPin size={12} strokeWidth={2} aria-hidden />
                    IP range copy
                  </span>
                </div>
              ))}
            </div>
          ),
        },
      ]}
    />
  )
}

/* --- 3. What the Policy builder changes -------------------------------------------------------------- */

export function NewWalk() {
  const rules = (on = false, past = false) => (
    <>
      <Rule n={1} who="Sales" chips={[OFFICE, DEVICES]} then={<Methods of={['password', 'otp']} />} on={on} />
      <Rule n={2} who="Contractors" then={<Methods of={['password']} />} past={past} />
      <Rule who="Everyone else" then={<Methods of={['password']} />} last past={past} />
    </>
  )
  return (
    <Walkthrough
      label="What the Policy builder changes"
      steps={[
        {
          title: 'One policy for each application',
          body: 'Everything that decides a sign-in lives in one place, not on two pages.',
          picture: (
            <div className="mgw__row is-convert">
              <Side kind="before">
                <OldCard title="App Login" app={SALESFORCE}>
                  <OldRow a="Group rows" b="" />
                </OldCard>
                <OldCard title="Adaptive Access" app={SALESFORCE}>
                  <OldRow a="Checks" b="" />
                </OldCard>
              </Side>
              <Between label="Becomes" />
              <Side kind="after">
                <Sheet title="Salesforce sign-in" app={SALESFORCE} pill={{ label: 'Draft', tone: 'draft' }} on>
                  <div className="mgw__empty">One policy, made of rules</div>
                </Sheet>
              </Side>
            </div>
          ),
        },
        {
          title: 'A policy is a list of rules',
          body: 'Each rule says who it is for, what must be true, and how they sign in.',
          picture: (
            <div className="mgw__single">
              <Sheet title="Salesforce sign-in" app={SALESFORCE} pill={{ label: 'Draft', tone: 'draft' }}>
                {rules(true)}
              </Sheet>
            </div>
          ),
        },
        {
          title: 'Rules are read from the top',
          body: 'The first rule that matches decides. The rest are not read.',
          picture: (
            <div className="mgw__single">
              <div className="mgw__who-signs">
                <CircleUser size={22} strokeWidth={1.75} aria-hidden />
                <span>
                  <b>Priya</b> · Sales · office network · known device
                </span>
              </div>
              <Sheet title="Salesforce sign-in" app={SALESFORCE} pill={{ label: 'Active', tone: 'active' }}>
                {rules(true, true)}
              </Sheet>
            </div>
          ),
        },
        {
          title: 'Zones and device profiles are made once',
          body: 'Pick them into any rule. Change one, and every rule that uses it follows.',
          picture: (
            <div className="mgw__row">
              <div className="mgw__lib">
                <b>Library</b>
                <span className="mgw__libitem">
                  <MapPin size={14} strokeWidth={2} aria-hidden />
                  Office network
                  <i>Zone</i>
                </span>
                <span className="mgw__libitem">
                  <Laptop size={14} strokeWidth={2} aria-hidden />
                  Up to 2 devices
                  <i>Device profile</i>
                </span>
              </div>
              <Between label="Picked into" />
              <div className="mgw__after">
                {['salesforce', 'workday'].map((id, k) => (
                  <Sheet key={id} title="" app={<App id={id} name={k ? 'Workday' : 'Salesforce'} />}>
                    <Rule n={1} who={k ? 'Finance' : 'Sales'} chips={k ? [{ ...OFFICE, on: true }] : [{ ...OFFICE, on: true }, { ...DEVICES, on: true }]} then={<Methods of={['password', 'otp']} />} />
                  </Sheet>
                ))}
              </div>
            </div>
          ),
        },
      ]}
    />
  )
}

/* --- 4. Before and after, piece by piece ------------------------------------------------------------- */

export function ConvertWalk() {
  /* Which piece is lit, on each side, at each step. */
  const picture = (s: number) => (
    <div className="mgw__row is-convert">
      <Side kind="before">
        <OldCard title="App Login" app={SALESFORCE}>
          <OldRow a={<Group name="Sales" />} b={<Methods of={['password', 'otp']} />} on={s === 0 || s === 3} />
          <OldRow a={<Group name="Contractors" />} b={<Methods of={['password']} />} on={s === 0 || s === 3} />
          <OldRow a={<Group name="Default group" />} b={<Methods of={['password']} />} on={s === 3 || s === 4} />
        </OldCard>
        <OldCard title="Adaptive Access" app={SALESFORCE}>
          <OldRow a={<><MapPin size={13} strokeWidth={2} aria-hidden /> IP range</>} b="Office network" on={s === 1 || s === 4} />
          <OldRow a={<><Laptop size={13} strokeWidth={2} aria-hidden /> Devices</>} b="Up to 2" on={s === 2 || s === 4} />
        </OldCard>
      </Side>
      <Between label="Migrated" />
      <Side kind="after">
        <Sheet title="Salesforce sign-in" app={SALESFORCE} pill={{ label: 'Draft', tone: 'draft' }}>
          <Rule n={1} who="Sales" chips={[{ ...OFFICE, on: s === 1 || s === 4 }, { ...DEVICES, on: s === 2 || s === 4 }]} then={<Methods of={['password', 'otp']} />} on={s === 0 || s === 3} />
          <Rule n={2} who="Contractors" then={<Methods of={['password']} />} on={s === 0 || s === 3} />
          <Rule who="Everyone else" then={<Methods of={['password']} />} last on={s === 3 || s === 4} />
        </Sheet>
      </Side>
    </div>
  )
  return (
    <Walkthrough
      label="Before and after, piece by piece"
      steps={[
        {
          title: 'A group row becomes a rule',
          body: 'The group is who the rule is for. The sign-in methods stay as they were, in the same order.',
          picture: picture(0),
        },
        {
          title: 'A network check becomes a condition',
          body: 'The IP range moves onto the rule it was attached to. The zone is kept in your library.',
          picture: picture(1),
        },
        {
          title: 'A device limit becomes a device profile',
          body: 'Any other rule can pick the same profile, so it is made once.',
          picture: picture(2),
        },
        {
          title: 'The default group becomes the last rule',
          body: 'Everyone who is not listed is caught by Everyone else.',
          picture: picture(3),
        },
        {
          title: 'Several old policies become one',
          body: 'This is the draft you review, approve and publish.',
          picture: picture(4),
        },
      ]}
    />
  )
}
