import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { audienceViaOf } from '../conflicts'
import { activeNode } from '../engine-run'
import { eachGroupRows, heroFinding } from '../journey'
import { RunStage, type StageView } from './RunStage'
import { StageThemeToggle, useStageTheme } from './explainer-theme'
import { endOf, firstName, landedAt, markOf, momentAt, momentLabel, momentsOf, toneOf } from './explainer-model'
import { Story, type StoryStep } from './explainer-story'
import { Visual } from './explainer-visual'
import { headlineOf, storyOf } from './explainer-words'
import type { RunLayoutProps } from './types'
import './explainer.css'

/* -----------------------------------------------------------------------------
   The run as an EXPLAINER (run-layout.ts `explainer`): told as a scrolling
   story, as the best data journalism does it — a column of short steps on
   the left, and a PINNED VISUAL on the right that changes with each step, so
   reading the words and watching the picture are one act.

     ┌ Access check ──────────────┐   ┌──────────────────────────────┐
     │ Maya Iyer gets into AWS    │   │   the person → the policy    │
     │ Console on one factor      │   │   stack, the chosen one      │
     │ ● 1 Sign-in  Maya signs …  │   │   lifting out → its rules,   │
     │ ● 2 Policies AWS Console … │   │   checks ✓ ✕ → the answer    │
     │ ● 3 …                      │   │   with What they see         │
     └────────────────────────────┘   └──────────────────────────────┘

   The story advances with the clock: the lit paragraph is the moment the
   engine is at, and the visual morphs to it (explainer-visual.tsx). Once it
   lands the admin scrubs — scroll the column, press a paragraph or its node
   on the rail, ← →, or the dock's arrows. Everything is drawn from `s`; a
   moment pressed is drawn as it stood when it ended (explainer-model.ts).

   The world is the view's size, fitted at zoom 1 (the column scrolls inside
   it; the page never does). Nothing motion moves carries a CSS transform or
   transition.
   -------------------------------------------------------------------------- */

const STORY_W = 420

