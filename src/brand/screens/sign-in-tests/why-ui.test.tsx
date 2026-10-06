/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AccessDecision } from '../../data'
import { showcaseTenant, type Tenant } from '../../fixtures'
import { BrandProvider, useNameLookup } from '../../store'
import { columnsFor, routeOf, runColumns } from '../board/try-sign-in'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { screensOf } from '../testing/screens-of'
import { factsOf, formOf, type SignInForm } from '../testing/sign-in-form'
import { engineRun } from './engine-run'
import { Answer, EngineJourney } from './EngineJourney'
import { eachGroupRows, expectMark, findingsCount, heroFinding, pathTone, whyItems, whyTitle, type WhyTone } from './journey'
import { GROUP_PREFIX, emptyDraft, personPick, withDefaults } from './sign-in-card'
import { WhyCard } from './WhyCard'
import { ATTEMPTS_LINK, REVIEW_ATTEMPTS, attemptsGetThroughSaid, attemptsOnSaid, breakInSummary, runBreakInOnApp, type AppBreakInSummary } from '../break-in-app'
import { BREAK_IN_TIP } from '../break-in-model'
import { ATTEMPTS_PANEL_ID } from './attempts'
import journeySrc from './EngineJourney.tsx?raw'
import tryJourneySrc from './TryJourney.tsx?raw'
import whySrc from './WhyCard.tsx?raw'
import pageSrc from '../SignInTests.tsx?raw'
import ruleCardSrc from '../board/RuleCard.tsx?raw'
import nodesSrc from './RunNodes.tsx?raw'
import css from './journey.css?raw'
import boardCss from '../board/board.css?raw'
import policyCheckSrc from '../board/PolicyCheck.tsx?raw'

/* Troubleshooting, drawn (owner, 30 Sep – 1 Oct: "one person is in both
   groups … how do we showcase this and how can the user troubleshoot it? …
   if we have a conflict how do we show it?"). Every row of the troubleshooting
   matrix (scratchpad troubleshoot/matrix.md, pinned as a model in
   conflicts.test.ts) is a saved sign-in one click away; here each is drawn:
   the count on the policy that decided, the answer's ONE strip, and the why
   (WhyCard.tsx) — As each group, then every finding in the model's order and
   words. Since 1 Oct 2026 the why opens in the page's right-hand panel
   (owner: "for the conflict open the right side panel instead of under the
   outcome"), and under the answer only where a caller has no panel. A server
   render runs no effect and takes no press, so the why is drawn on its own,
   handed what the journey hands it; how the journey opens it is pinned from
   its source. */

const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const noop = () => {}

const saved = (id: string): SignInForm => formOf(t.savedSignIns.find((s) => s.id === id)!.facts, t.zones)

function planOf(f: SignInForm, x: Tenant = t) {
  const e = x === t ? env : envOf(x)
  const { facts } = factsOf(f, x.zones)
  const res = resolveSignIn(x.policies, facts, e)
  const rows = rowsRead(x.policies, null, f.appId, lib)
  const plan = engineRun({ res, policies: x.policies, form: f, facts, env: e, ctx: { people: x.directory.people, apps: x.apps, zones: x.zones, rows }, intro: 'none' })
  const person = x.directory.people.find((u) => u.id === f.personId) ?? null
  const screens = screensOf(res, { policies: x.policies, methods: x.methods, defaultMethodId: undefined, person })
  return { plan, res, screens }
}

/* The settled chain at a glance, as the page lands it — and, loaded from a saved sign-in, what it expects. */
function glance(f: SignInForm, expected: AccessDecision | null = null, weaker: string | null = null) {
  const { plan, screens } = planOf(f)
  return renderToStaticMarkup(
    <BrandProvider>
      <EngineJourney
        form={f}
        plan={plan}
        s={plan.at.done}
        animate={false}
        reduced
        running={false}
        editing={false}
        toggled={{}}
        onToggle={noop}
        showAll={false}
        onShowAll={noop}
        jumped={false}
        orientation="vertical"
        start={<div data-node="sign-in">Sign-in</div>}
        editCard={null}
        outcome={<Answer view={plan.outcome.view} changed={null} reduced screens={screens} appId={f.appId} expected={expected} weaker={weaker} />}
        onOpenPolicy={noop}
        onOpenRule={noop}
        onAdd={noop}
        onAsGroup={noop}
      />
    </BrandProvider>,
  )
}

