import { useCallback, useMemo } from 'react'

import type { AccessDecision, App, Policy, User, Zone } from '../../../../data'
import { DECISION_WORDS } from '../../../../decision-words'
import type { FingerprintProfile } from '../../../../fingerprint'
import type { AuthMethod } from '../../../../methods'
import { useBrand, useNameLookup } from '../../../../store'
import { useSimEnv } from '../../../sim-env'
import type { SimEnv } from '../../../simulate'
import { resolveSignIn } from '../../../tenant-resolver'
import { devicePreset, type DevicePresetId } from '../../../testing/device-presets'
import { rowsRead, type RowsRead } from '../../../testing/rows-read'
import { screensOf, type SignInScreens } from '../../../testing/screens-of'
import { factsOf, ORIGIN_PRESETS, originPatch, type FormField, type OriginPresetId, type SignInForm } from '../../../testing/sign-in-form'
import type { NameLookup } from '../../../testing/trace-pills'
import { engineRun, type EngineRun } from '../../engine-run'
import type { Tone } from './intents'

/* -----------------------------------------------------------------------------
   PREVIEWS (assistant/, shared by Focus, Brief and Jarvis): the engine run
   again on a changed sign-in, exactly as the page runs it (TryJourney.tsx:
   engineRun over factsOf → resolveSignIn), HERE ONLY — the page's sign-in is
   never changed and nothing starts a run. A preview is what "What if she's at
   home?" answers from; its "Run with Home broadband" press is what makes it
   real (RunLayoutProps.onRunWith).

   API (the dock computes these; a view never needs to):

     previewOf(form, patch, deps, base, meta?) → WhatIf | null   PURE
       One changed sign-in: `form` with `patch`, run. Null when it cannot run
       (no person or application, or the engine refuses).
     variationsOf(form, rows) → Variation[]                     PURE
       The one-fact changes worth asking, from the facts the application's
       rules read: each other origin, five devices and no device, risk 12 / 55 / 86.
     rankWhatIfs(list) → WhatIf[]                               PURE
       Changed answers first; among them a definite answer before a Depends,
       the same deciding policy before another, the nearest rule first.
     useWhatIfs(run, on) → { list, preview }                    HOOK
       Every variation run once `on` (the run has landed), ranked — and
       `preview(patch, field)` for any other change (memoised per patch).

   Bento keeps its own copy (bento-whatif.ts); Brief's (brief-whatif.ts) goes
   once Brief takes the dock.
   -------------------------------------------------------------------------- */

/** One change worth asking about: "From Home broadband", run with "Home broadband". */
export interface Variation {
  key: string
  /** "From Home broadband", "On Android 12 phone", "No device stated", "Risk score 55". */
  label: string
  /** The words after "Run with": "Home broadband", "Android 12 phone", "no device", "risk 55". */
  value: string
  patch: Partial<SignInForm>
  field: FormField
}

export interface WhatIf extends Variation {
  form: SignInForm
  plan: EngineRun
  screens: SignInScreens[]
  /** "Allow with 2FA", "Deny", "Depends", "No policy decides". */
  words: string
  tone: Tone
  decision: AccessDecision | null
  /** "rule 2", "Nothing else matched", or "<policy> · rule 1" when another policy decides. */
  source: string
  /** The answer is not today's (the words or where they come from). */
  changed: boolean
}

/** What a preview runs against: the tenant, as the page has it. */
export interface WhatIfDeps {
  policies: readonly Policy[]
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
  users: readonly User[]
  apps: readonly App[]
  methods: readonly AuthMethod[]
  defaultMethodId: string | null | undefined
  env: SimEnv
  names?: NameLookup
}

const DEVICES: readonly DevicePresetId[] = ['win11-registered', 'win11-unregistered', 'win10', 'android-12', 'iphone']
const RISKS = ['12', '55', '86'] as const

