import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

import {
  templates as seedTemplates,
  type AccessDecision,
  type App,
  type Group,
  type MethodSet,
  type Policy,
  type Rule,
  type Template,
  type Zone,
} from './data'
import { type FingerprintProfile } from './fingerprint'
import { type Hook } from './hooks'
import { appsAt, fingerprintsAt, groupsAt, hooksAt, methodSetsAt, methodsAt, policiesAt, zonesAt } from './fixtures'
import type { AuthMethod } from './methods'
import { TAB_SCREEN, personaById, type PersonaId } from './personas'
import { featuresOf, type Edition, type Features } from './edition'

export type BrandScreen =
  | { name: 'policies' }
  /* `open` lets a caller hand off INTO a surface rather than merely near it.
     The policy list can say "this one has four holes" and land you in the
     gauntlet for that policy, instead of in a builder where you still have to
     find the button. */
  | { name: 'builder'; policyId: string; open?: 'gauntlet' | 'impact' }
  | { name: 'templates' }
  | { name: 'zones' }
  | { name: 'fingerprint' }
  | { name: 'hooks' }
  | { name: 'methods' }
  | { name: 'create' }

interface BrandStore {
  apps: App[]
  groups: Group[]
  zones: Zone[]
  fingerprints: FingerprintProfile[]
  /* External hooks. A library object like zones, for the reason set out in
     hooks.ts: the endpoint is shared, the rules that consult it are not. */
  hooks: Hook[]
  /* Which edition is on screen, and the capabilities it grants. Read the
     flags, never the name: a screen that asks `edition === 'lite'` has to be
     revisited every time a third edition is imagined. */
  edition: Edition
  features: Features
  setEdition: (e: Edition) => void
  /* Which persona's tenant is loaded.

     Not a view filter. Changing it replaces the contents of every tab —
     policies, zones, fingerprint profiles, method sets, hooks, and the group
     directory the rule previews count against — because the doc's archetypes
     differ by company size and a 200-person tenant is a different product
     experience from a 20,000-person one rather than the same one scaled.

     Editing state is dropped on the swap, deliberately: carrying a draft
     written against three policies into an estate of twenty-three would leave
     rules pointing at zones that tenant does not have. */
  persona: PersonaId
  setPersona: (p: PersonaId) => void
  methodSets: MethodSet[]
  /* The catalogue is the same eleven methods for every tenant; only how many
     people have enrolled in each moves with the persona. */
  methods: AuthMethod[]
  setMethods: Dispatch<SetStateAction<AuthMethod[]>>
  templates: Template[]
  policies: Policy[]

  screen: BrandScreen
  go: (s: BrandScreen) => void

  appById: (id: string) => App
  groupById: (id: string) => Group
  zoneById: (id: string) => Zone | undefined
  fingerprintById: (id: string) => FingerprintProfile | undefined
  hookById: (id: string) => Hook | undefined
  addHook: (h: Hook) => void
  updateHook: (h: Hook) => void
  removeHook: (id: string) => void
  addFingerprint: (p: FingerprintProfile) => void
  updateFingerprint: (p: FingerprintProfile) => void
  removeFingerprint: (id: string) => void
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
  /* Copy a rule into another policy as an independent rule.

     Copied, never linked, and the distinction is the whole design. Zones and
     method sets are *referenced* — editing one reaches every rule that names
     it, which is what makes "Corporate Network" mean one thing across twenty
     policies. A rule is not that. Two policies can want the same conditions
     today and diverge next quarter, and a rule that propagated its edits would
     make the second policy change without anybody touching it.

     So: fresh id, fresh identity, no back-reference. Whoever copies it owns
     the copy. */
  copyRuleInto: (targetPolicyId: string, rule: Rule) => void
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
  const [policies, setPolicies] = useState<Policy[]>(() => policiesAt('medium'))
  /* Zones are edited in place now that they carry two sections, so they need
     the same draft/commit treatment policies already had. */
  const [zones, setZones] = useState<Zone[]>(() => zonesAt('medium'))
  const [screen, setScreen] = useState<BrandScreen>({ name: 'policies' })
  const [toast, setToast] = useState<string | null>(null)
  const [gauntletOverrides, setOverrides] = useState<Record<string, Record<string, AccessDecision>>>({})
  const [methodSets, setMethodSets] = useState<MethodSet[]>(() => methodSetsAt('medium'))
  /* Fingerprint profiles live here rather than on the screen: policy rules
     name them, so the linter and the simulator have to be able to resolve
     one without the Device Fingerprint page being mounted. */
  const [fingerprints, setFingerprints] = useState<FingerprintProfile[]>(() => fingerprintsAt('medium'))
  const [hooks, setHooks] = useState<Hook[]>(() => hooksAt('medium'))
  const [methods, setMethods] = useState<AuthMethod[]>(() => methodsAt('medium'))
  const [apps, setApps] = useState<App[]>(() => appsAt('medium'))
  const [groups, setGroups] = useState<Group[]>(() => groupsAt('medium'))
  const [edition, setEdition] = useState<Edition>('full')
  const [persona, setPersonaId] = useState<PersonaId>('manager')

