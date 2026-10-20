/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { POST_WHEN_CONDITIONS, WHEN_CONDITIONS, apps as seedApps, card, cond, conditionName, conditionType, fallbackRule, rule, when, whenConditionsFor, type Policy, type Rule } from '../../data'
import { POST_ACTIONS, blankPostSignInPolicy, linkApp } from '../../post-sign-in'
import { BrandProvider } from '../../store'
import { ACCESS_CHECK } from '../sign-in-tests/names'
import type { Diagnostic } from '../diagnostics'
import { Board } from './Board'
import { BoardBarActions } from './BoardBar'
import { Inspector } from './Inspector'
import { patchRule } from './model'
import { POST_TONE, PostBoardContext, SIGN_IN_FINDINGS, committedPost, issueTarget, linkedAppsOf, linkedRows, postBoardOf, postFindings, saveRefused, type Refusal } from './post-board'
import { conditionIcon, groupIcon } from './tones'
import popoverSrc from '../ConditionPopover.tsx?raw'
import builderSrc from './BoardBuilder.tsx?raw'
import appsPaneSrc from './AppsPane.tsx?raw'
import brandAppSrc from '../../BrandApp.tsx?raw'
import storeSrc from '../../store.tsx?raw'
import shellSrc from '../../Shell.tsx?raw'

/* The board as the builder for a post sign-in policy (owner, 13 Oct 2026:
   "use the same sign-in builder for post sign-in as well … I don't want to
   add a new builder until needed"). Static markup only: the clicks, the
   menus (portalled) and the motion are the browser's. */

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const noop = () => {}

/* The contract the seed and the app-link page share (post-sign-in.ts). */
const POST_IDS = [
  'session-age',
  'idle-time',
  'mfa-age',
  'device-compliance',
  'device-managed',
  'device-changed',
  'ip-changed',
  'impossible-travel',
  'anonymous',
  'user-risk',
  'risk-detection',
  'records',
  'label',
  'destination',
  'amount',
  'volume',
]
const SHARED = ['zone', 'fingerprint', 'webhook', 'time', 'day', 'user-attr', 'custom-attr']

/* A post sign-in policy: a rule that denies a large export, a rule with a
   condition and no action yet, and the last row not chosen. */
function postPolicy(links: [string, string[]][] = [['salesforce', ['sf-report-export', 'ip-change']], ['workday', ['wd-export']]]): Policy {
  const p: Policy = {
    ...blankPostSignInPolicy('Data export protection'),
    id: 'ps-test',
    rules: [
      { ...rule({ name: 'Large export', when: when(card(cond('records', 'above', ['1000']))) }), action: 'deny' },
      rule({ name: 'Outside the office', when: when(card(cond('user-risk', 'is', ['High']))) }),
    ],
    fallback: fallbackRule('1fa'),
  }
  return links.reduce((q, [appId, ids]) => linkApp(q, appId, ids), p)
}

const signInPolicy = (): Policy => ({
  id: 'p-test',
  name: 'Sign-in test',
  type: 'App Access',
  appIds: ['salesforce'],
  status: 'active',
  lastModified: 'Just now',
  modifiedBy: 'You',
  audience: { everyone: true, groupIds: [], userIds: [] },
  rules: [rule({ name: 'Allow everyone', decision: '1fa' })],
  fallback: fallbackRule('deny'),
})

const resolve = (): string | undefined => undefined

function drawBoard(p: Policy, refusal: Refusal | null = null, destination?: { name: string | null; id: string | null; more: number }): string {
  const d = destination ?? { name: null, id: null, more: 0 }
  return renderToStaticMarkup(
    <BrandProvider>
      <PostBoardContext.Provider value={postBoardOf(p, refusal)}>
        <Board
          policy={p}
          destination={d.name}
          destinationAppId={d.id}
          destinationMore={d.more}
          selection={{ kind: 'none' }}
          diagnostics={[]}
          shadowed={[]}
          resolve={resolve}
          onSelect={noop}
          onInsert={noop}
          onMove={noop}
          onToggle={noop}
          onDuplicate={noop}
          onDelete={noop}
          onHover={noop}
          expandedOf={() => true}
          onToggleExpand={noop}
        />
      </PostBoardContext.Provider>
    </BrandProvider>,
  )
}

