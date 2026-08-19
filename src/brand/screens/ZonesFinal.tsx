import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Globe,
  Infinity as InfinityIcon,
  LayoutGrid,
  Layers,
  List,
  MapPin,
  Network,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { Button, Modal, TipDot } from '../kit'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  type Policy,
  type Zone,
  type ZoneLocation,
} from '../data'
import { coveredBy, placeContext, searchPlaces, type Place } from '../places'
import { useBrand } from '../store'
import { canSaveZone, classifyIp, describeZone, validateZone } from './zone-validation'
import { parseEntries } from './zone-entries'

/* -----------------------------------------------------------------------------
   Zones · final.

   Three things separate this from the five versions before it.

   ONE. Creation is a popup that collects the whole zone — name, addresses,
   places — before it exists. Every earlier version created an empty shell and
   dropped you into an editor to fill it, which is why every earlier version
   also needed the editor to be the main event. Collect it up front and the
   detail page stops being a mandatory second step.

   TWO. The popup does create AND edit, and the inner page is therefore a
   read-only answer to "what is this, and what breaks if I change it". Two
   editors for one object is how two editors drift.

   THREE. An empty section is drawn LOUDER than a full one. This is the whole
   subtlety of the model: an empty section matches ANY, not none, so a zone with
   no addresses and no places matches every request on earth. Every previous
   version rendered that as small muted grey — the visual language of "nothing
   here" — which is the exact inverse of what it means. Here it is a filled,
   bordered band that outweighs the chips beside it, tinted with the same
   `--fb-info-*` the linter already grades that state as.

   The allowed/blocked classification v5 introduced is gone, as asked. `kind`
   stays on the model because v5 still renders it; nothing here surfaces it and
   everything created here is 'custom'.
   -------------------------------------------------------------------------- */

type View = 'cards' | 'list'
type Shape = 'net' | 'loc' | 'both' | 'none'

/* Derived, never stored — which is what stops it drifting the way `usedIn`
   did. It is also the taxonomy that replaces `kind`: not what a zone is FOR,
   which only the rule knows, but which half of the AND it actually constrains. */
function shapeOf(z: Zone): Shape {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return 'both'
  if (net) return 'net'
  if (loc) return 'loc'
  return 'none'
}

const SHAPE: Record<Shape, { label: string; icon: typeof Network; tint: string }> = {
  net: { label: 'Addresses', icon: Network, tint: 'blue' },
  loc: { label: 'Locations', icon: Globe, tint: 'green' },
  both: { label: 'Both', icon: Layers, tint: 'indigo' },
  none: { label: 'Matches everything', icon: AlertTriangle, tint: 'warn' },
}

