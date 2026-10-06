import { motion } from 'motion/react'
import { useContext } from 'react'
import { ArrowUpRight, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { checkPhase, rulePhase, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { CheckBody, CheckNote, Mark, NoteLines, Num, Poke } from './focus-parts'
import { EASE_OUT, LitCtx, viaOf } from './focus-shared'

/* A rule of the policy that applies, read as its own moment (FocusLayout.tsx):
   its checks arrive one by one, each mark landing as the engine finds it; the
   first that fails ends the rule (the ones after it never read, said so);
   the rule that matches says what it then does — the Then word in the
   decision's colour, and a rule that matches to deny wears the deny tone all
   through, its ✓ in a red ring, never green, the message it refuses with
   under Then. The last row — "Nothing else matched" — is locked: it always
   matches when nothing above it did. "Open rule ↗" opens it in the editor. */

export function RuleMoment({
  plan,
  r,
  s,
  landed,
  animate,
  focused,
  first,
  denyMessage = '',
  pulse = false,
  onOpen,
}: {
  plan: EngineRun
  r: EngineRule
  s: number
  landed: boolean
  animate: boolean
  focused: boolean
  first: string
  /** The message a Deny refuses with (the screens'), shown under Then on a rule that matches to deny. */
  denyMessage?: string
  /** The verdict is being reached from this rule: its Then row says so, once. */
  pulse?: boolean
  /** Open this rule in the policy editor (absent: no decider). */
  onOpen?: () => void
}) {
  const n = r.index === null ? null : r.index + 1
  const count = plan.rules.filter((x) => x.index !== null).length
  const result = traceResult(r, s)
  const phase = rulePhase(r, s)
  const settled = phase === 'settled' || result === 'folded' || result === 'missed' || landed
  const rowsRead = r.checks.slice(0, r.checked).map((c, k) => ({ c, k, phase: landed ? ('settled' as const) : checkPhase(r, k, s) }))
  const read = rowsRead.filter((x) => x.phase !== 'hidden')
  const rowWorking = read.some((x) => x.phase === 'working')
  const unread = settled ? r.checks.slice(r.checked) : []
  const matched = result === 'matched'
  const failed = result === 'missed' || result === 'folded'
  const unknown = result === 'unknown' || result === 'possible'
  const working = !landed && (result === 'reading' || result === 'waiting')
  const deny = r.decision === 'deny'
  const tone = matched ? (deny ? 'negative' : 'positive') : failed ? 'fail' : unknown ? 'notice' : r.state === 'off' ? 'off' : working ? 'working' : ''
  const mark =
    working && !rowWorking ? (
      <Spinner />
    ) : matched ? (
      <Mark status="pass" big deny={deny} label={deny ? 'Applies' : 'Matches'} pop={animate && focused} />
    ) : failed ? (
      <Mark status="fail" big label="No match" pop={animate && focused} />
    ) : unknown ? (
      <Mark status="unknown" big pop={animate && focused} />
    ) : r.state === 'off' && settled ? (
      <span className="rl-focus__offword">Off</span>
    ) : null
  const then = DECISION_WORDS[r.decision]
  /* The later rules that also apply to this person, said on the rule that decided, from the beat the engine says it. */
  const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
  const isLanding = plan.landing !== null && plan.rules[plan.landing]?.id === r.id
  const clashes = isLanding && (landed || (deciding >= 0 && s >= deciding)) ? (plan.conflicts?.rules ?? []) : []
  const lit = useContext(LitCtx)
  return (
    <div className={`rl-focus__card is-rule${tone ? ` is-${tone}` : ''}${lit === `rule:${r.id}` ? ' is-lit' : ''}`} data-card data-node={r.node}>
      <header className="rl-focus__head">
        <span className={`rl-focus__tile is-num${tone ? ` is-${tone}` : ''}`}>
          <Num n={n} />
        </span>
        <span className="rl-focus__heading">
          <span className="rl-focus__kicker">{n === null ? 'Last rule' : `Rule ${n} of ${count}`}</span>
          <h3 className="rl-focus__title" title={r.name}>
            {r.name}
          </h3>
        </span>
        {mark}
        {onOpen && focused && (
          <button type="button" className="rl-focus__openrule" onClick={onOpen}>
            Open rule
            <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </header>
      <p className="rl-focus__sub">{n === null ? 'Matches when no rule above it did' : plan.decider ? `In ${plan.decider.name}` : ''}</p>
      {(read.length > 0 || unread.length > 0) && (
        <ul className="rl-focus__checks">
          {read.map(({ c, k, phase: ph }) => {
            const w = ph === 'working'
            const body = (chev: boolean) => <CheckBody word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, w, r.via)} need={c.requirement} status={c.status} working={w} label={c.line || undefined} pop={animate && focused} chevron={chev} />
            return (
              <motion.li
                key={c.key || k}
                className={`rl-focus__check is-${w ? 'working' : c.status}${lit === `check:${r.id}:${c.category}` ? ' is-lit' : ''}`}
                data-check={c.category}
                initial={animate && focused ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                {w ? (
                  <span className="rl-focus__crow">{body(false)}</span>
                ) : (
                  <Poke id={`${r.node}:${c.key || k}`} className="rl-focus__crow has-chev" label={`${c.word}: how it was read`} note={<CheckNote c={c} />}>
                    {body(true)}
                  </Poke>
                )}
              </motion.li>
            )
          })}
          {unread.map((c, k) => (
            <li key={`unread:${c.key || k}`} className="rl-focus__check is-unread">
              <span className="rl-focus__crow">
                <CheckBody word={c.word} fact="Not checked" need={c.requirement} status="quiet" working={false} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {(settled || matched) && (
        <motion.div
          className={`rl-focus__then${matched ? ` is-${deny ? 'negative' : 'positive'}` : unknown ? ' is-notice' : ' is-quiet'}${pulse ? ' is-pulse' : ''}`}
          initial={animate && focused ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
        >
          <p className="rl-focus__thenrow">
            <span className="rl-focus__cword">Then</span>
            <span className="rl-focus__thenword">{r.index === null && r.state === 'possible' ? `If not · ${then}` : then}</span>
            {!matched && <span className="rl-focus__thenquiet">{r.state === 'off' ? 'switched off · passed over' : unknown ? "can't tell · read on" : 'not used'}</span>}
          </p>
          {matched && deny && denyMessage && (
            <p className="rl-focus__deny rl-focus__thendeny" title={denyMessage}>
              “{denyMessage}”
            </p>
          )}
        </motion.div>
      )}
      {clashes.map((c) => (
        <div key={c.ruleId} className={`rl-focus__clash${c.kind === 'conflict' ? ' is-conflict' : ''}`}>
          <Poke
            id={`clash:${c.ruleId}`}
            className="rl-focus__clashbtn"
            label={`Rule ${c.number} also applies to ${first}. Why`}
            note={<NoteLines lines={[`${c.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first} ${c.via.say}`.trim(), c.notUsed, `Then ${c.ask.words}`]} fix={c.fix ? `${c.fix}${c.caution ? `. ${c.caution}` : ''}` : undefined} />}
          >
            {c.kind === 'conflict' && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
            <span>
              Rule {c.number} {c.match === 'unknown' ? 'might apply' : 'also applies'} to {first}
              {c.via.say ? ` · ${c.via.say}` : ''}
            </span>
          </Poke>
        </div>
      ))}
    </div>
  )
}
