import { useDeferredValue, useMemo, useState } from 'react'
import { AppWindow } from 'lucide-react'

import type { App, Policy } from '../../data'
import { EmptyState, NoMatches } from '../../empty'
import { Face } from '../../faces'
import { SearchBox, Tip } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { useSimEnv } from '../sim-env'
import { Answer } from './DockSaved'
import { answerSaid } from './selectors'
import type { FormField, SignInForm } from './sign-in-form'
import { peopleRows, personCells } from './test-dock'

/* -----------------------------------------------------------------------------
   The test panel's People: this policy's people, on this policy's
   applications — and only those (V4 §2.4-bis, replacing Check a person).

   Check a person listed every application in the tenant for one person, inside
   a policy that protects two of them; the owner asked why. Here a row is one
   person — their face, their name, their group — and on its right what the
   sentence above would answer for them on each of the policy's applications,
   judged by the version on the board: one badge for a policy on one
   application; for two to four, the application's logo beside each badge,
   stacked, so the badges still stand in one column. A badge the edits changed
   says what decides today under it; another policy deciding is said in the
   badge's tip.

   The Global Default is on every application, which is no list to stack: its
   rows answer for the application in the sentence, named once over the list.

   The rows are this policy's audience and nobody else (V4 §1), the first
   twelve until a search; somebody outside it is tried from the sentence's
   Person token. A row is the way into the sentence: it loads the person, on
   the first of the policy's applications.
   -------------------------------------------------------------------------- */

/** More applications than this and a row answers for the sentence's application alone. */
const STACK_MAX = 4

export function DockPeople({
  draft,
  apps,
  form,
  version,
  onPatch,
}: {
  draft: Pick<Policy, 'id' | 'audience' | 'isSystem'>
  /** This policy's applications (`policyApps`). */
  apps: readonly Pick<App, 'id' | 'name'>[]
  /** The sentence's sign-in: every answer asks it, with the row's person. */
  form: SignInForm
  /** The board's version: every answer is judged by it. */
  version: { substitute: Policy; label: string; tip: string } | null
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
}) {
  const { users, groups, zones, policies } = useBrand()
  const env = useSimEnv()
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const substitute = version?.substitute
  /* Two to four stack; more answer for the application in the sentence. */
  const asked = useMemo(() => {
    if (apps.length <= STACK_MAX) return apps
    const on = apps.find((a) => a.id === form.appId) ?? apps[0]
    return on ? [on] : []
  }, [apps, form.appId])
  const people = useMemo(() => peopleRows(draft, users, groups, q), [draft, users, groups, q])
  const rows = useMemo(
    () => people.map((p) => ({ ...p, cells: personCells(policies, asked, p.person, form, env, zones, substitute) })),
    [people, policies, asked, form, env, zones, substitute],
  )

  if (apps.length === 0) {
    return (
      <div className="tpanel-view">
        <EmptyState compact icon={AppWindow} title="No applications on this policy" />
      </div>
    )
  }

  const first = asked[0].id
  const logos = apps.length > 1
  return (
    <div className="tpanel-view">
      <div className="tpanel-tools">
        <SearchBox value={query} onChange={setQuery} placeholder="Search people…" label="Search people" block />
      </div>
      {apps.length > STACK_MAX && (
        <p className="tpanel-on">
          <AppLogo appId={asked[0].id} name={asked[0].name} size={14} />
          <span className="tpanel-clip">On {asked[0].name}</span>
        </p>
      )}

      <div className="tpanel-scroll">
        {rows.length === 0 ? (
          <NoMatches noun="people" query={query} compact onClear={() => setQuery('')} />
        ) : (
          <ul className="tpanel-list" aria-label="This policy’s people on its applications">
            {rows.map((r) => {
              const current = form.personId === r.person.id
              const said = r.cells.map((c) => `${c.appName} ${answerSaid(c.res)}`).join(', ')
              const pick = () => onPatch({ personId: r.person.id, appId: first }, 'person')
              return (
                <li
                  key={r.person.id}
                  className={`tpanel-row tpanel-prow${current ? ' is-current' : ''}`}
                  aria-current={current || undefined}
                  onClick={pick}
                >
                  <button
                    type="button"
                    className="tpanel-rowbtn tpanel-person"
                    aria-label={`${r.person.name}, ${said}. Try this person`}
                    onClick={(e) => {
                      e.stopPropagation()
                      pick()
                    }}
                  >
                    <Face kind="user" name={r.person.name} size="sm" decorative />
                    <span className="tpanel-person__text">
                      <span className="tpanel-clip tpanel-person__name">{r.person.name}</span>
                      <span className="tpanel-sub tpanel-clip">{r.groupName}</span>
                    </span>
                  </button>
                  <span className="tpanel-pcells">
                    {r.cells.map((c) => {
                      const elsewhere = c.res.decidedBy && c.res.decidedBy.policyId !== draft.id ? c.res.decidedBy.policyName : null
                      const answer = <Answer res={c.res} />
                      return (
                        <span key={c.appId} className="tpanel-pcell">
                          {logos && apps.length <= STACK_MAX && <AppLogo appId={c.appId} name={c.appName} size={14} />}
                          <span className="tpanel-pcell__ans">
                            {elsewhere ? <Tip text={`Decided by ${elsewhere}`}>{answer}</Tip> : answer}
                            {c.today && <span className="tpanel-sub">Today: {answerSaid(c.today)}</span>}
                          </span>
                        </span>
                      )
                    })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
