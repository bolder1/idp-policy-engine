import { JARVIS_DISSOLVE_MS, JARVIS_END_MS, JARVIS_MID_MS, JARVIS_REDUCED_END_MS, JARVIS_REDUCED_MID_MS, type JarvisPhase } from './jarvis-timing'
import { cloneView, groundOf } from './aruna-entry-clone'

/* -----------------------------------------------------------------------------
   The multiverse (owner, 4 Oct 2026: "maybe a new multiverse-type thing that
   will be opening"): the same run, many views — this one is hers.

   The view lifts off the canvas as a rounded sheet and steps back; parallel
   copies of it fan out into depth over Aruna's warm black; her iris leaves
   the porthole and comes through them as every copy falls away; at MID the
   layout is swapped under full cover; ARUNA decodes; the iris lands on her
   reactor as the ground dissolves outward from it, so the opening hands
   over to her replay. The exit is the reverse, into the porthole.

   Every layer moves by the Web Animations API with literal values — the
   porthole and the reactor are measured, so the keyframes cannot be fixed in
   CSS — and only transform, opacity and clip-path move (clip-path in
   animations of its own, so the transforms stay on the compositor). Layout
   is read twice: as the film starts (the region, the porthole) and once at
   DISSOLVE − 60 (the reactor). The beats are jarvis-timing.ts's.
   -------------------------------------------------------------------------- */

export interface FilmLayers {
  root: HTMLElement
  ground: HTMLElement
  bands: HTMLElement[]
  grid: HTMLElement
  /** Far left, far right, near left, near right. */
  echoes: HTMLElement[]
  sheet: HTMLElement
  rim: HTMLElement
  ping: HTMLElement
  flare: HTMLElement
  iris: HTMLElement
  brand: HTMLElement
}

const IO = 'cubic-bezier(0.65, 0, 0.35, 1)'
const OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const IN = 'cubic-bezier(0.55, 0, 0.8, 0.35)'
const IRIS = 'cubic-bezier(0.5, 0, 0.15, 1)'
const WITHDRAW = 'cubic-bezier(0.62, 0, 0.3, 1)'

type Frame = [ms: number, props: Keyframe, easing?: string]

/** Keyframes by the film's clock: each [ms, props, easing to the next], held before the first and after the last. */
function play(el: Element, total: number, frames: Frame[], list: Animation[]): Animation {
  const kf: Keyframe[] = frames.map(([ms, props, easing]) => ({ ...props, offset: Math.min(1, ms / total), ...(easing ? { easing } : {}) }))
  if ((kf[0].offset ?? 0) > 0) kf.unshift({ ...frames[0][1], offset: 0 })
  if ((kf[kf.length - 1].offset ?? 1) < 1) kf.push({ ...frames[frames.length - 1][1], offset: 1 })
  const a = el.animate(kf, { duration: total, easing: 'linear', fill: 'both' })
  list.push(a)
  return a
}

/* The parallels' places in the fan: far pair, then near pair. */
const FAN = [
  { k: -2, x: -98, r: 34, z: -760, o: 0.3 },
  { k: 2, x: 98, r: -34, z: -760, o: 0.3 },
  { k: -1, x: -58, r: 22, z: -320, o: 0.55 },
  { k: 1, x: 58, r: -22, z: -320, o: 0.55 },
]

const centreOf = (r: DOMRect, box: DOMRect) => ({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top })

/** The bands' centre and reach: the whole region covered from any centre. */
function aimBands(l: FilmLayers, w: number, h: number, x: number, y: number) {
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 8
  l.ground.style.setProperty('--mv-cx', `${x}px`)
  l.ground.style.setProperty('--mv-cy', `${y}px`)
  l.ground.style.setProperty('--mv-ring', `${reach}px`)
}

/** A ghost sheet: the view's ground and a faint outline of its run, for a parallel that is not copied. */
function ghost(echo: HTMLElement, region: HTMLElement) {
  const g = groundOf(region)
  echo.classList.add('is-ghost', g.dark ? 'is-dark' : 'is-light')
  echo.style.backgroundColor = g.color
}

