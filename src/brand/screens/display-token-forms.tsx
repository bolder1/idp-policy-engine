import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from 'react'
import { Check, Download, Eye, EyeOff, FileText, KeyRound, Plus, Upload, Users } from 'lucide-react'

import { Button, Callout, Modal, NumberStepper, SearchBox, TipDot } from '../kit'
import { Picker } from '../picker'
import { initials } from '../data'
import { EmptyState, NoMatches } from '../empty'
import {
  ASSIGNMENT_CSV_HEADER,
  ASSIGNMENT_CSV_SAMPLE,
  COUNTER_MAX,
  TOKEN_CSV_HEADER,
  TOKEN_CSV_SAMPLE,
  TOKEN_DIGITS,
  TOKEN_TYPES,
  serialKey,
  tokenType,
  tokensOf,
  type CsvSkip,
  type DirectoryUser,
  type HardwareToken,
  type TokenDraft,
  type TokenField,
} from '../hardware-tokens'
import {
  SAMPLE_NAME,
  assignChoices,
  filterTokens,
  heldLabel,
  isCsvName,
  plural,
  splitCodes,
  toggleSelected,
} from './display-tokens-model'

/* -----------------------------------------------------------------------------
   The Display tokens page's four sliders: Add token, Assign tokens, Upload CSV
   and Sync token.

   Render only. The page owns every draft (DisplayTokensPage.tsx), because the
   store holds one leave guard and the page's is the one that has to know what a
   slider holds; these draw the fields and hand back what is typed.

   They were a modal each in the live console and pages pushed inside the
   Authentication methods slider here until 15 Sep 2026. A slider over the list
   keeps the list in view — the token just added, the row just assigned — which
   a centred dialog covers.
   -------------------------------------------------------------------------- */

const CODE_NAMES = ['First code', 'Second code', 'Third code']

function FieldError({ id, text }: { id: string; text?: string | null }) {
  if (!text) return null
  return (
    <p id={id} className="bdt__error">
      {text}
    </p>
  )
}

/* --- Add ---------------------------------------------------------------------------- */

