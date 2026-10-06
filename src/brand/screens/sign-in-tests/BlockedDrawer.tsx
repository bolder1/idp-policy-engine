import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronsLeftRight, ChevronsRightLeft, X } from 'lucide-react'

import { Drawer, SearchBox } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { SAMPLE_DAY } from '../monitor-sample'
import { useSimEnv } from '../sim-env'
import { blockedSignIns, type BlockedRow } from './blocked'
import { PANEL_SLIDE as SLIDE } from './sign-in-card'

/* The help desk's way in (docs/specs/DENIAL-REASONS.md, step 4): the week's
   refused sign-ins across every application, in a panel at the right of the
   Policies page (owner, 5 Oct 2026: "on click at the right give me the list of
   sign-ins that are blocked, in the right side panel"). A search by person,
   application or place, and a press plays that sign-in in Access checks. In
   the saved picker's styles (try-bar.css `tbar-saved`). */

export const BLOCKED_BUTTON = 'Blocked sign-ins'

function BlockedList({ onPick }: { onPick: (r: BlockedRow) => void }) {
  const { policies, apps } = useBrand()
  const env = useSimEnv()
  const [q, setQ] = useState('')
  const rows = useMemo(() => blockedSignIns(policies, env, SAMPLE_DAY, apps, q), [policies, env, apps, q])
  return (
    <div className="tbar-saved">
      <div
        className="tbar-saved__search"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && rows[0]) {
            e.preventDefault()
            onPick(rows[0])
          }
        }}
      >
        <SearchBox block value={q} onChange={setQ} placeholder="Search by person, application or place" label="Search blocked sign-ins" />
      </div>
      {rows.length === 0 ? (
        <p className="tbar-saved__empty" role="status">
          {q.trim() ? `No blocked sign-ins match “${q.trim()}”` : 'No blocked sign-ins this week'}
        </p>
      ) : (
        <ul className="tbar-saved__list" aria-label="Blocked sign-ins">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="tbar-saved__opt is-app" onClick={() => onPick(r)}>
                <AppLogo appId={r.facts.appId ?? ''} name={r.app} size={16} />
                <span className="tbar-saved__text">
                  <span className="tbar-saved__name">{r.who}</span>
                  <span className="tbar-saved__meta">
                    {r.app} · {r.from} · {r.when}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BlockedDrawer({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: BlockedRow) => void }) {
  return (
    <Drawer open={open} onClose={onClose} title={BLOCKED_BUTTON} caption="A sample week. Press one to check it." width={480}>
      <BlockedList onPick={onPick} />
    </Drawer>
  )
}

/* The same list as the right-hand panel of the Access checks page, in the form's own slot and chrome (SavedPanel,
   TryPanel.tsx): its name, the width and the X in the head row, the list under it the whole height of the panel. It
   slides as the form slides, and is inert on its way out; the search takes the focus once it has arrived. Owner,
   5 Oct 2026: "open the blocked sign-ins like we have the configure form, same way — no slider". */
export function BlockedPanel({
  reduced,
  wide,
  onToggleWidth,
  onClose,
  onPick,
}: {
  reduced: boolean
  wide: boolean
  onToggleWidth: () => void
  onClose: () => void
  onPick: (r: BlockedRow) => void
}) {
  const present = useIsPresent()
  const heading = useId()
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => body.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }), reduced ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
  }, [reduced])
  return (
    <motion.aside
      className="bb__insp sit-panel sit-savedpanel"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule">
        <h2 id={heading} className="sit-panel__title">
          {BLOCKED_BUTTON}
        </h2>
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>
      <div ref={body} className="sit-savedpanel__body">
        <BlockedList onPick={onPick} />
      </div>
    </motion.aside>
  )
}

/** How many of the latest refusals the empty state's block shows before View all. */
export const RECENT_BLOCKED = 3

/* The empty Access checks canvas's block (owner, 5 Oct 2026: "improve the empty state … a fresh block that enables
   quick action"): the latest few refused sign-ins, each a press that fills the form with it, and View all, which
   opens the whole list in the form's panel. Nothing at all when nothing was refused. */
export function RecentBlocked({ onPick, onAll }: { onPick: (r: BlockedRow) => void; onAll: () => void }) {
  const { policies, apps } = useBrand()
  const env = useSimEnv()
  const head = useId()
  const rows = useMemo(() => blockedSignIns(policies, env, SAMPLE_DAY, apps).slice(0, RECENT_BLOCKED), [policies, env, apps])
  if (rows.length === 0) return null
  return (
    <section className="hiw__blocked" aria-labelledby={head}>
      <div className="hiw__blockedhead">
        <h3 id={head}>Recently blocked</h3>
        <button type="button" className="hiw__blockedall" onClick={onAll}>
          View all
          <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" className="hiw__blockedrow" onClick={() => onPick(r)}>
              <AppLogo appId={r.facts.appId ?? ''} name={r.app} size={16} />
              <span className="hiw__blockedtext">
                <span className="hiw__blockedwho">{r.who}</span>
                <span className="hiw__blockedmeta">
                  {r.app} · {r.from} · {r.when}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
