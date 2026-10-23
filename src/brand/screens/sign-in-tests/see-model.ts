import { DEFAULT_DENY_MESSAGE, TENANT_DENY_CONTACT } from '../../data'
import { scriptOf } from '../testing/player/script'
import { promptText, type ScreenStep, type SignInScreens } from '../testing/screens-of'

/* -----------------------------------------------------------------------------
   WHAT THEY SEE, AS A PAGE OF THE DETAILS PANEL (owner, 20 Oct 2026, on the
   Preview's popover: "open in the right side panel as a specific view, with
   context and the important information that we can show").

   What the page says beside the played sign-in (testing/player): the steps the
   player's chips name, in order, each with what that page asks for; and what the
   person is told — a Deny's message, its next step and its contact, or on an
   allow the factors they are asked for. PURE: it reads the pages screens-of.ts
   built and the film the player plays (script.ts `scriptOf`), so the list and
   the chips can never name different steps.

   The deny REASON and its Ref code are the admin's (5 Oct 2026 ruling): the
   panel says them under their own heading, never inside the end-user's page.
   -------------------------------------------------------------------------- */

/** One step of the sign-in, as the player's chip names it, with what its page asks for. */
export interface SeeStep {
  n: number
  label: string
  asks: string
}

/* What a page asks for, in the page's own words (screens-of.ts `promptText`). The password page follows the username
   page inside one step, as the film plays it. */
function asksOf(step: ScreenStep): string {
  if (step.kind === 'password') return 'Enter your username, then your password'
  if (step.kind === 'deny') return 'The deny message'
  return promptText(step)
}

/** The steps of one decision's pages, as the player's chips name them: "1 Password · 2 Signed in", "1 Username · 2 Access denied". */
export function seeSteps(screens: SignInScreens, appName: string): SeeStep[] {
  const script = scriptOf(screens, { appName, person: screens.person ?? null })
  const { chips, end } = script
  /* A refusal before any factor plays the username page first, as a chip of its own. */
  const lead = screens.steps[0]?.kind === 'deny' ? 1 : 0
  const last = chips.length - 1
  return chips.map((label, i) => {
    let asks: string
    if (lead === 1 && i === 0) asks = 'Enter your username'
    else if (i === last && end === 'signed-in') asks = `${appName} opens`
    else if (i === last && end === 'stuck') asks = 'The sign-in stops here'
    else {
      const step = screens.steps[i - lead]
      asks = step ? asksOf(step) : ''
    }
    return { n: i + 1, label, asks }
  })
}

/** What the person is told: a Deny's own words, or the factors an allow asks them for. */
export type SeeTold =
  | { kind: 'deny'; message: string; rows: [string, string][] }
  | { kind: 'allow'; rows: [string, string][] }

export function seeTold(screens: SignInScreens): SeeTold {
  const deny = screens.steps.find((s): s is Extract<ScreenStep, { kind: 'deny' }> => s.kind === 'deny')
  if (deny) {
    const rows: [string, string][] = []
    if (deny.action) rows.push(['Next step', deny.action])
    rows.push(['Contact', deny.contact ?? TENANT_DENY_CONTACT])
    return { kind: 'deny', message: deny.message || DEFAULT_DENY_MESSAGE, rows }
  }
  const rows: [string, string][] = []
  for (const s of screens.steps) {
    if (s.kind === 'password') rows.push(['First factor', 'Password'])
    else if (s.kind === 'first-method') rows.push(['First factor', s.method])
    else if (s.kind === 'second') {
      rows.push(['Second factor', s.method ? s.name : `${s.name} (not available)`])
      if (s.rememberDays !== null) rows.push(['Remembered for', s.rememberDays === 1 ? '1 day' : `${s.rememberDays} days`])
    }
  }
  return { kind: 'allow', rows }
}
