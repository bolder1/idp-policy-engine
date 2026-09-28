import {
  conditionType,
  fallbackRule,
  FALLBACK_NAME,
  groups as seedGroups,
  users as seedUsers,
  zones as seedZones,
  zoneScopeOf,
  type Condition,
  type ConditionCard,
  type Policy,
  type Predicate,
  type Rule,
} from '../data'
import { DECISION_PHRASE } from '../decision-words'
import { seedProfiles } from '../fingerprint'
import { seedHooks } from '../hooks'
import { cardLetter, leafCount } from '../predicate'
import { hasWho, listNames, whoSummary } from '../rule-who'

/* -----------------------------------------------------------------------------
   The rule, read back as English. One implementation.

   There were six. `builder-dialogs`, v1 (three separate places), `overview`, v5,
   v0 and the interview composer each re-implemented "condition, joiner,
   condition", and they had already diverged — labels kept in one and dropped in
   another, joiners uppercased here and lowercased there, and v1's was simply
   wrong for any rule that mixed AND with OR.

   That mattered more than tidiness, because `review-step` promises the reader
   in-product that the sentence and the rule "cannot disagree". Six renderers is
   six chances for that promise to be false, and grouping makes it worse: a
   renderer that flattens cards prints a rule that catches different people than
   the one that runs.
   -------------------------------------------------------------------------- */

/* Zone, fingerprint, hook, group and user conditions store an id, and the thing
   it points at can be renamed after the rule was written. The resolver is how a
   caller hands in the live directory; without one the seed is used, which is
   right for tests and for any caller with no store. */
export type RefKind = 'zone' | 'fingerprint' | 'hook' | 'group' | 'user'
export type NameLookup = (kind: RefKind, id: string) => string | undefined

export function seedName(kind: RefKind, id: string): string | undefined {
  if (kind === 'zone') return seedZones.find((z) => z.id === id)?.name
  if (kind === 'hook') return seedHooks.find((h) => h.id === id)?.name
  if (kind === 'group') return seedGroups.find((g) => g.id === id)?.name
  if (kind === 'user') return seedUsers.find((u) => u.id === id)?.name
  return seedProfiles.find((p) => p.id === id)?.name
}

const REF_KINDS = new Set<string>(['zone', 'fingerprint', 'hook', 'group', 'user'])

/* What a zone, device profile or hook the tenant has deleted reads as.

   Only when a resolver is supplied: a resolver IS the live library, so an id it
   cannot name is gone, and falling back to the seed would print the name of a
   thing that no longer exists — "in zone Office Network" for a rule the linter
   is reporting as broken (PE134, PE135, PE130). With no resolver there is no
   live library to ask, and the seed stays the answer. */
const DELETED: Partial<Record<RefKind, string>> = {
  /* The type label already names the kind for zones and hooks ("in zone …"),
     so the value only says it is gone. Device profiles drop their label. */
  zone: '(deleted)',
  fingerprint: 'a deleted device profile',
  hook: '(deleted)',
}

function refName(kind: RefKind, id: string, resolve?: NameLookup): string {
  if (resolve) {
    const live = resolve(kind, id)
    if (live != null) return live
    const gone = DELETED[kind]
    if (gone) return gone
  }
  return seedName(kind, id) ?? id
}

/* One condition as English.

   The type label is dropped wherever the object's own name already says which
   field it is — "not recognised by Corporate managed" reads as a sentence where
   "Device Fingerprint not recognised by Corporate managed" reads as a form
   field with its label left on. "is not India" alone does not say what is not
   India, so everything else keeps its label. */
