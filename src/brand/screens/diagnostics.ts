import {
  FALLBACK_NAME,
  conditionType,
  users as seedUsers,
  type AccessDecision,
  type Group,
  type Policy,
  type Rule,
  type User,
  type Zone,
  zoneScopeOf,
} from '../data'
import { cardJoin, ckey, isSingleAndRun, leaves, matchesEverything, topJoin } from '../predicate'
import { outsideAudienceOf } from '../audience-ops'
import {
  hasWho,
  legacyWhoConditions,
  normaliseWho,
  ruleMatchesEveryone,
  ruleSig,
  whoContains,
  whoCoversNobody,
} from '../rule-who'
import { SLOW_TIMEOUT_MS, seedHooks, type Hook } from '../hooks'
import type { FingerprintProfile } from '../fingerprint'

/* -----------------------------------------------------------------------------
   Rule diagnostics.

   What separates a form from a tool is that the tool tells you when what you
   built cannot do what you meant. With ordered rules and first-match-wins, the
   ways to be wrong are specific and detectable — a rule shadowed by a broader
   one above it never runs, and a rule requiring both `is X` and `is not X` can
   never match anything.

   The discipline here is soundness over coverage. A warning that fires on a
   correct policy is worse than a missing warning, because it teaches admins to
   ignore the panel. So every check below is one that can be proved from the
   structure alone; anything needing runtime knowledge of who actually signs in
   is deliberately absent rather than guessed at.
   -------------------------------------------------------------------------- */

export type Severity = 'error' | 'warning' | 'info'

const DECISION_WORD: Record<AccessDecision, string> = {
  deny: 'Deny',
  '1fa': '1 factor',
  '2fa': '2 factors',
}

export interface Diagnostic {
  id: string
  severity: Severity
  title: string
  detail: string
  /* A stable, greppable code. Findings get renamed as copy improves; a test or
     a bug report that names one should not go stale when it does. */
  code: string
  /* Rule this is reported against, or -1 for a finding about the policy itself.

     A sentinel rather than an optional field, deliberately: every consumer
     already guards with `policy.rules[d.ruleIndex]?.`, so -1 flows through them
     unchanged and only the two renderers that print "Open rule N" have to
     branch. Making it optional would force all six to change. */
  ruleIndex: number
  scope: 'rule' | 'policy'
  /** The other rule involved, when the problem is a relationship. */
  relatedIndex?: number
}

/** "Finance", "Finance and Legal", "Finance, Legal and Contractors". */
const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const clockMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/* Is every minute of one window also a minute of the other?

   An interval is not a value set, and PE111's containment test cannot be told
   the difference by looking at `values` — a `between` condition holds
   `[from, to]`, two endpoints, where a `list` condition holds alternatives. Ask
   "does every value of the affirmative appear among the negation's" of a window
   and it answers three real questions wrong: it says yes for `09:00–17:00`
   against `not 17:00–09:00`, which are complements and agree perfectly; and it
   says no for `09:00–17:00` against `not 09:00–22:00`, where the first window
   sits wholly inside the second and nothing can satisfy both.

   Minutes, and the evaluator's own wrap rule — a window whose end precedes its
   start crosses midnight and is a union of two runs, so it is unrolled to those
   runs before either side is compared. */
const windowRuns = (v: string[]): [number, number][] => {
  const from = clockMinutes(v[0] ?? '00:00')
  const to = clockMinutes(v[1] ?? '23:59')
  return from <= to ? [[from, to]] : [[from, 1439], [0, to]]
}

const windowInside = (aff: string[], neg: string[]): boolean => {
  const cover = windowRuns(neg)
  return windowRuns(aff).every(([a, b]) => cover.some(([c, d]) => c <= a && b <= d))
}

/** Negating operators, paired with the affirmative they contradict. */
const NEGATIONS: Record<string, string> = {
  'is not': 'is',
  'not in zone': 'in zone',
  'does not match': 'matches',
  'not between': 'between',
  'not in': 'in',
}