/** "Allow with 2FA", "Deny", "Depends", "No policy decides": a plan's answer in three decision words. */
export function wordsOfPlan(plan: EngineRun): string {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  return o.status === 'depends' ? 'Depends' : 'No policy decides'
}

export function toneOfPlan(plan: EngineRun): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/** Where a plan's answer comes from, against today's: "rule 2", or the other policy with its rule. */
export function sourceOfPlan(plan: EngineRun, base: EngineRun | null): string {
  const other = plan.decider && (!base || plan.decider.id !== base.decider?.id)
  if (plan.outcome.status === 'depends') return other && plan.decider ? plan.decider.name : ''
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const rule = land ? (land.index === null ? 'Nothing else matched' : `rule ${land.index + 1}`) : ''
  if (plan.decider && base && plan.decider.id !== base.decider?.id) return `${plan.decider.name}${rule ? ` · ${rule}` : ''}`
  if (plan.decider && !base) return `${plan.decider.name}${rule ? ` · ${rule}` : ''}`
  return rule
}

/** The one-fact changes worth asking about, from the facts the application's rules read (never today's own value). */
export function variationsOf(form: SignInForm, rows: RowsRead): Variation[] {
  const out: Variation[] = []
  /* Where from: every other origin. The network is always read; a place only matters where a rule reads one.
     A preview changes the ONE field it names. Only where a rule reads the place AND the sign-in states a place of its
     own (not "wherever the address says") does a new network have to bring its place too — a place left behind would
     contradict the network — and then the change is two, so the words say both ("From Home broadband and its place"),
     in the label, the "Run with" press and the answer's list alike. */
  const bringsPlace = rows.rows.has('place') && form.place.kind !== 'from-address'
  for (const o of ORIGIN_PRESETS) {
    if (o.id === form.origin) continue
    const from = originPatch(o.id as OriginPresetId)
    out.push({
      key: `from:${o.id}`,
      label: bringsPlace ? `From ${o.label} and its place` : `From ${o.label}`,
      value: bringsPlace ? `${o.label} and its place` : o.label,
      patch: bringsPlace ? { ...from, place: { kind: 'from-address' } } : from,
      field: 'address',
    })
  }
  if (rows.rows.has('device')) {
    const own = form.device.kind === 'preset' ? form.device.id : form.device.kind
    for (const id of DEVICES) {
      if (id === own) continue
      const label = devicePreset(id).label
      out.push({ key: `device:${id}`, label: `On ${label}`, value: label, patch: { device: { kind: 'preset', id } }, field: 'device' })
    }
    if (own !== 'none') out.push({ key: 'device:none', label: 'No device stated', value: 'no device', patch: { device: { kind: 'none' } }, field: 'device' })
  }
  if (rows.rows.has('risk')) {
    for (const r of RISKS) if (r !== form.risk.trim()) out.push({ key: `risk:${r}`, label: `Risk score ${r}`, value: `risk ${r}`, patch: { risk: r }, field: 'risk' })
  }
  return out
}

/** A key for a patch: the same change asked twice is run once. */
export const patchKey = (patch: Partial<SignInForm>): string => JSON.stringify(Object.keys(patch).sort().map((k) => [k, patch[k as keyof SignInForm]]))

/** One changed sign-in, run here only. Null when it cannot run. */
export function previewOf(form: SignInForm, patch: Partial<SignInForm>, deps: WhatIfDeps, base: EngineRun | null, meta?: Partial<Variation>): WhatIf | null {
  try {
    const next: SignInForm = { ...form, ...patch }
    if (!next.personId || !next.appId) return null
    const { policies, zones, fingerprints, users, apps, methods, defaultMethodId, env, names } = deps
    const rows = rowsRead(policies, null, next.appId, { zones, fingerprints })
    const facts = factsOf(next, zones).facts
    const res = resolveSignIn(policies, facts, env)
    const plan = engineRun({ res, policies, form: next, facts, env, ctx: { people: users, apps, zones, rows }, names, intro: 'none' })
    if (plan.empty) return null
    const screens = screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === next.personId) ?? null })
    const words = wordsOfPlan(plan)
    const source = sourceOfPlan(plan, base)
    const o = plan.outcome
    const decision = o.status === 'decided' ? o.decision : null
    const changed = !base || words !== wordsOfPlan(base) || source !== sourceOfPlan(base, base)
    const field = meta?.field ?? (Object.keys(patch)[0] as FormField | undefined) ?? 'person'
    return {
      key: meta?.key ?? patchKey(patch),
      label: meta?.label ?? '',
      value: meta?.value ?? '',
      patch,
      field,
      form: next,
      plan,
      screens,
      words,
      tone: toneOfPlan(plan),
      decision,
      source,
      changed,
    }
  } catch {
    /* A change the engine can't run is left out. */
    return null
  }
}

