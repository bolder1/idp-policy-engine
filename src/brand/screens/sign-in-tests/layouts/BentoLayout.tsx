import { animate as play } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Tip } from '../../../kit'
import { useBrand } from '../../../store'
import { useSimEnv } from '../../sim-env'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import { audienceViaOf } from '../conflicts'
import { activeNode } from '../engine-run'
import { ConflictBody, ChangeBody } from './bento-extra'
import { HeroBody, SeeBody } from './bento-hero'
import { areasCss, boardAreas, checkRefs, expandedAreas, isLanded, neighbour, shownChecks, TILE_LABEL, TILE_ORDER, tilePhase, toneOf, workingTile, type TileId } from './bento-model'
import { Skel, Tile } from './bento-parts'
import { ChecksBody, RuleBody } from './bento-rule-checks'
import { StageThemeToggle, useStageTheme } from './bento-theme'
import { useWhatIfs, type WhatIf } from './bento-whatif'
import { PolicyBody, WhoBody } from './bento-who-policy'
import { checksTitle, conflictView, EASE, LAYOUT, wouldOf, type AlsoCover } from './bento-words'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './bento.css'

/* -----------------------------------------------------------------------------
   The run as a BENTO board (run-layout.ts `bento`): the whole answer in one
   glance — tiles of different sizes, each one idea, arranged by importance,
   all readable at once. The hero is the verdict; around it who, the policy,
   the rule, the checks, what they see, and — only when the run has them — the
   conflict and what would change it.

   The run fills the board in the engine's order: every tile is there from
   the first frame as a soft skeleton, the one the engine works on carries
   the blue working edge while its content streams in, and the hero lands last
   with a gentle rise. A tile pressed opens in place, the others gliding
   round it; hovering a tile lights its phrase in the hero.
   -------------------------------------------------------------------------- */

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const NO_ALSO = new Map<string, AlsoCover>()
const LINK_OF: Partial<Record<TileId, string>> = { who: 'who', policy: 'policy', rule: 'rule', checks: 'checks', see: 'see', conflict: 'conflict', change: 'change' }

interface Box {
  l: number
  t: number
  w: number
  h: number
}

