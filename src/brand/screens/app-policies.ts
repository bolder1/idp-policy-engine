import { coversEveryApp, enforces, type App, type Policy } from '../data'

/* -----------------------------------------------------------------------------
   What protects an application, and what attaching one more would mean.

   The Applications screen asks a question no other screen asks: not "what does
   this policy cover" but "what covers this application" — the same relation
   read from the other end. Everything that answers it lives here rather than in
   the screen, so the assertions below can be made without rendering anything,
   which is how every model decision in this codebase is pinned.

   `usage.ts:policiesUsing` is NOT the thing to generalise for this. It finds
   policies whose rule CONDITIONS name a library object — a zone, a fingerprint
   profile — and its own comment refuses to be widened. An application is not
   referenced by a condition; it is the subject of the policy.
   -------------------------------------------------------------------------- */

/* Whether a policy actually decides sign-ins.

   `enforces` AND at least one enabled rule, which is exactly the pair of tests
   `Coverage.match` applies before it will draw a cell. Stated once, here, so
   the panel's precedence numbers and the coverage grid cannot disagree about
   which policies are in the race: a policy that is a draft, or switched off,
   or that has no enabled rule to run, reaches no sign-in — and
   numbering it 2 of 3 on this screen while the grid leaves its column blank
   would make one of the two a liar. */
export function decidesFor(p: Policy): boolean {
  return enforces(p) && p.rules.some((r) => r.enabled)
}

/* Every policy naming this app, in store order — because store order IS
   precedence, the same order the policies table and the builder read.

   Never the system policy. `coversEveryApp` is true for it, so a filter written
   as "covers this app" would put the tenant default at the top of every
   application's list and imply it had been attached to each one. It is the
   fall-through, and it belongs in `Protection.fallback` where it can be said
   once, as what happens when nothing above matched. */
export function policiesForApp(appId: string, policies: Policy[]): Policy[] {
  return policies.filter((p) => !p.isSystem && p.appIds.includes(appId))
}

export interface Protection {
  /** Policies on this app, in store order. */
  own: Policy[]
  /** The subset that decides sign-ins, same order. */
  decides: Policy[]
  /** The tenant default. Found by `coversEveryApp`, never by an empty `appIds`. */
  fallback: Policy | null
}

export function protectionOf(appId: string, policies: Policy[]): Protection {
  const own = policiesForApp(appId, policies)
  return {
    own,
    decides: own.filter(decidesFor),
    /* By `coversEveryApp`, not by `appIds.length === 0`. Those are two
       different facts: a policy somebody created and has not assigned yet also
       has no applications, and calling it the tenant default would be a serious
       misreading of a half-finished draft. */
    fallback: policies.find(coversEveryApp) ?? null,
  }
}

/* 1, 2, 3… for the rows that decide; null for the rows that do not.

   Same length and order as the input, so a caller can zip it against the rows
   it drew. The numbers are EARNED: a switched-off policy sitting between two
   live ones does not take a number and does not push the one below it down,
   because it is not in the order — it is beside it. */
export function orderOf(rows: Policy[]): (number | null)[] {
  let n = 0
  return rows.map((p) => (decidesFor(p) ? ++n : null))
}

/* Why this row has no number, or null when it has one.

   Precedence, not a set: a policy that is switched off AND has no enabled rules
   is reported as switched off, because that is the one fact that explains the
   other three and the only one worth acting on first. */
export function whyNotDeciding(p: Policy): string | null {
  /* Draft first, and it is not the same sentence as switched-off. "Switched
     off" says somebody turned it off; a draft has never been on, and telling
     an administrator they switched off something they never published is the
     kind of small lie that costs a screen its credibility. */
  if (p.status === 'draft') return 'Draft. It decides no sign-ins.'
  if (p.status === 'inactive') return 'Inactive. It decides no sign-ins.'
  if (!p.rules.some((r) => r.enabled)) return 'No rule is turned on. Every sign-in falls through.'
  return null
}

/* Names in a sentence: "Box", "Box and Slack", "Box and 3 other applications".
   Empty for none. `plural` names the rest, which is always two or more. */
