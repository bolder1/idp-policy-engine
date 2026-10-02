import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Eye, Lock, TriangleAlert, X } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Decode } from './jarvis2-decode'
import type { Geo } from './jarvis2-geometry'
import { fold, isFold, type RuleRow, type Tone } from './jarvis2-model'
import { MarkIcon, Wedge, type HotFn } from './jarvis2-wedges'

/* -----------------------------------------------------------------------------
   The right-hand wedges (JarvisLayout.tsx): RULE TRACE — the middle and inner
   rings as rows, first match wins, the rule in focus open with its checks —
   and DECISION, the answer: the big word, its factors, What they see, who
   decided it (links into the builder), the conflict note. While the engine
   works, DECISION holds a target reticle and says what it waits for.
   -------------------------------------------------------------------------- */

export function RulesWedge({ g, play, policyName, rows, shown, hot, onHot, onOpen, all, onAll }: { g: Geo; play: boolean; policyName: string | null; rows: RuleRow[]; shown: boolean; hot: ReadonlySet<string>; onHot: HotFn; onOpen: (r: RuleRow) => void; all: boolean; onAll: () => void }) {
  const list = all ? rows : fold(rows, (r) => r.tone !== 'idle' || r.n === null || r.open, (r) => r.n ?? rows.length)
  /* More below than shows: the list's foot fades, so it reads as one that scrolls. */
  const box = useRef<HTMLDivElement | null>(null)
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    const m = !!el && el.scrollHeight - el.clientHeight > 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 2
    setMore(m)
  }, [rows, all, g, shown])
  return (
    <Wedge
      g={g}
      id="rules"
      play={play}
      delay={0.12}
      label={policyName ? `Rules in ${policyName}` : 'Rules'}
      title={policyName ? `Rules in ${policyName}` : 'Rules'}
      sub={<span className="jv2-w__sub is-wide">first match wins</span>}
    >
      {!shown || !policyName ? (
        <div className="jv2-wait is-rules">
          <span>The rules of the policy that covers this sign-in</span>
        </div>
      ) : (
        <div ref={box} className={`jv2-rows is-scroll${more ? ' is-more' : ''}`} onScroll={(e) => setMore(e.currentTarget.scrollTop + e.currentTarget.clientHeight < e.currentTarget.scrollHeight - 2)}>
          {list.map((r) =>
            isFold(r) ? (
              <button key={r.key} type="button" className="jv2-row is-fold" title={r.items.map((x) => x.name).join('\n')} onClick={onAll}>
                <span className="jv2-num is-fold">+{r.items.length}</span>
                <span className="jv2-row__txt">
                  <span className="jv2-row__name">
                    {r.items[0].name} and {r.items.length - 1} more
                  </span>
                  <span className="jv2-row__line">
                    {r.line} · {r.first}–{r.last} · show all
                  </span>
                </span>
                <span className="jv2-row__mark">
                  <b className="jv2-dash">–</b>
                </span>
                <span className="jv2-row__open" />
              </button>
            ) : (
              <RuleItem key={r.key} r={r} hot={hot} onHot={onHot} onOpen={onOpen} play={play} />
            ),
          )}
        </div>
      )}
    </Wedge>
  )
}

