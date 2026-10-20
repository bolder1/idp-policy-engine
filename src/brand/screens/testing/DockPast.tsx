import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AppWindow, ArrowRight, History } from 'lucide-react'

import type { App, Policy } from '../../data'
import { EmptyState } from '../../empty'
import { Badge, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { SAMPLE_DAY } from '../monitor-sample'
import { useSimEnv } from '../sim-env'
import { Answer } from './DockSaved'
import { answerSaid } from './selectors'
import { formOf, type SignInForm } from './sign-in-form'
import {
  PAST_EMPTY,
  appsWithSignIns,
  formatCount,
  landingRuleOf,
  pastColumns,
  pastDefaultFilter,
  pastReport,
  pastRowsOf,
  type DistSegment,
  type PastFilter,
  type PastRow,
} from './test-dock'

/* -----------------------------------------------------------------------------
   The test panel's Past sign-ins: last week on this policy's applications,
   today and with the edits (V4 §2.4-bis). A report, and it says so — the "Sample"
   badge, because the sign-ins are modelled (test-dock.ts, `pastReport`), not
   read from a log this prototype does not have.

   Top to bottom, the way the question narrows:

     the week      "Last 7 days · 1,284 sign-ins", once — and without the
                   number when a tile below already says it
     the shape     one distribution — Today over the board's version — in the
                   decision tones, so a wall of red appearing under the edits
                   is seen before anything is read
     the filter    three tiles that ARE the filter, side by side: Would change,
                   Newly blocked, Unchanged — each with its share of the week,
                   and the first with anything in it pressed on arrival
     the list      the modelled sign-ins behind the tile, two lines each: when,
                   who and where to; then Today → with the edits, the badges in
                   two columns under the list's one header

   With nothing to compare — a live policy nobody has edited — there is one
   side: one bar, Today; no tiles, since every one would say the same thing;
   and the week listed as it is, with the headline its only number (review,
   29 Sep 2026: an empty "Would change 0" list and the total said twice).

   A row loads that sign-in into the sentence above; hovering it lights the
   card it lands on with the edits.
   -------------------------------------------------------------------------- */

export function DockPast({
  draft,
  apps,
  version,
  onLoad,
  onHighlight,
  summary = 'cards',
  picked: pickedRow,
}: {
  draft: Pick<Policy, 'id' | 'appIds' | 'audience'>
  /** This policy's applications (`policyApps`): where the week's sign-ins are modelled, less any added this session. */
  apps: readonly Pick<App, 'id' | 'name' | 'addedAt'>[]
  version: { substitute: Policy; label: string; tip: string } | null
  /** A row pressed: its sign-in, and the row's id (the builder marks the row its run is of, OPEN_AT_ONCE). */
  onLoad: (form: SignInForm, id?: string) => void
  onHighlight?: (target: string | 'fallback' | null) => void
  /* Over the list (owner, 6 Oct 2026): with nothing to compare, the week as a card per decision — each one the list's
     filter — in place of the bar ("add cards here"); 'none' is the list alone, the policy details slider's ("remove"). */
  summary?: 'cards' | 'none'
  /* OPEN AT ONCE (sign-in-tests/phase.ts, 20 Oct 2026): a row runs at once in the builder's Check access and the list stays
     beside the run, so the builder hands the row its run is of — marked, `aria-current`, and the focus's as the list comes
     back after the Why or the form; with it, Up and Down walk the rows. Absent, the list is as it was. */
  picked?: string | null
}) {
  const { policies, zones } = useBrand()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const list = useRef<HTMLUListElement | null>(null)
  const keys = pickedRow !== undefined
  /* Back after the Why or the form: the marked row takes the focus once the panel has slid in. Once, on mount. */
  useEffect(() => {
    if (!pickedRow) return
    const t = window.setTimeout(() => list.current?.querySelector<HTMLElement>('.tpanel-row.is-picked .tpanel-rowbtn')?.focus({ preventScroll: true }), reduced ? 0 : 220)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the list comes back
  }, [])
  const substitute = version?.substitute
  /* An application added this session has no week behind it (`appsWithSignIns`):
     a policy on that one alone reads "No sign-ins to model", which is true. */
  const appIds = useMemo(() => appsWithSignIns(apps).map((a) => a.id), [apps])
  const report = useMemo(() => pastReport(draft, policies, env, substitute, SAMPLE_DAY, appIds), [draft, policies, env, substitute, appIds])
  const cols = pastColumns(version)
  /* The tile pressed, or — until one is — the first with anything in it. */
  const [picked, setPicked] = useState<PastFilter | null>(null)
  const filter = report.compared ? (picked ?? pastDefaultFilter(report)) : null
  /* One side: a decision's card pressed shows its sign-ins alone; pressed again, all of them. */
  const [picks, setDecided] = useState<DistSegment['key'] | null>(null)
  /* A card the week no longer has (an edit saved since) filters nothing. */
  const decided = picks && report.today.some((s) => s.key === picks) ? picks : null
  const byFilter = filter ? pastRowsOf(report.rows, filter) : report.rows
  const rows = !report.compared && decided ? byFilter.filter((r) => keyOf(r.today) === decided) : byFilter
  /* A row hovered as the tab goes — another tab, the rule editor — never sends its mouseleave. */
  useEffect(() => () => onHighlight?.(null), [onHighlight])

  if (apps.length === 0 || report.rows.length === 0) {
    return (
      <div className="tpanel-view">
        <EmptyState compact icon={apps.length === 0 ? AppWindow : History} title={apps.length === 0 ? 'No applications on this policy' : 'No sign-ins to model'} />
      </div>
    )
  }

  const load = (r: PastRow) => onLoad(formOf(r.sample.facts, zones), r.id)
  /* Up or Down on a row: the focus to the next row's button, never past either end; Enter or Space runs it. */
  const walk = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const btns = Array.from(list.current?.querySelectorAll<HTMLElement>('.tpanel-rowbtn') ?? [])
    const at = btns.indexOf(e.target as HTMLElement)
    if (at < 0) return
    e.preventDefault()
    btns[Math.max(0, Math.min(btns.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }
  const light = (r: PastRow | null) => onHighlight?.(r ? landingRuleOf(r.edits, draft.id) : null)

  return (
    <div className="tpanel-view">
      <div className="tpanel-scroll">
        {summary !== 'none' && (
        <div className="tpanel-past__top">
          <p className="tpanel-past__head">
            <Badge tone="neutral">Sample</Badge>
            <span className="tpanel-clip">{report.headline}</span>
            <TipDot
              text="Modelled sign-ins: this policy’s people and two from outside it, from eight places, on its applications. Nothing is read from real sign-ins."
              label="About the sample"
            />
          </p>
          {report.compared ? (
            <div className="tpanel-dist" role="group" aria-label="Decisions over the week">
              <DistBar label={cols.left} segments={report.today} reduced={reduced} />
              <DistBar label={cols.right} segments={report.edits} reduced={reduced} />
              <Legend segments={[...report.today, ...report.edits]} />
            </div>
          ) : (
            <div className="tpanel-tiles tpanel-dcards" role="group" aria-label="Show">
              {report.today.map((s) => (
                <button key={s.key} type="button" className={`tpanel-tile tpanel-dcard is-${s.key}`} aria-pressed={decided === s.key} onClick={() => setDecided(decided === s.key ? null : s.key)}>
                  <span className="tpanel-tile__n">{formatCount(s.count)}</span>
                  <span className="tpanel-tile__label">{s.label}</span>
                </button>
              ))}
            </div>
          )}
          {report.compared && (
            <div className="tpanel-tiles" role="group" aria-label="Show">
              {report.tiles.map((t) => (
                <button key={t.filter} type="button" className="tpanel-tile" aria-pressed={filter === t.filter} onClick={() => setPicked(t.filter)}>
                  <span className="tpanel-tile__n">{formatCount(t.count)}</span>
                  <span className="tpanel-tile__label">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {rows.length === 0 && filter ? (
          <p className="tpanel-past__none">{PAST_EMPTY[filter]}</p>
        ) : (
          <>
            <div className={`tpanel-pastgrid tpanel-head${report.compared ? '' : ' is-one'}`} aria-hidden>
              <span>{cols.left}</span>
              {report.compared && (
                <>
                  <span />
                  <span>{cols.right}</span>
                </>
              )}
            </div>
            <ul
              ref={list}
              className="tpanel-list"
              aria-label={filter ? `Past sign-ins: ${report.tiles.find((t) => t.filter === filter)?.label ?? ''}` : 'Past sign-ins'}
              onPointerLeave={() => light(null)}
              onKeyDown={keys ? walk : undefined}
            >
              {rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  className={`tpanel-row${keys && pickedRow === r.id ? ' is-picked' : ''}`}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16, delay: reduced ? 0 : i * 0.03 }}
                  onClick={() => load(r)}
                  onMouseEnter={() => light(r)}
                  onMouseLeave={() => light(null)}
                >
                  <button
                    type="button"
                    className="tpanel-rowbtn tpanel-past__who"
                    aria-current={keys && pickedRow === r.id ? 'true' : undefined}
                    title={`${r.when} · ${r.sample.personName} · ${r.sample.appName} · ${r.from}`}
                    aria-label={`${r.when}, ${r.sample.personName} on ${r.sample.appName} from ${r.from}: ${cols.left} ${answerSaid(r.today)}${report.compared ? `, ${cols.right} ${answerSaid(r.edits)}` : ''}. Try this sign-in`}
                    onClick={(e) => {
                      e.stopPropagation()
                      load(r)
                    }}
                    onFocus={() => light(r)}
                    onBlur={() => light(null)}
                  >
                    <span className="tpanel-when">{r.when}</span>
                    <span className="tpanel-clip tpanel-past__name">{r.sample.personName}</span>
                    <span className="tpanel-past__app">
                      <AppLogo appId={r.sample.facts.appId ?? ''} name={r.sample.appName} size={14} />
                      <span className="tpanel-clip">{r.sample.appName}</span>
                    </span>
                  </button>
                  <div className={`tpanel-pastgrid${report.compared ? '' : ' is-one'}`}>
                    <span className="tpanel-cell">
                      <Answer res={r.today} />
                    </span>
                    {report.compared && (
                      <>
                        <ArrowRight className="tpanel-arrow" size={12} strokeWidth={2} aria-hidden />
                        <span className="tpanel-cell">
                          <Answer res={r.edits} />
                        </span>
                      </>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/* One side of the week as a bar: a segment per decision, in its tone, as wide
   as its share. The widths are motion's — they ease to the new shares when an
   edit moves them — on segments nothing else animates. */
/** A sign-in's answer as the week's segments key it: its decision, or can't tell. */
const keyOf = (res: PastRow['today']): DistSegment['key'] => (res.status === 'decided' && res.decision ? res.decision : 'unknown')

function DistBar({ label, segments, reduced }: { label: string; segments: DistSegment[]; reduced: boolean }) {
  const said = segments.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(', ')
  return (
    <div className="tpanel-dist__row">
      <span className="tpanel-dist__label">{label}</span>
      <span className="tpanel-dist__bar" role="img" aria-label={`${label}: ${said}`}>
        {segments.map((s) => (
          <motion.span
            key={s.key}
            className={`tpanel-dist__seg is-${s.key}`}
            initial={false}
            animate={{ width: `${s.share * 100}%` }}
            transition={{ duration: reduced ? 0 : 0.32, ease: [0.2, 0, 0, 1] }}
          >
            <Tip text={`${s.label} · ${formatCount(s.count)}`} placement="top">
              <span className="tpanel-dist__hit" />
            </Tip>
          </motion.span>
        ))}
      </span>
    </div>
  )
}

/* The key, each decision once, in the order the bars draw them: a square of
   its tone and its words — identity never rests on colour alone. */
function Legend({ segments }: { segments: DistSegment[] }) {
  const seen = new Map<string, DistSegment>()
  for (const s of segments) if (!seen.has(s.key)) seen.set(s.key, s)
  const order = ['1fa', '2fa', 'deny', 'unknown'].flatMap((k) => (seen.has(k) ? [seen.get(k)!] : []))
  return (
    <span className="tpanel-legend" aria-hidden>
      {order.map((s) => (
        <span key={s.key} className="tpanel-legend__item">
          <span className={`tpanel-legend__key is-${s.key}`} />
          {s.label}
        </span>
      ))}
    </span>
  )
}
