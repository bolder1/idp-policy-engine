import { Confirm } from '../kit'
import { useBrand } from '../store'
import type { App, Policy } from '../data'
import { listNames } from '../rule-who'
import { AppFacts } from './app-facts'
import { replaceFacts, replaceTitle, replaceTone, type ReplaceFacts } from './applications-model'

/* -----------------------------------------------------------------------------
   Replace policy's one confirm (owner, 24 Oct 2026, option A: "pick a policy in
   a slider, one confirm that swaps it live on this app, with Undo. No copy, no
   draft").

   The admin has picked the policy in the slider (AddExistingPolicy.tsx), which
   stays open under this, so Cancel goes back to the pick. Replace writes both
   halves at once (applications-model.ts `replaceOnApp`): one toast, one Undo
   that puts both policies back.

   The Remove dialog's card (AppProtection.tsx `RemoveDialog`), which is the
   model for every popup since 23 Oct: a short title with the application only,
   each policy named once, the applications with their logos, two buttons. The
   lines read FROM and then TO, each with the consequence that belongs to it —
   what becomes of the policy coming off; the applications the one going on is
   on already — and, only when the one going on decides nothing yet, a third
   saying why and which policy decides here meanwhile.

   Tone by the status confirm's rule (applications-model.ts `replaceTone`): the
   red Replace only when the swap leaves the application with nothing of its
   own deciding, as Turn off is red; a warning when it changes who is let in;
   information when it moves nobody.
   -------------------------------------------------------------------------- */

export function ReplaceDialog({
  from,
  to,
  app,
  onCancel,
  onConfirm,
}: {
  /** The policy the application has now. Null: closed. */
  from: Policy | null
  /** The pick. Null: closed. */
  to: Policy | null
  app: App
  onCancel: () => void
  onConfirm: () => void
}) {
  const store = useBrand()
  const facts =
    from && to && from.id !== to.id
      ? replaceFacts(from, to, app, { policies: store.policies, apps: store.apps, users: store.users, groups: store.groups })
      : null
  const look = facts ? replaceTone(facts) : { tone: 'warning' as const, destructive: false }

  return (
    <Confirm
      open={!!facts}
      onClose={onCancel}
      tone={look.tone}
      shape="hero"
      title={replaceTitle(app)}
      confirmLabel="Replace"
      destructive={look.destructive}
      onConfirm={onConfirm}
    >
      {facts && from && to && <ReplaceCard from={from} to={to} app={app} facts={facts} />}
    </Confirm>
  )
}

/* Who decides here while the policy going on decides nothing, and why it does not. Its own line, after the
   applications that keep it, so "It" can only be the policy going on. "Decides here", not "sign-ins go to":
   centred at this width the hyphen was where the line broke. */
const WHY_NOT: Record<'draft' | 'inactive' | 'monitor', string> = {
  draft: 'It is a draft',
  inactive: 'It is inactive',
  monitor: 'It only monitors',
}

function Until({ until }: { until: NonNullable<ReplaceFacts['until']> }) {
  const next = <b>{until.next?.name ?? 'the tenant default'}</b>
  /* "Decides first" only of a policy that does stand in front of it (`ahead`). One naming nobody the directory has
     is shadowed by nothing, and the policy that decides is the fall-through — never "first". */
  if (until.state === 'never') return until.ahead ? <p>It never decides here: {next} decides first.</p> : <p>It never decides here, so {next} decides.</p>
  if (until.state === 'not-app-access') return <p>It is not an app access policy, so {next} decides here.</p>
  /* Draft, inactive or monitoring: turning it on is the one change that makes it decide. */
  return (
    <p>
      {WHY_NOT[until.state]}, so {next} decides here until it is turned on.
    </p>
  )
}

/** The card's two lines, drawn on their own so a test can read them (the dialog renders nothing without a document). */
export function ReplaceCard({ from, to, app, facts }: { from: Policy; to: Policy; app: Pick<App, 'id' | 'name'>; facts: ReplaceFacts }) {
  const { off, alsoOn, until, rest } = facts
  return (
    <div className="bapr__confirm is-card">
      <p>
        <b>{from.name}</b> comes off <AppFacts apps={[app]} />
        {off.kind === 'stays' ? (
          off.apps.length > 0 ? (
            <>
              . It stays on <AppFacts apps={off.apps} />.
            </>
          ) : (
            `. It stays on ${off.count} other ${off.count === 1 ? 'application' : 'applications'}.`
          )
        ) : off.kind === 'left' ? (
          ' and is left with no applications.'
        ) : off.rulesGo ? (
          ' and becomes a draft. Its saved draft replaces the published rules.'
        ) : (
          ' and becomes a draft.'
        )}
      </p>
      <p>
        <b>{to.name}</b> takes its place.
        {alsoOn.length > 0 && (
          <>
            {' '}
            <AppFacts apps={alsoOn} /> {alsoOn.length === 1 ? 'keeps' : 'keep'} it unchanged.
          </>
        )}
      </p>
      {until && <Until until={until} />}
      {/* The one going on decides for some of the people the old one did, and the rest fall through (`rest`): said
          once, by the policy they land on, as the Remove confirm says its "Its sign-ins go to". */}
      {rest.length > 0 && (
        <p>
          Everyone else here goes to <b>{listNames(rest.map((p) => p.name), 2)}</b>.
        </p>
      )}
    </div>
  )
}
