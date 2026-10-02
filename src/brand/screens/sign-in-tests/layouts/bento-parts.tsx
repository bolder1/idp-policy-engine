import { motion } from 'motion/react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Check, CircleHelp, Lock, Maximize2, Minimize2, Minus, X, type LucideIcon } from 'lucide-react'

import type { LineStatus } from '../../testing/evidence'
import { Spinner } from '../PolicyStack'
import { TILE_LABEL, type TileId, type TilePhase } from './bento-model'

/* -----------------------------------------------------------------------------
   Bento's small pieces (BentoLayout.tsx): the marks, a row's number, a
   skeleton bar, and the tile — its frame, its label, the expand button, the
   working edge. The tile moves by motion alone (its place in the grid, the
   hero's landing); its colours change on the face inside it, by CSS — never
   a transition on what motion moves.
   -------------------------------------------------------------------------- */


export type MarkStatus = LineStatus | 'none'

const MARK: Record<MarkStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: 'Can’t tell' },
  none: { Icon: Minus, label: 'Not read' },
}

/** ✓ ✕ ? or –; a spinner while it is read. `pop` lands it with a small spring. */
export function Mark({ status, working = false, label, pop = false, big = false }: { status: MarkStatus; working?: boolean; label?: string; pop?: boolean; big?: boolean }) {
  if (working) return <span className="rl-bento__spin"><Spinner small /></span>
  const { Icon, label: said } = MARK[status]
  return (
    <motion.span
      className={`rl-bento__mark is-${status}${big ? ' is-big' : ''}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 560, damping: 24 } : { duration: 0 }}
    >
      <Icon size={big ? 13 : 11} strokeWidth={3} aria-hidden />
    </motion.span>
  )
}

/** A row's place in the engine's order; the last row is locked. */
export function Num({ n, tone }: { n: number | null; tone?: string }) {
  return <span className={`rl-bento__num${tone ? ` is-${tone}` : ''}`}>{n === null ? <Lock size={10} strokeWidth={2.4} aria-hidden /> : n}</span>
}

export function Skel({ w = '70%', h = 10 }: { w?: string; h?: number }) {
  return <span className="rl-bento__skel" style={{ width: w, height: h }} aria-hidden />
}

export interface TileProps {
  id: TileId
  area: string
  phase: TilePhase
  /** Expanded: the large detail view. Mini: another tile is. */
  size: 'normal' | 'open' | 'mini'
  /** Hovered or focused: its link to the hero lights. */
  hot: boolean
  /** The landed tone, on the tiles that carry it (the hero). */
  tone?: string
  /** The roving focus is here. */
  current: boolean
  title?: ReactNode
  /** Beside the title: a state word, a mark. */
  aside?: ReactNode
  node?: string
  onHot: (t: TileId | null) => void
  onFocusTile: (t: TileId) => void
  onToggle: (t: TileId) => void
  onKey: (t: TileId, e: KeyboardEvent<HTMLElement>) => void
  setRef: (t: TileId, el: HTMLElement | null) => void
  children: ReactNode
  className?: string
}

/* A tile: a region the arrows reach (one tab stop for the board), pressed on
   its face — not on a control inside it — to open in place. Three layers:
   the section is the grid's item and never moves; the face inside it is what
   the layout's glide moves and sizes (motion, imperatively, measured by
   offsets — BentoLayout.tsx); the skin under the content carries the colours
   and their CSS transitions. */
export function Tile(p: TileProps) {
  const label = TILE_LABEL[p.id]
  const open = p.size === 'open'
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const t = e.target as Element
    if (t.closest('button, a, input, select, textarea, [role="button"], .tsee') && !t.closest('.rl-bento__open')) return
    if (window.getSelection()?.toString()) return
    p.onToggle(p.id)
  }
  return (
    <section
      ref={(el) => p.setRef(p.id, el)}
      className={`rl-bento__tile is-${p.id} is-${p.phase} is-${p.size}${p.hot ? ' is-hot' : ''}${p.tone ? ` is-${p.tone}` : ''} ${p.className ?? ''}`}
      style={{ gridArea: p.area }}
      data-card
      data-tile={p.id}
      data-size={p.size}
      data-node={p.node}
      tabIndex={p.current ? 0 : -1}
      aria-label={`${label}${open ? ', expanded' : ''}`}
      aria-busy={p.phase === 'working' || undefined}
      onMouseEnter={() => p.onHot(p.id)}
      onMouseLeave={() => p.onHot(null)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) p.onFocusTile(p.id)
        p.onHot(p.id)
      }}
      onBlur={() => p.onHot(null)}
      onKeyDown={(e) => p.onKey(p.id, e)}
      onClick={onClick}
    >
      <div className="rl-bento__face">
        <span className="rl-bento__skin" aria-hidden />
        <div className="rl-bento__inner">
          <header className="rl-bento__head">
            <span className="rl-bento__label">{p.title ?? label}</span>
            {p.aside}
            <button type="button" className="rl-bento__open" tabIndex={-1} aria-label={open ? `Close ${label}` : `Expand ${label}`} title={open ? 'Close (Esc)' : 'Expand'}>
              {open ? <Minimize2 size={13} strokeWidth={2.2} aria-hidden /> : <Maximize2 size={13} strokeWidth={2.2} aria-hidden />}
            </button>
          </header>
          <div className="rl-bento__body">{p.children}</div>
        </div>
      </div>
    </section>
  )
}
