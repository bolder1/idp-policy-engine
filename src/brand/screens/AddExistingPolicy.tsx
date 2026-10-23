import { Fragment, useEffect, useMemo, useState } from 'react'

import { Badge, Button, Callout, Drawer, SearchBox, TipDot } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { NoMatches } from '../empty'
import { useBrand } from '../store'
import { appsOf, type App, type Policy } from '../data'
import { isPostSignIn } from '../post-sign-in'
import { listNames } from '../rule-who'
import { AlsoNote } from './AppProtection'
import { policyOption } from './policy-option'
import { REPLACE_MAKES_DRAFT, attachKind, attachTo, detachFrom, type AttachKind } from './app-policies'
import { appStanding, deciderChanges, rowTip, takenFrom } from './app-standing'
import { SliderActions } from './select-rows'
import { PolicyPage } from './sign-in-tests/InspectPanel'

/* -----------------------------------------------------------------------------
   Add existing policy, from an application's Policies tab.

   A form and nothing else: the list it adds to is the page behind it, so the
   drawer does not draw it again. Pick a policy and the drawer says what it is
   — who it is for, its rules, what its last row does, where else it is — and
   where it would land on this application, read from the engine with the
   attach applied: its position, whom it takes over from, or that it would
   never decide.

   The picker files every policy by where it is now: unassigned first, then
   the ones on other applications, then the ones already here, greyed with the
   reason, as a policy that is not an app access policy is. The tenant default
   is never offered.

   The add itself is the page's (`onAdd`), so attaching from here and any other
   way the page grows go through the one write.
   -------------------------------------------------------------------------- */

const KIND_ORDER: Record<AttachKind, number> = { fresh: 0, also: 1, 'already-here': 2, system: 3 }

/* Whether `name` appears in `text` as a whole word, any case: "Box" in "Box
   for engineering" but not in "Dropbox". */
