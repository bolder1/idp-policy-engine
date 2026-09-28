import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button, Modal } from '../kit'
import { appsOf, enforces, type App, type Policy, type PolicyStatus } from '../data'
import { guardSignIns } from '../draft-checks'
import { commitToast, lastSaved, monitorBlocker, published, sameRules, turnOnBlocker, type RuleSet } from '../policy-draft'
import { useBrand, useNameLookup } from '../store'
import { listPhrase } from './app-policies'
import { diagnose } from './diagnostics'
import { GuardDrawer, type GuardVersion } from './guard-page'
import { editsTip, isStale, overridePatch, patchSignIns, tryRunGuard, guardOpens, type EditsFrom, type GuardInput, type GuardResult, type GuardStamp, type ReadyFix, type SignInCheck } from './guard'
import { SAMPLE_DAY, monitorRows, monitorSamples, planOf, type MonitorPlan } from './monitor-sample'
import { MonitoringPage } from './monitoring-page'
import { useSimEnv } from './sim-env'
import {
  asksFirst,
  guardFor,
  offersMonitoringView,
  portalRoot,
  statusConfirmCopy,
  statusToast,
  turnOnExtras,
  watchAfter,
  type GuardedKind,
  type MonitoringWatch,
  type StatusTarget,
} from './status-options'

/* -----------------------------------------------------------------------------
   Switching a published policy on, off and to monitoring.

   One confirmation and one menu, used by both builder bars and the Policies row
   menu, so the same choice leaves the same status wherever it is made. Reads
   and writes the STORED policy: a builder holds its own copy, and the status is
   not part of what a builder edits.

   A switch that changes nobody's sign-in — Inactive to Monitoring and back —
   is made at once with an Undo; the rest confirm first (`asksFirst`).

   Where the edition has the checks (`features.beforeTurningOn`), the switches
   that change who is let in go through them (final spec, D.2–D.3):

     Turn on                  Before turning on, always — from Inactive and
                              from Monitoring. It offers the version with the
                              admin's edits, when there are any, beside the
                              stored one; from Inactive it offers Monitor
                              instead; from Monitoring it says what the
                              modelled sign-ins would get.
     Turn off, Monitor        Before turning off / switching to monitoring,
     (from Active)            only when somebody is newly let in — otherwise
                              the one-line confirm. Never blocks.

   Only Turn on can be stopped, and only by a Must pass or Protected saved
   sign-in that newly fails. "Can't turn on" for a draft or a policy with no
   application is asked before any check, as it always was.

   The Monitoring page lives here too (`viewMonitoring`), because both ways out
   of it are switches — its footer turns the policy on or off — and because
   Before turning on links back to it from the While monitoring row. It shows
   while the policy is monitoring, and closes the moment it is not.
   -------------------------------------------------------------------------- */

/* The applications, as words in a sentence. Null when there are none. */
function appsPhrase(policy: Policy, apps: App[]): string | null {
  if (policy.isSystem) return 'every application'
  const named = appsOf(policy, apps)
  return named.length === 0 ? null : listPhrase(named.map((a) => a.name))
}

interface Ask {
  policy: Policy
  target: StatusTarget
  blocker: string | null
  /* Where the fix is: the policy's rules, or its applications. */
  fix: 'open' | 'apps' | null
  /* The builder held edits nobody had saved when this was asked. */
  unsaved: boolean
}

/* One guard page, as it stands: the switch, the versions it can turn on, and
   the checks as they last ran. */
interface GuardAsk {
  kind: GuardedKind
  policyId: string
  name: string
  from: PolicyStatus
  /** The rules turning on can use instead of the stored ones: the board's, a saved draft's, or a fix made here. */
  edits: RuleSet | null
  /** Where `edits` started, and the ready fixes made on the page since: the version's hover title says both. */
  editsFrom: EditsFrom | null
  fixes: number
  version: GuardVersion
  result: GuardResult | 'error'
  /** Why the chosen version cannot turn on whatever the checks say. */
  blocked: string | null
  stamp: GuardStamp
  run: number
  /** From Monitoring: the plan line the modelled sign-ins add up to. */
  plan: MonitorPlan | null
}

