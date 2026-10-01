/* -----------------------------------------------------------------------------
   The product takes — the script, as the recorder performs it. Lite edition.

   Seventh cut (storyboard/BEATS-v7.md). One browser session, eight takes, in
   capture order: board → create → rule1 → rule2 → order → save → showcase →
   parts. The board tour reads a seeded policy and edits nothing; the Workday
   policy created in `create` gets three rules, has them reordered in `order`
   and is saved in `save`. The showcase opens on that saved board: its first
   frame is the picture the bento cards dock onto, so it also carries the one
   `dock` event the bento slide reads. `parts` comes after it and is never
   placed in the film — it is unspoken source footage the bento's stage and
   filmstrip crop from, one bracketed segment per part of the builder. Film
   order is film-v2.mjs's business and is not this order.

   Every spoken line is an id from lines.mjs and paces its beat (`say` starts
   the voice, `settle` waits for it to end). Selectors were read from the live
   markup by the inventory pass (storyboard/INVENTORY-2026-09-14.md) and proven
   by the sixth cut's takes; the dialog, popover, condition-group, Then,
   methods and remember-device flows below are that cut's mechanics, and the
   traps it found are noted where they bite.

   Written for the CURRENT build: a locked vertical board with no Fit, a
   Collapse/Expand density pill, an outcome-first Then panel, Who's "Add
   people", a pending condition group, and a board walkthrough that capture.mjs
   suppresses through its storage seed.

   Explainer insets (`rec.explain`) play beside the product on the one line
   that explains a concept; every spotlight under an inset carries `cam: false`
   so the camera stays at rest while the window is shelved. The card scene is
   gone, and so are the mascot's calls.
   -------------------------------------------------------------------------- */

export const POLICY = 'Workday — Finance adaptive access'
export const RULE1 = 'All sign-ins — second factor'
export const RULE2 = 'Finance — off the office network'
export const RULE3 = 'Known risk network — block'
/* The board tour's policy is a seeded fixture (src/brand/data.ts,
   `sc8-trading-posture`): five rules on a severity ladder, read top to bottom. */
export const TOUR = 'Trading Platform — full posture ladder'
const TOUR_RULES = [
  'Tampered device — nothing else matters',
  'Handset with no passcode',
  'Compliant, on the floor, in market hours',
  'Compliant, but off the floor or out of hours',
  'Client behind the floor — let in',
]

const gone = (rec, loc, label) => rec.until(async () => (await loc.count()) === 0, { seconds: 5, label })
/* The opposite of `gone`: step for `seconds` and fail the moment the thing shows. */
const never = async (rec, loc, seconds, label) => {
  for (let i = 0, n = Math.round(seconds * rec.fps); i < n; i++) {
    if ((await loc.count()) > 0) throw new Error(`${label}: it appeared`)
    await rec.step(1)
  }
}
const inspector = (p) => p.getByRole('complementary', { name: 'Inspector' })
const card = (p) => p.locator('.bb__card:not(.is-terminal)').first()
/* A rule card by its title. The card is a group labelled by its title, so this
   resolves only once the rule carries that name. */
const ruleCard = (p, name) => p.getByRole('group', { name, exact: true })
const titles = async (p) => (await p.locator('.bb__card:not(.is-terminal) .bb__titlebtn').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const journey = (c) => c.locator('[aria-label="The sign-in journey this produces"]')
/* A rule as the board holds it, found by name among the props React rendered —
   the same fiber walk the recorder's callStore uses. Needed for rule one: a rule
   with no who and no conditions draws neither its then chip nor its journey on
   the card (IfBlock prints "Nothing set yet" until either part is answered), so
   the only place its outcome can be read without opening a picker is the data. */
const ruleData = (p, name) =>
  p.evaluate((want) => {
    const root = document.getElementById('root')
    const key = root && Object.keys(root).find((k) => k.startsWith('__reactContainer$'))
    if (!key) return null
    const host = root[key]
    const stack = [host && host.stateNode && host.stateNode.current ? host.stateNode.current : host]
    for (let seen = 0; stack.length && seen < 500000; seen++) {
      const f = stack.pop()
      if (!f) continue
      const r = f.memoizedProps && f.memoizedProps.rule
      if (r && typeof r === 'object' && r.name === want && 'decision' in r) {
        return { decision: r.decision, secondFactor: r.secondFactor, methods: r.secondFactorMethods ?? [], rememberMfa: r.rememberMfa, rememberDays: r.rememberDays }
      }
      if (f.sibling) stack.push(f.sibling)
      if (f.child) stack.push(f.child)
    }
    return null
  }, name)
const thenChip = (c, word) => c.locator('.bb__ifaction .bb__ifchip', { hasText: word })
/* innerText reads a folded card too: its body stays mounted at zero height
   (RuleCard's `.bb__fold`, overflow hidden, never visibility hidden), so its
   rows still render text under either density. */
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()).replace(/\s+/g, ' ').trim() : '')
/* Seconds from NOW to the onset of a word in the line started at frame `f0`.
   `rec.wordTime` counts from the line's start, and the actions after `say`
   have already spent some of that — the frame counter says how much. In a dry
   run no frame is kept, so the count stays at 0 and the hold is capped anyway. */
const toWord = (rec, f0, id, re) => Math.max(0, rec.wordTime(id, re) - (rec.frame() - f0) / rec.fps)
/* The condition popover has no name and there is only ever one. Operator and
   attribute menus hold nothing focusable, so Escape does not close them — and a
   stray Escape closes the whole panel. The If heading is the safe place to click. */
const closePop = async (rec, p, insp) => {
  if ((await p.locator('.cp__pop').count()) > 0) {
    await rec.click(insp.locator('#bb-sec-if'), { hint: false, after: 0.2 })
    await gone(rec, p.locator('.cp__pop'), 'condition popover closed')
  }
}
/* The board's six-step walkthrough opens by itself 600 ms after the board
   mounts unless its flag is seeded (capture.mjs does). It must never be in a
   filmed frame, so every take that lands on the board checks. */
const noTour = (rec, p) => gone(rec, p.getByRole('dialog', { name: /^Board walkthrough/ }), 'no board walkthrough in frame')
/* A click on bare stage, left of the column. The board reads it as "nothing
   selected" (Board's onBackgroundClick), and with no subject the panel goes
   too. Closing the panel alone is not enough: the selection outlives it, and
   while a card is selected every other card on the chain is dimmed to 0.72
   (board.css, `.bb__chain:has(.bb__card.is-selected)`) — the dry run's stills
   showed r2.9's and pr.4's spotlights, and the showcase's dock picture, landing
   on faded cards. */
const clickAway = async (rec, p, opts = {}) => {
  await rec.click(p.locator('.bb__stage'), { ox: 0.12, oy: 0.5, hint: false, sfx: false, ...opts })
  await gone(rec, p.locator('.bb__card.is-selected'), 'no card selected')
  await gone(rec, inspector(p), 'panel closed')
}
const density = (p, name) => p.getByRole('radiogroup', { name: 'How much of each rule to show' }).getByRole('radio', { name, exact: true })
/* A card's place in the chain is written on its grip: "Reorder rule N — drag,
   or use the arrow keys". Waiting on it is how a move is known to have landed. */
const atSlot = (rec, loc, n) =>
  rec.until(async () => (await loc.getByRole('button', { name: new RegExp(`^Reorder rule ${n} `) }).count()) > 0, { seconds: 3, label: `${String(loc)} at rule ${n}` })
/* Chrome eases a wheel scroll over a few real-time frames after the last tick,
   outside the virtual clock — so a control measured straight after a scroll can
   still be on the move when the click lands (a dry run, with no screenshot
   between steps, gets there first: the Deny tile was hit 34 px below itself).
   Scroll the panel, then wait until its scrollTop has stood still for 100 ms. */
const scroll = async (rec, body, target, opts = {}) => {
  const offset = opts.offset ?? 24
  const top = () => body.first().evaluate((el) => el.scrollTop)
  /* And check it got there. A dry run with --snaps once saw the wheel land on
     nothing (a screenshot in flight): scrollTop stood still, "stopped
     scrolling" passed at once, and the next click met a control below the
     fold. So the landing is measured, and a short one is wheeled again — unless
     the panel is at the end it was wheeled towards (the Remember switch, asked
     for 180 px under the top, sits past the bottom clamp), or did not move at
     all on a retry. */
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await top()
    await rec.scrollTo(body, target, opts)
    let quiet = 0
    await rec.until(async () => {
      const a = await top()
      await new Promise((r) => setTimeout(r, 50)) // real time: the easing runs outside the virtual clock
      quiet = a === (await top()) ? quiet + 1 : 0
      return quiet >= 2
    }, { seconds: 3, label: 'the panel stopped scrolling' })
    const c = await rec.rectOf(body)
    const t = await rec.rectOf(target, { raw: true })
    const dy = t.y - (c.y + offset)
    if (Math.abs(dy) < 12) return
    const end = await body.first().evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }))
    if ((dy > 0 && end.top >= end.max - 1) || (dy < 0 && end.top <= 0)) return
    if (attempt > 0 && end.top === before) return
    console.warn(`scroll: ${String(target)} landed ${Math.round(dy)} px from where it was wheeled to; wheeling again`)
  }
}
/* The board's own scroll. The wheel moves `.bb__world` by exactly its delta —
   canvas-view.ts applies each event synchronously and clamps y so the chain
   cannot leave the stage — so a card's uncut box says how far to wheel, and
   the world's inline transform (translate3d(x, y, 0) scale(z)) says where it
   landed. The world keeps 120 px under its last card, so at the bottom clamp
   the default still clears the dock that floats over the stage's foot. */
