import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ClipboardCheck, FileInput, Globe, Lock, MapPin, MonitorSmartphone, Send, ShieldCheck, User, Users, type LucideIcon } from 'lucide-react'
import { AppTile } from './parts'

/* -----------------------------------------------------------------------------
   The plain intro's pictures, as user flows (owner, 9 Nov 2026: "showcase them like user flows"). Nodes joined by
   connectors with arrowheads, built up one step at a time with a small rise. Icons and app logos, few words.
   · One canvas: a sign-in runs down the rules; Yes goes to the outcome, No to the next rule.
   · Zones and device profiles: two parts flow into one rule.
   · Check access: pick a user, pick an application, the answer.
   · What's changed: two pages merge into one policy; each group flows into its rule.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const

function In({ reduce, n, children, className = '', x = 0, y = 6 }: { reduce: boolean; n: number; children?: ReactNode; className?: string; x?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, x, y }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: EASE, delay: reduce ? 0 : 0.12 + n * 0.16 }}
    >
      {children}
    </motion.div>
  )
}

function Node({ icon: Icon, logo, label, sub, tone = '' }: { icon?: LucideIcon; logo?: string; label: string; sub?: string; tone?: string }) {
  return (
    <span className={`bisa__node ${tone}`}>
      {logo ? (
        <AppTile appId={logo} size={20} />
      ) : (
        Icon && (
          <span className="bisa__ico" aria-hidden>
            <Icon size={15} strokeWidth={2} />
          </span>
        )
      )}
      <span className="bisa__txt">
        <b>{label}</b>
        {sub && <i>{sub}</i>}
      </span>
    </span>
  )
}

/** A downward connector with an arrowhead, and an optional label beside it. */
function Down({ label }: { label?: string }) {
  return (
    <span className="bisa__down">
      <span className="bisa__vline" aria-hidden />
      {label && <i>{label}</i>}
    </span>
  )
}

/** A connector to the right, with an optional label above it. */
function Across({ label }: { label?: string }) {
  return (
    <span className="bisa__across">
      {label && <i>{label}</i>}
      <span className="bisa__hline" aria-hidden />
    </span>
  )
}

function Outcome({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`bisa__outcome ${tone}`}>{children}</span>
}

/** Two lines meeting in one arrow, drawn across or down. */
function Merge({ dir }: { dir: 'across' | 'down' }) {
  return dir === 'across' ? (
    <svg className="bisa__merge is-across" viewBox="0 0 60 120" preserveAspectRatio="none" aria-hidden>
      <path d="M0 28 C30 28 30 60 54 60 M0 92 C30 92 30 60 54 60" />
      <path d="M48 54 L56 60 L48 66" className="is-head" />
    </svg>
  ) : (
    <svg className="bisa__merge is-down" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden>
      <path d="M75 0 C75 24 150 18 150 38 M225 0 C225 24 150 18 150 38" />
      <path d="M144 32 L150 40 L156 32" className="is-head" />
    </svg>
  )
}

/* --- One canvas: a decision chain ---------------------------------------------------------- */
export function ArtCanvas({ reduce }: { reduce: boolean }) {
  const rules: { who: string; then: string; tone: string }[] = [
    { who: 'Sales', then: 'Allow', tone: 'is-allow' },
    { who: 'Contractors', then: 'MFA', tone: 'is-mfa' },
  ]
  return (
    <div className="bisa is-flow">
      <In reduce={reduce} n={0} className="bisa__row">
        <span className="bisa__start">
          <AppTile appId="salesforce" size={16} />
          A sign-in arrives
        </span>
      </In>
      <In reduce={reduce} n={0.5} className="bisa__row">
        <Down />
      </In>
      {rules.map((r, k) => (
        <div key={r.who} className="bisa__block">
          <In reduce={reduce} n={1 + k * 2} className="bisa__row is-decide">
            <Node icon={Users} label={`${r.who}?`} tone={k === 0 ? 'is-on' : ''} />
            <Across label="Yes" />
            <Outcome tone={r.tone}>{r.then}</Outcome>
          </In>
          <In reduce={reduce} n={1.6 + k * 2} className="bisa__row">
            <Down label="No" />
          </In>
        </div>
      ))}
      <In reduce={reduce} n={5} className="bisa__row is-decide">
        <Node icon={Users} label="Everyone else" tone="is-soft" />
        <Across />
        <Outcome tone="is-deny">Deny</Outcome>
      </In>
    </div>
  )
}

