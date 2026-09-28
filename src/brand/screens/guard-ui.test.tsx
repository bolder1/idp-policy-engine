/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blankRule, type Policy, type Rule } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import { committed } from '../policy-draft'
import { BrandProvider } from '../store'
import { runGuard, withPolicy, type GuardInput, type GuardKind } from './guard'
import { GuardDrawer } from './guard-page'
import guardCss from './guard.css?raw'
import { monitorRows, monitorSamples, planOf } from './monitor-sample'
import { envOf } from './tenant-resolver'

/* The guard pages drawn once without a browser, on the showcase tenant: what
   each kind says, that a block is said above the rows with its fix and never
   in the footer, that only the primary is orange, and that turning off never
   blocks. The browser pass checks the drawer's motion and the rule flash.

   Saving and turning off need HRMS enforcing, so the pages are drawn on the
   tenant once HRMS is turned on; the seed opens with it Inactive (Phase 4),
   which is the `off` list Before turning on starts from. */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const HRMS = t.policies.find((p) => p.id === 'sc-hrms-office')!
const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const footOf = (s: string) => /<footer class="bx-drawer__foot">([\s\S]*?)<\/footer>/.exec(s)?.[1] ?? ''

const denyHr: Rule = { ...blankRule('Deny Human Resources'), pristine: undefined, decision: 'deny', who: { groupIds: ['hr'], userIds: [] } }

const input = (kind: GuardKind, before: Policy | null, after: Policy, policies: readonly Policy[] = t.policies): GuardInput => ({
  kind,
  before,
  after,
  changedFrom: kind === 'save' ? before : kind === 'turn-on' ? policies.find((p) => p.id === after.id)! : null,
  policies,
  env,
  apps: t.apps,
  savedSignIns: t.savedSignIns,
  adminId: 'jaspreet',
  breakIn: kind === 'turn-off' || kind === 'to-monitor' ? null : {},
})

describe('Before saving: your edits', () => {
  const blocked = runGuard(input('save', HRMS, committed(HRMS, { ...HRMS, rules: [denyHr, ...HRMS.rules] })))
  const out = html(
    <GuardDrawer open kind="save" policyName={HRMS.name} result={blocked} run={0} primaryLabel="Save policy" onConfirm={noop} onClose={noop} onApplyFix={noop} onOverride={noop} onRevealRule={noop} />,
  )
  const said = text(out)

  it('says what stops it above the rows, with the fix and the way to expect otherwise (A3)', () => {
    expect(said).toContain("Before saving: your edits HRMS access from corporate offices")
    expect(said).toContain("Can't save Kavya Menon in the office must pass and would get Deny.")
    expect(said).toContain('Leave Kavya Menon out of rule 1')
    expect(said).toContain('Expect Deny instead')
    expect(said.indexOf("Can't save")).toBeLessThan(said.indexOf('What you changed'))
  })

  it('lists the six rows, in order, each with its summary', () => {
    const rows = ['What you changed 1 change', 'Who it starts deciding for No change', 'Saved sign-ins 1 failing', 'Your own and protected sign-ins All pass', 'What changes Of 360 modelled sign-ins: Now allowed 0', 'Break-in test Got through']
    let at = -1
    for (const r of rows) {
      const i = said.indexOf(r)
      expect(i, r).toBeGreaterThan(at)
      at = i
    }
  })

  it('keeps the footer to buttons, and the save disabled while it is blocked', () => {
    const foot = footOf(out)
    expect(foot).not.toMatch(/<p\b/)
    expect(text(foot)).toBe('Keep editing Save policy')
    expect(foot).toMatch(/<button[^>]*title="Can(?:'|&#x27;)t save"[^>]*disabled=""[^>]*class="bx-btn bx-btn--brand/)
  })

  it('draws one orange button, and none of the retired words', () => {
    expect((out.match(/bx-btn--brand/g) ?? []).length).toBe(1)
    expect(said).not.toMatch(/Saving is blocked|Turning on is blocked|Report only|\bBlocked\b/)
  })

  it('names the deciding rule as a link that shows it on the board', () => {
    expect(out).toMatch(/class="bgd__rule"[^>]*>Rule 1</)
  })

  it('gives a row a chevron, a title and a summary, and no icon of its own', () => {
    expect(out).not.toMatch(/lucide-(pencil-line|users|bookmark-check|shield-check|activity|shield-alert|radar)/)
  })
})

describe('Before turning on', () => {
  const off = withPolicy(t.policies, { ...HRMS, status: 'inactive' })
  const r = runGuard(input('turn-on', null, { ...HRMS, status: 'active' }, off))

  it('offers Monitor instead from Inactive, beside Turn on (A6)', () => {
    const out = html(
      <GuardDrawer open kind="turn-on" policyName={HRMS.name} result={r} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} onMonitorInstead={noop} />,
    )
    expect(text(footOf(out))).toBe('Cancel Monitor instead Turn on')
    expect(footOf(out)).toMatch(/bx-btn--neutral[^"]*"[^>]*>Monitor instead/)
    expect(text(out)).toContain('Who it starts deciding for HRMS')
    expect(text(out)).not.toContain('While monitoring')
  })

  it('offers the version with the edits, chosen, beside the stored one', () => {
    const out = html(
      <GuardDrawer
        open
        kind="turn-on"
        policyName={HRMS.name}
        result={r}
        run={0}
        primaryLabel="Turn on"
        onConfirm={noop}
        onClose={noop}
        onApplyFix={noop}
        version={{ value: 'edits', tips: { edits: 'Unsaved edits on this board', stored: 'Saved 2 hours ago by Jaspreet Toor' }, onChange: noop }}
      />,
    )
    expect(out).toContain('role="radiogroup" aria-label="Version"')
    expect(out).toMatch(/aria-checked="true"[^>]*title="Unsaved edits on this board"[^>]*>With your edits/)
  })

  it('says what monitoring found, from Monitoring (A6b)', () => {
    const monitoring = withPolicy(t.policies, { ...HRMS, status: 'monitor' })
    const hrms = monitoring.find((p) => p.id === HRMS.id)!
    const plan = planOf(monitorRows(hrms, monitoring, env, monitorSamples(hrms, env, new Date(Date.UTC(2026, 8, 28)))))
    const rm = runGuard(input('turn-on', null, { ...HRMS, status: 'active' }, monitoring))
    const out = html(<GuardDrawer open kind="turn-on" policyName={HRMS.name} result={rm} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} monitoring={plan} />)
    expect(text(out)).toContain('While monitoring Sample If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.')
    expect(text(footOf(out))).toBe('Cancel Turn on')
    /* The link back to the Monitoring page is in the row, never the footer (check 9). */
    expect(text(out)).not.toContain('View monitoring')
    const linked = html(
      <GuardDrawer open kind="turn-on" policyName={HRMS.name} result={rm} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} monitoring={plan} onViewMonitoring={noop} />,
    )
    expect(text(linked)).toContain('While monitoring Sample View monitoring If turned on:')
    expect(text(footOf(linked))).toBe('Cancel Turn on')
  })

  it('names the stored version it turns on, and lists the changes where there is none to name', () => {
    const stored = html(
      <GuardDrawer open kind="turn-on" policyName={HRMS.name} result={r} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} storedSaid="Saved 2 hours ago by Jaspreet Toor" />,
    )
    expect(text(stored)).toContain('What you changed Stored version')
    /* A draft turned on from the walkthrough's review has no stored version: its edits are what changed. */
    const draft = html(<GuardDrawer open kind="turn-on" policyName={HRMS.name} result={r} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} />)
    expect(text(draft)).toContain('What you changed No change')
  })

  it('stops for a version its rules cannot turn on, in the page and not the footer', () => {
    const out = html(
      <GuardDrawer open kind="turn-on" policyName={HRMS.name} result={r} run={0} primaryLabel="Turn on" onConfirm={noop} onClose={noop} onApplyFix={noop} blockedReason="Fix the error in its rules first." />,
    )
    expect(text(out)).toContain("Can't turn on Fix the error in its rules first.")
    expect(text(footOf(out))).toBe('Cancel Turn on')
    expect(footOf(out)).toMatch(/disabled=""/)
  })
})

