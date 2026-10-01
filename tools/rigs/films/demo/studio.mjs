/* -----------------------------------------------------------------------------
   The camera and the clock.

   Wraps the status-film harness with the three things a narrated demo needs
   that a silent one does not:

   · `say(id, fn)` — start a spoken line, run the actions underneath it, and
     hold until the line has finished. Pacing follows the VOICE, never a guessed
     timeout, so the picture can never run ahead of what is being said.
   · an EVENT LOG — every click and keystroke with its millisecond, which the
     soundtrack turns into the interface sounds.
   · SECTIONS — what kind of material is on screen when, which is how the music
     knows to open on a title and thin out over the console.

   The clock starts when the page does and is read straight off `Date.now()`;
   the recording is real time, so the two agree to within half a second over a
   five minute take (measured on the 22 Sep film: 0.4 s over eight minutes).
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'

import { start as harnessStart, Rec } from '../status/harness.mjs'

export class Studio {
  constructor(rec, page, vo) {
    this.rec = rec
    this.page = page
    this.vo = vo // id → { duration }
    this.t0 = Date.now()
    this.voice = [] // { id, t }
    this.events = [] // { type, t, ... } for the soundtrack
    this.sections = [] // { start, end, kind }
    this._section = null
    this.missing = []
  }

  t() { return (Date.now() - this.t0) / 1000 }

  section(kind) {
    const now = this.t()
    if (this._section) this.sections.push({ ...this._section, end: now })
    this._section = { start: now, kind }
  }

  endSections() {
    if (this._section) { this.sections.push({ ...this._section, end: this.t() }); this._section = null }
  }

  /* A spoken line. `fn` runs while it plays; whatever time is left afterwards
     is held, so a short action waits for the voice and a long one extends it —
     the line is never cut off. */
  async say(id, fn) {
    const meta = this.vo[id]
    if (!meta) { this.missing.push(id); return fn ? fn() : undefined }
    const at = this.t()
    this.voice.push({ id, t: at })
    const cap = this.caps[id]
    await this.rec.cap(cap ?? '')
    const done = at + meta.duration
    if (fn) await fn()
    const left = done - this.t()
    if (left > 0) await this.rec.hold(left * 1000)
    /* A beat of air after every line. Without it the next one starts on the
       last syllable and the whole film sounds rushed. */
    await this.rec.hold(this.fast ? 60 : 320)
  }

  /* Clicks and keys, logged as they happen so the mix can put a sound on them. */
  async click(loc, opts) {
    const t = this.t()
    await this.rec.click(loc, opts)
    const p = await this.page.evaluate(() => window.__recPos ?? { x: 960, y: 540 })
    this.events.push({ type: 'click', t, pan: Math.max(-0.35, Math.min(0.35, (p.x / 1440 - 0.5) * 0.7)) })
  }

  async type(loc, text, opts) {
    await this.click(loc)
    await this.keys(text, opts)
  }

  /* Typing into whatever already has focus, with every character logged.

     One key, one sound. The soundtrack's `mxblue` is a Cherry MX Blue — the
     loud clicky one — and it is placed per character, so the typing you hear
     is the typing you see. Anything that types by calling the keyboard
     directly is silent in the mix, which is why nothing in the film is allowed
     to do that. */
  async keys(text, { delay = 55 } = {}) {
    const t = this.t()
    await this.page.keyboard.type(text, { delay })
    const per = (this.t() - t) / Math.max(1, text.length)
    for (let i = 0; i < text.length; i++) this.events.push({ type: 'mxblue', t: t + per * i, key: text[i] })
    await this.rec.hold(this.fast ? 40 : 250)
  }

  /* A named key — Enter, Escape, or a chord like Control+a. The mix gives the
     modifier chords the same switch, which is what a real keyboard does. */
  async press(key) {
    this.events.push({ type: 'mxblue', t: this.t(), key })
    await this.page.keyboard.press(key)
    await this.rec.hold(this.fast ? 30 : 160)
  }

  async hold(ms) { await this.rec.hold(this.fast ? Math.min(ms, 120) : ms) }
  async cap(html) { await this.rec.cap(html) }
  async card(html, ms) { await this.rec.card(html); if (ms) await this.hold(ms) }
  async uncard() { await this.rec.uncard() }
  async hover(loc, opts) { await this.rec.hover(loc, opts) }
  async scrollTo(loc) { await this.rec.scrollTo(loc) }
  async wheel(dy, steps) { await this.rec.wheel(dy, steps) }

  save(dir) {
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({
      duration: this.t(),
      voice: this.voice,
      events: this.events,
      sections: this.sections,
      missing: this.missing,
      log: this.rec.log,
    }, null, 1))
  }
}

export async function open({ out, caps, vo, fast = false, vw = 1440, vh = 810 }) {
  const h = await harnessStart({ out, storage: { 'idp.board-tour.seen': '1' }, vw, vh })
  const st = new Studio(h.rec, h.page, vo)
  st.caps = caps
  st.fast = fast
  return { ...h, st }
}

export { Rec }
