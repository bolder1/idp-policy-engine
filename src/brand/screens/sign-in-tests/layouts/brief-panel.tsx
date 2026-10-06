import { motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Copy, Layers, Play, Plus, ShieldAlert, TriangleAlert, Users, X } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import type { BreakInCounts } from '../../gauntlet'
import type { SignInScreens } from '../../testing/screens-of'
import type { FormField, SignInForm } from '../../testing/sign-in-form'
import type { WhatIf } from './assistant/what-if'
import { howStepOf, type Evidence, type HowLink, type HowStep } from './brief-evidence'
import { alsoLineOf, alsoWouldShown, breakInWordsOf, decidedByOf, expectedOf, pathOf, summaryOf, type AlsoCovers } from './brief-how'
import type { CiteId, Tone } from './brief-model'
import { Mk, OutcomeIcon, Path } from './brief-panel-path'
import { SeeScreens } from './brief-see'
import './brief-panel.css'

/* -----------------------------------------------------------------------------
   HOW IT WAS DECIDED — the brief's evidence, in the page's right-hand panel
   (owner, 3 Oct 2026: "remove the evidence and add a button only, and on
   click open the right-side panel with the evidence inside"; then, "make the
   panel beautiful and useful"). BriefLayout.tsx draws it into the panel's
   body (`props.why.slot`) with a portal, as EngineJourney.tsx draws WhyCard
   there. Top to bottom, each only when it has something true to say
   (brief-how.ts):

     ┌ How it was decided                               ⧉ Copy summary  × ┐
     │ ⛨  Allow with 2FA                                                    │
     │    (MI) Maya Iyer → ◈ AWS Console                                    │
     │    [Password] → [Google Authenticator]                               │
     ├──────────────────────────────────────────────────────────────────────┤
     │ Decided by   ≋ AWS billing for Finance · Rule 2      [Open rule 2 ↗] │
     │ How the engine got there                                             │
     │  ✕ AWS for engineering teams — doesn't cover Priya                   │
     │  ✓ AWS billing for Finance — covers Priya, through Finance  Open ↗   │
     │  ✕ Rule 1 · Contractors — Skipped: Priya isn't in Contractors.  ⌄    │
     │  ✓ Rule 2 · Finance devices — Matches: …                       ⌃    │
     │     Check · This sign-in · Rule needs · ✓                            │
     │  ✓ So Priya is asked for Password, then Google Authenticator.        │
     │ ⚠ Also covers Priya (amber) … [▶ Run as Finance only]                │
     │ What would change it  From Home broadband → Deny · rule 3 [▶ Run with]│
     │ What Priya sees   [Password | Google Authenticator]  ▭ Approximation │
     │ ⛨ Break-in attempts  12 held · 2 got through      Review attempts ›  │
     └──────────────────────────────────────────────────────────────────────┘

   Colour is meaning: green allow / matched, red deny / fail, amber conflict /
   can't tell, blue only for what is lit now; no orange (it stays on the
   form's Run). A preview never runs: only its "Run with …" press does, and
   "Run as Finance only" says it runs. Its tokens are the console's (the
   panel's own, redeclared dark beside a dark stage by panel-stage.css).
   Components only.
   -------------------------------------------------------------------------- */

