import { useCallback, useState } from 'react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import type { Narrator } from './assistant/voice'
import { checkPicks, decisiveOf, NB, splitBy, toneOf, type BriefInput, type BriefModel, type CiteId, type Glyph, type Part, type Seg, type Tone } from './brief-model'

/* -----------------------------------------------------------------------------
   The brief's TEXT, in six versions (owner, 3 Oct 2026, BRIEF-TEXT-5: "give me
   5 more versions for this text only"). A temporary switch in the dock
   ("Text: 0 · 1 · 2 · 3 · 4 · 5", `idp.brief-text`) picks the one drawn in
   the sentence's place; everything else on the canvas stays as it is. Removed
   once he picks.

   ONE contract (`TextProps`) for every version, and what every version
   shares, here:

     textOf      the PLAINER sentence, from the plan: "Arun gets into AWS
                 Console on one factor: AWS for engineering teams covers him
                 through Engineering, and rule 2 matches: his Windows 11
                 laptop is a compliant device." Every word from the plan;
                 names as stored, the first name after the row on top has
                 said it in full; a deny says the fact plainly, a Depends what
                 it depends on. Cut into the pieces the versions need: the
                 answer, the cover, the rule, the fact, the question and its
                 reply, the short reason, the policies and rules passed over.
     pronounOf   his / her / their: the directory stores none, so the
                 prototype's own seed people are said as the owner reads them,
                 and anyone else (or a group's member) is "their".
     REVEAL      the phrase-level reveal (~200 ms, blur 4px → 0, ease-out).
     QUIET       the dotted citation underline shows only while the pointer
                 is over the text or a phrase is focused (prose at rest).
     useLandingBeat  the one quiet landing beat (a soft sweep under the
                 answer in its tone, no bounce), only when the landing was
                 seen playing.
     The final text is announced once (aria-live polite) by the layout.

   Version 0 is today's sentence (brief-model.ts) with the quiet underlines;
   versions 1–5 are brief-text-1.tsx … brief-text-5.tsx, each one component
   taking TextProps.
   -------------------------------------------------------------------------- */

// --- The switch -----------------------------------------------------------------------------

export const TEXT_VERSIONS = [0, 1, 2, 3, 4, 5] as const
export type TextVersion = (typeof TEXT_VERSIONS)[number]

/** Each version's name, for its Tip in the switch. */
export const TEXT_NAMES: Record<TextVersion, string> = {
  0: 'Today’s sentence',
  1: 'Answer, then because',
  2: 'Slots lock in',
  3: 'Live caption',
  4: 'Struck-through path',
  5: 'Question and answer',
}

const TEXT_KEY = 'idp.brief-text'

function readVersion(): TextVersion {
  try {
    const n = Number(window.localStorage.getItem(TEXT_KEY))
    return (TEXT_VERSIONS as readonly number[]).includes(n) ? (n as TextVersion) : 0
  } catch {
    return 0
  }
}

/** The version picked in the dock, remembered on this browser (default 0). */
export function useBriefText(): [TextVersion, (v: TextVersion) => void] {
  const [v, setV] = useState<TextVersion>(readVersion)
  const set = useCallback((next: TextVersion) => {
    try {
      window.localStorage.setItem(TEXT_KEY, String(next))
    } catch {
      /* Storage refused: the pick holds for this visit. */
    }
    setV(next)
  }, [])
  return [v, set]
}

// --- The contract ---------------------------------------------------------------------------

