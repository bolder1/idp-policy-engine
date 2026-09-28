/// <reference types="vite/client" />
import { useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { differsFromLive, hasUnsavedChanges, openForEditing } from '../../policy-draft'
import { BrandProvider, useBrand } from '../../store'
import { SignInPanel } from '../board/SignInPanel'
import { useTrySignIn } from '../board/use-try-sign-in'
import { breakInRows, groupsById } from '../break-in-model'
import { runBreakIn } from '../gauntlet'
import type { SimEnv } from '../simulate'
import { useSimEnv } from '../sim-env'
import { BoardTestViews } from './BoardTestViews'
import { boardPagesAllowed, boardViewsKept, pageShown, type BoardTestPage, type BoardViewsKept } from './board-views'
import { TestingSessionProvider } from './session'
import tryCss from '../board/try-sign-in.css?raw'
import testingCss from './testing.css?raw'

/* Version 3: Policy testing inside the board's test panel, drawn without a
   browser on the showcase tenant, through the hook and the panel the board
   mounts. board-views.test.ts pins the rules; this is the join between them
   and what the panel prints. The browser pass checks the rest — the 448 px
   columns, the push and Back, a fix landing on the chain. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}
const HRMS = 'sc-hrms-office'

interface Board {
  /** The policy on the board; HRMS unless named. */
  id?: string
  /** The policy as stored, where a test needs another status or a saved draft. */
  stored?: (p: Policy) => Policy
  /** The board's draft, from the stored policy; the stored policy itself unless given. */
  edit?: (p: Policy) => Policy
  /** What the pages kept from before a rule took the panel's column. */
  keep?: (draft: Policy, env: SimEnv) => BoardViewsKept
}

function Panel({ page, board }: { page: BoardTestPage; board: Board }) {
  const store = useBrand()
  const env = useSimEnv()
  const [saved] = useState(() => {
    const p = store.policyById(board.id ?? HRMS)!
    return board.stored ? board.stored(p) : p
  })
  /* One draft for the life of the panel, as the board's history holds one. */
  const [draft] = useState(() => (board.edit ? board.edit(saved) : saved))
  const [kept] = useState(() => (board.keep ? board.keep(draft, env) : boardViewsKept()))
  const t = useTrySignIn({ on: true, saved, draft, env })
  if (!t) return null
  /* As the board works it out: an edition with the Break-in test, on a policy it runs on. */
  const can = boardPagesAllowed(true, true, draft)
  const shown = pageShown(page, can)
  return (
    <SignInPanel
      t={t}
      draft={draft}
      headingRef={noop}
      swap={false}
      onClose={noop}
      onChip={noop}
      views={{
        page: shown,
        onPage: noop,
        body:
          shown === 'try' ? null : (
            <BoardTestViews
              page={shown}
              onPage={noop}
              t={t}
              saved={saved}
              draft={draft}
              breakIn={can.breakIn}
              kept={kept}
              onApplyFix={noop}
              onOpenRule={noop}
              onToTry={noop}
            />
          ),
      }}
    />
  )
}

const draw = (page: BoardTestPage, board: Board | ((p: Policy) => Policy) = {}) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Panel page={page} board={typeof board === 'function' ? { edit: board } : board} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

const tabs = (out: string) => [...out.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]))
const selected = (out: string) => text(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>([\s\S]*?)<\/button>/.exec(out)?.[1] ?? '')
const headers = (out: string) => [...out.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => text(m[1]))
const rulesOff = (p: Policy): Policy => ({ ...p, rules: p.rules.map((r) => ({ ...r, enabled: false })) })

describe('the panel’s views', () => {
  const out = draw('try')

  it('names three views as grey pill tabs, with no counts and no Sample sign-ins', () => {
    expect(out).toContain('aria-label="Board test"')
    expect(out).not.toContain('bx-tabs--line')
    expect(tabs(out)).toEqual(['Try a sign-in', 'Check a person', 'Saved sign-ins'])
    expect(selected(out)).toBe('Try a sign-in')
  })

  it('keeps the heading and the run’s buttons above the tabs, and Try as the first page', () => {
    expect(out.indexOf('Try a sign-in</h2>')).toBeLessThan(out.indexOf('role="tablist"'))
    expect(out).toContain('role="tabpanel" aria-label="Try a sign-in"')
    /* HRMS opens Inactive on the showcase (Phase 4). */
    expect(text(out)).toContain('What they see · Stored version')
    /* The page and the slider are not where Saved sign-ins are in this version. */
    expect(out).not.toMatch(/bx-btn--link[^>]*>(?:<svg[\s\S]*?<\/svg>)?Saved sign-ins/)
  })
})

