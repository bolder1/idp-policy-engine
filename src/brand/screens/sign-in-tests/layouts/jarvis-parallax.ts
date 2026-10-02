import { useEffect, type RefObject } from 'react'

/* -----------------------------------------------------------------------------
   Jarvis's depth (JarvisLayout.tsx): as the pointer moves over the room, its
   three layers drift apart a little — the ground stays, the HUD leans a few
   pixels with the pointer, the far rings behind it lean the other way — so
   the HUD reads as standing in front of its ground, not printed on it.

   Eased toward the pointer on its own frames (no React render), written
   straight to the two layers' `translate` — the individual property, not
   `transform`, so it composes with nothing motion owns, and RunStage measures
   its own world, which this never moves. Off under reduced motion, and
   still once the pointer has left and the layers are home.
   -------------------------------------------------------------------------- */

/** How far each layer leans at the room's edge, in px (x, y). */
const HUD = [4, 3] as const
const FAR = [-9, -7] as const

export function useParallax(root: RefObject<HTMLElement | null>, on: boolean): void {
  useEffect(() => {
    const el = root.current
    if (!el || !on) return
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let frame = 0
    const put = () => {
      const hud = el.querySelector<HTMLElement>('.rl-jarvis__world')
      const far = el.querySelector<HTMLElement>('.rl-jarvis__far')
      if (hud) hud.style.translate = `${(x * HUD[0]).toFixed(2)}px ${(y * HUD[1]).toFixed(2)}px`
      if (far) far.style.translate = `${(x * FAR[0]).toFixed(2)}px ${(y * FAR[1]).toFixed(2)}px`
    }
    const step = () => {
      x += (tx - x) * 0.09
      y += (ty - y) * 0.09
      if (Math.abs(tx - x) < 0.002 && Math.abs(ty - y) < 0.002) {
        x = tx
        y = ty
        frame = 0
      } else frame = requestAnimationFrame(step)
      put()
    }
    const go = () => {
      if (!frame) frame = requestAnimationFrame(step)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2))
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2))
      go()
    }
    const leave = () => {
      tx = 0
      ty = 0
      go()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(frame)
      x = 0
      y = 0
      put()
    }
  }, [root, on])
}
