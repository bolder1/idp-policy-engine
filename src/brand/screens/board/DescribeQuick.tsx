import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

import { Button } from '../../kit'
import { Picker } from '../../picker'
import { AppLogo } from '../../logos/AppLogo'
import { EVERYONE, type Group, type User } from '../../data'
import type { DescribeTenant } from '../../create/describe-model'
import type { RuleWho } from '../../data'
import { WhoPicker } from '../who-picker'

/* -----------------------------------------------------------------------------
   Describe it, the short way in (owner, 9 Oct 2026: "first ask the application,
   then show some premade options like MFA for any app, then select the users
   and groups, by default everyone, hide the rest in a dropdown called
   Additional actions, as few clicks as we can").

   Three questions, top to bottom: which applications, what to do, who. Who is
   Everyone until it is changed. Everything else sits in one menu. The form
   writes one sentence and sends it the way a typed message goes, so the same
   reader, the same reply rows and the same undo take it from there; the typed
   box stays under it for anything this does not cover.
   -------------------------------------------------------------------------- */

const OUTCOMES = [
  { id: 'mfa', label: 'Ask for 2FA', tail: 'with 2FA' },
  { id: 'password', label: 'Password only', tail: 'with a password' },
  { id: 'block', label: 'Block', tail: '' },
] as const
type OutcomeId = (typeof OUTCOMES)[number]['id']

type Extra = { id: string; label: string; phrase: string }

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export function DescribeQuick({ tenant, onSend }: { tenant: DescribeTenant; onSend: (message: string) => void }) {
  const [apps, setApps] = useState<string[]>([])
  const [outcome, setOutcome] = useState<OutcomeId>('mfa')
  const [who, setWho] = useState<RuleWho | undefined>(undefined)
  const [extras, setExtras] = useState<string[]>([])
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  /* The rest, from what this tenant has: where a sign-in comes from, what it
     comes from, and the risk. */
  const options = useMemo<Extra[]>(
    () => [
      ...tenant.zones.slice(0, 4).map((z) => ({ id: `z:${z.id}`, label: `Only from ${z.name}`, phrase: `only from ${z.name}` })),
      ...tenant.fingerprints.slice(0, 3).map((f) => ({ id: `f:${f.id}`, label: `Only on ${f.name}`, phrase: `only on ${f.name}` })),
      { id: 'risk', label: 'Deny at high risk', phrase: 'deny at high risk' },
    ],
    [tenant],
  )

  const sentence = () => {
    const groupNames = (who?.groupIds ?? []).map((id) => tenant.groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n)
    const userNames = (who?.userIds ?? []).map((id) => tenant.users.find((u) => u.id === id)?.name).filter((n): n is string => !!n)
    const subject = [...groupNames, ...userNames]
    const appNames = tenant.apps.filter((a) => apps.includes(a.id)).map((a) => a.name)
    const picked = options.filter((o) => extras.includes(o.id))
    const where = picked.filter((o) => o.id !== 'risk').map((o) => o.phrase)
    const risk = picked.some((o) => o.id === 'risk')
    const tail = OUTCOMES.find((o) => o.id === outcome)!.tail
    if (outcome === 'block')
      return `${subject.length ? joinNames(subject) : 'Everyone'} ${subject.length ? 'are' : 'is'} blocked from ${joinNames(appNames)}${where.length ? ` ${where.join(' ')}` : ''}.`
    const verb = subject.length === 0 || (userNames.length === 1 && groupNames.length === 0) ? 'reaches' : 'reach'
    const rest = [tail, risk ? 'deny at high risk' : ''].filter(Boolean).join(', ')
    return `${subject.length ? joinNames(subject) : 'Everyone'} ${verb} ${joinNames(appNames)}${where.length ? ` ${where.join(' ')}` : ''}, ${rest}.`
  }

  const toggle = (id: string) => setExtras((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]))
  const picked = options.filter((o) => extras.includes(o.id))

  return (
    <div className="bdsq">
      <div className="bdsq__q">
        <span className="bdsq__label">Applications</span>
        <Picker
          multiple
          searchable
          width="fill"
          label="Applications"
          placeholder="Choose applications"
          value={apps}
          options={tenant.apps.map((p) => ({ value: p.id, label: p.name, art: <AppLogo appId={p.id} name={p.name} size={18} /> }))}
          onChange={(id) => setApps((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
        />
      </div>

      <div className="bdsq__q">
        <span className="bdsq__label">What happens</span>
        <div className="bdsq__opts" role="group" aria-label="What happens">
          {OUTCOMES.map((o) => (
            <button key={o.id} type="button" className="bdsq__opt" aria-pressed={outcome === o.id} onClick={() => setOutcome(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bdsq__q">
        <WhoPicker
          compact
          label="Who"
          exceptions={false}
          who={who}
          onChange={setWho}
          audience={EVERYONE}
          directory={tenant.users as User[]}
          groups={tenant.groups as Group[]}
        />
      </div>

      <div className="bdsq__more" ref={menuRef}>
        <button type="button" className="bdsq__morebtn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)}>
          <Plus size={14} aria-hidden />
          Additional actions
          <ChevronDown size={13} aria-hidden />
        </button>
        {menu && (
          <div className="bdsq__menu" role="menu">
            {options.map((o) => (
              <button key={o.id} type="button" role="menuitemcheckbox" aria-checked={extras.includes(o.id)} className="bdsq__item" onClick={() => toggle(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {picked.length > 0 && (
          <span className="bdsq__chips">
            {picked.map((o) => (
              <button key={o.id} type="button" className="bdsq__chip" aria-label={`Remove ${o.label}`} onClick={() => toggle(o.id)}>
                {o.label}
                <X size={12} aria-hidden />
              </button>
            ))}
          </span>
        )}
      </div>

      <Button disabled={apps.length === 0} onClick={() => onSend(sentence())}>
        Add rule
      </Button>
    </div>
  )
}
