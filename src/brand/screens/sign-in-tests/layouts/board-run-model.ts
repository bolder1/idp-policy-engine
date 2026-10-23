import type { Policy, Rule } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { leaves } from '../../../predicate'
import { normaliseWho } from '../../../rule-who'
import { isPristine } from '../../board/parts'
import type { NameLookup } from '../../predicate-prose'
import { LAST_ROW } from '../../testing/evidence'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import { alsoMarks, ruleMarks, type RowMark, type RuleMarks } from '../journey'
import { GRANT_ENDED } from '../temp-access'
import { lockWindow, ruleRowState, viaWords, walkEnd } from './classic2-model'
import { ONE_ALSO_RULE, cantTell, oneRowWord } from './classic2-one-model'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3: THE RUN READ ON THE BUILDER'S OWN CARDS (owner, 20 Oct 2026:
   "the v3 is mainly based on how we have it in the builder's edit part … the
   same policy rule cards in the whole canvas instead of showing everything in
   one card"). PURE, so every word is pinned without drawing it
   (board-run-model.test.ts); board-run.tsx draws it on Board's own cards.

   Each card of the policy that decides — its rules, then Nothing else matched —
   says, at the presented step `p`, what the sign-in made of it:

     wait         the policy is found, the walk not on it yet: no words at all
                  (the policy's shape, never the person's)
     reading      the engine on it: "Reading", then one token per check that
                  ticks in turn; the check that failed lights for its beat
     match        it decided: "Matches · via Sales", in its decision's tone, the
                  lock while the run reaches it, then only its edge
     miss         "Not matched · Maya Iyer is not in Contractors": the engine's
                  own sentence, quiet, never red — colour is for the card that
                  decided
     unknown      "Can’t tell · Device not stated": the walk goes on past it
     possible     "If not": reached only if what could not be told does not hold
     also         "Also matches · via Finance · not used": a later rule that also
                  applies (read only once the rules never reached are opened)
     not-reached  no words: the folded label under the deciding card says it
     off          "Switched off", or "Temporary access ended" for a grant past
                  its date
   A blank rule says "Matches · not set up" where it decided, "Not set up" where
   it was never reached.

   The engine's ids are the cards' own, and the last row's id is Board's own key
   for it ('fallback', testing/evidence.ts LAST_ROW), so a citation, a fold and
   the camera all name a card the same way.
   -------------------------------------------------------------------------- */

/* -----------------------------------------------------------------------------
   THE ROWS READ AT A GLANCE (owner, 20 Oct 2026, evening, on Maya Iyer → AWS
   Console: "If anything is not matched, be specific … Whatever is not reached
   can be collapsed, and the outcome can be shown. If the user wants, he can
   expand it … I don't want to just utilize so much space … you are showing the
   engineers and the name of the rule … in the same row. What if the rules get
   bigger? … put it under it … so he can get the policy at the top, then which
   rule matters and what the outcome will be"; scan/spec.md).

   What changed here, and why each is the owner's:
     · the words are a second line under the rule's name, never beside it — a
       long name keeps its line and the words keep theirs (`RunWord` is that
       line: a mark, a lead, the engine's finding or a name after it)
     · a miss says what failed in the engine's own sentence (`CheckRow.line`),
       never the category alone ("Not matched · Who" said nothing)
     · the walk happens on that line (`tokens`): no card's body opens on its own,
       so the column never jumps between rules (`runFoldOn`)
     · the rules never reached fold onto the connector under the deciding card as
       ONE quiet label, and walked misses that say the same thing stack into one
       card (`runGroups`): the outcome sits right under the rule that decided
     · the conflict is one note on the deciding card (`conflictNote`); the also
       card folds with the rest, and no rule card carries a badge any more
   -------------------------------------------------------------------------- */

export type RunState = 'wait' | 'reading' | 'match' | 'miss' | 'unknown' | 'possible' | 'also' | 'not-reached' | 'off'

