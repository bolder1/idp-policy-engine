import { conditionType, type AccessDecision, type Group, type Policy, type Rule } from '../data'

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
  /** Rule this is reported against. */
  ruleIndex: number
  /** The other rule involved, when the problem is a relationship. */
  relatedIndex?: number
}

/** Negating operators, paired with the affirmative they contradict. */
const NEGATIONS: Record<string, string> = {
  'is not': 'is',
  'not in zone': 'in zone',
  'not compliant with': 'compliant with',
  'not between': 'between',
  'not in': 'in',
}

/** True when `outer` matches at least everyone `inner` does. */
function audienceCovers(outer: Rule, inner: Rule) {
  if (outer.appliesTo.includes('all')) return true
  if (inner.appliesTo.includes('all')) return false
  return inner.appliesTo.every((g) => outer.appliesTo.includes(g))
}

/** A rule with no conditions matches every sign-in that reaches it. */
const isCatchAll = (r: Rule) => r.enabled && r.conditions.length === 0

/** Identity of a condition, ignoring the running id and value order. */
const ckey = (c: { typeId: string; operator: string; values: string[] }) =>
  `${c.typeId}|${c.operator}|${[...c.values].sort().join('␟')}`

const allAnd = (r: Rule) => r.conditions.length < 2 || r.conditions.slice(1).every((c) => c.joiner === 'AND')
const allOr = (r: Rule) => r.conditions.length > 1 && r.conditions.slice(1).every((c) => c.joiner === 'OR')

/** Audience + predicate, normalised — the thing that decides whether a rule fires. */
const signature = (r: Rule) =>
  JSON.stringify({
    a: [...r.appliesTo].sort(),
    c: r.conditions.map((c, i) => ({ k: ckey(c), j: i === 0 ? 'AND' : c.joiner })),
  })

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
    if (j > index && r.enabled && audienceCovers(rule, r)) out.push(j)
  })
  return out
}

