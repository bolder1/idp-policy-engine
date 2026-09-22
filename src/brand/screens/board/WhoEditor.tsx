import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Eye, Pencil, Plus, UserRound, Users, X } from 'lucide-react'

import { Badge, Button, Callout, IconButton, Modal, SearchBox } from '../../kit'
import { NoMatches } from '../../empty'
import { Face, FaceStack, type FaceItem } from '../../faces'
import type { Audience, Rule, RuleWho } from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { outsideAudience } from '../../audience-ops'
import { normaliseWho, type WhoKind, type WhoList } from '../../rule-who'

/* -----------------------------------------------------------------------------
   WHO — the people a rule applies to.

   It edits `Rule.who` and nothing else. The If cards are not read and not
   written here, whatever shape they have: who is ANDed with the whole WHEN (see
   `rule-who.ts`), so a rule with two ways in still has exactly one who, and
   this section is always the place it is chosen.

   --- TWO ENTITIES, ONE DIALOG ---------------------------------------------------

   Groups and people are a row each (owner, 18 Sep 2026: "I want two separate
   entities, one for user-specific settings and another for group-specific
   settings; on click open the same popup, but one shows users and one shows
   groups"). Each row says what it holds and opens the same dialog scoped to its
   own kind, so the dialog needs no switcher inside it — the row you pressed has
   already answered which list you wanted.

   That replaces the single combobox that stood here, which listed groups and
   people together behind one "Add groups or people" placeholder. One field for
   two questions meant the answers came back as one undifferentiated line of
   badges, and the commonest edit — "which groups is this about" — started by
   filtering a list of a thousand names down to the twenty-one that were not.

   The two are still separate in the MODEL for the reason they are separate
   here: groups follow whoever is in them on the day, and a named person is a
   person somebody has to remember to remove.

   --- NO EXCEPTIONS ON THIS SURFACE ----------------------------------------------

   `Add exception`, and the second pair of rows it opened, are gone (owner,
   18 Sep 2026). A rule that names groups AND takes some of them back out again
   is a shape a handful of tenants want and every reader has to hold in their
   head, and it doubled this section in a 400px panel to offer it. The trail
   builder still edits exceptions through the shared `WhoPicker`, and
   `RuleWho.exceptGroupIds` / `exceptUserIds` are untouched here — a rule that
   arrives holding one keeps it, and the card beside this panel reads it back
   ("Finance except Priya Sharma") through `whoSummary`. This pane simply mints
   no new ones.

   Empty means everyone the policy governs. That is said once, in the note, and
   only while nothing at all is chosen — a rule that names nobody is not
   unfinished, it inherits the policy's audience, and that is a fact about how
   evaluation works rather than a caption on a control. It is violet, not blue
   or amber: nothing is wrong, and the info blue on this panel is spent on the
   linter's findings, so a second blue box here would read as a finding.
   -------------------------------------------------------------------------- */

/** Which field of `RuleWho` a row edits. The except lists are not edited here. */
const FIELD: Record<WhoKind, WhoList> = { group: 'groupIds', user: 'userIds' }

const KIND_WORD: Record<WhoKind, { many: string; add: string; noun: string }> = {
  group: { many: 'Groups', add: 'Add groups', noun: 'groups' },
  user: { many: 'People', add: 'Add people', noun: 'people' },
}


