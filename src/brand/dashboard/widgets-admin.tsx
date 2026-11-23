import { useState } from 'react'
import {
  AppWindow,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock,
  FilePlus2,
  KeyRound,
  MapPin,
  MonitorSmartphone,
  ScanSearch,
  Shapes,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, DecisionChip, IconButton } from '../kit'
import { Picker } from '../picker'
import { Face } from '../faces'
import { AppLogo } from '../logos/AppLogo'
import { blankPolicy } from '../data'
import { newPolicy } from '../policy-draft'
import { useNewPolicy } from '../create/use-new-policy'
import { daysLeft, deadlineNow } from '../migrate/legacy'
import { useSimEnv } from '../screens/sim-env'
import { resolveSignIn, type TenantResolution } from '../screens/tenant-resolver'
import { useBrand, type BrandScreen } from '../store'
import { BarChart, CategoryBar, Meter, Tracker, WaveChart, type Part, type Series } from './charts'
import { RAMP, figureCaption, fmt, pct, useMigrationOpen } from './format'
import { viewOf } from './model'
import { ADMIN_ACTIVITY, CONNECTIONS, DORMANT, LICENSE, REQUESTS, SYNCS, agoWord, answer, registrations, useAnswered } from './seed'
import { NOW, personAt, pickAt, timeAxis, useActivity, usePolicyFacts } from './sources'
import { HIDE_CHECKS } from '../tester'
import { useTile } from './tile-context'
import { BarList, Clear, Count, Fit, Head, Legend, Mark, More, Row, Table } from './widget-kit'

/* -----------------------------------------------------------------------------
   Policies, people and the console itself: the move from the old policies,
   what changed, which rules do the work, who is waiting, and how the
   tenant's connections and limits stand.
   -------------------------------------------------------------------------- */

/* ---- policies ---------------------------------------------------------------- */

export function Migration() {
  const store = useBrand()
  const { preview } = useTile()
  const { left, staged } = useMigrationOpen()
  const total = store.legacy.policies.length
  const moved = Math.max(0, total - left - staged)
  const days = daysLeft(deadlineNow(store.deadlineView))
  if (total === 0 || (left === 0 && staged === 0))
    return (
      <div className="bdw-strip">
        <Clear>Every old policy has moved</Clear>
      </div>
    )
  const parts: Part[] = [
    { key: 'moved', label: 'Moved', value: moved, color: 'var(--dash-good)' },
    { key: 'staged', label: 'In review', value: staged, color: 'var(--dash-s2)' },
    { key: 'left', label: 'Not moved', value: left, color: 'var(--dash-q2)' },
  ]
  return (
    <div className="bdw-strip">
      <Mark icon={ArrowRightLeft} tone="info" />
      <div className="bdw-strip__text">
        <h2 className="bdw-title">Migration</h2>
        <p className="bdw-caption">
          <b>{days} days</b> until the old policies stop working
        </p>
      </div>
      <div className="bdw-strip__parts">
        <CategoryBar parts={parts} label="Old policies" />
        <Legend parts={parts} as="count" columns />
      </div>
      {!preview && (
        <Button variant="neutral" iconRight={ArrowRight} onClick={() => store.go(left > 0 ? { name: 'move-policies' } : { name: 'policies', sub: 'moved' })}>
          {left > 0 ? 'Continue' : 'Review'}
        </Button>
      )}
    </div>
  )
}

function when(iso: string) {
  const ms = NOW.getTime() - new Date(iso).getTime()
  return Number.isFinite(ms) ? agoWord(Math.max(1, ms / 60_000)) : ''
}

export function Changes() {
  const store = useBrand()
  const log = [...store.changeLog].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <>
      <Head caption="Who changed what" />
      <div className="bdw-body">
        {log.length === 0 ? (
          <Clear>No changes yet</Clear>
        ) : (
          <Fit items={log} pitch={52}>
            {(c) => <Row key={c.id} lead={<Face kind="user" name={c.by} decorative />} title={c.policyName} sub={c.lines[0] ?? 'Changed'} trail={<time dateTime={c.at}>{when(c.at)}</time>} />}
          </Fit>
        )}
      </div>
      {!HIDE_CHECKS && <More onClick={() => store.go({ name: 'sign-in-activity', view: 'changes' })}>All changes</More>}
    </>
  )
}

