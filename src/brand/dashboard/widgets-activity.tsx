import { useMemo, useState } from 'react'
import { Check, Globe, KeyRound, ShieldCheck, Target } from 'lucide-react'
import { Badge, Button } from '../kit'
import { CANT_TELL } from '../decision-words'
import { Face } from '../faces'
import { AppLogo } from '../logos/AppLogo'
import { daysLeft } from '../migrate/legacy'
import { useBrand } from '../store'
import { DENY_REASON_WORD } from '../screens/testing/deny-reason'
import { BarChart, CategoryBar, Donut, Gauge, HeatGrid, Spark, WaveChart, type Part, type Series } from './charts'
import { RAMP, SERIES_COLOR, beforeLine, figureCaption, fmt, pct, rangeCaption } from './format'
import { viewOf } from './model'
import {
  APP_SHARES,
  CHANNELS,
  EXPIRING,
  LICENSE,
  METHODS,
  MFA,
  MOST_BLOCKED,
  PHISHING,
  PLACES,
  REASON_SHARES,
  RISK_SIGNALS,
  SERIES_KEYS,
  SERIES_WORD,
  WEEKDAYS,
  busiest,
  change,
  delivery,
  funnel,
  split,
  typicalWeek,
  type ChannelId,
  type SeriesKey,
} from './seed'
import { NOW, personAt, pickAt, timeAxis, useActivity, usePolicyFacts, useSignIns } from './sources'
import { pickOf, useTile } from './tile-context'
import { BarList, Clear, Count, Filter, Fit, Head, Legend, Mark, More, Row, Stat, Table, Trend } from './widget-kit'
import { shows } from '../rollout'
import { HIDE_CHECKS } from '../tester'

/** The 22 Nov copy round (rollout.ts dashboardPolish). */
const POLISH = shows('dashboardPolish')

/* -----------------------------------------------------------------------------
   Posture and sign-in activity: what the tenant is exposed to, and what is
   happening at the door.

   Each number is said once on a board that holds the default set: the stat
   cards carry the totals, so the charts and breakdowns beside them split
   those totals rather than printing them again.
   -------------------------------------------------------------------------- */

/* ---- stats ----------------------------------------------------------------- */

export function SignInsTotal() {
  const { range, preview } = useTile()
  const { points, t, before } = useSignIns(range)
  const d = change(t.all, before.all)
  return (
    <Stat
      value={<Count value={t.all} />}
      chip={<Trend change={d} />}
      line={beforeLine(d >= 0, range)}
      up={d >= 0}
      caption={`Busiest ${range === '24h' ? 'at' : 'on'} ${busiest(points, range)}`}
      spark={<Spark values={points.map((p) => p.allowed + p.mfa + p.blocked)} still={preview} />}
    />
  )
}

export function BlockedTotal() {
  const { range, preview } = useTile()
  const { points, t, before } = useSignIns(range)
  const d = change(t.blocked, before.blocked)
  return (
    <Stat
      value={<Count value={t.blocked} />}
      chip={<Trend change={d} good="down" />}
      line={beforeLine(d >= 0, range)}
      up={d >= 0}
      caption={`${pct(t.all ? t.blocked / t.all : 0, 1)} of all sign-ins`}
      spark={<Spark values={points.map((p) => p.blocked)} color="var(--dash-bad)" still={preview} />}
    />
  )
}

export function SuccessRate() {
  const { range, preview } = useTile()
  const { points, t, before } = useSignIns(range)
  const now = t.all ? (t.all - t.blocked) / t.all : 0
  const was = before.all ? (before.all - before.blocked) / before.all : 0
  const d = now - was
  return (
    <Stat
      value={
        <>
          {(now * 100).toFixed(1)}
          <small>%</small>
        </>
      }
      chip={<Trend change={d} good="up" points />}
      line={beforeLine(d >= 0, range)}
      up={d >= 0}
      caption="Let in, with or without MFA"
      spark={<Spark values={points.map((p) => (p.allowed + p.mfa) / Math.max(1, p.allowed + p.mfa + p.blocked))} still={preview} />}
    />
  )
}

