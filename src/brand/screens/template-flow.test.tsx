import { renderToStaticMarkup } from 'react-dom/server'
import { TEMPLATES_MANAGED } from '../template-phase'
import { describe, expect, it } from 'vitest'

import { scenarioCard, TemplateCard } from '../create/TemplateCard'
import { TemplateStore } from '../create/TemplateStore'
import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { addedFromStore, savedOn, scenarioFromPolicy, scenarioFromStore } from '../template-from-policy'
import { TemplateFact } from './app-facts'
import { BoardBarActions } from './board/BoardBar'
import { Templates } from './Library'
import { canSaveAsTemplate, rowMenu } from './status-options'
import barToolsSrc from './board/bar-tools.ts?raw'
import boardBuilderSrc from './board/BoardBuilder.tsx?raw'
import confirmDeleteSrc from './confirm-delete.tsx?raw'
import libraryScreenSrc from './Library.tsx?raw'
import storeSrc from '../store.tsx?raw'
import templateCardSrc from '../create/TemplateCard.tsx?raw'
import templateStoreSrc from '../create/TemplateStore.tsx?raw'
import appViewSrc from './app-policy-view.tsx?raw'
import type { Policy } from '../data'

/* -----------------------------------------------------------------------------
   The template flow (owner, 27 Oct 2026: "audit the whole template flow … check all
   endpoints where we can save as a template and decide how it will be saved").

   What a saved template keeps, where a policy can be saved as one, and how a tenant's own is taken
   away. Static markup only: nothing here presses a menu, so the places that offer it are read from the
   markup of what is drawn and from the source of what only a press opens.
   -------------------------------------------------------------------------- */

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const count = (html: string, needle: string) => html.split(needle).length - 1

const t = showcaseTenant()
const boxAccess = t.policies.find((p) => p.name === 'Box access')!

describe('what a saved template keeps', () => {
  const NOW = new Date(2026, 9, 27, 12).getTime()
  const fields = { name: 'Box rules', description: 'For apps like Box.', category: 'Compliance' }
  const saved = scenarioFromPolicy(boxAccess, fields, NOW)

  it('keeps the rules, each with its decision, and the policy’s audience', () => {
    expect(saved.rules).toHaveLength(boxAccess.rules.length)
    expect(saved.rules.map((r) => r.name)).toEqual(boxAccess.rules.map((r) => r.name))
    expect(saved.rules.map((r) => r.decision)).toEqual(boxAccess.rules.map((r) => r.decision))
    expect(saved.audience).toEqual(boxAccess.audience)
    expect(saved).toMatchObject({ name: 'Box rules', description: 'For apps like Box.', category: 'Compliance', author: 'You' })
    expect(saved.provided).toBeUndefined()
  })

  it('keeps no application, no status and no “Nothing else matched”: those belong to the policy it is used on', () => {
    const keys = Object.keys(saved)
    for (const gone of ['appIds', 'status', 'fallback', 'type', 'isSystem']) expect(keys, gone).not.toContain(gone)
  })

  it('builds fresh rules every time, so a policy made from it shares nothing with the source', () => {
    const a = saved.rules[0].build()
    const b = saved.rules[0].build()
    expect(a.id).not.toBe(boxAccess.rules[0].id)
    expect(a.id).not.toBe(b.id)
  })

  it('says the day it was saved, as a date: not “Just now”, which stayed on the card for ever', () => {
    expect(savedOn(NOW)).toBe('27 Oct 2026')
    expect(saved.when).toBe('27 Oct 2026')
    expect(saved.when).not.toBe('Just now')
    /* It is the line under a tenant template's name. */
    expect(scenarioCard(saved).meta).toBe('You · 27 Oct 2026')
  })

  it('takes what a builder would open: a saved draft when there is one, else the live rules', () => {
    const edited = { ...boxAccess.rules[0], name: 'Edited rule' }
    const withDraft: Policy = { ...boxAccess, pendingDraft: { rules: [edited], fallback: boxAccess.fallback, savedAt: 'now', savedBy: 'You' } }
    expect(scenarioFromPolicy(withDraft, fields, NOW).rules.map((r) => r.name)).toEqual(['Edited rule'])
    /* The board hands over what is on its canvas with no saved draft under it, so the template is what is on screen. */
    const onCanvas: Policy = { ...withDraft, rules: [edited], pendingDraft: undefined }
    expect(scenarioFromPolicy(onCanvas, fields, NOW).rules.map((r) => r.name)).toEqual(['Edited rule'])
  })
})

