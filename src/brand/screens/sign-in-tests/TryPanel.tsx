import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import {
  AppWindow,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Clock,
  Gauge,
  Globe,
  LayoutTemplate,
  MapPin,
  MonitorSmartphone,
  Play,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import type { AccessDecision } from '../../data'
import { DecisionBadge } from '../../decision-badge'
import { FOCUSABLE } from '../../dialog-chrome'
import { Button, SearchBox, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { Picker, type PickerOption } from '../../picker'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { AnchoredPopover } from '../testing/AnchoredPopover'
import type { Boundaries } from '../testing/boundaries'
import type { RowsRead } from '../testing/rows-read'
import type { FormField, FormIssue, SignInForm } from '../testing/sign-in-form'
import { GLOBAL_SCOPE, TOKEN_LABEL, appChoices, tokenDomId, tokenIssue, tokenName, tokenValue, type SentenceScope, type TokenId } from '../testing/sign-in-sentence'
import { SaveSignInPopover, SentenceTokenPanel } from '../testing/SignInSentence'
import { PANEL_ID, PANEL_SLIDE, factTokens } from './sign-in-card'
import { IdentityField } from './IdentityField'
import { ValueMark } from './SignInCard'
/* The condition row's frame, worn by the fact rows: the board may not have
   loaded it yet. */
import '../condition-popover.css'
import { SAVED_SIGN_INS } from './phase'

/* -----------------------------------------------------------------------------
   The sign-in, as the policy builder's right-hand panel (TESTING-V4 §14.2).

     ┌ Check access ─────────────────────── >< ┐
     │ 👥 Identity                              │
     │ │ Identity type  [User ▾]                │
     │ │ User           [👤 User  MI Maya Iyer ✎]│
     │ │ Member of [Engineering] [Finance]      │
     │ ▭ Application                            │
     │ │ [GitHub Enterprise ▾]                  │
     │ ⌖ Sign-in conditions                     │
     │ │ [🌐 Network ⓘ | Office network ▾]      │
     │ │ [🖥 Device  ⓘ | Windows 11 laptop ▾]   │
     ├──────────────────────────────────────────┤
     │                                  [▶ Run] │
     └──────────────────────────────────────────┘

   Entra's What If, in order (owner, 1 Oct 2026): Identity — the identity
   type, User or Group, and then the one chosen, from the policy builder's
   own list of users and groups (IdentityField.tsx) — then Application, then
   Sign-in conditions (it was "Where and on what"). Saved sign-ins, and with
   them Use a saved sign-in and Save sign-in, are a later phase (phase.ts).

   The rule Inspector's own chrome and grammar, so the page reads as the
   builder used for tests: the floating card (`.bb__insp`), its header row,
   the scrolling body and the sticky foot; each section a heading with its
   mark, and what answers it indented against a guide rule (`.bb__sec`);
   Person and Application are the Then section's field shape, a Picker the
   panel's width (`.bb__thenfield`) — the heading names it, so no label over
   it says the same word again; each fact is a condition row's frame
   (`.cp__stack`): what is stated on the left, its value on the right, which
   opens the same panel a sentence token opens (SentenceTokenPanel), so the
   controls that state a fact are the ones every testing surface uses.

   Only the facts the chosen application's rules read are asked, each already
   filled in (sign-in-card.ts, `withDefaults`), each with a TipDot naming the
   policy and rules that read it. They slide in, 60 ms apart, as the
   application is chosen (motion; drawn at once under reduced motion).

   Run is the page's one orange button, in the foot where the Inspector keeps
   Save rule. Never disabled: pressed with a person or an application missing,
   that row says why under it and takes the focus. Save sign-in, secondary,
   joins it once there is a run to save.

   Shut until it is asked for (owner, 30 Sep: "the right side thing is very
   permanent"): the bar's Try a sign-in, the person node, Choose a person and
   Add open it; Run, a saved sign-in, its X and Escape shut it. It slides in
   from its edge and out again by motion props (`.bb__insp`'s own CSS
   animation is off for it, sign-in-tests.css), under AnimatePresence in the
   page; on its way out it is inert, so nothing in it takes the focus or a
   press. Its width is the track's, held while the track closes under it.
   Reduced motion: there, and gone, at once.

   The panel only draws; the page (SignInTests.tsx) owns the sign-in and what
   Run and a change do.

   The same panel inside a policy, the builder's Check access (owner, 1 Oct
   2026; board/PolicyCheck.tsx owns it there): `scope` limits it to the
   policy — its applications only, every one "As if on" for a draft with
   none, its people first — and Use a saved sign-in lists that policy's
   saved sign-ins, the row left out where there are none.
   -------------------------------------------------------------------------- */

export interface TryPanelProps {
  /** "Sign-in", or the saved sign-in's name while one is loaded and unchanged. */
  title: string
  form: SignInForm
  rows: RowsRead
  /** What stops a run, under its row. */
  issues: readonly FormIssue[]
  boundaries: Boundaries
  /** What reads each fact (sign-in-card.ts `tokenTips`). */
  tips: Partial<Record<TokenId, string>>
  reduced: boolean
  /** A group was chosen in the Person picker (§13.3): its id. */
  asGroup: string | null
  /** A pick in the Person picker: a person's id, or `group:<id>`. */
  onPerson: (value: string) => void
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  onRun: () => void
  saved: readonly SavedSignIn[]
  onUseSaved: (s: SavedSignIn) => void
  /** The Saved sign-ins picker, opened from the panel's own row. */
  savedOpen: boolean
  onSavedOpen: (open: boolean) => void
  /** The run on the canvas, for Save sign-in: null before the first run of the visit. */
  ran: { form: SignInForm; shown: AccessDecision | null } | null
  saveOpen: boolean
  onSaveOpen: (open: boolean) => void
  /** The panel at its full width, and the way to change that (the Inspector's ><). */
  wide: boolean
  onToggleWidth: () => void
  /** The X: the panel shuts (the page's Escape does the same). */
  onClose: () => void
  /* Who and what may be chosen. The page's: everybody, every application.
     A policy's, in the builder's Check access (`boardScope`): its
     applications only — every one "As if on" for a draft with none — and
     its people first, under In this policy. */
  scope?: SentenceScope
}

/** The panel's slide, in and out: every panel of the page's (sign-in-card.ts). */
const SLIDE = PANEL_SLIDE

/** Popover widths for each fact's panel, in px: the sentence's own. */
const FACT_WIDTH: Partial<Record<TokenId, number>> = { from: 360, device: 340, when: 360, risk: 360 }

/** What each fact row names on its left, and its mark. */
const FACT: Partial<Record<TokenId, { label: string; icon: LucideIcon }>> = {
  from: { label: 'Network', icon: Globe },
  device: { label: 'Device', icon: MonitorSmartphone },
  when: { label: 'Time', icon: Clock },
  risk: { label: 'Risk score', icon: Gauge },
}

export function TryPanel(props: TryPanelProps) {
  const { title, form, rows, issues, boundaries, tips, reduced, asGroup, onPerson, onPatch, onRun, saved, onUseSaved, savedOpen, onSavedOpen } = props
  const { ran, saveOpen, onSaveOpen, wide, onToggleWidth, onClose, scope = GLOBAL_SCOPE } = props
  /* On its way out (AnimatePresence): inert, so it keeps no focus and takes no press. */
  const present = useIsPresent()
  const { users, groups, apps } = useBrand()
  const savedRow = useRef<HTMLButtonElement | null>(null)
  const saveAnchor = useRef<HTMLSpanElement | null>(null)
  const heading = useId()

  const audience = scope.audience ?? null
  const appOptions = useMemo<PickerOption[]>(() => {
    const { options, heading: asIf } = appChoices(scope, apps)
    return options.map((o) => ({ ...o, art: <AppLogo appId={o.value} name={o.label} size={16} />, ...(asIf ? { group: asIf } : null) }))
  }, [scope, apps])
  /* No saved sign-in to offer (a policy's applications have none): no row that opens an empty list. */
  const anySaved = saved.some((s) => !s.generated)
  const personIssue = tokenIssue('person', issues)
  const appIssue = tokenIssue('app', issues)
  const facts = factTokens(form, rows)

  /* The facts as last drawn: one not among them is arriving, and slides in
     after those arriving before it. */
  const drawn = useRef<readonly TokenId[]>(facts)
  const arriving = facts.filter((t) => !drawn.current.includes(t))
  useEffect(() => {
    drawn.current = facts
  })

  return (
    <motion.aside
      className="bb__insp sit-panel"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule">
        <h2 id={heading} className="sit-panel__title" title={title}>
          {title}
        </h2>
        <button
          type="button"
          className="bb__act"
          aria-label={wide ? 'Narrow the panel' : 'Widen the panel'}
          title={wide ? 'Narrow' : 'Widen'}
          onClick={onToggleWidth}
        >
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="bb__inspbody">
        {/* A saved sign-in is a template for the form: loading one fills it
            and runs. A later phase (phase.ts): left out until then. */}
        {SAVED_SIGN_INS && anySaved && (
          <>
            <button
              ref={savedRow}
              type="button"
              className={`sit-panel__saved${savedOpen ? ' is-on' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={savedOpen}
              onClick={() => onSavedOpen(!savedOpen)}
            >
              <LayoutTemplate size={14} strokeWidth={2} aria-hidden />
              <span>Use a saved sign-in</span>
              <ChevronRight size={14} strokeWidth={2} aria-hidden />
            </button>
            <SavedPicker
              anchor={savedRow}
              open={savedOpen}
              saved={saved}
              align="start"
              onClose={() => {
                onSavedOpen(false)
                savedRow.current?.focus()
              }}
              onPick={(s) => {
                onSavedOpen(false)
                onUseSaved(s)
              }}
            />
          </>
        )}

        <PanelSection id="identity" title="Identity" icon={Users}>
          <IdentityField
            users={users}
            groups={groups}
            personId={form.personId}
            asGroup={asGroup}
            audience={audience}
            domId={tokenDomId(PANEL_ID, 'person')}
            error={personIssue && <RowError text={personIssue} />}
            onPick={onPerson}
          />
        </PanelSection>

        <PanelSection id="app" title="Application" icon={AppWindow}>
          <div className="bb__thenfield" id={tokenDomId(PANEL_ID, 'app')}>
            <Picker
              label="Application"
              width="fill"
              value={form.appId}
              options={appOptions}
              onChange={(v) => onPatch({ appId: v }, 'app')}
              placeholder="Choose an application"
              searchable
              noun="applications"
              listClassName="sit-picklist"
              invalid={!!appIssue}
            />
            {appIssue && <RowError text={appIssue} />}
          </div>
        </PanelSection>

        {facts.length > 0 && (
          <PanelSection id="where" title="Sign-in conditions" icon={MapPin}>
            <div className="sit-facts">
              {facts.map((t) => {
                const at = arriving.indexOf(t)
                return (
                  <motion.div
                    key={t}
                    className="sit-fact"
                    initial={!reduced && at >= 0 ? { opacity: 0, y: -6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.2, 0, 0, 1], delay: Math.max(0, at) * 0.06 }}
                  >
                    <FactRow token={t} form={form} rows={rows} issues={issues} boundaries={boundaries} tip={tips[t]} scope={scope} onPatch={onPatch} />
                  </motion.div>
                )
              })}
            </div>
          </PanelSection>
        )}
      </div>

      <div className="bb__inspfoot sit-panel__foot">
        {SAVED_SIGN_INS && ran && (
          <>
            <span ref={saveAnchor} className="sit-panel__savewrap">
              <button
                type="button"
                className={`bx-btn bx-btn--neutral bx-btn--sm${saveOpen ? ' is-on' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={saveOpen}
                onClick={() => onSaveOpen(!saveOpen)}
              >
                <BookmarkPlus size={13} strokeWidth={2} aria-hidden />
                Save sign-in
              </button>
            </span>
            <SaveSignInPopover
              anchor={saveAnchor}
              open={saveOpen}
              onClose={() => {
                onSaveOpen(false)
                saveAnchor.current?.querySelector<HTMLElement>('button')?.focus()
              }}
              form={ran.form}
              shown={ran.shown}
            />
          </>
        )}
        <Button variant="brand" size="sm" icon={Play} keys="Control+Enter Meta+Enter" onClick={onRun}>
          Run
        </Button>
      </div>
    </motion.aside>
  )
}

/* A section, in the Inspector's grammar (Inspector.tsx `Section`): a heading
   with its mark, and what answers it set in against a guide rule. */
function PanelSection({ id, title, icon: Icon, children }: { id: string; title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="bb__sec" aria-labelledby={`sit-sec-${id}`}>
      <div className="bb__sec__head">
        <h3 id={`sit-sec-${id}`}>
          <Icon size={15} strokeWidth={2} aria-hidden />
          {title}
        </h3>
      </div>
      <div className="bb__sec__body">{children}</div>
    </section>
  )
}

/** Why a run did not start, under the row it is about — the Inspector's own error line. */
function RowError({ text }: { text: string }) {
  return (
    <p className="bb__diag is-error" role="alert">
      <XCircle size={13} strokeWidth={2} aria-hidden />
      <span>{text}</span>
    </p>
  )
}

/* Where a fact's panel puts the focus: its search, or the option that is on
   (both marked `data-autofocus`), else its first field — the sentence token's
   own rule (SignInSentence.tsx), so the two open the same way. */
function startOf(box: HTMLElement): HTMLElement | null {
  const marked = box.querySelector<HTMLElement>('[data-autofocus]')
  if (marked) return marked.matches(FOCUSABLE) ? marked : marked.querySelector<HTMLElement>(FOCUSABLE)
  return box.querySelector<HTMLElement>('input:not([disabled])') ?? box.querySelector<HTMLElement>(FOCUSABLE)
}

/* One fact, as a condition row: [mark What ⓘ | value ▾]. The value opens the
   fact's panel under it; a choice from a list closes it, a typed field keeps
   it open so its error can be read beside it. */
function FactRow({
  token,
  form,
  rows,
  issues,
  boundaries,
  tip,
  scope,
  onPatch,
}: {
  token: TokenId
  form: SignInForm
  rows: RowsRead
  issues: readonly FormIssue[]
  boundaries: Boundaries
  tip?: string
  scope: SentenceScope
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
}) {
  const { users, apps, zones } = useBrand()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  const value = tokenValue(token, form, { people: users, apps, zones, rows })
  const issue = tokenIssue(token, issues)
  const fact = FACT[token] ?? { label: TOKEN_LABEL[token], icon: Globe }
  const Icon = fact.icon

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const box = body.current
      if (!box || box.contains(document.activeElement)) return
      startOf(box)?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  /* Closing from outside commits what a field in the panel still holds: its
     blur is what commits it. */
  const close = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && body.current?.contains(active)) active.blur()
    setOpen(false)
  }

  return (
    <>
      <div className="cp__stackline">
        <div className={`cp__stack${issue ? ' is-unset' : ''}`}>
          <div className="cp__stackrow">
            <span className="cp__fld is-what sit-fact__what">
              <Icon size={14} strokeWidth={1.9} className="cp__fldicon" aria-hidden />
              <span className="cp__fldtext">{fact.label}</span>
              {tip && <TipDot text={tip} label={`What reads ${fact.label.toLowerCase()}`} />}
            </span>
            <button
              ref={btn}
              id={tokenDomId(PANEL_ID, token)}
              type="button"
              className={`cp__fld is-val sit-fact__val${open ? ' is-open' : ''}${issue ? ' is-unset' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={tokenName({ label: fact.label, text: value.text }, issue)}
              aria-invalid={issue ? true : undefined}
              onClick={() => setOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && !open) {
                  e.preventDefault()
                  setOpen(true)
                }
              }}
            >
              <span className="sit-fact__mark" aria-hidden>
                <ValueMark v={value} />
              </span>
              <span className="cp__fldtext">{value.text}</span>
              <ChevronDown size={13} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {issue && <RowError text={issue} />}
      <AnchoredPopover anchor={btn} open={open} onClose={close} label={TOKEN_LABEL[token]} width={FACT_WIDTH[token] ?? 340} focusFirst={false} className="tsent-pop">
        <div ref={body} className="tsent-pop__body">
          {tip && (
            <div className="tsent-pop__head">
              <span>{fact.label}</span>
              <TipDot text={tip} label={`What reads ${fact.label.toLowerCase()}`} />
            </div>
          )}
          <SentenceTokenPanel
            token={token}
            form={form}
            onPatch={onPatch}
            onPick={(p, field) => {
              onPatch(p, field)
              setOpen(false)
              btn.current?.focus()
            }}
            rows={rows}
            issues={issues}
            boundaries={boundaries}
            scope={scope}
            idPrefix={PANEL_ID}
          />
        </div>
      </AnchoredPopover>
    </>
  )
}

/* Saved sign-ins, as a list with a search: a pick fills the panel and runs.
   Under the panel's Use a saved sign-in (`SavedPicker`), and as the panel
   itself (`SavedPanel`, the empty canvas's Saved sign-ins). The search takes
   the focus as it opens; ↓ goes into the list, Enter on the search takes the
   first match. */
function SavedList({ saved, onPick }: { saved: readonly SavedSignIn[]; onPick: (s: SavedSignIn) => void }) {
  const { users, apps } = useBrand()
  const [q, setQ] = useState('')
  const list = useRef<HTMLUListElement | null>(null)
  const needle = q.trim().toLowerCase()
  const rows = saved
    .filter((s) => !s.generated)
    .map((s) => ({
      s,
      meta: [users.find((u) => u.id === s.facts.personId)?.name, apps.find((a) => a.id === s.facts.appId)?.name].filter(Boolean).join(' · '),
    }))
    .filter((r) => !needle || `${r.s.name} ${r.meta}`.toLowerCase().includes(needle))
  const focusAt = (i: number) => list.current?.querySelectorAll<HTMLElement>('button')[Math.max(0, Math.min(rows.length - 1, i))]?.focus()
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('button') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    focusAt(to)
  }
  return (
    <div className="tbar-saved">
      <div
        className="tbar-saved__search"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            focusAt(0)
          } else if (e.key === 'Enter' && rows[0]) {
            e.preventDefault()
            onPick(rows[0].s)
          }
        }}
      >
        <SearchBox block value={q} onChange={setQ} placeholder="Search saved sign-ins" label="Search saved sign-ins" />
      </div>
      {rows.length === 0 ? (
        <p className="tbar-saved__empty" role="status">
          No saved sign-ins match “{q.trim()}”
        </p>
      ) : (
        <ul ref={list} className="tbar-saved__list" aria-label="Saved sign-ins" onKeyDown={onListKey}>
          {rows.map(({ s, meta }) => (
            <li key={s.id}>
              <button type="button" className="tbar-saved__opt" tabIndex={-1} onClick={() => onPick(s)}>
                <span className="tbar-saved__text">
                  <span className="tbar-saved__name">{s.name}</span>
                  {meta && <span className="tbar-saved__meta">{meta}</span>}
                </span>
                <DecisionBadge decision={s.expected} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* Saved sign-ins under the panel's Use a saved sign-in: the list in a
   popover hung from that row. The template cards (§12.5) replace it. */
export function SavedPicker({
  anchor,
  open,
  saved,
  align = 'end',
  onClose,
  onPick,
}: {
  anchor: RefObject<HTMLElement | null>
  open: boolean
  saved: readonly SavedSignIn[]
  align?: 'start' | 'end'
  onClose: () => void
  onPick: (s: SavedSignIn) => void
}) {
  return (
    <AnchoredPopover anchor={anchor} open={open} onClose={onClose} label="Saved sign-ins" align={align} width={380} className="tsent-pop">
      <SavedList saved={saved} onPick={onPick} />
    </AnchoredPopover>
  )
}

/* Saved sign-ins as the right-hand panel (owner, 1 Oct: "on click, open the
   right panel for both actions"): the empty canvas's Saved sign-ins opens
   it, in the sign-in panel's place and chrome — the Inspector's floating
   card, its name in the head row with the width and the X, the list under
   it, the whole height of the panel. A pick fills the sign-in and runs, and
   the panel shuts for the run, as Run shuts the form. It slides as the form
   slides (motion props; there, and gone, under reduced motion), and is inert
   on its way out; the search takes the focus once it has arrived. */
export function SavedPanel({
  saved,
  reduced,
  wide,
  onToggleWidth,
  onClose,
  onPick,
}: {
  saved: readonly SavedSignIn[]
  reduced: boolean
  wide: boolean
  onToggleWidth: () => void
  onClose: () => void
  onPick: (s: SavedSignIn) => void
}) {
  const present = useIsPresent()
  const heading = useId()
  const body = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => body.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }), reduced ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
  }, [reduced])
  return (
    <motion.aside
      className="bb__insp sit-panel sit-savedpanel"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule">
        <h2 id={heading} className="sit-panel__title">
          Saved sign-ins
        </h2>
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>
      <div ref={body} className="sit-savedpanel__body">
        <SavedList saved={saved} onPick={onPick} />
      </div>
    </motion.aside>
  )
}

/* The why, in the right-hand panel (owner, 1 Oct 2026: "for the conflict we
   should open the right side panel instead of opening under the outcome"):
   the sign-in panel's place and slide, its body left for the run to draw
   the why into (EngineJourney.tsx draws WhyCard there, its own head the
   panel's — its mark, the answer's line, its X). Opened by the answer's
   Review conflict (or Why?) and the policy's count; shut by its X, Escape,
   and any new run.

   The why and the break-in attempts are one panel (owner, 1 Oct 2026): the
   attempts' Back to why, and the why's Review attempts, swap what it holds
   in place — the page keys both the same — so the one coming in is simply
   there (`slide` false), never a second card sliding over the first. */
export function WhyPanel({ reduced, slotRef, slide = true }: { reduced: boolean; slotRef: (el: HTMLDivElement | null) => void; slide?: boolean }) {
  const present = useIsPresent()
  return (
    <motion.aside
      className="bb__insp sit-panel sit-whypanel"
      aria-label="Why"
      inert={!present || undefined}
      initial={reduced || !slide ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div ref={slotRef} className="sit-whypanel__slot" />
    </motion.aside>
  )
}