/* `audienceCovers` is gone.

   With one audience per policy, "does this rule cover at least everyone that
   rule covers" is tautologically true, and a predicate that always returns true
   is not a filter — it is a comment. Removing it makes the four checks that
   depended on it (subsumption, unreachable, the shadow count, `shadowedBy`)
   strictly stronger: they now compare predicates alone.

   Narrowing inside a policy is `Rule.who` now, a field beside the WHEN rather
   than a condition in it. So every check that asks "does that rule match
   everything this one matches" asks it of both halves: the WHEN through the
   predicate, and the people through `whoContains`. A rule's identity is
   `ruleSig`, which carries both. */

/** A rule that matches every sign-in reaching it: no who and no conditions. */
const isCatchAll = (r: Rule) => r.enabled && ruleMatchesEveryone(r)

/* An earlier rule that always matches first for everyone `r` applies to:
   switched on, no conditions, and a who covering all of `r`'s people. A rule
   with no who covers everyone, so this is the catch-all case and more. */
const blocks = (e: Rule, r: Rule) => e.enabled && matchesEverything(e.when) && whoContains(e.who, r.who)

/* One card is one unbroken run of ANDs, by construction. That is the whole
   reason the model is a disjunction of cards rather than an arbitrary tree:
   every check below that needed "an unbroken run of ANDs" gets it for free
   instead of having to prove it, and none of them has to bail out on the mixed
   case — which is exactly the case grouping exists to enable. */
const allAnd = (r: Rule) => isSingleAndRun(r.when)
/* A pure OR-run reaches the same shape two ways now: several single-condition
   cards joined by OR, or one card whose own conditions are joined by OR. */
const allOr = (r: Rule) =>
  (topJoin(r.when) === 'or' && r.when.cards.length > 1 && r.when.cards.every((k) => k.conditions.length === 1)) ||
  (r.when.cards.length === 1 && cardJoin(r.when.cards[0]) === 'or' && r.when.cards[0].conditions.length > 1)

/** Who and the predicate, normalised. The policy audience is not part of it — it is the policy's. */
const signature = (r: Rule) => ruleSig(r)

/* Which rules below `index` that rule puts out of reach.

   The same two predicates the `unreachable` check uses, so the answer is sound
   by construction — it can never dim a rule that is genuinely reachable. Used
   by the canvas to show, on hover, the thing first-match-wins hides: that a
   broad rule high up silently kills specific rules beneath it. */
export function shadowedBy(policy: Policy, index: number): number[] {
  const rule = policy.rules[index]
  if (!rule || !rule.enabled || !matchesEverything(rule.when)) return []
  const out: number[] = []
  policy.rules.forEach((r, j) => {
    if (j > index && r.enabled && blocks(rule, r)) out.push(j)
  })
  return out
}

/* `hooks` is optional and falls back to the seed, the same way the prose
   resolver in builder-dialogs does. Callers with a store pass the live list so
   a hook deleted five seconds ago is reported; callers without one (the tests,
   the interview composer) still get sound answers about the seeded catalogue. */
export interface DiagnoseLibrary {
  zones?: Zone[]
  fingerprints?: FingerprintProfile[]
}

