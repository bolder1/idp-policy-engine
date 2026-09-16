import { describe, expect, it } from 'vitest'

import { tabMove, type TabState } from './dialog-chrome'

const at = (over: Partial<TabState>): TabState => ({
  prevented: false,
  shift: false,
  count: 3,
  inPanel: true,
  inPopup: false,
  onPanel: false,
  atFirst: false,
  atLast: false,
  ...over,
})

describe('tabMove', () => {
  it('lets the browser move focus between controls in the middle', () => {
    expect(tabMove(at({}))).toBeNull()
    expect(tabMove(at({ shift: true }))).toBeNull()
  })

  it('wraps at both ends', () => {
    expect(tabMove(at({ atLast: true }))).toBe('first')
    expect(tabMove(at({ shift: true, atFirst: true }))).toBe('last')
    expect(tabMove(at({ shift: true, onPanel: true }))).toBe('last')
  })

  it('holds focus on the panel when nothing inside can take it', () => {
    expect(tabMove(at({ count: 0 }))).toBe('panel')
  })

  it('brings focus that wandered out back in at the near end', () => {
    expect(tabMove(at({ inPanel: false }))).toBe('first')
    expect(tabMove(at({ inPanel: false, shift: true }))).toBe('last')
  })

  it('leaves a portalled popup the dialog opened to handle its own Tab', () => {
    expect(tabMove(at({ inPanel: false, inPopup: true }))).toBeNull()
  })

  it('does nothing when another handler already routed the key', () => {
    expect(tabMove(at({ prevented: true, atLast: true }))).toBeNull()
    expect(tabMove(at({ prevented: true, inPanel: false }))).toBeNull()
  })
})
