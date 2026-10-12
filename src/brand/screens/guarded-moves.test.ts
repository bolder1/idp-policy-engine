/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import type { BrandScreen } from '../store'
import { checkAccessFrom, followLink, loadAndGo, type Mover } from './guarded-moves'
import usersTabSrc from './app-people-tabs.tsx?raw'
import drawerSrc from './UserDrawer.tsx?raw'
import detailsSrc from './policy-details-drawer.tsx?raw'

/* Moves that change something on the way out wait for the leave guard
   (review 10 Oct 2026, #9 and #10). The store is a stand-in: with unsaved
   work it holds the move for the dialog, as store.tsx `requestLeave` does,
   and the test answers it — Keep editing drops it, Save or Discard runs it. */

function stage(unsaved: boolean) {
  const log: string[] = []
  let held: (() => void) | null = null
  let asked = 0
  const store: Mover = {
    requestLeave: (run) => {
      asked += 1
      if (unsaved) held = run
      else run()
    },
    go: (s: BrandScreen) => log.push(`go ${s.name}`),
  }
  return {
    store,
    log,
    asked: () => asked,
    keepEditing: () => {
      held = null
    },
    discard: () => {
      const run = held
      held = null
      run?.()
    },
  }
}

describe('Check access, from a page with unsaved work', () => {
  it('loads nothing, closes nothing and moves nowhere on Keep editing', () => {
    const s = stage(true)
    checkAccessFrom(s.store, () => s.log.push('load'), () => s.log.push('close'))
    s.keepEditing()
    expect(s.log).toEqual([])
  })

  it('closes the drawer, loads the person, then opens Access checks once the move goes ahead', () => {
    const s = stage(true)
    checkAccessFrom(s.store, () => s.log.push('load'), () => s.log.push('close'))
    expect(s.log).toEqual([])
    s.discard()
    expect(s.log).toEqual(['close', 'load', 'go sign-in-tests'])
  })

  it('goes at once when nothing would be lost', () => {
    const s = stage(false)
    checkAccessFrom(s.store, () => s.log.push('load'))
    expect(s.log).toEqual(['load', 'go sign-in-tests'])
  })
})

/* Policy details' past sign-in, on an application's page: it loaded the
   board's form before the guard answered, so Keep editing left it replaced. */
describe('a past sign-in tried in the board, from a page with unsaved work', () => {
  const board: BrandScreen = { name: 'board', policyId: 'sc-slack-everyone', open: 'try', from: { appId: 'slack' } }

  it('loads nothing and moves nowhere on Keep editing', () => {
    const s = stage(true)
    loadAndGo(s.store, () => s.log.push('load'), board)
    s.keepEditing()
    expect(s.log).toEqual([])
  })

  it('loads the board’s form, then opens the board, once the move goes ahead', () => {
    const s = stage(true)
    loadAndGo(s.store, () => s.log.push('load'), board)
    s.discard()
    expect(s.log).toEqual(['load', 'go board'])
  })
})

describe('a user drawer’s link', () => {
  it('leaves the drawer open on Keep editing', () => {
    const s = stage(true)
    followLink(s.store, { name: 'groups', groupId: 'engineering', tab: 'assignment' }, () => s.log.push('close'))
    s.keepEditing()
    expect(s.log).toEqual([])
    s.discard()
    expect(s.log).toEqual([])
  })

  it('closes the drawer and moves once the move goes ahead', () => {
    const s = stage(true)
    followLink(s.store, { name: 'application', appId: 'zoom', tab: 'users' }, () => s.log.push('close'), 'slack')
    s.discard()
    expect(s.log).toEqual(['close', 'go application'])
  })

  /* On Slack's Users tab with Basic unsaved, the drawer's "Slack" asked to
     leave the page it was on, and Save or Discard remounted it. */
  it('to the application it is open on, only closes: no leave asked, no move', () => {
    const s = stage(true)
    followLink(s.store, { name: 'application', appId: 'slack', tab: 'users' }, () => s.log.push('close'), 'slack')
    expect(s.asked()).toBe(0)
    expect(s.log).toEqual(['close'])
  })
})

describe('the screens use them', () => {
  it('the Users tab’s Check access, and the drawer it opens knows its application', () => {
    expect(usersTabSrc).toContain('checkAccessFrom(store, () => session.load(formOf({ appId, personId }, store.zones)))')
    expect(usersTabSrc).toContain('appOpen={appId}')
  })

  it('the drawer’s Check access and links', () => {
    expect(drawerSrc).toContain('checkAccessFrom(store, () => session.load(formOf({ personId: shown }, store.zones)), onClose)')
    expect(drawerSrc).toContain('followLink(store, to, onClose, appOpen)')
    /* No move of its own outside the guarded run. */
    expect(drawerSrc).not.toMatch(/store\.go\(/)
  })

  it('policy details’ past sign-in loads inside the guarded move', () => {
    expect(detailsSrc).toContain("loadAndGo(store, () => session.loadBoard(policyId, form), { name: 'board', policyId, open: 'try', ...from })")
    /* The load is nowhere else: not run ahead of the guard's answer. */
    expect(detailsSrc.match(/session\.loadBoard\(/g)).toHaveLength(1)
  })
})
