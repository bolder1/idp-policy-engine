# Specs

The build specs for policy testing (Access checks), newest first. The code is the final word: each spec
records what was asked for and decided on its date, and later owner changes override earlier sections.

| File | Dated | What it is |
| --- | --- | --- |
| `TESTING-V4.md` | 28 Sep – 1 Oct | Policy testing V4, the refined experience. The current Access checks build grew from it. |
| `section11.md` – `section14.md` | 30 Sep | Owner changes added after V4: the in-policy Try matches the page (11), the page's sentence bar and canvas (12), troubleshooting with conflicts and a person in two groups (13), the page using the policy builder's layout (14). |
| `DENIAL-REASONS.md` | 5 Oct | Denial reasons: one reason, three readers. The reason is admin only; the end user sees the message, a next step and a contact. Built, behind `DENIAL_REASONS`. |
| `DENIAL-NEXT.md` | 5–6 Oct | Troubleshooting: what admins need next. Let in for a while, Accept as expected, Sign-in activity with its Policy changes tab, the change log, What changed, Copy summary. Built; lists what was left out. |
| `CHECK-ACCESS-INSPECTOR.md` | 6 Oct | The Check access details panel (inspector): a read-only view of anything a check touched, opened only from names inside the cards, with Edit in builder as the one way out. Built; the proposal and the "Later" list are kept. |
| `conflicts-model-30-sep.md` | 30 Sep | Build note for section 13.1: the pure conflicts model, multi-group membership and the seed. |
| `history/` | 25–28 Sep | The earlier testing specs: `spec-A` (Try a sign-in in the board), `spec-B` (testing for the whole tenant), `spec-C` (Monitor, report-only), `spec-D` (guard pages and the Break-in test), `final.md` (all four after the 25 Sep owner decisions), `spec-describe.md` (Describe it, the plain-English and guided policy maker) and `cross.json` (the cross-check between them). |

Since 1 Oct the page is called Access checks and its button Check access (`src/brand/screens/sign-in-tests/names.ts`);
the specs still say Sign-in tests and Try a sign-in.

`TESTING-V4.md`'s header (the keen-goldwasser worktree, dev server on :5320) and its section 6 recipe (Playwright
required from the pensive-easley worktree, scratchpad shoot scripts) are historical. The work is now in this checkout
on `main`, served at http://localhost:5173, and the drivers in `tools/rigs/` use `require('playwright')` from the repo root.
