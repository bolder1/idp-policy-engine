import type { BrandScreen } from '../../store'
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
   page should be. The route named two sheets as well once — `gauntlet` and
   `impact`, Check and What changes over the stage — and both went with M4:
   the Break-in test lives in Saved sign-ins, and What changes is a row of the
   checks before saving.
   -------------------------------------------------------------------------- */

type BoardOpen = Extract<BrandScreen, { name: 'board' }>['open']

export function BoardPage({ policyId, open, rule }: { policyId: string; open?: BoardOpen; rule?: string }) {
  /* Every `open` opens test mode; anything but `try` also names the page the
     panel opens on — Check a person, Saved sign-ins, or the Break-in test
     pushed over Saved sign-ins. Where the edition has no Policy testing the
     panel is Try a sign-in alone, and opens there. */
  return (
    <BoardBuilder
      policyId={policyId}
      openTest={open !== undefined}
      openPage={open}
      rule={rule}
    />
  )
}
