import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Minus, Search, X } from 'lucide-react'

import { Button, Chip, Counter, DecisionChip, Modal } from '../kit'
import { type AccessDecision, type Policy, type Rule } from '../data'
import { useBrand } from '../store'
import { AppLogo } from '../logos/AppLogo'
import {
  AUTH_STATES,
  DEVICE_OPTIONS,
  PLACES,
  RISKS,
  SIM_USERS,
  walk,
  type SimEnv,
  type TraceResult,
} from './simulate'
import './builder-test.css'

/* -----------------------------------------------------------------------------
   The two dialogs that answer the only questions a policy author actually has:
   "what would this do to a named person, right now" and "what has it been
   doing while I wasn't watching".

   v0 shipped both as shape without substance — the test drawer's matcher was
   four hardcoded lines that ignored the rule's own conditions, and the log was
   six fixed rows that had nothing to do with the policy you were looking at.
   Both are recreated here and then actually run: the test walks the real rule
   list against a real context and names the condition that stopped each rule,
   and the log is generated from the policy's own rule names so the two screens
   cannot contradict each other.

   The honest limit, stated in the UI rather than buried here: the map from a
   context option to a condition value is a fixed table in this prototype, not
   the engine. The ORDER of evaluation, the first-match-wins stop, and the
   decision that results are all real.
   -------------------------------------------------------------------------- */

// --- The simulated world, the evaluator and the trace all live in simulate.ts,
// so this dialog, the Gauntlet and the Impact arena cannot disagree about what a
// policy would do. Everything below is presentation over that one result.

// --- Test dialog -------------------------------------------------------------

