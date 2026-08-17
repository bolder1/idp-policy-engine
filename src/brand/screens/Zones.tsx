import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { AlertTriangle, Globe, Info, MapPin, Network, Plus, XCircle } from 'lucide-react'

import { PageHead } from '../Shell'
import { Badge, Button, Callout } from '../kit'
import {
  ASN_DIRECTORY,
  emptyLocation,
  ipSectionEmpty,
  locationEmpty,
  type Zone,
  type ZoneLocation,
} from '../data'
import { useBrand } from '../store'
import { canSaveZone, classifyIp, describeZone, validateZone, type ZoneIssue } from './zone-validation'

/* -----------------------------------------------------------------------------
   Network zones — one zone, two optional sections, ANDed.

   The spec's four UX requirements drive the layout directly:

   · The AND is drawn between the two section cards, not described in a hint.
     It is the operator that makes the model non-obvious, so it gets the same
     treatment the builder gives its spine: a visible connector on the page.
   · An empty section reads "Any address" / "Any location" in place of a blank,
     because a blank field reads as unset and unset reads as restrictive — the
     exact opposite of what an empty section does here.
   · IP and ASN sit in separate sub-sections with different input treatments,
     because one takes dotted quads and the other takes an operator id.
   · Errors block the save; warnings do not. The exact-address warning is the
     admin's judgement call, so it informs rather than forbids.
   -------------------------------------------------------------------------- */

const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Germany', 'France', 'Singapore', 'Australia']
const STATES = ['Maharashtra', 'Karnataka', 'Tamil Nadu', 'California', 'Texas', 'New York', 'Bavaria']
const CITIES = ['Pune', 'Bengaluru', 'Mumbai', 'London', 'Austin', 'Berlin', 'Singapore']

