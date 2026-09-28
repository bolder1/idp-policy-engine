import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppWindow, BookmarkCheck, ListFilter, Lock, LogIn, ShieldAlert, Trash2 } from 'lucide-react'

import type { AccessDecision, Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { EmptyState, NoMatches } from '../../empty'
import { Badge, Button, Chip, RowMenu, SearchBox, TipDot } from '../../kit'
import { Picker } from '../../picker'
import { LEVEL_LABEL, LEVEL_META, LEVEL_PICKER_ORDER, type SavedSignIn, type SignInLevel } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { ConfirmDelete } from '../confirm-delete'
import { useSimEnv } from '../sim-env'
import { BreakInPage } from './BreakInPage'
import { SAVED_SHOW, savedOnPolicy, savedTip, type SavedShow } from './board-views'
import { VersionWord } from './PersonView'
import { LEVEL_FILTER, answerSaid, assumedPolicy, breakInStart, filterSaved, savedRows, type LevelFilter, type SavedRow } from './selectors'
import { useTestingSession } from './session-state'
import { formOf, formSummary } from './sign-in-form'
import '../builder-test.css'
import './testing.css'

/* -----------------------------------------------------------------------------
   Saved sign-ins: every sign-in the tenant has promised an answer for, run
   against the tenant as it stands.

   Failures first, then the ones that can't be told, then the passes — and
   within each the strongest promise first — so the row that needs looking at
   is the top one. A row moves when its result does (200 ms, instant under
   reduced motion), which is how a failure that a turned-off policy caused is
   seen arriving at the top.

   Pass only when the tenant decides the sign-in and decides what was expected.
   A sign-in that can't be told is grey "Can't tell", never a pass.

   With Assume on set in Try, every row is judged on the answer with that
   policy on — the question Check a person is answering too — and the chip
   says so; a row whose answer differs from today says what decides today.

   Level and Expected are edited in the row and saved at once. Every level can
   be edited and deleted here (final spec, Assumption 6); a Protected one asks
   for the typed DELETE first. A delete is permanent, as every delete the
   confirmation asks about is (owner, 21 Sep 2026), so its toast offers no
   Undo — one that did would contradict the dialog just confirmed.

   The Break-in test lives here too, where the edition has it: a button at the
   end of the bar pushes it as a page over this view (BreakInPage.tsx), and
   its Back comes here, to the button. Which policy it runs on and whether it
   is open are the session's, so the Policies list can open it for a policy.

   In the board's test panel (Version 3) the rows are judged by the version
   the panel's right-hand column shows, and open on the sign-ins to the open
   policy's applications, with all of them a choice away. The panel is 448 px
   wide, so the table keeps the name, Expected and the result, and the level,
   what came back and who decided it move into the name's tooltip. The
   Break-in test runs on the board's draft there, and the panel keeps whether
   it is open and the list's search and filters, so a rule opened from it
   comes back to both as they were.
   -------------------------------------------------------------------------- */

const DECISIONS: AccessDecision[] = ['1fa', '2fa', 'deny']

/** The Break-in test as this view pushes it: whether it is open, the way in and out, and the page. */
export interface SavedBreakIn {
  open: boolean
  onOpen: () => void
  onClose: () => void
  page: (onBack: () => void) => ReactNode
}

/** The board's test panel: the open policy, the version it judges by, and its own Break-in test. */
export interface SavedPanel {
  policy: Pick<Policy, 'id' | 'appIds' | 'isSystem'>
  /** The right-hand column's version (`boardVersion`); null for the tenant as it stands. */
  version: { substitute: Policy; label: string; tip: string } | null
  /** Null where the edition has no Break-in test, or it does not run on this policy. */
  breakIn: SavedBreakIn | null
  /** What the list keeps while a rule opened from the panel takes its column. */
  kept?: { current: SavedKept | null }
}

/* The search and the filters, kept by the board for the life of its test
   mode: a rule opened from the Break-in test takes the panel's column, and
   Back from the test, after the rule's ×, finds the list as it was left. */
export interface SavedKept {
  policyId: string
  query: string
  level: LevelFilter
  show: SavedShow
}

export function SavedView({ onTry, onEmpty, panel }: { onTry: (s: SavedSignIn) => void; onEmpty: () => void; panel?: SavedPanel }) {
  const { policies, savedSignIns, zones, features, updateSavedSignIn, removeSavedSignIn, showToast } = useBrand()
  const session = useTestingSession()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  /* In the board's panel the list starts where it was left, on this policy. */
  const holder = panel?.kept
  const policyId = panel?.policy.id
  const [query, setQuery] = useState(() => keptOn(holder, policyId)?.query ?? '')
  const [level, setLevel] = useState<LevelFilter>(() => keptOn(holder, policyId)?.level ?? 'all')
  const [show, setShow] = useState<SavedShow>(() => keptOn(holder, policyId)?.show ?? 'policy')
  useEffect(() => {
    if (holder && policyId) holder.current = { policyId, query, level, show }
  }, [holder, policyId, query, level, show])
  /* Kept while the confirmation animates out, so it does not go blank as it closes. */
  const [deleting, setDeleting] = useState<SavedSignIn | null>(null)
  const [confirming, setConfirming] = useState(false)
  const askDelete = (s: SavedSignIn) => {
    setDeleting(s)
    setConfirming(true)
  }

  /* Break-in test: opened on the policy Try's sign-in points at — or, in the
     board's panel, on the board's draft — and Back puts focus back on the
     button that opened it. */
  const breakIn: SavedBreakIn | null = panel
    ? panel.breakIn
    : features.breakInTest
      ? {
          open: session.breakIn.open,
          onOpen: () => session.openBreakIn(session.breakIn.policyId ?? breakInStart(policies, session.form, env, zones)),
          onClose: session.closeBreakIn,
          page: (onBack) => <BreakInPage onBack={onBack} />,
        }
      : null
  const breakInOpen = breakIn?.open === true
  const breakInButton = useRef<HTMLSpanElement | null>(null)
  const [backFromBreakIn, setBackFromBreakIn] = useState(false)
  useEffect(() => {
    if (!backFromBreakIn || breakInOpen) return
    breakInButton.current?.querySelector('button')?.focus()
    setBackFromBreakIn(false)
  }, [backFromBreakIn, breakInOpen])
  const breakInAction = breakIn ? (
    <span ref={breakInButton} className="tst__barend">
      <Button variant="secondary" icon={ShieldAlert} onClick={breakIn.onOpen}>
        Break-in test
      </Button>
    </span>
  ) : null

  const inPanel = panel !== undefined
  const version = panel?.version ?? null
  const onPolicy = panel?.policy
  const substitute = useMemo(() => (inPanel ? version?.substitute : assumedPolicy(policies, session.form)), [inPanel, version, policies, session.form])
  const all = useMemo(() => savedRows(savedSignIns, policies, env, substitute), [savedSignIns, policies, env, substitute])
  const mine = useMemo(() => (onPolicy ? savedOnPolicy(all, onPolicy, show) : all), [all, onPolicy, show])
  const rows = useMemo(() => filterSaved(mine, query, level), [mine, query, level])
  const levels = useMemo(() => LEVEL_PICKER_ORDER.map((l) => ({ value: l, label: LEVEL_LABEL[l], meta: LEVEL_META[l] })), [])
  const expected = useMemo(() => DECISIONS.map((d) => ({ value: d, label: DECISION_WORDS[d] })), [])

  const summaryOf = (s: SavedSignIn) => formSummary(formOf(s.facts, zones), zones)

  const change = (s: SavedSignIn, patch: Partial<Omit<SavedSignIn, 'id'>>) => {
    updateSavedSignIn(s.id, patch)
    showToast('Saved')
  }

  const remove = (s: SavedSignIn) => {
    removeSavedSignIn(s.id)
    setConfirming(false)
    showToast(`${s.name} deleted`)
  }

  if (breakIn && breakInOpen) {
    return breakIn.page(() => {
      breakIn.onClose()
      setBackFromBreakIn(true)
    })
  }

  if (savedSignIns.length === 0) {
    return (
      <div className="tst__view">
        <EmptyState
          icon={BookmarkCheck}
          title="No saved sign-ins"
          action={
            <>
              <Button variant="secondary" icon={LogIn} onClick={onEmpty}>
                Try a sign-in
              </Button>
              {breakInAction}
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="tst__view">
      <div className="tst__bar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search saved sign-ins…" label="Search saved sign-ins" />
        <span className={`btoolbar__filter bbar__filter ${level !== 'all' ? 'is-set' : ''}`}>
          <Picker label="Filter by level" size="md" icon={ListFilter} prefix="Level" value={level} options={LEVEL_FILTER} onChange={(v) => setLevel(v as LevelFilter)} />
        </span>
        {inPanel && (
          <span className="btoolbar__filter bbar__filter">
            <Picker label="Show saved sign-ins" size="md" icon={AppWindow} prefix="Show" value={show} options={SAVED_SHOW} onChange={(v) => setShow(v as SavedShow)} />
          </span>
        )}
        {!inPanel && substitute && (
          <Chip active removable onRemove={() => session.patch({ assumeOn: null }, 'assume-on')}>
            Assuming {substitute.name} on
          </Chip>
        )}
        {version && <VersionWord version={version} />}
        {breakInAction}
      </div>

      {inPanel && show === 'policy' && mine.length === 0 ? (
        /* Nothing on this policy's applications: the list is empty before
           any filter is set, so it says so, with the rest a press away. */
        <EmptyState
          compact
          icon={BookmarkCheck}
          title="No saved sign-ins for this policy’s apps"
          action={
            <Button variant="secondary" size="sm" onClick={() => setShow('all')}>
              Show all
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <NoMatches
          noun="saved sign-ins"
          query={query}
          filtered={level !== 'all' || (inPanel && show !== 'all')}
          compact
          onClear={() => {
            setQuery('')
            setLevel('all')
            setShow('all')
          }}
        />
      ) : (
        <div className="bdl__scroll tst__table">
          <table className="bdl__table">
            <caption className="u-sr-only">Saved sign-ins</caption>
            <colgroup>
              <col className="tst__c-signin" />
              {!inPanel && <col className="tst__c-level" />}
              <col className="tst__c-expected" />
              {!inPanel && <col className="tst__c-actual" />}
              <col className="tst__c-result" />
              {!inPanel && <col className="tst__c-by" />}
              <col className="tst__c-menu" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Sign-in</th>
                {!inPanel && <th scope="col">Level</th>}
                <th scope="col">Expected</th>
                {!inPanel && <th scope="col">Actual</th>}
                <th scope="col">Result</th>
                {!inPanel && <th scope="col">Decided by</th>}
                <th scope="col">
                  <span className="u-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <motion.tr key={r.saved.id} layout="position" transition={{ duration: reduced ? 0 : 0.2 }}>
                  <td>
                    <span className="tst__name">
                      <span className="tst__clip" title={r.saved.name}>
                        {r.saved.name}
                      </span>
                      <TipDot text={inPanel ? savedTip(r, summaryOf(r.saved)) : summaryOf(r.saved)} label={`About ${r.saved.name}`} />
                    </span>
                  </td>
                  {!inPanel && (
                    <td>
                      <Picker
                        label={`Level of ${r.saved.name}`}
                        value={r.saved.level}
                        icon={r.saved.level === 'protected' ? Lock : undefined}
                        options={levels}
                        onChange={(v) => change(r.saved, { level: v as SignInLevel })}
                        width="fill"
                      />
                    </td>
                  )}
                  <td>
                    <Picker
                      label={`Expected for ${r.saved.name}`}
                      value={r.saved.expected}
                      options={expected}
                      onChange={(v) => change(r.saved, { expected: v as AccessDecision })}
                      width="fill"
                    />
                  </td>
                  {!inPanel && (
                    <td>
                      <span className="tst__cell">
                        {r.res.status === 'decided' && r.res.decision ? <DecisionBadge decision={r.res.decision} /> : <CantTell />}
                        {r.today && <span className="tst__sub">Today: {answerSaid(r.today)}</span>}
                      </span>
                    </td>
                  )}
                  <td>
                    <Result row={r} />
                  </td>
                  {!inPanel && (
                    <td className="tst__muted">
                      <span className="tst__clip" title={r.res.decidedBy?.policyName}>
                        {r.res.decidedBy?.policyName ?? ''}
                      </span>
                    </td>
                  )}
                  <td>
                    <RowMenu
                      label={`Actions for ${r.saved.name}`}
                      items={[
                        { id: 'try', label: 'Try', icon: LogIn },
                        { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
                      ]}
                      onSelect={(id) => (id === 'try' ? onTry(r.saved) : askDelete(r.saved))}
                    />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDelete
        open={confirming}
        name={deleting?.name ?? ''}
        noun="saved sign-in"
        requireTyped={deleting?.level === 'protected'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  )
}

const keptOn = (holder: { current: SavedKept | null } | undefined, policyId: string | undefined): SavedKept | null =>
  holder?.current && holder.current.policyId === policyId ? holder.current : null

/* Pass, Fail, or grey Can't tell — never a pass for a sign-in that can't be told. */
function Result({ row }: { row: SavedRow }) {
  if (row.result === 'pass') return <Badge tone="positive">Pass</Badge>
  if (row.result === 'fail') return <Badge tone="negative">Fail</Badge>
  return <span className="tst__cant-text">{CANT_TELL}</span>
}
