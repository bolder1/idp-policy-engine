import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Globe,
  Infinity as InfinityIcon,
  LayoutGrid,
  Layers,
  Link2,
  List,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'

import { Button, Drawer, Modal } from '../kit'
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
import { EmptyState } from '../empty'
import { classifyIp, describeZone, isValidAsn, validateZone } from './zone-validation'
import { parseEntries } from './zone-entries'
import { policiesUsing, rulesUsing } from './usage'
import { UsedByList } from './used-by'

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

/* "IP networks", not "Addresses".

   A zone has two halves and they were called Addresses and Locations, which
   are not opposites — an address IS a location, and a reader working out which
   tab holds what had to know in advance that one of them meant the network
   sense of the word and the other meant the geographic one. Naming the first
   half after the thing it actually holds ends the overlap: one half is where
   the request comes FROM on the network, the other is where it comes from on
   the map. ASNs live in this half too, and an ASN is a set of networks, so the
   name still covers everything the field accepts. */
const SHAPE: Record<Shape, { label: string; icon: typeof Network; tint: string }> = {
  net: { label: 'IP networks', icon: Network, tint: 'blue' },
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
  const open = openId ? store.zones.find((z) => z.id === openId) ?? null : null

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

  /* The only way in. See NameOnlyModal. */
  const [naming, setNaming] = useState(false)

  const createByName = (name: string) => {
    const id = `z-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${store.zones.length}`
    store.addZone({ ...blank(), id, name: name.trim() })
    setNaming(false)
    /* Straight to the inner page. The zone exists and matches nothing yet,
       which is exactly the state the page is being asked to make workable. */
    setOpenId(id)
  }

  return (
    <div className="bpage bz7">
      {open ? (
        <ZoneDetail
          zone={open}
          policies={store.policies}
          onBack={() => setOpenId(null)}
          onChange={store.updateZone}
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
              <p>Named boundaries — IP networks and places — that your policy rules reference.</p>
            </div>
            {/* Hidden while the page is empty, because the empty state below
                already offers this and two brand buttons on one screen make a
                reader work out whether they do the same thing. It comes back
                the moment there is a list for it to sit above. */}
            {store.zones.length > 0 && (
            <div className="bz7__headactions">
              {/* One way in now.

                 Two sat here while the question was open: a panel that asked
                 everything before it would commit, and a dialog that commits a
                 name and lets the inner page carry the rest. The second one
                 won, so the first is gone and the winner takes the plain name.

                 The panel itself survives — it is still what "Edit zone" opens,
                 which is the job it was always better at: changing something
                 that already exists and already has a shape. */}
              <Button variant="brand" onClick={() => setNaming(true)}>
                <Plus size={15} strokeWidth={2.2} aria-hidden />
                New zone
              </Button>
            </div>
            )}
          </header>

          {store.zones.length === 0 ? (
            <ZonesEmpty onCreate={() => setNaming(true)} />
          ) : (
            <>
              <div className="bz7__toolbar">
                <label className="bz7__search">
                  <Search size={15} strokeWidth={1.9} aria-hidden />
                  <input
                    type="text"
                    value={q}
                    placeholder="Search zones, networks or places…"
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
                <ZoneTable
                zones={shown}
                policies={store.policies}
                onOpen={setOpenId}
                onDuplicate={(z) => {
                  const copy: Zone = {
                    ...z,
                    id: `z-${z.id}-copy-${store.zones.length}`,
                    name: `${z.name} (copy)`,
                    usedIn: 0,
                  }
                  store.addZone(copy)
                  store.showToast(`${copy.name} created`)
                }}
                onDelete={(z) => {
                  store.removeZone(z.id)
                  store.showToast(`${z.name} deleted`)
                }}
              />
              )}
            </>
          )}
        </>
      )}

      <NameOnlyModal open={naming} onClose={() => setNaming(false)} onCreate={createByName} />
    </div>
  )
}

/* --- Empty ---------------------------------------------------------------------- */

function ZonesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={Network}
      title="No zones yet"
      /* Named things, not a definition. "A named boundary your policy rules
         can point at" is the page caption reworded — true of a zone, a
         profile and a hook alike, and so of no use to somebody deciding
         whether they want one. Three examples of an actual zone say it in
         the same space. */
      blurb="An office IP range, a country you operate in, a hosting provider nobody should sign in from — named once here, then reused by every rule that needs it."
      /* The one thing this screen has to teach, because getting it backwards is
         the model's sharpest edge. */
      action={
        <Button variant="brand" onClick={onCreate}>
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          Create your first zone
        </Button>
      }
    />
  )
}

