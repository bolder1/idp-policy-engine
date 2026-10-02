import { useState } from 'react'
import { BookOpenText, GalleryHorizontal, type LucideIcon } from 'lucide-react'

import { Picker } from '../../picker'
import { DEDICATED, RUN_LAYOUTS, layoutsOn, shelfOf, type CanvasShelf, type RunLayoutId } from './run-layout'
import './canvas-bar.css'

/* The run's layout, chosen on the page's bar (run-layout.ts), while the
   layouts are compared — two dropdowns, the console's prefixed filter
   dropdowns ("Show  Favourites", "Canvas  Tree", as Zones' "Show" and Device
   profiles' "Type"; owner, 2 Oct 2026: "make this into a dropdown like the
   filters we have"):

     Show    the shelf — Favourites, or the Archive of the ones he doesn't like
     Canvas  the layouts on that shelf

   Moving to a shelf that does not hold the layout on screen shows that
   shelf's first. The dedicated views — Focus, Brief and Jarvis — are on
   neither shelf: each has its own button beside the switch
   (`DedicatedViews`, and Jarvis's JarvisMode.tsx); while one is on, the
   Canvas dropdown says so in its placeholder. */
export function CanvasSwitch({ value, onChange, favourites }: { value: RunLayoutId; onChange: (next: RunLayoutId) => void; favourites: readonly RunLayoutId[] }) {
  const [shelf, setShelf] = useState<CanvasShelf>(() => shelfOf(value, favourites) ?? 'favourites')
  const shown = layoutsOn(shelf, favourites)
  const onShelf = shown.some((l) => l.value === value)
  const pick = (next: CanvasShelf) => {
    setShelf(next)
    const on = layoutsOn(next, favourites)
    if (on.length > 0 && shelfOf(value, favourites) !== null && !on.some((l) => l.value === value)) onChange(on[0].value)
  }
  return (
    <div className="sit__canvassw">
      <Picker
        label="Show layouts"
        size="sm"
        prefix="Show"
        value={shelf}
        options={[
          { value: 'favourites', label: 'Favourites' },
          { value: 'archive', label: 'Archive' },
        ]}
        onChange={(v) => pick(v as CanvasShelf)}
        searchable={false}
      />
      <Picker
        label="Canvas layout"
        size="sm"
        prefix="Canvas"
        value={onShelf ? value : null}
        placeholder={DEDICATED.includes(value) ? `${RUN_LAYOUTS.find((l) => l.value === value)?.label ?? ''} is on` : 'Choose…'}
        options={shown.map((l) => ({ value: l.value, label: l.label }))}
        onChange={(v) => onChange(v as RunLayoutId)}
        searchable={false}
      />
    </div>
  )
}

const DEDICATED_BUTTONS: { id: RunLayoutId; label: string; icon: LucideIcon }[] = [
  { id: 'focus', label: 'Focus', icon: GalleryHorizontal },
  { id: 'brief', label: 'Brief', icon: BookOpenText },
]

/* Focus and Brief, each its own button (owner, 2 Oct 2026: "Brief and Focus
   can be two dedicated views — those are very good"): pressed while it is the
   layout on screen. Jarvis's button is JarvisMode.tsx's, with its entrance. */
export function DedicatedViews({ value, onChange }: { value: RunLayoutId; onChange: (next: RunLayoutId) => void }) {
  return (
    <div className="sit-views" role="group" aria-label="Dedicated views">
      {DEDICATED_BUTTONS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className={`sit-views__btn${value === id ? ' is-on' : ''}`} aria-pressed={value === id} onClick={() => onChange(id)}>
          <Icon size={14} strokeWidth={2} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
