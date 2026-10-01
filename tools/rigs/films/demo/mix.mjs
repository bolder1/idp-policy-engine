/* -----------------------------------------------------------------------------
   The soundtrack, and the finished file.

   Three buses, all composed in code — there are no sample files anywhere in
   this: a music bed that thins out over the console and opens on the cards, the
   interface sounds placed on the clicks and keystrokes the recorder logged, and
   the voice sitting on top with the music ducking under every line.

   Then the picture: the webm the browser recorded, upscaled to 1080p with
   lanczos, muxed with the mix, and decoded end to end to prove the file is
   whole before it goes anywhere.

     node rec/demo/mix.mjs [--music -9] [--sfx -7]
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path
const { renderAudio } = await import(`${U(VIDEO)}/audio/synth.mjs`)
const { readWav } = await import(`${U(VIDEO)}/lib/vo.mjs`)

const HERE = import.meta.dirname
const TAKE = path.join(HERE, 'take')
const VOICE = path.join(HERE, 'voice')
const OUT = path.join(HERE, 'out')
fs.mkdirSync(OUT, { recursive: true })

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : dflt
}
const musicDb = arg('music', -9)
const sfxDb = arg('sfx', -7)

const tl = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
const webm = fs.readdirSync(TAKE).filter((f) => f.endsWith('.webm')).map((f) => path.join(TAKE, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
if (!webm) throw new Error('no recording in ' + TAKE)

/* The picture's own length, read off the file rather than trusted from the
   script's clock. The mix is cut to the PICTURE: a soundtrack even a little
   longer than the video is a file that ends on silence in some players and is
   truncated in others. */
const probe = spawnSync(FFMPEG, ['-v', 'error', '-i', webm, '-f', 'null', '-'], { encoding: 'utf8' })
const vdur = (() => {
  const r = spawnSync(FFMPEG, ['-v', 'info', '-i', webm, '-f', 'null', '-'], { encoding: 'utf8' })
  const m = r.stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g)
  if (!m) return tl.duration
  const last = m[m.length - 1].slice(5).split(':').map(Number)
  return last[0] * 3600 + last[1] * 60 + last[2]
})()
if (probe.status !== 0) throw new Error('the recording will not decode: ' + probe.stderr)

console.log(`picture: ${vdur.toFixed(1)}s   script clock: ${tl.duration.toFixed(1)}s   drift: ${(vdur - tl.duration).toFixed(2)}s`)

/* The voice, each line placed where the take started it. */
const vo = []
for (const { id, t } of tl.voice) {
  const f = path.join(VOICE, `${id}.wav`)
  if (!fs.existsSync(f)) throw new Error(`missing voice file ${f}`)
  const w = readWav(f)
  if (w.sampleRate !== 48000) throw new Error(`${id} is ${w.sampleRate} Hz, the mix is 48000`)
  vo.push({ t, samples: w.samples })
}

const audio = path.join(OUT, 'audio.wav')
const res = await renderAudio({
  duration: vdur,
  sections: tl.sections,
  events: tl.events,
  vo,
  outFile: audio,
  musicDb,
  sfxDb,
})
console.log('audio:', res)

/* Picture + sound. `-shortest` is deliberate: whichever runs out first ends the
   file, so a half second of drift cannot leave a tail of silence. */
const mp4 = path.join(OUT, 'policy-engine-demo.mp4')
const tmp = path.join(OUT, `.mix.${process.pid}.mp4`)
const r = spawnSync(FFMPEG, [
  '-y', '-v', 'error',
  '-i', webm,
  '-i', audio,
  '-map', '0:v', '-map', '1:a',
  '-vf', 'scale=1920:1080:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart',
  '-shortest',
  '-metadata', 'title=Xecurify Policy Engine — demo',
  tmp,
], { encoding: 'utf8' })
if (r.status !== 0) throw new Error('mux: ' + r.stderr)

const check = spawnSync(FFMPEG, ['-v', 'error', '-i', tmp, '-f', 'null', '-'], { encoding: 'utf8' })
if (check.status !== 0 || check.stderr.trim()) throw new Error('the muxed file will not decode: ' + check.stderr)
fs.renameSync(tmp, mp4)

const mb = fs.statSync(mp4).size / 1024 / 1024
console.log(`\nfilm: ${mp4}\n      ${vdur.toFixed(0)}s · ${mb.toFixed(1)} MiB · music ${musicDb} dB · sfx ${sfxDb} dB`)

/* What the mix actually measures out at, so the levels are a number and not an
   opinion. Broadcast-ish speech sits near -16 LUFS with peaks just under 0. */
const vd = spawnSync(FFMPEG, ['-v', 'info', '-i', mp4, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
for (const line of vd.stderr.split('\n')) if (/mean_volume|max_volume/.test(line)) console.log('     ', line.trim())
