/* -----------------------------------------------------------------------------
   Record the product demo.

   Drives the REAL application in a real browser and records what happens. Not a
   motion-graphics reel and not a slideshow of screenshots: the file this writes
   is the product, doing the thing, at the speed it actually does it. A demo that
   is animated separately from the product is a demo that starts lying the first
   time the product changes.

   Run it with `npm run demo:record`. It expects the dev server on :5173 and
   writes `public/policy-board-demo.webm`, which is what `DEMO_VIDEO.src` in
   src/brand/tour/board-tour.ts points at.

   --- Why webm, and why no ffmpeg -------------------------------------------

   Playwright records video itself, over the DevTools protocol, and writes webm
   directly. There is no encoder to install, which matters because this machine
   has no ffmpeg and adding one to the toolchain to produce one asset would be a
   poor trade. Every browser this console supports plays webm.

   --- The two things a screen recording needs that automation does not give ---

   **A cursor.** Playwright's video has no pointer in it, so a click looks like
   a thing spontaneously happening. A fake one is injected and moved in step
   with the real mouse, with a click ripple, because "somebody did this" is half
   of what a demo communicates.

   **Captions.** There is no audio, so each beat states its own point. They are
   deliberately about the IDEA rather than the mechanics — "first match wins",
   not "now click the plus button" — because a viewer can see the clicking.

   --- On brittleness ---------------------------------------------------------

   Every step goes through `step()`, which logs, tolerates failure and carries
   on. That is deliberate: a recording that stops dead two thirds of the way
   through because one label was renamed is worse than one that skips a beat and
   still ends up with a published policy. The log says exactly what was skipped,
   so a broken step is loud without being fatal.
   -------------------------------------------------------------------------- */

import { chromium } from 'playwright'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public')
const OUT_FILE = path.join(OUT_DIR, 'policy-board-demo.webm')
const TMP_DIR = path.join(ROOT, '.demo-recording')
const URL = process.env.DEMO_URL ?? 'http://localhost:5173'

const W = 1440
const H = 900

let failures = 0
/* The page under test, so `step` can report which screen it gave up on without
   that being threaded through a dozen call sites. There is exactly one page in
   this script and it exists for its whole life. */
let current = null

/* --- The overlay ------------------------------------------------------------

   Injected before any app script runs, and appended to `document.body` rather
   than into the app's root, so React never owns it and never removes it on a
   re-render.
   -------------------------------------------------------------------------- */
const OVERLAY = `
(() => {
  const css = document.createElement('style')
  css.textContent = \`
    #demo-cursor {
      position: fixed; z-index: 2147483647; left: 0; top: 0;
      width: 22px; height: 22px; margin: -3px 0 0 -3px;
      pointer-events: none;
      transition: transform 60ms linear;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
    }
    #demo-ripple {
      position: fixed; z-index: 2147483646; width: 34px; height: 34px;
      margin: -17px 0 0 -17px; border-radius: 50%;
      background: rgba(235,84,36,.35); border: 2px solid rgba(235,84,36,.9);
      pointer-events: none; opacity: 0; transform: scale(.3);
    }
    #demo-ripple.go { animation: demo-rip 520ms cubic-bezier(.2,0,0,1); }
    @keyframes demo-rip {
      0%   { opacity: 1; transform: scale(.3); }
      100% { opacity: 0; transform: scale(1.5); }
    }
    #demo-cap {
      position: fixed; z-index: 2147483645; left: 50%; bottom: 34px;
      transform: translateX(-50%) translateY(8px);
      max-width: 74vw; padding: 11px 20px;
      border-radius: 999px;
      background: rgba(16,20,26,.9);
      -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      box-shadow: 0 10px 40px rgba(0,0,0,.35);
      color: #fff; font: 500 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      letter-spacing: -.01em; text-align: center;
      opacity: 0; transition: opacity 300ms ease, transform 300ms cubic-bezier(.2,0,0,1);
      pointer-events: none; white-space: nowrap;
    }
    #demo-cap.on { opacity: 1; transform: translateX(-50%) translateY(0); }
  \`
  document.documentElement.appendChild(css)

  const mk = () => {
    if (document.getElementById('demo-cursor')) return
    const c = document.createElement('div')
    c.id = 'demo-cursor'
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 2.5 L5 19 L9.2 15.1 L11.9 21.2 L14.9 19.9 L12.2 13.9 L18 13.6 Z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    const r = document.createElement('div')
    r.id = 'demo-ripple'
    document.body.appendChild(r)
    const p = document.createElement('div')
    p.id = 'demo-cap'
    document.body.appendChild(p)
  }
  if (document.body) mk()
  else document.addEventListener('DOMContentLoaded', mk)

  window.__demoMove = (x, y) => {
    const c = document.getElementById('demo-cursor')
    if (c) c.style.transform = 'translate(' + x + 'px,' + y + 'px)'
  }
  window.__demoClick = (x, y) => {
    const r = document.getElementById('demo-ripple')
    if (!r) return
    r.style.left = x + 'px'
    r.style.top = y + 'px'
    r.classList.remove('go')
    void r.offsetWidth
    r.classList.add('go')
  }
  window.__demoSay = (t) => {
    const p = document.getElementById('demo-cap')
    if (!p) return
    if (!t) { p.classList.remove('on'); return }
    p.textContent = t
    p.classList.add('on')
  }
})()
`

