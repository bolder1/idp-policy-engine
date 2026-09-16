import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, Laptop, ListChecks, Lock, Tag, type LucideIcon } from 'lucide-react'

import { Badge, Button, Drawer, SearchBox, Tip, TipDot, TipMark } from '../kit'
import { TierPick } from '../tier-pick'
import { NoMatches } from '../empty'
import { useLeaveGuard } from '../leave-guard'
import {
  ITEM_NOUN,
  PROFILE_NAME_MAX,
  TIER_WEIGHT,
  alwaysOn,
  asksReach,
  blockedAttributes,
  nameIssue,
  offeredAttributes,
  tierOf,
  type AttrConfigValue,
  type Attribute,
  type FingerprintProfile,
  type ProfileMode,
} from '../fingerprint'
import { checkName, kindChoices, reachChoices, versionError, type CategoryValue } from './device-profile-choices'
import {
  AttrControl,
  AttrStep,
  BasicAside,
  CategoryFilter,
  CheckMark,
  ChecksAside,
  ChoiceTiles,
  ChosenList,
  EnrolmentFields,
  SidePanel,
} from './device-profile-parts'
import {
  agentNote,
  arrive,
  canOpenStep,
  draftOf,
  filterAttributes,
  initialWizard,
  reviewSections,
  stepDone,
  stepIssue,
  toggleRun,
  withConfig,
  withMode,
  withWeight,
  withWizardReach,
  wizardStarted,
  wizardSteps,
  type ReviewSection,
  type Step3Shape,
  type WizardState,
  type WizardStep,
  type WizardStepId,
} from './device-profile-wizard-model'

/* -----------------------------------------------------------------------------
   New device profile, as a page.

   Versions 1 and 3 of "Create new profile" (owner, 15 Sep 2026). The 560px
   drawer this replaces asked the same questions in a column the width of a
   phone, beside a list nobody was reading. A page gives each step the whole
   work column and a side panel saying what the answers mean, which is the
   shape the profile's own page already has — so the create flow and the page
   it ends on read as one thing.

   ONE wizard, two shapes, chosen by `step3`:

     inline  Profile · Devices · Checks · Review
             every check on one line, its value at the end of the line, and the
             value locked until the check is ticked
     split   Profile · Devices · Choose checks · Set values · Review
             the drawer's picker to choose, then the page's own list to set

   Devices is the trusted device's alone (`stepsFor`), so a health profile's
   ladder is numbered without it.

   What decides steps, what stops each one and what Review says is in
   `device-profile-wizard-model.ts`, and tested there. This file draws it.

   The contract with the screen: `onCreate` gets a complete profile that
   `profileIssue` passes, with an empty id for the caller to assign. The caller
   stores it and opens it. `onCancel` is called once leaving is settled — the
   page asks first when anything has been answered.
   -------------------------------------------------------------------------- */

