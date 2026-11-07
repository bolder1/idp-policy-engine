import { useState } from 'react'
import { X } from 'lucide-react'
import { useBrand } from '../store'
import { addedLabel } from '../data'
import { OLD_CLOSES, SHOW_TIME_DAYS, daysLeft, deadlineNow } from './legacy'

/* The rail's quiet reminder (Vercel's sidebar card): only in the last three months before the old policies close, and
   only while something has not moved. Dismissed for the visit; the old pages' banner still says it in full. Its one
   press plays the intro, as every Start migration does. */
export function RailReminder() {
  const store = useBrand()
  const [shut, setShut] = useState(false)
  const unmoved = store.legacy.policies.filter((lp) => !store.movedLegacy[lp.id]).length
  const days = daysLeft(deadlineNow(store.deadlineView))
  if (shut || unmoved === 0 || days > SHOW_TIME_DAYS) return null
  return (
    <aside className="brail-note" aria-label="Old policies closing">
      <button type="button" className="brail-note__x" aria-label="Dismiss" onClick={() => setShut(true)}>
        <X size={14} strokeWidth={2} />
      </button>
      <b>Old policies close on {addedLabel({ addedOn: OLD_CLOSES })}</b>
      <span>{days <= 0 ? 'Today' : days === 1 ? '1 day left' : `${days} days left`}</span>
      <button type="button" className="brail-note__go" onClick={() => store.openIntro('migrate')}>
        Start migration
      </button>
    </aside>
  )
}
