/* -----------------------------------------------------------------------------
   A 48-second audition of the v2 soundtrack: every section kind, every effect,
   and a stand-in voice, so the models can be judged before a film exists.

     node audio/audition-v2.mjs out.wav [--sfx-only] [--mute-voice] [--analyse]

   0–8    hook     full arrangement; a riser into the whiteboard, boing + land
   8–20   board    pad and soft pluck, no kick; two marker strokes
   20–36  demo     the groove; ten mouse clicks, a lone key, a lone space,
                   a 2-second burst of MX Blue at 16 keys per second (with
                   spaces, a backspace and an enter), two chords, chime, pop,
                   success; a synthetic voice from 24 to 30 s that the music
                   ducks under
   36–40  banner   fill + hit, swoosh in and out
   40–48  outro

   --sfx-only   mutes the music and the voice, so an effect can be inspected on
                its own in a spectrogram
   --mute-voice keeps the voice's ducking but takes the voice out of the mix,
                so the dip in the bed can be measured
   --analyse    renders all three variants beside out.wav and writes the
                evidence next to them with ffmpeg: volumedetect per section,
                spectrograms and waveforms of one key, one space, one click,
                the typing burst and the duck region

   The voice is a 200 Hz buzz with a syllabic amplitude at 4 Hz — not speech,
   but it has speech's envelope, which is all the ducker looks at.
   -------------------------------------------------------------------------- */
import { spawn } from 'node:child_process'
import path from 'node:path'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { renderAudio, SR } from './synth.mjs'

const out = process.argv[2] ?? 'audition-v2.wav'
const flags = new Set(process.argv.slice(3))

const sections = [
  { start: 0, end: 8, kind: 'hook' },
  { start: 8, end: 20, kind: 'board' },
  { start: 20, end: 36, kind: 'demo' },
  { start: 36, end: 40, kind: 'banner' },
  { start: 40, end: 48, kind: 'outro' },
]

const events = []
// hook → board: the riser lands on the push, the mascot jumps onto the board
events.push({ type: 'riser', t: 8, gain: 0.8, dur: 1.4 }, { type: 'thump', t: 8, gain: 0.9 }, { type: 'sparkle', t: 8.05, gain: 0.7 })
events.push({ type: 'boing', t: 8.6 }, { type: 'land', t: 9.0 })
// two marker strokes on the whiteboard
events.push({ type: 'marker', t: 10.5, dur: 1.8 }, { type: 'marker', t: 13, dur: 1.1 })
// into the console
events.push({ type: 'whoosh', t: 20, gain: 0.7 })
// ten mouse clicks, panned as a cursor crossing the screen would be
for (let k = 0; k < 10; k++) events.push({ type: 'click', t: 20.4 + k * 1.45, pan: -0.35 + (k % 5) * 0.175 })
// a lone key and a lone space, far enough from everything else to be inspected on their own
events.push({ type: 'mxblue', t: 21.0, key: 'a' }, { type: 'mxblue', t: 21.5, key: ' ' })
// a burst of typing at 16 keys per second, with the big keys mixed in
const typed = [...'Allow if de', 'Backspace', ...'evice is managed', 'Enter', ...'Ok']
for (let k = 0; k < 32; k++) events.push({ type: 'mxblue', t: 22 + k / 16, key: typed[k % typed.length] })
// chords, as press() emits them
events.push({ type: 'mxblue', t: 25.0, key: 'Control+z', gain: 1.1 }, { type: 'mxblue', t: 25.6, key: 'Shift+Tab', gain: 1.1 })
// the rest of the console vocabulary
events.push({ type: 'chime', t: 31 }, { type: 'pop', t: 32 }, { type: 'success', t: 34 })
// banner: swoosh in, land, swoosh out — what the EDL emits
events.push({ type: 'swoosh', t: 36.05, gain: 0.8 }, { type: 'thump', t: 36.45, gain: 0.7 }, { type: 'swoosh', t: 39.55, gain: 0.6, dir: -1 })
events.push({ type: 'sparkle', t: 41 })

/* A stand-in voice: a buzz with the envelope of someone talking. */
function buzz(seconds) {
  const s = new Float32Array(Math.floor(seconds * SR))
  for (let i = 0; i < s.length; i++) {
    const t = i / SR
    let v = 0
    for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * 200 * h * t) / h
    const syllable = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * 4 * t), 1.5)
    const edges = Math.min(1, t / 0.1, (seconds - t) / 0.1)
    s[i] = v * 0.3 * syllable * edges
  }
  return s
}

