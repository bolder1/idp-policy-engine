import { useLayoutEffect, useRef } from 'react'

import { useBrand } from '../store'
import { OPENS_AFTER_MIGRATION } from './phase'
import { useMovePlan } from './use-move-plan'

/* The showcase opens after the migration (owner, 18 Nov 2026; migrate/phase.ts START_AFTER_MIGRATION). On the first
   render, before the first paint, every old policy that can move is moved at once: the same plan Migrate would run, with
   no stage, toast or tour, so the console opens on Policies with New and Old policies side by side. Once per load; the
   profile menu's Bring back old policies reloads into the console before the move. Mounted once, beside AutoAdd. */
export function StartAfterMigration() {
  const store = useBrand()
  const { plan } = useMovePlan()
  const done = useRef(false)
  useLayoutEffect(() => {
    if (done.current || !OPENS_AFTER_MIGRATION || store.migrationStarted) return
    done.current = true
    if (plan.policies.length) store.migrateAtOnce(plan)
  }, [plan, store])
  return null
}
