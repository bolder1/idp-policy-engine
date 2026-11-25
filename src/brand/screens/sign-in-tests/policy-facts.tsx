import type { ReactNode } from 'react'

import { audienceSummary, type Policy } from '../../data'
import type { useBrand } from '../../store'
import { AppsPeek } from '../apps-peek'
import { readFoot } from '../board/read-as-text'
import { CountTip } from './PeekViews'

/** The overview card's facts, applications, audience and the last change, as Policy details (InspectPanel.tsx
 *  `PolicyPage`) and the builder bar's card (board/policy-card.tsx) both draw them. `onApps` puts an Edit on the
 *  applications where something edits them. Its own file, so the component files around it keep fast refresh. */
export function policyFacts(
  policy: Policy,
  { apps, groups, users }: Pick<ReturnType<typeof useBrand>, 'apps' | 'groups' | 'users'>,
  onApps?: () => void,
): { label: string; value: ReactNode; wide?: boolean }[] {
  const audience = policy.isSystem ? 'Everyone' : audienceSummary(policy.audience, groups, users).label || 'Nobody'
  /* Its groups and people by name, under the pointer (`CountTip`); everyone has no list. */
  const audienceLists =
    policy.isSystem || policy.audience.everyone
      ? []
      : [
          { kind: 'Groups', names: policy.audience.groupIds.map((id) => groups.find((g) => g.id === id)?.name ?? 'A deleted group') },
          { kind: 'People', names: policy.audience.userIds.map((id) => users.find((u) => u.id === id)?.name ?? 'A deleted person') },
        ]
  const changed = readFoot(policy).split(' · ').slice(1).join(' · ')
  const appsSaid = policy.isSystem ? (
    'Every application'
  ) : policy.appIds.length === 0 ? (
    'None'
  ) : (
    /* One: its name. More: the Policies table's marks and list under the pointer (owner, 7 Oct 2026). */
    <AppsPeek apps={policy.appIds.flatMap((id) => apps.find((x) => x.id === id) ?? [])} policyName={policy.name} onEdit={onApps} />
  )
  const audienceNames = audienceLists.flatMap((l) => l.names)
  return [
    { label: 'Applications', value: appsSaid },
    { label: 'Audience', value: audienceNames.length === 1 ? audienceNames[0] : <CountTip label={audience} lists={audienceLists} /> },
    ...(changed ? [{ label: 'Last change', value: changed, wide: true }] : []),
  ]
}
