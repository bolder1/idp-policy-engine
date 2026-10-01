import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import {
  BookmarkPlus,
  Building,
  Building2,
  ChevronDown,
  Clock,
  Gauge,
  Globe,
  House,
  MapPin,
  MonitorSmartphone,
  Network,
  Pencil,
  Play,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react'

import type { AccessDecision } from '../../data'
import { Face } from '../../faces'
import { Button, SearchBox, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { PlatformMark } from '../../logos/PlatformMark'
import { Picker, type PickerOption } from '../../picker'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { AnchoredPopover } from '../testing/AnchoredPopover'
import type { Boundaries } from '../testing/boundaries'
import type { RowsRead } from '../testing/rows-read'
import { DistanceRow, PlaceRow } from '../testing/SignInFields'
import { personOptions, placeSummary } from '../testing/sign-in-fields'
import { factsOf, type FormField, type FormIssue, type SignInForm } from '../testing/sign-in-form'
import { GLOBAL_SCOPE, sentenceTokens, tokenValue, type SentenceContext, type TokenId, type TokenValue } from '../testing/sign-in-sentence'
import { SaveSignInPopover, SentenceTokenPanel } from '../testing/SignInSentence'
import type { AskedField } from './engine-run'
import { askedFields } from './sign-in-card'

/* -----------------------------------------------------------------------------
   The Sign-in card (TESTING-V4 §8.1–8.2), and the node it collapses into.

   The card is the Try tab's empty state: the only thing in the canvas, a
   small label over it ("Sign-in"), Person and Application, and Run. Choosing
   the application asks for what its rules read, one field at a time sliding
   in under the two, each already filled and each saying — in the dot beside
   its label — which rules read it. Nothing else is explained.

   Every extra field is a closed control that opens the sign-in sentence's own
   panel under it (SignInSentence.tsx `SentenceTokenPanel`): the origins and
   the IP address, the device presets and their details, the time, the risk
   score. The same controls as the board's test panel, so the two can never
   state, word or validate a fact differently; the card only lays them out as
   a form — label over field, one per row.

   Run is the tab's one orange button and is never disabled: pressed with a
   field missing, it says so under that field and goes there. Ctrl+Enter (⌘ on
   a Mac) presses it from anywhere in the card, its panels included.

   The card and the node share one `layoutId`, so Run morphs the card into the
   node at the start of the journey, and Edit sign-in grows the node back into
   the card where it stands. Motion owns that element: journey.css gives it no
   transform and no transition.
   -------------------------------------------------------------------------- */

export const SIGN_IN_LAYOUT = 'tj-signin'

/** The DOM id of a card field, so Add on a check row and an error can go to it. */
export const cardFieldId = (field: FormField | AskedField): string => `tj-field-${field}`

const FIELD_LABEL: Record<AskedField, string> = {
  from: 'From',
  place: 'Place',
  device: 'Device',
  when: 'Time',
  risk: 'Device risk score',
}

const FIELD_TOKEN: Record<Exclude<AskedField, 'place'>, TokenId> = { from: 'from', device: 'device', when: 'when', risk: 'risk' }

/** The form field each asked field states, for its error and for Add. */
export const ASKED_FORM_FIELD: Record<AskedField, FormField> = { from: 'address', place: 'place', device: 'device', when: 'when', risk: 'risk' }

const PANEL_WIDTH: Record<AskedField, number> = { from: 360, place: 360, device: 340, when: 360, risk: 360 }

const ICON: Record<string, LucideIcon> = {
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

/** A value's mark, as the sentence draws it: the platform, or the line icon. */
export function ValueMark({ v, size = 14 }: { v: TokenValue; size?: number }) {
  if (v.mark.kind === 'platform') return <PlatformMark platform={v.mark.platform} size={size} />
  if (v.mark.kind === 'face') return <Face kind="user" name={v.mark.name} size="sm" decorative />
  if (v.mark.kind === 'logo') return <AppLogo appId={v.mark.appId} name={v.mark.name} size={16} />
  const Icon = ICON[v.mark.icon]
  return Icon ? <Icon size={size} strokeWidth={1.9} aria-hidden /> : null
}

// --- The card ---------------------------------------------------------------------------------

export interface SignInCardProps {
  /** `new`: Stage 0. `edit`: the node grown back, over the journey. `fill`: a saved sign-in shown for a beat before it runs. */
  mode: 'new' | 'edit' | 'fill'
  form: SignInForm
  rows: RowsRead
  readers: Record<AskedField, string>
  /** What stops a run, each under its field. Empty until Run has been pressed once. */
  issues: readonly FormIssue[]
  boundaries: Boundaries
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  onRun: () => void
  onCancel?: () => void
  saved: readonly SavedSignIn[]
  onUseSaved: (s: SavedSignIn) => void
  /** Open with this field's panel open: Add on a check row that was Not stated. */
  openField?: AskedField | null
  reduced: boolean
}

export function SignInCard(props: SignInCardProps) {
  const { mode, form, rows, readers, issues, boundaries, onPatch, onRun, onCancel, saved, onUseSaved, openField, reduced } = props
  const { users, groups, apps, zones } = useBrand()
  const ctx: SentenceContext = useMemo(() => ({ people: users, apps, zones, rows }), [users, apps, zones, rows])
  const asked = form.appId ? askedFields(rows) : []
  const issue = (f: FormField) => issues.find((i) => i.field === f)?.message
  const inert = mode === 'fill'
  const headId = useId()

  const people = useMemo<PickerOption[]>(
    () => personOptions(users, groups, null).map((o) => ({ ...o, art: <Face kind="user" name={o.label} size="sm" decorative /> })),
    [users, groups],
  )
  const appOptions = useMemo<PickerOption[]>(() => apps.map((a) => ({ value: a.id, label: a.name, art: <AppLogo appId={a.id} name={a.name} size={16} /> })), [apps])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onRun()
    } else if (e.key === 'Escape' && mode === 'edit' && onCancel && !e.defaultPrevented) {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <motion.section
      layoutId={SIGN_IN_LAYOUT}
      className={`tj-card0 is-${mode}`}
      aria-labelledby={headId}
      onKeyDown={onKey}
      transition={{ layout: { duration: reduced ? 0 : 0.32, ease: [0.2, 0, 0, 1] } }}
      {...(inert ? { inert: true } : null)}
    >
      <motion.div
        className="tj-card0__in"
        initial={mode === 'edit' && !reduced ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, delay: mode === 'edit' && !reduced ? 0.12 : 0 }}
      >
        <h2 id={headId} className="u-sr-only">
          Sign-in
        </h2>
        <div className="tj-fields">
          <Field id={cardFieldId('person')} label="Person" error={issue('person')}>
            <Picker
              label="Person"
              value={form.personId}
              options={people}
              onChange={(v) => onPatch({ personId: v }, 'person')}
              placeholder="Choose a person"
              searchable
              noun="people"
              width="fill"
              size="md"
              invalid={issue('person') !== undefined}
            />
          </Field>
          <Field id={cardFieldId('app')} label="Application" error={issue('app')}>
            <Picker
              label="Application"
              value={form.appId}
              options={appOptions}
              onChange={(v) => onPatch({ appId: v }, 'app')}
              placeholder="Choose an application"
              searchable
              noun="applications"
              width="fill"
              size="md"
              invalid={issue('app') !== undefined}
            />
          </Field>
          <AnimatePresence initial={false}>
            {asked.map((f, i) => (
              <motion.div
                key={f}
                className="tj-fieldwrap"
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduced ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1], delay: reduced ? 0 : i * 0.06 }}
              >
                <AskedFieldRow
                  field={f}
                  form={form}
                  rows={rows}
                  ctx={ctx}
                  tip={readers[f]}
                  error={issue(ASKED_FORM_FIELD[f])}
                  issues={issues}
                  boundaries={boundaries}
                  onPatch={onPatch}
                  autoOpen={openField === f}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="tj-card0__foot">
          <Button variant="brand" icon={Play} keys="Control+Enter Meta+Enter" onClick={onRun}>
            Run
          </Button>
          {mode === 'edit' && onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <UseSaved saved={saved} onPick={onUseSaved} />
          )}
        </div>
      </motion.div>
    </motion.section>
  )
}

