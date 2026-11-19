import { memo, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import { GripHorizontal, Minus, Palette } from 'lucide-react'
import { AnchoredPopover } from '../screens/testing/AnchoredPopover'
import { WIDGETS, type Range } from './model'
import type { Cell } from './layout'
import type { CellBox } from './geometry'
import type { ThemeId } from './themes'
import { DASHBOARD_THEMES } from './phase'
import { ColourList } from './ThemeMenus'
import { WidgetBody } from './widgets'

/* -----------------------------------------------------------------------------
   One widget on the board.

   Out of Customize it is only its card. In Customize the card is inert, drawn
   just as it is, and its controls sit on it, the way a phone's home screen does it:
   · a grabber at the top, which also takes the keyboard (Enter picks the
     widget up, the arrow keys move it, Enter sets it down) — and the whole
     card can be dragged by the pointer too;
   · a remove badge on its top-left corner;
   · with themes on (phase.ts), a colour badge on its top-right corner.

   Its place and size are not its own: the board works them out (geometry.ts)
   and puts it there with a transform. The card is memoized on that box and
   its face on what it draws, so a bar held, a widget dragged past or a row
   moving redraws no chart (owner, 19 Nov 2026: "laggy … jittery").
   -------------------------------------------------------------------------- */

export interface CellHandlers {
  onGrab: (c: Cell, e: PointerEvent<HTMLElement>) => void
  onKey: (c: Cell, e: KeyboardEvent<HTMLElement>) => void
  onRemove: (c: Cell) => void
  onPatch: (c: Cell, p: Partial<Pick<Cell, 'view' | 'pick'>>) => void
  onColour: (c: Cell, t: ThemeId | null) => void
}

/** What the widget draws: the same for any place or size, so it is drawn again only when one of these changes. */
const Face = memo(
  function Face({ cell, range, preview, onPatch }: { cell: Cell; range: Range; preview: boolean; onPatch: CellHandlers['onPatch'] }) {
    return <WidgetBody tile={cell} range={range} preview={preview} onPatch={(p) => onPatch(cell, p)} />
  },
  (a, b) =>
    a.cell.id === b.cell.id &&
    a.cell.widget === b.cell.widget &&
    a.cell.view === b.cell.view &&
    a.cell.pick === b.cell.pick &&
    a.range === b.range &&
    a.preview === b.preview &&
    a.onPatch === b.onPatch,
)

interface TileProps {
  cell: Cell
  box: CellBox
  editing: boolean
  range: Range
  /** It can be picked up: in Customize, on a wide enough page, and not held in place. */
  movable: boolean
  /** `slot`: it is being dragged and this is where it was. `hidden`: its lifted copy is gliding into place. `dim`:
      its row is being moved. */
  state: 'rest' | 'slot' | 'hidden' | 'dim'
  /** Picked up from the keyboard. */
  picked: boolean
  boardTheme: ThemeId
  /** The tenant's brand colour, for the colour menu, which opens outside the board. */
  brand: string
  /** Stable for the board's life (Board.tsx), so a tile is not drawn again for a new set of callbacks. */
  handlers: CellHandlers
}

/** A widget's controls in Customize. Memoized apart from the card, so a widget that only moves (a row above it growing,
    say) does not draw its buttons and their icons again on every frame. */
const Chrome = memo(
  function Chrome({ cell, movable, picked, boardTheme, brand, handlers }: Pick<TileProps, 'cell' | 'movable' | 'picked' | 'boardTheme' | 'brand' | 'handlers'>) {
    const meta = WIDGETS[cell.widget]
    const colourAnchor = useRef<HTMLSpanElement>(null)
    const [colourOpen, setColourOpen] = useState(false)
    return (
      <>
        <button type="button" className="bdash-tile__remove" data-chrome aria-label={`Remove ${meta.name}`} onClick={() => handlers.onRemove(cell)}>
          <Minus size={14} strokeWidth={2.6} aria-hidden />
        </button>
        {DASHBOARD_THEMES && (
          <>
            <span ref={colourAnchor} className="bdash-tile__colour" data-chrome>
              <button type="button" aria-label={`Colour for ${meta.name}`} aria-expanded={colourOpen} className={cell.color ? 'is-set' : ''} onClick={() => setColourOpen((v) => !v)}>
                <Palette size={13} strokeWidth={2.2} aria-hidden />
              </button>
            </span>
            <AnchoredPopover anchor={colourAnchor} open={colourOpen} onClose={() => setColourOpen(false)} label={`Colour for ${meta.name}`} width={264} align="end">
              <div data-chrome className="bdash-vars" style={{ ['--dash-brand' as string]: brand }}>
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
          </>
        )}
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
    )
  },
  (a, b) =>
    a.cell.id === b.cell.id &&
    a.cell.widget === b.cell.widget &&
    a.cell.color === b.cell.color &&
    a.movable === b.movable &&
    a.picked === b.picked &&
    a.boardTheme === b.boardTheme &&
    a.brand === b.brand &&
    a.handlers === b.handlers,
)

function TileView({ cell, box, editing, range, movable, state, picked, boardTheme, brand, handlers }: TileProps) {
  const meta = WIDGETS[cell.widget]
  return (
    <section
      data-cell={cell.id}
      data-row={box.row}
      data-col={box.col}
      data-dash-theme={DASHBOARD_THEMES ? cell.color : undefined}
      aria-label={meta.name}
      className={`bdash-tile is-${meta.kind}${editing ? ' is-editing' : ''}${state !== 'rest' ? ` is-${state}` : ''}${picked ? ' is-picked' : ''}${movable ? ' is-movable' : ''}`}
      style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}
      onPointerDown={movable ? (e) => handlers.onGrab(cell, e) : undefined}
    >
      {/* In Customize the card is inert but drawn as it always is, buttons and all: switching its face to a picture
          redrew every chart on the way in and out, and moved the words inside the cards about. */}
      <div className="bdash-tile__card" inert={editing || undefined}>
        <Face cell={cell} range={range} preview={false} onPatch={handlers.onPatch} />
      </div>

      {editing && <Chrome cell={cell} movable={movable} picked={picked} boardTheme={boardTheme} brand={brand} handlers={handlers} />}
    </section>
  )
}

