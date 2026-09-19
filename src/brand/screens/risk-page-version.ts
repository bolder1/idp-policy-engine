/* -----------------------------------------------------------------------------
   Which shape a risk signal profile's page takes.

   Two previews of the same page behind one switch on its header (owner,
   18 Sep 2026: "add a toggle, and for the v2 try to redo this with our current
   other inner pages like Device profile").

   TABLE is what this page has always been: a row per signal across the full
   width, with the weight and the switch as columns.
   LIST is the device profile's inner page, on these signals: the work in the
   left column as one line per signal, and a panel on the right saying how the
   scores are made — the shape Zones, Device profiles and Risk profiles all
   share everywhere else in the product.

   Remembered per viewer, the way the page width and the Rebrand switch are.
   Nothing about a profile or what it scores depends on it.
   -------------------------------------------------------------------------- */

export type RiskPageVersion = 'table' | 'list'

export const RISK_PAGE_KEY = 'idp.riskProfilePage'

/** Only the exact stored value turns the list shape on; anything else is the table. */
export function parseRiskPage(value: unknown): RiskPageVersion {
  return value === 'list' ? 'list' : 'table'
}

export function readRiskPage(): RiskPageVersion {
  try {
    return parseRiskPage(window.localStorage.getItem(RISK_PAGE_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'table'
  }
}

export function writeRiskPage(version: RiskPageVersion): void {
  try {
    window.localStorage.setItem(RISK_PAGE_KEY, version)
  } catch {
    /* It still applies for this session; it just will not be remembered. */
  }
}

export const RISK_PAGE_VERSIONS: { value: RiskPageVersion; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'list', label: 'List' },
]
