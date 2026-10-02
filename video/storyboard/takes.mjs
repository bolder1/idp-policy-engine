/* -----------------------------------------------------------------------------
   The product takes — the script, as the recorder performs it.

   One browser session, eight takes, in order: the policy created in the first
   take is the one published in the last. Every subtitle is written in the
   product's own words, and every selector was taken from the markup (see the
   inventory notes in SCRIPT.md), not guessed.

   Reading pace: a subtitle stays up for roughly one second per 15 characters,
   and the action under it is paced to match, so nobody has to choose between
   reading and watching.
   -------------------------------------------------------------------------- */

export const POLICY = 'Workday — Finance adaptive access'
export const RULE = 'Finance — off the office network'

const union = (...rs) => {
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  const r = Math.max(...rs.map((r) => r.x + r.width))
  const b = Math.max(...rs.map((r) => r.y + r.height))
  return { x, y, width: r - x, height: b - y }
}
const gone = (rec, loc, label) => rec.until(async () => (await loc.count()) === 0, { seconds: 4, label })
const inspector = (p) => p.getByRole('complementary', { name: 'Inspector' })

/* --- 01 · Create a policy -------------------------------------------------------- */
async function create(rec, p) {
  await rec.hold(0.5)
  rec.say('This is the Policies list. Every sign-in is checked against the policies on the application being opened.')
  await rec.glide({ x: 760, y: 430 }, { seconds: 1.1 })
  await rec.hover(p.locator('tbody tr').nth(2), { seconds: 0.8, ox: 0.22 })
  await rec.hover(p.locator('tbody tr').nth(4), { seconds: 0.8, ox: 0.22 })
  await rec.hover(p.locator('tbody tr').nth(6), { seconds: 1.6, ox: 0.22 })

  const head = await rec.rectOf(p.getByRole('columnheader', { name: /Exposure/ }))
  const cell = await rec.rectOf(p.locator('.btable__exposure').nth(8))
  rec.say('The Exposure column runs a break-in test against every policy, and shows what gets through.')
  await rec.spotlight(union(head, cell), { label: 'Exposure', seconds: 4.6, pad: 8 })
  await rec.hold(5)

  rec.say('Let’s write a new one.')
  await rec.click(p.getByRole('button', { name: 'New policy', exact: true }), { label: 'New policy' })
  const dlg = p.getByRole('dialog', { name: 'Name your policy' })
  await rec.visible(dlg)
  await rec.hold(0.5)
  await rec.focus(dlg, { zoom: 1.5, seconds: 1.0 })
  rec.say('New policy asks two questions. First, a name.')
  await rec.hold(1.2)
  await rec.click(p.locator('#np-name'))
  await rec.type(POLICY, { cps: 17 })
  await rec.hold(0.8)

  rec.say('Then the applications it protects — one policy can cover several.')
  const apps = dlg.getByRole('combobox', { name: 'Applications this policy protects' })
  await rec.click(apps, { label: 'Choose applications' })
  await rec.hold(0.4)
  await rec.click(p.getByRole('textbox', { name: 'Search Applications this policy protects' }))
  await rec.type('work', { cps: 11 })
  await rec.hold(0.6)
  await rec.click(p.getByRole('option', { name: /^Workday/ }), { label: 'Workday' })
  await rec.hold(0.9)
  // a multi-select stays open; its own trigger closes it (Escape here would cancel the dialog)
  await rec.click(apps, { hint: false })
  await rec.hold(1.2)

  rec.say('Rather answer questions? Guided setup writes the rules for you.')
  const guided = dlg.getByRole('button', { name: 'Guided setup' })
  await rec.callout(guided, { text: 'Five questions, rules written for you', side: 'top', seconds: 3.0 })
  await rec.hover(guided, { seconds: 3.2 })

  rec.say('Create it. It starts life as a draft — nothing changes for anyone until you publish.')
  await rec.click(dlg.getByRole('button', { name: 'Create policy' }), { label: 'Create policy' })
  await rec.focus(null, { seconds: 1.0 })
  await rec.visible(p.getByRole('heading', { name: 'How would you like to start?' }), { seconds: 8 })
  await rec.hold(3)
}

