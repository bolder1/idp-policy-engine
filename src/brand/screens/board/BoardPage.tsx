import type { BrandScreen } from '../../store'
import type { ArriveFix } from './arrive-fix'
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

   `fix` is Access checks' "Fix in policy ↗" (owner, 1 Oct 2026: "go with your
   picks, start building"): a break-in card and the application it was played
   on, fixed in the draft as the board opens (arrive-fix.ts). It opens the
   board, never Check access — the change is read on the chain, where it was
   made — so a route carrying both lands on the board.
   -------------------------------------------------------------------------- */

type BoardOpen = Extract<BrandScreen, { name: 'board' }>['open']

export function BoardPage({ policyId, open, rule, fix }: { policyId: string; open?: BoardOpen; rule?: string; fix?: ArriveFix }) {
  /* Every `open` opens Check access (test mode, test-mode.ts), which has no
     tabs: `saved` opens its Saved sign-ins while that phase is on
     (sign-in-tests/phase.ts), and a route naming People or the Break-in test
     (`person`, `break-in`) lands on the sign-in while they are hidden
     (`PEOPLE_AND_BREAK_IN`). A route with a `fix` opens the board instead. */
  const testing = open !== undefined && fix === undefined
  return (
    <BoardBuilder
      policyId={policyId}
      openTest={testing}
      openPage={testing ? open : undefined}
      rule={rule}
      arriveFix={fix}
    />
  )
}
