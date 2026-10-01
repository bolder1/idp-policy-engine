import { memo } from 'react'
import { Building, Building2, Clock, Gauge, Globe, House, MonitorSmartphone, Network, VenetianMask, type LucideIcon } from 'lucide-react'

import { Face } from '../../faces'
import { AppLogo } from '../../logos/AppLogo'
import { PlatformMark } from '../../logos/PlatformMark'
import { useBrand } from '../../store'
import type { RowsRead } from '../testing/rows-read'
import type { SignInForm } from '../testing/sign-in-form'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenValue } from '../testing/sign-in-sentence'
import { groupNamesOf } from './sign-in-card'

/* -----------------------------------------------------------------------------
   The sign-in node at the top of the journey (TESTING-V4 §12.3, §14).

   The form is the panel beside the canvas (TryPanel.tsx), so the node is
   only what the run was of, compact: the person's face, name and every group
   they are in — or "A member of Finance" when a group was chosen (§13.3) —
   the application, and the facts its rules read as small neutral chips. No
   pencil and no bookmark — Save sign-in lives in the panel's foot; a press on
   the node opens the panel on its Person picker, where the sign-in
   is changed.

   The Stage 0 card (§8.1–8.2) that used to live here is retired with the
   in-canvas form: its pure helpers stay in sign-in-card.ts.
   -------------------------------------------------------------------------- */

const ICON: Record<string, LucideIcon> = {
  office: Building2,
  branch: Building,
  home: House,
  tor: VenetianMask,
  address: Network,
  anywhere: Globe,
  device: MonitorSmartphone,
  clock: Clock,
  risk: Gauge,
}

/** A value's mark, as the sentence draws it: the platform, or the line icon. The panel's fact rows draw theirs with it too. */
export function ValueMark({ v, size = 14 }: { v: TokenValue; size?: number }) {
  if (v.mark.kind === 'platform') return <PlatformMark platform={v.mark.platform} size={size} />
  if (v.mark.kind === 'face') return <Face kind="user" name={v.mark.name} size="sm" decorative />
  if (v.mark.kind === 'logo') return <AppLogo appId={v.mark.appId} name={v.mark.name} size={16} />
  const Icon = ICON[v.mark.icon]
  return Icon ? <Icon size={size} strokeWidth={1.9} aria-hidden /> : null
}

/* Memoised: the canvas renders once a step, and the node only changes when
   the sign-in does. */
export const SignInNode = memo(function SignInNode({
  form,
  rows,
  asGroup = null,
  onPress,
}: {
  form: SignInForm
  rows: RowsRead
  /** A group was chosen in the Person picker: the node says whose member this is. */
  asGroup?: string | null
  onPress: () => void
}) {
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const groupName = asGroup ? (groups.find((g) => g.id === asGroup)?.name ?? null) : null
  const group = groupName ? `A member of ${groupName}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const app = apps.find((a) => a.id === form.appId) ?? null
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const stated = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
    .filter((v) => !v.unset)

  return (
    <button type="button" className="tj-node tj-sin is-compact" data-node="sign-in" onClick={onPress}>
      <span className="tj-sin__who" data-port>
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="tj-sin__text">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {group && <span>{group}</span>}
        </span>
      </span>
      <span className="tj-sin__app">
        {app && <AppLogo appId={app.id} name={app.name} size={18} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </span>
      {stated.length > 0 && (
        <span className="tj-facts">
          {stated.map((v) => (
            <span key={v.token} className="tj-fact">
              <ValueMark v={v} size={12} />
              <span className="u-sr-only">{v.label}: </span>
              <span className="tj-fact__text">{v.text}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
})
