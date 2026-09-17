import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  CirclePlus,
  Cpu,
  FileSpreadsheet,
  Info,
  Lock,
  Minus,
  Monitor,
  Network,
  PanelTop,
  Plus,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react'

import { Badge, Button, IconButton, MenuButton, NumberStepper, SearchBox, Tip, TipDot, TipMark, Toggle } from '../kit'
import { TierPick } from '../tier-pick'
import { Picker } from '../picker'
import {
  DEFAULT_MAX_DEVICES,
  REGISTRATION_LABEL,
  TIER_WEIGHT,
  VERSION_OPS,
  asksReach,
  blockedAttributes,
  ITEM_NOUN,
  countLabel,
  isRuleValue,
  isVersionText,
  offeredAttributes,
  rosterFromCsv,
  rosterNeedsMac,
  tierOf,
  versionOp,
  type AttrCategory,
  type Attribute,
  type AttrConfigValue,
  type AttrRuleValue,
  type FingerprintProfile,
  type ProfileMode,
  type ProfileReach,
  type Registration,
  type Roster,
} from '../fingerprint'
import { EmptyState, NoMatches } from '../empty'
import { BrandMark } from '../logos/BrandMark'
import { CHECK_BRAND } from '../logos/check-brands'
import { summarise } from './profile-aside'
import { checkName, versionError, type Choice } from './device-profile-choices'
import { agentNote, filterAttributes, shownSelection, toggleAllShown, toggleRun } from './device-profile-wizard-model'

/* -----------------------------------------------------------------------------
   Device profiles · the parts a profile is drawn from.

   Moved out of `DeviceFingerprintV2.tsx` unchanged (15 Sep 2026), when three
   create flows arrived that draw the same things the profile page does: the
   type and reach tiles, the catalogue picker, the check list with each check's
   value, the enrolment form, and the two side panels. One module that the
   page, the wizard and the name-first dialog all import, rather than a wizard
   importing the screen that imports it.

   Components only. The plain helpers these read — the tile choices, a check's
   name and its version error — are in `device-profile-choices.ts`, because a
   .tsx that exports anything but components loses fast refresh.
   -------------------------------------------------------------------------- */

/* The mark on an attribute row is its CATEGORY's, not its own.

   `ATTR_ICON` stood here — a hand-picked glyph for fourteen of the fifty-one
   attributes, with everything else falling back to a shield. On the profile
   page, which shows at most fourteen chosen rows, that was defensible. On the
   picker it would have been twenty-four identical shields in a column of
   thirty-eight, and a column of identical marks is noise with a cost.

   A category mark is the better answer for a reason beyond arithmetic. The
   group headings that used to file this list are gone — they were furniture
   around three-word rows — and their one real job was saying which family a row
   belongs to. This column does that job in 16px, on every row, at every width,
   with no heading and no scroll position to lose. The name already says WHICH
   member; the mark says which family.

   `CAT_META` before it carried an icon AND a tint per category, and the tint is
   what was wrong: five hues down a flat list is a list wearing its filing scheme
   as decoration, which is the thing 60/30/10 forbids. The glyph was never the
   problem, so the glyph comes back on its own. */
const CAT_ICON: Record<AttrCategory, typeof Cpu> = {
  Platform: Monitor,
  Hardware: Cpu,
  Browser: PanelTop,
  Security: ShieldCheck,
  Network: Network,
  Client: Smartphone,
  Behaviour: Activity,
}

/* A category is optional on the type, so the shield stays as the floor — it is
   reached by nothing in either catalogue today. */
const markFor = (a: Attribute) => (a.category ? CAT_ICON[a.category] : ShieldCheck) ?? ShieldCheck

/* A check's mark, wherever a check is drawn on this page: the brand's own logo
   when the check is about a brand (see `CHECK_BRAND`), the category glyph when
   it is not. `is-brand` lets a monochrome logo (Apple) take the text colour
   rather than the muted grey a filing glyph wears. */
export function CheckMark({ attr }: { attr: Attribute }) {
  const brand = CHECK_BRAND[attr.id]
  const Mark = markFor(attr)
  return (
    <span className={`bfp2__pickico${brand ? ' is-brand' : ''}`} aria-hidden>
      {brand ? <BrandMark brand={brand} size={15} /> : <Mark size={15} strokeWidth={1.7} />}
    </span>
  )
}

/* `AttrFilter` — a search and a row of category pills, shared by the picker and
   the profile page — stood here.

   It was built for thirty-eight. The master is fourteen: one screen, no groups,
   nothing to narrow. A filter over a list you can already see whole is a
   control that can only ever tell you what you were already looking at, and the
   pills were five of them.

   The picker keeps a plain search, because a modal that opens on a scroller is
   still worth being able to jump around in. The profile page has none — it
   holds at most fourteen rows and usually fewer. */

/* `CAT_META` and `metaOf` stood here — a tint and an icon per category, for
   the rail that filed thirty-eight attributes into five columns of one.

   The rail became a dropdown and then went (16 Sep 2026); the list is flat, so there is no per-category
   surface left to tint: a `<option>` cannot carry a colour that means anything,
   and a flat list tinted five ways is a list wearing its filing scheme as
   decoration. The tints themselves live on in `--cat-*` for the one thing that
   still uses them — a selected row takes its category's colour rather than the
   brand, so a search returning hits from four families reads as four families.

*/

/* `config`, `weights`, `onValue`, `onWeight` and `settings` were threaded
   through here to reach the settings block under each ticked row.

   That block is gone from both callers, so the whole chain went with it.
   `settings` was already a flag for "off while creating, on once the profile
   exists" — the answer is now "off everywhere", which is the flag having become
   a constant, and a constant is not a prop.

   Nothing is lost by not asking: an untouched attribute keeps the weight and
   the precision the catalogue gives it. This step says WHAT is watched; the
   profile's own attributes list says what each one is set to. */
