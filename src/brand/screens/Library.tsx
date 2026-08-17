import { useState } from 'react'

import { PageHead } from '../Shell'
import { TemplateCard, TemplatePreview, type CardModel } from '../create/TemplateCard'
import { Badge, Button, Callout, Card, Chip } from '../kit'
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

/* --- Device posture -------------------------------------------------------- */

export function DevicePosturePage() {
  const store = useBrand()
  const [sel, setSel] = useState(store.postures[0].id)
  const p = store.postures.find((x) => x.id === sel)!

  return (
    <div className="bpage">
      <PageHead
        title="Device posture"
        caption="Named device health requirements. Define once, reference across policies."
        actions={<Button variant="brand">New posture policy</Button>}
      />
      <div className="bmaster">
        <aside className="bmaster__list">
          {store.postures.map((x) => (
            <button key={x.id} type="button" className={`bmaster__item ${sel === x.id ? 'is-on' : ''}`} onClick={() => setSel(x.id)}>
              <span>{x.name}</span>
              <Badge tone="neutral">{x.strictness}</Badge>
            </button>
          ))}
        </aside>

        <Card title={p.name} caption={`Referenced by ${p.usedIn} policies`} actions={<Badge tone="neutral">{p.strictness}</Badge>}>
          <Callout tone="notice" title="Editing this affects every policy that references it">
            {p.usedIn} polic{p.usedIn === 1 ? 'y' : 'ies'} evaluate this posture on every sign-in.
          </Callout>

          <div className="bposture">
            <div className="bposture__row">
              <span className="u-label">Platforms</span>
              <div className="bposture__chips">
                {['iOS', 'Android', 'Windows', 'macOS', 'ChromeOS', 'Linux'].map((pl) => (
                  <Chip key={pl} active={p.platforms.includes(pl)}>
                    {pl}
                  </Chip>
                ))}
              </div>
            </div>
            {p.requirements.map((r) => (
              <div key={r.label} className="bposture__row">
                <span className="u-label">{r.label}</span>
                <span className="bposture__val">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

