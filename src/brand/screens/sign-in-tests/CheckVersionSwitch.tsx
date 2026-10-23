import { useRef, type KeyboardEvent } from 'react'

import { CHECK_VERSIONS, CHECK_VERSION_WORD, useCheckVersion, type CheckVersion } from './check-version'
import { ACCESS_CHECK } from './names'
import { VERSION_SWITCH } from './phase'

/* -----------------------------------------------------------------------------
   CLASSIC OR V3 (phase.ts VERSION_SWITCH; owner, 20 Oct 2026: "give me the
   classic version of Check access … and the current v2 as a modern one", then
   "Classic the old version, v2 the one-card edition, v3 the same as the edit
   builder", then "Remove v2, no need, it's bad"): Classic · v3, v3 the run on
   the builder's own canvas (BUILDER_CANVAS_CHECK). The page-head preview
   idiom (page-bar.tsx `WidthSwitch`): its word, then the segments — the very
   `.bseg` the Canvas switch stood in this slot with — as a radio group, the one
   chosen in the accent's soft fill (slate in the console look, blue in the
   rebrand), never orange.

   ← ↑ → ↓ choose the neighbour and take the focus with them, wrapping; Home and
   End the ends; Space and Enter are the button's own. Escape is never held: the
   page's panels close on it. The choice is check-version.ts's, kept on this
   browser; a run on screen plays again in the other version (TryJourney.tsx).
   -------------------------------------------------------------------------- */

export function CheckVersionSwitch() {
  const [version, setVersion] = useCheckVersion()
  const group = useRef<HTMLDivElement | null>(null)
  if (!VERSION_SWITCH) return null
  const pick = (v: CheckVersion, focus: boolean) => {
    if (v !== version) setVersion(v)
    if (focus) group.current?.querySelector<HTMLButtonElement>(`[data-version="${v}"]`)?.focus()
  }
  const keys = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = CHECK_VERSIONS.length
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null
    if (to === null) return
    e.preventDefault()
    pick(CHECK_VERSIONS[to], true)
  }
  return (
    <div className="bwidth sit-version">
      <span className="bwidth__label" aria-hidden>
        Version
      </span>
      {/* Named for the surface (names.ts): "Check access version". */}
      <div ref={group} className="bseg" role="radiogroup" aria-label={`${ACCESS_CHECK} version`}>
        {CHECK_VERSIONS.map((v, i) => (
          <button
            key={v}
            type="button"
            role="radio"
            data-version={v}
            aria-checked={v === version}
            tabIndex={v === version ? 0 : -1}
            className={v === version ? 'is-on' : ''}
            onClick={() => pick(v, false)}
            onKeyDown={keys(i)}
          >
            {CHECK_VERSION_WORD[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
