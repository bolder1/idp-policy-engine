import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Globe,
  Lock,
  MapPin,
  Network,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'

import { Button, IconButton, Modal, TipDot } from '../kit'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  type Zone,
  type ZoneKind,
  type ZoneLocation,
} from '../data'
import { useBrand } from '../store'
import { canSaveZone, classifyIp, validateZone } from './zone-validation'

/* -----------------------------------------------------------------------------
   Zones v5 — both halves at once.

   Three things this version answers that the previous four did not.

   **A zone now says what it is for.** A zone is only a boundary — it reports
   where a request came from, never what to do about it — but nobody writes one
   without an intention, and leaving that intention unrecorded made the library a
   flat list of address blocks you had to open to tell apart. `kind` records it:
   allowed, blocked, or custom for the ones that are genuinely just geography.
   Creating a zone now asks, which is the gap in the brief.

   **Two defaults ship, and neither can be deleted.** Every tenant gets an
   Allowed and a Blocked zone, so a rule can name one without checking first.
   They are editable — including down to empty — but not removable, because a
   rule written against a zone that later vanishes is a condition pointing at
   nothing. The delete control is absent on those two rather than present and
   disabled: a button that never works is a button that trains people to stop
   reading.

   **Both sections are on screen together.** The model is an AND of addresses
   and locations, and every previous version made you scroll from one operand to
   the other — which is a strange way to present a conjunction. Here they are two
   columns of equal weight, side by side, sized to the viewport. The page never
   scrolls; if one side has more entries than fit, that side scrolls inside its
   own panel and the other stays put.
   -------------------------------------------------------------------------- */

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'France', 'Singapore', 'Australia']
const CITIES = ['Pune', 'Bengaluru', 'Mumbai', 'London', 'Austin', 'Berlin', 'Singapore']

const KINDS: { id: ZoneKind; label: string; blurb: string; icon: typeof ShieldCheck }[] = [
  { id: 'allowed', label: 'Allowed', blurb: 'Somewhere you trust. Rules use it to relax a check.', icon: ShieldCheck },
  { id: 'blocked', label: 'Blocked', blurb: 'Somewhere you do not. Rules use it to deny or step up.', icon: Ban },
  { id: 'custom', label: 'Custom', blurb: 'Just a boundary. The rule decides what it means.', icon: Globe },
]

const kindOf = (k: ZoneKind) => KINDS.find((x) => x.id === k) ?? KINDS[2]

export function ZonesV5() {
  const store = useBrand()
  const reduce = useReducedMotion()

  const [selId, setSelId] = useState(store.zones[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null)

  const saved = store.zones.find((z) => z.id === selId) ?? store.zones[0]

  /* Grouped by what the zone is for. The two defaults sort to the top of their
     own group, so the pair a rule-writer reaches for first is the pair they
     see first. */
  const groups = useMemo(
    () =>
      KINDS.map((k) => ({
        ...k,
        zones: store.zones
          .filter((z) => z.kind === k.id)
          .sort((a, b) => Number(Boolean(b.locked)) - Number(Boolean(a.locked))),
      })).filter((g) => g.zones.length > 0),
    [store.zones],
  )

  function create(kind: ZoneKind, name: string) {
    const z: Zone = {
      id: `z${Date.now()}`,
      name: name.trim() || `New ${kind} zone`,
      kind,
      ip: [],
      asn: [],
      location: emptyLocation(),
      usedIn: 0,
    }
    store.addZone(z)
    setSelId(z.id)
    setCreating(false)
  }

  if (!saved) return null

  return (
    <div className="bpage bz6">
      <header className="bz6__head">
        <div>
          <h1>Zones</h1>
          <p>Named network and location boundaries that your policy rules reference.</p>
        </div>
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus size={15} strokeWidth={2.2} aria-hidden /> New zone
        </Button>
      </header>

      <div className="bz6__work">
        <aside className="bz6__rail">
          {groups.map((g) => (
            <section key={g.id} className="bz6__group">
              <h2>
                <span className={`bz6__kico is-${g.id}`} aria-hidden>
                  <g.icon size={13} strokeWidth={2} />
                </span>
                {g.label}
                <em>{g.zones.length}</em>
              </h2>
              {g.zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={`bz6__zone ${selId === z.id ? 'is-on' : ''}`}
                  onClick={() => {
                    setSelId(z.id)
                    setCreating(false)
                  }}
                >
                  <span className="bz6__zname">
                    {z.name}
                    {z.locked && <Lock size={11} strokeWidth={2.2} aria-label="Default zone" />}
                  </span>
                  <em>{summarise(z)}</em>
                </button>
              ))}
            </section>
          ))}
        </aside>

        {creating ? (
          <CreatePane onCancel={() => setCreating(false)} onCreate={create} />
        ) : (
          <Editor
            key={saved.id}
            zone={saved}
            reduce={!!reduce}
            onDelete={() => setConfirmDelete(saved)}
            onDuplicate={() => {
              const copy: Zone = { ...saved, id: `z${Date.now()}`, name: `${saved.name} (copy)`, usedIn: 0, locked: false }
              store.addZone(copy)
              setSelId(copy.id)
            }}
          />
        )}
      </div>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        width={430}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmDelete) return
                store.removeZone(confirmDelete.id)
                if (selId === confirmDelete.id) setSelId(store.zones.find((z) => z.id !== confirmDelete.id)?.id ?? '')
                setConfirmDelete(null)
              }}
            >
              Delete zone
            </Button>
          </>
        }
      >
        <p className="bz6__confirm">This cannot be undone. Rules naming it will point at nothing.</p>
      </Modal>
    </div>
  )
}

