import { describe, expect, it } from 'vitest'

import { EVERYONE, blankPolicy, rule, type Policy, type Rule } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { whoKey } from '../../rule-who'
import { EXAMPLES, compose, dictionaryOf, emptyAnswers, openChoices, readText, valuesOf, type DescribeTenant, type Reading, type RuleIds } from '../../create/describe-model'
import { commit, historyOf, undo } from '../history'
import {
  LEFT_OUT,
  UNTITLED_NAME,
  answerAsk,
  asksOf,
  bodyOf,
  carryPicks,
  changeLine,
  changedCards,
  corrected,
  describeSession,
  describedDraft,
  emptyDescribe,
  extendText,
  factsBack,
  followUps,
  revertDescribed,
  saidKeys,
  sendTurn,
  skipChoice,
  turnView,
  undoDescribed,
  undoTurn,
  withDraftApps,
  writeDescribed,
  type BoardBody,
  type DescribeState,
} from './describe-session'

/* One opening of Describe it is one step on the undo stack, however many
   answers it writes (describe spec, §4.8 and §8.5). */

const base = blankPolicy('Untitled policy', [])
const withRules = (...names: string[]): Policy => ({ ...base, rules: names.map((name) => rule({ name })) })

describe('a Describe it session in the history', () => {
  it('commits its first write and amends every later one, so one Undo takes it all back', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('first'), s))
    expect(h.past).toHaveLength(1)
    expect(s.wrote).toBe(true)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('second'), s))
    ;({ hist: h, session: s } = writeDescribed(h, withRules('third', 'and another'), s))
    expect(h.past).toHaveLength(1)
    expect(h.present.rules.map((r) => r.name)).toEqual(['third', 'and another'])
    expect(undo(h).present).toBe(base)
  })

  it('writes nothing when the rules and the last row are what the draft already has', () => {
    const h = historyOf(base)
    const s = describeSession(EVERYONE)
    const out = writeDescribed(h, { ...base, name: 'Renamed' }, s)
    expect(out.hist).toBe(h)
    expect(out.session.wrote).toBe(false)
  })

  it('commits afresh after something else moved the history, rather than overwriting it', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('first'), s))
    /* ⌘Z with the panel open: the present is no longer the session's write. */
    h = undo(h)
    ;({ hist: h, session: s } = writeDescribed(h, withRules('again'), s))
    expect(h.past).toEqual([base])
    expect(h.present.rules.map((r) => r.name)).toEqual(['again'])
    expect(h.future).toEqual([])
  })

  it('remembers the audience the policy had when the panel opened', () => {
    expect(describeSession({ everyone: false, groupIds: ['hr'], userIds: [] }).audienceBefore.groupIds).toEqual(['hr'])
  })

  it('starts the visit with an empty box and nothing read', () => {
    const e = emptyDescribe()
    expect(e.text).toBe('')
    expect(e.reading.choices).toEqual([])
    expect(e.reading.answers.signIn).toEqual({})
    expect(e.turns).toEqual([])
    expect(e.origin).toBeNull()
  })
})

describe('the names Describe it may replace', () => {
  it('are the ones the product gave a new draft, and only those', () => {
    for (const n of ['Untitled policy', 'Untitled policy 2', 'Untitled policy 14']) expect(UNTITLED_NAME.test(n), n).toBe(true)
    for (const n of ['Untitled policy copy', 'My untitled policy', 'HRMS from Corporate offices']) expect(UNTITLED_NAME.test(n), n).toBe(false)
  })
})

/* --- The thread (V4 §4.1) -------------------------------------------------------------

   Driven the way BoardBuilder drives it: a message is sent against the board
   as it stands, and the board then follows the reading — composed onto the
   draft, each card keeping its id from reading to reading. */

const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const dict = dictionaryOf(tenant)
const read = (text: string) => readText(text, dict)

const RISKY = 'block logins from unmanaged devices when the risk profile is high'
const CRM = 'MFA for all sales team members accessing the CRM from outside the US'
const SALES = 'Sales reach Salesforce with MFA'

