import { describe, expect, it } from 'vitest'

import { ROLLOUT } from '../rollout'
import drawerSrc from './policy-details-drawer.tsx?raw'
import pageSrc from './sign-in-tests/InspectPanel.tsx?raw'

/* Policy details drawer, a policy with a saved draft: Draft / Live on its Rules, Draft first, and a Draft tag in the
   head while Draft shows (owner, 25 Nov 2026). Design only. The drawer is clicked through in the browser; these pin
   the wiring the static suite can read. */
describe('Policy details drawer: Draft / Live rules', () => {
  it('is on every line (26 Nov), read once as a module constant', () => {
    expect(ROLLOUT.drawerDraftRules).toEqual(['design', 'handoff', 'tester'])
    expect(drawerSrc).toContain("const DRAFT_RULES = shows('drawerDraftRules')")
  })

  it('offers the switch only where a draft is saved, and opens on Draft', () => {
    expect(drawerSrc).toContain('const draft = DRAFT_RULES ? policy?.pendingDraft : undefined')
    expect(drawerSrc).toContain("useState<Version>('draft')")
    expect(drawerSrc).toContain('rulesAside={draft ? <Tabs<Version>')
  })

  it('draws the draft rules on the canvas and leaves the card live', () => {
    expect(drawerSrc).toContain('rulesOf={onDraft ? draft : undefined}')
    expect(pageSrc).toContain('policy={rulesOf ? { ...policy, rules: rulesOf.rules, fallback: rulesOf.fallback } : policy}')
    expect(pageSrc).toContain("aside={rulesAside ?? 'In order'}")
  })

  it("tags the head in the row's own Draft words while Draft shows", () => {
    /* Under `draftTag` (26 Nov 2026) the head says Has draft whenever a draft waits, whichever version the Rules show. */
    expect(drawerSrc).toContain('{DRAFT_TAG ? !!policy.pendingDraft && <DraftTag /> : onDraft && <ChangeState unsaved={false} draft />}')
  })
})
