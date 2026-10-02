import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Ban, ChevronLeft, ChevronRight, KeyRound, Navigation, Pencil, ShieldCheck, Split, Undo2, type LucideIcon } from 'lucide-react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { audienceViaOf } from '../conflicts'
import { activeNode } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { Arrival } from './directions-arrival'
import { DirectionsList } from './directions-list'
import { RouteMap } from './directions-map'
import { currentKey, directionsOf, firstName, landedAt, listHeight, toneOf, verdictWords, type DirStep } from './directions-model'
import { useReroutes, type Reroute } from './directions-reroute'
import { StageThemeToggle, useStageTheme } from './directions-theme'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './directions.css'

/* -----------------------------------------------------------------------------
   The run as DIRECTIONS (run-layout.ts `directions`): turn-by-turn, as a
   maps app gives them — the most familiar way to follow a route.

     ┌ Allow on 1 factor ────────────┐  ┌ the route map ───────────────────┐
     │ Maya Iyer → AWS Console        │  │  ● Maya Iyer                     │
     │ ○ Start · Maya Iyer            │  │  │                               │
     │ ⌖ Head into 4 policies         │  │ ─┼──── ✕ ──── ✓ ──── ✱           │
     │ ↳ Take AWS for engineering …   │  │ ─┤          ┃                     │
     │ ⊖ Rule 1 · no entry   1 check  │  │ ─┤    [   AWS Console   ]         │
     │ ↴ Rule 2 · turn in   2 checks  │  │ ─┘         [arrival card]         │
     │ ⚑ Arrive · signed in …         │  └──────────────────────────────────┘
     │ Reroute: From Home broadband … │
     └────────────────────────────────┘

   The list grows as the engine reads (directions-model.ts); the map's route
   grows with the clock and its camera rides with the vehicle
   (directions-map.tsx, directions-drive.ts); on arrival the camera pulls back
   and the arrival card rises at the pin. Everything is drawn from `s`.
   -------------------------------------------------------------------------- */