export interface StatusChangeOptions {
  /* "Assign applications" in the Can't dialog. Given, it runs this instead of
     leaving for Policy details — the list opens its own dialog. */
  onAssignApps?: (policy: Policy) => void
  /** Called just before a change is written, confirmed or not. */
  onChange?: (policy: Policy, target: StatusTarget) => void
  /** The builder holds edits nobody has saved. Monitoring reads the stored rules, so switching to it says they are not included. */
  unsaved?: boolean
  /** The builder's unsaved rules, which Before turning on offers as the version to turn on. */
  edits?: RuleSet
  /* The board: a ready fix made on Before turning on lands on its draft, with
     Undo, rather than only in the page — so what turns on is what the board
     shows afterwards. Given, the page is on the board: it watches the draft,
     and asks for the checks again when an Undo takes the fix back. */
  onEditsFix?: (next: RuleSet, toast: string) => void
  /** The board: a rule reference on the page shows the rule on the chain. */
  onRevealRule?: (index: number | null) => void
  /* The board: the Break-in row's Open pushes
     the test inside the board's own test panel (final spec, D.3). */
  onOpenBreakIn?: () => void
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function useStatusChange(options: StatusChangeOptions = {}): {
  request: (policy: Policy, target: StatusTarget, opts?: { edits?: RuleSet }) => void
  /** Opens the Monitoring page for a monitoring policy (spec C §3.4). */
  viewMonitoring: (policyId: string) => void
  dialog: ReactNode
} {
  const store = useBrand()
  const env = useSimEnv()
  const resolve = useNameLookup()
  const [ask, setAsk] = useState<Ask | null>(null)
  /* Separate from `ask`, so the dialog keeps its words while it animates out. */
  const [open, setOpen] = useState(false)
  const [guard, setGuard] = useState<GuardAsk | null>(null)
  const [guardOpen, setGuardOpen] = useState(false)
  /* The Monitoring page: which policy, kept while it animates out, and whether it is open. */
  const [watch, setWatch] = useState<MonitoringWatch | null>(null)
  /* Undo on a ready fix made from the list, where the page holds the fix: it
     runs after later renders, so it reads the page as it is then (below). */
  const undoFix = useRef<(fixed: RuleSet, back: GuardAsk) => void>(() => {})
  /* The toast outlives the page that made it: an Undo pressed after it went has nothing to restore. */
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const stampNow = (): GuardStamp => ({ policies: store.policies, zones: store.zones, fingerprints: store.fingerprints, riskScale: store.riskScale })

  /* Writes the switch and says so. `from` is the status it was asked from, so
     Undo goes back to what the admin saw rather than to whatever a second
     switch left. */
  const commit = (policy: Policy, target: StatusTarget) => {
    options.onChange?.(policy, target)
    store.setPolicyStatus(policy.id, target)
    const { text, undo } = statusToast(policy.name, policy.status, target)
    store.showToast(text, undo ? { label: 'Undo', run: () => store.setPolicyStatus(policy.id, undo) } : undefined)
  }

  /* Blocking errors on a version's rules, counted on the rules that run. */
  const errorsOf = (p: Policy) =>
    diagnose(p, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints }).filter(
      (d) => d.severity === 'error' && p.rules[d.ruleIndex]?.enabled !== false,
    ).length

  /* The policy with a version's rules, as it would be stored once on. */
  const withRules = (policy: Policy, rules: RuleSet): Policy => published({ ...policy, rules: rules.rules, fallback: rules.fallback })

  const guarded = (policy: Policy) => store.features.beforeTurningOn && policy.type === 'App Access' && !policy.isSystem

