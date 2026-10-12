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
import { eachGroupRows, expectMark, findingsCount, heroFinding, pathTone, whyItems, whyTitle, type GroupRowView, type WhyTone } from './journey'
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
function WhyOf({ f, asGroup, x = t, interactive = true, rows = (r) => r }: { f: SignInForm; asGroup?: (g: string) => void; x?: Tenant; interactive?: boolean; rows?: (r: GroupRowView[]) => GroupRowView[] }) {
  const resolve = useNameLookup()
  const { plan } = planOf(f, x)
  const person = x.directory.people.find((u) => u.id === f.personId)!.name
  return (
    <WhyCard
      plan={plan}
      items={whyItems(plan)}
      groups={(() => { const g = eachGroupRows(plan); return g && rows(g) })()}
      headline={whyTitle(plan)!}
      policies={x.policies}
      resolve={resolve}
      person={person}
      id="why"
      interactive={interactive}
      onClose={noop}
      onOpenRule={noop}
      onOpenPolicy={noop}
      onAdd={noop}
      onAsGroup={asGroup}
    />
  )
}
/* `null`: no way to run again, so the rows are only read. `interactive` false: read only, open over the run. */
const why = (f: SignInForm, asGroup: ((g: string) => void) | null = noop, x: Tenant = t, interactive = true, rows?: (r: GroupRowView[]) => GroupRowView[]) =>
  renderToStaticMarkup(
    <BrandProvider>
      <WhyOf f={f} asGroup={asGroup ?? undefined} x={x} interactive={interactive} rows={rows} />
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
/* 6 Oct 2026: every finding is ONE card (WhyCard.tsx, finding-card.ts) — `tj-why__item tj-find`, its tone, and
   `has-art` where its picture (FindingArt.tsx) sits: two policy cards, or rules in order. No finding draws its
   rule's whole card any more (the `tj-why__rule` shape is gone). */
const findingsOf = (w: string) => {
  const list = between(w, '<ul class="tj-why__list"')
  return [...list.matchAll(/<li class="tj-why__item tj-find is-(\w+)( has-art)?" data-kind="([^"]+)">([\s\S]*?)<\/li>(?=<li class="tj-why__|<\/ul>)/g)].map((m) => {
    const svg = /<svg class="tj-art"[\s\S]*?<\/svg>/.exec(m[4])?.[0] ?? null
    const art = svg === null ? null : svg.includes('tj-art__card') ? 'policies' : svg.includes('tj-art__row') ? 'rules' : 'unknown'
    return { tone: m[1], hasArt: m[2] !== undefined, art, kind: m[3], words: text(m[4]), html: m[4] }
  })
}
/* A card's line, and the model's longer why in its tooltip (null where it has none). */
const lineOf = (html: string) => {
  const m = /<p class="tj-find__line"(?: title="([^"]*)")?>([\s\S]*?)<\/p>/.exec(html)
  return m ? { line: text(m[2]), detail: m[1] === undefined ? null : text(m[1]) } : null
}
/* The Fix press (RunChain.tsx `FixButton`): the fix in its aria-label, where it opens in its title; its words are just "Fix". */
const fixOf = (html: string) => {
  const m = /<button type="button" class="tj-fix" title="([^"]*)" aria-label="([^"]*)">([\s\S]*?)<\/button>/.exec(html)
  return m ? { label: text(m[2]), title: text(m[1]), words: text(m[3]) } : null
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
  /** Each finding's card (6 Oct 2026): its picture, its words (heading, line, links), the model's longer why in the
      line's tooltip, and the Fix press's fix (its aria-label) — absent, the card has no Fix. */
  findings: { kind: string; art: 'policies' | 'rules' | null; says: string[]; detail?: string; fix?: string }[]
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
      'As Engineering Allow on 1 factor Rule 1 · In the office on a compliant device — what this sign-in gets',
      'As Finance Allow with 2FA Rule 3 · Finance, on a compliant device',
    ],
    findings: [
      /* 6 Oct 2026: the rule that also applies is no longer drawn whole — one card, by its number; the fix is the Fix press. */
      {
        kind: 'rule-conflict',
        art: 'rules',
        says: ['Two rules match Maya Iyer', 'Rule 3 would allow with 2FA, but rule 1 matched first.', 'Open rule'],
        detail: 'Rule 1 matched first via Engineering, and the first rule that matches decides',
        fix: 'Fix: Move rule 3 above rule 1',
      },
      { kind: 'off-no-change', art: null, says: ['Code review for Finance · Draft · via Finance', 'Draft — on, it would change nothing: Developer tools — office and device checks comes first', 'Open policy'] },
    ],
  },
  {
    id: 'ssi-maya-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first',
    path: 'positive',
    rows: ['As Engineering Allow on 1 factor AWS for engineering teams · rule 2 — what this sign-in gets', 'As Finance Allow with 2FA AWS billing for Finance · rule 1'],
    findings: [
      {
        kind: 'policy-conflict',
        art: 'policies',
        says: ['Two policies cover Maya Iyer', 'AWS billing for Finance would allow with 2FA, but AWS for engineering teams comes first.', 'Open rule'],
        detail: 'Not used: Maya Iyer is in Finance for this one and Engineering for AWS for engineering teams. One policy applies to a person on an application: the one higher in the list',
        fix: 'Fix: Add a rule for Maya Iyer above rule 2',
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
        art: 'policies',
        says: ['Two policies cover DevOps', 'AWS production for DevOps would allow with 2FA, but AWS for engineering teams comes first.', 'Open rule'],
        detail: 'Not used: Both cover DevOps on AWS Console. One policy applies per application and group: the one higher in the list',
        fix: 'Fix: Add a rule for DevOps above rule 2',
      },
    ],
  },
  /* 6 Oct 2026: 2FA is an allow, so its path is green (decision-words.ts DECISION_TONE['2fa'] = 'positive'); amber is
     left for what can't be told. */
  {
    id: 'ssi-devon-slack',
    count: '1 finding',
    tone: 'info',
    line: 'Slack for everyone does not apply — a policy for Contractors comes first',
    path: 'positive',
    findings: [
      {
        kind: 'group-policy-first',
        art: 'policies',
        says: ['Another policy covers Devon Rao', 'Slack for everyone would allow on 1 factor, but Slack for engineering and contractors comes first.'],
        detail: 'Not used: A policy for Contractors comes before a policy for everyone, wherever it is in the list',
      },
    ],
  },
  {
    id: 'ssi-leo-slack',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Contractors is an exception on rule 1, and Leo Fernandes is in Contractors',
    path: 'positive',
    rows: ['As Engineering Allow on 1 factor Rule 1 · Engineers, where we operate', 'As Contractors Allow with 2FA Rule 2 · Contractors on a corporate device — what this sign-in gets'],
    findings: [
      {
        kind: 'exception',
        art: 'rules',
        says: ['Rule 1 leaves Leo Fernandes out', 'Contractors is an exception, and an exception always wins.', 'Open rule'],
        detail: 'Rule 1 is for Engineering except Contractors. Leo Fernandes is in Engineering and in Contractors — an exception always wins.',
        fix: 'Fix: Add a rule for Leo Fernandes above rule 1',
      },
      {
        kind: 'group-policy-first',
        art: 'policies',
        says: ['Another policy covers Leo Fernandes', 'Slack for everyone would allow on 1 factor, but Slack for engineering and contractors comes first.'],
        detail: 'Not used: A policy for Engineering and Contractors comes before a policy for everyone, wherever it is in the list',
      },
    ],
  },
  {
    id: 'ssi-thomas-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: 'Thomas Byrne is named in rule 2 — rule 1 applies first',
    path: 'positive',
    findings: [
      {
        kind: 'named-later',
        art: 'rules',
        says: ['Thomas Byrne is named in a later rule', 'Rule 2 would deny, but rule 1 matched first.', 'Open rule'],
        /* The whole point of the case: a name does not move a rule up — the model's why, in the line's tooltip. */
        detail: 'Naming Thomas Byrne does not move a rule up. Rule 1 matched first, and the first rule that matches decides',
        fix: 'Fix: Move rule 2 above rule 1',
      },
    ],
  },
  {
    id: 'ssi-leo-aws',
    count: '1 conflict',
    tone: 'conflict',
    line: "Leo Fernandes is in Engineering and Contractors — Contractors' rule applies first",
    path: 'negative',
    rows: ['As Engineering Allow on 1 factor Rule 2 · Engineers on a compliant device', 'As Contractors Deny Rule 1 · Contractors away from the office — what this sign-in gets'],
    findings: [
      {
        kind: 'deny-first',
        art: 'rules',
        says: ['A refusal comes first for Leo Fernandes', 'Rule 2 would allow on 1 factor, but rule 1 matched first.', 'It would let in people rule 1 refuses today', 'Open rule'],
        detail: 'Rule 1 refuses Contractors first, and the first rule that matches decides',
        fix: 'Fix: Move rule 2 above rule 1',
      },
    ],
  },
  {
    id: 'ssi-kavya-office',
    count: '1 finding',
    tone: 'info',
    line: 'HRMS access from corporate offices is off — on, it would allow with 2FA',
    path: 'positive',
    /* 6 Oct 2026: no Fix press for a policy switched off (conflict-fix.ts), and in an interactive why its fix is not
       written out — Open policy is its press; read only, the fix is said (see "every finding is one card"). */
    findings: [{ kind: 'off-would-change', art: null, says: ['HRMS access from corporate offices · Switched off · via Human Resources', 'Switched off — on, it would decide Allow with 2FA (rule 1)', 'Open policy'] }],
  },
  {
    id: 'ssi-priya-github',
    count: null,
    tone: 'info',
    line: 'Code review for Finance is a draft — on, it would change nothing',
    quiet: true,
    path: 'positive',
    findings: [{ kind: 'off-no-change', art: null, says: ['Code review for Finance · Draft · via Finance', 'Draft — on, it would change nothing: Developer tools — office and device checks comes first'] }],
  },
  {
    id: 'ssi-maya-github (device not stated)',
    form: { ...MAYA_GITHUB, device: { kind: 'none' } },
    count: '1 finding',
    tone: 'depends',
    line: 'Depends on the device — state it to see which rule decides',
    path: 'notice',
    rows: [
      "As Engineering Can't tell Allow on 1 factor or Allow with 2FA or Deny — what this sign-in gets",
      "As Finance Can't tell Allow with 2FA or Deny",
    ],
    findings: [
      { kind: 'depends', art: null, says: ['Depends on the device: Allow on 1 factor, Allow with 2FA or Deny', 'Rule 1 Allow on 1 factor', 'Rule 2 Allow with 2FA', 'Deny', 'Add device'] },
      { kind: 'off-no-change', art: null, says: ['Code review for Finance · Draft · via Finance'] },
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
        art: null,
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
    findings: [{ kind: 'not-covered', art: null, says: ['No policy on Workday', 'No application policy names Workday, so the Global Default decides every sign-in to it, by its own rules'] }],
  },
  {
    id: 'ssi-maya-london',
    count: null,
    tone: 'info',
    line: 'Rule 3 also applies via Finance — the same decision, asking Google Authenticator instead of miniOrange Push',
    quiet: true,
    path: 'positive',
    rows: ['As Engineering Allow with 2FA Rule 2 · Compliant device, working remotely — what this sign-in gets', 'As Finance Allow with 2FA Rule 3 · Finance, on a compliant device'],
    findings: [
      { kind: 'also-matches', art: null, says: ['Another rule also matches', 'Not used — rule 2 matched first; it would give the same decision, asking Google Authenticator instead of miniOrange Push.', 'Open rule'] },
      { kind: 'off-no-change', art: null, says: ['Code review for Finance · Draft · via Finance'] },
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

      it(c.rows ? 'As each group: a row a group — each answer, where from — the one they get marked, and no row of their own to repeat it' : 'one group: no As each group', () => {
        if (!c.rows) {
          expect(w).not.toContain('As each group')
          return
        }
        expect(rowsOf(w)).toEqual(c.rows)
      })

      /* 6 Oct 2026: each finding is one card — its heading, one line (the model's longer why in its tooltip), then at
         most one Fix press (its fix in its label, its word just "Fix") and one quiet link that only looks. */
      it('every finding, in the model’s order and words, one card each with its tone and picture, at most one Fix and one link', () => {
        const got = findingsOf(w)
        expect(got.map((g) => [g.kind, g.art])).toEqual(c.findings.map((x) => [x.kind, x.art]))
        expect(got.map((g) => g.kind)).toEqual(plan.conflicts!.findings.map((x) => x.kind))
        expect(got.map((g) => g.tone)).toEqual(whyItems(plan).map((x) => x.tone))
        c.findings.forEach((x, i) => {
          expect(got[i].hasArt, x.kind).toBe(x.art !== null)
          for (const say of x.says) expect(got[i].words, `${x.kind}: ${say}`).toContain(say)
          if (x.detail) expect(lineOf(got[i].html)?.detail, x.kind).toBe(x.detail)
          const fix = fixOf(got[i].html)
          expect(fix?.label ?? null, x.kind).toBe(x.fix ?? null)
          if (fix) expect(fix.words, x.kind).toBe('Fix')
          expect([...got[i].html.matchAll(/class="tj-fix"/g)].length, x.kind).toBeLessThanOrEqual(1)
          expect([...got[i].html.matchAll(/class="tj-conflict__open tj-why__act"/g)].length, x.kind).toBeLessThanOrEqual(1)
          expect([...got[i].html.matchAll(/tj-(?:conflict|why)__(?:open|act)/g)].length, x.kind).toBeLessThanOrEqual(2)
        })
      })
    })
  }

  /* 6 Oct 2026 (owner: "a heading, then a one- or two-liner at most, then a solution button — they don't want to read,
     so only click"): a rule that also applies is no longer its whole trace card in the why (ConflictRuleCard) — it
     is the same card as every other finding: a heading, one line, the model's why in its tooltip, then the Fix press
     and Open rule. Read only (open over the run), the fix is said in words instead. */
  it('every finding is one card, a rule that also applies too: a heading, one line, then Fix and Open rule — nothing of the rule drawn whole', () => {
    const w = why(MAYA_GITHUB)
    const [card] = findingsOf(w)
    expect([card.kind, card.tone, card.hasArt, card.art]).toEqual(['rule-conflict', 'conflict', true, 'rules'])
    expect(w).toContain('<li class="tj-why__item tj-find is-conflict has-art" data-kind="rule-conflict">')
    expect(w).not.toContain('tj-why__rule')
    expect(card.html).not.toMatch(/bb__card|bb__tbody|bb__titlebtn|class="tj-conflict"/)
    expect(card.html).toMatch(/^<span class="tj-why__icon" aria-hidden="true"><svg[^>]*lucide-list-ordered[\s\S]*?<\/span><svg class="tj-art"[^>]*aria-hidden="true"/)
    expect(card.html).toContain(
      '<div class="tj-why__text"><p class="tj-find__title">Two rules match Maya Iyer</p><p class="tj-find__line" title="Rule 1 matched first via Engineering, and the first rule that matches decides">Rule 3 would allow with 2FA, but rule 1 matched first.</p><div class="tj-find__acts"><button type="button" class="tj-fix"',
    )
    /* The Fix opens the policy that decided with the rule moved in its draft; Open rule only looks — the card's one link. */
    expect(fixOf(card.html)).toEqual({ label: 'Fix: Move rule 3 above rule 1', title: 'Opens Developer tools — office and device checks with this change in its draft', words: 'Fix' })
    expect([...card.html.matchAll(/class="tj-conflict__open tj-why__act"/g)]).toHaveLength(1)
    expect(text(between(card.html, '<div class="tj-find__acts">'))).toBe('Fix Open rule')
    /* Read only: no press — the fix in words, where the Fix would be. */
    const [still] = findingsOf(why(MAYA_GITHUB, noop, t, false))
    expect(still.html).not.toMatch(/tj-fix|tj-why__act/)
    expect(still.html).toContain('<div class="tj-find__acts"><p class="tj-why__fix">Move it above rule 1 to ask Finance for 2FA</p></div>')
    /* A policy switched off has no Fix, so its fix is written where the Fix would be — interactive or not (7 Oct 2026,
       the owner's "a solution, or a direct button with the solution written"); interactive, Open policy beside it. */
    const kavya = saved('ssi-kavya-office')
    const [off] = findingsOf(why(kavya))
    expect(off.html).toContain('<div class="tj-find__acts"><p class="tj-why__fix">Turn it on to ask Kavya Menon for 2FA</p><button type="button" class="tj-conflict__open tj-why__act">Open policy')
    expect(off.html).not.toContain('tj-fix')
    expect(findingsOf(why(kavya, noop, t, false))[0].html).toContain('<p class="tj-why__fix">Turn it on to ask Kavya Menon for 2FA</p>')
    /* A trace card with a press keeps its title a button (the chain's). */
    expect(ruleCardSrc).toContain('{onFold || onOpen ? (')
  })

  /* 6 Oct 2026: the policy that lost is no longer a link in its card (no `tj-why__name`): it is named in the card's
     line, what it would do and the policy that comes first; the Fix opens the policy that won with the rule added in
     its draft, and Open rule opens the rule it goes above. */
  it('a policy that lost is fixed in the one that won: its Fix adds a rule there, its link opens the rule the fix adds one above; its name is said in the line', () => {
    const cases: [string, string, string, string][] = [
      ['ssi-maya-aws', 'sc-aws-finance', 'AWS billing for Finance', 'Maya Iyer'],
      ['ssi-tom-aws', 'sc-aws-devops', 'AWS production for DevOps', 'DevOps'],
    ]
    const eng = t.policies.find((p) => p.id === 'sc-aws-engineering')!
    for (const [id, loser, name, forWho] of cases) {
      const item = whyItems(planOf(saved(id)).plan)[0]
      expect(item.action, id).toMatchObject({ kind: 'rule', label: 'Open rule', policyId: 'sc-aws-engineering', ruleId: eng.rules[1].id })
      expect(item.link, id).toEqual({ policyId: loser, label: name })
      const w = why(saved(id))
      expect(w, id).not.toContain('tj-why__name')
      const [card] = findingsOf(w)
      expect(lineOf(card.html)?.line, id).toBe(`${name} would allow with 2FA, but ${eng.name} comes first.`)
      expect(fixOf(card.html), id).toEqual({ label: `Fix: Add a rule for ${forWho} above rule 2`, title: `Opens ${eng.name} with this change in its draft`, words: 'Fix' })
    }
    /* And the policy it names is a board that has her in it — through Finance, her second group — not "Not in this policy". */
    const fin = t.policies.find((p) => p.id === 'sc-aws-finance')!
    const { facts } = factsOf(saved('ssi-maya-aws'), t.zones)
    const route = routeOf(runColumns(columnsFor(fin, fin, 'aws'), t.policies, facts, env).at(-1)!, fin, facts, env, t.policies)
    expect(route.who).toMatchObject({ word: 'In audience', state: 'pass' })
    /* A policy that comes first by design has no fix and no action: its card names it, and takes no press. */
    const devon = whyItems(planOf(saved('ssi-devon-slack')).plan)[0]
    expect([devon.action, devon.link]).toEqual([null, { policyId: 'sc-slack-everyone', label: 'Slack for everyone' }])
    const [card] = findingsOf(why(saved('ssi-devon-slack')))
    expect(card.html).not.toMatch(/<button|tj-find__acts/)
    expect(lineOf(card.html)?.line).toMatch(/^Slack for everyone would allow on 1 factor, but /)
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
     applies is its ⚠ on the rail. Since 6 Oct 2026 the why no longer draws
     it whole either: it is one card there, by its number. */
  it('a rule that also applies is its ⚠ mark on the chain’s rail, not a second card: the chain draws the rule that decided, the why says the other by its number', () => {
    const o = glance(MAYA_GITHUB)
    const { plan } = planOf(MAYA_GITHUB)
    const [r1, , r3] = plan.rules
    expect([...o.matchAll(/<div class="tj-rcard" data-node="([^"]+)"/g)].map((m) => m[1])).toEqual([r1.node])
    expect(deciderOf(o)).toMatch(/<button type="button" class="tj-rail__chip is-conflict" aria-pressed="false" aria-label="Rule 3: Finance, on a compliant device — Also applies"/)
    expect(o).not.toContain('class="tj-conflict"')
    const [card] = findingsOf(why(MAYA_GITHUB))
    expect(card.html).not.toContain('Finance, on a compliant device')
    expect(card.html).not.toContain('class="tj-conflict"')
    expect(lineOf(card.html)?.line).toBe(`Rule ${r3.index! + 1} would allow with 2FA, but rule ${r1.index! + 1} matched first.`)
    expect(r3.name).toBe('Finance, on a compliant device')
    /* Opened under the answer, the policy that decided folds to its line, so nothing of the rule is drawn twice there either. */
    expect(journeySrc).toContain('nodes.policy = false')
  })

  it('opened, the view keeps the policy that decided in it: the why is placed from the policy’s line, not the answer’s', () => {
    expect(journeySrc).toContain('const from = which && which.offsetHeight <= POLICY_LINE_MAX ? which : hero')
    expect(journeySrc).toContain('const POLICY_LINE_MAX = 120')
  })

  it('a person in three groups: the title gives the one reason; the groups that get her answer are marked, her own row left out', () => {
    const three: Tenant = { ...t, directory: { ...t.directory, people: t.directory.people.map((u) => (u.id === 'u-maya' ? { ...u, alsoGroupIds: ['finance', 'devops'] } : u)) } }
    const w = why(MAYA_GITHUB, noop, three)
    expect(titleOf(w)).toBe('Maya Iyer is in Engineering, Finance and DevOps — the rule for Engineering and DevOps applies first')
    expect(rowsOf(w).at(-1)).toBe('As DevOps Allow on 1 factor Rule 1 · In the office on a compliant device — what this sign-in gets')
    expect(rowsOf(w).map((r) => r.split(' Allow')[0].split(' Can')[0])).toEqual(['As Engineering', 'As Finance', 'As DevOps'])
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

  /* 6 Oct 2026: the finding is a card (`tj-why__item tj-find`) with a heading (`tj-find__title`) in the primary text;
     the yellow is its border and its mark — the old head line (`tj-why__head`) is not drawn. */
  it('a conflict and what can’t be told are yellow — the card’s border and mark; the rest is quiet', () => {
    const tones = (w: string) => [...w.matchAll(/class="tj-why__item tj-find is-(\w+)(?: has-art)?" data-kind="([^"]+)"/g)].map((m) => [m[2], m[1]])
    expect(tones(why(saved('ssi-leo-slack')))).toEqual([
      ['exception', 'conflict'],
      ['group-policy-first', 'info'],
    ])
    expect(tones(why({ ...MAYA_GITHUB, device: { kind: 'none' } }))[0]).toEqual(['depends', 'depends'])
    expect(whySrc).not.toContain('tj-why__head')
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toMatch(/\.tj-why__item\.is-conflict,\s*\.tj-why__item\.is-depends \{ border-color: var\(--fb-notice-border\); \}/)
    expect(rules).toMatch(/\.tj-why__item\.is-conflict \.tj-why__icon,\s*\.tj-why__item\.is-depends \.tj-why__icon \{ color: var\(--fb-notice-dot\); \}/)
    expect(rules).toMatch(/\.tj-why__icon \{[^}]*color: var\(--text-tertiary\);/)
    expect(rules).toMatch(/\.tj-find__title \{[^}]*color: var\(--text-primary\);/)
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
  it('a group’s row is a button that names the run it starts — the one she gets marked; her own row only when no group gets her answer, and not a press', () => {
    const got: string[] = []
    const w = why(MAYA_GITHUB, (g) => got.push(g))
    expect(w).toMatch(/<button type="button" class="tj-why__grow is-current" title="Run as anyone in Engineering">/)
    expect(w).toMatch(/<button type="button" class="tj-why__grow" title="Run as anyone in Finance">/)
    expect(w).not.toContain('aria-current')
    /* The groups together decide otherwise (no group alone gets her answer): her row says it, the answer on screen. */
    const own = why(MAYA_GITHUB, noop, t, true, (rows) => rows.map((r) => ({ ...r, follows: false })))
    expect(own).toMatch(/<div class="tj-why__grow is-current" aria-current="true">/)
    expect(rowsOf(own).at(-1)).toBe("As Maya (both) Allow on 1 factor Engineering's rule comes first — this sign-in")
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
  /* 6 Oct 2026: the attempts are one card in the findings' own shape (WhyCard.tsx), no longer a section of counts. */
  const sectionOf = (w: string) => w.slice(w.indexOf('<section class="tj-why__item tj-find tj-why__att'))
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

  /* 6 Oct 2026 (owner: "remove this part, make the card bigger, and just add a break-in part"): the four counts and
     the suggested attempts left the why — one card after the findings, its title and ⓘ, one line of how many got
     through or in on less (said once), and Review attempts. */
  it('in the why: one card after the findings — its title and ⓘ, one line of how many got through or in on less, in the conflict’s tone, Review attempts', () => {
    const w = whyWith(saved('ssi-maya-aws'), summaryOn('aws'))
    expect(w.indexOf('<ul class="tj-why__list"')).toBeGreaterThan(-1)
    expect(w.indexOf('<ul class="tj-why__list"')).toBeLessThan(w.indexOf('tj-why__att'))
    /* The findings are as they were: the attempts' card is not one of them. */
    expect(findingsOf(w).map((x) => x.kind)).toEqual(['policy-conflict'])
    const sec = sectionOf(w)
    expect(sec).toMatch(
      /^<section class="tj-why__item tj-find tj-why__att is-conflict" aria-labelledby="([^"]+)"><span class="tj-why__icon" aria-hidden="true"><svg[^>]*lucide-shield-alert[\s\S]*?<\/span><div class="tj-why__text"><p id="\1" class="tj-find__title tj-why__attlabel"><span>Break-in attempts on AWS Console<\/span><span class="bx-tip"><button type="button" class="bx-tipdot" aria-label="About break-in attempts">/,
    )
    /* How many got through or in on less, once: no counts of each, no attempts listed. */
    const { counts } = summaryOn('aws')
    expect(counts.gotThrough + counts.weakerFactor + counts.lessThanAsked).toBe(4)
    expect(sec).toContain('<p class="tj-find__line">4 got through or in on less</p>')
    expect(cellsOf(sec)).toEqual([])
    expect(sec).not.toMatch(/tj-cells?\b|tj-why__attword/)
    expect(sec).toMatch(/<div class="tj-find__acts"><button type="button" class="tj-conflict__open tj-why__act">Review attempts<svg[^>]*lucide-chevron-right/)
    /* Read only, while the card is open over the run: no press. */
    expect(sectionOf(whyWith(saved('ssi-maya-aws'), summaryOn('aws'), false))).not.toContain('Review attempts')
    /* None getting through: the quiet card, and it says so. */
    const none = sectionOf(whyWith(PRIYA_GOOGLE, summaryOn('google-workspace')))
    expect(none).toMatch(/^<section class="tj-why__item tj-find tj-why__att is-info"/)
    expect(none).toContain('<p class="tj-find__line">None got through</p>')
  })

  /* 6 Oct 2026: the attempts' card always carries its own title, so with the attempts alone the why's title and the
     card's say it both; the ⓘ stays beside the card's title (no foot). */
  it('a why with the attempts alone is titled by them: no empty findings list, and the card under it keeps its title and ⓘ', () => {
    const w = whyWith(ARUN_AWS, summaryOn('aws'))
    expect(whyItems(planOf(ARUN_AWS).plan)).toEqual([])
    expect(titleOf(w)).toBe('Break-in attempts on AWS Console')
    expect(w).toContain('class="tj-why__mark is-conflict"')
    expect(w).not.toContain('tj-why__list')
    expect(w.match(/Break-in attempts on AWS Console/g)).toHaveLength(2)
    expect(w.match(/aria-label="About break-in attempts"/g)).toHaveLength(1)
    expect(sectionOf(w)).toMatch(/<p id="[^"]+" class="tj-find__title tj-why__attlabel"><span>Break-in attempts on AWS Console<\/span><span class="bx-tip"><button type="button" class="bx-tipdot" aria-label="About break-in attempts">/)
    expect(w).not.toContain('tj-why__attfoot')
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
