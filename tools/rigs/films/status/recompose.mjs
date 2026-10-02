import fs from 'node:fs'
import { compose } from './studio.mjs'
import { ensureVO } from './vo.mjs'
import { INTRO, OUTRO } from './slides.mjs'
import { UCS, TODAY } from './video1-data.mjs'
const out = process.argv[2]
const { events, webm } = JSON.parse(fs.readFileSync(out + '/events.json', 'utf8'))
const voice = ensureVO(import.meta.dirname + '/voice')
const c = await compose({ out, webm, events, ucs: UCS, statusOf: (id) => TODAY[id], intro: INTRO, outro: OUTRO, vo: voice, file: 'video-1-where-we-stand.mp4' })
console.log(JSON.stringify(c))
