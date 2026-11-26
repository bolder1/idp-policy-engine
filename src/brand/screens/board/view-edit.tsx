import { Check, Eye, PencilLine, PencilOff, Power, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useId } from 'react'

import type { Policy } from '../../data'
import { Badge, Button, IconButton, Modal } from '../../kit'
import { shows } from '../../rollout'
import { ReadOnlyCanvas } from '../sign-in-tests/InspectPanel'
import { LIVE_BUTTON, LIVE_PANEL, NOTHING_LIVE } from './draft-model'
import { STATUS_WORD } from './read-as-text'
import './view-edit.css'

/* Show published policy in the published colour, with a broadcast mark (rollout.ts `publishedLook`). */
const PUBLISHED_LOOK: boolean = shows('publishedLook')
/* The mode buttons say "Edit policy" and "Exit edit mode", and Edit policy is never orange (rollout.ts `modeButtons`). */
const MODE_BUTTONS: boolean = shows('modeButtons')

/* -----------------------------------------------------------------------------
   "View and edit" on the builder (draft-model.ts `useViewEdit`, rollout.ts `viewEdit`; the stakeholders through the
   owner, 24 Nov 2026: "whenever the user comes inside the builder, this will be view-only, and there will be an edit
   button … the edit mode … add a button to show published policy").

   Two modes over the same board:
     View   what is saved, read only. The status lives here: the pill, Make active / Make inactive in the ⋯, and Make
            active as a button while the policy is not active. Edit is the way in.
     Draft  everything edits, the applications too. No status at all: Save draft, Save and publish, Show published
            policy (the live version in the right-hand panel) and Done, which goes back to the view.
   A new policy starts in draft mode, since there is nothing to view yet.
   -------------------------------------------------------------------------- */

/** The bar's mode buttons, before the saves: Make active and Edit in the view; Show published policy and Done in draft mode. */
export function ViewEditActions({
  editing,
  onEdit,
  onDone,
  onMakeActive,
  publishedOpen,
  onTogglePublished,
  simple = false,
  liveOff = NOTHING_LIVE,
  hideLive = false,
}: {
  /** One version only, so no live version to show: Simple's Inactive policy (rollout.ts `ruleSaveFocus`). */
  hideLive?: boolean
  editing: boolean
  onEdit: () => void
  /** Absent on a new policy, which has no view to go back to until its first save. */
  onDone?: () => void
  /** The view, a policy that is not active and can be: Make active is the view's one orange button. */
  onMakeActive?: () => void
  /** Draft mode on a policy that has been published: its live version beside the draft. */
  publishedOpen: boolean
  onTogglePublished?: () => void
  /** Simple (draft-model.ts `useSimpleDraft`): the button says "Show live version" and stands in every edit state,
   *  greyed while nothing is live (owner, 25 Nov 2026). */
  simple?: boolean
  /** Why the greyed button waits, said on hover: nothing live yet, or no change to compare. */
  liveOff?: string
}) {
  if (!editing) {
    return (
      <span className="bve-acts">
        {/* One orange per view: Make active while it is offered, otherwise Edit. With `modeButtons`, the way in is
            "Edit policy" and always secondary: Make active is the view's one orange, and a view with nothing to make
            active has none (owner, 25 Nov 2026: "Edit should be secondary in both ways", then "we can call it Edit
            Policy"). */}
        <Button variant={onMakeActive || MODE_BUTTONS ? 'secondary' : 'brand'} size="sm" icon={PencilLine} onClick={onEdit}>
          {MODE_BUTTONS ? 'Edit policy' : 'Edit'}
        </Button>
        {/* Power, as the application's head and the rows draw Make active. */}
        {onMakeActive && (
          <Button variant="brand" size="sm" icon={Power} onClick={onMakeActive}>
            Make active
          </Button>
        )}
      </span>
    )
  }
  /* On a narrow window these two keep their icons and drop their words (view-edit.css `.bve-label`), so the saves
     beside them stay on screen. The words stay the accessible name, and the title says them on hover. */
  const label = simple ? LIVE_BUTTON : 'Show published policy'
  /* Simple keeps the button where it is while there is no live version, greyed and saying why on hover. */
  const nothingLive = simple && !onTogglePublished
  return (
    <span className="bve-acts">
      {!hideLive && (onTogglePublished || nothingLive) &&
        (PUBLISHED_LOOK ? (
          <PublishedButton pressed={publishedOpen} onClick={onTogglePublished} label={label} offTitle={liveOff} />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={Eye}
            pressed={publishedOpen}
            title={nothingLive ? liveOff : label}
            blocked={nothingLive ? liveOff : undefined}
            onClick={onTogglePublished}
          >
            <span className="bve-label">{label}</span>
          </Button>
        ))}
      {/* The way back to the view. With `modeButtons` it says so, "Exit edit mode", where "Done" read as finishing the
          policy (owner, 25 Nov 2026: "what is this button doing?", then "call it something related to mode"). It saves
          nothing; unsaved edits ask first (BoardBuilder.tsx `doneEditing`). */}
      {onDone && (
        <Button variant="secondary" size="sm" icon={MODE_BUTTONS ? PencilOff : Check} title={MODE_BUTTONS ? 'Exit edit mode' : 'Done'} onClick={onDone}>
          <span className="bve-label">{MODE_BUTTONS ? 'Exit edit mode' : 'Done'}</span>
        </Button>
      )}
    </span>
  )
}

