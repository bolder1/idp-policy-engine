import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Globe, Link2, Network, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, Drawer, Modal } from '../kit'
import { EmptyState } from '../empty'
import type { Policy, Zone } from '../data'
import { emptyLocation, ipSectionEmpty, locationEmpty } from '../data'
import { useBrand } from '../store'
import { policiesUsing, rulesUsing } from './usage'
import { validateZone } from './zone-validation'
import { AddressSection, Chips, PlaceSection, addressBits, placeBits } from './ZonesFinal'

/* -----------------------------------------------------------------------------
   Zones · v2 — one zone, one kind.

   v1's zone has two halves, networks and places, ANDed. That is more expressive
   and it is the source of every awkward moment on the screen: a shape derived
   from what you happened to fill in rather than from anything you said, a tab
   bar on the inner page for two sections most zones only ever use one of, two
   columns in the table where one of them reads "Any location" on most rows, and
   a validator whose job is largely to catch combinations that were never
   intended.

   v2 asks the question first. You name a zone and say what it matches on;
   from there it is one list, one column, one section. The AND is gone, and with
   it the state where a zone constrains nothing because both halves are empty —
   an empty v2 zone is an empty list of one kind, which reads as unfinished
   rather than as a rule that quietly matches the internet.

   WHAT IT COSTS, stated plainly: v1 can express "Reliance Jio, in India" — one
   operator spans several countries and one country holds many operators, so
   neither half alone says what that zone says. v2 cannot. That zone opens here
   as its ASN and its location half is not shown. Nothing is deleted: v2 only
   edits the half a zone declares, so the other survives untouched and v1 still
   renders it whole. Whether the expressiveness is worth the screen is the
   question this version exists to answer.

   The two sections are v1's own — `AddressSection` and `PlaceSection` are
   imported rather than copied, so the actual work of entering an address or
   picking a country is identical in both versions and the comparison is about
   the arrangement, which is the only thing that changed.
   -------------------------------------------------------------------------- */

type MatchOn = 'net' | 'loc'

/* Read rather than assumed, because a zone made in v1 has no answer to this.
   Falling back on content keeps every existing zone openable: it has addresses,
   so it is a network zone. */
const matchOf = (z: Zone): MatchOn => z.matchOn ?? (ipSectionEmpty(z) ? 'loc' : 'net')

const KIND: Record<MatchOn, { label: string; blurb: string; icon: typeof Network; tint: string }> = {
  net: {
    label: 'IP networks',
    blurb: 'Addresses, CIDR blocks and whole network operators. Where a request comes from on the network.',
    icon: Network,
    tint: 'blue',
  },
  loc: {
    label: 'Locations',
    blurb: 'Countries, regions, cities, or a radius around a point. Where a request comes from on the map.',
    icon: Globe,
    tint: 'green',
  },
}

export function ZonesV2() {
  const store = useBrand()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const open = openId ? store.zones.find((z) => z.id === openId) ?? null : null

  const create = (name: string, matchOn: MatchOn) => {
    const zone: Zone = {
      id: `z-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${store.zones.length}`,
      name: name.trim(),
      kind: 'custom',
      matchOn,
      ip: [],
      asn: [],
      location: emptyLocation(),
      usedIn: 0,
    }
    store.addZone(zone)
    setCreating(false)
    /* Straight inside. A zone that has been named and typed but holds nothing
       is not a zone yet, and landing back on the list would imply it was. */
    setOpenId(zone.id)
  }

  return (
    <div className="bpage bz7">
      {open ? (
        <ZoneDetailV2
          zone={open}
          policies={store.policies}
          onBack={() => setOpenId(null)}
          onChange={store.updateZone}
          onDelete={() => {
            store.removeZone(open.id)
            store.showToast(`${open.name} deleted`)
            setOpenId(null)
          }}
        />
      ) : (
        <>
          <header className="bz7__head">
            <div>
              <h1>Zones</h1>
              <p>Named boundaries — IP networks or places — that your policy rules reference.</p>
            </div>
            <div className="bz7__headactions">
              <Button variant="brand" onClick={() => setCreating(true)}>
                <Plus size={15} strokeWidth={2.2} aria-hidden />
                New zone
              </Button>
            </div>
          </header>

          {store.zones.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No zones yet"
              blurb="A named boundary your policy rules can point at."
              action={
                <Button variant="brand" onClick={() => setCreating(true)}>
                  <Plus size={15} strokeWidth={2.2} aria-hidden />
                  Create your first zone
                </Button>
              }
            />
          ) : (
            <ZoneTableV2 zones={store.zones} policies={store.policies} onOpen={setOpenId} />
          )}
        </>
      )}

      <NewZoneModal open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  )
}

