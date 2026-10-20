import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Fragment, useId, type ReactNode } from 'react'

import { Button } from '../../kit'
import { DENY_REASON_WORD, denyRef } from '../testing/deny-reason'
import { activitySummaryOf, deviceSaid, type ActivityRow } from './activity'
import { CopyText } from './CopyText'
import { ACCESS_CHECK } from './names'
import './sign-in-activity.css'

/* -----------------------------------------------------------------------------
   One sign-in of the week, as a table row that opens in place: the row the
   Sign-in activity page lists (SignInActivity.tsx), and the one an
   application's Policies tab lists (app-activity.tsx, APP-POLICY-TAB.md D2).

   The caller draws the row's cells and places the When cell's toggle where its
   columns want it — first on the page, after Result on the tab. Under it, the
   detail: what decided it, the reason with its reference on a refusal (admin
   only, owner 5 Oct 2026), and two ways on — the same sign-in in Check access,
   for Run to play, and a summary for a ticket.

   The tab adds the device and its risk, and the place on a narrow window where
   its From column is hidden; it also opens and closes with motion. The page's
   detail appears at once, as it always has.
   -------------------------------------------------------------------------- */

export function SignInRow({
  row: r,
  open,
  onToggle,
  when,
  cells,
  colSpan,
  onOpenInChecks,
  tab = false,
  reduced = false,
}: {
  row: ActivityRow
  open: boolean
  onToggle: () => void
  /** The When cell's words: "Mon 09:30" on the page, "Thu 8 Oct, 11:20" on an application's tab. */
  when: string
  /** The row's cells, given the When cell's toggle to place. */
  cells: (toggle: ReactNode) => ReactNode
  colSpan: number
  /** Opens the sign-in in Check access: the caller loads it and moves. */
  onOpenInChecks: (r: ActivityRow) => void
  /** On an application's Policies tab: the device and its risk in the detail, and motion. */
  tab?: boolean
  reduced?: boolean
}) {
  const detailId = useId()
  const toggle = (
    <button type="button" className="sia__toggle" aria-expanded={open} aria-controls={open ? detailId : undefined} aria-label={`${r.who} on ${r.app}, ${when}. Show details`} onClick={onToggle}>
      <ChevronRight size={14} strokeWidth={2} aria-hidden className="sia__chev" />
      {when}
    </button>
  )
  const detail = <Detail row={r} tab={tab} onOpenInChecks={onOpenInChecks} />
  return (
    <Fragment>
      <tr className={`sia__row${open ? ' is-open' : ''}`}>{cells(toggle)}</tr>
      {tab ? (
        <AnimatePresence initial={false}>
          {open && (
            <tr key="detail" className="sia__detail is-moving" id={detailId}>
              <td colSpan={colSpan}>
                <motion.div
                  className="sia__reveal"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
                >
                  {detail}
                </motion.div>
              </td>
            </tr>
          )}
        </AnimatePresence>
      ) : (
        open && (
          <tr className="sia__detail" id={detailId}>
            <td colSpan={colSpan}>{detail}</td>
          </tr>
        )
      )}
    </Fragment>
  )
}

function Detail({ row: r, tab, onOpenInChecks }: { row: ActivityRow; tab: boolean; onOpenInChecks: (r: ActivityRow) => void }) {
  return (
    <div className="sia__panel">
      <dl className="sia__lines">
        {/* Only a sign-in something decided: a Can't tell one was decided by nobody, whatever policy it reached. */}
        {r.policyName && r.decision && (
          <div>
            <dt>Decided by</dt>
            <dd>
              {r.policyName}
              {r.ruleLine && <span className="sia__muted"> · {r.ruleLine}</span>}
            </dd>
          </div>
        )}
        {r.reason && (
          <div>
            <dt>Reason</dt>
            <dd>
              {DENY_REASON_WORD[r.reason]} <span className="sia__muted">· {denyRef(r.reason)}</span>
            </dd>
          </div>
        )}
        {tab && (
          /* The From column goes on a narrow window; the place stays here. */
          <div className="sia__narrow">
            <dt>From</dt>
            <dd>{r.from}</dd>
          </div>
        )}
        {tab && (
          <div>
            <dt>Device</dt>
            <dd>
              {deviceSaid(r.facts.device)}
              {r.facts.risk && <span className="sia__muted"> · Risk {r.facts.risk.score}</span>}
            </dd>
          </div>
        )}
      </dl>
      <div className="sia__acts">
        <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => onOpenInChecks(r)}>
          Open in {ACCESS_CHECK}
        </Button>
        <CopyText text={activitySummaryOf(r)} className="bb__act sia__copy" />
      </div>
    </div>
  )
}
