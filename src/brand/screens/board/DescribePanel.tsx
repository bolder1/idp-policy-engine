import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, CornerDownLeft, LogIn, X } from 'lucide-react'

import { Button, Field, IconButton, NumberStepper, TipDot, TipMark } from '../../kit'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { EmptyState } from '../../empty'
import { Picker, type PickerOption } from '../../picker'
import { AppLogo } from '../../logos/AppLogo'
import { EVERYONE, TIMEZONES, enforces, type AccessDecision, type Group, type User } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { RULE_METHODS } from '../../methods'
import { DAY_NAMES } from '../../create/describe-words'
import {
  ANSWER_ORDER,
  EXAMPLES,
  NOT_SET,
  TENANT_TIME_ZONE,
  answerOfChoice,
  applyChoice,
  audienceOfAnswers,
  branchLabel,
  branchesOf,
  compose,
  dictionaryOf,
  firstNeeding,
  lastRowOf,
  leaveOutAsked,
  openAfter,
  openChoices,
  readText,
  sentenceOf,
  signInMissing,
  summaryOf,
  type Answer,
  type AnswerKey,
  type BranchId,
  type Choice,
  type DescribeAnswers,
  type DescribeTenant,
  type DeviceAnswer,
  type NotAdded,
  type Origin,
  type Outcome,
  type Reading,
  type RiskAnswer,
  type Span,
  type WhenAnswer,
  type WhereAnswer,
} from '../../create/describe-model'
import type { ChecksView } from '../../create/describe-checks'
import type { SignInFacts } from '../sign-in-facts'
import { WhoPicker } from '../who-picker'
import type { DescribeState } from './describe-session'
import { Seg } from './Section'

/* -----------------------------------------------------------------------------
   Describe it: the panel.

   Two ways in, one panel (describe spec, §3). Type what the policy should do,
   or answer six questions — and either way the answers write ordinary cards
   onto the draft beside it, list what could not be used, and ask only where
   the tenant holds more than one fitting object.

   It sits in the inspector's slot, at the inspector's width and in its
   floating card, because it is the same kind of thing: a form about what is
   on the board. It saves nothing. The board's own "Save policy" does, and the
   status pill and its checks turn the policy on.

   Reading happens on Enter, the Read button or an example — never on a pause
   in typing — so nothing on the panel or the board moves while the admin
   types. Changing an answer by hand rewrites the text box from the answers
   (`sentenceOf`), so the two ways in never disagree about what was said.

   No framer-motion here: plain CSS, so nothing on the panel can be caught by
   the transform-fill trap the board's cards are careful about.
   -------------------------------------------------------------------------- */

const LABEL: Record<AnswerKey, string> = {
  apps: 'Applications',
  who: 'Who',
  leaveOut: 'Leave out',
  where: 'Where and when',
  devices: 'Devices',
  signIn: 'Sign-in',
  fallback: 'Nothing else matched',
}
const ACTION_LABEL: Record<NonNullable<NotAdded['action']>, string> = {
  'create-zone': 'Create zone',
  'device-profiles': 'Device profiles',
  'auth-methods': 'Authentication methods',
}

/* One origin for an answer drawn from two (Where and when, Devices and risk). */
function originOf(key: AnswerKey, a: DescribeAnswers): Origin {
  const all = (xs: Origin[]): Origin =>
    xs.includes('unset') ? 'unset' : xs.includes('text') ? 'text' : xs.includes('picked') ? 'picked' : 'default'
  switch (key) {
    case 'apps':
      return a.apps.origin
    case 'who':
      return a.who.origin
    case 'leaveOut':
      return a.leaveOut.origin
    case 'where':
      return all([a.where.origin, a.when.origin])
    case 'devices':
      return all([a.devices.origin, a.risk.origin])
    case 'signIn':
      return all([...branchesOf(a).map((b) => a.signIn[b]?.origin ?? 'unset'), ...a.more.map((m) => m.outcome.origin)])
    default:
      return a.fallback.origin
  }
}