const LIST_W = 404
const GAP = 24
const ICON: Record<string, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export default function DirectionsLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows, asGroup, screens } = props
  const [theme] = useStageTheme()
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  /* Played in front of us (not a revisit, not skipped): things arrive with motion. */
  const [played, setPlayed] = useState<number | null>(null)
  if (running && animate && played !== runKey) setPlayed(runKey)
  const instant = reduced || jumped || played !== runKey
  const landed = landedAt(plan, s)

  /* What is pressed, the reroute on show, What they see: all let go on a new run. */
  const [selKey, setSelKey] = useState<string | null>(null)
  const [selNode, setSelNode] = useState<string | null>(null)
  const [reroute, setReroute] = useState<Reroute | null>(null)
  const [see, setSee] = useState(false)
  /* Drive it again: a number the map replays its vehicle on. */
  const [replay, setReplay] = useState(0)
  /* What the pointer (or the focus) is on: lit in both the list and the map. */
  const [hot, setHot] = useState<string | null>(null)
  /* A short canvas (a 1280 × 800 window): the steps sit closer, so the whole route still reads at full size. */
  const [compact, setCompact] = useState(false)
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setSelKey(null)
    setSelNode(null)
    setReroute(null)
    setSee(false)
  }
  if (reroute && running) setReroute(null)

  /* Who signed in to what. */
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = plan.appName || app?.name || 'the application'
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ? 'them' : person ? firstName(person.name) : 'them'
  const groupNames = useMemo(() => {
    if (!person || asGroup) return asGroup ? [asGroup] : []
    const ids = [person.groupId, ...(person.alsoGroupIds ?? [])].filter((x, i, a) => x && a.indexOf(x) === i)
    return ids.map((id) => groups.find((g) => g.id === id)?.name ?? id)
  }, [person, groups, asGroup])
  const facts = useMemo(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => tokenValue(t, form, ctx))
  }, [rows, form, users, apps, zones])

  /* How the policy taken covers them, and the later ones that also do. */
  const via = useMemo(() => {
    const list = props.policies ?? brand.policies
    const pol = plan.decider ? list.find((x) => x.id === plan.decider!.id) : undefined
    try {
      return pol && person ? audienceViaOf(pol, person, env) : null
    } catch {
      return null
    }
  }, [plan.decider, props.policies, brand.policies, person, env])
  const also = useMemo(() => {
    const conflict = new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId))
    return new Map((plan.conflicts?.policies ?? []).map((pc) => [pc.policyId, { name: pc.policyName, conflict: conflict.has(pc.policyId) }]))
  }, [plan.conflicts])

  const startSub = [groupNames.join(', '), ...facts.map((f) => (f.unset ? `${f.label}: not stated` : f.token === 'risk' ? `Risk score ${f.text}` : f.text))].filter(Boolean).join(' · ')
  const steps = useMemo(() => directionsOf(plan, s, { person: personName, first, startSub, via, also, screens }), [plan, s, personName, first, startSub, via, also, screens])
  const current = currentKey(steps, plan, s)
  /* The list's height once landed: the world holds it from the first frame. */
  const restH = useMemo(() => {
    const last = directionsOf(plan, plan.steps.length - 1, { person: personName, first, startSub, via, also, screens })
    const reroutes = !plan.empty && (rows.rows.has('place') || rows.rows.has('device') || rows.rows.has('risk') || (plan.asEachGroup?.rows.length ?? 0) > 2)
    return listHeight(last, reroutes, compact)
  }, [plan, personName, first, startSub, via, also, screens, rows, compact])
  const tone = toneOf(plan)
  const takeWords = plan.decider?.isGlobalDefault ? 'The fallback for everyone' : via?.matches && via.say ? via.say : ''

  const reroutes = useReroutes(props.form, rows, plan, landed && !running)

  // --- Pressing: a step in the list, a junction or gate on the map ---
  const selectStep = useCallback(
    (key: string) => {
      const st = steps.find((x) => x.key === key)
      if (selKey === key) {
        setSelKey(null)
        setSelNode(null)
        return
      }
      setSelKey(key)
      setSelNode(st?.node ?? null)
    },
    [steps, selKey],
  )
  const selectNode = useCallback(
    (node: string) => {
      if (selNode === node) {
        setSelNode(null)
        setSelKey(null)
        return
      }
      setSelNode(node)
      const st = stepFor(steps, plan, node)
      setSelKey(st?.key ?? null)
    },
    [selNode, steps, plan],
  )
  const stepBy = useCallback(
    (dir: 1 | -1) => {
      const at = selKey ? steps.findIndex((x) => x.key === selKey) : -1
      const next = at < 0 ? (dir > 0 ? 0 : steps.length - 1) : Math.max(0, Math.min(steps.length - 1, at + dir))
      const st = steps[next]
      if (!st) return
      setSelKey(st.key)
      setSelNode(st.node)
    },
    [selKey, steps],
  )
  const clear = useCallback(() => {
    setSelKey(null)
    setSelNode(null)
  }, [])

  // --- The camera ---
  const [width, setWidth] = useState(1280)
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width ?? 0
      const h = es[0]?.contentRect.height ?? 0
      if (w <= 0) return
      const next = Math.round(Math.min(1296, Math.max(1040, w - 96)) / 8) * 8
      setWidth((cur) => (Math.abs(cur - next) >= 8 ? next : cur))
      setCompact(h > 0 && h - 140 < 640)
    })
    ro.observe(ground)
    return () => ro.disconnect()
  }, [])
  const mapW = width - LIST_W - GAP

  useLayoutEffect(() => {
    stage.current?.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new run, a new size
  }, [runKey, width, compact])
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, s)
    const el = node ? worldRef.current?.querySelector(`.rl-directions__map [data-node="${node}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])
  useEffect(() => {
    if (landed) stage.current?.fit({ max: 1, jump: instant })
  }, [landed, instant])
  useEffect(() => {
    if (!see) return
    /* After the map has grown to hold it (its ResizeObserver runs a frame later). */
    const id = window.setTimeout(() => stage.current?.follow(worldRef.current?.querySelector('.rl-directions__see') ?? worldRef.current?.querySelector('.rl-directions__arrival'), { lazy: true, y: 0.55, jump: reduced }), 120)
    return () => window.clearTimeout(id)
  }, [see, reduced])

  /* A step's detail opens INSIDE the list: the world keeps the height it had with
     nothing open, the steps scroll, so nothing slides under the dock. */
  const [cap, setCap] = useState<number | null>(null)
  /* Measured after every render with nothing open (the reroute chips arrive a beat after landing); the guard stops at one value. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render, guarded
  useLayoutEffect(() => {
    if (selKey) return
    const h = worldRef.current?.offsetHeight ?? 0
    if (h > 0) setCap((c) => (c === h ? c : h))
  })
  useLayoutEffect(() => {
    const ol = rootRef.current?.querySelector<HTMLElement>('.rl-directions__steps')
    const li = ol?.querySelector<HTMLElement>('.rl-directions__step.is-open')
    if (!ol || !li) return
    const top = li.offsetTop
    const bottom = top + li.offsetHeight
    if (top < ol.scrollTop) ol.scrollTop = top
    else if (bottom > ol.scrollTop + ol.clientHeight) ol.scrollTop = Math.min(top, bottom - ol.clientHeight)
  }, [selKey])

  /* ← → step through the directions, Escape lets go — while the focus is in the layout. */
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      if (!root || !t || !root.contains(t)) return
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!t.closest('.rl-directions__steps')) return
        e.preventDefault()
        stepBy(e.key === 'ArrowDown' ? 1 : -1)
        window.requestAnimationFrame(() => root.querySelector<HTMLElement>('.rl-directions__step.is-open .rl-directions__stepbtn')?.focus())
      } else if (e.key === 'Escape' && (selKey || reroute)) {
        if (selKey) clear()
        else setReroute(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stepBy, clear, selKey, reroute])

  return (
    <div ref={rootRef} className="rl-directions-root" data-stage={theme}>
      <div className="rl-directions__backdrop" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-directions"
        label={`Sign-in run as directions: ${appName}`}
        dock={
          <>
            <StageThemeToggle />
            <Tip text="Drive it again" placement="top">
              <button
                type="button"
                className="bb__act"
                aria-label="Drive it again"
                disabled={!landed || running || reduced}
                onClick={() => {
                  clear()
                  setReroute(null)
                  setReplay((n) => n + 1)
                }}
              >
                <Navigation size={14} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
            <span className="bb__float__sep" />
            <Tip text="Previous step" placement="top">
              <button type="button" className="bb__act" aria-label="Previous step" onClick={() => stepBy(-1)}>
                <ChevronLeft size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
            <span className="rl-directions__stepno" aria-live="polite">
              {selKey ? `${steps.findIndex((x) => x.key === selKey) + 1} of ${steps.length}` : `${steps.length} steps`}
            </span>
            <Tip text="Next step" placement="top">
              <button type="button" className="bb__act" aria-label="Next step" onClick={() => stepBy(1)}>
                <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
          </>
        }
      >
        <div ref={worldRef} key={runKey} className={`rl-directions__world${compact ? ' is-compact' : ''}`} style={{ width, minHeight: restH }}>
          <section className={`rl-directions__panel${selKey && cap ? ' is-capped' : ''}`} data-card style={{ width: LIST_W, maxHeight: selKey && cap ? cap : undefined }} aria-label="Directions">
            <RouteHead plan={plan} landed={landed} tone={tone} personName={personName} personFace={asGroup ? null : (person?.name ?? null)} appId={app?.id ?? null} appName={appName} onPressPerson={props.onPressPerson} />
            <DirectionsList
              steps={steps}
              plan={plan}
              current={current}
              selected={selKey}
              onSelect={selectStep}
              hot={hot}
              onHot={setHot}
              first={first}
              facts={facts}
              animate={!instant}
              onAdd={props.onAdd}
              onOpenRule={props.onOpenRule}
              onOpenPolicy={props.onOpenPolicy}
              onPressPerson={props.onPressPerson}
            />
            <RerouteChips list={reroutes} on={reroute} landed={landed} onPick={(r) => setReroute((cur) => (cur?.alt.key === r.alt.key ? null : r))} onBack={() => setReroute(null)} onAsGroup={props.onAsGroup} />
          </section>
          <RouteMap
            plan={plan}
            s={s}
            runKey={runKey}
            W={mapW}
            tight={compact}
            replay={replay}
            animate={!instant}
            instant={instant}
            person={{ name: personName, groups: groupNames.join(', '), isPerson: !!person && !asGroup }}
            appId={app?.id ?? null}
            first={first}
            tone={tone}
            also={also}
            takeWords={takeWords}
            selected={selNode}
            onSelect={selectNode}
            hot={hot}
            onHot={setHot}
            alt={reroute?.alt ?? null}
            arrival={
              <Arrival
                plan={plan}
                screens={screens}
                appId={form.appId}
                tone={tone}
                columns={props.columns}
                changed={props.changed}
                expected={props.expected}
                weaker={props.weaker}
                see={see}
                onSee={() => setSee((v) => !v)}
                onOpenRule={props.onOpenRule}
                onOpenPolicy={props.onOpenPolicy}
                alt={reroute?.alt ?? null}
                altPlan={reroute?.plan ?? null}
                onBack={() => setReroute(null)}
              />
            }
          />
        </div>
      </RunStage>
    </div>
  )
}

/* The step a map element belongs to: its own, the policy taken's for a later one that also covers them, else the head. */
function stepFor(steps: readonly DirStep[], plan: RunLayoutProps['plan'], node: string): DirStep | undefined {
  const own = steps.find((x) => x.node === node || (x.policies?.some((i) => plan.policies[i]?.node === node) ?? false))
  if (own) return own
  if (node.startsWith('policy:')) {
    const take = steps.find((x) => x.kind === 'take')
    if (take?.also?.some((a) => `policy:${a.policyId}` === node)) return take
    return steps.find((x) => x.kind === 'head')
  }
  return undefined
}

/* The top of the directions, the answer first: the verdict in its colour, who to what, the way to change the sign-in. */
function RouteHead(p: {
  plan: RunLayoutProps['plan']
  landed: boolean
  tone: string
  personName: string
  personFace: string | null
  appId: string | null
  appName: string
  onPressPerson: () => void
}) {
  const o = p.plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? ICON[decided] : Split
  const landing = p.plan.landing !== null ? p.plan.rules[p.plan.landing] : undefined
  const where = landing && o.status !== 'depends' ? (landing.index === null ? 'nothing else matched' : `rule ${landing.index + 1}`) : ''
  return (
    <header className={`rl-directions__head is-${p.landed ? p.tone : 'work'}`}>
      <div className="rl-directions__headtop">
        <span className="rl-directions__headtile" aria-hidden>
          {p.landed ? <Icon size={18} strokeWidth={2.2} /> : <Spinner small />}
        </span>
        <span className="rl-directions__headword" aria-live="polite">
          {p.landed ? verdictWords(p.plan) : 'Finding the route'}
        </span>
      </div>
      <button type="button" className="rl-directions__trip" data-card onClick={p.onPressPerson} title="Change the sign-in">
        {p.personFace && <Face kind="user" name={p.personFace} size="sm" decorative />}
        <strong>{p.personName}</strong>
        <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
        {p.appId && <AppLogo appId={p.appId} name={p.appName} size={16} />}
        <strong>{p.appName}</strong>
        <Pencil className="rl-directions__tripedit" size={12} strokeWidth={2.2} aria-hidden />
      </button>
      {p.landed && o.policyName && (
        <p className="rl-directions__headvia">
          via {o.policyName}
          {where ? `, ${where}` : ''}
        </p>
      )}
    </header>
  )
}

/* Reroute: what-ifs on the facts the rules read, and the person as each group alone. */
function RerouteChips(p: { list: Reroute[]; on: Reroute | null; landed: boolean; onPick: (r: Reroute) => void; onBack: () => void; onAsGroup?: (groupId: string) => void }) {
  if (!p.landed || p.list.length === 0) return null
  const group = p.on?.alt.groupId
  return (
    <div className="rl-directions__reroute">
      <span className="rl-directions__label">Reroute</span>
      <div className="rl-directions__chips">
        {p.list.map((r) => (
          <Tip key={r.alt.key} text={`${r.alt.words}${r.alt.source ? ` · ${r.alt.source}` : ''}`} placement="top">
            <button type="button" className={`rl-directions__chip${p.on?.alt.key === r.alt.key ? ` is-on is-${r.alt.tone}` : ''}`} data-card aria-pressed={p.on?.alt.key === r.alt.key} onClick={() => p.onPick(r)}>
              {r.alt.label}
            </button>
          </Tip>
        ))}
        {/* Last, so pressing a chip never moves the others. */}
        {p.on && (
          <button type="button" className="rl-directions__chip is-back" data-card onClick={p.onBack}>
            <Undo2 size={12} strokeWidth={2.4} aria-hidden />
            Back to this route
          </button>
        )}
      </div>
      {group && p.onAsGroup && (
        <button type="button" className="rl-directions__link" onClick={() => p.onAsGroup!(group)}>
          Run the sign-in as {p.on!.alt.label.replace(/^As | only$/g, '')}
          <ArrowRight size={13} strokeWidth={2.4} aria-hidden />
        </button>
      )}
    </div>
  )
}