function thread(appIds: readonly string[] = []) {
  const ids: RuleIds = new Map()
  let st = emptyDescribe()
  let board: BoardBody = { ...bodyOf(base), appIds }
  const follow = () => {
    board = { ...bodyOf(describedDraft(base, st.reading.answers, tenant, ids, st.origin?.fallback).policy), appIds }
  }
  return {
    get st() {
      return st
    },
    get board() {
      return board
    },
    send(message: string) {
      st = sendTurn(st, message, { dict, tenant, board, audience: EVERYONE })
      follow()
      return st
    },
    /* The panel's state changed. With `write`, the board follows, as `writeDescribe` does;
       the pencil and the box leave it where it is. */
    set(next: DescribeState, write = true) {
      st = next
      if (write) follow()
    },
    answer(id: string, value: string) {
      this.set({ ...st, reading: answerAsk(st.reading, id, value, dict) })
    },
    skip(id: string) {
      this.set({ ...st, reading: skipChoice(st.reading, id, dict) })
    },
    undo() {
      const out = undoTurn(st)
      if (out) {
        st = out.state
        board = out.board
      }
      return out
    },
    view(i: number) {
      return turnView(st, i, board, tenant)
    },
    asks() {
      return asksOf(st.reading, tenant, st.dismissed)
    },
  }
}
const same = (x: Reading, y: Reading) => expect(valuesOf(x.answers)).toEqual(valuesOf(y.answers))

describe('a message sent', () => {
  it('reads the first message as it stands, and keeps where the thread began', () => {
    const board = { ...bodyOf(base), appIds: ['hrms'] }
    const st = sendTurn({ ...emptyDescribe(), box: SALES }, `  ${SALES}  `, { dict, tenant, board, audience: EVERYONE })
    expect(st.text).toBe(SALES)
    same(st.reading, read(SALES))
    expect(st.box).toBe('')
    expect(st.turns).toHaveLength(1)
    expect(st.turns[0]).toMatchObject({ id: 1, said: SALES, at: 0, before: null, board })
    /* The origin is what the first turn's Undo gives back. */
    expect(st.origin).toEqual({ audience: EVERYONE, fallback: base.fallback })
  })

  it('sends nothing for an empty message', () => {
    const st = emptyDescribe()
    expect(sendTurn(st, '   ', { dict, tenant, board: bodyOf(base), audience: EVERYONE })).toBe(st)
  })

  it('extends the text with a follow-up and reads the whole of it again', () => {
    const t = thread()
    t.send(SALES)
    t.send('On a corporate device')
    const text = `${SALES}. On a corporate device`
    expect(t.st.text).toBe(text)
    same(t.st.reading, read(text))
    expect(t.st.turns.map((x) => x.said)).toEqual([SALES, 'On a corporate device'])
    expect(t.st.turns[1].at).toBe(`${SALES}. `.length)
    expect(t.st.turns[1].before?.text).toBe(SALES)
    /* The origin stays the first turn's. */
    expect(t.st.origin?.fallback).toBe(base.fallback)
  })

  it('joins a follow-up as a sentence of its own', () => {
    expect(extendText('Sales reach Salesforce', 'Block anything else')).toBe('Sales reach Salesforce. Block anything else')
    expect(extendText('Sales reach Salesforce. ', ' Block anything else ')).toBe('Sales reach Salesforce. Block anything else')
    expect(extendText('Sales reach Salesforce!', 'Block anything else')).toBe('Sales reach Salesforce! Block anything else')
    /* A closing quote's full stop is inside it and ends nothing. */
    expect(extendText('Block anything else with “Update it.”', 'Sales need MFA')).toBe('Block anything else with “Update it.”. Sales need MFA')
    expect(extendText('', 'Sales need MFA')).toBe('Sales need MFA')
    expect(extendText('Sales need MFA', '  ')).toBe('Sales need MFA')
  })

  it('replaces a rewritten message, and the turns after it go', () => {
    const t = thread()
    t.send(SALES)
    t.send('On a corporate device')
    t.set({ ...t.st, rewrite: 0, box: SALES }, false)
    t.send('Finance reach Workday with MFA')
    expect(t.st.turns.map((x) => x.said)).toEqual(['Finance reach Workday with MFA'])
    expect(t.st.text).toBe('Finance reach Workday with MFA')
    same(t.st.reading, read('Finance reach Workday with MFA'))
    expect(t.st.turns[0].before).toBeNull()
    expect(t.st.rewrite).toBeNull()
    /* What it replaced, for its Undo. */
    expect(t.st.turns[0].replaced?.turns.map((x) => x.said)).toEqual([SALES, 'On a corporate device'])
  })

  it('rewrites a later message in its place, on the text before it', () => {
    const t = thread()
    t.send(SALES)
    t.send('On a corporate device')
    t.set({ ...t.st, rewrite: 1 }, false)
    t.send('Block anything else')
    expect(t.st.turns.map((x) => x.said)).toEqual([SALES, 'Block anything else'])
    expect(t.st.text).toBe(`${SALES}. Block anything else`)
    same(t.st.reading, read(`${SALES}. Block anything else`))
  })
})

