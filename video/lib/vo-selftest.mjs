/* -----------------------------------------------------------------------------
   Test harness for the voice-over module (audio/vo.py + lib/vo.mjs).

     node lib/vo-selftest.mjs
   (named vo.test.mjs until 1 Oct 2026; renamed so the app's vitest run does not collect it)

   Speaks three lines in two voices, then checks every claim the jsons make
   against the wavs themselves: duration against ffmpeg's own probe (no
   ffprobe on this machine), words monotonic and covering the text, the
   envelope one value per output frame, readWav agreeing with Python's reader.
   Then it proves the cache (a second run speaks nothing) and the failure path
   (an unknown voice rejects with vo.py's one-line error).

   Artifacts, per voice, in .work/test/vo/ and .work/test/vo-neerja/:
     vo-lines.png     waveform + envelope + word boxes on one time axis
     <id>.spec.png    a spectrogram of each line
     audition.wav     the three lines back to back, for listening
   -------------------------------------------------------------------------- */
import { spawn } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

import { ensureVO, loadVO, readWav } from './vo.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.join(HERE, '..')
const FF = ffmpegInstaller.path
const TEST = path.join(VIDEO, '.work', 'test')

const LINES = {
  'hook.1': 'Every sign-in asks one question.',
  'hook.2': 'Who is it about? When does it apply? And what happens then?',
  'hook.3': "Let's build one — from a blank policy to a saved one.",
}
const VOICES = [
  { dir: 'vo', voice: { name: 'en-IN-PrabhatNeural', rate: '+6%', pitch: '+10Hz' } },
  { dir: 'vo-neerja', voice: { name: 'en-IN-NeerjaNeural', rate: '+6%', pitch: '+10Hz' } },
]

let failures = 0
const check = (cond, msg) => {
  console.log(`  ${cond ? ' ok ' : 'FAIL'}  ${msg}`)
  if (!cond) failures++
}
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/* ffmpeg -i prints "Duration: hh:mm:ss.cc" while probing — a 10 ms reading, fine for a 50 ms tolerance */
function ffDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, ['-hide_banner', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('close', () => {
      const m = err.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/)
      if (!m) return reject(new Error(`no duration in ffmpeg output for ${file}`))
      resolve(+m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / Math.pow(10, m[4].length))
    })
  })
}
function ff(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exited ${code}`))))
  })
}

async function verify(dir, voice) {
  const vo = await loadVO(dir)
  check(vo.size === Object.keys(LINES).length, `loadVO found ${vo.size} lines`)
  const rows = []
  for (const [id, text] of Object.entries(LINES)) {
    const meta = vo.get(id)
    check(!!meta, `${id}: meta present`)
    if (!meta) continue
    console.log(`  -- ${id}  "${text}"`)
    check(meta.text === text && meta.voice === voice.name, `${id}: text and voice recorded`)

    const wav = readWav(meta.wav)
    check(wav.sampleRate === 48000 && wav.channels === 1, `${id}: wav is 48 kHz mono (${wav.sampleRate} Hz, ${wav.channels} ch)`)
    const fromSamples = wav.samples.length / wav.sampleRate
    check(Math.abs(fromSamples - meta.duration) < 1e-3, `${id}: readWav sample count ${wav.samples.length} ↔ meta duration ${meta.duration}s (Python's reader)`)
    const probed = await ffDuration(meta.wav)
    check(Math.abs(probed - meta.duration) <= 0.05, `${id}: duration ${meta.duration}s vs ffmpeg ${probed.toFixed(2)}s (Δ ${Math.round(Math.abs(probed - meta.duration) * 1000)} ms)`)
    let peak = 0
    for (const s of wav.samples) peak = Math.max(peak, Math.abs(s))
    check(peak > 0.05 && peak <= 1, `${id}: wav has signal (peak ${peak.toFixed(3)})`)

    const w = meta.words
    check(w.length > 0, `${id}: ${w.length} words`)
    let mono = true
    for (let i = 1; i < w.length; i++) if (!(w[i].t > w[i - 1].t && w[i].t >= w[i - 1].t + w[i - 1].dur - 0.01)) mono = false
    check(mono, `${id}: words monotonic and non-overlapping`)
    const last = w[w.length - 1]
    check(w[0].t >= 0 && last.t + last.dur <= meta.duration + 1e-3, `${id}: words within the wav (first ${w[0].t}s, last ends ${(last.t + last.dur).toFixed(3)}s)`)
    check(norm(w.map((x) => x.text).join('')) === norm(text), `${id}: words cover the text (${w.map((x) => x.text).join(' ')})`)

    const env = meta.env
    const frames = Math.ceil(wav.samples.length / 1600)
    check(env.length === frames && Math.abs(env.length - meta.duration * 30) <= 1, `${id}: env ${env.length} frames = ceil(samples/1600), ≈ duration×30 = ${(meta.duration * 30).toFixed(1)}`)
    check(Math.max(...env) === 1 && Math.min(...env) >= 0, `${id}: env within 0..1, peaks at 1`)
    const above = env.filter((v) => v >= 1).length
    check(above >= 1 && above <= Math.ceil(env.length * 0.06), `${id}: ${above} frames clip to 1 (≈5% by construction)`)
    // the mouth should be shut where the file is silent: the envelope must fall toward 0 at the end
    check(env[env.length - 1] < 0.1, `${id}: env ends near silence (${env[env.length - 1]})`)

    rows.push({ id, duration: meta.duration, words: w.length, first: w[0].t, ffmpeg: probed })
  }
  return { vo, rows }
}

