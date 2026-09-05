import { blankRule, card, cond, when, type AccessDecision, type Condition, type Policy, type Rule, type ZoneScope } from '../data'
import { ckey, isSingleAndRun, sig } from '../predicate'
import { SIM_USERS, decide, inAudience, walk, type SimEnv, type SimUser, type TraceResult } from './simulate'

/* -----------------------------------------------------------------------------
   The Gauntlet — the "check" function, played rather than read.

   A policy author has one question they cannot answer by looking at their own
   rules: *what gets through*. The Test dialog answers it one sign-in at a time,
   which means you only ever find the holes you already suspected. The Gauntlet
   deals a fixed deck of sign-in attempts at the policy — some hostile, some
   entirely ordinary — and scores what came back.

   Two design rules keep this a tool rather than a toy:

   1. **The score is derived, never awarded.** Every number below is a count of
      deck cards whose actual decision differed from the treatment the card
      declares it should get. There is no XP, no points-per-action, nothing that
      only goes up. A policy that gets worse scores worse.

   2. **The expectation is the tenant's to disagree with.** Each card states the
      treatment it expects AND why. If an administrator decides a contractor on
      an unmanaged device really is fine on one factor, they flip the card's
      expectation and the grade recomputes. A fixed opinion baked into a score
      would be a vendor telling a customer their policy is wrong; an editable
      one is a checklist they own.

   The evaluator is `simulate.ts` — the same one the Test dialog and the Impact
   arena use. The Gauntlet cannot claim a breach the Test dialog would not
   reproduce.
   -------------------------------------------------------------------------- */

/** What a card says *should* happen, in the model's three treatments. */
export type Expect = AccessDecision

export const EXPECT_LABEL: Record<Expect, string> = {
  deny: 'Blocked',
  '2fa': 'Verified',
  '1fa': 'Straight in',
}

/** How strict a treatment is. Used to say whether a result was weaker or
    heavier than the card asked for — the two failures are not the same kind. */
const STRICTNESS: Record<AccessDecision, number> = { '1fa': 0, '2fa': 1, deny: 2 }

/* One condition of a fix spec, in the same shape `cond()` takes.

   `scope` is here so a spec can name the half of a zone it means. Without it,
   the conditions this spec builds could never be the twin of a rule an author
   had narrowed to one half — `ckey` would separate them, the exact match would
   miss, and the fix would offer to insert a broader duplicate above it. */
export interface SpecCondition {
  typeId: string
  operator: string
  values: string[]
  scope?: ZoneScope
}

export interface Challenge {
  id: string
  /** Hostile attempts are the ones a miss on is a breach. */
  kind: 'threat' | 'legit'
  name: string
  /** One line, in the voice of what is actually happening. */
  story: string
  userId: string
  place: string
  device: string
  authState: string
  risk: string
  /** Pinned per card so a run is reproducible and time rules are testable. */
  at: string
  want: Expect
  /** Why that treatment, stated so the expectation can be argued with. */
  why: string
  /* The rule that closes this card when it leaks.

     Authored per card rather than derived from the context. Deriving one is
     easy and wrong: the context of a single card names a specific person, a
     specific device and a specific hour, so a generated rule would close this
     card and nothing else — advice narrow enough to be useless, presented with
     the authority of a suggestion. What is written here is the signal that
     makes the card hostile, which is the thing worth writing a rule about. */
  fix?: {
    name: string
    conditions: SpecCondition[]
    why: string
  }
}

/* The deck.

   Chosen to cover the axes the condition catalogue actually models — network
   zone, device fingerprint, MDM, registration, trust age, risk signal, auth state,
   user type, time of day — with at least one hostile and one ordinary card on
   most of them. A deck that was all attacks would score a policy that denies
   everything as perfect, which is why half of these are people trying to do
   their jobs. */
