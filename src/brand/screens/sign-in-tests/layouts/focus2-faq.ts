import type { User } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { watchingSentence } from '../../watching-words'
import type { WatchedResult } from '../../tenant-resolver'
import type { FormField } from '../../testing/sign-in-form'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import { eachGroupRows } from '../journey'
import { personPick } from '../sign-in-card'
import { fixPossessive } from './focus-voice'
import { plain, type Answer, type AskProps, type ChipId, type Part, type Target, type Tone } from './assistant/intents'
import { sourceOfPlan, toneOfPlan, wordsOfPlan } from './assistant/what-if'
import type { RunIdentity } from './types'

/* -----------------------------------------------------------------------------
   FOCUS v2 — THE ANSWERS PANEL, ITS QUESTION MODEL (focus2-ask.tsx draws it).

   WHAT WAS WRONG. The canvas carried the assistant dock, whose row 1 is a free
   text field — "Ask about this sign-in…". Behind it is a fixed reader of the
   tenant's own names and a keyword ladder that ends in `{ kind: 'unknown' }`.
   So the field advertised a general answerer that nothing behind it is, and in
   a security console that is a correctness defect and not a style one: every
   honest failure still reads as a system that tried and could not. Meanwhile
   the questions this page CAN answer truthfully — from the run itself — were
   hidden behind at most four small rows that only appeared once the chat was
   opened.

   WHY THIS IS RIGHT. The open text is gone, and the answerable questions are
   offered as presses. The whole safety argument is one rule:

     A QUESTION IS OFFERED ONLY WHEN ITS ANSWER EXISTS.

   The list is built by FILTERING THE PLAN, never by templating a sentence.
   That is `brief-how.ts`'s own property — "a section only when it has
   something true to say" — and it is why the richest sources are each gated
   on the field that may not be there: `plan.conflicts` is set only once a
   policy decides, `plan.asEachGroup` only for a person in two or more groups,
   and `plan.outcome.view.watching` is empty unless a monitor would decide
   this sign-in differently.

   Every row but two is an existing `ChipId`, so its answer is `answer()`'s own
   composition over the engine's result — not a second set of words that could
   drift from it. `intentOfChip` is total over the ids below, so a press can
   never reach the honest-but-useless `{ known: false }` fallback.

   THE TWO EXCEPTIONS are composed here, because no dock intent answers them
   and `assistant/` is not ours to edit. `faq:watching` (§ watchingAnswer)
   carries its own guard test: every word of it is either one of this file's
   fixed phrases or a field of `WatchedResult`, said by `watching-words.ts`.
   `faq:each` (§ eachAnswer, owner 5 Oct 2026: several identities in one Run,
   "one run each, switch") reads only the identities' own plans — every one a
   real run of that identity, made by the host as the one on screen is — in
   the words the previews already say a plan in (what-if.ts).

   THREE PRIVATE HELPERS OF `intents.ts` ARE RE-DERIVED HERE — `missedBefore`,
   `readOf` and `unstatedFields` — because they are not exported. They must
   match it exactly: a row built on a looser rule would offer a question whose
   answer is the "there is no rule n" branch, which is a question the admin
   asked being answered with a correction. The tests pin them against real
   runs rather than against the copy.

   PURE, and components-free on purpose: the answers can be swept over every
   showcase sign-in without rendering anything (focus2-faq.test.ts), and oxlint
   keeps its baseline because nothing but components is exported from a .tsx.
   -------------------------------------------------------------------------- */

// --- The panel's geometry, one source each --------------------------------------------------

