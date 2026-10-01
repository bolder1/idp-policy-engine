import {
  anySignIn,
  blankRule,
  card,
  cond,
  conditionType,
  when,
  type AccessDecision,
  type Condition,
  type Policy,
  type Predicate,
  type Rule,
  type RuleWho,
  type ZoneScope,
} from '../data'
import { ckey, isSingleAndRun } from '../predicate'
import { hasWho, normaliseWho, ruleSig, whoContains, whoPasses, withWho } from '../rule-who'
import { AUTH_METHODS, methodBlocker, type AuthMethod } from '../methods'
import { FACTOR_RANK, methodStrength, ruleFactor, type FactorStrength } from './factor-strength'
import {
  CHIP_DEVICES,
  SIM_USERS,
  decide,
  evalRule,
  inAudience,
  personOf,
  rawEnv,
  tracePolicy,
  traceRule,
  walk,
  type MatchOptions,
  type PolicyTrace,
  type SignInDevice,
  type SignInFacts,
  type SimEnv,
  type SimUser,
  type TraceResult,
} from './simulate'
import { audienceNames } from './tenant-resolver'

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
/* Three steps: one factor, two factors, deny. It measures how much a rule
   DOES about a sign-in, because that is what says whether a result was weaker
   than the card asked for. (It had a fourth, `warn`, between a bare allow and a
   second factor; the decision is gone from the model and so is the step.)

   Two results can land on the same step and still differ: a second factor
   that is an email code and one that is a passkey are both 2 factors. The
   typed deck below reads that as a second axis (`classifyAttempt`,
   `minFactor`); this number never does. */
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

/* The rule that closes a card when it leaks. One shape for both decks. */
export interface FixSpec {
  name: string
  /* Who the fixing rule is for, when the card's argument is about the person
     rather than the sign-in. Absent means everyone the policy governs. */
  who?: RuleWho
  conditions: SpecCondition[]
  why: string
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
  fix?: FixSpec
}

