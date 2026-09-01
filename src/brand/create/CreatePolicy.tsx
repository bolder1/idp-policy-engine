import { AnimatePresence, motion } from 'motion/react'
import { Suspense, forwardRef, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Check, Plus, Search, Store, Upload, Wand2, X } from 'lucide-react'

import { Button, DecisionChip } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { blankPolicy, conditionType, scenarios, type Scenario } from '../data'
import { useBrand } from '../store'
import { leaves } from '../predicate'
import { TemplateCard, TemplatePreview, type CardModel } from './TemplateCard'

/* Mounted only while it is open — the gallery is the common path and does not
   need the interview's questions, composer and figures in its chunk. */
const Interview = lazy(() => import('./Interview').then((m) => ({ default: m.Interview })))

/* -----------------------------------------------------------------------------
   Create a policy.

   Same two steps the prototype has — pick a scenario, then name it and choose
   an app — rebuilt as a gallery rather than a three-column modal.

   What the prototype does today, and what each change is for:

   · The scenario list, a preview pane and three "other options" are crammed
     into one modal about 940px wide. Each scenario is a single line of text, so
     the only way to know what one does is to click it and read the middle
     column. Here the catalogue is the page, and every card carries its own
     rules, so the whole set is comparable at a glance.
   · "Build from scratch / Import / External conditions" occupied a third of
     that modal for three links. They are two small buttons in the header, and a
     blank card sitting inline in the grid where someone scanning templates will
     actually meet it.
   · Choosing a scenario did not apply it — you landed in a builder holding
     unrelated rules. The rules are built here, and step 2 shows them before you
     commit, so the promise made on the card is visible at the moment you accept
     it.
   -------------------------------------------------------------------------- */

const CATEGORIES = ['All', 'Quick Protection', 'Device-based', 'Risk-based', 'Compliance'] as const
type Category = (typeof CATEGORIES)[number]

