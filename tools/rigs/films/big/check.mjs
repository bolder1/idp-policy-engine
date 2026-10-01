/* One frame per spoken line from the take, 70 % of the way through the line,
   plus a contact sheet — the only honest way to judge a real-time recording.
     node rec/big/check.mjs [ids…]   (no ids = every line) */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const require = createRequire(`file:///${VIDEO.replace(/ /g, '%20')}/package.json`)
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

const HERE = import.meta.dirname
const TAKE = path.join(HERE, 'take')
const OUT = path.join(HERE, 'frames')
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const tl = JSON.parse(fs.readFileSync(path.join(TAKE, 'timeline.json'), 'utf8'))
const webm = fs.readdirSync(TAKE).filter((f) => f.endsWith('.webm')).map((f) => path.join(TAKE, f))[0]
const want = process.argv.slice(2)
const lines = tl.voice.filter((v) => !want.length || want.includes(v.id))
for (const v of lines) {
  const t = v.t + v.d * 0.7
  spawnSync(FFMPEG, ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', webm, '-frames:v', '1', '-vf', 'scale=640:-1', path.join(OUT, `${v.id}.png`)])
}
/* the contact sheet: four across */
const files = lines.map((v) => path.join(OUT, `${v.id}.png`)).filter((f) => fs.existsSync(f))
const cols = 4
for (let i = 0; i < files.length; i += 16) {
  const chunk = files.slice(i, i + 16)
  const args = ['-v', 'error', '-y']
  for (const f of chunk) args.push('-i', f)
  const rows = Math.ceil(chunk.length / cols)
  args.push('-filter_complex', `${chunk.map((_, k) => `[${k}:v]`).join('')}xstack=inputs=${chunk.length}:layout=${chunk.map((_, k) => `${(k % cols) === 0 ? '0' : Array.from({ length: k % cols }, (_, j) => `w${j}`).join('+')}_${Math.floor(k / cols) === 0 ? '0' : Array.from({ length: Math.floor(k / cols) }, (_, j) => `h${j * cols}`).join('+')}`).join('|')}`)
  args.push(path.join(OUT, `sheet-${String(i / 16 + 1).padStart(2, '0')}.png`))
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' })
  if (r.status !== 0) console.log('sheet failed:', r.stderr.slice(0, 300))
  void rows
}
console.log(`${files.length} frames, ${Math.ceil(files.length / 16)} sheets → ${OUT}`)
