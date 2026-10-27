import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { scenarioCard, TemplateCard } from '../create/TemplateCard'
import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { savedOn, scenarioFromPolicy } from '../template-from-policy'
import { TemplateFact } from './app-facts'
import { BoardBarActions } from './board/BoardBar'
import { canSaveAsTemplate, rowMenu } from './status-options'
import barToolsSrc from './board/bar-tools.ts?raw'
import boardBuilderSrc from './board/BoardBuilder.tsx?raw'
import confirmDeleteSrc from './confirm-delete.tsx?raw'
import libraryScreenSrc from './Library.tsx?raw'
import storeSrc from '../store.tsx?raw'
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
  it('a sign-in policy with a rule can, and the Policies list offers it', () => {
    expect(canSaveAsTemplate(boxAccess)).toBe(true)
    expect(rowMenu(boxAccess, { monitor: false, trySignIn: true, trail: false }).map((i) => i.id)).toContain('template')
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
