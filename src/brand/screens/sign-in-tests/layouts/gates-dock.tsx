import { ChevronLeft, ChevronRight, Footprints } from 'lucide-react'

import { Tip } from '../../../kit'

/* The dock's own controls (GatesLayout.tsx): Walk again replays the walk from
   the settled run, without running the engine again; ‹ › step it, one of the
   engine's steps at a time, and › past the last lands it again. */
export function GatesDock({
  disabled,
  playing,
  stepping,
  atStart,
  onWalk,
  onBack,
  onNext,
}: {
  disabled: boolean
  playing: boolean
  stepping: boolean
  atStart: boolean
  onWalk: () => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="bb__zoomgrp rl-gates__dock">
      <Tip text="Step back" placement="top">
        <button type="button" className="bb__act" aria-label="Step back" disabled={disabled || atStart} onClick={onBack}>
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      </Tip>
      <Tip text={playing ? 'Walking' : 'Walk again'} placement="top">
        <button type="button" className={`bb__act rl-gates__walkbtn${playing ? ' is-on' : ''}`} aria-label="Walk again" aria-pressed={playing} disabled={disabled} onClick={onWalk}>
          <Footprints size={14} strokeWidth={2} />
          <span>Walk again</span>
        </button>
      </Tip>
      <Tip text="Step forward" placement="top">
        <button type="button" className="bb__act" aria-label="Step forward" disabled={disabled || !stepping} onClick={onNext}>
          <ChevronRight size={15} strokeWidth={2} />
        </button>
      </Tip>
    </div>
  )
}
