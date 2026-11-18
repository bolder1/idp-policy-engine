import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, CheckCircle2, ClipboardCheck, FlaskConical, Pencil, Power, Send, Undo2, X } from 'lucide-react'
import { Button, Confirm, Field, Modal, StatusPill } from '../kit'
import type { AccessDecision, Policy } from '../data'
import { useBrand } from '../store'
import {
  fixByMiniOrange,
  markChecked,
  markRolledBack,
  rejectMoved,
  ROLL_BACK_UNTIL,
  useExperience,
  useReviewFacts,
  type MigrationExperience,
} from './experience'
import './migration-results.css'

/* -----------------------------------------------------------------------------
   The Migration list after the loader, in the Assisted and Self-serve experiences (owner, 16 Nov 2026; the
   "Migration, rethought" artifact, flows 2 to 6). One headline, one fact about what decides sign-ins, and the
   migrated policies split by what they need:

     With miniOrange             Assisted: rejected, waiting for a fix. The old policy keeps deciding.
     To review, with changes     something works differently in the new engine, one line each
     To review, no changes       carried over as it was; Approve all runs their checks first
     Approved                    a person approved it; Make active switches its apps
     Active                      the new policy decides; Roll back for the 6 to 8 months
     Rolled back                 the old policy decides again; the new one is inactive, to fix

   Approve is only ever a person's. In Self-serve, editing an approved draft sends it back to To review.
   ----------------------------------------------------------------------------- */

const WORD: Partial<Record<AccessDecision, string>> = { deny: 'Deny', '2fa': 'MFA', '1fa': 'Password' }
const word = (d: AccessDecision | undefined) => (d ? (WORD[d] ?? String(d)) : 'No rule')

export interface ReadyCheck {
  key: string
  who: string
  old: string
  now: string
}

/** The ready-made checks for one migrated policy: a member of each rule's group and someone no rule matches, run
 *  against the old row the rule came from and the rule as it is now; then every difference the move recorded. The
 *  old side is read from the old rows, so a rule edited in review shows up as Differs. Simulated, no sign-in runs. */
function useReadyChecks(policy: Policy | undefined): ReadyCheck[] {
  const store = useBrand()
  if (!policy) return []
  const info = store.moved[policy.id]
  const oldOf = (ruleId: string): string => {
    const src = info?.ruleSource[ruleId]
    const lp = src && store.legacy.policies.find((x) => x.id === src.source)
    if (!src || !lp) return 'No rule'
    if (src.part === 'fail') {
      const ad = store.legacy.adaptive.find((a) => a.id === lp.adaptive?.policyId)
      return ad?.onFail === 'deny' ? 'Deny' : 'MFA'
    }
    return lp.mfa ? 'MFA' : 'Password'
  }
  const rows: ReadyCheck[] = policy.rules.slice(0, 6).map((r) => {
    const g = r.who?.groupIds?.[0]
    /* A check-not-met rule is named for it ("DevOps, Contractor network not met"); a group's own rule, by the group. */
    const who = info?.ruleSource[r.id]?.part === 'fail' || !g ? r.name : `A member of ${store.groupById(g).name}`
    return { key: r.id, who, old: oldOf(r.id), now: word(r.decision) }
  })
  if (policy.fallback) {
    /* No DEFAULT row: the old policy gave people outside its groups no access (plan.ts), which is a deny. */
    const old = info?.ruleSource.fallback ? oldOf('fallback') : info?.joined ? word(policy.fallback.decision) : 'Deny'
    rows.push({ key: 'fallback', who: 'Someone no rule matches', old, now: word(policy.fallback.decision) })
  }
  for (const c of [...(info?.changes ?? []), ...(info?.leftOut ?? [])]) rows.push({ key: c.id, who: c.name, old: c.before, now: c.after })
  return rows
}

/** One line for the list: the first thing that works differently, or nothing. */
function changeLine(policy: Policy, store: ReturnType<typeof useBrand>): string | null {
  const info = store.moved[policy.id]
  const c = info?.changes[0] ?? info?.leftOut[0]
  if (!c) return null
  const more = (info?.changes.length ?? 0) + (info?.leftOut.length ?? 0) - 1
  return `${c.before} → ${c.after}${more > 0 ? ` (and ${more} more)` : ''}`
}