export function MfaCoverage() {
  const { preview } = useTile()
  const last = MFA.trend.length - 1
  const without = Math.round(LICENSE.users.used * (1 - MFA.enrolled))
  return (
    <Stat
      value={
        <>
          <Count value={Math.round(MFA.enrolled * 100)} />
          <small>%</small>
        </>
      }
      chip={<Trend change={MFA.trend[last] - MFA.trend[last - 1]} good="up" points />}
      line={`Up ${Math.round((MFA.trend[last] - MFA.trend[0]) * 100)} points in 8 weeks`}
      up
      caption={`${fmt(without)} users have no second method`}
      spark={<Spark values={MFA.trend} still={preview} />}
    />
  )
}

export function ActivePolicies() {
  const f = usePolicyFacts()
  return (
    <Stat
      value={<Count value={f.live.length} />}
      line={`Deciding for ${f.covered.size} ${f.covered.size === 1 ? 'app' : 'apps'}`}
      caption={`Of ${f.mine.length} sign-in ${f.mine.length === 1 ? 'policy' : 'policies'}`}
    />
  )
}

/* ---- posture ---------------------------------------------------------------- */

export function Phishing() {
  const { preview } = useTile()
  const last = PHISHING.trend.length - 1
  return (
    <>
      <Head caption="Passkeys and hardware tokens" />
      <div className="bdw-body bdw-gaugebox">
        <Gauge value={PHISHING.share} target={PHISHING.target} label={`${pct(PHISHING.share)} of sign-ins are phishing-resistant, against a target of ${pct(PHISHING.target)}`} still={preview}>
          <b>{pct(PHISHING.share)}</b>
          <span>of sign-ins</span>
        </Gauge>
        <p className="bdw-foot">
          <span>
            <Target size={14} strokeWidth={2} aria-hidden />
            Target {pct(PHISHING.target)}
          </span>
          <Trend change={PHISHING.trend[last] - PHISHING.trend[0]} good="up" points />
        </p>
      </div>
    </>
  )
}

export function Coverage() {
  const store = useBrand()
  const f = usePolicyFacts()
  const parts: Part[] = [
    { key: 'on', label: 'Active policy', value: f.covered.size, color: RAMP[0] },
    { key: 'wait', label: 'Policy not active', value: f.waiting.length, color: RAMP[2] },
    { key: 'none', label: 'No policy', value: f.bare.length, color: RAMP[4] },
  ]
  return (
    <>
      <Head caption={`${store.apps.length} apps`} />
      <div className="bdw-body bdw-catbox">
        <CategoryBar parts={parts} label="Policy coverage" />
        <Legend parts={parts} as="count" columns />
      </div>
    </>
  )
}

export function AppsWithout() {
  const store = useBrand()
  const { preview } = useTile()
  const f = usePolicyFacts()
  const gaps = [...f.bare, ...f.waiting]
  return (
    <>
      <Head caption={gaps.length ? `${gaps.length} of ${store.apps.length} apps` : undefined} />
      <div className="bdw-body">
        {gaps.length === 0 ? (
          <Clear>Every app has an active policy</Clear>
        ) : (
          <Fit items={gaps} pitch={52}>
            {(a) => (
              <Row
                key={a.id}
                lead={<AppLogo appId={a.id} name={a.name} size={28} />}
                title={a.name}
                sub={f.waiting.includes(a) ? 'Policy not active' : a.protocol}
                trail={
                  !preview && (
                    <Button size="sm" variant="link" onClick={() => store.go({ name: 'application', appId: a.id, tab: 'policies' })}>
                      Add policy
                    </Button>
                  )
                }
              />
            )}
          </Fit>
        )}
      </div>
      <More onClick={() => store.go({ name: 'applications' })}>Apps</More>
    </>
  )
}