/* A blank rule the walk reached: it caught the sign-in (a pristine rule matches everyone), but nobody wrote it. */
export const RUN_SET_UP_MATCH = 'Matches · not set up'
/** A blank rule never reached: the builder's own grey word for it. */
export const RUN_NOT_SET_UP = 'Not set up'
export const RUN_READING = 'Reading'
export const RUN_NOT_MATCHED = 'Not matched'
export const RUN_MATCHES = 'Matches'
export const RUN_CANT_TELL = 'Can’t tell'
export const RUN_ALSO = 'Also matches'
export const RUN_NOT_USED = 'not used'
export const RUN_IF_NOT = 'If not'
export const RUN_NOT_REACHED = 'Not reached'
export const RUN_SWITCHED_OFF = 'Switched off'
/** Nothing else matched decided: said after "Matches", so the last row's line says why it was the one. */
export const RUN_NONE_ABOVE = 'no rule above matched'
/** A stack of who-misses whose groups are too many (or name people) to list. */
export const RUN_ANY_OF_THESE = 'is not in any of these rules'

/** How a card's line is coloured: quiet (a miss, If not), the decision's tone, notice (can't tell, also), faint (switched off, not set up), the engine's (reading). */
export type RunWordTone = 'quiet' | 'match' | 'notice' | 'faint' | 'work'

/** The line's own mark, at its start: the rows' family, plus the two the rows don't have (a possible way, switched off). */
export type RunMark = 'pass' | 'fail' | 'unknown' | 'possible' | 'off' | 'working'

/** One check while its card is read: its word, and its mark once the engine has read it. */
export interface RunToken {
  key: string
  word: string
  mark: 'pass' | 'fail' | 'unknown' | 'working'
  /** It is the check that failed, and its mark has landed: it lights for its beat. */
  hit: boolean
}

/* A card's second line, in the pieces the run draws differently: the machine's words resolve (Aruna's decode, shared/
   run-text.tsx), and what comes after them — the engine's finding, or a name — sharpens in, never scrambled. */
export interface RunWord {
  /** The machine's words: "Reading", "Not matched", "Matches", "Can’t tell", "If not", "Also matches", "Switched off". */
  lead: string
  /** The engine's finding: "Maya Iyer is not in Contractors", "Device not stated". */
  why?: string
  /** A name after the words: "via Engineering", "by name", "no rule above matched", "via Finance · not used". */
  name?: string
  mark: RunMark | null
  /** While the card is read: one token per check the engine has reached. */
  tokens?: readonly RunToken[]
  tone: RunWordTone
}

/** A line's words as one string: "Not matched · Maya Iyer is not in Contractors". */
export const wordText = (w: RunWord | null): string => (w ? [w.lead, w.why ?? w.name].filter(Boolean).join(' · ') : '')

/** One card of the run at step `p`. */
export interface RunCardModel {
  /** Board's id for the card: the rule's own, or 'fallback' for the last row. */
  id: string
  /** Its place in `plan.rules`. */
  at: number
  state: RunState
  word: RunWord | null
  /** Each row's mark (IfBlock `mark`): who, each condition by its id, and the rows never read ("Not checked"). */
  marks: RuleMarks | null
  /** The last row's `always`, ticked as the walk reaches it. */
  always: RowMark | null
  /** The marks are an also card's, from the resolver's own trace: settled, never animated. */
  settled: boolean
  /** It is the card that decided (not in a Depends: nothing decided there). */
  decided: boolean
  /** The camera follows it. */
  follow: boolean
  /** The deciding card's lock plays. */
  lock: boolean
  /** What the sign-in showed on the check that settled it, where it says more than the line: its evidence tip. */
  tip: string | null
  /** The deciding card's conflict, once the walk is over: "Rule 4 also matches · via Finance · not used". */
  note: string | null
  /** The run words for a screen reader, with the evidence, and on the deciding card its outcome and note. */
  describe: string
}

/** Board's id for an engine rule: its own, the last row's being Board's own key for it. */
export const boardIdOf = (r: Pick<EngineRule, 'id' | 'index'>): string => (r.index === null ? LAST_ROW : r.id)
/** The engine's id for a card of Board's: the same, read back. */
export const engineIdOf = (boardId: string): string => boardId