async function draw(dir, voice, vo, browser) {
  const report = {
    voice,
    dir,
    lines: Object.keys(LINES)
      .map((id) => vo.get(id))
      .filter(Boolean)
      .map((m) => {
        const { samples } = readWav(m.wav)
        const cols = 1768
        const peaks = new Array(cols).fill(0)
        for (let c = 0; c < cols; c++) {
          const a = Math.floor((c * samples.length) / cols)
          const b = Math.floor(((c + 1) * samples.length) / cols)
          let p = 0
          for (let i = a; i < b; i++) p = Math.max(p, Math.abs(samples[i]))
          peaks[c] = p
        }
        return { id: m.id, text: m.text, duration: m.duration, words: m.words, env: m.env, peaks }
      }),
  }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(pathToFileURL(path.join(VIDEO, 'compose', 'test', 'vo-test.html')).href, { waitUntil: 'load' })
  const n = await page.evaluate((r) => window.VO_TEST.draw(r), report)
  const png = path.join(dir, 'vo-lines.png')
  await page.screenshot({ path: png, fullPage: true })
  await page.close()
  check(n === report.lines.length && errors.length === 0, `drew ${n} lines → ${png}${errors.length ? ' errors: ' + errors.join('; ') : ''}`)
  return png
}

async function audioArtifacts(dir, vo) {
  const ids = Object.keys(LINES).filter((id) => vo.has(id))
  for (const id of ids) {
    const m = vo.get(id)
    await ff(['-i', m.wav, '-lavfi', 'showspectrumpic=s=1200x300:legend=1', path.join(dir, `${id}.spec.png`)])
  }
  // the three lines back to back with 0.4 s between, for the director's ears
  // (pad_len in samples: the installed ffmpeg is a 2018 build without pad_dur)
  const inputs = ids.flatMap((id) => ['-i', vo.get(id).wav])
  const chain = ids.map((_, i) => `[${i}]apad=pad_len=${0.4 * 48000}[p${i}]`).join(';') + ';' + ids.map((_, i) => `[p${i}]`).join('') + `concat=n=${ids.length}:v=0:a=1[out]`
  const audition = path.join(dir, 'audition.wav')
  await ff([...inputs, '-filter_complex', chain, '-map', '[out]', audition])
  const { size } = await stat(audition)
  check(size > 44, `audition.wav ${(size / 1024).toFixed(0)} KB → ${audition}`)
  return audition
}

/* --------------------------------------------------------------------------- */
const t0 = Date.now()
await mkdir(TEST, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const table = []
try {
  for (const { dir: name, voice } of VOICES) {
    const dir = path.join(TEST, name)
    console.log(`\n▶ ${voice.name}  ${voice.rate} ${voice.pitch}  → ${dir}`)
    const first = await ensureVO({ lines: LINES, voice, dir })
    console.log(`  ensureVO → spoken ${first.spoken}, cached ${first.cached}`)
    const { vo, rows } = await verify(dir, voice)

    // the cache: the same lines again must speak nothing and touch nothing
    const before = await Promise.all([...vo.values()].map((m) => stat(m.wav).then((s) => s.mtimeMs)))
    const again = await ensureVO({ lines: LINES, voice, dir, log: () => {} })
    const after = await Promise.all([...vo.values()].map((m) => stat(m.wav).then((s) => s.mtimeMs)))
    check(again.spoken === 0 && again.cached === Object.keys(LINES).length, `second run: spoken ${again.spoken}, cached ${again.cached}`)
    check(before.every((t, i) => t === after[i]), 'second run left the wavs untouched')

    await draw(dir, voice, vo, browser)
    await audioArtifacts(dir, vo)
    table.push({ voice: voice.name, rows })
  }

  // a changed line re-speaks only itself
  {
    const dir = path.join(TEST, 'vo')
    const edited = { ...LINES, 'hook.1': 'Every sign-in asks one question.' + ' Really.' }
    const r = await ensureVO({ lines: edited, voice: VOICES[0].voice, dir, log: () => {} })
    check(r.spoken === 1 && r.cached === 2, `editing one line re-spoke ${r.spoken} line(s), kept ${r.cached}`)
    // and put it back, so the folder holds the script as written
    const back = await ensureVO({ lines: LINES, voice: VOICES[0].voice, dir, log: () => {} })
    check(back.spoken === 1 && back.cached === 2, `restoring it re-spoke ${back.spoken} line(s)`)
  }

  // the failure path: an unknown voice must reject with vo.py's own one-line error
  {
    const dir = path.join(TEST, 'vo-bad')
    await rm(dir, { recursive: true, force: true })
    let err = null
    await ensureVO({ lines: { 'bad.1': 'This voice does not exist.' }, voice: { name: 'en-XX-NobodyNeural' }, dir, log: () => {} }).catch((e) => (err = e))
    check(err && /^vo: "bad\.1" failed after 3 attempts: /.test(err.message), `unknown voice rejects: ${err ? err.message : 'resolved?!'}`)
    const bad = await loadVO(dir)
    check(bad.size === 0, 'and left no meta behind')
  }
} finally {
  await browser.close()
}

console.log('\nDurations (s):')
const ids = Object.keys(LINES)
console.log('  ' + 'line'.padEnd(8) + table.map((t) => t.voice.replace('Neural', '').padStart(30)).join(''))
for (const id of ids) {
  console.log(
    '  ' +
      id.padEnd(8) +
      table
        .map((t) => {
          const r = t.rows.find((x) => x.id === id)
          return (r ? `${r.duration.toFixed(2)}s · ${r.words} words · 1st @${r.first.toFixed(2)}s` : '—').padStart(30)
        })
        .join(''),
  )
}
console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' check(s) FAILED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(failures === 0 ? 0 : 1)
