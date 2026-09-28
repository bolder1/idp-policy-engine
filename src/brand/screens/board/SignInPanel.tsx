import { useId, useState, type ReactNode, type Ref } from 'react'
import { ArrowRight, BookmarkCheck, BookmarkPlus, LogIn, RotateCcw, StepBack, StepForward, UserSearch, X } from 'lucide-react'

import type { Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { DECISION_WORDS } from '../../decision-words'
import { IconButton, Tabs, TipDot } from '../../kit'
import { saveSignInPressed, tabOf, type BoardTestPage, type BoardTestTab } from '../testing/board-views'
import { SaveSignInForm } from '../testing/SaveSignInForm'
import { SignInFields } from '../testing/SignInFields'
import { WhatTheySee } from '../testing/WhatTheySee'
import { Section } from './Section'
import type { ChangeChip, ColumnView } from './try-sign-in'
import type { TrySignIn } from './use-try-sign-in'
import './try-sign-in.css'

/* -----------------------------------------------------------------------------
   Try a sign-in: the board's test-mode panel.

   The inspector's column, at a fixed 480 px, holding the sign-in being tried
   and what the tenant does with it. Top to bottom, in the order an admin reads
   a test: the sign-in (only the rows the rules on this application read), the
   versions side by side, what one different fact or one stricter edit would
   change, and the page the person would see. The chain to the left shows the
   same run as a route; this panel is where it is stated and summed up.

   The header's buttons act on the run: save it as a sign-in to keep checking,
   play it again, step the marker a stage back or on, close test mode. Save
   sign-in opens its form at the top of the body — inline, never a dialog, so
   the answer being saved stays in view while it is named.

   A rule opened from the chain swaps this panel for the rule's own editor in
   the same column; the editor's × comes back here, to the same run. That is
   why the status region is not in here: an edit made in the rule editor still
   moves the answer, and a region that unmounts with the panel would never say
   so. BoardBuilder keeps it, mounted for as long as the board is.

   In Version 3 of Policy testing the panel carries the tenant's views too
   (final spec, B V3): grey pill tabs under the heading — Try a sign-in, Check
   a person, Saved sign-ins — with the Break-in test pushed over Saved
   sign-ins. Which page is open is BoardBuilder's, so the rule editor's × comes
   back to the page it left; the page itself is drawn by BoardTestViews.
   -------------------------------------------------------------------------- */

const VIEWS: { value: BoardTestTab; label: string; icon: typeof LogIn }[] = [
  { value: 'try', label: 'Try a sign-in', icon: LogIn },
  { value: 'person', label: 'Check a person', icon: UserSearch },
  { value: 'saved', label: 'Saved sign-ins', icon: BookmarkCheck },
]

/** Version 3's views in the panel: which page is open, the way to another, and that page when it is not Try. */
export interface PanelViews {
  page: BoardTestPage
  onPage: (p: BoardTestPage) => void
  /** The open page's body, when it is not Try a sign-in. */
  body: ReactNode
}

export function SignInPanel({
  t,
  draft,
  headingRef,
  swap,
  onClose,
  onChip,
  views,
}: {
  t: TrySignIn
  draft: Policy
  /** The heading, focused when the panel opens and when the editor hands back. */
  headingRef: Ref<HTMLHeadingElement>
  /** Coming back from the rule editor: a fade, not the panel's slide. */
  swap: boolean
  onClose: () => void
  onChip: (chip: ChangeChip) => void
  /** Policy testing: the views as tabs, and the page open among them. */
  views?: PanelViews
}) {
  const headId = useId()
  const panelId = useId()
  const [saving, setSaving] = useState(false)
  const right = t.columns.at(-1)
  const shown = t.right.resolution.status === 'decided' ? t.right.resolution.decision : null
  const onTry = !views || views.page === 'try'
  const tab = views ? tabOf(views.page) : 'try'
  /* Save sign-in saves the sign-in Try holds, so it opens Try with its form
     at the top from whichever page it is pressed on. */
  const toggleSave = () => {
    const next = saveSignInPressed(views?.page ?? 'try', saving)
    if (views && next.page !== views.page) views.onPage(next.page)
    setSaving(next.saving)
  }

  return (
    <aside className={`bb__insp is-test${swap ? ' is-swap' : ''}`} aria-labelledby={headId}>
      <div className="bb__inspbar is-test">
        <h2 id={headId} ref={headingRef} tabIndex={-1} className="bb__thead">
          Try a sign-in
        </h2>
        <IconButton icon={BookmarkPlus} size="sm" tone="ghost" label="Save sign-in" pressed={saving && onTry} onClick={toggleSave} />
        <IconButton icon={RotateCcw} size="sm" tone="ghost" label="Replay" onClick={t.replay} />
        <IconButton icon={StepBack} size="sm" tone="ghost" label="Back one stage" disabled={!t.canBack} onClick={t.back} />
        <IconButton icon={StepForward} size="sm" tone="ghost" label="Next stage" disabled={!t.canNext} onClick={t.next} />
        <span className="bb__inspbar__sep" aria-hidden />
        <IconButton icon={X} size="sm" tone="ghost" label="Close Try a sign-in" onClick={onClose} />
      </div>

      {views && (
        <div className="bb__tviews">
          <Tabs name="Board test" value={tab} options={VIEWS} onChange={(v) => views.onPage(v)} panelId={panelId} className="bb__tviews__tabs" />
        </div>
      )}

      {/* One body for every page, keyed by its tab so each opens at its top.
          With the views it is the tabs' panel. */}
      <div key={tab} className="bb__tbody" {...(views ? { id: panelId, role: 'tabpanel', 'aria-label': VIEWS.find((v) => v.value === tab)?.label } : null)}>
        {views && !onTry ? (
          views.body
        ) : (
          <>
            {saving && <SaveSignInForm form={t.form} shown={shown} emphasis="quiet" onClose={() => setSaving(false)} />}

            <SignInFields
              form={t.form}
              onPatch={t.patch}
              rows={t.rows}
              issues={t.issues}
              boundaries={t.boundaries}
              audience={draft.audience}
              idPrefix="bb-try"
            />

            <div className={`bb__tcols${t.columns.length === 1 ? ' is-one' : ''}`}>
              {t.columns.map((c) => (
                <Column key={c.id} view={c} />
              ))}
            </div>

            {t.chips.length > 0 && (
              <Section title="Would change if">
                <Chips title="Sign-in" chips={t.chips.filter((c) => c.kind === 'sign-in')} onChip={onChip} />
                <Chips title="Policy" chips={t.chips.filter((c) => c.kind === 'policy')} onChip={onChip} />
              </Section>
            )}

            {/* Held back while the marker travels and brought up just after it
                lands; no cross-fade while a slider is held (Spec A §6). */}
            {right && (
              <WhatTheySee
                key={draft.id}
                screens={t.screens}
                appId={t.form.appId}
                title={`What they see · ${right.label}`}
                defaultOpen
                hidden={t.reached !== null}
                fade={t.fade}
              />
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/* One version: its name and why it is there, the policy that decides, the
   rule, and the decision — or grey words where there is none to give. */
function Column({ view }: { view: ColumnView }) {
  return (
    <div className="bb__tcol">
      <span className="bb__tcol__label">
        {view.label}
        <TipDot text={view.tip} label={`About ${view.label.toLowerCase()}`} />
      </span>
      {view.policyName && (
        <span className="bb__tcol__policy" title={view.policyName}>
          {view.policyName}
        </span>
      )}
      {view.line && (
        <span className="bb__tcol__line" title={view.line}>
          {view.line}
        </span>
      )}
      <span className="bb__tcol__decision">
        {view.status === 'decided' && view.decision ? (
          <DecisionBadge decision={view.decision} />
        ) : view.status === 'depends' ? (
          <span className="bx-canttell is-stacked">
            <span className="bx-canttell__word">Depends</span>
            <span className="bx-canttell__or">{[...new Set(view.possible)].map((d) => DECISION_WORDS[d]).join(' or ')}</span>
          </span>
        ) : (
          <CantTell />
        )}
      </span>
    </div>
  )
}

/* A group of chips, each "{change} → {decision}". A sign-in chip restates the
   sign-in; a policy chip edits the board, and says so before it is pressed. */
function Chips({ title, chips, onChip }: { title: string; chips: ChangeChip[]; onChip: (c: ChangeChip) => void }) {
  if (chips.length === 0) return null
  return (
    <div className="bb__tchips" role="group" aria-label={title}>
      <span className="bb__tchips__label">{title}</span>
      <span className="bb__tchips__list">
        {chips.map((c) => (
          <span key={c.text} className="bx-chip is-clickable">
            <button type="button" className="bx-chip__main" title={c.kind === 'policy' ? 'Edits the board; not saved' : undefined} onClick={() => onChip(c)}>
              {c.text}
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
              <span className="u-sr-only">, </span>
              {DECISION_WORDS[c.decision]}
            </button>
          </span>
        ))}
      </span>
    </div>
  )
}
