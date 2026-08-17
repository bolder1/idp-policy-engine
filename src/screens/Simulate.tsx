import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

import { AppGlyph, Badge, Button, Callout, Field, OutcomeChip } from '../components/ui'
import { normalizeUserId, signInHistory } from '../data/seed'
import { evaluatePolicy, formatMinutes, type EvaluationTrace } from '../engine/evaluate'
import { type Policy, type SignInContext } from '../engine/model'
import { resolve } from '../engine/weight'
import { useStore } from '../state/store'

/* -----------------------------------------------------------------------------
   Simulate.

   Two decisions carried over from the research:

     - The context is seeded from real sign-ins rather than starting blank. A
       blank-canvas simulator asks the admin to invent the scenarios worth
       testing, which is exactly why AWS's IAM Policy Simulator goes unused;
       the cases you forget to test are the ones that bite.
     - Policies that do NOT apply report the FIRST unsatisfied condition and
       only that one. Listing every failure produces noise; the first failure
       is the actionable one.
   -------------------------------------------------------------------------- */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Simulate({ policyId }: { policyId?: string }) {
  const store = useStore()
  const focus = policyId ? store.policyById(policyId) : undefined

  const [ctx, setCtx] = useState<SignInContext>(() => ({
    ...signInHistory[0],
    userId: normalizeUserId(signInHistory[0].userId),
    appId: focus?.appId ?? signInHistory[0].appId,
  }))
  const [step, setStep] = useState(-1)
  const [running, setRunning] = useState(false)

  const user = store.users.find((u) => u.id === ctx.userId) ?? store.users[0]
  const app = store.appById(ctx.appId)

  const resolution = useMemo(
    () => resolve(store.policies, store.groups, user.groupIds, ctx.appId),
    [store.policies, store.groups, user.groupIds, ctx.appId],
  )

  const winner = resolution.winner
  const trace: EvaluationTrace | null = useMemo(
    () => (winner ? evaluatePolicy(winner.policy, ctx, store.ranges, store.locations) : null),
    [winner, ctx, store.ranges, store.locations],
  )

  // Total beats: sign-in node, one per condition, the gate, the outcome.
  const beats = trace ? trace.conditions.length + 3 : 0

  useEffect(() => {
    if (!running) return
    if (step >= beats - 1) {
      setRunning(false)
      return
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), step < 0 ? 200 : 620)
    return () => window.clearTimeout(t)
  }, [running, step, beats])

  function run() {
    setStep(-1)
    setRunning(true)
  }

  function patch(p: Partial<SignInContext>) {
    setCtx((c) => ({ ...c, ...p }))
    setStep(-1)
    setRunning(false)
  }

  return (
    <div className="page sim">
      <header className="page__head">
        <div>
          <h1 className="page__title">Simulate a sign-in</h1>
          <p className="page__sub">
            Replay something that actually happened, or build a case by hand, and watch it move
            through the policy that would govern it.
          </p>
        </div>
        <div className="page__actions">
          <Button variant="primary" onClick={run} disabled={!trace}>
            {step >= beats - 1 && !running ? 'Run again' : 'Run simulation'}
          </Button>
        </div>
      </header>

      <div className="sim__grid">
        {/* ---------- context ---------- */}
        <aside className="sim__ctx">
          <h3 className="sim__ctx-title">Replay a real sign-in</h3>
          <div className="replays">
            {signInHistory.map((s, i) => {
              const uid = normalizeUserId(s.userId)
              const u = store.users.find((x) => x.id === uid)
              const a = store.appById(s.appId)
              const isOn = ctx.timestamp === s.timestamp && ctx.userId === uid
              return (
                <button
                  key={i}
                  type="button"
                  className={`replay ${isOn ? 'is-on' : ''}`}
                  onClick={() => {
                    setCtx({ ...s, userId: uid })
                    setStep(-1)
                    setRunning(false)
                  }}
                >
                  <span className="replay__who">{u?.name ?? uid}</span>
                  <span className="replay__what">
                    <AppGlyph glyph={a.glyph} tint={a.tint} size={13} />
                    {a.name}
                  </span>
                  <span className="replay__when">
                    {s.timestamp} · {s.locationLabel}
                  </span>
                </button>
              )
            })}
          </div>

          <h3 className="sim__ctx-title" style={{ marginTop: 20 }}>
            Or set the context
          </h3>
          <div className="sim__fields">
            <Field label="User">
              <select
                value={ctx.userId}
                onChange={(e) => patch({ userId: e.target.value })}
              >
                {store.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Application">
              <select value={ctx.appId} onChange={(e) => patch({ appId: e.target.value })}>
                {store.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="IP address" htmlFor="sim-ip">
              <input id="sim-ip" value={ctx.ip} onChange={(e) => patch({ ip: e.target.value })} />
            </Field>
            <Field label="Location">
              <select
                value={ctx.locationId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null
                  patch({
                    locationId: id,
                    locationLabel: id
                      ? (store.locations.find((l) => l.id === id)?.name ?? '')
                      : 'Unknown location',
                  })
                }}
              >
                <option value="">Unknown location</option>
                {store.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Device risk — ${ctx.deviceRiskScore}`} htmlFor="sim-risk">
              <input
                id="sim-risk"
                type="range"
                min={0}
                max={100}
                value={ctx.deviceRiskScore}
                onChange={(e) => patch({ deviceRiskScore: Number(e.target.value) })}
              />
            </Field>
            <label className="checkline">
              <input
                type="checkbox"
                checked={ctx.deviceRegistered}
                onChange={(e) => patch({ deviceRegistered: e.target.checked })}
              />
              Device is registered
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={ctx.isMobile}
                onChange={(e) => patch({ isMobile: e.target.checked })}
              />
              Mobile device
            </label>
            <Field
              label={`Time — ${formatMinutes(ctx.timeOfDay)} ${DAY_NAMES[ctx.dayOfWeek]}`}
              htmlFor="sim-tod"
            >
              <input
                id="sim-tod"
                type="range"
                aria-label={`Time of day — ${formatMinutes(ctx.timeOfDay)}`}
                min={0}
                max={1439}
                step={15}
                value={ctx.timeOfDay}
                onChange={(e) => patch({ timeOfDay: Number(e.target.value) })}
              />
              <input
                type="range"
                aria-label={`Day of week — ${DAY_NAMES[ctx.dayOfWeek]}`}
                min={0}
                max={6}
                value={ctx.dayOfWeek}
                onChange={(e) => patch({ dayOfWeek: Number(e.target.value) })}
              />
            </Field>
          </div>
        </aside>

        {/* ---------- trace ---------- */}
        <div className="sim__stage">
          {!winner || !trace ? (
            <div className="sim__empty">
              <Callout tone="warn">
                <div>
                  <strong>No policy governs this pair.</strong> {user.name} can reach {app.name}{' '}
                  with nothing evaluating the sign-in. That is what an empty cell on the coverage
                  grid means.
                  <button
                    className="linkbtn"
                    onClick={() => store.go({ name: 'coverage' })}
                  >
                    Back to coverage →
                  </button>
                </div>
              </Callout>
            </div>
          ) : (
            <TraceView
              trace={trace}
              policy={winner.policy}
              groupName={winner.group.name}
              user={user.name}
              appName={app.name}
              step={step}
              contested={resolution.ranked.length > 1}
              onWhy={() => store.go({ name: 'resolution', userId: user.id, appId: app.id })}
            />
          )}

          {/* Non-applying policies, each with ONE reason. */}
          {resolution.ranked.length > 1 && (
            <div className="sim__others">
              <h3 className="sim__ctx-title">Did not decide this sign-in</h3>
              {resolution.ranked
                .filter((r) => r.policy.id !== winner?.policy.id)
                .map((r) => {
                  const t = evaluatePolicy(r.policy, ctx, store.ranges, store.locations)
                  return (
                    <div key={r.policy.id} className="other">
                      <div className="other__head">
                        <span className="other__name">{r.policy.name}</span>
                        <Badge>weight {r.weight.total}</Badge>
                        {r.policy.status === 'shadow' && <Badge tone="proposed">shadow</Badge>}
                      </div>
                      <p className="other__why">
                        {r.policy.status === 'shadow'
                          ? 'Evaluating in shadow — logged, never enforced.'
                          : t.firstUnsatisfied
                            ? t.firstUnsatisfied.reason
                            : `Outranked by ${winner?.policy.name}.`}
                      </p>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* --- The trace ------------------------------------------------------------- */

function TraceView({
  trace,
  policy,
  groupName,
  user,
  appName,
  step,
  contested,
  onWhy,
}: {
  trace: EvaluationTrace
  policy: Policy
  groupName: string
  user: string
  appName: string
  step: number
  contested: boolean
  onWhy: () => void
}) {
  const gateIndex = trace.conditions.length + 1
  const outcomeIndex = gateIndex + 1
  const settled = step >= outcomeIndex

  return (
    <div className="trace">
      <div className="trace__head">
        <span className="trace__policy">{policy.name}</span>
        <span className="trace__meta">
          governs {groupName} on {appName}
        </span>
        {contested && (
          <button className="linkbtn trace__why" onClick={onWhy}>
            Why this policy? →
          </button>
        )}
      </div>

      <div className="trace__flow">
        <Node active={step >= 0} kind="start">
          <strong>{user}</strong> signs in to {appName}
        </Node>

        {trace.conditions.length === 0 && (
          <>
            <Connector lit={step >= 1} />
            <Node active={step >= 1} kind="neutral">
              No adaptive conditions — the configured sign-in applies as-is.
            </Node>
          </>
        )}

        {trace.conditions.map((c, i) => (
          <div key={c.key}>
            <Connector lit={step >= i + 1} />
            <Node
              active={step >= i + 1}
              kind={step >= i + 1 ? (c.triggered ? 'hit' : 'pass') : 'pending'}
            >
              <div className="node__row">
                <span className="node__label">{c.label}</span>
                <span className={`node__verdict ${c.triggered ? 'is-hit' : 'is-pass'}`}>
                  {step >= i + 1 ? (c.triggered ? 'triggered' : 'clear') : '…'}
                </span>
              </div>
              <p className="node__reason">{c.reason}</p>
              <span className="node__observed">{c.observed}</span>
            </Node>
          </div>
        ))}

        {trace.conditions.length > 0 && (
          <>
            <Connector lit={step >= gateIndex} />
            {/* The gate is the conjunction made physical: with AND every input
                must be lit for it to open, with OR one is enough. */}
            <div className={`gate ${step >= gateIndex ? 'is-on' : ''} ${trace.conditionsMet ? 'is-open' : 'is-shut'}`}>
              <span className="gate__op">{trace.conjunction === 'all' ? 'AND' : 'OR'}</span>
              <span className="gate__text">
                {step < gateIndex
                  ? trace.conjunction === 'all'
                    ? 'all must trigger'
                    : 'any may trigger'
                  : trace.conditionsMet
                    ? trace.conjunction === 'all'
                      ? 'every condition triggered'
                      : 'at least one triggered'
                    : trace.conjunction === 'all'
                      ? `not all triggered — ${trace.firstUnsatisfied?.label} was clear`
                      : 'nothing triggered'}
              </span>
            </div>
          </>
        )}

        <Connector lit={step >= outcomeIndex} />

        <AnimatePresence>
          <motion.div
            className={`verdict verdict--${trace.outcome} ${settled ? 'is-settled' : ''}`}
            initial={false}
            animate={
              settled
                ? { scale: 1, opacity: 1 }
                : { scale: 0.98, opacity: 0.4 }
            }
            transition={{ type: 'spring', stiffness: 460, damping: 24 }}
          >
            <OutcomeChip action={trace.outcome} size="lg" />
            <div className="verdict__steps">
              {trace.obligations.map((o, i) => (
                <motion.span
                  key={o}
                  className="verdict__step"
                  initial={{ opacity: 0, x: -6 }}
                  animate={settled ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
                  transition={{ delay: settled ? i * 0.07 : 0, duration: 0.2 }}
                >
                  <em>{i + 1}</em>
                  {o}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Node({
  children,
  active,
  kind,
}: {
  children: React.ReactNode
  active: boolean
  kind: 'start' | 'hit' | 'pass' | 'pending' | 'neutral'
}) {
  return (
    <motion.div
      className={`node node--${kind} ${active ? 'is-active' : ''}`}
      initial={false}
      animate={{ opacity: active ? 1 : 0.42, y: active ? 0 : 3 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The connector carries a travel dot along its path with <animateMotion>.
 * Chosen over animating stroke-dashoffset for two reasons: it performs better
 * with many edges, and it is semantically right — the dot *is* the sign-in
 * request moving through evaluation, not a decorative shimmer.
 */
function Connector({ lit }: { lit: boolean }) {
  // SMIL ignores both CSS transition overrides and MotionConfig, so the
  // reduced-motion check has to be explicit here.
  const still =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="conn" aria-hidden>
      <svg width="14" height="26" viewBox="0 0 14 26" fill="none">
        <path
          d="M7 0 L7 26"
          stroke={lit ? 'var(--orange)' : 'var(--border-strong)'}
          strokeWidth="1.5"
          strokeDasharray={lit ? '0' : '3 3'}
        />
        {lit && !still && (
          <circle r="3" fill="var(--orange)">
            <animateMotion dur="0.55s" fill="freeze" path="M7 0 L7 26" />
          </circle>
        )}
      </svg>
    </div>
  )
}
