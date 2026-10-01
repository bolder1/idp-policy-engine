/// <reference types="vite/client" />
import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EVERYONE, blankPolicy, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { EXAMPLES, dictionaryOf, openChoices, readText, type DescribeTenant, type RuleIds } from '../../create/describe-model'
import { checksView, type ChecksView } from '../../create/describe-checks'
import { historyOf } from '../history'
import { envOf } from '../tenant-resolver'
import { BoardEmpty } from './BoardEmpty'
import { DescribePanel } from './DescribePanel'
import {
  RULES_ADDED,
  answerAsk,
  bodyOf,
  composerSends,
  describeOffered,
  describeSession,
  describedDraft,
  doneFacts,
  emptyDescribe,
  sendTurn,
  undoDescribed,
  withDraftApps,
  writeDescribed,
  type BoardBody,
  type DescribeState,
} from './describe-session'
import css from './describe.css?raw'

/* -----------------------------------------------------------------------------
   Describe it, as the board shows it (V4 §4 and §4.1): a thread on the left.

   Drawn without a browser, the way the other board pieces are tested here: the
   chooser and the panel as static markup, and the clicks as the calls the
   board makes for them (describe-session.ts) — the door, a message sent and
   written, Done, and the toast's Undo. The reading and composing themselves
   are pinned in describe-model.test.ts and the thread's logic in
   describe-session.test.ts; this is the join to the page.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const dict = dictionaryOf(tenant)
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
const noop = () => {}
const all = (out: string, re: RegExp) => [...out.matchAll(re)].map((m) => text(m[1]))

/* The chooser's cards, by their titles, in the order drawn. */
const starts = (out: string) => [...out.matchAll(/<button type="button" class="bb__start2"[\s\S]*?<strong>([^<]+)<\/strong>/g)].map((m) => m[1])
const chooser = (p: Policy, on = true) =>
  html(<BoardEmpty fallback="deny" onUseTemplate={noop} onDescribe={describeOffered(on, p) ? noop : undefined} onScratch={noop} />)

/* A thread, as BoardBuilder drives it: each message sent against the board as
   it stands, and the board following the reading. */
function sent(draft: Policy, messages: string[], t: DescribeTenant = tenant) {
  const ids: RuleIds = new Map()
  let st = emptyDescribe()
  let board: BoardBody = bodyOf(draft)
  const follow = () => {
    board = bodyOf(describedDraft(draft, st.reading.answers, t, ids, st.origin?.fallback).policy)
  }
  for (const m of messages) {
    st = sendTurn(st, m, { dict: dictionaryOf(t), tenant: t, board, audience: EVERYONE })
    follow()
  }
  return {
    get st() {
      return st
    },
    get board() {
      return board
    },
    /* A question answered in the panel: the board follows. */
    answer(id: string, value: string) {
      st = { ...st, reading: answerAsk(st.reading, id, value, dictionaryOf(t)) }
      follow()
      return this
    },
    send(m: string) {
      st = sendTurn(st, m, { dict: dictionaryOf(t), tenant: t, board, audience: EVERYONE })
      follow()
      return this
    },
  }
}

type PanelProps = ComponentProps<typeof DescribePanel>
const panel = (state: DescribeState, board: BoardBody, more: Partial<PanelProps> = {}) =>
  html(
    <DescribePanel
      tenant={tenant}
      policyId="p-new"
      state={state}
      board={board}
      onState={noop}
      onSend={noop}
      onUndoTurn={noop}
      onDone={noop}
      onGo={noop}
      focus={null}
      bold={null}
      onTrace={noop}
      {...more}
    />,
  )
/* A `Parts` line's parts: [separator hidden from the reader, separator, words]. */
const parts = (out: string) =>
  [...out.matchAll(/<span class="bdsc__part"><span class="bdsc__sep"( aria-hidden="true")?>([^<]*)<\/span>([^<]*)<\/span>/g)].map((m) => [!!m[1], m[2], m[3]])
