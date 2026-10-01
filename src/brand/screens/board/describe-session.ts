import type { AccessDecision, Audience, Policy, Rule } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import {
  ANSWER_ORDER,
  NOT_SET,
  applyChoice,
  audienceOfAnswers,
  branchLabel,
  branchesOf,
  compose,
  emptyAnswers,
  nameOf,
  openChoices,
  readText,
  summaryOf,
  valuesOf,
  type AnswerKey,
  type BranchId,
  type Choice,
  type ChoiceOption,
  type DescribeAnswers,
  type DescribeTenant,
  type Dictionary,
  type NotAdded,
  type Origin,
  type Reading,
  type RuleIds,
} from '../../create/describe-model'
import { amend, commit, undo, type History } from '../history'

/* -----------------------------------------------------------------------------
   One Describe it session, as the board's history sees it.

   The panel rewrites the rules after every answer, and all of it is ONE thing
   to take back (describe spec, §4.8): the first write of a session commits,
   so the draft as it was before the panel is on the undo stack, and every
   later write amends the present in place. One Undo — the toolbar's, ⌘Z, or
   the toast's — returns to the draft as it was before the panel wrote
   anything.

   Amending is only safe while the present IS the session's last write. If
   something else moved the history in between — ⌘Z pressed with the panel
   open, a save, a fix from a guard page — amending would overwrite a state
   the session never wrote and lose it from the stack. So a write checks, and
   commits afresh when the present is not its own.

   The board (BoardBuilder.tsx) holds the state and does the saving; what it
   decides is here, as plain functions, so the door, the write, Done and the
   toast's Undo are each one call a test can make without a browser.
   -------------------------------------------------------------------------- */

export interface DescribeSession {
  /** A write reached the history this session. */
  wrote: boolean
  /** The policy's audience when the panel opened, for the toast's Undo. */
  audienceBefore: Audience
  /* The draft's last row when the panel opened: what a reading that says
     nothing about the rest leaves in place. Not the session's own earlier
     write — a text read again replaces what the text before it said. */
  fallbackBefore: Rule | undefined
  /** The present the session last wrote, by reference. */
  last: Policy | null
}

export const describeSession = (audienceBefore: Audience, fallbackBefore?: Rule): DescribeSession => ({ wrote: false, audienceBefore, fallbackBefore, last: null })

/* The rules, the last row and the checks they were tried with (describe spec,
   §4.8): the name, applications and audience are saved straight to the policy. */
const body = (p: Policy) => JSON.stringify({ rules: p.rules, fallback: p.fallback, checks: p.checks })

export function writeDescribed(h: History, next: Policy, s: DescribeSession): { hist: History; session: DescribeSession } {
  if (body(h.present) === body(next)) return { hist: h, session: s }
  const hist = s.wrote && s.last === h.present ? amend(h, next) : commit(h, next)
  return { hist, session: { ...s, wrote: true, last: hist.present } }
}

/** A name the product gave, which Describe it may replace with one from the answers. */
export const UNTITLED_NAME = /^Untitled policy( \d+)?$/

/* What the board holds for the visit (V4 §4.1): the thread, and the text and
   reading behind it. Closing the panel keeps all of it, so reopening shows
   the thread as it was. */
export interface DescribeState {
  /* The text the reading was read from: the admin's first message, extended
     by each follow-up — or, once an answer is changed by hand, the answers'
     own sentence (`sentenceOf`), so the next follow-up extends what the
     answers now say. Never shown; the bubbles show what was sent. */
  text: string
  reading: Reading
  /** The thread, oldest first. */
  turns: DescribeTurn[]
  /** The composer, as typed. */
  box: string
  /** The turn whose message the composer is rewriting (the bubble's pencil), or null. */
  rewrite: number | null
  /** Questions set aside with Don't add that no phrase raised: the applications, an outcome. */
  dismissed: string[]
  /* The policy before the thread's first turn: the audience the first turn's
     Undo gives back, and the last row a reading that says nothing about the
     rest leaves in place. Null while the thread is empty. */
  origin: { audience: Audience; fallback: Rule | undefined } | null
}
const emptyReading = (): Reading => ({ text: '', answers: emptyAnswers(), choices: [], notAdded: [], clauses: [] })
export const emptyDescribe = (): DescribeState => ({ text: '', reading: emptyReading(), turns: [], box: '', rewrite: null, dismissed: [], origin: null })