  /* One swap, every tab. Held here rather than in the switcher so that a screen
     mounted at the time reads the new tenant on its next render instead of
     holding the old one until it is revisited. */
  const setPersona = useCallback((id: PersonaId) => {
    const { depth, landing } = personaById(id)
    setPersonaId(id)
    setPolicies(policiesAt(depth))
    setZones(zonesAt(depth))
    setMethodSets(methodSetsAt(depth))
    setMethods(methodsAt(depth))
    setFingerprints(fingerprintsAt(depth))
    setHooks(hooksAt(depth))
    setApps(appsAt(depth))
    setGroups(groupsAt(depth))
    setOverrides({})
    setScreen(TAB_SCREEN[landing])
  }, [])

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2800)
  }, [])

  const value = useMemo<BrandStore>(
    () => ({
      apps,
      groups,
      zones,
      fingerprints,
      hooks,
      edition,
      features: featuresOf(edition),
      setEdition,
      persona,
      setPersona,
      methodSets,
      methods,
      setMethods,
      templates: seedTemplates,
      policies,

      screen,
      go: setScreen,

      appById: (id) => apps.find((a) => a.id === id) ?? apps[0],
      groupById: (id) => groups.find((g) => g.id === id) ?? groups[0],
      // Reads live state, not the seed — otherwise a deleted or renamed zone
      // keeps resolving everywhere it is referenced.
      zoneById: (id) => zones.find((z) => z.id === id),
      fingerprintById: (id) => fingerprints.find((p) => p.id === id),
      hookById: (id) => hooks.find((h) => h.id === id),
      addHook: (h) => setHooks((all) => [...all, h]),
      updateHook: (h) => setHooks((all) => all.map((x) => (x.id === h.id ? h : x))),
      /* Same contract as zones and fingerprints: deleting does not unlink the
         rules naming it. The linter reports a condition pointing at nothing,
         which is a louder and more accurate signal than a rule that silently
         rewrote itself while nobody was looking. */
      removeHook: (id) => setHooks((all) => all.filter((h) => h.id !== id)),
      addFingerprint: (p) => setFingerprints((all) => [...all, p]),
      updateFingerprint: (p) => setFingerprints((all) => all.map((x) => (x.id === p.id ? p : x))),
      /* Deleting a profile does not unlink the rules naming it — the linter
         reports a condition pointing at nothing, same as it does for zones. */
      removeFingerprint: (id) => setFingerprints((all) => all.filter((p) => p.id !== id)),
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

      /* Appended, not inserted. Under first-match-wins any other position is a
         guess about intent the copier has not expressed — dropping a rule into
         the middle of somebody else's ordered list silently changes what every
         rule below it decides. The end is the only position that changes
         nothing that already worked, and the dialog says so, and says whether
         the rule can still fire from there. */
      copyRuleInto: (targetPolicyId, r) =>
        setPolicies((all) =>
          all.map((p) =>
            p.id === targetPolicyId
              ? {
                  ...p,
                  rules: [...p.rules, { ...r, id: `r${Date.now()}-${p.rules.length}` }],
                  lastModified: 'Just now',
                  modifiedBy: 'You',
                }
              : p,
          ),
        ),
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
    [policies, zones, fingerprints, hooks, apps, groups, edition, persona, setPersona, methodSets, methods, screen, toast, showToast, gauntletOverrides],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBrand(): BrandStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useBrand must be used inside BrandProvider')
  return s
}