/** The panel's width when it is open. Consumed in exactly two places in Focus2Layout (`useRoom`, `pad.left`). */
export const FOCUS2_ASK_W = 320
/** The rail's width when it is shut. It takes its room rather than floating, so a receded card can never slide under it. */
export const FOCUS2_ASK_RAIL = 36
/* Measured in the browser at localhost:5181, Maya Iyer → AWS Console, the showcase tenant:
     · `room.w` is capped at 1480, so while `.rstage` is at least 1480 + 32 + 320 = 1832 wide the panel costs the
       path nothing at all. The owner's own pane measured 1838.
     · At 1440×900 with Configure shut, `.rstage` is 1376 wide → `room.w` 1024, which is over COMPACT_ROOM (1000),
       so the receded cards keep their full far faces. 344 is the widest that holds that; 320 is the round number
       under it.
     · At 1280×800 with Configure shut, `room.w` is 864 — above FOCUS2_PATH_MIN. */

/* The width the path is drawn at before the canvas has been measured: the 1080 it had before the panel existed,
   plus the panel's own, so the FIRST PAINT is the picture it always was and the panel is open on it (1080 is over
   FOCUS2_PATH_MIN). layouts-render.test.tsx renders Focus v2 with `renderToStaticMarkup` and no effect of ours ever
   runs there, so this seed is the whole of what that suite sees. */
export const FOCUS2_ROOM_SEED = 1080 + FOCUS2_ASK_W

/** The canvas's room on top (Focus2Layout's `pad.top`), and the panel's own top. It was 64 while the sign-in row stood
    over the canvas; the row is the chain's first node now (owner, 5 Oct 2026), so it is the path's own inset. */
export const FOCUS2_TOP_PAD = 16
/** The path's room either side, and the panel's left inset. */
export const FOCUS2_SIDE_PAD = 16
/* The room under the world. It was 72 for the voice strip (36 + 16 off the floor + 20 of air); the voice now stands
   in the bar under the open card, inside the world, so only the air is left (owner, 5 Oct 2026). */
export const FOCUS2_FLOOR_PAD = 24

/* The narrowest path worth keeping the panel open beside: the landed answer card whole plus one receded neighbour
   a side. answerWidth(cardWidth floor 360) = 547, + 2 × EDGE (4) = 555, + 2 × (TUCK_MAX · 176 + NEAR_GAP) = 188.
   The clamp floor on `room.w` is 560, below this, so a floored width can never fake a pass. */
export const FOCUS2_PATH_MIN = 743

// --- The shape ------------------------------------------------------------------------------

/** The rows not routed through `answer()`: § watchingAnswer and § eachAnswer compose them here. */
export const FAQ_WATCHING = 'faq:watching'
export const FAQ_EACH = 'faq:each'

export type FaqAsk = ChipId | typeof FAQ_WATCHING | typeof FAQ_EACH

export interface FaqRow {
  /** Stable, and the same as `ask`: the panel marks an asked row by it. */
  id: string
  ask: FaqAsk
  /** The question in admin English, sentence case: "Why denied?", "What will Maya see?". */
  label: string
}

export type FaqGroupKey = 'what' | 'each' | 'policy' | 'rule' | 'change' | 'who' | 'see' | 'app'

export interface FaqGroup {
  key: FaqGroupKey
  title: string
  rows: FaqRow[]
}

/** The groups, in the order an admin thinks. Nouns, because a heading files and a row asks: with the headings written as
 *  questions too ("Why this rule") the owner could not tell which line was the question (5 Oct). */
const TITLES: Record<FaqGroupKey, string> = {
  what: 'Decision',
  each: 'Identities',
  policy: 'Policies',
  rule: 'Rules',
  change: 'Changes',
  who: 'Groups',
  see: 'Sign-in screens',
  app: 'Application',
}

/** At rest a group shows its heading and this many rows; one "Show all" opens the rest in place. */
export const FAQ_AT_REST = 2

// --- Re-derived from intents.ts (not exported there) ----------------------------------------

/** intents.ts:280 — the rules before the walk stopped that did not match, in order. */
const missedBefore = (plan: EngineRun): EngineRule[] => plan.rules.slice(0, plan.landing ?? plan.rules.length).filter((r) => r.index !== null && r.visited && r.state === 'no-match')