export function AddTokenForm({
  draft,
  onDraft,
  onTouch,
  error,
  refs,
  focusTick,
  onSubmit,
}: {
  draft: TokenDraft
  onDraft: (patch: Partial<TokenDraft>) => void
  onTouch: (f: TokenField) => void
  error: (f: TokenField) => string | undefined
  refs: RefObject<Partial<Record<TokenField, HTMLElement | null>>>
  /** Bumped on opening and by "Save and add another": focus goes back to the serial. */
  focusTick: number
  onSubmit: () => void
}) {
  const uid = useId()
  const [reveal, setReveal] = useState(false)
  const type = draft.type ? tokenType(draft.type) : null

  useEffect(() => {
    refs.current.serial?.focus()
    setReveal(false)
  }, [focusTick, refs])

  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }
  const described = (f: TokenField) => (error(f) ? `${uid}-${f}-err` : undefined)

  return (
    <div className="bmc__fields">
      {/* The live console's one rule for this form, before the field it governs. */}
      <Callout tone="info">The serial number must be unique across all tokens.</Callout>

      <div className="bmc__field">
        <div className="bmc__label">
          <label htmlFor={`${uid}-serial`}>
            Serial number
            <b aria-hidden>*</b>
          </label>
        </div>
        <div className="bmc__control">
          <input
            id={`${uid}-serial`}
            ref={(el) => {
              refs.current.serial = el
            }}
            type="text"
            className="bdt__mono"
            value={draft.serial}
            autoComplete="off"
            spellCheck={false}
            aria-required
            aria-invalid={!!error('serial')}
            aria-describedby={described('serial')}
            onChange={(e) => onDraft({ serial: e.target.value })}
            onBlur={() => onTouch('serial')}
            onKeyDown={enter}
          />
        </div>
        <FieldError id={`${uid}-serial-err`} text={error('serial')} />
      </div>

      <div className="bmc__field">
        <div className="bmc__label">
          <label htmlFor={`${uid}-secret`}>
            Secret key
            <b aria-hidden>*</b>
          </label>
          <TipDot label="About the secret key" text="The hex or base32 key that came with the token. It is checked and not shown again." />
        </div>
        <div className="bmc__control">
          <span className="bmc__secret">
            <input
              id={`${uid}-secret`}
              ref={(el) => {
                refs.current.secret = el
              }}
              type={reveal ? 'text' : 'password'}
              value={draft.secret}
              autoComplete="off"
              spellCheck={false}
              aria-required
              aria-invalid={!!error('secret')}
              aria-describedby={described('secret')}
              onChange={(e) => onDraft({ secret: e.target.value })}
              onBlur={() => onTouch('secret')}
              onKeyDown={enter}
            />
            <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide secret key' : 'Show secret key'}>
              {reveal ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
            </button>
          </span>
        </div>
        <FieldError id={`${uid}-secret-err`} text={error('secret')} />
      </div>

      <div className="bmc__field">
        <div className="bmc__label">
          <span className="bdt__label" id={`${uid}-type`}>
            Token type
            <b aria-hidden>*</b>
          </span>
        </div>
        <div
          className="bmc__control"
          ref={(el) => {
            refs.current.type = el
          }}
        >
          <Picker
            label="Token type"
            size="md"
            width="fill"
            value={draft.type || null}
            placeholder="Choose a type"
            invalid={!!error('type')}
            options={TOKEN_TYPES.map((t) => ({ value: t.id, label: t.label, meta: t.blurb }))}
            onChange={(v) => onDraft({ type: v as TokenDraft['type'] })}
          />
        </div>
        <FieldError id={`${uid}-type-err`} text={error('type')} />
      </div>

      {/* Only an event-based fob counts, so only its type asks where the count
          stands. A new fob starts at 0, which is what the field holds. */}
      {type?.counter && (
        <div className="bmc__field">
          <div className="bmc__label">
            <label htmlFor={`${uid}-counter`}>Counter</label>
            <TipDot label="About the counter" text="Codes the token has already shown. Leave 0 for a new token." />
          </div>
          <div
            className="bmc__control"
            ref={(el) => {
              refs.current.counter = el
            }}
          >
            <NumberStepper
              id={`${uid}-counter`}
              label="Counter"
              value={Number(draft.counter.trim() || 0)}
              min={0}
              max={COUNTER_MAX}
              invalid={!!error('counter')}
              onChange={(n) => onDraft({ counter: String(n) })}
            />
          </div>
          <FieldError id={`${uid}-counter-err`} text={error('counter')} />
        </div>
      )}
    </div>
  )
}

/* --- Assign --------------------------------------------------------------------------- */

/* Past this many unassigned tokens the list gets a search. Below it, every
   token is on screen and a search box is one more thing to read. */
const PICK_SEARCH_FROM = 8