/* The why, as the journey draws it under the answer once Why? is pressed. */
function WhyOf({ f, asGroup, x = t }: { f: SignInForm; asGroup?: (g: string) => void; x?: Tenant }) {
  const resolve = useNameLookup()
  const { plan } = planOf(f, x)
  const person = x.directory.people.find((u) => u.id === f.personId)!.name
  return (
    <WhyCard
      plan={plan}
      items={whyItems(plan)}
      groups={eachGroupRows(plan)}
      headline={whyTitle(plan)!}
      policies={x.policies}
      resolve={resolve}
      person={person}
      id="why"
      interactive
      onClose={noop}
      onOpenRule={noop}
      onOpenPolicy={noop}
      onAdd={noop}
      onAsGroup={asGroup}
    />
  )
}
/* `null`: no way to run again, so the rows are only read. */
const why = (f: SignInForm, asGroup: ((g: string) => void) | null = noop, x: Tenant = t) =>
  renderToStaticMarkup(
    <BrandProvider>
      <WhyOf f={f} asGroup={asGroup ?? undefined} x={x} />
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

const between = (o: string, a: string, b?: string) => o.slice(o.indexOf(a), b ? o.indexOf(b, o.indexOf(a)) : undefined)
/* The policy that decided (RunNodes.tsx `DeciderStop`), which policy before it, and the answer. */
const deciderOf = (o: string) => between(o, 'data-node="decider"', 'data-node="outcome"')
const policiesOf = (o: string) => between(o, 'data-node="which"', 'data-node="decider"')
const heroOf = (o: string) => o.slice(o.indexOf('data-node="outcome"'))
/* The why's parts: its title, As each group, the findings in order. */
const titleOf = (w: string) => text(between(w, '<h3', '</h3>')).replace(/^Why: /, '')
/* A row's words, its face (initials, drawn for the eye) left out. */
const rowsOf = (w: string) => [...w.matchAll(/<li><(?:div|button)[^>]*class="tj-why__grow[^"]*"[\s\S]*?<\/li>/g)].map((m) => text(m[0].replace(/<span class="tj-why__face"[\s\S]*?<\/span><\/span>/, '')))
const findingsOf = (w: string) => {
  const list = between(w, '<ul class="tj-why__list"')
  return [...list.matchAll(/<li class="tj-why__(rule|item)[^"]*" data-kind="([^"]+)">([\s\S]*?)<\/li>(?=<li class="tj-why__|<\/ul>)/g)].map((m) => ({ shape: m[1], kind: m[2], words: text(m[3]), html: m[3] }))
}

/* One matrix row: what the glance and the why must say. */
interface Case {
  id: string
  /** The sign-in, when it is not the saved one as it stands (g: the device taken off). */
  form?: SignInForm
  /** The policy's count; null when there is only the quiet to say (a draft that would change nothing, a same-answer rule). */
  count: string | null
  tone: WhyTone
  /** The why's title — and the answer's strip, unless `quiet`. */
  line: string
  /** Only the quiet to say: no count, no strip; a quiet Why? at the end of who decided. */
  quiet?: boolean
  path: 'positive' | 'notice' | 'negative' | 'neutral'
  rows?: string[]
  findings: { kind: string; shape: 'rule' | 'item'; says: string[] }[]
}

const MAYA_GITHUB = saved('ssi-maya-github')

const MATRIX: Case[] = [
  {
    id: 'ssi-maya-github',
    count: '1 conflict',
    tone: 'conflict',
    line: "Maya Iyer is in Engineering and Finance — Engineering's rule applies first",
    path: 'positive',
    rows: [
      'As Engineering Allow on 1 factor Rule 1 · In the office on a compliant device',
      'As Finance Allow with 2FA Rule 3 · Finance, on a compliant device',
      "As Maya (both) Allow on 1 factor Engineering's rule comes first — this sign-in",
    ],
    findings: [
      {
        kind: 'rule-conflict',
        shape: 'rule',
        says: [
          'Finance, on a compliant device',
          'Also applies',
          'via Finance',
          'Also applies to Maya Iyer · via Finance',
          'Not used: Rule 1 matched first via Engineering, and the first rule that matches decides',
          'Move it above rule 1 to ask Finance for 2FA',
          'Open rule',
        ],
      },
      { kind: 'off-no-change', shape: 'item', says: ['Code review for Finance · Draft · via Finance', 'Draft — on, it would change nothing: Developer tools — office and device checks comes first', 'Open policy'] },
    ],
  },
  {
    id: 'ssi-maya-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first',
    path: 'positive',
    rows: ['As Engineering Allow on 1 factor AWS for engineering teams · rule 2', 'As Finance Allow with 2FA AWS billing for Finance · rule 1', 'As Maya (both) Allow on 1 factor AWS for engineering teams is higher in the list — this sign-in'],
    findings: [
      {
        kind: 'policy-conflict',
        shape: 'item',
        says: [
          'AWS billing for Finance also covers Maya Iyer · via Finance Allow with 2FA',
          'Not used: Maya Iyer is in Finance for this one and Engineering for AWS for engineering teams. One policy applies to a person on an application: the one higher in the list',
          'Add a rule that names Maya Iyer to AWS for engineering teams, above rule 2',
          'Open rule',
        ],
      },
    ],
  },
  {
    id: 'ssi-tom-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Two AWS Console policies cover DevOps — AWS for engineering teams applies first',
    path: 'positive',
    findings: [
      {
        kind: 'same-group-policy',
        shape: 'item',
        says: [
          'AWS production for DevOps also covers Tom Whelan · via DevOps Allow with 2FA',
          'Not used: Both cover DevOps on AWS Console. One policy applies per application and group: the one higher in the list',
          'Add a rule for DevOps to AWS for engineering teams, above rule 2, that asks for 2FA (miniOrange Push)',
          'Open rule',
        ],
      },
    ],
  },
  {
    id: 'ssi-devon-slack',
    count: '1 finding',
    tone: 'info',
    line: 'Slack for everyone does not apply — a policy for Contractors comes first',
    path: 'notice',
    findings: [{ kind: 'group-policy-first', shape: 'item', says: ['Slack for everyone also covers Devon Rao · for everyone Allow on 1 factor', 'Not used: A policy for Contractors comes before a policy for everyone, wherever it is in the list'] }],
  },
  {
    id: 'ssi-leo-slack',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Contractors is an exception on rule 1, and Leo Fernandes is in Contractors',
    path: 'notice',
    rows: ['As Engineering Allow on 1 factor Rule 1 · Engineers, where we operate', 'As Contractors Allow with 2FA Rule 2 · Contractors on a corporate device', 'As Leo (both) Allow with 2FA Contractors is an exception on rule 1 — this sign-in'],
    findings: [
      {
        kind: 'exception',
        shape: 'item',
        says: [
          'Rule 1 leaves Leo Fernandes out · Contractors is an exception',
          'Rule 1 is for Engineering except Contractors. Leo Fernandes is in Engineering and in Contractors — an exception always wins.',
          'Add a rule that names Leo Fernandes above rule 1',
          'Open rule',
        ],
      },
      { kind: 'group-policy-first', shape: 'item', says: ['Slack for everyone also covers Leo Fernandes · for everyone'] },
    ],
  },
  {
    id: 'ssi-thomas-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Thomas Byrne is named in rule 2 — rule 1 applies first',
    path: 'notice',
    findings: [
      {
        kind: 'named-later',
        shape: 'rule',
        says: [
          'Thomas Byrne — access ends Friday',
          'by name',
          'Also applies to Thomas Byrne · by name',
          /* The whole point of the case: a name does not move a rule up. */
          'Not used: Naming Thomas Byrne does not move a rule up. Rule 1 matched first, and the first rule that matches decides',
          'Move it above rule 1 to refuse Thomas Byrne',
          'Open rule',
        ],
      },
    ],
  },
  {
    id: 'ssi-leo-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: "Leo Fernandes is in Engineering and Contractors — Contractors' rule applies first",
    path: 'negative',
    rows: ['As Engineering Allow on 1 factor Rule 2 · Engineers on a compliant device', 'As Contractors Deny Rule 1 · Contractors away from the office', "As Leo (both) Deny Contractors' rule comes first — this sign-in"],
    findings: [
      {
        kind: 'deny-first',
        shape: 'rule',
        says: [
          'Engineers on a compliant device',
          'Also applies to Leo Fernandes · via Engineering',
          'Not used: Rule 1 refuses Contractors first, and the first rule that matches decides',
          'Move it above rule 1 to let Engineering in on 1 factor',
          'It would let in people rule 1 refuses today',
          'Open rule',
        ],
      },
    ],
  },
  {
    id: 'ssi-kavya-office',
    count: '1 finding',
    tone: 'info',
    line: 'HRMS access from corporate offices is off — on, it would allow with 2FA',
    path: 'positive',
    findings: [
      { kind: 'off-would-change', shape: 'item', says: ['HRMS access from corporate offices · Switched off · via Human Resources', 'Switched off — on, it would decide Allow with 2FA (rule 1)', 'Turn it on to ask Kavya Menon for 2FA', 'Open policy'] },
    ],
  },
  {
    id: 'ssi-priya-github',
    count: null,
    tone: 'info',
    line: 'Code review for Finance is a draft — on, it would change nothing',
    quiet: true,
    path: 'notice',
    findings: [{ kind: 'off-no-change', shape: 'item', says: ['Code review for Finance · Draft · via Finance', 'Draft — on, it would change nothing: Developer tools — office and device checks comes first'] }],
  },
  {
    id: 'ssi-maya-github (device not stated)',
    form: { ...MAYA_GITHUB, device: { kind: 'none' } },
    count: '1 finding',
    tone: 'depends',
    line: 'Depends on the device — state it to see which rule decides',
    path: 'notice',
    rows: [
      "As Engineering Can't tell Allow on 1 factor or Allow with 2FA or Deny",
      "As Finance Can't tell Allow with 2FA or Deny",
      "As Maya (both) Can't tell Allow on 1 factor or Allow with 2FA or Deny It depends on the device — this sign-in",
    ],
    findings: [
      { kind: 'depends', shape: 'item', says: ['Depends on the device: Allow on 1 factor, Allow with 2FA or Deny', 'Rule 1 Allow on 1 factor', 'Rule 2 Allow with 2FA', 'Deny', 'Add device'] },
      { kind: 'off-no-change', shape: 'item', says: ['Code review for Finance · Draft · via Finance'] },
    ],
  },
  {
    id: 'ssi-ravi-aws',
    count: '1 finding',
    tone: 'info',
    line: 'No AWS Console policy covers Ravi Menon — the Global Default decides',
    path: 'positive',
    findings: [
      {
        kind: 'not-covered',
        shape: 'item',
        /* His groups once, then each policy by name and who it covers; no fix the board cannot do, no ambiguous "its". */
        says: ['3 AWS Console policies do not cover Ravi Menon', 'Ravi Menon is in IT Admins', 'AWS for engineering teams Engineering, DevOps, Contractors', 'AWS billing for Finance Finance', 'AWS production for DevOps DevOps'],
      },
    ],
  },
  {
    id: 'ssi-james-austin',
    count: '1 finding',
    tone: 'info',
    line: 'No Workday policy — the Global Default decides',
    path: 'negative',
    findings: [{ kind: 'not-covered', shape: 'item', says: ['No policy on Workday', 'No application policy names Workday, so the Global Default decides every sign-in to it, by its own rules'] }],
  },
  {
    id: 'ssi-maya-london',
    count: null,
    tone: 'info',
    line: 'Rule 3 also applies via Finance — the same decision, asking Google Authenticator instead of miniOrange Push',
    quiet: true,
    path: 'notice',
    rows: ['As Engineering Allow with 2FA Rule 2 · Compliant device, working remotely', 'As Finance Allow with 2FA Rule 3 · Finance, on a compliant device', "As Maya (both) Allow with 2FA Engineering's rule comes first — this sign-in"],
    findings: [
      { kind: 'also-matches', shape: 'item', says: ['Rule 3 also applies to Maya Iyer · via Finance', 'Not used — rule 2 matched first; it would give the same decision, asking Google Authenticator instead of miniOrange Push', 'Open rule'] },
      { kind: 'off-no-change', shape: 'item', says: ['Code review for Finance · Draft · via Finance'] },
    ],
  },
]

describe('every row of the troubleshooting matrix, drawn: the glance and the why', () => {
  for (const c of MATRIX) {
    describe(c.id, () => {
      const f = c.form ?? saved(c.id.split(' ')[0])
      const o = glance(f)
      const w = why(f)
      const { plan } = planOf(f)

      /* The count moved from the one policy node to the policy that decided,
         and the answer's line with Why? at its end became ONE strip, the
         whole of it the press (owner, 1 Oct: "make the conflict easy to
         find"); Open policy is gone, the quiet Why? at the end of who decided. */
      it(
        c.count
          ? `the policy that decided counts it once — "${c.count}", ${c.count.includes('conflict') ? 'yellow' : 'the neutral pill'} — and the answer says it as ONE strip, “${c.tone === 'conflict' ? 'Review conflict' : 'Why'} ›”`
          : 'only the quiet to say: no count, no strip — a quiet Why? at the end of who decided',
        () => {
          const hero = heroOf(o)
          if (!c.count) {
            expect(o).not.toContain('tj-pnode__count')
            expect(hero).not.toContain('tj-hero__strip')
            const by = between(hero, '<p class="tj-hero__by"', '</p>')
            expect(by).toMatch(/<button type="button" class="tj-hero__whybtn" aria-expanded="false">Why\?<\/button>$/)
            expect(text(by)).toMatch(/^Decided by .+ · Rule \d Why\?$/)
            expect(text(hero)).not.toContain('Open policy')
            return
          }
          expect(text(deciderOf(o))).toContain(`Decides ${c.count}`)
          const pill = c.count.includes('conflict') ? 'is-conflict' : 'is-folded'
          expect(deciderOf(o)).toContain(`<button type="button" class="bb__state bb__tstate ${pill} tj-pnode__count" aria-expanded="false" title="Why">`)
          /* Said once: not on which policy, open. */
          expect(policiesOf(o)).not.toContain('tj-pnode__count')
          expect(hero).toContain(`<button type="button" class="tj-hero__strip is-${c.tone}" aria-expanded="false">`)
          expect(text(between(hero, '<span class="tj-hero__stext">', '</span>'))).toBe(c.line)
          expect(text(between(hero, '<span class="tj-hero__sgo">', '</span>'))).toBe(c.tone === 'conflict' ? 'Review conflict' : 'Why')
          /* The strip is the press: no Why? of its own beside it. */
          expect(hero).not.toContain('tj-hero__whybtn')
          /* The number is the policy's, never said again. */
          expect(text(hero)).not.toContain(c.count)
        },
      )

      it('the decided path is the outcome’s colour', () => {
        expect(pathTone(plan)).toBe(c.path)
        expect(o).toContain(`is-path-${c.path}`)
      })

      it('the why’s title is the answer’s line, in its tone', () => {
        expect(titleOf(w)).toBe(c.line)
        expect(w).toContain(`class="tj-why__mark is-${c.tone}"`)
      })

      it(c.rows ? 'As each group: a row a group, then the person — each answer, where from, and why theirs is theirs' : 'one group: no As each group', () => {
        if (!c.rows) {
          expect(w).not.toContain('As each group')
          return
        }
        expect(rowsOf(w)).toEqual(c.rows)
      })

      it('every finding, in the model’s order and words, each with its tone and at most one action', () => {
        const got = findingsOf(w)
        expect(got.map((g) => [g.kind, g.shape])).toEqual(c.findings.map((x) => [x.kind, x.shape]))
        expect(got.map((g) => g.kind)).toEqual(plan.conflicts!.findings.map((x) => x.kind))
        c.findings.forEach((x, i) => {
          for (const say of x.says) expect(got[i].words, `${x.kind}: ${say}`).toContain(say)
          expect([...got[i].html.matchAll(/tj-(?:conflict|why)__(?:open|act)/g)].length, x.kind).toBeLessThanOrEqual(2)
        })
      })
    })
  }

  it('a rule that also applies is its card, whole, yellow, its rows that held marked in the notice tone; everything else is ONE line', () => {
    const w = why(MAYA_GITHUB)
    const [card] = findingsOf(w)
    expect(card.html).toMatch(/class="bb__card is-trace is-mfa is-t-not-reached is-open is-conflict"/)
    expect(card.html).toContain('bb__tbody')
    expect(card.html).toMatch(/class="bb__state bb__tstate is-conflict">Also applies</)
    expect(card.html).toContain('class="tj-conflict"')
    /* The card takes no press of its own: Open rule, in its notice, is its one action — its title is words, out of the Tab order. */
    expect([...card.html.matchAll(/class="tj-conflict__open"/g)]).toHaveLength(1)
    expect(card.html).not.toContain('bb__topen')
    expect(card.html).not.toMatch(/<button[^>]*class="bb__titlebtn"/)
    expect(card.html).toMatch(/<span id="[^"]+" class="bb__titlebtn is-static"><span class="u-sr-only">Rule 3: <\/span><strong>Finance, on a compliant device<\/strong><\/span>/)
    /* A trace card with a press keeps its title a button (the chain's). */
    expect(ruleCardSrc).toContain('{onFold || onOpen ? (')
  })

  it('a policy that lost is fixed in the one that won: its one action opens the rule of the deciding policy the fix adds one above; its name opens it', () => {
    const cases: [string, string, string][] = [
      ['ssi-maya-aws', 'sc-aws-finance', 'AWS billing for Finance'],
      ['ssi-tom-aws', 'sc-aws-devops', 'AWS production for DevOps'],
    ]
    const eng = t.policies.find((p) => p.id === 'sc-aws-engineering')!
    for (const [id, loser, name] of cases) {
      const item = whyItems(planOf(saved(id)).plan)[0]
      expect(item.action, id).toMatchObject({ kind: 'rule', label: 'Open rule', policyId: 'sc-aws-engineering', ruleId: eng.rules[1].id })
      expect(item.link, id).toEqual({ policyId: loser, label: name })
      const w = why(saved(id))
      expect(w, id).toContain(`<button type="button" class="tj-why__name" title="Open ${name}">${name}</button>`)
    }
    /* And its name leads to a board that has her in it — through Finance, her second group — not "Not in this policy". */
    const fin = t.policies.find((p) => p.id === 'sc-aws-finance')!
    const { facts } = factsOf(saved('ssi-maya-aws'), t.zones)
    const route = routeOf(runColumns(columnsFor(fin, fin, 'aws'), t.policies, facts, env).at(-1)!, fin, facts, env, t.policies)
    expect(route.who).toMatchObject({ word: 'In audience', state: 'pass' })
    /* A policy that comes first by design has no fix: its name is the only way to it. */
    const devon = whyItems(planOf(saved('ssi-devon-slack')).plan)[0]
    expect([devon.action, devon.link]).toEqual([null, { policyId: 'sc-slack-everyone', label: 'Slack for everyone' }])
  })

  it('no policy covers them: each policy by name, a quiet link, and who it covers — and no action', () => {
    const [item] = whyItems(planOf(saved('ssi-ravi-aws')).plan)
    expect(item).toMatchObject({ kind: 'not-covered', detail: 'Ravi Menon is in IT Admins', fix: '', action: null })
    expect(item.covers.map((m) => [m.policyId, m.audience])).toEqual([
      ['sc-aws-engineering', 'Engineering, DevOps, Contractors'],
      ['sc-aws-finance', 'Finance'],
      ['sc-aws-devops', 'DevOps'],
    ])
    const w = why(saved('ssi-ravi-aws'))
    expect(w).toContain('<ul class="tj-why__covers" aria-label="Who each policy covers">')
    expect(w).not.toMatch(/tj-why__act|audience to have it decide/)
  })

  /* The chain drew the policy's every rule, so a rule the why drew whole
     was folded on it while the why was open (RunChain.tsx, before 1 Oct).
     Now the chain draws ONE card, the rule that decided (owner, 1 Oct: "for
     the matched policy only show which rule matched"): the rule that also
     applies is its ⚠ on the rail, and whole only in the why. */
  it('a rule the why draws whole is its ⚠ mark on the chain’s rail, not a second card: the chain draws the rule that decided, the why the one that also applies', () => {
    const o = glance(MAYA_GITHUB)
    const { plan } = planOf(MAYA_GITHUB)
    const [r1, , r3] = plan.rules
    expect([...o.matchAll(/<div class="tj-rcard" data-node="([^"]+)"/g)].map((m) => m[1])).toEqual([r1.node])
    expect(deciderOf(o)).toMatch(/<button type="button" class="tj-rail__chip is-conflict" aria-pressed="false" aria-label="Rule 3: Finance, on a compliant device — Also applies"/)
    expect(o).not.toContain('class="tj-conflict"')
    const [card] = findingsOf(why(MAYA_GITHUB))
    expect(card.html).toContain('<strong>Finance, on a compliant device</strong>')
    expect(card.html).toContain('class="tj-conflict"')
    expect(r3.name).toBe('Finance, on a compliant device')
    /* Opened under the answer, the policy that decided folds to its line, so nothing of the rule is drawn twice there either. */
    expect(journeySrc).toContain('nodes.policy = false')
  })

  it('opened, the view keeps the policy that decided in it: the why is placed from the policy’s line, not the answer’s', () => {
    expect(journeySrc).toContain('const from = which && which.offsetHeight <= POLICY_LINE_MAX ? which : hero')
    expect(journeySrc).toContain('const POLICY_LINE_MAX = 120')
  })

  it('a person in three groups: the title and her row give the one reason, from the rule that decided', () => {
    const three: Tenant = { ...t, directory: { ...t.directory, people: t.directory.people.map((u) => (u.id === 'u-maya' ? { ...u, alsoGroupIds: ['finance', 'devops'] } : u)) } }
    const w = why(MAYA_GITHUB, noop, three)
    expect(titleOf(w)).toBe('Maya Iyer is in Engineering, Finance and DevOps — the rule for Engineering and DevOps applies first')
    expect(rowsOf(w).at(-1)).toBe('As Maya (all 3) Allow on 1 factor The rule for Engineering and DevOps comes first — this sign-in')
    expect(rowsOf(w).map((r) => r.split(' Allow')[0].split(' Can')[0])).toEqual(['As Engineering', 'As Finance', 'As DevOps', 'As Maya (all 3)'])
  })

  it('a saved sign-in that fails says so once, beside the answer: “Expected Allow with 2FA”, in the notice tone; not when it passes', () => {
    const kavya = saved('ssi-kavya-office')
    const hero = heroOf(glance(kavya, '2fa'))
    expect(hero).toMatch(/<span class="tj-hero__expect" title="This sign-in expects Allow with 2FA"><svg[^>]*tj-hero__emark[\s\S]*?<span class="u-sr-only">Fails: <\/span>Expected<span class="bx-badge[^"]*bx-decision-badge[^"]*"><span class="bx-badge__label">Allow with 2FA<\/span><\/span><\/span>/)
    expect(text(hero)).toContain('Allow on 1 factor Fails: Expected Allow with 2FA')
    expect(heroOf(glance(kavya, '1fa'))).not.toContain('tj-hero__expect')
    expect(heroOf(glance(kavya))).not.toContain('tj-hero__expect')
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toMatch(/\.tj-hero__expect \{[^}]*color: var\(--fb-notice-fg\);/)
    expect(tryJourneySrc).toContain('expected={expected}')
    expect(pageSrc).toContain('setLoaded({ name: sv.name, form: f, expected: sv.expected })')
  })

  /* A break-in attempt played on a factor its attack beats: the answer is
     the one it asks for, and that is no pass (break-in-app.ts `attemptPlay`). */
  it('an attempt given its answer on a factor its attack beats says “Weaker factor”, the factor in its title; nothing when it is not one', () => {
    const kavya = saved('ssi-kavya-office')
    const factor = 'miniOrange Push · standard · needs phishing-resistant'
    const hero = heroOf(glance(kavya, '1fa', factor))
    expect(hero).toMatch(/<span class="tj-hero__expect" title="miniOrange Push · standard · needs phishing-resistant"><svg[^>]*tj-hero__emark[\s\S]*?<span class="u-sr-only">Fails: <\/span>Weaker factor<span class="u-sr-only">\. miniOrange Push · standard · needs phishing-resistant<\/span><\/span>/)
    expect(hero).not.toContain('Expected')
    /* Another answer than expected is still said as Expected — the factor is moot then. */
    expect(text(heroOf(glance(kavya, '2fa', factor)))).toContain('Fails: Expected Allow with 2FA')
    expect(heroOf(glance(kavya, '1fa', null))).not.toContain('tj-hero__expect')
    expect([expectMark('2fa', '2fa', factor), expectMark('2fa', '2fa', ''), expectMark('2fa', 'deny', factor), expectMark(null, 'deny'), expectMark('deny', null, factor)]).toEqual([
      'weaker',
      'weaker',
      'fails',
      'fails',
      null,
    ])
    expect(tryJourneySrc).toContain('weaker={weaker}')
    expect(pageSrc).toContain('setLoaded({ name: p.name, form: f, expected: p.expected, weaker: p.weaker })')
  })

  it('an expanded trace keeps one colour on the path: a rule that did not decide wears its decision grey', () => {
    const rules = boardCss.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const sel of ['.is-t-missed', '.is-t-folded', '.is-t-off', '.is-t-not-reached:not(.is-conflict)']) {
      expect(rules).toContain(`.bb__card.is-trace${sel} .bb__ifchip:is(.is-tone-allow, .is-tone-mfa, .is-tone-deny)`)
    }
    expect(rules).toMatch(/\.bb__card\.is-trace\.is-t-not-reached:not\(\.is-conflict\) \.bb__ifchip:is\(\.is-tone-allow, \.is-tone-mfa, \.is-tone-deny\) \{\s*background: var\(--surface-sunken\);\s*border-color: var\(--border-subtle\);\s*color: var\(--text-tertiary\);\s*\}/)
  })

  it('a conflict and what can’t be told are yellow; the rest is quiet', () => {
    const tones = (w: string) => [...w.matchAll(/class="tj-why__item is-(\w+)" data-kind="([^"]+)"/g)].map((m) => [m[2], m[1]])
    expect(tones(why(saved('ssi-leo-slack')))).toEqual([
      ['exception', 'conflict'],
      ['group-policy-first', 'info'],
    ])
    expect(tones(why({ ...MAYA_GITHUB, device: { kind: 'none' } }))[0]).toEqual(['depends', 'depends'])
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toMatch(/\.tj-why__item\.is-conflict,\s*\.tj-why__item\.is-depends \{ border-color: var\(--fb-notice-border\); \}/)
    expect(rules).toMatch(/\.tj-why__item\.is-conflict \.tj-why__head,\s*\.tj-why__item\.is-depends \.tj-why__head \{ color: var\(--fb-notice-fg\); \}/)
    expect(rules).toMatch(/\.tj-why__icon \{[^}]*color: var\(--text-tertiary\);/)
  })

  it('the count is yellow only for a conflict: what is only worth knowing is the neutral pill with ⓘ', () => {
    expect(findingsCount(planOf(saved('ssi-kavya-office')).plan)).toEqual({ count: 1, text: '1 finding', conflict: false })
    expect(findingsCount(planOf(saved('ssi-maya-github')).plan)).toEqual({ count: 1, text: '1 conflict', conflict: true })
    /* A draft that would change nothing, a same-answer rule: not counted, not the line — the why alone says them. */
    for (const id of ['ssi-priya-github', 'ssi-maya-london']) {
      const { plan } = planOf(saved(id))
      expect([findingsCount(plan), heroFinding(plan)], id).toEqual([null, null])
      expect(whyTitle(plan), id).not.toBeNull()
    }
    /* The count is the policy that decided's now (RunNodes.tsx `DeciderStop`), its mark ⓘ where it is only worth knowing. */
    expect(nodesSrc).toContain("count.conflict ? 'is-conflict' : 'is-folded'")
    expect(nodesSrc).toContain("const CountMark = count?.conflict === false ? Info : TriangleAlert")
    expect(deciderOf(glance(saved('ssi-kavya-office')))).toMatch(/class="bb__state bb__tstate is-folded tj-pnode__count"[^>]*><svg[^>]*lucide-info/)
    expect(deciderOf(glance(MAYA_GITHUB))).toMatch(/class="bb__state bb__tstate is-conflict tj-pnode__count"[^>]*><svg[^>]*lucide-triangle-alert/)
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toMatch(/\.tj-pnode__count\.is-folded > svg \{ color: var\(--text-tertiary\); \}/)
  })

  it('nothing to say, nothing said: a single-group sign-in with no finding has no count, no strip, no Why?, no flag', () => {
    for (const id of ['ssi-arun-office', 'ssi-devon-android', 'ssi-sofia-london', 'ssi-emily-high']) {
      const o = glance(saved(id))
      const { plan } = planOf(saved(id))
      expect(findingsCount(plan), id).toBeNull()
      expect(heroFinding(plan), id).toBeNull()
      /* A refusal keeps the quiet Why? (its reason, how to get in); nothing else is said of any of them. */
      const refused = plan.outcome.decision === 'deny'
      expect(o, id).not.toMatch(refused ? /tj-pnode__count|tj-hero__strip|tj-pol__flag|tj-rail__chip is-conflict/ : /tj-pnode__count|tj-hero__strip|tj-hero__whybtn|tj-why|tj-pol__flag|tj-rail__chip is-conflict/)
    }
  })

  /* A later policy that also covers the person, flagged on its row in
     which policy (owner, 1 Oct: "make the conflict easy to find") — the
     policy the why names, in place of the reason it did not decide. */
  it('a policy that also covers them is flagged on its row in which policy, in place of its reason; where it is a conflict, in the notice tone', () => {
    const row = (o: string, policyId: string) => between(policiesOf(o), `data-node="policy:${policyId}"`, '</li>')
    for (const [id, policyId, first] of [
      ['ssi-maya-aws', 'sc-aws-finance', 'Maya'],
      ['ssi-tom-aws', 'sc-aws-devops', 'Tom'],
    ] as const) {
      const o = glance(saved(id))
      expect(policiesOf(o), id).toContain(`<li class="tj-pol has-flag is-conflict" data-node="policy:${policyId}"`)
      expect(text(row(o, policyId)), id).toMatch(new RegExp(`Also covers ${first} · not used$`))
      expect(row(o, policyId), id).not.toContain('tj-pol__reason')
      /* Only the policy that also covers them: the rest keep their reasons. */
      expect(policiesOf(o).match(/has-flag/g), id).toHaveLength(1)
    }
    /* By design (a group's policy before everyone's): the same words on its row. */
    for (const [id, first] of [
      ['ssi-devon-slack', 'Devon'],
      ['ssi-leo-slack', 'Leo'],
    ] as const) {
      expect(text(row(glance(saved(id)), 'sc-slack-everyone')), id).toMatch(new RegExp(`Slack for everyone Also covers ${first} · not used$`))
    }
    /* No policy covers them, or one switched off: no flag — the reasons say it. */
    for (const id of ['ssi-ravi-aws', 'ssi-kavya-office', 'ssi-maya-github']) expect(policiesOf(glance(saved(id))), id).not.toContain('tj-pol__flag')
  })

  it('the exception is said on the rule too: rule 1’s failing row, open, names the group that took Leo out', () => {
    const { plan } = planOf(saved('ssi-leo-slack'))
    expect(plan.rules[0].miss).toBe('Who · Leo Fernandes is in Contractors, an exception')
  })
})

/* As each group, pressed: the sign-in runs again as "Anyone in <group>" —
   the Person picker's own pick (§13.3), a member of just that group. */
describe('As each group runs again as the group', () => {
  it('a group’s row is a button that names the run it starts; the person’s own row, the answer on screen, is not', () => {
    const got: string[] = []
    const w = why(MAYA_GITHUB, (g) => got.push(g))
    expect(w).toMatch(/<button type="button" class="tj-why__grow" title="Run as anyone in Engineering">/)
    expect(w).toMatch(/<button type="button" class="tj-why__grow" title="Run as anyone in Finance">/)
    expect(w).toMatch(/<div class="tj-why__grow is-current" aria-current="true">/)
    /* Without a way to run again, the rows are only read. */
    expect(why(MAYA_GITHUB, null)).not.toMatch(/<button type="button" class="tj-why__grow"/)
  })

  it('each group’s row, run again as "Anyone in <group>", gives the answer the row said', () => {
    for (const id of ['ssi-maya-github', 'ssi-maya-aws', 'ssi-leo-slack', 'ssi-leo-aws']) {
      const f = saved(id)
      const rows = eachGroupRows(planOf(f).plan)!.filter((r) => r.groupId)
      for (const r of rows) {
        const pick = personPick(`${GROUP_PREFIX}${r.groupId}`, t.directory.people)
        expect(pick.asGroup).toBe(r.groupId)
        const again = resolveSignIn(t.policies, factsOf({ ...f, personId: pick.personId }, t.zones).facts, env)
        expect([id, r.label, again.decision]).toEqual([id, r.label, r.decision])
      }
    }
  })

  it('the page wires it: the why’s row → the journey → the Person picker’s pick', () => {
    expect(whySrc).toContain('onClick={() => onAsGroup(g.groupId!)}')
    expect(journeySrc).toContain('onAsGroup={onAsGroup}')
    expect(tryJourneySrc).toContain('onAsGroup={onAsGroup}')
    expect(pageSrc).toContain('onAsGroup={(g) => pickPerson(`${GROUP_PREFIX}${g}`, true)}')
  })
})

/* The why opens on the answer's strip, its quiet Why? or the count — in the
   page's right-hand panel (owner, 1 Oct 2026: "for the conflict we should
   open the right side panel instead of opening under the outcome"), drawn
   into the panel's body by a portal, nothing on the chain folding for it.
   A caller with no panel (no `why`) still has it under the answer, the
   answer and the policy folding to their lines; its × — or the press
   again — closes it and gives them back. Expand all opens the chain's
   stops, not the why: it is a question asked. */
describe('the why, opened and closed', () => {
  const journeyWith = (f: SignInForm, extra: { fold?: { mode: 'auto' | 'expand' | 'collapse'; seq: number }; why?: { open: boolean; slot: HTMLElement | null; onOpen: (open: boolean) => void } } = {}) => {
    const { plan, screens } = planOf(f)
    return renderToStaticMarkup(
      <BrandProvider>
        <EngineJourney
          form={f}
          plan={plan}
          s={plan.at.done}
          animate={false}
          reduced
          running={false}
          editing={false}
          toggled={{}}
          onToggle={noop}
          showAll={false}
          onShowAll={noop}
          jumped={false}
          orientation="vertical"
          start={<div data-node="sign-in">Sign-in</div>}
          editCard={null}
          outcome={<Answer view={plan.outcome.view} changed={null} reduced screens={screens} appId={f.appId} />}
          onOpenPolicy={noop}
          onOpenRule={noop}
          onAdd={noop}
          fold={extra.fold}
          why={extra.why}
        />
      </BrandProvider>,
    )
  }

  it('with the page’s panel, the strip, the quiet Why? and the count ask the page to open or shut it — and it is drawn into the panel, never under the answer', () => {
    const panel = journeySrc.slice(journeySrc.indexOf('const toggleWhy = useCallback'), journeySrc.indexOf('}, [glideTo, stopGlide])'))
    expect(panel).toMatch(/const panel = whyPanel\.current\s+if \(panel\) \{\s+panel\.onOpen\(!panel\.open\)\s+return\s+\}/)
    /* Open too where the attempts are all it has to say (1 Oct 2026). */
    expect(journeySrc).toContain('const whyOpen = (hasWhy || attempts !== null) && !running && (why ? why.open : nodes.why === true)')
    expect(journeySrc).toMatch(/\{why\s+\? whyOpen &&\s+whyHead &&\s+why\.slot &&\s+createPortal\(\s+<WhyCard/)
    expect(journeySrc).toContain('{!why && whyOpen && whyHead && (')
    /* Open in the panel: the strip says so, and nothing of the why is under the answer. */
    const open = journeyWith(MAYA_GITHUB, { why: { open: true, slot: null, onOpen: noop } })
    expect(open).toMatch(/<button type="button" class="tj-hero__strip is-conflict" aria-expanded="true" aria-controls="[^"]+">/)
    expect(deciderOf(open)).toMatch(/class="bb__state bb__tstate is-conflict tj-pnode__count" aria-expanded="true"/)
    expect(open).not.toMatch(/class="tj-why"|tj-whywrap/)
    /* Nothing on the chain folds for it: the policy that decided and the answer stay open. */
    expect(open).toContain('class="bb__card is-trace tj-pnode is-policy is-decided is-open is-foldable" data-node="decider"')
    expect(open).toMatch(/class="tj-hero is-positive is-open is-foldable has-see"/)
    /* Shut: the press says so. A quiet Why? does the same. */
    expect(journeyWith(MAYA_GITHUB, { why: { open: false, slot: null, onOpen: noop } })).toMatch(/<button type="button" class="tj-hero__strip is-conflict" aria-expanded="false">/)
    expect(journeyWith(saved('ssi-priya-github'), { why: { open: true, slot: null, onOpen: noop } })).toMatch(/<button type="button" class="tj-hero__whybtn" aria-expanded="true" aria-controls="[^"]+">Why\?<\/button>/)
  })

  it('with no panel, the press opens it under the answer: opening folds the answer and the policy that decided to their lines, closing gives them back; the focus goes to its title, and back', () => {
    expect(journeySrc).toContain('const nodes: Record<string, boolean> = { ...f.nodes, why: opening, outcome: !opening }')
    /* The policy folds to its line too, and is given back as the why closes. */
    expect(journeySrc).toContain('policyBeforeWhy.current = f.nodes.policy')
    expect(journeySrc).toContain('nodes.policy = false')
    expect(journeySrc).toContain('const hasWhy = whyHead !== null && (items.length > 0 || reason !== null)')
    expect(journeySrc).toContain('if (opening) whyTitle.current?.focus({ preventScroll: true })')
    /* Back to what opened it: the quiet Why?, or the strip where there is a finding. */
    expect(journeySrc).toContain("else stage.current?.querySelector<HTMLElement>('.tj-hero__whybtn, button.tj-hero__strip')?.focus({ preventScroll: true })")
    /* The answer's strip and quiet Why?, and the count, are the presses; the why's × closes it. */
    expect(journeySrc).toContain('const heroWhy = vertical && interactive && hasWhy ? toggleWhy : null')
    expect(journeySrc).toMatch(/onCount=\{interactive && hasWhy \? toggleWhy : undefined\}/)
    expect(journeySrc).toMatch(/onClose=\{toggleWhy\}/)
  })

  it('Expand all does not open it, and nothing of it is drawn until it is asked for', () => {
    for (const why of [undefined, { open: false, slot: null, onOpen: noop }]) {
      const o = journeyWith(MAYA_GITHUB, { fold: { mode: 'expand', seq: 1 }, why })
      expect(o).not.toContain('class="tj-why"')
      expect(o).toContain('class="tj-hero__strip is-conflict" aria-expanded="false"')
      /* Expand all draws every rule's card on the chain instead. */
      expect(o).toContain('<div class="tj-decider__all">')
    }
  })

  it('it opens like a drawer under the answer, motion owning its height; nothing of it, the strip or the count moves in CSS', () => {
    expect(journeySrc).toMatch(/<motion\.div\s+key="why"\s+className="tj-whywrap"\s+initial=\{motionOk \? \{ height: 0, opacity: 0 \} : false\}/)
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((b) => /tj-why|tj-hero__(strip|stext|sgo|smark|whybtn)|tj-pnode__count/.test(b.sel))
    expect(blocks.length).toBeGreaterThan(10)
    blocks.forEach((b) => expect(b.body, b.sel).not.toMatch(/(^|;)\s*(transform|transition|translate|scale|rotate|animation)\s*:/))
    /* Tokens only, and the 12 px floor. */
    blocks.forEach((b) => expect(b.body, b.sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i))
    blocks.forEach((b) => [...b.body.matchAll(/font-size:\s*([^;]+);/g)].forEach((m) => expect(['var(--fs-xs)', 'var(--fs-sm)'], b.sel).toContain(m[1].trim())))
  })

  it('house words', () => {
    const strings = [...whySrc.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(' ')
    expect(strings).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    for (const c of MATRIX) {
      const w = text(why(c.form ?? saved(c.id.split(' ')[0])))
      expect(w, c.id).not.toMatch(/\b(AI|assistant|log ?in|gauntlet|blast radius|rehearse)\b/i)
    }
  })
})

/* Break-in attempts on the application (owner, 1 Oct 2026: "can we implement
   it in the check part? as a suggestion inside conflicts or somewhere else"
   — then "go with your picks, start building"): the fifteen scripted
   sign-ins played on the run's application across the tenant
   (break-in-app.ts). Their own section, the why's last — never mixed into
   the findings — and, with no finding to say, the answer's strip when some
   get through or a quiet link where Why? sits. Never while the run plays;
   never in the builder's Check access. */
describe('break-in attempts, on the answer and in the why', () => {
  const TODAY = '2026-10-01'
  const checked = (personId: string, appId: string): SignInForm =>
    withDefaults({ ...emptyDraft(TODAY, '09:30'), personId, appId }, rowsRead(t.policies, null, appId, lib), [], TODAY, '09:30')
  const summaryOn = (appId: string): AppBreakInSummary => breakInSummary(runBreakInOnApp(t.policies, appId, env), env)
  const ARUN_AWS = checked('arun', 'aws')
  const PRIYA_GOOGLE = checked('priya', 'google-workspace')

  /* The settled chain, handed the page's attempts. */
  const withAttempts = (f: SignInForm, summary: AppBreakInSummary | null, o: { open?: boolean; running?: boolean } = {}) => {
    const { plan, screens } = planOf(f)
    return renderToStaticMarkup(
      <BrandProvider>
        <EngineJourney
          form={f}
          plan={plan}
          s={plan.at.done}
          animate={false}
          reduced
          running={o.running ?? false}
          editing={false}
          toggled={{}}
          onToggle={noop}
          showAll={false}
          onShowAll={noop}
          jumped={false}
          orientation="vertical"
          start={<div data-node="sign-in">Sign-in</div>}
          editCard={null}
          outcome={<Answer view={plan.outcome.view} changed={null} reduced screens={screens} appId={f.appId} />}
          onOpenPolicy={noop}
          onOpenRule={noop}
          onAdd={noop}
          why={{ open: false, slot: null, onOpen: noop }}
          breakIn={summary ? { summary, open: o.open ?? false } : null}
          onReviewBreakIn={noop}
        />
      </BrandProvider>,
    )
  }
  /* The why, handed the attempts as the journey hands them. */
  function WhyWith({ f, summary, interactive = true }: { f: SignInForm; summary: AppBreakInSummary; interactive?: boolean }) {
    const resolve = useNameLookup()
    const { plan } = planOf(f)
    return (
      <WhyCard
        plan={plan}
        items={whyItems(plan)}
        groups={eachGroupRows(plan)}
        headline={whyTitle(plan) ?? { text: attemptsOnSaid(summary.appName), tone: summary.holes > 0 ? 'conflict' : 'info' }}
        policies={t.policies}
        resolve={resolve}
        person={t.directory.people.find((u) => u.id === f.personId)!.name}
        id="why"
        interactive={interactive}
        onClose={noop}
        onOpenRule={noop}
        onOpenPolicy={noop}
        onAdd={noop}
        breakIn={{ summary, onReview: noop }}
      />
    )
  }
  const whyWith = (f: SignInForm, summary: AppBreakInSummary, interactive = true) =>
    renderToStaticMarkup(
      <BrandProvider>
        <WhyWith f={f} summary={summary} interactive={interactive} />
      </BrandProvider>,
    )
  const sectionOf = (w: string) => w.slice(w.indexOf('<section class="tj-why__sec tj-why__att"'))
  const cellsOf = (w: string) => [...w.matchAll(/<li class="tj-cell is-(\w+)"><span class="tj-cell__num">(\d+)<\/span><span class="tj-cell__word">([^<]+)<\/span><\/li>/g)].map((m) => [m[3], m[2], m[1]])

  it('the cases: Arun on AWS Console and Priya on Google Workspace have no finding to say; attempts get through on the one and not the other', () => {
    for (const f of [ARUN_AWS, PRIYA_GOOGLE]) {
      const { plan } = planOf(f)
      expect([heroFinding(plan), plan.decider !== null], f.appId!).toEqual([null, true])
    }
    expect(whyItems(planOf(PRIYA_GOOGLE).plan)).toEqual([])
    expect(summaryOn('aws').holes).toBe(4)
    expect(summaryOn('google-workspace').holes).toBe(0)
  })

  it('no finding, attempts getting through: the strip says so in the conflict’s tone, no number, and opens the attempts — never the why', () => {
    const o = withAttempts(ARUN_AWS, summaryOn('aws'))
    const hero = heroOf(o)
    expect(hero).toContain('<button type="button" class="tj-hero__strip is-conflict tj-hero__attempts" aria-expanded="false">')
    expect(text(between(hero, '<span class="tj-hero__stext">', '</span>'))).toBe(attemptsGetThroughSaid('AWS Console'))
    expect(text(between(hero, '<span class="tj-hero__sgo">', '</span>'))).toBe(REVIEW_ATTEMPTS)
    expect(hero).toMatch(/class="tj-hero__strip is-conflict tj-hero__attempts"[^>]*><svg[^>]*lucide-triangle-alert/)
    /* Numbers once: the panel says them. */
    expect(text(between(hero, 'tj-hero__attempts', '</button>'))).not.toMatch(/\d/)
    /* No why to open — the strip is the way in — and nothing counted on the policy. */
    expect(hero).not.toContain('tj-hero__whybtn')
    expect(o).not.toContain('tj-pnode__count')
    /* Open: the strip says so, and names the panel it controls. */
    expect(heroOf(withAttempts(ARUN_AWS, summaryOn('aws'), { open: true }))).toContain(`class="tj-hero__strip is-conflict tj-hero__attempts" aria-expanded="true" aria-controls="${ATTEMPTS_PANEL_ID}"`)
  })

  it('a finding comes first: the conflict’s strip, and no attempts on the answer — they are the why’s last section', () => {
    const maya = saved('ssi-maya-aws')
    const o = withAttempts(maya, summaryOn('aws'))
    const hero = heroOf(o)
    expect(hero).toContain('<button type="button" class="tj-hero__strip is-conflict" aria-expanded="false">')
    expect(text(between(hero, '<span class="tj-hero__stext">', '</span>'))).toBe('Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first')
    expect(hero).not.toContain('tj-hero__attempts')
    /* The policy's count is still the findings': one conflict. */
    expect(text(deciderOf(o))).toContain('Decides 1 conflict')
  })

  it('only the quiet to say, and attempts getting through: the attempts’ strip, and the quiet Why? stays for the why', () => {
    const priya = saved('ssi-priya-github')
    expect(heroFinding(planOf(priya).plan)).toBeNull()
    const hero = heroOf(withAttempts(priya, summaryOn('github')))
    expect(hero).toContain('class="tj-hero__strip is-conflict tj-hero__attempts"')
    expect(hero).toMatch(/<button type="button" class="tj-hero__whybtn" aria-expanded="false">Why\?<\/button>/)
  })

  it('nothing to say and nothing getting through: a quiet “Break-in attempts ›” where Why? sits, and no Why?', () => {
    const hero = heroOf(withAttempts(PRIYA_GOOGLE, summaryOn('google-workspace')))
    const by = between(hero, '<p class="tj-hero__by"', '</p>')
    expect(by).toMatch(/<button type="button" class="tj-hero__whybtn tj-hero__attempts" aria-expanded="false"[^>]*>Break-in attempts<svg[^>]*lucide-chevron-right/)
    expect(text(by)).toMatch(new RegExp(`^Decided by .+ ${ATTEMPTS_LINK}$`))
    expect(by).not.toContain('Why?')
    expect(hero).not.toContain('tj-hero__strip')
  })

  it('never while the run plays, and nothing at all without them — the builder’s Check access passes none', () => {
    for (const [f, app] of [
      [ARUN_AWS, 'aws'],
      [PRIYA_GOOGLE, 'google-workspace'],
    ] as const) {
      expect(withAttempts(f, summaryOn(app), { running: true }), app).not.toContain('tj-hero__attempts')
      expect(withAttempts(f, null), app).not.toContain('tj-hero__attempts')
    }
    expect(journeySrc).toContain('const attemptsApp = !running && attempts ? attempts.appName : null')
    expect(journeySrc).toContain('const attempts = vertical && breakIn && decider ? breakIn.summary : null')
    expect(policyCheckSrc).toContain('<TryJourney')
    expect(policyCheckSrc).not.toMatch(/breakIn=|onReviewBreakIn=/)
  })

  it('in the why: its own section after the findings — its label and ⓘ, the four counts once, a hole that is not 0 in the conflict’s tone, Review attempts', () => {
    const w = whyWith(saved('ssi-maya-aws'), summaryOn('aws'))
    expect(w.indexOf('<ul class="tj-why__list"')).toBeGreaterThan(-1)
    expect(w.indexOf('<ul class="tj-why__list"')).toBeLessThan(w.indexOf('tj-why__att'))
    /* The findings are as they were: the section is not one of them. */
    expect(findingsOf(w).map((x) => x.kind)).toEqual(['policy-conflict'])
    const sec = sectionOf(w)
    expect(sec).toMatch(/^<section class="tj-why__sec tj-why__att" aria-labelledby="([^"]+)"><p id="\1" class="tj-why__label tj-why__attlabel"><span>Break-in attempts on AWS Console<\/span>/)
    expect(sec).toContain('aria-label="About break-in attempts"')
    expect(cellsOf(sec)).toEqual([
      ['Got through', '3', 'hole'],
      ['Weaker factor', '0', 'quiet'],
      ['Locked out', '2', 'plain'],
      ['Extra prompts', '0', 'quiet'],
    ])
    expect(sec).toMatch(/<button type="button" class="tj-conflict__open tj-why__attgo">Review attempts<svg[^>]*lucide-chevron-right/)
    /* Read only, while the card is open over the run: no press. */
    expect(sectionOf(whyWith(saved('ssi-maya-aws'), summaryOn('aws'), false))).not.toContain('Review attempts')
  })

  it('a why with the attempts alone is titled by them: no empty findings list, and the section does not say its label again', () => {
    const w = whyWith(ARUN_AWS, summaryOn('aws'))
    expect(whyItems(planOf(ARUN_AWS).plan)).toEqual([])
    expect(titleOf(w)).toBe('Break-in attempts on AWS Console')
    expect(w).toContain('class="tj-why__mark is-conflict"')
    expect(w).not.toContain('tj-why__list')
    expect(w).not.toContain('tj-why__attlabel')
    expect(w.match(/Break-in attempts on AWS Console/g)).toHaveLength(1)
    /* The ⓘ moves to the section's foot, beside Review attempts. */
    expect(sectionOf(w)).toMatch(/<div class="tj-why__attfoot"><span class="bx-tip"><button type="button" class="bx-tipdot" aria-label="About break-in attempts">/)
    /* The journey's own title for it, and the why it may open. */
    expect(journeySrc).toContain("(whyTitleOf(plan) ?? (reason ? { text: DENY_REASON_WORD[reason], tone: 'info' as const } : null) ?? (attempts ? attemptsTitle(attempts) : null))")
    expect(journeySrc).toContain('breakIn={whyBreakIn}')
    expect(BREAK_IN_TIP).toBe('Scripted sign-ins against these rules; not breach likelihood.')
  })

  it('Review attempts asks the page, saying where it was pressed: the answer, or the why', () => {
    expect(journeySrc).toContain("const reviewFromOutcome = useCallback(() => reviewLatest.current?.('outcome'), [])")
    expect(journeySrc).toContain("const reviewFromWhy = useCallback(() => reviewLatest.current?.('why'), [])")
    expect(whySrc).toContain('onClick={breakIn.onReview}')
    expect(tryJourneySrc).toContain('breakIn={breakIn}')
    expect(tryJourneySrc).toContain('onReviewBreakIn={onReviewBreakIn}')
  })

  it('they come in as the run settles, once a run — motion props only, at once on a revisit, an unfold, Skip or under reduced motion — and the strip pulses once, as a conflict’s does', () => {
    expect(journeySrc).toContain('const attemptsArrive = motionOk && played > attemptsIn')
    expect(journeySrc).toContain('const onAttemptsIn = useCallback(() => setAttemptsIn(played), [played])')
    /* Read as it mounts and kept for its life: the arrival it began plays out, and an unfold after it is simply there. */
    expect(journeySrc).toContain('const [first] = useState(arrive)')
    expect(journeySrc).toMatch(/<ArrivesOnce arrive=\{attemptsArrive\} onIn=\{onAttemptsIn\}>\s+\{\(arrive\) => \(\s+<motion\.div\s+className="tj-hero__stripwrap"\s+initial=\{arrive \? \{ opacity: 0, y: 6 \} : false\}/)
    expect(journeySrc).toMatch(/\{arrive && \(\s+<motion\.span\s+className="tj-hero__spulse"/)
    expect(journeySrc.match(/<ArrivesOnce arrive=\{attemptsArrive\} onIn=\{onAttemptsIn\}>/g)).toHaveLength(2)
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((b) => /tj-cell|tj-why__att|tj-hero__attempts/.test(b.sel))
    expect(blocks.length).toBeGreaterThan(6)
    blocks.forEach((b) => expect(b.body, b.sel).not.toMatch(/(^|;)\s*(transform|transition|translate|scale|rotate|animation)\s*:/))
    blocks.forEach((b) => expect(b.body, b.sel).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i))
    blocks.forEach((b) => [...b.body.matchAll(/font-size:\s*([^;]+);/g)].forEach((m) => expect(['var(--fs-xs)', 'var(--fs-sm)', 'var(--fs-md)'], b.sel).toContain(m[1].trim())))
    expect(rules).toMatch(/\.tj-cell\.is-hole \{ border-color: var\(--fb-notice-border\); background: var\(--fb-notice-bg\); \}/)
  })

  it('house words: counts, never a grade', () => {
    for (const w of [text(withAttempts(ARUN_AWS, summaryOn('aws'))), text(withAttempts(PRIYA_GOOGLE, summaryOn('google-workspace'))), text(whyWith(saved('ssi-maya-aws'), summaryOn('aws')))]) {
      expect(w).not.toMatch(/\b(AI|assistant|log ?ins?|logs in|gauntlet|blast radius|rehearse|grade)\b/i)
    }
  })
})

describe('Why — How to get in (DENIAL-REASONS step 5)', () => {
  const form = MAYA_GITHUB
  const getIn = [{ key: 'from:office', label: 'From Office network', decision: '1fa' as AccessDecision, source: 'rule 2', form }]
  function WhyGetIn({ withPress }: { withPress: boolean }) {
    const resolve = useNameLookup()
    const { plan } = planOf(form)
    return (
      <WhyCard
        plan={plan}
        items={whyItems(plan)}
        groups={eachGroupRows(plan)}
        headline={whyTitle(plan) ?? { text: 'Why', tone: 'info' }}
        policies={t.policies}
        resolve={resolve}
        person={t.directory.people.find((u) => u.id === form.personId)!.name}
        id="why"
        interactive
        onClose={noop}
        onOpenRule={noop}
        onOpenPolicy={noop}
        onAdd={noop}
        getIn={getIn}
        onGetIn={withPress ? noop : undefined}
      />
    )
  }
  const html = (withPress: boolean) =>
    renderToStaticMarkup(
      <BrandProvider>
        <WhyGetIn withPress={withPress} />
      </BrandProvider>,
    )

  it('offers Let in for a while only where the page can grant it, and the Copy summary beside the close', () => {
    function WhyGrant({ grant }: { grant: boolean }) {
      const resolve = useNameLookup()
      const { plan } = planOf(form)
      return (
        <WhyCard
          plan={plan}
          items={whyItems(plan)}
          groups={eachGroupRows(plan)}
          headline={whyTitle(plan) ?? { text: 'Why', tone: 'info' }}
          policies={t.policies}
          resolve={resolve}
          person="Maya Iyer"
          id="why"
          interactive
          onClose={noop}
          onOpenRule={noop}
          onOpenPolicy={noop}
          onAdd={noop}
          grant={grant ? { today: '2026-09-28', onGrant: noop } : null}
        />
      )
    }
    const out = (grant: boolean) =>
      renderToStaticMarkup(
        <BrandProvider>
          <WhyGrant grant={grant} />
        </BrandProvider>,
      )
    expect(out(true)).toContain('Let in for a while')
    expect(out(false)).not.toContain('Let in for a while')
    expect(out(true)).toContain('aria-label="Copy summary"')
  })

  it('says what changed on the policy that refused, who changed it and when, and nothing when there is no change', () => {
    function WhyChanged({ on }: { on: boolean }) {
      const resolve = useNameLookup()
      const { plan } = planOf(form)
      return (
        <WhyCard
          plan={plan}
          items={whyItems(plan)}
          groups={eachGroupRows(plan)}
          headline={whyTitle(plan) ?? { text: 'Why', tone: 'info' }}
          policies={t.policies}
          resolve={resolve}
          person="Maya Iyer"
          id="why"
          interactive
          onClose={noop}
          onOpenRule={noop}
          onOpenPolicy={noop}
          onAdd={noop}
          changes={on ? [{ id: 'c1', policyId: 'p', policyName: 'AWS for engineering teams', at: new Date(Date.now() - 2 * 86_400_000).toISOString(), by: 'Jaspreet Toor', lines: ['Added “Contractors away from the office”'] }] : []}
        />
      )
    }
    const out = (on: boolean) =>
      renderToStaticMarkup(
        <BrandProvider>
          <WhyChanged on={on} />
        </BrandProvider>,
      )
    const html = out(true)
    expect(html).toContain('What changed')
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('AWS for engineering teams · 2 days ago · Jaspreet Toor')
    expect(html).toContain('Added “Contractors away from the office”')
    expect(out(false)).not.toContain('What changed')
  })

  it('lists the what-ifs that let them in, each a button, and nothing when the page cannot run one', () => {
    const out = html(true)
    expect(out).toContain('How to get in')
    expect(out).toMatch(/<button[^>]*class="tj-why__grow"[^>]*>.*From Office network/)
    expect(html(false)).not.toContain('How to get in')
  })
})
