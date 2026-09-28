import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Eye } from 'lucide-react'

import type { Policy } from '../data'
import { CantTell, DecisionBadge } from '../decision-badge'
import { CANT_TELL } from '../decision-words'
import { EmptyState } from '../empty'
import { Badge, Button, Drawer, Tip, TipDot } from '../kit'
import { planOf, planParts, type MonitorRow } from './monitor-sample'
import { fromCell, ifOnCell, orderRows, showWhyLabel, todayCell, whyOf, type Why } from './monitoring-model'
import type { SimEnv } from './simulate'
import { CONDITION_WORDS, lineText, type EvidenceLine } from './testing/evidence'

import './monitoring-page.css'

/* -----------------------------------------------------------------------------
   The Monitoring page: what a monitoring policy would decide, were it on
   (spec C §3.4, final C.5).

   A slider page at 780 px over whatever opened it — the Policies row menu,
   the status control on the board, Before turning on's While monitoring row.
   Real sign-ins need the backend, so the rows are modelled (monitor-sample.ts):
   twelve sign-ins from the sample directory, each resolved across the tenant as
   it stands and with this policy on. The page says so twice — the Sample badge
   by the title, and the section's name — and nowhere pretends to be traffic.

   One plan line carries every count on the page:

     If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.

   Under it, the rows that move come first (monitoring-model.ts). Today is the
   decision badge; If turned on is an info badge, never the decision's tone,
   because the policy decides nothing yet. Show why opens a row on the rules
   the policy would read, in the words every testing surface uses.

   The footer is the two switches a monitoring policy has: Turn off (made at
   once, with Undo) and Turn on (through Before turning on, where the edition
   has it). Turn on is the one orange thing on the page.

   Motion: the If turned on badges fade in once per open, after Today has been
   read (opacity, 200 ms, 160 ms late); a row's reasons open by height and
   opacity (180 ms). Neither element carries a stylesheet transform, and under
   reduced motion both are simply there.
   -------------------------------------------------------------------------- */

