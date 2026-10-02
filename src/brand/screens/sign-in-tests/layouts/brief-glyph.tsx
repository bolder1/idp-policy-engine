import { Ban, KeyRound, Layers, ListChecks, MapPin, ShieldCheck, Split, Users } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { ValueMark } from '../SignInCard'
import type { Glyph } from './brief-model'

/* -----------------------------------------------------------------------------
   The mark before a named thing in the brief's sentence (brief-sentence.tsx):
   the person's face, the application's logo, a fact's own mark (the one the
   Configure panel and the row on top draw), a group's people, the policy's
   layers, the rule's list, the outcome's mark (the Outcome card's own). Sized
   to the text it sits in; hidden from assistive tech, which reads the words.
   -------------------------------------------------------------------------- */

const OUTCOME = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban, depends: Split } as const

export function GlyphMark({ g, size }: { g: Glyph; size: number }) {
  const sw = size >= 18 ? 2 : 1.9
  const body = (() => {
    switch (g.kind) {
      case 'face':
        return <Face kind="user" name={g.name} size="sm" decorative />
      case 'logo':
        return <AppLogo appId={g.appId} name={g.name} size={size} />
      case 'fact':
        return <ValueMark v={g.value} size={size} />
      case 'group':
        return <Users size={size} strokeWidth={sw} />
      case 'place':
        return <MapPin size={size} strokeWidth={sw} />
      case 'policy':
        return <Layers size={size} strokeWidth={sw} />
      case 'rule':
        return <ListChecks size={size} strokeWidth={sw} />
      case 'outcome': {
        const Icon = OUTCOME[g.decision]
        return <Icon size={size} strokeWidth={sw} />
      }
    }
  })()
  return (
    <span className={`rl-brief__g is-${g.kind}${g.kind === 'outcome' ? ` is-${g.decision}` : ''}`} aria-hidden>
      {body}
    </span>
  )
}
