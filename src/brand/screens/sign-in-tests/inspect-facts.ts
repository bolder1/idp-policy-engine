import { DENY_REASON_WORD, denyReasonOfRule } from '../testing/deny-reason'
import { DECISION_WORDS } from '../../decision-words'
import { audienceSummary, fallbackRule, memberGroupIds, rangeText, type App, type Group, type Policy, type User, type Zone } from '../../data'
import type { FingerprintProfile } from '../../fingerprint'
import { FAILURE_LABEL, type Hook } from '../../hooks'
import { RISK_SIGNALS, type RiskProfile } from '../../risk-signals'
import { STATUS_WORD } from '../board/read-as-text'
import type { PolicyLine } from '../predicate-prose'
import type { InspectTarget, PeekTarget } from './inspect-model'

/* -----------------------------------------------------------------------------
   The inspector's plain facts, as label / value rows, for any target that is not
   a rule: the peeks' bodies, a policy's summary, and what Compare sets side by
   side. Also the draft diff: a policy's live sentences against its draft's.
   PURE: the library comes in as `Library`.
   -------------------------------------------------------------------------- */

export type Fact = [label: string, value: string]

export interface Library {
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
  hooks: readonly Hook[]
  riskProfiles: readonly RiskProfile[]
  activeRiskProfileId: string
  users: readonly User[]
  groups: readonly Group[]
  apps: readonly App[]
  policies: readonly Policy[]
}

export function zoneFacts(z: Zone): Fact[] {
  const l = z.location
  return [
    ['Kind', z.kind === 'allowed' ? 'Allowed' : z.kind === 'blocked' ? 'Blocked' : 'Custom'],
    ['Addresses', z.ip.join(', ')],
    ['Networks (ASN)', z.asn.join(', ')],
    ['Countries', l.countries.join(', ')],
    ['States', l.states.join(', ')],
    ['Cities', l.cities.join(', ')],
    ['Ranges', l.ranges.map(rangeText).join(' · ')],
  ]
}

/** A rule said as one sentence (predicate-prose.ts `policySentences`), for its Compare row; the panel hands it in. */
export type SayRule = (policy: Policy, ruleId: string | null) => string

/** The rows of a policy, a rule or a peek, or null when it is no longer there. */
export function factsOf(t: InspectTarget, lib: Library, say?: SayRule): Fact[] | null {
  if (t.kind === 'rule') {
    const p = lib.policies.find((x) => x.id === t.policyId)
    if (!p) return null
    const i = t.ruleId === null ? -1 : p.rules.findIndex((r) => r.id === t.ruleId)
    if (t.ruleId !== null && i < 0) return null
    const rule = t.ruleId === null ? (p.fallback ?? fallbackRule()) : p.rules[i]
    return [
      ['Policy', p.name],
      ['Position', t.ruleId === null ? 'Last row' : `Rule ${i + 1} of ${p.rules.length}`],
      ['Then', DECISION_WORDS[rule.decision]],
      ['Says', say ? say(p, t.ruleId) : ''],
      ['Refuses for', rule.decision === 'deny' ? DENY_REASON_WORD[denyReasonOfRule(rule)] : ''],
      ['Switched on', rule.enabled === false ? 'No' : 'Yes'],
    ]
  }
  if (t.kind === 'policy') {
    const p = lib.policies.find((x) => x.id === t.policyId)
    if (!p) return null
    return [
      ['Status', STATUS_WORD[p.status]],
      ['Applications', p.isSystem ? 'Every application' : p.appIds.map((id) => lib.apps.find((a) => a.id === id)?.name ?? 'A deleted application').join(', ')],
      ['Audience', p.isSystem ? 'Everyone' : audienceSummary(p.audience, [...lib.groups], [...lib.users]).label || 'Nobody'],
      ['Rules', String(p.rules.length)],
    ]
  }
  return peekFacts(t, lib)
}

function peekFacts(t: PeekTarget, lib: Library): Fact[] | null {
  switch (t.kind) {
    case 'zone': {
      const z = lib.zones.find((x) => x.id === t.id)
      return z ? zoneFacts(z) : null
    }
    case 'device': {
      const p = lib.fingerprints.find((x) => x.id === t.id)
      return p ? [['Works on', p.mode === 'os' ? 'Operating system' : 'Browser or app'], ['Signals', `${p.enabled.length} switched on`], ['Devices per person', p.maxDevices === null ? 'Set by a roster' : String(p.maxDevices)], ['Mobile devices', p.restrictMobile ? 'Refused' : 'Allowed']] : null
    }
    case 'hook': {
      const h = lib.hooks.find((x) => x.id === t.id)
      return h ? [['What it is for', h.description ?? ''], ['Kind', h.mode === 'sync' ? 'Asked on each sign-in' : 'Synced attribute'], ['Address', `${h.method} ${h.url}`], ['Waits', `${h.timeoutMs} ms`], ['Reads', h.responsePath], ['If it does not answer', FAILURE_LABEL[h.onFailure]]] : null
    }
    case 'person': {
      const u = lib.users.find((x) => x.id === t.id)
      return u ? [['Email', u.email], ['Role', u.role], ['Type', u.userType], ['Groups', memberGroupIds(u).map((g) => lib.groups.find((x) => x.id === g)?.name ?? 'A deleted group').join(', ')]] : null
    }
    case 'app': {
      const a = lib.apps.find((x) => x.id === t.id)
      return a ? [['Protocol', a.protocol], ['Type', a.type], ['Last updated', a.lastUpdated]] : null
    }
    case 'risk': {
      const r = lib.riskProfiles.find((x) => x.id === t.id)
      if (!r) return null
      const retuned = Object.keys(r.tiers).length
      return [['Signals on', `${RISK_SIGNALS.length - r.off.length} of ${RISK_SIGNALS.length}`], ['Priorities changed', retuned ? String(retuned) : 'None, the shipped priorities'], ['In use', r.id === lib.activeRiskProfileId ? 'Yes' : 'No']]
    }
  }
}

/** Two targets side by side: every label either has, each with whether the two agree. */
export function compareFacts(a: Fact[], b: Fact[]): { label: string; a: string; b: string; same: boolean }[] {
  const labels = [...a.map(([k]) => k), ...b.map(([k]) => k).filter((k) => !a.some(([x]) => x === k))]
  return labels.map((label) => {
    const x = a.find(([k]) => k === label)?.[1] ?? ''
    const y = b.find(([k]) => k === label)?.[1] ?? ''
    return { label, a: x, b: y, same: x === y }
  })
}

/** What the draft changes in a published policy, in sentences: lines only the draft has, lines only live has. */
export function draftDiff(live: readonly PolicyLine[], draft: readonly PolicyLine[]): { added: string[]; removed: string[] } {
  const said = (l: PolicyLine) => l.text
  const was = new Set(live.map(said))
  const is = new Set(draft.map(said))
  return { added: draft.filter((l) => !was.has(said(l))).map(said), removed: live.filter((l) => !is.has(said(l))).map(said) }
}
