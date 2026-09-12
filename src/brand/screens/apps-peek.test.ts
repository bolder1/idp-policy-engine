/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import peekSrc from './apps-peek.tsx?raw'
import policiesSrc from './Policies.tsx?raw'
import screensCss from '../screens.css?raw'
import { STACK_MAX, countLabel, stackName, stackOf } from './app-stack'
import type { App } from '../data'

/* The Applications cell on the policy list: up to four marks and a count, and a
   panel listing every application, with Edit inside it.

   The arithmetic is tested as arithmetic. The rest greps the source, like
   `edition.test.ts` and `routes.test.ts` do, because what matters is WHERE
   things are. Is Edit inside the portal or on the cell? Does the list carry a
   scroll cap? A render test only proves the paths it happens to walk, and this
   repo does not stand the provider tree up for tests anyway. */

const app = (i: number) => ({ id: `app-${i}`, name: `App ${i}` }) as App
const many = (n: number) => Array.from({ length: n }, (_, i) => app(i + 1))

/* Split the component at its portal: the trigger is everything the table
   renders, and the panel is everything that goes to the body. */
const portalAt = peekSrc.indexOf('createPortal(')
const trigger = peekSrc.slice(peekSrc.indexOf('ref={anchor}'), portalAt)
const panel = peekSrc.slice(portalAt, peekSrc.indexOf('document.body', portalAt))

/* Comments stripped. The sheet discusses its own selectors in prose, and a
   mention must not pass for a rule. */
const css = screensCss.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every declaration block whose selector list names `name`. */
function rulesFor(name: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => new RegExp(`${name.replace(/[.]/g, '\\.')}(?![\\w-])`).test(s)))
    .map((m) => m[2])
}

describe('the stack in the cell', () => {
  it('caps the marks at four', () => {
    expect(STACK_MAX).toBe(4)
    expect(stackOf(many(2)).logos).toHaveLength(2)
    expect(stackOf(many(4)).logos).toHaveLength(4)
    expect(stackOf(many(5)).logos).toHaveLength(4)
    expect(stackOf(many(120)).logos).toHaveLength(4)
  })

  it('counts what it does not draw, and only then', () => {
    expect(stackOf(many(1)).more).toBe(0)
    expect(stackOf(many(4)).more).toBe(0)
    expect(stackOf(many(5)).more).toBe(1)
    expect(stackOf(many(120)).more).toBe(116)
  })

  it('draws the capped logos and prints the count as +N', () => {
    expect(trigger).toContain('logos.map(')
    expect(trigger).not.toContain('apps.map(')
    expect(trigger).toMatch(/more > 0 &&/)
    expect(trigger).toContain('+{more}')
  })

  it('names the stack with what the logos stand for, in the words the cell prints', () => {
    expect(stackName(many(6))).toBe('App 1, App 2, App 3, App 4, +2 more')
    expect(stackName(many(3))).toBe('App 1, App 2, App 3')
    expect(countLabel(1)).toBe('1 application')
    expect(countLabel(6)).toBe('6 applications')
  })

  it('keeps the name beside a lone application', () => {
    expect(trigger).toMatch(/apps\.length === 1 \?/)
    expect(trigger).toContain('appsLabel(apps)')
  })
})

describe('the panel', () => {
  it('finds the portal to check', () => {
    // A slice that silently matched nothing would make every assertion below vacuous.
    expect(portalAt).toBeGreaterThan(0)
    expect(panel.length).toBeGreaterThan(200)
    expect(trigger.length).toBeGreaterThan(200)
  })

  it('lists every application, as a real list', () => {
    expect(panel).toContain('<ul')
    expect(panel).toContain('<li')
    expect(panel).toContain('apps.map(')
    expect(panel).not.toContain('logos.map(')
  })

  it('holds the Edit button, and the cell does not', () => {
    expect(panel).toMatch(/<Button[^>]*onClick=\{edit\}/)
    expect(trigger).not.toContain('onClick={edit}')
    expect(trigger).not.toContain('onEdit')
    // Pressing the cell opens the panel. It does not skip straight to editing.
    expect(trigger).toContain('onClick={() => show(0)}')
  })

  it('is wired to the same change-applications flow the cell used to open', () => {
    expect(policiesSrc).toContain('<AppsPeek')
    expect(policiesSrc).toContain('onEdit={() => setAssigning(true)}')
    expect(policiesSrc).not.toContain('btable__app--edit')
    // The empty state is unchanged: still its own control, still opening the same dialog.
    expect(policiesSrc).toMatch(/className="btable__assign" onClick=\{\(\) => setAssigning\(true\)\}/)
  })

  it('scrolls its list inside a max-height, and never grows past the viewport', () => {
    const list = rulesFor('.bapk__list').join(';')
    expect(list).toMatch(/max-height:\s*\d+px/)
    expect(list).toMatch(/overflow-y:\s*auto/)

    const box = rulesFor('.bapk').join(';')
    expect(box).toMatch(/position:\s*fixed/)
    expect(box).toMatch(/max-height:[^;]*100vh/)
  })

  it('uses no orange', () => {
    // --accent is slate in this console. --brand is the one orange, and it is not for hover or selection.
    for (const name of ['.bapk', '.bapk__head', '.bapk__list', '.bapk__row', '.btable__app--peek', '.btable__logos', '.btable__more']) {
      const found = rulesFor(name)
      expect(`${name}: ${found.length > 0}`).toBe(`${name}: true`)
      expect(`${name}: ${found.some((r) => r.includes('--brand'))}`).toBe(`${name}: false`)
    }
  })
})
