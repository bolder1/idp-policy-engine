import { motion, useIsPresent } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, ChevronsLeftRight, ChevronsRightLeft, Play, ShieldAlert, ShieldCheck, X } from 'lucide-react'

import type { Policy } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { Face } from '../../faces'
import { Button, TipDot } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { attemptsOnSaid, decidedByLine, holesOf, type AppBreakInResult, type AppBreakInRow, type AppFixOffer } from '../break-in-app'
import { AcceptForm } from '../break-in-view'
import { BREAK_IN_TIP, COUNT_CELLS, acceptanceFor, acceptedSaid, canAccept, fixButton, fixLine, type Accepted, type CountKey } from '../break-in-model'
import type { BreakInCounts } from '../gauntlet'
import type { NameLookup } from '../predicate-prose'
import type { SimEnv } from '../simulate'
import { useSimEnv } from '../sim-env'
import { ATTEMPTS_PANEL_ID, atLeast, attemptGroups, attemptOffer, cellTone, isHole, movedSaid, resultSpoken, rowNote, tenantSaid } from './attempts'
import { ACCEPT_ATTEMPTS } from './phase'
import { PANEL_SLIDE as SLIDE } from './sign-in-card'

/* -----------------------------------------------------------------------------
   Break-in attempts on an application, as the page's right-hand panel (owner,
   1 Oct 2026: "can we implement it in the check part? as a suggestion inside
   conflicts or somewhere else" — then "go with your picks, start building").

     ┌ ← Break-in attempts on AWS Console ───────────── >< × ┐
     │ [ 3 Got through ] [ 0 Weaker … ] [ 2 Locked out ] [ 0 … ] ⓘ │
     │ Got through                                                │
     │ [PS] Finance account behind a known proxy               ▶ │
     │      A finance user appears from a commercial proxy …      │
     │      Expected [Deny] · Got [Allow with 2FA]                │
     │      Decided by AWS billing for Finance · Rule 1 ↗         │
     │      Add this rule  Deny sign-ins from outside India — …   │
     │      Got through now 2                                     │
     │      [Fix in policy ↗]                                     │
     │ Locked out                                                 │
     │ …                                                          │
     │ › Held 8                                                   │
     └────────────────────────────────────────────────────────────┘

   The sign-in panel's place and chrome (TryPanel.tsx): the Inspector's
   floating card, its name in the head row with the width and the X — and,
   opened from the Why panel's section, a way back to it, the two swapping in
   place as one panel (the page keys them the same, and the one coming in does
   not slide). It slides in from the outcome's strip or quiet link as the form
   does (motion props; there, and gone, under reduced motion), inert on its
   way out, its title taking the focus once it has arrived.

   The four counts once, a hole that is not 0 in the conflict tone; then every
   card under its result, in `GROUP_ORDER`, each heading its word and no
   number — the cells say the numbers — and Held last, folded, its count on
   the fold the one place it is said. A row is the attempt: the person's face,
   its name, its one line, what it should get and what it got — "Expected at
   least" on a threat that held with a stricter answer, and Can't tell alone
   where nothing decided one. Where those do not say why the row sits under
   its heading, one quiet line does (attempts.ts `rowNote`): a Weaker factor
   row's second factor, a can't tell row's missing facts. Pressed, it
   PLAYS — the page fills the sign-in with it and runs it on the canvas, as an
   access check, the answer saying what it expected — and the panel shuts for
   the run. Beside it, never inside it: the policy and rule that decided, a
   link that opens that rule in the builder; and, on a hole, the fix its card
   names, with what it would move, before anything is done — this page has no
   draft, so "Fix in policy" opens the policy in the builder with the fix in
   its draft (break-in-app.ts `fixOnArrival`). Never a looser fix, none for
   the Global Default (its link opens it), none on a row that held.

   Counts, never a grade; no Accept here yet (a later phase), but a result
   accepted in the builder is read as held, and says so. Tokens only
   (sign-in-tests.css); nothing here moves but the panel.
   -------------------------------------------------------------------------- */

/* The four counts as cells — the Why panel's section and this panel's head:
   each its number over its word, a hole that is not 0 in the conflict tone,
   a 0 quiet. Read, not pressed: the panel's groups are the list. */
export function AttemptCells({ counts }: { counts: Pick<BreakInCounts, CountKey> }) {
  return (
    <ul className="tj-cells" aria-label="Counts">
      {COUNT_CELLS.map((c) => (
        <li key={c.key} className={`tj-cell is-${cellTone(c.key, counts)}`}>
          <span className="tj-cell__num">{counts[c.key]}</span>
          <span className="tj-cell__word">{c.word}</span>
        </li>
      ))}
    </ul>
  )
}