/** Plays the film on its layers; returns what stops it. */
export function runFilm(phase: JarvisPhase, l: FilmLayers): () => void {
  const anims: Animation[] = []
  const timers: number[] = []
  const frames: number[] = []
  const stop = () => {
    anims.forEach((a) => a.cancel())
    timers.forEach((t) => window.clearTimeout(t))
    frames.forEach((f) => cancelAnimationFrame(f))
  }
  const region = l.root.parentElement
  const box = l.root.getBoundingClientRect()
  const W = box.width
  const H = box.height
  if (!region || W === 0 || H === 0) return stop

  /* Reduced motion: the ground alone, a crossfade through it (for a host that plays one). */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    l.root.classList.add('is-reduced')
    aimBands(l, W, H, W / 2, H / 2)
    play(l.ground, JARVIS_REDUCED_END_MS, [[0, { opacity: 0 }], [JARVIS_REDUCED_MID_MS, { opacity: 1 }], [JARVIS_REDUCED_END_MS, { opacity: 0 }]], anims)
    return stop
  }

  const btn = document.querySelector('.sit-jx-btn')?.getBoundingClientRect()
  const orb = btn ? centreOf(btn, box) : { x: W - 48, y: H - 72 }
  const centre = { x: W / 2, y: H * 0.46 }
  for (const el of [l.ping, l.flare]) {
    el.style.left = `${orb.x}px`
    el.style.top = `${orb.y}px`
  }

  /* The view as a sheet now; the near parallels as copies on the next two frames, unseen until they fan out. */
  const sheetCopy = cloneView(region)
  if (sheetCopy) l.sheet.prepend(sheetCopy)
  else ghost(l.sheet, region)
  FAN.slice(0, 2).forEach((_, i) => ghost(l.echoes[i], region))
  let n = 0
  const copyNext = () => {
    const echo = l.echoes[2 + n]
    const copy = sheetCopy ? (sheetCopy.cloneNode(true) as HTMLElement) : null
    if (copy) {
      copy.inert = true
      echo.prepend(copy)
    } else ghost(echo, region)
    n += 1
    if (n < 2) frames.push(requestAnimationFrame(copyNext))
  }
  frames.push(requestAnimationFrame(copyNext))

  if (phase === 'enter') enter(l, { W, H, orb, centre }, anims, timers)
  else exit(l, { W, H, orb }, anims)
  return stop
}

