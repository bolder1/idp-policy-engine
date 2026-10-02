import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Volume2, VolumeX, X } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { useBrand } from '../../../store'
import type { FormField } from '../../testing/sign-in-form'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { policyOpen } from '../engine-run'
import { factMarks, heroFinding, type FactKey } from '../journey'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { MainDisplay, type CallView, type PadFact } from './mission-display'
import { DISPLAY_H, worldWidth } from './mission-geometry'
import { AnswerCard, AskBar, MissionLog, type TickerLine } from './mission-deck'
import {
  answerOf,
  chipsOf,
  deciderVia,
  denyMessageOf,
  factorsOf,
  landingOf,
  lineAll,
  lineLanding,
  lineLock,
  lineRules,
  lineRulesShort,
  lineStart,
  lineVerdict,
  matchIntent,
  type Answer,
  type AskContext,
  type Chip,
  type Intent,
} from './mission-intents'
import { callTone, elapsedAt, flightAt, logLines, met, policyStation, ruleStation } from './mission-model'
import { peekLines, type PeekContext } from './mission-peek'
import { PeekLines } from './mission-deck'
import { PolicyStation, RuleStation } from './mission-stations'
import { createVoice, readVoiceOn, writeVoiceOn, type Voice } from './mission-voice'
import { eachGroupRows } from '../journey'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { Tip } from '../../../kit'
import { RunStage, type StageView } from './RunStage'
import { StageThemeToggle, useStageTheme } from './mission-theme'
import type { RunLayoutProps } from './types'
import './mission.css'

/* -----------------------------------------------------------------------------
   The run as MISSION CONTROL (run-layout.ts `mission`): GO / NO-GO for sign-in.

   The flight director polls the stations IN ORDER, and the first that calls GO
   takes the flight — as the first policy on the application that covers the
   person applies. Then that policy's rule stations are polled in order, each
   check a telemetry line that calls GO or NO-GO; the first station whose lines
   are all GO wins, and the last station, "Nothing else matched", always does.

   The main display across the top: the person's launch pad at the left, the
   application's orbit at the right, and the flight arc between them, flown as
   the poll goes on (blue while flown; green in orbit for an allow; stopped
   short in red for a deny; held, dashed amber, on a fact not stated). Under its
   apex the mission clock runs, then the director's call lands, big.

   Every station is a button (recall: its call replays, its telemetry opens);
   the arc shows the route; the mission log types each call with its
   mission-elapsed time; "Ask flight" answers from the plan and acts; the
   director's calls are spoken (once a run, muted from the dock).

   Everything is drawn from `s` (engine-run.ts, journey.ts, mission-model.ts);
   durations from `stepMs`. Geometry is measured by offsets, never by
   transformed boxes, and nothing motion moves has a CSS transform of its own.
   -------------------------------------------------------------------------- */

/* The sign-ins this page has already shown here: a remount on one of them says nothing again. */
const SEEN = new Set<string>()
/** About how long a line takes to say, at the voice's rate. */
const estMs = (line: string) => line.length * 64 + 250

interface Peek {
  id: string
  pin: boolean
  x: number
  y: number
  /** Where it sits above the piece instead, when there is no room under it (its bottom edge). */
  above: number
  flipped?: boolean
}

interface Ui {
  run: number
  answer: Answer | null
  crew: boolean
  peek: Peek | null
  /** How many times each station has been recalled: its lamp polls again on each. */
  recalls: Record<string, number>
  /** The recalls' lines in the mission log, in the order they were made. */
  recallLog: TickerLine[]
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

const TOKEN_FIELD: Partial<Record<TokenId, FormField>> = { from: 'address', device: 'device', when: 'when', risk: 'risk' }
const TOKEN_WORD: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'Time', risk: 'Risk' }
const TOKEN_KEYS: Partial<Record<TokenId, readonly FactKey[]>> = { from: ['network', 'place'], device: ['device'], when: ['time'], risk: ['risk'] }

/** An element's box in the world, by offsets (never a transformed rect). */
function boxIn(el: HTMLElement, world: HTMLElement): { x: number; y: number; w: number; h: number } | null {
  let x = 0
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== world) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  if (n !== world) return null
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

