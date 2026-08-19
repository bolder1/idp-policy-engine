import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Copy,
  Globe,
  Layers,
  MapPin,
  MoreVertical,
  Network,
  PanelRightClose,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Button, IconButton, MenuButton, Modal, type MenuItem } from '../kit'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  type Policy,
  type Zone,
  type ZoneLocation,
} from '../data'
import { useBrand } from '../store'
import { canSaveZone, classifyIp, validateZone } from './zone-validation'

/* -----------------------------------------------------------------------------
   Zones v4 — the Drive layout.

   Modelled on Google Drive's file list, because Drive solves the exact problem
   this screen has: a long list of named objects where you mostly scan,
   occasionally act on one row without leaving the list, and sometimes open one
   properly. Drive answers those three with three different affordances, and the
   useful part is that they do not compete.

   What is taken, and why each one:

   · **A docked details panel, not an overlay.** Drive's panel takes the right
     edge and the list makes room for it. An overlay would cover the row you
     just clicked, which is the one thing you still want to see — and it would
     make the list unusable while the panel is open, when the whole point is to
     click the next row and watch the panel follow.
   · **Tabs in the panel.** Drive splits Details from Activity. Here it is
     Details and Used by, and Used by is real: it walks the policies for rules
     whose conditions name this zone, so "6 policies" stops being a number and
     becomes a list you can act on.
   · **Hover actions on the row.** Drive keeps the row quiet until you are on
     it, then offers the two or three things worth doing without opening
     anything. Always-on icons would turn a scannable list into a control panel;
     hidden-only-in-a-kebab costs a click for the common case. Both, then: the
     common actions on hover, everything in the kebab.
   · **A selection bar above the list.** Selecting a row is not the same as
     opening it, and Drive is right to give the selected state its own strip of
     actions rather than overloading the row.

   The hover cluster is also rendered when the row is selected or focused, so it
   is reachable by keyboard and does not vanish under the pointer you moved
   away — a hover-only control is a control a keyboard user does not have.
   -------------------------------------------------------------------------- */

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'France', 'Singapore', 'Australia']
const CITIES = ['Pune', 'Bengaluru', 'Mumbai', 'London', 'Austin', 'Berlin', 'Singapore']

type Tab = 'details' | 'used'