export const DECK: Challenge[] = [
  {
    id: 'tor-exec',
    kind: 'threat',
    name: 'Executive account from a Tor exit',
    story: 'Someone signs in as an executive from an anonymising network on a device nobody has seen before.',
    userId: 'mehak', place: 'Tor exit node', device: 'New / unknown', authState: 'Normal returning user', risk: 'High', at: '02:40',
    want: 'deny',
    why: 'An anonymised origin on an unknown device is the shape of a credential-stuffing success. There is no legitimate reading of it.',
    fix: {
      name: 'Block anonymised sources',
      conditions: [{ typeId: 'zone', operator: 'in zone', values: ['anon'] }],
      why: 'Catches every anonymised origin, not just this one. Tor and commercial proxies share the same zone, so one rule closes both.',
    },
  },
  {
    id: 'proxy-finance',
    kind: 'threat',
    name: 'Finance account behind a known proxy',
    story: 'A finance user appears from a commercial proxy on a device whose fingerprint has changed.',
    userId: 'priya', place: 'Known proxy', device: 'Changed fingerprint', authState: 'Normal returning user', risk: 'Medium', at: '11:20',
    want: 'deny',
    why: 'Regulated data on a device whose fingerprint changed is the case this exists for.',
    fix: {
      name: 'Block anonymised sources',
      conditions: [{ typeId: 'zone', operator: 'in zone', values: ['anon'] }],
      why: 'The proxy is the signal worth acting on. Writing the rule against the device or the person would leave the same route open to everyone else.',
    },
  },
  {
    id: 'no-mfa',
    kind: 'threat',
    name: 'Account with no second factor enrolled',
    story: 'A contractor with no MFA configured signs in from outside every known zone.',
    userId: 'devon', place: 'Outside all zones', device: 'New / unknown', authState: 'No MFA configured', risk: 'High',  at: '23:05',
    want: 'deny',
    why: 'Asking for a second factor the account cannot produce is the same as asking for nothing. Enrolment has to happen before access, not instead of it.',
    fix: {
      name: 'Block accounts with no second factor',
      conditions: [{ typeId: 'auth-state', operator: 'is', values: ['No MFA configured'] }],
      why: 'Asking for a factor the account cannot produce is the same as asking for nothing. Enrolment has to happen before access, not instead of it.',
    },
  },
  {
    id: 'expired-trust',
    kind: 'threat',
    name: 'Device whose trust has expired',
    story: 'A device last verified over a year ago comes back from an unrecognised network.',
    userId: 'arun', place: 'Outside all zones', device: 'Expired trust', authState: 'Normal returning user', risk: 'Low', at: '14:10',
    want: '2fa',
    why: 'Expired trust is not the same as a hostile device — re-verify it, do not lock the person out of their work.',
    fix: {
      name: 'Verify unmanaged devices',
      conditions: [{ typeId: 'mdm', operator: 'is', values: ['Not enrolled'] }],
      why: 'Enrolment is the durable signal here. Trust age drifts as devices come and go; MDM state does not.',
    },
  },
  {
    id: 'nightshift',
    kind: 'threat',
    name: 'Contractor at 03:00',
    story: 'A contractor account is used at three in the morning, well outside contract hours.',
    userId: 'devon', place: 'Outside all zones', device: 'Known < 90 days', authState: 'Normal returning user', risk: 'Low', at: '03:10',
    want: '2fa',
    why: 'Odd hours alone are weak evidence — plenty of people work late. Verify, do not accuse.',
    fix: {
      name: 'Verify contractors',
      conditions: [{ typeId: 'user-type', operator: 'is', values: ['Contractor'] }],
      why: 'Written against who they are rather than the hour, because the hour is weak evidence and the contract status is not.',
    },
  },
  {
    id: 'risk-inside',
    kind: 'threat',
    name: 'High risk signal from inside the office',
    story: 'The risk engine flags a session that is otherwise coming from the corporate network.',
    userId: 'priya', place: 'Office Network', device: 'Managed (MDM)', authState: 'Normal returning user', risk: 'High', at: '15:45',
    want: '2fa',
    why: 'A trusted network is not a trusted session. If the office is a free pass, an attacker only has to get inside it once.',
    fix: {
      name: 'Verify elevated risk',
      conditions: [{ typeId: 'ml-risk', operator: 'is', values: ['High'] }],
      why: 'A trusted network is not a trusted session. Without this, an attacker only has to get inside the office once.',
    },
  },
  {
    id: 'unmanaged-contractor',
    kind: 'threat',
    name: 'Contractor on an unmanaged device',
    story: 'A contractor signs in from their own laptop, never enrolled in MDM.',
    userId: 'devon', place: 'Outside all zones', device: 'New / unknown', authState: 'Normal returning user', risk: 'Medium', at: '10:05',
    want: '2fa',
    why: 'Non-employees on their own hardware are the standard step-up case. Blocking them outright usually just moves the work somewhere unmanaged.',
    fix: {
      name: 'Verify unmanaged devices',
      conditions: [{ typeId: 'mdm', operator: 'is', values: ['Not enrolled'] }],
      why: 'Covers every unmanaged device, not only contractors — an employee on personal hardware is the same exposure.',
    },
  },

  {
    id: 'office-regular',
    kind: 'legit',
    name: 'Ordinary morning sign-in',
    story: 'An engineer opens their laptop at the office on a managed device.',
    userId: 'arun', place: 'Office Network', device: 'Managed (MDM)', authState: 'Normal returning user', risk: 'Low', at: '09:30',
    want: '1fa',
    why: 'Every signal is good. If this one is challenged, the policy is charging its friction to the people least likely to be an attacker.',
  },
  {
    id: 'exec-office',
    kind: 'legit',
    name: 'Executive at their desk',
    story: 'An executive signs in from the office on a corporate-managed machine.',
    userId: 'mehak', place: 'Office Network', device: 'Managed (MDM)', authState: 'Normal returning user', risk: 'Low', at: '08:55',
    want: '1fa',
    why: 'Seniority is not risk. If executives are challenged for being executives, they are the people who will ask for an exemption.',
  },
  {
    id: 'finance-home',
    kind: 'legit',
    name: 'Finance working from home',
    story: 'A finance user signs in from home on their usual, recently verified laptop.',
    userId: 'priya', place: 'Outside all zones', device: 'Known < 90 days', authState: 'Normal returning user', risk: 'Low', at: '19:20',
    want: '2fa',
    why: 'Off-network access to regulated data is worth one extra step. It is not worth a denial — that is how shadow IT starts.',
    fix: {
      name: 'Verify unmanaged devices',
      conditions: [{ typeId: 'mdm', operator: 'is', values: ['Not enrolled'] }],
      why: 'Off-network is the obvious reading, but enrolment is the better one: it catches the same sign-in without punishing a managed laptop for being at home.',
    },
  },
  {
    id: 'first-login',
    kind: 'legit',
    name: 'Brand new joiner',
    story: 'A new starter signs in for the first time, at the office, on a machine with no history.',
    userId: 'priya', place: 'Office Network', device: 'New / unknown', authState: 'First time login', risk: 'Low', at: '09:05',
    want: '2fa',
    why: 'First login is the one moment an account is worth binding to a person. Skipping it means the first real verification never happens.',
    fix: {
      name: 'Verify first login and resets',
      conditions: [{ typeId: 'auth-state', operator: 'is', values: ['First time login'] }],
      why: 'First login is the one moment an account is worth binding to a person. Skip it and the first real verification never happens.',
    },
  },
  {
    id: 'after-reset',
    kind: 'legit',
    name: 'Straight after an MFA reset',
    story: 'Someone who just had their second factor reset by the help desk signs back in.',
    userId: 'arun', place: 'Office Network', device: 'Known < 90 days', authState: 'MFA recently reset', risk: 'Low', at: '13:40',
    want: '2fa',
    why: 'A help-desk reset is the most impersonated event in identity. Re-verifying here is what stops a phone call from becoming an account takeover.',
    fix: {
      name: 'Verify first login and resets',
      conditions: [{ typeId: 'auth-state', operator: 'is', values: ['MFA recently reset'] }],
      why: 'A help-desk reset is the most impersonated event in identity. This is what stops a phone call becoming an account takeover.',
    },
  },
  {
    id: 'roaming-unknown-origin',
    kind: 'legit',
    name: 'Travelling, origin unclear',
    story: 'A long-trusted device appears from a network the platform cannot place in any zone.',
    userId: 'arun', place: 'Any location', device: 'Known > 90 days', authState: 'Normal returning user', risk: 'Low', at: '17:15',
    want: '2fa',
    why: 'When the origin cannot be established, zone rules decide nothing. Something else has to, or the sign-in falls through to the default unexamined.',
    fix: {
      name: 'Verify unmanaged devices',
      conditions: [{ typeId: 'mdm', operator: 'is', values: ['Not enrolled'] }],
      why: 'Zone rules decide nothing when the origin cannot be placed, so the rule has to read something that is always known. Enrolment always is.',
    },
  },
]

