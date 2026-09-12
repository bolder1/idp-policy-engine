/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import inspector from '../screens/board/Inspector.tsx?raw'
import board from '../screens/board/Board.tsx?raw'
import boardEmpty from '../screens/board/BoardEmpty.tsx?raw'
import boardBar from '../screens/board/BoardBar.tsx?raw'
import boardBuilder from '../screens/board/BoardBuilder.tsx?raw'
import tourSource from './BoardTour.tsx?raw'
import artSource from './BoardTourArt.tsx?raw'
import playerSource from './DemoPlayer.tsx?raw'
import buttonSource from './DemoButton.tsx?raw'
import playerCss from './demo-player.css?inline'
import spotlightSource from './spotlight.ts?raw'
import tourCss from './tour.css?inline'
import { blankPolicy, blankRule, type Policy, type Rule } from '../data'
import {
  BOARD_STOPS,
  BOARD_TOUR_SEEN,
  DEMO_VIDEO,
  conditionPatch,
  thenPatch,
  whoPatch,
  type TaskCtx,
} from './board-tour'
import { TOUR_SEEN } from './tour-stops'

/* A walkthrough breaks silently, and an INTERACTIVE one breaks twice as
   quietly: a step whose anchor was renamed away just stops lighting anything,
   and a task whose check no longer matches its own automatic answer leaves the
   reader pressing "Do it for me" and watching nothing happen. Neither files a
   bug. These assertions are the whole of what stands between that and a demo
   that quietly points at nothing and cannot complete itself. */

/* The markup the board's tour runs over. Concatenated deliberately here, where
   the trail's test keeps its shells apart: there is exactly ONE board, and
   these four files are four regions of it rather than four alternatives. */
const BOARD_MARKUP = inspector + board + boardEmpty + boardBar

/* An anchor reaches the DOM three ways on this surface, and all three are
   deliberate rather than untidy:

     data-tour="insp-who"                  — written straight onto an element
     tour="insp-who"                       — handed to `Section`, which spreads it
     data-tour={last ? 'add-rule' : ...}   — conditional, so only ONE of a
                                             repeated element is a target

   Grepping only the first form is what made the first version of this test fail
   against markup that was perfectly correct. What the test is for is catching an
   anchor RENAMED out from under a step, and the name in quotes catches that in
   all three shapes. */
function anchored(markup: string, name: string): boolean {
  return markup.includes(`data-tour="${name}"`) || markup.includes(`tour="${name}"`) || markup.includes(`'${name}'`)
}

/** The five steps, keyed, so a test can name one without indexing. */
const byId = Object.fromEntries(BOARD_STOPS.map((s) => [s.id, s])) as Record<string, (typeof BOARD_STOPS)[number]>

function ctx(over: Partial<TaskCtx> = {}): TaskCtx {
  const draft: Policy = blankPolicy('Demo', ['workday'])
  return { draft, rule: null, density: 'outline', review: false, decisionAtStart: null, ...over }
}