const worldY = (p) => p.locator('.bb__world').first().evaluate((el) => Number((el.style.transform.match(/translate3d\([^,]+,\s*([-\d.]+)px/) || [])[1] || 0))
/* The world's y once it has stood still for ~120 ms of REAL time. Wheel events
   reach the page rAF-aligned and coalesced, outside the virtual clock, so a
   reading taken straight after the last tick can be a few events short — the
   first dry pass wheeled back from such a reading and stopped 79 px shy. */
const settledY = async (rec, p) => {
  let last = await worldY(p)
  let quiet = 0
  await rec.until(async () => {
    await new Promise((r) => setTimeout(r, 60))
    const y = await worldY(p)
    quiet = y === last ? quiet + 1 : 0
    last = y
    return quiet >= 2
  }, { seconds: 3, label: 'the chain stopped moving' })
  return last
}
/* Wheel the chain to world y `target` — the board clamps it to the chain's
   ends, and a landing that is short for any other reason is nudged once, with
   a warning so a filmed take can be checked. Returns where it landed.

   The delta is asked for in DEVICE pixels: Chromium hands a dispatched wheel
   delta to the page divided by the device scale factor (measured: 260 asked,
   130 seen at dsf 2, 260 at dsf 1), so at the film's dsf 2 every wheel moved
   the chain exactly half way. The recorder's wheel() does not correct for it. */
const chainWheelTo = async (rec, p, target, { seconds = 0.9 } = {}) => {
  const s = await rec.rectOf(p.locator('.bb__stage'))
  // over bare stage, left of the column, so nothing under the cursor lights up
  const at = { x: s.x + s.width * 0.15, y: s.y + s.height * 0.45 }
  const dpr = await p.evaluate(() => window.devicePixelRatio || 1)
  let y = await settledY(rec, p)
  for (let round = 0; round < 2 && Math.abs(target - y) > 2; round++) {
    const from = y
    await rec.wheel((from - target) * dpr, { at, seconds: round ? 0.3 : seconds })
    y = await settledY(rec, p)
    if (round) console.warn(`chainWheelTo: nudged ${Math.round(from - y)} of ${Math.round(from - target)} px — landed ${Math.round(y)}, wanted ${Math.round(target)}`)
    if (Math.abs(y - from) < 1) break // the clamp: the chain is at its end
  }
  return y
}
/* Wheel the chain until `target` sits wholly above the dock (or the chain's end
   is reached); returns the world y to wheel back to. Nothing moves when it
   already does. */
const chainTo = async (rec, p, target, { margin = 16 } = {}) => {
  const y0 = await settledY(rec, p)
  const t = await rec.rectOf(target, { raw: true })
  const dock = await rec.rectOf(p.locator('.bb__dock'))
  const need = t.y + t.height - (dock.y - margin)
  if (need > 4) await chainWheelTo(rec, p, y0 - need)
  return y0
}

/* --- the dock's measuring tape ------------------------------------------------------ */
const q = (v) => Math.round(v * 10) / 10
/* The bounding box of several app-px rects — a part of the card drawn as more
   than one row (who, if, then) docks as one box. Empty rects are ignored; a
   union of nothing is a selector that went wrong, so it fails loudly. */
const union = (rects, label) => {
  const rs = rects.filter((r) => r && r.width >= 1 && r.height >= 1)
  if (!rs.length) throw new Error(`dock target "${label}" measured nothing`)
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  const right = Math.max(...rs.map((r) => r.x + r.width))
  const bottom = Math.max(...rs.map((r) => r.y + r.height))
  return { x: q(x), y: q(y), width: q(right - x), height: q(bottom - y) }
}
const clipTo = (r, k, label) => {
  const x = Math.max(r.x, k.x)
  const y = Math.max(r.y, k.y)
  const right = Math.min(r.x + r.width, k.x + k.width)
  const bottom = Math.min(r.y + r.height, k.y + k.height)
  if (right - x < 1 || bottom - y < 1) throw new Error(`dock target "${label}" is clipped to nothing`)
  return { x: q(x), y: q(y), width: q(right - x), height: q(bottom - y) }
}

/* --- the rule-building mechanics, shared by rule1 and rule2 --------------------------- */
const renameRule = async (rec, insp, name, cps) => {
  const field = insp.getByRole('textbox', { name: 'Rule name' })
  /* The panel keeps its scroll when it moves to a new rule, so a rule added
     after the previous one's Then was edited opens with its name above the
     fold. Wheel back up only then; on a panel already at the top nothing moves. */
  const body = insp.locator('.bb__inspbody')
  const b = await rec.rectOf(body)
  const f = await rec.rectOf(field, { raw: true })
  if (f.y < b.y || f.y + f.height > b.y + b.height) await scroll(rec, body, field, { offset: 16 })
  await rec.click(field)
  await rec.press('Control+a', { show: false })
  await rec.type(name, { cps })
  // drop focus on the bar's label so nothing typed later can reach the field
  await rec.click(insp.locator('.bb__inspbar > b'), { hint: false })
}
/* One condition from the attribute list: `add` opens the list, the attribute
   is picked, its operator menu opens by itself beside the panel, and the value
   is found by search. The popup moves on to the values by itself; if it ever
   does not, they are opened from the row (inside `scope`). */
const condition = async (rec, p, insp, { add, list, attr, op, search, value, scope, cps = 12, look = null }) => {
  const pop = p.locator('.cp__pop')
  /* `look` measures what is on screen once each popup has come to rest — the
     parts take grows its crop with it, because the list and the menus open
     outside the section the condition lands in. Nobody else passes one. */
  const seen = async () => {
    if (look) await look()
  }
  await rec.click(add)
  await rec.visible(list)
  await rec.hold(0.4)
  await seen()
  await rec.click(list.getByRole('button', { name: attr, exact: true }))
  await rec.visible(pop)
  await rec.hold(0.4)
  await seen()
  await rec.click(pop.getByRole('option', { name: op, exact: true }))
  await rec.hold(0.4)
  const box = p.getByRole('textbox', { name: `Search ${attr}` })
  if ((await box.count()) === 0) {
    await rec.click(scope.getByRole('button', { name: new RegExp(`^Change what ${attr} is compared against`) }))
    await rec.visible(pop)
  }
  // the popup's search box is never auto-focused
  await rec.click(box)
  await rec.type(search, { cps })
  await rec.hold(0.4)
  await seen()
  await rec.click(pop.getByRole('checkbox', { name: new RegExp(`^${value}`) }))
  await rec.hold(0.6)
  await seen()
  await closePop(rec, p, insp)
  await seen()
}
/* Then: Allow, a second factor, proved by two specific methods.

   Outcome first: two tiles whose accessible names carry their hint sentence
   ("Allow Sign-in proceeds through the factors below."), so they are matched
   by their first word. A blank rule is already seeded with a second factor,
   so Allow keeps the Second factor block open; only a rule stripped to one
   factor offers "Add second factor". `always` clicks Allow even when it is
   already chosen (rule two's beat shows the choice); otherwise only if not. */
const allowSecondFactor = async (rec, p, insp, { always = false, look = null } = {}) => {
  const body = insp.locator('.bb__inspbody')
  const thenSec = insp.getByRole('region', { name: 'Then', exact: true })
  const allow = thenSec.getByRole('radiogroup', { name: 'What happens when this rule matches' }).getByRole('radio', { name: /^Allow\b/ })
  // as in `condition`: the parts take measures its crop at each resting point; nobody else passes one
  const seen = async () => {
    if (look) await look()
  }
  await scroll(rec, body, insp.locator('#bb-sec-then'), { offset: 16 })
  if (always || !(await allow.first().isChecked())) {
    await rec.click(allow)
    await rec.hold(0.4)
    await seen()
  }
  if ((await thenSec.getByRole('button', { name: 'Add second factor' }).count()) > 0) {
    await rec.click(thenSec.getByRole('button', { name: 'Add second factor' }))
    await rec.hold(0.4)
    await seen()
  }
  await rec.visible(insp.locator('.bb__second'))
  // again, now that Allow has lit and the Second factor block sits below the tiles
  await scroll(rec, body, insp.locator('#bb-sec-then'), { offset: 16 })
  // "Prove it with" is an open list
  await rec.click(thenSec.getByRole('radiogroup', { name: 'How the second factor is proved' }).getByRole('radio', { name: 'Specific methods', exact: true }))
  await rec.hold(0.6)
  await seen()
  // the methods picker sits inside the Specific methods row
  await rec.click(insp.getByRole('combobox', { name: 'Methods accepted' }))
  const lb = p.getByRole('listbox', { name: 'Methods accepted' })
  await rec.click(lb.getByRole('option', { name: /^miniOrange Push/ }))
  await rec.hold(0.5)
  await seen()
  await rec.click(lb.getByRole('option', { name: /^TOTP Authenticator/ }))
  await rec.hold(0.8)
  await seen()
  /* The multi-select stays open, and near the foot of the panel it flips
     upward over its own trigger — so it is closed with an outside click on the
     Then heading, which nothing can cover and which changes nothing. */
  await rec.click(insp.getByRole('heading', { name: 'Then', level: 3 }), { hint: false })
  await gone(rec, p.getByRole('listbox', { name: 'Methods accepted' }), 'methods list closed')
  await seen()
}

/* --- 04.1 · The board — filmed first ----------------------------------------------------

   The seeded Trading Platform policy, opened from the list in a dry prep so the
   take begins on a still board. Nothing here edits it: density is a view
   setting and a spotlight touches nothing, which the leave guard in `create`
   then proves. */
async function board(rec, p) {
  const cards = p.locator('.bb__card:not(.is-terminal)')
  const row = p.locator('tbody tr', { hasText: TOUR })

  // --- prep, unfilmed: open the policy ----------------------------------------------------
  const wasDry = rec.dry
  rec.dry = true
  await rec.click(row.getByRole('button', { name: TOUR, exact: true }))
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(TOUR), { seconds: 8, label: `board bar names "${TOUR}"` })
  await rec.visible(p.locator('.bb__stage'))
  await noTour(rec, p)
  rec.dry = wasDry
  // let the mount's layout spring settle, then throw those frames away: the take opens on a still board
  await rec.hold(1.0)
  rec.cut()

  rec.say('db.1')
  // all five rules and the default fit once folded
  await rec.click(density(p, 'Collapse cards'))
  await rec.until(() => density(p, 'Collapse cards').first().isChecked(), { seconds: 3, label: 'Collapse cards is on' })
  await rec.hold(1.2)
  await rec.settle(0.3)

  rec.say('db.2')
  await rec.spotlight(cards.nth(0), { seconds: 2.6, pad: 8 })
  await rec.hold(2.6)
  await rec.settle(0.3)

  rec.say('db.3')
  const f0 = rec.frame()
  // the "first-match" inset plays in the shelved column; the camera stays put under it
  await rec.explain('first-match')
  await rec.spotlight(cards.nth(0), { seconds: 2.0, pad: 8, cam: false })
  await rec.hold(toWord(rec, f0, 'db.3', /^not$/))
  await rec.spotlight(cards.nth(1), { seconds: 2.0, pad: 8, cam: false })
  await rec.hold(2.0)
  await rec.settle(0.3)

  // --- the fixture, as it was seeded, and unchanged --------------------------------------------
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(TOUR), { seconds: 3, label: `board bar names "${TOUR}"` })
  await rec.until(async () => sameList(await titles(p), TOUR_RULES), { seconds: 3, label: 'five rules in the fixture order' })
  await rec.until(async () => (await thenChip(cards.nth(0), 'Deny').count()) >= 1, { seconds: 3, label: 'rule 1 reads Deny' })
  await rec.until(async () => (await p.locator('.bbtop').getByRole('button', { name: 'Discard' }).count()) === 0, { seconds: 3, label: 'nothing unsaved in the bar' })
}

