/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { differsFromLive, hasUnsavedChanges, openForEditing } from '../../policy-draft'
import { runBreakInOnApp } from '../break-in-app'
import { acceptanceFor } from '../break-in-model'
import { canUndo, commit, historyOf, undo, type History } from '../history'
import { envOf } from '../tenant-resolver'
import { arrivalKey, firstArrival, landConflict, landFix, type ArriveFix } from './arrive-fix'
import { applyConflictFixes, fixDone, fixSaidOn, type ConflictFix, type FixItem } from '../sign-in-tests/conflict-fix'
import appRaw from '../../BrandApp.tsx?raw'
import builderRaw from './BoardBuilder.tsx?raw'
import pageRaw from './BoardPage.tsx?raw'

/* -----------------------------------------------------------------------------
   "Fix in policy ↗", the builder's end (arrive-fix.ts; owner, 1 Oct 2026:
   "go with your picks, start building"). Access checks previews a break-in
   fix and opens the deciding policy with `fix: { card, app }` on the route;
   the board asks the fix of its own draft as it opens and commits it once —
   on the undo stack, Undo in the toast, the save bar awake — with the card
   it made or changed selected and shown. An arrival no fix fits changes
   nothing and says why.

   Without a browser, so the effect itself never runs here: what it does is
   pinned through the pieces it is made of (`firstArrival`, `landFix`, the
   history), as the effect strings them together, and the join is pinned on
   the source. The board drawn with a fix on its route is in
   policy-check-ui.test.tsx, beside the other routes into it.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const finance = stored('sc-aws-finance')
const tools = stored('sc-dev-tools')
const PROXY: ArriveFix = { card: 'proxy-finance', app: 'aws' }
/* The working copy is CRLF on Windows checkouts; the pins read LF. */
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const [appSrc, builderSrc, pageSrc] = [appRaw, builderRaw, pageRaw].map(lf)

/* The builder's arrival effect, as it strings the pieces together: once per
   key, `landFix` on the draft the history holds, one commit when it lands. */
function arriveOn(h: History, seen: { current: string | null }, policyId: string, fix: ArriveFix | undefined, opts: Parameters<typeof landFix>[3] = {}) {
  const toasts: string[] = []
  if (!firstArrival(seen, arrivalKey(policyId, fix)) || !fix) return { h, toasts }
  const out = landFix(h.present, fix, env, opts)
  if ('none' in out) return { h, toasts: [out.none] }
  return { h: commit(h, out.draft), toasts: [out.toast], landed: out }
}

describe('a fix that fits the draft', () => {
  it('adds the proxy’s rule to AWS billing for Finance: one commit, the toast, the new rule selected on its Condition', () => {
    const out = landFix(openForEditing(finance), PROXY, env, { policies: t.policies })
    if ('none' in out) throw new Error(out.none)
    expect(out.toast).toBe('Rule added. Not saved yet.')
    expect(out.draft.rules).toHaveLength(finance.rules.length + 1)
    expect(out.draft.rules[0].name).toBe('Deny sign-ins from outside India')
    expect(out.select).toEqual({ kind: 'rule', id: out.draft.rules[0].id, part: 'when' })
    expect(out.reveal).toBe(out.draft.rules[0].id)
    /* The policy's own facts are kept: only the rules and the last row move. */
    expect([out.draft.id, out.draft.name, out.draft.appIds]).toEqual([finance.id, finance.name, finance.appIds])
    /* Unsaved, and something to save: the bar's Review & save and the leave guard both read these. */
    expect(hasUnsavedChanges(finance, out.draft)).toBe(true)
    expect(differsFromLive(finance, out.draft)).toBe(true)
  })

  it('changes the relay’s second factor on Developer tools and selects that rule', () => {
    const out = landFix(openForEditing(tools), { card: 'aitm-relay', app: 'github' }, env, { policies: t.policies })
    if ('none' in out) throw new Error(out.none)
    expect(out.toast).toBe('Second factor changed on rule 2. Not saved yet.')
    expect(out.select).toEqual({ kind: 'rule', id: tools.rules[1].id, part: 'when' })
    expect(out.draft.rules).toHaveLength(tools.rules.length)
  })
})

