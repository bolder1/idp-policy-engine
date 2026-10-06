import { useState } from 'react'

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
   shelf's first. Focus, the main view, leads both shelves (4 Oct 2026; v1
   is on the Archive shelf as "Focus v1"). Aruna (Jarvis) is on
   neither shelf: its way in stands on the canvas (JarvisMode.tsx), and while
   it is on the Canvas dropdown says so in its placeholder. */
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
