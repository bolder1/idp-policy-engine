import { Eye, PencilLine } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import type { Policy } from '../../data'
import { Badge, Confirm } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { Picker, type PickerOption } from '../../picker'
import { DRAFT_MODEL_OPTIONS, FIX_DRAFT_CHIP, PUBLISHED, SAVE_AND_PUBLISH, setDraftModel, useDraftModel, useDraftModelsShown, type DraftModel } from './draft-model'
import { STATUS_WORD } from './read-as-text'
import { Seg } from './Section'
import { REVIEW_DEMO, setActor, useVersionStore, type Actor } from './policy-versions'
import { useSwitchesShown } from './builder-version'
import './draft-fix.css'

/* The Draft model's pieces on screen (draft-model.ts): the switch itself, the Fix model's edit chip and its Live / Draft
   view. Each is drawn only where the builder asks for it, so Today is the builder exactly as it was. Compare was built
   and taken out the same day (owner, 23 Nov 2026: "remove Compare from this version"): Live / Draft is the comparison. */

/** The bar's Draft model dropdown, Design only. V3 adds "Acting as" beside it, the demo's second admin. */
export function DraftModelSwitch() {
  const model = useDraftModel()
  /* Hidden with the Builder version switch, and back with it (builder-version.ts, HIDDEN). The model stays in force. */
  const switchesShown = useSwitchesShown()
  /* Locked with the builder versions (draft-model.ts `useDraftModelsShown`): drawn only after Ctrl+P and the password. */
  if (!useDraftModelsShown() || !switchesShown) return null
  return (
    <>
      <Picker
        label="Draft model"
        size="sm"
        prefix="Draft model"
        value={model}
        options={DRAFT_MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => setDraftModel(v as DraftModel)}
      />
      {/* Hidden as of now (policy-versions.ts `REVIEW_DEMO`). */}
      {model === 'v3' && REVIEW_DEMO && <ActingAsPicker />}
    </>
  )
}

/** V3: who the demo acts as (policy-versions.ts). A reviewer is another admin, so it can approve the author's request. */
function ActingAsPicker() {
  const { actor } = useVersionStore()
  return (
    <Picker
      label="Acting as"
      size="sm"
      prefix="Acting as"
      value={actor}
      options={[
        { value: 'author', label: 'Author' },
        { value: 'reviewer', label: 'Reviewer' },
      ]}
      onChange={(v) => setActor(v as Actor)}
    />
  )
}

/** Fix: the edit chip. About your copy, never the status: unsaved edits, or a draft saved beside live. */
export function FixChip({ unsaved, draft }: { unsaved: boolean; draft?: Policy['pendingDraft'] }) {
  if (unsaved) return <Badge tone="notice" className="bx-change">Unsaved changes</Badge>
  if (!draft) return null
  return (
    <span className="bdm-chip" title={`Saved by ${draft.savedBy} · ${draft.savedAt}`}>
      <Badge tone="info" className="bx-change">{FIX_DRAFT_CHIP}</Badge>
    </span>
  )
}

export type CanvasView = 'draft' | 'live'

/* Fix: the tag over a Live canvas (owner, 23 Nov 2026: "this should feel like a view only version, add a good animated
   tag", then "let the user know that this is the active policy that is going for this application", then "just a basic
   way … only the active part … I can see the duplication of the same thing twice").

   One fact, said once: where this policy is deciding sign-ins. "View only" and "Edit draft" were here and went — the
   blue ground says it is a view, and the bar's Live / Draft switch is the way back. A policy that decides nothing
   (Inactive) shows no tag: its status pill already says so. It drops in from the top of the stage as Live opens and
   lifts away as Draft comes back. */