export function Health() {
  const store = useBrand()
  const { preview } = useTile()
  const f = usePolicyFacts()
  const perApp = new Map<string, number>()
  for (const p of f.live) for (const a of p.appIds) perApp.set(a, (perApp.get(a) ?? 0) + 1)
  const overlaps = [...perApp.values()].filter((n) => n > 1).length
  const policies = () => store.go({ name: 'policies' })
  const checks = [
    { n: f.drafts.length, one: 'draft not finished', many: 'drafts not finished', ok: 'No drafts waiting', fix: 'Finish', go: () => (f.drafts.length === 1 ? store.go({ name: 'board', policyId: f.drafts[0].id }) : policies()) },
    { n: f.inactive.length, one: 'policy inactive', many: 'policies inactive', ok: 'No inactive policies', fix: 'Review', go: policies },
    { n: f.watching.length, one: 'policy only monitoring', many: 'policies only monitoring', ok: 'No policy only monitoring', fix: 'Review', go: policies },
    { n: overlaps, one: 'app with two active policies', many: 'apps with two active policies', ok: 'No app has two active policies', fix: 'Fix', go: () => store.go({ name: 'applications' }) },
  ]
  /* What needs a look first, then what passed: a health check says both. */
  const items = [...checks.filter((c) => c.n > 0), ...checks.filter((c) => c.n === 0)]
  const open = checks.filter((c) => c.n > 0).length
  return (
    <>
      <Head caption={open ? `${open} of ${checks.length} checks need a look` : 'Every check passed'} />
      <div className="bdw-body">
        <Fit items={items} pitch={52}>
          {(i) =>
            i.n > 0 ? (
              <Row
                key={i.one}
                lead={<b className="bdw-num">{i.n}</b>}
                title={i.n === 1 ? i.one : i.many}
                trail={
                  !preview && (
                    <Button size="sm" variant="neutral" onClick={i.go}>
                      {i.fix}
                    </Button>
                  )
                }
              />
            ) : (
              <Row key={i.one} lead={<Mark icon={Check} tone="good" />} title={<span className="bdw-passed">{i.ok}</span>} />
            )
          }
        </Fit>
      </div>
    </>
  )
}

export function Expiring() {
  const store = useBrand()
  const items = useMemo(
    () =>
      [...EXPIRING.map((e) => ({ ...e, where: e.app == null ? 'Your tenant' : (pickAt(store.apps, e.app)?.name ?? 'An app') })), { what: 'License', where: LICENSE.plan, days: daysLeft(NOW, LICENSE.renews) }].sort(
        (a, b) => a.days - b.days,
      ),
    [store.apps],
  )
  return (
    <>
      <Head caption="By days left" />
      <div className="bdw-body">
        <Fit items={items} pitch={52}>
          {(e) => (
            <Row
              key={`${e.what}${e.where}`}
              lead={<Mark icon={e.what === 'License' ? ShieldCheck : e.what.startsWith('Domain') ? Globe : KeyRound} tone={e.days <= 14 ? 'bad' : e.days <= 30 ? 'warn' : 'plain'} />}
              title={e.what}
              sub={e.where}
              trail={<Badge tone={e.days <= 14 ? 'negative' : e.days <= 30 ? 'notice' : 'neutral'}>{e.days} days</Badge>}
            />
          )}
        </Fit>
      </div>
    </>
  )
}

export function RiskyUsers() {
  const store = useBrand()
  const { range } = useTile()
  const { t } = useSignIns(range)
  const people = MOST_BLOCKED.flatMap((m) => {
    const who = personAt(store.users, m.person)
    return who ? [{ ...m, who, count: Math.max(1, Math.round(t.blocked * m.share)) }] : []
  })
  return (
    <>
      <Head caption={rangeCaption(range, 'Blocked sign-ins')} />
      <div className="bdw-body">
        <Fit items={people} pitch={52}>
          {(p) => <Row key={p.who.id} lead={<Face kind="user" name={p.who.name} decorative />} title={p.who.name} sub={DENY_REASON_WORD[p.reason]} trail={<b className="bdw-num">{fmt(p.count)}</b>} />}
        </Fit>
      </div>
      {!HIDE_CHECKS && <More onClick={() => store.go({ name: 'sign-in-activity', view: 'sign-ins' })}>Sign-in activity</More>}
    </>
  )
}