/* --- 02 · Start from a template ------------------------------------------------------ */
async function templates(rec, p) {
  rec.say('A new policy asks one question: start from a template, or start from scratch.')
  await rec.hover(p.getByRole('button', { name: /Use a template/ }), { seconds: 2.0 })
  await rec.hover(p.getByRole('button', { name: /Start from scratch/ }), { seconds: 2.0 })
  await rec.hold(0.8)

  rec.say('The template gallery holds ready-made policies — the rules already written, and yours to edit.')
  await rec.click(p.getByRole('button', { name: /Use a template/ }), { label: 'Use a template' })
  const sheet = p.getByRole('dialog', { name: 'Start from a template' })
  await rec.visible(sheet)
  await rec.hold(0.8)
  await rec.focus(sheet, { zoom: 1.12, seconds: 1.0 })
  await rec.hold(3.4)

  rec.say('Templates from miniOrange sit apart from the ones your own team has saved.')
  await rec.spotlight(sheet.getByRole('tablist', { name: 'Whose templates' }), { label: 'Whose templates', seconds: 3.8 })
  await rec.hold(4.2)

  rec.say('Each card is a thumbnail of the policy itself: its rules in order, and the outcome each one lands on.')
  const cards = sheet.locator('article.bgcard')
  await rec.hover(cards.nth(0), { seconds: 2.0, oy: 0.35 })
  await rec.hover(cards.nth(1), { seconds: 2.4, oy: 0.35 })

  rec.say('Filter by what you’re protecting against.')
  await rec.click(sheet.getByRole('combobox', { name: 'Filter by category' }), { label: 'Filter by category' })
  await rec.hold(0.9)
  await rec.click(p.getByRole('option', { name: /^Device-based/ }), { label: 'Device-based' })
  await rec.hold(1.6)
  // four cards now; bring the one we open into view inside the sheet's own scroller
  const zt = cards.filter({ has: p.getByRole('heading', { level: 3, name: 'Zero-Trust baseline', exact: true }) })
  await rec.scrollTo(sheet.locator('.bmarket__work'), zt, { offset: 30, seconds: 0.8 })
  await rec.hover(zt, { seconds: 1.8, oy: 0.35 })

  rec.say('Open any template to read every rule before you use it.')
  await rec.click(zt.getByRole('button', { name: 'Preview the rules in Zero-Trust baseline' }), { label: 'Preview' })
  const prev = p.getByRole('dialog', { name: 'Zero-Trust baseline' })
  await rec.visible(prev)
  await rec.hold(0.6)
  await rec.focus(prev, { zoom: 1.35, seconds: 1.0 })
  await rec.hold(2.2)

  rec.say('Rules are evaluated top to bottom. The first one that matches decides, and the rest are skipped.')
  await rec.spotlight(prev.locator('.bprev__stack'), { seconds: 5.0 })
  await rec.hold(5.4)

  rec.say('The last row is what happens to everyone the rules don’t catch.')
  await rec.spotlight(prev.locator('.bprev__node--default'), { seconds: 3.6 })
  await rec.hold(4.0)

  await rec.click(prev.locator('.bx-modal__foot').getByRole('button', { name: 'Close' }), { label: 'Close' })
  await gone(rec, p.locator('.bx-scrim'), 'preview closed')
  await rec.focus(sheet, { zoom: 1.12, seconds: 0.9 })
  await rec.hold(0.6)

  rec.say('Or search by name.')
  const q = sheet.getByRole('searchbox', { name: 'Search the gallery' })
  await rec.click(q)
  await rec.type('block', { cps: 9 })
  await rec.hold(2.4)
  await rec.press('Control+a', { show: false })
  await rec.press('Backspace', { show: false })
  await rec.hold(0.8)

  rec.say('Your team’s own templates have a shelf of their own.')
  await rec.click(sheet.getByRole('tab', { name: /^Your templates/ }), { label: 'Your templates' })
  await rec.hold(3.2)
  await rec.click(sheet.getByRole('tab', { name: /^Xecurify templates/ }), { label: 'Xecurify templates' })
  await rec.hold(1.2)

  rec.say('Using a template is one click, and one undo. This time, let’s build our own.')
  await rec.focus(null, { seconds: 0.9 })
  await rec.hold(0.8)
  await rec.click(p.getByRole('button', { name: 'Close the gallery' }), { label: 'Close the gallery' })
  await rec.hold(2.0)

  rec.say('Start from scratch puts a blank rule on the canvas, already open in the panel.')
  await rec.click(p.getByRole('button', { name: /Start from scratch/ }), { label: 'Start from scratch' })
  await rec.visible(inspector(p))
  await rec.hold(4.0)
}

