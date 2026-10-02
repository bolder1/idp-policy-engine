import { motion } from 'motion/react'
import { ArrowDown, ArrowUpRight, TriangleAlert } from 'lucide-react'

import { policyPhase } from '../engine-run'
import type { PassCtx } from './pass-ctx'
import type { Edge } from './pass-model'
import { Skel } from './pass-parts'

/* -----------------------------------------------------------------------------
   The wallet (PassLayout.tsx): behind the pass, every policy on the
   application in the engine's order, each a pass's top edge with its one
   state. The one that issued the pass keeps its slot, green, "this pass" —
   so the stack reads 1, 2, 3 … and the first that covers is plain. The scan
   lights each as it is asked; a press slides it forward to read why. More
   than five fold, never folding away the one that issued the pass.
   Heights and margins are motion's (no CSS transition on them).
   -------------------------------------------------------------------------- */

const MAX = 5
const EASE = [0.2, 0, 0, 1] as const

type Slot = { kind: 'edge'; e: Edge } | { kind: 'fold'; key: string; list: Edge[] }

/* The rows shown: all of them up to five; past that the first ones, the one
   that issued the pass, and the rest folded around it. */
function slotsOf(all: Edge[]): Slot[] {
  if (all.length <= MAX) return all.map((e) => ({ kind: 'edge', e }))
  const d = all.findIndex((e) => e.issued)
  const fold = (list: Edge[], key: string): Slot[] => (list.length === 0 ? [] : list.length === 1 ? [{ kind: 'edge', e: list[0] }] : [{ kind: 'fold', key, list }])
  if (d < 0 || d < MAX - 1) return [...all.slice(0, MAX - 1).map((e): Slot => ({ kind: 'edge', e })), ...fold(all.slice(MAX - 1), 'fold:after')]
  return [{ kind: 'edge', e: all[0] }, ...fold(all.slice(1, d), 'fold:before'), { kind: 'edge', e: all[d] }, ...fold(all.slice(d + 1), 'fold:after')]
}

function EdgeRow({ e, c, depth, open, onOpen, onOpenPolicy }: { e: Edge; c: PassCtx; depth: number; open: boolean; onOpen: (id: string | null) => void; onOpenPolicy: (id: string) => void }) {
  const ph = policyPhase(e, c.s)
  const asking = ph === 'working' && c.live
  const settled = ph === 'settled' || c.landed
  const tone = !settled ? (asking ? 'work' : 'waiting') : e.issued ? (c.landed && c.tone === 'negative' ? 'issued-void' : 'issued') : e.notice ? 'notice' : 'quiet'
  return (
    <motion.div
      className={`rl-pass__edge is-${tone}${open ? ' is-open' : ''}`}
      data-node={e.node}
      data-card
      initial={false}
      animate={{ marginLeft: open ? 0 : depth * 22, marginRight: open ? 0 : depth * 22 }}
      transition={{ duration: c.animate || open ? 0.32 : 0, ease: EASE }}
    >
      <button type="button" className="rl-pass__edgebtn" aria-expanded={open} onClick={() => onOpen(open ? null : e.policyId)} disabled={!settled}>
        <span className="rl-pass__edgeno">{e.order}</span>
        <span className="rl-pass__edgename" title={e.name}>
          {e.name}
        </span>
        <span className="rl-pass__edgeword">
          {!settled ? (
            asking ? (
              'Asking…'
            ) : (
              <Skel w="64px" h={8} />
            )
          ) : (
            <>
              {e.notice && <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />}
              {e.word}
              {e.issued && <ArrowDown size={13} strokeWidth={2.4} aria-hidden />}
            </>
          )}
        </span>
      </button>
      <motion.div className="rl-pass__edgebody" initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.28, ease: EASE }}>
        <div className="rl-pass__edgein">
          <p>{e.why}</p>
          {e.more && <p className="rl-pass__edgemore">{e.more}</p>}
          <button type="button" className="rl-pass__link" tabIndex={open ? 0 : -1} onClick={() => onOpenPolicy(e.policyId)}>
            Open policy
            <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function FoldRow({ slot, c, depth, open, onOpen }: { slot: Extract<Slot, { kind: 'fold' }>; c: PassCtx; depth: number; open: boolean; onOpen: (id: string | null) => void }) {
  const list = slot.list
  const asking = c.live && list.some((t) => policyPhase(t, c.s) === 'working')
  return (
    <motion.div
      className={`rl-pass__edge ${asking ? 'is-work' : 'is-quiet'}${open ? ' is-open' : ''}`}
      data-card
      initial={false}
      animate={{ marginLeft: open ? 0 : depth * 22, marginRight: open ? 0 : depth * 22 }}
      transition={{ duration: c.animate || open ? 0.32 : 0, ease: EASE }}
    >
      <button type="button" className="rl-pass__edgebtn" aria-expanded={open} onClick={() => onOpen(open ? null : slot.key)}>
        <span className="rl-pass__edgeno">+{list.length}</span>
        <span className="rl-pass__edgename">
          Policies {list[0].order}–{list[list.length - 1].order}
        </span>
        <span className="rl-pass__edgeword">{asking ? 'Asking…' : [...new Set(list.map((t) => t.word))].slice(0, 2).join(' · ')}</span>
      </button>
      <motion.div className="rl-pass__edgebody" initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.28, ease: EASE }}>
        <ul className="rl-pass__edgelist">
          {list.map((t) => (
            <li key={t.key} data-node={t.node}>
              <span className="rl-pass__edgeno">{t.order}</span>
              <span className="rl-pass__edgename" title={t.name}>
                {t.name}
              </span>
              <span className={`rl-pass__edgeword${t.notice ? ' is-notice' : ''}`}>{t.word}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  )
}

export function Wallet({ c, open, onOpen, onOpenPolicy }: { c: PassCtx; open: string | null; onOpen: (id: string | null) => void; onOpenPolicy: (id: string) => void }) {
  if (c.edges.length === 0) return null
  const slots = slotsOf(c.edges)
  return (
    <div className="rl-pass__wallet" data-node="which" aria-label="Policies on the application, in order">
      {slots.map((sl, i) => {
        const depth = slots.length - i
        return sl.kind === 'edge' ? (
          <EdgeRow key={sl.e.key} e={sl.e} c={c} depth={depth} open={open === sl.e.policyId} onOpen={onOpen} onOpenPolicy={onOpenPolicy} />
        ) : (
          <FoldRow key={sl.key} slot={sl} c={c} depth={depth} open={open === sl.key} onOpen={onOpen} />
        )
      })}
    </div>
  )
}
