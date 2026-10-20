/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandProvider } from '../store'
import { showcaseTenant } from '../fixtures'
import { isPostSignIn } from '../post-sign-in'
import { Policies } from './Policies'
import { DENIAL_REASONS } from './sign-in-tests/phase'
import policiesSrc from './Policies.tsx?raw'
import typesCss from './policies-types.css?raw'

/* -----------------------------------------------------------------------------
   The Policies page split into its two types (owner, 13 Oct 2026; spec
   docs/specs/POST-SIGN-IN-POLICIES.md, Screens 1): line tabs Sign-in and Post
   sign-in under the head, with no counts; the Sign-in tab is the page it was,
   reading sign-in policies only; the Post sign-in tab lists post sign-in
   policies, with New policy alone in its bar.

   Static markup, so nothing is pressed: what a press does is read from the
   source, as the other Policies tests do. The tenant is the showcase one with
   two post sign-in policies of this test's own added, so the test does not
   lean on whichever the seed carries — and, with `seed.post` at 'none', with
   every post sign-in policy taken out, for the empty tab.
   -------------------------------------------------------------------------- */

const seed = vi.hoisted(() => ({ post: 'extra' as 'extra' | 'none' }))

vi.mock('../fixtures', async (importOriginal) => {
  const real = await importOriginal<typeof import('../fixtures')>()
  const ps = await import('../post-sign-in')
  /* One live and complete, linked to Salesforce from outside; one draft linked to nothing. */
  const blank = ps.linkApp(ps.blankPostSignInPolicy('Zz test post sign-in on'), 'salesforce', ['sf-report-export'])
  const on = { ...blank, fallback: { ...blank.fallback!, action: 'allow' as const } }
  const extra = [
    { ...on, id: 'ps-test-on', status: 'active' as const },
    { ...ps.blankPostSignInPolicy('Zz test post sign-in draft'), id: 'ps-test-draft' },
  ]
  const shape = (t: ReturnType<typeof real.showcaseTenant>) => ({
    ...t,
    policies: seed.post === 'none' ? t.policies.filter((p) => !ps.isPostSignIn(p)) : [...t.policies, ...extra],
  })
  return { ...real, showcaseTenant: () => shape(real.showcaseTenant()), tenantAt: (d: Parameters<typeof real.tenantAt>[0]) => shape(real.tenantAt(d)) }
})

/* The tab the page opens on is the one stored, so the Post sign-in tab is
   drawn by storing it — the way a viewer coming back from its builder gets it.
   Unstubbed straight after, as some renders run while the suite is collected. */
function render(tab?: 'post-sign-in') {
  if (tab) vi.stubGlobal('localStorage', { getItem: () => tab, setItem: () => {} })
  try {
    return renderToStaticMarkup(
      <BrandProvider>
        <Policies />
      </BrandProvider>,
    )
  } finally {
    if (tab) vi.unstubAllGlobals()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  seed.post = 'extra'
})

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const tabsOf = (html: string) => [...html.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]))
const selected = (html: string) => text(html.match(/role="tab"[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/)?.[1] ?? '')
/** The policy names in the table, as its name buttons say them. */
const namesIn = (html: string) => [...html.matchAll(/class="btable__link"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]))
const headsOf = (html: string) => [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]).replace(/[↑↓↕]/g, '').trim())
function barRight(html: string) {
  const at = html.indexOf('class="bbar__right"')
  expect(at).toBeGreaterThan(-1)
  const cluster = html.slice(at, html.indexOf('</div></div>', at))
  return [...cluster.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1], label: text(m[2]) }))
}
/* ui-copy.test.ts's own pattern: login, log in, logged-in and the rest. */
const LOGIN = /\blog(?:s|ged|ging)?(?:-|\s)?(?:(?:me|you|him|her|them|us)\s)?ins?\b/i

const tenant = () => showcaseTenant().policies
const postNames = () => tenant().filter(isPostSignIn).map((p) => p.name)
const signInNames = () => tenant().filter((p) => !isPostSignIn(p)).map((p) => p.name)