export function AttrStep({
  mode,
  reach,
  picked,
  setPicked,
  onBack,
}: {
  mode: ProfileMode
  /** Null before the question has been asked; reads as "no agent", the safe half. */
  reach: ProfileReach | null
  picked: string[]
  setPicked: (ids: string[]) => void
  /* Absent on the detail page, where there is no step to go back to. */
  onBack?: () => void
}) {
  const [q, setQ] = useState('')
  /* The category dropdown beside the search went (owner, 16 Sep 2026), and
     "Selected only" went with it — it rode in the same control. The search
     still matches a row's category, and the bar's count says what is chosen. */

  /* Where the last press landed, so the next one can shift-select a run.

     A catalogue this long is picked in runs — "all of Hardware except the two
     serials", "the four browsers" — and thirty-eight individual presses is the
     part of this panel that is actually slow. The anchor is an id rather than
     an index: the list reorders under searching, and an index into a list that
     moved selects the wrong rows. */
  const anchor = useRef<string | null>(null)

  const offered = offeredAttributes(mode, reach)

  /* Counted against what is OFFERED, never against the whole catalogue. "6 of
     38 selected" on an agentless profile names a denominator eighteen of whose
     rows are not on the screen and cannot be reached from it. */
  const chosen = offered.filter((a) => a.always || picked.includes(a.id)).length

  /* One list, no groups and no headings. The catalogue is written in family
     order, so related rows still arrive together, and the family mark on each
     row says which one it is. The always-collected rows are lifted to the
     front (see `filterAttributes`): a locked row between two tickable ones
     reads as one you failed to untick. */
  const ordered = filterAttributes(offered, q)

  /* The rows an agent would unlock, under the same search as the list, so the
     note below never names signals the search has nothing to do with. */
  const blockedShown = filterAttributes(blockedAttributes(mode, reach), q)

  /* One press, or a shift-press over a run — see `toggleRun`. No press removes
     the control it was made on any more: without "Selected only" the rows stay
     put, and Select all is always on the bar. */
  const toggle = (id: string, span: boolean) => {
    const next = toggleRun(picked, ordered, anchor.current, id, span)
    anchor.current = id
    setPicked(next)
  }

  return (
    <div className="bfp2__pick">
      <PickBar mode={mode} q={q} onQuery={setQ} shown={ordered} picked={picked} chosen={chosen} onPick={setPicked} />

      {/* --- One list, one check to a line ------------------------------------

          Nothing is boxed and nothing is grouped. A row is a tick, a mark, a
          name and — where there is something to say — a pill. No fill, no
          border, no divider, no heading above it.

          One column at every width: a second column in 560px is two cells of
          260, and the pill on a long name was the first thing to give — "Not
          collected yet" read as "Not collected y…", which is the one word on
          the row that changes the decision. */}
      <div className="bfp2__picklist">
        {ordered.length === 0 ? (
          /* A search that only matches what an agent would unlock says so, and
             offers the way to change it where there is one. */
          <NoMatches
            compact
            noun={ITEM_NOUN[mode].many}
            query={q}
            onClear={() => setQ('')}
            blurb={q.trim() && blockedShown.length > 0 ? agentNote(blockedShown) : undefined}
            secondary={
              q.trim() && blockedShown.length > 0 && onBack ? (
                <Button variant="secondary" onClick={onBack}>
                  Change what it reads
                </Button>
              ) : undefined
            }
          />
        ) : (
          ordered.map((a) => (
            <AttrPickRow
              key={a.id}
              attr={a}
              on={a.always || picked.includes(a.id)}
              onToggle={(span) => toggle(a.id, span)}
            />
          ))
        )}
      </div>

      {/* Named, not counted: the names are what tell you whether the ones you
          are missing are ones you wanted. Not under an empty list, which says
          it already. */}
      {ordered.length > 0 && blockedShown.length > 0 && (
        <p className="bfp2__locked">
          <Lock size={12} strokeWidth={2} aria-hidden />
          <span>{agentNote(blockedShown)}</span>
          {onBack && (
            <button type="button" className="bfp2__clear" onClick={onBack}>
              Change what it reads
            </button>
          )}
        </p>
      )}
    </div>
  )
}

/* --- The bar over a check list ------------------------------------------------------

   Shared by the catalogue drawer (`AttrStep`) and the wizard's inline list, so
   the two lists that choose checks work the same way. One line: Select all,
   the search, and how many are ticked.

   Select all and Clear all are ONE control (owner, 16 Sep 2026), in place of
   "Clear the rest". It reaches the rows on screen — under a search, the rows
   that match — and never the always-on ones, which are not a choice. While
   every one of those is ticked it reads Clear all and clears them; otherwise it
   reads Select all and ticks them. Its box is the list's own tick — empty, a
   dash for some, full for all — in the same column as the ticks under it.

   A button rather than a checkbox: its name says what a press does next, and a
   checkbox whose name changed with its state would announce "Clear all,
   checked". The count beside it is the state in words. */
export function PickBar({
  mode,
  q,
  onQuery,
  searchRef,
  shown,
  picked,
  chosen,
  onPick,
}: {
  mode: ProfileMode
  q: string
  onQuery: (next: string) => void
  searchRef?: Ref<HTMLInputElement>
  /** The rows on screen, in order: what Select all reaches. */
  shown: Attribute[]
  picked: string[]
  /** How many are ticked, always-on rows included, since they are ticked too. */
  chosen: number
  onPick: (next: string[]) => void
}) {
  const state = shownSelection(picked, shown)
  const noun = ITEM_NOUN[mode].many
  return (
    <div className="bfp2__pickbar">
      <button
        type="button"
        className={`bfp2__selectall${state === 'some' || state === 'all' ? ' is-on' : ''}`}
        disabled={state === 'empty'}
        onClick={() => onPick(toggleAllShown(picked, shown))}
      >
        <span className="bx-tick" aria-hidden>
          {state === 'some' ? <Minus size={11} strokeWidth={3.2} /> : <Check size={11} strokeWidth={3.2} />}
        </span>
        {state === 'all' ? 'Clear all' : 'Select all'}
      </button>
      <SearchBox
        value={q}
        onChange={onQuery}
        placeholder={`Search ${noun}…`}
        label={`Search ${noun}`}
        inputRef={searchRef}
      />
      {/* No denominator: the list is on screen. */}
      <span className={`bfp2__pickcount ${chosen ? 'is-on' : ''}`}>{chosen} selected</span>
    </div>
  )
}

