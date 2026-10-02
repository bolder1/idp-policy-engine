import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { useBrand } from '../../../store'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { eachGroupRows, expectMark, heroFinding } from '../journey'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { JARVIS_DISSOLVE_MS, JARVIS_EXIT_EVENT, jarvisEntering } from '../jarvis-mode/jarvis-timing'
import { Deck } from './jarvis2-deck'
import { geometry, lockAngle, polar, segments, wedgeBox, type Geo } from './jarvis2-geometry'
import {
  answerOf,
  chipsOf,
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
} from './jarvis-intents'
import { TOKEN_CATS, decisionWords, focusRuleOf, jarvisModel, type FactIn, type JvModel, type Ring, type RingSeg, type Tone } from './jarvis2-model'
import { CoreView, Decor, Ground, Readouts } from './jarvis2-reactor'
import { RunRing, Satellite } from './jarvis2-rings'
import { DecisionWedge, RulesWedge, type DecisionView } from './jarvis2-verdict'
import { canListen, createVoice, listenOnce, readVoiceOn, writeVoiceOn, type Voice } from './jarvis-voice'
import { PoliciesWedge, WhoWedge } from './jarvis2-wedges'
import { RunStage, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './jarvis2.css'

/* -----------------------------------------------------------------------------
   The run as JARVIS v3 — the REACTOR (run-layout.ts `jarvis`), dark only.

   The reactor at the centre IS the run: its outer ring the policies on the
   application, its middle ring the deciding policy's rules, its inner ring
   the checks of the rule in focus, its core the verdict. Each ring turns
   like a combination lock so the segment that decides comes to rest under
   the pointer at 12 o'clock (jarvis-model.ts). Four wedge panels dock onto
   the ring at the diagonals (ref 4): WHO and its CONDITIONS, DECISION,
   POLICIES, RULE TRACE — the readable copy; a row and its segment light
   together and a dot-connector leader joins them. The compass on top
   carries the run's four stages under the page's engine pill; the COMMAND
   DECK at the foot carries the narrator, the assistant's keys, the ask line
   and the dock.

   Laid out at zoom 1 from the canvas size (jarvis-geometry.ts). Paced by the
   run's clock (`s`, `stepMs`); Skip lands it at once; reduced motion draws
   the settled frame. Motion moves transforms and opacity (each ring on its
   own layer) and SVG dash offsets; colour sits on classes.
   -------------------------------------------------------------------------- */

/* The sign-ins this page has already shown here: a remount on one of them (a revisit, the canvas switched back) says nothing again. */
const SEEN = new Set<string>()
/** About how long a line takes to say, at the voice's rate. */
const estMs = (line: string) => line.length * 64 + 250
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

const noop = () => {}
const TOKEN_FIELD: Partial<Record<TokenId, FactIn['field']>> = { from: 'address', device: 'device', when: 'when', risk: 'risk' }
const TOKEN_WORD: Partial<Record<TokenId, string>> = { from: 'Network', device: 'Device', when: 'Time', risk: 'Risk' }

interface Ui {
  run: number
  answer: Answer | null
  see: boolean
  all: boolean
  allPol: boolean
  allRules: boolean
}
const freshUi = (run: number): Ui => ({ run, answer: null, see: false, all: false, allPol: false, allRules: false })

interface Leader {
  x0: number
  y0: number
  x1: number
  y1: number
  tone: Tone
}

/** Where a HUD id sits on the rings, at rest: its radius and angle, and its tone. */
function segAt(g: Geo, m: JvModel, jv: string): { r: number; a: number; tone: Tone } | null {
  const rings: [Ring, number, number][] = [
    [m.policies, g.R.pol, 3.2],
    [m.rules, g.R.rule, 3.2],
    [m.checks, g.R.chk, 8],
  ]
  for (const [ring, r, gap] of rings) {
    const i = ring.segs.findIndex((x) => x.jv === jv)
    if (i < 0 || !ring.shown) continue
    const seg = segments(ring.segs.length, gap)[i]
    if (!seg) continue
    return { r, a: seg.mid + lockAngle(ring.focus, ring.segs.length), tone: ring.segs[i].tone }
  }
  return null
}

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

export default function Jarvis2Layout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows, asGroup, screens, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onPressPerson } = props
  const { users, groups, apps, zones } = useBrand()
  const stage = useRef<StageView | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const lastStep = plan.steps.length - 1
  const last = s >= lastStep
  const at = plan.at
  const landed = last || (at.outcome >= 0 && s >= at.outcome)
  /* Motion for this frame: a run playing, never after Skip or under reduced motion. */
  const play = animate && !jumped && !reduced
  const dur = stepMs(plan, s)

  // --- The way in and out (jarvis-mode/): the HUD boots as the overlay dissolves, and stands down into it ---
  const [bootIn] = useState<number | null>(() => {
    const t = reduced ? null : jarvisEntering()
    return t === null ? null : Math.max(0, JARVIS_DISSOLVE_MS - 60 - t)
  })
  const [booting, setBooting] = useState(bootIn !== null)
  useEffect(() => {
    if (bootIn === null) return
    const id = window.setTimeout(() => setBooting(false), bootIn + 900)
    return () => window.clearTimeout(id)
  }, [bootIn])
  useEffect(() => {
    const on = () => {
      if (rootRef.current) rootRef.current.dataset.jvMode = 'down'
    }
    window.addEventListener(JARVIS_EXIT_EVENT, on)
    return () => window.removeEventListener(JARVIS_EXIT_EVENT, on)
  }, [])

  // --- The canvas's size: the HUD is laid out for it, at zoom 1 ---
  const [size, setSize] = useState({ w: 1376, h: 800 })
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const read = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setSize((z) => (Math.abs(z.w - w) < 1 && Math.abs(z.h - h) < 1 ? z : { w, h }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- Who, to what, on what ---
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const personName = asGroup ? `A member of ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const first = asGroup ?? (person ? firstName(person.name) : firstName(personName))
  const groupNames = useMemo(() => (asGroup ? [asGroup] : person ? groupNamesOf(person, groups) : []), [asGroup, person, groups])
  const facts = useMemo<FactIn[]>(() => {
    const ctx: SentenceContext = { people: users, apps, zones, rows }
    return sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => {
        const v = tokenValue(t, form, ctx)
        return { token: t, field: TOKEN_FIELD[t] ?? 'person', label: TOKEN_WORD[t] ?? v.label, value: v.unset ? 'Not stated' : v.text, unset: v.unset }
      })
  }, [rows, form, users, apps, zones])

  // --- Per-run UI: an answer, What they see, every check, the long lists unfolded ---
  const [ui, setUi] = useState<Ui>(() => freshUi(runKey))
  const now: Ui = ui.run === runKey ? ui : freshUi(runKey)
  if (ui.run !== runKey) setUi(now)

  // --- The model at s ---
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const factors = useMemo(() => factorsOf(screens, decided), [screens, decided])
  const m = useMemo(() => jarvisModel(plan, s, { first, groups: groupNames, facts, factors, all: now.all }), [plan, s, first, groupNames, facts, factors, now.all])

  /* The wedges split their columns by what each holds: estimated first, then measured (WHO as drawn,
     DECISION from a hidden copy of it landed), so the split never moves while the run plays. */
  const [need, setNeed] = useState<{ key: string; who: number; decision: number } | null>(null)
  const needKey = `${size.w}x${size.h}:${plan.summary}:${plan.outcome.view.line}:${facts.map((f) => f.value).join('|')}:${screens.length}:${props.changed ?? ''}`
  const g = useMemo(() => {
    if (need && need.key === needKey) return geometry(size.w, size.h, { who: need.who, decision: need.decision })
    const base = geometry(size.w, size.h)
    const tight = facts.length > 2
    const condH = tight ? 40 : 48
    const who = 26 + 22 + 9 + (base.compact || tight ? 66 : 80) + 9 + 30 + 9 + 25 + 6 + Math.max(1, facts.length) * condH
    /* DECISION, as it lands: the head, the big word, its factors or what failed, Decided by, the note. */
    const deny = o.status === 'decided' && o.decision === 'deny'
    const decision =
      26 + 22 + 9 + 40 + 10 + (deny ? 52 : o.status === 'decided' ? 28 : 0) + 10 + 38 + (heroFinding(plan) && o.status !== 'depends' ? 10 + 46 : 0) + (o.status === 'depends' ? 10 + Math.min(4, o.view.outcomes.length) * 24 : 0) + (deny && denyMessageOf(screens) ? 26 : 0)
    return geometry(size.w, size.h, { who, decision })
  }, [size.w, size.h, facts.length, plan, o.status, o.decision, o.view.outcomes.length, screens, need, needKey])
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!world) return
    const foot = (el: Element | null) => {
      const kids = el ? Array.from(el.children) : []
      const lastKid = kids[kids.length - 1] as HTMLElement | undefined
      return lastKid ? lastKid.offsetTop + lastKid.offsetHeight : 0
    }
    const who = foot(world.querySelector('.jv2-w.is-who .jv2-conds') ? world.querySelector('.jv2-w.is-who') : null)
    const dec = world.querySelector<HTMLElement>('[data-measure="decision"]')?.offsetHeight ?? 0
    if (!who || !dec || need?.key === needKey) return
    const next = { key: needKey, who: who + 26 + 2, decision: dec + 26 }
    setNeed((n) => (n && n.key === next.key && Math.abs(n.who - next.who) < 3 && Math.abs(n.decision - next.decision) < 3 ? n : next))
  }, [needKey, need])

  // --- The camera: the world is the canvas, so fitting it is zoom 1; the dock's zoom still works ---
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    stage.current?.fit({ max: 1, jump: true })
  }, [g.W, g.H, runKey])

  // --- The voice ---
  const [voiceOn, setVoiceOn] = useState(readVoiceOn)
  const voiceOnRef = useRef(voiceOn)
  voiceOnRef.current = voiceOn
  const [said, setSaid] = useState<{ run: number; lines: { text: string; n: number }[] }>({ run: runKey, lines: [] })
  const [speaking, setSpeaking] = useState(false)
  const lineN = useRef(0)
  const runRef = useRef(runKey)
  runRef.current = runKey
  const pushLine = useCallback((text: string) => {
    const run = runRef.current
    setSaid((x) => ({ run, lines: [...(x.run === run ? x.lines : []), { text, n: ++lineN.current }].slice(-4) }))
  }, [])
  const voice = useRef<Voice | null>(null)
  if (voice.current === null) {
    voice.current = createVoice({
      onLine: (line) => {
        pushLine(line)
        setSpeaking(true)
      },
      onIdle: () => setSpeaking(false),
    })
  }
  /* Unmounted: silence. (A remount in the same tick — React's strict mode — keeps the voice.) */
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
  const speak = useCallback(
    (line: string, now = false) => {
      if (!line) return
      if (!voiceOnRef.current) {
        pushLine(line)
        return
      }
      if (now) voice.current?.cancel()
      voice.current?.say(line)
    },
    [pushLine],
  )
  const toggleVoice = () => {
    const next = !voiceOn
    setVoiceOn(next)
    writeVoiceOn(next)
    if (!next) {
      voice.current?.cancel()
      setSpeaking(false)
    }
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
      facts: facts.map((f) => ({ field: f.field, label: f.label, value: f.value, unset: f.unset })),
    }),
    [plan, personName, first, asGroup, screens, onAsGroup, facts],
  )

  /* The beats, once a run: the start, the lock, the rules, the verdict — or, a run that landed without
     playing, the answer alone. A revisit (mounted on a settled run) and Skip say nothing more; a sign-in
     never shown here that landed at once under reduced motion says its one line. */
  const seenKey = `${runKey}:${form.personId ?? ''}:${form.appId ?? ''}:${asGroup ?? ''}`
  const beatsRef = useRef<{ run: number; beats: Set<string> } | null>(null)
  if (beatsRef.current === null) {
    const fresh = running || (reduced && !jumped && !plan.empty && !SEEN.has(seenKey))
    beatsRef.current = fresh ? { run: -1, beats: new Set() } : { run: runKey, beats: new Set(['start', 'lock', 'rules', 'verdict', 'all']) }
  }
  useEffect(() => {
    if (!plan.empty) SEEN.add(seenKey)
  }, [seenKey, plan.empty])
  useEffect(() => {
    if (!beatsRef.current) return
    if (beatsRef.current.run !== runKey) {
      voice.current?.cancel()
      setSpeaking(false)
      setSaid({ run: runKey, lines: [] })
      beatsRef.current = { run: runKey, beats: new Set() }
    }
    const beats = beatsRef.current.beats
    if (plan.empty) return
    const once = (k: string, line: string | null) => {
      if (beats.has(k)) return
      beats.add(k)
      if (line) speak(line)
    }
    if (jumped) {
      /* Skip: nothing more is said; the subtitle shows the verdict, silently. */
      if (!beats.has('verdict')) {
        voice.current?.cancel()
        setSpeaking(false)
        ;['start', 'lock', 'rules', 'verdict', 'all'].forEach((k) => beats.add(k))
        pushLine(lineVerdict(askCtx))
      }
      return
    }
    if (!running && !beats.has('start') && !beats.has('all')) {
      ;['start', 'lock', 'rules', 'verdict'].forEach((k) => beats.add(k))
      once('all', lineAll(askCtx))
      return
    }
    if (!running) return
    if (reduced || (last && !beats.has('start'))) {
      ;['start', 'lock', 'rules', 'verdict'].forEach((k) => beats.add(k))
      once('all', lineAll(askCtx))
      return
    }
    once('start', lineStart(askCtx))
    if (at.decides >= 0 && s >= at.decides) once('lock', lineLock(askCtx))
    /* The rules' line as the rule that decides settles — whole if it fits before the verdict and the voice
       is free, else in short, else folded into the verdict — so the voice never runs far behind the run. */
    const landing = landingOf(plan)
    const rulesAt = landing ? Math.max(landing.endAt, at.expand) : -1
    if (rulesAt >= 0 && s >= rulesAt && s < at.outcome && !beats.has('rules')) {
      beats.add('rules')
      const full = lineRules(askCtx)
      const short = lineRulesShort(askCtx)
      let left = 0
      for (let i = s; i < at.outcome; i++) left += stepMs(plan, i)
      const busy = voice.current?.speaking() === true
      if (!voiceOnRef.current) speak(full ?? '')
      else if (!busy && full && estMs(full) <= left + 900) speak(full)
      else if (!busy && short && estMs(short) <= left + 900) speak(short)
      else beats.add('rules-folded')
    }
    if (at.outcome >= 0 && s >= at.outcome) {
      if (!beats.has('rules')) beats.add('rules-folded')
      beats.add('rules')
      const full = lineRules(askCtx)
      const foldLine = full && full.length <= 96 ? full : (lineRulesShort(askCtx) ?? lineLanding(askCtx))
      once('verdict', beats.has('rules-folded') && voiceOnRef.current ? `${foldLine} ${lineVerdict(askCtx)}`.trim() : lineVerdict(askCtx))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock and the run move the beats
  }, [s, runKey, running, jumped])

  // --- Asking ---
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const stopListening = useRef<(() => void) | null>(null)
  const hasMic = useMemo(() => canListen(), [])
  const chips = useMemo(() => (landed ? chipsOf(askCtx) : []), [landed, askCtx])
  useEffect(() => () => stopListening.current?.(), [])
  const act = useCallback(
    (a: Answer) => {
      const x = a.act
      if (!x) return
      if (x.kind === 'see') setUi((u) => ({ ...u, see: true }))
      else if (x.kind === 'checks') setUi((u) => ({ ...u, all: true, allRules: true }))
      // "Run as Engineering only" says it runs: the only press here that starts one (owner, 2 Oct).
      else if (x.kind === 'group') window.setTimeout(() => onAsGroup?.(x.groupId), 450)
      else if (x.kind === 'set') window.setTimeout(() => onAdd(x.field), 350)
      else if (x.kind === 'open') window.setTimeout(() => (x.ruleId ? onOpenRule(x.policyId, x.ruleId) : onOpenPolicy(x.policyId)), 350)
    },
    [onAsGroup, onAdd, onOpenRule, onOpenPolicy],
  )
  const ask = useCallback(
    (intent: Intent, queued = false) => {
      const a = answerOf(intent, askCtx)
      setUi((u) => {
        const base = u.run === runKey ? u : freshUi(runKey)
        return { ...base, answer: a, see: a.act?.kind === 'see' ? base.see : false }
      })
      /* Asked while the run played: said after the verdict, never over it. */
      speak(a.say, !queued)
      act(a)
    },
    [askCtx, runKey, speak, act],
  )
  /* An ask while the engine still works waits for the landing — the answer would give the run away. */
  const waitingAsk = useRef<{ run: number; intent: Intent } | null>(null)
  const [waitingFor, setWaitingFor] = useState<{ run: number; text: string } | null>(null)
  const submit = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    const intent = matchIntent(t, askCtx)
    setText('')
    if (!landed) {
      waitingAsk.current = { run: runKey, intent }
      setWaitingFor({ run: runKey, text: t })
      return
    }
    ask(intent)
  }
  useEffect(() => {
    if (!landed || !waitingAsk.current) return
    const id = window.setTimeout(
      () => {
        const w = waitingAsk.current
        waitingAsk.current = null
        setWaitingFor(null)
        if (w && w.run === runKey) ask(w.intent, true)
      },
      reduced || jumped ? 0 : 500,
    )
    return () => window.clearTimeout(id)
  }, [landed, runKey, ask, reduced, jumped])
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(text)
  }
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      submit(text)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      if (text) setText('')
      else if (now.answer) setUi((u) => ({ ...u, answer: null }))
    }
  }
  const onMic = () => {
    if (listening) {
      stopListening.current?.()
      return
    }
    voice.current?.cancel()
    const stop = listenOnce({
      heard: (t, final) => {
        setText(t)
        if (final && t) {
          stopListening.current?.()
          submit(t)
        }
      },
      end: () => {
        setListening(false)
        stopListening.current = null
      },
    })
    if (stop) {
      stopListening.current = stop
      setListening(true)
    }
  }
  /* Escape puts away What they see, then the answer. */
  useEffect(() => {
    if (!now.see && !now.answer) return
    const onDoc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as Element | null)?.closest('.jv2-ask')) return
      setUi((u) => (u.see ? { ...u, see: false } : { ...u, answer: null }))
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [now.see, now.answer])

  // --- Linking: a row and its segment light together, a dot-connector leader joining them ---
  const [hot, setHot] = useState<string | null>(null)
  const lit = useMemo(() => {
    const out = new Set<string>(now.answer?.lit ?? [])
    if (hot) out.add(hot)
    return out
  }, [now.answer, hot])
  /* A condition lights the check that read it, on the inner ring. */
  const linkOf = useCallback(
    (jv: string): string => {
      if (!jv.startsWith('fact:')) return jv
      const f = facts.find((x) => `fact:${x.field}` === jv)
      const cats = f ? (TOKEN_CATS[f.token] ?? []) : []
      const r = m.checks.rule !== null ? plan.rules[m.checks.rule] : undefined
      const k = r ? r.checks.findIndex((c, i) => i < r.checked && cats.includes(c.category)) : -1
      return r && k >= 0 ? `check:${r.id}:${k}` : jv
    },
    [facts, m.checks.rule, plan.rules],
  )
  const hotSet = useMemo(() => {
    const out = new Set(lit)
    if (hot) out.add(linkOf(hot))
    return out
  }, [lit, hot, linkOf])
  const [leader, setLeader] = useState<Leader | null>(null)
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!hot || !world) {
      setLeader(null)
      return
    }
    const target = segAt(g, m, linkOf(hot))
    const el = world.querySelector<HTMLElement>(`[data-jv="${CSS.escape(hot)}"]`)
    const b = el ? boxIn(el, world) : null
    if (!target || !b) {
      setLeader(null)
      return
    }
    const [x1, y1] = polar(g, target.r, target.a)
    const left = b.x + b.w / 2 < g.CX
    setLeader({ x0: left ? b.x + b.w + 4 : b.x - 4, y0: b.y + b.h / 2, x1, y1, tone: target.tone })
  }, [hot, g, m, linkOf])
  const onHot = useCallback((jv: string | null) => setHot(jv), [])

  // --- Pressing: every policy opens its policy, every rule that rule in the builder ---
  const pressSeg = useCallback(
    (seg: RingSeg) => {
      const t = seg.target
      if (!t) return
      if (t.kind === 'policy') onOpenPolicy(t.policyId)
      else onOpenRule(t.policyId, t.ruleId)
    },
    [onOpenPolicy, onOpenRule],
  )
  const landing = landingOf(plan)
  const openDeciderRule = () => {
    if (!o.policyId) return
    if (landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }

  // --- The decision, said ---
  const words = decisionWords(decided, o.status, o.view.needs)
  const mark = expectMark(decided, props.expected, props.weaker)
  const finding = heroFinding(plan)
  const findingAsk: Intent | null = finding
    ? o.status === 'depends'
      ? { kind: 'depends' }
      : plan.conflicts?.rules.some((r) => r.kind === 'conflict')
        ? { kind: 'why-rule', rule: plan.conflicts.conflicts[0]?.number ?? null }
        : { kind: 'others' }
    : null
  const failView = useMemo((): DecisionView['fail'] => {
    if (decided !== 'deny') return null
    if (landing && landing.index !== null) return { head: `Rule ${landing.index + 1} matched: ${landing.name}`, sub: `Then · ${DECISION_WORDS.deny}` }
    const fi = focusRuleOf(plan)
    const fr = fi !== null ? plan.rules[fi] : undefined
    const c = fr && fr.failing !== null ? fr.checks[fr.failing] : undefined
    if (fr && c) return { head: `${c.word} · ${c.value}`, sub: c.requirement ? `Rule ${(fr.index ?? 0) + 1} needs ${c.requirement}` : '' }
    return { head: 'Nothing else matched', sub: '' }
  }, [decided, landing, plan])
  const canSee = screens.length > 0 && form.appId !== null
  const decision: DecisionView = {
    landed,
    tone: m.verdict,
    flag: words.flag,
    big: words.big,
    rest: words.rest,
    factors: decided && decided !== 'deny' ? factors : [],
    expectNote: mark === 'fails' && props.expected ? `Expected ${DECISION_WORDS[props.expected]}` : mark === 'weaker' ? 'Weaker factor' : '',
    fail: failView,
    denyMsg: decided === 'deny' ? denyMessageOf(screens) : '',
    ifs: o.status === 'depends' ? o.view.outcomes : [],
    by: o.policyName ? { policy: o.policyName, rule: decided && landing ? (landing.index === null ? 'Last rule · Nothing else matched' : `Rule ${landing.index + 1} · ${landing.name}`) : '' } : null,
    /* A Depends already says what it hangs on (the flag, the ifs, the condition's Add): its finding would say it again. */
    finding: finding && o.status !== 'depends' ? { text: finding.text, tone: finding.tone === 'info' ? 'info' : 'notice' } : null,
    changed: props.changed,
    canSee,
    seeOpen: now.see,
    waits: m.waits,
  }

  // --- The rings' pace: each turn eases over the step it belongs to ---
  const turnMs = Math.max(300, Math.min(800, dur))
  const findMs = at.which >= 0 ? stepMs(plan, at.which) + (plan.policies[0]?.scanAt !== null ? stepMs(plan, at.which + 1) * 0.5 : 0) : 0
  const ringC = g.R.polLbl + 22
  const policySegs = segments(plan.policies.length)
  const landedNow = landed && at.outcome >= 0 && s === at.outcome
  const answerShown = now.answer !== null && !(now.answer.act?.kind === 'see' && now.see)
  const rulesBox = wedgeBox(g, 'rules')

  return (
    <div
      ref={rootRef}
      className={`rl-jarvis2-root t-${landed ? m.verdict : 'work'}${landed ? ' is-landed' : ' is-running'}${booting ? ' is-booting' : ''}${play ? ' is-playing' : ''}${g.compact ? ' is-compact' : ''}`}
      data-stage="dark"
      style={bootIn !== null ? ({ '--jv2-boot-delay': `${bootIn}ms` } as CSSProperties) : undefined}
    >
      <div className="jv2-stage" aria-hidden />
      <RunStage
        ref={stage}
        reduced={reduced}
        className="rl-jarvis2"
        externalDock
        onZoom={setZoom}
        pad={{ top: 0, left: 0, right: 0, bottom: 0 }}
        label={`Sign-in run: ${plan.appName}`}
        overlay={
          <>
            {landed && now.see && canSee && form.appId && (
              <section className="jv2-see" style={{ left: rulesBox.left - 8, top: rulesBox.top - 6, width: rulesBox.width + 16, maxHeight: Math.max(240, g.deck.say - rulesBox.top - 10) }} aria-label="What they see">
                <header className="jv2-see__h">
                  <span className="jv2-w__t">
                    <i className="jv2-w__dot" aria-hidden />
                    What they see
                  </span>
                  <button type="button" className="jv2-x" aria-label="Close what they see" onClick={() => setUi((u) => ({ ...u, see: false }))}>
                    <X size={13} strokeWidth={2.2} aria-hidden />
                  </button>
                </header>
                <div className="jv2-see__body">
                  <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} title="" />
                </div>
              </section>
            )}
            <Deck
              at={{ say: g.deck.say + size.h - g.H, chips: g.deck.chips + size.h - g.H, ask: g.deck.ask + size.h - g.H }}
              compact={g.compact}
              said={said.run === runKey ? said.lines : []}
              speaking={speaking}
              voiceOn={voiceOn}
              onVoice={toggleVoice}
              reduced={reduced}
              chips={chips}
              chipOn={now.answer ? (chips.find((c: Chip) => answerOf(c.intent, askCtx).key === now.answer?.key)?.key ?? null) : null}
              onChip={(c) => ask(c.intent)}
              text={text}
              onText={setText}
              onSubmit={onSubmit}
              onKey={onKey}
              placeholder={listening ? 'Listening…' : waitingFor && waitingFor.run === runKey && !landed ? `“${waitingFor.text}” · answering once the run lands` : 'Ask about this sign-in…'}
              disabled={plan.empty}
              hasMic={hasMic}
              listening={listening}
              onMic={onMic}
              working={running && !landed}
              inputRef={inputRef}
              zoom={zoom}
              zoomMin={ZOOM_MIN}
              zoomMax={ZOOM_MAX}
              onFit={() => stage.current?.fit({ max: 1 })}
              onZoom={(d) => stage.current?.zoomBy(d > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)}
              answer={answerShown ? now.answer : null}
              answerKey={`${now.answer?.key ?? ''}:${lineN.current}`}
              onCloseAnswer={() => {
                setUi((u) => ({ ...u, answer: null }))
                inputRef.current?.focus()
              }}
            />
          </>
        }
      >
        <div key={runKey} ref={worldRef} className="jv2-world" style={{ width: g.W, height: g.H, '--jv2-cx': `${g.CX}px`, '--jv2-cy': `${g.CY}px` } as CSSProperties}>
          <Ground g={g} boot={booting || (play && s <= Math.max(0, at.which))} tones={m.readouts.map((r) => r.tone).join(',')} />
          <Decor g={g} />
          <RunRing kind="pol" arrive={booting ? bootIn : null} ring={m.policies} r={g.R.pol} band={g.BAND.pol} lr={g.R.polLbl} c={ringC} cx={g.CX} cy={g.CY} play={play} turnMs={turnMs} hot={hotSet} onHot={onHot} onPress={pressSeg} drawMs={m.finding ? findMs : 0} />
          <RunRing key={`r:${plan.decider?.id ?? ''}`} kind="rule" arrive={booting ? bootIn : null} ring={m.rules} r={g.R.rule} band={g.BAND.rule} lr={g.R.ruleLbl} c={ringC} cx={g.CX} cy={g.CY} play={play} turnMs={turnMs} hot={hotSet} onHot={onHot} onPress={pressSeg} />
          <RunRing key={`c:${m.checks.rule ?? ''}`} kind="chk" arrive={booting ? bootIn : null} ring={m.checks} r={g.R.chk} band={g.BAND.chk} lr={g.R.chkLbl} c={ringC} cx={g.CX} cy={g.CY} play={play} turnMs={turnMs} hot={hotSet} onHot={onHot} onPress={pressSeg} />
          {play && m.finding && findMs > 0 && <Satellite c={ringC} cx={g.CX} cy={g.CY} r={g.R.pol} ms={findMs} from={policySegs[0]?.a0 ?? 0} />}
          {play && m.stage === 'rules' && m.checks.focus !== null && m.checks.segs[m.checks.focus]?.tone === 'work' && <span className="jv2-probe" style={{ left: g.CX, top: g.CY - g.R.chk }} aria-hidden />}
          <CoreView g={g} core={m.core} play={play} landedNow={landedNow} speaking={speaking && voiceOn} />
          <Readouts g={g} readouts={m.readouts} play={play} />
          <WhoWedge
            g={g}
            play={play}
            name={personName}
            initials={initialsOf(asGroup ?? personName)}
            tested={asGroup && person ? `tested as ${person.name}` : ''}
            groups={m.groups}
            appId={app?.id ?? null}
            appName={plan.appName}
            conds={m.conds}
            hot={hotSet}
            onHot={onHot}
            onPressPerson={onPressPerson}
            onAdd={onAdd}
          />
          <PoliciesWedge g={g} play={play} appName={plan.appName} rows={m.polRows} hot={hotSet} onHot={onHot} onOpen={onOpenPolicy} all={now.allPol} onAll={() => setUi((u) => ({ ...u, allPol: true }))} />
          <RulesWedge
            g={g}
            play={play}
            policyName={plan.decider?.name ?? null}
            rows={m.ruleRows}
            shown={m.rules.shown}
            hot={hotSet}
            onHot={onHot}
            onOpen={(r) => (r.policyId ? (r.n === null ? onOpenPolicy(r.policyId) : onOpenRule(r.policyId, r.ruleId)) : undefined)}
            all={now.allRules}
            onAll={() => setUi((u) => ({ ...u, allRules: true }))}
          />
          <DecisionWedge
            g={g}
            play={play}
            v={decision}
            lit={lit.has('outcome')}
            onSee={() => setUi((u) => ({ ...u, see: !u.see, answer: u.answer?.act?.kind === 'see' ? null : u.answer }))}
            onPolicy={() => o.policyId && onOpenPolicy(o.policyId)}
            onRule={openDeciderRule}
            onFinding={() => findingAsk && ask(findingAsk)}
          />
          {/* The DECISION as it will land, unseen: measured so its wedge is cut to fit before the run plays. */}
          {need?.key !== needKey && <DecisionWedge g={g} play={false} v={{ ...decision, landed: true }} lit={false} measure onSee={noop} onPolicy={noop} onRule={noop} onFinding={noop} />}
          {leader && (
            <svg className={`jv2-leader t-${leader.tone}`} width={g.W} height={g.H} aria-hidden>
              <line x1={leader.x0} y1={leader.y0} x2={leader.x1} y2={leader.y1} />
              <circle cx={leader.x0} cy={leader.y0} r={3} />
              <circle className="is-end" cx={leader.x1} cy={leader.y1} r={4.5} />
            </svg>
          )}
        </div>
      </RunStage>
    </div>
  )
}
