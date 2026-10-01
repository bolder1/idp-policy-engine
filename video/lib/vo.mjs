/* -----------------------------------------------------------------------------
   Voice-over — the node side of audio/vo.py.

     await ensureVO({ lines, voice, dir, ffmpeg })
         lines   { id: text, ... } — storyboard/lines.mjs
         voice   { name, rate, pitch }  e.g. { name: 'en-IN-PrabhatNeural', rate: '+6%', pitch: '+10Hz' }
         dir     where the wavs and jsons live, e.g. .work/light/vo
         ffmpeg  path to ffmpeg (defaults to the installed one)
       Writes <dir>/lines.json, runs vo.py (its stdout streams through), and
       resolves { spoken, cached } — or rejects with vo.py's one-line error.

     const vo = await loadVO(dir)
       Map<id, meta> from every <dir>/<id>.json:
         { id, text, hash, voice, rate, pitch, duration, words: [{ t, dur, text }],
           env: [...], wav }            — `wav` is the absolute path of <id>.wav

     const { sampleRate, channels, samples } = readWav(file)
       `samples` is a Float32Array of the first channel, −1..1, for the audio pass.

   Capture runs ensureVO before booting the app so every `say(id)` can be paced
   to a real duration; the compositor and the audio pass read the same jsons
   back through loadVO. Nothing here talks to the network — vo.py does, and
   only for lines whose hash is not already on disk.
   -------------------------------------------------------------------------- */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'audio', 'vo.py')
// PYTHON=py -3.14 (or a venv's python) overrides the launcher
const PYTHON = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')

export async function ensureVO({ lines, voice, dir, ffmpeg = ffmpegInstaller.path, log = (s) => process.stdout.write(s) }) {
  const v = typeof voice === 'string' ? { name: voice } : voice ?? {}
  if (!v.name) throw new Error('ensureVO: voice.name is required')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'lines.json')
  await writeFile(file, JSON.stringify(lines, null, 2) + '\n')
  // `--rate=-4%` rather than `--rate -4%`: a leading minus would read as a flag
  const args = [SCRIPT, file, dir, `--voice=${v.name}`, `--rate=${v.rate ?? '+0%'}`, `--pitch=${v.pitch ?? '+0Hz'}`, `--ffmpeg=${ffmpeg}`]
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })
    let out = ''
    let err = ''
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (s) => {
      out += s
      log(s)
    })
    p.stderr.setEncoding('utf8')
    p.stderr.on('data', (s) => (err += s))
    p.on('error', (e) => reject(new Error(`could not start ${PYTHON}: ${e.message}`)))
    p.on('close', (code) => {
      if (code === 0) {
        const m = out.match(/^vo: (\d+) spoken, (\d+) cached/m)
        return resolve({ spoken: m ? Number(m[1]) : 0, cached: m ? Number(m[2]) : 0 })
      }
      reject(new Error(firstError(err, code)))
    })
  })
}

/* vo.py reports with one `vo: ...` line; anything else on stderr is a
   warning above it or a traceback below it, so the `vo:` line wins, a
   traceback's last line comes next, and the first line is the fallback. */
function firstError(stderr, code) {
  const lines = stderr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const own = lines.find((s) => s.startsWith('vo: ') && !s.startsWith('vo: warning'))
  if (own) return own
  if (lines[0]?.startsWith('Traceback')) return `vo.py: ${lines[lines.length - 1]}`
  return lines[0] ?? `vo.py exited ${code}`
}

export async function loadVO(dir) {
  const map = new Map()
  let names = []
  try {
    names = await readdir(dir)
  } catch {
    return map
  }
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    let meta
    try {
      meta = JSON.parse(await readFile(path.join(dir, name), 'utf8'))
    } catch {
      continue
    }
    // lines.json is the input, not a line
    if (!meta || typeof meta !== 'object' || typeof meta.id !== 'string' || typeof meta.duration !== 'number') continue
    meta.wav = path.join(dir, `${meta.id}.wav`)
    map.set(meta.id, meta)
  }
  return map
}

/* RIFF/WAVE, any chunk order, PCM 8/16/24/32-bit or float 32/64 — ffmpeg
   writes a LIST chunk ahead of the data, so the reader walks chunks rather
   than assuming a 44-byte header. */
export function readWav(file) {
  const b = readFileSync(file)
  if (b.length < 12 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error(`${file} is not a RIFF/WAVE file`)
  let fmt = null
  let data = null
  for (let p = 12; p + 8 <= b.length; ) {
    const id = b.toString('ascii', p, p + 4)
    const size = b.readUInt32LE(p + 4)
    const body = p + 8
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        sampleRate: b.readUInt32LE(body + 4),
        block: b.readUInt16LE(body + 12),
        bits: b.readUInt16LE(body + 14),
      }
      // WAVE_FORMAT_EXTENSIBLE carries the real format in its sub-format GUID
      if (fmt.format === 0xfffe && size >= 26) fmt.format = b.readUInt16LE(body + 24)
    } else if (id === 'data') {
      data = { start: body, end: Math.min(b.length, body + size) }
    }
    p = body + size + (size & 1) // chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`${file} has no ${fmt ? 'data' : 'fmt'} chunk`)
  const { format, channels, sampleRate, bits } = fmt
  const bytes = bits / 8
  const stride = fmt.block || bytes * channels
  const n = Math.floor((data.end - data.start) / stride)
  const samples = new Float32Array(n)
  const read =
    format === 3 && bits === 32
      ? (o) => b.readFloatLE(o)
      : format === 3 && bits === 64
        ? (o) => b.readDoubleLE(o)
        : bits === 16
          ? (o) => b.readInt16LE(o) / 32768
          : bits === 24
            ? (o) => b.readIntLE(o, 3) / 8388608
            : bits === 32
              ? (o) => b.readInt32LE(o) / 2147483648
              : bits === 8
                ? (o) => (b.readUInt8(o) - 128) / 128
                : null
  if (!read) throw new Error(`${file}: unsupported format ${format} at ${bits} bits`)
  for (let i = 0, o = data.start; i < n; i++, o += stride) samples[i] = read(o)
  return { sampleRate, channels, samples }
}
