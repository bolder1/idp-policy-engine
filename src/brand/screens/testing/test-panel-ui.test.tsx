/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { BrandProvider, useBrand } from '../../store'
import { boardVersion } from '../board/try-sign-in'
import { useSimEnv } from '../sim-env'
import { savedOnPolicy } from './board-views'
import { DockPast } from './DockPast'
import { DockPeople } from './DockPeople'
import { DockSaved } from './DockSaved'
import { savedRows } from './selectors'
import { defaultBoardForm } from './sign-in-form'
import { policyApps, type DockTab } from './test-dock'
import panelCss from './test-panel.css?raw'
import savedSrc from './DockSaved.tsx?raw'
import peopleSrc from './DockPeople.tsx?raw'
import pastSrc from './DockPast.tsx?raw'
import pureSrc from './test-dock.ts?raw'

/* The dock's views drawn without a browser, on the showcase tenant, through
   the props their host feeds them: Saved sign-ins, People and Past sign-ins
   at a right-hand panel's width. They were the tabs of the board's test
   panel; Check access opens People and Past sign-ins as panels of its own
   (board/PolicyCheck.tsx), and the panel that held them as tabs is gone.
   test-dock.test.ts pins their rules; this is what they print. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}
const TODAY = '2026-09-28'

interface Board {
  id?: string
  tab?: Exclude<DockTab, 'break-in'>
  edit?: (p: Policy) => Policy
}

/* What the test panel handed each view: the policy's own applications, the
   board's version, and — for Saved sign-ins — this policy's saved sign-ins
   only, judged by that version. */
function View({ board }: { board: Board }) {
  const store = useBrand()
  const env = useSimEnv()
  const saved = store.policyById(board.id ?? 'sc-dev-tools')!
  const draft = board.edit ? board.edit(saved) : saved
  const form = defaultBoardForm(saved, store.users, store.apps, TODAY)
  const version = boardVersion(saved, draft)
  const mine = policyApps(draft, store.apps)
  const tab = board.tab ?? 'saved'
  if (tab === 'people') return <DockPeople draft={draft} apps={mine} form={form} version={version} onPatch={noop} />
  if (tab === 'past') return <DockPast draft={draft} apps={mine} version={version} onLoad={noop} />
  const onApps = draft.isSystem ? store.savedSignIns : store.savedSignIns.filter((s) => s.facts.appId !== undefined && draft.appIds.includes(s.facts.appId))
  const rows = savedOnPolicy(savedRows(onApps, store.policies, env, version?.substitute), draft, 'policy')
  return <DockSaved draft={draft} rows={rows} apps={mine} onLoad={noop} onSaveThis={noop} onManage={noop} />
}

const draw = (board: Board = {}) =>
  renderToStaticMarkup(
    <BrandProvider>
      <View board={board} />
    </BrandProvider>,
  )