export function ZonesFinal() {
  const store = useBrand()
  /* Table first. Cards are the better browse and the table is the better
     answer — and by the time a tenant has more than a handful of zones, the
     question is almost always "which one has that address in it", which is a
     column scan. Cards stay one click away. */
  const [view, setView] = useState<View>('list')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /* One editor. `null` closed, `'new'` creating, an id editing. */
  const [editing, setEditing] = useState<string | null>(null)

  const open = openId ? store.zones.find((z) => z.id === openId) ?? null : null
  const draftOf = editing && editing !== 'new' ? store.zones.find((z) => z.id === editing) ?? null : null

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return store.zones
    return store.zones.filter(
      (z) =>
        z.name.toLowerCase().includes(needle) ||
        z.ip.some((v) => v.toLowerCase().includes(needle)) ||
        z.asn.some((v) => v.toLowerCase().includes(needle)) ||
        [...z.location.countries, ...z.location.states, ...z.location.cities].some((v) =>
          v.toLowerCase().includes(needle),
        ),
    )
  }, [store.zones, q])

  const save = (z: Zone) => {
    if (editing === 'new') store.addZone(z)
    else store.updateZone(z)
    setEditing(null)
    store.showToast(editing === 'new' ? `${z.name} created` : `${z.name} saved`)
  }

  return (
    <div className="bpage bz7">
      {open ? (
        <ZoneDetail
          zone={open}
          policies={store.policies}
          onBack={() => setOpenId(null)}
          onEdit={() => setEditing(open.id)}
          onDuplicate={() => {
            const copy: Zone = { ...open, id: `z-${open.id}-copy`, name: `${open.name} (copy)`, usedIn: 0 }
            store.addZone(copy)
            store.showToast(`${copy.name} created`)
          }}
          onDelete={() => {
            store.removeZone(open.id)
            setOpenId(null)
            store.showToast(`${open.name} deleted`)
          }}
        />
      ) : (
        <>
          <header className="bz7__head">
            <div>
              <h1>Zones</h1>
              <p>Named boundaries — addresses, networks and places — that your policy rules reference.</p>
            </div>
            <Button variant="brand" onClick={() => setEditing('new')}>
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              New zone
            </Button>
          </header>

          {store.zones.length === 0 ? (
            <EmptyState onCreate={() => setEditing('new')} />
          ) : (
            <>
              <div className="bz7__toolbar">
                <label className="bz7__search">
                  <Search size={15} strokeWidth={1.9} aria-hidden />
                  <input
                    type="text"
                    value={q}
                    placeholder="Search zones, addresses or places…"
                    aria-label="Search zones"
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <span className="bz7__count">
                  {shown.length} of {store.zones.length}
                </span>
                <div className="bviewswitch bz7__viewswitch" role="tablist" aria-label="View">
                  <button
                    role="tab"
                    aria-selected={view === 'cards'}
                    aria-label="Card view"
                    className={view === 'cards' ? 'is-on' : ''}
                    onClick={() => setView('cards')}
                  >
                    <LayoutGrid size={15} strokeWidth={1.9} aria-hidden />
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === 'list'}
                    aria-label="List view"
                    className={view === 'list' ? 'is-on' : ''}
                    onClick={() => setView('list')}
                  >
                    <List size={15} strokeWidth={1.9} aria-hidden />
                  </button>
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="bz7__none">
                  Nothing matches “{q}”.{' '}
                  <button type="button" className="bz7__link" onClick={() => setQ('')}>
                    Clear
                  </button>
                </p>
              ) : view === 'cards' ? (
                <ul className="bz7__grid">
                  {shown.map((z) => (
                    <ZoneCard key={z.id} zone={z} policies={store.policies} onOpen={() => setOpenId(z.id)} />
                  ))}
                </ul>
              ) : (
                <ZoneTable zones={shown} policies={store.policies} onOpen={setOpenId} />
              )}
            </>
          )}
        </>
      )}

      <ZoneFormModal
        open={editing !== null}
        zone={draftOf}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </div>
  )
}

/* --- Empty ---------------------------------------------------------------------- */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bz7__empty">
      <span className="bz7__empty-ico" aria-hidden>
        <MapPin size={26} strokeWidth={1.6} />
      </span>
      <h2>No zones yet</h2>
      <p>
        A zone is a named boundary you can point a rule at — an office egress range, a country, a
        network operator. Rules use them to relax a check inside somewhere you trust, or to step one
        up outside it.
      </p>
      {/* The one thing an empty state here has to teach, because getting it
          backwards is the model's sharpest edge. */}
      <p className="bz7__empty-note">
        A zone has two halves — addresses and places — and both must match. Leave one empty and it
        places no constraint at all.
      </p>
      <Button variant="brand" onClick={onCreate}>
        <Plus size={15} strokeWidth={2.2} aria-hidden />
        Create your first zone
      </Button>
    </div>
  )
}

/* --- Card ------------------------------------------------------------------------ */

/* The "matches anything" band. Deliberately the loudest thing on the card.

   The dangerous misreading is that a blank half means "off". A filled, bordered
   band that outweighs the chips next to it cannot read as blank — and it is
   tinted with the same info tone `validateZone` already grades this state as,
   so the card's colour is the linter's verdict rather than a second opinion. */
function AnyBand({ what }: { what: string }) {
  return (
    <span className="bz7__any">
      <InfinityIcon size={13} strokeWidth={2} aria-hidden />
      Any {what}
    </span>
  )
}