function drawPanel(p: Policy, selection: Parameters<typeof Inspector>[0]['selection'], refusal: Refusal | null = null): string {
  return renderToStaticMarkup(
    <BrandProvider>
      <PostBoardContext.Provider value={postBoardOf(p, refusal)}>
        <Inspector draft={p} selection={selection} onPatchRule={noop} onPatchFallback={noop} onClose={noop} wide onToggleWidth={noop} />
      </PostBoardContext.Provider>
    </BrandProvider>,
  )
}

const bar = (post: boolean, node?: ReactNode) =>
  text(
    renderToStaticMarkup(
      <BrandProvider>
        {node}
        <BoardBarActions
          reading={false}
          onRead={noop}
          testing={false}
          canTest={!post}
          onTest={noop}
          toPublish
          unsaved
          canDiscard
          blockers={0}
          saveBlocked={false}
          post={post}
          onSaveDraft={noop}
          onDiscard={noop}
          onSave={noop}
        />
      </BrandProvider>,
    ),
  )

describe('the If of a post sign-in policy', () => {
  it('offers the post sign-in conditions and the shared ones, never the sign-in-only ones', () => {
    const ids = whenConditionsFor(true).map((c) => c.id)
    for (const id of [...POST_IDS, ...SHARED]) expect(ids, id).toContain(id)
    for (const id of ['device-risk', 'ml-risk', 'group', 'user']) expect(ids, id).not.toContain(id)
    expect(whenConditionsFor(true)).toBe(POST_WHEN_CONDITIONS)
  })

  it('never offers a post sign-in condition on a sign-in policy', () => {
    const ids = whenConditionsFor(false).map((c) => c.id)
    for (const id of POST_IDS) expect(ids, id).not.toContain(id)
    expect(whenConditionsFor(false)).toBe(WHEN_CONDITIONS)
  })

  it('holds the contract: a number above or below with its unit, a list is or is not', () => {
    const unit: Record<string, string> = { 'session-age': 'hours', 'idle-time': 'minutes', 'mfa-age': 'minutes', records: 'records', amount: 'USD', volume: 'in 10 minutes' }
    for (const id of POST_IDS) {
      const t = conditionType(id)
      expect(t.phase, id).toBe('post')
      if (unit[id]) {
        expect(t.valueKind, id).toBe('number')
        expect(t.unit, id).toBe(unit[id])
        expect(t.operators, id).toEqual(['above', 'below'])
      } else {
        expect(t.valueKind, id).toBe('list')
        expect(t.operators, id).toEqual(['is', 'is not'])
        expect(t.options?.length, id).toBeGreaterThan(1)
      }
    }
    expect(conditionType('anonymous').options).toEqual(['Tor', 'VPN', 'Proxy', 'Data centre'])
    expect(conditionType('device-risk').phase).toBe('sign-in')
  })

  it('names the time and the day for the event on a post sign-in policy', () => {
    expect(conditionName({ typeId: 'time' }, true)).toBe('Event hours')
    expect(conditionName({ typeId: 'day' }, true)).toBe('Event days')
    expect(conditionName({ typeId: 'time' })).toBe('Sign-in hours')
  })

  it('gives every post sign-in condition a family, a place in the menu and a mark of its own', () => {
    const menu = popoverSrc.replace(/\r\n/g, '\n')
    const order = menu.slice(menu.indexOf('const MENU_ORDER = ['), menu.indexOf(']', menu.indexOf('const MENU_ORDER = [')))
    const kinds = menu.slice(menu.indexOf('const KIND_OF'), menu.indexOf('const kindOf'))
    for (const id of POST_IDS) {
      expect(order, id).toMatch(new RegExp(`'${id}'`))
      expect(kinds, id).toMatch(new RegExp(`(^|\\s)'?${id}'?: KINDS\\.`, 'm'))
      const t = conditionType(id)
      expect(conditionIcon(id, t.group), id).not.toBe(groupIcon('unknown-family'))
    }
    expect(menu).toContain('attributeOptions(version, post)')
    expect(menu).toContain('whenConditionsFor(post)')
  })
})