export default function MissionLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows, asGroup, screens, onPressPerson, onOpenRule, onOpenPolicy, onAsGroup, onAdd } = props
  const { users, groups, apps, zones } = useBrand()
  const stage = useRef<StageView | null>(null)
  const [theme] = useStageTheme()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)

  const at = plan.at
  const lastStep = plan.steps.length - 1
  const landed = s >= lastStep || (at.outcome >= 0 && s >= at.outcome)
  const step = plan.steps[s]
  const play = animate && !jumped && !reduced
  const dur = stepMs(plan, s)
  const tone = callTone(plan)

  // --- The room's width: the stage's, between its least and most ---
  const [stageW, setStageW] = useState(0)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const read = () => setStageW((w) => (Math.abs(w - el.clientWidth) < 4 ? w : el.clientWidth))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = worldWidth(stageW)

  // --- Who, to what ---
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ?? (person ? firstName(person.name) : firstName(personName))
  const groupLine = asGroup ? (person ? `Tested as ${person.name}` : '') : person ? groupNamesOf(person, groups).join(' · ') : ''
  const marks = useMemo(() => (landed ? factMarks(plan) : {}), [landed, plan])
  const facts = useMemo<PadFact[]>(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => {
        const v = tokenValue(t, form, ctx)
        const m = (TOKEN_KEYS[t] ?? []).map((k) => marks[k]).find(Boolean) ?? null
        return { key: TOKEN_FIELD[t] ?? t, label: TOKEN_WORD[t] ?? v.label, value: v.unset ? 'Not stated' : v.text, unset: v.unset, mark: m, needed: landed && v.unset && plan.outcome.status === 'depends' }
      })
  }, [rows, form, users, apps, zones, marks, landed, plan.outcome.status])

  // --- The stations at s ---
  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const alsoIds = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const clashIds = useMemo(() => new Set((plan.conflicts?.rules ?? []).map((r) => r.ruleId)), [plan.conflicts])
  const pStates = plan.policies.map((p) => policyStation(p, s, landed, alsoIds))
  const rStates = plan.rules.map((r) => ruleStation(r, s, landed, clashIds))
  const rulesOpen = decider !== undefined && policyOpen(decider, s)
  const ruleRows = Math.max(1, Math.min(5, ...plan.rules.filter((r) => r.visited).map((r) => r.checked)))
  const landing = landingOf(plan)

  // --- The call ---
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const call: CallView = useMemo(() => {
    const factors = factorsOf(screens, decided)
    if (decided === 'deny') return { word: 'SCRUB', sub: 'Access denied', tone: 'negative', factors: [], deny: denyMessageOf(screens), ifs: [] }
    if (decided) return { word: 'GO for sign-in', sub: DECISION_WORDS[decided], tone: 'positive', factors, deny: '', ifs: [] }
    if (o.status === 'depends') {
      const needs = o.view.needs.map((n) => n.toLowerCase())
      return { word: 'HOLD', sub: needs.length > 0 ? `Waiting on the ${needs.join(' and ')}` : 'Waiting on a fact', tone: 'notice', factors: [], deny: '', ifs: o.view.outcomes.slice(0, 4) }
    }
    return { word: 'No call', sub: 'No policy decides', tone: 'neutral', factors: [], deny: '', ifs: [] }
  }, [screens, decided, o.status, o.view])
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1} · ${landing.name}`) : ''
  const openDecider = o.policyId
    ? () => {
        if (decided && landing && landing.index !== null) onOpenRule(o.policyId as string, landing.id)
        else onOpenPolicy(o.policyId as string)
      }
    : null
  const finding = heroFinding(plan)
  /* Tall enough for the call (a hold's answers, a finding) and for the launch pad's facts (a long value takes two lines). */
  const padH = 96 + facts.reduce((h, f) => h + (f.value.length > 24 ? 36 : 20), 0) + 14
  const dispH = Math.max(padH, DISPLAY_H + (call.ifs.length > 1 ? (call.ifs.length - 1) * 20 : 0) + (finding ? 30 : 0))

  // --- The flight and the clock ---
  const flightTo = flightAt(plan, s, landed)
  const clockFrom = elapsedAt(plan, s)

  // --- The camera ---
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    if (running && animate && !landed) {
      fittedFor.current = null
      v.fit({ min: 1, max: 1, jump: true })
    } else {
      fittedFor.current = runKey
      v.fit({ max: 1, jump: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  // --- Per-run UI: an answer, the crew view, the inspector, the recalls ---
  const fresh = (): Ui => ({ run: runKey, answer: null, crew: false, peek: null, recalls: {}, recallLog: [] })
  const [ui, setUi] = useState<Ui>(fresh)
  const now: Ui = ui.run === runKey ? ui : fresh()
  if (ui.run !== runKey) setUi(now)
  const lit = useMemo(() => new Set(now.answer?.lit ?? []), [now.answer])

  // --- The voice ---
  const [voiceOn, setVoiceOn] = useState(readVoiceOn)
  const voiceOnRef = useRef(voiceOn)
  voiceOnRef.current = voiceOn
  const voice = useRef<Voice | null>(null)
  if (voice.current === null) voice.current = createVoice()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const v = voice.current
      window.setTimeout(() => {
        if (!mounted.current) v?.cancel()
      }, 0)
    }
  }, [])
  const speak = useCallback((line: string, cut = false) => {
    if (!line || !voiceOnRef.current) return
    if (cut) voice.current?.cancel()
    voice.current?.say(line)
  }, [])
  const toggleVoice = () => {
    const next = !voiceOn
    setVoiceOn(next)
    writeVoiceOn(next)
    if (!next) voice.current?.cancel()
  }

  const askCtx = useMemo<AskContext>(
    () => ({
      plan,
      person: personName,
      first,
      isGroup: asGroup !== null,
      screens,
      groups: plan.asEachGroup?.groups ?? plan.conflicts?.groups ?? [],
      groupRows: eachGroupRows(plan),
      canGroup: typeof onAsGroup === 'function' && asGroup === null,
      facts: facts.map((f) => ({ field: f.key as FormField, label: f.label, value: f.value, unset: f.unset })),
    }),
    [plan, personName, first, asGroup, screens, onAsGroup, facts],
  )

  /* The director's calls, once a run: the poll opening, the station that is GO, the rules, the call. A revisit and Skip say nothing more. */
  const seenKey = `${runKey}:${form.personId ?? ''}:${form.appId ?? ''}:${asGroup ?? ''}`
  const said = useRef<{ run: number; beats: Set<string> } | null>(null)
  if (said.current === null) {
    const isFresh = running || (reduced && !jumped && !plan.empty && !SEEN.has(seenKey))
    said.current = isFresh ? { run: -1, beats: new Set() } : { run: runKey, beats: new Set(['start', 'lock', 'rules', 'verdict', 'all']) }
  }
  useEffect(() => {
    if (!plan.empty) SEEN.add(seenKey)
  }, [seenKey, plan.empty])
  useEffect(() => {
    if (!said.current) return
    if (said.current.run !== runKey) {
      voice.current?.cancel()
      said.current = { run: runKey, beats: new Set() }
    }
    const beats = said.current.beats
    if (plan.empty) return
    const once = (k: string, line: string | null) => {
      if (beats.has(k)) return
      beats.add(k)
      if (line) speak(line)
    }
    const all = ['start', 'lock', 'rules', 'verdict']
    if (jumped) {
      if (!beats.has('verdict')) {
        voice.current?.cancel()
        all.concat('all').forEach((k) => beats.add(k))
      }
      return
    }
    if (!running) {
      if (!beats.has('start') && !beats.has('all')) {
        all.forEach((k) => beats.add(k))
        once('all', lineAll(askCtx))
      }
      return
    }
    if (reduced || (landed && !beats.has('start'))) {
      all.forEach((k) => beats.add(k))
      once('all', lineAll(askCtx))
      return
    }
    once('start', lineStart(askCtx))
    if (at.decides >= 0 && s >= at.decides) once('lock', lineLock(askCtx))
    const rulesAt = landing ? Math.max(landing.endAt, at.expand) : -1
    if (rulesAt >= 0 && s >= rulesAt && s < at.outcome && !beats.has('rules')) {
      beats.add('rules')
      const full = lineRules(askCtx)
      const short = lineRulesShort(askCtx)
      let left = 0
      for (let i = s; i < at.outcome; i++) left += stepMs(plan, i)
      const busy = voice.current?.speaking() === true
      if (!busy && full && estMs(full) <= left + 900) speak(full)
      else if (!busy && short && estMs(short) <= left + 900) speak(short)
      else beats.add('rules-folded')
    }
    if (at.outcome >= 0 && s >= at.outcome) {
      if (!beats.has('rules')) beats.add('rules-folded')
      beats.add('rules')
      const fold = lineRulesShort(askCtx) ?? lineLanding(askCtx)
      once('verdict', beats.has('rules-folded') ? `${fold} ${lineVerdict(askCtx)}`.trim() : lineVerdict(askCtx))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock and the run move the calls
  }, [s, runKey, running, jumped])

  // --- Asking flight ---
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const chips = useMemo(() => (landed ? chipsOf(askCtx) : []), [landed, askCtx])
  const act = useCallback(
    (a: Answer) => {
      const x = a.act
      if (!x) return
      if (x.kind === 'see') setUi((u) => ({ ...u, crew: true }))
      else if (x.kind === 'group') window.setTimeout(() => onAsGroup?.(x.groupId), 450)
      else if (x.kind === 'set') window.setTimeout(() => onAdd(x.field), 350)
      else if (x.kind === 'open') window.setTimeout(() => (x.ruleId ? onOpenRule(x.policyId, x.ruleId) : onOpenPolicy(x.policyId)), 350)
    },
    [onAsGroup, onAdd, onOpenRule, onOpenPolicy],
  )
  const show = useCallback(
    (a: Answer, queued = false) => {
      setUi((u) => {
        const base = u.run === runKey ? u : fresh()
        return { ...base, answer: a, peek: null, crew: a.act?.kind === 'see' ? base.crew : false }
      })
      speak(a.say, !queued)
      act(a)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh() reads runKey
    [runKey, speak, act],
  )
  const ask = useCallback((intent: Intent, queued = false) => show(answerOf(intent, askCtx), queued), [show, askCtx])
  const waitingAsk = useRef<{ run: number; intent: Intent; text: string } | null>(null)
  const [waitingFor, setWaitingFor] = useState<string | null>(null)
  const submit = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    const intent = matchIntent(t, askCtx)
    setText('')
    if (!landed) {
      waitingAsk.current = { run: runKey, intent, text: t }
      setWaitingFor(t)
      return
    }
    ask(intent)
  }
  useEffect(() => {
    if (!landed || !waitingAsk.current) return
    const id = window.setTimeout(() => {
      const w = waitingAsk.current
      waitingAsk.current = null
      setWaitingFor(null)
      if (w && w.run === runKey) ask(w.intent, true)
    }, reduced || jumped ? 0 : 600)
    return () => window.clearTimeout(id)
  }, [landed, runKey, ask, reduced, jumped])

  // --- The mission log: the calls made so far, then the recalls ---
  const callWords = useMemo(() => ({ call: call.word, sub: call.sub }), [call.word, call.sub])
  const baseLog = useMemo(() => logLines(plan, first, callWords), [plan, first, callWords])
  const ticker = useMemo<TickerLine[]>(() => {
    const shown = baseLog.filter((l) => landed || l.at <= s).map((l) => ({ key: l.key, t: met(elapsedAt(plan, l.at)), text: l.text, tone: l.tone }))
    return [...shown, ...now.recallLog]
  }, [baseLog, landed, s, plan, now.recallLog])

  // --- The inspector, the recall ---
  const onPeek = useCallback((id: string, el: HTMLElement | null, pin: boolean) => {
    const world = worldRef.current
    if (!world || !el) return
    const b = boxIn(el, world)
    if (!b) return
    const PW = 300
    const x = Math.max(0, Math.min(world.offsetWidth - PW, b.x + b.w / 2 - PW / 2))
    const y = b.y + b.h + 8
    setUi((u) => {
      if (pin && u.peek?.id === id && u.peek.pin) return { ...u, peek: null }
      if (!pin && u.peek?.pin) return u
      return { ...u, peek: { id, pin, x, y, above: b.y - 8 } }
    })
  }, [])
  const onUnpeek = useCallback((id: string) => setUi((u) => (u.peek && u.peek.id === id && !u.peek.pin ? { ...u, peek: null } : u)), [])
  const onRecall = useCallback(
    (id: string) => {
      const line = baseLog.find((l) => l.node === id)
      setUi((u) => {
        const base = u.run === runKey ? u : fresh()
        const n = (base.recalls[id] ?? 0) + 1
        const recallLog = line && (landed || line.at <= s) ? [...base.recallLog, { key: `recall:${id}:${n}`, t: met(elapsedAt(plan, line.at)), text: `Recall · ${line.text}`, tone: line.tone, recall: true }].slice(-6) : base.recallLog
        return { ...base, recalls: { ...base.recalls, [id]: n }, recallLog }
      })
      if (line && (landed || line.at <= s)) speak(line.text.replace(/\s*·\s*/g, ', ').replace(/NO-GO/g, 'no-go'), true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh() reads runKey
    [baseLog, runKey, landed, s, plan, speak],
  )
  useEffect(() => {
    if (!now.peek?.pin) return
    const onKeyDoc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if ((e.target as Element | null)?.closest('.rl-mission__ask')) return
      setUi((u) => ({ ...u, peek: null }))
    }
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('.rl-mission__peek, [data-mx]')) return
      setUi((u) => ({ ...u, peek: null }))
    }
    document.addEventListener('keydown', onKeyDoc)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKeyDoc)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [now.peek?.pin])

  /* The route, pressed on the arc: the way the flight went, lit end to end. */
  const via = deciderVia(plan)
  const routeAnswer = useCallback((): Answer => {
    const lines: Answer['lines'] = [{ text: personName, sub: groupLine || undefined }]
    if (decider) lines.push({ text: `Policy ${decider.order} · ${decider.name}`, sub: decider.isGlobalDefault ? 'GO · no policy above it is GO' : `GO${via?.say ? ` · ${via.say}` : ''} · the first that covers ${first}`, tone: 'positive' })
    if (landing) lines.push({ text: landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1} · ${landing.name}`, sub: landing.index === null ? 'no rule above it matched' : landing.state === 'match' ? 'every line GO · the first all-GO wins' : "can't tell", tone: landing.state === 'match' ? (landing.decision === 'deny' ? 'negative' : 'positive') : 'notice' })
    lines.push({ text: `${call.word}${call.sub ? ` · ${call.sub}` : ''}`, tone: call.tone })
    return {
      key: 'route',
      title: `The route · ${plan.appName}`,
      tone: call.tone,
      lines,
      lit: ['sign-in', ...(decider ? [decider.node] : []), ...(landing ? [landing.node] : []), 'outcome', 'route'],
      say: `${lineLock(askCtx) ?? ''} ${lineRulesShort(askCtx) ?? ''} ${lineVerdict(askCtx)}`.trim(),
    }
  }, [personName, groupLine, decider, via, first, landing, call, plan.appName, askCtx])
  const onRoute = () => {
    if (!landed) return
    if (now.answer?.key === 'route') setUi((u) => ({ ...u, answer: null }))
    else show(routeAnswer())
  }
  const onFact = (key: string, el: HTMLElement) => {
    const f = facts.find((x) => x.key === key)
    if (f?.needed) onAdd(key as FormField)
    else onPeek(`fact:${key}`, el, true)
  }

  // --- The floor (log, Ask flight, an answer): the world fits above it ---
  const deckRef = useRef<HTMLDivElement | null>(null)
  const [deckH, setDeckH] = useState(0)
  useLayoutEffect(() => {
    const el = deckRef.current
    if (!el) return
    const read = () => setDeckH((h) => (Math.abs(h - el.offsetHeight) < 2 ? h : el.offsetHeight))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /* 62: the floor's distance from the bottom (mission.css); 10 clear above it. */
  const padBottom = Math.max(140, deckH + 62 + 10)
  const framed = useRef({ padBottom, W })
  useEffect(() => {
    const f = framed.current
    if (f.padBottom === padBottom && f.W === W) return
    framed.current = { padBottom, W }
    if (!landed) return
    const id = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: reduced }))
    return () => window.cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the floor or the width change after landing
  }, [padBottom, W])

  /* While the poll runs: the camera keeps the station being polled in view. */
  useEffect(() => {
    if (!running || landed) return
    const k = step?.kind
    const world = worldRef.current
    if (!world) return
    const sel = k === 'deciding' || k === 'outcome' ? '[data-mx="outcome"], .rl-mission__display' : k === 'rule' || k === 'check' || k === 'checked' || k === 'rule-end' || k === 'compact' ? '.rl-mission__rstations' : '.rl-mission__stations'
    stage.current?.follow(world.querySelector(sel), { lazy: true, jump: reduced })
  }, [s, running, landed, step, reduced])


  /* The hand-off: a line from the station that called GO down to its rule stations, and from the winning rule station to the call. Measured by offsets. */
  const [wires, setWires] = useState<{ down: string; h: number; x: number } | null>(null)
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!world || !decider || !rulesOpen) {
      setWires((w) => (w === null ? w : null))
      return
    }
    const st = world.querySelector<HTMLElement>(`[data-mx="${decider.node}"]`)
    const zone = world.querySelector<HTMLElement>('.rl-mission__rstations')
    if (!st || !zone) return
    const a = boxIn(st, world)
    const z = boxIn(zone, world)
    if (!a || !z) return
    const x0 = Math.round(a.x + 10)
    const y0 = Math.round(a.y + a.h)
    const y1 = Math.round(z.y - 6)
    const d = `M ${x0} ${y0} V ${y1}`
    setWires((w) => (w && w.down === d && w.h === world.offsetHeight && w.x === x0 ? w : { down: d, h: world.offsetHeight, x: x0 }))
  }, [s, W, rulesOpen, decider, dispH, landed])

  const peekCtx: PeekContext ={ plan, s, landed, first, person: personName, groupLine, facts, pStates, rStates }
  const findingAsk: Intent | null = finding ? (o.status === 'depends' ? { kind: 'depends' } : plan.conflicts?.rules.some((r) => r.kind === 'conflict') ? { kind: 'why-rule', rule: plan.conflicts.conflicts[0]?.number ?? null } : { kind: 'others' }) : null
  const answerShown = now.answer !== null && !(now.answer.act?.kind === 'see' && now.crew)

  /* An answer floats over the floor's corner on the side away from what it is about, so the lit stations stay in view (it never re-frames the room). */
  const [answerSide, setAnswerSide] = useState<'left' | 'right'>('right')
  const answerKey = now.answer?.key ?? null
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!world || !now.answer) return
    const xs: number[] = []
    for (const id of now.answer.lit) {
      const el = world.querySelector<HTMLElement>(`[data-mx="${id}"]`)
      const b = el ? boxIn(el, world) : null
      if (b && b.y > dispH) xs.push(b.x + b.w / 2)
    }
    const side = xs.length > 0 && xs.every((x) => x >= W / 2) ? 'left' : 'right'
    setAnswerSide((v) => (v === side ? v : side))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer
  }, [answerKey, W, dispH])
  const routeLit = lit.has('route')
  const showCrew = landed && now.crew && screens.length > 0 && !!form.appId

  const dock = (
    <>
    <StageThemeToggle />
    <Tip text={voiceOn ? 'Mute the director' : 'Hear the director'} placement="top">
      <button type="button" className={`bb__act rl-mission__voicebtn${voiceOn ? ' is-on' : ''}`} aria-label="Voice" aria-pressed={voiceOn} onClick={toggleVoice}>
        {voiceOn ? <Volume2 size={15} strokeWidth={2} aria-hidden /> : <VolumeX size={15} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
    </>
  )

  /* A peek under the room's last row would run under the floor: it opens above the piece instead. */
  const peekRef = useRef<HTMLDivElement | null>(null)
  const peekSig = now.peek ? `${now.peek.id}:${now.peek.y}:${now.peek.flipped ? 1 : 0}` : ''
  useLayoutEffect(() => {
    const el = peekRef.current
    const world = worldRef.current
    const pk = now.peek
    if (!el || !world || !pk || pk.flipped) return
    const h = el.offsetHeight
    if (pk.y + h > world.offsetHeight - 4 && pk.above - h >= 0) setUi((u) => (u.peek && u.peek.id === pk.id ? { ...u, peek: { ...u.peek, y: pk.above - h, flipped: true } } : u))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when a peek opens or moves
  }, [peekSig])

  let peekNode: ReactNode = null
  if (now.peek) {
    const lines = peekLines(now.peek.id, peekCtx)
    if (lines.length > 0) {
      peekNode = (
        <motion.div ref={peekRef} className="rl-mission__peek" role="note" data-card style={{ left: now.peek.x, top: now.peek.y, width: 300 }} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.14 }}>
          <PeekLines lines={lines} />
          {now.peek.pin && (
            <button
              type="button"
              className="rl-mission__x rl-mission__peekx"
              aria-label="Close"
              onClick={() => {
                const id = now.peek?.id
                setUi((u) => ({ ...u, peek: null }))
                const back = id ? worldRef.current?.querySelector<HTMLElement>(`[data-mx="${id}"]`) : null
                ;(back?.matches('button') ? back : back?.querySelector<HTMLElement>('button'))?.focus()
              }}
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </motion.div>
      )
    }
  }

  return (
    <div ref={rootRef} data-stage={theme} className={`rl-mission-root${landed ? ` is-landed is-tone-${tone}` : ' is-running'}`}>
      <motion.div className="rl-mission__stage" aria-hidden initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.3 : 0 }} />
      <RunStage ref={stage} reduced={reduced} className="rl-mission" dock={dock} pad={{ top: 64, left: 48, right: 48, bottom: padBottom }} label={`Launch poll: ${plan.appName}`}>
        <div key={runKey} ref={worldRef} className="rl-mission__world" style={{ width: W } as CSSProperties}>
          <MainDisplay
            width={W}
            height={dispH}
            play={play}
            running={running}
            landed={landed}
            tone={tone}
            clock={{ from: clockFrom, to: clockFrom + dur, stepKey: s }}
            flight={{ to: flightTo, ms: landed ? Math.max(900, stepMs(plan, Math.max(0, at.outcome))) : dur }}
            person={{ name: personName, groups: groupLine, initials: initialsOf(asGroup ?? personName), working: false, lit: lit.has('sign-in') }}
            app={{ id: app?.id ?? null, name: plan.appName, lit: routeLit }}
            facts={facts}
            call={call}
            by={o.policyName ? { kick: decided ? 'Decided by' : 'Applies', policy: o.policyName, rule: decided ? where : '', open: openDecider } : null}
            finding={finding ? { text: finding.text, tone: finding.tone === 'info' ? 'info' : 'notice', onPress: () => findingAsk && ask(findingAsk) } : null}
            extra={null}
            crew={screens.length > 0 && form.appId ? { open: now.crew, toggle: () => setUi((u) => ({ ...u, crew: !u.crew, answer: u.crew ? u.answer : null, peek: null })) } : null}
            routeLit={routeLit}
            callLit={lit.has('outcome')}
            onPressPerson={onPressPerson}
            onFact={onFact}
            onRoute={onRoute}
            empty={plan.empty}
          />

          <p className="rl-mission__rowtag">
            Policies on {plan.appName}
            <span className="rl-mission__rowhint">polled in order · the first GO takes the flight</span>
          </p>
          <div className="rl-mission__stations" data-node="which">
            {plan.policies.map((p, i) => (
              <PolicyStation
                key={p.policyId}
                p={p}
                st={pStates[i]}
                plan={plan}
                first={first}
                play={play}
                lit={lit.has(p.node)}
                conflict={landed && conflictIds.has(p.policyId)}
                recall={now.recalls[p.node] ?? 0}
                i={i}
                onPeek={onPeek}
                onUnpeek={onUnpeek}
                onRecall={onRecall}
              />
            ))}
          </div>

          {decider && (
            <div className="rl-mission__rulezone" style={{ minHeight: 24 + 52 + ruleRows * 40 }}>
              {rulesOpen ? (
                <>
                  <p className="rl-mission__rowtag is-rules" style={{ paddingLeft: wires && wires.x < W - 640 ? wires.x + 12 : 0 }}>
                    Rules in {decider.name}
                    <span className="rl-mission__rowhint">polled in order · the first all-GO wins</span>
                  </p>
                  <div className="rl-mission__rstations">
                    {plan.rules.map((r, i) => (
                      <RuleStation
                        key={r.id}
                        r={r}
                        st={rStates[i]}
                        s={s}
                        play={play}
                        landed={landed}
                        lit={lit.has(r.node)}
                        recall={now.recalls[r.node] ?? 0}
                        i={i}
                        rows={ruleRows}
                        onPeek={onPeek}
                        onUnpeek={onUnpeek}
                        onRecall={onRecall}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="rl-mission__rowtag is-dim">
                  Rule stations
                  <span className="rl-mission__rowhint">standing by for the policy that is GO</span>
                </p>
              )}
            </div>
          )}

          {wires && (
            <svg className={`rl-mission__wires ${landed ? `is-${tone}` : 'is-working'}`} width={W} height={wires.h} aria-hidden>
              <motion.path
                d={wires.down}
                initial={play ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: play ? Math.max(0.2, stepMs(plan, Math.max(0, at.expand)) / 1000 / 1.6) : 0, ease: [0.2, 0, 0, 1] }}
              />
            </svg>
          )}

          {peekNode}
        </div>
      </RunStage>

      {/* The floor: an answer, the mission log, Ask flight. */}
      <div ref={deckRef} className="rl-mission__deck">
        {answerShown && now.answer && (
          <div className={`rl-mission__answerdock is-${answerSide}`}>
          <AnswerCard
            key={now.answer.key}
            a={now.answer}
            play={!reduced}
            onClose={() => {
              setUi((u) => ({ ...u, answer: null }))
              inputRef.current?.focus()
            }}
          />
          </div>
        )}
        {showCrew && (
          <div className="rl-mission__answerdock is-right is-crew">
          <motion.div
            className="rl-mission__crew"
            data-card
            initial={reduced ? false : { opacity: 0, clipPath: 'inset(100% 0% 0% 0%)' }}
            animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
            transition={{ duration: reduced ? 0 : 0.3, ease: [0.2, 0, 0, 1] }}
          >
            <div className="rl-mission__crewhead">
              <span className="rl-mission__kicker">Crew view · what {asGroup ? 'they see' : `${first} sees`}</span>
              <button type="button" className="rl-mission__x" aria-label="Close the crew view" onClick={() => setUi((u) => ({ ...u, crew: false }))}>
                <X size={13} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
            <div className="rl-mission__crewinset">
              <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} title="" />
            </div>
          </motion.div>
          </div>
        )}

        {!plan.empty && (
          <MissionLog
            lines={ticker}
            play={!reduced && !jumped}
            onPick={(key) => {
              const l = baseLog.find((x) => x.key === key) ?? baseLog.find((x) => key.startsWith(`recall:${x.node}:`))
              const el = l?.node ? worldRef.current?.querySelector<HTMLElement>(`[data-mx="${l.node}"]`) : null
              if (l?.node && el) onPeek(l.node, el, true)
            }}
          />
        )}
        <AskBar
          chips={chips}
          onChip={(c: Chip) => ask(c.intent)}
          activeKey={now.answer?.key ?? null}
          chipKey={(c: Chip) => answerOf(c.intent, askCtx).key}
          text={text}
          setText={setText}
          onSubmit={submit}
          onEscape={() => now.answer && setUi((u) => ({ ...u, answer: null }))}
          waiting={waitingFor}
          disabled={plan.empty}
          play={!reduced}
          inputRef={inputRef}
        />
      </div>
    </div>
  )
}