export function DeviceProfileWizard({
  step3,
  variant = 'page',
  names,
  onCancel,
  onCreate,
}: {
  /** `inline`: choose and set checks on one step. `split`: choose, then set. */
  step3: Step3Shape
  /* Where the wizard is drawn, and ONLY that.

     `drawer` is the shape the console shipped before the three page versions
     landed — a slide-over over the list, so the profiles you are naming this
     one against stay on screen behind it. Everything else is shared: the same
     state machine, the same step bodies, the same leave guard, the same
     `draftOf`. Restoring the old `CreateDrawer` wholesale would have brought
     back a second, older answer to "what is a profile" — it predates checks
     having values at all — and two creates that disagree is the thing this
     screen already fixed once. */
  variant?: 'page' | 'drawer'
  /** Every existing profile's name, for the duplicate-name check. */
  names: string[]
  /** Back to the list. Called after the leave question, if there was one. */
  onCancel: () => void
  /** The finished profile, id blank. The caller stores it and opens it. */
  onCreate: (p: FingerprintProfile) => void
}) {
  const [s, setS] = useState<WizardState>(initialWizard)
  const [at, setAt] = useState(0)
  /* The furthest step reached, so the ladder can go forward again to a step
     already visited — Edit on Review, then straight back to Review. */
  const [reached, setReached] = useState(0)
  const [touched, setTouched] = useState(false)

  const steps = wizardSteps(s.mode, step3)
  const here = Math.min(at, steps.length - 1)
  const step = steps[here]
  const last = steps.length - 1
  const issueOf = (id: WizardStepId) => stepIssue(id, s, names)
  const issue = issueOf(step.id)
  const finalIssue = issueOf('review')
  const draft = draftOf(s)

  /* --- Moving ----------------------------------------------------------------

     Focus goes to the new step's first heading, and the column scrolls back
     to the top: Next is pressed at the bottom of a forty-row list, and the
     step it opens starts at the top of the page. Set only by a move, so the
     name field keeps the focus it is given on arrival. */
  const work = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    document.querySelector('.bshell__main')?.scrollTo({ top: 0 })
    const h = work.current?.querySelector<HTMLElement>('h2')
    if (!h) return
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
    h.focus({ preventScroll: true })
  }, [at])

  const go = (to: number) => {
    if (to < 0 || to > last || to === here) return
    setS((cur) => arrive(cur, steps, here, to))
    setAt(to)
    setReached((r) => Math.max(r, to))
    moved.current = true
  }
  const toStep = (id: WizardStepId) => go(steps.findIndex((x) => x.id === id))
  const next = () => {
    if (issue === null) go(here + 1)
  }

  const update = (fn: (cur: WizardState) => WizardState) => setS(fn)

  /* A different type is a different ladder, so nothing past Profile counts as
     visited any more. */
  const pickMode = (mode: ProfileMode) => {
    if (mode === s.mode) return
    update((cur) => withMode(cur, mode))
    setReached(0)
  }

  const create = () => {
    if (finalIssue !== null) return false
    onCreate(draftOf(s))
    return true
  }

  /* Leaving asks once anything is answered. Its Save is Create profile, and
     only on Review with nothing wrong: from an earlier step there is a step
     somebody has not seen, and creating from the leave dialog would skip it. */
  const confirmLeave = useLeaveGuard({
    dirty: wizardStarted(s),
    save: step.id === 'review' && finalIssue === null ? create : undefined,
    saveLabel: 'Create profile',
  })
  const cancel = () => confirmLeave(onCancel)

  /* The name's problem is said under the field once there is something to say;
     the footer says it until then, so Next is never disabled without a reason
     on screen — and never with the same reason twice. */
  const nameProblem = nameIssue(s.name, names)
  const nameShown = nameProblem !== null && (touched || s.name.trim() !== '')
  const footReason = step.id === 'profile' && nameShown ? null : issue
  /* "Next: Checks" only when Next can be pressed. Beside a disabled Next, with
     the reason under the field, it read as ready to go on (15 Sep 2026). */
  const footNext = issue === null && here < last ? steps[here + 1].label : null

  const nameId = useId()
  const reachId = useId()
  const noun = ITEM_NOUN[s.mode]
  const Noun = noun.many.charAt(0).toUpperCase() + noun.many.slice(1)

  let body: ReactNode
  let aside: ReactNode

  switch (step.id) {
    case 'profile':
      body = (
        <section className="bfp2__basicsec">
          <header className="bfp2__sechead">
            <h2>Name and type</h2>
          </header>
          <div className="bdpw__form">
            <label className="bfp2__field">
              <span>Profile name</span>
              <input
                type="text"
                value={s.name}
                /* The page's first question, so the caret is already in it. The
                   Create button that opened the page has gone with the list. */
                autoFocus
                maxLength={PROFILE_NAME_MAX}
                placeholder="Corporate laptops"
                aria-invalid={nameShown}
                aria-describedby={nameShown ? nameId : undefined}
                onChange={(e) => {
                  const name = e.target.value
                  update((cur) => ({ ...cur, name }))
                }}
                onBlur={() => setTouched(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setTouched(true)
                    next()
                  }
                }}
              />
              {nameShown && (
                <span id={nameId} className="bfp2__fielderror">
                  {nameProblem}
                </span>
              )}
            </label>
            <ChoiceTiles legend="Profile type" options={kindChoices()} value={s.mode} onPick={pickMode} />
          </div>
        </section>
      )
      aside = <TypeAside mode={s.mode} />
      break

    case 'devices':
      /* Basic details' own form, so the answers given here are the page's
         first tab when the profile opens. No confirmation on going agentless:
         the page's asks because the switch removes signals, and here nothing is
         removed — agent-only ticks wait, hidden, in case the answer comes back. */
      body = (
        <div className="bfp2__basic">
          <section className="bfp2__basicsec">
            <header className="bfp2__sechead">
              <h2 id={reachId}>What it can read</h2>
              <TipDot
                label="What it can read"
                text="Decides which signals are available. Hardware identifiers need the Device Agent."
              />
            </header>
            <ChoiceTiles
              labelledBy={reachId}
              options={reachChoices()}
              value={s.reach}
              onPick={(reach) => update((cur) => withWizardReach(cur, reach))}
            />
          </section>

          {/* Only once the collector is answered: it decides whether a roster
              is an option at all. */}
          {s.reach !== null && (
            <section className="bfp2__basicsec">
              <header className="bfp2__sechead">
                <h2>How devices enrol</h2>
                <TipDot
                  label="How devices enrol"
                  text="Signals decide whether a device is the same one as before. These settings decide whether a new device may be registered at all."
                />
              </header>
              <EnrolmentFields
                enabled={s.picked}
                /* MAC is ticked for you on the way past this step. */
                checkMac={false}
                mode={s.mode}
                reach={s.reach}
                registration={s.registration}
                autoRegister={s.autoRegister}
                maxDevices={s.maxDevices}
                roster={s.roster}
                onChange={(p) => update((cur) => ({ ...cur, ...p }))}
              />
            </section>
          )}
        </div>
      )
      aside = s.reach === null ? <ReachAside /> : <BasicAside draft={draft} />
      break

    case 'items':
      body = (
        <section className="bfp2__basicsec">
          <header className="bfp2__sechead">
            <h2>{Noun}</h2>
            <TipDot
              label={`About ${noun.many}`}
              text={
                s.mode === 'os'
                  ? 'A device must pass every check you tick. Tick a check to set its value.'
                  : 'What changed since the last sign-in adds up to a score. Tick a signal to set its weight.'
              }
            />
          </header>
          <InlineChecks
            state={s}
            onPick={(picked) => update((cur) => ({ ...cur, picked }))}
            onConfig={(id, v) => update((cur) => withConfig(cur, id, v))}
            onWeight={(id, w) => update((cur) => withWeight(cur, id, w))}
            onReach={asksReach(s.mode) ? () => toStep('devices') : undefined}
          />
        </section>
      )
      aside = (
        <ChecksAside
          draft={draft}
          lines={[
            'A device must pass every check you tick before it can sign in.',
            'A check’s value unlocks when you tick it.',
          ]}
        />
      )
      break

    case 'choose':
      /* The catalogue drawer's list, unchanged: the profile page's Edit opens
         the same one, so choosing looks the same at both moments. */
      body = (
        <section className="bfp2__basicsec">
          <header className="bfp2__sechead">
            <h2>Choose {noun.many}</h2>
            <TipDot
              label={`About ${noun.many}`}
              text={
                s.mode === 'os'
                  ? 'A device must pass every check you choose. You set each one on the next step.'
                  : 'What changed since the last sign-in adds up to a score. You set each signal’s weight on the next step.'
              }
            />
          </header>
          <AttrStep
            mode={s.mode}
            reach={s.reach}
            picked={s.picked}
            setPicked={(picked) => update((cur) => ({ ...cur, picked }))}
            onBack={asksReach(s.mode) ? () => toStep('devices') : undefined}
          />
        </section>
      )
      aside = (
        <ChecksAside
          draft={draft}
          lines={[
            'A device must pass every check you choose before it can sign in.',
            'You set each check’s value on the next step.',
          ]}
        />
      )
      break

    case 'values':
      /* The profile page's own list, so the step that sets values is the list
         the admin will edit them in later. Its Edit goes back a step; its
         Remove unticks. Headed with the step's name, not the list's: after
         "Choose checks", a heading that said "Checks" read as a recap of the
         choice rather than the step that sets it (15 Sep 2026). Everything
         removed leaves a page's empty state whose Add goes back to choosing —
         the compact one said no checks lets every device through, beside a
         footer saying at least one is needed. */
      body = (
        <ChosenList
          draft={draft}
          title="Set values"
          tip={
            s.mode === 'os'
              ? 'Set what each check requires. A device must pass every one.'
              : 'Set how much each signal counts towards the score.'
          }
          fullEmpty
          onEdit={() => toStep('choose')}
          onConfig={(id, v) => update((cur) => withConfig(cur, id, v))}
          onWeight={(id, w) => update((cur) => withWeight(cur, id, w))}
          onRemove={(id) => update((cur) => ({ ...cur, picked: cur.picked.filter((x) => x !== id) }))}
        />
      )
      aside = (
        <ChecksAside
          draft={draft}
          lines={[
            'A device must pass every check you choose before it can sign in.',
            'Each check you choose is set here.',
          ]}
        />
      )
      break

    case 'review':
      body = <Review state={s} step3={step3} onEdit={toStep} />
      break
  }

  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.bshell__main'))
  }, [])

  /* The save footer's strip, in the same place and the same voice: where you
     are on the left, the one thing to press on the right. Always shown — a
     wizard always has a next thing to press — and never animated in. */
  /* Back or Cancel, and Next or Create — the same pair in the page's footer and
     in the slide-over's actions. */
  const navButtons = (
    <>
      <Button variant="ghost" onClick={here === 0 ? cancel : () => go(here - 1)}>
        {here === 0 ? 'Cancel' : 'Back'}
      </Button>
      {here === last ? (
        <Button variant="brand" icon={Check} disabled={finalIssue !== null} title={finalIssue ?? undefined} onClick={create}>
          Create profile
        </Button>
      ) : (
        <Button variant="brand" disabled={issue !== null} title={issue ?? undefined} onClick={next}>
          Next
        </Button>
      )}
    </>
  )

  const footer = (
    <div className="bx-savebar bdpw__foot">
      <span className="bx-savebar__text" role="status">
        <strong>
          Step {here + 1} of {steps.length}: {step.label}
        </strong>
        {footReason ? (
          <span className="is-blocked">{footReason}</span>
        ) : footNext ? (
          <span>Next: {footNext}</span>
        ) : here === last ? (
          <span>Ready to create</span>
        ) : null}
      </span>
      {/* In a group, so the kit's 148px floor for the footer's one button does
          not land on Back. */}
      <div className="bdpw__acts">{navButtons}</div>
    </div>
  )

  /* --- The slide-over -------------------------------------------------------

     The same ladder and the same step body, over the list instead of replacing
     it. `Drawer` owns the scrim, the focus trap, Escape and the footer, so the
     page's own back button and its portalled footer are the two things that do
     not come along — Cancel lives in the drawer's actions, and the leave guard
     is still the one thing standing between an answered form and a closed
     panel.

     `resizable`, because step 3 is a list of up to thirty-eight rows and the
     value column is the half a narrow panel loses first. */
  if (variant === 'drawer') {
    return (
      <Drawer
        open
        onClose={cancel}
        title="New device profile"
        width={720}
        resizable
        minWidth={560}
        maxWidth={1040}
        actions={navButtons}
      >
        <div className="bdpw bdpw--drawer">
          <Steps
            steps={steps}
            at={here}
            canOpen={(i) => canOpenStep(steps, here, reached, i, issueOf)}
            done={(i) => stepDone(steps, here, reached, i, issueOf)}
            onOpen={go}
          />
          {/* The reason under a disabled Next, which on the page is in the
              footer the drawer does not have. */}
          {footReason && <p className="bdpw__reason">{footReason}</p>}
          <div className="bdpw__work" ref={work}>
            {body}
          </div>
        </div>
      </Drawer>
    )
  }

  return (
    <>
      <button type="button" className="bfp2__back" onClick={cancel}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All profiles
      </button>

      <header className="bfp2__head bdpw__head">
        <h1>New device profile</h1>
      </header>

      <Steps
        steps={steps}
        at={here}
        canOpen={(i) => canOpenStep(steps, here, reached, i, issueOf)}
        done={(i) => stepDone(steps, here, reached, i, issueOf)}
        onOpen={go}
      />

      {/* A step with nothing to say on the right gets one centred column
          instead of an empty half. Review is that step: it is a summary of
          answers already given, so a panel beside it explains nothing, and the
          50/50 split left the facts hugging the left edge of a wide page. */}
      <div className={`bz7__cols bdpw__cols${aside ? '' : ' bdpw__cols--solo'}`}>
        <div className="bz7__work bdpw__work" ref={work}>
          {body}
        </div>
        {aside}
      </div>

      {host ? createPortal(footer, host) : footer}
    </>
  )
}