describe('once per arrival', () => {
  it('lands once however often the effect runs — StrictMode’s second run, every render after — and Undo gives the clean draft back', () => {
    const seen = { current: null as string | null }
    const clean = historyOf(openForEditing(finance))
    const first = arriveOn(clean, seen, finance.id, PROXY, { policies: t.policies })
    expect(first.toasts).toEqual(['Rule added. Not saved yet.'])
    expect(first.h.past).toHaveLength(1)
    /* The second run, and a re-render: the key is taken, nothing more is committed or said. */
    for (let i = 0; i < 2; i += 1) {
      const again = arriveOn(first.h, seen, finance.id, PROXY, { policies: t.policies })
      expect(again.h).toBe(first.h)
      expect(again.toasts).toEqual([])
    }
    expect(undo(first.h).present).toBe(clean.present)
  })

  it('is keyed by the policy, the card and the application; a route with no fix forgets it', () => {
    expect(arrivalKey('sc-aws-finance', PROXY)).toBe('sc-aws-finance|proxy-finance|aws')
    expect(arrivalKey('sc-aws-finance', undefined)).toBeNull()
    const seen = { current: null as string | null }
    expect(firstArrival(seen, 'a|proxy-finance|aws')).toBe(true)
    expect(firstArrival(seen, 'a|proxy-finance|aws')).toBe(false)
    expect(firstArrival(seen, 'a|aitm-relay|github')).toBe(true)
    expect(firstArrival(seen, null)).toBe(false)
    expect(seen.current).toBeNull()
    expect(firstArrival(seen, 'a|aitm-relay|github')).toBe(true)
  })
})

describe('a fix that does not fit', () => {
  it('changes nothing and says why in a line', () => {
    const seen = { current: null as string | null }
    const clean = historyOf(openForEditing(finance))
    const out = arriveOn(clean, seen, finance.id, { card: 'proxy-finance', app: 'box' })
    expect(out.toasts).toEqual(['This draft does not cover Box.'])
    expect(out.h).toBe(clean)
    expect(canUndo(out.h)).toBe(false)
  })

  it('leaves a draft that already holds the card — a fix saved as a draft, asked for again', () => {
    const fixed = landFix(openForEditing(finance), PROXY, env)
    if ('none' in fixed) throw new Error(fixed.none)
    expect(landFix(fixed.draft, PROXY, env)).toEqual({ none: 'This draft already holds that sign-in.' })
  })

  it('reads this policy’s acceptances: a result accepted in its Break-in test is not fixed again', () => {
    const round = runBreakInOnApp(t.policies, 'aws', env).rows.find((r) => r.id === 'proxy-finance')!.round
    const accepted = { 'proxy-finance': acceptanceFor(round, 'Jaspreet Toor', '2026-10-01T08:35:00.000Z', 'Finance is on 2FA everywhere')! }
    expect(landFix(openForEditing(finance), PROXY, env, { accepted, policies: t.policies })).toEqual({ none: 'This draft already holds that sign-in.' })
  })

  it('takes no fix on the Global Default, and none that loosens', () => {
    const gd = t.policies.find((p) => p.isSystem)!
    expect(landFix(gd, { card: 'risk-inside', app: 'box' }, env)).toEqual({ none: 'The Global Default takes no fixes from here.' })
    expect(landFix(stored('sc-aws-engineering'), { card: 'expired-trust', app: 'aws' }, env, { policies: t.policies })).toEqual({
      none: 'That fix would let others in more easily. Nothing changed.',
    })
  })
})

/* A Why finding's Fix brings the run's whole list (7 Oct 2026, owner: "can I take this whole fix thing inside the
   builder?"): the one pressed lands as any fix does, the rest wait in the Fixes panel, and what each is now is read
   off the draft — so a second press never makes it twice, and Undo opens it again. */
