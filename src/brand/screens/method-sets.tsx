import { useEffect, useId, useState } from 'react'
import { AlertTriangle, Check, Copy, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'

import { Button, Modal } from '../kit'
import type { MethodSet, Policy } from '../data'
import { AUTH_METHODS, METHOD_TIERS, methodBlocker, methodByName, type AuthMethod } from '../methods'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   Method sets.

   What was here before could toggle methods on two seeded sets and had nowhere
   to put the result — no create, no rename, no description, no delete, and no
   answer to the only question anyone asks of a shared object: *what breaks if I
   change this*. It also rendered every one of the twenty-one methods as a
   toggle row in one 1,783px column, so the set you were editing was mostly off
   screen while you edited it.

   Three ideas fix it:

   · **Overview before editor.** Selecting a set shows what it resolves to, who
     references it, and what is wrong with it — before offering a single
     control. Editing is a deliberate second step, because a set referenced by
     four policies is not something to change by brushing past a toggle.

   · **The picker is a picker, not the catalogue.** Chosen methods sit at the
     top as removable chips; everything else is a searchable list underneath.
     The old screen made you scan twenty-one rows to find the two that were on.

   · **Consequences are stated at the point of the decision.** A set with an
     unusable method in it silently offers fewer options than it appears to; a
     set with nothing usable in it fails every sign-in that reaches it. Both are
     shown against the set, not left to be discovered by a policy author.
   -------------------------------------------------------------------------- */

/** Policies whose rules name this set. The link that makes a set shared. */
function referencedBy(set: MethodSet, policies: Policy[]) {
  const names = new Set(set.methods)
  return policies.filter((p) =>
    p.rules.some(
      (r) =>
        (r.secondFactorMethods ?? []).some((m) => names.has(m)) ||
        (r.methodChain ?? []).some((m) => names.has(m)),
    ),
  )
}

interface Resolved {
  method: AuthMethod
  blocker: string | null
}

function resolve(set: MethodSet): { found: Resolved[]; missing: string[] } {
  const found: Resolved[] = []
  const missing: string[] = []
  for (const name of set.methods) {
    const m = methodByName(name)
    // A name that resolves to nothing contributes nothing, silently — which is
    // exactly the failure method-sets.test.ts exists to catch at build time.
    if (!m) missing.push(name)
    else found.push({ method: m, blocker: methodBlocker(m) })
  }
  return { found, missing }
}

export function MethodSetsTab() {
  const store = useBrand()
  const [selId, setSelId] = useState<string | null>(store.methodSets[0]?.id ?? null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<MethodSet | null>(null)
  const [q, setQ] = useState('')

  const list = store.methodSets.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  const set = store.methodSets.find((s) => s.id === selId) ?? null

  // A set deleted from under the selection leaves the detail pane pointing at
  // nothing; fall back to whatever is now first.
  useEffect(() => {
    if (!set && store.methodSets.length > 0) setSelId(store.methodSets[0].id)
  }, [set, store.methodSets])

  return (
    <div className="bms">
      <aside className="bms__list">
        <div className="bms__search">
          <Search size={13} strokeWidth={2} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sets…" aria-label="Search method sets" />
        </div>

        <ul>
          {list.map((s) => {
            const { found, missing } = resolve(s)
            const broken = found.filter((f) => f.blocker).length + missing.length
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`bms__item ${s.id === selId ? 'is-on' : ''}`}
                  aria-current={s.id === selId}
                  onClick={() => {
                    setSelId(s.id)
                    setEditing(false)
                  }}
                >
                  <span className="bms__itemname">{s.name}</span>
                  <span className="bms__itemmeta">
                    {s.methods.length} method{s.methods.length === 1 ? '' : 's'}
                    {s.usedIn > 0 && <> · used {s.usedIn}×</>}
                  </span>
                  {broken > 0 && (
                    <span className="bms__itemwarn" title={`${broken} unusable in this set`}>
                      <AlertTriangle size={11} strokeWidth={2.2} aria-hidden />
                      {broken}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {list.length === 0 && <li className="bms__empty">Nothing matches “{q}”.</li>}
        </ul>

        <button type="button" className="bms__new" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2.2} aria-hidden /> New set
        </button>
      </aside>

      <section className="bms__detail">
        {!set ? (
          <div className="bms__blank">
            <ShieldCheck size={22} strokeWidth={1.6} aria-hidden />
            <h3>No method sets yet</h3>
            <p>A set is a named group of factors a policy rule can point at, instead of listing methods one by one in every rule.</p>
            <Button variant="brand" onClick={() => setCreating(true)}>
              Create the first set
            </Button>
          </div>
        ) : editing ? (
          <SetEditor
            key={set.id}
            set={set}
            onCancel={() => setEditing(false)}
            onSave={(next) => {
              store.updateMethodSet(next)
              setEditing(false)
              store.showToast(`${next.name} saved`)
            }}
          />
        ) : (
          <SetOverview
            set={set}
            onEdit={() => setEditing(true)}
            onDuplicate={() => {
              const copy: MethodSet = { ...set, id: `ms${Date.now()}`, name: `${set.name} (copy)`, usedIn: 0 }
              store.addMethodSet(copy)
              setSelId(copy.id)
              setEditing(true)
              store.showToast(`${copy.name} created`)
            }}
            onDelete={() => setConfirmDelete(set)}
          />
        )}
      </section>

      <CreateSetDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(s) => {
          store.addMethodSet(s)
          setSelId(s.id)
          setCreating(false)
          setEditing(true)
          store.showToast(`${s.name} created`)
        }}
      />

      <DeleteSetDialog
        set={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={(s) => {
          store.removeMethodSet(s.id)
          setConfirmDelete(null)
          store.showToast(`${s.name} deleted`)
        }}
      />
    </div>
  )
}

/* --- Overview ---------------------------------------------------------------- */

function SetOverview({
  set,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  set: MethodSet
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const store = useBrand()
  const { found, missing } = resolve(set)
  const usable = found.filter((f) => !f.blocker)
  const resistant = usable.filter((f) => f.method.tier === 'Phishing-resistant').length
  const users = referencedBy(set, store.policies)

  return (
    <>
      <header className="bms__head">
        <div>
          <h2>{set.name}</h2>
          <p>{set.description || <em>No description. Add one so the next person knows when to reach for this set.</em>}</p>
        </div>
        <div className="bms__headacts">
          <Button size="sm" onClick={onDuplicate}>
            <Copy size={13} strokeWidth={1.9} aria-hidden /> Duplicate
          </Button>
          <Button size="sm" onClick={onDelete}>
            <Trash2 size={13} strokeWidth={1.9} aria-hidden /> Delete
          </Button>
          <Button size="sm" variant="brand" onClick={onEdit}>
            Edit set
          </Button>
        </div>
      </header>

      <div className="bms__body">
        {/* The three facts that decide whether this set does what it says. */}
        <div className="bms__facts">
          <div>
            <strong>{usable.length}</strong>
            <span>usable now</span>
          </div>
          <div className={resistant === 0 ? 'is-warn' : 'is-good'}>
            <strong>{resistant}</strong>
            <span>phishing-resistant</span>
          </div>
          <div className={users.length > 0 ? 'is-live' : ''}>
            <strong>{users.length}</strong>
            <span>polic{users.length === 1 ? 'y' : 'ies'} referencing</span>
          </div>
        </div>

        {usable.length === 0 && (
          <p className="bms__alarm">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span>
              <strong>Nothing in this set can be used.</strong> Any rule pointing at it asks for a factor no
              user can complete, so every sign-in it governs fails rather than falling through.
            </span>
          </p>
        )}

        {missing.length > 0 && (
          <p className="bms__alarm">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span>
              <strong>{missing.length} name{missing.length === 1 ? '' : 's'} in this set no longer exist</strong> — {missing.join(', ')}. A
              renamed method leaves the set holding a string that resolves to nothing.
            </span>
          </p>
        )}

        <h3 className="u-label">What it resolves to</h3>
        <ul className="bms__resolved">
          {found.map(({ method, blocker }) => (
            <li key={method.id} className={blocker ? 'is-blocked' : ''}>
              <span className="bms__mark" aria-hidden>
                {blocker ? <X size={11} strokeWidth={2.6} /> : <Check size={11} strokeWidth={3} />}
              </span>
              <span className="bms__mname">
                <strong>{method.name}</strong>
                <em>{method.tier} · {method.channel}</em>
              </span>
              {blocker ? <span className="bms__blocker">{blocker}</span> : <span className="bms__ok">Available</span>}
            </li>
          ))}
          {found.length === 0 && <li className="bms__empty">This set is empty.</li>}
        </ul>

        <h3 className="u-label">Where it is used</h3>
        {users.length === 0 ? (
          <p className="bms__note">
            No policy rule currently names a method from this set. It is safe to change — and worth asking
            whether it is worth keeping.
          </p>
        ) : (
          <ul className="bms__users">
            {users.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => store.go({ name: 'builder', policyId: p.id })}>
                  {p.name}
                </button>
                <em>
                  {p.rules.length} rule{p.rules.length === 1 ? '' : 's'} · {p.status}
                </em>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/* --- Editor ------------------------------------------------------------------- */

function SetEditor({ set, onCancel, onSave }: { set: MethodSet; onCancel: () => void; onSave: (s: MethodSet) => void }) {
  const uid = useId()
  const [name, setName] = useState(set.name)
  const [description, setDescription] = useState(set.description ?? '')
  const [methods, setMethods] = useState<string[]>(set.methods)
  const [q, setQ] = useState('')

  const chosen = methods.map((n) => methodByName(n)).filter(Boolean) as AuthMethod[]
  const usable = chosen.filter((m) => !methodBlocker(m))
  const dirty =
    name !== set.name || description !== (set.description ?? '') || JSON.stringify(methods) !== JSON.stringify(set.methods)
  const nameError = name.trim() === '' ? 'A set needs a name — rules reference it by that name.' : null
  const ready = !nameError && methods.length > 0

  const toggle = (n: string) => setMethods((all) => (all.includes(n) ? all.filter((x) => x !== n) : [...all, n]))

  return (
    <>
      <header className="bms__head">
        <div>
          <h2>Edit set</h2>
          <p>Changes apply to every policy rule referencing this set, the moment they are saved.</p>
        </div>
        <div className="bms__headacts">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="brand"
            disabled={!ready || !dirty}
            onClick={() => onSave({ ...set, name: name.trim(), description: description.trim() || undefined, methods })}
          >
            Save set
          </Button>
        </div>
      </header>

      <div className="bms__body">
        <div className="bms__form">
          <div className="bms__field">
            <label htmlFor={`${uid}-n`}>
              Name <b aria-hidden>*</b>
            </label>
            <input
              id={`${uid}-n`}
              value={name}
              aria-invalid={!!nameError}
              onChange={(e) => setName(e.target.value)}
              placeholder="Phishing-resistant only"
            />
            {nameError && <p className="bms__err">{nameError}</p>}
          </div>

          <div className="bms__field">
            <label htmlFor={`${uid}-d`}>Description</label>
            <textarea
              id={`${uid}-d`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should someone reach for this set rather than another one?"
            />
          </div>
        </div>

        {/* Chosen first. The old screen put the answer among twenty-one rows of
            the question. */}
        <h3 className="u-label">
          In this set
          <span className="bms__counthint">
            {methods.length} chosen · {usable.length} usable
          </span>
        </h3>

        {methods.length === 0 ? (
          <p className="bms__alarm">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span>
              <strong>An empty set cannot be satisfied by anyone.</strong> Pick at least one method before
              saving.
            </span>
          </p>
        ) : (
          <div className="bms__chips">
            {methods.map((n) => {
              const m = methodByName(n)
              const blocker = m ? methodBlocker(m) : 'No longer exists'
              return (
                <span key={n} className={`bms__chip ${blocker ? 'is-blocked' : ''}`}>
                  {n}
                  {blocker && <em title={blocker}>{blocker}</em>}
                  <button type="button" aria-label={`Remove ${n}`} onClick={() => toggle(n)}>
                    <X size={11} strokeWidth={2.4} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <h3 className="u-label">Add from the catalogue</h3>
        <div className="bms__search is-inline">
          <Search size={13} strokeWidth={2} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search methods…" aria-label="Search methods" />
        </div>

        <MethodPicker query={q} chosen={methods} onToggle={toggle} />
      </div>
    </>
  )
}

function MethodPicker({ query, chosen, onToggle }: { query: string; chosen: string[]; onToggle: (n: string) => void }) {
  const hit = (m: AuthMethod) =>
    !query ||
    m.name.toLowerCase().includes(query.toLowerCase()) ||
    m.channel.toLowerCase().includes(query.toLowerCase()) ||
    m.tier.toLowerCase().includes(query.toLowerCase())

  /* The catalogue below is what you can still ADD — chosen methods are already
     chips above, so this list shrinks as you pick rather than repeating the
     answer among the options. */
  return (
    <div className="bms__picker">
      {METHOD_TIERS.map((t) => {
        const rows = AUTH_METHODS.filter((m) => m.tier === t.name && hit(m) && !chosen.includes(m.name))
        if (rows.length === 0) return null
        return (
          <div key={t.name} className="bms__pickgroup">
            <h4>
              {t.name}
              <em>{t.blurb}</em>
            </h4>
            {rows.map((m) => {
              const blocker = methodBlocker(m)
              return (
                <button key={m.id} type="button" className="bms__pickrow" onClick={() => onToggle(m.name)}>
                  <Plus size={13} strokeWidth={2.2} aria-hidden />
                  <span>
                    <strong>{m.name}</strong>
                    <em>{m.description}</em>
                  </span>
                  {blocker && <span className="bms__blocker">{blocker}</span>}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* --- Create ------------------------------------------------------------------- */

function CreateSetDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (s: MethodSet) => void }) {
  const uid = useId()
  const store = useBrand()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState<'empty' | 'resistant' | 'copy'>('resistant')
  const [copyFrom, setCopyFrom] = useState(store.methodSets[0]?.id ?? '')

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setStart('resistant')
    setCopyFrom(store.methodSets[0]?.id ?? '')
  }, [open, store.methodSets])

  const taken = store.methodSets.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())
  const error = name.trim() === '' ? null : taken ? 'A set with that name already exists — rules would have no way to tell them apart.' : null
  const ready = name.trim() !== '' && !taken

  const seedMethods = () => {
    if (start === 'resistant') return AUTH_METHODS.filter((m) => m.tier === 'Phishing-resistant').map((m) => m.name)
    if (start === 'copy') return store.methodSets.find((s) => s.id === copyFrom)?.methods ?? []
    return []
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New method set"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!ready}
            onClick={() =>
              onCreate({
                id: `ms${Date.now()}`,
                name: name.trim(),
                description: description.trim() || undefined,
                methods: seedMethods(),
                usedIn: 0,
              })
            }
          >
            Create set
          </Button>
        </>
      }
    >
      <div className="bms__create">
        <div className="bms__field">
          <label htmlFor={`${uid}-n`}>
            Name <b aria-hidden>*</b>
          </label>
          <input
            id={`${uid}-n`}
            autoFocus
            value={name}
            aria-invalid={!!error}
            placeholder="e.g. Contractor factors"
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="bms__err">{error}</p>}
        </div>

        <div className="bms__field">
          <label htmlFor={`${uid}-d`}>Description</label>
          <textarea
            id={`${uid}-d`}
            rows={2}
            value={description}
            placeholder="When should someone reach for this set?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <fieldset className="bms__starts">
          <legend className="u-label">Start from</legend>
          {/* Starting empty is offered and is not the default. An empty set is
              a set that cannot be satisfied, and defaulting to it means the
              most common first save is the broken one. */}
          <label className={start === 'resistant' ? 'is-on' : ''}>
            <input type="radio" name={`${uid}-s`} checked={start === 'resistant'} onChange={() => setStart('resistant')} />
            <span>
              <strong>Phishing-resistant methods</strong>
              <em>Everything that cannot be replayed or intercepted. The safest starting point.</em>
            </span>
          </label>
          <label className={start === 'copy' ? 'is-on' : ''}>
            <input type="radio" name={`${uid}-s`} checked={start === 'copy'} onChange={() => setStart('copy')} disabled={store.methodSets.length === 0} />
            <span>
              <strong>A copy of an existing set</strong>
              <em>
                <select
                  aria-label="Set to copy"
                  value={copyFrom}
                  disabled={start !== 'copy'}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {store.methodSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.methods.length} methods
                    </option>
                  ))}
                </select>
              </em>
            </span>
          </label>
          <label className={start === 'empty' ? 'is-on' : ''}>
            <input type="radio" name={`${uid}-s`} checked={start === 'empty'} onChange={() => setStart('empty')} />
            <span>
              <strong>Empty</strong>
              <em>You will need to add at least one method before it can be saved.</em>
            </span>
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}

/* --- Delete ------------------------------------------------------------------- */

function DeleteSetDialog({ set, onClose, onConfirm }: { set: MethodSet | null; onClose: () => void; onConfirm: (s: MethodSet) => void }) {
  const store = useBrand()
  const users = set ? referencedBy(set, store.policies) : []

  return (
    <Modal
      open={set !== null}
      onClose={onClose}
      title={`Delete ${set?.name ?? ''}?`}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => set && onConfirm(set)}>
            Delete set
          </Button>
        </>
      }
    >
      <div className="bms__confirm">
        {users.length > 0 ? (
          <>
            <p className="bms__alarm">
              <AlertTriangle size={14} strokeWidth={2} aria-hidden />
              <span>
                <strong>
                  {users.length} polic{users.length === 1 ? 'y' : 'ies'} reference methods from this set.
                </strong>{' '}
                Deleting it does not change those rules — they keep naming the methods directly — but the
                grouping and the reason it existed are gone.
              </span>
            </p>
            <ul className="bms__users">
              {users.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <em>{p.status}</em>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="bms__note">No policy references this set. Deleting it affects nothing.</p>
        )}
      </div>
    </Modal>
  )
}