export function TopRules() {
  const store = useBrand()
  const { preview } = useTile()
  const rows = useActivity()
  const sum = new Map<string, { key: string; label: string; hint: string; value: number; policyId: string }>()
  for (const r of rows) {
    if (!r.policyId || !r.policyName) continue
    const key = `${r.policyId}|${r.ruleKey ?? ''}`
    const at = sum.get(key)
    if (at) at.value += r.weight
    else sum.set(key, { key, label: r.ruleLine || 'No rule matched', hint: r.policyName, value: r.weight, policyId: r.policyId })
  }
  const items = [...sum.values()].sort((a, b) => b.value - a.value)
  return (
    <>
      <Head caption="Sign-ins each rule ended this week" />
      <div className="bdw-body">
        {items.length === 0 ? (
          <Clear>No rule has decided a sign-in yet</Clear>
        ) : (
          <BarList items={items.map((i) => ({ key: i.key, label: i.label, hint: i.hint, value: i.value, onClick: preview ? undefined : () => store.go({ name: 'board', policyId: i.policyId }) }))} />
        )}
      </div>
      <More onClick={() => store.go({ name: 'policies' })}>Policies</More>
    </>
  )
}

export function CheckAccess() {
  const store = useBrand()
  const { preview } = useTile()
  const env = useSimEnv()
  const [person, setPerson] = useState<string | null>(store.users[0]?.id ?? null)
  const [app, setApp] = useState<string | null>(store.apps[0]?.id ?? null)
  const [result, setResult] = useState<{ for: string; r: TenantResolution } | null>(null)
  const key = `${person}|${app}`
  const run = () => {
    if (!person || !app) return
    setResult({ for: key, r: resolveSignIn(store.policies, { appId: app, personId: person }, env) })
  }
  const r = result?.r
  return (
    <>
      <Head caption="What a sign-in gets" />
      <div className="bdw-body bdw-check">
        <Picker label="Person" prefix="Person" width="fill" size="md" value={person} searchable options={store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email }))} onChange={setPerson} disabled={preview} />
        <Picker label="App" prefix="App" width="fill" size="md" value={app} searchable options={store.apps.map((a) => ({ value: a.id, label: a.name }))} onChange={setApp} disabled={preview} />
        <div className="bdw-check__run">
          <Button variant="neutral" icon={ScanSearch} onClick={run} disabled={preview}>
            Run
          </Button>
          <span className="bdw-check__out" aria-live="polite">
            {!r ? (
              <span className="bdw-quiet">Not run</span>
            ) : result.for !== key ? (
              <span className="bdw-quiet">Changes not run yet</span>
            ) : r.status === 'decided' && r.decision ? (
              <>
                <DecisionChip decision={r.decision} />
                <span className="bdw-quiet">by {r.decidedBy?.policyName}</span>
              </>
            ) : (
              <span className="bdw-quiet">{r.status === 'depends' ? 'Depends on where and how they sign in' : 'No policy decides this sign-in'}</span>
            )}
          </span>
        </div>
      </div>
      {!HIDE_CHECKS && <More onClick={() => store.go({ name: 'sign-in-tests' })}>Access checks</More>}
    </>
  )
}

