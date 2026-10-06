import { useId, type ReactNode } from 'react'
import { AppWindow, Asterisk, ChevronRight, Gauge, Layers, MonitorSmartphone, Network, UserRound, Webhook, type LucideIcon } from 'lucide-react'

import { Face } from '../../faces'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { factsOf, type Fact } from './inspect-facts'
import { PEEK_FALLBACK, type InspectTarget, type PeekKind, type PeekTarget } from './inspect-model'
import { usedByPolicies } from './peek-model'

/* -----------------------------------------------------------------------------
   The inspector's parts and its peeks (owner, 6 Oct 2026: "a panel per kind";
   later the same day: "beautify it — icons, spacing, hierarchy").

   The parts are the builder inspector's own grammar (board.css `.bb__insp
   .bb__sec`): a section is a brand-coloured mark and a semibold heading over a
   body set in against a guide rule, the sections parted by an inset hairline.
   A row is a name you can press, with its kind's mark at the left and a
   chevron at the right. A kind's mark is the same everywhere it appears — the
   panel's head, a row, a chip: a policy's stack of layers, a rule's number, an
   application's own logo, a person's face.

   The peeks — a zone, a device profile, a risk profile, a hook, a person, an
   application — say what the thing is and which policies it is in; read-only,
   their way out is their own library page, at the panel's foot. Tokens only
   (inspect.css).
   -------------------------------------------------------------------------- */

const PEEK_ICON: Record<Exclude<PeekKind, 'person' | 'app'>, LucideIcon> = { zone: Network, device: MonitorSmartphone, risk: Gauge, hook: Webhook }

/** A kind's mark: the tile in the panel's head (or, `small`, at a row's start). */
export function KindMark({ target, small = false }: { target: InspectTarget; small?: boolean }) {
  const { apps, users, policies } = useBrand()
  const size = small ? 13 : 16
  let inner: ReactNode
  if (target.kind === 'app') {
    const app = apps.find((a) => a.id === target.id)
    inner = <AppLogo appId={target.id} name={app?.name ?? 'Application'} size={small ? 16 : 20} />
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

/** A section of the panel, in the builder inspector's grammar; `aside` sits at the heading's right (a count, a scope). */
export function Section({ id, title, icon: Icon, aside, children }: { id: string; title: string; icon: LucideIcon; aside?: ReactNode; children: ReactNode }) {
  const uid = useId()
  return (
    <section className="bb__sec insp__sec" aria-labelledby={`${uid}-${id}`}>
      <div className="bb__sec__head">
        <h3 id={`${uid}-${id}`}>
          <Icon size={15} strokeWidth={2} aria-hidden />
          {title}
        </h3>
        {aside}
      </div>
      <div className="bb__sec__body">{children}</div>
    </section>
  )
}

/** A row you can press: its mark, its name, what it is, a chevron. */
export function Row({ mark, name, meta, onPress }: { mark: ReactNode; name: string; meta?: ReactNode; onPress: () => void }) {
  return (
    <button type="button" className="insp__row" onClick={onPress}>
      {mark}
      <span className="insp__rowname">{name}</span>
      {meta && <span className="insp__rowmeta">{meta}</span>}
      <ChevronRight size={14} strokeWidth={2} aria-hidden className="insp__chev" />
    </button>
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

export function PeekView({ target, onPush }: { target: PeekTarget; onPush: (t: InspectTarget) => void }) {
  const lib = useBrand()
  const rows = factsOf(target, lib)
  if (!rows) return <p className="insp__gone">This is no longer there.</p>
  const note = target.kind === 'zone' && !rows.slice(1).some(([, v]) => v) ? 'Matches any address and any place.' : ''
  const used = usedByPolicies(lib.policies, target, lib.activeRiskProfileId, lib.users)
  const Icon = target.kind === 'person' || target.kind === 'app' ? null : PEEK_ICON[target.kind]
  return (
    <>
      <Section id="about" title={`About this ${PEEK_FALLBACK[target.kind].toLowerCase()}`} icon={Icon ?? (target.kind === 'app' ? AppWindow : UserRound)}>
        <Facts rows={rows} />
        {note && <p className="insp__note">{note}</p>}
      </Section>
      <Section id="used" title={USED_HEAD[target.kind]} icon={Layers} aside={used.length > 0 ? <span className="insp__secmeta">{used.length === 1 ? '1 policy' : `${used.length} policies`}</span> : undefined}>
        {used.length === 0 ? (
          <p className="insp__gone">No policy yet.</p>
        ) : (
          <ul className="insp__rows">
            {used.map((p) => (
              <li key={p.id}>
                <Row mark={<KindMark target={{ kind: 'policy', policyId: p.id }} small />} name={p.name} meta={p.isSystem ? 'Default' : undefined} onPress={() => onPush({ kind: 'policy', policyId: p.id })} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