const hasChanges = (id: string, store: ReturnType<typeof useBrand>) => {
  const info = store.moved[id]
  return !!info && info.changes.length + info.leftOut.length > 0
}

/* --- The list ------------------------------------------------------------------------------- */

export function MigrationResults() {
  const store = useBrand()
  const mode = useExperience()
  const facts = useReviewFacts()
  const [checksFor, setChecksFor] = useState<string | null>(null)
  const [activate, setActivate] = useState<string[] | null>(null)
  const [rollBack, setRollBack] = useState<Policy | null>(null)
  const [approveAll, setApproveAll] = useState<string[] | null>(null)

  const migrated = store.policies.filter((p) => !!p.movedFrom?.length && p.appIds.length > 0 && !store.held.includes(p.id))
  const drafts = migrated.filter((p) => p.status === 'draft')
  const reviewed = (p: Policy) => !!store.moved[p.id]?.reviewed
  const withMo = mode === 'assisted' ? drafts.filter((p) => !!facts[p.id]?.rejected) : []
  const open = drafts.filter((p) => !reviewed(p) && !facts[p.id]?.rejected)
  const changed = open.filter((p) => hasChanges(p.id, store) || !!facts[p.id]?.updated)
  const same = open.filter((p) => !changed.includes(p))
  const approved = drafts.filter((p) => reviewed(p) && !facts[p.id]?.rejected)
  const active = migrated.filter((p) => p.status === 'active')
  const rolled = migrated.filter((p) => p.status === 'inactive' && !!facts[p.id]?.rolledBack)

  /* The page's one orange button: the next thing that needs doing. */
  const next = changed.length ? 'review' : same.length ? 'approve' : approved.length ? 'activate' : null
  const review = (p: Policy) => store.go({ name: 'board', policyId: p.id })

  return (
    <section className="bmr" aria-label="Migration">
      <header className="bmr__head">
        <h2>{migrated.length === 1 ? '1 policy migrated' : `${migrated.length} policies migrated`}</h2>
        <p>Each app keeps its old policy until you make its new one active. Roll back is possible until {ROLL_BACK_UNTIL}.</p>
        {mode === 'assisted' && <p className="bmr__mode">Assisted migration: miniOrange converts and fixes your policies. You approve or reject.</p>}
      </header>

      {withMo.length > 0 && (
        <Group title="With miniOrange" line="Rejected. The old policy keeps deciding until it is fixed.">
          {withMo.map((p) => (
            <Row key={p.id} policy={p} line={facts[p.id]?.rejected?.reason ?? null} tag={facts[p.id]?.rejected?.ref}>
              {/* The prototype stands in for miniOrange. */}
              <Button variant="ghost" size="sm" onClick={() => fixByMiniOrange(p.id)}>
                Simulate fix
              </Button>
            </Row>
          ))}
        </Group>
      )}

      <Group
        title="To review, with changes"
        line="Something works differently in the new engine."
        action={changed.length > 0 && <Button variant={next === 'review' ? 'brand' : 'secondary'} size="sm" icon={ClipboardCheck} onClick={() => review(changed[0])}>Start review</Button>}
        empty="Nothing to review"
      >
        {changed.map((p) => (
          <Row key={p.id} policy={p} line={facts[p.id]?.updated ?? changeLine(p, store)} tag={facts[p.id]?.updated ? 'Updated by miniOrange' : undefined}>
            <Button variant="ghost" size="sm" icon={FlaskConical} onClick={() => setChecksFor(p.id)}>
              Run checks
            </Button>
            <Button variant="secondary" size="sm" onClick={() => review(p)}>
              Review
            </Button>
          </Row>
        ))}
      </Group>

      {same.length > 0 && (
        <Group
          title="To review, no changes"
          line="Carried over as they were."
          action={<Button variant={next === 'approve' ? 'brand' : 'secondary'} size="sm" icon={Check} onClick={() => setApproveAll(same.map((p) => p.id))}>Approve all</Button>}
        >
          {same.map((p) => (
            <Row key={p.id} policy={p} line={null}>
              <Button variant="ghost" size="sm" onClick={() => review(p)}>
                Open
              </Button>
            </Row>
          ))}
        </Group>
      )}

      <Group
        title="Approved"
        line="Approved by you. Not active yet."
        action={approved.length > 0 && <Button variant={next === 'activate' ? 'brand' : 'secondary'} size="sm" icon={Power} onClick={() => setActivate(approved.map((p) => p.id))}>Make active</Button>}
        empty="None yet"
      >
        {approved.map((p) => (
          <Row key={p.id} policy={p} line={null}>
            <Button variant="ghost" size="sm" onClick={() => setActivate([p.id])}>
              Make active
            </Button>
          </Row>
        ))}
      </Group>

      <Group title="Active" line="The new policy decides sign-ins for these apps." empty="None yet">
        {active.map((p) => (
          <Row key={p.id} policy={p} line={null} status="Active">
            <Button variant="ghost" size="sm" icon={Undo2} onClick={() => setRollBack(p)}>
              Roll back
            </Button>
          </Row>
        ))}
      </Group>

      {rolled.length > 0 && (
        <Group title="Rolled back" line="The old policy decides again. The new one is inactive, ready to fix.">
          {rolled.map((p) => (
            <Row key={p.id} policy={p} line={null} status="Inactive">
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => review(p)}>
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  store.setPolicyStatus(p.id, 'active')
                  markRolledBack(p.id, false)
                  store.showToast(`${p.name} is active again`)
                }}
              >
                Make active
              </Button>
            </Row>
          ))}
        </Group>
      )}

      <ChecksDialog policyId={checksFor} onClose={() => setChecksFor(null)} />

      <Confirm
        open={!!approveAll}
        onClose={() => setApproveAll(null)}
        destructive={false}
        title={approveAll?.length === 1 ? 'Approve 1 policy?' : `Approve ${approveAll?.length ?? 0} policies?`}
        confirmLabel="Approve all"
        confirmIcon={Check}
        onConfirm={() => {
          const ids = approveAll ?? []
          setApproveAll(null)
          markChecked(ids)
          ids.forEach((id) => store.reviewMoved(id, true))
          store.showToast(`Ready-made checks ran for ${ids.length}. All the same as the old policies. Approved.`, { label: 'Undo', run: () => ids.forEach((id) => store.reviewMoved(id, false)) })
        }}
      >
        Their ready-made checks run first. They are not active until you make them active.
      </Confirm>

      <Confirm
        open={!!activate}
        onClose={() => setActivate(null)}
        destructive={false}
        title={activate?.length === 1 ? `Make ${store.policies.find((p) => p.id === activate[0])?.name ?? 'it'} active?` : `Make ${activate?.length ?? 0} policies active?`}
        confirmLabel="Make active"
        confirmIcon={Power}
        onConfirm={() => {
          const ids = activate ?? []
          setActivate(null)
          const n = store.publishMoved(ids)
          if (n) store.showToast(n === 1 ? 'Active. Its apps use the new policy now.' : `${n} policies active. Their apps use the new policies now.`)
        }}
      >
        {`For ${appCount(activate, store)} the new ${activate?.length === 1 ? 'policy decides sign-ins from now, and the old one stops' : 'policies decide sign-ins from now, and the old ones stop'}. Any app can roll back until ${ROLL_BACK_UNTIL}.`}
      </Confirm>

      <Confirm
        open={!!rollBack}
        onClose={() => setRollBack(null)}
        destructive={false}
        title={`Roll back ${rollBack?.name ?? ''}?`}
        confirmLabel="Roll back"
        confirmIcon={Undo2}
        onConfirm={() => {
          const p = rollBack
          setRollBack(null)
          if (!p) return
          store.setPolicyStatus(p.id, 'inactive')
          markRolledBack(p.id, true)
          store.showToast(`${p.name} rolled back. The old policy decides again.`)
        }}
      >
        The old policy decides sign-ins for its apps again. The new policy becomes inactive and stays for you to fix. Nothing is deleted.
      </Confirm>
    </section>
  )
}

