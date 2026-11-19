import type { CSSProperties, ReactNode } from 'react'
import { Activity, Check, ListChecks, Plus, Settings2, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import { WIDGETS, type Category, type WidgetId } from './catalog'

/* -----------------------------------------------------------------------------
   A widget's picture in Add widgets: a small panel of the widget itself, with
   its own name and believable figures, drawn the way it shows its data
   (owner, 19 Nov 2026: "I want that kind of experience for each and every one
   of the cards", pointing at the policy template store, whose pictures play
   their use on hover: create/CardPicture.tsx).

   At rest the picture is finished. Pointed at, or its card in focus, it plays:
   a line draws, bars grow, a ring sweeps, rows arrive, ticks land. It is CSS
   keyed on the card's hover (dashboard.css, "pictures"), so a grid of forty
   costs nothing until one is pointed at, and reduced motion keeps it still.
   Each part's `--i` is its place in the play.
   -------------------------------------------------------------------------- */

const CAT_ICON: Record<Category, LucideIcon> = { posture: ShieldCheck, activity: Activity, engine: ListChecks, people: Users, admin: Settings2 }

const at = (i: number, more: CSSProperties = {}): CSSProperties => ({ ['--i' as string]: i, ...more })

/* ---- the figures ---- */

const STAT: Partial<Record<WidgetId, { value: string; unit?: string; trend: string; tone: 'good' | 'bad' | 'plain' }>> = {
  'sign-ins-total': { value: '35,003', trend: '−6.9%', tone: 'plain' },
  'blocked-total': { value: '1,486', trend: '+12%', tone: 'bad' },
  'success-rate': { value: '95.8', unit: '%', trend: '+0.4 pts', tone: 'good' },
  mfa: { value: '78', unit: '%', trend: '+1.0 pts', tone: 'good' },
  'active-policies': { value: '6', trend: '8 apps', tone: 'plain' },
}

const BARS: Partial<Record<WidgetId, [string, number][]>> = {
  blocked: [
    ['Network or place', 100],
    ['Device check', 65],
    ['Sign-in risk', 50],
    ['Outside hours', 32],
  ],
  'top-apps': [
    ['Salesforce', 100],
    ['Slack', 76],
    ['Jira', 54],
    ['Zoom', 38],
  ],
  locations: [
    ['India', 100],
    ['United States', 68],
    ['Germany', 36],
    ['Japan', 22],
  ],
  'risk-signals': [
    ['New device', 100],
    ['Unusual place', 62],
    ['Impossible travel', 28],
  ],
  'top-rules': [
    ['Office network', 100],
    ['New device', 58],
    ['Everyone else', 40],
  ],
  groups: [
    ['Engineering', 100],
    ['Sales', 72],
    ['Support', 46],
  ],
}

const LIST: Partial<Record<WidgetId, [string, string][]>> = {
  'apps-without': [
    ['Figma', 'SAML'],
    ['Notion', 'OIDC'],
    ['GitHub', 'SAML'],
  ],
  expiring: [
    ['Contractor access', 'Ends in 3 days'],
    ['Audit week', 'Ends in 6 days'],
    ['Travel exception', 'Ends in 9 days'],
  ],
  'risky-users': [
    ['Ana Ruiz', '14 blocked'],
    ['Dev Patel', '9 blocked'],
    ['Lena Fox', '6 blocked'],
  ],
  dormant: [
    ['Omar Haddad', '92 days'],
    ['Mia Chen', '74 days'],
    ['Leo Brandt', '61 days'],
  ],
  approvals: [
    ['Access to Jira', 'Ana Ruiz'],
    ['Admin role', 'Dev Patel'],
    ['Access to Slack', 'Mia Chen'],
  ],
}

const FEED: Partial<Record<WidgetId, string[]>> = {
  changes: ['Office network rule edited', 'New device rule added', 'Contractors policy made active'],
  'admin-activity': ['Directory synced', 'Application added', 'Admin role given'],
}

const CHECKS: Partial<Record<WidgetId, string[]>> = {
  health: ['Every app has a policy', 'No rule is hidden by another', 'MFA on admin apps'],
  setup: ['Add your applications', 'Connect a directory', 'Turn on a sign-in policy'],
}

const TILES: Partial<Record<WidgetId, [string, string][]>> = {
  blocks: [
    ['Zones', '4'],
    ['Device profiles', '3'],
    ['Risk signals', '6'],
    ['Templates', '9'],
  ],
  directory: [
    ['Users', '812'],
    ['Groups', '24'],
    ['Applications', '34'],
    ['Admins', '6'],
  ],
}

/* ---- the panels, one per way of showing data ---- */

function Stat({ widget }: { widget: WidgetId }) {
  const s = STAT[widget] ?? { value: '1,204', trend: '+4%', tone: 'plain' as const }
  return (
    <>
      <span className="wpic__stat">
        <strong className="wpic__num">
          {s.value}
          {s.unit && <small>{s.unit}</small>}
        </strong>
        <span className={`wpic__chip is-${s.tone}`}>{s.trend}</span>
      </span>
      <svg className="wpic__spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden>
        <path className="wpic__line" pathLength={1} d="M0 22 C 14 18, 24 25, 38 17 S 62 9, 78 14 S 104 5, 120 4" />
      </svg>
    </>
  )
}

function Area() {
  const d = 'M0 46 C 18 38, 30 50, 50 34 S 82 12, 102 26 S 140 44, 160 20 S 188 10, 200 13'
  return (
    <>
      <svg className="wpic__plot" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden>
        <path className="wpic__area" d={`${d} L200 60 L0 60 Z`} />
        <path className="wpic__line" pathLength={1} d={d} />
      </svg>
      <span className="wpic__axis" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </span>
    </>
  )
}

function Bars() {
  return (
    <span className="wpic__bars" aria-hidden>
      {[42, 64, 50, 82, 58, 92, 70, 76].map((h, i) => (
        <i key={i} style={at(i, { height: `${h}%` })} />
      ))}
    </span>
  )
}

function BarList({ widget }: { widget: WidgetId }) {
  const rows = BARS[widget] ?? [
    ['First', 100],
    ['Second', 64],
    ['Third', 40],
  ]
  return (
    <span className="wpic__barlist">
      {rows.map(([label, v], i) => (
        <span key={label} className="wpic__brow" style={at(i)}>
          <i style={{ width: `${v}%` }} aria-hidden />
          <span>{label}</span>
        </span>
      ))}
    </span>
  )
}

function Ring({ widget }: { widget: WidgetId }) {
  const parts: [number, number, string][] =
    widget === 'methods'
      ? [
          [0, 46, 's1'],
          [46, 30, 's2'],
          [76, 24, 'q2'],
        ]
      : [
          [0, 40, 's1'],
          [40, 26, 's2'],
          [66, 20, 'q3'],
          [86, 14, 'q2'],
        ]
  return (
    <span className="wpic__ringwrap">
      <svg className="wpic__ring" viewBox="0 0 64 64" aria-hidden>
        <circle className="wpic__track" cx="32" cy="32" r="24" />
        {parts.map(([from, len, tone], i) => (
          <circle key={i} className={`wpic__seg is-${tone}`} cx="32" cy="32" r="24" pathLength={100} strokeDasharray={`${len - 1.5} ${101.5 - len}`} strokeDashoffset={-from} style={at(i)} />
        ))}
      </svg>
      <span className="wpic__ringmid">
        <b>{widget === 'methods' ? '3' : '1,486'}</b>
        <span>{widget === 'methods' ? 'methods' : 'blocked'}</span>
      </span>
    </span>
  )
}

function Gauge() {
  return (
    <span className="wpic__gauge">
      <svg viewBox="0 0 120 70" aria-hidden>
        <path className="wpic__track" d="M12 62 A48 48 0 0 1 108 62" />
        <path className="wpic__arc" pathLength={1} strokeDasharray="0.64 1" d="M12 62 A48 48 0 0 1 108 62" />
      </svg>
      <b className="wpic__gaugenum">64%</b>
    </span>
  )
}

function CatBar({ widget }: { widget: WidgetId }) {
  const parts: [string, number, string][] =
    widget === 'user-types'
      ? [
          ['Employees', 64, 's1'],
          ['Contractors', 24, 's2'],
          ['Guests', 12, 'q2'],
        ]
      : [
          ['Covered', 76, 'good'],
          ['Waiting', 14, 'warn'],
          ['None', 10, 'q2'],
        ]
  return (
    <>
      <span className="wpic__catbar" aria-hidden>
        {parts.map(([label, w, tone], i) => (
          <i key={label} className={`is-${tone}`} style={at(i, { width: `${w}%` })} />
        ))}
      </span>
      <span className="wpic__legend">
        {parts.map(([label, w, tone]) => (
          <span key={label}>
            <i className={`is-${tone}`} aria-hidden />
            {label} <b>{w}%</b>
          </span>
        ))}
      </span>
    </>
  )
}

function Heat() {
  const cells: ReactNode[] = []
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 12; c++) {
      const v = (Math.sin(c * 0.8 + 1) + Math.cos(r * 1.3 + c * 0.25) + 2) / 4
      const work = r < 5 && c > 2 && c < 10 ? 0.25 : 0
      const q = Math.min(4, Math.max(1, Math.round((v + work) * 4)))
      cells.push(<i key={`${r}-${c}`} className={`is-q${q}`} style={at(c + r)} />)
    }
  return (
    <span className="wpic__heat" aria-hidden>
      {cells}
    </span>
  )
}

