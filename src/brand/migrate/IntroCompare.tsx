import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Clock, Globe, KeyRound, Lock, MapPin, MonitorSmartphone, Network, ScanSearch, Users, X, type LucideIcon } from 'lucide-react'
import { Button } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { EASE_SCENE } from './intro-mood'
import './intro-compare.css'

/* -----------------------------------------------------------------------------
   The intro as a before and after (owner, 5 Nov 2026: "split into two parts, left
   side old policy, right side new policy ... less animation, little interactions,
   transitions from old to new so elements can move").

   Each chapter shows both at once: the old console on the left, quiet and grey; the
   new builder on the right. It opens on the old way; then the pieces that carry over
   move across, leaving their outline behind; then the new side completes. One move a
   chapter, nothing else animates. Hover a chapter's words to hold it.
   -------------------------------------------------------------------------- */

const ME = [0.22, 1, 0.36, 1] as const
const MOVE = { layout: { duration: 0.9, ease: ME } }
const BEATS = [2600, 2200, 3000] as const

interface Chapter {
  id: string
  short: string
  title: string
  line: string
  before: string
  after: string
}

const CHAPTERS: Chapter[] = [
  { id: 'one', short: 'One policy', title: 'One policy for each application', line: 'Two old pages become one policy.', before: 'App Login + Adaptive Access', after: 'One policy' },
  { id: 'parts', short: 'Zones and devices', title: 'Checks become parts you reuse', line: 'Networks and places become a zone; a device limit becomes a device profile.', before: 'Set inside each policy', after: 'Named once, used anywhere' },
  { id: 'rule', short: 'One rule', title: 'Everything about a case, in one rule', line: 'Who it is for, the conditions and the outcome, together.', before: 'Split across two pages', after: 'People, conditions, outcome' },
  { id: 'order', short: 'Order', title: 'Rules read from the top', line: 'No more weights to work out. The first rule that matches decides.', before: 'Highest weight wins', after: 'First match decides' },
  { id: 'check', short: 'Check access', title: 'Know the answer before it is live', line: 'Check a draft for any person and application.', before: 'Make it active, then watch', after: 'Check first, then make it active' },
]

/* One piece, the same element on either side, so it travels when it changes sides. */
function Piece({ id, icon: Icon, children, tone }: { id: string; icon?: LucideIcon; children: ReactNode; tone?: 'new' | 'deny' | 'ok' }) {
  return (
    <motion.span layoutId={id} className={`bcp__piece${tone ? ` is-${tone}` : ''}`} transition={MOVE}>
      {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden />}
      {children}
    </motion.span>
  )
}
/* Where a piece was: its outline, left behind. */
function Ghost({ children }: { children: ReactNode }) {
  return <span className="bcp__ghost">{children}</span>
}

function Before({ c, moved }: { c: string; moved: boolean }) {
  const p = (id: string, icon: LucideIcon | undefined, label: string) => (moved ? <Ghost key={id}>{label}</Ghost> : <Piece key={id} id={`${c}-${id}`} icon={icon}>{label}</Piece>)
  if (c === 'one')
    return (
      <>
        <span className="bcp__app">
          <AppLogo appId="salesforce" size={16} /> Salesforce
        </span>
        <div className="bcp__page">
          <b>
            <Lock size={12} strokeWidth={2.2} /> App Login Policy
          </b>
          <span className="bcp__rows">{[p('sales', Users, 'Sales · OTP'), p('fin', Users, 'Finance · Password')]}</span>
        </div>
        <div className="bcp__page">
          <b>
            <Globe size={12} strokeWidth={2.2} /> Adaptive Access Policy
          </b>
          <span className="bcp__rows">{[p('hours', Clock, 'Working hours'), p('india', MapPin, 'India only')]}</span>
        </div>
      </>
    )
  if (c === 'parts')
    return (
      <>
        {['Salesforce', 'Slack', 'Jira'].map((app, n) => (
          <div key={app} className="bcp__page">
            <b>
              <Globe size={12} strokeWidth={2.2} /> Adaptive Access · {app}
            </b>
            <span className="bcp__rows">
              {n === 0 ? [p('ip', Network, 'IP 203.0.113.0/24'), p('loc', MapPin, 'India'), p('dev', MonitorSmartphone, 'At most 2 devices')] : [<Ghost key="a">IP 203.0.113.0/24</Ghost>, <Ghost key="b">India</Ghost>, <Ghost key="c">At most 2 devices</Ghost>]}
            </span>
          </div>
        ))}
      </>
    )
  if (c === 'rule')
    return (
      <>
        <div className="bcp__page">
          <b>
            <Lock size={12} strokeWidth={2.2} /> App Login Policy
          </b>
          <span className="bcp__rows">{[p('who', Users, 'Sales'), p('then', KeyRound, 'OTP')]}</span>
        </div>
        <div className="bcp__page">
          <b>
            <Globe size={12} strokeWidth={2.2} /> Adaptive Access Policy
          </b>
          <span className="bcp__rows">{[p('zone', Network, 'IP and location'), p('dev', MonitorSmartphone, 'Device limit')]}</span>
        </div>
      </>
    )
  if (c === 'order')
    return (
      <div className="bcp__page">
        <b>Picked by policy weight</b>
        <span className="bcp__list">
          {[
            ['ct', 'Contractors', 'weight 30'],
            ['sa', 'Sales', 'weight 70'],
            ['ev', 'Everyone', 'weight 10'],
          ].map(([id, name, w]) => (moved ? <Ghost key={id}>{name}</Ghost> : <Piece key={id} id={`order-${id}`}>{name} <i className="bcp__weight">{w}</i></Piece>))}
        </span>
        <span className="bcp__note">The highest weight wins</span>
      </div>
    )
  return (
    <div className="bcp__page">
      <b>Live sign-ins, after it is on</b>
      <span className="bcp__list">
        <span className="bcp__log">
          <Users size={12} strokeWidth={2.2} /> Ravi · Jira <i className="is-ok">Allowed</i>
        </span>
        <span className="bcp__log">
          <Users size={12} strokeWidth={2.2} /> Asha · Slack <i className="is-ok">Allowed</i>
        </span>
        {moved ? <Ghost>Priya · Salesforce</Ghost> : (
          <Piece id="check-priya" icon={Users}>
            Priya · Salesforce <i className="bcp__surprise">Denied?</i>
          </Piece>
        )}
      </span>
      <span className="bcp__note">You find out from the people it blocks</span>
    </div>
  )
}