function appCount(ids: readonly string[] | null, store: ReturnType<typeof useBrand>) {
  const n = new Set((ids ?? []).flatMap((id) => store.policies.find((p) => p.id === id)?.appIds ?? [])).size
  return n === 1 ? 'its app' : `their ${n} apps`
}

function Group({ title, line, action, empty, children }: { title: string; line: string; action?: ReactNode; empty?: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <section className="bmr__group" aria-label={title}>
      <header className="bmr__ghead">
        <span>
          <b>{title}</b>
          <span className="bmr__line">{line}</span>
        </span>
        {action}
      </header>
      {rows.length ? <ul className="bmr__rows">{children}</ul> : empty ? <p className="bmr__empty">{empty}</p> : null}
    </section>
  )
}

function Row({ policy, line, tag, status, children }: { policy: Policy; line: string | null; tag?: string; status?: 'Active' | 'Inactive'; children: ReactNode }) {
  const store = useBrand()
  const apps = policy.appIds.map((id) => store.appById(id).name)
  return (
    <li className="bmr__row">
      <span className="bmr__name">
        <b>{policy.name}</b>
        <span className="bmr__apps">{apps.length <= 2 ? apps.join(', ') : `${apps[0]} and ${apps.length - 1} more`}</span>
        {tag && <span className="bmr__tag">{tag}</span>}
        {status && <StatusPill status={status === 'Active' ? 'active' : 'inactive'} />}
        {line && <span className="bmr__change">{line}</span>}
      </span>
      <span className="bmr__acts">{children}</span>
    </li>
  )
}

