import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn } from '../fixtures'
import src from './AppProtection.tsx?raw'
import { detachFrom } from './app-policies'
import { deciderChanges, engineDecides, keyName, visibleMoves } from './app-standing'
import { guardOpens, runGuard } from './guard'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The Apps list's protection panel (AppProtection.tsx), without a browser.

   Its attach and its Remove are a third way to change a policy's applications,
   beside the application's own page and the builder, so they run the same
   checks first (board/apps-guard.ts). The hook only runs inside the provider
   tree and a press, so the join is pinned on the source, the way
   arrive-fix.test.ts pins its effect; what the checks say about the drawer's
   own change is pinned on the showcase tenant.

   The Remove dialog's list is the engine's (`deciderChanges`), cut to the rows
   worth reading (`visibleMoves`). The Modal draws nothing without a document,
   so the dialog's own reading is pinned on the source and then run here.
   -------------------------------------------------------------------------- */

/* Comments stripped: the file discusses its own calls in prose, and a mention
   must not pass for a call. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '')
const calls = (needle: string) => code.split(needle).length - 1
const between = (from: string, to: string) => {
  const at = code.indexOf(from)
  return code.slice(at, code.indexOf(to, at + from.length))
}

describe('the protection panel runs the apps checks', () => {
  it('holds the hook the application page and the builder use', () => {
    expect(code).toContain("import { useAppsGuard } from './board/apps-guard'")
    expect(code).toContain('const appsGuard = useAppsGuard()')
  })

  it('writes in one place each, never straight from the press', () => {
    /* `putOn` and `takeOff`: called by the checks once they let it through,
       or at once for a policy that decides nobody's sign-in. */
    expect(calls('addToApp(')).toBe(1)
    expect(calls('removeFromApp(')).toBe(1)
    expect(between('const putOn', 'const takeOff')).toContain('addToApp(')
    expect(between('const takeOff', 'function submit')).toContain('removeFromApp(')
  })

  it('checks an attach of a live policy before it is written', () => {
    const submit = between('function submit()', 'const detach')
    expect(submit).toContain('appsGuard.guards(live)')
    expect(submit).toContain('appsGuard.check(live, attachTo(live, app.id, store.apps).appIds, () => putOn(pickId))')
    expect(submit).not.toContain('addToApp(')
  })

  it('checks a removal of a live policy, and the Remove dialog goes through it', () => {
    const detach = between('const detach', 'if (!app) return null')
    expect(detach).toContain('appsGuard.guards(live)')
    expect(detach).toContain('appsGuard.check(live, detachFrom(live, app.id).appIds, () => takeOff(policyId))')
    const confirm = between('<RemoveDialog', '/>')
    expect(confirm).toContain('detach(removing.id)')
    expect(confirm).not.toContain('removeFromApp')
  })

  it('opens the checks page over the panel, and confirms with the write the page read', () => {
    /* Portalled after the panel and the dialog, so at the same layer it is the
       one on top, and the last into the dialog stack: Escape closes it first. */
    const portal = code.indexOf('createPortal(<GuardDrawer {...guardPage} />, portalRoot())')
    expect(portal).toBeGreaterThan(code.indexOf('</Drawer>'))
    expect(portal).toBeGreaterThan(code.indexOf('<RemoveDialog'))
    expect(code).toContain('onConfirm: (ids, p) => (ids.includes(app.id) ? putOn(p.id) : takeOff(p.id))')
    /* A page left open must not come up over the next application's panel. */
    expect(between('useEffect(() => {', '}, [appId])')).toContain('appsGuard.close()')
  })

  it('says it is checking on the one button that asked, and keeps it focusable', () => {
    expect(code).toContain("{appsGuard.checking ? 'Checking…' : primary}")
    expect(code).toContain('busy={appsGuard.checking}')
    /* Disabled, it would drop focus to the page, and Keep editing on the
       checks' page would have nothing to hand focus back to. */
    expect(code).toContain("disabled={choice === null || (choice === 'existing' && !pickId)}")
    expect(between('function submit()', 'const detach')).toContain('appsGuard.checking) return')
  })

  it('puts focus on the new row after an attach, however it was written', () => {
    expect(between('const putOn', 'const takeOff')).toContain('setFlash({ id: policyId })')
    expect(between('if (!flash) return', '}, [flash])')).toContain('CSS.escape(flash.id)')
  })

  it("is a change the checks stop: taking HRMS off its own policy from the panel's Remove", () => {
    /* The input the panel's `detach` hands the checks, on the tenant with HRMS
       on: Kavya's Must pass sign-in falls to the Global Default. Written at
       once, as it was, this went through with only an Undo toast. */
    const t = showcaseTenantHrmsOn()
    const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
    expect(engineDecides(hrms)).toBe(true)
    const off = detachFrom(hrms, 'hrms')
    const r = runGuard({
      kind: 'apps',
      before: hrms,
      after: { ...hrms, appIds: off.appIds, status: off.status },
      changedFrom: null,
      policies: t.policies,
      env: envOf(t),
      apps: t.apps,
      savedSignIns: t.savedSignIns,
      adminId: 'jaspreet',
      breakIn: null,
    })
    expect(r.blocking.map((c) => c.signIn.id)).toEqual(['ssi-kavya-office'])
    expect(guardOpens(r)).toBe(true)
  })
})

describe('the Remove dialog', () => {
  const t = showcaseTenant()
  const people = t.directory.people

  /* The dialog's own reading, as its memo runs it. */
  const PIPELINE = 'visibleMoves(changes, app.id, store.policies, after).filter((m) => m.from?.id === policy.id)'
  const listed = (name: string, appId: string) => {
    const policy = t.policies.find((p) => p.name === name)!
    const after = t.policies.map((p) => (p.id === policy.id && !p.isSystem ? detachFrom(p, appId) : p))
    const changes = deciderChanges(appId, t.policies, after, people, t.groups)
    return visibleMoves(changes, appId, t.policies, after)
      .filter((m) => m.from?.id === policy.id)
      .map((m) => `${keyName(m.key, t.groups, people)} → ${m.to?.name ?? 'No policy'}`)
  }

  it('reads the moves through visibleMoves', () => {
    expect(between('export function RemoveDialog', 'const copy')).toContain(PIPELINE)
  })

  it('lists Everyone once when Slack for everyone goes, not each group no Slack policy names', () => {
    expect(listed('Slack for everyone', 'slack')).toEqual(['Everyone → Global Default Policy'])
  })

  it("lists a person in two groups where their groups' rows do not say where they go", () => {
    expect(listed('Box for engineering', 'box')).toEqual(['Engineering → Global Default Policy', 'Tanmay Joshi → Box for design'])
  })

  it("draws a person's row with a person's face", () => {
    const row = between('<dl className="bapp__moves">', '</dl>')
    expect(row).toContain("m.key.kind !== 'everyone' && <Face kind={m.key.kind}")
  })
})
