/* -----------------------------------------------------------------------------
   Picture, soundtrack, subtitles — the finished file for the third cut.

   The picture is Chrome's own screencast frames (JPEG q92) laid on a 30 fps
   timeline by their timestamps; each frame holds until the next one arrives.
   Every time in timeline.json is on the same clock (t0), so the voice, the
   clicks and the keystrokes land where they happened — no sync mark.

     node mix3.mjs [--music -8] [--sfx -10]
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { SUBS } from './script.mjs'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path
const { renderAudio } = await import(`${U(VIDEO)}/audio/synth.mjs`)
const { readWav } = await import(`${U(VIDEO)}/lib/vo.mjs`)

const HERE = import.meta.dirname
const TAKE = path.join(HERE, process.argv.includes('--short') ? 'take-short' : 'take')
const VOICE = path.join(HERE, 'voice')
const OUT = path.join(HERE, 'out')
fs.mkdirSync(OUT, { recursive: true })
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d }
const NAME = 'policy-engine'

const tl = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
const FR = path.join(TAKE, 'frames')

/* --- the picture ------------------------------------------------------------ */
/* real timestamp → film time, through the slow-motion segments */
const segs = tl.segs ?? [{ real: tl.t0, film: 0, slow: 1 }]
const film = (ts) => { let s = segs[0]; for (const x of segs) if (x.real <= ts) s = x; return s.film + (ts - s.real) / s.slow }
const frames = tl.frames.map(([f, ts]) => ({ f, t: film(ts) })).sort((a, b) => a.t - b.t)
const dur = tl.duration
const first = frames.findLastIndex((x) => x.t <= 0)
const use = frames.slice(Math.max(0, first)).filter((x) => x.t < dur)
if (use.length && use[0].t > 0) use[0] = { ...use[0], t: 0 }
if (use.length) use[0].t = 0
let list = ''
for (let i = 0; i < use.length; i++) {
  const next = i + 1 < use.length ? use[i + 1].t : dur
  const d = Math.max(0.001, next - use[i].t)
  list += `file '${path.join(FR, use[i].f).replace(/\\/g, '/')}'\nduration ${d.toFixed(4)}\n`
}
list += `file '${path.join(FR, use[use.length - 1].f).replace(/\\/g, '/')}'\n`
const listFile = path.join(TAKE, 'frames.txt')
fs.writeFileSync(listFile, list)
const gaps = use.slice(1).map((x, i) => x.t - use[i].t)
console.log(`frames: ${use.length} over ${dur.toFixed(1)}s — mean ${(use.length / dur).toFixed(1)} fps, longest gap ${Math.max(...gaps).toFixed(2)}s`)

const pic = path.join(TAKE, 'picture.mp4')
if (!fs.existsSync(pic) || process.argv.includes('--repic')) {
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-t', dur.toFixed(3), pic], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error('picture: ' + r.stderr)
}
console.log('picture:', pic)
if (process.argv.includes('--pic-only')) process.exit(0)

/* --- the soundtrack ---------------------------------------------------------- */
const vo = tl.voice.map(({ id, t }) => {
  const w = readWav(path.join(VOICE, `${id}.wav`))
  if (w.sampleRate !== 48000) throw new Error(`${id} is ${w.sampleRate} Hz`)
  return { t, samples: w.samples }
})
const audio = path.join(OUT, 'audio.wav')
const res = await renderAudio({ duration: dur, sections: tl.sections, events: tl.events, vo, outFile: audio, musicDb: arg('music', -8), sfxDb: arg('sfx', -10) })
console.log('audio:', res)

/* --- subtitles ----------------------------------------------------------------- */
const clock = (s) => {
  const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
const srt = tl.voice.map((v, i) => `${i + 1}\n${clock(v.t)} --> ${clock(v.t + v.d)}\n${(SUBS[v.id] ?? '').replace(/<[^>]+>/g, '')}\n`).join('\n')
const srtFile = path.join(OUT, `${NAME}.srt`)
fs.writeFileSync(srtFile, srt, 'utf8')

/* --- mux ------------------------------------------------------------------------ */
const mp4 = path.join(OUT, `${NAME}.mp4`)
const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', pic, '-i', audio, '-i', srtFile, '-map', '0:v', '-map', '1:a', '-map', '2:s',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
  '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', '-metadata', 'title=Xecurify Policy Engine', mp4], { encoding: 'utf8' })
if (r.status !== 0) throw new Error('mux: ' + r.stderr)
const phone = path.join(OUT, `${NAME}-phone.mp4`)
const r2 = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', mp4, '-map', '0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '112k', '-c:s', 'mov_text', '-movflags', '+faststart', phone], { encoding: 'utf8' })
if (r2.status !== 0) throw new Error('phone: ' + r2.stderr)
const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1)
console.log(`master: ${mp4} (${mb(mp4)} MiB)\nphone:  ${phone} (${mb(phone)} MiB)`)
const vd = spawnSync(FFMPEG, ['-v', 'info', '-i', mp4, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
for (const l of vd.stderr.split('\n')) if (/mean_volume|max_volume/.test(l)) console.log('   ', l.trim())
