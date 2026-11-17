import { Eye, Headset, Rocket } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, SplitButton } from '../kit'
import './review-cards.css'

/* -----------------------------------------------------------------------------
   The migration numbers while drafts wait (owner, 12 Nov 2026: cards with metrics and actions; 17 Nov 2026: Approved,
   Published and Rejected apart, then "redo the layout"). One panel, one border, a column per state split by rules:
   the label, the number, the action under it. No icon tiles, no sentences.
   ----------------------------------------------------------------------------- */

export function ReviewApproveCards({
  toReview,
  approved,
  published,
  rejected,
  onReview,
  onPublishApproved,
  onPublishAll,
  onContactSupport,
  showReject = true,
}: {
  toReview: number
  approved: number
  published: number
  rejected: number
  onReview: () => void
  onPublishApproved: () => void
  onPublishAll: () => void
  onContactSupport: () => void
  /** Yesterday's version had no Reject (owner, 17 Nov 2026: kept for comparison). */
  showReject?: boolean
}) {
  return (
    <section className="brc" aria-label="Migration">
      <Cell tone="review" label="To review" value={toReview}>
        <Button variant="secondary" size="sm" icon={Eye} onClick={onReview} disabled={toReview === 0}>
          Review
        </Button>
      </Cell>
      <Cell tone="approved" label="Approved" value={approved}>
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
      </Cell>
      <Cell tone="published" label="Published" value={published} />
      {showReject && (
        <Cell tone="rejected" label="Rejected" value={rejected}>
          <Button variant="secondary" size="sm" icon={Headset} onClick={onContactSupport} disabled={rejected === 0}>
            Contact support
          </Button>
        </Cell>
      )}
    </section>
  )
}

function Cell({ tone, label, value, children }: { tone: string; label: string; value: number; children?: ReactNode }) {
  return (
    <div className={`brc__cell is-${tone}`}>
      <span className="brc__label">{label}</span>
      <b className="brc__num">{value}</b>
      <div className="brc__act">{children}</div>
    </div>
  )
}
