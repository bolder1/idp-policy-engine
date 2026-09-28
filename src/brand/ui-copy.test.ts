/// <reference types="vite/client" />
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import decisionWordsSrc from './decision-words.ts?raw'
import decisionBadgeSrc from './decision-badge.tsx?raw'
import savedSignInsSrc from './saved-sign-ins.ts?raw'
import simEnvSrc from './screens/sim-env.ts?raw'
import statusOptionsSrc from './screens/status-options.ts?raw'
import tenantResolverSrc from './screens/tenant-resolver.ts?raw'
import watchingLineSrc from './screens/watching-line.tsx?raw'
import watchingWordsSrc from './screens/watching-words.ts?raw'
import appsPaneSrc from './screens/board/AppsPane.tsx?raw'
import builderDialogsSrc from './screens/builder-dialogs.tsx?raw'
import policyDetailsSrc from './screens/PolicyDetails.tsx?raw'
import boardSrc from './screens/board/Board.tsx?raw'
import boardEmptySrc from './screens/board/BoardEmpty.tsx?raw'
import ifBlockSrc from './screens/board/IfBlock.tsx?raw'
import ruleCardSrc from './screens/board/RuleCard.tsx?raw'
import whenEditorSrc from './screens/board/WhenEditor.tsx?raw'
import overviewSrc from './screens/overview.tsx?raw'
import proseSrc from './screens/predicate-prose.ts?raw'
import trySignInSrc from './screens/board/try-sign-in.ts?raw'
import useTrySignInSrc from './screens/board/use-try-sign-in.ts?raw'
import trySignInRunSrc from './screens/board/try-sign-in-run.ts?raw'
import signInPanelSrc from './screens/board/SignInPanel.tsx?raw'
import routeGateSrc from './screens/board/RouteGate.tsx?raw'
import boardBarSrc from './screens/board/BoardBar.tsx?raw'
import boardBuilderSrc from './screens/board/BoardBuilder.tsx?raw'
import statusChangeSrc from './screens/use-status-change.tsx?raw'
import templateFromPolicySrc from './template-from-policy.ts?raw'
import breakInModelSrc from './screens/break-in-model.ts?raw'
import breakInViewSrc from './screens/break-in-view.tsx?raw'
import whatChangesSrc from './screens/what-changes.ts?raw'
import originWordsSrc from './screens/origin-words.ts?raw'
import guardSrc from './screens/guard.ts?raw'
import guardPageSrc from './screens/guard-page.tsx?raw'
import ruleChangesSrc from './screens/rule-changes.ts?raw'
import monitorSampleSrc from './screens/monitor-sample.ts?raw'
import monitoringModelSrc from './screens/monitoring-model.ts?raw'
import monitoringPageSrc from './screens/monitoring-page.tsx?raw'
import statusControlSrc from './screens/status-control.tsx?raw'
import libraryGuardSrc from './screens/library-guard.ts?raw'
import libraryReviewSrc from './screens/library-review.tsx?raw'
import describePanelSrc from './screens/board/DescribePanel.tsx?raw'
import describeSessionSrc from './screens/board/describe-session.ts?raw'
import describeModelSrc from './create/describe-model.ts?raw'
import describeChecksSrc from './create/describe-checks.ts?raw'
import draftChecksSrc from './draft-checks.ts?raw'
import readAsTextPanelSrc from './screens/board/ReadAsTextPanel.tsx?raw'
import readAsTextSrc from './screens/board/read-as-text.ts?raw'
import ruleFormSrc from './screens/rule-form.tsx?raw'
import flowRailSrc from './screens/flow-rail.tsx?raw'
import builderTestSrc from './screens/builder-test.tsx?raw'
import reviewStepSrc from './screens/review-step.tsx?raw'
import commandBarSrc from './screens/command-bar.tsx?raw'
import gauntletDialogSrc from './screens/gauntlet-dialog.tsx?raw'
import impactArenaDialogSrc from './screens/impact-arena-dialog.tsx?raw'
import whoEditorSrc from './screens/board/WhoEditor.tsx?raw'
import templateCardSrc from './create/TemplateCard.tsx?raw'
import tutorialsSrc from './tour/tutorials.ts?raw'
import tourStopsSrc from './tour/tour-stops.ts?raw'
import tutorialFigureSrc from './tour/TutorialFigure.tsx?raw'
import boardTourSrc from './tour/board-tour.ts?raw'
import boardTourViewSrc from './tour/BoardTour.tsx?raw'
import boardTourArtSrc from './tour/BoardTourArt.tsx?raw'
import { CONDITION_CATALOGUE, scenarios, templates } from './data'
import { TYPED_DECK } from './screens/gauntlet'