const rowNames = (out: string) => [...out.matchAll(/class="tpanel-rowbtn tpanel-name"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
const count = (s: string, needle: string) => s.split(needle).length - 1

describe('Saved sign-ins, at the panel’s width', () => {
  const out = draw()

  it('lists this policy’s saved sign-ins only, every one a pass', () => {
    /* Maya Iyer's renamed for her case, her London one and Priya's (the
       troubleshooting cases, 30 Sep 2026) are on GitHub too. */
    expect(rowNames(out).sort()).toEqual([
      'Arun Patel in the office',
      'Contractor at home on Jira',
      'Maya Iyer on GitHub from London — same answer',
      'Maya Iyer on GitHub — Engineering and Finance',
      'Priya Sharma on GitHub — a draft that would not decide',
      'Sofia Marchetti in London on an iPhone',
      'Tom Whelan on Windows 10',
    ])
    expect(count(out, 'tpanel-result is-pass')).toBe(7)
    expect(text(out)).not.toContain('Kavya')
  })

  it('draws each as two lines: name, Now and the mark; then the sign-in in grey, no Expected on a pass', () => {
    expect(count(out, 'class="tpanel-saved"')).toBe(7)
    expect(out).toMatch(/aria-label="Arun Patel in the office: expected Allow on 1 factor, now Allow on 1 factor, Pass\. Try this sign-in"/)
    expect(out).toMatch(/class="tpanel-sub tpanel-clip tpanel-saved__sub" title="Arun Patel · GitHub Enterprise · Branch office/)
    expect(out).not.toContain('tpanel-expected')
    expect(out).not.toContain('Sign-in Expected Now Result')
  })

  it('says what a failing sign-in expected, and marks it failed', () => {
    const off = draw({ edit: (p) => ({ ...p, rules: p.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) }) })
    expect(off).toContain('tpanel-result is-fail')
    /* On a line of its own, under the sign-in, never glued to the front of it. */
    expect(off).toContain('<span class="tpanel-sub tpanel-expected">Expected Allow on 1 factor</span>')
    expect(text(off)).not.toContain('Expected Allow on 1 factor · Arun Patel')
  })

  it('has search and Run all, and Manage in Sign-in tests under the list', () => {
    const t = text(out)
    expect(t).toContain('Run all')
    expect(out).toContain('aria-label="Search saved sign-ins"')
    expect(out.indexOf('Manage in Sign-in tests')).toBeGreaterThan(out.lastIndexOf('tpanel-saved__sub'))
  })

  it('says where nothing is saved on the policy’s applications, with Save this sign-in', () => {
    /* Zoom: Slack has saved sign-ins since the troubleshooting cases (30 Sep 2026). */
    const zoom = draw({ edit: (p) => ({ ...p, appIds: ['zoom'] }) })
    expect(text(zoom)).toContain('No saved sign-ins on Zoom')
    expect(text(zoom)).toContain('Save this sign-in')
    const none = draw({ edit: (p) => ({ ...p, appIds: [] }) })
    expect(text(none)).toContain('No applications on this policy')
    expect(text(none)).not.toContain('Save this sign-in')
  })
})

describe('People, at the panel’s width', () => {
  it('is one badge a person on a policy with one application, with what decides today under a changed one', () => {
    const out = draw({ id: 'sc-hrms-office', tab: 'people' })
    /* HRMS's audience — Finance and Human Resources — and nobody else. */
    expect(count(out, 'class="tpanel-row tpanel-prow')).toBe(9)
    expect(count(out, 'class="tpanel-pcell"')).toBe(9)
    expect(out.slice(out.indexOf('tpanel-pcells'))).not.toContain('class="applogo')
    const t = text(out)
    expect(t).toContain('Today: Allow on 1 factor')
    expect(t).toContain('Priya Sharma')
    expect(t).not.toContain('Not in this policy')
    expect(t).not.toContain('Arun Patel')
  })

  it('stacks a logo and a badge for each of two to four applications', () => {
    const out = draw({ id: 'sc-dev-tools', tab: 'people' })
    const rows = count(out, 'class="tpanel-row tpanel-prow')
    expect(count(out, 'class="tpanel-pcell"')).toBe(rows * 2)
    expect(out).toMatch(/class="tpanel-pcell"><span class="applogo/)
  })

  it('answers for the sentence’s application alone past four, and names it once', () => {
    const out = draw({ id: 'global-default', tab: 'people' })
    const rows = count(out, 'class="tpanel-row tpanel-prow')
    expect(count(out, 'class="tpanel-pcell"')).toBe(rows)
    expect(count(out, 'class="tpanel-on"')).toBe(1)
    expect(text(out)).toMatch(/On \S/)
  })
})

describe('Past sign-ins, at the panel’s width', () => {
  const out = draw({ id: 'sc-hrms-office', tab: 'past' })
  const t = text(out)

  it('says it is a sample, and the week once', () => {
    expect(out).toMatch(/bx-badge--neutral[\s\S]*?Sample/)
    expect(t.match(/Last 7 days · [\d,]+ sign-ins/g)).toHaveLength(1)
  })

  /* Today is the Global Default's baseline (30 Sep 2026), no longer one factor
     for the whole week, and HRMS turned on lets nobody in on one factor. */
  it('draws today and the policy turned on as bars, with a key', () => {
    expect(out).toMatch(/role="img" aria-label="Today: Allow on 1 factor \d+%, Allow with 2FA \d+%, Deny \d+%, Can&#x27;t tell \d+%"/)
    expect(out).toMatch(/role="img" aria-label="If turned on: Allow with 2FA \d+%, Deny \d+%, Can&#x27;t tell \d+%"/)
  })

  it('has three tiles abreast that are the filter, Would change pressed', () => {
    expect([...out.matchAll(/class="tpanel-tile__label">([^<]*)</g)].map((m) => m[1])).toEqual(['Would change', 'Newly blocked', 'Unchanged'])
    expect(count(out, 'aria-pressed="true"')).toBe(1)
    expect(out).toMatch(/aria-pressed="true"><span class="tpanel-tile__n">[\d,]+<\/span><span class="tpanel-tile__label">Would change/)
  })

  it('with nothing to compare, draws one bar and the week as it is, the total said once', () => {
    const live = draw({ id: 'sc-dev-tools', tab: 'past' })
    const said = text(live)
    expect(said.match(/Last 7 days · [\d,]+ sign-ins/g)).toHaveLength(1)
    expect(live).not.toContain('tpanel-tile')
    expect(live).not.toContain('No sign-ins would change')
    expect(count(live, 'class="tpanel-dist__row"')).toBe(1)
    expect(live).toContain('class="tpanel-pastgrid tpanel-head is-one" aria-hidden="true"><span>Today</span></div>')
    expect(count(live, 'class="tpanel-rowbtn tpanel-past__who"')).toBeGreaterThan(0)
    expect(live).not.toContain('With your edits')
  })

  it('lists the sign-ins two lines each under one header: when, who, where to; Today → If turned on', () => {
    expect(out).toMatch(/class="tpanel-pastgrid tpanel-head" aria-hidden="true"><span>Today<\/span><span><\/span><span>If turned on<\/span>/)
    /* The six that would change (test-dock.test.ts). */
    expect(count(out, 'class="tpanel-rowbtn tpanel-past__who"')).toBe(6)
    expect(count(out, 'class="tpanel-when"')).toBe(6)
  })
})

describe('the panel’s stylesheet and words', () => {
  const rules = panelCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('gives nothing a transform or a transition: motion owns the rows and the segments', () => {
    expect(rules).not.toMatch(/\b(transform|transition|translate|scale)\s*:/)
  })

  it('takes every colour from a variable, and draws no dashed or dotted edge', () => {
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(rules).not.toMatch(/dashed|dotted/)
  })

  it('stops every animation under reduced motion', () => {
    const animated = [...rules.matchAll(/([^{}]+)\{[^}]*\banimation\s*:\s*(?!none\b)\w/g)].map((m) => m[1].trim())
    expect(animated).toEqual(['.bb__insp.is-swap', '.tpanel-row__flash'])
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(rules)?.[1] ?? ''
    expect(reduced).toMatch(/\.bb__insp\.is-swap \{ animation: none; \}/)
    expect(reduced).toMatch(/\.tpanel-row__flash\s*\{[^}]*animation:\s*none/)
  })

  it('says none of the words the testing surfaces may not, and draws no Sparkles or Wand', () => {
    for (const src of [savedSrc, peopleSrc, pastSrc, pureSrc]) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      /* What a person reads: string literals, template text and JSX text. */
      const copy = [...code.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]).join('\n')
      expect(copy.length).toBeGreaterThan(40)
      expect(copy).not.toMatch(/\bAI\b|assistant|\blog ?in\b|gauntlet|blast radius|rehears/i)
      expect(code).not.toMatch(/\b(Sparkles|Wand\w*)\b/)
    }
  })
})
