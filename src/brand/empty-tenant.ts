import { tenantAt, type Tenant } from './fixtures'
import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   The empty tenant: a REVIEW TOOL, not part of the product (owner, 20 Nov 2026: "a new localhost where we test the
   empty state of all the possible places in design ... the developer needs that", then "add an option to go empty ...
   not a part of the product so will remove it eventually"). To take it out: delete this file, empty-wipe.tsx,
   DashboardEmpty.tsx and their call sites (store.tsx, ProfileMenu.tsx, BrandApp.tsx), and the two ROLLOUT entries.

   Two ways in, both Design only (ROLLOUT.emptyTenant):
     - `npm run dev:empty` (vite --mode empty, http://localhost:5191) always opens empty;
     - the profile menu's Go empty, on any server: it wipes this tab (empty-wipe.tsx) and reloads empty. The flag is
       in sessionStorage, so it holds across reloads in this tab only, and Bring back data clears it.

   What a tenant has on its first morning stays, because the product ships it: the Global Default ("Baseline access"),
   the Authentication methods catalogue, Xecurify's templates and the shipped risk signal profile. Everything a tenant
   authors or brings is empty. The page list is docs/EMPTY-STATES.md.
   -------------------------------------------------------------------------- */

const KEY = 'idp.empty-tenant'

/** The empty server: no way out from inside, so the menu offers neither switch there. */
export const EMPTY_BY_MODE: boolean = import.meta.env.MODE === 'empty'

function flagged(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Read once, when the module loads: the store seeds from it, so changing it means a reload. */
export const EMPTY_TENANT: boolean = shows('emptyTenant') && (EMPTY_BY_MODE || flagged())

/** Go empty (true) or Bring back data (false): sets this tab's flag and reloads. */
export function setEmptyTenant(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    /* without storage the reload opens as it was; nothing breaks */
  }
  window.location.reload()
}

export function emptyTenant(): Tenant {
  return {
    ...tenantAt('none'),
    zones: [],
    fingerprints: [],
    hooks: [],
    apps: [],
    groups: [],
    tokens: [],
    methodSets: [],
    directory: { people: [], unlisted: 0 },
    savedSignIns: [],
  }
}