/* --- 04.2 · A new policy ----------------------------------------------------------------------- */
async function create(rec, p) {
  rec.say('cr.1')
  await rec.click(p.getByRole('button', { name: 'Back to policies' }))
  // the tour changed nothing, so the leave guard must not open
  await never(rec, p.getByRole('dialog', { name: 'Leave without publishing?' }), 1.0, 'the leave guard after the board tour')
  await rec.visible(p.getByRole('heading', { level: 1, name: 'Policies' }), { seconds: 8 })
  const newBtn = p.getByRole('button', { name: 'New policy', exact: true })
  await rec.hover(newBtn, { seconds: 0.8 })
  await rec.settle(0.3)

  rec.say('cr.2')
  await rec.click(newBtn)
  const dlg = p.getByRole('dialog', { name: 'Name your policy' })
  await rec.visible(dlg)
  await rec.hold(0.4)
  await rec.focus(dlg, { zoom: 1.4, seconds: 1.0 })
  // the dialog opens with focus on its panel, not the field: click before typing
  await rec.click(dlg.getByRole('textbox', { name: 'Policy name *' }))
  await rec.type(POLICY, { cps: 17 })
  await rec.hold(0.3)
  const apps = dlg.getByRole('combobox', { name: 'Applications this policy protects' })
  await rec.click(apps)
  await rec.hold(0.4)
  // the popup's search box is never auto-focused (it mounts hidden until measured)
  await rec.click(p.getByRole('textbox', { name: 'Search Applications this policy protects' }))
  await rec.type('work', { cps: 11 })
  await rec.hold(0.5)
  await rec.click(p.getByRole('option', { name: 'Workday SAML' }))
  await rec.hold(0.8)
  // a multi-select stays open; its own trigger closes it (Escape here would close the whole dialog)
  await rec.click(apps, { hint: false })
  await gone(rec, p.getByRole('listbox', { name: 'Applications this policy protects' }), 'applications list closed')
  await rec.settle(0.3)

  rec.say('cr.3')
  await rec.click(dlg.getByRole('button', { name: 'Create policy' }))
  await rec.focus(null, { seconds: 1.0 })
  await rec.visible(p.getByRole('heading', { name: 'How would you like to start?' }), { seconds: 8 })
  await rec.hold(0.4)
  await rec.click(p.getByRole('button', { name: /Start from scratch/ }))
  const insp = inspector(p)
  await rec.visible(insp)
  await rec.hold(0.8)
  // the "created" toast sits over the dock for a few seconds: let it go before pressing anything there
  await gone(rec, p.locator('.bshell__toast'), 'the created toast faded')
  /* Cards open folded; Expand unfolds the body so the rule reads on the card
     from here on. The board centres the chain beside the panel by itself. */
  await rec.click(density(p, 'Expand cards'))
  await rec.until(() => density(p, 'Expand cards').first().isChecked(), { seconds: 3, label: 'Expand cards is on' })
  // the walkthrough would have opened 600 ms after the board mounted: it must not have
  await noTour(rec, p)
  await rec.spotlight(p.locator('.bbtop .bx-status'), { label: 'Draft', seconds: 2.2 })
  await rec.hold(2.2)
  await rec.settle(0.3)

  // --- a draft, one blank rule, open in the panel ----------------------------------------------------
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(POLICY), { seconds: 3, label: `board bar names "${POLICY}"` })
  await rec.until(async () => (await text(p.locator('.bbtop .bx-status'))) === 'Draft', { seconds: 3, label: 'status pill reads Draft' })
  await rec.until(async () => (await p.locator('.bb__card:not(.is-terminal)').count()) === 1, { seconds: 3, label: 'one rule on the board' })
  await rec.until(async () => (await text(card(p).locator('.bb__titlebtn'))) === 'New rule', { seconds: 3, label: 'the card is "New rule"' })
  await rec.until(async () => (await text(insp.locator('.bb__inspbar > b'))).toLowerCase().startsWith('rule 1'), { seconds: 3, label: 'the panel edits rule 1' })
}

/* --- 04.3 · Rule one — simple ---------------------------------------------------------------------- */
async function rule1(rec, p) {
  const insp = inspector(p)
  const r1 = ruleCard(p, RULE1)

  rec.say('r1.1')
  await renameRule(rec, insp, RULE1, 16)
  await rec.settle(0.3)

  rec.say('r1.2')
  await rec.spotlight(insp.getByRole('region', { name: 'Who', exact: true }), { seconds: 2.2 })
  await rec.hold(2.2)
  await rec.spotlight(insp.getByRole('region', { name: 'If', exact: true }), { seconds: 2.2 })
  await rec.hold(2.2)
  await rec.settle(0.3)

  rec.say('r1.3')
  /* The "then" inset plays first and the Then edits wait for it to leave the
     frame, so nothing in the panel changes under the shelf. */
  await rec.explain('then', { seconds: 3.0 })
  await rec.hold(3.0)
  await allowSecondFactor(rec, p, insp)
  await rec.settle(0.3)

  rec.say('r1.4')
  /* A rule with no who and no conditions draws only "Nothing set yet" on its
     card in this build (IfBlock / RuleCard), so the card cannot show what makes
     it exact. The panel's Then section does: Allow, the second factor, the two
     methods. The spotlight goes there. */
  await rec.spotlight(insp.getByRole('region', { name: 'Then', exact: true }), { seconds: 2.6 })
  await rec.hold(2.6)
  await rec.settle(0.3)

  // --- everyone, always, a second factor ------------------------------------------------------------------
  await rec.until(async () => (await text(card(p).locator('.bb__titlebtn'))) === RULE1, { seconds: 3, label: `card title "${RULE1}"` })
  await rec.until(async () => (await r1.locator('.bb__ifrow.is-cond').count()) === 0, { seconds: 3, label: 'rule one has no conditions' })
  /* Not the card's chip and journey, which BEATS-v7 asks for: this build draws
     neither on a rule with no who and no conditions. The rule's data says the
     same thing — allow with a second factor, proved by the two methods. */
  await rec.until(async () => {
    const d = await ruleData(p, RULE1)
    return !!d && d.decision === '2fa' && d.secondFactor === 'specific' && d.methods.includes('miniOrange Push') && d.methods.includes('TOTP Authenticator')
  }, { seconds: 3, label: 'rule one is a second factor by miniOrange Push or TOTP Authenticator' })
}

