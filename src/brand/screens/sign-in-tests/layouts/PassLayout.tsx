import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useAnimate } from 'motion/react'
import { ChevronLeft, ChevronRight, RotateCw, Users } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { stepLabel } from '../../testing/screens-of'
import { audienceViaOf } from '../conflicts'
import { activeNode } from '../engine-run'
import { eachGroupRows } from '../journey'
import { stepMs } from '../use-engine-run'
import { PassBack } from './pass-back'
import type { FieldKey, PassCtx, PassGroup } from './pass-ctx'
import { factsOfPass, findingOf, sourceRuleIx } from './pass-facts'
import { PassFront } from './pass-front'
import { codeOf, edgesOf, firstName, landAt, momentsOf, ruleField, statusOf, toneOf } from './pass-model'
import { Slip } from './pass-slip'
import { StageThemeToggle, useStageTheme } from './pass-theme'
import { Wallet } from './pass-wallet'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './pass.css'

/* -----------------------------------------------------------------------------
   The run as a PASS (run-layout.ts `pass`): the decision is the access pass
   the engine issues for this sign-in, stamped as the engine works —
     the wallet     behind it, the passes NOT issued: the other policies on
                    the application, each with its one state (pass-wallet)
     the pass       FROM the person TO the application; Policy, Rule,
                    Factors, Conditions; a stub with the boarding status and
                    its code (pass-front). Pressed, it flips to its checks
                    (pass-back); a field pressed tears off its evidence
                    (pass-slip)
   A Deny voids the pass, a Depends issues it provisional. Everything is
   drawn from the step on screen — the clock's, or a moment the dock steps
   to — and never runs a timer of its own.
   -------------------------------------------------------------------------- */

const WORLD_W = 1100