describe('a turn taken back', () => {
  it('undoes exactly the latest turn: the text, the reading and the board before it', () => {
    const t = thread()
    t.send(SALES)
    const first = { reading: t.st.reading, board: t.board }
    t.send('On a corporate device')
    expect(t.st.turns[0].done).toBeDefined()
    const out = t.undo()
    expect(out?.first).toBe(false)
    expect(t.st.turns.map((x) => x.said)).toEqual([SALES])
    expect(t.st.text).toBe(SALES)
    expect(t.st.reading).toBe(first.reading)
    expect(out?.board.rules).toBe(first.board.rules)
    /* The turn before is the latest again, drawn live. */
    expect(t.st.turns[0].done).toBeUndefined()
    expect(t.view(0).latest).toBe(true)
  })

  it('puts back the version a rewrite replaced, turns and all', () => {
    const t = thread()
    t.send(SALES)
    t.send('On a corporate device')
    const was = { text: t.st.text, reading: t.st.reading, rules: t.board.rules }
    t.set({ ...t.st, rewrite: 0 }, false)
    t.send('Finance reach Workday with MFA')
    const out = t.undo()
    expect(out?.first).toBe(false)
    expect(t.st.turns.map((x) => x.said)).toEqual([SALES, 'On a corporate device'])
    expect(t.st.text).toBe(was.text)
    expect(t.st.reading).toBe(was.reading)
    expect(out?.board.rules).toBe(was.rules)
  })

  it('goes back to the chooser from the first turn, with nothing read', () => {
    const t = thread()
    t.send(RISKY)
    t.set({ ...t.st, dismissed: ['ask:apps'] }, false)
    const out = t.undo()
    expect(out?.first).toBe(true)
    expect(out?.board.rules).toEqual([])
    expect(t.st.turns).toEqual([])
    expect(t.st.text).toBe('')
    expect(t.st.reading.choices).toEqual([])
    expect(t.st.origin).toBeNull()
    expect(t.st.dismissed).toEqual([])
  })

  it('hands back the applications the turn found', () => {
    const t = thread(['hrms'])
    t.send(SALES)
    expect(t.undo()?.board.appIds).toEqual(['hrms'])
  })

  it('has nothing to take back on an empty thread', () => {
    expect(undoTurn(emptyDescribe())).toBeNull()
  })
})

describe('one question at a time', () => {
  it('asks the text’s questions in the order it raised them, then what the policy cannot go without', () => {
    const t = thread()
    t.send(RISKY)
    const asks = t.asks()
    expect(asks.map((q) => q.question)).toEqual(['Which device profile is “unmanaged devices”?', 'Which risk score is “the risk profile is high”?', 'Which applications?'])
    /* The panel shows the first alone. Don't add is its own button, never a reply. */
    expect(asks[0].options.map((o) => o.label)).toEqual(['Not Corporate devices'])
    expect(asks[0].canSkip).toBe(true)
    expect(asks[2].options.map((o) => o.label)).toContain('HRMS')
  })

  it('writes the answer to the board and moves on to the next question', () => {
    const t = thread()
    t.send(RISKY)
    expect(t.board.rules).toEqual([])
    t.answer(t.asks()[0].id, 'not:fp-corp-devices')
    expect(t.asks().map((q) => q.question)).toEqual(['Which risk score is “the risk profile is high”?', 'Which applications?'])
    expect(t.board.rules).toHaveLength(1)
    expect(t.board.rules[0].decision).toBe('deny')
    expect(t.view(0).settled).toEqual([{ key: 'devices|unmanaged devices', phrase: 'unmanaged devices', answer: 'Not Corporate devices' }])
  })

  it('leaves the words out with Don’t add, and says so once, under Not added', () => {
    const t = thread()
    t.send(RISKY)
    t.answer(t.asks()[0].id, 'not:fp-corp-devices')
    t.skip(t.asks()[0].id)
    expect(t.st.reading.notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['the risk profile is high', LEFT_OUT]])
    expect(t.view(0).notAdded.map((n) => n.span.phrase)).toEqual(['the risk profile is high'])
    /* Not a settled line as well: it is under Not added already. */
    expect(t.view(0).settled.map((s) => s.phrase)).toEqual(['unmanaged devices'])
    expect(t.asks().map((q) => q.question)).toEqual(['Which applications?'])
  })

  it('takes a question’s own Don’t add as its answer, with its reason', () => {
    const r = read(RISKY)
    const skipped = skipChoice(r, openChoices(r)[0].id, dict)
    expect(skipped.notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['unmanaged devices', 'No MDM condition']])
    expect(asksOf(skipped, tenant, []).map((q) => q.question)[0]).toBe('Which risk score is “the risk profile is high”?')
  })

  it('fills a gap no phrase asked about: the applications, then an outcome', () => {
    const t = thread()
    t.send(RISKY)
    t.answer(t.asks()[0].id, 'not:fp-corp-devices')
    t.skip(t.asks()[0].id)
    t.answer('ask:apps', 'hrms')
    expect(t.st.reading.answers.apps).toEqual({ value: ['hrms'], origin: 'picked', spans: [] })
    expect(t.asks()).toEqual([])

    const r = read('Sales reach Salesforce')
    const open: Reading = { ...r, answers: { ...r.answers, signIn: { match: { value: null, origin: 'unset', spans: [] } } } }
    const ask = asksOf(open, tenant, [])
    expect(ask.map((q) => [q.id, q.question, q.options.map((o) => o.label)])).toEqual([['ask:signIn:match', 'What happens?', ['Allow on 1 factor', 'Allow with 2FA', 'Deny']]])
    expect(answerAsk(open, 'ask:signIn:match', 'deny', dict).answers.signIn.match).toEqual({ value: { decision: 'deny', method: null, message: null }, origin: 'picked', spans: [] })
  })

  it('does not ask again what was set aside', () => {
    const t = thread()
    t.send(RISKY)
    expect(asksOf(t.st.reading, tenant, ['ask:apps']).map((q) => q.id)).not.toContain('ask:apps')
  })

  it('never offers Don’t add on which rule decides first', () => {
    const r = read('Engineering and DevOps reach GitHub and Jira on a compliant device with miniOrange Push; in the office, password only.')
    const [q] = asksOf(r, tenant, [])
    expect(q).toMatchObject({ question: 'Which decides first?', order: true, canSkip: false })
    expect(skipChoice(r, q.id, dict)).toBe(r)
  })
})