export function conditionSentence(c: Condition, resolve?: NameLookup): string {
  const t = conditionType(c.typeId)
  const raw = c.values.filter((v) => v.trim() !== '')

  /* Values are joined with "or", not with a comma.

     A condition holds when ANY of its values match — the evaluator is
     `vals.some(...)` — and a comma-separated list reads as a conjunction: "in
     zone Office Network, Corporate ASN" sounds like both are required. "or"
     says what actually happens, and it stays correct under negation because the
     operator scopes the whole disjunction: "not in zone A or B" is not-(A or B),
     which is exactly neither.

     A real misreading rather than a stylistic one. It could not bite while both
     value pickers were single-select; the multi-select sheet is what made a
     two-value condition something an author can produce, and the sentence under
     it described a narrower rule than the one that would run. */
  let value: string
  if (REF_KINDS.has(t.valueKind)) {
    const kind = t.valueKind as RefKind
    value = raw.map((v) => refName(kind, v, resolve)).join(' or ')
  } else if (t.valueKind === 'time' || t.valueKind === 'range') {
    value = raw.join('–')
  } else {
    value = raw.join(' or ')
  }

  // Said out loud rather than left blank: the linter calls this an error, and
  // the prose has to agree with the panel next to it.
  if (!value) value = '(no value set)'

  /* The zone's half, said out loud.

     "not in zone Office Network" and "not in zone Office Network, on the
     network only" are two different rules, and this sentence is what the
     change list and the card both print. Without it they read identically,
     which is the one thing a read-back must never do.

     Only when it is narrower than the zone as written — the default is the
     zone's own meaning, and a clause restating a default is noise. */
  if (t.valueKind === 'zone') {
    /* Per zone since 22 Sep 2026. One half shared by every zone is said once
       at the end, as it always was; different halves are said zone by zone. */
    const halves = raw.map((v) => zoneScopeOf(c, v))
    if (halves.every((h) => h === halves[0])) {
      const h = halves[0]
      return `${c.operator} ${value}${h === 'ip' ? ', on the network only' : h === 'location' ? ', by location only' : ''}`
    }
    const each = raw.map((v, i) => {
      const h = halves[i]
      return `${refName('zone', v, resolve)}${h === 'ip' ? ' (on the network)' : h === 'location' ? ' (by location)' : ''}`
    })
    return `${c.operator} ${each.join(' or ')}`
  }
  if (t.valueKind === 'fingerprint') return `${c.operator} ${value}`
  /* A window is a start and an end, said as the words say it: "between 09:00
     and 18:00", not "between 09:00–18:00", which reads the dash as the
     conjunction and then has none. And the zone it is read in, whenever the
     condition names one (describe spec, §7.1): "09:00 to 18:00" in Kolkata
     and in Berlin are different rules, and a read-back that drops the zone
     prints both as the same sentence. */
  if (t.valueKind === 'time') {
    const window = raw.length === 2 ? `${raw[0]} and ${raw[1]}` : value
    return `${t.label} ${c.operator} ${window}${c.tz ? ` (${c.tz})` : ''}`
  }
  /* WHICH attribute, said. "User attribute is FTE" is not a question until it
     names the field — the same gap `key` was added to the model to close
     (22-G1), left open in the one place an admin reads the rule back. */
  if (c.key && (c.typeId === 'user-attr' || c.typeId === 'custom-attr')) return `${t.label} ${c.key} ${c.operator} ${value}`
  return `${t.label} ${c.operator} ${value}`
}

/* One alternative, joined by whichever operator the author chose for it.

   Lowercase, because in a sentence it is punctuation between clauses rather
   than the operator chip the editor draws. The default stays `and`, so a card
   written before joiners existed reads exactly as it did. */
export function cardSentence(conditions: Condition[], resolve?: NameLookup, join: 'and' | 'or' = 'and'): string {
  /* An empty card is reachable now — "Add group" makes the frame before it
     makes a condition — and it matches everything, which is the whole reason
     the linter calls it an error. Joining nothing gave an empty string, so the
     sentence read "(…) or ()" and described a narrower rule than the one that
     would actually run. */
  if (conditions.length === 0) return 'anything'
  const band = join === 'and' ? riskBand(conditions) : null
  const said = conditions.flatMap((c) => {
    if (!band || (c !== band.above && c !== band.below)) return [conditionSentence(c, resolve)]
    /* Said once, where the first of the pair stands. */
    return c === (conditions.indexOf(band.above) < conditions.indexOf(band.below) ? band.above : band.below) ? [band.text] : []
  })
  return said.join(join === 'or' ? ' or ' : ' and ')
}

/* A risk band, said as one: "Device risk score 40 to 70".

   A card that holds `device-risk above 39` and `device-risk below 71` is one
   question — is the score in the medium band — and it read as two, with the
   bounds the evaluator compares against rather than the scores that pass:
   "Device risk score above 39 and Device risk score below 71". Both bounds are
   strict (`above` is greater than, `below` is less than), so the scores that
   pass are a + 1 to b − 1, and that is what the sentence says (describe spec,
   §7.1).

   Only in an AND-card, where both must hold; "above 70 or below 10" is two
   bands. Only for one whole-number value each, and only when some score
   passes both — "above 70 and below 40" is a card nothing matches, and
   folding it into a band would print a range that is not there. */