export function Zones() {
  const store = useBrand()
  const [sel, setSel] = useState(store.zones[0].id)
  const saved = store.zones.find((z) => z.id === sel)!
  const [draft, setDraft] = useState<Zone>(saved)

  // Switching zones abandons an in-progress edit, so it is explicit.
  function select(id: string) {
    setSel(id)
    setDraft(store.zones.find((z) => z.id === id)!)
  }

  const issues = useMemo(() => validateZone(draft), [draft])
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const blocked = !canSaveZone(draft)

  const dependents = store.policies.filter((p) =>
    p.rules.some((r) => r.conditions.some((c) => c.typeId === 'zone' && c.values.includes(sel))),
  )

  const set = (patch: Partial<Zone>) => setDraft({ ...draft, ...patch })
  const setLoc = (patch: Partial<ZoneLocation>) => set({ location: { ...draft.location, ...patch } })

  function newZone() {
    const z: Zone = {
      id: `z${Date.now()}`,
      name: 'New zone',
      ip: [],
      asn: [],
      location: emptyLocation(),
      usedIn: 0,
    }
    store.addZone(z)
    setSel(z.id)
    setDraft(z)
  }

  return (
    <div className="bpage">
      <PageHead
        title="Network zones"
        caption="A zone is an address range, a geography, or both together. Rules reference zones by name."
        actions={
          <Button variant="brand" onClick={newZone}>
            New zone
          </Button>
        }
      />

      <div className="bmaster">
        <aside className="bmaster__list">
          {store.zones.map((z) => (
            <button
              key={z.id}
              type="button"
              className={`bmaster__item ${sel === z.id ? 'is-on' : ''}`}
              onClick={() => select(z.id)}
            >
              <span>
                {z.name}
                <em className="bzone__sub">{describeZone(z)}</em>
              </span>
              {z.usedIn > 0 && <Badge tone="neutral">{z.usedIn}</Badge>}
            </button>
          ))}
        </aside>

        <div className="bzone">
          <div className="bcard bzone__name">
            <label htmlFor="zone-name">
              <span className="bname2__label">
                Zone name <i>*</i>
              </span>
              <span className="bname2__help">How this zone appears in rule conditions.</span>
            </label>
            <input
              id="zone-name"
              type="text"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>

          {/* ---- Section 1 — IP Zone ---- */}
          <section className={`bzone__sec ${ipSectionEmpty(draft) ? 'is-any' : ''}`}>
            <header className="bzone__sechead">
              <span className="bzone__secn">1</span>
              <span className="bzone__secbody">
                <h3>
                  <Network size={15} strokeWidth={1.8} aria-hidden /> IP Zone
                </h3>
                <p>The network addresses this zone covers. Optional.</p>
              </span>
              {ipSectionEmpty(draft) && <span className="bzone__anytag">Any address</span>}
            </header>

            <div className="bzone__subs">
              <TokenField
                label="IP"
                hint="IPv4 or IPv6 address, a CIDR block, or a range."
                placeholder="203.0.113.0/24"
                empty="Any address"
                mono
                values={draft.ip}
                onChange={(ip) => set({ ip })}
                validate={(v) => (classifyIp(v) === 'invalid' ? 'Not a valid address' : null)}
                annotate={(v) => IP_LABEL[classifyIp(v)]}
                examples={['203.0.113.45', '203.0.113.0/24', '203.0.113.10 – 203.0.113.60', '2001:db8::/32']}
              />

              <TokenField
                label="ASN"
                hint="A whole network operator, for when the addresses cannot be listed."
                placeholder="AS15169"
                empty="Any network"
                values={draft.asn}
                onChange={(asn) => set({ asn })}
                validate={(v) => (/^AS\d{1,10}$/i.test(v.trim()) ? null : 'An ASN is “AS” then digits')}
                annotate={(v) => ASN_DIRECTORY[v.trim().toUpperCase()] ?? 'Unknown operator'}
                examples={Object.keys(ASN_DIRECTORY).slice(0, 4)}
              />
            </div>
          </section>

          {/* The operator, drawn. A request must satisfy both sections, and that
              is the one thing about this model nobody guesses correctly. */}
          <div className="bzone__and" aria-hidden>
            <span className="bzone__andline" />
            <span className="bzone__andpill">AND</span>
            <span className="bzone__andline" />
          </div>
          <p className="bzone__andnote">
            A request is inside this zone only if it matches <strong>both</strong> sections. An empty section
            means <strong>any</strong>.
          </p>

          {/* ---- Section 2 — Location ---- */}
          <section className={`bzone__sec ${locationEmpty(draft.location) ? 'is-any' : ''}`}>
            <header className="bzone__sechead">
              <span className="bzone__secn">2</span>
              <span className="bzone__secbody">
                <h3>
                  <Globe size={15} strokeWidth={1.8} aria-hidden /> Location
                </h3>
                <p>The geographic area this zone covers. Optional.</p>
              </span>
              {locationEmpty(draft.location) && <span className="bzone__anytag">Any location</span>}
            </header>

            <div className="bzone__geo">
              <PickField
                label="Country"
                empty="Any country"
                options={COUNTRIES}
                values={draft.location.countries}
                onChange={(countries) => setLoc({ countries })}
              />
              <PickField
                label="State / region"
                empty="Any state"
                options={STATES}
                values={draft.location.states}
                onChange={(states) => setLoc({ states })}
              />
              <PickField
                label="City"
                empty="Any city"
                options={CITIES}
                values={draft.location.cities}
                onChange={(cities) => setLoc({ cities })}
              />

              <div className="bzone__radius">
                <span className="u-label">
                  <MapPin size={13} strokeWidth={1.9} aria-hidden /> Radius
                </span>
                {draft.location.radius ? (
                  <div className="bzone__radiusrow">
                    <input
                      type="number"
                      min={1}
                      aria-label="Radius in kilometres"
                      value={draft.location.radius.km}
                      onChange={(e) =>
                        setLoc({ radius: { ...draft.location.radius!, km: Number(e.target.value) } })
                      }
                    />
                    <span>km of</span>
                    <input
                      type="text"
                      aria-label="Latitude, longitude"
                      value={`${draft.location.radius.lat}, ${draft.location.radius.lon}`}
                      onChange={(e) => {
                        const [lat, lon] = e.target.value.split(',').map((n) => Number(n.trim()))
                        if (!Number.isNaN(lat) && !Number.isNaN(lon))
                          setLoc({ radius: { ...draft.location.radius!, lat, lon } })
                      }}
                    />
                    <button type="button" onClick={() => setLoc({ radius: undefined })} aria-label="Remove the radius">
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="bzone__add"
                    onClick={() => setLoc({ radius: { km: 25, lat: 18.5204, lon: 73.8567 } })}
                  >
                    <Plus size={13} strokeWidth={2.2} aria-hidden /> Add a radius
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ---- What this zone resolves to, and anything wrong with it ---- */}
          <div className="bzone__resolve">
            <span className="u-label">This zone matches</span>
            <p className="bzone__sentence">{describeZone(draft)}</p>
          </div>

          <AnimatePresence initial={false}>
            {issues.length > 0 && (
              <motion.ul
                className="bzone__issues"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                {issues.map((i) => (
                  <IssueRow key={i.id} issue={i} />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          {dirty && dependents.length > 0 && (
            <div className="bimpactbox">
              <Callout
                tone="notice"
                title={`${dependents.length} polic${dependents.length === 1 ? 'y' : 'ies'} will change the moment you save`}
              >
                Each one evaluates this zone on every sign-in.
              </Callout>
              <ul className="bdeps">
                {dependents.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => store.go({ name: 'builder', policyId: p.id })}>{p.name}</button>
                    <Badge tone={p.status === 'inactive' ? 'neutral' : 'positive'}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bmaster__foot">
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button
              variant="brand"
              disabled={!dirty || blocked}
              title={blocked ? 'Fix the errors above first' : undefined}
              onClick={() => {
                store.updateZone(draft)
                store.showToast(`${draft.name} saved`)
              }}
            >
              {blocked
                ? 'Cannot save yet'
                : dirty && dependents.length > 0
                  ? `Save — updates ${dependents.length} polic${dependents.length === 1 ? 'y' : 'ies'}`
                  : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const IP_LABEL: Record<string, string> = {
  ipv4: 'single IPv4 address',
  ipv6: 'single IPv6 address',
  'ipv4-cidr': 'IPv4 block',
  'ipv6-cidr': 'IPv6 block',
  'ipv4-range': 'IPv4 range',
  invalid: 'not valid',
}

function IssueRow({ issue }: { issue: ZoneIssue }) {
  return (
    <li className={`bzone__issue is-${issue.level}`}>
      <span className="bzone__issuemark" aria-hidden>
        {issue.level === 'error' ? (
          <XCircle size={15} strokeWidth={1.9} />
        ) : issue.level === 'warning' ? (
          <AlertTriangle size={15} strokeWidth={1.9} />
        ) : (
          <Info size={15} strokeWidth={1.9} />
        )}
      </span>
      <span>
        <strong>
          <span className="u-sr">{issue.level}: </span>
          {issue.title}
        </strong>
        <span>{issue.detail}</span>
      </span>
    </li>
  )
}

/* A chip list you type into. Values are validated as they are committed, so a
   malformed entry is visible on the entry itself rather than only in a summary
   at the bottom of the page. */
function TokenField({
  label,
  hint,
  placeholder,
  empty,
  values,
  onChange,
  validate,
  annotate,
  examples,
  mono,
}: {
  label: string
  hint: string
  placeholder: string
  empty: string
  values: string[]
  onChange: (v: string[]) => void
  validate: (v: string) => string | null
  annotate: (v: string) => string
  examples: string[]
  mono?: boolean
}) {
  const [text, setText] = useState('')

  function commit() {
    const parts = text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    onChange([...values, ...parts.filter((p) => !values.includes(p))])
    setText('')
  }

  return (
    <div className={`btok ${mono ? 'btok--mono' : ''}`}>
      <div className="btok__head">
        <span className="btok__label">{label}</span>
        <span className="btok__hint">{hint}</span>
      </div>

      <div className="btok__box">
        {values.length === 0 ? (
          /* Not a blank. A blank field reads as "not set yet", and not-set reads
             as restrictive — while an empty section here matches anything. */
          <span className="btok__empty">{empty}</span>
        ) : (
          <ul className="btok__chips">
            <AnimatePresence initial={false}>
              {values.map((v) => {
                const err = validate(v)
                return (
                  <motion.li
                    key={v}
                    layout
                    className={`btok__chip ${err ? 'is-bad' : ''}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.14 }}
                    title={err ?? annotate(v)}
                  >
                    <span className="btok__val">{v}</span>
                    <em>{err ?? annotate(v)}</em>
                    <button
                      type="button"
                      onClick={() => onChange(values.filter((x) => x !== v))}
                      aria-label={`Remove ${v}`}
                    >
                      ×
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}

        <div className="btok__entry">
          <input
            type="text"
            value={text}
            placeholder={placeholder}
            aria-label={`Add ${label}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
            onBlur={commit}
          />
          <button type="button" onClick={commit} disabled={!text.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="btok__eg">
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => !values.includes(ex) && onChange([...values, ex])}
            disabled={values.includes(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Multi-select from a known list, with the same "any" treatment when empty. */
function PickField({
  label,
  empty,
  options,
  values,
  onChange,
}: {
  label: string
  empty: string
  options: string[]
  values: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="bpick">
      <span className="u-label">{label}</span>
      <div className="bpick__box">
        {values.length === 0 && <span className="btok__empty">{empty}</span>}
        {values.map((v) => (
          <span key={v} className="bpick__chip">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              ×
            </button>
          </span>
        ))}
        <select
          aria-label={`Add ${label}`}
          value=""
          onChange={(e) => e.target.value && onChange([...values, e.target.value])}
        >
          <option value="">+ Add</option>
          {options
            .filter((o) => !values.includes(o))
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}
