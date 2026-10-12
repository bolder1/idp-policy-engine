/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  ATTACK,
  CUES,
  PRIORITY_MS,
  QUIET_CLOCK,
  THROTTLE_MS,
  afterCue,
  cueForDecision,
  cueForTone,
  cueLength,
  parseSound,
  playCue,
  playToastCue,
  readSound,
  setSound,
  shouldPlay,
  switchTick,
  writeSound,
  type Cue,
} from './sound'
import { toastTone, type ToastTone } from './toast-tone'
import kitSrc from './kit.tsx?raw'

/* The console's sounds (sound.ts): what each piece of news sounds like, that a
   cue is short and soft, that one thing is never heard twice, and that the
   setting holds where storage does not. There is no DOM here, so playing is
   checked against a stand-in AudioContext that counts what it was asked for. */

const TONES: ToastTone[] = ['success', 'info', 'warning', 'error', 'removed']
const ALL = Object.keys(CUES) as Cue[]

describe('the cues', () => {
  it('has every cue the console plays', () => {
    expect([...ALL].sort()).toEqual(
      ['attach', 'celebrate', 'copy', 'error', 'info', 'publish', 'removed', 'run-allow', 'run-deny', 'run-mfa', 'success', 'toggle-off', 'toggle-on', 'undo', 'warning'].sort(),
    )
  })

  it('is short: 450 ms at most, and the celebration 750', () => {
    for (const cue of ALL) expect(cueLength(cue), cue).toBeLessThanOrEqual(cue === 'celebrate' ? 0.75 : 0.45)
  })

  it('ticks a switch in 30 to 50 ms', () => {
    for (const cue of ['toggle-on', 'toggle-off'] as const) {
      expect(cueLength(cue)).toBeGreaterThanOrEqual(0.03)
      expect(cueLength(cue)).toBeLessThanOrEqual(0.05)
    }
  })

  it('starts fast and stays soft: a 3 to 8 ms attack, no peak over 1, sine or triangle, audible pitches', () => {
    for (const cue of ALL) {
      for (const n of CUES[cue]) {
        const attack = n.attack ?? ATTACK
        expect(attack, cue).toBeGreaterThanOrEqual(0.003)
        expect(attack, cue).toBeLessThanOrEqual(0.008)
        expect(attack, cue).toBeLessThan(n.dur)
        expect(n.gain, cue).toBeGreaterThan(0)
        expect(n.gain, cue).toBeLessThanOrEqual(1)
        expect(['sine', 'triangle']).toContain(n.wave ?? 'sine')
        for (const f of [n.f, n.to ?? n.f]) {
          expect(f, cue).toBeGreaterThanOrEqual(60)
          expect(f, cue).toBeLessThanOrEqual(5000)
        }
      }
    }
  })

  it('rises for good news, falls for bad, and leaves a question hanging', () => {
    const pitches = (cue: Cue) => CUES[cue].map((n) => n.f)
    const [s1, s2] = pitches('success')
    expect(s2).toBeGreaterThan(s1)
    const [e1, e2] = pitches('error')
    expect(e2).toBeLessThan(e1)
    expect(pitches('publish')).toEqual([...pitches('publish')].sort((a, b) => a - b))
    const [m1, m2] = CUES['run-mfa']
    expect(m2.f).toBeGreaterThan(m1.f)
    expect(m2.dur).toBeGreaterThan(m1.dur)
    expect(CUES['run-deny'][0].to).toBeLessThan(CUES['run-deny'][0].f)
  })
})