function riskBand(conditions: Condition[]): { above: Condition; below: Condition; text: string } | null {
  const one = (op: string) => conditions.find((c) => c.typeId === 'device-risk' && c.operator === op && c.values.filter((v) => v.trim() !== '').length === 1)
  const above = one('above')
  const below = one('below')
  if (!above || !below) return null
  const a = Number(above.values.find((v) => v.trim() !== ''))
  const b = Number(below.values.find((v) => v.trim() !== ''))
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null
  const lo = a + 1
  const hi = b - 1
  if (lo > hi) return null
  const label = conditionType('device-risk').label
  return { above, below, text: lo === hi ? `${label} ${lo}` : `${label} ${lo} to ${hi}` }
}

const joinOf = (k: ConditionCard) => k.join ?? 'and'

/* The whole predicate.

   Brackets appear only when there is more than one card, because with one card
   they would be decoration around a thing that has no alternative. A named card
   leads with its name, so "Corp laptops: in zone HQ and device is Registered"
   tells the reader what the author thought the alternative WAS, which is the
   one thing the predicate itself cannot say. */
export function predicateSentence(p: Predicate, resolve?: NameLookup): string {
  if (p.cards.length === 0) return 'any sign-in that reaches this rule'

  const parts = p.cards.map((k) => {
    const body = cardSentence(k.conditions, resolve, joinOf(k))
    const named = k.label?.trim()
    return named ? `${named}: ${body}` : body
  })

  if (parts.length === 1) return parts[0]
  return parts.map((s) => `(${s})`).join(p.join === 'and' ? ' and ' : ' or ')
}

/* The same predicate as structured pieces, for surfaces that want to render the
   brackets and the `or` as elements rather than as text — so a clause can be
   hovered, lit, and linked back to the row that produced it. */
export interface ProseCard {
  id: string
  letter: string
  label?: string
  /** How this card's own clauses are joined. */
  join: 'and' | 'or'
  clauses: { id: string; text: string }[]
}

export function predicateParts(p: Predicate, resolve?: NameLookup): ProseCard[] {
  return p.cards.map((k, i) => ({
    id: k.id,
    letter: cardLetter(i),
    label: k.label?.trim() || undefined,
    join: joinOf(k),
    clauses: k.conditions.map((c) => ({ id: c.id, text: conditionSentence(c, resolve) })),
  }))
}

/** What the rule does when it matches, in one sentence. */
export function decisionSentence(rule: Rule): string {
  /* The message the user is shown, when the rule has its own (the console's
     "Deny message"). Absent, the product's default is shown, and the
     sentence stays the one it always was. */
  if (rule.decision === 'deny') {
    const message = rule.denyMessage?.trim()
    return message ? closed(`Access is blocked with the message “${message}”`) : 'Access is blocked. No alternative path.'
  }
  if (rule.decision === '2fa') {
    /* The first factor is said too (describe spec, §7.1). A 2FA rule is two
       factors, and the sentence named only the second — so "the password,
       then Google Authenticator" and "Email OTP, then Google Authenticator"
       read back as the same rule. */
    const after = `${firstFactorLead(rule)}, the user`
    if (rule.secondFactor === 'specific') {
      const named = rule.secondFactorMethods ?? []
      return named.length > 0
        ? `${after} completes a second factor — ${named.join(' or ')} — before access is granted.`
        : `${after} completes a second factor before access is granted, but no method is chosen yet.`
    }
    if (rule.secondFactor === 'chain') {
      const steps = rule.methodChain ?? []
      return steps.length > 0
        ? `${after} completes every step in order — ${steps.join(' → ')} — before access is granted.`
        : `${after} completes an ordered chain of factors before access is granted.`
    }
    if (rule.secondFactor === 'preferred') {
      return `${after} completes their preferred second factor before access is granted.`
    }
    return `${after} completes any enabled second factor before access is granted.`
  }

  if (rule.firstFactor === 'Any') return 'Access is granted after any single enabled factor. Nothing further is asked.'
  if (rule.firstFactor === 'Specific') {
    return rule.firstFactorMethod
      ? `Access is granted after ${rule.firstFactorMethod} alone. Nothing further is asked.`
      : 'Access is granted after a specific first factor, but no method is chosen yet.'
  }
  return 'Access is granted after the password alone. No second factor is requested.'
}

/* What comes before the second factor, as the sentence opens: "After the
   password", "After Email OTP". A specific first factor with no method is
   said to be unchosen, as the 1-factor sentence says it. */
function firstFactorLead(rule: Rule): string {
  if (rule.firstFactor === 'Any') return 'After any enabled first factor'
  if (rule.firstFactor === 'Specific') return rule.firstFactorMethod ? `After ${rule.firstFactorMethod}` : 'After a first factor not chosen yet'
  return 'After the password'
}

