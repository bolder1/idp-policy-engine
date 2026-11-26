import { useRef, useState } from 'react'
import { Columns3 } from 'lucide-react'

import type { Columns } from './columns'
import { Button } from './kit'
import { AnchoredPopover } from './screens/testing/AnchoredPopover'
import './manage-columns.css'

/* -----------------------------------------------------------------------------
   The Columns button on a table's bar, and its list (columns.ts, rollout.ts `manageColumns`).

   A secondary button with the columns mark; its word drops to the icon as the bar narrows, as the bar's others do. It
   opens a short list: a tick per column, the always-there ones ticked and greyed, and Reset to default when anything
   differs. A tick shows or hides its column at once; there is nothing to save.
   -------------------------------------------------------------------------- */

export function ManageColumns({ columns, label = 'Columns' }: { columns: Columns; label?: string }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement | null>(null)
  return (
    <>
      <span ref={anchor} className="bcols__anchor">
        <Button variant="secondary" icon={Columns3} title="Manage columns" expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="bbar__label">{label}</span>
        </Button>
      </span>
      <AnchoredPopover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Manage columns" width={260} align="end" className="bcols">
        <div className="bcols__in">
          <p className="bcols__head">Show columns</p>
          <ul className="bcols__list">
            {columns.defs.map((d) => {
              const on = columns.shown(d.id)
              return (
                <li key={d.id}>
                  <label className={`bcols__row${d.locked ? ' is-locked' : ''}`}>
                    <input type="checkbox" className="bpol__pick is-look" checked={on} disabled={d.locked} onChange={() => columns.toggle(d.id)} />
                    <span className="bcols__name">{d.label}</span>
                    {d.locked && <span className="bcols__meta">Always shown</span>}
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="bcols__foot">
            <Button variant="link" size="sm" disabled={!columns.changed} onClick={columns.reset}>
              Reset to default
            </Button>
          </div>
        </div>
      </AnchoredPopover>
    </>
  )
}