/* ---- sign-ins over time ------------------------------------------------------- */

const SERIES_FILTER: { value: 'all' | SeriesKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'mfa', label: 'Asked for MFA' },
  { value: 'blocked', label: 'Blocked' },
]

export function SignIns() {
  const ctx = useTile()
  const { range, preview, tile } = ctx
  const { points } = useSignIns(range)
  const pick = pickOf(ctx, ['all', 'allowed', 'mfa', 'blocked'] as const)
  const shown = SERIES_KEYS.filter((k) => pick === 'all' || k === pick)
  /* Drawn from the foot up: blocked is a thin red band along the axis, and the chart's outline is ink. */
  const series: Series[] = [...shown].reverse().map((k) => ({ key: k, label: SERIES_WORD[k], color: SERIES_COLOR[k], values: points.map((p) => p[k]) }))
  const axis = timeAxis(points, range)
  const Chart = viewOf(tile)?.id === 'bars' ? BarChart : WaveChart
  return (
    <>
      <Head caption={rangeCaption(range, 'Sign-ins')}>
        <Filter label="Sign-ins shown" value={pick} options={SERIES_FILTER} />
      </Head>
      <div className="bdw-body bdw-chartbox">
        {/* With one series picked, the filter already names it (dashboardPolish): the key is for telling colours apart. */}
        {!(POLISH && shown.length === 1) && (
          <ul className="bdw-keys" aria-hidden>
            {shown.map((k) => (
              <li key={k}>
                <i style={{ background: SERIES_COLOR[k] }} />
                {SERIES_WORD[k]}
              </li>
            ))}
          </ul>
        )}
        <Chart key={`${pick}${range}`} series={series} labels={axis.labels} ticks={axis.ticks} still={preview} />
      </div>
    </>
  )
}

const LONG_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const hourWord = (h: number) => `${String(h).padStart(2, '0')}:00`

export function Heatmap() {
  const week = useMemo(typicalWeek, [])
  const [at, setAt] = useState<{ row: number; col: number } | null>(null)
  const top = useMemo(() => {
    let best = { row: 0, col: 0 }
    for (let row = 0; row < week.length; row++) {
      for (let col = 0; col < week[row].length; col++) if (week[row][col] > week[best.row][best.col]) best = { row, col }
    }
    return best
  }, [week])
  return (
    <>
      <Head caption={at ? `${LONG_DAY[at.row]} at ${hourWord(at.col)}: about ${fmt(week[at.row][at.col])} sign-ins` : `Busiest on ${LONG_DAY[top.row]} at ${hourWord(top.col)}`} />
      <div className="bdw-body bdw-heatbox">
        <HeatGrid cells={week} rowLabels={WEEKDAYS} colLabel={hourWord} onPoint={setAt} />
        <p className="bdw-scale" aria-hidden>
          Fewer
          <span className="bdc-heat__key">
            <i className="is-l0" />
            <i className="is-l1" />
            <i className="is-l2" />
            <i className="is-l3" />
            <i className="is-l4" />
          </span>
          More
        </p>
      </div>
    </>
  )
}

/* ---- breakdowns ----------------------------------------------------------------- */

export function Blocked() {
  const store = useBrand()
  const { range, tile, preview } = useTile()
  const { t } = useSignIns(range)
  const counts = split(t.blocked, REASON_SHARES.map((r) => r.share))
  const open = () => store.go({ name: 'sign-in-activity', view: 'sign-ins' })
  const donut = viewOf(tile)?.id === 'donut'
  const parts: Part[] = REASON_SHARES.map((r, i) => ({ key: r.reason, label: DENY_REASON_WORD[r.reason], value: counts[i], color: RAMP[i] }))
  return (
    <>
      <Head caption={rangeCaption(range, 'Reasons')} />
      {donut ? (
        <div className="bdw-body bdw-donutbox">
          <Donut parts={parts} caption="Blocked" still={preview} />
          <Legend parts={parts} fit />
        </div>
      ) : (
        <div className="bdw-body">
          <BarList tone="bad" items={parts.map((p) => ({ key: p.key, label: p.label, value: p.value, onClick: preview || HIDE_CHECKS ? undefined : open }))} />
        </div>
      )}
      {!HIDE_CHECKS && <More onClick={open}>Sign-in activity</More>}
    </>
  )
}

