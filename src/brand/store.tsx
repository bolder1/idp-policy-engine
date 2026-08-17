import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  apps as seedApps,
  devicePostures as seedPostures,
  groups as seedGroups,
  methodSets as seedMethodSets,
  policies as seedPolicies,
  templates as seedTemplates,
  zones as seedZones,
  type AccessDecision,
  type App,
  type DevicePosture,
  type Group,
  type MethodSet,
  type Policy,
  type Template,
  type Zone,
} from './data'

export type BrandScreen =
  | { name: 'policies' }
  /* `open` lets a caller hand off INTO a surface rather than merely near it.
     The policy list can say "this one has four holes" and land you in the
     gauntlet for that policy, instead of in a builder where you still have to
     find the button. */
  | { name: 'builder'; policyId: string; open?: 'gauntlet' | 'impact' }
  | { name: 'templates' }
  | { name: 'zones' }
  | { name: 'posture' }
  | { name: 'methods' }
  | { name: 'create' }

interface BrandStore {
  apps: App[]
  groups: Group[]
  zones: Zone[]
  postures: DevicePosture[]
  methodSets: MethodSet[]
  templates: Template[]
  policies: Policy[]

  screen: BrandScreen
  go: (s: BrandScreen) => void

  appById: (id: string) => App
  groupById: (id: string) => Group
  zoneById: (id: string) => Zone | undefined
  postureById: (id: string) => DevicePosture | undefined
  policyById: (id: string) => Policy | undefined

  /* Gauntlet expectations the tenant has overruled, per policy.

     Per policy rather than tenant-wide on purpose: "an executive from a Tor
     exit should be blocked" is a judgement about the apps a policy governs, and
     the same scenario can legitimately warrant different treatment on a finance
     system and on a status page. Tenant-wide would force one answer for both.

     Held in the store rather than in the dialog because the toolbar pip reads
     the same grade — a dialog-local override would put a different letter on
     the button than inside the panel it opens. */
  gauntletOverrides: Record<string, Record<string, AccessDecision>>
  setGauntletOverride: (policyId: string, cardId: string, want: AccessDecision | null) => void

  /* Method sets are edited in place like zones, so they need the same
     add/update/remove the store already gives those. Until now they were read
     from the seed and never written, which is why the Sets tab could edit a
     set's contents and had nowhere to put the result. */
  addMethodSet: (s: MethodSet) => void
  updateMethodSet: (s: MethodSet) => void
  removeMethodSet: (id: string) => void

  savePolicy: (p: Policy) => void
  addPolicy: (p: Policy) => void
  addZone: (z: Zone) => void
  updateZone: (z: Zone) => void
  removeZone: (id: string) => void
  deletePolicy: (id: string) => void
  duplicatePolicy: (id: string) => void

  toast: string | null
  showToast: (m: string) => void
}

const Ctx = createContext<BrandStore | null>(null)

export function BrandProvider({ children }: { children: ReactNode }) {
  const [policies, setPolicies] = useState<Policy[]>(seedPolicies)
  /* Zones are edited in place now that they carry two sections, so they need
     the same draft/commit treatment policies already had. */
  const [zones, setZones] = useState<Zone[]>(seedZones)
  const [screen, setScreen] = useState<BrandScreen>({ name: 'policies' })
  const [toast, setToast] = useState<string | null>(null)
  const [gauntletOverrides, setOverrides] = useState<Record<string, Record<string, AccessDecision>>>({})
  const [methodSets, setMethodSets] = useState<MethodSet[]>(seedMethodSets)

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2800)
  }, [])

  const value = useMemo<BrandStore>(
    () => ({
      apps: seedApps,
      groups: seedGroups,
      zones,
      postures: seedPostures,
      methodSets,
      templates: seedTemplates,
      policies,

      screen,
      go: setScreen,

      appById: (id) => seedApps.find((a) => a.id === id) ?? seedApps[0],
      groupById: (id) => seedGroups.find((g) => g.id === id) ?? seedGroups[0],
      // Reads live state, not the seed — otherwise a deleted or renamed zone
      // keeps resolving everywhere it is referenced.
      zoneById: (id) => zones.find((z) => z.id === id),
      postureById: (id) => seedPostures.find((p) => p.id === id),
      policyById: (id) => policies.find((p) => p.id === id),

      gauntletOverrides,
      /* Passing null clears the override rather than storing the card's own
         default, so "same as shipped" and "explicitly agreed with" are the same
         state. Two ways to spell one thing is how a count of overrides ends up
         lying about how much the tenant has actually decided. */
      setGauntletOverride: (policyId, cardId, want) =>
        setOverrides((all) => {
          const forPolicy = { ...(all[policyId] ?? {}) }
          if (want === null) delete forPolicy[cardId]
          else forPolicy[cardId] = want
          return { ...all, [policyId]: forPolicy }
        }),

      addMethodSet: (m) => setMethodSets((all) => [...all, m]),
      updateMethodSet: (m) => setMethodSets((all) => all.map((x) => (x.id === m.id ? m : x))),
      /* Removing a set does not unlink the rules naming it — the usage count in
         the editor is the warning, and a rule pointing at a set that no longer
         exists resolves to nothing, which the policy linter already reports. */
      removeMethodSet: (id) => setMethodSets((all) => all.filter((x) => x.id !== id)),

      savePolicy: (p) =>
        setPolicies((all) => all.map((x) => (x.id === p.id ? { ...p, lastModified: 'Just now', modifiedBy: 'You' } : x))),

      addPolicy: (p) => setPolicies((all) => [p, ...all]),
      addZone: (z) => setZones((all) => [...all, z]),
      updateZone: (z) => setZones((all) => all.map((x) => (x.id === z.id ? z : x))),
      /* A deleted zone is not unlinked from the rules that name it — the
         dependency count in the editor is what warns you before you get here. */
      removeZone: (id) => setZones((all) => all.filter((z) => z.id !== id)),

      deletePolicy: (id) => setPolicies((all) => all.filter((p) => p.id !== id)),

      duplicatePolicy: (id) =>
        setPolicies((all) => {
          const src = all.find((p) => p.id === id)
          if (!src) return all
          const copy: Policy = {
            ...src,
            id: `${src.id}-copy-${all.length}`,
            name: `${src.name} (copy)`,
            status: 'inactive',
            isSystem: false,
            lastModified: 'Just now',
            modifiedBy: 'You',
          }
          return [copy, ...all]
        }),

      toast,
      showToast,
    }),
    [policies, zones, methodSets, screen, toast, showToast, gauntletOverrides],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBrand(): BrandStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useBrand must be used inside BrandProvider')
  return s
}
