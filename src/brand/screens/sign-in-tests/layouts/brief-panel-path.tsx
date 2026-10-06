import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import {
  AppWindow,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Gauge,
  KeyRound,
  Laptop,
  ListChecks,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Split,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'

import type { FormField } from '../../testing/sign-in-form'
import { litBy, type EvCheck, type Evidence, type HowLink, type Mark } from './brief-evidence'
import type { PathNode } from './brief-how'
import type { CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   THE PATH in "How it was decided" (brief-panel.tsx): the engine's order on a
   rail. A node a step — the policies asked first, the one that decides, each
   rule passed over, the one that matched, the outcome — its mark on the rail
   (✓ green, ✕ red, ? amber, – grey), its title and one plain line beside it.
   A rule opens (its chevron, or its title) to its checks as a small table:
   the check, the sign-in's value, what the rule needs, the mark; a fact not
   stated offers Add. The rule that decided is open from the start.

   A node and its part of the sentence light each other (hovered, focused);
   a part pressed on the canvas opens its node and lights it. Components only.
   -------------------------------------------------------------------------- */

const MARK_ICON: Record<Mark, LucideIcon> = { pass: Check, fail: X, unknown: CircleHelp, none: Minus }
const MARK_SAID: Record<Mark, string> = { pass: 'yes', fail: 'no', unknown: 'can’t tell', none: 'not asked' }

/** ✓ green, ✕ red, ? amber, – grey; said to assistive tech. */
export function Mk({ mark, size = 13 }: { mark: Mark; size?: number }) {
  const Icon = MARK_ICON[mark]
  return (
    <span className={`bfp-mk is-${mark}`} role="img" aria-label={MARK_SAID[mark]}>
      <Icon size={size} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

const CHECK_ICON: Partial<Record<EvCheck['category'], LucideIcon>> = { who: Users, network: Wifi, place: MapPin, device: Laptop, time: Clock, risk: Gauge, app: AppWindow }
const OUTCOME_ICON: Record<string, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban, depends: Split }

function outcomeIconOf(ev: Pick<Evidence, 'outcome'>): LucideIcon {
  const o = ev.outcome
  if (o.kind === 'depends') return Split
  if (o.decision) return OUTCOME_ICON[o.decision] ?? ShieldCheck
  return Minus
}

/** The outcome's own mark: a shield, a key, a ban, a split. */
export function OutcomeIcon({ ev, size, strokeWidth = 2.1 }: { ev: Pick<Evidence, 'outcome'>; size: number; strokeWidth?: number }) {
  const Icon = outcomeIconOf(ev)
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />
}

/** A rule's checks: the check, the sign-in's value, what it needs, the mark. */
function ChecksTable({ checks, onAdd }: { checks: readonly EvCheck[]; onAdd: (f: FormField) => void }) {
  return (
    <table className="bfp-checks">
      <thead>
        <tr>
          <th scope="col">Check</th>
          <th scope="col">This sign-in</th>
          <th scope="col">Rule needs</th>
          <th scope="col">
            <span className="bfp-sr">Result</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {checks.map((c) => {
          const Icon = CHECK_ICON[c.category] ?? ListChecks
          return (
            <tr key={c.key} className={`is-${c.mark}${c.decides ? ' is-decides' : ''}`} title={c.line}>
              <th scope="row">
                <span className="bfp-checks__word">
                  <Icon size={13} strokeWidth={2} aria-hidden />
                  {c.word}
                </span>
              </th>
              <td className="bfp-checks__value">
                {c.missing ? (
                  <button type="button" className="bfp-add" onClick={() => onAdd(c.missing!)}>
                    <Plus size={12} strokeWidth={2.4} aria-hidden />
                    Add the {c.word.toLowerCase()}
                  </button>
                ) : (
                  c.value
                )}
              </td>
              <td className="bfp-checks__needs">{c.needs}</td>
              <td className="bfp-checks__mark">
                <Mk mark={c.mark} size={12} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export interface PathProps {
  nodes: readonly PathNode[]
  ev: Evidence
  lit: CiteId | null
  pinned: CiteId | null
  /** The node a part pressed on the canvas is shown on (its key); it opens. */
  goto: string | null
  /** Each node's key, for "is this part's own node" (a press there pins it). */
  ownerOf: (c: CiteId) => string | null
  reduced: boolean
  onHot: (c: CiteId | null) => void
  onPin: (c: CiteId) => void
  onLink: (k: HowLink) => void
  onAdd: (f: FormField) => void
}

export function Path({ nodes, ev, lit, pinned, goto, ownerOf, reduced, onHot, onPin, onLink, onAdd }: PathProps) {
  /* Opened or shut by hand, against where it starts (the deciding rule, and the node a part pressed shows, open). */
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set())
  const sig = nodes.map((n) => n.key).join('|')
  const [seen, setSeen] = useState(sig)
  if (seen !== sig) {
    setSeen(sig)
    setFlipped(new Set())
  }
  const flip = (k: string) =>
    setFlipped((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const OutIcon = outcomeIconOf(ev)

  return (
    <ol className="bfp-path" aria-label="In the order the engine checked">
      {nodes.map((n, i) => {
        const c = n.cites[0]
        const on = litBy(n.cites, lit)
        const canOpen = n.checks.length > 0
        const open = canOpen && (flipped.has(n.key) ? !(n.deciding || goto === n.key) : n.deciding || goto === n.key)
        const own = c !== undefined && ownerOf(c) === n.key
        const press = () => {
          if (own) onPin(c)
          else if (canOpen) flip(n.key)
          else if (c) onPin(c)
        }
        const last = i === nodes.length - 1
        return (
          <li
            key={n.key}
            data-step={n.key}
            className={`bfp-node is-${n.kind} is-${n.mark}${on ? ' is-lit' : ''}${n.deciding ? ' is-deciding' : ''}${last ? ' is-last' : ''}`}
            onMouseEnter={() => c && onHot(c)}
            onMouseLeave={() => onHot(null)}
          >
            <span className="bfp-node__dot">
              {n.kind === 'outcome' ? (
                <span role="img" aria-label={MARK_SAID[n.mark]}>
                  <OutIcon size={13} strokeWidth={2.3} aria-hidden />
                </span>
              ) : (
                <Mk mark={n.mark} size={12} />
              )}
            </span>
            <div className="bfp-node__main">
              <div className="bfp-node__head">
                <button
                  type="button"
                  className="bfp-node__title"
                  aria-pressed={own ? pinned !== null && n.cites.includes(pinned) : undefined}
                  aria-expanded={!own && canOpen ? open : undefined}
                  onFocus={() => c && onHot(c)}
                  onBlur={() => onHot(null)}
                  onClick={press}
                >
                  {n.title}
                </button>
                {canOpen && (
                  <button type="button" className={`bfp-node__fold${open ? ' is-open' : ''}`} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} the checks of ${n.title}`} onClick={() => flip(n.key)}>
                    <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </div>
              {(n.sub || (n.link && n.link.kind !== 'rule')) && (
                <p className="bfp-node__sub">
                  {n.sub && <span>{n.sub}</span>}
                  {n.link && n.link.kind !== 'rule' && (
                    <button type="button" className="bfp-link" onClick={() => onLink(n.link!)}>
                      {n.link.kind === 'add' && <Plus size={12} strokeWidth={2.4} aria-hidden />}
                      {n.link.label}
                      {n.link.kind !== 'add' && <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />}
                    </button>
                  )}
                </p>
              )}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="checks"
                    className="bfp-node__more"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
                  >
                    <ChecksTable checks={n.checks} onAdd={onAdd} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
