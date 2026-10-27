import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Badge, Button, Callout, Drawer, Modal, SearchBox, TipDot } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { NoMatches } from '../empty'
import { useBrand } from '../store'
import { appsOf, type App, type Policy } from '../data'
import { isPostSignIn } from '../post-sign-in'
import { listNames } from '../rule-who'
import { AlsoNote } from './AppProtection'
import { policyOption } from './policy-option'
import { REPLACE_IN_POPUP, REPLACE_MAKES_DRAFT, attachKind, attachTo, detachFrom, type AttachKind } from './app-policies'
import { appStanding, deciderChanges, rowTip, takenFrom, type RowState } from './app-standing'
import { replaceFacts, replaceTone } from './applications-model'
import { ReplaceCard } from './replace-dialog'
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

   The same drawer is Replace policy (`replacing`): the policy the application
   has now is read as already off it and never offered back, the line under
   the pick says what the pick will do here, and the footer is Cancel and
   Replace, which opens the page's one confirm over this drawer (owner, 24 Oct
   2026, option A; replace-dialog.tsx).

   REPLACE AS ONE POPUP (`REPLACE_IN_POPUP`, owner, 26 Oct 2026: "we don't need
   the side nav, we can directly showcase them something like a popup, and based
   on select showcase them the context"). Replacing is no longer a slider with a
   second dialog over it. It is one popup: the list, and once one is picked its
   context in the same place — the facts the confirm said (replace-dialog.tsx
   `ReplaceCard`: what comes off and what becomes of it, what takes its place,
   who decides meanwhile), the rules behind a disclosure — and the one button
   writes. Cancel is the only other. The popup IS the confirm, so none is drawn
   over it. Off: the slider and its confirm, as they were.
   -------------------------------------------------------------------------- */

const KIND_ORDER: Record<AttachKind, number> = { fresh: 0, also: 1, 'already-here': 2, system: 3 }

/* A replace's pick that is out of the race, as its pill: the status words the policies list uses. */
const OFF_PILL: Record<Exclude<RowState, 'decides' | 'never'>, string> = {
  draft: 'Draft',
  inactive: 'Inactive',
  monitor: 'Monitoring',
  'not-app-access': 'Not app access',
}

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
  confirming = false,
  asPopup,
  inline = false,
}: {
  open: boolean
  app: App
  /** Before saving: applications is running on the pick (board/apps-guard.ts): the add waits for it. */
  checking?: boolean
  onClose: () => void
  /** Puts the policy on this application: the page's one attach. False when it no longer exists; 'checking' when the checks run first, and the page closes this drawer once they let the add through; 'confirming' when a replace asks its confirm first (replace-dialog.tsx), over this drawer, which the page closes once the swap is made and which keeps the pick if it is cancelled. As the popup (`REPLACE_IN_POPUP`) a replace is never 'confirming': the popup is the confirm, and a press writes. */
  onAdd: (policyId: string) => boolean | 'checking' | 'confirming'
  /** A draft copy with this application alone, opened in the builder. False when the policy no longer exists. */
  onCopy: (policyId: string) => boolean
  /** Swapping the application's one policy: the one it has now, which the pick takes the place of. */
  replacing?: Policy | null
  /** The replace's confirm is open over this drawer: its Replace is the view's one orange button, so this one goes quiet. */
  confirming?: boolean
  /** Replace as a popup (true) or the slider and its confirm (false). Absent: `REPLACE_IN_POPUP`. A test's way to read either. */
  asPopup?: boolean
  /** Draw the popup's content in place instead of portalled, so a static render can read it (a Modal renders nothing without a document). Tests only. */
  inline?: boolean
}) {
  const store = useBrand()
  const { apps, groups, users } = store
  /* Replace as one popup, not a slider with a confirm over it (`REPLACE_IN_POPUP`). */
  const popup = (asPopup ?? REPLACE_IN_POPUP) && !!replacing && !REPLACE_MAKES_DRAFT
  /* Replacing: read as if the current policy were already off this application, and never offer it back. */
  const policies = useMemo(
    () => (replacing ? store.policies.map((p) => (p.id === replacing.id ? detachFrom(p, app.id) : p)) : store.policies),
    [store.policies, replacing, app.id],
  )
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [q, setQ] = useState('')
  /* The popup keeps the pick's rules behind a disclosure: who decides here is the sentence, the rules are for the
     admin who wants to read them, and a canvas under every pick made the popup taller than the window. */
  const [rulesOpen, setRulesOpen] = useState(false)
  /* Where the keyboard goes once a pick, or Change policy, has swapped the list for the details or back (review,
     24 Oct 2026): the control pressed unmounts with the half it was in, which dropped focus to <body>. */
  const refocus = useRef<'picked' | 'list' | null>(null)
  const pickedHead = useRef<HTMLDivElement | null>(null)
  const pickList = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const want = refocus.current
    if (!want) return
    refocus.current = null
    const to = want === 'picked' ? pickedHead.current?.querySelector<HTMLElement>('button') : pickList.current?.querySelector<HTMLElement>('input')
    to?.focus()
  }, [pickId])

  /* A fresh form each time it opens: one picked last time is not still picked. */
  useEffect(() => {
    if (!open) return
    setPickId(null)
    setTried(false)
    setGone(false)
    setQ('')
    setRulesOpen(false)
  }, [open])

  /* The popup opens on the search, ready to type: the list is why it was opened. A slider keeps the focus on its own
     shell, as it always did. */
  useEffect(() => {
    if (!open || !popup) return
    const t = window.setTimeout(() => pickList.current?.querySelector<HTMLElement>('input')?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open, popup])

  /* Replacing, a draft already on this application can be the pick (review, 24 Oct 2026): the copy Duplicate for {app}
     parks here is the natural way to put an edited copy in charge — attaching it changes nothing, and the old policy
     comes off. Filed first, under the application, because it is the one most likely meant. Anything else already
     here is still greyed: it is a stray the tab already offers to remove. */
  const options = useMemo(
    () =>
      policies
        /* Never a post sign-in policy, not even greyed: it is not a sign-in
           policy of another kind, it is kept apart (post-sign-in.ts). */
        .filter((p) => !p.isSystem && !isPostSignIn(p) && p.id !== replacing?.id)
        .map((p) => {
          const kind = attachKind(p, app.id)
          return { p, kind, here: !!replacing && p.status === 'draft' && kind === 'already-here' }
        })
        /* Stable, so each group keeps the list's own order. */
        .sort((a, b) => (a.here ? -1 : KIND_ORDER[a.kind]) - (b.here ? -1 : KIND_ORDER[b.kind]))
        .map(({ p, here }) => policyOption(p, app, { apps, groups, users }, { here })),
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
    const standing = appStanding(app.id, after, users)
    const row = standing.rows.find((r) => r.policy.id === picked.id)
    if (!row) return null
    /* The live swap (owner, 24 Oct 2026, option A): what the pick will do here, in one line. Not a position or
       a "takes over from": the application holds one policy, so there is no order to be placed in, and what it
       takes over from is the policy this slider is named for (and `policies` has that one detached already, so
       the engine would answer the Global Default). A pick that decides nothing yet says where the sign-ins go
       meanwhile — read from the same standing, so it names whatever decides next, the Global Default unless
       something else on the application stands in front of it. The confirm says all of it again with the
       policies named (replace-dialog.tsx). */
    if (replacing) {
      if (row.state === 'decides') return { pill: 'Decides', text: 'Takes effect on the next sign-in', tip: null }
      const next = ((row.state === 'never' ? row.lostTo[0]?.to : undefined) ?? standing.everyoneElse ?? standing.fallback)?.name ?? 'the tenant default'
      if (row.state === 'never') return { pill: 'Never decides', text: `Sign-ins go to ${next}`, tip: rowTip(row, groups, users) }
      return { pill: OFF_PILL[row.state], text: `Sign-ins go to ${next} until it is turned on`, tip: null }
    }
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

  /* The popup's context: the facts the second confirm used to say, read from the live tenant (the policy being
     replaced is still the application's here), and the tone that decides whether Replace is red. */
  const facts = useMemo(
    () =>
      popup && replacing && picked && replacing.id !== picked.id
        ? replaceFacts(replacing, picked, app, { policies: store.policies, apps: store.apps, users: store.users, groups: store.groups })
        : null,
    [popup, replacing, picked, app, store.policies, store.apps, store.users, store.groups],
  )
  const look = facts ? replaceTone(facts) : null

  const others = picked ? appsOf(picked, apps).filter((a) => a.id !== app.id) : []
  const named = picked ? namedApp(picked, others) : null

  const add = () => {
    setTried(true)
    if (!pickId || checking) return
    const added = onAdd(pickId)
    /* A policy that decides sign-ins is checked first, and a replace asks its
       confirm first: the drawer stays, with the pick, and the page closes it
       once the write is made. */
    if (added === 'checking' || added === 'confirming') return
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

  const footer = (
    <SliderActions
      onCancel={onClose}
      /* Not while replacing: a replace is one gesture with one way forward, so the footer is Cancel and
         Replace (owner, 23 Oct 2026: two buttons at most). With the draft copy (`REPLACE_MAKES_DRAFT`) a
         second button offering a copy would also have been the same press twice under two names. */
      another={kind === 'also' && !replacing ? { label: 'Duplicate and add', run: copy } : null}
      primary={{
        /* A button is a verb for what it does. With the draft copy the press made a draft, so it said so;
           the live swap (24 Oct 2026) is "Replace", the word on the confirm it opens, and that confirm
           names both policies, so the button need not. */
        label: checking ? 'Checking…' : replacing ? (REPLACE_MAKES_DRAFT ? 'Add as a draft' : 'Replace') : 'Add this policy',
        run: add,
        /* Nothing picked yet is a reason, so the button stays in the tab order and says it (Button `blocked`)
           rather than being skipped by the keyboard. Checking is not: its label already says what it waits on. */
        disabled: checking,
        blocked: !picked && !checking ? 'Pick a policy' : undefined,
        /* The confirm's Replace is the view's one orange button while it is up over this drawer. */
        quiet: confirming,
        /* The popup is the confirm, so it takes the confirm's tone: red only when the swap leaves the application
           with nothing of its own deciding, as Turn off is (applications-model.ts `replaceTone`). */
        danger: popup && !!look?.destructive,
      }}
    />
  )

  /* The policy's page, as the preview under the pick: the overview card, then the rules in order, read only. */
  const preview = picked && (
    <div className="insp__page" key={picked.id}>
      <PolicyPage policyId={picked.id} focus={undefined} plan={null} onOpenOne={() => {}} canvas preview />
    </div>
  )

  const body = (
    <div className={popup ? 'bapp__add is-popup' : 'bapp__add'}>
      {/* The popup says what it replaces first: the title is the job, this line is the object. */}
      {popup && replacing && (
        <p className="bapp__for">
          On <b>{app.name}</b>, in place of <b>{replacing.name}</b>
        </p>
      )}

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
        <div className={popup ? 'bapp__pickedhead is-named' : 'bapp__pickedhead'} ref={pickedHead}>
          {/* The popup names the pick here, where the admin looks to see what they chose; the slider's card below
              says it, and kept this row to the label. */}
          {popup ? (
            <div>
              <span className="bdt__label">Selected policy</span>
              <span className="bapp__pickedname">{picked.name}</span>
            </div>
          ) : (
            <span className="bdt__label">Selected policy</span>
          )}
          <Button
            variant="link"
            onClick={() => {
              refocus.current = 'list'
              setPickId(null)
              setRulesOpen(false)
            }}
          >
            Change policy
          </Button>
        </div>
      ) : (
        <div className="bapp__pick" ref={pickList}>
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
                  refocus.current = 'picked'
                  setPickId(o.value)
                  setGone(false)
                  setRulesOpen(false)
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

      {picked && popup && facts && replacing && (
        <>
          {/* The context, one card: what comes off and what becomes of it, what takes its place, who decides meanwhile,
              and when it takes effect. When the pick decides, the timing is the card's last line; when it does not, the
              card already says who decides until it is turned on, and a time would only contradict it. */}
          <div className={`bapp__ctx is-${look?.tone ?? 'warning'}`} aria-live="polite">
            <ReplaceCard from={replacing} to={picked} app={app} facts={facts} />
            {/* The shared-policy warning is a line of the card, not a box under it: the card already says where the
                pick stays, and this adds only what that means for editing it. */}
            {(placement?.pill === 'Decides' || kind === 'also') && (
              <p className="bapp__when">
                {placement?.pill === 'Decides' ? `${placement.text}.` : ''}
                {placement?.pill === 'Decides' && kind === 'also' ? ' ' : ''}
                {kind === 'also' ? `Edits to ${picked.name} apply to every application it is on.` : ''}
              </p>
            )}
          </div>
          {named && (
            <Callout tone="notice" title="Names another application">
              {named.name} appears in its name or a deny message.
            </Callout>
          )}
          <div className="bapp__rules">
            <button type="button" className="bapp__rulestoggle" aria-expanded={rulesOpen} onClick={() => setRulesOpen((o) => !o)}>
              <ChevronDown size={14} strokeWidth={2.2} aria-hidden className={rulesOpen ? 'is-open' : undefined} />
              Rules in {picked.name}
            </button>
            {rulesOpen && preview}
          </div>
        </>
      )}

      {picked && !(popup && facts) && (
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
          {/* Said first: they change what adding it means (owner, 13 Oct 2026). Not while replacing with the
              draft copy (`REPLACE_MAKES_DRAFT`): the note warns that edits to a shared policy reach every
              application it is on, which is true of the pick and beside the point there — what lands is an
              independent copy, and the original keeps its applications untouched. The live swap puts the
              shared policy itself on, so the note is said again. */}
          {kind === 'also' && !(replacing && REPLACE_MAKES_DRAFT) && <AlsoNote picked={picked} />}
          {named && (
            <Callout tone="notice" title="Names another application">
              {named.name} appears in its name or a deny message.
            </Callout>
          )}
          {/* The rest is the Policy details slider's own page (owner, 13 Oct 2026):
              the overview card, then the rules in order, read only. A preview (review, 24 Oct 2026): nothing on
              it edits from here, so nothing that would is drawn — no Edit beside its applications, a start node
              that is a sentence rather than a button, rule cards that fold — and its ids are its own, not the
              page canvas's under this drawer. */}
          {preview}
        </>
      )}
    </div>
  )

  if (popup && inline) {
    return open ? (
      <div className="bx-modal" role="dialog" aria-label="Replace policy">
        <header className="bx-modal__head">
          <h2>Replace policy</h2>
        </header>
        <div className="bx-modal__body">{body}</div>
        <footer className="bx-modal__foot">{footer}</footer>
      </div>
    ) : null
  }
  if (popup) {
    return (
      <Modal open={open} onClose={onClose} title="Replace policy" width={680} footer={footer}>
        {body}
      </Modal>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={replacing ? 'Replace policy' : 'Add existing policy'}
      /* Replacing, the head names what is being replaced (review, 24 Oct 2026): the slider never said it, and the
         admin first met the old policy's name in the confirm. Once, here; the confirm names it again as its own
         first fact. */
      caption={replacing ? `On ${app.name}, in place of ${replacing.name}` : app.name}
      width={680}
      actions={footer}
    >
      {body}
    </Drawer>
  )
}