/* Rules written from scratch, ids and all, for the one-line summary. */
const card = (name: string, over: Partial<Rule> = {}) => rule({ name, ...over })
const body = (rules: Rule[], fallback?: Rule): BoardBody => ({ rules, fallback, checks: [] })

describe('what a turn did, in one line', () => {
  const r1 = card('One')
  const r2 = card('Two')
  const r3 = card('Three')
  const deny = { ...card('Nothing else matched'), decision: 'deny' as const }

  it('counts the cards added, and names the last row’s new outcome', () => {
    expect(changeLine(body([]), body([r1]))).toBe('Added 1 rule')
    expect(changeLine(body([]), body([r1, r2], deny))).toBe('Added 2 rules · Nothing else matched → Deny')
  })

  it('names the cards changed by their place in the chain', () => {
    expect(changeLine(body([r1, r2]), body([r1, { ...r2, decision: 'deny' }]))).toBe('Changed rule 2')
    expect(changeLine(body([r1, r2]), body([{ ...r1, name: 'Uno' }, { ...r2, decision: 'deny' }]))).toBe('Changed rules 1 and 2')
    expect(changeLine(body([r1, r2, r3]), body([r1, r2, r3].map((r) => ({ ...r, decision: '1fa' as const }))))).toBe('Changed rules 1, 2 and 3')
  })

  it('counts the cards taken away', () => {
    expect(changeLine(body([r1, r2]), body([r2]))).toBe('Removed 1 rule')
    expect(changeLine(body([r1, r2]), body([r3]))).toBe('Added 1 rule · Removed 2 rules')
  })

  it('says No change when the cards say what they said, whatever their ids inside', () => {
    expect(changeLine(body([r1], deny), body([r1], { ...deny, id: 'other' }))).toBe('No change')
    /* The composer mints fresh ids for a card's condition groups on every reading. */
    const a = compose(read(EXAMPLES[0].text).answers, tenant).rules[0]
    const b = compose(read(EXAMPLES[0].text).answers, tenant).rules[0]
    expect(a.when.cards[0]?.id).not.toBe(b.when.cards[0]?.id)
    expect(changeLine(body([a]), body([{ ...b, id: a.id }]))).toBe('No change')
    /* No last row written: nothing said about it. */
    expect(changeLine(body([r1], deny), body([r1]))).toBe('No change')
  })

  it('knows a follow-up that adds to a card as that card changed, not one added and one gone', () => {
    const t = thread()
    t.send(SALES)
    expect(t.view(0).change).toBe('Added 1 rule')
    t.send('On a corporate device')
    expect(t.view(1).change).toBe('Changed rule 1')
    /* The turn before still says what it did then. */
    expect(t.view(0).change).toBe('Added 1 rule')
    expect(t.view(0).latest).toBe(false)
  })
})

