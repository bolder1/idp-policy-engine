/* The explainer's script as a page, generated from the file the voice reads. */
import fs from 'node:fs'
import path from 'node:path'
import { SCRIPT, readable, VOICE } from './script.mjs'
const HERE = import.meta.dirname
const dur = (id) => { const f = path.join(HERE, 'voice', `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).duration : 0 }
const BEATS = [
  ['Hook', ['h1', 'h2'], 'The real start node — "A login arrives at GitHub Enterprise and 1 more" — alone on the ground; the question lands under it.'],
  ['Pain', ['p1', 'p2', 'p3'], 'Three situation cards rise one per line: laptop, globe, clock.'],
  ['The break', ['b1', 'b2'], 'One "Allow · Password → Logged in" stamps over all three; they grey, then collapse to a line. "It\'s a guess." lands.'],
  ['The turn', ['t1'], 'The dashboard rises into frame — the live console, the finished policy\'s chain — and the camera pushes in a touch.'],
  ['Contrast', ['c1', 'c2', 'c3'], 'A blurred page of checkboxes slides in and out; rule 1 lifts off the dashboard, which blurs behind it. Who / if / then light in turn on the lifted card.'],
  ['How', ['w1', 'w2', 'w3'], 'The Pune row and the three checks appear on a shelf, ticks drawing as they are named. The rule lifts again, rewinds to empty, and is rebuilt state by state — device, place, outcome — with lines drawn in from the shelf. It settles back; rule 2 warms.'],
  ['Lift', ['l1', 'l2'], 'On the live chain, a reading bar sweeps from the start node and stops on rule 1; the rules below dim. "First match decides."'],
  ['Close', ['e1', 'e2', 'e3'], 'Two lines, the second in brand orange, then the mark.'],
]
let total = 0
const out = ['# The policy engine — the explainer', '', `Voice ${VOICE.name} at ${VOICE.rate}. No cursor, no click paths; the product appears as motion. Subtitles ship as a soft track only.`, '']
for (const [beat, ids, screen] of BEATS) {
  const secs = ids.reduce((a, id) => a + dur(id), 0); total += secs
  out.push(`## ${beat}  ·  ${secs.toFixed(0)}s`, '', `*On screen: ${screen}*`, '')
  for (const id of ids) out.push(`**${id}** — ${readable(SCRIPT[id].say)}`, '')
}
out.push('---', '', `Narration **${Math.round(total)}s**; the film runs 1:50 with its holds. The brand is said twice.`, '')
out.push('Pronunciation fed to the voice: *Zecurify*, *twenty five kilometres*, *Windows eleven*, *two in the morning*.')
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true })
fs.writeFileSync(path.join(HERE, 'out', 'SCRIPT.md'), out.join('\n'))
console.log(`SCRIPT.md · ${Math.round(total)}s narration`)