/** intents.ts:287 — the rows the engine read in a rule. */
const readOf = (r: EngineRule): CheckRow[] => r.checks.slice(0, Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0))

/** intents.ts:304 — the facts' form fields that would settle a Depends, each once, in the order they matter. */
function unstatedFields(plan: EngineRun): FormField[] {
  const out: FormField[] = []
  for (const r of plan.rules) {
    if (!r.visited) continue
    for (const c of readOf(r).concat(r.state === 'unknown' ? r.checks : [])) if (c.status === 'unknown' && c.missing && !out.includes(c.missing)) out.push(c.missing)
  }
  return out
}

/** intents.ts:313 — the word `addOf` says for a field, so the label and the answer name the same thing. */
const FIELD_WORD: Partial<Record<FormField, string>> = { device: 'device', address: 'network', place: 'place', when: 'time', risk: 'risk score', person: 'person', app: 'application', 'assume-on': 'policy assumed on' }
const fieldWord = (f: FormField) => FIELD_WORD[f] ?? 'sign-in'
/** intents.ts:315 — which check rows a field states. */
const FIELD_CATS: Partial<Record<FormField, readonly CheckRow['category'][]>> = { device: ['device'], address: ['network', 'place'], place: ['place', 'network'], when: ['time'], risk: ['risk'] }

/** intents.ts:320 — the live policies, after the one that decides, that also cover this person. */
const alsoCovers = (plan: EngineRun): number => {
  const covers = new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId))
  return plan.policies.filter((p) => !p.decides && covers.has(p.policyId)).length
}
/** intents.ts:325 — the policies the scan asked that do not cover them. */
const missedByScan = (plan: EngineRun): number => {
  const covers = new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId))
  return plan.policies.filter((p) => !p.decides && !covers.has(p.policyId) && p.scanned && !p.isGlobalDefault).length
}

const ruleNo = (r: EngineRule) => (r.index ?? 0) + 1

/* "Maya" for a label, "them" for a group or a run with no name: `ctxOf`'s own `first`, kept to the one word a
   question can carry. */
function firstWord(plan: EngineRun, props: AskProps): string {
  if (props.asGroup) return 'them'
  const name = plan.conflicts?.personName || plan.asEachGroup?.personName || ''
  return name.trim().split(/\s+/)[0] || 'them'
}

// --- The list -------------------------------------------------------------------------------

const row = (ask: FaqAsk, label: string): FaqRow => ({ id: ask, ask, label })

/* Group 1 — What happened. The first row's words follow the outcome, exactly as the dock's own opening words it;
   the rest are offered only where their answer is more than a second telling of it. */
function whatGroup(plan: EngineRun): FaqRow[] {
  const out: FaqRow[] = []
  const o = plan.outcome
  const decider = plan.decider
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const decided = !!decider && o.status === 'decided' && !!o.decision && !!landing
  /* No decider, or a resolution that never settled: `answer('ask:why')` is `noDecider`, which names the policies
     asked and each one's reason. Honest, and never blank — but it is not a "why allowed". */
  if (!decided) out.push(o.status === 'depends' ? row('ask:depends', 'Why does it depend?') : row('ask:why', 'Why does no policy decide?'))
  else out.push(row('ask:why', o.decision === 'deny' ? 'Why denied?' : 'Why allowed?'))

  /* Which checks: the deciding rule's rows, or — on a Depends — the rules that cannot tell and theirs. With no rows
     either way, `checksOf` falls back to the rules before the last row, which is question 1 said again. */
  const unknownRules = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'unknown')
  if (decider && ((landing && landing.index !== null && landing.checks.length > 0) || (o.status === 'depends' && unknownRules.length > 0))) out.push(row('ask:checks', 'Which checks did it read?'))

  /* There is NO "Which policy decided?" row. `ask:policy` answers with the same sentence as question 1 ("Why
     allowed?"), only focused on the policy card instead of the rule, so offering both was one fact told twice in
     the same list. The policy is already named in question 1's answer and cited there: pressing the citation
     brings its card to the centre, which is all the second row added. */
  return out
}

