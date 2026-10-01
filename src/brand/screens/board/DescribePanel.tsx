import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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
import { answerAsk, asksOf, composerSends, corrected, followUps, skipChoice, turnView, type Ask, type BoardBody, type DescribeState, type TurnView } from './describe-session'
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
  /** A branch and its outcome: one line of the Then row's two columns. */
  branch?: boolean
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
          out.push({ id: b, body: <BranchBody label={label}>{body}</BranchBody>, name: `${label}, ${name}`, outcome: true, branch: true })
        }
      }
      a.more.forEach((m, k) => {
        if (!m.outcome.value) return
        const label = moreLabel(m, t)
        const { body, name } = outcomeBody(m.outcome.value)
        out.push({ id: `more:${k}`, body: <BranchBody label={label}>{body}</BranchBody>, name: `${label}, ${name}`, outcome: true, branch: true })
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

/* A branch and its outcome, in the Then row's two columns (describe.css
   `is-branches`): the words and their arrow in the first, which wraps if it
   must; the badge and its method in the second, so every badge starts at
   the same place and the outcomes read down one column. */
function BranchBody({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="bdsc__branch">
        <span className="bdsc__branchwords">{label}</span>
        <ArrowRight size={12} strokeWidth={2} className="bdsc__arrow" aria-hidden />
      </span>
      <span className="bdsc__branchout">{children}</span>
    </>
  )
}

/** One row of a reply: the chips of one answer, live or as a turn said it. */
interface ReplyRow {
  key: AnswerKey
  label: string
  chips: ChipSpec[]
  /** A later message said it again: what this turn said then, not a control. */
  past: boolean
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
  /* The follow-ups keep to one line, so the foot never grows over the
     thread: drawn all at first, measured, and the ones past the first line
     dropped before the paint. Shortest first, so the most fit. */
  const suggestRow = useRef<HTMLDivElement | null>(null)
  const suggestKey = suggestions.join('|')
  const [fit, setFit] = useState<{ key: string; n: number } | null>(null)
  const fits = fit?.key === suggestKey ? fit.n : suggestions.length
  useLayoutEffect(() => {
    const row = suggestRow.current
    if (!row || fit?.key === suggestKey) return
    const chips = [...row.querySelectorAll<HTMLElement>('.bdsc__suggestion')]
    const line = chips[0]?.offsetTop ?? 0
    setFit({ key: suggestKey, n: Math.max(1, chips.filter((c) => c.offsetTop === line).length) })
  }, [suggestKey, fit])

  /* Each turn's rows. Live ones read the answers as they now stand; a row a
     later message said again reads what this turn said then (`past`). */
  const rowsOf = useMemo(
    () =>
      views.map((v): ReplyRow[] =>
        v.keys
          .map((key) => {
            const past = v.past.includes(key)
            const from = past ? v.answers : a
            return { key, past, label: rowLabel(key, from), chips: chipsOf(key, from, tenant) }
          })
          .filter((row) => row.chips.length > 0),
      ),
    [views, a, tenant],
  )
  const rowId = (turnId: number, key: AnswerKey) => `${uid}-t${turnId}-${key}`
  /* The row an answer is changed from: the newest live one. A card on the
     board, hovered or clicked, points at it. */
  const ownerOf = (key: AnswerKey): string | null => {
    for (let i = turns.length - 1; i >= 0; i--) if (rowsOf[i]?.some((row) => row.key === key && !row.past)) return rowId(turns[i].id, key)
    return null
  }

  const box = useRef<HTMLTextAreaElement | null>(null)
  const thread = useRef<HTMLDivElement | null>(null)
  const [said, setSaid] = useState('')
  /* A chip's popover hangs from its ROW's chips, not the chip: taking the
     group you clicked out of Who removes that chip, and the popover stays
     open for the one you put in its place. */
  const [pop, setPop] = useState<{ key: AnswerKey; row: string; chip: string } | null>(null)
  const popAnchor = useRef<HTMLElement | null>(null)
  const popBody = useRef<HTMLDivElement | null>(null)
  /* The control last focused in the popover. A change can remove the
     control that had focus — "Any device" takes the profile Picker away — and
     focus would fall to <body>, where Escape reaches neither the popover nor
     the panel. It comes back here. (A Picker's own pick hands focus back to
     its trigger.) */
  const popFocus = useRef<HTMLElement | null>(null)
  const keepPopFocus = () =>
    window.requestAnimationFrame(() => {
      const at = document.activeElement
      if (at && at !== document.body && at.isConnected) return
      const home = popFocus.current?.isConnected ? popFocus.current : popBody.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')
      home?.focus({ preventScroll: true })
    })
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
    const top = (x: HTMLElement) => x.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    /* Its message at the top of the thread — unless the whole turn does not
       fit, when the end of the reply (its checks, or the change line with
       Undo) comes to the bottom instead: what the turn did, and the way to
       take it back, matter more than the words just typed. Never past an
       open question, which is the next thing to do. */
    const end = turn.querySelector<HTMLElement>('.bdsc__checks') ?? turn.querySelector<HTMLElement>('.bdsc__change')
    const ask = turn.querySelector<HTMLElement>('.bdsc__ask')
    let to = top(turn) - 12
    if (end) to = Math.max(to, top(end) + end.offsetHeight + 12 - el.clientHeight)
    if (ask) to = Math.min(to, top(ask) - 12)
    el.scrollTo({ top: Math.max(0, to), behavior: still ? 'auto' : 'smooth' })
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

  /* A card clicked on the board: the row it came from, brought into view and
     flashed. Read from a ref, so a click flashes once — not again whenever the
     thread redraws. */
  const owner = useRef(ownerOf)
  owner.current = ownerOf
  useEffect(() => {
    if (!focus) return
    const id = owner.current(focus.key)
    if (!id) return
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
    setFlash({ id, n: focus.n })
  }, [focus])

  /* A popover whose row went away — its answer is no longer said, or a later
     message said it again — closes, in the same render. */
  const popAlive = !!pop && turns.some((t, i) => rowId(t.id, pop.key) === pop.row && !!rowsOf[i]?.some((row) => row.key === pop.key && !row.past))
  if (pop && !popAlive) setPop(null)

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

  /* An answer changed. The text stays the admin's own words — a card's
     "From your text" quotes it — and a change made by hand (a chip's
     popover, or a gap a question filled that no words carry) is kept beside
     it (`corrected`), so the next follow-up, which reads the whole text
     again, keeps it too. A question the reader asked about the text's own
     words is answered again from them (`carryPicks`) and needs no keeping. */
  const settle = (reading: Reading, hand: boolean) => onState(hand ? corrected(state, reading) : { ...state, reading }, true)
  const change = (answers: DescribeAnswers) => settle({ ...r, answers }, true)
  const answer = (q: Ask, value: string) => {
    refocus.current = true
    settle(answerAsk(r, q.id, value, dict), q.id.startsWith('ask:'))
  }
  const skip = (q: Ask) => {
    refocus.current = true
    if (q.id.startsWith('ask:')) onState({ ...state, dismissed: [...state.dismissed, q.id] }, false)
    else settle(skipChoice(r, q.id, dict), false)
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
  /* Undo takes its own button away with the turn: focus goes to the
     composer, to say it again. After the first turn's the panel is gone
     and the board puts focus on the chooser (BoardBuilder). */
  const undoLatest = () => {
    setPop(null)
    onUndoTurn()
    window.requestAnimationFrame(() => {
      const el = box.current
      if (el?.isConnected && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    })
  }

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

  const openPop = (key: AnswerKey, row: string, chip: string, el: HTMLElement) => {
    if (pop?.row === row && pop.chip === chip) {
      setPop(null)
      return
    }
    popAnchor.current = el.closest<HTMLElement>('.bdsc__chips') ?? el
    setPop({ key, row, chip })
  }
  /* Where Escape hands focus back: the chip that opened it, or — gone — its row's first. */
  const popHome = () => {
    const chips = popAnchor.current
    if (!chips || !pop) return
    ;(chips.querySelector<HTMLElement>(`[data-chip="${CSS.escape(pop.chip)}"]`) ?? chips.querySelector<HTMLElement>('button'))?.focus()
  }

  // --- The thread ------------------------------------------------------------------------

  const reply = (i: number, view: TurnView) => {
    const turn = turns[i]
    const rows = rowsOf[i] ?? []
    const fixes = [...new Set(view.notAdded.flatMap((n) => (n.action ? [n.action] : [])))]
    const boldRow = bold ? ownerOf(bold) : null
    return (
      <div className="bdsc__reply">
        {rows.length > 0 && <p className="bdsc__understood">Understood</p>}
        {rows.length > 0 && (
          <div className="bdsc__rows">
            {rows.map(({ key, label, chips, past }) => {
              const id = rowId(turn.id, key)
              const flashing = flash?.id === id ? ` is-flash${flash.n % 2}` : ''
              const art = (c: ChipSpec) => (
                <>
                  {c.art && <span className="bdsc__chipart">{c.art}</span>}
                  <span className="bdsc__chipbody">{c.body}</span>
                </>
              )
              const chipClass = (c: ChipSpec) => `bdsc__chip${c.muted ? ' is-muted' : ''}${c.outcome ? ' is-outcome' : ''}`
              return (
                <div
                  key={key}
                  id={id}
                  className={`bdsc__row${past ? ' is-past' : ''}${boldRow === id ? ' is-bold' : ''}${flashing}`}
                  title={past ? 'Changed in a later message' : undefined}
                  onMouseEnter={past ? undefined : () => onTrace(key)}
                  onMouseLeave={past ? undefined : () => onTrace(null)}
                >
                  <span className="bdsc__rowlabel">{label}</span>
                  <span className={`bdsc__chips${chips.some((c) => c.branch) ? ' is-branches' : ''}`}>
                    {chips.map((c) => {
                      /* Said again later: what this turn said, as words, not a control. */
                      if (past)
                        return (
                          <span key={c.id} className={`${chipClass(c)} is-past`}>
                            {art(c)}
                          </span>
                        )
                      const open = pop?.row === id && pop.chip === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`${chipClass(c)}${open ? ' is-open' : ''}`}
                          aria-label={`${label}: ${c.name}`}
                          aria-haspopup="dialog"
                          aria-expanded={open}
                          data-chip={c.id}
                          onClick={(e) => openPop(key, id, c.id, e.currentTarget)}
                          onFocus={() => onTrace(key)}
                          onBlur={() => onTrace(null)}
                        >
                          {art(c)}
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
          <span className="bdsc__changeline">
            <Parts text={view.change} />
          </span>
          {view.latest && (
            <Button variant="ghost" size="sm" icon={Undo2} onClick={undoLatest}>
              Undo
            </Button>
          )}
        </p>

        {/* Only once there is something to check: while no application is
            chosen, the question card is already asking for one. */}
        {view.latest && checks && <ChecksRow uid={uid} view={checks} onTry={onTryCheck} />}
      </div>
    )
  }

  const rewriting = state.rewrite !== null && state.rewrite < turns.length
  const hasText = state.box.trim().length > 0

  return (
    /* Focusable from a click only: a click on its words keeps focus in the
       panel — not on <body>, where the board's keys act and Escape would
       not reach it. */
    <aside className="bdsc" aria-labelledby={`${uid}-title`} tabIndex={-1} onKeyDown={onKey}>
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
          <div className="bdsc__suggest" role="group" aria-label="Suggestions" ref={suggestRow}>
            {suggestions.slice(0, fits).map((s) => (
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
                if (composerSends({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) {
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

      {pop && popAlive && (
        <AnchoredPopover anchor={popAnchor} open onClose={() => setPop(null)} label={ROW[pop.key]} width={360} className="bdsc-pop">
          <p className="bdsc-pop__title">{rowLabel(pop.key, a)}</p>
          {/* Escape shuts an open list first; with none open it shuts the
              popover and goes back to the chip. The Picker's trigger stops
              every Escape, open or not, so the popover has to take it first. */}
          <div
            ref={popBody}
            className="bdsc-pop__body"
            onFocusCapture={(e) => {
              if (e.currentTarget.contains(e.target as Node)) popFocus.current = e.target as HTMLElement
            }}
            onClick={keepPopFocus}
            onKeyDownCapture={(e) => {
              if (e.key !== 'Escape') return
              const t = e.target as HTMLElement
              if (t.closest('[aria-expanded="true"]') || document.querySelector('.bx-picker__pop')) return
              e.preventDefault()
              e.stopPropagation()
              popHome()
              setPop(null)
            }}
          >
            {body(pop.key)}
          </div>
        </AnchoredPopover>
      )}
    </aside>
  )
}

/* A line of parts joined by " · " — the change line, What changes — that
   wraps between its parts, never inside one, so a count stays with its
   words. Each part leads with its separator, the first with an empty one
   kept from the screen reader, and the one that would open a wrapped line
   is clipped: no line starts or ends with "·". */
function Parts({ text }: { text: string }) {
  return (
    <span className="bdsc__parts">
      <span className="bdsc__partsrow">
        {text.split(' · ').map((part, k) => (
          <span key={`${k}:${part}`} className="bdsc__part">
            <span className="bdsc__sep" aria-hidden={k === 0 || undefined}>
              {k > 0 && ' · '}
            </span>
            {part}
          </span>
        ))}
      </span>
    </span>
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
   sign-in on the board — and the What changes line under them. Drawn only
   once there is an application to check on. */
function ChecksRow({ uid, view, onTry }: { uid: string; view: ChecksView; onTry?: (facts: SignInFacts) => void }) {
  const [open, setOpen] = useState(false)
  const rows = view.rows
  const cant = rows.filter((r) => r.decision === null).length
  const differs = rows.filter((r) => r.decision !== null && r.detail.startsWith('Expected ')).length
  const pass = rows.length - cant - differs
  const id = `${uid}-checks`
  /* What every row shares is said here once, not on each row. */
  const tip = [view.shared, 'Through every policy on these applications'].filter(Boolean).join('. ')
  return (
    <section className={`bdsc__checks${open ? ' is-open' : ''}`}>
      <button type="button" className="bdsc__checkshead" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="bdsc__checksword">Checks</span>
        <TipMark text={tip} />
        <span className="u-sr-only">{tip}.</span>
        <span className="bdsc__checkspills">
          {pass > 0 && <span className="bdsc__pill">{pass} pass</span>}
          {differs > 0 && <span className="bdsc__pill is-differs">{differs} differ</span>}
          {cant > 0 && <span className="bdsc__checksnote">{`${cant} can't tell`}</span>}
        </span>
        <ChevronDown size={16} strokeWidth={2} className="bdsc__chev" aria-hidden />
      </button>
      <div id={id} role="region" aria-label="Checks" className="bdsc__region" inert={!open}>
        <div className="bdsc__regioninner">
          {rows.length > 0 && (
            <ul className="bdsc__checklist">
              {rows.map((row) => {
                const cells = (
                  <>
                    <span className="bdsc__checkkind">{row.word}</span>
                    <span className="bdsc__checkbody">
                      <span className="bdsc__checkline" title={row.full ?? row.line}>
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
            <span className="bdsc__changesline">
              <Parts text={view.whatChanges} />
            </span>
          </p>
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
