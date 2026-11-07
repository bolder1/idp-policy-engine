import { Check } from 'lucide-react'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'

/* The two small pieces every Move screen draws: an application's logo (the product's own AppLogo, the mark every
   other page shows), and the row check. */

export function AppTile({ appId, size = 24 }: { appId: string; size?: number }) {
  const { moveApps } = useBrand()
  return <AppLogo appId={appId} name={moveApps.find((a) => a.id === appId)?.name} size={size} />
}

export function RowCheck({ on, label, disabled, onChange }: { on: boolean | 'mixed'; label: string; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`bmove__check${on ? ' is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(on !== true)
      }}
    >
      <span className="bx-tick" aria-hidden>
        {on === 'mixed' ? <span className="bmove__dash" /> : <Check size={11} strokeWidth={3.2} />}
      </span>
    </button>
  )
}


/* One labelled fact of a list row, the Zones way: the word, then up to three chips and a count of the rest. */
export function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <span className="blist__fact">
      <span className="blist__label">{label}</span>
      {values.slice(0, 3).map((v) => (
        <i key={v} className="bmv__chip">
          {v}
        </i>
      ))}
      {values.length > 3 && <i className="bmv__chip is-more">+{values.length - 3}</i>}
    </span>
  )
}

