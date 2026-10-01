import { motion, useReducedMotion } from 'motion/react'
import { memo, useId, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { ArrowUpRight, BookmarkPlus, Info, RotateCcw, TriangleAlert, X } from 'lucide-react'

import type { AccessDecision, Policy } from '../../data'
import { IconButton, Tabs, Tip } from '../../kit'
import { useBrand } from '../../store'
import type { ColumnView } from '../board/try-sign-in'
import { useSimEnv } from '../sim-env'
import { savedOnPolicy } from './board-views'
import type { Boundaries } from './boundaries'
import { DockPast } from './DockPast'
import { DockPeople } from './DockPeople'
import { DockSaved } from './DockSaved'
import type { RowsRead } from './rows-read'
import { savedRows } from './selectors'
import type { FormField, FormIssue, SignInForm } from './sign-in-form'
import type { SentenceScope } from './sign-in-sentence'
import { SaveSignInPopover, SentenceVerdict, SignInSentence } from './SignInSentence'
import { DOCK_TAB_LABEL, dockTabShown, dockTabs, libraryTabOf, policyApps, type DockTab } from './test-dock'

/* -----------------------------------------------------------------------------
   Try a sign-in's test panel: the board's right-hand column while a sign-in
   is tried (Policy testing V4, §2.4-bis).

   The sentence floated over the canvas and the tests sat in a dock under it
   for a day; the owner looked at both and said "fix this so this is good in
   the right side panel … the rest looks fine". So they are ONE panel in the
   inspector's own column, and the canvas keeps only the trace — the start
   node, the check pills, the lit spine and the outcome — which he accepted as
   it is.

   Top to bottom, the order a question about one sign-in narrows in:

     header     Try a sign-in, and the run's own buttons: Replay, Save
                sign-in, Open Sign-in tests | Close
     sign-in    the sentence of pills, then what it gets — the version's name
                over its badge, or Today → Your edits as two mini columns —
                and the one line that says why. Never scrolls.
     tabs       Saved sign-ins · People · Past sign-ins · Break-in test, line
                tabs in the product's orange. Fixed.
     body       the tab. The only part that scrolls.

   It wears the inspector's chrome (`.bb__insp`): the same floating card, the
   same grip on its leading edge (the board owns the width), and the board's
   key handler already treats anything inside `.bb__insp` as a surface a rule
   shortcut never reaches. A card clicked on the chain swaps the rule editor
   into this column; its × brings this panel back on the same tab, because
   the tab is the board's state and not this component's.

   The status region (what a run says aloud) is not here: it has to outlive
   the panel while the rule editor holds the column, so the board keeps it.
   -------------------------------------------------------------------------- */

export interface TestPanelProps {
  /** The builder's draft: its applications and audience scope every tab. */
  draft: Policy
  /** The board's version (`boardVersion(saved, draft)`); null for the tenant as it stands. */
  version: { substitute: Policy; label: string; tip: string } | null
  // --- The sign-in ---
  form: SignInForm
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  /** A whole sign-in in place of this one, played as a run: a saved or past row. */
  onLoad: (form: SignInForm) => void
  rows: RowsRead
  issues: readonly FormIssue[]
  boundaries: Boundaries
  scope: SentenceScope
  /** Prefixes the sentence's ids (`tokenDomId`). */
  idPrefix: string
  /** Every version in play, left to right: the verdict. */
  columns: ColumnView[]
  /** The one line under the verdict (`whyLine`). */
  why: string
  /* What else applies to this person, from the troubleshooting model
     (sign-in-tests conflicts.ts) — the Sign-in tests canvas's own line,
     carried here by Open rule: "Maya Iyer is in Engineering and Finance —
     Engineering's rule applies first". A hover rings the rule it is about.
     Null with nothing to say. */
  also?: { text: string; tone: 'conflict' | 'depends' | 'info'; ruleId: string | null } | null
  /** The decision on screen, or null for Can't tell: what Save sign-in's Expected starts as. */
  shown: AccessDecision | null
  onReplay: () => void
  onClose: () => void
  /** Save sign-in's popover, held by the board so Saved sign-ins' empty state can open it. */
  saveOpen: boolean
  onSaveOpenChange: (open: boolean) => void
  // --- The tabs ---
  /** Policy testing's tabs, where the edition has them; without, the panel is the sign-in alone. */
  views: boolean
  tab: DockTab
  onTab: (t: DockTab) => void
  /** The Break-in test's view, or null where it does not run: no tab then. */
  breakIn: ReactNode | null
  /** The card a hovered row lands on: a rule id, the last row, or nothing. */
  onHighlight?: (target: string | 'fallback' | null) => void
  /** To the Sign-in tests page, on this tab's counterpart. */
  onOpenLibrary: (tab: 'saved' | 'people' | 'runs') => void
  // --- The column ---
  /** The heading, which takes focus on open and when the rule editor hands the column back. */
  headingRef: RefObject<HTMLHeadingElement | null>
  /** Took the rule editor's place in the same column: a fade, not the slide. */
  swap?: boolean
}

/* Memoised: the board hands it props that hold still while a run's marker
   travels (BoardBuilder), so a hop redraws the chain and not the panel. */
export const TestPanel = memo(function TestPanel(props: TestPanelProps) {
  const { draft, version, form, onPatch, onLoad, columns, why, also = null, shown, onReplay, onClose, saveOpen, onSaveOpenChange, views, tab, onTab, breakIn, onHighlight, onOpenLibrary, headingRef, swap } = props
  const { apps, policies, savedSignIns } = useBrand()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const uid = useId()
  const panelId = `${uid}-panel`

  const hasBreakIn = breakIn !== null
  const tabs = dockTabs({ breakIn: hasBreakIn })
  const shownTab = dockTabShown(tab, hasBreakIn)
  const mine = useMemo(() => policyApps(draft, apps), [draft, apps])

  /* This policy's saved sign-ins, judged by the board's version — only those,
     so the tenant's other sign-ins are never resolved for a tab that cannot
     show them. */
  const substitute = version?.substitute
  const appIds = draft.appIds
  const isSystem = draft.isSystem
  const saved = useMemo(() => {
    const mine = isSystem ? savedSignIns : savedSignIns.filter((s) => s.facts.appId !== undefined && appIds.includes(s.facts.appId))
    return savedOnPolicy(savedRows(mine, policies, env, substitute), { appIds, isSystem }, 'policy')
  }, [savedSignIns, policies, env, substitute, appIds, isSystem])

  /* Save sign-in hangs off the bookmark; closing it puts focus back there,
     which the span it hangs from cannot take. */
  const saveAnchor = useRef<HTMLSpanElement | null>(null)
  const closeSave = () => {
    onSaveOpenChange(false)
    saveAnchor.current?.querySelector<HTMLElement>('button')?.focus()
  }

  /* Keys typed in a search box never reach the board's window handler as
     single-letter shortcuts — the handler already stands down inside a field
     and inside `.bb__insp` — but a search with text in it clears on its first
     Escape rather than closing test mode, the way every search box behaves.
     The next Escape, in the box now empty, closes test mode (BoardBuilder). */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLInputElement
    if (e.key === 'Escape' && t.tagName === 'INPUT' && t.value) e.stopPropagation()
  }

  let body: ReactNode = null
  if (views) {
    if (shownTab === 'saved')
      body = (
        <DockSaved
          draft={draft}
          rows={saved}
          apps={mine}
          onLoad={onLoad}
          onHighlight={onHighlight}
          onSaveThis={() => onSaveOpenChange(true)}
          onManage={() => onOpenLibrary('saved')}
        />
      )
    else if (shownTab === 'people') body = <DockPeople draft={draft} apps={mine} form={form} version={version} onPatch={onPatch} />
    else if (shownTab === 'past') body = <DockPast draft={draft} apps={mine} version={version} onLoad={onLoad} onHighlight={onHighlight} />
    else body = breakIn
  }

  return (
    <aside className={`bb__insp tpanel${swap ? ' is-swap' : ''}`} aria-labelledby={`${uid}-title`} onKeyDown={onKeyDown}>
      <div className="bb__inspbar is-test">
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className="tpanel__title">
          Try a sign-in
        </h2>
        <span className="tpanel__acts">
          <IconButton icon={RotateCcw} label="Replay" size="sm" tone="ghost" onClick={onReplay} />
          <span ref={saveAnchor} className="tpanel__anchor">
            {/* It opens a panel, so it says so — "has a popup, expanded" — not a
                toggle's "pressed". The kit's icon button, drawn with those. */}
            <Tip text="Save sign-in">
              <button
                type="button"
                aria-label="Save sign-in"
                aria-haspopup="dialog"
                aria-expanded={saveOpen}
                className={`bx-iconbtn bx-iconbtn--sm bx-iconbtn--ghost${saveOpen ? ' is-on' : ''}`}
                onClick={() => onSaveOpenChange(!saveOpen)}
              >
                <BookmarkPlus size={14} strokeWidth={1.9} aria-hidden />
              </button>
            </Tip>
          </span>
          {/* The page holds the tests the edition may not have: only where it has them. */}
          {views && <IconButton icon={ArrowUpRight} label="Open Sign-in tests" size="sm" tone="ghost" onClick={() => onOpenLibrary(libraryTabOf(shownTab))} />}
          <span className="tpanel__rule" aria-hidden />
          <IconButton icon={X} label="Close Try a sign-in" size="sm" tone="ghost" onClick={onClose} />
        </span>
        <SaveSignInPopover anchor={saveAnchor} open={saveOpen} onClose={closeSave} form={form} shown={shown} />
      </div>

      <div className="tpanel__signin">
        <SignInSentence
          layout="panel"
          form={form}
          onPatch={onPatch}
          rows={props.rows}
          issues={props.issues}
          boundaries={props.boundaries}
          scope={props.scope}
          idPrefix={props.idPrefix}
        />
        <div className="tpanel__verdict">
          <SentenceVerdict columns={columns} layout="panel" />
          {why && (
            <p className="tpanel__why" title={why}>
              {why}
            </p>
          )}
          {also && (
            <p
              className={`tpanel__also is-${also.tone}`}
              title={also.text}
              onMouseEnter={also.ruleId && onHighlight ? () => onHighlight(also.ruleId) : undefined}
              onMouseLeave={also.ruleId && onHighlight ? () => onHighlight(null) : undefined}
            >
              {also.tone === 'info' ? <Info size={12} strokeWidth={2.2} aria-hidden /> : <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
              <span>{also.text}</span>
            </p>
          )}
        </div>
      </div>

      {views && (
        <>
          <Tabs className="bx-tabs--line tpanel__tabs" name="Tests" value={shownTab} options={tabs} onChange={onTab} panelId={panelId} />
          <motion.div
            key={shownTab}
            id={panelId}
            role="tabpanel"
            aria-label={DOCK_TAB_LABEL[shownTab]}
            className="tpanel__body"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14 }}
          >
            {body}
          </motion.div>
        </>
      )}
    </aside>
  )
})
