/* The big film's script as a page, generated from the file the voice reads. */
import fs from 'node:fs'
import path from 'node:path'
import { SCRIPT, readable, VOICE } from './script.mjs'
const HERE = import.meta.dirname
const dur = (id) => { const f = path.join(HERE, 'voice', `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).duration : 0 }
const ACTS = [
  ['Intro', ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'], 'Dark. One lit rail, one gate labelled "Password?". Every pulse that passes turns green and is stamped Allowed; a burst of them; one halts. The headline. The gate splits into three — WHERE · DEVICE · WHO — and a new pulse is read by each; night turns to day and the last pulse becomes the dot of the wordmark.'],
  ['01 · Zone', ['z1', 'z2', 'z3', 'z4', 'z5'], 'Drawn: three sign-ins fly to Pune across a dot-matrix world; three pushes — India, the state, a 25 km ring; an office network beside it; IP pins drop and land orange inside or grey outside; the name stamps on the ring and is wired into three rules.'],
  ['Zones, in the console', ['zc1', 'zc2', 'zc3'], 'Search and the Show filter; New zone → Pune, 25 km, an IP range; Review & save; Used by.'],
  ['02 · Device profile', ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], 'Drawn: a laptop is x-rayed and four readouts tick; the OS line becomes a floor with OR NEWER along it and three versions rise against it; the stage pans to a trusted-device reader where a stored print snaps onto the live one — Seen before; the whole thing folds to one word, match, which flips to no match when Windows 10 drops on it.'],
  ['Device profiles, in the console', ['dc1', 'dc2', 'dc3'], 'The Type filter; Create new profile (name, type, checks, floor, review); a trusted device profile (Basic details, registration, Signals with priorities).'],
  ['03 · Outcome', ['o1', 'o2', 'o3'], 'Drawn: a comet on a rail. Allow blooms green at the end; the second run stops in a checkpoint until six digits arrive from a phone; the third hits a plate and your message types beside it.'],
  ['Write a rule', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 'Console: a draft; template or scratch; name and applications; a rule — Who (the chooser), If (two conditions, the Add menu with conditional groups), Then (Allow, factors, Deny); Save rule; a second rule.'],
  ['04 · Order', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], 'Drawn over the sunk console: a reading line sweeps the shelves; a sign-in drops, splits the first shelf, lands on the second; swap two shelves and it lands elsewhere; delete one and the floor never moves; a second sign-in falls all the way to the default.'],
  ['The canvas', ['k1', 'k2', 'k3'], 'Expand/collapse, undo/redo, zoom, fit; drag to reorder, the rule switch, the row menu; Save draft, Save policy, Turn on.'],
  ['Templates', ['t1', 't2'], 'Search, filter, preview, Use → a policy on the board.'],
  ['Authentication methods', ['f1'], 'The enabled counts, a family drawer, a switch.'],
  ['Close', ['e1', 'e2', 'e3', 'e4', 'e5'], 'The intro’s rail with three orange gates; three sign-ins get three different endings; the wordmark.'],
]
let total = 0
const out = ['# The policy engine — the big film, second cut', '', `Voice ${VOICE.name} at ${VOICE.rate}. Subtitles on the band throughout, verbatim, and as a soft .srt track.`, '']
for (const [act, ids, screen] of ACTS) {
  const secs = ids.reduce((a, id) => a + dur(id), 0); total += secs
  out.push(`## ${act}  ·  ${secs.toFixed(0)}s of narration`, '', `*On screen: ${screen}*`, '')
  for (const id of ids) out.push(`**${id}** — ${readable(SCRIPT[id].say)}`, '')
}
out.push('---', '', `Narration **${Math.round(total)}s** (${(total / 60).toFixed(1)} min). The brand is said twice.`, '')
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true })
fs.writeFileSync(path.join(HERE, 'out', 'SCRIPT.md'), out.join('\n'))
console.log(`SCRIPT.md · ${Math.round(total)}s narration`)
