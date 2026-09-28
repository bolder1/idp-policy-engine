/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EVERYONE, blankPolicy, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { EXAMPLES, dictionaryOf, readText, type DescribeTenant } from '../../create/describe-model'
import { checksView } from '../../create/describe-checks'
import { historyOf } from '../history'
import { envOf } from '../tenant-resolver'
import { BoardEmpty } from './BoardEmpty'
import { DescribePanel } from './DescribePanel'
import {
  RULES_ADDED,
  describeOffered,
  describeSession,
  describedDraft,
  doneFacts,
  emptyDescribe,
  undoDescribed,
  withDraftApps,
  writeDescribed,
  type DescribeState,
} from './describe-session'
import css from './describe.css?raw'

/* -----------------------------------------------------------------------------
   Describe it, as the board shows it (describe spec, §8.4, less the checks).

   Drawn without a browser, the way the other board pieces are tested here: the
   chooser and the panel as static markup, and the clicks as the calls the
   board makes for them (describe-session.ts) — the door, an example read and
   written, Done, and the toast's Undo. The reading and composing themselves
   are pinned in describe-model.test.ts; this is the join to the page.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const noop = () => {}

/* The chooser's cards, by their titles, in the order drawn. */
const starts = (out: string) => [...out.matchAll(/<button type="button" class="bb__start2"[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((m) => m[1])
const chooser = (p: Policy, on = true) =>
  html(<BoardEmpty fallback="deny" onUseTemplate={noop} onDescribe={describeOffered(on, p) ? noop : undefined} onScratch={noop} />)

describe('the door', () => {
  const draft = blankPolicy('Untitled policy 3', [])
  const live = { ...T.policies.find((p) => p.id === 'sc-hrms-office')!, rules: [] }

  it('is a third card, between the template and scratch, on a new draft', () => {
    const out = chooser(draft)
    expect(starts(out)).toEqual(['Use a template', 'Describe it', 'Start from scratch'])
    expect(text(out)).toContain('Describe it Type it or answer questions')
    expect(out).toContain('aria-label="A policy written from a sentence"')
    expect(out).toContain('bb__starts has-three')
  })

  it('is not offered once the policy is live, nor on a system policy, nor with the flag off', () => {
    expect(live.status).not.toBe('draft')
    expect(starts(chooser(live))).toEqual(['Use a template', 'Start from scratch'])
    expect(chooser(live)).not.toContain('has-three')
    expect(describeOffered(true, { ...draft, isSystem: true })).toBe(false)
    expect(describeOffered(true, { ...draft, type: 'Admin Access' as Policy['type'] })).toBe(false)
    expect(starts(chooser(draft, false))).toEqual(['Use a template', 'Start from scratch'])
  })
})

/* One example, pressed: the box takes its sentence, the reading follows, and
   the board's write puts three cards on the draft as one history entry. */
describe('an example, read and written', () => {
  const draft = blankPolicy('Untitled policy 3', [])
  const ex = EXAMPLES.find((e) => e.label === 'Corporate devices by risk')!
  const state: DescribeState = { text: ex.text, reading: readText(ex.text, dictionaryOf(tenant)) }

  it('writes three cards for Corporate devices by risk, in one step', () => {
    const { policy, sources } = describedDraft(draft, state.reading.answers, tenant, new Map())
    expect(policy.rules.map((r) => r.name)).toEqual(['Low risk', 'Medium risk', 'High risk'])
    expect(policy.fallback?.decision).toBe('deny')
    /* Each band's card carries its own clause. */
    expect(Object.values(sources)).toEqual(['password at low risk', 'OTP over Email at medium risk', 'deny at high risk'])
    const { hist, session } = writeDescribed(historyOf(draft), policy, describeSession(draft.audience))
    expect(hist.past).toEqual([draft])
    expect(session.wrote).toBe(true)
  })

  it('keeps each card’s id when the answers are composed again', () => {
    const ids = new Map<string, string>()
    const first = describedDraft(draft, state.reading.answers, tenant, ids).policy.rules.map((r) => r.id)
    const again = describedDraft(draft, state.reading.answers, tenant, ids).policy.rules.map((r) => r.id)
    expect(again).toEqual(first)
  })

  it('leaves the last row the draft had when the panel opened, when the text gives none', () => {
    const r = readText('Sales reach Salesforce with MFA from the office', dictionaryOf(tenant))
    const d = { ...draft, fallback: { ...draft.fallback!, decision: '2fa' as const } }
    expect(describedDraft(d, r.answers, tenant, new Map()).policy.fallback).toBe(d.fallback)
    /* Not the last row an earlier text in the same session wrote: a new
       reading replaces what the old one said. */
    const s = describeSession(EVERYONE, draft.fallback)
    const blocked = describedDraft(draft, readText('Sales reach Salesforce. Block anything else.', dictionaryOf(tenant)).answers, tenant, new Map(), s.fallbackBefore).policy
    expect(blocked.fallback?.decision).toBe('deny')
    expect(describedDraft(blocked, r.answers, tenant, new Map(), s.fallbackBefore).policy.fallback).toBe(draft.fallback)
  })

  it('shows the sentence in the box and the answers it gave', () => {
    const out = html(<DescribePanel tenant={tenant} policyId={draft.id} state={state} onState={noop} onDone={noop} onGo={noop} focus={null} bold={null} onTrace={noop} />)
    expect(out).toContain(`>${ex.text.replace(/&/g, '&amp;')}</textarea>`)
    const said = text(out)
    expect(said).toContain('Describe the policy')
    expect(said).toContain('Applications Google Workspace')
    expect(said).toContain('Who Sales, Finance and Vikram Nair')
    expect(said).toContain('Devices Only Corporate devices · Medium from 40, high above 70 From your text: “on a corporate device · at low risk · at medium risk · at high risk”')
    expect(said).toContain('Nothing else matched Deny')
    expect(said).not.toContain('Not added')
    expect(said).not.toContain('Checks')
  })

  it('takes the policy’s own applications as the default when the text names none', () => {
    const shown = withDraftApps(emptyDescribe(), ['hrms'])
    expect(shown.reading.answers.apps).toEqual({ value: ['hrms'], origin: 'default', spans: [] })
    const named = withDraftApps(state, ['hrms'])
    expect(named).toBe(state)
    /* The last application taken off by hand is an answer, not a gap for the
       policy's own list to fill back in. */
    const cleared: DescribeState = { ...state, reading: { ...state.reading, answers: { ...state.reading.answers, apps: { value: [], origin: 'picked', spans: [] } } } }
    expect(withDraftApps(cleared, ['hrms'])).toBe(cleared)
  })
})

describe('Done, and the toast’s Undo', () => {
  const draft = blankPolicy('Untitled policy 3', [])
  const ex = EXAMPLES.find((e) => e.label === 'Corporate devices by risk')!
  const answers = readText(ex.text, dictionaryOf(tenant)).answers

  it('names the policy from the answers, and mirrors the people named in the audience', () => {
    const facts = doneFacts(draft, answers, tenant, T.policies.map((p) => p.name))
    expect(facts.name).toBe('Google Workspace on Corporate devices')
    expect(facts.audience).toEqual({ everyone: false, groupIds: ['sales', 'finance'], userIds: ['u-exec-2'] })
    /* A name the admin gave is theirs. */
    expect(doneFacts({ ...draft, name: 'Sales laptops' }, answers, tenant, []).name).toBe('Sales laptops')
    expect(RULES_ADDED).toBe('Rules added. Not saved yet.')
  })

  it('steps back over the whole session in one Undo, to the chooser, with the audience from before', () => {
    let s = describeSession(EVERYONE)
    let h = historyOf(draft)
    const ids = new Map<string, string>()
    ;({ hist: h, session: s } = writeDescribed(h, describedDraft(draft, answers, tenant, ids).policy, s))
    /* A second answer, changed by hand: amended, not a second step. */
    const edited = { ...answers, fallback: { value: { decision: '2fa' as const, method: null, message: null }, origin: 'picked' as const, spans: [] } }
    ;({ hist: h, session: s } = writeDescribed(h, describedDraft(draft, edited, tenant, ids).policy, s))
    expect(h.past).toHaveLength(1)

    const back = undoDescribed(h, h.present, s)
    expect(back?.hist.present).toBe(draft)
    expect(back?.audience).toEqual(EVERYONE)
    expect(back?.chooser).toBe(true)
  })

  it('does nothing once another edit came after it', () => {
    const s = describeSession(EVERYONE)
    const { hist } = writeDescribed(historyOf(draft), describedDraft(draft, answers, tenant, new Map()).policy, s)
    expect(undoDescribed(hist, draft, s)).toBeNull()
  })
})

describe('the panel', () => {
  const out = html(
    <DescribePanel tenant={tenant} policyId="p-new" state={emptyDescribe()} onState={noop} onDone={noop} onGo={noop} focus={null} bold={null} onTrace={noop} />,
  )

  it('keeps nothing but buttons in its foot', () => {
    const foot = /<div class="bb__inspfoot bdsc__foot">([\s\S]*?)<\/div>\s*<\/aside>/.exec(out)?.[1] ?? ''
    expect(foot).toContain('Done')
    expect(text(foot.replace(/<button[\s\S]*?<\/button>/g, ''))).toBe('')
  })

  it('says how it reads, once, on the heading', () => {
    expect(out).toContain('How phrases are read')
    expect(text(out)).not.toMatch(/\bAI\b/)
    expect(text(out).toLowerCase()).not.toContain('assistant')
  })

  it('asks for text with a visible label, and offers the four examples as a group', () => {
    expect(out).toContain('<label for="bdsc-text"')
    expect(out).toContain('maxLength="500"')
    expect(out).toMatch(/role="group" aria-label="Examples"/)
    for (const ex of EXAMPLES) expect(text(out)).toContain(ex.label)
  })

  it('opens with the answers at their defaults, and the first one not set open', () => {
    const said = text(out)
    expect(said).toContain('Applications Not set')
    expect(said).toContain('Who Everyone Default')
    expect(said).toContain('Where and when Anywhere · Any time Default')
    expect(said).not.toContain('Leave out')
    /* Nothing read yet is no reason to open nothing (describe spec, §3.4). */
    const open = [...out.matchAll(/<button type="button" id="[^"]*-h-(\w+)" class="bdsc__head" aria-expanded="true"/g)].map((m) => m[1])
    expect(open).toEqual(['apps'])
  })

  it('opens Sign-in first when the policy already has its applications', () => {
    const withApps = html(
      <DescribePanel tenant={tenant} policyId="p-new" state={withDraftApps(emptyDescribe(), ['hrms'])} onState={noop} onDone={noop} onGo={noop} focus={null} bold={null} onTrace={noop} />,
    )
    const open = [...withApps.matchAll(/<button type="button" id="[^"]*-h-(\w+)" class="bdsc__head" aria-expanded="true"/g)].map((m) => m[1])
    expect(open).toEqual(['signIn'])
  })
})

/* The checks under the answers (describe spec, §3.7 and §8.4): drawn from the
   rows the board computes (describe-checks.ts), each one a button. */
describe('the checks', () => {
  const blank = blankPolicy('Untitled policy 3', [])
  const policies = [blank, ...T.policies]
  const withDraft: DescribeTenant = { ...tenant, policies }
  const ex = EXAMPLES.find((e) => e.label === 'HRMS from the office')!
  const state: DescribeState = { text: ex.text, reading: readText(ex.text, dictionaryOf(withDraft)) }
  const { policy, sources } = describedDraft(blank, state.reading.answers, withDraft, new Map())
  const ctx = { draft: policy, sources, tenant: withDraft, env: envOf({ ...T, policies }), adminId: 'jaspreet', today: '2026-09-28' }
  const panel = (checks: ReturnType<typeof checksView> | undefined) =>
    html(<DescribePanel tenant={withDraft} policyId={blank.id} state={state} onState={noop} onDone={noop} onGo={noop} focus={null} bold={null} onTrace={noop} checks={checks} onTryCheck={noop} />)

  it('lists each sign-in as one button, with the decision, and the What changes line under them', () => {
    const out = panel(checksView(state.reading.answers, ctx))
    const said = text(out)
    expect(said).toContain('Checks')
    expect(out).toContain('aria-label="About checks"')
    const rows = [...out.matchAll(/<button type="button" class="bdsc__check" aria-label="([^"]+)"/g)].map((m) => m[1])
    expect(rows).toEqual([
      'Should pass, Kavya Menon · HRMS · Office network · Windows 11 laptop · registered, Allow with 2FA',
      'Should stop, Kavya Menon · HRMS · Home broadband · Windows 11 laptop · registered, Deny',
      'Edge, Kavya Menon · HRMS · Office network · London · Windows 11 laptop · registered, Deny',
      'Not named, Sanjay Bhatt · HRMS · Office network · Windows 11 laptop · registered, Allow on 1 factor',
    ])
    expect(out).toContain('title="From your text: “only from a corporate office”"')
    /* HRMS access from corporate offices opens Inactive (Phase 4), so the
       Global Default decides HR and Finance on HRMS today and this draft
       would start deciding for them: Priya's modelled sign-ins move. */
    expect(said).toContain('What changes Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 18 · Now denied 72')
    /* No count of checks, and no grade. */
    expect(said).not.toMatch(/\d+ (checks|passed|failing)/i)
  })

  it('asks for an application before it has anything to check', () => {
    const said = text(panel(null))
    expect(said).toContain('Checks')
    expect(said).toContain('Choose an application')
    expect(said).not.toContain('What changes')
  })

  it('draws nothing with the edition’s checks off', () => {
    expect(text(panel(undefined))).not.toContain('Checks')
  })

  it('keeps the checks in the history entry with the rules they were tried on', () => {
    const s = describeSession(EVERYONE)
    const h = historyOf(blank)
    const first = writeDescribed(h, policy, s)
    /* The same rules, other checks: still this session's one entry, amended. */
    const again = writeDescribed(first.hist, { ...first.hist.present, checks: [] }, first.session)
    expect(again.hist).not.toBe(first.hist)
    expect(again.hist.past).toHaveLength(1)
  })

  it('leaves the reading as it was while the box is typed in', () => {
    const typed = withDraftApps(emptyDescribe(), ['hrms'])
    const next = withDraftApps({ ...typed, text: 'HR' }, ['hrms'])
    expect(next.reading).toBe(typed.reading)
  })
})

/* No model, persona, sparkle or wand: the reading is matching, and it says so
   in one tooltip. The Interview's icons went with it. */
describe('the words and the marks', () => {
  const SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
  const PANEL = ['./DescribePanel.tsx', './describe-session.ts', './BoardEmpty.tsx', '../../create/describe-model.ts', '../../create/describe-checks.ts', '../../draft-checks.ts']

  it('never says AI or assistant on the panel, the card or the toast', () => {
    for (const f of PANEL) {
      const src = SOURCES[f]
      expect(src, f).toBeDefined()
      const strings = [...src.matchAll(/'([^'\n]*)'|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3])
      expect(strings.filter((x) => /\bAI\b|assistant/i.test(x)), f).toEqual([])
    }
  })

  it('imports no Sparkles or Wand anywhere under src/brand', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100)
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => /import\s*\{[^}]*\b(Sparkles|Wand2?)\b[^}]*\}\s*from\s*'lucide-react'/.test(src))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('has no Interview left to mount', () => {
    expect(Object.keys(import.meta.glob('../../create/{Interview.tsx,interview-model.ts,interview.css}'))).toEqual([])
  })
})

describe('the stylesheet', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('stops every transition and animation under reduced motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(rules)?.[1] ?? ''
    for (const m of rules.matchAll(/^\s*([^{@}]+)\{[^}]*\b(transition|animation)\s*:/gm)) {
      const selectors = m[1].split(',').map((x) => x.trim())
      for (const sel of selectors) expect(reduced, `${sel} ${m[2]}`).toContain(sel)
    }
    expect(reduced).toMatch(/transition: none/)
    expect(reduced).toMatch(/animation: none/)
  })

  it('moves nothing by transform, and takes its colours from the tokens', () => {
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    expect(rules).not.toContain('--text-muted')
  })
})
