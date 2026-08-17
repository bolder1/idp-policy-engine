import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  type App,
  type Group,
  type IpRange,
  type NamedLocation,
  type Policy,
  type User,
  newPolicy,
} from '../engine/model'
import {
  apps as seedApps,
  groups as seedGroups,
  ipRanges as seedRanges,
  locations as seedLocations,
  policies as seedPolicies,
  users as seedUsers,
} from '../data/seed'

export type Screen =
  | { name: 'coverage' }
  | { name: 'builder'; policyId: string }
  | { name: 'simulate'; policyId?: string }
  | { name: 'resolution'; userId: string; appId: string }
  | { name: 'objects' }

interface Store {
  apps: App[]
  groups: Group[]
  users: User[]
  ranges: IpRange[]
  locations: NamedLocation[]
  policies: Policy[]

  screen: Screen
  go: (screen: Screen) => void

  appById: (id: string) => App
  groupById: (id: string) => Group
  policyFor: (appId: string, groupId: string) => Policy | undefined
  policyById: (id: string) => Policy | undefined

  savePolicy: (policy: Policy) => void
  createPolicy: (appId: string, groupId: string) => Policy
  deletePolicy: (id: string) => void
  saveRange: (range: IpRange) => void

  toast: string | null
  showToast: (message: string) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [policies, setPolicies] = useState<Policy[]>(seedPolicies)
  const [ranges, setRanges] = useState<IpRange[]>(seedRanges)
  const [screen, setScreen] = useState<Screen>({ name: 'coverage' })
  const [toast, setToast] = useState<string | null>(null)
  /**
   * A policy being created from an empty coverage cell lives here, not in
   * `policies`, until it is saved. Otherwise a stray click on any empty cell
   * silently creates a real policy and inflates the coverage numbers — which
   * is exactly the kind of quiet side effect a security console should never
   * have.
   */
  const [draft, setDraft] = useState<Policy | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2600)
  }, [])

  const value = useMemo<Store>(() => {
    const appById = (id: string) => seedApps.find((a) => a.id === id)!
    const groupById = (id: string) => seedGroups.find((g) => g.id === id)!

    return {
      apps: seedApps,
      groups: seedGroups,
      users: seedUsers,
      ranges,
      locations: seedLocations,
      policies,

      screen,
      go: setScreen,

      appById,
      groupById,
      policyFor: (appId, groupId) =>
        policies.find((p) => p.appId === appId && p.groupId === groupId),
      policyById: (id) => policies.find((p) => p.id === id) ?? (draft?.id === id ? draft : undefined),

      savePolicy: (policy) => {
        setPolicies((all) => {
          const i = all.findIndex((p) => p.id === policy.id)
          const stamped = { ...policy, lastModified: 'Just now', modifiedBy: 'You' }
          if (i === -1) return [...all, stamped]
          const next = [...all]
          next[i] = stamped
          return next
        })
        setDraft(null)
      },

      createPolicy: (appId, groupId) => {
        const app = appById(appId)
        const group = groupById(groupId)
        const fresh = newPolicy(appId, groupId, `${group.name} — ${app.name}`)
        setDraft(fresh)
        return fresh
      },

      deletePolicy: (id) => setPolicies((all) => all.filter((p) => p.id !== id)),

      saveRange: (range) =>
        setRanges((all) => {
          const i = all.findIndex((r) => r.id === range.id)
          if (i === -1) return [...all, range]
          const next = [...all]
          next[i] = range
          return next
        }),

      toast,
      showToast,
    }
  }, [policies, ranges, screen, toast, showToast, draft])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}