/* --- The editor: two operands, side by side ---------------------------------- */

function Editor({
  zone,
  reduce,
  onDelete,
  onDuplicate,
}: {
  zone: Zone
  reduce: boolean
  onDelete: () => void
  onDuplicate: () => void
}) {
  const store = useBrand()
  const [draft, setDraft] = useState<Zone>(zone)
  const set = (patch: Partial<Zone>) => setDraft({ ...draft, ...patch })

  const loud = useMemo(() => validateZone(draft).filter((i) => i.level !== 'info'), [draft])
  const dirty = JSON.stringify(zone) !== JSON.stringify(draft)
  const K = kindOf(draft.kind)

  return (
    <section className="bz6__pane">
      <header className="bz6__phead">
        <span className={`bz6__kico is-${draft.kind}`} aria-hidden>
          <K.icon size={15} strokeWidth={1.9} />
        </span>
        <input
          className="bz6__pname"
          aria-label="Zone name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />

        {/* The category is a first-class control, not a hidden property: it is
            what the rail groups by, so changing it moves the zone. */}
        <div className="bz6__kinds" role="radiogroup" aria-label="What this zone is for">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={draft.kind === k.id}
              className={`bz6__kind ${draft.kind === k.id ? 'is-on' : ''}`}
              title={k.blurb}
              onClick={() => set({ kind: k.id })}
            >
              <k.icon size={12} strokeWidth={2} aria-hidden />
              {k.label}
            </button>
          ))}
        </div>

        <span className="bz6__pspace" />
        <IconButton icon={Copy} label="Duplicate" size="sm" tone="ghost" onClick={onDuplicate} />
        {/* Absent on the defaults rather than disabled — a control that never
            works teaches people to stop reading the row it sits in. */}
        {zone.locked ? (
          <span className="bz6__locked">
            <Lock size={12} strokeWidth={2} aria-hidden />
            Default
            <TipDot text="One of the two zones every tenant ships with. Rules can assume it exists, so it can be emptied but not deleted." />
          </span>
        ) : (
          <IconButton icon={Trash2} label="Delete" size="sm" tone="danger" onClick={onDelete} />
        )}
      </header>

      {/* The two operands. Equal columns, both in view, and the AND between
          them drawn rather than described — it is the one thing about this
          model nobody guesses. */}
      <div className="bz6__split">
        <Panel
          icon={Network}
          title="Addresses and networks"
          count={draft.ip.length + draft.asn.length}
          empty="Any address"
          emptyHint="This half places no constraint, so the zone matches every address."
        >
          <Entries
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
            placeholder="203.0.113.0/24 or AS15169"
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
              const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
              const asns = parts.filter((x) => /^AS\d+$/i.test(x))
              set({ ip: [...draft.ip, ...parts.filter((x) => !/^AS\d+$/i.test(x))], asn: [...draft.asn, ...asns] })
            }}
          />
        </Panel>

        <div className="bz6__and" aria-hidden>
          <span />
          <em>AND</em>
          <span />
        </div>

        <Panel
          icon={Globe}
          title="Locations"
          count={draft.location.countries.length + draft.location.states.length + draft.location.cities.length + (draft.location.radius ? 1 : 0)}
          empty="Any location"
          emptyHint="This half places no constraint, so the zone matches every location."
        >
          <Locations loc={draft.location} onChange={(location) => set({ location })} />
        </Panel>
      </div>

      <footer className="bz6__pfoot">
        <p className="bz6__sentence">{sentence(draft)}</p>
        <AnimatePresence initial={false}>
          {loud.map((i) => (
            <motion.p
              key={i.id}
              className={`bz6__issue is-${i.level}`}
              initial={{ opacity: 0, y: reduce ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -4 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
            >
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
              <span>
                <strong>{i.title}.</strong> {i.detail}
              </span>
            </motion.p>
          ))}
        </AnimatePresence>
        <span className="bz6__pspace" />
        <span className="bz6__dirty">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
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
    </section>
  )
}

