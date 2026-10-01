# Rigs

Scripts that drive a browser: Playwright checks of the prototype, the recording rigs behind the four
competitor walkthroughs, and the September film rigs. They are not part of the app, the build or the
tests. Every one was carried here on 1 Oct 2026 from a Claude session scratchpad, with its paths repointed
at this repo (see "What changed on the way in" below).

## Before you run anything

- Run from the repo root: `node tools/rigs/access-checks/s1.cjs`.
- Start the app yourself first (`npm run dev`). No rig starts or stops a server.
- The prototype drivers open `http://localhost:5173/` unless you set `BASE`:
  `BASE=http://localhost:5190/ node tools/rigs/check-access/shot.cjs "Maya Iyer" "AWS Console" maya`.
- Playwright comes from the repo's own `node_modules` (1.63, a devDependency). Every rig launches the
  installed Google Chrome with `channel: 'chrome'`, so no Playwright browser download is needed.
- Each rig sets `localStorage` `idp.board-tour.seen` and `idp.tour.seen` to `'1'` before the page loads,
  so the first-run tours do not cover the screen. Do the same in any new rig.
- Screenshots and recordings go into an `out/` folder beside the script. `.gitignore` keeps `out/`,
  `profile*/`, `shots/`, `videos/`, takes, frames and every image or video under `tools/rigs/` out of git.
- The repo is `"type": "module"`, so the CommonJS drivers end in `.cjs`.

## What is here

| Folder | Dated | What it does |
| --- | --- | --- |
| `access-checks/` | 1 Oct | **Current.** The Access checks page and its Break-in attempts. `lib.cjs` holds the shared driver: `open`, `toChecks` (presses Check access), `fillAndRun(page, person, app)`, plus `overlaps`, `fontsUnder`, `clipped` and `focusDesc` checks. `s1`–`s9` are the review scenarios: `s1` Maya Iyer on AWS Console (a conflict), `s1b` Fix in policy into the builder, `s2 [person] [app] [tag]` and `s3 <person> <app> <tag> [playGroup]` take arguments, `s4` Outlook timing, `s5` weaker-factor fix, `s6`–`s8` after Fix in policy, `s9 [A\|B\|C]` the re-check of the review fixes. |
| `check-access/` | 1 Oct | **Current.** Screenshots of a Check access run. `shot.cjs "<person>" "<app>" <tag> [w] [h]` (set `PRESS=1` to press the sentence too), `stops.cjs "<person>" "<app>" <tag>` (each stop at 2x, with overlap numbers), `builder.cjs "<policy>" "<person>" <tag>` (Check access inside the builder), `empty2.cjs <tag> [person] [app]` (the empty canvas), `dock.cjs` (does the outcome clear the dock). |
| `sign-in-tests-30-sep/` | 29–30 Sep | **Out of date.** Written for the page when it was called Sign-in tests and had Saved sign-ins. Since 1 Oct the button says Check access (`src/brand/screens/sign-in-tests/names.ts`) and Saved sign-ins is hidden (`phase.ts`), so these need their selectors updated before they run. Kept for the helpers: `glance/lib.cjs` (`fit` measures whether the run fits the canvas, `scenario` replays the saved sign-ins), `canvas/lib.cjs` (`geo`, `scroll`), `review-player/` (frame-by-frame player captures), `engine-film/` (`film` takes a frame every 150 ms until the run ends; `metrics`). |
| `walkthroughs/az/` | 30 Sep | Entra Conditional Access walkthrough (`docs/artifacts/entra-walkthrough/`). See "Walkthrough rigs". `okta-stepped/` is the first, stepped Okta film, replaced by `ok/`. |
| `walkthroughs/ok/` | 30 Sep | Okta app sign-in policy walkthrough (`docs/artifacts/okta-walkthrough/`). |
| `walkthroughs/mo/` | 30 Sep | miniOrange policy engine walkthrough of this prototype (`docs/artifacts/miniorange-walkthrough/`). |
| `walkthroughs/duo/` | 30 Sep | Duo policy walkthrough (`docs/artifacts/duo-walkthrough/`). `rec/` is the real-capture retake that was published; `post-duo.mjs` is the first, stepped film. |
| `films/` | 22–24 Sep | The film rigs from before 30 Sep, when the owner stopped asking for videos. See "Film rigs". |

## Walkthrough rigs

The four pages in `docs/artifacts/` were filmed with these. They log into real vendor consoles, so read
`docs/memory/competitor-policy-walkthroughs.md` and `docs/memory/okta-walkthrough-sign-in-trap.md` before
a re-take.