/* -----------------------------------------------------------------------------
   Show published policy, in the published colour (owner, 25 Nov 2026: "make it color animated, should feel like
   published, add a better icon, give the hover a cool interaction"; rollout.ts `publishedLook`).

   Published is what people sign in with now, so the button wears the Active pill's green, drifting slowly between its
   two tints, and its mark is a broadcast: a source and two rings of signal either side. The outer rings breathe at
   rest. On hover a light passes across the button, a soft green halo rises round it, and the signal goes out ring by
   ring. Open, it holds on the deeper tint. A press gives a little under the finger.

   The colour, the light and the halo are view-edit.css; the rings and the press are Motion, which owns their
   transforms. Reduced motion keeps the colours and drops every movement. Design only.
   -------------------------------------------------------------------------- */

/** The broadcast's four rings, as lucide's Radio draws them: `side` is the way each goes out, `ring` 0 is the inner pair. */
const RINGS = [
  { d: 'M7.753 16.239a6 6 0 0 1 0-8.478', side: -1, ring: 0 },
  { d: 'M16.247 7.761a6 6 0 0 1 0 8.478', side: 1, ring: 0 },
  { d: 'M4.925 19.067a10 10 0 0 1 0-14.134', side: -1, ring: 1 },
  { d: 'M19.075 4.933a10 10 0 0 1 0 14.134', side: 1, ring: 1 },
] as const

type Ring = (typeof RINGS)[number]

/* Named for the button's states, which pass down to the rings: rest, hover (Motion's whileHover) and open. The hover
   wave starts the outer ring a beat after the inner one, and the equal durations keep that beat on every repeat. */
const RING_MOTION: Variants = {
  rest: (r: Ring) =>
    r.ring
      ? { opacity: [1, 0.4, 1], x: 0, transition: { opacity: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }, x: { duration: 0.2 } } }
      : { opacity: 1, x: 0, transition: { duration: 0.2 } },
  hover: (r: Ring) => ({
    opacity: [0.25, 1, 0.25],
    x: [0, r.side * 1.5, 0],
    transition: { duration: 1, repeat: Infinity, ease: 'easeOut', delay: r.ring * 0.22 },
  }),
  open: { opacity: 1, x: 0, transition: { duration: 0.2 } },
}

const RING_STILL: Variants = { rest: { opacity: 1, x: 0 }, hover: { opacity: 1, x: 0 }, open: { opacity: 1, x: 0 } }

/* Without `onClick` there is nothing live to show (Simple): the button stays in its place, grey and still, and its
   title says why. `aria-disabled` rather than `disabled`, so the title still shows on hover, as the kit's do. */
