import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Globe,
  MapPin,
  Network,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Button, IconButton, Modal } from '../kit'
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
   Zones v3 — the list is the page.

   v2 is a master–detail: a list on the left, a form on the right. It works, and
   it has one problem that no amount of polish fixes — the two halves look like
   peers, so the screen never says which of the two things you are doing. Adding
   a zone and editing a zone both end up in the same panel, wearing the same
   chrome, and the only difference is the heading.

   This version answers that by collapsing the master–detail into one column and
   splitting the two actions apart physically:

   · **Editing happens inside the row.** Click a zone and it opens in place. The
     thing you are editing never moves, never gets covered, and never leaves the
     list it belongs to — so there is no question about which zone the form is
     for. Squarespace and Deel both settle their repeated-item editors this way.
   · **Creating happens above the list**, in a card that does not look like a
     row: brand-edged, its own eyebrow, its own presets, its own primary. You
     cannot mistake it for a zone you already have, because it is not shaped
     like one.

   And there is no preview mode and no Edit button. An open row *is* the editor;
   a closed row is the summary. Two states, both of them real, neither of them a
   mode you have to switch into. Every entry inside is a live input rather than
   a value with a pencil beside it — the pencil was an edit mode wearing a
   smaller hat.

   One row open at a time. Not for tidiness: only one zone can be dirty at once,
   so "Save changes" never has to ask which one it means.
   -------------------------------------------------------------------------- */

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'France', 'Singapore', 'Australia']
const CITIES = ['Pune', 'Bengaluru', 'Mumbai', 'London', 'Austin', 'Berlin', 'Singapore']

type Preset = { id: string; name: string; blurb: string; icon: typeof Network; make: () => Partial<Zone> }

