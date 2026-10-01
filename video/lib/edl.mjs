/* -----------------------------------------------------------------------------
   The edit — lays the film out on one clock.

   Input is the storyboard's `film` (slides, banners, takes, in order), the takes
   the recorder wrote, and the voice-over metadata (one entry per line: duration,
   word boundaries, loudness envelope). Output is everything the compositor and
   the soundtrack need, in absolute seconds: which item is on screen when and how
   it enters and leaves, every spoken line with its words, every sound effect,
   where each voice file sits, what kind of music each stretch wants, and where
   each chapter starts.

   Pacing: a take's captions carry the duration of their voice-over from the
   recorder. A slide with `lines` is laid out here — `lead`, then each line's
   voice plus a `gap`, then `tail` — and its total duration is the sum (or its
   `dur`, whichever is longer), so a slide is exactly as long as what is said on it.

   Transitions: `out: 'push'` overlaps an item with the next by PUSH seconds and
   marks both, so the compositor slides one out to the left while the other
   arrives from the right. `out: 'fade'` on a take dissolves its window to the
   ground over XFADE seconds while the slide after it starts underneath.
   `out: 'fade'` on a slide followed by a take starts the take XFADE seconds
   before the slide ends (`tin`, `inKind: 'fade'`) and marks the slide
   `outInto: 'take'`: the compositor fades the take in beneath the slide, then
   the slide out on top of it, so a slide whose last picture is the take's first
   frame hands over without a visible seam. A banner borrows the last frame of
   the take right before it and the first of the take right after it, so it
   never needs a picture of its own behind it; next to a slide it borrows from
   the one take it touches. The last item is not faded for it: it ends on a
   held frame unless its own `out` says otherwise.

   Cues: a slide's `params.cues[id] = { at, dur, words }` — `at` from the
   slide's start, `dur` the spoken end plus TAIL, and `words` the voice's word
   boundaries in seconds from the line's start (with the same WORD_LEAD the
   captions use, so a slide lighting on a word lights with its caption). A
   line with no voice-over has no `words`.

   Sound: a slide's `sfx: [{ type, at, gain, dur, after }]` is passed through —
   `at` in seconds from the slide's start, or, with `after: '<line id>'`, from
   the moment that line's last word ends. Takes get their cues from the
   recorded events.

   Borrowed takes: a take a slide names in `params.dockTake` or
   `params.sourceTake` is listed in `takes` even when the sequence never plays
   it, so the compositor loads it for the slide; it adds nothing to the clock.
   -------------------------------------------------------------------------- */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PUSH = 0.8
const XFADE = 0.8
/* The service's word boundaries lead the decoded audio by ~65 ms (measured on
   the Prabhat voice), so the cloud would reveal a word before it is heard. */
const WORD_LEAD = 0.065
const TAIL = 0.3

/** When the last word of a line ends — the clip carries ~0.8 s of padding after it. */
const spokenEnd = (m) => {
  const w = m.words && m.words.length ? m.words[m.words.length - 1] : null
  return w ? Math.min(m.duration, w.t + w.dur + 0.05) : m.duration
}