/** A rule that failed on who it is for. */
export const isWhoMiss = (r: Pick<EngineRule, 'state' | 'failing' | 'checks'>): boolean => r.state === 'no-match' && r.failing !== null && r.checks[r.failing]?.category === 'who'

export interface RunCardsOptions {
  /** A group's own run ("Anyone in Sales"): the card that decided says no "via". */
  asGroup: boolean
  /** The deciding card's lock may play: a run told with the run's motion, not drawn settled. */
  lock: boolean
}

/* The rule a card of Board's draws: the policy's own by id, or its last row. */
function ruleOf(policy: Pick<Policy, 'rules' | 'fallback'> | null, r: Pick<EngineRule, 'id' | 'index'>): Rule | null {
  if (!policy) return null
  if (r.index === null) return policy.fallback ?? null
  return policy.rules.find((x) => x.id === r.id) ?? null
}

/** A Depends: nothing decided, and a rule the engine says matched below one that could not be told is only possible. */
const dependsOn = (plan: Pick<EngineRun, 'outcome'>): boolean => plan.outcome.status === 'depends'

/* The card's standing at step `p`. A miss stays `reading` from the moment its failing check lands until the engine
   folds it (`compactAt`): the check that failed lights for that beat on the line, then the reason settles. */
function stateOf(plan: Pick<EngineRun, 'outcome' | 'at' | 'steps'>, r: EngineRule, p: number, walked: boolean): RunState {
  const row = ruleRowState(r, p, walked)
  switch (row.tone) {
    case 'waiting':
      return 'wait'
    case 'reading':
      return 'reading'
    case 'match':
      return dependsOn(plan) ? 'possible' : 'match'
    case 'no-match':
      return r.compactAt !== null && p < r.compactAt ? 'reading' : 'miss'
    case 'unknown':
      return 'unknown'
    case 'possible':
      return 'possible'
    case 'off':
      return 'off'
    default:
      return walked && r.alsoChecks ? 'also' : 'not-reached'
  }
}

/** The finding of a rule that did not match: the engine's own sentence for the check that failed ('' for none). */
export const missLine = (r: Pick<EngineRule, 'failing' | 'checks'>): string => (r.failing !== null ? (r.checks[r.failing]?.line ?? '') : '')

/** The checks the engine has reached on a card at step `p`, each with its mark once read; the failing one lit. */
export function tokensOf(r: Pick<EngineRule, 'checks' | 'checked' | 'checkAt' | 'markAt'>, p: number): RunToken[] {
  return r.checks
    .slice(0, r.checked)
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => r.checkAt[i] !== undefined && p >= r.checkAt[i])
    .map(({ c, i }) => {
      const read = r.markAt[i] !== undefined && p >= r.markAt[i]
      const mark = read ? (c.status === 'pass' || c.status === 'fail' || c.status === 'unknown' ? c.status : 'pass') : 'working'
      return { key: c.key, word: c.word, mark, hit: read && c.status === 'fail' }
    })
}

/* The words the line says after "Can’t tell": the check's word and "not stated" (classic2-one-model.ts `cantTell`, cut
   at its first separator), or the check's word and what the sign-in showed when something was stated but can't be read. */
function cantTellWhy(c: Pick<CheckRow, 'word' | 'value'> | undefined): string {
  if (!c) return ''
  if (c.value && c.value !== 'Not stated') return `${c.word} · ${c.value}`
  const all = cantTell(c.word)
  const at = all.indexOf(' · ')
  return at > 0 ? all.slice(at + 3) : ''
}