/* --- The door ------------------------------------------------------------------

   On a new draft only (describe spec, §2 and Assumption 5). The panel saves
   the audience straight to the policy at Done, and a direct write to one that
   decides sign-ins would skip the checks before saving — so a live policy with
   no rules keeps the two cards it had. `on` is the edition's flag, passed by
   name at the call site so the gate reads where it is used. */
export function describeOffered(on: boolean, p: Pick<Policy, 'status' | 'type' | 'isSystem'>): boolean {
  return on && p.status === 'draft' && p.type === 'App Access' && !p.isSystem
}

/* The Applications answer, when the text named none: the policy's own
   applications, as a default — so the answer and the start node agree, and a
   read that names no application never takes one away. */
export function withDraftApps(st: DescribeState, appIds: readonly string[]): DescribeState {
  const apps = st.reading.answers.apps
  if (apps.origin === 'text' || apps.origin === 'picked' || appIds.length === 0) return st
  /* Already the policy's own: the same state, so a keystroke in the box —
     which passes through here — leaves the reading, and everything computed
     from it, exactly as it was. */
  if (apps.origin === 'default' && apps.value?.join() === appIds.join()) return st
  return { ...st, reading: { ...st.reading, answers: { ...st.reading.answers, apps: { value: [...appIds], origin: 'default', spans: [] } } } }
}

/* --- A write --------------------------------------------------------------------

   The draft the answers make: the composed rules, and the composed last row
   when the answers give one — otherwise the last row the draft had when the
   panel opened (`lastRow`), exactly as it was. Everything else on the draft
   stays. `ids` keeps each card's id across recompositions, so the board moves
   a card rather than remounting it. */
export function describedDraft(
  draft: Policy,
  answers: DescribeAnswers,
  t: DescribeTenant,
  ids: RuleIds,
  lastRow: Rule | undefined = draft.fallback,
): { policy: Policy; sources: Record<string, string> } {
  const c = compose(answers, t, ids)
  return { policy: { ...draft, rules: c.rules, fallback: c.fallback ?? lastRow }, sources: c.sources }
}

/* --- Done ---------------------------------------------------------------------------

   What Done saves straight to the policy, once (describe spec, §3.9): a name
   from the answers while the policy still carries the one the product gave
   it, and the audience the answers describe. `taken` is every other policy's
   name, so two described drafts never share one. */
export function doneFacts(p: Policy, answers: DescribeAnswers, t: DescribeTenant, taken: readonly string[]): { name: string; audience: Audience } {
  return { name: UNTITLED_NAME.test(p.name) ? nameOf(answers, t, taken) : p.name, audience: audienceOfAnswers(answers) }
}

/** The toast Done shows when the session wrote anything. */
export const RULES_ADDED = 'Rules added. Not saved yet.'

/* The toast's Undo. It steps back over the session's one entry and hands back
   the audience from before the panel opened — but only while the session's
   write is still the present. After any other edit it would undo THAT, so it
   does nothing and the board says where the full history is (null), as
   `offerUndo` does. `chooser`: no rules are left, so the three cards return. */
export function undoDescribed(h: History, after: Policy, s: DescribeSession): { hist: History; audience: Audience; chooser: boolean } | null {
  if (h.present !== after) return null
  const hist = undo(h)
  return { hist, audience: s.audienceBefore, chooser: hist.present.rules.length === 0 }
}

/* --- The thread (V4 §4.1) ----------------------------------------------------------

   Describe it is a thread now: the admin's messages, and under each what the
   board made of it. A turn is one message sent. The first reads the text; a
   follow-up EXTENDS it and reads the whole again; a rewrite (the bubble's
   pencil) puts that message back in its place, and the turns after it go. A
   turn keeps what it needs to be taken back — the text, the reading and the
   board as they were before it — so its Undo is exact. The latest turn is
   drawn live; an earlier one is frozen when the next is sent (`done`), so it
   still says what it did then. */

