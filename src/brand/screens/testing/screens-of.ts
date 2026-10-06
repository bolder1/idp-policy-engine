import { DEFAULT_DENY_MESSAGE, FALLBACK_NAME, type AccessDecision, type Policy, type Rule, type User } from '../../data'
import { DEFAULT_METHOD_ID, methodBlocker, type AuthMethod } from '../../methods'
import { enrolShapeFor, type EnrolKind } from '../../user-methods'
import type { TenantResolution } from '../tenant-resolver'

/* -----------------------------------------------------------------------------
   What the person signing in would see, screen by screen.

   The decision is the admin's word for it; the person gets a page. "Allow
   with 2FA" is a password and then "Enter the code from Google
   Authenticator", and which method it is decides whether the rule is worth
   anything — so the testing surfaces end on the pages, not on the word.

   An approximation, and said to be one wherever it is drawn: the product's
   own pages are not in this prototype. What is exact is what the rule says —
   which first factor, which second method it offers first, the deny message
   verbatim — and what the tenant has switched on, because a method nobody can
   be offered is not a page anybody sees.

   One entry per decision the sign-in could get: one when it is settled, two or
   three when a fact it needs was not stated, each from the first rule that
   would give it.
   -------------------------------------------------------------------------- */

export type ScreenStep =
  | { kind: 'password'; username: string }
  /** A specific first factor in place of the password: a passkey, a magic link. */
  | { kind: 'first-method'; method: string; prompt: 'passkey' | 'link' | 'other' }
  /** The second factor. `method` is null when the rule names one nobody can be offered. */
  | { kind: 'second'; method: AuthMethod | null; name: string; prompt: EnrolKind; masked: string; rememberDays: number | null }
  | { kind: 'deny'; message: string; action?: string; contact?: string }

export interface SignInScreens {
  decision: AccessDecision
  /** The policy and rule the pages come from, for the caption. */
  policyName: string
  ruleName: string
  steps: ScreenStep[]
  /** Who is signing in, for the pages that name them: the account on a code
      page, the face on the application once they are in. Absent when the
      directory has nobody by that id. */
  person?: { name: string; email: string }
}

export interface ScreensContext {
  policies: readonly Policy[]
  /** The policy standing in for its stored twin — the board's draft, or one assumed on. */
  substitute?: Policy
  methods: readonly AuthMethod[]
  /** The tenant's default second method, or unset for the product's own. */
  defaultMethodId: string | null | undefined
  /** The name, where the caller has it, is only for the pages that greet them. */
  person: (Pick<User, 'email'> & Partial<Pick<User, 'name'>>) | null
}

/* A policy with no last row of its own lets everybody else in on a password,
   as the evaluator reads it (simulate.ts). */
const lastRowOf = (p: Policy): Pick<Rule, 'name' | 'decision' | 'firstFactor' | 'secondFactor'> & Partial<Rule> =>
  p.fallback ?? { name: FALLBACK_NAME, decision: '1fa', firstFactor: 'Password', secondFactor: 'any' }

/** "k••••@mo.com": the first character, then the domain, as sign-in pages mask an address. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return email ? `${email.charAt(0)}••••` : ''
  return `${email.charAt(0)}••••${email.slice(at)}`
}

const offerable = (m: AuthMethod) => m.use === 'second' && methodBlocker(m) === null

/* The second method the person is asked for first, by the rule's own choice:

     specific   the first named method the tenant can offer
     any        the tenant's default when it can be offered, else the first
                second method that can
     chain      the chain's first step
     preferred  the named fallback, else as any

   A rule naming only methods nobody can be offered gets a page saying so,
   under the first name it gave. */
function secondMethod(rule: Partial<Rule>, ctx: ScreensContext): { method: AuthMethod | null; name: string } {
  const named = (n: string | undefined) => (n ? ctx.methods.find((m) => m.name === n) : undefined)
  const anyMethod = () => {
    const def = ctx.methods.find((m) => m.id === (ctx.defaultMethodId ?? DEFAULT_METHOD_ID))
    const m = def && offerable(def) ? def : (ctx.methods.find(offerable) ?? null)
    return { method: m, name: m?.name ?? 'A second factor' }
  }
  const asked = (names: readonly string[]) => {
    const m = names.map(named).find((x): x is AuthMethod => x !== undefined && offerable(x))
    return m ? { method: m, name: m.name } : { method: null, name: names[0] }
  }
  switch (rule.secondFactor) {
    case 'specific': {
      const names = rule.secondFactorMethods ?? []
      return names.length > 0 ? asked(names) : anyMethod()
    }
    case 'chain': {
      const step = rule.methodChain?.[0]
      return step ? asked([step]) : anyMethod()
    }
    case 'preferred': {
      const m = named(rule.preferredFallback)
      return m && offerable(m) ? { method: m, name: m.name } : anyMethod()
    }
    default:
      return anyMethod()
  }
}

