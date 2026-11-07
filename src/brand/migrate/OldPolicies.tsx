import { useMemo, useState } from 'react'
import { ArrowRight, Check, Minus, Plus } from 'lucide-react'
import { PageHead } from '../Shell'
import { Button, SearchBox, StatusPill } from '../kit'
import { blankPolicy } from '../data'
import { useBrand } from '../store'
import { newPolicy } from '../policy-draft'
import { blockedReason, groupName, type MoveContext } from './plan'
import { DEADLINE_VIEWS, type DeadlineView, type LegacyAdaptive, type LegacyPolicy } from './legacy'
import { Picker } from '../picker'
import { MoveBanner } from './move-banner'
import { MIGRATION_FIRST } from './phase'
import '../screens.css'
import './old-policies.css'

/* -----------------------------------------------------------------------------
   Old policy: the old console's Policies section, kept until it closes (owner, 3 Nov 2026).

   A rail accordion of its own with the live console's three pages, in its words and
   order: App Login Policy, Password Policy, Adaptive Access Policy. The old pages keep
   the live names ("Login"); every new page says sign-in (owner's ruling).

   App Login and Adaptive Access carry the move banner (the Claude Design banner the
   owner pointed at: what is happening and when, coloured by how near it is, and two
   buttons). Nothing here merges: Move opens the new view's flow with the rows chosen,
   because a sign-in policy and the adaptive policy it names become ONE new policy
   between them. Password Policy is not part of the move and has no banner.
   -------------------------------------------------------------------------- */

const CHECKS: { key: keyof Pick<LegacyAdaptive, 'ip' | 'device' | 'location' | 'time'>; label: string }[] = [
  { key: 'ip', label: 'IP' },
  { key: 'device', label: 'Device' },
  { key: 'location', label: 'Location' },
  { key: 'time', label: 'Time' },
]

/** Where one old row stands: still old, moved (to which policy), or its application already has a new policy. */
type RowState = { kind: 'old' } | { kind: 'moved'; policyId: string } | { kind: 'covered'; why: string }

function useOldEstate() {
  const store = useBrand()
  const ctx = useMemo<MoveContext>(
    () => ({ apps: store.moveApps, groups: store.groups, users: store.users, zones: store.zones, policies: store.policies, staged: store.staged }),
    [store.moveApps, store.groups, store.users, store.zones, store.policies, store.staged],
  )
  const stateOf = (lp: LegacyPolicy): RowState => {
    const moved = store.movedLegacy[lp.id]
    if (moved) return { kind: 'moved', policyId: moved }
    const why = blockedReason(lp, ctx)
    return why ? { kind: 'covered', why } : { kind: 'old' }
  }
  const rows = store.legacy.policies
  const left = rows.filter((lp) => stateOf(lp).kind === 'old')
  return { ctx, stateOf, rows, left }
}

/* The preview switch (owner, 4 Nov 2026): the banner at three moments — today, 45 days left, 7 days left — so each of
   its moods can be designed. */
function TimeLeftPicker() {
  const store = useBrand()
  return (
    <Picker label="Time left" size="md" prefix="Time left" value={store.deadlineView} options={DEADLINE_VIEWS} onChange={(v) => store.setDeadlineView(v as DeadlineView)} />
  )
}

/* The move banner (move-banner.tsx), on the old pages: it sends the admin to the new builder, where the move starts. */
function OldBanner() {
  const store = useBrand()
  const { left } = useOldEstate()
  return <MoveBanner where="old" waiting={left.length} view={store.deadlineView} onAction={() => (MIGRATION_FIRST ? store.openIntro('migrate') : store.go({ name: 'policies' }))} />
}

/* --- Shared cells ------------------------------------------------------------------------- */

const Tick = ({ on, label }: { on: boolean; label: string }) =>
  on ? (
    <Check className="bold__yes" size={16} strokeWidth={2.4} aria-label={`${label}: on`} />
  ) : (
    <Minus className="bold__no" size={16} strokeWidth={2.4} aria-label={`${label}: off`} />
  )

function ActionCell({ state, pick, name }: { state: RowState; pick: string[]; name: string }) {
  const store = useBrand()
  if (state.kind === 'moved')
    return (
      <Button variant="ghost" size="sm" onClick={() => store.go({ name: 'board', policyId: state.policyId })}>
        Open
      </Button>
    )
  if (state.kind === 'covered')
    return (
      <span className="bold__muted" title={state.why} aria-label={`${name}: ${state.why}`}>
        Has a policy
      </span>
    )
  return (
    <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => store.openIntro('migrate', pick)}>
      Move
    </Button>
  )
}

/* --- App Login Policies ----------------------------------------------------------------- */