/* The first factor as a list names it: "password", "Email OTP". */
function firstFactorWords(rule: Rule): string {
  if (rule.firstFactor === 'Any') return 'any enabled factor'
  if (rule.firstFactor === 'Specific') return rule.firstFactorMethod ?? 'a method not chosen yet'
  return 'password'
}

/* What a rule decides, as a clause: the three decisions in the words every
   testing surface uses (`DECISION_PHRASE`), then the factors that decision
   asks for, then how long the second one lasts.

   "allow with 2FA, password then Google Authenticator" ·
   "allow on 1 factor, password" · "deny, “Your device does not meet …”" ·
   "allow with 2FA, password then miniOrange Push, device remembered for
   30 days".

   Lower case, because it only ever stands after a colon — the whole policy
   read as text is "{who and if}: {this}." per rule. Nothing about the rule is
   left to a default the reader has to know: an unchosen method says so.

   And so does an unchosen outcome. A rule added with + is born holding
   `decision: '2fa'`, the default, and keeps its `pristine` flag until a tile
   is pressed — conditions and a who added first do not clear it. The card
   prints "Outcome not chosen yet" over such a rule (IfBlock, the owner's
   23 Sep ruling), and this said "allow with 2FA, password then any enabled
   method" beside it. The flag, not `isPristine`, because the flag is what the
   card reads. */
export function outcomePhrase(r: Rule): string {
  if (r.pristine === true) return 'outcome not chosen yet'
  const decision = DECISION_PHRASE[r.decision]
  if (r.decision === 'deny') {
    const message = r.denyMessage?.trim()
    return message ? `${decision}, “${message}”` : decision
  }
  if (r.decision === '1fa') return `${decision}, ${firstFactorWords(r)}`
  const second =
    r.secondFactor === 'specific'
      ? (r.secondFactorMethods ?? []).length > 0
        ? (r.secondFactorMethods ?? []).join(' or ')
        : 'a method not chosen yet'
      : r.secondFactor === 'chain'
        ? (r.methodChain ?? []).length > 0
          ? (r.methodChain ?? []).join(' then ')
          : 'an ordered chain not set yet'
        : r.secondFactor === 'preferred'
          ? 'their preferred method'
          : 'any enabled method'
  /* Remember MFA carries its two settings: how long, or — forced on each
     sign-in — never. Only on a 2FA rule, which is the only one it changes. */
  const days = r.rememberDays ?? 30
  const kept = r.rememberMfa ? (r.forceMfaEachLogin ? ', 2FA every sign-in' : `, device remembered for ${days} day${days === 1 ? '' : 's'}`) : ''
  return `${decision}, ${firstFactorWords(r)} then ${second}${kept}`
}

/* One line of a policy read as text. `n` is the rule's place in the chain,
   for the numbered lines; the lines around the rules have none. `ruleId` is
   the card a line is about — a rule's id, the last row, or nothing. */
export interface PolicyLine {
  key: string
  ruleId: string | 'fallback' | null
  n: number | null
  text: string
}

/* The whole policy as sentences (describe spec, §7.1): where it applies, who
   it is for when that is not everyone, one numbered line per rule in the
   order they are tried, and the last row.

   "Applies to HRMS." · "For Human Resources and Finance." ·
   "1. If in zone Corporate offices: allow with 2FA, password then Google
   Authenticator." · "Nothing else matched: deny."

   The same renderer as every other read-back — `ruleIfLine` for the who and
   the if, `outcomePhrase` for the then — so this and the cards cannot say two
   different things about one rule. A rule switched off keeps its number,
   because the numbers are the chain's, and says it is off first. Every
   application is named, as every audience name is: `listPhrase` made three
   into "HRMS and 2 other applications", and this is what Copy text hands on. */
export function policySentences(p: Policy, resolve: NameLookup | undefined, appName: (id: string) => string): PolicyLine[] {
  const apps = p.isSystem
    ? 'Applies to every application.'
    : p.appIds.length > 0
      ? `Applies to ${listNames(p.appIds.map(appName), Infinity)}.`
      : 'Applies to no applications yet.'
  const lines: PolicyLine[] = [{ key: 'apps', ruleId: null, n: null, text: apps }]
  if (!p.audience.everyone) {
    const who = whoSentence({ groupIds: p.audience.groupIds, userIds: p.audience.userIds }, resolve)
    lines.push({ key: 'audience', ruleId: null, n: null, text: who ? `For ${who}.` : 'For nobody.' })
  }
  p.rules.forEach((r, i) => {
    const line = closed(`${ruleIfLine(r, resolve)}: ${outcomePhrase(r)}`)
    lines.push({ key: `rule:${r.id}`, ruleId: r.id, n: i + 1, text: r.enabled ? line : `Switched off. ${line}` })
  })
  lines.push({ key: 'fallback', ruleId: 'fallback', n: null, text: closed(`${FALLBACK_NAME}: ${outcomePhrase(p.fallback ?? fallbackRule())}`) })
  return lines
}

