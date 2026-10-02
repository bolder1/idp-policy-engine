/* -----------------------------------------------------------------------------
   Soundtrack, subtitles, and the finished file.

   The music bed and the interface sounds are composed in code (the marketing
   pipeline's synth), the voice sits on top and the music ducks under it. The
   subtitles are burned into the frame already — the band at the foot of the
   picture — and ALSO written as a real .srt and muxed as a soft track, so the
   file carries them for anyone who needs them switched on, searched, or
   translated.

     node rec/demo2/mix.mjs [--music -10] [--sfx -8]
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
const TAKE = path.join(HERE, 'take')
const VOICE = path.join(HERE, 'voice')
const OUT = path.join(HERE, 'out')
fs.mkdirSync(OUT, { recursive: true })

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d }
const musicDb = arg('music', -10)
const sfxDb = arg('sfx', -8)

const tl = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
const webm = fs.readdirSync(TAKE).filter((f) => f.endsWith('.webm')).map((f) => path.join(TAKE, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
if (!webm) throw new Error('no recording in ' + TAKE)

const probe = spawnSync(FFMPEG, ['-v', 'info', '-i', webm, '-f', 'null', '-'], { encoding: 'utf8' })
if (probe.status !== 0) throw new Error('the recording will not decode')
const m = probe.stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g)
const last = m[m.length - 1].slice(5).split(':').map(Number)
const vdur = last[0] * 3600 + last[1] * 60 + last[2]
console.log(`picture ${vdur.toFixed(1)}s · script clock ${tl.duration.toFixed(1)}s · drift ${(vdur - tl.duration).toFixed(2)}s`)

/* --- the voice ------------------------------------------------------------ */
const vo = []
for (const { id, t } of tl.voice) {
  const f = path.join(VOICE, `${id}.wav`)
  const w = readWav(f)
  if (w.sampleRate !== 48000) throw new Error(`${id} is ${w.sampleRate} Hz`)
  vo.push({ t, samples: w.samples })
}

const audio = path.join(OUT, 'audio.wav')
const res = await renderAudio({ duration: vdur, sections: tl.sections, events: tl.events, vo, outFile: audio, musicDb, sfxDb })
console.log('audio:', res)

/* --- the subtitles -------------------------------------------------------- */
/* One cue per spoken line, timed from the take. The band on screen shows the
   same words at the same moment, so the two can never disagree. */
const clock = (s) => {
  const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
const plain = (h) => h.replace(/<[^>]+>/g, '')
const srt = tl.voice
  .map((v, i) => `${i + 1}\n${clock(v.t)} --> ${clock(v.t + v.d)}\n${plain(SUBS[v.id] ?? '')}\n`)
  .join('\n')
const srtFile = path.join(OUT, 'policy-engine-demo.srt')
fs.writeFileSync(srtFile, srt, 'utf8')
console.log(`subtitles: ${tl.voice.length} cues → ${srtFile}`)

/* --- picture + sound + subtitles ------------------------------------------ */
const mp4 = path.join(OUT, 'policy-engine-demo.mp4')
const tmp = path.join(OUT, `.mix.${process.pid}.mp4`)
const r = spawnSync(FFMPEG, [
  '-y', '-v', 'error',
  '-i', webm, '-i', audio, '-i', srtFile,
  '-map', '0:v', '-map', '1:a', '-map', '2:s',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng',
  /* No `-shortest`. It stopped the file at the end of the SHORTEST stream,
     and with the subtitles muxed as a third input that was the last cue —
     nine seconds before the picture ended, which cut the whole close off the
     explainer. The audio is rendered to the picture's exact length, so there
     is nothing for it to trim. */
  '-movflags', '+faststart',
  '-metadata', 'title=Xecurify Policy Engine — demo',
  tmp,
], { encoding: 'utf8' })
if (r.status !== 0) throw new Error('mux: ' + r.stderr)
const check = spawnSync(FFMPEG, ['-v', 'error', '-i', tmp, '-f', 'null', '-'], { encoding: 'utf8' })
if (check.status !== 0 || check.stderr.trim()) throw new Error('will not decode: ' + check.stderr)
fs.renameSync(tmp, mp4)

/* A second encode that fits the 30 MiB a phone or a chat window will take. */
const web = path.join(OUT, 'policy-engine-demo-web.mp4')
const r2 = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', mp4, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-movflags', '+faststart', web], { encoding: 'utf8' })
if (r2.status !== 0) throw new Error('web encode: ' + r2.stderr)

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1)
console.log(`\nmaster: ${mp4}  (${mb(mp4)} MiB)`)
console.log(`web:    ${web}  (${mb(web)} MiB)`)
const vd = spawnSync(FFMPEG, ['-v', 'info', '-i', mp4, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
for (const l of vd.stderr.split('\n')) if (/mean_volume|max_volume/.test(l)) console.log('   ', l.trim())
