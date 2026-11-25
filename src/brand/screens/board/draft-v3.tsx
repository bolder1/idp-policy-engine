import { ChevronDown, GitCompare, History, Radio, RotateCcw, Undo2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'

import { ChangeList, ChangeSection, type ChangeBlock } from '../../change-list'
import { FALLBACK_NAME, fallbackRule, type App, type Group, type Policy, type Rule, type User } from '../../data'
import { Face } from '../../faces'
import { Badge, Button, Confirm, IconButton, Modal, Toggle } from '../../kit'
import { CharCount } from '../../CharCount'
import type { RuleSet } from '../../policy-draft'
import { describeChanges } from '../changes'
import { liveConfirmBody, reachesSignIns } from './draft-model'
import {
  REVIEWER_NAME,
  REVIEW_DEMO,
  addedRuleIds,
  alignRules,
  appended,
  approveBlocker,
  asPolicy,
  canRollBack,
  changeItem,
  draftState,
  fallbackChanged,
  groupChanges,
  liveMoved,
  liveNumber,
  publishedTrack,
  rebaseDraft,
  reconcile,
  seedTrack,
  setApprovalNeeded,
  useVersionStore,
  versionAt,
  versionChip,
  whenLabel,
  writeTrack,
  type ChangeKind,
  type PolicyVersion,
  type Track,
} from './policy-versions'
import { RULE_GAPS, policyGaps } from './rule-gaps'
import { Seg } from './Section'
import { VersionCompare, type CompareSide } from './version-compare'
import './draft-v3.css'

/* -----------------------------------------------------------------------------
   THE DRAFT MODEL'S V3 ON SCREEN (draft-model.ts, policy-versions.ts).

   Fix, plus publishing as numbered versions. The builder keeps its own canvas,
   history and saves; this hook adds what V3 changes and hands the builder the
   pieces to slot in:
     chip      the History button on the name: "v3 · Live" / "v4 · Draft" /
               "In review" / "Rejected", pressed while Version history is open;
     primary   Publish (Request review with the review demo, `REVIEW_DEMO`);
     barSlot   in review, in place of Discard, Save draft and the primary;
     readOnly  the canvas is locked: history is open, or a draft is in review;
     shown     the version the canvas draws while it is picked in history;
     fresh     the rules that version brought in, which say New on their cards;
     panel     Version history, in the board's right-hand slot;
     nodes     the dialogs, and the banners above the bar;
     tag       "Viewing v2" over the canvas, with Back to draft.
   What the builder alone can do (store live, save the draft, edit the canvas)
   comes back through `calls`, set by the builder on every render.

   VERSION HISTORY (owner, 23 Nov 2026: "a better way to showcase the whole version history … the concept is good but
   can be better, rethink"). Not a slider over the canvas: a panel beside it, in the slot Read as text and Fixes use, so
   the canvas stays in view and IS the preview — pick a version on the timeline and the canvas draws it, read only,
   with the rules it brought in marked New. The picked row opens in place: who, when, the note, what it changed (one
   chip per kind, as Review changes says it), against the version before it or against live, and Restore as draft or
   Roll back. The draft sits at the top while there is one.
   -------------------------------------------------------------------------- */

export interface V3Calls {
  /** Store the canvas live, as the builder's own publish does; the version is appended from `published`. */
  publish: () => void
  /** Save the canvas as the draft (the builder's Save draft). False when it refused. */
  saveDraft: () => boolean
  /** An edit to the canvas: on the undo stack, said in a toast with Undo, not saved. */
  edit: (next: RuleSet, toast: string) => void
  /** Write these rules live and leave the saved draft alone (Roll back). */
  rollLive: (v: RuleSet) => void
}

type Choice = number | 'draft'
type Against = 'previous' | 'live'

const KIND_WORD: Record<ChangeKind, string> = { added: 'Added', changed: 'Changed', removed: 'Removed' }

/** The slot above the builder's bar (BoardShell's `#bshell-top`), as RolledBackNote uses. */
function useTopSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById('bshell-top')), [])
  return slot
}

