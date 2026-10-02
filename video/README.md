# video

The product-film pipeline of 10–15 Sep 2026: it drives the running app take by take, then composes the
frames, voice and sound into a 1080p film. It is its own npm package and is not part of the app's build,
lint or tests. Since 30 Sep the owner reviews in the browser and asks for no videos, so this is kept for
reference and for any future film.

## Run it

```sh
cd video
npm install                          # playwright, @ffmpeg-installer/ffmpeg
pip install edge-tts                 # audio/vo.py speaks the lines with it
# in another terminal, from the repo root: npm run dev
node capture.mjs --theme light       # film every take into .work/light/capture
node render.mjs all --theme light    # edit, frames, audio, mux -> out/policy-engine-demo-light.mp4 + .srt
```

`capture.mjs` and `render.mjs` explain every option in their headers. `APP_URL` (default
`http://localhost:5173`) picks the app. `.work/` and `out/` are gitignored.

## What is where

- `storyboard/` the takes (`takes-v2.mjs`), the spoken lines (`lines.mjs`), the beat sheets and the design
  and research notes behind them (`DESIGN-v6.md`, `BEATS-v7.md`, `RESEARCH-v6-*.md`).
- `lib/` the recorder, the edit decision list, the voice-over module and a small static server.
  `lib/vo-selftest.mjs` checks the voice-over module (it was `vo.test.mjs`; renamed so the app's vitest run
  does not pick it up).
- `compose/` the compositor page that lays out each frame, its slides and its tests.
- `audio/` `vo.py` (voice) and `synth.mjs` (music and sound).
- `PLAN-v2.md`, `SCRIPT-v6.md`, `SCRIPT.md` the plan and the scripts.

The last film it made (cut 7, light, 15 Sep) is in `local-archive/media/films/cut7-15-sep/`.

Left out when it was carried from the `blissful-kalam` worktree on 1 Oct: the mascot (withdrawn on 12 Sep:
`compose/mascot*.js`, `mascot.css`, `compose/test/render-mascot*.mjs` and `assets/mascot/`), the early
`spike/` probes, `node_modules`, `.work` and `out`. The compositor still has the mascot's hidden mount points.
