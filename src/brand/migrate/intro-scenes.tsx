import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, Globe, Laptop, Lock, MapPin, Play, ShieldCheck, User, Users, type LucideIcon } from 'lucide-react'
import { AppTile } from './parts'
import './intro-scenes.css'

/* -----------------------------------------------------------------------------
   The intro's pictures, second try (owner, 10 Nov 2026: "the SVGs and the user flows are horrible … simpler … premium,
   and the user can understand what is actually happening").

   One look for every slide: the policy as the console draws it, a white sheet with the application's logo and its rules,
   each rule one line (who, its conditions as chips, the outcome). No flowchart connectors, no Yes/No branches, no
   outcomes floating outside the rules. Each picture is a short story of two to four beats that plays, holds, and loops:
   · One policy:   App Login and Adaptive Access, two pages, become one sheet.
   · Groups:       each row of the old App Login table lights and its rule appears.
   · Canvas:       a sign-in walks down the rules; the first that matches decides.
   · Zones/devices: a zone and a device profile, set up once, land as chips in a rule.
   · Check access: a user, an application, Check, the answer and the rule that gave it.
   Reduced motion shows the last beat, still.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const

/** The beat a scene is on: each lasts its own time, the last one holds, then it starts again. */
function useBeat(ms: number[], reduce: boolean): number {
  const [beat, setBeat] = useState(reduce ? ms.length - 1 : 0)
  useEffect(() => {
    if (reduce) {
      setBeat(ms.length - 1)
      return
    }
    const id = window.setTimeout(() => setBeat((b) => (b + 1) % ms.length), ms[beat])
    return () => window.clearTimeout(id)
  }, [beat, reduce, ms])
  return beat
}

