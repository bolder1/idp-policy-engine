import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Command,
  Copy,
  GripVertical,
  LayoutGrid,
  ListOrdered,
  LogIn,
  Plus,
  Redo2,
  Rows3,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react'

import { Button, DecisionChip, SaveBar } from '../kit'
import {
  CONDITION_CATALOGUE,
  blankRule,
  cond,
  conditionType,
  type Policy,
  type Rule,
} from '../data'
import { useBrand } from '../store'
import { AssignAppsDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import { describeChanges } from './changes'
import { diagnose, shadowedBy } from './diagnostics'
import { applyFix } from './gauntlet'
import { GauntletDialog } from './gauntlet-dialog'
import { ImpactArenaDialog } from './impact-arena-dialog'
import {
  DEC_KEY,
  DEFAULT_PREVIEW,
  PreviewPanel,
  RuleForm,
  previewContext,
  ruleState,
  seedValues,
  type PreviewState,
} from './rule-form'
import type { SimEnv } from './simulate'
import { CommandBar, baseCommands, type Cmd } from './command-bar'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from './history'
import { Readiness } from './readiness'
import './builder-v5.css'

/* -----------------------------------------------------------------------------
   Policy builder v5 — the mega builder.

   Five versions argued about layout and none of them won, which turns out to be
   the finding rather than a failure to reach one. They are good at different
   tasks over the same object:

     Steps  (v3)  — reading a policy top to bottom, and reordering it.
     Form   (v4)  — changing one rule properly, all of it, without hunting.
     Board  (v2)  — assembling a new policy out of a catalogue you can see.

   So v5 does not pick. It holds ONE draft and lets the workspace change around
   it: the same rules, the same selection, the same form component, three
   layouts. Switching costs nothing because nothing is re-entered.

   What v5 adds that none of the others have, and why each earns its place:

   · **Undo.** Every other version's only way back is Discard, which throws away
     the whole session. Rule order is a semantic edit made with a single click,
     and an editor where the most dangerous action is the easiest to do by
     accident needs a step backwards.
   · **A command bar.** Six workspaces' worth of controls do not fit on one
     toolbar. ⌘K reaches every one of them by name, including "go to rule 4".
   · **One publish gate.** The linter, the gauntlet and the blast radius each
     answer part of "is this safe to ship". Read separately they are three
     screens nobody opens; collected into one readiness panel they are a
     checklist that names its own blockers.
   · **Shadowing made visible.** v2's `shadowedBy` proved which rules a broad
     rule silently kills. Here, hovering one dims them — first-match-wins is
     the model's sharpest edge and this is the only place it is drawn.
   -------------------------------------------------------------------------- */

type Mode = 'steps' | 'form' | 'board'

const MODES: { id: Mode; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'steps', label: 'Steps', icon: ListOrdered, blurb: 'Read it top to bottom and reorder — v3' },
  { id: 'form', label: 'Form', icon: Rows3, blurb: 'Change one rule properly — v4' },
  { id: 'board', label: 'Board', icon: LayoutGrid, blurb: 'Assemble from the catalogue — v2' },
]

const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

