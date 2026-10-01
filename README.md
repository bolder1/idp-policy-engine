# IdP Policy Engine — Policies prototype

A clickable prototype of the **Policies** section of the miniOrange / Xecurify IdP admin console. It is built in React 19, Vite and TypeScript, with no backend: every tenant is seed data in memory. It runs as a **showcase** of the chosen designs, in the live console's look.

**Start with [`docs/HANDOFF.md`](docs/HANDOFF.md).** It covers what is built, what is hidden behind which flag, where everything lives, and the git state. Claude Code sessions also read [`CLAUDE.md`](CLAUDE.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest run — ~4400 tests
npm run lint       # oxlint — count the warnings (baseline 27)
npm run build      # tsc -b && vite build
npm run preview    # serve the build
```

Typecheck alone: `npx tsc -p tsconfig.app.json --noEmit`. No change counts as verified until it has been seen in the browser, because the UI tests render static markup only. See [Verify a change](docs/HANDOFF.md#verify-a-change).

## What is in it

- **All Policies.** A policy table with Draft, Active, Inactive and Monitor statuses. New policy opens an Untitled draft in the builder.
- **The builder.** A chain of rule cards. A right-hand panel edits Who / If / Then, and the bar has **Check access**, which runs the policy's draft.
- **Access checks.** You enter a sign-in (identity, application, conditions) and the engine runs it step by step to the outcome. **Why** shows conflicts, the per-group answers and the Break-in attempts, with *Fix in policy*.
- **Libraries.** Templates, Zones, Device profiles, Risk signal profile, Authentication methods, Display tokens and External hooks.

## Where things are

```
src/brand/                 the product: shell, store, seed data, screens
  showcase.ts              SHOWCASE — hides every A/B and preview control, pins the chosen design
  showcase-seed.ts         the presentation tenant
  screens/board/           the policy builder (the board)
  screens/SignInTests.tsx  the Access checks page; its parts are in screens/sign-in-tests/
  screens/simulate.ts      the evaluator every screen shares
docs/                      HANDOFF, specs/, research/, artifacts/, memory/, archive/
tools/rigs/                Playwright drivers and recording rigs
video/                     the marketing-film pipeline (it has its own npm install)
scripts/                   npm run logos, npm run demo:record
local-archive/             gitignored: big media, kept on disk only
```

## Logos

`npm run logos` resolves every app mark from the web. The registry is `src/brand/logos/sources.ts`. Providers are tried in order: Clearbit, DuckDuckGo, Google S2, then the site's favicon. The files land in `public/logos/`. `manifest.generated.ts` records which provider answered. `<AppLogo>` falls back to a tinted monogram when an image fails. Use `npm run logos -- --force` to refetch.

## Design sources

The look copies the live console (`login.xecurify.com`). [`docs/rebrand-guideline.md`](docs/rebrand-guideline.md) is the reference. Underneath, the tokens are the design-system repo's generated `tokens.css` (`C:\New folder\IDP miniOrange`), copied verbatim into `src/brand/tokens.css`. Brand orange `#EB5424` is locked.

Known drift, still unresolved: the Figma libraries (`IDP · 2 Core` v0.1.1) and the token file (v0.1.0) disagree on several values. The most important is danger: Figma has `#e61e1e`, while the token repo's light theme has `#d33a2c`. This build follows the token repo.
