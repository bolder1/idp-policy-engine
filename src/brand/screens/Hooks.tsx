import { useState } from 'react'
import { AlertTriangle, Info, Link2, Plus, RefreshCw, Trash2, Webhook, Zap } from 'lucide-react'

import { PageHead } from '../Shell'
import { Badge, Button, Modal } from '../kit'
import { useBrand } from '../store'
import type { Policy } from '../data'
import {
  FAILURE_BLURB,
  FAILURE_LABEL,
  SLOW_TIMEOUT_MS,
  canSaveHook,
  describeHook,
  validateHook,
  type Hook,
  type HookMode,
  type OnFailure,
} from '../hooks'

/* -----------------------------------------------------------------------------
   External hooks — the library screen.

   Problem 7, from Lenskart and the Oberoi Group: a condition the engine cannot
   answer on its own, answered by a system that can.

   The screen is shaped like Zones rather than like a settings page, because a
   hook is the same kind of thing: a named object, written once, referenced from
   rules across many policies, and dangerous to edit precisely because of that.
   So it gets what zones get — a list with the fan-out on every row, and a
   "used by" that names the policies rather than counting them.

   --- What this screen refuses to let you skip -------------------------------

   The failure behaviour. There is no default selected, and the form will not
   save until it has been answered, because the alternative is what the product
   had before this existed: a hook-gated rule whose behaviour on the day the
   endpoint is down is whatever the implementation happened to do. Both answers
   are defensible and they are opposite, which is exactly why the tenant has to
   pick rather than inherit one.
   -------------------------------------------------------------------------- */

const MODE: Record<HookMode, { label: string; blurb: string; icon: typeof Zap }> = {
  sync: {
    label: 'Synchronous',
    blurb: 'Called during the sign-in. The answer decides the condition, and the wait is inside the login.',
    icon: Zap,
  },
  'attribute-sync': {
    label: 'Attribute sync',
    blurb: 'Pulls values into the user profile on a schedule. Rules then read them as ordinary attributes — nothing to wait for at sign-in.',
    icon: RefreshCw,
  },
}