/* -----------------------------------------------------------------------------
   The words the testing surfaces may not say.

   Four, from the owner's copy rules: "gauntlet", "blast radius", "rehearse" and
   "try a login". They were this prototype's own names for its ideas, and the
   testing work replaces the ideas; a surface that still said them would be
   teaching the old model under the new one's buttons.

   Only what a person can read is scanned: string literals, template text and
   JSX text. Comments and import paths are not copy — `import … from
   './gauntlet'` is where the Break-in engine still lives, and a comment may
   name the thing it replaced. Identifiers are not copy either, so the `LogIn`
   icon is not "log in". One string is allowed by name: the route value
   'gauntlet', which a caller passes and nobody reads.

   A new testing file joins by living in screens/testing/ (picked up by the
   glob) or by being added to NAMED.
   -------------------------------------------------------------------------- */

const BANNED = ['gauntlet', 'blast radius', 'rehearse', 'try a login']
const ALLOWED = new Set(['gauntlet'])

const TESTING = import.meta.glob<string>(['./screens/testing/**/*.{ts,tsx}', '!./screens/testing/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const NAMED: Record<string, string> = {
  './decision-words.ts': decisionWordsSrc,
  './decision-badge.tsx': decisionBadgeSrc,
  './saved-sign-ins.ts': savedSignInsSrc,
  './screens/sim-env.ts': simEnvSrc,
  /* The status switches and the resolver's standing reasons ("Monitoring:
     would allow with 2FA"), which every testing surface reads out. */
  './screens/status-options.ts': statusOptionsSrc,
  './screens/tenant-resolver.ts': tenantResolverSrc,
  /* A monitor's would-be decision, drawn by Try a sign-in, Policy testing and
     the guard pages alike. */
  './screens/watching-line.tsx': watchingLineSrc,
  './screens/watching-words.ts': watchingWordsSrc,
  /* Try a sign-in on the board: its model, its run, its panel, and the gates
     and evidence it draws on the chain. */
  './screens/board/try-sign-in.ts': trySignInSrc,
  './screens/board/use-try-sign-in.ts': useTrySignInSrc,
  './screens/board/try-sign-in-run.ts': trySignInRunSrc,
  './screens/board/SignInPanel.tsx': signInPanelSrc,
  './screens/board/RouteGate.tsx': routeGateSrc,
  /* Policy testing's page (Version 1); its views live in screens/testing/. */
  /* The Break-in test: its model, its view, and the What changes line its fix
     preview prints (and the guard pages will). */
  './screens/break-in-model.ts': breakInModelSrc,
  './screens/break-in-view.tsx': breakInViewSrc,
  './screens/what-changes.ts': whatChangesSrc,
  /* The places What changes names the people who moved from. */
  './screens/origin-words.ts': originWordsSrc,
  /* The guard pages: their model, their drawer, What you changed rule by rule,
     and the plan line the While monitoring row prints. */
  './screens/guard.ts': guardSrc,
  './screens/guard-page.tsx': guardPageSrc,
  './screens/rule-changes.ts': ruleChangesSrc,
  './screens/monitor-sample.ts': monitorSampleSrc,
  /* The Monitoring page: its table in words, the page, and the status control
     that opens it from the board. */
  './screens/monitoring-model.ts': monitoringModelSrc,
  './screens/monitoring-page.tsx': monitoringPageSrc,
  './screens/status-control.tsx': statusControlSrc,
  /* The library guard: the rows a zone, a device profile or the risk profile
     in use adds to Review changes, and the stop beside a failing one. */
  './screens/library-guard.ts': libraryGuardSrc,
  './screens/library-review.tsx': libraryReviewSrc,
  /* Describe it: the panel, its session, and the reader and composer whose
     reasons and summaries the panel prints. The reader's word tables
     (describe-words.ts) are NOT here: they are what an admin types, not what
     the console says, and they have to hold "login" to read past it. */
  './screens/board/DescribePanel.tsx': describePanelSrc,
  './screens/board/describe-session.ts': describeSessionSrc,
  './create/describe-model.ts': describeModelSrc,
  /* Its checks: the rows under the answers, and the names the guard lists
     them by once the policy keeps them. */
  './create/describe-checks.ts': describeChecksSrc,
  './draft-checks.ts': draftChecksSrc,
  /* Read as text: the panel and drawer, and the line under the sentences.
     The sentences are predicate-prose.ts, scanned below with the rest. */
  './screens/board/ReadAsTextPanel.tsx': readAsTextPanelSrc,
  './screens/board/read-as-text.ts': readAsTextSrc,
}

/** Every piece of text a file could put on screen. */
function uiStrings(src: string, file = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    /* Where a module comes from is not something anybody reads. */
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) return
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text)
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) out.push(node.text)
    else if (ts.isJsxText(node) && node.text.trim()) out.push(node.text.trim())
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const offences = (src: string, file: string) =>
  uiStrings(src, file).filter((s) => !ALLOWED.has(s) && BANNED.some((w) => s.toLowerCase().includes(w)))