export interface TextProps {
  /** The plainer sentence (`textOf`): what versions 1–5 say. */
  text: TextModel
  /** Today's sentence (brief-model.ts `briefOf`): what version 0 says. Its `cites` and `num` are the dock's ‹ ›. */
  brief: BriefModel
  /** The step on screen (the run's clock). A part is shown once `landed || s >= part.at`. */
  s: number
  /** The answer is out (the outcome step reached, or the run settled). */
  landed: boolean
  /** A run is playing and motion is allowed: phrases arrive as proven. Off: everything at once. */
  animate: boolean
  reduced: boolean
  /** Skip landed the run (or a revisit drew it settled): everything at once, no beat. */
  jumped: boolean
  /** Changes every time a new run starts playing. */
  runKey: number
  /** The part the engine is working on now (the one blue thing), null once landed. */
  working: CiteId | null
  /** The part lit: hovered here, in the dock's answer, or pinned. */
  lit: CiteId | null
  pinned: CiteId | null
  /** The outcome's tone: positive (green allow), negative (red deny), notice (amber depends), neutral. */
  tone: Tone
  /** How long step `at` lasts (ms): the run's clock, for pacing reveals. */
  durOf: (at: number) => number
  /** A cited phrase hovered or focused (null: let go). */
  onHot: (c: CiteId | null) => void
  /** A cited phrase pressed: before the landing it pins; after, it opens the right-hand panel on its step (pressed again, lets go). */
  onPin: (c: CiteId) => void
  /** Open the right-hand panel on a part's step, pinned (once landed; before, it only pins). */
  onOpen: (c: CiteId) => void
  /** The shared narrator (assistant/voice.ts). The layout says the text once it lands, except for version 3, which speaks it itself, once a run. */
  narrator: Narrator
  /** The canvas is narrow (under 900 px): the text at its floor size. */
  narrow: boolean
}

// --- Pronouns -------------------------------------------------------------------------------

export type Pronoun = 'he' | 'she' | 'they'

interface PronounWords {
  /** "he" */
  subj: string
  /** "him" */
  obj: string
  /** "his" */
  poss: string
  /** "he’s" */
  is: string
}

export const PRONOUN: Record<Pronoun, PronounWords> = {
  he: { subj: 'he', obj: 'him', poss: 'his', is: 'he’s' },
  she: { subj: 'she', obj: 'her', poss: 'her', is: 'she’s' },
  they: { subj: 'they', obj: 'them', poss: 'their', is: 'they’re' },
}

/* The prototype's seed people (data.ts, showcase-seed.ts), by their name as
   stored. A name not here — and Devon, Sam, Jaspreet — is "their". */
const SEED: Record<string, Pronoun> = {
  'Maya Iyer': 'she',
  'Arun Patel': 'he',
  'Priya Sharma': 'she',
  'Ravi Menon': 'he',
  'Aisha Khan': 'she',
  'Kavya Menon': 'she',
  'Neha Kapoor': 'she',
  'James Whitfield': 'he',
  'Rahul Verma': 'he',
  'Emily Carter': 'she',
  'Leo Fernandes': 'he',
  'Ishita Banerjee': 'she',
  'Marcus Bell': 'he',
  'Tanmay Joshi': 'he',
  'Rohan Kulkarni': 'he',
  'Anita Desai': 'she',
  'Thomas Byrne': 'he',
  'Leena Iyer': 'she',
  'Sofia Marchetti': 'she',
  'Kenji Watanabe': 'he',
  'Grace Oyelaran': 'she',
  'Daniel Fischer': 'he',
  'Mehak Garg': 'she',
  'Vikram Nair': 'he',
  'Helen Osei': 'she',
  'Marco Silveira': 'he',
  'Ivy Zhang': 'she',
  'Peter Ahlgren': 'he',
  'Nadia Haddad': 'she',
  'Clara Boucher': 'she',
  'Yusuf Demir': 'he',
  'Bethany Cole': 'she',
  'Omar Haddadi': 'he',
}

/** his / her / their, for a person by their name as stored; '' (a group's member) is "they". */
export function pronounOf(name: string | null | undefined): Pronoun {
  return (name && SEED[name.trim()]) || 'they'
}

// --- Motion ---------------------------------------------------------------------------------

export const REVEAL_MS = 200
const EASE_OUT = [0, 0, 0.2, 1] as const

