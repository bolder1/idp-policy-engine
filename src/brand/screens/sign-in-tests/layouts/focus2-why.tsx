import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react'

import { recentChanges } from '../../../change-log'
import { useBrand, useNameLookup } from '../../../store'
import { attemptsOnSaid, type AppBreakInSummary } from '../../break-in-app'
import { rowsRead } from '../../testing/rows-read'
import { DENY_REASON_WORD, denyReasonOf } from '../deny-reason'
import { getInOptions } from '../get-in'
import { eachGroupRows, heroFinding, whyItems, whyTitle as whyTitleOf, type WhyTone } from '../journey'
import { DENIAL_REASONS, TEMP_ACCESS, WHY_IN_FOCUS } from '../phase'
import { WhyCard } from '../WhyCard'
import type { ChainWhy } from './classic2-chain'
import { useReroutes } from './directions-reroute'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   THE WHY, FROM FOCUS (6 Oct 2026; phase.ts `WHY_IN_FOCUS`).

   Everything the troubleshooting build of 5 Oct put into the why — How to get
   in, Let in for a while, What changed, Copy summary, the conflicts, As each
   group, the break-in attempts — lives in WhyCard.tsx, and until today only the
   column's answer opened it (EngineJourney.tsx). Focus is the one view the
   owner presents, and Focus2Layout never read the page's `why` at all: none of
   it could be reached from there.

   So Focus draws the same why, in the same place, read the same way:

     the way in    one quiet link at the foot of the outcome card's body
                   (classic2-chain.tsx `ChainWhy`) — a link INSIDE a card, by
                   the owner's ruling for what opens the right-hand panel:
                   never a button on the canvas's bar, never an icon on a
                   card's head. Pressed, the page's panel opens on the why;
                   pressed again, it shuts, as the column's Why? does.
     the why       WhyCard, handed what EngineJourney hands it — the findings,
                   the groups, the title, How to get in, the grant, What
                   changed, the attempts — and drawn by Focus2Layout into the
                   page's panel body (`why.slot`) while the panel is open on it.

   WHEN IT IS OFFERED is EngineJourney's own rule, read the same way off the
   same plan (`hasWhy`): a title to give it AND something under the title — a
   finding, or the reason a sign-in was refused. A plain allow with nothing to
   say has no link. The test (focus-why.test.tsx) pins the expressions both
   files use, so the two cannot drift into offering different whys.

   WHAT THE LINK SAYS is what the why will hold, in the column's own words:
     "Why, and how to get in"   refused, and the why can show a way in — a
                                what-if that lets them in, or Let in for a
                                while (the reason itself is on the card above)
     "Review conflict"          a conflict is the why's headline (the column's
                                strip says the same)
     "Why"                      anything else
   Something that can't be told is not offered a way in: the why can only say
   what was not stated, so it is "Why".

   ONLY ON THE PAGE. Absent the page's `why` — ClassicV2Layout's static
   renders, the builder's Check access, which draws the column and never Focus
   — there is no link and no why, and nothing here works out a what-if.
   -------------------------------------------------------------------------- */

/** The link's words (see WHAT THE LINK SAYS). */
export const WHY_LINK = 'Why'
export const WHY_CONFLICT_LINK = 'Review conflict'
export const WHY_GET_IN_LINK = 'Why, and how to get in'

/** What the link says: a way in for a refusal that has one, the conflict for a conflict, else the plain why. */
export function whyLinkLabel(o: { refused: boolean; waysIn: boolean; conflict: boolean }): string {
  if (o.refused && o.waysIn) return WHY_GET_IN_LINK
  if (o.conflict) return WHY_CONFLICT_LINK
  return WHY_LINK
}

/* The why's title when the attempts are all it has to say: their label, in the conflict's tone while some get through
   (EngineJourney.tsx `attemptsTitle`, which is not exported; kept word for word). */
const attemptsTitle = (s: Pick<AppBreakInSummary, 'appName' | 'holes'>): { text: string; tone: WhyTone } => ({
  text: attemptsOnSaid(s.appName),
  tone: s.holes > 0 ? 'conflict' : 'info',
})

export interface FocusWhy {
  /** The outcome card's link, or null: no page panel, the run not done, or nothing for the why to say. */
  link: ChainWhy | null
  /** The why, whole, while the page's panel is open on it; Focus2Layout draws it into `why.slot`. */
  card: ReactElement | null
}

/* The why as Focus draws it. `done` is the PRESENTED landing with nothing playing — the link is never offered, nor the
   why drawn, before the picture has reached the answer it is about. `root` is Focus's own root, where the focus comes
   back to the link when the panel is shut from inside itself. */
