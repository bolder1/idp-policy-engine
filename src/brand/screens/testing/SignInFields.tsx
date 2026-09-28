import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import type { Audience } from '../../data'
import { DECISION_TONE } from '../../decision-words'
import { Face } from '../../faces'
import { Button, NumberStepper, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { PlatformMark } from '../../logos/PlatformMark'
import { Picker, type PickerOption } from '../../picker'
import { useBrand } from '../../store'
import { clock } from '../simulate'
import type { Band, Boundaries } from './boundaries'
import { DEVICE_PRESETS } from './device-presets'
import { DEVICE_ROWS, type DeviceRowId, type RowsRead } from './rows-read'
import {
  CUSTOM_DEVICE,
  DETAIL_OPTIONS,
  DEVICE_ROW_LABEL,
  NOT_STATED,
  addressSource,
  bandWords,
  detailValue,
  deviceFactsOf,
  deviceOptions,
  deviceValue,
  edgesText,
  fieldRowId,
  personOptions,
  placeOfValue,
  placeOptions,
  placeSource,
  placeSummary,
  placeValue,
  riskUnmeasured,
  rulerReading,
  timeZoneOptions,
  valueText,
  withDetail,
  withDevice,
  withVersion,
  type SourceWord,
} from './sign-in-fields'
import { ORIGIN_PRESETS, factsOf, originPatch, typedAddressPatch, type FormField, type FormIssue, type SignInForm } from './sign-in-form'
import './testing.css'

/* -----------------------------------------------------------------------------
   The sign-in, as rows of controls — the board's Try a sign-in and the Policy
   testing page both state one here.

   Which rows show is the caller's (`rows`): the board shows the ones the rules
   on the application read (rows-read.ts), the page shows all but Distance.
   Person, Application, From and IP address always show.

   Two layouts of the same rows. On the board, a row is label, control and the
   word that says where the value came from, 96 | 1fr | auto, because the
   panel is 448 px and every row has to fit on one line. On the page, the
   label sits over a full-width control, as every form on the page does.

   Typing commits on a pause, on leaving the field, or on Enter — never a
   keystroke at a time. Each commit is a new answer, and an answer that
   changed on every letter of "192.0.2.50" would flash nine wrong ones first.
   The date and time boxes are typed too, a segment at a time: "14" on the
   hour went through 01:30 on its way. Pickers, chips and sliders commit at
   once.

   One control height per layout: the board's rows are the dense form, every
   control at the small size; the page's stacked rows are a form of labelled
   fields, at the form size (testing.css).

   The controls are the kit's own: Picker for every choice, NumberStepper for
   a count, the kit chip for the origin presets, TipDot for a one-line tip.
   -------------------------------------------------------------------------- */

const IDLE_MS = 300

/* A text field that keeps what is typed and hands it on after a pause. The
   value on screen is the typed one until it is committed, then the form's
   again — so a chip that sets the address replaces the text in the box. */
function useIdleText(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef(0)
  const latest = useRef(commit)
  useEffect(() => {
    latest.current = commit
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const send = (v: string) => {
    window.clearTimeout(timer.current)
    if (v !== value) latest.current(v)
    setDraft(null)
  }
  return {
    value: draft ?? value,
    change: (v: string) => {
      setDraft(v)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => send(v), IDLE_MS)
    },
    flush: () => {
      if (draft !== null) send(draft)
    },
    keyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && draft !== null) {
        e.preventDefault()
        send(draft)
      }
    },
  }
}