describe('which policies can be saved as a template', () => {
  /* While templates are managed (template-phase.ts); on hold, no policy is offered it anywhere. */
  it('a sign-in policy with a rule can while templates are managed, and the Policies list offers it then', () => {
    expect(canSaveAsTemplate(boxAccess)).toBe(TEMPLATES_MANAGED)
    expect(rowMenu(boxAccess, { monitor: false, trySignIn: true, trail: false }).map((i) => i.id).includes('template')).toBe(TEMPLATES_MANAGED)
  })

  it('one with no rule cannot: a template of it would apply nothing', () => {
    const empty: Policy = { ...boxAccess, rules: [], pendingDraft: undefined }
    expect(canSaveAsTemplate(empty)).toBe(false)
    expect(rowMenu(empty, { monitor: false, trySignIn: true, trail: false }).map((i) => i.id)).not.toContain('template')
  })

  it('a post sign-in policy cannot: it decides no sign-in, so there is nothing to reuse', () => {
    const post: Policy = { ...boxAccess, type: 'Session' }
    expect(canSaveAsTemplate(post)).toBe(false)
  })
})

describe('where it is offered', () => {
  const bar = (over: Partial<Parameters<typeof BoardBarActions>[0]> = {}) =>
    renderToStaticMarkup(
      <BrandProvider>
        <BoardBarActions
          reading={false}
          onRead={() => {}}
          testing={false}
          canTest
          onTest={() => {}}
          toPublish
          unsaved={false}
          canDiscard={false}
          blockers={0}
          saveBlocked={false}
          onSaveDraft={() => {}}
          onDiscard={() => {}}
          onSave={() => {}}
          {...over}
        />
      </BrandProvider>,
    )

  it('the builder’s bar ends in a ⋯ when the policy can be saved as one, after Save policy', () => {
    const html = bar({ onSaveTemplate: () => {} })
    expect(html).toContain('aria-label="More for this policy"')
    expect(html.indexOf('Save policy')).toBeLessThan(html.indexOf('aria-label="More for this policy"'))
  })

  it('and has no ⋯ with nothing to offer in it, or for a post sign-in policy', () => {
    expect(bar()).not.toContain('More for this policy')
    expect(bar({ onSaveTemplate: () => {}, post: true })).not.toContain('More for this policy')
  })

  it('the board saves what is on its canvas, edits included, for a sign-in policy with a rule', () => {
    const src = code(boardBuilderSrc)
    expect(src).toContain('const onCanvas: Policy = { ...draft, pendingDraft: undefined }')
    expect(src).toContain('const templateFromCanvas = BAR_TEMPLATE && canSaveAsTemplate(onCanvas)')
    expect(src).toContain('onSaveTemplate={templateFromCanvas ? () => saveTemplate.open(onCanvas) : undefined}')
    expect(src).toContain('{saveTemplate.dialog}')
    expect(code(barToolsSrc)).toContain('export const BAR_TEMPLATE: boolean = true')
  })

  it('an application’s Policies tab has it in its ⋯, between the switches and the red Remove', () => {
    const src = code(appViewSrc)
    expect(src).toContain("label: 'Save as template', icon: LayoutTemplate")
    expect(src).toContain('items={withTemplateRow([')
    expect(src).toContain("if (id === 'template') saveTemplate.open(policy)")
    /* Remove or Delete draft is found by id, and the row goes in before it. */
    expect(src).toMatch(/findIndex\(\(i\) => i\.id === 'remove' \|\| i\.id === 'delete'\)/)
  })
})