/* --- The ladder -------------------------------------------------------------------

   The drawer's numbered steps, at a page's size, and pressable: a step already
   done opens with one press, and so does one ahead that has been visited while
   the way there is clear. A step that cannot be opened is not a button, so it
   is not a tab stop that does nothing.

   The ladder spans the full width of the form it heads, and the connectors take
   the free space, so the spacing is even at three, four or five steps. */
function Steps({
  steps,
  at,
  canOpen,
  done,
  onOpen,
}: {
  steps: WizardStep[]
  at: number
  canOpen: (index: number) => boolean
  done: (index: number) => boolean
  onOpen: (index: number) => void
}) {
  return (
    <nav className="bdpw__steps" aria-label="Steps">
      <ol>
        {steps.map((st, i) => {
          const on = i === at
          const tick = done(i)
          const inner = (
            <>
              <span className="bdpw__stepn" aria-hidden>
                {tick ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="bdpw__steplabel">
                <span className="u-sr-only">{`Step ${i + 1}: `}</span>
                {st.label}
                {tick && <span className="u-sr-only">, done</span>}
              </span>
            </>
          )
          return (
            <li
              key={st.id}
              className={`bdpw__step${on ? ' is-on' : ''}${tick ? ' is-done' : ''}`}
              aria-current={on ? 'step' : undefined}
            >
              {canOpen(i) ? (
                <button type="button" className="bdpw__stepbtn" onClick={() => onOpen(i)}>
                  {inner}
                </button>
              ) : (
                <span className="bdpw__stepbtn">{inner}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* --- Checks, chosen and set on one line -------------------------------------------

   Version 1's step. Every check offered at this reach, one to a line: the
   tick, the family mark and the name choose it; its value sits at the end of
   the line and is locked until it is ticked (owner, 15 Sep 2026).

   The rows are the profile page's check list (`.bfp2__checklist`), so the
   values line up down one column exactly as they will on the page — with the
   picker's row (`.bfp2__pickrow`) as the part that ticks. The bar is the
   picker's too. Flat, no category headings: the owner took them out of this
   list on 12 Sep, and the family mark and the category filter do their job.

   What an agent would unlock is named under the list with a way back to
   Devices, as the picker does, rather than drawn as eighteen dead rows: the
   answer that hides them was given one step ago and can be changed from here.

   Unticking keeps the value. Ticking again gets back what was set, and
   `draftOf` drops a value whose check is not ticked, so nothing stray is ever
   stored. */
function InlineChecks({
  state,
  onPick,
  onConfig,
  onWeight,
  onReach,
}: {
  state: WizardState
  onPick: (picked: string[]) => void
  onConfig: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
  /** Back to what it can read. Absent on a health profile. */
  onReach?: () => void
}) {
  const { mode, reach, picked, config, weights } = state
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CategoryValue>('')
  /* The last row pressed, by id, for a shift-press run. */
  const anchor = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const offered = offeredAttributes(mode, reach)
  const locked = offered.filter((a) => a.always)
  const chosen = offered.filter((a) => a.always || picked.includes(a.id))
  const shown = filterAttributes(offered, q, cat, picked)
  const blockedShown = filterAttributes(blockedAttributes(mode, reach), q, cat === '@selected' ? '' : cat, [])
  const hasLock = alwaysOn(mode).length > 0

  /* "Selected only" with nothing selected shows nothing, so it lets go. */
  const pick = (next: string[]) => {
    onPick(next)
    if (cat === '@selected' && !offered.some((a) => a.always || next.includes(a.id))) setCat('')
  }

  /* Unticking under "Selected only" takes the row away with focus on it. Focus
     moves first, to the next row that stays, else the one before, else the
     filter — the picker's rule, for the same reason. */
  const keepFocus = (id: string, next: string[]) => {
    const list = listRef.current
    if (cat !== '@selected' || next.includes(id) || !list?.contains(document.activeElement)) return
    if (!offered.some((a) => a.always || next.includes(a.id))) return
    const at = shown.findIndex((a) => a.id === id)
    const stays = (a: Attribute) => !a.always && next.includes(a.id)
    const land = shown.slice(at + 1).find(stays) ?? shown.slice(0, at).reverse().find(stays)
    const el = land
      ? list.querySelector<HTMLElement>(`[data-id="${land.id}"]`)
      : list.closest('.bfp2__pick')?.querySelector<HTMLElement>('.bfp2__catfilter button')
    el?.focus()
  }

  const toggle = (id: string, span: boolean) => {
    const next = toggleRun(picked, shown, anchor.current, id, span)
    anchor.current = id
    keepFocus(id, next)
    pick(next)
  }

  const clearSearch = () => {
    setQ('')
    setCat('')
  }

  return (
    <div className="bfp2__pick bdpw__pick">
      <div className="bfp2__pickbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={`Search ${ITEM_NOUN[mode].many}…`}
          label={`Search ${ITEM_NOUN[mode].many}`}
          inputRef={searchRef}
        />
        <span className="bfp2__catfilter">
          <CategoryFilter
            mode={mode}
            offered={offered}
            picked={picked}
            chosen={chosen.length}
            value={cat}
            onChange={setCat}
          />
        </span>
        <span className={`bfp2__pickcount ${chosen.length ? 'is-on' : ''}`}>{chosen.length} selected</span>
        {chosen.length > locked.length && (
          <button
            type="button"
            className="bfp2__clear"
            onClick={() => {
              searchRef.current?.focus()
              pick([])
            }}
          >
            Clear the rest
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <NoMatches
          compact
          noun={ITEM_NOUN[mode].many}
          query={q}
          filtered={cat !== ''}
          onClear={clearSearch}
          blurb={q.trim() && blockedShown.length > 0 ? agentNote(blockedShown) : undefined}
          secondary={
            q.trim() && blockedShown.length > 0 && onReach ? (
              <Button variant="secondary" onClick={onReach}>
                Change what it reads
              </Button>
            ) : undefined
          }
        />
      ) : (
        /* `.bfp2__checks` for the container the list's control column reads
           its width from. */
        <div className="bfp2__checks">
          <ul
            ref={listRef}
            className={`bfp2__checklist bdpw__list${mode === 'device' ? ' is-weights' : ''}${hasLock ? '' : ' no-lock'}`}
          >
            {shown.map((a) => (
              <InlineRow
                key={a.id}
                attr={a}
                mode={mode}
                on={a.always || picked.includes(a.id)}
                config={config}
                weights={weights}
                onToggle={(span) => toggle(a.id, span)}
                onConfig={onConfig}
                onWeight={onWeight}
              />
            ))}
          </ul>
        </div>
      )}

      {shown.length > 0 && blockedShown.length > 0 && (
        <p className="bfp2__locked">
          <Lock size={12} strokeWidth={2} aria-hidden />
          <span>{agentNote(blockedShown)}</span>
          {onReach && (
            <button type="button" className="bfp2__clear" onClick={onReach}>
              Change what it reads
            </button>
          )}
        </p>
      )}
    </div>
  )
}

function InlineRow({
  attr,
  mode,
  on,
  config,
  weights,
  onToggle,
  onConfig,
  onWeight,
}: {
  attr: Attribute
  mode: ProfileMode
  on: boolean
  config: Record<string, AttrConfigValue>
  weights: Record<string, number>
  onToggle: (span: boolean) => void
  onConfig: (id: string, v: AttrConfigValue) => void
  onWeight: (id: string, w: number) => void
}) {
  const descId = useId()
  /* "Windows" beside the release, as on the page — see `checkName`. */
  const name = checkName(attr, config)
  /* Only for a ticked row. An unticked one's value is not going in. */
  const error = on ? versionError(attr, config) : null

  const control =
    mode === 'device' ? (
      <TierPick
        value={tierOf(weights[attr.id] ?? attr.weight)}
        label={`${attr.name} weight`}
        onChange={(t) => onWeight(attr.id, TIER_WEIGHT[t])}
      />
    ) : attr.config ? (
      <AttrControl attr={attr} values={config} onChange={onConfig} />
    ) : null

  const label = (
    <>
      <span className="bx-tick" aria-hidden>
        <Check size={11} strokeWidth={3.2} />
      </span>
      <CheckMark attr={attr} />
      <span className="bfp2__pickname">
        <span className="bfp2__pickword" title={name}>
          {name}
        </span>
        {attr.always ? <TipDot label={`About ${attr.name}`} text={attr.purpose} /> : <TipMark text={attr.purpose} />}
      </span>
      {attr.phase === 2 && (
        <span className="bfp2__pickstate">
          <Badge tone="notice">Not collected yet</Badge>
        </span>
      )}
    </>
  )

  return (
    <li className="bfp2__checkrow bdpw__row">
      {attr.always ? (
        /* Not a control: nothing to decide. Its lock says why, at the end of
           the line where a Remove would be on the page. */
        <div className="bfp2__pickrow bdpw__tick is-fixed is-on">{label}</div>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-describedby={descId}
          className={`bfp2__pickrow bdpw__tick${on ? ' is-on' : ''}`}
          data-id={attr.id}
          onClick={(e) => onToggle(e.shiftKey)}
        >
          {label}
        </button>
      )}
      {/* The purpose, for a keyboard: `TipMark` is a pointer's way to it. */}
      {!attr.always && (
        <span id={descId} hidden>
          {attr.purpose}
        </span>
      )}

      {/* A `fieldset` because it disables every control inside it natively —
          a picker, a version floor, a weight — with no `disabled` prop on any
          of them. The value stays readable, dimmed, so a row says what ticking
          it would set. */}
      {control && (
        <fieldset
          className="bfp2__checkslot bdpw__ctl"
          disabled={!on}
          title={on ? undefined : `Tick ${attr.name} to set it`}
        >
          {control}
        </fieldset>
      )}

      {attr.always && (
        <span className="bfp2__checkdel">
          <Tip text="Always on — can't be removed">
            <button type="button" className="bfp2__checklock" aria-label={`${attr.name} is always on`}>
              <Lock size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
        </span>
      )}
      {error && <span className="bfp2__checkerror">{error}</span>}
    </li>
  )
}

/* --- Review ------------------------------------------------------------------------

   Everything the profile will be, in the order it was asked, each part with an
   Edit that opens its step. Read off the same draft Create writes, so a value
   left on an unticked row is not reported as going in. Label and value in two
   columns, no rules between lines. */
function Review({
  state,
  step3,
  onEdit,
}: {
  state: WizardState
  step3: Step3Shape
  onEdit: (step: WizardStepId) => void
}) {
  return (
    <div className="bdpw__review">
      {/* The step's own heading, for the focus a move lands on. Its first
          section's "Profile" took that focus, and read as step one's name
          (15 Sep 2026). Hidden: the ladder and the footer already say Review
          on screen, and a visible one would stack two headings over one line. */}
      <h2 className="u-sr-only">Review</h2>
      {reviewSections(state, step3).map((sec) => (
        <ReviewFold key={sec.step} sec={sec} onEdit={() => onEdit(sec.step)} />
      ))}
      {/* The panel this replaced (`NextAside`) sat in the right column and was
          the only thing in it. Two sentences do not need a titled box beside
          the summary they follow; they read as the last line of it. */}
      <p className="bdpw__next">
        The profile is added to Device profiles and opens. Nothing changes at sign-in until a
        policy rule uses it.
      </p>
    </div>
  )
}

/* --- The side column, per step ------------------------------------------------------

   The profile page's panel (`.bz7__side`), saying what the answers on the left
   mean. Devices uses Basic details' own panel and the checks steps the Checks
   tab's, so a step reads the way its tab will. These three are the steps the
   page has no tab for. `SidePanel` and `ChecksAside` are in the parts file,
   since a new profile's page says the same. */

function TypeAside({ mode }: { mode: ProfileMode }) {
  return (
    <SidePanel
      title="How this profile works"
      lines={
        mode === 'os'
          ? [
              'A device must pass every check you choose before it can sign in.',
              'Integrity and screen lock are reported by the miniOrange app. A device without it fails those checks.',
              'The type can’t be changed once the profile is created.',
            ]
          : [
              'Recognises a machine it has seen before.',
              'Each signal has a weight. What changed since the last sign-in adds up to a score, and the score picks the outcome.',
              'The type can’t be changed once the profile is created.',
            ]
      }
    />
  )
}

function ReachAside() {
  return (
    <SidePanel
      title="How this profile works"
      lines={[
        'Agentless reads the browser, network and location of each sign-in. Nothing to install.',
        'Agent-based adds hardware identifiers, and needs the miniOrange Device Agent on each device.',
      ]}
    />
  )
}

/* --- One section of the review, folded ---------------------------------------------

   Each section is a disclosure: a header you can press, and the settings under
   it. Three reasons it is not a flat list of headings any more (owner, 16 Sep
   2026, against the live console's own review screen):

     - The last section is one row per chosen signal. Thirty-eight of them is a
       wall nobody reads, and it pushes Create off the screen.
     - A folded section still has to say something, so the header carries the one
       thing worth knowing while it is shut — the type, the reach, the count.
     - Edit belongs beside the section it edits, not inside a control that also
       folds it. Two buttons on one row, never a button inside a button.

   Flat inside: no sub-headings, no groups within a section. The live console
   puts a "Device Management Settings" label between the header and the rows;
   here that is a level of hierarchy over four rows, so the rows sit directly
   under the header they belong to.

   Open by default, because a review that hides what it is reviewing is not a
   review. The exception is a long list — over eight rows the section starts
   shut with its count showing, which is the case the fold exists for. */
function ReviewFold({ sec, onEdit }: { sec: ReviewSection; onEdit: () => void }) {
  const bodyId = useId()
  const [open, setOpen] = useState(sec.facts.length <= LONG_SECTION)
  const Mark = SECTION_ICON[sec.step] ?? ListChecks

  return (
    <section className={`bdpw__fold ${open ? 'is-open' : ''}`}>
      <div className="bdpw__foldhead">
        {/* The heading holds the toggle, not the other way round: a button's
            children are presentational, so an h3 inside it never reached the
            accessibility tree and heading navigation could not find a section. */}
        <h3 className="bdpw__foldtitle">
          <button
            type="button"
            className="bdpw__foldbtn"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="bdpw__foldico" aria-hidden>
              <Mark size={16} strokeWidth={1.8} />
            </span>
            <span className="bdpw__foldname">{sec.title}</span>
            <Badge tone="system">{sec.summary}</Badge>
            <ChevronDown className="bdpw__foldchev" size={16} strokeWidth={2} aria-hidden />
          </button>
        </h3>
        <button
          type="button"
          className="bfp2__clear"
          aria-label={`Edit ${sec.title.toLowerCase()}`}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>

      {/* Unmounted rather than hidden. A review has at most three sections and
          no state inside them worth keeping alive, and `hidden` rows stay in
          the accessibility tree of some screen readers. */}
      {open && (
        <dl className="bdpw__facts" id={bodyId}>
          {sec.facts.map((f) => (
            <div key={f.attr?.id ?? f.label} className="bdpw__fact">
              <dt>
                {f.attr && <CheckMark attr={f.attr} />}
                <span>{f.label}</span>
              </dt>
              <dd>{f.pill ? <Badge tone="neutral">{f.value}</Badge> : f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

/* Over this many rows a section starts folded. Eight is the longest list that
   still reads as a handful: a trusted device's four enrolment answers and a
   short list of checks stay open, and the 20-to-38-row
   signal lists — the ones that made the review unreadable — start shut. */
const LONG_SECTION = 8

const SECTION_ICON: Partial<Record<WizardStepId, LucideIcon>> = {
  profile: Tag,
  devices: Laptop,
  items: ListChecks,
  values: ListChecks,
}

/* `NextAside` stood here — "What happens next" in the review step's right
   column. Its two lines are a paragraph at the foot of the summary now, and the
   step has no right column at all. */