describe('what each piece of news sounds like', () => {
  it('gives every toast tone its own cue', () => {
    const cues = TONES.map(cueForTone)
    expect(new Set(cues).size).toBe(TONES.length)
    for (const c of cues) expect(CUES[c]).toBeDefined()
  })

  it('reads a toast the way its colour is read', () => {
    expect(cueForTone(toastTone('Policy saved'))).toBe('success')
    expect(cueForTone(toastTone('Rule deleted'))).toBe('removed')
    expect(cueForTone(toastTone('Could not copy the key'))).toBe('error')
    expect(cueForTone(toastTone('Turn on the policy first'))).toBe('warning')
  })

  it('sounds a run by its answer, and nothing while it depends', () => {
    expect(cueForDecision('1fa')).toBe('run-allow')
    expect(cueForDecision('2fa')).toBe('run-mfa')
    expect(cueForDecision('deny')).toBe('run-deny')
    expect(cueForDecision(null)).toBeNull()
  })
})

describe('once, and in turn', () => {
  it('plays the same cue once within the throttle', () => {
    const c = afterCue(1000, 'copy', 'explicit', QUIET_CLOCK, true)
    expect(shouldPlay(1000 + THROTTLE_MS - 1, 'copy', 'explicit', c)).toBe(false)
    expect(shouldPlay(1000 + THROTTLE_MS, 'copy', 'explicit', c)).toBe(true)
    /* Another cue is not held by it. */
    expect(shouldPlay(1001, 'undo', 'explicit', c)).toBe(true)
  })

  it("keeps a toast quiet inside a press's window, and only a toast", () => {
    const c = afterCue(1000, 'publish', 'explicit', QUIET_CLOCK, true)
    expect(shouldPlay(1000 + PRIORITY_MS - 1, 'success', 'toast', c)).toBe(false)
    expect(shouldPlay(1000 + PRIORITY_MS, 'success', 'toast', c)).toBe(true)
    expect(shouldPlay(1001, 'toggle-on', 'explicit', c)).toBe(true)
  })

  it('claims the window for a press even when its own cue was throttled', () => {
    const c = afterCue(5000, 'undo', 'explicit', QUIET_CLOCK, false)
    expect(c.last.undo).toBeUndefined()
    expect(shouldPlay(5100, 'info', 'toast', c)).toBe(false)
  })

  it('claims nothing for a toast', () => {
    const c = afterCue(1000, 'info', 'toast', QUIET_CLOCK, true)
    expect(c.claimedUntil).toBe(QUIET_CLOCK.claimedUntil)
    expect(shouldPlay(1001, 'success', 'toast', c)).toBe(true)
  })

  /* Review 10 Oct 2026, #12: a switch pressed off, refused with "Turn on
     another method first", and the warning muted under the press's tick. */
  it('never keeps a warning or an error quiet under a press: a refusal is other news', () => {
    const c = afterCue(1000, 'toggle-off', 'explicit', QUIET_CLOCK, true)
    expect(shouldPlay(1001, 'warning', 'toast', c)).toBe(true)
    expect(shouldPlay(1001, 'error', 'toast', c)).toBe(true)
    for (const quiet of ['success', 'info', 'removed'] as const) expect(shouldPlay(1001, quiet, 'toast', c), quiet).toBe(false)
  })

  it('still plays a warning once within its own throttle', () => {
    const c = afterCue(1000, 'warning', 'toast', QUIET_CLOCK, true)
    expect(shouldPlay(1000 + THROTTLE_MS - 1, 'warning', 'toast', c)).toBe(false)
  })
})

describe('a switch’s tick', () => {
  it('plays once the switch arrives where the press asked: up for on, down for off', () => {
    expect(switchTick(true, true)).toBe('toggle-on')
    expect(switchTick(false, false)).toBe('toggle-off')
  })

  it('is silent for a refused press, and for a switch something else moved', () => {
    /* Asked for off, still on: refused, or waiting on a confirm. */
    expect(switchTick(false, true)).toBeNull()
    expect(switchTick(true, false)).toBeNull()
    expect(switchTick(null, true)).toBeNull()
    expect(switchTick(null, false)).toBeNull()
  })

  it('is how the kit switch ticks: nothing on the press itself', () => {
    const at = kitSrc.indexOf('export function Toggle(')
    const toggle = kitSrc.slice(at, kitSrc.indexOf('export function Chip(', at))
    expect(toggle).toContain('switchTick(asked.current, checked)')
    const press = toggle.slice(toggle.indexOf('onClick={'), toggle.indexOf('className=', toggle.indexOf('onClick={')))
    expect(press).not.toContain('playCue')
  })
})