/** The board as a turn found it: what the turn's Undo puts back. */
export interface BoardBody {
  rules: Rule[]
  fallback: Rule | undefined
  checks: Policy['checks']
}
export const bodyOf = (p: Policy): BoardBody => ({ rules: p.rules, fallback: p.fallback, checks: p.checks })

/** A question settled in a turn, as its one-line reply: “company laptop” → Corporate devices. */
export interface SettledAsk {
  key: string
  phrase: string
  answer: string
}

export interface TurnDone {
  keys: AnswerKey[]
  settled: SettledAsk[]
  notAdded: NotAdded[]
  change: string
}

export interface DescribeTurn {
  id: number
  /** The message, as its bubble shows it. */
  said: string
  /** Where this turn's words begin in the text it was read with. */
  at: number
  /** The text and reading before it; null before the first turn. */
  before: { text: string; reading: Reading } | null
  /** The board before it. */
  board: BoardBody
  /** Set when a later turn is sent: what this one did, as it stood then. */
  done?: TurnDone
  /* A rewrite's: the thread, the text, the reading and the board as they
     were before it, so its Undo puts the old version back rather than
     taking the message away. */
  replaced?: { turns: DescribeTurn[]; text: string; reading: Reading; board: BoardBody }
}

/** What a turn's reply draws. */
export interface TurnView extends TurnDone {
  latest: boolean
}

/* A follow-up's words join the text as a sentence of their own: after a
   full stop, a space; otherwise a full stop first — also after a closing
   quote, whose full stop is inside it and would not end the sentence. */
export function extendText(prev: string, add: string): string {
  const p = prev.trim()
  const n = add.trim()
  if (!p) return n
  if (!n) return p
  return `${p}${/[.!?]$/.test(p) ? ' ' : '. '}${n}`
}

const isSaid = (o: Origin | undefined) => o === 'text' || o === 'picked'

/** The answers the text said, or a question or a correction settled — never a default. */
export function saidKeys(a: DescribeAnswers): AnswerKey[] {
  const keys = new Set<AnswerKey>()
  if (isSaid(a.apps.origin)) keys.add('apps')
  if (isSaid(a.who.origin)) keys.add('who')
  const lo = a.leaveOut.value
  if (isSaid(a.leaveOut.origin) && lo && lo.groupIds.length + lo.userIds.length > 0) keys.add('leaveOut')
  if (isSaid(a.where.origin) || isSaid(a.when.origin)) keys.add('where')
  if (isSaid(a.devices.origin) || isSaid(a.risk.origin)) keys.add('devices')
  if (branchesOf(a).some((b) => isSaid(a.signIn[b]?.origin)) || a.more.some((m) => isSaid(m.outcome.origin))) keys.add('signIn')
  if (isSaid(a.fallback.origin)) keys.add('fallback')
  return ANSWER_ORDER.filter((k) => keys.has(k))
}

/* One answer's values, origins aside: what a follow-up is compared on. */
function sliceOf(k: AnswerKey, a: DescribeAnswers): unknown {
  const v = valuesOf(a) as Record<string, unknown>
  switch (k) {
    case 'apps':
      return v.apps
    case 'who':
      return v.who
    case 'leaveOut':
      return v.leaveOut
    case 'where':
      return [v.where, v.when, a.scopeSaid]
    case 'devices':
      return [v.devices, v.risk]
    case 'signIn':
      return [v.signIn, v.more, v.order]
    default:
      return v.fallback
  }
}

/* The rows a turn's reply shows: everything said, for the first; for a
   follow-up, only what it changed. */
export function turnKeys(before: DescribeAnswers | null, after: DescribeAnswers): AnswerKey[] {
  const now = saidKeys(after)
  if (!before) return now
  return now.filter((k) => JSON.stringify(sliceOf(k, before)) !== JSON.stringify(sliceOf(k, after)))
}

/* A rule compared on what it says: every id at every depth aside — the
   composer mints fresh ids for a card's condition groups on each reading —
   and the estimate the board keeps beside it. */