  const inputFor = (policy: Policy, kind: GuardedKind, rules: RuleSet | null, signIns = store.savedSignIns): GuardInput => {
    const status: PolicyStatus = kind === 'turn-on' ? 'active' : kind === 'turn-off' ? 'inactive' : 'monitor'
    return {
      kind,
      before: enforces(policy) ? policy : null,
      after: { ...(rules ? withRules(policy, rules) : policy), status },
      changedFrom: kind === 'turn-on' ? policy : null,
      policies: store.policies,
      env,
      apps: store.apps,
      /* The policy's own checks too, as stored (describe spec, §5.5). */
      savedSignIns: guardSignIns(signIns, policy, store.users, store.apps, store.features.draftChecks),
      adminId: store.account.id,
      breakIn: store.features.breakInTest ? (store.breakInAccepted[policy.id] ?? {}) : null,
      resolve,
    }
  }

  /* The version with the edits, as it stands: the builder's unsaved rules,
     else a saved draft's, else none. */
  const editsNow = (policy: Policy, given?: RuleSet): Pick<GuardAsk, 'edits' | 'editsFrom' | 'fixes'> => {
    const draft = policy.pendingDraft
    if (given) return { edits: given, editsFrom: 'board', fixes: 0 }
    if (draft) return { edits: { rules: draft.rules, fallback: draft.fallback }, editsFrom: 'draft', fixes: 0 }
    return { edits: null, editsFrom: null, fixes: 0 }
  }

  /* Runs the checks for a guard page and holds what they said. */
  const runGuardAsk = (
    policy: Policy,
    kind: GuardedKind,
    rest: Pick<GuardAsk, 'edits' | 'editsFrom' | 'fixes' | 'version' | 'plan'>,
    signIns = store.savedSignIns,
    run = 0,
  ): GuardAsk => {
    const rules = rest.version === 'edits' ? rest.edits : null
    const chosen = rules ? withRules(policy, rules) : policy
    return {
      kind,
      policyId: policy.id,
      name: policy.name,
      from: policy.status,
      ...rest,
      result: tryRunGuard(inputFor(policy, kind, rules, signIns)),
      blocked: kind === 'turn-on' ? turnOnBlocker({ ...chosen, pendingDraft: rules ? undefined : chosen.pendingDraft }, errorsOf(chosen)) : null,
      stamp: stampNow(),
      run,
    }
  }

  const request = (given: Policy, target: StatusTarget, opts: { edits?: RuleSet } = {}) => {
    const policy = store.policyById(given.id) ?? given
    const unsaved = options.unsaved === true
    let blocker: string | null = null
    let fix: Ask['fix'] = null
    const noApps = policy.status !== 'draft' && !policy.isSystem && policy.appIds.length === 0

    /* Which page, if any (`guardFor`). Before turning on: a draft or a policy
       with no application is refused before any check, as it always was, and
       errors are counted per version in the page, so a clean version is never
       refused for the other one. Turn off and Active → Monitoring: a page only
       when somebody is newly let in. The checks run once, here, and the page
       shows what they said. */
    const withEdits = editsNow(policy, opts.edits ?? options.edits)
    const held: { page?: GuardAsk } = {}
    const kind = guardFor(policy, target, {
      guarded: guarded(policy),
      turnsOn: () =>
        turnOnBlocker(policy, errorsOf(policy)) === null ||
        (withEdits.edits !== null && turnOnBlocker({ ...policy, pendingDraft: undefined }, errorsOf(withRules(policy, withEdits.edits))) === null),
      newlyAllows: () => {
        held.page = runGuardAsk(policy, target === 'inactive' ? 'turn-off' : 'to-monitor', { edits: null, editsFrom: null, fixes: 0, version: 'stored', plan: null })
        return held.page.result !== 'error' && guardOpens(held.page.result)
      },
    })
    if (kind === 'turn-on') {
      const plan = turnOnExtras(policy).whileMonitoring ? planOf(monitorRows(policy, store.policies, env, monitorSamples(policy, env, SAMPLE_DAY))) : null
      held.page = runGuardAsk(policy, 'turn-on', { ...withEdits, version: withEdits.edits ? 'edits' : 'stored', plan })
    }
    if (kind && held.page) {
      setGuard(held.page)
      setGuardOpen(true)
      return
    }

    if (target === 'active') {
      /* The live rules only: a saved draft or a builder copy is not what turns on. */
      blocker = turnOnBlocker(policy, errorsOf(policy))
      if (blocker) fix = noApps ? 'apps' : 'open'
    } else if (target === 'monitor') {
      /* Rule errors never block it: a monitoring policy enforces nothing. */
      blocker = monitorBlocker(policy)
      if (blocker) fix = 'apps'
    }
    if (!blocker && !asksFirst(policy.status, target, unsaved || !!policy.pendingDraft)) {
      commit(policy, target)
      return
    }
    setAsk({ policy, target, blocker, fix, unsaved })
    setOpen(true)
  }

