import { useState } from 'react'

import { PageHead } from '../Shell'
import { TemplateCard, TemplatePreview, type CardModel } from '../create/TemplateCard'
import { Button, Chip } from '../kit'
import { useBrand } from '../store'
import type { Template } from '../data'

/* -----------------------------------------------------------------------------
   The four supporting pages, unchanged in function.

   The one addition across all of them: before you save an object that other
   policies reference, the page names those policies. Today the Zones screen
   says "changes apply immediately to all referencing policies" and shows
   neither which nor what — which makes a one-character CIDR edit an org-wide
   lockout with no warning.
   -------------------------------------------------------------------------- */

/* A library template, in the shape the shared card renders. These carry no
   conditions or population estimates, so the signal reads the category and the
   ribbon segments come out even — the honest picture of what is known here. */
function templateCard(t: Template): CardModel {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    badge: t.provided ? 'Xecurify' : undefined,
    signals: [t.category],
    reviewed: t.reviewed,
    meta: `${t.author} · ${t.when}`,
    rules: t.rules,
  }
}

export function Templates() {
  const store = useBrand()
  const [cat, setCat] = useState<string>('All')
  const [preview, setPreview] = useState<Template | null>(null)
  const cats = ['All', 'Quick Protection', 'Device-based', 'Risk-based', 'Compliance']
  const mine = store.templates.filter((t) => !t.provided && (cat === 'All' || t.category === cat))
  const provided = store.templates.filter((t) => t.provided && (cat === 'All' || t.category === cat))

  const use = (t: Template) => {
    setPreview(null)
    store.showToast(`Creating a policy from ${t.name}`)
  }

  return (
    <div className="bpage">
      <PageHead
        title="Policy templates"
        caption="Reusable blueprints. They appear in the scenario picker when creating a new policy."
        actions={<Button variant="brand">New template</Button>}
      />
      <div className="btoolbar">
        <div className="btoolbar__filters">
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {/* Same two headings as the create gallery — these are the same objects,
          and calling the split different things on each screen made it read as
          two different distinctions. */}
      {mine.length > 0 && (
        <>
          <h2 className="bgal__section">
            Your templates <em>{mine.length}</em>
          </h2>
          <div className="bgal__grid">
            {mine.map((t) => (
              <TemplateCard key={t.id} m={templateCard(t)} onUse={() => use(t)} onPreview={() => setPreview(t)} />
            ))}
          </div>
        </>
      )}

      {provided.length > 0 && (
        <>
          <h2 className="bgal__section">
            Additional templates <em>{provided.length}</em>
            <span>Provided by Xecurify</span>
          </h2>
          <div className="bgal__grid">
            {provided.map((t) => (
              <TemplateCard key={t.id} m={templateCard(t)} onUse={() => use(t)} onPreview={() => setPreview(t)} />
            ))}
          </div>
        </>
      )}

      <TemplatePreview
        m={preview ? templateCard(preview) : null}
        onClose={() => setPreview(null)}
        onUse={() => preview && use(preview)}
      />
    </div>
  )
}

/* The Device posture page lived here. It was replaced by Device Fingerprint:
   posture asked whether a device was healthy, which is a different question
   from whether it is the same device, and only the second one is what the
   condition in the rule model now means. */