/* A field: its label over its control, the dot beside the label when there
   is something to say about it, and the error under it. */
function Field({ id, label, tip, error, children }: { id: string; label: string; tip?: string; error?: string; children: ReactNode }) {
  const errorId = useId()
  return (
    <div id={id} className={`tj-field${error ? ' is-invalid' : ''}`}>
      <span className="tj-field__label">
        <span>{label}</span>
        {tip && <TipDot text={tip} label={`What reads ${label.toLowerCase()}`} />}
      </span>
      {children}
      {error && (
        <p id={errorId} className="tj-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/* An asked field: a closed control, the Picker's own look, that opens the
   sentence's panel for its fact under it. A pick in a list closes the panel
   (Enter or a click); typing, a slider and Edit details keep it open. */
function AskedFieldRow({
  field,
  form,
  rows,
  ctx,
  tip,
  error,
  issues,
  boundaries,
  onPatch,
  autoOpen,
}: {
  field: AskedField
  form: SignInForm
  rows: RowsRead
  ctx: SentenceContext
  tip: string
  error?: string
  issues: readonly FormIssue[]
  boundaries: Boundaries
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  autoOpen: boolean
}) {
  const { zones } = useBrand()
  const [open, setOpen] = useState(autoOpen)
  const btn = useRef<HTMLButtonElement | null>(null)
  const label = FIELD_LABEL[field]
  const facts = useMemo(() => factsOf(form, zones).facts, [form, zones])
  /* The From panel is the origins and the address only: Place has a field of its own here. */
  const fromRows = useMemo<RowsRead>(() => ({ rows: new Set([...rows.rows].filter((r) => r !== 'place' && r !== 'distance')), device: rows.device }), [rows])

  useEffect(() => {
    if (autoOpen) btn.current?.focus()
  }, [autoOpen])

  let value: TokenValue
  if (field === 'place') {
    value = { token: 'from', label, text: placeSummary(form, facts), unset: false, mark: { kind: 'icon', icon: 'anywhere' } }
  } else {
    value = tokenValue(FIELD_TOKEN[field], form, field === 'from' ? { ...ctx, rows: fromRows } : ctx)
  }
  const close = () => {
    setOpen(false)
    btn.current?.focus()
  }
  const pick = (p: Partial<SignInForm>, f: FormField) => {
    onPatch(p, f)
    close()
  }

  let panel: ReactNode
  if (field === 'place') {
    panel = (
      <div className="tfields is-stacked tsent-pop__fields">
        <PlaceRow id={`${cardFieldId('place')}-panel`} form={form} facts={facts} size="sm" onPatch={onPatch} />
        {rows.rows.has('distance') && boundaries.distance && <DistanceRow form={form} ruler={boundaries.distance} onPatch={onPatch} />}
      </div>
    )
  } else {
    panel = (
      <SentenceTokenPanel
        token={FIELD_TOKEN[field]}
        form={form}
        onPatch={onPatch}
        onPick={pick}
        rows={field === 'from' ? fromRows : rows}
        issues={issues}
        boundaries={boundaries}
        scope={GLOBAL_SCOPE}
        idPrefix="tj-card"
      />
    )
  }

  return (
    <Field id={cardFieldId(field)} label={label} tip={tip || undefined} error={error}>
      <span className="bx-picker is-fill">
        <button
          ref={btn}
          type="button"
          className={`bx-picker__trigger bx-picker__trigger--md${open ? ' is-open' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${value.text}`}
          aria-invalid={error ? true : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="bx-picker__art tj-field__mark" aria-hidden>
            {field === 'place' ? <MapPin size={14} strokeWidth={1.9} /> : <ValueMark v={value} />}
          </span>
          <span className={`bx-picker__value${value.unset ? ' tj-field__unset' : ''}`}>{value.text}</span>
          <ChevronDown size={13} strokeWidth={2.1} aria-hidden />
        </button>
      </span>
      <AnchoredPopover anchor={btn} open={open} onClose={close} label={label} width={PANEL_WIDTH[field]} className="tsent-pop">
        {panel}
      </AnchoredPopover>
    </Field>
  )
}

/* Use a saved sign-in: a quiet link that opens the library as a list with a
   search; a pick fills the card and runs. */
function UseSaved({ saved, onPick }: { saved: readonly SavedSignIn[]; onPick: (s: SavedSignIn) => void }) {
  const { users, apps } = useBrand()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLUListElement | null>(null)
  const needle = q.trim().toLowerCase()
  const rows = saved
    .filter((s) => !s.generated)
    .map((s) => ({
      s,
      meta: [users.find((u) => u.id === s.facts.personId)?.name, apps.find((a) => a.id === s.facts.appId)?.name].filter(Boolean).join(' · '),
    }))
    .filter((r) => !needle || `${r.s.name} ${r.meta}`.toLowerCase().includes(needle))
  const close = () => {
    setOpen(false)
    setQ('')
    btn.current?.focus()
  }
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
    <>
      <button ref={btn} type="button" className="bx-btn bx-btn--link bx-btn--md tj-usesaved" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Use a saved sign-in
      </button>
      <AnchoredPopover anchor={btn} open={open} onClose={close} label="Saved sign-ins" width={340} className="tsent-pop">
        <div className="tj-saved">
          <div
            className="tj-saved__search"
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
            <p className="tj-saved__empty" role="status">
              No saved sign-ins match “{q.trim()}”
            </p>
          ) : (
            <ul ref={list} className="tj-saved__list" aria-label="Saved sign-ins" onKeyDown={onListKey}>
              {rows.map(({ s, meta }) => (
                <li key={s.id}>
                  <button type="button" className="tj-saved__opt" tabIndex={-1} onClick={() => onPick(s)}>
                    <span className="tj-saved__name">{s.name}</span>
                    {meta && <span className="tj-saved__meta">{meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AnchoredPopover>
    </>
  )
}

/* Three quiet chips under the empty card: saved sign-ins that take different
   paths. A click fills the card and runs. */
export function Suggestions({ picks, onPick }: { picks: readonly SavedSignIn[]; onPick: (s: SavedSignIn) => void }) {
  const { users } = useBrand()
  if (picks.length === 0) return null
  return (
    <ul className="tj-suggest" aria-label="Try one of these">
      {picks.map((s) => {
        const person = users.find((u) => u.id === s.facts.personId)
        return (
          <li key={s.id}>
            <button type="button" className="tj-suggest__chip" onClick={() => onPick(s)}>
              {person && <Face kind="user" name={person.name} size="sm" decorative />}
              <span>{s.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// --- The node ------------------------------------------------------------------------------------

/* The card, collapsed: who, where to, and the facts it was asked for as small
   neutral chips. Edit sign-in grows it back into the card; Save sign-in hangs
   the save form off the bookmark. */
export function SignInNode({
  form,
  rows,
  onEdit,
  editRef,
  saveOpen,
  onSaveOpen,
  shown,
  reduced,
  hidden = false,
}: {
  form: SignInForm
  rows: RowsRead
  onEdit: () => void
  editRef: RefObject<HTMLButtonElement | null>
  saveOpen: boolean
  onSaveOpen: (open: boolean) => void
  /** The decision on screen, for Save's Expected. */
  shown: AccessDecision | null
  reduced: boolean
  /** The card is open over it: it keeps its place, unseen. */
  hidden?: boolean
}) {
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const group = person ? (groups.find((g) => g.id === person.groupId)?.name ?? '') : ''
  const app = apps.find((a) => a.id === form.appId) ?? null
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const stated = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
    .filter((v) => !v.unset)
  const saveAnchor = useRef<HTMLSpanElement | null>(null)

  const content = (
    <>
      <div className="tj-sin__who" data-port>
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="tj-sin__text">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {group && <span>{group}</span>}
        </span>
      </div>
      <div className="tj-sin__app">
        {app && <AppLogo appId={app.id} name={app.name} size={18} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </div>
      {stated.length > 0 && (
        <ul className="tj-facts" aria-label="Stated">
          {stated.map((v) => (
            <li key={v.token} className="tj-fact">
              <ValueMark v={v} size={12} />
              <span className="u-sr-only">{v.label}: </span>
              <span className="tj-fact__text" title={v.text}>
                {v.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  /* While the card is open over it, the node keeps its place — the wires and
     the columns stay where they are — as a plain box, unseen. Not the motion
     element: the card holds the shared layout id meanwhile, and the node
     arriving again is what morphs the card back into it. */
  if (hidden) {
    return (
      <div className="tj-node tj-sin is-hidden" data-node="sign-in" aria-hidden inert>
        <div className="tj-sin__in">{content}</div>
      </div>
    )
  }

  return (
    <motion.div
      layoutId={SIGN_IN_LAYOUT}
      className="tj-node tj-sin"
      data-node="sign-in"
      transition={{ layout: { duration: reduced ? 0 : 0.32, ease: [0.2, 0, 0, 1] } }}
    >
      <motion.div className="tj-sin__in" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: reduced ? 0 : 0.16 }}>
        {content}
      </motion.div>
      <div className="tj-sin__tools">
        <Tip text="Edit sign-in">
          <button ref={editRef} type="button" aria-label="Edit sign-in" className="bx-iconbtn bx-iconbtn--sm bx-iconbtn--ghost" onClick={onEdit}>
            <Pencil size={14} strokeWidth={1.9} aria-hidden />
          </button>
        </Tip>
        <span ref={saveAnchor} className="tsent__anchor">
          <Tip text="Save sign-in">
            <button
              type="button"
              aria-label="Save sign-in"
              aria-haspopup="dialog"
              aria-expanded={saveOpen}
              className={`bx-iconbtn bx-iconbtn--sm bx-iconbtn--ghost${saveOpen ? ' is-on' : ''}`}
              onClick={() => onSaveOpen(!saveOpen)}

            >
              <BookmarkPlus size={14} strokeWidth={1.9} aria-hidden />
            </button>
          </Tip>
        </span>
        <SaveSignInPopover
          anchor={saveAnchor}
          open={saveOpen}
          onClose={() => {
            onSaveOpen(false)
            saveAnchor.current?.querySelector<HTMLElement>('button')?.focus()
          }}
          form={form}
          shown={shown}
        />
      </div>
    </motion.div>
  )
}
