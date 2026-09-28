import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { Policy } from '../../data'
import { Badge, Button, StatusPill } from '../../kit'
import { useBrand } from '../../store'
import type { TenantResolution, WatchedResult } from '../tenant-resolver'
import { WatchingBadge } from '../watching-line'
import { whichPolicyRows, type WhichRow } from './which-policy'
import './testing.css'

/* -----------------------------------------------------------------------------
   Which policy decides this sign-in — every policy on the application, each
   with the resolver's own reason, in list order (which-policy.ts has the rows).

   Full, on the Policy testing page: names open the policy, an off policy on
   the application offers Assume on, and the policies on other applications
   fold away under "Not on {app}" — collapsed, and with no count, because the
   number of policies that do not apply is not a fact anybody tests for.

   Compact, in the board's Which policy stage: the policies on the
   application and nothing else, at the stage's own size.

   The deciding row carries the blue edge — the one active state here. Every
   other row is grey text, struck through only where it lost outright.
   -------------------------------------------------------------------------- */

export function WhichPolicy({
  resolution,
  appId,
  compact = false,
  assumedId = null,
  substitute,
  watching,
  onAssume,
  onOpen,
}: {
  resolution: Pick<TenantResolution, 'standings' | 'watching'>
  appId: string | null
  compact?: boolean
  /** The policy Assume on evaluates as on. */
  assumedId?: string | null
  /** The policy standing in for its stored twin in this resolution: a board draft, or the assumed one. */
  substitute?: Policy
  /** What monitoring policies would decide as the tenant stands, for one standing in as though on. */
  watching?: readonly WatchedResult[]
  onAssume?: (policyId: string) => void
  onOpen?: (policyId: string) => void
}) {
  const { policies, apps } = useBrand()
  const rows = useMemo(
    () => whichPolicyRows(resolution, policies, appId, { assumedId, substitute, watching }),
    [resolution, policies, appId, assumedId, substitute, watching],
  )
  const [openOff, setOpenOff] = useState(false)
  const appName = apps.find((a) => a.id === appId)?.name ?? 'this application'

  /* No application, no list: which policies are "on" it is the question, and
     the caller's incomplete state is the answer (Choose a person and an
     application). */
  if (appId === null) return null

  return (
    <div className={`twhich${compact ? ' is-compact' : ''}`}>
      <ul className="twhich__list">
        {rows.on.map((row) => (
          <Row key={row.policyId} row={row} onAssume={onAssume} onOpen={onOpen} />
        ))}
      </ul>
      {!compact && rows.off.length > 0 && (
        <div className="twhich__off">
          <button type="button" className="twhich__fold" aria-expanded={openOff} onClick={() => setOpenOff((v) => !v)}>
            <ChevronDown size={14} strokeWidth={2} aria-hidden className="twhich__chev" />
            Not on {appName}
          </button>
          {openOff && (
            <ul className="twhich__list is-off">
              {rows.off.map((row) => (
                <Row key={row.policyId} row={row} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ row, onAssume, onOpen }: { row: WhichRow; onAssume?: (id: string) => void; onOpen?: (id: string) => void }) {
  const name = onOpen ? (
    <button type="button" className="twhich__name is-link" onClick={() => onOpen(row.policyId)}>
      {row.name}
    </button>
  ) : (
    <span className="twhich__name">{row.name}</span>
  )
  /* A watching row's reason is what its badge already says — "Monitoring:
     would allow with 2FA" — so the badge stands alone. */
  const reason = row.kind !== 'watching' && row.showReason
  return (
    <li className={`twhich__row is-${row.kind}${row.struck ? ' is-struck' : ''}`} aria-current={row.kind === 'decides' ? 'true' : undefined}>
      <div className="twhich__head">
        {name}
        {row.monitoring && <StatusPill status="monitor" />}
        {row.assumed && <Badge tone="neutral">Assumed on</Badge>}
      </div>
      {row.watched && <WatchingBadge watched={row.watched} />}
      {reason && <p className="twhich__reason">{row.reason}</p>}
      {row.assumable && !row.assumed && onAssume && (
        <span className="twhich__act">
          <Button variant="link" size="sm" onClick={() => onAssume(row.policyId)}>
            Assume on
          </Button>
        </span>
      )}
    </li>
  )
}
