import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
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
  formatCount,
  landingRuleOf,
  pastColumns,
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

     the week      "Last 7 days · 1,284 sign-ins", once
     the shape     one distribution — Today over the board's version — in the
                   decision tones, so a wall of red appearing under the edits
                   is seen before anything is read
     the filter    three tiles that ARE the filter, side by side: Would change
                   (the default), Newly blocked, Unchanged — each with its
                   share of the week
     the list      the modelled sign-ins behind the tile, two lines each: when,
                   who and where to; then Today → with the edits, the badges in
                   two columns under the list's one header

   A row loads that sign-in into the sentence above; hovering it lights the
   card it lands on with the edits.
   -------------------------------------------------------------------------- */

export function DockPast({
  draft,
  apps,
  version,
  onLoad,
  onHighlight,
}: {
  draft: Pick<Policy, 'id' | 'appIds' | 'audience'>
  /** This policy's applications (`policyApps`): where the week's sign-ins are modelled. */
  apps: readonly Pick<App, 'id' | 'name'>[]
  version: { substitute: Policy; label: string; tip: string } | null
  onLoad: (form: SignInForm) => void
  onHighlight?: (target: string | 'fallback' | null) => void
}) {
  const { policies, zones } = useBrand()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const substitute = version?.substitute
  const appIds = useMemo(() => apps.map((a) => a.id), [apps])
  const report = useMemo(() => pastReport(draft, policies, env, substitute, SAMPLE_DAY, appIds), [draft, policies, env, substitute, appIds])
  const cols = pastColumns(version)
  const [filter, setFilter] = useState<PastFilter>('change')
  const rows = pastRowsOf(report.rows, filter)

  if (apps.length === 0 || report.rows.length === 0) {
    return (
      <div className="tpanel-view">
        <EmptyState compact icon={apps.length === 0 ? AppWindow : History} title={apps.length === 0 ? 'No applications on this policy' : 'No sign-ins to model'} />
      </div>
    )
  }

  const load = (r: PastRow) => onLoad(formOf(r.sample.facts, zones))
  const light = (r: PastRow | null) => onHighlight?.(r ? landingRuleOf(r.edits, draft.id) : null)

  return (
    <div className="tpanel-view">
      <div className="tpanel-scroll">
        <div className="tpanel-past__top">
          <p className="tpanel-past__head">
            <Badge tone="neutral">Sample</Badge>
            <span className="tpanel-clip">{report.headline}</span>
            <TipDot
              text="Modelled sign-ins: this policy’s people and two from outside it, from eight places, on its applications. Nothing is read from real sign-ins."
              label="About the sample"
            />
          </p>
          <div className="tpanel-dist" role="group" aria-label="Decisions over the week">
            <DistBar label={cols.left} segments={report.today} reduced={reduced} />
            <DistBar label={cols.right} segments={report.edits} reduced={reduced} />
            <Legend segments={[...report.today, ...report.edits]} />
          </div>
          <div className="tpanel-tiles" role="group" aria-label="Show">
            {report.tiles.map((t) => (
              <button key={t.filter} type="button" className="tpanel-tile" aria-pressed={filter === t.filter} onClick={() => setFilter(t.filter)}>
                <span className="tpanel-tile__n">{formatCount(t.count)}</span>
                <span className="tpanel-tile__label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="tpanel-past__none">{PAST_EMPTY[filter]}</p>
        ) : (
          <>
            <div className="tpanel-pastgrid tpanel-head" aria-hidden>
              <span>{cols.left}</span>
              <span />
              <span>{cols.right}</span>
            </div>
            <ul className="tpanel-list" aria-label={`Past sign-ins: ${report.tiles.find((t) => t.filter === filter)?.label ?? ''}`}>
              {rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  className="tpanel-row"
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
                    title={`${r.when} · ${r.sample.personName} · ${r.sample.appName} · ${r.from}`}
                    aria-label={`${r.when}, ${r.sample.personName} on ${r.sample.appName} from ${r.from}: ${cols.left} ${answerSaid(r.today)}, ${cols.right} ${answerSaid(r.edits)}. Try this sign-in`}
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
                  <div className="tpanel-pastgrid">
                    <span className="tpanel-cell">
                      <Answer res={r.today} />
                    </span>
                    <ArrowRight className="tpanel-arrow" size={12} strokeWidth={2} aria-hidden />
                    <span className="tpanel-cell">
                      <Answer res={r.edits} />
                    </span>
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
