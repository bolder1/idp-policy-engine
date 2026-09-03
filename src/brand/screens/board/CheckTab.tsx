import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Play, RotateCcw, X, XCircle } from 'lucide-react'

import { Button } from '../../kit'
import type { Policy, Rule } from '../../data'
import { useBrand } from '../../store'
import type { Diagnostic } from '../diagnostics'
import { DECK, OUTCOME_LABEL, applyFix, proposeFix, runGauntlet, type Outcome, type ProposedFix, type Round } from '../gauntlet'
import { compare, sweep } from '../impact-arena'
import { AUTH_STATES, DEVICE_OPTIONS, PLACES, RISKS, SIM_USERS, walk, type SimContext, type SimEnv } from '../simulate'
import { CLOCKS, DECISION_NAME, DECISION_SHORT, TONE, shortAuth, shortDevice, shortPlace, type Selection, type Tab, type Trace } from './model'
import { Section, Seg } from './Section'

/* -----------------------------------------------------------------------------
   Check — three questions about the whole policy, answered where you can act.

   · Try a sign-in — rehearse one. The board plays it: each rule lights missed
     or matched, the token lands on the card that decided.
   · Break-in test — thirteen attempts, seven hostile. The grade is a count of
     what got through, and every failure offers the rule that closes it, with
     what applying it would change shown BEFORE it is applied.
   · Ready to publish — the gate, as rows that link to what clears them.
   -------------------------------------------------------------------------- */

const OUTCOME_ORDER: Record<Outcome, number> = { breach: 0, lockout: 1, friction: 2, held: 3 }

/* Lower the first letter only, and only if the word is not a name.

   The trace reasons are written as sentences — "Closest was card A: Network
   Zone not in zone Office Network" — and they get spliced mid-sentence after a
   dash. `toLowerCase()` on the whole string flattened every proper noun in
   them. */
const uncapitalise = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
/* One shared empty object, so "no overrides" is referentially stable and the
   deck is not re-dealt on every render. */
const NO_OVERRIDES: Record<string, never> = {}