export function SignInFields({
  form,
  onPatch,
  rows: read,
  issues,
  boundaries,
  layout = 'rows',
  audience,
  assumeOptions,
  idPrefix = 'sign-in',
}: {
  form: SignInForm
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
  /** Which of the optional rows to show, and which device details. */
  rows: RowsRead
  issues: readonly FormIssue[]
  /** The edges each ruler prints, when the caller has them. */
  boundaries?: Boundaries
  /** `rows` on the board's panel, `stacked` on the page. */
  layout?: 'rows' | 'stacked'
  /** The board's policy audience: the people it is for are listed first. */
  audience?: Audience | null
  /** Policy testing only: the off policies Assume on can bring in. Absent, the row is not drawn. */
  assumeOptions?: readonly PickerOption[]
  /** Prefixes each row's DOM id (`fieldRowId`), so a "Needs:" link can find it. */
  idPrefix?: string
}) {
  const { users, groups, apps, zones } = useBrand()
  const facts = useMemo(() => factsOf(form, zones).facts, [form, zones])
  const stacked = layout === 'stacked'
  const size = stacked ? 'md' : 'sm'
  const issue = (f: FormField) => issues.find((i) => i.field === f)?.message
  const row = (f: FormField) => fieldRowId(idPrefix, f)

  const people = useMemo<PickerOption[]>(
    () => personOptions(users, groups, audience).map((o) => ({ ...o, art: <Face kind="user" name={o.label} size="sm" decorative /> })),
    [users, groups, audience],
  )
  const appOptions = useMemo<PickerOption[]>(() => apps.map((a) => ({ value: a.id, label: a.name, art: <AppLogo appId={a.id} name={a.name} size={16} /> })), [apps])
  const places = useMemo(() => placeOptions(), [])

  return (
    <div className={`tfields${stacked ? ' is-stacked' : ''}`}>
      <Row id={row('person')} label="Person" tip={stacked ? 'Sample directory' : undefined} sub={stacked ? undefined : 'Sample directory'}>
        <Picker
          label="Person"
          value={form.personId}
          options={people}
          onChange={(v) => onPatch({ personId: v }, 'person')}
          placeholder="Choose a person"
          searchable
          noun="people"
          width="fill"
          size={size}
        />
      </Row>

      <Row id={row('app')} label="Application">
        <Picker
          label="Application"
          value={form.appId}
          options={appOptions}
          onChange={(v) => onPatch({ appId: v }, 'app')}
          placeholder="Choose an application"
          searchable
          noun="applications"
          width="fill"
          size={size}
        />
      </Row>

      <Row label="From">
        <OriginChips value={form.origin} onPick={(id) => onPatch(originPatch(id), 'address')} />
      </Row>

      <AddressRow id={row('address')} form={form} error={issue('address')} onCommit={(v) => onPatch(typedAddressPatch(v), 'address')} />

      {read.rows.has('place') && (
        <Row id={row('place')} label="Place" tip="Sample address table, not geo-IP" source={placeSource(form, facts)}>
          <Picker
            label="Place"
            value={placeValue(form.place)}
            summary={placeSummary(form, facts)}
            options={places}
            onChange={(v) => onPatch({ place: placeOfValue(v) }, 'place')}
            searchable
            noun="places"
            width="fill"
            size={size}
          />
        </Row>
      )}

      {read.rows.has('distance') && boundaries?.distance && <DistanceRow form={form} ruler={boundaries.distance} onPatch={onPatch} />}

      {read.rows.has('when') && (
        <Row
          id={row('when')}
          label="When"
          tip={read.rows.has('time-track') ? 'Buffer time not modelled' : undefined}
          source={form.time ? 'stated' : null}
        >
          <WhenControls form={form} size={size} onPatch={onPatch} />
          {read.rows.has('time-track') && boundaries?.time && (
            <BandStrip bands={boundaries.time.bands} max={1439} ticks={boundaries.time.edges.map((m) => ({ at: m, label: clock(m) }))} />
          )}
        </Row>
      )}

      {read.rows.has('device') && (
        <DeviceRows id={row('device')} form={form} rows={read.device} size={size} onPatch={onPatch} />
      )}

      {read.rows.has('risk') && (
        <RiskRow id={row('risk')} form={form} error={issue('risk')} bands={boundaries?.risk} onPatch={onPatch} />
      )}

      {assumeOptions && (
        <Row id={row('assume-on')} label="Assume on" tip="Evaluated as if on; nothing changes">
          <Picker
            label="Assume on"
            value={form.assumeOn ?? ''}
            placeholder="Nothing"
            options={[{ value: '', label: 'Nothing' }, ...assumeOptions]}
            onChange={(v) => onPatch({ assumeOn: v || null }, 'assume-on')}
            width="fill"
            size={size}
          />
        </Row>
      )}
    </div>
  )
}

// --- A row -------------------------------------------------------------------------

