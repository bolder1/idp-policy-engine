/* -----------------------------------------------------------------------------
   The celebration on the way back from the board (ApplicationPage.tsx).

   New policy and Add a copy send a fresh draft from an application's page to
   the board, noting whether the application had a deciding policy then. A
   draft decides for nobody, so if the board's Back returns with it (`flash`)
   deciding, it started deciding in that visit — and when the application had
   none, it is the application's first, and celebrated.

   Once, and only for the visit the press started. Any arrival at an
   application's page spends every note: one that is not that Back means the
   board was left some other way (the rail), and a note kept past it played
   the celebration on a later Edit policy and Back that changed nothing, from
   a "had" long out of date (review 10 Oct 2026, #13).
   -------------------------------------------------------------------------- */

/** Policy id → whether the application had a deciding policy when the press sent it to the board. */
export type SentToBoard = Map<string, boolean>

/** A press on an application's page sends the draft `id` to the board; `had` is whether the application had a deciding policy then. */
export function sendToBoard(sent: SentToBoard, id: string, had: boolean): void {
  sent.set(id, had)
}

/** An arrival at an application's page, `flash` being the policy the board's Back returned with: every note is spent, and the answer is whether to celebrate. */
export function arriveFromBoard(sent: SentToBoard, flash: string | undefined, decides: (id: string) => boolean): boolean {
  const had = flash === undefined ? undefined : sent.get(flash)
  sent.clear()
  return flash !== undefined && had === false && decides(flash)
}
