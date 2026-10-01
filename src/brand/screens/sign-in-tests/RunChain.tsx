import { AnimatePresence, motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import { ArrowUpRight, ChevronsDownUp, ChevronsUpDown, TriangleAlert } from 'lucide-react'

import type { Rule } from '../../data'
import { leaves } from '../../predicate'
import { RuleTraceCard } from '../board/RuleCard'
import type { NameLookup } from '../predicate-prose'
import type { RuleConflict } from './conflicts'
import type { EngineRule } from './engine-run'
import { alsoMarks } from './journey'

/* -----------------------------------------------------------------------------
   The run's shared parts, in the POLICY BUILDER'S visual language (TESTING-V4
   §13.2, §14.3). The four stops themselves — the sign-in, which policy, the
   policy that decided, the answer — are RunNodes.tsx's and EngineJourney's
   (rebuilt 1 Oct 2026); what they share is here:

   - The spine: a segment arriving (`Seg`, motion's opacity and y) and the
     builder's bare connector between two stops (`ChainLink`), the way the
     sign-in took drawn down it in the decided path's colour as it holds
     (`.tj-link__draw`, motion's scaleY).
   - A part that opens and closes by its height (`Drawer`), and the builder's
     fold control on a stop's head (`FoldButton`).
   - A rule that would also apply (§13.2): its notice — "Also applies to Maya
     Iyer · via Finance", "Not used — rule 1 matched first", the fix, Open rule
     (`RuleConflictNotice`) — and its card drawn whole with it, as the why
     shows it (`ConflictRuleCard`, WhyCard.tsx).

   Colour says what happened (owner, 30 Sep; 1 Oct: "for the deny I think we
   should use red only"): blue only for the engine at work; the DECIDED PATH
   in the outcome's colour — green on 1 factor, yellow with 2FA, red on Deny
   (journey.ts `pathTone`); a rule that did not match quiet, its failing ✕ the
   one red; yellow for what cannot be told and for a conflict; grey for what
   was never reached. Motion owns what it moves, and journey.css gives none
   of it a transform or a transition. Reduced motion (and Skip) is the
   settled chain at once.
   -------------------------------------------------------------------------- */

/** Decelerating: what arrives. */
const EASE_OUT = [0.2, 0, 0, 1] as const
/** A drawer opening: quick to start, long to settle. */
const EASE_OPEN = [0.32, 0.72, 0, 1] as const
/** What changes size in place, or leaves. */
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const

// --- The spine and its segments -----------------------------------------------------------

/* One stop on the chain, arriving: it fades up a touch as the engine reaches
   it, a beat behind the one above. Settled (reduced motion, Skip, a revisit)
   it is simply there. */
export function Seg({ animate, delay = 0, className = '', children }: { animate: boolean; delay?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={`tj-seg ${className}`}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate ? 0.3 : 0, delay: animate ? delay : 0, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/* The builder's connector between two stops (`.bb__link`, bare — nothing is
   inserted here): grey, and the way the sign-in took drawn down it in green
   as it passes — what held, not what is still being worked on. */
export function ChainLink({ lit, animate, delay = 0, short = false }: { lit: boolean; animate: boolean; delay?: number; short?: boolean }) {
  return (
    <div className={`bb__link is-bare tj-link${short ? ' is-short' : ''}`} aria-hidden>
      {lit && (
        <motion.span
          className="tj-link__draw"
          initial={animate ? { scaleY: 0 } : false}
          animate={{ scaleY: 1 }}
          transition={{ duration: animate ? 0.3 : 0, delay: animate ? delay : 0, ease: EASE_IN_OUT }}
          style={{ originY: 0 }}
        />
      )}
    </div>
  )
}

/* A part that opens and closes by height — the scan folding away, the rules
   opening, a node folding — so what is under it moves with it and nothing
   jumps. */
export function Drawer({ open, animate, id, children }: { open: boolean; animate: boolean; id?: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="open"
          id={id}
          className="tj-drawer"
          initial={animate ? { height: 0, opacity: 0 } : false}
          animate={{ height: 'auto', opacity: 1, transition: animate ? { height: { duration: 0.32, ease: EASE_OPEN }, opacity: { duration: 0.2, delay: 0.05, ease: EASE_OUT } } : { duration: 0 } }}
          exit={{ height: 0, opacity: 0, transition: animate ? { height: { duration: 0.26, ease: EASE_IN_OUT }, opacity: { duration: 0.12 } } : { duration: 0 } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* The builder's fold control (RuleCard.tsx: `.bb__act .bb__fold__btn`, the
   ⇕ glyph that says which way it will go), on a node's head. Its trail shows
   on the card's hover and focus, as on the builder's card. */
export function FoldButton({
  open,
  onFold,
  what,
  titles,
  controls,
  lead,
}: {
  open: boolean
  onFold: () => void
  what: string
  titles: readonly [string, string]
  controls?: string
  /** What stands before the fold in the same trail, always shown — the policy's Open policy. */
  lead?: ReactNode
}) {
  return (
    <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
      {lead}
      <span className="bb__acts">
        <button
          type="button"
          className={`bb__act bb__fold__btn ${open ? 'is-open' : ''}`}
          aria-expanded={open}
          aria-controls={open ? controls : undefined}
          aria-label={open ? `Fold ${what}` : `Show ${what}`}
          title={open ? titles[0] : titles[1]}
          onClick={onFold}
        >
          {open ? <ChevronsDownUp size={13} strokeWidth={2.2} /> : <ChevronsUpDown size={13} strokeWidth={2.2} />}
        </button>
      </span>
    </div>
  )
}


// --- Conflicts ------------------------------------------------------------------------------

/* The foot of a rule that would also apply (§13.2). A conflict — another
   answer, through a group the rule that matched did not use — in amber:
   who it also applies to and through which group, that it is not used and
   why, the fix, and Open rule. An also-match — the same people, layered on
   purpose — one quiet grey line.

   On the chain it is short: "Not used — rule 1 matched first · the fix". In
   the why (`why`, the model's reason) it says the whole of it, the fix on a
   line of its own: "Not used: Naming Thomas Byrne does not move a rule up.
   Rule 1 matched first, and the first rule that matches decides". */
export function RuleConflictNotice({ c, person, onOpen, why = '' }: { c: RuleConflict; person: string; onOpen?: () => void; why?: string }) {
  if (c.kind === 'conflict') {
    return (
      <div className="tj-conflict" role="note">
        <p className="tj-conflict__head">
          <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
          <span className="tj-conflict__who">
            Also applies to {person}
            {c.via.say && ` · ${c.via.say}`}
          </span>
          {onOpen && (
            <button type="button" className="tj-conflict__open" onClick={onOpen}>
              Open rule
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </p>
        {why ? (
          <>
            <p className="tj-conflict__line">Not used: {why}</p>
            {c.fix && <p className="tj-conflict__line tj-conflict__fix">{c.fix}</p>}
          </>
        ) : (
          <p className="tj-conflict__line">
            {c.notUsed}
            {c.fix && <span className="tj-conflict__fix"> · {c.fix}</span>}
          </p>
        )}
        {/* The fix loosens access (a Deny came first): said, under it. */}
        {c.caution && <p className="tj-conflict__caution">{c.caution}</p>}
      </div>
    )
  }
  const via = c.via.kind === 'groups' || c.via.kind === 'person' ? c.via.say : ''
  return (
    <p className="tj-also">
      Also matches{via && ` · ${via}`} · {c.notUsed}
    </p>
  )
}

/* A rule that would also apply, drawn whole on its own — the why under the
   answer (WhyCard.tsx) — as the policy draws it among its rules: the
   builder's card, read-only, "Also applies" in the notice tone, the rows
   that held marked from the resolver's trace, its notice in its foot with
   the model's reason (`why`). The notice's Open rule is its one action: the
   card itself takes no press, and its title is words, not a button. */
export function ConflictRuleCard({ r, rule, c, resolve, person, onOpen, why = '' }: { r: EngineRule; rule: Rule; c: RuleConflict; resolve: NameLookup; person: string; onOpen?: () => void; why?: string }) {
  const condIds = useMemo(() => leaves(rule.when).map((x) => x.id), [rule])
  const via = r.via?.matches && (r.via.kind === 'groups' || r.via.kind === 'person') ? r.via.say : ''
  return (
    <RuleTraceCard
      rule={rule}
      index={r.index}
      state="not-reached"
      marks={alsoMarks(r, condIds)}
      miss={r.miss}
      resolve={resolve}
      full
      via={via}
      conflict={c.kind === 'conflict'}
      notice={<RuleConflictNotice c={c} person={person} onOpen={onOpen} why={why} />}
    />
  )
}