/* The words an answer came from, when it came from the text. */
function traceOf(key: AnswerKey, a: DescribeAnswers): Span[] {
  const said = <T,>(x: Answer<T> | undefined) => (x && x.origin === 'text' ? x.spans : [])
  switch (key) {
    case 'apps':
      return said(a.apps)
    case 'who':
      return said(a.who)
    case 'leaveOut':
      return said(a.leaveOut)
    case 'where':
      return [...said(a.where), ...said(a.when)]
    case 'devices':
      return [...said(a.devices), ...said(a.risk)]
    case 'signIn':
      return [...branchesOf(a).flatMap((b) => said(a.signIn[b])), ...a.more.flatMap((m) => said(m.outcome))]
    default:
      return said(a.fallback)
  }
}

export function DescribePanel({
  tenant,
  policyId,
  state,
  onState,
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
  /** A new box or reading. `write` is true when the answers changed and the board should follow. */
  onState: (next: DescribeState, write: boolean) => void
  /** Done, ×, Esc: close and keep everything. */
  onDone: () => void
  /** A Not added row's way to fix it: a page of its own, behind the leave guard. */
  onGo: (to: NonNullable<NotAdded['action']>) => void
  /** A card was clicked on the board: open the answer it came from. */
  focus: { key: AnswerKey; n: number } | null
  /** A card is under the pointer: its answer's summary is bolded. */
  bold: AnswerKey | null
  /** The answer under the pointer, for the ring on the cards it wrote. */
  onTrace: (key: AnswerKey | null) => void
  /* The checks under the answers (describe spec, §3.7): the rows, or null
     while no application is chosen. Undefined draws no Checks at all — the
     edition's `draftChecks` is off. */
  checks?: ChecksView | null
  /** A check pressed: Try a sign-in on this draft, with its sign-in. */
  onTryCheck?: (facts: SignInFacts) => void
}) {
  const uid = useId()
  const dict = useMemo(() => dictionaryOf(tenant), [tenant])
  const r = state.reading
  const a = r.answers
  const open = openChoices(r)
  const [openKey, setOpenKey] = useState<AnswerKey | null>(() => firstNeeding(r, tenant))
  const [said, setSaid] = useState('')
  const box = useRef<HTMLTextAreaElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const composed = useMemo(() => compose(a, tenant), [a, tenant])
  const shown = ANSWER_ORDER.filter((k) => k !== 'leaveOut' || leaveOutAsked(a, tenant))
  const methods = RULE_METHODS.filter((m) => tenant.methods.find((x) => x.name === m)?.active !== false)

  useEffect(() => {
    if (box.current) box.current.focus()
    else heading.current?.focus()
  }, [])

  /* A card clicked on the board opens its answer and brings it into view. */
  useEffect(() => {
    if (!focus) return
    setOpenKey(focus.key)
    document.getElementById(`${uid}-h-${focus.key}`)?.scrollIntoView({ block: 'nearest' })
  }, [focus, uid])

  /* A card under the pointer brings its answer into view, bolded, without opening it. */
  useEffect(() => {
    if (bold) document.getElementById(`${uid}-h-${bold}`)?.scrollIntoView({ block: 'nearest' })
  }, [bold, uid])

  const read = (text: string) => {
    const reading = readText(text, dictionaryOf(tenant))
    onState({ text, reading }, true)
    setOpenKey(firstNeeding(reading, tenant))
    const notAdded = reading.notAdded.map((n) => `“${n.span.phrase}”`)
    const asks = openChoices(reading).map((c) => `“${c.span.phrase}”`)
    setSaid(['Read.', notAdded.length > 0 ? `Not added: ${notAdded.join(', ')}.` : '', asks.length > 0 ? `Choose: ${asks.join(', ')}.` : ''].filter(Boolean).join(' '))
  }

  /* Where focus goes when a pick takes away what held it — the question
     answered, or the whole answer closing under it: the next question in the
     answer still open, else that answer's header. `control` sends it to the
     answer's own list instead ("Another application" promises the
     Applications list), whatever held it. Set in `settle`, spent after the
     render that removed it. Left alone, focus falls to <body>, where the
     board's own keys (Delete, the arrows) act on the chain. */
  const refocus = useRef<{ key: AnswerKey; control?: boolean } | null>(null)
  useEffect(() => {
    const to = refocus.current
    if (!to) return
    refocus.current = null
    const region = document.getElementById(`${uid}-r-${to.key}`)
    if (to.control) {
      region?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
      return
    }
    const now = document.activeElement
    if (now && now !== document.body && !now.closest('[inert]')) return
    /* Still open: a list still showing (Applications takes several) keeps
       the keys — its trigger, whose Escape shuts the list and not the panel —
       else the next question, else the header. */
    const here = openKey === to.key ? region : null
    const list = here?.querySelector<HTMLElement>('[role="combobox"][aria-expanded="true"]')
    const question = here?.querySelector<HTMLElement>('.bdsc__q [tabindex="0"]')
    ;(list ?? question ?? document.getElementById(`${uid}-h-${to.key}`))?.focus()
  })

  /* An answer changed by hand. The box follows the answers — unless a question
     from the text is still open, when the text still carries it. The answer
     closes only when this filled its last missing value (`openAfter`). */
  const settle = (reading: Reading, from: AnswerKey, stay = false) => {
    const stillOpen = openChoices(reading).length > 0
    onState({ text: stillOpen ? state.text : sentenceOf(reading.answers, tenant), reading }, true)
    const next = openAfter(r, reading, from, openKey, tenant, stay)
    setOpenKey(next)
    refocus.current = { key: next ?? from }
  }
  const change = (answers: DescribeAnswers, from: AnswerKey, stay = false) => settle({ ...r, answers }, from, stay)
  const choose = (c: Choice, value: string) => {
    const next = applyChoice(r, c.id, value, dict)
    if (c.slot === 'apps' && value === '*') {
      onState({ ...state, reading: next }, false)
      setOpenKey('apps')
      refocus.current = { key: 'apps', control: true }
      return
    }
    settle(next, answerOfChoice(c))
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onDone()
    }
  }

  const choicesFor = (key: AnswerKey) => open.filter((c) => answerOfChoice(c) === key)

  /* 1–9 pick the Nth option of the answer's first open question, else of its
     first segmented control, from anywhere in the answer but a text field. */
  const quick = (key: AnswerKey, e: KeyboardEvent<HTMLElement>, firstSeg?: { values: string[]; pick: (v: string) => void }) => {
    const target = e.target as HTMLElement
    if (!/^[1-9]$/.test(e.key) || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="combobox"], [role="listbox"]')) return
    const n = Number(e.key) - 1
    const q = choicesFor(key)[0]
    if (q) {
      const o = q.options[n]
      if (o) {
        e.preventDefault()
        choose(q, o.value)
      }
      return
    }
    const v = firstSeg?.values[n]
    if (firstSeg && v !== undefined) {
      e.preventDefault()
      firstSeg.pick(v)
    }
  }

  // --- The answers ------------------------------------------------------------------

  const setWhere = (w: WhereAnswer, scopeSaid = a.scopeSaid) =>
    change({ ...a, where: { value: w, origin: w.mode !== 'anywhere' && !w.zoneId ? 'unset' : 'picked', spans: a.where.spans }, scopeSaid }, 'where')
  const setWhen = (w: WhenAnswer) => change({ ...a, when: { value: w, origin: 'picked', spans: a.when.spans } }, 'where')
  const setDevices = (d: DeviceAnswer) =>
    change({ ...a, devices: { value: d, origin: d.mode !== 'any' && !d.profileId ? 'unset' : 'picked', spans: a.devices.spans } }, 'devices')
  const setRisk = (x: RiskAnswer) => change({ ...a, risk: { value: x, origin: 'picked', spans: a.risk.spans } }, 'devices')
  /* Allow with 2FA and Deny each bring a control of their own — Method,
     Message — so the answer stays open for it. */
  const grows = (o: Outcome) => o.decision !== '1fa'
  const setBranch = (b: BranchId, o: Outcome) =>
    change({ ...a, signIn: { ...a.signIn, [b]: { value: o, origin: 'picked', spans: a.signIn[b]?.spans ?? [] } } }, 'signIn', grows(o))
  const setMore = (k: number, o: Outcome) =>
    change({ ...a, more: a.more.map((m, i) => (i === k ? { ...m, outcome: { value: o, origin: 'picked', spans: m.outcome.spans } } : m)) }, 'signIn', grows(o))

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
  const lastRow = lastRowOf(a, tenant)
  const notAdded = [...r.notAdded, ...composed.notAdded]

  const body = (key: AnswerKey): { node: ReactNode; firstSeg?: { values: string[]; pick: (v: string) => void } } => {
    switch (key) {
      case 'apps':
        return {
          node: (
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
                     admin's answer, not a gap for the policy's own to fill.
                     The list stays open for more, so the answer does too. */
                  change({ ...a, apps: { value: ordered, origin: 'picked', spans: ordered.length > 0 ? a.apps.spans : [] } }, 'apps', true)
                }}
              />
              {alsoCovers.map((line) => (
                <p key={line} className="bdsc__aside">
                  {line}
                </p>
              ))}
            </>
          ),
        }
      case 'who':
        return {
          node: (
            <WhoPicker
              compact
              label="Who"
              exceptions={false}
              who={a.who.value && a.who.value !== 'everyone' ? a.who.value : undefined}
              onChange={(next) =>
                change({ ...a, who: { value: next ? { groupIds: next.groupIds, userIds: next.userIds } : 'everyone', origin: 'picked', spans: a.who.spans } }, 'who')
              }
              audience={EVERYONE}
              directory={tenant.users as User[]}
              groups={tenant.groups as Group[]}
            />
          ),
        }
      case 'leaveOut':
        return {
          node: (
            <WhoPicker
              compact
              label="Leave out"
              emptyText="Nobody"
              placeholder="Add groups or people to leave out"
              exceptions={false}
              who={a.leaveOut.value ?? undefined}
              onChange={(next) =>
                change({ ...a, leaveOut: { value: next ? { groupIds: next.groupIds, userIds: next.userIds } : { groupIds: [], userIds: [] }, origin: 'picked', spans: a.leaveOut.spans } }, 'leaveOut')
              }
              audience={EVERYONE}
              directory={tenant.users as User[]}
              groups={tenant.groups as Group[]}
            />
          ),
        }
      case 'where': {
        const modes = [
          { value: 'anywhere' as const, label: 'Anywhere' },
          { value: 'only' as const, label: 'Only from' },
          ...(bands ? [] : [{ value: 'split' as const, label: 'Inside and outside' }]),
          { value: 'not' as const, label: 'Not from' },
        ]
        const pickMode = (mode: WhereAnswer['mode']) =>
          setWhere(mode === 'anywhere' ? { mode } : { mode, zoneId: w && w.mode !== 'anywhere' ? w.zoneId : '', scope: w && w.mode !== 'anywhere' ? w.scope : 'both' })
        return {
          firstSeg: { values: modes.map((m) => m.value), pick: (v) => pickMode(v as WhereAnswer['mode']) },
          node: (
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
                onChange={(m) =>
                  setWhen(m === 'any' ? { mode: 'any' } : { mode: 'between', from: '09:00', to: '18:00', days: wh.mode === 'days' ? wh.days : [], timeZone: TENANT_TIME_ZONE })
                }
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
                    <Picker
                      width="fill"
                      label="Time zone"
                      value={wh.timeZone}
                      options={TIMEZONES.map((z) => ({ value: z, label: z }))}
                      onChange={(timeZone) => setWhen({ ...wh, timeZone })}
                    />
                  )}
                </div>
              )}
            </>
          ),
        }
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
        return {
          firstSeg: { values: modes.map((m) => m.value), pick: (v) => pickMode(v as DeviceAnswer['mode']) },
          node: (
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
          ),
        }
      }
      case 'signIn':
        return {
          node: (
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
                <OutcomeRow key={`more:${k}`} label={m.span.phrase} value={m.outcome.value} methods={methods} onChange={(o) => setMore(k, o)} />
              ))}
            </div>
          ),
        }
      default:
        return {
          node:
            lastRow === 'not-reached' || lastRow === 'merged' ? null : (
              <>
                <OutcomeRow value={a.fallback.value} methods={methods} onChange={(o) => change({ ...a, fallback: { value: o, origin: 'picked', spans: a.fallback.spans } }, 'fallback', grows(o))} />
                {decidedElsewhere.map((line) => (
                  <p key={line} className="bdsc__aside">
                    {line}
                  </p>
                ))}
              </>
            ),
        }
    }
  }

  return (
    <aside className="bb__insp bdsc" aria-labelledby={`${uid}-title`} onKeyDown={onKey}>
      <div className="bb__inspbar bdsc__bar">
        <h2 id={`${uid}-title`} ref={heading} tabIndex={-1} className="bdsc__title">
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

      <div className="bb__inspbody bdsc__body">
        <div className="bdsc__textblock">
          <label htmlFor="bdsc-text" className="bdsc__label">
            Your text
          </label>
          <div className="bdsc__box">
            <textarea
              id="bdsc-text"
              ref={box}
              rows={2}
              maxLength={500}
              placeholder="Who, which applications, where or when, what happens"
              value={state.text}
              onChange={(e) => onState({ ...state, text: e.target.value }, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  read(state.text)
                }
              }}
            />
            <span className="bdsc__read">
              <IconButton icon={CornerDownLeft} size="sm" tone="ghost" label="Read (Enter)" onClick={() => read(state.text)} />
            </span>
          </div>
          <div className="bdsc__examples" role="group" aria-label="Examples">
            <span className="bdsc__minilabel">Examples</span>
            {EXAMPLES.map((ex) => (
              <Button key={ex.label} variant="ghost" size="sm" onClick={() => read(ex.text)}>
                {ex.label}
              </Button>
            ))}
          </div>
        </div>

        {notAdded.length > 0 && (
          <section className="bdsc__notadded" aria-labelledby={`${uid}-na`}>
            <h3 id={`${uid}-na`}>Not added</h3>
            <ul>
              {notAdded.map((n) => (
                <li key={`${n.span.start}:${n.span.phrase}:${n.reason}`}>
                  <span className="bdsc__phrase">“{n.span.phrase}”</span>
                  <span className="bdsc__why">{n.reason}</span>
                  {n.action && (
                    <Button variant="link" size="sm" onClick={() => onGo(n.action as NonNullable<NotAdded['action']>)}>
                      {ACTION_LABEL[n.action]}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="bdsc__answers">
          {shown.map((key) => {
            const isOpen = openKey === key
            const summary = summaryOf(key, a, tenant)
            /* A Sign-in with one branch of several undecided is not set either,
               though its summary names the branches that are. */
            const unset = summary === NOT_SET || (key === 'signIn' && signInMissing(a))
            const origin = originOf(key, a)
            /* The last row holding Sign-in's outcome took none of its own words. */
            const trace = key === 'fallback' && lastRow === 'merged' ? [] : traceOf(key, a)
            const { node, firstSeg } = body(key)
            const qs = choicesFor(key)
            return (
              <div key={key} className={`bdsc__answer${isOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  id={`${uid}-h-${key}`}
                  className="bdsc__head"
                  aria-expanded={isOpen}
                  aria-controls={`${uid}-r-${key}`}
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  onMouseEnter={() => onTrace(key)}
                  onMouseLeave={() => onTrace(null)}
                  onFocus={() => onTrace(key)}
                  onBlur={() => onTrace(null)}
                >
                  <span className="bdsc__headlabel">{LABEL[key]}</span>
                  <span className={`bdsc__summary${unset ? ' is-unset' : ''}${bold === key ? ' is-bold' : ''}`} title={summary}>
                    <span className="bdsc__value" key={summary}>
                      {summary}
                    </span>
                    {trace.length > 0 && <span className="bdsc__trace">From your text: “{trace.map((s) => s.phrase).join(' · ')}”</span>}
                  </span>
                  <span className="bdsc__headend">
                    {origin === 'default' && summary !== NOT_SET && <span className="bdsc__tag">Default</span>}
                    <ChevronDown size={16} strokeWidth={2} className="bdsc__chev" aria-hidden />
                  </span>
                </button>
                <div
                  id={`${uid}-r-${key}`}
                  role="region"
                  aria-labelledby={`${uid}-h-${key}`}
                  className="bdsc__region"
                  inert={!isOpen}
                  onKeyDown={(e) => quick(key, e, firstSeg)}
                >
                  <div className="bdsc__regioninner">
                    <div className="bdsc__controls">
                      {qs.map((c) => (
                        <ChoiceRow key={c.id} c={c} onPick={(v) => choose(c, v)} />
                      ))}
                      {node}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {checks !== undefined && <Checks uid={uid} view={checks} onTry={onTryCheck} />}

        <p role="status" className="u-sr-only">
          {said}
        </p>
      </div>

      {/* Buttons only: no sentence ever sits in a footer (owner, 26 Sep 2026).
          The inspector's own foot, so the two panels end alike. */}
      <div className="bb__inspfoot bdsc__foot">
        <Button variant="secondary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </aside>
  )
}

/* The checks (describe spec, §3.7): each row one sign-in and what the whole
   tenant decides for it with the draft on — the same thing Try a sign-in
   shows, so no count and no grade. The one number on the panel is in the
   What changes line under them. A row is one button: pressing it tries that
   sign-in on the board. Can't tell is grey text, never a badge, and the facts
   that would settle it are in the row's name as well as its mark. */
function Checks({ uid, view, onTry }: { uid: string; view: ChecksView | null; onTry?: (facts: SignInFacts) => void }) {
  return (
    <section className="bdsc__checks" aria-labelledby={`${uid}-ck`}>
      <h3 id={`${uid}-ck`} className="bdsc__checkshead">
        Checks
        <TipDot label="About checks" text="Through every policy on these applications" />
      </h3>
      {view === null ? (
        <EmptyState compact icon={LogIn} title="Choose an application" />
      ) : (
        <>
          {view.rows.length > 0 && (
            <ul className="bdsc__checklist">
              {view.rows.map((r) => {
                const cells = (
                  <>
                    <span className="bdsc__checkkind">{r.word}</span>
                    <span className="bdsc__checkbody">
                      <span className="bdsc__checkline" title={r.line}>
                        {r.line}
                      </span>
                      <span className="bdsc__checkdetail">{r.detail}</span>
                    </span>
                    {/* Keyed by the answer, so a changed one fades in. */}
                    <span className="bdsc__checkres" key={r.decision ?? `cant:${r.needs.join()}`}>
                      {r.decision ? (
                        <DecisionBadge decision={r.decision} />
                      ) : (
                        <>
                          <CantTell />
                          {r.needs.length > 0 && <TipMark text={`Needs: ${r.needs.join(', ')}`} />}
                        </>
                      )}
                    </span>
                  </>
                )
                return (
                  <li key={r.id}>
                    {onTry ? (
                      <button type="button" className="bdsc__check" aria-label={r.label} title={r.title} onClick={() => onTry(r.facts)}>
                        {cells}
                      </button>
                    ) : (
                      <div className="bdsc__check" aria-label={r.label} title={r.title} role="group">
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
    </section>
  )
}

/* A question from the text, with nothing picked: the phrase, then its options. */
function ChoiceRow({ c, onPick }: { c: Choice; onPick: (v: string) => void }) {
  const title = `“${c.span.phrase}”`
  return (
    <div className="bdsc__q">
      <p className="bdsc__qphrase">
        {title}
        {c.slot === 'order' && <TipDot label="About order" text="Proposed model: first match wins" />}
      </p>
      {c.detail && <p className="bdsc__qdetail">{c.detail}</p>}
      {c.options.length <= 3 ? (
        <Seg label={title} value={null} options={c.options.map((o) => ({ value: o.value, label: o.label, title: o.meta }))} onChange={onPick} />
      ) : (
        <Picker label={title} placeholder="Choose…" width="fill" value={null} options={c.options.map((o) => ({ value: o.value, label: o.label, meta: o.meta }))} onChange={onPick} />
      )}
    </div>
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

/* A time, committed on blur or Enter like the message below — not on every
   digit, so neither the card nor the box moves while it is typed. An empty or
   half-typed value commits nothing. */
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