function Tracker() {
  const bad = new Set([7, 16])
  const warn = new Set([3, 12, 20])
  return (
    <>
      <span className="wpic__track-row" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} className={bad.has(i) ? 'is-bad' : warn.has(i) ? 'is-warn' : 'is-good'} style={at(i)} />
        ))}
      </span>
      <span className="wpic__note">Last 24 hours · 2 outages</span>
    </>
  )
}

function Funnel() {
  const steps: [string, number][] = [
    ['Started', 100],
    ['First factor', 88],
    ['Second factor', 72],
    ['Signed in', 66],
  ]
  return (
    <span className="wpic__barlist is-funnel">
      {steps.map(([label, v], i) => (
        <span key={label} className="wpic__brow" style={at(i)}>
          <i style={{ width: `${v}%` }} aria-hidden />
          <span>{label}</span>
        </span>
      ))}
    </span>
  )
}

function List({ widget }: { widget: WidgetId }) {
  const rows = LIST[widget] ?? [
    ['First', 'Detail'],
    ['Second', 'Detail'],
    ['Third', 'Detail'],
  ]
  return (
    <span className="wpic__rows">
      {rows.map(([name, sub], i) => (
        <span key={name} className="wpic__row" style={at(i)}>
          <span className="wpic__face" aria-hidden>
            {name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span className="wpic__words">
            <b>{name}</b>
            <span>{sub}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

function Feed({ widget }: { widget: WidgetId }) {
  const rows = FEED[widget] ?? ['Something changed', 'Something else changed', 'And another']
  return (
    <span className="wpic__feed">
      {rows.map((text, i) => (
        <span key={text} className="wpic__row" style={at(i)}>
          <i className="wpic__dot" aria-hidden />
          <span className="wpic__words">
            <b>{text}</b>
            <span>{['2 min ago', '1 hour ago', 'Yesterday'][i]}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

function Table({ widget }: { widget: WidgetId }) {
  const sync = widget === 'provisioning'
  const head = sync ? ['Directory', 'Users', 'Last run'] : ['Who', 'App', 'Result']
  const rows = sync
    ? [
        ['Azure AD', '812', 'Done'],
        ['Workday', '640', 'Done'],
        ['LDAP', '96', 'Failed'],
      ]
    : [
        ['Ana Ruiz', 'Slack', 'Allowed'],
        ['Dev Patel', 'Jira', 'MFA'],
        ['Lena Fox', 'Zoom', 'Blocked'],
      ]
  const tone = (v: string) => (v === 'Blocked' || v === 'Failed' ? 'bad' : v === 'MFA' ? 'warn' : v === 'Allowed' || v === 'Done' ? 'good' : '')
  return (
    <span className="wpic__table">
      <span className="wpic__thead">
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </span>
      {rows.map((r, i) => (
        <span key={r[0]} className="wpic__trow" style={at(i)}>
          {r.map((v, k) => (
            <span key={k} className={k === 2 ? `wpic__tag is-${tone(v)}` : ''}>
              {v}
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

function Checklist({ widget }: { widget: WidgetId }) {
  const rows = CHECKS[widget] ?? ['First', 'Second', 'Third']
  return (
    <span className="wpic__rows">
      {rows.map((text, i) => (
        <span key={text} className="wpic__check" style={at(i)}>
          <span className={`wpic__tick${i === rows.length - 1 && widget === 'setup' ? ' is-open' : ''}`} aria-hidden>
            <Check size={12} strokeWidth={2.6} />
          </span>
          {text}
        </span>
      ))}
    </span>
  )
}

function Meters() {
  const rows: [string, string, number][] = [
    ['Users', '812 of 1,000', 81],
    ['Applications', '34 of 50', 68],
  ]
  return (
    <span className="wpic__rows">
      {rows.map(([label, of, v], i) => (
        <span key={label} className="wpic__meter" style={at(i)}>
          <span className="wpic__meterwords">
            <b>{label}</b>
            <span>{of}</span>
          </span>
          <span className="wpic__meterbar" aria-hidden>
            <i style={{ width: `${v}%` }} />
          </span>
        </span>
      ))}
    </span>
  )
}

function Tiles({ widget }: { widget: WidgetId }) {
  const tiles = TILES[widget] ?? [
    ['First', '1'],
    ['Second', '2'],
    ['Third', '3'],
    ['Fourth', '4'],
  ]
  return (
    <span className="wpic__tiles">
      {tiles.map(([label, n], i) => (
        <span key={label} className="wpic__tile" style={at(i)}>
          <b>{n}</b>
          <span>{label}</span>
        </span>
      ))}
    </span>
  )
}

function Actions() {
  return (
    <span className="wpic__rows">
      {['New sign-in policy', 'Add an application', 'Check access'].map((text, i) => (
        <span key={text} className="wpic__action" style={at(i)}>
          <Plus size={12} strokeWidth={2.4} aria-hidden />
          {text}
        </span>
      ))}
    </span>
  )
}

function Form() {
  return (
    <span className="wpic__rows">
      {[
        ['Who', 'Ana Ruiz'],
        ['Signs in to', 'Slack'],
      ].map(([label, value], i) => (
        <span key={label} className="wpic__field" style={at(i)}>
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
      <span className="wpic__button" style={at(2)}>
        Check access
      </span>
    </span>
  )
}

function Strip() {
  return (
    <>
      <span className="wpic__strip" aria-hidden>
        <i />
      </span>
      <span className="wpic__legend">
        <span>
          <i className="is-good" aria-hidden />
          Moved <b>146</b>
        </span>
        <span>
          <i className="is-q2" aria-hidden />
          Not moved <b>2</b>
        </span>
      </span>
    </>
  )
}

function Note() {
  return (
    <span className="wpic__rows">
      <b className="wpic__notehead" style={at(0)}>
        Policies, one place
      </b>
      <span className="wpic__line-text" style={at(1)}>
        Sign-in and post sign-in policies now share one builder.
      </span>
      <span className="wpic__link" style={at(2)}>
        Read more
      </span>
    </span>
  )
}

/** The picture of one widget, by how it shows its data. Decorative: the card's own words name it. */
export function WidgetPicture({ widget }: { widget: WidgetId }) {
  const m = WIDGETS[widget]
  const Icon = CAT_ICON[m.category]
  const body = (() => {
    switch (m.kind) {
      case 'stat':
        return <Stat widget={widget} />
      case 'area':
        return <Area />
      case 'bars':
        return <Bars />
      case 'barlist':
        return <BarList widget={widget} />
      case 'donut':
        return <Ring widget={widget} />
      case 'gauge':
        return <Gauge />
      case 'catbar':
        return <CatBar widget={widget} />
      case 'heat':
        return <Heat />
      case 'tracker':
        return <Tracker />
      case 'funnel':
        return <Funnel />
      case 'list':
        return <List widget={widget} />
      case 'feed':
        return <Feed widget={widget} />
      case 'table':
        return <Table widget={widget} />
      case 'checklist':
        return <Checklist widget={widget} />
      case 'meters':
        return <Meters />
      case 'grid':
        return <Tiles widget={widget} />
      case 'actions':
        return <Actions />
      case 'form':
        return <Form />
      case 'strip':
        return <Strip />
      case 'note':
        return <Note />
    }
  })()
  return (
    <span className={`bgviz wpic is-${m.kind}`} aria-hidden>
      <span className="bgviz__head">
        <span className="bgviz__icon">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="bgviz__title">{m.name}</span>
      </span>
      {body}
    </span>
  )
}