function After({ c, moved, done }: { c: string; moved: boolean; done: boolean }) {
  const slot = (id: string, icon: LucideIcon | undefined, label: string, tone?: 'new' | 'deny' | 'ok') =>
    moved ? <Piece key={id} id={`${c}-${id}`} icon={icon} tone={tone}>{label}</Piece> : <span key={id} className="bcp__slot" />
  const later = (n: number, node: ReactNode) => (
    <motion.span className="bcp__later" initial={false} animate={{ opacity: done ? 1 : 0, y: done ? 0 : 6 }} transition={{ duration: 0.4, delay: done ? n * 0.12 : 0 }}>
      {node}
    </motion.span>
  )
  if (c === 'one')
    return (
      <div className="bcp__card">
        <b>
          <AppLogo appId="salesforce" size={16} /> Salesforce sign-in <i className="bcp__draft">Draft</i>
        </b>
        <span className="bcp__rule">
          <i>1</i>
          {slot('sales', Users, 'Sales · OTP')}
        </span>
        <span className="bcp__rule">
          <i>2</i>
          {slot('fin', Users, 'Finance · Password')}
        </span>
        <span className="bcp__rule">
          <i>if</i>
          {slot('hours', Clock, 'Working hours')}
          {slot('india', MapPin, 'India only')}
        </span>
        {later(0, <span className="bcp__else">Everyone else · Allow</span>)}
      </div>
    )
  if (c === 'parts')
    return (
      <>
        <div className="bcp__card">
          <b>
            <Globe size={13} strokeWidth={2.2} /> Corporate offices <i className="bcp__kind">Zone</i>
          </b>
          <span className="bcp__rows">{[slot('ip', Network, 'IP 203.0.113.0/24'), slot('loc', MapPin, 'India')]}</span>
        </div>
        <div className="bcp__card">
          <b>
            <MonitorSmartphone size={13} strokeWidth={2.2} /> Known devices <i className="bcp__kind">Device profile</i>
          </b>
          <span className="bcp__rows">{slot('dev', MonitorSmartphone, 'At most 2 devices')}</span>
        </div>
        {later(0, (
          <span className="bcp__used">
            Used by <AppLogo appId="salesforce" size={14} /> <AppLogo appId="slack" size={14} /> <AppLogo appId="jira" size={14} />
          </span>
        ))}
      </>
    )
  if (c === 'rule')
    return (
      <div className="bcp__card">
        <b>
          <i className="bcp__n">1</i> Sales on the road
        </b>
        <span className="bcp__part">
          <em>People</em>
          {slot('who', Users, 'Sales')}
        </span>
        <span className="bcp__part">
          <em>Conditions</em>
          {slot('zone', Globe, 'Outside Corporate offices')}
          {slot('dev', MonitorSmartphone, 'Not a known device')}
        </span>
        <span className="bcp__part">
          <em>Outcome</em>
          {slot('then', KeyRound, 'OTP')}
        </span>
      </div>
    )
  if (c === 'order')
    return (
      <div className="bcp__card">
        <b>Read from the top</b>
        <span className="bcp__list">
          {[
            ['sa', '1', 'Sales'],
            ['ct', '2', 'Contractors'],
            ['ev', '·', 'Everyone'],
          ].map(([id, n, name], k) => (
            <span key={id} className={`bcp__ordered${done && k === 0 ? ' is-hit' : ''}`}>
              <i className="bcp__n">{n}</i>
              {moved ? <Piece id={`order-${id}`}>{name}</Piece> : <span className="bcp__slot" />}
            </span>
          ))}
        </span>
        {later(0, <span className="bcp__note">Sales matches first, so rule 1 decides</span>)}
      </div>
    )
  return (
    <div className="bcp__card">
      <b>
        <ScanSearch size={13} strokeWidth={2.2} /> Check access · on the draft
      </b>
      <span className="bcp__list">{moved ? <Piece id="check-priya" icon={Users}>Priya · Salesforce</Piece> : <span className="bcp__slot" />}</span>
      {later(0, (
        <span className="bcp__answer">
          <Check size={13} strokeWidth={2.6} /> Allowed with 2FA · rule 1, through Sales
        </span>
      ))}
    </div>
  )
}