/* A full stop, unless the sentence already ends on a quoted one: a deny
   message is usually a sentence of its own, and “… contact IT.”. is two
   stops in a row. */
function closed(s: string): string {
  return /[.!?]”$/.test(s) ? s : `${s}.`
}

/** The lines as plain text, one a line, the rules numbered: what Copy text puts on the clipboard. */
export function policyText(lines: readonly PolicyLine[]): string {
  return lines.map((l) => (l.n === null ? l.text : `${l.n}. ${l.text}`)).join('\n')
}

/* Who a rule applies to, as a phrase — or `null` for everyone.

   Every name printed, because a sentence has room a list row does not. Groups
   and people resolve through the same lookup as conditions, and an id the
   directory cannot name prints as the id. */
export function whoSentence(who: Rule['who'], resolve?: NameLookup): string | null {
  if (!hasWho(who)) return null
  return whoSummary(who, (kind, id) => refName(kind, id, resolve), Infinity)
}

/** What a rule is called on screen. A blank or whitespace-only name still needs a label. */
export function ruleLabel(rule: Pick<Rule, 'name'>): string {
  return rule.name.trim() || 'Untitled rule'
}

/** The lowest "Rule N" no rule in the list is already called. */
export function nextRuleName(rules: Pick<Rule, 'name'>[]): string {
  const taken = new Set(rules.map((r) => r.name.trim().toLowerCase()))
  for (let n = 1; ; n += 1) if (!taken.has(`rule ${n}`)) return `Rule ${n}`
}

export interface RuleProse {
  /** Who the rule applies to — "Finance and Mehak Rao". `null` is everyone the policy governs. */
  who: string | null
  /** Everything after "IF:" — the predicate, brackets and all. Never names people or groups. */
  iff: string
  /** Everything after "THEN: →" — what the decision does, in one sentence. */
  then: string
}

/** The rule as the lines the review surfaces print under its name: who, if, then. */
export function ruleSentence(rule: Rule, resolve?: NameLookup): RuleProse {
  return { who: whoSentence(rule.who, resolve), iff: predicateSentence(rule.when, resolve), then: decisionSentence(rule) }
}

/* The who and the if as one line, for a surface that prints one.

   "For Finance and Mehak Rao, if in zone Office Network" · "For Finance, any
   sign-in" · "If in zone Office Network" · "Any sign-in that reaches this
   rule". */
export function ruleIfLine(rule: Rule, resolve?: NameLookup): string {
  /* Mid-sentence: "For everyone except Contractors", not "For Everyone …". */
  const who = whoSentence(rule.who, resolve)?.replace(/^Everyone\b/, 'everyone')
  const empty = rule.when.cards.length === 0
  if (!who) return empty ? 'Any sign-in that reaches this rule' : `If ${predicateSentence(rule.when, resolve)}`
  return empty ? `For ${who}, any sign-in` : `For ${who}, if ${predicateSentence(rule.when, resolve)}`
}

/* A short rule for a list row: who in a few words, then the conditions.

   "Finance · 2 conditions" · "Finance · No conditions" · "3 conditions" ·
   "Always matches" — the last only when nobody is named and nothing is
   checked, which is the one case it is true. */
export function ruleSummary(rule: Rule, resolve?: NameLookup): string {
  if (!hasWho(rule.who)) return predicateSummary(rule.when)
  const who = whoSummary(rule.who, (kind, id) => refName(kind, id, resolve), 2)
  const n = leafCount(rule.when)
  return `${who} · ${n === 0 ? 'No conditions' : predicateSummary(rule.when)}`
}

/** A short predicate for a list row — "2 alternatives" rather than a paragraph. About the WHEN only; see `ruleSummary`. */
export function predicateSummary(p: Predicate): string {
  if (p.cards.length === 0) return 'Always matches'
  const n = p.cards.reduce((t, k) => t + k.conditions.length, 0)
  if (p.cards.length === 1) return `${n} condition${n === 1 ? '' : 's'}`
  return `${p.cards.length} ${p.join === 'and' ? 'groups' : 'alternatives'} · ${n} conditions`
}
