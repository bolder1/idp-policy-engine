import { ArrowRight, Check, Clock, Gauge, History, Laptop, MapPin, Pencil, Plus, Power, RotateCcw, Smartphone, Users, Wifi, X } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Face } from '../../../../faces'
import { AppLogo } from '../../../../logos/AppLogo'
import { useBrand } from '../../../../store'
import type { FormField } from '../../../testing/sign-in-form'
import { tokenOfField, tokenValue } from '../../../testing/sign-in-sentence'
import { ValueMark } from '../../SignInCard'
import { SAVED_SIGN_INS } from '../../phase'
import type { RunLayoutProps } from '../types'
import { IdentityChips } from './IdentityChips'
import { identityChips, rowFacts, rowState, whoLabel, type RowFactIcon } from './sign-in-row'
import './sign-in-row.css'

/* -----------------------------------------------------------------------------
   THE SIGN-IN ROW — the same top for Focus, Brief and Jarvis (owner, 3 Oct
   2026: "all 3 should have the same things … just a basic replay button").
   One line, 40 tall, placed at the top centre of the stage (outside the
   zoomed world: pass it in RunStage's `overlay`, keep `pad.top = 64`):

     [face Maya Iyer → logo AWS Console] | [wifi Office network] [laptop Windows 11 laptop · registered] [+ Risk score]
       | [Not run] | [pencil] [↻ Replay]

   It draws `run.form` — the sign-in the plan is OF — never the panel's edits
   not yet run (those say "Not run"). Words are ink; colour lives on the icons
   only (the person and a group blue, the app its own logo, the facts violet).

     Who → App   one button → onPressPerson, "Edit sign-in: Maya Iyer on AWS Console"
     a fact      a button → onAdd(field), "Change the device"; a fact the rules
                 read but not stated: a dashed "+ Device" → onAdd(field) (opens
                 the panel on that field; nothing runs)
     state       "Not run" / "Changed by device" / "Expected Allow with 2FA ✓"
     pencil      "Edit sign-in", aria-pressed while the panel is open → onPressPerson
     Replay      → onReplay; its words never change; aria-disabled while the run
                 plays (title "The run is playing"). No Skip, no Stop.
     Save        "Save as test" → onSave, only once SAVED_SIGN_INS (phase.ts) is on

   Several identities in one Run (owner, 5 Oct 2026: "one run each, switch";
   `run.identities`, layouts/types.ts): the Who part is a chip per identity,
   in pick order, then → App —

     [MI Maya Iyer ✓] [▣ Finance ✓] [RM Ravi Menon ✕] → [logo] AWS Console | …

   — the one the canvas tells pressed, as the pencil is; a press on another
   switches the canvas to it (`onPickIdentity`), and never opens the panel —
   the pencil and → App still do that. Once the run on screen has landed each
   chip marks that identity's own answer (12 px, the row's ok / bad / amber /
   muted); before, no marks, so no result is ahead of the story. One identity:
   the row is the Who → App it always was. The chips are IdentityChips.tsx,
   which the run line over the column canvas draws too.

   Too wide for the stage: the facts go icon-only (their words in the title and
   name), then the chips' names fold to the first name (a group's is cut), then
   to the face alone, then the app's name ellipses — and with chips, squeezed
   under a few letters, goes, its logo staying. It never wraps or scrolls.

   API (view builders):
     <SignInRow run={props} look="light" | "dark" | "jarvis"
                reading={field | null}        // Jarvis: the fact a check reads now — a blue ring
                previewing={answer?.previewing} // a preview's fields — an amber dashed ring
                lit={'person' | field | null} // a citation hovered elsewhere — a blue ring
                inline? />                    // in flow, not placed over the stage
   Hooks for a view: [data-sir="who"], [data-fact="<field>"] on the row's parts.

   The sign-in and nothing else (owner, 5 Oct 2026: "segregate both: one for the
   form, one for the canvas functions"): the voice, the views and Questions,
   which Focus had put here for a day, are the canvas's own bar at its foot
   (focus2-canvasbar.tsx).
   -------------------------------------------------------------------------- */

export type SignInRowLook = 'light' | 'dark' | 'jarvis'

export interface SignInRowProps {
  /** The props the layout was handed. */
  run: RunLayoutProps
  look?: SignInRowLook
  /** The field the check being read is about (Jarvis): a 1 px blue ring — the engine working. */
  reading?: FormField | null
  /** The fields a preview changed (Answer.previewing): an amber dashed ring — a preview, not the run. */
  previewing?: readonly FormField[] | null
  /** A citation hovered elsewhere: 'person' lights Who → App, a field its fact. */
  lit?: 'person' | FormField | null
  /** In flow (the parent places it) instead of over the stage's top centre. */
  inline?: boolean
  className?: string
}