function hasWord(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

/* Another of the policy's applications, named in its name or a deny message:
   attached here, "Deny access to Box" would say Box on this application too. */
function namedApp(p: Policy, others: App[]): App | null {
  const texts = [p.name, ...p.rules.map((r) => r.denyMessage ?? ''), p.fallback?.denyMessage ?? ''].filter(Boolean)
  return others.find((a) => texts.some((t) => hasWord(t, a.name))) ?? null
}

export function AddExistingPolicy({
  open,
  app,
  checking = false,
  onClose,
  onAdd,
  onCopy,
  replacing,
}: {
  open: boolean
  app: App
  /** Before saving: applications is running on the pick (board/apps-guard.ts): the add waits for it. */
  checking?: boolean
  onClose: () => void
  /** Puts the policy on this application: the page's one attach. False when it no longer exists; 'checking' when the checks run first, and the page closes this drawer once they let the add through. */
  onAdd: (policyId: string) => boolean | 'checking'
  /** A draft copy with this application alone, opened in the builder. False when the policy no longer exists. */
  onCopy: (policyId: string) => boolean
  /** Swapping the application's one policy: the one it has now, which the pick takes the place of. */
  replacing?: Policy | null
}) {
  const store = useBrand()
  const { apps, groups, users } = store
  /* Replacing: read as if the current policy were already off this application, and never offer it back. */
  const policies = useMemo(
    () => (replacing ? store.policies.map((p) => (p.id === replacing.id ? detachFrom(p, app.id) : p)) : store.policies),
    [store.policies, replacing, app.id],
  )
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [q, setQ] = useState('')

  /* A fresh form each time it opens: one picked last time is not still picked. */
  useEffect(() => {
    if (!open) return
    setPickId(null)
    setTried(false)
    setGone(false)
    setQ('')
  }, [open])

  const options = useMemo(
    () =>
      policies
        /* Never a post sign-in policy, not even greyed: it is not a sign-in
           policy of another kind, it is kept apart (post-sign-in.ts). */
        .filter((p) => !p.isSystem && !isPostSignIn(p) && p.id !== replacing?.id)
        .map((p) => ({ p, kind: attachKind(p, app.id) }))
        /* Stable, so each group keeps the list's own order. */
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
        .map(({ p }) => policyOption(p, app, { apps, groups, users })),
    [policies, app, apps, groups, users, replacing],
  )

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? options.filter((o) => (o.label + ' ' + (o.meta ?? '')).toLowerCase().includes(k)) : options
  }, [options, q])

  const picked = pickId ? (policies.find((p) => p.id === pickId) ?? null) : null
  /* Deleted since it was picked, or found gone when Add re-read it. */
  const lost = gone || (pickId !== null && !picked)
  const kind = picked ? attachKind(picked, app.id) : null

  /* Where it would stand here: the list with the attach applied, asked of the engine. */
  const placement = useMemo(() => {
    if (!picked) return null
    /* A replace copies the pick as a draft (app-policies.ts `REPLACE_MAKES_DRAFT`), so none of the readings
       below apply: a draft holds no position, takes over from nobody and decides nothing yet. Saying
       "Position 1 · Takes over from …" here was wrong twice over — it described a swap that no longer happens,
       and it named the wrong policy while doing it, because `policies` has the current one already detached,
       so the engine answered about the tenant default instead of the policy actually being replaced. */
    if (replacing && REPLACE_MAKES_DRAFT) {
      return { pill: 'Draft', text: `Takes over from ${replacing.name} when you turn it on`, tip: null }
    }
    const after = policies.map((p) => (p.id === picked.id ? attachTo(p, app.id, apps) : p))
    const row = appStanding(app.id, after, users).rows.find((r) => r.policy.id === picked.id)
    if (!row) return null
    if (row.state === 'decides') {
      /* Every policy somebody leaves for it, people in two groups included:
         "AWS billing for Finance" on Box takes Maya Iyer off "Box for
         engineering" as well as Finance off the Global Default. */
      const froms = takenFrom(deciderChanges(app.id, policies, after, users, groups), picked.id).map((p) => p.name)
      return { pill: `Position ${row.n}`, text: froms.length > 0 ? `Takes over from ${listNames(froms, 2)}` : '', tip: null }
    }
    if (row.state === 'never') return { pill: 'Never decides', text: '', tip: rowTip(row, groups, users) }
    if (row.state === 'monitor') return { pill: 'Monitoring', text: 'Watches sign-ins, decides none', tip: null }
    return { pill: 'Not on', text: 'Decides nothing until turned on', tip: null }
  }, [picked, policies, app.id, apps, users, groups, replacing])

  const others = picked ? appsOf(picked, apps).filter((a) => a.id !== app.id) : []
  const named = picked ? namedApp(picked, others) : null

  const add = () => {
    setTried(true)
    if (!pickId || checking) return
    const added = onAdd(pickId)
    /* A policy that decides sign-ins is checked first: the drawer stays, and
       the page closes it once the add is made. */
    if (added === 'checking') return
    if (!added) {
      setGone(true)
      setPickId(null)
      return
    }
    onClose()
  }

  const copy = () => {
    if (!pickId) return
    if (!onCopy(pickId)) {
      setGone(true)
      setPickId(null)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={replacing ? 'Replace policy' : 'Add existing policy'}
      caption={app.name}
      width={680}
      actions={
        <SliderActions
          onCancel={onClose}
          /* Not while replacing: since a replace IS a draft copy, a second button offering one would be the same
             press twice under two names. */
          another={kind === 'also' && !replacing ? { label: 'Duplicate and add', run: copy } : null}
          primary={{
            /* "Replace with this policy" promised an immediate swap. The press makes a draft now, and a button
               is a verb for what it does, not for what it is a step towards. */
            label: checking ? 'Checking…' : replacing ? (REPLACE_MAKES_DRAFT ? 'Add as a draft' : 'Replace with this policy') : 'Add this policy',
            run: add,
            disabled: !picked || checking,
          }}
        />
      }
    >
      <div className="bapp__add">
        {/* Title only: what happened is the whole of it. */}
        {lost && (
          <Callout tone="notice" title="That policy no longer exists.">
            {null}
          </Callout>
        )}

        {/* The policies as a list, not a dropdown (owner, 13 Oct 2026): every one
            in view with what it is, filed by where it is now. Picking one opens
            its details; Change goes back to the list. */}
        {picked ? (
          <div className="bapp__pickedhead">
            <span className="bdt__label">Selected policy</span>
            <Button variant="link" onClick={() => setPickId(null)}>
              Change policy
            </Button>
          </div>
        ) : (
          <div className="bapp__pick">
            <SearchBox block value={q} onChange={setQ} placeholder="Search policies" label="Search policies" />
            {shown.length === 0 && <NoMatches compact noun="policies" query={q} onClear={() => setQ('')} />}
            {shown.map((o, i) => (
              <Fragment key={o.value}>
                {o.group && o.group !== shown[i - 1]?.group && <h3 className="bapp__pickgroup">{o.group}</h3>}
                <button
                  type="button"
                  className="bapp__pickrow"
                  disabled={o.disabled}
                  onClick={() => {
                    setPickId(o.value)
                    setGone(false)
                  }}
                >
                  {o.art && <span className="bapp__pickart">{o.art}</span>}
                  <span className="bapp__picktext">
                    <b>{o.label}</b>
                    {o.meta && <em>{o.meta}</em>}
                  </span>
                </button>
              </Fragment>
            ))}
            {tried && !picked && <p className="bz7__fielderr" role="alert">Choose a policy.</p>}
          </div>
        )}

        {picked && (
          <>
            {/* Where it lands here, the one fact the details page cannot know. */}
            {placement && (
              <div className="bapp__lands">
                <AppLogo appId={app.id} name={app.name} size={20} />
                <b>{app.name}</b>
                <Badge tone="neutral">{placement.pill}</Badge>
                {placement.text && <span>{placement.text}</span>}
                {placement.tip && <TipDot text={placement.tip} label={`About ${picked.name}`} />}
              </div>
            )}
            {/* Said first: they change what adding it means (owner, 13 Oct 2026). Not while replacing: the note
                warns that edits to a shared policy reach every application it is on, which is true of the pick
                and beside the point here — what lands is an independent copy, and the original keeps its
                applications untouched. */}
            {kind === 'also' && !(replacing && REPLACE_MAKES_DRAFT) && <AlsoNote picked={picked} />}
            {named && (
              <Callout tone="notice" title="Names another application">
                {named.name} appears in its name or a deny message.
              </Callout>
            )}
            {/* The rest is the Policy details slider's own page (owner, 13 Oct 2026):
                the overview card, then the rules in order, read only. */}
            <div className="insp__page" key={picked.id}>
              <PolicyPage policyId={picked.id} focus={undefined} plan={null} onEdit={() => {}} onOpenOne={() => {}} canvas />
            </div>

          </>
        )}
      </div>
    </Drawer>
  )
}
