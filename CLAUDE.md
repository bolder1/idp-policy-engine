# CLAUDE.md

This repo is the IdP Policy Engine prototype: the Policies section of the miniOrange / Xecurify admin console. It is React 19 + Vite + TypeScript, with seed data only. The owner is Surajit Dutta, a product designer.

## Read first

1. `docs/HANDOFF.md`: what is built, the flags, the folder map, git state and known gaps.
2. `docs/memory/MEMORY.md`: the owner's rulings, one note each. Check the relevant note before changing a screen. The live copy is `~/.claude/projects/C--New-folder-IDP-Policy-Engine/memory`.

## Where to work

- Work in this checkout (`C:\New folder\IDP Policy Engine`) on `main`. There is no other line of work.
- If this session started in a `.claude/worktrees/*` tree, say so before editing anything. Run `git status`, `git worktree list` and `git log --all -S'<Symbol>'` before you call code missing or dead.
- Never copy `src/` from an old worktree branch. They are archive backups, and `main` supersedes them.
- Commit or push only when the owner asks. Both remotes are public: `docs/memory/`, `docs/research/`, `docs/artifacts/` and `tools/rigs/walkthroughs/` are local only (gitignored) — never force-add them, and never copy tenant identifiers or internal research into a tracked file (see `docs/HANDOFF.md`, Git).

## The dev server is the owner's

- `npm run dev` serves http://localhost:5173 (`.claude/launch.json` `policy-prototype`). Vite listens on `::1`, so `127.0.0.1` refuses.
- Don't kill or restart his server. If nothing is listening, `preview_start policy-prototype` starts it. The result can say `"reused": true`, so read the port it reports.
- Do browser checks in a tab you open. Restore any localStorage you change (view, skin and theme keys are shared with his tabs).

## The verification gate (every change)

```
npx tsc -p tsconfig.app.json --noEmit   # 0 errors
npx oxlint                               # warnings no higher than 27; it exits 0 on warnings, so COUNT them
npx vitest run                           # all pass (~4400)
npm run build
```

- Under load, five files can time out with no assertion failing: ui-copy, engine-run, impact-arena, board-views-ui and player-ui. Rerun them alone before you call a failure. player-ui "never an orange button" can run past its own 30 s cap even alone on a busy machine; it is synchronous, so its checks did pass.
- **Then check it in the browser. This is not optional.** UI tests render static markup only, so nothing clicks, drags or animates in the suite.
- Playwright drivers are in `tools/rigs/`, and Playwright is in the repo's own node_modules.
- When the Browser pane is hidden, `requestAnimationFrame` stops. Motion freezes and closed dialogs stay mounted. That is not a product bug.

## Flags are kept, not dead

These hide finished work for the current phase. Don't delete what they gate, and don't flip them without the owner:

- `SHOWCASE` (`src/brand/showcase.ts`)
- `SAVED_SIGN_INS` / `BREAK_IN_ATTEMPTS` (`screens/sign-in-tests/phase.ts`)
- The rest of the Access checks flags in `screens/sign-in-tests/phase.ts`: `CANVAS_OPTIONS`, `DENIAL_REASONS`, `ACCEPT_ATTEMPTS`, `TEMP_ACCESS`, `MULTI_IDENTITY`, `INSPECTOR`, `READ_AS_TEXT_TAB`, `DETAILS_IN_BAR`, `WHY_IN_FOCUS`; and `CANVAS_PICKER`, `ARUNA_ENTRY` in `run-layout.ts`
- `PEOPLE_AND_BREAK_IN` (`screens/board/test-mode.ts`)
- `BAR_DEMO` / `BAR_TOUR` / `BAR_READ` (`screens/board/bar-tools.ts`)
- `features` in `src/brand/store.tsx`

New A/B or preview controls are gated on `SHOWCASE`. A later phase goes behind its own named flag.

## Design and copy rules

- **Tokens only.** Use the variables in `tokens.css` / `console-theme.css` / `rebrand.css`, and never restate a value in a screen sheet. `--accent` is slate and `--brand` is orange.
- **One orange button per view.** Selection is greyscale or blue, never orange. Destructive triggers are neutral, and red appears only inside the confirm.
- Numbers appear once per view, and tabs never carry counts. 12px type floor, one pill family, no decorative dots, light mode only.
- **Motion:** animate with Motion props. Never put a CSS `transform` on a `motion.*` element, because Motion overwrites it. Honour reduced motion.
- **Copy:** sentence case and plain admin language. Buttons are verbs, labels are nouns, no sentences explaining the UI.
  - Never use: AI, assistant, login / log in (say sign-in / sign in), gauntlet, blast radius, rehearse. `ui-copy.test.ts` enforces part of this.
  - Names of the testing surface come from `screens/sign-in-tests/names.ts` ("Check access", "Access checks").
- Product parity copies the live console's fields, words and order, never its control types.

## How the owner works

- Research first, with primary sources, and say what is verified.
- Then build your best and let him iterate. Ask only when a choice is irreversible or contradicts a ruling.
- He reviews in the browser, so send no videos or filmstrips as deliverables. Tell him the URL.

## Shell tips (Windows, Git Bash)

- Heredocs with quotes break in this shell. For multi-line edits, use the Write/Edit tools, or write a Python script and run it with `PYTHONIOENCODING=utf-8 python <script>`.
- Use `C:/...` paths. The repo path has a space, so quote it.
- `core.autocrlf=true`: compare trees with `diff --strip-trailing-cr`.
- Don't add a file over 1 MB where git can see it. Big media goes in `local-archive/` (gitignored). `public/policy-board-demo.webm` (6 MB) predates this rule.