describe('the cards a write marks for 2 s', () => {
  it('are the ones added or changed, and the last row when it changed', () => {
    const r1 = card('One')
    const r2 = card('Two')
    const deny = { ...card('Nothing else matched'), decision: 'deny' as const }
    expect(changedCards(body([]), body([r1, r2], deny))).toEqual([r1.id, r2.id, 'fallback'])
    expect(changedCards(body([r1, r2], deny), body([r1, { ...r2, decision: 'deny' }], deny))).toEqual([r2.id])
    expect(changedCards(body([r1], deny), body([r1], deny))).toEqual([])
  })

  it('follow the thread: a follow-up marks the card it changed and nothing else', () => {
    const t = thread()
    t.send(SALES)
    const before = t.board
    expect(changedCards(bodyOf(base), before)).toEqual([before.rules[0].id])
    t.send('On a corporate device')
    expect(changedCards(before, t.board)).toEqual([before.rules[0].id])
  })
})

describe('the rows a reply shows', () => {
  it('are only what the text said — never a default', () => {
    const t = thread()
    t.send(EXAMPLES[0].text)
    expect(t.view(0).keys).toEqual(['apps', 'who', 'where', 'signIn', 'fallback'])
    expect(saidKeys(emptyAnswers())).toEqual([])
  })

  it('leave out the policy’s own applications, standing in for a text that named none', () => {
    const st = withDraftApps(thread().send('Sales need MFA'), ['hrms'])
    expect(st.reading.answers.apps).toEqual({ value: ['hrms'], origin: 'default', spans: [] })
    expect(turnView(st, 0, bodyOf(base), tenant).keys).toEqual(['who', 'signIn'])
    expect(saidKeys(st.reading.answers)).toEqual(['who', 'signIn'])
  })

  it('are, for a follow-up, only what it changed', () => {
    const t = thread()
    t.send(RISKY)
    t.answer(t.asks()[0].id, 'not:fp-corp-devices')
    t.skip(t.asks()[0].id)
    t.answer('ask:apps', 'hrms')
    t.send('Block anything else')
    expect(t.view(1).keys).toEqual(['fallback'])
    expect(t.view(1).change).toBe('Nothing else matched → Deny')
    /* The first turn keeps its rows, live: nothing later said them again. */
    expect(t.view(0).keys).toEqual(['apps', 'devices', 'signIn'])
    expect(t.view(0).past).toEqual([])
  })

  it('keep what an earlier turn said where a later message says it again', () => {
    const t = thread()
    t.send(CRM)
    t.answer(t.asks()[0].id, 'salesforce')
    t.send('Nadia Haddad needs a passkey on Jira')
    /* The follow-up names an application, an outcome and a person it asks about. */
    expect(t.st.turns[1].touched).toEqual(['apps', 'who', 'signIn'])
    const was = t.view(0)
    expect(was.past).toEqual(['apps', 'who', 'signIn'])
    expect(was.answers.apps.value).toEqual(['salesforce'])
    expect(was.answers.who.value).toEqual({ groupIds: ['sales'], userIds: [] })
    /* Answered: the present moves on, the first turn's rows do not. */
    t.answer(t.asks()[0].id, 'user:u-dev-2')
    expect(t.st.reading.answers.who.value).toEqual({ groupIds: ['sales'], userIds: ['u-dev-2'] })
    expect(t.view(0).answers.who.value).toEqual({ groupIds: ['sales'], userIds: [] })
    expect(t.view(1).past).toEqual([])
  })

  it('show a correction on the earlier turn’s row, and not a second time on the latest reply', () => {
    const t = thread()
    t.send(SALES)
    t.send('Block anything else')
    t.send('On a corporate device')
    expect(t.view(2).keys).toEqual(['devices'])
    /* Everyone else, changed from the second turn's chip. */
    const a = t.st.reading.answers
    t.set({ ...t.st, reading: { ...t.st.reading, answers: { ...a, fallback: { value: { decision: '2fa', method: null, message: null }, origin: 'picked', spans: [] } } } })
    expect(t.view(1).keys).toEqual(['fallback'])
    expect(t.view(1).past).toEqual([])
    expect(t.view(2).keys).toEqual(['devices'])
    /* The latest line still says everything its Undo would take back. */
    expect(t.view(2).change).toBe('Changed rule 1 · Nothing else matched → Allow with 2FA')
  })

  it('stay live in an earlier turn where no later message said them again', () => {
    const t = thread()
    t.send(SALES)
    t.send('On a corporate device')
    expect(t.st.turns[1].touched).toEqual(['devices'])
    expect(t.view(0).past).toEqual([])
  })
})