/* The deck.

   Chosen to cover the axes the condition catalogue actually models — network
   zone, device profile, risk score, day and time of day, group membership —
   with at least one hostile and one ordinary card on most of them. A deck that
   was all attacks would score a policy that denies everything as perfect, which
   is why half of these are people trying to do their jobs.

   That list used to be longer: MDM state, device registration, trust age, auth
   state and user type were axes too. The cards that TEST them are still here —
   a card is a situation, and an account with no second factor is still a
   situation the product has to handle — but three of them no longer carry a
   `fix`, because there is no longer a condition that closes them. A suggestion
   that cannot be built is worse than none: the preview would show it working
   and the button would produce a rule that never fires. */
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
    /* No fix. `auth-state` is gone from the catalogue and nothing replaces it,
       so this card can be diagnosed and cannot be closed. The card stays: the
       situation is real and a policy that lets it through is still wrong. */
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
      name: 'Verify devices we do not recognise',
      conditions: [{ typeId: 'fingerprint', operator: 'does not match', values: ['fp-managed'] }],
      why: 'Recognition is the durable signal here. Trust age drifts as devices come and go; whether the profile still matches does not.',
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
      /* A who, not a condition: the card's argument is precisely that the rule
         should be about who they are rather than the hour. So it has no
         conditions at all. */
      who: { groupIds: ['contractors'], userIds: [] },
      conditions: [],
      why: 'Written against who they are rather than the hour, because the hour is weak evidence and group membership is not.',
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
      /* `device-risk`, not `ml-risk`. The ML score is listed as coming soon
         and cannot be authored, so proposing it would hand somebody a rule they
         cannot open afterwards. 69 catches High (86) alone on the shipped
         scale. */
      conditions: [{ typeId: 'device-risk', operator: 'above', values: ['69'] }],
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
      name: 'Verify devices we do not recognise',
      conditions: [{ typeId: 'fingerprint', operator: 'does not match', values: ['fp-managed'] }],
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
      /* Was enrolment, on the argument that it catches this sign-in without
         punishing a managed laptop for being at home. That argument needed an
         MDM condition and there is not one. Off-network is what is left, and it
         is the reading this card's own `why` calls the obvious one. */
      name: 'Step up off the office network',
      conditions: [{ typeId: 'zone', operator: 'not in zone', values: ['office'] }],
      why: 'Off-network access to regulated data is worth one extra step, wherever the device came from.',
    },
  },
  {
    id: 'first-login',
    kind: 'legit',
    name: 'Brand new joiner',
    story: 'A new starter signs in for the first time, at the office, on a machine with no history.',
    userId: 'priya', place: 'Office Network', device: 'New / unknown', authState: 'First time login', risk: 'Low', at: '09:05',
    want: '2fa',
    why: 'The first sign-in is the one moment an account is worth binding to a person. Skipping it means the first real verification never happens.',
    /* No fix — see the note on `no-mfa`. */
  },
  {
    id: 'after-reset',
    kind: 'legit',
    name: 'Straight after an MFA reset',
    story: 'Someone who just had their second factor reset by the help desk signs back in.',
    userId: 'arun', place: 'Office Network', device: 'Known < 90 days', authState: 'MFA recently reset', risk: 'Low', at: '13:40',
    want: '2fa',
    why: 'A help-desk reset is the most impersonated event in identity. Re-verifying here is what stops a phone call from becoming an account takeover.',
    /* No fix — see the note on `no-mfa`. */
  },
  {
    id: 'roaming-unknown-origin',
    kind: 'legit',
    name: 'Travelling, origin unclear',
    story: 'A long-trusted device appears from a network the platform cannot place in any zone.',
    userId: 'arun', place: 'Any location', device: 'Known > 90 days', authState: 'Normal returning user', risk: 'Low', at: '17:15',
    want: '2fa',
    why: 'When the origin cannot be established, zone rules decide nothing. Something else has to, or the sign-in falls through to the default unexamined.',
    /* No fix, and that IS this card's lesson now.

       It used to propose an enrolment rule, on the grounds that when the origin
       cannot be placed the rule has to read something that is always known.
       Enrolment always was; it is not a condition any more. Every survivor that
       could stand in — a zone, a device profile, a clock — either needs the
       origin this card cannot supply or is not "always known" in the sense the
       argument needs. So the card diagnoses and stops, rather than offering a
       repair that would not repair it. */
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

/* One card's result, knowing whose sign-in it was.

   `classify` sees only the two decisions, so it called an ordinary person who
   asked for a second factor and got a denial "over-challenged" — friction, a
   cost worth seeing. It is not a cost. Finance working from home, refused, is
   somebody who cannot work, and a policy that denies a whole department scored
   B on friction while doing exactly that. An ordinary card denied where it did
   not ask to be is a lockout, whatever it asked for. A hostile card denied
   harder than asked is still friction here: stopping an attacker harder costs
   nobody legitimate, and the grade's sentences are about ordinary sign-ins. */
function classifyRound(card: Pick<Challenge, 'kind'>, want: Expect, got: AccessDecision): Outcome {
  if (card.kind === 'legit' && got === 'deny' && want !== 'deny') return 'lockout'
  return classify(want, got)
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
  /* The index the rule has after `applyFix`. Position is most of the fix under
     first-match: this is the index of the rule that decided the card (it lands
     above it and pushes it down), or the end of the list when nothing did. */
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

/* One card, or no card at all. `card()` refuses an empty list, and a spec with
   only a who has no conditions — so its WHEN is the always-true predicate, and
   the who is what narrows it. */
const specWhen = (conditions: SpecCondition[]): Predicate =>
  conditions.length === 0 ? anySignIn() : when(card(...specConds(conditions)))

const specKey = (spec: FixSpec) => ruleSig({ who: spec.who, when: specWhen(spec.conditions) })

/** A fix spec as the rule it would add, deciding `decision`. The insert branch
    below and the typed deck's tests build it the same way.

    Not pristine. `blankRule` marks a rule nobody has chosen an outcome for
    yet, and only a `decision` patch on the board clears the mark (model.ts);
    this one is born with its outcome chosen, so the mark goes here — as the
    board's patch clears it, `pristine: undefined`. Left on, the card read
    "then Outcome not chosen yet" over a rule the Inspector showed as Deny,
    and went on saying it once saved (review, 1 Oct 2026: Access checks'
    "Fix in policy" was the first road to it — the builder's Break-in test,
    the only other one, is hidden). */
export function ruleFromFix(spec: FixSpec, decision: AccessDecision): Rule {
  return withWho(
    {
      ...blankRule(spec.name),
      pristine: undefined,
      /* One card: a fix spec is a set of conditions that must all hold — or no
         card, when the spec is only about who. A rule cannot be broader than its
         policy, so there is nothing to widen it to. */
      when: specWhen(spec.conditions),
      decision,
    },
    normaliseWho(spec.who),
  )
}

/* Does this fix name something the tenant does not have?

   The deck's specs were written against the test estate — `anon`, `office`,
   `fp-managed` — and a tenant without those ids would be offered a rule that
   names nothing: previewed as undecided, built as a rule the linter flags as
   broken (PE134, PE135), and never firing. The DECK comment already says a
   suggestion that cannot be built is worse than none, and this is where that
   is enforced rather than hoped for.

   Read from the env's own lookups, then from its library, which is also where
   the groups and people of a who are checked. With neither — every test built
   on `rawEnv` — every id is taken to exist, which is how this behaved before. */
function namesMissing(spec: FixSpec, env: SimEnv): boolean {
  const lib = env.library
  const zoneGone = (id: string) => (env.hasZone ? !env.hasZone(id) : lib ? !lib.zones.some((z) => z.id === id) : false)
  const profileGone = (id: string) =>
    env.hasFingerprint ? !env.hasFingerprint(id) : lib ? !lib.fingerprints.some((p) => p.id === id) : false
  for (const c of spec.conditions) {
    const kind = conditionType(c.typeId).valueKind
    if (kind === 'zone' && c.values.some(zoneGone)) return true
    if (kind === 'fingerprint' && c.values.some(profileGone)) return true
  }
  if (lib && spec.who) {
    const w = spec.who
    if ([...w.groupIds, ...(w.exceptGroupIds ?? [])].some((id) => !lib.groups.some((g) => g.id === id))) return true
    if ([...w.userIds, ...(w.exceptUserIds ?? [])].some((id) => !lib.people.some((u) => u.id === id))) return true
  }
  return false
}

export function proposeFix(round: Round, policy: Policy, env?: SimEnv): ProposedFix | null {
  const spec = round.challenge.fix
  if (!spec || round.outcome !== 'breach') return null
  if (env && namesMissing(spec, env)) return null

  const at = round.hitIndex ?? policy.rules.length
  const ctx = contextFor(round.challenge)
  return proposeFrom(spec, round.want, at, round.user, policy, (r) => evalRule(r, ctx, env ?? rawEnv).match)
}

/* The body both decks share: a spec, the treatment it should give, where the
   card was decided, whose sign-in it was, and how to ask whether a rule
   matches it — the chip evaluator for `DECK`, the typed one for `TYPED_DECK`.
   Everything below is the same argument for either, so it is written once. */
function proposeFrom(
  spec: FixSpec,
  treatment: Expect,
  at: number,
  user: SimUser,
  policy: Policy,
  closes: (r: Rule) => boolean,
): ProposedFix | null {
  const decider = at < policy.rules.length ? policy.rules[at] : null

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
  /* The twin is found by who AND predicate, preferring an exact match.

     Rules in a policy do not all cover the same people — a rule has a `who`
     — so an exact match is the same who and the same WHEN (`ruleSig`).

     Past that, SUPERSET matching, and that is not a convenience — it is
     required for correctness. A narrower rule saying the same thing (the
     spec's conditions and more, for the spec's people or fewer) would be made
     permanently unreachable by inserting the fix's broader rule above it,
     which the linter correctly refuses to publish — a one-click fix that
     breaks the policy it was offered on.

     So: the twin is the earliest rule whose who the spec's who contains, which
     still covers the person on the card, and whose single AND-run CONTAINS the
     spec's conditions. Only single-card rules qualify, because a rule with
     alternatives is not made unreachable by a broader rule above it in the
     same way and re-aiming it would change more than the card asks.

     A spec with no conditions is the trap: "contains every one of nothing" is
     true of any rule, and the first unrelated rule in the policy would be
     re-aimed. Its twin must have no conditions either. */
  const want = new Set(specConds(spec.conditions).map(ckey))
  const covers = (r: Rule) => {
    if (!r.enabled) return false
    if (!whoContains(spec.who, r.who) || !whoPasses(r.who, user)) return false
    if (want.size === 0) return hasWho(spec.who) && r.when.cards.length === 0
    /* And an AND-run specifically: a single card whose conditions are joined
       by OR covers none of them jointly, so re-aiming it would not do what the
       fix spec asks. */
    return isSingleAndRun(r.when) && [...want].every((k) => r.when.cards[0].conditions.some((c) => ckey(c) === k))
  }
  const key = specKey(spec)
  const isExact = (r: Rule) => r.enabled && ruleSig(r) === key

  /* Only a twin AT OR BELOW the rule that decided can be re-aimed.

     Every enabled rule above `at` was reached and missed this card — first
     match wins, and `at` is where the match was. So a twin up there has already
     been asked about this very sign-in, and did not match: changing its answer
     cannot close the card. This used to re-aim it anyway, and `applyFix` then
     dropped it one place ABOVE the decider rather than at `at` — the
     off-by-one — in a "fix" that left the card open. Now:

       · an enabled EXACT twin above `at` means the spec cannot match this
         card at all, and inserting it below would be a duplicate the linter
         calls a contradiction (PE101). No fix.
       · a narrower twin above `at` missed for its extra conditions; the
         broader fix is inserted at `at`, below it, which shadows nothing.
       · a twin at or below `at` is re-aimed and lands exactly at `at` —
         provided it matches this card (below).

     A disabled rule is never a twin. It decides nothing, so re-aiming it
     changes nothing a sign-in meets, and the linter reads no duplicate against
     it. With nothing matched (`hitIndex` null) every enabled twin sits above
     the end of the list, so none is ever moved to the bottom. */
  if (policy.rules.some((r, i) => i < at && isExact(r))) return null
  const atOrBelow = (test: (r: Rule) => boolean) => policy.rules.findIndex((r, i) => i >= at && test(r))
  const exact = atOrBelow(isExact)
  const twinIndex = exact !== -1 ? exact : atOrBelow(covers)

  /* A fix that is offered closes its card, and that is checked here rather
     than hoped.

     Landing at `at` puts the rule where this sign-in is first asked about it:
     every enabled rule above missed, and first match wins. So the fix closes
     the card exactly when the rule it lands matches the card — asked with the
     same evaluator and env the round was played on.

     A `covers` twin is where that fails in practice. It contains the spec's
     conditions AND MORE, and the extra condition can be the very thing this
     card fails — a "risky and off the office network" rule, re-aimed above
     the decider for a card that is risky ON the office network, still misses,
     and the card stays open under a button that said it was fixed. Nor can the
     broader spec be inserted instead: above the narrower twin it would shadow
     it, which the linter refuses to publish. So a twin that would not match
     means no fix. The same test guards the insert, for a spec whose own
     conditions this card does not meet. */
  if (twinIndex !== -1) {
    const twin = policy.rules[twinIndex]
    if (!closes(twin)) return null
    const tooWeak = twin.decision !== treatment
    const tooLate = twinIndex > at

    return {
      kind: 'retune',
      rule: { ...twin, decision: treatment },
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
          : `Change rule ${twinIndex + 1} to ${EXPECT_LABEL[treatment]}`,
    }
  }

  const added = ruleFromFix(spec, treatment)
  if (!closes(added)) return null
  return {
    kind: 'insert',
    rule: added,
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
/* Invariant: the rule ends up at index `fix.at`. `proposeFix` only re-aims a
   twin at or below `at` (fromIndex >= at), so removing it never shifts `at`
   and the rule lands exactly there. The `fromIndex < at` branch stays for a
   hand-built proposal, and it is the one that lands a place higher. */
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
      outcome: classifyRound(c, want, decision),
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

/* =============================================================================
   The break-in test, on typed sign-ins.

   The deck above speaks in chips and is scored on the decision alone, and two
   things it cannot see are the two things an administrator most needs told.

   1. WHOSE sign-in it was. A hostile card let through with less than it asked
      for is a breach. An ordinary card let through with less is a real hole
      with nobody exploiting it. An ordinary card refused is somebody who
      cannot work. `classify` sees two decisions and cannot tell them apart.
   2. HOW STRONG the second factor is. "2 factors" by SMS and "2 factors" by a
      passkey are one decision and stop different attacks. Two cards here are
      attacks a second factor exists to stop and only some second factors do:
      repeated push prompts (MITRE ATT&CK T1621), which number matching
      defeats, and a sign-in relayed through a phishing proxy (T1557), which
      only a factor bound to the real site defeats.

   Fifteen cards: the thirteen above, re-cast as typed sign-ins on the
   showcase tenant's own ids — addresses from the geo fixture, the chip
   table's devices STATED rather than assumed, a Monday in Kolkata — and the
   two new ones. It returns counts, not a grade: a letter is a judgement, and
   what an administrator acts on is how many of which.

   On screen in the Break-in test (break-in-view.tsx), inside Saved sign-ins,
   and in Check's counts row. `DECK` stays for the surface that still prints
   its length and its grade — the trail's dialog — until it is retired. And
   on the Access checks page, played on an application across the tenant
   rather than on one policy (break-in-app.ts, 1 Oct 2026).
   ========================================================================== */

/** The ways a typed card can come back. Named for what happened. */
export type AttemptOutcome =
  | 'held'
  | 'got-through'
  | 'weaker-factor'
  | 'less-than-asked'
  | 'locked-out'
  | 'extra-prompts'
  | 'undecided'

export interface TypedChallenge {
  id: string
  /** Hostile attempts are the ones a miss on is a breach. */
  kind: 'threat' | 'legit'
  name: string
  story: string
  why: string
  personId: string
  /** The sign-in. `appId` is filled in per run, from the policy under test. */
  facts: SignInFacts
  want: Expect
  /** For a 2-factor want: the weakest factor that counts as held. Absent means any second factor. */
  minFactor?: FactorStrength
  fix?: FixSpec
  /** The MITRE ATT&CK technique, as code metadata. Never rendered. */
  mitre?: string
}

export interface AttemptRound {
  challenge: TypedChallenge
  /** The expectation actually used — the card's, or the tenant's override. */
  want: Expect
  trace: PolicyTrace
  /** The definite reading's decision: undecided rules count as no match. */
  decision: AccessDecision | null
  /** The deciding rule's second factor, when it decides 2 factors. */
  factor: FactorStrength | null
  outcome: AttemptOutcome
  /** The distinct outcomes the possible decisions give; more than one only when 'undecided'. */
  outcomes: AttemptOutcome[]
}

export interface BreakInCounts {
  held: number
  /** Hostile, and a weaker decision than asked. */
  gotThrough: number
  /** 2 factors as asked, with a factor below the card's minimum. */
  weakerFactor: number
  /** Ordinary, and a weaker decision than asked: a real hole, with no attacker. */
  lessThanAsked: number
  /** Ordinary, and denied where the card did not ask for a denial. */
  lockedOut: number
  /** Ordinary, and 2 factors where the card asked for 1. */
  extraPrompts: number
  undecided: number
  /** Cards about people the policy does not govern. */
  skipped: number
}

export interface BreakInResult {
  rounds: AttemptRound[]
  counts: BreakInCounts
  /* The audience a skipped card was outside of, "Human Resources, Finance",
     for a line that leads with the count (break-in-model.ts `skippedSaid`).
     Null when the policy names nobody: there is no audience to be outside of,
     only the empty one, which the Break-in test's empty state already says. */
  skipped: { cardId: string; audience: string | null }[]
}

/* One typed card's result.

   In this order, and the order is the argument:

   1. The decision asked for. Held — unless the card names a weakest factor
      and the rule's second factor is below it (or cannot be ranked), which is
      2 factors in name and not in effect.
   2. Weaker than asked. A breach if hostile; if ordinary, a hole with nobody
      in it, which is still worth closing and is not the same news.
   3. Stricter than asked. Hostile: held — stopping an attacker harder costs
      nobody legitimate. Ordinary and denied: locked out, whatever it asked
      for. Ordinary and prompted where it asked for one factor: extra prompts,
      a cost rather than a failure. */
export function classifyAttempt(
  card: Pick<TypedChallenge, 'kind' | 'minFactor'>,
  want: Expect,
  got: AccessDecision,
  factor: FactorStrength | null,
): AttemptOutcome {
  if (got === want) {
    if (want === '2fa' && card.minFactor && (factor === null || FACTOR_RANK[factor] < FACTOR_RANK[card.minFactor])) return 'weaker-factor'
    return 'held'
  }
  if (STRICTNESS[got] < STRICTNESS[want]) return card.kind === 'threat' ? 'got-through' : 'less-than-asked'
  if (card.kind === 'threat') return 'held'
  return got === 'deny' ? 'locked-out' : 'extra-prompts'
}

/* --- The typed deck --------------------------------------------------------- */

/** A Monday, so a weekday rule has something to read. */
const DECK_DATE = '2026-09-28'

const clockAt = (time: string): SignInFacts['when'] => ({ date: DECK_DATE, time, timeZone: 'Asia/Kolkata', source: 'stated' })
const fromAddress = (address: string): SignInFacts['network'] => ({ address, source: 'typed' })
/** A chip's device, as a stated fact rather than an assumed one. */
const chipDevice = (chip: string): SignInDevice => ({ ...CHIP_DEVICES[chip], source: 'stated' })
const score = (n: number): SignInFacts['risk'] => ({ score: n, source: 'stated' })

const chipCard = (id: string): Challenge => DECK.find((c) => c.id === id)!
/** The legacy card's words, which a typed card keeps. */
const told = (id: string) => {
  const c = chipCard(id)
  return { name: c.name, story: c.story, why: c.why }
}
/** The legacy card's fix, re-aimed at a showcase id. */
const refixed = (id: string, values: string[]): FixSpec => {
  const f = chipCard(id).fix!
  return { ...f, conditions: f.conditions.map((c) => ({ ...c, values })) }
}

/* The machine a phishing proxy signs in from: a Windows 11 browser nobody has
   registered, with no Device Agent. The person's own laptop is the one
   device they already have registered. */
const RELAY_MACHINE: SignInDevice = {
  source: 'stated',
  platform: 'windows',
  osVersion: '10.0.22631',
  formFactor: 'Laptop',
  browser: { family: 'edge', version: '128' },
  integrity: null,
  screenLock: null,
  authenticatorVersion: null,
  agentInstalled: false,
  agentVersion: null,
  registeredToPerson: false,
  registeredCount: 1,
}

export const TYPED_DECK: TypedChallenge[] = [
  {
    id: 'tor-exec',
    kind: 'threat',
    ...told('tor-exec'),
    personId: 'mehak',
    facts: { network: fromAddress('192.0.2.66'), device: chipDevice('New / unknown'), risk: score(86), when: clockAt('02:40') },
    want: 'deny',
    /* Not the legacy "Block anonymised sources": this tenant has no zone for
       anonymising networks, and a Tor exit names no place and no network any
       zone here lists. The score is the signal that is there. */
    fix: {
      name: 'Deny high device risk',
      conditions: [{ typeId: 'device-risk', operator: 'above', values: ['70'] }],
      why: 'A Tor exit names no place and sits on no network the tenant lists, so no zone can catch it. The risk score can, and above 70 is the band the tenant already refuses.',
    },
  },
  {
    id: 'proxy-finance',
    kind: 'threat',
    ...told('proxy-finance'),
    personId: 'priya',
    facts: { network: fromAddress('192.0.2.82'), device: chipDevice('Changed fingerprint'), risk: score(48), when: clockAt('11:20') },
    want: 'deny',
    fix: {
      name: 'Deny sign-ins from outside India',
      conditions: [{ typeId: 'zone', operator: 'not in zone', values: ['india'] }],
      why: 'The proxy places this sign-in in Frankfurt. Keeping access inside the country closes every proxy abroad, not only this one.',
    },
  },
  {
    id: 'no-mfa',
    kind: 'threat',
    ...told('no-mfa'),
    personId: 'devon',
    facts: { network: fromAddress('192.0.2.130'), device: chipDevice('New / unknown'), risk: score(86), when: clockAt('23:05') },
    want: 'deny',
    /* No fix, as on the chip card: nothing in the catalogue reads enrolment. */
  },
  {
    id: 'expired-trust',
    kind: 'threat',
    ...told('expired-trust'),
    personId: 'arun',
    facts: { network: fromAddress('192.0.2.130'), device: chipDevice('Expired trust'), risk: score(12), when: clockAt('14:10') },
    want: '2fa',
    fix: refixed('expired-trust', ['fp-corp-devices']),
  },
  {
    id: 'nightshift',
    kind: 'threat',
    ...told('nightshift'),
    personId: 'devon',
    facts: { network: fromAddress('192.0.2.130'), device: chipDevice('Known < 90 days'), risk: score(12), when: clockAt('03:10') },
    want: '2fa',
    fix: chipCard('nightshift').fix,
  },
  {
    id: 'risk-inside',
    kind: 'threat',
    ...told('risk-inside'),
    personId: 'priya',
    facts: { network: fromAddress('203.0.113.10'), device: chipDevice('Managed (MDM)'), risk: score(86), when: clockAt('15:45') },
    want: '2fa',
    fix: chipCard('risk-inside').fix,
  },
  {
    id: 'unmanaged-contractor',
    kind: 'threat',
    ...told('unmanaged-contractor'),
    personId: 'devon',
    facts: { network: fromAddress('192.0.2.130'), device: chipDevice('New / unknown'), risk: score(48), when: clockAt('10:05') },
    want: '2fa',
    fix: refixed('unmanaged-contractor', ['fp-corp-devices']),
  },
  {
    id: 'push-bombing',
    kind: 'threat',
    name: 'Repeated push prompts',
    story: 'Someone with a stolen password signs in again and again from a phone nobody has seen, until the real person approves a prompt to make them stop.',
    why: 'A push that one tap approves is the second factor this attack is built for. Number matching makes the person type what the sign-in screen shows, which a prompt they did not start cannot give them.',
    personId: 'priya',
    facts: { network: fromAddress('192.0.2.130'), device: chipDevice('New / unknown'), risk: score(48), when: clockAt('22:15') },
    want: '2fa',
    minFactor: 'standard',
    /* No fix: the answer is which second factor the rule asks for, which is
       not a condition a rule can add. */
    mitre: 'T1621',
  },
  {
    id: 'aitm-relay',
    kind: 'threat',
    name: 'Sign-in relayed through a phishing proxy',
    story: 'A phishing page passes the password and the one-time code through to the real sign-in page as the person types them, from a machine nobody has registered.',
    why: 'A code the person can read can be relayed as fast as they type it. Only a factor bound to the real site, such as a passkey or a security key, stops a relay that works in real time.',
    personId: 'arun',
    facts: { network: fromAddress('192.0.2.82'), device: RELAY_MACHINE, risk: score(12), when: clockAt('10:40') },
    want: '2fa',
    minFactor: 'phishing-resistant',
    mitre: 'T1557',
  },

  {
    id: 'office-regular',
    kind: 'legit',
    ...told('office-regular'),
    personId: 'arun',
    facts: { network: fromAddress('203.0.113.10'), device: chipDevice('Managed (MDM)'), risk: score(12), when: clockAt('09:30') },
    want: '1fa',
  },
  {
    id: 'exec-office',
    kind: 'legit',
    ...told('exec-office'),
    personId: 'mehak',
    facts: { network: fromAddress('198.51.100.20'), device: chipDevice('Managed (MDM)'), risk: score(12), when: clockAt('08:55') },
    want: '1fa',
  },
  {
    id: 'finance-home',
    kind: 'legit',
    ...told('finance-home'),
    personId: 'priya',
    facts: { network: fromAddress('192.0.2.10'), device: chipDevice('Known < 90 days'), risk: score(12), when: clockAt('19:20') },
    want: '2fa',
    fix: refixed('finance-home', ['corp-offices']),
  },
  {
    id: 'first-login',
    kind: 'legit',
    ...told('first-login'),
    personId: 'priya',
    facts: { network: fromAddress('203.0.113.10'), device: chipDevice('New / unknown'), risk: score(12), when: clockAt('09:05') },
    want: '2fa',
  },
  {
    id: 'after-reset',
    kind: 'legit',
    ...told('after-reset'),
    personId: 'arun',
    facts: { network: fromAddress('203.0.113.10'), device: chipDevice('Known < 90 days'), risk: score(12), when: clockAt('13:40') },
    want: '2fa',
  },
  {
    id: 'roaming-unknown-origin',
    kind: 'legit',
    ...told('roaming-unknown-origin'),
    personId: 'arun',
    /* No address and no place: the whole point of the card. */
    facts: { device: chipDevice('Known > 90 days'), risk: score(12), when: clockAt('17:15') },
    want: '2fa',
  },
]

export interface BreakInOptions {
  /** Cards whose expectation the tenant has overridden, by card id. */
  overrides?: Record<string, Expect>
  deck?: TypedChallenge[]
  /** How device-health client rows are read; see `MatchOptions`. */
  match?: MatchOptions
  /* Cards whose second factor the tenant has accepted as it is, by card id:
     read as though the card named no weakest factor, so a weaker factor the
     administrator has agreed to is held rather than counted again. */
  factorOk?: ReadonlySet<string>
}

const COUNT_OF: Record<AttemptOutcome, Exclude<keyof BreakInCounts, 'skipped'>> = {
  held: 'held',
  'got-through': 'gotThrough',
  'weaker-factor': 'weakerFactor',
  'less-than-asked': 'lessThanAsked',
  'locked-out': 'lockedOut',
  'extra-prompts': 'extraPrompts',
  undecided: 'undecided',
}

/* One typed card, judged against the trace of the policy that decided it.

   Each decision the policy COULD reach is classified with the second factor
   of the rule that would reach it. When they all agree the round has that
   outcome; when a missing fact would change it, the round is undecided, and
   `outcomes` says between what. A round is never scored on a guess.

   Out of `runBreakIn`, which asks it of one policy for every card, so the
   Access checks page can ask it of whichever policy the tenant hands each
   card to (break-in-app.ts) and the two cannot judge a card two ways (owner,
   1 Oct 2026: "can we implement it in the check part?"). The trace is the
   caller's: `tracePolicy` here, the resolver's own trace there. A trace with
   no possible outcome — out of the audience, or no policy at all — comes
   back undecided with no outcomes; `runBreakIn` skips those before asking. */
export function judgeAttempt(
  card: TypedChallenge,
  policy: Policy,
  trace: PolicyTrace,
  opts: Pick<BreakInOptions, 'overrides' | 'factorOk'>,
  methods: readonly AuthMethod[],
): AttemptRound {
  /* The second factor of the rule at an index; null is the last row. */
  const factorOf = (ruleIndex: number | null): FactorStrength | null => {
    const r = ruleIndex === null ? policy.fallback : policy.rules[ruleIndex]
    return r ? ruleFactor(r, methods) : null
  }
  const want = opts.overrides?.[card.id] ?? card.want
  const judged = opts.factorOk?.has(card.id) ? { ...card, minFactor: undefined } : card
  const outcomes = [...new Set(trace.possible.map((o) => classifyAttempt(judged, want, o.decision, factorOf(o.ruleIndex))))]
  return {
    challenge: card,
    want,
    trace,
    decision: trace.decision,
    factor: trace.decision === '2fa' ? factorOf(trace.hitIndex) : null,
    outcome: outcomes.length === 1 ? outcomes[0] : 'undecided',
    outcomes,
  }
}

/** The counts of a list of rounds; `skipped` is the caller's. */
export function countRounds(rounds: readonly AttemptRound[], skipped = 0): BreakInCounts {
  const counts: BreakInCounts = {
    held: 0,
    gotThrough: 0,
    weakerFactor: 0,
    lessThanAsked: 0,
    lockedOut: 0,
    extraPrompts: 0,
    undecided: 0,
    skipped,
  }
  for (const r of rounds) counts[COUNT_OF[r.outcome]] += 1
  return counts
}

/* The typed deck against one policy, on the typed evaluator.

   A card about somebody the policy does not govern is skipped, with the
   audience named — the policy was never asked. Every other card is traced
   three-valued and judged (`judgeAttempt`). */
export function runBreakIn(policy: Policy, env: SimEnv, opts: BreakInOptions = {}): BreakInResult {
  const deck = opts.deck ?? TYPED_DECK
  const e: SimEnv = opts.match ? { ...env, deviceMatch: opts.match } : env
  const methods = e.library?.methods ?? AUTH_METHODS

  const rounds: AttemptRound[] = []
  const skipped: BreakInResult['skipped'] = []
  const named = policy.audience.groupIds.length + policy.audience.userIds.length > 0
  const outside = named ? audienceNames(policy, e) : null
  for (const card of deck) {
    const app = policy.appIds[0]
    const facts: SignInFacts = { ...card.facts, ...(app ? { appId: app } : null), personId: card.personId }
    const trace = tracePolicy(policy, facts, e)
    if (trace.outOfAudience) {
      skipped.push({ cardId: card.id, audience: outside })
      continue
    }
    rounds.push(judgeAttempt(card, policy, trace, opts, methods))
  }

  return { rounds, counts: countRounds(rounds, skipped.length), skipped }
}

/* --- Fixes for the typed deck ---------------------------------------------------

   The same two repairs the chip deck offers, asked of a typed round.

   A round let through with less than it asked for — hostile or ordinary — is
   closed by the rule its card names, landed where the round was decided, with
   every guard `proposeFix` has: a twin is re-aimed rather than duplicated, a
   rule that would not match this sign-in is not offered, and a spec naming a
   zone, profile, group or person the tenant does not have is withheld. Only
   the question "does this rule match the card" differs: the typed evaluator,
   on the card's own facts and the policy's first application, exactly as
   `runBreakIn` asked it — or on `appId`, the application the Access checks
   page ran the card on (break-in-app.ts), when the policy that decided it
   covers more than one.

   A round held on the decision and weak on the factor is closed by asking for
   a stronger second factor on the rule that decided it — not by a new rule,
   because no condition says which factor a person is offered.

   A round that came back stricter than asked is never "fixed" here. Closing it
   would mean loosening a rule, and advice to loosen does not come from a test
   of what gets through. */
export function proposeAttemptFix(round: AttemptRound, policy: Policy, env: SimEnv, appId: string | undefined = policy.appIds[0]): ProposedFix | null {
  const spec = round.challenge.fix
  if (!spec || (round.outcome !== 'got-through' && round.outcome !== 'less-than-asked')) return null
  if (namesMissing(spec, env)) return null
  const card = round.challenge
  const person = personOf(card.personId, env)
  if (!person) return null
  const app = appId
  const facts: SignInFacts = { ...card.facts, ...(app ? { appId: app } : null), personId: card.personId }
  const at = round.trace.hitIndex ?? policy.rules.length
  return proposeFrom(spec, round.want, at, person, policy, (r) => traceRule(r, at, facts, person, env).match === 'yes')
}

/** A stronger second factor for the rule that decided a round: its index (null is the last row) and the method names. */
export interface FactorFix {
  ruleIndex: number | null
  methods: string[]
}

/* Every second factor the tenant can offer that is at least as strong as the
   card asks, in catalogue order: switched on, configured and offered
   (`methodBlocker`), and ranked at or above the card's weakest factor. None
   means no fix — a rule asking for a method nobody can be offered cannot be
   completed, which is a lockout, not a repair. */
export function proposeFactorFix(round: AttemptRound, policy: Policy, methods: readonly AuthMethod[]): FactorFix | null {
  const min = round.challenge.minFactor
  if (round.outcome !== 'weaker-factor' || !min) return null
  const index = round.trace.hitIndex
  const rule = index === null ? policy.fallback : policy.rules[index]
  if (!rule || rule.decision !== '2fa') return null
  const names = methods
    .filter((m) => m.use === 'second' && methodBlocker(m) === null && FACTOR_RANK[methodStrength(m)] >= FACTOR_RANK[min])
    .map((m) => m.name)
  return names.length === 0 ? null : { ruleIndex: index, methods: names }
}
