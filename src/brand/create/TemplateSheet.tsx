import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, BookmarkPlus, Building2, ChevronRight, LayoutGrid, LayoutTemplate, List, Store, X } from 'lucide-react'

import { Button, Chip, Drawer, SearchBox } from '../kit'
import { FilterTabs } from '../screens/page-bar'
import { appRoot, useDialogChrome } from '../dialog-chrome'
import { EmptyState, NoMatches } from '../empty'
import { Picker } from '../picker'
import { appsOf, blankPolicy, type AccessDecision, type Policy, type Rule, type Scenario } from '../data'
import { leaves } from '../predicate'
import { useBrand, useNameLookup } from '../store'
import { copySources } from '../screens/board/copy-rules'
import { scenarioFromPolicy } from '../template-from-policy'
import { TEMPLATES_MANAGED } from '../template-phase'
import { buildTemplate, type TemplateLibrary } from '../screens/board/apply-template'
import type { WhoDirectory } from '../rule-who'
import { TEMPLATE_CATEGORIES } from '../template-phase'
import { TemplateCard, TemplatePreview, UsedBy, scenarioCard, type CardModel } from './TemplateCard'
import { DetailHead, TemplateDetail } from './TemplateDetail'

/* -----------------------------------------------------------------------------
   The template picker.

   It was the second half of a Create Policy PAGE: you clicked "New policy",
   met a gallery, chose a template, and only then were asked what the policy
   was called. That put the catalogue before the decision it decorates — most
   people know what they are protecting before they know which ready-made set
   of rules to start from. The order is reversed now: the form comes first and
   lands you in the builder, and the catalogue is offered from the empty board,
   where taking a template is an edit to a real policy that undo can put back.

   TWO AXES, TWO CONTROLS. The rail used to carry six entries — All, Yours, and
   the four content categories — which is one control doing two unrelated jobs:
   who wrote it, and what it is for. Picked apart, the shelf is a two-way choice
   that belongs in the rail, and the category is a filter that belongs above the
   grid it filters. So: two entries down the side, one dropdown over one flat
   list.

   Note the consequence, because it is real and it is not a bug: both templates
   this tenant wrote are Compliance ones, so filtering the Xecurify shelf to
   Compliance shows one of the three the catalogue holds. The dropdown shows no
   counts, and the page and its empty state point at the other shelf when that
   is where the rest are.
   -------------------------------------------------------------------------- */

/** Who wrote it. The rail's whole job. `policies` is the tenant's own policies, to copy one whole (owner, 2 Nov 2026). */
type Shelf = 'mine' | 'xecurify' | 'policies'

/* The policies shelf holds no template; one array, so the filters memoised on the shelf do not rerun every render. */
const NO_TEMPLATES: Scenario[] = []

/* Which shelf a tenant's own policy is most like, by what its rules test (owner, 2 Nov 2026: "based on category, different
   card types, each with its own colours, use cases and SVG"): device risk, then a device, then a zone or a place, and
   anything else (who, or every sign-in) is quick protection. It picks the card's colour and picture in the reuse picker. */
function policyKind(rules: Rule[]): 'quick' | 'device' | 'risk' | 'compliance' {
  const types = rules.flatMap((r) => leaves(r.when).map((c) => c.typeId))
  if (types.some((t) => t.includes('risk'))) return 'risk'
  if (types.some((t) => t === 'fingerprint' || t.startsWith('device'))) return 'device'
  if (types.some((t) => t === 'zone' || t === 'location' || t === 'country')) return 'compliance'
  return 'quick'
}

const STATUS_WORD: Record<Policy['status'], string> = { active: 'Active', inactive: 'Inactive', draft: 'Draft', monitor: 'Monitoring', 'always-on': 'Always on' }

/** What it is for. The dropdown's whole job. `Uncategorized` is listed only when the shelf holds one. */
const CATS = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized'] as const
type Cat = (typeof CATS)[number]

