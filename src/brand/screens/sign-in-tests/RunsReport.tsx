import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, History } from 'lucide-react'

import { CantTell, DecisionBadge } from '../../decision-badge'
import { EmptyState } from '../../empty'
import { Badge, TipDot } from '../../kit'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { LEVEL_LABEL, type SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { useSimEnv } from '../sim-env'
import { savedRows } from '../testing/selectors'
import { formOf, type SignInForm } from '../testing/sign-in-form'
import { libraryMemory, seedLastRun, sentenceLine } from './library'
import {
  LIVE_RUN_ID,
  RUN_EMPTY,
  allRuns,
  defaultFilter,
  fixtureRuns,
  itemsWithSaved,
  liveRun,
  runColumns,
  runItemsOf,
  runMeta,
  runShares,
  runTiles,
  type Run,
  type RunAnswer,
  type RunFilter,
  type RunNames,
} from './runs'
import { RUNS_FIXTURE } from './runs-fixture'
import './library.css'

/* -----------------------------------------------------------------------------
   Sign-in tests → Runs: every time the saved sign-ins were run, and what
   moved (V4 §3.1). A report, two panes.

     left    the runs, newest first: what set each off, who and when, and a
             tiny two-part bar — the share that changed, the share that did
             not. No number here; the tiles on the right say them once.
     right   the chosen run: its head (what, who, when, "Sample" on a
             modelled one), three tiles that ARE the filter — Changed (the
             default), Newly blocked, Unchanged — and under them the sign-ins
             behind the pressed tile, Before → After, each a way into Try.

   The top run is live: every saved sign-in judged now, as the tenant stands,
   against what it expects (runs.ts, `liveRun`), so its columns read Expected
   → Now. The rest are the fixture's week (runs-fixture.ts), placed before
   "now" — which this component takes as a prop, defaulting to the clock, so
   the pure code never reads it.

   The run chosen and the tile pressed are the library's memory (library.ts),
   so a Try from a row and back finds the same run open on the same tile.
   -------------------------------------------------------------------------- */

export function RunsReport({ onTry, now: nowProp }: { onTry: (form: SignInForm) => void; now?: Date }) {
  const { savedSignIns, policies, zones, fingerprints, users, apps, persona } = useBrand()
  const mem = libraryMemory(persona)
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  /* Taken once, so "2 h ago" does not tick over while the tab is open. */
  const [clock] = useState(() => new Date())
  const now = nowProp ?? clock

  const names = useMemo<RunNames>(
    () => ({
      policy: (id) => policies.find((p) => p.id === id)?.name,
      zone: (id) => zones.find((z) => z.id === id)?.name,
      profile: (id) => fingerprints.find((f) => f.id === id)?.name,
    }),
    [policies, zones, fingerprints],
  )
  const judged = useMemo(() => savedRows(savedSignIns, policies, env), [savedSignIns, policies, env])
  const live = useMemo(() => liveRun(judged, now), [judged, now])
  /* The first draw of the library in this session is the baseline Saved's
     Run all compares with, whichever of its tabs that is. */
  useState(() => {
    seedLastRun(mem, judged)
    return null
  })
  const older = useMemo(() => fixtureRuns(RUNS_FIXTURE, now, names, new Set(savedSignIns.map((s) => s.id))), [now, names, savedSignIns])
  const runs = useMemo(() => allRuns(live, older), [live, older])

  const [chosenId, setChosenId] = useState(mem.runs.chosenId ?? LIVE_RUN_ID)
  const chosen = runs.find((r) => r.id === chosenId) ?? runs[0]
  /* The filter belongs to the run it was set on; another run opens on its own default. */
  const [filterBy, setFilterBy] = useState<{ runId: string; filter: RunFilter } | null>(mem.runs.filterBy)
  useEffect(() => {
    Object.assign(mem.runs, { chosenId, filterBy })
  }, [mem, chosenId, filterBy])
  const filter = filterBy && filterBy.runId === chosen.id ? filterBy.filter : defaultFilter(chosen)
  const choose = (r: Run) => setChosenId(r.id)

  if (savedSignIns.length === 0) {
    return (
      <div className="sitl">
        <EmptyState icon={History} title="No saved sign-ins to run" />
      </div>
    )
  }

  return (
    <div className="sitl sitl-runs">
      <nav className="sitl-runlist" aria-label="Runs">
        <ul>
          {runs.map((r) => {
            const on = r.id === chosen.id
            const shares = runShares(r)
            return (
              <li key={r.id}>
                <button type="button" className="sitl-runitem" aria-current={on || undefined} onClick={() => choose(r)}>
                  <span className="sitl-runitem__title">{r.title}</span>
                  <span className="sitl-runitem__meta">{runMeta(r, now)}</span>
                  <span className="sitl-runbar" aria-hidden>
                    {shares.changed > 0 && <span className="sitl-runbar__seg is-changed" style={{ width: `${shares.changed * 100}%` }} />}
                    {shares.same > 0 && <span className="sitl-runbar__seg is-same" style={{ width: `${shares.same * 100}%` }} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <RunDetail
        key={chosen.id}
        run={chosen}
        now={now}
        filter={filter}
        onFilter={(f) => setFilterBy({ runId: chosen.id, filter: f })}
        onTry={onTry}
        reduced={reduced}
        line={(s) => sentenceLine(formOf(s.facts, zones), { people: users, apps, zones })}
        form={(s) => formOf(s.facts, zones)}
      />
    </div>
  )
}

function RunDetail({
  run,
  now,
  filter,
  onFilter,
  onTry,
  reduced,
  line,
  form,
}: {
  run: Run
  now: Date
  filter: RunFilter
  onFilter: (f: RunFilter) => void
  onTry: (form: SignInForm) => void
  reduced: boolean
  line: (s: SavedSignIn) => string
  form: (s: SavedSignIn) => SignInForm
}) {
  const { savedSignIns } = useBrand()
  const tiles = runTiles(run)
  const cols = runColumns(run)
  const items = itemsWithSaved(runItemsOf(run, filter), savedSignIns)
  const pressed = tiles.find((t) => t.filter === filter)

  return (
    <section className="sitl-rundetail" aria-labelledby={`run-${run.id}`}>
      <header className="sitl-runhead">
        <h2 id={`run-${run.id}`} className="sitl-runhead__title">
          {run.title}
          {!run.live && <Badge tone="neutral">Sample</Badge>}
          {!run.live && <TipDot text="A modelled run: the saved sign-ins are real, the history is not read from a log." label="About sample runs" />}
        </h2>
        <p className="sitl-runhead__meta">{runMeta(run, now)}</p>
      </header>

      <div className="sitl-tiles" role="group" aria-label="Show">
        {tiles.map((t) => (
          <button key={t.filter} type="button" className="sitl-tile" aria-pressed={filter === t.filter} onClick={() => onFilter(t.filter)}>
            <span className="sitl-tile__n">{t.count}</span>
            <span className="sitl-tile__label">{t.label}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="sitl-none">{RUN_EMPTY[filter]}</p>
      ) : (
        <div className="sitl-runrows">
          <div className="sitl-rungrid sitl-runrows__head" aria-hidden>
            <span>Sign-in</span>
            <span>{cols.before}</span>
            <span />
            <span>{cols.after}</span>
            <span>Level</span>
          </div>
          <ul aria-label={`${run.title}: ${pressed?.label ?? ''}`}>
            {items.map(({ item, saved }, i) => (
              <motion.li
                key={`${filter}-${item.savedId}`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.16, delay: reduced ? 0 : i * 0.03 }}
              >
                <button
                  type="button"
                  className="sitl-rungrid sitl-runrow"
                  aria-label={`${saved.name}: ${cols.before} ${said(item.before)}, ${cols.after} ${said(item.after)}. Try this sign-in`}
                  onClick={() => onTry(form(saved))}
                >
                  <span className="sitl-signin">
                    <span className="sitl-name is-text">{saved.name}</span>
                    <span className="sitl-line">{line(saved)}</span>
                  </span>
                  <span className="sitl-cell">
                    <AnswerOf answer={item.before} />
                  </span>
                  <ArrowRight className="sitl-arrow" size={13} strokeWidth={2} aria-hidden />
                  <span className="sitl-cell">
                    <AnswerOf answer={item.after} />
                  </span>
                  <span className="sitl-cell">
                    <Badge tone="neutral">{LEVEL_LABEL[saved.level]}</Badge>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const said = (a: RunAnswer): string => (a === 'unknown' ? CANT_TELL : DECISION_WORDS[a])

/* A run's answer: the decision's badge, or grey Can't tell — never a badge. */
function AnswerOf({ answer }: { answer: RunAnswer }) {
  return answer === 'unknown' ? <CantTell /> : <DecisionBadge decision={answer} />
}
