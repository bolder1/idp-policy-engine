import type { ReactNode } from 'react'
import { ArrowRight, Globe, MonitorSmartphone, UserRound, Users, Webhook } from 'lucide-react'

import { DENY_ALERT_EVENTS, conditionName, conditionType, type Condition, type Rule } from '../../data'
import { attrOf, modeLabel, reachLabel } from '../../fingerprint'
import { riskOf, riskWords } from '../../risk-level'
import { normaliseWho } from '../../rule-who'
import { daysWords, hoursWords, scheduleGroups, zoneWords } from '../../schedule'
import { useBrand } from '../../store'
import { zoneShape } from '../ConditionPopover'
import { DECISION_NAME, journeyOf } from './model'

/* -----------------------------------------------------------------------------
   What a card peek says (card-peek.tsx, rollout `cardPeeks`): the thing behind a chip, at a glance and no more. A
   heading naming what it is, then the facts as short rows. Read only; the rule's panel is where anything changes.
   -------------------------------------------------------------------------- */

/** How many entries a list shows before it says how many more. */
const LIST = 5

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="bpeek__head">
      <span className="bpeek__kicker">{kicker}</span>
      <h3 className="bpeek__title">{title}</h3>
    </div>
  )
}

/** A row: a mark, a name, a quiet line after it. */
function Row({ icon, name, meta }: { icon?: ReactNode; name: string; meta?: string }) {
  return (
    <li className="bpeek__row">
      {icon && <span className="bpeek__ico">{icon}</span>}
      <span className="bpeek__name">{name}</span>
      {meta && <span className="bpeek__meta">{meta}</span>}
    </li>
  )
}

/** A short list, with how many more when it is long. */
function Rows({ children, more }: { children: ReactNode; more: number }) {
  return (
    <ul className="bpeek__rows">
      {children}
      {more > 0 && <li className="bpeek__more">{more} more</li>}
    </ul>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bpeek__sec">
      <h4 className="bpeek__sectitle">{title}</h4>
      {children}
    </section>
  )
}

/* --- Who ---------------------------------------------------------------------------------------------------------- */

export function WhoPeek({ rule }: { rule: Rule }) {
  const { groups, users } = useBrand()
  const who = normaliseWho(rule.who)
  const g = (id: string) => groups.find((x) => x.id === id)
  const u = (id: string) => users.find((x) => x.id === id)
  const groupIds = who?.groupIds ?? []
  const userIds = who?.userIds ?? []
  const except = [...(who?.exceptGroupIds ?? []).map((id) => g(id)?.name ?? id), ...(who?.exceptUserIds ?? []).map((id) => u(id)?.name ?? id)]
  if (groupIds.length === 0 && userIds.length === 0)
    return (
      <>
        <Head kicker="Who" title="Default" />
        <p className="bpeek__line">Everyone this policy covers{except.length ? `, except ${except.join(', ')}` : ''}.</p>
      </>
    )
  return (
    <>
      <Head kicker="Who" title={rule.name.trim() || 'This rule'} />
      {groupIds.length > 0 && (
        <Section title="Groups">
          <Rows more={groupIds.length - LIST}>
            {groupIds.slice(0, LIST).map((id) => (
              <Row key={id} icon={<Users size={13} strokeWidth={2} />} name={g(id)?.name ?? 'Deleted group'} meta={g(id) ? `${g(id)!.memberCount.toLocaleString()} people` : undefined} />
            ))}
          </Rows>
        </Section>
      )}
      {userIds.length > 0 && (
        <Section title="People">
          <Rows more={userIds.length - LIST}>
            {userIds.slice(0, LIST).map((id) => (
              <Row key={id} icon={<UserRound size={13} strokeWidth={2} />} name={u(id)?.name ?? 'Not in the directory'} meta={u(id)?.email} />
            ))}
          </Rows>
        </Section>
      )}
      {except.length > 0 && (
        <Section title="Except">
          <p className="bpeek__line">{except.join(', ')}</p>
        </Section>
      )}
    </>
  )
}

/* --- If: one condition ---------------------------------------------------------------------------------------------- */