function firstStep(rule: Partial<Rule>, ctx: ScreensContext): ScreenStep {
  if (rule.firstFactor === 'Specific' && rule.firstFactorMethod) {
    const method = rule.firstFactorMethod
    const prompt = /passkey/i.test(method) ? 'passkey' : /magic link/i.test(method) ? 'link' : 'other'
    return { kind: 'first-method', method, prompt }
  }
  return { kind: 'password', username: ctx.person?.email ?? '' }
}

function stepsOf(rule: Partial<Rule> & Pick<Rule, 'decision'>, ctx: ScreensContext): ScreenStep[] {
  if (rule.decision === 'deny') return [{ kind: 'deny', message: rule.denyMessage ?? DEFAULT_DENY_MESSAGE, action: rule.denyAction, contact: rule.denyContact }]
  const first = firstStep(rule, ctx)
  if (rule.decision === '1fa') return [first]
  const { method, name } = secondMethod(rule, ctx)
  return [
    first,
    {
      kind: 'second',
      method,
      name,
      prompt: method ? enrolShapeFor(method.id).kind : 'none',
      masked: maskEmail(ctx.person?.email ?? ''),
      rememberDays: rule.rememberMfa && !rule.forceMfaEachLogin ? (rule.rememberDays ?? 30) : null,
    },
  ]
}

export function screensOf(res: TenantResolution, ctx: ScreensContext): SignInScreens[] {
  if (res.status === 'incomplete' || !res.decidedBy || !res.trace) return []
  const id = res.decidedBy.policyId
  const policy = ctx.substitute?.id === id ? ctx.substitute : ctx.policies.find((p) => p.id === id)
  if (!policy) return []
  const ruleAt = (index: number | null) => (index === null ? lastRowOf(policy) : policy.rules[index])

  /* Settled: the rule the walk stopped at. Otherwise the first outcome for
     each decision, in the order the rules give them. */
  const outcomes: { decision: AccessDecision; index: number | null }[] =
    res.status === 'decided'
      ? [{ decision: res.decision!, index: res.trace.hitIndex }]
      : res.possible.filter((o, i, all) => all.findIndex((x) => x.decision === o.decision) === i).map((o) => ({ decision: o.decision, index: o.ruleIndex }))

  return outcomes.flatMap(({ decision, index }) => {
    const rule = ruleAt(index)
    if (!rule) return []
    const who = ctx.person ? { person: { name: ctx.person.name ?? ctx.person.email, email: ctx.person.email } } : {}
    return [{ decision, policyName: policy.name, ruleName: rule.name, steps: stepsOf(rule, ctx), ...who }]
  })
}

/* What a page asks the person to do, in the words a sign-in page uses. By
   what the method needs from them (user-methods.ts), so every authenticator
   app reads the same way and every emailed code names the masked address. */
export function promptText(step: ScreenStep): string {
  switch (step.kind) {
    case 'password':
      return 'Enter your password'
    case 'first-method':
      return step.prompt === 'passkey' ? 'Use your passkey' : step.prompt === 'link' ? 'Send me a sign-in link' : `Sign in with ${step.method}`
    case 'deny':
      return step.message
    case 'second':
      if (!step.method) return `${step.name} is not available`
      switch (step.prompt) {
        case 'authenticator':
          return `Enter the code from ${step.name}`
        case 'push-app':
          return `Approve the request in ${step.name}`
        case 'email':
          return `Enter the code sent to ${step.masked}`
        case 'alt-email':
          return 'Enter the code sent to your alternate email'
        case 'phone':
          return 'Enter the code sent to your phone'
        case 'phone-and-email':
          return `Enter the code sent to your phone and ${step.masked}`
        case 'passkey':
          return 'Use your passkey'
        case 'questions':
          return 'Answer your security questions'
        case 'token':
        case 'assigned':
          return 'Enter the code from your token'
        /* A method the catalogue does not know: what a sign-in page says for one. */
        case 'none':
          return `Continue with ${step.name}`
      }
  }
}

/** Six boxes for a code the person types: an authenticator app's, or a token's. */
export const asksForCode = (step: ScreenStep): boolean =>
  step.kind === 'second' && step.method !== null && (step.prompt === 'authenticator' || step.prompt === 'token' || step.prompt === 'assigned')

/** The step's name on the switch between pages: "Password | Google Authenticator". */
export function stepLabel(step: ScreenStep): string {
  switch (step.kind) {
    case 'password':
      return 'Password'
    case 'first-method':
      return step.method
    case 'second':
      return step.name
    case 'deny':
      return 'Access denied'
  }
}
