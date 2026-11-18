import { useState } from 'react'
import { useMemo } from 'react'
import { Store } from 'lucide-react'
import { TEMPLATE_CATEGORIES, TEMPLATE_STORE } from '../template-phase'

import { PageHead } from '../Shell'
import { TemplateCard, TemplatePreview, scenarioCard } from '../create/TemplateCard'
import { TemplateStore } from '../create/TemplateStore'
import { NoMatches } from '../empty'
import { Button, SearchBox } from '../kit'
import { Picker } from '../picker'
import { freeName } from '../policy-name'
import { newPolicy } from '../policy-draft'
import { useNewPolicy } from '../create/use-new-policy'
import { useBrand } from '../store'
import { blankPolicy, type Scenario } from '../data'
import { buildTemplate, templateBlocker, templateGaps, type TemplateLibrary } from './board/apply-template'
import { ConfirmDelete } from './confirm-delete'

/* -----------------------------------------------------------------------------
   Policy templates.

   This tenant's own templates (owner, 30 Oct 2026: "only show your templates"):
   the ones saved from a policy and the ones added from the Xecurify store. The
   templates miniOrange ships are in the store (create/TemplateStore.tsx), a
   popup the page's one orange button opens, as the Figma Community sits apart
   from a person's drafts. All of them come from `store.scenarios`, the list the
   board's gallery reads too, so a template saved or added anywhere is here.

   Use makes a draft named after the template, with its rules, and opens it on
   the board: a new policy is a new file, not a form (owner, 23 Sep 2026), and
   from a template too (29 Oct 2026: one way in). The name is the template's,
   numbered when a policy has it, and is renamed in the builder's bar like any
   other. A template whose rules apply to nobody, or that has no rules, cannot be
   used, so it offers no Use.
   -------------------------------------------------------------------------- */

const CATS: Scenario['category'][] = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized']

/* Whose a template is: Xecurify ships it, or the tenant saved it (from a policy, or a copy from the store). */
type Source = 'All' | 'xecurify' | 'custom'
const SOURCE_LABEL = { xecurify: 'Xecurify', custom: 'Custom' } as const
const sourceOf = (s: Scenario): Exclude<Source, 'All'> => (s.provided ? 'xecurify' : 'custom')

function matches(s: Scenario, q: string) {
  if (!q) return true
  const t = q.toLowerCase()
  return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)
}

