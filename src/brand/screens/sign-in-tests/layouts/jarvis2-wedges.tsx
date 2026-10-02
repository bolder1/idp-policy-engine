import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Check, CircleHelp, Clock, Gauge, Laptop, Lock, Plus, Wifi, X, type LucideIcon } from 'lucide-react'

import { AppLogo } from '../../../logos/AppLogo'
import type { FormField } from '../../testing/sign-in-form'
import type { TokenId } from '../../testing/sign-in-sentence'
import { Decode } from './jarvis2-decode'
import { wedgeBox, type Geo, type WedgeId } from './jarvis2-geometry'
import { fold, isFold, type CondRow, type GroupTag, type Mark, type PolicyRow, type Tone } from './jarvis2-model'

/* -----------------------------------------------------------------------------
   The wedges' readable copy (JarvisLayout.tsx), absolutely placed in the
   boxes the geometry gives each wedge. WHO is read first and largest; its
   conditions say what the run did with each fact. POLICIES is the outer ring
   as rows. Each row and its ring segment share one id (`data-jv`): hovering
   or focusing either lights the other, and a dot-connector leader joins
   them (the layout draws it).
   -------------------------------------------------------------------------- */

export type HotFn = (jv: string | null, el?: HTMLElement | null) => void

const TOKEN_ICON: Partial<Record<TokenId, LucideIcon>> = { from: Wifi, device: Laptop, when: Clock, risk: Gauge }

export function MarkIcon({ mark, tone, size = 13 }: { mark: Mark; tone?: Tone; size?: number }) {
  if (tone === 'work') return <span className="jv2-spin" role="img" aria-label="Checking" />
  if (mark === 'pass') return <Check size={size} strokeWidth={2.6} aria-label="Passed" />
  if (mark === 'fail') return <X size={size} strokeWidth={2.6} aria-label="Failed" />
  if (mark === 'unknown') return <CircleHelp size={size} strokeWidth={2.4} aria-label="Can't tell" />
  if (mark === 'conflict') return <b className="jv2-bang" aria-label="Conflict">!</b>
  return <b className="jv2-dash" aria-hidden>–</b>
}

export function Wedge({ g, id, title, sub, children, play, delay = 0, label, measure = false }: { g: Geo; id: WedgeId; title: ReactNode; sub?: ReactNode; children: ReactNode; play: boolean; delay?: number; label: string; measure?: boolean }) {
  const b = wedgeBox(g, id)
  return (
    <motion.section
      className={`jv2-w is-${id}${measure ? ' is-measure' : ''}`}
      aria-label={measure ? undefined : label}
      aria-hidden={measure || undefined}
      inert={measure || undefined}
      data-measure={measure ? id : undefined}
      data-card
      style={measure ? { left: -20000, top: 0, width: b.width } : { left: b.left, top: b.top, width: b.width, height: b.height }}
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play && !measure ? 0.36 : 0, delay: play ? delay : 0 }}
    >
      <header className="jv2-w__h">
        <span className="jv2-w__t">
          <i className="jv2-w__dot" aria-hidden />
          {title}
        </span>
        {sub}
      </header>
      {children}
    </motion.section>
  )
}