export function diagnose(policy: Policy, groups: Group[]): Diagnostic[] {
  const out: Diagnostic[] = []
  const rules = policy.rules
  // The global default is a deliberate catch-all; warning about it is noise.
  if (policy.isSystem) return out

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
          severity: 'error',
          ruleIndex: i,
          relatedIndex: first,
          title: same ? 'Duplicate of an earlier rule' : 'Contradicts an earlier rule',
          detail: same
            ? `Rule ${first + 1} · ${rules[first].name} has the same audience and conditions, so it always matches first. This rule never runs.`
            : `Rule ${first + 1} · ${rules[first].name} has the same audience and conditions but a different outcome. It matches first, so ${DECISION_WORD[rules[first].decision]} wins and this rule never runs.`,
        })
      }
    }

    /* --- Subsumed by an earlier, broader predicate ---------------------------
       Sound logic, no data needed: if every condition of an earlier all-AND
       rule also appears in this one, then A∧B∧C ⟹ A, so anything matching here
       already matched there and stopped. The pure-OR mirror holds too. Webhook
       conditions are excluded — their result is opaque, so nothing can be
       proved about them. */
    if (r.enabled && allAnd(r) && r.conditions.length > 0) {
      const mine = new Set(r.conditions.map(ckey))
      const opaque = (x: Rule) => x.conditions.some((c) => c.typeId === 'webhook')
      const idx = rules.findIndex(
        (e, j) =>
          j < i &&
          e.enabled &&
          e.conditions.length > 0 &&
          !opaque(e) &&
          !opaque(r) &&
          audienceCovers(e, r) &&
          (allAnd(e)
            ? e.conditions.every((c) => mine.has(ckey(c)))
            : allOr(e) && e.conditions.some((c) => mine.has(ckey(c)))),
      )
      if (idx !== -1 && !out.some((d) => d.id === `dupe-${r.id}`)) {
        out.push({
          id: `subsumed-${r.id}`,
          severity: 'error',
          ruleIndex: i,
          relatedIndex: idx,
          title: 'This rule can never run',
          detail: `Rule ${idx + 1} · ${rules[idx].name} matches everything this rule matches, and it is evaluated first. Making a rule more specific than one above it puts it out of reach.`,
        })
      }
    }

    /* --- Mixed joiners -------------------------------------------------------
       The model stores a joiner per condition with no precedence anywhere, so
       `A AND B OR C` has no defined meaning — it reads differently depending on
       where the brackets go. The engine evaluates left to right; the admin
       almost certainly did not intend that. */
    if (r.conditions.length > 2) {
      const joiners = new Set(r.conditions.slice(1).map((c) => c.joiner))
      if (joiners.size > 1) {
        out.push({
          id: `mixed-${r.id}`,
          severity: 'warning',
          ruleIndex: i,
          title: 'Mixes AND with OR',
          detail: 'There is no grouping in this model, so these are read strictly left to right. Split the rule in two if you meant something else.',
        })
      }
    }

    /* --- A condition with nothing to match on -------------------------------- */
    const blank = r.conditions.filter((c) => c.values.length === 0 || c.values.every((v) => !v.trim()))
    if (blank.length > 0) {
      out.push({
        id: `blank-${r.id}`,
        severity: 'error',
        ruleIndex: i,
        title: `${blank.length} condition${blank.length === 1 ? ' has' : 's have'} no value`,
        detail: `${blank.map((c) => conditionType(c.typeId).label).join(', ')} — a condition with nothing to compare against can never match, so this rule cannot fire.`,
      })
    }

    /* --- Configuration that contradicts the outcome -------------------------- */
    if (r.decision === 'deny' && (r.secondFactor === 'specific' || r.rememberMfa || r.allowDisable2fa)) {
      out.push({
        id: `denyfactors-${r.id}`,
        severity: 'warning',
        ruleIndex: i,
        title: 'Authentication settings on a Deny rule',
        detail: 'This rule blocks access, so nobody ever reaches a factor prompt. These settings have no effect.',
      })
    }

    if (r.decision === '2fa' && r.allowDisable2fa) {
      out.push({
        id: `optout-${r.id}`,
        severity: 'warning',
        ruleIndex: i,
        title: 'Users can opt out of this requirement',
        detail: 'The rule requires a second factor, but end users are allowed to switch theirs off. Anyone who does is no longer covered by it.',
      })
    }

    if (r.decision === '2fa' && r.secondFactor === 'specific' && (r.secondFactorMethods?.length ?? 0) === 0) {
      out.push({
        id: `nomethods-${r.id}`,
        severity: 'error',
        ruleIndex: i,
        title: 'No second factor chosen',
        detail: 'The rule asks for specific methods but none are selected, so there is nothing for a user to verify with.',
      })
    }

    /* --- Unreachable ---------------------------------------------------------
       Only claimed when it is certain: an earlier enabled rule with no
       conditions and an audience covering this one will always match first.
       An earlier rule *with* conditions might not fire, so it is left alone —
       guessing there would produce warnings on correct policies. */
    const blocker = rules.findIndex((e, j) => j < i && isCatchAll(e) && audienceCovers(e, r))
    if (blocker !== -1) {
      out.push({
        id: `unreachable-${r.id}`,
        severity: 'error',
        ruleIndex: i,
        relatedIndex: blocker,
        title: 'This rule can never run',
        detail: `Rule ${blocker + 1} · ${rules[blocker].name} has no conditions and covers the same people, so it always matches first. Evaluation stops there and never reaches this rule.`,
      })
    }

    /* --- Contradictory conditions -------------------------------------------
       Same field asserted and denied on the same value, joined by AND. Only
       checked across an unbroken run of ANDs: once an OR appears the group can
       still be satisfied by the other side. */
    for (let a = 0; a < r.conditions.length; a++) {
      for (let b = a + 1; b < r.conditions.length; b++) {
        const ca = r.conditions[a]
        const cb = r.conditions[b]
        if (ca.typeId !== cb.typeId) continue
        // Every joiner between them must be AND for both to be required.
        const allAnd = r.conditions.slice(a + 1, b + 1).every((c) => c.joiner === 'AND')
        if (!allAnd) continue

        const overlap = ca.values.filter((v) => cb.values.includes(v))
        const opposed = NEGATIONS[cb.operator] === ca.operator || NEGATIONS[ca.operator] === cb.operator

        if (opposed && overlap.length > 0) {
          out.push({
            id: `contradiction-${r.id}-${a}-${b}`,
            severity: 'error',
            ruleIndex: i,
            title: 'These conditions cancel out',
            detail: `${conditionType(ca.typeId).label} is required to be both “${ca.operator} ${overlap.join(', ')}” and “${cb.operator} ${overlap.join(', ')}”. Nothing can satisfy both, so this rule never matches.`,
          })
        } else if (
          ca.operator === cb.operator &&
          JSON.stringify(ca.values) === JSON.stringify(cb.values)
        ) {
          out.push({
            id: `duplicate-${r.id}-${a}-${b}`,
            severity: 'info',
            ruleIndex: i,
            title: 'Duplicate condition',
            detail: `${conditionType(ca.typeId).label} “${ca.operator} ${ca.values.join(', ')}” is listed twice. The second one changes nothing.`,
          })
        }
      }
    }

    /* --- A catch-all above other rules --------------------------------------
       Reported on the cause rather than each victim: fixing the one rule fixes
       all of them, so one actionable warning beats five identical ones. */
    if (isCatchAll(r) && i < rules.length - 1) {
      const shadowed = rules.filter((o, j) => j > i && audienceCovers(r, o)).length
      if (shadowed > 0) {
        out.push({
          id: `catchall-${r.id}`,
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
        severity: 'warning',
        ruleIndex: i,
        title: 'Matches nobody today',
        detail: 'No current user meets these conditions. The rule is valid and will apply if that changes.',
      })
    }

    /* --- Audience with no members ------------------------------------------- */
    if (!r.appliesTo.includes('all')) {
      const empty = r.appliesTo.filter((g) => (groups.find((x) => x.id === g)?.memberCount ?? 0) === 0)
      if (empty.length > 0) {
        out.push({
          id: `emptygroup-${r.id}`,
          severity: 'warning',
          ruleIndex: i,
          title: 'Targets an empty group',
          detail: `${empty
            .map((g) => groups.find((x) => x.id === g)?.name ?? g)
            .join(', ')} has no members, so this rule cannot apply to anyone through it.`,
        })
      }
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
  /** Exact: total membership of the groups this rule targets. Its ceiling. */
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

export function impactOf(policy: Policy, index: number, groups: Group[], saved?: Policy): Impact {
  const rule = policy.rules[index]
  const audience = rule.appliesTo.includes('all')
    ? groups.reduce((n, g) => (g.id === 'all' ? Math.max(n, g.memberCount) : n), 0) ||
      groups.reduce((n, g) => n + g.memberCount, 0)
    : rule.appliesTo.reduce((n, g) => n + (groups.find((x) => x.id === g)?.memberCount ?? 0), 0)

  /* Structural, not statistical: the next enabled rule whose audience overlaps
     this one is exactly who inherits these sign-ins. */
  const nextIdx = policy.rules.findIndex(
    (r, j) =>
      j > index &&
      r.enabled &&
      (r.appliesTo.includes('all') ||
        rule.appliesTo.includes('all') ||
        r.appliesTo.some((g) => rule.appliesTo.includes(g))),
  )
  const next = nextIdx === -1 ? null : policy.rules[nextIdx]

  /* No conditions means every one of them matches — that is arithmetic, not an
     estimate, so it is reported as a fact. */
  const exact = rule.conditions.length === 0
  const before = saved?.rules.find((r) => r.id === rule.id)
  const edited =
    !!before &&
    JSON.stringify(before.conditions.map(ckey)) !== JSON.stringify(rule.conditions.map(ckey))

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
