import { useMemo, useRef } from 'react'

import { useBrand, useNameLookup } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { resolveSignIn } from '../../tenant-resolver'
import type { DevicePresetId } from '../../testing/device-presets'
import { rowsRead } from '../../testing/rows-read'
import { screensOf, type SignInScreens } from '../../testing/screens-of'
import { factsOf, originPatch, type OriginPresetId, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import type { InputId } from './synapse-model'

/* -----------------------------------------------------------------------------
   Flip a fact (SynapseLayout.tsx): the engine run again on a variation of the
   sign-in, exactly as the page runs it (TryJourney.tsx), but here only — the
   page's sign-in is never changed. A network, a device or a risk score from
   a short list of real alternatives; each variation memoised, at most a dozen
   kept, and none computed until the run has landed and a fact is flipped.
   -------------------------------------------------------------------------- */

export type DeviceChoice = DevicePresetId | 'none'
export type RiskChoice = '12' | '55' | '86'

export interface Flips {
  from?: OriginPresetId
  device?: DeviceChoice
  risk?: RiskChoice
}

const FROM_CYCLE: readonly OriginPresetId[] = ['office', 'home', 'branch', 'tor']
const DEVICE_CYCLE: readonly DeviceChoice[] = ['win11-registered', 'win11-unregistered', 'android-12', 'none']
const RISK_CYCLE: readonly RiskChoice[] = ['12', '55', '86']

export const flipsKey = (f: Flips): string => `${f.from ?? ''}|${f.device ?? ''}|${f.risk ?? ''}`
export const anyFlip = (f: Flips): boolean => f.from !== undefined || f.device !== undefined || f.risk !== undefined

/** What the sign-in itself states for a fact, in the cycle's terms (null: something the cycle does not hold). */
function ownOf(id: InputId, form: SignInForm): string | null {
  if (id === 'from') return form.origin
  if (id === 'device') return form.device.kind === 'none' ? 'none' : form.device.kind === 'preset' ? form.device.id : null
  if (id === 'risk') return (RISK_CYCLE as readonly string[]).includes(form.risk) ? form.risk : null
  return null
}

export const canFlip = (id: InputId): boolean => id === 'from' || id === 'device' || id === 'risk'

/* The next value of a fact, round its cycle; back at the sign-in's own value, the flip goes. */
export function nextFlips(f: Flips, id: InputId, form: SignInForm): Flips {
  const own = ownOf(id, form)
  const cycle: readonly string[] = id === 'from' ? FROM_CYCLE : id === 'device' ? DEVICE_CYCLE : RISK_CYCLE
  const cur = (id === 'from' ? f.from : id === 'device' ? f.device : id === 'risk' ? f.risk : undefined) ?? own
  const at = cur === null ? -1 : cycle.indexOf(cur)
  const next = cycle[(at + 1) % cycle.length]
  const out: Flips = { ...f }
  const set = next === own ? undefined : next
  if (id === 'from') out.from = set as OriginPresetId | undefined
  if (id === 'device') out.device = set as DeviceChoice | undefined
  if (id === 'risk') out.risk = set as RiskChoice | undefined
  return out
}

export function formWith(form: SignInForm, f: Flips): SignInForm {
  let next: SignInForm = { ...form }
  /* The network only: a place the sign-in states stays stated (looked up from the address, it follows it). */
  if (f.from) next = { ...next, ...originPatch(f.from) }
  if (f.device) next = { ...next, device: f.device === 'none' ? { kind: 'none' } : { kind: 'preset', id: f.device } }
  if (f.risk) next = { ...next, risk: f.risk }
  return next
}

export interface WhatIf {
  key: string
  form: SignInForm
  plan: EngineRun
  screens: SignInScreens[]
}

/** The what-if's run, or null when nothing is flipped (or flipping is not open here). */
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