/* "login", "logins", "log-in", the spaced forms "log in" and "logged in",
   which the first pass let through ("A user attempts to log in" headed the
   trail's overview after it), and the verb's other forms, "logs in" and
   "logging in", which the second let through: the trail's catch-all row read
   "logs in on one factor", and the board tour "Allow logs them in". */
const LOGIN = /\blog(?:s|ged|ging)?(?:-|\s)?(?:(?:me|you|him|her|them|us)\s)?ins?\b/i

describe('the scanner', () => {
  it('reads strings, template text and JSX text, and nothing else', () => {
    const src = [
      "import { run } from './gauntlet'",
      "import { LogIn } from 'lucide-react'",
      '// the gauntlet this replaces',
      "const a = 'Allow on 1 factor'",
      'const b = `Rule ${n} · rehearse`',
      "const c = () => <p title=\"Try a sign-in\">Blast radius <LogIn /></p>",
      "const d = import('./gauntlet-dialog')",
    ].join('\n')
    expect(uiStrings(src)).toEqual(['Allow on 1 factor', 'Rule ', ' · rehearse', 'Try a sign-in', 'Blast radius'])
    expect(offences(src, 'x.tsx')).toEqual([' · rehearse', 'Blast radius'])
  })

  it('reads login in all its spellings, and not in words that merely contain it', () => {
    for (const s of ['A login', 'Logins fall through', 'log-in page', 'A user attempts to log in', 'Logged in', 'logs in on one factor', 'Logging in', 'a logged-in user', 'Allow logs them in']) {
      expect(LOGIN.test(s), s).toBe(true)
    }
    for (const s of ['Sign in', 'the catalog', 'a dialog in the board', 'log into', 'Blogging', 'catalogs in the console', 'dialogs in a row']) expect(LOGIN.test(s), s).toBe(false)
  })

  it('lets the route value through, and only it', () => {
    expect(offences("go({ name: 'board', open: 'gauntlet' })", 'x.ts')).toEqual([])
    expect(offences("const t = 'Open the gauntlet'", 'x.ts')).toEqual(['Open the gauntlet'])
  })
})

