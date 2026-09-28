import { CantTell } from '../decision-badge'
import { Badge } from '../kit'
import type { WatchedResult } from './tenant-resolver'
import { watchingWords } from './watching-words'
import './testing/testing.css'

/* What a monitoring policy would have decided, beside its name.

   An info badge — "Would allow with 2FA" — because it is information about a
   policy that decides nothing, never the decision's own tone: a green "would
   allow" next to a policy that is only watching reads as that policy letting
   somebody in. The one `CantTell` when it cannot be told, so it reads as the
   Decision stage's does — the same words, the same case. And
   when turning it on would still leave another policy first, a muted line
   under it says which (watching-words.ts).

   Try a sign-in's Which policy stage, Policy testing's Which policy list and
   the guard pages draw it; none of them draws a monitor any other way. */
export function WatchingBadge({ watched, yields = true }: { watched: WatchedResult; yields?: boolean }) {
  const w = watchingWords(watched)
  return (
    <span className="bx-watching">
      {w.would ? (
        <Badge tone="info" className="bx-would-badge">
          {w.would}
        </Badge>
      ) : (
        <CantTell outcomes={w.reach} />
      )}
      {yields && w.yields && <span className="bx-watching__yields">{w.yields}</span>}
    </span>
  )
}
