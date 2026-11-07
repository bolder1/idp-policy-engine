import { Globe, KeyRound, MonitorSmartphone, Power, ScanSearch, type LucideIcon } from 'lucide-react'
import { useBrand, type BrandScreen } from '../store'

/* What to do after a move, in the order THIS tenant needs it (owner, 4 Nov 2026: "guided setup, prioritised based on
   need"): a protection the old console had and the new one does not get back first (the device count), then checking
   access before anything decides, then the pieces the move made, last turning the policies on. Done draws it in full;
   the Dashboard's hub carries it in a card. */

export interface SetupStep {
  id: string
  title: string
  line: string
  action: string
  to: BrandScreen
  icon: LucideIcon
  /** A protection lost on the way: said, and first. */
  gap?: boolean
}

export function useSetupSteps() {
  const store = useBrand()
  const approved = Object.entries(store.moved).filter(([, m]) => m.approved)
  const info = approved.map(([, m]) => m)
  const ids = approved.map(([id]) => id)
  /* Moved policies arrive as drafts (owner, 4 Nov 2026: Monitoring is on hold); the count is the ones still off. */
  const drafts = store.policies.filter((p) => ids.includes(p.id) && p.status === 'draft').length
  const zones = store.zones.filter((z) => z.fromOld === 'added').length
  const deviceGap = info.some((m) => m.leftOut.some((l) => l.id.endsWith('-device')))
  const methods = info.some((m) => m.changes.some((c) => /-(method|renamed|gone)$/.test(c.id)))

  const steps: SetupStep[] = [
    ...(deviceGap
      ? [{ id: 'device', title: 'Replace the device limit', line: 'Old device counts did not carry over. A device profile checks the device itself.', action: 'Create a device profile', to: { name: 'fingerprint' } as BrandScreen, icon: MonitorSmartphone, gap: true }]
      : []),
    { id: 'check', title: 'Check access', line: 'Try a sign-in against a moved policy and see what it decides.', action: 'Check access', to: { name: 'sign-in-tests' }, icon: ScanSearch },
    ...(zones > 0
      ? [{ id: 'zones', title: zones === 1 ? 'Look over 1 new zone' : `Look over ${zones} new zones`, line: 'Made from your old IP and location checks.', action: 'Open Zones', to: { name: 'zones' } as BrandScreen, icon: Globe }]
      : []),
    ...(methods
      ? [{ id: 'methods', title: 'Confirm the methods that changed', line: 'Some old method names map to new ones.', action: 'Open Authentication methods', to: { name: 'methods' } as BrandScreen, icon: KeyRound }]
      : []),
    {
      id: 'on',
      title: 'Make your policies active',
      line: drafts === 1 ? '1 policy is a draft. The old one decides until it is active.' : `${drafts} policies are drafts. The old ones decide until these are active.`,
      action: 'Open Policies',
      to: { name: 'policies' },
      icon: Power,
    },
  ]
  const done = steps.filter((s) => store.setupDone.includes(s.id)).length
  const next = steps.find((s) => !store.setupDone.includes(s.id))
  const take = (s: SetupStep) => {
    store.markSetup(s.id)
    store.go(s.to)
  }
  /* There is a list to show once something moved and was approved. */
  return { steps, done, next, take, drafts, zones, any: ids.length > 0 }
}
