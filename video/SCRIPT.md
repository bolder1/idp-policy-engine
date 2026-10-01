# Policy Engine — the flow builder, end to end

**Demo video script** · 8 min 58 s · 1920×1080, 30 fps · burned-in subtitles + `.srt` · music and interface sound

This is the script the video is built from, not a description written afterwards. The
product scenes are performed live against the running app by `video/storyboard/takes.mjs`,
and every subtitle below is the exact text the video shows.

---

## How it looks and sounds

| | |
|---|---|
| **Structure** | Six animated slides, then six chapters, each opened by a chapter card. The rule chapter is split into three steps — **Who**, **If**, **Then** — each with its own step card. A closing slide. |
| **The product** | The real console, driven in a real browser and filmed frame by frame on a stopped clock, so every spring and fade is smooth. It sits in a light browser window on the console's dot-grid ground. |
| **The cursor** | Always visible: an arrow that glides on a curve and presses down on every click. |
| **Click cues** | Before each click the target gets an outline and a pulsing ring. Key clicks also show a label bubble with a pointer, e.g. **Click · New policy**. After the click, a ripple. |
| **Camera** | Eases in on the part being explained (dialogs, panels, the card's journey) and back out. It never cuts. |
| **Highlights** | A spotlight dims everything but one region and names it. Callouts point at a detail. Keycaps appear for shortcuts. |
| **Chapters** | A chip top-left names the chapter. A rail along the bottom edge shows progress, with a tick per chapter. |
| **Subtitles** | Bottom centre, one or two lines, timed to reading pace (about 15 characters a second). |
| **Sound** | A calm D-major bed at 96 BPM (pads, a soft pluck, light percussion) that thins under explanation and opens up on the cards. Soft clicks, key ticks while typing, whooshes on transitions, a chime on each spotlight, and a small arpeggio on publish. All of it is synthesised in code, with no samples and no services. |
| **Colour** | The console's own tokens: ink and grey for structure, green/amber/red only where the colour *is* the outcome, and orange kept to one accent. |

**Edition.** The prototype boots in its *Lite* edition, which hides Check, Break-in test,
What changes and the *Review & publish* gate. The recorder switches the store to *Full*
through its own `setEdition` (the Lite/Full switch is commented out of the shell), so the
video shows the whole engine. No product code is changed. The persona pill in the top bar
is hidden for the film because it is prototype furniture.

---

## Opening — six slides (~50 s)

| # | Slide | What moves | Subtitle |
|---|---|---|---|
| 1 | **Policy Engine** · *The flow builder, end to end* | The wordmark and title rise. **Who · If · Then** pills pop in. On the right, a live mini-board: the start pill *A sign-in arrives at Workday*, three rule cards and the locked default spring into a chain. An orange sign-in token falls: *Did not match* on rule 1, then *Matched* with an amber glow on rule 2, and everything below dims. A cursor glides in and clicks the matched card. | Xecurify Policy Engine — the flow builder, from a blank policy to a published one. |
| 2 | **Every sign-in gets a decision.** | Dashed lanes draw in. Nine sign-in chips (a face, a name, *Workday · Office*, *Jira · Tor*…) travel into a dark policy node that pulses as each one enters, then fly out to three bins, **Allow**, **Second factor** and **Deny**, whose counters tick up. | Every sign-in to every application gets a decision: let them in, ask for a second factor, or refuse. |
| 3 | **Top to bottom. First match wins.** | A chain of three rules on Salesforce. The token falls past two *Did not match* rules and lands on the third. Then a cursor grabs rule 3 by its handle and drags it to the top, and the cards spring into their new order. The token falls again and now lands on rule 1. | A policy is an ordered list of rules. The first rule that matches decides the sign-in. · Move a rule, and you change what the policy does. The order is the policy. |
| 4 | **Every rule answers three questions.** | Three tiles assemble. **Who**: three avatars pop in (*Finance, Executives and Priya Sharma*). **If**: two condition rows wipe in (*Network zone · not in zone · Office Network*, **AND**, *Device profile · does not match · Corporate managed*). **Then**: three outcome tiles, and a cursor clicks *Require a second factor* (amber). The journey then builds step by step: *Password → miniOrange Push → Signed in*. | Every rule answers three questions — who it's about, when it applies, and what happens then. |
| 5 | **Rehearse it. Attack it. See what changes.** | Three panels. **Try a sign-in**: a token loops down a mini-chain and lands on rule 2. **Break-in test**: the grade tile flips from red **F** to green **A**, and *3 got through* becomes *Nothing got through*. **What changes**: a 360-dot field where a band of situations turns red and gets ringed, while the counter runs to *576 of 1,440 situations change*. | And before anything goes live, you can rehearse a sign-in, attack the policy, and see exactly what changes. |
| 6 | **From blank to published.** | Six numbered stops slide in down a timeline that draws itself: Create a policy · Start from a template · Build a rule · Tour the canvas · Test it · Review & publish. | Here's the whole journey — six stops, from a blank policy to a published one. |

---

## 01 · Create a policy

**Chapter card:** *Create a policy — Name it, and choose the applications it protects.* The card shows a *Name your policy* dialog. The name types itself, the Workday, Salesforce and Microsoft 365 chips pop in, a cursor presses **Create policy**, and a toast rises.

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | The Policies list. The cursor glides in and hovers a few rows. | This is the Policies list. Every sign-in is checked against the policies on the application being opened. |
| 2 | **Spotlight: Exposure** (the column header and cells). | The Exposure column runs a break-in test against every policy, and shows what gets through. |
| 3 | Click **New policy**. The dialog springs in and the camera eases onto it. | Let's write a new one. |
| 4 | Click *Policy name* and type **Workday — Finance adaptive access**. | New policy asks two questions. First, a name. |
| 5 | Open *Applications*, search `work`, tick **Workday**, and close the list with its own trigger. | Then the applications it protects — one policy can cover several. |
| 6 | **Callout** on *Guided setup*: "Five questions, rules written for you". | Rather answer questions? Guided setup writes the rules for you. |
| 7 | Click **Create policy**. The toast *… created* appears, the rail folds to icons, and the board opens on *How would you like to start?* | Create it. It starts life as a draft — nothing changes for anyone until you publish. |

## 02 · Start from a template

**Chapter card:** *Start from a template — Browse ready-made policies, or begin with a blank one.* A grid of six mini template cards cascades in, one lifts, and a cursor clicks **Use**.

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | Hover **Use a template** (the deck fans out), then **Start from scratch** (the slot lights up). | A new policy asks one question: start from a template, or start from scratch. |
| 2 | Click **Use a template**. The gallery rises and the camera settles on it. | The template gallery holds ready-made policies — the rules already written, and yours to edit. |
| 3 | **Spotlight: Whose templates** (*Xecurify templates 12 · Your templates 2*). | Templates from miniOrange sit apart from the ones your own team has saved. |
| 4 | Hover the first cards; each lights its **Use**. | Each card is a thumbnail of the policy itself: its rules in order, and the outcome each one lands on. |
| 5 | *Filter by category* → **Device-based** (4 cards). The sheet scrolls to **Zero-Trust baseline**. | Filter by what you're protecting against. |
| 6 | **Preview** *Zero-Trust baseline*. The preview dialog springs in and the camera eases in. | Open any template to read every rule before you use it. |
| 7 | **Spotlight** on the five numbered rules with IF lines and Deny/Allow/MFA chips. | Rules are evaluated top to bottom. The first one that matches decides, and the rest are skipped. |
| 8 | **Spotlight** on *Everyone else · Nothing above matched*, then **Close** the preview. | The last row is what happens to everyone the rules don't catch. |
| 9 | Type `block` in the search, then clear it. | Or search by name. |
| 10 | **Your templates** (Regulated data access, Contractor lifecycle), then back. | Your team's own templates have a shelf of their own. |
| 11 | **Close the gallery**. | Using a template is one click, and one undo. This time, let's build our own. |
| 12 | **Start from scratch**. *New rule* lands on the chain and the panel slides in. | Start from scratch puts a blank rule on the canvas, already open in the panel. |

## 03 · Build a rule

**Chapter card:** *Build a rule — Who it's about. When it applies. What happens then.* The steps **Who → If → Then** light up one by one while a rule card fills in.

### Step 1 of 3 · Who — *Who is this rule about?*

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | **Spotlight: The panel.** | The panel edits the selected rule — Who, If and Then, in the order a rule is written. |
| 2 | Rename the rule **Finance — off the office network**. A **callout** on the card title reads "Renamed as you type". | Give the rule a name. The card on the canvas updates as you type. |
| 3 | **Spotlight: Who** (*Everyone this policy governs*). | Who starts as everyone this policy governs. Narrow it only when you need to. |
| 4 | Click **Choose people**. The dialog opens and the camera eases in. | Choose people opens the directory. |
| 5 | Tick **Finance** (86 members), then **Executives**. *Groups 2* and *Save 2 selected* count up. | Pick groups — a group follows whoever is in it on the day. |
| 6 | Switch to **People**, search `priya`, then back to Groups. | Or switch to People to name someone specific. |
| 7 | **Save 2 selected**. The summary shows the faces **F E**. | Save, and the rule is about exactly those groups. |
| 8 | Density **Detailed**. The card unfolds its *who* row. **Spotlight** on the card. | Switch the canvas to Detailed, and the card shows who the rule is about. |

### Step 2 of 3 · If — *When does it apply?*

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | The panel scrolls to **If**. **Spotlight** on *No conditions yet*. | If says when the rule applies. With no conditions, it catches every sign-in that reaches it. |
| 2 | **Add condition** opens the catalogue. **Spotlight:** "Networks, devices, time, risk and more". | Add a condition, and everything a rule can check is in one short list. |
| 3 | **Network zone**. The operator menu flies out beside the panel; pick **not in zone**. | A condition is three decisions: what to check, how to compare it, and what to compare it against. |
| 4 | Search `office` and tick **Office Network**. | Networks and places come from your Zones library — here, anywhere but the Office Network. |
| 5 | **Spotlight** on the card's *if* row. | The card reads the condition back the moment it's set. |
| 6 | **Add → Add condition → Device profile → does not match → Corporate managed**. | Add a second check: a device that isn't one of your corporate managed ones. |
| 7 | **Spotlight** on the **AND** joiner; a **callout** on the card's *AND* reads "The card reads it back". | The two checks join with AND, so both must hold: off the network, and on an unmanaged device. |

### Step 3 of 3 · Then — *What happens when it matches?*

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | The panel scrolls to **Then**. **Spotlight** on the three tiles; hover *Allow* and *Deny*. | Then is what happens when the rule matches: Allow, Require a second factor, or Deny. |
| 2 | Click **Require a second factor**. The amber tile lights and the numbered *Second factor* card appears. | Off the network, on an unmanaged device, we'll ask for a second factor. |
| 3 | *Prove it with* → **Specific methods**. **Spotlight** on the red line *No method selected. Nobody can satisfy this rule.* | Choose specific methods, and the builder won't let the rule lock everyone out until you name one. |
| 4 | *Methods accepted*: tick **miniOrange Push** and **TOTP Authenticator**. The alert clears. | Pick the methods that count — miniOrange Push, or a TOTP authenticator. |
| 5 | Switch on **Remember this device** and set **14** days. | Remember a verified device, so people aren't asked on every sign-in. |
| 6 | The camera eases onto the card. **Spotlight** on the journey: *Second factor · Password → miniOrange Push · or 1 other → Remembered 14 days · on this device → Signed in*. | The card now tells the whole story: who, when, and the exact journey they'll walk. |

## 04 · Tour the canvas

**Chapter card:** *Tour the canvas — Everything you can do on the board itself.* A mini-board pans under a grabbing cursor, the zoom readout climbs to 135%, and it fits back.

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | **Close the panel.** | Now the canvas itself. Close the panel to give it the whole board. |
| 2 | Drag the background. | Drag the background to move around… |
| 3 | Ctrl + scroll zooms in about the cursor, then **Zoom out** twice. | …hold Ctrl and scroll to zoom in on a rule… |
| 4 | **Fit the chain in view.** | …and fit the whole chain back in view with one click. |
| 5 | **Outline**, then **Detailed**. | Outline shows just the order, at a glance… · …Detailed shows what every rule checks. |
| 6 | **Spotlight: start node** (*A sign-in arrives at Workday*). | Every chain starts where a sign-in arrives — here, at Workday. |
| 7 | **Spotlight: Nothing else matched** (Always on, padlock). | And every chain ends at the default. Whatever no rule caught lands here — its place is fixed, what it does is yours. |
| 8 | Hover the connector below the Finance rule (*Add a rule here*) and click the **+**. *New rule* lands as rule 2. | The plus on any connector inserts a rule exactly there. |
| 9 | Hover *New rule*; its quick actions appear. Click **Move up** (↑) — the cards spring and renumber, and *New rule* is now rule 1. | The arrows on a card move it up or down the chain. The order is the policy. |
| 10 | Park on *New rule*. The rule beneath fades (*Shadows 1 rule below it*). | A rule with no conditions now sits first, so it catches everything. Hover it, and the rule it hides fades — the first match wins. |
| 11 | Hover: **Duplicate** → *New rule (copy)*, then **Switch off** (Off). | Hover a card for its quick actions: duplicate it… · …or switch it off without deleting it. |
| 12 | **Undo**, then **Redo** in the dock; then **Delete** the copy. | Nothing is final: Undo and Redo step through every edit in the draft. · And a rule you don't need is one click from gone. |
| 13 | Select *New rule*. Keycaps **Alt + ↓** move it below the Finance rule, then **Ctrl + Z** puts it back on top. | Every edit has a shortcut. Alt and an arrow key move the selected rule… · …and Ctrl + Z puts it back. |
| 14 | **Narrow** and **Widen** the panel, drag the resize grip, and **Ctrl + \\** hides and shows it. | The panel narrows, widens, drags to any width — or hides with Ctrl + backslash. |
| 15 | **?** opens the *Keyboard* card; the camera eases in. | Press the question mark to see every shortcut on one card. |
| 16 | **Back to policies** raises *Leave without publishing?*; choose **Keep editing**. | Try to leave with unpublished changes, and the board asks first. |
| 17 | Select *New rule* and press **Delete**. | Let's clear that extra rule away before we test. |

## 05 · Test before you publish

**Chapter card:** *Test before you publish — Rehearse a sign-in, run a break-in test, and see what changes.* A token falls to a red Deny rule and a grade tile flips from D to A.

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | The camera eases to the top bar. **Spotlight** on the **Check** and **What changes** pips. | The top bar grades the draft as you work: the Break-in test result, and how much this draft changes. |
| 2 | Click **Check**. The sheet springs up. | Open Check to rehearse a sign-in. |
| 3 | Choose **Mehak · Executives**, **Off-network** and **New device**. | Pick a person and a situation: Mehak, from Executives, off the network, on a device we've never seen. |
| 4 | **Rehearse it**; the sheet drops away. The token falls, rule 1 lights *Matched* in amber, and the default dims. | Rehearse it, and watch the sign-in fall through the rules until one decides. |
| 5 | Reopen Check. **Spotlight** on the verdict (*Second factor — Decided by rule 1…*). | The verdict names the outcome — and the rule that decided it. |
| 6 | **Office** + **Managed**, then **Run it again**. The token falls through to the default. | From the office, on a managed laptop, no rule matches — so the default at the bottom decides. |
| 7 | Collapse *Try a sign-in*. **Spotlight** on the grade tile and tally. | The Break-in test deals 13 sign-in attempts at your rules — 7 of them hostile — and grades what gets through. |
| 8 | Open **Executive account from a Tor exit** (*Got through*). **Spotlight** on the proposed fix and its preview. | Every attempt that gets through explains itself — and offers the rule that closes it, previewed before you apply it. |
| 9 | **Add this rule.** A toast appears, *Block anonymised sources* slides in above, and the grade pip changes. | Add it in one click. It lands in the right place, and the grade updates. |
| 10 | **What changes** tab. **Spotlight** on the headline (*N of 1,440 situations change*). | What changes compares this draft with what's published, across 1,440 modelled sign-ins. |
| 11 | Focus on **Tor** and click a dot. **Spotlight** on the situation card (who, where, before → after, which rule). | Every dot is one situation. Focus on Tor, then pick a dot to see exactly why it lands where it does. |
| 12 | Scroll past *Who moved* and *Which rule decides what* to *Guarantees*. | Further down: who moved, which rule decides what, and the guarantees this draft keeps — or loses. |

## 06 · Review & publish

**Chapter card:** *Review & publish — Read it back in plain English, then ship it.* A review sheet fills with IF/THEN lines, a cursor presses **Confirm & Save**, *Draft* becomes *Inactive*, and a toast rises.

| Beat | On screen | Subtitle |
|---|---|---|
| 1 | **Review & publish.** *Review your policy* opens with rows staggering in; the camera eases in. | When it's ready, Review & publish reads every rule back in plain English. |
| 2 | **Spotlight** on the Finance rule's IF / THEN prose. | Who, when and what happens — exactly as the engine will run it. |
| 3 | **Confirm & Save.** A success chime plays. The subtitle steps aside while the product's toast (*… published — switched off until you turn it on*) is up, with a **callout** "Published". Then a **spotlight** falls on the status *Draft → Inactive*. | Confirm, and it's published. · A draft becomes a real policy — switched off until you turn it on. |
| 4 | **Back to policies.** **Spotlight** on the new *Workday — Finance adaptive access* row's name, and a **callout** on its *Inactive* status: "Ready to switch on". | Back on the list, it's waiting for you — its application, its status, and its rules. |

## Close

**Write it. Test it. Publish it.** The wordmark pops in, the words rise, and six chapter
chips float in a row. *Subtitle:* Write it, test it, publish it — all on one canvas.

---

## Coverage — the whole engine, checked against the product

The inventory behind this script was mapped from the source by ten readers, one per product area. Every board capability they found is either in the video or listed below with the reason it is not.

| Area | In the video |
|---|---|
| **Policies list** | Landing screen, rows, Exposure column (Full), **New policy** |
| **Create** | Name, multi-app picker with search, Guided setup (callout), draft on create, toast, board landing |
| **Empty board** | Both start cards with hover illustrations, **Use a template**, **Start from scratch** |
| **Template gallery** | Sheet, shelves (Xecurify / Your templates), card thumbnails, category filter, search, preview dialog (rules, IF text, *Everyone else*), close preview, close gallery |
| **Inspector** | Panel, rule name (live rename), Who / If / Then sections, close, narrow / widen, resize grip, Ctrl + \\ |
| **Who** | *Everyone this policy governs*, Choose people dialog, Groups / People, search, ticks with counts, Save, summary faces, card *who* row |
| **If** | Empty state, catalogue, Network zone (operator → zones library with search), Device profile, AND / OR joiner, live card read-back |
| **Then** | Outcome tiles, Require a second factor, Prove it with, Specific methods + the unsatisfiable-rule guard, Methods accepted, Remember this device + days, card journey |
| **Canvas** | Pan (drag), Ctrl + wheel zoom, Zoom in / out, Fit, Outline / Detailed, start node, pinned default, insert on connector, hover shadowing, Move up / down, duplicate, switch off, delete, Undo / Redo, Alt + ↓ move, Ctrl + Z, **?** Keyboard card, leave guard, Delete key |
| **Check** | Top-bar pips, sheet, Try a sign-in (person + situation chips), Rehearse it, token cascade, verdict, Run it again, fall-through to the default, Break-in grade and tally, a breach explained, the fix with its preview, **Add this rule**, grade update |
| **What changes** | Headline and stricter / looser counts, Focus on, dot field, situation card, Who moved, Which rule decides what, Guarantees |
| **Publish** | Review & publish, *Review your policy* IF / THEN prose, **Confirm & Save**, published toast, Draft → Inactive, the new row back on the list |

### Deliberately not shown

| Capability | Why |
|---|---|
| **Command palette (Ctrl + K)** | Off in Lite, and its stylesheet was deleted in `73e9f5c`, so in Full it renders as unstyled markup. The video shows the **?** Keyboard card instead. |
| **`[` / `]` part switching** | Only moves an orange heading tint between Who and If — invisible at video scale — and the Keyboard card's wording for it is stale. |
| **Time of day, Risk score, User / Custom attribute conditions** | They take typed values and, from the code, likely keep a light-red "unset" frame once filled. They are visible as catalogue rows. |
| **Condition groups (Group A / B), Ungroup** | Correct but deep. The AND joiner — explained in the panel, read back on the card — carries the idea at the right level for a tour. |
| **User preference + fallback, Force at every sign-in, Allow user opt-out** | Variations on the same Second factor card. Specific methods + Remember device carry the idea and show the guard. |
| **Accept this outcome instead, Open that rule / Open it →, Discard** | Secondary to the story. Discard also wipes undo history mid-take. |
| **Trail builder, Policy details, Assign apps, row ⋯ menu, Coverage tab, Templates page (WIP)** | Outside the flow builder, or a WIP page that only raises a toast. |
| **Persona switcher, dark theme, Guided setup itself** | Prototype furniture. Guided setup is a separate interview flow — its door is shown, not walked through. |
| **Drag to reorder (by the rule number)** | Broken in the product today, found while filming. After a rule is inserted above another, a drag snaps back and moves nothing. When a drag does change slot, the held card jumps a whole slot away from the pointer and vanishes until release. The film reorders with the card's **Move up** arrow and **Alt + ↓** instead. Flagged as a separate fix. |

---

## Producing it

```bash
cd video
npm install
node capture.mjs --app http://localhost:5173      # film the product takes (~20 min)
node render.mjs all                               # compose, soundtrack, mux → out/
```

`node capture.mjs --dry` performs every take without filming, as a quick selector check.
`node capture.mjs --only canvas` re-films one take. `node render.mjs preview --at 12,48`
renders stills of the edit at those seconds.