describe('taking one of the tenant’s own templates away', () => {
  const own = scenarioFromPolicy(boxAccess, { name: 'Box rules', description: '', category: 'Uncategorized' }, 1)
  const shipped = t.scenarios.find((s) => s.provided)!

  it('is offered on a template the tenant saved, and not on one Xecurify ships', () => {
    const card = (s: typeof own, onDelete?: () => void) => renderToStaticMarkup(<TemplateCard m={scenarioCard(s)} onPreview={() => {}} onDelete={onDelete} />)
    expect(card(own, () => {})).toContain('aria-label="More for Box rules"')
    expect(card(own)).not.toContain('More for')
    expect(card(shipped)).not.toContain('More for')
    expect(code(libraryScreenSrc)).toContain('onDelete={s.provided ? undefined : () => setDeleting(s)}')
  })

  it('goes through the one delete confirm, says the policies made from it stay, and offers Undo', () => {
    const src = code(libraryScreenSrc)
    expect(src).toContain('<ConfirmDelete')
    expect(src).toContain('noun="template"')
    expect(src).toContain('Policies already made from it are not changed.')
    expect(src).toContain('store.removeScenario(gone.id)')
    expect(src).toContain("{ label: 'Undo', run: () => store.addScenario(gone) }")
  })

  it('removes only the tenant’s own, in the store', () => {
    expect(code(storeSrc)).toContain('removeScenario: (id: string) => setScenarios((all) => all.filter((s) => s.id !== id || s.provided))')
  })

  it('names the template in its confirm as a tag, under a short title, the way a policy is named', () => {
    const src = code(confirmDeleteSrc)
    expect(src).toContain("const policyNoun = noun === 'policy' || noun === 'template'")
    expect(src).toContain('title={policyNoun ? `Delete this ${noun}?` : `Delete ${name}?`}')
    expect(src).toContain("noun === 'template' ? <TemplateFact name={name} /> : <PolicyFact name={name} />")
    const out = renderToStaticMarkup(<TemplateFact name="Regulated data access" />)
    expect(out).toContain('bx-confirm__fact--template')
    expect(out).toMatch(/<span class="bx-confirm__kind"><svg[^>]*lucide-layout-template[^>]*>[\s\S]*?<\/svg>Template<\/span>/)
    expect(count(out, 'title="Regulated data access"')).toBe(1)
  })
})

/* The Xecurify store (owner, 30 Oct 2026: "move this Xecurify template to a dedicated popup … as a store … how Figma
   Community works, treat it like that"). Static markup: Add, Undo and the page filling up are checked in the browser. */
