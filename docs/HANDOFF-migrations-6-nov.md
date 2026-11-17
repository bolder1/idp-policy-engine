# Handoff: migrations flow, 6 Nov 2026

Read `CLAUDE.md` and `docs/HANDOFF.md` first. This note is only the delta from the 6 Nov session.

## Where the work is (read this first)

- **All the migration work is UNCOMMITTED, in the worktree `C:\New folder\IDP Policy Engine\.claude\worktrees\modest-hofstadter-4a3720`** (branch `claude/modest-hofstadter-4a3720`, base `02778d6`, ~75 modified files).
- The session worktree `migrations-banner-updates-9b0013` is clean at `main` (`02778d6`) and has no migration work. This file lives there only because that was the session folder.
- Nothing is committed or pushed. Do not clean up or remove the `modest-hofstadter` worktree before the work is committed or backed up (e.g. `git diff > local-archive/migrations-6-nov.patch`, or a WIP commit on that branch if the owner agrees).
- Run it: `npx vite --port 5174 --strictPort` from that worktree, then http://localhost:5174. The owner's dev server on 5173 is the main checkout: do not touch it. A fresh browser profile starts at the old console (App Login Policies); run Start migration, then a move, to reach the Migrated policies tab.

## Verification state

- `npx tsc -p tsconfig.app.json --noEmit`: 0 errors (slow under load, ~2 min; run it in the background).
- Vitest, the files touched: `src/brand/migrate`, `src/brand/screens/policies*`, ui-copy pass (45 passed).
- NOT run: oxlint count, the full vitest suite, `npm run build`.
- NOT checked in the browser: everything below. The owner reviews in the browser and will look himself.

## What was built on 6 Nov (all in modest-hofstadter)

1. **Policies page, three tabs** (`screens/Policies.tsx`, `migrate/phase.ts` MIGRATION_FIRST): New policies, Migrated policies, Old policies. `SignInPolicies` takes `origin: 'new' | 'moved'`. A moved policy is in Migrated while it is a draft (`waitingMoved`); once active it graduates to New policies. Migrated has no New policy button and its own empty state ("No migrated policies yet"). Test `policies-types-ui.test.tsx` updated to the three tab names.
2. **Old policy to new rule highlighting** in the builder (`migrate/moved-panel.tsx`, `screens/board/BoardBuilder.tsx`, `board.css`). Hover an old card: the rules it became get an info-blue ring (reuses the `traced` ring via `ringed`; `.bb.is-moved-hi`), the others dim, and inside a lit rule the `.is-cond` rows and the Who row are tinted. Selecting a card keeps the highlight, opens those rules (others fold) and scrolls to the first. Hovering a rule on the board lights its source old card (`hoverRule`, `linked`). The pin icon is removed; a second click deselects.
3. **Publishing no longer deletes old policies** (owner's ruling, 6 Nov). `store.tsx` `publishMoved` and `activateMoved` no longer touch `legacy`; `migrationDone.deleted` is always 0. Copy changed: confirm button "Publish", no red warning, the finale banners, the Intro slide and the panel line say the old ones stay in the Old policies tab, and the confirm says the policy "moves to New policies".
4. **Old policy card redesign** (`migrate/review-split.tsx` `OldCard`, `review-split.css`): header strip "Old policy N" + App Login tag, name as the title, labelled rows (Who, App, Sign in, Also), Adaptive Access as its own pale-blue block, "Became" footer. `index` is passed by `moved-panel.tsx`, `review-split.tsx` and `old-tab.tsx`.

## Open and unverified

- Look at all four in the browser (highlight on hover/select, the graduation to New policies after Publish, the card hierarchy at the panel's 338px width, the Review page and Old policies tab, which share the card).
- The condition tint highlights every condition in a lit rule, not only the ones that came from Adaptive checks. Owner may want only the Adaptive-derived ones.
- Copy to recheck against `ui-copy.test.ts` rules after any change: no "AI", "login", "turn on/off"; active / inactive wording.
- `store.legacy` is no longer pruned on publish, so check anything that assumed the old rows disappear (finale `oldLeft` was removed; Review and the rail Old policy group were not re-checked).
- Intro video and the old-app banner (the earlier work in this thread) were not touched in this session.

## First message to paste in the new account

> Resume the migrations flow from `docs/HANDOFF-migrations-6-nov.md` in the main checkout / the `migrations-banner-updates-9b0013` worktree. The work is uncommitted in the `modest-hofstadter-4a3720` worktree: say so, run `git status` there, then start `npx vite --port 5174 --strictPort` from it (leave my 5173 server alone). Check the four changes in the browser pane, then tell me what you see before changing anything.
