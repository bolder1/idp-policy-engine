import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUpRight, BookmarkPlus, Building, Building2, Clock, CornerDownRight, Gauge, Globe, House, MonitorSmartphone, Network, RotateCcw, VenetianMask, type LucideIcon } from 'lucide-react'

import { Face } from '../../faces'
import { Button, IconButton, StatusPill, Tip } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { PlatformMark } from '../../logos/PlatformMark'
import { useBrand, useNameLookup } from '../../store'
import { columnView, type ColumnView } from '../board/try-sign-in'
import { useSimEnv } from '../sim-env'
import { resolveSignIn } from '../tenant-resolver'
import { boundariesOf } from '../testing/boundaries'
import { rowsRead } from '../testing/rows-read'
import { screensOf, type SignInScreens } from '../testing/screens-of'
import { decisionSig, liveSentence, nextChange, type ChangeTrack } from '../testing/selectors'
import { useTestingSay, useTestingSession } from '../testing/session-state'
import { SaveSignInPopover, SentenceVerdict, SignInSentence } from '../testing/SignInSentence'
import { CHANGED_BY_WORDS, factsOf, type SignInForm } from '../testing/sign-in-form'
import { GLOBAL_SCOPE, sentenceTokens, tokenValue, type TokenIcon, type TokenValue } from '../testing/sign-in-sentence'
import { CardWord, CheckPills, OutcomeNode, RuleOutcome } from '../testing/TracePills'
import { WhatTheySee } from '../testing/WhatTheySee'
import {
  NO_PADS,
  alignPads,
  journeyOf,
  journeyWires,
  padsEqual,
  travelPlan,
  type Box,
  type Boxes,
  type Journey,
  type JourneyRule,
  type JourneyWhich,
  type NodeId,
  type Pads,
  type Route,
  type TravelPlan,
  type Wires,
} from './journey'

/* -----------------------------------------------------------------------------
   Try a sign-in on the Sign-in tests page: the journey canvas (TESTING-V4
   §3.1). The tenant-wide simulator, and the page's showpiece.

     [sentence of pills ........................ verdict  ⟲ ⊕]
     Decided by Developer tools · Rule 2 · Compliant device, working remotely

     Sign-in ──┬── Which policy ──── Rules ─────────── Outcome ── What they see
     [Arun]    ├─ [Global Default]   ┃ [1 In the office]
               └─ [Developer tools]━━╋━[2 Compliant…]━━━ [Allow with 2FA]
                                     ┃ [Nothing else]

   The sentence is the testing session's page form (session-state.ts), so it
   is the same sign-in wherever the page is left and come back to. Every
   column is read off one resolution (journey.ts has the model and the
   geometry); the rule cards are drawn with the board's own pieces — the
   check pills, the rule's outcome, the grey word — so a card here and a card
   on the board can never say two things about one rule.

   The route. Opening the page, Replay, and loading a saved sign-in (the
   session's `runId`) are RUNS: a marker leaves the sign-in, crosses to the
   policy that governs, runs down its rules to the first that matches and out
   to the outcome, in about 1.4 s, and each column rises in as it arrives —
   the rules' checks tick in as it passes each card, first match wins drawn
   rather than said. Anything else — a token changed in the sentence — is an
   UPDATE: the journey settles where it now lands, without travel, and when
   the answer moved the outcome says what moved it ("Changed by IP address").
   Reduced motion is the settled journey at once.

   The connectors are SVG between measured boxes, recomputed when anything
   resizes. The columns hang so the route runs straight (`alignPads`); the
   lit stroke and the marker share one path, so they can never part.

   Motion owns every element it animates — a column (`.tj-col`), a wire, the
   route, the marker — and journey.css gives none of them a transform or a
   transition. The marker is placed along the route with `offset-path`,
   written inline, and moved by motion's `offsetDistance`.
   -------------------------------------------------------------------------- */

/** Wider than this, What they see takes a column of its own; narrower, it sits under the outcome. */
const WIDE_AT = 1360

/** Prefixes the sentence's ids, so a "Needs:" link finds its token. */
const ID_PREFIX = 'sit-try'

/** The single verdict column: the tenant, as every policy is saved. */
const AS_IT_STANDS = { id: 'live' as const, label: 'As the tenant stands', tip: 'Every policy as saved' }