function Row({
  id,
  label,
  htmlFor,
  tip,
  sub,
  source,
  error,
  errorId,
  children,
}: {
  id?: string
  label: string
  htmlFor?: string
  tip?: string
  sub?: string
  source?: SourceWord | null
  error?: string
  errorId?: string
  children: ReactNode
}) {
  return (
    <div id={id} className="tfields__row">
      <span className="tfields__label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {tip && <TipDot text={tip} label={`About ${label.toLowerCase()}`} />}
      </span>
      <div className="tfields__control">
        {children}
        {sub && <span className="tfields__sub">{sub}</span>}
        {error && (
          <p id={errorId} className="tfields__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <span className="tfields__source">{source ?? ''}</span>
    </div>
  )
}

// --- From -----------------------------------------------------------------------------

/* The origin presets, as kit chips in a radiogroup: one tab stop, and the
   arrow keys move the choice along it. None is on once an address is typed. */
function OriginChips({ value, onPick }: { value: SignInForm['origin']; onPick: (id: (typeof ORIGIN_PRESETS)[number]['id']) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = ORIGIN_PRESETS.findIndex((o) => o.id === value)
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
    if (!d) return
    e.preventDefault()
    const next = (i + d + ORIGIN_PRESETS.length) % ORIGIN_PRESETS.length
    onPick(ORIGIN_PRESETS[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div className="tfields__chips" role="radiogroup" aria-label="From">
      {ORIGIN_PRESETS.map((o, i) => {
        const on = o.id === value
        return (
          <span key={o.id} className={`bx-chip is-clickable${on ? ' is-on' : ''}`}>
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
              className="bx-chip__main"
              onClick={() => onPick(o.id)}
              onKeyDown={(e) => move(e, i)}
            >
              {o.label}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// --- IP address ------------------------------------------------------------------------

function AddressRow({ id, form, error, onCommit }: { id: string; form: SignInForm; error?: string; onCommit: (v: string) => void }) {
  const inputId = useId()
  const errorId = useId()
  const text = useIdleText(form.address, onCommit)
  return (
    <Row id={id} label="IP address" htmlFor={inputId} source={addressSource(form)} error={error} errorId={errorId}>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="IPv4 or IPv6 address"
        value={text.value}
        onChange={(e) => text.change(e.target.value)}
        onBlur={text.flush}
        onKeyDown={text.keyDown}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
    </Row>
  )
}

// --- When ----------------------------------------------------------------------------------

/* The date and the time commit as the address does — on a pause, on leaving
   the box, on Enter — because each is typed a segment at a time. The time zone
   is a Picker and commits at once. */
function WhenControls({ form, size, onPatch }: { form: SignInForm; size: 'sm' | 'md'; onPatch: (p: Partial<SignInForm>, field: FormField) => void }) {
  const date = useIdleText(form.date, (v) => onPatch({ date: v }, 'when'))
  const time = useIdleText(form.time, (v) => onPatch({ time: v }, 'when'))
  return (
    <div className="tfields__when">
      <input type="date" aria-label="Date" value={date.value} onChange={(e) => date.change(e.target.value)} onBlur={date.flush} onKeyDown={date.keyDown} />
      <input type="time" aria-label="Time" value={time.value} onChange={(e) => time.change(e.target.value)} onBlur={time.flush} onKeyDown={time.keyDown} />
      <Picker label="Time zone" value={form.timeZone} options={timeZoneOptions()} onChange={(v) => onPatch({ timeZone: v }, 'when')} width="fill" size={size} />
    </div>
  )
}

// --- Rulers -------------------------------------------------------------------------------

/* The bands a ruler prints under its track: a thin strip in each band's
   decision tone, the decision under it where the band is wide enough to hold
   the words, and in the strip's title where it is not. The edges print as
   ticks. Read by nobody but sighted users — the slider says the same in its
   value text and description.

   "Wide enough" is measured, not guessed from the band's share of the ruler:
   the same share is 70 px on the board and 110 on the page, and a decision is
   said whole or not at all — never "Allow with…". Measured before paint and
   again whenever the strip is resized (the rail opening, a wider drawer). */
function BandStrip({ bands, max, ticks }: { bands: readonly Band[]; max: number; ticks: { at: number; label: string }[] }) {
  const labelsRef = useRef<HTMLDivElement | null>(null)
  const [clipped, setClipped] = useState<ReadonlySet<number>>(() => new Set())
  const words = bands.map((b) => `${b.from}:${bandWords(b)}`).join('|')
  useLayoutEffect(() => {
    const el = labelsRef.current
    if (!el) return
    const measure = () => {
      const over = new Set<number>()
      el.querySelectorAll<HTMLElement>('.tband__label').forEach((label, i) => {
        if (label.scrollWidth > label.clientWidth + 1) over.add(i)
      })
      setClipped((prev) => (prev.size === over.size && [...over].every((i) => prev.has(i)) ? prev : over))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [words, max])
  return (
    <div className="tband" aria-hidden>
      <div className="tband__ticks">
        {ticks.map((t) => (
          <span key={t.at} className="tband__tick" style={{ left: `${(t.at / (max + 1)) * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="tband__strip">
        {bands.map((b) => (
          <span key={b.from} className={`tband__seg is-${b.decision ? DECISION_TONE[b.decision] : 'unknown'}`} style={{ flexGrow: b.to - b.from + 1 }} title={bandWords(b)} />
        ))}
      </div>
      <div ref={labelsRef} className="tband__labels">
        {bands.map((b, i) => (
          <span
            key={b.from}
            className={`tband__label${b.decision ? '' : ' is-unknown'}${clipped.has(i) ? ' is-clipped' : ''}`}
            style={{ flexGrow: b.to - b.from + 1 }}
            title={bandWords(b)}
          >
            {bandWords(b)}
          </span>
        ))}
      </div>
    </div>
  )
}

/* The ruler never shows a distance the sign-in does not have (rulerReading):
   Can't tell, grey and with a neutral thumb, where the place has no point to
   measure from; the real distance past the ruler's end, the thumb held there;
   and a neutral thumb, announced without a band, where the zone takes the
   place by name. Dragging states a point on the ruler, which is its own
   answer. */
function DistanceRow({
  form,
  ruler,
  onPatch,
}: {
  form: SignInForm
  ruler: NonNullable<Boundaries['distance']>
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
}) {
  const sliderId = useId()
  const edgesId = useId()
  const reading = rulerReading(ruler)
  const stated = form.place.kind === 'distance'
  return (
    <Row label="Distance" htmlFor={sliderId} source={stated ? 'stated' : null}>
      <span className={`tfields__value${ruler.now === null ? ' is-unknown' : ''}`}>{reading.value}</span>
      <input
        id={sliderId}
        className={`tfields__range${reading.placed ? '' : ' is-unplaced'}`}
        type="range"
        min={0}
        max={ruler.max}
        step={1}
        value={reading.at}
        onChange={(e) => onPatch({ place: { kind: 'distance', zoneId: ruler.zoneId, rangeIndex: ruler.rangeIndex, km: Number(e.target.value) } }, 'place')}
        aria-valuetext={reading.valueText}
        aria-describedby={edgesId}
      />
      <span id={edgesId} className="u-sr-only">
        {edgesText([`${ruler.edge} km`])}
      </span>
      <BandStrip bands={ruler.bands} max={ruler.max} ticks={[{ at: ruler.edge + 1, label: `${ruler.edge} km` }]} />
    </Row>
  )
}

// --- Device --------------------------------------------------------------------------------

function DeviceRows({
  id,
  form,
  rows,
  size,
  onPatch,
}: {
  id: string
  form: SignInForm
  rows: ReadonlySet<DeviceRowId>
  size: 'sm' | 'md'
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
}) {
  const [open, setOpen] = useState(false)
  const facts = deviceFactsOf(form.device)
  const presets = useMemo<PickerOption[]>(
    () =>
      deviceOptions().map((o) => {
        const p = DEVICE_PRESETS.find((x) => x.id === o.value)
        const platform = p?.platform
        return { ...o, ...(platform && platform !== 'linux' && platform !== 'other' ? { art: <PlatformMark platform={platform} /> } : null) }
      }),
    [],
  )
  const set = (row: DeviceRowId, value: string) => onPatch({ device: withDevice(withDetail(facts, row, value)) }, 'device')
  const shown = DEVICE_ROWS.filter((r) => rows.has(r))

  return (
    <>
      <Row id={id} label="Device" source={form.device.kind === 'none' ? null : 'stated'}>
        <div className="tfields__device is-stack">
          <Picker
            label="Device"
            value={deviceValue(form.device)}
            summary={form.device.kind === 'custom' ? CUSTOM_DEVICE : undefined}
            options={presets}
            onChange={(v) => {
              const preset = DEVICE_PRESETS.find((p) => p.id === v)
              onPatch({ device: preset ? { kind: 'preset', id: preset.id } : { kind: 'none' } }, 'device')
            }}
            width="fill"
            size={size}
          />
          {shown.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide details' : 'Edit details'}
            </Button>
          )}
        </div>
      </Row>
      {open &&
        shown.map((r) => (
          <DetailRow
            key={r}
            row={r}
            facts={facts}
            size={size}
            onSet={(v) => set(r, v)}
            onVersion={(row, v) => onPatch({ device: withDevice(withVersion(facts, row, v)) }, 'device')}
          />
        ))}
    </>
  )
}

function DetailRow({
  row,
  facts,
  size,
  onSet,
  onVersion,
}: {
  row: DeviceRowId
  facts: ReturnType<typeof deviceFactsOf>
  size: 'sm' | 'md'
  onSet: (value: string) => void
  onVersion: (row: 'authenticator' | 'agent', version: string) => void
}) {
  const label = DEVICE_ROW_LABEL[row]
  const value = detailValue(facts, row)
  const inputId = useId()
  const os = useIdleText(facts.osVersion ?? '', (v) => onSet(v))
  const version = row === 'authenticator' ? (facts.authenticatorVersion ?? '') : (facts.agentVersion ?? '')
  const typed = useIdleText(version, (v) => {
    if (row === 'authenticator' || row === 'agent') onVersion(row, v)
  })

  if (row === 'os-version') {
    return (
      <Row label={label} htmlFor={inputId}>
        <input
          id={inputId}
          type="text"
          placeholder="Not stated"
          value={os.value}
          onChange={(e) => os.change(e.target.value)}
          onBlur={os.flush}
          onKeyDown={os.keyDown}
        />
      </Row>
    )
  }
  /* Not stated is its own answer here too: the engine reads an unstated count
     as undecided and a 0 as none, so the box is empty until a step states one. */
  if (row === 'registered-count') {
    return (
      <Row label={label}>
        <span className="tfields__count">
          <NumberStepper
            label={label}
            value={value === NOT_STATED ? null : Number(value)}
            placeholder="Not stated"
            min={0}
            max={10}
            width="fill"
            onChange={(n) => onSet(String(n))}
          />
        </span>
      </Row>
    )
  }
  const options = DETAIL_OPTIONS[row] ?? []
  return (
    <Row label={label}>
      <div className="tfields__device">
        <Picker label={label} value={value} placeholder="Not stated" options={options} onChange={onSet} width="fill" size={size} />
        {(row === 'authenticator' || row === 'agent') && value === 'installed' && (
          <input
            type="text"
            aria-label={`${label} version`}
            placeholder="Version"
            className="tfields__version"
            value={typed.value}
            onChange={(e) => typed.change(e.target.value)}
            onBlur={typed.flush}
            onKeyDown={typed.keyDown}
          />
        )}
      </div>
    </Row>
  )
}

// --- Device risk score ------------------------------------------------------------------------

function RiskRow({
  id,
  form,
  error,
  bands,
  onPatch,
}: {
  id: string
  form: SignInForm
  error?: string
  bands?: NonNullable<Boundaries['risk']>
  onPatch: (p: Partial<SignInForm>, field: FormField) => void
}) {
  const inputId = useId()
  const errorId = useId()
  const edgesId = useId()
  const text = useIdleText(form.risk, (v) => onPatch({ risk: v }, 'risk'))
  const score = /^\d{1,3}$/.test(form.risk.trim()) ? Number(form.risk.trim()) : null
  const stated = score !== null && score <= 100
  return (
    <Row
      id={id}
      label="Device risk score"
      htmlFor={inputId}
      tip={riskUnmeasured(form.device) ? 'Risk signals are collected on Android and iOS only' : undefined}
      source={form.risk.trim() ? 'stated' : null}
      error={error}
      errorId={errorId}
    >
      <div className="tfields__risk">
        <input
          id={inputId}
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          placeholder="Not stated"
          className="tfields__number"
          value={text.value}
          onChange={(e) => text.change(e.target.value)}
          onBlur={text.flush}
          onKeyDown={text.keyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {stated && (
          <input
            className="tfields__range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={score}
            aria-label="Device risk score"
            onChange={(e) => onPatch({ risk: e.target.value }, 'risk')}
            aria-valuetext={valueText(score, bands?.bands)}
            aria-describedby={bands ? edgesId : undefined}
          />
        )}
      </div>
      {stated && bands && (
        <>
          <span id={edgesId} className="u-sr-only">
            {edgesText(bands.edges)}
          </span>
          <BandStrip bands={bands.bands} max={100} ticks={bands.edges.map((e) => ({ at: e, label: String(e) }))} />
        </>
      )}
    </Row>
  )
}
