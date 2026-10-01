import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRight, ArrowUp, ChevronDown, Clock, Gauge, MapPin, MonitorSmartphone, PenLine, Undo2, UserMinus, UserRound, Users, X } from 'lucide-react'

import { Button, Field, IconButton, NumberStepper, Tip, TipDot, TipMark } from '../../kit'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { Picker, type PickerOption } from '../../picker'
import { AppLogo } from '../../logos/AppLogo'
import { EVERYONE, TIMEZONES, enforces, type AccessDecision, type Group, type User } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { RULE_METHODS } from '../../methods'
import { DAY_NAMES } from '../../create/describe-words'
import {
  EXAMPLES,
  TENANT_TIME_ZONE,
  audienceOfAnswers,
  branchLabel,
  branchesOf,
  deviceWords,
  dictionaryOf,
  lastRowOf,
  openChoices,
  riskWords,
  sentenceOf,
  whenWords,
  whereWords,
  type AnswerKey,
  type BranchId,
  type ClauseRule,
  type DescribeAnswers,
  type DescribeTenant,
  type DeviceAnswer,
  type NotAdded,
  type Outcome,
  type Reading,
  type RiskAnswer,
  type WhenAnswer,
  type WhereAnswer,
} from '../../create/describe-model'
import type { ChecksView } from '../../create/describe-checks'
import type { SignInFacts } from '../sign-in-facts'
import { AnchoredPopover } from '../testing/AnchoredPopover'
import { WhoPicker } from '../who-picker'
import { answerAsk, asksOf, followUps, skipChoice, turnView, type Ask, type BoardBody, type DescribeState, type TurnView } from './describe-session'
import { Seg } from './Section'

/* -----------------------------------------------------------------------------
   Describe it: the panel (V4 §4 and §4.1).

   A thread on the LEFT of the board, text first. The admin writes what the
   policy should do; each message is a turn — the bubble, and under it what
   the board made of it: "Understood" rows of chips for what the text said
   (never a default), one question at a time where the tenant holds more than
   one fitting object, the phrases not added, and one line saying what the
   turn did to the board, with Undo. A follow-up extends the text and the
   whole is read again; the bubble's pencil rewrites a message in its place.

   A chip opens that answer's own controls in a popover, so a correction is
   two clicks. The panel saves nothing: the board's "Save policy" does. Its
   writes are one history entry per opening (describe-session.ts), and the
   thread lives in BoardBuilder for the visit, so closing and reopening shows
   it as it was.

   Not `.bb__insp`: it is its own track at the leading edge of `.bb`, and it
   enters by opacity and the `translate` property on this plain aside — no
   motion component here, so nothing can be caught by the transform trap.
   -------------------------------------------------------------------------- */

/* The label a turn's row wears (§4.1): Then and Everyone else, the words the
   reply reads in. The popover over a row is named the same way. */
const ROW: Record<AnswerKey, string> = {
  apps: 'Applications',
  who: 'Who',
  leaveOut: 'Leave out',
  where: 'Where and when',
  devices: 'Devices',
  signIn: 'Then',
  fallback: 'Everyone else',
}
const ACTION_LABEL: Record<NonNullable<NotAdded['action']>, string> = {
  'create-zone': 'Create zone',
  'device-profiles': 'Device profiles',
  'auth-methods': 'Authentication methods',
}

const isSaid = (o: string | undefined) => o === 'text' || o === 'picked'
const DONT_ADD = "Don't add"

/* Where and when names only the half the text said. */
function rowLabel(key: AnswerKey, a: DescribeAnswers): string {
  if (key !== 'where') return ROW[key]
  const where = isSaid(a.where.origin)
  const when = isSaid(a.when.origin)
  return where && when ? 'Where and when' : when ? 'When' : 'Where'
}

interface ChipSpec {
  id: string
  art?: ReactNode
  body: ReactNode
  /** The chip's words, for its accessible name. */
  name: string
  muted?: boolean
  /** Its body is a decision badge: the badge is the pill, so the chip draws no box of its own. */
  outcome?: boolean
}

const outcomeBody = (o: Outcome): { body: ReactNode; name: string } => {
  const extra = o.decision === 'deny' ? (o.message ? 'Custom message' : null) : o.method
  return {
    body: (
      <>
        <DecisionBadge decision={o.decision} />
        {extra && <span className="bdsc__chipextra">{extra}</span>}
      </>
    ),
    name: [DECISION_WORDS[o.decision], extra].filter(Boolean).join(' · '),
  }
}