/* Group 1½ — Several identities in one Run: one row, right under the decision, because it is why the admin picked
   more than one. Gated on the identities the Run covered, never on `asGroup` — a group can be one of them. */
function eachGroup(identities: readonly RunIdentity[] | null | undefined): FaqRow[] {
  return (identities?.length ?? 0) >= 2 ? [row(FAQ_EACH, 'What does each one get?')] : []
}

/* Group 2 — Why this policy. */
function policyGroup(plan: EngineRun, props: AskProps): FaqRow[] {
  const out: FaqRow[] = []
  const decider = plan.decider
  if (!decider) return out
  if (decider.isGlobalDefault) out.push(row('ask:gd', 'Why the Global Default?'))
  else {
    const conflictFindings = (plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').length
    const something = alsoCovers(plan) > 0 || (plan.conflicts?.policies.length ?? 0) > 0 || conflictFindings > 0 || missedByScan(plan) > 0
    if (something) out.push(row('ask:others', props.asGroup ? 'Which other policies cover them?' : `Who else covers ${firstWord(plan, props)}?`))
  }
  /* Monitoring policies that would decide this sign-in themselves: `differingWatch` has already dropped every one
     that would agree or would still yield, so an empty array means there is nothing to say. */
  if (plan.outcome.view.watching.length > 0) out.push(row(FAQ_WATCHING, 'Is anything watching this sign-in?'))
  if ((plan.conflicts?.off.length ?? 0) > 0) out.push(row('ask:off', 'Would a switched-off policy change this?'))
  return out
}

/* Group 3 — Why this rule: one row per rule the engine has something to say about, in rule order.

   THE LABEL IS NEUTRAL AND THE HEDGE LIVES IN THE ANSWER. `whyRule` says "might also apply" for a rule whose trace
   could not be told and "also applies" only for one that matched; a label that asserted either would turn a hedge
   into a claim about access. */
function ruleGroup(plan: EngineRun): FaqRow[] {
  if (!plan.decider) return []
  const clash = new Set((plan.conflicts?.rules ?? []).map((c) => c.ruleId))
  const missed = new Set(missedBefore(plan).map((r) => r.id))
  const out: { n: number; r: FaqRow }[] = []
  for (const r of plan.rules) {
    if (r.index === null) continue
    const n = ruleNo(r)
    const id: ChipId = `ask:why:${n}`
    if (missed.has(r.id)) out.push({ n, r: row(id, `Why not rule ${n}?`) })
    else if (r.visited && r.state === 'unknown') out.push({ n, r: row(id, `Why can't rule ${n} tell?`) })
    /* A switched-off rule is NOT asked about `visited`: `engineRun` stores one as `visited: false` by construction
       (engine-run.ts:845 — nothing is asked of it), so a gate of `visited && state === 'off'` could never be true
       and the row would be dead. `whyRule`'s own off branch reads only the state. */
    else if (r.state === 'off') out.push({ n, r: row(id, `Why was rule ${n} skipped?`) })
    /* Only a rule the resolver actually traced: `EngineRun` carries no trace of its own, so for any other later
       rule there is nothing to say but that it was not read — and `conflicts.rules` has already dropped every rule
       whose trace says it would not have matched. */
    else if (r.state === 'not-reached' && clash.has(r.id)) out.push({ n, r: row(id, `Why wasn't rule ${n} used?`) })
  }
  return out.sort((a, b) => a.n - b.n).map((x) => x.r)
}

/* Group 4 — What would change it. */
function changeGroup(plan: EngineRun, props: AskProps): FaqRow[] {
  const out: FaqRow[] = []
  if (props.whatIfs?.some((w) => w.changed)) out.push(row('ask:change', 'What would change the answer?'))
  /* One row per unstated fact, the first two. Gated on `addOf`'s OWN reading of it — a rule it reached that cannot
     tell because of this field — so the answer is always the "not stated, so rule n can't tell" branch and never
     the stated-value one. */
  let added = 0
  for (const f of unstatedFields(plan)) {
    const cats = FIELD_CATS[f] ?? []
    const cantTell = plan.rules.some((r) => r.visited && r.state === 'unknown' && r.checks.some((c) => cats.includes(c.category) && c.status === 'unknown'))
    if (!cantTell) continue
    out.push(row(`ask:add:${f}`, `What happens without the ${fieldWord(f)}?`))
    added += 1
    if (added === 2) break
  }
  return out
}

/* Group 5 — Who else is affected. Every row of the answer is a REAL resolution of a probe member of that group
   alone (conflicts.ts), so a row can never say something the engine would not. */
function whoGroup(plan: EngineRun, props: AskProps): FaqRow[] {
  if (props.asGroup) return []
  if (!eachGroupRows(plan)) return []
  if ((plan.asEachGroup?.groups.length ?? 0) < 2) return []
  return [row('ask:group', 'What does each group get?')]
}

/* Group 6 — What they will see. */
function seeGroup(plan: EngineRun, props: AskProps): FaqRow[] {
  const out: FaqRow[] = []
  if ((props.screens?.length ?? 0) > 0) out.push(row('ask:see', props.asGroup ? 'What will they see?' : `What will ${firstWord(plan, props)} see?`))
  return out
}

/* Group 7 — The application. The break-in answer is app-wide: `breakInOf` reads the attempt deck run over the
   APPLICATION, not this person's sign-in. It sat under "What they will see", which made an application-wide result
   read as part of this person's story — a claim about the sign-in that nothing in the run backs. It has its own
   group, and its label says what it is about. */
function appGroup(props: AskProps): FaqRow[] {
  return props.breakIn ? [row('ask:breakin', 'How did break-in attempts on this application go?')] : []
}

/**
 * The questions this run can answer, grouped, in the order an admin thinks. Only groups with a row; `[]` for an empty
 * plan. `identities` is the Run's (RunLayoutProps.identities): two or more add "What does each one get?".
 */
export function faqOf(plan: EngineRun, props: AskProps, identities: readonly RunIdentity[] | null = null): FaqGroup[] {
  try {
    if (plan.empty) return []
    const all: [FaqGroupKey, FaqRow[]][] = [
      ['what', whatGroup(plan)],
      ['each', eachGroup(identities)],
      ['policy', policyGroup(plan, props)],
      ['rule', ruleGroup(plan)],
      ['change', changeGroup(plan, props)],
      ['who', whoGroup(plan, props)],
      ['see', seeGroup(plan, props)],
      ['app', appGroup(props)],
    ]
    return all.filter(([, rows]) => rows.length > 0).map(([key, rows]) => ({ key, title: TITLES[key], rows }))
  } catch {
    /* A plan it cannot read offers nothing, never a throw — as `suggestionsFor` does. */
    return []
  }
}

/**
 * The two questions worth putting under the verdict: the decider's "why", then "What does each one get?" when the Run
 * covered several identities, then "What would change the answer?" when previews exist, then "What does each group
 * get?" for a person in more than one group, then whatever comes first. Each is a row `faqOf` already offered, so its
 * answer exists — "each one" only where `faqOf` was handed two or more identities. `on` is the row the panel head is
 * already showing: it is never offered again. At most two; fewer when the list is short.
 */
export function topQuestions(faq: readonly FaqGroup[], plan: Pick<EngineRun, 'asEachGroup'>, on: string | null = null): FaqRow[] {
  const all = faq.flatMap((g) => g.rows).filter((r) => r.id !== on)
  const out: FaqRow[] = []
  const take = (r: FaqRow | undefined) => {
    if (r && !out.includes(r) && out.length < 2) out.push(r)
  }
  take(all.find((r) => r.ask === 'ask:why') ?? all.find((r) => r.ask === 'ask:depends'))
  take(all.find((r) => r.ask === FAQ_EACH))
  take(all.find((r) => r.ask === 'ask:change'))
  if ((plan.asEachGroup?.groups.length ?? 0) > 1) take(all.find((r) => r.ask === 'ask:group'))
  for (const r of all) take(r)
  return out
}

// --- The locally-composed answers: what is watching --------------------------------------

/* The lead, by what the watchers can say and what the run itself decided.

   WHAT WAS WRONG. "would decide it differently" was said whenever every watcher had a decision. But "differently"
   is a comparison with the run's own decision, and on a Depends the run has none (`outcome.decision` is null): a
   watcher's decision set against nothing is not "different", it is just a decision. In an access console that
   over-claims a conflict the engine never found.

   WHY THIS IS RIGHT. Three leads, each claiming only what is known. "differently" only where every watcher has a
   decision AND the run has a definite one to differ from; "would decide it" where every watcher has a decision and
   the run has none; the plain "is watching" where some watcher cannot tell (`differingWatch` keeps a monitor that
   cannot tell how it would decide, and the line under the lead says which it is). */
export function watchingLead(n: number, allSay: boolean, runDecides: boolean): string {
  const who = n === 1 ? 'One policy is' : `${n} policies are`
  if (!allSay) return `${who} watching this sign-in: `
  return runDecides ? `${who} watching this sign-in and would decide it differently: ` : `${who} watching this sign-in and would decide it: `
}

/** The punctuation this file joins names with: everything else in the answer is a field of the run. */
export const WATCHING_JOINS: readonly string[] = ['.', ', ', ' and ', ' ']

/**
 * "Is anything watching this sign-in?" — the one answer not routed through `answer()`: no dock intent answers it,
 * and `assistant/intents.ts` may not be edited to add one. Null when nothing is watching.
 */
export function watchingAnswer(plan: EngineRun): Answer | null {
  const ws: readonly WatchedResult[] = plan.outcome.view.watching
  if (ws.length === 0) return null
  const drawn = (id: string) => plan.policies.some((p) => p.policyId === id)
  const named = (w: WatchedResult): Part => (drawn(w.policyId) ? { text: w.policyName, cite: policyCite(w.policyId), tone: 'notice' } : { text: w.policyName })
  const sentence: Part[] = [{ text: watchingLead(ws.length, ws.every((w) => w.decision !== null), plan.outcome.status === 'decided' && !!plan.outcome.decision) }]
  ws.forEach((w, i) => {
    if (i > 0) sentence.push({ text: i === ws.length - 1 ? ' and ' : ', ' })
    sentence.push(named(w))
  })
  sentence.push({ text: '.' })
  const first = ws[0]
  return {
    id: FAQ_WATCHING,
    kind: 'policy',
    ask: 'Is anything watching this sign-in?',
    sentence,
    /* One line per watcher, `watchingSentence`'s own words. `watchingWords(w).yields` — "When on: X applies first"
       — is deliberately NOT drawn: it is set only for a monitor that would NOT decide, and `differingWatch` has
       already dropped those, so a line for it could never appear. A branch that cannot fire is a claim nobody can
       check. */
    more: ws.map((w) => [{ text: watchingSentence(w) }, { text: '.' }]),
    tone: 'notice',
    ...(drawn(first.policyId) ? { focus: policyCite(first.policyId) } : {}),
    actions: drawn(first.policyId) ? [{ kind: 'openPolicy', policyId: first.policyId, label: 'Open policy' }] : [],
    acts: false,
    known: true,
    say: plain(sentence),
  }
}

const policyCite = (id: string): Target => `policy:${id}`

// --- The identities of one Run, side by side -----------------------------------------------

/* "What does each one get?" — the Run covered several identities (owner, 5 Oct 2026: "one run each, switch") and the
   canvas tells one at a time. Every identity's `plan` is a real run of it, made by the host by the same pipeline as the
   one on screen (TryJourney.tsx), so nothing here is worked out: it is read off those plans, in the words the previews
   already say a plan in (what-if.ts `wordsOfPlan`, `sourceOfPlan`).

   THE LEAD CLAIMS ONLY THE COMPARISON. "They all get Allow with 2FA." where every identity's answer is the same words,
   else "They don't all get the same answer." — never which one is "right". The lines under it say each one, in pick
   order: "Finance (tested as Priya Sharma): Allow with 2FA · AWS billing for Finance · rule 1".

   HONEST ABOUT A GROUP. A group is run as one of its members — the probe the canvas says "Tested as" (`personPick`) —
   so its line names that person. "Finance gets …" alone would claim the whole group was resolved.

   ONLY THE ONE ON THE CANVAS IS CITED: its name lights the sign-in, its answer the outcome card. The others' cards are
   not on the canvas — the chips in the row are the way there — so a citation of theirs would light the wrong one. No
   actions, for the same reason: the chips switch. */

/** The lead, by whether every identity's answer is the same words — said from the first one's plan, which is then all of theirs. */
function eachLead(same: boolean, plan: EngineRun): Part[] {
  if (!same) return [{ text: "They don't all get the same answer." }]
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) {
    return o.decision === 'deny'
      ? [{ text: 'They are all ' }, { text: 'denied', cite: 'outcome', tone: 'negative' }, { text: '.' }]
      : [{ text: 'They all get ' }, { text: DECISION_WORDS[o.decision], cite: 'outcome', tone: 'positive' }, { text: '.' }]
  }
  if (o.status === 'depends') return [{ text: 'For each of them it ' }, { text: 'depends', cite: 'outcome', tone: 'notice' }, { text: '.' }]
  return [{ text: 'No policy decides for any of them.' }]
}

