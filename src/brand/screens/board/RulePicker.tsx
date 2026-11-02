import { Fragment } from 'react'
import { AlertTriangle } from 'lucide-react'

import type { Policy } from '../../data'
import { NoMatches } from '../../empty'
import { Badge, Button, Drawer, SearchBox, StatusPill } from '../../kit'
import { useNameLookup } from '../../store'
import { decisionSentence, ruleIfLine, ruleLabel } from '../predicate-prose'
import type { PickSource } from './copy-rules'
import { FilterTabs } from '../page-bar'
import { PICK_TITLE, SHELVES, useRulePicker, type PickFrom, type RulePicker } from './use-rule-picker'

/* -----------------------------------------------------------------------------
   Copy from a policy and Use a template, as one picker (owner, 2 Nov 2026: "make the copy from policy and start from
   template same"). The list down the left, the chosen one's rules on the right to read before taking them, as the
   Xecurify store has its rail and its shelf. A source is taken whole: "the user can only select a policy, not dedicated
   rules from the policy". The list look, kept behind bar-tools.ts `PICKER_LOOK`; the final one is the cards (create/TemplateSheet.tsx). See copy-rules.ts for
   what a copy is.
   -------------------------------------------------------------------------- */

export function RulePickerBody({ picker }: { picker: RulePicker }) {
  const resolve = useNameLookup()
  const { lists, q, setQ, shown, source, notes, choose, shelves, shelf, setShelf } = picker
  const noun = lists === 'policy' ? 'policies' : 'templates'
  return (
    <div className="bcopy">
      <div className="bcopy__rail">
        {/* Your policies, as a shelf of Use a template, where Copy from a policy is not a way of its own. */}
        {shelves && <FilterTabs label="Show" value={shelf} options={SHELVES} onChange={setShelf} />}
        <SearchBox block placeholder={`Search ${noun}`} label={`Search ${noun}`} value={q} onChange={setQ} />
        {shown.length > 0 ? (
          <ul className="bcopy__sources" aria-label={lists === 'policy' ? 'Policies' : 'Templates'}>
            {shown.map((s, i) => (
              <Fragment key={s.id}>
                {s.group && s.group !== shown[i - 1]?.group && (
                  <li className="bcopy__group" aria-hidden>
                    {s.group}
                  </li>
                )}
                <li>
                  <button type="button" className={`bcopy__source ${s.id === source?.id ? 'is-on' : ''}`} aria-pressed={s.id === source?.id} onClick={() => choose(s.id)}>
                    <span className="bcopy__sourcename">{s.name}</span>
                    <span className="bcopy__sourceapps">{s.sub}</span>
                  </button>
                </li>
              </Fragment>
            ))}
          </ul>
        ) : (
          <NoMatches compact noun={noun} query={q} filtered={false} onClear={() => setQ('')} />
        )}
      </div>

      <div className="bcopy__rules">
        {source && (
          <>
            <div className="bcopy__head">
              <h3>{source.name}</h3>
              {source.status && <StatusPill status={source.status} />}
            </div>
            {/* The details: where a policy applies, or what a template is for. */}
            <p className="bcopy__detail">{source.detail ?? source.sub}</p>
            <ul className="bcopy__list" aria-label={`Rules in ${source.name}`}>
              {source.rules.map((r) => {
                const note = notes.get(r.id)
                return (
                  <li key={r.id} className="bcopy__rule">
                    <span className="bcopy__rulename">
                      {ruleLabel(r)}
                      {!r.enabled && <Badge>Off</Badge>}
                    </span>
                    <span className="bcopy__ruleline">{ruleIfLine(r, resolve)}</span>
                    <span className="bcopy__ruleline is-then">{decisionSentence(r)}</span>
                    {note && (
                      <span className="bcopy__note">
                        <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                        {note}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/** The builder's own slider, for a policy that already exists: two buttons, nothing written until the second. */
export function RulePickerSlider({
  open,
  from,
  target,
  onClose,
  onPick,
  withPolicies = false,
}: {
  open: boolean
  from: PickFrom
  /** Your policies as a second shelf of Use template. */
  withPolicies?: boolean
  /** The policy as it stands on the canvas, unsaved edits included: where the rules land. */
  target: Policy
  onClose: () => void
  onPick: (source: PickSource) => void
}) {
  const picker = useRulePicker(open, target, from, withPolicies)
  const take = () => {
    if (!picker.source) return
    onPick(picker.source)
    onClose()
  }
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={PICK_TITLE[from]}
      width={820}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={take}>
            {picker.lists === 'policy' ? 'Copy rules' : 'Use template'}
          </Button>
        </>
      }
    >
      <RulePickerBody picker={picker} />
    </Drawer>
  )
}