describe('the follow-ups offered above the composer', () => {
  it('wait for the first message', () => {
    expect(followUps(emptyDescribe(), tenant, dict)).toEqual([])
  })

  it('wait while a question is open', () => {
    const t = thread()
    t.send(RISKY)
    expect(followUps(t.st, tenant, dict)).toEqual([])
  })

  it('come from what the answers leave open, three at most', () => {
    const t = thread()
    t.send(EXAMPLES[0].text)
    /* Where and the last row were said: a device check and hours are left. */
    expect(followUps(t.st, tenant, dict)).toEqual(['On a corporate device', 'Between 09:00 and 18:00 on weekdays'])

    const r = thread()
    r.send(RISKY)
    r.answer(r.asks()[0].id, 'not:fp-corp-devices')
    r.skip(r.asks()[0].id)
    r.answer('ask:apps', 'hrms')
    const offered = followUps(r.st, tenant, dict)
    expect(offered).toEqual(['Between 09:00 and 18:00 on weekdays', 'Block anything else', 'From Corporate offices'])
    /* Each one reads as it stands: no question, nothing left out, and a change. */
    const baseline = read(r.st.text)
    for (const words of offered) {
      const next = read(extendText(r.st.text, words))
      expect(next.choices.length, words).toBeLessThanOrEqual(baseline.choices.length)
      expect(next.notAdded.length, words).toBeLessThanOrEqual(baseline.notAdded.length)
      expect(valuesOf(next.answers), words).not.toEqual(valuesOf(baseline.answers))
    }
  })
})

describe('a follow-up keeps the answers already given', () => {
  it('answers a question the text raised again with the same pick', () => {
    const t = thread()
    t.send(CRM)
    t.answer(t.asks()[0].id, 'salesforce')
    t.send('Block anything else')
    expect(openChoices(t.st.reading)).toEqual([])
    expect(t.st.reading.answers.apps.value).toEqual(['salesforce'])
  })

  it('carries Don’t add as Don’t add', () => {
    const r = read(RISKY)
    const skipped = skipChoice(r, openChoices(r)[1].id, dict)
    const next = carryPicks(skipped, read(extendText(RISKY, 'Block anything else')), dict)
    expect(next.notAdded.map((n) => n.span.phrase)).toEqual(['the risk profile is high'])
    expect(openChoices(next).map((c) => c.span.phrase)).toEqual(['unmanaged devices'])
  })

  it('asks again where the pick was another application, chosen by hand', () => {
    const r = read(CRM)
    const c = openChoices(r)[0]
    const other = c.options.find((o) => o.label === 'Another application')
    expect(other).toBeDefined()
    const next = carryPicks(answerAsk(r, c.id, other!.value, dict), read(extendText(CRM, 'Block anything else')), dict)
    expect(openChoices(next).map((x) => x.span.phrase)).toEqual(['the CRM'])
  })
})

describe('a turn taken back, in the board’s history', () => {
  const t = thread()
  const onDraft = (b: BoardBody): Policy => ({ ...base, rules: b.rules, fallback: b.fallback, checks: b.checks })
  t.send(SALES)
  const first = onDraft(t.board)
  t.send('On a corporate device')
  const second = onDraft(t.board)

  it('drops the opening’s entry when it goes back to the draft as it was', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, first, s))
    const out = revertDescribed(h, base, s)
    expect(out.hist.past).toEqual([])
    expect(out.hist.present).toBe(base)
    expect(out.session.wrote).toBe(false)
  })

  it('amends back to an earlier write of the same opening', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, first, s))
    ;({ hist: h, session: s } = writeDescribed(h, second, s))
    const out = revertDescribed(h, first, s)
    expect(out.hist.past).toEqual([base])
    expect(out.hist.present.rules).toBe(first.rules)
    expect(out.session.last).toBe(out.hist.present)
    /* And the board's own Undo still takes the whole opening back. */
    expect(undo(out.hist).present).toBe(base)
  })

  it('is a write like any other after another edit', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE)
    ;({ hist: h, session: s } = writeDescribed(h, second, s))
    h = commit(h, { ...h.present, rules: h.present.rules.map((r) => ({ ...r, name: 'Renamed' })) })
    const out = revertDescribed(h, first, s)
    /* The rename is kept, one step back. */
    expect(out.hist.past).toHaveLength(3)
    expect(out.hist.past.at(-1)).toBe(h.present)
    expect(out.hist.present.rules).toBe(first.rules)
    expect(out.session).toMatchObject({ wrote: true, last: out.hist.present })
  })

  it('changes nothing when the board is already there', () => {
    const h = historyOf(first)
    const s = describeSession(EVERYONE)
    const out = revertDescribed(h, { ...first }, s)
    expect(out.hist).toBe(h)
    expect(out.session).toBe(s)
  })

  it('round-trips a composed draft: written, then taken back to the draft it came from', () => {
    const ids: RuleIds = new Map()
    const answers = read(EXAMPLES[0].text).answers
    const { policy } = describedDraft(base, answers, tenant, ids)
    expect(describedDraft(base, answers, tenant, ids).policy.rules.map((r) => r.id)).toEqual(policy.rules.map((r) => r.id))
    const w = writeDescribed(historyOf(base), policy, describeSession(EVERYONE))
    const back = revertDescribed(w.hist, base, w.session)
    expect(back.hist.present).toBe(base)
    expect(back.hist.past).toEqual([])
  })
})

