/* -----------------------------------------------------------------------------
   A rename saves itself.

   The pencil beside a library item's name opens the kit's NameField, and its ✓
   used to put the name in the page's draft, where it waited for the save
   footer and came back as a row of Review changes. The owner, 1 Oct 2026, on
   that review's first section: "Call it Basic details" — and then "we already
   have a save button for the basic details so no need to have it in the
   review, or save it." The ✓ is that button. So on an item that is already
   stored, keeping a name — ✓, Enter, or focus leaving the field, which keeps
   it as ✓ does — writes it to the store at once, with a toast, and the draft's
   name follows. A rename never makes the page unsaved and never shows in
   Review changes.

   Only the name is written: the stored item with its name replaced, never the
   draft. A signal switched off a minute ago is still an unsaved edit after the
   rename, and still the save footer's to commit or the leave dialog's to throw
   away.

   An item that is not stored yet — a device profile named in the new-profile
   dialog, before Create profile — has nowhere to save a name to. Its name
   stays in the draft and in the review, under Basic details.

   What a name may be has not changed. Blank puts back the name the item has,
   as it always did, and the field's length is the input's own limit. A name
   another item already has used to wait in the draft for the save footer to
   refuse it; with nothing between the ✓ and the store, the field refuses it
   itself and says why under it, and stays open to fix it — the zone page's
   field always worked that way.
   -------------------------------------------------------------------------- */

export type NameKeep<T> =
  /** Nothing to save: blank, or the name it already has. `name` is what the heading goes back to. */
  | { kind: 'same'; name: string }
  /** The name can't be used. The field says why under it and stays open. */
  | { kind: 'refused'; problem: string }
  /** Save it: `stored` is the stored item with only its name replaced. */
  | { kind: 'saved'; name: string; stored: T }

/** What keeping `typed` does to a stored item. `problem` is the page's own name check — taken names, in the page's words. */
export function keepName<T extends { name: string }>(
  stored: T,
  typed: string,
  problem: (name: string) => string | null,
): NameKeep<T> {
  const name = typed.trim()
  if (!name || name === stored.name) return { kind: 'same', name: stored.name }
  const why = problem(name)
  if (why) return { kind: 'refused', problem: why }
  return { kind: 'saved', name, stored: { ...stored, name } }
}

/** Why `typed` would be refused, or null — asked before a leave keeps it, without keeping anything. */
export function nameRefusal<T extends { name: string }>(
  stored: T,
  typed: string,
  problem: (name: string) => string | null,
): string | null {
  const kept = keepName(stored, typed, problem)
  return kept.kind === 'refused' ? kept.problem : null
}
