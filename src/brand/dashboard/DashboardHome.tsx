import { HomeHub } from '../migrate/HomeHub'
import { Picker } from '../picker'
import { Dashboard } from './Dashboard'
import { useDash } from './model'
import { DASHBOARD_PICKERS } from './phase'

/* -----------------------------------------------------------------------------
   The Dashboard route: Classic (HomeHub, the default) or the new customizable
   Dashboard, picked by a review switch in the page head.
   -------------------------------------------------------------------------- */

const VERSIONS = [
  { value: 'classic', label: 'Classic' },
  { value: 'new', label: 'New' },
]

export function DashboardHome() {
  const [prefs, set] = useDash()
  const switches = DASHBOARD_PICKERS ? (
    <Picker label="Dashboard" prefix="Dashboard" size="md" value={prefs.version} options={VERSIONS} onChange={(v) => set((p) => ({ ...p, version: v === 'new' ? 'new' : 'classic' }))} />
  ) : undefined
  return prefs.version === 'new' ? <Dashboard switches={switches} /> : <HomeHub preview={switches} />
}