describe('a run’s fixes, together', () => {
  const eng = t.policies.find((p) => !p.isSystem && p.rules.length >= 3)!
  const [r1, r2, r3] = eng.rules
  const move: ConflictFix = { kind: 'move', policyId: eng.id, ruleId: r3.id, above: r2.id }
  const add: ConflictFix = { kind: 'add', policyId: eng.id, above: r1.id, userIds: ['u-maya'], groupIds: [], label: 'Maya Iyer', copy: { policyId: eng.id, ruleId: r3.id }, decision: '2fa' }
  const list: FixItem[] = [move, add].map((fix, i) => ({ fix, title: `Finding ${i + 1}`, line: 'Its line.' }))

  it('lands the one pressed, and says so the second time rather than making it twice', () => {
    const seen = { current: null as string | null }
    const clean = historyOf(openForEditing(eng))
    const first = arriveOn(clean, seen, eng.id, { conflicts: list, pressed: 1 })
    expect(first.toasts).toEqual(['Rule added for Maya Iyer as rule 1'])
    expect(first.h.present.rules[0]).toMatchObject({ name: 'For Maya Iyer', decision: '2fa', who: { userIds: ['u-maya'], groupIds: [] } })
    expect(fixDone(first.h.present, add)).toBe(true)
    expect(landConflict(first.h.present, add, t.policies)).toEqual({ none: 'Already in the draft' })
    /* Undo opens it again. */
    expect(fixDone(undo(first.h).present, add)).toBe(false)
  })

  it('a move already made is Applied, not "no longer fits"; the words number the rules as the draft has them', () => {
    expect(fixSaidOn(move, eng)).toBe('Move rule 3 above rule 2')
    const moved = landConflict(openForEditing(eng), move, t.policies)
    if ('none' in moved) throw new Error(moved.none)
    expect(moved.draft.rules.map((r) => r.id).slice(0, 3)).toEqual([r1.id, r3.id, r2.id])
    expect(landConflict(moved.draft, move, t.policies)).toEqual({ none: 'Already in the draft' })
    const added = landConflict(moved.draft, add, t.policies)
    if ('none' in added) throw new Error(added.none)
    expect(fixSaidOn(move, added.draft)).toBe('Move rule 3 above rule 4')
  })

  it('Apply all makes only what is open, in one edit; again, nothing', () => {
    const half = landConflict(openForEditing(eng), move, t.policies)
    if ('none' in half) throw new Error(half.none)
    const all = applyConflictFixes(half.draft, [move, add], t.policies)
    expect(all.count).toBe(1)
    expect(all.added).toEqual([all.next.rules[0].id])
    expect(applyConflictFixes(all.next, [move, add], t.policies).count).toBe(0)
  })

  it('is keyed by the one pressed and the list', () => {
    expect(arrivalKey(eng.id, { conflicts: list, pressed: 0 })).not.toBe(arrivalKey(eng.id, { conflicts: list, pressed: 1 }))
  })
})

describe('the route', () => {
  it('carries the fix from the screen to the builder, and lands on the board rather than Check access', () => {
    expect(appSrc).toContain('<BoardPage policyId={screen.policyId} open={screen.open} rule={screen.rule} fix={screen.fix} />')
    expect(pageSrc).toContain('const testing = open !== undefined && fix === undefined')
    expect(pageSrc).toContain('arriveFix={fix}')
  })
})

describe('the builder’s join', () => {
  const body = (from: string, to: string) => builderSrc.slice(builderSrc.indexOf(from), builderSrc.indexOf(to, builderSrc.indexOf(from)))

  it('runs the arrival once per key, from an effect on the key alone', () => {
    expect(builderSrc).toContain('const fixKey = arrivalKey(policyId, arriveFix)')
    expect(builderSrc).toContain('if (firstArrival(arrived, fixKey)) arrival.current()\n  }, [fixKey])')
    /* Only where the policy exists and the edition has the Break-in test. */
    expect(builderSrc).toContain("if (arriveFix && saved && ('conflicts' in arriveFix || features.breakInTest)) landArrival(arriveFix)")
  })

  it('commits the fix as every ready fix is, offers Undo, and selects and shows the card', () => {
    const land = body('const landArrival = ', '\n  }\n')
    expect(land).toContain("store.breakInAccepted[saved.id]")
    expect(land).toContain('policies: store.policies')
    expect(land).toContain('commitDraft(out.draft)')
    expect(land).toContain('offerUndo(out.toast)')
    expect(land).toContain('select(out.select)')
    expect(land).toContain('setFlash({ id: out.reveal, key: Date.now() })')
    /* A plain toast and nothing else when nothing applies. */
    expect(land).toMatch(/if \('none' in out\) \{\n\s+store\.showToast\(out\.none\)\n\s+return\n\s+\}/)
    /* Never Check access from here. */
    expect(land).not.toMatch(/enterTest|startTest|setTesting/)
    expect(land.indexOf('commitDraft(out.draft)')).toBeLessThan(land.indexOf('offerUndo(out.toast)'))
  })

  it('never rebuilds the history it opened with, so StrictMode’s rerun cannot put the clean draft back over the fix', () => {
    expect(builderSrc).toContain('const histFor = useRef(saved?.id)')
    expect(builderSrc).toContain('if (histFor.current === saved?.id) return')
    /* The reset is declared before the arrival, so a route from another board resets first and the fix is committed on top. */
    expect(builderSrc.indexOf('const histFor = useRef(saved?.id)')).toBeLessThan(builderSrc.indexOf('const fixKey = arrivalKey(policyId, arriveFix)'))
  })

  it('keeps the leave guard on the draft the fix leaves unsaved', () => {
    expect(builderSrc).toContain("useLeaveGuard({ dirty: unsaved, save: saveDraft, saveLabel: 'Save as draft' })")
  })
})