/* --- Ready-made checks ---------------------------------------------------------------------- */

export function ChecksDialog({ policyId, onClose }: { policyId: string | null; onClose: () => void }) {
  const store = useBrand()
  const policy = policyId ? store.policies.find((p) => p.id === policyId) : undefined
  const rows = useReadyChecks(policy)
  useEffect(() => {
    if (policyId) markChecked([policyId])
  }, [policyId])
  const same = rows.filter((r) => r.old === r.now).length
  return (
    <Modal open={!!policy} onClose={onClose} title={`Ready-made checks · ${policy?.name ?? ''}`} width={640}>
      <div className="bmr__checks">
        <p className={`bmr__sum${same === rows.length ? ' is-same' : ' is-diff'}`}>
          {same === rows.length ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden /> : <X size={16} strokeWidth={2} aria-hidden />}
          {same === rows.length ? `${same} of ${rows.length} the same as the old policy` : `${rows.length - same} of ${rows.length} differ from the old policy`}
        </p>
        <div className="bmr__tablewrap">
          <table className="bmr__table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Old policy</th>
                <th>New policy</th>
                <th aria-label="Result" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.who}</td>
                  <td>{r.old}</td>
                  <td>{r.now}</td>
                  <td>
                    <span className={`bmr__res${r.old === r.now ? ' is-same' : ' is-diff'}`}>{r.old === r.now ? 'Same' : 'Differs'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bmr__note">Prototype: the results are simulated from the old and new rules.</p>
      </div>
    </Modal>
  )
}

/* --- Reject (Assisted) ---------------------------------------------------------------------- */

/** `variant`: Assisted sends the rejection to miniOrange; Today keeps it as a rejected draft, with Contact support on
 *  the Rejected card (owner, 17 Nov 2026). Both ask for a reason. */