export function ZonesV4() {
  const store = useBrand()
  const reduce = useReducedMotion()

  const [selId, setSelId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('details')
  const [q, setQ] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null)

  const list = store.zones.filter((z) => !q || z.name.toLowerCase().includes(q.toLowerCase()))
  const selected = store.zones.find((z) => z.id === selId) ?? null

  /* Counted, not stored.

     `zone.usedIn` is a seeded number and it does not agree with the rules: the
     office zone carries 6 and only 2 policies actually name it. Building the
     Used by tab made that visible, and a column that disagrees with the list
     underneath it is worse than no column — so the whole screen reads from one
     computation over the real rules, and the stored field is ignored here. */
  const usage = useMemo(() => {
    const m = new Map<string, { policy: Policy; rules: string[] }[]>()
    for (const z of store.zones) m.set(z.id, policiesUsing(z.id, store.policies))
    return m
  }, [store.zones, store.policies])
  const uses = (id: string) => usage.get(id) ?? []

  function duplicate(z: Zone) {
    const copy: Zone = { ...z, id: `z${Date.now()}`, name: `${z.name} (copy)`, usedIn: 0 }
    store.addZone(copy)
    setSelId(copy.id)
    setTab('details')
    store.showToast(`${z.name} duplicated`)
  }

  function create() {
    const z: Zone = {
      id: `z${Date.now()}`,
      name: 'Untitled zone',
      kind: 'custom',
      ip: [],
      asn: [],
      location: emptyLocation(),
      usedIn: 0,
    }
    store.addZone(z)
    setSelId(z.id)
    setTab('details')
  }

  function reallyDelete(z: Zone) {
    store.removeZone(z.id)
    setConfirmDelete(null)
    if (selId === z.id) setSelId(null)
    store.showToast(`${z.name} deleted`)
  }

  return (
    <div className="bpage bz5">
      <header className="bz5__head">
        <div>
          <h1>Zones</h1>
          <p>Named network and location boundaries that your policy rules reference.</p>
        </div>
        <Button variant="brand" onClick={create}>
          <Plus size={15} strokeWidth={2.2} aria-hidden /> New zone
        </Button>
      </header>

      <div className="bz5__work">
        <div className="bz5__main">
          <div className="bz5__bar">
            <span className="bz5__search">
              <Search size={15} strokeWidth={1.9} aria-hidden />
              <input
                type="search"
                placeholder="Search zones"
                aria-label="Search zones"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
            <span className="bz5__count">
              {list.length} zone{list.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Drive's selection strip. Selecting is not opening, so the selected
              state gets its own actions instead of borrowing the row's. */}
          <AnimatePresence initial={false}>
            {selected && (
              <motion.div
                key="selbar"
                className="bz5__selbar"
                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                transition={{ duration: reduce ? 0 : 0.16 }}
              >
                <IconButton icon={X} label="Clear selection" size="sm" tone="ghost" onClick={() => setSelId(null)} />
                <strong>{selected.name}</strong>
                <span className="bz5__selspace" />
                <IconButton icon={Copy} label="Duplicate" size="sm" tone="ghost" onClick={() => duplicate(selected)} />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  size="sm"
                  tone="danger"
                  onClick={() => setConfirmDelete(selected)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bz5__cols" aria-hidden>
            <span>Name</span>
            <span>What it matches</span>
            <span>Used by</span>
            <span />
          </div>

          <ul className="bz5__rows">
            {list.map((z) => (
              <Row
                key={z.id}
                zone={z}
                used={uses(z.id).length}
                selected={selId === z.id}
                onOpen={() => {
                  setSelId(z.id)
                  setTab('details')
                }}
                onUsed={() => {
                  setSelId(z.id)
                  setTab('used')
                }}
                onDuplicate={() => duplicate(z)}
                onDelete={() => setConfirmDelete(z)}
              />
            ))}
          </ul>

          {list.length === 0 && (
            <p className="bz5__empty">
              {q ? <>No zone matches “{q}”.</> : 'No zones yet. Create one to reference it from a policy rule.'}
            </p>
          )}
        </div>

        {/* ---- The docked panel. The list makes room; nothing is covered. ---- */}
        <AnimatePresence initial={false}>
          {selected && (
            <motion.aside
              key="panel"
              className="bz5__panel"
              initial={{ width: reduce ? 380 : 0, opacity: reduce ? 1 : 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: reduce ? 380 : 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.26, ease: [0.2, 0, 0, 1] }}
              aria-label={`${selected.name} details`}
            >
              <Panel
                key={selected.id}
                zone={selected}
                users={uses(selected.id)}
                tab={tab}
                setTab={setTab}
                reduce={!!reduce}
                onClose={() => setSelId(null)}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

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
        <p className="bz5__confirm">
          {confirmDelete && uses(confirmDelete.id).length > 0 ? (
            <>
              <strong>
                {uses(confirmDelete.id).length} polic{uses(confirmDelete.id).length === 1 ? 'y' : 'ies'} reference this
                zone.
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

/* --- A row -------------------------------------------------------------------
   Quiet until you are on it. The cluster is rendered at all times and hidden
   with opacity rather than conditionally mounted, so it is in the tab order and
   `:focus-within` can bring it back for a keyboard user. */

function Row({
  zone,
  used,
  selected,
  onOpen,
  onUsed,
  onDuplicate,
  onDelete,
}: {
  zone: Zone
  used: number
  selected: boolean
  onOpen: () => void
  onUsed: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const Icon = zoneIcon(zone)
  const loud = useMemo(() => validateZone(zone).filter((i) => i.level !== 'info'), [zone])

  const menu: MenuItem[] = [
    { id: 'open', label: 'View details', icon: PanelRightClose },
    { id: 'used', label: 'See what uses it', icon: Layers },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, divide: true },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ]

  return (
    <li className={`bz5__row ${selected ? 'is-on' : ''}`}>
      <button type="button" className="bz5__rowmain" onClick={onOpen}>
        <span className={`bz5__ico is-${zoneTone(zone)}`} aria-hidden>
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <span className="bz5__name">
          {zone.name}
          {loud.length > 0 && <i className={`bz5__dot is-${loud[0].level}`} title={loud[0].title} />}
        </span>
        <span className="bz5__sum">{summarise(zone)}</span>
        <span className="bz5__use">{used > 0 ? `${used} polic${used === 1 ? 'y' : 'ies'}` : '—'}</span>
      </button>

      <span className="bz5__acts">
        <IconButton icon={PanelRightClose} label="View details" size="sm" tone="ghost" onClick={onOpen} />
        <IconButton icon={Copy} label="Duplicate" size="sm" tone="ghost" onClick={onDuplicate} />
        <IconButton icon={Trash2} label="Delete" size="sm" tone="danger" onClick={onDelete} />
        <MenuButton
          label="More actions"
          icon={MoreVertical}
          iconOnly
          size="sm"
          variant="ghost"
          items={menu}
          onSelect={(id) => {
            if (id === 'open') onOpen()
            if (id === 'used') onUsed()
            if (id === 'duplicate') onDuplicate()
            if (id === 'delete') onDelete()
          }}
        />
      </span>
    </li>
  )
}

/* --- The panel ---------------------------------------------------------------
   Keyed on the zone by the caller, so switching rows rebuilds the draft instead
   of carrying the last zone's unsaved edits into the next one. */

function Panel({
  zone,
  users,
  tab,
  setTab,
  reduce,
  onClose,
}: {
  zone: Zone
  users: { policy: Policy; rules: string[] }[]
  tab: Tab
  setTab: (t: Tab) => void
  reduce: boolean
  onClose: () => void
}) {
  const store = useBrand()
  const [draft, setDraft] = useState<Zone>(zone)
  const set = (patch: Partial<Zone>) => setDraft({ ...draft, ...patch })

  const loud = useMemo(() => validateZone(draft).filter((i) => i.level !== 'info'), [draft])
  const dirty = JSON.stringify(zone) !== JSON.stringify(draft)
  const Icon = zoneIcon(draft)

  return (
    <div className="bz5__panelinner">
      <header className="bz5__phead">
        <span className={`bz5__ico is-${zoneTone(draft)}`} aria-hidden>
          <Icon size={15} strokeWidth={1.8} />
        </span>
        <strong>{draft.name || 'Untitled zone'}</strong>
        <IconButton icon={X} label="Close details" size="sm" tone="ghost" onClick={onClose} />
      </header>

      <div className="bz5__tabs" role="tablist" aria-label="Zone details">
        <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>
          Details
        </button>
        <button role="tab" aria-selected={tab === 'used'} className={tab === 'used' ? 'is-on' : ''} onClick={() => setTab('used')}>
          Used by
          <em>{users.length}</em>
        </button>
      </div>

      <div className="bz5__pbody">
        {tab === 'details' ? (
          <>
            <label className="bz5__field">
              <span>Zone name</span>
              <input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </label>

            <Entries
              icon={Network}
              title="Addresses and networks"
              placeholder="203.0.113.0/24 or AS15169"
              empty="Matches any address"
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

            <Locations loc={draft.location} onChange={(location) => set({ location })} />

            <div className="bz5__matches">
              <span>This zone matches</span>
              <p>{sentence(draft)}</p>
            </div>

            {loud.map((i) => (
              <p key={i.id} className={`bz5__issue is-${i.level}`}>
                <AlertTriangle size={13} strokeWidth={1.9} aria-hidden />
                <span>
                  <strong>{i.title}.</strong> {i.detail}
                </span>
              </p>
            ))}
          </>
        ) : (
          <UsedBy zones={users} zoneId={zone.id} />
        )}
      </div>

      {tab === 'details' && (
        <footer className="bz5__pfoot">
          <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
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
            Save
          </Button>
        </footer>
      )}

      {/* Reduced motion still gets the panel; it just arrives rather than
          slides. Nothing here depends on the movement to be understood. */}
      {reduce ? null : null}
    </div>
  )
}

/* Drive's Activity tab, answering the question this product actually gets
   asked: not "who touched this" but "what breaks if I delete it". */
function UsedBy({ zones, zoneId }: { zones: { policy: Policy; rules: string[] }[]; zoneId: string }) {
  const store = useBrand()
  if (zones.length === 0) {
    return (
      <p className="bz5__none">
        No policy rule names this zone. Deleting it changes nothing — which also means nothing is enforcing it.
      </p>
    )
  }
  return (
    <ul className="bz5__used">
      {zones.map(({ policy, rules }) => (
        <li key={policy.id}>
          <button type="button" onClick={() => store.go({ name: 'builder', policyId: policy.id })}>
            <strong>{policy.name}</strong>
            <em>
              {rules.length} rule{rules.length === 1 ? '' : 's'} · {rules.join(', ')}
            </em>
          </button>
        </li>
      ))}
      <li className="bz5__usedfoot" key={`${zoneId}-foot`}>
        Deleting the zone leaves these conditions naming something that no longer exists.
      </li>
    </ul>
  )
}

function policiesUsing(zoneId: string, policies: Policy[]) {
  return policies
    .map((policy) => ({
      policy,
      rules: policy.rules
        .filter((r) => r.conditions.some((c) => c.typeId === 'zone' && c.values.includes(zoneId)))
        .map((r) => r.name),
    }))
    .filter((x) => x.rules.length > 0)
}

/* --- Shared editors ---------------------------------------------------------- */

function Entries({
  icon: Icon,
  title,
  placeholder,
  empty,
  rows,
  onChange,
  onRemove,
  onAdd,
}: {
  icon: typeof Network
  title: string
  placeholder: string
  empty: string
  rows: { key: string; value: string; kind: string; bad: boolean }[]
  onChange: (key: string, next: string) => void
  onRemove: (key: string) => void
  onAdd: (raw: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <section className="bz5__sec">
      <h3>
        <Icon size={14} strokeWidth={1.8} aria-hidden />
        {title}
        <em>{rows.length}</em>
      </h3>
      {rows.length === 0 && <p className="bz5__any">{empty}</p>}
      {rows.map((r) => (
        <div key={r.key} className={`bz5__entry ${r.bad ? 'is-bad' : ''}`}>
          <input value={r.value} aria-label={`${title} entry`} onChange={(e) => onChange(r.key, e.target.value)} />
          <span>{r.kind}</span>
          <IconButton icon={Trash2} label={`Remove ${r.value}`} size="sm" tone="ghost" onClick={() => onRemove(r.key)} />
        </div>
      ))}
      <div className="bz5__entry is-add">
        <input
          value={text}
          placeholder={placeholder}
          aria-label={`Add to ${title}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              onAdd(text)
              setText('')
            }
          }}
        />
        <Button
          size="sm"
          disabled={!text.trim()}
          onClick={() => {
            onAdd(text)
            setText('')
          }}
        >
          Add
        </Button>
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
    <section className="bz5__sec">
      <h3>
        <Globe size={14} strokeWidth={1.8} aria-hidden />
        Locations
        <em>{picked.length + (loc.radius ? 1 : 0)}</em>
      </h3>
      {picked.length === 0 && !loc.radius && <p className="bz5__any">Matches any location</p>}
      {picked.map((p) => (
        <div key={`${p.k}:${p.v}`} className="bz5__entry">
          <span className="bz5__static">{p.v}</span>
          <span>{p.kind}</span>
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
        <div className="bz5__entry">
          <span className="bz5__static">
            <input
              type="number"
              min={1}
              className="bz5__km"
              value={loc.radius.km}
              aria-label="Radius in kilometres"
              onChange={(e) => onChange({ ...loc, radius: { ...loc.radius!, km: Number(e.target.value) } })}
            />
            km around {loc.radius.label ?? 'a point'}
          </span>
          <span>Radius</span>
          <IconButton
            icon={Trash2}
            label="Remove radius"
            size="sm"
            tone="ghost"
            onClick={() => onChange({ ...loc, radius: undefined })}
          />
        </div>
      )}
      {pool.length > 0 && (
        <div className="bz5__pool">
          {pool.map((p) => (
            <button key={`${p.k}:${p.v}`} type="button" onClick={() => onChange({ ...loc, [p.k]: [...loc[p.k], p.v] })}>
              <Plus size={11} strokeWidth={2.4} aria-hidden />
              {p.v}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* --- Phrasing and iconography ------------------------------------------------
   Drive gives every row a type icon, and the type is the single most useful
   thing you can put at the start of a row. A zone's type is not stored, so it
   is derived from what the zone actually constrains. */

function zoneIcon(z: Zone) {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return Layers
  if (net) return Network
  if (z.location.radius) return MapPin
  return Globe
}

function zoneTone(z: Zone) {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return 'both'
  if (net) return 'net'
  if (loc) return 'loc'
  return 'any'
}

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
