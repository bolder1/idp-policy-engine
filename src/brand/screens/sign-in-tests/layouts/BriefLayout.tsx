import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, ChevronLeft, ChevronRight, Pencil, Undo2, Users } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { audienceViaOf } from '../conflicts'
import { activeNode } from '../engine-run'
import { stepMs } from '../use-engine-run'
import { briefOf, workingCite, type CiteId } from './brief-model'
import { OutcomeCard } from './brief-outcome'
import type { CardState } from './brief-parts'
import { CheckCard, RuleCard } from './brief-rule-check'
import { Sentence } from './brief-sentence'
import { PolicyCard, WhoCard } from './brief-who-policy'
import { FollowUps, type Ask } from './brief-follow'
import { useBriefStage } from './brief-stage'
import { BriefStageToggle } from './brief-theme'
import { useWhatIfs, type WhatIf } from './brief-whatif'
import { Thread } from './brief-thread'
import { whyNotsOf, type WhyNot } from './brief-why'
import { RunStage, type StageView } from './RunStage'
import { ValueMark } from '../SignInCard'
import type { RunLayoutProps } from './types'
import './brief.css'
import './brief-cards.css'
import './brief-follow.css'

/* -----------------------------------------------------------------------------
   The run as a BRIEF (run-layout.ts `brief`): the answer first, with its
   evidence one press away — an AI answer with citations.

     ┌ Maya Iyer → AWS Console · Office network · Windows 11 laptop ✎ ┐
     Maya Iyer¹ gets into AWS Console on one factor⁵: AWS for engineering
     teams² applies through Engineering¹, and rule 2³ matches because the
     Windows 11 laptop meets Compliant devices⁴.
     [1 Who] [2 Policies] [3 Rules] [4 Check] [5 Outcome]
     Why not rule 1? Who · Maya Iyer is not in Contractors
     (follow-ups)

   The sentence is laid out whole from the first frame and written as the
   engine reaches each thing (brief-sentence.tsx); the cards fill as their
   step comes (brief-*.tsx). Everything is drawn from `s`.
   -------------------------------------------------------------------------- */

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