export function listPhrase(names: string[], plural = 'applications'): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} other ${plural}`
}

/* The applications only this policy decides, in the policy's own order.

   Take this policy away (delete it, or turn it off) and these fall through to
   the tenant default. An app another deciding policy also covers is not on the
   list: that policy still decides it. */
export function decidedOnlyBy(policy: Policy, policies: Policy[]): string[] {
  if (policy.isSystem || !decidesFor(policy)) return []
  return policy.appIds.filter((appId) => {
    const d = protectionOf(appId, policies).decides
    return d.length === 1 && d[0].id === policy.id
  })
}

/* The one line the delete confirmation says about a policy.

   "Protects" only for a policy that decides sign-ins. A draft or an inactive
   policy is assigned to its apps and protects nothing. Null when there is
   nothing worth saying (a draft with no applications). */
export function deleteDetail(policy: Policy, policies: Policy[], apps: App[]): string | null {
  const named = apps.filter((a) => policy.appIds.includes(a.id))
  if (named.length === 0) return null
  const names = listPhrase(named.map((a) => a.name))
  if (!decidesFor(policy)) return `Assigned to ${names}. It decides no sign-ins.`
  const alone = decidedOnlyBy(policy, policies)
  const fallback = policies.find(coversEveryApp)
  if (alone.length === 0 || !fallback) return `Protects ${names}.`
  if (alone.length === named.length) return `Protects ${names}. Sign-ins there will use the ${fallback.name}.`
  const aloneNames = listPhrase(named.filter((a) => alone.includes(a.id)).map((a) => a.name))
  return `Protects ${names}. Sign-ins to ${aloneNames} will use the ${fallback.name}.`
}

export type AttachKind = 'fresh' | 'already-here' | 'also' | 'system'

/* What assigning this policy to this app would actually be.

   `isSystem` is tested FIRST, before the empty-`appIds` branch, and that order
   is the whole reason this function exists rather than being inlined as a
   ternary. The tenant default names no applications — it covers everything by
   being the system policy — so a check that asks "is the list empty?" first
   classifies it as an unassigned draft and offers to attach the fall-through to
   Salesforce. Every other surface in the product disambiguates with `isSystem`
   first; so does this.

   `move` was the fourth kind and it has become `also`, which is not a rename.
   It described taking a policy AWAY from the application it was on, because a
   policy had one and giving it another meant losing the first. A policy holds a
   list now, so the same gesture adds. That turns the consequential choice in
   this picker into a free one, and the copy that warned about it has to stop. */
export function attachKind(p: Policy, appId: string): AttachKind {
  if (p.isSystem) return 'system'
  if (p.appIds.length === 0) return 'fresh'
  return p.appIds.includes(appId) ? 'already-here' : 'also'
}

/* What the picker may offer, unassigned first.

   The old reason for that order was that attaching an unassigned policy cost
   nothing while attaching an assigned one TOOK it from somewhere. Neither half
   is a cost any more — adding an application to a policy that already has two
   removes nothing from either.

   The order stays, for a different and smaller reason: a policy with no
   applications is doing nothing at all until it gets one, so it is the one this
   list can most usefully offer first. What has gone is the warning that used to
   ride on the distinction. */
export function attachableTo(appId: string, policies: Policy[]): Policy[] {
  const kinds = policies
    .map((p) => ({ p, kind: attachKind(p, appId) }))
    .filter((x) => x.kind === 'fresh' || x.kind === 'also')
  return [...kinds.filter((x) => x.kind === 'fresh'), ...kinds.filter((x) => x.kind === 'also')].map((x) => x.p)
}

/* The policy as it would be after attaching. Pure: nothing here reaches a store.

   Throws on an app id the tenant does not have, and that guard is not
   defensive noise. `store.appById` resolves an unknown id to `apps[0]` with no
   undefined branch, so a bad write does not throw anywhere — it silently
   renders the policy as **Salesforce** on six different surfaces. The screen
   cannot produce a bad id; this refuses one anyway, because the guard is the
   difference between a future bug being loud and being a mystery. */
export function attachTo(p: Policy, appId: string, apps: App[]): Policy {
  if (!apps.some((a) => a.id === appId)) {
    throw new Error(`attachTo: no application with id ${appId}`)
  }
  /* Idempotent, and it has to be: `attachKind` reports `already-here` but the
     picker is not the only caller, and a list that can hold the same
     application twice would draw it twice, count it twice, and let one removal
     leave the other behind. */
  if (p.appIds.includes(appId)) return p
  return { ...p, appIds: [...p.appIds, appId] }
  /* `status`, `lastModified` and `modifiedBy` are deliberately untouched. The
     store stamps the timestamp on save — two writers of one field is two
     sources of truth — and a policy that became ACTIVE because somebody
     attached it would be a silent enforcement change nobody asked for.

     In particular attaching does NOT promote a draft. Giving a policy its
     application is one of the things a draft was missing, not proof that it is
     finished, and publishing something because a form was filled in is exactly
     the silent enforcement change the paragraph above refuses. */
}

/* Taking ONE application off a policy.

   It used to take the only one, so it always emptied the policy and always
   demoted it to a draft. With a list that is the exception rather than the
   rule: a policy on GitHub and AWS, removed from GitHub, is still a live policy
   protecting AWS, and demoting it would switch off enforcement on an
   application nobody touched. So `appId` is a parameter now — this removes the
   one it is given — and the demotion is conditional on the list emptying.

   When it does empty, the demotion still fires, for the original reason: a
   policy with no application is missing something it needs before it can be
   published, and the product has exactly one word for that. It is not left
   ACTIVE with a warning hung off it; that is a state this product does not
   have.

   It is also the only demotion here. `attachTo` does not promote in return: an
   assigned draft is a draft that now has an application. */
export function detachFrom(p: Policy, appId: string): Policy {
  if (p.isSystem) throw new Error('detachFrom: the tenant default has no application to remove')
  const appIds = p.appIds.filter((id) => id !== appId)
  return appIds.length === 0 ? { ...p, appIds, status: 'draft' } : { ...p, appIds }
}


export interface AppSummary {
  own: number
  decides: number
  /** What the cell says: "3 policies", "Default only". */
  label: string
  /** The qualification, when there is one: "1 not deciding", "Draft", "Inactive". */
  tag: string | null
  tone: 'on' | 'part' | 'off'
  title?: string
}

/* The list cell — what protects this app, without opening anything.

   A count alone would be the wrong reading. Three policies of which one is
   switched off is not "3 policies" in any sense an administrator cares about,
   and a row that says 3 while two decide is the list quietly overstating its
   own coverage. So the count and the shortfall are two separate strings, and
   the tone carries whether anything is outstanding — which is the same
   argument the authentication-methods summary makes for its own collapsed
   rows. */
export function summarise(appId: string, policies: Policy[]): AppSummary {
  const own = policiesForApp(appId, policies)
  const decides = own.filter(decidesFor)

  if (own.length === 0) {
    return {
      own: 0,
      decides: 0,
      /* Not "Not protected": the tenant default still decides these sign-ins. */
      label: 'Default only',
      tag: null,
      tone: 'off',
      title: 'No policy of its own. Sign-ins use the default policy.',
    }
  }

  const label = `${own.length} polic${own.length === 1 ? 'y' : 'ies'}`
  const behind = own.length - decides.length

  if (decides.length === 0) {
    /* One policy: its own status word, the one the policies list shows. "Off"
       is not a status, and a draft was never on. */
    const only = own[0]
    const word = only.status === 'draft' ? 'Draft' : only.status === 'inactive' ? 'Inactive' : 'No rule on'
    return {
      own: own.length,
      decides: 0,
      label,
      tag: own.length === 1 ? word : 'None deciding',
      tone: 'off',
      title: own.length === 1 ? whyNotDeciding(only) ?? undefined : 'None of these policies decides sign-ins.',
    }
  }

  return {
    own: own.length,
    decides: decides.length,
    label,
    tag: behind > 0 ? `${behind} not deciding` : null,
    tone: behind > 0 ? 'part' : 'on',
  }
}
