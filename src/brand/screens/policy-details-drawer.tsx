import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Power, type LucideIcon } from 'lucide-react'

import { Badge, Button, Drawer, StatusPill, Tabs } from '../kit'
import './policy-details-drawer.css'
import { useBrand } from '../store'
import { ChangeState, DraftTag } from '../leave-guard'
import { DRAFT_TAG } from '../draft-tag'
import { shows } from '../rollout'
import { loadAndGo } from './guarded-moves'
import { PolicyPage } from './sign-in-tests/InspectPanel'
import { isPeek, type InspectTarget } from './sign-in-tests/inspect-model'
import { Block } from './sign-in-tests/PeekViews'
import { DockPast } from './testing/DockPast'
import { useTestingSession } from './testing/session-state'
import type { SignInForm } from './testing/sign-in-form'
import { policyApps } from './testing/test-dock'
import { HIDE_CHECKS } from '../tester'

/* -----------------------------------------------------------------------------
   A policy's details, in a slider over the Policies list (owner, 6 Oct 2026:
   "add the Policy details view here as well, with an Open in builder", then
   "add it to a basic slider", then "add the past sign-in list here as well").

   The same page Access checks opens beside a run (InspectPanel.tsx
   `PolicyPage`) without the run: the overview card — status, applications,
   audience, the last change — then the rules in order, each opening in place
   on what it checks, what it uses and what the person is told. Under them, the
   week's sign-ins on its applications, as the policy's own Check access lists
   them (testing/DockPast.tsx): a row opens that sign-in there. A press on a
   policy's name opens it; the kit's Drawer, as Read as text is.

   One way out, at the foot: Open in builder, on the rule that is open where
   exactly one is. What a rule uses opens its own library page.
   -------------------------------------------------------------------------- */

/* Hidden for now (owner, 7 Oct 2026): the week's sample sign-ins under the rules. Kept, not deleted. */
const PAST_IN_DETAILS = false

/* Draft / Live on the Rules of a policy with a saved draft, Draft first (rollout.ts `drawerDraftRules`). */
const DRAFT_RULES = shows('drawerDraftRules')
type Version = 'draft' | 'live'
const VERSIONS: { value: Version; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
]

const LIBRARY_SCREEN = { zone: { name: 'zones' }, device: { name: 'fingerprint' }, risk: { name: 'risk-signals' }, hook: { name: 'hooks' }, app: { name: 'applications' } } as const