export function MonitoringPage({
  open,
  policy,
  rows,
  env,
  onClose,
  onTurnOn,
  onTurnOff,
}: {
  open: boolean
  /** The stored policy: what is monitored is its live rules, never a saved draft. */
  policy: Policy | null
  /** The modelled sign-ins, as monitorRows gives them. */
  rows: readonly MonitorRow[]
  env: SimEnv
  onClose: () => void
  onTurnOn: () => void
  onTurnOff: () => void
}) {
  if (!policy) return null
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Monitoring: ${policy.name}`}
      width={780}
      head={
        <div className="bmon__head">
          <div className="bmon__title">
            <h2>Monitoring</h2>
            <Badge tone="neutral">Sample</Badge>
            {policy.pendingDraft && <Badge tone="neutral">Saved draft not included</Badge>}
          </div>
          <p>{policy.name}</p>
        </div>
      }
      actions={
        <>
          <Button variant="secondary" onClick={onTurnOff}>
            Turn off
          </Button>
          <Button variant="brand" onClick={onTurnOn}>
            Turn on
          </Button>
        </>
      }
    >
      <MonitoringBody policy={policy} rows={rows} env={env} />
    </Drawer>
  )
}

/* The body, mounted per open: which rows are open, and the badges' fade, start
   again each time the page does. */
function MonitoringBody({ policy, rows, env }: { policy: Policy; rows: readonly MonitorRow[]; env: SimEnv }) {
  const headId = useId()
  const ordered = useMemo(() => orderRows(rows), [rows])
  const plan = planParts(planOf(rows))

  return (
    <section className="bmon" aria-labelledby={headId}>
      <div className="bmon__sechead">
        <h3 id={headId}>Modelled sign-ins</h3>
        <TipDot label="About modelled sign-ins" text="Modelled on the sample directory, not real traffic" />
      </div>
      {ordered.length === 0 ? (
        <EmptyState compact icon={Eye} title="No modelled sign-ins" />
      ) : (
        <>
          <p className="bmon__plan">
            {plan.head}
            {plan.cantTell && <span className="bmon__grey">{plan.cantTell}</span>}.
          </p>
          <MonitorTable policy={policy} rows={ordered} env={env} />
        </>
      )}
    </section>
  )
}

function MonitorTable({ policy, rows, env }: { policy: Policy; rows: readonly MonitorRow[]; env: SimEnv }) {
  const baseId = useId()
  const reduced = useReducedMotion() === true
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string) =>
    setOpened((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <table className="btable bmon__table">
      <caption className="u-sr-only">Modelled sign-ins for {policy.name}</caption>
      <colgroup>
        <col className="bmon__c-time" />
        <col className="bmon__c-person" />
        <col className="bmon__c-app" />
        <col className="bmon__c-from" />
        <col className="bmon__c-today" />
        <col />
        <col className="bmon__c-more" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Person</th>
          <th scope="col">Application</th>
          <th scope="col">From</th>
          <th scope="col">Today</th>
          <th scope="col">If turned on</th>
          <th scope="col">
            <span className="u-sr-only">Details</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = row.sample.id
          const isOpen = opened.has(id)
          const whyId = `${baseId}-why-${id}`
          return (
            <Fragment key={id}>
              <tr className={isOpen ? 'is-open' : undefined}>
                <SampleCells row={row} policy={policy} reduced={reduced} />
                <td className="bmon__more">
                  <Tip text={showWhyLabel(row.sample)}>
                    <button
                      type="button"
                      className="bx-iconbtn bx-iconbtn--sm bx-iconbtn--ghost bmon__toggle"
                      aria-label={showWhyLabel(row.sample)}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? whyId : undefined}
                      onClick={() => toggle(id)}
                    >
                      <ChevronDown size={14} strokeWidth={1.9} aria-hidden />
                    </button>
                  </Tip>
                </td>
              </tr>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <tr key="why" id={whyId} className="bmon__whyrow">
                    <td colSpan={7}>
                      <motion.div
                        className="bmon__why"
                        initial={reduced ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
                      >
                        <WhyBody why={whyOf(row, policy, env)} />
                      </motion.div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

/* Two lines a cell: the fact, and under it, smaller and grey, what places it. */
function Lines({ first, second, clip = false }: { first: ReactNode; second?: string; clip?: boolean }) {
  return (
    <>
      <span className={`bmon__l1${clip ? ' bmon__clip' : ''}`} title={clip && typeof first === 'string' ? first : undefined}>
        {first}
      </span>
      {second && (
        <span className="bmon__l2 bmon__clip" title={second}>
          {second}
        </span>
      )}
    </>
  )
}

function SampleCells({ row, policy, reduced }: { row: MonitorRow; policy: Policy; reduced: boolean }) {
  const s = row.sample
  const from = fromCell(s)
  const today = todayCell(row.today)
  const ifOn = ifOnCell(row, policy)
  return (
    <>
      <td>
        <Lines first={s.day} second={s.time} />
      </td>
      <th scope="row">
        <Lines first={s.personName} second={s.groupName} clip />
      </th>
      <td>
        <Lines first={s.appName} clip />
      </td>
      <td>
        <Lines first={from.place} second={from.address} clip />
      </td>
      <td>
        {today.kind === 'none' ? (
          <span className="bmon__l1 bmon__grey">No policy decides</span>
        ) : (
          <Lines
            first={today.kind === 'decided' ? <DecisionBadge decision={today.decision} /> : <CantTell outcomes={today.reach} stacked />}
            second={today.by}
          />
        )}
      </td>
      <td>
        {ifOn.kind === 'would' ? (
          <Lines
            first={
              <motion.span
                className="bmon__would"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.16, ease: [0.2, 0, 0, 1] }}
              >
                <Badge tone="info" className="bx-would-badge">
                  {ifOn.word}
                </Badge>
              </motion.span>
            }
            second={ifOn.sub}
          />
        ) : ifOn.kind === 'no-change' ? (
          <Lines first={<span className="bmon__nochange">No change</span>} second={ifOn.sub} />
        ) : (
          /* The same grey Can't tell as Today, in the same words. */
          <Lines first={<CantTell outcomes={ifOn.reach} stacked />} second={ifOn.sub} />
        )}
      </td>
    </>
  )
}

/* What the policy, turned on, would read of the sign-in: the rule that decides,
   then each rule it reads on the way, with its lines — or, for somebody it
   would still not decide, the one line that says why. */
function WhyBody({ why }: { why: Why }) {
  if (why.kind === 'standing') {
    return (
      <div className="bmon__whyin">
        <p className="bmon__standing">{why.line}</p>
      </div>
    )
  }
  return (
    <div className="bmon__whyin">
      <p className="bmon__decided">
        <span className="bmon__label">Decided by</span>
        {why.decidedBy ?? <span className="bmon__grey">{CANT_TELL}</span>}
      </p>
      <ol className="bmon__rules">
        {why.rules.map((r) => (
          <li key={r.key} className={`bmon__rule is-${r.state}`}>
            <div className="bmon__rulehead">
              <span className={`bmon__idx${r.number ? '' : ' is-last'}`} aria-hidden>
                {r.number}
              </span>
              <span className="bmon__rulename">{r.name}</span>
              <span className={`bmon__word is-${r.state}`}>{r.word}</span>
            </div>
            {r.lines.length > 0 && (
              <ul className="bmon__lines">
                {r.lines.map((l) => (
                  <WhyLine key={l.key} line={l} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* "Network · 192.0.2.10 · in 203.0.113.0/24, 198.51.100.0/24 · Fails". A line
   that can't be told says what would settle it under it; any other note is a
   tip. */
function WhyLine({ line: l }: { line: EvidenceLine }) {
  const needs = l.status === 'unknown' && l.tip?.startsWith('Needs:') ? l.tip : null
  return (
    <li className="bmon__line">
      <span className="bmon__linelabel">{l.label}</span>
      <span className="bmon__linetext">
        {lineText(l)}
        {l.tip && !needs && (
          <span className="bmon__linetip">
            <TipDot text={l.tip} label={`About ${l.label.toLowerCase()}`} />
          </span>
        )}
        {needs && <span className="bmon__needs">{needs}</span>}
      </span>
      <span className={`bmon__linestatus is-${l.status}`}>{CONDITION_WORDS[l.status]}</span>
    </li>
  )
}
