/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Group, User } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { SignInTests, type SignInTestsTab } from './SignInTests'
import { attemptPlay, runBreakInOnApp } from './break-in-app'
import { ATTEMPTS_PANEL_ID } from './sign-in-tests/attempts'
import { BreakInPanel, type BreakInPanelProps } from './sign-in-tests/BreakInPanel'
import { readersOf } from './sign-in-tests/engine-run'
import { HowItWorks } from './sign-in-tests/HowItWorks'
import { defaultPeopleContext, firstDecidedApp } from './sign-in-tests/library'
import { TryJourney } from './sign-in-tests/TryJourney'
import { TryPanel, type TryPanelProps } from './sign-in-tests/TryPanel'
import {
  GROUPS_HEADING,
  GROUP_PREFIX,
  PANEL_ID,
  PEOPLE_HEADING,
  cardIssues,
  emptyDraft,
  factTokens,
  groupNamesOf,
  initialTryPage,
  issueToken,
  memberOf,
  newSignInPage,
  peopleTryForm,
  personPick,
  personPickerOptions,
  tokenTips,
  tryingPage,
  type TryPage,
} from './sign-in-tests/sign-in-card'
import { envOf, resolveSignIn } from './tenant-resolver'
import { boundariesOf } from './testing/boundaries'
import { rowsRead } from './testing/rows-read'
import { personRows } from './testing/selectors'
import { TestingSessionProvider } from './testing/session'
import { TestingSessionContext, initialSession, type TestingSession } from './testing/session-state'
import { factsOf, formOf, type SignInForm } from './testing/sign-in-form'
import { tokenDomId } from './testing/sign-in-sentence'
import shellSrc from '../Shell.tsx?raw'
import mainSrc from '../../main.tsx?raw'
import pageSrc from './SignInTests.tsx?raw'
import boardBarSrc from './board/BoardBar.tsx?raw'
import tryPageSrc from './sign-in-tests/TryJourney.tsx?raw'
import panelSrc from './sign-in-tests/TryPanel.tsx?raw'
import nodeSrc from './sign-in-tests/SignInCard.tsx?raw'
import hiwSrc from './sign-in-tests/HowItWorks.tsx?raw'
import identSrc from './sign-in-tests/IdentityField.tsx?raw'
import phaseSrc from './sign-in-tests/phase.ts?raw'
import attemptsSrc from './sign-in-tests/BreakInPanel.tsx?raw'
import attemptsModelSrc from './sign-in-tests/attempts.ts?raw'
import pageCss from './sign-in-tests/sign-in-tests.css?raw'
import barCss from './sign-in-tests/try-bar.css?raw'

/* The tenant's Sign-in tests page in the POLICY BUILDER'S layout (Policy
   testing V4, §14): the rail shut to its icons, the builder's bar ("← Policies
   › Sign-in tests", Saved sign-ins, Try a sign-in), the builder's region —
   the dotted ground, the canvas in the middle track, the floating panel in
   the right one, shut until it is asked for (owner, 30 Sep) — and the panel
   is the sign-in form in the rule Inspector's chrome, Run in its foot. The canvas explains itself before the first run
   and draws the run in one vertical column. The run itself (the engine's
   plan, the chain) is pinned in engine-run.test.ts and journey-ui.test.tsx;
   this is the page, the panel, the empty canvas and the wires between them. */

const page = (tab?: SignInTestsTab) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <SignInTests tab={tab} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
/** CSS without its comments. */
const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** The markup from `open`'s element to the end of its closing tag, by a unique class. */
function block(markup: string, tag: string, cls: string): string {
  const at = markup.indexOf(`<${tag} class="${cls}`)
  expect(at, cls).toBeGreaterThan(-1)
  let depth = 0
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  re.lastIndex = at
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return markup.slice(at, m.index + m[0].length)
  }
  return markup.slice(at)
}

/* The canvas alone, as the page would hand it `page`, with the testing
   session at run `runId` — the canvas plays a run newer than the one it has played. */
function canvas(p: TryPage, form: SignInForm, runId: number) {
  const noop = () => {}
  const session: TestingSession = {
    ...initialSession(form),
    runId,
    patch: noop,
    patchBoard: noop,
    loadBoard: noop,
    load: noop,
    replay: noop,
    setView: noop,
    openBreakIn: noop,
    closeBreakIn: noop,
  }
  return renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionContext.Provider value={session}>
        <TryJourney page={p} onPage={noop} />
      </TestingSessionContext.Provider>
    </BrandProvider>,
  )
}

const TODAY = '2026-09-29'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const arun: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'github' }
const settled = (form: SignInForm): TryPage => ({ ...initialTryPage(2, TODAY, '09:30', form), mode: 'journey', played: 2 })

/* The panel alone, holding `form`. */
function panel(form: SignInForm, over: Partial<TryPanelProps> = {}) {
  const rows = rowsRead(t.policies, null, form.appId, lib)
  const noop = () => {}
  const props: TryPanelProps = {
    title: 'Sign-in',
    form,
    rows,
    issues: [],
    boundaries: boundariesOf(form, rows, {}, t.policies, env, t.zones),
    tips: form.appId ? tokenTips(readersOf(t.policies, form.appId, lib)) : {},
    reduced: false,
    asGroup: null,
    onPerson: noop,
    onPatch: noop,
    onRun: noop,
    saved: t.savedSignIns ?? [],
    onUseSaved: noop,
    savedOpen: false,
    onSavedOpen: noop,
    ran: null,
    saveOpen: false,
    onSaveOpen: noop,
    wide: true,
    onToggleWidth: noop,
    onClose: noop,
    ...over,
  }
  return renderToStaticMarkup(
    <BrandProvider>
      <TryPanel {...props} />
    </BrandProvider>,
  )
}
const rowId = (token: Parameters<typeof tokenDomId>[1]) => tokenDomId(PANEL_ID, token)