export default function PassLayout(props: RunLayoutProps) {
  const { plan, running, reduced, jumped, runKey, form, rows, asGroup, screens } = props
  const [theme] = useStageTheme()
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  /* What is pressed — let go on a new run. */
  const [flipped, setFlipped] = useState(false)
  /* Turned to its back, the pass takes the back's height (a long rule's checks are never cut off); it keeps it until the flip home ends. */
  const [tall, setTall] = useState(false)
  if (flipped && !tall) setTall(true)
  const [slip, setSlip] = useState<FieldKey | null>(null)
  const [edge, setEdge] = useState<string | null>(null)
  const [view, setView] = useState<number | null>(null)
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setFlipped(false)
    setTall(false)
    setSlip(null)
    setEdge(null)
    setView(null)
  }
  if (running && view !== null) setView(null)

  /* Who signed in to what. */
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = plan.appName || app?.name || 'the application'
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ? 'them' : person ? firstName(person.name) : 'them'
  const decider = plan.policies.find((p) => p.decides)

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

  const passGroups = useMemo<PassGroup[]>(() => {
    if (!person) return []
    const conflictIds = new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId))
    const viaIds = new Set(via?.matches ? via.groups.map((g) => g.id) : [])
    const ids = [person.groupId, ...(person.alsoGroupIds ?? [])].filter((x, i, a) => x && a.indexOf(x) === i)
    return ids.map((id) => {
      const also = (plan.conflicts?.policies ?? []).find((pc) => pc.via.groups.some((g) => g.id === id))
      return { id, name: groups.find((g) => g.id === id)?.name ?? id, via: viaIds.has(id), also: also?.policyName ?? '', conflict: also ? conflictIds.has(also.policyId) : false }
    })
  }, [person, groups, via, plan.conflicts])

  const viaSay = via?.matches && !decider?.isGlobalDefault ? via.say : ''
  const edges = useMemo(() => edgesOf(plan, first, viaSay), [plan, first, viaSay])
  const status = useMemo(() => statusOf(plan), [plan])
  const moments = useMemo(() => momentsOf(plan, status.word), [plan, status.word])
  const factors = useMemo(() => {
    const d = plan.outcome.decision
    const sc = screens.find((x) => x.decision === d) ?? (plan.outcome.status === 'decided' ? screens[0] : undefined)
    const steps = sc?.steps ?? []
    const deny = steps.find((x) => x.kind === 'deny')
    return { list: steps.filter((x) => x.kind !== 'deny').map(stepLabel), deny: deny && deny.kind === 'deny' ? deny.message : null }
  }, [screens, plan.outcome])

  /* The step drawn: the clock's, or the moment stepped to. */
  const sDrawn = view !== null ? (moments[view]?.at ?? props.s) : props.s
  const landed = sDrawn >= landAt(plan)
  const animate = view !== null ? !reduced : props.animate
  const durOf = useCallback((at: number) => stepMs(plan, at), [plan])
  /* The facts, marked by the rule on the Rule field (the one that settles it, once landed). */
  const factRule = (() => {
    const src = sourceRuleIx(plan)
    if (landed) return src
    const cur = ruleField(plan, sDrawn, false).current
    return cur !== null && plan.rules[cur]?.index !== null ? cur : null
  })()
  const facts = useMemo(() => factsOfPass(plan, form, rows, { people: users, apps, zones, rows }, factRule), [plan, form, rows, users, apps, zones, factRule])

  const c: PassCtx = {
    plan,
    s: sDrawn,
    landed,
    live: running && view === null,
    animate,
    durOf,
    personName,
    first,
    groups: passGroups,
    asGroup,
    appId: app?.id ?? null,
    appName,
    decider,
    via: viaSay,
    facts,
    status,
    tone: toneOf(plan),
    code: codeOf(plan, decider),
    factors: factors.list,
    deny: factors.deny,
    screens,
    edges,
    finding: findingOf(plan),
  }

  // --- The camera: fit on a new run, follow the engine while it plays, fit when it lands ---
  const fitted = useRef<number | null>(null)
  useLayoutEffect(() => {
    fitted.current = landed ? runKey : null
    stage.current?.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new run, and on mount
  }, [runKey])
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, props.s)
    const el = node ? worldRef.current?.querySelector(`[data-node="${node}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [props.s, running, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fitted.current === runKey) return
    fitted.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])
  useEffect(() => {
    if (!slip) return
    const id = window.requestAnimationFrame(() => stage.current?.follow(worldRef.current?.querySelector('.rl-pass__slip'), { lazy: true, y: 0.6, jump: reduced }))
    return () => window.cancelAnimationFrame(id)
  }, [slip, reduced])

  /* The pass issued: a short press as the status stamp lands, the card taking the ink. */
  const [press, pressIt] = useAnimate<HTMLDivElement>()
  const wasLanded = useRef(landed)
  useEffect(() => {
    const was = wasLanded.current
    wasLanded.current = landed
    if (!landed || was || !animate || !press.current) return
    void pressIt(press.current, { scale: [1, 0.984, 1.004, 1] }, { duration: 0.5, delay: 0.14, ease: 'easeOut' })
  }, [landed, animate, press, pressIt])

  /* The Policy field's evidence is the wallet itself: its slot slides forward. Every other field tears off a slip. */
  const onField = (k: FieldKey) => {
    if (k === 'policy' && decider) {
      setSlip(null)
      setEdge((o) => (o === decider.policyId ? null : decider.policyId))
      return
    }
    setSlip((o) => (o === k ? null : k))
  }
  /* A slip let go: the whole pass back in view. */
  const hadSlip = useRef(false)
  useEffect(() => {
    if (slip) hadSlip.current = true
    else if (hadSlip.current) {
      hadSlip.current = false
      stage.current?.fit({ max: 1, jump: reduced })
    }
  }, [slip, reduced])
  const fieldOpen: FieldKey | null = slip ?? (decider && edge === decider.policyId ? 'policy' : null)
  const onFinding = () => {
    const id = c.finding?.policyId
    if (id && edges.some((e) => e.policyId === id)) setEdge(id)
    else setSlip('rule')
  }
  const step = (d: 1 | -1) => {
    const at = view ?? moments.length - 1
    const next = Math.min(moments.length - 1, Math.max(0, at + d))
    setView(next >= moments.length - 1 ? null : next)
  }
  const groupRows = useMemo(() => (props.onAsGroup ? (eachGroupRows(plan) ?? []).filter((g) => g.groupId) : []), [plan, props.onAsGroup])
  /* The dock's label: the moment stepped to, the one the engine has reached while it runs, else the last. */
  const liveMoment = Math.max(0, moments.reduce((at, m, i) => (m.from <= props.s ? i : at), 0))
  const atMoment = view ?? (running ? liveMoment : moments.length - 1)

  return (
    <RunStage
      ref={stage}
      reduced={reduced}
      className={`rl-pass-stage${theme === 'dark' ? ' is-dark' : ''}`}
      label="Sign-in run, as an access pass"
      dock={
        <>
          <StageThemeToggle />
          <span className="bb__float__sep" />
          <Tip text="Previous stamp" placement="top">
            <button type="button" className="bb__act" aria-label="Previous stamp" disabled={running || atMoment <= 0} onClick={() => step(-1)}>
              <ChevronLeft size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
          <span className="rl-pass__stepno" aria-live="polite">
            {moments[atMoment]?.label ?? ''}
          </span>
          <Tip text="Next stamp" placement="top">
            <button type="button" className="bb__act" aria-label="Next stamp" disabled={running || view === null} onClick={() => step(1)}>
              <ChevronRight size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
          <span className="bb__float__sep" />
          <Tip text={flipped ? 'Front of the pass' : 'Checks on the back'} placement="top">
            <button type="button" className="bb__act" aria-label="Flip the pass" aria-pressed={flipped} onClick={() => setFlipped((f) => !f)}>
              <RotateCw size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
        </>
      }
    >
      <div ref={worldRef} className={`rl-pass is-${c.tone}${landed ? ' is-landed' : ''}`} data-stage={theme} style={{ width: WORLD_W }}>
        <Wallet c={c} open={edge} onOpen={setEdge} onOpenPolicy={props.onOpenPolicy} />
        <div ref={press} className="rl-pass__flip" data-card>
          <motion.div
            className={`rl-pass__card${tall ? ' is-tall' : ''}${landed ? ` is-${c.tone}` : decider && sDrawn >= decider.settleAt ? ' is-issuing' : ' is-blank'}`}
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : 0.62, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={() => {
              if (!flipped) setTall(false)
            }}
          >
            <PassFront c={c} open={fieldOpen} onField={onField} onFlip={() => setFlipped(true)} onPressPerson={props.onPressPerson} onAdd={props.onAdd} onFinding={onFinding} />
            <PassBack c={c} onFlip={() => setFlipped(false)} onOpenRule={props.onOpenRule} />
          </motion.div>
        </div>
        {landed && view === null && groupRows.length > 0 && (
          <div className="rl-pass__asgroups" data-card>
            <Users size={14} strokeWidth={2.2} aria-hidden />
            {groupRows.map((g) => (
              <button key={g.key} type="button" className={`rl-pass__asgroup is-${g.decision ?? 'none'}`} onClick={() => props.onAsGroup!(g.groupId!)}>
                {g.label} only
                <span>{g.decision ? DECISION_WORDS[g.decision] : g.words}</span>
              </button>
            ))}
          </div>
        )}
        {slip && <Slip c={c} k={slip} animate={!reduced} onClose={() => setSlip(null)} onOpenPolicy={props.onOpenPolicy} onOpenRule={props.onOpenRule} onAdd={props.onAdd} />}
      </div>
    </RunStage>
  )
}