const FACT_ICON: Partial<Record<TokenIcon, LucideIcon>> = {
  office: Building2,
  branch: Building,
  home: House,
  tor: VenetianMask,
  address: Network,
  anywhere: Globe,
  device: MonitorSmartphone,
  clock: Clock,
  risk: Gauge,
}

export function TryJourney({
  onOpenPolicy,
  still = false,
  openSave = false,
}: {
  /** Called in place of opening the policy's board, once the sign-in is on it. */
  onOpenPolicy?: (policyId: string) => void
  /** The settled journey at once, with no run: a thumbnail, a print, a server render. */
  still?: boolean
  /** Opens with Save sign-in open: the page's New sign-in, which lands here with a fresh sign-in to name. */
  openSave?: boolean
}) {
  const store = useBrand()
  const { users, apps, zones, fingerprints, policies, methods, defaultMethodId } = store
  const session = useTestingSession()
  const say = useTestingSay()
  const env = useSimEnv()
  const names = useNameLookup()
  const reduced = useReducedMotion() === true
  const form = session.form

  const rows = useMemo(() => rowsRead(policies, null, form.appId, { zones, fingerprints }), [policies, form.appId, zones, fingerprints])
  const { facts, issues } = useMemo(() => factsOf(form, zones), [form, zones])
  const res = useMemo(() => resolveSignIn(policies, facts, env), [policies, facts, env])
  const boundaries = useMemo(() => boundariesOf(form, rows, {}, policies, env, zones), [form, rows, policies, env, zones])
  const journey = useMemo(() => journeyOf(res, policies, form.appId, env, facts, { names }), [res, policies, form.appId, env, facts, names])
  const screens = useMemo(
    () => screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === form.personId) ?? null }),
    [res, policies, methods, defaultMethodId, users, form.personId],
  )
  const column: ColumnView = useMemo(
    () => columnView({ spec: AS_IT_STANDS, resolution: res }, '', policies, (id) => apps.find((a) => a.id === id)?.name ?? id),
    [res, policies, apps],
  )

  /* "Changed by …": the field that moved the answer on the last edit, kept
     against the last render so it arrives in the frame the answer does. A run
     starts again with nothing named (selectors.ts `nextChange`). */
  const sig = decisionSig(res)
  const [track, setTrack] = useState<ChangeTrack>(() => ({ run: session.runId, sig, form, changed: null }))
  const nextTrack = nextChange(track, { run: session.runId, sig, form })
  if (nextTrack !== track) setTrack(nextTrack)
  const changed = nextTrack.changed ? CHANGED_BY_WORDS[nextTrack.changed] : null

  /* The status region: the answer once per run, and again when an edit moves it. */
  const said = useRef<string | null>(null)
  const sayNow = (key: string) => {
    if (said.current === key) return
    said.current = key
    say(liveSentence(res, policies))
  }

  const [saveOpen, setSaveOpen] = useState(openSave)
  const saveAnchor = useRef<HTMLSpanElement | null>(null)
  const closeSave = () => {
    setSaveOpen(false)
    saveAnchor.current?.querySelector<HTMLElement>('button')?.focus()
  }
  const shown = res.status === 'decided' ? res.decision : null

  const openPolicy = (policyId: string) => {
    session.loadBoard(policyId, form)
    if (onOpenPolicy) onOpenPolicy(policyId)
    else store.go({ name: 'board', policyId, open: 'try' })
  }
  const openRule = (policyId: string, ruleId: string) => {
    session.loadBoard(policyId, form)
    store.go({ name: 'board', policyId, rule: ruleId })
  }

  return (
    <div className="tj">
      <SignInSentence
        form={form}
        onPatch={session.patch}
        rows={rows}
        issues={issues}
        boundaries={boundaries}
        scope={GLOBAL_SCOPE}
        idPrefix={ID_PREFIX}
        className="tj__sentence"
        verdict={<SentenceVerdict columns={[column]} />}
        actions={
          <span className="tsent__actions">
            <IconButton icon={RotateCcw} label="Replay" size="sm" tone="ghost" onClick={session.replay} />
            <span ref={saveAnchor} className="tsent__anchor">
              <IconButton icon={BookmarkPlus} label="Save sign-in" size="sm" tone="ghost" pressed={saveOpen} onClick={() => setSaveOpen((v) => !v)} />
            </span>
            <SaveSignInPopover anchor={saveAnchor} open={saveOpen} onClose={closeSave} form={form} shown={shown} />
          </span>
        }
        why={journey.outcome.why || undefined}
      />
      <JourneyCanvas
        journey={journey}
        form={form}
        tokens={sentenceTokens(rows)}
        screens={screens}
        column={column}
        run={session.runId}
        still={still || reduced}
        changed={changed}
        onLanded={() => sayNow(`${session.runId}|${sig}`)}
        onSettledChange={() => sayNow(`${session.runId}|${sig}`)}
        onOpenPolicy={openPolicy}
        onOpenRule={openRule}
      />
    </div>
  )
}

