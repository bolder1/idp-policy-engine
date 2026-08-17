import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

import { AnimatedNumber, AppGlyph, Badge, Button, Callout, OutcomeChip } from '../components/ui'
import { enabledRestrictions } from '../engine/model'
import { resolve } from '../engine/weight'
import { useStore } from '../state/store'

/* -----------------------------------------------------------------------------
   "Why this policy won".

   The engine's documented behaviour is that when a user belongs to several
   groups, "a weight-based algorithm finds the policy with the highest score",
   and custom groups outrank the DEFAULT group. That score is never shown to an
   admin anywhere in the product, and the Adaptive Authentication Report does
   not record which policy applied — so today this question is unanswerable.

   This screen answers it. It is pure UI over arithmetic the engine already
   performs.
   -------------------------------------------------------------------------- */

export function Resolution({ userId, appId }: { userId: string; appId: string }) {
  const store = useStore()
  const user = store.users.find((u) => u.id === userId) ?? store.users[0]
  const app = store.appById(appId)

  const resolution = useMemo(
    () => resolve(store.policies, store.groups, user.groupIds, appId),
    [store.policies, store.groups, user.groupIds, appId],
  )

  // Weights count up in parallel, then the winner settles. The race is the
  // explanation: you watch the scores separate rather than being told a result.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    setRevealed(false)
    const t = window.setTimeout(() => setRevealed(true), 120)
    return () => window.clearTimeout(t)
  }, [userId, appId])

  const max = Math.max(1, ...resolution.ranked.map((r) => r.weight.total))

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Why this policy won</h1>
          <p className="page__sub">
            {user.name} belongs to {user.groupIds.length} groups. Every policy binding{' '}
            {app.name} to one of those groups matches this sign-in — but only one decides it.
          </p>
        </div>
        <div className="page__actions">
          <select
            value={userId}
            onChange={(e) => store.go({ name: 'resolution', userId: e.target.value, appId })}
          >
            {store.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select
            value={appId}
            onChange={(e) => store.go({ name: 'resolution', userId, appId: e.target.value })}
          >
            {store.apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <Button onClick={() => store.go({ name: 'coverage' })}>Back to coverage</Button>
        </div>
      </header>

      <div className="res__subject">
        <span className="res__avatar">{user.name.slice(0, 1)}</span>
        <div>
          <strong>{user.name}</strong>
          <span className="res__groups">
            {user.groupIds.map((g) => (
              <Badge key={g} tone={store.groupById(g).isDefault ? 'neutral' : 'brand'}>
                {store.groupById(g).name}
              </Badge>
            ))}
          </span>
        </div>
        <span className="res__arrow">→</span>
        <span className="matrix__apphead">
          <AppGlyph glyph={app.glyph} tint={app.tint} size={20} />
          <strong>{app.name}</strong>
        </span>
      </div>

      {resolution.ranked.length === 0 ? (
        <Callout tone="warn">
          <div>
            <strong>No policy binds {app.name} to any of {user.name}’s groups.</strong> The sign-in
            is ungoverned — nothing evaluates it, and nothing is logged about it.
          </div>
        </Callout>
      ) : (
        <>
          <div className="res__cards">
            {resolution.ranked.map((r, i) => {
              const isWinner = resolution.winner?.policy.id === r.policy.id
              const conditions = r.policy.adaptive.enabled
                ? enabledRestrictions(r.policy.adaptive)
                : []
              return (
                <motion.div
                  key={r.policy.id}
                  className={`rcard ${isWinner ? 'is-winner' : 'is-loser'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: revealed ? (isWinner ? 1 : 0.66) : 0,
                    y: 0,
                    scale: revealed && isWinner ? 1 : 0.985,
                  }}
                  transition={{
                    delay: i * 0.07,
                    type: 'spring',
                    stiffness: 420,
                    damping: 32,
                  }}
                >
                  <div className="rcard__head">
                    <span className="rcard__rank">{i + 1}</span>
                    <div className="rcard__titles">
                      <strong>{r.policy.name}</strong>
                      <span>
                        {r.group.name}
                        {r.group.isDefault && ' · fallback group'}
                        {conditions.length > 0 &&
                          ` · ${conditions.length} condition${conditions.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {isWinner ? (
                      <span className="rcard__crown">Decides this sign-in</span>
                    ) : r.policy.status === 'shadow' ? (
                      <Badge tone="proposed">shadow — never enforces</Badge>
                    ) : (
                      <span className="rcard__out">Outranked</span>
                    )}
                  </div>

                  <div className="rcard__score">
                    <div className="rcard__bar">
                      <motion.div
                        className={`rcard__fill ${isWinner ? 'is-winner' : ''}`}
                        initial={{ width: 0 }}
                        animate={{ width: revealed ? `${(r.weight.total / max) * 100}%` : 0 }}
                        transition={{ delay: 0.16 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                    <span className="rcard__total">
                      <AnimatedNumber value={revealed ? r.weight.total : 0} />
                    </span>
                  </div>

                  <ul className="rcard__factors">
                    {r.weight.factors.map((f) => (
                      <li key={f.label}>
                        <span className="rcard__f-points">
                          {f.points > 0 ? `+${f.points}` : f.points}
                        </span>
                        <span className="rcard__f-label">{f.label}</span>
                        <span className="rcard__f-detail">{f.detail}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="rcard__foot">
                    <OutcomeChip
                      action={r.policy.adaptive.enabled ? r.policy.adaptive.action : 'allow'}
                      size="sm"
                    />
                    <button
                      className="linkbtn"
                      onClick={() => store.go({ name: 'builder', policyId: r.policy.id })}
                    >
                      Open policy →
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {resolution.tiebreak && (
            <div className="res__tiebreak">
              <Callout tone="info">{resolution.tiebreak}</Callout>
            </div>
          )}

          <p className="res__caveat">
            Scores are this console's reconstruction of the engine's weighting, shown so the
            outcome is inspectable. The engine computes the authoritative value; surfacing the
            breakdown at all is the change being proposed.
          </p>
        </>
      )}
    </div>
  )
}
