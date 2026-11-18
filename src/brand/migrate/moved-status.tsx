import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Headset, Undo2 } from 'lucide-react'
import { Badge, Button, StatusPill } from '../kit'
import './moved-status.css'
import type { Policy } from '../data'
import { useBrand } from '../store'
import { useExperience, useMovedState, type MovedReview } from './experience'

/* -----------------------------------------------------------------------------
   A policy's status, said the same way everywhere (owner, 18 Nov 2026: "fix the status everywhere").

   A migrated draft is in review, never a "Draft" (owner, 17 Nov 2026): Under review, Approved or Rejected. A migrated
   policy made active and then rolled back says Rolled back beside Inactive. Yesterday's version (kept for comparison)
   keeps Draft plus Approved. Every other policy shows its plain status pill.
   ----------------------------------------------------------------------------- */

const REVIEW_BADGE: Record<MovedReview, { tone: 'info' | 'positive' | 'negative'; label: string }> = {
  review: { tone: 'info', label: 'Under review' },
  approved: { tone: 'positive', label: 'Approved' },
  rejected: { tone: 'negative', label: 'Rejected' },
}

/** The review badge alone, for a migrated draft; null for anything else. */
export function ReviewBadge({ review }: { review: MovedReview | null }) {
  if (!review) return null
  const b = REVIEW_BADGE[review]
  return <Badge tone={b.tone}>{b.label}</Badge>
}

export function RolledBackBadge() {
  return <Badge tone="notice">Rolled back</Badge>
}

/** The status for any policy: the review badge for a migrated draft, else the pill (and Rolled back beside it). */
export function PolicyStatus({ policy }: { policy: Policy }) {
  const { moved } = useBrand()
  const old = useExperience() === 'yesterday'
  const { review, rolledBack } = useMovedState(policy)
  if (old && !!policy.movedFrom?.length && policy.status === 'draft') {
    return (
      <>
        <StatusPill status={policy.status} />
        {!!moved[policy.id]?.reviewed && <Badge tone="positive">Approved</Badge>}
      </>
    )
  }
  if (review) return <ReviewBadge review={review} />
  return (
    <>
      <StatusPill status={policy.status} />
      {rolledBack && <RolledBackBadge />}
    </>
  )
}

/* -----------------------------------------------------------------------------
   The builder's word on a rolled-back policy (owner, 18 Nov 2026: "I can't understand its role; add a note, and a
   contact support option from here as well"). In the page's top banner slot, above the bar: what roll back did, and the
   way to miniOrange.
   ----------------------------------------------------------------------------- */

export function RolledBackNote({ policy, onContactSupport }: { policy: Policy; onContactSupport: () => void }) {
  const { rolledBack } = useMovedState(policy)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById('bshell-top')), [])
  if (!rolledBack || !slot) return null
  return createPortal(
    <div className="bmroll" role="status">
      <Undo2 size={16} strokeWidth={2} aria-hidden className="bmroll__mark" />
      <p className="bmroll__words">
        <b>Rolled back.</b> The old policy decides sign-ins for its applications again. This policy stays inactive until you
        make it active.
      </p>
      <Button variant="secondary" size="sm" icon={Headset} onClick={onContactSupport}>
        Contact support
      </Button>
    </div>,
    slot,
  )
}
