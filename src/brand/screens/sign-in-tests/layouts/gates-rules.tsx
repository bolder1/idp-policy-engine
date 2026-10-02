import { motion } from 'motion/react'
import { Lock, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { RuleConflict } from '../conflicts'
import { checkPhase, type EngineRule, type EngineRun } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { RULE_W, TALL, type GatesGeo } from './gates-geometry'
import { noteDomId, stileState, useGatesNote, useWhoIn, viaOf, type StileState } from './gates-model'
import { CheckBody, CheckParts, GatesMark, GatesNote, NoteLines } from './gates-note'

/* -----------------------------------------------------------------------------
   The rule turnstiles (GatesLayout.tsx): the policy that let the token in,
   its rules in order, one lane each. A turnstile's checks are lights on its
   frame (Who, Network, Device …): they scan one by one, blue, then ✓ green or
   ✕ red. A red light keeps the turnstile locked and the token sidesteps to
   the next lane; the first whose lights are all green turns. The locked
   catch-all, "Nothing else matched", stands last.
   -------------------------------------------------------------------------- */


/** The turnstile from above: a hub, three arms, its ring; it turns a third as it lets the token through. */
export function StileGlyph({ state, tall, animate }: { state: StileState; tall: boolean; animate: boolean }) {
  const size = tall ? 28 : 22
  return (
    <motion.span
      className={`rl-gates__stile is-${state}`}
      style={{ width: size, height: size, top: tall ? 58 - size / 2 : 22 - size / 2 }}
      initial={false}
      animate={{ rotate: state === 'open' ? 120 : 0 }}
      transition={{ duration: animate ? 0.6 : 0, ease: [0.3, 0, 0.2, 1] }}
      aria-hidden
    >
      <svg viewBox="0 0 28 28" width={size} height={size}>
        <circle cx="14" cy="14" r="12.5" className="rl-gates__stilering" />
        <path d="M14 14 L14 3.5 M14 14 L4.9 19.25 M14 14 L23.1 19.25" className="rl-gates__stilearms" />
        <circle cx="14" cy="14" r="2.6" className="rl-gates__stilehub" />
      </svg>
    </motion.span>
  )
}

/* One light: a check, its mark once read. Pressed, how it was read. */
function Light({ r, k, v }: { r: EngineRule; k: number; v: number }) {
  const c = r.checks[k]
  const id = `${r.node}:${c.key || k}`
  const { isOpen, toggle } = useGatesNote(id)
  const ph = k < r.checked ? checkPhase(r, k, v) : 'hidden'
  const read = k < r.checked
  const settled = ph === 'settled'
  const skip = !read && r.visited && r.endAt >= 0 && v >= r.endAt
  const cls = ph === 'working' ? 'is-working' : settled ? `is-${c.status}` : skip ? 'is-skip' : 'is-idle'
  return (
    <span className="rl-gates__lightwrap">
      <button
        type="button"
        className={`rl-gates__light ${cls}${isOpen ? ' is-pressed' : ''}`}
        data-card
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteDomId(id) : undefined}
        aria-label={`${c.word}: ${settled ? (c.line || c.status) : skip ? 'not checked' : 'not read yet'}. How it was read`}
        onClick={(e) => toggle(e.currentTarget)}
      >
        {ph === 'working' ? <Spinner small /> : settled ? <GatesMark status={c.status} size={11} /> : skip ? <GatesMark status="skip" size={11} /> : <span className="rl-gates__lightdot" />}
        <span>{c.word}</span>
      </button>
      {isOpen && (
        <GatesNote id={id} style={{ left: 0, top: 22 }} wide>
          {settled ? <CheckParts c={c} via={r.via} /> : <NoteLines lines={[skip ? 'Not checked: an earlier check ended the rule' : 'Not read yet', `${c.word} needs ${c.requirement}`]} />}
        </GatesNote>
      )}
    </span>
  )
}

