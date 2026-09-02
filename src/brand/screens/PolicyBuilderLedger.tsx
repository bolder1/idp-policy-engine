import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Play, Plus, Redo2, Undo2, X } from 'lucide-react'

import { Button, IconButton, MenuButton, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { blankRule, type AccessDecision, type Policy, type Rule } from '../data'
import { useBrand, useNameLookup } from '../store'
import { AudienceDrawer } from './audience-drawer'
import { AssignAppsDialog, CopyRuleDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import { describeChanges } from './changes'
import { diagnose, shadowedBy } from './diagnostics'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from './history'
import { LedgerRow, TerminalRow } from './ledger-row'
import { bulkPatch, moveRule, traceOf } from './ledger-model'
import { LedgerSheet } from './ledger-sheet'
import { ReviewStep } from './review-step'
import { DEFAULT_PREVIEW, previewContext, type PreviewState } from './rule-form'
import { DEVICE_OPTIONS, PLACES, RISKS, SIM_USERS, type SimEnv } from './simulate'
import { sweep } from './impact-arena'

import './ledger.css'

/* -----------------------------------------------------------------------------
   v3 — the Ledger. The whole policy as one grid.

   The other two builders are single-focus machines: an accordion has exactly
   one open row, and a bench loads exactly one rule into its pane. That is the
   right shape for writing a rule and the wrong shape for four of the five
   things this product is still bad at, because those four are RELATIONS —
   compare two rules, render a finding about a pair of them, edit several at
   once, and move one a long way up an ordered list. A relation cannot be drawn
   in a layout that can only ever show one of its ends.

   So: seven columns, one per part of a rule's grammar, read down rather than
   across. Rows are 64px and stay 64px — selected, focused, traced, at every
   breakpoint. Nothing expands. Reading a truncated predicate is a hover;
   writing one opens a sheet capped so it can never cover the first three
   columns, which is the one thing a full-height detail pane cannot promise.

   And the trace is a MODE of this grid rather than a dialog beside it. There is
   nowhere for the list and the simulation to disagree, which is the failure
   `simulate.ts`'s own header comment exists to prevent.
   -------------------------------------------------------------------------- */

export function PolicyBuilderLedger({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const resolve = useNameLookup()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selected, setSelected] = useState<string | null>(null)
  const [multi, setMulti] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<string | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [stage, setStage] = useState<'rules' | 'review'>('rules')
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [catalogue, setCatalogue] = useState<string | null>(null)
  const [pv, setPv] = useState<PreviewState>(DEFAULT_PREVIEW)
  const [tracing, setTracing] = useState(false)
  const [live, setLive] = useState('')
  const [dialog, setDialog] = useState<null | 'log' | 'test' | 'apps' | 'template' | 'review' | 'copy'>(open ? null : null)

  const grid = useRef<HTMLDivElement | null>(null)
  const features = store.features

  useEffect(() => {
    if (saved) setHist(historyOf(saved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = historyKey(e)
      if (action) {
        e.preventDefault()
        setHist(action === 'redo' ? redo : undo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
    }),
    [store],
  )

  const ctx = useMemo(() => previewContext(pv), [pv])
  const draft = hist.present

  /* Both memos live above the early return.

     They used to sit beside the code that uses them, which put two `useMemo`
     calls after `if (!saved) return` — so the render that discovers the policy
     is gone calls fewer hooks than the one before it, and React tears the
     component down mid-update. `sweep` is the expensive one and it is guarded
     on the draft having rules, so hoisting costs nothing. */
  const swept = useMemo(() => sweep(draft, env, 570), [draft, env])
  const trace = useMemo(
    () => (tracing && draft.id ? traceOf(draft, ctx, env) : null),
    [tracing, draft, ctx, env],
  )

  if (!saved || !draft.id) {
    return (
      <div className="bpage bf3__page">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const changes = dirty ? describeChanges(saved, draft, store.groups, store.users) : []
  const diagnostics = diagnose(draft, store.groups, store.hooks, store.users)
  const blockers = diagnostics.filter(
    (d) => d.severity === 'error' && (d.scope === 'policy' || rules[d.ruleIndex]?.enabled !== false),
  ).length

  const patch = (p: Partial<Policy>) => setHist((h) => commit(h, { ...h.present, ...p }))
  const patchRule = (id: string, p: Partial<Rule>) =>
    patch({ rules: rules.map((r) => (r.id === id ? { ...r, ...p } : r)) })

  /* REACH is swept, not estimated. `matchEstimate` is seed data that never
     recomputes; this is how many of the modelled situations each rule actually
     wins, first-match and all — so a rule at zero is a dead rule and the column
     says so before the linter opens its mouth. */
  const peak = Math.max(1, ...swept.reach, swept.fellThrough)

  const selIndex = selected === null ? -1 : rules.findIndex((r) => r.id === selected)
  const shadowed = selIndex === -1 ? [] : shadowedBy(draft, selIndex)

  const move = (from: number, to: number) => {
    const next = moveRule(rules, from, to)
    if (next === rules) return
    patch({ rules: next })
    setLive(`${rules[from].name} moved to position ${to + 1}. Evaluation order changed.`)
  }

  const addRule = (at = rules.length) => {
    const r = blankRule(`Rule ${rules.length + 1}`)
    patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
    setSelected(r.id)
    setSheet(r.id)
    setLive(`Rule added at position ${at + 1}`)
  }

  const pick = (id: string, additive: boolean) => {
    if (!additive) {
      setSelected(id)
      setMulti(new Set())
      return
    }
    /* The first modifier-click has to carry the row that was already selected
       into the set, or "select this one, then ⌘-click that one" produces a
       selection of one and the bulk bar never appears. */
    setMulti((m) => {
      const next = new Set(m)
      if (next.size === 0 && selected) next.add(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSelected(id)
  }

  /* Reorder from the keyboard, and the reason it matters: dragging was the only
     way to set evaluation order, which is a WCAG 2.5.7 failure — an admin who
     cannot use a pointer could not set the one property that decides which rule
     wins. Alt is used rather than plain arrows so the arrows stay free to move
     between rows. */
  const onGridKey = (e: React.KeyboardEvent) => {
    if (selIndex === -1) return
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      move(selIndex, selIndex + (e.key === 'ArrowUp' ? -1 : 1))
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = rules[selIndex + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        setSelected(next.id)
        if (e.shiftKey) setMulti((m) => new Set([...m, rules[selIndex].id, next.id]))
        else setMulti(new Set())
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      setSheet(selected)
    }
    if (e.key === 'Escape') {
      setMulti(new Set())
      setPinned(null)
    }
  }

  const policyItems: MenuItem[] = [
    { id: 'log', label: 'Decision log' },
    { id: 'apps', label: `Assign apps (${draft.allApps ? 'all' : draft.appIds.length})` },
    { id: 'template', label: 'Save as template' },
    ...(features.reviewStep ? [] : [{ id: 'review', label: 'Review & Save', divide: true }]),
  ]

  const openRule = rules.find((r) => r.id === sheet)

  return (
    <div className="bpage bf3__page">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* The masthead used to carry the name, the audience and the
          applications. All three moved to the policy bar above every builder —
          what is left here is the work: undo, the policy menu, and the way out
          to review. */}
      <header className="bf3__masthead">
        <div className="bf3__mastrow">
          <span className="bf3__semantics">
            Rules are evaluated top to bottom. The first one that matches decides the sign-in.
          </span>
          <div className="bf3__mastacts">
            <IconButton icon={Undo2} label="Undo" size="sm" tone="ghost" disabled={!canUndo(hist)} onClick={() => setHist(undo)} />
            <IconButton icon={Redo2} label="Redo" size="sm" tone="ghost" disabled={!canRedo(hist)} onClick={() => setHist(redo)} />
            <MenuButton label="Policy" items={policyItems} size="sm" onSelect={(id) => setDialog(id as typeof dialog)} />
            {features.publish && stage === 'rules' && (
              <Button variant="secondary" size="sm" disabled={rules.length === 0} onClick={() => setStage('review')}>
                {blockers > 0 ? `${blockers} to fix` : 'Review & publish'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {stage === 'review' ? (
        <div className="bf3__reviewstage">
          <button type="button" className="bf3__backrules" onClick={() => setStage('rules')}>
            <ArrowLeft size={13} strokeWidth={2} aria-hidden />
            Back to the ledger
          </button>
          <ReviewStep
            draft={draft}
            saved={saved}
            env={env}
            onJump={(i) => {
              setStage('rules')
              setSelected(rules[i]?.id ?? null)
            }}
            onOpen={(d) => setDialog(d as typeof dialog)}
            onPublish={(status) => {
              patch({ status })
              store.savePolicy({ ...draft, status })
              store.showToast(status === 'monitor' ? `${draft.name} is monitoring` : `${draft.name} published`)
            }}
          />
        </div>
      ) : (
        <>
          {/* The situation strip. Running it turns the grid into a trace rather
              than opening a second rendering of the policy beside it. */}
          <div className={`bf3__strip ${tracing ? 'is-on' : ''}`}>
            <span className="u-label">Try a sign-in</span>
            <Picker label="Person" value={pv.userId} options={SIM_USERS.map((u) => ({ value: u.id, label: u.name, meta: u.groupName }))} onChange={(userId) => setPv({ ...pv, userId })} />
            <Picker label="Where from" value={pv.place} options={PLACES.map((p) => ({ value: p, label: p }))} onChange={(place) => setPv({ ...pv, place })} />
            <Picker label="Device" value={pv.device} options={DEVICE_OPTIONS.map((d) => ({ value: d, label: d }))} onChange={(device) => setPv({ ...pv, device })} />
            <Picker label="Risk" value={pv.risk} options={RISKS.map((r) => ({ value: r, label: `${r} risk` }))} onChange={(risk) => setPv({ ...pv, risk })} />

            {tracing ? (
              <>
                <span className="bf3__traceout">
                  {trace?.outOfAudience
                    ? `Not governed — this policy does not apply to ${ctx.user.name}`
                    : trace?.hitIndex === null
                      ? 'Nothing matched — falls through to the last row'
                      : `Rule ${(trace?.hitIndex ?? 0) + 1} decides it`}
                </span>
                <button type="button" className="bf3__stripclear" onClick={() => setTracing(false)}>
                  <X size={12} strokeWidth={2.2} aria-hidden />
                  Clear
                </button>
              </>
            ) : (
              <button type="button" className="bf3__striprun" onClick={() => setTracing(true)}>
                <Play size={12} strokeWidth={2.2} aria-hidden />
                Run
              </button>
            )}
          </div>

          <div className="bf3__gridwrap">
            <div
              className="bf3__grid"
              role="grid"
              aria-label="Rules, in evaluation order"
              aria-rowcount={rules.length + 2}
              aria-colcount={7}
              data-trace={tracing ? 'on' : 'off'}
              ref={grid}
              onKeyDown={onGridKey}
            >
              <div className="bf3__head" role="row">
                <span role="columnheader" className="bf3__h bf3__h--n">#</span>
                <span role="columnheader" className="bf3__h">Rule</span>
                <span role="columnheader" className="bf3__h">Narrows to</span>
                <span role="columnheader" className="bf3__h">When</span>
                <span role="columnheader" className="bf3__h">Then</span>
                <span role="columnheader" className="bf3__h bf3__h--num">Reach</span>
                <span role="columnheader" className="bf3__h">State</span>
              </div>

              {/* A pairwise finding names two rules. Pinning the partner under
                  the header is the only way to read "rule 7 can never run
                  because rule 3 eats it" without navigating away from one of
                  them — which is the whole argument for a grid. */}
              {pinned !== null && rules[pinned] && (
                <div className="bf3__pinned">
                  <LedgerRow
                    rule={rules[pinned]}
                    index={pinned}
                    total={rules.length}
                    selected={false}
                    picked={false}
                    shadowed={false}
                    reach={swept.reach[pinned] ?? 0}
                    reachShare={Math.round(((swept.reach[pinned] ?? 0) / peak) * 100)}
                    diagnostics={diagnostics.filter((d) => d.ruleIndex === pinned)}
                    trace={trace?.rows[rules[pinned].id]}
                    resolve={resolve}
                    onOpen={() => setSheet(rules[pinned].id)}
                    onPick={() => setPinned(null)}
                    onPatch={(p) => patchRule(rules[pinned].id, p)}
                    onMove={(to) => move(pinned, to)}
                    onBadge={() => setPinned(null)}
                  />
                </div>
              )}

              <div className="bf3__body" role="rowgroup">
                {rules.length === 0 && (
                  <div className="bf3__empty">
                    <p>No rules yet. Every sign-in falls straight to the last row.</p>
                    <Button icon={Plus} size="sm" onClick={() => addRule()}>
                      Add the first rule
                    </Button>
                  </div>
                )}

                {rules.map((r, i) => (
                  <div key={r.id}>
                    <div className="bf3__seam">
                      <button type="button" className="bf3__insert" aria-label={`Insert a rule at position ${i + 1}`} onClick={() => addRule(i)} />
                    </div>
                    <LedgerRow
                      rule={r}
                      index={i}
                      total={rules.length}
                      selected={selected === r.id}
                      picked={multi.has(r.id)}
                      shadowed={shadowed.includes(i)}
                      reach={swept.reach[i] ?? 0}
                      reachShare={Math.round(((swept.reach[i] ?? 0) / peak) * 100)}
                      diagnostics={diagnostics.filter((d) => d.ruleIndex === i)}
                      trace={trace?.rows[r.id]}
                      resolve={resolve}
                      onOpen={() => setSheet(r.id)}
                      onPick={(additive) => pick(r.id, additive)}
                      onPatch={(p) => patchRule(r.id, p)}
                      onMove={(to) => move(i, to)}
                      onBadge={() => {
                        const rel = diagnostics.find((d) => d.ruleIndex === i && d.relatedIndex !== undefined)
                        setPinned(rel?.relatedIndex ?? null)
                        setSelected(r.id)
                      }}
                    />
                  </div>
                ))}

                {rules.length > 0 && (
                  <>
                    <div className="bf3__seam">
                      <button type="button" className="bf3__insert" aria-label={`Insert a rule at position ${rules.length + 1}`} onClick={() => addRule()} />
                    </div>
                    <button type="button" className="bf3__addrow" onClick={() => addRule()}>
                      <Plus size={13} strokeWidth={2.4} aria-hidden />
                      Add rule
                    </button>
                  </>
                )}
              </div>

              <TerminalRow
                fallback={draft.fallback ?? '1fa'}
                residual={swept.fellThrough}
                residualShare={Math.round((swept.fellThrough / peak) * 100)}
                onFallback={(fallback: AccessDecision) => patch({ fallback })}
              />
            </div>

            {/* Several rules, one edit, one history entry. Four separate edits
                would be four undos, and somebody who set four rules to Deny by
                mistake should not have to guess which four. */}
            <AnimatePresence>
              {multi.size > 1 && (
                <motion.div
                  className="bf3__selbar"
                  role="status"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                >
                  <strong>{multi.size} rules</strong>
                  <span className="bf3__selseg">
                    {(['deny', '1fa', '2fa'] as AccessDecision[]).map((d) => (
                      <button key={d} type="button" onClick={() => patch({ rules: bulkPatch(rules, multi, { decision: d }) })}>
                        {d === 'deny' ? 'Deny' : d === '1fa' ? '1 factor' : '2 factors'}
                      </button>
                    ))}
                  </span>
                  <button type="button" onClick={() => patch({ rules: bulkPatch(rules, multi, { enabled: false }) })}>
                    Disable
                  </button>
                  <button type="button" onClick={() => patch({ rules: bulkPatch(rules, multi, { enabled: true }) })}>
                    Enable
                  </button>
                  <button type="button" className="bf3__selclear" onClick={() => setMulti(new Set())}>
                    Clear
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {openRule && (
                <LedgerSheet
                  key={openRule.id}
                  rule={openRule}
                  index={rules.indexOf(openRule)}
                  ctx={ctx}
                  catalogue={catalogue}
                  onCatalogue={setCatalogue}
                  onPatch={(p) => patchRule(openRule.id, p)}
                  onClose={() => {
                    setSheet(null)
                    setCatalogue(null)
                  }}
                  onDelete={() => {
                    patch({ rules: rules.filter((r) => r.id !== openRule.id) })
                    setSheet(null)
                  }}
                />
              )}
            </AnimatePresence>
          </div>

          <footer className={`bf3__savebar ${dirty ? 'is-dirty' : ''}`}>
            <span>
              {dirty ? (
                <>
                  <b>{changes[0]}</b>
                  {changes.length > 1 && <i> and {changes.length - 1} more</i>}
                </>
              ) : (
                `${rules.length} rule${rules.length === 1 ? '' : 's'} · first match wins`
              )}
            </span>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setHist(historyOf(saved))}>
                Discard
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!dirty}
              onClick={() => {
                store.savePolicy(draft)
                store.showToast(`${draft.name} saved`)
              }}
            >
              Save
            </Button>
          </footer>
        </>
      )}

      <AudienceDrawer
        open={audienceOpen}
        audience={draft.audience}
        groups={store.groups}
        users={store.users}
        unlisted={store.unlistedUsers}
        onClose={() => setAudienceOpen(false)}
        onApply={(audience) => patch({ audience })}
      />

      <AssignAppsDialog
        open={dialog === 'apps'}
        policy={draft}
        onClose={() => setDialog(null)}
        onChange={(appIds, allApps) => patch({ appIds, allApps })}
      />
      <SaveTemplateDialog
        open={dialog === 'template'}
        policy={draft}
        onClose={() => setDialog(null)}
        onSave={(t) => {
          setDialog(null)
          store.showToast(`${t.name} saved as a template`)
        }}
      />
      <ReviewDialog
        open={dialog === 'review'}
        policy={draft}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          store.savePolicy(draft)
          store.showToast(`${draft.name} saved`)
          setDialog(null)
        }}
        onAssignApps={() => setDialog('apps')}
      />
      <DecisionLogDialog open={dialog === 'log'} policy={draft} onClose={() => setDialog(null)} />
      <TestPolicyDialog open={dialog === 'test'} policy={draft} onClose={() => setDialog(null)} />
      <CopyRuleDialog open={dialog === 'copy'} rule={rules.find((r) => r.id === selected)} from={draft} onClose={() => setDialog(null)} />
    </div>
  )
}
