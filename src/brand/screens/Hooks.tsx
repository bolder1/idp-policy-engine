import { useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Info, Link2, Plus, RefreshCw, Webhook, Zap } from 'lucide-react'

import { PageHead } from '../Shell'
import { Badge, Button, Callout, DeleteButton, Modal, TipDot } from '../kit'
import { Picker } from '../picker'
import { useBrand } from '../store'
import { EmptyState } from '../empty'
import { deleteImpact, policiesUsing } from './usage'
import { UsedByList } from './used-by'
import { ConfirmDelete } from './confirm-delete'
import { useLeaveGuard } from '../leave-guard'
import { firstInvalidField, hookDirty, hookEditImpact } from './hook-form'
import { PageBar } from './page-bar'
import {
  FAILURE_LABEL,
  MAX_TIMEOUT_MS,
  SLOW_TIMEOUT_MS,
  validateHook,
  type Hook,
  type HookField,
  type HookIssue,
  type HookMode,
  type OnFailure,
} from '../hooks'

/* -----------------------------------------------------------------------------
   External hooks — the library screen.

   A condition the engine cannot answer on its own, answered by a system that
   can. Shaped like Zones: a named object, written once, referenced from rules
   across many policies, so every card names the policies that use it.

   The failure behaviour is always stated, on the card and in the form, because
   it decides what sign-ins get on the day the endpoint is down.
   -------------------------------------------------------------------------- */

const MODE: Record<HookMode, { label: string; blurb: string; icon: typeof Zap }> = {
  sync: {
    label: 'Synchronous',
    blurb: 'Called during sign-in. The answer decides the condition.',
    icon: Zap,
  },
  'attribute-sync': {
    label: 'Attribute sync',
    blurb: 'Pulls values into user profiles on a schedule. Rules read them as attributes.',
    icon: RefreshCw,
  },
}

/* What each answer does during an outage, in one plain line each. */
const FAILURE_HINT: Record<OnFailure, string> = {
  'fail-open': 'The condition counts as not matched. A rule that denies stops denying.',
  'fail-closed': 'The sign-in is refused. An outage at the endpoint blocks sign-in.',
}