describe('Before turning off', () => {
  const r = runGuard(input('turn-off', HRMS, { ...HRMS, status: 'inactive' }))
  const out = html(<GuardDrawer open kind="turn-off" policyName={HRMS.name} result={r} run={0} primaryLabel="Turn off" onConfirm={noop} onClose={noop} onApplyFix={noop} />)
  const said = text(out)

  it('says who it stops deciding for, and never blocks (assumption 24)', () => {
    expect(said).toContain('Before turning off')
    expect(said).toContain('Who it stops deciding for HRMS')
    expect(said).toContain('Saved sign-ins 2 failing')
    expect(said).not.toContain("Can't")
    expect(footOf(out)).not.toMatch(/disabled=""/)
    expect(said).not.toContain('What you changed')
    expect(said).not.toContain('Break-in test')
  })
})

describe('the stale-review line', () => {
  it('asks for the checks again, and holds a save until they run', () => {
    const r = runGuard(input('save', HRMS, committed(HRMS, { ...HRMS, fallback: { ...HRMS.fallback!, decision: '1fa' } })))
    expect(r.blocking).toEqual([])
    const out = html(<GuardDrawer open kind="save" policyName={HRMS.name} result={r} run={0} primaryLabel="Save policy" onConfirm={noop} onClose={noop} onApplyFix={noop} stale onRerun={noop} />)
    expect(text(out)).toContain('Changed since you opened this. Run the checks again')
    expect(footOf(out)).toMatch(/title="Changed since you opened this"[^>]*disabled=""/)
  })

  it('never holds Turn off or Monitor: an admin can always switch a policy off (assumption 24)', () => {
    for (const [kind, status, label] of [
      ['turn-off', 'inactive', 'Turn off'],
      ['to-monitor', 'monitor', 'Monitor'],
    ] as const) {
      const r = runGuard(input(kind, HRMS, { ...HRMS, status }))
      const out = html(<GuardDrawer open kind={kind} policyName={HRMS.name} result={r} run={0} primaryLabel={label} onConfirm={noop} onClose={noop} onApplyFix={noop} stale onRerun={noop} />)
      expect(text(out), kind).toContain('Changed since you opened this. Run the checks again')
      expect(footOf(out), kind).not.toMatch(/disabled=""/)
      expect(footOf(out), kind).not.toContain('title="Changed since you opened this"')
    }
  })
})

describe('when the checks could not run', () => {
  it('says so, and lets the change through', () => {
    const out = html(<GuardDrawer open kind="save" policyName={HRMS.name} result="error" run={0} primaryLabel="Save policy" onConfirm={noop} onClose={noop} onApplyFix={noop} />)
    expect(text(out)).toContain('Checks could not run.')
    expect(footOf(out)).not.toMatch(/disabled=""/)
  })
})

describe('the stylesheet', () => {
  it('never sets a transform: the banner and the rows are framer elements', () => {
    const rules = guardCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/transform|translate|scale\(/)
  })
})