export function CheckTab({
  draft,
  saved,
  dirty,
  env,
  diagnostics,
  trace,
  onTrace,
  onSelect,
  onTab,
  onApplyRules,
}: {
  draft: Policy
  saved: Policy
  dirty: boolean
  env: SimEnv
  diagnostics: Diagnostic[]
  trace: Trace | null
  onTrace: (t: Trace | null) => void
  onSelect: (s: Selection) => void
  onTab: (t: Tab) => void
  onApplyRules: (rules: Rule[], note: string) => void
}) {
  const store = useBrand()

  /* --- Try a sign-in ------------------------------------------------------- */
  const [who, setWho] = useState(trace?.ctx.user.id ?? SIM_USERS[0].id)
  const [place, setPlace] = useState(trace?.ctx.place ?? 'Office Network')
  const [device, setDevice] = useState(trace?.ctx.device ?? 'Known < 90 days')
  const [auth, setAuth] = useState(trace?.ctx.authState ?? 'Normal returning user')
  const [risk, setRisk] = useState(trace?.ctx.risk ?? 'Low')
  const [clock, setClock] = useState<number>(trace?.ctx.nowMinutes ?? 570)

  const ctx = useMemo<SimContext>(
    () => ({ user: SIM_USERS.find((u) => u.id === who) ?? SIM_USERS[0], place, device, authState: auth, risk, nowMinutes: clock }),
    [who, place, device, auth, risk, clock],
  )
  const rehearse = () => onTrace({ ctx, result: walk(draft, ctx, env), runId: Date.now() })

  const r = trace?.result
  const hitRule = r && r.hitIndex !== null ? draft.rules[r.hitIndex] : null

  /* --- Break-in test ------------------------------------------------------- */
  const overrides = store.gauntletOverrides[draft.id] ?? NO_OVERRIDES
  const test = useMemo(() => runGauntlet(draft, env, overrides), [draft, env, overrides])
  const rounds = useMemo(() => [...test.rounds].sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]), [test])
  const [openRound, setOpenRound] = useState<string | null>(null)
  const skipped = DECK.length - test.rounds.length

  /* --- Ready to publish ---------------------------------------------------- */
  const errors = diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled))
  const after = useMemo(() => sweep(draft, env, 570), [draft, env])
  const movement = useMemo(() => (dirty ? compare(sweep(saved, env, 570), after) : null), [dirty, saved, env, after])
  const dead = draft.rules.map((rule, i) => ({ rule, i })).filter(({ rule, i }) => rule.enabled && after.reach[i] === 0)
  const app = draft.appId ? store.appById(draft.appId) : null

  return (
    <>
      <Section title="Try a sign-in" note="Pick a person and a situation, then watch it fall through the rules on the board.">
        <div className="bb__ctx">
          <Row label="Who">
            {SIM_USERS.map((u) => (
              <Chip key={u.id} on={who === u.id} onClick={() => setWho(u.id)}>
                {u.name.split(' ')[0]} <em>· {u.groupName}</em>
              </Chip>
            ))}
          </Row>
          <Row label="From">
            {PLACES.map((p) => (
              <Chip key={p} on={place === p} onClick={() => setPlace(p)}>
                {shortPlace(p)}
              </Chip>
            ))}
          </Row>
          <Row label="Device">
            {DEVICE_OPTIONS.map((d) => (
              <Chip key={d} on={device === d} onClick={() => setDevice(d)}>
                {shortDevice(d)}
              </Chip>
            ))}
          </Row>
          <Row label="State">
            {AUTH_STATES.map((a) => (
              <Chip key={a} on={auth === a} onClick={() => setAuth(a)}>
                {shortAuth(a)}
              </Chip>
            ))}
          </Row>
          <Row label="Risk">
            {RISKS.map((x) => (
              <Chip key={x} on={risk === x} onClick={() => setRisk(x)}>
                {x}
              </Chip>
            ))}
          </Row>
          <Row label="Time">
            <Seg label="Time of day" value={String(clock)} options={CLOCKS.map((c) => ({ value: String(c.minutes), label: `${c.label} ${c.caption}` }))} onChange={(v) => setClock(Number(v))} />
          </Row>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {/* Neutral, not brand. "Review & publish" is the brand button on
              this screen and it is the one irreversible thing here; a second
              filled orange button beside it makes a rehearsal look like the
              same weight of decision as shipping. */}
          <Button variant="neutral" icon={Play} onClick={rehearse}>
            {trace ? 'Run it again' : 'Rehearse it'}
          </Button>
          {trace && (
            <Button variant="ghost" icon={X} onClick={() => onTrace(null)}>
              Clear
            </Button>
          )}
        </div>

        <AnimatePresence>
          {trace && r && (
            <motion.div
              key={trace.runId}
              className={`bb__result ${r.outOfAudience ? 'is-out' : `is-${TONE[r.decision]}`}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.3 + 0.22 * (r.steps.length + 1), duration: 0.25 }}
            >
              {r.outOfAudience ? (
                <>
                  <strong>Not governed</strong>
                  <p>This policy does not cover {trace.ctx.user.name}, so none of its rules ran. Whatever governs {trace.ctx.user.groupName} decides.</p>
                </>
              ) : (
                <>
                  <strong>{DECISION_NAME[r.decision]}</strong>
                  <p>
                    {hitRule ? (
                      <>
                        {/* Lowercased wholesale, this read "closest was card a" —
                            `cardName` produces "card A", and case-folding a
                            whole sentence to splice it after a dash destroys
                            any proper noun in it. Only the first letter moves,
                            and only when the rest of the word is not already
                            capitalised. */}
                        Decided by rule {r.hitIndex! + 1}, <b>{hitRule.name}</b> — {uncapitalise(r.steps[r.hitIndex!].reason)}.
                      </>
                    ) : (
                      <>No rule matched, so the default at the bottom decided.</>
                    )}
                  </p>
                  {hitRule && (
                    <Button
                      size="sm"
                      variant="neutral"
                      onClick={() => {
                        onSelect({ kind: 'rule', id: draft.rules[r.hitIndex!].id })
                        onTab('rule')
                      }}
                    >
                      Open that rule
                    </Button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <Section title="Break-in test" count={`${test.breaches} through`} note={`${test.rounds.length} sign-in attempts are dealt at these rules — ${test.rounds.filter((x) => x.challenge.kind === 'threat').length} hostile, the rest ordinary — and graded on what came back.${skipped ? ` ${skipped} skipped: this policy does not govern those people.` : ''}`}>
        <div className="bb__gradehead">
          <span className={`bb__gradebig is-${test.grade}`} aria-label={`Grade ${test.grade}`}>
            {test.grade}
          </span>
          <span className="bb__gradetext">
            <b>{test.breaches === 0 ? 'Nothing got through' : `${test.breaches} got through`}</b>
            <em>{test.gradeReason}</em>
          </span>
        </div>
        <div className="bb__tally">
          <span>
            <b>{test.held}</b> held
          </span>
          <span>
            <b>{test.breaches}</b> got through
          </span>
          <span>
            <b>{test.lockouts}</b> locked out
          </span>
          <span>
            <b>{test.friction}</b> over-challenged
          </span>
        </div>

        <div className="bb__rounds">
          {rounds.map((round) => (
            <RoundRow
              key={round.challenge.id}
              round={round}
              open={openRound === round.challenge.id}
              onToggle={() => setOpenRound((v) => (v === round.challenge.id ? null : round.challenge.id))}
              draft={draft}
              env={env}
              overrides={overrides}
              overridden={round.challenge.id in overrides}
              onOverride={(want) => store.setGauntletOverride(draft.id, round.challenge.id, want)}
              onJump={(i) => {
                onSelect({ kind: 'rule', id: draft.rules[i].id })
                onTab('rule')
              }}
              onApply={(fix) => onApplyRules(applyFix(draft.rules, fix), fix.headline)}
            />
          ))}
        </div>
      </Section>

      <Section title="Ready to publish" note="Four things that have to be true. Each row links to what clears it.">
        <div className="bb__ready">
          <ReadyRow
            ok={errors.length === 0}
            title={errors.length === 0 ? 'No broken rules' : `${errors.length} error${errors.length === 1 ? '' : 's'} to fix`}
            detail={errors.length === 0 ? 'Nothing the linter can prove wrong.' : errors[0].title}
            action={errors.length > 0 && errors[0].ruleIndex >= 0 ? { label: `Open rule ${errors[0].ruleIndex + 1}`, run: () => { onSelect({ kind: 'rule', id: draft.rules[errors[0].ruleIndex].id }); onTab('rule') } } : undefined}
          />
          <ReadyRow ok={test.breaches === 0} warn={test.breaches === 0 && test.lockouts > 0} title={test.breaches === 0 ? 'Break-in test: nothing got through' : `Break-in test: ${test.breaches} got through`} detail={test.gradeReason} />
          <ReadyRow
            ok={!movement || movement.looser === 0}
            warn={!!movement && movement.looser > 0}
            title={!movement ? 'Nothing loosened' : movement.looser === 0 ? 'Nothing quietly loosened' : `${movement.looser} situations get a weaker treatment`}
            detail={!movement ? 'No unsaved changes to compare.' : movement.looser === 0 ? 'No situation is treated more leniently than before.' : 'That is the direction worth being sure about.'}
            action={movement && movement.looser > 0 ? { label: 'See what changes', run: () => onTab('impact') } : undefined}
          />
          <ReadyRow ok={!!app || !!draft.isSystem} title={app ? `Protecting ${app.name}` : draft.isSystem ? 'The tenant default' : 'No application attached'} detail={app || draft.isSystem ? 'The rules are evaluated on every sign-in to it.' : 'These rules are saved but never evaluated.'} />
          {dead.length > 0 && <ReadyRow ok={false} warn title={`${dead.length} rule${dead.length === 1 ? '' : 's'} never win`} detail={`${dead.map(({ rule, i }) => `Rule ${i + 1} · ${rule.name}`).join(', ')} decide no modelled situation. Either unreachable, or reading a signal the model does not carry.`} action={{ label: `Open rule ${dead[0].i + 1}`, run: () => { onSelect({ kind: 'rule', id: dead[0].rule.id }); onTab('rule') } }} />}
        </div>
      </Section>
    </>
  )
}

/* --- Pieces ------------------------------------------------------------------ */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bb__ctxrow">
      <span>{label}</span>
      <span className="bb__chips">{children}</span>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`bb__chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function ReadyRow({ ok, warn, title, detail, action }: { ok: boolean; warn?: boolean; title: string; detail: string; action?: { label: string; run: () => void } }) {
  return (
    <div className={`bb__readyrow ${ok ? '' : warn ? 'is-warn' : 'is-bad'}`}>
      {ok ? <Check size={15} strokeWidth={2.4} aria-hidden /> : warn ? <AlertTriangle size={15} strokeWidth={2} aria-hidden /> : <XCircle size={15} strokeWidth={2} aria-hidden />}
      <span>
        <b>{title}</b>
        <em>
          {detail}
          {action && (
            <>
              {' '}
              <button type="button" className="bb__diag" style={{ display: 'inline', padding: 0, border: 'none', background: 'none', color: 'var(--text-link)', cursor: 'pointer', font: 'inherit' }} onClick={action.run}>
                {action.label} →
              </button>
            </>
          )}
        </em>
      </span>
    </div>
  )
}

function RoundRow({
  round,
  open,
  onToggle,
  draft,
  env,
  overrides,
  overridden,
  onOverride,
  onJump,
  onApply,
}: {
  round: Round
  open: boolean
  onToggle: () => void
  draft: Policy
  env: SimEnv
  /** The tenant's overruled expectations, so the preview grades the same deck. */
  overrides: Record<string, Round['want']>
  overridden: boolean
  onOverride: (want: Round['want'] | null) => void
  onJump: (i: number) => void
  onApply: (fix: ProposedFix) => void
}) {
  const fix = useMemo(() => proposeFix(round, draft), [round, draft])

  /* What the fix would DO, computed before it is applied: the sweep and the
     deck, run again over the policy the fix would produce. This is the part
     that makes the proposal something you can judge rather than trust. */
  const preview = useMemo(() => {
    if (!fix) return null
    const fixed = { ...draft, rules: applyFix(draft.rules, fix) }
    const before = sweep(draft, env, 570)
    const afterFix = sweep(fixed, env, 570)
    const mv = compare(before, afterFix)
    /* With the tenant's overrides, exactly as the headline grade is.

       Without them the preview graded a different deck from the one the pip
       reports: a tenant that has overruled an expectation would be told
       "Break-in test → B" and then watch applying the fix produce an A, or the
       reverse. A preview whose number does not match what applying it does is
       worse than no preview, because it is the number people act on. */
    const g = runGauntlet(fixed, env, overrides)
    return { mv, grade: g.grade, breaches: g.breaches }
  }, [fix, draft, env, overrides])

  const c = round.challenge
  return (
    <div className={`bb__round is-${round.outcome}`}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <i aria-hidden />
        <span>
          <b>{c.name}</b>
          <em>
            {round.user.name.split(' ')[0]} · {shortPlace(c.place)} · {shortDevice(c.device)}
            {overridden ? ' · expectation overruled' : ''}
          </em>
        </span>
        <span className="bb__outcome">
          {OUTCOME_LABEL[round.outcome]}
          <ChevronDown size={12} strokeWidth={2} aria-hidden style={{ marginLeft: 4, transform: open ? 'rotate(180deg)' : undefined, verticalAlign: -2 }} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="bb__roundbody" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
            <p>{c.story}</p>
            <div className="bb__wantgot">
              <span>Should be</span>
              <span className={`bb__decision is-${TONE[round.want]}`}>{DECISION_SHORT[round.want]}</span>
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
              <span>Was</span>
              <span className={`bb__decision is-${TONE[round.decision]}`}>{DECISION_SHORT[round.decision]}</span>
            </div>
            <p>
              {round.hitIndex === null ? (
                'No rule matched — the default decided.'
              ) : (
                <>
                  Decided by rule {round.hitIndex + 1}, <b>{round.hitName}</b>.{' '}
                  <button type="button" style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--text-link)', cursor: 'pointer' }} onClick={() => onJump(round.hitIndex!)}>
                    Open it →
                  </button>
                </>
              )}
            </p>

            {fix && preview && (
              <div className="bb__fix">
                <b>{fix.headline}</b>
                <p>{fix.why}</p>
                {fix.placement && <p>{fix.placement}</p>}
                <div className="bb__fixpreview" aria-label="What applying this would change">
                  <span>
                    Break-in test <b>{preview.breaches === 0 ? `→ ${preview.grade}, nothing through` : `→ ${preview.grade}, ${preview.breaches} through`}</b>
                  </span>
                  <span>
                    Situations that get stricter <b>{preview.mv.stricter.toLocaleString()}</b>
                  </span>
                  <span>
                    Situations that get looser <b>{preview.mv.looser.toLocaleString()}</b>
                  </span>
                </div>
                <div className="bb__fixacts">
                  <Button size="sm" variant="brand" onClick={() => onApply(fix)}>
                    {fix.kind === 'insert' ? 'Add this rule' : 'Change that rule'}
                  </Button>
                </div>
              </div>
            )}

            <div className="bb__roundacts">
              {round.outcome !== 'held' && !overridden && (
                <Button size="sm" variant="ghost" onClick={() => onOverride(round.decision)}>
                  Accept this outcome instead
                </Button>
              )}
              {overridden && (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onOverride(null)}>
                  Restore the deck’s expectation
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
