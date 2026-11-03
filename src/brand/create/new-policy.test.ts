import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { hasNoRules, hasUnsavedChanges, keptOrNew, lastSaved, newPolicy, openForEditing } from '../policy-draft'
import { copySources, policySources, templateSources } from '../screens/board/copy-rules'
import { PICKER_LOOK } from '../screens/board/bar-tools'
import boardEmptySrc from '../screens/board/BoardEmpty.tsx?raw'
import appPageSrc from '../screens/ApplicationPage.tsx?raw'
import appPostSrc from '../screens/AppPostSignIn.tsx?raw'
import appProtectionSrc from '../screens/AppProtection.tsx?raw'
import boardBarSrc from '../screens/board/BoardBar.tsx?raw'
import boardBuilderSrc from '../screens/board/BoardBuilder.tsx?raw'
import pickerSrc from '../screens/board/RulePicker.tsx?raw'
import librarySrc from '../screens/Library.tsx?raw'
import policiesSrc from '../screens/Policies.tsx?raw'
import storeSrc from '../store.tsx?raw'
import mainSrc from '../../main.tsx?raw'
import dialogSrc from './NewPolicyDialog.tsx?raw'
import sheetSrc from './TemplateSheet.tsx?raw'
import hookSrc from './use-new-policy.tsx?raw'

/* -----------------------------------------------------------------------------
   New policy (owner, 2 Nov 2026, for the team): a name first, and no empty policies. Static only: the popup is portalled
   and the store's clean-up is an effect, so what a press does is read from the source and walked in the browser.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const box = t.policies.find((p) => p.name === 'Box access')!
const code = (s: string) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')

describe('a new policy is held until it has a rule', () => {
  const blank = newPolicy(blankPolicy('New one', []))

  it('is marked, with nothing on it', () => {
    expect(blank.provisional).toEqual({ rules: [] })
    expect(blank.rules).toEqual([])
    expect(hasNoRules(blank)).toBe(true)
  })

  it('opens with the rules it started from, and they read as unsaved', () => {
    const started = newPolicy(blankPolicy('Copied', []), { rules: box.rules })
    expect(openForEditing(started).rules).toBe(box.rules)
    expect(lastSaved(started).rules).toEqual([])
    expect(hasUnsavedChanges(started, openForEditing(started))).toBe(true)
  })

  it('keeps the mark while a rename or an application is saved with no rule', () => {
    const renamed: Policy = { ...blank, name: 'Renamed', appIds: ['box'] }
    expect(keptOrNew(renamed, blank).provisional).toEqual({ rules: [] })
  })

  it('loses the mark on the first save with a rule, and so is kept', () => {
    const saved = keptOrNew({ ...blank, rules: box.rules }, blank)
    expect('provisional' in saved).toBe(false)
  })

  it('cannot get the mark back from a stale copy once it is a real policy', () => {
    expect('provisional' in keptOrNew(blank, box)).toBe(false)
    expect('provisional' in keptOrNew(blank, undefined)).toBe(false)
  })

  it('drops an unsaved policy in the store on any way out, before the next screen paints', () => {
    expect(storeSrc).toContain('useLayoutEffect(() => {')
    expect(storeSrc).toContain("const open = screen.name === 'board' ? screen.policyId : null")
    expect(storeSrc).toContain('all.filter((p) => !p.provisional || p.id === open)')
  })

  it('goes through both of the store’s saves', () => {
    expect(storeSrc.match(/keptOrNew\(settled\(asStored\(keepsCopyMark/g)).toHaveLength(2)
    expect(storeSrc).toContain('keptOrNew(withSavedDraft(x, d), x)')
  })
})

describe('a policy cannot be saved with no rules', () => {
  it('holds for a policy that lost its rules too, and not for the Global Default', () => {
    expect(hasNoRules({ rules: [], isSystem: false })).toBe(true)
    expect(hasNoRules({ rules: box.rules, isSystem: false })).toBe(false)
    expect(hasNoRules({ rules: [], isSystem: true })).toBe(false)
  })

  it('refuses at both saves, and says why on the buttons and when leaving', () => {
    const src = code(boardBuilderSrc)
    expect(src).toContain('const stop = noRules ? NO_RULES_REASON : unnamed ? UNNAMED_REASON : null')
    expect(src).toContain('const saveNow = () => {\n    if (stop) return store.showToast(stop)')
    expect(src).toMatch(/const saveDraft = \(\) => \{\n\s+if \(!saved\) return false\n\s+if \(stop\) \{/)
    expect(src).toContain('blocked: stop })')
    expect(boardBarSrc).toContain('blocked={stop && toPublish ? stop : undefined}')
    expect(boardBarSrc).toContain('blocked={stop && unsaved ? stop : undefined}')
  })

  it('asks nothing on leaving a new policy with no rule, and asks as usual with one', () => {
    expect(boardBuilderSrc).toContain('const toLose = unsaved && !(saved?.provisional && noRules)')
    expect(boardBuilderSrc).toContain('useLeaveGuard({ dirty: toLose,')
  })
})

describe('every door asks first', () => {
  const doors: [string, string][] = [
    ['Policies', policiesSrc],
    ['an application', appPageSrc],
    ['an application’s Post sign-in', appPostSrc],
    ['the Protection panel', appProtectionSrc],
    ['a template’s Use', librarySrc],
  ]

  it.each(doors)('%s goes through the popup and stores only a held policy', (_, src) => {
    const c = code(src)
    expect(c).toContain('useNewPolicy()')
    expect(c).toContain('newOne.dialog')
    expect(c).not.toMatch(/store\.addPolicy\(blank/)
    expect(c).not.toContain("freeName('Untitled")
    for (const add of c.match(/store\.addPolicy\([^\n]*/g) ?? []) expect(add).toContain('newPolicy(')
  })

  it('offers ways to start on sign-in policies, and asks a post sign-in policy or a template only for its name', () => {
    const sign = code(policiesSrc)
    expect(sign.slice(sign.indexOf('const startDraft'), sign.indexOf('blankPolicy(name'))).toContain('ways: true')
    const post = sign.slice(sign.indexOf('function PostSignInPolicies'))
    expect(post.slice(post.indexOf('const startDraft'), post.indexOf('blankPostSignInPolicy(name'))).not.toContain('ways: true')
    expect(code(librarySrc)).not.toContain('ways: true')
  })

  it('stores a new application only once the popup is answered, and says what is missing first', () => {
    const c = code(appPageSrc)
    const body = c.slice(c.lastIndexOf('const startNew = () => {'), c.indexOf('const addExisting'))
    expect(body.indexOf('if (problem)')).toBeLessThan(body.indexOf('newOne.ask('))
    expect(body.indexOf('newOne.ask(')).toBeLessThan(body.indexOf('const appId = create()'))
  })
})

