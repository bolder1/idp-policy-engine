import { useRef, useState } from 'react'
import { Check, Columns3 } from 'lucide-react'
import { AnchoredPopover } from '../screens/testing/AnchoredPopover'
import { COLS, type Row } from './layout'
import { splitChoices } from './splits'

/* -----------------------------------------------------------------------------
   A row's splits, in its margin above the grip (splits.ts): a button that
   opens the row's layouts as small diagrams. The one it has now is ticked;
   one its widgets cannot take is faint and says which widget holds it back.
   -------------------------------------------------------------------------- */

/** A split drawn small: one bar per column, as wide as its share. */
function Diagram({ spans }: { spans: readonly number[] }) {
  const gap = 2
  const w = 56
  const unit = (w - gap * (spans.length - 1)) / COLS
  const xs = spans.map((_, i) => spans.slice(0, i).reduce((a, s) => a + s * unit + gap, 0))
  return (
    <svg className="bdash-split__pic" viewBox={`0 0 ${w} 22`} aria-hidden>
      {spans.map((s, i) => (
        <rect key={i} x={xs[i]} y={0} width={s * unit} height={22} rx={3} />
      ))}
    </svg>
  )
}

export function SplitPicker({ row, index, onSplit }: { row: Row; index: number; onSplit: (spans: number[], name: string) => void }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const choices = splitChoices(row)
  if (choices.length === 0) return null
  const label = `Layout of row ${index + 1}`
  return (
    <span ref={anchor} className="bdash-row__split" data-chrome>
      <button type="button" className="bdash-row__splitbtn" aria-label={label} aria-expanded={open} title="Row layout" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={14} strokeWidth={2.2} aria-hidden />
      </button>
      <AnchoredPopover anchor={anchor} open={open} onClose={() => setOpen(false)} label={label} width={244} align="start">
        <div className="bdash-split" role="radiogroup" aria-label={label} data-chrome>
          {choices.map((c) => {
            const held = !c.on && c.why
            return (
              <button
                key={c.spans.join('-')}
                type="button"
                role="radio"
                aria-checked={c.on}
                aria-disabled={held ? true : undefined}
                aria-label={held ? `${c.name}: ${c.why}` : c.name}
                title={held ? (c.why ?? c.name) : c.name}
                className={`bdash-split__opt${c.on ? ' is-on' : ''}`}
                onClick={() => {
                  if (c.on || c.why) return
                  onSplit(c.spans, c.name)
                  setOpen(false)
                }}
              >
                <Diagram spans={c.spans} />
                {c.on && <Check size={14} strokeWidth={2.4} aria-hidden className="bdash-split__tick" />}
              </button>
            )
          })}
        </div>
      </AnchoredPopover>
    </span>
  )
}