/** The four ways a card can come back. Named for what happened, not for a
    colour, because the names are read out in the result list. */
export type Outcome = 'held' | 'breach' | 'lockout' | 'friction'

export const OUTCOME_LABEL: Record<Outcome, string> = {
  held: 'Held',
  breach: 'Got through',
  lockout: 'Locked out',
  friction: 'Over-challenged',
}

/* One card's expectation against one card's result.

   `breach` is reserved for the weaker-than-asked direction — the policy let
   something past that the card said to stop. `lockout` is the opposite extreme
   in the other direction, and only when the card wanted a clean sign-in and got
   a denial: an ordinary user who cannot work is a real failure, not a rounding
   error. Everything else stricter-than-asked is `friction`, which is a cost
   worth seeing but not a defect. */
export function classify(want: Expect, got: AccessDecision): Outcome {
  if (want === got) return 'held'
  if (STRICTNESS[got] < STRICTNESS[want]) return 'breach'
  if (want === '1fa' && got === 'deny') return 'lockout'
  return 'friction'
}

export interface Round {
  challenge: Challenge
  user: SimUser
  /** The expectation actually used — the card's, or the tenant's override. */
  want: Expect
  decision: AccessDecision
  outcome: Outcome
  /** Which rule produced the decision. Null means nothing matched. */
  hitIndex: number | null
  hitName: string | null
}

