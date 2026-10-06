import { Check, PenLine, RotateCcw, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'

import { Face } from '../../../faces'
import { Tip } from '../../../kit'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import { ChipSwitch } from './classic2-chain'
import { useGlide } from './classic2-glide'
import { factRows, signsIn } from './classic2-model'
import { identityChips, rowFacts, rowState, whoLabel } from './shared/sign-in-row'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   THE SIGN-IN NODE — the chain's first node where Focus draws it (owner, 5 Oct
   2026: "remove the first node, the sign-in node — no need for that. Then the
   first pill-shaped node should be the node as we have in the top, so we can
   showcase 'Maya Iyer signs in at AWS with 2 sign-in conditions' … add the edit
   button there; remove the sign-in node and the top node; and make the main
   pill node editable").

   The builder's start pill (`.bb__start`: white, full radius, its 1 px edge,
   13 px at 500), grown to hold the sign-in — and, as on the builder, a press:

     [MI] Maya Iyer signs in to [logo] AWS Console · 2 sign-in conditions  │ ✎ ↻

   who · app     one button with the pill: a press anywhere on the pill outside
                 its two buttons opens Check access on the sign-in (the layout's
                 `onPressPerson`), and its focus ring is the pill's
   the count     "· 2 sign-in conditions" (1 → "1 sign-in condition"; none →
                 nothing), quiet, its tip the conditions in plain words; then the
                 run's state as the row said it — "Not run", "Changed by …",
                 "Expected …" (shared/sign-in-row.ts `rowState`)
   ✎ ↻           Edit sign-in (pressed while the panel is open) and Replay ("Run
                 this sign-in again"; aria-disabled while the run plays), after a
                 hairline

   Two or more identities: the person is their chips (IdentityChips, folding as
   the room asks — names, short names, faces), a press on one switching the run;
   "signs in to [logo] AWS Console" is then the press that edits.

   Across (the chain laid as a row) it keeps to ROW_START, its words wrapping onto
   a second line beside the two buttons. Gliding between the
   two (classic2-glide.ts) it is a box and what it says one piece, carried with it
   unstretched — one piece, so its parts never cross each other on the way.
   -------------------------------------------------------------------------- */

export interface SignInNodeProps {
  /** The run as the page draws it (Focus: the presented one, so the state never says more than the picture). */
  run: RunLayoutProps
  /** What an answer points at is the person: the node is ringed where it stands. */
  lit?: boolean
  /** The chain is laid across: two lines, and the identity chips measured again for the room. */
  across?: boolean
}

export function SignInNode({ run, lit = false, across = false }: SignInNodeProps) {
  const { form, rows, asGroup, plan, running, unrun, changed, expected, editing, onPressPerson, onReplay, onPickIdentity } = run
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const group = asGroup ? (groups.find((g) => g.id === asGroup || g.name === asGroup)?.name ?? asGroup) : null
  const who = group ? `Anyone in ${group}` : (person?.name ?? 'Choose a person')
  const app = apps.find((a) => a.id === form.appId) ?? null
  const appName = app?.name ?? ''
  const facts = useMemo(() => factRows(rowFacts(form, rows, { zones })), [form, rows, zones])
  const { count, said } = signsIn(facts)
  const state = rowState({ plan, running, unrun, changed, expected })
  /* Marked once the run on screen has landed (the run handed here is the presented one), as the row's were. */
  const chips = useMemo(() => identityChips(run.identities, !running), [run.identities, running])
  const { box, piece } = useGlide(0, 'start')

  /* What the press says it edits, and what the sign-in is: the count and the run's state are words of the same press. */
  const label = [whoLabel(chips ? chips.map((c) => c.name).join(', ') : who, appName), count, state?.words].filter(Boolean).join(', ')
  const what = (
    <>
      {app ? (
        <>
          <span className="rl-c2__nverb">signs in to</span>
          <span className="rl-c2__napp">
            <AppLogo appId={app.id} name={app.name} size={16} />
            <b className="bb__start__at">{app.name}</b>
          </span>
        </>
      ) : (
        <span className="rl-c2__nnone">Choose an application</span>
      )}
      {/* The count's tip is the conditions in plain words — but not while the panel is open (5 Oct 2026): the panel lists
          them itself, and a press on the pill slides the count under a pointer that has not moved, so its tip opened
          and stayed, over the chain, until the panel was shut. */}
      {count && (editing ? (
        <span className="rl-c2__ncount">{count}</span>
      ) : (
        <Tip text={said}>
          <span className="rl-c2__ncount">{count}</span>
        </Tip>
      ))}
      {state && (
        <span className={`rl-c2__nstate is-${state.kind}`}>
          {state.kind === 'expected' && state.met !== null && (state.met ? <Check size={12} strokeWidth={2.6} aria-hidden /> : <X size={12} strokeWidth={2.6} aria-hidden />)}
          {state.words}
        </span>
      )}
    </>
  )
  return (
    <motion.div
      className={`bb__start rl-c2__start rl-c2__node${across ? ' is-across' : ''}${lit ? ' is-lit' : ''}${editing ? ' is-on' : ''}${chips ? ' has-ids' : ''}`}
      data-node="sign-in"
      onClick={onPressPerson}
      {...box}
    >
      <motion.span className="rl-c2__nbody" {...piece}>
        {chips && (
          /* A chip switches the run; it never opens the panel. */
          <span className="rl-c2__nids" onClick={(e) => e.stopPropagation()}>
            <ChipSwitch chips={chips} onPick={onPickIdentity} lit={lit} refit={across ? 'across' : 'down'} />
          </span>
        )}
        {/* Who signs in to what, and how many conditions it states: one press, its words wrapping as one line of prose. */}
        <button type="button" className="rl-c2__nmain" aria-label={label} title="Edit the sign-in">
          {!chips && (group || person) && (
            <span className="rl-c2__nface" aria-hidden>
              {group ? <Face kind="group" name={group} size="sm" decorative /> : person && <Face kind="user" name={person.name} size="sm" decorative />}
            </span>
          )}
          {!chips && <span className={person || group ? 'rl-c2__nname' : 'rl-c2__nnone'}>{who}</span>}
          {what}
        </button>
        {/* The pencil and Replay: their own presses, never the pill's. */}
        <span className="rl-c2__nacts" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="bb__act rl-c2__edit" aria-label="Edit sign-in" aria-pressed={editing === true} title="Edit sign-in" onClick={onPressPerson}>
            <PenLine size={13} strokeWidth={2} />
          </button>
          <button type="button" className="bb__act rl-c2__replay" aria-label="Replay" aria-disabled={running || undefined} title={running ? 'The run is playing' : 'Run this sign-in again'} onClick={() => !running && onReplay?.()}>
            <RotateCcw size={13} strokeWidth={2.2} />
          </button>
        </span>
      </motion.span>
    </motion.div>
  )
}
