import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { GripHorizontal, Minus, Palette } from 'lucide-react'
import { AnchoredPopover } from '../screens/testing/AnchoredPopover'
import { WIDGETS, type Range } from './model'
import type { Cell } from './layout'
import type { ThemeId } from './themes'
import { ColourList } from './ThemeMenus'
import { WidgetBody } from './widgets'

/* -----------------------------------------------------------------------------
   One widget on the board.

   Out of Customize it is only its card. In Customize the card is a picture
   (inert), and three controls sit on it, the way a phone's home screen does it:
   · a grabber at the top, which also takes the keyboard (Enter picks the
     widget up, the arrow keys move it, Enter sets it down) — and the whole
     card can be dragged by the pointer too;
   · a remove badge on its top-left corner;
   · a colour badge on its top-right corner: the widget keeps to the
     dashboard's theme, or takes one of its own.

   Its size is not its own: its column gives it a width and its row a height
   (layout.ts), and the bars between widgets change them (Board.tsx).
   -------------------------------------------------------------------------- */

export interface CellHandlers {
  onGrab: (c: Cell, e: PointerEvent<HTMLElement>) => void
  onKey: (c: Cell, e: KeyboardEvent<HTMLElement>) => void
  onRemove: (c: Cell) => void
  onPatch: (c: Cell, p: Partial<Pick<Cell, 'view' | 'pick'>>) => void
  onColour: (c: Cell, t: ThemeId | null) => void
}

const SPRING = { type: 'spring', stiffness: 460, damping: 42, mass: 0.9 } as const

export function CellView({
  cell,
  order,
  editing,
  range,
  movable,
  state,
  picked,
  building,
  boardTheme,
  instant,
  style,
  handlers,
}: {
  cell: Cell
  /** Its place in reading order, for the one-by-one arrival. */
  order: number
  editing: boolean
  range: Range
  /** It can be picked up: in Customize, on a wide enough page, and not held in place. */
  movable: boolean
  /** `slot`: it is being dragged, and this is where it was. `hidden`: its lifted copy is gliding into place. */
  state: 'rest' | 'slot' | 'hidden'
  /** Picked up from the keyboard. */
  picked: boolean
  /** The dashboard is being built: widgets arrive one after another. */
  building: boolean
  boardTheme: ThemeId
  /** Changes land at once rather than gliding (a bar is being dragged). */
  instant: boolean
  style?: CSSProperties
  handlers: CellHandlers
}) {
  const meta = WIDGETS[cell.widget]
  const still = useReducedMotion() === true
  const colourAnchor = useRef<HTMLSpanElement>(null)
  const [colourOpen, setColourOpen] = useState(false)
  const wait = building ? Math.min(0.9, order * 0.05) : 0
  return (
    <motion.section
      layoutId={cell.id}
      layout={still ? false : 'position'}
      data-cell={cell.id}
      data-dash-theme={cell.color}
      aria-label={meta.name}
      className={`bdash-tile is-${meta.kind}${editing ? ' is-editing' : ''}${state !== 'rest' ? ` is-${state}` : ''}${picked ? ' is-picked' : ''}${movable ? ' is-movable' : ''}`}
      style={{ flexGrow: cell.weight, ...style }}
      initial={still ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        layout: instant || still ? { duration: 0 } : SPRING,
        opacity: { duration: 0.26, delay: wait },
        y: { duration: 0.34, delay: wait, ease: [0.22, 1, 0.36, 1] },
      }}
      onPointerDown={movable ? (e) => handlers.onGrab(cell, e) : undefined}
    >
      <div className="bdash-tile__card" inert={editing || undefined}>
        <WidgetBody tile={cell} range={range} preview={editing} onPatch={(p) => handlers.onPatch(cell, p)} />
      </div>

      {editing && (
        <>
          <button type="button" className="bdash-tile__remove" data-chrome aria-label={`Remove ${meta.name}`} onClick={() => handlers.onRemove(cell)}>
            <Minus size={14} strokeWidth={2.6} aria-hidden />
          </button>
          <span ref={colourAnchor} className="bdash-tile__colour" data-chrome>
            <button type="button" aria-label={`Colour for ${meta.name}`} aria-expanded={colourOpen} className={cell.color ? 'is-set' : ''} onClick={() => setColourOpen((v) => !v)}>
              <Palette size={13} strokeWidth={2.2} aria-hidden />
            </button>
          </span>
          <AnchoredPopover anchor={colourAnchor} open={colourOpen} onClose={() => setColourOpen(false)} label={`Colour for ${meta.name}`} width={264} align="end">
            <div data-chrome>
              <ColourList
                value={cell.color ?? null}
                boardTheme={boardTheme}
                onPick={(t) => {
                  handlers.onColour(cell, t)
                  setColourOpen(false)
                }}
              />
            </div>
          </AnchoredPopover>
          {movable && (
            <button
              type="button"
              className="bdash-tile__grab"
              data-grab
              aria-label={picked ? `${meta.name}, picked up. Arrow keys move it, Enter sets it down, Escape puts it back.` : `Move ${meta.name}. Press Enter, then the arrow keys.`}
              aria-pressed={picked}
              onKeyDown={(e) => handlers.onKey(cell, e)}
            >
              <GripHorizontal size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        </>
      )}
    </motion.section>
  )
}

/** The copy under the pointer while a widget is dragged. Not a motion element, so its tilt is plain CSS. It is
    portalled out of the board, so it carries the dashboard's theme and brand colour with it. */
export function CellLift({
  cell,
  range,
  rect,
  settling,
  theme,
  brand,
}: {
  cell: Cell
  range: Range
  rect: { left: number; top: number; width: number; height: number }
  settling: boolean
  theme: ThemeId
  brand: string
}) {
  return (
    <div
      className={`bdash-lift bdash-vars is-${WIDGETS[cell.widget].kind}${settling ? ' is-settling' : ''}`}
      data-dash-theme={cell.color ?? theme}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, ['--dash-brand' as string]: brand }}
      aria-hidden
    >
      <div className="bdash-tile__card" inert>
        <WidgetBody tile={cell} range={range} preview />
      </div>
    </div>
  )
}
