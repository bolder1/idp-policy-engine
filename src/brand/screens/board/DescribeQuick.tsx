import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Ban, Check, ChevronDown, KeyRound, Plus, ShieldCheck, X, type LucideIcon } from 'lucide-react'

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

   Redrawn 19 Oct 2026 (owner: "redo this form"). The same three questions in
   the same order, now a guided column: each question's marker turns into a
   tick once it is answered, What happens is three tiles with their marks,
   and the sentence the form will send is written out live under them — the
   message the admin would otherwise type, with a dashed gap where an answer
   is still missing. Add rule sends it, and the reply plays out in the thread
   like any typed message. Under it, examples built from this tenant's own
   applications, groups, zones and profiles, one click each.
   -------------------------------------------------------------------------- */

const OUTCOMES: { id: 'mfa' | 'password' | 'block'; label: string; icon: LucideIcon; tail: string }[] = [
  { id: 'mfa', label: 'Ask for 2FA', icon: ShieldCheck, tail: 'with 2FA' },
  { id: 'password', label: 'Password only', icon: KeyRound, tail: 'with a password' },
  { id: 'block', label: 'Block', icon: Ban, tail: '' },
]
type OutcomeId = (typeof OUTCOMES)[number]['id']

type Extra = { id: string; label: string; phrase: string }

