/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import kitSrc from './kit.tsx?raw'
import { describeBy, nameOf, tipAdds, tipTarget } from './tip-describe'

/* What a Tip tells a screen reader (V4 review MAP-6, tables-check T11). The
   suite has no DOM, so the elements here are the few methods Tip calls. */

function el(attrs: Record<string, string> = {}, text = '') {
  const a = new Map(Object.entries(attrs))
  return {
    textContent: text,
    getAttribute: (k: string) => a.get(k) ?? null,
    setAttribute: (k: string, v: string) => void a.set(k, v),
    removeAttribute: (k: string) => void a.delete(k),
    has: (k: string) => a.has(k),
  }
}

describe('what a tip adds to the name of the control it describes', () => {
  it('adds nothing when it repeats the name, as an icon button’s tip does', () => {
    expect(tipAdds('Replay', 'Replay')).toEqual({ kind: 'none' })
    expect(tipAdds('Zoom in.', 'zoom in')).toEqual({ kind: 'none' })
    expect(tipAdds('  ', 'Replay')).toEqual({ kind: 'none' })
  })

  it('adds nothing when the name already carries it (the Describe chip’s reason)', () => {
    expect(tipAdds('No zone is called that.', 'Not added: from Tor. No zone is called that.')).toEqual({ kind: 'none' })
  })

  it('adds only the rest when it opens with the name', () => {
    expect(tipAdds('Documentation. Coming soon.', 'Documentation')).toEqual({ kind: 'rest', text: 'Coming soon.' })
    expect(tipAdds('Settings · Not built in this prototype.', 'Settings')).toEqual({ kind: 'rest', text: 'Not built in this prototype.' })
  })

  it('adds all of it otherwise', () => {
    expect(tipAdds('Global Default Policy · Baseline access', 'Try Priya Sharma on Microsoft Outlook: Deny')).toEqual({ kind: 'all' })
    expect(tipAdds('Each cell is this sign-in for that person.', 'About these answers')).toEqual({ kind: 'all' })
    expect(tipAdds('Why', '')).toEqual({ kind: 'all' })
    /* The name as whole words only. */
    expect(tipAdds('Running checks', 'Run')).toEqual({ kind: 'all' })
  })

  it('reads the name the way a reader does: the aria-label, else the words inside', () => {
    expect(nameOf(el({ 'aria-label': 'About these answers' }, 'ignored'))).toBe('About these answers')
    expect(nameOf(el({}, '  Documentation '))).toBe('Documentation')
  })
})

describe('the control a tip describes', () => {
  const button = { tag: 'button' }
  const wrapWith = (inside: unknown) => ({
    contains: (x: unknown) => x === inside,
    querySelector: () => inside as Element | null,
  })

  it('is the focused control inside it, else the first control inside it', () => {
    const w = wrapWith(button)
    expect(tipTarget(w, button as unknown as Element)).toBe(button)
    expect(tipTarget(w, null)).toBe(button)
  })

  it('is nothing when the tip wraps a span with no control inside: nothing changes', () => {
    const w = wrapWith(null)
    expect(tipTarget(w, null)).toBeNull()
    /* A focused control AROUND the tip (a row-sized button) is not inside it. */
    expect(tipTarget(w, { tag: 'row' } as unknown as Element)).toBeNull()
    expect(tipTarget(null, null)).toBeNull()
  })
})

describe('the description, while the tip is open', () => {
  it('is added to the control’s own and taken off on close, leaving no empty attribute', () => {
    const b = el()
    const off = describeBy(b, 'tip-1')
    expect(b.getAttribute('aria-describedby')).toBe('tip-1')
    off?.()
    expect(b.has('aria-describedby')).toBe(false)
  })

  it('keeps a description of the control’s own', () => {
    const b = el({ 'aria-describedby': 'line-7' })
    const off = describeBy(b, 'tip-1')
    expect(b.getAttribute('aria-describedby')).toBe('line-7 tip-1')
    off?.()
    expect(b.getAttribute('aria-describedby')).toBe('line-7')
  })

  it('is not added twice', () => {
    const b = el({ 'aria-describedby': 'tip-1' })
    expect(describeBy(b, 'tip-1')).toBeNull()
    expect(b.getAttribute('aria-describedby')).toBe('tip-1')
  })

  it('is wired in the kit’s Tip: on open, by what the tip adds, the rest said by a hidden element of its own', () => {
    const tip = kitSrc.slice(kitSrc.indexOf('export function Tip('), kitSrc.indexOf('export function TipDot('))
    expect(tip).toContain('tipTarget(anchor.current, document.activeElement)')
    expect(tip).toContain("if (adds.kind === 'none') return")
    expect(tip).toContain("describeBy(trigger, adds.kind === 'rest' ? restId : id)")
    expect(tip).toMatch(/<span id=\{restId\} hidden>/)
    /* Opened by focus, closed by blur: the description lives exactly as long. */
    expect(tip).toContain('onFocusCapture={() => setOpen(true)}')
    expect(tip).toContain('onBlurCapture={() => setOpen(false)}')
    /* The icon button's tip is its label: described by nothing. */
    const icon = kitSrc.slice(kitSrc.indexOf('export function IconButton('), kitSrc.indexOf('export function IconButton(') + 1200)
    expect(icon).toContain('<Tip text={label}>')
    expect(icon).toContain('aria-label={label}')
  })
})
