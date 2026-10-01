/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { BrandProvider, useBrand } from '../../store'
import { boardVersion, type ColumnView } from '../board/try-sign-in'
import { rowsRead } from './rows-read'
import { defaultBoardForm } from './sign-in-form'
import { boardScope } from './sign-in-sentence'
import { TestPanel } from './TestPanel'
import type { DockTab } from './test-dock'
import panelCss from './test-panel.css?raw'
import panelSrc from './TestPanel.tsx?raw'
import savedSrc from './DockSaved.tsx?raw'
import peopleSrc from './DockPeople.tsx?raw'
import pastSrc from './DockPast.tsx?raw'
import pureSrc from './test-dock.ts?raw'

/* The test panel drawn without a browser, on the showcase tenant, through the
   props the board feeds it (V4 §2.4-bis): its header, the sentence and the
   verdict under it, and each tab at the panel's width. test-dock.test.ts
   pins the tabs' rules; this is what they print. The browser pass checks the
   rest — the grip, the swap with the rule editor, Esc, a row lighting its
   card. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}
const TODAY = '2026-09-28'

const col = (id: ColumnView['id'], label: string, status: ColumnView['status'], decision: ColumnView['decision'] = null): ColumnView => ({
  id,
  label,
  tip: label === 'Live' ? 'Decides sign-ins now' : 'The rules on this board, as if saved',
  status,
  policyName: null,
  line: '',
  decision,
  possible: [],
})
const LIVE = [col('live', 'Live', 'decided', '1fa')]

interface Board {
  id?: string
  tab?: DockTab
  edit?: (p: Policy) => Policy
  breakIn?: boolean
  views?: boolean
  columns?: ColumnView[]
  why?: string
}

function Panel({ board }: { board: Board }) {
  const store = useBrand()
  const saved = store.policyById(board.id ?? 'sc-dev-tools')!
  const draft = board.edit ? board.edit(saved) : saved
  const form = defaultBoardForm(saved, store.users, store.apps, TODAY)
  return (
    <TestPanel
      draft={draft}
      version={boardVersion(saved, draft)}
      form={form}
      onPatch={noop}
      onLoad={noop}
      rows={rowsRead(store.policies, draft, form.appId, { zones: store.zones, fingerprints: store.fingerprints })}
      issues={[]}
      boundaries={{}}
      scope={boardScope(draft)}
      idPrefix="bb-try"
      columns={board.columns ?? LIVE}
      why={board.why ?? 'Rule 1 · In the office on a compliant device'}
      shown="1fa"
      onReplay={noop}
      onClose={noop}
      saveOpen={false}
      onSaveOpenChange={noop}
      views={board.views ?? true}
      tab={board.tab ?? 'saved'}
      onTab={noop}
      breakIn={board.breakIn ? <p className="bbi-stub">The Break-in test</p> : null}
      onOpenLibrary={noop}
      headingRef={{ current: null }}
    />
  )
}

const draw = (board: Board = {}) =>
  renderToStaticMarkup(
    <BrandProvider>
      <Panel board={board} />
    </BrandProvider>,
  )

const lineTabs = (out: string) => [...out.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
const selected = (out: string) => text(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>([\s\S]*?)<\/button>/.exec(out)?.[1] ?? '')
const rowNames = (out: string) => [...out.matchAll(/class="tpanel-rowbtn tpanel-name"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
const count = (s: string, needle: string) => s.split(needle).length - 1
const labels = (out: string) => [...out.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])

describe('the panel', () => {
  const out = draw()

  it('is one aside in the inspector’s chrome, named by its heading', () => {
    expect(out).toMatch(/^<aside class="bb__insp tpanel" aria-labelledby="([^"]+)-title"/)
    expect(out).toMatch(/<h2 id="[^"]+-title" tabindex="-1" class="tpanel__title">Try a sign-in<\/h2>/)
    expect(count(out, '<aside')).toBe(1)
  })

  it('has the run’s buttons in the header, in order, with the hairline before Close', () => {
    const header = out.slice(0, out.indexOf('tpanel__signin'))
    const names = ['Replay', 'Save sign-in', 'Open Sign-in tests', 'Close Try a sign-in']
    expect(labels(header).filter((l) => names.includes(l))).toEqual(names)
    expect(header).toContain('class="bb__inspbar is-test"')
    expect(header.indexOf('tpanel__rule')).toBeGreaterThan(header.indexOf('aria-label="Open Sign-in tests"'))
    expect(header.indexOf('tpanel__rule')).toBeLessThan(header.indexOf('aria-label="Close Try a sign-in"'))
    /* Nothing orange: Save policy is the board's one brand button. */
    expect(out).not.toContain('bx-btn--brand')
  })

  it('holds the sentence, chromeless, with no verdict or buttons of its own', () => {
    expect(out).toContain('role="group" aria-label="Sign-in" class="tsent is-panel"')
    for (const id of ['bb-try-person', 'bb-try-app', 'bb-try-address', 'bb-try-device']) expect(out).toContain(`id="${id}"`)
    expect(out).not.toContain('tsent__end')
    expect(out).not.toContain('tsent__why')
  })

  it('says the verdict under the sentence: the version’s name over a larger badge, then why', () => {
    const block = out.slice(out.indexOf('tpanel__verdict'), out.indexOf('role="tablist"'))
    expect(block).toContain('class="tsent-verdict is-panel"')
    expect(block).toContain('<span class="tsent-verdict__cap">Live</span>')
    expect(block).toMatch(/bx-badge--positive bx-decision-badge tsent-verdict__big/)
    expect(block).toContain('<p class="tpanel__why" title="Rule 1 · In the office on a compliant device">')
    expect(out.indexOf('tpanel__verdict')).toBeGreaterThan(out.indexOf('tsent is-panel'))
  })

  it('draws two versions as two mini columns with a quiet arrow, named as one', () => {
    const two = draw({ columns: [col('live', 'Today', 'decided', '1fa'), col('edits', 'Your edits', 'decided', 'deny')] })
    expect(two).toContain('class="tsent-verdict is-panel is-two" role="img" aria-label="Today Allow on 1 factor, Your edits Deny"')
    expect(two).toContain('<span class="tsent-verdict__cap">Today</span>')
    expect(two).toContain('<span class="tsent-verdict__cap">Your edits</span>')
    expect(two.match(/tsent-verdict__big/g)).toHaveLength(2)
    expect(two).toContain('tsent-verdict__arrow')
  })

  it('says Depends and Can’t tell as grey words, never a badge', () => {
    const depends = draw({ columns: [col('edits', 'Your edits', 'depends')] })
    expect(depends).toContain('<span class="tsent-verdict__word">Depends</span>')
    expect(depends.slice(depends.indexOf('tpanel__verdict'), depends.indexOf('role="tablist"'))).not.toContain('bx-decision-badge')
    const cant = draw({ columns: [col('edits', 'Your edits', 'incomplete')], why: 'Choose a person' })
    expect(cant).toContain('bx-canttell')
  })

  it('has line tabs without counts, over one tab panel', () => {
    expect(out).toContain('bx-tabs--line tpanel__tabs')
    expect(lineTabs(out)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins'])
    for (const label of lineTabs(out)) expect(label).not.toMatch(/\d/)
    expect(selected(out)).toBe('Saved sign-ins')
    expect(count(out, 'role="tabpanel"')).toBe(1)
    expect(out).toContain('role="tabpanel" aria-label="Saved sign-ins" class="tpanel__body"')
  })

  it('offers the Break-in test only where it runs, and falls back to Saved sign-ins', () => {
    const bi = draw({ tab: 'break-in', breakIn: true })
    expect(lineTabs(bi)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins', 'Break-in test'])
    expect(selected(bi)).toBe('Break-in test')
    expect(text(bi)).toContain('The Break-in test')
    expect(selected(draw({ tab: 'break-in' }))).toBe('Saved sign-ins')
  })

  it('is the sign-in alone without Policy testing', () => {
    const lite = draw({ views: false })
    expect(lite).not.toContain('role="tablist"')
    expect(lite).not.toContain('role="tabpanel"')
    expect(lite).toContain('tsent is-panel')
  })
})