describe('the testing surfaces', () => {
  const files = { ...NAMED, ...TESTING }

  it('finds the files it is meant to scan', () => {
    /* A glob that matched nothing would make the next test vacuous. */
    expect(Object.keys(TESTING)).toEqual(
      expect.arrayContaining(['./screens/testing/sign-in-form.ts', './screens/testing/session.tsx', './screens/testing/SignInFields.tsx', './screens/testing/evidence.ts']),
    )
  })

  it('say none of the banned words', () => {
    for (const [file, src] of Object.entries(files)) {
      expect(`${file}: ${offences(src, file).join(' | ')}`).toBe(`${file}: `)
    }
  })

  /* The board's own entry to it. The bar's pips said "Check" and graded a
     deck; Check's first section was "Try a login", which Try a sign-in retired
     (final spec, A.8). */
  it('reach the board by Try a sign-in', () => {
    expect(offences(boardBarSrc, 'BoardBar.tsx')).toEqual([])
    expect(uiStrings(boardBarSrc, 'BoardBar.tsx')).toContain('Try a sign-in')
  })

  /* And the two sheets the pips opened, which the palette reached until M4:
     the Break-in test counts in Saved sign-ins now, and What changes is a row
     of the checks before saving, so Check and What changes over the stage had
     nothing left to say that is not said where it is acted on. */
  it('leave no Check or What changes sheet on the board, and no palette command to one', () => {
    expect(Object.keys(import.meta.glob('./screens/board/{BoardSheet,CheckTab,ImpactTab}.tsx'))).toEqual([])
    const said = uiStrings(boardBuilderSrc, 'BoardBuilder.tsx')
    expect(said).not.toContain('Open Check')
    expect(said).not.toContain('Open What changes')
  })

  /* The trail kept the old names on its own copies of the two tools — the
     review step's buttons said "Gauntlet" and "Blast radius", and its guides
     taught them. Its sweep says the testing work's name, What changes. Its
     deck is the Attempt deck and never the Break-in test: it deals the chip
     cards and grades them, the Break-in test deals the typed deck and counts,
     and one name on both put two numbers on the same rules. The guided build
     that ended on the real Break-in test is retired for Describe it. */
  it('are named the Attempt deck and What changes on the trail and in its guides as well', () => {
    const TRAIL: Record<string, string> = {
      'review-step.tsx': reviewStepSrc,
      'command-bar.tsx': commandBarSrc,
      'gauntlet-dialog.tsx': gauntletDialogSrc,
      'impact-arena-dialog.tsx': impactArenaDialogSrc,
      'tutorials.ts': tutorialsSrc,
      'tour-stops.ts': tourStopsSrc,
      'TutorialFigure.tsx': tutorialFigureSrc,
    }
    for (const [file, src] of Object.entries(TRAIL)) {
      expect(`${file}: ${offences(src, file).join(' | ')}`).toBe(`${file}: `)
    }
    expect(uiStrings(reviewStepSrc, 'review-step.tsx')).toEqual(expect.arrayContaining(['Attempt deck', 'What changes']))
    const DECK_SAYERS: Record<string, string> = {
      'review-step.tsx': reviewStepSrc,
      'command-bar.tsx': commandBarSrc,
      'gauntlet-dialog.tsx': gauntletDialogSrc,
      'tutorials.ts': tutorialsSrc,
      'tour-stops.ts': tourStopsSrc,
    }
    for (const [file, src] of Object.entries(DECK_SAYERS)) {
      const said = uiStrings(src, file).filter((s) => /break-in/i.test(s))
      expect(`${file}: ${said.join(' | ')}`).toBe(`${file}: `)
    }
  })
})

/* The login → sign-in pass (25 Sep 2026). A sign-in is the product's word for
   what a policy decides; "login" was the prototype's, and it had crept back
   into the prose renderer, which every rule line in the console goes through.
   These files carried it and carry none of it now. */