function StileLane({ r, i, geo, state, v, animate, first, matchedFirst, clash }: { r: EngineRule; i: number; geo: GatesGeo; state: StileState; v: number; animate: boolean; first: string; matchedFirst: string; clash?: RuleConflict }) {
  const id = r.node
  const { isOpen, toggle } = useGatesNote(id)
  const whoIn = useWhoIn()
  const h = geo.ruleHs[i]
  const tall = h >= TALL
  const n = r.index === null ? null : r.index + 1
  const then = DECISION_WORDS[r.decision]
  const conflict = state === 'also' && clash?.kind === 'conflict'
  const read = r.checks.slice(0, r.checked)
  let sub = ''
  if (r.index === null) sub = state === 'possible' ? `If not · ${then}` : state === 'open' ? `Then ${then}` : ''
  else if (state === 'off') sub = 'Switched off'
  else if (state === 'also' && clash) sub = `${clash.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first} · not used`
  const showLights = tall && r.index !== null && r.checks.length > 0 && state !== 'also' && state !== 'off'
  const note =
    state === 'also' && clash ? (
      <NoteLines lines={[`Also applies to ${first} ${clash.via.say}`.trim(), clash.notUsed, `Then ${then}`]} fix={clash.fix ? `${clash.fix}${clash.caution ? `. ${clash.caution}` : ''}` : undefined} />
    ) : read.length > 0 ? (
      <>
        <ul className="rl-gates__parts">
          {read.map((c, k) => (
            <li key={c.key || k} className={`rl-gates__part is-${c.status}`}>
              <CheckBody word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, r.via, whoIn)} need={c.requirement} status={checkPhase(r, k, v) === 'settled' ? c.status : 'skip'} />
            </li>
          ))}
        </ul>
        <p className="rl-gates__notethen">
          <span className="rl-gates__cword">Then</span>
          <span className="rl-gates__cfact">{then}</span>
          <span className="rl-gates__cneed">{state === 'open' ? '· lets them through' : state === 'unknown' ? "· can't tell, read on" : state === 'locked' ? "· didn't match, so not used" : ''}</span>
        </p>
      </>
    ) : (
      <NoteLines lines={[r.index === null ? (state === 'open' ? `No rule above matched: ${then}` : `Reached only if no rule above matches: ${then}`) : state === 'off' ? 'Switched off: passed, nothing asked' : `Not read: ${matchedFirst}`, r.index !== null ? `Then ${then}` : '']} />
    )
  return (
    <div className={`rl-gates__lane is-${state === 'reading' ? 'asking' : state}${tall ? ' is-tall' : ' is-slim'}${conflict ? ' is-conflict' : ''}${isOpen ? ' is-noted' : ''}`} style={{ top: geo.ruleTops[i], height: h }} data-node={id}>
      <button
        type="button"
        className="rl-gates__lanebtn"
        data-card
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteDomId(id) : undefined}
        aria-label={`${n === null ? 'Last rule' : `Rule ${n}`}, ${r.name}: ${state}. Its checks`}
        onClick={(e) => toggle(e.currentTarget)}
      >
        <StileGlyph state={state} tall={tall} animate={animate} />
        <span className="rl-gates__lanetext">
          <span className="rl-gates__lanehead">
            <span className="rl-gates__num">{n === null ? <Lock size={11} strokeWidth={2.2} /> : n}</span>
            <span className="rl-gates__name" title={r.name}>
              {r.name}
            </span>
            {state === 'reading' && <Spinner small />}
          </span>
          {tall && !showLights && (
            <span className="rl-gates__lanesub">
              {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
              {sub}
            </span>
          )}
        </span>
      </button>
      {showLights && (
        <span className="rl-gates__lights">
          {r.checks.map((c, k) => (
            <Light key={c.key || k} r={r} k={k} v={v} />
          ))}
        </span>
      )}
      {isOpen && (
        <GatesNote id={id} style={{ left: 44, top: h - 6 }} wide>
          {note}
        </GatesNote>
      )}
    </div>
  )
}

export function RuleStiles({ plan, v, geo, landed, animate, first, clashes }: { plan: EngineRun; v: number; geo: GatesGeo; landed: boolean; animate: boolean; first: string; clashes: ReadonlyMap<string, RuleConflict> }) {
  if (!geo.hasRules) return null
  const height = geo.ruleTops[geo.ruleTops.length - 1] + geo.ruleHs[geo.ruleHs.length - 1]
  const L = plan.landing
  const landing = L !== null ? plan.rules[L] : undefined
  const matchedFirst = landing && landing.index !== null ? `rule ${landing.index + 1} matched first` : 'the walk stopped before it'
  const head = `Rules in ${plan.decider?.name ?? 'the policy'}`
  return (
    <motion.section
      className="rl-gates__bank is-rule"
      aria-label={head}
      style={{ left: geo.ruleX, width: RULE_W, height }}
      initial={animate ? { opacity: 0, x: -12 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: animate ? 0.36 : 0, ease: [0.2, 0, 0, 1] }}
    >
      <h3 className="rl-gates__bankhead" title={head}>
        <span>{head}</span>
        <span className="rl-gates__count">{plan.rules.filter((r) => r.index !== null).length}</span>
      </h3>
      {plan.rules.map((r, i) => (
        <StileLane
          key={r.id}
          r={r}
          i={i}
          geo={geo}
          state={stileState(r, v, landed, L !== null && i > L && clashes.has(r.id))}
          v={v}
          animate={animate}
          first={first}
          matchedFirst={matchedFirst}
          clash={L !== null && i > L ? clashes.get(r.id) : undefined}
        />
      ))}
    </motion.section>
  )
}