/** A phrase's reveal (motion/react props): blur 4px → 0 over ~200 ms, ease-out; `false` (no motion) when not animating. */
export function revealOf(animate: boolean, delay = 0) {
  if (!animate) return { initial: false as const, animate: { opacity: 1, filter: 'blur(0px)' } }
  return {
    initial: { opacity: 0, filter: 'blur(4px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    transition: { duration: REVEAL_MS / 1000, delay, ease: EASE_OUT },
  }
}

/** A part is written once the engine reaches its step, or once the answer is out. */
export const shownAt = (p: Pick<Part, 'at'>, s: number, landed: boolean): boolean => landed || s >= p.at

/** The quiet-underline rule (brief-text.css): put on a version's root. */
export const QUIET = 'rl-bt-quiet'

/** The landing beat's class (brief-text.css): put on the answer's phrase, with `is-<tone>`. */
export const LAND = 'rl-bt-land'

/* The one landing beat: true from the landing seen playing (a run animating
   reaches its answer) until the next run. A landing drawn at once — Skip,
   reduced motion, a revisit, the version switched after — has none. */
export function useLandingBeat(landed: boolean, animate: boolean, runKey: number): boolean {
  const [st, setSt] = useState({ key: runKey, landed, beat: false })
  if (st.key !== runKey) setSt({ key: runKey, landed, beat: false })
  else if (st.landed !== landed) setSt({ key: runKey, landed, beat: landed && animate })
  return st.key === runKey && st.beat
}

// --- The plainer sentence -------------------------------------------------------------------

export type TextKind = 'allow' | 'deny' | 'depends' | 'none'

/** A policy or rule the engine passed over before the one that decides (version 4's strikes). */
export interface Struck {
  key: string
  kind: 'policy' | 'rule'
  /** The policy's name, or "rule 1". */
  label: string
  /** The rule's own name ("Contractors away from the office"); '' for a policy. */
  name: string
  /** Why, plainly: "doesn’t cover Priya", "Arun isn’t in Contractors", "switched off". */
  reason: string
  /** The step the engine leaves it at. */
  at: number
  cite: CiteId
}

export interface TextModel {
  kind: TextKind
  tone: Tone
  /** The person as the text names them: "Arun" (their face before it), or "A member of Finance". */
  subject: Part
  pronoun: Pronoun
  /** "Arun gets into AWS Console on one factor" / "Devon can’t get into AWS Console" / "Whether Arun gets into GitHub Enterprise depends on his device". The outcome's words are `answer`. */
  answer: Part[]
  /** The outcome's words alone ("on one factor", "can’t get into", "depends on his device"): the same part as in `answer`. */
  outcome: Part
  /** "AWS for engineering teams covers him through Engineering" (the pronoun: the answer named them). [] with no deciding policy. */
  cover: Part[]
  /** The same, by the first name: "AWS for engineering teams covers Arun through Engineering". */
  coverNamed: Part[]
  /** "rule 2 matches", "rules 1 and 2 can’t tell without his device", "none of its 3 rules match, so Nothing else matched decides". */
  rule: Part[]
  /** The deciding fact, plainly: "his Windows 11 laptop is a compliant device", "they’re on Home broadband, outside Corporate offices". [] when none. */
  fact: Part[]
  /** Depends: "it could be Allow on 1 factor, Allow with 2FA or Deny". [] otherwise. */
  could: Part[]
  /** The because, no end stop: cover, rule, fact (or could). */
  reason: Part[]
  /** The whole sentence: answer, ": ", reason, ".". */
  parts: Part[]
  /** "Can Arun get into AWS Console?" */
  question: Part[]
  /** The reply: "Yes" / "No" / "It depends" (the outcome's part), and the rest ("on one factor", "access is denied", "on the device"). */
  reply: { word: Part; rest: Part[] }
  /** The reason in short, ended: "AWS for engineering teams · rule 2: his Windows 11 laptop is a compliant device." */
  short: Part[]
  /** The policies before the decider that don't cover the person, then the rules passed over, in the engine's order. */
  struck: Struck[]
  /** The sentence said plainly, for the narrator and the announce. */
  spoken: string
}

export type TextInput = BriefInput & {
  /** his / her / their (default: `pronounOf(name)`). */
  pronoun?: Pronoun
}

const orList = (ds: readonly AccessDecision[]): string => {
  const w = [...new Set(ds)].map((d) => DECISION_WORDS[d])
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} or ${w.at(-1)}`
}
const lowerFirst = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1)
const upperFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
const article = (w: string): string => (/^[aeiou]/i.test(w) ? 'an' : 'a')

/** The words of a list of parts, joined. */
export const plainOf = (parts: readonly Pick<Part, 'text'>[]): string =>
  parts
    .map((p) => p.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

/** Who a fact is about, in its words. */
interface Who {
  /** "Arun"; "they" as a group's member. */
  first: string
  /** The full name as stored ('' as a group's member). */
  name: string
  pr: PronounWords
}

/** "Maya Iyer is not in Contractors" → "Maya isn’t in Contractors". */
function plainWords(text: string, who: Who): string {
  let t = text
  if (who.name && who.first && who.name !== who.first) t = t.split(who.name).join(who.first)
  return t
    .replace(/\bis not\b/g, 'isn’t')
    .replace(/\bdoes not\b/g, 'doesn’t')
    .replace(/\bdo not\b/g, 'don’t')
}

/* "Compliant devices" → "a compliant device"; null when the requirement is
   not a kind of device. */
function deviceKind(req: string): string | null {
  const m = /^(.+?)\s+devices?$/i.exec(req.trim())
  if (!m) return null
  const kind = lowerFirst(m[1])
  return `${article(kind)} ${kind} device`
}

/* A network requirement, read: "Not in Corporate offices" → outside
   Corporate offices; "Corporate offices" → inside them. */
function zoneOf(req: string): { zone: string; inside: boolean } {
  const not = /^not in\s+(.+)$/i.exec(req.trim())
  if (not) return { zone: not[1], inside: false }
  return { zone: req.trim().replace(/^in\s+/i, ''), inside: true }
}

/**
 * A check, said plainly as the sign-in's fact — the passing fact as it is,
 * the failing fact as it is (never "fails" or "meets"):
 *   device    "his Windows 11 laptop is a compliant device" / "… isn’t a compliant device"
 *   network   "he’s on Home broadband, outside Corporate offices"
 *   risk      "his risk score of 12 is below 40" / "… isn’t below 40"
 *   who       "Arun is in Engineering" / "Arun isn’t in Contractors"
 *   missing   "his device isn’t stated"
 * Anything else: the engine's own line, with the first name and plain contractions.
 */
export function factWords(c: CheckRow, who: Who): string {
  const { pr } = who
  if (c.missing || c.value === 'Not stated' || c.status === 'unknown') return `${pr.poss} ${c.word.toLowerCase()} isn’t stated`
  const pass = c.status === 'pass'
  switch (c.category) {
    case 'device': {
      const v = c.value.split(' · ')[0]
      const kind = deviceKind(c.requirement)
      if (kind) return `${pr.poss} ${v} ${pass ? 'is' : 'isn’t'} ${kind}`
      return `${pr.poss} ${v} ${pass ? 'meets' : 'doesn’t meet'} ${c.requirement}`
    }
    case 'network': {
      if (!c.requirement) break
      const { zone, inside } = zoneOf(c.requirement)
      const inZone = pass ? inside : !inside
      return `${pr.is} on ${c.value}, ${inZone ? 'inside' : 'outside'} ${zone}`
    }
    case 'risk': {
      if (!c.requirement) break
      const need = lowerFirst(c.requirement)
      return `${pr.poss} risk score of ${c.value} ${pass ? 'is' : 'isn’t'} ${need}`
    }
    default:
      break
  }
  return plainWords(c.line || c.say || `${c.word} · ${c.value}`, who)
}

/** "rule 2" (never split over two lines); "Nothing else matched". */
const ruleNo = (r: EngineRule): string => (r.index === null ? 'Nothing else matched' : `rule${NB}${r.index + 1}`)

function listNos(rs: readonly EngineRule[]): string {
  const n = rs.map((r) => (r.index ?? 0) + 1)
  if (n.length === 1) return `rule${NB}${n[0]}`
  return `rules${NB}${n.slice(0, -1).join(', ')} and${NB}${n.at(-1)}`
}

/** The plainer sentence, from the plan. Never throws: a plan it was not shaped for gets the plainest one. */
export function textOf(plan: EngineRun, inp: TextInput, brief: Pick<BriefModel, 'provenAt' | 'decisive'>): TextModel {
  try {
    return build(plan, inp, brief)
  } catch {
    const subject: Part = { key: 'subj', text: inp.person, at: 0, cite: 'who' }
    const outcome: Part = { key: 'out', text: plan.outcome.view?.line || 'no policy decides', at: 0, cite: 'outcome', answer: true }
    const answer = [subject, { key: 'g0', text: ' on ', at: 0 }, { key: 'app', text: inp.app, at: 0 }, { key: 'g1', text: ': ', at: 0 }, outcome]
    return {
      kind: 'none',
      tone: toneOf(plan),
      subject,
      pronoun: 'they',
      answer,
      outcome,
      cover: [],
      coverNamed: [],
      rule: [],
      fact: [],
      could: [],
      reason: [],
      parts: [...answer, { key: 'end', text: '.', at: 0 }],
      question: [],
      reply: { word: outcome, rest: [] },
      short: [],
      struck: [],
      spoken: `${plainOf(answer)}.`,
    }
  }
}

function build(plan: EngineRun, inp: TextInput, brief: Pick<BriefModel, 'provenAt' | 'decisive'>): TextModel {
  const last = Math.max(0, plan.steps.length - 1)
  const atOut = plan.at.outcome >= 0 ? plan.at.outcome : last
  const { provenAt } = brief
  const decisive = brief.decisive ?? decisiveOf(plan)
  const asGroup = !inp.name
  const pronoun = inp.pronoun ?? (asGroup ? 'they' : pronounOf(inp.name))
  const pr = PRONOUN[pronoun]
  const first = asGroup ? 'them' : inp.first || inp.person
  const who: Who = { first: asGroup ? pr.subj : first, name: inp.name ?? '', pr }
  const o = plan.outcome
  const tone = toneOf(plan)
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const kind: TextKind = decided === 'deny' ? 'deny' : decided ? 'allow' : o.status === 'depends' ? 'depends' : 'none'

  let k = 0
  const part = (text: string, at: number, extra: Partial<Part> = {}): Part => ({ key: `t${k++}`, text, at, ...extra })
  const marked = (text: string, glyph: Glyph): Seg[] => [{ text, glyph }]
  const face = (text: string): Seg[] | undefined => (inp.name ? splitBy(text, [{ text: first, entity: 'person', glyph: { kind: 'face', name: inp.name } }]) : undefined)

  /* The person: their first name and face, or "A member of Finance" (its group's people). */
  const subjText = asGroup ? inp.person : first
  const groupSegs = (text: string): Seg[] => splitBy(text, (inp.groups ?? []).map((g): Seg => ({ text: g, entity: 'group', glyph: { kind: 'group' } })))
  const subject = part(subjText, 0, { cite: 'who', segs: asGroup ? groupSegs(subjText) : face(subjText) })
  /* Mid-sentence, "a member of Finance". */
  const subjectMid = (): Part => (asGroup ? { ...subject, key: `t${k++}`, text: lowerFirst(subjText), segs: groupSegs(lowerFirst(subjText)) } : { ...subject, key: `t${k++}` })
  const app = () => part(inp.app, 0, { segs: [{ text: inp.app, entity: 'app', glyph: inp.appId ? { kind: 'logo', appId: inp.appId, name: inp.app } : undefined }] })

  // --- The answer ---
  const needs = o.status === 'depends' ? o.view.needs.map((n) => n.toLowerCase()) : []
  let outcome: Part
  let answer: Part[]
  if (kind === 'deny') {
    outcome = part('can’t get into', atOut, { cite: 'outcome', answer: true, segs: marked('can’t get into', { kind: 'outcome', decision: 'deny' }) })
    answer = [subject, part(' ', atOut), outcome, part(' ', 0), app()]
  } else if (kind === 'allow' && decided) {
    const said = decided === '1fa' ? 'on one factor' : inp.second ? `with 2FA (${inp.second})` : 'with 2FA'
    outcome = part(said, atOut, { cite: 'outcome', answer: true, segs: marked(said, { kind: 'outcome', decision: decided }) })
    answer = [subject, part(' gets into ', atOut), app(), part(' ', atOut), outcome]
  } else if (kind === 'depends') {
    const said = needs.length > 0 ? `depends on ${pr.poss} ${needs.join(` and ${pr.poss} `)}` : 'depends on a fact not stated'
    outcome = part(said, atOut, { cite: 'outcome', answer: true, segs: marked(said, { kind: 'outcome', decision: 'depends' }) })
    answer = [part('Whether ', 0), subjectMid(), part(' gets into ', 0), app(), part(' ', atOut), outcome]
  } else {
    outcome = part(o.view.line || 'no policy decides', atOut, { cite: 'outcome', answer: true })
    answer = [subject, part(' on ', 0), app(), part(': ', atOut), outcome]
  }

  // --- The cover: the deciding policy, and how it covers them ---
  const deciderIx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIx >= 0 ? plan.policies[deciderIx] : undefined
  const atPol = provenAt.policy
  const coverOf = (named: boolean): Part[] => {
    if (!decider || kind === 'none') return []
    const them = named ? (asGroup ? 'them' : first) : pr.obj
    const themSegs = (text: string): Seg[] | undefined => (named && !asGroup ? face(text) : undefined)
    const pol = (): Part => part(decider.name, atPol, { cite: 'policy', segs: marked(decider.name, { kind: 'policy' }) })
    if (decider.isGlobalDefault) {
      if (deciderIx === 0) return [app(), part(' has no policy of its own, so the ', atPol), pol(), part(' decides', atPol)]
      const c = `covers ${them}`
      return [part('no ', atPol), { ...app(), at: atPol }, part(' policy ', atPol), part(c, atPol, { cite: 'who', segs: themSegs(c) }), part(', so the ', atPol), pol(), part(' decides', atPol)]
    }
    const v = inp.via
    if (v?.matches && v.kind === 'everyone') return [pol(), part(' ', atPol), part('covers everyone', atPol, { cite: 'who' })]
    const how = v?.matches && v.kind === 'groups' && v.label ? ` through ${v.label}` : v?.matches && v.kind === 'person' ? ' by name' : ''
    const c = `covers ${them}${how}`
    const groupsNamed = v?.matches && v.kind === 'groups' ? v.groups.map((g): Seg => ({ text: g.name, entity: 'group', glyph: { kind: 'group' } })) : []
    const person: Seg[] = named && !asGroup && inp.name ? [{ text: first, entity: 'person', glyph: { kind: 'face', name: inp.name } }] : []
    const segs = splitBy(c, [...person, ...groupsNamed])
    return [pol(), part(' ', atPol), part(c, atPol, { cite: 'who', segs })]
  }
  const cover = coverOf(false)
  const coverNamed = coverOf(true)

  // --- The rule, and the fact that decided it ---
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const real = plan.rules.filter((r) => r.index !== null)
  const dRule = decisive ? plan.rules[decisive.rule] : undefined
  const dCheck = decisive && dRule ? dRule.checks[decisive.check] : undefined
  const atRule = provenAt.rule
  const atCheck = provenAt.check
  /* The fact's mark: before the device, the network, the score ("his risk score of 12": before "risk score"). */
  const factSegs = (text: string, c: CheckRow): Seg[] => {
    const picks = checkPicks(c, inp)
    const risk = c.category === 'risk' ? picks.find((x) => x.glyph) : undefined
    return splitBy(text, risk ? [{ ...risk, text: 'risk score' }] : picks)
  }
  let rule: Part[] = []
  let fact: Part[] = []
  let could: Part[] = []
  let ruleShort: Part[] = []
  if (land && kind === 'depends') {
    const unk = real.filter((r) => r.state === 'unknown')
    const nos = unk.length > 0 ? listNos(unk) : 'its rules'
    const without = needs.length > 0 ? ` without ${pr.poss} ${needs.join(` and ${pr.poss} `)}` : ''
    rule = [part(nos, atRule, { cite: 'rule', segs: unk.length > 0 ? marked(nos, { kind: 'rule' }) : undefined }), part(` can’t tell${without}`, atRule)]
    ruleShort = rule
    if (o.status === 'depends' && o.possible.length > 0) could = [part('it could be ', atOut), part(orList(o.possible), atOut, { cite: 'outcome' })]
  } else if (land && land.index !== null) {
    rule = [part(ruleNo(land), atRule, { cite: 'rule', segs: marked(ruleNo(land), { kind: 'rule' }) }), part(' matches', atRule)]
    ruleShort = [part(ruleNo(land), atRule, { cite: 'rule', segs: marked(ruleNo(land), { kind: 'rule' }) })]
    if (dCheck) {
      const w = factWords(dCheck, who)
      fact = [part(w, atCheck, { cite: 'check', segs: factSegs(w, dCheck) })]
    }
  } else if (land) {
    const none = real.length === 0 ? 'it has no rules' : real.length === 1 ? 'its one rule doesn’t match' : `none of its ${real.length} rules match`
    rule = [part(none, atRule, { cite: 'rule' }), part(', so Nothing else matched decides', atRule)]
    ruleShort = [part('Nothing else matched', atRule, { cite: 'rule', segs: marked('Nothing else matched', { kind: 'rule' }) })]
    if (dCheck && dRule) {
      const w = `${ruleNo(dRule)}: ${factWords(dCheck, who)}`
      fact = [part(w, atCheck, { cite: 'check', segs: factSegs(w, dCheck) })]
    }
  }

  // --- The because ---
  const reason: Part[] = [...cover]
  if (rule.length > 0) {
    if (reason.length > 0) reason.push(part(land && land.index === null && kind !== 'depends' && real.length > 0 ? ', but ' : ', and ', atRule))
    reason.push(...rule)
  }
  if (fact.length > 0) reason.push(part(land && land.index === null ? ' — ' : ': ', atCheck), ...fact)
  if (could.length > 0) reason.push(part(' — ', atOut), ...could)

  const parts: Part[] = reason.length > 0 ? [...answer, part(': ', atPol), ...reason, part('.', atOut)] : [...answer, part('.', atOut)]

  // --- The question, and its reply ---
  const question: Part[] = kind === 'none' ? [] : [part('Can ', 0), subjectMid(), part(' get into ', 0), app(), part('?', 0)]
  let reply: TextModel['reply']
  if (kind === 'allow' && decided) {
    reply = { word: part('Yes', atOut, { cite: 'outcome', answer: true, segs: marked('Yes', { kind: 'outcome', decision: decided }) }), rest: [{ ...outcome, key: `t${k++}`, answer: false, segs: undefined }] }
  } else if (kind === 'deny') {
    reply = { word: part('No', atOut, { cite: 'outcome', answer: true, segs: marked('No', { kind: 'outcome', decision: 'deny' }) }), rest: [part('access is denied', atOut)] }
  } else if (kind === 'depends') {
    const on = needs.length > 0 ? `on the ${needs.join(' and the ')}` : 'on a fact not stated'
    reply = { word: part('It depends', atOut, { cite: 'outcome', answer: true, segs: marked('It depends', { kind: 'outcome', decision: 'depends' }) }), rest: [part(on, atOut)] }
  } else {
    reply = { word: { ...outcome, text: upperFirst(outcome.text), key: `t${k++}` }, rest: [] }
  }

  // --- The reason, short ---
  const short: Part[] = []
  if (decider && kind !== 'none') {
    short.push(part(decider.name, atPol, { cite: 'policy', segs: marked(decider.name, { kind: 'policy' }) }))
    if (ruleShort.length > 0) short.push(part(' · ', atRule), ...ruleShort.map((p) => ({ ...p, key: `t${k++}` })))
    const tail = fact.length > 0 ? fact : could
    if (tail.length > 0) short.push(part(': ', tail[0].at), ...tail.map((p) => ({ ...p, key: `t${k++}` })))
    short.push(part('.', atOut))
  }

  // --- What was passed over ---
  const struck: Struck[] = []
  for (let i = 0; i < Math.max(0, deciderIx); i++) {
    const p = plan.policies[i]
    if (p.kind !== 'lost' && p.kind !== 'waiting') continue
    const off = p.kind === 'waiting'
    struck.push({ key: `p:${p.policyId}`, kind: 'policy', label: p.name, name: '', reason: off ? (p.status === 'draft' ? 'not turned on yet' : 'switched off') : `doesn’t cover ${asGroup ? 'them' : first}`, at: p.settleAt >= 0 ? p.settleAt : atPol, cite: 'policy' })
  }
  if (plan.landing !== null && kind !== 'depends') {
    plan.rules.forEach((r, i) => {
      if (i >= (plan.landing ?? 0) || r.index === null || !r.visited) return
      if (r.state !== 'no-match' && r.state !== 'off') return
      const fc = r.failing !== null ? r.checks[r.failing] : undefined
      const why = r.state === 'off' ? 'switched off' : fc ? factWords(fc, who) : r.miss ? plainWords(r.miss.replace(/^\w+ · /, ''), who) : 'doesn’t match'
      struck.push({ key: `r:${r.id}`, kind: 'rule', label: ruleNo(r), name: r.name, reason: why, at: r.endAt >= 0 ? r.endAt : atRule, cite: 'rule' })
    })
  }

  return { kind, tone, subject, pronoun, answer, outcome, cover, coverNamed, rule, fact, could, reason, parts, question, reply, short, struck, spoken: plainOf(parts) }
}