/** Changed answers first; a definite answer before a Depends; the same deciding policy before another; the nearest rule first. */
export function rankWhatIfs(list: readonly WhatIf[], base: EngineRun): WhatIf[] {
  const baseLanding = base.landing ?? 0
  const rank = (w: WhatIf) => (w.changed ? (w.tone === 'notice' || w.tone === 'neutral' ? 1 : 0) : 2)
  const other = (w: WhatIf) => (w.plan.decider?.id === base.decider?.id ? 0 : 1)
  const near = (w: WhatIf) => Math.abs((w.plan.landing ?? 99) - baseLanding)
  return list
    .map((w, i) => ({ w, i }))
    .sort((a, b) => rank(a.w) - rank(b.w) || other(a.w) - other(b.w) || near(a.w) - near(b.w) || a.i - b.i)
    .map((x) => x.w)
}

/** The tenant as the page has it, for previews (the view's `policies`, a draft's, win over the store's). */
export function useWhatIfDeps(policies?: readonly Policy[]): WhatIfDeps {
  const brand = useBrand()
  const env = useSimEnv()
  const names = useNameLookup()
  const list = policies ?? brand.policies
  return useMemo(
    () => ({ policies: list, zones: brand.zones, fingerprints: brand.fingerprints, users: brand.users, apps: brand.apps, methods: brand.methods, defaultMethodId: brand.defaultMethodId, env, names }),
    [list, brand.zones, brand.fingerprints, brand.users, brand.apps, brand.methods, brand.defaultMethodId, env, names],
  )
}

export interface WhatIfs {
  /** Every one-fact variation, run and ranked; empty until `on`. */
  list: WhatIf[]
  /** Any change, run here only (memoised per patch). Null when it cannot run. */
  preview: (patch: Partial<SignInForm>, field?: FormField) => WhatIf | null
}

/** The previews of a run: computed once `on` (the run has landed), never changing the page's sign-in. */
export function useWhatIfs(form: SignInForm, rows: RowsRead, base: EngineRun, on: boolean, policies?: readonly Policy[]): WhatIfs {
  const deps = useWhatIfDeps(policies)
  const list = useMemo(() => {
    if (!on || base.empty || !form.personId || !form.appId) return []
    const out: WhatIf[] = []
    for (const v of variationsOf(form, rows)) {
      const w = previewOf(form, v.patch, deps, base, v)
      if (w) out.push(w)
    }
    return rankWhatIfs(out, base)
  }, [on, form, rows, base, deps])
  /* One cache per sign-in on screen: a new run, a new tenant, forget it. */
  const cache = useMemo(() => ({ form, base, deps, map: new Map<string, WhatIf | null>() }), [form, base, deps])
  const preview = useCallback(
    (patch: Partial<SignInForm>, field?: FormField) => {
      const k = patchKey(patch)
      if (cache.map.has(k)) return cache.map.get(k) ?? null
      const known = list.find((w) => patchKey(w.patch) === k)
      const w = known ?? previewOf(cache.form, patch, cache.deps, cache.base, field ? { field } : undefined)
      cache.map.set(k, w)
      return w
    },
    [cache, list],
  )
  return useMemo(() => ({ list, preview }), [list, preview])
}
