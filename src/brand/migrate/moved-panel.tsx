import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Archive, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, FolderInput, History, Pencil, Rocket, X } from 'lucide-react'
import { Button, Modal } from '../kit'
import type { Policy } from '../data'
import { useBrand } from '../store'
import type { LegacyPolicy } from './legacy'
import { markWalkPublished, useWalkPublished } from './walk-published'
import { OldLoginView } from './old-login-view'
import { clearRejected, isBuilt, useExperience, useReviewFacts } from './experience'
import { RejectDialog, ReviewBar } from './migration-results'
import './move-dialog.css'
import './review-v2.css'
import './review-split.css'

/* -----------------------------------------------------------------------------
   A moved policy in the builder (owner, 6 Nov 2026: "the left part will be the old
   policy as we used to have, the right side the new one, in the builder"). Docked
   left where Guided setup sits: the old policies this one came from, the same
   readable cards as Review (review-split OldCard). Hover or pin one to keep it in view.
   And Publish, for the bar: a moved draft becomes active and the old policies it came
   after one confirm. The old policies stay (owner, 6 Nov 2026).
   -------------------------------------------------------------------------- */

/** The migrated drafts still waiting, in the list's order, this one among them; and where this one is. */
function useMovedQueue(policyId: string) {
  const store = useBrand()
  const published = useWalkPublished()
  /* One published during this review stays in the walk until the admin leaves (walk-published.ts). */
  const queue = store.policies.filter((p) => p.id === policyId || (!!p.movedFrom?.length && (p.status === 'draft' || published.has(p.id)) && !store.held.includes(p.id)))
  return { queue, at: queue.findIndex((p) => p.id === policyId) }
}

