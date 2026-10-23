/// <reference types="vite/client" />
import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { blankPolicy, fallbackRule, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider } from '../../store'
import { dictionaryOf, type DescribeTenant } from '../../create/describe-model'
import { DescribeDoor } from './DescribeMagic'
import { GuidedSetup } from './GuidedSetup'
import { GuidedRuleForm } from './GuidedRuleForm'
import { planGuided, type GuidedAct, type GuidedBoard, type GuidedEntry } from './guided-setup'
import css from './guided-setup.css?raw'
import panelSrc from './GuidedSetup.tsx?raw'
import modelSrc from './guided-setup.ts?raw'
import saidSrc from './describe-said.ts?raw'
import quickSrc from './DescribeQuick.tsx?raw'
import formSrc from './GuidedRuleForm.tsx?raw'
import pickSrc from '../pick-combo.tsx?raw'
import whoSrc from '../who-combo.tsx?raw'
import builderSrc from './BoardBuilder.tsx?raw'
import magicSrc from './DescribeMagic.tsx?raw'

/* -----------------------------------------------------------------------------
   Guided setup's panel as static markup (GuidedSetup.tsx; GUIDED-SETUP.md):
   the header and its side switch, the context, the result with one Undo, the
   muted history folding past three, the one docked Next card — the New rule
   form or the selected rule's quick actions — and Everyone else at its foot.
   The clicks are the model's (guided-setup.test.ts); this is the join to the
   page. No orange in it: Add rule and Change who are ink.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const cut = dictionaryOf(tenant).cutoffs
const html = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
const noop = () => {}
/* The words as read: a face's initials sit beside its name, hidden from assistive tech. */
const words = (s: string) => text(s.replace(/<span class="bx-face[^"]*" aria-hidden="true">[^<]*<\/span>/g, ''))

/* A visit: each action planned on the board as the last one left it, written, as the builder does. */
function visit(acts: GuidedAct[]) {
  let base: Policy = { ...blankPolicy('HRMS', ['hrms']), fallback: fallbackRule('deny') }
  const log: GuidedEntry[] = []
  acts.forEach((act, i) => {
    const b: GuidedBoard = { rules: base.rules, fallback: base.fallback, appIds: base.appIds }
    const plan = planGuided(b, act, tenant, cut)
    const after: Policy = { ...base, rules: plan.rules, fallback: plan.fallback, appIds: plan.appIds }
    log.push({ id: i + 1, act, plan, base, after, wrote: plan.changed, appsBefore: [...base.appIds] })
    base = after
  })
  return { draft: base, log }
}

type Props = ComponentProps<typeof GuidedSetup>
const panel = (more: Partial<Props> = {}) => {
  const { draft, log } = more.log ? { draft: more.draft!, log: more.log } : visit([])
  return html(
    <GuidedSetup
      tenant={tenant}
      draft={draft}
      context={null}
      side="left"
      log={log}
      undoable={null}
      cutoffs={cut}
      appsTaken={() => undefined}
      onSide={noop}
      onContext={noop}
      onAct={noop}
      onCommit={noop}
      onUndo={noop}
      onClose={noop}
      {...more}
    />,
  )
}
const contractors = { groupIds: ['contractors'], userIds: [] }

describe('the panel, before anything is done', () => {
  const out = panel()

  it('is Guided setup: its title, the side switch and a close, and never Describe it', () => {
    expect(out).toContain('<h2 id="bgs-title" class="bgs__title">Guided setup</h2>')
    expect(out).toContain('aria-label="Panel position: On the left"')
    expect(out).toContain('aria-label="Close guided setup"')
    expect(text(out)).not.toContain('Describe')
    expect(out).toMatch(/<aside class="bgs is-left"/)
  })

  it('opens on a new rule: the context chip and the New rule form, in the kept order, with no examples and no text box', () => {
    expect(out).toMatch(/<span class="bgs__ctx is-new">[\s\S]*?New rule<\/span>/)
    expect(out).toContain('<div class="bgf">')
    expect(out).not.toContain('class="bdsq')
    expect(text(out)).toMatch(/Applications[\s\S]*What happens[\s\S]*Who[\s\S]*Conditions/)
    expect(text(out)).not.toContain('Additional actions')
    expect(text(out)).not.toContain('Examples')
    expect(out).not.toContain('<textarea')
    /* The policy's own application arrives ticked, so the sentence is whole. */
    expect(words(out)).toMatch(/Everyone signing in to HRMS ?: allow with 2FA ?\./)
  })

  it('draws the form at rest as four rows, all closed: state mark, label, value, chevron', () => {
    const form = out.slice(out.indexOf('<div class="bgf">'), out.indexOf('<div class="bgf__send'))
    const heads = form.match(/<button[^>]*class="bgf__head"[^>]*>/g) ?? []
    expect(heads).toHaveLength(4)
    for (const h of heads) expect(h).toContain('aria-expanded="false"')
    expect(form).not.toContain('class="bgf__body"')
    expect(form.match(/class="bgf__chev"/g)).toHaveLength(4)
    expect([...form.matchAll(/<span class="bgf__label">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['Applications', 'What happens', 'Who', 'Conditions'])
  })

  it('marks each row’s state: a grey tick when answered, a dashed plus — and muted words — while empty or the default', () => {
    const rows = sections(out)
    expect(rows.map((r) => /bgf__state is-(set|empty)/.exec(r)?.[1])).toEqual(['set', 'set', 'empty', 'empty'])
    /* The policy's application, by its logo and name. */
    expect(rows[0]).toMatch(/class="bgf__value"[\s\S]*class="applogo[\s\S]*HRMS/)
    /* What happens: its decision's own mark, in colour — not grey. */
    expect(rows[1]).toContain('class="bx-dmark is-positive-strong is-sm"')
    expect(rows[1]).not.toMatch(/bx-dmark[^"]*is-muted/)
    expect(text(rows[1])).toContain('Allow with 2FA')
    /* The defaults, said and muted. */
    expect(rows[2]).toMatch(/class="bgf__value is-muted"[^>]*>Everyone</)
    expect(rows[3]).toMatch(/class="bgf__value is-muted"[^>]*>Any place, any device</)
    /* The tick is grey: colour belongs to the values. */
    expect(css).toMatch(/\.bgf__state\.is-set \{ background: var\(--surface-inset\);[^}]*color: var\(--text-secondary\); \}/)
    expect(css).toMatch(/\.bgf__state\.is-empty \{ border: 1px dashed /)
  })

  it('says nothing that is not there yet: no result, no history, no Undo', () => {
    expect(text(out)).not.toContain('Understood')
    expect(out).not.toContain('bgs__lines')
    expect(out).not.toContain('bgs__history')
    expect(text(out)).not.toContain('Undo')
  })

  it('ends its one card with Everyone else — the What happens rows, compact, the one in force in its own tone — and no Add a rule on a new rule', () => {
    expect(out.match(/class="bgs__next/g)).toHaveLength(1)
    const foot = out.slice(out.indexOf('<div class="bgs__foot"'))
    expect(foot).toMatch(/<div class="bgf__choices is-compact" role="radiogroup" aria-label="Everyone else">/)
    /* One choice: radios, the one in force checked, tinted in its own tone with its tick, the only one in the tab order. */
    const rows = foot.match(/<button[^>]*role="radio"[\s\S]*?<\/button>/g) ?? []
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => /class="bx-dmark is-([\w-]+) is-sm"/.exec(r)?.[1])).toEqual(['positive-strong', 'positive', 'negative'])
    const on = rows.filter((r) => r.includes('aria-checked="true"'))
    expect(on).toHaveLength(1)
    /* This policy's last row denies: Deny, in red's own tint. */
    expect(on[0]).toMatch(/tabindex="0" class="bgf__choice is-negative"/)
    expect(on[0]).toMatch(/class="bgf__choicetick" aria-hidden="true"><svg/)
    expect(foot.match(/role="radio" aria-checked="false" tabindex="-1"/g)).toHaveLength(2)
    /* One line each: no gloss, no Current, no blue tiles. */
    expect(text(foot)).toMatch(/^Everyone else Allow with 2FA Allow on 1 factor Deny$/)
    expect(out).not.toContain('bgf__gloss')
    expect(out).not.toContain('bgs__tile')
    expect(text(out)).not.toContain('Add a rule')
  })

  it('has no orange in it, and Add rule is ink', () => {
    expect(out).not.toContain('bx-btn--brand')
    expect(out).toMatch(/<button type="button" class="bgf__go">Add rule/)
    const go = [...css.matchAll(/\.bgf__go \{([^}]*)\}/g)].map((m) => m[1]).join('\n')
    expect(go).toContain('background: var(--text-primary)')
  })
})

/* The New rule form on its own, started where a test needs it (GuidedRuleForm.tsx `start`). */
const formOf = (start?: ComponentProps<typeof GuidedRuleForm>['start'], apps: string[] = ['hrms']) =>
  html(<GuidedRuleForm tenant={tenant} guided={{ apps, taken: (id) => (id === 'dropbox' ? 'Partner access' : undefined), onAdd: noop }} start={start} />)
/* Each section's markup, in order. */
function sections(s: string): string[] {
  const at = [...s.matchAll(/<div class="bgf__sec is-/g)].map((m) => m.index ?? 0)
  const end = s.indexOf('<div class="bgf__send')
  return at.map((a, i) => s.slice(a, at[i + 1] ?? end))
}

describe('the New rule form, a section open', () => {
  it('opens one section at a time, in place, under its own row', () => {
    for (const open of ['apps', 'decision', 'who', 'conds'] as const) {
      const out = formOf({ open })
      expect(out.match(/aria-expanded="true"[^>]*class="bgf__head"|class="bgf__head"[^>]*aria-expanded="true"/g), open).toHaveLength(1)
      expect(out.match(/class="bgf__body"/g), open).toHaveLength(1)
      const i = ['apps', 'decision', 'who', 'conds'].indexOf(open)
      const rows = sections(out)
      expect(rows[i]).toContain('class="bgf__body"')
      expect(rows[i]).toMatch(/<div class="bgf__sec is-\w+ is-open">/)
      /* The row names its contents, and they name the row. */
      const head = /id="([^"]+)-head"[^>]*aria-controls="([^"]+)"/.exec(rows[i])
      expect(head?.[2]).toBe(`${head?.[1]}-body`)
      expect(rows[i]).toContain(`role="region" aria-labelledby="${head?.[1]}-head"`)
    }
  })

  it('asks for applications in the same field as Who — chips with logos inside it, no chip row outside', () => {
    const out = formOf({ open: 'apps' }, ['hrms', 'salesforce'])
    const body = sections(out)[0]
    expect(body).toContain('class="sit-ident__fieldwrap pkc"')
    expect(body).toMatch(/<div class="sit-ident__field is-set">[\s\S]*class="sit-ident__chips"[\s\S]*class="sit-ident__chip pkc__chip" title="HRMS"[\s\S]*class="applogo[\s\S]*title="Salesforce"/)
    expect(body).toContain('aria-label="Applications: HRMS, Salesforce"')
    expect(body).toContain('aria-haspopup="listbox"')
    /* Nothing outside the field: the old chip row and its × buttons are gone. */
    for (const old of ['bdsq__apps', 'bdsq__app', 'bdsq__chips', 'bdsq__chip', 'bgs__chips']) expect(out).not.toContain(old)
    expect(out.match(/aria-label="Remove /g)).toHaveLength(2)
    expect(body.indexOf('sit-ident__chips')).toBeGreaterThan(body.indexOf('sit-ident__field'))
  })

  it('opens What happens on three full-width rows: coloured mark, name, gloss, the pick in its own tone with a tick', () => {
    for (const [d, tone] of [['2fa', 'positive-strong'], ['1fa', 'positive'], ['deny', 'negative']] as const) {
      const out = formOf({ open: 'decision', decision: d })
      const body = sections(out)[1]
      expect(body).toContain('<div class="bgf__choices" role="radiogroup" aria-label="What happens">')
      const rows = body.match(/<button[^>]*role="radio"[\s\S]*?<\/button>/g) ?? []
      expect(rows).toHaveLength(3)
      expect(rows.map((r) => words(r))).toEqual(['Allow with 2FA Password, then a second factor', 'Allow on 1 factor Password only', 'Deny Refused, with a message'])
      /* Each mark in its decision's colour, never grey. */
      expect(rows.map((r) => /class="bx-dmark is-([\w-]+) is-md"/.exec(r)?.[1])).toEqual(['positive-strong', 'positive', 'negative'])
      /* One checked — the only one in the tab order — tinted in its own tone, with its tick. */
      const on = rows.filter((r) => r.includes('aria-checked="true"'))
      expect(on).toHaveLength(1)
      expect(on[0]).toContain(`class="bgf__choice is-${tone}"`)
      expect(on[0]).toContain('tabindex="0"')
      expect(on[0]).toMatch(/class="bgf__choicetick" aria-hidden="true"><svg/)
      expect(rows.filter((r) => r.includes('tabindex="-1"'))).toHaveLength(2)
      expect(rows.filter((r) => /class="bgf__choicetick" aria-hidden="true"><\/span>/.test(r))).toHaveLength(2)
    }
    /* The picked tints are the decisions' own: never the selection blue, never orange. */
    const picked = [...css.matchAll(/\.bgf__choice\[aria-checked="true"\]\.is-([\w-]+) \{([^}]*)\}/g)]
    expect(picked.map((m) => m[1])).toEqual(['positive-strong', 'positive', 'negative'])
    for (const [, tone, body] of picked) expect(body).toContain(`var(--fb-${tone}-bg)`)
    expect(css).not.toMatch(/\.bgf__choice[^{]*\{[^}]*(--tint-blue|--brand)/)
  })

  it('asks Who with the Access checks field, Everyone as its empty answer', () => {
    const body = sections(formOf({ open: 'who' }))[2]
    expect(body).toContain('aria-label="Who: Everyone"')
    expect(body).toContain('sit-ident__field is-empty is-answer')
  })

  it('opens Conditions as a chip field too, anywhere as its empty answer, and stands it down for a Deny', () => {
    const body = sections(formOf({ open: 'conds', conds: ['z:india', 'risk'] }))[3]
    expect(body).toContain('class="sit-ident__fieldwrap pkc"')
    expect(body).toContain('aria-label="Conditions: Only from India, Deny at high risk"')
    /* Each chip its kind's icon and the short name; the whole condition on hover. */
    expect(body).toMatch(/class="sit-ident__chip pkc__chip" title="Only from India"><span class="pkc__art" aria-hidden="true"><span class="bgf__condart is-md"[\s\S]*?<span class="sit-ident__chipname">India<\/span>/)
    expect(body).toMatch(/title="Deny at high risk">[\s\S]*?<span class="sit-ident__chipname">High risk<\/span>/)
    /* Every zone and profile the tenant has is on offer: the list scrolls and searches, so nothing is capped. */
    expect(formSrc).not.toMatch(/(zones|fingerprints)\.slice\(/)
    expect(sections(formOf({ open: 'conds' }))[3]).toContain('sit-ident__field is-empty is-answer')
    /* A Deny: the row is off, says anywhere, and nothing opens. */
    const deny = formOf({ open: 'conds', decision: 'deny', conds: ['z:india'] })
    const row = sections(deny)[3]
    expect(row).toMatch(/<button[^>]*class="bgf__head"[^>]*disabled=""/)
    expect(row).not.toContain('class="bgf__body"')
    expect(row).toMatch(/class="bgf__value is-muted"[^>]*>Any place, any device</)
  })
})

describe('the New rule form, filled', () => {
  const who = { groupIds: ['finance', 'sales', 'executives'], userIds: [] }
  const out = formOf({ who, conds: ['z:india', 'f:fp-corp-devices', 'risk'] }, ['hrms', 'salesforce', 'workday', 'zoom'])
  const rows = sections(out)
  const sentence = out.slice(out.indexOf('<p class="bgf__sentence"'), out.indexOf('</p>', out.indexOf('<p class="bgf__sentence"')))

  it('says the rows in a few marks and words, never every name — the rest on hover and to a screen reader', () => {
    /* Past two applications: the first, its logo, then +N. */
    expect(words(rows[0])).toMatch(/Applications HRMS \+3 HRMS, Salesforce, Workday and Zoom$/)
    expect(rows[0]).toContain('title="HRMS, Salesforce, Workday and Zoom"')
    /* Who: a face, the first name, and N more. */
    expect(rows[2]).toContain('bx-face is-group is-sm')
    expect(words(rows[2])).toMatch(/^Who Finance and 2 more Finance, Sales and Executives$/)
    /* Conditions: the icon and words, then +N. */
    expect(rows[3]).toContain('class="bgf__condart is-sm"')
    expect(words(rows[3])).toMatch(/^Conditions India \+2 Only from India, Only on Corporate devices and Deny at high risk$/)
    expect(rows.map((r) => /bgf__state is-(set|empty)/.exec(r)?.[1])).toEqual(['set', 'set', 'set', 'set'])
    /* Two applications: both, by name, while both fit whole (measured in the browser; else the first and +1) — and
       named in full on hover either way. */
    const two = sections(formOf(undefined, ['hrms', 'salesforce']))[0]
    expect(words(two)).toMatch(/^Applications HRMS Salesforce HRMS and Salesforce$/)
    expect(two).toContain('title="HRMS and Salesforce"')
  })

  it('draws faces at the 12 px floor, on the marks’ 20 px, not the kit’s 9 px small face', () => {
    expect(rows[2]).toContain('bx-face is-group is-sm')
    expect(css).toMatch(/\.bgs__tok \.bx-face,\s*\.bgf__tok \.bx-face \{ width: 20px; height: 20px; font-size: var\(--fs-xs\);/)
  })

  it('writes the rule as one sentence with its marks inline, and "and N more" for the rest', () => {
    expect(words(sentence)).toBe('Finance and 2 more signing in to HRMS and 3 more : allow with 2FA only from India , on Corporate devices , and deny at high risk .')
    /* A face before the first of who, a logo before the first application — the rest named on hover. */
    expect(sentence).toMatch(/class="bgf__tok is-said"><span class="bx-face is-group is-sm" aria-hidden="true">FI<\/span><span class="bgf__tokname">Finance<\/span>/)
    expect(sentence).toContain(' <span class="bgf__more" title="Sales and Executives">and 2 more</span>')
    expect(sentence).toMatch(/class="bgf__tok is-said"><span class="applogo[^"]*"[^>]*title="HRMS"/)
    expect(sentence).toContain(' <span class="bgf__more" title="Salesforce, Workday and Zoom">and 3 more</span>')
    /* A line breaks only between whole phrases: "and N more" on one line, each connective inside its name's piece. */
    expect(css).toMatch(/\.bgf__more \{ white-space: nowrap;/)
    expect([...sentence.matchAll(/<span class="bgf__lead">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['only from', 'on', 'and'])
    /* The decision's own mark before its words; each condition's icon before its name. */
    expect(sentence).toMatch(/<span class="bgf__outcome"><span class="bx-dmark is-positive-strong is-xs" aria-hidden="true">/)
    expect(sentence.match(/class="bgf__condart is-sm"/g)).toHaveLength(3)
    /* Never every name; one "only". */
    for (const n of ['Workday', 'Zoom', '>Sales<', 'Executives<']) expect(sentence).not.toContain(n.startsWith('>') ? n : `>${n}`)
    expect(words(sentence).match(/\bonly\b/g)).toHaveLength(1)
  })

  it('drops the conditions from a Deny, and waits for an application before Add rule', () => {
    const deny = formOf({ decision: 'deny', conds: ['z:india', 'risk'] })
    const said = deny.slice(deny.indexOf('<p class="bgf__sentence"'), deny.indexOf('</p>', deny.indexOf('<p class="bgf__sentence"')))
    expect(words(said)).toBe('Everyone signing in to HRMS : deny .')
    expect(said).toContain('class="bx-dmark is-negative is-xs"')
    const none = formOf(undefined, [])
    expect(none).toMatch(/<button type="button" class="bgf__go" disabled="">Add rule/)
    expect(none).toContain('<span class="bgf__gap">which applications</span>')
    expect(sections(none)[0]).toMatch(/bgf__state is-empty[\s\S]*class="bgf__value is-muted"[^>]*>Choose applications</)
  })
})

describe('after actions', () => {
  const acts: GuidedAct[] = [
    { kind: 'add', pick: { apps: ['hrms'], decision: '2fa', denyHighRisk: false } },
    { kind: 'add', pick: { apps: ['hrms'], decision: '1fa', who: contractors, denyHighRisk: false } },
    { kind: 'rest', decision: '1fa' },
    { kind: 'add', pick: { apps: ['hrms'], decision: 'deny', who: { groupIds: ['finance'], userIds: [] }, denyHighRisk: false } },
    { kind: 'add', pick: { apps: ['hrms'], decision: '2fa', who: { groupIds: ['sales'], userIds: [] }, zoneId: 'india', denyHighRisk: false } },
  ]
  const { draft, log } = visit(acts)
  const out = panel({ draft, log, undoable: log.at(-1)!.id })

  it('folds the steps to "Understood", with no count, then one plain line per decision, each led by its mark', () => {
    const result = out.slice(out.indexOf('<section class="bgs__result"'), out.indexOf('<section class="bgs__history"'))
    expect(text(result)).toMatch(/^[^A-Za-z]*Understood /)
    expect(text(result)).not.toMatch(/\d+ steps?/)
    expect(words(result)).toContain('Sign-ins to HRMS from Sales outside India are now denied.')
    expect(words(result)).toContain('Sign-ins to HRMS from Sales in India now need a second factor.')
    expect(result.match(/class="bx-dmark is-negative is-md"/g)).toHaveLength(1)
    expect(result.match(/class="bx-dmark is-positive-strong is-md"/g)).toHaveLength(1)
    /* A logo before the application, a face before the group, an icon before the zone. */
    expect(result).toContain('class="bgs__tok"')
    expect(result).toContain('bx-face is-group is-sm')
    expect(result).toContain('class="bgs__tok is-cond"')
  })

  it('offers Undo once, on the latest action’s last line', () => {
    expect(out.match(/>Undo</g)).toHaveLength(1)
    expect(out.indexOf('>Undo<')).toBeLessThan(out.indexOf('class="bgs__history"'))
    expect(panel({ draft, log, undoable: null })).not.toContain('>Undo<')
  })

  it('keeps earlier actions as muted lines with grey marks and no controls, and folds past three into Earlier changes', () => {
    const history = out.slice(out.indexOf('<section class="bgs__history"'), out.indexOf('<section class="bgs__next'))
    expect(history.match(/class="bgs__lines is-quiet"/g)).toHaveLength(3)
    expect(history).not.toMatch(/is-md(?! is-muted)/)
    expect(history).not.toMatch(/class="bx-dmark is-(positive|positive-strong|negative) is-xs"/)
    expect(history).not.toContain('<button type="button" class="bx-btn')
    expect(text(history)).toContain('Earlier changes')
    /* Newest first: the Finance deny, then the last row, then Contractors. */
    expect(text(history).indexOf('Finance')).toBeLessThan(text(history).indexOf('Any other sign-in'))
    expect(text(history).indexOf('Any other sign-in')).toBeLessThan(text(history).indexOf('Contractors'))
    /* Colour is the result's alone: every mark here is grey. */
    const marks = history.match(/class="bx-dmark[^"]*"/g) ?? []
    expect(marks.length).toBeGreaterThan(0)
    for (const m of marks) expect(m).toContain('is-muted')
  })
})

describe('an action taken back', () => {
  const acts: GuidedAct[] = [
    { kind: 'add', pick: { apps: ['hrms'], decision: '2fa', denyHighRisk: false } },
    { kind: 'add', pick: { apps: ['hrms'], decision: '1fa', who: contractors, denyHighRisk: false } },
    { kind: 'rest', decision: '1fa' },
  ]
  const { draft, log } = visit(acts)

  it('is said under Undone, muted, with no Undo, while the lines still say what it was', () => {
    const out = panel({ draft, log, undoable: null, undone: new Set([3]) })
    const result = out.slice(out.indexOf('<section class="bgs__result"'), out.indexOf('<section class="bgs__history"'))
    expect(text(result)).toMatch(/^Undone /)
    expect(text(result)).not.toContain('Understood')
    expect(result).toContain('class="bgs__lines is-quiet"')
    expect(result).not.toContain('>Undo<')
    expect(out).toMatch(/<p class="u-sr-only" role="status">Undone\. /)
  })

  it('drops undone actions from the history', () => {
    const out = panel({ draft, log, undoable: 3, undone: new Set([2]) })
    const history = out.slice(out.indexOf('<section class="bgs__history"'), out.indexOf('<section class="bgs__next'))
    expect(words(history)).not.toContain('Contractors')
    expect(words(history)).toContain('Everyone signing in')
    expect(out).toMatch(/<p class="u-sr-only" role="status">Understood\. /)
  })
})

describe('a rule as the context', () => {
  const { draft, log } = visit([{ kind: 'add', pick: { apps: ['hrms'], decision: '1fa', who: contractors, denyHighRisk: false } }])
  const rule = draft.rules[0]
  const out = panel({ draft, log, context: { ruleId: rule.id, label: `Rule 1 · ${rule.name}` } })

  it('names the rule in the chip, with a way back to a new rule', () => {
    expect(out).toContain('<span class="bgs__ctxname">Rule 1 · Contractors</span>')
    expect(out).toContain('aria-label="Back to new rule"')
  })

  it('offers its quick actions in place of the form: What happens, the chips, Change who, Delete rule', () => {
    expect(out).not.toContain('class="bdsq')
    expect(out).toMatch(/<div class="bgf__choices is-compact" role="radiogroup" aria-label="What happens">[\s\S]*?aria-checked="false"[\s\S]*?Allow with 2FA[\s\S]*?aria-checked="true" tabindex="0" class="bgf__choice is-positive"[\s\S]*?Allow on 1 factor/)
    expect(text(out)).not.toContain('Current')
    expect(text(out)).toContain('Only from Corporate offices Only from India Only on Corporate devices Deny at high risk')
    expect(out).toContain('aria-label="Who: Contractors"')
    /* Delete is neutral until the confirm: no red here. */
    expect(out).toMatch(/class="bx-btn bx-btn--neutral bx-btn--sm[^"]*"[^>]*>[\s\S]*?Delete rule/)
    expect(out).not.toContain('bx-btn--danger')
  })

  it('ends with Everyone else and + Add a rule', () => {
    expect(text(out)).toMatch(/Everyone else [\s\S]*Add a rule$/)
  })
})

describe('where it stands', () => {
  it('on the right, the inspector’s track', () => {
    expect(panel({ side: 'right' })).toMatch(/<aside class="bgs is-right"/)
    expect(css).toMatch(/\.bgs\.is-right \{\s*grid-column: 3;/)
  })

  it('on the left, and beside the rule panel, the leading track', () => {
    expect(css).toMatch(/\.bb\.is-guided-left,\s*\.bb\.is-guided-beside \{ --bb-left: 400px; \}/)
  })

  it('beside the rule panel, the rule panel stays open and the canvas editable', () => {
    expect(builderSrc).toContain('const inspBlocked = describeOpen && !guidedBeside')
    expect(builderSrc).toContain('const canvasLocked = describeOpen && !guidedBeside')
    expect(builderSrc).toContain("onMove={(from, to) => (canvasLocked ? undefined : move(from, to))}")
  })
})

describe('the door', () => {
  it('says Guide me, names the card it opens on, and draws no chip for it', () => {
    /* "Guide me", not "Start guided setup" (owner, 22 Oct 2026), and the selected-card chip inside the button is
       gone with it ("remove that completely from the product") — the context still reaches the panel and still
       names the card for assistive tech, which is what the aria-label below is. */
    expect(text(html(<DescribeDoor onOpen={noop} />))).toBe('Guide me')
    const out = html(<DescribeDoor onOpen={noop} context={{ label: 'Rule 2 · Contractors' }} />)
    expect(out).toContain('aria-label="Guide me through Rule 2 · Contractors"')
    expect(out).not.toContain('bb__magic__ctx')
    expect(text(html(<DescribeDoor onOpen={noop} context={{ label: 'Rule 2 · Contractors' }} />))).toBe('Guide me')
    expect(magicSrc).toContain("const word = GUIDED_SETUP ? 'Guide me' : 'Describe it'")
  })

  it('keeps Describe it whole behind the flag', () => {
    expect(builderSrc).toContain('{describeOpen && !GUIDED_SETUP && (')
    expect(builderSrc).toContain("label: GUIDED_SETUP ? 'Guide me' : 'Describe it'")
  })
})

describe('the words', () => {
  const files = { 'GuidedSetup.tsx': panelSrc, 'guided-setup.ts': modelSrc, 'describe-said.ts': saidSrc, 'DescribeQuick.tsx': quickSrc, 'GuidedRuleForm.tsx': formSrc, 'pick-combo.tsx': pickSrc, 'who-combo.tsx': whoSrc }

  it('never say AI or assistant, and draw no Sparkles or Wand', () => {
    for (const [file, src] of Object.entries(files)) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/\bAI\b|assistant/i)
      expect(code, file).not.toMatch(/\b(Sparkles|Wand\w*)\b/)
    }
  })
})

describe('the stylesheet', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('stops every transition and animation under reduced motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(rules)?.[1] ?? ''
    const before = rules.slice(0, rules.lastIndexOf('@media (prefers-reduced-motion'))
    for (const m of before.matchAll(/^\s*([^{@}]+)\{[^}]*\b(transition|animation)\s*:/gm)) {
      for (const sel of m[1].split(',').map((x) => x.trim())) expect(reduced, `${sel} ${m[2]}`).toContain(sel)
    }
    expect(reduced).toMatch(/animation: none/)
    expect(reduced).toMatch(/transition: none/)
    /* The chip field's portalled list too: no fade under reduced motion (MotionConfig drops only the movement). */
    expect(pickSrc).toContain('initial={reduced ? false : { opacity: 0, y: -3 }}')
  })

  it('moves nothing by transform, and takes its colours from the tokens', () => {
    expect(rules).not.toMatch(/\btransform\s*:/)
    expect(rules).toMatch(/@keyframes bgs-in \{\s*from \{ opacity: 0; translate: -16px 0; \}/)
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(rules).not.toMatch(/rgba?\(/)
    expect(rules).not.toContain('--brand')
  })

  it('keeps its type at 12 px or more', () => {
    for (const m of rules.matchAll(/font-size:\s*([^;]+);/g)) expect(m[1], m[0]).toMatch(/^var\(--fs-(xs|sm|md|lg)\)$/)
  })
})