export function TestPolicyDialog({
  open,
  policy,
  onClose,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  const [query, setQuery] = useState('')
  const [userId, setUserId] = useState(SIM_USERS[0].id)
  const [place, setPlace] = useState('Office Network')
  const [device, setDevice] = useState('Known < 90 days')
  const [authState, setAuthState] = useState('Normal returning user')
  const [risk, setRisk] = useState('Low')

  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [shown, setShown] = useState(0)

  const user = SIM_USERS.find((u) => u.id === userId) ?? SIM_USERS[0]
  const matches = SIM_USERS.filter((u) => {
    const q = query.trim().toLowerCase()
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.groupName.toLowerCase().includes(q)
  })

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )

  // A verdict that outlives the context it was computed from is a lie on
  // screen, so any change to the inputs clears it rather than greying it out.
  const contextKey = `${userId}|${place}|${device}|${authState}|${risk}`
  useEffect(() => {
    setTrace(null)
    setShown(0)
  }, [contextKey])

  useEffect(() => {
    if (!open) {
      setTrace(null)
      setShown(0)
    }
  }, [open])

  /* The walk is budget-capped rather than paced per step: a two-rule policy
     gets a readable 180ms beat and a twenty-rule policy still finishes inside
     900ms, so a long policy never becomes a waiting game. Reduced motion jumps
     to the final frame with no elapsed time at all — a slower non-animation is
     still a delay. */
  useEffect(() => {
    if (!trace) return
    if (reduce || trace.steps.length === 0) {
      setShown(trace.steps.length)
      return
    }
    const per = Math.min(180, 900 / trace.steps.length)
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setShown(n)
      if (n >= trace.steps.length) window.clearInterval(id)
    }, per)
    return () => window.clearInterval(id)
  }, [trace, reduce])

  const done = trace !== null && shown >= trace.steps.length
  // steps carries one entry per rule in order, so hitIndex indexes it directly.
  const hitStep = trace && trace.hitIndex !== null ? trace.steps[trace.hitIndex] : null

  function run() {
    const now = new Date()
    setShown(0)
    setTrace(
      walk(
        policy,
        { user, place, device, authState, risk, nowMinutes: now.getHours() * 60 + now.getMinutes() },
        env,
      ),
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test this policy"
      width={780}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="brand" onClick={run}>
            Run simulation
          </Button>
        </>
      }
    >
      <div className="bts">
        {/* The verdict lands after the walk, so it needs announcing rather than
            just appearing. Own class, not the one builder-v2.css happens to
            define — a screen should not depend on another screen's stylesheet. */}
        <p className="bts__live" aria-live="polite">
          {done && trace
            ? hitStep
              ? `Rule ${hitStep.index + 1}, ${hitStep.rule.name}, matched. Decision: ${trace.decision === 'deny' ? 'deny' : trace.decision === '2fa' ? 'require a second factor' : 'allow'}.`
              : 'No rule matched. The engine default allowed the sign-in.'
            : ''}
        </p>

        <p className="bts__policy">
          {policy.name} · {policy.rules.length} rule{policy.rules.length === 1 ? '' : 's'}, evaluated in order
        </p>

        <div className="bts__grid">
          <section className="bts__panel">
            <h3 className="u-label">Simulate for</h3>
            <div className="bts__search">
              <Search size={14} strokeWidth={2} aria-hidden />
              <input
                type="search"
                aria-label="Search users"
                placeholder="Search users…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="bts__users">
              {matches.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`bts__user ${u.id === userId ? 'is-on' : ''}`}
                    aria-pressed={u.id === userId}
                    onClick={() => setUserId(u.id)}
                  >
                    <span className="bts__avatar" aria-hidden>
                      {u.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')}
                    </span>
                    <span className="bts__usertext">
                      <strong>{u.name}</strong>
                      <em>{u.email}</em>
                    </span>
                    <span className="bts__group">{u.groupName}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="bts__empty">Nobody matches “{query}”.</li>}
            </ul>
          </section>

          <section className="bts__panel">
            <h3 className="u-label">Login context</h3>
            <Axis label="Connecting from" options={PLACES} value={place} onChange={setPlace} />
            <Axis label="Device" options={DEVICE_OPTIONS} value={device} onChange={setDevice} />
            <Axis label="Auth state" options={AUTH_STATES} value={authState} onChange={setAuthState} />
            <Axis label="Risk signal" options={RISKS} value={risk} onChange={setRisk} />
          </section>
        </div>

        <p className="bts__caveat">
          Heuristic, not the engine — each option above maps to a condition value through a fixed table in
          this prototype, and any signal it cannot derive is reported as unmet rather than guessed. The
          order, the first-match stop and the resulting decision are real.
        </p>

        <AnimatePresence>
          {trace && (
            <motion.div
              className="bts__trace"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <h3 className="u-label">Evaluation trace</h3>

              {trace.steps.length === 0 && (
                <p className="bts__norules">
                  This policy has no rules, so every sign-in falls straight through to the default.
                </p>
              )}

              <ol className="bts__steps">
                {trace.steps.slice(0, shown).map((s) => (
                  <motion.li
                    key={s.rule.id}
                    className={`bts__step is-${s.kind}`}
                    initial={{ opacity: 0, x: reduce ? 0 : -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduce ? 0 : 0.16 }}
                  >
                    <span className="bts__mark" aria-hidden>
                      {s.kind === 'hit' ? (
                        <Check size={12} strokeWidth={3} />
                      ) : s.kind === 'miss' ? (
                        <X size={12} strokeWidth={2.6} />
                      ) : (
                        <Minus size={12} strokeWidth={2.6} />
                      )}
                    </span>
                    <span className="bts__steptext">
                      <strong>
                        Rule {s.index + 1} · {s.rule.name}
                        <b className={`bts__verdict is-${s.kind}`}>
                          {s.kind === 'hit'
                            ? 'matched — evaluation stopped'
                            : s.kind === 'miss'
                              ? 'no match'
                              : s.kind === 'off'
                                ? 'skipped, disabled'
                                : 'not reached'}
                        </b>
                      </strong>
                      <em>{s.reason}</em>
                    </span>
                  </motion.li>
                ))}
              </ol>

              <AnimatePresence>
                {done && (
                  <motion.div
                    className="bts__verdictcard"
                    initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                  >
                    <div className="bts__decision">
                      <DecisionChip decision={trace.decision} />
                      <p>
                        {hitStep ? (
                          <>
                            Produced by <strong>Rule {hitStep.index + 1} · {hitStep.rule.name}</strong>
                          </>
                        ) : (
                          <>
                            No rule matched — <strong>the engine default</strong> let this sign-in through
                          </>
                        )}
                      </p>
                    </div>
                    <div className="bts__sees">
                      <p className="u-label">What {user.name.split(' ')[0]} would see</p>
                      <ol>
                        {trace.decision === 'deny' ? (
                          <li>Access denied page</li>
                        ) : (
                          <>
                            <li>Enter password</li>
                            {trace.decision === '2fa' && <li>Approve the second factor</li>}
                          </>
                        )}
                      </ol>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  )
}

function Axis({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="bts__axis">
      <span className="bts__axislabel">{label}</span>
      <div className="bts__opts">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`bts__opt ${o === value ? 'is-on' : ''}`}
            aria-pressed={o === value}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Decision log ------------------------------------------------------------

type LogDecision = 'Allow' | 'Deny' | 'Challenge'

const DECISION_OF: Record<AccessDecision, LogDecision> = { deny: 'Deny', '2fa': 'Challenge', '1fa': 'Allow' }
const DECISION_TONE: Record<LogDecision, string> = { Allow: 'allow', Deny: 'deny', Challenge: 'challenge' }

interface LogRow {
  id: string
  hoursAgo: number
  time: string
  user: string
  appId: string
  appName: string
  matchedRule: string
  decision: LogDecision
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* Seeded from the policy id so the log is stable across renders and across
   re-opens. A log that reshuffles every time you open it is a log nobody can
   point at in a review. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

function buildLog(policy: Policy, appPool: { id: string; name: string }[]): LogRow[] {
  const rnd = seeded(policy.id)
  const now = Date.now()
  const live = policy.rules.filter((r) => r.enabled)
  /* Two nulls in the pool are the fall-through cases. Cycling rather than
     sampling guarantees every rule name in the policy shows up at least once,
     which is the point — the log has to be readable as evidence about THIS
     policy. */
  const pool: (Rule | null)[] = [...live, null, null]

  const rows: LogRow[] = []
  for (let i = 0; i < 16; i++) {
    const rule = pool[i % pool.length]
    const person = SIM_USERS[Math.floor(rnd() * SIM_USERS.length)]
    const app = appPool[Math.floor(rnd() * appPool.length)]
    // Ten inside the day, six spread across the rest of the week, so the range
    // filter changes the count instead of decorating the toolbar.
    const hoursAgo = i < 10 ? rnd() * 23 : 24 + rnd() * 140
    const at = new Date(now - hoursAgo * 3600000)
    const hhmmss = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}`

    rows.push({
      id: `${policy.id}-${i}`,
      hoursAgo,
      time: hoursAgo < 24 ? hhmmss : `${WEEKDAYS[at.getDay()]} ${hhmmss.slice(0, 5)}`,
      user: person.email,
      appId: app.id,
      appName: app.name,
      matchedRule: rule ? rule.name : 'Default rule',
      decision: rule ? DECISION_OF[rule.decision] : 'Allow',
    })
  }

  return rows.sort((a, b) => a.hoursAgo - b.hoursAgo)
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function DecisionLogDialog({
  open,
  policy,
  onClose,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const [decision, setDecision] = useState<'all' | LogDecision>('all')
  const [range, setRange] = useState<'24h' | '7d'>('24h')

  const appPool = useMemo(() => {
    const named = policy.isSystem ? store.apps : policy.appId ? [store.appById(policy.appId)] : []
    return named.length > 0 ? named : store.apps.slice(0, 3)
  }, [policy.isSystem, policy.appId, store])

  const all = useMemo(() => buildLog(policy, appPool), [policy, appPool])

  const rows = all.filter(
    (r) => r.hoursAgo < (range === '24h' ? 24 : 168) && (decision === 'all' || r.decision === decision),
  )
  const inRange = all.filter((r) => r.hoursAgo < (range === '24h' ? 24 : 168))
  const count = (d: LogDecision) => rows.filter((r) => r.decision === d).length

  function exportCsv() {
    const header = ['Time', 'User', 'App', 'Matched rule', 'Decision']
    const body = rows.map((r) => [r.time, r.user, r.appName, r.matchedRule, r.decision])
    const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')

    const slug = policy.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-decision-log-${range}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking in the same tick cancels the save while it is still in flight in
    // Firefox and Safari — the object URL has to outlive the click.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    store.showToast(`Exported ${rows.length} evaluation${rows.length === 1 ? '' : 's'}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decision log"
      width={860}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="bdl">
        <div className="bdl__bar">
          <div className="bdl__seg" role="tablist" aria-label="Filter by decision">
            {(['all', 'Allow', 'Deny', 'Challenge'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={decision === d}
                className={`bdl__segbtn ${decision === d ? 'is-on' : ''}`}
                onClick={() => setDecision(d)}
              >
                {decision === d && !reduce && (
                  <motion.span
                    layoutId="bdl-seg"
                    className="bdl__segbg"
                    transition={{ type: 'spring', stiffness: 600, damping: 44 }}
                  />
                )}
                <span className="bdl__seglabel">
                  {d === 'all' ? 'All decisions' : d}
                  <em>{d === 'all' ? inRange.length : inRange.filter((r) => r.decision === d).length}</em>
                </span>
              </button>
            ))}
          </div>

          <div className="bdl__range">
            <Chip active={range === '24h'} onClick={() => setRange('24h')}>
              Last 24h
            </Chip>
            <Chip active={range === '7d'} onClick={() => setRange('7d')}>
              Last 7 days
            </Chip>
          </div>

          <div className="bdl__export">
            <Button variant="neutral" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
              <Download size={13} strokeWidth={2} aria-hidden /> Export CSV
            </Button>
          </div>
        </div>

        <p className="bdl__summary">
          Showing {reduce ? rows.length : <Counter value={rows.length} />} evaluation
          {rows.length === 1 ? '' : 's'} — {count('Allow')} allowed / {count('Deny')} denied /{' '}
          {count('Challenge')} challenged
        </p>

        <div className="bdl__scroll">
          <table className="bdl__table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">User</th>
                <th scope="col">App</th>
                <th scope="col">Matched rule</th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.16, delay: reduce ? 0 : Math.min(i * 0.012, 0.12) }}
                >
                  <td className="bdl__time u-mono">{r.time}</td>
                  <td className="bdl__user">{r.user}</td>
                  <td>
                    <span className="bdl__app">
                      <AppLogo appId={r.appId} name={r.appName} size={16} />
                      {r.appName}
                    </span>
                  </td>
                  <td className="bdl__rule">{r.matchedRule}</td>
                  <td>
                    <span className={`bdl__chip is-${DECISION_TONE[r.decision]}`}>
                      <i aria-hidden />
                      {r.decision}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="bdl__empty">No evaluations match these filters.</p>}
        </div>
      </div>
    </Modal>
  )
}