export function MovedPanel({
  policy,
  onClose,
  onLink,
  onPick,
  hoverRule,
  onCheck,
}: {
  policy: Policy
  onClose: () => void
  /** The attribute under the pointer in an opened old policy, as tokens the board's conditions carry (`data-ct`). */
  onCheck?: (tokens: string | null) => void
  /** Hovering an old policy: the rules it became, so the board can light them. Null when the pointer leaves. */
  onLink?: (ruleIds: string[] | null) => void
  /** Selecting one: the same rules, to open on the board. Null when it is selected again. */
  onPick?: (ruleIds: string[] | null) => void
  /** The rule under the pointer on the board ('fallback' for the last row): lights the old policy it came from. */
  hoverRule?: string | null
}) {
  const store = useBrand()
  const info = store.moved[policy.id]
  const sources = (info?.sourceIds ?? []).map((id) => store.legacy.policies.find((lp) => lp.id === id)).filter((lp): lp is LegacyPolicy => !!lp)
  const ids = [...policy.rules.map((r) => r.id), 'fallback']
  const label = (id: string) => (id === 'fallback' ? 'Everyone else' : `Rule ${policy.rules.findIndex((r) => r.id === id) + 1}`)
  const walk = useMovedQueue(policy.id)
  const [hover, setHover] = useState<string | null>(null)
  /* The cards, basic (owner, 9 Nov 2026): a name, what it became, and its type pills; a click opens a basic view of it. */
  const [open, setOpen] = useState<LegacyPolicy | null>(null)
  const madeOf = (lp: LegacyPolicy) => ids.filter((id) => info?.ruleSource[id]?.source === lp.id)
  const becameOf = (lp: LegacyPolicy) => {
    const made = madeOf(lp)
    if (info?.leftOut.some((l) => l.id === `${lp.id}-dup` || l.id === `${lp.id}-last`)) return 'Left out'
    return made.length ? `Became ${[...new Set(made.map(label))].join(', ')}` : 'Merged with a matching row'
  }
  const pick = (lp: LegacyPolicy | null) => {
    setOpen(lp)
    onCheck?.(null)
    onPick?.(lp ? madeOf(lp) : null)
    if (!lp) onLink?.(null)
  }
  return (
    <aside className="bgs is-left bmvp" aria-label="Old policies this one came from">
      {open ? (
        /* One old policy opened (owner, 12 Nov 2026): its details take the panel's place, with a way back to the list. */
        <>
          <header className="bmvp__head">
            <span className="brs__oldtitle">
              <button type="button" className="bmvp__x" aria-label="Back to old policies" onClick={() => pick(null)}>
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
              <b>Login policy</b>
              <span className="bolv__tag">
                <History size={13} strokeWidth={2} aria-hidden />
                Old policy
              </span>
            </span>
            <button type="button" className="bmvp__x" aria-label="Close" onClick={onClose}>
              <X size={16} strokeWidth={2} />
            </button>
          </header>
          <div className="bmvp__detail">
            <OldLoginView lp={open} became={becameOf(open)} onCheck={onCheck} />
          </div>
        </>
      ) : (
        <>
          <header className="bmvp__head">
            <span className="brs__oldtitle">
              <History size={15} strokeWidth={2} aria-hidden />
              <b>Old policies</b>
              {/* Where this draft is among the migrated ones (owner, 9 Nov 2026: the bar keeps only Back and Next). */}
              {walk.queue.length > 1 && <span className="bmvp__walkat">{`Draft ${walk.at + 1} of ${walk.queue.length}`}</span>}
            </span>
            <button type="button" className="bmvp__x" aria-label="Close" onClick={onClose}>
              <X size={16} strokeWidth={2} />
            </button>
          </header>
          <p className="bmvp__sub">
            {sources.length === 0
              ? 'The old policies this one came from are in the Old policies tab.'
              : sources.length === 1
                ? 'This policy came from 1 old policy.'
                : `This policy came from ${sources.length} old policies.`}
          </p>
        </>
      )}
      {!open && (
        <ol
          className="bmvp__list"
          onMouseLeave={() => {
            setHover(null)
            onLink?.(null)
          }}
        >
          {sources.map((lp) => {
            const made = madeOf(lp)
            const lit = () => {
              setHover(lp.id)
              onLink?.(made)
            }
            return (
              <li key={lp.id}>
                <button
                  type="button"
                  className={`bmvo${hover === lp.id ? ' is-on' : ''}${hoverRule && info?.ruleSource[hoverRule]?.source === lp.id ? ' is-linked' : ''}`}
                  onMouseEnter={lit}
                  onFocus={lit}
                  onClick={() => pick(lp)}
                >
                  <span className="bmvo__text">
                    <b>{lp.name}</b>
                    <span>{becameOf(lp)}</span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="bmvo__go" aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

/* -----------------------------------------------------------------------------
   Approve and publish (owner, 6 Nov 2026). A moved policy goes Draft, then Approved
   (the admin has looked at it in the builder), then Active once published. Publish can
   skip Approve: then the confirm says so and asks the admin to take it on, a box to
   tick before Publish arms ("you are doing the review, and the consequences are yours").
   -------------------------------------------------------------------------- */

/** The one confirm for publishing moved drafts: a row's quick Publish, the bulk bar's, the builder's. */
export function PublishMovedConfirm({ ids, onClose, onDone, approving = false }: { ids: readonly string[] | null; onClose: () => void; onDone?: () => void; /** From Approve and publish: the press is the approval. */ approving?: boolean }) {
  const store = useBrand()
  const [ack, setAck] = useState(false)
  useEffect(() => setAck(false), [ids])
  const list = (ids ?? []).map((id) => store.policies.find((p) => p.id === id)).filter((p): p is Policy => !!p)
  const unreviewed = approving ? 0 : list.filter((p) => !store.moved[p.id]?.reviewed).length
  const one = list.length === 1
  const name = one ? list[0].name : `${list.length} policies`
  /* Plain words, like a short note (owner, 10 Nov 2026: "simple"): what happens in a sentence, a one-line tick only when nobody has approved it. */
  const apps = [...new Set(list.flatMap((p) => p.appIds))].map((id) => store.appById(id).name)
  const where = apps.length === 0 ? 'its applications' : apps.length <= 2 ? apps.join(' and ') : `${apps[0]} and ${apps.length - 1} more`
  /* Each line opens to the whole of it (owner, 10 Nov 2026: "make this an accordion, show everything about what moves and
     what stays"): the policies that go live, and the old policies behind them. */
  const reduce = useReducedMotion() === true
  const [open, setOpen] = useState<'moves' | 'stays' | null>(null)
  useEffect(() => setOpen(null), [ids])
  const appNames = (p: Policy) => p.appIds.map((id) => store.appById(id).name).join(', ')
  const oldOf = (p: Policy) => (store.moved[p.id]?.sourceIds ?? []).map((id) => store.legacy.policies.find((lp) => lp.id === id)).filter((lp): lp is NonNullable<typeof lp> => !!lp)
  const facts = [
    {
      id: 'moves' as const,
      icon: FolderInput,
      tone: 'is-moves',
      title: 'Moves to New policies',
      rows: list.map((p) => ({ key: p.id, name: p.name, note: appNames(p) })),
      foot: one ? 'It leaves Migrated and is listed with your other policies, tagged Migrated.' : 'They leave Migrated and are listed with your other policies, tagged Migrated.',
    },
    {
      id: 'stays' as const,
      icon: Archive,
      tone: 'is-stays',
      title: 'Old policies stay readable',
      rows: list.flatMap((p) => oldOf(p).map((lp) => ({ key: `${p.id}-${lp.id}`, name: lp.name, note: `in ${p.name}` }))),
      foot: 'They stay in Old policies, unchanged. Nothing is deleted.',
    },
  ]
  const confirm = () => {
    onClose()
    list.forEach((p) => store.reviewMoved(p.id, true))
    const n = store.publishMoved(list.map((p) => p.id))
    onDone?.()
    if (n) store.showToast(n === 1 ? `${list[0].name} is active, now in New policies` : `${n} policies are active, now in New policies`)
  }
  const review = () => {
    const first = list.find((p) => !store.moved[p.id]?.reviewed)
    onClose()
    if (first) store.go({ name: 'board', policyId: first.id })
  }
  return (
    <Modal open={!!ids && list.length > 0} onClose={onClose} title={`Publish ${name}?`} width={480} padded={false} bare>
      <div className="bsm">
        <header className="bsm__head">
          <h2>{`Publish ${name}?`}</h2>
          <p>
            {`${one ? 'It starts' : 'They start'} deciding sign-ins for ${where} straight away.`}
            {unreviewed > 0 && (one ? ' Nobody has approved it yet.' : ` ${unreviewed === 1 ? '1 of them has' : `${unreviewed} of them have`} not been approved yet.`)}
          </p>
        </header>
        <ul className="bsm__facts">
          {facts.map((f) => (
            <li key={f.id} className={open === f.id ? 'is-open' : ''}>
              <button type="button" className="bsm__fact" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                <span className={`bsm__ico ${f.tone}`} aria-hidden>
                  <f.icon size={18} strokeWidth={2} />
                </span>
                <span className="bsm__facttitle">{f.title}</span>
                <ChevronDown size={16} strokeWidth={2} className="bsm__chev" aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {open === f.id && (
                  <motion.div key="body" className="bsm__factbody" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
                    <ul>
                      {f.rows.map((r) => (
                        <li key={r.key}>
                          <b>{r.name}</b>
                          <span>{r.note}</span>
                        </li>
                      ))}
                    </ul>
                    <p>{f.foot}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
        {unreviewed > 0 && (
          <label className="bsm__ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            Publish without approval
          </label>
        )}
        <footer className="bsm__foot">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {unreviewed > 0 && !approving && (
            <Button variant="secondary" onClick={review}>
              Review first
            </Button>
          )}
          <Button variant="brand" icon={Rocket} disabled={unreviewed > 0 && !ack} onClick={confirm}>
            Publish
          </Button>
        </footer>
      </div>
    </Modal>
  )
}

/** The builder's bar on a moved draft: Approve (or Approved, to take back), and Approve and publish. */
export function PublishMoved({ policy, onEdit }: { policy: Policy; /** Unlocks the draft for changes before it goes active. */ onEdit?: () => void }) {
  const store = useBrand()
  const [ask, setAsk] = useState<string[] | null>(null)
  const reduce = useReducedMotion() === true
  const published = useWalkPublished()
  /* The hop: a short card saying this one is approved and who is next, before the board changes (owner, 10 Nov 2026). */
  const [hop, setHop] = useState<{ from: string; to: Policy } | null>(null)
  useEffect(() => {
    if (!hop) return
    const id = window.setTimeout(() => {
      store.go({ name: 'board', policyId: hop.to.id })
      setHop(null)
    }, reduce ? 600 : 1300)
    return () => window.clearTimeout(id)
  }, [hop, reduce, store])
  const approved = !!store.moved[policy.id]?.reviewed
  /* Approve moves on (owner, 9 Nov 2026: "on approve, go to the next one"): to the next draft nobody has approved yet,
     after this one and then from the top; the toast's Undo takes the approval back. */
  const { queue, at } = useMovedQueue(policy.id)
  /* Rejected (owner, 17 Nov 2026): with a reason, kept as a draft; the walk skips it like an approved one. */
  const facts = useReviewFacts()
  const [rejecting, setRejecting] = useState(false)
  const mode = useExperience()
  const old = mode === 'yesterday'
  const rejected = !old && !!facts[policy.id]?.rejected
  const nextUp = [...queue.slice(at + 1), ...queue.slice(0, Math.max(0, at))].find((p) => !store.moved[p.id]?.reviewed && !facts[p.id]?.rejected && p.id !== policy.id)
  /* Assisted and Self-serve (owner, 16 Nov 2026) have their own bar: Approve only, never Approve and publish. */
  if (!isBuilt(mode)) return <ReviewBar policy={policy} mode={mode} onEdit={onEdit} />
  /* Published: the buttons give way to the status, and the policy stays readable in the walk. */
  if (published.has(policy.id))
    return (
      <span className="bmv-published" role="status">
        <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
        Published
      </span>
    )
  return (
    <>
      {/* Edit is hidden for now (owner, 17 Nov 2026: "hide edit as of now"); Reject takes its place. */}
      {old ? (
        onEdit && (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
        )
      ) : rejected ? (
        <span className="bmr__approved is-rejected" role="status">
          <X size={14} strokeWidth={2} aria-hidden />
          Rejected
        </span>
      ) : (
        !approved && (
          <span className="bmv-reject">
            <Button variant="secondary" size="sm" icon={X} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </span>
        )
      )}
      {/* Green once approved (owner, 10 Nov 2026: "make it green or blue after approve so it is easy to understand"). */}
      <span className={`bmv-approve${approved ? ' is-on' : ''}`}>
      <Button
        variant="secondary"
        size="sm"
        icon={approved ? CheckCircle2 : Check}
        pressed={approved}
        onClick={() => {
          store.reviewMoved(policy.id, !approved)
          if (approved) return
          if (rejected) clearRejected(policy.id)
          store.showToast(nextUp ? `${policy.name} approved. Next: ${nextUp.name}` : `${policy.name} approved`, { label: 'Undo', run: () => store.reviewMoved(policy.id, false) })
          if (nextUp) setHop({ from: policy.name, to: nextUp })
        }}
      >
        {approved ? 'Approved' : 'Approve'}
      </Button>
      </span>
      {!rejected && (
        <Button
          variant="brand"
          size="sm"
          icon={Rocket}
          onClick={() => setAsk([policy.id])}
        >
          Approve and publish
        </Button>
      )}
      <PublishMovedConfirm ids={ask} approving onClose={() => setAsk(null)} onDone={() => markWalkPublished([policy.id])} />
      <RejectDialog
        policy={rejecting ? policy : null}
        variant="today"
        onClose={() => setRejecting(false)}
        onSent={() => nextUp && store.go({ name: 'board', policyId: nextUp.id })}
      />
      {createPortal(
        <AnimatePresence>
          {hop && (
            <motion.div key="hop" className="bmvhop" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.25 }}>
              <motion.div className="bmvhop__card" initial={reduce ? false : { y: 16, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                <motion.span className="bmvhop__tick" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.1 }}>
                  <CheckCircle2 size={26} strokeWidth={2} aria-hidden />
                </motion.span>
                <b>{hop.from} approved</b>
                <span className="bmvhop__next">
                  Next: <strong>{hop.to.name}</strong>
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

/** Back and Next through the migrated drafts, in the canvas toolbar beside Collapse all (owner, 9 Nov 2026). */
export function MovedWalk({ policyId }: { policyId: string }) {
  const store = useBrand()
  const { queue, at } = useMovedQueue(policyId)
  if (queue.length < 2) return null
  const open = (n: number) => queue[n] && store.go({ name: 'board', policyId: queue[n].id })
  return (
    <>
      <span className="bmvp__walk" role="group" aria-label="Migrated drafts">
        <button type="button" className="bb__densitybtn" disabled={at <= 0} onClick={() => open(at - 1)}>
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          Back
        </button>
        <button type="button" className="bb__densitybtn" disabled={at >= queue.length - 1} onClick={() => open(at + 1)}>
          Next
          <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </button>
      </span>
      <span className="bb__float__sep" aria-hidden />
    </>
  )
}
