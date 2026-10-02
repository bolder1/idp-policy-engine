import { motion } from 'motion/react'
import { ArrowUpRight, Lock, Plus, X } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { FormField } from '../../testing/sign-in-form'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { FieldKey, PassCtx } from './pass-ctx'
import { ruleNo, said, stopRow } from './pass-model'
import { sourceRuleIx } from './pass-facts'
import { Mark } from './pass-parts'

/* -----------------------------------------------------------------------------
   The evidence slip (PassLayout.tsx): a press on a field of the pass tears
   off a slip under it with that field's evidence —
     Policy      every policy on the application in the engine's order, the
                 one that issued the pass and how it covers the person
     Rule        every rule in order: the ones tried and the check each
                 failed on, the one that decided, the ones never read
     Conditions  each fact of the sign-in beside what the deciding rule asked
     Factors / What they see   the sign-in pages, the mock browser
   -------------------------------------------------------------------------- */

const TITLE: Record<FieldKey, string> = { policy: 'Policies, in the order they are asked', rule: 'Rules, in order', conditions: 'The sign-in against the rule', factors: 'What they see', see: 'What they see' }

export interface SlipProps {
  c: PassCtx
  k: FieldKey
  animate: boolean
  onClose: () => void
  onOpenPolicy: (id: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onAdd: (f: FormField) => void
}

export function Slip({ c, k, animate, onClose, onOpenPolicy, onOpenRule, onAdd }: SlipProps) {
  const { plan } = c
  const src = k === 'conditions' ? sourceRuleIx(plan) : null
  const srcNo = src !== null && plan.rules[src]?.index !== null && plan.rules[src] ? plan.rules[src].index! + 1 : null
  const title = k === 'conditions' ? (srcNo !== null ? `The sign-in against rule ${srcNo}` : 'The sign-in') : TITLE[k]
  return (
    <motion.section
      className={`rl-pass__slip is-${k}`}
      data-card
      aria-label={title}
      initial={animate ? { opacity: 0, y: -14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate ? 0.28 : 0, ease: [0.2, 0, 0, 1] }}
    >
      <header className="rl-pass__sliphead">
        <span className="rl-pass__lbl">{title}</span>
        <button type="button" className="rl-pass__x" aria-label="Close" onClick={onClose}>
          <X size={14} strokeWidth={2.4} aria-hidden />
        </button>
      </header>

      {k === 'policy' && (
        <ol className="rl-pass__rows">
          {plan.policies.map((p) => {
            const e = c.edges.find((x) => x.policyId === p.policyId)
            return (
              <li key={p.node} className={`rl-pass__row${p.decides ? ` is-positive` : e?.notice ? ' is-notice' : ' is-quiet'}`}>
                <span className="rl-pass__edgeno">{p.order}</span>
                <span className="rl-pass__rowname" title={p.name}>
                  {p.name}
                </span>
                <span className="rl-pass__rowwhy">{p.decides ? `Covers ${c.first}${c.via ? ` · ${c.via}` : ''} — issued the pass` : e ? (e.why && e.why !== e.word ? `${e.word} — ${e.why}` : e.word) : p.reason}</span>
                {p.decides ? <Mark status="pass" /> : <span />}
                <button type="button" className="rl-pass__link" onClick={() => onOpenPolicy(p.policyId)} aria-label={`Open ${p.name}`}>
                  <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {k === 'rule' && (
        <ol className="rl-pass__rows">
          {plan.rules.map((r, i) => {
            const land = i === plan.landing
            const row = stopRow(r)
            const tone = land ? c.tone : r.state === 'no-match' ? 'negative' : r.state === 'unknown' ? 'notice' : 'quiet'
            const why = land
              ? `${r.index === null ? 'Decides when nothing above matches' : 'Decides'} — ${DECISION_WORDS[r.decision]}`
              : r.state === 'off'
                ? 'Switched off'
                : !r.visited
                  ? 'Not read'
                  : row
                    ? said(row)
                    : r.miss || 'No match'
            return (
              <li key={r.node} className={`rl-pass__row is-${tone}${land ? ' is-land' : ''}`}>
                <span className="rl-pass__edgeno">{r.index === null ? <Lock size={10} strokeWidth={2.6} aria-hidden /> : ruleNo(r)}</span>
                <span className="rl-pass__rowname" title={r.name}>
                  {r.name}
                </span>
                <span className="rl-pass__rowwhy">{why}</span>
                {land || r.visited ? <Mark status={land ? (c.tone === 'notice' ? 'unknown' : 'pass') : r.state === 'no-match' ? 'fail' : r.state === 'unknown' ? 'unknown' : 'none'} /> : <span />}
                {c.decider && !c.decider.isGlobalDefault && r.index !== null ? (
                  <button type="button" className="rl-pass__link" onClick={() => onOpenRule(c.decider!.policyId, r.id)} aria-label={`Open rule ${r.index + 1}`}>
                    <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
                  </button>
                ) : (
                  <span />
                )}
              </li>
            )
          })}
        </ol>
      )}

      {k === 'conditions' && (
        <ol className="rl-pass__rows">
          {c.facts.map((f) => (
            <li key={f.token} className={`rl-pass__row is-${f.mark === 'fail' ? 'negative' : f.mark === 'unknown' ? 'notice' : f.mark === 'pass' ? 'positive' : 'quiet'}`}>
              <span className="rl-pass__rowlbl">{f.label}</span>
              <span className="rl-pass__rowname">{f.unset ? 'Not stated' : f.text}</span>
              <span className="rl-pass__rowwhy">{f.requirement ? `Needs ${f.requirement}` : srcNo !== null ? `Rule ${srcNo} doesn’t ask` : 'Not asked'}</span>
              {f.mark ? <Mark status={f.mark} /> : <span />}
              {f.missing ? (
                <button type="button" className="rl-pass__add" onClick={() => onAdd(f.missing!)}>
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Add
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      )}

      {(k === 'factors' || k === 'see') &&
        (c.screens.length > 0 && c.appId ? (
          <div className="rl-pass__see">
            <WhatTheySee screens={c.screens} appId={c.appId} compact collapsible={false} title="" />
          </div>
        ) : (
          <p className="rl-pass__backnote">Nothing to show yet</p>
        ))}
    </motion.section>
  )
}
