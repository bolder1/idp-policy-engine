import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Clock,
  Flame,
  Minus,
  MonitorSmartphone,
  RotateCcw,
  Swords,
  Target,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'

import { Button, Counter, DecisionChip, Modal, TipDot } from '../kit'
import { predicateSentence } from './predicate-prose'
import { useNameLookup } from '../store'
import type { Policy } from '../data'
import { useBrand } from '../store'
import {
  DECK,
  EXPECT_LABEL,
  OUTCOME_LABEL,
  proposeFix,
  runGauntlet,
  traceFor,
  userOf,
  type Challenge,
  type Expect,
  type GauntletResult,
  type Outcome,
  type ProposedFix,
  type Round,
} from './gauntlet'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   The Gauntlet, on screen.

   The reason to make this a game rather than a table is that nobody reads a
   table of thirteen passing rows. A run has a beat — cards deal one at a time,
   the shield holds or it does not, the streak breaks — and the thing you
   remember afterwards is the card that got through, which is precisely the one
   thing worth remembering.

   Where it deliberately refuses to behave like a game:

   · No points, no XP, no level. The HUD counts cards, and every number on it is
     recomputed from the policy — there is nothing to accumulate and nothing to
     lose by rerunning.
   · The grade is shown with its reason attached, always. A letter alone invites
     an administrator to optimise the letter.
   · A failed card is not a taunt. It names the rule that produced the decision
     and offers to open it, because the only useful thing a failure can do is
     take you to the fix.
   -------------------------------------------------------------------------- */

const OUTCOME_ORDER: Outcome[] = ['breach', 'lockout', 'friction', 'held']

const OUTCOME_BLURB: Record<Outcome, string> = {
  breach: 'Weaker treatment than the card asks for. This is the direction that matters.',
  lockout: 'An ordinary sign-in was refused outright.',
  friction: 'Stricter than asked — a cost, not a hole.',
  held: 'Exactly the treatment the card expects.',
}

const GRADE_TONE: Record<string, string> = { A: 'good', B: 'good', C: 'warn', D: 'bad', F: 'bad' }

/* --- The dial ----------------------------------------------------------------
   A ring rather than a bar because the ring reads as a whole — the gap in it is
   the part that got through, and a gap in a circle is legible at a glance in a
   way that a bar's missing tail is not. */
function Dial({ result, running }: { result: GauntletResult | null; running: boolean }) {
  const reduce = useReducedMotion()
  const total = DECK.length
  const held = result?.held ?? 0
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <div className={`bgt__dial ${result ? `is-${GRADE_TONE[result.grade]}` : ''}`}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle className="bgt__dialtrack" cx="64" cy="64" r={R} />
        <motion.circle
          className="bgt__dialfill"
          cx="64"
          cy="64"
          r={R}
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - (held / total) * C }}
          transition={{ type: reduce ? 'tween' : 'spring', duration: reduce ? 0 : undefined, stiffness: 90, damping: 20 }}
        />
      </svg>
      <div className="bgt__dialtext">
        {result ? (
          <>
            <strong>{result.grade}</strong>
            <em>
              {held}/{total} held
            </em>
          </>
        ) : (
          <>
            <strong className="bgt__dialidle">{running ? '…' : total}</strong>
            <em>{running ? 'running' : 'cards ready'}</em>
          </>
        )}
      </div>
    </div>
  )
}

/* --- One card face ------------------------------------------------------------ */

function CardFace({ c, size = 'md' }: { c: Challenge; size?: 'sm' | 'md' }) {
  return (
    <div className={`bgt__face bgt__face--${size} is-${c.kind}`}>
      <span className="bgt__kind">{c.kind === 'threat' ? 'Hostile' : 'Ordinary'}</span>
      <strong className="bgt__cardname">{c.name}</strong>
      {size === 'md' && <p className="bgt__story">{c.story}</p>}
      <ul className="bgt__facts">
        <li>
          <UserRound size={12} strokeWidth={2} aria-hidden />
          {userOf(c.userId).name}
        </li>
        <li>
          <Target size={12} strokeWidth={2} aria-hidden />
          {c.place}
        </li>
        <li>
          <MonitorSmartphone size={12} strokeWidth={2} aria-hidden />
          {c.device}
        </li>
        <li>
          <Clock size={12} strokeWidth={2} aria-hidden />
          {c.at}
        </li>
      </ul>
    </div>
  )
}