interface Ask {
  apps: string[]
  outcome: OutcomeId
  who?: RuleWho
  extras: string[]
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/* The rest, from what this tenant has: where a sign-in comes from, what it comes from, and the risk. */
function extrasOf(tenant: DescribeTenant): Extra[] {
  return [
    ...tenant.zones.slice(0, 4).map((z) => ({ id: `z:${z.id}`, label: `Only from ${z.name}`, phrase: `only from ${z.name}` })),
    ...tenant.fingerprints.slice(0, 3).map((f) => ({ id: `f:${f.id}`, label: `Only on ${f.name}`, phrase: `only on ${f.name}` })),
    { id: 'risk', label: 'Deny at high risk', phrase: 'deny at high risk' },
  ]
}

/* The sentence, in parts: what the form would send, and which part is the applications (a gap while there are none). */
function sentenceParts(ask: Ask, tenant: DescribeTenant, options: Extra[]): { before: string; apps: string; after: string } {
  const groupNames = (ask.who?.groupIds ?? []).map((id) => tenant.groups.find((g) => g.id === id)?.name).filter((n): n is string => !!n)
  const userNames = (ask.who?.userIds ?? []).map((id) => tenant.users.find((u) => u.id === id)?.name).filter((n): n is string => !!n)
  const subject = [...groupNames, ...userNames]
  const appNames = tenant.apps.filter((a) => ask.apps.includes(a.id)).map((a) => a.name)
  const picked = options.filter((o) => ask.extras.includes(o.id))
  const where = picked.filter((o) => o.id !== 'risk').map((o) => o.phrase)
  const risk = picked.some((o) => o.id === 'risk')
  const tail = OUTCOMES.find((o) => o.id === ask.outcome)!.tail
  const who = subject.length ? joinNames(subject) : 'Everyone'
  const wherePart = where.length ? ` ${where.join(' ')}` : ''
  if (ask.outcome === 'block') return { before: `${who} ${subject.length ? 'are' : 'is'} blocked from `, apps: joinNames(appNames), after: `${wherePart}.` }
  const verb = subject.length === 0 || (userNames.length === 1 && groupNames.length === 0) ? 'reaches' : 'reach'
  const rest = [tail, risk ? 'deny at high risk' : ''].filter(Boolean).join(', ')
  return { before: `${who} ${verb} `, apps: joinNames(appNames), after: `${wherePart}, ${rest}.` }
}
const sentenceOf = (ask: Ask, tenant: DescribeTenant, options: Extra[]) => {
  const p = sentenceParts(ask, tenant, options)
  return `${p.before}${p.apps}${p.after}`
}

/* Three examples from this tenant: a second factor for one application, a group on a profile, a block from a zone's outside. */
function examplesOf(tenant: DescribeTenant, options: Extra[]): string[] {
  const [a, b, c] = tenant.apps
  const group = tenant.groups[0]
  const profile = options.find((o) => o.id.startsWith('f:'))
  const out: Ask[] = []
  if (a) out.push({ apps: [a.id], outcome: 'mfa', extras: [] })
  if (b && group) out.push({ apps: [b.id], outcome: 'password', who: { groupIds: [group.id], userIds: [] }, extras: profile ? [profile.id] : [] })
  if (c) out.push({ apps: [c.id], outcome: 'mfa', extras: ['risk'] })
  return out.map((x) => sentenceOf(x, tenant, options))
}

const EASE = [0.2, 0, 0, 1] as const

/* A question: its marker (a number, a tick once answered) on a rail, its label, its control. */
function Question({ n, done, label, last = false, children }: { n: number; done: boolean; label: string; last?: boolean; children: ReactNode }) {
  return (
    <div className={`bdsq__q${last ? ' is-last' : ''}`}>
      <span className={`bdsq__mark${done ? ' is-done' : ''}`} aria-hidden>
        {done ? (
          <motion.span key="tick" className="bdsq__markin" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
            <Check size={11} strokeWidth={3} />
          </motion.span>
        ) : (
          n
        )}
      </span>
      <div className="bdsq__body">
        <span className="bdsq__label">{label}</span>
        {children}
      </div>
    </div>
  )
}

/* Guided setup's New rule form is its own (GuidedRuleForm.tsx): this is Describe it's, behind GUIDED_SETUP off. */
export function DescribeQuick({ tenant, onSend }: { tenant: DescribeTenant; onSend: (message: string) => void }) {
  const reduced = useReducedMotion() ?? false
  const [apps, setApps] = useState<string[]>([])
  const [outcome, setOutcome] = useState<OutcomeId>('mfa')
  const [who, setWho] = useState<RuleWho | undefined>(undefined)
  const [extras, setExtras] = useState<string[]>([])
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  const options = useMemo(() => extrasOf(tenant), [tenant])
  const examples = useMemo(() => examplesOf(tenant, options), [tenant, options])
  const ask: Ask = { apps, outcome, who, extras }
  const parts = sentenceParts(ask, tenant, options)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const ready = apps.length > 0

  /* The menu closes on a press outside it, and on Escape (kept from the panel, which would close). */
  useEffect(() => {
    if (!menu) return
    const down = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setMenu(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', down)
    menuRef.current?.addEventListener('keydown', key)
    const el = menuRef.current
    return () => {
      document.removeEventListener('pointerdown', down)
      el?.removeEventListener('keydown', key)
    }
  }, [menu])

  const toggle = (id: string) => setExtras((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]))
  const picked = options.filter((o) => extras.includes(o.id))
  const chosenApps = tenant.apps.filter((a) => apps.includes(a.id))
  const appOptions = tenant.apps.map((p) => ({ value: p.id, label: p.name, art: <AppLogo appId={p.id} name={p.name} size={18} /> }))
  const add = () => onSend(sentenceOf(ask, tenant, options))

  return (
    <div className="bdsq">
      <div className="bdsq__steps">
        <Question n={1} done={ready} label="Applications">
          <Picker
            multiple
            searchable
            width="fill"
            label="Applications"
            placeholder="Choose applications"
            value={apps}
            options={appOptions}
            onChange={(id) => setApps((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
          />
          {chosenApps.length > 0 && (
            <span className="bdsq__apps">
              {chosenApps.map((a) => (
                <motion.span key={a.id} className="bdsq__app" initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE }}>
                  <AppLogo appId={a.id} name={a.name} size={16} />
                  <span className="bdsq__appname">{a.name}</span>
                  <button type="button" className="bdsq__appx" aria-label={`Remove ${a.name}`} onClick={() => setApps((cur) => cur.filter((x) => x !== a.id))}>
                    <X size={12} strokeWidth={2.2} aria-hidden />
                  </button>
                </motion.span>
              ))}
            </span>
          )}
        </Question>

        <Question n={2} done label="What happens">
          <div className="bdsq__opts" role="group" aria-label="What happens">
            {OUTCOMES.map((o) => {
              const Icon = o.icon
              const on = outcome === o.id
              return (
                <button key={o.id} type="button" className={`bdsq__opt is-${o.id}`} aria-pressed={on} onClick={() => setOutcome(o.id)}>
                  <Icon size={16} strokeWidth={1.9} className="bdsq__opticon" aria-hidden />
                  {o.label}
                </button>
              )
            })}
          </div>
        </Question>

        <Question n={3} done label="Who" last>
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
          <div className="bdsq__more" ref={menuRef}>
            <button ref={trigger} type="button" className="bdsq__morebtn" aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu((v) => !v)}>
              <Plus size={14} aria-hidden />
              Additional actions
              <motion.span className="bdsq__morechev" animate={{ rotate: menu ? 180 : 0 }} transition={{ duration: 0.18, ease: EASE }}>
                <ChevronDown size={13} aria-hidden />
              </motion.span>
            </button>
            {menu && (
              <motion.div
                id={menuId}
                className="bdsq__menu"
                role="group"
                aria-label="Additional actions"
                initial={reduced ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: EASE }}
              >
                {options.map((o) => {
                  const on = extras.includes(o.id)
                  return (
                    <button key={o.id} type="button" aria-pressed={on} className="bdsq__item" onClick={() => toggle(o.id)}>
                      <span className={`bdsq__check${on ? ' is-on' : ''}`} aria-hidden>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      {o.label}
                    </button>
                  )
                })}
              </motion.div>
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
        </Question>
      </div>

      {/* The message the form sends, written out as it is answered. */}
      <div className={`bdsq__send${ready ? ' is-ready' : ''}`}>
        <p className="bdsq__sentence" aria-live="polite">
          {parts.before}
          {ready ? <span className="bdsq__said">{parts.apps}</span> : <span className="bdsq__gap">which applications</span>}
          {parts.after}
        </p>
        <button type="button" className="bdsq__go" disabled={!ready} onClick={add}>
          Add rule
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {examples.length > 0 && (
        <div className="bdsq__examples">
          <span className="bdsq__label">Examples</span>
          <ul className="bdsq__exlist">
            {examples.map((e, i) => (
              <motion.li key={e} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.15 + i * 0.06, ease: EASE }}>
                <button type="button" className="bdsq__ex" onClick={() => onSend(e)}>
                  <span>{e}</span>
                  <ArrowUpRight size={14} strokeWidth={2} className="bdsq__exgo" aria-hidden />
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
