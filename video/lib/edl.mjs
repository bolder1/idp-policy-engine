/* -----------------------------------------------------------------------------
   The edit — lays the film out on one clock.

   Input is the storyboard's `film` (slides, chapter cards, takes, in order) and
   the takes the recorder wrote. Output is everything the compositor and the
   soundtrack need, in absolute seconds: which item is on screen when, every
   subtitle, every sound effect, what kind of music each stretch wants, and
   where each chapter starts.

   Slides overlap by a cross-fade. Cards sit between takes and borrow the last
   frame of the take before and the first frame of the take after, so a card
   never needs a picture of its own behind it.
   -------------------------------------------------------------------------- */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const XFADE = 0.8

export async function buildEdl({ film, workDir, fps }) {
  const items = []
  const captions = []
  const sfx = []
  const sections = []
  const chapters = film.chapters.map((c) => ({ ...c }))
  const takes = {}
  let t = 0
  let contentStart = null
  let prev = null

  const seq = film.sequence
  const takeIndex = (from, dir) => {
    for (let i = from; i >= 0 && i < seq.length; i += dir) if (seq[i].kind === 'take') return seq[i].take
    return null
  }

  for (let i = 0; i < seq.length; i++) {
    const s = seq[i]
    if (s.kind === 'take') {
      const file = path.join(workDir, 'capture', `take-${s.take}.json`)
      if (!existsSync(file)) {
        if (s.placeholder) {
          // not captured yet: hold its slot so the rest of the edit can be previewed
          t += s.placeholder
          prev = null
          continue
        }
        throw new Error(`take "${s.take}" has not been captured (${file})`)
      }
      const take = JSON.parse(await readFile(file, 'utf8'))
      if (take.fps !== fps) throw new Error(`take ${s.take} is ${take.fps}fps, the edit is ${fps}fps`)
      takes[s.take] = `/work/capture/take-${s.take}.json`
      const dur = take.frames.length / fps
      const start = t
      items.push({ id: `take-${s.take}`, kind: 'take', take: s.take, chapter: s.chapter, start, end: start + dur })
      sections.push({ start, end: start + dur, kind: 'demo' })
      const ch = chapters.find((c) => c.id === s.chapter)
      if (ch && ch.at === undefined) ch.at = start
      // subtitles: each runs until the next one, its own duration, or the end of the take
      const caps = take.events.filter((e) => e.type === 'caption')
      caps.forEach((e, k) => {
        if (!e.text) return
        const a = start + e.f / fps
        const nextF = caps[k + 1] ? caps[k + 1].f / fps : dur
        const b = start + Math.min(e.dur ? e.f / fps + e.dur : nextF, nextF, dur)
        if (b - a > 0.3) captions.push({ start: a, end: b, text: e.text })
      })
      for (const e of take.events) {
        const at = start + e.f / fps
        if (e.type === 'sfx') sfx.push({ type: e.sfx, t: at, gain: e.gain ?? 1 })
        if (e.type === 'focus') sfx.push({ type: 'thump', t: at + 0.05, gain: 0.35 })
      }
      t = start + dur
      prev = 'take'
      continue
    }

    const dur = s.dur
    let start = t
    let tin = 0
    if (s.kind === 'slide') {
      if (prev === 'slide' || prev === 'card-flat') {
        start = t - XFADE
        tin = XFADE
        const last = items[items.length - 1]
        last.tout = XFADE
      } else {
        tin = i === 0 ? 1.0 : 0.6
      }
    }
    const item = {
      id: s.id ?? `${s.kind}-${i}`,
      kind: s.kind,
      slide: s.slide,
      params: s.params ?? {},
      chapter: s.chapter,
      start,
      end: start + dur,
      tin,
      tout: s.kind === 'slide' && i === seq.length - 1 ? 1.2 : 0,
    }
    if (s.kind === 'card') {
      item.prevTake = takeIndex(i - 1, -1)
      item.nextTake = takeIndex(i + 1, 1)
      const betweenTakes = seq[i - 1]?.kind === 'take'
      item.tin = s.params?.compact ? 0.45 : 0.62
      item.tout = s.params?.compact ? 0.45 : 0.62
      if (!betweenTakes && !s.params?.compact) {
        // from a slide into the first chapter: no stage to cover, so fade instead
        const last = items[items.length - 1]
        if (last && last.kind === 'slide') {
          item.start = t - XFADE
          last.tout = XFADE
        }
      }
      if (contentStart === null) contentStart = item.start
      const ch = chapters.find((c) => c.id === s.chapter)
      if (ch && ch.at === undefined && !s.params?.compact) ch.at = item.start
    }
    items.push(item)
    for (const c of s.captions ?? []) {
      const pos = s.capPos ?? (s.kind === 'slide' ? 'left' : 'center')
      captions.push({ start: item.start + c.at, end: item.start + c.at + c.dur, text: c.text, pos })
    }
    // sound
    if (s.kind === 'slide') {
      sections.push({ start: item.start, end: item.end, kind: s.music ?? 'intro' })
      if (item.tin > 0 && i > 0) sfx.push({ type: 'whoosh', t: item.start + 0.25, gain: 0.55 })
    } else if (s.params?.compact) {
      sections.push({ start: item.start, end: item.end, kind: 'demo' })
      sfx.push({ type: 'pop', t: item.start + 0.3, gain: 0.8 })
      sfx.push({ type: 'whoosh', t: item.end - 0.2, gain: 0.35, dur: 0.5 })
    } else {
      sections.push({ start: item.start, end: item.end, kind: 'chapter' })
      sfx.push({ type: 'riser', t: item.start + 0.5, gain: 0.7, dur: 1.3 })
      sfx.push({ type: 'whoosh', t: item.start + 0.35, gain: 0.8 })
      sfx.push({ type: 'thump', t: item.start + 0.62, gain: 0.8 })
      sfx.push({ type: 'whoosh', t: item.end - 0.3, gain: 0.6, dir: -1 })
    }
    t = item.end
    prev = s.kind === 'card' ? (seq[i - 1]?.kind === 'take' ? 'card' : 'card-flat') : 'slide'
  }

  // no two sections may overlap for the music; the later one wins
  sections.sort((a, b) => a.start - b.start)
  for (let k = 0; k < sections.length - 1; k++) sections[k].end = Math.min(sections[k].end, sections[k + 1].start)

  captions.sort((a, b) => a.start - b.start)
  for (let k = 0; k < captions.length - 1; k++) captions[k].end = Math.min(captions[k].end, captions[k + 1].start - 0.05)

  return {
    fps,
    duration: t,
    url: film.url,
    imgBase: '/work/capture/img',
    takes,
    items,
    captions,
    sfx: sfx.sort((a, b) => a.t - b.t),
    sections,
    chapters,
    contentStart: contentStart ?? 0,
    logos: film.logos ?? {},
  }
}

export function toSrt(captions) {
  const ts = (s) => {
    const ms = Math.round(s * 1000)
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    const r = ms % 1000
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`
  }
  return captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n')
}