/* WHO: the face ring whose arcs are her groups, the name (the largest type on the page), the groups as hex tags, the application, then the conditions. */
export function WhoWedge(props: {
  g: Geo
  play: boolean
  name: string
  initials: string
  tested: string
  groups: GroupTag[]
  appId: string | null
  appName: string
  conds: CondRow[]
  hot: ReadonlySet<string>
  onHot: HotFn
  onPressPerson: () => void
  onAdd: (field: FormField) => void
}) {
  const { g, play, name, initials, tested, groups, appId, appName, conds, hot, onHot, onPressPerson, onAdd } = props
  const size = g.compact || conds.length > 2 ? 66 : 80
  const tight = conds.length > 2
  return (
    <Wedge g={g} id="who" play={play} label="Who is signing in" title="Who is signing in" sub={tested ? <span className="jv2-w__sub">{tested}</span> : null}>
      <div className={`jv2-who${size < 80 ? ' is-small' : ''}`}>
        <button type="button" className="jv2-face" style={{ width: size, height: size }} aria-label={`${name}, signs in to ${appName}. Change the sign-in`} onClick={onPressPerson}>
          <FaceRing groups={groups} size={size} play={play} />
          <span className="jv2-face__i">{initials}</span>
        </button>
        <div className="jv2-who__txt">
          <button type="button" className={`jv2-who__name${name.length > 24 ? ' is-longer' : name.length > 16 ? ' is-long' : ''}`} title={name} aria-label={`${name}. Change the sign-in`} onClick={onPressPerson}>
            <Decode text={name} play={play} ms={420} delay={140} />
          </button>
          {groups.length > 0 && (
            <span className="jv2-groups" aria-label={`Groups: ${groups.map((x) => x.name).join(', ')}`}>
              {groups.map((x) => (
                <span key={x.name} className={`jv2-hex t-${x.tone}`} title={x.note ? `${x.name} · ${x.note}` : x.name}>
                  {x.name}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <button type="button" className="jv2-app" onClick={onPressPerson} aria-label={`Application: ${appName}. Change the sign-in`}>
        <span className="jv2-app__to">to</span>
        <span className="jv2-app__logo">{appId ? <AppLogo appId={appId} name={appName} size={18} /> : null}</span>
        <span className="jv2-app__name">{appName}</span>
      </button>
      <div className="jv2-cond-h">
        <span className="jv2-w__t">
          <i className="jv2-w__dot" aria-hidden />
          Conditions
        </span>
        <span className="jv2-w__sub">as stated</span>
      </div>
      {conds.length === 0 && <p className="jv2-cond-none">None read by these rules</p>}
      <div className={`jv2-conds${tight ? ' is-tight' : ''}`}>
        {conds.map((c) => {
          const Icon = TOKEN_ICON[c.token] ?? CircleHelp
          return (
            <button
              key={c.key}
              type="button"
              className={`jv2-cond t-${c.tone}${hot.has(c.jv) ? ' is-hot' : ''}`}
              data-jv={c.jv}
              aria-label={`${c.label}: ${c.value}${c.status ? `. ${c.status}` : ''}. ${c.add ? 'Add it' : 'Change it'}`}
              onPointerEnter={(e) => onHot(c.jv, e.currentTarget)}
              onPointerLeave={() => onHot(null)}
              onFocus={(e) => onHot(c.jv, e.currentTarget)}
              onBlur={() => onHot(null)}
              onClick={() => onAdd(c.field)}
            >
              <span className="jv2-cond__ic">
                <Icon size={16} strokeWidth={2} aria-hidden />
              </span>
              <span className="jv2-cond__kv">
                <span className="jv2-cond__k">{c.label}</span>
                <span className="jv2-cond__v" title={c.value}>
                  {c.value}
                </span>
              </span>
              <span className="jv2-cond__u">
                {c.add ? (
                  <span className="jv2-add">
                    <Plus size={12} strokeWidth={2.4} aria-hidden />
                    Add
                  </span>
                ) : (
                  <>
                    {c.mark !== 'none' || c.tone === 'work' ? <MarkIcon mark={c.mark} tone={c.tone} size={12} /> : null}
                    {c.status}
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Wedge>
  )
}

/* The face: initials in a ring whose arcs are the person's groups — green the one that lets them in, amber one that also covers them. */
function FaceRing({ groups, size, play }: { groups: GroupTag[]; size: number; play: boolean }) {
  const c = 40
  const r = 31
  const C2 = 2 * Math.PI * r
  const n = Math.max(1, groups.length)
  const ticks = []
  for (let a = 0; a < 360; a += 10) {
    const q = (a * Math.PI) / 180
    const r0 = 36
    const r1 = a % 90 ? 38 : 39.5
    ticks.push(<line key={a} className={a % 90 ? undefined : 'is-major'} x1={c + r0 * Math.sin(q)} y1={c - r0 * Math.cos(q)} x2={c + r1 * Math.sin(q)} y2={c - r1 * Math.cos(q)} />)
  }
  return (
    <svg className="jv2-face__ring" width={size} height={size} viewBox="0 0 80 80" aria-hidden>
      <g className="jv2-face__ticks">{ticks}</g>
      <circle className="jv2-face__track" cx={c} cy={c} r={r} />
      {(groups.length > 0 ? groups : [{ name: '', tone: 'idle' as Tone, note: '' }]).map((x, i) => (
        <motion.circle
          key={x.name || i}
          className={`jv2-face__arc t-${x.tone}`}
          cx={c}
          cy={c}
          r={r}
          strokeDasharray={`${(C2 / n - (n > 1 ? 6 : 0)).toFixed(1)} ${C2.toFixed(1)}`}
          strokeDashoffset={(-(i * C2) / n + C2 / 4 - (n > 1 ? 3 : 0)).toFixed(1)}
          initial={play ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: play ? 0.4 : 0, delay: play ? 0.2 + i * 0.12 : 0 }}
        />
      ))}
      <circle className="jv2-face__disc" cx={c} cy={c} r={24} />
    </svg>
  )
}

/* POLICIES: the outer ring as rows, in order. A long list folds its runs of unreached policies into one row that opens it. */
export function PoliciesWedge({ g, play, appName, rows, hot, onHot, onOpen, all, onAll }: { g: Geo; play: boolean; appName: string; rows: PolicyRow[]; hot: ReadonlySet<string>; onHot: HotFn; onOpen: (policyId: string) => void; all: boolean; onAll: () => void }) {
  const list = all ? rows : fold(rows, (p) => p.tone !== 'idle' && p.tone !== 'ghost', (p) => p.n)
  return (
    <Wedge g={g} id="policies" play={play} delay={0.06} label={`Policies on ${appName}`} title={`Policies on ${appName}`} sub={<span className="jv2-w__sub is-wide">outer ring · in order</span>}>
      <div className="jv2-rows">
        {list.map((p) =>
          isFold(p) ? (
            <button key={p.key} type="button" className="jv2-row is-fold" title={p.items.map((x) => x.name).join('\n')} onClick={onAll}>
              <span className="jv2-num is-fold">+{p.items.length}</span>
              <span className="jv2-row__txt">
                <span className="jv2-row__name">
                  {p.items[0].name} and {p.items.length - 1} more
                </span>
                <span className="jv2-row__line">
                  {p.line} · {p.first}–{p.last} · show all
                </span>
              </span>
              <span className="jv2-row__mark">
                <b className="jv2-dash">–</b>
              </span>
              <span className="jv2-row__open" />
            </button>
          ) : (
            <button
              key={p.key}
              type="button"
              className={`jv2-row t-${p.tone}${hot.has(p.jv) ? ' is-hot' : ''}`}
              data-jv={p.jv}
              title={p.name}
              aria-label={`Policy ${p.n}, ${p.name}${p.line ? `: ${p.line}` : ''}. Open the policy`}
              onPointerEnter={(e) => onHot(p.jv, e.currentTarget)}
              onPointerLeave={() => onHot(null)}
              onFocus={(e) => onHot(p.jv, e.currentTarget)}
              onBlur={() => onHot(null)}
              onClick={() => onOpen(p.policyId)}
            >
              <span className="jv2-num">{p.n}</span>
              <span className="jv2-row__txt">
                <span className="jv2-row__name">{p.name}</span>
                {p.line && <span className="jv2-row__line">{p.line}</span>}
              </span>
              <span className="jv2-row__mark">{p.lock ? <Lock size={13} strokeWidth={2.2} aria-label="Decides" /> : <MarkIcon mark={p.mark} tone={p.tone} />}</span>
              <span className="jv2-row__open" aria-hidden>
                <ArrowUpRight size={13} strokeWidth={2.2} />
              </span>
            </button>
          ),
        )}
      </div>
    </Wedge>
  )
}