export function CondPeek({ c, post = false }: { c: Condition; post?: boolean }) {
  const { zones, fingerprints, groups, users, hooks } = useBrand()
  const t = conditionType(c.typeId)
  const name = conditionName(c, post)
  const vals = c.values.filter(Boolean)
  const op = t.valueKind === 'fingerprint' && c.operator === 'matches' ? 'is' : c.operator

  if (t.valueKind === 'zone')
    return (
      <>
        <Head kicker={`${name} ${op}`} title={vals.length === 1 ? (zones.find((z) => z.id === vals[0])?.name ?? 'Deleted zone') : `${vals.length} zones`} />
        {vals.map((id) => {
          const z = zones.find((x) => x.id === id)
          if (!z) return <p key={id} className="bpeek__line">A zone that no longer exists.</p>
          const places = [...z.location.countries, ...z.location.states, ...z.location.cities]
          return (
            <Section key={id} title={vals.length > 1 ? z.name : zoneShape(z)}>
              <Rows more={z.ip.length + places.length - LIST}>
                {[...z.ip.map((ip) => ({ k: `ip:${ip}`, text: ip, meta: 'IP' })), ...places.map((p) => ({ k: `pl:${p}`, text: p, meta: 'Location' }))]
                  .slice(0, LIST)
                  .map((e) => (
                    <Row key={e.k} icon={<Globe size={13} strokeWidth={2} />} name={e.text} meta={e.meta} />
                  ))}
              </Rows>
            </Section>
          )
        })}
      </>
    )

  if (t.valueKind === 'fingerprint')
    return (
      <>
        <Head kicker={`${name} ${op}`} title={vals.length === 1 ? (fingerprints.find((p) => p.id === vals[0])?.name ?? 'Deleted profile') : `${vals.length} device profiles`} />
        {vals.map((id) => {
          const p = fingerprints.find((x) => x.id === id)
          if (!p) return <p key={id} className="bpeek__line">A device profile that no longer exists.</p>
          const checks = p.enabled.map((a) => attrOf(p.mode, a)?.name).filter((l): l is string => !!l)
          /* This profile's own risk level (rollout `profileRisk`, per profile). */
          const level = riskOf(c, id)
          return (
            <Section key={id} title={vals.length > 1 ? p.name : `${modeLabel(p)} · ${reachLabel(p.reach)}`}>
              <Rows more={checks.length - LIST}>
                {checks.slice(0, LIST).map((l) => (
                  <Row key={l} icon={<MonitorSmartphone size={13} strokeWidth={2} />} name={l} />
                ))}
              </Rows>
              {level && <p className={`bpeek__risk is-${level}`}>{riskWords(level)}</p>}
            </Section>
          )
        })}
      </>
    )

  if (t.valueKind === 'schedule')
    return (
      <>
        <Head kicker={name} title={zoneWords(c.tz)} />
        <Rows more={0}>
          {scheduleGroups(vals).map((g) => (
            <Row key={`${daysWords(g.days)}${hoursWords(g.hours)}`} name={daysWords(g.days)} meta={hoursWords(g.hours)} />
          ))}
        </Rows>
      </>
    )

  if (t.valueKind === 'group' || t.valueKind === 'user')
    return (
      <>
        <Head kicker={`${name} ${op}`} title={`${vals.length} ${t.valueKind === 'group' ? (vals.length === 1 ? 'group' : 'groups') : vals.length === 1 ? 'person' : 'people'}`} />
        <Rows more={vals.length - LIST}>
          {vals.slice(0, LIST).map((id) => {
            const gr = t.valueKind === 'group' ? groups.find((x) => x.id === id) : undefined
            const us = t.valueKind === 'user' ? users.find((x) => x.id === id) : undefined
            return (
              <Row
                key={id}
                icon={t.valueKind === 'group' ? <Users size={13} strokeWidth={2} /> : <UserRound size={13} strokeWidth={2} />}
                name={gr?.name ?? us?.name ?? id}
                meta={gr ? `${gr.memberCount.toLocaleString()} people` : us?.email}
              />
            )
          })}
        </Rows>
      </>
    )

  if (t.valueKind === 'hook')
    return (
      <>
        <Head kicker={`${name} ${op}`} title={hooks.find((h) => h.id === vals[0])?.name ?? 'Deleted hook'} />
        <Rows more={0}>
          {vals.map((id) => {
            const h = hooks.find((x) => x.id === id)
            return <Row key={id} icon={<Webhook size={13} strokeWidth={2} />} name={h?.name ?? 'Deleted hook'} meta={h ? `Answers within ${h.timeoutMs}ms` : undefined} />
          })}
        </Rows>
      </>
    )

  /* Everything else is its own words: the attribute, how it compares, the values. */
  return (
    <>
      <Head kicker={name} title={op} />
      <Rows more={vals.length - LIST}>
        {vals.slice(0, LIST).map((v) => (
          <Row key={v} name={`${v}${t.unit ? ` ${t.unit}` : ''}`} />
        ))}
      </Rows>
    </>
  )
}

/* --- Then ------------------------------------------------------------------------------------------------------------ */

export function ThenPeek({ rule }: { rule: Rule }) {
  const deny = rule.decision === 'deny'
  /* A Deny that signs the person in first (rollout `denyFactors`): its factors, then the refusal. */
  const steps = deny && rule.denyAfter ? [...journeyOf({ ...rule, decision: rule.denyAfter }).slice(0, -1), ...journeyOf(rule)] : journeyOf(rule)
  const alerts = (rule.denyAlertOn ?? []).map((e) => DENY_ALERT_EVENTS.find((x) => x.id === e)?.label ?? e)
  return (
    <>
      <Head kicker="Then" title={DECISION_NAME[rule.decision]} />
      <ol className="bpeek__steps">
        {steps.map((s, i) => (
          <li key={`${s.id}-${i}`} className={`bpeek__step is-${s.kind ?? 'step'}`}>
            {i > 0 && <ArrowRight size={11} strokeWidth={2} aria-hidden className="bpeek__arrow" />}
            <span>
              {s.label}
              {s.sub && <em>{s.sub}</em>}
            </span>
          </li>
        ))}
      </ol>
      {!deny && rule.rememberMfa && <p className="bpeek__line">Remembers the second factor for {rule.rememberDays ?? 30} days.</p>}
      {deny && rule.denyMessage && (
        <Section title="Message">
          <p className="bpeek__quote">{rule.denyMessage}</p>
        </Section>
      )}
      {deny && (rule.denyAction || rule.denyContact) && (
        <Section title="Next step">
          <p className="bpeek__line">{[rule.denyAction, rule.denyContact].filter(Boolean).join(' · ')}</p>
        </Section>
      )}
      {deny && alerts.length > 0 && (
        <Section title="Email alerts">
          <p className="bpeek__line">{alerts.join(', ')}</p>
        </Section>
      )}
    </>
  )
}
