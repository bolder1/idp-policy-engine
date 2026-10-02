import { useMemo, useRef } from 'react'

import { useBrand, useNameLookup } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { resolveSignIn } from '../../tenant-resolver'
import type { DevicePresetId } from '../../testing/device-presets'
import { rowsRead } from '../../testing/rows-read'
import { screensOf, type SignInScreens } from '../../testing/screens-of'
import { factsOf, originPatch, type OriginPresetId, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   The stream re-routed (StreamLayout.tsx): drag the source's handle onto
   another network or device — or press the chip — and the engine runs again
   on that variation, exactly as the page runs it (TryJourney.tsx), here only:
   the page's sign-in never changes. Memoised, a dozen kept, nothing computed
   until the run has landed and a chip is chosen.
   -------------------------------------------------------------------------- */

export type DeviceChoice = DevicePresetId | 'none'
export type RiskChoice = '12' | '55' | '86'

export interface Flips {
  from?: OriginPresetId
  device?: DeviceChoice
  risk?: RiskChoice
}

export const FROM_CHIPS: readonly { id: OriginPresetId; label: string }[] = [
  { id: 'office', label: 'Office network' },
  { id: 'branch', label: 'Branch office' },
  { id: 'home', label: 'Home broadband' },
  { id: 'tor', label: 'Tor exit' },
]
export const DEVICE_CHIPS: readonly { id: DeviceChoice; label: string }[] = [
  { id: 'win11-registered', label: 'Win 11 · registered' },
  { id: 'win11-unregistered', label: 'Win 11 · not registered' },
  { id: 'android-12', label: 'Android 12' },
  { id: 'iphone', label: 'iPhone' },
  { id: 'none', label: 'Not stated' },
]
export const RISK_CHIPS: readonly { id: RiskChoice; label: string }[] = [
  { id: '12', label: 'Risk 12' },
  { id: '55', label: 'Risk 55' },
  { id: '86', label: 'Risk 86' },
]

export const flipsKey = (f: Flips): string => `${f.from ?? ''}|${f.device ?? ''}|${f.risk ?? ''}`
export const anyFlip = (f: Flips): boolean => f.from !== undefined || f.device !== undefined || f.risk !== undefined

/** What the sign-in itself states, in the chips' terms (null: something the chips do not hold). */
export function ownOf(form: SignInForm): Flips {
  return {
    from: form.origin ?? undefined,
    device: form.device.kind === 'none' ? 'none' : form.device.kind === 'preset' ? form.device.id : undefined,
    risk: (['12', '55', '86'] as const).find((r) => r === form.risk),
  }
}

export function formWith(form: SignInForm, f: Flips): SignInForm {
  let next: SignInForm = { ...form }
  if (f.from) next = { ...next, ...originPatch(f.from), place: { kind: 'from-address' } }
  if (f.device) next = { ...next, device: f.device === 'none' ? { kind: 'none' } : { kind: 'preset', id: f.device } }
  if (f.risk) next = { ...next, risk: f.risk }
  return next
}

/** A chip's words, for the what-if's mark. */
export function flipWords(f: Flips): string {
  const parts: string[] = []
  if (f.from) parts.push(FROM_CHIPS.find((c) => c.id === f.from)?.label ?? f.from)
  if (f.device) parts.push(DEVICE_CHIPS.find((c) => c.id === f.device)?.label ?? f.device)
  if (f.risk) parts.push(`risk ${f.risk}`)
  return parts.join(' · ')
}

export interface WhatIf {
  key: string
  form: SignInForm
  plan: EngineRun
  screens: SignInScreens[]
}

/** The what-if's run, or null when nothing is chosen (or it is not open yet). */
export function useWhatIf(form: SignInForm, flips: Flips, enabled: boolean): WhatIf | null {
  const { policies, zones, fingerprints, users, apps, methods, defaultMethodId } = useBrand()
  const env = useSimEnv()
  const names = useNameLookup()
  const cache = useRef<{ base: unknown[]; runs: Map<string, WhatIf> }>({ base: [], runs: new Map() })
  const key = flipsKey(flips)
  const on = enabled && anyFlip(flips)
  return useMemo(() => {
    if (!on) return null
    const base = [form, policies, zones, fingerprints, users, apps, methods, env]
    const c = cache.current
    if (c.base.length !== base.length || c.base.some((v, i) => v !== base[i])) cache.current = { base, runs: new Map() }
    const hit = cache.current.runs.get(key)
    if (hit) return hit
    try {
      const vf = formWith(form, flips)
      const rows = rowsRead(policies, null, vf.appId, { zones, fingerprints })
      const facts = factsOf(vf, zones).facts
      const res = resolveSignIn(policies, facts, env)
      const plan = engineRun({ res, policies, form: vf, facts, env, ctx: { people: users, apps, zones, rows }, names, intro: 'none' })
      const screens = screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === vf.personId) ?? null })
      const w: WhatIf = { key, form: vf, plan, screens }
      const runs = cache.current.runs
      if (runs.size >= 12) runs.delete(runs.keys().next().value as string)
      runs.set(key, w)
      return w
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the flips' key
  }, [on, key, form, policies, zones, fingerprints, users, apps, methods, defaultMethodId, env, names])
}
