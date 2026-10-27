import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { apps as seed, type App } from '../data'
import { APP_TOKEN_FIELD, AppTransfer, FOLD_IN_USE, SHOW_IN_USE } from './app-transfer'
import transferSrc from './app-transfer.tsx?raw'
import transferCss from './app-transfer.css?raw'
import policiesSrc from './Policies.tsx?raw'

/* The application picker as one field (owner, 24 Oct 2026: "merge both so one place where we show the added and form
   search as we have in Google or other apps. so whatever we select add to the input, and let the user know they can
   search from there as well"). Static markup only: the keys are held in app-tokens.test.ts, the presses in the
   browser. */

const pickApps = (...ids: string[]): App[] =>
  ids.map((id) => {
    const a = seed.find((x) => x.id === id)
    if (!a) throw new Error(`No seed application ${id}`)
    return a
  })
const apps = pickApps('salesforce', 'workday', 'slack', 'zoom', 'servicenow')
const owners: Record<string, string> = { slack: 'Slack access' }

function render(picked: string[], emptyNote?: string, openInUse?: boolean): string {
  return renderToStaticMarkup(
    <AppTransfer
      apps={apps}
      picked={picked}
      onChange={() => {}}
      takenBy={(id) => (picked.includes(id) ? undefined : owners[id])}
      emptyNote={emptyNote ? <p className="note">{emptyNote}</p> : undefined}
      openInUse={openInUse}
    />,
  )
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The text of the element with this id. */
const textOfId = (html: string, id: string) => html.match(new RegExp(`id="${esc(id)}"[^>]*>([^<]*)<`))?.[1]
const count = (html: string, s: string) => html.split(s).length - 1

describe('the applications field', () => {
  it('is the one drawing in use', () => {
    expect(APP_TOKEN_FIELD).toBe(true)
    expect(SHOW_IN_USE).toBe(true)
  })

  it('puts the chosen applications inside the field, before the search, each with its own Remove', () => {
    const out = render(['salesforce', 'zoom'])
    const field = out.indexOf('class="bxt"')
    const input = out.indexOf('class="bxt__input"')
    expect(field).toBeGreaterThan(-1)
    expect(input).toBeGreaterThan(field)
    for (const name of ['Salesforce', 'Zoom']) {
      const x = out.indexOf(`aria-label="Remove ${name}"`)
      expect(x).toBeGreaterThan(field)
      expect(x).toBeLessThan(input)
    }
    /* Each × is a real button. */
    expect(out).toMatch(/<button type="button" class="bxt__x" aria-label="Remove Salesforce"/)
    /* Each chip has its logo: AppLogo's box, with the name as its title. */
    expect(out).toMatch(/class="bxt__chip"[^>]*>(<span class="applogo[^"]*"[^>]*title="Salesforce")/)
  })

  it('has no second block of chips, and no gap where one stood', () => {
    const out = render(['salesforce'])
    expect(out).not.toContain('bxc__chosen')
    expect(out).not.toContain('None added yet')
    expect(out).not.toContain('bx-search')
    expect(count(out, '>In this policy<')).toBe(1)
  })

  it('names the search, and says in it that typing there finds more', () => {
    expect(render([])).toMatch(/<input[^>]*aria-label="Search applications"[^>]*>/)
    expect(render([])).toMatch(/<input[^>]*placeholder="Search applications"/)
    expect(render(['zoom'])).toMatch(/<input[^>]*placeholder="Search to add more"/)
    expect(render(['zoom'])).toMatch(/<input[^>]*aria-label="Search applications"/)
  })

  it('labels the chips In this policy, and the list Applications to add', () => {
    const out = render(['zoom'])
    const group = out.match(/role="group" aria-labelledby="([^"]+)"/)?.[1]
    expect(group).toBeTruthy()
    expect(textOfId(out, group!)).toBe('In this policy')
    const list = out.match(/<ul[^>]*aria-labelledby="([^"]+)"/)?.[1]
    expect(list).toBeTruthy()
    expect(textOfId(out, list!)).toBe('Applications to add')
    /* The label above the box is the search's label too, so a press on it lands in the search. */
    const inputId = out.match(/<input[^>]*id="([^"]+)"/)?.[1]
    expect(out).toContain(`for="${inputId}"`)
  })

  it('says each change to a screen reader, politely', () => {
    expect(render([])).toMatch(/<span class="u-sr-only" role="status" aria-live="polite">/)
    expect(transferSrc).toContain('setSaid(`${nameOf(appId)} added`)')
    expect(transferSrc).toContain('setSaid(`${nameOf(appId)} removed`)')
  })

  it('takes an added application out of the list, and gives a removed one back', () => {
    const before = render([])
    expect(before).toContain('aria-label="Add Zoom"')
    expect(before).not.toContain('aria-label="Remove Zoom"')
    const after = render(['zoom'])
    expect(after).toContain('aria-label="Remove Zoom"')
    expect(after).not.toContain('aria-label="Add Zoom"')
    /* Every other application is still offered, each with its logo. */
    for (const name of ['Salesforce', 'Workday', 'ServiceNow']) expect(after).toContain(`aria-label="Add ${name}"`)
  })

  it('keeps an application on another policy off, saying which, and never offers it to add', () => {
    const out = render(['zoom'], undefined, true)
    expect(out).not.toContain('aria-label="Add Slack"')
    expect(out).toMatch(/<button type="button" class="bxl__row is-used" aria-disabled="true" aria-label="Slack, in use on Slack access"/)
    expect(out).toContain('<em>Slack access</em>')
    /* After every application that can be added. */
    expect(out.indexOf('Slack, in use on')).toBeGreaterThan(out.indexOf('aria-label="Add ServiceNow"'))
  })

  /* Owner, 26 Oct 2026: "this section can be an accordion, only if the user wants they can see the app list". */
  describe('the applications on another policy', () => {
    it('are folded until asked for: the line is a button with how many it holds, and none of the rows are drawn', () => {
      expect(FOLD_IN_USE).toBe(true)
      const out = render(['zoom'])
      expect(out).toMatch(/<button[^>]*class="bxt__fold"[^>]*aria-expanded="false"/)
      expect(out).toMatch(/In use on another policy · 1/)
      expect(out).not.toContain('Slack, in use on')
      expect(out).not.toContain('<em>Slack access</em>')
      /* The ones that can be added are untouched. */
      for (const name of ['Salesforce', 'Workday', 'ServiceNow']) expect(out).toContain(`aria-label="Add ${name}"`)
    })

    it('open under their line once it is pressed', () => {
      const out = render(['zoom'], undefined, true)
      expect(out).toMatch(/<button[^>]*class="bxt__fold"[^>]*aria-expanded="true"/)
      expect(out.indexOf('Slack, in use on')).toBeGreaterThan(out.indexOf('class="bxt__fold"'))
    })

    it('draw no line at all when nothing is on another policy', () => {
      const out = renderToStaticMarkup(<AppTransfer apps={apps} picked={['zoom']} onChange={() => {}} takenBy={() => undefined} />)
      expect(out).not.toContain('bxt__fold')
      expect(out).not.toContain('In use on another policy')
    })

    it('stay open while words are typed, so a search for one says where it is', () => {
      expect(transferSrc).toMatch(/const folded = FOLD_IN_USE && !typed/)
      expect(transferSrc).toMatch(/const usedOpen = !folded \|\| showUsed/)
    })

    it('are a stop on the way down the list, so the arrow keys reach their line', () => {
      expect(transferSrc).toContain("'button.bxl__row, button.bxt__fold'")
    })
  })

  it('says what an empty list means right under the field, and only while it is empty', () => {
    const note = 'With no applications this policy becomes a draft.'
    const empty = render([], note)
    const at = empty.indexOf(note)
    expect(at).toBeGreaterThan(empty.indexOf('class="bxt__input"'))
    expect(at).toBeLessThan(empty.indexOf('Applications to add'))
    expect(render(['zoom'], note)).not.toContain(note)
  })

  it('ends the list when every application that is free is in the field', () => {
    const all = renderToStaticMarkup(<AppTransfer apps={apps} picked={apps.map((a) => a.id)} onChange={() => {}} takenBy={() => undefined} />)
    expect(all).toContain('Every application is in this policy')
    /* With one on another policy, that sentence would be untrue: the greyed row says why instead. */
    expect(render(['salesforce', 'workday', 'zoom', 'servicenow'])).not.toContain('Every application is in this policy')
  })

  it('stops Escape only when it cleared words, so an empty search lets the dialog close', () => {
    expect(transferSrc).toMatch(/act\.do === 'clear'\) \{[\s\S]{0,160}e\.stopPropagation\(\)/)
    expect(count(transferSrc.slice(transferSrc.indexOf('function AppTokens')), 'stopPropagation')).toBe(1)
  })

  it('keeps the focus in the search after a pick, without moving the page', () => {
    expect(transferSrc).toContain('input.current?.focus({ preventScroll: !scroll })')
  })

  it('draws the field with the search box’s tokens and the console’s one pill, nothing restated', () => {
    const field = transferCss.slice(transferCss.indexOf('/* --- One field'))
    expect(field).toContain('border: var(--bw-thin) solid var(--ctl-border)')
    expect(field).toContain('.bxt:focus-within')
    expect(field).toContain('border-radius: var(--pill-radius)')
    /* Grows to three lines, then scrolls inside. */
    expect(field).toMatch(/max-height: calc\(var\(--space-8\) \* 3/)
    expect(field).toContain('overflow-y: auto')
    expect(field).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(field).not.toMatch(/transform/)
  })

  it('has the Applications dialog say its draft line next to the field, not as a block after it', () => {
    const dialog = policiesSrc.slice(policiesSrc.indexOf('function AssignAppsDialog'))
    expect(dialog).toMatch(/emptyNote=\{\s*policy\.status !== 'draft' \? <p className="bassign__foot">With no applications, this policy becomes a draft\.<\/p>/)
    expect(count(dialog, 'With no applications')).toBe(1)
  })
})
