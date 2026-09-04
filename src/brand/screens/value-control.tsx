import { X } from 'lucide-react'

import { Picker } from '../picker'
import { modeLabel } from '../fingerprint'
import type { ConditionType } from '../data'
import { useBrand, useNameLookup } from '../store'
import { IfChip, IfKw } from './board/IfBlock'

/* -----------------------------------------------------------------------------
   The value half of a condition, by kind.

   One copy. There were two — the trail's and the board's — over one catalogue,
   and they had drifted in exactly the way two renderers of one thing always do:
   the trail computed the "Manage device profiles" destination as
   `'fingerprints'`, which is not a member of `BrandScreen`, so the link
   rendered a blank page mid-edit with unsaved work behind it, while the board's
   copy of the same six lines was correct.

   This is the board's, lifted whole when its host was deleted, because it is
   the one that had the footer links right and the one that treats an unset
   value as a first-class state rather than seeding it with the first zone in
   the list.
   -------------------------------------------------------------------------- */

export function ValueControl({
  type,
  values,
  store,
  resolve,
  autoOpen,
  onChange,
}: {
  type: ConditionType
  values: string[]
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  autoOpen: boolean
  onChange: (v: string[]) => void
}) {
  const v = values[0] ?? ''

  if (type.valueKind === 'zone' || type.valueKind === 'fingerprint' || type.valueKind === 'hook') {
    const items =
      type.valueKind === 'zone'
        ? store.zones.map((z) => ({ value: z.id, label: z.name, meta: z.usedIn ? `${z.usedIn} uses` : undefined }))
        : type.valueKind === 'fingerprint'
          ? store.fingerprints.map((p) => ({ value: p.id, label: p.name, meta: modeLabel(p) }))
          : store.hooks.filter((h) => h.mode === 'sync').map((h) => ({ value: h.id, label: h.name, meta: `${h.timeoutMs}ms` }))
    const screen = type.valueKind === 'zone' ? 'zones' : type.valueKind === 'fingerprint' ? 'fingerprint' : 'hooks'
    return (
      <>
        <Picker
          label={type.label}
          size="sm"
          value={v}
          options={items}
          autoOpen={autoOpen}
          placeholder="choose…"
          invalid={!v}
          onChange={(id) => onChange([id])}
          footer={type.valueKind === 'zone' ? 'Manage zones →' : type.valueKind === 'fingerprint' ? 'Manage device profiles →' : 'Manage hooks →'}
          onFooter={() => store.go({ name: screen } as never)}
        />
        {v && !items.some((i) => i.value === v) && <IfChip unset>deleted · {v}</IfChip>}
      </>
    )
  }

  if (type.valueKind === 'group' || type.valueKind === 'user') {
    const items =
      type.valueKind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people` }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email }))
    return (
      <>
        {values.filter(Boolean).map((id) => (
          <IfChip
            key={id}
            onClick={() => onChange(values.filter((x) => x !== id))}
            title="Remove"
            ariaLabel={`Remove ${resolve(type.valueKind as 'group' | 'user', id) ?? id}`}
          >
            {resolve(type.valueKind as 'group' | 'user', id) ?? id}
            <X size={9} strokeWidth={2.6} aria-hidden />
          </IfChip>
        ))}
        <Picker
          label={type.label}
          size="sm"
          value={null}
          options={items.filter((i) => !values.includes(i.value))}
          placeholder={values.length ? '+ add' : 'choose…'}
          invalid={values.filter(Boolean).length === 0}
          searchable
          autoOpen={autoOpen}
          onChange={(id) => onChange([...values.filter(Boolean), id])}
          footer={type.valueKind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined}
        />
      </>
    )
  }

  if (type.options?.length) {
    const picked = values.filter(Boolean)
    return (
      <>
        {picked.map((o) => (
          <IfChip key={o} onClick={() => onChange(values.filter((x) => x !== o))} title="Remove" ariaLabel={`Remove ${o}`}>
            {o}
            <X size={9} strokeWidth={2.6} aria-hidden />
          </IfChip>
        ))}
        <Picker
          label={type.label}
          size="sm"
          value={null}
          options={type.options.filter((o) => !picked.includes(o)).map((o) => ({ value: o, label: o }))}
          placeholder={picked.length ? '+ add' : 'choose…'}
          invalid={picked.length === 0}
          autoOpen={autoOpen}
          onChange={(o) => onChange([...picked, o])}
        />
      </>
    )
  }

  if (type.valueKind === 'time') {
    return (
      <>
        <input type="time" className="bb__ifinput" aria-label="From" value={values[0] ?? '09:00'} onChange={(e) => onChange([e.target.value, values[1] ?? '17:00'])} />
        <IfKw tone="op">to</IfKw>
        <input type="time" className="bb__ifinput" aria-label="To" value={values[1] ?? '17:00'} onChange={(e) => onChange([values[0] ?? '09:00', e.target.value])} />
      </>
    )
  }

  if (type.valueKind === 'range') {
    return (
      <>
        <input type="number" className="bb__ifinput is-num" aria-label={type.label} value={v} placeholder="0" onChange={(e) => onChange([e.target.value])} />
        <IfKw tone="op">{type.id === 'trust-age' ? 'days' : type.id === 'coords' ? 'km' : 'score'}</IfKw>
      </>
    )
  }

  return <input className="bb__ifinput is-text" aria-label={type.label} placeholder="value…" value={v} onChange={(e) => onChange([e.target.value])} />
}
