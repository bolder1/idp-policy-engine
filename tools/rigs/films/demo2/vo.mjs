import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { LINES, SCRIPT, VOICE } from './script.mjs'
const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path
const { ensureVO, loadVO } = await import(`${U(VIDEO)}/lib/vo.mjs`)
const DIR = path.join(import.meta.dirname, 'voice')
await ensureVO({ lines: LINES, voice: VOICE, dir: DIR, ffmpeg: FFMPEG })
const meta = await loadVO(DIR)
let total = 0
for (const id of Object.keys(SCRIPT)) total += (meta[id]?.duration ?? 0)
console.log(`\nspeech: ${total.toFixed(1)}s (${(total/60).toFixed(1)} min) over ${Object.keys(SCRIPT).length} lines`)
