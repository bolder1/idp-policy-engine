import { Volume2, VolumeX } from 'lucide-react'

import { Tip } from '../../../../kit'

/* The assistant dock's speaker button (voice.ts re-exports it): the narrator
   on or off. aria-pressed is the voice being on; the choice is remembered by
   the narrator (`idp.check-voice`). */

export interface MuteToggleProps {
  muted: boolean
  onChange: (muted: boolean) => void
  className?: string
}

export function MuteToggle({ muted, onChange, className = '' }: MuteToggleProps) {
  return (
    <Tip text={muted ? 'Voice off · turn it on' : 'Voice on · turn it off'} placement="top">
      <button type="button" className={`ad-btn${muted ? '' : ' is-on'}${className ? ` ${className}` : ''}`} aria-label="Voice" aria-pressed={!muted} onClick={() => onChange(!muted)}>
        {muted ? <VolumeX size={15} strokeWidth={2} aria-hidden /> : <Volume2 size={15} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
  )
}
