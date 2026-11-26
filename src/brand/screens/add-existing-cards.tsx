import { ChevronRight, Unlink } from 'lucide-react'

import { appsOf, type App, type Policy } from '../data'
import { StatusPill } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { rulesLabel } from './app-policies'
import './add-existing-cards.css'

/* -----------------------------------------------------------------------------
   Add existing policy's cards (rollout.ts `addExistingCards`; owner, 26 Nov 2026: "only showcase the Active and
   Inactive part. The headless policies with no application and the policies which have some applications … redo the
   card layout and the content").

   One card per policy that can be added: its applications as logos (or the unlinked mark when it has none), its name
   and status, and one quiet line — where it is, how many rules, whom it is for. The old line also said what "Nothing
   else matched" does; that is in the details a pick opens, and it made every row read the same.
   -------------------------------------------------------------------------- */

/** At most this many logos side by side; the line under the name says the rest. */
const LOGOS = 3

/** Where the policy is, in words: its one application, the first and how many more, or none. */
function placeWords(on: readonly Pick<App, 'name'>[]): string {
  if (on.length === 0) return 'No application'
  if (on.length === 1) return on[0].name
  return `${on[0].name} and ${on.length - 1} more`
}

export function PolicyPickCard({ policy, apps, audience, onPick }: { policy: Policy; apps: App[]; audience: string; onPick: () => void }) {
  const on = appsOf(policy, apps)
  return (
    <button type="button" className="bpk" onClick={onPick}>
      <span className={`bpk__art${on.length ? '' : ' is-none'}`} aria-hidden>
        {on.length ? (
          on.slice(0, LOGOS).map((a) => (
            <span key={a.id} className="bpk__logo">
              <AppLogo appId={a.id} name={a.name} size={18} />
            </span>
          ))
        ) : (
          <Unlink size={15} strokeWidth={2} />
        )}
      </span>
      <span className="bpk__main">
        <span className="bpk__top">
          <b className="bpk__name">{policy.name}</b>
          <StatusPill status={policy.status} />
        </span>
        <span className="bpk__meta">
          <span>{placeWords(on)}</span>
          <span aria-hidden>·</span>
          <span>{rulesLabel(policy)}</span>
          <span aria-hidden>·</span>
          <span>{audience}</span>
        </span>
      </span>
      <ChevronRight className="bpk__go" size={16} strokeWidth={2} aria-hidden />
    </button>
  )
}