/* The final version (owner, 2 Nov 2026): "a centre-aligned pop-up where we just ask for the name, nothing else. Then we
   go inside, and inside we have three options: Use template, Use existing policy, Start from scratch." */
describe('the popup asks for the name and nothing else', () => {
  const c = code(dialogSrc)

  it('is the centred popup, with two buttons', () => {
    expect(c).toContain('<Modal')
    expect(c).not.toContain('<Drawer')
    expect(c.match(/<Button /g)).toHaveLength(2)
    expect(c).toContain('Create policy')
  })

  it('has one field: no ways to start, no application, no picker', () => {
    expect(c.match(/<input/g)).toHaveLength(1)
    expect(c).not.toMatch(/role="radio"|ApplicationField|bname2__fixed|RulePicker|TemplateSheet/)
  })

  it('never disables Create policy: the name’s reason goes under the field', () => {
    expect(c).toContain('Give the policy a name.')
    expect(c).toContain('A policy with this name already exists.')
    expect(c).not.toMatch(/disabled=/)
  })

  it('opens the builder on its three ways for a sign-in policy, and on a template’s rules from its Use', () => {
    expect(c).toContain('ask.ways ? { rules: [], choose: true } : { rules: ask.rules ?? [] }')
    expect(code(hookSrc)).toContain('return { ask: (a) => setHeld({ ask: a, open: true }), dialog }')
  })

  it('is the only way in: the slider form and the comparison switches are gone', () => {
    expect(code(policiesSrc)).not.toMatch(/NewPolicyFlowSwitch|useFlowSwitchShown|preview=/)
    expect(code(boardBuilderSrc)).not.toMatch(/useCopyPlacement|usePickerLook|copyInside/)
  })
})