describe('the canvas of a post sign-in policy', () => {
  it('draws each rule’s action on its Then, and Not set where none is chosen', () => {
    const out = text(drawBoard(postPolicy(), null, { name: 'Salesforce', id: 'salesforce', more: 1 }))
    expect(out).toContain('Large export')
    expect(out).toMatch(/then Deny/)
    expect(out).toContain('Not set')
    /* No sign-in journey after an action. */
    expect(out).not.toContain('Signed in')
    expect(out).toContain('1000 records')
    expect(out).toContain('Nothing else matched')
  })

  it('opens on where events come from: the first linked application and how many more', () => {
    const out = text(drawBoard(postPolicy(), null, { name: 'Salesforce', id: 'salesforce', more: 1 }))
    expect(out).toContain('An event in Salesforce and 1 more')
    expect(out).not.toContain('A sign-in')
  })

  it('says so when no application is linked', () => {
    const out = text(drawBoard(postPolicy([])))
    expect(out).toContain('Not linked to any application')
  })

  it('marks a rule with no action as needing setup, and the card a refusal is about', () => {
    const p = postPolicy()
    const html = drawBoard(p, { at: p.rules[1].id, text: 'Choose an action for rule 2.' })
    expect(text(html)).toContain('Incomplete')
    expect(html.match(/is-refused/g)?.length).toBe(1)
  })

  it('leaves a sign-in policy’s canvas as it was', () => {
    const out = text(drawBoard(signInPolicy(), null, { name: 'Salesforce', id: 'salesforce', more: 0 }))
    expect(out).toContain('A sign-in arrives at Salesforce')
    expect(out).not.toContain('Not set')
    expect(out).toContain('Nothing else matched')
  })
})

describe('the panel of a post sign-in policy', () => {
  it('asks Then as the five actions, with what each does, and no factors', () => {
    const p = postPolicy()
    const out = text(drawPanel(p, { kind: 'rule', id: p.rules[0].id, part: 'who' }))
    for (const a of POST_ACTIONS) expect(out).toContain(a.label)
    expect(out).toContain('The device is blocked on this application until an admin unblocks it.')
    expect(out).not.toContain('First factor')
    expect(out).not.toContain('Second factor')
    /* Deny is the one chosen. */
    expect(drawPanel(p, { kind: 'rule', id: p.rules[0].id, part: 'who' })).toMatch(/aria-checked="true"[^>]*class="bb__outcard is-deny is-on"/)
  })

  it('asks the last row the same, and says why it cannot be turned on under it once refused', () => {
    const p = postPolicy()
    const out = text(drawPanel(p, { kind: 'fallback' }, { at: 'fallback', text: 'Choose an action for Nothing else matched.' }))
    for (const a of POST_ACTIONS) expect(out).toContain(a.label)
    expect(out).toContain('Choose an action for Nothing else matched.')
    /* Not on a rule it is not about. */
    expect(text(drawPanel(p, { kind: 'rule', id: p.rules[0].id, part: 'who' }, { at: 'fallback', text: 'Choose an action for Nothing else matched.' }))).not.toContain('Choose an action')
  })

  it('leaves a sign-in policy’s Then as it was', () => {
    const p = signInPolicy()
    const out = text(drawPanel(p, { kind: 'rule', id: p.rules[0].id, part: 'who' }))
    expect(out).toContain('Allow')
    expect(out).not.toContain('Terminate session')
  })
})

describe('the bar of a post sign-in policy', () => {
  it('has no Check access, and keeps the policy’s own verbs', () => {
    const post = bar(true)
    expect(post).not.toContain(ACCESS_CHECK)
    expect(post).toContain('Save draft')
    expect(post).toContain('Discard')
    expect(bar(false)).toContain(ACCESS_CHECK)
  })
})