export function LiveViewTag({
  shown,
  status,
  apps,
}: {
  shown: boolean
  /** The stored status: only Active, Monitoring and Always on draw the tag. */
  status: Policy['status']
  /** Its applications, the first named with its logo. */
  apps: { id: string; name: string }[]
}) {
  const reduce = useReducedMotion()
  const word = status === 'active' || status === 'always-on' ? 'Active' : status === 'monitor' ? 'Monitoring' : null
  const first = apps[0]
  return (
    <AnimatePresence initial={false}>
      {shown && word && (
        <motion.div
          key="live-tag"
          className="bdm-live"
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
        >
          {first && <AppLogo appId={first.id} size={16} />}
          <span>
            {word} on <b>{first ? first.name : 'every application'}</b>
          </span>
          {apps.length > 1 && <span className="bdm-live__more">+{apps.length - 1}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* Fix, on the canvas (rollout.ts `fixViewOnCanvas`; owner, 24 Nov 2026: take "Unsaved changes" out of the bar, put Live /
   Draft on the canvas once something changes, and lose the blue Live look). The top-left chip where "Active on <app>"
   stood is now the switch itself: it drops in at the first change and reads "Draft" while the admin works, "Live"
   while Live shows. No application in it (owner, 24 Nov 2026: "no need the app name here, can see the thing in the
   canvas"): the start node already says where sign-ins arrive. The badge's job is carried here: the chip exists only
   while the policy differs from live, and the Draft row says whether that copy is saved. */
export function CanvasViewPick({
  shown,
  value,
  onChange,
  inUse,
  unsaved,
  draft,
  status,
}: {
  /** Drawn while the policy differs from live (draft-model.ts `offersLiveView`). */
  shown: boolean
  value: CanvasView
  onChange: (v: CanvasView) => void
  /** Deciding sign-ins now (draft-model.ts `reachesSignIns`); an inactive policy's other copy is "Saved", not "Live". */
  inUse: boolean
  /** Edits not saved yet, and the draft saved beside live. */
  unsaved: boolean
  draft?: Policy['pendingDraft']
  /* The stored status, where the bar follows the version on screen (rollout.ts `versionBar`): that copy is "Published"
     whether active or not, and its row says which, since the status is the published version's alone. */
  status?: Policy['status']
}) {
  const reduce = useReducedMotion()
  const live: PickerOption = status
    ? { value: 'live', label: PUBLISHED, icon: Eye, meta: STATUS_WORD[status] }
    : { value: 'live', label: inUse ? 'Live' : 'Saved', icon: Eye }
  const mine: PickerOption = {
    value: 'draft',
    label: 'Draft',
    icon: PencilLine,
    meta: unsaved ? 'Not saved yet' : draft ? `Saved by ${draft.savedBy === 'You' ? 'you' : draft.savedBy}` : undefined,
  }
  const onLive = value === 'live'
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="view-pick"
          className="bdm-pick"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
        >
          <Picker
            label="Show"
            value={value}
            options={[live, mine]}
            onChange={(v) => onChange(v as CanvasView)}
            icon={onLive ? Eye : PencilLine}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type FirstStatus = 'active' | 'monitor' | 'inactive'

/* Fix, a policy's first publish (rollout.ts `versionBar`; owner, 24 Nov 2026: "the confirm ask Active or Inactive").
   Never published, it has no status yet: the confirm asks which one its published version starts with. It starts on
   Active where Active can be had, since publishing is how a policy goes to work. With no application it can only be
   published inactive, so there is nothing to pick and the sentence says so. Active goes through Before turning on
   afterwards, as every turn on does. */
export function FirstPublishAsk({
  open,
  onClose,
  onConfirm,
  value,
  onChange,
  canBeActive,
  monitor,
  reach,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  value: FirstStatus
  onChange: (v: FirstStatus) => void
  /** Has an application (or is the system policy), so it can decide a sign-in. */
  canBeActive: boolean
  /** Monitoring is offered on this tenant (status-options.ts `monitorOffered`). */
  monitor: boolean
  /** Who an Active policy reaches (draft-model.ts `liveConfirmBody`). */
  reach: string
}) {
  const options: { value: FirstStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    ...(monitor ? [{ value: 'monitor' as const, label: 'Monitoring' }] : []),
    { value: 'inactive', label: 'Inactive' },
  ]
  return (
    <Confirm open={open} onClose={onClose} destructive={false} shape="hero" title="Publish this policy?" confirmLabel={SAVE_AND_PUBLISH} onConfirm={onConfirm}>
      {canBeActive ? (
        <div className="bdm-first">
          <span className="bdm-first__label u-label">Status</span>
          <Seg label="Status" value={value} onChange={onChange} options={options} />
          <p>{value === 'active' ? reach : value === 'monitor' ? 'Sign-ins are recorded, not decided.' : 'It decides no sign-ins until it is made active.'}</p>
        </div>
      ) : (
        'It has no application, so it is published inactive.'
      )}
    </Confirm>
  )
}

/** Fix: which copy the canvas shows. Live is what people sign in with now, and reads only. */
/* An inactive policy has nothing live: its stored rules decide no sign-in, so that side of the switch is "Saved". */
export function LiveDraftSwitch({ value, onChange, inUse = true }: { value: CanvasView; onChange: (v: CanvasView) => void; inUse?: boolean }) {
  return (
    <span className="bdm-view">
      <Seg
        label="Show"
        value={value}
        onChange={onChange}
        options={[
          { value: 'live', label: inUse ? 'Live' : 'Saved', icon: Eye, title: inUse ? 'What people sign in with now' : 'As last saved' },
          { value: 'draft', label: 'Draft', icon: PencilLine, title: 'Your copy' },
        ]}
      />
    </span>
  )
}