describe('the setting', () => {
  it('is on unless exactly "off" is stored', () => {
    expect(parseSound('off')).toBe(false)
    for (const v of ['on', null, undefined, '', 'OFF', 0]) expect(parseSound(v), String(v)).toBe(true)
  })

  it('round-trips through storage', () => {
    const kept = new Map<string, string>()
    expect(writeSound(false, (v) => kept.set('k', v))).toBe(true)
    expect(readSound(() => kept.get('k') ?? null)).toBe(false)
    writeSound(true, (v) => kept.set('k', v))
    expect(readSound(() => kept.get('k') ?? null)).toBe(true)
  })

  it('survives storage that throws: on when it cannot read, and no throw when it cannot write', () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    expect(readSound(boom)).toBe(true)
    expect(writeSound(false, boom)).toBe(false)
    /* With no window at all: the defaults reach for one and are caught. */
    expect(readSound()).toBe(true)
    expect(() => setSound(true)).not.toThrow()
  })
})

describe('playing', () => {
  it('does nothing, rather than throwing, with no window', () => {
    expect(() => playCue('success')).not.toThrow()
    expect(() => playToastCue('error')).not.toThrow()
  })

  it('does nothing, rather than throwing, where there is no Web Audio', () => {
    vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => {} })
    vi.stubGlobal('document', { hidden: false })
    expect(() => playCue('warning')).not.toThrow()
    vi.unstubAllGlobals()
  })

  describe('with a stand-in AudioContext', () => {
    const started: number[] = []
    const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} })
    const node = () => ({ connect: () => {}, disconnect: () => {} })
    class FakeContext {
      state = 'running'
      currentTime = 0
      destination = node()
      createOscillator() {
        return { ...node(), type: 'sine', frequency: param(), start: (t: number) => started.push(t), stop: () => {}, onended: null }
      }
      createGain() {
        return { ...node(), gain: param() }
      }
      createBiquadFilter() {
        return { ...node(), type: 'lowpass', frequency: param() }
      }
      resume() {
        return Promise.resolve()
      }
      suspend() {
        return Promise.resolve()
      }
    }
    const doc = { hidden: false }

    beforeAll(() => {
      vi.stubGlobal('window', { AudioContext: FakeContext, setTimeout: () => 0, clearTimeout: () => {} })
      vi.stubGlobal('document', doc)
    })
    afterAll(() => {
      setSound(true)
      vi.unstubAllGlobals()
    })

    /* The oscillators one cue starts: a voice per note, and its octave where it rings. */
    const voices = (cue: Cue) => CUES[cue].reduce((sum, n) => sum + (n.ring ? 2 : 1), 0)

    it('starts a voice for every note', () => {
      started.length = 0
      playCue('celebrate')
      expect(started.length).toBe(voices('celebrate'))
    })

    it('plays the same cue twice in a row once', () => {
      started.length = 0
      playCue('copy')
      playCue('copy')
      expect(started.length).toBe(voices('copy'))
    })

    it('keeps the toast after a publish quiet', () => {
      started.length = 0
      playCue('publish')
      playToastCue('success')
      expect(started.length).toBe(voices('publish'))
    })

    it('plays the error a press runs into, as well as the press', () => {
      started.length = 0
      playCue('toggle-off')
      playToastCue('error')
      expect(started.length).toBe(voices('toggle-off') + voices('error'))
    })

    it('is silent while off, and while the tab is hidden', () => {
      setSound(false)
      started.length = 0
      playCue('attach')
      expect(started.length).toBe(0)
      setSound(true)
      doc.hidden = true
      playCue('attach')
      expect(started.length).toBe(0)
      doc.hidden = false
      playCue('attach')
      expect(started.length).toBe(voices('attach'))
    })
  })
})