export interface BreakInPanelProps {
  /** The run on the canvas's application (break-in-app.ts `breakInOnApp`). */
  result: AppBreakInResult
  /** "AWS Console", for the title. */
  appName: string
  reduced: boolean
  /** Opened from the Why panel's section: the way back to it. */
  back: boolean
  /** It slides in from the canvas; false where it takes the why's place in the one panel — it is simply there. */
  slide?: boolean
  /** The panel at its full width, and the way to change that (the Inspector's ><). */
  wide: boolean
  onToggleWidth: () => void
  /** The X: the panel shuts (the page's Escape does the same). */
  onClose: () => void
  onBack: () => void
  /** A row pressed: the page plays it on the canvas. */
  onPlay: (row: AppBreakInRow) => void
  /** Decided by …: the rule (or, with none, the policy) in the builder. */
  onOpenRule: (row: AppBreakInRow) => void
  /** Fix in policy: the deciding policy in the builder, the fix in its draft. */
  onFix: (row: AppBreakInRow, offer: AppFixOffer) => void
}

export function BreakInPanel({ result, appName, reduced, back, slide = true, wide, onToggleWidth, onClose, onBack, onPlay, onOpenRule, onFix }: BreakInPanelProps) {
  const present = useIsPresent()
  const { users, policies, breakInAccepted, acceptBreakIn, account } = useBrand()
  const env = useSimEnv()
  const resolve = useNameLookup()
  const heading = useId()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const [heldOpen, setHeldOpen] = useState(false)
  const { groups, held } = useMemo(() => attemptGroups(result.rows), [result.rows])
  const title = attemptsOnSaid(appName)
  const holes = holesOf(result.counts)
  /* Its title takes the focus once it has arrived — at once where it swapped in for the why. */
  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), reduced || !slide ? 0 : SLIDE.duration * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, [])
  const nameOf = (personId: string) => users.find((u) => u.id === personId)?.name ?? personId
  const row = (r: AppBreakInRow) => (
    <AttemptRow
      key={r.id}
      row={r}
      person={nameOf(r.personId)}
      result={result}
      policies={policies}
      env={env}
      accepted={breakInAccepted}
      resolve={resolve}
      onPlay={onPlay}
      onOpenRule={onOpenRule}
      onFix={onFix}
      onAccept={(r, reason) => {
        const a = acceptanceFor(r.round, account.name, new Date().toISOString(), reason)
        if (a && r.policyId) acceptBreakIn(r.policyId, r.id, a)
      }}
      onRestore={(r) => {
        if (r.policyId) acceptBreakIn(r.policyId, r.id, null)
      }}
    />
  )

  return (
    <motion.aside
      id={ATTEMPTS_PANEL_ID}
      className="bb__insp sit-panel sit-attpanel"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced || !slide ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule">
        {back && (
          <button type="button" className="bb__act" aria-label="Back to why" title="Back" onClick={onBack}>
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
        )}
        <h2 ref={titleRef} id={heading} className="sit-panel__title" title={title} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="bb__inspbody sit-att">
        {/* One plain answer, not four counts: how many got through, out of how many were tried. */}
        <div className={`sit-att__verdict ${holes > 0 ? 'is-hole' : 'is-clear'}`}>
          <span className="sit-att__vmark" aria-hidden>
            {holes > 0 ? <ShieldAlert size={18} strokeWidth={2.1} /> : <ShieldCheck size={18} strokeWidth={2.1} />}
          </span>
          <p className="sit-att__vsay">
            <strong>{holes > 0 ? `${holes} got through` : 'None got through'}</strong>
            <span>{result.rows.length} attempts tried</span>
          </p>
          <TipDot text={BREAK_IN_TIP} label="About break-in attempts" />
        </div>

        {groups.map((g) => (
          <section key={g.group} className="sit-att__group" aria-labelledby={`${heading}-${g.group}`}>
            <h3 id={`${heading}-${g.group}`} className="sit-att__gh">
              {g.word}
            </h3>
            <ul className="sit-att__list">{g.rows.map(row)}</ul>
          </section>
        ))}

        {/* What held, last and folded: not the question. Its count is said
            here and nowhere else in the panel. A native disclosure, so the
            page's Escape — which waits for anything expanded in the panel —
            still shuts the panel with it open. */}
        {held.length > 0 && (
          <details className="sit-att__held" open={heldOpen} onToggle={(e) => setHeldOpen(e.currentTarget.open)}>
            <summary className="sit-att__heldsum">
              {heldOpen ? <ChevronDown size={14} strokeWidth={2} aria-hidden /> : <ChevronRight size={14} strokeWidth={2} aria-hidden />}
              <span>Blocked</span>
              <span className="sit-att__heldn">{held.length}</span>
            </summary>
            <ul className="sit-att__list">{held.map(row)}</ul>
          </details>
        )}
      </div>
    </motion.aside>
  )
}