describe('Saved sign-ins, at the panel’s width', () => {
  const out = draw()

  it('lists this policy’s saved sign-ins only, every one a pass', () => {
    expect(rowNames(out).sort()).toEqual(['Arun Patel in the office', 'Contractor at home on Jira', 'Sofia Marchetti in London on an iPhone', 'Tom Whelan on Windows 10'])
    expect(count(out, 'tpanel-result is-pass')).toBe(4)
    expect(text(out)).not.toContain('Kavya')
  })

  it('draws each as two lines: name, Now and the mark; then the sign-in in grey, no Expected on a pass', () => {
    expect(count(out, 'class="tpanel-saved"')).toBe(4)
    expect(out).toMatch(/aria-label="Arun Patel in the office: expected Allow on 1 factor, now Allow on 1 factor, Pass\. Try this sign-in"/)
    expect(out).toMatch(/class="tpanel-sub tpanel-clip tpanel-saved__sub" title="Arun Patel · GitHub Enterprise · Branch office/)
    expect(out).not.toContain('tpanel-expected')
    expect(out).not.toContain('Sign-in Expected Now Result')
  })

  it('says what a failing sign-in expected, and marks it failed', () => {
    const off = draw({ edit: (p) => ({ ...p, rules: p.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) }) })
    expect(off).toContain('tpanel-result is-fail')
    expect(text(off)).toContain('Expected Allow on 1 factor · Arun Patel')
  })

  it('has search and Run all, and Manage in Sign-in tests under the list', () => {
    const t = text(out)
    expect(t).toContain('Run all')
    expect(out).toContain('aria-label="Search saved sign-ins"')
    expect(out.indexOf('Manage in Sign-in tests')).toBeGreaterThan(out.lastIndexOf('tpanel-saved__sub'))
  })

  it('says where nothing is saved on the policy’s applications, with Save this sign-in', () => {
    const slack = draw({ edit: (p) => ({ ...p, appIds: ['slack'] }) })
    expect(text(slack)).toContain('No saved sign-ins on Slack')
    expect(text(slack)).toContain('Save this sign-in')
    const none = draw({ edit: (p) => ({ ...p, appIds: [] }) })
    expect(text(none)).toContain('No applications on this policy')
    expect(text(none)).not.toContain('Save this sign-in')
  })
})