describe('sign-in, not login', () => {
  const PASSED: Record<string, string> = {
    'Board.tsx': boardSrc,
    /* One rule card, folded and open, and the board without one: the card's
       summary, its unfolded IF and the empty board all name the catch-all, and
       one card saying two words for one thing is how the pair drifts. */
    'RuleCard.tsx': ruleCardSrc,
    'IfBlock.tsx': ifBlockSrc,
    'BoardEmpty.tsx': boardEmptySrc,
    'overview.tsx': overviewSrc,
    'WhenEditor.tsx': whenEditorSrc,
    'predicate-prose.ts': proseSrc,
    'use-status-change.tsx': statusChangeSrc,
    /* The switch confirmations' words, moved out of use-status-change.tsx. */
    'status-options.ts': statusOptionsSrc,
    'template-from-policy.ts': templateFromPolicySrc,
    /* The notes on losing the last application, which say what stops: deciding
       sign-ins, or monitoring (Monitor, 25 Sep 2026). */
    'AppsPane.tsx': appsPaneSrc,
    'builder-dialogs.tsx': builderDialogsSrc,
    'PolicyDetails.tsx': policyDetailsSrc,
    /* The pass finished (M4): the rule form, the trail's flow and its test
       dialog, the rule's who, the template preview, and every guide — the
       tutorials, both tours and their figures. */
    'rule-form.tsx': ruleFormSrc,
    'flow-rail.tsx': flowRailSrc,
    'builder-test.tsx': builderTestSrc,
    'review-step.tsx': reviewStepSrc,
    'command-bar.tsx': commandBarSrc,
    'gauntlet-dialog.tsx': gauntletDialogSrc,
    'impact-arena-dialog.tsx': impactArenaDialogSrc,
    'WhoEditor.tsx': whoEditorSrc,
    'TemplateCard.tsx': templateCardSrc,
    'tutorials.ts': tutorialsSrc,
    'tour-stops.ts': tourStopsSrc,
    'TutorialFigure.tsx': tutorialFigureSrc,
    'board-tour.ts': boardTourSrc,
    /* The board tour's own view and figures: the Then figure's form said
       "Log in" over a result that said "Signed in". */
    'BoardTour.tsx': boardTourViewSrc,
    'BoardTourArt.tsx': boardTourArtSrc,
  }

  it('says sign-in wherever these files put words on screen', () => {
    /* Every testing surface too: they were written after the pass, in its words. */
    for (const [file, src] of Object.entries({ ...PASSED, ...NAMED, ...TESTING })) {
      const said = uiStrings(src, file).filter((s) => LOGIN.test(s))
      expect(`${file}: ${said.join(' | ')}`).toBe(`${file}: `)
    }
  })

  /* data.ts is the tenant as well as the catalogue, so it is read as data:
     the hint under each condition, and every template's description and rule
     lines. Template NAMES are left alone — "Step up on suspicious login" is
     the product's own catalogue entry (docs/v0-policy-flow.md), and product
     parity keeps the console's words. */
  it('says sign-in in the condition hints and the template texts', () => {
    const said = [
      ...CONDITION_CATALOGUE.map((c) => c.hint),
      ...templates.flatMap((t) => [t.description, ...t.rules.map((r) => r.ifText)]),
      ...scenarios.flatMap((s) => [s.description, ...s.rules.map((r) => r.ifText)]),
    ]
    expect(said.length).toBeGreaterThan(20)
    expect(said.filter((s) => LOGIN.test(s))).toEqual([])
  })

  /* The Break-in test prints its cards' names and the rules their fixes add.
     They live in gauntlet.ts, beside the chip deck's older words, so they are
     read from the deck itself rather than from the file. */
  it('names every Break-in card and fix in sign-ins', () => {
    const shown = TYPED_DECK.flatMap((c) => [c.name, ...(c.fix ? [c.fix.name] : [])])
    expect(shown.filter((s) => LOGIN.test(s))).toEqual([])
  })
})
