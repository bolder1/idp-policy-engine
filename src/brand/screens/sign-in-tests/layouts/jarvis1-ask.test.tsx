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
import { OWN_TOP } from '../run-layout'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { fixPossessive } from './focus-voice'
import { faqOf, presentAnswer, shownSentence } from './focus2-faq'
import JarvisLayout from './JarvisLayout'
import { plain, type AskProps } from './assistant/intents'
import { previewOf, rankWhatIfs, variationsOf, type WhatIf } from './assistant/what-if'
import { ASK_EMPTY, ASK_PLAYING, EACH_GROUP, answerOf, nextQuestion, questionsOf, rowOf, rowsOf } from './jarvis1-ask-model'
import css from './jarvis.css?raw'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   ARUNA'S CHAT, over REAL runs of the showcase tenant (jarvis1-ask-model.ts,
   jarvis1-ask.tsx, and what JarvisLayout.tsx draws around them).

   It holds the owner's rulings on her floor (5 Oct 2026):
     · her questions are Focus's, imported and never forked;
     · there is no free-text field and no zoom in her chat;
     · asked questions are marked, never removed;
     · "What does each group get?" stands beside "Run as Finance only";
     · a label's state wraps to two lines, never an ellipsis on the first;
     · the circle names no person, application or condition, and the run
       line above the canvas does (OWN_TOP).
   Static markup only: no effect runs, so the motion is checked in the browser.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function run(personName: string, appName: string, opts: { origin?: 'home' | 'tor' } = {}) {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows)
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  const screens = screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person })
  const deps = { policies: t.policies, zones: t.zones, fingerprints: t.fingerprints, users: t.directory.people, apps: t.apps, methods: t.methods, defaultMethodId: undefined, env }
  const whatIfs: WhatIf[] = rankWhatIfs(variationsOf(form, rows).flatMap((v) => previewOf(form, v.patch, deps, plan, v) ?? []), plan)
  const props: AskProps = { asGroup: null, screens, form, rows, whatIfs, preview: (patch) => previewOf(form, patch, deps, plan), onAsGroup: noop, onAdd: noop, onOpenRule: noop, onOpenPolicy: noop, onRunWith: noop }
  const layout: RunLayoutProps = {
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
    screens,
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
  return { plan, props, layout }
}

const MAYA = run('Maya Iyer', 'AWS Console')
const DENY = run('Devon Rao', 'AWS Console', { origin: 'home' })
const ALL = [MAYA, DENY, run('Aisha Khan', 'Google Workspace'), run('Arun Patel', 'GitHub Enterprise', { origin: 'home' }), run('Ravi Menon', 'AWS Console'), run('Priya Sharma', 'HRMS')]