/* What the card says, by its standing. */
function wordOf(state: RunState, r: EngineRule, rule: Rule | null, walked: boolean, asGroup: boolean, p: number): RunWord | null {
  const blank = !!rule && r.index !== null && isPristine(rule)
  switch (state) {
    case 'wait':
      return null
    case 'reading':
      return { lead: RUN_READING, mark: 'working', tokens: tokensOf(r, p), tone: 'work' }
    case 'match': {
      if (blank) return { lead: RUN_MATCHES, name: RUN_SET_UP_MATCH.slice(`${RUN_MATCHES} · `.length), mark: 'pass', tone: 'match' }
      if (r.index === null) return { lead: RUN_MATCHES, name: RUN_NONE_ABOVE, mark: 'pass', tone: 'match' }
      const row = ruleRowState(r, p, walked)
      const said = oneRowWord(r, row, walked, asGroup)
      const name = said && said.word.length > said.lead.length ? said.word.slice(said.lead.length + ' · '.length) : ''
      return name ? { lead: RUN_MATCHES, name, mark: 'pass', tone: 'match' } : { lead: RUN_MATCHES, mark: 'pass', tone: 'match' }
    }
    case 'miss': {
      const why = missLine(r)
      return why ? { lead: RUN_NOT_MATCHED, why, mark: 'fail', tone: 'quiet' } : { lead: RUN_NOT_MATCHED, mark: 'fail', tone: 'quiet' }
    }
    case 'unknown': {
      const why = cantTellWhy(r.checks.find((c) => c.status === 'unknown'))
      return why ? { lead: RUN_CANT_TELL, why, mark: 'unknown', tone: 'notice' } : { lead: RUN_CANT_TELL, mark: 'unknown', tone: 'notice' }
    }
    case 'possible':
      return { lead: RUN_IF_NOT, mark: 'possible', tone: 'quiet' }
    case 'also': {
      /* Said by classic2-one-model.ts `ONE_ALSO_RULE` ("Also matches · not used"), with the way it lets them in between. */
      const lead = ONE_ALSO_RULE.slice(0, ONE_ALSO_RULE.indexOf(' · '))
      const name = [viaWords(r.via ?? null), RUN_NOT_USED].filter(Boolean).join(' · ')
      return { lead, name, mark: 'pass', tone: 'notice' }
    }
    case 'not-reached':
      return blank ? { lead: RUN_NOT_SET_UP, mark: null, tone: 'faint' } : null
    case 'off': {
      const ended = !!rule?.tempAccess && rule.enabled !== false
      return { lead: ended ? GRANT_ENDED : RUN_SWITCHED_OFF, mark: 'off', tone: 'faint' }
    }
  }
}

/* What the sign-in showed on the check that settled the card — a miss's, or a Can't tell's — where the evidence says
   more than the line already does. */
export function tipOf(state: RunState, r: Pick<EngineRule, 'failing' | 'checks'>): string | null {
  const c = state === 'miss' && r.failing !== null ? r.checks[r.failing] : state === 'unknown' ? r.checks.find((x) => x.status === 'unknown') : undefined
  if (!c) return null
  const tip = c.tip.trim()
  return tip && tip !== c.line ? tip : null
}

/**
 * Every card of the deciding policy at step `p`, in Board's order: its rules, then Nothing else matched. `policy` is the
 * policy the engine walked (in the builder, the draft as edited), so each card's own rule is read off it.
 */
export function runCards(plan: EngineRun, policy: Pick<Policy, 'rules' | 'fallback'> | null, p: number, opts: RunCardsOptions): RunCardModel[] {
  const end = walkEnd(plan)
  const walked = end >= 0 && p >= end
  const lock = opts.lock ? lockWindow(plan) : null
  const depends = dependsOn(plan)
  const note = walked ? conflictNote(plan) : null
  return plan.rules.map((r, at) => {
    const rule = ruleOf(policy, r)
    const terminal = r.index === null
    const state = stateOf(plan, r, p, walked)
    const word = wordOf(state, r, rule, walked, opts.asGroup, p)
    const decided = state === 'match' && !depends
    const ids = rule && !terminal ? leaves(rule.when).map((k) => k.id) : []
    const also = state === 'also'
    const marks = also ? alsoMarks(r, ids) : rule && r.visited && !terminal ? ruleMarks(r, ids, p) : null
    /* The last row's `always`: the spinner while the walk is on it, its ✓ once it decides. */
    const always = terminal ? (state === 'reading' ? { status: 'pass' as const, working: true } : decided ? { status: 'pass' as const, working: false } : null) : null
    /* The camera's subject: the card being read, then the one that decided until the outcome is presented. */
    const follow = state === 'reading' || (decided && (plan.at.outcome < 0 || p < plan.at.outcome))
    const locking = decided && lock !== null && p >= lock[0] && p <= lock[1]
    const tip = tipOf(state, r)
    const text = wordText(word)
    const said = text && tip ? `${text}: ${tip}` : text
    const mine = decided ? note : null
    const describe = decided ? `${said}, then ${DECISION_WORDS[r.decision]}${mine ? `. ${mine}` : ''}` : said
    return { id: boardIdOf(r), at, state, word, marks, always, settled: also, decided, follow, lock: locking, tip, note: mine, describe }
  })
}