/* --- 04.4 · Rule two — complete, and rule three ---------------------------------------------------------- */
async function rule2(rec, p) {
  const insp = inspector(p)
  const body = insp.locator('.bb__inspbody')
  const ifSec = insp.getByRole('region', { name: 'If', exact: true })
  // the plus on the last connector; its hover hint reads "Add a rule here"
  const addEnd = p.getByRole('button', { name: 'Add a rule at the end', exact: true })
  const fresh = ruleCard(p, 'New rule')
  const r1 = ruleCard(p, RULE1)
  const r2 = ruleCard(p, RULE2)
  const r3 = ruleCard(p, RULE3)

  rec.say('r2.1')
  // an expanded chain can push the connector under the dock: wheel it clear first (a no-op when it is)
  await chainTo(rec, p, addEnd)
  await rec.hover(addEnd, { seconds: 0.8 })
  await rec.click(addEnd)
  // the new rule opens in the panel
  await rec.visible(insp)
  await atSlot(rec, fresh, 2)
  await rec.until(async () => (await text(insp.locator('.bb__inspbar > b'))).toLowerCase().startsWith('rule 2'), { seconds: 3, label: 'the panel edits rule 2' })
  await renameRule(rec, insp, RULE2, 16)
  await rec.settle(0.3)

  rec.say('r2.2')
  // the "who" inset plays first; the dialog opens after it has left
  await rec.explain('who', { seconds: 2.8 })
  await rec.hold(2.8)
  const whoSec = insp.getByRole('region', { name: 'Who', exact: true })
  await rec.click(whoSec.getByRole('button', { name: 'Add people' }))
  const who = p.getByRole('dialog', { name: 'Who is this rule about?' })
  await rec.visible(who)
  await rec.hold(0.4)
  await rec.click(who.getByRole('checkbox', { name: /^Finance\b/ }))
  await rec.hold(0.5)
  await rec.click(who.getByRole('checkbox', { name: /^Executives\b/ }))
  await rec.hold(0.5)
  await rec.click(who.getByRole('radio', { name: /^People/ }))
  await rec.hold(0.4)
  await rec.click(who.getByRole('checkbox', { name: /^Priya Sharma\b/ }))
  await rec.hold(0.5)
  await rec.click(who.getByRole('button', { name: /^Save 3 selected$/ }))
  await gone(rec, p.getByRole('dialog', { name: 'Who is this rule about?' }), 'who dialog closed')
  await rec.settle(0.3)

  rec.say('r2.3')
  await rec.explain('if', { seconds: 2.8 })
  await rec.hold(2.8)
  await scroll(rec, body, insp.locator('#bb-sec-if'), { offset: 20 })
  await condition(rec, p, insp, {
    add: ifSec.getByRole('button', { name: 'Add condition', exact: true }),
    // the attribute list is a flat column inline in the panel
    list: p.getByRole('group', { name: 'Add a condition' }),
    attr: 'Network zone',
    op: 'not in zone',
    search: 'office',
    value: 'Office Network',
    scope: ifSec,
    cps: 10,
  })
  await rec.settle(0.3)

  rec.say('r2.4')
  await rec.focus(ifSec, { zoom: 1.3, seconds: 1.0, pad: 24 })
  await rec.click(ifSec.getByRole('button', { name: 'Add', exact: true }))
  await rec.click(p.getByRole('menuitem', { name: 'Add condition group', exact: true }))
  /* A group is pending until its first condition exists: "Group B, not yet
     created" with a "Choose a condition" slot; the real group (and its own
     Add condition) appears only after the attribute is picked. */
  const pending = ifSec.getByRole('group', { name: /^Group [A-Z], not yet created/ })
  await rec.visible(pending)
  await rec.hold(0.6)
  await condition(rec, p, insp, {
    add: pending.getByRole('button', { name: 'Choose a condition' }),
    list: p.getByRole('group', { name: /^First condition in Group/ }),
    attr: 'Device profile',
    op: 'does not match',
    search: 'corporate',
    value: 'Corporate managed',
    scope: ifSec,
  })
  const grp = ifSec.getByRole('group', { name: /^Group [A-Z]:/ })
  await rec.visible(grp)
  await rec.settle(0.2)

  rec.say('r2.5')
  await condition(rec, p, insp, {
    add: grp.getByRole('button', { name: 'Add condition', exact: true }),
    list: p.getByRole('group', { name: /^Add to Group/ }),
    attr: 'Network zone',
    op: 'in zone',
    search: 'anonym',
    value: 'Anonymizers',
    scope: grp,
  })
  // the group's own joiner appears once it holds two rows; it is a native select
  await rec.select(grp.getByRole('combobox', { name: 'How conditions in this group are joined' }).first(), 'or')
  await rec.hold(0.4)
  await rec.spotlight(grp, { seconds: 2.4, pad: 6 })
  await rec.hold(2.4)
  await rec.settle(0.3)

  rec.say('r2.6')
  /* The rule's own joiner is drawn in every gap between the bracket's members
     (WhenEditor's JoinRow), and once a group exists the who-conditions are
     members too — whoEditable is only true for a single AND-run — so the FIRST
     rule-level joiner sits between the who rows. The one meant here is the gap
     straight above the group. */
  const runJoin = ifSec
    .locator('.bb__ifbracket > .bb__joinrow:has(+ .bb__ifgroup)')
    .getByRole('combobox', { name: 'How conditions in this rule are joined' })
  await rec.spotlight(runJoin, { seconds: 2.4, pad: 8 })
  await rec.hold(2.4)
  await rec.focus(null, { seconds: 1.0 })
  await rec.settle(0.3)

  rec.say('r2.7')
  await allowSecondFactor(rec, p, insp, { always: true })
  await scroll(rec, body, insp.getByRole('switch', { name: 'Remember this device' }), { offset: 180 })
  await rec.click(insp.getByRole('switch', { name: 'Remember this device' }))
  await rec.hold(0.5)
  await rec.click(insp.getByRole('spinbutton', { name: 'Days to remember' }))
  await rec.press('Control+a', { show: false })
  await rec.type('14', { cps: 6 })
  /* Take focus off the field so nothing typed later can reach it. The Then
     heading has scrolled above the panel's fold by now, so the Second factor
     head — still on screen, and inert — takes the click. */
  await rec.click(insp.locator('.bb__second__head'), { hint: false })
  await rec.settle(0.3)

  rec.say('r2.8')
  await chainTo(rec, p, addEnd)
  await rec.hover(addEnd, { seconds: 0.6 })
  await rec.click(addEnd)
  await atSlot(rec, fresh, 3)
  await rec.until(async () => (await text(insp.locator('.bb__inspbar > b'))).toLowerCase().startsWith('rule 3'), { seconds: 3, label: 'the panel edits rule 3' })
  await renameRule(rec, insp, RULE3, 22)
  /* One condition, the fixture's blocked zone. A deny with none at all would
     refuse every sign-in once it is moved to the top. */
  await scroll(rec, body, insp.locator('#bb-sec-if'), { offset: 20 })
  await condition(rec, p, insp, {
    add: ifSec.getByRole('button', { name: 'Add condition', exact: true }),
    list: p.getByRole('group', { name: 'Add a condition' }),
    attr: 'Network zone',
    op: 'in zone',
    search: 'anonym',
    value: 'Anonymizers',
    scope: ifSec,
  })
  await scroll(rec, body, insp.locator('#bb-sec-then'), { offset: 16 })
  const decide = insp.getByRole('region', { name: 'Then', exact: true }).getByRole('radiogroup', { name: 'What happens when this rule matches' })
  await rec.click(decide.getByRole('radio', { name: /^Deny\b/ }))
  await rec.hold(0.6)
  await rec.settle(0.3)

  rec.say('r2.9')
  // not Close the panel: the selection would outlive it and dim rules one and two under their spotlights
  await clickAway(rec, p)
  await rec.click(density(p, 'Collapse cards'))
  await rec.until(() => density(p, 'Collapse cards').first().isChecked(), { seconds: 3, label: 'Collapse cards is on' })
  // the panel's slide and the fold both run a few hundred ms: light the cards once they are still
  await rec.hold(0.6)
  for (const c of [r1, r2, r3]) {
    await rec.spotlight(c, { seconds: 1.2, pad: 8 })
    await rec.hold(1.2)
  }
  await rec.settle(0.3)

  // --- three rules: plain, conditional, absolute ------------------------------------------------------------------
  await rec.until(async () => sameList(await titles(p), [RULE1, RULE2, RULE3]), { seconds: 3, label: `rules read [${RULE1}, ${RULE2}, ${RULE3}] top to bottom` })
  await rec.until(async () => (await r2.locator('.bb__ifplain').count()) === 1 && (await r2.locator('.bb__ifgroup').count()) === 1, {
    seconds: 3,
    label: 'rule two has one loose member and one group',
  })
  await rec.until(async () => (await r2.locator('.bb__ifgroup .bb__ifrow.is-cond').count()) === 2, { seconds: 3, label: 'two conditions in the group' })
  /* Scoped to the group: once a group exists the who-rows are drawn as
     conditions of member A, so the first run-level joiner on the card is
     member A's "and". */
  await rec.until(async () => (await text(r2.locator('.bb__ifgroup .bb__ifjoin.is-run .bb__ifkw'))).toLowerCase() === 'or', { seconds: 3, label: 'the group joins with or' })
  await rec.until(async () => (await thenChip(r2, 'Second factor').count()) >= 1, { seconds: 3, label: 'rule two reads Second factor' })
  await rec.until(async () => (await text(journey(r2))).includes('Remembered 14 days'), { seconds: 3, label: 'rule two journey reads Remembered 14 days' })
  await rec.until(async () => (await r3.locator('.bb__ifrow.is-cond').count()) === 1, { seconds: 3, label: 'rule three has one condition' })
  let r3row = ''
  await rec.until(async () => {
    r3row = await text(r3.locator('.bb__ifrow.is-cond'))
    return /Network zone/.test(r3row) && /\bin zone\b/.test(r3row) && !/not in zone/.test(r3row) && /Anonymizers/.test(r3row)
  }, { seconds: 3, label: 'rule three reads Network zone in zone Anonymizers' }).catch((e) => {
    throw new Error(`${e.message} — its condition row reads "${r3row}"`)
  })
  await rec.until(async () => (await r3.locator('.bb__ifgroup').count()) === 0 && (await r3.locator('.bb__ifwho').count()) === 0, {
    seconds: 3,
    label: 'rule three has no group and no who',
  })
  await rec.until(async () => (await thenChip(r3, 'Deny').count()) >= 1, { seconds: 3, label: 'rule three reads Deny' })
  await rec.until(async () => (await text(journey(r3))).includes('Refused'), { seconds: 3, label: 'rule three journey reads Refused' })
  await rec.until(async () => (await r1.locator('.bb__ifrow.is-cond').count()) === 0, { seconds: 3, label: 'rule one still has no conditions' })
  await rec.until(() => density(p, 'Collapse cards').first().isChecked(), { seconds: 3, label: 'cards collapsed' })
  await rec.until(async () => (await inspector(p).count()) === 0, { seconds: 3, label: 'the panel is closed' })
  await rec.until(async () => (await p.locator('.bb__card.is-selected').count()) === 0, { seconds: 3, label: 'no card selected' })
}