/* --- The list -----------------------------------------------------------------
   Three columns where v1 has four. "IP networks" and "Locations" were two
   columns of which every row filled exactly one and wrote "Any …" in the other
   — a column of absences. Declaring the kind collapses them into a Type and a
   Contains, and the table stops describing what each zone is NOT. */
function ZoneTableV2({
  zones,
  policies,
  onOpen,
}: {
  zones: Zone[]
  policies: Policy[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="bz7__table bz8__table" role="table">
      <div className="bz7__trow bz8__trow bz7__thead" role="row">
        <span role="columnheader">Zone</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Contains</span>
        <span role="columnheader">Used by</span>
      </div>

      {zones.map((z) => {
        const on = matchOf(z)
        const meta = KIND[on]
        const uses = rulesUsing('zone', z.id, policies)
        const items = on === 'net' ? addressBits(z) : placeBits(z.location)
        return (
          <div className="bz7__trow bz8__trow" role="row" key={z.id}>
            <span role="cell" className="bz7__tname">
              {/* Grey. The chip in the next column already names the kind in
                  the kind's colour, and tinting the mark as well says it twice
                  on one row. */}
              <span className="bz7__tile bz7__tile--sm" aria-hidden>
                <meta.icon size={13} strokeWidth={1.9} />
              </span>
              <button type="button" className="bz7__open" onClick={() => onOpen(z.id)}>
                {z.name}
              </button>
            </span>

            <span role="cell">
              <i className={`bz8__kind is-${meta.tint}`}>{meta.label}</i>
            </span>

            {/* Empty is empty, not "any". A v2 zone with nothing in it is
                unfinished — it cannot match everything, because there is no
                second half left open to match on. */}
            <span role="cell" className="bz7__tcell">
              {items.length === 0 ? (
                <em className="bz8__unset">Nothing yet</em>
              ) : (
                <Chips items={items} max={3} />
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

/* --- The inner page -----------------------------------------------------------
   One section, and no tab bar over it. The kind was chosen when the zone was
   named, so there is nothing here to switch between — which is the whole point
   of asking first. */
function ZoneDetailV2({
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
  const store = useBrand()
  const [showUses, setShowUses] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(zone.name)

  const on = matchOf(zone)
  const meta = KIND[on]
  const users = policiesUsing('zone', zone.id, policies)
  /* v1's validator, minus the three findings that only exist because v1 has
     two halves.

     "Any network" and "Any location" report a half left open, which in v1 means
     the zone matches everything through it — a real and easily-missed defect.
     A v2 zone has no second half to leave open, so the same notice would be
     describing the absence of a thing the zone was never going to have. Same
     for the exact-address-AND-a-location warning: there is no AND.

     What survives is what always mattered — an unnamed zone, an empty one, a
     malformed address or ASN. */
  const TWO_HALF_ONLY = ['any-address', 'any-location', 'exact-vs-location']
  const issues = validateZone(zone).filter((i) => !TWO_HALF_ONLY.includes(i.id))

  const commitName = () => {
    const name = draftName.trim()
    setRenaming(false)
    if (!name || name === zone.name) {
      setDraftName(zone.name)
      return
    }
    onChange({ ...zone, name })
    store.showToast(`Renamed to ${name}`)
  }

  const count =
    on === 'net'
      ? zone.ip.length + zone.asn.length
      : zone.location.countries.length +
        zone.location.states.length +
        zone.location.cities.length +
        (zone.location.radius ? 1 : 0)

  return (
    <>
      <button type="button" className="bz7__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All zones
      </button>

      {/* Two groups, not three. `bz7__pagehead` is space-between, so a loose
          tile between the name and the actions pushes the name to the middle of
          the row — the mark belongs with the name it marks. */}
      <header className="bz7__pagehead">
        <div className="bz8__pagelead">
          <span className="bz7__tile" aria-hidden>
            <meta.icon size={15} strokeWidth={1.8} />
          </span>

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
                <Pencil size={13} strokeWidth={2} aria-hidden />
              </button>
            </span>
          )}
          {/* The kind is stated, not offered. Changing it would mean throwing
              away whatever is in the half you are leaving, which is a delete
              wearing a dropdown — so it is a property of the zone, decided once
              when it is made. */}
            <p>
              {meta.label} ·{' '}
              {count === 0 ? 'nothing yet' : `${count} entr${count === 1 ? 'y' : 'ies'}`}
            </p>
          </div>
        </div>

        <div className="bz7__actions">
          <Button variant="secondary" size="sm" onClick={() => setShowUses(true)}>
            <Link2 size={14} strokeWidth={1.9} aria-hidden />
            Used by
            <i className="bz7__usecount">{users.length}</i>
          </Button>
          <Button variant="secondary" size="sm" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.9} aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {/* v1's validator, unchanged, and most of what it reports cannot happen
          here: the two-halves warnings have no combination left to fire on. The
          ones that remain are the ones that always mattered — a malformed
          address, an empty zone. */}
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

      {on === 'net' ? (
        <AddressSection draft={zone} onChange={onChange} />
      ) : (
        <PlaceSection draft={zone} onChange={onChange} />
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
            icon={Link2}
            title="Nothing references this zone"
            blurb="Safe to change or delete."
          />
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
      </Drawer>
    </>
  )
}

/* --- Creating -----------------------------------------------------------------
   Two questions on one screen, because both are one answer long and the second
   one decides the whole of the next page. v1 asks only for a name and lets the
   shape emerge from what you type afterwards; here the kind IS the zone, so it
   is asked where the name is. */
function NewZoneModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string, matchOn: MatchOn) => void
}) {
  const [name, setName] = useState('')
  const [matchOn, setMatchOn] = useState<MatchOn>('net')

  /* Cleared on the way in, not out — a reset on close either snaps the dialog
     back while it is still animating away, or races the next open. */
  useEffect(() => {
    if (!open) return
    setName('')
    setMatchOn('net')
  }, [open])

  const named = name.trim().length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New zone"
      width={520}
      footer={
        <>
          <span className="bz7__footnote">
            {named ? 'Add what it contains on the next screen.' : 'Name the zone to continue.'}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!named} onClick={() => onCreate(name, matchOn)}>
            Create zone
          </Button>
        </>
      }
    >
      <div className="bz8__form">
        <label className="bz8__field">
          <span>Zone name</span>
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="Mumbai office"
            onChange={(e) => setName(e.target.value)}
          />
          <span className="bz8__hint">
            A policy rule names a zone the way it names a profile, so name it after the boundary it
            draws.
          </span>
        </label>

        <fieldset className="bz8__kinds">
          <legend>What it matches on</legend>
          {(Object.keys(KIND) as MatchOn[]).map((k) => {
            const m = KIND[k]
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={matchOn === k}
                className={`bz8__kindcard ${matchOn === k ? 'is-on' : ''}`}
                onClick={() => setMatchOn(k)}
              >
                <span className="bz8__kindico" aria-hidden>
                  <m.icon size={17} strokeWidth={1.8} />
                </span>
                <span className="bz8__kindbody">
                  <strong>{m.label}</strong>
                  <em>{m.blurb}</em>
                </span>
              </button>
            )
          })}
        </fieldset>

        {/* Said before it is chosen rather than discovered afterwards. It is the
            one thing about this dialog that is not obvious: the answer is not
            revisitable, because changing it would mean discarding whatever the
            zone had collected under the other kind. */}
        <p className="bz8__note">
          A zone is one or the other. Pick the wrong one and the zone is quick to delete and
          remake — but it cannot be converted, because the entries would have nowhere to go.
        </p>
      </div>
    </Modal>
  )
}

/* `locationEmpty` is imported for the same reason `ipSectionEmpty` is: `matchOf`
   needs to answer for a v1 zone that never declared a kind, and "has it got
   addresses" is the question that answers it. */
void locationEmpty
