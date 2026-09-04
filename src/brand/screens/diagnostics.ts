import {
  conditionType,
  reach,
  users as seedUsers,
  type AccessDecision,
  type Group,
  type Policy,
  type Rule,
  type User,
} from '../data'
import { cardJoin, ckey, isSingleAndRun, leaves, matchesEverything, sig, topJoin } from '../predicate'
import { SLOW_TIMEOUT_MS, seedHooks, type Hook } from '../hooks'

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

/** Negating operators, paired with the affirmative they contradict. */
const NEGATIONS: Record<string, string> = {
  'is not': 'is',
  'not in zone': 'in zone',
  'not recognised by': 'recognised by',
  'not between': 'between',
  'not in': 'in',
}

/* `audienceCovers` is gone.

   With one audience per policy, "does this rule cover at least everyone that
   rule covers" is tautologically true, and a predicate that always returns true
   is not a filter — it is a comment. Removing it makes the four checks that
   depended on it (subsumption, unreachable, the shadow count, `shadowedBy`)
   strictly stronger: they now compare predicates alone.

   That will look like a regression. More rules get reported unreachable than
   before, because a rule that used to be excused by "well, it targets a
   different group" no longer has that excuse — the group narrowing is a
   condition now, and the checks read conditions. */

/** A rule that matches every sign-in reaching it. */
const isCatchAll = (r: Rule) => r.enabled && matchesEverything(r.when)

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

/** The predicate, normalised. Audience is no longer part of it — it is the policy's. */
const signature = (r: Rule) => sig(r.when)

/* Which rules below `index` that rule puts out of reach.

   The same two predicates the `unreachable` check uses, so the answer is sound
   by construction — it can never dim a rule that is genuinely reachable. Used
   by the canvas to show, on hover, the thing first-match-wins hides: that a
   broad rule high up silently kills specific rules beneath it. */
export function shadowedBy(policy: Policy, index: number): number[] {
  const rule = policy.rules[index]
  if (!rule || !isCatchAll(rule)) return []
  const out: number[] = []
  policy.rules.forEach((r, j) => {
    if (j > index && r.enabled) out.push(j)
  })
  return out
}

/* `hooks` is optional and falls back to the seed, the same way the prose
   resolver in builder-dialogs does. Callers with a store pass the live list so
   a hook deleted five seconds ago is reported; callers without one (the tests,
   the interview composer) still get sound answers about the seeded catalogue. */
