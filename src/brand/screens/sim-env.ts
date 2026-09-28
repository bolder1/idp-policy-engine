import { useMemo } from 'react'

import type { App, Group, Policy, User, Zone } from '../data'
import type { FingerprintProfile } from '../fingerprint'
import type { AuthMethod } from '../methods'
import { useBrand } from '../store'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   The evaluation env, built from the store once.

   Eight screens built this literal for themselves, and they had started to
   disagree. The board named a deleted group by its id; the gauntlet named it as
   the first group in the tenant, because `groupById` falls back. The board
   passed people's names and the gauntlet did not, so the same rule's trace read
   "Kavya Menon" in one and "u-hr-1" in the other. Neither passed application
   names, so the resolver said "Does not cover hrms".

   `simEnvOf` is the one literal, and it reads plain collections so a test can
   hand it a tenant. `useSimEnv` is the store's copy of it. `envWith` is the
   same env with a zone, a device profile or a risk scale swapped for a draft
   one: the question every save-time check asks is "what would this sign-in get
   if the zone I am editing were saved".
   -------------------------------------------------------------------------- */

/** The tenant objects an env reads. The store has every one of these under the same name. */
export interface SimEnvSource {
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
  groups: readonly Group[]
  users: readonly User[]
  apps: readonly App[]
  methods: readonly AuthMethod[]
  policies: readonly Policy[]
  riskScale: Record<string, number>
}

export function simEnvOf(s: SimEnvSource): SimEnv {
  return {
    zoneName: (id) => s.zones.find((z) => z.id === id)?.name ?? id,
    fingerprintName: (id) => s.fingerprints.find((p) => p.id === id)?.name ?? id,
    hasZone: (id) => s.zones.some((z) => z.id === id),
    hasFingerprint: (id) => s.fingerprints.some((p) => p.id === id),
    /* Not a lookup that falls back to the first group: a who naming a deleted
       group would be named as somebody else's group in the trace. */
    groupName: (id) => s.groups.find((g) => g.id === id)?.name ?? id,
    userName: (id) => s.users.find((u) => u.id === id)?.name ?? id,
    appName: (id) => s.apps.find((a) => a.id === id)?.name ?? id,
    riskScale: s.riskScale,
    /* The tenant's own objects: zones and device profiles are read from their own entries, not from the chip table. */
    library: { zones: s.zones, fingerprints: s.fingerprints, people: s.users, groups: s.groups, methods: s.methods, policies: s.policies },
  }
}

/** The env for the store's tenant as it stands, rebuilt when an object it reads changes. */
export function useSimEnv(): SimEnv {
  const { zones, fingerprints, groups, users, apps, methods, policies, riskScale } = useBrand()
  return useMemo(
    () => simEnvOf({ zones, fingerprints, groups, users, apps, methods, policies, riskScale }),
    [zones, fingerprints, groups, users, apps, methods, policies, riskScale],
  )
}

/** The same env, with a draft zone, device profile or risk scale in place of the stored one. */
export function envWith(
  env: SimEnv,
  swap: { zones?: readonly Zone[]; fingerprints?: readonly FingerprintProfile[]; riskScale?: Record<string, number> },
): SimEnv {
  const next: SimEnv = { ...env }
  const library = env.library
  if (swap.zones) {
    const zones = swap.zones
    next.zoneName = (id) => zones.find((z) => z.id === id)?.name ?? id
    next.hasZone = (id) => zones.some((z) => z.id === id)
  }
  if (swap.fingerprints) {
    const fingerprints = swap.fingerprints
    next.fingerprintName = (id) => fingerprints.find((p) => p.id === id)?.name ?? id
    next.hasFingerprint = (id) => fingerprints.some((p) => p.id === id)
  }
  if (swap.riskScale) next.riskScale = swap.riskScale
  if (library && (swap.zones || swap.fingerprints)) {
    next.library = { ...library, zones: swap.zones ?? library.zones, fingerprints: swap.fingerprints ?? library.fingerprints }
  }
  return next
}
