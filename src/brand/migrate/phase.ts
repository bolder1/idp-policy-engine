/* -----------------------------------------------------------------------------
   Migration first (owner, 6 Nov 2026: "first we only show the old policies ... from the
   old policy, Start migration with the intro ... when we click Start migration, show
   the new policy tab and hide the old policy. In it, two tabs: New policies and Old
   policies ... hide Sign-in and Post sign-in, we'll work on it later").

   On:
     - before Start migration the rail shows the Old policy group, not Policies, and the
       console opens on App Login Policy; the old pages' banner starts the intro;
     - the intro's Start migration swaps them: Policies appears, Old policy goes;
     - Policies has two tabs, New policies (the migrated ones, where the move runs) and
       Old policies (every old policy, read-only, as detail cards). Sign-in and Post
       sign-in are hidden.
   Off: the rail and the Policies tabs are as they were before 6 Nov 2026.
   -------------------------------------------------------------------------- */
export const MIGRATION_FIRST: boolean = true
