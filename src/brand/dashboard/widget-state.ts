import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { shows } from '../rollout'
import type { Range } from './model'

/* -----------------------------------------------------------------------------
   A widget's states besides ready (22 Nov audit #12; owner, 23 Nov 2026: "real + URL preview"). Design only
   (rollout.ts dashboardPolish).

   · loading  a skeleton in the widget's own shape, on the board's first paint and after each Range change, for as
              long as a fetch would plausibly take (LOAD_MS). The seed answers at once; the console would not.
   · empty    "Nothing in this range": drawn by the kit's Table and BarList when a filter leaves them nothing
              (widget-kit `Empty`), and by every widget under ?states=empty.
   · error    "Couldn't load" and Retry, which loads again. Seen only under ?states=error until real data exists.

   ?states=loading|empty|error in the address shows every widget on the board in that state. It is read once, at load,
   and it is not a control on the page, so the showcase build (SHOWCASE) has nothing new to hide.
   -------------------------------------------------------------------------- */

export type WidgetState = 'ready' | 'loading' | 'empty' | 'error'

const POLISH = shows('dashboardPolish')

/** How long a load looks like it takes, in ms. */
export const LOAD_MS = 450

function readPreview(): Exclude<WidgetState, 'ready'> | null {
  try {
    const v = new URLSearchParams(location.search).get('states')
    return v === 'loading' || v === 'empty' || v === 'error' ? v : null
  } catch {
    return null
  }
}

/** The state every widget is shown in, from the address; null for each widget's own. */
export const PREVIEW_STATE = POLISH && typeof location !== 'undefined' ? readPreview() : null

/** Whether the board is loading: provided by the Dashboard around its board (useBoardLoading). */
export const BoardLoading = createContext(false)

/** Loading on the first paint and for LOAD_MS after each Range change. Off where the states are not shown. */
export function useBoardLoading(range: Range): boolean {
  const [loading, setLoading] = useState(POLISH)
  const first = useRef(true)
  useEffect(() => {
    if (!POLISH) return
    if (!first.current) setLoading(true)
    first.current = false
    const t = window.setTimeout(() => setLoading(false), LOAD_MS)
    return () => window.clearTimeout(t)
  }, [range])
  return loading
}

/** The state a widget is drawn in. A picture (popups, Customize's lifted copy) is always ready. */
export function useWidgetState(preview: boolean): { state: WidgetState; retry: () => void } {
  const loading = useContext(BoardLoading)
  const [retrying, setRetrying] = useState<'loading' | 'done' | null>(null)
  useEffect(() => {
    if (retrying !== 'loading') return
    const t = window.setTimeout(() => setRetrying('done'), LOAD_MS)
    return () => window.clearTimeout(t)
  }, [retrying])
  const retry = () => setRetrying('loading')
  if (!POLISH || preview) return { state: 'ready', retry }
  if (retrying === 'loading') return { state: 'loading', retry }
  if (PREVIEW_STATE && retrying !== 'done') return { state: PREVIEW_STATE, retry }
  return { state: loading ? 'loading' : 'ready', retry }
}
