import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, Swords, Target } from 'lucide-react'

import { Button, DecisionChip, TipDot } from '../kit'
import type { Policy, PolicyStatus } from '../data'
import { useBrand, useNameLookup } from '../store'
import { ruleSentence } from './builder-dialogs'
import { describeChanges } from './changes'
import { diagnose } from './diagnostics'
import { runGauntlet } from './gauntlet'
import { SITUATIONS, compare, sweep } from './impact-arena'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   Review — the last stop on the trail, not a modal.

   It used to be a dialog you met after pressing Publish, which put the summary
   of a policy behind the decision to ship it. On the trail it is a place you can
   stand: reachable at any time, showing the same four questions the publish gate
   asks, the rules as sentences, and what this draft changes about the live one.

   Nothing here is a second opinion. Every number comes from the module that owns
   it — the linter, the gauntlet, the sweep — so this screen cannot disagree with
   the one that produced it.
   -------------------------------------------------------------------------- */

export function ReviewStep({
  draft,
  saved,
  env,
  onJump,
  onOpen,
  onPublish,
}: {
  draft: Policy
  saved: Policy
  env: SimEnv
  onJump: (i: number) => void
  onOpen: (d: 'gauntlet' | 'impact' | 'apps' | 'test') => void
  /** The status to publish into. Monitor is offered wherever it is the safer first move. */
  onPublish: (status: PolicyStatus) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  const overrides = store.gauntletOverrides[draft.id] ?? {}
  const gauntlet = useMemo(() => runGauntlet(draft, env, overrides), [draft, env, overrides])
  const after = useMemo(() => sweep(draft, env, 570), [draft, env])
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const rulesDirty = JSON.stringify(saved.rules) !== JSON.stringify(draft.rules)
  const movement = useMemo(
    () => (rulesDirty ? compare(sweep(saved, env, 570), after) : null),
    [rulesDirty, saved, env, after],
  )

  const diagnostics = diagnose(draft, store.groups, store.hooks)
  const errors = diagnostics.filter((d) => d.severity === 'error' && draft.rules[d.ruleIndex]?.enabled !== false)
  const dead = draft.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => r.enabled && after.reach[i] === 0)
  const attached = draft.allApps === true || draft.appIds.length > 0
  const changes = dirty ? describeChanges(saved, draft) : []

  const resolve = useNameLookup()

  const gates: Gate[] = [
    {
      id: 'errors',
      ok: errors.length === 0,
      title: errors.length === 0 ? 'No blocking errors' : `${errors.length} error${errors.length === 1 ? '' : 's'} to fix`,
      detail: errors.length === 0 ? 'Nothing the linter can prove wrong.' : errors[0].title,
      go: errors.length > 0 ? { label: `Open rule ${errors[0].ruleIndex + 1}`, run: () => onJump(errors[0].ruleIndex) } : undefined,
      blocking: true,
    },
    {
      id: 'gauntlet',
      ok: gauntlet.breaches === 0,
      title: gauntlet.breaches === 0 ? `Gauntlet ${gauntlet.grade} — nothing got through` : `Gauntlet ${gauntlet.grade} — ${gauntlet.breaches} got through`,
      detail: gauntlet.breaches === 0 ? gauntlet.gradeReason : `${gauntlet.held} of ${gauntlet.rounds.length} cards landed as expected.`,
      go: { label: 'Run the gauntlet', run: () => onOpen('gauntlet') },
    },
    {
      id: 'movement',
      ok: !movement || movement.looser === 0,
      title: !movement
        ? 'Nothing unpublished'
        : movement.looser > 0
          ? `${movement.looser} situation${movement.looser === 1 ? '' : 's'} loosened`
          : `${movement.changed} situation${movement.changed === 1 ? '' : 's'} tightened`,
      detail: movement
        ? `${movement.changed} of ${SITUATIONS.length.toLocaleString()} modelled situations change treatment.`
        : 'The draft matches what is live.',
      go: { label: 'Open the blast radius', run: () => onOpen('impact') },
    },
    {
      id: 'dead',
      ok: dead.length === 0,
      title: dead.length === 0 ? 'Every rule catches something' : `${dead.length} rule${dead.length === 1 ? '' : 's'} catch nothing`,
      detail: dead.length === 0 ? 'Each enabled rule wins at least one modelled situation.' : dead.map(({ r, i }) => `Rule ${i + 1} · ${r.name}`).join(', '),
      go: dead.length > 0 ? { label: `Open rule ${dead[0].i + 1}`, run: () => onJump(dead[0].i) } : undefined,
    },
    {
      id: 'apps',
      ok: attached,
      title: attached ? 'Attached to applications' : 'No applications attached',
      detail: attached
        ? draft.allApps
          ? 'Every app in the tenant, including ones added later.'
          : `${draft.appIds.length} app${draft.appIds.length === 1 ? '' : 's'}.`
        : 'These rules are saved but never evaluated.',
      go: { label: 'Assign apps', run: () => onOpen('apps') },
    },
  ]

  const cleared = gates.filter((g) => g.ok).length

  return (
    <div className="bf__review">
      {/* --- The gate ------------------------------------------------------- */}
      <div className="bf__gate">
        <div className="bf__gatetrack" aria-hidden>
          <motion.span
            initial={false}
            animate={{ width: `${(cleared / gates.length) * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.2, 0, 0, 1] }}
            className={cleared === gates.length ? 'is-clear' : ''}
          />
        </div>
        <p className="bf__gatecount">
          <strong>
            {cleared} of {gates.length}
          </strong>{' '}
          checks clear
        </p>
      </div>

      <ul className="bf__gates">
        {gates.map((g) => (
          <li key={g.id} className={g.ok ? 'is-ok' : g.blocking ? 'is-block' : 'is-open'}>
            <span className="bf__gatemark" aria-hidden>
              {g.ok ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.2} />}
            </span>
            <span className="bf__gatetext">
              <strong>{g.title}</strong>
              <em>{g.detail}</em>
            </span>
            {g.go && (
              <button type="button" className="bf__gatego" onClick={g.go.run}>
                {g.go.label} <ArrowRight size={12} strokeWidth={2} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* --- What changes --------------------------------------------------- */}
      {changes.length > 0 && (
        <section className="bf__revblock">
          <h3 className="u-label">What publishing changes</h3>
          <ul className="bf__revchanges">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* --- The policy, read end to end ------------------------------------ */}
      <section className="bf__revblock">
        <h3 className="u-label">
          The policy, in order
          <TipDot text="Each sentence comes from the same renderer the editor uses, so the two cannot disagree." />
        </h3>
        <ol className="bf__revrules">
          {draft.rules.map((rule, i) => {
            const { iff, then } = ruleSentence(rule, resolve)
            return (
              <li key={rule.id} className={rule.enabled ? '' : 'is-off'}>
                <button type="button" onClick={() => onJump(i)}>
                  <span className="bf__revn">{i + 1}</span>
                  <span className="bf__revbody">
                    <strong>
                      {rule.name}
                      <DecisionChip decision={rule.decision} size="sm" />
                    </strong>
                    <em>
                      <b>IF</b> {iff}
                    </em>
                    <em>
                      <b>THEN</b> {then}
                    </em>
                  </span>
                </button>
              </li>
            )
          })}
          <li className="is-fallback">
            <span className="bf__revn">—</span>
            <span className="bf__revbody">
              <strong>
                Default rule
                <DecisionChip decision="1fa" size="sm" />
              </strong>
              <em>Anyone who reaches this point signs in with one factor.</em>
            </span>
          </li>
        </ol>
      </section>

      {/* --- Ship ------------------------------------------------------------ */}
      <footer className="bf__revfoot">
        <div className="bf__revfootacts">
          <Button variant="secondary" icon={Swords} onClick={() => onOpen('gauntlet')}>
            Gauntlet
          </Button>
          <Button variant="secondary" icon={Target} onClick={() => onOpen('impact')}>
            Blast radius
          </Button>
        </div>
        {/* Two doors, and which two depends on where the policy already is.

            A policy that has never been live gets monitor offered first and
            given the quieter button: it is the safer move, not the recommended
            one, and making it primary would be the product overruling a tenant
            who has read their own checks and decided.

            A policy already in monitor gets the opposite pair — the useful next
            question there is "has it been watched long enough", and the answer
            that moves it forward is enforcement. */}
        {errors.length > 0 ? (
          <Button variant="primary" disabled>
            {errors.length} error{errors.length === 1 ? '' : 's'} to fix
          </Button>
        ) : (
          <div className="bf__revship">
            {draft.status === 'inactive' && (
              <Button variant="secondary" disabled={!dirty} onClick={() => onPublish('monitor')}>
                Publish in monitor
              </Button>
            )}
            {draft.status === 'monitor' && (
              <Button variant="secondary" disabled={!dirty} onClick={() => onPublish('monitor')}>
                Keep monitoring
              </Button>
            )}
            <Button variant="primary" disabled={!dirty} onClick={() => onPublish('active')}>
              {!dirty
                ? 'Nothing to publish'
                : draft.status === 'monitor'
                  ? 'Start enforcing'
                  : 'Publish and enforce'}
            </Button>
          </div>
        )}
        {draft.status === 'inactive' && errors.length === 0 && dirty && (
          <p className="bf__revmonitor">
            Monitor evaluates every sign-in and records what it would have done, without refusing anything. The
            Decision log fills up; nobody is locked out by a rule you have not watched yet.
          </p>
        )}
      </footer>
    </div>
  )
}

interface Gate {
  id: string
  ok: boolean
  title: string
  detail: string
  go?: { label: string; run: () => void }
  /** Only an error stops Publish. The rest are findings, not gates. */
  blocking?: boolean
}