async function main() {
  if (!(await reachable(URL))) {
    console.error(`\n  The dev server is not answering on ${URL}.`)
    console.error('  Start it first (npm run dev), then run this again.\n')
    process.exit(1)
  }

  await rm(TMP_DIR, { recursive: true, force: true })
  await mkdir(TMP_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await launch()
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP_DIR, size: { width: W, height: H } },
  })
  await ctx.addInitScript(OVERLAY)

  const page = await ctx.newPage()
  current = page
  const ui = makeUi(page)

  /* The walkthrough must not interrupt the recording — it is a different
     product surface and it is what the recording is FOR. Marked seen before
     the app boots. */
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem('idp.board-tour.seen', '1')
      window.localStorage.setItem('idp.tour.seen', '1')
    } catch {}
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  await storyboard(page, ui)

  /* Fade the caption, hold on the finished screen for a beat, then stop. A
     recording that cuts on the last click reads as a crash. */
  await ui.say(null)
  await page.waitForTimeout(1600)

  await ctx.close()
  await browser.close()

  const written = await collect()
  console.log(`\n  Wrote ${path.relative(ROOT, written.file)}  (${written.mb} MB)`)
  console.log(`  Steps skipped: ${failures}`)

  /* Measure what was actually written, rather than trusting the storyboard's
     own arithmetic. `DEMO_VIDEO.duration` is on a button, and a button that
     promises two minutes of a seventy-second video is a small lie the reader
     catches immediately. */
  const secs = await measure()
  if (secs) {
    console.log(`\n  Length: ${clock(secs)}. If that differs from DEMO_VIDEO.duration in`)
    console.log(`  src/brand/tour/board-tour.ts, set it to '${clock(secs)}'.\n`)
  } else {
    console.log('\n  Could not measure the length — check DEMO_VIDEO.duration by hand.\n')
  }
}

/* Read the finished file's duration back through a browser, which is the one
   media decoder this toolchain is guaranteed to have. Playwright bundles an
   ffmpeg, but it is an encoder invoked internally and not a probe, and there is
   no system ffmpeg here — see the note at the top of this file. */