export interface HowPanelProps {
  ev: Evidence
  steps: readonly HowStep[]
  /** The person's first name ("Maya"), or "them" as a group's member. */
  first: string
  appName: string
  appId: string | null
  /** As stored ("Maya Iyer"), or "Anyone in Finance" as a group's member. */
  who: string
  /** Signed in as a group's member. */
  asGroup: boolean
  /** The sign-in's stated facts, as the row on top says them (for Copy summary). */
  facts: readonly string[]
  tone: Tone
  /** The part lit now (hovered here, in the sentence or in a dock answer; else the pinned one). */
  lit: CiteId | null
  pinned: CiteId | null
  onHot: (c: CiteId | null) => void
  onPin: (c: CiteId) => void
  onClose: () => void
  /** The section's id: the canvas's "How it was decided" controls it. */
  id: string
  titleRef?: RefObject<HTMLHeadingElement | null>
  /** What they see, screen by screen; empty with nothing to show. */
  screens: readonly SignInScreens[]
  /** Asked for what they see (the assistant): it comes into view on each new count. */
  seeAt?: number
  reduced: boolean
  /** A later policy, or their groups alone, that would answer otherwise (brief-how.ts `alsoCoversOf`). */
  also: AlsoCovers | null
  /** Previews whose answer differs, at most three (assistant/what-if.ts): never run until pressed. */
  whatIfs: readonly WhatIf[]
  /** A saved sign-in or an attempt: what it should get, and a weaker factor that is what failed. */
  expected: AccessDecision | null
  weaker: string | null
  /** Break-in attempts on the application. Null: none to review. */
  breakIn: { counts: BreakInCounts; onReview: () => void } | null
  onOpenPolicy: (policyId: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onAdd: (field: FormField) => void
  onAsGroup?: (groupId: string) => void
  onRunWith?: (patch: Partial<SignInForm>, field: FormField) => void
  /** Drawn on the canvas under the button (no page panel to open: the builder's Check access). */
  inline?: boolean
}

const TONE_MARK = { positive: 'pass', negative: 'fail', notice: 'unknown', neutral: 'none' } as const
const DECISION_TONE: Record<AccessDecision, 'pass' | 'fail'> = { '1fa': 'pass', '2fa': 'pass', deny: 'fail' }

/** A section that fades and rises in once, as the panel opens; at once with reduced motion. */
function Sec({ i, reduced, className, label, children, labelId }: { i: number; reduced: boolean; className?: string; label?: ReactNode; labelId?: string; children: ReactNode }) {
  return (
    <motion.section
      className={`bfp-sec${className ? ` ${className}` : ''}`}
      aria-labelledby={labelId}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: reduced ? 0 : 0.05 + i * 0.04, ease: [0.2, 0, 0, 1] }}
    >
      {label && (
        <h4 id={labelId} className="bfp-label">
          {label}
        </h4>
      )}
      {children}
    </motion.section>
  )
}

/** Copy summary: the whole explanation as plain text; "Copied" for a moment. */
function CopySummary({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1600)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
    } catch {
      /* No clipboard (an insecure page): select it in a hidden field and copy that. */
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setDone(true)
      } catch {
        /* Nothing more to try. */
      }
      ta.remove()
    }
  }
  return (
    <button type="button" className="bfp-copy" onClick={() => void copy()}>
      {done ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <Copy size={13} strokeWidth={2} aria-hidden />}
      <span aria-live="polite">{done ? 'Copied' : 'Copy summary'}</span>
    </button>
  )
}

