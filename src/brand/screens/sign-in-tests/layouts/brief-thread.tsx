import { motion } from 'motion/react'
import { useLayoutEffect, useState, type RefObject } from 'react'

import type { CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   The evidence thread (BriefLayout.tsx): while a citation is lit — hovered,
   focused, pinned or stepped to — a fine line runs from each of its numbers
   in the sentence down to its card's number, drawn as it appears. It says
   "this phrase, that proof" without a word. Measured by offsets inside the
   world (nothing it measures is moved by a transform), redrawn as the world
   changes size.
   -------------------------------------------------------------------------- */

interface Pt {
  x: number
  y: number
}

/** An element's place in `root`, by offsets (never a transformed rect). */
function offsetIn(el: HTMLElement, root: HTMLElement): Pt | null {
  let x = 0
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== root) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return n === root ? { x, y } : null
}

export function Thread({ root, lit, on, animate, sig }: { root: RefObject<HTMLDivElement | null>; lit: CiteId | null; on: boolean; animate: boolean; sig: string }) {
  const [paths, setPaths] = useState<string[]>([])
  useLayoutEffect(() => {
    const w = root.current
    if (!w || !lit || !on) {
      setPaths((p) => (p.length ? [] : p))
      return
    }
    const box = w.querySelector<HTMLElement>(`[data-ev="${lit}"]`)
    const no = box?.querySelector<HTMLElement>('.rl-brief__cardno')
    const top = box ? offsetIn(box, w) : null
    const num = no ? offsetIn(no, w) : null
    if (!box || !no || !top || !num) {
      setPaths((p) => (p.length ? [] : p))
      return
    }
    /* Into the card's top edge, over its number. */
    const end = { x: num.x + no.offsetWidth / 2, y: top.y + 3 }
    const out: string[] = []
    w.querySelectorAll<HTMLElement>(`.rl-brief__sentence [data-cite="${lit}"] .rl-brief__mk`).forEach((mk) => {
      const at = offsetIn(mk, w)
      if (!at) return
      const start = { x: at.x + mk.offsetWidth / 2, y: at.y + mk.offsetHeight + 2 }
      const mid = (start.y + end.y) / 2
      out.push(`M ${start.x} ${start.y} C ${start.x} ${mid}, ${end.x} ${mid}, ${end.x} ${end.y - 3}`)
    })
    setPaths((p) => (p.join('|') === out.join('|') ? p : out))
  }, [root, lit, on, sig])
  if (paths.length === 0) return null
  return (
    <svg className="rl-brief__thread" aria-hidden>
      {paths.map((d, i) => (
        <motion.path
          key={`${lit}:${i}`}
          d={d}
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: animate ? 0.32 : 0, ease: [0.2, 0, 0, 1] }}
        />
      ))}
    </svg>
  )
}