- **Server + snippets (`az/`, `mo/`, `ok/server.mjs`).** `node tools/rigs/walkthroughs/az/server2.mjs` opens a
  headed Chrome with its own profile in `profile/` beside the script (gitignored; you sign in once, by hand)
  and listens on `127.0.0.1:47831`. `run.sh` POSTs a snippet of Playwright code to it; `launch.sh` sends
  `take.js` (the scripted take) as a background job. Send `rec.js` first: it adds the CDP screencast
  recorder (`H.recStart`, `H.recStop`) that `take.js` uses. `overlay.js` draws the cursor and clicks.
  `post.mjs <recdir> <take-log.json> <out.mp4>` turns the frames and the take log into an MP4 with captions;
  `sheet.mjs` makes a contact sheet. `take.js` reads its folder from `globalThis.RIG_DIR`, which the server sets.
- **miniOrange (`mo/`).** Drives this prototype at `APP_URL`, default `http://localhost:5173/`. The published
  film was shot on a frozen build served on :5331.
- **Okta (`ok/`).** Okta signs the automation out and asks for step-up checks, so the published take was
  driven in the owner's own Chrome through Claude in Chrome: `driver.js` is the in-page driver,
  `rec-start.sh <name> [offset_y] [offset_x]` / `rec-stop.sh` record the page area with ffmpeg `gdigrab`
  (offsets count from the primary monitor), `check.sh` tells whether the page is still on screen,
  `extract.mjs` keeps the changed frames, and `chapters.mjs` / `post-okta.mjs` build the film.
  `server.mjs` and `server-cdp.mjs` are the earlier Playwright attempts.
- **Duo (`duo/rec/`).** The same gdigrab approach: `win.ps1` places the Chrome window, `marks.sh` finds the
  magenta corner markers, `driver.js` runs in the page, `post-rec.mjs <take> <log.json> <out.mp4> [slow] [fps]`
  squeezes the waits and plays the slowed motion back at speed.
- **ffmpeg.** The post scripts use `FFMPEG` when it is set, or else
  `video/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`, so run `npm install` in `video/` first.
- The stepped films (`az/okta-stepped/post-okta.mjs`, `duo/post-duo.mjs`) read screenshots that were saved in
  Claude Code session folders under `~/.claude/projects/`. Those are not in the repo; set `FRAMES_BASE` /
  `FRAMES_DIR` to point elsewhere. The defaults are the old account's session folders, so they stop working once
  those `~/.claude/projects` folders are cleaned. Only these superseded stepped films need them.

## Film rigs

| Folder | Film |
| --- | --- |
| `films/status/` | The 22–23 Sep status film: `harness.mjs` and `studio.mjs` (capture + compose), `video1.mjs` the film, `vo.mjs` / `synth.mjs` voice and sound. |
| `films/demo/`, `films/demo2/` | The 23 Sep demo film and its framed walkthrough cut. |
| `films/promo/` | The 23 Sep explainer. |
| `films/big/`, `films/big3/` | The 24 Sep big film. `big3/` is the last cut (`film3.mjs`, `rig3.mjs`, `stage3.mjs` + `stage3.js`, `mix3.mjs`). |

They borrow Playwright, `@ffmpeg-installer/ffmpeg` and `lib/vo.mjs` from `video/`, so run `npm install` in
`video/` first. Most film a production build on `vite preview` (`http://localhost:4173/`); the status rigs use
:5173. Scripts, treatments and subtitles of these films are in `docs/research/scenario-sheet-22-sep/films/`;
the last cut's MP4 is in `local-archive/media/films/`. The newer film pipeline (10–15 Sep) is `video/`.

## What changed on the way in

- `require('C:/New folder/IDP Policy Engine/.claude/worktrees/pensive-easley-bc1d1e/node_modules/playwright')`
  became `require('playwright')`, which Node resolves from the repo's `node_modules`.
- `createRequire('<blissful-kalam worktree>/video/package.json')` in the walkthrough servers became
  `createRequire(import.meta.url)`.
- In the film rigs the `blissful-kalam` worktree's `video` folder became this repo's `video/`, worked out from
  `import.meta.url`.
- Hard-coded ffmpeg paths became `FFMPEG` or `video/node_modules/@ffmpeg-installer/...`, relative to the script.
- Hard-coded ports (:5320, :5361, :5197, and :5331 for miniOrange) became `BASE` / `APP_URL`, default :5173.
- `const OUT = __dirname + '/'` became `out/` beside the script; the legacy scripts that wrote to the current
  folder now change into their own `out/` first.
- Folder names worked out with `new URL(import.meta.url).pathname` are decoded first, because this repo's
  path has spaces in it.
- `take.js` no longer names its scratchpad folder; it uses `globalThis.RIG_DIR`.
- `.js` became `.cjs` for the CommonJS drivers, and `require('./lib')` became `require('./lib.cjs')`.

## Not carried

Screenshots, frame dumps, raw takes (`.mkv`, `.webm`), logs, `.pid` files, the Okta and vendor Chrome
profiles, one-off probe scripts, the `edit_*.py` patchers that already ran, and the copies that only
duplicated another file. The frozen miniOrange build was a `dist`, so it was left out too.