/** "Maya Iyer", or "Finance (tested as Priya Sharma)": who the identity's run was of. */
function whoRan(i: RunIdentity, users: readonly User[]): string {
  if (i.kind !== 'group') return i.name
  const id = personPick(i.key, users).personId
  const probe = id ? users.find((u) => u.id === id)?.name : undefined
  return probe ? `${i.name} (tested as ${probe})` : i.name
}

/** "Ravi Menon: Allow on 1 factor · Global Default Policy · rule 1", the identity on the canvas cited. */
function eachLine(i: RunIdentity, users: readonly User[]): Part[] {
  const words = wordsOfPlan(i.plan)
  const st = i.plan.outcome.status
  /* Where it comes from only where a policy decides or depends: "No policy decides" has nowhere to come from. */
  const source = st === 'decided' || st === 'depends' ? sourceOfPlan(i.plan, null) : ''
  const who = whoRan(i, users)
  const tone: Tone = toneOfPlan(i.plan)
  return [
    i.active ? { text: who, cite: 'person' } : { text: who },
    { text: ': ' },
    i.active ? { text: words, cite: 'outcome', tone } : { text: words },
    ...(source ? [{ text: ` · ${source}` }] : []),
  ]
}

/**
 * "What does each one get?" — composed here, as `watchingAnswer` is: no dock intent answers it. Null for fewer than two
 * identities, where `faqOf` never offers the row.
 */