/* --- 04.5 · Priority, live — take `order` ------------------------------------------------------------------------

   Opens where rule2 left the board: collapsed, three rules, panel closed. The
   deny goes to the top with two Move ups, the broad rule to the bottom with
   Alt+ArrowDown. Every move is asserted by slot before the next action: a move
   that changes nothing writes no history, and a later undo would then reverse
   the wrong edit. */
async function order(rec, p) {
  const insp = inspector(p)
  const cards = p.locator('.bb__card:not(.is-terminal)')
  const r1 = ruleCard(p, RULE1)
  const r2 = ruleCard(p, RULE2)
  const r3 = ruleCard(p, RULE3)
  const WANT = [RULE3, RULE2, RULE1]

  /* The one that must not ship wrong. The catch-all's "Shadows N rules below
     it" warning (diagnostics.ts PE104) is not printed on the card: it turns the
     rule's state pill to "Check" (`.bb__state.is-warn`), so that class is what
     is read. */
  const check = async (when) => {
    await rec.until(async () => (await cards.count()) === 3, { seconds: 3, label: `three rules, no more (${when})` })
    await inOrder(WANT, when)
    await atSlot(rec, r3, 1)
    await atSlot(rec, r2, 2)
    await atSlot(rec, r1, 3)
    await rec.until(async () => (await thenChip(r3, 'Deny').count()) >= 1, { seconds: 3, label: `rule three still reads Deny (${when})` })
    await rec.until(async () => !/\bis-warn\b/.test((await r1.locator('.bb__state').first().getAttribute('class')) ?? ''), {
      seconds: 3,
      label: `the broad rule no longer shadows anything (${when})`,
    })
  }

  /* The whole list, read from the DOM after every move — not only the moved
     card's slot — and printed, so a dry run shows the order the film will. */
  const inOrder = async (want, when) => {
    await rec.until(async () => sameList(await titles(p), want), { seconds: 3, label: `rules read [${want.join(', ')}] top to bottom (${when})` })
    console.log(`order ${when}: ${JSON.stringify(await titles(p))}`)
  }

  // where rule2 left it, and the broad rule at the top shadowing the two below (its pill reads Check)
  await inOrder([RULE1, RULE2, RULE3], 'before the moves')
  await rec.until(async () => /\bis-warn\b/.test((await r1.locator('.bb__state').first().getAttribute('class')) ?? ''), {
    seconds: 3,
    label: 'the broad rule shadows the rules below it before the moves',
  })

  rec.say('pr.3')
  // the hover actions float over the card's top edge and only take the pointer while the card is hovered
  await rec.hover(r3, { seconds: 0.8, ox: 0.6, oy: 0.3 })
  await rec.click(r3.getByRole('button', { name: 'Move up' }))
  await atSlot(rec, r3, 2)
  await atSlot(rec, r1, 1)
  await inOrder([RULE1, RULE3, RULE2], 'after the first Move up')
  await rec.hold(0.5)
  // the card slid up from under the cursor: hover it again so its actions take the pointer
  await rec.hover(r3, { seconds: 0.4, ox: 0.6, oy: 0.3 })
  await rec.click(r3.getByRole('button', { name: 'Move up' }))
  await atSlot(rec, r3, 1)
  await atSlot(rec, r1, 2)
  await inOrder([RULE3, RULE1, RULE2], 'after the second Move up')
  await rec.hold(0.5)
  // select the broad rule by its title so the board has focus; shortcuts are dead while a field has it
  await rec.click(r1.getByRole('button', { name: RULE1, exact: true }))
  // selecting a card opens the panel on it
  await rec.visible(insp)
  await rec.hold(0.5)
  await rec.press('Alt+ArrowDown')
  await atSlot(rec, r1, 3)
  await inOrder(WANT, 'after Alt+ArrowDown')
  await rec.hold(0.6)
  // the panel opened on the selected rule: a click away closes it and drops the selection, so pr.4's cards are not dimmed
  await clickAway(rec, p)
  await rec.settle(0.3)
  await check('after pr.3')

  rec.say('pr.4')
  const f0 = rec.frame()
  await rec.hold(toWord(rec, f0, 'pr.4', /^Now$/))
  await rec.spotlight(r3, { seconds: 2.4, pad: 8 })
  await rec.hold(2.4)
  await rec.hold(toWord(rec, f0, 'pr.4', /^default$/))
  await rec.spotlight(r1, { seconds: 2.0, pad: 8 })
  await rec.hold(2.0)
  await rec.settle(0.4)

  await check('at the end of the take')
}

/* --- 04.6 · Save it ------------------------------------------------------------------------------------------------ */
async function save(rec, p) {
  const dlg = p.getByRole('dialog', { name: 'Review your policy' })
  // the three rules, in board order; the pinned default is the last item
  const rules = dlg.locator('.bdlg-rev__rules > li:not(.is-default)')

  rec.say('rv.1')
  await rec.click(p.locator('.bbtop__acts').getByRole('button', { name: 'Review & Save' }))
  await rec.visible(dlg)
  await rec.hold(0.5)
  await rec.focus(dlg, { zoom: 1.3, seconds: 1.0 })
  await rec.settle(0.3)

  rec.say('rv.2')
  const f0 = rec.frame()
  await rec.spotlight(rules.nth(0), { seconds: 2.2, pad: 8 })
  await rec.hold(toWord(rec, f0, 'rv.2', /^two$/))
  await rec.spotlight(rules.nth(1), { seconds: 2.6, pad: 8 })
  await rec.hold(toWord(rec, f0, 'rv.2', /^three$/))
  await rec.spotlight(rules.nth(2), { seconds: 2.6, pad: 8 })
  await rec.hold(2.6)
  await rec.settle(0.3)

  // --- the review reads the new order back ---------------------------------------------------------------------------
  await rec.until(async () => (await rules.count()) === 3, { seconds: 3, label: 'three rules in the review' })
  await rec.until(async () => {
    const t = await text(rules.nth(0))
    return t.includes(RULE3) && t.includes('Deny')
  }, { seconds: 3, label: `review rule one is "${RULE3}", Deny` })
  await rec.until(async () => (await text(rules.nth(1))).includes(RULE2), { seconds: 3, label: `review rule two is "${RULE2}"` })
  await rec.until(async () => (await text(rules.nth(2))).includes(RULE1), { seconds: 3, label: `review rule three is "${RULE1}"` })

  rec.say('rv.3')
  await rec.click(dlg.getByRole('button', { name: 'Confirm & Save' }))
  rec.sfx('success')
  await gone(rec, p.getByRole('dialog', { name: 'Review your policy' }), 'review dialog closed')
  await rec.focus(null, { seconds: 1.0 })
  await rec.visible(p.locator('.bshell__toast'), { seconds: 3 })
  await rec.hold(1.0)
  // the spotlight must finish before anything changes the page, or it lingers over what comes next
  await rec.spotlight(p.locator('.bbtop .bx-status'), { label: 'Draft → Inactive', seconds: 2.4, pad: 8 })
  await rec.hold(2.5)
  await rec.settle(0.4)

  await rec.until(async () => (await text(p.locator('.bbtop .bx-status'))) === 'Inactive', { seconds: 3, label: 'status pill reads Inactive' })
}

/* --- 02 · The live tour — take `showcase`, filmed last ---------------------------------------------------------------

   Shown second in the film, right after the bento's strip cards dock onto it.
   The prep puts the saved Workday board in the state the dock was designed on —
   panel closed and nothing selected, cards expanded, zoom 100 %, the chain as
   near its top as lets the Finance card clear the dock, cursor off the cards —
   and the seven dock rects are measured on that still board. */