/** A widget, drawn again only when its place, its size, what it draws or its state in Customize changes. */
export const Tile = memo(
  TileView,
  (a, b) =>
    a.cell.id === b.cell.id &&
    a.cell.widget === b.cell.widget &&
    a.cell.view === b.cell.view &&
    a.cell.pick === b.cell.pick &&
    a.cell.color === b.cell.color &&
    a.box.x === b.box.x &&
    a.box.y === b.box.y &&
    a.box.w === b.box.w &&
    a.box.h === b.box.h &&
    a.box.row === b.box.row &&
    a.box.col === b.box.col &&
    a.editing === b.editing &&
    a.range === b.range &&
    a.movable === b.movable &&
    a.state === b.state &&
    a.picked === b.picked &&
    a.boardTheme === b.boardTheme &&
    a.brand === b.brand &&
    a.handlers === b.handlers,
)

/** The copy under the pointer while a widget is dragged. It is drawn once; the board moves it with a transform on
    every frame (Board.tsx), and it is portalled out of the board, so it carries the dashboard's theme with it. */
export const CellLift = memo(function CellLift({
  ref,
  cell,
  range,
  width,
  height,
  theme,
  brand,
}: {
  ref: Ref<HTMLDivElement>
  cell: Cell
  range: Range
  width: number
  height: number
  theme: ThemeId
  brand: string
}) {
  return (
    <div
      ref={ref}
      className={`bdash-lift bdash-vars is-${WIDGETS[cell.widget].kind}`}
      data-dash-theme={DASHBOARD_THEMES ? (cell.color ?? theme) : 'mono'}
      style={{ width, height, ['--dash-brand' as string]: brand }}
      aria-hidden
    >
      <div className="bdash-tile__card" inert>
        <WidgetBody tile={cell} range={range} preview />
      </div>
    </div>
  )
})
