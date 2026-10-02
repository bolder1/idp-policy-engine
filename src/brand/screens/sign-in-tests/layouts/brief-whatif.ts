import { useMemo } from 'react'

import { DECISION_WORDS } from '../../../decision-words'
import { useBrand, useNameLookup } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { resolveSignIn } from '../../tenant-resolver'
import { devicePreset, type DevicePresetId } from '../../testing/device-presets'
import { rowsRead, type RowsRead } from '../../testing/rows-read'
import { screensOf, type SignInScreens } from '../../testing/screens-of'
import { factsOf, ORIGIN_PRESETS, originPatch, type OriginPresetId, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   "What would change it?" (BriefLayout.tsx): the engine run again on each
   one-fact variation of the sign-in the application's rules read — another
   network, another device, another risk score — exactly as the page runs it
   (TryJourney.tsx), here only: the page's sign-in is never changed. Asked
   only once the run has landed and the question is opened; memoised.
   -------------------------------------------------------------------------- */

export interface WhatIf {
  key: string
  /** "From Home broadband", "On an Android 12 phone", "No device stated", "Risk score 55". */
  label: string
  form: SignInForm
  plan: EngineRun
  screens: SignInScreens[]
  /** "Allow with 2FA", "Depends". */
  words: string
  /** "rule 2", "Nothing else matched", or the policy when another decides. */
  source: string
  /** The answer is not today's. */
  changed: boolean
}

const DEVICES: readonly DevicePresetId[] = ['win11-registered', 'win11-unregistered', 'win10', 'android-12', 'iphone']
const RISKS = ['12', '55', '86'] as const

export const answerOf = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  if (o.status === 'depends') return o.view.needs.length > 0 ? `Depends on the ${o.view.needs.join(' and the ').toLowerCase()}` : 'Depends'
  return 'No policy decides'
}

function sourceOf(plan: EngineRun, base: EngineRun): string {
  if (plan.outcome.status === 'depends') return plan.decider && plan.decider.id !== base.decider?.id ? plan.decider.name : ''
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const rule = land ? (land.index === null ? 'Nothing else matched' : `rule ${land.index + 1}`) : ''
  if (plan.decider && plan.decider.id !== base.decider?.id) return `${plan.decider.name}${rule ? ` · ${rule}` : ''}`
  return rule
}

/** The variations, once `on`: changed ones first. Empty while off. */
export function useWhatIfs(form: SignInForm, rows: RowsRead, base: EngineRun, on: boolean): WhatIf[] {
  const { policies, zones, fingerprints, users, apps, methods, defaultMethodId } = useBrand()
  const env = useSimEnv()
  const names = useNameLookup()
  return useMemo(() => {
    if (!on || !form.personId || !form.appId) return []
    const variants: { key: string; label: string; form: SignInForm }[] = []
    if (rows.rows.has('place')) {
      for (const o of ORIGIN_PRESETS) {
        if (o.id === form.origin) continue
        variants.push({ key: `from:${o.id}`, label: `From ${o.label}`, form: { ...form, ...originPatch(o.id as OriginPresetId), place: { kind: 'from-address' } } })
      }
    }
    if (rows.rows.has('device')) {
      const own = form.device.kind === 'preset' ? form.device.id : form.device.kind
      for (const id of DEVICES) {
        if (id === own) continue
        variants.push({ key: `device:${id}`, label: `On ${devicePreset(id).label}`, form: { ...form, device: { kind: 'preset', id } } })
      }
      if (own !== 'none') variants.push({ key: 'device:none', label: 'No device stated', form: { ...form, device: { kind: 'none' } } })
    }
    if (rows.rows.has('risk')) {
      for (const r of RISKS) if (r !== form.risk) variants.push({ key: `risk:${r}`, label: `Risk score ${r}`, form: { ...form, risk: r } })
    }
    const baseWords = answerOf(base)
    const baseSource = sourceOf(base, base)
    const out: WhatIf[] = []
    for (const v of variants) {
      try {
        const vr = rowsRead(policies, null, v.form.appId, { zones, fingerprints })
        const facts = factsOf(v.form, zones).facts
        const res = resolveSignIn(policies, facts, env)
        const plan = engineRun({ res, policies, form: v.form, facts, env, ctx: { people: users, apps, zones, rows: vr }, names, intro: 'none' })
        const screens = screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === v.form.personId) ?? null })
        const words = answerOf(plan)
        const source = sourceOf(plan, base)
        out.push({ ...v, plan, screens, words, source, changed: words !== baseWords || source !== baseSource })
      } catch {
        /* A variation the engine can't run is left out. */
      }
    }
    return [...out.filter((w) => w.changed), ...out.filter((w) => !w.changed)]
  }, [on, form, rows, base, policies, zones, fingerprints, users, apps, methods, defaultMethodId, env, names])
}
