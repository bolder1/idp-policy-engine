# Archive

These docs were moved out of `docs/` on 1 Oct 2026. They describe screens or plans that later work replaced. They are kept for their reasoning. Don't treat them as the current product. Current state: [`../HANDOFF.md`](../HANDOFF.md).

| Doc | Written | What replaced it |
|---|---|---|
| `auth-methods-v6.md` | 17 Aug | `AuthMethodsV6.tsx` is gone. Authentication methods is now `src/brand/screens/AuthMethods.tsx` (slider pages, gear vs chevron rows). Rulings are in `docs/memory/` (slider-pages-over-centred-modals, row-ends-line-up). |
| `board-review-backlog.md` | 3 Sep | The board has been reworked many times since this review of a 4,193-line `board/`. Later rulings: `docs/memory/` (board-panel-conventions-21-sep, board-workflow-skin). |
| `builder-board.md` | 3 Sep | Board v2 as first built. The board is now the only builder in the showcase (Centred skin, accordion chain, Check access in its bar): see `../HANDOFF.md`. `src/brand/store.tsx` still points here in a comment. |
| `builder-recommendation.md` | 14 Aug | The v0 to v5 builders were deleted (`73e9f5c`, `6a7d20a`). The board replaced them, and the trail (`PolicyBuilderMain`) is hidden in the showcase. |
| `builder-tour.md` | 17 Aug | The trail builder's tour. The trail is hidden in the showcase, and the board's own walkthrough is hidden too (`board/bar-tools.ts` `BAR_TOUR = false`). |
| `builder-v2-spec.md` | 14 Aug | This is the "tool layout" v2, which was deleted with v0 to v5. Today "version 2" means the board. |
| `builder-v4-v5.md` | 14 Aug | v4 and v5 were deleted. The gauntlet and blast radius it describes are now the Break-in test and What changes. Those words are banned on screen (`ui-copy.test.ts`). |
| `personas-and-plan.md` | 19 Aug | The persona switcher is hidden by `SHOWCASE` (pinned to Security IT Manager). Presentations use the showcase tenant (`showcase-seed.ts`). |
| `policy-tab-audit.md` | 19 Aug | Superseded by the scenario coverage work in `../research/scenario-sheet-22-sep/`. |
| `use-case-gap-register.md` | 8 Sep | A snapshot of 8 Sep against the 23-scenario ruleset doc. Those scenarios now exist only in the test estate. The current coverage map is `../research/scenario-sheet-22-sep/`. |
| `v4-next.md` | 15 Aug | The v4 trail pass. v4 was deleted. |

Three older docs stay in `docs/` because code comments cite them as specs: `v0-policy-flow.md` (the Lite edition's scope, `edition.ts`), `v5-mfa-experience.md` (`screens/recovery.tsx`) and `rebrand-guideline.md` (every `src/brand/rebrand/*.css`).