export interface GauntletResult {
  rounds: Round[]
  held: number
  breaches: number
  lockouts: number
  friction: number
  /** Longest unbroken run of `held` in deck order. */
  streak: number
  grade: Grade
  /** The sentence that explains the grade, in the grade's own terms. */
  gradeReason: string
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/* The ladder, written out rather than computed from a weighted sum.

   A weighted score would let three points of friction cancel a breach, and no
   security team would accept that trade. Breaches dominate absolutely; lockouts
   are next because a policy nobody can sign in through gets switched off within
   a week; friction is last because it is a cost, not a failure. */
function gradeOf(breaches: number, lockouts: number, friction: number): { grade: Grade; reason: string } {
  if (breaches > 1)
    return { grade: 'F', reason: `${breaches} hostile attempts were let through with less than the policy should ask for.` }
  if (breaches === 1)
    return { grade: 'D', reason: 'One hostile attempt was let through with less than the policy should ask for.' }
  if (lockouts > 0)
    return {
      grade: 'C',
      reason: `Nothing got through, but ${lockouts} ordinary sign-in${lockouts === 1 ? '' : 's'} ${lockouts === 1 ? 'was' : 'were'} denied outright.`,
    }
  if (friction > 2)
    return { grade: 'B', reason: `Nothing got through and nobody was locked out, but ${friction} ordinary sign-ins were challenged more than the deck asks for.` }
  if (friction > 0)
    return { grade: 'A', reason: `Every card landed as expected, bar ${friction} extra challenge${friction === 1 ? '' : 's'}.` }
  return { grade: 'A', reason: 'Every card in the deck landed exactly as expected.' }
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

export const userOf = (id: string) => SIM_USERS.find((u) => u.id === id) ?? SIM_USERS[0]

export function contextFor(c: Challenge) {
  return {
    user: userOf(c.userId),
    place: c.place,
    device: c.device,
    authState: c.authState,
    risk: c.risk,
    nowMinutes: toMinutes(c.at),
  }
}

/** The full trace for one card — used when a round is opened up to see why. */
export function traceFor(policy: Policy, c: Challenge, env: SimEnv): TraceResult {
  return walk(policy, contextFor(c), env)
}

/* -----------------------------------------------------------------------------
   The proposed fix.

   Only offered for a breach. A card that came back *stricter* than it asked for
   is not closed by adding a rule — some existing rule is already too broad, and
   the trace above names it. Offering "add a rule" there would be advice that
   makes the policy worse in the direction it is already wrong.

   The position is as much of the fix as the rule is. First match wins, so a
   rule inserted below the one that let the sign-in through never runs: if the
   card was decided by rule 3, the fix goes AT index 3 and pushes the old rule
   down. Where nothing matched at all, it appends — there was no competing rule
   to get above.
   -------------------------------------------------------------------------- */
export interface ProposedFix {
  /* Insert a new rule, or re-aim one the policy already has.

     The distinction is not cosmetic. Inserting a rule whose predicate already
     exists on another rule produces two rules with the same audience and the
     same conditions and different outcomes — which `diagnose()` correctly calls
     a contradiction, and which blocks publishing. A one-click fix that leaves
     the policy unpublishable is not a fix, so when the predicate is already
     written down somewhere the proposal changes THAT rule instead. */
  kind: 'insert' | 'retune'
  /** The rule as it should end up. */
  rule: Rule
  /** Where it should end up. Position is most of the fix under first-match. */
  at: number
  /** For a retune, the rule being changed — removed from here before landing. */
  fromIndex?: number
  why: string
  /** What the position is doing, when it is doing something. */
  placement: string | null
  /** The button's label, which has to name the actual edit. */
  headline: string
}

/* Identity of a predicate. Points at `sig`, the one canonical form, so a twin
   is recognised by the same rule the linter and the change list use. A card
   spec here is one AND-run, which is exactly one card.

   It said that and did not do it. This built its own string — the same leaf
   format, sorted the same way, joined with `␟` — while `sig` joins an AND-run
   with `∧`. So `sig(r.when) === specKey(spec.conditions)` could only ever hold
   for a spec of exactly ONE condition, where neither separator appears; every
   multi-condition fix missed its own twin and fell through to proposing an
   insert. A broader rule inserted above a narrower one is a shadow, which the
   linter then refuses to publish — so the bug surfaced as an unpublishable
   suggestion rather than as a wrong answer, which is why it survived.

   Built through the real constructors now, so there is one canonical form and
   this cannot drift from it again. */
/* One place a spec becomes real conditions.

   There were three, and they had drifted apart in the way three copies of one
   mapping always do: `specKey` built them to sign the spec, the `insert` branch
   at the foot built them again to make the rule, and `want` did not build them
   at all — it hand-inlined `ckey`'s string format, which then had to be kept in
   step with `ckey` by hand and was not. Adding a segment to `ckey` broke it
   silently: `covers` compared a four-segment key against a three-segment one
   and matched nothing, so every fix fell through to proposing an insert above a
   rule that already said the same thing — the exact unpublishable-shadow bug
   the comment above `specKey` was written about.

   One builder now, and the two identities are both derived from what it makes. */
const specConds = (conditions: SpecCondition[]): Condition[] =>
  conditions.map((c) => cond(c.typeId, c.operator, [...c.values], c.scope))

const specKey = (conditions: SpecCondition[]) => sig(when(card(...specConds(conditions))))

export function proposeFix(round: Round, policy: Policy): ProposedFix | null {
  const spec = round.challenge.fix
  if (!spec || round.outcome !== 'breach') return null

  const at = round.hitIndex ?? policy.rules.length
  const decider = round.hitIndex === null ? null : policy.rules[round.hitIndex]

  /* Does the policy already say this, just too weakly or too late?

     The test is on the predicate AND the audience, and the audience half is the
     one that matters. An earlier attempt only counted all-audience rules, on
     the reasoning that re-aiming a group-scoped rule changes something the
     administrator did not ask to change. That was wrong in the way that
     produces bugs: the Finance seed has "Contractor baseline" scoped to
     Contractors with exactly the predicate a fix wants, so the proposal
     inserted a broader duplicate ABOVE it — and a broad rule above a narrow one
     with the same predicate makes the narrow one unreachable, which the linter
     flags and which blocks Publish.

     So a rule counts as a twin when it shares the predicate and its audience
     covers the person on the card. Re-aiming it is then the minimal edit that
     closes the card, and the placement text says whose treatment changed. */
  /* The audience half of the twin test is gone: every rule in a policy covers
     the same people now, so "and its audience covers the person on the card" is
     a question about the POLICY, asked once by the deck filter before any card
     is scored.

     What replaced it is SUPERSET matching, and that is not a convenience — it
     is required for correctness. A rule that used to be `appliesTo: ['finance']`
     plus one condition is now ONE card holding a group condition AND that
     condition, so an exact predicate match no longer finds it. Falling through
     to `insert` then puts the fix's broader predicate directly above the
     narrower rule and makes it permanently unreachable, which the linter
     correctly refuses to publish — a one-click fix that breaks the policy it
     was offered on.

     So: the twin is the earliest single-card rule whose conditions CONTAIN the
     spec's, preferring an exact match. Only single-card rules qualify, because
     a rule with alternatives is not made unreachable by a broader rule above it
     in the same way and re-aiming it would change more than the card asks. */
  const want = new Set(specConds(spec.conditions).map(ckey))
  /* And an AND-run specifically: a single card whose conditions are joined by
     OR covers none of them jointly, so re-aiming it would not do what the fix
     spec asks. */
  const covers = (r: Rule) =>
    isSingleAndRun(r.when) &&
    [...want].every((k) => r.when.cards[0].conditions.some((c) => ckey(c) === k))
  const exact = policy.rules.findIndex((r) => sig(r.when) === specKey(spec.conditions))
  const twinIndex = exact !== -1 ? exact : policy.rules.findIndex(covers)

  if (twinIndex !== -1) {
    const twin = policy.rules[twinIndex]
    const tooWeak = twin.decision !== round.want
    const tooLate = twinIndex > at

    return {
      kind: 'retune',
      rule: { ...twin, decision: round.want },
      at,
      fromIndex: twinIndex,
      why: spec.why,
      placement:
        tooWeak && tooLate
          ? `Rule ${twinIndex + 1} · ${twin.name} already checks this, but it is weaker than the card asks for and sits below rule ${at + 1}, which decides the sign-in first. Re-aimed and moved above it.`
          : tooWeak
            ? `Rule ${twinIndex + 1} · ${twin.name} already checks this and answers ${EXPECT_LABEL[twin.decision]}. A second rule with the same conditions would make one of the two unreachable, so this changes the answer instead of adding one.`
            : `Rule ${twinIndex + 1} · ${twin.name} already says this, but sits below rule ${at + 1}, which decides the sign-in first. Moved above it.`,
      headline:
        tooLate && !tooWeak
          ? `Move rule ${twinIndex + 1} above rule ${at + 1}`
          : `Change rule ${twinIndex + 1} to ${EXPECT_LABEL[round.want]}`,
    }
  }

  const rule: Rule = {
    ...blankRule(spec.name),
    /* One card: a fix spec is a set of conditions that must all hold. The
       hardcoded `appliesTo: ['all']` that used to sit here is gone — a rule
       cannot be broader than its policy, so there is nothing to widen it to. */
    when: when(card(...specConds(spec.conditions))),
    decision: round.want,
  }

  return {
    kind: 'insert',
    rule,
    at,
    why: spec.why,
    placement: decider
      ? `Inserted above rule ${at + 1} · ${decider.name}, which is what decides this sign-in today. Below it, the new rule would never run.`
      : null,
    headline: `Insert as rule ${at + 1}`,
  }
}

/** Apply a proposal to a rule list. Shared by the hosts and by the tests, so
    the thing the button does is the thing the tests prove. */
export function applyFix(rules: Rule[], fix: ProposedFix): Rule[] {
  if (fix.kind === 'insert') return [...rules.slice(0, fix.at), fix.rule, ...rules.slice(fix.at)]
  const without = rules.filter((_, i) => i !== fix.fromIndex)
  // Removing an earlier rule shifts every later index down by one.
  const target = (fix.fromIndex ?? 0) < fix.at ? fix.at - 1 : fix.at
  return [...without.slice(0, target), fix.rule, ...without.slice(target)]
}

export function runGauntlet(
  policy: Policy,
  env: SimEnv,
  /** Cards whose expectation the tenant has overridden, by card id. */
  overrides: Record<string, Expect> = {},
  deck: Challenge[] = DECK,
): GauntletResult {
  /* Cards about people this policy does not govern are not scored at all.

     Grading a Finance-only policy on whether it stopped a contractor is a
     category error: the policy was never asked. Counting it as a breach makes
     every scoped policy look porous, and the grade stops meaning anything —
     the same failure the policies list already records from scoring Session
     policies with app-access cards. */
  const governed = deck.filter((c) => inAudience(policy, contextFor(c)))
  const rounds: Round[] = governed.map((c) => {
    const { decision, hitIndex } = decide(policy, contextFor(c), env)
    const want = overrides[c.id] ?? c.want
    return {
      challenge: c,
      user: userOf(c.userId),
      want,
      decision,
      outcome: classify(want, decision),
      hitIndex,
      hitName: hitIndex === null ? null : policy.rules[hitIndex].name,
    }
  })

  const count = (o: Outcome) => rounds.filter((r) => r.outcome === o).length
  const breaches = count('breach')
  const lockouts = count('lockout')
  const friction = count('friction')

  let streak = 0
  let run = 0
  for (const r of rounds) {
    run = r.outcome === 'held' ? run + 1 : 0
    if (run > streak) streak = run
  }

  const { grade, reason } = gradeOf(breaches, lockouts, friction)

  return { rounds, held: count('held'), breaches, lockouts, friction, streak, grade, gradeReason: reason }
}