export function PolicyBuilderV5({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [mode, setMode] = useState<Mode>('steps')
  const [selected, setSelected] = useState(0)
  const [ifView, setIfView] = useState<'build' | 'check'>('build')
  const [railTab, setRailTab] = useState<'ready' | 'preview'>('ready')
  const [pv, setPv] = useState<PreviewState>(DEFAULT_PREVIEW)
  const [openStep, setOpenStep] = useState<string | null>(null)
  const [hoverShadow, setHoverShadow] = useState<number | null>(null)
  const [cmd, setCmd] = useState(false)
  const [live, setLive] = useState('')
  const [dialog, setDialog] = useState<
    null | 'log' | 'test' | 'apps' | 'template' | 'review' | 'gauntlet' | 'impact'
  >(open ?? null)

  const stage = useRef<HTMLDivElement | null>(null)

  /* Opened straight from the policy list, which knows the finding but not the
     surface that explains it. Cleared to null on close like any other dialog —
     the prop is an entry point, not a mode. */
  useEffect(() => {
    if (open) setDialog(open)
  }, [open])

  useEffect(() => {
    if (saved) setHist(historyOf(saved))
  }, [saved?.id])

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      postureName: (id) => store.postureById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
    }),
    [store],
  )
  const ctx = useMemo(() => previewContext(pv), [pv])

  const draft = hist.present

  /* Keyboard. Undo is deliberately not intercepted while a field has focus —
     the browser's own text undo is the right behaviour there, and stealing it
     would make typing feel broken to fix a problem the user does not have. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
        return
      }
      const action = historyKey(e)
      if (action) {
        e.preventDefault()
        setHist(action === 'redo' ? redo : undo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setDraft = useCallback((next: Policy) => setHist((h) => commit(h, next)), [])

  if (!saved || !draft.id) {
    return (
      <div className="bpage bm">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const changes = dirty ? describeChanges(saved, draft) : []
  const diagnostics = diagnose(draft, store.groups)
  const index = Math.min(selected, Math.max(0, rules.length - 1))
  const rule: Rule | undefined = rules[index]

  const patch = (p: Partial<Policy>) => setDraft({ ...draft, ...p })
  const patchRule = (p: Partial<Rule>) => patch({ rules: rules.map((r, n) => (n === index ? { ...r, ...p } : r)) })

  const blockers = diagnostics.filter((d) => d.severity === 'error' && rules[d.ruleIndex]?.enabled !== false).length

  const addRule = (at = rules.length, typeId?: string) => {
    let r = blankRule(`Rule ${rules.length + 1}`)
    if (typeId) {
      const t = conditionType(typeId)
      r = { ...r, name: t.label, conditions: [cond(typeId, t.operators[0], seedValues(t, store.zones[0]?.id, store.postures[0]?.id))] }
    }
    patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
    setSelected(at)
    setOpenStep(r.id)
    setLive(`Rule added at position ${at + 1}`)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    patch({ rules: next })
    setSelected(to)
    setLive(`${r.name} moved to position ${to + 1}. Evaluation order changed.`)
  }

  const jump = (i: number) => {
    setSelected(i)
    setOpenStep(rules[i]?.id ?? null)
    setDialog(null)
    setCmd(false)
    stage.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  /* Add a condition from the board palette. With a rule selected it lands on
     that rule; with none it becomes a new rule — which is what "click to
     append" has to mean when the canvas can be empty. */
  const paletteAdd = (typeId: string, preset?: string) => {
    const t = conditionType(typeId)
    const values = preset ? [preset] : seedValues(t, store.zones[0]?.id, store.postures[0]?.id)
    if (!rule) return addRule(rules.length, typeId)
    patchRule({ conditions: [...rule.conditions, cond(typeId, t.operators[0], values)] })
    setLive(`${t.label} added to ${rule.name}`)
  }

  const shadowed = hoverShadow === null ? [] : shadowedBy(draft, hoverShadow)

  const form = rule ? (
    <RuleForm
      policy={draft}
      index={index}
      ctx={ctx}
      env={env}
      diagnostics={diagnostics.filter((d) => d.ruleIndex === index)}
      ifView={ifView}
      onIfView={setIfView}
      onPatch={patchRule}
      onJump={jump}
      sticky={mode === 'form'}
      onDuplicate={() => {
        const copy = { ...rule, id: `r${Date.now()}`, name: `${rule.name} (copy)` }
        patch({ rules: [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)] })
        setSelected(index + 1)
      }}
      onDelete={() => {
        patch({ rules: rules.filter((_, n) => n !== index) })
        setSelected(Math.max(0, index - 1))
        setLive(`${rule.name} deleted`)
      }}
    />
  ) : null

  return (
    <div className="bpage bm">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* --- Top bar -------------------------------------------------------- */}
      <header className="bm__bar">
        <button type="button" className="bm__back" aria-label="Back to policies" onClick={() => store.go({ name: 'policies' })}>
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <input className="bm__name" aria-label="Policy name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />

        <div className="bm__modes" role="tablist" aria-label="Workspace">
          {MODES.map((m) => {
            const Ico = m.icon
            return (
              <button
                key={m.id}
                role="tab"
                type="button"
                title={m.blurb}
                aria-selected={mode === m.id}
                className={mode === m.id ? 'is-on' : ''}
                onClick={() => setMode(m.id)}
              >
                {mode === m.id && !reduce && (
                  <motion.span layoutId="bm-mode" className="bm__modebg" transition={{ type: 'spring', stiffness: 600, damping: 44 }} />
                )}
                <span>
                  <Ico size={13} strokeWidth={2} aria-hidden />
                  {m.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="bm__baracts">
          <span className="bm__history">
            <button type="button" aria-label="Undo" disabled={!canUndo(hist)} onClick={() => setHist(undo)}>
              <Undo2 size={14} strokeWidth={1.9} />
            </button>
            <button type="button" aria-label="Redo" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
              <Redo2 size={14} strokeWidth={1.9} />
            </button>
          </span>
          <button type="button" className="bm__cmdbtn" onClick={() => setCmd(true)}>
            <Command size={12} strokeWidth={2} aria-hidden />
            <span>Actions</span>
            <kbd>⌘K</kbd>
          </button>
          {blockers > 0 && (
            <span className="bm__blocked">
              {blockers} error{blockers === 1 ? '' : 's'}
            </span>
          )}
          <Button variant="brand" disabled={!dirty || blockers > 0} onClick={() => setDialog('review')}>
            Publish
          </Button>
        </div>
      </header>

      <div className={`bm__work is-${mode}`}>
        {/* --- Left: spine, or the palette on the board -------------------- */}
        {mode === 'board' ? (
          <Palette onPick={paletteAdd} target={rule?.name ?? null} />
        ) : (
          <aside className="bm__spine" aria-label="Rules in evaluation order">
            <header>
              <span className="u-label">Order</span>
              <button type="button" onClick={() => addRule()} aria-label="Add a rule">
                <Plus size={14} strokeWidth={2.2} />
              </button>
            </header>
            <ol>
              {rules.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`bm__spineitem ${i === index ? 'is-on' : ''} ${r.enabled ? '' : 'is-off'} ${shadowed.includes(i) ? 'is-shadowed' : ''}`}
                    onClick={() => jump(i)}
                    onMouseEnter={() => setHoverShadow(i)}
                    onMouseLeave={() => setHoverShadow(null)}
                  >
                    <span className={`bm__n is-${DEC_KEY[r.decision]}`}>
                      {i + 1}
                      <span className={`bm__pip is-${ruleState(diagnostics.filter((d) => d.ruleIndex === i))}`} aria-hidden />
                    </span>
                    <span className="bm__spinetext">
                      <strong>{r.name}</strong>
                      <em>{r.conditions.length === 0 ? 'catches everything' : `${r.conditions.length} condition${r.conditions.length === 1 ? '' : 's'}`}</em>
                    </span>
                  </button>
                  <span className="bm__move">
                    <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${r.name} down`} disabled={i === rules.length - 1} onClick={() => move(i, i + 1)}>
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="bm__spinedefault">
              <span className="bm__n is-allow">—</span>
              <span className="bm__spinetext">
                <strong>Default rule</strong>
                <em>one factor, always last</em>
              </span>
            </div>
          </aside>
        )}

        {/* --- Middle: the workspace ---------------------------------------- */}
        <main className="bm__stage" ref={stage}>
          {rules.length === 0 ? (
            <div className="bm__blank">
              <Sparkles size={22} strokeWidth={1.6} aria-hidden />
              <h2>This policy has no rules</h2>
              <p>Every sign-in falls through to the engine default until there is at least one.</p>
              <Button variant="brand" onClick={() => addRule()}>
                Add the first rule
              </Button>
            </div>
          ) : mode === 'form' ? (
            form
          ) : mode === 'steps' ? (
            <div className="bm__steps">
              <article className="bm__step is-trigger">
                <span className="bm__n is-trigger" aria-hidden>
                  <LogIn size={14} strokeWidth={1.9} />
                </span>
                <div className="bm__steptext">
                  <span className="bm__eyebrow">Trigger</span>
                  <h2>A user attempts to sign in</h2>
                </div>
              </article>

              {rules.map((r, i) => (
                <div key={r.id}>
                  <Connector onAdd={() => addRule(i)} />
                  <Step
                    rule={r}
                    index={i}
                    open={openStep === r.id}
                    selected={i === index}
                    dimmed={shadowed.includes(i)}
                    state={ruleState(diagnostics.filter((d) => d.ruleIndex === i))}
                    env={env}
                    onHover={(on) => setHoverShadow(on ? i : null)}
                    onToggle={() => {
                      setSelected(i)
                      setOpenStep(openStep === r.id ? null : r.id)
                    }}
                    onMove={(d) => move(i, i + d)}
                    canUp={i > 0}
                    canDown={i < rules.length - 1}
                    onDuplicate={() => {
                      const copy = { ...r, id: `r${Date.now()}`, name: `${r.name} (copy)` }
                      patch({ rules: [...rules.slice(0, i + 1), copy, ...rules.slice(i + 1)] })
                    }}
                    onDelete={() => {
                      patch({ rules: rules.filter((_, n) => n !== i) })
                      setSelected(Math.max(0, i - 1))
                    }}
                    reduce={!!reduce}
                  >
                    {i === index ? form : null}
                  </Step>
                </div>
              ))}

              <Connector onAdd={() => addRule(rules.length)} />
              <article className="bm__step is-fallback">
                <span className="bm__n is-allow" aria-hidden>
                  <Check size={14} strokeWidth={2.2} />
                </span>
                <div className="bm__steptext">
                  <span className="bm__eyebrow">Otherwise</span>
                  <h2>Everyone else signs in on one factor</h2>
                </div>
              </article>
            </div>
          ) : (
            <div className="bm__canvas">
              <p className="bm__canvasnote">
                Click anything in the catalogue to add it to <strong>{rule?.name ?? 'a new rule'}</strong>. Rules are
                evaluated top to bottom and the first match wins.
              </p>
              {rules.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  className={`bm__node ${i === index ? 'is-on' : ''} ${r.enabled ? '' : 'is-off'} ${shadowed.includes(i) ? 'is-shadowed' : ''}`}
                  onClick={() => setSelected(i)}
                  onMouseEnter={() => setHoverShadow(i)}
                  onMouseLeave={() => setHoverShadow(null)}
                >
                  <span className={`bm__n is-${DEC_KEY[r.decision]}`}>{i + 1}</span>
                  <span className="bm__nodetext">
                    <strong>{r.name}</strong>
                    <em>{predicate(r, env)}</em>
                  </span>
                  <DecisionChip decision={r.decision} size="sm" />
                </button>
              ))}
              <div className="bm__nodedefault">Default rule — one factor</div>
            </div>
          )}
        </main>

        {/* On the board the form is a companion to the canvas rather than the
            thing itself, so it takes its own column instead of the stage. */}
        {mode === 'board' && rule && <aside className="bm__inspector">{form}</aside>}

        {/* --- Right: readiness and preview ---------------------------------- */}
        <aside className="bm__rail">
          <div className="bm__railtabs" role="tablist" aria-label="Rail">
            <button role="tab" type="button" aria-selected={railTab === 'ready'} className={railTab === 'ready' ? 'is-on' : ''} onClick={() => setRailTab('ready')}>
              Ready to publish
            </button>
            <button role="tab" type="button" aria-selected={railTab === 'preview'} className={railTab === 'preview' ? 'is-on' : ''} onClick={() => setRailTab('preview')}>
              Preview
            </button>
          </div>

          {railTab === 'ready' ? (
            <Readiness
              draft={draft}
              saved={saved}
              env={env}
              blockers={blockers}
              onOpen={setDialog}
              onJump={jump}
            />
          ) : (
            <PreviewPanel policy={draft} index={index} pv={pv} onPv={setPv} ctx={ctx} env={env} onJump={jump} />
          )}
        </aside>
      </div>

      <SaveBar
        open={dirty}
        changes={changes}
        onDiscard={() => setHist(historyOf(saved))}
        onReview={() => setDialog('review')}
      />

      <AnimatePresence>
        {cmd && (
          <CommandBar
            commands={baseCommands(rules, {
              canUndo: canUndo(hist),
              canRedo: canRedo(hist),
              // Only this host has workspaces to move between.
              extra: MODES.filter((m) => m.id !== mode).map(
                (m): Cmd => ({ id: `mode:${m.id}`, label: `Switch to ${m.label}`, hint: m.blurb, icon: m.icon }),
              ),
            })}
            onClose={() => setCmd(false)}
            onRun={(id) => {
              setCmd(false)
              if (id.startsWith('rule:')) return jump(Number(id.slice(5)))
              if (id.startsWith('mode:')) return setMode(id.slice(5) as Mode)
              if (id === 'add') return addRule()
              if (id === 'undo') return setHist(undo)
              if (id === 'redo') return setHist(redo)
              if (id === 'publish') return setDialog('review')
              setDialog(id as typeof dialog)
            }}
          />
        )}
      </AnimatePresence>

      <DecisionLogDialog open={dialog === 'log'} policy={draft} onClose={() => setDialog(null)} />
      <TestPolicyDialog open={dialog === 'test'} policy={draft} onClose={() => setDialog(null)} />
      <GauntletDialog
        open={dialog === 'gauntlet'}
        policy={draft}
        onClose={() => setDialog(null)}
        onJumpToRule={jump}
        /* The dialog stays open. A fix is the start of a check, not the end of
           one — closing here would hide the replay that says whether inserting
           this rule broke something further down the list. */
        onApplyFix={(fix) => {
          patch({ rules: applyFix(rules, fix) })
          setSelected(fix.at)
          const what = fix.kind === 'insert' ? 'inserted as' : 'now'
          setLive(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
          store.showToast(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
        }}
      />
      <ImpactArenaDialog open={dialog === 'impact'} draft={draft} saved={saved} onClose={() => setDialog(null)} onJumpToRule={jump} />
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
        onAssignApps={() => setDialog('apps')}
        onConfirm={() => {
          store.savePolicy(draft)
          setDialog(null)
          store.showToast(`${draft.name} published`)
        }}
      />
    </div>
  )
}

/* --- Steps -------------------------------------------------------------------- */

function predicate(r: Rule, env: SimEnv): string {
  if (r.conditions.length === 0) return 'Everyone who reaches it'
  return r.conditions
    .map((c, i) => {
      const t = conditionType(c.typeId)
      const shown =
        t.valueKind === 'zone'
          ? c.values.map(env.zoneName).join(', ')
          : t.valueKind === 'posture'
            ? c.values.map(env.postureName).join(', ')
            : c.values.filter(Boolean).join(', ')
      const body = `${t.label} ${c.operator} ${shown || '…'}`
      return i === 0 ? body : `${c.joiner} ${body}`
    })
    .join(' ')
}

function Connector({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bm__link">
      <span aria-hidden />
      <button type="button" aria-label="Insert a rule here" onClick={onAdd}>
        <Plus size={12} strokeWidth={2.6} />
      </button>
    </div>
  )
}

function Step({
  rule,
  index,
  open,
  selected,
  dimmed,
  state,
  env,
  onHover,
  onToggle,
  onMove,
  canUp,
  canDown,
  onDuplicate,
  onDelete,
  reduce,
  children,
}: {
  rule: Rule
  index: number
  open: boolean
  selected: boolean
  dimmed: boolean
  state: 'ready' | 'setup' | 'warn'
  env: SimEnv
  onHover: (on: boolean) => void
  onToggle: () => void
  onMove: (d: -1 | 1) => void
  canUp: boolean
  canDown: boolean
  onDuplicate: () => void
  onDelete: () => void
  reduce: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={`bm__step ${open ? 'is-open' : ''} ${selected ? 'is-sel' : ''} ${rule.enabled ? '' : 'is-off'} ${dimmed ? 'is-shadowed' : ''}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button type="button" className="bm__stephead" aria-expanded={open} onClick={onToggle}>
        <span className={`bm__n is-${DEC_KEY[rule.decision]}`}>
          {index + 1}
          <span className={`bm__pip is-${state}`} aria-hidden />
        </span>
        <div className="bm__steptext">
          <span className="bm__eyebrow">
            Rule {index + 1}
            {dimmed && <b className="bm__shadowtag">shadowed — can never run</b>}
          </span>
          <h2>{rule.name}</h2>
          <p>
            When <em>{predicate(rule, env)}</em>
          </p>
        </div>
        <span className="bm__stepright">
          <DecisionChip decision={rule.decision} size="sm" />
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: reduce ? 0 : 0.2 }} aria-hidden>
            <ChevronDown size={16} strokeWidth={2} />
          </motion.span>
        </span>
      </button>

      <div className="bm__stepacts">
        <button type="button" aria-label="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={!canDown} onClick={() => onMove(1)}>
          ↓
        </button>
        <button type="button" aria-label={`Duplicate ${rule.name}`} onClick={onDuplicate}>
          <Copy size={12} strokeWidth={1.9} />
        </button>
        <button type="button" className="is-danger" aria-label={`Delete ${rule.name}`} onClick={onDelete}>
          <Trash2 size={12} strokeWidth={1.9} />
        </button>
        <span aria-hidden>
          <GripVertical size={12} strokeWidth={1.8} />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="bm__stepbody"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
          >
            {/* The form is long, so inside a step it gets its own scroll rather
                than pushing the rest of the sequence a screen and a half down.
                That is the v3 lesson, applied instead of repeated. */}
            <div className="bm__stepscroll">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  )
}

/* --- Board palette -------------------------------------------------------------- */

function Palette({ onPick, target }: { onPick: (typeId: string, preset?: string) => void; target: string | null }) {
  const store = useBrand()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const m = new Map<string, typeof CONDITION_CATALOGUE>()
    for (const c of CONDITION_CATALOGUE) {
      if (METHOD_GROUPS.has(c.group)) continue
      if (q && !c.label.toLowerCase().includes(q.toLowerCase()) && !c.group.toLowerCase().includes(q.toLowerCase())) continue
      if (!m.has(c.group)) m.set(c.group, [])
      m.get(c.group)!.push(c)
    }
    return [...m.entries()]
  }, [q])

  const hit = (t: string) => !q || t.toLowerCase().includes(q.toLowerCase())

  return (
    <aside className="bm__palette" aria-label="Condition catalogue">
      <header>
        <span className="u-label">Catalogue</span>
        <p>{target ? `Adds to ${target}` : 'Adds a new rule'}</p>
      </header>
      <div className="bm__palsearch">
        <Search size={13} strokeWidth={2} aria-hidden />
        <input aria-label="Search the catalogue" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bm__palbody">
        {(store.zones.some((z) => hit(z.name)) || store.postures.some((p) => hit(p.name))) && (
          <div className="bm__palgroup">
            <h4>Library</h4>
            {store.zones.filter((z) => hit(z.name) || hit('zone')).map((z) => (
              <button key={z.id} type="button" onClick={() => onPick('zone', z.id)}>
                {z.name}
              </button>
            ))}
            {store.postures.filter((p) => hit(p.name) || hit('device')).map((p) => (
              <button key={p.id} type="button" onClick={() => onPick('posture', p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        {groups.map(([g, list]) => (
          <div className="bm__palgroup" key={g}>
            <h4>{g}</h4>
            {list.map((c) => (
              <button key={c.id} type="button" title={c.hint} onClick={() => onPick(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <p className="bm__palempty">Nothing matches “{q}”.</p>}
      </div>
    </aside>
  )
}
