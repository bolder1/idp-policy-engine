import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { GROUP_PREFIX, emptyDraft, forRun, personPick, withDefaults } from '../sign-in-card'
import { answer } from './assistant/intents'
import { wordsOfPlan } from './assistant/what-if'
import Focus2Layout from './Focus2Layout'
import { Focus2Ask } from './focus2-ask'
import { FAQ_EACH, FOCUS2_ASK_W, FOCUS2_PATH_MIN, FOCUS2_ROOM_SEED, eachAnswer, faqOf, presentAnswer } from './focus2-faq'
import type { RunIdentity, RunLayoutProps } from './types'
import layoutRaw from './Focus2Layout.tsx?raw'

/* The view's source with its line ends made plain (the checkout may hand it CRLF). */
const layoutSrc = layoutRaw.replace(/\r\n/g, '\n')

/* -----------------------------------------------------------------------------
   THE ANSWERS PANEL'S FIRST PAINT (focus2-ask.tsx, inside Focus v2).

   Why the first paint is the thing worth a test: layouts-render.test.tsx —
   not ours to edit — renders every layout with `renderToStaticMarkup` for
   80-odd sign-ins, so NO EFFECT OF OURS EVER RUNS THERE. Anything the panel
   only gets right in an effect (the room it reads off the canvas, which
   questions it offers) is a defect that shows up as somebody else's failing
   suite. So the list is a memo and never an effect, the panel's open state is
   seeded from a width the view has before it has measured anything, and this
   file asserts what the markup holds with nothing having run.

   What it cannot see is the motion and the presses: the blur-in, a citation
   lighting its card, Escape unwinding. Those are checked in the browser, as
   the house rule says.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function propsOf(personName: string | null, appName: string | null, opts: { at?: 'first' | 'mid' | 'settled'; patch?: Partial<SignInForm>; origin?: 'home' | 'tor' } = {}): RunLayoutProps {
  const person = personName === null ? null : (t.directory.people.find((p) => p.name === personName) ?? null)
  const app = appName === null ? null : (t.apps.find((a) => a.name === appName) ?? null)
  if ((personName !== null && !person) || (appName !== null && !app)) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app?.id ?? null, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person?.id ?? null, appId: app?.id ?? null }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  const at = opts.at ?? 'settled'
  const s = at === 'settled' ? plan.steps.length - 1 : at === 'first' ? 0 : Math.max(0, Math.floor(plan.steps.length / 2))
  return {
    plan,
    s,
    running: at !== 'settled',
    animate: false,
    reduced: true,
    jumped: at === 'settled',
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

/* The panel is shut on every run until the bar's Questions opens it (owner, 5 Oct 2026), so these tests of what it
   holds paint it open; `shut` is the view as a run lands. */