/* --- Zones and device profiles: two parts flow into a rule ------------------------------------ */
export function ArtParts({ reduce }: { reduce: boolean }) {
  return (
    <div className="bisa is-flow">
      <div className="bisa__pair">
        <In reduce={reduce} n={0}>
          <Node icon={MapPin} label="Offices" sub="Zone" tone="is-part" />
        </In>
        <In reduce={reduce} n={0.6}>
          <Node icon={MonitorSmartphone} label="Known devices" sub="Device profile" tone="is-part" />
        </In>
      </div>
      <In reduce={reduce} n={1.4} className="bisa__row" y={0}>
        <Merge dir="down" />
      </In>
      <In reduce={reduce} n={2.2} className="bisa__row is-decide">
        <Node icon={Users} label="Sales" sub="Offices · Known devices" tone="is-on" />
        <Across />
        <Outcome tone="is-allow">Allow</Outcome>
      </In>
    </div>
  )
}

/* --- Check access: pick, pick, answer -------------------------------------------------------- */
export function ArtCheck({ reduce }: { reduce: boolean }) {
  return (
    <div className="bisa is-flow is-narrow">
      <In reduce={reduce} n={0} className="bisa__row">
        <span className="bisa__step">1</span>
        <Node icon={User} label="Priya Nair" sub="User" />
      </In>
      <In reduce={reduce} n={0.6} className="bisa__row">
        <Down />
      </In>
      <In reduce={reduce} n={1.2} className="bisa__row">
        <span className="bisa__step">2</span>
        <Node logo="slack" label="Slack" sub="Application" />
      </In>
      <In reduce={reduce} n={1.8} className="bisa__row">
        <Down />
      </In>
      <In reduce={reduce} n={2.6} className="bisa__row" y={0}>
        <span className="bisa__step is-done">3</span>
        <Node icon={ShieldCheck} label="Allowed" sub="Rule 1, Sales" tone="is-answer" />
      </In>
    </div>
  )
}

/* --- What's changed: two pages merge into one policy ---------------------------------------- */
export function ArtMerge({ reduce }: { reduce: boolean }) {
  return (
    <div className="bisa is-across">
      <div className="bisa__stack">
        <In reduce={reduce} n={0} x={-8} y={0}>
          <Node icon={Lock} label="App Login" tone="is-old" />
        </In>
        <In reduce={reduce} n={0.6} x={-8} y={0}>
          <Node icon={Globe} label="Adaptive Access" tone="is-old" />
        </In>
      </div>
      <In reduce={reduce} n={1.4} x={0} y={0} className="bisa__mergebox">
        <Merge dir="across" />
      </In>
      <In reduce={reduce} n={2.2} x={8} y={0}>
        <Node logo="salesforce" label="Salesforce sign-in" sub="One policy" tone="is-on" />
      </In>
    </div>
  )
}

/* --- What's changed: each group flows into its rule ------------------------------------------ */
export function ArtGroups({ reduce }: { reduce: boolean }) {
  const groups = ['Sales', 'Contractors', 'Admins']
  return (
    <div className="bisa is-flow">
      {groups.map((g, n) => (
        <div key={g} className="bisa__block">
          <In reduce={reduce} n={n * 1.4} className="bisa__row is-map">
            <Node icon={Users} label={g} sub="Group" tone="is-old" />
            <Across />
            <Node label={`Rule ${n + 1}`} sub={g} tone={n === 0 ? 'is-on' : ''} />
          </In>
          {n < groups.length - 1 && (
            <In reduce={reduce} n={n * 1.4 + 0.7} className="bisa__row is-map">
              <span />
              <span />
              <Down />
            </In>
          )}
        </div>
      ))}
    </div>
  )
}