export function diagnose(
  policy: Policy,
  groups: Group[],
  hooks: Hook[] = seedHooks,
  directory: User[] = seedUsers,
  /* The tenant's zones and device profiles. Omitted, rules naming them are not
     checked against what exists; passed, a rule naming a deleted one is an error. */
  library: DiagnoseLibrary = {},
): Diagnostic[] {
  const out: Diagnostic[] = []
  const rules = policy.rules
  /* The ids that still exist. Undefined when the caller passed no list, which
     skips the check rather than calling every zone or profile deleted. */
  const zoneIds = library.zones ? new Set(library.zones.map((z) => z.id)) : undefined
  const profileIds = library.fingerprints ? new Set(library.fingerprints.map((p) => p.id)) : undefined
  // The global default is a deliberate catch-all; warning about it is noise.
  if (policy.isSystem) return out

  /* --- The policy's own audience -------------------------------------------

     Three findings that used to be one per-rule warning. They move up with the
     audience, and the first is new: an empty audience was unreachable before
     because the old editor forced a fallback to "all" whenever you deselected
     the last group. It is reachable now, so it has to be caught — a policy that
     governs nobody is a policy that looks like protection and is not. */
  const a = policy.audience
  if (!a.everyone && a.groupIds.length === 0 && a.userIds.length === 0) {
    out.push({
      id: 'emptyaudience',
      code: 'PE310',
      severity: 'error',
      scope: 'policy',
      ruleIndex: -1,
      title: 'This policy applies to nobody',
      detail: 'No groups and no people are selected, so none of these rules can ever run. Choose who this policy governs.',
    })
  }

  const hollow = a.groupIds.filter((g) => (groups.find((x) => x.id === g)?.memberCount ?? 0) === 0)
  if (hollow.length > 0) {
    out.push({
      id: 'emptygroup',
      code: 'PE311',
      severity: 'warning',
      scope: 'policy',
      ruleIndex: -1,
      title: 'Targets an empty group',
      detail: `${hollow.map((g) => groups.find((x) => x.id === g)?.name ?? g).join(', ')} has no members, so this policy reaches nobody through it.`,
    })
  }

  const ghosts = a.userIds.filter((id) => !directory.some((u) => u.id === id))
  if (ghosts.length > 0) {
    out.push({
      id: 'ghostuser',
      code: 'PE312',
      severity: 'warning',
      scope: 'policy',
      ruleIndex: -1,
      title: `${ghosts.length} named ${ghosts.length === 1 ? 'person is' : 'people are'} no longer in the directory`,
      detail: 'They were named on this policy individually and cannot be resolved now. Remove them, or cover them with a group.',
    })
  }

  const seen = new Map<string, number>()

  rules.forEach((r, i) => {
    /* --- Duplicate predicate -------------------------------------------------
       Usually a template applied twice. Worth its own message from the
       subsumption case below, because the fix differs: delete one, versus
       reorder. When the outcomes differ it is more serious — the policy
       contradicts itself and the earlier rule silently wins. */
    if (r.enabled) {
      const sig = signature(r)
      const first = seen.get(sig)
      if (first === undefined) {
        seen.set(sig, i)
      } else {
        const same = rules[first].decision === r.decision
        out.push({
          id: `dupe-${r.id}`,
          code: 'PE101',
          severity: 'error',
          scope: 'rule',
          ruleIndex: i,
          relatedIndex: first,
          title: same ? 'Duplicate of an earlier rule' : 'Contradicts an earlier rule',
          detail: same
            ? `Rule ${first + 1} · ${rules[first].name} matches on exactly the same conditions, so it always matches first. This rule never runs.`
            : `Rule ${first + 1} · ${rules[first].name} matches on exactly the same conditions but decides differently. It matches first, so ${DECISION_WORD[rules[first].decision]} wins and this rule never runs.`,
        })
      }
    }

    /* --- Subsumed by an earlier, broader predicate ---------------------------
       Sound logic, no data needed: if every condition of an earlier all-AND
       rule also appears in this one, then A∧B∧C ⟹ A, so anything matching here
       already matched there and stopped. The pure-OR mirror holds too. Webhook
       conditions are excluded — their result is opaque, so nothing can be
       proved about them.

       And the people: the earlier rule's who has to cover everyone this rule
       applies to. "Finance, in the office" above "Contractors, in the office
       from a managed device" subsumes nothing. An earlier rule with no
       conditions at all is PE103's case, not this one. */
    if (r.enabled && allAnd(r) && r.when.cards.length > 0) {
      const mine = new Set(r.when.cards[0].conditions.map(ckey))
      const opaque = (x: Rule) => leaves(x.when).some((c) => c.typeId === 'webhook')
      const idx = rules.findIndex(
        (e, j) =>
          j < i &&
          e.enabled &&
          e.when.cards.length > 0 &&
          !opaque(e) &&
          !opaque(r) &&
          whoContains(e.who, r.who) &&
          (allAnd(e)
            ? e.when.cards[0].conditions.every((c) => mine.has(ckey(c)))
            : allOr(e) && e.when.cards.some((k) => mine.has(ckey(k.conditions[0])))),
      )
      if (idx !== -1 && !out.some((d) => d.id === `dupe-${r.id}`)) {
        out.push({
          id: `subsumed-${r.id}`,
          code: 'PE102',
          severity: 'error',
          scope: 'rule',
          ruleIndex: i,
          relatedIndex: idx,
          title: 'This rule can never run',
          detail: `Rule ${idx + 1} · ${rules[idx].name} matches everything this rule matches, and it is evaluated first. Making a rule more specific than one above it puts it out of reach.`,
        })
      }
    }

    /* --- An empty card -------------------------------------------------------
       Reachable on purpose now. "Add group" produces the frame before it
       produces a condition, so an empty group is the state you are in for as
       long as it takes to fill it — and this is what names it while you are.
       `emptyGroup()` in data.ts is the only thing allowed to build one;
       `card()` still refuses.

       It stays an error rather than a warning because the failure is silent and
       total: an empty card matches every sign-in, so the rule becomes a
       catch-all and every rule below it stops running. */
    const hollowCards = r.when.cards.filter((k) => k.conditions.length === 0)
    for (const k of hollowCards) {
      out.push({
        id: `emptycard-${r.id}-${k.id}`,
        code: 'PE320',
        severity: 'error',
        scope: 'rule',
        ruleIndex: i,
        /* "Group" when the author made one, "alternative" when it is just
           where loose conditions live — the same two words the editor uses, so
           a finding names the thing you can see. */
        title: k.grouped ? 'A group has no conditions' : 'A branch has no conditions',
        detail: `An empty ${k.grouped ? 'group' : 'branch'} matches every login, which silently turns this rule into a catch-all. Delete it, or give it a condition.`,
      })
    }

    /* --- People or groups written as a condition ----------------------------
       Who a rule is for is `Rule.who`. A `group` or `user` condition in a card
       is the old way of saying it, and it is an error rather than a quiet
       second path: the If pickers cannot write one, the Who section cannot see
       one, and a rule holding one reads differently on every surface. */
    const legacy = legacyWhoConditions(r.when)
    if (legacy.length > 0) {
      out.push({
        id: `legacywho-${r.id}`,
        code: 'PE150',
        severity: 'error',
        scope: 'rule',
        ruleIndex: i,
        title: 'People or groups in a condition',
        detail: 'Move people and groups to Who.',
      })
    }

    /* --- Who ----------------------------------------------------------------
       Three things the who itself can be wrong about. Not gated on `enabled`,
       like the deleted-zone checks: a switched-off rule is still broken. */
    const who = normaliseWho(r.who)
    if (who) {
      /* Every chosen group and person is also an exception. */
      if (whoCoversNobody(who, directory)) {
        out.push({
          id: `whonobody-${r.id}`,
          code: 'PE153',
          severity: 'error',
          scope: 'rule',
          ruleIndex: i,
          title: 'This rule applies to nobody',
          detail: 'Every group and person in Who is also an exception. Remove the exception or the choice.',
        })
      }

      /* Named, but the policy does not govern them. The audience is checked
         before any rule, so the rule can never apply to them. */
      const outside = outsideAudienceOf(a, who, directory)
      const outsideNames = [
        ...outside.groups.map((g) => groups.find((x) => x.id === g)?.name ?? g),
        ...outside.users.map((u) => directory.find((x) => x.id === u)?.name ?? u),
      ]
      if (outsideNames.length > 0) {
        out.push({
          id: `whooutside-${r.id}`,
          code: 'PE151',
          severity: 'warning',
          scope: 'rule',
          ruleIndex: i,
          title: 'Who is outside this policy',
          detail: `This policy does not govern ${listOf(outsideNames)}, so this rule never applies to them. Add them to the policy, or remove them from Who.`,
        })
      }

      /* Gone from the directory since the rule named them. */
      const allIds = (ids?: string[]) => ids ?? []
      const goneGroups = [...who.groupIds, ...allIds(who.exceptGroupIds)].filter((g) => !groups.some((x) => x.id === g))
      const goneUsers = [...who.userIds, ...allIds(who.exceptUserIds)].filter((u) => !directory.some((x) => x.id === u))
      const gone = goneGroups.length + goneUsers.length
      if (gone > 0) {
        out.push({
          id: `whogone-${r.id}`,
          code: 'PE152',
          severity: 'warning',
          scope: 'rule',
          ruleIndex: i,
          title: `${gone} in Who ${gone === 1 ? 'no longer exists' : 'no longer exist'}`,
          detail: 'A group or person this rule names has been removed from the directory. Remove it from Who.',
        })
      }
    }

    /* --- A condition with nothing to match on -------------------------------- */
    const blank = leaves(r.when).filter((c) => c.values.length === 0 || c.values.every((v) => !v.trim()))
    if (blank.length > 0) {
      out.push({
        id: `blank-${r.id}`,
        code: 'PE110',
        severity: 'error',
        scope: 'rule',
        ruleIndex: i,
        title: `${blank.length} condition${blank.length === 1 ? ' has' : 's have'} no value`,
        detail: `${blank.map((c) => conditionType(c.typeId).label).join(', ')} — a condition with nothing to compare against can never match, so this rule cannot fire.`,
      })
    }

    /* --- A rule with no name --------------------------------------------------
       Every finding, trace and menu names a rule by its name, so a blank one
       is a row nobody can refer to. Not gated on `enabled`. */
    if (!r.name.trim()) {
      out.push({
        id: `noname-${r.id}`,
        code: 'PE105',
        scope: 'rule',
        severity: 'error',
        ruleIndex: i,
        title: 'Rule name is empty',
        detail: 'Give this rule a name.',
      })
    }

    /* --- Configuration that contradicts the outcome -------------------------- */
    for (const f of outcomeFindings(r)) {
      out.push({ id: `${f.key}-${r.id}`, code: f.code, scope: 'rule', severity: f.severity, ruleIndex: i, title: f.title, detail: f.detail })
    }

    /* --- External hooks ------------------------------------------------------

       Three things a hook condition can be wrong about, and none of them are
       visible from the rule: the endpoint may have been deleted, the failure
       behaviour may contradict what the rule is for, and the timeout is charged
       to every sign-in that reaches here.

       The middle one is the reason this section exists. A rule whose whole
       purpose is to deny, gated on a hook that fails open, stops denying the
       moment somebody else's service has a bad afternoon — and it does so
       silently, because from the engine's point of view nothing went wrong. */
    for (const c of leaves(r.when).filter((x) => x.typeId === 'webhook')) {
      const id = c.values[0]
      if (!id) continue
      const hook = hooks.find((h) => h.id === id)

      if (!hook) {
        out.push({
          id: `hookgone-${r.id}-${c.id}`,
        code: 'PE130',
        scope: 'rule',
          severity: 'error',
          ruleIndex: i,
          title: 'This rule calls a hook that no longer exists',
          detail: `The condition names a hook that has been deleted, so it has nothing to ask. The rule cannot be evaluated as written.`,
        })
        continue
      }

      /* An attribute-sync hook pulls data in the background and answers no
         question during a sign-in, so a condition calling it has nothing to
         wait for. The hook form can switch a hook's mode after rules use it. */
      if (hook.mode !== 'sync') {
        out.push({
          id: `hookmode-${r.id}-${c.id}`,
          code: 'PE136',
          scope: 'rule',
          severity: 'error',
          ruleIndex: i,
          title: 'This rule calls a hook that cannot answer it',
          detail: `${hook.name} syncs attributes and is not called during login. Choose a hook that answers a login.`,
        })
        continue
      }

      if (r.decision === 'deny' && hook.onFailure === 'fail-open') {
        out.push({
          id: `hookopen-${r.id}-${c.id}`,
        code: 'PE131',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: 'This rule stops denying when the hook is unavailable',
          detail: `${hook.name} is set to treat a failure as “not matched”. Because this rule denies, an outage or a timeout at the endpoint lets the login through to the rules below instead of refusing it.`,
        })
      }

      if (r.decision !== 'deny' && hook.onFailure === 'fail-closed') {
        out.push({
          id: `hookclosed-${r.id}-${c.id}`,
        code: 'PE132',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: 'An outage at the hook locks these users out',
          detail: `${hook.name} is set to deny when it cannot be reached. Everyone this rule applies to depends on that endpoint being up, whatever the rule itself decides.`,
        })
      }

      if (hook.timeoutMs > SLOW_TIMEOUT_MS) {
        out.push({
          id: `hookslow-${r.id}-${c.id}`,
        code: 'PE133',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: 'This rule can add most of a second to a login',
          detail: `${hook.name} waits up to ${hook.timeoutMs}ms before giving up, and every login that reaches this rule pays it. Worth checking against the endpoint's measured p99.`,
        })
      }
    }

    /* --- Deleted zones and device profiles -----------------------------------

       Same contract as PE130. Deleting a zone or a profile leaves the rules that
       name it in place, and this is what says so. Not gated on `enabled`, like
       PE130: a switched-off rule is still broken, and the renderers decide
       whether that blocks publishing. Every value is checked, not just the
       first — a condition can name several. */
    for (const c of leaves(r.when)) {
      const known = c.typeId === 'zone' ? zoneIds : c.typeId === 'fingerprint' ? profileIds : undefined
      if (!known) continue
      if (!c.values.some((v) => v.trim() !== '' && !known.has(v))) continue
      const zone = c.typeId === 'zone'
      out.push({
        id: `${zone ? 'zonegone' : 'profilegone'}-${r.id}-${c.id}`,
        code: zone ? 'PE134' : 'PE135',
        scope: 'rule',
        severity: 'error',
        ruleIndex: i,
        title: zone ? 'This rule uses a zone that no longer exists' : 'This rule uses a device profile that no longer exists',
        detail: zone ? 'Pick another zone or remove the condition.' : 'Pick another device profile or remove the condition.',
      })
    }

    /* --- Unreachable ---------------------------------------------------------
       Only claimed when it is certain: an earlier enabled rule with no
       conditions, whose who covers everyone this rule applies to, will always
       match first. An earlier rule *with* conditions might not fire, so it is
       left alone — guessing there would produce warnings on correct policies. */
    const blocker = rules.findIndex((e, j) => j < i && blocks(e, r))
    if (blocker !== -1) {
      const scoped = hasWho(rules[blocker].who)
      out.push({
        id: `unreachable-${r.id}`,
        code: 'PE103',
        scope: 'rule',
        severity: 'error',
        ruleIndex: i,
        relatedIndex: blocker,
        title: 'This rule can never run',
        detail: scoped
          ? `Rule ${blocker + 1} · ${rules[blocker].name} has no conditions and applies to everyone this rule applies to, so it always matches first. Evaluation stops there and never reaches this rule.`
          : `Rule ${blocker + 1} · ${rules[blocker].name} has no conditions and covers the same people, so it always matches first. Evaluation stops there and never reaches this rule.`,
      })
    }

    /* --- Contradictory conditions -------------------------------------------
       Same field asserted and denied on the same value, inside one AND card.

       "Inside one card" used to be the whole test, and the comment here said
       so: a card WAS an unbroken run of ANDs by construction, which is exactly
       the proof that both conditions are required. `ConditionCard.join` ended
       that. In an or-card the two are alternatives, and "X is a OR X is not a"
       is not a contradiction — it matches everything, which is the opposite of
       unsatisfiable.

       Ungated, this raised a blocking ERROR on a rule that is perfectly
       publishable, and the author had no way to satisfy it except to delete a
       condition they meant. The joiner is the test now.

       Two conditions in different cards are alternatives and contradict
       nothing, which is unchanged. */
    for (const k of r.when.cards) {
      const requiresBoth = cardJoin(k) === 'and'
      for (let a = 0; a < k.conditions.length; a++) {
        for (let b = a + 1; b < k.conditions.length; b++) {
          const ca = k.conditions[a]
          const cb = k.conditions[b]
          if (ca.typeId !== cb.typeId) continue
          /* Same attribute is not yet the same question.

             A zone condition names a half — the network one, the geographic
             one, or both — and two halves of one zone are two independent
             facts. "In the office network by address" and "not in the office
             network by geography" hold together whenever the addresses and the
             map disagree, which is exactly the case somebody writes a scoped
             rule to catch. Comparing them on values alone reports that rule as
             cancelling out and refuses to publish it.

             Per zone since 22 Sep 2026, so the test is inside `covered` below:
             a zone only counts as covered when the negation asks the SAME half
             of it that the affirmative does. */

          const opposed = NEGATIONS[cb.operator] === ca.operator || NEGATIONS[ca.operator] === cb.operator

          /* COVERED, not overlapping — and the difference is a false error that
             blocks publishing on a rule that is perfectly satisfiable.

             A multi-valued condition ORs its values: `zone in [office, hq]`
             passes in either one. So `in [office, hq] AND not in [office]` is
             not a contradiction, it is the rule "hq but not office", which is
             exactly how somebody would write that. Overlap is non-empty, the
             operators are opposed, and the old test raised a blocking ERROR the
             author could only clear by deleting a condition they meant.

             A contradiction needs the negation to cover EVERY value the
             affirmative offers — only then is there nothing left to satisfy.
             Which side is which has to be resolved first: the loop yields the
             pair in authoring order, so `ca` is the negated one about half the
             time, and `every` is not symmetric.

             This was reachable before today only through hand-authored data,
             because both value pickers were single-select. They are not any
             more. The same unsoundness has always been latent for `list` kinds
             whose operators are a `not`-pair — Country, Day of week, MDM
             Managed — and this closes those too. Device posture is NOT among
             them, and neither is External hook: `passes`/`fails` and
             `returns true`/`returns false` are not in NEGATIONS, so `opposed`
             is false and neither pair has ever reached this test at all.

             `time` needs its own containment test and gets one below —
             `between` holds two endpoints rather than two alternatives, and
             asking whether one pair appears among the other is wrong in both
             directions. */
          const neg = NEGATIONS[ca.operator] ? ca : cb
          const aff = neg === ca ? cb : ca
          /* Set containment for the kinds whose values are alternatives;
             interval containment for the one whose values are endpoints. Which
             is which is a property of the attribute, so it is read off the
             catalogue rather than guessed from the shape of the array. */
          const covered =
            conditionType(ca.typeId).valueKind === 'time'
              ? windowInside(aff.values, neg.values)
              : aff.values.length > 0 && aff.values.every((v) => neg.values.includes(v) && zoneScopeOf(neg, v) === zoneScopeOf(aff, v))

          if (requiresBoth && opposed && covered) {
            out.push({
              id: `contradiction-${r.id}-${ca.id}-${cb.id}`,
              code: 'PE111',
              scope: 'rule',
              severity: 'error',
              ruleIndex: i,
              title: 'These conditions cancel out',
              /* Quotes what the author wrote, rather than the intersection.
                 The message named `overlap` on both sides, so a rule whose two
                 conditions listed different values was explained back with
                 values neither of them held. */
              detail: `${conditionType(ca.typeId).label} is required to be both “${aff.operator} ${aff.values.join(', ')}” and “${neg.operator} ${neg.values.join(', ')}” in the same branch. Nothing can satisfy both.`,
            })
            /* `ckey`, not `JSON.stringify(values)`. The stringify is
               order-sensitive, so the same two values typed in the other order
               read as two different conditions and the duplicate went
               unreported — while `ckey` sorts, which is why it is the identity
               function every other check in this file already uses.

               Not gated on the joiner: a duplicate changes nothing in an
               or-card either. */
          } else if (ckey(ca) === ckey(cb)) {
            out.push({
              id: `duplicate-${r.id}-${ca.id}-${cb.id}`,
              code: 'PE112',
              scope: 'rule',
              severity: 'info',
              ruleIndex: i,
              title: 'Duplicate condition',
              detail: `${conditionType(ca.typeId).label} “${ca.operator} ${ca.values.join(', ')}” is listed twice in the same branch. The second one changes nothing.`,
            })
          }
        }
      }
    }

    /* --- A catch-all above other rules --------------------------------------
       Reported on the cause rather than each victim: fixing the one rule fixes
       all of them, so one actionable warning beats five identical ones. */
    /* With a who and no conditions, the rule is a catch-all for its own
       people only, so it shadows just the rules below whose who it covers. */
    const scopedCatchAll = r.enabled && hasWho(r.who) && matchesEverything(r.when)
    if ((isCatchAll(r) || scopedCatchAll) && i < rules.length - 1) {
      const shadowed = isCatchAll(r)
        ? rules.filter((_, j) => j > i).length
        : rules.filter((x, j) => j > i && whoContains(r.who, x.who)).length
      if (shadowed > 0) {
        out.push({
          id: `catchall-${r.id}`,
        code: 'PE104',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: `Shadows ${shadowed} rule${shadowed === 1 ? '' : 's'} below it`,
          detail: isCatchAll(r)
            ? `This rule has no conditions, so everyone who reaches it matches. ${shadowed === 1 ? 'The rule' : 'The rules'} below it covering the same people can never run. Add a condition, or move this rule down.`
            : `This rule has no conditions, so everyone it applies to matches. ${shadowed === 1 ? 'The rule' : 'The rules'} below it for the same people can never run. Add a condition, or move this rule down.`,
        })
      }
    }

    /* --- Switched off -------------------------------------------------------- */
    if (!r.enabled) {
      out.push({
        id: `disabled-${r.id}`,
        code: 'PE140',
        scope: 'rule',
        severity: 'info',
        ruleIndex: i,
        title: 'Switched off',
        detail: 'This rule is skipped entirely. Logins fall through to the rules below it.',
      })
    }

    /* --- Reaches nobody ------------------------------------------------------ */
    if (r.enabled && r.matchEstimate === 0) {
      out.push({
        id: `empty-${r.id}`,
        code: 'PE141',
        scope: 'rule',
        severity: 'warning',
        ruleIndex: i,
        title: 'Matches nobody today',
        detail: 'No current user meets these conditions. The rule is valid and will apply if that changes.',
      })
    }

  })

  /* --- The terminal rule ------------------------------------------------------
     It has no conditions to check, but it decides every sign-in the rules
     above it miss, so its outcome settings are checked like any rule's. Its
     findings belong to no rule row: ruleIndex -1, scope 'policy'. */
  if (policy.fallback) {
    for (const f of outcomeFindings(policy.fallback)) {
      out.push({
        id: `${f.key}-fallback`,
        code: f.code,
        scope: 'policy',
        severity: f.severity,
        ruleIndex: -1,
        title: `${FALLBACK_NAME}: ${f.title.charAt(0).toLowerCase()}${f.title.slice(1)}`,
        detail: f.detail,
      })
    }
  }

  return out
}

