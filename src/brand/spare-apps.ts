import type { App } from './data'
import type { Tenant } from './fixtures'
import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   Applications no policy protects (owner, 23 Nov 2026: "add some more apps which are not used, to test").

   Every application in a seeded tenant ends up held by a policy — the showcase's by its scenarios, the moved ones by
   the migration — and one application has one sign-in policy, so a new policy had nothing to take. These six are on
   every line's tenant from the start and in no seed, legacy estate or catalogue (scale-seed.ts, data.ts), so nothing
   claims them until an admin does. FABRICATED, like every app here: names of real products, nothing else real.
   -------------------------------------------------------------------------- */
export const SPARE_APPS: App[] = [
  { id: 'spare-trello', name: 'Trello', protocol: 'SAML', glyph: '▥', tint: '#0079bf', type: 'SAML/WS-FED', lastUpdated: 'Nov 20, 2026, 11:05:12' },
  { id: 'spare-bamboohr', name: 'BambooHR', protocol: 'SAML', glyph: '❧', tint: '#73c41d', type: 'SAML/WS-FED', lastUpdated: 'Nov 20, 2026, 11:08:40' },
  { id: 'spare-webex', name: 'Webex', protocol: 'SAML', glyph: '◍', tint: '#07c160', type: 'SAML/WS-FED', lastUpdated: 'Nov 20, 2026, 11:12:03' },
  { id: 'spare-calendly', name: 'Calendly', protocol: 'OIDC', glyph: '◷', tint: '#006bff', type: 'OAuth/OpenID', lastUpdated: 'Nov 21, 2026, 09:31:27' },
  { id: 'spare-coupa', name: 'Coupa', protocol: 'SAML', glyph: '◆', tint: '#0d2240', type: 'SAML/WS-FED', lastUpdated: 'Nov 21, 2026, 09:44:58' },
  { id: 'spare-clickup', name: 'ClickUp', protocol: 'OIDC', glyph: '⌃', tint: '#7b68ee', type: 'OAuth/OpenID', lastUpdated: 'Nov 21, 2026, 10:02:16' },
]

const ON: boolean = shows('spareApps')

/** The tenant with the spare applications added after its own, where the line has them (rollout.ts `spareApps`). */
export function withSpareApps(t: Tenant): Tenant {
  if (!ON) return t
  return { ...t, apps: [...t.apps, ...SPARE_APPS.filter((a) => !t.apps.some((x) => x.id === a.id))] }
}
