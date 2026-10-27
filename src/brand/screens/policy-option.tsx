import { appsOf, type App, type Group, type Policy, type User } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { AppLogo } from '../logos/AppLogo'
import type { PickerOption } from '../picker'
import { attachKind, rulesLabel } from './app-policies'
import { whoLabel } from './app-standing'
import { STATUS_WORD } from './board/read-as-text'
import { fallbackOf } from './simulate'

/* -----------------------------------------------------------------------------
   One policy as an option in an application's policy picker — the drawer on
   the Apps list and Add existing policy on the application's page.

   Its own module, imported from here by both: a file that exports components
   and a plain function as well (or re-exports one) loses fast refresh, and
   the lint counts it (react/only-export-components).

   Filed under where the policy is now, so the picker reads unassigned first,
   then shared, then the ones already here. A policy that is already here, or
   is not an app access policy, is shown and cannot be picked, with the reason
   as its meta — a picker that hid them would leave somebody looking for a
   policy they know exists.
   -------------------------------------------------------------------------- */

export function policyOption(
  p: Policy,
  app: Pick<App, 'id' | 'name'>,
  tenant: { apps: App[]; groups: readonly Group[]; users: readonly User[] },
  /* `here`: already on this application and pickable all the same — Replace policy's draft parked here
     (AddExistingPolicy.tsx), which a replace puts in charge. It reads as any other pick, under the application. */
  opts: { here?: boolean } = {},
): PickerOption {
  const kind = attachKind(p, app.id)
  const first = appsOf(p, tenant.apps)[0] ?? null
  const group = kind === 'fresh' ? 'No applications yet' : kind === 'already-here' ? `On ${app.name}` : 'On other applications'
  const blockedHere = kind === 'already-here' && !opts.here
  const meta =
    blockedHere
      ? 'Already on this application'
      : p.type !== 'App Access'
        ? 'Not an app access policy'
        : [whoLabel(p, tenant.groups, tenant.users), rulesLabel(p), `Nothing else matched: ${DECISION_WORDS[fallbackOf(p)]}`, STATUS_WORD[p.status]].join(' · ')
  return {
    value: p.id,
    label: p.name,
    meta,
    art: first ? <AppLogo appId={first.id} name={first.name} size={16} /> : undefined,
    group,
    disabled: blockedHere || kind === 'system' || p.type !== 'App Access',
  }
}