/* --- 03 · Build a rule — Who ------------------------------------------------------- */
async function who(rec, p) {
  const insp = inspector(p)
  /* The canvas fitted itself before the panel slid in, which leaves the chain
     half under the stage's left edge — and the card is where Who, If and Then
     are read back. Refit it beside the panel before building anything. */
  await rec.click(p.getByRole('toolbar', { name: 'View' }).getByRole('button', { name: 'Fit the chain in view' }), { hint: false })
  await rec.hold(0.8)
  rec.say('The panel edits the selected rule — Who, If and Then, in the order a rule is written.')
  await rec.spotlight(insp, { label: 'The panel', seconds: 4.4, pad: 4 })
  await rec.hold(4.8)

  rec.say('Give the rule a name. The card on the canvas updates as you type.')
  await rec.click(insp.getByRole('textbox', { name: 'Rule name' }), { label: 'Rule name' })
  await rec.press('Control+a', { show: false })
  await rec.type(RULE, { cps: 16 })
  await rec.hold(0.4)
  await rec.callout(p.locator('.bb__card').first().locator('.bb__titlebtn'), { text: 'Renamed as you type', side: 'top', seconds: 2.4 })
  await rec.hold(0.6)
  await rec.click(insp.locator('.bb__inspbar > b'), { hint: false })
  await rec.hold(1.8)

  const whoSec = insp.getByRole('region', { name: 'Who', exact: true })
  rec.say('Who starts as everyone this policy governs. Narrow it only when you need to.')
  await rec.spotlight(whoSec, { seconds: 4.2 })
  await rec.hold(4.6)

  rec.say('Choose people opens the directory.')
  await rec.click(whoSec.getByRole('button', { name: 'Choose people' }), { label: 'Choose people' })
  const dlg = p.getByRole('dialog', { name: 'Who is this rule about?' })
  await rec.visible(dlg)
  await rec.hold(0.5)
  await rec.focus(dlg, { zoom: 1.45, seconds: 1.0 })
  await rec.hold(1.4)

  rec.say('Pick groups — a group follows whoever is in it on the day.')
  await rec.click(dlg.getByRole('checkbox', { name: /^Finance\b/ }), { label: 'Finance' })
  await rec.hold(1.0)
  await rec.click(dlg.getByRole('checkbox', { name: /^Executives\b/ }), { label: 'Executives' })
  await rec.hold(2.2)

  rec.say('Or switch to People to name someone specific.')
  await rec.click(dlg.getByRole('radio', { name: /^People/ }), { label: 'People' })
  await rec.hold(0.5)
  await rec.click(dlg.getByRole('searchbox', { name: 'Search people' }))
  await rec.type('priya', { cps: 10 })
  await rec.hold(2.2)
  await rec.click(dlg.getByRole('radio', { name: /^Groups/ }), { label: 'Groups' })
  await rec.hold(1.0)

  rec.say('Save, and the rule is about exactly those groups.')
  await rec.click(dlg.getByRole('button', { name: /^Save \d+ selected$/ }), { label: 'Save' })
  await gone(rec, p.getByRole('dialog', { name: 'Who is this rule about?' }), 'who dialog closed')
  await rec.focus(null, { seconds: 0.9 })
  await rec.hover(whoSec.locator('.bb__whosum'), { seconds: 2.4 })

  rec.say('Switch the canvas to Detailed, and the card shows who the rule is about.')
  await rec.click(p.getByRole('radio', { name: 'Detailed' }), { label: 'Detailed' })
  await rec.hold(0.9)
  await rec.spotlight(p.locator('.bb__card').first(), { seconds: 3.4 })
  await rec.hold(3.8)
}

/* --- 03 · Build a rule — If ---------------------------------------------------------- */
async function condition(rec, p) {
  const insp = inspector(p)
  const body = insp.locator('.bb__inspbody')
  const ifSec = insp.getByRole('region', { name: 'If', exact: true })
  await rec.scrollTo(body, insp.locator('#bb-sec-if'), { offset: 20 })
  await rec.hold(0.5)

  rec.say('If says when the rule applies. With no conditions, it catches every sign-in that reaches it.')
  await rec.spotlight(ifSec, { seconds: 4.6 })
  await rec.hold(5.0)

  rec.say('Add a condition, and everything a rule can check is in one short list.')
  await rec.click(ifSec.getByRole('button', { name: 'Add condition', exact: true }), { label: 'Add condition' })
  const cat = p.getByRole('group', { name: 'Add a condition' })
  await rec.visible(cat)
  await rec.hold(0.4)
  await rec.spotlight(cat, { label: 'Networks, devices, time, risk and more', seconds: 4.0 })
  await rec.hold(4.4)

  rec.say('A condition is three decisions: what to check, how to compare it, and what to compare it against.')
  await rec.click(cat.getByRole('button', { name: 'Network zone', exact: true }), { label: 'Network zone' })
  const pop = p.locator('.cp__pop')
  await rec.hold(0.6)
  await rec.click(pop.getByRole('option', { name: 'not in zone', exact: true }), { label: 'not in zone' })
  await rec.hold(1.0)

  rec.say('Networks and places come from your Zones library — here, anywhere but the Office Network.')
  await rec.click(p.getByRole('textbox', { name: 'Search Network zone' }))
  await rec.type('office', { cps: 10 })
  await rec.hold(0.6)
  await rec.click(pop.getByRole('checkbox', { name: /^Office Network/ }), { label: 'Office Network' })
  await rec.hold(1.6)
  await rec.click(insp.locator('#bb-sec-if'), { hint: false })
  await rec.hold(0.8)

  rec.say('The card reads the condition back the moment it’s set.')
  await rec.spotlight(p.locator('.bb__card').first().locator('.bb__if'), { seconds: 3.6 })
  await rec.hold(4.0)

  rec.say('Add a second check: a device that isn’t one of your corporate managed ones.')
  await rec.click(ifSec.locator('.bb__iffoot .bx-menu__trigger'), { label: 'Add' })
  await rec.click(p.getByRole('menuitem', { name: 'Add condition', exact: true }), { label: 'Add condition' })
  await rec.click(p.getByRole('group', { name: 'Add a condition' }).getByRole('button', { name: 'Device profile', exact: true }), { label: 'Device profile' })
  await rec.hold(0.5)
  await rec.click(pop.getByRole('option', { name: 'does not match', exact: true }), { label: 'does not match' })
  await rec.hold(0.6)
  await rec.click(p.getByRole('textbox', { name: 'Search Device profile' }))
  await rec.type('corporate', { cps: 12 })
  await rec.hold(0.5)
  await rec.click(pop.getByRole('checkbox', { name: /^Corporate managed/ }), { label: 'Corporate managed' })
  await rec.hold(1.4)
  await rec.click(insp.locator('#bb-sec-if'), { hint: false })
  await rec.hold(1.0)

  /* The joiner stays on AND. Flipping it to OR on camera misleads at tour
     depth: Who is stored as conditions in the same run, so OR also loosens who
     the rule is about, and the Who section stands down to say so ("Who has more
     than one place to be"). Correct product behaviour, wrong lesson here. */
  const join = ifSec.getByRole('combobox', { name: 'How conditions in this rule are joined' })
  rec.say('The two checks join with AND, so both must hold: off the network, and on an unmanaged device.')
  await rec.spotlight(join, { seconds: 3.4, pad: 8 })
  await rec.hold(1.2)
  await rec.callout(p.locator('.bb__card').first().locator('.bb__ifkw.is-and').first(), { text: 'The card reads it back', side: 'right', seconds: 2.8 })
  await rec.hold(3.6)
}

