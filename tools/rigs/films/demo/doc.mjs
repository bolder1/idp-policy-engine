/* The script as a document — generated from the same file the film speaks, so
   the two cannot drift. What the client reads is what the voice says. */
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT, VOICE } from './script.mjs'

const HERE = import.meta.dirname
const VDIR = path.join(HERE, 'voice')
const dur = (id) => {
  const f = path.join(VDIR, `${id}.json`)
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).duration : 0
}

/* The spoken spelling goes back to the printed one for the page: nobody wants
   to read "Zecurify" or "I.P." in a script they are checking for sense. */
const readable = (s) =>
  s
    .replace(/Zecurify/g, 'Xecurify')
    .replace(/\bI\.P\./g, 'IP')
    .replace(/\bV\.P\.N\./g, 'VPN')
    .replace(/Twenty five kilometres/g, '25 km')
    .replace(/Windows eleven/g, 'Windows 11')

const CHAPTERS = [
  ['Opening', ['t1', 't2'], 'Title card'],
  ['1 · Zones', ['z0', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'], 'Zones list → New zone → Locations → Pune, 25 km → Review & save'],
  ['2 · Device profiles', ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'], 'Device profiles → Create new profile → type → checks → Review → Create'],
  ['3 · The policy builder', ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'], 'New policy → name → applications → rule 1 → rule 2 → default → Save policy'],
  ['4 · Policies in practice', ['x0', 'x1', 'x2', 'x3', 'x4'], 'Device compliance ladder → Risk-tiered verification'],
  ['5 · Authentication methods', ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'], 'Methods list → enabled counts → open a family → default → close'],
  ['Close', ['c1', 'c2'], 'Closing card'],
]

let total = 0
const out = []
out.push('# Policy engine — demo film')
out.push('')
out.push('The narration, chapter by chapter, with what is on screen under each line.')
out.push(`Voice: ${VOICE.name} at ${VOICE.rate}. Times are the spoken length of each line;`)
out.push('the film runs longer, because the picture holds while things happen.')
out.push('')

for (const [title, ids, action] of CHAPTERS) {
  const secs = ids.reduce((a, id) => a + dur(id), 0)
  total += secs
  out.push(`## ${title}  ·  ${secs.toFixed(0)}s`)
  out.push('')
  out.push(`*On screen: ${action}*`)
  out.push('')
  for (const id of ids) {
    const v = SCRIPT[id]
    out.push(`**${id}** — ${readable(v.say)}`)
    if (v.cap) out.push(`> caption: ${v.cap.replace(/<\/?b>/g, '**')}`)
    out.push('')
  }
}
out.push('---')
out.push('')
out.push(`Narration: **${Math.round(total)}s (${(total / 60).toFixed(1)} min)** over ${Object.keys(SCRIPT).length} lines.`)
out.push('')
out.push('### Pronunciation')
out.push('')
out.push('The synthesiser is fed a different spelling wherever it would read the word wrong:')
out.push('')
out.push('| On the page | Fed to the voice | Why |')
out.push('| --- | --- | --- |')
out.push('| Xecurify | Zecurify | X as a Z |')
out.push('| IP, VPN | I.P., V.P.N. | lettered out rather than read as a word |')
out.push('| 25 km | twenty five kilometres | "km" is read as a word otherwise |')
out.push('| Windows 11 | Windows eleven | digits are read inconsistently |')
out.push('| MFA | *never said* | "a second factor" is the English for it |')
out.push('| OS | operating system | |')

const file = path.join(HERE, 'out', 'SCRIPT.md')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, out.join('\n') + '\n')
console.log(`${file}  (${Math.round(total)}s narration)`)