export function RejectDialog({ policy, onClose, onSent, variant = 'assisted' }: { policy: Policy | null; onClose: () => void; onSent?: () => void; variant?: 'assisted' | 'today' }) {
  const store = useBrand()
  const [reason, setReason] = useState('')
  useEffect(() => setReason(''), [policy?.id])
  const today = variant === 'today'
  const send = () => {
    if (!policy || !reason.trim()) return
    const ref = rejectMoved(policy.id, reason.trim())
    store.reviewMoved(policy.id, false)
    onClose()
    store.showToast(today ? `${policy.name} rejected. The old policy keeps deciding.` : `Sent to miniOrange, request ${ref}. The old policy keeps deciding.`)
    onSent?.()
  }
  return (
    <Modal
      open={!!policy}
      onClose={onClose}
      title={`Reject ${policy?.name ?? ''}?`}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {/* Red inside the confirm, never the brand orange (owner, 17 Nov 2026). */}
          <Button variant={today ? 'danger' : 'brand'} icon={today ? undefined : Send} disabled={!reason.trim()} onClick={send}>
            {today ? 'Reject' : 'Send to miniOrange'}
          </Button>
        </>
      }
    >
      <div className="bmr__reject">
        <p>{today ? 'It stays a draft and the old policy keeps deciding.' : 'miniOrange gets the policy, what changed and your reason. The old policy keeps deciding until it is fixed.'}</p>
        <Field label="Reason" htmlFor="bmr-reason">
          <textarea id="bmr-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* --- The board's bar on a migrated draft, in Assisted and Self-serve --------------------------- */

/** Assisted: Run checks, Reject, Approve; never Edit. Self-serve: Run checks, Edit, Approve; editing an approved
 *  draft sends it back to To review. Approve moves on to the next draft that needs review. */
export function ReviewBar({ policy, mode, onEdit }: { policy: Policy; mode: Exclude<MigrationExperience, 'today'>; onEdit?: () => void }) {
  const store = useBrand()
  const facts = useReviewFacts()
  const [checks, setChecks] = useState(false)
  const [reject, setReject] = useState(false)
  const approved = !!store.moved[policy.id]?.reviewed
  const queue = store.policies.filter((p) => !!p.movedFrom?.length && p.status === 'draft' && p.appIds.length > 0 && !store.held.includes(p.id))
  const at = queue.findIndex((p) => p.id === policy.id)
  const nextUp = [...queue.slice(at + 1), ...queue.slice(0, Math.max(0, at))].find((p) => !store.moved[p.id]?.reviewed && !facts[p.id]?.rejected && p.id !== policy.id)
  const goNext = () => (nextUp ? store.go({ name: 'board', policyId: nextUp.id }) : store.go({ name: 'policies' }))
  const approve = () => {
    store.reviewMoved(policy.id, true)
    store.showToast(nextUp ? `${policy.name} approved. Next: ${nextUp.name}` : `${policy.name} approved`, { label: 'Undo', run: () => store.reviewMoved(policy.id, false) })
    goNext()
  }
  const rejected = !!facts[policy.id]?.rejected
  return (
    <>
      {at >= 0 && queue.length > 1 && (
        <span className="bmr__pos">
          {at + 1} of {queue.length}
        </span>
      )}
      <Button variant="ghost" size="sm" icon={FlaskConical} onClick={() => setChecks(true)}>
        Run checks
      </Button>
      {mode === 'self' && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          icon={Pencil}
          onClick={() => {
            if (approved) {
              store.reviewMoved(policy.id, false)
              store.showToast('Back in To review while you edit')
            }
            onEdit()
          }}
        >
          Edit
        </Button>
      )}
      {mode === 'assisted' && !rejected && (
        <Button variant="secondary" size="sm" icon={X} onClick={() => setReject(true)}>
          Reject
        </Button>
      )}
      {approved ? (
        <span className="bmr__approved" role="status">
          <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
          Approved
        </span>
      ) : rejected ? (
        <span className="bmr__approved is-mo" role="status">
          With miniOrange
        </span>
      ) : (
        <Button variant="brand" size="sm" icon={Check} iconRight={nextUp ? ArrowRight : undefined} onClick={approve}>
          Approve
        </Button>
      )}
      <ChecksDialog policyId={checks ? policy.id : null} onClose={() => setChecks(false)} />
      <RejectDialog policy={reject ? policy : null} onClose={() => setReject(false)} onSent={goNext} />
    </>
  )
}