/* --- Card ------------------------------------------------------------------------ */

/* The "matches anything" band. Deliberately the loudest thing on the card.

   The dangerous misreading is that a blank half means "off". A filled, bordered
   band that outweighs the chips next to it cannot read as blank — and it is
   tinted with the same info tone `validateZone` already grades this state as,
   so the card's colour is the linter's verdict rather than a second opinion. */
export function AnyBand({ what }: { what: string }) {
  return (
    <span className="bz7__any">
      <InfinityIcon size={13} strokeWidth={2} aria-hidden />
      Any {what}
    </span>
  )
}

export function addressBits(z: Zone): string[] {
  const out: string[] = []
  /* Counted as networks rather than addresses, matching the half's own name —
     and more accurate for it, since one entry here can be a single host, a /16
     or an entire ASN. */
  if (z.ip.length) out.push(`${z.ip.length} network${z.ip.length === 1 ? '' : 's'}`)
  /* ASNs get named, addresses get counted. Nobody recognises 198.51.100.0/24,
     so six of them is six units of noise; everybody recognises "Reliance Jio". */
  for (const a of z.asn) out.push(ASN_DIRECTORY[a] ?? a)
  return out
}

export function placeBits(l: ZoneLocation): string[] {
  const out = [...l.countries, ...l.states, ...l.cities]
  if (l.radius) out.push(l.radius.label ?? `${l.radius.km}km radius`)
  return out
}

