import { type ComponentType } from 'react'

import { LocalToggle } from './pulse-theme-local'
import { shared } from './pulse-theme-state'

/* Pulse's stage button: the shared module's when it is there, else its own
   (pulse-theme-local.tsx); the stage itself, light or dark, is
   pulse-theme-state.ts. */

/** The dock's light / dark button. */
export const PulseStageToggle: ComponentType = shared?.StageThemeToggle ?? LocalToggle
