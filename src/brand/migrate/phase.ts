import { TESTER } from '../tester'

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
/* The phase 1 tester build (tester.ts) has no migration at all (owner, 18 Nov 2026). */
export const MIGRATION_FIRST: boolean = !TESTER

/* The Policies head's review pickers, Start, Experience and Banner (owner, 18 Nov 2026: "everything is fixed now, the
   current version is perfect, no more dropdowns"). Off: the pickers are hidden and the values pinned to With policies,
   Today and the cards. Kept, not deleted: turning it on brings the comparison back. */
export const MIGRATION_PICKERS: boolean = false

/* The showcase opens after the migration (owner, 18 Nov 2026: "by default showcase the after migration page … in the top
   profile icon add an option to bring back old policy, and there we can start the migration flow"). On, the console loads
   with every old policy already moved (the same move Migrate runs, made at once, quietly), on Policies, with New and Old
   policies side by side. The profile menu's Bring back old policies reloads once into the console before the move, where
   the migration flow starts. Off: it opens before the move, as it did. Not under test, which reads the console as it was. */
export const START_AFTER_MIGRATION: boolean = import.meta.env.MODE !== 'test'

/* Bring back old policies sets this for ONE load; reading it clears it, so the next reload is after the move again. */
const BRING_BACK_KEY = 'brand-bring-back-old'

function bringBackRequested(): boolean {
  try {
    const on = sessionStorage.getItem(BRING_BACK_KEY) === '1'
    sessionStorage.removeItem(BRING_BACK_KEY)
    return on
  } catch {
    return false
  }
}

/** This load opens after the move: read once, when the module loads. */
export const OPENS_AFTER_MIGRATION: boolean = MIGRATION_FIRST && START_AFTER_MIGRATION && !bringBackRequested()

/** The profile menu's Bring back old policies: the console reloads before the move. */
export function bringBackOldPolicies(): void {
  try {
    sessionStorage.setItem(BRING_BACK_KEY, '1')
  } catch {
    /* without storage the reload opens after the move again; nothing breaks */
  }
  window.location.reload()
}
