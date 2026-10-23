import { type ReactNode } from 'react'
import { Asterisk, Check, Gauge, Layers, MonitorPlay, MonitorSmartphone, Network, Webhook, type LucideIcon } from 'lucide-react'

import { Face } from '../../faces'
import { StatusPill, Tip } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import type { EngineRun } from './engine-run'
import { factsOf, heroFacts, type Fact } from './inspect-facts'
import { PEEK_FALLBACK, type InspectTarget, type PeekKind, type PeekTarget } from './inspect-model'
import { usedByPolicies } from './peek-model'

/* -----------------------------------------------------------------------------
   The details panel's parts, and its pages for everything that is not a policy
   (owner, 6 Oct 2026, the second redo: "I don't want this multi-page thing — a
   single page, at the top a card bearing the overview, then the rules opening
   in the same page; remove the related part").

   ONE PAGE, NO WAY BACK. A press on a name on the canvas puts that one thing in
   the panel; nothing in the panel opens another page over it. The pattern is
   the detail panels on Mobbin (Airwallex's card details, Time2book's booking,
   Navattic's visitor): an overview card at the top — the thing's mark, its name
   and its standing, then its facts in a two-column grid — and under it the
   lists that belong to it, quiet rows that are read, not pressed.

     Hero      the overview card (`.insp__hero`): mark · name · pill, the facts
               grid, and a strip at its foot for what it did to this sign-in
     Block     a titled section under it: a semibold heading, a quiet aside
     PeekPage  a zone, a device profile, a risk profile, a hook, a person or an
               application: its hero, then the policies it is in

   A kind's mark is the same everywhere: a policy's layers, a rule's number, an
   application's own logo, a person's face. Tokens only (inspect.css).
   -------------------------------------------------------------------------- */

const PEEK_ICON: Record<Exclude<PeekKind, 'person' | 'app'>, LucideIcon> = { zone: Network, device: MonitorSmartphone, risk: Gauge, hook: Webhook }

/** A kind's mark: the tile on the overview card (or, `small`, at a row's start). */
export function KindMark({ target, small = false }: { target: InspectTarget; small?: boolean }) {
  const { apps, users, policies } = useBrand()
  const size = small ? 13 : 18
  let inner: ReactNode
  if (target.kind === 'app') {
    const app = apps.find((a) => a.id === target.id)
    inner = <AppLogo appId={target.id} name={app?.name ?? 'Application'} size={small ? 16 : 22} />
  } else if (target.kind === 'person') {
    const u = users.find((x) => x.id === target.id)
    return (
      <span className={`insp__mark is-face${small ? ' is-small' : ''}`} aria-hidden>
        <Face kind="user" name={u?.name ?? 'Person'} size={small ? 'sm' : 'md'} decorative />
      </span>
    )
  } else if (target.kind === 'rule') {
    const p = policies.find((x) => x.id === target.policyId)
    const i = target.ruleId === null ? -1 : (p?.rules.findIndex((r) => r.id === target.ruleId) ?? -1)
    inner = target.ruleId === null || i < 0 ? <Asterisk size={size} strokeWidth={2.2} /> : <b>{i + 1}</b>
  } else if (target.kind === 'policy') {
    inner = <Layers size={size} strokeWidth={2} />
  } else if (target.kind === 'see') {
    inner = <MonitorPlay size={size} strokeWidth={2} />
  } else {
    const Icon = PEEK_ICON[target.kind]
    inner = <Icon size={size} strokeWidth={2} />
  }
  return (
    <span className={`insp__mark is-${target.kind}${small ? ' is-small' : ''}`} aria-hidden>
      {inner}
    </span>
  )
}

/** One fact on the overview card: a quiet label over its value. A long value takes the card's full width. */
/* A count, and under the pointer or the focus the names it counts (owner, 6 Oct 2026: "when I hover, I should see
   the items inside — users, groups or applications"): "3 groups" lists them, a heading a kind. Nothing to list, the
   words alone. */
export function CountTip({ label, lists }: { label: string; lists: readonly { kind: string; names: readonly string[] }[] }) {
  const shown = lists.filter((l) => l.names.length > 0)
  if (shown.length === 0) return <>{label}</>
  const faces = shown.flatMap((l) => l.names.map((name, i) => ({ key: `${l.kind}:${i}`, name, kind: (l.kind === 'Groups' ? 'group' : 'user') as 'group' | 'user' })))
  return (
    <Tip
      width={280}
      text={
        <span className="insp__tiplist">
          {shown.map((l) => (
            <span key={l.kind} className="insp__tipgroup">
              <b>{l.kind}</b>
              <span>{l.names.join(', ')}</span>
            </span>
          ))}
        </span>
      }
    >
      <span className="insp__count insp__trail" tabIndex={0}>
        {/* The faces of who it names, then the count; the list is under the pointer. */}
        <span className="bx-faces is-sm" aria-hidden>
          {faces.slice(0, 4).map((f) => (
            <Face key={f.key} kind={f.kind} name={f.name} size="sm" decorative />
          ))}
          {faces.length > 4 && <span className="bx-face is-more is-sm">+{faces.length - 4}</span>}
        </span>
        {label}
      </span>
    </Tip>
  )
}