function enter(l: FilmLayers, g: { W: number; H: number; orb: { x: number; y: number }; centre: { x: number; y: number } }, anims: Animation[], timers: number[]) {
  const END = JARVIS_END_MS
  const started = performance.now()
  const { W, H, orb, centre } = g
  aimBands(l, W, H, centre.x, centre.y)

  /* The ground comes up under the sheet (unseen behind it); the grid brightens as the views fall away. */
  play(l.ground, END, [[0, { opacity: 0 }], [180, { opacity: 1 }]], anims)
  play(l.grid, END, [[0, { opacity: 0.25 }], [700, { opacity: 0.7 }], [1150, { opacity: 1 }], [1400, { opacity: 0.6 }], [1750, { opacity: 0 }]], anims)
  l.bands.forEach((b, i) =>
    play(b, END, [[0, { opacity: 1 }], [JARVIS_DISSOLVE_MS + 80 + i * 45, { opacity: 1 }, 'cubic-bezier(0.3, 0, 0.3, 1)'], [JARVIS_DISSOLVE_MS + 300 + i * 45, { opacity: 0 }]], anims),
  )

  /* The press: a ping out of the porthole, its core's flare. */
  play(l.ping, END, [[0, { transform: 'scale(1)', opacity: 0 }], [40, { transform: 'scale(1)', opacity: 1 }, OUT], [520, { transform: 'scale(5.5)', opacity: 0 }]], anims)
  play(l.flare, END, [[0, { transform: 'scale(0.6)', opacity: 0 }], [60, { transform: 'scale(1.4)', opacity: 1 }, OUT], [380, { transform: 'scale(2.2)', opacity: 0 }]], anims)

  /* The view becomes a sheet, steps back, and falls away into the depth last of all. */
  play(l.sheet, END, [
    [0, { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }, IO],
    [160, { transform: 'translate3d(0, 0, 0) scale(0.985)', opacity: 1 }, IO],
    [700, { transform: 'translate3d(0, -2%, 0) scale(0.6)', opacity: 1 }, IN],
    [960, { transform: 'translate3d(0, -3%, -1400px) scale(0.6)', opacity: 0 }],
  ], anims)
  play(l.sheet, END, [[0, { clipPath: 'inset(0 round 0px)' }, IO], [160, { clipPath: 'inset(0 round 18px)' }]], anims)
  play(l.rim, END, [[0, { opacity: 0 }], [160, { opacity: 1 }]], anims)

  /* The parallels slide out from behind it — the same run, in other views — and fall away first. */
  FAN.forEach((f, i) => {
    const near = Math.abs(f.k) === 1
    const out = 200 + (near ? 1 : 2) * 50
    play(l.echoes[i], END, [
      [0, { transform: 'translate3d(0, -2%, -40px) rotateY(0deg) scale(0.6)', opacity: 0 }],
      [out, { transform: 'translate3d(0, -2%, -40px) rotateY(0deg) scale(0.6)', opacity: 0 }, OUT],
      [700 + (near ? 40 : 80), { transform: `translate3d(${f.x}%, -2%, ${f.z}px) rotateY(${f.r}deg) scale(0.6)`, opacity: f.o }, IN],
      [940, { transform: `translate3d(${f.x * 1.15}%, -3%, ${f.z - 1300}px) rotateY(${f.r}deg) scale(0.6)`, opacity: 0 }],
    ], anims)
  })

  /* Aruna arrives through them: the iris leaves the porthole and grows to the centre … */
  const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`
  play(l.iris, END, [
    [0, { transform: at(orb.x, orb.y, 0.16), opacity: 0 }],
    [120, { transform: at(orb.x, orb.y, 0.16), opacity: 1 }, IRIS],
    [940, { transform: at(centre.x, centre.y, 1), opacity: 1 }],
  ], anims)
  /* … the name decodes over the full cover (MID) and goes … */
  play(l.brand, END, [[0, { opacity: 0 }], [JARVIS_MID_MS, { opacity: 0 }], [JARVIS_MID_MS + 160, { opacity: 1 }], [1300, { opacity: 1 }], [1420, { opacity: 0, transform: 'translateY(-8px)' }]], anims)

  /* … and the iris lands on her reactor, measured as the HUD boots (DISSOLVE − 60): the bands dissolve out from it. */
  timers.push(
    window.setTimeout(() => {
      const box = l.root.getBoundingClientRect()
      const hub = document.querySelector('.sit__stage .rl-jarvis__hub3d')
      const r = hub?.getBoundingClientRect()
      const land = r && r.width > 0 ? centreOf(r, box) : centre
      const size = hub instanceof HTMLElement && hub.offsetWidth > 0 ? hub.offsetWidth : 300
      const s = r && r.width > 0 ? size / 300 : 1
      aimBands(l, W, H, land.x, land.y)
      const t0 = JARVIS_DISSOLVE_MS - 40
      const left = END - t0
      const a = l.iris.animate(
        [
          { transform: at(centre.x, centre.y, 1), opacity: 1, offset: 0, easing: IO },
          { transform: at(land.x, land.y, s), opacity: 1, offset: 300 / left },
          { transform: at(land.x, land.y, s), opacity: 1, offset: 340 / left },
          { transform: at(land.x, land.y, s), opacity: 0, offset: 540 / left },
          { transform: at(land.x, land.y, s), opacity: 0, offset: 1 },
        ],
        { duration: left, delay: Math.max(0, t0 - (performance.now() - started)), fill: 'both' },
      )
      anims.push(a)
    }, JARVIS_DISSOLVE_MS - 60),
  )
}

function exit(l: FilmLayers, g: { W: number; H: number; orb: { x: number; y: number } }, anims: Animation[]) {
  const END = JARVIS_END_MS
  const MID = JARVIS_MID_MS
  const { W, H, orb } = g
  aimBands(l, W, H, W / 2, H / 2)
  l.root.classList.add('is-out')
  const reach = Math.hypot(Math.max(orb.x, W - orb.x), Math.max(orb.y, H - orb.y)) + 8

  /* The ground is whole behind Aruna's sheet from the first frame; after MID it withdraws into the porthole. */
  play(l.ground, END, [
    [0, { clipPath: `circle(${reach}px at ${orb.x}px ${orb.y}px)` }],
    [MID, { clipPath: `circle(${reach}px at ${orb.x}px ${orb.y}px)` }, WITHDRAW],
    [1600, { clipPath: `circle(0px at ${orb.x}px ${orb.y}px)` }],
  ], anims)
  play(l.grid, END, [[0, { opacity: 0.6 }], [MID, { opacity: 0.6 }], [1500, { opacity: 0.2 }]], anims)

  /* Aruna becomes a sheet, steps back, and flies into the porthole, a circle by the time it gets there. */
  const side = Math.min(W, H)
  const dx = orb.x - W / 2
  const dy = orb.y - H / 2
  const s = 48 / side
  play(l.sheet, END, [
    [0, { transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, IO],
    [500, { transform: 'translate(0px, -12px) scale(0.64)', opacity: 1 }, 'cubic-bezier(0.6, 0, 0.9, 0.5)'],
    [950, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 1 }],
    [MID, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }],
  ], anims)
  const sx = Math.max(0, (W - side) / 2)
  const sy = Math.max(0, (H - side) / 2)
  play(l.sheet, END, [
    [0, { clipPath: 'inset(0px 0px round 0px)' }, IO],
    [500, { clipPath: 'inset(0px 0px round 18px)' }, 'cubic-bezier(0.6, 0, 0.9, 0.5)'],
    [950, { clipPath: `inset(${sy}px ${sx}px round ${side / 2}px)` }],
  ], anims)
  play(l.rim, END, [[0, { opacity: 0 }], [200, { opacity: 1 }], [800, { opacity: 1 }], [950, { opacity: 0 }]], anims)

  /* The parallels show at their places in the fan, then fold in behind it: the universes close. */
  FAN.forEach((f, i) => {
    play(l.echoes[i], END, [
      [0, { transform: `translate3d(${f.x}%, -1%, ${f.z}px) rotateY(${f.r}deg) scale(0.64)`, opacity: 0 }],
      [120, { transform: `translate3d(${f.x}%, -1%, ${f.z}px) rotateY(${f.r}deg) scale(0.64)`, opacity: f.o * 0.92 }, IO],
      [540, { transform: 'translate3d(0, -1%, -40px) rotateY(0deg) scale(0.64)', opacity: 0 }],
    ], anims)
  })

  /* A ping closes into the porthole as the sheet arrives; its core flares once as the dark is gone. */
  play(l.ping, END, [[0, { transform: 'scale(5)', opacity: 0 }], [790, { transform: 'scale(5)', opacity: 0 }], [830, { transform: 'scale(5)', opacity: 0.9 }, IN], [MID, { transform: 'scale(1)', opacity: 0 }]], anims)
  play(l.flare, END, [[0, { transform: 'scale(0.6)', opacity: 0 }], [1590, { transform: 'scale(0.6)', opacity: 0 }], [1650, { transform: 'scale(1.4)', opacity: 1 }, OUT], [1820, { transform: 'scale(1.8)', opacity: 0 }]], anims)
}