export function eachAnswer(identities: readonly RunIdentity[] | null | undefined, users: readonly User[]): Answer | null {
  if (!identities || identities.length < 2) return null
  const first = identities[0].plan
  const same = identities.every((i) => wordsOfPlan(i.plan) === wordsOfPlan(first))
  const sentence = eachLead(same, first)
  return {
    id: FAQ_EACH,
    kind: 'group',
    ask: 'What does each one get?',
    sentence,
    more: identities.map((i) => eachLine(i, users)),
    tone: same ? toneOfPlan(first) : 'neutral',
    actions: [],
    acts: false,
    known: true,
    say: plain(sentence),
  }
}

// --- What an answer carries beside its words ------------------------------------------------

/** The honesty label a preview answer wears, in `brief-panel.tsx`'s own words. */
export const PREVIEW_NOTE = 'Previews only. Nothing runs until you press Run with.'

/**
 * The label to draw under the evidence, or null. Only where `more` does not already carry one: a `see` answer ends
 * with "(An approximation of the sign-in page.)" of its own, and a break-in answer is counts, never a grade.
 */
export function noteOf(a: Answer): string | null {
  if (a.kind === 'what-if' || a.kind === 'what-if-value') return PREVIEW_NOTE
  if (a.kind === 'depends' && a.actions.some((x) => x.kind === 'runWith')) return PREVIEW_NOTE
  return null
}