/* What the round trip compares, as describe-model.test.ts does: every id,
   the estimate, the name, the switch and the blank marker go, and a deny
   message unless the sentence quotes one. */
function stripRule(r: Rule, keepMessage: boolean): unknown {
  const { id: _id, matchEstimate: _m, name: _n, enabled: _e, pristine: _p, denyMessage, ...rest } = r
  void _id
  void _m
  void _n
  void _e
  void _p
  return {
    ...rest,
    when: { ...rest.when, cards: rest.when.cards.map(({ id: _k, ...k }) => (void _k, { ...k, conditions: k.conditions.map(({ id: _c, ...c }) => (void _c, c)) })) },
    ...(keepMessage && denyMessage ? { denyMessage } : null),
  }
}

/* What an example can say of its seeded policy. A sentence has one Who, so
   Describe gives every rule the same people. Developer tools has held a rule
   of Finance's own since TESTING-V4 §13 (the dual-group troubleshooting case,
   Maya Iyer), which no sentence can say — so its example reads to the rest:
   the rules whose Who is the first rule's, and the audience those rules name.
   Every other example is its whole policy. */
function asDescribed(p: Policy): Policy {
  const first = whoKey(p.rules[0]?.who)
  const rules = p.rules.filter((r) => whoKey(r.who) === first)
  if (rules.length === p.rules.length) return p
  const named = new Set(rules.flatMap((r) => r.who?.groupIds ?? []))
  return { ...p, rules, audience: { ...p.audience, groupIds: p.audience.groupIds.filter((g) => named.has(g)) } }
}