function RuleItem({ r, hot, onHot, onOpen, play }: { r: RuleRow; hot: ReadonlySet<string>; onHot: HotFn; onOpen: (r: RuleRow) => void; play: boolean }) {
  const head = (
    <button
      type="button"
      className={`jv2-row is-rule t-${r.tone}${hot.has(r.jv) ? ' is-hot' : ''}`}
      data-jv={r.jv}
      title={r.name}
      aria-label={`${r.n === null ? 'Nothing else matched' : `Rule ${r.n}, ${r.name}`}${r.line ? `: ${r.line}` : ''}. ${r.n === null ? 'Open the policy' : 'Open the rule in the builder'}`}
      onPointerEnter={(e) => onHot(r.jv, e.currentTarget)}
      onPointerLeave={() => onHot(null)}
      onFocus={(e) => onHot(r.jv, e.currentTarget)}
      onBlur={() => onHot(null)}
      onClick={() => onOpen(r)}
    >
      <span className="jv2-num">{r.n === null ? <Lock size={11} strokeWidth={2.4} aria-label="Last rule" /> : r.n}</span>
      <span className="jv2-row__txt">
        <span className="jv2-row__name">{r.name}</span>
        {r.line && !r.open && <span className="jv2-row__line">{r.line}</span>}
      </span>
      <span className="jv2-row__mark">
        <MarkIcon mark={r.mark} tone={r.tone} />
      </span>
      <span className="jv2-row__open" aria-hidden>
        <ArrowUpRight size={13} strokeWidth={2.2} />
      </span>
    </button>
  )
  if (!r.open) return head
  return (
    <motion.div className={`jv2-rule-open t-${r.tone}`} initial={play ? { opacity: 0.4 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.24 : 0 }}>
      {head}
      {r.checks.map((c) => (
        <div
          key={c.key}
          className={`jv2-chk t-${c.tone}${hot.has(c.jv) ? ' is-hot' : ''}`}
          data-jv={c.jv}
          onPointerEnter={(e) => onHot(c.jv, e.currentTarget)}
          onPointerLeave={() => onHot(null)}
        >
          <span className="jv2-chk__k">{c.word}</span>
          <span className="jv2-chk__v">
            <span className="jv2-chk__val" title={c.value}>
              {c.value}
            </span>
            {c.needs && <small>{c.needs}</small>}
            {c.subs.map((x) => (
              <small key={x.key} className={`jv2-chk__sub m-${x.mark}`}>
                {x.label} · {x.actual}
                {x.required ? ` (needs ${x.required})` : ''}
              </small>
            ))}
          </span>
          <span className="jv2-row__mark">{c.tone === 'ghost' ? null : <MarkIcon mark={c.mark} tone={c.tone} />}</span>
        </div>
      ))}
      {r.then && (
        <div className={`jv2-chk is-then t-${r.then.tone}`}>
          <span className="jv2-chk__k">Then</span>
          <span className="jv2-chk__v">
            <span className="jv2-chk__val">{r.then.text}</span>
          </span>
        </div>
      )}
    </motion.div>
  )
}

export interface DecisionView {
  landed: boolean
  tone: Tone
  flag: string
  big: string
  rest: string
  factors: string[]
  expectNote: string
  fail: { head: string; sub: string } | null
  denyMsg: string
  ifs: { label: string; decision: AccessDecision }[]
  by: { policy: string; rule: string } | null
  finding: { text: string; tone: 'notice' | 'info' } | null
  changed: string | null
  canSee: boolean
  seeOpen: boolean
  waits: { head: string; line: string }
}