function hit(s: Scenario, q: string) {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

/* `toneOf` stood here, mapping the shelf and the filter onto one of six words
   for the header band to paint itself with. The band paints one colour now —
   see the note on `.bmarket__hero` — so there is nothing to map.

   The category's colour did not go anywhere: it is on the cards, in
   `.bgcard__cat`, which is the surface the category is actually about.

*/

export function TemplateSheet({
  open,
  onClose,
  onChoose,
  fallback = '1fa',
  target,
  withPolicies = false,
  policiesOnly = false,
  onChoosePolicy,
  slider = false,
  onBack,
}: {
  open: boolean
  onClose: () => void
  /** Hands back the chosen template. What is done with its rules is the host's. */
  onChoose: (s: Scenario) => void
  /** What the host policy's default decides, drawn as the last row of every template. */
  fallback?: AccessDecision
  /* The policy being built, so its own policies can be offered and itself left out (owner, 2 Nov 2026: the card look
     for Use existing policy, on its own, and as a shelf here should it ever sit inside templates). */
  target?: Pick<Policy, 'id' | 'type'>
  /** Your policies as a third shelf, where Copy from a policy sits inside templates. */
  withPolicies?: boolean
  /** Your policies alone: Copy from a policy as a way of its own, in this card look. */
  policiesOnly?: boolean
  /** Hands back the chosen policy, taken whole. */
  onChoosePolicy?: (p: Policy) => void
  /* The same cards in a right slider rather than the store's centred sheet (owner, 2 Nov 2026: "can't we convert this
     into a slider as well?"). The shelves become segments over the grid, beside the search. */
  slider?: boolean
  /** In the slider, the way back to the page that pushed it: New policy's name. */
  onBack?: () => void
}) {
  const [shelf, setShelf] = useState<Shelf>('xecurify')
  const [cat, setCat] = useState<Cat | 'All'>('All')
  const [q, setQ] = useState('')
  /* Inherit from an existing policy lists its policies as cards or as rows, a function of the popup (owner, 3 Nov 2026). */
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [preview, setPreview] = useState<Scenario | null>(null)
  const [policyPreview, setPolicyPreview] = useState<Policy | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const resolve = useNameLookup()

  /* From the store, so a template saved from a policy is on the tenant's shelf
     the next time this opens. The directory and library are the ones applying
     uses, so a card never lists a rule that applying leaves out. */
  const { scenarios, users, zones, fingerprints, policies, apps } = useBrand()
  const offered = useMemo(() => (target && (withPolicies || policiesOnly) ? copySources(policies, target) : []), [target, withPolicies, policiesOnly, policies])
  /* A policy drawn as a template card, so the two shelves read alike: its applications where a template's description
     goes, its status where a template's reach goes, and no category. */
  const policyCard = (p: Policy): CardModel => {
    const on = appsOf(p, apps)
    const names = on.map((a) => a.name)
    const sub = names.length > 0 ? names.join(', ') : p.isSystem ? 'Every application' : 'No applications'
    const m = scenarioCard(scenarioFromPolicy(p, { name: p.name, description: sub, category: 'Uncategorized' }, Date.now(), resolve), users, library)
    return { ...m, id: p.id, category: undefined, tone: policyKind(p.rules), apps: on.map((a) => ({ id: a.id, name: a.name })), meta: p.isSystem ? 'Always on' : STATUS_WORD[p.status], from: undefined }
  }
  const library = useMemo<TemplateLibrary>(() => ({ zones, fingerprints }), [zones, fingerprints])
  const tenantOwn = useMemo(() => scenarios.filter((s) => !s.provided), [scenarios])
  const shipped = useMemo(() => scenarios.filter((s) => s.provided), [scenarios])
  /* The shelf with templates on it first, as on the Templates page (29 Oct 2026): it opens on Your templates while the
     tenant has saved some, and lists that shelf first; otherwise Xecurify's, first. */
  /* Your templates only while the tenant manages templates (template-phase.ts); otherwise Xecurify's alone. */
  const yoursFirst = TEMPLATES_MANAGED && tenantOwn.length > 0
  const firstShelf: Shelf = policiesOnly ? 'policies' : yoursFirst ? 'mine' : 'xecurify'
  const railShelves: Shelf[] = policiesOnly
    ? ['policies']
    : [
        ...(!TEMPLATES_MANAGED ? (['xecurify'] as const) : yoursFirst ? (['mine', 'xecurify'] as const) : (['xecurify', 'mine'] as const)),
        ...(withPolicies && offered.length > 0 ? (['policies'] as const) : []),
      ]
  const SHELF_NAME: Record<Shelf, string> = { mine: 'Your templates', xecurify: 'Xecurify templates', policies: 'Your policies' }

  /* The preview in the popup (TemplateDetail): a template's, or a policy's in the reuse picker. Back closes it. */
  const detailOpen = !slider && (preview !== null || policyPreview !== null)
  const detailModel = preview ? scenarioCard(preview, users, library) : policyPreview ? policyCard(policyPreview) : null
  const back = () => {
    setPreview(null)
    setPolicyPreview(null)
  }
  /* Focus in, Tab kept inside, Escape peels one layer (the preview, then the popup), focus back on close. */
  useDialogChrome(open && !slider, detailOpen ? back : onClose, sheet)

  /* One flat list, filtered by three independent things. The old derivation
     split the result into `mine` and `theirs` and drew two headed sections; the
     shelf is a choice now, so there is one section and it needs no heading. */
  const shelved = shelf === 'mine' ? tenantOwn : shelf === 'xecurify' ? shipped : NO_TEMPLATES
  const policyList = useMemo(() => (shelf === 'policies' ? offered.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : []), [shelf, offered, q])
  /* Uncategorized is what a tenant files a template under by default. It is an
     option only where there is something in it, so it never adds "0 templates". */
  const cats = CATS.filter((c) => c !== 'Uncategorized' || shelved.some((s) => s.category === c))
  const list = useMemo(
    () => shelved.filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)),
    [shelved, cat, q],
  )

  /** The same search and category on the OTHER shelf — where the rest are. */
  const otherShelf: Shelf = shelf === 'mine' ? 'xecurify' : 'mine'
  const otherName = otherShelf === 'mine' ? 'Your templates' : 'Xecurify templates'
  const elsewhere = useMemo(
    () => (shelf === 'policies' ? 0 : (shelf === 'mine' ? shipped : tenantOwn).filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)).length),
    [shelf, shipped, tenantOwn, cat, q],
  )
  const searching = q.trim() !== '' || cat !== 'All'
  /* Changing shelf keeps the search, so the matches over there are what you see. */
  const showOther = () => {
    setShelf(otherShelf)
    setCat('All')
  }

  /* Cleared when it OPENS. The sheet's state lives above its own mount, so a
     search typed on one visit would still be filtering the grid on the next. */
  useEffect(() => {
    if (!open) return
    setShelf(firstShelf)
    setCat('All')
    setQ('')
    setPreview(null)
    setPolicyPreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shelf it opens on is read at opening, not followed
  }, [open])

  /* Changing shelf clears the filter. A category chosen on one shelf means
     something different on the other — and with two templates on the tenant's,
     any filter at all is a way to see none of them. */
  const pickShelf = (next: Shelf) => {
    setShelf(next)
    setCat('All')
  }

  function take(s: Scenario) {
    setPreview(null)
    onClose()
    onChoose(s)
  }
  function takePolicy(p: Policy) {
    setPolicyPreview(null)
    onClose()
    onChoosePolicy?.(p)
  }

  const previewPolicy = useMemo(() => {
    if (!preview) return null
    /* No applications yet: drawn as one for any application, so its start reads "a sign-in arrives at any application"
       rather than "No applications". Nothing else reads the mark here; the canvas is read only. */
    return { ...blankPolicy(preview.name), isSystem: true, rules: buildTemplate(preview, users, library).rules }
  }, [preview, users, library])

  /* The card grid and its empty states, the same in the sheet and the slider. */
  const grid = (
    <>
      {shelf === 'policies' && policyList.length > 0 && (
        <div className="bgal__grid">
          {policyList.map((p) => (
            <TemplateCard key={p.id} m={policyCard(p)} compact fallback={fallback} onUse={() => takePolicy(p)} onPreview={() => setPolicyPreview(p)} useLabel="Inherit" />
          ))}
        </div>
      )}
      {shelf === 'policies' && policyList.length === 0 && <NoMatches compact noun="policies" query={q} filtered={false} onClear={() => setQ('')} />}
      {shelf !== 'policies' && list.length > 0 && (
        <div className="bgal__grid">
          {list.map((s) => (
            <Card key={s.id} s={s} directory={users} library={library} fallback={fallback} onUse={() => take(s)} onPreview={() => setPreview(s)} />
          ))}
        </div>
      )}
      {shelf !== 'policies' && list.length === 0 && (
        <NoMatches
          compact
          noun="templates"
          query={q}
          filtered={cat !== 'All'}
          blurb={elsewhere > 0 ? `${elsewhere} in ${otherName}.` : undefined}
          secondary={
            elsewhere > 0 ? (
              <Button variant="ghost" onClick={showOther}>
                Show {otherName.toLowerCase()}
              </Button>
            ) : undefined
          }
          onClear={() => {
            setQ('')
            setCat('All')
          }}
        />
      )}
    </>
  )
  /* Each card's own page, over whichever holds the cards. */
  const previews = (
    <>
      <TemplatePreview m={preview ? scenarioCard(preview, users, library) : null} fallback={fallback} onClose={() => setPreview(null)} onUse={() => preview && take(preview)} />
      <TemplatePreview m={policyPreview ? policyCard(policyPreview) : null} fallback={fallback} onClose={() => setPolicyPreview(null)} onUse={() => policyPreview && takePolicy(policyPreview)} />
    </>
  )

  const title = policiesOnly ? 'Inherit from an existing policy' : 'Xecurify templates'
  /* Xecurify's alone (template-phase.ts): the sheet is the store's own popup (owner, 2 Nov 2026: "use the older popup
     here as well"), its name and by-line in the band. */
  const storeLook = !policiesOnly && railShelves.length === 1 && railShelves[0] === 'xecurify'
  /* A rail only for a choice of shelves. With one, the cards take the whole width and the categories are a dropdown over
     them (owner, same day: "convert into a filter-like dropdown and use the space wisely, for scale: what if we have
     more than this number of categories"). */
  const rail = railShelves.length > 1
  if (slider) {
    return (
      <>
        <Drawer
          open={open}
          onClose={onClose}
          title={title}
          width={900}
          head={
            onBack ? (
              <div className="bapr__pushed bnew__pushed">
                <button type="button" className="bapr__back" onClick={onBack}>
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden />
                  New policy
                </button>
                <h2>{title}</h2>
              </div>
            ) : undefined
          }
        >
          <div className="bgslide">
            <div className="bgslide__bar">
              <SearchBox placeholder={shelf === 'policies' ? 'Search policies' : 'Search templates'} label={shelf === 'policies' ? 'Search policies' : 'Search templates'} value={q} onChange={setQ} />
              {railShelves.length > 1 && (
                <FilterTabs label="Show" value={shelf} options={railShelves.map((s) => ({ value: s, label: SHELF_NAME[s] }))} onChange={pickShelf} />
              )}
              {shelf === 'xecurify' && (
                <Picker
                  label="Filter by category"
                  value={cat}
                  size="md"
                  summary={cat === 'All' ? 'All categories' : cat}
                  options={[{ value: 'All', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]}
                  onChange={(v) => setCat(v as Cat | 'All')}
                />
              )}
            </div>
            {grid}
          </div>
        </Drawer>
        {previews}
      </>
    )
  }

  /* Portalled to the app root, as Modal and Drawer are. Drawn in place it was stacked by the page it opened from: from
     New policy on the Policies page the rail and the top bar covered it (2 Nov 2026: "the card part is completely broken
     inside the form view"). The builder has neither, which is why it looked right there. In place on the server, where
     there is no document (the tests draw static markup). */
  const tree = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bmarket"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          /* `role="dialog"` is load-bearing beyond accessibility here: the
             board's keyboard handler stands down while `[role="dialog"]` or
             `.bx-scrim` matches, and without it Del, ⌘D, `e` and the arrow keys
             would still be acting on the rule underneath while somebody reads a
             template. */
          role="dialog"
          aria-modal="true"
          aria-label={policiesOnly ? 'Inherit from an existing policy' : storeLook ? 'Xecurify templates' : 'Start from a template'}
        >
          <motion.div
            ref={sheet}
            tabIndex={-1}
            /* Focused as a whole on open, so no ring round the whole sheet. */
            style={{ outline: 'none' }}
            className={`bmarket__sheet${policiesOnly ? ' is-reuse' : storeLook ? ' is-template' : ''}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            {/* A band of its own for the question and the one control that
                answers it fastest.

                The heading, the provenance line and the close used to share a
                24px header row with the filters crammed under them, and the
                catalogue started 60px from the top of the sheet. Somebody
                opening this is looking for one of fourteen things; give the
                looking a place to stand. Centred, on the page grey, with the
                search at the width a template name actually needs — and
                nothing else in it. */}
            <header className="bmarket__hero">
              {/* In the header, centred on it whatever it holds (owner, 3 Nov 2026: "fix the alignments"). */}
              <button type="button" className="bmarket__x" onClick={onClose} aria-label="Close the gallery">
                <X size={18} strokeWidth={1.9} />
              </button>
              {detailOpen && detailModel ? (
                <DetailHead m={detailModel} backLabel={policiesOnly ? 'Back to your policies' : 'Back to Xecurify templates'} onBack={back} />
              ) : (
                <>
                <span className="bmarket__mark" aria-hidden>
                  {policiesOnly ? <Building2 size={17} strokeWidth={1.8} /> : <Store size={17} strokeWidth={1.8} />}
                </span>
                {/* The shopfront, back and smaller. It was briefly a two-by-two
                    of the four category hues — a legend for the filter — which
                    was the last of six attempts to make this band say which
                    category was selected. It said it accurately and it was still
                    a second readout for something the dropdown states in words
                    and the cards state in pills. */}
                <h2>{policiesOnly ? 'Inherit from an existing policy' : storeLook ? 'Xecurify templates' : 'Start from a template'}</h2>
                {storeLook && <p className="bmarket__by">By miniOrange</p>}
                </>
              )}
              <div className="bmarket__searchbox" hidden={detailOpen}>
                <SearchBox
                  block
                  placeholder={policiesOnly ? 'Search policies' : 'Search templates'}
                  label="Search the gallery"
                  value={q}
                  onChange={setQ}
                />
              </div>
            </header>

            <div className={`bmarket__work${rail ? '' : ' is-full'}${detailOpen ? ' is-detail' : ''}`}>
              {/* Two entries. Who wrote it, and nothing else — the four content
                  categories that used to share this rail are a dropdown over
                  the grid now, because "written by my team" and "about devices"
                  are not alternatives and a list that mixes them makes you pick
                  one to lose the other. */}
              {rail && (
              <aside className="bmarket__rail">
                <p className="bmarket__railhead">Templates</p>
                <div className="bmarket__cats" role="tablist" aria-label="Whose templates">
                  {railShelves.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={shelf === s}
                      className={`bmarket__cat ${shelf === s ? 'is-on' : ''}`}
                      onClick={() => pickShelf(s)}
                    >
                      <span>{SHELF_NAME[s]}</span>
                    </button>
                  ))}
                </div>
              </aside>
              )}

              <div className={`bmarket__body${detailOpen ? ' is-detail' : ''}`}>
                {/* A card's preview takes the popup's place (owner, 2 Nov 2026: "change the whole popup, don't open one
                    after another"): it fades in where the grid was, and Back puts the grid back. */}
                {preview && previewPolicy && (
                  <TemplateDetail
                    m={scenarioCard(preview, users, library)}
                    policy={previewPolicy}
                    useLabel="Use this template"
                    onUse={previewPolicy.rules.length > 0 ? () => take(preview) : undefined}
                  />
                )}
                {policyPreview && (
                  <TemplateDetail
                    m={policyCard(policyPreview)}
                    policy={policyPreview}
                    useLabel="Inherit these rules"
                    onUse={() => takePolicy(policyPreview)}
                  />
                )}
                {!detailOpen && (
                <>
                {/* The heading over the cards is back, for now (owner, 3 Nov 2026: "add the heading as of now"). */}
                <div className="bmarket__shelf">
                  <h3 className="bgal__section">
                    {storeLook ? (cat === 'All' ? 'All templates' : cat) : SHELF_NAME[shelf]}
                    {!storeLook && shelf !== 'policies' && <span>{shelf === 'mine' ? 'Built by your team' : 'By miniOrange'}</span>}
                  </h3>
                  {shelf === 'policies' && (
                    <div className="bmarket__tools">
                      <div className="bseg bseg--icons" role="group" aria-label="View">
                        <button type="button" aria-pressed={view === 'cards'} className={view === 'cards' ? 'is-on' : ''} aria-label="Cards" title="Cards" onClick={() => setView('cards')}>
                          <LayoutGrid size={16} strokeWidth={1.9} aria-hidden />
                        </button>
                        <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'is-on' : ''} aria-label="List" title="List" onClick={() => setView('list')}>
                          <List size={16} strokeWidth={1.9} aria-hidden />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* The categories as chips, one click each and all in view (owner, 3 Nov 2026: "replace the category
                    dropdown with chips"). */}
                {TEMPLATE_CATEGORIES && shelf === 'xecurify' && (
                  <div className="bmarket__chips" role="group" aria-label="Filter by category">
                    {(['All', ...cats] as (Cat | 'All')[]).map((c) => (
                      <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                        {c === 'All' ? 'All categories' : c}
                      </Chip>
                    ))}
                  </div>
                )}

                {shelf === 'policies' && policyList.length > 0 && view === 'list' && (
                  <ul className="bpl" aria-label="Your policies">
                    <li className="bpl__head" aria-hidden>
                      <span>Name</span>
                      <span>Used by</span>
                      <span />
                    </li>
                    {policyList.map((p) => (
                      <PolicyRow key={p.id} m={policyCard(p)} onPreview={() => setPolicyPreview(p)} />
                    ))}
                  </ul>
                )}
                {shelf === 'policies' && policyList.length > 0 && view === 'cards' && (
                  <div className="bgal__grid">
                    {policyList.map((p) => (
                      <TemplateCard key={p.id} m={policyCard(p)} compact fallback={fallback} onUse={() => takePolicy(p)} onPreview={() => setPolicyPreview(p)} useLabel="Inherit" />
                    ))}
                  </div>
                )}
                {shelf === 'policies' && policyList.length === 0 && (
                  <NoMatches compact noun="policies" query={q} filtered={false} onClear={() => setQ('')} />
                )}

                {shelf !== 'policies' && list.length > 0 && (
                  <div className="bgal__grid">
                    {list.map((s) => (
                      <Card
                        key={s.id}
                        s={s}
                        directory={users}
                        library={library}
                        fallback={fallback}
                        onUse={() => take(s)}
                        onPreview={() => setPreview(s)}
                      />
                    ))}
                  </div>
                )}

                {/* Where the rest of them are, for the same search and category.
                    Both templates this tenant wrote are Compliance ones, so
                    filtering Xecurify to Compliance shows one of three — and the
                    two that are missing are one click away rather than gone. */}
                {list.length > 0 && searching && elsewhere > 0 && (
                  <p className="bmarket__elsewhere">
                    {elsewhere} more in {otherName}.{' '}
                    <button type="button" onClick={showOther}>
                      Show {otherName.toLowerCase()}
                    </button>
                  </p>
                )}

                {shelf !== 'policies' && list.length === 0 &&
                  (searching ? (
                    <NoMatches
                      compact
                      noun="templates"
                      query={q}
                      filtered={cat !== 'All'}
                      blurb={elsewhere > 0 ? `${elsewhere} in ${otherName}.` : undefined}
                      secondary={
                        elsewhere > 0 ? (
                          <Button variant="ghost" onClick={showOther}>
                            Show {otherName.toLowerCase()}
                          </Button>
                        ) : undefined
                      }
                      onClear={() => {
                        setQ('')
                        setCat('All')
                      }}
                    />
                  ) : shelf === 'mine' ? (
                    <EmptyState
                      compact
                      icon={BookmarkPlus}
                      title="No templates yet"
                      blurb="Save a policy as a template from its menu."
                      action={<Button onClick={showOther}>Show Xecurify templates</Button>}
                    />
                  ) : (
                    <EmptyState
                      compact
                      icon={LayoutTemplate}
                      title="No Xecurify templates"
                      blurb="Templates from miniOrange show here."
                      action={<Button onClick={showOther}>Show your templates</Button>}
                    />
                  ))}
                </>
                )}
              </div>
            </div>
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  )
  return typeof document === 'undefined' ? tree : createPortal(tree, appRoot())
}

function Card({
  s,
  directory,
  library,
  fallback,
  onUse,
  onPreview,
}: {
  s: Scenario
  directory: WhoDirectory
  library: TemplateLibrary
  fallback: AccessDecision
  onUse: () => void
  onPreview: () => void
}) {
  const m = useMemo(() => scenarioCard(s, directory, library), [s, directory, library])
  return <TemplateCard m={m} fallback={fallback} onUse={onUse} onPreview={onPreview} useLabel="Use" />
}


/* A policy as a row of the list (owner, 3 Nov 2026: "give me a good list experience … the whole row on hover", then "simple and useful": a name, where it runs, and the action): the whole row is
   the button, so it highlights and opens the preview from anywhere on it; the action says itself on hover and focus. */
function PolicyRow({ m, onPreview }: { m: CardModel; onPreview: () => void }) {
  return (
    <li>
      <button type="button" className="bpl__row" onClick={onPreview} aria-label={`Preview and inherit ${m.name}`}>
        <span className="bpl__name" title={m.name}>
          {m.name}
        </span>
        <span className="bpl__apps">{m.apps && m.apps.length > 0 ? <UsedBy apps={m.apps} /> : null}</span>
        <span className="bpl__go">
          Preview and inherit
          <ChevronRight size={14} strokeWidth={2} aria-hidden />
        </span>
      </button>
    </li>
  )
}
