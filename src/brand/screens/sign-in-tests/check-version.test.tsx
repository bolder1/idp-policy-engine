import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  CHECK_VERSIONS,
  CHECK_VERSION_KEY,
  CHECK_VERSION_WORD,
  CheckVersionOverride,
  DEFAULT_CHECK_VERSION,
  parseCheckVersion,
  readCheckVersion,
  runFlags,
} from './check-version'
import { CheckVersionSwitch } from './CheckVersionSwitch'
import switchCss from './sign-in-tests.css?raw'
import { BUILDER_CANVAS_CHECK, ONE_POLICY_CARD, OPEN_AT_ONCE, RUN_MOTION, VERSION_SWITCH } from './phase'

/* -----------------------------------------------------------------------------
   CLASSIC OR V3 (20 Oct 2026; owner: "So classic the old version … v3 the same
   as edit builder", then of v2 "Remove v2, no need, it's bad"). The versions,
   their words, what a stored value reads as, and what each turns on of what
   phase.ts makes available; the switch's two radios.
   -------------------------------------------------------------------------- */

describe('the versions', () => {
  it('are Classic and v3, in the switch\'s order, v3 for a viewer who never chose', () => {
    expect(CHECK_VERSIONS).toEqual(['classic', 'v3'])
    expect(CHECK_VERSION_WORD).toEqual({ classic: 'Classic', v3: 'v3' })
    expect(DEFAULT_CHECK_VERSION).toBe('v3')
    expect(CHECK_VERSION_KEY).toBe('idp.check-version')
  })

  it('reads a stored value: each version round-trips, the withdrawn v2 and its first word read as v3, anything else the default', () => {
    for (const v of CHECK_VERSIONS) expect(parseCheckVersion(v)).toBe(v)
    expect(parseCheckVersion('v2')).toBe('v3')
    expect(parseCheckVersion('modern')).toBe('v3')
    for (const junk of [null, undefined, '', 'V3', 'classic ', 'mega']) expect(parseCheckVersion(junk)).toBe(DEFAULT_CHECK_VERSION)
    /* Node has no window: nothing is stored, so the default. */
    expect(readCheckVersion()).toBe('v3')
  })

  it('turns everything of 20 Oct off in Classic, and takes phase.ts as it is in v3', () => {
    expect(runFlags('classic')).toEqual({ version: 'classic', onePolicy: false, openAtOnce: false, motion: false, canvas: false })
    expect(runFlags('v3')).toEqual({ version: 'v3', onePolicy: ONE_POLICY_CARD, openAtOnce: OPEN_AT_ONCE, motion: RUN_MOTION, canvas: BUILDER_CANVAS_CHECK && ONE_POLICY_CARD })
    expect(runFlags('v3').canvas).toBe(true)
    expect(Object.keys(runFlags('v3'))).not.toContain('mega')
  })
})

describe('the switch', () => {
  const draw = (pinned: 'classic' | 'v3' | null) =>
    renderToStaticMarkup(
      <CheckVersionOverride.Provider value={pinned}>
        <CheckVersionSwitch />
      </CheckVersionOverride.Provider>,
    )

  it('draws "Version", then two radios, Classic · v3, one checked — v3 with nothing chosen', () => {
    expect(VERSION_SWITCH).toBe(true)
    const out = draw(null)
    expect(out).toContain('<span class="bwidth__label" aria-hidden="true">Version</span>')
    expect(out).toContain('role="radiogroup" aria-label="Check access version"')
    const radios = [...out.matchAll(/<button[^>]*role="radio"[^>]*>([^<]*)<\/button>/g)]
    expect(radios.map((m) => m[1])).toEqual(['Classic', 'v3'])
    expect(count(out, 'aria-checked="true"')).toBe(1)
    expect(out).toMatch(/data-version="v3" aria-checked="true" tabindex="0" class="is-on"/)
    expect(draw('classic')).toMatch(/data-version="classic" aria-checked="true" tabindex="0" class="is-on"/)
  })

  it('is never orange', () => {
    expect(draw(null)).not.toContain('brand')
    const sheet = switchCss.replace(/\r\n/g, '\n')
    const own = sheet.split('\n').filter((l) => l.includes('.sit-version'))
    expect(own.length).toBeGreaterThan(0)
    for (const l of own) expect(l).not.toContain('--brand')
  })
})

const count = (html: string, needle: string) => html.split(needle).length - 1