const render = (p: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <JarvisLayout {...p} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

describe("Aruna's questions are Focus's", () => {
  it('offers exactly faqOf once the run has landed, and nothing before', () => {
    for (const r of ALL) {
      expect(questionsOf(r.plan, r.props, false)).toEqual([])
      expect(questionsOf(r.plan, r.props, true)).toEqual(faqOf(r.plan, r.props))
      expect(rowsOf(questionsOf(r.plan, r.props, true)).length).toBeGreaterThan(0)
    }
  })

  it('answers every question she offers, in the words Focus draws and says', () => {
    for (const r of ALL) {
      for (const row of rowsOf(questionsOf(r.plan, r.props, true))) {
        const a = answerOf(row, r.plan, r.props)
        expect(a, `${row.id}`).not.toBeNull()
        if (!a) continue
        expect(plain(a.sentence).length).toBeGreaterThan(5)
        /* The screen's sentence is Focus's `shownSentence`, and the voice's is the same words with the possessive fixed. */
        expect(a.sentence).toEqual(shownSentence(presentAnswer(a, r.plan, r.props).sentence))
        expect(a.say).toBe(fixPossessive(a.say))
      }
    }
  })

  it('never lists a question whose answer it cannot give', () => {
    const rows = rowsOf(questionsOf(DENY.plan, DENY.props, true))
    expect(rows.every((r) => answerOf(r, DENY.plan, DENY.props) !== null)).toBe(true)
  })

  it('marks asked questions and never removes one: the next is the first not yet asked', () => {
    const groups = questionsOf(MAYA.plan, MAYA.props, true)
    const rows = rowsOf(groups)
    const asked = new Set<string>()
    const seen: string[] = []
    for (let n = 0; n < rows.length; n++) {
      const next = nextQuestion(groups, asked)
      expect(next).not.toBeNull()
      if (!next) return
      expect(asked.has(next.id)).toBe(false)
      seen.push(next.id)
      asked.add(next.id)
      /* The list itself is unchanged by asking. */
      expect(rowsOf(groups)).toEqual(rows)
    }
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(nextQuestion(groups, asked)).toBeNull()
  })

  it('offers "What does each group get?" to a person in two groups, and answers it', () => {
    const row = rowOf(questionsOf(MAYA.plan, MAYA.props, true), EACH_GROUP)
    expect(row?.label).toBe('What does each group get?')
    expect(row && answerOf(row, MAYA.plan, MAYA.props)).not.toBeNull()
    /* One group, or none: not offered, so never asked for nothing. */
    expect(rowOf(questionsOf(DENY.plan, DENY.props, true), EACH_GROUP)).toBeNull()
  })

  it('says why there is nothing to ask before the run lands', () => {
    expect(ASK_EMPTY).toBe('Run a sign-in to ask about it.')
    expect(ASK_PLAYING).toBe('Questions come once the run lands.')
  })
})

describe('what her floor draws', () => {
  const out = render(MAYA.layout)

  it('has no free-text field, no zoom and no mic', () => {
    expect(out).not.toMatch(/<input|<textarea/i)
    expect(out).not.toMatch(/Ask Aruna about/)
    expect(out).not.toMatch(/ad__zoom|ad__pct|>Fit</)
    expect(out).not.toMatch(/Start listening|Voice off · turn it on/)
  })

  it('has Questions and Voice, each with its word, and her next question on the folded bar', () => {
    expect(out).toContain('Questions')
    expect(out).toContain('Voice')
    const next = nextQuestion(questionsOf(MAYA.plan, MAYA.props, true), new Set())
    expect(out).toContain('jv1-ask__next')
    expect(next && out).toContain(next ? next.label.replace(/&/g, '&amp;').replace(/'/g, '&#x27;') : '')
  })

  it('never says Jarvis, an assistant or AI', () => {
    const text = out.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/jarvis|assistant|\bAI\b/i)
  })

  it('puts "What does each group get?" beside "Run as … only"', () => {
    const at = out.indexOf('rl-jarvis__npresses')
    expect(at).toBeGreaterThan(0)
    const row = out.slice(at, out.indexOf('</div>', at))
    expect(row).toMatch(/Run as [^<]+ only/)
    expect(row).toContain('What does each group get?')
  })

  it('offers the group question only to a person in two groups', () => {
    expect(render(DENY.layout)).not.toContain('What does each group get?')
  })

  it('states the sign-in on the run line, and the circle states none of it', () => {
    expect(OWN_TOP).toContain('jarvis')
    expect(out).toContain('data-sir')
    expect(out).not.toMatch(/rl-jarvis__(orb|gate|chip|whoname|appname|replay|pen)\b/)
    expect(out).not.toContain('data-jv-warn')
  })

  it('keeps depth order under reduced motion: sunk segments, the core, the band', () => {
    const sunk = out.indexOf('rl-jarvis__layer is-sunk')
    const core = out.indexOf('rl-jarvis__layer is-core')
    const segs = out.indexOf('rl-jarvis__layer is-segs')
    expect(sunk).toBeGreaterThan(0)
    expect(core).toBeGreaterThan(sunk)
    expect(segs).toBeGreaterThan(core)
  })

  it('reserves the second line for a label whose state needs it', () => {
    expect(out).toMatch(/rl-jarvis__pstate" title="[^"]*" style="min-height:34px/)
  })
})

describe('her sheet', () => {
  const rule = (sel: string) => css.split('\n').filter((l) => l.startsWith(sel)).join('\n')

  it('wraps a label state to two lines and cuts it only after the second', () => {
    const live = rule('.rl-jarvis__pstate .rl-jarvis__decode-live')
    expect(live).toContain('-webkit-line-clamp: 2')
    expect(live).toContain('white-space: normal')
    expect(rule('.rl-jarvis__pstate')).not.toMatch(/nowrap|text-overflow/)
  })

  it('has no rule for a class nothing draws any more', () => {
    for (const dead of ['ringa', 'ringb', 'ringc', 'ticks', 'ringhit', 'answerlines', 'changed', 'fararc', 'farticks', 'farline', 'fartrack', 'major', 'minor', 'orbit', 'track']) expect(css, dead).not.toContain(`rl-jarvis__${dead}`)
  })

  it('keeps every glow but the verdict\'s soft', () => {
    /* No glow wider than 12px outside the verdict, its halo, the lock-on and its scan (the vignette is an inset shadow, not a glow). */
    const verdict = /vglass|vglow|vbreath|halo|verdict|vscan|lockon|corehalo/
    for (const line of css.split('\n')) {
      if (verdict.test(line)) continue
      for (const m of line.matchAll(/(?:drop-shadow|box-shadow)[^;]*?(?<!inset )0 0 (\d+)px/g)) expect(Number(m[1]), line.trim()).toBeLessThanOrEqual(12)
    }
  })
})