describe('turning it on, and saving', () => {
  it('names the rule left without an action, then the last row, then nothing', () => {
    const p = postPolicy()
    expect(issueTarget(p)).toEqual({ at: p.rules[1].id, text: 'Choose an action for rule 2.' })
    const ruled = { ...p, rules: p.rules.map((r) => ({ ...r, action: r.action ?? ('allow' as const) })) }
    expect(issueTarget(ruled)).toEqual({ at: 'fallback', text: 'Choose an action for Nothing else matched.' })
    expect(issueTarget({ ...ruled, fallback: { ...ruled.fallback!, action: 'allow' } })).toBeNull()
  })

  it('refuses a save that would take a live policy back to draft, never a draft’s', () => {
    const p = postPolicy()
    expect(saveRefused({ status: 'active' }, p)?.at).toBe(p.rules[1].id)
    expect(saveRefused({ status: 'inactive' }, p)?.at).toBe(p.rules[1].id)
    expect(saveRefused({ status: 'draft' }, p)).toBeNull()
  })

  it('saves a complete draft as off, linked or not, and an unfinished one as a draft', () => {
    const done = (q: Policy): Policy => ({ ...q, rules: q.rules.map((r) => ({ ...r, action: r.action ?? ('step-up' as const) })), fallback: { ...q.fallback!, action: 'allow' } })
    const draft = postPolicy([])
    expect(committedPost(draft, done(draft)).status).toBe('inactive')
    expect(committedPost(draft, done(draft), 'turn-on').status).toBe('active')
    expect(committedPost(draft, draft).status).toBe('draft')
  })

  it('clears a new rule’s blank flag when its action is chosen', () => {
    const r: Rule = { ...rule({ name: 'New rule' }), pristine: true }
    expect(patchRule(r, { action: 'terminate' }).pristine).toBeUndefined()
  })
})

describe('the board’s own reading of a post sign-in policy', () => {
  it('keeps the structural findings and drops the ones about a sign-in', () => {
    const d = (code: string): Diagnostic => ({ id: code, code, scope: 'rule', severity: 'error', ruleIndex: 0, title: code, detail: '' }) as Diagnostic
    const kept = postFindings([d('PE110'), d('PE101'), d('PE122'), d('PE320'), d('PE141')]).map((x) => x.code)
    expect(kept).toEqual(['PE110', 'PE320'])
    expect(SIGN_IN_FINDINGS).toContain('PE104')
  })

  it('tones each action as the board tones a decision', () => {
    expect(POST_TONE).toEqual({ allow: 'allow', deny: 'deny', 'step-up': 'mfa', terminate: 'deny', 'block-device': 'deny' })
  })

  it('reads the linked applications with their events by name, in link order', () => {
    const p = postPolicy()
    expect(linkedAppsOf(p, seedApps).map((a) => a.id)).toEqual(['salesforce', 'workday'])
    const rows = linkedRows(p, seedApps)
    expect(rows[0].events).toEqual(['Report export', 'IP or location change'])
    expect(rows[1].events).toEqual(['Export worker data'])
  })

  it('is a sign-in board everywhere it is not provided', () => {
    expect(postBoardOf({ type: 'App Access' }, { at: 'x', text: 'y' })).toEqual({ on: false, refusal: null })
    expect(postBoardOf({ type: 'Session' }).on).toBe(true)
  })
})

describe('one builder for both types', () => {
  it('opens a post sign-in policy on the board, with no route of its own', () => {
    expect(brandAppSrc).not.toContain('PostSignInBuilder')
    expect(brandAppSrc).not.toContain("case 'post-sign-in'")
    expect(storeSrc).not.toContain("| { name: 'post-sign-in'")
    expect(shellSrc).not.toMatch(/'post-sign-in'/)
    const builders = import.meta.glob('../PostSignInBuilder.tsx')
    expect(Object.keys(builders)).toEqual([])
  })

  it('leaves out the sign-in tools for it: the chooser, Describe it, Check access, the checks before saving', () => {
    expect(builderSrc).toContain('!readOpen && !post ? (')
    expect(builderSrc).toContain("const canTest = features.trySignIn && draft.type === 'App Access'")
    expect(builderSrc).toContain("saved.type === 'App Access'")
    expect(builderSrc).toContain('post={post}')
  })

  it('shows its linked applications read only, each opening that application’s Post sign-in tab', () => {
    expect(appsPaneSrc).toContain("store.go({ name: 'application', appId: r.appId, tab: 'post-sign-in' })")
    expect(appsPaneSrc).toContain('Not linked to any application')
  })
})
