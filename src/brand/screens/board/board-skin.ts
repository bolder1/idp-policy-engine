/* -----------------------------------------------------------------------------
   Which skin the board's canvas wears.

   Two previews of the same chain behind one switch in the canvas dock (owner,
   18 Sep 2026: "go through this workflow, check the experience, try a toggle,
   and replace our builder with this kind of outcome — same components, same
   visuals, similar vibe").

   CLASSIC is what this board has always been: one flat surface, cards that are
   a head and a body with no frame between them, a 2px connector and a bare `+`
   that grows a disc under the pointer.

   WORKFLOW is the live console's workflow editor
   (login.xecurify.com/moas/admin/customer/workflow/edit), measured rather than
   guessed. What that surface does and this one did not:

   · A NODE is a card with a headline row and a SUNKEN panel inside it. The head
     names the step; the panel holds what the step is set to. One frame inside
     another, and the inner one is what changes.
   · The border carries the step's colour, at 0.8px. Ours carried it on a glow.
   · Start and End are grey pills, so the chain has two ends rather than fading
     out at the top and stopping at the bottom.
   · The connector is a 1px hairline with a permanent round `+` on it, not a
     2px rule with a glyph that appears on hover.
   · Chips are outlined and fully round; nothing inside a node is filled.

   Measured values are in the `.bb__stage.is-wf` block in board.css.

   Remembered per viewer, the way the page width and the Rebrand switch are.
   Nothing about a policy depends on it.
   -------------------------------------------------------------------------- */

export type BoardSkin = 'classic' | 'workflow'

export const BOARD_SKIN_KEY = 'idp.boardSkin'

/** Only the exact stored value turns the new skin on; anything else is classic. */
export function parseBoardSkin(value: unknown): BoardSkin {
  return value === 'workflow' ? 'workflow' : 'classic'
}

export function readBoardSkin(): BoardSkin {
  try {
    return parseBoardSkin(window.localStorage.getItem(BOARD_SKIN_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'classic'
  }
}

export function writeBoardSkin(skin: BoardSkin): void {
  try {
    window.localStorage.setItem(BOARD_SKIN_KEY, skin)
  } catch {
    /* It still applies for this session; it just will not be remembered. */
  }
}

export const BOARD_SKINS: { value: BoardSkin; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'workflow', label: 'Workflow' },
]
