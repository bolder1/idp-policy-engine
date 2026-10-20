import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DecisionBadge } from '../../../decision-badge'
import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { Classic2Chain } from './classic2-chain'
import { useChainRun, type ChainFold } from './classic2-run'
import chainRaw from './classic2-chain.tsx?raw'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   ONE POLICY, ONE CARD, drawn (phase.ts ONE_POLICY_CARD, 20 Oct 2026): the
   merged Policy card's static markup over real showcase runs, the card held
   open as an admin's Expand all leaves it — its kicker and meta, one coloured
   outcome badge and the rest grey, the deciding row open, the Global Default
   at its foot; the Global Default's own card with the line that says why; the
   builder's Check access (`inPolicy`, no inspector), its head's ↗ and its foot
   names plain; the policy's Details on the head, none per row (20 Oct 2026).
   And off: the rule list exactly as the rule card drew it.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function propsOf(personName: string, appName: string, patch: Partial<SignInForm> = {}): RunLayoutProps {
  const person = t.directory.people.find((p) => p.name === personName) ?? null
  const app = t.apps.find((a) => a.name === appName) ?? null
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
  return {
    plan,
    s: plan.steps.length - 1,
    running: false,
    animate: false,
    reduced: true,
    jumped: true,
    runKey: 2,
    form,
    rows,
    asGroup: null,
    start: <div className="test-start" />,
    answer: <div className="test-answer" />,
    screens: screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person }),
    columns: cols.map((c) => columnView(c, '', t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id)),
    changed: null,
    expected: null,
    weaker: null,
    onPressPerson: noop,
    onAdd: noop,
    onOpenPolicy: noop,
    onOpenRule: noop,
    onAsGroup: noop,
  }
}

/** The Policy card open, as Expand all leaves it after a run lands. */
const POLICY_OPEN: ChainFold = { open: { 'sign-in': false, policy: true, rule: false, outcome: false }, anyOpen: true, fold: noop, set: noop, foldAll: noop }
/** With the merged card off: the rule card open too, so its list is drawn. */
const RULE_OPEN: ChainFold = { ...POLICY_OPEN, open: { ...POLICY_OPEN.open, rule: true } }

