import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, BookmarkCheck, BookmarkPlus, Check, LogIn, Play, Trash2, X } from 'lucide-react'

import type { App, Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { EmptyState, NoMatches } from '../../empty'
import { Button, RowMenu, SearchBox, Tip } from '../../kit'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { ConfirmDelete } from '../confirm-delete'
import type { TenantResolution } from '../tenant-resolver'
import { savedTip } from './board-views'
import { answerSaid, filterSaved, type SavedRow } from './selectors'
import { formOf, formSummary, type SignInForm } from './sign-in-form'
import { landingRuleOf, lastRunSummary, runFlash, runSnapshot, savedEmptyTitle, signInWords } from './test-dock'

/* -----------------------------------------------------------------------------
   The test panel's Saved sign-ins: the promises made about THIS policy's
   applications, judged by the version on the board (V4 §2.4-bis).

   Two lines a sign-in, at the panel's width. The first is what is read in a
   scan: its name — whole, on two lines when it needs them — what it gets now
   as a badge, every badge in one column at the row's right, and whether that
   is a pass (a green tick, a red cross, nothing for Can't tell, which is
   never a pass); the row menu sits on that line too. The second is the
   sign-in itself in grey — who, from where, on what, and the application only
   when the policy has more than one. Only a failing row has a third: what it
   expected, on a line of its own, so it never pushes the sign-in's own words
   off the end of theirs. The row is the way into the sentence above — a click
   loads it and replays — and hovering it lights the card on the board it
   lands on, so the list and the canvas are read as one thing.

   Run all is the explicit re-judge. The rows are live — an edit on the board
   re-judges them already — so what Run all adds is the telling: the rows
   re-settle one after another (30 ms apart), and every row the edits decide
   differently from today, or that moved since the last run, flashes an accent
   edge. The status region says the same in words.

   Delete keeps the library rules (ConfirmDelete, the typed DELETE for a
   Protected one): a saved sign-in is tenant data, and this list is only the
   part of it on this policy — "Manage in Sign-in tests" is the rest.
   -------------------------------------------------------------------------- */

export function DockSaved({
  draft,
  rows,
  apps,
  onLoad,
  onHighlight,
  onSaveThis,
  onManage,
}: {
  draft: Pick<Policy, 'id' | 'isSystem'>
  /** This policy's saved sign-ins, judged by the version (`savedOnPolicy`, `savedRows`). */
  rows: SavedRow[]
  /** This policy's applications (`policyApps`): the empty title, and whether a row names its application. */
  apps: readonly Pick<App, 'id' | 'name'>[]
  onLoad: (form: SignInForm) => void
  onHighlight?: (target: string | 'fallback' | null) => void
  onSaveThis: () => void
  onManage: () => void
}) {
  const { zones, users, apps: catalogue, removeSavedSignIn, showToast } = useBrand()
  const reduced = useReducedMotion() === true
  const [query, setQuery] = useState('')
  const shown = useMemo(() => filterSaved(rows, query, 'all'), [rows, query])

  /* The last run: what each row said then, and which rows it flashed. */
  const last = useRef<Map<string, string> | null>(null)
  const [run, setRun] = useState(0)
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set())
  const [said, setSaid] = useState('')
  const runAll = () => {
    const moved = runFlash(last.current, rows)
    last.current = runSnapshot(rows)
    setFlash(moved)
    setRun((n) => n + 1)
    setSaid(`Ran ${rows.length} saved sign-in${rows.length === 1 ? '' : 's'}. ${lastRunSummary(rows)?.text ?? 'Nothing changed'}.`)
  }

  const [deleting, setDeleting] = useState<SavedSignIn | null>(null)
  const [confirming, setConfirming] = useState(false)
  const remove = (s: SavedSignIn) => {
    removeSavedSignIn(s.id)
    setConfirming(false)
    showToast(`${s.name} deleted`)
  }

  const load = (s: SavedSignIn) => onLoad(formOf(s.facts, zones))
  const light = (r: SavedRow | null) => onHighlight?.(r ? landingRuleOf(r.res, draft.id) : null)
  /* The ring goes with the pointer, and with anything that takes the row from
     under it: the row menu (portalled, so the row never hears the pointer
     leave), a delete, the tab closing. */
  useEffect(() => () => onHighlight?.(null), [onHighlight])
  /* A policy on one application needs it named on no row. */
  const ctx = { people: users, apps: catalogue, zones }
  const withApp = draft.isSystem === true || apps.length > 1

  if (rows.length === 0) {
    /* A draft with no application has nothing to save a sign-in against yet. */
    const canSave = draft.isSystem || apps.length > 0
    return (
      <div className="tpanel-view">
        <EmptyState
          compact
          icon={BookmarkCheck}
          title={savedEmptyTitle(draft, apps)}
          action={
            canSave ? (
              <Button variant="secondary" size="sm" icon={BookmarkPlus} onClick={onSaveThis}>
                Save this sign-in
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="tpanel-view">
      <div className="tpanel-tools">
        <SearchBox value={query} onChange={setQuery} placeholder="Search saved sign-ins…" label="Search saved sign-ins" block />
        <Button variant="secondary" size="sm" icon={Play} onClick={runAll}>
          Run all
        </Button>
      </div>
      <span className="u-sr-only" role="status">
        {said}
      </span>

      <div className="tpanel-scroll">
        {shown.length === 0 ? (
          <NoMatches noun="saved sign-ins" query={query} compact onClear={() => setQuery('')} />
        ) : (
          <ul className="tpanel-list" aria-label="Saved sign-ins on this policy" onPointerLeave={() => light(null)}>
            {shown.map((r, i) => {
              const form = formOf(r.saved.facts, zones)
              const words = `${r.saved.name}: expected ${DECISION_WORDS[r.saved.expected]}, now ${answerSaid(r.res)}, ${RESULT_WORD[r.result]}`
              const sub = signInWords(form, ctx, withApp)
              const expected = r.result === 'fail' ? `Expected ${DECISION_WORDS[r.saved.expected]}` : null
              return (
                <motion.li
                  key={r.saved.id}
                  layout="position"
                  transition={{ duration: reduced ? 0 : 0.2 }}
                  className="tpanel-row"
                  onClick={() => load(r.saved)}
                  onMouseEnter={() => light(r)}
                  onMouseLeave={() => light(null)}
                >
                  {/* Remounted by each run, so the edge plays again: a plain
                      element, never the motion row, carries the animation. */}
                  {flash.has(r.saved.id) && !reduced && <span key={`flash-${run}`} className="tpanel-row__flash" aria-hidden />}
                  <motion.div
                    key={`row-${run}`}
                    className="tpanel-saved"
                    initial={run === 0 || reduced ? false : { opacity: 0.25 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.18, delay: reduced ? 0 : i * 0.03 }}
                  >
                    <button
                      type="button"
                      className="tpanel-rowbtn tpanel-name"
                      aria-label={`${words}. Try this sign-in`}
                      onClick={(e) => {
                        e.stopPropagation()
                        load(r.saved)
                      }}
                      onFocus={() => light(r)}
                      onBlur={() => light(null)}
                    >
                      <span className="tpanel-name__text">{r.saved.name}</span>
                    </button>
                    <span className="tpanel-end">
                      <Tip text={savedTip(r, formSummary(form, zones))}>
                        <Answer res={r.res} />
                      </Tip>
                    </span>
                    <Result row={r} />
                    <span className="tpanel-menu" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        label={`Actions for ${r.saved.name}`}
                        items={[
                          { id: 'try', label: 'Try', icon: LogIn },
                          { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
                        ]}
                        onSelect={(id) => {
                          light(null)
                          if (id === 'try') load(r.saved)
                          else {
                            setDeleting(r.saved)
                            setConfirming(true)
                          }
                        }}
                      />
                    </span>
                    <span className="tpanel-sub tpanel-clip tpanel-saved__sub" title={sub}>
                      {sub}
                    </span>
                    {expected && <span className="tpanel-sub tpanel-expected">{expected}</span>}
                  </motion.div>
                </motion.li>
              )
            })}
          </ul>
        )}
        <div className="tpanel-foot">
          <Button variant="link" size="sm" iconRight={ArrowUpRight} onClick={onManage}>
            Manage in Sign-in tests
          </Button>
        </div>
      </div>

      <ConfirmDelete
        open={confirming}
        name={deleting?.name ?? ''}
        noun="saved sign-in"
        requireTyped={deleting?.level === 'protected'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          light(null)
          if (deleting) remove(deleting)
        }}
      />
    </div>
  )
}

const RESULT_WORD: Record<SavedRow['result'], string> = { pass: 'Pass', fail: 'Fail', unknown: CANT_TELL }

/* Pass or fail as a small glyph beside the Now badge — the badge is the
   answer, the glyph only whether it was the one expected. A sign-in that
   can't be told gets no glyph: it is never a pass, and a grey mark would be a
   third result to learn. Every row keeps the slot, so the badges line up. */
function Result({ row }: { row: SavedRow }) {
  if (row.result === 'unknown') return <span className="tpanel-result" aria-hidden />
  const pass = row.result === 'pass'
  const Icon = pass ? Check : X
  return (
    <Tip text={pass ? 'Pass' : 'Fail'}>
      <span className={`tpanel-result is-${row.result}`}>
        <Icon size={14} strokeWidth={2.4} aria-hidden />
        <span className="u-sr-only">{pass ? 'Pass' : 'Fail'}</span>
      </span>
    </Tip>
  )
}

/** A resolution's answer: its decision as a badge, or grey Can't tell. Shared by the panel's tabs. */
export function Answer({ res }: { res: Pick<TenantResolution, 'status' | 'decision'> }) {
  return res.status === 'decided' && res.decision ? <DecisionBadge decision={res.decision} /> : <CantTell />
}