/* What a rule's outcome settings get wrong on their own, whatever it matches
   on. Shared by every rule and by the terminal rule. `key` prefixes the id. */
export interface OutcomeFinding {
  key: string
  code: string
  severity: Severity
  title: string
  detail: string
}

export function outcomeFindings(r: Rule): OutcomeFinding[] {
  const out: OutcomeFinding[] = []
  if (r.decision === 'deny' && (r.secondFactor === 'specific' || r.rememberMfa || r.allowDisable2fa)) {
    out.push({
      key: 'denyfactors',
      code: 'PE120',
      severity: 'warning',
      title: 'Authentication settings on a Deny rule',
      detail: 'This rule blocks access, so nobody ever reaches a factor prompt. These settings have no effect.',
    })
  }
  if (r.decision === '2fa' && r.allowDisable2fa) {
    out.push({
      key: 'optout',
      code: 'PE121',
      severity: 'warning',
      title: 'Users can opt out of this requirement',
      detail: 'The rule requires a second factor, but end users are allowed to switch theirs off. Anyone who does is no longer covered by it.',
    })
  }
  if (r.decision === '2fa' && r.secondFactor === 'specific' && (r.secondFactorMethods?.length ?? 0) === 0) {
    out.push({
      key: 'nomethods',
      code: 'PE122',
      severity: 'error',
      title: 'No second factor chosen',
      detail: 'The rule asks for specific methods but none are selected, so there is nothing for a user to verify with.',
    })
  }
  if (r.decision !== 'deny' && r.firstFactor === 'Specific' && !r.firstFactorMethod) {
    out.push({
      key: 'nofirstmethod',
      code: 'PE123',
      severity: 'error',
      title: 'No first factor method chosen',
      detail: 'Choose a method or pick Password.',
    })
  }
  return out
}
