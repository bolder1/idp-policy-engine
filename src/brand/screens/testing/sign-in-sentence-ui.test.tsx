/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import type { ColumnView } from '../board/try-sign-in'
import { rowsRead } from './rows-read'
import { SentenceTokenPanel, SentenceVerdict, SignInSentence } from './SignInSentence'
import { ADDRESS_ERROR, defaultBoardForm, typedAddressPatch, type FormIssue, type SignInForm } from './sign-in-form'
import { GLOBAL_SCOPE, boardScope, type SentenceScope, type TokenId } from './sign-in-sentence'
import css from './sign-in-sentence.css?raw'

/* The sign-in sentence drawn without a browser, on the showcase tenant the
   store opens on: which pills a policy's sentence has, the applications its
   panel may name, and the verdict's one pill or two. The words and rules are
   pinned in sign-in-sentence.test.ts; this is the join between them and the
   markup. The panels are portalled when open, which a server render cannot
   draw, so a panel's body is drawn on its own (`SentenceTokenPanel`); the
   browser pass checks the placement, the keys and the accent. */

const t = showcaseTenant()
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const TODAY = '2026-09-28'
const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const policy = (id: string): Policy => t.policies.find((p) => p.id === id)!

/* The tenant with a Global Default that reads nothing. Since its baseline
   (30 Sep 2026) the Global Default reads the place and the device on every
   application, so a sentence with no device pill, or a From panel with no
   Place, exists only against this one. */
const BARE = t.policies.map((p) => (p.isSystem ? { ...p, rules: [] } : p))

/* The board's first sign-in for a policy, as use-try-sign-in makes it. */
function board(id: string, patch: Partial<SignInForm> = {}, policies: readonly Policy[] = t.policies) {
  const p = policies.find((x) => x.id === id)!
  const form = { ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch }
  return { p, form, rows: rowsRead(policies, p, form.appId, lib), scope: boardScope(p) }
}

function sentence(
  id: string,
  opts: { patch?: Partial<SignInForm>; issues?: FormIssue[]; verdict?: ReactNode; actions?: ReactNode; why?: ReactNode; layout?: 'bar' | 'panel'; policies?: readonly Policy[] } = {},
) {
  const b = board(id, opts.patch, opts.policies)
  return html(
    <SignInSentence
      form={b.form}
      onPatch={noop}
      rows={b.rows}
      issues={opts.issues ?? []}
      boundaries={{}}
      scope={b.scope}
      verdict={opts.verdict}
      actions={opts.actions}
      why={opts.why}
      layout={opts.layout}
      idPrefix="bb-try"
    />,
  )
}

function panel(token: TokenId, id: string, scope?: SentenceScope, patch: Partial<SignInForm> = {}, policies?: readonly Policy[]) {
  const b = board(id, patch, policies)
  return html(
    <SentenceTokenPanel
      token={token}
      form={b.form}
      onPatch={noop}
      onPick={noop}
      rows={b.rows}
      issues={[]}
      boundaries={{}}
      scope={scope ?? b.scope}
      idPrefix="bb-try"
    />,
  )
}

