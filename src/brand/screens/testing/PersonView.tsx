import { motion, useReducedMotion } from 'motion/react'
import { useDeferredValue, useEffect, useMemo } from 'react'
import { UserSearch } from 'lucide-react'

import type { Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { EmptyState } from '../../empty'
import { Face } from '../../faces'
import { Button, Chip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { Picker, type PickerOption } from '../../picker'
import { useBrand } from '../../store'
import { useSimEnv } from '../sim-env'
import { answerSaid, assumedPolicy, decisionSig, personRows, type PersonRow } from './selectors'
import { useTestingSession } from './session-state'
import { personOptions } from './sign-in-fields'
import { formSummary, type FormField, type SignInForm } from './sign-in-form'
import './testing.css'

/* -----------------------------------------------------------------------------
   Check a person: the sign-in in Try, for one person, on every application.

   The person is Try's own — one person across both views — and so is the rest
   of the sign-in, summed up in one line with the way back to change it. One
   row per application in the catalogue's order, with no pager and no count:
   which policy decides, by which rule, and what. A row is the way into Try on
   that application.

   A cell whose answer changed since it was last drawn fades up, and only that
   cell, so a device changed in Try shows on return as the two applications
   that check devices and nothing else.

   In the board's test panel (Version 3) the sign-in is the board's own for
   the policy it has open, and every application is judged by the version
   the panel's right-hand column shows — Your edits, or the stored rules as
   though on — named beside the person, with what decides today under a cell
   it changes. At the panel's 448 px the rule moves into the policy's tooltip.
   -------------------------------------------------------------------------- */

/** The board's test panel: its sign-in, and the version it judges by. */
export interface PersonPanel {
  form: SignInForm
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  /** The right-hand column's version (`boardVersion`); null for the tenant as it stands. */
  version: { substitute: Policy; label: string; tip: string } | null
  /** Which board: a cell compares its answer with this board's last, not another's. */
  scope: string
}

/* The answer each application's cell last showed. Outlives the view, which is
   drawn fresh every time its tab is opened: without it, an answer changed in
   Try would have nothing to have changed from (TryRoute's `PLAYED` is the same
   idea for the marker). Written after each draw; read while drawing, so a cell
   compares its answer with the one on screen before it. Per tenant, and per
   board in the board's panel, so another tenant's first draw, or another
   policy's board, fades nothing. */
const SHOWN = new Map<string, string>()
const shownKey = (scope: string, appId: string) => `${scope}|${appId}`

export function PersonView({ onTry, onEdit, panel }: { onTry: (appId: string) => void; onEdit: () => void; panel?: PersonPanel }) {
  const { policies, apps, users, groups, zones, persona } = useBrand()
  const session = useTestingSession()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const current = panel ? panel.form : session.form
  const patch = panel ? panel.onPatch : session.patch
  const form = useDeferredValue(current)
  const inPanel = panel !== undefined
  const version = panel?.version ?? null
  const substitute = useMemo(() => (inPanel ? version?.substitute : assumedPolicy(policies, form)), [inPanel, version, policies, form])
  const scope = panel ? `${persona}|${panel.scope}` : persona
  const rows = useMemo(() => personRows(policies, apps, form, env, zones, substitute), [policies, apps, form, env, zones, substitute])
  const people = useMemo<PickerOption[]>(
    () => personOptions(users, groups).map((o) => ({ ...o, art: <Face kind="user" name={o.label} size="sm" decorative /> })),
    [users, groups],
  )
  useEffect(() => {
    for (const r of rows) SHOWN.set(shownKey(scope, r.appId), decisionSig(r.res))
  }, [rows, scope])

  return (
    <div className="tst__view">
      <div className="tst__controls">
        <span className="tst__person">
          <Picker
            label="Person"
            value={current.personId}
            options={people}
            onChange={(v) => patch({ personId: v }, 'person')}
            placeholder="Choose a person"
            searchable
            noun="people"
            size="md"
            width="fill"
          />
        </span>
        {!panel && substitute && (
          <Chip active removable onRemove={() => session.patch({ assumeOn: null }, 'assume-on')}>
            Assuming {substitute.name} on
          </Chip>
        )}
        {version && <VersionWord version={version} />}
      </div>
      <p className="tst__scenario">
        <span>{formSummary(form, zones)}</span>
        <Button variant="link" size="sm" onClick={onEdit}>
          Edit sign-in
        </Button>
      </p>

      {!form.personId ? (
        <EmptyState compact icon={UserSearch} title="Choose a person" />
      ) : (
        <div className="bdl__scroll tst__table">
          <table className="bdl__table">
            <caption className="u-sr-only">Each application for {users.find((u) => u.id === form.personId)?.name ?? 'this person'}</caption>
            <colgroup>
              <col className="tst__c-app" />
              <col className="tst__c-policy" />
              {!panel && <col className="tst__c-rule" />}
              <col className="tst__c-decision" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Application</th>
                <th scope="col">Policy</th>
                {!panel && <th scope="col">Rule</th>}
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.appId} className="tst__row" onClick={() => onTry(r.appId)}>
                  <td>
                    <button
                      type="button"
                      className="tst__rowbtn"
                      aria-label={`${r.appName}, ${r.policyName}, ${answerSaid(r.res)}, try this sign-in`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTry(r.appId)
                      }}
                    >
                      <AppLogo appId={r.appId} name={r.appName} size={16} />
                      <span className="tst__clip">{r.appName}</span>
                    </button>
                  </td>
                  <td>
                    {panel ? (
                      <span className="tst__name">
                        <span className="tst__clip" title={r.policyName}>
                          {r.policyName}
                        </span>
                        {/* A tip on a row that tries the sign-in: asking what it says is not trying it. */}
                        {r.ruleName && (
                          <span className="tst__tipwrap" onClick={(e) => e.stopPropagation()}>
                            <TipDot text={`Rule: ${r.ruleName}`} label={`Rule on ${r.appName}`} />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="tst__clip" title={r.policyName}>
                        {r.policyName}
                      </span>
                    )}
                  </td>
                  {!panel && (
                    <td className="tst__muted">
                      <span className="tst__clip" title={r.ruleName}>
                        {r.ruleName}
                      </span>
                    </td>
                  )}
                  <td>
                    <DecisionCell row={r} fade={!reduced && changedSince(scope, r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* Nothing fades on the first draw: a cell with no answer before it did not change. */
function changedSince(scope: string, row: PersonRow): boolean {
  const before = SHOWN.get(shownKey(scope, row.appId))
  return before !== undefined && before !== decisionSig(row.res)
}

/* The board's version these answers are for — "Your edits", "Stored
   version" — in grey beside the controls, with its column's tip. */
export function VersionWord({ version }: { version: { label: string; tip: string } }) {
  return (
    <span className="tst__version">
      {version.label}
      <TipDot text={version.tip} label={`About ${version.label.toLowerCase()}`} />
    </span>
  )
}

/* The decision, or grey Can't tell with what it could be; under it, what
   decides today where an assumption changed it, and a monitor that would
   decide it differently. Fades up only when its answer changed: keyed on the
   answer, so a change mounts it afresh and `initial` applies again. */
function DecisionCell({ row, fade }: { row: PersonRow; fade: boolean }) {
  const res = row.res
  return (
    <motion.span
      key={decisionSig(res)}
      className="tst__cell"
      initial={fade ? { opacity: 0.35 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: fade ? 0.16 : 0 }}
    >
      {res.status === 'decided' && res.decision ? <DecisionBadge decision={res.decision} /> : <CantTell outcomes={res.possible.map((o) => o.decision)} stacked />}
      {row.today && <span className="tst__sub">Today: {answerSaid(row.today)}</span>}
      {row.monitoring && <span className="tst__sub">{row.monitoring}</span>}
    </motion.span>
  )
}