export function CreatePolicy() {
  const store = useBrand()
  const [interview, setInterview] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<Scenario | null>(null)
  const [blank, setBlank] = useState(false)
  const [name, setName] = useState('')
  const [appIds, setAppIds] = useState<string[]>([])
  const [market, setMarket] = useState(false)
  const templatesRef = useRef<HTMLDivElement>(null)

  /* Honours prefers-reduced-motion: the destination is the point, the travel
     is not, so a user who has asked for less motion is simply put there. */
  const jumpToTemplates = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    templatesRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  function choose(s: Scenario | null) {
    setPicked(s)
    setBlank(s === null)
    setName(s ? s.name : '')
    setStep(2)
  }

  function create() {
    const policy = blankPolicy(name.trim() || 'Untitled policy', appIds)
    // Built here, so what the card promised is what the builder receives —
    // including who it is for, which is now the template's to state.
    if (picked) {
      policy.rules = picked.rules.map((r) => r.build())
      policy.audience = picked.audience
    }
    store.addPolicy(policy)
    store.showToast(
      picked
        ? `${policy.name} created with ${policy.rules.length} rule${policy.rules.length === 1 ? '' : 's'}`
        : `${policy.name} created`,
    )
    store.go({ name: 'builder', policyId: policy.id })
  }

  return (
    <div className={`bpage bcp ${step === 2 ? 'bcp--fit' : ''}`}>
      <header className="bcp__head">
        {/* The step used to sit above the title as its own line, which made a
            subheading out of wayfinding. It belongs in the trail that is already
            telling you where you are. */}
        <nav className="bcp__crumb">
          <button onClick={() => store.go({ name: 'policies' })}>Policies</button>
          <span aria-hidden>/</span>
          <span>New policy</span>
          <span aria-hidden>/</span>
          <span className="bcp__stepcrumb">Step {step} of 2</span>
        </nav>

        <div className="bcp__headrow">
          <h1>{step === 1 ? 'New policy' : 'Name your policy'}</h1>
        </div>
      </header>

      {/* The three ways to start, gathered into one banner instead of scattered
          between a header action trail, a card in the grid and a promo tile.
          The fourth way — a template — is a whole section of its own below, so
          the banner points at it rather than trying to contain it.

          Guided setup is deliberately not here. It belongs on step 2's bar,
          beside Create policy — see the note there. */}
      {step === 1 && (
        <section className="bhero">
          <div className="bhero__body">
            <h2>Every policy starts one of four ways</h2>
            <p>
              Build it yourself, copy one you already run, or bring one in from a file. Nothing goes
              live until you switch it on.
            </p>
            <div className="bhero__acts">
              <Button variant="brand" onClick={() => choose(null)}>
                <Plus size={15} strokeWidth={2.2} aria-hidden /> Start from scratch
              </Button>
              <Button onClick={() => store.showToast('Bulk import accepts CSV or JSON, up to 10,000 entries')}>
                <Upload size={14} strokeWidth={1.9} aria-hidden /> Import from file
              </Button>
              <button type="button" className="bhero__jump" onClick={jumpToTemplates}>
                Or start from a template <ArrowDown size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
          {/* Decorative only — the same dotted canvas the rule thumbnails use,
              so the banner belongs to this product rather than to a marketing
              page. aria-hidden because it says nothing the copy does not. */}
          <div className="bhero__art" aria-hidden>
            <span className="bhero__chip is-1">Deny</span>
            <span className="bhero__chip is-2">MFA</span>
            <span className="bhero__chip is-3">Allow</span>
          </div>
        </section>
      )}

      <motion.div
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        {step === 1 ? (
            <Gallery ref={templatesRef} onChoose={choose} onOpenMarket={() => setMarket(true)} />
          ) : (
            <NameStep
              picked={picked}
              blank={blank}
              name={name}
              setName={setName}
              appIds={appIds}
              setAppIds={setAppIds}
              onBack={() => setStep(1)}
              onCreate={create}
              onGuided={store.features.guidedSetup ? () => setInterview(true) : undefined}
            />
        )}
      </motion.div>

      <Marketplace open={market} onClose={() => setMarket(false)} onChoose={choose} />

      <AnimatePresence>
        {interview && store.features.guidedSetup && (
          <Suspense fallback={null}>
          <Interview
            open={interview}
            onClose={() => setInterview(false)}
            onCreate={(rules, builtName, audience) => {
              const policy = blankPolicy(builtName, [])
              policy.rules = rules
              policy.audience = audience
              store.addPolicy(policy)
              store.showToast(`${policy.name} created with ${rules.length} rule${rules.length === 1 ? '' : 's'}`)
              store.go({ name: 'builder', policyId: policy.id })
            }}
          />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- Step 1 · gallery ------------------------------------------------------- */

const MINE = scenarios.filter((s) => !s.provided)
const PROVIDED = scenarios.filter((s) => s.provided)

function hit(s: Scenario, q: string) {
  if (!q) return true
  const t = q.toLowerCase()
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

/* The main page carries the tenant's own templates and nothing else. Twelve
   vendor scenarios below three of your own buried the ones you wrote, and made
   the page a catalogue when it is meant to be a starting point. Xecurify's live
   in the marketplace, one button away. */
const Gallery = forwardRef<HTMLDivElement, {
  onChoose: (s: Scenario | null) => void
  onOpenMarket: () => void
}>(function Gallery({ onChoose, onOpenMarket }, ref) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)
  const mine = useMemo(() => MINE.filter((s) => hit(s, q)), [q])

  return (
    <section className="bgal" ref={ref}>
      {MINE.length > 0 && (
        <div className="bgal__bar">
          <h2 className="bgal__section">
            Your templates <em>{mine.length}</em>
            <span>Built by your team</span>
          </h2>
          <input
            type="search"
            className="bgal__search"
            placeholder="Search your templates…"
            aria-label="Search your templates"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {/* Sits with the templates it is about, not in the page's action
              trail — that row is for what happens to the policy you are
              creating, and browsing a catalogue is not one of those. */}
          <Button onClick={onOpenMarket}>
            Xecurify templates <em className="bcp__count">{PROVIDED.length}</em>
          </Button>
        </div>
      )}

      <div className="bgal__grid">
        {mine.map((s) => (
          <Card key={s.id} s={s} onUse={() => onChoose(s)} onPreview={() => setPreview(s)} />
        ))}

        {/* The discovery affordance sits in the grid, in the slot the blank card
            used to hold — where someone scanning templates actually meets it. */}
        <button type="button" className="bmarket__promo" onClick={onOpenMarket}>
          <span className="bmarket__promoicon" aria-hidden>
            <Store size={24} strokeWidth={1.6} />
          </span>
          <strong>Xecurify templates</strong>
          <span className="bmarket__promosub">
            {PROVIDED.length} ready-made templates by miniOrange, for the situations most
            organisations protect first.
          </span>
          <span className="bmarket__promocta">
            Browse the gallery
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </span>
        </button>
      </div>

      {mine.length === 0 && q && (
        <div className="bgal__none">
          <p>None of your templates match “{q}”.</p>
          <Button onClick={() => setQ('')}>Clear search</Button>
        </div>
      )}

      {/* The live preview draws the rules a template will create before it is
          chosen. Withheld in lite, so a card commits on its name and its
          one-line description — which is the v0 behaviour. */}
      {store.features.templateHero && (
        <TemplatePreview
          m={preview ? scenarioCard(preview) : null}
          onClose={() => setPreview(null)}
          onUse={() => preview && onChoose(preview)}
        />
      )}
    </section>
  )
})

/* --- The marketplace --------------------------------------------------------
   A full sheet rather than a dialog: this is a catalogue you browse, and a
   560px box would put three cards on screen. It sits over the create flow
   instead of becoming a third step, so "Step 1 of 2" stays true.
   -------------------------------------------------------------------------- */
function Marketplace({
  open,
  onClose,
  onChoose,
}: {
  open: boolean
  onClose: () => void
  onChoose: (s: Scenario) => void
}) {
  const [cat, setCat] = useState<Category>('All')
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<Scenario | null>(null)

  const list = useMemo(
    () => PROVIDED.filter((s) => (cat === 'All' || s.category === cat) && hit(s, q)),
    [cat, q],
  )
  const featured = list.filter((s) => s.badge)
  const rest = list.filter((s) => !s.badge)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // The sheet owns the viewport while it is up; the page behind must not
    // scroll under it.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  function take(s: Scenario) {
    setPreview(null)
    onClose()
    onChoose(s)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bmarket"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-label="Templates provided by Xecurify"
        >
          <motion.div
            className="bmarket__sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <header className="bmarket__head">
              <div className="bmarket__brand">
                <span className="bmarket__mark" aria-hidden>
                  <Store size={20} strokeWidth={1.7} />
                </span>
                <div>
                  <h2>Xecurify templates</h2>
                  <p>by miniOrange · {PROVIDED.length} templates, free with your licence</p>
                </div>
              </div>
              <button type="button" className="bmarket__x" onClick={onClose} aria-label="Close the gallery">
                <X size={18} strokeWidth={1.9} />
              </button>
            </header>

            {/* Apollo's shape: the filter is a left rail rather than a tab
                strip. Six categories in a horizontal row is a row that wraps on
                a laptop and truncates its counts; the same six down the side
                are a fixed index that the grid scrolls independently of, which
                is why every gallery of any size ends up here. Search sits at
                the top of the rail because it filters the same thing the rail
                filters. */}
            <div className="bmarket__work">
              <aside className="bmarket__rail">
                <input
                  type="search"
                  className="bmarket__search"
                  placeholder="Search templates"
                  aria-label="Search the gallery"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />

                <div className="bmarket__cats" role="tablist" aria-label="Template categories">
                  {CATEGORIES.map((c) => {
                    const n = c === 'All' ? PROVIDED.length : PROVIDED.filter((s2) => s2.category === c).length
                    return (
                      <button
                        key={c}
                        role="tab"
                        aria-selected={cat === c}
                        className={`bmarket__cat ${cat === c ? 'is-on' : ''}`}
                        onClick={() => setCat(c)}
                      >
                        {cat === c && (
                          <motion.span
                            layoutId="marketcat"
                            className="bmarket__catbg"
                            transition={{ type: 'spring', stiffness: 600, damping: 44 }}
                          />
                        )}
                        <span>{c === 'All' ? 'All templates' : c}</span>
                        <em>{n}</em>
                      </button>
                    )
                  })}
                </div>
              </aside>

              <div className="bmarket__body">
              <div className="bmarket__intro">
                <h3>{cat === 'All' ? 'All templates' : cat}</h3>
                <p>
                  Ready-made policies you can take as they are or edit afterwards. Nothing goes live until you switch
                  it on.
                </p>
              </div>

              {featured.length > 0 && (
                <>
                  <h3 className="bgal__section">
                    Recommended <em>{featured.length}</em>
                    <span>Suggested for your licence</span>
                  </h3>
                  <div className="bgal__grid">
                    {featured.map((s) => (
                      <Card key={s.id} s={s} onUse={() => take(s)} onPreview={() => setPreview(s)} />
                    ))}
                  </div>
                </>
              )}

              {rest.length > 0 && (
                <>
                  <h3 className="bgal__section">
                    {featured.length > 0 ? 'All templates' : 'Templates'} <em>{rest.length}</em>
                  </h3>
                  <div className="bgal__grid">
                    {rest.map((s) => (
                      <Card key={s.id} s={s} onUse={() => take(s)} onPreview={() => setPreview(s)} />
                    ))}
                  </div>
                </>
              )}

              {list.length === 0 && (
                <div className="bgal__none">
                  <p>Nothing in the gallery matches “{q}”.</p>
                  <Button
                    onClick={() => {
                      setQ('')
                      setCat('All')
                    }}
                  >
                    Clear search
                  </Button>
                </div>
                )}
              </div>
            </div>
          </motion.div>

          <TemplatePreview
            m={preview ? scenarioCard(preview) : null}
            onClose={() => setPreview(null)}
            onUse={() => preview && take(preview)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* --- The card's hero -------------------------------------------------------

   A document template shows a thumbnail of the document. The equivalent for a
   policy template is a miniature of the policy: which signals it reads, and its
   rules laid out in evaluation order with each segment as wide as the
   population it reaches. Both are derived from the rules the template actually
   builds, so the picture cannot drift from the result.
   -------------------------------------------------------------------------- */

/** Condition groups, said the way an admin would say them. */
const SIGNAL_OF: Record<string, string> = {
  Network: 'Network',
  Location: 'Location',
  Time: 'Time',
  Device: 'Device',
  User: 'Identity',
  Group: 'Identity',
  'Custom attributes': 'Attributes',
  Webhooks: 'External',
}

/** A scenario, in the shape the shared card renders. */
export function scenarioCard(s: Scenario): CardModel {
  const built = s.rules.map((r) => r.build())

  const signals: string[] = []
  for (const r of built)
    for (const c of leaves(r.when)) {
      const label = SIGNAL_OF[conditionType(c.typeId).group] ?? 'Other'
      if (!signals.includes(label)) signals.push(label)
    }

  const reach = built.reduce((n, r) => Math.max(n, r.matchEstimate), 0)

  return {
    id: s.id,
    name: s.name,
    description: s.description,
    badge: s.badge,
    // A template with no conditions applies to everyone, which is worth saying.
    signals: signals.length > 0 ? signals : ['Everyone'],
    // On the tenant's own templates the useful fact is who wrote it and when;
    // on Xecurify's it is how many people the thing would reach.
    reviewed: s.reviewed,
    /* "~340 people" not "340 people". matchEstimate is seed data that never
       recomputes, and the builder's impact panel already labels the same figure
       an estimate — the card was the one place stating it as a bare fact. */
    meta: s.provided ? `~${reach.toLocaleString()} people` : `${s.author} · ${s.when}`,
    rules: s.rules.map((r, i) => ({ ...r, reach: built[i].matchEstimate })),
  }
}

function Card({ s, onUse, onPreview }: { s: Scenario; onUse: () => void; onPreview: () => void }) {
  const m = useMemo(() => scenarioCard(s), [s])
  return <TemplateCard m={m} onUse={onUse} onPreview={onPreview} useLabel="Use" />
}

/* --- Step 2 · name and app -------------------------------------------------- */

/* -----------------------------------------------------------------------------
   Application picker.

   Three shapes tried here, and the reasoning that settled it:

   A grid of ten tiles was a multi-select affordance — it exists so you can
   sweep across it ticking several — and choosing exactly one does not need it.
   Collapsing it to a combobox fixed that and scaled to a real tenant's two
   hundred apps, but it left the column it lived in almost empty, and it hid the
   catalogue behind a click for no gain: this is the only choice on the page, so
   nothing else is competing for the room.

   So the list is open, and the search box is what handles scale — it always
   was. Collapsing was never the part doing that work. The list fills whatever
   height the column has and scrolls inside itself, so the page still does not.
   -------------------------------------------------------------------------- */
function AppList({ chosen, onChange }: { chosen: string | null; onChange: (id: string | null) => void }) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const matches = store.apps.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="bapps">
      <div className="bapps__search">
        <Search size={14} strokeWidth={1.9} aria-hidden />
        <input
          type="text"
          value={q}
          placeholder={`Search ${store.apps.length} applications…`}
          aria-label="Search applications"
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button type="button" className="bapps__clearq" aria-label="Clear search" onClick={() => setQ('')}>
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* radiogroup, not a list of buttons: one of these is true and the rest
          are false, which is exactly what a radio group means to a screen
          reader. */}
      <div className="bapps__list" role="radiogroup" aria-label="Application this policy protects">
        {matches.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={chosen === a.id}
            className={`bapps__row ${chosen === a.id ? 'is-on' : ''}`}
            /* Clicking the chosen one again clears it, so there is a way back
               to "no application" without hunting for a separate control. */
            onClick={() => onChange(chosen === a.id ? null : a.id)}
          >
            <AppLogo appId={a.id} name={a.name} size={22} />
            <span className="bapps__name">{a.name}</span>
            <span className="bapps__proto">{a.protocol}</span>
            <span className="bapps__mark" aria-hidden>
              {chosen === a.id && <Check size={13} strokeWidth={3} />}
            </span>
          </button>
        ))}
        {matches.length === 0 && <p className="bapps__none">No application matches “{q}”.</p>}
      </div>
    </div>
  )
}

