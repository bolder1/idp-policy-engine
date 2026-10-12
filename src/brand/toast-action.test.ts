/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { pressToastAction } from './toast-action'
import type { ToastAction } from './store'
import shellSrc from './Shell.tsx?raw'

/* A toast's action runs once (review 10 Oct 2026, #8). An Undo that worked
   left its toast up with a live Undo, and a second press found the policy
   changed by the first and said "Can't undo". The store here is a stand-in
   that applies each set at once, in order — which is also what React's
   batching of the press's updates comes to. */

interface Shown {
  id: number
  text: string
  action?: ToastAction
}

function toaster() {
  let seq = 0
  const state: { toast: Shown | null } = { toast: null }
  return {
    state,
    show: (text: string, action?: ToastAction) => {
      seq += 1
      state.toast = { id: seq, text, action }
    },
    dismiss: () => {
      state.toast = null
    },
  }
}

describe('a toast action, pressed', () => {
  it('runs once however often it is pressed, and the toast goes', () => {
    const t = toaster()
    let runs = 0
    t.show('Policy added to Slack.', { label: 'Undo', run: () => (runs += 1) })
    const shown = t.state.toast!
    const ran = { current: null }
    expect(pressToastAction(shown, ran, t.dismiss)).toBe(true)
    /* A double-click, or a click on the toast as it slides out. */
    expect(pressToastAction(shown, ran, t.dismiss)).toBe(false)
    expect(runs).toBe(1)
    expect(t.state.toast).toBeNull()
  })

  it('leaves standing the toast the action shows in turn', () => {
    const t = toaster()
    t.show('Rule removed.', { label: 'Undo', run: () => t.show('Restored') })
    pressToastAction(t.state.toast!, { current: null }, t.dismiss)
    expect(t.state.toast?.text).toBe('Restored')
  })

  it('keeps the follow-up toast’s own action live (Monitor, then its Undo)', () => {
    const t = toaster()
    let undone = 0
    t.show('Policy saved', { label: 'Monitor', run: () => t.show('Policy is monitoring', { label: 'Undo', run: () => (undone += 1) }) })
    const ran = { current: null }
    pressToastAction(t.state.toast!, ran, t.dismiss)
    const next = t.state.toast!
    expect(next.text).toBe('Policy is monitoring')
    expect(pressToastAction(next, ran, t.dismiss)).toBe(true)
    expect(undone).toBe(1)
  })

  it('plays its cue before the action, and only when it runs', () => {
    const t = toaster()
    const order: string[] = []
    t.show('Policy added to Slack.', { label: 'Undo', run: () => order.push('run') })
    const shown = t.state.toast!
    const ran = { current: null }
    pressToastAction(shown, ran, t.dismiss, () => order.push('cue'))
    pressToastAction(shown, ran, t.dismiss, () => order.push('cue'))
    expect(order).toEqual(['cue', 'run'])
  })

  it('does nothing for a toast with no action', () => {
    const t = toaster()
    t.show('Saved')
    expect(pressToastAction(t.state.toast!, { current: null }, t.dismiss)).toBe(false)
    expect(t.state.toast?.text).toBe('Saved')
  })

  it('is what the shell’s toast button does', () => {
    const at = shellSrc.indexOf('export function Toast()')
    const toast = shellSrc.slice(at, shellSrc.indexOf('\n}', at))
    expect(toast).toContain('pressToastAction(toast, ran, dismissToast,')
    expect(toast).not.toContain('toast.action?.run()')
  })
})
