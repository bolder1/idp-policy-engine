import { Fragment } from 'react'
import { LayoutTemplate, ShieldCheck, type LucideIcon } from 'lucide-react'

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

/* A policy named inside a confirm's sentence, marked as one (owner, 27 Oct 2026, of a popup whose bold policy name
   ran to two lines and read as part of the sentence: "add a policy word and an icon so they can distinguish easily
   that this is a policy, like we did for application … this type of use case should be managed for all popups").

   The application is a logo and its name; the policy is the shield the Policies section wears and the word Policy,
   then its name, drawn as one tag with a width of its own, so a long name is cut with an ellipsis on one line and
   never stretches the tag across the card or breaks into the sentence round it (kit.css, `--fact-max`). Every popup
   that names a policy draws it here, so the word and the icon are the same wherever it is said. The word is real text
   (a reader and a copy both get it), and the full name is the tag's title, so a cut name is one hover away. */
function KindFact({ kind, icon: Icon, name }: { kind: 'policy' | 'template'; icon: LucideIcon; name: string }) {
  return (
    <span className={`bx-confirm__fact bx-confirm__fact--tag bx-confirm__fact--${kind}`} title={name}>
      <span className="bx-confirm__kind">
        <Icon size={14} strokeWidth={1.9} aria-hidden />
        {kind === 'policy' ? 'Policy' : 'Template'}
      </span>
      <span className="bx-confirm__factname">{name}</span>
    </span>
  )
}

export function PolicyFact({ name }: { name: string }) {
  return <KindFact kind="policy" icon={ShieldCheck} name={name} />
}

/* A template named in a popup, the same tag with the template's own icon and word (the delete-template confirm). */
export function TemplateFact({ name }: { name: string }) {
  return <KindFact kind="template" icon={LayoutTemplate} name={name} />
}

/* Several policies, said as `AppFacts` says applications: "A, B and C". */
export function PolicyFacts({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((n, i) => (
        <Fragment key={`${i}-${n}`}>
          {i > 0 && (i === names.length - 1 ? ' and ' : ', ')}
          <PolicyFact name={n} />
        </Fragment>
      ))}
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
