/* -----------------------------------------------------------------------------
   The customizable Dashboard (18-19 Nov 2026; plan in docs/research/dashboard-plan-18-nov.md).

   DASHBOARD_V2   The new Dashboard exists, behind a Classic / New switch in the Dashboard head. Classic (HomeHub)
                  stays the default. Off: the Dashboard is HomeHub, and nothing here is reachable. On, it still
                  reaches only the lines in the rollout table's `dashboardV2` entry (rollout.ts): Design for now.
   DASHBOARD_PICKERS
                  The Classic / New switch in the Dashboard head. It is the owner's pick, so it shows even in the
                  showcase build; turn this off to pin the stored value and hide the switch.
   DASHBOARD_THEMES
                  Colour themes: the Theme menu in Customize and the colour badge on each widget (built 19 Nov). The
                  owner put theming off until later the same day ("we will deprioritize the theming part"), so the
                  board draws in Monochrome and keeps any colours already chosen. Turn it on to bring both back.
   -------------------------------------------------------------------------- */
export const DASHBOARD_V2: boolean = true
export const DASHBOARD_PICKERS: boolean = true
export const DASHBOARD_THEMES: boolean = false