export function Chips({ items, max = 3 }: { items: string[]; max?: number }) {
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
  const uses = rulesUsing('zone', zone.id, policies)
  /* One pass, two questions. This read `validateZone(zone).find(error) ??
     validateZone(zone).find(warning)`, which ran the whole validation — every
     entry through the IP classifier — a second time for every card without an
     error, which is most of them. */
  const issues = validateZone(zone)
  const worst = issues.find((i) => i.level === 'error') ?? issues.find((i) => i.level === 'warning')

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
          {ipSectionEmpty(zone) ? <AnyBand what="network" /> : <Chips items={addressBits(zone)} />}
        </div>
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
  onDuplicate,
  onDelete,
}: {
  zones: Zone[]
  policies: Policy[]
  onOpen: (id: string) => void
  onDuplicate: (z: Zone) => void
  onDelete: (z: Zone) => void
}) {
  /* Which row's menu is open, by id. One at a time, and the page closes it on
     any click that is not the kebab — same contract the policies table uses, so
     the two tables behave identically. */
  const [menuFor, setMenuFor] = useState<string | null>(null)

  /* Picking an item closes the menu — see the same helper in
     DeviceFingerprintV2. Delete hid this by taking the row away with it;
     Duplicate left the menu open over a table that had just grown a row. */
  const choose = (run: () => void) => {
    setMenuFor(null)
    run()
  }

  return (
    <div className="bz7__table" role="table" onClick={() => setMenuFor(null)}>
      <div className="bz7__trow bz7__thead" role="row">
        <span role="columnheader">Zone</span>
        <span role="columnheader">IP networks</span>
        <span role="columnheader">Locations</span>
        <span role="columnheader">Used by</span>
        <span role="columnheader" />
      </div>
      {zones.map((z) => {
        const meta = SHAPE[shapeOf(z)]
        const uses = rulesUsing('zone', z.id, policies)
        return (
          <div className="bz7__trow" role="row" key={z.id}>
            {/* Icon and name in ONE cell, not two.

                The icon had a column of its own, which meant the header's first
                column was empty and every name started 30px further right than
                the word "Zone" above it — a gutter down the left of the table
                holding nothing but a 22px square. The icon is a property of the
                name, so it lives with it. */}
            <span role="cell" className="bz7__tname">
              <span className={`bz7__tile bz7__tile--sm is-${meta.tint}`} aria-hidden>
                <meta.icon size={13} strokeWidth={1.9} />
              </span>
              <button type="button" className="bz7__open" onClick={() => onOpen(z.id)}>
                {z.name}
              </button>
            </span>
            <span role="cell" className="bz7__tcell">
              {ipSectionEmpty(z) ? <AnyBand what="network" /> : <Chips items={addressBits(z)} max={2} />}
            </span>
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

            {/* The row's own actions. They were only reachable by opening the
                zone first, which made "delete the one I just made by mistake" a
                two-page job. */}
            <span role="cell" className="bz7__menuwrap">
              <button
                type="button"
                className="bz7__kebab"
                aria-label={`Actions for ${z.name}`}
                aria-expanded={menuFor === z.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuFor((m) => (m === z.id ? null : z.id))
                }}
              >
                ⋯
              </button>
              <AnimatePresence>
                {menuFor === z.id && (
                  <motion.div
                    className="bmenu"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.13 }}
                    onClick={(e) => e.stopPropagation()}
                    role="menu"
                  >
                    <button role="menuitem" onClick={() => choose(() => onOpen(z.id))}>
                      <Eye size={14} strokeWidth={1.9} aria-hidden />
                      View details
                    </button>
                    <button role="menuitem" onClick={() => choose(() => onDuplicate(z))}>
                      <Copy size={14} strokeWidth={1.9} aria-hidden />
                      Duplicate
                    </button>
                    <span className="bmenu__rule" />
                    <button role="menuitem" className="is-danger" onClick={() => choose(() => onDelete(z))}>
                      <Trash2 size={14} strokeWidth={1.9} aria-hidden />
                      Delete zone
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
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
  onChange,
  onDelete,
}: {
  zone: Zone
  policies: Policy[]
  onBack: () => void
  onChange: (z: Zone) => void
  onDelete: () => void
}) {
  /* For navigation only. "Used by" that cannot be followed makes you memorise a
     policy name, leave, and search for it — the one thing the list exists to
     save you. */
  const store = useBrand()
  /* "Used by" is a panel now, not a section. It is the question you ask BEFORE
     changing something and then not again — so it earns a button at the top and
     none of the page's vertical space the rest of the time. */
  const [showUses, setShowUses] = useState(false)

  /* Renaming, in place. The name was the one thing on this page you could not
     change: every other field saves as it is typed, and the heading above them
     was read-only, so fixing a typo meant deleting the zone and building it
     again. Rules reference zones BY NAME, so the rename is also the one edit
     here with a consequence worth confirming — hence a commit and a toast
     rather than a field that saves silently like the rest. */
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(zone.name)

  const commitName = () => {
    const name = draftName.trim()
    setRenaming(false)
    /* An empty name is not a rename, it is a mistake — and validateZone already
       errors on one, so accepting it here would be creating the error the panel
       below is about to complain about. */
    if (!name || name === zone.name) {
      setDraftName(zone.name)
      return
    }
    onChange({ ...zone, name })
    store.showToast(`Renamed to ${name}`)
  }
  const issues = validateZone(zone)
  const users = policiesUsing('zone', zone.id, policies)

  const netCount = zone.ip.length + zone.asn.length
  const placeCount =
    zone.location.countries.length + zone.location.states.length + zone.location.cities.length

  /* Which half is on screen. Always one of them, including on a zone that has
     just been named and holds nothing.

     It used to be a pair of checkboxes: tick a half to reveal its form, untick
     to hide it and throw its contents away. A checkbox that deletes data on
     untick is a destructive control wearing the least destructive affordance
     there is, and both halves rendered at once, so a zone with two hundred
     addresses buried its locations under a scroll.

     It then had a third state — nothing chosen — which showed an empty state
     offering the two ways in. That was a click to reveal a form the page could
     simply have shown, on a page whose only purpose is to fill that form in.
     An empty zone opens on Addresses with the field ready. */
  const [tab, setTab] = useState<'net' | 'place'>(
    netCount === 0 && placeCount > 0 ? 'place' : 'net',
  )

  return (
    <>
      <button type="button" className="bz7__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All zones
      </button>

      {/* A heading, not a banner.

          This was a tinted hero that changed colour with the zone's shape —
          amber when it matched everything, blue for addresses, green for
          places. The tint was doing a job the page already does better: a zone
          that constrains nothing is an error the validator raises by name
          ("This zone would match everything"), in the panel below with the
          reason attached. What was left was a coloured slab whose colour meant
          something you had to learn.

          Same shape as every other inner page here: back link, name, one line
          of what it is, actions on the right. */}
      <header className="bz7__pagehead">
        <div className="bz7__namewrap">
          {renaming ? (
            <input
              className="bz7__nameinput"
              value={draftName}
              autoFocus
              aria-label="Zone name"
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                /* Escape restores rather than saves. A rename you are halfway
                   through is not a rename you asked for. */
                if (e.key === 'Escape') {
                  setDraftName(zone.name)
                  setRenaming(false)
                }
              }}
            />
          ) : (
            <span className="bz7__nameline">
              <h1>{zone.name}</h1>
              <button
                type="button"
                className="bz7__rename"
                aria-label={`Rename ${zone.name}`}
                onClick={() => {
                  setDraftName(zone.name)
                  setRenaming(true)
                }}
              >
                <Pencil size={14} strokeWidth={1.9} aria-hidden />
              </button>
            </span>
          )}
          <p>{describeZone(zone)}</p>
        </div>
        <div className="bz7__actions">
          {/* Carries the count, so the answer to "does anything depend on this"
              is on the page without opening anything — and opening it is only
              needed for WHICH. */}
          <Button variant="secondary" size="sm" onClick={() => setShowUses(true)}>
            <Link2 size={14} strokeWidth={1.9} aria-hidden />
            Used by
            <i className="bz7__usecount">{users.length}</i>
          </Button>
          {/* No Edit button for the zone's CONTENTS, and none needed: the
              sections below save as they are typed, so "edit" is just being on
              the page. The name is the exception, and it has its own control
              beside the heading it changes. */}
          {/* Danger, not neutral. The kit reserves red for the confirming
              control inside a destructive dialog, on the argument that a
              trigger only opens that dialog. It is the one action on this
              header that destroys something a rule may be pointing at, and
              looking identical to "Used by" beside it is the wrong kind of
              quiet. */}
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.9} aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {/* The adding, on the page rather than behind an Edit button.

          This is the half of "New zone 2" that matters. The panel is a form you
          fill in and submit; here the zone already exists, so every change is
          saved as it is made and the page can be left and returned to. That is
          the difference worth comparing — not the modal, which is one field. */}
      <section className="bz7__build">
            {/* Both tabs, always — including the empty one.

                It is how the second facet gets added once the first exists, and
                the count on each says which is which without opening it. */}
            <div className="bz7__buildtabs" role="tablist" aria-label="What this zone matches on">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'net'}
                className={tab === 'net' ? 'is-on' : ''}
                onClick={() => setTab('net')}
              >
                <Network size={14} strokeWidth={1.9} aria-hidden />
                IP networks
                <em>{netCount}</em>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'place'}
                className={tab === 'place' ? 'is-on' : ''}
                onClick={() => setTab('place')}
              >
                <Globe size={14} strokeWidth={1.9} aria-hidden />
                Locations
                <em>{placeCount}</em>
              </button>
            </div>

            {tab === 'net' ? (
              <AddressSection draft={zone} onChange={onChange} />
            ) : (
              <PlaceSection draft={zone} onChange={onChange} />
            )}
      </section>

      {/* Only the issues the empty state does not already carry. "Matches
          everything" is the empty state, so repeating it underneath was the
          same sentence twice on one screen. */}
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

      <Drawer
        open={showUses}
        onClose={() => setShowUses(false)}
        title="Used by"
        caption={`Policy rules that name ${zone.name}.`}
      >
        {users.length === 0 ? (
          <EmptyState
            compact
            icon={Unlink}
            title="Nothing references this zone"
            blurb="No policy rule points at it, so renaming or deleting it changes nothing."
          />
        ) : (
          /* This screen's own card, which is where the shared one came from —
             its rule chips said the rule names and stopped there. */
          <UsedByList users={users} />
        )}
      </Drawer>
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