/* WHAT WAS WRONG. Copy answer used `plain(a.sentence)` while the screen ran `fixPossessive` over each part first, so
   the clipboard could say "None of AWS for engineering teams's 3 rules match" under a screen that said "None of the 3
   rules in AWS for engineering teams match". WHY THIS IS RIGHT. One function, `shownSentence`, makes the words the
   screen draws, and both the panel and Copy call it: the clipboard cannot drift from the screen again. */
export const shownSentence = (parts: readonly Part[]): Part[] => parts.map((p) => (p.text.includes("'s ") ? { ...p, text: fixPossessive(p.text) } : p))

/** The answer as plain lines, for Copy answer: the sentence as the screen shows it, then every line of the evidence. */
export const copyText = (a: Answer): string => [plain(shownSentence(a.sentence)), ...(a.more ?? []).map((line) => plain(line))].join('\n')

// --- What the panel does to an answer before it draws it -----------------------------------

/** The rule card "Open the rule" goes to: the one that decided, or on a Depends the first that cannot tell. An index into `plan.rules`, or null. */
export function checksRuleOf(plan: EngineRun): number | null {
  if (plan.outcome.status === 'depends') {
    const i = plan.rules.findIndex((r) => r.index !== null && r.visited && r.state === 'unknown')
    if (i >= 0) return i
  }
  return plan.landing !== null && plan.rules[plan.landing] ? plan.landing : null
}