/* --- The Migrate popup: migrate, then review, then publish, one at a time (owner, 9 Nov 2026) ----------
   One policy card goes through the three steps, a scene each, looping: an old App Login policy becomes a draft; its
   rules are reviewed and Approve turns to Approved; Draft turns to Active. The steps are named under the stage and can
   be picked. Reduced motion holds each scene still and does not advance by itself. */
const STEP_MS = 3200

export function ArtSteps({ reduce }: { reduce: boolean }) {
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (reduce) return
    const id = window.setTimeout(() => setAt((n) => (n + 1) % 3), STEP_MS)
    return () => window.clearTimeout(id)
  }, [at, reduce])
  const steps: { icon: LucideIcon; label: string }[] = [
    { icon: FileInput, label: 'Migrate' },
    { icon: ClipboardCheck, label: 'Review' },
    { icon: Send, label: 'Publish' },
  ]
  const fade = { duration: reduce ? 0 : 0.35, ease: EASE }
  return (
    <div className="bisa is-steps">
      <div className="bisa__scene">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={at} className="bisa__scenein" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -10 }} transition={fade}>
            {at === 0 && (
              <>
                <In reduce={reduce} n={0}>
                  <Node icon={Lock} label="Salesforce Sales" sub="App Login" tone="is-old" />
                </In>
                <In reduce={reduce} n={1} className="bisa__row">
                  <Down />
                </In>
                <In reduce={reduce} n={2}>
                  <PolicyCard pill={<span className="bisa__pill">Draft</span>} />
                </In>
              </>
            )}
            {at === 1 && (
              <In reduce={reduce} n={0}>
                <PolicyCard
                  rows
                  pill={<span className="bisa__pill">Draft</span>}
                  foot={
                    <motion.span
                      className="bisa__approve"
                      initial={false}
                      animate={reduce ? undefined : { backgroundColor: ['var(--surface-raised)', 'var(--surface-raised)', 'var(--fb-positive-bg)'] }}
                      transition={{ duration: 1.6, times: [0, 0.6, 1] }}
                    >
                      <Check size={14} strokeWidth={2.6} aria-hidden />
                      <ApproveWord reduce={reduce} />
                    </motion.span>
                  }
                />
              </In>
            )}
            {at === 2 && (
              <In reduce={reduce} n={0}>
                <PolicyCard rows pill={<StatusFlip reduce={reduce} />} />
              </In>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <ol className="bisa__steps" aria-hidden>
        {steps.map((st, n) => (
          <li key={st.label}>
            <button type="button" className={n === at ? 'is-on' : n < at ? 'is-done' : ''} onClick={() => setAt(n)} tabIndex={-1}>
              <st.icon size={14} strokeWidth={2} />
              {st.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PolicyCard({ pill, rows = false, foot }: { pill: ReactNode; rows?: boolean; foot?: ReactNode }) {
  return (
    <span className="bisa__policy">
      <span className="bisa__policyhead">
        <AppTile appId="salesforce" size={20} />
        <b>Salesforce sign-in</b>
        {pill}
      </span>
      {rows && (
        <span className="bisa__policyrows">
          <span>
            <Users size={13} strokeWidth={2} aria-hidden />
            Sales<Outcome tone="is-allow">Allow</Outcome>
          </span>
          <span>
            <Users size={13} strokeWidth={2} aria-hidden />
            Everyone else<Outcome tone="is-deny">Deny</Outcome>
          </span>
        </span>
      )}
      {foot}
    </span>
  )
}

/** Approve, then Approved a beat later. */
function ApproveWord({ reduce }: { reduce: boolean }) {
  const [done, setDone] = useState(reduce)
  useEffect(() => {
    if (reduce) return
    const id = window.setTimeout(() => setDone(true), 1000)
    return () => window.clearTimeout(id)
  }, [reduce])
  return <>{done ? 'Approved' : 'Approve'}</>
}

/** Draft, then Active a beat later. */
function StatusFlip({ reduce }: { reduce: boolean }) {
  const [on, setOn] = useState(reduce)
  useEffect(() => {
    if (reduce) return
    const id = window.setTimeout(() => setOn(true), 900)
    return () => window.clearTimeout(id)
  }, [reduce])
  return <span className={`bisa__pill${on ? ' is-active' : ''}`}>{on ? 'Active' : 'Draft'}</span>
}
