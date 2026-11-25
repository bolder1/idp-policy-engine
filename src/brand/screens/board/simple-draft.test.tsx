import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from '../../data'
import { committed } from '../../policy-draft'
import { BrandProvider } from '../../store'
import { LIVE_BUTTON, NOTHING_LIVE, SAVE_AND_ACTIVATE, SAVE_ASK, SIMPLE_DRAFT_TOAST, liveConfirmBody, simpleSaveToast } from './draft-model'
import { PublishedPanel, ViewEditActions } from './view-edit'
import builderSrc from './BoardBuilder.tsx?raw'
import policiesSrc from '../Policies.tsx?raw'
import drawerSrc from '../policy-details-drawer.tsx?raw'
import inspectorSrc from './Inspector.tsx?raw'
import boardCss from './board.css?raw'
import whoSrc from './WhoEditor.tsx?raw'

/* "Simple" (rollout.ts `simpleDraft`; owner, 25 Nov 2026 evening: "save draft means save draft and save policy means
   active … make things short and simple"). The pure rules under the builder, and the two pieces it draws. The board
   itself renders Today in tests (server render), so the wiring is read from its source. */

const policy = (over: Partial<Policy> = {}): Policy => ({ ...blankPolicy('Contractor access', ['spare-trello']), status: 'draft', ...over })

describe('Simple: Save policy makes the policy active', () => {
  it('turns a draft with an application active', () => {
    const p = policy()
    expect(committed(p, p, 'activate').status).toBe('active')
  })

  it('turns an Inactive policy active too, where turn-on leaves it inactive', () => {
    const p = policy({ status: 'inactive' })
    expect(committed(p, p, 'activate').status).toBe('active')
    expect(committed(p, p, 'turn-on').status).toBe('inactive')
  })

  it('keeps an Active policy active, and leaves Monitoring as it is', () => {
    expect(committed(policy({ status: 'active' }), policy({ status: 'active' }), 'activate').status).toBe('active')
    expect(committed(policy({ status: 'monitor' }), policy({ status: 'monitor' }), 'activate').status).toBe('monitor')
  })

  it('clears a saved draft, as every save that goes live does', () => {
    const p = policy({ status: 'active', pendingDraft: { rules: [], savedAt: 'Just now', savedBy: 'You' } })
    expect(committed(p, p, 'activate').pendingDraft).toBeUndefined()
  })
})

describe('Simple: no application is saved inactive', () => {
  it('stores a draft with no application inactive, not a draft and never refused', () => {
    const p = policy({ appIds: [] })
    expect(committed(p, p, 'activate').status).toBe('inactive')
  })

  it('takes an Active policy whose draft lost its last application inactive, and the ask says so first', () => {
    const live = policy({ status: 'active' })
    expect(committed(live, { ...live, appIds: [] }, 'activate').status).toBe('inactive')
    expect(liveConfirmBody([], true)).toMatch(/becomes inactive/)
  })

  it('leaves the system policy as it is', () => {
    const sys = policy({ status: 'always-on', isSystem: true, appIds: [] })
    expect(committed(sys, sys, 'activate').status).toBe('always-on')
  })
})

describe("Simple's words", () => {
  it('says what Save policy did, and how a policy with no application becomes active', () => {
    expect(simpleSaveToast({ status: 'draft' }, { name: 'Contractor access', status: 'active', appIds: ['a'] })).toBe('Contractor access saved. It is active.')
    expect(simpleSaveToast({ status: 'inactive' }, { name: 'Contractor access', status: 'active', appIds: ['a'] })).toBe('Contractor access saved. It is active.')
    expect(simpleSaveToast({ status: 'active' }, { name: 'Contractor access', status: 'active', appIds: ['a'] })).toBe('Contractor access saved')
    expect(simpleSaveToast({ status: 'draft' }, { name: 'Contractor access', status: 'inactive', appIds: [] })).toBe('Contractor access saved. It is inactive until it has an application.')
  })

  it('never says publish', () => {
    const words = [SAVE_AND_ACTIVATE, LIVE_BUTTON, NOTHING_LIVE, SAVE_ASK, SIMPLE_DRAFT_TOAST, simpleSaveToast({ status: 'draft' }, { name: 'P', status: 'active', appIds: ['a'] })]
    for (const w of words) expect(w.toLowerCase()).not.toContain('publish')
  })
})

describe('Simple: Show live version in every edit state', () => {
  const render = (onTogglePublished?: () => void) =>
    renderToStaticMarkup(<ViewEditActions editing onEdit={() => {}} onDone={() => {}} publishedOpen={false} onTogglePublished={onTogglePublished} simple />)

  it('stands greyed, with why on hover, while nothing is live', () => {
    const html = render()
    expect(html).toContain(LIVE_BUTTON)
    expect(html).toContain(`title="${NOTHING_LIVE}"`)
    expect(html).toContain('aria-disabled="true"')
  })

  it('is a working button once there is a live version', () => {
    const html = render(() => {})
    expect(html).toContain(LIVE_BUTTON)
    expect(html).not.toContain('aria-disabled="true"')
  })

  it('is not drawn outside Simple while nothing is live, as View and edit had it', () => {
    const html = renderToStaticMarkup(<ViewEditActions editing onEdit={() => {}} onDone={() => {}} publishedOpen={false} />)
    expect(html).not.toContain('Show published policy')
  })

  it('names its panel Live version', () => {
    const html = renderToStaticMarkup(
      <BrandProvider>
        <PublishedPanel policy={policy({ status: 'active' })} title="Live version" onClose={() => {}} />
      </BrandProvider>,
    )
    expect(html).toContain('Live version')
    expect(html).not.toContain('Published policy')
  })
})

