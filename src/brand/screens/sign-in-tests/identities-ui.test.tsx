/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { TestingSessionContext, initialSession, type TestingSession } from '../testing/session-state'
import type { SignInForm } from '../testing/sign-in-form'
import type { RunLayoutProps } from './layouts/types'
import { GROUP_PREFIX, emptyDraft, initialTryPage, personPick, type TryPage } from './sign-in-card'
import { TryJourney } from './TryJourney'
import tryJourneySrc from './TryJourney.tsx?raw'

/* -----------------------------------------------------------------------------
   Several identities in one Run reach the layouts (owner, 5 Oct 2026: "one run
   each, switch"): TryJourney hands every view the Run's identities, in pick
   order, each with its own plan, the one the canvas tells marked and holding
   the very plan on screen — and the way to switch — or nothing at all when one
   identity ran. The chips that draw them are the top bar's (SignInRow.tsx) —
   and, over the column, the engine line's; here a stand-in layout prints
   what it was handed.
   -------------------------------------------------------------------------- */

vi.mock('./layouts/TreeLayout', () => ({
  default: (p: RunLayoutProps) => (
    <pre
      data-props={JSON.stringify({
        ids: p.identities?.map((i) => ({ key: i.key, kind: i.kind, name: i.name, active: i.active, told: i.plan === p.plan, decides: i.plan.outcome.view.decision })) ?? null,
        onPick: typeof p.onPickIdentity,
        person: p.form.personId,
        asGroup: p.asGroup,
      })}
    />
  ),
}))

const TODAY = '2026-10-05'
const t = showcaseTenant()
const people = t.directory.people
const maya = 'u-maya'
const finance = `${GROUP_PREFIX}finance`
const priya = personPick(finance, people).personId!
const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), appId: 'aws' }
const noop = () => {}

function draw(page: TryPage, form: SignInForm, opts: { asGroup?: string | null; onPick?: (key: string) => void; layout?: 'tree' | 'column' } = {}) {
  const session: TestingSession = {
    ...initialSession(form),
    runId: page.played,
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
        <TryJourney page={page} onPage={noop} layout={opts.layout ?? 'tree'} asGroup={opts.asGroup ?? null} onPickIdentity={opts.onPick} />
      </TestingSessionContext.Provider>
    </BrandProvider>,
  )
}

/* The layout is lazy: the first draw starts it loading, the second draws it. */
async function handed(page: TryPage, form: SignInForm, opts: Parameters<typeof draw>[2] = {}) {
  draw(page, form, opts)
  await import('./layouts/TreeLayout')
  await new Promise((r) => setTimeout(r, 0))
  const m = draw(page, form, opts).match(/data-props="([^"]*)"/)
  expect(m, 'the stand-in layout was drawn').not.toBeNull()
  return JSON.parse(m![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
}

const settledOn = (form: SignInForm, ran?: TryPage['ran']): TryPage => ({ ...initialTryPage(3, TODAY, '09:30', form), mode: 'journey', played: 3, ran })

describe('the identities of a Run reach the layouts', () => {
  it('every pick, in pick order, one active — its plan the very plan on screen — and the way to switch', async () => {
    const form = { ...base, personId: maya }
    const got = await handed(settledOn(form, { list: [maya, finance], active: 0 }), form, { onPick: noop })
    expect(got.ids.map((i: { key: string; kind: string; name: string; active: boolean; told: boolean }) => [i.key, i.kind, i.name, i.active, i.told])).toEqual([
      [maya, 'user', 'Maya Iyer', true, true],
      [finance, 'group', 'Finance', false, false],
    ])
    expect(got.onPick).toBe('function')
    expect(got.person).toBe(maya)
  })

  it('switched to the group: it is the one told, its member’s sign-in on screen, the group named', async () => {
    const form = { ...base, personId: priya }
    const got = await handed(settledOn(form, { list: [maya, finance], active: 1 }), form, { asGroup: 'finance', onPick: noop })
    expect(got.ids.map((i: { active: boolean; told: boolean }) => [i.active, i.told])).toEqual([
      [false, false],
      [true, true],
    ])
    expect([got.person, got.asGroup]).toEqual([priya, 'Finance'])
    /* Each pick's plan is its own run: the one told decides as the canvas does. */
    const told = got.ids.find((i: { active: boolean }) => i.active)
    expect(typeof told.decides).toBe('string')
  })

  it('nothing when one identity ran, or when the sign-in on screen is not the pick the Run says it tells', async () => {
    const form = { ...base, personId: maya }
    const one = await handed(settledOn(form), form, { onPick: noop })
    expect([one.ids, one.onPick]).toEqual([null, 'undefined'])
    const single = await handed(settledOn(form, { list: [maya], active: 0 }), form, { onPick: noop })
    expect(single.ids).toBeNull()
    const elsewhere = await handed(settledOn(form, { list: [maya, finance], active: 1 }), form, { onPick: noop })
    expect([elsewhere.ids, elsewhere.onPick]).toEqual([null, 'undefined'])
  })

  /* The column — the page's Classic, and the policy builder's Check access — draws them itself, in its engine line
     (EngineJourney.tsx `EngineLine`), at the pill's left. */
  it('the column: a chip each in the engine line, before the words, the one told pressed; none when one identity ran', () => {
    const form = { ...base, personId: maya }
    const pillOf = (o: string) => o.slice(o.indexOf('class="tj-engine__pill'), o.indexOf('class="tj-engine__act'))
    const several = pillOf(draw(settledOn(form, { list: [maya, finance], active: 0 }), form, { onPick: noop, layout: 'column' }))
    expect(several).toContain('role="group" aria-label="Identities"')
    expect(several.indexOf('aria-label="Identities"')).toBeLessThan(several.indexOf('tj-engine__words'))
    const tags = [...several.matchAll(/<button[^>]*class="sir__id[^"]*"[^>]*>/g)].map((m) => m[0])
    expect(tags.map((x) => [/aria-label="([^",]*)/.exec(x)?.[1], /aria-pressed="(true|false)"/.exec(x)?.[1]])).toEqual([
      ['Maya Iyer', 'true'],
      ['Finance', 'false'],
    ])
    const one = pillOf(draw(settledOn(form), form, { onPick: noop, layout: 'column' }))
    expect(one).toContain('tj-engine__words')
    expect(one).not.toContain('sir__ids')
  })

  it('one plan per pick per run: keyed by the facts less the person, so a switch keeps every plan', () => {
    expect(tryJourneySrc).toContain('const factsKey = told ? JSON.stringify({ ...form, personId: null }) : \'\'')
    expect(tryJourneySrc).toContain("() => toldPlan ?? engineRun({ res, policies, form, facts, env, ctx, names, intro: 'none', substitute, focus }),")
    expect(tryJourneySrc).toContain('identities={identities}')
    expect(tryJourneySrc).toContain('onPickIdentity={identities ? onPickIdentity : undefined}')
  })
})