/* One turn's markup, by its place in the thread. */
const turnsOf = (out: string) => out.split('<li class="bdsc__turn">').slice(1)
const rowsOf = (out: string) => all(out, /<div id="[^"]*" class="bdsc__row[^"]*"[^>]*>([\s\S]*?)<\/span><\/div>/g)

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

/* One example, pressed: it is sent as the first message, and the board's
   write puts three cards on the draft as one history entry. */
describe('an example, read and written', () => {
  const draft = blankPolicy('Untitled policy 3', [])
  const ex = EXAMPLES.find((e) => e.label === 'Corporate devices by risk')!
  const { st: state, board } = sent(draft, [ex.text])

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
    const r = readText('Sales reach Salesforce with MFA from the office', dict)
    const d = { ...draft, fallback: { ...draft.fallback!, decision: '2fa' as const } }
    expect(describedDraft(d, r.answers, tenant, new Map()).policy.fallback).toBe(d.fallback)
    /* Not the last row an earlier text in the same session wrote: a new
       reading replaces what the old one said. */
    const s = describeSession(EVERYONE, draft.fallback)
    const blocked = describedDraft(draft, readText('Sales reach Salesforce. Block anything else.', dict).answers, tenant, new Map(), s.fallbackBefore).policy
    expect(blocked.fallback?.decision).toBe('deny')
    expect(describedDraft(blocked, r.answers, tenant, new Map(), s.fallbackBefore).policy.fallback).toBe(draft.fallback)
  })

  it('shows the example as the first message, and what it understood as rows of chips', () => {
    const out = panel(state, board)
    expect(out).toContain(`<p class="bdsc__bubble">${ex.text.replace(/&/g, '&amp;')}</p>`)
    expect(text(out)).toContain('Understood')
    expect(rowsOf(out)).toEqual([
      'Applications Google Workspace',
      'Who Sales Finance Vikram Nair',
      'Devices Only Corporate devices Medium from 40, high above 70',
      'Then Low risk Allow on 1 factor Medium risk Allow with 2FA OTP over Email High risk Deny',
      'Everyone else Deny',
    ])
    /* Each chip opens its answer's own controls. */
    expect(out).toContain('aria-label="Who: Vikram Nair" aria-haspopup="dialog" aria-expanded="false"')
    expect(out).toContain('aria-label="Then: Medium risk, Allow with 2FA · OTP over Email"')
    /* Defaults are never listed. */
    expect(out).not.toContain('<span class="bdsc__rowlabel">Leave out')
    expect(out).not.toContain('<span class="bdsc__rowlabel">Where')
    expect(text(out)).not.toContain('Not added')
    expect(text(out)).not.toContain('Checks')
    /* Its message can be rewritten in place. */
    expect(out).toContain('aria-label="Rewrite"')
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
  const answers = readText(ex.text, dict).answers

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

describe('the panel, before the first message', () => {
  const out = panel(emptyDescribe(), bodyOf(blankPolicy('Untitled policy', [])))

  it('opens on one question, a quiet pen, and the four examples as a group of buttons', () => {
    expect(out).toContain('<span class="bdsc__glyph" aria-hidden="true"><svg')
    expect(out).toContain('lucide-pen-line')
    expect(out).toContain('<p class="bdsc__prompt">What should this policy do?</p>')
    const group = /<div class="bdsc__examples" role="group" aria-label="Examples">([\s\S]*?)<\/div>/.exec(out)?.[1] ?? ''
    expect(all(group, /<button type="button" class="bdsc__example"[^>]*>([\s\S]*?)<\/button>/g)).toEqual(EXAMPLES.map((e) => e.text))
    /* Nothing read yet: no reply, no change line, no follow-ups. */
    expect(text(out)).not.toContain('Understood')
    expect(out).not.toContain('bdsc__change')
    expect(out).not.toContain('aria-label="Suggestions"')
  })

  it('says how it reads once, on the heading, and closes from its ×', () => {
    expect(text(out)).toContain('Describe the policy')
    expect(out.match(/How phrases are read/g)).toHaveLength(1)
    expect(out).toContain('aria-label="Close Describe the policy"')
    expect(text(out)).not.toMatch(/\bAI\b/)
    expect(text(out).toLowerCase()).not.toContain('assistant')
  })

  it('asks for text with a label, and sends from a round button that is never the brand', () => {
    expect(out).toContain('<label for="bdsc-text" class="u-sr-only">What should this policy do?</label>')
    expect(out).toMatch(/<textarea id="bdsc-text" rows="1" maxLength="500" placeholder="Who, which applications, where or when, what happens">/)
    expect(out).toContain('<button type="button" class="bdsc__send" aria-label="Send" aria-keyshortcuts="Enter">')
    /* Ink once there is something to send. */
    expect(panel({ ...emptyDescribe(), box: 'Sales need MFA' }, bodyOf(blankPolicy('Untitled policy', [])))).toContain('class="bdsc__send has-text"')
    /* The board's one orange is Save policy. */
    expect(out).not.toContain('bx-btn--primary')
    const send = [...css.matchAll(/\.bdsc__send[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join('\n')
    expect(send).toContain('var(--text-primary)')
    expect(send).not.toMatch(/--brand|--accent/)
  })

  it('sends on Enter; Shift+Enter, and the Enter that ends a composition, are a new line', () => {
    expect(composerSends({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true)
    expect(composerSends({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false)
    expect(composerSends({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(composerSends({ key: 'a', shiftKey: false, isComposing: false })).toBe(false)
  })
})

describe('a turn', () => {
  const draft = blankPolicy('Untitled policy', [])
  const RISKY = 'block logins from unmanaged devices when the risk profile is high'
  const CRM = 'MFA for all sales team members accessing the CRM from outside the US'

  it('ends with what it did to the board, and Undo on the latest turn only', () => {
    const { st, board } = sent(draft, ['Sales reach Salesforce with MFA', 'On a corporate device'])
    const out = panel(st, board)
    const turns = turnsOf(out)
    expect(turns).toHaveLength(2)
    expect(turns.map((t) => all(t, /<span class="bdsc__changeline">([\s\S]*?)<\/span><\/span><\/span>/g)[0])).toEqual(['Added 1 rule', 'Changed rule 1'])
    expect(turns.map((t) => t.includes('>Undo</'))).toEqual([false, true])
    /* The follow-up's reply lists what it changed, and nothing else. */
    expect(rowsOf(turns[1])).toEqual(['Devices Only Corporate devices'])
    /* After the first message, the composer asks for more. */
    expect(out).toContain('<label for="bdsc-text" class="u-sr-only">Add or change something</label>')
    expect(out).toContain('placeholder="Add or change something"')
  })

  it('wraps the change line between its parts, and never leaves a separator at a line’s end', () => {
    const { st, board } = sent(draft, [EXAMPLES[0].text])
    const line = /<span class="bdsc__changeline">([\s\S]*?)<\/p>/.exec(panel(st, board))?.[1] ?? ''
    expect(text(line)).toBe('Added 1 rule · Nothing else matched → Deny Undo')
    /* Each part leads with its separator — the first with an empty one, kept
       from the screen reader — so the one that would open a line is clipped. */
    expect(parts(line)).toEqual([
      [true, '', 'Added 1 rule'],
      [false, ' · ', 'Nothing else matched → Deny'],
    ])
    expect(css).toMatch(/\.bdsc__parts \{[^}]*overflow: hidden/)
    expect(css).toMatch(/\.bdsc__partsrow \{[^}]*flex-wrap: wrap; margin-left: calc\(-1 \* var\(--bdsc-sep\)\)/)
    expect(css).toMatch(/\.bdsc__sep \{[^}]*width: var\(--bdsc-sep\)/)
  })

  it('asks one question at a time, with quick replies and Don’t add, and no follow-ups meanwhile', () => {
    const t = sent(draft, [RISKY])
    const out = panel(t.st, t.board)
    expect(out.match(/class="bdsc__ask"/g)).toHaveLength(1)
    const ask = /<div class="bdsc__ask"[\s\S]*?<\/div><\/div>/.exec(out)?.[0] ?? ''
    expect(text(ask)).toBe('Which device profile is “unmanaged devices”? Not Corporate devices Don\'t add')
    expect(ask).toContain('<button type="button" class="bdsc__skip">Don&#x27;t add</button>')
    expect(out).not.toContain('aria-label="Suggestions"')

    /* Answered: a one-line settled row, and the next question. */
    t.answer(openChoices(t.st.reading)[0].id, 'not:fp-corp-devices')
    const next = panel(t.st, t.board)
    expect(next.match(/class="bdsc__ask"/g)).toHaveLength(1)
    expect(text(/<div class="bdsc__ask"[\s\S]*?<\/div><\/div>/.exec(next)?.[0] ?? '')).toBe('Which risk score is “the risk profile is high”? Above 70 Above 39 Don\'t add')
    expect(all(next, /<ul class="bdsc__settled">([\s\S]*?)<\/ul>/g)).toEqual(['“unmanaged devices” Not Corporate devices'])
    expect(rowsOf(next)).toContain('Devices Not Corporate devices')
  })

  it('shows four replies at most, the rest behind More…', () => {
    const t = sent(draft, [RISKY])
    const r = t.st.reading
    t.answer(openChoices(r)[0].id, 'not:fp-corp-devices')
    t.answer(openChoices(t.st.reading)[0].id, 'above:70')
    const ask = /<div class="bdsc__ask"[\s\S]*?<\/div><\/div>/.exec(panel(t.st, t.board))?.[0] ?? ''
    expect(text(ask)).toMatch(/^Which applications\? /)
    expect(ask.match(/class="bdsc__replychip"/g)).toHaveLength(3)
    expect(ask).toContain('More…')
    expect(ask).toContain("Don&#x27;t add")
  })

  it('lists the words it did not add as grey chips, the reason on each, and the way to fix it', () => {
    const { st, board } = sent(draft, [CRM])
    const out = panel(st, board)
    expect(out).toContain('<span class="bdsc__gone" tabindex="0" aria-label="Not added: outside the US. No zone for United States">outside the US</span>')
    const row = /<div class="bdsc__row bdsc__notadded">([\s\S]*?)<\/span><\/div>/.exec(out)?.[1] ?? ''
    expect(text(row)).toBe('Not added outside the US Create zone')
    expect(row).toContain('bx-btn--link')
  })

  it('keeps an earlier turn’s rows that a later message said again as words, not controls', () => {
    const t = sent(draft, [CRM])
    t.answer(openChoices(t.st.reading)[0].id, 'salesforce')
    t.send('Nadia Haddad needs a passkey on Jira')
    const [first, second] = turnsOf(panel(t.st, t.board))
    const past = [...first.matchAll(/<div id="[^"]*" class="bdsc__row is-past" title="Changed in a later message">([\s\S]*?)<\/span><\/div>/g)].map((m) => text(m[1]))
    expect(past).toEqual(['Applications Salesforce', 'Who Sales', 'Then Allow with 2FA'])
    expect(first).not.toMatch(/<button type="button" class="bdsc__chip/)
    /* The newer turn is where they change. */
    expect(second).toContain('aria-label="Applications: Jira"')
  })

  it('offers follow-ups from the gaps above the composer, three at most, shortest first', () => {
    const { st, board } = sent(draft, [EXAMPLES[0].text])
    const out = panel(st, board)
    const group = /<div class="bdsc__suggest" role="group" aria-label="Suggestions">([\s\S]*?)<\/div>/.exec(out)?.[1] ?? ''
    expect(all(group, /<button type="button" class="bdsc__suggestion">([\s\S]*?)<\/button>/g)).toEqual(['On a corporate device', 'Between 09:00 and 18:00 on weekdays'])
    /* Not while a message is being rewritten. */
    expect(panel({ ...st, rewrite: 0, box: st.turns[0].said }, board)).not.toContain('aria-label="Suggestions"')
  })

  it('marks the message being rewritten, and the composer says so', () => {
    const { st, board } = sent(draft, [EXAMPLES[0].text])
    const out = panel({ ...st, rewrite: 0, box: st.turns[0].said }, board)
    expect(out).toContain('class="bdsc__msg is-rewriting"')
    expect(out).toContain('class="bdsc__composer is-rewriting"')
    expect(out).toContain('aria-label="Cancel rewrite"')
  })
})

/* The checks under the latest reply (describe spec, §3.7 and §8.4): drawn from
   the rows the board computes (describe-checks.ts), collapsed to one row. */
describe('the checks', () => {
  const blank = blankPolicy('Untitled policy 3', [])
  const policies = [blank, ...T.policies]
  const withDraft: DescribeTenant = { ...tenant, policies }
  const ex = EXAMPLES.find((e) => e.label === 'HRMS from the office')!
  const { st: state, board } = sent(blank, [ex.text], withDraft)
  const { policy, sources } = describedDraft(blank, state.reading.answers, withDraft, new Map())
  const ctx = { draft: policy, sources, tenant: withDraft, env: envOf({ ...T, policies }), adminId: 'jaspreet', today: '2026-09-28' }
  const draw = (checks: ChecksView | null | undefined, withTry = true) =>
    html(
      <DescribePanel
        tenant={withDraft}
        policyId={blank.id}
        state={state}
        board={board}
        onState={noop}
        onSend={noop}
        onUndoTurn={noop}
        onDone={noop}
        onGo={noop}
        focus={null}
        bold={null}
        onTrace={noop}
        checks={checks}
        onTryCheck={withTry ? noop : undefined}
      />,
    )

  it('collapse to one row with its pills, and open to rows that each try their sign-in', () => {
    const out = draw(checksView(state.reading.answers, ctx))
    expect(out).toMatch(/<button type="button" class="bdsc__checkshead" aria-expanded="false" aria-controls="[^"]+">/)
    const head = /<button type="button" class="bdsc__checkshead"[\s\S]*?<\/button>/.exec(out)?.[0] ?? ''
    /* Every row is on HRMS: said once, in the tip, not on each row. */
    expect(text(head)).toBe('Checks On HRMS. Through every policy on these applications. 4 pass')
    expect(head).toContain('<span class="bdsc__pill">4 pass</span>')
    /* Closed, the rows are there but out of reach until it opens. */
    expect(out).toMatch(/<div id="[^"]+" role="region" aria-label="Checks" class="bdsc__region" inert="">/)
    const rows = [...out.matchAll(/<button type="button" class="bdsc__check" aria-label="([^"]+)"/g)].map((m) => m[1])
    expect(rows).toEqual([
      'Should pass, Kavya Menon · HRMS · Office network · Windows 11 laptop · registered, Allow with 2FA',
      'Should stop, Kavya Menon · HRMS · Home broadband · Windows 11 laptop · registered, Deny',
      'Edge, Kavya Menon · HRMS · Office network · London · Windows 11 laptop · registered, Deny',
      'Not named, Sanjay Bhatt · HRMS · Office network · Windows 11 laptop · registered, Allow on 1 factor',
    ])
    expect(out).toContain('title="From your text: “only from a corporate office”"')
    /* The rows' own lines keep to what differs: no shared application, each
       row after Should pass only what it changed from it, and not this
       draft's own name before the rule that decided. The whole sign-in is
       the line's tooltip. */
    const lines = [...out.matchAll(/<span class="bdsc__checkline" title="([^"]+)">([^<]*)<\/span>/g)].map((m) => [m[2], m[1]])
    expect(lines.map((l) => l[0])).toEqual(['Kavya Menon · Office network · Windows 11 laptop · registered', 'Home broadband', 'London', 'Sanjay Bhatt'])
    expect(lines[2][1]).toBe('Kavya Menon · HRMS · Office network · London · Windows 11 laptop · registered')
    const details = [...out.matchAll(/<span class="bdsc__checkdetail">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(details.some((d) => d.startsWith('Rule 1 · '))).toBe(true)
    expect(details.some((d) => d.includes(blank.name))).toBe(false)
    /* HRMS access from corporate offices opens Inactive (Phase 4), so the
       Global Default decides HR and Finance on HRMS today and this draft
       would start deciding for them: Priya's modelled sign-ins move. Since
       the Global Default's baseline (30 Sep 2026) it refuses Austin and the
       proxy itself, so only the office laptops move, to 2FA. */
    expect(text(out)).toContain('What changes Of 360 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 3 · Now denied 0')
    /* Each count stays on the line with its words. */
    const changes = /<span class="bdsc__changesline">([\s\S]*?)<\/p>/.exec(out)?.[1] ?? ''
    expect(parts(changes).map((p) => p[2])).toEqual(['Of 360 modelled sign-ins: Now allowed 0', 'Now on 1 factor 0', 'Now asked for 2FA 3', 'Now denied 0'])
    /* The row opens in place: its one track grows from nothing. */
    expect(css).toMatch(/\.bdsc__region \{[^}]*grid-template-rows: 0fr/)
    expect(css).toMatch(/\.bdsc__checks\.is-open \.bdsc__region \{ grid-template-rows: 1fr; \}/)
  })

  it('say how many differ in a red pill, and leave can’t tell as grey words', () => {
    const view = checksView(state.reading.answers, ctx)!
    const [pass, stop] = view.rows
    const mixed: ChecksView = {
      ...view,
      rows: [pass, { ...stop, id: 'differs', detail: `Expected Allow with 2FA · ${stop.detail}` }, { ...stop, id: 'cant', decision: null, needs: ['Device'] }],
    }
    const head = /<button type="button" class="bdsc__checkshead"[\s\S]*?<\/button>/.exec(draw(mixed))?.[0] ?? ''
    expect(head).toContain('<span class="bdsc__pill">1 pass</span>')
    expect(head).toContain('<span class="bdsc__pill is-differs">1 differ</span>')
    expect(head).toContain('<span class="bdsc__checksnote">1 can&#x27;t tell</span>')
  })

  it('are not drawn before there is an application to check on', () => {
    const out = draw(null)
    expect(out).not.toContain('bdsc__checks')
    expect(text(out)).not.toContain('Choose an application')
    expect(text(out)).not.toContain('What changes')
  })

  it('are not drawn with the edition’s checks off', () => {
    const out = draw(undefined)
    expect(text(out)).not.toContain('Checks')
    expect(out).not.toContain('bdsc__checks')
  })

  it('are rows, not buttons, where there is no Try a sign-in to open', () => {
    const out = draw(checksView(state.reading.answers, ctx), false)
    expect(out).not.toContain('<button type="button" class="bdsc__check"')
    expect(out.match(/<div class="bdsc__check" aria-label="[^"]+" (title="[^"]*" )?role="group">/g)).toHaveLength(4)
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
    const next = withDraftApps({ ...typed, box: 'HR' }, ['hrms'])
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

  it('moves nothing by transform — it slides in by `translate` — and takes its colours from the tokens', () => {
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).toMatch(/@keyframes bdsc-in \{\s*from \{ opacity: 0; translate: -16px 0; \}/)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    expect(rules).not.toContain('--text-muted')
  })

  it('keeps its type at 12 px or more', () => {
    for (const m of rules.matchAll(/font-size:\s*([^;]+);/g)) expect(m[1], m[0]).toMatch(/^var\(--(fs-(xs|sm|md|lg)|pill-fs)\)$/)
  })
})
