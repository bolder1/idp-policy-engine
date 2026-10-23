import { Fragment } from 'react'

import { AppLogo } from '../logos/AppLogo'
import type { DeleteFacts } from './app-policies'

/* -----------------------------------------------------------------------------
   Applications named inside a confirm's sentence, each with its logo.

   Owner, 23 Oct 2026, of the popups: short titles, "logos beside application
   names", a simple card with context. The Remove dialog (AppProtection.tsx
   `RemoveDialog`) was the first to draw one, as a `.bx-confirm__fact` span;
   this is that span for a list, so the status, delete, unlink and group
   confirms name their applications the same way.

   The words around the logos are `listNames`'s (rule-who.ts) — "A, B and C",
   or "A, B and 3 more" past `max` — so a sentence reads the same whether it
   is drawn here or said in a toast.
   -------------------------------------------------------------------------- */

export function AppFacts({ apps, max = 3 }: { apps: readonly { id: string; name: string }[]; max?: number }) {
  const over = apps.length > max
  const shown = over ? apps.slice(0, Math.max(1, max - 1)) : apps
  return (
    <>
      {shown.map((a, i) => (
        <Fragment key={a.id}>
          {i > 0 && (i === shown.length - 1 && !over ? ' and ' : ', ')}
          <span className="bx-confirm__fact">
            <AppLogo appId={a.id} name="" size={16} />
            {a.name}
          </span>
        </Fragment>
      ))}
      {over && ` and ${apps.length - shown.length} more`}
    </>
  )
}

/* The delete policy confirm's line about its applications (app-policies.ts
   `deleteFacts`), with logos. `deleteDetail` takes the same branches from the same
   facts, so the two cannot disagree on WHAT is said; the wording differs only where
   the logos carry it (deleteDetail names the rest as "and N other applications",
   this line draws up to three logos and "N more"). */
export function DeleteFactsLine({ facts }: { facts: DeleteFacts }) {
  if (facts.protects.length === 0) {
    return (
      <>
        Assigned to <AppFacts apps={facts.assigned} />. It decides no sign-ins.
      </>
    )
  }
  const to = facts.fallsTo
  return (
    <>
      Protects <AppFacts apps={facts.protects} />.
      {to &&
        (to.apps === 'all' ? (
          <> Sign-ins there will use the {to.policy.name}.</>
        ) : (
          <>
            {' '}
            Sign-ins to <AppFacts apps={to.apps} /> will use the {to.policy.name}.
          </>
        ))}
    </>
  )
}