/* One attempt: the press that plays it, then — beside it, not inside it —
   who decided it, and on a hole the fix with what it would move. */
function AttemptRow({
  row,
  person,
  result,
  policies,
  env,
  accepted,
  resolve,
  onPlay,
  onOpenRule,
  onFix,
  onAccept,
  onRestore,
}: {
  row: AppBreakInRow
  person: string
  result: AppBreakInResult
  policies: readonly Policy[]
  env: SimEnv
  accepted: Readonly<Record<string, Accepted>>
  resolve: NameLookup
  onPlay: (row: AppBreakInRow) => void
  onOpenRule: (row: AppBreakInRow) => void
  onFix: (row: AppBreakInRow, offer: AppFixOffer) => void
  onAccept: (row: AppBreakInRow, reason: string) => void
  onRestore: (row: AppBreakInRow) => void
}) {
  const [accepting, setAccepting] = useState(false)
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const mayAccept = ACCEPT_ATTEMPTS && row.policyId !== null && canAccept(row)
  /* Asked of a hole only, as it is drawn, and kept for the run (attempts.ts `attemptOffer`). */
  const offer = useMemo(() => (isHole(row) ? attemptOffer(result, row, policies, env, accepted) : null), [row, result, policies, env, accepted])
  const by = decidedByLine(row)
  const note = rowNote(row, policies)
  const moved = offer ? movedSaid(result.counts, offer.preview.counts) : null
  const tenant = offer ? tenantSaid(offer.preview.line) : null
  return (
    <li className={`sit-att__row is-${row.group}${open ? ' is-open' : ''}`}>
      {/* One line: who, what was tried, and a chevron. The rest — what happened and what to do — opens under it. */}
      <button type="button" className="sit-att__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
        <span className="sit-att__face" aria-hidden>
          <Face kind="user" name={person} size="sm" decorative />
        </span>
        <span className="sit-att__name">{row.name}</span>
        {row.accepted && (
          <span className="sit-att__accepted" title={acceptedSaid(row.accepted)}>
            Accepted
          </span>
        )}
        {open ? <ChevronUp className="sit-att__chev" size={14} strokeWidth={2} aria-hidden /> : <ChevronDown className="sit-att__chev" size={14} strokeWidth={2} aria-hidden />}
      </button>
      <div id={bodyId} className="sit-att__body" hidden={!open}>
        <p className="sit-att__story">{row.story}</p>
        {/* Each word with its badge, so a narrow panel breaks the line between the two and never between "Got" and its
            answer; where nothing decided one answer, Can't tell alone — no "Got". */}
        <p className="sit-att__result">
          <span className="sit-att__pair">
            <span>{atLeast(row) ? 'Should be at least' : 'Should be'}</span>
            <DecisionBadge decision={row.expected} />
          </span>
          <span className="sit-att__dot">·</span>
          {row.got ? (
            <span className="sit-att__pair">
              <span>Got</span>
              <DecisionBadge decision={row.got} />
            </span>
          ) : (
            <CantTell />
          )}
          <span className="u-sr-only">{resultSpoken(row)}</span>
        </p>
        {note && <p className="sit-att__note">{note}</p>}
        <p className="sit-att__byline">
          {row.policyId !== null ? (
            <button type="button" className="sit-att__by" title={`Open ${row.policyName ?? 'the policy'}`} onClick={() => onOpenRule(row)}>
              <span>{by}</span>
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          ) : (
            <span className="sit-att__by is-text">{by}</span>
          )}
        </p>
        {offer && (
          <div className="sit-att__fix">
            <p className="sit-att__fixline">
              <span className="sit-att__fixword">{fixButton(offer.fix, offer.policy)}</span>
              <span>{fixLine(offer.fix, offer.policy, resolve)}</span>
            </p>
            {moved && <p className="sit-att__moved">{moved}</p>}
            {tenant && <p className="sit-att__tenant">{tenant}</p>}
            <span className="sit-att__fixact">
              <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => onFix(row, offer)}>
                Fix in policy
              </Button>
            </span>
          </div>
        )}
        {row.accepted && (
          <p className="sit-att__note">
            {acceptedSaid(row.accepted)} · {row.accepted.reason}
          </p>
        )}
        {accepting ? (
          <AcceptForm
            onCancel={() => setAccepting(false)}
            onAccept={(reason) => {
              setAccepting(false)
              onAccept(row, reason)
            }}
          />
        ) : (
          <div className="sit-att__acts">
            <Button variant="secondary" size="sm" icon={Play} onClick={() => onPlay(row)}>
              Run this sign-in
            </Button>
            {mayAccept &&
              (row.accepted ? (
                <Button variant="ghost" size="sm" onClick={() => onRestore(row)}>
                  Restore expectation
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setAccepting(true)}>
                  Accept this result
                </Button>
              ))}
          </div>
        )}
      </div>
    </li>
  )
}
