import { ArrowRight, ArrowUpRight, Play, TriangleAlert, Undo2 } from 'lucide-react'

import type { EngineRun } from '../engine-run'
import { eachGroupRows, isQuiet } from '../journey'
import { Skel } from './bento-parts'
import type { Size } from './bento-who-policy'
import type { ConflictView } from './bento-words'
import type { WhatIf } from './bento-whatif'

/* -----------------------------------------------------------------------------
   The two tiles a run has only when there is something to say (BentoLayout):
     Conflict              who else covers the person, or which later rule
                           also applies, and what it would give — amber
     What would change it  one or two one-fact flips, each the engine's real
                           run of that variation; pressed, the board fills
                           with it, marked as a what-if, with the way back
   -------------------------------------------------------------------------- */



export function ConflictBody({
  size,
  view,
  plan,
  shown,
  onOpenRule,
  onOpenPolicy,
  onAsGroup,
}: {
  size: Size
  view: ConflictView
  plan: EngineRun
  shown: boolean
  onOpenRule: (p: string, r: string) => void
  onOpenPolicy: (p: string) => void
  onAsGroup?: (groupId: string) => void
}) {
  if (size === 'mini') {
    return (
      <div className="rl-bento__mini is-notice">
        <TriangleAlert size={13} strokeWidth={2.4} aria-hidden />
        <span className="rl-bento__ell">{shown ? view.head : 'Checking who else covers them'}</span>
      </div>
    )
  }
  if (!shown) {
    return (
      <div className="rl-bento__stack">
        <Skel w="70%" />
        <Skel w="88%" />
        <Skel w="50%" />
      </div>
    )
  }
  const at = view.fixAt
  const groups = size === 'open' ? eachGroupRows(plan) : null
  const top = plan.conflicts?.findings.find((f) => f.tone === 'conflict')
  const others = size === 'open' ? (plan.conflicts?.findings ?? []).filter((f) => f !== top && !isQuiet(f)) : []
  return (
    <div className="rl-bento__conflict">
      <p className="rl-bento__chead" title={view.head}>{view.head}</p>
      <p className="rl-bento__cline">{view.line}</p>
      {view.would && <p className="rl-bento__cwould">{view.would}</p>}
      {view.why && <p className="rl-bento__cwhy">{view.why}</p>}
      {size === 'open' && view.fix && (
        <div className="rl-bento__detail">
          <h4 className="rl-bento__sub">To change it</h4>
          <p className="rl-bento__fix">{view.fix}</p>
          {view.caution && <p className="rl-bento__caution">{view.caution}</p>}
          {at && (
            <button type="button" className="rl-bento__btn" onClick={() => (at.ruleId ? onOpenRule(at.policyId, at.ruleId) : onOpenPolicy(at.policyId))}>
              {at.ruleId ? 'Open the rule' : 'Open the policy'}
              <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </div>
      )}
      {size === 'open' && groups && (
        <div className="rl-bento__detail">
          <h4 className="rl-bento__sub">As each group</h4>
          <ul className="rl-bento__list">
            {groups.map((r) => (
              <li key={r.key} className={`rl-bento__grow${r.current ? ' is-current' : ''}`}>
                <span className="rl-bento__growlabel">{r.label}</span>
                <span className={`rl-bento__growword is-${r.status === 'decided' ? (r.decision === 'deny' ? 'negative' : 'positive') : 'notice'}`}>{r.words}</span>
                <span className="rl-bento__growsrc">{r.source}</span>
                {r.groupId && onAsGroup && (
                  <button type="button" className="rl-bento__btn" onClick={() => onAsGroup(r.groupId!)}>
                    <Play size={12} strokeWidth={2.4} aria-hidden />
                    Run as {r.label.replace(/^As /, '')} only
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {size === 'open' && others.length > 0 && (
        <div className="rl-bento__detail">
          <h4 className="rl-bento__sub">Also worth knowing</h4>
          <ul className="rl-bento__list">
            {others.map((f, i) => (
              <li key={`${f.kind}:${i}`} className={`rl-bento__note${f.tone === 'conflict' ? ' is-conflict' : ''}`}>
                <strong>{f.title}</strong>
                {f.fix && <span className="rl-bento__fix">{f.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ChangeBody({ size, flips, preview, onPreview, onBack }: { size: Size; flips: WhatIf[] | null; preview: WhatIf | null; onPreview: (w: WhatIf) => void; onBack: () => void }) {
  if (preview) {
    return (
      <div className="rl-bento__whatif">
        <span className="rl-bento__wtag">What if</span>
        <span className="rl-bento__ell">{preview.label}</span>
        <button type="button" className="rl-bento__btn" onClick={onBack}>
          <Undo2 size={13} strokeWidth={2.2} aria-hidden />
          Back to the run
        </button>
      </div>
    )
  }
  if (!flips) {
    return size === 'mini' ? (
      <div className="rl-bento__mini">
        <span className="rl-bento__ell">Once it lands</span>
      </div>
    ) : (
      <div className="rl-bento__stack">
        <Skel w="80%" h={22} />
        <Skel w="66%" h={22} />
      </div>
    )
  }
  const changed = flips.filter((w) => w.changed)
  if (size === 'mini') {
    return (
      <div className="rl-bento__mini">
        <span className="rl-bento__ell">{changed[0] ? `${changed[0].label} → ${changed[0].words}` : 'No one fact changes it'}</span>
      </div>
    )
  }
  /* Two flips that teach the most: one per kind of fact first (network, device, risk), then the rest. */
  const kinds = new Set<string>()
  const varied = [...changed.filter((w) => !kinds.has(w.key.split(':')[0]) && kinds.add(w.key.split(':')[0])), ...changed]
  const list = size === 'open' ? flips : [...new Set(varied)].slice(0, 2)
  return (
    <ul className="rl-bento__flips">
      {list.map((w) => (
        <li key={w.key}>
          <button type="button" className={`rl-bento__flip${w.changed ? '' : ' is-same'}`} onClick={() => onPreview(w)} title={`Show the run ${w.label.toLowerCase()}`}>
            <span className="rl-bento__flipif">{w.label}</span>
            <ArrowRight size={13} strokeWidth={2.2} aria-hidden className="rl-bento__arrow" />
            <span className={`rl-bento__flipthen is-${w.changed ? w.tone : 'neutral'}`}>{w.changed ? w.words : 'Same answer'}</span>
            {size === 'open' && w.source && <span className="rl-bento__flipsrc">{w.source}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
