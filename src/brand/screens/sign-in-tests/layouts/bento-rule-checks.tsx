import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Lock, Plus } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { FormField } from '../../testing/sign-in-form'
import { checkPhase, type CheckRow, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { stepMs } from '../use-engine-run'
import type { CheckRef, Tone } from './bento-model'
import { Mark, Num, Skel } from './bento-parts'
import { EASE, featuredRule } from './bento-words'
import type { Size } from './bento-who-policy'

/* -----------------------------------------------------------------------------
   Two more of Bento's tiles (BentoLayout.tsx):
     Rule    the deciding policy's rules in order, read top down: each one the
             engine passes over is one line with the check it failed on (✕),
             the one that decides held open as the builder writes it — who,
             if, then — its marks landing as the engine reads them; those
             after it quiet
     Checks  the checks that decided it, the sign-in's fact against what the
             rule needs, ✓ ✕ ? as each lands
   -------------------------------------------------------------------------- */

const MAX_RULES = 5


const ruleNo = (r: Pick<EngineRule, 'index'>) => (r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`)

function missLine(r: EngineRule): string {
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return c ? c.say || c.line : r.miss || 'No match'
}

const toneWord = (d: keyof typeof DECISION_WORDS): Tone => (d === 'deny' ? 'negative' : 'positive')

export interface RuleProps {
  size: Size
  plan: EngineRun
  s: number
  landed: boolean
  open: boolean
  tone: Tone
  animate: boolean
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
}

export function RuleBody(p: RuleProps) {
  const { plan, s } = p
  const rules = plan.rules
  const feat = featuredRule(plan)
  const land = plan.landing ?? rules.length - 1
  const policyId = plan.decider?.id ?? ''
  /* Later rules that also apply to this person with another answer: amber once the run lands, as the policy tile marks a policy that also covers them. */
  const alsoRules = new Set((plan.conflicts?.rules ?? []).filter((x) => x.kind === 'conflict').map((x) => x.ruleId))
  if (p.size === 'mini') {
    const r = rules[feat ?? land]
    const res = r ? traceResult(r, s) : 'waiting'
    return (
      <div className="rl-bento__mini">
        {r && p.open ? <Num n={r.index === null ? null : r.index + 1} tone={res === 'matched' ? 'positive' : undefined} /> : <Skel w="18px" h={18} />}
        <span className="rl-bento__ell">{r && p.open ? r.name : 'Reading the rules'}</span>
        {res === 'matched' && <Mark status="pass" label="Matches" />}
        {res === 'unknown' && <Mark status="unknown" />}
      </div>
    )
  }
  const full = p.size === 'open'
  const max = full ? 12 : MAX_RULES
  const start = rules.length <= max ? 0 : Math.min(Math.max(0, land - 2), rules.length - max)
  const shown = rules.slice(start, start + max)
  const below = rules.length - start - shown.length
  return (
    <>
      {start > 0 && <p className="rl-bento__more">{start} above</p>}
      {full && (
        <div className="rl-bento__witcols" aria-hidden>
          <span />
          <span>The rule needs</span>
          <span>The sign-in shows</span>
        </div>
      )}
      <ol className="rl-bento__rules">
        {shown.map((r, j) => {
          const i = start + j
          const res = traceResult(r, s)
          const featured = i === feat
          const lastRow = r.index === null
          const decides = p.landed && i === plan.landing && plan.outcome.status === 'decided'
          /* A rule that matches into a Deny is drawn in the Deny's tone: never green and red on one path. */
          const denies = res === 'matched' && !lastRow && r.decision === 'deny'
          const blank = !p.open
          const reading = res === 'reading'
          const pips = r.checks.slice(0, r.checked).map((c, k) => ({ c, k, ph: checkPhase(r, k, s) })).filter((x) => x.ph !== 'hidden')
          const current = pips.find((x) => x.ph === 'working')
          /* A rule opens as the engine reads it and folds to its failing check as the engine leaves it; the one that decides stays open. */
          const alsoHere = p.landed && res === 'not-reached' && alsoRules.has(r.id)
          const showWit = full ? r.visited && !lastRow && res !== 'waiting' : !blank && (reading || res === 'missed' || (featured && (res === 'matched' || res === 'unknown')))
          const cls = [
            'rl-bento__rule',
            showWit ? 'is-featured' : '',
            reading ? 'is-working' : '',
            res === 'matched' && !lastRow ? `is-pass${denies ? ' is-deny' : ''}` : '',
            res === 'missed' || res === 'folded' ? 'is-miss' : '',
            res === 'unknown' ? 'is-unknown' : '',
            alsoHere ? 'is-also' : res === 'not-reached' || res === 'off' || res === 'possible' || (p.landed && res === 'waiting') ? 'is-dim' : '',
            decides && lastRow ? `is-last is-${p.tone}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          const word =
            alsoHere ? 'Also applies'
            : decides && lastRow ? DECISION_WORDS[r.decision]
            : res === 'matched' ? 'Matches'
            : res === 'missed' || res === 'folded' ? 'No match'
            : res === 'unknown' ? 'Can’t tell'
            : res === 'off' ? 'Switched off'
            : res === 'not-reached' ? 'Not reached'
            : res === 'possible' ? 'If not'
            : decides && lastRow ? DECISION_WORDS[r.decision]
            : ''
          const sub =
            blank ? ''
            : (res === 'folded' && !(full && showWit)) || (res === 'missed' && !showWit) ? missLine(r)
            : showWit ? ''
            : reading ? (current ? `Reading ${current.c.word.toLowerCase()}` : 'Reading')
            : res === 'unknown' && !featured ? `Can’t tell: ${(r.checks.find((c) => c.status === 'unknown')?.word ?? 'a fact').toLowerCase()} not stated`
            : ''
          return (
            <li key={r.id} className={cls} data-node={r.node}>
              <div className="rl-bento__rulehead">
                <Num n={lastRow ? null : r.index! + 1} tone={res === 'matched' && !lastRow ? (denies ? 'negative' : 'positive') : reading ? 'working' : res === 'missed' || res === 'folded' ? 'negative' : undefined} />
                <span className="rl-bento__rowtext">
                  <span className={`rl-bento__rowname${blank ? ' is-blank' : ''}`} data-link={featured || (decides && lastRow) ? 'rule' : undefined} title={r.name}>
                    {r.name}
                  </span>
                  {sub && <span className={`rl-bento__rowsub${res === 'missed' || res === 'folded' ? ' is-miss' : ''}`}>{sub}</span>}
                </span>
                {!showWit && pips.length > 0 && (
                  <span className="rl-bento__pips">
                    {pips.map(({ c, k, ph }) => (
                      <Mark key={c.key || k} status={c.status} working={ph === 'working'} label={`${c.word}: ${c.line || c.status}`} pop={p.animate} />
                    ))}
                  </span>
                )}
                {word && <span className={`rl-bento__word${alsoHere ? ' is-notice' : decides && lastRow ? ` is-${p.tone}` : res === 'matched' ? (denies ? ' is-negative' : ' is-positive') : res === 'unknown' ? ' is-notice' : ''}`}>{word}</span>}
                {full && !lastRow && (
                  <button type="button" className="rl-bento__icon" aria-label={`Open ${ruleNo(r).toLowerCase()}`} title="Open rule" onClick={() => p.onOpenRule(policyId, r.id)}>
                    <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </div>
              <AnimatePresence initial={false}>
                {showWit && (
                  <motion.div
                    key="wit"
                    className="rl-bento__witwrap"
                    initial={p.animate ? { height: 0, opacity: 0 } : false}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={p.animate ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0 } }}
                    transition={{ duration: p.animate ? Math.min(0.42, Math.max(0.2, stepMs(plan, s) / 1000)) : 0, ease: EASE }}
                  >
                    <Wit r={r} s={s} blank={blank} animate={p.animate} facts={full} />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ol>
      {below > 0 && <p className="rl-bento__more">{below} more</p>}
      {full && plan.decider && (
        <button type="button" className="rl-bento__btn is-quiet" onClick={() => p.onOpenPolicy(plan.decider!.id)}>
          Open {plan.decider.name}
        </button>
      )}
    </>
  )
}

/* The rule as the builder writes it: who, if (and), then — each row the rule's
   requirement, its mark landing as the engine reads it. */
function Wit({ r, s, blank, animate, facts = false }: { r: EngineRule; s: number; blank: boolean; animate: boolean; facts?: boolean }) {
  const res = traceResult(r, s)
  const thenOn = res === 'matched' || res === 'unknown'
  let ifs = 0
  return (
    <div className={`rl-bento__wit${facts ? ' has-facts' : ''}`}>
      {r.checks.map((c, k) => {
        const ph = k < r.checked ? checkPhase(r, k, s) : 'hidden'
        const label = c.category === 'who' ? 'Who' : ifs++ === 0 ? 'If' : 'And'
        return (
          <div key={c.key || k} className={`rl-bento__witrow${ph === 'working' ? ' is-working' : ''}${k >= r.checked && !blank ? ' is-unread' : ''}`}>
            <span className="rl-bento__witlabel">{label}</span>
            <span className="rl-bento__witreq">
              {blank ? <Skel w="60%" /> : c.category === 'who' ? c.requirement : `${c.word} · ${c.requirement}`}
            </span>
            {facts && <span className="rl-bento__witfact">{ph === 'settled' ? factOf(c, r) : k >= r.checked ? 'Not checked' : ''}</span>}
            {ph === 'hidden' ? <span className="rl-bento__markslot" /> : <Mark status={c.status} working={ph === 'working'} pop={animate} label={c.line || c.say} />}
          </div>
        )
      })}
      <div className="rl-bento__witrow is-then">
        <span className="rl-bento__witlabel">Then</span>
        <span className={`rl-bento__witreq${thenOn ? ` is-${toneWord(r.decision)}` : ''}`}>{blank ? <Skel w="40%" /> : DECISION_WORDS[r.decision]}</span>
        {facts && <span className="rl-bento__witfact" />}
        <span className="rl-bento__markslot" />
      </div>
    </div>
  )
}

// --- Checks ------------------------------------------------------------------------------

export interface ChecksProps {
  size: Size
  plan: EngineRun
  s: number
  refs: CheckRef[]
  kind: 'match' | 'unknown' | 'misses' | 'none'
  /** The engine has reached the checks: their words may show. */
  reached: boolean
  /** A short canvas: one line a fact from two checks up. */
  tight?: boolean
  animate: boolean
  onAdd: (f: FormField) => void
}


/** The fact, as the sign-in showed it: a who that let them in says how. */
function factOf(c: CheckRow, r: EngineRule): string {
  if (c.missing) return 'Not stated'
  if (c.category === 'who') {
    if (c.status === 'pass' && r.via?.matches) return `${c.value} · ${r.via.say}`
    return c.line || c.value
  }
  return c.value
}

export function ChecksBody(p: ChecksProps) {
  const { plan, s } = p
  if (p.size === 'mini') {
    return (
      <div className="rl-bento__mini is-pips">
        {p.refs.map(({ rule, check }) => {
          const r = plan.rules[rule]
          const c = r?.checks[check]
          if (!r || !c) return null
          const ph = checkPhase(r, check, s)
          return (
            <span key={`${rule}:${check}`} className="rl-bento__pip">
              {c.word}
              {ph === 'hidden' ? <span className="rl-bento__markslot" /> : <Mark status={c.status} working={ph === 'working'} />}
            </span>
          )
        })}
      </div>
    )
  }
  const full = p.size === 'open'
  /* Where nothing matched: the conditions that failed before the groups that left them out, as many as the tile holds. */
  const refs =
    p.kind === 'misses'
      ? [...p.refs].sort((a, b) => Number(plan.rules[a.rule]?.checks[a.check]?.category === 'who') - Number(plan.rules[b.rule]?.checks[b.check]?.category === 'who')).slice(0, full ? undefined : 2)
      : p.refs
  const more = p.refs.length - refs.length
  return (
    <ul className={`rl-bento__checks${!full && refs.length > 2 ? ' is-dense' : ''}${p.kind === 'match' && plan.rules[refs[0]?.rule ?? -1]?.decision === 'deny' ? ' is-deny' : ''}`}>
      {refs.map(({ rule, check }) => {
        const r = plan.rules[rule]
        const c = r?.checks[check]
        if (!r || !c) return null
        const ph = checkPhase(r, check, s)
        const word = p.kind === 'misses' ? ruleNo(r) : c.word
        const subs = full ? c.subs.filter((x) => x.label || x.actual || x.required) : []
        return (
          <li key={`${rule}:${check}`} className={`rl-bento__check is-${ph === 'settled' ? c.status : ph}`} data-link="checks">
            <span className="rl-bento__checkword">{p.reached ? word : <Skel w="36px" />}</span>
            {ph === 'hidden' ? (
              <span className="rl-bento__checkvals">
                <Skel w="78%" />
                <Skel w="52%" />
              </span>
            ) : (
              <span className="rl-bento__checkvals">
                <span className="rl-bento__fact" title={factOf(c, r)}>
                  {factOf(c, r)}
                  {c.missing && ph === 'settled' && (
                    <button type="button" className="rl-bento__add" onClick={() => p.onAdd(c.missing!)}>
                      <Plus size={12} strokeWidth={2.4} aria-hidden />
                      Add
                    </button>
                  )}
                </span>
                <span className="rl-bento__needs" title={c.requirement}>
                  needs {c.requirement}
                </span>
              </span>
            )}
            {ph === 'hidden' ? <span className="rl-bento__markslot" /> : <Mark status={c.status} working={ph === 'working'} pop={p.animate} big label={c.line || c.say} />}
            {subs.length > 1 && ph === 'settled' && (
              <ul className="rl-bento__subs">
                {subs.map((x) => (
                  <li key={x.key}>
                    <span className="rl-bento__sublabel">{x.label}</span>
                    <span className="rl-bento__subval">{x.actual || 'Not stated'}{x.required ? ` · needs ${x.required}` : ''}</span>
                    <Mark status={x.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
      {more > 0 && <li className="rl-bento__more">{more} more in the rules</li>}
      {p.refs.length === 0 && (
        <li className="rl-bento__check is-none">
          <Lock size={12} strokeWidth={2.4} aria-hidden />
          No check decided it
        </li>
      )}
    </ul>
  )
}
