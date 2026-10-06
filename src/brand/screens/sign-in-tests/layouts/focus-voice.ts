import type { EngineRule, EngineRun } from '../engine-run'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { ruleState, type Moment } from './focus-model'

/* -----------------------------------------------------------------------------
   Focus's voice (FocusLayout.tsx): ONE short line per moment of the run, in
   plain IdP words, said as that moment SETTLES on screen — the sign-in as
   the run starts, the policy once the first that covers the person lights,
   each rule once its mark lands, the answer as it lands:

     "Maya Iyer signs in to AWS Console from the office network."
     "AWS for engineering teams covers Maya, through Engineering."
     "Rule 1 doesn't apply: Maya Iyer is not in Contractors."
     "Rule 2 matches."
     "Access granted, on one factor."

   The same line is the subtitle under the card in focus (it reads muted
   too). Pure: drawn from the plan and the moments (focus-model.ts); `at` is
   the step the line is due at, so the layout says it in step with the
   carousel and never moves the clock.
   -------------------------------------------------------------------------- */

export interface Beat {
  /** The moment's key (focus-model.ts `Moment.key`). */
  key: string
  /** The step it is due at: when what it says is on screen. */
  at: number
  line: string
  /** The few words said instead when the voice has fallen behind the run. */
  short: string
  /** The step its moment comes into focus at: once a later moment has, this line is behind. */
  from: number
  /** How many moments behind the carousel this line may fall before the voice lets it go to catch up
   *  (a rule that matched or the catch-all's "if not": 1, the answer says it; the sign-in, the policy, a rule that can't tell: 2 —
   *  the answer names what it depends on); absent, never (a failing rule, the answer). */
  dropAt?: number
  /** Let go to catch up, its few words still lead the next line said ("Rule 2 matches. Access granted, on one factor."). */
  carry?: boolean
}

export interface VoiceNames {
  /** "Maya Iyer", or "Anyone in Finance". */
  person: string
  /** "Maya", or "them". */
  first: string
  app: string
  /** Where the sign-in is from, as the form states it ("Office network"), or null. */
  from: string | null
}

const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t)
const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)

/* "Office network" → "the office network"; "Home broadband" → "home broadband"; an address as typed. */
function fromWords(from: string): string {
  if (/\d/.test(from)) return from
  const w = lowerFirst(from)
  if (/^office network$/i.test(w)) return 'the office'
  return /(network|office|offices)$/i.test(w) ? `the ${w}` : w
}

/* What a failing check is about, said after "fails on". */
const FAILS_ON: Partial<Record<string, string>> = { network: 'the network', place: 'the location', device: 'the device', time: 'the time', risk: 'the risk level', app: 'the application' }

const ruleWord = (r: EngineRule) => (r.index === null ? 'The last rule' : `Rule ${r.index + 1}`)

/** The step a rule's mark lands at: the first step from its start it reads settled. */
function settleStep(plan: EngineRun, r: EngineRule): number {
  const last = Math.max(0, plan.steps.length - 1)
  for (let s = Math.max(0, r.startAt); s <= last; s++) {
    const st = ruleState(r, s)
    if (st !== 'working' && st !== 'waiting' && st !== 'quiet') return s
  }
  return last
}

/* A finding said to a person: "Maya Iyer is not in Contractors" → "Maya isn't in Contractors". */
function spoken(line: string, names: VoiceNames): string {
  let t = line
  if (names.person && names.first && names.person !== names.first && !names.person.startsWith('Anyone')) t = t.split(names.person).join(names.first)
  return t.replace(/\b(is|does|has) not\b/g, (_, v: string) => `${v}n't`)
}

function ruleLine(r: EngineRule, names: VoiceNames): { line: string; short: string } {
  const who = ruleWord(r)
  switch (r.state) {
    case 'match':
      return r.index === null ? { line: 'Nothing else matched, so the last rule decides.', short: 'Nothing else matched.' } : { line: `${who} matches.`, short: `${who} matches.` }
    case 'no-match': {
      const c = r.failing !== null ? r.checks[r.failing] : r.checks.find((x) => x.status === 'fail')
      /* The few words still say what failed: "Rule 1 isn't for Maya.", "Rule 1 fails on the network." */
      const short = !c ? `${who} doesn't apply.` : c.category === 'who' ? `${who} isn't for ${names.first}.` : `${who} fails on ${FAILS_ON[c.category] ?? 'a check'}.`
      return { line: c?.line ? `${who} doesn't apply: ${end(spoken(c.line, names))}` : `${who} doesn't apply.`, short }
    }
    case 'unknown': {
      const c = r.checks.find((x) => x.status === 'unknown')
      return { line: c ? `${who} can't tell: the ${c.word.toLowerCase()} isn't stated.` : `${who} can't tell.`, short: `${who} can't tell.` }
    }
    case 'possible':
      return { line: 'If not, nothing else matches.', short: 'If not, nothing else.' }
    case 'off':
      return { line: `${who} is switched off.`, short: `${who} is off.` }
    default:
      return { line: '', short: '' }
  }
}

function factorOf(screens: readonly SignInScreens[]): string {
  const sc = screens.find((x) => x.decision === '2fa')
  const steps = (sc?.steps ?? []).filter((st) => st.kind !== 'deny' && st.kind !== 'password')
  const last = steps[steps.length - 1]
  return last ? stepLabel(last) : ''
}