/* --- 03 · Build a rule — Then ---------------------------------------------------------- */
async function then(rec, p) {
  const insp = inspector(p)
  const body = insp.locator('.bb__inspbody')
  await rec.scrollTo(body, insp.locator('#bb-sec-then'), { offset: 16 })
  await rec.hold(0.4)

  const decide = insp.getByRole('radiogroup', { name: 'What happens when this rule matches' })
  rec.say('Then is what happens when the rule matches: Allow, Require a second factor, or Deny.')
  await rec.spotlight(decide, { seconds: 4.2 })
  await rec.hover(decide.getByRole('radio', { name: 'Allow', exact: true }), { seconds: 1.2 })
  await rec.hover(decide.getByRole('radio', { name: 'Deny', exact: true }), { seconds: 1.2 })
  await rec.hold(1.6)

  rec.say('Off the network, on an unmanaged device, we’ll ask for a second factor.')
  await rec.click(decide.getByRole('radio', { name: 'Require a second factor', exact: true }), { label: 'Require a second factor' })
  await rec.hold(2.2)

  rec.say('Choose specific methods, and the builder won’t let the rule lock everyone out until you name one.')
  await rec.click(insp.getByRole('combobox', { name: 'Second step' }), { label: 'Prove it with' })
  await rec.click(p.getByRole('option', { name: /^Specific methods/ }), { label: 'Specific methods' })
  await rec.hold(0.7)
  await rec.spotlight(insp.getByRole('alert'), { seconds: 3.4, pad: 6 })
  await rec.hold(3.8)

  rec.say('Pick the methods that count — miniOrange Push, or a TOTP authenticator.')
  const methods = insp.getByRole('combobox', { name: 'Methods accepted' })
  await rec.click(methods, { label: 'Methods accepted' })
  const lb = p.getByRole('listbox', { name: 'Methods accepted' })
  await rec.click(lb.getByRole('option', { name: /^miniOrange Push/ }), { label: 'miniOrange Push' })
  await rec.hold(0.6)
  await rec.click(lb.getByRole('option', { name: /^TOTP Authenticator/ }), { label: 'TOTP Authenticator' })
  await rec.hold(1.0)
  /* The multi-select stays open, and near the foot of the panel it flips
     upward over its own trigger — so it is closed with an outside click on the
     panel's bar, which nothing can cover and which changes nothing. */
  await rec.click(insp.locator('.bb__inspbar > b'), { hint: false })
  await gone(rec, p.getByRole('listbox', { name: 'Methods accepted' }), 'methods list closed')
  await rec.hold(1.4)

  rec.say('Remember a verified device, so people aren’t asked on every sign-in.')
  await rec.scrollTo(body, insp.getByRole('switch', { name: 'Remember this device' }), { offset: 180 })
  await rec.click(insp.getByRole('switch', { name: 'Remember this device' }), { label: 'Remember this device' })
  await rec.hold(0.6)
  await rec.click(insp.getByRole('spinbutton', { name: 'Days to remember' }))
  await rec.press('Control+a', { show: false })
  await rec.type('14', { cps: 6 })
  await rec.click(insp.locator('.bb__second__head'), { hint: false })
  await rec.hold(1.6)

  rec.say('The card now tells the whole story: who, when, and the exact journey they’ll walk.')
  const card = p.locator('.bb__card').first()
  await rec.focus(card, { zoom: 1.6, seconds: 1.1 })
  await rec.hold(1.2)
  await rec.spotlight(card.locator('[aria-label="The sign-in journey this produces"]'), { seconds: 4.0, pad: 8 })
  await rec.hold(4.8)
  await rec.focus(null, { seconds: 1.0 })
  await rec.hold(0.8)
}