export function HowPanel(p: HowPanelProps) {
  const { ev, steps, lit, pinned, onHot, onPin, tone, reduced } = p
  const titleId = useId()
  const uid = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const o = ev.outcome
  const toneMark = TONE_MARK[tone]

  const nodes = useMemo(() => pathOf(ev, steps), [ev, steps])
  const decided = useMemo(() => decidedByOf(ev), [ev])
  const expect = useMemo(() => expectedOf(p.expected, ev, p.weaker), [p.expected, ev, p.weaker])
  const detail = o.kind === 'allow' && o.factors.length > 0 ? o.factors.join(' → ') : o.kind === 'deny' && o.message ? `“${o.message}”` : ''
  const summary = useMemo(
    () => summaryOf({ who: p.who, appName: p.appName, facts: p.facts, verdict: o.words, detail, decided, depends: o.kind === 'depends', path: nodes, also: p.also, expected: expect }),
    [p.who, p.appName, p.facts, o.words, o.kind, detail, decided, nodes, p.also, expect],
  )

  /* The part pressed on the canvas (or stepped to): its node into view, open and lit. Found on the rail's nodes, not the
     steps: there a rule passed over cites nothing (brief-how.ts `pathOf`), so a Depends' "rule 2" is rule 2, never the
     last rule reached. */
  const goto = howStepOf(nodes, pinned)
  useEffect(() => {
    if (!goto) return
    const id = window.requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-step="${CSS.escape(goto)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [goto, reduced])

  /* Escape shuts the panel. The page's own Escape stands back while anything in a panel is expanded — here, an
     open rule's checks — so when only ours are, the panel shuts on the way back up (never twice: theirs did nothing). */
  const onClose = p.onClose
  useEffect(() => {
    if (p.inline) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const root = rootRef.current
      const open = [...document.querySelectorAll('.sit-panel [aria-expanded="true"]')]
      if (!root || open.length === 0 || open.some((el) => !root.contains(el))) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, p.inline])

  /* Asked for what they see: that section into view. */
  const seeAt = p.seeAt ?? 0
  useEffect(() => {
    if (seeAt <= 0) return
    const id = window.requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>('[data-step="see"]')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }))
    return () => window.cancelAnimationFrame(id)
  }, [seeAt, reduced])

  const link = (k: HowLink) => {
    if (k.kind === 'policy') p.onOpenPolicy(k.policyId)
    else if (k.kind === 'rule') p.onOpenRule(k.policyId, k.ruleId)
    else p.onAdd(k.field)
  }
  const missing = o.kind === 'depends' ? (o.missing[0] ?? null) : null
  const also = p.also
  const ifs = p.whatIfs
  const bi = p.breakIn ? breakInWordsOf(p.breakIn.counts) : null
  /* Their own row: a group's press runs only where that group alone answers otherwise. */
  const curGroup = also?.groups.find((g) => g.current)
  let n = 0

  return (
    <section ref={rootRef} id={p.id} className={`tj-why bfp is-${toneMark}${p.inline ? ' is-inline' : ''}`} aria-labelledby={titleId}>
      {/* HEAD: the title, Copy summary and the X. */}
      <header className="tj-why__top bfp-top">
        <div className="bfp-top__bar">
          <h3 ref={p.titleRef} id={titleId} className="tj-why__title bfp-top__title" tabIndex={-1}>
            How it was decided
          </h3>
          <CopySummary text={summary} />
          <button type="button" className="bb__act tj-why__close" aria-label="Close how it was decided" title="Close" onClick={p.onClose}>
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div ref={bodyRef} className="tj-why__body bfp-body">
        {/* THE VERDICT: the answer, who → app, the factors (or the deny message, or what it could be). It scrolls with the rest; the bar stays. */}
        <div className="bfp-verdict">
          <span className={`bfp-verdict__mark is-${toneMark}`} aria-hidden>
            <OutcomeIcon ev={ev} size={20} strokeWidth={2.2} />
          </span>
          <div className="bfp-verdict__main">
            <p className={`bfp-verdict__words is-${toneMark}`}>{o.words}</p>
            <p className="bfp-verdict__who">
              <span className="bfp-ent">
                {p.asGroup ? <Users size={14} strokeWidth={2} className="bfp-ent__group" aria-hidden /> : <Face kind="user" name={p.who} size="sm" decorative />}
                {p.who}
              </span>
              <ArrowRight size={13} strokeWidth={2} className="bfp-verdict__to" aria-label="to" />
              <span className="bfp-ent">
                {p.appId && <AppLogo appId={p.appId} name={p.appName} size={16} />}
                {p.appName}
              </span>
            </p>
            {o.kind === 'allow' && o.factors.length > 0 && (
              <p className="bfp-factors" aria-label={`Asked for ${o.factors.join(', then ')}`}>
                {o.factors.map((f, i) => (
                  <span key={`${f}:${i}`} className="bfp-factors__item">
                    {i > 0 && <ArrowRight size={12} strokeWidth={2} className="bfp-factors__then" aria-hidden />}
                    <span className="bfp-chip">{f}</span>
                  </span>
                ))}
              </p>
            )}
            {o.kind === 'deny' && o.message && <p className="bfp-verdict__msg">“{o.message}”</p>}
            {o.kind === 'depends' && o.outcomes.length > 0 && (
              <p className="bfp-verdict__could">
                {o.outcomes.map((x, i) => (
                  <span key={`${x.decision}:${i}`} className={`bfp-could is-${DECISION_TONE[x.decision]}`}>
                    {x.words}
                    <span className="bfp-could__src"> · {x.rule !== null ? `rule ${x.rule}` : x.ruleName || 'Nothing else matched'}</span>
                  </span>
                ))}
              </p>
            )}
            {missing && (
              <button type="button" className="bfp-btn is-quiet bfp-verdict__add" onClick={() => p.onAdd(missing)}>
                <Plus size={13} strokeWidth={2.4} aria-hidden />
                Add the {(o.dependsOn[0] ?? 'fact').toLowerCase()}
              </button>
            )}
          </div>
        </div>
        {/* DECIDED BY: the policy and the rule, one row; Open rule N. Expected, when the sign-in says what it should get. */}
        {(decided || expect) && (
          <Sec i={n++} reduced={reduced} className="bfp-decided">
            {decided && (
              <div className="bfp-kv">
                <span className="bfp-kv__k">{o.kind === 'depends' ? 'Depends on' : 'Decided by'}</span>
                <span className="bfp-kv__v">
                  <span className="bfp-decided__policy">
                    <Layers size={14} strokeWidth={2} aria-hidden />
                    {decided.policy}
                  </span>
                  {decided.rule && <span className="bfp-decided__rule">{decided.rule}</span>}
                </span>
                {decided.open ? (
                  <button type="button" className="bfp-btn bfp-kv__act" onClick={() => p.onOpenRule(decided.policyId, decided.open!.ruleId)}>
                    {decided.open.label}
                    <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                  </button>
                ) : (
                  !decided.isGlobalDefault && (
                    <button type="button" className="bfp-btn bfp-kv__act" onClick={() => p.onOpenPolicy(decided.policyId)}>
                      Open policy
                      <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                    </button>
                  )
                )}
              </div>
            )}
            {expect && (
              <div className="bfp-kv">
                <span className="bfp-kv__k">Expected</span>
                <span className={`bfp-kv__v bfp-expect is-${expect.held ? 'pass' : 'fail'}`}>
                  <Mk mark={expect.held ? 'pass' : 'fail'} />
                  {expect.words}
                  {!expect.held && <span className="bfp-expect__got">— got {o.words}</span>}
                  {expect.weaker && <span className="bfp-expect__got">; weaker: {expect.weaker}</span>}
                </span>
              </div>
            )}
          </Sec>
        )}

        {/* THE PATH: the engine's order on a rail. */}
        <Sec i={n++} reduced={reduced} label="How the engine got there" labelId={`${uid}-path`}>
          <Path nodes={nodes} ev={ev} lit={lit} pinned={pinned} goto={goto} ownerOf={(c) => howStepOf(nodes, c)} reduced={reduced} onHot={onHot} onPin={onPin} onLink={link} onAdd={p.onAdd} />
        </Sec>

        {/* ALSO COVERS: a later policy that covers them too; their groups alone, when they answer otherwise. */}
        {also && (
          <Sec i={n++} reduced={reduced}>
            <div className={`bfp-also${also.conflict ? ' is-conflict' : ''}`}>
            <div className="bfp-also__head">
              <TriangleAlert size={15} strokeWidth={2.1} className="bfp-also__icon" aria-hidden />
              <h4 className="bfp-also__title">{also.policies.length > 0 ? `Also covers ${p.first}` : `${p.first}’s groups answer differently`}</h4>
            </div>
            {also.policies.map((pol) => (
              <div key={pol.key} className="bfp-also__pol">
                <p className="bfp-also__name">
                  <Layers size={13} strokeWidth={2} aria-hidden />
                  {pol.name}
                </p>
                <p className="bfp-also__line">{alsoLineOf(pol)}</p>
                {pol.would && alsoWouldShown(pol, also.groups) && (
                  <p className="bfp-also__would">
                    On its own <ArrowRight size={12} strokeWidth={2} aria-hidden /> <span>{pol.would.charAt(0).toUpperCase() + pol.would.slice(1)}</span>
                  </p>
                )}
              </div>
            ))}
            {also.groups.length > 0 && (
              <ul className="bfp-groups" aria-label="Each group alone">
                {also.groups.map((g) => (
                  <li key={g.key} className={`bfp-groups__row${g.current ? ' is-current' : ''}`}>
                    <span className="bfp-groups__label">{g.label}</span>
                    <span className="bfp-groups__ans">
                      <span className={`bfp-groups__words is-${g.decision ? DECISION_TONE[g.decision] : 'unknown'}`}>{g.words}</span>
                      {g.source && <span className="bfp-groups__src">{g.source}</span>}
                    </span>
                    {g.groupId && p.onAsGroup && !g.current && g.words !== curGroup?.words && (
                      <button type="button" className="bfp-btn is-run bfp-groups__run" onClick={() => p.onAsGroup!(g.groupId!)}>
                        <Play size={11} strokeWidth={2.4} aria-hidden />
                        Run as {g.label.replace(/^As /, '')} only
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {also.fix && (
              <div className="bfp-also__fix">
                <p>
                  <span className="bfp-also__fixk">Fix</span>
                  {also.fix.line}
                </p>
                {also.fix.caution && <p className="bfp-also__caution">{also.fix.caution}</p>}
                <button
                  type="button"
                  className="bfp-link"
                  onClick={() => (also.fix!.ruleId ? p.onOpenRule(also.fix!.policyId, also.fix!.ruleId) : p.onOpenPolicy(also.fix!.policyId))}
                >
                  {also.fix.label}
                  <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                </button>
              </div>
            )}
            </div>
          </Sec>
        )}

        {/* WHAT WOULD CHANGE IT: previews whose answer differs; only "Run with …" runs. */}
        {ifs.length > 0 && (
          <Sec i={n++} reduced={reduced} label="What would change it" labelId={`${uid}-ifs`}>
            <ul className="bfp-ifs">
              {ifs.map((w) => (
                <li key={w.key} className="bfp-ifs__row">
                  <span className="bfp-ifs__change">{w.label}</span>
                  <span className="bfp-ifs__to">
                    <ArrowRight size={12} strokeWidth={2} aria-hidden />
                    <span className={`bfp-ifs__words is-${TONE_MARK[w.tone]}`}>{w.words}</span>
                    {w.source && <span className="bfp-ifs__src">{w.source}</span>}
                  </span>
                  {p.onRunWith && (
                    <button type="button" className="bfp-btn is-run bfp-ifs__run" onClick={() => p.onRunWith!(w.patch, w.field)} aria-label={`Run with ${w.value}`}>
                      <Play size={11} strokeWidth={2.4} aria-hidden />
                      Run with {w.value}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="bfp-note">Previews only. Nothing runs until you press Run with.</p>
          </Sec>
        )}

        {/* WHAT THEY SEE: the screens, the steps as tabs. */}
        {p.screens.length > 0 && (o.kind === 'allow' || o.kind === 'deny' || o.kind === 'depends') && p.appId && (
          <Sec
            i={n++}
            reduced={reduced}
            className="bfp-seesec"
            labelId={`${uid}-see`}
            label={
              <>
                What {p.asGroup ? 'they see' : `${p.first} sees`}
                <span className="bfp-label__aside">Approximation</span>
              </>
            }
          >
            <div data-step="see" onMouseEnter={() => onHot('outcome')} onMouseLeave={() => onHot(null)}>
              <SeeScreens screens={p.screens} appId={p.appId} appName={p.appName} first={p.asGroup ? 'they' : p.first} />
            </div>
          </Sec>
        )}

        {/* BREAK-IN: the attempts' counts, and the way to them. */}
        {p.breakIn && bi && (
          <Sec i={n++} reduced={reduced} className="bfp-bi">
            <button type="button" className={`bfp-bi__row${bi.holes.length > 0 ? ' is-holes' : ''}`} onClick={p.breakIn.onReview}>
              <ShieldAlert size={15} strokeWidth={2} className="bfp-bi__icon" aria-hidden />
              <span className="bfp-bi__main">
                <span className="bfp-bi__title">Break-in attempts</span>
                <span className="bfp-bi__counts">
                  <span className="is-held">{bi.held} held</span>
                  {bi.holes.length > 0 ? (
                    bi.holes.map((h) => (
                      <span key={h.key} className="is-hole">
                        {h.n} {h.words}
                      </span>
                    ))
                  ) : (
                    <span className="is-none">None got through</span>
                  )}
                </span>
              </span>
              <span className="bfp-bi__go">
                <span className="bfp-bi__gow">Review attempts</span>
                <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
              </span>
            </button>
          </Sec>
        )}
      </div>
    </section>
  )
}