export function Hooks() {
  const store = useBrand()
  const [editing, setEditing] = useState<Hook | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Hook | null>(null)

  const save = (h: Hook) => {
    if (h.id && store.hooks.some((x) => x.id === h.id)) store.updateHook(h)
    else store.addHook(h)
    setEditing(null)
    store.showToast(`${h.name.trim()} saved.`)
  }

  const remove = (h: Hook) => {
    store.removeHook(h.id)
    setConfirmDelete(null)
    store.showToast(`${h.name} deleted.`)
  }

  return (
    <div className="bpage bhk">
      <PageHead title="External hooks" caption="Rule conditions answered by an outside system." />

      {/* New hook on the bar, where every library keeps its primary action —
          see `PageBar`. Withheld while the empty state offers the same action. */}
      {store.hooks.length > 0 && (
        <PageBar
          right={
            <Button variant="brand" onClick={() => setEditing(blank())}>
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              New hook
            </Button>
          }
        />
      )}

      {store.hooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No hooks yet"
          blurb="Add a hook to let a rule check an outside system, like a fraud score."
          action={
            <Button variant="brand" onClick={() => setEditing(blank())}>
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              New hook
            </Button>
          }
        />
      ) : (
        <ul className="bhk__list">
          {store.hooks.map((h) => {
            const users = policiesUsing('webhook', h.id, store.policies)
            const issues = validateHook(h, store.hooks)
            const Icon = MODE[h.mode].icon
            return (
              <li key={h.id} className="bhk__card">
                <div className="bhk__cardhead">
                  <span className={`bhk__tile is-${h.mode}`} aria-hidden>
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <div className="bhk__cardname">
                    <h3>{h.name}</h3>
                    {h.description && <TipDot text={h.description} label={`About ${h.name}`} />}
                  </div>
                  <Badge tone="neutral">{MODE[h.mode].label}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(h)}>
                    Edit
                  </Button>
                  <DeleteButton onClick={() => setConfirmDelete(h)} />
                </div>

                <div className="bhk__facts">
                  <Fact label="Endpoint" wide>
                    {h.mode === 'sync' ? `${h.method} ${h.url}` : h.url}
                  </Fact>
                  {h.mode === 'sync' && <Fact label="Response field">{h.responsePath || 'None'}</Fact>}
                  {h.mode === 'sync' && (
                    <Fact label="Timeout" className={h.timeoutMs > SLOW_TIMEOUT_MS ? 'is-slow' : ''}>
                      {h.timeoutMs} ms
                    </Fact>
                  )}
                  {h.mode === 'attribute-sync' && (
                    <Fact label="Freshness limit">
                      {h.maxAgeHours ? `${h.maxAgeHours} hour${h.maxAgeHours === 1 ? '' : 's'}` : 'No limit'}
                    </Fact>
                  )}
                  <Fact label="When it does not answer" className={`is-${h.onFailure}`}>
                    {FAILURE_LABEL[h.onFailure]}
                  </Fact>
                  <Fact label="Credential header">{h.authHeader?.trim() || 'None'}</Fact>
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

                {/* Named, not counted: the list says where to go before a change. */}
                <div className="bhk__uses">
                  <span className="bhk__useshead">
                    <Link2 size={13} strokeWidth={2} aria-hidden />
                    Used by
                  </span>
                  {users.length === 0 ? (
                    <p className="bhk__usesnone">No policy uses this hook.</p>
                  ) : (
                    <UsedByList users={users} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <HookForm hook={editing} onClose={() => setEditing(null)} onSave={save} />

      {/* One dialog for every library delete. It moves any live policy that
          uses the hook to draft (a system policy blocks it), and names the
          drafts that will need another one. */}
      <ConfirmDelete
        open={!!confirmDelete}
        name={confirmDelete?.name ?? ''}
        noun="hook"
        impact={confirmDelete ? deleteImpact('webhook', confirmDelete.id, store.policies) : undefined}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />
    </div>
  )
}

function Fact({ label, children, className = '', wide }: { label: string; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <span className={`bhk__fact ${wide ? 'is-wide' : ''} ${className}`}>
      <strong>{label}</strong>
      {children}
    </span>
  )
}

/* --- The form ------------------------------------------------------------------ */

/* No id: the store gives a new hook one nothing else has (`newId`). */
function blank(): Hook {
  return {
    id: '',
    name: '',
    mode: 'sync',
    url: '',
    method: 'POST',
    timeoutMs: 300,
    responsePath: '',
    /* Seeded to the safer of the two. The form still shows both. */
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
  const store = useBrand()
  const uid = useId()
  const form = useRef<HTMLDivElement | null>(null)
  const [seed, setSeed] = useState<Hook | null>(hook)
  const [draft, setDraft] = useState<Hook>(hook ?? blank())
  const [tried, setTried] = useState(false)

  /* Re-seeded every time the form opens, by the identity of what was opened.
     It used to re-seed only when the id changed, so Cancel or Discard left the
     edits in place and they came back when the same hook was reopened. Closing
     sets `hook` to null, so any reopening is a new identity. The draft is kept
     while closed, so the dialog's exit animation doesn't flash an empty form. */
  if (hook !== seed) {
    setSeed(hook)
    if (hook) {
      setDraft(hook)
      setTried(false)
    }
  }

  const set = (p: Partial<Hook>) => setDraft((d) => ({ ...d, ...p }))
  const saved = draft.id ? store.hooks.find((x) => x.id === draft.id) : undefined
  const issues = validateHook(draft, store.hooks)
  const impact = hookEditImpact(saved, draft, store.policies)
  const firstError = impact.modeError ?? issues.find((i) => i.level === 'error')?.detail ?? null
  const dirty = !!hook && hookDirty(hook, draft)

  /* Save stays enabled. Pressing it with errors shows each one under its field
     and moves focus to the first. Before that, only warnings show: an error on
     a field nobody has typed in yet is noise. */
  const attemptSave = (): boolean => {
    if (firstError) {
      setTried(true)
      const field = firstInvalidField(issues)
      const selector = impact.modeError ? `[data-field="mode"] input:checked` : field ? `[data-field="${field}"]` : null
      if (selector) window.setTimeout(() => form.current?.querySelector<HTMLElement>(selector)?.focus(), 0)
      return false
    }
    onSave(draft)
    return true
  }

  /* Esc, a click outside or the close button ask before typed changes are lost.
     Cancel is an explicit discard. */
  const confirmLeave = useLeaveGuard({
    dirty,
    save: () => {
      if (firstError) return false
      onSave(draft)
      return true
    },
    saveLabel: 'Save hook',
    blocked: firstError,
  })

  const shown = (field: HookField) => issues.filter((i) => i.field === field && (i.level === 'warning' || tried))
  const invalid = (field: HookField) => tried && issues.some((i) => i.field === field && i.level === 'error')
  const msgId = (field: string) => `${uid}-${field}`
  const described = (field: HookField) => (shown(field).length > 0 ? msgId(field) : undefined)

  return (
    <Modal
      open={!!hook}
      onClose={() => confirmLeave(onClose)}
      title={saved ? `Edit ${saved.name}` : 'New hook'}
      width={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={attemptSave}>
            Save hook
          </Button>
        </>
      }
    >
      <div className="bhk__form" ref={form}>
        <label className="bhk__field">
          <span>Name</span>
          <input
            data-field="name"
            value={draft.name}
            maxLength={80}
            aria-invalid={invalid('name') || undefined}
            aria-describedby={described('name')}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Fraud score lookup"
          />
          <FieldIssues id={msgId('name')} issues={shown('name')} />
        </label>

        <label className="bhk__field">
          <span>Description</span>
          <textarea
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Owner and purpose"
          />
        </label>

        <fieldset className="bhk__modes" data-field="mode" aria-describedby={impact.modeError ? msgId('mode') : undefined}>
          <legend>How it is called</legend>
          {(Object.keys(MODE) as HookMode[]).map((m) => {
            const Icon = MODE[m].icon
            return (
              <label key={m} className={draft.mode === m ? 'is-on' : ''}>
                <input type="radio" name={`${uid}-mode`} checked={draft.mode === m} onChange={() => set({ mode: m })} />
                <Icon size={15} strokeWidth={1.8} aria-hidden />
                <span>
                  <strong>{MODE[m].label}</strong>
                  <em>{MODE[m].blurb}</em>
                </span>
              </label>
            )
          })}
          {impact.modeError && (
            <FieldIssues id={msgId('mode')} issues={[{ level: 'error', detail: impact.modeError }]} />
          )}
        </fieldset>

        <div className="bhk__row">
          <label className="bhk__field bhk__field--method">
            <span>Method</span>
            <Picker
              label="HTTP method"
              width="fill"
              value={draft.method}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
              ]}
              onChange={(v) => set({ method: v as Hook['method'] })}
            />
          </label>
          <label className="bhk__field">
            <span>Endpoint</span>
            <input
              data-field="url"
              value={draft.url}
              aria-invalid={invalid('url') || undefined}
              aria-describedby={described('url')}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://risk.internal/api/v2/score"
            />
            <FieldIssues id={msgId('url')} issues={shown('url')} />
          </label>
        </div>

        <label className="bhk__field">
          <span>
            Credential header
            <em>Header name only.</em>
          </span>
          <input value={draft.authHeader ?? ''} onChange={(e) => set({ authHeader: e.target.value })} placeholder="X-Risk-Token" />
        </label>

        {draft.mode === 'sync' ? (
          <div className="bhk__row">
            <label className="bhk__field">
              <span>
                Response field
                <em>Dotted path in the JSON response.</em>
              </span>
              <input
                data-field="responsePath"
                value={draft.responsePath}
                aria-invalid={invalid('responsePath') || undefined}
                aria-describedby={described('responsePath')}
                onChange={(e) => set({ responsePath: e.target.value })}
                placeholder="result.highRisk"
              />
              <FieldIssues id={msgId('responsePath')} issues={shown('responsePath')} />
            </label>
            <label className="bhk__field bhk__field--num">
              <span>Timeout (ms)</span>
              <input
                data-field="timeoutMs"
                type="number"
                min={1}
                max={MAX_TIMEOUT_MS}
                step={50}
                value={Number.isFinite(draft.timeoutMs) ? draft.timeoutMs : ''}
                aria-invalid={invalid('timeoutMs') || undefined}
                aria-describedby={described('timeoutMs')}
                onChange={(e) => set({ timeoutMs: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
              />
            </label>
          </div>
        ) : (
          <label className="bhk__field bhk__field--num">
            <span>
              Freshness limit (hours)
              <em>Leave empty for no limit.</em>
            </span>
            <input
              data-field="maxAgeHours"
              type="number"
              min={1}
              step={1}
              value={draft.maxAgeHours ?? ''}
              aria-invalid={invalid('maxAgeHours') || undefined}
              aria-describedby={described('maxAgeHours')}
              onChange={(e) => set({ maxAgeHours: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </label>
        )}
        {/* The timeout sits in a narrow column, so its messages go full width under the row. */}
        {draft.mode === 'sync' ? (
          <FieldIssues id={msgId('timeoutMs')} issues={shown('timeoutMs')} />
        ) : (
          <FieldIssues id={msgId('maxAgeHours')} issues={shown('maxAgeHours')} />
        )}

        {/* Both answers stated by their consequence, not as "fail-open" and
            "fail-closed", which read opposite ways depending on the reader. */}
        <fieldset className="bhk__modes bhk__modes--fail">
          <legend>When it does not answer</legend>
          {(['fail-open', 'fail-closed'] as OnFailure[]).map((f) => (
            <label key={f} className={draft.onFailure === f ? 'is-on' : ''}>
              <input type="radio" name={`${uid}-fail`} checked={draft.onFailure === f} onChange={() => set({ onFailure: f })} />
              <span>
                <strong>{FAILURE_LABEL[f]}</strong>
                <em>{FAILURE_HINT[f]}</em>
              </span>
            </label>
          ))}
        </fieldset>

        {impact.liveChanged.length > 0 && (
          <Callout tone="notice" title="Live policies use this hook">
            Saving changes sign-ins for {impact.liveChanged.join(', ')}.
          </Callout>
        )}
      </div>
    </Modal>
  )
}

/* Under the field it belongs to. Hidden from the label's text, so the input's
   name stays "Name"; the input points at it with aria-describedby instead. */
function FieldIssues({ id, issues }: { id: string; issues: Pick<HookIssue, 'level' | 'detail'>[] }) {
  if (issues.length === 0) return null
  return (
    <span id={id} className="bhk__fieldissues" aria-hidden>
      {issues.map((iss) => (
        <span key={iss.detail} className={`bhk__fieldissue is-${iss.level}`}>
          {iss.level === 'error' ? <AlertTriangle size={13} strokeWidth={2} aria-hidden /> : <Info size={13} strokeWidth={2} aria-hidden />}
          {iss.detail}
        </span>
      ))}
    </span>
  )
}