describe('Policies: the two type tabs', () => {
  it('has line tabs Sign-in and Post sign-in under the head, with no counts', () => {
    const out = render()
    expect(tabsOf(out)).toEqual(['Sign-in', 'Post sign-in'])
    expect(out).toContain('bx-tabs--line bpol__types')
    expect(out.indexOf('bpol__types')).toBeGreaterThan(out.indexOf('bpage__head'))
    expect(out.indexOf('bpol__types')).toBeLessThan(out.indexOf('bbar__right'))
    for (const t of tabsOf(out)) expect(t).not.toMatch(/\d/)
  })

  it('opens on Sign-in when nothing is stored, and on the stored tab when it is', () => {
    expect(selected(render())).toBe('Sign-in')
    expect(selected(render('post-sign-in'))).toBe('Post sign-in')
  })

  it('remembers the tab per viewer under brand-policies-type, every access guarded', () => {
    expect(policiesSrc).toContain("const KIND_KEY = 'brand-policies-type'")
    const read = policiesSrc.slice(policiesSrc.indexOf('function readKind'), policiesSrc.indexOf('function keepKind'))
    const keep = policiesSrc.slice(policiesSrc.indexOf('function keepKind'), policiesSrc.indexOf('export function Policies'))
    expect(read).toMatch(/try \{\s*const stored = localStorage\.getItem/)
    expect(keep).toMatch(/try \{\s*localStorage\.setItem/)
  })

  it('opens on Sign-in when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(selected(render())).toBe('Sign-in')
  })

  it('heads both tabs with one caption that names both types', () => {
    const caption = 'Every sign-in, and the session after it, is checked against these policies.'
    expect(text(render())).toContain(caption)
    expect(text(render('post-sign-in'))).toContain(caption)
  })

  it('places the tabs 20px under the head and 28px over the bar, with tokens only', () => {
    expect(typesCss).toContain('.bpage__head:has(+ .bpol__types) { margin-bottom: 0; }')
    expect(typesCss).toContain('.bpol__types { margin: var(--space-2) 0 var(--space-5); }')
    expect(typesCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\d+px/)
  })
})

describe('Policies: the Sign-in tab', () => {
  const out = render()

  it('lists sign-in policies only, never a post sign-in one', () => {
    const shown = namesIn(out)
    expect(postNames().length).toBeGreaterThanOrEqual(2)
    for (const n of postNames()) expect(shown).not.toContain(n)
    expect(shown).toContain('Global Default Policy')
    expect(shown.length).toBe(signInNames().length)
  })

  it('keeps its bar: Sign-in activity where its flag is on, Check access, then New policy, the one orange button', () => {
    const labels = barRight(out).map((b) => b.label)
    expect(labels.slice(-2)).toEqual(['Check access', 'New policy'])
    expect(labels.includes('Sign-in activity')).toBe(DENIAL_REASONS)
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
  })

  it('counts only sign-in policies as deciding sign-ins', () => {
    const deciding = tenant().filter((p) => !isPostSignIn(p) && (p.status === 'active' || p.status === 'always-on')).length
    expect(text(out)).toContain(`${deciding} ${deciding === 1 ? 'policy' : 'policies'} deciding sign-ins`)
  })
})

describe('Policies: the Post sign-in tab', () => {
  const out = render('post-sign-in')

  it('lists post sign-in policies only, under Policy name, Applications, Status and Actions', () => {
    expect(namesIn(out).sort()).toEqual(postNames().sort())
    expect(namesIn(out)).toContain('Zz test post sign-in on')
    expect(namesIn(out)).toContain('Zz test post sign-in draft')
    expect(namesIn(out)).not.toContain('Global Default Policy')
    expect(headsOf(out)).toEqual(['Policy name', 'Applications', 'Status', 'Actions'])
  })

  it('shows each one’s applications and its status pill', () => {
    const row = out.slice(out.indexOf('Zz test post sign-in on'))
    const rowEnd = row.indexOf('</tr>')
    expect(row.slice(0, rowEnd)).toContain('Salesforce')
    expect(text(row.slice(0, rowEnd))).toContain('Active')
    const draft = out.slice(out.indexOf('Zz test post sign-in draft'))
    expect(text(draft.slice(0, draft.indexOf('</tr>')))).toContain('Draft')
  })

  /* Applications are linked to a post sign-in policy from outside, on each
     application's page (spec, Rulings), so the cell lists them and offers no
     way to change them: no Assign apps, no Edit in the panel. */
  it('lists linked applications read only, and says Not linked when there are none', () => {
    const draft = out.slice(out.indexOf('Zz test post sign-in draft'))
    expect(text(draft.slice(0, draft.indexOf('</tr>')))).toContain('Not linked')
    expect(text(out)).not.toContain('Assign apps')
    const cell = policiesSrc.slice(policiesSrc.indexOf('function LinkedApps'))
    const body = cell.slice(0, cell.indexOf('\n}'))
    expect(body).toContain('appsOf(policy, store.apps)')
    expect(body).toContain('<AppsPeek apps={named} policyName={policy.name} />')
    expect(body).not.toContain('onEdit')
    const tab = policiesSrc.slice(policiesSrc.indexOf('function PostSignInPolicies'), policiesSrc.indexOf('function SortHead'))
    expect(tab).toContain('<LinkedApps policy={p} />')
    expect(tab).not.toContain('<PolicyApps')
  })

  it('has New policy alone in its bar, the one orange button: no Sign-in activity or Check access', () => {
    const right = barRight(out)
    expect(right.map((b) => b.label)).toEqual(['New policy'])
    expect(right[0].attrs).toContain('bx-btn--brand')
    expect(right[0].attrs).not.toContain('disabled')
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
    expect(text(out)).not.toContain('Sign-in activity')
    expect(text(out)).not.toContain('Check access')
  })

  it('searches, and filters by status with no Monitoring', () => {
    expect(out).toContain('aria-label="Search policies"')
    expect(out).toContain('Filter by status')
    const filter = policiesSrc.match(/const POST_STATUS[^=]*= \[([\s\S]*?)\n\]/)?.[1] ?? ''
    expect([...filter.matchAll(/label: '([^']+)'/g)].map((m) => m[1])).toEqual(['All', 'Active', 'Draft', 'Inactive'])
  })

  it('makes New policy an Untitled post sign-in draft and opens it in the board, with no dialog', () => {
    const start = policiesSrc.slice(policiesSrc.indexOf('function PostSignInPolicies'))
    const draft = start.slice(start.indexOf('const startDraft'), start.indexOf('const act'))
    expect(draft).toContain("freeName('Untitled post sign-in policy', store.policies.map((p) => p.name))")
    expect(draft).toContain('store.addPolicy(blankPostSignInPolicy(name))')
    expect(draft).toContain("store.go({ name: 'board', policyId: id })")
    expect(draft).not.toMatch(/Modal|Dialog|setDeleting/)
  })

  it('opens Edit policy in the board too', () => {
    const start = policiesSrc.slice(policiesSrc.indexOf('function PostSignInPolicies'), policiesSrc.indexOf('function SortHead'))
    const act = start.slice(start.indexOf('const act'), start.indexOf("case 'active'"))
    expect(act).toMatch(/case 'edit':\s*openBuilder\(policy\)/)
  })

  /* The board is the one builder for both types (owner, 13 Oct 2026: "I don't
     want to add a new builder until needed"). */
  it('opens the board from a name, never the sign-in details slider or a builder of its own', () => {
    const start = policiesSrc.slice(policiesSrc.indexOf('function PostSignInPolicies'), policiesSrc.indexOf('function SortHead'))
    expect(start).toContain("const openBuilder = (p: Policy) => store.go({ name: 'board', policyId: p.id })")
    expect(start).toContain('className="btable__link" onClick={() => openBuilder(p)}')
    expect(start).not.toContain('PolicyDetailsDrawer')
    expect(policiesSrc).not.toContain("name: 'post-sign-in'")
  })

  it('offers Edit policy, the switch its status allows with no Monitor, and Delete', () => {
    const menu = policiesSrc.slice(policiesSrc.indexOf('function postSignInMenu'), policiesSrc.indexOf('function postDeleteDetail'))
    expect(menu).toContain("label: 'Edit policy'")
    expect(menu).toContain('statusOptions(policy, { monitor: false })')
    expect(menu).toContain("label: 'Delete policy'")
    expect(menu).not.toMatch(/Duplicate|Read as text|Save as template|View monitoring/)
  })

  it('switches through the status hook and deletes through the delete confirmation', () => {
    const tab = policiesSrc.slice(policiesSrc.indexOf('function PostSignInPolicies'), policiesSrc.indexOf('function SortHead'))
    const act = tab.slice(tab.indexOf('const act'), tab.indexOf('const current'))
    expect(act).toMatch(/case 'active':\s*case 'inactive':\s*statusChange\.request\(policy, action\)/)
    expect(act).toMatch(/case 'delete':\s*setDeleting\(policy\)\s*setDeleteOpen\(true\)/)
    expect(tab).toContain('<ConfirmDelete')
    expect(tab).toContain('store.deletePolicy(current.id)')
    expect(tab).toContain('{statusChange.dialog}')
  })

  it('names the seeded post sign-in policies with their applications', () => {
    const live = out.slice(out.indexOf('Data export protection'))
    const row = live.slice(0, live.indexOf('</tr>'))
    expect(row).toContain('Salesforce')
    expect(text(row)).toContain('Active')
    const draft = out.slice(out.indexOf('Collaboration tools'))
    expect(text(draft.slice(0, draft.indexOf('</tr>')))).toContain('Draft')
  })

  it('says no login anywhere on either tab', () => {
    expect(text(out)).not.toMatch(LOGIN)
    expect(text(render())).not.toMatch(LOGIN)
  })
})

describe('Policies: the Post sign-in tab with none', () => {
  it('says so, with New policy, and still one orange button', () => {
    seed.post = 'none'
    const out = render('post-sign-in')
    expect(namesIn(out)).toEqual([])
    expect(text(out)).toContain('No post sign-in policies yet')
    expect(out.match(/bx-btn--brand/g) ?? []).toHaveLength(1)
    const empty = out.slice(out.indexOf('No post sign-in policies yet'))
    expect(text(empty)).toContain('New policy')
    expect(text(out)).not.toContain('acting after sign-in')
  })
})
