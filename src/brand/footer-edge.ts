/* Where a page's footer puts its buttons (owner, 15 Oct 2026: "push the buttons
   to the end of the form", picked over keeping them at the page's far edge).

   The footer is a strip across the page column, portalled into `.bshell__main`
   as its last child, so CSS alone cannot see the page it sits under. This
   measures that page and gives the strip side insets, so its words and buttons
   start and end with the form:

   1. An element marked `data-footer-edge`, when a page needs to name its own.
   2. Else the form half of the shared 50 / 50 layout: the first column of
      `.bz7__cols`. Below 1120px those columns are one, so the form is the whole
      width and the footer follows it.
   3. Else the page's content box: `.bpage` inside its padding. That also holds
      the buttons in on a window wider than the page's 1560px cap, where the
      strip used to run on to the window's edge.

   With nothing to measure the insets are unset and kit.css's fallback stands.
   The strip itself, its rule and its shadow still run the full column. */

const FOOTER_L = '--footer-l'
const FOOTER_R = '--footer-r'

const shown = (el: Element): boolean => el.getClientRects().length > 0

function edgeOf(host: HTMLElement): { left: number; right: number } | null {
  const marked = [...host.querySelectorAll<HTMLElement>('[data-footer-edge]')].find(shown)
  if (marked) {
    const r = marked.getBoundingClientRect()
    return { left: r.left, right: r.right }
  }
  for (const cols of host.querySelectorAll<HTMLElement>('.bz7__cols')) {
    const form = cols.firstElementChild
    if (form && shown(form)) {
      const r = form.getBoundingClientRect()
      return { left: r.left, right: r.right }
    }
  }
  const page = [...host.querySelectorAll<HTMLElement>('.bpage')].find(shown)
  if (!page) return null
  const r = page.getBoundingClientRect()
  const cs = getComputedStyle(page)
  return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) }
}

function place(bar: HTMLElement, host: HTMLElement): void {
  const edge = edgeOf(host)
  if (!edge) {
    bar.style.removeProperty(FOOTER_L)
    bar.style.removeProperty(FOOTER_R)
    return
  }
  /* The column's inner box: the strip is as wide as the column less its
     scrollbar, so the right inset is measured from there. */
  const box = host.getBoundingClientRect()
  const inner = box.left + host.clientLeft
  const left = Math.max(0, Math.round(edge.left - inner))
  const right = Math.max(0, Math.round(inner + host.clientWidth - edge.right))
  bar.style.setProperty(FOOTER_L, `${left}px`)
  bar.style.setProperty(FOOTER_R, `${right}px`)
}

/** A ref callback for a footer strip. It measures once on mount and again when
    the column resizes or the page under it changes (a tab, a wizard step), and
    stops when the footer goes. */
export function footerEdge(bar: HTMLElement | null): (() => void) | undefined {
  if (!bar) return undefined
  const host = bar.parentElement
  if (!host) return undefined
  place(bar, host)
  let frame = 0
  const later = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => place(bar, host))
  }
  const sized = new ResizeObserver(later)
  sized.observe(host)
  /* Child lists only: a step or tab swaps the column; typing does not. */
  const changed = new MutationObserver(later)
  changed.observe(host, { childList: true, subtree: true })
  return () => {
    cancelAnimationFrame(frame)
    sized.disconnect()
    changed.disconnect()
  }
}