describe('People, at the panel’s width', () => {
  it('is one badge a person on a policy with one application, with what decides today under a changed one', () => {
    const out = draw({ id: 'sc-hrms-office', tab: 'people' })
    expect(count(out, 'class="tpanel-row tpanel-prow')).toBe(12)
    expect(count(out, 'class="tpanel-pcell"')).toBe(12)
    expect(out.slice(out.indexOf('tpanel-pcells'))).not.toContain('class="applogo')
    const t = text(out)
    expect(t).toContain('Today: Allow on 1 factor')
    expect(t).toContain('Not in this policy')
    expect(t.indexOf('Priya Sharma')).toBeLessThan(t.indexOf('Arun Patel'))
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

  it('draws today and the policy turned on as bars, with a key', () => {
    expect(out).toContain('role="img" aria-label="Today: Allow on 1 factor 100%"')
    expect(out).toMatch(/role="img" aria-label="If turned on: Allow on 1 factor \d+%, Allow with 2FA \d+%, Deny \d+%"/)
  })

  it('has three tiles abreast that are the filter, Would change pressed', () => {
    expect([...out.matchAll(/class="tpanel-tile__label">([^<]*)</g)].map((m) => m[1])).toEqual(['Would change', 'Newly blocked', 'Unchanged'])
    expect(count(out, 'aria-pressed="true"')).toBe(1)
  })

  it('lists the sign-ins two lines each under one header: when, who, where to; Today → If turned on', () => {
    expect(out).toMatch(/class="tpanel-pastgrid tpanel-head" aria-hidden="true"><span>Today<\/span><span><\/span><span>If turned on<\/span>/)
    expect(count(out, 'class="tpanel-rowbtn tpanel-past__who"')).toBe(8)
    expect(count(out, 'class="tpanel-when"')).toBe(8)
  })
})

describe('the panel’s stylesheet and words', () => {
  const rules = panelCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('gives nothing a transform or a transition: motion owns the rows, the tab body and the segments', () => {
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
    expect(reduced).toMatch(/\.bb__insp\.is-swap,\s*\.bb__insp\.tpanel \{ animation: none; \}/)
    expect(reduced).toMatch(/\.tpanel-row__flash\s*\{[^}]*animation:\s*none/)
  })

  it('says none of the words the testing surfaces may not, and draws no Sparkles or Wand', () => {
    for (const src of [panelSrc, savedSrc, peopleSrc, pastSrc, pureSrc]) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      /* What a person reads: string literals, template text and JSX text. */
      const copy = [...code.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]).join('\n')
      expect(copy.length).toBeGreaterThan(40)
      expect(copy).not.toMatch(/\bAI\b|assistant|\blog ?in\b|gauntlet|blast radius|rehears/i)
      expect(code).not.toMatch(/\b(Sparkles|Wand\w*)\b/)
    }
  })
})
