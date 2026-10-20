import { useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider, useBrand } from '../../store'
import { SAMPLE_DAY } from '../monitor-sample'
import { useSimEnv } from '../sim-env'
import { DockPast } from '../testing/DockPast'
import { TestingSessionProvider } from '../testing/session'
import { initialSession, sessionReducer } from '../testing/session-state'
import { appsWithSignIns, pastReport, policyApps } from '../testing/test-dock'
import { emptyDraft, initialTryPage } from './sign-in-card'
import { BlockedPanel } from './BlockedDrawer'
import { blockedSignIns } from './blocked'
import { OPEN_AT_ONCE } from './phase'

/* -----------------------------------------------------------------------------
   OPEN AT ONCE (phase.ts; owner, 20 Oct 2026: "when I'm in a blocked sign-in or
   try to click on any past sign-in, it should open immediately — no need to
   showcase the free-field form; it can start directly").

   What a static render and the session's own reducer can say of it: the two
   lists mark the row their run is of (and nothing without the page asking), and
   the session's two ways in — `load`, which plays, and `prefill`, which fills
   the form for Run — still lead where they did, so a past or blocked sign-in
   opened from elsewhere lands on its run while a blank Check access (or an
   application's own Check access) still opens on the form. How the page plays
   a pick (`playRecent`, `playBlocked`, the builder's `playPast`) is pinned in
   sign-in-tests-ui.test.tsx and policy-check-ui.test.tsx, from their source.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'

/** The Blocked panel, with the page's mark on its first row (or none). */
function Blocked({ mark, query }: { mark: 'first' | 'none' | 'absent'; query?: string }) {
  const { policies, apps } = useBrand()
  const env = useSimEnv()
  const first = useMemo(() => blockedSignIns(policies, env, SAMPLE_DAY, apps)[0]?.id ?? null, [policies, env, apps])
  const picked = mark === 'first' ? first : mark === 'none' ? null : undefined
  return <BlockedPanel reduced wide onToggleWidth={() => {}} onClose={() => {}} onPick={() => {}} picked={picked} query={query} onQuery={query === undefined ? undefined : () => {}} />
}

/** The builder's Past sign-ins on Access the app through corporate devices only, with the mark on its first row (or none). */
function Past({ mark }: { mark: 'first' | 'absent' }) {
  const { policies, apps } = useBrand()
  const env = useSimEnv()
  const draft = policies.find((p) => p.id === 'sc-corporate-devices')!
  const mine = policyApps(draft, apps)
  const first = useMemo(() => pastReport(draft, policies, env, undefined, SAMPLE_DAY, appsWithSignIns(mine).map((a) => a.id)).rows[0]?.id ?? null, [draft, policies, env, mine])
  return <DockPast draft={draft} apps={mine} version={null} onLoad={() => {}} picked={mark === 'first' ? first : undefined} />
}

const draw = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('the flag', () => {
  it('is on, as a named flag', () => {
    expect(OPEN_AT_ONCE).toBe(true)
  })
})

describe('the Blocked panel marks the row its run is of', () => {
  it('one row: aria-current and the picked look', () => {
    const out = draw(<Blocked mark="first" />)
    expect(count(out, 'aria-current="true"')).toBe(1)
    expect(count(out, 'tbar-saved__opt is-app is-picked')).toBe(1)
    expect(out).toMatch(/<button type="button" class="tbar-saved__opt is-app is-picked" aria-current="true">/)
  })

  it('none before a pick, and nothing at all where the page does not ask (the flag off, the Policies drawer)', () => {
    for (const mark of ['none', 'absent'] as const) {
      const out = draw(<Blocked mark={mark} />)
      expect(out, mark).not.toContain('aria-current')
      expect(out, mark).not.toContain('is-picked')
    }
  })

  it('keeps the search the page hands it, across the Why and back', () => {
    expect(draw(<Blocked mark="none" query="Sanjay" />)).toContain('value="Sanjay"')
  })
})

describe('the builder\'s Past sign-ins mark the row its run is of', () => {
  it('one row: aria-current on its button, the picked look on the row; none where the builder does not ask', () => {
    const out = draw(<Past mark="first" />)
    expect(count(out, 'aria-current="true"')).toBe(1)
    expect(count(out, 'class="tpanel-row is-picked"')).toBe(1)
    const off = draw(<Past mark="absent" />)
    expect(off).not.toContain('aria-current')
    expect(off).not.toContain('is-picked')
    /* The same list, row for row. */
    expect(count(off, 'class="tpanel-row"')).toBe(count(out, 'class="tpanel-row"') + 1)
  })
})

describe('the arrival: a past or blocked sign-in lands on its run, a blank Check access on the form', () => {
  const arun = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'github' }

  it('a load (Sign-in activity\'s or the app tab\'s Open in Check access) plays: the page mounts on the run, the form shut', () => {
    const s = sessionReducer(initialSession(emptyDraft(TODAY, '09:30')), { type: 'load', form: arun })
    expect(s.runId).toBe(2)
    const page = initialTryPage(s.runId, TODAY, '09:30', s.form, s.prefilled)
    expect(page).toMatchObject({ mode: 'journey', draft: arun })
    /* The page's focusRun starts at 1 on such a mount (SignInTests.tsx), so the canvas takes the focus. */
    expect(OPEN_AT_ONCE && page.mode === 'journey' ? 1 : 0).toBe(1)
  })

  it('a blank Check access still opens on the form, and an application\'s own Check access (a prefill) on the form holding it', () => {
    const blank = initialTryPage(1, TODAY, '09:30')
    expect(blank.mode).toBe('form')
    expect(OPEN_AT_ONCE && blank.mode === 'journey' ? 1 : 0).toBe(0)
    const s = sessionReducer(sessionReducer(initialSession(emptyDraft(TODAY, '09:30')), { type: 'load', form: arun }), { type: 'prefill', form: { ...arun, appId: 'box' } })
    expect(initialTryPage(s.runId, TODAY, '09:30', s.form, s.prefilled)).toMatchObject({ mode: 'form', draft: { appId: 'box' } })
  })
})
