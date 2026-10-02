import { ArrowRight, Repeat2 } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { SRC_W, POL_TOP, TOP, type Geo } from './circuit-geometry'
import type { InputId } from './circuit-whatif'

/* -----------------------------------------------------------------------------
   The power source (CircuitLayout.tsx): the sign-in as a component — who,
   to what — and the facts the application's rules read as its terminals.
   A terminal glows while a switch reads its fact; once the run has landed,
   a press flips the fact (a what-if) and the current re-routes.
   -------------------------------------------------------------------------- */

export interface Fact {
  id: InputId
  label: string
  value: string
  unset: boolean
  /** On a what-if: what the sign-in itself states. */
  was: string | null
  flippable: boolean
}

export const FACT_TOP = 12 + 52 + 34 + 10
export const FACT_H = 62

export function SourceCard({
  geo,
  name,
  groups,
  appId,
  appName,
  facts,
  reading,
  hot,
  powered,
  onPerson,
  onFlip,
  onHot,
}: {
  geo: Geo
  name: string
  groups: string
  appId: string | null
  appName: string
  facts: readonly Fact[]
  /** The fact a switch reads now. */
  reading: InputId | null
  /** The fact the pointer is on: the switches that read it light. */
  hot: InputId | null
  powered: boolean
  onPerson: () => void
  onFlip: (id: InputId) => void
  onHot: (id: InputId | null) => void
}) {
  const g = geo.src
  return (
    <div
      className={`rl-circuit__src${powered ? ' is-powered' : ''}${reading === 'person' ? ' is-reading' : ''}`}
      data-card
      data-node="sign-in"
      style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
    >
      <button type="button" className={`rl-circuit__who${hot === 'person' ? ' is-hot' : ''}`} onClick={onPerson} title="Change the sign-in" onMouseEnter={() => onHot('person')} onMouseLeave={() => onHot(null)}>
        <Face kind="user" name={name} size="md" decorative />
        <span className="rl-circuit__whotext">
          <strong>{name}</strong>
          {groups && <span>{groups}</span>}
        </span>
      </button>
      <p className="rl-circuit__app">
        <ArrowRight size={13} strokeWidth={2} aria-hidden className="rl-circuit__appto" />
        {appId && <AppLogo appId={appId} name={appName} size={16} />}
        <span>{appName || 'Choose an application'}</span>
      </p>
      <ul className="rl-circuit__terms" aria-label="Facts">
        {facts.map((f, i) => {
          const body = (
            <>
              <span className="rl-circuit__termlabel">
                {f.label}
                {f.flippable && <Repeat2 className="rl-circuit__flipicon" size={12} strokeWidth={2.2} aria-hidden />}
              </span>
              <span className="rl-circuit__termvalue">{f.value}</span>
            </>
          )
          const cls = `rl-circuit__term${f.unset ? ' is-unset' : ''}${f.was !== null ? ' is-flipped' : ''}${reading === f.id ? ' is-reading' : ''}${hot === f.id ? ' is-hot' : ''}`
          return (
            <li key={f.id} style={{ top: FACT_TOP + i * FACT_H, height: FACT_H - 6 }} className="rl-circuit__termrow">
              {f.flippable ? (
                <button
                  type="button"
                  className={`${cls} is-flip`}
                  aria-label={`${f.label}: ${f.value}. Try another value`}
                  title={f.was !== null ? `What if · the sign-in states ${f.was}` : 'Try another value'}
                  onClick={() => onFlip(f.id)}
                  onMouseEnter={() => onHot(f.id)}
                  onMouseLeave={() => onHot(null)}
                  onFocus={() => onHot(f.id)}
                  onBlur={() => onHot(null)}
                >
                  {body}
                </button>
              ) : (
                <div className={cls} onMouseEnter={() => onHot(f.id)} onMouseLeave={() => onHot(null)}>
                  {body}
                </div>
              )}
              <span className="rl-circuit__termpad" aria-hidden />
            </li>
          )
        })}
      </ul>
      <span className="rl-circuit__srcpad" style={{ top: POL_TOP + 31 - TOP - 5, left: SRC_W - 5 }} aria-hidden />
    </div>
  )
}