/* --- One tile on the board -------------------------------------------------------

   The board replaced three surfaces: a deck you looked at before running, a
   stage that dealt one card at a time, and a list that repeated all thirteen
   afterwards. They were the same thirteen cards in three places. Now the deck
   IS the board and IS the result — a card settles where it already sat, so the
   card you were watching is the card you end up reading. */

function BoardTile({
  challenge,
  round,
  want,
  dealt,
  dimmed,
  selected,
  onSelect,
}: {
  challenge: Challenge
  round: Round | null
  want: Expect
  dealt: boolean
  dimmed: boolean
  selected: boolean
  onSelect: () => void
}) {
  const settled = dealt && round
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`bgt__tile is-${challenge.kind} ${settled ? `is-${round.outcome}` : ''} ${
        settled ? 'is-settled' : ''
      } ${dimmed ? 'is-dim' : ''} ${selected ? 'is-sel' : ''}`}
    >
      <span className="bgt__tilehead">
        <span className="bgt__kind">{challenge.kind === 'threat' ? 'Hostile' : 'Ordinary'}</span>
        {settled && (
          <span className={`bgt__mark is-${round.outcome}`} aria-hidden>
            {round.outcome === 'held' ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={2.8} />}
          </span>
        )}
      </span>

      <strong className="bgt__tilename">{challenge.name}</strong>

      <span className="bgt__tilefoot">
        <span className="bgt__want">wants {EXPECT_LABEL[want]}</span>
        {settled ? (
          <>
            <ChevronRight size={11} strokeWidth={2} aria-hidden />
            <DecisionChip decision={round.decision} size="sm" />
          </>
        ) : (
          <span className="bgt__tilewait" aria-hidden />
        )}
      </span>
    </button>
  )
}

/* --- The card you clicked ---------------------------------------------------- */