describe('Check a person in the panel', () => {
  const out = draw('person')

  it('is the tab it says, over three columns at 448 px, the rule in a tip', () => {
    expect(selected(out)).toBe('Check a person')
    expect(headers(out)).toEqual(['Application', 'Policy', 'Decision'])
    expect(out).toContain('aria-label="Rule on HRMS"')
    expect(out).toContain('class="tst is-panel"')
  })

  it('checks the person the board is trying, on every application', () => {
    const t = text(out)
    expect(t).toContain('HRMS HRMS access from corporate offices')
    expect(t).toContain('Allow with 2FA')
    expect(t).toContain('Global Default Policy Allow on 1 factor')
    /* The board has no Assume on; nothing is assumed here. */
    expect(t).not.toContain('Assuming')
  })

  it('names the version it judges by once the board holds edits', () => {
    const edited = draw('person', rulesOff)
    expect(text(edited)).toContain('Your edits')
    expect(edited).toContain('aria-label="About your edits"')
    /* HRMS with its rule off: the last row denies Kavya, and today's answer —
       the Global Default's, while HRMS is off — says so under the cell. */
    expect(text(edited)).toContain('Deny Today: Allow on 1 factor')
  })
})

describe('Saved sign-ins in the panel', () => {
  const out = draw('saved')

  it('opens on this policy’s applications, the level and the rest in the tip', () => {
    expect(selected(out)).toBe('Saved sign-ins')
    expect(headers(out)).toEqual(['Sign-in', 'Expected', 'Result', 'Actions'])
    const t = text(out)
    expect(t).toContain('Show This policy’s apps')
    for (const name of ['Kavya Menon in the office', 'Neha Kapoor at home', 'Aisha Khan on HRMS', 'Ravi Menon on HRMS']) expect(t).toContain(name)
    expect(t).not.toContain('Devon Rao on Android 12')
    expect((t.match(/\bPass\b/g) ?? []).length).toBe(4)
  })

  it('offers the Break-in test at the end of the bar', () => {
    expect(out).toMatch(/bx-btn--neutral[^"]*"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Break-in test/)
  })

  it('pushes the Break-in test over itself, on this board, with Back naming Saved sign-ins', () => {
    const pushed = draw('break-in')
    expect(selected(pushed)).toBe('Saved sign-ins')
    const t = text(pushed)
    expect(t).toMatch(/^Try a sign-in .*Saved sign-ins Break-in test /)
    expect(t).toContain('HRMS access from corporate offices · Stored version')
    /* No policy to choose: the board's draft is the one tested. */
    expect(pushed).not.toContain('Policy to test')
    expect(t).toContain('Got through')
    expect(pushed).not.toContain('Search saved sign-ins')
  })

  it('opens on a titled empty list where nothing signs in to this policy’s apps', () => {
    const dev = draw('saved', { id: 'sc-dev-tools' })
    const t = text(dev)
    expect(t).toContain('No saved sign-ins for this policy’s apps')
    expect(t).toContain('Show all')
    /* A title and an action: no sentence, and no filter the admin never set. */
    expect(t).not.toContain('match these filters')
    expect(dev).not.toContain('bempty__blurb')
  })

  it('offers no Break-in test on the Global Default, and a route to it lands on the list', () => {
    const global: Board = { id: 'global-default' }
    expect(draw('saved', global)).not.toMatch(/>Break-in test</)
    const routed = draw('break-in', global)
    expect(selected(routed)).toBe('Saved sign-ins')
    expect(text(routed)).not.toContain('Got through')
  })
})

/* The Break-in test's caption names the version as the panel's right-hand
   column does — the version beside Saved sign-ins' bar, Try's column — so
   one panel never calls the same rules two things. Measured against live,
   not against the last save (spec D §3.6), through the builder's own checks
   rather than by object identity. */
describe('the version the Break-in test names', () => {
  const withDraft = (p: Policy): Policy => ({
    ...p,
    pendingDraft: { rules: rulesOff(p).rules, fallback: p.fallback, savedAt: 'Just now', savedBy: 'You' },
  })

  it('is Your edits when the board differs from live', () => {
    expect(text(draw('break-in', rulesOff))).toContain('HRMS access from corporate offices · Your edits')
  })

  it('is Your edits for a saved draft opened on the board, as the bar and Try say', () => {
    const board: Board = { stored: withDraft, edit: openForEditing }
    /* Nothing unsaved since the draft was saved — the builder's `unsaved` is
       false — and still not live. */
    const stored = withDraft(showcaseTenant().policies.find((p) => p.id === HRMS)!)
    expect(hasUnsavedChanges(stored, openForEditing(stored))).toBe(false)
    expect(differsFromLive(stored, openForEditing(stored))).toBe(true)
    const pushed = text(draw('break-in', board))
    expect(pushed).toContain('HRMS access from corporate offices · Your edits')
    expect(pushed).not.toContain('Saved draft')
    expect(text(draw('saved', board))).toMatch(/Your edits Break-in test/)
    expect(text(draw('try', board))).toContain('What they see · Your edits')
  })

  it('is Stored version for a monitoring policy, as the bar and Try say', () => {
    const board: Board = { stored: (p) => ({ ...p, status: 'monitor' }) }
    const pushed = text(draw('break-in', board))
    expect(pushed).toContain('HRMS access from corporate offices · Stored version')
    expect(pushed).not.toContain('· Monitoring')
    expect(text(draw('saved', board))).toMatch(/Stored version Break-in test/)
    expect(text(draw('try', board))).toContain('What they see · Stored version')
  })

  it('is Live for a live policy with nothing changed, with no version beside the list', () => {
    const compliance: Board = { id: 'sc-device-compliance' }
    expect(draw('saved', compliance)).not.toContain('class="tst__version"')
    expect(text(draw('break-in', compliance))).toContain('Device compliance for Outlook and Dropbox · Live')
    expect(text(draw('try', compliance))).toContain('What they see · Live')
  })

  it('is Stored version for a policy that is off, as HRMS opens on the showcase', () => {
    expect(text(draw('saved'))).toMatch(/Stored version Break-in test/)
  })
})

describe('coming back from a rule opened on the panel', () => {
  const savedKept = (policyId: string) => (): BoardViewsKept => ({
    ...boardViewsKept(),
    saved: { current: { policyId, query: 'Kavya', level: 'all', show: 'all' } },
  })

  it('finds Saved sign-ins as it was left: the search and the filters', () => {
    const back = draw('saved', { keep: savedKept(HRMS) })
    expect(back).toContain('value="Kavya"')
    const t = text(back)
    expect(t).toContain('Show All')
    expect(t).toContain('Kavya Menon in the office')
    expect(t).not.toContain('Neha Kapoor at home')
  })

  it('keeps nothing from another policy’s board', () => {
    const back = draw('saved', { keep: savedKept('sc-dev-tools') })
    expect(back).not.toContain('value="Kavya"')
    expect(text(back)).toContain('Show This policy’s apps')
  })

  it('is not the Break-in test’s first run: nothing fades in again, and the open row is still open', () => {
    expect(draw('break-in')).toContain('opacity:0')
    const keep = (draft: Policy, env: SimEnv): BoardViewsKept => {
      const run = runBreakIn(draft, env)
      const rows = breakInRows(run, draft)
      return { ...boardViewsKept(), breakIn: { current: { policyId: draft.id, groups: groupsById(rows), counts: run.counts, filter: null, openId: rows[0].id } } }
    }
    const back = draw('break-in', { keep })
    expect(back).not.toContain('opacity:0')
    expect((back.match(/aria-expanded="true"/g) ?? []).length).toBe(1)
    /* The same run as before: no count and no row outlined as moved. */
    expect(back).not.toContain('bbi__flash')
  })
})

describe('the stylesheets', () => {
  it('give the panel’s tabs and views no transform or transition, and every colour from a variable', () => {
    const rules = (css: string, from: string) => css.slice(css.indexOf(from)).replace(/\/\*[\s\S]*?\*\//g, '')
    const panel = rules(testingCss, 'Version 3: the views in the board')
    const tviews = rules(tryCss, 'Version 3’s views')
    for (const css of [panel, tviews.slice(0, tviews.indexOf('.bb__tbody'))]) {
      expect(css).not.toMatch(/\b(transform|translate|transition)\s*:/)
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    }
  })
})
