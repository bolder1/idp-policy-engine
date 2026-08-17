import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  Globe,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Button, Modal } from '../kit'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  type Zone,
  type ZoneLocation,
} from '../data'
import { useBrand } from '../store'
import { canSaveZone, classifyIp, validateZone } from './zone-validation'

/* -----------------------------------------------------------------------------
   Zones — explicit layout.

   The previous pass rendered the zone as a sentence with the variable parts as
   chips that opened popovers. It read well and was hard to operate: a chip
   gives no affordance, so there was nothing telling you it could be clicked,
   and the name was a borderless heading-shaped input, which made "how do I
   rename this?" a genuinely unanswerable question.

   This version trades that elegance for enterprise legibility:

   · Every action is a labelled control that is visible before you hover. Add,
     Edit, Duplicate and Delete are buttons with words or standard icons, not
     inferred from a chip.
   · The name is a form field with a label above it, at the top of the panel,
     where a rename is looked for.
   · Adding happens inline inside the section it belongs to, so the thing you
     are editing never gets covered by the editor.
   · Destructive actions are separated from the rest, coloured, and confirmed
     by name.

   The sentence survives as a read-only summary at the foot, where it is doing
   the job it is actually good at — telling you what you just built.
   -------------------------------------------------------------------------- */

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'France', 'Singapore', 'Australia']
const CITIES = ['Pune', 'Bengaluru', 'Mumbai', 'London', 'Austin', 'Berlin', 'Singapore']

type Preset = { id: string; name: string; blurb: string; icon: typeof Network; make: () => Partial<Zone> }