export function AssignForm({
  tokens,
  users,
  person,
  onPerson,
  picks,
  onPicks,
  query,
  onQuery,
  tried,
  personRef,
  onAddToken,
}: {
  tokens: HardwareToken[]
  users: DirectoryUser[]
  person: string | null
  onPerson: (id: string) => void
  picks: string[]
  onPicks: (next: string[] | ((cur: string[]) => string[])) => void
  query: string
  onQuery: (q: string) => void
  tried: boolean
  personRef: RefObject<HTMLDivElement | null>
  onAddToken: () => void
}) {
  const uid = useId()
  /* The tested helper, so what is offered here and what the model says can be
     offered are one piece of code. */
  const { free, held } = useMemo(() => assignChoices(tokens, person), [tokens, person])
  const people = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.name,
        meta: [u.email, heldLabel(tokensOf(tokens, u.id).length)].filter(Boolean).join(', '),
        /* A face for a person: a list of fifty-eight names reads faster with a
           mark to scan down, and the trigger keeps it once one is chosen. */
        art: (
          <span className="bx-avatar" aria-hidden>
            {initials(u.name)}
          </span>
        ),
      })),
    [users, tokens],
  )
  const shown = useMemo(() => filterTokens(free, [], query, 'all'), [free, query])

  // Person first — also when a row's Assign arrived with its token picked.
  useEffect(() => {
    personRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [personRef])

  if (free.length === 0) {
    return (
      <EmptyState
        compact
        icon={KeyRound}
        title={tokens.length === 0 ? 'No tokens yet' : 'Every token is assigned'}
        blurb="Add a token first."
        action={
          <Button variant="brand" icon={Plus} onClick={onAddToken}>
            Add token
          </Button>
        }
      />
    )
  }
  /* Nobody to give a token to, and no way to add people from here. */
  if (users.length === 0) {
    return <EmptyState compact icon={Users} title="No users yet" blurb="Add people to the directory, then assign tokens." />
  }

  return (
    <div className="bmc__fields">
      {/* The live console's three lines, shortened. */}
      <Callout tone="info">
        <ul className="bdt__rules">
          <li>Every token you pick goes to the person you choose.</li>
          <li>Only tokens added under Manage tokens are listed.</li>
          <li>Tokens the person already holds are skipped.</li>
        </ul>
      </Callout>

      <div className="bmc__field">
        <div className="bmc__label">
          <span className="bdt__label">
            Person
            <b aria-hidden>*</b>
          </span>
        </div>
        <div className="bmc__control" ref={personRef}>
          <Picker
            label="Person"
            size="md"
            width="fill"
            searchable
            noun="people"
            value={person}
            placeholder="Choose a person"
            invalid={tried && !person}
            options={people}
            onChange={onPerson}
          />
        </div>
        <FieldError id={`${uid}-person-err`} text={tried && !person ? 'Choose a person.' : null} />
      </div>

      <div className="bmc__field">
        <div className="bmc__label bdt__labelrow">
          <span className="bdt__label" id={`${uid}-tokens`}>
            Tokens
            <b aria-hidden>*</b>
          </span>
          {/* The one place the pick is counted: the Assign button does not repeat it. */}
          {picks.length > 0 && <span className="bdt__count">{plural(picks.length, 'token')} picked</span>}
        </div>
        {free.length > PICK_SEARCH_FROM && (
          <SearchBox block value={query} onChange={onQuery} placeholder="Search serial or type" label="Search unassigned tokens" />
        )}
        {shown.length === 0 ? (
          <NoMatches compact noun="unassigned tokens" query={query} onClear={() => onQuery('')} />
        ) : (
          <ul className="bdt__picks" aria-labelledby={`${uid}-tokens`}>
            {shown.map((t) => {
              const on = picks.some((s) => serialKey(s) === serialKey(t.serial))
              return (
                <li key={t.serial}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={`bdt__pick ${on ? 'is-on' : ''}`}
                    onClick={() => onPicks((cur) => toggleSelected(cur, t.serial))}
                  >
                    <span className="bx-tick" aria-hidden>
                      <Check size={11} strokeWidth={3.2} />
                    </span>
                    <span className="bdt__serial" title={t.serial}>
                      {t.serial}
                    </span>
                    <span className="bdt__type">{tokenType(t.type).label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <FieldError id={`${uid}-tokens-err`} text={tried && picks.length === 0 ? 'Choose at least one token.' : null} />
      </div>

      {/* Skipped by the console, so not offered — and listed, so nobody goes
          looking for them in the list above. */}
      {held.length > 0 && (
        <section className="bdt__held" aria-labelledby={`${uid}-held`}>
          <h3 id={`${uid}-held`} className="bdt__sublabel">
            Already holds
          </h3>
          <ul>
            {held.map((t) => (
              <li key={t.serial}>
                <span className="bdt__serial" title={t.serial}>
                  {t.serial}
                </span>
                <span className="bdt__type">{tokenType(t.type).label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/* --- Upload ----------------------------------------------------------------------------- */

export type UploadMode = 'tokens' | 'assignments'

/* Rows past this are counted rather than listed. A 5,000-row file with every
   row skipped is a file with one mistake in its header, not 5,000 to read. */
const ROWS_SHOWN = 50

export interface UploadPreview {
  /** What would be imported or assigned: a serial, and the type or the person beside it. */
  ready: { serial: string; detail: string }[]
  skipped: CsvSkip[]
  error: string | null
}

export function UploadForm({
  mode,
  file,
  onFile,
  fileError,
  onFileError,
  preview,
}: {
  mode: UploadMode
  file: { name: string; text: string } | null
  onFile: (f: { name: string; text: string }) => void
  fileError: string | null
  onFileError: (e: string) => void
  preview: UploadPreview | null
}) {
  const uid = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const chooser = useRef<HTMLButtonElement | null>(null)
  const [dragging, setDragging] = useState(false)

  // The file chooser first: there is nothing else to do on this slider until a file is in.
  useEffect(() => {
    chooser.current?.focus()
  }, [])

  const read = (f: File | undefined) => {
    if (!f) return
    if (!isCsvName(f.name)) return onFileError('Choose a .csv file.')
    f.text().then(
      (text) => onFile({ name: f.name, text }),
      () => onFileError('The file could not be read.'),
    )
  }

  const sample = () => {
    const blob = new Blob([mode === 'tokens' ? TOKEN_CSV_SAMPLE : ASSIGNMENT_CSV_SAMPLE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = SAMPLE_NAME[mode]
    document.body.appendChild(a)
    a.click()
    a.remove()
    /* Not on the next tick: Firefox can still be starting the download then,
       and a revoked URL fails it. */
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /* A file dropped anywhere on the slider, not only on the drop zone — once a
     file is chosen the zone is gone, and a file dropped beside it would
     otherwise be opened by the browser in place of the console. */
  const dropHandlers = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      setDragging(false)
      read(e.dataTransfer.files?.[0])
    },
  }

  const columns =
    mode === 'tokens'
      ? [...TOKEN_CSV_HEADER.slice(0, 3), `${TOKEN_CSV_HEADER[3]} (optional)`]
      : [`${ASSIGNMENT_CSV_HEADER[0]} (email)`, ASSIGNMENT_CSV_HEADER[1]]
  const verb = mode === 'tokens' ? 'imported' : 'assigned'

  return (
    <div className="bdt__upload" {...dropHandlers}>
      <div className="bdt__columns">
        <p>
          Columns <span className="bdt__mono">{columns.join(', ')}</span>
        </p>
        <Button variant="ghost" size="sm" icon={Download} onClick={sample}>
          Download sample
        </Button>
      </div>

      <input
        ref={input}
        id={`${uid}-file`}
        type="file"
        accept=".csv,text/csv"
        className="u-sr-only bdt__fileinput"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          read(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {file ? (
        <div className="bdt__file">
          <FileText size={16} strokeWidth={1.8} aria-hidden />
          <span className="bdt__filename">{file.name}</span>
          <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
            Replace
          </Button>
        </div>
      ) : (
        <button
          ref={chooser}
          type="button"
          className={`bdt__drop ${dragging ? 'is-over' : ''}`}
          onClick={() => input.current?.click()}
        >
          <Upload size={18} strokeWidth={1.8} aria-hidden />
          <span>Choose a CSV file or drop it here</span>
        </button>
      )}

      <FieldError id={`${uid}-file-err`} text={fileError} />
      <FieldError id={`${uid}-parse-err`} text={preview?.error} />
      {preview && !preview.error && preview.ready.length === 0 && (
        <p className="bdt__error">Nothing in this file can be {verb}.</p>
      )}

      {preview && !preview.error && preview.ready.length > 0 && (
        <PreviewList
          title={mode === 'tokens' ? 'To import' : 'To assign'}
          rows={preview.ready.map((r) => ({ key: r.serial, serial: r.serial, note: r.detail }))}
        />
      )}
      {preview && !preview.error && preview.skipped.length > 0 && (
        <PreviewList
          title="Skipped"
          rows={preview.skipped.map((s) => ({ key: `line-${s.line}`, line: s.line, serial: s.serial || 'No serial', note: s.reason }))}
        />
      )}
    </div>
  )
}

function PreviewList({ title, rows }: { title: string; rows: { key: string; line?: number; serial: string; note: string }[] }) {
  const uid = useId()
  return (
    <section className="bdt__preview" aria-labelledby={uid}>
      <h3 id={uid} className="bdt__sublabel">
        {title}
      </h3>
      <ul>
        {rows.slice(0, ROWS_SHOWN).map((r) => (
          <li key={r.key}>
            {r.line !== undefined && <span className="bdt__line">Line {r.line}</span>}
            <span className="bdt__mono">{r.serial}</span>
            <span>{r.note}</span>
          </li>
        ))}
      </ul>
      {rows.length > ROWS_SHOWN && <p className="bdt__quiet">And {plural(rows.length - ROWS_SHOWN, 'more row')}.</p>}
    </section>
  )
}

/* --- Sync ------------------------------------------------------------------------------- */

export function SyncForm({
  token,
  holder,
  codes,
  onCodes,
  error,
  focusTick,
  onSubmit,
}: {
  token: HardwareToken | null
  holder: string | null
  codes: string[]
  onCodes: (next: string[]) => void
  error: string | null
  /** Bumped by a Sync that failed; focus goes to the first box that is short. */
  focusTick: number
  onSubmit: () => void
}) {
  const uid = useId()
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const latest = useRef(codes)
  useEffect(() => {
    latest.current = codes
  })

  // The first box on opening; after a failed Sync, the first box without six digits.
  useEffect(() => {
    const short = latest.current.findIndex((c) => c.length !== TOKEN_DIGITS)
    boxes.current[short === -1 ? 0 : short]?.focus()
  }, [focusTick])

  if (!token) return <p className="bdt__lede">No token with this serial number.</p>

  const set = (i: number, value: string) => {
    const next = [...codes]
    next[i] = value
    onCodes(next)
  }

  return (
    /* Two groups at the fields' 16px, each tight inside: which token and what
       to do, then the codes with their error — the spacing Add token and Assign
       have, where the lede had sat 8px over the code labels. */
    <div className="bdt__sync">
      <div className="bdt__syncgroup">
        <p className="bdt__tokenline">
          <span className="bdt__mono">{token.serial}</span>
          <span>{holder ?? 'Unassigned'}</span>
        </p>
        <p className="bdt__lede">Press the token's button three times and enter each code in order.</p>
      </div>

      <div className="bdt__syncgroup">
        <div className="bdt__codes">
          {CODE_NAMES.map((name, i) => (
            <div key={name} className="bdt__code">
              <label htmlFor={`${uid}-c${i}`}>{name}</label>
              <input
                id={`${uid}-c${i}`}
                ref={(el) => {
                  boxes.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={TOKEN_DIGITS}
                placeholder="000000"
                value={codes[i]}
                aria-invalid={!!error}
                aria-describedby={error ? `${uid}-err` : undefined}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, TOKEN_DIGITS)
                  set(i, digits)
                  if (digits.length === TOKEN_DIGITS && i < 2) boxes.current[i + 1]?.focus()
                }}
                onPaste={(e) => {
                  const all = splitCodes(e.clipboardData.getData('text'))
                  if (!all) return
                  e.preventDefault()
                  onCodes(all)
                  boxes.current[2]?.focus()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && codes[i] === '' && i > 0) boxes.current[i - 1]?.focus()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSubmit()
                  }
                }}
              />
            </div>
          ))}
        </div>
        <FieldError id={`${uid}-err`} text={error} />
      </div>
    </div>
  )
}

/* --- Closing a slider with typed work ------------------------------------------------------

   The device profile create drawer's question, asked the same way: a small
   centred dialog over the slider, Keep editing first and Discard in red. */
export function DiscardDialog({
  open,
  title,
  onKeep,
  onDiscard,
}: {
  open: boolean
  title: string
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onKeep}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onKeep}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard
          </Button>
        </>
      }
    >
      <p className="bx-leave__body">What you have entered will not be saved.</p>
    </Modal>
  )
}