function addressBits(z: Zone): string[] {
  const out: string[] = []
  if (z.ip.length) out.push(`${z.ip.length} address${z.ip.length === 1 ? '' : 'es'}`)
  /* ASNs get named, addresses get counted. Nobody recognises 198.51.100.0/24,
     so six of them is six units of noise; everybody recognises "Reliance Jio". */
  for (const a of z.asn) out.push(ASN_DIRECTORY[a] ?? a)
  return out
}

function placeBits(l: ZoneLocation): string[] {
  const out = [...l.countries, ...l.states, ...l.cities]
  if (l.radius) out.push(l.radius.label ?? `${l.radius.km}km radius`)
  return out
}

function Chips({ items, max = 3 }: { items: string[]; max?: number }) {
  const rest = items.length - max
  return (
    <>
      {items.slice(0, max).map((v) => (
        <i className="bz7__chip" key={v}>
          {v}
        </i>
      ))}
      {rest > 0 && <i className="bz7__chip is-more">+{rest}</i>}
    </>
  )
}

function ZoneCard({ zone, policies, onOpen }: { zone: Zone; policies: Policy[]; onOpen: () => void }) {
  const shape = shapeOf(zone)
  const meta = SHAPE[shape]
  const uses = rulesUsing(zone.id, policies)
  const worst = validateZone(zone).find((i) => i.level === 'error') ?? validateZone(zone).find((i) => i.level === 'warning')

  return (
    <li className="bz7__card">
      <div className="bz7__cardhead">
        <span className={`bz7__tile is-${meta.tint}`} aria-hidden>
          <meta.icon size={16} strokeWidth={1.9} />
        </span>
        {/* The whole tile is the target, but the name is the button — a kebab
            cannot nest inside a button, and the stretched ::after keeps one tab
            stop rather than one per card region. */}
        <button type="button" className="bz7__open" onClick={onOpen}>
          {zone.name}
        </button>
      </div>

      <div className="bz7__ops">
        <div className="bz7__op">
          <Network size={13} strokeWidth={1.9} aria-hidden />
          {ipSectionEmpty(zone) ? <AnyBand what="address" /> : <Chips items={addressBits(zone)} />}
        </div>
        <span className="bz7__and" aria-hidden>
          AND
        </span>
        <div className="bz7__op">
          <Globe size={13} strokeWidth={1.9} aria-hidden />
          {locationEmpty(zone.location) ? (
            <AnyBand what="location" />
          ) : (
            <Chips items={placeBits(zone.location)} />
          )}
        </div>
      </div>

      <div className="bz7__cardfoot">
        <span className={uses === 0 ? 'is-quiet' : ''}>
          {uses === 0 ? 'Not used by any rule' : `Used by ${uses} rule${uses === 1 ? '' : 's'}`}
        </span>
        {worst && (
          <span className={`bz7__flag is-${worst.level}`} title={worst.detail}>
            <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
            {worst.title}
          </span>
        )}
      </div>
    </li>
  )
}

/* --- List ------------------------------------------------------------------------- */