/* --- 04 · Tour the canvas -------------------------------------------------------------- */
async function canvas(rec, p) {
  const insp = inspector(p)
  const view = p.getByRole('toolbar', { name: 'View' })

  rec.say('Now the canvas itself. Close the panel to give it the whole board.')
  await rec.click(insp.getByRole('button', { name: 'Close the panel' }), { label: 'Close the panel' })
  await rec.hold(1.6)

  const s = await rec.rectOf(p.locator('.bb__stage'))
  rec.say('Drag the background to move around…')
  await rec.drag({ x: s.x + s.width * 0.84, y: s.y + s.height * 0.6 }, { x: s.x + s.width * 0.66, y: s.y + s.height * 0.46 }, { seconds: 1.2 })
  await rec.hold(0.8)

  rec.say('…hold Ctrl and scroll to zoom in on a rule…')
  const c = await rec.rectOf(p.locator('.bb__card').first())
  await rec.wheel(-240, { at: { x: c.x + c.width * 0.5, y: c.y + 40 }, ctrl: true, seconds: 1.1 })
  await rec.hold(1.0)
  await rec.click(view.getByRole('button', { name: 'Zoom out' }), { label: 'Zoom out' })
  await rec.click(view.getByRole('button', { name: 'Zoom out' }), { hint: false })
  await rec.hold(0.8)

  rec.say('…and fit the whole chain back in view with one click.')
  await rec.click(view.getByRole('button', { name: 'Fit the chain in view' }), { label: 'Fit' })
  await rec.hold(2.0)

  rec.say('Outline shows just the order, at a glance…')
  await rec.click(p.getByRole('radio', { name: 'Outline' }), { label: 'Outline' })
  await rec.hold(2.4)
  rec.say('…Detailed shows what every rule checks.')
  await rec.click(p.getByRole('radio', { name: 'Detailed' }), { label: 'Detailed' })
  await rec.hold(2.4)

  rec.say('Every chain starts where a sign-in arrives — here, at Workday.')
  await rec.spotlight(p.locator('.bb__start'), { seconds: 3.4, pad: 10 })
  await rec.hold(3.8)

  rec.say('And every chain ends at the default. Whatever no rule caught lands here — its place is fixed, what it does is yours.')
  await rec.spotlight(p.getByRole('group', { name: 'Nothing else matched' }), { seconds: 5.6, pad: 8 })
  await rec.hold(6.0)

  /* Added at the end and moved up with the card's own arrow — the story the
     right way round: move the catch-all first, then watch it hide the rule
     below. Not dragged, because the board's drag is broken twice over. Its
     slots come from refs filled only at mount (motion.div memoises the ref
     callback), so after an insert above a rule a drag across it snaps back.
     And when the slot does change, the held card's wrapper animates to the new
     slot while its pointer offset is still measured from the old one, so the
     card leaves the pointer and vanishes until release. Both flagged. */
  rec.say('The plus on any connector inserts a rule exactly there.')
  const ins = p.getByRole('button', { name: 'Add a rule at the end', exact: true })
  await rec.hover(ins, { seconds: 1.8 })
  await rec.click(ins, { label: 'Insert here' })
  await rec.hold(1.2)
  await rec.click(insp.getByRole('button', { name: 'Close the panel' }), { hint: false })
  await rec.hold(1.0)

  const nr = p.getByRole('group', { name: 'New rule', exact: true })
  const atSlot = (loc, n) =>
    rec.until(async () => (await loc.getByRole('button', { name: new RegExp(`^Reorder rule ${n} `) }).count()) > 0, { seconds: 3, label: `${String(loc)} at rule ${n}` })
  await atSlot(nr, 2)

  rec.say('The arrows on a card move it up or down the chain. The order is the policy.')
  await rec.hover(nr, { seconds: 1.0, ox: 0.6, oy: 0.3 })
  await rec.click(nr.getByRole('button', { name: 'Move up' }), { label: 'Move up' })
  await atSlot(nr, 1)
  await rec.hold(2.2)

  rec.say('A rule with no conditions now sits first, so it catches everything. Hover it, and the rule it hides fades — the first match wins.')
  await rec.hover(nr, { seconds: 5.2, ox: 0.5, oy: 0.3 })

  rec.say('Hover a card for its quick actions: duplicate it…')
  await rec.hover(nr, { seconds: 1.0, ox: 0.6, oy: 0.3 })
  await rec.click(nr.getByRole('button', { name: 'Duplicate rule' }), { label: 'Duplicate' })
  await rec.hold(1.8)
  const copy = p.getByRole('group', { name: 'New rule (copy)', exact: true })
  rec.say('…or switch it off without deleting it.')
  await rec.hover(copy, { seconds: 0.8, ox: 0.6, oy: 0.3 })
  await rec.click(copy.getByRole('switch', { name: /is on$/ }), { label: 'Switch off' })
  await rec.hold(2.0)

  rec.say('Nothing is final: Undo and Redo step through every edit in the draft.')
  await rec.click(view.getByRole('button', { name: 'Undo' }), { label: 'Undo' })
  await rec.hold(1.8)
  await rec.click(view.getByRole('button', { name: 'Redo' }), { label: 'Redo' })
  await rec.hold(1.8)

  /* Deleted explicitly and checked here — and checked again after the
     shortcut beat's Ctrl + Z below, which once undid this very delete. */
  rec.say('And a rule you don’t need is one click from gone.')
  await rec.hover(copy, { seconds: 0.8, ox: 0.6, oy: 0.3 })
  await rec.click(copy.getByRole('button', { name: 'Delete rule' }), { label: 'Delete' })
  await gone(rec, copy, 'the copy deleted')
  await rec.hold(1.6)

  rec.say('Every edit has a shortcut. Alt and an arrow key move the selected rule…')
  await rec.click(p.getByRole('button', { name: 'New rule', exact: true }), { label: 'Select' })
  await rec.hold(1.0)
  /* Down, because New rule is first. Alt + ↑ on the top rule is a no-op that
     writes no history, so the Ctrl + Z after it undid the copy's DELETE and
     carried a stray rule into the test and publish chapters. */
  await rec.press('Alt+ArrowDown', { label: 'Move rule down' })
  await atSlot(nr, 2)
  await rec.hold(2.2)
  rec.say('…and Ctrl + Z puts it back.')
  await rec.press('Control+z', { label: 'Undo' })
  await atSlot(nr, 1)
  await gone(rec, copy, 'the copy still deleted after the undo')
  await rec.hold(2.2)

  rec.say('The panel narrows, widens, drags to any width — or hides with Ctrl + backslash.')
  await rec.click(insp.getByRole('button', { name: 'Narrow the panel' }), { label: 'Narrow' })
  await rec.hold(1.2)
  await rec.click(insp.getByRole('button', { name: 'Widen the panel' }), { label: 'Widen' })
  await rec.hold(1.0)
  const g = await rec.rectOf(p.getByRole('separator', { name: 'Resize the inspector' }))
  const gy = g.y + Math.min(g.height / 2, 300)
  await rec.drag({ x: g.x + g.width / 2, y: gy }, { x: g.x + g.width / 2 - 120, y: gy }, { seconds: 1.0 })
  await rec.hold(0.8)
  await rec.press('Control+Backslash', { label: 'Hide the panel' })
  await rec.hold(1.6)
  await rec.press('Control+Backslash', { label: 'Show the panel' })
  await rec.hold(1.6)

  rec.say('Press the question mark to see every shortcut on one card.')
  await rec.press('?', { label: 'Keyboard shortcuts' })
  const keys = p.getByRole('dialog', { name: 'Keyboard' })
  await rec.visible(keys)
  await rec.hold(0.4)
  await rec.focus(keys, { zoom: 1.4, seconds: 0.9 })
  await rec.hold(4.0)
  await rec.click(keys.getByRole('button', { name: 'Close' }), { hint: false })
  await gone(rec, p.getByRole('dialog', { name: 'Keyboard' }), 'keyboard sheet closed')
  await rec.focus(null, { seconds: 0.9 })
  await rec.hold(0.6)

  rec.say('Try to leave with unpublished changes, and the board asks first.')
  await rec.click(p.getByRole('button', { name: 'Back to policies' }), { label: 'Back to policies' })
  const leave = p.getByRole('dialog', { name: 'Leave without publishing?' })
  await rec.visible(leave)
  await rec.hold(0.4)
  await rec.focus(leave, { zoom: 1.5, seconds: 0.9 })
  await rec.hold(3.2)
  await rec.click(leave.getByRole('button', { name: 'Keep editing' }), { label: 'Keep editing' })
  await gone(rec, p.getByRole('dialog', { name: 'Leave without publishing?' }), 'leave dialog closed')
  await rec.focus(null, { seconds: 0.9 })
  await rec.hold(0.6)

  rec.say('Let’s clear that extra rule away before we test.')
  await rec.click(p.getByRole('button', { name: 'New rule', exact: true }), { label: 'Select' })
  await rec.hold(0.8)
  await rec.press('Delete', { label: 'Delete rule' })
  await gone(rec, p.getByRole('group', { name: 'New rule', exact: true }), 'the extra rule deleted')
  // what the test chapter starts from: the one rule this film built, then the default
  await rec.until(async () => (await p.locator('.bb__card:not(.is-terminal)').count()) === 1, { seconds: 2, label: 'only the Finance rule left' })
  await rec.hold(2.2)
}

