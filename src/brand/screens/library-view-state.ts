import { useState } from 'react'
import { LayoutGrid, Rows3, Table2, type LucideIcon } from 'lucide-react'

/* The view a library page is in, and what each view needs to page.

   Kept out of `library-view.tsx` so that file exports components only, which is
   what React's fast refresh needs to swap it in place. */

export type LibView = 'table' | 'list' | 'card'

export interface ViewOption<T extends string = LibView> {
  id: T
  label: string
  icon: LucideIcon
  /** Offered but not built — drawn, and not pressable. */
  disabled?: boolean
  /** The tooltip, where it says more than the label (why it is disabled). */
  note?: string
}

export const LIB_VIEWS: ViewOption[] = [
  { id: 'table', label: 'Table view', icon: Table2 },
  { id: 'list', label: 'List view', icon: Rows3 },
  { id: 'card', label: 'Card view', icon: LayoutGrid },
]

/* The height one line of each view takes, for `usePagedList`: how many fit is
   a division, so each shape holds its height fixed (see `.blib__*` in
   screens.css). A card line is the card and the gap under it. */
export function libRowHeight(view: LibView): number {
  if (view === 'table') return 57
  if (view === 'card') return 134 + 16
  return 84
}

/* Remembered per page, because it is a preference about reading and not about
   the data: an admin who wants Zones as a table wants it as a table tomorrow.
   Browser storage can throw in a private window, so every touch is guarded and
   the default survives. */
export function useLibView(key: string, fallback: LibView = 'list') {
  const [view, setView] = useState<LibView>(() => {
    try {
      const saved = localStorage.getItem(`idp.view.${key}`)
      return saved === 'table' || saved === 'list' || saved === 'card' ? saved : fallback
    } catch {
      return fallback
    }
  })
  return [
    view,
    (next: LibView) => {
      setView(next)
      try {
        localStorage.setItem(`idp.view.${key}`, next)
      } catch {
        /* A preference that cannot be stored is still a preference for now. */
      }
    },
  ] as const
}