function ZoneTable({
  zones,
  policies,
  onOpen,
}: {
  zones: Zone[]
  policies: Policy[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="bz7__table" role="table">
      <div className="bz7__trow bz7__thead" role="row">
        <span role="columnheader" />
        <span role="columnheader">Zone</span>
        <span role="columnheader">Addresses</span>
        {/* The conjunction, stated once for the whole screen rather than
            repeated into every row's summary string. */}
        <span role="columnheader" className="bz7__andhead">
          AND
        </span>
        <span role="columnheader">Locations</span>
        <span role="columnheader">Used by</span>
      </div>
      {zones.map((z) => {
        const meta = SHAPE[shapeOf(z)]
        const uses = rulesUsing(z.id, policies)
        return (
          <div className="bz7__trow" role="row" key={z.id}>
            <span role="cell" className={`bz7__tile bz7__tile--sm is-${meta.tint}`} aria-hidden>
              <meta.icon size={13} strokeWidth={1.9} />
            </span>
            <span role="cell">
              <button type="button" className="bz7__open" onClick={() => onOpen(z.id)}>
                {z.name}
              </button>
            </span>
            <span role="cell" className="bz7__tcell">
              {ipSectionEmpty(z) ? <AnyBand what="address" /> : <Chips items={addressBits(z)} max={2} />}
            </span>
            <span role="cell" className="bz7__andcell" aria-hidden />
            <span role="cell" className="bz7__tcell">
              {locationEmpty(z.location) ? (
                <AnyBand what="location" />
              ) : (
                <Chips items={placeBits(z.location)} max={2} />
              )}
            </span>
            <span role="cell" className={`bz7__tuses ${uses === 0 ? 'is-quiet' : ''}`}>
              {uses === 0 ? '—' : `${uses} rule${uses === 1 ? '' : 's'}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* --- Inner page --------------------------------------------------------------------
   Read-only. The popup owns editing, so this answers the two questions a list
   cannot: exactly what is in here, and what breaks if it changes. */

function ZoneDetail({
  zone,
  policies,
  onBack,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  zone: Zone
  policies: Policy[]
  onBack: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const meta = SHAPE[shapeOf(zone)]
  const issues = validateZone(zone)
  const users = policiesUsing(zone.id, policies)

  return (
    <>
      <button type="button" className="bz7__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All zones
      </button>

      {/* A banner, not a page title.

          The name alone answers nothing — "Office Network" could be two
          addresses or two hundred. The sentence underneath is what the zone
          actually matches, written out, and it is the only line on this page an
          admin can check against what they meant. */}
      <header className={`bz7__hero is-${meta.tint}`}>
        <span className="bz7__heroicon" aria-hidden>
          <meta.icon size={26} strokeWidth={1.7} />
        </span>
        <div className="bz7__herotext">
          <h1>{zone.name}</h1>
          <p>{describeZone(zone)}</p>
        </div>
        <div className="bz7__actions">
          <Button variant="secondary" size="sm" onClick={onDuplicate}>
            <Copy size={14} strokeWidth={1.9} aria-hidden />
            Duplicate
          </Button>
          <Button variant="secondary" size="sm" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.9} aria-hidden />
            Delete
          </Button>
          <Button variant="brand" size="sm" onClick={onEdit}>
            Edit zone
          </Button>
        </div>
      </header>

      {issues.length > 0 && (
        <div className="bz7__issues">
          {issues.map((i) => (
            <p key={i.id} className={`bz7__issue is-${i.level}`}>
              <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
              <span>
                <strong>{i.title}.</strong> {i.detail}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="bz7__panes">
        <section className="bz7__pane">
          <h3>
            <Network size={13} strokeWidth={2} aria-hidden />
            Addresses and networks
          </h3>
          {ipSectionEmpty(zone) ? (
            <AnyBand what="address" />
          ) : (
            <ul className="bz7__values">
              {zone.ip.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                  <em>{classifyIp(v)}</em>
                </li>
              ))}
              {zone.asn.map((a) => (
                <li key={a}>
                  <code>{a}</code>
                  <em>{ASN_DIRECTORY[a] ?? 'network operator'}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <span className="bz7__paneand" aria-hidden>
          AND
        </span>

        <section className="bz7__pane">
          <h3>
            <Globe size={13} strokeWidth={2} aria-hidden />
            Locations
          </h3>
          {locationEmpty(zone.location) ? (
            <AnyBand what="location" />
          ) : (
            <ul className="bz7__values">
              {zone.location.countries.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                  <em>country</em>
                </li>
              ))}
              {zone.location.states.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                  <em>state</em>
                </li>
              ))}
              {zone.location.cities.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                  <em>city</em>
                </li>
              ))}
              {zone.location.radius && (
                <li>
                  <code>{zone.location.radius.label ?? 'Radius'}</code>
                  <em>{zone.location.radius.km}km</em>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="bz7__pane">
        <h3>Used by</h3>
        {users.length === 0 ? (
          <p className="bz7__none">
            No rule references this zone. It can be changed or deleted without affecting anything.
          </p>
        ) : (
          <ul className="bz7__uses">
            {users.map((u) => (
              <li key={u.policy.id}>
                <strong>{u.policy.name}</strong>
                <span>{u.rules.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/* --- The popup ---------------------------------------------------------------------
   One form, two titles. Creating and editing are the same shape of decision and
   two components for it is how two components drift. */

const blank = (): Zone => ({
  id: '',
  name: '',
  /* v6 does not surface the classification, so everything it makes is custom.
     The field stays because v5 still reads it. */
  kind: 'custom',
  ip: [],
  asn: [],
  location: emptyLocation(),
  usedIn: 0,
})

function ZoneFormModal({
  open,
  zone,
  onClose,
  onSave,
}: {
  open: boolean
  zone: Zone | null
  onClose: () => void
  onSave: (z: Zone) => void
}) {
  const [draft, setDraft] = useState<Zone>(zone ?? blank())
  const [seeded, setSeeded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  /* Re-seed when the modal opens on a different subject. Keyed on the id rather
     than the object, because the store replaces the array on every write and
     the object identity changes without the subject changing. */
  const subject = zone?.id ?? 'new'
  if (open && seeded !== subject) {
    setSeeded(subject)
    setDraft(zone ? { ...zone, location: { ...zone.location } } : blank())
    setConfirming(false)
  }
  if (!open && seeded !== null) setSeeded(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(zone ?? blank())
  const ok = draft.name.trim().length > 0 && canSaveZone(draft)

  const close = () => {
    if (dirty && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={zone ? `Edit ${zone.name}` : 'New zone'}
      width={980}
      footer={
        confirming ? (
          <>
            <span className="bz7__footnote">Discard your changes?</span>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onClose}>
              Discard
            </Button>
          </>
        ) : (
          <>
            <span className="bz7__footnote">{describeDraft(draft)}</span>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={!ok}
              onClick={() =>
                onSave({
                  ...draft,
                  id: draft.id || `z-${draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                  name: draft.name.trim(),
                })
              }
            >
              {zone ? 'Save changes' : 'Create zone'}
            </Button>
          </>
        )
      }
    >
      <div className="bz7__form">
        <label className="bz7__field">
          <span>Zone name</span>
          <input
            type="text"
            value={draft.name}
            placeholder="Pune office egress"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        {/* Side by side, because the two halves are ANDed and reading an AND
            top-to-bottom makes the second condition look like a consequence of
            the first. Left and right, with the conjunction between them, is the
            shape of the thing being described. */}
        <div className="bz7__cols">
          <AddressSection draft={draft} onChange={setDraft} />
          <span className="bz7__formand" aria-hidden>
            AND
          </span>
          <PlaceSection draft={draft} onChange={setDraft} />
        </div>
      </div>
    </Modal>
  )
}

function describeDraft(z: Zone): string {
  const net = ipSectionEmpty(z)
  const loc = locationEmpty(z.location)
  if (net && loc) return 'This zone would match every request. Add an address or a place.'
  if (net) return 'Any address, in the places below.'
  if (loc) return 'The addresses below, anywhere in the world.'
  return 'The addresses below, and only in the places below.'
}

/* --- Addresses ---------------------------------------------------------------------
   One field for both. An admin pasting a block of network identifiers does not
   sort them into IPs and ASNs first, and asking them to is asking them to do
   the parsing this file can do itself. */

/* The quick-add row.

   THIS IP IS MOCKED. A browser cannot see its own public address without asking
   a server, and this prototype has no backend and a CSP that blocks external
   calls — so the value below is a documentation-range placeholder standing in
   for what the real console would fill from the request. The affordance is the
   point; the number is not real and should not be read as one. */
const CURRENT_IP = '203.0.113.42'

const QUICK: { label: string; value: string; hint: string }[] = [
  { label: 'My current IP', value: CURRENT_IP, hint: 'The address this session is coming from' },
]

function AddressSection({ draft, onChange }: { draft: Zone; onChange: (z: Zone) => void }) {
  const [text, setText] = useState('')

  const add = () => {
    const { ip, asn, bad } = parseEntries(text, draft.ip, draft.asn)
    if (ip.length === draft.ip.length && asn.length === draft.asn.length && bad.length === 0) return
    onChange({ ...draft, ip, asn })
    /* Whatever did not parse stays in the box so it can be corrected rather
       than silently swallowed. */
    setText(bad.join(' '))
  }

  const rows = [
    ...draft.ip.map((v) => ({ v, kind: classifyIp(v) as string, asn: false })),
    ...draft.asn.map((v) => ({ v, kind: ASN_DIRECTORY[v] ?? 'network operator', asn: true })),
  ]

  return (
    <section className="bz7__sec">
      <header>
        <h4>
          <Network size={13} strokeWidth={2} aria-hidden />
          Addresses and networks
          {/* Written from what `classifyIp` and `isValidAsn` actually accept,
              not from the format note the reference showed — that one omits
              IPv6 and ASNs, both of which parse here, and a help text that
              undersells the field is why people paste one value at a time. */}
          <TipDot
            label="What you can paste here"
            text={
              <>
                One per line, or separated by commas or spaces. Every entry is checked as you add it.
                <br />
                <br />
                <strong>A single address</strong> — 10.0.0.1 or 2001:db8::1
                <br />
                <strong>A CIDR block</strong> — 192.168.0.0/24 or 2001:db8::/32
                <br />
                <strong>A range</strong>, ends joined by a dash — 192.168.0.1-192.168.0.254
                <br />
                <strong>A network operator</strong>, by ASN — AS15169
                <br />
                <br />
                Anything that does not parse stays in the box so you can fix it.
              </>
            }
          />
        </h4>
        <span>{rows.length === 0 ? 'Any address' : `${rows.length} entries`}</span>
      </header>

      <div className="bz7__add">
        <input
          type="text"
          value={text}
          placeholder="203.0.113.0/24, 10.0.0.1, AS15169 — paste as many as you like"
          aria-label="Add addresses or networks"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>

      {/* Quick add, pinned under the field.

          Two of the three most-typed entries on this form are the machine you
          are sitting at and the network it is on — an admin allow-listing the
          office does it from the office. One click each beats typing an address
          you have to go and look up first. */}
      <div className="bz7__quick">
        <span>Quick add</span>
        {QUICK.map((q) => {
          const already = draft.ip.includes(q.value)
          return (
            <button
              key={q.value}
              type="button"
              className={`bz7__quickbtn ${already ? 'is-in' : ''}`}
              disabled={already}
              title={q.hint}
              onClick={() => onChange({ ...draft, ip: [...draft.ip, q.value] })}
            >
              {already ? <Check size={12} strokeWidth={2.6} aria-hidden /> : <Plus size={12} strokeWidth={2.4} aria-hidden />}
              {q.label}
              <code>{q.value}</code>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <AnyBand what="address" />
      ) : (
        <ul className="bz7__entries">
          {rows.map((r) => (
            <li key={r.v}>
              <code>{r.v}</code>
              <em>{r.kind}</em>
              <button
                type="button"
                aria-label={`Remove ${r.v}`}
                onClick={() =>
                  onChange(
                    r.asn
                      ? { ...draft, asn: draft.asn.filter((x) => x !== r.v) }
                      : { ...draft, ip: draft.ip.filter((x) => x !== r.v) },
                  )
                }
              >
                <X size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* --- Places -------------------------------------------------------------------------
   The map-style search. Type anything — a country, a state, a city — and the
   catalogue ranks the hits rather than filtering them, so three letters that
   match a country and a city inside it offer the country first. */

function PlaceSection({ draft, onChange }: { draft: Zone; onChange: (z: Zone) => void }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const hits = useMemo(() => searchPlaces(q), [q])
  const l = draft.location

  const put = (next: ZoneLocation) => onChange({ ...draft, location: next })

  const addPlace = (p: Place) => {
    const key = p.kind === 'country' ? 'countries' : p.kind === 'state' ? 'states' : 'cities'
    if (l[key].includes(p.name)) return
    let next: ZoneLocation = { ...l, [key]: [...l[key], p.name] }
    /* The reverse sweep. Adding India after Pune makes Pune redundant, and
       leaving it there would imply the zone is narrower than it is. */
    if (p.kind === 'country') {
      next = {
        ...next,
        states: next.states.filter((s) => !inCountry(s, p.name, 'state')),
        cities: next.cities.filter((c) => !inCountry(c, p.name, 'city')),
      }
    }
    put(next)
    setQ('')
    setCursor(0)
  }

  const remove = (kind: keyof Pick<ZoneLocation, 'countries' | 'states' | 'cities'>, v: string) =>
    put({ ...l, [kind]: l[kind].filter((x) => x !== v) })

  const chosen: { kind: 'countries' | 'states' | 'cities'; v: string; label: string }[] = [
    ...l.countries.map((v) => ({ kind: 'countries' as const, v, label: 'Country' })),
    ...l.states.map((v) => ({ kind: 'states' as const, v, label: 'State' })),
    ...l.cities.map((v) => ({ kind: 'cities' as const, v, label: 'City' })),
  ]

  return (
    <section className="bz7__sec">
      <header>
        <h4>
          <Globe size={13} strokeWidth={2} aria-hidden />
          Locations
        </h4>
        <span>{chosen.length === 0 ? 'Any location' : `${chosen.length} selected`}</span>
      </header>

      <div className="bz7__combo">
        <label className="bz7__add">
          <Search size={14} strokeWidth={1.9} aria-hidden />
          <input
            type="text"
            value={q}
            placeholder="Search any country, state or city…"
            aria-label="Search places"
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (!hits.length) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => (c + 1) % hits.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => (c - 1 + hits.length) % hits.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                addPlace(hits[cursor])
              }
            }}
          />
        </label>

        {q.trim() !== '' && (
          <ul className="bz7__hits" role="listbox" aria-label="Place results">
            {hits.length === 0 && <li className="bz7__nohit">No place matches “{q}”.</li>}
            {hits.map((p, i) => {
              const covered = coveredBy(p, {
                countries: l.countries,
                states: l.states,
                cities: l.cities,
              })
              const already =
                (p.kind === 'country' && l.countries.includes(p.name)) ||
                (p.kind === 'state' && l.states.includes(p.name)) ||
                (p.kind === 'city' && l.cities.includes(p.name))
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={`bz7__hit ${i === cursor ? 'is-cursor' : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => addPlace(p)}
                  >
                    <MapPin size={13} strokeWidth={1.9} aria-hidden />
                    <span className="bz7__hitname">{p.name}</span>
                    <span className="bz7__hitctx">{placeContext(p)}</span>
                    {already ? (
                      <i className="bz7__hitnote">
                        <Check size={11} strokeWidth={2.6} aria-hidden /> added
                      </i>
                    ) : (
                      /* Adding a city to a zone that already holds its country
                         changes nothing. Saying so beats letting it look like
                         it narrowed something. */
                      covered && <i className="bz7__hitnote is-warn">already covered by {covered}</i>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {chosen.length === 0 ? (
        <AnyBand what="location" />
      ) : (
        <ul className="bz7__entries">
          {chosen.map((c) => (
            <li key={`${c.kind}-${c.v}`}>
              <code>{c.v}</code>
              <em>{c.label.toLowerCase()}</em>
              <button type="button" aria-label={`Remove ${c.v}`} onClick={() => remove(c.kind, c.v)}>
                <X size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* --- Helpers --------------------------------------------------------------------- */

/* Whether a state or city name sits inside a country, asked of the catalogue
   rather than guessed from the string. */
function inCountry(name: string, country: string, kind: 'state' | 'city'): boolean {
  return searchPlaces(name, 40).some((p) => p.kind === kind && p.name === name && p.country === country)
}

function rulesUsing(zoneId: string, policies: Policy[]): number {
  return policies.reduce(
    (n, p) =>
      n +
      p.rules.filter((r) =>
        r.conditions.some((c) => c.typeId === 'zone' && c.values.includes(zoneId)),
      ).length,
    0,
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
