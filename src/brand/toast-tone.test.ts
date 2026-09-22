import { describe, expect, it } from 'vitest'

import { toastDuration, toastTone } from './toast-tone'

describe('what kind of news a toast is', () => {
  it('reads a finished task as a success', () => {
    for (const t of ['Draft saved', 'Key copied', 'CA chain uploaded', 'Office created', 'Rule 2 duplicated', 'Default is now TOTP']) {
      expect(toastTone(t), t).toBe('success')
    }
  })

  it('reads a removal as a removal, even when it offers Undo', () => {
    for (const t of ['Device profile condition removed', 'Office deleted', 'Changes discarded. Press Ctrl+Z to undo.']) {
      expect(toastTone(t), t).toBe('removed')
    }
  })

  it('reads a failure as an error before anything else it mentions', () => {
    expect(toastTone('Could not copy the key — select it instead')).toBe('error')
    expect(toastTone('Could not delete Office')).toBe('error')
  })

  it('reads a request to do something first as a warning', () => {
    for (const t of ['Turn on another method first', 'No changes to review', 'Adding an Azure NPS server is outside the scope of this revamp']) {
      expect(toastTone(t), t).toBe('warning')
    }
  })

  it('falls back to info', () => {
    expect(toastTone('Rule 2 switched off')).toBe('info')
  })

  it('stays longer when there is something to press', () => {
    expect(toastDuration(true)).toBeGreaterThan(toastDuration(false))
  })
})