function Host({ run, onePolicy, litRow = null }: { run: RunLayoutProps; onePolicy: boolean; litRow?: string | null }) {
  const fold = onePolicy ? POLICY_OPEN : RULE_OPEN
  const data = useChainRun(run, { onePolicy })
  return (
    <div className="rl-c2">
      <Classic2Chain run={run} data={data} fold={fold} animate={false} snap start={<span className="test-start" />} signInCard={false} onePolicy={onePolicy} litRow={litRow} />
    </div>
  )
}
const draw = (run: RunLayoutProps, onePolicy = true, litRow: string | null = null) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Host run={run} onePolicy={onePolicy} litRow={litRow} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
/** One card of the chain, from its opening tag to the next card's. */
const cardOf = (html: string, card: string) => {
  const at = html.indexOf(`data-card="${card}"`)
  const next = html.indexOf('data-card="', at + 1)
  return at < 0 ? '' : html.slice(html.lastIndexOf('<', at), next < 0 ? undefined : html.lastIndexOf('<', next))
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
const count = (html: string, needle: string) => html.split(needle).length - 1
const inspect = { onInspect: noop }

const AISHA = { ...propsOf('Aisha Khan', 'Google Workspace'), ...inspect }
const HRMS = { ...propsOf('Sanjay Bhatt', 'HRMS'), ...inspect }
const DENY = { ...propsOf('Devon Rao', 'AWS Console', { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm>), ...inspect }

describe('the merged Policy card, open', () => {
  it('is "Policy", the policy, and the row that decided — no rule card on the chain', () => {
    const out = draw(AISHA)
    expect(out).not.toContain('data-card="rule"')
    const card = cardOf(out, 'policy')
    expect(card).toContain('aria-label="Policy: Access the app through corporate devices only"')
    expect(card).toContain('class="rl-c2__kicker">Policy<')
    expect(text(card)).toMatch(/^Policy Access the app through corporate devices only Rule 1 · Low risk — password/)
    expect(card).toContain('aria-label="Hide the rules of Access the app through corporate devices only"')
    /* Neither the search nor its sections, and no number of the policies. */
    for (const gone of ['rl-c2__search', 'rl-c2__prow', 'Policy 1 of', 'Reading in order', 'not reached</']) expect(card, gone).not.toContain(gone)
  })

  it('says each rule\'s outcome: one badge in its tone, on the row that decided, the rest grey', () => {
    const card = cardOf(draw(AISHA), 'policy')
    const rows = count(card, 'class="rl-c2__rule ')
    expect(rows).toBe(AISHA.plan.rules.length)
    expect(count(card, 'bx-decision-badge')).toBe(rows)
    expect(count(card, 'bx-badge--neutral bx-decision-badge')).toBe(rows - 1)
    expect(card).toMatch(/class="rl-c2__rule is-match is-open is-d-allow"[^>]*data-rule-row="[^"]+"/)
    expect(card).toContain('<span class="u-sr-only">, then </span><span class="bx-badge bx-badge--positive bx-decision-badge">')
    /* The list is the merged card's own, and its rows carry their rules' ids for the answers to follow. */
    expect(card).toContain('class="rl-c2__rules is-one"')
    expect(count(card, 'data-rule-row="')).toBe(rows)
  })

  it('ends with the Global Default as a quiet line, its name a press into the inspector on the page', () => {
    const card = cardOf(draw(AISHA), 'policy')
    expect(card).toContain('class="rl-c2__onefoot"')
    expect(text(card)).toContain('Outside this policy, Global Default Policy · Not reached')
    expect(card).toMatch(/<button type="button" class="rl-c2__pname rl-c2__pnamebtn" title="Open Global Default Policy">Global Default Policy<\/button>/)
    /* No reason line: the application's own decided. */
    expect(card).not.toContain('rl-c2__onereason')
  })

  it('opens the policy\'s details from the card\'s head, and no row carries Details of its own', () => {
    const card = cardOf(draw(AISHA), 'policy')
    const head = card.slice(0, card.indexOf('class="bb__tbody"'))
    expect(head).toContain('class="bb__act rl-c2__policydetails" aria-label="Details of Access the app through corporate devices only" title="Details"')
    expect(card).not.toContain('rl-c2__ruledetails')
    /* What a rule leans on is still a press into the inspector, inside the open row. */
    expect(card).toContain('class="rl-c2__use"')
  })

  it('draws a deny row with its deny edge', () => {
    const card = cardOf(draw(DENY), 'policy')
    expect(card).toMatch(/class="rl-c2__rule is-match is-open is-d-deny"/)
    expect(card).toContain('bx-badge--negative bx-decision-badge')
  })

  it('lights the row an answer points at, and opens it', () => {
    const later = AISHA.plan.rules.find((r) => r.state === 'not-reached' && r.index !== null)
    expect(later).toBeDefined()
    const card = cardOf(draw(AISHA, true, later?.id ?? null), 'policy')
    expect(card).toMatch(new RegExp(`class="rl-c2__rule is-not-reached is-open is-lit"[^>]*data-rule-row="${later?.id}"`))
  })
})

describe('the Global Default\'s own card', () => {
  it('says why under its head — the application\'s policy is inactive — and has no foot of its own', () => {
    const card = cardOf(draw(HRMS), 'policy')
    expect(card).toContain('aria-label="Policy: Global Default Policy"')
    expect(card).toMatch(/class="rl-c2__under rl-c2__onereason"><span class="bb__idx rl-c2__idx rl-c2__whyspace" aria-hidden="true"><\/span>/)
    expect(text(card)).toContain('HRMS access from corporate offices · Inactive')
    /* The policy it names opens in the inspector, and never folds the card. */
    expect(card).toContain('title="Open HRMS access from corporate offices"')
    expect(card).not.toContain('No policy covers')
    expect(card).not.toContain('Outside this policy')
    /* Before the body: it is under the head, folded or not. */
    expect(card.indexOf('rl-c2__onereason')).toBeLessThan(card.indexOf('class="bb__tbody"'))
  })
})

describe('the builder\'s Check access: no inspector, the policy being built', () => {
  it('the head\'s ↗ goes back to the draft (no row carries one), the foot\'s names are words, and the outsider\'s line goes back to the draft', () => {
    const aisha = { ...propsOf('Aisha Khan', 'Google Workspace'), inPolicy: 'sc-corporate-devices' }
    const card = cardOf(draw(aisha), 'policy')
    /* 20 Oct 2026, the owner: the policy's way out is on the card's head, not on each row inside it. */
    expect(card).toContain('class="bb__act rl-c2__policydetails" aria-label="Open Access the app through corporate devices only" title="Open in its policy"')
    expect(card).not.toContain('rl-c2__ruledetails')
    expect(card).not.toContain('aria-label="Details of rule')
    expect(card).toContain('<span class="rl-c2__pname" title="Global Default Policy">Global Default Policy</span>')
    /* Someone outside the draft: the Global Default is the card, and the draft's name is the way back to its canvas. */
    const outside = { ...propsOf('Priya Sharma', 'Box'), inPolicy: 'sc-box-engineering' }
    const gd = cardOf(draw(outside), 'policy')
    expect(text(gd)).toContain('Outside Box access')
    expect(gd).toContain('title="Open Box access"')
  })
})

describe('off: the four cards as they were', () => {
  it('draws the rule card, and its list without anything the merged card adds', () => {
    const out = draw(AISHA, false)
    expect(out).toContain('data-card="rule"')
    expect(out).toContain('class="rl-c2__rules"')
    for (const gone of ['is-one', 'data-rule-row', 'bx-decision-badge', 'rl-c2__onefoot', 'rl-c2__onereason', ', then </span>']) expect(out, gone).not.toContain(gone)
    expect(cardOf(out, 'policy')).toContain('aria-label="Policies: Access the app through corporate devices only"')
  })

  it('keeps the one Why under the Policies card and the PolicyCard call the Why pins read', () => {
    const src = chainRaw.replace(/\r\n/g, '\n')
    expect(src.split('<WhyUnder').length - 1).toBe(1)
    expect(src).toContain('under={why ? <WhyUnder why={why} /> : undefined}')
    const call = src.slice(src.indexOf('<PolicyCard'), src.indexOf('/>', src.indexOf('<PolicyCard')))
    expect(call).toContain('why={done ? why : null}')
    expect(src).toContain("why={k === 'policy' ? why : null} litRow={litRow} />")
  })
})

describe('the outcome badge, muted', () => {
  it('draws the kit\'s neutral badge with the same words', () => {
    const muted = renderToStaticMarkup(<DecisionBadge decision="2fa" muted />)
    expect(muted).toContain('class="bx-badge bx-badge--neutral bx-decision-badge"')
    expect(muted).toContain('Allow with 2FA')
    /* 2FA in its tone is the second green, never amber. */
    expect(renderToStaticMarkup(<DecisionBadge decision="2fa" />)).toContain('bx-badge--positive-strong')
  })
})