/* --- 05 · Test before you publish ---------------------------------------------------------- */
async function test(rec, p) {
  const acts = p.locator('.bbtop__acts')
  const pips = acts.locator('.bb__pip')
  const both = union(await rec.rectOf(pips.nth(0)), await rec.rectOf(pips.nth(1)))
  rec.say('The top bar grades the draft as you work: the Break-in test result, and how much this draft changes.')
  await rec.focus(both, { zoom: 1.7, seconds: 1.0 })
  await rec.hold(0.6)
  await rec.spotlight(both, { seconds: 4.4, pad: 8 })
  await rec.hold(5.0)
  await rec.focus(null, { seconds: 0.9 })

  rec.say('Open Check to rehearse a sign-in.')
  await rec.click(acts.getByRole('button', { name: /^Check/ }), { label: 'Check' })
  const sheet = p.getByRole('region', { name: 'Checks and impact' })
  await rec.visible(sheet)
  await rec.hold(1.4)

  rec.say('Pick a person and a situation: Mehak, from Executives, off the network, on a device we’ve never seen.')
  await rec.click(sheet.getByRole('radiogroup', { name: 'Who' }).getByRole('radio', { name: /^Mehak/ }), { label: 'Mehak · Executives' })
  await rec.click(sheet.getByRole('radiogroup', { name: 'From' }).getByRole('radio', { name: 'Off-network', exact: true }), { label: 'Off-network' })
  await rec.click(sheet.getByRole('radiogroup', { name: 'Device' }).getByRole('radio', { name: 'New device', exact: true }), { label: 'New device' })
  await rec.hold(1.2)

  rec.say('Rehearse it, and watch the sign-in fall through the rules until one decides.')
  await rec.click(sheet.getByRole('button', { name: 'Rehearse it' }), { label: 'Rehearse it' })
  await rec.step(2)
  // the sheet closes on Escape alone; the rehearsal stays on the chain
  await rec.press('Escape', { show: false })
  await rec.hold(4.2)

  rec.say('The verdict names the outcome — and the rule that decided it.')
  await rec.click(acts.getByRole('button', { name: /^Check/ }), { label: 'Check' })
  await rec.visible(sheet)
  await rec.hold(1.6)
  await rec.spotlight(sheet.locator('.bb__result'), { seconds: 3.8, pad: 8 })
  await rec.hold(4.2)

  rec.say('From the office, on a managed laptop, no rule matches — so the default at the bottom decides.')
  await rec.click(sheet.getByRole('radiogroup', { name: 'From' }).getByRole('radio', { name: 'Office', exact: true }), { label: 'Office' })
  await rec.click(sheet.getByRole('radiogroup', { name: 'Device' }).getByRole('radio', { name: 'Managed', exact: true }), { label: 'Managed' })
  await rec.click(sheet.getByRole('button', { name: 'Run it again' }), { label: 'Run it again' })
  await rec.step(2)
  await rec.press('Escape', { show: false })
  await rec.hold(4.4)

  rec.say('The Break-in test deals 13 sign-in attempts at your rules — 7 of them hostile — and grades what gets through.')
  await rec.click(acts.getByRole('button', { name: /^Check/ }), { label: 'Check' })
  await rec.visible(sheet)
  await rec.hold(0.9)
  await rec.click(sheet.getByRole('button', { name: /^Try a sign-in/ }), { hint: false })
  await rec.hold(1.0)
  const gradeRect = union(await rec.rectOf(sheet.getByLabel(/^Grade [A-F]$/)), await rec.rectOf(sheet.locator('.bb__tally')))
  await rec.spotlight(gradeRect, { seconds: 4.4, pad: 12 })
  await rec.hold(4.8)

  rec.say('Every attempt that gets through explains itself — and offers the rule that closes it, previewed before you apply it.')
  const breach = sheet.locator('.bb__round.is-breach > button[aria-expanded]')
  const tor = breach.filter({ hasText: 'Executive account from a Tor exit' })
  const row = (await tor.count()) ? tor : breach.first()
  await rec.click(row, { label: 'Got through' })
  await rec.hold(1.0)
  const fix = sheet.locator('.bb__fix').first()
  await rec.scrollTo(sheet.locator('.bb__sheetbody'), fix, { offset: 30 })
  await rec.spotlight(fix, { seconds: 5.0, pad: 8 })
  await rec.hold(5.4)

  rec.say('Add it in one click. It lands in the right place, and the grade updates.')
  await rec.click(sheet.getByRole('button', { name: /^(Add this rule|Change that rule)$/ }).first(), { label: 'Add this rule' })
  await rec.hold(1.4)
  await rec.spotlight(acts.locator('.bb__pip').first(), { seconds: 3.0, pad: 8 })
  await rec.hold(3.4)

  rec.say('What changes compares this draft with what’s published, across 1,440 modelled sign-ins.')
  await rec.click(sheet.getByRole('tab', { name: 'What changes' }), { label: 'What changes' })
  await rec.hold(1.4)
  await rec.spotlight(sheet.locator('.bb__impacthead'), { seconds: 4.2, pad: 10 })
  await rec.hold(4.6)

  rec.say('Every dot is one situation. Focus on Tor, then pick a dot to see exactly why it lands where it does.')
  const body = sheet.locator('.bb__sheetbody')
  const focusOn = sheet.getByRole('group', { name: 'Focus on' })
  await rec.scrollTo(body, focusOn, { offset: 20, seconds: 1.0 })
  await rec.click(focusOn.getByRole('button', { name: 'Tor', exact: true }), { label: 'Tor' })
  await rec.hold(1.2)
  // Mehak's Tor rows sit two-thirds of the way down a 40-row field: bring them up first
  const dot = sheet.locator('[data-dot="946"]')
  await rec.scrollTo(body, dot, { offset: 150, seconds: 1.0 })
  await rec.hold(0.6)
  await rec.click(dot, { label: 'Mehak · Tor' })
  await rec.hold(0.8)
  await rec.scrollTo(body, sheet.locator('.bb__situation'), { offset: 70, seconds: 0.8 })
  await rec.spotlight(sheet.locator('.bb__situation'), { seconds: 4.4, pad: 8 })
  await rec.hold(4.8)

  rec.say('Further down: who moved, which rule decides what, and the guarantees this draft keeps — or loses.')
  await rec.scrollTo(body, sheet.getByRole('button', { name: /^Guarantees/ }), { offset: 40, seconds: 2.6 })
  await rec.hold(3.6)
  await rec.press('Escape', { show: false })
  await rec.hold(1.4)
}