/* The card the run holds open on its own at step `p`: none of the rule cards — the walk is read on each card's second
   line, so nothing opens and the column never jumps (owner, 20 Oct 2026, evening) — and the outcome once it is
   presented, where it has a body to read. */
export function runFoldOn(plan: EngineRun, p: number): string | null {
  if (plan.empty || !plan.decider) return null
  if (plan.at.outcome >= 0 && p >= plan.at.outcome) return 'outcome'
  return null
}

/* --- The conflict, said once on the card that decided ------------------------------------------------------------ */

/* The later rules that would also apply, with another answer (engine-run.ts `alsoChecks`), numbered as the builder
   numbers them: "Rule 4 also matches · via Finance · not used", "Rules 4 and 6 also match · not used". Null for none,
   and in a Depends (nothing decided, so nothing is "not used"). */
export function conflictNote(plan: Pick<EngineRun, 'rules' | 'landing' | 'outcome'>): string | null {
  if (plan.landing === null || dependsOn(plan)) return null
  const landing = plan.landing
  const also = plan.rules.filter((r, at) => at > landing && r.index !== null && !!r.alsoChecks && r.state === 'not-reached')
  if (also.length === 0) return null
  const n = (r: EngineRule) => (r.index ?? 0) + 1
  if (also.length === 1) {
    const via = viaWords(also[0].via ?? null)
    return `Rule ${n(also[0])} also matches${via ? ` · ${via}` : ''} · ${RUN_NOT_USED}`
  }
  const nums = also.map(n)
  return `Rules ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]} also match · ${RUN_NOT_USED}`
}

/* --- The groups: the rules never reached, and walked misses that say the same ----------------------------------- */

/** One fold of the policy's cards (`plan.rules` indexes, `from` to `to` inclusive). */
export interface RunGroup {
  /** 'tail', or `stack:{from}`: the fold's own id (useBoardRunFold). */
  id: string
  kind: 'tail' | 'stack'
  from: number
  to: number
  /** Folded, what it says: the tail's label, or the stack's tile ("1–3"). */
  words: string
  /** Opened, its label: "Not reached", "Rules 1–3". */
  open: string
  /** A stack's one sentence: the shared finding, or the who-misses said together. */
  finding?: string
  /** A stack's rule names, joined. */
  names?: string
}

/** The folded tail's label: the rules never reached by number, then Nothing else matched by name. */
export function tailWords(from: number, n: number): string {
  /* `from` and the last rule are `plan.rules` indexes; the rules are numbered from 1, and the last row is the n-th card. */
  if (from >= n - 1) return `${RUN_NOT_REACHED} · Nothing else matched`
  if (from === n - 2) return `${RUN_NOT_REACHED} · rule ${from + 1} and Nothing else matched`
  return `${RUN_NOT_REACHED} · rules ${from + 1}–${n - 1} and Nothing else matched`
}