function Panel({
  icon: Icon,
  title,
  count,
  empty,
  emptyHint,
  children,
}: {
  icon: typeof Network
  title: string
  count: number
  empty: string
  emptyHint: string
  children: React.ReactNode
}) {
  return (
    <div className="bz6__half">
      <h3>
        <Icon size={15} strokeWidth={1.8} aria-hidden />
        {title}
        <em>{count}</em>
        {count === 0 && (
          <span className="bz6__any">
            {empty}
            <TipDot text={emptyHint} />
          </span>
        )}
      </h3>
      <div className="bz6__halfbody">{children}</div>
    </div>
  )
}

/* Every value is a live input. No pencil, no confirm — the two-click edit dance
   was an edit mode wearing a smaller hat. */
function Entries({
  rows,
  placeholder,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: { key: string; value: string; kind: string; bad: boolean }[]
  placeholder: string
  onChange: (key: string, next: string) => void
  onRemove: (key: string) => void
  onAdd: (raw: string) => void
}) {
  const [text, setText] = useState('')
  const commit = () => {
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className={`bz6__entry ${r.bad ? 'is-bad' : ''}`}>
          <input value={r.value} aria-label="Entry" onChange={(e) => onChange(r.key, e.target.value)} />
          <span>{r.kind}</span>
          <IconButton icon={Trash2} label={`Remove ${r.value}`} size="sm" tone="ghost" onClick={() => onRemove(r.key)} />
        </div>
      ))}
      <div className="bz6__entry is-add">
        <input
          value={text}
          placeholder={placeholder}
          aria-label="Add an entry"
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
    </>
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
    <>
      {picked.map((p) => (
        <div key={`${p.k}:${p.v}`} className="bz6__entry">
          <span className="bz6__static">{p.v}</span>
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
        <div className="bz6__entry">
          <span className="bz6__static">
            <input
              type="number"
              min={1}
              className="bz6__km"
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

      {/* A pool of what is left rather than a search field: there are a dozen
          candidates, and making somebody guess the spelling of a list this
          short is making them type for no reason. */}
      <div className="bz6__pool">
        {pool.map((p) => (
          <button key={`${p.k}:${p.v}`} type="button" onClick={() => onChange({ ...loc, [p.k]: [...loc[p.k], p.v] })}>
            <Plus size={11} strokeWidth={2.4} aria-hidden />
            {p.v}
          </button>
        ))}
        {!loc.radius && (
          <button
            type="button"
            className="is-radius"
            onClick={() => onChange({ ...loc, radius: { km: 25, lat: 18.5204, lon: 73.8567, label: 'Pune HQ' } })}
          >
            <MapPin size={11} strokeWidth={2.2} aria-hidden />
            Radius
          </button>
        )}
      </div>
    </>
  )
}

/* --- Create ------------------------------------------------------------------
   The category is asked for here, which is the gap the brief named: a zone made
   without one is a zone nobody can group, and every previous version made them
   that way. */

function CreatePane({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (kind: ZoneKind, name: string) => void
}) {
  const [kind, setKind] = useState<ZoneKind>('allowed')
  const [name, setName] = useState('')

  return (
    <section className="bz6__pane bz6__pane--new">
      <header className="bz6__phead">
        <span className="bz6__neweyebrow">New zone</span>
        <span className="bz6__pspace" />
        <IconButton icon={X} label="Cancel" size="sm" tone="ghost" onClick={onCancel} />
      </header>

      <div className="bz6__newbody">
        <label className="bz6__field">
          <span>Zone name</span>
          <input
            autoFocus
            value={name}
            placeholder={`New ${kind} zone`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate(kind, name)}
          />
        </label>

        <fieldset className="bz6__newkinds">
          <legend>What is it for?</legend>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              className={`bz6__newkind ${kind === k.id ? 'is-on' : ''}`}
              onClick={() => setKind(k.id)}
            >
              <span className={`bz6__kico is-${k.id}`} aria-hidden>
                <k.icon size={15} strokeWidth={1.9} />
              </span>
              <strong>{k.label}</strong>
              <em>{k.blurb}</em>
              {kind === k.id && (
                <span className="bz6__tick" aria-hidden>
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </fieldset>

        <p className="bz6__newnote">
          Both halves start empty, which means the zone matches everything until you fill one in.
        </p>
      </div>

      <footer className="bz6__pfoot">
        <span className="bz6__pspace" />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" onClick={() => onCreate(kind, name)}>
          Create zone
        </Button>
      </footer>
    </section>
  )
}

/* --- Phrasing ----------------------------------------------------------------- */

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