function NameStep({
  picked,
  blank,
  name,
  setName,
  appIds,
  setAppIds,
  onBack,
  onCreate,
  onGuided,
}: {
  picked: Scenario | null
  blank: boolean
  name: string
  setName: (v: string) => void
  appIds: string[]
  setAppIds: (v: string[]) => void
  onBack: () => void
  onCreate: () => void
  /* Absent in lite: the guided build is withheld, and a button that opens
     nothing is worse than no button. */
  onGuided?: () => void
}) {
  const chosen = appIds[0] ?? null

  return (
    <section className="bname2">
      {/* Two labelled controls and nothing else.

          The step used to carry a page subtitle, a line of help under each
          field, a paragraph in the empty state and a note in the footer — four
          layers of prose wrapped around two inputs. Enterprise forms that do
          this well (Retool's create-license-key, Antimetal, Intercom's ticket
          composer) put the whole explanation in the label and stop. A field
          that needs a sentence under it is usually a field with a bad name. */}
      <div className="bname2__form bcard">
        <div className="bname2__field">
          <label htmlFor="np-name" className="bname2__label">
            Policy name <i>*</i>
          </label>
          <input
            id="np-name"
            type="text"
            value={name}
            autoFocus
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            placeholder="Finance Team – High Security"
          />
          {/* The counter earns its place only near the ceiling. */}
          {name.length > 39 && <span className="bname2__count">{50 - name.length} left</span>}
        </div>

        <div className="bname2__field bname2__field--fill">
          <span className="bname2__label" id="np-app-label">
            Application <em>Optional</em>
          </span>
          {/* No separate "Protects" block underneath. It restated the row that
              is already ticked in this list — the selection is visible where it
              is made, so repeating it was two places to keep in sync and one
              more thing to read. */}
          <AppList chosen={chosen} onChange={(id) => setAppIds(id ? [id] : [])} />
        </div>
      </div>

      {/* What you are about to get. The prototype never showed this at the
          moment of commit, which is how its preview and its result drifted. */}
      {/* The right column is one panel with a fixed head and a scrolling body.
          It is the only thing on this page whose length is unbounded — a
          template can carry any number of rules — so it is the only thing that
          gets to scroll, and it does so inside its own box rather than making
          the page taller. */}
      <aside className="bname2__side">
        <header className="bname2__sidehead">
          <div>
            <h2>{name.trim() || 'Untitled policy'}</h2>
            <p>
              {blank
                ? 'Blank — no rules yet'
                : `From ${picked?.name} · ${picked?.rules.length} rule${picked?.rules.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="bname2__off">Created off</span>
        </header>

        <div className="bname2__scroll">
          {picked ? (
            <ol className="bname2__rules">
              {picked.rules.map((r, i) => (
                <li key={r.name}>
                  <span className="bprev__n">{i + 1}</span>
                  <span className="bprev__body">
                    <strong>{r.name}</strong>
                    <span>IF {r.ifText}</span>
                  </span>
                  <DecisionChip decision={r.decision} size="sm" />
                </li>
              ))}
              <li className="bname2__rules--default">
                <span className="bprev__n" aria-hidden>
                  ⌄
                </span>
                <span className="bprev__body">
                  <strong>Everyone else</strong>
                  <span>Nothing above matched</span>
                </span>
                <DecisionChip decision="1fa" size="sm" />
              </li>
            </ol>
          ) : (
            <div className="bname2__blank">
              <strong>No rules yet</strong>
              <span>You will add them in the builder once this policy is created.</span>
            </div>
          )}
        </div>
      </aside>

      {/* Bottom bar rather than buttons inside the panel — the panel is a
          summary, and as this step grows the commit action should not drift
          down the page with it. */}
      <div className="bbar">
        <p className="bbar__note">
          {!name.trim()
            ? 'Give the policy a name to continue.'
            : chosen === null
              ? 'Created switched off, with no app attached. You can add one from the builder.'
              : 'Created switched off. Nothing changes for users until you turn it on.'}
        </p>
        <div className="bbar__acts">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>

          {/* Guided setup lives here rather than up on the gallery, because
              this is the moment somebody has decided to write the rules
              themselves and is looking at an empty form. Offering it as a fifth
              thing to choose between made it one more decision; offering it
              beside Create policy makes it a way out of the one you are already
              stuck on.

              It is the only animated control in the product: a slow sheen and a
              wand that lifts on hover. Everything else here is still, so one
              moving thing reads as an invitation instead of as noise — and it
              stops entirely under prefers-reduced-motion. */}
          {onGuided && (
          <button type="button" className="bguided" onClick={onGuided}>
            <span className="bguided__sheen" aria-hidden />
            <Wand2 size={14} strokeWidth={1.9} aria-hidden />
            Guided setup
          </button>
          )}

          <Button variant="brand" onClick={onCreate} disabled={!name.trim()}>
            Create policy
          </Button>
        </div>
      </div>
    </section>
  )
}