export async function buildEdl({ film, workDir, fps, vo = new Map() }) {
  const items = []
  const captions = []
  const sfx = []
  const sections = []
  const voice = []
  const chapters = film.chapters.map((c) => ({ ...c }))
  const takes = {}
  const loaded = {} // the parsed takes, for the checks after the layout
  const source = new Map() // each slide item → its storyboard entry, for the same checks
  let t = 0
  let contentStart = null
  let prev = null // the previous item, for transitions

  const seq = film.sequence
  /* The take a banner borrows its picture from: only the item right beside it.
     Searching further would reach past a slide — a banner after the concept
     slide would show the last frame of a take two items back. */
  const takeIndex = (from) => (from >= 0 && from < seq.length && seq[from].kind === 'take' ? seq[from].take : null)
  const meta = (id) => vo.get(id) ?? null

  /* A spoken line at absolute time `at`: the caption the cloud shows, the words
     it reveals, and the voice file the mixer places. */
  const speak = (id, at, { text, dur, pos, avoidScreen } = {}) => {
    const m = meta(id)
    const words = m ? m.words.map((w) => ({ t: at + w.t + WORD_LEAD, dur: w.dur, text: w.text })) : null
    const d = dur ?? (m ? spokenEnd(m) + TAIL : Math.max(1.2, (text ?? '').length / 15))
    captions.push({ start: at, end: at + d, text: m?.text ?? text ?? id, id: m ? id : null, words, env: m?.env ?? null, pos, avoidScreen })
    if (m) voice.push({ id, t: at, file: m.wav ?? path.join(workDir, 'vo', `${id}.wav`) })
    return d
  }

  for (let i = 0; i < seq.length; i++) {
    const s = seq[i]

    /* --- a take ---------------------------------------------------------------- */
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
      loaded[s.take] = take
      /* A card-mode take may open with a prelude: its first frame, the finished
         card, rising in from bare ground. Its recorded time starts after it. */
      const prelude = s.mode === 'card' ? (s.prelude ?? 0) : 0
      const dur0 = take.frames.length / fps
      const dur = prelude + dur0
      let start = t
      const item = { id: `take-${s.take}`, kind: 'take', take: s.take, chapter: s.chapter, start, end: start + dur, tin: 0, tout: 0, mode: s.mode ?? 'window', prelude }
      if (prev && prev.outKind === 'push') {
        // pushed in by the item before it: overlap, and arrive from the right
        start = prev.end - PUSH
        item.start = start
        item.end = start + dur
        item.tin = PUSH
        item.inKind = 'push'
      } else if (prev && prev.kind === 'slide' && prev.outKind === 'fade') {
        /* a slide that fades into this take: the take's first frames play under
           the slide's last XFADE seconds. No sound of its own — the slide's cues
           already say what the hand-over sounds like. */
        start = prev.end - XFADE
        item.start = start
        item.end = start + dur
        item.tin = XFADE
        item.inKind = 'fade'
        prev.tout = XFADE
        prev.outInto = 'take'
      }
      if (s.out === 'push') {
        item.tout = PUSH
        item.outKind = 'push'
      } else if (s.out === 'fade') {
        // the window dissolves to the ground; the slide after it starts underneath
        item.tout = XFADE
        item.outKind = 'fade'
      }
      items.push(item)
      sections.push({ start: item.start, end: item.end, kind: s.music ?? 'demo' })
      if (item.inKind === 'push') sfx.push({ type: 'whoosh', t: item.start + 0.3, gain: 0.7 })
      // the card rising in over the prelude lands on a soft thump
      if (prelude > 0) sfx.push({ type: 'thump', t: item.start + 0.3, gain: 0.35 })
      const ch = chapters.find((c) => c.id === s.chapter)
      if (ch && ch.at === undefined) ch.at = item.start
      // the progress rail starts at the first chapter banner, not at a cold-open take (below)
      // captions: each runs for its own duration, cut short by the next one or the take's end
      const caps = take.events.filter((e) => e.type === 'caption')
      /* A line often starts a beat before its dialog exists, so the recorder could
         not know what the cloud should keep off. The orange is always placed
         beside the thing being explained, so a placement (left/right of an
         anchor) inside the line's window lends the line its rect. */
      const beside = take.events.filter((e) => e.type === 'mascot' && (e.place === 'left' || e.place === 'right') && e.anchor)
      caps.forEach((e, k) => {
        if (!e.text && !e.id) return
        const a = item.start + prelude + e.f / fps
        const nextF = caps[k + 1] ? caps[k + 1].f / fps : dur0
        const limit = item.start + prelude + Math.min(nextF, dur0)
        const d = speak(e.id, a, { text: e.text, dur: e.dur })
        const c = captions[captions.length - 1]
        c.end = Math.min(c.end, limit)
        if (e.avoid) c.avoid = e.avoid
        else {
          const endF = e.f + Math.round((c.end - c.start) * fps)
          const m = beside.find((b) => b.f >= e.f - fps && b.f <= endF)
          if (m) c.avoid = m.anchor
        }
        if (c.end - c.start < 0.3) captions.pop()
      })
      for (const e of take.events) {
        const at = item.start + prelude + e.f / fps
        if (e.type === 'sfx') sfx.push({ type: e.sfx, t: at, gain: e.gain ?? 1, key: e.key, pan: e.pan, dur: e.dur })
        if (e.type === 'focus') sfx.push({ type: 'thump', t: at + 0.05, gain: 0.3 })
        if (e.type === 'cardMode' && e.on === false) sfx.push({ type: 'whoosh', t: at + 0.05, gain: 0.5 })
        // an explainer inset: one soft pop as it lands, nothing else
        if (e.type === 'explain') sfx.push({ type: 'pop', t: at + 0.3, gain: 0.5 })
      }
      t = item.end
      prev = item
      continue
    }

    /* --- a slide or a banner ------------------------------------------------------ */
    let start = t
    let tin = 0
    let inKind = 'fade'
    if (s.kind !== 'banner' && prev && prev.kind !== 'take' && prev.kind !== 'banner') {
      if (prev.outKind === 'push') {
        start = prev.end - PUSH
        tin = PUSH
        inKind = 'push'
      } else if (source.get(prev)?.out === 'cut') {
        /* the slide before says `out: 'cut'` in so many words (the intro ends on
           bare ground): no overlap, no transition sound; only a slide that names
           no `out` crossfades into the next */
        inKind = 'cut'
      } else {
        start = prev.end - XFADE
        tin = XFADE
        prev.tout = XFADE
        prev.outKind = 'fade'
      }
    } else if (s.kind !== 'banner' && prev && prev.kind === 'take' && prev.outKind === 'fade') {
      // the take before it dissolves to the ground; this slide starts underneath it
      start = prev.end - XFADE
      tin = XFADE
      inKind = 'fade'
    } else if (i === 0) {
      tin = 1.0
    }

    // duration: fixed, or laid out from the lines spoken on it
    const cues = {}
    let dur = s.dur
    if (s.lines?.length) {
      let at = s.lead ?? 0.8
      for (const id of s.lines) {
        const m = meta(id)
        const d = m ? spokenEnd(m) + TAIL : 3.5
        cues[id] = { at, dur: d }
        if (m?.words?.length) cues[id].words = m.words.map((w) => ({ t: w.t + WORD_LEAD, dur: w.dur, text: w.text }))
        at += d + (s.gap ?? 0.4)
      }
      const needed = at - (s.gap ?? 0.4) + (s.tail ?? 0.6)
      dur = s.dur === 'auto' || s.dur === undefined ? needed : Math.max(s.dur, needed)
    }

    const item = {
      id: s.id ?? `${s.kind}-${i}`,
      kind: s.kind,
      slide: s.kind === 'banner' ? 'banner' : s.slide,
      params: { ...(s.params ?? {}), cues },
      chapter: s.chapter,
      start,
      end: start + dur,
      tin,
      inKind,
      tout: 0,
      outKind: s.out ?? 'cut',
    }
    if (s.out === 'push') item.tout = PUSH
    else if (s.out === 'fade') item.tout = XFADE
    if (s.kind === 'banner') {
      item.prevTake = takeIndex(i - 1)
      item.nextTake = takeIndex(i + 1)
      item.tin = 0
      item.tout = 0
      item.inKind = 'cut'
      item.outKind = 'cut'
      if (contentStart === null) contentStart = item.start
      const ch = chapters.find((c) => c.id === s.chapter)
      if (ch) ch.at = item.start
    }
    items.push(item)
    source.set(item, s)

    // what is said on it
    for (const id of s.lines ?? []) speak(id, item.start + cues[id].at, { pos: s.capPos, avoidScreen: s.avoid })
    for (const c of s.captions ?? []) captions.push({ start: item.start + c.at, end: item.start + c.at + c.dur, text: c.text, id: null, pos: c.pos })

    // sound
    if (s.kind === 'banner') {
      sections.push({ start: item.start, end: item.end, kind: 'banner' })
      sfx.push({ type: 'swoosh', t: item.start + 0.05, gain: 0.8 })
      sfx.push({ type: 'thump', t: item.start + 0.45, gain: 0.7 })
      sfx.push({ type: 'swoosh', t: item.end - 0.45, gain: 0.6, dir: -1 })
    } else {
      sections.push({ start: item.start, end: item.end, kind: s.music ?? 'demo' })
      /* a transition sound only where two slides meet; a slide that starts under
         a dissolving window keeps quiet, its own cues say what it sounds like */
      if (inKind === 'push') sfx.push({ type: 'whoosh', t: item.start + 0.3, gain: 0.7 })
      else if (i > 0 && tin > 0 && prev && prev.kind !== 'take') sfx.push({ type: 'whoosh', t: item.start + 0.25, gain: 0.5 })
      /* the slide's own cues, in seconds from its start — or, with `after`, from
         the end of that line's last word, so a sound keyed to "when the voice
         stops" stays there however long the voice runs */
      for (const c of s.sfx ?? []) {
        let base = item.start
        if (c.after !== undefined) {
          const cue = cues[c.after]
          if (!cue) throw new Error(`slide ${item.id} (${s.slide}): sfx "${c.type}" is timed after "${c.after}", which is not one of its lines`)
          base = item.start + cue.at + cue.dur - TAIL
        }
        sfx.push({ type: c.type, t: base + (c.at ?? 0), gain: c.gain ?? 1, dur: c.dur })
      }
    }
    t = item.end
    prev = item
  }

  /* Takes a slide borrows without the film ever playing them: the bento's dock
     picture (`params.dockTake`) and the footage in its cards (`params.sourceTake`,
     the unspoken `parts` take). They join `takes`, so the compositor loads their
     frames, events and cursor like any other, and nothing else: items, captions,
     sounds, sections, chapters and the rail are all laid out above from the
     sequence alone, so a borrowed take cannot move a single second of the edit.
     One that has not been captured yet is left out, as a placeholder take is, so
     the edit still previews while it is missing. */
  for (const s of seq) {
    if (s.kind !== 'slide') continue
    for (const key of SLIDE_TAKES) {
      const name = s.params?.[key]
      if (!name || takes[name]) continue
      const file = path.join(workDir, 'capture', `take-${name}.json`)
      if (!existsSync(file)) continue
      const take = JSON.parse(await readFile(file, 'utf8'))
      if (take.fps !== fps) throw new Error(`take ${name} (${key} of slide ${s.slide}) is ${take.fps}fps, the edit is ${fps}fps`)
      takes[name] = `/work/capture/take-${name}.json`
      loaded[name] = take
    }
  }

  checkFilm(items, source, loaded)

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
    voice: voice.sort((a, b) => a.t - b.t),
    sfx: sfx.sort((a, b) => a.t - b.t),
    sections,
    chapters,
    contentStart: contentStart ?? 0,
    logos: film.logos ?? {},
  }
}