/** The verdict, said: "Access granted, on one factor." */
export function verdictLine(plan: EngineRun, screens: readonly SignInScreens[]): string {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) {
    if (o.decision === 'deny') return 'Access denied.'
    if (o.decision === '2fa') {
      const f = factorOf(screens)
      return f ? `Access granted, with a second factor: ${f}.` : 'Access granted, with a second factor.'
    }
    return 'Access granted, on one factor.'
  }
  if (o.status === 'depends') {
    const needs = o.view.needs.map((n) => n.toLowerCase())
    return needs.length === 0 ? 'It depends on a fact not stated.' : `It depends on the ${needs.length === 1 ? needs[0] : `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1]}`}.`
  }
  return 'No policy decides.'
}

/** The answer's beat says WHY, not the verdict again (the card already says Deny): "No rule above fits Devon, so the
    last rule denies.", "Rule 2 denies Devon.", "Rule 2 lets Devon in with 2FA.", "The Global Default lets Kavya in.",
    "It depends on the network." */
export function reasonLine(plan: EngineRun, screens: readonly SignInScreens[], names: Pick<VoiceNames, 'first'>): string {
  const o = plan.outcome
  if (!(o.status === 'decided' && o.decision)) return verdictLine(plan, screens)
  const first = names.first || 'them'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const f = factorOf(screens)
  const lets = o.decision === 'deny' ? '' : o.decision === '2fa' ? ` in with ${f || 'a second factor'}` : ' in on one factor'
  if (plan.decider?.isGlobalDefault && (!landing || landing.index === null)) return o.decision === 'deny' ? `The Global Default denies ${first}.` : `The Global Default lets ${first} in.`
  if (!landing) return verdictLine(plan, screens)
  if (landing.index === null) return o.decision === 'deny' ? `No rule above fits ${first}, so the last rule denies.` : `No rule above fits ${first}, so the last rule lets ${first === 'them' ? 'them' : first}${lets}.`
  const who = `Rule ${landing.index + 1}`
  return o.decision === 'deny' ? `${who} denies ${first}.` : `${who} lets ${first}${lets}.`
}

/** "None of AWS for engineering teams's 3 rules match" → "None of the 3 rules in AWS for engineering teams match":
    a policy's name never takes 's (the assistant's lines, said and shown in Focus). */
export function fixPossessive(t: string): string {
  return t
    .replace(/None of (.+?)'s (\d+) rules match/g, 'None of the $2 rules in $1 match')
    .replace(/None of (.+?)'s rule matches/g, 'The one rule in $1 does not match')
}

/** Every moment's line, in order, with the step it is due at. Never throws. */
export function beatsOf(plan: EngineRun, moments: readonly Moment[], names: VoiceNames, screens: readonly SignInScreens[]): Beat[] {
  const out: Beat[] = []
  try {
    if (plan.empty) return out
    const last = Math.max(0, plan.steps.length - 1)
    for (const m of moments) {
      if (m.kind === 'sign') {
        const line = `${names.person} signs in to ${names.app}${names.from ? ` from ${fromWords(names.from)}` : ''}.`
        out.push({ key: m.key, at: Math.max(0, m.at), line, short: `${names.person} signs in to ${names.app}.`, from: m.at, dropAt: 2 })
      } else if (m.kind === 'policies') {
        const d = plan.decider
        const dp = plan.policies.find((p) => p.decides)
        let line = `No policy decides on ${names.app}.`
        let short = 'No policy decides.'
        if (d) {
          if (d.isGlobalDefault) {
            line = plan.policies.some((p) => !p.isGlobalDefault) ? `No ${names.app} policy covers ${names.first}, so the Global Default applies.` : `${names.app} has no policy of its own, so the Global Default applies.`
            short = 'The Global Default applies.'
          } else {
            const via = plan.conflicts?.policies[0]?.deciderVia
            const through = via?.matches && via.kind === 'groups' ? `, ${via.say.replace(/^via /, 'through ')}` : ''
            line = `${d.name} covers ${names.first}${through}.`
            /* Its number first, so a name that is itself a sentence still reads ("Policy 1 applies: AWS for engineering teams.");
               a long name is left to the subtitle, so the voice keeps up ("Policy 1 applies."). */
            short = dp ? (d.name.length <= 32 ? `Policy ${dp.order} applies: ${end(d.name)}` : `Policy ${dp.order} applies.`) : `${d.name} applies.`
          }
        }
        out.push({ key: m.key, at: dp ? Math.min(last, Math.max(m.at, dp.settleAt)) : last, line, short, from: m.at, dropAt: 2 })
      } else if (m.kind === 'rule') {
        const r = plan.rules[m.rule ?? -1]
        if (!r) continue
        const { line, short } = ruleLine(r, names)
        if (line) out.push({ key: m.key, at: settleStep(plan, r), line, short, from: m.at, ...(r.state === 'match' ? { dropAt: 1, carry: true } : r.state === 'possible' ? { dropAt: 1 } : r.state === 'unknown' ? { dropAt: 2 } : {}) })
      } else {
        const v = reasonLine(plan, screens, names)
        /* Said as the answer lands (focus-model.ts `landedAt`), not as the engine starts deciding. */
        out.push({ key: m.key, at: plan.at.outcome >= 0 ? Math.min(last, plan.at.outcome) : last, line: v, short: v, from: m.at })
      }
    }
  } catch {
    /* A plan the words cannot read: no voice, never a throw. */
  }
  return out
}
