/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { emptyDraft, initialTryPage, personPickerOptions, type TryPage } from '../sign-in-tests/sign-in-card'
import { TryJourney } from '../sign-in-tests/TryJourney'
import { TryPanel, type TryPanelProps } from '../sign-in-tests/TryPanel'
import { envOf } from '../tenant-resolver'
import { boundariesOf } from '../testing/boundaries'
import { rowsRead } from '../testing/rows-read'
import { TestingSessionProvider } from '../testing/session'
import { TestingSessionContext, initialSession, type TestingSession } from '../testing/session-state'
import { IN_POLICY, NOT_IN_POLICY } from '../testing/sign-in-fields'
import type { SignInForm } from '../testing/sign-in-form'
import { appChoices, boardScope } from '../testing/sign-in-sentence'
import { BoardBarActions } from './BoardBar'
import { BoardBuilder } from './BoardBuilder'
import { BoardPage } from './BoardPage'
import { CheckBarViews } from './PolicyCheck'
import { CHECK_PANEL_NARROW, CHECK_PANEL_WIDE, PEOPLE_AND_BREAK_IN, checkViews, firstCheckApp, onPolicyApps } from './test-mode'
import builderSrc from './BoardBuilder.tsx?raw'
import checkSrc from './PolicyCheck.tsx?raw'
import checkCss from './check-access.css?raw'

/* Check access inside a policy (owner, 1 Oct 2026: "Now change the try a
   sign in inside policy builder with the current sign in tests we have" —
   "Hide people and break-in test as of now. And past sign-ins can be a
   dedicated button in the top header"). The builder's test mode is the
   Sign-in tests page's canvas and panel (PolicyCheck.tsx), drawn without a
   browser on the showcase tenant: the canvas over the hidden board, the run
   of the DRAFT, the panel scoped to the policy, Past sign-ins on the bar,
   People and the Break-in test nowhere. The page's own pieces are pinned in
   sign-in-tests-ui and journey-ui; this is the builder's join to them. */

const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const TODAY = '2026-10-01'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const hrms = policy('sc-hrms-office')
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const noop = () => {}
const sessionWith = (over: Partial<TestingSession>): TestingSession => ({
  ...initialSession(emptyDraft(TODAY, '09:30')),
  patch: noop,
  patchBoard: noop,
  loadBoard: noop,
  load: noop,
  replay: noop,
  setView: noop,
  openBreakIn: noop,
  closeBreakIn: noop,
  ...over,
})
const draw = (node: ReactNode, session?: TestingSession) =>
  renderToStaticMarkup(
    <BrandProvider>{session ? <TestingSessionContext.Provider value={session}>{node}</TestingSessionContext.Provider> : <TestingSessionProvider>{node}</TestingSessionProvider>}</BrandProvider>,
  )

/* The policy bar above the board portals its status menu to the document,
   which a server render has none of. BoardBarActions is drawn on its own below. */
vi.mock('./BoardBar', async (real) => {
  const mod = await real<typeof import('./BoardBar')>()
  return { ...mod, BoardBar: () => null }
})

const kavya: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'u-hr-1', appId: 'hrms' }
/* A run already played and settled: what the canvas shows once it has landed. */
const settled = (form: SignInForm): TryPage => ({ ...initialTryPage(2, TODAY, '09:30', form), mode: 'journey', played: 2 })
/* The canvas of Check access alone: this policy's stored version and its draft, and the builder's own run. */
const journey = (saved: Policy, draft: Policy, form: SignInForm) =>
  draw(<TryJourney page={settled(form)} onPage={noop} policy={{ saved, draft }} run={{ form, runId: 2, replay: noop }} onOpenPolicy={noop} onOpenRule={noop} />, sessionWith({}))