async function showcase(rec, p) {
  const view = p.getByRole('toolbar', { name: 'View' })
  const fin = ruleCard(p, RULE2)

  // --- prep, unfilmed ----------------------------------------------------------------------------------------------------
  const wasDry = rec.dry
  rec.dry = true
  await gone(rec, p.locator('.bshell__toast'), 'the saved toast faded')
  /* Nothing selected and the panel closed, so no card in the dock picture is
     dimmed. First, because it moves the chain: done after the wheel below, the
     click left the Finance card 24 px lower than it had been wheeled to. */
  await clickAway(rec, p)
  await rec.click(density(p, 'Expand cards'), { hint: false })
  await rec.until(() => density(p, 'Expand cards').first().isChecked(), { seconds: 3, label: 'Expand cards is on' })
  if ((await view.getByRole('button', { name: 'Reset zoom' }).count()) > 0) {
    await rec.click(view.getByRole('button', { name: 'Reset zoom' }), { hint: false })
  }
  await chainWheelTo(rec, p, 0)
  /* Then down only as far as the Finance card needs to clear the dock. Expanded
     at 100 %, the chain at its top puts that card's group and its then rows
     below the stage's fold (measured: the then row clipped to nothing), and the
     who / if / then boxes dock onto rows that have to be on screen.

     Measured once the card has stopped growing — the Expand fold is a CSS
     transition the virtual clock does not own — and the landing is checked
     against the dock and wheeled again if it came up short. */
  let lastH = -1
  let quietH = 0
  await rec.until(async () => {
    await new Promise((r) => setTimeout(r, 60)) // real time: the fold runs outside the virtual clock
    const h = await fin.first().evaluate((el) => el.getBoundingClientRect().height)
    quietH = Math.abs(h - lastH) < 0.5 ? quietH + 1 : 0
    lastH = h
    return quietH >= 3
  }, { seconds: 4, label: 'the Finance card stopped growing' })
  const clearance = async () => {
    const c = await rec.rectOf(fin, { raw: true })
    const d = await rec.rectOf(p.locator('.bb__dock'))
    return d.y - (c.y + c.height)
  }
  for (let round = 0; round < 3 && (await clearance()) < 22; round++) await chainTo(rec, p, fin, { margin: 24 })
  if ((await clearance()) < 22) throw new Error(`the Finance card does not clear the dock (${Math.round(await clearance())} px)`)
  /* Density, zoom and the wheel are view state, not edits: the saved policy has
     nothing unsaved, so sh.2's Back to policies cannot meet the leave guard. */
  await gone(rec, p.locator('.bbtop').getByRole('button', { name: 'Discard' }), 'nothing unsaved after the showcase prep')
  // the cursor rests on bare stage, left of the column, so no card shows its hover actions
  const s = await rec.rectOf(p.locator('.bb__stage'))
  await rec.glide({ x: s.x + s.width * 0.12, y: s.y + s.height * 0.5 })
  await rec.until(async () => (await p.locator('.bb__card.is-selected').count()) === 0 && (await clearance()) >= 22, {
    seconds: 1,
    label: 'nothing selected and the Finance card clear of the dock, as the dock picture needs',
  })
  rec.dry = wasDry
  // the fold and the zoom settle here; those frames are thrown away below
  await rec.hold(0.9)
  // again after the hold, without stepping a frame: the rects below are measured on this picture
  if ((await clearance()) < 22) throw new Error(`the Finance card slid back under the dock during the hold (${Math.round(await clearance())} px)`)

  /* The dock targets, measured on the still board just BEFORE the cut: a
     measurement that had to wait would step frames, and after the cut those
     would push the event past frame 0. Nothing moves between here and the first
     kept frame. With a group on the rule the who-conditions are rows inside
     member A's `.bb__ifplain`. `has:` takes a page-rooted inner locator:
     Playwright matches it from the outer element. */
  const row = (re) => fin.locator('.bb__ifplain .bb__ifrow.is-cond').filter({ hasText: re })
  const stage = await rec.rectOf(p.locator('.bb__stage'))
  const all = p.locator('.bb__card:not(.is-terminal)')
  const boardRects = []
  // uncut: a card below the stage's fold still belongs to the board; the union is cut to the stage after
  for (let i = 0, n = await all.count(); i < n; i++) boardRects.push(await rec.rectOf(all.nth(i), { raw: true }))
  const rects = {
    card: union([await rec.rectOf(fin)], 'card'),
    who: union(await rec.rectsOf(row(/Finance|Executives|Priya/)), 'who'),
    if: union([await rec.rectOf(row(/Office Network/)), await rec.rectOf(fin.locator('.bb__ifgroup').first())], 'if'),
    then: union(
      await rec.rectsOf(fin.locator('.bb__ifrow').filter({ has: p.locator('.bb__ifkw', { hasText: /^then$/ }) }).or(fin.locator('.bb__ifaction'))),
      'then',
    ),
    /* The bento's Shortcuts card docks onto the board's View toolbar. Its Undo
       and Redo are the buttons behind Ctrl+Z, so it is the nearest thing on the
       builder to the keys that card shows. */
    shortcuts: union([await rec.rectOf(view)], 'shortcuts'),
    board: clipTo(union(boardRects, 'board'), stage, 'board'),
    review: union([await rec.rectOf(p.locator('.bbtop__acts').getByRole('button', { name: 'Review & Save' }))], 'review'),
  }
  // the stage's rule-card crop and the six strip cards' landing targets, no more and no fewer
  const DOCK_KEYS = ['card', 'who', 'if', 'then', 'shortcuts', 'board', 'review']
  if (!sameList(Object.keys(rects), DOCK_KEYS)) throw new Error(`dock targets are [${Object.keys(rects).join(', ')}], want [${DOCK_KEYS.join(', ')}]`)
  // every value inside the viewport and non-empty, as the edl asserts; printed so a dry run shows them
  for (const [k, r] of Object.entries(rects)) {
    if (!(r.width >= 1 && r.height >= 1 && r.x >= 0 && r.y >= 0 && r.x + r.width <= 1440 && r.y + r.height <= 900)) {
      throw new Error(`dock target "${k}" is not inside the viewport: ${JSON.stringify(r)}`)
    }
  }
  console.log(`dock rects: ${JSON.stringify(rects)}`)
  rec.cut()
  rec.mark('dock', { rects })
  /* The bento lands this very picture flat and fades into it over 0.8 s: let
     the seam finish and the builder rest before the voice comes in. */
  await rec.hold(1.2)

  rec.say('sh.1')
  await rec.settle(0.3)

  rec.say('sh.2')
  // saved, so there is no leave guard
  await rec.click(p.getByRole('button', { name: 'Back to policies' }))
  await rec.visible(p.locator('tbody tr'), { seconds: 8 })
  const mine = p.locator('tbody tr', { hasText: POLICY })
  await rec.visible(mine, { seconds: 3 })
  /* Off the navigation. The list opens with its sidebar expanded, and the Back
     button's spot is then the Dashboard item, whose "Not built in this
     prototype." tip stood over the list for the whole spotlight in the dry
     run's still. Bare header, right of the page's subtitle. */
  const head = await rec.rectOf(p.getByRole('heading', { level: 1, name: 'Policies' }))
  const add = await rec.rectOf(p.getByRole('button', { name: 'New policy', exact: true }))
  await rec.glide({ x: add.x - 240, y: head.y + head.height + 18 })
  // the list's own entrance runs a few frames: measure the row once it has landed
  await rec.hold(0.4)
  await rec.spotlight(mine, { seconds: 2.6, pad: 6 })
  await rec.hold(2.6)
  await rec.settle(0.3)
  await rec.until(async () => (await text(mine.locator('.bx-status'))) === 'Inactive', { seconds: 3, label: 'the Workday row reads Inactive' })
  await rec.until(async () => (await text(mine.locator('td').nth(1))).includes('Workday'), { seconds: 3, label: 'the Workday row guards Workday' })

  rec.say('sh.3')
  const tour = p.locator('tbody tr', { hasText: TOUR })
  /* On the name, not further right: the Application cell is a hover-peek
     button and opens an "Applications for …" panel over the rows below. */
  await rec.hover(tour.locator('td').first(), { seconds: 0.8, ox: 0.3 })
  await rec.click(tour.getByRole('button', { name: TOUR, exact: true }))
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(TOUR), { seconds: 8, label: `board bar names "${TOUR}"` })
  await noTour(rec, p)
  await rec.hold(0.8)
  // a no-op unless the click ran ahead of the line: the take never ends mid-word
  await rec.settle(0)

  // --- on the tour's board, nothing open ---------------------------------------------------------------------------------
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(TOUR), { seconds: 3, label: `board bar names "${TOUR}"` })
  await rec.until(async () => (await p.getByRole('dialog').count()) === 0, { seconds: 3, label: 'no dialog open' })
}

/* --- 01 · The parts, unspoken — take `parts`, filmed after the showcase ------------------------

   Source footage for the bento's stage and filmstrip, never placed in the film
   sequence. It opens where the showcase ended, on the Trading Platform board,
   builds a throwaway policy of its own, and films five short segments of it —
   who, if, then, board, review — each bracketed by `part` marks:

     { type: 'part', id, phase: 'start', rect }   f = the segment's first frame
     { type: 'part', id, phase: 'end', rect }     f = the segment's last frame

   `rect` is the one crop the bento shows that segment through, in app px: the
   union of everything the segment shows, clipped to the viewport (and the
   board's to its stage). Between segments the take runs dry, so the setup that
   joins them keeps no frames — the footage is five stills-to-stills clips laid
   end to end.

   The crop has to be written at the first frame and is only known at the last,
   because the popovers a segment opens are not on screen when it starts. So
   the start mark carries a rect OBJECT that grows in place as the segment is
   measured: the recorder keeps the event's own reference (`{ f, type, ...data }`
   copies only the top level) and serialises the take at endTake. The end mark
   carries the same object, so a reader that trusts neither gets the final value
   from the end.

   Nothing is said. The two keys pressed in `board` write their usual `key`
   events, which the bento's Shortcuts card presses its keycaps on; every click
   writes its usual `click` event, which the bento draws as a ripple when it
   falls inside the crop. */
