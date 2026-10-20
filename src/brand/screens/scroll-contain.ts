/* -----------------------------------------------------------------------------
   A panel that scrolls keeps the wheel to itself — and one with nothing to
   scroll hands it straight to the page.

   `overscroll-behavior: contain` gives the first half: a panel scrolled to its
   end does not start scrolling the page under it. But Chrome applies it to any
   scroll container, overflowing or not, so a panel whose content fits swallowed
   every wheel over it and the page stopped answering there (measured on an
   application's Policies tab at a glance, 20 Oct 2026). So the panel is marked
   `data-scrolls` only while its content is taller than it is, and the sheet
   contains it only then. Kept current by a ResizeObserver on the panel and on
   whatever its content is, so a card opening into a scroll, or a window
   resized, flips it. Returns the cleanup.
   -------------------------------------------------------------------------- */
export function containWhileScrolling(panel: HTMLElement, content: readonly Element[]): () => void {
  const sync = () => panel.toggleAttribute('data-scrolls', panel.scrollHeight > panel.clientHeight + 1)
  sync()
  if (typeof ResizeObserver === 'undefined') return () => {}
  const ro = new ResizeObserver(sync)
  ro.observe(panel)
  for (const el of content) ro.observe(el)
  return () => ro.disconnect()
}