export interface HeroFact {
  label: string
  value: ReactNode
  wide?: boolean
}

/** The overview card at the top of every page: the mark, the name and its standing, the facts, and a strip at its foot. */
export function Hero({ target, kicker, name, badge, facts, strip, nameAttrs }: { target: InspectTarget; kicker: string; name: string; badge?: ReactNode; facts: HeroFact[]; strip?: ReactNode; nameAttrs?: Record<string, string | number | boolean> }) {
  return (
    <section className="insp__hero" aria-label={`${kicker}: ${name}`}>
      <div className="insp__herohead">
        <KindMark target={target} />
        <div className="insp__heroname">
          <span className="insp__kicker">{kicker}</span>
          <b title={name} {...nameAttrs}>
            {name}
          </b>
        </div>
        {badge}
      </div>
      {facts.length > 0 && (
        <dl className="insp__herogrid">
          {facts.map((f) => (
            <div key={f.label} className={`insp__herofact${f.wide ? ' is-wide' : ''}`}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {strip}
    </section>
  )
}

/** A titled section under the overview card. */
export function Block({ title, aside, children, label }: { title: string; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="insp__block" aria-label={label ?? title}>
      <div className="insp__blockhead">
        <h3>{title}</h3>
        {aside && <span className="insp__secmeta">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function Facts({ rows }: { rows: Fact[] }) {
  return (
    <dl className="insp__facts">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="insp__fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  )
}

const USED_HEAD: Record<PeekKind, string> = { zone: 'Used by', device: 'Used by', risk: 'Used by', hook: 'Used by', app: 'Policies on it', person: 'Policies for them' }

/** A zone, a device profile, a risk profile, a hook, a person or an application, on one page. */
export function PeekPage({ target, plan }: { target: PeekTarget; plan: EngineRun }) {
  const lib = useBrand()
  const rows = factsOf(target, lib)
  if (!rows) return <p className="insp__gone">This is no longer there.</p>
  const name =
    (target.kind === 'person'
      ? lib.users.find((u) => u.id === target.id)?.name
      : target.kind === 'app'
        ? lib.apps.find((a) => a.id === target.id)?.name
        : target.kind === 'zone'
          ? lib.zones.find((z) => z.id === target.id)?.name
          : target.kind === 'device'
            ? lib.fingerprints.find((p) => p.id === target.id)?.name
            : target.kind === 'hook'
              ? lib.hooks.find((h) => h.id === target.id)?.name
              : lib.riskProfiles.find((r) => r.id === target.id)?.name) ?? PEEK_FALLBACK[target.kind]
  const note = target.kind === 'zone' && !rows.slice(1).some(([, v]) => v) ? 'Matches any address and any place.' : ''
  const used = usedByPolicies(lib.policies, target, lib.activeRiskProfileId, lib.users)
  return (
    <>
      <Hero target={target} kicker={PEEK_FALLBACK[target.kind]} name={name} facts={heroFacts(rows)} strip={note ? <p className="insp__herostrip is-neutral">{note}</p> : undefined} />
      <Block title={USED_HEAD[target.kind]} aside={used.length > 0 ? (used.length === 1 ? '1 policy' : `${used.length} policies`) : undefined}>
        {used.length === 0 ? (
          <p className="insp__gone">No policy yet.</p>
        ) : (
          <ul className="insp__list">
            {used.map((p) => {
              const decided = plan.decider?.id === p.id
              return (
                <li key={p.id} className={`insp__item${decided ? ' is-decided' : ''}`}>
                  <KindMark target={{ kind: 'policy', policyId: p.id }} small />
                  <span className="insp__itemtext">
                    <span className="insp__itemname">{p.name}</span>
                    {decided && (
                      <span className="insp__fate is-decided">
                        <Check size={12} strokeWidth={2.4} aria-hidden />
                        Decided this sign-in
                      </span>
                    )}
                  </span>
                  {p.isSystem ? <span className="insp__rowmeta">Default</span> : <StatusPill status={p.status} />}
                </li>
              )
            })}
          </ul>
        )}
      </Block>
    </>
  )
}