function useRoom(el: HTMLElement | null): { w: number; h: number } {
  const [room, setRoom] = useState({ w: 1280, h: 660 })
  useLayoutEffect(() => {
    const ground = el?.closest<HTMLElement>('.rstage')
    if (!ground) return
    const read = () => {
      const w = Math.round(Math.min(1440, Math.max(940, ground.clientWidth - 96)))
      const h = Math.round(Math.min(860, Math.max(540, ground.clientHeight - 140)))
      setRoom((r) => (r.w === w && r.h === h ? r : { w, h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(ground)
    return () => ro.disconnect()
  }, [el])
  return room
}

export default function ExplainerLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows, asGroup, screens } = props
  const [theme] = useStageTheme()
  const brand = useBrand()
  const { users, apps, zones } = brand
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const [worldEl, setWorldEl] = useState<HTMLDivElement | null>(null)
  const room = useRoom(worldEl)

  /* Who signed in to what, and how the deciding policy covers them. */
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = plan.appName || app?.name || 'the application'
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  /* Said as a subject and an object alike ("so … gets in", "covers …"): a name, or a noun. */
  const first = asGroup ? `a member of ${asGroup}` : person ? firstName(person.name) : 'the person'
  const via = useMemo(() => {
    const list = props.policies ?? brand.policies
    const p = plan.decider ? list.find((x) => x.id === plan.decider!.id) : undefined
    try {
      return p && person ? audienceViaOf(p, person, env) : null
    } catch {
      return null
    }
  }, [plan.decider, props.policies, brand.policies, person, env])
  const facts = useMemo(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows).map((t) => tokenValue(t, form, ctx))
  }, [rows, form, users, apps, zones])

  // --- The moments and their words ---
  const groups = useMemo(() => eachGroupRows(plan), [plan])
  const moments = useMemo(() => momentsOf(plan, groups !== null), [plan, groups])
  const landed = landedAt(plan, s)
  const tone = toneOf(plan)
  const hero = useMemo(() => heroFinding(plan), [plan])
  const paras = useMemo(
    () => storyOf(plan, moments, { person: personName, first, app: appName, via, facts, screens, groups, hero }),
    [plan, moments, personName, first, appName, via, facts, screens, groups, hero],
  )
  const headline = headlineOf(plan, { person: personName, app: appName, screens }, landed)
  const reached = moments.filter((m) => (landed ? true : m.kind !== 'groups' && s >= m.at)).length
  const live = Math.min(reached - 1, momentAt(moments, s, landed))

  // --- Who holds the story: the clock, or the admin ---
  const [user, setUserRaw] = useState<number | null>(null)
  const [poked, setPoked] = useState(false)
  const [seen, setSeen] = useState({ runKey, landed })
  if (seen.runKey !== runKey || seen.landed !== landed) {
    setSeen({ runKey, landed })
    setUserRaw(null)
    if (seen.runKey !== runKey) setPoked(false)
  }
  const setUser = useCallback((u: number | null | ((was: number | null) => number | null)) => {
    setPoked(true)
    setUserRaw(u)
  }, [])
  /* Motion: while it plays, and for whatever the admin presses; a Skip or a revisit lands still. */
  const motionOn = !reduced && (animate || poked || !jumped)
  const focus = Math.max(0, Math.min(reached - 1, user ?? live))
  const held = user !== null && !landed && running
  const drawS = user === null ? s : Math.min(s, endOf(plan, moments, focus))

  const pick = useCallback((i: number) => setUser(!landed && i === live ? null : i), [landed, live, setUser])
  const stepBy = useCallback((d: 1 | -1) => setUser((u) => Math.max(0, Math.min(reached - 1, (u ?? live) + d))), [reached, live, setUser])
  const link = useCallback((to: string) => {
    const i = moments.findIndex((m) => m.key === to)
    if (i >= 0 && i < reached) setUser(i)
  }, [moments, reached, setUser])

  const steps: StoryStep[] = moments.slice(0, reached).map((m, i) => ({ para: paras[i], label: momentLabel(plan, m), mark: !landed && i === live && markOf(plan, m, s, landed) === 'waiting' ? 'working' : markOf(plan, m, s, landed) }))

  // --- Keys: ← → step, Home / End ---
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      if (!root || (t && t !== document.body && !root.contains(t))) return
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        stepBy(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        setUser(e.key === 'Home' ? 0 : reached - 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stepBy, reached, setUser])

  // --- The camera: the world is the view, fitted at zoom 1; the engine's node followed lazily ---
  useLayoutEffect(() => {
    stage.current?.fit({ max: 1, jump: true })
  }, [runKey, room.w, room.h])
  useEffect(() => {
    if (landed) stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, reduced, jumped, animate])
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, s)
    const el = node ? worldEl?.querySelector(`[data-node="${node}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced, worldEl])

  const visualW = room.w - STORY_W - 32
  return (
    <div ref={rootRef} className="rl-explainer-root" data-stage={theme}>
      <div className="rl-explainer__backdrop" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-explainer"
        label={`Sign-in run, told as a story: ${appName}`}
        dock={
          <>
            <StageThemeToggle />
            <span className="bb__float__sep" />
            <Tip text="Previous step" placement="top">
              <button type="button" className="bb__act" aria-label="Previous step" disabled={focus <= 0} onClick={() => stepBy(-1)}>
                <ChevronLeft size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
            <span className="rl-explainer__stepno" aria-live="polite">{`${focus + 1} of ${reached}`}</span>
            <Tip text="Next step" placement="top">
              <button type="button" className="bb__act" aria-label="Next step" disabled={focus >= reached - 1} onClick={() => stepBy(1)}>
                <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
          </>
        }
      >
        <div key={runKey} ref={setWorldEl} className="rl-explainer__world" style={{ width: room.w, height: room.h, '--rx-story': `${STORY_W}px` } as CSSProperties}>
          <Story
            steps={steps}
            focus={focus}
            doing={moments[live]?.kind === 'rule' ? 'Reading the rules' : moments[live]?.kind === 'outcome' ? 'Deciding' : 'Reading the policies'}
            headline={headline}
            tone={tone}
            s={s}
            running={running}
            landed={landed}
            held={held}
            animate={animate}
            reduced={reduced}
            onPick={pick}
            onStep={stepBy}
            onLive={() => setUserRaw(null)}
            onLink={link}
            onAdd={props.onAdd}
            onAsGroup={props.onAsGroup}
          />
          <Visual
            props={props}
            moments={moments}
            focus={focus}
            s={drawS}
            final={landed}
            width={visualW}
            height={room.h}
            first={first}
            personName={personName}
            via={via}
            facts={facts}
            groups={groups}
            animate={motionOn}
            morph={motionOn && Math.abs((stage.current?.zoom() ?? 1) - 1) < 0.01}
            onPick={link}
          />
        </div>
      </RunStage>
    </div>
  )
}