  const close = () => setOpen(false)

  /* --- The Monitoring page -------------------------------------------------------

     It shows a monitoring policy and nothing else. Switched on or off — from its
     own footer, the list, a toast's Undo — or deleted, it closes; switched back
     to monitoring later, it stays closed until it is asked for again (`watchAfter`). */
  const viewMonitoring = (policyId: string) => setWatch({ policyId, open: true })
  const watched = watch ? store.policyById(watch.policyId) : undefined
  const watching = !!watched && offersMonitoringView(watched, { monitor: store.features.monitorMode })
  const watchNow = watchAfter(watch, watching)
  if (watchNow !== watch) setWatch(watchNow)
  const watchRows = useMemo(
    () => (watched && watching ? monitorRows(watched, store.policies, env, monitorSamples(watched, env, SAMPLE_DAY)) : []),
    [watched, watching, store.policies, env],
  )
  /* Its footer's switches go the way every switch goes. The page closes first,
     and the switch is asked on the next tick, once the page has given focus
     back to whatever opened it — so Before turning on, closing, returns focus
     there too, not to a button that has gone. */
  const switchFromPage = (target: StatusTarget) => {
    if (!watch || !watched) return
    const policy = watched
    setWatch({ ...watch, open: false })
    window.setTimeout(() => {
      if (alive.current) request(policy, target)
    }, 0)
  }
  const monitoringPage = watch ? (
    <MonitoringPage
      open={watch.open && watching}
      policy={watched ?? null}
      rows={watchRows}
      env={env}
      onClose={() => setWatch({ ...watch, open: false })}
      onTurnOn={() => switchFromPage('active')}
      onTurnOff={() => switchFromPage('inactive')}
    />
  ) : null

