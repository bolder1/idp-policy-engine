/* -----------------------------------------------------------------------------
   The customizable Dashboard, round 1 (18 Nov 2026; plan in docs/research/dashboard-plan-18-nov.md).

   DASHBOARD_V2   The new Dashboard exists, behind a Classic / New switch in the Dashboard head. Classic (HomeHub)
                  stays the default. Off: the Dashboard is HomeHub, and nothing here is reachable.
   DASHBOARD_PICKERS
                  The review switches in the Dashboard head: Classic / New, the gallery's two preview styles (Split,
                  Cards) and the two saving models (One board, Several boards). These are the owner's A/B picks, so
                  they show even in the showcase build; turn this off to pin the stored value and hide the switches.
   -------------------------------------------------------------------------- */
export const DASHBOARD_V2: boolean = true
export const DASHBOARD_PICKERS: boolean = true
