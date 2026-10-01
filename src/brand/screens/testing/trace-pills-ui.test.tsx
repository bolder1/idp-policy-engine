/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { columnView, columnsFor, routeOf, runColumns } from '../board/try-sign-in'
import { envOf } from '../tenant-resolver'
import { LAST_ROW } from './evidence'
import { defaultBoardForm, factsOf, originPatch, type SignInForm } from './sign-in-form'
import { CardWord, CheckPills, DecidesPill, OutcomeNode, RuleOutcome, StartSignIn } from './TracePills'
import { checkPills, nameLookupOf } from './trace-pills'
import css from './trace.css?raw'

/* The trace's pieces, drawn without a browser, on the showcase tenant through
   the same model the board runs (try-sign-in.ts): the pills a card carries,
   its outcome and word, the start node's content, and the outcome node the
   route lands on. The words are pinned in trace-pills.test.ts; this is the
   join between them and the markup. */

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const names = nameLookupOf({ zones: t.zones, fingerprints: t.fingerprints, groups: t.groups, users: t.directory.people })
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const devTools = policy('sc-dev-tools')
const compliance = policy('sc-device-compliance')
const appName = (id: string) => t.apps.find((a) => a.id === id)?.name ?? id
const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>)
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/ ,/g, ',')
    .trim()

/** The board's run for a form: the right-hand column's route, and every column as the panel said it. */
function run(saved: Policy, patch: Partial<SignInForm> = {}, draft: Policy = saved) {
  const form = { ...defaultBoardForm(saved, t.directory.people, t.apps, TODAY), ...patch }
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns(columnsFor(saved, draft, form.appId), t.policies, facts, env)
  return {
    route: routeOf(cols.at(-1)!, draft, facts, env, t.policies),
    columns: cols.map((c) => columnView(c, draft.id, t.policies, appName)),
  }
}

describe('check pills on a card', () => {
  const office = devTools.rules[0]

  it('draws one pill per check, each with its mark, its words and its standing', () => {
    const { route } = run(devTools)
    const out = html(<CheckPills pills={checkPills(office, route.cards[office.id], names)} show reduced={false} fade={false} />)
    expect(out).toContain('aria-label="Checks"')
    expect(out.match(/class="bb-check is-pass"/g)).toHaveLength(4)
    expect(text(out)).toBe(
      'Who: Engineering, DevOps, Passes Network: Corporate offices · IP, Passes Place: Corporate offices · Location, Passes Device: Compliant devices, Passes',
    )
    /* Settled, so nothing is held back. */
    expect(out).not.toContain('opacity:0')
  })

  it('tints the pill that failed, and only that one', () => {
    const { route } = run(devTools, originPatch('home'))
    const out = html(<CheckPills pills={checkPills(office, route.cards[office.id], names)} show reduced fade />)
    expect(out.match(/class="bb-check is-fail"/g)).toHaveLength(1)
    expect(text(out)).toContain('Network: Corporate offices · IP, Fails')
  })

  it('holds the pills in their place, hidden, until the marker reaches the card', () => {
    const { route } = run(devTools)
    const out = html(<CheckPills pills={checkPills(office, route.cards[office.id], names)} show={false} reduced={false} />)
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('opacity:0')
    expect(text(out)).toContain('Engineering, DevOps')
  })

  it('draws nothing on a card nothing was asked of', () => {
    const { route } = run(devTools)
    expect(html(<CheckPills pills={checkPills(devTools.rules[1], route.cards[devTools.rules[1].id], names)} show reduced={false} />)).toBe('')
    expect(html(<CheckPills pills={checkPills(null, route.cards[LAST_ROW], names)} show reduced={false} />)).toBe('')
  })
})

