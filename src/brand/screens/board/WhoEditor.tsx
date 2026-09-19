import { useEffect, useRef, useState } from 'react'
import { Check, UserRound, Users } from 'lucide-react'

import { Badge, Button, Modal, SearchBox } from '../../kit'
import { NoMatches } from '../../empty'
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

const KIND_WORD: Record<WhoKind, { many: string; add: string }> = {
  group: { many: 'Groups', add: 'Add groups' },
  user: { many: 'People', add: 'Add people' },
}

/** How many names a row prints before the rest become a count. */
const NAMES = 2

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
  const [picking, setPicking] = useState<WhoKind | null>(null)
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
      names={ids(kind).map((id) => resolve(kind, id) ?? `deleted · ${id}`)}
      outside={kind === 'group' ? outside.groups.length : outside.users.length}
      onOpen={() => setPicking(kind)}
    />
  )

  /* ONE SLOT PER KIND, and each answers for itself.

     A kind with nothing in it is a full-width `Add groups` / `Add people`
     button: the note above already says an empty who covers everyone, so a
     field row reading "Groups · Any group · Add" would be that sentence
     re-typed once per kind. With nothing to report, the slot has no reading
     left in it — only a door — so it is drawn as one.

     The two do NOT change together (owner, 18 Sep 2026: "when I add one, don't
     change the next button — just adjust"). Naming a group turns the groups
     slot into a field and leaves the people slot exactly where it was, at the
     size it was. They shipped switching as a pair, on the argument that half
     a pair of buttons beside half a pair of fields is two shapes answering one
     question; in the hand it meant answering one question rewrote the control
     for the other, under the pointer.

     Stacked and full width, not side by side: a slot has to be able to become
     a field without the one beside it moving, and a field is full width. */
  const pair = (
    <div className="bb__whorows">
      {(['group', 'user'] as WhoKind[]).map((kind) =>
        ids(kind).length > 0 ? (
          row(kind)
        ) : (
          <Button
            key={kind}
            block
            variant="secondary"
            size="sm"
            icon={kind === 'group' ? Users : UserRound}
            onClick={() => setPicking(kind)}
          >
            {KIND_WORD[kind].add}
          </Button>
        ),
      )}
    </div>
  )

  return (
    <div className="bb__who" ref={box} tabIndex={-1} onClickCapture={keepFocus}>
      {named === 0 && (
        <div className="bb__whonote">
          <Users size={15} strokeWidth={1.9} aria-hidden />
          <p>
            <b>This rule covers everyone the policy governs.</b> Leave it that way, or narrow it to particular groups
            and people so the rule only matches some of them.
          </p>
        </div>
      )}

      {pair}

      <WhoDialog
        kind={picking ?? 'group'}
        open={picking !== null}
        chosen={picking ? ids(picking) : []}
        /* What the rule would cover if this list were emptied — the footer says
           "Apply to everyone" only when that is what saving would do. */
        otherCount={picking ? named - ids(picking).length : 0}
        audience={audience}
        onClose={() => setPicking(null)}
        onSave={(next) => {
          if (picking) write(picking, next)
          setPicking(null)
        }}
      />
    </div>
  )
}

/* --- One entity, one row -------------------------------------------------------

   A row says its kind, what it holds, and opens the list. Names rather than
   faces: at this width two names and a count read faster than four initials,
   and a face only helps for somebody you already know by sight — which is true
   of a colleague and not of "Engineering". */
function WhoRow({
  kind,
  names,
  outside,
  onOpen,
}: {
  kind: WhoKind
  names: string[]
  /** How many of these the POLICY does not govern. Included lists only. */
  outside: number
  onOpen: () => void
}) {
  const Ico = kind === 'group' ? Users : UserRound
  const word = KIND_WORD[kind]
  /* A row is only drawn for a kind that HAS something; an empty kind is a
     button. So there is no empty case to word. */
  const summary =
    names.length <= NAMES ? names.join(', ') : `${names.slice(0, NAMES).join(', ')} and ${names.length - NAMES} more`
  return (
    <button type="button" className="bb__whorow is-set" onClick={onOpen} title={names.join(', ')}>
      <span className="bb__whorow__ico" aria-hidden>
        <Ico size={14} strokeWidth={1.9} />
      </span>
      <span className="bb__whorow__label">{word.many}</span>
      <span className="bb__whorow__val">{summary}</span>
      {outside > 0 && (
        <span title="This policy does not govern them, so this rule can never decide one of their sign-ins.">
          <Badge tone="notice">{outside} outside</Badge>
        </span>
      )}
      <span className="bb__whorow__go">Edit</span>
    </button>
  )
}

