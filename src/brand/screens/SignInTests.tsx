import { useCallback, useId, useState } from 'react'

import { Tabs } from '../kit'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { PeopleTable } from './sign-in-tests/PeopleTable'
import { RunsReport } from './sign-in-tests/RunsReport'
import { SavedTable } from './sign-in-tests/SavedTable'
import { emptyDraft, initialTryPage, nowIn, type TryPage } from './sign-in-tests/sign-in-card'
import { TryJourney } from './sign-in-tests/TryJourney'
import { useTestingSession } from './testing/session-state'
import { todayIn, type SignInForm } from './testing/sign-in-form'

/* -----------------------------------------------------------------------------
   Sign-in tests: the tenant's page (Policy testing V4, §3 and §8).

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

   - Try is an engine run (§8): an empty canvas holding the Sign-in card,
     which collapses into the journey's first node when it runs. Where the
     tab is — the card and what it holds, the run it has played — is kept
     HERE (`TryPage`), so switching to Saved and back finds it as it was,
     settled, and never plays the same run twice.
   - Every road into Try is a RUN. Saved's and Runs' Try and a People row each
     put their sign-in in the testing session with `load`, which bumps the run,
     and the tab plays it the moment it opens: the card filled for a beat,
     collapsing, the engine running at full pace. `patch` would update in
     place, and nothing would move.
   - New sign-in opens Try on an empty card, and Save sign-in once its run
     has landed, because naming it is what was asked for.
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
  const { go } = useBrand()
  const session = useTestingSession()
  const panelId = useId()

  const [tab, setTab] = useState<SignInTestsTab>(routeTab)
  /* The route's tab, as last seen: a new one from outside moves the page. */
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    setTab(routeTab)
  }
  const [tryPage, setTryPage] = useState<TryPage>(() => initialTryPage(session.runId, todayIn(), nowIn()))
  const onTryPage = useCallback((next: (p: TryPage) => TryPage) => setTryPage(next), [])

  const show = (t: SignInTestsTab) => {
    setTab(t)
    setSeen(t)
    if (t !== routeTab) go({ name: 'sign-in-tests', tab: t })
  }
  const tryForm = (form: SignInForm) => {
    setTryPage((p) => ({ ...p, mode: 'journey', intro: 'fill', pace: 'full', draft: form, prev: null, askSave: false }))
    session.load(form)
    show('try')
  }

  let body
  if (tab === 'saved') {
    body = (
      <SavedTable
        onTry={tryForm}
        onNew={() => {
          setTryPage((p) => ({ ...p, mode: 'form', played: session.runId, draft: emptyDraft(todayIn(), nowIn()), touched: [], prev: null, askSave: true }))
          show('try')
        }}
      />
    )
  } else if (tab === 'people') {
    body = <PeopleTable onTry={(personId, appId) => tryForm({ ...session.form, personId, appId: appId ?? session.form.appId })} />
  } else if (tab === 'runs') {
    body = <RunsReport onTry={tryForm} />
  } else {
    body = <TryJourney page={tryPage} onPage={onTryPage} />
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
