import { CheckCheck, ClipboardCheck, Eye, Headset, Rocket, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, SplitButton } from '../kit'
import { TESTER } from '../tester'
import './review-cards.css'

/* -----------------------------------------------------------------------------
   The migration numbers while drafts wait (owner, 12 Nov 2026: cards with metrics and actions; 17 Nov 2026: a Reject
   card with Contact support; 18 Nov 2026: back to the one-row cards, no Published). Each card is one row: its mark and
   title, its number, its action at the end. No sentences. Contact support lives here only, never on a policy row.
   ----------------------------------------------------------------------------- */

export function ReviewApproveCards({
  toReview,
  approved,
  rejected,
  onReview,
  onPublishApproved,
  onPublishAll,
  onContactSupport,
  showReject = true,
}: {
  toReview: number
  approved: number
  rejected: number
  onReview: () => void
  onPublishApproved: () => void
  onPublishAll: () => void
  onContactSupport: () => void
  /** Yesterday's version had no Reject (owner, 17 Nov 2026: kept for comparison). */
  showReject?: boolean
}) {
  return (
    <section className={`brc${showReject ? '' : ' is-two'}`} aria-label="Migration">
      <Card tone="review" icon={ClipboardCheck} title="Review" label="To review" value={toReview}>
        <Button variant="secondary" size="sm" icon={Eye} onClick={onReview} disabled={toReview === 0}>
          Review
        </Button>
      </Card>
      <Card tone="approve" icon={CheckCheck} title="Approve" label="Approved" value={approved}>
        {/* The phase 1 tester build (tester.ts) has no Publish all (owner, 18 Nov 2026: "we don't have publish all"). */}
        {TESTER ? (
          <Button variant="secondary" size="sm" icon={Rocket} onClick={onPublishApproved} disabled={approved === 0}>
            Publish approved
          </Button>
        ) : (
          <SplitButton
            label="Publish approved"
            icon={Rocket}
            variant="secondary"
            size="sm"
            onPress={onPublishApproved}
            disabled={approved === 0}
            menuLabel="More ways to publish"
            items={[{ id: 'all', label: 'Publish all' }]}
            onSelect={onPublishAll}
          />
        )}
      </Card>
      {showReject && (
        <Card tone="reject" icon={XCircle} title="Reject" label="Rejected" value={rejected}>
          <Button variant="secondary" size="sm" icon={Headset} onClick={onContactSupport} disabled={rejected === 0}>
            Contact support
          </Button>
        </Card>
      )}
    </section>
  )
}

function Card({
  tone,
  icon: Icon,
  title,
  label,
  value,
  children,
}: {
  tone: string
  icon: LucideIcon
  title: string
  label: string
  value: number
  children: ReactNode
}) {
  return (
    <article className="brc__card" aria-label={title}>
      <span className={`brc__mark is-${tone}`} aria-hidden>
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="brc__body">
        <h2>{title}</h2>
        <dl className="brc__stats">
          <div className={`brc__stat is-${tone}`}>
            <dd>{value}</dd>
            <dt>{label}</dt>
          </div>
        </dl>
      </div>
      <div className="brc__act">{children}</div>
    </article>
  )
}
