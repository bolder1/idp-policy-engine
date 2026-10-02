import { ArrowRight } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { RowsRead } from '../../testing/rows-read'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import type { SignInForm } from '../../testing/sign-in-form'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { G } from './stream-geometry'
import { DEVICE_CHIPS, FROM_CHIPS, RISK_CHIPS, ownOf, type Flips } from './stream-whatif'

/* -----------------------------------------------------------------------------
   The SOURCE (StreamLayout.tsx): who signs in, to what, and the facts the
   application's rules read — the stream leaves it by the handle on its
   right edge. Once the run has landed, under it, the what-if chips: drag the
   handle onto one (or press it) and the stream re-routes for that network,
   device or risk score; the page's own sign-in stays as it is.
   -------------------------------------------------------------------------- */

const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }

export function factTokens(rows: RowsRead): TokenId[] {
  return sentenceTokens(rows).filter((t) => t !== 'person' && t !== 'app')
}

/** The source's card height, for the geometry: its rows are fixed. */
export const sourceCardH = (facts: number): number => 100 + facts * 22

/** The card and the chips under it, as the geometry reserves them. */
export const sourceH = (facts: number, groups: readonly ('from' | 'device' | 'risk')[]): number =>
  sourceCardH(facts) + 46 + groups.reduce((n, g) => n + (g === 'device' ? 108 : g === 'risk' ? 46 : 76), 0)

export function chipGroups(rows: RowsRead): ('from' | 'device' | 'risk')[] {
  const out: ('from' | 'device' | 'risk')[] = ['from']
  if (rows.rows.has('device')) out.push('device')
  if (rows.rows.has('risk')) out.push('risk')
  return out
}

export interface SourceProps {
  form: SignInForm
  /** The page's own sign-in, when the one drawn is a what-if of it. */
  baseForm: SignInForm
  rows: RowsRead
  asGroup: string | null
  landed: boolean
  depends: boolean
  flips: Flips
  /** The chip the dragged handle is over. */
  over: string | null
  dragging: boolean
  onPressPerson: () => void
  onFlip: (f: Flips) => void
  onHandleDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
}

export function Source({ form, baseForm, rows, asGroup, landed, depends, flips, over, dragging, onPressPerson, onFlip, onHandleDown }: SourceProps) {
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const tokens = factTokens(rows)
  const facts = tokens.map((t) => tokenValue(t, form, ctx))
  const base = tokens.map((t) => tokenValue(t, baseForm, ctx))
  const own = ownOf(baseForm)
  const now = { from: flips.from ?? own.from, device: flips.device ?? own.device, risk: flips.risk ?? own.risk }
  const set = (k: keyof Flips, id: string) => {
    const next: Flips = { ...flips }
    if (own[k] === id) delete next[k]
    else (next as Record<string, string>)[k] = id
    onFlip(next)
  }
  const groupsShown = chipGroups(rows)
  return (
    <div className="rl-stream__src" style={{ width: G.SRC_W }}>
      <div className="rl-stream__srccard" style={{ height: sourceCardH(facts.length) }}>
        <button type="button" className="rl-stream__srcbtn" data-card data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
          <span className="rl-stream__srchead">
            {person && <Face kind="user" name={person.name} size="md" decorative />}
            <span className="rl-stream__srcwho">
              <strong>{person?.name ?? 'Choose a person'}</strong>
              {groupLine && <span>{groupLine}</span>}
            </span>
          </span>
          <span className="rl-stream__srcapp">
            <ArrowRight size={13} strokeWidth={2} aria-hidden />
            {app && <AppLogo appId={app.id} name={app.name} size={16} />}
            <span>{app?.name ?? 'Choose an application'}</span>
          </span>
          {facts.length > 0 && (
            <span className="rl-stream__facts">
              {facts.map((v, i) => {
                const changed = v.text !== base[i]?.text || v.unset !== base[i]?.unset
                return (
                  <span key={v.token} className={`rl-stream__fact${v.unset ? ' is-unset' : ''}${v.unset && depends ? ' is-needed' : ''}${changed ? ' is-whatif' : ''}`}>
                    <span className="rl-stream__factlabel">{SHORT[v.token] ?? v.label}</span>
                    <span className="rl-stream__factmark" aria-hidden>
                      <ValueMark v={v} size={12} />
                    </span>
                    <span className="rl-stream__facttext" title={v.unset ? 'Not stated' : v.text}>
                      {v.unset ? 'Not stated' : v.text}
                    </span>
                  </span>
                )
              })}
            </span>
          )}
        </button>
        {/* The stream's way out — and, once landed, the handle a what-if is dragged by. */}
        <button
          type="button"
          className={`rl-stream__handle${landed ? ' is-live' : ''}${dragging ? ' is-dragging' : ''}`}
          data-card
          style={{ top: G.SRC_PORT - 8 }}
          aria-label="Drag onto a network or device to re-route the stream"
          title={landed ? 'Drag onto a network or device' : undefined}
          disabled={!landed}
          onPointerDown={onHandleDown}
        />
      </div>
      {landed && (
        <div className="rl-stream__tray" data-card role="group" aria-label="What if">
          <p className="rl-stream__trayhead">
            What if <span>· drag the handle, or press</span>
          </p>
          {groupsShown.map((g) => {
            const chips = g === 'from' ? FROM_CHIPS : g === 'device' ? DEVICE_CHIPS : RISK_CHIPS
            return (
              <div key={g} className="rl-stream__chipset">
                <span className="rl-stream__chiplabel">{g === 'from' ? 'From' : g === 'device' ? 'Device' : 'Risk'}</span>
                <span className="rl-stream__chips">
                  {chips.map((c) => {
                    const key = `${g}:${c.id}`
                    const on = now[g] === c.id
                    const mine = own[g] === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`rl-stream__chip${on ? ' is-on' : ''}${mine ? ' is-own' : ''}${over === key ? ' is-over' : ''}`}
                        data-whatif={key}
                        aria-pressed={on}
                        title={mine ? 'The sign-in as run' : `What if ${c.label}`}
                        onClick={() => set(g, c.id)}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
