# Check access: see everything here, leave only to change something

Status: **built on 6 Oct 2026**, committed in 5575ce7 (what was decided and built is the last section; the rest is the proposal as it stood before the build, kept for the reasons and the "Later" list). The 6 Oct fixes to the Depends views and the default in the person list are in the worktree, uncommitted. Owner ask: after a check, the admin should be able to look
into anything the check touched, in a right-hand panel, and leave Check access only to edit.

## The principle

Every name on the canvas is pressable and opens a **read-only inspector** in the right-hand panel: the person, the
application, a policy, a rule, a zone, a device profile, a risk profile, a hook, a method. The inspector shows the
object as it was **at this sign-in**: what held, what failed, and the actual value against the required one. The one
way out is **Edit in builder ↗**, which lands on the exact policy or rule.

## What the check touches, what the admin wants next, and what exists

The "Before the build" column is the code as it stood on the morning of 6 Oct 2026, before the inspector existed. "Exists" meant the data or a surface was there then.

| Object | What the admin wants to know | Before the build |
|---|---|---|
| **Person** | Every group they are in; role and type; which policies reach them and why; their methods; recent sign-ins | Name and groups on the sign-in card only. Data exists (`User`, groups). No panel |
| **Application** | Every policy on it in the order the engine reads; who it covers; break-in result | Policy list on the Policies card (names only). Break-in panel exists |
| **Policy that decided** | Status, applications, audience, every rule in order, deny message and fallback, last change, a pending draft | Name and the one rule. `Policy` holds it all. **Read as text** drawer exists on the Policies page. Change log exists now |
| **A policy that did not apply** | Why not: audience, off, draft. What it would have said | A line ("not in this policy"). Why panel has "Also covers" for some |
| **A rule** | Who, if, then, with actual against required for each row; exceptions; the factors and remember-device settings; deny message, next step, contact | Rule card with ✓ ✕ marks. Other rules listed by name, press to open (built 6 Oct) |
| **A zone in a condition** | What is in it (addresses, ASNs, countries, cities, ranges) and which entry matched or missed this sign-in | Name only. `Zone` holds it. Zones page exists |
| **A device profile** | Its checks, which one failed, the value found, what to do | Name; "Windows 10 does not meet Compliant devices". Profile data exists |
| **A risk profile / score** | The score, the signals that raised it, the bands | Score row. Risk profile data exists |
| **A hook** | Endpoint, mode, what it returned, fail-open or closed | Name only. `Hook` exists |
| **Methods and what they see** | Which methods were offered, what is enrolled, the fallback chain, the sign-in page | What they see player exists |
| **The decision** | Why this answer, what would change it, who else gets another answer | Why panel, Questions, How to get in, break-in. Exist |
| **Tenant context** | Policy order and precedence, the Global Default, conflicts and shadowed rules | Partly in Why |
| **History** | What changed lately, past outcomes of the same sign-in | Change log: What changed in Why, Changes tab. Past sign-ins exists |
| **Actions** | Temporary access, accept, fix, copy, export, save as a check | Several exist. Save and compare do not |

## Three ways to build the pattern

- **A. One inspector, a stack (recommended).** One right-hand panel with a back arrow and a breadcrumb: Priya › AWS
  for engineering teams › Rule 2 › Corporate offices. Pressing any name pushes the next view. One chrome, one habit,
  and it never leaves the canvas.
- **B. A panel per kind.** Policy panel, Rule panel, Zone panel, each its own design. Richer, but five panels to build
  and keep consistent.
- **C. Peek then panel.** Hover shows a small card; press opens the panel. Fast to skim, but hover is weak on touch and
  the peek doubles the work.

## Functions, in order

**Must have (the loop the owner described)**
1. **Policy inspector.** Header (name, status, last change and by whom), applications, audience, every rule as a
   name list that opens to the full rule, deny message and fallback, pending draft flagged. Reuse Read as text for the
   plain-sentence view.
2. **Rule inspector.** The full rule with **actual against required** on every row for this sign-in, the exceptions,
   what it asks for on allow, and the deny message with next step and contact.
3. **Not-applied policies.** Every policy on the application, each with why it did or did not apply, openable.
4. **Edit in builder ↗** as the one exit, on the exact rule.
5. **Back and breadcrumb** through the stack.

**Should have**
6. **Zone, device profile, risk profile and hook peeks** from any condition: what is in it, and which part matched.
7. **Person inspector.** All groups, role, which policies reach them, enrolled methods, recent sign-ins.
8. **Application inspector.** Its policies in reading order, and who is covered.
9. **Diff of draft against live** for a policy with a pending draft.
10. **Copy as text** and **export** (JSON or PDF) of the trace and the panel in view.
11. **Pin a panel** while the canvas re-runs, to compare answers.

**Later**
12. **Compare two runs** side by side (two people, two networks, draft against live).
13. **Save this as a check** from the panel.
14. **"Used by"** on a zone or profile: which policies and rules read it.
15. **Search the panel** (find a rule or a condition by word).
16. **Share a link** to the exact view.

## What it needs

- A `Inspect` target type (person, app, policy, rule, zone, profile, risk, hook, method) and one panel stack.
- A per-sign-in evidence feed for each row (the engine already computes actual and required in `engine-run.ts`).
- Read-only views of objects the product already has; no new data except the optional person history.

## Rules it keeps

Right-hand panels only. Tokens only. One orange button per view (none in these panels). Numbers once. Edit lives in the
builder; the inspector never edits. The reason and reference stay admin only.

## Open decisions for the owner

1. Option A, B or C (A recommended).
2. First slice: policy and rule inspectors with Edit in builder (must-haves 1 to 5), then peeks.
3. Does the person inspector show real recent sign-ins? The prototype has only a modelled week, so it would carry the
   Sample badge.
4. Is Read as text the policy's default view in the inspector, or a tab beside the structured rule list?

## Decided and built (6 Oct 2026)

1. **Option B**, a view per kind in one shell: policy, rule, zone, device profile, risk profile, hook, person and
   application. Back arrow and breadcrumb; a trail longer than four folds its middle into one step back.
2. **The way in:** the names inside the cards only: policy names, a Details icon on each row of the rules list, a
   Uses line under an open rule, Decided by. No icons on the card heads, and no button in the canvas bar (it was
   built and taken out the same day; `DETAILS_IN_BAR = false`).
3. **Read as text** is off (`READ_AS_TEXT_TAB = false`); the policy view is its details only, with no tab row.
4. **The panel** follows the builder inspector's grammar. The head is the kind's tile, its kind and its name. A
   verdict band says what the thing did to this sign-in, in the outcome's tone. Sections each have a brand icon, a
   semibold heading and a guide rule. Rows have a mark and a chevron. The way out sits in the sticky foot: Edit in
   builder, or Open in the object's library page (a person has none).
5. **Also in:** Pin (this visit), Compare for two pinned things of one kind (rules too), Copy, Draft changes (the
   draft's sentences against live), and Related (the sign-in's person and application, and the pins).

Files: `sign-in-tests/InspectPanel.tsx`, `PeekViews.tsx`, `inspect-model.ts`, `peek-model.ts`, `inspect-facts.ts`,
`inspect.css`. The flag is `INSPECTOR`.
