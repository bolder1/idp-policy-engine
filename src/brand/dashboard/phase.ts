/* -----------------------------------------------------------------------------
   The customizable Dashboard (18-19 Nov 2026; plan in docs/research/dashboard-plan-18-nov.md).

   DASHBOARD_V2   The new Dashboard exists, behind a Classic / New switch in the Dashboard head. Classic (HomeHub)
                  stays the default. Off: the Dashboard is HomeHub, and nothing here is reachable. On, it still
                  reaches only the lines in the rollout table's `dashboardV2` entry (rollout.ts): every line since 20 Nov.
   DASHBOARD_PICKERS
                  The Classic / New switch in the Dashboard head. It is the owner's pick, so it shows even in the
                  showcase build; turn this off to pin the stored value and hide the switch.
   DASHBOARD_THEMES
                  Colour themes: the Theme menu in Customize and the colour badge on each widget (built 19 Nov). The
                  owner put theming off on 19 Nov and brought it back on 20 Nov ("bring back the colors part … good colors, something modern"): on, with
                  Colourful, Ocean and Aurora (tokens.css) first. Turn it off to draw the board in Monochrome again.
   -------------------------------------------------------------------------- */
export const DASHBOARD_V2: boolean = true
export const DASHBOARD_PICKERS: boolean = true
export const DASHBOARD_THEMES: boolean = true