/* --- The other way in --------------------------------------------------------------
   "New zone 2": one field, then the inner page.

   It exists to test the opposite bet from the panel. The panel asks for
   everything and commits once, which is right when the answer is short and
   wrong when it is four hundred networks pasted in three goes — a form you
   cannot leave is a form you cannot come back to. This one commits the only
   thing that has to be decided up front, the name a rule will refer to, and
   treats the contents as work done on a page that already exists and already
   saves.

   The zone it creates matches nothing, which is not a broken state: the list
   already renders "Any network, anywhere" for it, and the detail page opens
   asking what it should match on. */
function NameOnlyModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')

  const close = () => {
    setName('')
    onClose()
  }

  const go = () => {
    if (name.trim()) onCreate(name)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Name the zone"
      width={460}
      footer={
        <>
          <span className="bz7__footnote">You choose what it matches on next.</span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!name.trim()} onClick={go}>
            Create and open
          </Button>
        </>
      }
    >
      <label className="bz7__field">
        <span>Zone name</span>
        <input
          type="text"
          value={name}
          autoFocus
          placeholder="Pune office egress"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go()
            }
          }}
        />
      </label>
    </Modal>
  )
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

export function AddressSection({ draft, onChange }: { draft: Zone; onChange: (z: Zone) => void }) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('')
  /* Says what the last paste did. A paste of four hundred lines that silently
     drops sixty is the worst version of this field, so both numbers are
     reported: what went in, and what did not. */
  const [note, setNote] = useState<string | null>(null)

  const total = draft.ip.length + draft.asn.length

  /* One entry open for editing, by value — the list is keyed by value and
     values are unique within a zone, so there is nothing else to key on. */
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editErr, setEditErr] = useState<string | null>(null)

  const startEdit = (v: string) => {
    setEditing(v)
    setEditText(v)
    setEditErr(null)
  }

  /* A typo in one address used to mean removing it and retyping it, which on a
     long list also meant finding it again afterwards — the new value appends to
     the end. Editing keeps the row where it is. */
  const commitEdit = (old: string, wasAsn: boolean) => {
    const next = editText.trim()
    if (!next || next === old) {
      setEditing(null)
      return
    }

    const asAsn = isValidAsn(next)
    const asIp = classifyIp(next) !== 'invalid'
    if (!asAsn && !asIp) {
      setEditErr('Not an address, CIDR block, range or ASN.')
      return
    }
    if (draft.ip.includes(next) || draft.asn.includes(next)) {
      setEditErr('Already in this zone.')
      return
    }

    /* Same kind: replaced where it sits, so the order somebody pasted survives.
       Different kind: it has to move lists, and the end is the only honest
       place for it — there is no position in `asn` that corresponds to one in
       `ip`. */
    let ip = draft.ip
    let asn = draft.asn
    if (asAsn === wasAsn) {
      if (asAsn) asn = draft.asn.map((x) => (x === old ? next : x))
      else ip = draft.ip.map((x) => (x === old ? next : x))
    } else {
      ip = draft.ip.filter((x) => x !== old)
      asn = draft.asn.filter((x) => x !== old)
      if (asAsn) asn = [...asn, next]
      else ip = [...ip, next]
    }

    onChange({ ...draft, ip, asn })
    setEditing(null)
    setEditErr(null)
  }

  const add = () => {
    const { ip, asn, bad } = parseEntries(text, draft.ip, draft.asn)
    if (ip.length === draft.ip.length && asn.length === draft.asn.length && bad.length === 0) return

    /* No ceiling. There was a 500 cap here and it was ours, not the field's —
       a zone is a list of networks and the number of networks an estate has is
       not something this form gets to decide. What is left is the reporting:
       a paste says how much of it landed, because a list arriving from
       somewhere else is one nobody counted first. */
    onChange({ ...draft, ip, asn })

    const added = ip.length - draft.ip.length + (asn.length - draft.asn.length)
    setNote(
      [
        added > 0 ? added + ' added' : null,
        bad.length > 0 ? bad.length + ' could not be read' : null,
      ]
        .filter(Boolean)
        .join(' \u00b7 ') || null,
    )
    /* Whatever did not parse stays in the box so it can be corrected rather
       than silently swallowed. */
    setText(bad.join(' '))
  }

  /* Memoized because this list has no ceiling — the paste box deliberately
     accepts as many networks as an estate has, and classifyIp is a run of
     regexes per entry. Unmemoized it re-classified the whole list on every
     keystroke into the paste box and the filter, which are exactly the two
     fields receiving keystrokes while the list is long. */
  const all = useMemo(
    () => [
      ...draft.ip.map((v) => ({ v, kind: classifyIp(v) as string, asn: false })),
      ...draft.asn.map((v) => ({ v, kind: ASN_DIRECTORY[v] ?? 'network operator', asn: true })),
    ],
    [draft.ip, draft.asn],
  )
  /* A filter, not a search: it hides rows rather than ranking them, because the
     question at four hundred entries is "is 10.2.x in here" and the answer is
     the row or nothing. Only offered once scrolling starts. */
  const needle = filter.trim().toLowerCase()
  const rows = useMemo(
    () => (needle ? all.filter((r) => r.v.toLowerCase().includes(needle) || r.kind.toLowerCase().includes(needle)) : all),
    [all, needle],
  )

  return (
    <section className="bz7__sec">
      <header>
        <h4>
          <Network size={13} strokeWidth={2} aria-hidden />
          IP addresses and networks
        </h4>
        <span>{total === 0 ? 'Any network' : `${total} ${total === 1 ? 'entry' : 'entries'}`}</span>
      </header>

      {/* What this field takes, before anything is typed into it.

          It was a `?` on the heading. A tip is right for a sentence somebody
          may want once; it is wrong for the reference you need BEFORE acting,
          because the cost of not knowing is a rejected paste and the cost of
          finding out is a deliberate hover on a mark that looks optional. The
          field's own placeholder can only ever show three examples.

          Written from what `classifyIp` and `isValidAsn` actually accept, not
          from the format note the reference showed — that one omits IPv6 and
          ASNs, both of which parse here, and a help text that undersells the
          field is why people paste one value at a time. */}
      <div className="bz7__formats">
        <span className="bz7__formatslead">Accepts</span>
        <ul>
          <li>
            <code>10.0.0.1</code>
            <em>a single address, v4 or v6</em>
          </li>
          <li>
            <code>192.168.0.0/24</code>
            <em>a CIDR block</em>
          </li>
          <li>
            <code>192.168.0.1-192.168.0.254</code>
            <em>a range</em>
          </li>
          <li>
            <code>AS15169</code>
            <em>a network operator</em>
          </li>
        </ul>
        <p>
          One per line, or separated by commas or spaces. Anything that does not parse stays in the
          box so you can fix it.
        </p>
      </div>

      <div className="bz7__add">
        <input
          type="text"
          value={text}
          /* Three examples, no sentence. The banner above lists every accepted
             format in full, so the placeholder only has to show the SHAPE — and
             at sixty characters the old one was longer than the field on a
             narrow panel and clipped mid-word. */
          placeholder="10.0.0.1, 192.168.0.0/24, AS15169"
          aria-label="Add IP addresses or networks"
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

      {note && (
        <p className="bz7__note" role="status">
          {note}
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">
            <X size={12} strokeWidth={2.2} />
          </button>
        </p>
      )}

      {/* Both only earn their place once the list is long enough to lose
          something in. Eight is about where a column stops being scannable. */}
      {all.length > 8 && (
        <div className="bz7__listbar">
          <label className="bz7__filter">
            <Search size={13} strokeWidth={1.9} aria-hidden />
            <input
              type="search"
              value={filter}
              placeholder={`Filter ${all.length} entries…`}
              aria-label="Filter entries"
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="bz7__clear"
            onClick={() => {
              onChange({ ...draft, ip: [], asn: [] })
              setFilter('')
              setNote(null)
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {all.length === 0 ? (
        <AnyBand what="network" />
      ) : rows.length === 0 ? (
        <p className="bz7__gate">Nothing matches “{filter.trim()}”.</p>
      ) : (
        <ul className="bz7__entries is-scroll">
          {rows.map((r) =>
            editing === r.v ? (
              <li key={r.v} className="is-editing">
                {/* The same row, in a field. Not a dialog: an address is one
                    short string, and a modal to change four characters costs
                    more than it protects. */}
                <input
                  type="text"
                  className="bz7__editin"
                  value={editText}
                  autoFocus
                  aria-label={`Edit ${r.v}`}
                  aria-invalid={editErr ? true : undefined}
                  onChange={(e) => {
                    setEditText(e.target.value)
                    setEditErr(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitEdit(r.v, r.asn)
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditing(null)
                      setEditErr(null)
                    }
                  }}
                />
                {editErr && <span className="bz7__editerr">{editErr}</span>}
                <button type="button" aria-label="Save" onClick={() => commitEdit(r.v, r.asn)}>
                  <Check size={13} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => {
                    setEditing(null)
                    setEditErr(null)
                  }}
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </li>
            ) : (
              <li key={r.v}>
                <code>{r.v}</code>
                <em>{r.kind}</em>
                <button type="button" aria-label={`Edit ${r.v}`} onClick={() => startEdit(r.v)}>
                  <Pencil size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="bz7__entrydel"
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
            ),
          )}
        </ul>
      )}
    </section>
  )
}

/* --- Places -------------------------------------------------------------------------
   The map-style search. Type anything — a country, a state, a city — and the
   catalogue ranks the hits rather than filtering them, so three letters that
   match a country and a city inside it offer the country first. */

export function PlaceSection({ draft, onChange }: { draft: Zone; onChange: (z: Zone) => void }) {
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