async function render(outFile, { sfxOnly = false, muteVoice = false } = {}) {
  const t0 = performance.now()
  const res = await renderAudio({
    duration: 48,
    sections,
    events,
    vo: sfxOnly ? [] : [{ t: 24, samples: buzz(6) }],
    outFile,
    musicDb: sfxOnly ? -120 : -2,
    voiceDb: muteVoice ? -120 : 0,
  })
  console.log(path.basename(outFile), res, `${Math.round(performance.now() - t0)}ms`)
}

/* --- the evidence ---------------------------------------------------------- */
function ff(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegInstaller.path, ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err.trim().split('\n').pop()))))
  })
}
async function levels(file, ss, t) {
  const log = await ff(['-ss', String(ss), '-t', String(t), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const pick = (k) => (log.match(new RegExp(`${k}: (-?[\\d.]+) dB`)) ?? [])[1]
  return { mean: pick('mean_volume'), max: pick('max_volume') }
}
/* This ffmpeg (2018) sizes showspectrumpic's FFT from the image height, so a
   short image (128 px → 256-point, 5 ms) keeps a key's 12 ms-apart transients
   apart; the picture is scaled up afterwards so it can be read. */
const spectrum = (file, ss, t, png, { h = 128, w = 1400, stop = 12000, legend = 0 } = {}) =>
  ff(['-loglevel', 'error', '-ss', String(ss), '-t', String(t), '-i', file, '-lavfi', `showspectrumpic=mode=combined:color=intensity:scale=log:legend=${legend}:stop=${stop}:s=${w}x${h}${legend ? '' : `,scale=${w}:512:flags=neighbor`}`, png])
const wave = (file, ss, t, png, w = 1400) =>
  ff(['-loglevel', 'error', '-ss', String(ss), '-t', String(t), '-i', file, '-lavfi', `showwavespic=s=${w}x300:colors=orange`, png])

async function analyse() {
  const dir = path.dirname(out)
  const base = path.basename(out, '.wav')
  const full = out
  const sfx = path.join(dir, `${base}-sfx.wav`)
  const novoice = path.join(dir, `${base}-novoice.wav`)
  await render(full)
  await render(sfx, { sfxOnly: true })
  await render(novoice, { muteVoice: true })

  console.log('\nlevels (dBFS, ffmpeg volumedetect)')
  const rows = [
    ['whole file', full, 0, 48],
    ['hook 0–8', full, 0, 8],
    ['board 14.5–20 (music only)', full, 14.5, 5.5],
    ['demo 30–36', full, 30, 6],
    ['banner 36–40', full, 36, 4],
    ['outro 41.5–45.5', full, 41.5, 4],
    ['duck: bed before voice 18–24 (voice muted)', novoice, 18, 6],
    ['duck: bed under voice 24.3–29.7 (voice muted)', novoice, 24.3, 5.4],
    ['duck: bed after voice 31–35 (voice muted)', novoice, 31, 4],
    ['effects alone', sfx, 0, 48],
  ]
  for (const [label, file, ss, t] of rows) {
    const l = await levels(file, ss, t)
    console.log(`  ${label.padEnd(48)} mean ${l.mean.padStart(6)}  peak ${l.max.padStart(6)}`)
  }

  const p = (name) => path.join(dir, `${base}-${name}.png`)
  await spectrum(sfx, 20.98, 0.35, p('01-key-a-spectrum'))
  await wave(sfx, 20.98, 0.35, p('01-key-a-wave'))
  await spectrum(sfx, 21.48, 0.35, p('01b-key-space-spectrum'))
  await wave(sfx, 21.48, 0.35, p('01b-key-space-wave'))
  await spectrum(sfx, 20.39, 0.16, p('02-click-spectrum'))
  await wave(sfx, 20.39, 0.16, p('02-click-wave'))
  await spectrum(full, 20, 16, p('03-duck-spectrum'), { h: 500, w: 1600, stop: 8000, legend: 1 })
  await wave(novoice, 18, 18, p('03b-duck-novoice-wave'), 1600)
  await spectrum(sfx, 21.9, 2.4, p('04-burst-spectrum'), { h: 256, w: 1200 })
  await spectrum(full, 0, 48, p('05-full-spectrum'), { h: 500, w: 1800, stop: 6000, legend: 1 })
  await wave(full, 0, 48, p('05-full-wave'), 1800)
  console.log(`\nevidence in ${dir}/${base}-*.png`)
}

if (flags.has('--analyse')) await analyse()
else await render(out, { sfxOnly: flags.has('--sfx-only'), muteVoice: flags.has('--mute-voice') })