describe('inside, three ways to start', () => {
  it('says where the rules come from, what happens and what is left: a Xecurify template, a copy of a policy, scratch', () => {
    const empty = code(boardEmptySrc)
    /* The source pills are hidden until Alt+T (owner, 3 Nov 2026: "by default make the pills hidden and add a shortcut"),
       each behind `pills`; and no note under the cards. */
    expect(empty).toContain("import { usePills } from '../../source-pills'")
    expect(empty.match(/\{pills && \(\s*<span className="bb__start2__tab">/g)?.length).toBe(2)
    expect(empty.match(/bb__start2__tab/g)?.length).toBe(2)
    expect(empty).not.toContain('<Note')
    expect(empty).toContain('<strong>Use a Xecurify template</strong>')
    expect(empty).toContain('<strong>Inherit from an existing policy</strong>')
    expect(empty).toContain('<span className="bb__start2__stage">')
    expect(empty).toContain('<strong>Start from scratch</strong>')
    expect(boardBuilderSrc).toContain('useState(() => !!saved?.provisional && !saved.provisional.choose)')
  })

  /* 'Use the older popup here as well', then 'a filter-like dropdown … for scale' (owner, 2 Nov 2026), then 'replace the
     category dropdown with chips' (3 Nov 2026). */
  it('opens both pickers as the store’s centred popup of cards, taken whole, the categories as chips', () => {
    expect(PICKER_LOOK).toBe('sheet')
    expect(boardBuilderSrc).toContain("onUseTemplate={() => (TEMPLATE_PICKER || cardLook ? openPicker('template') : setPicking(true))}")
    expect(boardBuilderSrc).toContain("onCopyRules={copyOffered ? () => openPicker('policy') : undefined}")
    expect(boardBuilderSrc).toContain("slider={PICKER_LOOK === 'slider'}")
    expect(boardBuilderSrc).toContain('policiesOnly={cardLook && galleryPolicies}')
    expect(boardBuilderSrc).toContain('onChoosePolicy={(p) => copyRules(p, copyableRules(p))}')
    const g = code(sheetSrc)
    expect(g).toContain("{storeLook && <p className=\"bmarket__by\">By miniOrange</p>}")
    expect(g).toContain('const rail = railShelves.length > 1')
    expect(g).toMatch(/\{TEMPLATE_CATEGORIES && shelf === 'xecurify' && \(\s*<div className="bmarket__chips" role="group" aria-label="Filter by category">/)
    expect(g).not.toMatch(/aria-label="Categories"/)
    expect(g).toContain("const title = policiesOnly ? 'Inherit from an existing policy' : 'Xecurify templates'")
    expect(g).not.toMatch(/role="checkbox"|SelectAll/)
  })

  it('lists policies with the Global Default last, and templates yours first, then Xecurify’s', () => {
    const from = copySources(t.policies, { id: 'new', type: box.type })
    expect(from[from.length - 1].isSystem).toBe(true)
    expect(from[0].isSystem).toBeFalsy()
    const ps = policySources(t.policies, { id: 'new', type: box.type }, t.apps)
    expect(ps.find((s) => s.id === box.id)?.rules).toHaveLength(box.rules.length)
    const ts = templateSources(t.scenarios, [], { zones: t.zones, fingerprints: t.fingerprints })
    expect(ts.length).toBeGreaterThan(0)
    expect(ts.every((s) => s.rules.length > 0 && !!s.scenario)).toBe(true)
  })

  it('keeps the list look reachable behind one constant, not deleted', () => {
    expect(code(pickerSrc)).not.toMatch(/role="checkbox"|SelectAll|bx-tick/)
    expect(boardBuilderSrc).toContain('<RulePickerSlider')
  })

  /* The centred sheet was drawn under the rail from the Policies page before it was portalled. */
  it('draws the centred sheet at the app root, so a page never stacks it under the rail', () => {
    expect(code(sheetSrc)).toContain("return typeof document === 'undefined' ? tree : createPortal(tree, appRoot())")
  })

  /* main.tsx says why: a sheet imported from an eager module lands before kit.css and its button reset wins the tie. */
  it('takes its stylesheets from main.tsx, never from its own modules', () => {
    expect(mainSrc).toContain("import './brand/screens/board/copy-rules.css'")
    expect(dialogSrc).not.toMatch(/import '[^']*\.css'/)
    expect(pickerSrc).not.toMatch(/import '[^']*\.css'/)
  })
})