/** A few counts side by side, each one a way into its page. */
function Cells({ cells }: { cells: { key: string; label: string; value: number; icon: LucideIcon; to: BrandScreen }[] }) {
  const store = useBrand()
  const { preview } = useTile()
  return (
    <ul className="bdw-cells">
      {cells.map((c) => (
        <li key={c.key}>
          <button type="button" onClick={preview ? undefined : () => store.go(c.to)}>
            <Mark icon={c.icon} />
            <b>
              <Count value={c.value} />
            </b>
            <span>{c.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function Blocks() {
  const store = useBrand()
  return (
    <>
      <Head caption="What your rules are built from" />
      <div className="bdw-body">
        <Cells
          cells={[
            { key: 'zones', label: 'Zones', value: store.zones.length, icon: MapPin, to: { name: 'zones' } },
            { key: 'devices', label: 'Device profiles', value: store.fingerprints.length, icon: MonitorSmartphone, to: { name: 'fingerprint' } },
            { key: 'methods', label: 'Methods in use', value: store.methods.filter((m) => m.active).length, icon: KeyRound, to: { name: 'methods' } },
            { key: 'hooks', label: 'External hooks', value: store.hooks.length, icon: Webhook, to: { name: 'hooks' } },
          ]}
        />
      </div>
    </>
  )
}

/* ---- people -------------------------------------------------------------------- */

export function Directory() {
  const store = useBrand()
  const f = usePolicyFacts()
  return (
    <>
      <Head caption="Your tenant, counted" />
      <div className="bdw-body">
        <Cells
          cells={[
            { key: 'users', label: 'Users', value: store.users.length, icon: Users, to: { name: 'users' } },
            { key: 'groups', label: 'Groups', value: store.groups.length, icon: UsersRound, to: { name: 'groups' } },
            { key: 'apps', label: 'Apps', value: store.apps.length, icon: AppWindow, to: { name: 'applications' } },
            { key: 'policies', label: 'Sign-in policies', value: f.mine.length, icon: ShieldCheck, to: { name: 'policies' } },
          ]}
        />
      </div>
    </>
  )
}

export function UserTypes() {
  const store = useBrand()
  const count = (type: string) => store.users.filter((u) => u.userType === type).length
  const parts: Part[] = [
    { key: 'Employee', label: 'Employees', value: count('Employee'), color: RAMP[0] },
    { key: 'Contractor', label: 'Contractors', value: count('Contractor'), color: RAMP[2] },
    { key: 'Partner', label: 'Partners', value: count('Partner'), color: RAMP[4] },
  ]
  return (
    <>
      <Head caption={`${store.users.length} users`} />
      <div className="bdw-body bdw-catbox">
        <CategoryBar parts={parts} label="Users by type" />
        <Legend parts={parts} as="count" columns />
      </div>
    </>
  )
}

export function Registrations() {
  const { range, tile, preview } = useTile()
  const points = registrations(range, NOW)
  const axis = timeAxis(points, range)
  const series: Series[] = [{ key: 'new', label: 'New users', color: 'var(--dash-s1)', values: points.map((p) => p.count) }]
  const Chart = viewOf(tile)?.id === 'area' ? WaveChart : BarChart
  return (
    <>
      <Head caption={figureCaption(range, `${fmt(points.reduce((s, p) => s + p.count, 0))} added`)} />
      <div className="bdw-body bdw-chartbox">
        <Chart key={range} series={series} labels={axis.labels} ticks={axis.ticks} still={preview} />
      </div>
    </>
  )
}

export function Dormant() {
  const store = useBrand()
  const people = DORMANT.flatMap((d) => {
    const who = personAt(store.users, d.person)
    return who ? [{ ...d, who }] : []
  })
  return (
    <>
      <Head caption="No sign-in for 60 days or more" />
      <div className="bdw-body">
        <Fit items={people} pitch={52}>
          {(p) => <Row key={p.who.id} lead={<Face kind="user" name={p.who.name} decorative />} title={p.who.name} sub={p.who.email} trail={<Badge tone={p.days > 90 ? 'notice' : 'neutral'}>{p.days} days</Badge>} />}
        </Fit>
      </div>
      <More onClick={() => store.go({ name: 'users' })}>Users</More>
    </>
  )
}

export function Approvals() {
  const store = useBrand()
  const { preview } = useTile()
  const answered = useAnswered()
  const open = REQUESTS.filter((r) => !answered[r.id]).flatMap((r) => {
    const who = personAt(store.users, r.person)
    const app = pickAt(store.apps, r.app)
    return who && app ? [{ ...r, who, app }] : []
  })
  const decide = (id: string, a: 'approved' | 'rejected', name: string, app: string) => {
    answer(id, a)
    store.showToast(a === 'approved' ? `${name} can use ${app}` : `Request from ${name} rejected`, { label: 'Undo', run: () => answer(id, null) })
  }
  return (
    <>
      <Head caption={open.length ? 'App access requests' : undefined} />
      <div className="bdw-body">
        {open.length === 0 ? (
          <Clear>No requests waiting</Clear>
        ) : (
          <Fit items={open} pitch={52}>
            {(r) => (
              <Row
                key={r.id}
                lead={<Face kind="user" name={r.who.name} decorative />}
                title={r.who.name}
                sub={`${r.app.name} · ${agoWord(r.ago)}`}
                trail={
                  !preview && (
                    <span className="bdw-pair">
                      <IconButton icon={Check} label={`Approve ${r.who.name} for ${r.app.name}`} size="sm" onClick={() => decide(r.id, 'approved', r.who.name, r.app.name)} />
                      <IconButton icon={X} label={`Reject ${r.who.name} for ${r.app.name}`} size="sm" tone="ghost" onClick={() => decide(r.id, 'rejected', r.who.name, r.app.name)} />
                    </span>
                  )
                }
              />
            )}
          </Fit>
        )}
      </div>
    </>
  )
}

export function Provisioning() {
  const store = useBrand()
  const rows = SYNCS.flatMap((s) => {
    const app = pickAt(store.apps, s.app)
    return app ? [{ ...s, app }] : []
  })
  return (
    <>
      <Head caption="The last sync to each app" />
      <div className="bdw-body is-flush">
        <Table
          label="Provisioning"
          columns={[
            { key: 'app', label: 'App', grow: 1.8 },
            { key: 'last', label: 'Last sync', grow: 1 },
            { key: 'created', label: 'Created', grow: 0.7, end: true },
            { key: 'updated', label: 'Updated', grow: 0.7, end: true },
            { key: 'failed', label: 'Failed', grow: 0.7, end: true },
          ]}
          rows={rows.map((r) => ({
            key: r.app.id,
            cells: [
              <span className="bdw-cell" key="app">
                <AppLogo appId={r.app.id} name={r.app.name} size={18} />
                <span>{r.app.name}</span>
              </span>,
              <span key="last">{agoWord(r.ago)}</span>,
              <span key="created">{fmt(r.created)}</span>,
              <span key="updated">{fmt(r.updated)}</span>,
              r.failed > 0 ? (
                <Badge key="failed" tone="negative">
                  {fmt(r.failed)}
                </Badge>
              ) : (
                <span key="failed">0</span>
              ),
            ],
          }))}
        />
      </div>
    </>
  )
}

export function Groups() {
  const store = useBrand()
  const { preview } = useTile()
  const groups = [...store.groups].sort((a, b) => b.memberCount - a.memberCount)
  return (
    <>
      <Head caption="By members" />
      <div className="bdw-body">
        <BarList items={groups.map((g) => ({ key: g.id, label: g.name, value: g.memberCount, onClick: preview ? undefined : () => store.go({ name: 'groups', groupId: g.id }) }))} />
      </div>
      <More onClick={() => store.go({ name: 'groups' })}>Groups</More>
    </>
  )
}

/* ---- the console ------------------------------------------------------------------ */

export function AdminActivity() {
  const store = useBrand()
  const rows = ADMIN_ACTIVITY.flatMap((a, i) => {
    const who = personAt(store.users, a.person)
    return who ? [{ ...a, who, key: String(i) }] : []
  })
  return (
    <>
      <Head caption="In the console, newest first" />
      <div className="bdw-body">
        <Fit items={rows} pitch={52}>
          {(a) => <Row key={a.key} lead={<Face kind="user" name={a.who.name} decorative />} title={a.what} sub={a.who.name} trail={<time>{agoWord(a.ago)}</time>} />}
        </Fit>
      </div>
    </>
  )
}

export function Connections() {
  return (
    <>
      <Head caption="The last 30 days" />
      <div className="bdw-body">
        <Fit items={CONNECTIONS} pitch={62} className="bdw-conns">
          {(c) => {
            const ok = c.days.filter((d) => d === 'ok').length
            const today = c.days[c.days.length - 1]
            return (
              <li key={c.name} className="bdw-conn">
                <span className="bdw-conn__top">
                  <b>{c.name}</b>
                  <span>{c.type}</span>
                  {today !== 'ok' && <Badge tone={today === 'down' ? 'negative' : 'notice'}>{today === 'down' ? 'Down' : 'Slow'}</Badge>}
                  <em>{pct(ok / c.days.length, 1)}</em>
                </span>
                <Tracker days={c.days} label={`${c.name}: ran well on ${ok} of ${c.days.length} days`} />
              </li>
            )
          }}
        </Fit>
      </div>
    </>
  )
}

export function License() {
  const { preview } = useTile()
  const [y, m, d] = LICENSE.renews.split('-').map(Number)
  const renews = new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const lines = [
    { key: 'users', label: 'Users', now: LICENSE.users.used, limit: LICENSE.users.limit, used: LICENSE.users.used / LICENSE.users.limit },
    { key: 'sms', label: 'SMS credits left', now: LICENSE.sms.left, limit: LICENSE.sms.limit, used: 1 - LICENSE.sms.left / LICENSE.sms.limit },
    { key: 'email', label: 'Email credits left', now: LICENSE.email.left, limit: LICENSE.email.limit, used: 1 - LICENSE.email.left / LICENSE.email.limit },
  ]
  return (
    <div className="bdw-license">
      <div className="bdw-license__head">
        <h2 className="bdw-title">License</h2>
        <p className="bdw-caption">
          <Clock size={14} strokeWidth={2} aria-hidden />
          {LICENSE.plan}, renews {renews}
        </p>
      </div>
      <ul className="bdw-license__lines">
        {lines.map((l) => (
          <li key={l.key}>
            <span className="bdw-license__row">
              <span>{l.label}</span>
              <span>
                <b>{fmt(l.now)}</b> of {fmt(l.limit)}
              </span>
            </span>
            <Meter value={l.used} label={`${l.label}: ${fmt(l.now)} of ${fmt(l.limit)}`} still={preview} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Setup() {
  const store = useBrand()
  const { preview } = useTile()
  const f = usePolicyFacts()
  const steps: { key: string; label: string; done: boolean; to?: BrandScreen }[] = [
    { key: 'app', label: 'Add an application', done: store.apps.length > 0, to: { name: 'application-new' } },
    { key: 'users', label: 'Add users', done: store.users.length > 0, to: { name: 'users' } },
    { key: 'groups', label: 'Add groups', done: store.groups.length > 0, to: { name: 'groups' } },
    { key: 'mfa', label: 'Set up a second method', done: store.methods.some((m) => m.active && m.configured), to: { name: 'methods' } },
    { key: 'policy', label: 'Make a sign-in policy active', done: f.live.length > 0, to: { name: 'policies' } },
    ...(HIDE_CHECKS ? [] : [{ key: 'check', label: 'Check access before it decides', done: false, to: { name: 'sign-in-tests' } as BrandScreen }]),
  ]
  const done = steps.filter((s) => s.done).length
  /* What is left comes first: it is the part to act on, and a short tile shows it. */
  const ordered = [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)]
  return (
    <>
      <Head caption={`${done} of ${steps.length} done`} />
      <div className="bdw-body bdw-setup">
        <Meter value={done / steps.length} label={`${done} of ${steps.length} steps done`} tone="good" still={preview} />
        <Fit items={ordered} pitch={44}>
          {(s) => (
            <Row
              key={s.key}
              lead={
                <span className={`bdw-step${s.done ? ' is-done' : ''}`} aria-hidden>
                  {s.done ? <CircleCheck size={18} strokeWidth={2} /> : <Circle size={18} strokeWidth={1.8} />}
                </span>
              }
              title={s.label}
              trail={
                !s.done &&
                s.to &&
                !preview && (
                  <Button size="sm" variant="link" onClick={() => store.go(s.to!)}>
                    Open
                  </Button>
                )
              }
            />
          )}
        </Fit>
      </div>
    </>
  )
}

export function Shortcuts() {
  const store = useBrand()
  const { preview } = useTile()
  const newOne = useNewPolicy()
  const create = () =>
    newOne.ask({
      ways: true,
      onCreate: (name, start) => {
        const id = store.addPolicy(newPolicy(blankPolicy(name, []), start))
        store.go({ name: 'board', policyId: id })
      },
    })
  const rest: { label: string; icon: LucideIcon; to: BrandScreen }[] = [
    { label: 'Add application', icon: AppWindow, to: { name: 'application-new' } },
    { label: 'Add user', icon: UserPlus, to: { name: 'users' } },
    ...(HIDE_CHECKS ? [] : [{ label: 'Check access', icon: ScanSearch, to: { name: 'sign-in-tests' } as BrandScreen }]),
    { label: 'Add zone', icon: MapPin, to: { name: 'zones' } },
    { label: 'Add device profile', icon: MonitorSmartphone, to: { name: 'fingerprint' } },
  ]
  return (
    <>
      <Head />
      <div className="bdw-body bdw-actions">
        {/* The page's one orange button. A picture of the widget (Customize, the gallery) draws it plain. */}
        <Button variant={preview ? 'neutral' : 'brand'} icon={FilePlus2} onClick={preview ? undefined : create} block>
          New policy
        </Button>
        <Fit items={rest} pitch={44}>
          {(s) => (
            <li key={s.label} className="bdw-action">
              <button type="button" onClick={preview ? undefined : () => store.go(s.to)}>
                <s.icon size={16} strokeWidth={1.9} aria-hidden />
                <span>{s.label}</span>
                <ChevronRight size={16} strokeWidth={1.9} aria-hidden />
              </button>
            </li>
          )}
        </Fit>
      </div>
      {newOne.dialog}
    </>
  )
}

export function WhatsNew() {
  const store = useBrand()
  /* The three facts HomeHub's card already gives about the new builder, word for word. */
  const facts: { icon: LucideIcon; line: string }[] = [
    { icon: Shapes, line: 'Zones, device profiles and risk signals, built once and used in any rule' },
    ...(HIDE_CHECKS ? [] : [{ icon: ScanSearch, line: 'Check access shows who gets in, before a policy is on' }]),
    { icon: ShieldCheck, line: 'Moved policies arrive as drafts, so nothing changes until you make them active' },
  ]
  return (
    <>
      <Head caption="The new Policy builder" />
      <div className="bdw-body">
        <Fit items={facts} pitch={48} className="bdw-facts">
          {(f) => (
            <li key={f.line}>
              <f.icon size={16} strokeWidth={1.9} aria-hidden />
              <span>{f.line}</span>
            </li>
          )}
        </Fit>
      </div>
      <More onClick={() => store.openIntro('learn')}>See what’s new</More>
    </>
  )
}