describe('the board walkthrough', () => {
  it('lights something that exists, for every step that names an anchor', () => {
    const missing = BOARD_STOPS.filter((s) => s.anchor).filter((s) => !anchored(BOARD_MARKUP, s.anchor!))
    expect(missing.map((s) => `${s.id} → ${s.anchor}`)).toEqual([])
  })

  it('spreads the anchor it is handed, so a `tour` prop is not decoration', () => {
    /* Three of the five anchors reach the DOM through `Section`. If that prop
       ever stops being spread the test above still passes — the literal is
       still in the file — and the spotlight lights nothing. This is the half a
       string search cannot see. */
    expect(inspector).toContain('data-tour={tour}')
  })

  it('lights something that exists for the alternate anchors too', () => {
    /* Step 1 has two, because the board has two shapes — a chooser while the
       policy is empty, a chain once it is not — and a demo that knows only one
       of them points at nothing on the very screen a first-time reader is most
       likely to be looking at. */
    const alts = BOARD_STOPS.filter((s) => s.anchorAlt)
    expect(alts.length).toBeGreaterThan(0)
    const missing = alts.filter((s) => !anchored(BOARD_MARKUP, s.anchorAlt!))
    expect(missing.map((s) => `${s.id} → ${s.anchorAlt}`)).toEqual([])
  })

  it('opens on step 1 rather than on a page about the steps', () => {
    /* A contents card stood in front of this — six tiles, then a button that
       started the walkthrough. It was the same five steps described in advance,
       which is one set of facts told twice, and the telling the reader cannot
       act on is the one that went. Pinned because "add a summary screen" is a
       permanently available idea. */
    expect(tourSource).not.toMatch(/function Nutshell\b/)
    expect(tourSource).not.toContain('btb__nut')
    // And no phase in front of the steps for such a card to live in.
    expect(tourSource).not.toMatch(/useState<'nutshell'/)
    expect(tourSource).toContain('const [i, setI] = useState(0)')
  })

  it('keeps every step to one sentence', () => {
    for (const s of BOARD_STOPS) {
      // Em-dashes and commas are fine; a second full stop means it is two steps.
      const sentences = s.body.trim().split(/\.\s+/).filter(Boolean)
      expect(`${s.id}: ${sentences.length}`).toBe(`${s.id}: 1`)
      expect(`${s.id}: ${s.heading.length <= 46}`).toBe(`${s.id}: true`)
      // The ask is an instruction, not an explanation.
      expect(`${s.id}: ${s.task.ask.length <= 52}`).toBe(`${s.id}: true`)
    }
  })

  /* --- The one bug this shape can have ---------------------------------------

     "Do it for me" writes something, and the step's own `done` reads something.
     If those two drift apart the button appears to do nothing: the edit lands,
     the tick never arrives, and the reader concludes the product is broken.
     Every automatic answer is checked here against the check it is answering.
     -------------------------------------------------------------------------- */

  it('starts every step unsatisfied on a fresh rule', () => {
    const rule = blankRule()
    // Not step 1 — its task is that a rule exists at all, and one does here.
    expect(byId.who.task.done(ctx({ rule }))).toBe(false)
    expect(byId.when.task.done(ctx({ rule }))).toBe(false)
    expect(byId.then.task.done(ctx({ rule, decisionAtStart: rule.decision }))).toBe(false)
    expect(byId.tools.task.done(ctx({ rule }))).toBe(false)
    expect(byId.review.task.done(ctx({ rule }))).toBe(false)
  })

  it('can satisfy its own Who step', () => {
    const rule = blankRule()
    const after: Rule = { ...rule, ...whoPatch(rule) }
    expect(byId.who.task.done(ctx({ rule: after }))).toBe(true)
  })

  it('can satisfy its own condition step', () => {
    const rule = blankRule()
    const after: Rule = { ...rule, ...conditionPatch(rule) }
    expect(byId.when.task.done(ctx({ rule: after }))).toBe(true)
  })

  it('can satisfy its own condition step on a rule that already has a Who', () => {
    /* The real order. `conditionPatch` appends into the run `setWho` started,
       and appending into a branch is a different path from starting one — so a
       demo taken in order exercises a path a demo taken from a blank rule never
       reaches. */
    const rule = blankRule()
    const withWho: Rule = { ...rule, ...whoPatch(rule) }
    const after: Rule = { ...withWho, ...conditionPatch(withWho) }
    expect(byId.when.task.done(ctx({ rule: after }))).toBe(true)
    // And the Who survived it, rather than being replaced by the condition.
    expect(byId.who.task.done(ctx({ rule: after }))).toBe(true)
  })

  it('can satisfy its own Then step, from every starting outcome', () => {
    for (const start of ['1fa', '2fa', 'deny'] as const) {
      const rule: Rule = { ...blankRule(), decision: start }
      const after: Rule = { ...rule, ...thenPatch(rule) }
      /* The whole point of the step: the outcome CHANGED. A patch that wrote
         back the value already there would leave the card saying "waiting for
         you" straight after the button meant to answer it. */
      expect(`${start}: ${after.decision !== start}`).toBe(`${start}: true`)
      expect(byId.then.task.done(ctx({ rule: after, decisionAtStart: start }))).toBe(true)
    }
  })

  it('reads completion from the draft, so an undo un-ticks a step', () => {
    const rule = blankRule()
    const after: Rule = { ...rule, ...whoPatch(rule) }
    expect(byId.who.task.done(ctx({ rule: after }))).toBe(true)
    // The same check against the rule as it was before — which is what an undo
    // puts back. Nothing is remembered, so nothing stays ticked.
    expect(byId.who.task.done(ctx({ rule }))).toBe(false)
  })

  it('does not tick the Then step without a baseline to compare against', () => {
    // `decisionAtStart` is null until the step is arrived at. Before that there
    // is no such thing as "changed", and claiming otherwise would tick a step
    // the reader has not reached.
    const rule: Rule = { ...blankRule(), decision: 'deny' }
    expect(byId.then.task.done(ctx({ rule, decisionAtStart: null }))).toBe(false)
  })

  /* --- Six steps, and every one of them on every edition -----------------------

     There used to be a fork here: the fifth step pointed at the Check and
     What-changes readings, which the shipping `lite` edition withholds, so it
     needed a second version and the tour needed to know which edition it was
     in. The two steps that replaced it — the dock, and the review — are true
     everywhere, which is what let the fork go.
     -------------------------------------------------------------------------- */

  it('walks six steps, and names each of them once', () => {
    expect(BOARD_STOPS.length).toBe(6)
    expect(new Set(BOARD_STOPS.map((s) => s.id)).size).toBe(6)
    expect(BOARD_STOPS.map((s) => s.id)).toEqual(['rule', 'who', 'when', 'then', 'tools', 'review'])
  })

  it('needs no edition to decide what to show', () => {
    // The tour must not have to know what the tenant bought: two sets of copy
    // is two sets to keep true, and one of them rots.
    expect(tourSource).not.toContain('hasChecks')
    expect(tourSource).not.toContain('stopsFor')
    expect(boardBuilder).not.toContain('hasChecks')
  })

  it('points the last two steps at controls every edition has', () => {
    expect(byId.tools.anchor).toBe('board-dock')
    expect(byId.review.anchor).toBe('review')
    expect(anchored(BOARD_MARKUP, 'board-dock')).toBe(true)
    expect(anchored(BOARD_MARKUP, 'review')).toBe(true)
    /* Neither names the two panels lite withholds, and the review step names
       neither "publish" nor "save" — the button says one word in one edition
       and the other word in the other. */
    const copy = byId.tools.body + byId.tools.task.ask + byId.review.body + byId.review.task.ask
    expect(/Check panel|What changes|gauntlet/i.test(copy)).toBe(false)
  })

  it('can satisfy the last two steps', () => {
    expect(byId.tools.task.done(ctx({ density: 'detailed' }))).toBe(true)
    expect(byId.tools.task.done(ctx({ density: 'outline' }))).toBe(false)
    expect(byId.review.task.done(ctx({ review: true }))).toBe(true)
    expect(byId.review.task.done(ctx({ review: false }))).toBe(false)
    expect(tourSource).toContain("if (id === 'tools') return api.setDensity('detailed')")
    expect(tourSource).toContain("if (id === 'review') return api.openReview()")
  })

  it('opens the review and stops there', () => {
    /* The demo raises the dialog; it never confirms it. This is somebody's real
       policy, and publishing on their behalf is the one action on this screen
       they cannot take back from here. */
    expect(tourSource).not.toMatch(/confirmReview|publish\(\)/)
    expect(boardBuilder).toContain('openReview: () => setReview(true)')
  })

  /* --- Positioning, and the trap it fell into --------------------------------- */

  it('positions the card from numbers, never from a CSS transform', () => {
    /* Both tour cards are `motion.div`s, and motion owns `transform` on those
       absolutely — it writes `transform: none` at rest. So the obvious way to
       centre an unanchored card, `top: 50%; left: 50%; translate(-50%, -50%)`,
       is silently discarded and the card's top-left CORNER lands at the middle
       of the screen with half of it off the edge.

       This shipped. It is pinned here rather than trusted because the CSS looks
       correct in isolation, the class is still applied, and nothing throws —
       the only symptom is a card in the wrong place, on the one code path
       (no anchor, or an anchor that is off-screen) that is easiest to miss. */
    expect(tourSource).toContain('style={{ top: pos.top, left: pos.left }}')
    // `place` returns real coordinates for the unanchored case.
    expect(spotlightSource).toMatch(/if \(!rect\) \{[\s\S]*?\(vh - box\.h\) \/ 2/)
    // And the stylesheet no longer tries to do it a second way.
    expect(tourCss).not.toMatch(/\.btr__card\.is-centred[^}]*translate\(-50%/)
  })

  it('always has a rule to point at once it is past step one', () => {
    /* Steps two to four anchor to the inspector, which is unmounted while
       nothing is selected. Opening the walkthrough on a policy that already has
       rules, without clicking a card first, otherwise meant three consecutive
       steps pointing at nothing. */
    expect(tourSource).toContain('if (i > 0 && host.draft.rules.length > 0) setRuleId(host.draft.rules[0].id)')
  })

  /* --- The soft gate, pinned ------------------------------------------------- */

  it('never blocks Next on the task being done', () => {
    /* The trade this whole design rests on: the card reports the task's state,
       it does not hold the door. Somebody whose edition withholds the control a
       step names, or whose rule already satisfies it in a way the check did not
       anticipate, must still be able to reach step 5. */
    expect(tourSource).not.toMatch(/disabled=\{!done\}/)
    expect(tourSource).not.toMatch(/disabled=\{!\s*done/)
    // Back is the one control that IS disabled, and only at the start.
    expect(tourSource).toContain('disabled={at === 0}')
  })

  it('offers to do every step itself', () => {
    for (const s of BOARD_STOPS) {
      expect(`${s.id}: ${s.task.doLabel.length > 0}`).toBe(`${s.id}: true`)
      // A label that says what it will do, not that it will do something.
      expect(`${s.id}: ${/^(Add|Pick|Make|Open|Set|Choose|Show)/.test(s.task.doLabel)}`).toBe(`${s.id}: true`)
    }
    expect(tourSource).toContain('btb__doit')
  })

  it('says what the reader caused rather than congratulating them', () => {
    for (const s of BOARD_STOPS) {
      expect(`${s.id}: ${/nice|great|well done|congrat|awesome|perfect/i.test(s.task.didIt)}`).toBe(`${s.id}: false`)
    }
  })

  /* --- The figures ------------------------------------------------------------ */

  it('draws a hero for every step', () => {
    for (const s of BOARD_STOPS) expect(artSource).toContain(`${s.id}: `)
  })

  it('draws all of it from the product tokens', () => {
    /* A tour with its own palette is a tour about a different product. The two
       `#fff`/`#000` in the spotlight mask are not colour — they are the mask's
       in and out — and they live in BoardTour.tsx, not here. */
    expect(artSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(artSource).not.toMatch(/\brgba?\(/)
  })

  it('animates only what the compositor can carry', () => {
    /* These figures loop forever on a card sitting over a board that is itself
       mid-spring. Animating a geometry attribute — width, height — puts every
       frame through layout, and the first symptom is the BOARD stuttering
       rather than the figure, which is a hard fault to trace back to a drawing.
       Transforms and opacity are free; `pathLength` and `strokeDashoffset` are
       the two cheap exceptions, and a dial needs one of them to be a dial. */
    expect(artSource).not.toMatch(/animate=\{\{[^}]*\bwidth:/)
    expect(artSource).not.toMatch(/animate=\{\{[^}]*\bheight:/)
  })

  /* --- The recording ---------------------------------------------------------- */

  it('offers the demo as a mark and a duration, not as a sentence', () => {
    /* It read "Watch the 2-minute demo". Every word of that was already carried
       by one of the two things beside it — the play mark means watch, the
       timestamp means how long. */
    expect(DEMO_VIDEO.duration).toMatch(/^\d+:\d{2}$/)
    /* The visible label is a play mark, the word Demo, and the timestamp, and
       nothing else. Asserted on the JSX rather than by grepping the file for the
       old wording, because the old wording is quoted in the comment explaining
       why it went — and a test that reads its own documentation as a regression
       is a test that can never be satisfied. */
    expect(buttonSource).toMatch(/<Play size=\{13\}[^>]*\/>\s*\n\s*Demo/)
    expect(buttonSource).toContain('{DEMO_VIDEO.duration}')
    // The sentence survives where it costs nothing and helps most.
    expect(buttonSource).toMatch(/aria-label=\{`Watch the product demo/)
  })

  it('reaches the recording from the board itself, not only from the walkthrough', () => {
    // Watching and doing are two answers to one question. Burying one a click
    // behind the other makes the product choose for the reader.
    expect(boardBar).toContain('DemoButton')
    expect(boardBuilder).toContain('DemoPlayer')
    expect(tourSource).toContain('DemoButton')
  })

  it('keeps the trigger out of the lazy chunk it triggers', () => {
    /* The player is lazy so a reader who never presses play never fetches it.
       The button is on the bar on every visit — so if the two shared a file,
       importing the button would import the player and the split would be
       undone. Rollup says so out loud (INEFFECTIVE_DYNAMIC_IMPORT) and the
       build does not fail on it, which is exactly why this is pinned. */
    expect(boardBar).toContain("from '../../tour/DemoButton'")
    expect(tourSource).toContain("from './DemoButton'")
    // The import, not the word — the comment in that file explains the split
    // and names the player while doing it.
    expect(buttonSource).not.toMatch(/from '\.\/DemoPlayer'/)
  })

  it('survives the recording being absent, rather than opening an empty player', () => {
    expect(DEMO_VIDEO).toHaveProperty('src')
    expect(buttonSource).toContain('if (!DEMO_VIDEO.src) return null')
    expect(playerSource).toContain('if (!DEMO_VIDEO.src) return null')
    // And a src that is set but unreachable falls back to an explanation.
    expect(playerSource).toContain('onError')
    expect(playerSource).toContain('dpl__fail')
  })

  it('lights the frame rather than sitting it on a flat black', () => {
    /* The ambient copy is the difference between a video in a box and a video in
       a room. It is also the thing most likely to be deleted by somebody tidying
       away "a duplicate video element". */
    expect(playerSource).toContain('dpl__ambient')
    expect(playerCss).toMatch(/\.dpl__ambient[^}]*blur\(/)
    // Muted in markup AND pinned in code: a second audio source half a second
    // out of sync is the failure this prevents.
    expect(playerSource).toContain('a.muted = true')
    expect(playerSource).toContain('a.volume = 0')
  })

  it('stops playing when it closes', () => {
    // The element outlives its own close by the length of the exit animation,
    // and a video still playing through that is audible after the thing playing
    // it has visibly gone.
    expect(playerSource).toMatch(/if \(open\) return[\s\S]{0,40}main\.current\?\.pause\(\)/)
  })

  it('takes the keys while it is up', () => {
    // The walkthrough underneath also listens for Escape and the arrows. The
    // player binds in the capture phase so it answers first, and the tour has a
    // second guard for the same reason.
    expect(playerSource).toContain("window.addEventListener('keydown', onKey, true)")
    expect(tourSource).toContain("document.querySelector('.dpl')")
  })

  /* --- Reachability, and the a11y contract ----------------------------------- */

  it('is reachable again after it has been taken, from the bar', () => {
    // A control that only matters on somebody's second day is exactly the kind
    // that gets tidied away by somebody working on their hundredth.
    expect(boardBar).toContain('bbtop__learn')
    expect(boardBar).toContain('onLearn')
    expect(boardBuilder).toContain('onLearn={() => setTour(true)}')
  })

  it('keeps its own seen-key, because it teaches its own surface', () => {
    // Somebody who took the trail's tour has not been shown this one.
    expect(BOARD_TOUR_SEEN).not.toBe(TOUR_SEEN)
    expect(boardBuilder).toContain('boardTourSeen')
  })

  it('does not interrupt somebody who arrived with a question', () => {
    // Opening the board straight into a sheet is a person who already knows
    // what they came for.
    expect(boardBuilder).toContain('if (openSheet || boardTourSeen()) return')
  })

  it('stays non-modal, and carries what a non-modal dialog owes', () => {
    /* Same trade the trail's tour makes, and it matters more here: the reader is
       being ASKED to click the lit control, so a card that held focus would make
       the task it sets impossible. */
    expect(tourSource).toContain('aria-modal="false"')
    expect(tourSource).toMatch(/aria-live="polite"/)
    expect(tourSource).toContain('aria-describedby')
    expect(tourSource).toMatch(/window\.addEventListener\('keydown'/)
  })

  it('makes the player a real modal, because watching is not using', () => {
    // The opposite decision from the card above, and deliberately so.
    expect(playerSource).toContain('aria-modal="true"')
  })

  it('drives the board only through doors the board already has', () => {
    /* Every verb on the host is something a control on the board does. A demo
       with a private route into the draft is a second writer to keep in step
       with the first. */
    for (const verb of ['addRule', 'patchRuleById', 'select', 'setDensity', 'openReview']) {
      expect(tourSource).toContain(verb)
      expect(boardBuilder).toContain(verb)
    }
  })
})
