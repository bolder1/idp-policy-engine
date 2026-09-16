import { useState } from 'react'
import { useMemo } from 'react'
import { LayoutTemplate } from 'lucide-react'

import { PageHead } from '../Shell'
import { NewPolicyDialog } from '../create/NewPolicyDialog'
import { TemplateCard, TemplatePreview, scenarioCard } from '../create/TemplateCard'
import { EmptyState, NoMatches } from '../empty'
import { Button, SearchBox } from '../kit'
import { Picker } from '../picker'
import { freeName } from '../policy-name'
import { useBrand } from '../store'
import type { Scenario } from '../data'
import { buildTemplate, templateBlocker, type TemplateLibrary } from './board/apply-template'

/* -----------------------------------------------------------------------------
   Policy templates.

   The same templates the board's gallery offers — `store.scenarios`, the shipped
   ones and every template this tenant saved from a policy — under the same two
   headings. The page used to read a separate static list that nothing could
   add to, so a template saved from the Policies list never appeared here, and
   "Your templates" showed three seeded cards in every tenant.

   Use template names the new policy and creates it with the template's rules,
   then opens it on the board. A template whose rules apply to nobody, or that
   has no rules, cannot be used, so it offers no Use.
   -------------------------------------------------------------------------- */

const CATS: Scenario['category'][] = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized']

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
  const [preview, setPreview] = useState<Scenario | null>(null)
  const [using, setUsing] = useState<Scenario | null>(null)

  /* Built the way Use builds them — this tenant's people, zones and device
     profiles — so a card shows the rules Use would create, as the gallery does. */
  const library = useMemo<TemplateLibrary>(() => ({ zones, fingerprints }), [zones, fingerprints])
  const cards = useMemo(
    () => new Map(scenarios.map((s) => [s.id, scenarioCard(s, users, library)])),
    [scenarios, users, library],
  )
  const cardOf = (s: Scenario) => cards.get(s.id) ?? scenarioCard(s, users, library)

  /* Only categories something is filed under, so no option leads to nothing. */
  const cats = CATS.filter((c) => scenarios.some((s) => s.category === c))
  const active = cat !== 'All' && cats.some((c) => c === cat) ? cat : 'All'
  const query = q.trim()
  const shown = scenarios.filter((s) => (active === 'All' || s.category === active) && matches(s, query))
  const mine = shown.filter((s) => !s.provided)
  const shipped = shown.filter((s) => s.provided)
  const filtering = active !== 'All' || query.length > 0

  const clear = () => {
    setQ('')
    setCat('All')
  }

  const usable = (s: Scenario) => s.rules.length > 0
  const startUse = (s: Scenario) => {
    setPreview(null)
    /* The board's check, so both places refuse the same templates in the same words. */
    const blocked = templateBlocker(s, buildTemplate(s, users, library))
    if (blocked) {
      store.showToast(blocked)
      return
    }
    setUsing(s)
  }

  const toPolicies = () => store.go({ name: 'policies' })

  const card = (s: Scenario) => (
    <TemplateCard
      key={s.id}
      m={cardOf(s)}
      onUse={usable(s) ? () => startUse(s) : undefined}
      onPreview={() => setPreview(s)}
    />
  )

  return (
    <div className="bpage blib-templates">
      <PageHead title="Policy templates" caption="Start a policy from a set of rules." />

      {scenarios.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          blurb="Save a policy as a template from its menu on the Policies page."
          action={
            <Button variant="brand" onClick={toPolicies}>
              Go to policies
            </Button>
          }
        />
      ) : (
        <>
          <div className="btoolbar">
            <div className="btoolbar__left">
              <SearchBox value={q} onChange={setQ} placeholder="Search templates…" label="Search templates" />
            </div>
            <div className="btoolbar__right">
              <div className="btoolbar__filters">
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
                {active !== 'All' && (
                  <button type="button" className="btoolbar__clear" onClick={() => setCat('All')}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {mine.length + shipped.length === 0 ? (
            <NoMatches noun="templates" query={query} filtered={active !== 'All'} onClear={clear} />
          ) : (
            <>
              {/* Your templates stays on screen while it is empty and nothing is
                  filtered, to say where one comes from. Under a search or a
                  filter an empty shelf is just left out. */}
              {(mine.length > 0 || !filtering) && (
                <>
                  <h2 className="bgal__section">Your templates</h2>
                  {mine.length > 0 ? (
                    <div className="bgal__grid">{mine.map(card)}</div>
                  ) : (
                    <EmptyState
                      compact
                      icon={LayoutTemplate}
                      title="No templates of your own"
                      blurb="Save a policy as a template from its menu on the Policies page."
                      action={<Button onClick={toPolicies}>Go to policies</Button>}
                    />
                  )}
                </>
              )}

              {shipped.length > 0 && (
                <>
                  <h2 className="bgal__section">Xecurify templates</h2>
                  <div className="bgal__grid">{shipped.map(card)}</div>
                </>
              )}
            </>
          )}
        </>
      )}

      <TemplatePreview
        m={preview ? cardOf(preview) : null}
        onClose={() => setPreview(null)}
        onUse={preview && usable(preview) ? () => startUse(preview) : undefined}
      />

      {/* Named like any new policy. The name offered is the template's, numbered
          when a policy already has it. */}
      <NewPolicyDialog
        open={using !== null}
        onClose={() => setUsing(null)}
        seedName={using ? freeName(using.name, store.policies.map((p) => p.name)) : ''}
        onCreate={(policy) => {
          if (!using) return
          /* Zones and device profiles this tenant lacks are cleared from the
             rules, as on the board, so a condition reads "Choose…" instead of
             naming something that never existed here. */
          const { rules, dropped, needs } = buildTemplate(using, users, library)
          const id = store.addPolicy({ ...policy, rules })
          const d = dropped.length
          const left = d > 0 ? ` ${d === 1 ? '1 rule' : `${d} rules`} left out.` : ''
          const missing = needs.length > 0 ? ' Choose the missing zone or device profile.' : ''
          store.showToast(`${policy.name} created${left || missing ? '.' : ''}${left}${missing}`)
          setUsing(null)
          store.go({ name: 'board', policyId: id })
        }}
      />
    </div>
  )
}

/* The Device posture page lived here. It was replaced by Device Fingerprint:
   posture asked whether a device was healthy, which is a different question
   from whether it is the same device, and only the second one is what the
   condition in the rule model now means. */
