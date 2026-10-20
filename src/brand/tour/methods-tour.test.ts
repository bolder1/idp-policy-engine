/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { MOVED_STOPS, NEW_LAYOUT, SEL, SETTING_WAS } from './methods-tour'
import { AUTH_METHODS as METHODS } from '../methods'
import methodsSrc from '../screens/AuthMethods.tsx?raw'
import kitSrc from '../kit.tsx?raw'
import shellSrc from '../Shell.tsx?raw'
import tourSrc from './MethodsTour.tsx?raw'

/* -----------------------------------------------------------------------------
   What moved (methods-tour.ts, MethodsTour.tsx; owner, 7 Oct 2026). Without a
   browser, so what is pinned is what would silently break: a stop or a task
   whose element is not on the page any more, the owner's order, a stop that
   lost its task, an announcement that grew a way to hide it or opens by
   itself, the rail putting the page back under Policies, copy past a sentence,
   and a "Was in …" the live console was never seen to say.
   -------------------------------------------------------------------------- */

const lf = (s: string) => s.replace(/\r\n/g, '\n')
const page = lf(methodsSrc)
const kit = lf(kitSrc)
const shell = lf(shellSrc)
const tour = lf(tourSrc)

describe('the owner’s order: the new tab, the three kinds of row, then Recovery', () => {
  it('runs rail → a switch alone → a row with a page → a switch with one settings page → Recovery', () => {
    expect(MOVED_STOPS.map((s) => [s.id, s.view, s.task?.kind ?? null])).toEqual([
      ['rail', 'list', null],
      ['switch', 'list', 'switch'],
      ['family', 'list', 'click'],
      ['family-methods', 'sms', null],
      ['family-settings', 'sms', 'click'],
      ['gear', 'list', 'click'],
      ['gear-page', 'grid', null],
      ['recovery', 'list', 'click'],
      ['recovery-page', 'recovery', null],
    ])
  })

  it('the part to click pulses; the card only ever says Next — no action press, nothing disabled', () => {
    expect(tour).toContain("{last ? 'Done' : 'Next'}")
    expect(tour).toContain('const act = useCallback(() => (last ? leave() : setI((n) => n + 1)), [last, leave])')
    expect(tour).not.toContain('doLabel')
    expect(tour).not.toMatch(/disabled=\{(?!i === 0)/)
    /* The click part breathes on opacity alone, and holds still under reduced motion. */
    expect(tour).toContain("animate={reduce ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}")
    for (const s of MOVED_STOPS) if (s.task) expect(s.task.hint, s.id).toMatch(/^\[data-tour="/)
  })

  it('once a press has opened something, the light moves to it — never left on a row a drawer covers', () => {
    expect(tour).toContain("const lit = stop.task?.kind === 'click' && done ? stop.task.lights : `[data-tour=\"${stop.anchor}\"]`")
    const lights = MOVED_STOPS.flatMap((s) => (s.task?.kind === 'click' ? [[s.id, s.task.lights]] : []))
    expect(lights).toEqual([
      ['family', SEL.smsDrawer],
      ['family-settings', SEL.settingsPane],
      ['gear', SEL.gridDrawer],
      ['recovery', SEL.recoveryPane],
    ])
  })
})

describe('every stop and task finds its element', () => {
  it('the page’s anchors are in its source', () => {
    for (const a of ['data-tour="methods-head"', 'data-tour="methods-default"', 'data-tour={`methods-tab-${t.id}`}', 'data-tour="drawer-methods"', 'data-tour="drawer-tab-methods"', 'data-tour="drawer-tab-settings"', 'data-tour="drawer-settings"', 'data-tour="methods-recovery"']) {
      expect(page, a).toContain(a)
    }
    expect(shell).toContain('data-tour={item.screen ? `rail-${item.screen.name}` : undefined}')
  })

  it('rows are lit by their method’s id on a family of one, else their channel — and the rows named exist', () => {
    expect(page).toContain("data-tour={`methods-row-${single ? single.id : f.channel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}")
    expect(METHODS.some((m) => m.id === 'otp-call')).toBe(true)
    expect(METHODS.some((m) => m.id === 'grid')).toBe(true)
    expect(METHODS.some((m) => m.channel === 'SMS')).toBe(true)
    expect(page).toContain('label={caChains ? \'CA chains\' : `${title} settings`}')
  })

  it('every selector the tour clicks or waits on names something the page draws', () => {
    expect(Object.values(SEL).every((sel) => /data-tour="[^"]+"|aside\[aria-label="[^"]+"\]/.test(sel))).toBe(true)
    expect(SEL.smsDrawer).toBe('aside[aria-label="SMS"]')
    expect(SEL.gridDrawer).toBe('aside[aria-label="Grid Pattern"]')
  })
})

describe('announced, never pushed', () => {
  it('shut by default: the title, one line, the tour and a chevron; the four points open under it', () => {
    /* The card is the kit's one note now (owner, 16 Oct 2026: "use this as a common note component"), so the
       fold is the Note's `more` — shut until Read more is pressed (kit.tsx; note.test.tsx draws it) — and the
       tour is its action, in the head row. */
    const at = page.search(/<Note\s+as="h2"/)
    expect(at).toBeGreaterThan(-1)
    const card = page.slice(at, page.indexOf('</Note>', at))
    expect(card).toContain('title={NEW_LAYOUT.title}')
    expect(card).toMatch(/more=\{\s*<ul>\s*\{NEW_LAYOUT\.points\.map\(\(p\) => \(\s*<li key=\{p\}>\{p\}<\/li>/)
    expect(card).toMatch(/action=\{\s*<Button variant="secondary" size="sm" icon=\{Compass\} onClick=\{startTour\}>\n\s+Take the tour/)
    expect(card).toMatch(/>\s*\{NEW_LAYOUT\.line\}\s*$/)
    expect(kit).toMatch(/const \[open, setOpen\] = useState\(false\)/)
    expect(kit).toContain("{open ? 'Show less' : moreLabel}")
    expect(kit).toContain("moreLabel = 'Read more'")
    expect(page).not.toMatch(/>\s*Hide\s*</)
    /* Only the press starts the tour. */
    expect(page).toContain('const [touring, setTouring] = useState(false)')
  })

  it('says what changed in one line, and three or four short points', () => {
    expect(NEW_LAYOUT.title).toBe('What’s new')
    expect(NEW_LAYOUT.line).toBe('Authentication methods has a new layout')
    expect(NEW_LAYOUT.points.length).toBeGreaterThanOrEqual(3)
    expect(NEW_LAYOUT.points.length).toBeLessThanOrEqual(4)
    for (const p of NEW_LAYOUT.points) {
      expect(p.length, p).toBeLessThanOrEqual(60)
      expect(p.endsWith('.'), p).toBe(false)
    }
  })
})

describe('the rail', () => {
  it('is its own item, outside Policies, and the console’s 2-Factor Authentication group is gone', () => {
    expect(shell).toContain("{ label: 'Authentication methods', icon: KeyRound, screen: { name: 'methods' } },")
    expect(shell.match(/label: 'Authentication methods'/g)).toHaveLength(1)
    for (const old of ['Setup 2FA for Admin', 'Alternate 2FA Login Methods', '2FA Options For EndUsers', 'Assign Hardware Token to Users', 'Static Code Generation']) {
      expect(shell, old).not.toContain(`label: '${old}'`)
    }
    const policyScreens = shell.slice(shell.indexOf('const POLICY_SCREENS = ['), shell.indexOf(']', shell.indexOf('const POLICY_SCREENS = [')))
    expect(policyScreens).not.toContain("'methods'")
    expect(policyScreens).not.toContain("'display-tokens'")
  })

  it('lights on Display tokens too, which is opened from it', () => {
    expect(shell).toContain("methods: ['display-tokens']")
    expect(shell).toContain('return item.screen ? current.name === item.screen.name || !!UNDER_ITEM[item.screen.name]?.includes(current.name) : false')
  })
})

describe('the copy', () => {
  /* The console's own page names are quoted as they are, "Login" included; nothing else may say it. */
  const LOGIN = /\blog(?:s|ged|ging)?(?:-|\s)?ins?\b/i
  const said = (s: string) => s.replace(/Alternate 2FA Login Methods/g, '')

  it('one sentence a stop, a short heading, sentence case, no banned words', () => {
    for (const s of MOVED_STOPS) {
      expect(s.body.endsWith('.'), s.id).toBe(true)
      expect(s.body.slice(0, -1).includes('. '), s.id).toBe(false)
      expect(s.heading.length, s.id).toBeLessThanOrEqual(46)
      expect(s.heading[0], s.id).toBe(s.heading[0].toUpperCase())
    }
    const all = [
      ...MOVED_STOPS.flatMap((s) => [s.heading, s.body, s.was ?? '', s.task?.done ?? '']),
      NEW_LAYOUT.title,
      NEW_LAYOUT.line,
      ...NEW_LAYOUT.points,
    ]
    for (const text of all) {
      expect(LOGIN.test(said(text)), text).toBe(false)
      expect(/\b(AI|assistant|gauntlet|blast radius|rehearse|nice|great|congrat\w*)\b/i.test(text), text).toBe(false)
    }
  })

  it('says where a setting was only where the live console was seen to say it', () => {
    expect(SETTING_WAS).toEqual({ advanced: 'Was in Advanced Options', '2fa': 'Was in 2-Factor Authentication' })
  })
})