export function WhoEditor({
  rule,
  audience,
  onPatch,
}: {
  rule: Rule
  /** The policy's own audience, for marking choices it does not govern. Never written here. */
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  /* Which list the dialog is open on, and which of its two views it opens in:
     View opens on the chosen names, Edit and Add on the whole list. */
  const [picking, setPicking] = useState<{ kind: WhoKind; view: DialogView } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const base: RuleWho = normaliseWho(rule.who) ?? { groupIds: [], userIds: [] }
  const ids = (kind: WhoKind): string[] => base[FIELD[kind]] ?? []
  /* Spread, so an exception a rule arrived with survives an edit here. */
  const write = (kind: WhoKind, next: string[]) => onPatch({ who: normaliseWho({ ...base, [FIELD[kind]]: next }) })

  const named = ids('group').length + ids('user').length
  const outside = outsideAudience(audience, ids('group'), ids('user'), store.users)

  /* A chip's remove button goes with the chip, and focus falls to the page.
     On the page, Delete deletes the selected RULE. This is the backstop that
     keeps focus in this section, where the board's rule keys stand down. */
  const keepFocus = () =>
    requestAnimationFrame(() => {
      const el = box.current
      const at = document.activeElement
      if (el && (at === null || at === document.body)) el.focus({ preventScroll: true })
    })

  const row = (kind: WhoKind) => (
    <WhoRow
      key={kind}
      kind={kind}
      faces={ids(kind).map((id) => ({ kind, key: id, name: resolve(kind, id) ?? `deleted · ${id}` }))}
      outside={kind === 'group' ? outside.groups.length : outside.users.length}
      onOpen={(view) => setPicking({ kind, view })}
    />
  )

  /* Nothing chosen: the If section's empty state, in the same shape (owner,
     22 Sep 2026: "change the empty state of the Who part similar to the If
     part"). A mark, what is
     missing, the one fact that matters — an empty who covers everyone the
     policy does — and the two ways in as the If's text adders.

     It replaces a violet note of two sentences over two half-width doors.

     Once either kind holds a name, BOTH are rows (owner, 22 Sep 2026: "if we
     add groups, don't show the people as a button — add an empty state with a
     one-liner, nothing added yet, with an add button inside"). The empty kind
     says so in the row, at the row's height, with its Add inside it, so the
     section reads as two fields of one form, one filled and one not. */
  const pair =
    named === 0 ? (
      <div className="bb__ifblank bb__whoblank">
        <span className="bb__ifblank__mark" aria-hidden>
          <Users size={18} strokeWidth={1.8} />
        </span>
        <h4>No groups or people yet</h4>
        {/* The kit's info callout (owner, 22 Sep 2026: "make it an info banner in
            blue"). It was a blue line, then a grey one; it is the one fact about
            an empty who worth a banner — nothing chosen means everyone. */}
        <Callout tone="info">By default this rule covers everyone in the policy. Add groups or people to narrow it.</Callout>
        <div className="bb__ifblank__acts">
          {(['group', 'user'] as WhoKind[]).map((kind) => (
            <button key={kind} type="button" className="bb__ifadd" onClick={() => setPicking({ kind, view: 'all' })}>
              <Plus size={11} strokeWidth={2.4} aria-hidden />
              {KIND_WORD[kind].add}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="bb__whorows">
        {(['group', 'user'] as WhoKind[]).map((kind) =>
          ids(kind).length > 0 ? (
            row(kind)
          ) : (
            <EmptyWhoRow key={kind} kind={kind} onAdd={() => setPicking({ kind, view: 'all' })} />
          ),
        )}
      </div>
    )

  return (
    <div className="bb__who" ref={box} tabIndex={-1} onClickCapture={keepFocus}>
      {pair}

      <WhoDialog
        kind={picking?.kind ?? 'group'}
        open={picking !== null}
        startView={picking?.view ?? 'all'}
        chosen={picking ? ids(picking.kind) : []}
        /* What the rule would cover if this list were emptied — the footer says
           "Apply to everyone" only when that is what saving would do. */
        otherCount={picking ? named - ids(picking.kind).length : 0}
        audience={audience}
        onClose={() => setPicking(null)}
        onSave={(next) => {
          if (picking) write(picking.kind, next)
          setPicking(null)
        }}
      />
    </div>
  )
}

/* --- One entity, one row -------------------------------------------------------

   A row says its kind and what it holds, and ends in its two actions: View
   opens the dialog on the chosen names, Edit on the whole list with them
   ticked (owner, 22 Sep 2026: "for the groups add a View and an Edit button
   both"). Icon only, each named on hover (owner, the same day: "add icon only
   button") — the eye and the pencil, and the empty row's +. It was one button
   that always opened on View, with adding and removing a step inside.

   Faces, each named on hover, rather than a line of names (owner, 21 Sep 2026:
   "no need to show the full name — add the avatar, and on hover the user can
   see the full name"). A stack holds five and a count, and View names every
   one. */
type DialogView = 'chosen' | 'all'

function WhoRow({
  kind,
  faces,
  outside,
  onOpen,
}: {
  kind: WhoKind
  faces: FaceItem[]
  /** How many of these the POLICY does not govern. Included lists only. */
  outside: number
  onOpen: (view: DialogView) => void
}) {
  const Ico = kind === 'group' ? Users : UserRound
  const word = KIND_WORD[kind]
  return (
    <div className="bb__whorow is-set">
      <span className="bb__whorow__ico" aria-hidden>
        <Ico size={14} strokeWidth={1.9} />
      </span>
      <span className="bb__whorow__label">{word.many}</span>
      <span className="bb__whorow__val">
        <FaceStack faces={faces} />
      </span>
      {outside > 0 && (
        <span title="This policy does not govern them, so this rule can never decide one of their logins.">
          <Badge tone="notice">{outside} outside</Badge>
        </span>
      )}
      <span className="bb__whorow__acts">
        <IconButton size="sm" tone="ghost" icon={Eye} label={`View ${word.noun}`} onClick={() => onOpen('chosen')} />
        <IconButton size="sm" tone="ghost" icon={Pencil} label={`Edit ${word.noun}`} onClick={() => onOpen('all')} />
      </span>
    </div>
  )
}

/* The other kind, while this one holds names: the same row, empty, with its
   Add inside it. */
function EmptyWhoRow({ kind, onAdd }: { kind: WhoKind; onAdd: () => void }) {
  const Ico = kind === 'group' ? Users : UserRound
  const word = KIND_WORD[kind]
  return (
    <div className="bb__whorow is-empty">
      <span className="bb__whorow__ico" aria-hidden>
        <Ico size={14} strokeWidth={1.9} />
      </span>
      <span className="bb__whorow__label">{word.many}</span>
      <span className="bb__whorow__val">None added yet</span>
      <span className="bb__whorow__acts">
        <IconButton size="sm" tone="ghost" icon={Plus} label={word.add} onClick={onAdd} />
      </span>
    </div>
  )
}

/* --- Viewing, then choosing, in one dialog ----------------------------------------

   One dialog, two views of one list (owner, 21 Sep 2026). A row that already
   holds names opens on THE CHOSEN ONLY: who this rule is about, each with a
   remove, and "Add groups" to go on to the whole list. The whole list is the
   second view, and "View N selected" brings you back. Picking one group from
   the top of twenty-one and one from the bottom used to leave the two ticks a
   scroll apart, with no way to see the answer in one place.

   A kind with nothing chosen opens straight on the whole list — there is
   nothing to view yet.

   It keeps its own draft and commits on Save, which is the one place in this
   panel where that is true: everything else writes as it is touched because
   the board has a save bar over the whole policy, and a dialog with a Cancel
   that did not cancel would be a lie.
   -------------------------------------------------------------------------- */
function WhoDialog({
  open,
  kind,
  startView,
  chosen,
  otherCount,
  audience,
  onClose,
  onSave,
}: {
  open: boolean
  kind: WhoKind
  /** Where it opens when there is something chosen: View's list, or Edit's. */
  startView: DialogView
  chosen: string[]
  /** How many are named in the OTHER included list, for what the footer offers. */
  otherCount: number
  audience: Audience
  onClose: () => void
  onSave: (ids: string[]) => void
}) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<string[]>(chosen)
  const [view, setView] = useState<DialogView>(chosen.length > 0 ? startView : 'all')

  /* The seed as a string: `chosen` is a fresh array on every render of the
     panel behind this dialog, so depending on it directly would discard the
     ticks somebody had just made every time anything in the policy moved. */
  const seed = chosen.join(',')
  useEffect(() => {
    if (!open) return
    setDraft(seed === '' ? [] : seed.split(','))
    setView(seed === '' ? 'all' : startView)
    setQ('')
  }, [open, seed, startView])

  const word = KIND_WORD[kind]
  const query = q.trim().toLowerCase()
  const every: WhoOption[] =
    kind === 'group'
      ? store.groups.map((g) => ({ id: g.id, name: g.name, meta: `${g.memberCount.toLocaleString()} members`, empty: g.memberCount === 0, hay: g.name }))
      : store.users.map((u) => ({ id: u.id, name: u.name, meta: u.email, empty: false, hay: `${u.name} ${u.email}` }))
  const matches = (r: WhoOption) => !query || r.hay.toLowerCase().includes(query)
  const rows = every.filter(matches)
  /* The chosen view lists the DRAFT, in the order it was chosen, and keeps a
     name the directory no longer has so it can still be removed. */
  const chosenRows = draft
    .map((id): WhoOption => every.find((r) => r.id === id) ?? { id, name: `deleted · ${id}`, meta: '', empty: false, hay: id })
    .filter(matches)

  const outside = outsideAudience(
    audience,
    kind === 'group' ? draft : [],
    kind === 'user' ? draft : [],
    store.users,
  )
  const isOutside = (id: string) => (kind === 'group' ? outside.groups : outside.users).includes(id)

  const toggle = (id: string) => setDraft((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))

  /* Scoped to the rows the list is SHOWING, and the label says so: with a
     search typed, "Select all 4 matching" leaves the rest alone. A toggle, not
     a one-way button — ticking twenty-one groups by accident is a plausible
     slip and the way back cannot be twenty-one clicks. */
  const allOn = rows.length > 0 && rows.every((r) => draft.includes(r.id))
  const setMany = () =>
    setDraft(allOn ? draft.filter((x) => !rows.some((r) => r.id === x)) : [...new Set([...draft, ...rows.map((r) => r.id)])])

  const everyone = draft.length === 0 && otherCount === 0
  const go = (v: 'chosen' | 'all') => {
    setView(v)
    setQ('')
  }

  /* The badges both views print. Both inform and neither blocks: a redundant
     or unusual choice is legal and is sometimes deliberate. */
  const marks = (r: WhoOption) => (
    <>
      {r.empty && (
        <span title="Nobody is in this group today, so a rule that names it decides nothing.">
          <Badge tone="system">Empty</Badge>
        </span>
      )}
      {isOutside(r.id) && (
        <span title="This policy does not govern them, so this rule can never decide one of their logins.">
          <Badge tone="notice">Outside</Badge>
        </span>
      )}
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={view === 'chosen' ? `${word.many} in this rule` : `Choose ${word.noun}`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => onSave(draft)}>
            {everyone ? 'Apply to everyone' : 'Save'}
          </Button>
        </>
      }
    >
      {view === 'chosen' ? (
        <div className="bb__whopick">
          {/* The count, and the way on to the whole list, on one line above the
              names they are about. */}
          <div className="bb__whobar">
            <span>{draft.length === 0 ? `No ${word.noun} chosen` : `${draft.length} selected`}</span>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => go('all')}>
              {word.add}
            </Button>
          </div>

          {/* A search only once the list is long enough to need one. */}
          {draft.length > 8 && (
            <SearchBox block value={q} onChange={setQ} placeholder={`Search the chosen ${word.noun}`} label={`Search the chosen ${word.noun}`} />
          )}

          {draft.length === 0 ? (
            <p className="bb__whopick__lede">Nothing chosen, so the rule covers everyone the policy governs.</p>
          ) : (
            <ul className="bb__wholist" aria-label={`${word.many} in this rule`}>
              {chosenRows.length === 0 && <NoMatches compact noun={word.noun} query={q} onClear={() => setQ('')} />}
              {chosenRows.map((r) => (
                <li key={r.id} className="bb__whoitem is-view">
                  <Face kind={kind} name={r.name} decorative />
                  <b>{r.name}</b>
                  <em>{r.meta}</em>
                  {marks(r)}
                  <IconButton icon={X} size="sm" tone="ghost" label={`Remove ${r.name}`} onClick={() => toggle(r.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="bb__whopick">
          {/* Back to the chosen list, once there is one to go back to. */}
          {draft.length > 0 ? (
            <button type="button" className="bb__whoback" onClick={() => go('chosen')}>
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              View {draft.length} selected
            </button>
          ) : (
            <p className="bb__whopick__lede">Leave this empty and the rule covers everyone the policy governs.</p>
          )}

          <SearchBox
            block
            value={q}
            onChange={setQ}
            placeholder={kind === 'group' ? 'Search groups' : `Search the ${store.users.length} people listed`}
            label={kind === 'group' ? 'Search groups' : 'Search people'}
          />

          {/* Select-all ABOVE the list rather than in it: a checkbox whose job is
              to tick the other checkboxes reads as one of them, and a row at the
              top of a scroller scrolls away. */}
          {rows.length > 0 && (
            <div className="bb__whoall">
              <button type="button" onClick={setMany}>
                {allOn ? `Clear ${rows.length}` : query ? `Select all ${rows.length} matching` : `Select all ${rows.length}`}
              </button>
            </div>
          )}

          <div className="bb__wholist" role="group" aria-label={word.many}>
            {rows.length === 0 && <NoMatches compact noun={word.noun} query={q} onClear={() => setQ('')} />}
            {rows.map((r) => {
              const on = draft.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={`bb__whoitem${on ? ' is-on' : ''}`}
                  onClick={() => toggle(r.id)}
                >
                  <span className="bx-tick" aria-hidden>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Face kind={kind} name={r.name} decorative />
                  <b>{r.name}</b>
                  <em>{r.meta}</em>
                  {marks(r)}
                </button>
              )
            })}
          </div>

          {/* Only where it is true: `unlistedUsers` is a count with no rows
              behind it, so the search can only ever reach the loaded rows. */}
          {kind === 'user' && store.unlistedUsers > 0 && (
            <p className="bb__whopick__note">
              {store.users.length} of {(store.users.length + store.unlistedUsers).toLocaleString()} listed. The rest can be
              reached by naming a group.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** A row either view can draw: a group or a person, with what to search it by. */
interface WhoOption {
  id: string
  name: string
  meta: string
  empty: boolean
  hay: string
}