// --- The canvas ------------------------------------------------------------------------------

/* Where a connector meets a node, when not in its middle: the element marked
   `data-port` inside it (a card's title line, the sign-in's person), or the
   first line of the board's outcome node, or What they see's heading. */
const PORT = '[data-port], .bb-outcome__in > :first-child, .tsee__head'

/* Where every measured box is, against the stage. By offsets, not by
   `getBoundingClientRect`: a column rising in carries motion's `y`, and a
   connector that followed the transform would wobble as it arrived. The port
   is a difference of two rects inside one node, which the transform moves
   together. */
function measure(stage: HTMLElement): Boxes {
  const out: Boxes = {}
  stage.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => {
    let x = 0
    let y = 0
    let at: HTMLElement | null = el
    while (at && at !== stage) {
      x += at.offsetLeft
      y += at.offsetTop
      at = at.offsetParent as HTMLElement | null
    }
    if (at !== stage) return
    const box: Box = { x, y, w: el.offsetWidth, h: el.offsetHeight }
    const portEl = el.querySelector<HTMLElement>(PORT)
    if (portEl) {
      const a = el.getBoundingClientRect()
      const p = portEl.getBoundingClientRect()
      box.port = Math.round(p.top - a.top + p.height / 2)
    }
    out[el.dataset.node as NodeId] = box
  })
  return out
}

const boxesSig = (b: Boxes): string =>
  Object.entries(b)
    .map(([k, v]) => `${k}:${Math.round((v as Box).x)},${Math.round((v as Box).y)},${Math.round((v as Box).w)},${Math.round((v as Box).h)}`)
    .join(';')

interface Run {
  run: number
  plan: TravelPlan
  route: Route
}