export function DecisionWedge({ g, play, v, onSee, onPolicy, onRule, onFinding, lit, measure = false }: { g: Geo; play: boolean; v: DecisionView; onSee: () => void; onPolicy: () => void; onRule: () => void; onFinding: () => void; lit: boolean; measure?: boolean }) {
  const t = v.tone
  return (
    <Wedge
      g={g}
      id="decision"
      measure={measure}
      play={play}
      delay={0.18}
      label="Decision"
      title="Decision"
      sub={v.landed ? <span className={`jv2-flag t-${t}`}>{v.flag}</span> : <span className="jv2-w__sub">{v.waits.head}</span>}
    >
      {!v.landed ? (
        <div className="jv2-wait">
          <Reticle />
          <span className="jv2-wait__t">{v.waits.line}</span>
        </div>
      ) : (
        <motion.div
          className={`jv2-dec t-${t}${lit ? ' is-lit' : ''}`}
          data-jv={measure ? undefined : 'outcome'}
          initial={play ? 'out' : false}
          animate="in"
          variants={{ out: {}, in: { transition: play ? { staggerChildren: 0.07, delayChildren: 0.18 } : {} } }}
        >
          <motion.div className="jv2-dec__big" variants={fade(play)}>
            <b>
              <Decode text={v.big} play={play} ms={380} delay={200} />
            </b>
            {v.rest && <span>{v.rest}</span>}
            {v.expectNote && <span className="jv2-expect">{v.expectNote}</span>}
            {(v.fail || v.factors.length === 0) && v.canSee && <SeeButton open={v.seeOpen} onSee={onSee} end />}
          </motion.div>
          {v.factors.length > 0 && !v.fail && (
            <motion.div className="jv2-dec__acts" variants={fade(play)}>
              <span className="jv2-factors" aria-label="Asked for">
                {v.factors.map((x, i) => (
                  <span key={`${x}:${i}`} className="jv2-factor">
                    <i>{i + 1}</i>
                    {x}
                  </span>
                ))}
              </span>
              {v.canSee && <SeeButton open={v.seeOpen} onSee={onSee} />}
            </motion.div>
          )}
          {v.fail && (
            <motion.div className="jv2-dec__fail" variants={fade(play)}>
              <X size={14} strokeWidth={2.6} aria-hidden />
              <span>
                <b>{v.fail.head}</b>
                {v.fail.sub && <span>{v.fail.sub}</span>}
              </span>
            </motion.div>
          )}
          {v.ifs.length > 0 && (
            <motion.ul className="jv2-ifs" variants={fade(play)}>
              {v.ifs.map((x) => (
                <li key={`${x.label}:${x.decision}`}>
                  <span>{x.label}</span>
                  <span className={`jv2-ifs__w t-${x.decision === 'deny' ? 'bad' : 'ok'}`}>{DECISION_WORDS[x.decision]}</span>
                </li>
              ))}
            </motion.ul>
          )}
          {v.by && (
            <motion.div className="jv2-by" variants={fade(play)}>
              <span className="jv2-by__k">Decided by</span>
              <button type="button" className="jv2-by__link" onClick={onPolicy} title={`Open ${v.by.policy}`}>
                <span>{v.by.policy}</span>
                <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
              </button>
              {v.by.rule && (
                <button type="button" className="jv2-by__link is-rule" onClick={onRule} title={`Open ${v.by.rule} in the builder`}>
                  <span>{v.by.rule}</span>
                  <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                </button>
              )}
            </motion.div>
          )}
          {v.finding && (
            <motion.button type="button" className={`jv2-note is-${v.finding.tone}`} variants={fade(play)} onClick={onFinding}>
              {v.finding.tone === 'notice' && <TriangleAlert size={15} strokeWidth={2.2} aria-hidden />}
              <span>{v.finding.text}</span>
            </motion.button>
          )}
          {(v.changed || v.denyMsg) && (
            <motion.p className="jv2-dec__foot" variants={fade(play)}>
              {v.denyMsg && <span title={v.denyMsg}>They see: “{v.denyMsg}”</span>}
              {v.changed && <span>Changed by {v.changed}</span>}
            </motion.p>
          )}
        </motion.div>
      )}
    </Wedge>
  )
}

function SeeButton({ open, onSee, end = false }: { open: boolean; onSee: () => void; end?: boolean }) {
  return (
    <button type="button" className={`jv2-key is-see${end ? ' is-end' : ''}${open ? ' is-on' : ''}`} aria-expanded={open} onClick={onSee}>
      <Eye size={14} strokeWidth={2} aria-hidden />
      What they see
    </button>
  )
}

/* The target reticle, while the decision waits: shapes only. */
function Reticle() {
  return (
    <svg className="jv2-reticle" width="104" height="104" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r="52" className="jv2-reticle__o" />
      <circle cx="60" cy="60" r="40" className="jv2-reticle__spin" />
      <circle cx="60" cy="60" r="26" className="jv2-reticle__i" />
      <path d="M60 2v14M60 104v14M2 60h14M104 60h14" className="jv2-reticle__x" />
    </svg>
  )
}

const fade = (play: boolean) => ({
  out: { opacity: 0 },
  in: { opacity: 1, transition: { duration: play ? 0.26 : 0 } },
})
