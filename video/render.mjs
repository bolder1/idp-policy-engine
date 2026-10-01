/* -----------------------------------------------------------------------------
   Render the film.

     node render.mjs edl     --theme light          lay the edit out → .work/light/edl.json
     node render.mjs preview --at 3,12.5            stills of the edit → .work/<theme>/preview/
     node render.mjs video   [--workers 4]          every frame → .work/<theme>/video.mp4
     node render.mjs audio                          voice + music + sound → .work/<theme>/audio.wav
     node render.mjs mux                            → out/policy-engine-demo-<theme>.mp4 + .srt
     node render.mjs all                            edl, video, audio, mux

   --theme dark renders the dark film from .work/dark (captured with
   `capture.mjs --theme dark`) with the compositor's chrome and slides in their
   dark tokens. Capturing the product is a separate step (capture.mjs), because it
   drives the running app and takes the longest; everything here can be re-run in
   minutes against pictures that already exist.
   -------------------------------------------------------------------------- */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile, readdir, rm, stat, rename, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

import { serve } from './lib/server.mjs'
import { buildEdl, toSrt } from './lib/edl.mjs'
import { loadVO, readWav } from './lib/vo.mjs'
import { renderAudio } from './audio/synth.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'all'
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : dflt
}
const THEME = opt('theme', process.env.THEME ?? 'light')
if (!['light', 'dark'].includes(THEME)) throw new Error(`--theme must be light or dark, not ${THEME}`)
// FILM=storyboard/film-smoke.mjs renders a different edit over the same takes, for testing
const { film } = await import(pathToFileURL(path.resolve(HERE, process.env.FILM ?? 'storyboard/film-v2.mjs')).href)
const WORK = path.resolve(HERE, opt('work', process.env.WORK_DIR ?? `.work/${THEME}`))
const OUT = path.join(HERE, 'out')
const APP_PUBLIC = path.resolve(HERE, '..', 'public')
const ASSETS = path.join(HERE, 'assets')
const FPS = Number(process.env.FPS ?? 30)
const FF = ffmpegInstaller.path
const NAME = process.env.FILM_NAME ?? `policy-engine-demo-${THEME}`

async function logosMap() {
  const out = {}
  try {
    for (const f of await readdir(path.join(APP_PUBLIC, 'logos'))) out[f.replace(/\.[^.]+$/, '')] = f
  } catch {
    /* no logos, monograms instead */
  }
  return out
}

async function edl() {
  const voDir = path.resolve(HERE, opt('vo', '.work/vo'))
  const vo = existsSync(voDir) ? await loadVO(voDir) : new Map()
  const e = await buildEdl({ film: { ...film, logos: await logosMap() }, workDir: WORK, fps: FPS, vo })
  e.theme = THEME
  await mkdir(WORK, { recursive: true })
  await writeFile(path.join(WORK, 'edl.json'), JSON.stringify(e))
  await writeFile(path.join(WORK, 'captions.srt'), toSrt(e.captions))
  const mins = `${Math.floor(e.duration / 60)}:${String(Math.round(e.duration % 60)).padStart(2, '0')}`
  console.log(`edit (${THEME}): ${mins} · ${e.items.length} items · ${e.captions.length} lines (${e.voice.length} voiced) · ${e.sfx.length} sounds`)
  return e
}

async function withCompositor(fn, e) {
  const server = await serve(
    {
      '/compose': path.join(HERE, 'compose'),
      '/work': WORK,
      '/app': APP_PUBLIC,
      '/assets': ASSETS,
    },
    e ? { '/work/edl.json': JSON.stringify(e) } : {},
  )
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  })
  try {
    return await fn({ base: server.url, browser })
  } finally {
    await browser.close()
    await server.close()
  }
}