export function TopApps() {
  const store = useBrand()
  const { range, tile, preview } = useTile()
  const { t } = useSignIns(range)
  const apps = store.apps.slice(0, APP_SHARES.length).map((a, i) => ({ app: a, count: Math.round(t.all * APP_SHARES[i]), share: APP_SHARES[i] }))
  const open = (id: string) => (preview ? undefined : () => store.go({ name: 'application', appId: id }))
  return (
    <>
      <Head caption={rangeCaption(range, 'Sign-ins')} />
      <div className="bdw-body">
        {viewOf(tile)?.id === 'grid' ? (
          <ul className="bdw-appgrid">
            {apps.map((a) => (
              <li key={a.app.id}>
                <button type="button" onClick={open(a.app.id)}>
                  <AppLogo appId={a.app.id} name={a.app.name} size={28} />
                  <span>{a.app.name}</span>
                  <b>{fmt(a.count)}</b>
                  <em>{pct(a.share)}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <BarList items={apps.map((a) => ({ key: a.app.id, label: a.app.name, value: a.count, lead: <AppLogo appId={a.app.id} name={a.app.name} size={18} />, onClick: open(a.app.id) }))} />
        )}
      </div>
      <More onClick={() => store.go({ name: 'applications' })}>Apps</More>
    </>
  )
}

export function Funnel() {
  const { range, preview } = useTile()
  const { t } = useSignIns(range)
  const steps = funnel(t)
  const start = steps[0].value || 1
  return (
    <>
      <Head caption={rangeCaption(range, 'Sign-ins started')} />
      <div className="bdw-body">
        <ol className="bdw-funnel">
          {steps.map((s, i) => {
            const lost = i === 0 ? 0 : steps[i - 1].value - s.value
            return (
              <li key={s.label}>
                <span className="bdw-funnel__top">
                  <span>{s.label}</span>
                  <b>{fmt(s.value)}</b>
                </span>
                <span className="bdw-funnel__bar" style={{ ['--share' as string]: s.value / start }} aria-hidden>
                  <i className={preview ? 'is-still' : ''} />
                </span>
                {i > 0 && <span className="bdw-funnel__lost">{lost > 0 ? `${fmt(lost)} stopped here` : 'None stopped here'}</span>}
              </li>
            )
          })}
        </ol>
      </div>
    </>
  )
}

export function Methods() {
  const { range, tile, preview } = useTile()
  const { t } = useSignIns(range)
  const counts = split(t.mfa, METHODS.map((m) => m.share))
  const parts: Part[] = METHODS.map((m, i) => ({ key: m.name, label: m.name, value: counts[i], color: RAMP[i] }))
  return (
    <>
      <Head caption={rangeCaption(range, 'Second methods used')} />
      {viewOf(tile)?.id === 'bars' ? (
        <div className="bdw-body">
          <BarList items={parts.map((p) => ({ key: p.key, label: p.label, value: p.value }))} />
        </div>
      ) : (
        <div className="bdw-body bdw-donutbox">
          <Donut parts={parts} caption="With MFA" still={preview} />
          <Legend parts={parts} fit />
        </div>
      )}
    </>
  )
}

const CHANNEL_FILTER: { value: 'all' | ChannelId; label: string }[] = [{ value: 'all', label: 'All' }, ...CHANNELS.map((c) => ({ value: c.id, label: c.label }))]

export function MfaDelivery() {
  const ctx = useTile()
  const { range, preview } = ctx
  const pick = pickOf(ctx, ['all', 'sms', 'email', 'push'] as const)
  const points = useMemo(() => delivery(range, pick, NOW), [range, pick])
  const sent = points.reduce((s, p) => s + p.delivered + p.failed, 0)
  const failed = points.reduce((s, p) => s + p.failed, 0)
  const axis = timeAxis(points, range)
  const series: Series[] = [
    { key: 'delivered', label: 'Delivered', color: 'var(--dash-s1)', values: points.map((p) => p.delivered) },
    { key: 'failed', label: 'Failed', color: 'var(--dash-bad)', values: points.map((p) => p.failed) },
  ]
  return (
    <>
      <Head caption={figureCaption(range, `${pct(sent ? failed / sent : 0, 1)} failed`)}>
        <Filter label="Channel" value={pick} options={CHANNEL_FILTER} />
      </Head>
      <div className="bdw-body bdw-chartbox">
        <BarChart key={`${pick}${range}`} series={series} labels={axis.labels} ticks={axis.ticks} still={preview} />
      </div>
    </>
  )
}

export function Locations() {
  const { range } = useTile()
  const { t } = useSignIns(range)
  const counts = split(t.all, PLACES.map((p) => p.share))
  return (
    <>
      <Head caption={rangeCaption(range, 'Sign-ins')} />
      <div className="bdw-body">
        <BarList items={PLACES.map((p, i) => ({ key: p.place, label: p.place, value: counts[i], hint: `${pct(p.blocked, 1)} blocked` }))} />
      </div>
    </>
  )
}

export function RiskSignals() {
  const { range } = useTile()
  const { t } = useSignIns(range)
  const counts = split(Math.round((t.mfa + t.blocked) * 0.6), RISK_SIGNALS.map((r) => r.share))
  return (
    <>
      <Head caption={rangeCaption(range, 'Raised')} />
      <div className="bdw-body">
        <BarList items={RISK_SIGNALS.map((r, i) => ({ key: r.name, label: r.name, value: counts[i] }))} />
      </div>
    </>
  )
}

/* ---- the table ----------------------------------------------------------------------- */

const RESULT_FILTER: { value: 'all' | 'allowed' | 'blocked'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'blocked', label: 'Blocked' },
]

export function RecentSignIns() {
  const store = useBrand()
  const ctx = useTile()
  const rows = useActivity()
  const pick = pickOf(ctx, ['all', 'allowed', 'blocked'] as const)
  const shown = rows.filter((r) => pick === 'all' || r.result === pick)
  return (
    <>
      <Head caption="Who signed in to what, and what decided it">
        <Filter label="Result" value={pick} options={RESULT_FILTER} />
      </Head>
      <div className="bdw-body is-flush">
        <Table
          label="Recent sign-ins"
          columns={[
            { key: 'who', label: 'Person', grow: 1.2 },
            { key: 'app', label: 'App', grow: 1.2 },
            { key: 'from', label: 'From', grow: 1 },
            { key: 'result', label: 'Result', grow: 0.7 },
            { key: 'by', label: 'Decided by', grow: 2.6 },
            { key: 'when', label: 'When', grow: 0.7, end: true },
          ]}
          rows={shown.map((r) => ({
            key: r.id,
            cells: [
              <span className="bdw-cell" key="who">
                <Face kind="user" name={r.who} size="sm" decorative />
                <span>{r.who}</span>
              </span>,
              <span className="bdw-cell" key="app">
                <AppLogo appId={r.appId} name={r.app} size={18} />
                <span>{r.app}</span>
              </span>,
              <span className="bdw-cell is-quiet" key="from">
                <span>{r.from}</span>
              </span>,
              <Badge key="result" tone={r.result === 'allowed' ? 'positive' : r.result === 'blocked' ? 'negative' : 'neutral'}>
                {r.result === 'allowed' ? 'Allowed' : r.result === 'blocked' ? 'Blocked' : CANT_TELL}
              </Badge>,
              <span className="bdw-cell" key="by">
                <span>{r.policyName ?? 'No policy'}</span>
                {r.ruleLine && <em>{r.ruleLine}</em>}
              </span>,
              <span key="when">{r.when}</span>,
            ],
          }))}
        />
      </div>
      {!HIDE_CHECKS && <More onClick={() => store.go({ name: 'sign-in-activity', view: 'sign-ins' })}>Sign-in activity</More>}
    </>
  )
}