const ruleKey = (r: Rule | undefined) => (r ? JSON.stringify(r, (k, v: unknown) => (k === 'id' || k === 'matchEstimate' ? undefined : v)) : '')
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
const listed = (ns: number[]) => (ns.length <= 1 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`)

/* What a turn did to the board, in one line: the cards added, changed and
   removed, and the last row's new outcome. Cards are known by id — the
   composer keeps each card's id across readings — so a follow-up that adds
   a device check to rule 1 is "Changed rule 1", not a card added and one
   taken away. */
export function changeLine(before: BoardBody, after: BoardBody): string {
  const was = new Map(before.rules.map((r) => [r.id, r]))
  const now = new Set(after.rules.map((r) => r.id))
  const added = after.rules.filter((r) => !was.has(r.id)).length
  const removed = before.rules.filter((r) => !now.has(r.id)).length
  const changed = after.rules.flatMap((r, i) => (was.has(r.id) && ruleKey(was.get(r.id)) !== ruleKey(r) ? [i + 1] : []))
  const parts: string[] = []
  if (added > 0) parts.push(`Added ${plural(added, 'rule')}`)
  if (changed.length > 0) parts.push(`Changed ${changed.length === 1 ? 'rule' : 'rules'} ${listed(changed)}`)
  if (removed > 0) parts.push(`Removed ${plural(removed, 'rule')}`)
  if (after.fallback && ruleKey(before.fallback) !== ruleKey(after.fallback)) parts.push(`Nothing else matched → ${DECISION_WORDS[after.fallback.decision]}`)
  return parts.length > 0 ? parts.join(' · ') : 'No change'
}

/** The cards a write added or changed, by id, and 'fallback' for the last row: the 2 s accent edge. */
export function changedCards(before: BoardBody, after: BoardBody): string[] {
  const was = new Map(before.rules.map((r) => [r.id, r]))
  const ids = after.rules.filter((r) => ruleKey(was.get(r.id)) !== ruleKey(r)).map((r) => r.id)
  return after.fallback && ruleKey(before.fallback) !== ruleKey(after.fallback) ? [...ids, 'fallback'] : ids
}

/* --- Questions ---------------------------------------------------------------------

   One at a time (§4.1): the reader's open choices first, in the order the
   text raised them, then the two gaps a policy cannot go without and no
   phrase asked about — no application at all, and a branch with no outcome.
   Each has quick replies and, where it means something, Don't add. */

export const SKIP = '-'
/** What Don't add puts under Not added for a question that names no reason of its own. */
export const LEFT_OUT = 'Left out'

export interface Ask {
  /** The choice's id, or `ask:apps`, `ask:signIn:<branch>`, `ask:more:<n>`. */
  id: string
  question: string
  /** The one sign-in both rules would take, for the order question. */
  detail?: string
  options: ChoiceOption[]
  canSkip: boolean
  /** The order question: first match wins, said in its tip. */
  order: boolean
}

export function questionOf(c: Choice): string {
  const p = `“${c.span.phrase}”`
  switch (c.slot) {
    case 'apps':
      return `Which application is ${p}?`
    case 'who':
    case 'leaveOut':
      return `Who is ${p}?`
    case 'where':
      return `Which zone is ${p}?`
    case 'devices':
      return `Which device profile is ${p}?`
    case 'risk':
      return `Which risk score is ${p}?`
    case 'signIn':
      return `Which method is ${p}?`
    case 'order':
      return 'Which decides first?'
    default:
      return p
  }
}

const DECISIONS: ChoiceOption[] = (['1fa', '2fa', 'deny'] as AccessDecision[]).map((d) => ({ value: d, label: DECISION_WORDS[d] }))

export function asksOf(r: Reading, t: DescribeTenant, dismissed: readonly string[]): Ask[] {
  const a = r.answers
  const open = openChoices(r)
  const asks: Ask[] = open.map((c) => ({
    id: c.id,
    question: questionOf(c),
    detail: c.detail,
    options: c.options.filter((o) => o.value !== SKIP),
    canSkip: c.slot !== 'order',
    order: c.slot === 'order',
  }))
  const offer = (ask: Ask) => {
    if (!dismissed.includes(ask.id)) asks.push(ask)
  }
  if (summaryOf('apps', a, t) === NOT_SET && !open.some((c) => c.slot === 'apps')) {
    offer({ id: 'ask:apps', question: 'Which applications?', options: t.apps.map((p) => ({ value: p.id, label: p.name })), canSkip: true, order: false })
  }
  /* An outcome only once no question is still open about the rule it would finish. */
  if (open.length === 0) {
    const branches = branchesOf(a)
    for (const b of branches) {
      if (a.signIn[b]?.value) continue
      const label = branches.length > 1 ? branchLabel(b, a, t) : null
      offer({ id: `ask:signIn:${b}`, question: label ? `What happens: ${label.toLowerCase()}?` : 'What happens?', options: DECISIONS, canSkip: true, order: false })
    }
    a.more.forEach((m, k) => {
      if (!m.outcome.value) offer({ id: `ask:more:${k}`, question: `What happens: “${m.span.phrase}”?`, options: DECISIONS, canSkip: true, order: false })
    })
  }
  return asks
}

/* Don't add, on a question the reader asked. Where the choice carries its
   own Don't add (a place with no zone, an unmanaged device), that is the
   answer; otherwise the phrase goes under Not added and the answer it fed
   falls back to what it would have been without it. */
export function skipChoice(r: Reading, id: string, dict: Dictionary): Reading {
  const c = r.choices.find((x) => x.id === id)
  if (!c || c.slot === 'order') return r
  if (c.options.some((o) => o.value === SKIP)) return applyChoice(r, id, SKIP, dict)
  const choices = r.choices.map((x) => (x.id === id ? { ...x, picked: SKIP } : x))
  const notAdded = [...r.notAdded, { span: c.span, reason: c.notAddedReason ?? LEFT_OUT, action: c.notAddedAction }].sort((x, y) => x.span.start - y.span.start)
  const a: DescribeAnswers = { ...r.answers, signIn: { ...r.answers.signIn }, more: [...r.answers.more] }
  const moreAt = c.target.startsWith('more:') ? Number(c.target.slice(5)) : -1
  const stillOpen = choices.some((x) => x.slot === c.slot && x.target === c.target && x.picked === null)
  switch (c.slot) {
    case 'who': {
      if (stillOpen) break
      const v = a.who.value
      a.who = v && v !== 'everyone' && v.groupIds.length + v.userIds.length > 0 ? { value: v, origin: 'text', spans: a.who.spans } : { value: 'everyone', origin: 'default', spans: [] }
      break
    }
    case 'where':
      if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], where: { value: { mode: 'anywhere' }, origin: 'default', spans: [] } }
      else a.where = { value: { mode: 'anywhere' }, origin: 'default', spans: [] }
      break
    case 'devices':
      if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], devices: { value: { mode: 'any' }, origin: 'default', spans: [] } }
      else a.devices = { value: { mode: 'any' }, origin: 'default', spans: [] }
      break
    case 'risk':
      if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], risk: { value: { mode: 'any' }, origin: 'default', spans: [] } }
      else a.risk = { value: { mode: 'any' }, origin: 'default', spans: [] }
      break
    case 'signIn': {
      /* The method set aside: a second factor still, any enabled one. */
      const o = { value: { decision: '2fa' as const, method: null, message: null }, origin: 'picked' as const, spans: [c.span] }
      if (moreAt >= 0) a.more[moreAt] = { ...a.more[moreAt], outcome: o }
      else if (c.branch === 'fallback') a.fallback = o
      else a.signIn[c.branch ?? 'match'] = o
      break
    }
    default:
      /* The applications: the policy's own stand in, as when none is named. */
      break
  }
  return { ...r, answers: a, choices, notAdded }
}

/** A question answered: a choice through the reader, a gap filled directly. */
export function answerAsk(r: Reading, id: string, value: string, dict: Dictionary): Reading {
  if (id === 'ask:apps') return { ...r, answers: { ...r.answers, apps: { value: [value], origin: 'picked', spans: [] } } }
  const outcome = { decision: value as AccessDecision, method: null, message: null }
  if (id.startsWith('ask:signIn:')) {
    const b = id.slice('ask:signIn:'.length) as BranchId
    return { ...r, answers: { ...r.answers, signIn: { ...r.answers.signIn, [b]: { value: outcome, origin: 'picked', spans: r.answers.signIn[b]?.spans ?? [] } } } }
  }
  if (id.startsWith('ask:more:')) {
    const k = Number(id.slice('ask:more:'.length))
    return { ...r, answers: { ...r.answers, more: r.answers.more.map((m, i) => (i === k ? { ...m, outcome: { value: outcome, origin: 'picked', spans: m.outcome.spans } } : m)) } }
  }
  return applyChoice(r, id, value, dict)
}

/** The questions a reading settled, as one-line replies. */
export function settledOf(r: Reading): SettledAsk[] {
  return r.choices
    .filter((c) => c.picked !== null && c.picked !== '*')
    .map((c) => ({
      key: `${c.slot}|${c.span.phrase}`,
      phrase: c.span.phrase,
      answer: c.picked === SKIP ? 'Not added' : (c.options.find((o) => o.value === c.picked)?.label ?? c.picked ?? ''),
    }))
}

/* A follow-up reads the whole text again, so a question the text raised
   before comes back. One already answered keeps its answer: the same kind of
   question about the same words takes the same pick. "Another application"
   is not carried — what it led to was picked by hand. */
export function carryPicks(prev: Reading, next: Reading, dict: Dictionary): Reading {
  let r = next
  for (const c of next.choices) {
    if (c.picked !== null) continue
    const was = prev.choices.find((x) => x.picked !== null && x.picked !== '*' && x.slot === c.slot && x.span.phrase === c.span.phrase)
    if (!was?.picked) continue
    if (was.picked === SKIP) r = skipChoice(r, c.id, dict)
    else if (c.options.some((o) => o.value === was.picked)) r = applyChoice(r, c.id, was.picked, dict)
  }
  return r
}

/* --- Sending and taking back ---------------------------------------------------------- */

function viewOf(turn: DescribeTurn, reading: Reading, board: BoardBody, earlier: readonly DescribeTurn[], t: DescribeTenant, latest: boolean): TurnView {
  const seen = new Set(earlier.flatMap((x) => x.done?.settled.map((s) => s.key) ?? []))
  return {
    keys: turnKeys(turn.before?.reading.answers ?? null, reading.answers),
    settled: settledOf(reading).filter((s) => !seen.has(s.key)),
    notAdded: [...reading.notAdded.filter((n) => n.span.start >= turn.at), ...compose(reading.answers, t).notAdded],
    change: changeLine(turn.board, board),
    latest,
  }
}

/** Turn `i` as its reply draws it: the latest live, an earlier one as it was frozen. */
export function turnView(st: DescribeState, i: number, board: BoardBody, t: DescribeTenant): TurnView {
  const turn = st.turns[i]
  const latest = i === st.turns.length - 1
  if (!latest && turn.done) return { ...turn.done, latest: false }
  return viewOf(turn, st.reading, board, st.turns.slice(0, i), t, latest)
}

/* A message sent. `board` is the board as it stands, which the previous
   turn is frozen against; `audience` the policy's, kept as the thread's
   origin on its first turn. The board write is the caller's: it composes
   the returned reading, as it does after any answer. */
export function sendTurn(
  st: DescribeState,
  message: string,
  ctx: { dict: Dictionary; tenant: DescribeTenant; board: BoardBody; audience: Audience },
): DescribeState {
  const said = message.trim()
  if (!said) return st
  const k = st.rewrite !== null && st.rewrite < st.turns.length ? st.rewrite : null
  const kept = k === null ? st.turns : st.turns.slice(0, k)
  const base = k === null ? { text: st.text, reading: st.reading } : st.turns[k].before
  const board = k === null ? ctx.board : st.turns[k].board
  const first = kept.length === 0
  const text = first ? said : extendText(base?.text ?? '', said)
  const fresh = readText(text, ctx.dict)
  const reading = first || !base ? fresh : carryPicks(base.reading, fresh, ctx.dict)
  /* Appending freezes the turn before; a rewrite keeps the ones before it as they were. */
  const turns = kept.map((turn, i) =>
    k === null && i === kept.length - 1 && !turn.done ? { ...turn, done: viewOf(turn, st.reading, ctx.board, kept.slice(0, i), ctx.tenant, false) } : turn,
  )
  const id = st.turns.reduce((n, x) => Math.max(n, x.id), 0) + 1
  const replaced = k === null ? undefined : { turns: st.turns, text: st.text, reading: st.reading, board: ctx.board }
  return {
    ...st,
    text,
    reading,
    box: '',
    rewrite: null,
    turns: [...turns, { id, said, at: text.length - said.length, before: first ? null : base, board, ...(replaced ? { replaced } : null) }],
    origin: first ? { audience: ctx.audience, fallback: board.fallback } : st.origin,
  }
}

/* The latest turn's Undo: the text, the reading and the board as they were
   before it. The turn before becomes the latest again, drawn live. A
   rewrite's puts back the version it replaced, turns and all. `first`: the
   thread is empty now, and the board goes back to the chooser. */
export function undoTurn(st: DescribeState): { state: DescribeState; board: BoardBody; first: boolean } | null {
  const last = st.turns.at(-1)
  if (!last) return null
  if (last.replaced) {
    const was = last.replaced
    return { state: { ...st, turns: was.turns, text: was.text, reading: was.reading, rewrite: null }, board: was.board, first: false }
  }
  const rest = st.turns.slice(0, -1)
  const prev = rest.at(-1)
  const turns = prev ? [...rest.slice(0, -1), { ...prev, done: undefined }] : []
  const back = last.before ?? { text: '', reading: emptyReading() }
  const first = turns.length === 0
  return {
    state: { ...st, text: back.text, reading: back.reading, turns, rewrite: null, origin: first ? null : st.origin, dismissed: first ? [] : st.dismissed },
    board: last.board,
    first,
  }
}

/* A turn's Undo, in the board's history. While the session's write is the
   present, its one entry is amended back — and when that is the draft as it
   was before the session wrote, the entry goes, so the step before it is the
   present again and the session has written nothing. After any other edit
   it is a write like any other. */
export function revertDescribed(h: History, to: Policy, s: DescribeSession): { hist: History; session: DescribeSession } {
  if (body(h.present) === body(to)) return { hist: h, session: s }
  if (s.wrote && s.last === h.present) {
    const prev = h.past.at(-1)
    if (prev && body(prev) === body(to)) return { hist: { past: h.past.slice(0, -1), present: prev, future: [] }, session: { ...s, wrote: false, last: null } }
    const hist = amend(h, to)
    return { hist, session: { ...s, last: hist.present } }
  }
  const hist = commit(h, to)
  return { hist, session: { ...s, wrote: true, last: hist.present } }
}

/* --- Follow-ups ------------------------------------------------------------------------

   Up to three, above the composer, from what the answers leave open: no
   device check, no hours, nothing said about everything else, no place.
   Each is words the reader takes as they stand, tried on the text before it
   is offered — one that would add a Not added, raise a question, or change
   nothing is not offered. None while a question is open. */
const singular = (name: string) => name.replace(/s$/i, '')

export function followUps(st: DescribeState, t: DescribeTenant, dict: Dictionary): string[] {
  if (st.turns.length === 0 || openChoices(st.reading).length > 0) return []
  const a = st.reading.answers
  const groups: string[][] = []
  if (!isSaid(a.devices.origin)) groups.push(t.fingerprints.map((p) => `On a ${singular(p.name).toLowerCase()}`))
  if (!isSaid(a.when.origin)) groups.push(['Between 09:00 and 18:00 on weekdays'])
  if (!isSaid(a.fallback.origin) && !a.only) groups.push(['Block anything else'])
  if (!isSaid(a.where.origin)) groups.push(t.zones.map((z) => `From ${z.name}`))
  const baseline = readText(st.text, dict)
  const was = JSON.stringify(valuesOf(baseline.answers))
  const out: string[] = []
  for (const group of groups) {
    if (out.length === 3) break
    const ok = group.find((words) => {
      const r = readText(extendText(st.text, words), dict)
      return r.notAdded.length <= baseline.notAdded.length && r.choices.length <= baseline.choices.length && JSON.stringify(valuesOf(r.answers)) !== was
    })
    if (ok) out.push(ok)
  }
  return out
}
