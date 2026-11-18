import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, History } from 'lucide-react'
import { addedLabel } from '../data'
import { IntroFilm } from './IntroFilm'
import { OLD_CLOSES } from './legacy'
import { FindDiagram, Shot } from './guide-diagrams'
import { ConvertWalk, NewWalk, OldWalk, ProcessWalk } from './guide-walkthroughs'
import './migration-guide.css'
import { TESTER } from '../tester'

/* -----------------------------------------------------------------------------
   How migration works, a page of its own (owner, 10 Nov 2026): opened in a new tab by "See how it works" on the old
   policies' banner. A guide for anyone with the time to read it: the migration first, then how the old policies work,
   what the new Policy builder changes, how old becomes new, where to find the old things, and how a policy is made now.
   Shaped like a help article (Claude's "Move from standalone Claude Design" page): the film on top, headings in order,
   an "On this page" list that follows the scroll, numbered steps, a table where there is a comparison, Important
   callouts. Every statement is what the prototype does: the words come from the migrate flow (MoveDialog, moved-panel,
   plan.ts) and the builder, not from memory. The pictures of the real screens are in public/guide.
   -------------------------------------------------------------------------- */

const SECTIONS = [
  { id: 'process', title: 'The migration at a glance' },
  { id: 'old', title: 'How old policies work' },
  { id: 'new', title: 'What the Policy builder changes' },
  { id: 'convert', title: 'How old becomes new' },
  { id: 'steps', title: 'Move your policies' },
  { id: 'find', title: 'Find your old policies' },
  { id: 'make', title: 'How a policy is made now' },
  { id: 'blocked', title: 'What can’t move yet' },
  { id: 'faq', title: 'Questions' },
]

function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="mg__callout">
      <b>Important:</b> {children}
    </p>
  )
}

/** The section the reader is in, for the list on the right. */
function useActiveSection() {
  const [on, setOn] = useState(SECTIONS[0].id)
  useEffect(() => {
    const seen = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity)
        const first = [...seen.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1])[0]
        if (first) setOn(first[0])
      },
      { rootMargin: '-72px 0px -60% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])
  return on
}