/* --- 06 · Review & publish ------------------------------------------------------------------ */
async function publish(rec, p) {
  rec.say('When it’s ready, Review & publish reads every rule back in plain English.')
  await rec.click(p.locator('.bbtop__acts').getByRole('button', { name: 'Review & publish' }), { label: 'Review & publish' })
  const dlg = p.getByRole('dialog', { name: 'Review your policy' })
  await rec.visible(dlg)
  await rec.hold(0.6)
  await rec.focus(dlg, { zoom: 1.35, seconds: 1.0 })
  await rec.hold(3.0)

  rec.say('Who, when and what happens — exactly as the engine will run it.')
  await rec.spotlight(dlg.locator('.bdlg-rev__rules > li').nth(1), { seconds: 4.0, pad: 8 })
  await rec.hold(4.4)

  rec.say('Confirm, and it’s published.')
  await rec.click(dlg.getByRole('button', { name: 'Confirm & Save' }), { label: 'Confirm & Save' })
  rec.sfx('success')
  await rec.focus(null, { seconds: 1.0 })
  /* The product's own toast says what happened, and it sits low, off to the
     right of centre — exactly under the subtitle band. The subtitle steps aside
     while the toast is up, so the product gets to say it. */
  rec.say(null)
  const toast = p.locator('.bshell__toast')
  await rec.visible(toast, { seconds: 3 })
  // Confirm & Save left the cursor exactly where the callout's pointer lands
  const tr = await rec.rectOf(toast)
  await rec.glide({ x: tr.x + tr.width + 60, y: tr.y - 150 }, { seconds: 0.5 })
  await rec.callout(toast, { text: 'Published', side: 'top', seconds: 2.0 })
  await rec.hold(2.3)
  rec.say('A draft becomes a real policy — switched off until you turn it on.')
  await rec.spotlight(p.locator('.bbtop .bx-status'), { label: 'Draft → Inactive', seconds: 3.4, pad: 8 })
  await rec.hold(3.8)

  rec.say('Back on the list, it’s waiting for you — its application, its status, and its rules.')
  await rec.click(p.getByRole('button', { name: 'Back to policies' }), { label: 'Back to policies' })
  const row = p.locator('tbody tr', { hasText: POLICY })
  await rec.visible(row, { seconds: 8 })
  // the click leaves the cursor over the sidebar's Dashboard item; rest it on the row being shown
  await rec.hover(row, { seconds: 0.7, ox: 0.62 })
  await rec.hold(0.3)
  await rec.spotlight(row.locator('td').first(), { seconds: 5.0, pad: 6 })
  await rec.hold(0.9)
  await rec.callout(row.locator('.bx-status'), { text: 'Ready to switch on', side: 'top', seconds: 3.4 })
  await rec.hold(4.6)
}

export const TAKES = [
  { name: 'create', chapter: 'create', run: create },
  { name: 'templates', chapter: 'templates', run: templates },
  { name: 'who', chapter: 'rule', run: who },
  { name: 'condition', chapter: 'rule', run: condition },
  { name: 'then', chapter: 'rule', run: then },
  { name: 'canvas', chapter: 'canvas', run: canvas },
  { name: 'test', chapter: 'test', run: test },
  { name: 'publish', chapter: 'publish', run: publish },
]