/* Joined as the engine joins a who it is outside of (engine-run.ts `whoFinding`): "A", "A or B", "A, B or C". */
const orList = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`)

/* A who-miss the engine said plainly ("{person} is not in …"), never an exception's ("… is in Contractors, an
   exception"): only these stack by person. */
const plainWho = (r: EngineRule, person: string): boolean => r.failing !== null && r.checks[r.failing]?.category === 'who' && missLine(r).startsWith(`${person} is not in `)

/* A run of walked misses that may stand as one card: every one says the same, or (a person's run) every one is a plain
   who-miss. */
function together(members: readonly EngineRule[], person: string | null): boolean {
  const first = missLine(members[0])
  if (first && members.every((r) => missLine(r) === first)) return true
  return person !== null && members.every((r) => plainWho(r, person))
}

/* The stack's sentence for who-misses that differ: the person outside every group the rules name, from the rules' own
   group ids in rule order — never read out of the engine's sentences. Too many to say, or a rule that names people:
   "{person} is not in any of these rules". */
function whoUnion(members: readonly EngineRule[], policy: Pick<Policy, 'rules' | 'fallback'> | null, person: string, resolve: NameLookup): string {
  const any = `${person} ${RUN_ANY_OF_THESE}`
  const ids: string[] = []
  for (const r of members) {
    const w = normaliseWho(ruleOf(policy, r)?.who)
    if (!w || w.userIds.length > 0 || w.groupIds.length === 0) return any
    for (const id of w.groupIds) if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length > 3) return any
  const names = ids.map((id) => resolve('group', id))
  if (names.some((x) => !x)) return any
  return `${person} is not in ${orList(names as string[])}`
}

/**
 * The folds of a run, from its plan alone (constant through the run, so the groups exist from its first frame):
 *   · the tail — the rules after the one that decided, Nothing else matched last: folded onto the connector under it
 *   · each stack — 2 or more walked misses in a row that say the same (or, a person's run, plain who-misses): never
 *     the card that decided, the last row, or across a card that could not be told, was switched off or may apply;
 *     in a Depends only above the first card that could not be told
 * `[]` for an empty plan or no policy deciding. `person` is the person's name, null for a group's own run.
 */
export function runGroups(plan: EngineRun, policy: Pick<Policy, 'rules' | 'fallback'> | null, o: { person: string | null; resolve: NameLookup }): RunGroup[] {
  if (plan.empty || !plan.decider || plan.rules.length === 0) return []
  const n = plan.rules.length
  const depends = dependsOn(plan)
  const groups: RunGroup[] = []
  const firstUnknown = depends ? plan.rules.findIndex((r) => r.state === 'unknown') : -1
  const limit = Math.min(n - 1, plan.landing ?? n - 1, firstUnknown >= 0 ? firstUnknown : n - 1)
  const miss = (at: number) => at < limit && plan.rules[at].index !== null && plan.rules[at].state === 'no-match'
  let i = 0
  while (i < limit) {
    if (!miss(i)) {
      i++
      continue
    }
    let j = i
    while (miss(j + 1) && together(plan.rules.slice(i, j + 2), o.person)) j++
    if (j > i) {
      const members = plan.rules.slice(i, j + 1)
      const first = missLine(members[0])
      const finding = first && members.every((r) => missLine(r) === first) ? first : whoUnion(members, policy, o.person ?? '', o.resolve)
      groups.push({
        id: `stack:${i}`,
        kind: 'stack',
        from: i,
        to: j,
        words: `${i + 1}–${j + 1}`,
        open: `Rules ${i + 1}–${j + 1}`,
        finding,
        names: members.map((r) => r.name.trim() || 'Untitled rule').join(' · '),
      })
    }
    i = j + 1
  }
  if (!depends && plan.landing !== null && plan.landing < n - 1) {
    const from = plan.landing + 1
    groups.push({ id: 'tail', kind: 'tail', from, to: n - 1, words: tailWords(from, n), open: RUN_NOT_REACHED })
  }
  return groups
}

/** The groups are formed once the walk is over (the `deciding` step): before it, every card stands on its own. */
export const groupsFormed = (plan: Pick<EngineRun, 'at' | 'steps'>, p: number): boolean => {
  const e = walkEnd(plan)
  return e >= 0 && p >= e
}

/** The group holding card `at` (a `plan.rules` index), if any. */
export const groupOf = (groups: readonly RunGroup[], at: number): RunGroup | undefined => groups.find((g) => at >= g.from && at <= g.to)

/** The rules never reached are folded (their tail formed and not opened): the deciding card's connector is the way on. */
const tailFolded = (plan: EngineRun, p: number, tailOpen: boolean): boolean =>
  !tailOpen && !dependsOn(plan) && plan.landing !== null && plan.landing < plan.rules.length - 1 && groupsFormed(plan, p)

/* --- The connectors and the lane ---------------------------------------------------------------------------------- */

/** How a connector is drawn: before the walk reaches it, taken (inked as reached, then its tone, then at rest), not taken, a possible way, or gone (no height). */
export type RunLinkKind = 'idle' | 'taken' | 'skip' | 'possible' | 'hidden'

/* The connector above card `slot` (0 is the head's to the first rule; `rules.length - 1` the last row's; `rules.length`
   the outcome's) at step `p`. The walk reaches a card at its start; after the deciding step, every connector below
   where it stopped is not taken — dashed — and where it can only Depend, the last row's way to the outcome is dashed in
   the notice. With the rules never reached folded (`tailOpen` false), the connector under the deciding card is the
   route — taken, the label riding on it — and the outcome's own stands down. */
export function runLink(plan: EngineRun, slot: number, p: number, tailOpen = false): RunLinkKind {
  const n = plan.rules.length
  const end = walkEnd(plan)
  const walked = end >= 0 && p >= end
  if (tailFolded(plan, p, tailOpen)) {
    if (slot === (plan.landing ?? -2) + 1) return 'taken'
    if (slot === n) return 'hidden'
  }
  if (slot < n) {
    const r = plan.rules[slot]
    const reached = r.startAt >= 0 && p >= r.startAt && r.state !== 'not-reached'
    if (reached) return 'taken'
    return walked ? 'skip' : 'idle'
  }
  /* The outcome's own connector: taken when the last row decided; possible when the last row is a way it may go; else the lane carries the route. */
  const last = plan.rules[n - 1]
  if (!last) return 'idle'
  if (dependsOn(plan)) return last.state === 'possible' ? 'possible' : 'skip'
  return plan.landing === n - 1 ? 'taken' : 'skip'
}

/** The lane: from the card where the sign-in left the chain (or, in a Depends, the first card that could not be told) down past every card below it into the outcome. */
export interface RunLane {
  /** The card it leaves (its slot). */
  from: number
  kind: 'taken' | 'possible'
  /** In a Depends, each later possible card that is not the last row joins it with a tick. */
  ticks: readonly number[]
  /** Its pieces draw one after another, this far apart (ms). */
  step: number
}

/* Drawn at the outcome step (and at rest once landed); none where Nothing else matched decided — every connector was
   taken — or where nothing decides at all. Where a rule decided before the end, only while the rules never reached are
   opened (`tailOpen`): folded, the 40 px connector under the deciding card is the route, and a lane would be a second. */
export function runLane(plan: EngineRun, p: number, tailOpen = false): RunLane | null {
  if (plan.empty || !plan.decider || plan.at.outcome < 0 || p < plan.at.outcome) return null
  const n = plan.rules.length
  if (dependsOn(plan)) {
    const from = plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown')
    if (from < 0) return null
    const ticks = plan.rules
      .map((r, at) => ({ r, at }))
      .filter(({ r, at }) => at > from && r.index !== null && (r.state === 'match' || r.state === 'possible'))
      .map(({ at }) => at)
    return { from, kind: 'possible', ticks, step: laneStep(n - from + 1) }
  }
  const from = plan.landing
  if (from === null || from >= n - 1 || !tailOpen) return null
  return { from, kind: 'taken', ticks: [], step: laneStep(n - from + 1) }
}

/** One piece of the lane a slot draws: where it leaves, where it passes, a tick joining it, or where it arrives (the outcome's slot). */
export type LanePart = 'from' | 'through' | 'to'

/* The lane's pieces draw in turn over at most 320 ms, never slower than 80 ms apart. */
const laneStep = (parts: number): number => Math.min(80, Math.floor(320 / Math.max(1, parts)))

/** What slot `slot` draws of the lane (`rules.length` is the outcome's slot): its piece, whether it ticks, and its turn. */
export function lanePart(lane: RunLane | null, slot: number, n: number): { part: LanePart; tick: boolean; i: number } | null {
  if (!lane || slot < lane.from) return null
  const i = slot - lane.from
  if (slot === lane.from) return { part: 'from', tick: false, i }
  if (slot >= n) return { part: 'to', tick: false, i }
  return { part: 'through', tick: lane.ticks.includes(slot), i }
}