function JourneyCanvas({
  journey: j,
  form,
  tokens,
  screens,
  column,
  run,
  still,
  changed,
  onLanded,
  onSettledChange,
  onOpenPolicy,
  onOpenRule,
}: {
  journey: Journey
  form: SignInForm
  tokens: ReturnType<typeof sentenceTokens>
  screens: SignInScreens[]
  column: ColumnView
  run: number
  still: boolean
  changed: string | null
  onLanded: () => void
  onSettledChange: () => void
  onOpenPolicy: (policyId: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
}) {
  const { users, apps, zones } = useBrand()
  const canvas = useRef<HTMLDivElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const [wide, setWide] = useState(false)
  const [pads, setPads] = useState<Pads>(NO_PADS)
  const [geo, setGeo] = useState<{ w: number; h: number; wires: Wires } | null>(null)
  const geoSig = useRef('')
  const [tick, setTick] = useState(0)
  const passes = useRef(0)

  /* Which run has been played. Null to begin with, so opening the page plays
     one; a run with nothing to travel (no policy decides) is played at once. */
  const [played, setPlayed] = useState<number | null>(still ? run : null)
  const [travel, setTravel] = useState<Run | null>(null)
  const [at, setAt] = useState(-1)
  const pending = !still && !j.signIn.empty && played !== run
  const travelling = !still && travel !== null && travel.run === run && at < travel.plan.arrive.length - 1
  const settled = !pending && !travelling

  /* What the marker has reached, while it travels. Settled, everything is. */
  const arrivedAt = (node: NodeId): boolean => {
    if (settled) return true
    if (pending || !travel) return node === 'sign-in'
    const i = travel.plan.arrive.findIndex((a) => a.node === node)
    return i >= 0 && i <= at
  }
  const policyNodeId = j.path.find((n) => n.startsWith('policy:')) ?? null
  const landed = j.landing ? arrivedAt(j.landing) : settled
  const show = {
    which: settled || (!pending && travel !== null && at >= 0),
    rules: settled || (policyNodeId !== null && arrivedAt(policyNodeId)),
    outcome: arrivedAt('outcome'),
    see: arrivedAt('see'),
  }

  // --- Size ---

  useEffect(() => {
    const el = canvas.current
    const st = stage.current
    if (!el || !st || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setWide(el.clientWidth >= WIDE_AT)
      setTick((n) => n + 1)
    })
    ro.observe(el)
    ro.observe(st)
    return () => ro.disconnect()
  }, [])

  /* Measure whenever the layout can have moved — a new journey, a resize, a
     column levelled, a card reached (its grey word takes a line) — then
     level the columns, draw the wires, and, once nothing moves, start the run
     that is waiting. Each step sets state only when what it found differs, so
     this settles in a pass or two. */
  useLayoutEffect(() => {
    const st = stage.current
    if (!st) return
    const boxes = measure(st)
    const nextPads = alignPads(boxes, pads, j, wide)
    if (!padsEqual(nextPads, pads) && passes.current < 6) {
      passes.current += 1
      setPads(nextPads)
      return
    }
    passes.current = 0
    const s = `${boxesSig(boxes)}|${wide}|${st.scrollWidth}x${st.scrollHeight}|${j.path.join(',')}|${j.landing}`
    let wires = geo?.wires ?? null
    if (s !== geoSig.current || !geo) {
      geoSig.current = s
      wires = journeyWires(boxes, j, wide)
      setGeo({ w: st.scrollWidth, h: st.scrollHeight, wires })
    }
    if (pending && wires) {
      if (wires.route) {
        setTravel({ run, plan: travelPlan(wires.route, j.landing), route: wires.route })
        setAt(-1)
      }
      setPlayed(run)
    }
  }, [j, wide, pads, pending, run, tick, at, settled, geo])

  /* The run's clock: each node lights as the marker reaches it. */
  useEffect(() => {
    if (!travel || travel.run !== run || still) return
    const timers = travel.plan.arrive.map((a, i) =>
      window.setTimeout(() => {
        setAt(i)
        if (a.node === 'outcome') onLanded()
      }, a.ms),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run, and only the run, restarts the clock
  }, [travel, run, still])

  /* Settled, an update that moved the answer is said once. */
  useEffect(() => {
    if (settled && !j.signIn.empty) onSettledChange()
  })

  const route = travelling && travel ? travel.route : (geo?.wires.route ?? null)
  const plan = travelling && travel ? travel.plan : null
  const seconds = plan ? plan.total / 1000 : 0
  const policy = j.policy
  const cards = [...j.rules, ...(j.lastRow ? [j.lastRow] : [])]
  const seeNode =
    screens.length > 0 && form.appId ? (
      <div className="tj-see" data-node="see">
        <WhatTheySee screens={screens} appId={form.appId} defaultOpen hidden={!show.see} fade={!still} />
      </div>
    ) : null

  return (
    <div ref={canvas} className="tj-canvas">
      <section ref={stage} className={`tj-stage${wide ? ' is-wide' : ''}`} aria-label="Sign-in journey">
        {geo && (
          <svg className="tj-wires" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden focusable="false">
            {geo.wires.wires.map((w) => {
              const on =
                w.id.startsWith('fan:') ? show.which : w.id === 'trunk' || w.id.startsWith('stub:') ? show.rules : w.id === 'out' ? show.outcome : show.see
              if (w.id === 'see') {
                return (
                  <motion.path
                    key={`${w.id}-${run}`}
                    className="tj-wire is-lit"
                    d={w.d}
                    initial={settled ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
                    transition={{ duration: settled ? 0 : 0.24 }}
                  />
                )
              }
              return (
                <motion.path
                  key={w.id}
                  className="tj-wire"
                  d={w.d}
                  initial={false}
                  animate={{ opacity: on ? 1 : 0 }}
                  transition={{ duration: settled ? 0 : 0.2 }}
                />
              )
            })}
            {route && !pending && (
              <motion.path
                key={`route-${travel?.run ?? 0}`}
                className="tj-route"
                d={route.d}
                initial={plan ? { pathLength: 0 } : false}
                animate={{ pathLength: plan ? plan.frames : 1 }}
                transition={plan ? { duration: seconds, times: plan.times, ease: 'easeInOut' } : { duration: 0 }}
              />
            )}
          </svg>
        )}
        {route && !pending && (
          <motion.span
            key={`marker-${travel?.run ?? 0}`}
            aria-hidden
            className={`tj-marker${j.landingUnknown ? ' is-unknown' : ''}`}
            style={{ offsetPath: `path('${route.d}')`, offsetRotate: '0deg' }}
            initial={plan ? { offsetDistance: '0%' } : false}
            animate={{ offsetDistance: plan ? plan.frames.map((f) => `${f * 100}%`) : '100%' }}
            transition={plan ? { duration: seconds, times: plan.times, ease: 'easeInOut' } : { duration: 0 }}
          />
        )}

        {/* 1. The sign-in */}
        <Column id="sign-in" label="Sign-in" pad={pads['sign-in']} shown settled={settled}>
          <SignInNode journey={j} form={form} tokens={tokens} people={users} apps={apps} zones={zones} />
        </Column>

        {!j.signIn.empty && (
          <>
            {/* 2. Which policy */}
            <Column id="which" label="Which policy" pad={0} shown={show.which} settled={settled}>
              <ol className="tj-which" aria-label="Which policy">
                {j.which.map((w) => (
                  <WhichRow key={w.policyId} row={w} lit={arrivedAt(w.node)} decided={policyNodeId !== null && arrivedAt(policyNodeId)} onOpen={() => onOpenPolicy(w.policyId)} />
                ))}
              </ol>
            </Column>

            {/* 3. The deciding policy's rules */}
            {policy && (
              <Column id="rules" label="Rules" pad={pads.rules} shown={show.rules} settled={settled}>
                <ol className="tj-rules" aria-label={`Rules in ${policy.name}`}>
                  {cards.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      reached={arrivedAt(r.node) || landed}
                      fade={!still}
                      still={still}
                      onOpen={() => onOpenRule(policy.id, r.id)}
                    />
                  ))}
                </ol>
              </Column>
            )}

            {/* 4. The outcome, and what they see under it when there is no room beside it */}
            <Column id="outcome" label="Outcome" pad={pads.outcome} shown={show.outcome} settled={settled}>
              <div className="tj-outcome">
                <div className="tj-outcome__node" data-node="outcome">
                  <OutcomeNode view={j.outcome.view} columns={[column]} changed={settled ? changed : null} hidden={!show.outcome} fade={!still} reduced={still} />
                </div>
                {policy && (
                  <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => onOpenPolicy(policy.id)}>
                    Open policy
                  </Button>
                )}
                {!wide && seeNode}
              </div>
            </Column>

            {/* 5. What they see, in a column of its own when the canvas is wide */}
            {wide && seeNode && (
              <Column id="see" label="" pad={pads.see} shown={show.see} settled={settled}>
                {seeNode}
              </Column>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* A column: its heading, and its body hung at `pad` so the route runs level.
   The wrapper rises in when the marker reaches it — opacity and `y` in
   motion's props, never a stylesheet's; the body's padding is a plain div's. */
function Column({ id, label, pad, shown, settled, children }: { id: string; label: string; pad: number; shown: boolean; settled: boolean; children: ReactNode }) {
  return (
    <motion.div
      className={`tj-col is-${id}`}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown || settled ? 0 : 8 }}
      transition={{ duration: shown && !settled ? 0.32 : 0, ease: [0.2, 0, 0, 1] }}
      aria-hidden={shown ? undefined : true}
    >
      {/* A paragraph, not a heading: the page's h3s are restyled by console-theme.css, and these are labels. */}
      <p className="tj-col__head" aria-hidden={label ? undefined : true}>
        {label}
      </p>
      <div className="tj-col__body" style={{ paddingTop: pad }}>
        {children}
      </div>
    </motion.div>
  )
}

// --- 1. The sign-in node ---------------------------------------------------------------------

function FactMark({ v }: { v: TokenValue }) {
  if (v.mark.kind === 'platform') return <PlatformMark platform={v.mark.platform} size={12} />
  const Icon = v.mark.kind === 'icon' ? FACT_ICON[v.mark.icon] : undefined
  return Icon ? <Icon size={12} strokeWidth={2} aria-hidden /> : null
}

function SignInNode({
  journey: j,
  form,
  tokens,
  people,
  apps,
  zones,
}: {
  journey: Journey
  form: SignInForm
  tokens: ReturnType<typeof sentenceTokens>
  people: Parameters<typeof tokenValue>[2]['people']
  apps: Parameters<typeof tokenValue>[2]['apps']
  zones: Parameters<typeof tokenValue>[2]['zones']
}) {
  const { person, app } = j.signIn
  /* The facts the rules on this application read, as the sentence says them
     — and only those that are stated: "Anywhere" is not a fact. */
  const stated = tokens
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, { people, apps, zones }))
    .filter((v) => !v.unset)
  return (
    <div className="tj-node tj-signin" data-node="sign-in">
      <div className="tj-signin__line" data-port>
        {person ? (
          <>
            <Face kind="user" name={person.name} size="md" decorative />
            <span className="tj-signin__text">
              <strong>{person.name}</strong>
              <span>{person.group}</span>
            </span>
          </>
        ) : (
          <span className="tj-none">Choose a person</span>
        )}
      </div>
      <div className="tj-signin__line">
        {app ? (
          <>
            <AppLogo appId={app.id} name={app.name} size={20} />
            <span className="tj-signin__app">{app.name}</span>
          </>
        ) : (
          <span className="tj-none">Choose an application</span>
        )}
      </div>
      {stated.length > 0 && (
        <ul className="tj-facts" aria-label="Stated">
          {stated.map((v) => (
            <li key={v.token} className="tj-fact">
              <FactMark v={v} />
              <span className="u-sr-only">{v.label}: </span>
              <span className="tj-fact__text" title={v.text}>
                {v.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- 2. A policy that could decide ----------------------------------------------------------

/* One row of the Which policy column. Neutral until the marker reaches the
   policy that decides; then that row takes the accent ring and "Decides", and
   every other steps back. Its few words are what it is; the resolver's own
   sentence is the tooltip. Pressing it opens the policy with this sign-in. */
function WhichRow({ row, lit, decided, onOpen }: { row: JourneyWhich; lit: boolean; decided: boolean; onOpen: () => void }) {
  const state = !decided ? '' : row.decides && lit ? ' is-decides' : ' is-dim'
  return (
    <li className={`tj-whichrow${state}`}>
      <Tip text={row.tip} placement="bottom">
        <button type="button" className="tj-whichrow__btn" data-node={row.node} onClick={onOpen}>
          <span className="tj-whichrow__top">
            <span className="tj-whichrow__name">{row.name}</span>
            {row.decides && decided && <span className="tj-whichrow__word">Decides</span>}
          </span>
          <span className="tj-whichrow__meta">
            <StatusPill status={row.status} />
            {row.reason && <span className="tj-whichrow__reason">{row.reason}</span>}
          </span>
        </button>
      </Tip>
    </li>
  )
}

// --- 3. A rule --------------------------------------------------------------------------------

/* A rule card, as the board draws it in test mode: its number and name, the
   rule's THEN on the right (full tone only where it matched), and one row of
   check pills. Neutral until the marker passes it; then lit, missed or dim.
   The card opens the rule on its policy's board. */
function RuleCard({ rule, reached, fade, still, onOpen }: { rule: JourneyRule; reached: boolean; fade: boolean; still: boolean; onOpen: () => void }) {
  const tone = reached ? ` is-${rule.tone}` : ''
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
  return (
    <li className="tj-rule">
      <div className={`tj-node tj-card${tone}`} data-node={rule.node} role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKey}>
        <div className="tj-card__head" data-port>
          {rule.index !== null ? (
            <span className="tj-card__idx">{rule.index + 1}</span>
          ) : (
            <span className="tj-card__idx is-last" aria-hidden>
              <CornerDownRight size={12} strokeWidth={2} />
            </span>
          )}
          <span className="tj-card__name">
            {rule.index !== null && <span className="u-sr-only">Rule {rule.index + 1}: </span>}
            {rule.name}
          </span>
          <RuleOutcome decision={rule.outcome} lit={reached && rule.tone === 'lit'} />
        </div>
        {(rule.pills.length > 0 || (reached && rule.word)) && (
          <div className="tj-card__body">
            {reached && <CardWord state={rule.state} />}
            <CheckPills pills={rule.pills} show={reached} reduced={still} fade={fade} />
          </div>
        )}
      </div>
    </li>
  )
}