/* The edit's own asserts (BEATS-v7): what the slides need from the voice and the
   takes, checked here so a render never starts on a film that would draw wrong.
   A slide that is not in the film, or a take that has not been captured yet, is
   not checked — the edit can still be previewed while pieces are missing. */
const DOCK_PARTS = ['card', 'who', 'if', 'then', 'board', 'review']
/* The stage-and-filmstrip bento (the one with a `sourceTake`) docks six strip
   cards, the Shortcuts card onto the board's View toolbar among them. */
const DOCK_PARTS_STRIP = ['card', 'who', 'if', 'then', 'shortcuts', 'board', 'review']
// its footage: one segment per part, in the order the stage plays them
const SOURCE_PARTS = ['who', 'if', 'then', 'board', 'review']
// the slide params that name a take the slide borrows pictures from
const SLIDE_TAKES = ['dockTake', 'sourceTake']
function checkFilm(items, source, loaded) {
  const fail = (msg) => {
    throw new Error(`edl check: ${msg}`)
  }
  const inView = (take, r) => {
    const view = take.view ?? { width: 1440, height: 900 }
    return r.x >= -1 && r.y >= -1 && r.x + r.width <= view.width + 1 && r.y + r.height <= view.height + 1
  }
  const box = (r) => [r.x, r.y, r.width, r.height].map((v) => Math.round(v)).join(', ')
  const slides = items.filter((it) => it.kind === 'slide')
  for (const it of slides) {
    const cues = it.params?.cues ?? {}
    if (it.slide === 'hook') {
      const cue = cues['hk.1']
      if (!cue) fail(`the hook slide has no cue for hk.1`)
      const lead = source.get(it)?.lead ?? 0.8
      const spoken = cue.dur - TAIL
      if (it.end - it.start < lead + spoken + 1.4 - 1e-6) fail(`the hook slide is ${(it.end - it.start).toFixed(2)} s, shorter than lead + spoken + 1.4 (${(lead + spoken + 1.4).toFixed(2)} s)`)
    }
    if (it.slide === 'bento') {
      for (const id of ['bt.1', 'bt.2', 'bt.3', 'bt.4', 'bt.5']) if (!cues[id]) fail(`the bento slide has no cue for ${id}`)
      const src = it.params?.sourceTake
      const name = it.params?.dockTake
      const take = name ? loaded[name] : null
      if (take) {
        const docks = take.events.filter((e) => e.type === 'dock')
        if (docks.length !== 1) fail(`take ${name} has ${docks.length} dock events, the bento needs exactly one`)
        const d = docks[0]
        if (d.f !== 0) fail(`take ${name}'s dock event is at frame ${d.f}, not 0`)
        for (const part of src ? DOCK_PARTS_STRIP : DOCK_PARTS) {
          const r = d.rects?.[part]
          if (!r || !(r.width > 0) || !(r.height > 0)) fail(`take ${name}'s dock rect "${part}" is missing or empty`)
          if (!inView(take, r)) fail(`take ${name}'s dock rect "${part}" (${box(r)}) lies outside the viewport`)
        }
      }
      /* The footage take (BEATS-v7 §01): five segments in order, each a start mark
         with its crop rect and an end mark, none overlapping the next, every rect
         real and on screen. The end mark may sit one past the segment's last frame
         (it is written after the last step), and the next start on that same
         frame, since the dry run between segments records nothing. */
      const ptake = src ? loaded[src] : null
      if (ptake) {
        const marks = ptake.events.filter((e) => e.type === 'part')
        const n = ptake.frames.length
        if (marks.length !== SOURCE_PARTS.length * 2) fail(`take ${src} has ${marks.length} part marks, the bento needs ${SOURCE_PARTS.length * 2} (a start and an end for ${SOURCE_PARTS.join(', ')})`)
        let last = 0
        SOURCE_PARTS.forEach((id, k) => {
          const a = marks[k * 2]
          const b = marks[k * 2 + 1]
          if (a.id !== id || a.phase !== 'start') fail(`take ${src}'s part mark ${k * 2 + 1} is "${a.id} ${a.phase}", expected "${id} start"`)
          if (b.id !== id || b.phase !== 'end') fail(`take ${src}'s part mark ${k * 2 + 2} is "${b.id} ${b.phase}", expected "${id} end"`)
          if (a.f < last) fail(`take ${src}'s part "${id}" starts at frame ${a.f}, before the part before it ends (${last})`)
          if (!(b.f > a.f)) fail(`take ${src}'s part "${id}" has no frames (${a.f} → ${b.f})`)
          if (b.f > n) fail(`take ${src}'s part "${id}" ends at frame ${b.f}, past the take's ${n} frames`)
          const r = a.rect
          if (!r || !(r.width > 0) || !(r.height > 0)) fail(`take ${src}'s part "${id}" has no crop rect`)
          if (!inView(ptake, r)) fail(`take ${src}'s part "${id}" crop rect (${box(r)}) lies outside the viewport`)
          last = b.f
        })
      }
    }
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
