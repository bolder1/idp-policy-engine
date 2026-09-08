/* -----------------------------------------------------------------------------
   External hooks — conditions the engine cannot answer on its own.

   Problem 7 in the framework doc, raised by Lenskart and the Oberoi Group:
   "provide an option to configure custom policy conditions by invoking an
   external API to evaluate criteria dynamically and make policy decisions
   accordingly."

   The condition catalogue already had a `Webhook` entry. What it had was a
   label — one free-text box, no endpoint, no timeout, no answer to what the
   response should look like, and no answer at all to the question that decides
   whether any of this is safe to sell: **what happens when the call fails.**

   --- Why this is a library object and not fields on a condition -------------

   Every rule that consults the fraud service consults the same fraud service.
   Written into the condition, the endpoint is copied into every rule that wants
   it, and rotating the URL becomes an audit of every policy in the tenant. The
   doc makes this argument itself about zones: "the reuse problem is solved by
   making objects first-class, not rules." A hook is a zone-shaped problem —
   named once, referenced from anywhere, edited in one place.

   So a rule's condition holds a hook id, exactly as a network condition holds a
   zone id, and this file holds what a hook is.

   --- The two modes, and why both exist --------------------------------------

   The doc asks for both halves and they are genuinely different mechanisms:

   · **Synchronous.** The engine calls out mid-evaluation and waits. Lenskart's
     case. Expressive and immediate, and it puts somebody else's uptime inside
     your login path — which is what `onFailure` and `timeoutMs` exist to make
     an explicit decision rather than an accident.
   · **Attribute sync.** An external system's data is pulled into the user
     profile on a schedule, and rules then read it with ordinary attribute
     conditions. Oberoi-shaped. Nothing to time out at sign-in; the risk moves
     from availability to staleness, which `maxAgeHours` names.

   --- What is deliberately NOT here ------------------------------------------

   The secret. `authHeader` names the header the token travels in; the token
   itself belongs in a credential store, not in a policy document that gets
   exported to JSON and pasted into a ticket. Modelling it here would make the
   first person to use the export feature leak it.
   -------------------------------------------------------------------------- */

export type HookMode = 'sync' | 'attribute-sync'

/* What the engine does when the endpoint does not answer, answers too slowly,
   or answers something that cannot be read.

   No default, and no third "unset" value. An unset failure mode is a rule with
   undefined behaviour on the one day it matters, which is exactly the state
   this whole module exists to end — so the create form asks, and will not save
   until it has been told. */
export type OnFailure = 'fail-open' | 'fail-closed'

export const FAILURE_LABEL: Record<OnFailure, string> = {
  'fail-open': 'Treat as not matched',
  'fail-closed': 'Deny the sign-in',
}

export const FAILURE_BLURB: Record<OnFailure, string> = {
  'fail-open':
    'Evaluation carries on as though the condition did not match. Nobody is locked out by an outage — and a rule that exists to deny stops denying.',
  'fail-closed':
    'The sign-in is refused. Nothing gets through on a guess — and an outage at the endpoint is an outage of your login.',
}

export interface Hook {
  id: string
  name: string
  /** Why this hook exists, same argument as the field on Rule. */
  description?: string
  mode: HookMode
  url: string
  method: 'GET' | 'POST'
  /** The header the credential travels in. Never the credential. */
  authHeader?: string
  /** How long the engine waits before giving up and applying `onFailure`. */
  timeoutMs: number
  /** Dotted path into the JSON response holding the value a rule tests. */
  responsePath: string
  onFailure: OnFailure
  /** Attribute sync only — how stale the synced data may be before it is distrusted. */
  maxAgeHours?: number
}

/* Three PDP calls per login is the framework doc's §6.4 open question, and the
   budget it asks to measure. A single synchronous hook is charged against every
   one of those calls that evaluates a rule naming it, so a generous timeout is
   not a generous timeout — it is that number multiplied.

   500ms is the line above which the warning fires. Not a hard limit: a tenant
   that has measured its own endpoint and decided is entitled to overrule a
   default, and refusing to save would just teach them to write 499. */
export const SLOW_TIMEOUT_MS = 500

export interface HookIssue {
  level: 'error' | 'warning'
  title: string
  detail: string
}

/** Sound-only, same contract as the policy linter: never reports a working hook. */
export function validateHook(h: Hook): HookIssue[] {
  const out: HookIssue[] = []

  if (!h.name.trim())
    out.push({ level: 'error', title: 'No name', detail: 'Rules reference a hook by name. An unnamed one cannot be chosen from the condition list.' })

  if (!h.url.trim()) {
    out.push({ level: 'error', title: 'No endpoint', detail: 'There is nothing to call.' })
  } else if (!/^https:\/\//i.test(h.url.trim())) {
    /* Not pedantry. The request carries a username and the answer decides
       whether that person gets in; over plain HTTP both are readable and, worse,
       writable by anything on the path. */
    out.push({
      level: h.url.trim().startsWith('http://') ? 'error' : 'warning',
      title: 'Not an HTTPS endpoint',
      detail:
        'The request carries the identity being evaluated and the response decides access. Over plain HTTP both can be read and altered in transit.',
    })
  }

  if (h.mode === 'sync') {
    if (!h.responsePath.trim())
      out.push({
        level: 'error',
        title: 'No response path',
        detail: 'The engine needs to know which field of the answer to read. Without one there is nothing to test.',
      })

    if (h.timeoutMs > SLOW_TIMEOUT_MS)
      out.push({
        level: 'warning',
        title: 'Slow enough to be felt',
        detail: `${h.timeoutMs}ms is charged to every sign-in that reaches a rule naming this hook, on top of the engine's own work. Worth confirming against the endpoint's measured p99 rather than its hopeful one.`,
      })

    if (h.timeoutMs <= 0)
      out.push({ level: 'error', title: 'No timeout', detail: 'A call with no time limit is a login with no time limit.' })
  }

  if (h.mode === 'attribute-sync' && !h.maxAgeHours)
    out.push({
      level: 'warning',
      title: 'No freshness limit',
      detail:
        'A sync that has been failing quietly leaves the last-known values in place, and a rule reading them cannot tell current from stale. Setting a limit makes the difference visible.',
    })

  return out
}

