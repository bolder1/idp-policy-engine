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
import type { Tone } from './bento-model'

/* -----------------------------------------------------------------------------
   Bento's "What would change it" (BentoLayout.tsx): the engine run again on
   each one-fact variation of the sign-in that the application's rules read —
   another network, another device, another risk score — exactly as the page
   runs it (TryJourney.tsx), here only: the page's sign-in is never changed.
   Asked once the run has landed; memoised on the sign-in.
   -------------------------------------------------------------------------- */

export interface WhatIf {
  key: string
  /** "From Home broadband", "On Android 12 phone", "No device stated", "Risk score 55". */
  label: string
  form: SignInForm
  plan: EngineRun
  screens: SignInScreens[]
  /** "Allow with 2FA", "Depends". */
  words: string
  tone: Tone
  /** "rule 2", or the policy when another decides. */
  source: string
  /** The answer is not today's. */
  changed: boolean
}

const DEVICES: readonly DevicePresetId[] = ['win11-registered', 'win11-unregistered', 'win10', 'android-12', 'iphone']
const RISKS = ['12', '55', '86'] as const

const wordsOf = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  return o.status === 'depends' ? 'Depends' : 'No policy decides'
}
const toneOfPlan = (plan: EngineRun): Tone => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

function sourceOf(plan: EngineRun, base: EngineRun): string {
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const rule = land ? (land.index === null ? 'Nothing else matched' : `rule ${land.index + 1}`) : ''
  if (plan.decider && plan.decider.id !== base.decider?.id) return `${plan.decider.name}${rule ? ` · ${rule}` : ''}`
  return rule
}

/** The variations, once `on`: those that change the answer first. Empty while off. */
export function useWhatIfs(form: SignInForm, rows: RowsRead, base: EngineRun, on: boolean): WhatIf[] {
  const { policies, zones, fingerprints, users, apps, methods, defaultMethodId } = useBrand()
  const env = useSimEnv()
  const names = useNameLookup()
  return useMemo(() => {
    if (!on || !form.personId || !form.appId || base.empty) return []
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
    const baseWords = wordsOf(base)
    const out: WhatIf[] = []
    for (const v of variants) {
      try {
        const vr = rowsRead(policies, null, v.form.appId, { zones, fingerprints })
        const facts = factsOf(v.form, zones).facts
        const res = resolveSignIn(policies, facts, env)
        const plan = engineRun({ res, policies, form: v.form, facts, env, ctx: { people: users, apps, zones, rows: vr }, names, intro: 'none' })
        const screens = screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === v.form.personId) ?? null })
        const words = wordsOf(plan)
        out.push({ ...v, plan, screens, words, tone: toneOfPlan(plan), source: sourceOf(plan, base), changed: words !== baseWords })
      } catch {
        /* A variation the engine can't run is left out. */
      }
    }
    /* The answer changing first; among those, a definite answer before a Depends. */
    const rank = (w: WhatIf) => (w.changed ? (w.tone === 'notice' ? 1 : 0) : 2)
    return out.map((w, i) => ({ w, i })).sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i).map((x) => x.w)
  }, [on, form, rows, base, policies, zones, fingerprints, users, apps, methods, defaultMethodId, env, names])
}