function PublishedButton({ pressed, onClick, label, offTitle = NOTHING_LIVE }: { pressed: boolean; onClick?: () => void; label: string; offTitle?: string }) {
  const reduce = useReducedMotion()
  const off = !onClick
  const still = reduce || off
  return (
    <motion.button
      type="button"
      className={`bx-btn bx-btn--sm bve-pubbtn${off ? ' is-off' : ''}`}
      title={off ? offTitle : label}
      aria-pressed={off ? undefined : pressed}
      aria-disabled={off || undefined}
      onClick={onClick}
      /* No `initial={false}`: it would skip the mount animation, and with it the outer rings' breathing at rest. */
      animate={pressed && !off ? 'open' : 'rest'}
      whileHover={still ? undefined : 'hover'}
      whileTap={still ? undefined : { scale: 0.97 }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {RINGS.map((r) => (
          <motion.path key={r.d} d={r.d} custom={r} variants={still ? RING_STILL : RING_MOTION} />
        ))}
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
      <span className="bve-label">{label}</span>
    </motion.button>
  )
}

/** Draft mode's mark on the canvas, where Fix's Live / Draft chip stands: which copy this is, and whether it is saved. */
export function DraftModeChip({ shown, unsaved, savedBy }: { shown: boolean; unsaved: boolean; savedBy?: string }) {
  const reduce = useReducedMotion()
  const said = unsaved ? 'Not saved yet' : savedBy ? `Saved by ${savedBy === 'You' ? 'you' : savedBy}` : null
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="draft-mode"
          className="bve-chip"
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
        >
          <PencilLine size={14} strokeWidth={2} aria-hidden />
          <b>Draft</b>
          {said && <span className="bve-chip__meta">{said}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Simple's Show live version, as a popup over the board (owner, 25 Nov 2026: "convert this Live version as a popup"):
 *  the live rules read only, the status beside the title, nothing to press but close. */
export function LiveVersionPopup({ policy, open, onClose }: { policy: Policy; open: boolean; onClose: () => void }) {
  return (
    /* `bare`, with its own head row: the status sits beside the title on one line, as the Policy details drawer has it,
       rather than floating at the top corner (owner, 25 Nov 2026: "fix the alignment"). */
    <Modal open={open} onClose={onClose} title={LIVE_PANEL} width={720} bare>
      <div className="bve-livepop__head">
        <h2>{LIVE_PANEL}</h2>
        <Badge tone={policy.status === 'active' ? 'positive' : 'neutral'}>{STATUS_WORD[policy.status]}</Badge>
      </div>
      <div className="bve-livepop">
        <ReadOnlyCanvas policy={policy} traced={[]} framed still idPrefix="live-" />
      </div>
    </Modal>
  )
}

/** Show published policy: the version people sign in with, read only, in the inspector's slot, or with `left` in the
 *  board's leading track, so the rule editor keeps the right and the two are read side by side (rollout.ts
 *  `publishedLeft`). */
export function PublishedPanel({ policy, left = false, title = 'Published policy', onClose }: { policy: Policy; left?: boolean; /** Simple says "Live version". */ title?: string; onClose: () => void }) {
  const uid = useId()
  return (
    <aside className={`bb__insp brat bve-pub${left ? ' is-left' : ''}`} aria-labelledby={`${uid}-title`}>
      <div className="bb__inspbar brat__bar">
        <h2 id={`${uid}-title`} className="brat__title">
          {title}
        </h2>
        <span className="brat__barend">
          <Badge tone={policy.status === 'active' ? 'positive' : 'neutral'}>{STATUS_WORD[policy.status]}</Badge>
          <IconButton icon={X} size="sm" tone="ghost" label={`Close ${title}`} onClick={onClose} />
        </span>
      </div>
      <div className="bve-pub__body">
        <ReadOnlyCanvas policy={policy} traced={[]} framed still idPrefix="pub-" />
      </div>
    </aside>
  )
}