export function OldLoginPolicies() {
  const store = useBrand()
  const { ctx, stateOf, rows } = useOldEstate()
  const [q, setQ] = useState('')
  const appName = (id: string) => ctx.apps.find((a) => a.id === id)?.name ?? id
  const key = q.trim().toLowerCase()
  const shown = rows.filter((lp) => !key || `${lp.name} ${appName(lp.appId)} ${groupName(lp.groupId, ctx)}`.toLowerCase().includes(key))
  /* + Add Policy, the live button, redirects: new policies are made in the new builder. */
  const addPolicy = () => {
    const id = store.addPolicy(newPolicy(blankPolicy('Untitled policy', []), { rules: [], choose: true }))
    store.showToast('New policies are made in the new builder')
    store.go({ name: 'board', policyId: id })
  }
  return (
    <div className="bpage bold">
      <PageHead title="App Login Policies" docs preview={<TimeLeftPicker />} />
      <OldBanner />
      <div className="bold__bar-row">
        <SearchBox value={q} onChange={setQ} placeholder="Search Policy" label="Search App Login Policies" />
        <span className="bold__spacer" />
        <Button variant="neutral" icon={Plus} onClick={addPolicy}>
          Add Policy
        </Button>
      </div>
      <div className="btable-wrap">
        <div className="btable__scroll">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col">Policy Name</th>
                <th scope="col">Group Name</th>
                <th scope="col">Application Name</th>
                <th scope="col">First Factor</th>
                <th scope="col" className="bold__col-tick">
                  2FA
                </th>
                <th scope="col" className="bold__col-tick">
                  Adaptive
                </th>
                <th scope="col" className="bold__col-action">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lp) => {
                const state = stateOf(lp)
                const moved = state.kind === 'moved' ? store.policyById(state.policyId) : undefined
                return (
                  <tr key={lp.id} className={state.kind !== 'old' ? 'is-done' : ''}>
                    <td>
                      <div className="btable__primary">
                        <span className="bold__name">{lp.name}</span>
                        {moved && <StatusPill status={moved.status} />}
                      </div>
                    </td>
                    <td>{groupName(lp.groupId, ctx)}</td>
                    <td>{appName(lp.appId)}</td>
                    <td>{lp.firstFactor}</td>
                    <td>
                      <Tick on={!!lp.mfa} label="2FA" />
                    </td>
                    <td>
                      <Tick on={!!lp.adaptive} label="Adaptive" />
                    </td>
                    <td>
                      <ActionCell state={state} name={lp.name} pick={[lp.id]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="bold__empty">No policies match</p>}
      </div>
    </div>
  )
}

/* --- Adaptive Access Policies ------------------------------------------------------------

   Moving one moves every sign-in policy that uses it: an adaptive policy has no
   application or group of its own and only means something through the rows that name it. */

export function OldAdaptivePolicies() {
  const store = useBrand()
  const { stateOf, rows } = useOldEstate()
  return (
    <div className="bpage bold">
      <PageHead title="Adaptive Access Policies" docs preview={<TimeLeftPicker />} />
      <OldBanner />
      <div className="btable-wrap">
        <div className="btable__scroll">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col">Policy Name</th>
                {CHECKS.map((c) => (
                  <th key={c.key} scope="col" className="bold__col-tick">
                    {c.label}
                  </th>
                ))}
                <th scope="col">When restrictions fail</th>
                <th scope="col">Used by</th>
                <th scope="col" className="bold__col-action">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {store.legacy.adaptive.map((ad) => {
                const using = rows.filter((lp) => lp.adaptive?.policyId === ad.id)
                const left = using.filter((lp) => stateOf(lp).kind === 'old')
                const first = using.map(stateOf).find((s) => s.kind === 'moved')
                const state: RowState = left.length > 0 ? { kind: 'old' } : (first ?? { kind: 'covered', why: 'Nothing left to move' })
                return (
                  <tr key={ad.id} className={left.length === 0 ? 'is-done' : ''}>
                    <td>
                      <span className="bold__name">{ad.name}</span>
                    </td>
                    {CHECKS.map((c) => (
                      <td key={c.key}>
                        <Tick on={!!ad[c.key]} label={c.label} />
                      </td>
                    ))}
                    <td>{ad.onFail === 'deny' ? 'Deny' : 'Ask for MFA'}</td>
                    <td className="bold__muted">{using.map((lp) => lp.name).join(', ') || 'No policy'}</td>
                    <td>
                      <ActionCell state={state} name={ad.name} pick={left.map((lp) => lp.id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* --- Password Policy ------------------------------------------------------------------------

   Stays where it is: it is not a sign-in policy and is not part of the move. FABRICATED
   values; the live page has not been read on screen. */

const PASSWORD_RULES: [string, string][] = [
  ['Minimum length', '8 characters'],
  ['Uppercase letter', 'Required'],
  ['Lowercase letter', 'Required'],
  ['Number', 'Required'],
  ['Special character', 'Required'],
  ['Password expiry', '90 days'],
  ['Password history', 'Last 5 passwords'],
  ['Lockout after failed attempts', '5 attempts'],
]

export function OldPasswordPolicy() {
  return (
    <div className="bpage bold">
      <PageHead title="Password Policy" docs />
      <div className="btable-wrap">
        <div className="btable__scroll">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {PASSWORD_RULES.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <span className="bold__name">{k}</span>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