describe('a card’s head in test mode', () => {
  it('shows the rule’s THEN in full tone only when lit, and the same words muted otherwise', () => {
    const lit = html(<RuleOutcome decision="2fa" lit />)
    const muted = html(<RuleOutcome decision="2fa" lit={false} />)
    expect(lit).toContain('bx-badge--notice')
    expect(muted).toContain('bx-badge--neutral')
    expect(muted).toContain('bx-decision-badge')
    expect(text(lit)).toBe('Allow with 2FA')
    expect(text(muted)).toBe('Allow with 2FA')
  })

  it('says a grey word on every card but the one that matched', () => {
    expect(html(<CardWord state="pass" />)).toBe('')
    expect(text(html(<CardWord state="not-reached" />))).toBe('Not reached')
    expect(text(html(<CardWord state="off" />))).toBe('Switched off')
    expect(text(html(<CardWord state="fail" />))).toBe('No match')
  })
})

describe('the start node and which policy decides', () => {
  it('reads who signs in to what, and whether this policy is for them', () => {
    const out = html(<StartSignIn person={{ name: 'Arun Patel' }} appId="github" appName="GitHub" audience="in" />)
    expect(text(out)).toBe('AP Arun Patel signs in to GitHub In this policy')
    expect(out).toContain('bb-aud is-in')
    expect(out).toContain('bx-face is-user')
  })

  it('tints the pill for somebody outside the audience, and says nothing until a person is chosen', () => {
    expect(html(<StartSignIn person={{ name: 'Devon Rao' }} appId="github" appName="GitHub" audience="out" />)).toContain('bb-aud is-out')
    const nobody = text(html(<StartSignIn person={null} appId={null} appName={null} audience={null} />))
    expect(nobody).toBe('Choose a person signs in to Choose an application')
  })

  it('is a small pill when this policy decides, and the gate’s words when another does', () => {
    expect(text(html(<DecidesPill decides />))).toBe('This policy decides')
    const other = html(<DecidesPill decides={false} policyName="Global Default Policy" reason="Not in this policy" />)
    /* The comma between the policy and the reason is for a screen reader only. */
    expect(text(other)).toBe('Decided by Global Default Policy, Not in this policy')
    expect(other).toContain('<span class="u-sr-only">, </span>')
  })
})

describe('the outcome node', () => {
  it('lands on the decision, big, with the rule that gave it and what changed it', () => {
    const { route, columns } = run(devTools)
    const out = html(<OutcomeNode view={route.decision} columns={columns} changed="IP address" hidden={false} fade={false} reduced={false} onWhatTheySee={() => {}} />)
    expect(out).toContain(
      'aria-label="Decision: Allow on 1 factor, Developer tools — office and device checks · Rule 1 · In the office on a compliant device"',
    )
    expect(out).toContain('bb-outcome__badge')
    expect(text(out)).toBe(
      'Allow on 1 factor Developer tools — office and device checks · Rule 1 · In the office on a compliant device Changed by IP address What they see Modelled result',
    )
    /* One version, so nothing is set beside it. */
    expect(out).not.toContain('bb-outcome__versions')
  })

  it('sets the live version beside the edits when they answer differently', () => {
    const edited = { ...devTools, rules: devTools.rules.map((r, i) => (i === 0 ? { ...r, decision: 'deny' as const } : r)) }
    const { route, columns } = run(devTools, {}, edited)
    const out = text(html(<OutcomeNode view={route.decision} columns={columns} changed={null} hidden={false} fade reduced />))
    expect(out).toContain('Live Allow on 1 factor Your edits Deny')
    expect(out.startsWith('Deny')).toBe(true)
    expect(out).not.toContain('Changed by')
  })

  it('says Depends in grey with each outcome and what would settle it', () => {
    const android: Partial<SignInForm> = {
      device: { kind: 'custom', facts: { source: 'stated', platform: 'android', osVersion: '14', formFactor: 'Mobile', screenLock: 'pin', authenticatorVersion: '6.5.0' } },
    }
    const { route, columns } = run(compliance, android)
    const out = html(<OutcomeNode view={route.decision} columns={columns} changed={null} hidden={false} fade={false} reduced={false} />)
    expect(text(out)).toBe('Depends If rule 1 matches Allow on 1 factor If not Deny Needs: Device Device compliance for Outlook and Dropbox Modelled result')
    expect(out).toContain('bb-outcome__word')
    expect(out).toContain('aria-label="Decision: Depends, Device compliance for Outlook and Dropbox"')
  })

  it('says Can’t tell in grey, never a badge, when a fact is missing', () => {
    const { route, columns } = run(devTools, { personId: null })
    const out = html(<OutcomeNode view={route.decision} columns={columns} changed={null} hidden={false} fade={false} reduced={false} />)
    expect(out).toContain('bx-canttell')
    expect(out).not.toContain('bx-decision-badge')
    expect(text(out)).toBe("Can't tell Choose a person Modelled result")
  })

  it('is held in its place, hidden and nameless, until the marker lands', () => {
    const { route, columns } = run(devTools)
    const out = html(<OutcomeNode view={route.decision} columns={columns} changed="IP address" hidden fade reduced={false} />)
    expect(out).toContain('aria-label="Decision"')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('opacity:0')
    expect(text(out)).not.toContain('Changed by')
    expect(text(out)).not.toContain('Modelled result')
  })
})