export function PolicyDetailsDrawer({
  open,
  policyId,
  onClose,
  boardFrom,
  statusHead = false,
  template,
  onMakeActive,
}: {
  open: boolean
  policyId: string
  onClose: () => void
  /* Opened on an application's page: the board this drawer opens says so, and
     its way back returns to that application (BoardBar.tsx). */
  boardFrom?: { appId: string }
  /** The status in the drawer's head, beside its title, and not again on the overview card (rollout.ts `policyDrawer`;
   *  owner, 25 Nov 2026: "include a dedicated status and button"). Open in builder is then the drawer's one orange. */
  statusHead?: boolean
  /** Mark as template, or Remove from templates, as the row's menu says it; greyed with why while it cannot be one yet
   *  (owner, 25 Nov 2026: "add an option to mark as a template"). */
  template?: { label: string; hold: string | null; icon: LucideIcon; onPress: () => void }
  /** A policy saved as a draft, on an application: Make active, which publishes and activates it in one confirm
   *  (use-status-change.tsx `draftActivates`; owner, 25 Nov 2026: "for draft one we can also add make active"). */
  onMakeActive?: () => void
}) {
  const store = useBrand()
  const session = useTestingSession()
  const policy = store.policies.find((p) => p.id === policyId)
  const mine = useMemo(() => (policy ? policyApps(policy, store.apps) : []), [policy, store.apps])
  /* The rule the builder opens on: the one open, where exactly one is. */
  const [openOne, setOpenOne] = useState<string | null | undefined>(undefined)
  const from = boardFrom ? { from: boardFrom } : null
  const [showPast, setShowPast] = useState(false)
  /* Draft first each time the drawer opens, or opens on another policy. */
  const [version, setVersion] = useState<Version>('draft')
  useEffect(() => {
    if (open) setVersion('draft')
  }, [open, policyId])
  const draft = DRAFT_RULES ? policy?.pendingDraft : undefined
  const onDraft = !!draft && version === 'draft'
  const go = (t: InspectTarget) => {
    if (t.kind === 'see') return
    if (isPeek(t)) {
      if (t.kind !== 'person') store.go(LIBRARY_SCREEN[t.kind])
      return
    }
    store.go(
      t.kind === 'rule'
        ? { name: 'board', policyId: t.policyId, rule: t.ruleId ?? 'fallback', ...from }
        : { name: 'board', policyId: t.policyId, ...from },
    )
  }
  const toBuilder = () => go(openOne !== undefined ? { kind: 'rule', policyId, ruleId: openOne } : { kind: 'policy', policyId })
  /* A past sign-in: tried in the policy's own Check access, as its Past sign-ins
     row does there. Loaded inside the guarded move (guarded-moves.ts): on an
     application's page with Basic unsaved, Keep editing must leave the board's
     form as it was. */
  const tryPast = (form: SignInForm) =>
    loadAndGo(store, () => session.loadBoard(policyId, form), { name: 'board', policyId, open: 'try', ...from })
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Policy details"
      width={680}
      head={
        (statusHead || onDraft || (DRAFT_TAG && !!policy?.pendingDraft)) && policy ? (
          <div className="bpd-head">
            <h2>Policy details</h2>
            {statusHead && <StatusPill status={policy.status} />}
            {/* Which version the Rules show, in the row's own Draft words (owner, 25 Nov 2026: a Draft tag in the head). */}
            {/* Under `draftTag` the head says a draft waits whichever version the Rules show, as the row does. */}
            {DRAFT_TAG ? !!policy.pendingDraft && <DraftTag /> : onDraft && <ChangeState unsaved={false} draft />}
          </div>
        ) : undefined
      }
      actions={
        /* Without the Design drawer's extras (rollout `policyDrawer`), the foot is the bare button it always was. */
        !statusHead && !template && !onMakeActive ? (
          <Button variant="secondary" iconRight={ArrowUpRight} onClick={toBuilder}>
            Open in builder
          </Button>
        ) : (
        <span className="bpd-foot">
          {/* The template on the left, apart from the ways forward on the right. */}
          {template && (
            <span className="bpd-foot__start">
              <Button variant="secondary" icon={template.icon} title={template.hold ?? undefined} blocked={template.hold ?? undefined} onClick={template.onPress}>
                {template.label}
              </Button>
            </span>
          )}
          {onMakeActive && (
            <Button variant="secondary" icon={Power} onClick={onMakeActive}>
              Make active
            </Button>
          )}
          <Button variant={statusHead ? 'brand' : 'secondary'} iconRight={ArrowUpRight} onClick={toBuilder}>
            {/* A draft waits (Draft changes on the page, or a policy still a draft): the builder opens on it, so the button
                says so (owner, 25 Nov 2026: "here we can say continue editing"). */}
            {statusHead && policy && (policy.pendingDraft || policy.status === 'draft') ? 'Continue editing' : 'Open in builder'}
          </Button>
        </span>
        )
      }
    >
      <div className="insp__page" key={policyId}>
        <PolicyPage policyId={policyId} focus={undefined} plan={null} onEdit={go} onOpenOne={setOpenOne} canvas heroStatus={!statusHead} diffShown={!statusHead}
          rulesOf={onDraft ? draft : undefined}
          rulesAside={draft ? <Tabs<Version> className="bpd-ver" name="Rules version" value={version} onChange={setVersion} options={VERSIONS} /> : undefined}
        />
        {PAST_IN_DETAILS && !HIDE_CHECKS && policy && mine.length > 0 && (
          /* Modelled sign-ins say so wherever they are drawn (test-dock.ts), here too, though the cards above the list are gone. */
          /* Folded: a week of rows at the foot made the slider read as a log. One press unfolds it (owner, 7 Oct 2026). */
          <Block
            title="Past sign-ins"
            aside={
              <>
                <Badge tone="neutral">Sample</Badge>
                <Button variant="ghost" size="sm" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
                  {showPast ? 'Hide' : 'Show'}
                </Button>
              </>
            }
          >
            {showPast && (
              <div className="insp__past">
                <DockPast draft={policy} apps={mine} version={null} onLoad={tryPast} summary="none" />
              </div>
            )}
          </Block>
        )}
      </div>
    </Drawer>
  )
}