/* --- Choosing, in a dialog -----------------------------------------------------

   One dialog, one list, and which list it shows is the row that opened it. It
   keeps its own draft and commits on Save, which is the one place in this panel
   where that is true: everything else writes as it is touched because the board
   has a save bar over the whole policy, and a dialog with a Cancel that did not
   cancel would be a lie.
   -------------------------------------------------------------------------- */
function WhoDialog({
  open,
  kind,
  chosen,
  otherCount,
  audience,
  onClose,
  onSave,
}: {
  open: boolean
  kind: WhoKind
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

  /* The seed as a string: `chosen` is a fresh array on every render of the
     panel behind this dialog, so depending on it directly would discard the
     ticks somebody had just made every time anything in the policy moved. */
  const seed = chosen.join(',')
  useEffect(() => {
    if (!open) return
    setDraft(seed === '' ? [] : seed.split(','))
    setQ('')
  }, [open, seed])

  const word = KIND_WORD[kind]
  const query = q.trim().toLowerCase()
  const rows =
    kind === 'group'
      ? store.groups
          .filter((g) => !query || g.name.toLowerCase().includes(query))
          .map((g) => ({ id: g.id, name: g.name, meta: `${g.memberCount.toLocaleString()} members`, empty: g.memberCount === 0 }))
      : store.users
          .filter((u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
          .map((u) => ({ id: u.id, name: u.name, meta: u.email, empty: false }))

  const outside = outsideAudience(
    audience,
    kind === 'group' ? draft : [],
    kind === 'user' ? draft : [],
    store.users,
  )
  const isOutside = (id: string) => (kind === 'group' ? outside.groups : outside.users).includes(id)

  const toggle = (id: string) => setDraft(draft.includes(id) ? draft.filter((x) => x !== id) : [...draft, id])

  /* Scoped to the rows the list is SHOWING, and the label says so: with a
     search typed, "Select all 4 matching" leaves the rest alone. A toggle, not
     a one-way button — ticking twenty-one groups by accident is a plausible
     slip and the way back cannot be twenty-one clicks. */
  const allOn = rows.length > 0 && rows.every((r) => draft.includes(r.id))
  const setMany = () =>
    setDraft(allOn ? draft.filter((x) => !rows.some((r) => r.id === x)) : [...new Set([...draft, ...rows.map((r) => r.id)])])

  const everyone = draft.length === 0 && otherCount === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Who is this rule about?"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => onSave(draft)}>
            {everyone ? 'Apply to everyone' : draft.length === 0 ? 'Save' : `Save ${draft.length} selected`}
          </Button>
        </>
      }
    >
      <div className="bb__whopick">
        <p className="bb__whopick__lede">Leave this empty and the rule covers everyone the policy governs.</p>

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
            <span>{draft.length} selected</span>
          </div>
        )}

        <div className="bb__wholist" role="group" aria-label={word.many}>
          {rows.length === 0 && <NoMatches compact noun={word.many.toLowerCase()} query={q} onClear={() => setQ('')} />}
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
                <b>{r.name}</b>
                <em>{r.meta}</em>
                {/* Both badges inform and neither blocks: a redundant or
                    unusual choice is legal and is sometimes deliberate. */}
                {r.empty && (
                  <span title="Nobody is in this group today, so a rule that names it decides nothing.">
                    <Badge tone="system">Empty</Badge>
                  </span>
                )}
                {isOutside(r.id) && (
                  <span title="This policy does not govern them, so this rule can never decide one of their sign-ins.">
                    <Badge tone="notice">Outside</Badge>
                  </span>
                )}
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
    </Modal>
  )
}
