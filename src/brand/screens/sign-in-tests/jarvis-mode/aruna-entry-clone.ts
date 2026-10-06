/* -----------------------------------------------------------------------------
   The view, as a sheet the opening can lift (aruna-entry-film.ts): a frozen
   copy of the builder's region — the canvas and, when open, the Configure
   panel — taken once as the film starts and never rendered again. Measured
   on the live page: 24–30 ms for Focus (321 nodes) or Aruna (448).

   Frozen means: no animation or transition inside (`.sit-mv__frozen *` in
   jarvis-mode.css), `inert` and hidden from readers, and nothing a query
   for the live page could mistake for its own — the porthole, the film
   itself, ids. A view too big to copy cheaply gives a ghost instead.
   -------------------------------------------------------------------------- */

/** Past this, the copy would cost more than a frame or two: a ghost sheet stands in. */
const MAX_NODES = 4000

/** A frozen copy of `region` (the `.sit__bb`), sized to its box, or null when it is too big to copy. */
export function cloneView(region: HTMLElement): HTMLElement | null {
  if (region.getElementsByTagName('*').length > MAX_NODES) return null
  const copy = region.cloneNode(true) as HTMLElement
  for (const el of copy.querySelectorAll('.sit-jx, .sit-aruna-entry, script')) el.remove()
  for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id')
  /* Live text fields keep their typed values (a copy carries the attribute, not what was typed). */
  const live = region.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  const dead = copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (live.length === dead.length) dead.forEach((el, i) => el.setAttribute('value', live[i].value))
  /* The region's ground as it is now: some of it is drawn by rules a copy would not meet (`.sit > .sit__bb`). */
  const cs = getComputedStyle(region)
  copy.style.backgroundColor = groundOf(region).color
  copy.style.backgroundImage = cs.backgroundImage
  copy.style.backgroundSize = cs.backgroundSize
  copy.style.backgroundPosition = cs.backgroundPosition
  copy.style.backgroundRepeat = cs.backgroundRepeat
  copy.classList.add('sit-mv__frozen')
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  copy.style.position = 'absolute'
  copy.style.inset = '0'
  copy.style.margin = '0'
  copy.style.width = '100%'
  copy.style.height = '100%'
  return copy
}

/** Whether the region reads dark: its ground's own colour, so a ghost can wear it. */
export function groundOf(region: HTMLElement): { color: string; dark: boolean } {
  /* The first box out from the region that paints a ground of its own. */
  for (let el: HTMLElement | null = region; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor
    const m = color.match(/[\d.]+/g)?.map(Number)
    if (!m || m.length < 3 || (m.length > 3 && m[3] === 0)) continue
    return { color, dark: 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 128 }
  }
  return { color: '#f6f7f9', dark: false }
}