export function Hooks() {
  const store = useBrand()
  const [editing, setEditing] = useState<Hook | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Hook | null>(null)

  const save = (h: Hook) => {
    if (store.hooks.some((x) => x.id === h.id)) store.updateHook(h)
    else store.addHook(h)
    setEditing(null)
    store.showToast(`${h.name} saved`)
  }

  return (
    <div className="bpage bhk">
      <PageHead
        title="External hooks"
        caption="A condition the engine cannot answer itself, answered by a system that can."
        actions={
          <Button variant="brand" onClick={() => setEditing(blank())}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            New hook
          </Button>
        }
      />

      {store.hooks.length === 0 ? (
        <div className="bhk__empty">
          <span aria-hidden>
            <Webhook size={26} strokeWidth={1.6} />
          </span>
          <h2>No hooks yet</h2>
          <p>
            Every condition available to a rule today is decided from data this console already holds. A hook lets a
            rule ask something else — an entitlement system, a fraud model, a rostering service — and use the answer.
          </p>
          <Button variant="brand" onClick={() => setEditing(blank())}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Create your first hook
          </Button>
        </div>
      ) : (
        <ul className="bhk__list">
          {store.hooks.map((h) => {
            const users = policiesUsing(h.id, store.policies)
            const issues = validateHook(h)
            const Icon = MODE[h.mode].icon
            return (
              <li key={h.id} className="bhk__card">
                <div className="bhk__cardhead">
                  <span className={`bhk__tile is-${h.mode}`} aria-hidden>
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <div className="bhk__cardname">
                    <h3>{h.name}</h3>
                    <p>{describeHook(h)}</p>
                  </div>
                  <Badge tone={h.mode === 'sync' ? 'info' : 'accent'}>{MODE[h.mode].label}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(h)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(h)}>
                    <Trash2 size={14} strokeWidth={1.9} aria-hidden />
                    Delete
                  </Button>
                </div>

                {h.description && <p className="bhk__why">{h.description}</p>}

                <div className="bhk__facts">
                  {/* The failure behaviour is a fact about the hook on the same
                      level as its address, not a setting buried in its form.
                      It is the one property that decides what happens on the
                      worst day this object will have. */}
                  <span className={`bhk__fact is-${h.onFailure}`}>
                    <strong>If it does not answer</strong>
                    {FAILURE_LABEL[h.onFailure]}
                  </span>
                  {h.mode === 'sync' && (
                    <span className={`bhk__fact ${h.timeoutMs > SLOW_TIMEOUT_MS ? 'is-slow' : ''}`}>
                      <strong>Gives up after</strong>
                      {h.timeoutMs}ms
                    </span>
                  )}
                  {h.mode === 'attribute-sync' && (
                    <span className="bhk__fact">
                      <strong>Data trusted for</strong>
                      {h.maxAgeHours ? `${h.maxAgeHours}h` : 'no limit set'}
                    </span>
                  )}
                  <span className="bhk__fact">
                    <strong>Credential travels in</strong>
                    {h.authHeader ?? 'no header set'}
                  </span>
                </div>

                {issues.map((iss) => (
                  <p key={iss.title} className={`bhk__issue is-${iss.level}`}>
                    {iss.level === 'error' ? (
                      <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                    ) : (
                      <Info size={13} strokeWidth={2} aria-hidden />
                    )}
                    <span>
                      <strong>{iss.title}.</strong> {iss.detail}
                    </span>
                  </p>
                ))}

                {/* Used by, named. Same contract as zones and fingerprints: a
                    count tells you a change is dangerous, a list tells you
                    where to go and read before making it. */}
                <div className="bhk__uses">
                  <span className="bhk__useshead">
                    <Link2 size={13} strokeWidth={2} aria-hidden />
                    Used by
                  </span>
                  {users.length === 0 ? (
                    <p className="bhk__usesnone">
                      No rule references this hook. It can be changed or deleted without affecting any sign-in.
                    </p>
                  ) : (
                    <ul>
                      {users.map((u) => (
                        <li key={u.policy.id}>
                          <strong>{u.policy.name}</strong>
                          <span>{u.rules.join(' · ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <HookForm hook={editing} onClose={() => setEditing(null)} onSave={save} />

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? 'hook'}?`}
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) store.removeHook(confirmDelete.id)
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="bhk__confirm">
          {confirmDelete && policiesUsing(confirmDelete.id, store.policies).length > 0
            ? `${policiesUsing(confirmDelete.id, store.policies).length} policy rule set references this hook. Those conditions will point at nothing, and the checks will report each one as an error until they are fixed.`
            : 'No rule references this hook, so nothing else changes.'}
        </p>
      </Modal>
    </div>
  )
}

/* --- The form ------------------------------------------------------------------ */

function blank(): Hook {
  return {
    id: `hk-${Date.now()}`,
    name: '',
    mode: 'sync',
    url: '',
    method: 'POST',
    timeoutMs: 300,
    responsePath: '',
    /* Deliberately seeded to the safer of the two rather than left undefined:
       the type has no "unset", and a form that opens on fail-closed and is
       never touched produces a hook that refuses sign-ins rather than one that
       waves them through. The panel below still makes both explicit. */
    onFailure: 'fail-closed',
  }
}

function HookForm({
  hook,
  onClose,
  onSave,
}: {
  hook: Hook | null
  onClose: () => void
  onSave: (h: Hook) => void
}) {
  const [draft, setDraft] = useState<Hook>(hook ?? blank())
  const [key, setKey] = useState('')

  // Re-seed when a different hook is opened, without a useEffect: the key IS
  // the identity, and comparing it here happens before the first paint.
  if (hook && key !== hook.id) {
    setKey(hook.id)
    setDraft(hook)
  }

  const set = (p: Partial<Hook>) => setDraft((d) => ({ ...d, ...p }))
  const issues = validateHook(draft)
  const errors = issues.filter((i) => i.level === 'error')

  return (
    <Modal
      open={!!hook}
      onClose={onClose}
      title={hook && hook.name ? `Edit ${hook.name}` : 'New hook'}
      width={640}
      footer={
        <>
          <span className="bdlg-foot__note">
            {errors.length > 0 ? `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix first` : 'Referenced by name from any rule.'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!canSaveHook(draft)} onClick={() => onSave(draft)}>
            Save hook
          </Button>
        </>
      }
    >
      <div className="bhk__form">
        <label className="bhk__field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Fraud score lookup" />
        </label>

        <label className="bhk__field">
          <span>Why this hook exists</span>
          <textarea
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Who owns the endpoint, and what it knows that this console does not."
          />
        </label>

        <fieldset className="bhk__modes">
          <legend>How it is called</legend>
          {(Object.keys(MODE) as HookMode[]).map((m) => {
            const Icon = MODE[m].icon
            return (
              <label key={m} className={draft.mode === m ? 'is-on' : ''}>
                <input type="radio" name="hook-mode" checked={draft.mode === m} onChange={() => set({ mode: m })} />
                <Icon size={15} strokeWidth={1.8} aria-hidden />
                <span>
                  <strong>{MODE[m].label}</strong>
                  <em>{MODE[m].blurb}</em>
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="bhk__row">
          <label className="bhk__field bhk__field--method">
            <span>Method</span>
            <select value={draft.method} onChange={(e) => set({ method: e.target.value as Hook['method'] })}>
              <option>GET</option>
              <option>POST</option>
            </select>
          </label>
          <label className="bhk__field">
            <span>Endpoint</span>
            <input value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://risk.internal/api/v2/score" />
          </label>
        </div>

        <label className="bhk__field">
          <span>
            Credential header
            <em>The header name only. The secret itself is stored separately and never travels in an exported policy.</em>
          </span>
          <input value={draft.authHeader ?? ''} onChange={(e) => set({ authHeader: e.target.value })} placeholder="X-Risk-Token" />
        </label>

        {draft.mode === 'sync' ? (
          <div className="bhk__row">
            <label className="bhk__field">
              <span>
                Response field
                <em>Dotted path into the JSON answer. The rule tests whatever this points at.</em>
              </span>
              <input value={draft.responsePath} onChange={(e) => set({ responsePath: e.target.value })} placeholder="result.highRisk" />
            </label>
            <label className="bhk__field bhk__field--num">
              <span>Timeout</span>
              <input
                type="number"
                min={0}
                step={50}
                value={draft.timeoutMs}
                onChange={(e) => set({ timeoutMs: Number(e.target.value) })}
              />
            </label>
          </div>
        ) : (
          <label className="bhk__field bhk__field--num">
            <span>
              Trust synced data for
              <em>Past this, a rule reading the synced attributes is reading something nobody has confirmed.</em>
            </span>
            <input
              type="number"
              min={0}
              value={draft.maxAgeHours ?? 0}
              onChange={(e) => set({ maxAgeHours: Number(e.target.value) })}
            />
          </label>
        )}

        {/* The decision this screen exists to force. Both options are stated in
            full, in their consequences rather than their names, because
            "fail-open" and "fail-closed" are jargon that reverse meaning
            depending on whether you are thinking about the gate or the traffic. */}
        <fieldset className="bhk__modes bhk__modes--fail">
          <legend>When it does not answer</legend>
          {(['fail-open', 'fail-closed'] as OnFailure[]).map((f) => (
            <label key={f} className={draft.onFailure === f ? 'is-on' : ''}>
              <input type="radio" name="hook-fail" checked={draft.onFailure === f} onChange={() => set({ onFailure: f })} />
              <span>
                <strong>{FAILURE_LABEL[f]}</strong>
                <em>{FAILURE_BLURB[f]}</em>
              </span>
            </label>
          ))}
        </fieldset>

        {issues.length > 0 && (
          <ul className="bhk__formissues">
            {issues.map((iss) => (
              <li key={iss.title} className={`is-${iss.level}`}>
                <strong>{iss.title}.</strong> {iss.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/* --- Helpers -------------------------------------------------------------------- */

/* The same shape as the zone and fingerprint versions, deliberately. Three
   library objects answering "what depends on me" in three different ways is
   three things for an admin to learn instead of one. */
function policiesUsing(hookId: string, policies: Policy[]) {
  return policies
    .map((policy) => ({
      policy,
      rules: policy.rules
        .filter((r) => r.conditions.some((c) => c.typeId === 'webhook' && c.values.includes(hookId)))
        .map((r) => r.name),
    }))
    .filter((x) => x.rules.length > 0)
}
