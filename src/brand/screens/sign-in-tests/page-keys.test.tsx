/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { runBreakInOnApp } from '../break-in-app'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { boundariesOf } from '../testing/boundaries'
import { rowsRead } from '../testing/rows-read'
import { factsOf, type SignInForm } from '../testing/sign-in-form'
import { BreakInPanel } from './BreakInPanel'
import { engineRun, readersOf, type EngineRun } from './engine-run'
import { InspectPanel } from './InspectPanel'
import type { InspectTarget } from './inspect-model'
import { PANEL, holdsEscape, openerOf, popupOpen, refocus, type AttrOf, type Door } from './page-keys'
import { GROUP_PREFIX, asGroupOf, emptyDraft, initialTryPage, memberOf, picksOf, runOfPicks, tokenTips, type TryPage } from './sign-in-card'
import { TryPanel } from './TryPanel'
import pageSrc from '../SignInTests.tsx?raw'
import keysSrc from './page-keys.ts?raw'
import briefPanelSrc from './layouts/brief-panel.tsx?raw'
import classicSrc from './layouts/classic2-chain.tsx?raw'
import pillSrc from './layouts/classic2-pill.tsx?raw'
import barSrc from './layouts/focus2-canvasbar.tsx?raw'
import comboSrc from './identity-combo.tsx?raw'
import journeySrc from './TryJourney.tsx?raw'

/* -----------------------------------------------------------------------------
   The Access checks page's Escape and focus (page-keys.ts, review of 6 Oct
   2026), and the inspector's sign-in on a group's check.

   (c) Escape waits for a popup open over a panel, never for a row opened in
       one: an attempt opened in Break-in attempts held the panel up for good.
   (d) A panel shut gives the focus back to what opened it, else the page's
       doors and, last, Focus's own: on Focus it went nowhere.
   (f) A group's check runs as one member who stands for the group; the
       inspector's Related never names that member as the person.

   Nothing here clicks: the rules are page-keys.ts's, held on the panels as
   they are drawn and on stand-ins for the page's elements; how the page
   calls them is pinned on its source.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const people = t.directory.people
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const TODAY = '2026-10-06'
const noop = () => {}
const html = (node: React.ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

/* Every start tag that says whether it is expanded, as its attributes — and as
   they would read once it is open (the panels are drawn shut). */
function expandables(markup: string): { tag: string; attr: AttrOf; opened: AttrOf }[] {
  return [...markup.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)]
    .filter((m) => /\saria-expanded="/.test(m[2]))
    .map((m) => {
      const attrs = new Map([...m[2].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? ''] as const))
      const attr: AttrOf = (n) => attrs.get(n) ?? null
      const opened: AttrOf = (n) => (n === 'aria-expanded' ? 'true' : attr(n))
      return { tag: m[0], attr, opened }
    })
}

