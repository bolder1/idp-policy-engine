import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'

import type { Policy } from '../../data'
import { useBrand } from '../../store'
import { BreakInView } from '../break-in-view'
import { useSimEnv } from '../sim-env'
import { boardVersion } from '../board/try-sign-in'
import type { TrySignIn } from '../board/use-try-sign-in'
import type { BoardTestPage, BoardViewsKept } from './board-views'
import { PersonView } from './PersonView'
import { SavedView } from './SavedView'
import { formOf } from './sign-in-form'
import './testing.css'

/* -----------------------------------------------------------------------------
   Policy testing, Version 3: the views inside the board's test panel.

   Try a sign-in is the panel's own first page (SignInPanel.tsx); this draws
   the other two tabs' pages in its place — Check a person, Saved sign-ins —
   and the Break-in test pushed over Saved sign-ins. They are the page's and
   the slider's views, drawn at the panel's 448 px, with three differences
   that come from being on a board:

     the sign-in   is the board's own for this policy, so the person checked
                   is the one being tried, and a row that goes to Try goes to
                   the board's Try
     the version   every answer is the right-hand column's — Your edits
                   whenever the board differs from live — so these views and
                   Try never disagree about the same sign-in, and the
                   Break-in test's caption names that version too
     Break-in      runs on the board's draft, with no policy to choose, and a
                   fix is an ordinary edit to the draft: on the undo stack,
                   said in a toast with Undo, not saved

   A rule named on the Break-in test opens on the chain, in the panel's
   column; its × comes back here, to the page it left. That swap unmounts
   these views, so what they would lose — the list's search and filters, the
   test's last run, pressed count and open row — the board keeps in `kept`.
   -------------------------------------------------------------------------- */

export function BoardTestViews({
  page,
  onPage,
  t,
  saved,
  draft,
  breakIn,
  kept,
  onApplyFix,
  onOpenRule,
  onToTry,
}: {
  /** Which page to draw; Try a sign-in is the panel's own. */
  page: Exclude<BoardTestPage, 'try'>
  onPage: (p: BoardTestPage) => void
  t: TrySignIn
  saved: Policy
  draft: Policy
  /** Whether the Break-in test is offered: the edition has it, and it runs on this policy. */
  breakIn: boolean
  kept: BoardViewsKept
  onApplyFix: (next: Policy, toast: string) => void
  /** A rule by id, or 'fallback' for the last row, opened on the board. */
  onOpenRule: (rule?: string) => void
  /* Back to Try a sign-in from inside a page — a row tried, a saved sign-in
     loaded, Edit sign-in. The control pressed goes with the page, so the host
     puts focus on the panel's heading as it switches. */
  onToTry: () => void
}) {
  const { zones } = useBrand()
  const version = useMemo(() => boardVersion(saved, draft), [saved, draft])

  return (
    <div className="tst is-panel">
      {page === 'person' ? (
        <PersonView
          panel={{ form: t.form, onPatch: t.patch, version, scope: saved.id }}
          onTry={(appId) => {
            t.patch({ appId }, 'app')
            onToTry()
          }}
          onEdit={onToTry}
        />
      ) : (
        <SavedView
          panel={{
            policy: draft,
            version,
            kept: kept.saved,
            breakIn: breakIn
              ? {
                  open: page === 'break-in',
                  onOpen: () => onPage('break-in'),
                  onClose: () => onPage('saved'),
                  page: (onBack) => (
                    <BoardBreakIn
                      draft={draft}
                      caption={`${draft.name} · ${version?.label ?? 'Live'}`}
                      kept={kept.breakIn}
                      onBack={onBack}
                      onApplyFix={onApplyFix}
                      onOpenRule={onOpenRule}
                    />
                  ),
                }
              : null,
          }}
          onTry={(s) => {
            t.load(formOf(s.facts, zones))
            onToTry()
          }}
          onEmpty={onToTry}
        />
      )}
    </div>
  )
}

/* The Break-in test, pushed over Saved sign-ins: Back names where it goes,
   and takes focus as the page arrives, as the page's and the slider's does. */
function BoardBreakIn({
  draft,
  caption,
  kept,
  onBack,
  onApplyFix,
  onOpenRule,
}: {
  draft: Policy
  /** The policy and its version, named as the right-hand column names it (spec D §3.6). */
  caption: string
  kept: BoardViewsKept['breakIn']
  onBack: () => void
  onApplyFix: (next: Policy, toast: string) => void
  onOpenRule: (rule?: string) => void
}) {
  const { policies } = useBrand()
  const env = useSimEnv()
  const back = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    back.current?.focus()
  }, [])
  return (
    <div className="tst__view">
      <button type="button" ref={back} className="tst__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Saved sign-ins
      </button>
      <BreakInView policy={draft} policies={policies} env={env} caption={caption} onApplyFix={onApplyFix} onOpenInBoard={onOpenRule} kept={kept} />
    </div>
  )
}