/** Comes in with a small rise. */
function Rise({ show = true, reduce, delay = 0, children, className }: { show?: boolean; reduce: boolean; delay?: number; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className={className}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2 } }}
          transition={{ duration: reduce ? 0 : 0.45, ease: EASE, delay: reduce ? 0 : delay }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type Then = 'Allow' | 'MFA' | 'Deny'
const THEN_TONE: Record<Then, string> = { Allow: 'is-allow', MFA: 'is-mfa', Deny: 'is-deny' }

function Out({ then }: { then: Then }) {
  return <span className={`bsc__out ${THEN_TONE[then]}`}>{then}</span>
}

function Chip({ icon: Icon, children, tone = '' }: { icon?: LucideIcon; children: ReactNode; tone?: string }) {
  return (
    <span className={`bsc__chip ${tone}`}>
      {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  )
}

/** One rule, one line: its number, who, the conditions, the outcome. */
function Rule({ n, who, ifs, then, state = '', last = false }: { n?: number; who: string; ifs?: ReactNode; then: Then; state?: '' | 'is-on' | 'is-past'; last?: boolean }) {
  return (
    <div className={`bsc__rule ${state}${last ? ' is-last' : ''}`}>
      <span className="bsc__n">{last ? '' : n}</span>
      <span className="bsc__who">
        <Users size={13} strokeWidth={2} aria-hidden />
        {who}
      </span>
      <span className="bsc__ifs">{ifs}</span>
      <Out then={then} />
    </div>
  )
}

/** The policy, as the console's sheet: logo, name, status, then its rules. */
function Sheet({ app = 'salesforce', title = 'Salesforce sign-in', pill = 'Draft', children, lit = false }: { app?: string; title?: string; pill?: string; children: ReactNode; lit?: boolean }) {
  return (
    <div className={`bsc__sheet${lit ? ' is-lit' : ''}`}>
      <div className="bsc__head">
        <AppTile appId={app} size={22} />
        <b>{title}</b>
        <span className="bsc__pill">{pill}</span>
      </div>
      <div className="bsc__rules">{children}</div>
    </div>
  )
}

/** One of the old console's pages as the video's Today scene draws it (owner, 10 Nov 2026: "showcase the Today from
    the video"): a white card, the page's name, its rows as soft bars, the setting on the right. */
function OldPage({ title, rows, on = -1 }: { title: string; rows: [string, string][]; on?: number }) {
  return (
    <div className="bsc__today">
      <b>{title}</b>
      {rows.map(([a, b], k) => (
        <div key={a} className={`bsc__todayrow${k === on ? ' is-on' : ''}`}>
          <span>{a}</span>
          {b ? <i>{b}</i> : <i className="bsc__bar" aria-hidden />}
        </div>
      ))}
    </div>
  )
}

/** The application the pages are for, over them, and when: Today, or In the new builder. */
function AppHead({ when, now = false }: { when: string; now?: boolean }) {
  return (
    <div className="bsc__apphead">
      <span className={`bsc__when${now ? ' is-now' : ''}`}>{when}</span>
      <span className="bsc__appname">
        <AppTile appId="salesforce" size={20} />
        Salesforce
      </span>
    </div>
  )
}

/* --- What's changed: two pages become one policy --------------------------------------------------- */
const MERGE_MS = [2600, 4600]
export function SceneOnePolicy({ reduce }: { reduce: boolean }) {
  const beat = useBeat(MERGE_MS, reduce)
  return (
    <div className="bsc is-tall">
      <AnimatePresence mode="wait" initial={false}>
        {beat === 0 ? (
          <motion.div key="old" className="bsc__col" exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: 10 }} transition={{ duration: 0.35, ease: EASE }}>
            <AppHead when="Today" />
            <Rise reduce={reduce}>
              <OldPage title="App Login" rows={[['Sales', 'Password, then OTP'], ['Contractors', 'Password, then Push']]} />
            </Rise>
            <Rise reduce={reduce} delay={0.3}>
              <OldPage title="Adaptive Access" rows={[['IP range', 'Office network'], ['Device', 'Known devices']]} />
            </Rise>
          </motion.div>
        ) : (
          <motion.div key="new" className="bsc__col" initial={reduce ? false : { opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            <AppHead when="In the new builder" now />
            <Sheet lit>
              <Rule n={1} who="Sales" ifs={<Chip icon={MapPin}>Office network</Chip>} then="MFA" />
              <Rule n={2} who="Contractors" ifs={<Chip icon={Laptop}>Known devices</Chip>} then="MFA" />
              <Rule who="Everyone else" then="Deny" last />
            </Sheet>
            <Rise reduce={reduce} delay={0.4} className="bsc__note">
              <Lock size={12} strokeWidth={2} aria-hidden /> App Login
              <span>+</span>
              <Globe size={12} strokeWidth={2} aria-hidden /> Adaptive Access, in one policy
            </Rise>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- What's changed: each group becomes a rule ----------------------------------------------------- */
const GROUPS: { g: string; how: string; then: Then }[] = [
  { g: 'Sales', how: 'Password, then OTP', then: 'MFA' },
  { g: 'Contractors', how: 'Password only', then: 'Allow' },
]
const GROUP_MS = [1100, 1900, 1900, 3600]
export function SceneGroups({ reduce }: { reduce: boolean }) {
  const beat = useBeat(GROUP_MS, reduce)
  return (
    <div className="bsc is-tall">
      <AppHead when="Today" />
      <OldPage title="App Login" rows={GROUPS.map((g) => [g.g, ''])} on={beat - 1} />
      <span className="bsc__down" aria-hidden>
        <ArrowDown size={16} strokeWidth={2} />
      </span>
      <Sheet>
        {GROUPS.map((r, k) => (
          <Rise key={r.g} reduce={reduce} show={beat >= k + 1}>
            <Rule n={k + 1} who={r.g} ifs={<i className="bsc__bar" aria-hidden />} then={r.then} state={beat === k + 1 ? 'is-on' : ''} />
          </Rise>
        ))}
        <Rise reduce={reduce} show={beat >= 3}>
          <Rule who="Everyone else" then="Deny" last />
        </Rise>
      </Sheet>
    </div>
  )
}

/* --- What's new: the canvas reads from the top ----------------------------------------------------- */
const READ_MS = [1200, 900, 900, 3400]
export function SceneCanvas({ reduce }: { reduce: boolean }) {
  const beat = useBeat(READ_MS, reduce)
  const rules: { who: string; ifs?: ReactNode; then: Then }[] = [
    { who: 'Admins', ifs: <Chip icon={MapPin}>Office network</Chip>, then: 'Allow' },
    { who: 'Contractors', then: 'Deny' },
    { who: 'Sales', ifs: <Chip icon={Laptop}>Known devices</Chip>, then: 'MFA' },
  ]
  /* Beat 1 reads rule 1, beat 2 rule 2, beat 3 stops on rule 3: Priya is in Sales. */
  const at = beat === 0 ? -1 : beat - 1
  return (
    <div className="bsc is-tall">
      <div className="bsc__signin">
        <span className="bsc__avatar" aria-hidden>
          <User size={13} strokeWidth={2} />
        </span>
        <b>Priya</b>
        <i>Sales · signs in to Salesforce</i>
      </div>
      <span className="bsc__down" aria-hidden>
        <ArrowDown size={16} strokeWidth={2} />
      </span>
      <Sheet>
        {rules.map((r, k) => (
          <Rule key={r.who} n={k + 1} who={r.who} ifs={r.ifs} then={r.then} state={k === at && k === 2 ? 'is-on' : k < at || (k === at && k < 2) ? 'is-past' : ''} />
        ))}
        <Rule who="Everyone else" then="Deny" last state={at >= 2 ? 'is-past' : ''} />
      </Sheet>
      <Rise reduce={reduce} show={beat === 3} className="bsc__verdict">
        <ShieldCheck size={14} strokeWidth={2} aria-hidden />
        Rule 3 decides: MFA
      </Rise>
    </div>
  )
}

/* --- What's new: zones and device profiles, set up once, used in rules ---------------------------- */
const PARTS_MS = [1500, 1200, 3800]
export function SceneParts({ reduce }: { reduce: boolean }) {
  const beat = useBeat(PARTS_MS, reduce)
  return (
    <div className="bsc is-tall">
      <div className="bsc__pair">
        <div className={`bsc__part${beat === 2 ? ' is-used' : ''}`}>
          <span className="bsc__parthead">
            <span className="bsc__ico">
              <MapPin size={14} strokeWidth={2} />
            </span>
            <b>Office network</b>
          </span>
          <i>Zone</i>
          <span className="bsc__facts">
            <span>10.20.0.0/16</span>
            <span>Bengaluru</span>
          </span>
        </div>
        <div className={`bsc__part${beat === 2 ? ' is-used' : ''}`}>
          <span className="bsc__parthead">
            <span className="bsc__ico">
              <Laptop size={14} strokeWidth={2} />
            </span>
            <b>Known devices</b>
          </span>
          <i>Device profile</i>
          <span className="bsc__facts">
            <span>Windows 11 or newer</span>
            <span>Disk encrypted</span>
          </span>
        </div>
      </div>
      <span className="bsc__down" aria-hidden>
        <ArrowDown size={16} strokeWidth={2} />
      </span>
      <Rise reduce={reduce} show={beat >= 1}>
        <Sheet>
          <Rule
            n={1}
            who="Sales"
            state={beat === 2 ? 'is-on' : ''}
            ifs={
              <>
                <Rise reduce={reduce} show={beat >= 2} className="bsc__slot">
                  <Chip icon={MapPin} tone="is-new">
                    Office network
                  </Chip>
                </Rise>
                <Rise reduce={reduce} show={beat >= 2} delay={0.2} className="bsc__slot">
                  <Chip icon={Laptop} tone="is-new">
                    Known devices
                  </Chip>
                </Rise>
              </>
            }
            then="Allow"
          />
          <Rule who="Everyone else" then="MFA" last />
        </Sheet>
      </Rise>
    </div>
  )
}

/* --- What's new: Check access ---------------------------------------------------------------------- */
const CHECK_MS = [900, 900, 900, 3600]
export function SceneCheck({ reduce }: { reduce: boolean }) {
  const beat = useBeat(CHECK_MS, reduce)
  return (
    <div className="bsc is-narrow">
      <div className="bsc__form">
        <span className="bsc__formhead">
          <ShieldCheck size={14} strokeWidth={2} aria-hidden />
          Check access
        </span>
        <span className="bsc__field">
          <i>User</i>
          <span className={beat >= 1 ? 'is-set' : ''}>
            {beat >= 1 ? (
              <>
                <span className="bsc__avatar" aria-hidden>
                  <User size={12} strokeWidth={2} />
                </span>
                Priya Nair
              </>
            ) : (
              'Pick a user'
            )}
          </span>
        </span>
        <span className="bsc__field">
          <i>Application</i>
          <span className={beat >= 2 ? 'is-set' : ''}>
            {beat >= 2 ? (
              <>
                <AppTile appId="salesforce" size={16} />
                Salesforce
              </>
            ) : (
              'Pick an application'
            )}
          </span>
        </span>
        <span className={`bsc__run${beat === 2 ? ' is-ready' : ''}`}>
          <Play size={12} strokeWidth={2.4} aria-hidden />
          Check access
        </span>
      </div>
      <Rise reduce={reduce} show={beat === 3} className="bsc__result">
        <span className="bsc__resulthead">
          <b>Asked for a second factor</b>
          <Out then="MFA" />
        </span>
        <i>Rule 3, Sales · Salesforce sign-in</i>
      </Rise>
    </div>
  )
}

/* --- The consent: a one-way move (owner, 10 Nov 2026: "let the user know that they cannot reverse the process") --------
   The old pages on the left, the new builder on the right. A policy crosses over along the arrow; then the way back is
   tried, runs into a barrier and stops. Loops; reduced motion shows the barrier, still. */
const ONEWAY_MS = [800, 1700, 1500, 2600]
export function SceneOneWay({ reduce }: { reduce: boolean }) {
  const beat = useBeat(ONEWAY_MS, reduce)
  const draw = (on: boolean, to = 1) => ({ initial: false as const, animate: { pathLength: on ? to : 0, opacity: on ? 1 : 0 }, transition: { duration: reduce ? 0 : 0.7, ease: EASE } })
  return (
    <div className="bsc is-oneway">
      <div className={`bsc__end is-old${beat >= 2 ? ' is-faded' : ''}`}>
        <span className="bsc__ico is-quiet">
          <Lock size={14} strokeWidth={2} />
        </span>
        <b>Old pages</b>
        <i>App Login, Adaptive Access</i>
      </div>
      <svg className="bsc__way" viewBox="0 0 100 120" aria-hidden>
        {/* Forward: the migration. */}
        <motion.path className="bsc__fwd" d="M6 40 H88" {...draw(beat >= 1)} />
        <motion.path className="bsc__fwd" d="M82 34 L90 40 L82 46" {...draw(beat >= 1)} />
        <motion.circle className="bsc__token" r="5" cy="40" initial={false} animate={{ cx: beat === 1 ? [6, 88] : beat > 1 ? 88 : 6, opacity: beat === 1 ? [0, 1, 1, 0] : 0 }} transition={{ duration: reduce ? 0 : 1.2, ease: EASE }} />
        {/* Back: tried, and stopped at the barrier. */}
        <motion.path className="bsc__back" d="M94 84 H52" {...draw(beat >= 2)} />
        <motion.g initial={false} animate={{ opacity: beat >= 2 ? 1 : 0, scale: beat >= 2 ? 1 : 0.6 }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE, delay: reduce ? 0 : 0.55 }} style={{ transformOrigin: '44px 84px', transformBox: 'view-box' }}>
          <rect className="bsc__bar" x="40" y="70" width="8" height="28" rx="3" />
          <path className="bsc__x" d="M20 78 L32 90 M32 78 L20 90" />
        </motion.g>
      </svg>
      <div className={`bsc__end is-new${beat >= 1 ? ' is-lit' : ''}`}>
        <span className="bsc__ico">
          <ShieldCheck size={14} strokeWidth={2} />
        </span>
        <b>New builder</b>
        <i>Your policies, as drafts</i>
      </div>
      <Rise reduce={reduce} show={beat >= 3} className="bsc__oneline">
        One way: the old pages do not come back
      </Rise>
    </div>
  )
}
