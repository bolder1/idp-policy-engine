import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, FlaskConical, Target } from 'lucide-react'

import { Button, DecisionChip, TipDot } from '../kit'
import { FALLBACK_NAME, appsOf, fallbackRule, type Policy, type PolicyStatus } from '../data'
import { differsFromLive } from '../policy-draft'
import { useBrand, useNameLookup } from '../store'
import { ruleLabel, ruleSentence } from './predicate-prose'
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
  toPublish,
}: {
  draft: Policy
  saved: Policy
  /** Something to publish: the draft differs from what is live, or the policy has never been published. */
  toPublish: boolean
  env: SimEnv
  onJump: (i: number) => void
  onOpen: (d: 'gauntlet' | 'impact') => void
  /** The status to publish into: on (`active`) or kept off (`inactive`). */
  onPublish: (status: Extract<PolicyStatus, 'active' | 'inactive'>) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  /* Memoised, so a policy with no overrides does not rerun the gauntlet on every render. */
  const overrides = useMemo(() => store.gauntletOverrides[draft.id] ?? {}, [store.gauntletOverrides, draft.id])
  const gauntlet = useMemo(() => runGauntlet(draft, env, overrides), [draft, env, overrides])
  const after = useMemo(() => sweep(draft, env, 570), [draft, env])
  /* Rules AND the fallback. Comparing rules alone reported "The draft matches
     what is live" for a draft whose only edit was the default outcome. The
     audience too: it decides who reaches the rules. A policy that was never
     published has nothing live to compare with. */
  const live = saved.status !== 'draft'
  const rulesDirty =
    live && (differsFromLive(saved, draft) || JSON.stringify(saved.audience) !== JSON.stringify(draft.audience))
  const movement = useMemo(
    () => (rulesDirty ? compare(sweep(saved, env, 570), after) : null),
    [rulesDirty, saved, env, after],
  )

  const diagnostics = diagnose(draft, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints })
  const errors = diagnostics.filter((d) => d.severity === 'error' && draft.rules[d.ruleIndex]?.enabled !== false)
  const dead = draft.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => r.enabled && after.reach[i] === 0)
  const named = appsOf(draft, store.apps)
  /* Nothing leaves draft without an application (policy-draft.ts `committed`). */
  const noApps = draft.appIds.length === 0 && !draft.isSystem
  /* The store's status, not the draft's copy of it, which can be stale. */
  const status = saved.status
  const changes = toPublish ? describeChanges(saved, draft, store.groups, store.users) : []

  const resolve = useNameLookup()
  const fallback = draft.fallback ?? fallbackRule()

  const gates: Gate[] = [
    {
      id: 'errors',
      ok: errors.length === 0,
      title: errors.length === 0 ? 'No blocking errors' : `${errors.length} error${errors.length === 1 ? '' : 's'} to fix`,
      detail: errors.length === 0 ? 'Nothing the linter can prove wrong.' : errors[0].title,
      /* A policy-wide finding (ruleIndex -1) has no rule to open. */
      go: errors.length > 0 && errors[0].ruleIndex >= 0 ? { label: `Open rule ${errors[0].ruleIndex + 1}`, run: () => onJump(errors[0].ruleIndex) } : undefined,
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
      title: !live
        ? 'Not live yet'
        : !movement
          ? toPublish
            ? 'No situation changes'
            : 'Nothing unpublished'
          : movement.looser > 0
            ? `${movement.looser} situation${movement.looser === 1 ? '' : 's'} loosened`
            : 'Nothing loosened',
      detail: !live
        ? 'Nothing is live to compare with.'
        : movement
          ? `${movement.changed} of ${SITUATIONS.length.toLocaleString()} modelled situations change treatment.`
          : toPublish
            ? 'Every modelled situation is treated as it is now.'
            : 'The draft matches what is live.',
      go: { label: 'Open the blast radius', run: () => onOpen('impact') },
    },
    {
      id: 'dead',
      ok: dead.length === 0,
      title: dead.length === 0 ? 'Every rule catches something' : `${dead.length} rule${dead.length === 1 ? '' : 's'} catch nothing`,
      detail: dead.length === 0 ? 'Each enabled rule wins at least one modelled situation.' : dead.map(({ r, i }) => `Rule ${i + 1}, ${ruleLabel(r)}`).join('; '),
      go: dead.length > 0 ? { label: `Open rule ${dead[0].i + 1}`, run: () => onJump(dead[0].i) } : undefined,
    },
    {
      id: 'apps',
      /* The system policy names no application and covers them all. */
      ok: named.length > 0 || !!draft.isSystem,
      title: named.length > 0 ? `Protects ${named[0].name}${named.length > 1 ? ' and others' : ''}` : draft.isSystem ? 'Protects every application' : 'No applications',
      detail:
        named.length > 1 || (named.length === 0 && draft.isSystem)
          ? 'Every login to any of them is checked against these rules.'
          : named.length > 0
            ? 'Every login to it is checked against these rules.'
            : 'Assign one to turn this policy on.',
      go: draft.isSystem ? undefined : { label: 'Assign applications', run: () => store.go({ name: 'policy-details', policyId: draft.id, from: 'builder' }) },
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
        {/* Said, not counted: each check is listed below. */}
        <p className="bf__gatecount">{cleared === gates.length ? 'All checks clear' : 'Some checks need a look'}</p>
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
          <TipDot text="Rules run top to bottom. The first rule that matches decides." label="About the order" />
        </h3>
        <ol className="bf__revrules">
          {draft.rules.map((rule, i) => {
            const { who, iff, then } = ruleSentence(rule, resolve)
            return (
              <li key={rule.id} className={rule.enabled ? '' : 'is-off'}>
                <button type="button" onClick={() => onJump(i)}>
                  <span className="bf__revn">{i + 1}</span>
                  <span className="bf__revbody">
                    <strong>
                      {ruleLabel(rule)}
                      <DecisionChip decision={rule.decision} size="sm" />
                    </strong>
                    {/* Who on its own line, never inside If. Absent for everyone. */}
                    {who && (
                      <em>
                        <b>Who</b> {who}
                      </em>
                    )}
                    <em>
                      <b>If</b> {iff}
                    </em>
                    <em>
                      <b>Then</b> {then}
                    </em>
                  </span>
                </button>
              </li>
            )
          })}
          {/* The policy's own last rule, printed by the same renderer as the
              rows above. It used to say one factor whatever it did. */}
          <li className="is-fallback">
            <span className="bf__revn">—</span>
            <span className="bf__revbody">
              <strong>
                {FALLBACK_NAME}
                <DecisionChip decision={fallback.decision} size="sm" />
              </strong>
              <em>
                <b>If</b> no rule above matched
              </em>
              <em>
                <b>Then</b> {ruleSentence(fallback, resolve).then}
              </em>
            </span>
          </li>
        </ol>
      </section>

      {/* --- Ship ------------------------------------------------------------ */}
      <footer className="bf__revfoot">
        <div className="bf__revfootacts">
          <Button variant="secondary" icon={FlaskConical} onClick={() => onOpen('gauntlet')}>
            Gauntlet
          </Button>
          <Button variant="secondary" icon={Target} onClick={() => onOpen('impact')}>
            Blast radius
          </Button>
        </div>
        {/* Which doors depends on where the policy already is. Off or never
            published: publish and keep it off, or publish and turn it on — the
            same pair Review & save offers a draft. Already on: publish the
            changes, and it stays on. */}
        {errors.length > 0 ? (
          <Button variant="primary" disabled>
            Fix errors to publish
          </Button>
        ) : noApps ? (
          <Button variant="primary" disabled>
            Assign applications to publish
          </Button>
        ) : !toPublish ? (
          <Button variant="primary" disabled>
            Nothing to publish
          </Button>
        ) : status === 'active' || status === 'always-on' ? (
          <Button variant="primary" onClick={() => onPublish('active')}>
            Publish changes
          </Button>
        ) : (
          <div className="bf__revship">
            <Button variant="secondary" onClick={() => onPublish('inactive')}>
              Publish, keep off
            </Button>
            <Button variant="primary" onClick={() => onPublish('active')}>
              Publish and turn on
            </Button>
          </div>
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
