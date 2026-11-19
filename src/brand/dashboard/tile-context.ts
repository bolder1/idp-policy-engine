import { createContext, useContext } from 'react'
import type { Cell } from './layout'
import type { Range, WidgetMeta } from './model'

/* What a widget knows about the place it is drawn in: which widget and view, the board's range, whether it is only a
   picture (Customize, a drag, the gallery), and how to remember a view or a filter on it. */
export interface TileCtx {
  tile: Pick<Cell, 'widget' | 'view' | 'pick'>
  meta: WidgetMeta
  range: Range
  /** Drawn to be looked at, not used: inert, never orange, finished rather than animating. */
  preview: boolean
  patch: (p: Partial<Pick<Cell, 'view' | 'pick'>>) => void
}

export const TileContext = createContext<TileCtx | null>(null)

export function useTile(): TileCtx {
  const ctx = useContext(TileContext)
  if (!ctx) throw new Error('A widget is drawn inside a tile')
  return ctx
}

/** The filter picked on the widget, if it is one of the widget's own; else the first. */
export function pickOf<T extends string>(ctx: TileCtx, options: readonly T[]): T {
  return options.includes(ctx.tile.pick as T) ? (ctx.tile.pick as T) : options[0]
}
