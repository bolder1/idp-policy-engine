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
import { PeekView } from './PeekViews'
import { emptyDraft } from './sign-in-card'
import panelSrc from './InspectPanel.tsx?raw'
import pageSrc from '../SignInTests.tsx?raw'
import barSrc from './layouts/focus2-canvasbar.tsx?raw'
import focusSrc from './layouts/Focus2Layout.tsx?raw'
import { DETAILS_IN_BAR } from './phase'
import css from './inspect.css?raw'

/* The inspector, drawn (CHECK-ACCESS-INSPECTOR.md): one panel, a view per kind, the way in from every name on the run. */
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

const panelOf = (run: EngineRun, signIn: { personId: string; appId: string }, stack: InspectTarget[], pins: InspectTarget[] = []) =>
  html(<InspectPanel stack={stack} plan={run} reduced wide onToggleWidth={noop} onClose={noop} onPush={noop} onGoTo={noop} onEdit={noop} pins={pins} onPin={noop} signIn={signIn} />)
const panel = (stack: InspectTarget[], pins: InspectTarget[] = []) => panelOf(plan, { personId: 'u-leo', appId: 'aws' }, stack, pins)

describe('the inspector panel', () => {
  it('a policy: its kind and name, what it did to this sign-in, how each rule fared, the sign-in a press away, Edit in builder', () => {
    const out = panel([{ kind: 'policy', policyId: policy.id }])
    const said = text(out)
    expect(said).toContain(policy.name)
    expect(out).toContain('class="insp__kicker">Policy<')
    expect(out).toContain('insp__verdict is-negative')
    expect(said).toContain('Decided this sign-in')
    expect(said).toMatch(/About .*Status .*Applications .*Audience/)
    expect(said).toContain('Rules')
    expect(out).toContain('aria-label="Sign-in"')
    expect(said).toMatch(/This sign-in (LF )?Leo Fernandes Person AWS Console Application/)
    /* Read as text is off (owner, 6 Oct 2026): no tab row at all. */
    expect(out).not.toContain('role="tablist"')
    expect(said).not.toContain('Read as text')
    expect(out).toMatch(/class="bb__inspfoot insp__foot"[\s\S]*Edit in builder/)
    expect(out).toContain('aria-label="Pin to compare"')
    expect(out).toContain('aria-label="Copy this view"')
  })

  it('a rule: what this sign-in showed, the rule, what it uses, what the person is told', () => {
    const out = text(panel([{ kind: 'policy', policyId: policy.id }, { kind: 'rule', policyId: policy.id, ruleId: policy.rules[0].id }]))
    expect(out).toContain('This sign-in')
    expect(out).toContain('The rule')
    if (objectsOfRule(policy.rules[0], t.activeRiskProfileId).length) expect(out).toContain('Uses')
    expect(out).toContain('What the person is told')
    expect(out).toContain('Contact')
  })

  it('a long way in folds its middle into one step back', () => {
    const z = t.zones[0]
    const stack: InspectTarget[] = [
      { kind: 'policy', policyId: policy.id },
      { kind: 'rule', policyId: policy.id, ruleId: policy.rules[0].id },
      { kind: 'zone', id: z.id },
      { kind: 'person', id: 'u-leo' },
      { kind: 'app', id: 'aws' },
    ]
    const out = panel(stack)
    expect(out).toContain('aria-label="Where you are"')
    expect(out).toContain('…')
    expect((out.match(/class="insp__crumbstep"/g) ?? []).length).toBe(4)
  })

  it('a pin of the same kind offers Compare; a pin of another kind does not', () => {
    const other = t.policies.find((p) => p.id !== policy.id && !p.isSystem)!
    const top: InspectTarget = { kind: 'policy', policyId: policy.id }
    expect(panel([top], [{ kind: 'policy', policyId: other.id }])).toContain(`aria-label="Compare with ${other.name}"`)
    expect(panel([top], [{ kind: 'zone', id: t.zones[0].id }])).not.toContain('aria-label="Compare with')
    expect(panel([top], [{ kind: 'zone', id: t.zones[0].id }])).toContain('aria-label="Pinned"')
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
  const view = (run: EngineRun, appId: string, stack: InspectTarget[]) => panelOf(run, { personId: 'priya', appId }, stack)

  it('the runs are the cases they stand for', () => {
    expect(outlook.outcome.status).toBe('depends')
    expect(outlook.rules.map((r) => r.state)).toEqual(['unknown', 'possible'])
    expect(hrms.outcome.status).toBe('depends')
    expect(gd.isSystem).toBe(true)
    expect(hrms.rules.map((r) => r.state)).toEqual(['unknown', 'match', 'not-reached'])
  })

  it('the policy says Depends in the notice tone and names the rule it waits on — never "did not decide" over its own name', () => {
    const out = view(outlook, 'outlook', [{ kind: 'policy', policyId: dc.id }])
    const said = text(out)
    expect(out).toContain('insp__verdict is-notice')
    expect(said).toContain(`Depends Rule 1 · ${dc.rules[0].name} · Can’t tell: Device`)
    expect(said).not.toContain('Did not decide')
    expect(said).not.toContain(`${dc.name} did`)
    expect(said).not.toContain('Decided this sign-in')
    /* The list: the rule it could not tell, then the last row as the canvas draws it. */
    expect(said).toMatch(new RegExp(`${esc(dc.rules[0].name)} Can’t tell`))
    expect(said).toMatch(new RegExp(`${esc(FALLBACK_NAME)} If not`))
    expect(out).toContain('insp__fate is-if-not')
  })

  it('a rule it could not tell says what is at stake; the last row says which rule it waits on', () => {
    const r1 = text(view(outlook, 'outlook', [{ kind: 'rule', policyId: dc.id, ruleId: dc.rules[0].id }]))
    expect(r1).toContain(`Can’t tell If it matches: ${DECISION_WORDS[dc.rules[0].decision]}`)
    expect(r1).not.toContain('does not say enough')
    const last = view(outlook, 'outlook', [{ kind: 'rule', policyId: dc.id, ruleId: null }])
    expect(last).toContain('insp__verdict is-notice')
    expect(text(last)).toContain(`If rule 1 does not match ${DECISION_WORDS[outlook.rules[1].decision]} · ${dc.name}`)
    expect(text(last)).not.toContain('Can’t tell If it matches')
  })

  it('where a later rule matched, the policy still says Depends and that rule is "If not" — never "Decided this sign-in"', () => {
    const pol = view(hrms, 'hrms', [{ kind: 'policy', policyId: gd.id }])
    expect(text(pol)).toContain(`Depends Rule 1 · ${gd.rules[0].name} · Can’t tell: Device`)
    expect(text(pol)).not.toContain('Decided this sign-in')
    expect(pol).not.toContain('insp__rule is-decided')
    expect(text(pol)).toMatch(new RegExp(`${esc(gd.rules[1].name)} If not`))
    const r2 = text(view(hrms, 'hrms', [{ kind: 'rule', policyId: gd.id, ruleId: gd.rules[1].id }]))
    expect(r2).toContain(`If rule 1 does not match ${DECISION_WORDS[gd.rules[1].decision]} · ${gd.name}`)
    expect(r2).not.toContain('Decided this sign-in')
  })

  it('a run that decides is unchanged: Decided this sign-in, the rule that matched, no If not', () => {
    const out = panel([{ kind: 'policy', policyId: policy.id }])
    expect(out).not.toContain('is-if-not')
    expect(text(out)).not.toContain('Depends')
  })
})

describe('the peeks, drawn', () => {
  const seen = t.policies.flatMap((p) => p.rules.flatMap((r) => objectsOfRule(r, t.activeRiskProfileId)))
  for (const kind of ['zone', 'device'] as const) {
    it(`a ${kind} says what it is, the policies that use it, and the way into its library`, () => {
      const o = seen.find((x) => x.kind === kind)
      expect(o).toBeDefined()
      if (!o) return
      const out = text(html(<PeekView target={o} onPush={noop} />))
      expect(out).not.toContain('no longer there')
      expect(out).toContain('Used by')
      expect(text(panel([o]))).toMatch(kind === 'zone' ? /Open in Zones/ : /Open in Device profiles/)
    })
  }

  it('a person: who they are and the policies for them, and no library to leave for', () => {
    const out = text(html(<PeekView target={{ kind: 'person', id: 'u-leo' }} onPush={noop} />))
    expect(out).toContain('Contractor')
    expect(out).toContain('Policies for them')
    expect(text(panel([{ kind: 'person', id: 'u-leo' }]))).not.toMatch(/Open in /)
  })

  it('a person: the default is in their list, last and marked Default, as on an application (6 Oct 2026)', () => {
    const theDefault = t.policies.find((p) => p.isSystem)!
    for (const target of [{ kind: 'person', id: 'u-leo' }, { kind: 'app', id: 'aws' }] as const) {
      const out = text(html(<PeekView target={target} onPush={noop} />))
      expect(out).not.toContain('No policy yet')
      expect(out.endsWith(`${theDefault.name} Default`)).toBe(true)
    }
  })

  it('an application: the policies on it, and Applications', () => {
    const out = text(html(<PeekView target={{ kind: 'app', id: 'aws' }} onPush={noop} />))
    expect(out).toContain('Policies on it')
    expect(text(panel([{ kind: 'app', id: 'aws' }]))).toContain('Open in Applications')
  })

  it('an object that is gone says so', () => {
    expect(text(html(<PeekView target={{ kind: 'zone', id: 'nope' }} onPush={noop} />))).toContain('no longer there')
  })
})

describe('the way in, and the rules it keeps', () => {
  it('the page opens it from the names on the run; the canvas bar has no Details (owner, 6 Oct 2026), kept behind its flag', () => {
    expect(pageSrc).toContain('onInspect={INSPECTOR ? onInspect : undefined}')
    expect(pageSrc).toContain("panel === 'inspect' && !fresh ? [...cur.stack.filter((x) => !sameTarget(x, t)), t] : [t]")
    expect(DETAILS_IN_BAR).toBe(false)
    expect(focusSrc).toContain('details={DETAILS_IN_BAR && landed')
    expect(barSrc).toContain('data-fn="details"')
  })

  it('read-only: no Save, no Delete; the ways out are Edit in builder and the library', () => {
    expect(panelSrc).not.toMatch(/>\s*(Save|Delete)\s*</)
    expect(css).not.toMatch(/transform/)
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
