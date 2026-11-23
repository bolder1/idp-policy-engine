import { tenantAt, type Tenant } from './fixtures'
import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   The empty tenant: a REVIEW TOOL, not part of the product (owner, 20 Nov 2026: "a new localhost where we test the
   empty state of all the possible places in design ... the developer needs that", then "add an option to go empty ...
   not a part of the product so will remove it eventually"). To take it out: delete this file, empty-wipe.tsx,
   DashboardEmpty.tsx and their call sites (store.tsx, ProfileMenu.tsx, BrandApp.tsx), and the two ROLLOUT entries.

   Design only (ROLLOUT.emptyTenant). The profile menu's Show empty states / Hide empty states switches this tab
   between the empty tenant and the full design version, on any server (owner, 23 Nov 2026: "a button for show and
   hide empty state ... by hide we showcase the old state, the full design version"). It plays the wipe
   (empty-wipe.tsx) and reloads. The choice is in sessionStorage, so it holds across reloads in this tab only.
   `npm run dev:empty` (vite --mode empty, http://localhost:5191) only changes where a tab starts: empty.

   What a tenant has on its first morning stays, because the product ships it: the Global Default ("Baseline access"),
   the Authentication methods catalogue, Xecurify's templates and the shipped risk signal profile. Everything a tenant
   authors or brings is empty. The page list is docs/EMPTY-STATES.md.
   -------------------------------------------------------------------------- */

const KEY = 'idp.empty-tenant'

/** The empty server: a tab there starts empty until Hide empty states. */
const EMPTY_BY_MODE: boolean = import.meta.env.MODE === 'empty'

/** This tab's choice: '1' empty, '0' full, null = where this server starts. */
function choice(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Read once, when the module loads: the store seeds from it, so changing it means a reload. */
export const EMPTY_TENANT: boolean = shows('emptyTenant') && (choice() === '1' || (EMPTY_BY_MODE && choice() !== '0'))

/** Show empty states (true) or Hide empty states (false): sets this tab's choice and reloads. */
export function setEmptyTenant(on: boolean): void {
  try {
    if (on === EMPTY_BY_MODE) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, on ? '1' : '0')
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