export function useDraftV3(o: {
  on: boolean
  saved: Policy | undefined
  /** The canvas as the builder holds it. */
  draft: Policy
  /** The canvas differs from live (unsaved, or a saved draft). */
  differs: boolean
  /** Edits since the last save. */
  unsaved: boolean
  /** The signed-in admin's name. */
  you: string
  apps: readonly App[]
  groups: Group[]
  users: User[]
  calls: MutableRefObject<V3Calls | null>
  showToast: (text: string) => void
}) {
  const { on, saved, draft, you } = o
  const vs = useVersionStore()
  const approval = REVIEW_DEMO && vs.approval
  const actorName = REVIEW_DEMO && vs.actor === 'reviewer' ? REVIEWER_NAME : you
  const uid = useId()

  const track: Track = useMemo(
    () => (saved ? reconcile(vs.tracks[saved.id] ?? seedTrack(saved, you), saved, you) : { versions: [] }),
    [vs.tracks, saved, you],
  )
  const write = (change: (t: Track) => Track) => {
    if (!saved) return
    writeTrack(saved.id, (stored) => change(reconcile(stored ?? seedTrack(saved, you), saved, you)))
  }

  const liveN = liveNumber(track)
  const live = track.versions.at(-1)
  const state = draftState(track, o.differs)
  const inReview = on && track.review?.kind === 'in-review'
  const inUse = reachesSignIns(saved)
  const chip = versionChip(track, state, inUse)
  const hasDraftRow = state !== 'live'

  const [histOpen, setHistOpen] = useState(false)
  const [pick, setPick] = useState<Choice>('draft')
  const [against, setAgainst] = useState<Against>('previous')
  /* Compare, side by side (version-compare.tsx): the two sides, each a version number or 'draft'. */
  const [cmp, setCmp] = useState<{ a: string; b: string } | null>(null)
  const [changesOnly, setChangesOnly] = useState(false)
  const [rollN, setRollN] = useState<number | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [note, setNote] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  /* Who and why for the version `published` appends: set just before the builder's publish runs. */
  const meta = useRef<{ by: string; note?: string; approvedBy?: string } | null>(null)

  /* Another policy, or another draft model: nothing of this one stays open. */
  const policyId = saved?.id
  useEffect(() => {
    setHistOpen(false)
    setCmp(null)
    setRollN(null)
    setAskOpen(false)
    setRejectOpen(false)
  }, [policyId, on])

  /* The draft row goes once the draft is published or thrown away: the pick moves to live. */
  useEffect(() => {
    if (pick === 'draft' && !hasDraftRow && liveN > 0) setPick(liveN)
  }, [pick, hasDraftRow, liveN])

  /* The draft remembers the live version it started from, from its first edit until it is published or thrown away. */
  const hasCopy = o.unsaved || !!saved?.pendingDraft
  useEffect(() => {
    if (!on || !saved) return
    if (hasCopy && track.draftBase === undefined && liveN > 0) write((t) => ({ ...t, draftBase: liveN }))
    else if (!hasCopy && track.draftBase !== undefined && !track.review) write(({ draftBase: _b, ...t }) => t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, policyId, hasCopy, track.draftBase, track.review, liveN])

  const policyOf = (v: Pick<PolicyVersion, 'rules' | 'fallback' | 'appIds'>) => (saved ? asPolicy(saved, v) : draft)
  const lines = (from: Policy, to: Policy) => describeChanges(from, to, o.groups, o.users, o.apps)
  const draftAsPolicy: Policy = { ...draft, pendingDraft: undefined }
  const now = () => whenLabel(new Date())
  const appNames = saved ? saved.appIds.map((id) => o.apps.find((a) => a.id === id)?.name ?? id) : []
  const reachBody = (to: Policy) =>
    inUse ? liveConfirmBody(appNames, !to.isSystem && to.appIds.length === 0) : 'The policy is inactive, so no sign-in uses it yet.'

  /* --- Publish and review ------------------------------------------------------ */

  const ask = () => {
    setNote('')
    setAskOpen(true)
  }
  const confirmAsk = () => {
    setAskOpen(false)
    const said = note.trim() || undefined
    if (approval) {
      if (!o.calls.current?.saveDraft()) return
      write((t) => ({ ...t, review: { kind: 'in-review', by: actorName, at: now(), ...(said ? { note: said } : null) } }))
      o.showToast(`v${liveN + 1} sent for review`)
      return
    }
    meta.current = { by: actorName, ...(said ? { note: said } : null) }
    o.calls.current?.publish()
  }
  /** Called by the builder's publish, after the policy is stored live: the new version, and the toast's words. */
  const published = (stored: Policy): string => {
    const m = meta.current ?? { by: actorName }
    meta.current = null
    const n = liveN + 1
    write((t) =>
      publishedTrack(t, {
        rules: stored.rules,
        fallback: stored.fallback,
        appIds: stored.appIds,
        by: m.by,
        at: now(),
        ...(m.note ? { note: m.note } : null),
        ...(m.approvedBy ? { approvedBy: m.approvedBy } : null),
      }),
    )
    if (histOpen) setPick(n)
    return m.approvedBy ? `v${n} published, approved by ${m.approvedBy}` : `v${n} published`
  }
  const approve = () => {
    const r = track.review
    if (r?.kind !== 'in-review' || approveBlocker(r, actorName)) return
    meta.current = { by: r.by, approvedBy: actorName, ...(r.note ? { note: r.note } : null) }
    o.calls.current?.publish()
  }
  const withdraw = () => {
    write(({ review: _r, ...t }) => t)
    o.showToast('Review withdrawn. The draft is open again.')
  }
  const reject = () => {
    const why = reason.trim()
    if (!why) return
    setRejectOpen(false)
    write((t) => ({ ...t, review: { kind: 'rejected', by: actorName, at: now(), reason: why } }))
    o.showToast(`v${liveN + 1} rejected`)
  }

  /* --- Version history ------------------------------------------------------------ */

  const openHistory = () => {
    setPick(hasDraftRow ? 'draft' : liveN)
    setAgainst('previous')
    setHistOpen(true)
  }
  const closeHistory = () => setHistOpen(false)
  /* Compare: any two of the versions and the draft, side by side over the board (version-compare.tsx). */
  const openCompare = (a: string, b: string) => {
    setChangesOnly(false)
    setCmp({ a, b })
  }
  const choose = (p: Choice) => {
    setPick(p)
    /* A version is read against the one before it; the draft, and the first version, against live. */
    setAgainst('previous')
  }
  const restore = (n: number) => {
    const v = versionAt(track, n)
    if (!v || inReview) return
    setHistOpen(false)
    o.calls.current?.edit({ rules: v.rules, fallback: v.fallback }, `v${n} restored as your draft. Live is unchanged.`)
    write((t) => ({ ...t, draftBase: liveN }))
  }
  /* A roll back writes live, so it is held to what every save to live is: no rule with an empty part (rule-gaps.ts).
     Refused at the button, before the confirm, and said in a toast with the way through: restore it and finish it. */
  const gapsIn = (n: number) => {
    const v = versionAt(track, n)
    return RULE_GAPS && !!v && policyGaps(v).length > 0
  }
  const askRollBack = (n: number) => {
    if (gapsIn(n)) return o.showToast(`v${n} has a rule with an empty part, so it can't go live. Restore it as your draft to finish it.`)
    setRollN(n)
  }
  const rollBack = (n: number) => {
    const v = versionAt(track, n)
    setRollN(null)
    if (!v || !saved || !canRollBack(track, n) || gapsIn(n)) return
    o.calls.current?.rollLive({ rules: v.rules, fallback: v.fallback })
    write((t) => appended(t, { rules: v.rules, fallback: v.fallback, appIds: saved.appIds, by: actorName, at: now(), note: `Rolled back to v${n}`, copies: n }))
    /* The new version is live now: the timeline lands on it. */
    setPick(liveN + 1)
    o.showToast(`Rolled back. v${liveN + 1} copies v${n} and is live.`)
  }
  const base = track.draftBase !== undefined ? versionAt(track, track.draftBase) : undefined
  const moved = on && liveMoved(track) && hasCopy
  const updateDraft = () => {
    if (!base || !live) return
    const merged = rebaseDraft(base, live, { rules: draft.rules, fallback: draft.fallback })
    o.calls.current?.edit(merged, `Draft updated to v${liveN}. Not saved yet.`)
    write((t) => ({ ...t, draftBase: liveN }))
  }

  const viewed = on && histOpen && typeof pick === 'number' ? versionAt(track, pick) : undefined
  const readOnly = on && (inReview || histOpen || !!cmp)
  const shown = viewed ? { rules: viewed.rules, fallback: viewed.fallback, appIds: viewed.appIds } : null
  /* New on the cards a version brought in; the draft's against live. */
  const fresh: readonly string[] | null = !on || !histOpen ? null : viewed ? addedRuleIds(versionAt(track, viewed.n - 1), viewed) : live ? addedRuleIds(live, draft) : null

  /* --- On screen ------------------------------------------------------------------ */

  const slot = useTopSlot()
  const blocker = approveBlocker(track.review, actorName)
  const review = track.review
  const nextN = liveN + 1

  /* Beside the name, only what Fix says there: Unsaved changes. The version and its state are on the bar's button
     instead (owner, 24 Nov 2026: "remove the v4 from here … too many pills together … move it [into] the button"). */
  const chipNode = (
    <span className="bv3-chipwrap">
      {o.unsaved && !inReview && (
        <Badge tone="notice" className="bx-change">
          Unsaved changes
        </Badge>
      )}
    </span>
  )

  const banners = (
    <>
      {inReview && review?.kind === 'in-review' && (
        <div className="bv3-banner is-review" role="status">
          <p className="bv3-banner__words">
            <b>{blocker ? 'In review.' : 'Review requested.'}</b> {review.by === actorName ? 'Sent' : review.by} · {review.at}
            {review.note && <span className="bv3-banner__note"> “{review.note}”</span>}
          </p>
          <Button variant="ghost" size="sm" icon={GitCompare} onClick={() => openCompare(String(liveN), 'draft')}>
            Compare
          </Button>
          {!blocker && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setReason('')
                setRejectOpen(true)
              }}
            >
              Reject
            </Button>
          )}
          <Button variant="brand" size="sm" blocked={blocker ?? undefined} title={blocker ?? undefined} onClick={approve}>
            Approve and publish
          </Button>
        </div>
      )}
      {on && review?.kind === 'rejected' && (
        <div className="bv3-banner is-rejected" role="status">
          <p className="bv3-banner__words">
            <b>Rejected by {review.by === actorName ? 'you' : review.by}.</b> “{review.reason}” · {review.at}
          </p>
        </div>
      )}
      {moved && base && live && (
        <div className="bv3-banner is-moved" role="status">
          <p className="bv3-banner__words">
            <b>Live changed since your draft started.</b> v{base.n} → v{live.n} by {live.by} · {live.at}
          </p>
          <Button variant="ghost" size="sm" icon={GitCompare} onClick={() => openCompare(String(base.n), String(live.n))}>
            Compare
          </Button>
          {!inReview && (
            <Button variant="secondary" size="sm" onClick={updateDraft}>
              Update draft
            </Button>
          )}
        </div>
      )}
    </>
  )

  /* One entry on the timeline, as Figma writes one (owner, 24 Nov 2026: "think how smartly Figma is doing it"): the
     time in bold with the version's number at its end, the person under it with their face, and the note. Picked, it
     is the selection, a blue ground over the whole entry, and it opens inside that ground on what it changed. */
  const entry = (o_: { key: string; p: Choice; title: string; tag?: string; who?: string; note?: string; body: () => ReactNode }) => {
    const on_ = pick === o_.p
    const bodyId = `${uid}-${o_.key}`
    return (
      <li key={o_.key} className={`bv3h__entry${on_ ? ' is-on' : ''}`}>
        <button type="button" className="bv3h__pick" aria-expanded={on_} aria-controls={on_ ? bodyId : undefined} onClick={() => choose(o_.p)}>
          <span className="bv3h__line">
            <span className="bv3h__when">{o_.title}</span>
            {o_.tag && <span className="bv3h__tag">{o_.tag}</span>}
          </span>
          {o_.who && (
            <span className="bv3h__by">
              <Face kind="user" name={o_.who} size="sm" decorative />
              {o_.who}
            </span>
          )}
          {o_.note && <span className="bv3h__note">{o_.note}</span>}
        </button>
        {on_ && (
          <div id={bodyId} className="bv3h__detail">
            {o_.body()}
          </div>
        )}
      </li>
    )
  }
  /* "You" on a saved draft is the signed-in admin, by name, as every other entry says who. */
  const nameOf = (who: string) => (who === 'You' ? you : who)
  const [earlierOpen, setEarlierOpen] = useState(true)

  const versionBody = (v: PolicyVersion) => {
    const prev = versionAt(track, v.n - 1)
    const canLive = v.n !== liveN && !!live
    const mode: Against = against === 'live' && canLive ? 'live' : prev ? 'previous' : 'live'
    const list = mode === 'previous' && prev ? lines(policyOf(prev), policyOf(v)) : live ? lines(policyOf(live), policyOf(v)) : []
    const options: { value: Against; label: string }[] = [
      ...(prev ? [{ value: 'previous' as const, label: `From v${prev.n}` }] : []),
      ...(canLive ? [{ value: 'live' as const, label: 'Against live' }] : []),
    ]
    const meta = [v.copies ? `Copies v${v.copies}` : null, v.approvedBy ? `Approved by ${v.approvedBy}` : null].filter(Boolean).join(' · ')
    return (
      <>
        {meta && <p className="bv3h__meta">{meta}</p>}
        {changeView(
          mode === 'previous' ? 'Changes' : 'Against live',
          list,
          v.n === 1 && mode === 'previous' ? 'First version' : mode === 'live' ? 'Same as live' : 'No rule changes',
          options.length > 1 ? <Seg label="Compare" value={mode} onChange={(x) => setAgainst(x as Against)} options={options} /> : undefined,
        )}
        {actsOf(v.n)}
      </>
    )
  }

  const draftBody = () => (
    <>
      {review?.kind === 'in-review' && review.note && <p className="bv3h__note">{review.note}</p>}
      {review?.kind === 'rejected' && <p className="bv3h__meta">Rejected by {review.by}: “{review.reason}”</p>}
      {live ? changeView('Against live', lines(policyOf(live), draftAsPolicy), 'Same as live') : <p className="bv3h__meta">Not published yet</p>}
      {actsOf('draft')}
    </>
  )

  const newestFirst = [...track.versions].reverse()
  const earlier = newestFirst.slice(1)

  /* An entry's own actions, inside it (owner, 24 Nov 2026: "manage this button inside a card, so it actually looks
     like it is a part of the card … whatever is a global change … outside"). Compare sets it beside the version it is
     most often read against; an earlier version can also be restored as the draft, and the one just before live
     rolled back to. */
  const actsOf = (p: Choice): ReactNode => {
    const compareTo: { a: string; b: string; label: string } | null =
      p === 'draft'
        ? liveN > 0
          ? { a: String(liveN), b: 'draft', label: 'Compare with live' }
          : null
        : p === liveN
          ? liveN > 1
            ? { a: String(liveN - 1), b: String(liveN), label: `Compare with v${liveN - 1}` }
            : null
          : { a: String(p), b: String(liveN), label: 'Compare with live' }
    const older = typeof p === 'number' && p !== liveN
    if (!compareTo && !older) return null
    return (
      <div className="bv3h__acts">
        {compareTo && (
          <Button variant="secondary" size="sm" icon={GitCompare} onClick={() => openCompare(compareTo.a, compareTo.b)}>
            {compareTo.label}
          </Button>
        )}
        {older && (
          <Button variant="secondary" size="sm" icon={RotateCcw} disabled={inReview} title={inReview ? 'The draft is in review' : undefined} onClick={() => restore(p)}>
            Restore as draft
          </Button>
        )}
        {older && canRollBack(track, p) && (
          <Button variant="secondary" size="sm" icon={Undo2} onClick={() => askRollBack(p)}>
            Roll back
          </Button>
        )}
      </div>
    )
  }

  /* What the header's Compare opens: the draft against live while there is a draft, else live against the one before. */
  const compareAll: { a: string; b: string } | null = hasDraftRow && liveN > 0 ? { a: String(liveN), b: 'draft' } : liveN > 1 ? { a: String(liveN - 1), b: String(liveN) } : null
  const liveOn = pick === liveN && liveN > 0
  const liveApps = appNames.length === 0 ? null : appNames.length === 1 ? appNames[0] : `${appNames[0]} and ${appNames.length - 1} more`

  /* VERSION HISTORY, AS FIGMA KEEPS IT (owner, 24 Nov 2026: "Think how smartly Figma is actually doing it … the live
     part is always there … a current or live version at the top always, in a very interactive way that is live, and
     then all the draft part together … the earlier version in a different way, the draft part in a different way").

     Three parts, each drawn as what it is:
       Live      pinned under the panel's title, outside the scroll, so what people sign in with never leaves view:
                 where it is active, who published it and when. Pressed, the canvas shows it.
       Draft     the copy being worked on, in its own tinted block: unsaved, saved, sent for review or rejected.
       Earlier   a timeline on one thin rail, folded under its heading as Figma folds its autosaves: each entry the
                 time in bold with its version number, the person with their face, and the note.
     A picked entry is the selection, a blue ground, and opens inside it on what it changed and what can be done to
     it; the canvas beside the panel draws it. */
  const panel =
    on && histOpen ? (
      <aside className="bb__insp brat bv3h" aria-labelledby={`${uid}-title`}>
        <div className="bb__inspbar brat__bar">
          <h2 id={`${uid}-title`} className="brat__title">
            Version history
          </h2>
          <span className="brat__barend">
            {compareAll && (
              <Button variant="ghost" size="sm" icon={GitCompare} onClick={() => openCompare(compareAll.a, compareAll.b)}>
                Compare
              </Button>
            )}
            <IconButton icon={X} size="sm" tone="ghost" label="Close Version history" onClick={closeHistory} />
          </span>
        </div>

        {live && (
          <section className={`bv3h__live${liveOn ? ' is-on' : ''}`} aria-label={inUse ? 'Live' : 'Published'}>
            <button type="button" className="bv3h__livehead" aria-expanded={liveOn} onClick={() => choose(liveN)}>
              <span className={`bv3h__livemark${inUse ? ' is-live' : ''}`} aria-hidden>
                <Radio size={16} strokeWidth={2} />
              </span>
              <span className="bv3h__livetext">
                <span className="bv3h__line">
                  <span className="bv3h__when">{inUse ? 'Live' : 'Published'}</span>
                  <span className="bv3h__tag">v{liveN}</span>
                </span>
                {inUse && liveApps && <span className="bv3h__note">Active on {liveApps}</span>}
                <span className="bv3h__by">
                  <Face kind="user" name={live.by} size="sm" decorative />
                  {live.by} · {live.at}
                </span>
              </span>
            </button>
            {liveOn && <div className="bv3h__detail">{versionBody(live)}</div>}
          </section>
        )}

        <div className="bb__inspbody brat__body bv3h__body">
          <section className="bv3h__part is-draft" aria-labelledby={`${uid}-draft`}>
            <h3 id={`${uid}-draft`} className="bv3h__partname">
              Draft
            </h3>
            {hasDraftRow ? (
              <ol className="bv3h__entries">
                {entry({
                  key: 'draft',
                  p: 'draft',
                  title: review?.kind === 'in-review' ? 'Sent for review' : review?.kind === 'rejected' ? 'Rejected' : 'Your changes',
                  tag: `v${nextN}`,
                  who:
                    review?.kind === 'in-review'
                      ? review.by
                      : o.unsaved
                        ? you
                        : saved?.pendingDraft
                          ? nameOf(saved.pendingDraft.savedBy)
                          : undefined,
                  note:
                    review?.kind === 'in-review'
                      ? review.note
                      : o.unsaved
                        ? 'Not saved yet'
                        : saved?.pendingDraft
                          ? `Saved ${saved.pendingDraft.savedAt}`
                          : 'Not published yet',
                  body: draftBody,
                })}
              </ol>
            ) : (
              <p className="bv3h__empty">Same as live</p>
            )}
          </section>

          {earlier.length > 0 && (
            <section className="bv3h__part is-earlier" aria-labelledby={`${uid}-earlier`}>
              <h3 id={`${uid}-earlier`} className="bv3h__partname">
                <button type="button" className="bv3h__fold" aria-expanded={earlierOpen} onClick={() => setEarlierOpen((x) => !x)}>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden className={earlierOpen ? '' : 'is-shut'} />
                  Earlier versions
                </button>
              </h3>
              {earlierOpen && (
                <ol className="bv3h__entries bv3h__rail">
                  {earlier.map((v) => entry({ key: `v${v.n}`, p: v.n, title: v.at, tag: `v${v.n}`, who: v.by, note: v.note, body: () => versionBody(v) }))}
                </ol>
              )}
            </section>
          )}
        </div>
        {REVIEW_DEMO && (
          <div className="bb__inspfoot bv3h__setting">
            <label className="bv3-approval">
              <Toggle size="sm" checked={vs.approval} onChange={setApprovalNeeded} label="Publishing needs approval" />
              <span>Publishing needs approval</span>
            </label>
          </div>
        )}
      </aside>
    ) : null

  const rollV = rollN !== null ? versionAt(track, rollN) : undefined
  const dialogs = (
    <>
      <Confirm
        open={askOpen}
        onClose={() => setAskOpen(false)}
        destructive={false}
        shape="hero"
        title={approval ? `Request review of v${nextN}?` : `Publish v${nextN}?`}
        confirmLabel={approval ? 'Request review' : 'Publish'}
        onConfirm={confirmAsk}
      >
        <p>{approval ? 'Another admin approves it before it goes live.' : reachBody(draft)}</p>
        <label className="bv3-field">
          <span className="u-label">Note</span>
          <textarea rows={2} maxLength={200} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          {/* The count under the note (owner, 25 Nov 2026: "Add character limit to all of the needed places"). */}
          <CharCount value={note} max={200} />
        </label>
      </Confirm>
      <Confirm
        open={!!rollV}
        onClose={() => setRollN(null)}
        destructive={false}
        shape="hero"
        title={`Roll back to v${rollN ?? ''}?`}
        confirmLabel="Roll back"
        confirmIcon={Undo2}
        onConfirm={() => rollN !== null && rollBack(rollN)}
      >
        v{nextN} copies v{rollN} and goes live. {reachBody(saved ?? draft)} Your draft stays as it is.
      </Confirm>
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reject v${nextN}?`}
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" blocked={reason.trim() ? undefined : 'Give a reason'} title={reason.trim() ? undefined : 'Give a reason'} onClick={reject}>
              Reject
            </Button>
          </>
        }
      >
        <label className="bv3-field">
          <span className="u-label">Reason</span>
          <textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          {/* The count under the reason (owner, 25 Nov 2026: "Add character limit to all of the needed places"). */}
          <CharCount value={reason} max={300} />
        </label>
      </Modal>
    </>
  )

  /* --- Compare, side by side ------------------------------------------------------- */

  type Side = CompareSide & { rules: Rule[]; appIds: string[] }
  const sideOf = (key: string): Side | null => {
    if (key === 'draft') {
      return {
        key,
        title: `v${nextN}`,
        pill: { word: chip.word, tone: chip.tone },
        who: o.unsaved ? 'Not saved yet' : saved?.pendingDraft ? `Saved by ${saved.pendingDraft.savedBy} · ${saved.pendingDraft.savedAt}` : 'Your draft',
        rules: draft.rules,
        fallback: draft.fallback ?? fallbackRule(),
        appIds: draft.appIds,
      }
    }
    const v = versionAt(track, Number(key))
    if (!v) return null
    return {
      key,
      title: `v${v.n}`,
      pill: v.n === liveN ? { word: inUse ? 'Live' : 'Published', tone: 'neutral' } : undefined,
      who: `${v.by} · ${v.at}`,
      rules: v.rules,
      fallback: v.fallback ?? fallbackRule(),
      appIds: v.appIds,
    }
  }
  const sideA = on && cmp ? sideOf(cmp.a) : null
  const sideB = on && cmp ? sideOf(cmp.b) : null
  const compareOptions = [
    ...(hasDraftRow ? [{ value: 'draft', label: `v${nextN} · ${chip.word}` }] : []),
    ...newestFirst.map((v) => ({ value: String(v.n), label: v.n === liveN ? `v${v.n} · ${inUse ? 'Live' : 'Published'}` : `v${v.n}` })),
  ]
  let compareView: ReactNode = null
  if (sideA && sideB) {
    const all = lines(policyOf(sideA), policyOf(sideB))
    const rows = alignRules(sideA.rules, sideB.rules)
    const ruleLines: Record<string, string[]> = {}
    const policyLines: string[] = []
    const fallbackLines: string[] = []
    for (const l of all) {
      const c = changeItem(l)
      if (!c.name) {
        policyLines.push(l)
        continue
      }
      if (c.name === FALLBACK_NAME) {
        fallbackLines.push(c.what)
        continue
      }
      const row = rows.find((r) => r.kind === 'changed' && (r.b?.rule.name === c.name || r.a?.rule.name === c.name))
      if (row) (ruleLines[row.id] ??= []).push(c.what)
    }
    /* The right-hand side's own action: an older version can be brought back as the draft from here. */
    const restorable = cmp && cmp.b !== 'draft' && Number(cmp.b) !== liveN ? Number(cmp.b) : null
    compareView = (
      <VersionCompare
        key="compare"
        options={compareOptions}
        a={sideA}
        b={sideB}
        onA={(k) => setCmp((c) => (c ? { ...c, a: k } : c))}
        onB={(k) => setCmp((c) => (c ? { ...c, b: k } : c))}
        onSwap={() => setCmp((c) => (c ? { a: c.b, b: c.a } : c))}
        rows={rows}
        ruleLines={ruleLines}
        policyLines={policyLines}
        fallbackLines={fallbackChanged(sideA, sideB) ? (fallbackLines.length > 0 ? fallbackLines : ['Changed']) : []}
        changesOnly={changesOnly}
        onChangesOnly={setChangesOnly}
        action={
          restorable !== null ? (
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              disabled={inReview}
              onClick={() => {
                setCmp(null)
                restore(restorable)
              }}
            >
              Restore v{restorable} as draft
            </Button>
          ) : undefined
        }
        onClose={() => setCmp(null)}
      />
    )
  }

  const tag = viewed ? (
    <div className="bdm-live bv3-viewtag" role="status">
      <span>
        Viewing <b>v{viewed.n}</b> · {viewed.at}
      </span>
      <Button variant="secondary" size="sm" onClick={closeHistory}>
        Back to draft
      </Button>
    </div>
  ) : null

  /* Version history's door: a kit button in the bar's actions, pressed while the panel is open, as Check access is. It
     is named for where the policy stands — "v3 · Live", "v4 · Draft" — so the version is said once on the bar, on the
     thing that opens its history (owner, 24 Nov 2026: "move it [into] the button … or call the button something else"). */
  const historyButton = on ? (
    <Button variant="secondary" size="sm" icon={History} pressed={histOpen} title="Version history" onClick={histOpen ? closeHistory : openHistory}>
      {chip.label}
    </Button>
  ) : null

  return {
    on,
    chip: chipNode,
    historyButton,
    primaryLabel: approval ? 'Request review' : 'Publish',
    /* In review the bar's Discard, Save draft and primary give way: the author withdraws, the reviewer works in the banner. */
    barSlot: inReview ? (
      blocker ? (
        <Button variant="secondary" size="sm" onClick={withdraw}>
          Withdraw
        </Button>
      ) : (
        <></>
      )
    ) : undefined,
    inReview,
    historyOpen: on && histOpen,
    readOnly,
    shown,
    fresh,
    viewing: viewed ? viewed.n : null,
    ask,
    published,
    panel,
    /* Over the whole board while two versions are set side by side. */
    compareView: <AnimatePresence>{compareView}</AnimatePresence>,
    tag: on ? tag : null,
    nodes: on ? (
      <>
        {slot && createPortal(banners, slot)}
        {dialogs}
      </>
    ) : null,
  }
}

/* What a version changed, in the console's own change list (change-list.tsx, the shape Review changes settled on 18
   Sep 2026): one section, one chip per kind said once, and under it the rule's name paired with what happened to it.
   A plain function, not a component: this file exports a hook. */
function changeView(title: string, lines: string[], empty: string, action?: ReactNode): ReactNode {
  const blocks: ChangeBlock[] = groupChanges(lines).map((g) => ({
    tone: g.kind,
    label: KIND_WORD[g.kind],
    items: g.lines.map((l, i) => {
      const c = changeItem(l)
      return { id: `${g.kind}-${i}`, name: c.name, after: c.what }
    }),
  }))
  return (
    <ChangeList layout="list">
      <ChangeSection title={title} layout="list" blocks={blocks} empty={empty} action={action} limit={12} />
    </ChangeList>
  )
}
