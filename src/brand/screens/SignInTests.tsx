import { useId, useState } from 'react'

import { Tabs } from '../kit'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { PeopleTable } from './sign-in-tests/PeopleTable'
import { RunsReport } from './sign-in-tests/RunsReport'
import { SavedTable } from './sign-in-tests/SavedTable'
import { TryJourney } from './sign-in-tests/TryJourney'
import { useTestingSession } from './testing/session-state'
import { defaultForm, todayIn, type SignInForm } from './testing/sign-in-form'

/* -----------------------------------------------------------------------------
   Sign-in tests: the tenant's page (Policy testing V4, §3).

   A policy's board keeps only its own saved sign-ins, people and last week;
   everything that asks about the whole tenant lives here, and the board's
   test panel links to it ("Open Sign-in tests"), carrying the tab it came
   from.

     Sign-in tests
     Checked before any policy is saved or turned on.
     ─ Try a sign-in ─ Saved sign-ins ─ People ─ Runs ──────────────────
     [the tab's body]

   Four bodies, each its own module under sign-in-tests/; this file is the
   page that holds them and the few wires between them:

   - Every road into Try is a RUN. Saved's and Runs' Try, a People row, New
     sign-in — each puts its sign-in in the testing session with `load`,
     which bumps the run, so the journey's marker travels for it the moment
     the tab opens. `patch` would update in place, and nothing would move.
   - New sign-in lands on Try with a fresh sign-in (`defaultForm`) and Save
     sign-in already open, because naming it is what was asked for.
   - Open policy, from the journey, is the journey's own: it puts the sign-in
     on that policy's board (`loadBoard`) and opens the board on Try.

   The tab. The route's `tab` seeds it, and a switch writes it back to the
   route: a `go` that names a tab is not a revisit (revisit.ts), so the page
   is not remounted and the session's sign-in stays where it is. When the
   route changes under the page — the board's link while this page is open
   behind the leave guard — the page follows it.

   No counts on the tabs (the numbers are each said once, inside the tab).
   -------------------------------------------------------------------------- */

export type SignInTestsTab = 'try' | 'saved' | 'people' | 'runs'

const TABS: { value: SignInTestsTab; label: string }[] = [
  { value: 'try', label: 'Try a sign-in' },
  { value: 'saved', label: 'Saved sign-ins' },
  { value: 'people', label: 'People' },
  { value: 'runs', label: 'Runs' },
]

export function SignInTests({ tab: routeTab = 'try' }: { tab?: SignInTestsTab }) {
  const { users, apps, go } = useBrand()
  const session = useTestingSession()
  const panelId = useId()

  const [tab, setTab] = useState<SignInTestsTab>(routeTab)
  /* The route's tab, as last seen: a new one from outside moves the page. */
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    setTab(routeTab)
  }
  /* Set only by New sign-in, and cleared by any other switch, so coming back
     to Try later does not open Save again. */
  const [askSave, setAskSave] = useState(false)

  const show = (t: SignInTestsTab, opts: { save?: boolean } = {}) => {
    setAskSave(opts.save === true)
    setTab(t)
    setSeen(t)
    if (t !== routeTab) go({ name: 'sign-in-tests', tab: t })
  }
  const tryForm = (form: SignInForm) => {
    session.load(form)
    show('try')
  }

  let body
  if (tab === 'saved') {
    body = (
      <SavedTable
        onTry={tryForm}
        onNew={() => {
          session.load(defaultForm(users, apps, todayIn()))
          show('try', { save: true })
        }}
      />
    )
  } else if (tab === 'people') {
    body = <PeopleTable onTry={(personId, appId) => tryForm({ ...session.form, personId, appId: appId ?? session.form.appId })} />
  } else if (tab === 'runs') {
    body = <RunsReport onTry={tryForm} />
  } else {
    body = <TryJourney openSave={askSave} />
  }

  return (
    <div className="bpage sit" data-tab={tab}>
      <PageHead title="Sign-in tests" caption="Checked before any policy is saved or turned on." />
      <Tabs className="bx-tabs--line sit__tabs" name="Sign-in tests" value={tab} options={TABS} onChange={(t) => show(t)} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label} className={`sit__panel is-${tab}`}>
        {body}
      </div>
    </div>
  )
}
