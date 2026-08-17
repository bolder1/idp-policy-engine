import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useMemo, useState } from 'react'

import {
  AnimatedNumber,
  AppGlyph,
  Badge,
  Button,
  Callout,
  Field,
  OutcomeChip,
  ProposedBadge,
  Segmented,
  Toggle,
} from '../components/ui'
import { signInHistory, normalizeUserId } from '../data/seed'
import { evaluatePolicy, formatMinutes } from '../engine/evaluate'
import {
  type AdaptiveAction,
  type ChallengeType,
  type FirstFactor,
  type MfaMethod,
  type Policy,
  type RestrictionKey,
  CHALLENGE_TYPE_DETAIL,
  CHALLENGE_TYPE_LABEL,
  FIRST_FACTOR_LABEL,
  MFA_METHOD_LABEL,
  RESTRICTION_LABEL,
  enabledRestrictions,
  firstFactorSupports,
} from '../engine/model'
import { describeConditions, summarizePolicy } from '../engine/summarize'
import { useStore } from '../state/store'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDER: RestrictionKey[] = ['ip', 'device', 'location', 'time']

export function Builder({ policyId }: { policyId: string }) {
  const store = useStore()
  const original = store.policyById(policyId)
  const [draft, setDraft] = useState<Policy | null>(original ?? null)
  const [review, setReview] = useState(false)

  if (!draft || !original) {
    return (
      <div className="page">
        <p>That policy no longer exists.</p>
        <Button onClick={() => store.go({ name: 'coverage' })}>Back to policies</Button>
      </div>
    )
  }

  const app = store.appById(draft.appId)
  const group = store.groupById(draft.groupId)
  const supports = firstFactorSupports(draft.firstFactor)
  const isNew = !store.policies.some((p) => p.id === draft.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  const set = (patch: Partial<Policy>) => setDraft({ ...draft, ...patch })
  const setAdaptive = (patch: Partial<Policy['adaptive']>) =>
    setDraft({ ...draft, adaptive: { ...draft.adaptive, ...patch } })

  const sentence = summarizePolicy(draft, app, group, store.ranges, store.locations)
  const active = draft.adaptive.enabled ? enabledRestrictions(draft.adaptive) : []
  const available = ORDER.filter((k) => !active.includes(k))

  function toggleRestriction(key: RestrictionKey, on: boolean) {
    setAdaptive({ [key]: { ...draft!.adaptive[key], enabled: on } } as Partial<Policy['adaptive']>)
  }

  function save() {
    store.savePolicy(draft!)
    store.showToast(`${draft!.name} saved`)
    setReview(false)
    store.go({ name: 'coverage' })
  }

  return (
    <div className="builder">
      {/* ---- header ---- */}
      <header className="builder__bar">
        <button className="builder__back" onClick={() => store.go({ name: 'coverage' })}>
          ← Policies
        </button>

        <div className="builder__identity">
          <span className="builder__pair">
            <AppGlyph glyph={app.glyph} tint={app.tint} size={18} />
            {app.name}
            <em>×</em>
            {group.name}
            {group.isDefault && <Badge>fallback</Badge>}
          </span>
          <input
            className="builder__name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            aria-label="Policy name"
          />
        </div>

        <div className="builder__actions">
          {isNew ? (
            <span className="builder__dirty">Not created yet</span>
          ) : (
            dirty && <span className="builder__dirty">Unsaved changes</span>
          )}
          <Button onClick={() => store.go({ name: 'simulate', policyId: draft.id })}>Simulate</Button>
          {/* Always available: reviewing is a read, and an admin who wants to
              re-read what a live policy does should not have to edit it first. */}
          <Button variant="primary" onClick={() => setReview(true)}>
            {isNew ? 'Review & create' : 'Review & Save'}
          </Button>
        </div>
      </header>

      {/* ---- the live sentence ---- */}
      <div className="builder__sentence">
        <span className="builder__sentence-label">In plain English</span>
        <p>{sentence}</p>
      </div>

      <div className="builder__body">
        <div className="builder__canvas">
          {/* ---- 1. sign-in ---- */}
          <Section index={1} title="Sign-in" caption="How the user proves who they are.">
            <Segmented<FirstFactor>
              name="first-factor"
              value={draft.firstFactor}
              onChange={(v) => {
                const s = firstFactorSupports(v)
                set({
                  firstFactor: v,
                  mfa: s.mfa ? draft.mfa : { enabled: false, methods: [], userManaged: false },
                  adaptive: s.adaptive ? draft.adaptive : { ...draft.adaptive, enabled: false },
                })
              }}
              options={(['password', 'passwordless', 'magic-link'] as FirstFactor[]).map((v) => ({
                value: v,
                label: FIRST_FACTOR_LABEL[v],
              }))}
            />
            <AnimatePresence>
              {supports.reason && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ paddingTop: 10 }}>
                    <Callout tone="info">{supports.reason}</Callout>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* ---- 2. second factor ---- */}
          <Section
            index={2}
            title="Second factor"
            caption="An extra step on every sign-in, before any conditions are considered."
            control={
              <Toggle
                checked={draft.mfa.enabled}
                disabled={!supports.mfa}
                label="Require a second factor"
                onChange={(v) => set({ mfa: { ...draft.mfa, enabled: v } })}
              />
            }
            dimmed={!supports.mfa}
          >
            <AnimatePresence initial={false}>
              {draft.mfa.enabled && supports.mfa && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="chips" style={{ paddingTop: 4 }}>
                    {(Object.keys(MFA_METHOD_LABEL) as MfaMethod[]).map((m) => {
                      const on = draft.mfa.methods.includes(m)
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`chip ${on ? 'is-on' : ''}`}
                          onClick={() =>
                            set({
                              mfa: {
                                ...draft.mfa,
                                methods: on
                                  ? draft.mfa.methods.filter((x) => x !== m)
                                  : [...draft.mfa.methods, m],
                              },
                            })
                          }
                        >
                          {MFA_METHOD_LABEL[m]}
                        </button>
                      )
                    })}
                  </div>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={draft.mfa.userManaged}
                      onChange={(e) => set({ mfa: { ...draft.mfa, userManaged: e.target.checked } })}
                    />
                    Let users manage their own second-factor settings
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* ---- 3. conditions ---- */}
          <Section
            index={3}
            title="Conditions"
            caption="Watch for a change in behaviour, then act on it."
            control={
              <Toggle
                checked={draft.adaptive.enabled}
                disabled={!supports.adaptive}
                label="Enable adaptive conditions"
                onChange={(v) => setAdaptive({ enabled: v })}
              />
            }
            dimmed={!supports.adaptive}
          >
            <AnimatePresence initial={false}>
              {draft.adaptive.enabled && supports.adaptive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  <LayoutGroup>
                    {active.length > 0 && (
                      <div className="conds">
                        {/* The conjunction is ONE control governing every enabled
                            block, drawn as a brace so its scope is unambiguous by
                            construction. The engine does not permit mixing AND and
                            OR, so there is deliberately no per-pair toggle. */}
                        {active.length > 1 && (
                          <ConjunctionBrace
                            value={draft.adaptive.conjunction}
                            onChange={(c) => setAdaptive({ conjunction: c })}
                          />
                        )}
                        <div className={`conds__list ${active.length > 1 ? 'has-brace' : ''}`}>
                          {active.map((key) => (
                            <motion.div
                              key={key}
                              layout
                              layoutId={`cond-${key}`}
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                            >
                              <RestrictionBlock
                                blockKey={key}
                                draft={draft}
                                setAdaptive={setAdaptive}
                                onRemove={() => toggleRestriction(key, false)}
                              />
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {available.length > 0 && (
                      <div className="conds__add">
                        <span className="conds__add-label">
                          {active.length === 0 ? 'Add a condition' : 'Also watch for'}
                        </span>
                        {available.map((key) => (
                          <motion.button
                            key={key}
                            layoutId={`cond-${key}`}
                            type="button"
                            className="conds__add-chip"
                            onClick={() => toggleRestriction(key, true)}
                            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                          >
                            + {RESTRICTION_LABEL[key]}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </LayoutGroup>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* ---- 4. outcome ---- */}
          <AnimatePresence initial={false}>
            {draft.adaptive.enabled && supports.adaptive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <Section index={4} title="Outcome" caption="What happens when those conditions are met.">
                  <div className="outcomes">
                    {(['allow', 'challenge', 'deny'] as AdaptiveAction[]).map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={`outcome-opt outcome-opt--${a} ${
                          draft.adaptive.action === a ? 'is-active' : ''
                        }`}
                        onClick={() => setAdaptive({ action: a })}
                      >
                        <span className="outcome-opt__head">
                          <OutcomeChip
                            action={a}
                            size="sm"
                            layoutId={draft.adaptive.action === a ? `outcome-${draft.id}` : undefined}
                          />
                        </span>
                        <span className="outcome-opt__desc">
                          {a === 'allow' && 'Let the sign-in through unchanged.'}
                          {a === 'challenge' && 'Ask for one more proof before continuing.'}
                          {a === 'deny' && 'Block access. No prompt, no alternate path.'}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Progressive disclosure driven by the chosen action — the
                      Challenge Type field is meaningless unless Challenge is
                      selected, so it only exists then. */}
                  <AnimatePresence mode="wait">
                    {draft.adaptive.action === 'challenge' && (
                      <motion.div
                        key="challenge"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="subfield">
                          <Field label="Challenge type">
                            <div className="chips">
                              {(Object.keys(CHALLENGE_TYPE_LABEL) as ChallengeType[]).map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className={`chip ${draft.adaptive.challengeType === c ? 'is-on' : ''}`}
                                  onClick={() => setAdaptive({ challengeType: c })}
                                  title={CHALLENGE_TYPE_DETAIL[c]}
                                >
                                  {CHALLENGE_TYPE_LABEL[c]}
                                </button>
                              ))}
                            </div>
                          </Field>
                          <p className="subfield__detail">
                            {CHALLENGE_TYPE_DETAIL[draft.adaptive.challengeType]}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {draft.adaptive.action === 'deny' && (
                      <motion.div
                        key="deny"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="subfield">
                          <Field
                            label="Deny message"
                            hint="Shown to the user instead of the app. Say what to do next — a dead end generates a support ticket."
                          >
                            <textarea
                              rows={2}
                              value={draft.adaptive.denyMessage}
                              onChange={(e) => setAdaptive({ denyMessage: e.target.value })}
                            />
                          </Field>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ImpactRail draft={draft} />
      </div>

      <AnimatePresence>
        {review && (
          <ReviewDialog
            draft={draft}
            onCancel={() => setReview(false)}
            onConfirm={save}
            onStatus={(status) => setDraft({ ...draft, status })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- Section shell --------------------------------------------------------- */

function Section({
  index,
  title,
  caption,
  children,
  control,
  dimmed,
}: {
  index: number
  title: string
  caption: string
  children?: React.ReactNode
  control?: React.ReactNode
  dimmed?: boolean
}) {
  return (
    <motion.section layout className={`bsection ${dimmed ? 'is-dimmed' : ''}`}>
      <div className="bsection__head">
        <span className="bsection__index">{index}</span>
        <div className="bsection__titles">
          <h2>{title}</h2>
          <p>{caption}</p>
        </div>
        {control}
      </div>
      {children && <div className="bsection__body">{children}</div>}
    </motion.section>
  )
}

/* --- The conjunction brace -------------------------------------------------- */

function ConjunctionBrace({
  value,
  onChange,
}: {
  value: 'all' | 'any'
  onChange: (v: 'all' | 'any') => void
}) {
  return (
    <div className="brace">
      <div className={`brace__line brace__line--${value}`} aria-hidden />
      <button
        type="button"
        className={`brace__pill brace__pill--${value}`}
        onClick={() => onChange(value === 'all' ? 'any' : 'all')}
        aria-label={`Conditions are joined by ${value === 'all' ? 'AND — all must match' : 'OR — any may match'}. Activate to switch.`}
        title="The engine allows one conjunction across all conditions — AND or OR, never mixed."
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={value}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.13 }}
          >
            {value === 'all' ? 'AND' : 'OR'}
          </motion.span>
        </AnimatePresence>
      </button>
      <span className="brace__hint">
        {value === 'all' ? 'all must match' : 'any may match'}
      </span>
    </div>
  )
}

/* --- Restriction blocks ---------------------------------------------------- */

function RestrictionBlock({
  blockKey,
  draft,
  setAdaptive,
  onRemove,
}: {
  blockKey: RestrictionKey
  draft: Policy
  setAdaptive: (patch: Partial<Policy['adaptive']>) => void
  onRemove: () => void
}) {
  const store = useStore()
  const a = draft.adaptive

  return (
    <div className="cblock">
      <div className="cblock__head">
        <span className="cblock__title">{RESTRICTION_LABEL[blockKey]}</span>
        <button type="button" className="cblock__remove" onClick={onRemove} aria-label={`Remove ${RESTRICTION_LABEL[blockKey]} condition`}>
          Remove
        </button>
      </div>

      <div className="cblock__body">
        {blockKey === 'ip' && (
          <>
            <div className="row">
              <Segmented
                name="ip-mode"
                value={a.ip.rangeAction}
                onChange={(v) => setAdaptive({ ip: { ...a.ip, rangeAction: v } })}
                options={[
                  { value: 'allow', label: 'Only from these ranges' },
                  { value: 'deny', label: 'Never from these ranges' },
                ]}
              />
            </div>
            <div className="chips">
              {store.ranges.map((r) => {
                const on = a.ip.rangeIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`chip ${on ? 'is-on' : ''}`}
                    onClick={() =>
                      setAdaptive({
                        ip: {
                          ...a.ip,
                          rangeIds: on
                            ? a.ip.rangeIds.filter((x) => x !== r.id)
                            : [...a.ip.rangeIds, r.id],
                        },
                      })
                    }
                  >
                    {r.name}
                    <em>{r.entries.length}</em>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {blockKey === 'device' && (
          <>
            <div className="row">
              <Segmented
                name="device-mode"
                value={a.device.mode}
                onChange={(v) => setAdaptive({ device: { ...a.device, mode: v } })}
                options={[
                  { value: 'agentless', label: 'Agentless' },
                  { value: 'agent', label: 'Agent-based' },
                ]}
              />
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={a.device.restrictMobile}
                  onChange={(e) => setAdaptive({ device: { ...a.device, restrictMobile: e.target.checked } })}
                />
                Restrict mobile devices
              </label>
            </div>
            <div className="slider">
              <label htmlFor="risk">
                Risk Engine threshold
                <strong>{a.device.riskThreshold}</strong>
              </label>
              <input
                id="risk"
                type="range"
                min={0}
                max={100}
                value={a.device.riskThreshold}
                onChange={(e) =>
                  setAdaptive({ device: { ...a.device, riskThreshold: Number(e.target.value) } })
                }
              />
              <p className="field__hint">
                A device scoring {a.device.riskThreshold} or higher counts as a behaviour change.
              </p>
            </div>
          </>
        )}

        {blockKey === 'location' && (
          <div className="chips">
            {store.locations.map((l) => {
              const entry = a.location.entries.find((e) => e.locationId === l.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`chip ${entry ? 'is-on' : ''}`}
                  onClick={() =>
                    setAdaptive({
                      location: {
                        ...a.location,
                        entries: entry
                          ? a.location.entries.filter((e) => e.locationId !== l.id)
                          : [
                              ...a.location.entries,
                              { locationId: l.id, distance: 50, unit: 'KMS' as const, action: 'allow' as const },
                            ],
                      },
                    })
                  }
                >
                  {l.name}
                  {entry && <em>{entry.distance} km</em>}
                </button>
              )
            })}
          </div>
        )}

        {blockKey === 'time' && (
          <>
            <div className="row">
              <Segmented
                name="time-mode"
                value={a.time.action}
                onChange={(v) => setAdaptive({ time: { ...a.time, action: v } })}
                options={[
                  { value: 'allow', label: 'Permitted hours' },
                  { value: 'deny', label: 'Blocked hours' },
                ]}
              />
              <span className="timewindow">
                {formatMinutes(a.time.start)} – {formatMinutes(a.time.end)}
              </span>
            </div>
            <div className="row">
              <label className="minilabel">
                From
                <input
                  type="range"
                  min={0}
                  max={1439}
                  step={15}
                  value={a.time.start}
                  onChange={(e) => setAdaptive({ time: { ...a.time, start: Number(e.target.value) } })}
                />
              </label>
              <label className="minilabel">
                To
                <input
                  type="range"
                  min={0}
                  max={1439}
                  step={15}
                  value={a.time.end}
                  onChange={(e) => setAdaptive({ time: { ...a.time, end: Number(e.target.value) } })}
                />
              </label>
            </div>
            <div className="chips">
              {DAY_NAMES.map((d, i) => {
                const on = a.time.days.includes(i)
                return (
                  <button
                    key={d}
                    type="button"
                    className={`chip chip--day ${on ? 'is-on' : ''}`}
                    onClick={() =>
                      setAdaptive({
                        time: {
                          ...a.time,
                          days: on ? a.time.days.filter((x) => x !== i) : [...a.time.days, i].sort(),
                        },
                      })
                    }
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* --- Impact rail ----------------------------------------------------------- */

function ImpactRail({ draft }: { draft: Policy }) {
  const store = useStore()
  const group = store.groupById(draft.groupId)

  const impact = useMemo(() => {
    const relevant = signInHistory.filter((s) => {
      const uid = normalizeUserId(s.userId)
      const user = store.users.find((u) => u.id === uid)
      return s.appId === draft.appId && user?.groupIds.includes(draft.groupId)
    })
    const sample = relevant.length > 0 ? relevant : signInHistory
    const traces = sample.map((s) => evaluatePolicy(draft, s, store.ranges, store.locations))
    return {
      basis: relevant.length,
      total: sample.length,
      challenged: traces.filter((t) => t.outcome === 'challenge').length,
      denied: traces.filter((t) => t.outcome === 'deny').length,
    }
  }, [draft, store.ranges, store.locations, store.users])

  // Users in this group who are also covered by another policy for this app.
  const overlap = useMemo(() => {
    const others = store.policies.filter(
      (p) => p.appId === draft.appId && p.groupId !== draft.groupId && p.status !== 'inactive',
    )
    const affected = store.users.filter(
      (u) => u.groupIds.includes(draft.groupId) && others.some((o) => u.groupIds.includes(o.groupId)),
    )
    return { users: affected, policies: others }
  }, [draft.appId, draft.groupId, store.policies, store.users])

  return (
    <aside className="impact">
      <h3 className="impact__title">Impact</h3>

      <div className="impact__scope">
        <AnimatedNumber value={group.memberCount} className="impact__big" />
        <span>users in {group.name}</span>
      </div>

      <div className="impact__split">
        <div>
          <AnimatedNumber value={impact.challenged} />
          <span className="impact__k impact__k--challenge">challenged</span>
        </div>
        <div>
          <AnimatedNumber value={impact.denied} />
          <span className="impact__k impact__k--deny">blocked</span>
        </div>
        <div>
          <AnimatedNumber value={impact.total - impact.challenged - impact.denied} />
          <span className="impact__k impact__k--allow">straight through</span>
        </div>
      </div>

      <p className="impact__basis">
        {impact.basis > 0
          ? `Replayed against ${impact.basis} recent sign-in${impact.basis === 1 ? '' : 's'} for this app and group.`
          : `No recent sign-ins for this pair yet — replayed against ${impact.total} sign-ins from elsewhere as an indication only.`}
      </p>

      {overlap.users.length > 0 && (
        <div className="impact__overlap">
          <Callout tone="warn">
            <div>
              <strong>
                {overlap.users.length} user{overlap.users.length === 1 ? '' : 's'} also match{' '}
                {overlap.policies.length} other polic{overlap.policies.length === 1 ? 'y' : 'ies'}
              </strong>{' '}
              for {store.appById(draft.appId).name}. Only one can win.
              <button
                type="button"
                className="linkbtn"
                onClick={() =>
                  store.go({ name: 'resolution', userId: overlap.users[0].id, appId: draft.appId })
                }
              >
                See which, and why →
              </button>
            </div>
          </Callout>
        </div>
      )}
    </aside>
  )
}

/* --- Review dialog --------------------------------------------------------- */

function ReviewDialog({
  draft,
  onCancel,
  onConfirm,
  onStatus,
}: {
  draft: Policy
  onCancel: () => void
  onConfirm: () => void
  onStatus: (s: Policy['status']) => void
}) {
  const store = useStore()
  const app = store.appById(draft.appId)
  const group = store.groupById(draft.groupId)
  const clauses = draft.adaptive.enabled
    ? describeConditions(draft.adaptive, store.ranges, store.locations)
    : []
  const joiner = draft.adaptive.conjunction === 'all' ? 'AND' : 'OR'

  return (
    <motion.div
      className="scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="dialog"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog__head">
          <h2>Review before saving</h2>
          <button onClick={onCancel} aria-label="Close">×</button>
        </header>

        <div className="dialog__body">
          <p className="dialog__pair">
            <AppGlyph glyph={app.glyph} tint={app.tint} size={18} />
            {app.name} <em>×</em> {group.name}
          </p>

          <div className="review__block">
            <span className="review__label">Sign-in</span>
            <p>
              {FIRST_FACTOR_LABEL[draft.firstFactor]}
              {draft.mfa.enabled &&
                ` + ${draft.mfa.methods.map((m) => MFA_METHOD_LABEL[m]).join(' or ') || 'a second factor'}`}
            </p>
          </div>

          {clauses.length > 0 && (
            <div className="review__block">
              <span className="review__label">
                Conditions — joined by {joiner}
              </span>
              <ul className="review__clauses">
                {clauses.map((c, i) => (
                  <li key={c.key}>
                    {i > 0 && <em className={`review__joiner review__joiner--${draft.adaptive.conjunction}`}>{joiner}</em>}
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="review__block">
            <span className="review__label">Outcome</span>
            <OutcomeChip action={draft.adaptive.enabled ? draft.adaptive.action : 'allow'} size="lg" />
            {draft.adaptive.enabled && draft.adaptive.action === 'deny' && (
              <p className="review__deny">“{draft.adaptive.denyMessage}”</p>
            )}
          </div>

          <div className="review__block">
            <span className="review__label">
              Enforcement <ProposedBadge what="Shadow mode" />
            </span>
            <Segmented<Policy['status']>
              name="status"
              value={draft.status}
              onChange={onStatus}
              options={[
                { value: 'inactive', label: 'Off' },
                { value: 'shadow', label: 'Shadow' },
                { value: 'active', label: 'Enforcing' },
              ]}
            />
            <p className="field__hint" style={{ marginTop: 8 }}>
              {draft.status === 'inactive' && 'Saved but not evaluated. Nothing changes for users.'}
              {draft.status === 'shadow' &&
                'Evaluated on every sign-in and logged, but never enforced — so you can see what it would have done before it does it. This mode does not exist in the engine today.'}
              {draft.status === 'active' && 'Live. This policy will change what users experience on their next sign-in.'}
            </p>
          </div>
        </div>

        <footer className="dialog__foot">
          <Button variant="ghost" onClick={onCancel}>Go back and edit</Button>
          <Button variant="primary" onClick={onConfirm}>
            Save {draft.status === 'active' ? '& enforce' : draft.status === 'shadow' ? 'in shadow' : 'as off'}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  )
}