describe('the Xecurify store', () => {
  const NOW = new Date(2026, 9, 30, 12).getTime()
  const shipped = t.scenarios.filter((s) => s.provided)
  const source = { ...shipped[0], badge: 'Recommended', reviewed: { by: 'miniOrange Security', on: '2026-01' } }
  const copy = scenarioFromStore(source, NOW)
  const saved = scenarioFromPolicy(boxAccess, { name: 'Box rules', description: '', category: 'Compliance' }, NOW)

  describe('adding a template', () => {
    it('makes the tenant’s own copy, dated, that remembers where it came from', () => {
      expect(copy).toMatchObject({ author: 'You', when: '30 Oct 2026', addedFrom: source.id })
      expect(copy.provided).toBeUndefined()
      expect(copy.id).not.toBe(source.id)
      expect(scenarioFromStore(source, NOW).id).not.toBe(copy.id)
    })

    it('keeps the name, so a policy made from it takes no suffix, and the words and category', () => {
      expect(copy).toMatchObject({ name: source.name, description: source.description, category: source.category })
    })

    it('keeps the rules with their decisions, and builds fresh ones every time', () => {
      expect(copy.rules.map((r) => [r.name, r.ifText, r.decision])).toEqual(source.rules.map((r) => [r.name, r.ifText, r.decision]))
      expect(copy.rules[0].build().id).not.toBe(copy.rules[0].build().id)
    })

    it('shares nothing a later change could reach through', () => {
      expect(copy.audience).toEqual(source.audience)
      expect(copy.audience).not.toBe(source.audience)
      expect(copy.audience.groupIds).not.toBe(source.audience.groupIds)
      expect(copy.rules).not.toBe(source.rules)
      expect(copy.rules[0]).not.toBe(source.rules[0])
    })

    it('drops what was Xecurify’s to say about it: the review stamp and the badge', () => {
      expect(copy.reviewed).toBeUndefined()
      expect(copy.badge).toBeUndefined()
    })

    it('is known as added only by the tenant’s own copy, not a shipped template or one saved from a policy', () => {
      expect([...addedFromStore([...shipped, saved])]).toEqual([])
      expect([...addedFromStore([...shipped, saved, copy])]).toEqual([source.id])
    })

    it('adds once, with Undo on the toast', () => {
      const src = code(templateStoreSrc)
      expect(src).toContain('if (added.has(s.id)) return')
      expect(src).toContain('store.addScenario(scenarioFromStore(s))')
      expect(src).toContain("{ label: 'Undo', run: () => store.removeScenario(id) }")
    })
  })

  describe('the card', () => {
    const card = (over: Partial<Parameters<typeof TemplateCard>[0]> = {}) =>
      renderToStaticMarkup(<TemplateCard m={scenarioCard(source)} onPreview={() => {}} onUse={() => {}} useLabel="Add" {...over} />)

    /* One button for the eye and the action (2 Nov 2026): it opens the preview, which has the template's own Add. */
    it('offers Preview and add until the template is in Your templates', () => {
      expect(card()).toContain('aria-label="Preview and add ')
      expect(card()).not.toContain('bgcard__done')
    })

    it('then says Added beside the button, and only previews', () => {
      const html = card({ done: 'Added' })
      expect(html).toContain('bgcard__done')
      expect(html).toContain('Added')
      expect(html).not.toContain('Preview and add')
      expect(html).toContain('aria-label="Preview ')
    })

    it('says where a copy came from in its preview, and only on a copy', () => {
      expect(scenarioCard(copy).from).toBe('Xecurify templates')
      expect(scenarioCard(source).from).toBeUndefined()
      expect(scenarioCard(saved).from).toBeUndefined()
      expect(code(templateCardSrc)).toContain('<dt>From</dt>')
    })
  })

  describe('the popup', () => {
    const open = () => renderToStaticMarkup(<BrandProvider><TemplateStore open onClose={() => {}} /></BrandProvider>)

    it('draws nothing while closed', () => {
      expect(renderToStaticMarkup(<BrandProvider><TemplateStore open={false} onClose={() => {}} /></BrandProvider>)).toBe('')
    })

    it('is a dialog named for the store, with who it is by, a search and a way out', () => {
      const html = open()
      expect(html).toContain('role="dialog"')
      expect(html).toContain('aria-modal="true"')
      expect(html).toContain('aria-label="Xecurify templates"')
      expect(html).toContain('By miniOrange')
      expect(html).toContain('aria-label="Search Xecurify templates"')
      expect(html).toContain('aria-label="Close Xecurify templates"')
    })

    it('narrows by category down its rail, with no counts, and only categories something is filed under', () => {
      const html = open()
      const rail = [...html.matchAll(/class="bmarket__cat[^"]*"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1])
      const filed = new Set(shipped.map((s) => s.category))
      expect(rail[0]).toBe('All templates')
      expect(rail.slice(1).sort()).toEqual([...filed].sort())
      expect(html).not.toContain('Uncategorized')
    })

    it('lists every shipped template with Preview and add, and never Use', () => {
      const html = open()
      expect(count(html, 'class="bgcard ')).toBe(shipped.length)
      expect(count(html, 'aria-label="Preview and add ')).toBe(shipped.length)
      expect(html).not.toContain('aria-label="Preview and use ')
    })
  })

  describe('the Templates page', () => {
    const page = () => renderToStaticMarkup(<BrandProvider><Templates /></BrandProvider>)

    it('with none of the tenant’s own, is one empty state with two ways to get one, and no Xecurify cards', () => {
      const html = page()
      expect(html).toContain('No templates yet')
      expect(html).toContain('Browse Xecurify templates')
      expect(html).toContain('Go to policies')
      expect(html).not.toContain('class="bgcard ')
      expect(html).not.toContain('btoolbar')
      expect(html).not.toContain('bgal__section')
    })

    it('has one orange button, the way into the store, before the other', () => {
      const html = page()
      expect(count(html, 'bx-btn--brand')).toBe(1)
      expect(html.indexOf('bx-btn--brand')).toBeLessThan(html.indexOf('Browse Xecurify templates'))
      expect(html.indexOf('Browse Xecurify templates')).toBeLessThan(html.indexOf('Go to policies'))
    })

    it('lists only the tenant’s own, and ends its toolbar in the way into the store', () => {
      const src = code(libraryScreenSrc)
      expect(src).toContain('scenarios.filter((s) => !s.provided)')
      expect(src).toContain('const shown = own.filter(')
      expect(src).toContain('<TemplateStore open={shopping}')
      expect(src).not.toContain('bgal__none')
    })
  })
})
