import { useMemo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

import type { Policy } from '../data'
import { useBrand } from '../store'
import { impactOf } from './diagnostics'
import { runGauntlet } from './gauntlet'
import { SITUATIONS, compare, sweep } from './impact-arena'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   The publish gate.

   Four modules already answer part of "is this safe to ship" — the linter, the
   gauntlet, the situation sweep and the app assignment. Read separately they
   are four screens nobody opens before pressing Publish. Collected here they
   are a checklist that names its own blockers, and every row links to the
   surface that can clear it.

   Nothing on this panel is computed twice or cached: each row is derived from
   the draft on every render, so a fix applied anywhere in the builder shows up
   here without anything needing to invalidate anything.
   -------------------------------------------------------------------------- */

/* --- Readiness -----------------------------------------------------------------

   The publish gate. Four questions, each answered by a module that already
   exists — the linter, the gauntlet, the sweep, the app assignment — and each
   row is a link to the screen that can fix it. This is the only place in the
   prototype where all four are on screen at once, which is the argument for
   v5 existing at all.
   ------------------------------------------------------------------------- */

export function Readiness({
  draft,
  saved,
  env,
  blockers,
  onOpen,
  onJump,
}: {
  draft: Policy
  saved: Policy
  env: SimEnv
  blockers: number
  onOpen: (d: 'gauntlet' | 'impact') => void
  onJump: (i: number) => void
}) {
  const store = useBrand()
  // The tenant's overruled expectations count here too — a readiness row that
  // ignored them would keep reporting a hole the tenant has already ruled is
  // not one.
  const overrides = store.gauntletOverrides[draft.id] ?? {}
  const gauntlet = useMemo(() => runGauntlet(draft, env, overrides), [draft, env, overrides])
  const after = useMemo(() => sweep(draft, env, 570), [draft, env])
  const dirty = JSON.stringify(saved.rules) !== JSON.stringify(draft.rules)
  const movement = useMemo(() => (dirty ? compare(sweep(saved, env, 570), after) : null), [dirty, saved, env, after])

  const dead = draft.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => r.enabled && after.reach[i] === 0)
  const app = draft.appId ? store.appById(draft.appId) : null

  const impact = draft.rules.length > 0 ? impactOf(draft, 0, store.groups) : null

  return (
    <div className="bm__ready">
      <Row
        ok={blockers === 0}
        title={blockers === 0 ? 'No blocking errors' : `${blockers} error${blockers === 1 ? '' : 's'} to fix`}
        detail={blockers === 0 ? 'Nothing the linter can prove wrong.' : 'Publishing is blocked until these are resolved.'}
      />

      <Row
        ok={gauntlet.breaches === 0}
        title={
          gauntlet.breaches === 0
            ? `Gauntlet ${gauntlet.grade} — nothing got through`
            : `Gauntlet ${gauntlet.grade} — ${gauntlet.breaches} got through`
        }
        detail={
          gauntlet.breaches === 0
            ? gauntlet.gradeReason
            : `${gauntlet.held} of ${gauntlet.rounds.length} cards landed as expected. The rest are named in the gauntlet, with the rule that decided each one.`
        }
        action={{ label: 'Open the gauntlet', run: () => onOpen('gauntlet') }}
      />

      <Row
        ok={!movement || movement.looser === 0}
        title={
          !movement
            ? 'Nothing unpublished'
            : movement.looser > 0
              ? `${movement.looser} situation${movement.looser === 1 ? '' : 's'} loosened`
              : `${movement.changed} situation${movement.changed === 1 ? '' : 's'} tightened`
        }
        detail={
          movement
            ? `${movement.changed} of ${SITUATIONS.length.toLocaleString()} modelled situations change treatment.`
            : 'The draft matches what is live.'
        }
        action={{ label: 'Open the blast radius', run: () => onOpen('impact') }}
      />

      <Row
        ok={dead.length === 0}
        title={dead.length === 0 ? 'Every rule catches something' : `${dead.length} rule${dead.length === 1 ? '' : 's'} catch nothing`}
        detail={
          dead.length === 0
            ? 'Each enabled rule wins at least one modelled situation.'
            : dead.map(({ r, i }) => `Rule ${i + 1} · ${r.name}`).join(', ')
        }
        action={dead.length > 0 ? { label: `Open rule ${dead[0].i + 1}`, run: () => onJump(dead[0].i) } : undefined}
      />

      <Row
        ok={app !== null}
        title={app ? `Protects ${app.name}` : 'No application chosen'}
        detail={
          app
            ? 'Every sign-in to it is checked against these rules.'
            : 'These rules are saved but never evaluated — nothing reaches them.'
        }
        action={{ label: 'Choose the application', run: () => store.go({ name: 'policy-details', policyId: draft.id }) }}
      />

      {/* The single-user test went with the docked tester: both dealt one
          hypothetical sign-in at unsaved rules, which is the gauntlet with one
          row and cases nobody thought about. */}
      {impact && (
        <p className="bm__readyfoot">
          Rule 1 reaches an audience of {impact.audience.toLocaleString()}.{' '}
          <button type="button" onClick={() => onOpen('gauntlet')}>
            Run the gauntlet
          </button>{' '}
          to deal thirteen sign-ins at these rules.
        </p>
      )}
    </div>
  )
}

function Row({
  ok,
  title,
  detail,
  action,
}: {
  ok: boolean
  title: string
  detail: string
  action?: { label: string; run: () => void }
}) {
  return (
    <div className={`bm__readyrow ${ok ? 'is-ok' : 'is-open'}`}>
      <span className="bm__readymark" aria-hidden>
        {ok ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.2} />}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {action && (
          <button type="button" onClick={action.run}>
            {action.label} →
          </button>
        )}
      </div>
    </div>
  )
}