const FACT_ICON: Record<RowFactIcon, typeof Wifi> = { network: Wifi, place: MapPin, time: Clock, laptop: Laptop, phone: Smartphone, risk: Gauge, assume: Power }

/* How far the row has folded to fit: 0 whole; 1 the facts icon-only; with chips, 2 their names short, 3 the faces
   alone, each answer on its face's corner, and 4 the app's logo without its name — only once the name has less room
   than a few letters, where an ellipsis would be a cut glyph. The app's name ellipses, in CSS, at any fold before. */
type Fold = 0 | 1 | 2 | 3 | 4
/* The least room the app's name is drawn in (about three letters and the ellipsis). */
const APP_MIN = 32

export function SignInRow({ run, look = 'light', reading = null, previewing = null, lit = null, inline = false, className = '' }: SignInRowProps) {
  const { form, rows, asGroup, plan, running, unrun, changed, expected, editing, onPressPerson, onAdd, onReplay, onSave, onPickIdentity } = run
  const { users, groups, apps, zones, policies } = useBrand()

  const person = users.find((u) => u.id === form.personId) ?? null
  const groupName = asGroup ? (groups.find((g) => g.id === asGroup || g.name === asGroup)?.name ?? asGroup) : null
  const who = groupName ? `Anyone in ${groupName}` : (person?.name ?? 'Choose a person')
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = app?.name ?? plan.appName ?? ''
  const names = run.policies ?? policies
  const facts = useMemo(() => rowFacts(form, rows, { zones, policyName: (id) => names.find((p) => p.id === id)?.name }), [form, rows, zones, names])
  const state = rowState({ plan, running, unrun, changed, expected })
  /* A Run of several identities: a chip each, marked once the run on screen has landed (the layout's own `running`
     — Focus hands the row its presented one — so a mark never arrives before the picture it is about). */
  const chips = useMemo(() => identityChips(run.identities, !running), [run.identities, running])
  const chipsKey = chips ? chips.map((c) => `${c.key}:${c.mark ?? ''}`).join('|') : ''
  const litWho = lit === 'person' || reading === 'person'

  /* Fit: too wide for the stage → fold one step at a time (`Fold`), then the app's name ellipses, in CSS. */
  const ref = useRef<HTMLDivElement | null>(null)
  const [fold, setFold] = useState<Fold>(0)
  const most: Fold = chips ? 4 : 1
  const compact = fold >= 1
  const [room, setRoom] = useState(0)
  useLayoutEffect(() => {
    const host = ref.current?.parentElement
    if (!host || inline) return
    const measure = () => setRoom(host.clientWidth)
    measure()
    let ro: ResizeObserver | null = null
    try {
      ro = new ResizeObserver(measure)
      ro.observe(host)
    } catch {
      /* No observer: the first measure holds. */
    }
    return () => ro?.disconnect()
  }, [inline])
  /* A new width, new facts or new chips (a mark arriving widens one): try the full row again, then fold if it does
     not fit. Each step is measured before the paint, so the row is never seen overflowing on its way down. */
  useLayoutEffect(() => setFold(0), [room, facts, state?.words, chipsKey])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || fold >= most) return
    const app = el.querySelector<HTMLElement>('.sir__app')
    const over = el.scrollWidth > el.clientWidth + 1 || (app !== null && app.scrollWidth > app.clientWidth + 1)
    /* The faces are as far as the chips fold: past them only a name squeezed to a glyph or two goes. */
    const next = fold < 3 ? over : app !== null && app.scrollWidth > app.clientWidth + 1 && app.clientWidth < APP_MIN
    if (next) setFold((fold + 1) as Fold)
  }, [fold, most, room, facts, state?.words, who, appName, look, chipsKey])

  const preview = new Set(previewing ?? [])
  const ring = (f: FormField) => (reading === f ? ' is-reading' : preview.has(f) ? ' is-preview' : lit === f ? ' is-lit' : '')

  return (
    <div ref={ref} className={`sir${inline ? ' is-inline' : ''}${compact ? ' is-compact' : ''}${fold >= 3 ? ' is-faces' : ''}${className ? ` ${className}` : ''}`} data-look={look} role="toolbar" aria-label="Sign-in">
      {chips ? (
        /* Several identities: the chips switch, → App edits. Two parts of the row, not one: the chips keep their width
           and → App is what gives, so even a row out of room clips its own app and never runs over the facts. */
        <>
          <IdentityChips chips={chips} fold={fold >= 3 ? 'face' : fold >= 2 ? 'short' : 'name'} lit={litWho} onPick={onPickIdentity} />
          <button type="button" className="sir__to" aria-label={whoLabel(chips.map((c) => c.name).join(', '), appName)} title="Edit the sign-in" onClick={onPressPerson}>
            <ArrowRight className="sir__arrow" size={14} strokeWidth={2} aria-hidden />
            {app && (
              <span className="sir__logo" aria-hidden>
                <AppLogo appId={app.id} name={app.name} size={18} />
              </span>
            )}
            {fold < 4 && <span className="sir__app">{appName || 'Choose an application'}</span>}
          </button>
        </>
      ) : (
        <button type="button" className={`sir__who${litWho ? ' is-lit' : ''}`} data-sir="who" aria-label={whoLabel(who, appName)} title="Edit the sign-in" onClick={onPressPerson}>
          {groupName ? (
            <span className="sir__grp" aria-hidden>
              <Users size={14} strokeWidth={2.2} />
            </span>
          ) : person ? (
            <span className="sir__face">
              <Face kind="user" name={person.name} size="sm" decorative />
            </span>
          ) : null}
          <span className="sir__name">{who}</span>
          <ArrowRight className="sir__arrow" size={14} strokeWidth={2} aria-hidden />
          {app && (
            <span className="sir__logo" aria-hidden>
              <AppLogo appId={app.id} name={app.name} size={18} />
            </span>
          )}
          <span className="sir__app">{appName || 'Choose an application'}</span>
        </button>
      )}

      {facts.length > 0 && <span className="sir__div" aria-hidden />}
      <span className="sir__facts">
        {facts.map((f) => {
          const Icon = FACT_ICON[f.icon]
          const word = f.label.toLowerCase()
          /* The value's own mark, as the Configure panel draws it (owner, 3 Oct 2026: "use the same icon as inside the
             config panel — if I select Windows, show the Windows icon, not a dummy one"); the kind's icon only where
             the panel has no value to mark. */
          const tok = f.stated ? tokenOfField(f.field) : null
          const mark = tok ? <ValueMark v={tokenValue(tok, form, { people: users, apps, zones, rows })} /> : null
          return f.stated ? (
            <button key={f.field} type="button" className={`sir__fact${ring(f.field)}`} data-fact={f.field} title={compact ? `${f.value} · change the ${word}` : `Change the ${word}`} aria-label={compact ? `${f.label}: ${f.value}. Change the ${word}` : undefined} onClick={() => onAdd(f.field)}>
              {mark ? (
                <span className="sir__ficon sir__fmark" aria-hidden>
                  {mark}
                </span>
              ) : (
                <Icon className="sir__ficon" size={14} strokeWidth={2} aria-hidden />
              )}
              {!compact && <span className="sir__val">{f.value}</span>}
            </button>
          ) : (
            <button key={f.field} type="button" className={`sir__fact is-add${ring(f.field)}`} data-fact={f.field} title={`Add the ${word}: not stated`} aria-label={`Add the ${word}`} onClick={() => onAdd(f.field)}>
              <Plus className="sir__ficon" size={13} strokeWidth={2.4} aria-hidden />
              {!compact ? <span className="sir__val">{f.label}</span> : <Icon className="sir__ficon" size={13} strokeWidth={2} aria-hidden />}
            </button>
          )
        })}
      </span>

      {state && (
        <>
          <span className="sir__div" aria-hidden />
          <span className={`sir__state is-${state.kind}`} role="status">
            {state.kind === 'changed' && <History size={13} strokeWidth={2} aria-hidden />}
            {state.kind === 'expected' && state.met === true && <Check className="sir__met" size={13} strokeWidth={2.6} aria-label="met" />}
            {state.kind === 'expected' && state.met === false && <X className="sir__missed" size={13} strokeWidth={2.6} aria-label="not met" />}
            {state.words}
          </span>
        </>
      )}

      <span className="sir__div" aria-hidden />
      <button type="button" className={`sir__pencil${editing ? ' is-on' : ''}`} aria-label="Edit sign-in" aria-pressed={editing === true} title="Edit sign-in" onClick={onPressPerson}>
        <Pencil size={14} strokeWidth={2.2} aria-hidden />
      </button>
      <button type="button" className="sir__replay" aria-disabled={running || undefined} title={running ? 'The run is playing' : 'Run this sign-in again'} onClick={() => !running && onReplay?.()}>
        <RotateCcw size={14} strokeWidth={2.2} aria-hidden />
        Replay
      </button>
      {SAVED_SIGN_INS && onSave && (
        <button type="button" className="sir__replay" onClick={onSave}>
          Save as test
        </button>
      )}
    </div>
  )
}