export default function BentoLayout(props: RunLayoutProps) {
  const { running, reduced, jumped, runKey, rows, asGroup, onPressPerson } = props
  const [theme] = useStageTheme()
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const env = useSimEnv()
  const stage = useRef<StageView | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const tileEls = useRef(new Map<TileId, HTMLElement>())

  /* What is open, hovered, focused, previewed — all let go on a new run. */
  const [open, setOpen] = useState<TileId | null>(null)
  const [hot, setHot] = useState<TileId | null>(null)
  /* A phrase in the hero hovered: the tile it cites lights. */
  const [cited, setCited] = useState<TileId | null>(null)
  const [current, setCurrent] = useState<TileId>('hero')
  const [preview, setPreview] = useState<WhatIf | null>(null)
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setOpen(null)
    setHot(null)
    setPreview(null)
  }
  if (preview && running) setPreview(null)

  const plan = preview?.plan ?? props.plan
  const form = preview?.form ?? props.form
  const screens = preview?.screens ?? props.screens
  const s = preview ? plan.steps.length - 1 : props.s
  /* After a Skip the settled frame shows at once: nothing staggers in. */
  const pop = preview ? !reduced : props.animate && !jumped
  const glide = !reduced

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

  /* Later policies that also cover them: by id (the policy tile), by group (the who tile). */
  const also = useMemo(() => {
    const conflictIds = new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId))
    const byId = new Map<string, AlsoCover>()
    const byGroup = new Map<string, AlsoCover>()
    for (const pc of plan.conflicts?.policies ?? []) {
      const a: AlsoCover = { name: pc.policyName, conflict: conflictIds.has(pc.policyId), would: wouldOf(pc), via: pc.via.say }
      byId.set(pc.policyId, a)
      for (const g of pc.via.groups) if (!byGroup.has(g.id)) byGroup.set(g.id, a)
    }
    return { byId, byGroup }
  }, [plan.conflicts])

  /* The sign-in's facts, for the hero's line; in a what-if, the one it changed marked. */
  const facts = useMemo(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    const said = (f: typeof form) =>
      sentenceTokens(rows)
        .filter((t) => t !== 'person' && t !== 'app')
        .map((t) => {
          const v = tokenValue(t, f, ctx)
          return { key: String(t), text: v.unset ? `${v.label}: not stated` : t === 'risk' ? `Risk ${v.text}` : v.text, unset: !!v.unset }
        })
    const now = said(form)
    if (form === props.form) return now
    const was = new Map(said(props.form).map((x) => [x.key, x.text]))
    return now.map((x) => ({ ...x, changed: was.get(x.key) !== x.text }))
  }, [rows, form, props.form, users, apps, zones])

  // --- The model at `s` ---
  const { refs, kind } = useMemo(() => checkRefs(plan), [plan])
  const shown = useMemo(() => shownChecks(plan, refs, kind), [plan, refs, kind])
  const cview = useMemo(() => conflictView(plan, first), [plan, first])
  const landed = isLanded(plan, s)
  const baseLanded = isLanded(props.plan, props.s) && !props.running
  const tone = toneOf(plan)
  const working0 = workingTile(plan, s, shown, cview !== null)
  const canChange = rows.rows.has('place') || rows.rows.has('device') || rows.rows.has('risk')
  const flips = useWhatIfs(props.form, rows, props.plan, baseLanded && canChange && !props.plan.empty)
  const changed = flips.filter((w) => w.changed)

  /* The room: the board takes the canvas's size, within reason (measured below). */
  const [room, setRoom] = useState({ w: 1280, h: 660 })
  const tight = room.h < 640
  const present = useMemo(() => {
    const t: TileId[] = tight ? ['hero'] : ['hero', 'who']
    if (plan.policies.length > 0) t.push('policy')
    if (plan.decider && plan.rules.length > 0) t.push('rule')
    if (refs.length > 0) t.push('checks')
    if (!plan.empty && screens.length > 0 && form.appId) t.push('see')
    if (cview) t.push('conflict')
    if (preview || (canChange && !plan.empty && (!baseLanded || changed.length > 0))) t.push('change')
    return t
  }, [tight, plan, refs.length, screens.length, form.appId, cview, preview, canChange, baseLanded, changed.length])
  /* With no who tile, the who check is the rule tile's. */
  const working = working0 === 'who' && !present.includes('who') ? 'rule' : working0
  const openTile = open && present.includes(open) ? open : null
  const grid = useMemo(() => (openTile ? expandedAreas(present, openTile) : boardAreas(new Set(present))), [present, openTile])
  const areasKey = areasCss(grid)

  /* The rise is for an answer seen landing as the run plays — decided once, the moment it lands; never after a Skip. */
  const [landing, setLanding] = useState<{ key: number; live: boolean } | null>(null)
  if (isLanded(props.plan, props.s) && landing?.key !== runKey) {
    setLanding({ key: runKey, live: props.running && props.animate && !jumped && !reduced && props.s < props.plan.steps.length - 1 })
  }
  const rise = landed && !preview && landing?.key === runKey && landing.live

  // --- The room: the board takes the canvas's size, within reason ---
  useEffect(() => {
    const ground = gridRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => {
      const r = es[0]?.contentRect
      if (!r || r.width <= 0) return
      const w = Math.round(Math.min(1320, Math.max(1000, r.width - 96)) / 8) * 8
      const h = Math.round(Math.min(720, Math.max(548, r.height - 140)) / 4) * 4
      setRoom((cur) => (Math.abs(cur.w - w) >= 8 || Math.abs(cur.h - h) >= 4 ? { w, h } : cur))
    })
    ro.observe(ground)
    return () => ro.disconnect()
  }, [])

  // --- The camera: the whole board in view; the engine's place kept in view while it plays ---
  const fitted = useRef<number | null>(null)
  useLayoutEffect(() => {
    fitted.current = null
    stage.current?.fit({ max: 1, jump: true })
  }, [runKey, room.w, room.h])
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, s)
    const el = node ? gridRef.current?.querySelector(`[data-node="${node}"]`) : null
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fitted.current === runKey) return
    fitted.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !props.animate })
  }, [landed, runKey, reduced, jumped, props.animate])

  // --- The glide: when the board re-packs, each tile's face moves from where it was (offsets, never transformed rects) ---
  const boxes = useRef(new Map<TileId, Box>())
  const sizes = useRef(new Map<TileId, string>())
  const lastKey = useRef<string>('')
  useLayoutEffect(() => {
    const next = new Map<TileId, Box>()
    for (const [id, el] of tileEls.current) next.set(id, { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    const repacked = lastKey.current !== '' && lastKey.current !== areasKey
    lastKey.current = areasKey
    if (repacked && glide) {
      for (const [id, b] of next) {
        const el = tileEls.current.get(id)
        const face = el?.querySelector<HTMLElement>(':scope > .rl-bento__face')
        const inner = face?.querySelector<HTMLElement>(':scope > .rl-bento__inner')
        if (!face) continue
        const a = boxes.current.get(id)
        if (!a) {
          void play(face, { opacity: [0, 1], scale: [0.94, 1] }, { duration: 0.36, ease: EASE })
          continue
        }
        if (a.l === b.l && a.t === b.t && a.w === b.w && a.h === b.h) continue
        void play(face, { x: [a.l - b.l, 0], y: [a.t - b.t, 0], width: [a.w, b.w], height: [a.h, b.h] }, LAYOUT).then(() => {
          face.style.width = ''
          face.style.height = ''
        })
        const size = el?.dataset.size ?? ''
        if (inner && sizes.current.get(id) !== size) void play(inner, { opacity: [0, 1] }, { duration: 0.26, delay: 0.14, ease: EASE })
      }
    }
    boxes.current = next
    sizes.current = new Map([...tileEls.current].map(([id, el]) => [id, el.dataset.size ?? '']))
  }, [areasKey, glide, room.w, room.h])

  /* The hero's landing: a gentle rise, once. */
  const rose = useRef<number | null>(null)
  useEffect(() => {
    if (!rise || rose.current === runKey) return
    rose.current = runKey
    const face = tileEls.current.get('hero')?.querySelector<HTMLElement>(':scope > .rl-bento__face')
    if (face) void play(face, { scale: [0.955, 1.014, 1] }, { duration: 0.64, ease: EASE, times: [0, 0.62, 1] })
  }, [rise, runKey])

  // --- Poking it: open in place, the arrows, Escape, the dock's stepper ---
  const setRef = useCallback((t: TileId, el: HTMLElement | null) => {
    if (el) tileEls.current.set(t, el)
    else tileEls.current.delete(t)
  }, [])
  const focusTile = useCallback((t: TileId) => {
    setCurrent(t)
    window.requestAnimationFrame(() => tileEls.current.get(t)?.focus({ preventScroll: true }))
  }, [])
  const toggle = useCallback((t: TileId) => {
    setCurrent(t)
    setOpen((o) => (o === t ? null : t))
  }, [])
  const onKey = (t: TileId, e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && openTile) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(null)
      focusTile(openTile)
      return
    }
    if (e.target !== e.currentTarget) return
    const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[e.key as 'ArrowLeft']
    if (dir) {
      e.preventDefault()
      const n = neighbour(grid, t, dir)
      if (n) focusTile(n)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(t)
    }
  }
  useEffect(() => {
    if (!openTile) return
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setOpen(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [openTile])
  const walk = present.slice().sort((a, b) => TILE_ORDER.indexOf(a) - TILE_ORDER.indexOf(b))
  const stepTile = (d: 1 | -1) => {
    const at = openTile ? walk.indexOf(openTile) : -1
    const next = at < 0 ? (d > 0 ? 0 : walk.length - 1) : at + d
    const t = next < 0 || next >= walk.length ? null : walk[next]
    setOpen(t)
    if (t) setCurrent(t)
  }
  const roving = present.includes(current) ? current : 'hero'

  // --- The board ---
  const sizeOf = (t: TileId): 'normal' | 'open' | 'mini' => (!openTile ? 'normal' : openTile === t ? 'open' : 'mini')
  const phaseOf = (t: TileId) => (preview ? 'settled' : tilePhase(plan, t, s, working, shown))
  const common = (t: TileId) => ({
    id: t,
    area: t,
    phase: phaseOf(t),
    size: sizeOf(t),
    hot: hot === t || cited === t,
    current: roving === t,
    onHot: setHot,
    onFocusTile: setCurrent,
    onToggle: toggle,
    onKey,
    setRef,
  })
  const decider = plan.policies.find((p) => p.decides)
  const routed = landed || (decider ? s >= decider.settleAt : false)
  const rulesOpen = landed || (decider?.expandAt != null && s >= decider.expandAt)
  const conflictShown = landed || phaseOf('conflict') !== 'waiting'
  const seeWide = !present.includes('conflict') && !present.includes('change')
  const style = {
    width: room.w,
    height: room.h,
    gridTemplateAreas: areasKey,
    gridTemplateRows: openTile ? `repeat(${grid.length - 1}, auto) minmax(0, 1fr)` : 'minmax(0, 0.86fr) minmax(0, 1.14fr) minmax(0, 1fr) minmax(0, 1fr)',
  } as CSSProperties

  return (
    <div className="rl-bento-root" data-stage={theme}>
      <div className="rl-bento__backdrop" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-bento-stage"
        label={`Sign-in run: ${appName}, as a board`}
        dock={
          <>
            <StageThemeToggle />
            <span className="bb__float__sep" />
            <Tip text="Previous tile" placement="top">
              <button type="button" className="bb__act" aria-label="Previous tile" disabled={!landed} onClick={() => stepTile(-1)}>
                <ChevronLeft size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
            <span className="rl-bento__stepno" aria-live="polite">
              {openTile ? TILE_LABEL[openTile] : 'Board'}
            </span>
            <Tip text="Next tile" placement="top">
              <button type="button" className="bb__act" aria-label="Next tile" disabled={!landed} onClick={() => stepTile(1)}>
                <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
          </>
        }
      >
        <div ref={gridRef} className={`rl-bento${openTile ? ' is-opened' : ''}${preview ? ' is-whatif' : ''}${tight ? ' is-tight' : ''}`} style={style}
          data-hot={!openTile ? (cited ? LINK_OF[cited] : hot ? LINK_OF[hot] : undefined) : undefined}
          onMouseOver={(e) => {
            const el = (e.target as Element).closest('[data-tile="hero"] [data-link]')
            const t = (el?.getAttribute('data-link') ?? null) as TileId | null
            setCited(t && t !== 'hero' && present.includes(t) ? t : null)
          }}
          onMouseLeave={() => setCited(null)}
          role="group" aria-label="The run, tile by tile: arrows move, Enter opens">
          <Tile
            {...common('hero')}
            node="outcome"
            tone={landed ? tone : undefined}
            title={preview ? `What if · ${preview.label}` : 'Outcome'}
            aside={
              landed && props.breakIn && props.onReviewBreakIn && !preview && !openTile ? (
                <button type="button" className="rl-bento__quiet" onClick={() => props.onReviewBreakIn!('outcome')}>
                  Break-in attempts
                  <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                </button>
              ) : undefined
            }
          >
            <HeroBody
              size={sizeOf('hero')}
              plan={plan}
              s={s}
              landed={landed}
              working={working === 'hero'}
              tone={tone}
              animate={pop}
              personName={personName}
              personId={person?.id ?? null}
              appId={form.appId}
              appName={appName}
              facts={facts}
              checks={refs}
              screens={screens}
              columns={preview ? [] : props.columns}
              changed={preview ? null : props.changed}
              expected={preview ? null : props.expected}
              weaker={preview ? null : props.weaker}
              hasConflictTile={present.includes('conflict')}
              whoNode={!present.includes('who')}
              via={!present.includes('who') && landed && via?.label ? via.label : null}
              onOpenRule={props.onOpenRule}
              onOpenPolicy={props.onOpenPolicy}
              onFinding={() => {
                if (present.includes('conflict')) toggle('conflict')
              }}
            />
          </Tile>
          {present.includes('who') && (
            <Tile {...common('who')} node="sign-in">
              <WhoBody
                size={sizeOf('who')}
                name={personName}
                asGroup={asGroup}
                groups={memberGroups}
                via={via}
                routed={routed}
                globalDefault={plan.decider?.isGlobalDefault === true && plan.policies.length > 1}
                alsoByGroup={landed ? also.byGroup : NO_ALSO}
                first={first}
                appName={appName}
                plan={plan}
                animate={pop}
                onAsGroup={props.onAsGroup}
                onPressPerson={onPressPerson}
              />
            </Tile>
          )}
          {present.includes('policy') && (
            <Tile {...common('policy')} node="which" title={`Policies on ${appName}`}>
              <PolicyBody size={sizeOf('policy')} plan={plan} s={s} landed={landed} first={first} animate={pop} also={also.byId} onOpenPolicy={props.onOpenPolicy} />
            </Tile>
          )}
          {present.includes('rule') && (
            <Tile {...common('rule')} title={rulesOpen && plan.decider ? `Rules in ${plan.decider.name}` : 'Rules'}>
              <RuleBody size={sizeOf('rule')} plan={plan} s={s} landed={landed} open={rulesOpen} tone={tone} animate={pop} onOpenRule={props.onOpenRule} onOpenPolicy={props.onOpenPolicy} />
            </Tile>
          )}
          {present.includes('checks') && (
            <Tile {...common('checks')} title={phaseOf('checks') === 'waiting' ? 'Checks' : checksTitle(plan, refs, kind)}>
              <ChecksBody size={sizeOf('checks')} plan={plan} s={s} refs={openTile === 'checks' ? refs : shown} kind={kind} reached={phaseOf('checks') !== 'waiting'} tight={tight} animate={pop} onAdd={props.onAdd} />
            </Tile>
          )}
          {present.includes('see') && (
            <Tile {...common('see')}>
              <SeeBody size={sizeOf('see')} landed={landed} screens={screens} appId={form.appId} plan={plan} wide={seeWide} />
            </Tile>
          )}
          {present.includes('conflict') && cview && (
            <Tile {...common('conflict')} title={conflictShown ? cview.title : <Skel w="40%" />}>
              <ConflictBody size={sizeOf('conflict')} view={cview} plan={plan} shown={conflictShown} onOpenRule={props.onOpenRule} onOpenPolicy={props.onOpenPolicy} onAsGroup={preview ? undefined : props.onAsGroup} />
            </Tile>
          )}
          {present.includes('change') && (
            <Tile {...common('change')}>
              <ChangeBody
                size={sizeOf('change')}
                flips={baseLanded ? flips : null}
                preview={preview}
                onPreview={(w) => {
                  setPreview(w)
                  setOpen(null)
                }}
                onBack={() => setPreview(null)}
              />
            </Tile>
          )}
        </div>
      </RunStage>
    </div>
  )
}
