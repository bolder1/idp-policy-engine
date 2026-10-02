/* Speak every line once and report what came back.

   The film is paced FROM these durations — an action beat is however long its
   line is, plus whatever the action itself needs — so this runs before the
   camera, not after. Lines are cached by hash, so editing one line re-speaks
   one line. */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

import { LINES, SCRIPT, VOICE } from './script.mjs'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const require = createRequire(`file:///${VIDEO.replace(/ /g, '%20')}/package.json`)
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

const { ensureVO, loadVO } = await import(`file:///${VIDEO.replace(/ /g, '%20')}/lib/vo.mjs`)

const DIR = path.join(import.meta.dirname, 'voice')

const res = await ensureVO({ lines: LINES, voice: VOICE, dir: DIR, ffmpeg: FFMPEG })
console.log(`\nvo: ${res.spoken} spoken, ${res.cached} cached`)

const meta = await loadVO(DIR)
let total = 0
const rows = []
for (const id of Object.keys(SCRIPT)) {
  const m = meta[id] ?? meta.get?.(id)
  const d = m?.duration ?? 0
  total += d
  rows.push({ id, sec: +d.toFixed(2), words: SCRIPT[id].say.split(/\s+/).length, text: SCRIPT[id].say.slice(0, 54) })
}
console.table(rows)
console.log(`speech total: ${total.toFixed(1)}s (${(total / 60).toFixed(1)} min) over ${rows.length} lines`)
fs.writeFileSync(path.join(DIR, 'durations.json'), JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.sec])), null, 1))
