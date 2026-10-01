import {
  AppWindow,
  ArrowRight,
  Building,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Gauge,
  Globe,
  House,
  Laptop,
  MonitorSmartphone,
  Network,
  UserRound,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import type { AccessDecision } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { FOCUSABLE } from '../../dialog-chrome'
import { Face } from '../../faces'
import { Button, SearchBox, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { PlatformMark } from '../../logos/PlatformMark'
import { useBrand } from '../../store'
import type { ColumnView } from '../board/try-sign-in'
import { AnchoredPopover } from './AnchoredPopover'
import type { Boundaries } from './boundaries'
import { DEVICE_ROWS, type RowsRead } from './rows-read'
import { SaveSignInForm } from './SaveSignInForm'
import { AddressRow, DetailRow, DistanceRow, PlaceRow, RiskRow, WhenRow } from './SignInFields'
import { deviceFactsOf, personOptions, withDetail, withDevice, withVersion, type FieldOption } from './sign-in-fields'
import { factsOf, originPatch, typedAddressPatch, type FormField, type FormIssue, type OriginPresetId, type SignInForm } from './sign-in-form'
import {
  CONNECTOR,
  TOKEN_LABEL,
  answerWords,
  appChoices,
  deviceChoiceOf,
  deviceChoices,
  deviceOfChoice,
  filterChoices,
  groupChoices,
  nextToken,
  originChoices,
  sentenceTokens,
  tokenDomId,
  tokenIssue,
  tokenName,
  tokenValue,
  verdictLabel,
  verdictParts,
  type MarkPlatform,
  type SentenceScope,
  type TokenIcon,
  type TokenId,
  type TokenMark,
  type TokenValue,
} from './sign-in-sentence'

/* -----------------------------------------------------------------------------
   The sign-in sentence: one sentence of pills (Policy testing V4, §2.2).

     [Arun Patel ▾] signs in to [GitHub Enterprise ▾] from [Office network ▾]
     on [Windows 11 laptop ▾] at [09:30 Mon ▾] with risk [12 ▾]

   On the board it is the top of the test panel in the right-hand column
   (`layout="panel"`, §2.4-bis), the verdict and the one why-line under it and
   Replay, Save sign-in and Close in the panel's header. On its own (`bar`)
   it is a card with the verdict and its buttons at the end of the line. Above
   the Sign-in tests People grid it is a bare line (`line`) that names nobody
   and no application: "Everyone signs in from [Office network ▾] …".

   The right-hand form it replaces stated every fact at once, in rows; this
   states the same sign-in as the sentence an admin would say, and only the
   facts a rule on the application reads get a pill (sign-in-sentence.ts has
   the rule and the words). Each pill is a button that hangs a small panel
   under itself — never a dialog over the canvas, so the chain the sign-in
   runs down stays in view while a fact is being changed.

   The panels reuse the rows the form was built from (SignInFields.tsx): the
   IP address, the place, the distance ruler, when, the device details and the
   risk score are the same controls, so the sentence and the form can never
   commit, word or validate a fact differently. The lists — people,
   applications, where from, devices — are the one thing new: a pick is one
   press, where a Picker's closed trigger inside a panel would be a second.

   Keys. A token is a button (`aria-haspopup="dialog"`, `aria-expanded`);
   Enter, Space or ArrowDown opens its panel. In a list the arrows move, Enter
   picks, and a pick closes the panel and puts focus back on the token. Escape
   closes without a change (AnchoredPopover). The panels are portalled, so the
   page's own Tab order would leave from the last control into nowhere: Tab
   from a panel's last control moves on to the next token instead, and
   Shift+Tab from its first comes back to its own.

   Colour. Tokens are neutral: `--ctl-bg`, a hairline, the value in ink. The
   token whose panel is open wears the accent — the rebrand's selection blue.
   Nothing on the sentence is green, amber or red but the verdict, which is a
   DecisionBadge; Depends and Can't tell are grey words, never a badge.

   The status region (what a run says aloud) is NOT here: it has to outlive
   the panel, so the board keeps it.
   -------------------------------------------------------------------------- */

type Patch = (p: Partial<SignInForm>, field: FormField) => void

/** Panel widths, in px: a list as wide as its longest name needs; a panel of fields the ruler's width. */
const PANEL_WIDTH: Record<TokenId, number> = {
  person: 320,
  app: 300,
  from: 360,
  device: 340,
  when: 360,
  risk: 360,
}

/** A long list gets a search first; four origins or eight devices do not. */
const SEARCH_FROM = 8

/** The row id of a field inside a token's panel: the token itself holds the field's own (`tokenDomId`). */
const panelFieldId = (idPrefix: string, field: FormField): string => `${idPrefix}-panel-${field}`

// --- The marks --------------------------------------------------------------------------

const TOKEN_ICON: Record<TokenIcon, LucideIcon> = {
  person: UserRound,
  app: AppWindow,
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

const ORIGIN_ICON: Record<OriginPresetId, LucideIcon> = { office: Building2, branch: Building, home: House, tor: VenetianMask }

const isMarkPlatform = (p: string | undefined): p is MarkPlatform => p === 'android' || p === 'ios' || p === 'windows' || p === 'macos'

function Mark({ mark }: { mark: TokenMark }) {
  switch (mark.kind) {
    case 'face':
      return <Face kind="user" name={mark.name} size="sm" decorative />
    case 'logo':
      return <AppLogo appId={mark.appId} name={mark.name} size={16} />
    case 'platform':
      return <PlatformMark platform={mark.platform} size={14} />
    case 'icon': {
      const Icon = TOKEN_ICON[mark.icon]
      return <Icon size={14} strokeWidth={1.9} />
    }
  }
}

// --- Focus -----------------------------------------------------------------------------------

/* The controls Tab visits, in order: FOCUSABLE, less anything taken out of
   the order — the roving options of a list keep one stop between them. */
function tabbables(el: Element | null): HTMLElement[] {
  if (!el) return []
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((c) => c.tabIndex >= 0)
}

/* Where a panel's focus starts: the search, or the option that is on (both
   marked `data-autofocus`), else the first field — not a row's info mark,
   which comes before its field. */
function startOf(box: HTMLElement): HTMLElement | null {
  const marked = box.querySelector<HTMLElement>('[data-autofocus]')
  if (marked) return marked.matches(FOCUSABLE) ? marked : (tabbables(marked)[0] ?? null)
  return box.querySelector<HTMLElement>('input:not([disabled])') ?? tabbables(box)[0] ?? null
}

// --- The sentence -------------------------------------------------------------------------

export function SignInSentence({
  form,
  onPatch,
  rows,
  issues,
  boundaries,
  scope,
  verdict,
  actions,
  why,
  idPrefix,
  layout = 'bar',
  only,
  lead,
  label = 'Sign-in',
  className,
  enter = false,
  marks = false,
  tips,
}: {
  form: SignInForm
  onPatch: Patch
  /** Which facts the rules on the application read: which tokens show, and what their panels hold. */
  rows: RowsRead
  issues: readonly FormIssue[]
  /** The edges each ruler prints. */
  boundaries: Boundaries
  /** Which applications and people the panels list (sign-in-sentence.ts, `boardScope` / `GLOBAL_SCOPE`). */
  scope: SentenceScope
  /** The answer at the end of the line: a `SentenceVerdict`. */
  verdict?: ReactNode
  /** The icon buttons after the verdict: `SentenceActions`. */
  actions?: ReactNode
  /** The one line under the sentence: the rule that decided, or what is needed. */
  why?: ReactNode
  /** Prefixes every id: a token's is its field's row id (`tokenDomId`), so a "Needs:" link finds it. */
  idPrefix: string
  /* `bar` is the sentence as a card of its own, its verdict and buttons at the
     end of the line. `panel` is the sentence inside the board's test panel
     (§2.4-bis): no card, no end cluster and no why-line of its own — the
     panel draws the verdict under it and the buttons in its header — and the
     pills wrap inside the panel's width. */
  layout?: 'bar' | 'panel' | 'line'
  /* `line` is the sentence as a line of its own on a page, with no card and
     nothing at its end: the People tab's "Everyone signs in from …", which
     names no person and no application (`only` leaves them out, `lead` says
     the words before the first pill). */
  /** Of the tokens the rows read, only these. */
  only?: readonly TokenId[]
  /** Words before the first token, as the connectors are: "Everyone signs in". */
  lead?: ReactNode
  /** The group's accessible name. */
  label?: string
  className?: string
  /* The Sign-in tests page's bar (§12.2), and only there: a token that
     arrives after the sentence is first drawn — the facts an application's
     rules read, as it is chosen — slides in (motion, 60 ms apart). Off, the
     sentence is drawn exactly as before. Pass false under reduced motion: the
     tokens are simply there. */
  enter?: boolean
  /** A token with an issue wears the error state, not only says it in its name (the page's bar). */
  marks?: boolean
  /** What reads each token's fact: a TipDot at the head of its popover (the bar's extra tokens). */
  tips?: Partial<Record<TokenId, string>>
}) {
  const { users, apps, zones } = useBrand()
  const tokens = sentenceTokens(rows).filter((t) => !only || only.includes(t))
  const ctx = useMemo(() => ({ people: users, apps, zones, rows }), [users, apps, zones, rows])
  const [open, setOpen] = useState<TokenId | null>(null)
  /* A token that has gone — the application changed and no rule reads the
     device now — takes its panel with it. */
  const current = open && tokens.includes(open) ? open : null
  const buttons = useRef(new Map<TokenId, HTMLButtonElement>())
  const end = useRef<HTMLDivElement | null>(null)
  /* The tokens as last drawn: one not among them is arriving, and slides in
     after those arriving before it. */
  const drawn = useRef<readonly TokenId[]>(tokens)
  const arriving = tokens.filter((t) => !drawn.current.includes(t))
  useEffect(() => {
    drawn.current = tokens
  })

  const close = useCallback(() => setOpen(null), [])

  /* Tab past a panel's last control: the next token, or — after the last one —
     the first control after the sentence: the bar's own cluster, or in the
     test panel whatever the page has next (its tabs). Focus moves before the
     panel closes, so a field it leaves commits on its own blur. */
  const after = (from: TokenId) => {
    const own = buttons.current.get(from)
    const all = tabbables(document.body)
    const at = own ? all.indexOf(own) : -1
    return at >= 0 ? all[at + 1] : undefined
  }
  const tabOn = (from: TokenId) => {
    const next = nextToken(tokens, from)
    const target = (next && buttons.current.get(next)) || tabbables(end.current)[0] || after(from) || buttons.current.get(from)
    target?.focus()
    setOpen(null)
  }
  const tabBack = (from: TokenId) => {
    buttons.current.get(from)?.focus()
    setOpen(null)
  }

  return (
    <div role="group" aria-label={label} className={`tsent${layout === 'bar' ? '' : ` is-${layout}`}${className ? ` ${className}` : ''}`}>
      <div className="tsent__main">
        <p className="tsent__line">
          {lead && <span className="tsent__word tsent__lead">{lead}</span>}
          {/* Each pill with the words before it, as one piece: the line wraps
              between "from Office network" and "on Windows 11 laptop", never
              between "on" and its device. */}
          {tokens.map((t) => {
            const pair = (
              <>
                {CONNECTOR[t] && <span className="tsent__word">{CONNECTOR[t]}</span>}
                <Token
                  token={t}
                  id={tokenDomId(idPrefix, t)}
                  value={tokenValue(t, form, ctx)}
                  issue={tokenIssue(t, issues)}
                  marked={marks}
                  tip={tips?.[t]}
                  open={current === t}
                  register={(el) => {
                    if (el) buttons.current.set(t, el)
                    else buttons.current.delete(t)
                  }}
                  onToggle={() => setOpen((o) => (o === t ? null : t))}
                  onOpen={() => setOpen(t)}
                  onClose={close}
                  onTabOn={() => tabOn(t)}
                  onTabBack={() => tabBack(t)}
                >
                  <SentenceTokenPanel
                    token={t}
                    form={form}
                    onPatch={onPatch}
                    rows={rows}
                    issues={issues}
                    boundaries={boundaries}
                    scope={scope}
                    idPrefix={idPrefix}
                    onPick={(p, field) => {
                      onPatch(p, field)
                      buttons.current.get(t)?.focus()
                      setOpen(null)
                    }}
                  />
                </Token>
              </>
            )
            if (!enter) {
              return (
                <span key={t} className="tsent__pair">
                  {pair}
                </span>
              )
            }
            const at = arriving.indexOf(t)
            return (
              <motion.span
                key={t}
                className="tsent__pair"
                initial={at >= 0 ? { opacity: 0, x: -8 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1], delay: Math.max(0, at) * 0.06 }}
              >
                {pair}
              </motion.span>
            )
          })}
        </p>
        {layout === 'bar' && (verdict || actions) && (
          <div ref={end} className="tsent__end">
            {verdict}
            {actions}
          </div>
        )}
      </div>
      {layout === 'bar' && why && <p className="tsent__why">{why}</p>}
    </div>
  )
}

// --- A token ---------------------------------------------------------------------------------

function Token({
  token,
  id,
  value,
  issue,
  marked = false,
  tip,
  open,
  register,
  onToggle,
  onOpen,
  onClose,
  onTabOn,
  onTabBack,
  children,
}: {
  token: TokenId
  id: string
  value: TokenValue
  issue?: string
  /** An issue is drawn on the token (the page's bar), not only said in its name. */
  marked?: boolean
  /** What reads the token's fact, at the head of its popover. */
  tip?: string
  open: boolean
  register: (el: HTMLButtonElement | null) => void
  onToggle: () => void
  onOpen: () => void
  onClose: () => void
  onTabOn: () => void
  onTabBack: () => void
  children: ReactNode
}) {
  const anchor = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  /* Closing from outside — a press elsewhere, Escape — commits what a field in
     the panel still holds: its blur is what commits it (SignInFields.tsx), and
     a panel unmounted around a focused box would drop the typing. */
  const close = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && panel.current?.contains(active)) active.blur()
    onClose()
  }

  /* The first control once the panel is placed and visible. A frame late on
     purpose: the popover is hidden until measured, and a hidden control takes
     no focus. */
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const box = panel.current
      if (!box || box.contains(document.activeElement)) return
      startOf(box)?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || e.defaultPrevented) return
    /* A Picker's list inside is portalled beside the panel, and its keys
       bubble here through React; that list routes its own Tab. */
    if (!e.currentTarget.contains(e.target as Node)) return
    const stops = tabbables(e.currentTarget)
    const at = stops.indexOf(e.target as HTMLElement)
    if (!e.shiftKey && at === stops.length - 1) {
      e.preventDefault()
      onTabOn()
    } else if (e.shiftKey && at === 0) {
      e.preventDefault()
      onTabBack()
    }
  }

  return (
    <>
      <button
        ref={(el) => {
          anchor.current = el
          register(el)
        }}
        id={id}
        type="button"
        className={`tsent__token is-${token}${open ? ' is-open' : ''}${value.unset ? ' is-unset' : ''}${marked && issue ? ' is-invalid' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tokenName(value, issue)}
        aria-invalid={marked && issue ? true : undefined}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <span className="tsent__mark" aria-hidden>
          <Mark mark={value.mark} />
        </span>
        <span className="tsent__value">{value.text}</span>
        <ChevronDown className="tsent__chev" size={12} strokeWidth={2.1} aria-hidden />
      </button>
      <AnchoredPopover anchor={anchor} open={open} onClose={close} label={TOKEN_LABEL[token]} width={PANEL_WIDTH[token]} focusFirst={false} className="tsent-pop">
        <div ref={panel} className="tsent-pop__body" onKeyDown={onPanelKey}>
          {tip && (
            <div className="tsent-pop__head">
              <span>{TOKEN_LABEL[token]}</span>
              <TipDot text={tip} label={`What reads ${TOKEN_LABEL[token].toLowerCase()}`} />
            </div>
          )}
          {children}
        </div>
      </AnchoredPopover>
    </>
  )
}

// --- What a token's panel holds ------------------------------------------------------------------

/* The body of a token's panel, on its own so it can be drawn without the
   popover around it (the tests, and any surface that states one fact inline).
   `onPick` is a choice from a list — it commits AND closes; `onPatch` is a
   field, which commits on its own pause, Enter or blur and leaves the panel
   open, so its error can be read beside it. */
export function SentenceTokenPanel({
  token,
  form,
  onPatch,
  onPick,
  rows,
  issues,
  boundaries,
  scope,
  idPrefix,
}: {
  token: TokenId
  form: SignInForm
  onPatch: Patch
  onPick: Patch
  rows: RowsRead
  issues: readonly FormIssue[]
  boundaries: Boundaries
  scope: SentenceScope
  idPrefix: string
}) {
  switch (token) {
    case 'person':
      return <PersonPanel form={form} scope={scope} onPick={onPick} />
    case 'app':
      return <AppPanel form={form} scope={scope} onPick={onPick} />
    case 'from':
      return <FromPanel form={form} rows={rows} issues={issues} boundaries={boundaries} idPrefix={idPrefix} onPatch={onPatch} onPick={onPick} />
    case 'device':
      return <DevicePanel form={form} rows={rows} onPatch={onPatch} onPick={onPick} />
    case 'when':
      return (
        <div className="tfields is-stacked tsent-pop__fields">
          <WhenRow id={panelFieldId(idPrefix, 'when')} form={form} rows={rows} boundaries={boundaries} size="sm" onPatch={onPatch} />
        </div>
      )
    case 'risk':
      return (
        <div className="tfields is-stacked tsent-pop__fields">
          <RiskRow id={panelFieldId(idPrefix, 'risk')} form={form} error={tokenIssue('risk', issues)} bands={boundaries.risk} onPatch={onPatch} />
        </div>
      )
  }
}

/* People: the policy's own first, under "In this policy", then everyone else
   under "Not in this policy" (`personOptions`); on the tenant's page, the
   directory as it stands. Faces, because a list of forty names is scanned by
   face before it is read. */
function PersonPanel({ form, scope, onPick }: { form: SignInForm; scope: SentenceScope; onPick: Patch }) {
  const { users, groups } = useBrand()
  const choices = useMemo(() => personOptions(users, groups, scope.audience ?? null), [users, groups, scope.audience])
  return (
    <ChoiceList
      label="Person"
      noun="people"
      choices={choices}
      value={form.personId}
      search
      art={(c) => <Face kind="user" name={c.label} size="sm" decorative />}
      onPick={(v) => onPick({ personId: v }, 'person')}
    />
  )
}

/* Applications: this policy's only (`appChoices`). A sign-in on an app the
   policy does not protect is the tenant's question, asked on Sign-in tests. */
function AppPanel({ form, scope, onPick }: { form: SignInForm; scope: SentenceScope; onPick: Patch }) {
  const { apps } = useBrand()
  const choices = useMemo<FieldOption[]>(() => {
    const { options, heading } = appChoices(scope, apps)
    return heading ? options.map((o) => ({ ...o, group: heading })) : options
  }, [scope, apps])
  return (
    <ChoiceList
      label="Application"
      noun="applications"
      choices={choices}
      value={form.appId}
      search={choices.length >= SEARCH_FROM}
      art={(c) => <AppLogo appId={c.value} name={c.label} size={16} />}
      onPick={(v) => onPick({ appId: v }, 'app')}
    />
  )
}

/* Where from: the four origins as one-press rows, then the address typed
   (it commits on a pause, Enter or leaving the box, the error beside it), then
   the place and the distance ruler — each only where a rule reads it. */
function FromPanel({
  form,
  rows,
  issues,
  boundaries,
  idPrefix,
  onPatch,
  onPick,
}: {
  form: SignInForm
  rows: RowsRead
  issues: readonly FormIssue[]
  boundaries: Boundaries
  idPrefix: string
  onPatch: Patch
  onPick: Patch
}) {
  const { zones } = useBrand()
  const facts = useMemo(() => factsOf(form, zones).facts, [form, zones])
  const choices = useMemo(() => originChoices(), [])
  return (
    <>
      <ChoiceList
        label="From"
        noun="origins"
        choices={choices}
        value={form.origin}
        art={(c) => {
          const Icon = ORIGIN_ICON[c.value as OriginPresetId]
          return <Icon size={14} strokeWidth={1.9} />
        }}
        onPick={(v) => onPick(originPatch(v as OriginPresetId), 'address')}
      />
      <div className="tfields is-stacked tsent-pop__fields">
        <AddressRow
          id={panelFieldId(idPrefix, 'address')}
          form={form}
          error={issues.find((i) => i.field === 'address')?.message}
          onCommit={(v) => onPatch(typedAddressPatch(v), 'address')}
        />
        {rows.rows.has('place') && <PlaceRow id={panelFieldId(idPrefix, 'place')} form={form} facts={facts} size="sm" onPatch={onPatch} />}
        {rows.rows.has('distance') && boundaries.distance && <DistanceRow form={form} ruler={boundaries.distance} onPatch={onPatch} />}
      </div>
    </>
  )
}

/* Devices: the presets with their platform marks, "Any device" first, then —
   behind Edit details — the details the profiles on this application check,
   in place. A device with a detail edited is a custom one; its panel opens
   with the details showing, since no preset row is on to say what it is. */
function DevicePanel({ form, rows, onPatch, onPick }: { form: SignInForm; rows: RowsRead; onPatch: Patch; onPick: Patch }) {
  const [details, setDetails] = useState(form.device.kind === 'custom')
  const choices = useMemo(() => deviceChoices(), [])
  const facts = deviceFactsOf(form.device)
  const shown = DEVICE_ROWS.filter((r) => rows.device.has(r))
  return (
    <>
      <ChoiceList
        label="Device"
        noun="devices"
        choices={choices}
        value={deviceChoiceOf(form.device)}
        art={(c) => {
          const platform = choices.find((x) => x.value === c.value)?.platform
          if (isMarkPlatform(platform)) return <PlatformMark platform={platform} size={14} />
          return platform ? <Laptop size={14} strokeWidth={1.9} /> : <MonitorSmartphone size={14} strokeWidth={1.9} />
        }}
        onPick={(v) => onPick({ device: deviceOfChoice(v) }, 'device')}
      />
      {shown.length > 0 && (
        <div className="tsent-pop__more">
          <Button variant="ghost" size="sm" onClick={() => setDetails((v) => !v)}>
            {details ? 'Hide details' : 'Edit details'}
          </Button>
          {details && (
            <div className="tfields is-stacked tsent-pop__fields">
              {shown.map((r) => (
                <DetailRow
                  key={r}
                  row={r}
                  facts={facts}
                  size="sm"
                  onSet={(v) => onPatch({ device: withDevice(withDetail(facts, r, v)) }, 'device')}
                  onVersion={(row, v) => onPatch({ device: withDevice(withVersion(facts, row, v)) }, 'device')}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// --- A list of choices -------------------------------------------------------------------------

/* One list for people, applications, origins and devices: a listbox of
   buttons with one Tab stop between them (the option that is on, else the
   first), the arrows, Home and End moving along it, Enter or a press picking.
   A search first where the list is long; ArrowDown from it goes into the list
   and Enter picks the first match. Headings where the rows change group, in
   the order given — the caller sorted it on purpose. */
function ChoiceList({
  label,
  noun,
  choices,
  value,
  search = false,
  art,
  onPick,
}: {
  label: string
  /** Plural, lower case: "people". */
  noun: string
  choices: readonly FieldOption[]
  value: string | null
  search?: boolean
  art: (c: FieldOption) => ReactNode
  onPick: (value: string) => void
}) {
  const id = useId()
  const [q, setQ] = useState('')
  const shown = filterChoices(choices, q)
  const on = shown.findIndex((c) => c.value === value)
  const [cursor, setCursor] = useState<number | null>(null)
  const stop = cursor !== null && cursor < shown.length ? cursor : Math.max(0, on)
  const list = useRef<HTMLDivElement | null>(null)

  const focusAt = (i: number) => {
    if (shown.length === 0) return
    const at = Math.max(0, Math.min(shown.length - 1, i))
    setCursor(at)
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[at]?.focus()
  }
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowDown: stop + 1, ArrowUp: stop - 1, Home: 0, End: shown.length - 1 }
    if (!(e.key in moves)) return
    e.preventDefault()
    focusAt(moves[e.key])
  }
  const onSearchKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusAt(Math.max(0, on))
    } else if (e.key === 'Enter' && shown[0]) {
      e.preventDefault()
      onPick(shown[0].value)
    }
  }

  let i = -1
  const option = (c: FieldOption) => {
    i += 1
    const at = i
    const picked = c.value === value
    const mark = art(c)
    return (
      <button
        key={c.value}
        type="button"
        role="option"
        aria-selected={picked}
        tabIndex={at === stop ? 0 : -1}
        data-autofocus={!search && at === stop ? true : undefined}
        className={`tsent-opt${picked ? ' is-on' : ''}`}
        onClick={() => onPick(c.value)}
        onFocus={() => setCursor(at)}
      >
        <span className="tsent-opt__tick" aria-hidden>
          {picked && <Check size={12} strokeWidth={3} />}
        </span>
        {mark && (
          <span className="tsent-opt__art" aria-hidden>
            {mark}
          </span>
        )}
        <span className="tsent-opt__text">
          <span className="tsent-opt__label">{c.label}</span>
          {c.meta && <span className="tsent-opt__meta">{c.meta}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className={`tsent-pick${search ? ' has-search' : ''}`}>
      {search && (
        <div className="tsent-pick__search" onKeyDown={onSearchKey} data-autofocus>
          <SearchBox
            block
            value={q}
            onChange={(v) => {
              setQ(v)
              setCursor(null)
            }}
            placeholder={`Search ${noun}`}
            label={`Search ${noun}`}
          />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="tsent-pick__empty" role="status">
          No {noun} match “{q.trim()}”
        </p>
      ) : (
        <div ref={list} role="listbox" aria-label={label} className="tsent-pick__list" onKeyDown={onListKey}>
          {groupChoices(shown).map((g, gi) =>
            g.heading ? (
              <div key={`${g.heading}-${gi}`} role="group" aria-labelledby={`${id}-g${gi}`} className="tsent-pick__group">
                <div id={`${id}-g${gi}`} className="tsent-pick__head" role="presentation">
                  {g.heading}
                </div>
                {g.items.map(option)}
              </div>
            ) : (
              <Fragment key={`none-${gi}`}>{g.items.map(option)}</Fragment>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// --- The verdict --------------------------------------------------------------------------------

/* The answer. One DecisionBadge — the right-hand column's, the version on
   the board — or, where that differs from what decides today, [left] → [right]
   with a quiet arrow: "Live Allow on 1 factor, Your edits Deny" said as one
   name. Depends and Can't tell are grey words, never a badge.

   `inline` sits at the end of the bar's sentence, each pill's column in its
   tooltip. `panel` is the test panel's verdict block (§2.4-bis): the column's
   name as a small caption over each answer ("Live", "Today", "Your edits"),
   the badge a size up, and the two versions as two mini columns with the
   arrow between — read top to bottom, left to right, in one look. */
export function SentenceVerdict({ columns, layout = 'inline' }: { columns: ColumnView[]; layout?: 'inline' | 'panel' }) {
  const { single, from, to } = verdictParts(columns)
  if (layout === 'panel') {
    if (single) {
      return (
        <div className="tsent-verdict is-panel">
          <PanelAnswer col={single} />
        </div>
      )
    }
    if (!from || !to) return null
    return (
      <div className="tsent-verdict is-panel is-two" role="img" aria-label={verdictLabel(columns)}>
        <PanelAnswer col={from} />
        <ArrowRight className="tsent-verdict__arrow" size={16} strokeWidth={2} aria-hidden />
        <PanelAnswer col={to} />
      </div>
    )
  }
  if (single) {
    return (
      <span className="tsent-verdict">
        <Answer col={single} />
      </span>
    )
  }
  if (!from || !to) return null
  return (
    <span className="tsent-verdict is-two" role="img" aria-label={verdictLabel(columns)}>
      <Answer col={from} />
      <ArrowRight className="tsent-verdict__arrow" size={14} strokeWidth={2} aria-hidden />
      <Answer col={to} />
    </span>
  )
}

function Answer({ col, big = false }: { col: ColumnView; big?: boolean }) {
  const body =
    col.status === 'decided' && col.decision ? (
      <DecisionBadge decision={col.decision} className={big ? 'tsent-verdict__big' : undefined} />
    ) : col.status === 'incomplete' ? (
      <CantTell />
    ) : (
      <span className="tsent-verdict__word">{answerWords(col)}</span>
    )
  return <Tip text={`${col.label} · ${col.tip}`}>{body}</Tip>
}

/* A column of the panel's verdict: its name over its answer. The tip says
   what the name means ("Decides sign-ins now"), as the inline pill's does. */
function PanelAnswer({ col }: { col: ColumnView }) {
  return (
    <span className="tsent-verdict__col">
      <span className="tsent-verdict__cap">{col.label}</span>
      <Answer col={col} big />
    </span>
  )
}

// --- Save sign-in ---------------------------------------------------------------------------------

/* Save sign-in, hung off the bookmark: the existing form (Name, Expected,
   Level), a weight quieter than Save policy — the one orange button on the
   board is that one. Saved sign-ins are the tenant's, not the policy's. */
export function SaveSignInPopover({
  anchor,
  open,
  onClose,
  form,
  shown,
}: {
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  form: SignInForm
  /** The decision on screen, or null for Can't tell: what Expected starts as. */
  shown: AccessDecision | null
}) {
  return (
    <AnchoredPopover anchor={anchor} open={open} onClose={onClose} label="Save sign-in" align="end" width={340} className="tsent-pop is-save">
      <SaveSignInForm form={form} shown={shown} emphasis="quiet" onClose={onClose} />
    </AnchoredPopover>
  )
}
