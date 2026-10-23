import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { factsOf as signInFacts, originPatch, type SignInForm } from '../testing/sign-in-form'
import { engineRun, type EngineRun } from './engine-run'
import { InspectPanel } from './InspectPanel'
import type { InspectTarget } from './inspect-model'
import { objectsOfRule } from './peek-model'
import { PeekPage } from './PeekViews'
import { emptyDraft } from './sign-in-card'
import panelSrc from './InspectPanel.tsx?raw'
import pageSrc from '../SignInTests.tsx?raw'
import barSrc from './layouts/focus2-canvasbar.tsx?raw'
import focusSrc from './layouts/Focus2Layout.tsx?raw'
import pillSrc from './layouts/classic2-pill.tsx?raw'
import { DETAILS_IN_BAR } from './phase'
import css from './inspect.css?raw'

/* The details panel, drawn (CHECK-ACCESS-INSPECTOR.md): one page per thing (owner, 6 Oct 2026) — an overview card, then
   the rules opening in place; the way in from the names on the run, the person and the application on the sign-in line. */
const t = showcaseTenant()
const env = envOf(t)
const html = (node: React.ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* A sign-in, run on the showcase tenant as the page runs it. */
function runOf(patch: Partial<SignInForm>): EngineRun {
  const form = { ...emptyDraft('2026-09-28', '09:30'), ...patch }
  const { facts } = signInFacts(form, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  const rows = rowsRead(t.policies, null, form.appId, { zones: t.zones, fingerprints: t.fingerprints })
  return engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}

/* Leo, a contractor, on AWS from home: refused by rule 1. */
const plan = runOf({ personId: 'u-leo', appId: 'aws', ...originPatch('home') })
const policy = t.policies.find((p) => p.id === plan.decider!.id)!

const panelOf = (run: EngineRun, target: InspectTarget) => html(<InspectPanel target={target} plan={run} reduced wide onToggleWidth={noop} onClose={noop} onEdit={noop} />)
const panel = (target: InspectTarget) => panelOf(plan, target)
/** The open rules' names, in order: what the accordion shows open. */
const openRules = (out: string) => [...out.matchAll(/<li class="insp__acc is-open[^"]*"><button type="button" class="insp__acchead" aria-expanded="true"[\s\S]*?class="insp__rname">([^<]+)</g)].map((m) => m[1])

describe('the details panel: one page', () => {
  it('a policy: the overview card at the top — name, status, facts, what it did to this sign-in — then its rules, the one that decided open', () => {
    const out = panel({ kind: 'policy', policyId: policy.id })
    const said = text(out)
    expect(out).toContain('class="insp__hero"')
    expect(said).toMatch(new RegExp(`Policy ${esc(policy.name)} Active`))
    expect(said).toMatch(/Applications .*Audience/)
    expect(out).toContain('insp__verdict is-negative')
    expect(said).toContain('Decided this sign-in')
    expect(said).toContain('Rules In order')
    expect(openRules(out)).toEqual([policy.rules[0].name])
    expect(said).toContain('This sign-in')
    expect(said).toContain('What it checks')
    expect(said).toContain('What the person is told')
    expect(out).toMatch(/class="bb__inspfoot insp__foot"[\s\S]*Edit in builder/)
    expect(out).toContain('aria-label="Copy this view"')
  })

  it('no pages over pages: no back, no breadcrumb, no Related, no pins, no tabs', () => {
    const out = panel({ kind: 'policy', policyId: policy.id })
    for (const gone of ['aria-label="Back"', 'aria-label="Where you are"', 'Related', 'Pin to compare', 'Compare with', 'role="tablist"', 'Read as text']) expect(out).not.toContain(gone)
  })

  it('a rule pressed on the canvas is its policy’s page with that rule open', () => {
    const r2 = policy.rules[1]
    const out = panel({ kind: 'rule', policyId: policy.id, ruleId: r2.id })
    expect(text(out)).toContain(policy.name)
    expect(openRules(out)).toEqual([r2.name])
    /* Not reached: it says so in place, and checks nothing against this sign-in. */
    expect(text(out)).toContain('An earlier rule decided, so this one was not checked.')
  })

  it('what a rule uses opens in place under it — never a page over this one', () => {
    const out = panel({ kind: 'policy', policyId: policy.id })
    if (objectsOfRule(policy.rules[0], t.activeRiskProfileId).length === 0) return
    expect(out).toContain('class="insp__uses"')
    expect(out).toMatch(/<button type="button" class="insp__use" aria-expanded="false">/)
  })
})

describe('a run that Depends: the policy that decides, and its rules (6 Oct 2026)', () => {
  /* Priya on Outlook, her device not stated: Device compliance's rule 1 reads
     the device, so it can't be told, and the last row is only "If not". */
  const outlook = runOf({ personId: 'priya', appId: 'outlook', device: { kind: 'none' } })
  const dc = t.policies.find((p) => p.id === outlook.decider?.id)!
  /* Priya on HRMS, her device not stated: the Global Default's rule 1 can't be
     told, and rule 2 — which matches — decides only if rule 1 does not. */
  const hrms = runOf({ personId: 'priya', appId: 'hrms', device: { kind: 'none' } })
  const gd = t.policies.find((p) => p.id === hrms.decider?.id)!

  it('the runs are the cases they stand for', () => {
    expect(outlook.outcome.status).toBe('depends')
    expect(outlook.rules.map((r) => r.state)).toEqual(['unknown', 'possible'])
    expect(hrms.outcome.status).toBe('depends')
    expect(gd.isSystem).toBe(true)
    expect(hrms.rules.map((r) => r.state)).toEqual(['unknown', 'match', 'not-reached'])
  })

  it('the policy says Depends in the notice tone and names the rule it waits on — that rule open; never "did not decide" over its own name', () => {
    const out = panelOf(outlook, { kind: 'policy', policyId: dc.id })
    const said = text(out)
    expect(out).toContain('insp__verdict is-notice')
    expect(said).toContain(`Depends Rule 1 · ${dc.rules[0].name} · Can’t tell: Device`)
    expect(said).not.toContain('Did not decide')
    expect(said).not.toContain('Decided this sign-in')
    expect(openRules(out)).toEqual([dc.rules[0].name])
    expect(said).toMatch(new RegExp(`${esc(dc.rules[0].name)} Can’t tell`))
    expect(said).toMatch(new RegExp(`${esc(FALLBACK_NAME)} If not`))
    expect(out).toContain('insp__fate is-if-not')
  })

  it('a rule it could not tell says what is at stake; the last row says which rule it waits on', () => {
    const r1 = text(panelOf(outlook, { kind: 'rule', policyId: dc.id, ruleId: dc.rules[0].id }))
    expect(r1).toContain(`If it matches: ${DECISION_WORDS[dc.rules[0].decision]}.`)
    const last = text(panelOf(outlook, { kind: 'rule', policyId: dc.id, ruleId: null }))
    expect(last).toContain('Applies only if rule 1 does not match.')
  })

  it('where a later rule matched, the policy still says Depends and that rule is "If not" — never "Decided this sign-in"', () => {
    const pol = panelOf(hrms, { kind: 'policy', policyId: gd.id })
    expect(text(pol)).toContain(`Depends Rule 1 · ${gd.rules[0].name} · Can’t tell: Device`)
    expect(text(pol)).not.toContain('Decided this sign-in')
    expect(pol).not.toContain('is-decided')
    expect(text(pol)).toMatch(new RegExp(`${esc(gd.rules[1].name)} If not`))
    const r2 = text(panelOf(hrms, { kind: 'rule', policyId: gd.id, ruleId: gd.rules[1].id }))
    expect(r2).toContain('Applies only if rule 1 does not match.')
  })

  it('a run that decides is unchanged: Decided this sign-in, the rule that matched, no If not', () => {
    const out = panel({ kind: 'policy', policyId: policy.id })
    expect(out).not.toContain('is-if-not')
    expect(text(out)).not.toContain('Depends')
  })
})

describe('the other pages: a zone, a device profile, a person, an application', () => {
  const seen = t.policies.flatMap((p) => p.rules.flatMap((r) => objectsOfRule(r, t.activeRiskProfileId)))
  for (const kind of ['zone', 'device'] as const) {
    it(`a ${kind}: its overview card, the policies that use it, and the way into its library`, () => {
      const o = seen.find((x) => x.kind === kind)
      expect(o).toBeDefined()
      if (!o) return
      const out = html(<PeekPage target={o} plan={plan} />)
      expect(out).toContain('class="insp__hero"')
      expect(text(out)).not.toContain('no longer there')
      expect(text(out)).toContain('Used by')
      expect(text(panel(o))).toMatch(kind === 'zone' ? /Open in Zones/ : /Open in Device profiles/)
    })
  }

  it('a person: who they are and the policies for them, and no library to leave for', () => {
    const out = text(html(<PeekPage target={{ kind: 'person', id: 'u-leo' }} plan={plan} />))
    expect(out).toContain('Contractor')
    expect(out).toContain('Policies for them')
    expect(text(panel({ kind: 'person', id: 'u-leo' }))).not.toMatch(/Open in /)
  })

  it('the default is in a person’s and an application’s list, last and marked Default', () => {
    const theDefault = t.policies.find((p) => p.isSystem)!
    for (const target of [{ kind: 'person', id: 'u-leo' }, { kind: 'app', id: 'aws' }] as const) {
      const out = text(html(<PeekPage target={target} plan={plan} />))
      expect(out).not.toContain('No policy yet')
      expect(out.endsWith(`${theDefault.name} Default`)).toBe(true)
    }
  })

  it('an application: the policies on it, the one that decided marked, and Applications', () => {
    const out = text(html(<PeekPage target={{ kind: 'app', id: 'aws' }} plan={plan} />))
    expect(out).toContain('Policies on it')
    expect(out).toContain(`${policy.name} Decided this sign-in`)
    expect(text(panel({ kind: 'app', id: 'aws' }))).toContain('Open in Applications')
  })

  it('an object that is gone says so', () => {
    expect(text(html(<PeekPage target={{ kind: 'zone', id: 'nope' }} plan={plan} />))).toContain('no longer there')
  })
})

describe('the way in, and the rules it keeps', () => {
  it('the page puts one thing in the panel, fresh; the canvas bar has no Details, kept behind its flag', () => {
    expect(pageSrc).toContain('onInspect={INSPECTOR ? onInspect : undefined}')
    expect(pageSrc).toContain('setInspect({ target: t, plan, see: see ?? null })')
    expect(DETAILS_IN_BAR).toBe(false)
    expect(focusSrc).toContain('details={DETAILS_IN_BAR && landed')
    expect(barSrc).toContain('data-fn="details"')
  })

  it('the person and the application are presses of their own on the sign-in line, opening their pages', () => {
    expect(pillSrc).toContain("onInspect({ kind: 'person', id: person.id }, true)")
    expect(pillSrc).toContain("onInspect({ kind: 'app', id: app.id }, true)")
    /* A group's stand-in is never presented as the person. */
    expect(pillSrc).toContain('onInspect && person && !group ?')
  })

  it('read-only: no Save, no Delete; the ways out are Edit in builder and the library', () => {
    expect(panelSrc).not.toMatch(/>\s*(Save|Delete)\s*</)
    expect(css).not.toMatch(/transform/)
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