export const PARTS = 'Parts footage'
const VIEWPORT = { x: 0, y: 0, width: 1440, height: 900 }

async function parts(rec, p) {
  const insp = inspector(p)
  const body = insp.locator('.bb__inspbody')
  const ifSec = insp.getByRole('region', { name: 'If', exact: true })
  const thenSec = insp.getByRole('region', { name: 'Then', exact: true })
  const wasDry = rec.dry
  const marks = []

  /* Frames stepped in full even while dry — `hold` caps a dry hold at six
     frames, which is shorter than a dialog's entrance spring, and a crop
     measured mid-spring is measured on a box still on its way in. */
  const still = (seconds) => rec.step(Math.round(seconds * rec.fps))

  /* A still for `capture.mjs --stills`, which hooks settle: taken as a segment
     opens and wherever its crop is measured, so a dry run can be checked by eye
     against the printed rects. The take never speaks, so in a filmed capture
     settle(0) has no line to wait for and steps no frame (dry, it steps one).
     Counted per segment and printed, so the numbered stills can be told apart. */
  const stills = {}
  let segment = null
  const shot = async () => {
    if (segment) stills[segment] = (stills[segment] ?? 0) + 1
    await rec.settle(0)
  }

  /* The crop for one segment. `add` measures every visible match of each
     locator (a plain rect is taken as it is) and folds it into the rect the
     start mark already holds. Visibility is checked first so a measurement
     never waits — rectOf's wait would step, and film, frames. */
  const cropFor = (id, within = VIEWPORT) => {
    const seen = []
    const rect = { x: 0, y: 0, width: 0, height: 0 }
    return {
      rect,
      async add(...targets) {
        for (const t of targets) {
          if (!t) continue
          if (typeof t.count !== 'function') {
            seen.push(t)
            continue
          }
          for (let i = 0, n = await t.count(); i < n; i++) {
            const one = t.nth(i)
            if (await one.isVisible().catch(() => false)) seen.push(await rec.rectOf(one).catch(() => null))
          }
        }
        if (seen.some((r) => r && r.width >= 1 && r.height >= 1)) Object.assign(rect, clipTo(union(seen, `part ${id}`), within, `part ${id}`))
        if (segment === id) await shot()
      },
    }
  }

  /* Into a segment: measure what is already there, stop running dry, and make
     the first frame a fresh picture. The recorder reuses the last image when a
     step reports nothing changed, and the dry setup has already consumed the
     page's change flags — so without a nudge the segment would open on the
     previous segment's last picture. Toggling an attribute nothing styles is a
     DOM mutation, which is what the virtual clock counts as a change. */
  const begin = async (id, targets = [], within) => {
    const crop = cropFor(id, within)
    await crop.add(...targets)
    rec.dry = wasDry
    await p.evaluate(() => document.documentElement.toggleAttribute('data-rec-part'))
    rec.mark('part', { id, phase: 'start', rect: crop.rect })
    marks.push({ id, phase: 'start', rect: crop.rect })
    // the footage starts still
    await rec.hold(0.4)
    segment = id
    await shot()
    return crop
  }
  /* Out of a segment: ends still, the end mark sits ON the last kept frame
     (one frame before the hold is over), and the take goes dry again. */
  const end = async (id, crop) => {
    rec.pace = 1
    await rec.hold(0.6 - 1 / rec.fps)
    rec.mark('part', { id, phase: 'end', rect: crop.rect })
    marks.push({ id, phase: 'end', rect: crop.rect })
    await rec.step(1)
    segment = null
    rec.dry = true
  }

  // --- prep, unfilmed: a policy of its own, one blank rule, open in the panel ----------------------
  rec.dry = true
  // the showcase only opened the tour's board, so there is nothing to leave behind
  await rec.click(p.getByRole('button', { name: 'Back to policies' }))
  await never(rec, p.getByRole('dialog', { name: 'Leave without publishing?' }), 0.5, 'the leave guard after the showcase')
  await rec.visible(p.getByRole('heading', { level: 1, name: 'Policies' }), { seconds: 8 })
  await rec.click(p.getByRole('button', { name: 'New policy', exact: true }))
  const named = p.getByRole('dialog', { name: 'Name your policy' })
  await rec.visible(named)
  await still(0.4)
  await rec.click(named.getByRole('textbox', { name: 'Policy name *' }))
  await rec.type(PARTS, { cps: 40 })
  const apps = named.getByRole('combobox', { name: 'Applications this policy protects' })
  await rec.click(apps)
  await still(0.3)
  await rec.click(p.getByRole('textbox', { name: 'Search Applications this policy protects' }))
  await rec.type('work', { cps: 40 })
  await still(0.3)
  await rec.click(p.getByRole('option', { name: 'Workday SAML' }))
  await still(0.3)
  // a multi-select stays open; its own trigger closes it (Escape would close the whole dialog)
  await rec.click(apps, { hint: false })
  await gone(rec, p.getByRole('listbox', { name: 'Applications this policy protects' }), 'applications list closed')
  await rec.click(named.getByRole('button', { name: 'Create policy' }))
  await rec.visible(p.getByRole('heading', { name: 'How would you like to start?' }), { seconds: 8 })
  await still(0.3)
  await rec.click(p.getByRole('button', { name: /Start from scratch/ }))
  await rec.visible(insp)
  await gone(rec, p.locator('.bshell__toast'), 'the created toast faded')
  await rec.click(density(p, 'Expand cards'))
  await rec.until(() => density(p, 'Expand cards').first().isChecked(), { seconds: 3, label: 'Expand cards is on' })
  await noTour(rec, p)
  await rec.until(async () => (await text(p.locator('.bbtop__name'))).includes(PARTS), { seconds: 3, label: `board bar names "${PARTS}"` })
  /* Named like the showcase's Finance rule, which this one is rebuilt to match:
     "New rule" would stand on the board and the review in the footage as a
     rule nobody finished. */
  await renameRule(rec, insp, RULE2, 40)

  // --- who: the dialog, two groups ticked past a third, then one person -----------------------------------
  await rec.click(insp.getByRole('region', { name: 'Who', exact: true }).getByRole('button', { name: 'Add people' }))
  const who = p.getByRole('dialog', { name: 'Who is this rule about?' })
  await rec.visible(who)
  await still(0.6)
  const whoBox = await rec.rectOf(who)
  // the cursor waits on the dialog's lede, above the list, so the first glide is down it
  await rec.glide({ x: whoBox.x + whoBox.width * 0.7, y: whoBox.y + 72 })
  await still(0.2)
  const tick = (re) => who.getByRole('checkbox', { name: re })

  const whoCrop = await begin('who', [who])
  await rec.hover(tick(/^Finance\b/), { seconds: 0.6 })
  await rec.click(tick(/^Finance\b/))
  await rec.hover(tick(/^Engineering\b/), { seconds: 0.4 })
  await rec.hover(tick(/^Executives\b/), { seconds: 0.6 })
  await rec.click(tick(/^Executives\b/))
  await rec.hold(0.4)
  await rec.click(who.getByRole('radio', { name: /^People/ }))
  await rec.hold(0.5)
  // Priya leads the directory, so she is on screen without a search; the search is the fallback
  if (!(await tick(/^Priya Sharma\b/).first().isVisible())) {
    await rec.click(who.getByRole('textbox', { name: 'Search people' }))
    await rec.type('priya', { cps: 12 })
    await rec.hold(0.4)
  }
  await whoCrop.add(who)
  await rec.click(tick(/^Priya Sharma\b/))
  await rec.hold(0.5)
  await whoCrop.add(who)
  await end('who', whoCrop)

  await rec.click(who.getByRole('button', { name: /^Save 3 selected$/ }))
  await gone(rec, p.getByRole('dialog', { name: 'Who is this rule about?' }), 'who dialog closed')

  // --- if: one condition, then a group of two joined by or -----------------------------------------
  await scroll(rec, body, insp.locator('#bb-sec-if'), { offset: 20 })
  await still(0.3)
  await rec.moveTo(insp.locator('#bb-sec-if'), { ox: 0.85 })
  await still(0.2)
  /* The attribute lists sit inline in the panel; the operator and value
     popover, and the Add menu, open beside it — every one is folded in while
     it is up. */
  const ifLook = () =>
    ifCrop.add(
      ifSec,
      p.locator('.cp__pop'),
      p.getByRole('group', { name: /^(Add a condition|First condition in Group|Add to Group)/ }),
      p.getByRole('menu'),
    )
  const ifCrop = await begin('if', [ifSec])
  // the segment has three conditions to get through: everything but its still ends runs at 0.6
  rec.pace = 0.6
  await condition(rec, p, insp, {
    add: ifSec.getByRole('button', { name: 'Add condition', exact: true }),
    list: p.getByRole('group', { name: 'Add a condition' }),
    attr: 'Network zone',
    op: 'not in zone',
    search: 'office',
    value: 'Office Network',
    scope: ifSec,
    cps: 10,
    look: ifLook,
  })
  await rec.click(ifSec.getByRole('button', { name: 'Add', exact: true }))
  await rec.hold(0.3)
  await ifLook()
  await rec.click(p.getByRole('menuitem', { name: 'Add condition group', exact: true }))
  // pending until its first condition exists (see rule2's r2.4)
  const pending = ifSec.getByRole('group', { name: /^Group [A-Z], not yet created/ })
  await rec.visible(pending)
  await rec.hold(0.6)
  await ifLook()
  await condition(rec, p, insp, {
    add: pending.getByRole('button', { name: 'Choose a condition' }),
    list: p.getByRole('group', { name: /^First condition in Group/ }),
    attr: 'Device profile',
    op: 'does not match',
    search: 'corporate',
    value: 'Corporate managed',
    scope: ifSec,
    look: ifLook,
  })
  const grp = ifSec.getByRole('group', { name: /^Group [A-Z]:/ })
  await rec.visible(grp)
  await condition(rec, p, insp, {
    add: grp.getByRole('button', { name: 'Add condition', exact: true }),
    list: p.getByRole('group', { name: /^Add to Group/ }),
    attr: 'Network zone',
    op: 'in zone',
    search: 'anonym',
    value: 'Anonymizers',
    scope: grp,
    look: ifLook,
  })
  // the group's own joiner appears once it holds two rows; it is a native select
  await rec.select(grp.getByRole('combobox', { name: 'How conditions in this group are joined' }).first(), 'or')
  await rec.hold(0.4)
  await ifLook()
  await end('if', ifCrop)

  // --- then: Allow, a second factor, two specific methods --------------------------------------------
  await scroll(rec, body, insp.locator('#bb-sec-then'), { offset: 16 })
  await still(0.3)
  await rec.moveTo(insp.locator('#bb-sec-then'), { ox: 0.85 })
  await still(0.2)
  const thenCrop = await begin('then', [thenSec])
  /* Allow is pressed even though a blank rule already allows (as r2.7 does):
     the footage plays under "allow, deny, or require a second factor", and a
     segment that opened on the methods would skip the first of the three. */
  await allowSecondFactor(rec, p, insp, {
    always: true,
    look: () => thenCrop.add(thenSec, p.getByRole('listbox', { name: 'Methods accepted' })),
  })
  await end('then', thenCrop)

  // --- board: a second rule to trade places with, the chain folded, rule one selected, no panel --------------
  const addEnd = p.getByRole('button', { name: 'Add a rule at the end', exact: true })
  const fresh = ruleCard(p, 'New rule')
  const first = ruleCard(p, RULE2)
  const second = ruleCard(p, RULE3)
  await chainTo(rec, p, addEnd)
  await rec.click(addEnd)
  await rec.visible(insp)
  await atSlot(rec, fresh, 2)
  await rec.until(async () => (await text(insp.locator('.bb__inspbar > b'))).toLowerCase().startsWith('rule 2'), { seconds: 3, label: 'the panel edits rule 2' })
  await renameRule(rec, insp, RULE3, 40)
  /* Built as rule2's third rule is — one blocked zone, Deny — so the board and
     the review read it as the block its name says, not a blank rule that
     allows everyone. */
  await scroll(rec, body, insp.locator('#bb-sec-if'), { offset: 20 })
  await condition(rec, p, insp, {
    add: ifSec.getByRole('button', { name: 'Add condition', exact: true }),
    list: p.getByRole('group', { name: 'Add a condition' }),
    attr: 'Network zone',
    op: 'in zone',
    search: 'anonym',
    value: 'Anonymizers',
    scope: ifSec,
    cps: 40,
  })
  await scroll(rec, body, insp.locator('#bb-sec-then'), { offset: 16 })
  await rec.click(thenSec.getByRole('radiogroup', { name: 'What happens when this rule matches' }).getByRole('radio', { name: /^Deny\b/ }))
  await still(0.3)
  await clickAway(rec, p)
  await rec.click(density(p, 'Collapse cards'))
  await rec.until(() => density(p, 'Collapse cards').first().isChecked(), { seconds: 3, label: 'Collapse cards is on' })
  await still(0.6)
  // folded, the whole chain fits: back to its top so the start pill is on the stage
  await chainWheelTo(rec, p, 0)
  /* The shortcuts act on the SELECTED rule, and selecting a card always opens
     the panel — the panel is a grid track, so the stage narrows and the
     centred chain slides left under it. Rather than film that slide inside the
     crop, rule one is selected here and ⌘\ (Ctrl+\ — the board's own "Hide the
     panel") takes the panel away while the selection stays. The chain settles
     back before the first frame. */
  await rec.click(first.getByRole('button', { name: RULE2, exact: true }), { hint: false })
  await rec.visible(insp)
  await still(0.4)
  await rec.press('Control+Backslash', { show: false })
  await gone(rec, inspector(p), 'the panel hidden')
  await rec.until(async () => /\bis-selected\b/.test((await first.first().getAttribute('class')) ?? ''), { seconds: 2, label: 'rule one still selected with the panel hidden' })
  await still(0.8)
  await atSlot(rec, first, 1)
  await atSlot(rec, second, 2)
  // the cursor rests on bare stage, left of the column and outside the crop, so no card shows its hover actions
  const stageBox = await rec.rectOf(p.locator('.bb__stage'))
  await rec.glide({ x: stageBox.x + stageBox.width * 0.12, y: stageBox.y + stageBox.height * 0.5 })
  await still(0.2)
  const chain = [p.locator('.bb__start'), p.locator('.bb__card:not(.is-terminal)'), p.locator('.bb__card.is-terminal')]

  const boardCrop = await begin('board', chain, stageBox)
  // about a second of still board before the first press, so it lands after the stage's 0.35 s crossfade
  await rec.hold(0.7)
  await rec.press('Alt+ArrowDown')
  await atSlot(rec, first, 2)
  await atSlot(rec, second, 1)
  await rec.hold(0.8)
  await boardCrop.add(...chain)
  await rec.press('Control+z')
  await atSlot(rec, first, 1)
  await atSlot(rec, second, 2)
  await rec.hold(0.8)
  await boardCrop.add(...chain)
  await end('board', boardCrop)

  // --- review: the dialog reads the two rules back ----------------------------------------------------------
  await clickAway(rec, p)
  const reviewBtn = p.locator('.bbtop__acts').getByRole('button', { name: 'Review & Save' })
  await rec.until(() => reviewBtn.first().isEnabled(), { seconds: 3, label: 'Review & Save is enabled' })
  const rb = await rec.rectOf(reviewBtn)
  // under the button, on the bar's foot, so the click glide is short
  await rec.glide({ x: rb.x + rb.width * 0.3, y: rb.y + rb.height + 36 })
  await still(0.2)
  const review = p.getByRole('dialog', { name: 'Review your policy' })

  const reviewCrop = await begin('review')
  await rec.click(reviewBtn)
  await rec.visible(review)
  // its entrance spring and the rules' staggered fade finish inside this
  await rec.hold(0.6)
  await reviewCrop.add(review)
  await rec.hold(1.9)
  await reviewCrop.add(review)
  await end('review', reviewCrop)

  await rec.click(review.getByRole('button', { name: 'Cancel', exact: true }))
  await gone(rec, p.getByRole('dialog', { name: 'Review your policy' }), 'review dialog closed')

  // --- five segments, in order, each with a crop inside the viewport ---------------------------------
  rec.dry = wasDry
  const WANT = ['who', 'if', 'then', 'board', 'review'].flatMap((id) => [`${id} start`, `${id} end`])
  const got = marks.map((m) => `${m.id} ${m.phase}`)
  if (!sameList(got, WANT)) throw new Error(`part marks are [${got.join(', ')}], want [${WANT.join(', ')}]`)
  for (const { id, rect: r } of marks) {
    if (!(r.width >= 1 && r.height >= 1 && r.x >= 0 && r.y >= 0 && r.x + r.width <= VIEWPORT.width && r.y + r.height <= VIEWPORT.height)) {
      throw new Error(`part "${id}" crop is empty or outside the viewport: ${JSON.stringify(r)}`)
    }
  }
  console.log(`part rects: ${JSON.stringify(Object.fromEntries(marks.filter((m) => m.phase === 'start').map((m) => [m.id, m.rect])))}`)
  console.log(`part stills, in order: ${JSON.stringify(stills)}`)
  await rec.until(async () => sameList(await titles(p), [RULE2, RULE3]), { seconds: 3, label: `rules read [${RULE2}, ${RULE3}] after the undo` })
  await rec.until(async () => (await p.getByRole('dialog').count()) === 0, { seconds: 3, label: 'no dialog open' })
}

/* Capture order (BEATS-v7, "Capture order is not film order"). */
export const TAKES = [
  { name: 'board', chapter: 'board', run: board },
  { name: 'create', chapter: 'create', run: create },
  { name: 'rule1', chapter: 'rule1', run: rule1 },
  { name: 'rule2', chapter: 'rule2', run: rule2 },
  { name: 'order', chapter: 'order', run: order },
  { name: 'save', chapter: 'save', run: save },
  { name: 'showcase', chapter: null, run: showcase },
  // source footage only: the bento slide crops it, the film sequence never plays it
  { name: 'parts', chapter: null, run: parts },
]
