import type { ReactNode } from 'react'
import { AppWindow, ArrowRight, Clock, FileText, Globe, KeyRound, Laptop, Network, ShieldAlert, ShieldCheck, Smartphone, Timer, Users, type LucideIcon } from 'lucide-react'
import { AppLogo } from '../logos/AppLogo'
import { MethodIcon } from '../screens/recovery'
import { useBrand } from '../store'
import { DEFAULT_GROUP, DEFAULT_METHOD, type LegacyAdaptive, type LegacyPolicy } from './legacy'
import { groupName } from './plan'
import './old-login-view.css'

/* -----------------------------------------------------------------------------
   An old App Login policy, read as the live console shows it (owner, 10 Nov 2026: "go to App Login, edit any, that is
   the detailed view; add this kind of popup with view only"). One thing to a row (owner, 10 Nov 2026: "readable and
   scalable"): the live Edit Login Policy's fields and words in its order, each a label and its value, in groups. Adaptive
   Access is a group of this popup, since it is a part of the login policy and never a second policy; it reads as a
   table with an Allow or Deny on each element, and the old policy's own outcome for anything not on the list.
   -------------------------------------------------------------------------- */

interface Row {
  icon: LucideIcon
  label: string
  value: ReactNode
  /** A logo or icon that leads the value: the application's mark, the group's tile, the method's icon. */
  lead?: ReactNode
}
interface Group {
  title?: string
  rows: Row[]
}

interface TableRow {
  key: string
  icon: LucideIcon
  label: string
  value: ReactNode
  /** What it became on the board, as the tokens its conditions carry (IfBlock `condTokens`): hovering lights them. */
  tokens: string
}

/* Adaptive Access as a table with an allow list (owner, 12 Nov 2026: "a default value, read only, Allow or Deny, that's
   it"): one row per element of the old checks, each read-only. The old policy lists what is allowed, so every listed row
   reads Allow; what fits no row gets the old policy's "if not met" (Deny, or Ask for MFA), the last row. */
function adaptiveRows(ad: LegacyAdaptive): TableRow[] {
  const rows: TableRow[] = []
  for (const ip of ad.ip ?? []) rows.push({ key: `ip:${ip}`, icon: Network, label: 'IP address', value: ip, tokens: 'zone:ip' })
  for (const c of ad.location?.countries ?? []) rows.push({ key: `loc:${c}`, icon: Globe, label: 'Location', value: c, tokens: 'zone:location' })
  const t = ad.time
  if (t) {
    const weekdays = t.days.length === 5 && t.days[0] === 'Monday' && t.days[4] === 'Friday'
    /* Hours and days are two conditions on the board, Sign-in hours and Sign-in days. */
    rows.push({ key: 'time', icon: Clock, label: 'Time', value: `${weekdays ? 'Mon to Fri' : t.days.map((d) => d.slice(0, 3)).join(', ')}, ${t.from} to ${t.to}`, tokens: 'time day' })
  }
  if (ad.device) rows.push({ key: 'device', icon: Laptop, label: 'Devices', value: `Up to ${ad.device.max} per user`, tokens: 'fingerprint' })
  return rows
}

function AdaptiveTable({ ad, onCheck }: { ad: LegacyAdaptive; onCheck?: (tokens: string | null) => void }) {
  const rows = adaptiveRows(ad)
  return (
    <section className="bolv__group" aria-label="Adaptive Access">
      <h3>Adaptive Access</h3>
      <table className="bolv__table">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Value</th>
            <th scope="col">Access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className="bolv__hover"
              tabIndex={onCheck ? 0 : undefined}
              onMouseEnter={() => onCheck?.(r.tokens)}
              onMouseLeave={() => onCheck?.(null)}
              onFocus={() => onCheck?.(r.tokens)}
              onBlur={() => onCheck?.(null)}
            >
              <th scope="row"><r.icon size={15} strokeWidth={1.9} aria-hidden />{r.label}</th>
              <td>{r.value}</td>
              <td><span className="bolv__chip is-allow">Allow</span></td>
            </tr>
          ))}
          <tr>
            <th scope="row"><ShieldAlert size={15} strokeWidth={1.9} aria-hidden />Anything else</th>
            <td>Not on the list</td>
            <td><span className={`bolv__chip ${ad.onFail === 'deny' ? 'is-deny' : ''}`}>{ad.onFail === 'deny' ? 'Deny' : 'Ask for MFA'}</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}


/** The body of the view, drawn in place: the builder's left panel swaps its list for it (owner, 12 Nov 2026: "instead of
 *  a modal, swap the left side with the old details view"). The panel draws the head, with Back. */
export function OldLoginView({ lp, became, onCheck }: { lp: LegacyPolicy | null; became: string; onCheck?: (tokens: string | null) => void }) {
  const store = useBrand()
  if (!lp) return null
  const ad = lp.adaptive ? store.legacy.adaptive.find((a) => a.id === lp.adaptive?.policyId) : undefined
  const who = lp.groupId === DEFAULT_GROUP ? 'DEFAULT' : groupName(lp.groupId, { groups: store.groups })
  const app = store.moveApps.find((a) => a.id === lp.appId)?.name ?? lp.appId
  const groups: Group[] = [
    {
      rows: [
        { icon: AppWindow, label: 'Application Name', value: app, lead: <AppLogo appId={lp.appId} name={app} size={22} /> },
        { icon: Users, label: 'Group Name', value: who, lead: <span className="bolv__tile" aria-hidden><Users size={13} strokeWidth={2} /></span> },
        { icon: FileText, label: 'Policy Name', value: lp.name },
      ],
    },
    {
      title: 'Sign-in',
      rows: [
        { icon: KeyRound, label: 'First Factor', value: lp.firstFactor },
        { icon: Smartphone, label: 'Select MFA Method', value: lp.mfa ? (lp.mfa.method === DEFAULT_METHOD ? 'Use Default MFA Method' : lp.mfa.method) : 'No second factor', lead: lp.mfa && lp.mfa.method !== DEFAULT_METHOD ? <MethodIcon name={lp.mfa.method} size={22} plain /> : undefined },
        ...(lp.mfa ? [{ icon: Timer, label: 'Remember MFA', value: lp.mfa.rememberDays ? `${lp.mfa.rememberDays} days` : 'Off' }] : []),
        { icon: ShieldAlert, label: 'Force MFA', value: lp.forceMfa ? 'Yes' : 'No' },
      ],
    },
  ]
  return (
    <>
      <div className="bolv">
        {groups.map((g, n) => (
          <section key={g.title ?? n} className="bolv__group" aria-label={g.title}>
            {g.title && <h3>{g.title}</h3>}
            <dl>
              {g.rows.map((r) => (
                <div key={r.label} className="bolv__row">
                  <dt>
                    <r.icon size={15} strokeWidth={1.9} aria-hidden />
                    {r.label}
                  </dt>
                  <dd>{r.lead}{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {ad ? (
          <AdaptiveTable ad={ad} onCheck={onCheck} />
        ) : (
          <section className="bolv__group" aria-label="Adaptive Access">
            <h3>Adaptive Access</h3>
            <dl>
              <div className="bolv__row">
                <dt><ShieldCheck size={15} strokeWidth={1.9} aria-hidden />Policy</dt>
                <dd>None</dd>
              </div>
            </dl>
          </section>
        )}
        <p className="bolv__became">
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
          In the new policy: {became.replace(/^Became /, '')}
        </p>
      </div>
    </>
  )
}