async function openPage(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${base}/compose/index.html?theme=${THEME}`, { waitUntil: 'load' })
  const info = await page.evaluate(([u, theme]) => window.COMPOSE.init(u, { theme }), [`${base}/work/edl.json`, THEME])
  const cdp = await ctx.newCDPSession(page)
  return { page, cdp, info, errors, ctx }
}

async function preview() {
  const e = await edl()
  const at = String(opt('at', '2,6,12')).split(',').map(Number)
  const dir = path.join(WORK, 'preview')
  await mkdir(dir, { recursive: true })
  await withCompositor(async ({ base, browser }) => {
    const { page, cdp, errors } = await openPage(browser, base)
    for (const s of at) {
      const i = Math.round(s * FPS)
      await page.evaluate((n) => window.COMPOSE.renderFrame(n), i)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })
      const file = path.join(dir, `at-${s.toFixed(2).replace('.', '_')}.jpg`)
      await writeFile(file, Buffer.from(data, 'base64'))
      console.log(file)
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 5))
  }, e)
}

function encoder(file) {
  const ff = spawn(
    FF,
    [
      '-y',
      '-loglevel', 'error',
      '-f', 'image2pipe',
      '-framerate', String(FPS),
      '-c:v', 'mjpeg',
      '-i', '-',
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '17',
      '-tune', 'animation',
      '-g', String(FPS * 2),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart',
      file,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  return ff
}

async function video() {
  const e = await edl()
  const total = Math.round(e.duration * FPS)
  const from = Math.round(Number(opt('from', 0)) * FPS)
  const to = Math.min(total, Math.round(Number(opt('to', e.duration)) * FPS))
  const workers = Math.max(1, Number(opt('workers', 4)))
  const segDir = path.join(WORK, 'segments')
  await rm(segDir, { recursive: true, force: true })
  await mkdir(segDir, { recursive: true })
  const span = Math.ceil((to - from) / workers)
  const t0 = Date.now()
  const done = new Array(workers).fill(0)
  const tick = setInterval(() => {
    const n = done.reduce((a, b) => a + b, 0)
    const rate = n / ((Date.now() - t0) / 1000)
    const eta = rate > 0 ? Math.round((to - from - n) / rate) : 0
    process.stdout.write(`\r  frames ${n}/${to - from} · ${rate.toFixed(1)}/s · eta ${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s   `)
  }, 2000)
  await withCompositor(async ({ base, browser }) => {
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const a = from + w * span
        const b = Math.min(to, a + span)
        if (a >= b) return
        const file = path.join(segDir, `seg-${String(w).padStart(2, '0')}.mp4`)
        const { page, cdp, errors, ctx } = await openPage(browser, base)
        const ff = encoder(file)
        const closed = once(ff, 'close')
        for (let i = a; i < b; i++) {
          await page.evaluate((n) => window.COMPOSE.renderFrame(n), i)
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 })
          if (!ff.stdin.write(Buffer.from(data, 'base64'))) await once(ff.stdin, 'drain')
          done[w]++
        }
        ff.stdin.end()
        await closed
        if (errors.length) console.log(`\n  worker ${w} page errors:`, errors.slice(0, 3))
        await ctx.close()
      }),
    )
  }, e)
  clearInterval(tick)
  const segs = (await readdir(segDir)).filter((f) => f.endsWith('.mp4')).sort()
  const list = path.join(segDir, 'list.txt')
  await writeFile(list, segs.map((s) => `file '${path.join(segDir, s).replace(/\\/g, '/')}'`).join('\n'))
  const outFile = path.join(WORK, 'video.mp4')
  await run(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outFile])
  console.log(`\nvideo: ${outFile} (${((Date.now() - t0) / 60000).toFixed(1)} min)`)
}

async function audio() {
  const e = await edl()
  // the voice: every spoken line's wav, placed where the edit put it
  const vo = []
  for (const v of e.voice) {
    if (!existsSync(v.file)) throw new Error(`voice file missing: ${v.file}`)
    const w = readWav(v.file)
    if (w.sampleRate !== 48000) throw new Error(`${v.file} is ${w.sampleRate} Hz, the mix is 48000`)
    vo.push({ t: v.t, samples: w.samples })
  }
  const res = await renderAudio({
    duration: e.duration,
    sections: e.sections,
    events: e.sfx,
    vo,
    outFile: path.join(WORK, 'audio.wav'),
  })
  console.log('audio:', res)
}

async function mux() {
  await mkdir(OUT, { recursive: true })
  const mp4 = path.join(OUT, `${NAME}.mp4`)
  /* Written beside the film and renamed into place. Two muxes once ran at the
     same moment (a shell orphaned by an app restart, plus a fresh one) and
     interleaved into one file that probed fine and decoded as garbage; with a
     private temp file each writer is whole, and the last rename wins. */
  const tmp = path.join(OUT, `.${NAME}.${process.pid}.mp4`)
  const srt = path.join(WORK, 'captions.srt')
  await run(FF, [
    '-y', '-loglevel', 'error',
    '-i', path.join(WORK, 'video.mp4'),
    '-i', path.join(WORK, 'audio.wav'),
    '-i', srt,
    '-map', '0:v', '-map', '1:a', '-map', '2:s',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
    '-metadata', `title=Xecurify Policy Engine — who, if, then (${THEME})`,
    '-movflags', '+faststart',
    tmp,
  ])
  await rename(tmp, mp4)
  await writeFile(path.join(OUT, `${NAME}.srt`), await readFile(srt))
  const { size } = await stat(mp4)
  console.log(`film: ${mp4} (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} exited ${code}`))))
  })
}

const COMMANDS = { edl, preview, video, audio, mux, all: async () => (await video(), await audio(), await mux()) }
if (!COMMANDS[cmd]) {
  console.error(`unknown command ${cmd}`)
  process.exit(1)
}
await COMMANDS[cmd]()
