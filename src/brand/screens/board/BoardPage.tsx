import { BoardBuilder } from './BoardBuilder'

/* -----------------------------------------------------------------------------
   Builder v2 — the board.

   A route, and nothing else. It used to own the bar as well as the builder: it
   rendered `<PolicyBar floating away={focus}/>` above `<BoardBuilder/>` and held
   the `focus` boolean that governed both, because the bar hovered over the
   canvas and hiding it was the only way to get the region back.

   None of that is true any more. The board is three bands — a flat 48px row,
   the canvas, the config panel — and the row belongs to the builder, because
   everything in it beyond the policy's name acts on the DRAFT the builder holds.
   Owning the bar from up here would mean lifting `dirty`, `blockers`, `discard`
   and the review dialog out of the component that computes them, to be handed
   straight back down.

   So this file is the translation of a route into a component, which is all a
   page should be. `gauntlet` is the route's word and `check` is the sheet's;
   translated here rather than renaming either, so one caller can hand off to
   whichever builder is primary without knowing which it got, and the sheet keeps
   the name its own tab strip prints.
   -------------------------------------------------------------------------- */

export function BoardPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  return <BoardBuilder policyId={policyId} openSheet={open === 'gauntlet' ? 'check' : open} />
}