export function Templates() {
  const store = useBrand()
  const { scenarios, users, zones, fingerprints } = store
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('All')
  const [source, setSource] = useState<Source>('All')
  const [preview, setPreview] = useState<Scenario | null>(null)
  /* The tenant's own template the admin is about to take away. */
  const [deleting, setDeleting] = useState<Scenario | null>(null)

  /* Built the way Use builds them — this tenant's people, zones and device
     profiles — so a card shows the rules Use would create, as the gallery does. */
  const library = useMemo<TemplateLibrary>(() => ({ zones, fingerprints }), [zones, fingerprints])
  const cards = useMemo(
    () => new Map(scenarios.map((s) => [s.id, scenarioCard(s, users, library)])),
    [scenarios, users, library],
  )
  const cardOf = (s: Scenario) => cards.get(s.id) ?? scenarioCard(s, users, library)

  /* Every template, Xecurify's and the tenant's own, on one page (owner, 18 Nov 2026: "by default, all the Xecurify
     templates will be shown here, and whenever the user adds custom templates … those will also be shown here"). The
     tenant's own first, newest saves where they will look; then Xecurify's. A pill on each card says whose it is. */
  const all = useMemo(
    () => [...scenarios.filter((s) => !s.provided), ...scenarios.filter((s) => s.provided)],
    [scenarios],
  )
  /* Only sources and categories something is filed under, so no option leads to nothing. */
  const hasCustom = all.some((s) => !s.provided)
  const src: Source = source === 'custom' && !hasCustom ? 'All' : source
  const cats = TEMPLATE_CATEGORIES ? CATS.filter((c) => all.some((s) => s.category === c)) : []
  const active = cat !== 'All' && cats.some((c) => c === cat) ? cat : 'All'
  const query = q.trim()
  const shown = all.filter(
    (s) => (src === 'All' || sourceOf(s) === src) && (active === 'All' || s.category === active) && matches(s, query),
  )
  const filtered = src !== 'All' || active !== 'All'
  /* The Xecurify store, open over the page. */
  const [shopping, setShopping] = useState(false)

  const clear = () => {
    setQ('')
    setCat('All')
    setSource('All')
  }

  const usable = (s: Scenario) => s.rules.length > 0
  const newOne = useNewPolicy()
  const startUse = (s: Scenario) => {
    setPreview(null)
    /* Zones and device profiles this tenant lacks are cleared from the rules,
       as on the board, so a condition reads "Choose…" instead of naming
       something that never existed here. The board's check, so both places
       refuse the same templates in the same words. */
    const build = buildTemplate(s, users, library)
    const blocked = templateBlocker(s, build)
    if (blocked) {
      store.showToast(blocked)
      return
    }
    /* A name first, like every new policy (2 Nov 2026), offered as the template's. Its rules arrive unsaved. */
    newOne.ask({
      seedName: freeName(s.name, store.policies.map((p) => p.name)),
      onCreate: (name) => {
        const id = store.addPolicy(newPolicy(blankPolicy(name, []), { rules: build.rules }))
        /* No toast when nothing was left behind: it named a thing you are looking at, as New policy does. */
        const gaps = templateGaps(build)
        if (gaps) store.showToast(`${name} created.${gaps}`)
        store.go({ name: 'board', policyId: id })
      },
    })
  }

  const card = (s: Scenario) => (
    <TemplateCard
      key={s.id}
      m={{ ...cardOf(s), source: { label: SOURCE_LABEL[sourceOf(s)], tone: s.provided ? 'info' : 'neutral' } }}
      onUse={usable(s) ? () => startUse(s) : undefined}
      onPreview={() => setPreview(s)}
      onDelete={s.provided ? undefined : () => setDeleting(s)}
    />
  )

  /* The page's one orange button: the way into the store. */
  const browse = (
    <Button variant="brand" icon={Store} onClick={() => setShopping(true)}>
      Browse Xecurify templates
    </Button>
  )

  return (
    <div className="bpage blib-templates">
      <PageHead title="Policy templates" caption="Start a policy from a set of rules." />

      {/* Search, then the one filter: whose the templates are (owner, 18 Nov 2026: "search, pills to distinguish, and a
          filter. That's it."). No empty state: Xecurify's are always here. */}
      <div className="btoolbar">
        <div className="btoolbar__left">
          <SearchBox value={q} onChange={setQ} placeholder="Search templates…" label="Search templates" />
        </div>
        <div className="btoolbar__right">
          <div className="btoolbar__filters">
            <span className={`btoolbar__filter ${src !== 'All' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by source"
                value={src}
                width="fill"
                size="md"
                options={[
                  { value: 'All', label: 'All templates' },
                  { value: 'xecurify', label: SOURCE_LABEL.xecurify },
                  ...(hasCustom ? [{ value: 'custom', label: SOURCE_LABEL.custom }] : []),
                ]}
                onChange={(v) => setSource(v as Source)}
              />
            </span>
            {/* Categories, only while they are shown at all (TEMPLATE_CATEGORIES). */}
            {cats.length > 1 && (
              <span className={`btoolbar__filter ${active !== 'All' ? 'is-set' : ''}`}>
                <Picker
                  label="Filter by category"
                  value={active}
                  width="fill"
                  size="md"
                  options={[{ value: 'All', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]}
                  onChange={setCat}
                />
              </span>
            )}
            {filtered && (
              <button type="button" className="btoolbar__clear" onClick={() => { setSource('All'); setCat('All') }}>
                Clear filters
              </button>
            )}
          </div>
          {TEMPLATE_STORE && browse}
        </div>
      </div>

      {shown.length === 0 ? (
        <NoMatches noun="templates" query={query} filtered={filtered} onClear={clear} />
      ) : (
        <div className="bgal__grid">{shown.map(card)}</div>
      )}

      {TEMPLATE_STORE && <TemplateStore open={shopping} onClose={() => setShopping(false)} />}
      {newOne.dialog}

      <TemplatePreview
        m={preview ? cardOf(preview) : null}
        onClose={() => setPreview(null)}
        onUse={preview && usable(preview) ? () => startUse(preview) : undefined}
      />

      {/* Taking one of this tenant's own templates away, through the one delete confirm every library object uses. A
          template is a copy of rules, so nothing points at it: the confirm says the policies already made from it stay
          as they are, and the toast offers Undo, which puts it back. */}
      <ConfirmDelete
        open={deleting !== null}
        name={deleting?.name ?? ''}
        noun="template"
        detail="Policies already made from it are not changed."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const gone = deleting
          if (!gone) return
          setDeleting(null)
          store.removeScenario(gone.id)
          store.showToast(`${gone.name} deleted`, { label: 'Undo', run: () => store.addScenario(gone) })
        }}
      />
    </div>
  )
}

/* The Device posture page lived here. It was replaced by Device Fingerprint:
   posture asked whether a device was healthy, which is a different question
   from whether it is the same device, and only the second one is what the
   condition in the rule model now means. */