describe('Simple: no view, no status switches, no Draft chip', () => {
  it('always edits, with no Exit edit mode', () => {
    expect(builderSrc).toContain('const inEdit = viewEdit && !post && (simple || editMode || !!saved?.provisional)')
    expect(builderSrc).toContain('onDone={saved.provisional || simple ? undefined : doneEditing}')
  })

  it('offers no Make active / Make inactive in the bar', () => {
    expect(builderSrc).toMatch(/STATUS_IN_MENU && saved && !movedStatus\.review && !statusHidden && !simple/)
  })

  it('keeps Show live version greyed until the board differs from live', () => {
    expect(builderSrc).toContain('isPublished(saved) && (!simple || live)')
    expect(builderSrc).toContain('liveOff={!isPublished(saved) ? NOTHING_LIVE : NO_CHANGE_YET}')
    const html = renderToStaticMarkup(
      <ViewEditActions editing onEdit={() => {}} publishedOpen={false} simple liveOff="No changes yet" />,
    )
    expect(html).toContain('title="No changes yet"')
  })

  it('draws no Draft chip on the canvas', () => {
    expect(builderSrc).toContain('{viewEdit && !simple && saved && <DraftModeChip')
  })
})

describe('Policies: the details drawer is back', () => {
  it('opens on the name, with the status in its head and Open in builder as its one button', () => {
    expect(policiesSrc).toContain("const POLICY_DRAWER: boolean = shows('policyDrawer')")
    expect(policiesSrc).toContain('(DIRECT_OPEN && !POLICY_DRAWER) || p.movedFrom?.length')
    expect(drawerSrc).toContain('<StatusPill status={policy.status} />')
    expect(drawerSrc).toContain("variant={statusHead ? 'brand' : 'secondary'}")
    expect(drawerSrc).not.toContain('RowMenu')
  })

  it('says the status once: not again on the overview card, and hides Draft changes', () => {
    expect(drawerSrc).toContain('heroStatus={!statusHead} diffShown={!statusHead}')
  })

  it('says Continue editing where a draft waits', () => {
    expect(drawerSrc).toContain("(policy.pendingDraft || policy.status === 'draft') ? 'Continue editing' : 'Open in builder'")
  })

  it('offers Mark as template, and Make active for a policy saved as a draft', () => {
    expect(policiesSrc).toContain('template={detailsTemplate}')
    expect(policiesSrc).toContain("viewEdit && detailsPolicy.status === 'draft' && statusOptions(detailsPolicy, { monitor: false, draftActivates: true })")
  })

  it('has no status switches on the rows in Simple, and no refusal before a delete', () => {
    expect(policiesSrc).toContain('simple ? items.filter((i) => !SWITCH_IDS.has(i.id))')
    expect(policiesSrc).toContain('if (viewEdit && !simple && !policy.isSystem')
  })
})

describe('Who: the Default group, 25 Nov', () => {
  it('reads as Groups: Default beside an empty People row, not the empty state, while nobody is named', () => {
    expect(whoSrc).toContain("const DEFAULT_GROUP: boolean = shows('whoDefaultGroup')")
    expect(whoSrc).toContain('named === 0 && DEFAULT_GROUP ?')
  })

  it('leads the group list with Default, ticked while no group is, and pressing it clears the groups', () => {
    expect(whoSrc).toContain("const withDefault = DEFAULT_GROUP && kind === 'group' && subject === 'rule' && otherCount === 0")
    expect(whoSrc).toMatch(/aria-checked=\{draft\.length === 0\}[\s\S]{0,120}onClick=\{\(\) => setDraft\(\[\]\)\}/)
  })
})

describe('Simple on the board', () => {
  it('saves with its own intent and asks its own question', () => {
    expect(builderSrc).toContain("const saveIntent: CommitIntent = simple ? 'activate' : 'keep-off'")
    expect(builderSrc).toMatch(/title=\{simple \? SAVE_ASK/)
  })

  it('does not refuse a policy with no application', () => {
    expect(builderSrc).toContain('if (viewEdit && !simple && !post && !draft.isSystem && draft.appIds.length === 0)')
  })

  it('keeps Save and publish for Fix and View and edit, and says Activate policy in Simple', () => {
    expect(SAVE_AND_ACTIVATE).toBe('Activate policy')
    expect(builderSrc).toContain("const fixSaveLabel = simple ? SAVE_AND_ACTIVATE : FIX_SAVE_AND_PUBLISH && (draftModel === 'fix' || draftModel === 'view') ? SAVE_AND_PUBLISH : undefined")
  })

  it('draws Save rule in solid slate on Design, not the grey that read as disabled', () => {
    expect(inspectorSrc).toContain("const SAVE_RULE_SLATE: boolean = shows('saveRuleLook')")
    expect(boardCss).toMatch(/\.bb__inspfoot\.is-slate \.bx-btn--neutral \{\s*background: var\(--accent\);/)
  })
})