export default function BriefLayout(props: RunLayoutProps) {
  const { running, reduced, jumped, runKey, rows, asGroup, onPressPerson } = props
  const [theme, setTheme] = useBriefStage()
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  /* Interaction: what is hovered, what is pinned, the rows pressed — all let go on a new run. */
  const [hot, setHot] = useState<CiteId | null>(null)
  const [pinned, setPinned] = useState<CiteId | null>(null)
  const [selPolicy, setSelPolicy] = useState<string | null>(null)
  const [selRule, setSelRule] = useState<number | null>(null)
  const [selCheck, setSelCheck] = useState<number | null>(null)
  const [hotWhy, setHotWhy] = useState<WhyNot | null>(null)
  const [openWhy, setOpenWhy] = useState<string | null>(null)
  const [see, setSee] = useState(false)
  const [ask, setAsk] = useState<Ask | null>(null)
  /* A what-if briefed in place of the run: marked, with a way back; the page's sign-in is never changed. */
  const [preview, setPreview] = useState<WhatIf | null>(null)
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setHot(null)
    setPinned(null)
    setSelPolicy(null)
    setSelRule(null)
    setSelCheck(null)
    setHotWhy(null)
    setOpenWhy(null)
    setSee(false)
    setAsk(null)
    setPreview(null)
  }
  if (preview && running) setPreview(null)
  /* A what-if briefed (or let go): its own evidence, nothing pressed. */
  const [seenPreview, setSeenPreview] = useState<string | null>(null)
  if ((preview?.key ?? null) !== seenPreview) {
    setSeenPreview(preview?.key ?? null)
    setSelPolicy(null)
    setSelRule(null)
    setSelCheck(null)
    setPinned(null)
    setSee(false)
    setOpenWhy(null)
  }
  const plan = preview?.plan ?? props.plan
  const form = preview?.form ?? props.form
  const screens = preview?.screens ?? props.screens
  const s = preview ? plan.steps.length - 1 : props.s
  const animate = preview ? !reduced : props.animate
  const onPin = useCallback((c: CiteId) => setPinned((p) => (p === c ? null : c)), [])
  const lit: CiteId | null = hot ?? hotWhy?.cite ?? pinned

  /* Who signed in to what. */
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = plan.appName || app?.name || 'the application'
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ? 'them' : person ? firstName(person.name) : 'them'
  const memberGroups = useMemo(() => {
    if (!person) return []
    const ids = [person.groupId, ...(person.alsoGroupIds ?? [])].filter((x, i, a) => x && a.indexOf(x) === i)
    return ids.map((id) => ({ id, name: groups.find((g) => g.id === id)?.name ?? id }))
  }, [person, groups])

  /* How the deciding policy covers them: its audience, asked as the resolver does. */
  const deciderPolicy = useMemo(() => {
    const list = props.policies ?? brand.policies
    return plan.decider ? (list.find((p) => p.id === plan.decider!.id) ?? null) : null
  }, [plan.decider, props.policies, brand.policies])
  const via = useMemo(() => {
    try {
      return deciderPolicy && person ? audienceViaOf(deciderPolicy, person, env) : null
    } catch {
      return null
    }
  }, [deciderPolicy, person, env])
  const second = useMemo(() => {
    const sc = screens.find((x) => x.decision === '2fa')
    const st = sc?.steps.find((x) => x.kind === 'second')
    return st && st.kind === 'second' ? st.name : ''
  }, [screens])

  const whyNots = useMemo(() => whyNotsOf(plan, first), [plan, first])
  const canChange = rows.rows.has('place') || rows.rows.has('device') || rows.rows.has('risk')
  const whatIfs = useWhatIfs(props.form, rows, props.plan, ask === 'change' && !running && !preview)

  /* The sign-in's facts, for the line on top. */
  const facts = useMemo(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => tokenValue(t, form, ctx))
  }, [rows, form, users, apps, zones])

  /* The sentence, its picked things marked: the person's face, their groups, the application's logo, the facts' marks. */
  const groupNames = useMemo(() => (asGroup ? [asGroup] : memberGroups.map((g) => g.name)), [asGroup, memberGroups])
  const model = useMemo(
    () => briefOf(plan, { person: personName, first, app: appName, via, second, name: asGroup ? '' : (person?.name ?? ''), groups: groupNames, appId: app?.id ?? form.appId, facts }),
    [plan, personName, first, appName, via, second, asGroup, person, groupNames, app, form.appId, facts],
  )

  const last = s >= plan.steps.length - 1
  const landed = last || (plan.at.outcome >= 0 && s >= plan.at.outcome)
  const working = landed ? null : workingCite(plan, s, model.decisive)
  const durOf = useCallback((at: number) => stepMs(plan, at), [plan])
  const stateOf = (c: CiteId): CardState => (working === c ? 'working' : landed || s >= model.cardAt[c] ? 'settled' : 'waiting')

  /* A what-if: the facts it changed, marked in the line on top. */
  const changedFacts = useMemo(() => {
    if (!preview) return new Set<string>()
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    const was = new Map(sentenceTokens(rows).map((t) => [t, tokenValue(t, props.form, ctx).text]))
    return new Set(facts.filter((v) => was.get(v.token) !== v.text).map((v) => v.token as string))
  }, [preview, facts, rows, props.form, users, apps, zones])

  /* Later policies that also cover them: by group (the Who card) and by id (the Policy card). */
  const conflictIds = useMemo(() => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId)), [plan.conflicts])
  const alsoByGroup = useMemo(() => {
    const m = new Map<string, { name: string; conflict: boolean }>()
    for (const pc of plan.conflicts?.policies ?? []) for (const g of pc.via.groups) if (!m.has(g.id)) m.set(g.id, { name: pc.policyName, conflict: conflictIds.has(pc.policyId) })
    return m
  }, [plan.conflicts, conflictIds])
  const alsoById = useMemo(() => new Map((plan.conflicts?.policies ?? []).map((pc) => [pc.policyId, conflictIds.has(pc.policyId)])), [plan.conflicts, conflictIds])

  /* The check card: the rule pressed (its failing check, or its first), else the check that decided it. */
  const dec = model.decisive
  const checkRule = selRule ?? dec?.rule ?? null
  const checkIx = (() => {
    if (checkRule === null) return 0
    if (selCheck !== null) return selCheck
    if (selRule === null) return dec?.check ?? 0
    const r = plan.rules[selRule]
    return r?.failing ?? r?.checks.findIndex((c) => c.status === 'unknown') ?? 0
  })()
  const isDecisive = selRule === null || (dec !== null && selRule === dec.rule && (selCheck ?? dec.check) === dec.check)

  // --- The camera ---
  const fitted = useRef<number | null>(null)
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    fitted.current = landed ? runKey : null
    v.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new run, and on mount
  }, [runKey])
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, s)
    const el = node ? worldRef.current?.querySelector(`[data-node="${node}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fitted.current === runKey) return
    fitted.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  /* An answer opened under the follow-ups: brought into view. A what-if briefed, or let go: the whole of it fitted. */
  useEffect(() => {
    if (!ask) return
    const id = window.requestAnimationFrame(() => stage.current?.follow(worldRef.current?.querySelector('.rl-brief__reply'), { lazy: true, y: 0.62, jump: reduced }))
    return () => window.cancelAnimationFrame(id)
  }, [ask, reduced])
  const firstPreview = useRef(true)
  useEffect(() => {
    if (firstPreview.current) {
      firstPreview.current = false
      return
    }
    const id = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: reduced }))
    return () => window.cancelAnimationFrame(id)
  }, [preview, reduced])

  /* The world's width: the canvas's, within reason, so the brief reads at full size. */
  const [width, setWidth] = useState(1240)
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width ?? 0
      if (w <= 0) return
      const next = Math.round(Math.min(1280, Math.max(960, w - 96)) / 8) * 8
      setWidth((cur) => (Math.abs(cur - next) >= 8 ? next : cur))
    })
    ro.observe(ground)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!running) stage.current?.fit({ max: 1, jump: true })
  }, [width, running])

  /* Step through the evidence, one citation at a time, from the dock; Escape lets go. */
  const stepCite = (d: 1 | -1) => {
    const list = model.cites
    const at = pinned ? list.indexOf(pinned) : -1
    const next = at < 0 ? (d > 0 ? 0 : list.length - 1) : at + d
    setPinned(next < 0 || next >= list.length ? null : list[next])
  }
  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null)
    }
    window.addEventListener('keydown', onKey)
    const el = worldRef.current?.querySelector(`[data-ev="${pinned}"]`)
    stage.current?.follow(el, { lazy: true, jump: reduced })
    return () => window.removeEventListener('keydown', onKey)
  }, [pinned, reduced])

  const cardProps = (c: CiteId) => ({ n: model.num[c], state: stateOf(c), lit: lit === c, animate, onHot: setHot })
  const policyRow = hotWhy?.cite === 'policy' ? hotWhy.node : null
  const ruleRow = hotWhy?.cite === 'rule' ? hotWhy.node : null
  const viaGroupIds = new Set(via?.groups.map((g) => g.id) ?? [])
  const routed = landed || stateOf('policy') === 'settled'

  return (
    <RunStage
      ref={stage}
      reduced={reduced}
      className={`rl-brief-stage is-${theme}`}
      label="Sign-in run, as a brief"
      dock={
        <>
          <BriefStageToggle theme={theme} onChange={setTheme} />
          <span className="bb__float__sep" />
          <Tip text="Previous evidence" placement="top">
            <button type="button" className="bb__act" aria-label="Previous evidence" disabled={!landed} onClick={() => stepCite(-1)}>
              <ChevronLeft size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
          <span className="rl-brief__stepno" aria-live="polite">
            {pinned ? `${model.num[pinned] ?? ''} of ${model.cites.length}` : `${model.cites.length} cited`}
          </span>
          <Tip text="Next evidence" placement="top">
            <button type="button" className="bb__act" aria-label="Next evidence" disabled={!landed} onClick={() => stepCite(1)}>
              <ChevronRight size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
        </>
      }
    >
      <div ref={worldRef} className="rl-brief" data-stage={theme} style={{ width }}>
        <Thread root={worldRef} lit={lit} on={landed} animate={!reduced} sig={`${width}:${preview?.key ?? ''}:${ask ?? ''}:${see}:${selRule}:${selCheck}`} />
        <button type="button" className={`rl-brief__ask${preview ? ' is-whatif' : ''}`} data-card data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
          <span className={`rl-brief__askent ${asGroup ? 'is-group' : 'is-person'}`}>
            {asGroup ? <Users size={13} strokeWidth={2.2} aria-hidden /> : person && <Face kind="user" name={person.name} size="sm" decorative />}
            <strong>{personName}</strong>
          </span>
          <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
          {app ? (
            <span className="rl-brief__askent is-app">
              <AppLogo appId={app.id} name={app.name} size={16} />
              <strong>{app.name}</strong>
            </span>
          ) : (
            <strong>Choose an application</strong>
          )}
          {facts.map((v) => (
            <span key={v.token} className={`rl-brief__askfact is-condition${v.unset ? ' is-unset' : ''}${changedFacts.has(v.token) ? ' is-changed' : ''}`}>
              <ValueMark v={v} size={13} />
              {v.unset ? `${v.label}: not stated` : v.text}
            </span>
          ))}
          <Pencil className="rl-brief__askedit" size={13} strokeWidth={2.2} aria-hidden />
        </button>

        {preview && (
          <div className="rl-brief__whatif" data-card role="status">
            <span className="rl-brief__whatiftag">What if</span>
            <span>{preview.label} · not this sign-in</span>
            <button type="button" className="rl-brief__back" onClick={() => setPreview(null)}>
              <Undo2 size={13} strokeWidth={2.2} aria-hidden />
              Back to the run
            </button>
          </div>
        )}
        <div className="rl-brief__answer" aria-live="off" key={preview?.key ?? 'run'}>
          <Sentence parts={model.parts} num={model.num} s={s} landed={landed} animate={animate} working={working} lit={lit} pinned={pinned} tone={model.tone} durOf={durOf} onHot={setHot} onPin={onPin} sweep={preview !== null} />
          {model.after.length > 0 && (
            <Sentence className="is-after" parts={model.after} num={model.num} s={s} landed={landed} animate={animate} working={null} lit={lit} pinned={pinned} tone={model.tone} durOf={durOf} onHot={setHot} onPin={onPin} />
          )}
        </div>

        <div className="rl-brief__evidence">
          <WhoCard {...cardProps('who')} name={personName} groups={memberGroups} asGroup={asGroup} via={via} also={alsoByGroup} globalDefault={plan.decider?.isGlobalDefault === true && plan.policies.length > 1} appName={appName} first={first} routed={routed} />
          {model.cites.includes('policy') && (
            <PolicyCard {...cardProps('policy')} plan={plan} s={s} landed={landed} first={first} also={alsoById} sel={selPolicy} onSel={setSelPolicy} litRow={policyRow} />
          )}
          {model.cites.includes('rule') && (
            <RuleCard
              {...cardProps('rule')}
              plan={plan}
              s={s}
              landed={landed}
              open={landed || (plan.at.expand >= 0 && s >= plan.at.expand)}
              sel={selRule}
              onSel={(i) => {
                setSelRule(i)
                setSelCheck(null)
              }}
              litRow={ruleRow}
              tone={model.tone}
            />
          )}
          {model.cites.includes('check') && checkRule !== null && (
            <CheckCard
              {...cardProps('check')}
              plan={plan}
              s={s}
              rule={checkRule}
              check={checkIx}
              decisive={isDecisive}
              onCheck={setSelCheck}
              onBack={() => {
                setSelRule(null)
                setSelCheck(null)
              }}
              onAdd={props.onAdd}
            />
          )}
          <OutcomeCard
            {...cardProps('outcome')}
            plan={plan}
            landed={landed}
            tone={model.tone}
            screens={screens}
            appId={form.appId}
            columns={preview ? [] : props.columns}
            changed={preview ? null : props.changed}
            expected={preview ? null : props.expected}
            weaker={preview ? null : props.weaker}
            runKey={runKey}
            see={see}
            onSee={() => setSee((v) => !v)}
          />
        </div>

        <motion.div
          className="rl-brief__after"
          style={{ visibility: landed ? 'visible' : 'hidden' }}
          initial={false}
          animate={{ opacity: landed ? 1 : 0 }}
          transition={{ duration: animate && landed ? 0.32 : 0, delay: animate && landed ? 0.3 : 0 }}
        >
          {whyNots.length > 0 && (
            <ul className="rl-brief__whys" aria-label="Why not">
              {whyNots.map((w) => (
                <li key={w.key} className={`rl-brief__why is-${w.tone}`}>
                  <button
                    type="button"
                    className="rl-brief__whybtn"
                    data-card
                    aria-expanded={w.fix ? openWhy === w.key : undefined}
                    onMouseEnter={() => setHotWhy(w)}
                    onMouseLeave={() => setHotWhy(null)}
                    onFocus={() => setHotWhy(w)}
                    onBlur={() => setHotWhy(null)}
                    onClick={() => setOpenWhy((o) => (o === w.key ? null : w.key))}
                  >
                    <span className="rl-brief__whyask">{w.ask}</span>
                    <span className="rl-brief__whyans">
                      {w.answer}
                      <sup className="rl-brief__mk">{model.num[w.cite]}</sup>
                    </span>
                  </button>
                  {openWhy === w.key && w.fix && <p className="rl-brief__whyfix">{w.fix}</p>}
                </li>
              ))}
            </ul>
          )}
          {!preview && !plan.empty && (
            <FollowUps
              plan={plan}
              first={first}
              appName={appName}
              open={ask}
              onOpen={setAsk}
              whatIfs={whatIfs}
              onPreview={(w) => {
                setPreview(w)
                setAsk(null)
              }}
              canChange={canChange}
              onOpenRule={props.onOpenRule}
              onOpenPolicy={props.onOpenPolicy}
              onAsGroup={props.onAsGroup}
              viaGroups={viaGroupIds}
              holes={props.breakIn?.summary.holes ?? 0}
              onBreakIn={props.onReviewBreakIn ? () => props.onReviewBreakIn!('outcome') : undefined}
              animate={!reduced}
            />
          )}
        </motion.div>
      </div>
    </RunStage>
  )
}
