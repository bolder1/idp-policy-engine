import { useState } from 'react'
import { Check, CheckCircle2, History, Power, X } from 'lucide-react'
import { Button, Confirm } from '../kit'
import type { Policy } from '../data'
import { useBrand } from '../store'
import type { LegacyPolicy } from './legacy'
import { OldCard } from './review-split'
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

export function MovedPanel({
  policy,
  onClose,
  onLink,
  onPick,
  hoverRule,
}: {
  policy: Policy
  onClose: () => void
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
  const [pinned, setPinned] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  return (
    <aside className="bgs is-left bmvp" aria-label="Old policies this one came from">
      <header className="bmvp__head">
        <span className="brs__oldtitle">
          <History size={15} strokeWidth={2} aria-hidden />
          <b>Old policies</b>
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
      <ol
        className="bmvp__list"
        onMouseLeave={() => {
          setHover(null)
          onLink?.(null)
        }}
      >
        {sources.map((lp, i) => {
          const made = ids.filter((id) => info?.ruleSource[id]?.source === lp.id)
          const left = info?.leftOut.find((l) => l.id === `${lp.id}-dup` || l.id === `${lp.id}-last`)
          const zone = (info?.moves ?? []).find((m) => m.id === `${lp.id}-zone`)
          const device = (info?.moves ?? []).find((m) => m.id === `${lp.id}-device`)
          return (
            <OldCard
              index={i + 1}
              key={lp.id}
              lp={lp}
              became={left ? 'Left out' : made.length ? [...new Set(made.map(label))].join(', ') : 'Merged with a matching row'}
              why={left?.after}
              zone={zone?.after.replace(/^New zone /, '').replace(/^Uses your (.*) zone$/, '$1')}
              device={device?.after.replace(/^New device profile /, '')}
              on={hover === lp.id}
              linked={!!hoverRule && info?.ruleSource[hoverRule]?.source === lp.id}
              pinned={pinned === lp.id}
              onHover={() => {
                setHover(lp.id)
                onLink?.(made)
              }}
              onPin={() => {
                const off = pinned === lp.id
                setPinned(off ? null : lp.id)
                onPick?.(off ? null : made)
              }}
            />
          )
        })}
      </ol>
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
  const list = (ids ?? []).map((id) => store.policies.find((p) => p.id === id)).filter((p): p is Policy => !!p)
  const unreviewed = approving ? 0 : list.filter((p) => !store.moved[p.id]?.reviewed).length
  const one = list.length === 1
  const name = one ? list[0].name : `${list.length} policies`
  return (
    <Confirm
      open={!!ids && list.length > 0}
      onClose={onClose}
      title={unreviewed ? `Publish ${name} without approval?` : `Publish ${name}?`}
      confirmLabel="Publish"
      ack={
        unreviewed
          ? one
            ? 'I am publishing it without a review, and I am responsible for how it decides sign-ins.'
            : `I am publishing ${unreviewed === 1 ? '1 policy' : `${unreviewed} policies`} without a review, and I am responsible for how they decide sign-ins.`
          : undefined
      }
      onConfirm={() => {
        onClose()
        list.forEach((p) => store.reviewMoved(p.id, true))
        const n = store.publishMoved(list.map((p) => p.id))
        onDone?.()
        if (n) store.showToast(n === 1 ? `${list[0].name} is active, now in New policies` : `${n} policies are active, now in New policies`)
      }}
    >
      {unreviewed
        ? one
          ? 'Nobody has approved this policy yet. It starts deciding sign-ins straight away, and moves to New policies.'
          : `${unreviewed === 1 ? '1 of them has' : `${unreviewed} of them have`} not been approved. They start deciding sign-ins straight away, and move to New policies.`
        : one
          ? 'It starts deciding sign-ins straight away, and moves to New policies.'
          : 'They start deciding sign-ins straight away, and move to New policies.'}
    </Confirm>
  )
}

/** The builder's bar on a moved draft: Approve (or Approved, to take back), and Approve and publish. */
export function PublishMoved({ policy }: { policy: Policy }) {
  const store = useBrand()
  const [ask, setAsk] = useState<string[] | null>(null)
  const approved = !!store.moved[policy.id]?.reviewed
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={approved ? CheckCircle2 : Check}
        pressed={approved}
        onClick={() => {
          store.reviewMoved(policy.id, !approved)
          if (!approved) store.showToast(`${policy.name} approved`, { label: 'Undo', run: () => store.reviewMoved(policy.id, false) })
        }}
      >
        {approved ? 'Approved' : 'Approve'}
      </Button>
      <Button
        variant="brand"
        size="sm"
        icon={Power}
        onClick={() => setAsk([policy.id])}
      >
        Approve and publish
      </Button>
      <PublishMovedConfirm ids={ask} approving onClose={() => setAsk(null)} />
    </>
  )
}