/* WHAT WAS WRONG (two things, both in answers `intents.ts` composes and the panel may not edit).

   1. "What would change the answer?" says "N of the M one-fact changes ... change the answer" but `whatIfOf` shows
      only `changed.slice(0, 4)`. A count over a list that is shorter is how evidence gets quietly truncated, and the
      panel's own rule is that evidence is never truncated. The lines are rebuilt here from EVERY changed preview, in
      the same words (`label → words (source)`), so the count and the list agree and nothing is left out.
   2. The "checks" action is labelled "Show every check" but in v2 there is no grid of checks to open: it brings one
      rule card to the centre — and on a Depends the first rule is not necessarily the one that cannot tell. The
      label now says what the press does, and `checksRuleOf` makes it go where the label says.

   WHY THIS IS RIGHT. The answer is still `answer()`'s own composition; only its list and one label are corrected, at
   the single place the panel receives it. */
export function presentAnswer(a: Answer, plan: EngineRun, props: AskProps): Answer {
  let out = a
  if (a.id === 'what-if' && a.kind === 'what-if' && a.more && props.whatIfs) {
    const changed = props.whatIfs.filter((w) => w.changed)
    if (changed.length > 0) out = { ...out, more: changed.map((w) => [{ text: `${w.label} → ` }, { text: `${w.words}${w.source ? ` (${w.source})` : ''}` }]) }
  }
  if (out.actions.some((x) => x.kind === 'checks')) {
    const label = plan.outcome.status === 'depends' ? "Open the rule that can't tell" : 'Open the deciding rule'
    out = { ...out, actions: out.actions.map((x) => (x.kind === 'checks' ? { ...x, label } : x)) }
  }
  return out
}