describe('the four examples, sent as the first message', () => {
  it('each reads to its seeded policy, asks nothing, and says what it added', () => {
    for (const ex of EXAMPLES) {
      const seeded = asDescribed(T.policies.find((p) => p.id === ex.policyId)!)
      const quoted = /[“"]/.test(ex.text)
      const t = thread()
      t.send(ex.text)
      expect(t.asks(), ex.label).toEqual([])
      expect(t.board.rules.map((x) => stripRule(x, quoted)), ex.label).toEqual(seeded.rules.map((x) => stripRule(x, quoted)))
      expect(t.board.fallback?.decision, ex.label).toBe(seeded.fallback?.decision)
      expect(t.st.reading.answers.apps.value, ex.label).toEqual(seeded.appIds)
      const n = seeded.rules.length
      expect(t.view(0).change, ex.label).toBe(`Added ${n} ${n === 1 ? 'rule' : 'rules'} · Nothing else matched → Deny`)
      expect(t.view(0).notAdded, ex.label).toEqual([])
    }
  })
})

/* --- 29 Sep review fixes ----------------------------------------------------------------- */

const HR_FINANCE = { everyone: false, groupIds: ['hr', 'finance'], userIds: [] }

describe('the text stays the admin’s own words', () => {
  it('keeps a gap filled by a question, and a correction made by hand, through a follow-up', () => {
    const t = thread()
    t.send(RISKY)
    t.answer(t.asks()[0].id, 'not:fp-corp-devices')
    t.answer(t.asks()[0].id, 'above:70')
    /* Which applications: no words carry the answer, so it is kept beside them. */
    t.set(corrected(t.st, answerAsk(t.st.reading, 'ask:apps', 'hrms', dict)))
    expect(t.st.text).toBe(RISKY)
    t.send('Everyone else needs 2FA')
    expect(t.st.text).toBe(`${RISKY}. Everyone else needs 2FA`)
    expect(t.st.reading.answers.apps.value).toEqual(['hrms'])
    /* The questions the text raised are answered again from its words. */
    expect(openChoices(t.st.reading)).toEqual([])
    /* A card quotes what was typed, never words the admin did not type. */
    const { sources } = describedDraft(base, t.st.reading.answers, tenant, new Map(), t.st.origin?.fallback)
    const quoted = Object.values(sources).join(' | ')
    expect(quoted).toContain('unmanaged devices')
    expect(quoted).not.toMatch(/Corporate devices|risk above/)
  })

  it('lets a later message that says the answer again win over the correction', () => {
    const t = thread()
    t.send(SALES)
    t.send('Block anything else')
    const a = t.st.reading.answers
    t.set(corrected(t.st, { ...t.st.reading, answers: { ...a, fallback: { value: { decision: '2fa', method: null, message: null }, origin: 'picked', spans: [] } } }))
    t.send('On a corporate device')
    expect(t.st.reading.answers.fallback.value?.decision).toBe('2fa')
    t.send('Block anything else')
    expect(t.st.reading.answers.fallback.value?.decision).toBe('deny')
    expect(t.st.overrides.fields.fallback).toBeUndefined()
  })

  it('puts the corrections back with the turn an Undo takes away', () => {
    const t = thread()
    t.send(SALES)
    t.set(corrected(t.st, { ...t.st.reading, answers: { ...t.st.reading.answers, fallback: { value: { decision: 'deny', method: null, message: null }, origin: 'picked', spans: [] } } }))
    const was = t.st.overrides
    t.send('On a corporate device')
    t.undo()
    expect(t.st.overrides).toBe(was)
  })
})

describe('a phrase not added', () => {
  it('is listed on the latest turn when a question an earlier message raised is set aside there', () => {
    const t = thread()
    t.send(RISKY)
    t.send('Only for Finance')
    const q = t.asks()[0]
    expect(q.question).toBe('Which device profile is “unmanaged devices”?')
    t.skip(q.id)
    expect(t.view(1).notAdded.map((n) => n.span.phrase)).toContain('unmanaged devices')
    expect(t.view(0).notAdded.map((n) => n.span.phrase)).not.toContain('unmanaged devices')
  })

  it('is one chip for “only from the Berlin branch”, not a second one for “only”', () => {
    const t = thread()
    t.send('Finance reach Workday only from the Berlin branch with Google Authenticator. Block anything else.')
    expect(t.view(0).notAdded.map((n) => n.span.phrase)).toEqual(['only from the Berlin branch'])
    /* And no refusal after a rule that checks nothing. */
    expect(t.board.rules.map((r) => r.name)).toEqual(['Finance'])
  })
})

describe('where the thread began', () => {
  it('is kept through a rewrite of its first message, after Done saved another audience', () => {
    const t = thread()
    t.send(EXAMPLES[0].text)
    const rewrite = sendTurn({ ...t.st, rewrite: 0 }, 'Everyone reaches HRMS with Google Authenticator', { dict, tenant, board: t.board, audience: HR_FINANCE })
    expect(rewrite.origin?.audience).toEqual(EVERYONE)
    const back = undoTurn(rewrite)!
    expect(back.state.origin?.audience).toEqual(EVERYONE)
    expect(back.state.turns.map((x) => x.said)).toEqual([EXAMPLES[0].text])
  })
})

describe('a write, beside rules added by hand', () => {
  it('never takes a rule away that no reading wrote', () => {
    const ids: RuleIds = new Map()
    const written = new Set<string>()
    const first = describedDraft(base, read(SALES).answers, tenant, ids, undefined, written).policy
    const hand = rule({ name: 'By hand' })
    const next = describedDraft({ ...first, rules: [...first.rules, hand] }, read(`${SALES}. On a corporate device`).answers, tenant, ids, undefined, written).policy
    expect(next.rules.map((r) => r.id)).toEqual([first.rules[0].id, hand.id])
    /* A card a reading wrote, which the next one does not, goes; the hand-made one stays. */
    expect(describedDraft(next, emptyAnswers(), tenant, ids, undefined, written).policy.rules).toEqual([hand])
  })
})

describe('the facts a move through the history hands back', () => {
  const left = { name: 'HRMS from Corporate offices', audience: HR_FINANCE, appIds: ['hrms'] }
  const landing = { name: 'Untitled policy', audience: EVERYONE, appIds: [] as string[] }

  it('are the landing entry’s, where the policy still has what Describe it left', () => {
    expect(factsBack(left, left, landing)).toEqual(landing)
  })

  it('keep a name typed on the bar since', () => {
    expect(factsBack({ ...left, name: 'Payroll access' }, left, landing)).toEqual({ ...landing, name: 'Payroll access' })
  })

  it('include the applications the toast’s Undo gives back', () => {
    let h = historyOf(base)
    let s = describeSession(EVERYONE, undefined, ['hrms'])
    ;({ hist: h, session: s } = writeDescribed(h, withRules('first'), s))
    expect(undoDescribed(h, h.present, s)?.appIds).toEqual(['hrms'])
  })
})