/* --- Pick one: a tile per answer --------------------------------------------------

   Three places on this screen ask for one answer out of two — what kind of
   profile, and (twice) what its collector can read.

   They were cards with a paragraph each, which was most of a screen. Then they
   were bare rows — a mark, an icon and a name — which went too far the other
   way: two names floating in 760px said nothing about what either choice does,
   and the right-hand one started in the middle of nowhere.

   So each answer is a tile that fills its half: the icon, the name, ONE line of
   what it is (with a count where there is one), and the `?` for the rest. The
   line is what lets you choose without opening a tooltip; the tooltip is for the
   consequence you check once. Tiles are equal height and the pair reads as a
   pair.

   It behaves as a radio group: one tab stop, the arrow keys move the answer.
   `Choice`, `kindChoices` and `reachChoices` are in `device-profile-choices.ts`. */
export function ChoiceTiles<T extends string>({
  options,
  value,
  onPick,
  pending,
  legend,
  labelledBy,
}: {
  options: Choice<T>[]
  value: T | null
  onPick: (id: T) => void
  /** A switch waiting on confirmation: marked, not yet the answer. */
  pending?: T | null
  legend?: string
  labelledBy?: string
}) {
  const baseId = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  /* The tab stop is the answer, or the first tile while there is none. */
  const stop = value ?? options[0]?.id

  const onKeyDown = (e: KeyboardEvent, at: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = options[(at + step + options.length) % options.length]
    refs.current[next.id]?.focus()
    onPick(next.id)
  }

  return (
    <fieldset className="bfp2__choices" aria-labelledby={labelledBy}>
      {legend && <legend>{legend}</legend>}
      {options.map((o, i) => {
        const on = value === o.id
        const Ico = o.icon
        const descId = `${baseId}-${o.id}`
        return (
          <Fragment key={o.id}>
            <button
              ref={(el) => {
                refs.current[o.id] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-describedby={descId}
              tabIndex={o.id === stop ? 0 : -1}
              className={`bfp2__answer bfp2__choice${on ? ' is-on' : ''}${pending === o.id ? ' is-pending' : ''}`}
              onClick={() => onPick(o.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="bfp2__answerbody">
                <span className="bfp2__answerhead">
                  <span className="bfp2__answerico" aria-hidden>
                    <Ico size={16} strokeWidth={1.8} />
                  </span>
                  <span className="bfp2__answername">{o.label}</span>
                  <TipMark text={o.tip} />
                  {o.tag && <Badge>{o.tag}</Badge>}
                  {o.meta && <span className="bfp2__answermeta">{o.meta}</span>}
                </span>
                <span className="bfp2__answerline">{o.summary}</span>
              </span>
            </button>
            <span id={descId} hidden>
              {o.tip}
            </span>
          </Fragment>
        )
      })}
    </fieldset>
  )
}

/* One row in the catalogue: a tick, a name, and what the attribute is for.

   --- The row is the button now -------------------------------------------------

   It used to be a `<div>` holding a SHRUNKEN `<button>` plus a `TipDot`
   sibling, with `::after` stretching the toggle's hit area back across the row
   and a `z-index` on the mark so the row would not swallow its press. Every
   line of that was machinery to keep one real `<button>` out of another, and
   the only reason a second button was on the row at all is that the attribute's
   purpose had nowhere to live except behind a `?`.

   The purpose is ON the row now, so the mark goes, and all of it goes with the
   mark: the shrunken toggle, the `::after`, the `z-index`, the `margin-top: 11px`
   optical nudge, and `.bfp2__pickmain`. One element, one press — and thirteen
   to thirty-eight fewer tab stops, which is the same objection this file
   already records against putting a focusable dot on every row of a list.

   What survives of the mark is `TipMark`, which renders a `<span>` rather than
   a button and is therefore legal inside this one. It is `display: none` at
   every width where the sentence is on the row, and returns only below the
   width where the sentence has nowhere to live. */
/* Six props went with the settings block: `mode`, `config`, `weights`,
   `settings`, `onValue` and `onWeight`. A row chooses; it does not configure,
   so it needs the attribute, whether it is on, and a way to say otherwise. */
function AttrPickRow({
  attr,
  on,
  onToggle,
}: {
  attr: Attribute
  on: boolean
  /** The shift key: extend the last press to this row. See `toggle`. */
  onToggle: (span: boolean) => void
}) {
  /* Everything the row says, and it is three things at most.

     A pass at this put the attribute's whole `purpose` sentence in a third lane
     across the width the cards used to waste. At thirteen rows it read well. At
     thirty-eight it was a wall of grey prose, and the panel's job is not to be
     read — it is to be ticked. The sentence is back on its mark, where it costs
     nothing until somebody wants it. The width that bought is not spent on a
     second column either — see the list in `AttrStep` — so the pill sits right
     after the name, the way it does on the profile page's own check list.

     `Not collected yet` stays on the row rather than only on the inner page:
     whether a signal is collected at all is part of deciding to include it, and
     learning it afterwards is learning it too late. */
  /* "Always on" is not a pill here any more. The check list swapped it for a
     lock at the end of the line (owner, 15 Sep 2026), and the create flows put
     this list and that one on consecutive steps, where one row wore two marks
     for one fact (15 Sep 2026). The lock is below, on the always-on row. */
  const state = attr.phase === 2 && (
    <span className="bfp2__pickstate">
      <Badge tone="notice">Not collected yet</Badge>
    </span>
  )

  /* An always-collected row is not a disabled button. It is not a button.

     `disabled` was right while the mark was a sibling OUTSIDE the toggle: there
     was nothing to announce and nothing to explain on press, and the sentence
     stayed reachable on a control of its own. The row IS the button now and the
     mark is inside it — and a disabled button suppresses the pointer events its
     descendants need, so a locked row's `?` would have gone quietly dead.

     There is no decision on this row, so there is no control: a `<div>`, a real
     `TipDot` that keeps a keyboard path to the sentence, and no dead entry in
     the tab order. Its lock says why at the end of the line, as the check
     list's does where a Remove would be. */
  if (attr.always) {
    return (
      <div className="bfp2__pickrow is-fixed is-on">
        <span className="bx-tick" aria-hidden>
          <Check size={11} strokeWidth={3.2} />
        </span>
        <CheckMark attr={attr} />
        <span className="bfp2__pickname">
          <span className="bfp2__pickword">{attr.name}</span>
          <TipDot label={attr.name} text={attr.purpose} />
        </span>
        {state}
        <span className="bfp2__picklock">
          <Tip text="Always on — can't be removed">
            <button type="button" className="bfp2__checklock" aria-label={`${attr.name} is always on`}>
              <Lock size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
        </span>
      </div>
    )
  }

  /* --- The row is the button --------------------------------------------------

     It used to be a `<div>` holding a SHRUNKEN `<button>` plus a `TipDot`
     sibling, with `::after` stretching the toggle's hit area back across the row
     and a `z-index` on the mark so the row would not swallow its press. Every
     line of that was machinery to keep one real `<button>` out of another.

     `TipMark` is that same dot rendered as a `<span>`, which is legal inside a
     button — so the row becomes one element with one press, and the `::after`,
     the `z-index` and the `margin-top: 11px` optical nudge all go with it. It is
     also thirteen to thirty-eight fewer tab stops, which is the objection this
     codebase already records against a focusable dot on every row of a list.

     The mark beside the tick is the row's CATEGORY — see `CAT_ICON`. An earlier
     pass argued it out on the grounds that two small shapes per line compete and
     the checkbox is the one that matters. That held while the list was grouped
     under named headings; with the headings gone this column is the only thing
     left saying which family a row belongs to, and it is 16px against the
     heading rows it replaced. The two shapes do not in fact compete: the tick is
     a filled square that changes on press, the mark is a hairline glyph that
     never changes, and they are 8px apart in a fixed order. */
  return (
    /* A checkbox, as the wizard's inline rows are, so the list that chooses and
       the list that chooses and sets read alike to a screen reader. */
    <button
      type="button"
      role="checkbox"
      className={`bfp2__pickrow ${on ? 'is-on' : ''}`}
      data-id={attr.id}
      aria-checked={on}
      onClick={(e) => onToggle(e.shiftKey)}
    >
      <span className="bx-tick" aria-hidden>
        <Check size={11} strokeWidth={3.2} />
      </span>
      <CheckMark attr={attr} />
      <span className="bfp2__pickname">
        <span className="bfp2__pickword">{attr.name}</span>
        <TipMark text={attr.purpose} />
      </span>
      {state}
    </button>
  )
}

/* --- Basic details' side column: what the answers on the left mean ------------

   The Signals aside's panel, saying what the form is set to rather than what
   the list compares. Read off the draft, so it follows every press before it
   is saved: agent-based says what the agent costs, agentless that there is
   nothing to install, and the enrolment lines follow the registration.

   The agent's two lines were the "Needs the Device Agent" callout under the
   tiles. Prose between two controls is read on every visit; beside them it is
   there for the visit that needs it. The create drawer's callout
   (`AgentPrereq`) went with the drawer (15 Sep 2026): the wizard page's
   Devices step has a side, and shows this panel in it.

   `pendingReach` went (15 Sep 2026) and has not come back: the reach tiles are
   beside this panel again on the Basic details tab (16 Sep 2026), but a pending
   switch to agentless is described by the confirmation under the tiles, not
   previewed here. The wizard's Devices step never had one. */
export function BasicAside({ draft }: { draft: FingerprintProfile }) {
  const { reach, registration, autoRegister } = draft
  const allowed = draft.maxDevices ?? DEFAULT_MAX_DEVICES

  return (
    <aside className="bz7__aside" aria-label="About these settings">
      <div className="bz7__side">
        <h3 className="bz7__sidehead">
          <Info size={14} strokeWidth={2} aria-hidden />
          How this profile works
        </h3>
        <ul className="bfp2__sumlines">
          {asksReach(draft.mode) &&
            (reach === 'agent' ? (
              <>
                <li>
                  <strong>Needs the Device Agent.</strong> Users must install the miniOrange Device Agent on each
                  device they sign in from.
                </li>
                <li>
                  Until they do, sign-in is refused with “Please install the miniOrange Device Agent on your device
                  and try again.”
                </li>
              </>
            ) : (
              <li>Reads the browser, network and location of each sign-in. Nothing to install.</li>
            ))}
          {registration === 'self' ? (
            <li>
              Each user can register up to {allowed} {allowed === 1 ? 'device' : 'devices'}. The next one is refused.
            </li>
          ) : (
            <li>Only devices on the approved roster can sign in. The roster is matched on MAC address.</li>
          )}
          <li>
            {autoRegister
              ? 'A new device registers silently on its first sign-in, including one an attacker signs in from.'
              : 'A new device is challenged on its first sign-in before it is registered.'}
          </li>
        </ul>
      </div>
    </aside>
  )
}

/* --- The checks: what this profile is set to, and one door to change it ---------

   The page shows only what is ON — each check with its value at the end of the
   line — and "Edit" opens the catalogue to add or remove. Showing every offered
   check here, ticked or not, made the page about the catalogue rather than
   about this profile: thirteen rows to read in order to learn that four apply.

   Choosing is the drawer's job (search, Select all, shift-select, the rows an
   agent would unlock); setting is this list's. Both write the page's draft, and
   the SaveBar is still the only thing that commits.

   One check per row, on one line: the mark, the name, its control and a
   Remove. Removing is the one edit that did need the drawer, and it is the one
   people make while looking at the row.

   Drawn as the zone page's IP networks list is, and this time literally
   (owner, 15 Sep 2026, with the zone tab beside it: "make it like this only").
   Each check is a field — the zone's `.bz7__rowin`, same edge, height and
   radius — holding the mark, the name and the check's setting at its right
   end, with the zone's red trash can outside it. Under the list, the zone's
   link: "Add checks", as "Add IP". It had been a card, then four aligned
   columns across the whole work column with an Edit button on the heading
   line; a row of loose parts on a white page read as a table with no table,
   and the field is what makes one check one thing.

   Half the column, as zones are, but not less than 560px: a check is a name
   and a setting where an address is one string, and at zones' 360px floor
   the setting would take the name. */
export function ChosenList({
  draft,
  fullEmpty = false,
  awaitingReach = false,
  title,
  tip,
  onEdit,
  onConfig,
  onWeight,
  onRemove,
}: {
  draft: FingerprintProfile
  /** Draw the empty state as a page's, with the primary Add: for a new profile,
      where this list is all there is to do. */
  fullEmpty?: boolean
  /* The agent question above this list is still open, so there is no Add.

     Which signals exist is that question's answer — 20 agentless, 38 with an
     agent — so an Add here would open a picker whose size is not yet decided,
     and a choice made from the short list would silently mean "agentless". The
     rows that remain are the always-on ones, which are collected whatever the
     answer turns out to be. */
  awaitingReach?: boolean
  /** The heading, when the list is a step rather than a tab — the wizard's "Set
      values". Checks or Signals otherwise. */
  title?: string
  /** What the heading's `?` says. No `?` without it. */
  tip?: string
  onEdit: () => void
  onConfig: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
  onRemove: (id: string) => void
}) {
  const noun = ITEM_NOUN[draft.mode]
  const heading = title ?? noun.many.replace(/^./, (c) => c.toUpperCase())
  const offered = offeredAttributes(draft.mode, draft.reach)
  const chosen = offered.filter((a) => a.always || draft.enabled.includes(a.id))
  /* Always-on first, for the reason the picker gives: a locked row between two
     chosen ones reads as one somebody could have left out. */
  const ordered = [...chosen.filter((a) => a.always), ...chosen.filter((a) => !a.always)]
  /* The stem of each row's error id, so the field it describes can point at it
     — as a zone entry's input points at its `.bz7__rowerr`. */
  const errStem = useId()

  /* Where focus goes once a row has gone. The pressed button leaves with its
     row, so without this a keyboard user is dropped back at the top of the
     document: the next row's Remove instead, then the previous one's, then the
     Add under the list — or the empty state's Add — when no removable row is
     left. The kit's IconButton and Button take no ref, so the refs are on the
     spans around them, as the zone rows hold theirs. */
  const card = useRef<HTMLElement>(null)
  const removers = useRef<Record<string, HTMLSpanElement | null>>({})
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const to = refocus.current
    if (!to) return
    refocus.current = null
    const el =
      removers.current[to]?.querySelector<HTMLButtonElement>('button') ??
      card.current?.querySelector<HTMLButtonElement>('.bz7__addrow, .bempty button')
    el?.focus()
  })

  const remove = (id: string) => {
    const removable = ordered.filter((a) => !a.always)
    const at = removable.findIndex((a) => a.id === id)
    refocus.current = (removable[at + 1] ?? removable[at - 1])?.id ?? '@edit'
    onRemove(id)
  }

  return (
    <section className="bfp2__checks" ref={card}>
      <header className="bfp2__checkshead">
        <h2>{heading}</h2>
        {tip && <TipDot label={`About ${heading.toLowerCase()}`} text={tip} />}
        {/* The count, once, and not at zero: the empty state below says that. */}
        {ordered.length > 0 && <span className="bfp2__checkscount">{countLabel(draft.mode, chosen.length)}</span>}
        {/* No button here. The door to the catalogue is the link under the
            list, where zones put Add IP (owner, 15 Sep 2026) — it had moved up
            to an "Edit checks" button at this line's end, and the owner's
            reference put it back. */}
      </header>

      {ordered.length === 0 && fullEmpty ? (
        /* A new profile's first thing to do, so the primary button and a
           page's air rather than a section's. It opens the same drawer. */
        <EmptyState
          icon={ShieldOff}
          title={`No ${noun.many} yet`}
          blurb={
            draft.mode === 'os'
              ? 'Choose what a device must pass before it can sign in.'
              : 'Choose the signals that recognise a device.'
          }
          action={
            <Button variant="brand" icon={Plus} onClick={onEdit}>
              Add {noun.many}
            </Button>
          }
        />
      ) : ordered.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldOff}
          title={`No ${noun.many}`}
          blurb={
            draft.mode === 'os'
              ? 'A profile with no checks lets every device through.'
              : 'Add at least one signal to recognise a device.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Plus size={14} strokeWidth={2.2} aria-hidden />
              Add {noun.many}
            </Button>
          }
        />
      ) : (
        /* `is-weights` narrows the setting to a weight's width: every row on a
           trusted device carries the same three-word picker, and the width an
           answer needs would come out of the names. */
        <div className={`bfp2__chosen${draft.mode === 'device' ? ' is-weights' : ''}`}>
          <ul className="bz7__fields">
            {ordered.map((a) => {
              const error = versionError(a, draft.config)
              const errId = `${errStem}-${a.id}-err`
              return (
              <ChosenRow
                key={a.id}
                attr={a}
                name={checkName(a, draft.config)}
                error={error}
                errId={errId}
                answer={
                  draft.mode !== 'device' && a.config?.kind === 'choice'
                    ? String(draft.config[a.id] ?? a.config.value)
                    : undefined
                }
                slot={
                  draft.mode === 'device' ? (
                    <TierPick
                      value={tierOf(draft.weights[a.id] ?? a.weight)}
                      label={`${a.name} weight`}
                      onChange={(t) => onWeight(a.id, TIER_WEIGHT[t])}
                    />
                  ) : a.config ? (
                    <AttrControl attr={a} values={draft.config} onChange={onConfig} />
                  ) : null
                }
                removeRef={(el) => {
                  removers.current[a.id] = el
                }}
                onRemove={a.always ? undefined : () => remove(a.id)}
              />
              )
            })}
          </ul>
          {/* The zone's Add IP, word for word in shape: a plus and the noun,
              left on the fields' edge. "Add" although the drawer also takes
              checks away — the trash can on each row is where removing is
              done now, so what the link is for is the adding. Not at zero:
              the empty state has its own Add, and two doors to one drawer on
              an empty pane is one too many. No mousedown guard, unlike the
              zone's: nothing here commits on blur, and the drawer hands focus
              back to whatever had it when it opened, which is this link. */}
          {!awaitingReach && (
            <button type="button" className="bz7__addrow" onClick={onEdit}>
              <CirclePlus size={16} strokeWidth={1.9} aria-hidden />
              Add {noun.many}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/* One chosen check: a plain line with the mark, the name, its dropdown and a
   Remove. What the check reads is behind the `?` beside its name.

   No box around the row. It was drawn as the zone page's field for a moment,
   with the setting inside the outline, and the owner turned that down the
   same day: "don't like this outline, just give me a basic list view with
   dropdowns" (15 Sep 2026). So the row has no edge and the dropdown keeps its
   own, as every other picker in the console does. A setting that can't be
   saved says why under its row.

   The zone rows' Remove — a red trash can, not a grey ✕ — so the two lists
   delete the same way. An always-on check has none: it is collected whatever
   the profile says, and a lock stands in the Remove's place to say so, in the
   same slot outside the field so every field ends on one x. That was an
   "Always on" pill on the name line, and on a Signals list four rows of six
   wore it between the `?` and the weight (owner, 15 Sep 2026). The lock is
   where the question comes up — "why can't I remove this one" — and its words
   are its tooltip and its accessible name. */
function ChosenRow({
  attr,
  name,
  slot,
  answer,
  error,
  errId,
  removeRef,
  onRemove,
}: {
  attr: Attribute
  name: string
  slot: ReactNode
  /** The chosen answer in words, for a control that can cut it short. */
  answer?: string
  /** Why the value on this row can't be saved, or null. */
  error?: string | null
  /** The error line's id, which the setting in `slot` names as its description. */
  errId: string
  removeRef: (el: HTMLSpanElement | null) => void
  onRemove?: () => void
}) {
  return (
    <li>
      <div className="bz7__fieldline">
        <div className="bfp2__chosenbox">
          <CheckMark attr={attr} />
          <span className="bfp2__chosenline">
            {/* The whole name on hover, since a long one is cut to the field. */}
            <span className="bfp2__chosenname" title={name}>
              {name}
            </span>
            <TipDot text={attr.purpose} label={`About ${attr.name}`} />
            {attr.phase === 2 && <Badge tone="notice">Not collected yet</Badge>}
          </span>
          {/* The whole answer on hover too. The list narrows the setting to
              200px when it is narrow (the page at 1100 wide), which cuts
              "Not rooted, jailbroken or tampered", and the trigger names
              itself "Require", so without this the answer could only be read
              by opening it. */}
          {slot && (
            <div className="bfp2__chosenctl" title={answer}>
              {slot}
            </div>
          )}
        </div>
        {!onRemove && (
          /* A button, as the kit's `TipDot` is, so a keyboard reaches the words
             the pointer gets on hover. Pressing it does nothing. */
          <span className="bz7__rowdel">
            <Tip text="Always on — can't be removed">
              <button type="button" className="bfp2__checklock" aria-label={`${attr.name} is always on`}>
                <Lock size={14} strokeWidth={2} aria-hidden />
              </button>
            </Tip>
          </span>
        )}
        {onRemove && (
          /* Only the first click of a double-click removes. The rows below move
             up one line and focus goes to the next Remove, which is then under
             the pointer, so the second click would take that check too. A
             keyboard press has a detail of 0 and still goes through. */
          <span
            className="bz7__rowdel"
            ref={removeRef}
            onClickCapture={(e) => {
              if (e.detail > 1) e.stopPropagation()
            }}
          >
            <IconButton icon={Trash2} tone="danger" size="sm" label={`Remove ${attr.name}`} onClick={onRemove} />
          </span>
        )}
      </div>
      {error && (
        <p className="bz7__rowerr" id={errId}>
          {error}
        </p>
      )}
    </li>
  )
}

/* --- The side column: what the list adds up to ---------------------------------

   The zone page's aside, on a profile. The list on the left is the editor; this
   column is what you glance at while using it: a short line per check, read off
   the draft, so it follows every edit before it is saved. No count (the list's
   own heading has that number), and nothing for an empty profile, whose list
   says so already.

   A "You can also check" catalogue, an Add on every row, stood under it. It was
   removed on the owner's word (15 Sep 2026): the list's Edit button opens the same
   catalogue, so the column was a second, longer way to do one thing. */
export function ProfileAside({ draft }: { draft: FingerprintProfile }) {
  const summary = summarise(draft)
  /* The aside keeps its grid column when empty, so the list does not widen. */
  if (summary.length === 0) return <aside className="bz7__aside" aria-hidden />

  return (
    <aside className="bz7__aside" aria-label="About this profile">
      <div className="bz7__side">
        <h3 className="bz7__sidehead">
          <Info size={14} strokeWidth={2} aria-hidden />
          {draft.mode === 'os' ? 'What this profile checks' : 'What this profile compares'}
        </h3>
        <ul className="bfp2__sumlines">
          {summary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

/* The same panel, saying how a step or a new profile works rather than what
   it adds up to. Moved here from the wizard (15 Sep 2026) so a new profile's
   page can say it too. */
export function SidePanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <aside className="bz7__aside" aria-label="About this step">
      <div className="bz7__side">
        <h3 className="bz7__sidehead">
          <Info size={14} strokeWidth={2} aria-hidden />
          {title}
        </h3>
        <ul className="bfp2__sumlines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

/* The checks' panel once there is something to sum up. Before that it would
   be an empty column beside a list with nothing in it, so it says how the
   checks work instead. Only a health profile is ever empty: a trusted device
   starts with its always-on signals. */
export function ChecksAside({ draft, lines }: { draft: FingerprintProfile; lines: string[] }) {
  if (summarise(draft).length > 0) return <ProfileAside draft={draft} />
  return <SidePanel title="How this profile works" lines={lines} />
}

export function AttrControl({
  attr,
  values,
  onChange,
}: {
  attr: Attribute
  /* A bag of values, not a profile.

     The wizard sets values now and it has no profile to hand — building a
     half-real one, with a fake id and a `restrictionSet` it has no opinion
     about, would be a state the model should not be able to express. So the
     control takes the only thing it ever read. */
  values: Record<string, AttrConfigValue>
  onChange: (id: string, v: AttrConfigValue) => void
}) {
  const c = attr.config!
  const raw = values[attr.id]

  if (c.kind === 'tolerance') {
    return (
      <span className="bfp2__num">
        <input
          type="number"
          min={c.min}
          max={c.max}
          value={Number(raw ?? c.value)}
          aria-label={c.label}
          onChange={(e) => onChange(attr.id, Number(e.target.value))}
        />
        {c.unit}
      </span>
    )
  }

  if (c.kind === 'choice') {
    return (
      <Picker
        label={c.label}
        value={String(raw ?? c.value)}
        options={c.options.map((o) => ({ value: o, label: o }))}
        onChange={(v) => onChange(attr.id, v)}
      />
    )
  }

  /* Two controls, read as one sentence: the attribute's name is already to the
     left of them, so "Operating system · is at least · Windows 10 22H2" runs
     across the row as a line of English rather than as two settings that happen
     to be adjacent.

     The operator is narrow and the value is not, because that is the ratio of
     the words in them and a pair of equal boxes would make the short one look
     like the more important half.

     Values arrive grouped, straight from the attribute's own list. An <optgroup>
     rather than a flat list with prefixes: the platform is the group, so
     "Android 14" does not have to carry the word Android to be findable, and a
     platform added to the master arrives as a heading rather than as thirty
     more rows. */
  if (c.kind === 'rule') {
    const v: AttrRuleValue = isRuleValue(raw) ? raw : c.value
    const set = (next: Partial<AttrRuleValue>) => onChange(attr.id, { ...v, ...next })
    return (
      <span className="bfp2__rule">
        <Picker
          label={`${attr.name} — comparison`}
          value={v.op}
          options={c.operators.map((o) => ({ value: o, label: o }))}
          onChange={(op) => set({ op })}
        />
        {/* `group` where the native control had `optgroup` — the headings the
            platform drew, drawn by the console instead. */}
        <Picker
          label={`${attr.name} — value`}
          value={v.value}
          options={c.groups.flatMap((g) => g.values.map((val) => ({ value: val, label: val, group: g.label })))}
          onChange={(value) => set({ value })}
        />
      </span>
    )
  }

  /* A comparison and a version the admin PICKS.

     The same two-part sentence the rule kind makes — "Android OS version · is
     at least · 13" reads across the row as English — and the second half is now
     the platform's own list rather than a text field. What the text field cost
     is in the config type's comment: it accepted "Windows 11", "11 " and
     "22h2" as readily as "11", validated none of them, and a floor that does
     not parse is a floor that is not there.
     A stored value the list does not carry is added to it and stays selected.
     That is the whole of what the old free field was protecting — a profile
     written before a release, or a fixture with a build nobody offers — and it
     survives without letting anyone type a new bad one. */
  if (c.kind === 'version') {
    const v: AttrRuleValue = isRuleValue(raw) ? raw : c.value
    const set = (next: Partial<AttrRuleValue>) => onChange(attr.id, { ...v, ...next })
    const op = versionOp(v.op)
    /* "At least" is said by the row's name now — see `checkName` — so the
       comparison menu only appears for a floor stored with some other operator,
       where the name falls back and the glyph is the only place it is stated. */
    const atLeast = v.op === 'gte'
    return (
      <span className={`bfp2__expr${atLeast ? ' is-bare' : ''}`}>
        {atLeast ? null : (
        /* The operator as one glyph, the way a conditional row states it —
            Figma's prototype panel is the reference. A dropdown reading "is at
            least" is three words competing with the attribute name to its left;
            the symbol is the join between two operands and disappears into the
            expression, which is what an operator should do.

            The menu is where the words live. Each row names the symbol and
            shows it on the right — the kit's `kbd` slot, which already renders
            exactly that — so ≥ is choosable by somebody who does not read
            mathematical notation, and recognisable afterwards by somebody who
            does. */
        <MenuButton
          size="sm"
          align="start"
          label={op.symbol}
          items={VERSION_OPS.map((o) => ({ id: o.id, label: o.label, kbd: o.symbol }))}
          onSelect={(id) => set({ op: id })}
        />
        )}
        {/* Chosen where there is a list, typed where there is not — see the
            `versions` field for why an OS and a browser differ on that.

            When there IS a list, the stored value goes in first if the
            catalogue does not carry it, so a profile's floor is never quietly
            rewritten to whatever happens to sit at the top. It is marked as
            what it is rather than passed off as a current release. */}
        {c.versions ? (
          <Picker
            label={c.label}
            value={v.value}
            options={[
              ...(c.versions.some((o) => o.value === v.value)
                ? []
                : [{ value: v.value, label: v.value, meta: 'Not a listed release' }]),
              ...c.versions.map((o) => ({ value: o.value, label: o.label ?? o.value })),
            ]}
            onChange={(value) => set({ value })}
          />
        ) : (
          /* `inputMode="decimal"` and not `type="number"`: 131.0.6778.86 is a
             version, not a number, and a numeric field refuses the second dot.
             Typing is free; a value that is blank or not digits and dots is
             marked here, said under the row, and blocks Save. */
          <input
            type="text"
            inputMode="decimal"
            className="bfp2__exprval"
            aria-label={c.label}
            aria-invalid={!isVersionText(v.value)}
            value={v.value}
            placeholder={c.placeholder}
            title={c.hint}
            onChange={(e) => set({ value: e.target.value })}
          />
        )}
      </span>
    )
  }

  /* A list is edited on the inner page, but not in a row this narrow — it gets
     the count and opens where there is room. Kept honest: the count is the
     real length, not a placeholder. */
  return <span className="bfp2__nocfg">{c.values.length} entries</span>
}

/* --- An enrolment question: label above, answer below ----------------------------

   The shape `Profile name` uses, applied to the whole enrolment section.

   These were `FormRow` — a mark, the label pushed left and the control pushed
   right, with a stretch of empty row between them. That row is right for a LIST
   of things a profile already holds, which is what the signals tab is: forty
   rows scanned down one column, each ending in the same control. It is wrong
   for a form of four unlike questions, because the answer ends up as far from
   its label as the widest row in the set allows, and a dropdown, a switch and a
   stepper have nothing to line up with each other about.

   Stacked, each question is one block: the label and the control under it, with
   any caveat on the label's mark. No icon, for the same reason `Profile name` has none —
   these are questions, not items, and a mark per question is decoration on a
   form of four.

   Full width of the work column, which the 50/50 page already holds to half
   the page. */
function EnrolField({
  label,
  tip,
  inline,
  children,
}: {
  label: string
  /** The caveat, on a mark. */
  tip?: string
  /** Label and control on ONE line, for a control that is the answer rather
      than a field to fill — a switch. See `.bfp2__enrolfield--inline`. */
  inline?: boolean
  children: ReactNode
}) {
  return (
    <div className={`bfp2__enrolfield${inline ? ' bfp2__enrolfield--inline' : ''}`}>
      <span className="bfp2__enrollabel">
        {label}
        {tip && <TipDot label={label} text={tip} />}
      </span>
      <div className="bfp2__enrolctl">{children}</div>
    </div>
  )
}

/* `FormRow` stood here — a mark, a label pushed left and a control pushed
   right. Its four callers were the enrolment questions, and they stack now;
   see `EnrolField` above for why a row is right for a list and wrong for a
   form. Deleted rather than left for a future caller: the row shape still
   exists where it belongs, on the signals list. */

/* --- Enrolment: one definition, two places -------------------------------------

   How a device gets onto a person's list, and how many they may keep. The
   attributes decide whether a machine is the SAME one; these decide whether it
   is allowed to become a known one at all.

   It is asked in the create form now, on the step where the collector is
   chosen, and it is edited from one place afterwards. It used to be editable
   only — a panel of defaults on the detail page that a new profile arrived
   holding without anybody having answered them, which is what `restrictionSet`
   exists to admit. A question worth asking is worth asking while the thing is
   being made.

   One component because the two surfaces must not drift: the same rows, the
   same dependency order, the same refusals. That order is real and it is why a
   roster question can disappear rather than grey out — a roster is matched on
   MAC address, MAC is one of the eighteen things only an agent can read, and it
   is in the device catalogue only. So an OS-and-version profile cannot use one
   at any reach, and an agentless device profile cannot either. */
export function EnrolmentFields({
  enabled,
  checkMac = true,
  mode,
  reach,
  registration,
  autoRegister,
  maxDevices,
  roster,
  onChange,
}: {
  /* The chosen signals, and the only reason this form reads them: whether a
     roster can be matched depends on whether MAC is one of them. */
  enabled: string[]
  /** Warn when a roster can't be matched because MAC is not read. Off on the
      create wizard's Devices step, where MAC is ticked for you on the way past. */
  checkMac?: boolean
  mode: ProfileMode
  /** Null while the collector question is still unanswered on the step above. */
  reach: ProfileReach | null
  registration: Registration
  autoRegister: boolean
  maxDevices: number | null
  roster: Roster | null
  onChange: (p: {
    registration?: Registration
    autoRegister?: boolean
    maxDevices?: number | null
    roster?: Roster | null
  }) => void
}) {
  const rosterPossible = mode === 'device' && reach === 'agent'
  const file = useRef<HTMLInputElement>(null)
  const [fileProblem, setFileProblem] = useState<string | null>(null)

  /* The roster is read in the browser: one device per line, a header line
     skipped. Nothing is sent anywhere in this prototype. */
  const upload = async (f: File | undefined) => {
    if (!f) return
    const next = rosterFromCsv(f.name, await f.text(), new Date())
    if (next.rows === 0) {
      setFileProblem('That file has no devices in it.')
      return
    }
    setFileProblem(null)
    onChange({ roster: next })
  }

  return (
    <div className="bfp2__rows bfp2__rows--form">
      <EnrolField
        label="How a device gets registered"
        /* The refusal is on the row that carries the disabled option, rather
           than in a paragraph above the whole section. */
        tip={
          (registration === 'self'
            ? 'Users register their own devices, up to a limit. '
            : 'Only devices on the uploaded roster can sign in. ') +
          (rosterPossible
            ? ''
            : mode === 'os'
              ? 'A roster is not available: it is matched on MAC address, which a device health profile does not read.'
              : 'A roster is not available: it is matched on MAC address, which only the Device Agent can read.')
        }
      >
        {/* The same dropdown either way, DISABLED where a roster is impossible
            (owner, 16 Sep 2026). It used to become a line of plain text there,
            which read as an unstyled field in a column of real ones — the
            question looked broken rather than settled. Greyed, it still shows
            its answer, still says what kind of control it is, and the `?`
            above says why it cannot be changed. */}
        <Picker
          label="How a device gets registered"
          width="fill"
          disabled={!rosterPossible}
          value={registration}
          options={(Object.keys(REGISTRATION_LABEL) as Registration[]).map((r) => ({
            value: r,
            label: REGISTRATION_LABEL[r],
          }))}
          onChange={(v) => {
            const next = v as Registration
            /* The console's own branch: a roster REPLACES the allowance
               rather than sitting beside it. */
            onChange({
              registration: next,
              maxDevices: next === 'pre-approved' ? null : (maxDevices ?? DEFAULT_MAX_DEVICES),
            })
          }}
        />
      </EnrolField>

      <EnrolField
        label="Register silently on first sign-in"
        tip="Convenient, but a device an attacker signs in from registers itself too."
        inline
      >
        {/* The form size, not `sm`. An 18px switch beside a 40px dropdown and
            a 40px number field read as a different class of control. */}
        <Toggle
          checked={autoRegister}
          onChange={(next) => onChange({ autoRegister: next })}
          label="Register silently on first sign-in"
        />
      </EnrolField>

      {/* One or the other, never both. A question that no longer applies is
          not disabled or greyed — it is not rendered. */}
      {registration === 'self' ? (
        <EnrolField
          label="Devices per person"
          tip="How many devices a user can register before the next one is refused."
        >
          <NumberStepper
            label="Devices per person"
            value={maxDevices ?? DEFAULT_MAX_DEVICES}
            min={1}
            max={20}
            width="fill"
            onChange={(next) => onChange({ maxDevices: next })}
          />
        </EnrolField>
      ) : (
        <EnrolField
          label="Approved device roster"
          tip="A CSV file with one device per line: device name, user email and MAC address."
        >
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {roster ? (
            /* A file, drawn as a file: a spreadsheet mark, the name, and how
               many devices it holds. */
            <span className="bfp2__file">
              <span className="bfp2__file-ico" aria-hidden>
                <FileSpreadsheet size={17} strokeWidth={1.8} />
              </span>
              <span className="bfp2__file-body">
                <strong title={roster.fileName}>{roster.fileName}</strong>
                <em>
                  {roster.rows} devices, uploaded {roster.uploadedAt}
                </em>
              </span>
              {/* Replace, not Upload. The row already has a file, and a
                  second `Upload CSV` beside one would not say which of the
                  two survives. */}
              <Button variant="ghost" size="sm" onClick={() => file.current?.click()}>
                Replace
              </Button>
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => file.current?.click()}>
              <Upload size={14} strokeWidth={1.9} aria-hidden />
              Upload CSV
            </Button>
          )}
        </EnrolField>
      )}

      {/* The two ways a pre-approved profile can be inert, said beside the
          control that makes it so. Both block saving until fixed. */}
      {registration === 'pre-approved' && fileProblem && (
        <p className="bfp2__enrolwarn" role="status">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>{fileProblem}</span>
        </p>
      )}
      {registration === 'pre-approved' && !roster && !fileProblem && (
        <p className="bfp2__enrolwarn">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>Upload a device roster. No device can sign in until you do.</span>
        </p>
      )}
      {checkMac && rosterNeedsMac({ registration, enabled }) && (
        <p className="bfp2__enrolwarn">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
          <span>
            The roster is matched on <b>MAC address</b>. Add MAC address to this profile&apos;s signals.
          </span>
        </p>
      )}
    </div>
  )
}