export function useFocusWhy(run: RunLayoutProps, done: boolean, root: RefObject<HTMLElement | null>): FocusWhy {
  const { plan, form, onTryForm, onGrant, grantFor, breakIn, onReviewBreakIn, onOpenRule, onOpenPolicy, onAdd, onAsGroup } = run
  const why = WHY_IN_FOCUS ? (run.why ?? null) : null
  const on = why !== null
  const brand = useBrand()
  const resolve = useNameLookup()
  /* The policies the run was resolved against, and the person by name, as EngineJourney reads them. */
  const policies = run.policies ?? brand.policies
  const personName = (form.personId && brand.users.find((u) => u.id === form.personId)?.name) || null
  /* How to get in: the what-ifs that would have let a refused sign-in through (get-in.ts), worked out only where the page
     can run one and has a panel to say them in. */
  const lib = useMemo(() => ({ zones: brand.zones, fingerprints: brand.fingerprints }), [brand.zones, brand.fingerprints])
  const rowsForForm = useMemo(() => rowsRead(policies, null, form.appId, lib), [policies, form.appId, lib])
  const wantGetIn = on && DENIAL_REASONS && onTryForm !== undefined && done && denyReasonOf(plan) !== null
  const reroutes = useReroutes(form, rowsForForm, plan, wantGetIn, policies)
  const reason = DENIAL_REASONS ? denyReasonOf(plan) : null
  const refused = reason !== null
  const changes = useMemo(() => (on && DENIAL_REASONS && refused && plan.decider ? recentChanges(brand.changeLog, plan.decider.id, new Date()) : []), [on, refused, plan.decider, brand.changeLog])
  const grant =
    TEMP_ACCESS && DENIAL_REASONS && onGrant && refused && form.personId && form.date && plan.decider && !plan.decider.isGlobalDefault && (grantFor === undefined || plan.decider.id === grantFor)
      ? { today: form.date, onGrant: (until: string, reason: string) => onGrant(plan.decider!.id, { id: form.personId!, name: personName ?? form.personId! }, until, reason) }
      : null
  const getIn = useMemo(
    () => (wantGetIn ? getInOptions(plan, reroutes.map((r) => ({ key: r.alt.key, label: r.alt.label, source: r.alt.source, plan: r.plan, form: r.form ?? undefined }))) : null),
    [wantGetIn, plan, reroutes],
  )

  /* The why's own parts (journey.ts), read as EngineJourney reads them in one column — and not at all without a panel. */
  const attempts = on && breakIn && plan.decider ? breakIn.summary : null
  const whyHead = useMemo(
    () => (on ? (whyTitleOf(plan) ?? (reason ? { text: DENY_REASON_WORD[reason], tone: 'info' as const } : null) ?? (attempts ? attemptsTitle(attempts) : null)) : null),
    [on, plan, reason, attempts],
  )
  const items = useMemo(() => (on ? whyItems(plan) : []), [on, plan])
  const groupRows = useMemo(() => (on ? eachGroupRows(plan) : null), [on, plan])
  const conflict = useMemo(() => on && heroFinding(plan)?.tone === 'conflict', [on, plan])
  const hasWhy = whyHead !== null && (items.length > 0 || reason !== null)
  const whyOpen = (hasWhy || attempts !== null) && done && (why ? why.open : false)

  const id = useId()
  /* The presses call the latest of the page's: the link and the card are drawn from memos. */
  const latest = useRef({ why, onReviewBreakIn })
  useLayoutEffect(() => {
    latest.current = { why, onReviewBreakIn }
  })
  const toggle = useCallback(() => {
    const w = latest.current.why
    if (w) w.onOpen(!w.open)
  }, [])
  /* The why's own X: the one shut the focus's way back below answers (`shutOwn`). */
  const shutOwn = useRef(false)
  const close = useCallback(() => {
    shutOwn.current = true
    latest.current.why?.onOpen(false)
  }, [])
  const review = useCallback(() => latest.current.onReviewBreakIn?.('why'), [])
  const whyBreakIn = useMemo(() => (attempts ? { summary: attempts, onReview: review } : null), [attempts, review])

  /* Shut by its own X, the focus must not be left on nothing. The page hands it back to what opened the panel where it
     can (page-keys.ts `refocus`); where it has not, it comes back here, to the link, or (the outcome folded since) to the
     outcome card's fold. Only when it is lost, two frames on, so it never takes the focus from the page's own choice, nor
     from a panel that took the why's place. And only after the X (review, 6 Oct 2026): a press in the why that RUNS —
     How to get in's what-if, a row of As each group — shuts the panel too, and the page gives that focus to the new
     run's canvas once the panel has slid out (`toCanvas`, 260 ms on); answered here, the focus went to the outcome
     card's fold in the gap and was then taken from it. The link pressed again keeps the focus it has, and Escape is the
     page's own. */
  const wasOpen = useRef(whyOpen)
  useEffect(() => {
    const was = wasOpen.current
    wasOpen.current = whyOpen
    if (!was || whyOpen) return
    const own = shutOwn.current
    shutOwn.current = false
    if (!own) return
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        const a = document.activeElement
        const lost = !a || a === document.body || !a.isConnected
        if (!lost || document.querySelector('.sit-panel:not(.sit-whypanel)')) return
        const el = root.current
        const back = el?.querySelector<HTMLElement>('.rl-c2__why') ?? el?.querySelector<HTMLElement>('[data-card="outcome"] .bb__fold__btn')
        back?.focus({ preventScroll: true })
      })
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [whyOpen, root])

  const label = whyLinkLabel({ refused, waysIn: (getIn?.length ?? 0) > 0 || grant !== null, conflict })
  const offered = on && done && hasWhy
  const link = useMemo<ChainWhy | null>(() => (offered ? { label, open: whyOpen, id, onPress: toggle } : null), [offered, label, whyOpen, id, toggle])

  const card =
    whyOpen && whyHead ? (
      <WhyCard
        plan={plan}
        items={items}
        groups={groupRows}
        headline={whyHead}
        policies={policies}
        resolve={resolve}
        person={personName ?? plan.conflicts?.personName ?? ''}
        id={id}
        interactive={done}
        onClose={close}
        onOpenRule={onOpenRule}
        onOpenPolicy={onOpenPolicy}
        onAdd={onAdd}
        onAsGroup={onAsGroup}
        breakIn={whyBreakIn}
        getIn={getIn}
        grant={grant}
        changes={changes}
        onGetIn={onTryForm}
      />
    ) : null

  return { link, card }
}