describe('Check access on the board', () => {
  const out = draw(<BoardBuilder policyId="sc-hrms-office" openTest />)

  it('stands the Sign-in tests canvas over the board, which waits under it, hidden, as it was left', () => {
    expect(out).toMatch(/class="bb is-checking /)
    expect(out).toContain('class="sit__stage bbchk"')
    /* The board is still there, under the canvas: closing gives it back. */
    expect(out).toContain('class="bb__stage')
    expect(out.indexOf('class="bb__stage')).toBeLessThan(out.indexOf('class="sit__stage bbchk"'))
    expect(rules(checkCss)).toContain('.bb.is-checking > .bb__stage,\n.bb.is-checking > .bb__empty { visibility: hidden; }')
    /* Not the old test mode's class: that one reshaped the chain it drew on. */
    expect(out).not.toMatch(/class="bb is-testing/)
  })

  it('opens on the canvas alone, as the page arrives: the panel shut, its track closed, no grip, no inspector', () => {
    expect(out).toContain('is-insp-closed')
    expect(out).toContain('class="hiw"')
    expect(out.match(/<aside/g)).toBeNull()
    expect(out).not.toContain('role="separator"')
  })

  it('draws nothing of the old test panel: no sentence, no verdict, no tabs', () => {
    /* Pinned deliberately against what it replaced (try-sign-in-ui.test.tsx kept its other joins). */
    for (const gone of ['tpanel', 'tsent', 'role="tab"', 'role="tabpanel"', 'Open Sign-in tests']) expect(out).not.toContain(gone)
  })

  it('plays the policy’s own sign-in as it opens, when the session holds one — the page’s Open policy, a Describe it check', () => {
    const played = draw(<BoardBuilder policyId="sc-hrms-office" openTest />, sessionWith({ boardForms: { 'sc-hrms-office': kavya } }))
    expect(played).toContain('tj-engine is-running')
    expect(text(played)).toContain('Finding the policy for HRMS')
  })

  it('opens every route — People, Saved sign-ins, the Break-in test — on the sign-in, drawing neither People nor the Break-in test', () => {
    for (const openPage of ['try', 'person', 'saved', 'break-in'] as const) {
      const o = draw(<BoardBuilder policyId="sc-hrms-office" openTest openPage={openPage} />)
      expect(o, openPage).toContain('class="sit__stage bbchk"')
      expect(o, openPage).not.toContain('bbi is-panel')
      expect(text(o), openPage).not.toContain('Got through')
      expect(o, openPage).not.toContain('role="tabpanel"')
    }
  })

  /* Access checks' "Fix in policy ↗" (arrive-fix.ts, 1 Oct 2026): the fix is
     read on the chain, where it was made, so a route carrying one opens the
     board even when it names a test page as well. The fix itself lands in an
     effect, which a server render never runs — arrive-fix.test.ts pins it. */
  it('opens the board, never Check access, on a route that carries a fix', () => {
    expect(draw(<BoardPage policyId="sc-hrms-office" open="try" />)).toMatch(/class="bb is-checking /)
    const fixing = draw(<BoardPage policyId="sc-hrms-office" open="try" fix={{ card: 'proxy-finance', app: 'hrms' }} />)
    expect(fixing).not.toContain('is-checking')
    expect(fixing).not.toContain('class="sit__stage bbchk"')
    expect(fixing).toContain('class="bb__stage')
  })
})

describe('the run is the draft', () => {
  it('a policy that is off: its stored rules as though on, and the answer says once that this changes it', () => {
    const o = journey(hrms, hrms, kavya)
    const said = text(o)
    expect(said).toContain('HRMS access from corporate offices')
    expect(said).toContain('Allow with 2FA')
    /* Said once, as the two versions side by side (EngineJourney.tsx `Answer`), not a "Changed by" pill. */
    expect(said).toContain('Today Allow on 1 factor , then Stored version Allow with 2FA')
    expect(said).not.toMatch(/Changed by/)
  })

  it('an unsaved edit is what runs: rule 1 switched off on the board, and the same sign-in is denied', () => {
    const draft = { ...hrms, rules: hrms.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) }
    const said = text(journey(hrms, draft, kavya))
    expect(said).toContain('Deny')
    expect(said).toContain('Nothing else matched decides')
    expect(said).toMatch(/Today Allow on 1 factor , then \S[^,]* Deny/)
    expect(said).not.toContain('Allow with 2FA')
  })

  it('a live policy with nothing changed: one version, nothing said about a change', () => {
    const live = policy('sc-corporate-devices')
    const form = { ...emptyDraft(TODAY, '09:30'), personId: 'u-exec-2', appId: 'google-workspace' }
    const said = text(journey(live, live, form))
    expect(said).toContain('Access the app through corporate devices only')
    expect(said).not.toMatch(/Changed by/)
  })

  it('says so the page’s way when another policy decides: the one that decides, and the finding, no new words', () => {
    const arun = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'hrms' }
    const said = text(journey(hrms, hrms, arun))
    expect(said).toContain('Global Default Policy')
    expect(said).toContain('No HRMS policy covers Arun Patel — the Global Default decides')
    /* Today and the draft agree: the Global Default decides either way. */
    expect(said).not.toMatch(/Changed by/)
  })

  it('draws this policy’s trace: the policy node is this policy, its cards the draft’s', () => {
    expect(checkSrc).toContain('policy={pair}')
    const draft = { ...hrms, rules: hrms.rules.map((r) => ({ ...r, name: 'From the head office' })) }
    const o = journey(hrms, draft, kavya)
    expect(text(o)).toContain('From the head office')
    expect(text(o)).not.toContain('In a corporate office')
  })
})

describe('the panel is the page’s form, scoped to the policy', () => {
  it('is TryPanel itself, opened on demand and shut by Run', () => {
    expect(checkSrc).toMatch(/\{panel === 'form' && \(\s+<TryPanel\s+key="form"/)
    expect(checkSrc).toContain('scope={scope}')
    expect(checkSrc).toContain('const scope = useMemo(() => boardScope(draft), [draft])')
    /* Run shuts it, then the run begins on the whole canvas. */
    expect(checkSrc).toMatch(/const runNow = \(\) => \{[\s\S]*?toCanvas\(\(\) => begin\(f, 'full'\)\)/)
    expect(checkSrc).toContain('title={loaded?.name ?? ACCESS_CHECK}')
  })

  it('offers only the policy’s applications, every one "As if on" for a draft with none', () => {
    const dev = policy('sc-dev-tools')
    expect(appChoices(boardScope(dev), t.apps).options.map((o) => o.value)).toEqual(t.apps.filter((a) => dev.appIds.includes(a.id)).map((a) => a.id))
    const none = appChoices(boardScope({ ...dev, appIds: [] }), t.apps)
    expect(none.heading).toBe('As if on')
    expect(none.options).toHaveLength(t.apps.length)
  })

  it('lists the policy’s people first, under In this policy, then the rest, then the groups', () => {
    const heads = [...new Set(personPickerOptions(t.directory.people, t.groups, hrms.audience).map((o) => o.group))]
    expect(heads).toEqual([IN_POLICY, NOT_IN_POLICY, 'Groups'])
    /* The page's own: everybody under one heading. */
    expect([...new Set(personPickerOptions(t.directory.people, t.groups).map((o) => o.group))]).toEqual(['People', 'Groups'])
  })

  it('leaves out Use a saved sign-in — where the policy has none, and everywhere in this phase', () => {
    const rows = rowsRead(t.policies, hrms, kavya.appId, lib)
    const props: TryPanelProps = {
      title: 'Check access',
      form: kavya,
      rows,
      issues: [],
      boundaries: boundariesOf(kavya, rows, {}, t.policies, env, t.zones),
      tips: {},
      reduced: false,
      asGroup: null,
      onPerson: noop,
      onPatch: noop,
      onRun: noop,
      saved: [],
      onUseSaved: noop,
      savedOpen: false,
      onSavedOpen: noop,
      ran: null,
      saveOpen: false,
      onSaveOpen: noop,
      wide: true,
      onToggleWidth: noop,
      onClose: noop,
      scope: boardScope(hrms),
    }
    expect(draw(<TryPanel {...props} />)).not.toContain('Use a saved sign-in')
    /* Saved sign-ins are a later phase (owner, 1 Oct 2026: "hide the saved
       sign-ins as well and focus on Check access only"): not offered even
       where there are some, until phase.ts brings them back. */
    expect(draw(<TryPanel {...props} saved={t.savedSignIns} />)).not.toContain('Use a saved sign-in')
  })

  it('takes the page’s two widths from its own button', () => {
    expect([CHECK_PANEL_WIDE, CHECK_PANEL_NARROW]).toEqual([560, 380])
    expect(builderSrc).toContain('const colW = testOn ? (checkWide ? CHECK_PANEL_WIDE : CHECK_PANEL_NARROW) : inspW')
  })
})

describe('Past sign-ins, a button of its own on the bar', () => {
  const bar = (testing: boolean, quietSave = false) =>
    draw(
      <BoardBarActions
        reading={false}
        onRead={noop}
        testing={testing}
        canTest
        onTest={noop}
        views={<CheckBarViews views={['past']} panel={null} onToggle={noop} />}
        quietSave={quietSave}
        toPublish
        unsaved
        canDiscard
        blockers={0}
        saveBlocked={false}
        onSaveDraft={noop}
        onDiscard={noop}
        onSave={noop}
      />,
    )

  it('stands before Check access while it is on, and is not there otherwise', () => {
    const on = bar(true)
    expect(on).toMatch(/<button type="button" data-check-view="past" class="bx-btn bx-btn--neutral bx-btn--sm sit__savedbtn" aria-expanded="false">/)
    expect(text(on)).toMatch(/Past sign-ins Check access/)
    expect(text(bar(false))).not.toContain('Past sign-ins')
  })

  it('names Check access on the bar, its key in the title', () => {
    const on = bar(true)
    expect(on).toContain('title="Check access (T)"')
    expect(text(on)).not.toContain('Try a sign-in')
  })

  it('opens its view in the right-hand panel, pressed while it is open; a row fills the sign-in and runs it, the panel shut', () => {
    const open = draw(<CheckBarViews views={['past']} panel="past" onToggle={noop} />)
    expect(open).toContain('class="bx-btn bx-btn--neutral bx-btn--sm sit__savedbtn is-on" aria-expanded="true" aria-controls="bbchk-past"')
    expect(checkSrc).toMatch(/\{panel === 'past' && \(\s+<ViewPanel key="past" view="past"/)
    expect(checkSrc).toContain('<DockPast draft={draft} apps={mine} version={version} onLoad={(f) => tryWhole(f, null)} />')
    expect(checkSrc).toMatch(/const tryWhole = [\s\S]*?toCanvas\(\(\) => begin\(f, 'full', \{ draft: f, touched: \[\] \}\)\)/)
  })

  it('leaves Run the one orange while the sign-in’s panel is open: the policy’s save steps down', () => {
    expect(bar(true, true)).toMatch(/data-tour="review"><button type="button" class="bx-btn bx-btn--neutral/)
    expect(bar(true, false)).toMatch(/data-tour="review"><button type="button" class="bx-btn bx-btn--brand/)
    expect(builderSrc).toContain("quietSave={testOn && checkPanel === 'form'}")
  })
})

describe('People and the Break-in test, hidden', () => {
  /* Owner, 1 Oct 2026: "Hide people and break-in test as of now". Kept, behind one flag. */
  it('are behind one flag, off, and the bar offers Past sign-ins alone', () => {
    expect(PEOPLE_AND_BREAK_IN).toBe(false)
    expect(checkViews({ policyTesting: true, breakIn: true })).toEqual(['past'])
    expect(checkViews({ policyTesting: false, breakIn: true })).toEqual([])
  })

  it('keep their views, drawn only while the flag is on', () => {
    expect(checkSrc).toContain("{PEOPLE_AND_BREAK_IN && panel === 'people' && (")
    expect(checkSrc).toContain("{PEOPLE_AND_BREAK_IN && panel === 'break-in' && (")
    expect(checkSrc).toContain('<DockPeople')
    expect(checkSrc).toContain('<BreakInView')
  })

  it('give a guard page’s Break-in row no Open while they are hidden', () => {
    expect(builderSrc).toContain("const openBreakInPage = views.includes('break-in') && canTest ? () => enterTest('break-in') : undefined")
  })
})

describe('the way back, and the keys', () => {
  it('leaves the selection, the folds and the zoom as they were: nothing on the way in clears them, and the board is not refitted', () => {
    const enter = builderSrc.slice(builderSrc.indexOf('const enterTest = ('), builderSrc.indexOf('const startTest = '))
    expect(enter).not.toContain('setSelection')
    expect(enter).not.toContain('setFolds')
    expect(builderSrc).toContain("fitKey={describeOpen ? 'describe' : 'edit'}")
    /* The ground's dots are the board's again as Check access shuts. */
    expect(builderSrc).toMatch(/const groundBefore = useRef[\s\S]*?if \(before\[v\]\) el\.style\.setProperty\(v, before\[v\]\)/)
    /* The editor waits, and is back as Check access shuts. */
    expect(builderSrc).toContain('{!testOn && !describeOpen && !readOpen && panelAlive && (')
  })

  it('Open policy on this policy, or Open rule, goes back to the builder — on that rule', () => {
    expect(checkSrc).toContain('if (policyId === saved.id) return doors.current.onBack()')
    expect(checkSrc).toContain('if (policyId === saved.id) return doors.current.onBack(ruleId)')
    expect(builderSrc).toMatch(/const backFromCheck = \(rule\?: string\) => \{[\s\S]*?select\(r \? ruleAt\(r\.id\) : \{ kind: 'fallback' \}\)/)
  })

  it('Escape shuts the open panel first, and stops there; the next closes Check access', () => {
    expect(checkSrc).toMatch(/if \(document\.querySelector\('\.sit-panel \[aria-expanded="true"\], \.bbtop \[aria-expanded="true"\]:not\(\[data-check-view\]\)'\)\) return\s+e\.preventDefault\(\)\s+closeLatest\.current\(\)/)
    expect(builderSrc).toContain('if (testOn) closeTest()')
  })

  it('Ctrl/⌘+Enter is Run under Check access, taken before the builder reads it as Save', () => {
    expect(checkSrc).toMatch(/if \(e\.key !== 'Enter' \|\| !\(e\.ctrlKey \|\| e\.metaKey\) \|\| e\.defaultPrevented\) return\s+e\.preventDefault\(\)\s+e\.stopPropagation\(\)\s+runLatest\.current\(\)/)
  })

  it('no rule shortcut, undo or redo reaches the chain hidden under the canvas; T still closes it from its panels', () => {
    expect(builderSrc).toContain("if (testOn && e.key !== 'Escape' && e.key !== '?') return")
    expect(builderSrc).toContain('if (action && !typing && !blocking && !testOn) {')
    expect(builderSrc).toContain("const TEST_SURFACES = '.bb__insp, .sit-panel, .bx-apop'")
    expect(builderSrc).toContain('!t.closest(CHECK_PANELS) && !!t.closest(`.bb__insp, ${DESCRIBE_SURFACE}`)')
  })

  it('names Check access in the palette, with its views, and none of the chain’s edits while it is on', () => {
    expect(builderSrc).toContain("label: testOn ? `Close ${ACCESS_CHECK}` : ACCESS_CHECK, kbd: 'T'")
    expect(builderSrc).toContain('...(testOn ? views.map((v) => ({ id: `view:${v}`, label: DOCK_TAB_LABEL[v], icon: VIEW_ICON[v] }) as Cmd) : []),')
    expect(builderSrc).toContain("...(describeOpen || !editing ? [] : ([{ id: 'add', label: 'Add a rule', icon: Plus }] as Cmd[])),")
  })
})

describe('the sign-in it starts from', () => {
  const dev = policy('sc-dev-tools')
  it('moves a kept sign-in onto the policy’s own applications', () => {
    const slack = { ...kavya, appId: 'slack' }
    expect(onPolicyApps(slack, dev, t.apps).appId).toBe(t.apps.find((a) => dev.appIds.includes(a.id))!.id)
    expect(onPolicyApps(slack, { ...dev, appIds: [] }, t.apps).appId).toBe('slack')
    expect(onPolicyApps(slack, { ...dev, isSystem: true }, t.apps).appId).toBe('slack')
  })

  it('starts the panel on the policy’s first application, none for the Global Default', () => {
    expect(firstCheckApp(hrms, t.apps)).toBe('hrms')
    expect(firstCheckApp(policy('global-default'), t.apps)).toBeNull()
  })
})