function TileDetail({
  round,
  policy,
  env,
  onOverride,
  onJumpToRule,
  onApplyFix,
  onClose,
}: {
  round: Round
  policy: Policy
  env: SimEnv
  onOverride: (id: string, want: Expect) => void
  onJumpToRule?: (index: number) => void
  onApplyFix?: (fix: ProposedFix) => void
  onClose: () => void
}) {
  const c = round.challenge
  const reduce = useReducedMotion()
  const resolve = useNameLookup()
  const trace = useMemo(() => traceFor(policy, c, env), [policy, c, env])
  const fix = useMemo(() => proposeFix(round, policy), [round, policy])
  const self = useRef<HTMLDivElement | null>(null)

  /* The board can be taller than the dialog, so a click near the top would
     otherwise open a panel nobody can see. */
  useEffect(() => {
    self.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [c.id, reduce])

  return (
    <motion.div
      ref={self}
      className={`bgt__detail is-${round.outcome}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <header className="bgt__detailhead">
        <CardFace c={c} />
        <button type="button" className="bgt__detailx" aria-label="Close this card" onClick={onClose}>
          <X size={14} strokeWidth={2} />
        </button>
      </header>

      <p className="bgt__why">
        <strong>Why it expects {EXPECT_LABEL[round.want]}:</strong> {c.why}
      </p>

      <ol className="bgt__trace">
        {trace.steps.map((s) => (
          <li key={s.rule.id} className={`is-${s.kind}`}>
            <span aria-hidden>
              {s.kind === 'hit' ? (
                <Check size={11} strokeWidth={3} />
              ) : s.kind === 'miss' ? (
                <X size={11} strokeWidth={2.6} />
              ) : (
                <Minus size={11} strokeWidth={2.6} />
              )}
            </span>
            <b>
              Rule {s.index + 1} · {s.rule.name}
            </b>
            <em>{s.reason}</em>
          </li>
        ))}
        {trace.steps.length === 0 && <li className="is-miss">This policy has no rules to evaluate.</li>}
      </ol>

      {/* Only offered on a breach. A card that came back stricter than it asked
          for is not closed by adding a rule — an existing one is already too
          broad, and the trace above names it. */}
      {fix && onApplyFix && (
        <div className="bgt__fix">
          <div className="bgt__fixhead">
            <Wrench size={14} strokeWidth={1.9} aria-hidden />
            <strong>Close this with a rule</strong>
          </div>
          <p className="bgt__fixrule">
            <b>{fix.rule.name}</b> — when{' '}
            {predicateSentence(fix.rule.when, resolve)}{' '}
            → <em>{EXPECT_LABEL[round.want]}</em>
          </p>
          <p className="bgt__fixwhy">{fix.why}</p>
          {fix.placement && <p className="bgt__fixwhere">{fix.placement}</p>}
          <Button variant="primary" size="sm" onClick={() => onApplyFix(fix)}>
            {fix.headline}
          </Button>
        </div>
      )}

      <div className="bgt__roundacts">
        {round.hitIndex !== null && onJumpToRule && (
          <Button size="sm" onClick={() => onJumpToRule(round.hitIndex!)}>
            Open rule {round.hitIndex + 1}
          </Button>
        )}
        {/* The expectation belongs to the tenant. Accepting a result is a
            decision worth recording, not a way to cheat the grade — which is
            why the card keeps saying what it originally asked for once you have
            overruled it. */}
        {round.outcome !== 'held' && (
          <button type="button" className="bgt__accept" onClick={() => onOverride(c.id, round.decision)}>
            Accept {EXPECT_LABEL[round.decision]} as correct for this case
          </button>
        )}
        {round.want !== c.want && (
          <button type="button" className="bgt__accept" onClick={() => onOverride(c.id, c.want)}>
            Restore the original expectation ({EXPECT_LABEL[c.want]})
          </button>
        )}
      </div>
    </motion.div>
  )
}

/* --- The dialog --------------------------------------------------------------- */

export function GauntletDialog({
  open,
  policy,
  onClose,
  onJumpToRule,
  onApplyFix,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  onJumpToRule?: (index: number) => void
  /** Lets a failed card be closed from here. Absent in read-only hosts. */
  onApplyFix?: (fix: ProposedFix) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  /* Overrides live in the store, keyed by policy. The toolbar pip renders the
     same grade from the same map, so the letter on the button and the letter in
     this panel cannot disagree. */
  const overrides = store.gauntletOverrides[policy.id] ?? {}
  const [result, setResult] = useState<GauntletResult | null>(null)
  const [dealt, setDealt] = useState(0)
  const [filter, setFilter] = useState<Outcome | 'all'>('all')
  /* One card open at a time. Thirteen accordions is a list again. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /* The run as it stood before the last edit to the policy.

     A fix that closes the card you were looking at can quietly open another —
     inserting a rule changes what every card below it reaches, which is the
     whole hazard of first-match-wins. Showing only "that card is fixed now"
     would be the most misleading true statement this screen could make. */
  const [previous, setPrevious] = useState<GauntletResult | null>(null)

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )

  const run = useCallback(() => {
    setDealt(0)
    setResult(runGauntlet(policy, env, overrides))
  }, [policy, env, overrides])

  /* Any edit to the policy behind this dialog invalidates the run. A board
     still showing yesterday's verdicts over today's rules is the single worst
     thing this screen could do, so the result is cleared rather than dimmed. */
  const policyKey = JSON.stringify(policy.rules)
  useEffect(() => {
    setResult((r) => {
      // Carry the settled run forward as the comparison point, then clear it.
      setPrevious(r)
      return null
    })
    setDealt(0)
  }, [policyKey])

  useEffect(() => {
    if (!open) {
      setResult(null)
      setPrevious(null)
      setDealt(0)
      setFilter('all')
    }
  }, [open])

  /* Dealing is budget-capped the way the Test dialog paces its trace: a fixed
     beat per card would make a longer deck a longer wait for no extra
     information. Reduced motion lands the whole board at once. */
  useEffect(() => {
    if (!result) return
    if (reduce) {
      setDealt(result.rounds.length)
      return
    }
    let n = 0
    const per = Math.min(150, 1800 / result.rounds.length)
    const id = window.setInterval(() => {
      n += 1
      setDealt(n)
      if (n >= result.rounds.length) window.clearInterval(id)
    }, per)
    return () => window.clearInterval(id)
  }, [result, reduce])

  const settled = result ? result.rounds.slice(0, dealt) : []
  const running = result !== null && dealt < result.rounds.length
  const done = result !== null && !running

  const liveCount = (o: Outcome) => settled.filter((r) => r.outcome === o).length
  const overrideCount = Object.keys(overrides).length

  const setOverride = (id: string, want: Expect) => {
    const card = DECK.find((c) => c.id === id)!
    // Agreeing with the shipped expectation clears the override rather than
    // recording it, so the count only ever names decisions actually taken.
    store.setGauntletOverride(policy.id, id, card.want === want ? null : want)

    const next = { ...overrides }
    if (card.want === want) delete next[id]
    else next[id] = want
    // Recomputed here rather than waiting for the store round-trip, so the
    // board updates in the same frame as the click.
    setResult(runGauntlet(policy, env, next))
    setDealt(DECK.length)
  }

  /* A card is looked up by id rather than by position, so filtering can dim
     tiles instead of removing them — the same card stays in the same place all
     the way through a run, which is the only way a board is readable twice. */
  const roundOf = new Map((result?.rounds ?? []).map((r) => [r.challenge.id, r]))
  const dealtIds = new Set(settled.map((r) => r.challenge.id))
  const openRound = selectedId ? roundOf.get(selectedId) : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Policy gauntlet"
      width={980}
      padded={false}
      footer={
        <>
          <span className="bgt__foot">
            {overrideCount > 0
              ? `${overrideCount} expectation${overrideCount === 1 ? '' : 's'} overruled by you.`
              : `${DECK.length} attempts — seven hostile, six ordinary.`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={result ? RotateCcw : Swords} onClick={run}>
            {result ? 'Run again' : 'Run the gauntlet'}
          </Button>
        </>
      }
    >
      <div className="bgt">
        <p className="u-sr-only" aria-live="polite">
          {done && result
            ? `Gauntlet complete. Grade ${result.grade}. ${result.held} of ${DECK.length} held, ${result.breaches} got through, ${result.lockouts} locked out.`
            : ''}
        </p>

        {/* --- HUD ---------------------------------------------------------- */}
        <header className="bgt__hud">
          <Dial result={done ? result : null} running={running} />

          <div className="bgt__hudtext">
            {done && result ? (
              <>
                <h3>
                  Grade {result.grade}
                  {result.streak > 2 && (
                    <span className="bgt__streak">
                      <Flame size={13} strokeWidth={2} aria-hidden /> {result.streak} in a row
                    </span>
                  )}
                </h3>
                <p>{result.gradeReason}</p>
              </>
            ) : running ? (
              <>
                <h3>Dealing…</h3>
                <p>
                  {settled.length} of {DECK.length}
                </p>
              </>
            ) : (
              <>
                <h3>
                  {policy.name}
                  <TipDot
                    label="How the gauntlet is scored"
                    text="Heuristic, not the engine: each card's context maps to condition values through the same fixed table the Test dialog uses. Real: the order, the first-match stop, and the decision. A card's expected treatment is an opinion — yours to overrule, and the grade follows."
                  />
                </h3>
                <p>Thirteen sign-in attempts, dealt at these rules. Nothing accumulates — the grade is a function of the rules as they stand.</p>
              </>
            )}

            <div className="bgt__counters">
              {OUTCOME_ORDER.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`bgt__counter is-${o} ${filter === o ? 'is-on' : ''}`}
                  aria-pressed={filter === o}
                  disabled={!done}
                  onClick={() => setFilter(filter === o ? 'all' : o)}
                  title={OUTCOME_BLURB[o]}
                >
                  <strong>{reduce ? liveCount(o) : <Counter value={liveCount(o)} />}</strong>
                  <em>{OUTCOME_LABEL[o]}</em>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* --- The board ----------------------------------------------------- */}
        <div className="bgt__body">
          {done && result && previous && <Replay before={previous} after={result} />}

          <div className="bgt__board">
            {DECK.map((c, i) => {
              const round = roundOf.get(c.id) ?? null
              const isDealt = dealtIds.has(c.id)
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, delay: reduce ? 0 : Math.min(i * 0.02, 0.26) }}
                >
                  <BoardTile
                    challenge={c}
                    round={round}
                    want={overrides[c.id] ?? c.want}
                    dealt={isDealt}
                    dimmed={done && filter !== 'all' && round?.outcome !== filter}
                    selected={selectedId === c.id}
                    onSelect={() => setSelectedId(selectedId === c.id ? null : isDealt ? c.id : null)}
                  />
                </motion.div>
              )
            })}
          </div>

          <AnimatePresence initial={false} mode="wait">
            {openRound && (
              <TileDetail
                key={openRound.challenge.id}
                round={openRound}
                policy={policy}
                env={env}
                onOverride={setOverride}
                onJumpToRule={onJumpToRule}
                onApplyFix={onApplyFix}
                onClose={() => setSelectedId(null)}
              />
            )}
          </AnimatePresence>

          {!result && <p className="bgt__hint">Run the deck to see what each attempt comes back as. Every card is clickable once it has landed.</p>}
        </div>
      </div>
    </Modal>
  )
}

/* --- Replay ---------------------------------------------------------------------

   What the last edit did to the whole deck, not just to the card that prompted
   it. Cards that got better and cards that got worse are listed separately and
   the worse list is never collapsed, because a fix that closes one hole and
   opens another is the specific failure this strip exists to catch.
   ------------------------------------------------------------------------- */
function Replay({ before, after }: { before: GauntletResult; after: GauntletResult }) {
  const RANK: Record<Outcome, number> = { breach: 0, lockout: 1, friction: 2, held: 3 }
  const was = new Map(before.rounds.map((r) => [r.challenge.id, r]))

  const moved = after.rounds
    .map((r) => ({ now: r, then: was.get(r.challenge.id) }))
    .filter((x) => x.then && x.then.outcome !== x.now.outcome)
    .map((x) => ({ ...x, better: RANK[x.now.outcome] > RANK[x.then!.outcome] }))

  if (moved.length === 0 && before.grade === after.grade) return null

  const better = moved.filter((m) => m.better)
  const worse = moved.filter((m) => !m.better)

  return (
    <div className={`bgt__replay ${worse.length > 0 ? 'is-mixed' : 'is-better'}`}>
      <div className="bgt__replayhead">
        <RotateCcw size={13} strokeWidth={2} aria-hidden />
        <strong>
          Since your last change: {before.grade} → {after.grade}
        </strong>
        <span>
          {better.length} improved{worse.length > 0 ? `, ${worse.length} got worse` : ''}
        </span>
      </div>
      <ul>
        {worse.map((m) => (
          <li key={m.now.challenge.id} className="is-worse">
            <X size={11} strokeWidth={2.8} aria-hidden />
            <b>{m.now.challenge.name}</b>
            <em>
              {OUTCOME_LABEL[m.then!.outcome]} → {OUTCOME_LABEL[m.now.outcome]}
            </em>
          </li>
        ))}
        {better.map((m) => (
          <li key={m.now.challenge.id} className="is-better">
            <Check size={11} strokeWidth={3} aria-hidden />
            <b>{m.now.challenge.name}</b>
            <em>
              {OUTCOME_LABEL[m.then!.outcome]} → {OUTCOME_LABEL[m.now.outcome]}
            </em>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Small enough to sit in a toolbar, honest enough to be worth a glance: the
    live grade without opening the dialog. Recomputed, never cached. */
export function GauntletPip({ policy, onOpen }: { policy: Policy; onOpen: () => void }) {
  const store = useBrand()
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
      riskScale: store.riskScale,
    }),
    [store],
  )
  const overrides = store.gauntletOverrides[policy.id] ?? {}
  const r = useMemo(() => runGauntlet(policy, env, overrides), [policy, env, overrides])

  return (
    <button type="button" className={`bgt__pip is-${GRADE_TONE[r.grade]}`} onClick={onOpen}>
      <Swords size={12} strokeWidth={2} aria-hidden />
      Gauntlet <b>{r.grade}</b>
      {r.breaches > 0 && <em>{r.breaches} through</em>}
    </button>
  )
}