/** Each token button's accessible name, in order. */
const tokens = (out: string) => [...out.matchAll(/<button[^>]*aria-haspopup="dialog"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1].replace(/&#x27;/g, "'"))
/** Each option's label, in order. */
const options = (out: string) => [...out.matchAll(/role="option"[^>]*>[\s\S]*?class="tsent-opt__label">([^<]*)</g)].map((m) => m[1].replace(/&amp;/g, '&'))

describe('the sentence on a policy that checks the device', () => {
  const out = sentence('sc-dev-tools')

  it('says the sign-in as one line of pills, joined by plain words', () => {
    expect(tokens(out)).toEqual(['Person: Arun Patel', 'Application: GitHub Enterprise', 'From: Office network', 'Device: Windows 11 laptop · registered'])
    expect(text(out)).toBe('AP Arun Patel signs in to GitHub Enterprise from Office network on Windows 11 laptop · registered')
    expect(out).toContain('role="group" aria-label="Sign-in"')
  })

  it('makes every token a closed dialog button with a stable id', () => {
    expect(out.match(/aria-haspopup="dialog"/g)).toHaveLength(4)
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(4)
    expect(out).not.toContain('aria-expanded="true"')
    for (const id of ['bb-try-person', 'bb-try-app', 'bb-try-address', 'bb-try-device']) expect(out).toContain(`id="${id}"`)
    /* Nothing is open, so nothing wears the accent. */
    expect(out).not.toContain('is-open')
  })

  it('leads each value with its mark: a face, the logo, an icon, the platform', () => {
    expect(out).toContain('bx-face is-user is-sm')
    expect(out).toMatch(/class="applogo[^"]*"[^>]*title="GitHub Enterprise"/)
    expect(out).toContain('class="bplat')
  })

  it('draws no verdict, buttons or why-line it was not given', () => {
    expect(out).not.toContain('tsent__end')
    expect(out).not.toContain('tsent__why')
  })
})

/* Against BARE: on the showcase itself the Global Default checks the device on
   HRMS (30 Sep 2026), so HRMS's sentence has a device pill there. */
describe('the sentence on a policy that never checks the device', () => {
  const out = sentence('sc-hrms-office', { policies: BARE })

  it('has no device pill, time or risk: only who, to what and from where', () => {
    expect(tokens(out)).toEqual(['Person: Kavya Menon', 'Application: HRMS', 'From: Office network'])
    expect(text(out)).not.toContain(' on ')
    expect(out).not.toContain('id="bb-try-device"')
  })

  it('puts a field’s error in its token’s name', () => {
    const bad = sentence('sc-hrms-office', { patch: typedAddressPatch('203.0.113'), issues: [{ field: 'address', message: ADDRESS_ERROR }] })
    expect(tokens(bad)[2]).toBe('From: 203.0.113, Enter an IPv4 or IPv6 address')
  })

  it('says an unstated value in grey, still as a pill', () => {
    const none = sentence('sc-hrms-office', { patch: { personId: null } })
    expect(tokens(none)[0]).toBe('Person: Choose a person')
    expect(none).toMatch(/class="tsent__token is-person is-unset"/)
  })

  it('ends with the verdict, the buttons and the one why-line it is given, as a bar', () => {
    const col: ColumnView = { id: 'today', label: 'Today', tip: 'Decides sign-ins now; this policy is off', status: 'decided', policyName: null, line: '', decision: '2fa', possible: [] }
    const full = sentence('sc-hrms-office', {
      verdict: <SentenceVerdict columns={[col]} />,
      actions: <button type="button" aria-label="Replay" />,
      why: 'Rule 1 · In a corporate office',
    })
    expect(full).toContain('class="tsent"')
    expect(full).toContain('class="tsent__end"')
    expect(text(full)).toContain('Allow with 2FA')
    expect(full).toContain('aria-label="Replay"')
    expect(full).toContain('<p class="tsent__why">Rule 1 · In a corporate office</p>')
    /* The why-line is under the sentence, not in it. */
    expect(full.indexOf('tsent__why')).toBeGreaterThan(full.indexOf('tsent__end'))
  })

  it('is the pills alone in the test panel: no card, no end cluster, no why-line of its own', () => {
    const col: ColumnView = { id: 'today', label: 'Today', tip: 'Decides sign-ins now; this policy is off', status: 'decided', policyName: null, line: '', decision: '2fa', possible: [] }
    const bare = sentence('sc-hrms-office', {
      policies: BARE,
      layout: 'panel',
      verdict: <SentenceVerdict columns={[col]} />,
      actions: <button type="button" aria-label="Replay" />,
      why: 'Rule 1 · In a corporate office',
    })
    expect(bare).toContain('role="group" aria-label="Sign-in" class="tsent is-panel"')
    expect(bare).not.toContain('tsent__end')
    expect(bare).not.toContain('tsent__why')
    expect(bare).not.toContain('bx-decision-badge')
    /* The connector words stay inline, each with its pill. */
    expect(text(bare)).toBe('KM Kavya Menon signs in to HRMS from Office network')
  })
})

describe('the application panel', () => {
  it('lists only the policy’s own applications', () => {
    const out = panel('app', 'sc-dev-tools')
    expect(options(out)).toEqual(['GitHub Enterprise', 'Jira'])
    expect(out).toContain('role="listbox" aria-label="Application"')
    expect(out).toMatch(/aria-selected="true"[^>]*>[\s\S]*?GitHub Enterprise/)
    /* Two applications need no search. */
    expect(out).not.toContain('Search applications')
    expect(out).not.toContain('As if on')
  })

  it('lists every application for the Global Default, with a search', () => {
    const out = panel('app', 'global-default')
    expect(options(out)).toEqual(t.apps.map((a) => a.name))
    expect(out).toContain('aria-label="Search applications"')
  })

  it('lists every application under "As if on" for a draft with none', () => {
    const draft = { ...policy('sc-dev-tools'), appIds: [] }
    const out = panel('app', 'sc-dev-tools', boardScope(draft))
    expect(options(out)).toHaveLength(t.apps.length)
    expect(text(out)).toContain('As if on')
  })
})

describe('the other panels', () => {
  it('lists the policy’s people first, with faces, and a search', () => {
    const out = panel('person', 'sc-dev-tools')
    const said = text(out)
    expect(said.indexOf('In this policy')).toBeLessThan(said.indexOf('Not in this policy'))
    expect(said.indexOf('Arun Patel')).toBeLessThan(said.indexOf('Not in this policy'))
    expect(out).toContain('aria-label="Search people"')
    expect(out).toContain('bx-face is-user is-sm')
  })

  it('lists the tenant’s directory without policy headings on Sign-in tests', () => {
    const out = panel('person', 'sc-dev-tools', GLOBAL_SCOPE)
    expect(text(out)).not.toContain('In this policy')
    expect(options(out)).toHaveLength(t.directory.people.length)
  })

  it('offers the four origins, the IP address, and the place only where a rule reads one', () => {
    const out = panel('from', 'sc-dev-tools')
    expect(options(out)).toEqual(['Office network', 'Branch office', 'Home broadband', 'Tor exit'])
    expect(text(out)).toContain('IP address')
    expect(out).toContain('id="bb-try-panel-address"')
    expect(text(out)).toContain('Place')
    /* Against BARE: on the showcase the Global Default reads a place on
       every application since its baseline (30 Sep 2026). Zoom, which no
       other policy covers (Slack's read the country since the same evening). */
    expect(text(panel('from', 'global-default', undefined, { appId: 'zoom' }))).toContain('Place')
    const plain = panel('from', 'global-default', undefined, { appId: 'zoom' }, BARE)
    expect(text(plain)).not.toContain('Place')
  })

  it('offers Any device and the presets, with Edit details where a profile checks details', () => {
    const out = panel('device', 'sc-dev-tools')
    expect(options(out)[0]).toBe('Any device')
    expect(options(out)).toContain('Windows 11 laptop · registered')
    expect(text(out)).toContain('Edit details')
  })
})

describe('the verdict', () => {
  const col = (id: ColumnView['id'], label: string, status: ColumnView['status'], decision: ColumnView['decision'] = null): ColumnView => ({
    id,
    label,
    tip: label === 'Live' ? 'Decides sign-ins now' : 'The rules on this board, as if saved',
    status,
    policyName: null,
    line: '',
    decision,
    possible: [],
  })

  it('is one badge when the board and today agree', () => {
    const out = html(<SentenceVerdict columns={[col('live', 'Live', 'decided', 'deny')]} />)
    expect(out.match(/bx-decision-badge/g)).toHaveLength(1)
    expect(text(out)).toBe('Deny')
    expect(out).not.toContain('role="img"')
  })

  it('is two badges and a quiet arrow when they differ, named as one', () => {
    const out = html(<SentenceVerdict columns={[col('live', 'Live', 'decided', '1fa'), col('edits', 'Your edits', 'decided', 'deny')]} />)
    expect(out).toContain('role="img" aria-label="Live Allow on 1 factor, Your edits Deny"')
    expect(out.match(/bx-decision-badge/g)).toHaveLength(2)
    expect(out).toContain('bx-badge--positive')
    expect(out).toContain('bx-badge--negative')
    expect(out).toContain('tsent-verdict__arrow')
    expect(text(out)).toBe('Allow on 1 factor Deny')
  })

  it('says Depends and Can’t tell as grey words, never a badge', () => {
    const depends = html(<SentenceVerdict columns={[col('live', 'Live', 'decided', '1fa'), col('edits', 'Your edits', 'depends')]} />)
    expect(depends.match(/bx-decision-badge/g)).toHaveLength(1)
    expect(depends).toContain('<span class="tsent-verdict__word">Depends</span>')
    const cant = html(<SentenceVerdict columns={[col('edits', 'Your edits', 'incomplete')]} />)
    expect(cant).not.toContain('bx-decision-badge')
    expect(cant).toContain('bx-canttell')
    expect(text(cant)).toBe("Can't tell")
  })
})

describe('the verdict in the test panel', () => {
  const col = (id: ColumnView['id'], label: string, status: ColumnView['status'], decision: ColumnView['decision'] = null): ColumnView => ({
    id,
    label,
    tip: 'Decides sign-ins now',
    status,
    policyName: null,
    line: '',
    decision,
    possible: [],
  })

  it('puts the version’s name over one larger badge', () => {
    const out = html(<SentenceVerdict layout="panel" columns={[col('live', 'Live', 'decided', 'deny')]} />)
    expect(out).toContain('<div class="tsent-verdict is-panel">')
    expect(out).toContain('<span class="tsent-verdict__cap">Live</span>')
    expect(out).toContain('tsent-verdict__big')
    expect(text(out)).toBe('Live Deny')
  })

  it('draws two versions as two captioned mini columns with the arrow between', () => {
    const out = html(<SentenceVerdict layout="panel" columns={[col('live', 'Today', 'decided', '1fa'), col('edits', 'Your edits', 'decided', 'deny')]} />)
    expect(out).toContain('role="img" aria-label="Today Allow on 1 factor, Your edits Deny"')
    expect(out.match(/class="tsent-verdict__col"/g)).toHaveLength(2)
    expect(text(out)).toBe('Today Allow on 1 factor Your edits Deny')
    expect(out.indexOf('tsent-verdict__arrow')).toBeGreaterThan(out.indexOf('Allow on 1 factor'))
  })

  it('says Depends in grey under its caption, never a badge', () => {
    const out = html(<SentenceVerdict layout="panel" columns={[col('edits', 'Your edits', 'depends')]} />)
    expect(out).not.toContain('bx-decision-badge')
    expect(out).toContain('<span class="tsent-verdict__word">Depends</span>')
  })
})

describe('the stylesheet', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('takes every colour from the console’s tokens', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/\brgba?\(/i)
    expect(rules).not.toMatch(/\bhsla?\(/i)
  })

  it('moves nothing, and drops its colour transitions under reduced motion', () => {
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).not.toMatch(/\btranslate\s*:/)
    expect(rules).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.tsent__token\s*\{\s*transition:\s*none/)
  })

  it('draws the open token in the accent and the card as the spec’s raised card', () => {
    expect(rules).toMatch(/\.tsent__token\.is-open[^{]*\{[^}]*background: var\(--accent-soft\);[^}]*border-color: var\(--accent\);[^}]*color: var\(--accent-strong\)/)
    expect(rules).toMatch(/\.tsent \{[^}]*max-width: 960px;[^}]*background: var\(--surface-raised\);[^}]*border: var\(--bw-thin\) solid var\(--border-subtle\);[^}]*border-radius: var\(--radius-lg\);[^}]*box-shadow: var\(--el-mid\)/)
    expect(rules).toMatch(/\.tsent__token \{[^}]*height: 30px;[^}]*background: var\(--ctl-bg\);[^}]*border: var\(--bw-thin\) solid var\(--border-default\);[^}]*border-radius: var\(--radius-md\)/)
  })

  it('drops the card’s chrome in the test panel', () => {
    expect(rules).toMatch(/\.tsent\.is-panel \{[^}]*padding: 0;[^}]*background: none;[^}]*border: 0;[^}]*box-shadow: none;/)
  })

  it('never puts a dot or a dashed edge on a pill', () => {
    expect(rules).not.toMatch(/dashed|dotted/)
    expect(rules).not.toMatch(/::before|::after/)
  })
})
