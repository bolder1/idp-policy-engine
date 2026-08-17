import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'

import { AppGlyph, Badge, Button, Callout, Field, OutcomeChip } from '../components/ui'
import { type IpRange } from '../engine/model'
import { useStore } from '../state/store'

/* -----------------------------------------------------------------------------
   Named objects — IP ranges and Locations.

   These are the only two reusable objects the engine actually has. The earlier
   prototype's Zones screen warned "changes apply immediately to all referencing
   policies" and then showed neither which policies nor what would change, which
   makes a one-character CIDR typo an org-wide lockout with no warning. Here the
   blast radius is computed and named before anything is written.
   -------------------------------------------------------------------------- */

export function NamedObjects() {
  const store = useStore()
  const [selectedId, setSelectedId] = useState(store.ranges[0]?.id ?? '')
  const [draft, setDraft] = useState<IpRange | null>(null)

  const selected = store.ranges.find((r) => r.id === selectedId)
  const working = draft ?? selected

  const dependents = useMemo(
    () =>
      store.policies.filter(
        (p) => p.adaptive.enabled && p.adaptive.ip.enabled && p.adaptive.ip.rangeIds.includes(selectedId),
      ),
    [store.policies, selectedId],
  )

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(selected)

  function select(id: string) {
    setSelectedId(id)
    setDraft(null)
  }

  function commit() {
    if (!draft) return
    store.saveRange(draft)
    store.showToast(
      dependents.length > 0
        ? `${draft.name} saved — ${dependents.length} polic${dependents.length === 1 ? 'y' : 'ies'} updated`
        : `${draft.name} saved`,
    )
    setDraft(null)
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="page__title">IP ranges & locations</h1>
          <p className="page__sub">
            Named boundaries referenced by policy conditions. Editing one changes every policy
            that points at it, so the affected policies are listed before you save — not after.
          </p>
        </div>
      </header>

      <div className="obj">
        <aside className="obj__list">
          <p className="obj__group">IP ranges</p>
          {store.ranges.map((r) => {
            const uses = store.policies.filter(
              (p) => p.adaptive.enabled && p.adaptive.ip.enabled && p.adaptive.ip.rangeIds.includes(r.id),
            ).length
            return (
              <button
                key={r.id}
                type="button"
                className={`obj__item ${selectedId === r.id ? 'is-on' : ''}`}
                onClick={() => select(r.id)}
              >
                <span>{r.name}</span>
                <em>{uses > 0 ? `${uses} polic${uses === 1 ? 'y' : 'ies'}` : 'unused'}</em>
              </button>
            )
          })}

          <p className="obj__group" style={{ marginTop: 16 }}>
            Locations
          </p>
          {store.locations.map((l) => {
            const uses = store.policies.filter(
              (p) =>
                p.adaptive.enabled &&
                p.adaptive.location.enabled &&
                p.adaptive.location.entries.some((e) => e.locationId === l.id),
            ).length
            return (
              <div key={l.id} className="obj__item obj__item--static">
                <span>{l.name}</span>
                <em>{uses > 0 ? `${uses} polic${uses === 1 ? 'y' : 'ies'}` : 'unused'}</em>
              </div>
            )
          })}
        </aside>

        <div className="obj__detail">
          {working && (
            <>
              <div className="obj__head">
                <h2>{working.name}</h2>
                <Badge>{working.format}</Badge>
                <span className="obj__uses">
                  Referenced by {dependents.length} polic{dependents.length === 1 ? 'y' : 'ies'}
                </span>
              </div>

              <Field label="Entries" hint="One IPv4 address, range or CIDR block per line.">
                <textarea
                  rows={5}
                  value={working.entries.join('\n')}
                  onChange={(e) =>
                    setDraft({
                      ...working,
                      entries: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>

              {/* The impact preview only exists once something has changed —
                  showing a blast radius for a no-op would train people to
                  ignore it. */}
              <AnimatePresence>
                {dirty && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="obj__impact">
                      <Callout tone="warn">
                        <div>
                          <strong>
                            {dependents.length === 0
                              ? 'Nothing references this range yet.'
                              : `${dependents.length} polic${dependents.length === 1 ? 'y' : 'ies'} will change the moment you save.`}
                          </strong>
                          {dependents.length > 0 && ' Each one evaluates this range on every sign-in.'}
                        </div>
                      </Callout>

                      {dependents.length > 0 && (
                        <ul className="obj__dependents">
                          {dependents.map((p) => {
                            const app = store.appById(p.appId)
                            const group = store.groupById(p.groupId)
                            return (
                              <li key={p.id}>
                                <span className="matrix__apphead">
                                  <AppGlyph glyph={app.glyph} tint={app.tint} size={15} />
                                  {app.name}
                                </span>
                                <span className="obj__dep-group">{group.name}</span>
                                <span className="obj__dep-mode">
                                  {p.adaptive.ip.rangeAction === 'allow'
                                    ? 'only from these ranges'
                                    : 'never from these ranges'}
                                </span>
                                <OutcomeChip action={p.adaptive.action} size="sm" />
                                <button
                                  className="linkbtn"
                                  onClick={() => store.go({ name: 'builder', policyId: p.id })}
                                >
                                  Open →
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="obj__foot">
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={!dirty}>
                  Discard
                </Button>
                <Button variant="primary" onClick={commit} disabled={!dirty}>
                  {dependents.length > 0 && dirty
                    ? `Save — updates ${dependents.length} polic${dependents.length === 1 ? 'y' : 'ies'}`
                    : 'Save changes'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