/* A sign-in, run on the showcase tenant as the page runs it. */
function runOf(form: SignInForm): EngineRun {
  const { facts } = factsOf(form, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  const rows = rowsRead(t.policies, null, form.appId, lib)
  return engineRun({ res, policies: t.policies, form, facts, env, ctx: { people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}

const inspector = (plan: EngineRun, stack: InspectTarget[], signIn: { personId: string | null; appId: string | null }) =>
  html(<InspectPanel stack={stack} plan={plan} reduced wide onToggleWidth={noop} onClose={noop} onPush={noop} onGoTo={noop} onEdit={noop} pins={[]} onPin={noop} signIn={signIn} />)

describe('(c) Escape waits for a popup over the panel, never for a row opened in it', () => {
  it('an attempt opened in Break-in attempts is a row: open, it never holds the page’s Escape', () => {
    const aws = html(
      <BreakInPanel
        result={runBreakInOnApp(t.policies, 'aws', env)}
        appName="AWS Console"
        reduced={false}
        back={false}
        wide
        onToggleWidth={noop}
        onClose={noop}
        onBack={noop}
        onPlay={noop}
        onOpenRule={noop}
        onFix={noop}
      />,
    )
    const heads = expandables(aws)
    expect(heads.length).toBeGreaterThan(0)
    for (const h of heads) {
      expect(h.tag).toContain('class="sit-att__head"')
      expect(holdsEscape(h.opened), h.tag).toBe(false)
    }
    /* The fold of what held is a native <details>: nothing on it is `aria-expanded` at all. */
    expect(aws).toContain('<details class="sit-att__held">')
  })

  it('every popup in the form holds it while it is open — the pickers, the fact panels — and none while shut', () => {
    const form: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: 'arun', appId: 'github' }
    const rows = rowsRead(t.policies, null, form.appId, lib)
    const out = html(
      <TryPanel
        title="Sign-in"
        form={form}
        rows={rows}
        issues={[]}
        boundaries={boundariesOf(form, rows, {}, t.policies, env, t.zones)}
        tips={tokenTips(readersOf(t.policies, 'github', lib))}
        reduced={false}
        identities={picksOf(form)}
        onIdentities={noop}
        onPatch={noop}
        onRun={noop}
        saved={[]}
        onUseSaved={noop}
        savedOpen={false}
        onSavedOpen={noop}
        ran={null}
        saveOpen={false}
        onSaveOpen={noop}
        wide
        onToggleWidth={noop}
        onClose={noop}
      />,
    )
    const pops = expandables(out)
    expect(pops.length).toBeGreaterThan(1)
    for (const p of pops) {
      expect(holdsEscape(p.opened), p.tag).toBe(true)
      expect(holdsEscape(p.attr), p.tag).toBe(false)
    }
    /* Both kinds the form draws: a Picker's list, and a fact's panel. */
    expect(pops.some((p) => p.attr('role') === 'combobox')).toBe(true)
    expect(pops.some((p) => p.attr('aria-haspopup') === 'dialog')).toBe(true)
  })

  it('the Identity field’s open list is a combobox that says its popup: it holds it; a popup said false does not', () => {
    expect(comboSrc).toMatch(/role="combobox"\s+aria-expanded="true"\s+aria-haspopup="listbox"/)
    const attrs = (a: Record<string, string>): AttrOf => (n) => a[n] ?? null
    expect(holdsEscape(attrs({ role: 'combobox', 'aria-expanded': 'true', 'aria-haspopup': 'listbox' }))).toBe(true)
    expect(holdsEscape(attrs({ role: 'combobox', 'aria-expanded': 'true' }))).toBe(true)
    expect(holdsEscape(attrs({ 'aria-expanded': 'true', 'aria-haspopup': 'menu' }))).toBe(true)
    expect(holdsEscape(attrs({ 'aria-expanded': 'true', 'aria-haspopup': 'false' }))).toBe(false)
    expect(holdsEscape(attrs({ 'aria-expanded': 'true' }))).toBe(false)
    expect(holdsEscape(attrs({ 'aria-expanded': 'false', 'aria-haspopup': 'dialog' }))).toBe(false)
  })

  it('the page asks the panels for an open popup, and a kit dialog open anywhere — Choose a user — holds it too', () => {
    /* A stand-in for the page: what the panels hold that says it is expanded. */
    const asked: string[] = []
    const pageOf = (els: Record<string, string>[]) =>
      ({
        querySelectorAll: (sel: string) => {
          asked.push(sel)
          return els.map((a) => ({ getAttribute: (n: string) => a[n] ?? null }))
        },
      }) as unknown as ParentNode
    const row = { class: 'sit-att__head', 'aria-expanded': 'true' }
    const list = { role: 'combobox', 'aria-expanded': 'true', 'aria-haspopup': 'listbox' }
    expect(popupOpen(pageOf([row]), () => false)).toBe(false)
    expect(popupOpen(pageOf([row, list]), () => false)).toBe(true)
    expect(popupOpen(pageOf([]), () => true)).toBe(true)
    expect(popupOpen(pageOf([]), () => false)).toBe(false)
    expect(asked[0]).toBe('.sit-panel [aria-expanded="true"]')
    /* The dialog is the kit's own count of what is open (dialog-chrome.ts), not a guess at the DOM. */
    expect(keysSrc).toContain("import { hasOpenDialog } from '../../dialog-chrome'")
    expect(keysSrc).toContain('dialogOpen: () => boolean = hasOpenDialog')
  })

  it('the inspector holds nothing: its names are presses, and no row in it waits on the Escape', () => {
    const plan = runOf({ ...emptyDraft(TODAY, '09:30'), personId: 'u-leo', appId: 'aws' })
    const decider = plan.decider
    expect(decider).not.toBeNull()
    if (!decider) return
    const policy = t.policies.find((p) => p.id === decider.id)!
    for (const stack of [[{ kind: 'policy', policyId: policy.id }], [{ kind: 'policy', policyId: policy.id }, { kind: 'rule', policyId: policy.id, ruleId: policy.rules[0].id }]] as InspectTarget[][]) {
      const out = inspector(plan, stack, { personId: 'u-leo', appId: 'aws' })
      expect(out).toContain('class="bb__insp sit-panel insp"')
      expect(expandables(out).filter((e) => holdsEscape(e.opened))).toEqual([])
    }
  })

  it('Classic v2’s rules on the canvas are rows too — and outside the panels besides', () => {
    const at = classicSrc.indexOf('className="rl-c2__rulehead"')
    expect(at).toBeGreaterThan(0)
    const head = classicSrc.slice(classicSrc.lastIndexOf('<button', at), classicSrc.indexOf('</button>', at))
    expect(head).toContain('aria-expanded=')
    expect(head).not.toContain('aria-haspopup')
    expect(PANEL).toBe('.sit-panel')
    expect(classicSrc).not.toContain('sit-panel')
  })

  it('the page asks page-keys, and takes the key as it shuts — so the Brief’s own panel Escape never shuts it twice', () => {
    expect(pageSrc).toContain("import { openerOf, popupOpen, refocus } from './sign-in-tests/page-keys'")
    expect(pageSrc).toMatch(/if \(e\.key !== 'Escape' \|\| e\.defaultPrevented\) return\s+if \(popupOpen\(\)\) return\s+e\.preventDefault\(\)\s+closeLatest\.current\(\)/)
    expect(pageSrc).not.toContain(`'.sit-panel [aria-expanded="true"]'`)
    /* The Brief's panel listens after the page, on the way up, and stands back for a key already taken. */
    expect(briefPanelSrc).toMatch(/const onKey = \(e: KeyboardEvent\) => \{\s+if \(e\.key !== 'Escape' \|\| e\.defaultPrevented\) return/)
  })
})

describe('(d) a panel shut gives the focus back to what opened it — then the doors, Focus’s last', () => {
  /* Stand-ins for the page's elements: where they stand, and whether they take the focus. */
  const page = { active: null as unknown }
  const door = (o: { connected?: boolean; inPanel?: boolean; takes?: boolean } = {}): Door & { pressed: number } => {
    const d = {
      pressed: 0,
      isConnected: o.connected ?? true,
      closest: (sel: string) => (sel === PANEL && o.inPanel ? {} : null),
      focus: () => {
        d.pressed += 1
        if (o.takes ?? true) page.active = d
      },
    }
    return d
  }
  const active = () => page.active

  it('the opener takes it back while it is on the page, outside the panels, and focusable', () => {
    const name = door()
    expect(refocus(name, active)).toBe(true)
    expect(page.active).toBe(name)
  })

  it('an opener gone from the page, inside a panel, or no longer focusable hands on to the doors', () => {
    page.active = null
    const gone = door({ connected: false })
    expect(refocus(gone, active)).toBe(false)
    expect(gone.pressed).toBe(0)
    const inside = door({ inPanel: true })
    expect(refocus(inside, active)).toBe(false)
    expect(inside.pressed).toBe(0)
    /* A name in a card folded since: asked, it does not take the focus. */
    const folded = door({ takes: false })
    expect(refocus(folded, active)).toBe(false)
    expect(folded.pressed).toBe(1)
    expect(refocus(null, active)).toBe(false)
  })

  it('what a panel keeps as its opener: what had the focus on the canvas; the first one’s, opened from inside a panel', () => {
    const body = door()
    const name = door()
    const strip = door()
    const inPanel = door({ inPanel: true })
    expect(openerOf(name, null, body)).toBe(name)
    expect(openerOf(body, null, body)).toBeNull()
    expect(openerOf(null, strip, body)).toBeNull()
    /* The why's Review attempts: pressed inside the why, the strip that opened the why stands. */
    expect(openerOf(inPanel, strip, body)).toBe(strip)
    /* Nothing open: a press inside a panel on its way out is no opener. */
    expect(openerOf(inPanel, null, body)).toBeNull()
    /* Another name on the canvas pressed while the inspector is open: that name. */
    expect(openerOf(name, strip, body)).toBe(name)
  })

  it('the page notes the opener as each panel opens — a name, the attempts, the why, the form, the saved, the blocked', () => {
    expect(pageSrc).toContain('opener.current = openerOf(a instanceof HTMLElement ? a : null, panel !== null ? opener.current : null, document.body)')
    expect(pageSrc).toMatch(/const onInspect = \(t: InspectTarget, plan: EngineRun, fresh = false\) => \{\s+noteOpener\(\)/)
    expect(pageSrc).toMatch(/if \(from === 'outcome' && panel === 'break-in'\) \{\s+closePanel\(\)\s+return\s+\}\s+if \(leaving\.current\) leaving\.current\.keepFocus = true\s+noteOpener\(\)/)
    expect(pageSrc).toMatch(/onOpen: \(o: boolean\) => \{\s+if \(o\) \{\s+noteOpener\(\)/)
    expect(pageSrc).toMatch(/const openPanel = \(then\?: \(\) => void\) => \{[\s\S]*?noteOpener\(\)\s+setPanel\('form'\)/)
    expect(pageSrc).toMatch(/const openSaved = \(\) => \{\s+if \(leaving\.current\) leaving\.current\.keepFocus = true\s+noteOpener\(\)/)
    expect(pageSrc).toMatch(/const openBlocked = \(\) => \{\s+noteOpener\(\)\s+setPanel\('blocked'\)/)
  })

  it('shut, the opener first; then the old layouts’ doors; then Focus’s — its Break-in attempts or Why link, its Replay, the canvas', () => {
    expect(pageSrc).toMatch(/const opened = opener\.current\s+opener\.current = null\s+setPanel\(null\)/)
    expect(pageSrc).toMatch(/window\.requestAnimationFrame\(\(\) => \{\s+if \(refocus\(opened\)\) return/)
    expect(pageSrc).toContain(
      "const onFocus = () => (from === 'break-in' ? at('.f2cb__break') : from === 'why' ? at('.rl-c2__why') : null) ?? at('.rl-c2__replay') ?? at('.tj-canvas')",
    )
    expect(pageSrc).toContain("const back = at('.tj-hero__attempts') ?? at('button.tj-hero__strip') ?? at('.tj-engine__replay button') ?? onFocus()")
    expect(pageSrc).toContain("const back = document.querySelector<HTMLElement>(WHY_DOOR) ?? at('.tj-engine__replay button') ?? onFocus()")
    expect(pageSrc).toContain("document.querySelector<HTMLElement>('.sit__stage .tj-engine__replay button, .sit__stage .tj-sin2__edit') ?? onFocus()")
    /* Focus draws each of them: the bar's Break-in attempts, the outcome card's Why link (focus2-why.tsx's own door for a
       focus left on nothing, which the canvas taken first would beat), the Replay on its sign-in card, and a canvas that
       takes the focus. */
    expect(barSrc).toContain('className={`f2cb__btn f2cb__break')
    expect(classicSrc).toContain('<button type="button" className="rl-c2__why"')
    expect(pillSrc).toContain('className="bb__act rl-c2__replay"')
    expect(classicSrc).toContain('className="bb__act rl-c2__replay"')
    expect(journeySrc).toContain('className={`tj-canvas is-layout is-${layout}`} tabIndex={-1}')
  })
})

describe('(f) a group’s check never names the member who stands for it as the person', () => {
  const group = t.groups.find((g) => memberOf(people, g.id))!
  const standIn = memberOf(people, group.id)!
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), appId: 'aws' }
  const settled = (p: Partial<TryPage>): TryPage => ({ ...initialTryPage(2, TODAY, '09:30'), mode: 'journey', played: 2, ...p })

  it('a group pick runs as its stand-in, and the page knows it as the group', () => {
    const { form, ran } = runOfPicks(base, [`${GROUP_PREFIX}${group.id}`], people, null)
    expect(form.personId).toBe(standIn.id)
    expect(asGroupOf(settled({ ran }), form, people)).toBe(group.id)
    /* The same person picked as herself is no group. */
    const own = runOfPicks(base, [standIn.id], people, null)
    expect(asGroupOf(settled({ ran: own.ran }), own.form, people)).toBeNull()
  })

  it('the page hands the inspector no person while the run stands for a group', () => {
    expect(pageSrc).toContain('const ranForm = session.form')
    expect(pageSrc).toContain('const asGroup = asGroupOf(tryPage, ranForm, users)')
    expect(pageSrc).toContain('signIn={{ personId: asGroup ? null : session.form.personId, appId: session.form.appId }}')
  })

  it('so Related names the application alone — never the stand-in as the person', () => {
    const plan = runOf({ ...base, personId: standIn.id })
    const top: InspectTarget = plan.decider ? { kind: 'policy', policyId: plan.decider.id } : { kind: 'app', id: 'aws' }
    const related = (out: string) => {
      const at = out.indexOf('aria-label="Sign-in"')
      return at < 0 ? '' : text(out.slice(at, out.indexOf('</ul>', at)))
    }
    const asGroup = related(inspector(plan, [top], { personId: null, appId: 'aws' }))
    expect(asGroup).toContain('AWS Console')
    expect(asGroup).not.toContain(standIn.name)
    expect(asGroup).not.toContain('Person')
    /* Given a person, the same panel names them: the null is what keeps the stand-in out. */
    expect(related(inspector(plan, [top], { personId: standIn.id, appId: 'aws' }))).toContain(standIn.name)
  })
})
