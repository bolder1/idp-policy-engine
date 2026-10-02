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
for (const id of Object.keys(SCRIPT)) { const d = meta[id]?.duration ?? 0; total += d; console.log(id.padEnd(4), d.toFixed(2) + 's', SCRIPT[id].say.slice(0, 60)) }
console.log(`\nspeech: ${total.toFixed(1)}s over ${Object.keys(SCRIPT).length} lines`)