export const canSaveHook = (h: Hook) => !validateHook(h).some((i) => i.level === 'error')

/** One sentence describing what the hook does, for the list and the condition row. */
export function describeHook(h: Hook): string {
  if (h.mode === 'attribute-sync')
    return `Pulls attributes from ${host(h.url)}${h.maxAgeHours ? `, trusted for ${h.maxAgeHours}h` : ''}.`
  return `${h.method} ${host(h.url)}, reads ${h.responsePath || '—'}, gives up after ${h.timeoutMs}ms.`
}

function host(url: string): string {
  const m = url.match(/^https?:\/\/([^/]+)/i)
  return m ? m[1] : url || '—'
}

export const seedHooks: Hook[] = [
  {
    id: 'hk-fraud',
    name: 'Fraud score lookup',
    description:
      'The risk team’s own model, which sees payment history this console never will. Added for the Lenskart pilot; owner is the risk platform team, not IAM.',
    mode: 'sync',
    url: 'https://risk.internal/api/v2/score',
    method: 'POST',
    authHeader: 'X-Risk-Token',
    timeoutMs: 300,
    responsePath: 'result.highRisk',
    onFailure: 'fail-open',
  },
  {
    id: 'hk-entitlement',
    name: 'Entitlement check',
    description:
      'Property management system decides who may reach the booking console today. Slow by nature — it is a mainframe query behind a REST facade.',
    mode: 'sync',
    url: 'https://erp.example.com/entitlement',
    method: 'GET',
    authHeader: 'Authorization',
    timeoutMs: 900,
    responsePath: 'entitled',
    onFailure: 'fail-closed',
  },
  {
    id: 'hk-hrms',
    name: 'HRMS attribute sync',
    description: 'Nightly pull of employment status, cost centre and notice period, so rules can read them as ordinary user attributes.',
    mode: 'attribute-sync',
    url: 'https://hrms.example.com/export/employees',
    method: 'GET',
    timeoutMs: 60000,
    responsePath: '',
    onFailure: 'fail-open',
    maxAgeHours: 36,
  },


  /* A hook for HR status. NOTE THE DISTORTION: the engine can only ask a hook
     "returns true" / "returns false" — there is no field/value comparison — so
     the test `hr.status = 'suspended'` has to be MOVED INTO THE HOOK, whose
     responsePath must point at a boolean that is true when the user is suspended.
     The rule can no longer state what it is testing for. Append to `seedHooks`. */
  /* Scenario 11's HR system, and the reason it is fail-OPEN.

     The document gives this provider a contract: "timeout 3s, cache TTL =
     session. First login of day pays the latency; rest cached." And it says
     the scenario reaches fail-closed *through rule structure* — rules 2 and 3
     both require a positive `contract_status = active`, so a null answer fails
     every rule and lands on the Default Rule's DENY — "complementing provider
     fail-mode" rather than depending on it.

     So this is a fail-open provider on a policy whose first rule is a DENY, and
     the linter's `hookopen` warning fires on exactly that pairing. That is not
     a fixture bug to be tuned away: it is the document's own S20 break-point #1
     — "webhook down → the red-flag check silently loses one signal" — sitting
     in the estate where somebody can see the warning and judge it. A warning
     that only ever fires against a hand-built test fixture is one nobody in the
     room ever sees. */
  {
    id: 'hk-hr-contract',
    name: 'HR contract status',
    description:
      'Asks the HR system whether this person’s contract is still active. Returns false when it has ended.',
    mode: 'sync',
    url: 'https://hrms.example.com/api/v1/contract-active',
    method: 'POST',
    authHeader: 'Authorization',
    timeoutMs: 3000,
    responsePath: 'active',
    onFailure: 'fail-open',
  },
  {
    id: 'hk-hr-suspended',
    name: 'HR suspension check',
    description:
      'Returns true when HR reports the account suspended. The comparison lives here, not in the rule, because a rule can only ask a hook for a boolean.',
    mode: 'sync',
    url: 'https://hrms.example.com/api/v1/suspended',
    method: 'POST',
    authHeader: 'Authorization',
    timeoutMs: 400,
    responsePath: 'suspended',
    /* fail-closed, because for PAM a silent loss of the suspension signal is the
       scenario's own named break-point. The engine gets this right — `onFailure`
       is a required field with no default (hooks.ts). */
    onFailure: 'fail-closed',
  },
]