  let dialog: ReactNode = null
  if (ask) {
    const { policy, target, blocker, fix, unsaved } = ask
    const name = policy.name
    const screen = store.screen
    /* Already in this policy's builder, "Open policy" would go nowhere. */
    const here = (screen.name === 'board' || screen.name === 'builder') && screen.policyId === policy.id

    if (blocker) {
      dialog = (
        <Modal
          open={open}
          onClose={close}
          title={target === 'monitor' ? `Can't monitor ${name}` : `Can't turn on ${name}`}
          width={480}
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
              {fix === 'apps' && (
                <Button
                  variant="brand"
                  onClick={() => {
                    close()
                    if (options.onAssignApps) {
                      options.onAssignApps(policy)
                      return
                    }
                    const from = screen.name === 'builder' ? 'builder' : screen.name === 'policies' ? 'policies' : 'board'
                    store.go({ name: 'policy-details', policyId: policy.id, from })
                  }}
                >
                  Assign applications
                </Button>
              )}
              {fix === 'open' && !here && (
                <Button
                  variant="brand"
                  onClick={() => {
                    close()
                    store.go({ name: 'board', policyId: policy.id })
                  }}
                >
                  Open policy
                </Button>
              )}
            </>
          }
        >
          <div className="bx-confirm">
            <p>{blocker}</p>
          </div>
        </Modal>
      )
    } else {
      /* The words live in `statusConfirmCopy`, where a test pins them:
         Monitoring reads the stored rules — never the builder's edits, never a
         saved draft — and Inactive → Monitoring says which is held back. */
      const copy = statusConfirmCopy(policy, target, unsaved, appsPhrase(policy, store.apps))

      dialog = (
        <Modal
          open={open}
          onClose={close}
          title={copy.title}
          width={480}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="brand"
                onClick={() => {
                  commit(policy, target)
                  close()
                }}
              >
                {copy.verb}
              </Button>
            </>
          }
        >
          <div className="bx-confirm">
            {copy.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </Modal>
      )
    }
  }

  /* --- The guard page ----------------------------------------------------------- */
  let guardPage: ReactNode = null
  const stored = guard ? store.policyById(guard.policyId) : undefined
  if (guard && stored) {
    const g = guard
    const shut = () => setGuardOpen(false)
    const rerun = (next: Partial<Pick<GuardAsk, 'edits' | 'editsFrom' | 'fixes' | 'version'>> = {}, signIns = store.savedSignIns) =>
      setGuard(
        runGuardAsk(stored, g.kind, { edits: g.edits, editsFrom: g.editsFrom, fixes: g.fixes, version: g.version, plan: g.plan, ...next }, signIns, g.run + 1),
      )

    /* On the board the edits version is the board's draft, and the board can
       move under the page: an Undo on a fix's toast takes the fix back off the
       draft. The page is then out of date ("Changed since you opened this"),
       and running the checks again reads the draft as it now is. `boardShows`
       is the draft: the unsaved rules, else the last save. */
    const onBoardHost = !!options.onEditsFix
    const boardShows = onBoardHost ? (options.edits ?? lastSaved(stored)) : null
    const boardMoved = !!boardShows && !!g.edits && !sameRules(boardShows, g.edits)
    const stale = guardOpen && (isStale(g.stamp, stampNow()) || boardMoved)
    const recheck = () => {
      if (!boardMoved) return rerun()
      const now = editsNow(stored, options.edits)
      rerun({ ...now, version: now.edits ? g.version : 'stored' })
    }
    /* A rule reference shows the rule on the chain only when the version the
       page read is the one the board draws, so the numbers are the same. */
    const chosen: RuleSet = g.version === 'edits' && g.edits ? g.edits : { rules: stored.rules, fallback: stored.fallback }
    const onRevealRule = boardShows && sameRules(boardShows, chosen) ? options.onRevealRule : undefined

    const confirm = () => {
      shut()
      if (g.kind === 'turn-off') return commit(stored, 'inactive')
      if (g.kind === 'to-monitor') return commit(stored, 'monitor')
      if (g.version === 'edits' && g.edits) {
        /* With the edits: saved and turned on in one write. A saved draft ends
           with it when it is what turned on; a fix made on the stored version
           leaves it where it was. */
        const next: Policy =
          g.editsFrom === 'stored'
            ? { ...stored, rules: g.edits.rules, fallback: g.edits.fallback, status: 'active' }
            : { ...withRules(stored, g.edits), status: 'active' }
        options.onChange?.(stored, 'active')
        store.savePolicy(next)
        store.showToast(commitToast(stored, next))
        return
      }
      commit(stored, 'active')
    }

    /* A ready fix makes the edits version: on the board it lands on the draft
       with the board's own Undo; from the list the page holds it, with an Undo
       that takes the page back. A fix made on the stored version, when there
       were edits, starts the version again from the stored rules — the toast
       says so, and on the board the draft takes it. */
    const applyFix = (f: ReadyFix) => {
      const rules: RuleSet = { rules: f.policy.rules, fallback: f.policy.fallback }
      const onStored = g.version === 'stored'
      const toast = `${f.label}${onStored && g.edits ? ' on the stored version' : ''}. Not saved yet.`
      if (options.onEditsFix) options.onEditsFix(rules, toast)
      else store.showToast(toast, { label: 'Undo', run: () => undoFix.current(rules, g) })
      rerun({ edits: rules, version: 'edits', editsFrom: onStored ? 'stored' : g.editsFrom, fixes: onStored ? 1 : g.fixes + 1 })
    }
    undoFix.current = (fixed, back) => {
      if (!alive.current) return
      if (g.policyId !== back.policyId || g.edits !== fixed) {
        store.showToast('Other changes came after it.')
        return
      }
      setGuard(runGuardAsk(stored, g.kind, { edits: back.edits, editsFrom: back.editsFrom, fixes: back.fixes, version: back.version, plan: g.plan }, store.savedSignIns, g.run + 1))
      store.showToast('Restored')
    }

    const override = (c: SignInCheck, reason: string) => {
      const patch = overridePatch(c, reason, store.account.name, new Date().toISOString())
      if (!patch) return
      store.updateSavedSignIn(c.signIn.id, patch)
      rerun({}, patchSignIns(store.savedSignIns, c.signIn.id, patch))
    }

    /* The Break-in test lives in the board's test panel, pushed over Saved
       sign-ins (final spec, D.3). From anywhere but a board: the policy's
       board, with the test open in its panel. On a board: the board passes
       the way into its own panel; the trail offers no Open, because leaving
       would take the edits with it. */
    const toBoardPanel = options.onOpenBreakIn
    const onBoard = store.screen.name === 'board' || store.screen.name === 'builder'
    const offered = store.features.breakInTest && store.features.policyTesting && (!onBoard || toBoardPanel !== undefined)
    const openBreakIn = !offered
      ? undefined
      : () => {
          shut()
          if (onBoard) {
            toBoardPanel?.()
            return
          }
          store.go({ name: 'board', policyId: stored.id, open: 'break-in' })
        }

    /* Monitor instead watches the stored rules. When the page offers other
       rules — the board's edits, a saved draft, a fix made here — it goes
       through the Inactive → Monitoring confirmation, which says which of them
       is left out, rather than dropping them without a word. */
    const monitorInstead =
      g.kind === 'turn-on' && turnOnExtras({ ...stored, status: g.from }, { monitor: store.features.monitorMode }).monitorInstead
        ? () => {
            shut()
            const unsaved = options.unsaved === true || g.fixes > 0
            if (!asksFirst(stored.status, 'monitor', unsaved || !!stored.pendingDraft)) return commit(stored, 'monitor')
            setAsk({ policy: stored, target: 'monitor', blocker: null, fix: null, unsaved })
            setOpen(true)
          }
        : undefined
    const storedSaid = `Saved ${lower(stored.lastModified)} by ${stored.modifiedBy}`

    guardPage = (
      <GuardDrawer
        open={guardOpen}
        kind={g.kind}
        policyName={g.name}
        result={g.result}
        run={g.run}
        primaryLabel={g.kind === 'turn-on' ? 'Turn on' : g.kind === 'turn-off' ? 'Turn off' : 'Monitor'}
        onConfirm={confirm}
        onClose={shut}
        version={
          g.kind === 'turn-on' && g.edits
            ? {
                value: g.version,
                tips: { edits: editsTip(g.editsFrom ?? 'stored', g.fixes, stored.pendingDraft), stored: storedSaid },
                onChange: (version) => rerun({ version }),
              }
            : null
        }
        blockedReason={g.blocked}
        storedSaid={storedSaid}
        stale={stale}
        onRerun={recheck}
        onApplyFix={applyFix}
        onOverride={override}
        onRevealRule={onRevealRule}
        onOpenBreakIn={openBreakIn}
        onMonitorInstead={monitorInstead}
        monitoring={g.kind === 'turn-on' ? g.plan : null}
        onViewMonitoring={
          g.kind === 'turn-on' && g.plan && store.features.monitorMode
            ? () => {
                /* On the next tick, as the page's own switches are: the guard gives focus back first. */
                shut()
                window.setTimeout(() => {
                  if (alive.current) viewMonitoring(stored.id)
                }, 0)
              }
            : undefined
        }
      />
    )
  }

  /* Portalled, so a sticky cell or a bar cannot trap its scrim. */
  return {
    request,
    viewMonitoring,
    dialog:
      dialog || guardPage || monitoringPage ? (
        <>
          {monitoringPage ? createPortal(monitoringPage, portalRoot()) : null}
          {dialog ? createPortal(dialog, portalRoot()) : null}
          {guardPage ? createPortal(guardPage, portalRoot()) : null}
        </>
      ) : null,
  }
}