/* A later sentence's own rule, by what it checks. */
function moreLabel(m: ClauseRule, t: DescribeTenant): string {
  const parts = [
    m.where.value && m.where.value.mode !== 'anywhere' ? whereWords(m.where.value, t) : '',
    m.devices.value && m.devices.value.mode !== 'any' ? deviceWords(m.devices.value, t) : '',
    m.when.value && m.when.value.mode !== 'any' ? whenWords(m.when.value) : '',
    m.risk.value ? riskWords(m.risk.value) : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'Also'
}

/* The chips of one row: only what was said, as it now stands. */
function chipsOf(key: AnswerKey, a: DescribeAnswers, t: DescribeTenant): ChipSpec[] {
  const icon = (I: typeof Users) => <I size={14} strokeWidth={2} aria-hidden />
  const people = (who: { groupIds: string[]; userIds: string[] }, none: string, I: typeof Users): ChipSpec[] => {
    const out: ChipSpec[] = [
      ...who.groupIds.map((id) => {
        const name = t.groups.find((g) => g.id === id)?.name ?? id
        return { id: `g:${id}`, art: icon(I), body: name, name }
      }),
      ...who.userIds.map((id) => {
        const name = t.users.find((u) => u.id === id)?.name ?? id
        return { id: `u:${id}`, art: icon(UserRound), body: name, name }
      }),
    ]
    return out.length > 0 ? out : [{ id: 'none', body: none, name: none, muted: true }]
  }
  switch (key) {
    case 'apps': {
      const ids = a.apps.value ?? []
      const apps = t.apps.filter((p) => ids.includes(p.id))
      if (apps.length === 0) return [{ id: 'none', body: 'None', name: 'None', muted: true }]
      return apps.map((p) => ({ id: p.id, art: <AppLogo appId={p.id} name={p.name} size={16} />, body: p.name, name: p.name }))
    }
    case 'who': {
      const v = a.who.value
      if (!v || v === 'everyone') return [{ id: 'everyone', art: icon(Users), body: 'Everyone', name: 'Everyone' }]
      return people(v, 'Everyone', Users)
    }
    case 'leaveOut':
      return people(a.leaveOut.value ?? { groupIds: [], userIds: [] }, 'Nobody', UserMinus)
    case 'where': {
      const out: ChipSpec[] = []
      const w = a.where.value
      if (isSaid(a.where.origin) && w) {
        const name = w.mode === 'split' ? whereWords({ ...w, mode: 'only' }, t).replace(/^Only from /, '') : whereWords(w, t)
        out.push({ id: 'where', art: icon(MapPin), body: name, name })
      }
      const wh = a.when.value
      /* The tenant's own time zone goes without saying; another is named. */
      const when = wh && wh.mode === 'between' && wh.timeZone === TENANT_TIME_ZONE ? whenWords({ ...wh, timeZone: '' }) : wh ? whenWords(wh) : ''
      if (isSaid(a.when.origin) && wh) out.push({ id: 'when', art: icon(Clock), body: when, name: when })
      return out
    }
    case 'devices': {
      const out: ChipSpec[] = []
      const d = a.devices.value
      if (isSaid(a.devices.origin) && d) out.push({ id: 'devices', art: icon(MonitorSmartphone), body: deviceWords(d, t), name: deviceWords(d, t) })
      const r = a.risk.value
      if (isSaid(a.risk.origin) && r && r.mode !== 'any') out.push({ id: 'risk', art: icon(Gauge), body: riskWords(r), name: riskWords(r) })
      return out
    }
    case 'signIn': {
      const branches = branchesOf(a)
      const out: ChipSpec[] = []
      for (const b of branches) {
        const o = a.signIn[b]?.value
        if (!o || !isSaid(a.signIn[b]?.origin)) continue
        const { body, name } = outcomeBody(o)
        if (branches.length === 1) out.push({ id: b, body, name, outcome: true })
        else {
          const label = branchLabel(b, a, t)
          out.push({ id: b, body: <BranchBody label={label}>{body}</BranchBody>, name: `${label}, ${name}`, outcome: true })
        }
      }
      a.more.forEach((m, k) => {
        if (!m.outcome.value) return
        const label = moreLabel(m, t)
        const { body, name } = outcomeBody(m.outcome.value)
        out.push({ id: `more:${k}`, body: <BranchBody label={label}>{body}</BranchBody>, name: `${label}, ${name}`, outcome: true })
      })
      return out
    }
    default: {
      const state = lastRowOf(a, t)
      if (state === 'not-reached') return [{ id: 'fallback', body: 'Not reached', name: 'Not reached', muted: true }]
      const o = state === 'merged' ? a.signIn.match?.value : a.fallback.value
      if (!o) return []
      return [{ id: 'fallback', ...outcomeBody(o), outcome: true }]
    }
  }
}

function BranchBody({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="bdsc__branch">{label}</span>
      <ArrowRight size={12} strokeWidth={2} className="bdsc__arrow" aria-hidden />
      {children}
    </>
  )
}

export function DescribePanel({
  tenant,
  policyId,
  state,
  board,
  onState,
  onSend,
  onUndoTurn,
  onDone,
  onGo,
  focus,
  bold,
  onTrace,
  checks,
  onTryCheck,
}: {
  tenant: DescribeTenant
  policyId: string
  state: DescribeState
  /** The board as it stands: the latest turn's change line is measured against it. */
  board: BoardBody
  /** The state changed. `write` is true when the answers changed and the board should follow. */
  onState: (next: DescribeState, write: boolean) => void
  /** A message sent: the first, a follow-up, or a rewrite (`state.rewrite`). */
  onSend: (message: string) => void
  /** The latest turn's Undo. */
  onUndoTurn: () => void
  /** ×, Esc: close and keep everything. */
  onDone: () => void
  /** A Not added row's way to fix it: a page of its own, behind the leave guard. */
  onGo: (to: NonNullable<NotAdded['action']>) => void
  /** A card was clicked on the board: flash the reply row it came from. */
  focus: { key: AnswerKey; n: number } | null
  /** A card is under the pointer: its row's label is bolded. */
  bold: AnswerKey | null
  /** The answer under the pointer, for the ring on the cards it wrote. */
  onTrace: (key: AnswerKey | null) => void
  /* The checks under the latest reply (describe spec, §3.7): the rows, or
     null while no application is chosen. Undefined draws no Checks at all. */
  checks?: ChecksView | null
  /** A check pressed: Try a sign-in on this draft, with its sign-in. */
  onTryCheck?: (facts: SignInFacts) => void
}) {
  const uid = useId()
  const dict = useMemo(() => dictionaryOf(tenant), [tenant])
  const r = state.reading
  const a = r.answers
  const turns = state.turns
  const views = useMemo(() => turns.map((_, i) => turnView(state, i, board, tenant)), [state, turns, board, tenant])
  const asks = useMemo(() => asksOf(r, tenant, state.dismissed), [r, tenant, state.dismissed])
  const ask = asks[0] ?? null
  /* Shortest first, so the chips pack into as few lines as they can. */
  const suggestions = useMemo(() => (ask ? [] : followUps(state, tenant, dict).sort((x, y) => x.length - y.length)), [ask, state, tenant, dict])
  const methods = RULE_METHODS.filter((m) => tenant.methods.find((x) => x.name === m)?.active !== false)

  const box = useRef<HTMLTextAreaElement | null>(null)
  const thread = useRef<HTMLDivElement | null>(null)
  const [said, setSaid] = useState('')
  const [pop, setPop] = useState<{ key: AnswerKey; row: string } | null>(null)
  const popAnchor = useRef<HTMLElement | null>(null)
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null)

  useEffect(() => {
    box.current?.focus()
  }, [])

  /* A new turn: into view, and said once in the status region. */
  const latest = turns.at(-1)
  const latestId = latest?.id ?? 0
  useEffect(() => {
    const el = thread.current
    const turn = el?.querySelector<HTMLElement>('.bdsc__turn:last-child')
    if (!el || !turn) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    /* Its message at the top of the thread, or as far as the thread goes. */
    el.scrollTo({ top: turn.offsetTop - el.offsetTop - 12, behavior: still ? 'auto' : 'smooth' })
  }, [latestId])
  const announced = useRef(latestId)
  useEffect(() => {
    if (announced.current === latestId || latestId === 0) return
    announced.current = latestId
    const view = views.at(-1)
    const notAdded = (view?.notAdded ?? []).map((n) => `“${n.span.phrase}”`)
    const choose = openChoices(r).map((c) => `“${c.span.phrase}”`)
    setSaid(['Read.', notAdded.length > 0 ? `Not added: ${notAdded.join(', ')}.` : '', choose.length > 0 ? `Choose: ${choose.join(', ')}.` : ''].filter(Boolean).join(' '))
  }, [latestId, views, r])

  /* A card clicked on the board: the row it came from, brought into view and flashed. */
  const rowsNow = useRef<{ id: number; keys: AnswerKey[] }[]>([])
  rowsNow.current = turns.map((t, i) => ({ id: t.id, keys: views[i]?.keys ?? [] }))
  useEffect(() => {
    if (!focus) return
    const row = [...rowsNow.current].reverse().find((t) => t.keys.includes(focus.key))
    if (!row) return
    const id = `${uid}-t${row.id}-${focus.key}`
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
    setFlash({ id, n: focus.n })
  }, [focus, uid])

  /* A popover whose row went away (its answer is no longer said) closes. */
  useEffect(() => {
    if (pop && !popAnchor.current?.isConnected) setPop(null)
  })

  /* Focus after a question is answered: the next question's first reply,
     else the composer — never <body>, where the board's keys act. */
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const next = thread.current?.querySelector<HTMLElement>('.bdsc__ask button')
    ;(next ?? box.current)?.focus()
  })

  // --- Writes ----------------------------------------------------------------------

  /* An answer changed by hand. The text follows the answers — unless a
     question from the text is still open, when the text still carries it —
     so the next follow-up extends what the answers now say. */
  const settle = (reading: Reading) => {
    const stillOpen = openChoices(reading).length > 0
    onState({ ...state, text: stillOpen ? state.text : sentenceOf(reading.answers, tenant), reading }, true)
  }
  const change = (answers: DescribeAnswers) => settle({ ...r, answers })
  const answer = (q: Ask, value: string) => {
    refocus.current = true
    settle(answerAsk(r, q.id, value, dict))
  }
  const skip = (q: Ask) => {
    refocus.current = true
    if (q.id.startsWith('ask:')) onState({ ...state, dismissed: [...state.dismissed, q.id] }, false)
    else settle(skipChoice(r, q.id, dict))
  }
  const send = (text: string) => {
    if (!text.trim()) {
      box.current?.focus()
      return
    }
    setPop(null)
    onSend(text)
    box.current?.focus()
  }
  const rewrite = (i: number) => {
    onState({ ...state, box: turns[i].said, rewrite: i }, false)
    window.requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }
  const cancelRewrite = () => onState({ ...state, box: '', rewrite: null }, false)

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    if (state.rewrite !== null) cancelRewrite()
    else onDone()
  }

  // --- The answers' own controls, in a chip's popover ---------------------------------

  const setWhere = (w: WhereAnswer, scopeSaid = a.scopeSaid) =>
    change({ ...a, where: { value: w, origin: w.mode !== 'anywhere' && !w.zoneId ? 'unset' : 'picked', spans: a.where.spans }, scopeSaid })
  const setWhen = (w: WhenAnswer) => change({ ...a, when: { value: w, origin: 'picked', spans: a.when.spans } })
  const setDevices = (d: DeviceAnswer) => change({ ...a, devices: { value: d, origin: d.mode !== 'any' && !d.profileId ? 'unset' : 'picked', spans: a.devices.spans } })
  const setRisk = (x: RiskAnswer) => change({ ...a, risk: { value: x, origin: 'picked', spans: a.risk.spans } })
  const setBranch = (b: BranchId, o: Outcome) => change({ ...a, signIn: { ...a.signIn, [b]: { value: o, origin: 'picked', spans: a.signIn[b]?.spans ?? [] } } })
  const setMore = (k: number, o: Outcome) => change({ ...a, more: a.more.map((m, i) => (i === k ? { ...m, outcome: { value: o, origin: 'picked', spans: m.outcome.spans } } : m)) })

  const w = a.where.value
  const wh = a.when.value ?? { mode: 'any' as const }
  const d = a.devices.value
  const risk = a.risk.value
  const split = w?.mode === 'split'
  const bands = risk?.mode === 'bands'
  const zoneOptions: PickerOption[] = tenant.zones.map((z) => ({ value: z.id, label: z.name }))
  const profileOptions: PickerOption[] = tenant.fingerprints.map((p) => ({ value: p.id, label: p.name, meta: p.mode === 'device' ? 'Trusted device' : 'Device health' }))

  const alsoCovers = (a.apps.value ?? []).flatMap((id) => {
    const others = tenant.policies.filter((p) => p.id !== policyId && !p.isSystem && enforces(p) && p.appIds.includes(id))
    const app = tenant.apps.find((x) => x.id === id)
    return others.length > 0 && app ? [`Also covers ${app.name}: ${others.map((p) => p.name).join(', ')}`] : []
  })
  const decidedElsewhere = audienceOfAnswers(a).everyone
    ? tenant.policies
        .filter((p) => p.id !== policyId && !p.isSystem && enforces(p) && !p.audience.everyone && p.appIds.some((id) => (a.apps.value ?? []).includes(id)))
        .map((p) => {
          const names = [
            ...p.audience.groupIds.map((id) => tenant.groups.find((g) => g.id === id)?.name ?? id),
            ...p.audience.userIds.map((id) => tenant.users.find((u) => u.id === id)?.name ?? id),
          ]
          return `Decided elsewhere: ${names.join(', ')} (${p.name})`
        })
    : []

  const body = (key: AnswerKey): ReactNode => {
    switch (key) {
      case 'apps':
        return (
          <>
            <Picker
              multiple
              searchable
              width="fill"
              label="Applications"
              placeholder="Choose applications"
              value={a.apps.value ?? []}
              options={tenant.apps.map((p) => ({ value: p.id, label: p.name, art: <AppLogo appId={p.id} name={p.name} size={18} /> }))}
              onChange={(id) => {
                const cur = a.apps.value ?? []
                const nextIds = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                const ordered = tenant.apps.filter((p) => nextIds.includes(p.id)).map((p) => p.id)
                /* Picked, even when the last one goes: an empty list is the
                   admin's answer, not a gap for the policy's own to fill. */
                change({ ...a, apps: { value: ordered, origin: 'picked', spans: ordered.length > 0 ? a.apps.spans : [] } })
              }}
            />
            {alsoCovers.map((line) => (
              <p key={line} className="bdsc__aside">
                {line}
              </p>
            ))}
          </>
        )
      case 'who':
        return (
          <WhoPicker
            compact
            label="Who"
            exceptions={false}
            who={a.who.value && a.who.value !== 'everyone' ? a.who.value : undefined}
            onChange={(next) => change({ ...a, who: { value: next ? { groupIds: next.groupIds, userIds: next.userIds } : 'everyone', origin: 'picked', spans: a.who.spans } })}
            audience={EVERYONE}
            directory={tenant.users as User[]}
            groups={tenant.groups as Group[]}
          />
        )
      case 'leaveOut':
        return (
          <WhoPicker
            compact
            label="Leave out"
            emptyText="Nobody"
            placeholder="Add groups or people to leave out"
            exceptions={false}
            who={a.leaveOut.value ?? undefined}
            onChange={(next) =>
              change({ ...a, leaveOut: { value: next ? { groupIds: next.groupIds, userIds: next.userIds } : { groupIds: [], userIds: [] }, origin: 'picked', spans: a.leaveOut.spans } })
            }
            audience={EVERYONE}
            directory={tenant.users as User[]}
            groups={tenant.groups as Group[]}
          />
        )
      case 'where': {
        const modes = [
          { value: 'anywhere' as const, label: 'Anywhere' },
          { value: 'only' as const, label: 'Only from' },
          ...(bands ? [] : [{ value: 'split' as const, label: 'Inside and outside' }]),
          { value: 'not' as const, label: 'Not from' },
        ]
        const pickMode = (mode: WhereAnswer['mode']) =>
          setWhere(mode === 'anywhere' ? { mode } : { mode, zoneId: w && w.mode !== 'anywhere' ? w.zoneId : '', scope: w && w.mode !== 'anywhere' ? w.scope : 'both' })
        return (
          <>
            <Seg label="Where" value={w?.mode ?? null} options={modes} onChange={pickMode} block />
            {w && w.mode !== 'anywhere' && (
              <div className="bdsc__pair">
                <Picker label="Zone" width="fill" placeholder="Choose…" value={w.zoneId || null} options={zoneOptions} onChange={(id) => setWhere({ ...w, zoneId: id })} />
                <div className="bdsc__labelled">
                  <span className="bdsc__minilabel">
                    Match on{!a.scopeSaid && <span className="bdsc__tag">Default</span>}
                  </span>
                  <Seg
                    label="Match on"
                    value={w.scope}
                    options={[
                      { value: 'both', label: 'Both' },
                      { value: 'ip', label: 'IP' },
                      { value: 'location', label: 'Location' },
                    ]}
                    onChange={(scope) => setWhere({ ...w, scope }, true)}
                  />
                </div>
              </div>
            )}
            <Seg
              label="When"
              value={wh.mode === 'any' ? 'any' : 'between'}
              options={[
                { value: 'any', label: 'Any time' },
                { value: 'between', label: 'Between' },
              ]}
              onChange={(m) => setWhen(m === 'any' ? { mode: 'any' } : { mode: 'between', from: '09:00', to: '18:00', days: wh.mode === 'days' ? wh.days : [], timeZone: TENANT_TIME_ZONE })}
              block
            />
            {wh.mode !== 'any' && (
              <div className="bdsc__time">
                <TimeField
                  label="From"
                  value={wh.mode === 'between' ? wh.from : ''}
                  onCommit={(from) => setWhen({ mode: 'between', from, to: wh.mode === 'between' ? wh.to : '18:00', days: wh.days, timeZone: wh.mode === 'between' ? wh.timeZone : TENANT_TIME_ZONE })}
                />
                <TimeField
                  label="To"
                  value={wh.mode === 'between' ? wh.to : ''}
                  onCommit={(to) => setWhen({ mode: 'between', from: wh.mode === 'between' ? wh.from : '09:00', to, days: wh.days, timeZone: wh.mode === 'between' ? wh.timeZone : TENANT_TIME_ZONE })}
                />
                <Picker
                  multiple
                  width="fill"
                  label="Days"
                  placeholder="Every day"
                  value={wh.days}
                  options={DAY_NAMES.map((x) => ({ value: x, label: x }))}
                  onChange={(day) => {
                    const days = DAY_NAMES.filter((x) => (x === day ? !wh.days.includes(x) : wh.days.includes(x)))
                    setWhen(wh.mode === 'between' ? { ...wh, days: [...days] } : { mode: 'days', days: [...days] })
                  }}
                />
                {wh.mode === 'between' && (
                  <Picker width="fill" label="Time zone" value={wh.timeZone} options={TIMEZONES.map((z) => ({ value: z, label: z }))} onChange={(timeZone) => setWhen({ ...wh, timeZone })} />
                )}
              </div>
            )}
          </>
        )
      }
      case 'devices': {
        const modes = [
          { value: 'any' as const, label: 'Any device' },
          { value: 'only' as const, label: 'Only' },
          { value: 'not' as const, label: 'Not' },
        ]
        const pickMode = (mode: DeviceAnswer['mode']) => setDevices(mode === 'any' ? { mode } : { mode, profileId: d && d.mode !== 'any' ? d.profileId : '' })
        const { mediumFrom, highAbove } = dict.cutoffs
        const riskModes = [
          { value: 'any' as const, label: 'Any' },
          ...(split ? [] : [{ value: 'bands' as const, label: 'Bands' }]),
          { value: 'above' as const, label: 'Above' },
          ...(risk?.mode === 'below' ? [{ value: 'below' as const, label: 'Below' }] : []),
        ]
        return (
          <>
            <Seg label="Devices" value={d?.mode ?? null} options={modes} onChange={pickMode} block />
            {d && d.mode !== 'any' && (
              <Picker label="Device profile" width="fill" placeholder="Choose…" value={d.profileId || null} options={profileOptions} onChange={(id) => setDevices({ ...d, profileId: id })} />
            )}
            <div className="bdsc__labelled">
              <span className="bdsc__minilabel">Device risk score</span>
              <Seg
                label="Device risk score"
                value={risk?.mode ?? null}
                options={riskModes}
                onChange={(m) =>
                  setRisk(
                    m === 'any'
                      ? { mode: 'any' }
                      : m === 'bands'
                        ? { mode: 'bands', mediumFrom, highAbove }
                        : { mode: m, score: risk && (risk.mode === 'above' || risk.mode === 'below') ? risk.score : m === 'above' ? highAbove : mediumFrom },
                  )
                }
              />
            </div>
            {risk?.mode === 'bands' && (
              <div className="bdsc__pair">
                <label className="bdsc__labelled">
                  <span className="bdsc__minilabel">Medium from</span>
                  <NumberStepper value={risk.mediumFrom} min={1} max={Math.max(1, risk.highAbove)} label="Medium from" onChange={(n) => setRisk({ ...risk, mediumFrom: n })} />
                </label>
                <label className="bdsc__labelled">
                  <span className="bdsc__minilabel">High above</span>
                  <NumberStepper value={risk.highAbove} min={risk.mediumFrom} max={99} label="High above" onChange={(n) => setRisk({ ...risk, highAbove: n })} />
                </label>
              </div>
            )}
            {risk && (risk.mode === 'above' || risk.mode === 'below') && (
              <label className="bdsc__labelled">
                <span className="bdsc__minilabel">{risk.mode === 'above' ? 'Above' : 'Below'}</span>
                <NumberStepper value={risk.score} min={0} max={100} label={risk.mode === 'above' ? 'Above' : 'Below'} onChange={(n) => setRisk({ ...risk, score: n })} />
              </label>
            )}
          </>
        )
      }
      case 'signIn':
        return (
          <div className="bdsc__branches">
            {branchesOf(a).map((b) => (
              <OutcomeRow
                key={b}
                label={branchesOf(a).length > 1 ? branchLabel(b, a, tenant) : undefined}
                value={a.signIn[b]?.value ?? null}
                methods={methods}
                onChange={(o) => setBranch(b, o)}
              />
            ))}
            {a.more.map((m, k) => (
              <OutcomeRow key={`more:${k}`} label={moreLabel(m, tenant)} value={m.outcome.value} methods={methods} onChange={(o) => setMore(k, o)} />
            ))}
          </div>
        )
      default:
        return (
          <>
            <OutcomeRow value={a.fallback.value} methods={methods} onChange={(o) => change({ ...a, fallback: { value: o, origin: 'picked', spans: a.fallback.spans } })} />
            {decidedElsewhere.map((line) => (
              <p key={line} className="bdsc__aside">
                {line}
              </p>
            ))}
          </>
        )
    }
  }

  const openPop = (key: AnswerKey, row: string, el: HTMLElement) => {
    if (pop?.row === row && popAnchor.current === el) {
      setPop(null)
      return
    }
    popAnchor.current = el
    setPop({ key, row })
  }

  // --- The thread ------------------------------------------------------------------------

  const reply = (i: number, view: TurnView) => {
    const turn = turns[i]
    const rows = view.keys.map((key) => ({ key, chips: chipsOf(key, a, tenant) })).filter((row) => row.chips.length > 0)
    const fixes = [...new Set(view.notAdded.flatMap((n) => (n.action ? [n.action] : [])))]
    return (
      <div className="bdsc__reply">
        {rows.length > 0 && <p className="bdsc__understood">Understood</p>}
        {rows.length > 0 && (
          <div className="bdsc__rows">
            {rows.map(({ key, chips }) => {
              const id = `${uid}-t${turn.id}-${key}`
              const flashing = flash?.id === id ? ` is-flash${flash.n % 2}` : ''
              const label = rowLabel(key, a)
              return (
                <div
                  key={key}
                  id={id}
                  className={`bdsc__row${view.latest && bold === key ? ' is-bold' : ''}${flashing}`}
                  onMouseEnter={() => onTrace(key)}
                  onMouseLeave={() => onTrace(null)}
                >
                  <span className="bdsc__rowlabel">{label}</span>
                  <span className="bdsc__chips">
                    {chips.map((c) => {
                      const open = pop?.row === id && popAnchor.current?.dataset.chip === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`bdsc__chip${c.muted ? ' is-muted' : ''}${c.outcome ? ' is-outcome' : ''}${open ? ' is-open' : ''}`}
                          aria-label={`${label}: ${c.name}`}
                          aria-haspopup="dialog"
                          aria-expanded={open}
                          data-chip={c.id}
                          onClick={(e) => openPop(key, id, e.currentTarget)}
                          onFocus={() => onTrace(key)}
                          onBlur={() => onTrace(null)}
                        >
                          {c.art && <span className="bdsc__chipart">{c.art}</span>}
                          <span className="bdsc__chipbody">{c.body}</span>
                        </button>
                      )
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {view.settled.length > 0 && (
          <ul className="bdsc__settled">
            {view.settled.map((s) => (
              <li key={s.key}>
                <span className="bdsc__settledphrase">“{s.phrase}”</span>
                <ArrowRight size={12} strokeWidth={2} className="bdsc__arrow" aria-hidden />
                <span className="bdsc__settledanswer">{s.answer}</span>
              </li>
            ))}
          </ul>
        )}

        {view.latest && ask && <AskCard key={ask.id} uid={uid} ask={ask} onAnswer={(v) => answer(ask, v)} onSkip={() => skip(ask)} />}

        {view.notAdded.length > 0 && (
          <div className="bdsc__row bdsc__notadded">
            <span className="bdsc__rowlabel">Not added</span>
            <span className="bdsc__chips">
              {view.notAdded.map((n) => (
                <Tip key={`${n.span.start}:${n.span.phrase}:${n.reason}`} text={n.reason}>
                  <span className="bdsc__gone" tabIndex={0} aria-label={`Not added: ${n.span.phrase}. ${n.reason}`}>
                    {n.span.phrase}
                  </span>
                </Tip>
              ))}
              {fixes.map((f) => (
                <Button key={f} variant="link" size="sm" onClick={() => onGo(f)}>
                  {ACTION_LABEL[f]}
                </Button>
              ))}
            </span>
          </div>
        )}

        <p className="bdsc__change">
          {/* Its parts wrap between them, never inside one. */}
          <span className="bdsc__changeline">
            {view.change.split(' · ').map((part, k) => (
              <Fragment key={part}>
                {k > 0 && ' · '}
                <span className="bdsc__changepart">{part}</span>
              </Fragment>
            ))}
          </span>
          {view.latest && (
            <Button variant="ghost" size="sm" icon={Undo2} onClick={onUndoTurn}>
              Undo
            </Button>
          )}
        </p>

        {view.latest && checks !== undefined && <ChecksRow uid={uid} view={checks} onTry={onTryCheck} />}
      </div>
    )
  }

  const rewriting = state.rewrite !== null && state.rewrite < turns.length
  const hasText = state.box.trim().length > 0

  return (
    <aside className="bdsc" aria-labelledby={`${uid}-title`} onKeyDown={onKey}>
      <div className="bdsc__bar">
        <h2 id={`${uid}-title`} className="bdsc__title">
          Describe the policy
        </h2>
        <TipDot
          label="How phrases are read"
          text="Prototype: phrases are matched against this tenant's apps, groups, zones and profiles. The product would use a backend model with the same checks."
        />
        <span className="bdsc__barend">
          <IconButton icon={X} size="sm" tone="ghost" label="Close Describe the policy" onClick={onDone} />
        </span>
      </div>

      <div className="bdsc__thread" ref={thread}>
        {turns.length === 0 ? (
          <div className="bdsc__empty">
            <span className="bdsc__glyph" aria-hidden>
              <PenLine size={18} strokeWidth={1.9} />
            </span>
            <p className="bdsc__prompt">What should this policy do?</p>
            <div className="bdsc__examples" role="group" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" className="bdsc__example" title={ex.text} onClick={() => send(ex.text)}>
                  <span className="bdsc__exampletext">{ex.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="bdsc__turns">
            {turns.map((turn, i) => (
              <li key={turn.id} className="bdsc__turn">
                <div className={`bdsc__msg${rewriting && state.rewrite === i ? ' is-rewriting' : ''}`}>
                  <span className="bdsc__pencil">
                    <IconButton icon={PenLine} size="sm" tone="ghost" label="Rewrite" onClick={() => rewrite(i)} />
                  </span>
                  <p className="bdsc__bubble">{turn.said}</p>
                </div>
                {reply(i, views[i])}
              </li>
            ))}
          </ol>
        )}
        <p role="status" className="u-sr-only">
          {said}
        </p>
      </div>

      <div className="bdsc__foot">
        {suggestions.length > 0 && !rewriting && (
          <div className="bdsc__suggest" role="group" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="bdsc__suggestion" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className={`bdsc__composer${rewriting ? ' is-rewriting' : ''}`}>
          {rewriting && (
            <div className="bdsc__rewrite">
              <PenLine size={14} strokeWidth={2} aria-hidden />
              <span>Rewrite</span>
              <span className="bdsc__rewriteend">
                <IconButton icon={X} size="sm" tone="ghost" label="Cancel rewrite" onClick={cancelRewrite} />
              </span>
            </div>
          )}
          <label htmlFor="bdsc-text" className="u-sr-only">
            {turns.length === 0 ? 'What should this policy do?' : 'Add or change something'}
          </label>
          <div className="bdsc__field">
            <textarea
              id="bdsc-text"
              ref={box}
              rows={1}
              maxLength={500}
              placeholder={turns.length === 0 ? 'Who, which applications, where or when, what happens' : 'Add or change something'}
              value={state.box}
              onChange={(e) => onState({ ...state, box: e.target.value }, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(state.box)
                }
              }}
            />
            <Tip text="Send (Enter)" placement="top">
              <button type="button" className={`bdsc__send${hasText ? ' has-text' : ''}`} aria-label="Send" aria-keyshortcuts="Enter" onClick={() => send(state.box)}>
                <ArrowUp size={16} strokeWidth={2.2} aria-hidden />
              </button>
            </Tip>
          </div>
        </div>
      </div>

      {pop && (
        <AnchoredPopover anchor={popAnchor} open onClose={() => setPop(null)} label={ROW[pop.key]} width={360} className="bdsc-pop">
          <p className="bdsc-pop__title">{rowLabel(pop.key, a)}</p>
          {/* Escape shuts an open list first; with none open it shuts the
              popover and goes back to the chip. The Picker's trigger stops
              every Escape, open or not, so the popover has to take it first. */}
          <div
            className="bdsc-pop__body"
            onKeyDownCapture={(e) => {
              if (e.key !== 'Escape') return
              const t = e.target as HTMLElement
              if (t.closest('[aria-expanded="true"]') || document.querySelector('.bx-picker__pop')) return
              e.preventDefault()
              e.stopPropagation()
              setPop(null)
              popAnchor.current?.focus()
            }}
          >
            {body(pop.key)}
          </div>
        </AnchoredPopover>
      )}
    </aside>
  )
}

/* One question, with nothing picked: the question in a line, its replies as
   chips (four at most, the rest behind More…), and Don't add. 1–4 pick a
   reply from anywhere in the card. */
function AskCard({ uid, ask, onAnswer, onSkip }: { uid: string; ask: Ask; onAnswer: (value: string) => void; onSkip: () => void }) {
  const shown = ask.options.length > 4 ? ask.options.slice(0, 3) : ask.options
  const more = ask.options.length > 4 ? ask.options.slice(3) : []
  /* A reply's detail is said only where it tells two replies apart (two
     people of one name); otherwise it is the reply's tooltip. */
  const twice = (label: string) => ask.options.filter((o) => o.label === label).length > 1
  const qid = `${uid}-ask-${ask.id}`
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (!/^[1-4]$/.test(e.key) || target.closest('[role="combobox"], [role="listbox"]')) return
    const o = shown[Number(e.key) - 1]
    if (!o) return
    e.preventDefault()
    onAnswer(o.value)
  }
  return (
    <div className="bdsc__ask" role="group" aria-labelledby={qid} onKeyDown={onKey}>
      <p id={qid} className="bdsc__askq">
        {ask.question}
        {ask.order && <TipDot label="About order" text="Proposed model: first match wins" />}
      </p>
      {ask.detail && <p className="bdsc__askdetail">{ask.detail}</p>}
      <div className="bdsc__replies">
        {shown.map((o) => (
          <button key={o.value} type="button" className="bdsc__replychip" title={o.meta && !twice(o.label) ? o.meta : undefined} onClick={() => onAnswer(o.value)}>
            <span>{o.label}</span>
            {o.meta && twice(o.label) && <span className="bdsc__replymeta">{o.meta}</span>}
          </button>
        ))}
        {more.length > 0 && <Picker label={`More: ${ask.question}`} summary="More…" searchable value={null} options={more.map((o) => ({ value: o.value, label: o.label, meta: o.meta }))} onChange={onAnswer} />}
        {ask.canSkip && (
          <button type="button" className="bdsc__skip" onClick={onSkip}>
            {DONT_ADD}
          </button>
        )}
      </div>
    </div>
  )
}

/* The checks (describe spec, §3.7), collapsed to one row: how many sign-ins
   land as the text meant, how many differ, and a grey word for the ones it
   cannot tell. Opened, the rows as before — each a button that tries its
   sign-in on the board — and the What changes line under them. */
function ChecksRow({ uid, view, onTry }: { uid: string; view: ChecksView | null; onTry?: (facts: SignInFacts) => void }) {
  const [open, setOpen] = useState(false)
  const rows = view?.rows ?? []
  const cant = rows.filter((r) => r.decision === null).length
  const differs = rows.filter((r) => r.decision !== null && r.detail.startsWith('Expected ')).length
  const pass = rows.length - cant - differs
  const id = `${uid}-checks`
  return (
    <section className={`bdsc__checks${open ? ' is-open' : ''}`}>
      <button type="button" className="bdsc__checkshead" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="bdsc__checksword">Checks</span>
        <TipMark text="Through every policy on these applications" />
        <span className="u-sr-only">Through every policy on these applications.</span>
        <span className="bdsc__checkspills">
          {view === null ? (
            <span className="bdsc__checksnote">Choose an application</span>
          ) : (
            <>
              {pass > 0 && <span className="bdsc__pill">{pass} pass</span>}
              {differs > 0 && <span className="bdsc__pill is-differs">{differs} differ</span>}
              {cant > 0 && <span className="bdsc__checksnote">{`${cant} can't tell`}</span>}
            </>
          )}
        </span>
        <ChevronDown size={16} strokeWidth={2} className="bdsc__chev" aria-hidden />
      </button>
      <div id={id} role="region" aria-label="Checks" className="bdsc__region" inert={!open}>
        <div className="bdsc__regioninner">
          {view !== null && (
            <>
              {rows.length > 0 && (
                <ul className="bdsc__checklist">
                  {rows.map((row) => {
                    const cells = (
                      <>
                        <span className="bdsc__checkkind">{row.word}</span>
                        <span className="bdsc__checkbody">
                          <span className="bdsc__checkline" title={row.line}>
                            {row.line}
                          </span>
                          <span className="bdsc__checkdetail">{row.detail}</span>
                        </span>
                        {/* Keyed by the answer, so a changed one fades in. */}
                        <span className="bdsc__checkres" key={row.decision ?? `cant:${row.needs.join()}`}>
                          {row.decision ? (
                            <DecisionBadge decision={row.decision} />
                          ) : (
                            <>
                              <CantTell />
                              {row.needs.length > 0 && <TipMark text={`Needs: ${row.needs.join(', ')}`} />}
                            </>
                          )}
                        </span>
                      </>
                    )
                    return (
                      <li key={row.id}>
                        {onTry ? (
                          <button type="button" className="bdsc__check" aria-label={row.label} title={row.title} onClick={() => onTry(row.facts)}>
                            {cells}
                          </button>
                        ) : (
                          <div className="bdsc__check" aria-label={row.label} title={row.title} role="group">
                            {cells}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="bdsc__changes">
                <span className="bdsc__changesword">What changes</span>
                <span className="bdsc__changesline">{view.whatChanges}</span>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

const DECISIONS: PickerOption[] = (['1fa', '2fa', 'deny'] as AccessDecision[]).map((x) => ({ value: x, label: DECISION_WORDS[x] }))

/* One outcome: the decision, then the method for 2FA or the message for Deny. */
function OutcomeRow({ label, value, methods, onChange }: { label?: string; value: Outcome | null; methods: string[]; onChange: (o: Outcome) => void }) {
  return (
    <div className={`bdsc__outcome${label ? ' has-label' : ''}`}>
      {label && (
        <span className="bdsc__branchlabel" title={label}>
          {label}
        </span>
      )}
      <div className="bdsc__outcomectl">
        <Picker
          label={label ? `Decision, ${label}` : 'Decision'}
          width="fill"
          placeholder="Choose…"
          value={value?.decision ?? null}
          options={DECISIONS}
          onChange={(x) => {
            const decision = x as AccessDecision
            onChange({ decision, method: value && value.decision === decision ? value.method : null, message: decision === 'deny' ? (value?.message ?? null) : null })
          }}
        />
        {value?.decision === '2fa' && (
          <Picker
            label={label ? `Method, ${label}` : 'Method'}
            width="fill"
            value={value.method ?? '*'}
            options={[{ value: '*', label: 'Any enabled method' }, ...methods.map((m) => ({ value: m, label: m }))]}
            onChange={(m) => onChange({ ...value, method: m === '*' ? null : m })}
          />
        )}
        {value?.decision === 'deny' && <MessageField value={value.message} onCommit={(message) => onChange({ ...value, message })} />}
      </div>
    </div>
  )
}

/* A time, committed on blur or Enter — not on every digit, so neither the
   card nor the chip moves while it is typed. */
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (hhmm: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft && draft !== value) onCommit(draft)
    else setDraft(value)
  }
  return (
    <label className="bdsc__labelled">
      <span className="bdsc__minilabel">{label}</span>
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </label>
  )
}

/* Committed on blur or Enter, not per keystroke, so the card on the board
   does not rewrite itself under every letter. */
function MessageField({ value, onCommit }: { value: string | null; onCommit: (m: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  const id = useId()
  useEffect(() => setDraft(value ?? ''), [value])
  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim()
    if (next !== value) onCommit(next)
  }
  return (
    <Field label="Message" htmlFor={id}>
      <input
        id={id}
        type="text"
        maxLength={200}
        placeholder="Default message"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </Field>
  )
}