const PRESETS: Preset[] = [
  {
    id: 'office',
    name: 'Office network',
    blurb: 'Addresses you control',
    icon: Network,
    make: () => ({ ip: ['203.0.113.0/24'], asn: [], location: emptyLocation() }),
  },
  {
    id: 'country',
    name: 'Country',
    blurb: 'Addresses you cannot list',
    icon: Globe,
    make: () => ({ ip: [], asn: [], location: { ...emptyLocation(), countries: ['India'] } }),
  },
  {
    id: 'isp',
    name: 'Operator in a country',
    blurb: 'One ISP, one country',
    icon: Globe,
    make: () => ({ ip: [], asn: ['AS55836'], location: { ...emptyLocation(), countries: ['India'] } }),
  },
  {
    id: 'site',
    name: 'Around a site',
    blurb: 'A radius around a point',
    icon: MapPin,
    make: () => ({
      ip: [],
      asn: [],
      location: { ...emptyLocation(), radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' } },
    }),
  },
]

export function ZonesV3() {
  const store = useBrand()
  const reduce = useReducedMotion()

  /* Which row is open. `null` is a perfectly good state here — a list of zones
     with nothing open is the screen's resting position, not an empty one. */
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null)

  const list = store.zones.filter((z) => !q || z.name.toLowerCase().includes(q.toLowerCase()))

  function open(id: string) {
    setOpenId((cur) => (cur === id ? null : id))
    setCreating(false)
  }

  function duplicate(z: Zone) {
    const copy: Zone = { ...z, id: `z${Date.now()}`, name: `${z.name} (copy)`, usedIn: 0 }
    store.addZone(copy)
    setOpenId(copy.id)
    store.showToast(`${z.name} duplicated`)
  }

  function reallyDelete(z: Zone) {
    store.removeZone(z.id)
    setConfirmDelete(null)
    if (openId === z.id) setOpenId(null)
    store.showToast(`${z.name} deleted`)
  }

  return (
    <div className="bpage bz4">
      <header className="bz4__head">
        <div>
          <h1>Zones</h1>
          <p>Named network and location boundaries that your policy rules reference.</p>
        </div>
        {/* The only create action on the page, and it is the only control up
            here — so "make a new one" and "change an existing one" are never
            reached from the same place. */}
        <Button variant="brand" onClick={() => { setCreating(true); setOpenId(null) }}>
          <Plus size={15} strokeWidth={2.2} aria-hidden /> New zone
        </Button>
      </header>

      <div className="bz4__bar">
        <span className="bz4__search">
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <input
            type="search"
            placeholder="Search zones"
            aria-label="Search zones"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
        <span className="bz4__count">
          {list.length} zone{list.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* ---- Create. Above the list, and shaped nothing like it. ---- */}
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div
            key="create"
            initial={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: reduce ? 'auto' : 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <CreateCard
              onCancel={() => setCreating(false)}
              onCreate={(z) => {
                store.addZone(z)
                setCreating(false)
                setOpenId(z.id)
                store.showToast(`${z.name} created`)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- The list. Rows open in place. ---- */}
      <ul className="bz4__rows">
        {list.map((z) => (
          <ZoneRow
            key={z.id}
            zone={z}
            isOpen={openId === z.id}
            reduce={!!reduce}
            onToggle={() => open(z.id)}
            onDuplicate={() => duplicate(z)}
            onDelete={() => setConfirmDelete(z)}
          />
        ))}
      </ul>

      {list.length === 0 && (
        <p className="bz4__empty">
          {q ? <>No zone matches “{q}”.</> : 'No zones yet. Create one to reference it from a policy rule.'}
        </p>
      )}

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
        <p className="bz4__confirm">
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

/* --- A row ------------------------------------------------------------------
   The header only. The draft lives in ZoneEditor below, which mounts when the
   row opens and unmounts when it closes — so closing genuinely discards the
   edit rather than parking it. Holding the draft up here looked tidier and was
   wrong: the row stays mounted while closed, so an abandoned edit would still
   be sitting there, dirty, the next time the row was opened. */

function ZoneRow({
  zone,
  isOpen,
  reduce,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  zone: Zone
  isOpen: boolean
  reduce: boolean
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const loud = useMemo(() => validateZone(zone).filter((i) => i.level !== 'info'), [zone])

  return (
    <li className={`bz4__row ${isOpen ? 'is-open' : ''}`}>
      {/* The whole header is the control. No Edit button beside it, because
          opening the row is the edit — a button that only says "yes, really"
          is a mode switch with a label on it. */}
      <button type="button" className="bz4__rowhead" aria-expanded={isOpen} onClick={onToggle}>
        <motion.span
          className="bz4__chev"
          aria-hidden
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          <ChevronDown size={16} strokeWidth={2} />
        </motion.span>

        <span className="bz4__rowname">
          {zone.name}
          {loud.length > 0 && !isOpen && (
            <i className={`bz4__dot is-${loud[0].level}`} title={loud[0].title} aria-label={loud[0].title} />
          )}
        </span>

        {/* The summary is what makes a closed row worth reading. Without it the
            list is a column of names and every answer needs a click. */}
        <span className="bz4__rowsum">{summarise(zone)}</span>

        <span className="bz4__rowuse">
          {zone.usedIn > 0 ? `${zone.usedIn} polic${zone.usedIn === 1 ? 'y' : 'ies'}` : 'Unused'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: reduce ? 'auto' : 0, opacity: reduce ? 1 : 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: reduce ? 'auto' : 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.26, ease: [0.2, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {/* Keyed on the zone, so a duplicate that lands under the cursor
                gets its own draft rather than inheriting the original's. */}
            <ZoneEditor key={zone.id} zone={zone} reduce={reduce} onDuplicate={onDuplicate} onDelete={onDelete} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

/* --- The editor, inside the row ---------------------------------------------- */

function ZoneEditor({
  zone,
  reduce,
  onDuplicate,
  onDelete,
}: {
  zone: Zone
  reduce: boolean
  onDuplicate: () => void
  onDelete: () => void
}) {
  const store = useBrand()
  const [draft, setDraft] = useState<Zone>(zone)
  const set = (patch: Partial<Zone>) => setDraft({ ...draft, ...patch })

  const loud = useMemo(() => validateZone(draft).filter((i) => i.level !== 'info'), [draft])
  const dirty = JSON.stringify(zone) !== JSON.stringify(draft)

  return (
    <div className="bz4__body">
      {/* Two columns: what it is on the left, where it is on the right.
          The zone model is literally an AND of those two halves, so
          side by side is the shape of the data rather than a way of
          filling the width. */}
      <div className="bz4__grid">
        <div className="bz4__col">
          <label className="bz4__field">
            <span>Zone name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. London office"
            />
          </label>

          <Entries
            icon={Network}
            title="Addresses and networks"
            count={draft.ip.length + draft.asn.length}
            empty="Matches any address"
            placeholder="203.0.113.0/24, 2001:db8::/32, or AS15169"
            help="An IPv4 or IPv6 address, a CIDR block, an IPv4 range, or an ASN."
            rows={[
              ...draft.ip.map((v, i) => ({
                key: `ip:${i}`,
                value: v,
                kind: IP_LABEL[classifyIp(v)],
                bad: classifyIp(v) === 'invalid',
              })),
              ...draft.asn.map((v, i) => ({
                key: `asn:${i}`,
                value: v,
                kind: ASN_DIRECTORY[v.toUpperCase()] ?? 'Unknown operator',
                bad: !/^AS\d+$/i.test(v),
              })),
            ]}
            onChange={(key, next) => {
              const i = Number(key.slice(key.indexOf(':') + 1))
              if (key.startsWith('ip:')) set({ ip: draft.ip.map((x, n) => (n === i ? next : x)) })
              else set({ asn: draft.asn.map((x, n) => (n === i ? next : x)) })
            }}
            onRemove={(key) => {
              const i = Number(key.slice(key.indexOf(':') + 1))
              if (key.startsWith('ip:')) set({ ip: draft.ip.filter((_, n) => n !== i) })
              else set({ asn: draft.asn.filter((_, n) => n !== i) })
            }}
            onAdd={(raw) => {
              const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
              const asns = parts.filter((p) => /^AS\d+$/i.test(p))
              const ips = parts.filter((p) => !/^AS\d+$/i.test(p))
              set({ ip: [...draft.ip, ...ips], asn: [...draft.asn, ...asns] })
            }}
          />
        </div>

        <div className="bz4__col">
          <Locations loc={draft.location} onChange={(location) => set({ location })} />

          <div className="bz4__matches">
            <span className="bz4__matcheslabel">This zone matches</span>
            <p>{sentence(draft)}</p>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {loud.map((i) => (
          <motion.p
            key={i.id}
            className={`bz4__issue is-${i.level}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
          >
            <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
            <span>
              <strong>{i.title}.</strong> {i.detail}
            </span>
          </motion.p>
        ))}
      </AnimatePresence>

      {/* The row's own footer, scoped to the row. Duplicate and Delete
          live here rather than on the closed header: they belong to the
          zone you have deliberately opened, not to every row you are
          scanning past. */}
      <footer className="bz4__foot">
        <span className="bz4__dirty">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <IconButton icon={Copy} label="Duplicate this zone" size="sm" tone="ghost" onClick={onDuplicate} />
        <IconButton icon={Trash2} label="Delete this zone" size="sm" tone="danger" onClick={onDelete} />
        <span className="bz4__footsep" aria-hidden />
        <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft(zone)}>
          Revert
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={!dirty || !canSaveZone(draft)}
          onClick={() => {
            store.updateZone(draft)
            store.showToast(`${draft.name} saved`)
          }}
        >
          Save changes
        </Button>
      </footer>
    </div>
  )
}

/* --- Create ------------------------------------------------------------------
   Deliberately not a row. A row is a thing that exists; this is a thing that
   does not exist yet, and the two should not be the same object on screen. */

function CreateCard({ onCancel, onCreate }: { onCancel: () => void; onCreate: (z: Zone) => void }) {
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<Preset>(PRESETS[0])

  const zone: Zone = {
    id: `z${Date.now()}`,
    kind: 'custom',
    name: name.trim() || `${preset.name} zone`,
    ip: [],
    asn: [],
    location: emptyLocation(),
    usedIn: 0,
    ...preset.make(),
  }

  return (
    <section className="bz4__create" aria-label="Create a zone">
      <header>
        <span className="bz4__createeyebrow">New zone</span>
        <IconButton icon={X} label="Cancel" size="sm" tone="ghost" onClick={onCancel} />
      </header>

      <label className="bz4__field">
        <span>Zone name</span>
        <input
          type="text"
          autoFocus
          value={name}
          placeholder={`${preset.name} zone`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate(zone)}
        />
      </label>

      <fieldset className="bz4__presets">
        <legend>Start from</legend>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset.id === p.id}
            className={`bz4__preset ${preset.id === p.id ? 'is-on' : ''}`}
            onClick={() => setPreset(p)}
          >
            <p.icon size={17} strokeWidth={1.8} aria-hidden />
            <strong>{p.name}</strong>
            <em>{p.blurb}</em>
          </button>
        ))}
      </fieldset>

      <footer>
        {/* It opens straight into its own row afterwards, so the create card
            never has to double as an editor. */}
        <span className="bz4__createnote">Opens for editing once created.</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" onClick={() => onCreate(zone)}>
          Create zone
        </Button>
      </footer>
    </section>
  )
}

/* --- Entries -----------------------------------------------------------------
   Every value is a live input. v2 showed a value with a pencil beside it, which
   is an edit mode with a smaller hat: two clicks and a confirm to change one
   character. Here the field is the field, and the row below it is always ready
   to take a new one. */

function Entries({
  icon: Icon,
  title,
  count,
  empty,
  placeholder,
  help,
  rows,
  onChange,
  onRemove,
  onAdd,
}: {
  icon: typeof Network
  title: string
  count: number
  empty: string
  placeholder: string
  help: string
  rows: { key: string; value: string; kind: string; bad: boolean }[]
  onChange: (key: string, next: string) => void
  onRemove: (key: string) => void
  onAdd: (raw: string) => void
}) {
  const [text, setText] = useState('')

  function commit() {
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }

  return (
    <section className="bz4__sec">
      <h3>
        <Icon size={15} strokeWidth={1.8} aria-hidden />
        {title}
        <em>{count}</em>
      </h3>

      <div className="bz4__entries">
        {rows.length === 0 && <p className="bz4__any">{empty}</p>}

        {rows.map((r) => (
          <div key={r.key} className={`bz4__entry ${r.bad ? 'is-bad' : ''}`}>
            <input
              className="bz4__entryval"
              value={r.value}
              aria-label={`${title} entry`}
              onChange={(e) => onChange(r.key, e.target.value)}
            />
            <span className="bz4__entrykind">{r.kind}</span>
            <IconButton icon={Trash2} label={`Remove ${r.value}`} size="sm" tone="ghost" onClick={() => onRemove(r.key)} />
          </div>
        ))}

        <div className="bz4__add">
          <input
            className="bz4__entryval"
            value={text}
            placeholder={placeholder}
            aria-label={`Add to ${title}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
          />
          <Button size="sm" disabled={!text.trim()} onClick={commit}>
            Add
          </Button>
        </div>
        <p className="bz4__help">{help}</p>
      </div>
    </section>
  )
}

function Locations({ loc, onChange }: { loc: ZoneLocation; onChange: (l: ZoneLocation) => void }) {
  const picked = [
    ...loc.countries.map((v) => ({ v, k: 'countries' as const, kind: 'Country' })),
    ...loc.states.map((v) => ({ v, k: 'states' as const, kind: 'State' })),
    ...loc.cities.map((v) => ({ v, k: 'cities' as const, kind: 'City' })),
  ]
  const pool = [
    ...COUNTRIES.map((v) => ({ v, k: 'countries' as const })),
    ...CITIES.map((v) => ({ v, k: 'cities' as const })),
  ].filter((p) => !loc[p.k].includes(p.v))

  return (
    <section className="bz4__sec">
      <h3>
        <Globe size={15} strokeWidth={1.8} aria-hidden />
        Locations
        <em>{picked.length + (loc.radius ? 1 : 0)}</em>
      </h3>

      <div className="bz4__entries">
        {picked.length === 0 && !loc.radius && <p className="bz4__any">Matches any location</p>}

        {picked.map((p) => (
          <div key={`${p.k}:${p.v}`} className="bz4__entry">
            <span className="bz4__entryval is-static">{p.v}</span>
            <span className="bz4__entrykind">{p.kind}</span>
            <IconButton
              icon={Trash2}
              label={`Remove ${p.v}`}
              size="sm"
              tone="ghost"
              onClick={() => onChange({ ...loc, [p.k]: loc[p.k].filter((x) => x !== p.v) })}
            />
          </div>
        ))}

        {loc.radius && (
          <div className="bz4__entry">
            <span className="bz4__entryval is-static">
              <input
                type="number"
                min={1}
                className="bz4__km"
                value={loc.radius.km}
                aria-label="Radius in kilometres"
                onChange={(e) => onChange({ ...loc, radius: { ...loc.radius!, km: Number(e.target.value) } })}
              />
              km around {loc.radius.label ?? 'a point'}
            </span>
            <span className="bz4__entrykind">Radius</span>
            <IconButton
              icon={Trash2}
              label="Remove radius"
              size="sm"
              tone="ghost"
              onClick={() => onChange({ ...loc, radius: undefined })}
            />
          </div>
        )}

        {/* A pool of what is left rather than a search box: there are a dozen
            candidates, and a field that makes you guess the spelling of a list
            this short is a field that makes you type for no reason. */}
        {pool.length > 0 && (
          <div className="bz4__pool">
            {pool.map((p) => (
              <button
                key={`${p.k}:${p.v}`}
                type="button"
                onClick={() => onChange({ ...loc, [p.k]: [...loc[p.k], p.v] })}
              >
                <Plus size={12} strokeWidth={2.4} aria-hidden />
                {p.v}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* --- Phrasing ---------------------------------------------------------------- */

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