describe('the words', () => {
  it('never says what the owner has ruled out', () => {
    const { route, columns } = run(devTools)
    const all = text(
      html(
        <>
          <CheckPills pills={checkPills(devTools.rules[0], route.cards[devTools.rules[0].id], names)} show reduced />
          <OutcomeNode view={route.decision} columns={columns} changed="IP address" hidden={false} fade={false} reduced onWhatTheySee={() => {}} />
          <StartSignIn person={{ name: 'Arun Patel' }} appId="github" appName="GitHub" audience="in" />
          <DecidesPill decides />
        </>,
      ),
    )
    expect(all).not.toMatch(/\bAI\b|assistant|log ?in|gauntlet|blast radius|rehearse/i)
  })
})

describe('the stylesheet', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...rules.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

  it('leaves colour to the tokens', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(|hsla?\(/)
    /* Can't tell is tertiary, never the muted grey. */
    expect(rules).not.toContain('--text-muted')
  })

  it('never draws a dashed or dotted pill', () => {
    expect(rules).not.toMatch(/\b(dashed|dotted)\b/)
  })

  it('gives nothing a transform or a transition: motion owns what moves', () => {
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).not.toMatch(/\btransition\s*:/)
    /* The elements motion animates take no translate, scale or rotate either. */
    const moved = ['.bb-check', '.bb-check__mark', '.bb-outcome', '.bb-outcome__in', '.bb-outcome__changed']
    for (const { selector, body } of blocks) {
      const own = selector.split(',').some((s) => moved.some((m) => new RegExp(`${m.replace(/[.]/g, '\\.')}(?![\\w-])\\s*$`).test(s.trim())))
      if (own) expect(`${selector}: ${/(translate|rotate|scale)\s*:/.test(body)}`).toBe(`${selector}: false`)
    }
  })

  it('stops every animation under reduced motion', () => {
    const animated = blocks.filter((b) => /\banimation\s*:/.test(b.body) && !/animation\s*:\s*none/.test(b.body)).map((b) => b.selector)
    expect(animated.length).toBeGreaterThan(0)
    const reduced = rules.slice(rules.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced.length).toBeLessThan(rules.length)
    for (const selector of animated) expect(reduced).toContain(`${selector} { animation: none; }`)
  })

  it('scopes the card states to test mode', () => {
    for (const state of ['is-lit', 'is-missed', 'is-dim']) {
      const own = blocks.filter((b) => b.selector.includes(`.bb__card.${state}`))
      expect(own.length).toBeGreaterThan(0)
      for (const b of own) for (const s of b.selector.split(',')) expect(s.trim().startsWith('.bb.is-testing ')).toBe(true)
    }
  })
})