export function diagnose(
  policy: Policy,
  groups: Group[],
  hooks: Hook[] = seedHooks,
  directory: User[] = seedUsers,
): Diagnostic[] {
  const out: Diagnostic[] = []
  const rules = policy.rules
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
       proved about them. */
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
        detail: `An empty ${k.grouped ? 'group' : 'branch'} matches every sign-in, which silently turns this rule into a catch-all. Delete it, or give it a condition.`,
      })
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

    /* --- Configuration that contradicts the outcome -------------------------- */
    if (r.decision === 'deny' && (r.secondFactor === 'specific' || r.rememberMfa || r.allowDisable2fa)) {
      out.push({
        id: `denyfactors-${r.id}`,
        code: 'PE120',
        scope: 'rule',
        severity: 'warning',
        ruleIndex: i,
        title: 'Authentication settings on a Deny rule',
        detail: 'This rule blocks access, so nobody ever reaches a factor prompt. These settings have no effect.',
      })
    }

    if (r.decision === '2fa' && r.allowDisable2fa) {
      out.push({
        id: `optout-${r.id}`,
        code: 'PE121',
        scope: 'rule',
        severity: 'warning',
        ruleIndex: i,
        title: 'Users can opt out of this requirement',
        detail: 'The rule requires a second factor, but end users are allowed to switch theirs off. Anyone who does is no longer covered by it.',
      })
    }

    if (r.decision === '2fa' && r.secondFactor === 'specific' && (r.secondFactorMethods?.length ?? 0) === 0) {
      out.push({
        id: `nomethods-${r.id}`,
        code: 'PE122',
        scope: 'rule',
        severity: 'error',
        ruleIndex: i,
        title: 'No second factor chosen',
        detail: 'The rule asks for specific methods but none are selected, so there is nothing for a user to verify with.',
      })
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

      if (r.decision === 'deny' && hook.onFailure === 'fail-open') {
        out.push({
          id: `hookopen-${r.id}-${c.id}`,
        code: 'PE131',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: 'This rule stops denying when the hook is unavailable',
          detail: `${hook.name} is set to treat a failure as “not matched”. Because this rule denies, an outage or a timeout at the endpoint lets the sign-in through to the rules below instead of refusing it.`,
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
          title: 'This rule can add most of a second to a sign-in',
          detail: `${hook.name} waits up to ${hook.timeoutMs}ms before giving up, and every sign-in that reaches this rule pays it. Worth checking against the endpoint's measured p99.`,
        })
      }
    }

    /* --- Unreachable ---------------------------------------------------------
       Only claimed when it is certain: an earlier enabled rule with no
       conditions and an audience covering this one will always match first.
       An earlier rule *with* conditions might not fire, so it is left alone —
       guessing there would produce warnings on correct policies. */
    const blocker = rules.findIndex((e, j) => j < i && isCatchAll(e))
    if (blocker !== -1) {
      out.push({
        id: `unreachable-${r.id}`,
        code: 'PE103',
        scope: 'rule',
        severity: 'error',
        ruleIndex: i,
        relatedIndex: blocker,
        title: 'This rule can never run',
        detail: `Rule ${blocker + 1} · ${rules[blocker].name} has no conditions and covers the same people, so it always matches first. Evaluation stops there and never reaches this rule.`,
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

          const overlap = ca.values.filter((v) => cb.values.includes(v))
          const opposed = NEGATIONS[cb.operator] === ca.operator || NEGATIONS[ca.operator] === cb.operator

          if (requiresBoth && opposed && overlap.length > 0) {
            out.push({
              id: `contradiction-${r.id}-${ca.id}-${cb.id}`,
              code: 'PE111',
              scope: 'rule',
              severity: 'error',
              ruleIndex: i,
              title: 'These conditions cancel out',
              detail: `${conditionType(ca.typeId).label} is required to be both “${ca.operator} ${overlap.join(', ')}” and “${cb.operator} ${overlap.join(', ')}” in the same branch. Nothing can satisfy both.`,
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
    if (isCatchAll(r) && i < rules.length - 1) {
      const shadowed = rules.filter((_, j) => j > i).length
      if (shadowed > 0) {
        out.push({
          id: `catchall-${r.id}`,
        code: 'PE104',
        scope: 'rule',
          severity: 'warning',
          ruleIndex: i,
          title: `Shadows ${shadowed} rule${shadowed === 1 ? '' : 's'} below it`,
          detail: `This rule has no conditions, so everyone who reaches it matches. ${shadowed === 1 ? 'The rule' : 'The rules'} below it covering the same people can never run. Add a condition, or move this rule down.`,
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
        detail: 'This rule is skipped entirely. Sign-ins fall through to the rules below it.',
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

  return out
}

/* -----------------------------------------------------------------------------
   Impact.

   Only two of these numbers are exact — the audience size and where traffic
   falls through to — and the UI labels the rest as estimates. matchEstimate is
   seeded, not computed, so anything derived from it inherits that and must not
   be presented as a count.
   -------------------------------------------------------------------------- */

export interface Impact {
  /** Exact: how many people the POLICY governs. Every rule's ceiling. */
  audience: number
  /** Estimate: how many of them this rule is expected to match. */
  matches: number
  /** Estimate, 0–100. */
  share: number
  /** Exact: the rule that would take over if this one stopped matching. */
  fallsTo: { index: number; name: string; decision: AccessDecision } | null
  /* How much to trust `matches`.
     - `exact`   — the rule has no conditions, so it matches its whole audience
                   and the number is a fact rather than a guess.
     - `estimate`— seeded, and still describes the rule as written.
     - `stale`   — the conditions have been edited since the estimate was made,
                   so it no longer describes this rule at all.
     matchEstimate is seed data that never recomputes; without this flag the
     panel would keep reporting the old number after every condition was
     deleted, which is worse than reporting nothing. */
  basis: 'exact' | 'estimate' | 'stale'
}

export function impactOf(
  policy: Policy,
  index: number,
  groups: Group[],
  saved?: Policy,
  directory: User[] = seedUsers,
): Impact {
  const rule = policy.rules[index]
  /* The ceiling is the POLICY's audience now, not the rule's. Every rule
     inherits it and no rule can be broader, so a per-rule number would be
     answering a question the model no longer asks. */
  const audience = reach(policy.audience, groups, directory)

  /* Structural, not statistical: the next enabled rule is exactly who inherits
     these sign-ins. There is no audience test left to make here — every rule in
     a policy covers the same people, which is precisely what hoisting the
     audience bought. */
  const nextIdx = policy.rules.findIndex((r, j) => j > index && r.enabled)
  const next = nextIdx === -1 ? null : policy.rules[nextIdx]

  /* No conditions means every one of them matches — that is arithmetic, not an
     estimate, so it is reported as a fact. */
  const exact = matchesEverything(rule.when)
  const before = saved?.rules.find((r) => r.id === rule.id)
  /* `sig` rather than a positional list, and the difference is load-bearing:
     the old compare was order-sensitive on a flat array, so it could not see a
     pure REGROUPING — the same conditions moved between alternatives, which is
     a different rule catching different people. That is the exact failure the
     `stale` basis exists to catch. */
  const edited = !!before && sig(before.when) !== sig(rule.when)

  const matches = exact ? audience : rule.matchEstimate

  return {
    audience,
    matches,
    share: audience > 0 ? Math.min(100, Math.round((matches / audience) * 100)) : 0,
    fallsTo: next ? { index: nextIdx, name: next.name, decision: next.decision } : null,
    basis: exact ? 'exact' : edited ? 'stale' : 'estimate',
  }
}

/** Estimated split of the policy's matched population across outcomes. */
export function outcomeSplit(policy: Policy) {
  const live = policy.rules.filter((r) => r.enabled)
  const total = live.reduce((n, r) => n + r.matchEstimate, 0)
  const by = (d: AccessDecision) =>
    live.filter((r) => r.decision === d).reduce((n, r) => n + r.matchEstimate, 0)
  return {
    total,
    deny: by('deny'),
    mfa: by('2fa'),
    allow: by('1fa'),
    pct: (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0),
  }
}