async function measure() {
  try {
    const browser = await launch()
    const page = await browser.newPage()
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    const secs = await page.evaluate(
      (src) =>
        new Promise((res) => {
          const v = document.createElement('video')
          v.preload = 'metadata'
          v.onloadedmetadata = () => res(v.duration)
          v.onerror = () => res(0)
          setTimeout(() => res(0), 12000)
          v.src = src
        }),
      '/policy-board-demo.webm',
    )
    await browser.close()
    return secs || null
  } catch {
    return null
  }
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/* --- The storyboard ---------------------------------------------------------

   Beats, in the order somebody meets them: arrive, create, build one rule
   properly, add the second rule that makes ORDER matter, read it back, publish.

   Timings are generous. A demo that moves faster than a viewer can read is a
   demo that gets scrubbed rather than watched.
   -------------------------------------------------------------------------- */
async function storyboard(page, ui) {
  await ui.say('Every sign-in to every application is decided by a policy.')
  await page.waitForTimeout(2600)

  await step('open the policies list', async () => {
    await ui.click(page.getByRole('button', { name: 'All Policies', exact: true }))
    await page.waitForTimeout(900)
  })

  await ui.say('A policy is a list of rules, read top to bottom.')
  await page.waitForTimeout(2400)

  await step('start a new policy', async () => {
    await ui.click(page.getByRole('button', { name: 'New policy', exact: true }))
    await page.waitForTimeout(700)
  })

  await ui.say('Name it, and say which application it protects.')
  await step('name it', async () => {
    const field = page.locator('input[type="text"]').first()
    await field.click()
    await ui.type(field, 'Finance — high-risk sign-ins')
    await page.waitForTimeout(500)
  })

  /* The picker is a `combobox` with the field's own label on it, and its rows
     are `option`s — see picker.tsx. Guessing at "a button that says something
     like application" is what missed it on the first run. */
  await step('choose the application', async () => {
    await ui.click(page.getByRole('combobox', { name: /applications this policy protects/i }))
    await page.waitForTimeout(700)
    await ui.click(page.getByRole('option', { name: /workday/i }).first())
    await page.waitForTimeout(500)
    /* Shut the picker by pressing its own trigger again.

       This one is MULTIPLE, so it stays open after a choice — which is correct
       for a field that can take several applications, and it means the open
       listbox is lying across the dialog's footer. Two wrong answers before
       this: clicking Create through the open list hit the list, and pressing
       Escape to dismiss it reached the dialog instead and cancelled the whole
       creation. Toggling the trigger closes exactly the thing that is open. */
    await ui.click(page.getByRole('combobox', { name: /applications this policy protects/i }))
    await page.waitForTimeout(500)
  })

  await step('create it', async () => {
    await ui.click(page.getByRole('button', { name: /create policy/i }))
    await page.waitForTimeout(1800)
  })

  await ui.say('A new policy is empty. Nothing is decided yet.')
  await page.waitForTimeout(2400)

  await step('start from scratch', async () => {
    await ui.click(page.getByRole('button', { name: /start from scratch/i }))
    await page.waitForTimeout(1200)
  })

  await ui.say('A rule answers three questions: who, when, and what happens.')
  await page.waitForTimeout(2800)

  /* `aria-label="Rule name"` — see RuleHead in Inspector.tsx. The first run
     reached for `.bb__insp input[type="text"]`, which matched the panel's
     SEARCH field on some steps and nothing at all on others. */
  await step('name the rule', async () => {
    await ui.retype(page.getByLabel('Rule name'), 'Block high-risk devices')
    await page.waitForTimeout(600)
  })

  await ui.say('Who: naming a group hides the rule from everybody else.')
  await step('choose the audience', async () => {
    await ui.click(page.getByRole('button', { name: /choose people/i }).first())
    await page.waitForTimeout(900)
    // The rows are checkboxes, and the footer counts what is ticked.
    await ui.click(page.getByRole('checkbox', { name: /^Finance/ }).first())
    await page.waitForTimeout(700)
    await ui.click(page.getByRole('button', { name: /save \d+ selected/i }))
    await page.waitForTimeout(1000)
  })

  await ui.say('When: a condition is a fact about the sign-in happening now.')
  await step('add a condition', async () => {
    await ui.click(page.getByRole('button', { name: 'Add a condition' }).first())
    await page.waitForTimeout(900)
    await ui.click(page.getByText(/risk score/i).first())
    await page.waitForTimeout(1200)
  })

  await ui.say('Then: allow, ask for a second factor, or refuse.')
  /* The three outcomes are `radio`s carrying their label — not buttons. */
  await step('choose the outcome', async () => {
    await ui.click(page.getByRole('radio', { name: 'Deny' }))
    await page.waitForTimeout(1400)
  })

  await ui.say('One rule, finished. Now the one underneath it.')
  await page.waitForTimeout(2000)

  await step('add a second rule', async () => {
    await ui.click(page.getByRole('button', { name: /add a rule at the end/i }))
    await page.waitForTimeout(1300)
    await ui.retype(page.getByLabel('Rule name'), 'Everyone else — verify')
    await page.waitForTimeout(500)
    await ui.click(page.getByRole('radio', { name: 'Require a second factor' }))
    await page.waitForTimeout(1200)
  })

  await ui.say('First match wins, so the order of the list is the policy.')
  await page.waitForTimeout(2800)

  await step('read every condition', async () => {
    await ui.click(page.getByRole('radio', { name: /detailed/i }))
    await page.waitForTimeout(1800)
  })

  await ui.say('And nothing is live until you publish it.')
  await step('publish', async () => {
    await ui.click(page.getByRole('button', { name: /review &/i }).first())
    await page.waitForTimeout(1600)
    const confirm = page.getByRole('button', { name: /^(confirm|publish|save)/i }).last()
    if (await confirm.count()) await ui.click(confirm)
    await page.waitForTimeout(1800)
  })

  await ui.say('Written, checked, and published — in under two minutes.')
  await page.waitForTimeout(3000)
}

/* --- The driver -------------------------------------------------------------

   `click` is the interesting one: it puts the fake cursor on the target,
   glides the real mouse there, fires the ripple and only then clicks. The glide
   is what makes the recording readable — a pointer that teleports gives the
   viewer nothing to follow between one control and the next.
   -------------------------------------------------------------------------- */
function makeUi(page) {
  let at = { x: W / 2, y: H / 2 }

  const move = async (x, y, ms = 420) => {
    const steps = Math.max(8, Math.round(ms / 16))
    const from = { ...at }
    for (let i = 1; i <= steps; i++) {
      /* Ease-in-out, so the pointer accelerates away and settles rather than
         sliding at a constant machine speed. */
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const nx = from.x + (x - from.x) * e
      const ny = from.y + (y - from.y) * e
      await page.mouse.move(nx, ny)
      await page.evaluate(([a, b]) => window.__demoMove?.(a, b), [nx, ny])
      await page.waitForTimeout(16)
    }
    at = { x, y }
  }

  return {
    async say(text) {
      await page.evaluate((t) => window.__demoSay?.(t), text)
      if (text) await page.waitForTimeout(420)
    },
    async click(locator) {
      await locator.first().waitFor({ state: 'visible', timeout: 6000 })
      const box = await locator.first().boundingBox()
      if (!box) throw new Error('no bounding box')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await move(x, y)
      await page.evaluate(([a, b]) => window.__demoClick?.(a, b), [x, y])
      await page.waitForTimeout(180)
      await page.mouse.click(x, y)
    },
    /* Typed a character at a time. `fill()` would drop the whole string in one
       frame, which on a recording looks like a paste rather than like a person
       naming their policy. */
    async type(locator, text) {
      await locator.first().type(text, { delay: 46 })
    },
    /* Select-all then type, for a field that already has a value. The cursor
       travels to it first, so the recording shows where the caret went. */
    async retype(locator, text) {
      const el = locator.first()
      await el.waitFor({ state: 'visible', timeout: 6000 })
      const box = await el.boundingBox()
      if (box) await move(box.x + box.width / 2, box.y + box.height / 2)
      await el.click()
      await page.keyboard.press('ControlOrMeta+a')
      await el.type(text, { delay: 46 })
    },
  }
}

/* Tolerant, and LOUD about where it was when it gave up.

   A recording that stops dead two thirds through because one label was renamed
   is worse than one that skips a beat and still ends with a published policy.
   But a bare "timeout" tells you nothing about which screen you were on, and
   the first debugging round here was spent discovering that eight consecutive
   failures were one cancelled dialog five steps earlier. So a failure prints
   what was actually on screen. */
async function step(what, fn) {
  try {
    await fn()
    console.log(`  ok    ${what}`)
  } catch (err) {
    failures++
    console.log(`  SKIP  ${what} — ${String(err).split('\n')[0].slice(0, 100)}`)
    if (current) {
      try {
        const where = await current.evaluate(() => ({
          headings: Array.from(document.querySelectorAll('h1,h2')).map((h) => h.textContent.trim()).slice(0, 3),
          dialog: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
          board: !!document.querySelector('.bb'),
        }))
        console.log(`        on screen: ${JSON.stringify(where)}`)
      } catch {
        /* the page is gone; the message above is all there is */
      }
    }
  }
}

async function launch() {
  /* No bundled Chromium on this machine — the download fails behind the
     network here — and there is no need for one: Playwright drives an installed
     Chrome or Edge just as well, and the recording path is the same DevTools
     screencast either way. */
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, args: ['--hide-scrollbars', '--force-device-scale-factor=1'] })
    } catch {
      /* try the next one */
    }
  }
  return chromium.launch()
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/* Playwright names the file after the page's guid and only finalises it when
   the context closes, so the move happens here rather than inline. */
async function collect() {
  const files = (await readdir(TMP_DIR)).filter((f) => f.endsWith('.webm'))
  if (!files.length) throw new Error('Playwright wrote no video')
  const newest = (
    await Promise.all(
      files.map(async (f) => ({ f, t: (await stat(path.join(TMP_DIR, f))).mtimeMs })),
    )
  ).sort((a, b) => b.t - a.t)[0].f

  if (existsSync(OUT_FILE)) await rm(OUT_FILE)
  await rename(path.join(TMP_DIR, newest), OUT_FILE)
  await rm(TMP_DIR, { recursive: true, force: true })
  const { size } = await stat(OUT_FILE)
  return { file: OUT_FILE, mb: (size / 1024 / 1024).toFixed(1) }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