export function MigrationGuide() {
  const closes = addedLabel({ addedOn: OLD_CLOSES })
  const on = useActiveSection()
  /* A video, with a player's controls: no buttons to leave by. */
  const toConsole = () => undefined
  useEffect(() => {
    document.title = 'How migration works · xecurify IdP'
  }, [])

  return (
    <div className="mg">
      <header className="mg__top">
        <span className="mg__crumb">Policies · Migration</span>
      </header>

      <div className="mg__wrap">
        <main className="mg__main">
          <h1>Move your old policies to the new Policy builder</h1>
          <p className="mg__lead">
            App Login and Adaptive Access policies close on {closes}. The Policy builder replaces them with one policy for each application, made of rules. Migration brings your old policies over as drafts, so you review them before anything changes. This page covers the move, how the old policies work, what the builder changes, and where to find everything afterwards.
          </p>

          <section className="mg__film" aria-label="How migration works, as a film">
            <div className="bin is-film">
              <IntroFilm flat v="v1" player onStart={toConsole} onLater={toConsole} />
            </div>
          </section>

          <h2 id="process">The migration at a glance</h2>
          <ProcessWalk />
          <ul>
            <li>Old policies close on {closes}. Anything still in the old policies then is merged for you.</li>
            <li>You can move them yourself before that, and check each one as you go.</li>
            <li>Nothing changes for sign-ins until you make a policy active.</li>
          </ul>
          <Shot src="/guide/old-policies.png" alt="The old App Login Policies page with the migration banner" caption="The banner on the old policies page. Migrate my policies starts the move; See how it works opens this page." />

          <Callout>Nothing changes for sign-ins until you make a policy active. Old policies close on {closes}, and anything still in them then is merged for you.</Callout>

          <h2 id="old">How old policies work</h2>
          <p>In the old console a sign-in is decided by two separate kinds of policy, set up on two different pages: App Login Policy and Adaptive Access Policy. This is how they look today.</p>
          <OldWalk />

          <h3>App Login Policy</h3>
          <p>
            One App Login policy is one application and one group. Its list shows the policy name, group, application, first factor, and whether 2FA and Adaptive are on. Add Policy opens a form.
          </p>
          <Shot src="/guide/old-app-login-list.jpg" alt="The App Login Policies list in the live console" caption="App Login Policies: one row for each application and group." />
          <Shot src="/guide/old-app-login-form.jpg" alt="The Add Login Policy form" caption="Add Login Policy: application, group, name and first factor." />
          <ul>
            <li>
              <b>First factor.</b> How the group signs in first, for example a password.
            </li>
            <li>
              <b>Enable 2-Factor Authentication (MFA).</b> Turns on a second step. You pick the MFA method for the policy, or use the default method, and set how long a verification is remembered, in days, hours and minutes.
            </li>
            <li>
              <b>Force MFA</b> controls how often users are asked for MFA. <b>Allow MDM-managed devices</b> limits sign-ins to managed devices.
            </li>
            <li>
              <b>Enable Adaptive Authentication</b> attaches the policy to an Adaptive Access policy, which is where the checks live.
            </li>
          </ul>
          <Shot src="/guide/old-app-login-mfa.jpg" alt="The Add Login Policy form with 2-Factor Authentication turned on" caption="With 2-Factor Authentication on: the MFA method and how long a verification is remembered." />

          <h3>Adaptive Access Policy</h3>
          <p>
            An Adaptive Access policy holds the checks. Its list shows, for each policy, the IP, device and agent, location, time and the behaviour change. A policy is set up on three tabs.
          </p>
          <Shot src="/guide/old-adaptive-list.jpg" alt="The Adaptive Access Policies list in the live console" caption="Adaptive Access Policies: the checks and the behaviour change for each policy." />
          <ul>
            <li>
              <b>Policy Conditions.</b> IP based, Device based, Location based and Time based access restrictions.
            </li>
            <li>
              <b>Action for Behaviour Change.</b> What happens when a user’s behaviour changes: Allow, Challenge or Deny.
            </li>
            <li>
              <b>Email Alerts and Custom Error Message.</b> What to tell the user and the admin.
            </li>
          </ul>
          <Shot src="/guide/old-adaptive-conditions.jpg" alt="An Adaptive Access policy and its conditions" caption="An Adaptive Access policy: the four kinds of restriction." />
          <Shot src="/guide/old-adaptive-action.jpg" alt="The Action for Behaviour Change tab" caption="Action for Behaviour Change: Allow, Challenge or Deny." />

          <h3>How the two are joined</h3>
          <p>
            Back in the App Login policy, Enable Adaptive Authentication lets you choose the Adaptive Access policy and which restrictions apply: IP, Device, Location and Time. Apply Restrictions Using decides whether all of them must pass (AND) or at least one (OR).
          </p>
          <Shot src="/guide/old-app-login-adaptive.jpg" alt="The Adaptive Authentication section of an App Login policy" caption="Joining the two: which restrictions apply, and whether all or any must pass." />
          <ul>
            <li>The default group covers everyone not listed.</li>
            <li>Every application has its own policies, so the same check is copied from one application to the next.</li>
          </ul>

          <Callout>The same check is copied onto every application, so changing an IP range means editing every copy.</Callout>

          <h2 id="new">What the Policy builder changes</h2>
          <p>The new builder puts everything that decides a sign-in into one policy for the application.</p>
          <NewWalk />
          <ul>
            <li>
              <b>One application, one policy.</b> App Login and Adaptive Access are no longer two pages.
            </li>
            <li>
              <b>Rules, read from the top.</b> A rule says who it is for, what must be true, and how they sign in. The first rule that fits decides. The last rule, Everyone else, catches the rest.
            </li>
            <li>
              <b>Zones and device profiles, made once.</b> A network zone or a device profile is kept in your library and used by any rule, so a change is made in one place.
            </li>
            <li>
              <b>Check access.</b> Run a sign-in through your policies and see which rule decides it, before anything goes live.
            </li>
          </ul>
          <Shot src="/guide/builder.png" alt="The Policy builder showing one policy and its rules" caption="One policy in the builder: its rules, read from the top." />

          <Callout>One application has one policy. The first rule that fits decides, and Everyone else catches the rest.</Callout>

          <h2 id="convert">How old becomes new</h2>
          <p>Migration does the conversion for you. Each old piece lands in a known place.</p>
          <ConvertWalk />
          <p>
            Take Salesforce, with two group rows in App Login and an Adaptive Access check on the office network. After migration it is one draft policy: two rules for the groups, the check as a condition on the rule it belonged to, and Everyone else as the last rule.
          </p>

          <Callout>Check each draft against the old policy before you publish it. A draft decides nothing until you make it active.</Callout>

          <h2 id="steps">Move your policies</h2>
          <ol>
            <li>
              <b>Migrate.</b> Select Migrate my policies and confirm. Each old policy arrives as a draft in New policies.
            </li>
            <li>
              <b>Review.</b> Start review walks the drafts one by one in the builder. Compare each with the old policy it came from, then approve it.
            </li>
            <li>
              <b>Publish.</b> Publish the approved drafts. A published policy starts deciding sign-ins straight away.
              {!TESTER && ' Publish all can skip approval, and then asks you to take responsibility for the drafts nobody reviewed.'}
            </li>
          </ol>
          <Shot src="/guide/migrate-confirm.png" alt="The Start the migration confirm" caption="Before it starts, the move asks you to confirm." />
          <Shot src="/guide/new-policies.png" alt="New policies with migrated drafts and the review banner" caption="After the move: the drafts are in New policies, with a banner to start the review." />
          <Shot src="/guide/review-builder.png" alt="The builder with the Old policies panel beside the draft" caption="Review: the old policies a draft came from sit beside it in the builder." />
          <h3>When you publish</h3>
          <div className="mg__split">
            <div className="mg__box is-moves">
              <h3>
                <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />
                Moves
              </h3>
              <ul>
                <li>The policy starts deciding sign-ins straight away.</li>
                <li>It moves to New policies.</li>
              </ul>
            </div>
            <div className="mg__box">
              <h3>
                <History size={18} strokeWidth={1.75} aria-hidden />
                Stays
              </h3>
              <ul>
                <li>The old policies it came from stay readable in Old policies.</li>
                <li>Nothing is deleted.</li>
              </ul>
            </div>
          </div>
          <Shot src="/guide/publish-popup.png" alt="The publish confirm showing what moves and what stays" caption="The publish confirm says what moves and what stays." />
          <Callout>When you start the migration, the old pages are replaced and you can’t switch back to them.</Callout>

          <h2 id="find">Find your old policies</h2>
          <p>After the move, your old policies are still there, and each new policy says where it came from.</p>
          <FindDiagram />
          <Shot src="/guide/old-policies-tab.png" alt="The Old policies tab after migration" caption="The Old policies tab keeps every old policy readable." />

          <Callout>Publishing deletes nothing. Every old policy stays readable in Old policies.</Callout>

          <h2 id="make">How a policy is made now</h2>
          <ol>
            <li>
              <b>Start.</b> Select New policy and give it a name. It opens as a draft.
            </li>
            <li>
              <b>Choose how to begin.</b> Start from a template, reuse a policy you already have, or start from scratch.
            </li>
            <li>
              <b>Add rules.</b> For each rule, choose who it is for, what must be true, and how they sign in. Pick a zone or a device profile from your library for the conditions.
            </li>
            <li>
              <b>Check access.</b> Run a sign-in through the policy and see the rule that decides it.
            </li>
            <li>
              <b>Make it active.</b> A policy that is complete can be made active. Until then it stays a draft and changes nothing for sign-ins.
            </li>
          </ol>
          <Shot src="/guide/check-access.png" alt="Check access showing the rule that decides a sign-in" caption="Check access shows which rule decides a sign-in." />

          <Callout>A new policy stays a draft, and changes nothing for sign-ins, until you make it active.</Callout>

          <h2 id="blocked">What can’t move yet</h2>
          <p>A policy that can’t move stays in Old policies, with the reason beside it.</p>
          <table className="mg__table">
            <thead>
              <tr>
                <th scope="col">Reason shown</th>
                <th scope="col">What it means</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Its application no longer exists</td>
                <td>The application the old policy was for has been removed.</td>
              </tr>
              <tr>
                <td>Its group no longer exists</td>
                <td>The group the old row was for has been removed.</td>
              </tr>
              <tr>
                <td>Its policy is waiting for review</td>
                <td>That application already has a draft. Approve the draft first, then this one joins it.</td>
              </tr>
            </tbody>
          </table>

          <Callout>A policy that can’t move is not lost. It stays in Old policies, with the reason beside it.</Callout>

          <h2 id="faq">Questions</h2>
          <h3>Will sign-ins change when I migrate?</h3>
          <p>No. Migrated policies arrive as drafts. Nothing changes for sign-ins until you make a policy active.</p>
          <h3>Can I change a draft before I publish it?</h3>
          <p>Yes. Each draft opens in the Policy builder, where you can edit its rules.</p>
          <h3>Can I test a policy first?</h3>
          <p>Yes. Check access runs a sign-in through your policies and shows the rule that decides it, before anything goes live.</p>
          <h3>Is my old policy deleted when I publish?</h3>
          <p>No. Old policies stay readable in the Old policies tab.</p>
          <h3>What happens if I don’t migrate by {closes}?</h3>
          <p>Anything still in the old policies then is merged for you.</p>
        </main>

        <nav className="mg__toc" aria-label="On this page">
          <b>On this page</b>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={on === s.id ? 'is-on' : ''} aria-current={on === s.id ? 'true' : undefined}>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