describe('Sign-in tests — the builder’s layout (§14.1)', () => {
  const out = page('try')

  it('is the builder’s two bands: its bar, then its region — no page head, no crumb row, no tabs', () => {
    expect(out).toMatch(/^<div class="sit[^"]*" data-stage="(light|dark)">/)
    const bar = out.indexOf('<header class="bbtop">')
    const region = out.indexOf('<div class="bb sit__bb')
    expect(bar).toBeGreaterThan(-1)
    expect(region).toBeGreaterThan(bar)
    expect(out).not.toContain('bpage__head')
    expect(out).not.toContain('bpage__crumbs')
    expect(out).not.toContain('role="tablist"')
    expect(out).not.toContain('role="tabpanel"')
    expect(out).not.toContain('sitl')
  })

  it('the bar reads “← Policies › Access checks”, with no status and no rename', () => {
    const bar = block(out, 'header', 'bbtop')
    expect(bar).toContain('aria-label="Back to policies"')
    expect(bar).toContain('<button type="button" class="bbtop__crumb">Policies</button>')
    expect(bar).toContain('lucide-chevron-right')
    expect(bar).toMatch(/<h1 class="bbtop__title" title="Access checks">Access checks<\/h1>/)
    expect(bar).not.toContain('bx-status')
    expect(bar).not.toContain('aria-label="Rename"')
    /* Additive: the builder's own bar is as it was, beside the plain one. */
    expect(boardBarSrc).toContain('export function BoardBarPlain({ title, actions }: { title: string; actions?: ReactNode })')
    expect(boardBarSrc).toContain('<StatusControl policyId={policy.id}')
    expect(pageSrc).toContain('<BoardBarPlain')
  })

  /* The page's ways in moved into the canvas (owner, 1 Oct 2026: "move these
     two buttons inside the canvas as the two main buttons"), and Saved
     sign-ins went to a later phase: the bar is where you are, and nothing
     else. Then the form came open on arrival (owner, the same day: "when we
     come inside I don't want the button, so by default open the right side
     as the first-time view"): the canvas draws no Check access while it is. */
  it('the bar holds no buttons, and on arrival nor does the canvas: the form is open beside it, Run its one orange', () => {
    const bar = block(out, 'header', 'bbtop')
    expect(bar).not.toContain('sit__savedbtn')
    /* While the run's layouts are compared (phase.ts), the bar carries only the comparison tools: the Canvas
       dropdowns, the dedicated views, Reasoning and the Guided tour to come — never an orange button. */
    expect(bar).not.toContain('bx-btn--brand')
    expect(bar).toContain('aria-label="Dedicated views"')
    expect(pageSrc).toContain('CANVAS_OPTIONS ? (')
    expect(out).not.toContain('hiw__act')
    expect(out).toContain('<aside class="bb__insp sit-panel"')
    const orange = out.match(/<button[^>]*bx-btn--brand[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(orange.map(text)).toEqual(['Run'])
    /* The door stays in the code: shut, the panel's way back; inside a policy, pressed while the form is open. */
    expect(hiwSrc).toContain("const door = doorWhileOpen || open !== 'form'")
    expect(hiwSrc).toContain("variant={primary && open !== 'form' ? 'brand' : 'secondary'}")
    expect(hiwSrc).toContain("pressed={open === 'form'}")
    expect(tryPageSrc).toContain(
      '<HowItWorks reduced={reduced} onCheck={onPressNode} onSaved={onSaved ? onSavedNow : undefined} open={panel} primary={!policy} doorWhileOpen={!!policy} />',
    )
    expect(rules(pageCss)).toMatch(/\.hiw__act \.bx-btn\[aria-pressed='true'\] \{\s+background: var\(--accent-soft\);/)
  })

  it('shut before a run, the empty canvas draws Check access again: the page’s one orange, the way back to the form', () => {
    const shut = canvas(initialTryPage(1, TODAY, '09:30'), emptyDraft(TODAY, '09:30'), 1)
    const go = block(shut, 'div', 'hiw__act')
    expect(text(go)).toBe('Check access')
    expect(go).toMatch(/class="bx-btn bx-btn--brand/)
    expect(go).toContain('aria-pressed="false"')
    expect(go).toContain('lucide-log-in')
    expect(go).not.toContain('disabled')
    /* Inside a policy the door stays while the form is open, pressed and secondary. */
    const inPolicy = renderToStaticMarkup(
      <BrandProvider>
        <HowItWorks onCheck={() => {}} open="form" primary={false} />
      </BrandProvider>,
    )
    const pressed = block(inPolicy, 'div', 'hiw__act')
    expect(pressed).toContain('aria-pressed="true"')
    expect(pressed).not.toContain('bx-btn--brand')
    /* On the page, open: no door at all, and no empty row where it stood. */
    const open = renderToStaticMarkup(
      <BrandProvider>
        <HowItWorks onCheck={() => {}} open="form" doorWhileOpen={false} />
      </BrandProvider>,
    )
    expect(open).not.toContain('hiw__act')
    expect(open).not.toContain('bx-btn')
  })

  it('Run is the one orange in the panel’s foot: never disabled, with its shortcut', () => {
    const o = panel(emptyDraft(TODAY, '09:30'))
    expect(o.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
    const foot = block(o, 'div', 'bb__inspfoot sit-panel__foot')
    const run = foot.match(/<button[^>]*bx-btn--brand[^>]*>[\s\S]*?<\/button>/)![0]
    expect(text(run)).toBe('Run')
    expect(run).not.toContain('disabled')
    expect(run).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"')
    expect(run).toContain('lucide-play')
    /* Nothing to save before a run. */
    expect(o).not.toContain('Save sign-in')
  })

  it('the region is the builder’s: the canvas in the middle track, the panel open on the form in the right one on arrival', () => {
    const region = block(out, 'div', 'bb sit__bb')
    expect(region).toMatch(/^<div class="bb sit__bb" style="--bb-insp:560px;--bb-z:1">/)
    expect(region).toContain('<div class="sit__stage">')
    expect(region).toContain('<aside class="bb__insp sit-panel"')
    expect(region.indexOf('<div class="sit__stage">')).toBeLessThan(region.indexOf('sit-panel'))
    /* Shut, its track closes and the canvas has the whole width; the panel floats in the right-hand track, after the stage, under AnimatePresence. */
    expect(pageSrc).toContain("className={`bb sit__bb${anyPanel ? '' : ' is-insp-closed'}`}")
    expect(pageSrc).toMatch(/<AnimatePresence initial=\{false\}>\s+\{panelOpen && \(\s+<TryPanel\s+key="panel"/)
    expect(pageSrc.indexOf('<div className="sit__stage">')).toBeLessThan(pageSrc.indexOf('<AnimatePresence'))
    /* The form, or (a later phase) the saved sign-ins: one panel at a time — the form on an empty canvas's arrival, none on a revisit's run. */
    expect(pageSrc).toContain("const [panel, setPanel] = useState<'form' | 'saved' | 'why' | 'break-in' | null>(() => (tryPage.mode === 'form' ? 'form' : null))")
    expect(pageSrc).toContain("const panelOpen = panel === 'form'")
    expect(rules(pageCss)).toMatch(/\.sit__stage \{[^}]*grid-column: 2;[^}]*grid-row: 1;[^}]*position: relative;/)
    /* The journey's canvas stands on the region's ground, not a frame of its own.
       Scoped to the stage, not the page, since 1 Oct: the builder's Check access
       stands the same canvas on a `.sit__stage` of its own (board/PolicyCheck.tsx). */
    expect(rules(pageCss)).toContain('.sit__stage .tj-canvas { border: 0; border-radius: 0; background: none; }')
    expect(rules(pageCss)).toContain('.sit__stage .tj-canvas::before { content: none; }')
    /* The builder's sheet comes with the page: it may be the first of the two opened. */
    expect(pageSrc).toContain("import './board/board.css'")
  })

  it('the rail shuts to its icons on arrival, as for the builder, and comes back on the way out', () => {
    expect(shellSrc).toContain("const BUILDER_SCREENS = ['builder', 'board']")
    expect(shellSrc).toContain("const RAIL_SHUT_SCREENS = [...BUILDER_SCREENS, 'sign-in-tests']")
    expect(shellSrc).toMatch(/if \(RAIL_SHUT_SCREENS\.includes\(screen\.name\)\) \{\s+setCollapsed\(\(c\) => \{\s+if \(!c\) autoCollapsed\.current = true/)
    expect(shellSrc).toMatch(/\} else if \(autoCollapsed\.current\) \{\s+autoCollapsed\.current = false\s+setCollapsed\(false\)/)
  })

  it('no tabs: the tables are locked off by one constant, their code kept; every route lands on the surface', () => {
    expect(pageSrc).toContain('const TABLES: boolean = false')
    for (const kept of ['<SavedTable', '<PeopleTable', '<RunsReport onTry={tryForm} />']) expect(pageSrc).toContain(kept)
    for (const tab of [undefined, 'try', 'saved', 'people', 'runs'] as const) {
      const o = page(tab)
      expect(o, String(tab)).toContain('<section class="hiw"')
      expect(o, String(tab)).toContain('<aside class="bb__insp sit-panel"')
      expect(o, String(tab)).toContain('class="tj-canvas"')
      expect(o, String(tab)).not.toContain('sitl')
    }
    /* A route to Saved sign-ins opens their panel — once they are in this phase (phase.ts). */
    expect(pageSrc).toMatch(/useEffect\(\(\) => \{\s+if \(SAVED_SIGN_INS && !TABLES && routeTab === 'saved'\) setPanel\('saved'\)\s+\}, \[routeTab\]\)/)
  })

  it('is not in the rail, and lights Policies and All Policies', () => {
    expect(shellSrc).not.toContain("label: 'Sign-in tests'")
    const screens = shellSrc.slice(shellSrc.indexOf('const POLICY_SCREENS = ['), shellSrc.indexOf(']', shellSrc.indexOf('const POLICY_SCREENS = [')))
    expect(screens).toContain("'sign-in-tests'")
    expect(shellSrc).toContain("policies: [...BUILDER_SCREENS, 'policy-details', 'sign-in-tests']")
  })
})

describe('Sign-in tests — the panel (§14.2)', () => {
  it('is the Inspector’s card: a header row with the sign-in’s name, the >< toggle and its X, a body, a sticky foot', () => {
    const o = panel(emptyDraft(TODAY, '09:30'))
    expect(o).toMatch(/^<aside class="bb__insp sit-panel" aria-labelledby="[^"]+"/)
    const close = o.match(/<button[^>]*aria-label="Close the panel"[^>]*>[\s\S]*?<\/button>/)![0]
    expect(close).toContain('lucide-x')
    expect(o.indexOf('aria-label="Narrow the panel"')).toBeLessThan(o.indexOf('aria-label="Close the panel"'))
    expect(o).toMatch(/<div class="bb__inspbar is-rule"><h2 id="[^"]+" class="sit-panel__title" title="Sign-in">Sign-in<\/h2>/)
    expect(o).toContain('aria-label="Narrow the panel"')
    expect(panel(emptyDraft(TODAY, '09:30'), { wide: false })).toContain('aria-label="Widen the panel"')
    expect(o.indexOf('class="bb__inspbody"')).toBeLessThan(o.indexOf('class="bb__inspfoot sit-panel__foot"'))
    /* A saved sign-in loaded: its name heads the panel (the page clears it on a change). */
    expect(panel(arun, { title: 'Arun Patel in the office' })).toContain('title="Arun Patel in the office">Arun Patel in the office</h2>')
    /* The loaded sign-in is held whole now — its name, the form and what it expects (the answer says "Expected …" when it fails). */
    expect(pageSrc).toContain('title={loaded?.name ?? ACCESS_CHECK}')
    expect(pageSrc).toMatch(/setTryPage\(\(pg\) => \(\{ \.\.\.pg, draft: next, touched \}\)\)\s+setLoaded\(null\)/)
  })

  /* Entra's What If, in order (owner, 1 Oct 2026: "an Entra-style thing:
     first select the identity, with the identity type; the list of users
     and groups as we have it in policy creation … call it Application …
     Sign-in conditions"). Use a saved sign-in is a later phase. */
  it('empty: Identity — its type, then the builder’s Who row — and Application, in the Inspector’s section grammar; no saved sign-ins in this phase', () => {
    const o = panel(emptyDraft(TODAY, '09:30'))
    const body = block(o, 'div', 'bb__inspbody')
    expect(body).not.toContain('sit-panel__saved')
    expect(panelSrc).toContain('{SAVED_SIGN_INS && anySaved && (')
    expect(phaseSrc).toContain('export const SAVED_SIGN_INS: boolean = false')
    const heads = [...body.matchAll(/<div class="bb__sec__head"><h3 id="[^"]+"><svg[^>]*class="lucide lucide-([a-z-]+)[^"]*"[^>]*>[\s\S]*?<\/svg>([^<]+)<\/h3>/g)].map((m) => [m[1], m[2]])
    expect(heads).toEqual([
      ['users', 'Identity'],
      ['app-window', 'Application'],
    ])
    const ident = block(body, 'div', 'sit-ident')
    expect(ident).toContain('aria-label="Identity type"')
    expect(ident.indexOf('aria-label="Identity type"')).toBeLessThan(ident.indexOf(`id="${rowId('person')}"`))
    expect(ident).toContain(`<div id="${rowId('person')}" class="bb__whorow is-empty">`)
    expect(text(ident)).toContain('None selected yet')
    expect(ident).toContain('aria-label="Choose a user"')
    expect(body).toContain('aria-label="Application"')
    expect(text(body)).toContain('Choose an application')
    expect(text(body)).not.toContain('Sign-in conditions')
    expect(factTokens({ appId: null }, rowsRead(t.policies, null, null, lib))).toEqual([])
  })

  it('Identity: User or Group, chosen from the builder’s Who dialog for one — a person with every group, a group standing for one of its members', () => {
    /* A person in two groups says both, and that the outcome shows each (the owner's Tanmay case). */
    const maya = panel({ ...arun, personId: 'u-maya' })
    const ident = block(maya, 'div', 'sit-ident')
    expect(ident).toContain(`<div id="${rowId('person')}" class="bb__whorow is-set">`)
    expect(text(ident)).toContain('Maya Iyer')
    expect(text(ident)).toContain('Member of Engineering Finance')
    expect(text(ident)).toContain('In 2 groups: the outcome shows what each group gets.')
    expect(ident).toContain('aria-label="Change the user"')
    /* One choice: the builder's dialog rows, round ticks, a press chooses and closes. */
    expect(identSrc).toContain('<Modal')
    expect(identSrc).toContain('role="radiogroup"')
    expect(identSrc).toMatch(/className=\{`bb__whoitem\$\{on \? ' is-on' : ''\}`\} onClick=\{\(\) => onPick\(r\.value\)\}/)
    expect(rules(pageCss)).toContain('.sit-ident__list .bx-tick { border-radius: 50%; }')
    /* Changing the type opens the other kind's list; closed without a choice, the type is what it was. */
    expect(identSrc).toContain('onChange={(v) => setPicking(v as Kind)}')
    expect(identSrc).toContain('const kind = picking ?? held')
  })

  it('an application chosen: Sign-in conditions holds only the facts its rules read, each a condition row with a TipDot naming the reader', () => {
    const o = panel(arun)
    expect(text(o)).toContain('Sign-in conditions')
    expect(factTokens(arun, rowsRead(t.policies, null, 'github', lib))).toEqual(['from', 'device'])
    for (const tk of ['from', 'device'] as const) expect(o).toContain(`id="${rowId(tk)}"`)
    for (const tk of ['when', 'risk'] as const) expect(o).not.toContain(`id="${rowId(tk)}"`)
    const network = o.match(new RegExp(`<button[^>]*id="${rowId('from')}"[^>]*>`))![0]
    expect(network).toContain('class="cp__fld is-val sit-fact__val"')
    expect(network).toContain('aria-haspopup="dialog"')
    expect(network).toContain('aria-label="Network: Office network"')
    expect(o).toContain('aria-label="Device: Windows 11 laptop · registered"')
    /* Attribute · value: the builder's condition frame, the what half not a control. */
    expect(o).toMatch(/<div class="cp__stack"><div class="cp__stackrow"><span class="cp__fld is-what sit-fact__what">/)
    expect(o).toContain('aria-label="What reads network"')
    expect(o).toContain('aria-label="What reads device"')
    /* Named from the tenant's policies (engine-run.ts `readersOf`), so pinned by shape, not by the seed's words. */
    const tips = tokenTips(readersOf(t.policies, 'github', lib))
    expect(Object.keys(tips).sort()).toEqual(['device', 'from'])
    expect(tips.from).toMatch(/^Read by .*Developer tools — office and device checks · Rules? \d/)
    expect(tips.device).toMatch(/^Read by .*Developer tools — office and device checks · Rules? \d/)
    /* The value opens the sentence's own panel for that fact. */
    expect(panelSrc).toContain('<SentenceTokenPanel')
    expect(panelSrc).toContain("import '../condition-popover.css'")
  })

  it('the facts slide in, 60 ms apart, by motion props; drawn at once under reduced motion', () => {
    expect(panelSrc).toContain('initial={!reduced && at >= 0 ? { opacity: 0, y: -6 } : false}')
    expect(panelSrc).toContain('delay: Math.max(0, at) * 0.06')
    expect(panelSrc).toMatch(/<motion\.div\s+key=\{t\}\s+className="sit-fact"/)
    expect(rules(pageCss)).not.toMatch(/\.sit-fact\b[^{]*\{[^}]*(transform|transition)/)
  })

  it('Run with a person or an application missing: the reason under that row, the picker marked — Run stays pressable', () => {
    const draft = emptyDraft(TODAY, '09:30')
    const issues = cardIssues(draft, rowsRead(t.policies, null, null, lib), t.zones)
    expect(issueToken(issues)).toBe('person')
    const o = panel(draft, { issues })
    const who = block(o, 'div', 'sit-ident')
    expect(who).toContain(`<div id="${rowId('person')}" class="bb__whorow is-empty is-invalid">`)
    expect(who).toMatch(/<p class="bb__diag is-error" role="alert"><svg[^>]*lucide-circle-x[^>]*>[\s\S]*?<\/svg><span>Choose a person<\/span><\/p>/)
    expect(o).toMatch(/<span>Choose an application<\/span><\/p>/)
    expect(o.match(/<button[^>]*bx-btn--brand[^>]*>/)![0]).not.toContain('disabled')
    /* The run door opens the panel and takes the focus to that row instead of running. */
    expect(pageSrc).toMatch(/if \(found\.length > 0\) \{\s+setSubmitted\(true\)\s+openPanel\(\(\) => focusRow\(issueToken\(found\)\)\)\s+return/)
  })

  it('after a run: no Save sign-in in this phase — Run alone in the foot, the one orange', () => {
    const o = panel(arun, { ran: { form: arun, shown: '1fa' } })
    const foot = block(o, 'div', 'bb__inspfoot sit-panel__foot')
    expect(foot).not.toContain('Save sign-in')
    expect(o.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
    expect(panelSrc).toContain('{SAVED_SIGN_INS && ran && !unrun && (')
    /* Kept for the phase that brings it back: the Inspector tints its foot's secondary with the brand; here it stays neutral. */
    expect(rules(pageCss)).toMatch(/\.sit-panel \.bb__inspfoot \.bx-btn--neutral \{\s+background: var\(--int-neutral-bg\);/)
  })

  it('on demand: Run and a saved sign-in shut it and hand the focus to the canvas; its X and Escape shut it', () => {
    expect(pageSrc).toMatch(/const f = loaded && same\(draft, loaded\.form\) \? loaded\.form : forRun\(draft, rows\)\s+const prev = tryPage\.mode === 'journey' && !same\(f, session\.form\) \? session\.form : null\s+const askSaveFor = tryPage\.askSaveFor\s+toCanvas\(\(\) => start\(f, 'full', \{ askSaveFor, prev \}\)\)/)
    /* The panel slides out first; the run begins on the whole canvas once it has gone. */
    expect(pageSrc).toMatch(/const toCanvas = \(begin: \(\) => void\) => \{\s+const wasOpen = panel !== null\s+setPanel\(null\)\s+setSaveOpen\(false\)\s+setSavedAt\(null\)/)
    expect(pageSrc).toMatch(/const go = \(keepFocus: boolean\) => \{\s+begin\(\)\s+if \(!keepFocus\) setFocusRun\(\(n\) => n \+ 1\)\s+\}/)
    expect(pageSrc).toMatch(/if \(wasOpen && !reduced\) \{\s+const wait = \{ timer: 0, keepFocus: false \}\s+wait\.timer = window\.setTimeout\(\(\) => \{\s+if \(leaving\.current === wait\) leaving\.current = null\s+go\(wait\.keepFocus\)\s+\}, LEAVE_MS\)/)
    /* Reopened while the run waits to begin: it still begins, and the focus stays in the panel; the timer goes with the page. */
    expect(pageSrc).toContain('if (leaving.current) leaving.current.keepFocus = true')
    expect(pageSrc).toContain('if (leaving.current) window.clearTimeout(leaving.current.timer)')
    expect(pageSrc).toContain('focusRun={focusRun}')
    /* The canvas takes the focus two frames on: Skip, Replay, else the canvas itself. */
    expect(tryPageSrc).toContain("const to = skipRef.current ?? replayRef.current?.querySelector<HTMLElement>('button') ?? canvasRef.current")
    expect(pageSrc).toContain('onClose={() => closePanel(true)}')
    /* Escape, on the way down, unless something open over the panel takes it. */
    expect(pageSrc).toContain(`if (document.querySelector('.sit-panel [aria-expanded="true"]')) return`)
    expect(pageSrc).toMatch(/document\.addEventListener\('keydown', onKey, true\)\s+return \(\) => document\.removeEventListener\('keydown', onKey, true\)\s+\}, \[anyPanel\]\)/)
    /* Shut, the focus goes back to the canvas: its Check access, else Replay or the sentence. */
    expect(pageSrc).toContain("const ways = Array.from(document.querySelectorAll<HTMLElement>('.sit__stage .hiw__act button'))")
  })

  it('slides in and out by motion props, inert on its way out; at once under reduced motion; its width held while the track closes', () => {
    expect(panelSrc).toContain("import { motion, useIsPresent } from 'motion/react'")
    expect(panelSrc).toContain('inert={!present || undefined}')
    expect(panelSrc).toContain('initial={reduced ? false : { opacity: 0, x: 24 }}')
    expect(panelSrc).toContain('exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}')
    const css = rules(pageCss)
    expect(css).toMatch(/\.sit-panel\.bb__insp \{\s+justify-self: end;\s+width: calc\(min\(var\(--bb-insp\), 46cqw\) - var\(--space-5\)\);\s+animation: none;\s+\}/)
    expect(css).toContain('.sit > .sit__bb { container-type: inline-size; }')
  })

  it('Ctrl/⌘+Enter presses Run from anywhere on the page, before a focused picker takes the Enter', () => {
    expect(pageSrc).toMatch(/if \(e\.key !== 'Enter' \|\| !\(e\.ctrlKey \|\| e\.metaKey\) \|\| e\.defaultPrevented\) return\s+e\.preventDefault\(\)\s+e\.stopPropagation\(\)\s+runLatest\.current\(\)/)
    expect(pageSrc).toContain("document.addEventListener('keydown', onKey, true)")
  })

  it('a saved sign-in — its panel and the form’s row — fills the panel and names it, and Run takes the focus (only Run runs, 2 Oct)', () => {
    const tried = pageSrc.slice(pageSrc.indexOf('const trySaved = (sv: SavedSignIn) => {'), pageSrc.indexOf('/* The form has changes'))
    expect(tried).toMatch(/const f = formOf\(sv\.facts, zones\)\s+setAsGroup\(null\)\s+setLoaded\(\{ name: sv\.name, form: f, expected: sv\.expected \}\)\s+setTryPage\(\(pg\) => \(\{ \.\.\.pg, draft: f, touched: \[\] \}\)\)/)
    expect(tried).toContain('openPanel(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(RUN_BUTTON)?.focus()))')
    expect(tried).not.toContain('start(')
    expect(tried).not.toContain('toCanvas(')
    expect(pageSrc).toContain("savedOpen={savedAt === 'panel'}")
    expect(pageSrc).toMatch(/\{panel === 'saved' && \(\s+<SavedPanel/)
    expect(pageSrc).toContain('const anySaved = SAVED_SIGN_INS && savedSignIns.some((sv) => !sv.generated)')
    expect(pageSrc).toContain('onSaved={anySaved ? openSaved : undefined}')
  })
})

describe('Sign-in tests — the Person picker (§13.3)', () => {
  const groups: Group[] = [
    { id: 'eng', name: 'Engineering', memberCount: 2 },
    { id: 'fin', name: 'Finance', memberCount: 2 },
    { id: 'ops', name: 'Operations', memberCount: 0 },
  ]
  const person = (id: string, groupId: string, alsoGroupIds?: string[]): User => ({
    id,
    name: id,
    email: `${id}@mo.com`,
    groupId,
    ...(alsoGroupIds ? { alsoGroupIds } : null),
    userType: 'Employee',
    role: 'Member',
  })
  const maya = person('Maya', 'eng', ['fin'])
  const users = [maya, person('Ravi', 'eng'), person('Priya', 'fin')]

  it('lists real people with every group they are in on the second line, then the groups with somebody in them', () => {
    const opts = personPickerOptions(users, groups)
    expect(opts.slice(0, 3)).toEqual([
      { value: 'Maya', label: 'Maya', meta: 'Engineering, Finance', group: PEOPLE_HEADING },
      { value: 'Ravi', label: 'Ravi', meta: 'Engineering', group: PEOPLE_HEADING },
      { value: 'Priya', label: 'Priya', meta: 'Finance', group: PEOPLE_HEADING },
    ])
    expect(opts.slice(3)).toEqual([
      { value: `${GROUP_PREFIX}eng`, label: 'Anyone in Engineering', group: GROUPS_HEADING },
      { value: `${GROUP_PREFIX}fin`, label: 'Anyone in Finance', group: GROUPS_HEADING },
    ])
    expect(groupNamesOf(maya, groups)).toEqual(['Engineering', 'Finance'])
  })

  it('a group tests a member of just that group, never one who is in a second group too', () => {
    expect(memberOf(users, 'eng')?.id).toBe('Ravi')
    expect(memberOf(users, 'fin')?.id).toBe('Priya')
    expect(memberOf([maya], 'fin')?.id).toBe('Maya')
    expect(memberOf(users, 'ops')).toBeNull()
    expect(personPick(`${GROUP_PREFIX}fin`, users)).toEqual({ personId: 'Priya', asGroup: 'fin' })
    expect(personPick('Maya', users)).toEqual({ personId: 'Maya', asGroup: null })
  })

  it('the Identity row shows the group while its member runs, and who that is', () => {
    const o = panel({ ...arun, personId: 'priya' }, { asGroup: 'finance' })
    const ident = block(o, 'div', 'sit-ident')
    expect(ident).toContain(`<div id="${rowId('person')}" class="bb__whorow is-set">`)
    expect(text(ident)).toContain('Finance')
    expect(text(ident)).toMatch(/Tested as \S/)
    expect(pageSrc).toMatch(/const pickPerson = \(value: string, now = false\) => \{\s+const pick = personPick\(value, users\)\s+setAsGroup\(pick\.asGroup\)\s+patch\(\{ personId: pick\.personId \}, 'person', now\)/)
  })
})

describe('Sign-in tests — the canvas before the first run (§12.3, §14.3)', () => {
  const out = page('try')
  const empty = block(out, 'div', 'sit__stage')

  /* What an access check is (owner, 1 Oct 2026: "a better state, a better
     layout and a better experience"); the run in miniature that stood over
     it went the same day ("remove"), and a spot illustration came instead
     ("add a good empty state with an illustration") — with the form open
     beside it, no button. */
  it('says what an access check is, centred in the canvas beside the open form: the picture, the headline, one line, what the run shows', () => {
    expect(empty).toContain('class="tj-empty"')
    const hiw = block(empty, 'section', 'hiw')
    expect(hiw).toMatch(
      /^<section class="hiw" aria-labelledby="[^"]+"><svg class="hiw__ill" viewBox="0 0 220 136" role="img" aria-label="A sign-in screen, its access checked">[\s\S]*?<\/svg><h2 id="[^"]+" class="hiw__head">Check what access someone gets<\/h2>/,
    )
    expect(text(hiw)).toBe(
      'Check what access someone gets Choose who signs in, to which application, and from where. Your policies are checked in order, as a real sign-in is. Which policy decides Which rule matched, and why What the person sees',
    )
    const gets = [...hiw.matchAll(/<li><svg[^>]*class="lucide lucide-([a-z-]+)/g)].map((m) => m[1])
    expect(gets).toEqual(['layers', 'list-checks', 'monitor-smartphone'])
    for (const gone of ['hiw__art', 'hiw__step', 'hiw__go', 'How an access check works']) expect(empty).not.toContain(gone)
    expect(empty).not.toContain('tj-engine')
    expect(empty).not.toContain('aria-label="Sign-in journey"')
    expect(rules(pageCss)).toMatch(/\.tj-empty \{[^}]*place-items: center;[^}]*min-height: 100%;/)
    expect(rules(pageCss)).toMatch(/\.hiw \{[^}]*width: min\(520px, 100%\);[^}]*text-align: center;/)
  })

  /* The house language (BoardEmpty.tsx): a grey skeleton of the sign-in a
     person meets, and one colour where the colour is the meaning — the
     shield, in the allow ramp. Never the brand, never the accent. */
  it('the picture is a grey sign-in screen and one colour, its shield in the allow ramp', () => {
    const art = block(empty, 'svg', 'hiw__ill')
    expect([...art.matchAll(/class="(hiw__ill-[a-z]+)/g)].map((m) => m[1])).toEqual([
      'hiw__ill-win',
      'hiw__ill-rule',
      'hiw__ill-addr',
      'hiw__ill-bar',
      'hiw__ill-field',
      'hiw__ill-bar',
      'hiw__ill-bar',
      'hiw__ill-field',
      'hiw__ill-bar',
      'hiw__ill-field',
      'hiw__ill-bar',
      'hiw__ill-bar',
      'hiw__ill-gap',
      'hiw__ill-shield',
      'hiw__ill-tick',
    ])
    const css = rules(pageCss)
    const ill = [...css.matchAll(/\.hiw__ill[^{]*\{[^}]*\}/g)].map((m) => m[0]).join('\n')
    expect(ill).toContain('.hiw__ill-shield { fill: var(--fb-positive-bg); stroke: var(--fb-positive-border);')
    expect(ill).toContain('.hiw__ill-tick { fill: none; stroke: var(--fb-positive-dot);')
    expect(ill).not.toMatch(/--brand|--accent|--fb-negative|--fb-notice/)
    /* A short canvas draws it smaller. */
    expect(css).toMatch(/@container tj \(max-height: 520px\) \{[^}]*\}\s*\.hiw__ill \{ width: 176px; height: 109px;/)
  })

  it('no dock on the empty canvas, as the builder’s empty policy has none', () => {
    expect(empty).not.toContain('bb__dock')
  })

  it('Check access, once the panel is shut, opens it on the form, its Person row focused — the road the sentence takes; no Saved sign-ins in this phase', () => {
    const shut = canvas(initialTryPage(1, TODAY, '09:30'), emptyDraft(TODAY, '09:30'), 1)
    const go = block(shut, 'div', 'hiw__act')
    expect([...go.matchAll(/<button/g)]).toHaveLength(1)
    expect(empty).not.toContain('Saved sign-ins')
    expect(shut).not.toContain('Saved sign-ins')
    expect(pageSrc).toContain("onNode={() => openPanel(() => focusRow('person'))}")
    expect(tryPageSrc).toContain('const onPressNode = useCallback(() => latest.current.onNode(), [])')
    /* The panel opens first, and the row takes the focus once it has slid in. */
    expect(pageSrc).toContain('onAdd={(f) => openPanel(() => focusRow(tokenOfField(f), true))}')
    expect(pageSrc).toMatch(/const openPanel = \(then\?: \(\) => void\) => \{\s+const already = panelOpen\s+(?:\/\*[\s\S]*?\*\/\s+)?if \(leaving\.current\) leaving\.current\.keepFocus = true\s+setPanel\('form'\)\s+if \(!then\) return\s+if \(already \|\| reduced\) then\(\)\s+else window\.setTimeout\(then, ARRIVE_MS\)/)
    expect(pageSrc).toMatch(/const row = document\.getElementById\(tokenDomId\(PANEL_ID, token\)\)\s+const el = row\?\.matches\('button'\) \? row : row\?\.querySelector<HTMLElement>\('button'\)\s+el\?\.focus\(\)\s+if \(open && el\?\.getAttribute\('aria-expanded'\) !== 'true'\) el\?\.click\(\)/)
  })

  it('nothing on it moves', () => {
    expect(hiwSrc).not.toContain('motion')
    expect(rules(pageCss)).not.toMatch(/\.hiw[^{]*\{[^}]*(transform|transition|animation)/)
  })
})

describe('Sign-in tests — the run on the canvas (§14.3)', () => {
  it('is the vertical journey, the builder’s dock under it with fit and zoom only', () => {
    const out = canvas(settled(arun), arun, 2)
    expect(out).toContain('tj-stage is-vertical')
    expect(out).toContain('tj-engine is-done')
    expect(tryPageSrc).toContain('orientation="vertical"')
    expect(tryPageSrc).not.toMatch(/useLaneFit|use-lane-fit/)
    const dock = block(out, 'div', 'bb__dock sit__dock')
    const labels = [...dock.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
    expect(labels).toEqual(['View', 'Fit to view', 'Zoom out', 'Zoom in'])
    expect(dock).not.toMatch(/Undo|Redo/)
    /* The builder's one labelled fold button (BoardBuilder's `.bb__densitybtn`), before the zoom. */
    const fold = dock.match(/<button type="button" class="bb__densitybtn">([\s\S]*?)<\/button>/)![1]
    expect(text(fold)).toBe('Expand all')
    expect(fold).toContain('lucide-chevrons-up-down')
    expect(dock.indexOf('bb__densitybtn')).toBeLessThan(dock.indexOf('Fit to view'))
  })

  it('Expand all / Collapse all tells the chain (`fold`, a new seq each press); a new run folds as the chain does', () => {
    expect(tryPageSrc).toContain("const foldNext: FoldMode = fold.mode === 'expand' ? 'collapse' : 'expand'")
    expect(tryPageSrc).toContain('onClick={() => setFold((f) => ({ mode: foldNext, seq: f.seq + 1 }))}')
    expect(tryPageSrc).toContain("{foldNext === 'expand' ? 'Expand all' : 'Collapse all'}")
    expect(tryPageSrc).toContain("setFold((f) => (f.mode === 'auto' ? f : { mode: 'auto', seq: f.seq + 1 }))")
    expect(tryPageSrc).toContain('fold={fold}')
    /* The group chosen in the Person picker, by name, and the person node pressed. */
    expect(tryPageSrc).toContain('asGroup={asGroupName}')
    expect(tryPageSrc).toContain('onPressPerson={onPressNode}')
  })

  it('the zoom scales the run’s column and the ground’s dots, gliding by motion; the scroll moves the dots', () => {
    expect(canvas(settled(arun), arun, 2)).toMatch(/<div class="tj-canvas" style="--sit-z:1" tabindex="-1" aria-label="Sign-in run">/)
    /* The stage's rule, the page's and the builder's Check access's alike (1 Oct). */
    expect(rules(pageCss)).toMatch(/\.sit__stage \.tj-stage \{ zoom: var\(--sit-z, 1\); \}/)
    expect(pageSrc).toContain("'--bb-z': zoom")
    expect(tryPageSrc).toContain("region.style.setProperty('--bb-y', `${-t.scrollTop}px`)")
    expect(tryPageSrc).toMatch(/glide\.current = animate\(z0, z1, \{\s+\.\.\.GLIDE,\s+onUpdate: \(v\) => applyZoom\(v, at\)/)
    expect(tryPageSrc).toContain('if (jump || reduced || Math.abs(z1 - z0) < 0.005) {')
  })

  it('a landed run is placed, and placed again at its glance: never zoomed out, measured to the answer’s foot, from its start when it fits, else the part that decided under the engine line', () => {
    expect(tryPageSrc).not.toContain('FIT_MIN')
    /* Measured to the answer's foot: What they see stands beside its words, so the whole answer is in view. */
    expect(tryPageSrc).toContain('const end = hero ? stageY(hero, stage) + hero.offsetHeight : stageY(chain, stage) + chain.offsetHeight')
    expect(tryPageSrc).not.toContain('tj-hero__foot')
    expect(tryPageSrc).toContain("const z = after === 'view' ? 1 : Math.min(1, z0)")
    expect(tryPageSrc).toContain('const top = (end - a) * z <= room ? a * z : c !== null && (end - c) * z > room ? c * z : end * z - room')
    /* One glide of the zoom and the scroll together. */
    expect(tryPageSrc).toMatch(/glide\.current = animate\(0, 1, \{\s+\.\.\.VIEW_GLIDE,\s+onUpdate: \(k\) => \{\s+applyZoom\(z0 \+ \(z1 - z0\) \* k, null\)\s+sc\.scrollTop = t0 \+ \(to - t0\) \* k/)
    /* The chain says when it has settled, with its height; else the page measures after FIT_FALLBACK_MS. */
    expect(tryPageSrc).toContain('onFit={onFit}')
    expect(tryPageSrc).toMatch(/if \(!fitted\.current\) fitLatest\.current\(\)\s+\}, reduced \? 0 : FIT_FALLBACK_MS\)/)
    expect(tryPageSrc).toContain(`<button type="button" className="bb__act" aria-label="Fit to view" onClick={() => fitRun(undefined, 'view')}>`)
    /* Two quick presses are two steps: from the zoom on screen, not the page's, which lands after the glide. */
    expect(tryPageSrc).toContain('onClick={() => zoomTo(zoomNow.current * ZOOM_STEP, middle())}>')
    expect(tryPageSrc).toContain('onClick={() => zoomTo(zoomNow.current / ZOOM_STEP, middle())}>')
  })

  it('no scrollbar on the canvas: hidden bars, a drag on the ground or the wheel pans, Ctrl/⌘ with the wheel zooms, a quiet cue says where', () => {
    const css = rules(pageCss)
    expect(css).toContain('.sit__stage .tj-scroll { scrollbar-width: none; }')
    expect(css).toContain('.sit__stage .tj-scroll::-webkit-scrollbar { display: none; }')
    expect(css).toContain('.sit__stage .tj-canvas.can-pan .tj-scroll { cursor: grab; }')
    expect(css).toContain('.sit__stage .tj-canvas.is-panning .tj-scroll { cursor: grabbing; }')
    expect(tryPageSrc).toContain("if (e.button !== 0 || e.pointerType !== 'mouse') return")
    expect(tryPageSrc).toContain('if (!sc || !(t instanceof Element) || !sc.contains(t) || t.closest(NO_PAN)) return')
    expect(tryPageSrc).toContain("el.addEventListener('wheel', onWheel, { passive: false })")
    expect(tryPageSrc).toMatch(/if \(!\(e\.ctrlKey \|\| e\.metaKey\)\) return\s+e\.preventDefault\(\)/)
    /* The cue: motion fades it, the thumb is written, it takes no press. */
    expect(tryPageSrc).toContain('<motion.span className="sit-cue" aria-hidden initial={false} animate={{ opacity: over ? 1 : 0 }}')
    expect(css).toMatch(/\.sit-cue \{[^}]*pointer-events: none;/)
    expect(css).toMatch(/\.sit-cue__thumb \{[^}]*background: var\(--border-strong\);/)
    /* The panel's body keeps a thin scrollbar in the console's grey. */
    expect(css).toContain('.sit-panel .bb__inspbody { scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }')
  })

  it('the dock never covers the run’s end: the room under it is the scroller’s own padding, outside the zoom', () => {
    const css = rules(pageCss)
    expect(css).toContain('.sit__stage .tj-scroll:has(> .tj-stage) { padding-top: 60px; padding-bottom: 64px; }')
    expect(css).toContain('.sit__stage .tj-stage.is-vertical { padding-top: var(--space-4); padding-bottom: var(--space-4); }')
  })

  it('the person node opens the panel on its Person picker', () => {
    expect(tryPageSrc).toContain('onPressPerson={onPressNode}')
    expect(pageSrc).toContain("onNode={() => openPanel(() => focusRow('person'))}")
    expect(nodeSrc).not.toMatch(/Pencil|BookmarkPlus/)
  })

  it('every run on the page begins with the engine; only Run runs — a changed field waits for it, "Run as" runs at once at the edit pace', () => {
    /* With, inside a policy (1 Oct, the builder's Check access), its draft standing in and its own trace. */
    expect(tryPageSrc).toContain("engineRun({ res, policies, form, facts, env, ctx, names, intro: 'none', substitute, focus })")
    const door = pageSrc.slice(pageSrc.indexOf('const patch = (p: Partial<SignInForm>, field: FormField, now = false) => {'), pageSrc.indexOf('/* The Person picker'))
    expect(door).toContain("if (!now || tryPage.mode !== 'journey' || cardIssues(next, nextRows, zones).length > 0) return")
    expect(door).toContain('if (same(f, session.form)) return')
    expect(door).toContain("start(f, 'edit', { prev: session.form })")
    expect(pageSrc).toContain('onAsGroup={(g) => pickPerson(`${GROUP_PREFIX}${g}`, true)}')
    expect(pageSrc).toContain("toCanvas(() => start(f, 'full', { askSaveFor, prev }))")
    /* Changes not run yet: in the facts the application's rules read; said in the foot and on Edit sign-in. */
    expect(pageSrc).toContain("const unrun = tryPage.mode === 'journey' && !same(forRun(draft, rows), forRun(session.form, rows))")
    expect(pageSrc).toContain('unrun={unrun}')
    expect(pageSrc).toMatch(/const start = [\s\S]*?session\.load\(f\)/)
    expect(pageSrc).not.toContain('session.patch(')
    expect(tryPageSrc).not.toContain('session.patch(')
  })

  it('a road in from elsewhere plays at full pace from the engine, and New sign-in still asks to save its own run', () => {
    const before = { ...initialTryPage(3, TODAY, '09:30'), mode: 'journey' as const, played: 3, askSaveFor: 4 }
    expect(tryingPage(before, arun)).toMatchObject({ mode: 'journey', intro: 'none', pace: 'full', replay: false, draft: arun, prev: null, askSaveFor: null, played: 3 })
    expect(canvas(tryingPage(before, arun), arun, 4)).toContain('tj-engine is-running')
    expect(canvas(tryingPage(before, arun), arun, 3)).toContain('tj-engine is-done')
    expect(newSignInPage(tryingPage(before, arun), 5, TODAY, '10:00')).toMatchObject({ mode: 'form', played: 5, touched: [], prev: null, askSaveFor: 6 })
    expect(tryPageSrc).toContain('if (page.askSaveFor !== null && page.askSaveFor === page.played) onAskSave()')
  })

  it('a revisit shows the run where it was, and the panel holds its sign-in', () => {
    expect(initialTryPage(1, TODAY, '09:30', arun)).toMatchObject({ mode: 'form', draft: { personId: null, appId: null } })
    expect(initialTryPage(4, TODAY, '09:30', arun)).toMatchObject({ mode: 'journey', played: 4, draft: arun })
    expect(pageSrc).toContain('initialTryPage(session.runId, todayIn(), nowIn(), session.form)')
  })

  /* A People row's Try runs the People tab's own sentence, so the run never
     contradicts the cell that was clicked (review J1, 29 Sep): kept with the
     People table it serves, locked off for now. */
  it('a People row’s Try is the People sentence with that person and application: its answer is the cell’s', () => {
    const contexts: SignInForm[] = [
      defaultPeopleContext(TODAY),
      { ...defaultPeopleContext(TODAY), device: { kind: 'preset', id: 'win10' } },
      { ...defaultPeopleContext(TODAY), device: { kind: 'none' } },
    ]
    let checked = 0
    for (const context of contexts) {
      for (const person of t.directory.people.slice(0, 12)) {
        const cells = personRows(t.policies, t.apps, { ...context, personId: person.id }, env, t.zones)
        for (const cell of cells) {
          const f = peopleTryForm(context, person.id, cell.appId, rowsRead(t.policies, null, cell.appId, lib))
          const run = resolveSignIn(t.policies, factsOf(f, t.zones).facts, env)
          expect([run.status, run.decision, run.decidedBy?.policyId], `${person.id} on ${cell.appId}`).toEqual([cell.res.status, cell.res.decision, cell.res.decidedBy?.policyId])
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
    const win10: SignInForm = { ...defaultPeopleContext(TODAY), device: { kind: 'preset', id: 'win10' } }
    const cells = personRows(t.policies, t.apps, { ...win10, personId: 'arun' }, env, t.zones)
    expect(cells.find((c) => c.appId === 'outlook')?.res.decision).toBe('deny')
    const f = peopleTryForm(win10, 'arun', 'outlook', rowsRead(t.policies, null, 'outlook', lib))
    const out = canvas(settled(f), f, 2)
    const outcome = text(out.slice(out.indexOf('data-node="outcome"')))
    expect(outcome).toContain(DECISION_WORDS.deny)
    expect(outcome).not.toContain(DECISION_WORDS['1fa'])
    expect(firstDecidedApp(cells)).not.toBeNull()
  })
})

describe('Sign-in tests — the sheets and the words', () => {
  it('the page’s sheets load eagerly, before the console theme', () => {
    const theme = mainSrc.indexOf("import './brand/console-theme.css'")
    for (const s of ['journey.css', 'library.css', 'sign-in-tests.css', 'try-bar.css']) {
      const at = mainSrc.indexOf(`import './brand/screens/sign-in-tests/${s}'`)
      expect(at, s).toBeGreaterThan(-1)
      expect(at, s).toBeLessThan(theme)
    }
  })

  it('the page never scrolls: a flex column down to the region, a min-height: 0 chain', () => {
    const css = rules(pageCss)
    expect(css).toContain('.bshell__main > .sit { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }')
    expect(css).toContain('.sit > .bbtop { flex: none; }')
    expect(css).toContain('.sit > .bb { flex: 1 1 auto; min-height: 0; }')
    expect(css).toContain('.sit__stage > .tj { flex: 1 1 auto; min-height: 0; }')
  })

  it('tokens only; nothing moved by a stylesheet; no dashed or dotted anything; 12 px the floor; one fade, no other gradient', () => {
    for (const [name, sheet] of [
      ['sign-in-tests.css', pageCss],
      ['try-bar.css', barCss],
    ] as const) {
      const css = rules(sheet)
      expect(css, name).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(css, name).not.toMatch(/rgba?\(/)
      /* The one exception: the builder's CSS slide switched off, for motion's. */
      expect(css.replace('animation: none;', ''), name).not.toMatch(/transform|transition|translate|scale\(|rotate|@keyframes|animation/)
      expect(css, name).not.toMatch(/dashed|dotted/)
      const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim())
      sizes.forEach((s) => expect(['var(--fs-xs)', 'var(--fs-sm)', 'var(--fs-md)', 'var(--fs-xl)'], `${name} ${s}`).toContain(s))
      /* The one larger size: the empty canvas's headline (1 Oct 2026). */
      expect([...css.matchAll(/([^{}]+)\{[^}]*font-size:\s*var\(--fs-xl\)/g)].map((m) => m[1].trim()), name).toEqual(name === 'sign-in-tests.css' ? ['.hiw .hiw__head'] : [])
    }
    /* The scroller's top fade, to the region's ground, is the one gradient. */
    const gradients = [...rules(pageCss).matchAll(/([^{}]+)\{[^}]*gradient[^}]*\}/g)].map((m) => m[1].trim())
    expect(gradients).toEqual(['.sit__stage .tj-canvas::after'])
    expect(rules(barCss)).not.toMatch(/gradient/)
  })

  it('house words, no Sparkles or Wand', () => {
    const words = text(page('try')) + ' ' + text(panel(arun, { ran: { form: arun, shown: '1fa' } }))
    expect(words).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    for (const s of [pageSrc, tryPageSrc, panelSrc, nodeSrc, hiwSrc]) {
      expect(s).not.toMatch(/Sparkles|Wand/)
      const strings = [...s.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(' ')
      expect(strings).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})

/* Break-in attempts on the run's application, in the page's right-hand panel
   (owner, 1 Oct 2026: "can we implement it in the check part? as a
   suggestion inside conflicts or somewhere else" — then "go with your
   picks, start building"). The answer's strip and quiet link, and the why's
   section, are pinned in why-ui.test.tsx; this is the panel they open and
   what the page does with a row. */
describe('Sign-in tests — break-in attempts, the panel', () => {
  const noop = () => {}
  /* One run per application, as the page keeps one: a row's fix is asked once per run (attempts.ts), so the panels drawn below share the asking. */
  const runs = new Map<string, ReturnType<typeof runBreakInOnApp>>()
  const runOn = (appId: string) => runs.get(appId) ?? runs.set(appId, runBreakInOnApp(t.policies, appId, env)).get(appId)!
  const attempts = (appId: string, over: Partial<BreakInPanelProps> = {}) =>
    renderToStaticMarkup(
      <BrandProvider>
        <BreakInPanel
          result={runOn(appId)}
          appName={t.apps.find((a) => a.id === appId)!.name}
          reduced={false}
          back={false}
          wide
          onToggleWidth={noop}
          onClose={noop}
          onBack={noop}
          onPlay={noop}
          onOpenRule={noop}
          onFix={noop}
          {...over}
        />
      </BrandProvider>,
    )
  /* Each row, by card: its press, and what stands outside it. */
  const rowsOf = (o: string) =>
    [...o.matchAll(/<li class="sit-att__row is-([a-z-]+)">([\s\S]*?)<\/li>(?=<li class="sit-att__row|<\/ul>)/g)].map((m) => {
      const html = m[2]
      const press = html.slice(0, html.indexOf('</button>') + '</button>'.length)
      const foot = html.slice(html.indexOf('<div class="sit-att__foot">'))
      return { group: m[1], html, press, foot, name: text(between(press, '<span class="sit-att__name">', '<span class="sit-att__story">')).replace(/^Run: /, '') }
    })
  const between = (o: string, a: string, b: string) => o.slice(o.indexOf(a), o.indexOf(b, o.indexOf(a)))
  const aws = attempts('aws')

  it('is the sign-in panel’s chrome: its title the attempts’ label, the width and the X; the way back to the why only where it came from the why', () => {
    expect(aws).toMatch(new RegExp(`^<aside id="${ATTEMPTS_PANEL_ID}" class="bb__insp sit-panel sit-attpanel" aria-labelledby="([^"]+)"`))
    expect(aws).toMatch(/<div class="bb__inspbar is-rule"><h2 id="[^"]+" class="sit-panel__title" title="Break-in attempts on AWS Console" tabindex="-1">Break-in attempts on AWS Console<\/h2>/)
    expect(aws.indexOf('aria-label="Narrow the panel"')).toBeLessThan(aws.indexOf('aria-label="Close the panel"'))
    expect(aws).not.toContain('Back to why')
    const back = attempts('aws', { back: true })
    expect(back).toMatch(/<div class="bb__inspbar is-rule"><button type="button" class="bb__act" aria-label="Back to why" title="Back"><svg[^>]*lucide-arrow-left/)
    /* It slides as the form does — and, swapped in for the why, is simply there; inert on its way out. */
    expect(attemptsSrc).toContain('initial={reduced || !slide ? false : { opacity: 0, x: 24 }}')
    expect(attemptsSrc).toContain('inert={!present || undefined}')
    expect(attemptsSrc).toContain("import { PANEL_SLIDE as SLIDE } from './sign-in-card'")
    expect(panelSrc).toContain('const SLIDE = PANEL_SLIDE')
  })

  it('the four counts once, with what they are and are not; then each result’s heading, in order, no number beside it', () => {
    expect(aws.match(/class="tj-cells"/g)).toHaveLength(1)
    expect(block(aws, 'div', 'sit-att__counts')).toContain('aria-label="About break-in attempts"')
    const heads = [...aws.matchAll(/<h3 id="[^"]+" class="sit-att__gh">([^<]+)<\/h3>/g)].map((m) => text(m[1]))
    expect(heads).toEqual(['Got through', 'Less than asked', 'Locked out', "Can't tell"])
  })

  it('Held last and folded, its count on the fold — the one place it is said — a native disclosure the page’s Escape lets be', () => {
    const held = block(aws, 'details', 'sit-att__held')
    expect(held).toMatch(/^<details class="sit-att__held"><summary class="sit-att__heldsum"><svg[^>]*lucide-chevron-right[^>]*>[\s\S]*?<\/svg><span>Held<\/span><span class="sit-att__heldn">8<\/span><\/summary>/)
    expect(held).not.toContain(' open=""')
    expect(rowsOf(held).every((r) => r.group === 'held')).toBe(true)
    expect(rowsOf(held)).toHaveLength(8)
    expect(aws.indexOf('class="sit-att__held"')).toBeGreaterThan(aws.lastIndexOf('class="sit-att__gh"'))
    /* Escape waits for anything expanded in a panel: the fold is not, so Escape still shuts the panel with it open. */
    expect(held).not.toContain('aria-expanded')
    expect(pageSrc).toContain(`if (document.querySelector('.sit-panel [aria-expanded="true"]')) return`)
  })

  it('a row: the press that plays it — the face, the attempt, its one line, Expected and Got — and outside it who decided, a link into the builder', () => {
    const rows = rowsOf(aws)
    expect(rows).toHaveLength(15)
    for (const r of rows) {
      expect(r.press, r.name).toMatch(/^<button type="button" class="sit-att__play" title="Run this sign-in"><span class="sit-att__face" aria-hidden="true"><span class="bx-face is-user is-sm"/)
      /* Nothing pressable inside the press. */
      expect(r.press.slice(1), r.name).not.toContain('<button')
      /* Who decided first — after the one quiet line, where the row needs one. */
      expect(r.foot, r.name).toMatch(/^<div class="sit-att__foot">(<p class="sit-att__note">[^<]+<\/p>)?<p class="sit-att__byline">/)
      /* Each word with its badge, so a narrow panel never breaks "Got" from its answer. */
      expect(r.press, r.name).toMatch(/<span class="sit-att__result" aria-hidden="true"><span class="sit-att__pair"><span>Expected( at least)?<\/span><span class="bx-badge/)
    }
    const proxy = rows.find((r) => r.name === 'Finance account behind a known proxy')!
    expect(text(between(proxy.press, '<span class="sit-att__story">', '</span>'))).toBe('A finance user appears from a commercial proxy on a device whose fingerprint has changed.')
    expect(text(between(proxy.press, '<span class="sit-att__result"', '<span class="u-sr-only">E'))).toBe('Expected Deny · Got Allow with 2FA')
    expect(proxy.press).toContain('<span class="u-sr-only">Expected Deny, got Allow with 2FA</span>')
    expect(proxy.foot).toMatch(/<button type="button" class="sit-att__by" title="Open AWS billing for Finance"><span>Decided by AWS billing for Finance · Rule 1<\/span><svg[^>]*lucide-arrow-up-right/)
    /* A sign-in nobody can tell: Can't tell, the policy named without a rule. */
    const tor = rows.find((r) => r.name === 'Executive account from a Tor exit')!
    expect(text(between(tor.press, '<span class="sit-att__result"', '<span class="u-sr-only">E'))).toBe("Expected Deny · Can't tell")
    expect(tor.press).toContain(`<span class="u-sr-only">Expected Deny, can't tell</span>`.replace("'", '&#x27;'))
    /* What would settle it, then who decided. */
    expect(text(tor.foot)).toMatch(/^Needs: \S.* Decided by Global Default Policy$/)
    /* A threat stopped harder than its card asks held: what it asks is a floor. */
    const contractor = rows.find((r) => r.name === 'Contractor on an unmanaged device')!
    expect([contractor.group, text(between(contractor.press, '<span class="sit-att__result"', '<span class="u-sr-only">E'))]).toEqual(['held', 'Expected at least Allow with 2FA · Got Deny'])
  })

  it('a Weaker factor row says the factor its badges cannot: what was offered, and what the attack needs', () => {
    const relay = rowsOf(attempts('github')).find((r) => r.name === 'Sign-in relayed through a phishing proxy')!
    expect(relay.group).toBe('weaker-factor')
    expect(text(between(relay.press, '<span class="sit-att__result"', '<span class="u-sr-only">E'))).toBe('Expected Allow with 2FA · Got Allow with 2FA')
    expect(relay.foot).toContain('<p class="sit-att__note">Second factor: miniOrange Push · standard · needs phishing-resistant</p>')
    const css = rules(pageCss)
    expect(css).toMatch(/\.sit-att__pair \{ display: inline-flex; align-items: center; gap: var\(--space-2\); white-space: nowrap; \}/)
    expect(css).toMatch(/\.sit-att__note \{[^}]*font-size: var\(--fs-xs\);/)
  })

  it('a hole’s fix, before anything is done: what the rule becomes, what it moves, across the tenant only when something there does, and Fix in policy — a plain secondary; the panel has no orange', () => {
    const proxy = rowsOf(aws).find((r) => r.name === 'Finance account behind a known proxy')!
    const fix = block(proxy.foot, 'div', 'sit-att__fix')
    expect(text(between(fix, '<p class="sit-att__fixline">', '</p>'))).toBe('Add this rule Deny sign-ins from outside India — If not in zone India → Deny · at position 1')
    /* The count it moves at its new number — the cell says the old one — and across the tenant only what moves. */
    expect(fix).toContain('<p class="sit-att__moved">Got through now 2</p>')
    expect(text(between(fix, '<p class="sit-att__tenant">', '</p>'))).toMatch(/^Of [\d,]+ modelled sign-ins: Now denied \d+$/)
    const btn = fix.match(/<button[^>]*class="bx-btn[^"]*"[^>]*>[\s\S]*?<\/button>/)![0]
    /* The kit's secondary: its neutral role. */
    expect(btn).toContain('bx-btn--neutral')
    expect(text(btn)).toBe('Fix in policy')
    expect(btn).toContain('lucide-arrow-up-right')
    expect(aws).not.toContain('bx-btn--brand')
    /* Only that row's card names a fix that fits and is never looser: the rest of AWS's holes have none. */
    expect(rowsOf(aws).filter((r) => r.foot.includes('sit-att__fix')).map((r) => r.name)).toEqual(['Finance account behind a known proxy'])
  })

  it('no fix for a row that held, for the Global Default, nor where none fits — the link into the builder is the way', { timeout: 30_000 }, () => {
    for (const app of ['outlook', 'github', 'slack', 'box', 'hrms']) {
      for (const r of rowsOf(attempts(app))) {
        if (r.group === 'held' || r.group === 'locked-out' || r.group === 'extra-prompts' || r.group === 'cant-tell') expect(r.foot, `${app} ${r.name}`).not.toContain('sit-att__fix')
      }
    }
    const risk = rowsOf(attempts('box')).find((r) => r.name === 'High risk signal from inside the office')!
    expect([risk.group, text(risk.foot)]).toEqual(['got-through', 'Decided by Global Default Policy · Rule 1'])
    /* Asked of a hole as it is drawn, kept for the run — never of a row that held. */
    expect(attemptsSrc).toContain('const offer = useMemo(() => (isHole(row) ? attemptOffer(result, row, policies, env, accepted) : null), [row, result, policies, env, accepted])')
  })

  it('a row pressed plays it as an access check: the form filled with the attempt on this application, named for it, its expectation the answer’s — the panel shut for the run', () => {
    expect(pageSrc).toMatch(
      /const playAttempt = \(row: AppBreakInRow\) => \{\s+if \(!attempts\) return\s+const p = attemptPlay\(row, attempts\.result\.appId, policies\)\s+const f = formOf\(p\.facts, zones\)\s+setAsGroup\(null\)\s+setLoaded\(\{ name: p\.name, form: f, expected: p\.expected, weaker: p\.weaker \}\)\s+toCanvas\(\(\) => start\(f, 'full', \{ draft: f, touched: \[\] \}\)\)/,
    )
    expect(pageSrc).toContain('onPlay={playAttempt}')
    /* The run it plays is the one the row was judged on: the same policy, the same answer. */
    const r = runOn('aws')
    for (const row of r.rows) {
      const p = attemptPlay(row, 'aws', t.policies)
      const res = resolveSignIn(t.policies, factsOf(formOf(p.facts, t.zones), t.zones).facts, env)
      expect([row.id, res.decidedBy?.policyId ?? null], row.id).toEqual([row.id, row.policyId])
      if (row.got) expect([row.id, res.decision], row.id).toEqual([row.id, row.got])
    }
  })

  it('Decided by opens that rule in the builder, the attempt in its Check access; Fix in policy opens the policy with the fix for its draft', () => {
    expect(pageSrc).toMatch(/go\(row\.ruleRef \? \{ name: 'board', policyId: row\.policyId, open: 'try', rule: row\.ruleRef \} : \{ name: 'board', policyId: row\.policyId, open: 'try' \}\)/)
    expect(pageSrc).toContain("go({ name: 'board', policyId: offer.policy.id, fix: { card: row.id, app: attempts.result.appId } })")
    expect(pageSrc).toContain('session.loadBoard(policyId, formOf(attemptFacts(row.round.challenge, attempts.result.appId), zones))')
  })

  it('the page: run once per policies, application, env and acceptances — the store’s own — and only with the edition’s Break-in test and the phase’s flag on', () => {
    expect(phaseSrc).toContain('export const BREAK_IN_ATTEMPTS: boolean = true')
    expect(pageSrc).toContain('const attemptsOn = BREAK_IN_ATTEMPTS && features.breakInTest')
    expect(pageSrc).toContain("const attemptsApp = attemptsOn && tryPage.mode === 'journey' ? ranForm.appId : null")
    expect(pageSrc).toContain('const result = breakInOnApp(policies, attemptsApp, env, { accepted: breakInAccepted })')
    expect(pageSrc).toContain('breakIn={breakIn}')
    expect(pageSrc).toContain('onReviewBreakIn={reviewBreakIn}')
  })

  it('one panel with the why: keyed the same, the one swapped in not sliding; the back arrow gives the why back, its title the focus', () => {
    expect(pageSrc).toContain('{panel === \'why\' && <WhyPanel key="side" reduced={reduced} slotRef={setWhySlot} slide={!swapped} />}')
    expect(pageSrc).toMatch(/\{panel === 'break-in' && attempts && \(\s+<BreakInPanel\s+key="side"/)
    expect(pageSrc).toContain("back={attemptsFrom === 'why'}")
    expect(pageSrc).toContain('slide={!swapped}')
    expect(pageSrc).toContain("setSwapped(panel === 'why')")
    expect(pageSrc).toContain("document.querySelector<HTMLElement>('.sit-whypanel .tj-why__title')?.focus({ preventScroll: true })")
    expect(panelSrc).toContain('initial={reduced || !slide ? false : { opacity: 0, x: 24 }}')
  })

  it('shut, the focus goes back to what opened it — the strip or the quiet link, else the strip that opened the why — else Replay; any new run shuts it', () => {
    expect(pageSrc).toContain("const back = at('.tj-hero__attempts') ?? at('button.tj-hero__strip') ?? at('.tj-engine__replay button')")
    expect(pageSrc).toContain('onClose={() => closePanel(true)}')
    expect(pageSrc).toMatch(/const toCanvas = \(begin: \(\) => void\) => \{\s+const wasOpen = panel !== null\s+setPanel\(null\)/)
    /* Pressed again on the answer, the strip shuts them. */
    expect(pageSrc).toMatch(/if \(from === 'outcome' && panel === 'break-in'\) \{\s+closePanel\(\)\s+return\s+\}/)
    /* Every run begins by shutting the why and the attempts — Replay too, which is the journey's. */
    expect(pageSrc).toContain("const shutBeside = () => setPanel((p) => (p === 'why' || p === 'break-in' ? null : p))")
    expect(pageSrc).toMatch(/setSubmitted\(false\)\s+setSaveOpen\(false\)\s+shutBeside\(\)\s+session\.load\(f\)/)
    expect(pageSrc).toContain('onReplay={shutBeside}')
    expect(tryPageSrc).toMatch(/const replay = \(\) => \{\s+onReplay\?\.\(\)/)
  })

  it('the why’s X gives the focus back to what opened it on the answer — its strip or Why? — else Replay', () => {
    expect(pageSrc).toContain("} else if (panel === 'why') closePanel(true)")
    expect(pageSrc).toContain("const WHY_DOOR = '.sit__stage .tj-hero__whybtn:not(.tj-hero__attempts), .sit__stage button.tj-hero__strip:not(.tj-hero__attempts)'")
    expect(pageSrc).toMatch(/if \(from === 'why'\) \{\s+const back = document\.querySelector<HTMLElement>\(WHY_DOOR\) \?\? at\('\.tj-engine__replay button'\)/)
  })

  it('nothing overlaps: the press is three tracks, and who decided and the fix stand under it on the words’ own edge', () => {
    const css = rules(pageCss)
    expect(css).toMatch(/\.sit-att__play \{[^}]*display: grid;[^}]*grid-template-columns: 24px minmax\(0, 1fr\) 14px;/)
    expect(css).toMatch(/\.sit-att__foot \{[^}]*padding: 0 var\(--space-4\) var\(--space-4\) calc\(var\(--space-4\) \+ 24px \+ var\(--space-4\)\);/)
    expect(css).toMatch(/\.sit-att__row \{ display: flex; flex-direction: column;/)
  })

  it('house words — “signs in”, never the old verb — on every application', { timeout: 30_000 }, () => {
    for (const app of t.apps.map((a) => a.id)) {
      expect(text(attempts(app)), app).not.toMatch(/\b(AI|assistant|log(?:s|ged|ging)? ?ins?|gauntlet|blast radius|rehearse|grade)\b/i)
    }
    for (const src of [attemptsSrc, attemptsModelSrc]) {
      /* What a person can read: not the comments, not where a module comes from. */
      const s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/from '[^']+'/g, '')
      const strings = [...s.matchAll(/'([^'\n]*)'|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]).join(' ')
      expect(strings).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})