const PRESETS: Preset[] = [
  {
    id: 'office',
    name: 'Office network',
    blurb: 'A block of addresses you control.',
    icon: Network,
    make: () => ({ ip: ['203.0.113.0/24'], asn: [], location: emptyLocation() }),
  },
  {
    id: 'country',
    name: 'Country',
    blurb: 'For addresses you cannot list.',
    icon: Globe,
    make: () => ({ ip: [], asn: [], location: { ...emptyLocation(), countries: ['India'] } }),
  },
  {
    id: 'isp',
    name: 'Operator in a country',
    blurb: 'One ISP, inside one country.',
    icon: Globe,
    make: () => ({ ip: [], asn: ['AS55836'], location: { ...emptyLocation(), countries: ['India'] } }),
  },
  {
    id: 'site',
    name: 'Around a site',
    blurb: 'A radius around a point.',
    icon: MapPin,
    make: () => ({
      ip: [],
      asn: [],
      location: { ...emptyLocation(), radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' } },
    }),
  },
]

export function ZonesV2() {
  const store = useBrand()
  const [sel, setSel] = useState(store.zones[0].id)
  const saved = store.zones.find((z) => z.id === sel) ?? store.zones[0]
  const [draft, setDraft] = useState<Zone>(saved)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null)

  const issues = useMemo(() => validateZone(draft), [draft])
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const list = store.zones.filter((z) => !q || z.name.toLowerCase().includes(q.toLowerCase()))
  const set = (patch: Partial<Zone>) => setDraft({ ...draft, ...patch })

  function select(id: string) {
    setSel(id)
    setDraft(store.zones.find((z) => z.id === id)!)
    setCreating(false)
  }

  function create(p: Preset) {
    const z: Zone = {
      id: `z${Date.now()}`,
      name: `${p.name} zone`,
      ip: [],
      asn: [],
      location: emptyLocation(),
      usedIn: 0,
      ...p.make(),
    }
    store.addZone(z)
    setSel(z.id)
    setDraft(z)
    setCreating(false)
    // A new zone opens with its name selected, because renaming it is the very
    // next thing anyone does.
    requestAnimationFrame(() => {
      const el = document.getElementById('zone-name') as HTMLInputElement | null
      el?.focus()
      el?.select()
    })
  }

  function duplicate(z: Zone) {
    const copy: Zone = { ...z, id: `z${Date.now()}`, name: `${z.name} (copy)`, usedIn: 0 }
    store.addZone(copy)
    select(copy.id)
    store.showToast(`${z.name} duplicated`)
  }

  function reallyDelete(z: Zone) {
    store.removeZone(z.id)
    setConfirmDelete(null)
    const next = store.zones.find((x) => x.id !== z.id)
    if (next) select(next.id)
    store.showToast(`${z.name} deleted`)
  }

  return (
    <div className="bpage bz3">
      <header className="bz3__head">
        <div>
          <h1>Zones</h1>
          <p>Named network and location boundaries that your policy rules reference.</p>
        </div>
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus size={15} strokeWidth={2.2} aria-hidden /> New zone
        </Button>
      </header>

      <div className="bz3__body">
        {/* ---- List ---- */}
        <aside className="bz3__list">
          <div className="bz3__listhead">
            <span className="bz3__search">
              <Search size={14} strokeWidth={1.9} aria-hidden />
              <input
                type="search"
                placeholder="Search zones"
                aria-label="Search zones"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
            <span className="bz3__count">
              {list.length} zone{list.length === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="bz3__rows">
            {list.map((z) => (
              <li key={z.id} className={`bz3__row ${sel === z.id && !creating ? 'is-on' : ''}`}>
                <button type="button" className="bz3__rowmain" onClick={() => select(z.id)}>
                  <span className="bz3__rowname">{z.name}</span>
                  <span className="bz3__rowsum">
                    {summarise(z)}
                    {z.usedIn > 0 && <em>· {z.usedIn} polic{z.usedIn === 1 ? 'y' : 'ies'}</em>}
                  </span>
                </button>

              </li>
            ))}
          </ul>
          {list.length === 0 && <p className="bz3__empty">No zone matches “{q}”.</p>}
        </aside>

        {/* ---- Detail ---- */}
        <section className="bz3__detail">
          {creating ? (
            <div className="bz3__presets">
              <header className="bz3__dhead">
                <div>
                  <h2>Create a zone</h2>
                  <p>Pick a starting shape. You can change everything afterwards.</p>
                </div>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </header>
              <div className="bz3__presetgrid">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" className="bz3__preset" onClick={() => create(p)}>
                    <span aria-hidden>
                      <p.icon size={18} strokeWidth={1.7} />
                    </span>
                    <strong>{p.name}</strong>
                    <em>{p.blurb}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <header className="bz3__dhead">
                <div>
                  <h2>{saved.name}</h2>
                  <p>
                    {saved.usedIn > 0
                      ? `Referenced by ${saved.usedIn} polic${saved.usedIn === 1 ? 'y' : 'ies'}`
                      : 'Not referenced by any policy'}
                  </p>
                </div>
                <div className="bz3__dacts">
                  <Button onClick={() => duplicate(saved)}>
                    <Copy size={14} strokeWidth={1.9} aria-hidden /> Duplicate
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmDelete(saved)}>
                    <Trash2 size={14} strokeWidth={1.9} aria-hidden /> Delete
                  </Button>
                </div>
              </header>

              <div className="bz3__form">
                {/* A labelled field, at the top, looking like a field. */}
                <div className="bz3__field">
                  <label htmlFor="zone-name">
                    Zone name <i>*</i>
                  </label>
                  <input
                    id="zone-name"
                    type="text"
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="e.g. London office"
                  />
                  <span className="bz3__hint">Rules refer to this zone by name.</span>
                </div>

                <EntrySection
                  title="Addresses and networks"
                  icon={Network}
                  emptyLabel="No addresses — this zone matches any address"
                  addLabel="Add address or ASN"
                  placeholder="203.0.113.0/24, 2001:db8::/32, or AS15169"
                  help="IPv4 or IPv6 address, a CIDR block, an IPv4 range, or an ASN."
                  rows={[
                    ...draft.ip.map((v) => ({
                      id: `ip:${v}`,
                      value: v,
                      kind: IP_LABEL[classifyIp(v)],
                      bad: classifyIp(v) === 'invalid',
                    })),
                    ...draft.asn.map((v) => ({
                      id: `asn:${v}`,
                      value: v,
                      kind: ASN_DIRECTORY[v.toUpperCase()] ?? 'Unknown operator',
                      bad: !/^AS\d+$/i.test(v),
                    })),
                  ]}
                  onAdd={(raw) => {
                    const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
                    const asns = parts.filter((p) => /^AS\d+$/i.test(p))
                    const ips = parts.filter((p) => !/^AS\d+$/i.test(p))
                    set({
                      ip: [...draft.ip, ...ips.filter((x) => !draft.ip.includes(x))],
                      asn: [...draft.asn, ...asns.filter((x) => !draft.asn.includes(x))],
                    })
                  }}
                  onRemove={(id) => {
                    const [k, v] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
                    if (k === 'ip') set({ ip: draft.ip.filter((x) => x !== v) })
                    else set({ asn: draft.asn.filter((x) => x !== v) })
                  }}
                  onEdit={(id, next) => {
                    const [k, v] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
                    if (k === 'ip') set({ ip: draft.ip.map((x) => (x === v ? next : x)) })
                    else set({ asn: draft.asn.map((x) => (x === v ? next : x)) })
                  }}
                />

                <LocationSection loc={draft.location} onChange={(location) => set({ location })} />
              </div>

              {/* The sentence survives as a read-only summary — the job it was
                  actually good at. */}
              <div className="bz3__summary">
                <span className="u-label">This zone matches</span>
                <p>{sentence(draft)}</p>
              </div>

              <AnimatePresence initial={false}>
                {issues
                  .filter((i) => i.level !== 'info')
                  .map((i) => (
                    <motion.p
                      key={i.id}
                      className={`bz3__issue is-${i.level}`}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
                      <span>
                        <strong>{i.title}.</strong> {i.detail}
                      </span>
                    </motion.p>
                  ))}
              </AnimatePresence>

              <footer className="bz3__foot">
                <span className="bz3__dirty">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
                <div className="bz3__footacts">
                  <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
                    Cancel
                  </Button>
                  <Button
                    variant="brand"
                    disabled={!dirty || !canSaveZone(draft)}
                    onClick={() => {
                      store.updateZone(draft)
                      store.showToast(`${draft.name} saved`)
                    }}
                  >
                    Save changes
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {/* Confirmed by name, and it says what else breaks. */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && reallyDelete(confirmDelete)}>
              Delete zone
            </Button>
          </>
        }
      >
        <p className="bz3__confirm">
          {confirmDelete && confirmDelete.usedIn > 0 ? (
            <>
              <strong>
                {confirmDelete.usedIn} polic{confirmDelete.usedIn === 1 ? 'y' : 'ies'} reference this zone.
              </strong>{' '}
              Their conditions will stop matching anything once it is gone. This cannot be undone.
            </>
          ) : (
            'No policy references this zone, so nothing else changes. This cannot be undone.'
          )}
        </p>
      </Modal>
    </div>
  )
}

/* --- A section of entries, with visible add / edit / delete ----------------- */

interface EntryRow {
  id: string
  value: string
  kind: string
  bad: boolean
}

function EntrySection({
  title,
  icon: Icon,
  emptyLabel,
  addLabel,
  placeholder,
  help,
  rows,
  onAdd,
  onRemove,
  onEdit,
}: {
  title: string
  icon: typeof Network
  emptyLabel: string
  addLabel: string
  placeholder: string
  help: string
  rows: EntryRow[]
  onAdd: (raw: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string, next: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  function commit() {
    if (!text.trim()) return
    onAdd(text)
    setText('')
    setAdding(false)
  }

  return (
    <section className="bz3__sec">
      <header className="bz3__sechead">
        <span className="bz3__sectitle">
          <Icon size={15} strokeWidth={1.8} aria-hidden />
          {title}
          <em>{rows.length}</em>
        </span>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} strokeWidth={2.2} aria-hidden /> Add
        </Button>
      </header>

      <div className="bz3__table">
        {rows.length === 0 && !adding && <p className="bz3__any">{emptyLabel}</p>}

        {rows.map((r) => (
          <div key={r.id} className={`bz3__entry ${r.bad ? 'is-bad' : ''}`}>
            {editing === r.id ? (
              <>
                <input
                  className="bz3__entryinput"
                  value={editText}
                  autoFocus
                  aria-label={`Edit ${r.value}`}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onEdit(r.id, editText.trim())
                      setEditing(null)
                    }
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => {
                    onEdit(r.id, editText.trim())
                    setEditing(null)
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <code className="bz3__entryval">{r.value}</code>
                <span className="bz3__entrykind">{r.bad ? 'Not a valid entry' : r.kind}</span>
                <span className="bz3__entryacts">
                  <button
                    type="button"
                    aria-label={`Edit ${r.value}`}
                    title="Edit"
                    onClick={() => {
                      setEditing(r.id)
                      setEditText(r.value)
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    aria-label={`Delete ${r.value}`}
                    title="Delete"
                    onClick={() => onRemove(r.id)}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                </span>
              </>
            )}
          </div>
        ))}

        {/* Inline, inside the section — the editor never covers the thing it
            is editing. */}
        <AnimatePresence initial={false}>
          {adding && (
            <motion.div
              className="bz3__adder"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div className="bz3__adderrow">
                <input
                  autoFocus
                  value={text}
                  placeholder={placeholder}
                  aria-label={addLabel}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setText('')
                    }
                  }}
                />
                <Button size="sm" variant="brand" onClick={commit} disabled={!text.trim()}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false)
                    setText('')
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="bz3__adderhelp">{help}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

/* --- Locations -------------------------------------------------------------- */

function LocationSection({ loc, onChange }: { loc: ZoneLocation; onChange: (l: ZoneLocation) => void }) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')

  const picked = [
    ...loc.countries.map((v) => ({ v, k: 'countries' as const, kind: 'Country' })),
    ...loc.states.map((v) => ({ v, k: 'states' as const, kind: 'State' })),
    ...loc.cities.map((v) => ({ v, k: 'cities' as const, kind: 'City' })),
  ]
  const pool = [
    ...COUNTRIES.map((v) => ({ v, k: 'countries' as const, kind: 'Country' })),
    ...CITIES.map((v) => ({ v, k: 'cities' as const, kind: 'City' })),
  ]
  const hits = pool.filter((p) => !loc[p.k].includes(p.v) && (!q || p.v.toLowerCase().includes(q.toLowerCase())))

  return (
    <section className="bz3__sec">
      <header className="bz3__sechead">
        <span className="bz3__sectitle">
          <Globe size={15} strokeWidth={1.8} aria-hidden />
          Locations
          <em>{picked.length + (loc.radius ? 1 : 0)}</em>
        </span>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} strokeWidth={2.2} aria-hidden /> Add
        </Button>
      </header>

      <div className="bz3__table">
        {picked.length === 0 && !loc.radius && !adding && (
          <p className="bz3__any">No locations — this zone matches any location</p>
        )}

        {picked.map((p) => (
          <div key={`${p.k}:${p.v}`} className="bz3__entry">
            <span className="bz3__entryval bz3__entryval--plain">{p.v}</span>
            <span className="bz3__entrykind">{p.kind}</span>
            <span className="bz3__entryacts">
              <button
                type="button"
                className="is-danger"
                aria-label={`Delete ${p.v}`}
                title="Delete"
                onClick={() => onChange({ ...loc, [p.k]: loc[p.k].filter((x) => x !== p.v) })}
              >
                <Trash2 size={14} strokeWidth={1.9} />
              </button>
            </span>
          </div>
        ))}

        {loc.radius && (
          <div className="bz3__entry">
            <span className="bz3__entryval bz3__entryval--plain">
              <input
                type="number"
                min={1}
                className="bz3__km"
                value={loc.radius.km}
                aria-label="Radius in kilometres"
                onChange={(e) => onChange({ ...loc, radius: { ...loc.radius!, km: Number(e.target.value) } })}
              />
              km around {loc.radius.label ?? 'a point'}
            </span>
            <span className="bz3__entrykind">Radius</span>
            <span className="bz3__entryacts">
              <button
                type="button"
                className="is-danger"
                aria-label="Delete radius"
                title="Delete"
                onClick={() => onChange({ ...loc, radius: undefined })}
              >
                <Trash2 size={14} strokeWidth={1.9} />
              </button>
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {adding && (
            <motion.div
              className="bz3__adder"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div className="bz3__adderrow">
                <input
                  autoFocus
                  value={q}
                  placeholder="Search countries and cities"
                  aria-label="Search locations"
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!loc.radius)
                      onChange({ ...loc, radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' } })
                    setAdding(false)
                  }}
                >
                  <MapPin size={13} strokeWidth={2} aria-hidden /> Radius instead
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false)
                    setQ('')
                  }}
                >
                  <X size={13} strokeWidth={2.2} aria-hidden />
                </Button>
              </div>
              <div className="bz3__suggest">
                {hits.slice(0, 8).map((h) => (
                  <button
                    key={`${h.k}:${h.v}`}
                    type="button"
                    onClick={() => {
                      onChange({ ...loc, [h.k]: [...loc[h.k], h.v] })
                      setQ('')
                    }}
                  >
                    {h.v}
                    <em>{h.kind}</em>
                  </button>
                ))}
                {hits.length === 0 && <p className="bz3__adderhelp">Nothing matches “{q}”.</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

/* --- Text ------------------------------------------------------------------- */

const IP_LABEL: Record<string, string> = {
  ipv4: 'IPv4 address',
  ipv6: 'IPv6 address',
  'ipv4-cidr': 'IPv4 block',
  'ipv6-cidr': 'IPv6 block',
  'ipv4-range': 'IPv4 range',
  invalid: 'Not valid',
}

function netPhrase(z: Zone) {
  if (ipSectionEmpty(z)) return 'any address'
  const bits: string[] = []
  if (z.ip.length) bits.push(`${z.ip.length} address${z.ip.length === 1 ? '' : 'es'}`)
  if (z.asn.length) bits.push(`${z.asn.length} network${z.asn.length === 1 ? '' : 's'}`)
  return bits.join(' and ')
}

function locPhrase(l: ZoneLocation) {
  if (locationEmpty(l)) return 'any location'
  const all = [...l.countries, ...l.states, ...l.cities]
  if (l.radius) all.push(`${l.radius.km}km around ${l.radius.label ?? 'a point'}`)
  return all.length <= 2 ? all.join(' or ') : `${all[0]} and ${all.length - 1} more`
}

const summarise = (z: Zone) => `${netPhrase(z)} · ${locPhrase(z.location)}`
const sentence = (z: Zone) => `Requests from ${netPhrase(z)}, located in ${locPhrase(z.location)}.`