export function IntroCompare({
  at,
  reduce,
  onJump,
  onSkip,
  onFinish,
  skipLabel,
  extra,
}: {
  at: number
  reduce: boolean
  onJump: (n: number) => void
  onSkip: () => void
  onFinish: () => void
  skipLabel: string
  /** Beside Skip: the switch between this and the story. */
  extra?: ReactNode
}) {
  const ch = CHAPTERS[at]
  const [beat, setBeat] = useState(reduce ? 2 : 0)
  const [hold, setHold] = useState(false)
  useEffect(() => setBeat(reduce ? 2 : 0), [at, reduce])
  /* The chapter plays once — the old way, the move, the new way — then the next one. Held while hovered. */
  const next = useRef(() => {})
  next.current = () => (at === CHAPTERS.length - 1 ? undefined : onJump(at + 1))
  useEffect(() => {
    if (reduce || hold) return
    const t = window.setTimeout(() => (beat < 2 ? setBeat(beat + 1) : next.current()), BEATS[beat])
    return () => window.clearTimeout(t)
  }, [beat, hold, reduce])
  const last = at === CHAPTERS.length - 1

  return (
    <div className="bcp">
      <header className="bcp__head" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={ch.id} className="bcp__words" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE_SCENE }}>
            <h2>{ch.title}</h2>
            <p>{ch.line}</p>
          </motion.span>
        </AnimatePresence>
        {extra}
        <button type="button" className="bcp__skip" onClick={onSkip}>
          {skipLabel}
        </button>
      </header>

      <LayoutGroup id={`cmp-${ch.id}`}>
        <div className="bcp__sides">
          <section className="bcp__side is-before" aria-label="Before">
            <span className="bcp__label">
              <X size={12} strokeWidth={2.4} aria-hidden /> Before · {ch.before}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={ch.id} className="bcp__body" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
                <Before c={ch.id} moved={beat >= 1} />
              </motion.div>
            </AnimatePresence>
          </section>
          <span className="bcp__arrow" aria-hidden>
            <ArrowRight size={16} strokeWidth={2.2} />
          </span>
          <section className="bcp__side is-after" aria-label="After">
            <span className="bcp__label">
              <Check size={12} strokeWidth={2.6} aria-hidden /> Now · {ch.after}
              <i className="bcp__newtag">New</i>
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={ch.id} className="bcp__body" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
                <After c={ch.id} moved={beat >= 1} done={beat >= 2} />
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
      </LayoutGroup>

      {/* The dots and the count, as before (owner, 5 Nov 2026: "give me the old one"). */}
      <footer className="bcp__foot bin__foot">
        <span className="bin__where">
          <div className="bin__dots" role="group" aria-label={`Chapter ${at + 1} of ${CHAPTERS.length}`}>
            {CHAPTERS.map((c, n) => (
              <button key={c.id} type="button" className={n === at ? 'is-on' : ''} aria-label={`Go to ${c.short}`} onClick={() => onJump(n)}>
                <span />
              </button>
            ))}
          </div>
          <span aria-hidden>
            {at + 1} of {CHAPTERS.length}
          </span>
        </span>
        {at > 0 && (
          <Button variant="secondary" icon={ArrowLeft} onClick={() => onJump(at - 1)}>
            Back
          </Button>
        )}
        <Button variant="brand" iconRight={ArrowRight} onClick={() => (last ? onFinish() : onJump(at + 1))}>
          {last ? 'Finish' : 'Next'}
        </Button>
      </footer>
    </div>
  )
}