const wrap = (p: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Focus2Layout {...p} initialAsk />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const shut = (p: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Focus2Layout {...p} />
      </TestingSessionProvider>
    </BrandProvider>,
  )
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const ALLOW = propsOf('Maya Iyer', 'AWS Console')
const DENY = propsOf('Leo Fernandes', 'AWS Console', { origin: 'home' })
const DEPENDS = propsOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const DEFAULTED = propsOf('Kavya Menon', 'HRMS')
const EMPTY = propsOf(null, null)
const RUNS = [
  { name: 'Maya on AWS (Allow)', props: ALLOW },
  { name: 'Leo from home on AWS (Deny)', props: DENY },
  { name: 'Arun with no device (Depends)', props: DEPENDS },
  { name: 'Kavya on HRMS (the Global Default covers)', props: DEFAULTED },
]

describe('the panel on the first paint', () => {
  it('is there, on the left, with its questions, before any effect has run', () => {
    for (const { name, props } of RUNS) {
      const out = wrap(props)
      expect(out, name).toContain('class="rl-f2a"')
      expect(out, name).toContain('aria-label="Questions"')
      /* At least one group heading and one question row, drawn from the plan. */
      expect(out.split('rl-f2a__gtitle').length - 1, name).toBeGreaterThan(0)
      expect(out.split('rl-f2a__q"').length - 1, name).toBeGreaterThan(0)
      const said = text(out)
      for (const g of faqOf(props.plan, { asGroup: null, screens: props.screens, form: props.form, rows: props.rows })) {
        expect(said, `${name} · ${g.title}`).toContain(g.title)
        /* At rest a group shows its heading and its first two rows. */
        for (const r of g.rows.slice(0, 2)) expect(said, `${name} · ${r.label}`).toContain(r.label)
      }
    }
  })

  it('is SHUT as a run lands, and only the bar opens it — it never opens itself (owner, 5 Oct 2026)', () => {
    for (const p of [ALLOW, propsOf('Maya Iyer', 'AWS Console', { at: 'first' })]) {
      const out = shut(p)
      expect(out).not.toContain('class="rl-f2a"')
      expect(out).not.toContain('rl-f2a-rail')
      expect(out).toMatch(/data-fn="questions"[^>]*aria-pressed="false"/)
    }
    /* The panel still fits beside the path when the admin opens it. */
    expect(FOCUS2_ROOM_SEED - FOCUS2_ASK_W).toBeGreaterThanOrEqual(FOCUS2_PATH_MIN)
    expect(wrap(ALLOW)).toContain('class="rl-f2a"')
  })

  it('carries a "Show all" only for a group with more than two questions, and no count anywhere', () => {
    const out = wrap(DEPENDS)
    const groups = faqOf(DEPENDS.plan, { asGroup: null, screens: DEPENDS.screens, form: DEPENDS.form, rows: DEPENDS.rows })
    const many = groups.filter((g) => g.rows.length > 2).length
    expect(out.split('rl-f2a__all').length - 1).toBe(many)
    /* No row or heading says how many: numbers appear once per view, in the footer. */
    for (const g of groups) for (const r of g.rows) expect(r.label).not.toMatch(/\b\d+ (questions?|rules?|policies|checks)\b/)
  })

  it('says the one number once: plan.summary in the footer, and nowhere else in the view', () => {
    for (const { name, props } of RUNS) {
      const out = wrap(props)
      expect(out, name).toContain('rl-f2a__foot')
      expect(text(out), name).toContain(props.plan.summary)
      /* Once in the whole view. */
      expect(out.split(props.plan.summary).length - 1, name).toBe(1)
    }
  })

  it('offers nothing while the run is still being told, and no row is pressable', () => {
    const playing = propsOf('Maya Iyer', 'AWS Console', { at: 'mid' })
    const out = wrap(playing)
    expect(out).toContain('class="rl-f2a"')
    expect(text(out)).toContain('Questions come once the run lands.')
    expect(out).not.toContain('rl-f2a__gtitle')
    expect(out).not.toContain('rl-f2a__q"')
    /* And no number while it plays: the summary belongs to a run that is over. */
    expect(out).not.toContain('rl-f2a__foot')
  })

  it('says what to do before a run, in the words the assistant itself uses, and offers no question', () => {
    const out = wrap(EMPTY)
    expect(out).toContain('class="rl-f2a"')
    expect(text(out)).toContain('Pick a person and an application, then Run')
    expect(out).not.toContain('rl-f2a__gtitle')
    expect(out).not.toContain('rl-f2a__foot')
  })

  it('has no head until a question is pressed: the outcome card is the verdict, not the panel', () => {
    for (const { name, props } of RUNS) {
      expect(wrap(props), name).not.toContain('rl-f2a__ans')
      expect(wrap(props), name).not.toContain('rl-f2a__acts')
    }
  })
})

describe('what went, and what took its place', () => {
  it('draws no free text field, and no dock, anywhere in the view', () => {
    for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
      const out = wrap(props)
      expect(out, name).not.toMatch(/<input/)
      expect(out, name).not.toContain('Ask about this sign-in')
      expect(out, name).not.toContain('class="ad ')
      expect(out, name).not.toContain('rl-f2__dock')
      expect(out, name).not.toContain('data-ad-fold')
    }
  })

  /* The voice went from Focus (owner, 5 Oct 2026: "remove the audio part completely, no use"): the canvas's bar is there
     in every state with the two views, Brief and Questions, and nothing of the voice — not on the bar, not on an answer
     — and nothing in the view asks the narrator to speak while FOCUS_VOICE is off. */
  it('never speaks: no Voice, no Stop, no line being said, and every call to speak behind FOCUS_VOICE', () => {
    for (const { name, props } of [...RUNS, { name: 'nothing chosen', props: EMPTY }]) {
      const out = wrap(props)
      expect(out, name).toContain('class="f2cb"')
      for (const gone of ['aria-label="Voice"', 'Stop the voice', 'f2cb__said', 'f2cb__voice', 'rl-f2a-voice', 'rl-focus__wave']) expect(out, `${name} ${gone}`).not.toContain(gone)
    }
    expect(layoutSrc).toMatch(/\nconst FOCUS_VOICE = false\n/)
    /* The story's lines are never queued, and an answer is said only with the voice on. */
    expect(layoutSrc).toContain('quiet: settled || !FOCUS_VOICE')
    const says = layoutSrc.match(/[^\n]*narrator\.say\([^\n]*/g) ?? []
    expect(says.length).toBe(1)
    for (const line of says) expect(line).toContain('FOCUS_VOICE && ')
    /* The bar draws the voice only when handed it, and the view hands it only with the flag on. */
    expect(layoutSrc).toContain('voice={FOCUS_VOICE ? {')
    expect(layoutSrc).toContain('const sayingAnswer = FOCUS_VOICE && ')
  })

  it('never draws an orange button, and never reaches for the brand or the accent token', () => {
    const out = wrap(ALLOW)
    expect(out).not.toMatch(/--brand|--accent/)
  })
})

/* The panel drawn on its own, with a row pressed: the list and the card are what the 5 Oct rulings changed. */
describe('the list and the answer card', () => {
  const groups = faqOf(ALLOW.plan, { asGroup: null, screens: ALLOW.screens, form: ALLOW.form, rows: ALLOW.rows })
  const rows = groups.flatMap((g) => g.rows)
  const pressed = rows[0]
  const other = rows[1]
  const draw = (on: string | null, asked: string[]) => {
    const ans = on === null ? null : presentAnswer(answer(rows.find((r) => r.id === on)!.ask, ALLOW.plan, ALLOW, rows.find((r) => r.id === on)!.label), ALLOW.plan, ALLOW)
    return renderToStaticMarkup(
      <Focus2Ask state="landed" groups={groups} answer={ans} emptyLine={null} animate={false} lit={null} speaking={false} summary={null} asked={new Set(asked)} on={on} seq={1} onAsk={noop} onCite={noop} onPin={noop} onAction={noop} onStop={noop} onClose={noop} onClear={noop} />,
    )
  }

  it('titles a pressed answer with the question that was asked', () => {
    const out = draw(pressed.id, [pressed.id])
    expect(out).toContain('rl-f2a__ansq')
    expect(out).toContain(`<h3 class="rl-f2a__ansq">${pressed.label.replace(/'/g, '&#x27;')}</h3>`)
    expect(out).toContain('aria-label="Close the answer"')
    expect(draw(null, [])).not.toContain('rl-f2a__ansq')
  })

  it('labels the groups with nouns, never a question', () => {
    const out = draw(null, [])
    const titles = [...out.matchAll(/<h3 class="rl-f2a__gtitle">([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(titles.length).toBeGreaterThan(0)
    for (const t of titles) expect(t.endsWith('?'), t).toBe(false)
    const all = groups.map((g) => g.title)
    for (const t of ['Why this policy', 'Why this rule', 'What would change it', 'Who else is affected', 'What they will see', 'What happened', 'The application']) expect(all).not.toContain(t)
  })

  it('marks a row asked earlier with a tick and is-asked, and the pressed one with neither', () => {
    const out = draw(pressed.id, [pressed.id, other.id])
    /* Rows beyond the first two of a group are folded at rest, so find by label instead of by index. */
    const btn = (label: string) => out.split('<button').find((b) => b.includes('rl-f2a__q') && b.includes(`>${label.replace(/'/g, '&#x27;')}</span>`))
    const asked = btn(other.label)
    expect(asked).toBeDefined()
    expect(asked).toContain('is-asked')
    expect(asked).toContain('rl-f2a__tick')
    const on = btn(pressed.label)
    expect(on).toContain('is-on')
    expect(on).not.toContain('rl-f2a__tick')
  })
})

/* Several identities in one Run (owner, 5 Oct 2026: "one run each, switch"): the sign-in node's person is a chip each —
   the one on the canvas pressed, each marked with its own answer once landed — and the panel adds "What does each one
   get?" under the decision. One identity: the node and the panel are as they always were. */
describe('a Run of several identities', () => {
  const people = t.directory.people
  const finance = `${GROUP_PREFIX}finance`
  const priya = people.find((p) => p.id === personPick(finance, people).personId)!
  const FIN = propsOf(priya.name, 'AWS Console')
  const RAVI = propsOf('Ravi Menon', 'AWS Console')
  const ids: RunIdentity[] = [
    { key: ALLOW.form.personId!, kind: 'user', name: 'Maya Iyer', active: true, plan: ALLOW.plan },
    { key: finance, kind: 'group', name: 'Finance', active: false, plan: FIN.plan },
    { key: RAVI.form.personId!, kind: 'user', name: 'Ravi Menon', active: false, plan: RAVI.plan },
  ]
  const SEVERAL: RunLayoutProps = { ...ALLOW, identities: ids, onPickIdentity: noop }
  /** The sign-in node's chips: the `sir__ids` group, which holds nothing but them, up to the node's own press. */
  const chipsOf = (html: string) => {
    const at = html.indexOf('class="sir__ids ')
    return at < 0 ? '' : html.slice(html.lastIndexOf('<span', at), html.indexOf('class="rl-c2__nmain"', at))
  }

  it('draws a chip per identity in pick order, the one on the canvas pressed, each named with its answer', () => {
    const chips = chipsOf(wrap(SEVERAL))
    expect(chips).toContain('role="group" aria-label="Identities"')
    const tags = [...chips.matchAll(/<button[^>]*class="sir__id[^"]*"[^>]*>/g)].map((m) => m[0])
    expect(tags.length).toBe(3)
    expect(tags.map((x) => /aria-pressed="(true|false)"/.exec(x)?.[1])).toEqual(['true', 'false', 'false'])
    expect(tags.map((x) => /aria-label="([^"]*)"/.exec(x)?.[1]?.replace(/&#x27;/g, "'"))).toEqual(ids.map((i) => `${i.name}, ${wordsOfPlan(i.plan)}`))
    /* A person's round face, a group's square mark; a 12 px mark each, the run being settled. */
    expect(chips.split('bx-face is-user').length - 1).toBe(2)
    expect(chips.split('sir__grp').length - 1).toBe(1)
    expect(chips.split('sir__idmark').length - 1).toBe(3)
    /* The chips are in the sign-in node; "signs in to AWS Console" still edits the sign-in, and the chips never do. */
    expect(wrap(SEVERAL).indexOf('class="sir__ids ')).toBeGreaterThan(wrap(SEVERAL).indexOf('data-node="sign-in"'))
    expect(wrap(SEVERAL)).toMatch(/class="rl-c2__nmain" aria-label="Edit sign-in: Maya Iyer, Finance, Ravi Menon on AWS Console, \d sign-in conditions?"/)
  })

  it('marks no answer while the run is still being told', () => {
    const out = wrap({ ...propsOf('Maya Iyer', 'AWS Console', { at: 'mid' }), identities: ids, onPickIdentity: noop })
    expect(chipsOf(out)).toContain('aria-label="Identities"')
    expect(chipsOf(out)).not.toContain('sir__idmark')
  })

  it('adds "What does each one get?" under the decision, and nothing for one identity', () => {
    const said = text(wrap(SEVERAL))
    expect(said).toContain('Identities')
    expect(said).toContain('What does each one get?')
    expect(said.indexOf('What does each one get?')).toBeGreaterThan(said.indexOf('Decision'))
    const one = wrap({ ...ALLOW, identities: undefined })
    expect(one).not.toContain('sir__ids')
    expect(one).not.toContain('What does each one get?')
    expect(one).toMatch(/class="rl-c2__nmain" aria-label="Edit sign-in: Maya Iyer on AWS Console/)
    /* No count of them anywhere in the view: the chips are the count. */
    expect(said).not.toMatch(/\b\d+ (identities|people|picks)\b/)
  })

  it('answers it in the panel, every identity once, the one on the canvas cited', () => {
    const groups = faqOf(ALLOW.plan, { asGroup: null, screens: ALLOW.screens, form: ALLOW.form, rows: ALLOW.rows }, ids)
    const a = eachAnswer(ids, people)!
    const out = renderToStaticMarkup(
      <Focus2Ask state="landed" groups={groups} answer={a} emptyLine={null} animate={false} lit={null} speaking={false} summary={null} asked={new Set([FAQ_EACH])} on={FAQ_EACH} seq={1} onAsk={noop} onCite={noop} onPin={noop} onAction={noop} onStop={noop} onClose={noop} onClear={noop} />,
    )
    expect(out).toContain('<h3 class="rl-f2a__ansq">What does each one get?</h3>')
    const said = text(out)
    for (const i of ids) expect(said.split(i.name).length - 1, i.name).toBeGreaterThanOrEqual(1)
    expect(said).toContain(`Finance (tested as ${priya.name}):`)
    expect(out.split('data-cite="person"').length - 1).toBe(1)
    /* No presses: the chips switch. */
    expect(out).not.toContain('rl-f2a__act"')
  })
})
