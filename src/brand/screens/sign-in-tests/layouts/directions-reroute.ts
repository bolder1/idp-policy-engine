import { useMemo } from 'react'

import { DECISION_WORDS } from '../../../decision-words'
import { useBrand, useNameLookup } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { resolveSignIn } from '../../tenant-resolver'
import { rowsRead, type RowsRead } from '../../testing/rows-read'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import type { AltRoute } from './directions-map-parts'
import { toneOf } from './directions-model'

/* -----------------------------------------------------------------------------
   Reroute (DirectionsLayout.tsx): the chips under the directions, each a
   what-if on a fact the application's rules read — another network, another
   device, another risk score — or the person as one of their groups alone.
   The engine runs again on each, exactly as the page runs it (TryJourney.tsx),
   here only: the page's sign-in is never changed. Computed once the run has
   landed; memoised.
   -------------------------------------------------------------------------- */

export interface Reroute {
  alt: AltRoute
  /** The what-if's own run; null for a group row (the run's own comparison). */
  plan: EngineRun | null
}

const wordsOf = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  return o.status === 'depends' ? 'Depends' : 'No policy decides'
}

function sourceOf(plan: EngineRun, base: EngineRun): string {
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const rule = land ? (land.index === null ? 'Nothing else matched' : `rule ${land.index + 1}`) : ''
  if (plan.decider && plan.decider.id !== base.decider?.id) return `${plan.decider.name}${rule ? ` · ${rule}` : ''}`
  return rule
}

export function useReroutes(form: SignInForm, rows: RowsRead, base: EngineRun, on: boolean): Reroute[] {
  const { policies, zones, fingerprints, users, apps } = useBrand()
  const env = useSimEnv()
  const names = useNameLookup()
  return useMemo(() => {
    if (!on || base.empty || !form.personId || !form.appId) return []
    const variants: { key: string; label: string; form: SignInForm }[] = []
    if (rows.rows.has('place')) {
      const home = form.origin === 'home'
      variants.push({ key: home ? 'from:office' : 'from:home', label: home ? 'From Office network' : 'From Home broadband', form: { ...form, ...originPatch(home ? 'office' : 'home'), place: { kind: 'from-address' } } })
    }
    if (rows.rows.has('device')) {
      const android = form.device.kind === 'preset' && form.device.id === 'android-12'
      variants.push({
        key: android ? 'device:win11' : 'device:android',
        label: android ? 'On a Windows 11 laptop' : 'On Android 12',
        form: { ...form, device: { kind: 'preset', id: android ? 'win11-registered' : 'android-12' } },
      })
    }
    if (rows.rows.has('risk')) {
      const high = form.risk === '86'
      variants.push({ key: high ? 'risk:12' : 'risk:86', label: high ? 'Risk score 12' : 'Risk score 86', form: { ...form, risk: high ? '12' : '86' } })
    }
    const out: Reroute[] = []
    const index = (id: string | null | undefined) => (id ? base.policies.findIndex((p) => p.policyId === id) : -1)
    for (const v of variants) {
      try {
        const vr = rowsRead(policies, null, v.form.appId, { zones, fingerprints })
        const facts = factsOf(v.form, zones).facts
        const res = resolveSignIn(policies, facts, env)
        const plan = engineRun({ res, policies, form: v.form, facts, env, ctx: { people: users, apps, zones, rows: vr }, names, intro: 'none' })
        const same = plan.decider?.id === base.decider?.id
        out.push({
          plan,
          alt: {
            key: v.key,
            label: v.label,
            decider: index(plan.decider?.id),
            landing: same ? plan.landing : null,
            tone: toneOf(plan),
            words: wordsOf(plan),
            source: sourceOf(plan, base),
            same: same && plan.landing === base.landing && wordsOf(plan) === wordsOf(base),
          },
        })
      } catch {
        /* A variation the engine can't run is left out. */
      }
    }
    /* The person as each of their groups alone, where it would go another way. */
    for (const r of base.asEachGroup?.rows ?? []) {
      if (r.kind !== 'group' || r.same || !r.groups[0]) continue
      const g = r.groups[0]
      const di = index(r.policyId)
      const same = r.policyId === base.decider?.id
      const landing = same ? base.rules.findIndex((x) => (r.ruleNumber === null ? x.index === null : x.index === r.ruleNumber - 1)) : -1
      const tone = r.status === 'decided' && r.decision ? (r.decision === 'deny' ? 'bad' : 'ok') : r.status === 'depends' ? 'warn' : 'quiet'
      const rule = r.ruleNumber !== null ? `rule ${r.ruleNumber}` : r.ruleName
      out.push({
        plan: null,
        alt: {
          key: `group:${g.id}`,
          label: `As ${g.name} only`,
          decider: di,
          landing: landing >= 0 ? landing : null,
          tone,
          words: r.status === 'decided' && r.decision ? DECISION_WORDS[r.decision] : r.words,
          source: [r.policyName, rule].filter(Boolean).join(' · '),
          groupId: g.id,
          same: false,
        },
      })
    }
    return out
  }, [on, form, rows, base, policies, zones, fingerprints, users, apps, env, names])
}
