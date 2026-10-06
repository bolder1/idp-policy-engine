import { describe, expect, it } from 'vitest'

import { playerKeyAction } from './focus2-player-model'

describe('focus2 walkthrough keys', () => {
  const keys = { at: 4, count: 8, reached: 4, landed: false, paused: false }

  it('steps a moment with the arrows, and never past where the story has got', () => {
    expect(playerKeyAction('ArrowLeft', keys)).toEqual({ do: 'jump', index: 3 })
    expect(playerKeyAction('ArrowRight', keys)).toBe(null)
    expect(playerKeyAction('ArrowRight', { ...keys, reached: 6 })).toEqual({ do: 'jump', index: 5 })
    expect(playerKeyAction('ArrowLeft', { ...keys, at: 0 })).toBe(null)
    /* Landed, the whole story is in reach. */
    expect(playerKeyAction('ArrowRight', { ...keys, landed: true })).toEqual({ do: 'jump', index: 5 })
  })

  it('holds the story with Space, and lets it go again', () => {
    expect(playerKeyAction(' ', keys)).toEqual({ do: 'pause' })
    expect(playerKeyAction(' ', { ...keys, paused: true })).toEqual({ do: 'resume' })
    expect(playerKeyAction(' ', { ...keys, landed: true })).toBe(null)
  })

  it('lands the story on Esc, and goes to the ends on Home and End', () => {
    expect(playerKeyAction('Escape', keys)).toEqual({ do: 'land' })
    expect(playerKeyAction('Escape', { ...keys, landed: true })).toBe(null)
    expect(playerKeyAction('Home', keys)).toEqual({ do: 'jump', index: 0 })
    expect(playerKeyAction('End', { ...keys, reached: 6 })).toEqual({ do: 'jump', index: 6 })
    expect(playerKeyAction('End', { ...keys, landed: true })).toEqual({ do: 'jump', index: 7 })
    expect(playerKeyAction('k', keys)).toBe(null)
    expect(playerKeyAction('ArrowRight', { ...keys, count: 0 })).toBe(null)
  })
})
