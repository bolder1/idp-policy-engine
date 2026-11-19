import type { ComponentType } from 'react'
import { WIDGETS, type Range, type WidgetId } from './model'
import type { Cell } from './layout'
import { TileContext } from './tile-context'
import {
  ActivePolicies,
  AppsWithout,
  Blocked,
  BlockedTotal,
  Coverage,
  Expiring,
  Funnel,
  Health,
  Heatmap,
  Locations,
  Methods,
  MfaCoverage,
  MfaDelivery,
  Phishing,
  RecentSignIns,
  RiskSignals,
  RiskyUsers,
  SignIns,
  SignInsTotal,
  SuccessRate,
  TopApps,
} from './widgets-activity'
import {
  AdminActivity,
  Approvals,
  Blocks,
  Changes,
  CheckAccess,
  Connections,
  Directory,
  Dormant,
  Groups,
  License,
  Migration,
  Provisioning,
  Registrations,
  Setup,
  Shortcuts,
  TopRules,
  UserTypes,
  WhatsNew,
} from './widgets-admin'

/* Every widget in the catalog, by id. A widget reads its tile (size is the tile's own box; view, filter and range
   come through TileContext), so the same component draws on the board, in a drag, and in the gallery. */
const VIEW: Record<WidgetId, ComponentType> = {
  'active-policies': ActivePolicies,
  mfa: MfaCoverage,
  phishing: Phishing,
  coverage: Coverage,
  'apps-without': AppsWithout,
  health: Health,
  expiring: Expiring,
  'risky-users': RiskyUsers,
  'sign-ins-total': SignInsTotal,
  'blocked-total': BlockedTotal,
  'success-rate': SuccessRate,
  'sign-ins': SignIns,
  heatmap: Heatmap,
  blocked: Blocked,
  'top-apps': TopApps,
  funnel: Funnel,
  methods: Methods,
  'mfa-delivery': MfaDelivery,
  locations: Locations,
  'risk-signals': RiskSignals,
  'recent-sign-ins': RecentSignIns,
  migration: Migration,
  changes: Changes,
  'top-rules': TopRules,
  check: CheckAccess,
  blocks: Blocks,
  directory: Directory,
  'user-types': UserTypes,
  registrations: Registrations,
  dormant: Dormant,
  approvals: Approvals,
  provisioning: Provisioning,
  groups: Groups,
  'admin-activity': AdminActivity,
  connections: Connections,
  license: License,
  setup: Setup,
  shortcuts: Shortcuts,
  'whats-new': WhatsNew,
}

const NOTHING = () => {}

/** One widget drawn for a tile. `preview` draws it to be looked at: inert, never orange, not animating. */
export function WidgetBody({ tile, range, preview = false, onPatch = NOTHING }: { tile: Pick<Cell, 'widget' | 'view' | 'pick'>; range: Range; preview?: boolean; onPatch?: (p: Partial<Pick<Cell, 'view' | 'pick'>>) => void }) {
  const View = VIEW[tile.widget]
  return (
    <TileContext value={{ tile, meta: WIDGETS[tile.widget], range, preview, patch: onPatch }}>
      <div className={`bdw is-${WIDGETS[tile.widget].kind}`}>
        <View />
      </div>
    </TileContext>
  )
}
