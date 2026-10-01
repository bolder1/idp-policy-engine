/* Absolute times in the edit for chosen subtitle beats, for render.mjs preview --at.
   Each pick is [take, text the subtitle contains, seconds after it starts]. */
import { readFileSync } from 'node:fs'

const WORK = process.env.WORK_DIR ?? '.work'
const edl = JSON.parse(readFileSync(`${WORK}/edl.json`, 'utf8'))
const picks = [
  // re-filmed: the rule is added at the end, moved to the top by its arrow, then shadows
  ['canvas', 'The plus on any connector', 3.2],
  ['canvas', 'The arrows on a card move it', 1.4],
  ['canvas', 'The arrows on a card move it', 3.0],
  ['canvas', 'A rule with no conditions now sits first', 3.0],
  // re-filmed: Alt + ↓ moves it, Ctrl + Z restores it, the copy stays gone
  ['canvas', 'And a rule you don’t need', 3.2],
  ['canvas', 'Every edit has a shortcut', 3.8],
  ['canvas', 'and Ctrl + Z puts it back', 1.6],
  ['canvas', 'Let’s clear that extra rule', 3.0],
  // test and publish now start from a chain holding one rule
  ['test', 'Rehearse it, and watch', 1.5],
  ['test', 'Every attempt that gets through', 3.5],
  ['test', 'Add it in one click', 2.5],
  // publish: the cursor clears the callout, then rests on the row
  ['publish', 'Confirm, and it’s published', 2.8],
  ['publish', 'Back on the list', 3.0],
  ['publish', 'Back on the list', 5.0],
]

const out = []
for (const [takeId, text, off] of picks) {
  const item = edl.items.find((i) => i.kind === 'take' && i.take === takeId)
  let take
  try {
    take = JSON.parse(readFileSync(`${WORK}/capture/take-${takeId}.json`, 'utf8'))
  } catch {
    console.log('MISSING TAKE', takeId)
    continue
  }
  const ev = take.events.find((e) => e.type === 'caption' && e.text && e.text.includes(text))
  if (!item || !ev) {
    console.log('MISSING', takeId, text)
    continue
  }
  const t = item.start + ev.f / take.fps + off
  out.push(t.toFixed(2))
  console.log(`${t.toFixed(2).padStart(7)}s  ${takeId.padEnd(9)} ${text} +${off}`)
}
const mins = `${Math.floor(edl.duration / 60)}:${String(Math.round(edl.duration % 60)).padStart(2, '0')}`
console.log(`\nduration ${mins} (${edl.duration.toFixed(1)}s) · ${edl.captions.length} subtitles · ${edl.sfx.length} sounds`)
console.log('AT=' + out.join(','))
