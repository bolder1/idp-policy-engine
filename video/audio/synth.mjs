/* -----------------------------------------------------------------------------
   The soundtrack — composed and mixed in code, no samples, no services.

   Three buses. MUSIC is a forward-moving bed in D major at 100 BPM that lifts
   to B minor every eight bars: a warm pad, a bright FM pluck arpeggio with a
   ping-pong delay, a sine bass, hats, and a kick that comes and goes with the
   edit. SFX is the interface and the presenter: a Cherry MX Blue for every
   key, a real mouse click for every click, a marker on the whiteboard, a boing
   and a landing for the mascot, swooshes for banners. VOICE is the spoken
   line, placed where the edit put it; the music ducks under it.

   The arrangement is driven by the edit, not the other way round: the renderer
   hands over `sections` (what kind of material is on screen when), `events`
   (every click, key and transition, to the frame) and `vo` (the voice files),
   so the music thins under the console, opens on the hook, and steps back
   whenever the mascot speaks.

   Everything is deterministic (seeded noise), so the same edit renders the same
   file byte for byte.

   API
     renderAudio({ duration, sections, events, vo, outFile, musicDb, sfxDb, voiceDb })
       duration  seconds
       sections  [{ start, end, kind }]   kind ∈ hook board demo banner outro silent
                 (v1 names still work: intro → board, title → hook, chapter → banner)
       events    [{ type, t, gain?, pan?, key?, dur?, dir? }]
                 type ∈ mxblue click whoosh riser chime success thump pop
                        marker boing land sparkle swoosh          (key → mxblue)
                 mxblue: key is a character, a key name ('Enter') or a chord
                 ('Control+z'); click: pan is the cursor's x as −1..1 (the
                 recorder sends ±0.35); marker: dur is the stroke length.
       vo        [{ t, samples: Float32Array }]  mono 48 kHz, −1..1
       musicDb   trim on the music bed (default −2)
       sfxDb     trim on the effects (default 0)
       voiceDb   trim on the voice (default 0; −120 keeps the ducking but mutes
                 the voice, for checking the duck on its own)
       → { seconds, preLimiterPeak, rmsDb, musicRmsDb, voicePeakDb, duckMaxDb, gain }

     renderClip(type, opts = {}, seed = 1) → { L, R, lead }
       one effect on its own, already trimmed to its stated peak, for tests.

     SR, BPM, SECTION_KINDS, SFX_NAMES
   -------------------------------------------------------------------------- */
import { writeFile } from 'node:fs/promises'

export const SR = 48000
export const BPM = 100
const BEAT = 60 / BPM
const BAR = BEAT * 4

/* --- utilities ------------------------------------------------------------ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
const dbToGain = (db) => Math.pow(10, db / 20)
const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity)
const clamp01 = (x) => Math.max(0, Math.min(1, x))

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* FNV-1a, so a key name becomes the seed of its own character: every 'e' the
   film presses has the same jacket pitch, and 'e' differs from 'r'. */
function hashStr(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

class Bus {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR)
    this.L = new Float32Array(this.n)
    this.R = new Float32Array(this.n)
  }
  add(i, l, r) {
    if (i < 0 || i >= this.n) return
    this.L[i] += l
    this.R[i] += r
  }
  peak() {
    let p = 0
    for (let i = 0; i < this.n; i++) p = Math.max(p, Math.abs(this.L[i]), Math.abs(this.R[i]))
    return p
  }
}

const panGains = (pan) => {
  const p = (Math.max(-1, Math.min(1, pan)) + 1) * 0.25 * Math.PI
  return [Math.cos(p), Math.sin(p)]
}

/* PolyBLEP saw — a sawtooth without the aliasing a naive one sprays above a
   few hundred Hz, which is what makes cheap synth pads sound like a fridge. */
function polyblep(t, dt) {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}

/* Topology-preserving-transform state-variable filter: stable when the cutoff
   moves every sample, which the pad's slow sweep does. */
class SVF {
  constructor(cutoff = 1000, q = 0.7) {
    this.ic1 = 0
    this.ic2 = 0
    this.set(cutoff, q)
  }
  set(cutoff, q) {
    const g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR)
    const k = 1 / q
    this.a1 = 1 / (1 + g * (g + k))
    this.a2 = g * this.a1
    this.a3 = g * this.a2
    this.k = k
  }
  lp(v0) {
    const v3 = v0 - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return v2
  }
  bp(v0) {
    const v3 = v0 - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return v1
  }
  hp(v0) {
    const v3 = v0 - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return v0 - this.k * v1 - v2
  }
}

/* --- Freeverb ------------------------------------------------------------- */
class Comb {
  constructor(size) {
    this.buf = new Float32Array(size)
    this.i = 0
    this.store = 0
  }
  run(x, feedback, damp) {
    const y = this.buf[this.i]
    this.store = y * (1 - damp) + this.store * damp
    this.buf[this.i] = x + this.store * feedback
    if (++this.i >= this.buf.length) this.i = 0
    return y
  }
}
class Allpass {
  constructor(size) {
    this.buf = new Float32Array(size)
    this.i = 0
  }
  run(x) {
    const b = this.buf[this.i]
    const y = -x + b
    this.buf[this.i] = x + b * 0.5
    if (++this.i >= this.buf.length) this.i = 0
    return y
  }
}
function freeverb(bus, { room = 0.84, damp = 0.35, width = 1 } = {}) {
  const scale = SR / 44100
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
  const apT = [556, 441, 341, 225]
  const spread = 23
  const cl = combT.map((t) => new Comb(Math.round(t * scale)))
  const cr = combT.map((t) => new Comb(Math.round((t + spread) * scale)))
  const al = apT.map((t) => new Allpass(Math.round(t * scale)))
  const ar = apT.map((t) => new Allpass(Math.round((t + spread) * scale)))
  const out = new Bus(bus.n / SR)
  const fb = room * 0.28 + 0.7
  const w1 = width / 2 + 0.5
  const w2 = (1 - width) / 2
  for (let i = 0; i < bus.n; i++) {
    const input = (bus.L[i] + bus.R[i]) * 0.015
    let l = 0
    let r = 0
    for (let c = 0; c < 8; c++) {
      l += cl[c].run(input, fb, damp)
      r += cr[c].run(input, fb, damp)
    }
    for (let a = 0; a < 4; a++) {
      l = al[a].run(l)
      r = ar[a].run(r)
    }
    out.L[i] = l * w1 + r * w2
    out.R[i] = r * w1 + l * w2
  }
  return out
}

/* --- Harmony -------------------------------------------------------------- */
/* Sixteen bars that loop without the loop being audible. The first eight sit
   in D major (I – V – IV – I twice, the second time ending on V so it leans
   forward); the second eight lift to B minor, the relative minor, and walk
   back through G and A so the return to D lands as a resolution. Voicings sit
   between G3 and D5, clear of the UI clicks above and the bass below. */
const CH = {
  D: { bass: 38, pad: [57, 62, 66, 69], arp: [62, 66, 69, 74, 78, 81] },
  A: { bass: 45, pad: [57, 61, 64, 69], arp: [61, 64, 69, 73, 76, 81] },
  G: { bass: 43, pad: [55, 59, 62, 67], arp: [62, 67, 71, 74, 79, 83] },
  Bm: { bass: 35, pad: [59, 62, 66, 71], arp: [62, 66, 71, 74, 78, 83] },
}
const PROGRESSION = [CH.D, CH.A, CH.G, CH.D, CH.D, CH.A, CH.G, CH.A, CH.Bm, CH.G, CH.D, CH.A, CH.Bm, CH.G, CH.A, CH.A]
const chordAt = (t) => PROGRESSION[Math.floor(t / BAR) % PROGRESSION.length]

/* How dense each kind of material wants the music. `demo` is the default for
   product footage: the viewer is reading a thought cloud and watching a
   cursor, so the groove stays but the busy parts step back. `kickEvery` is in
   beats (0 = no kick); `thin` drops the pluck's off-beat eighths; `bright` is
   the pluck's FM index; `release` stretches every tail (the outro's ritardando
   feel without changing the tempo). */
const LEVELS = {
  hook: { pad: 1.0, pluck: 0.95, bass: 0.9, kick: 1.0, kickEvery: 1, hat: 0.7, snare: 0.5, filter: 2600, thin: false, bright: 1.0, release: 1.0 },
  board: { pad: 1.0, pluck: 0.5, bass: 0.55, kick: 0.0, kickEvery: 0, hat: 0.15, snare: 0.0, filter: 1400, thin: false, bright: 0.4, release: 1.3 },
  demo: { pad: 0.8, pluck: 0.5, bass: 0.75, kick: 0.6, kickEvery: 2, hat: 0.4, snare: 0.0, filter: 1700, thin: true, bright: 0.7, release: 1.0 },
  banner: { pad: 0.9, pluck: 0.9, bass: 0.9, kick: 1.0, kickEvery: 1, hat: 0.75, snare: 0.6, filter: 2600, thin: false, bright: 1.0, release: 1.0 },
  outro: { pad: 1.0, pluck: 0.65, bass: 0.6, kick: 0.0, kickEvery: 0, hat: 0.2, snare: 0.0, filter: 1900, thin: false, bright: 0.7, release: 2.6 },
  silent: { pad: 0.0, pluck: 0.0, bass: 0.0, kick: 0.0, kickEvery: 0, hat: 0.0, snare: 0.0, filter: 800, thin: true, bright: 0.5, release: 1.0 },
}
const ALIAS = { intro: 'board', title: 'hook', chapter: 'banner' }
export const SECTION_KINDS = Object.keys(LEVELS)
const kindOf = (s) => ALIAS[s.kind] ?? s.kind

function levelAt(sections, t) {
  for (const s of sections) if (t >= s.start && t < s.end) return LEVELS[kindOf(s)] ?? LEVELS.demo
  return LEVELS.demo
}

/* A smoothed per-sample automation lane for one parameter, so a section change
   glides over ~1.2s instead of stepping. */
function lane(sections, duration, key, smooth = 1.2) {
  const n = Math.ceil(duration * SR)
  const out = new Float32Array(n)
  const coef = Math.exp(-1 / (smooth * SR * 0.35))
  let v = levelAt(sections, 0)[key]
  for (let i = 0; i < n; i++) {
    const target = levelAt(sections, i / SR)[key]
    v = target + (v - target) * coef
    out[i] = v
  }
  return out
}

/* --- Instruments ---------------------------------------------------------- */
function renderPad(bus, duration, sections) {
  const gain = lane(sections, duration, 'pad', 1.6)
  const cutoff = lane(sections, duration, 'filter', 2.0)
  const bars = Math.ceil(duration / BAR) + 1
  const attack = 0.9
  const voices = []
  for (let b = 0; b < bars; b++) {
    const chord = chordAt(b * BAR)
    const release = 1.4 * levelAt(sections, b * BAR).release
    chord.pad.forEach((m, vi) => {
      voices.push({ start: b * BAR, end: (b + 1) * BAR, m, release, pan: [-0.55, -0.18, 0.18, 0.55][vi] })
    })
  }
  const filters = [new SVF(1500, 0.6), new SVF(1500, 0.6)]
  const tmp = new Bus(duration)
  for (const v of voices) {
    const f = mtof(v.m)
    const [gl, gr] = panGains(v.pan)
    const detune = [1.0, Math.pow(2, 7 / 1200), Math.pow(2, -9 / 1200)]
    const ph = [0.13 * v.m, 0.41 * v.m, 0.77 * v.m].map((p) => p % 1)
    const i0 = Math.floor(v.start * SR)
    const i1 = Math.min(tmp.n, Math.floor((v.end + v.release) * SR))
    for (let i = i0; i < i1; i++) {
      const t = i / SR
      let env = Math.min(1, (t - v.start) / attack)
      if (t > v.end) env *= Math.exp(-(t - v.end) / (v.release * 0.35))
      let s = 0
      for (let k = 0; k < 3; k++) {
        const dt = (f * detune[k]) / SR
        ph[k] += dt
        if (ph[k] >= 1) ph[k] -= 1
        s += 2 * ph[k] - 1 - polyblep(ph[k], dt)
      }
      s *= env * 0.07
      tmp.L[i] += s * gl
      tmp.R[i] += s * gr
    }
  }
  for (let i = 0; i < tmp.n; i++) {
    const wob = 1 + 0.12 * Math.sin((2 * Math.PI * i) / SR / 7.3)
    if ((i & 31) === 0) {
      filters[0].set(cutoff[i] * wob, 0.62)
      filters[1].set(cutoff[i] * wob * 1.03, 0.62)
    }
    bus.L[i] += filters[0].lp(tmp.L[i]) * gain[i]
    bus.R[i] += filters[1].lp(tmp.R[i]) * gain[i]
  }
}

/* The FM pluck. Brightness is the modulation index at the attack: the hook
   gets a glassy, almost mallet-like front, the whiteboard a soft one. */
function renderPluck(bus, send, duration, sections) {
  const eighth = BEAT / 2
  const steps = Math.ceil(duration / eighth)
  const pattern = [0, 2, 4, 3, 1, 3, 5, 2]
  const dry = new Bus(duration)
  for (let s = 0; s < steps; s++) {
    const t0 = s * eighth
    const lv = levelAt(sections, t0)
    if (lv.pluck <= 0.01) continue
    if (lv.thin && s % 2 === 1) continue
    const chord = chordAt(t0)
    const m = chord.arp[pattern[s % 8] % chord.arp.length]
    const accent = s % 8 === 0 ? 1 : s % 2 === 0 ? 0.8 : 0.62
    const f = mtof(m)
    const [gl, gr] = panGains(Math.sin(s * 0.9) * 0.45)
    const rel = 0.3 * lv.release
    const dur = Math.min(3, 0.9 * lv.release)
    const index = 1.1 + 2.7 * lv.bright
    const i0 = Math.floor(t0 * SR)
    const i1 = Math.min(dry.n, i0 + Math.floor(dur * SR))
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR
      const idx = index * Math.exp(-t / 0.06)
      const v = Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * 2 * f * t)) * Math.exp(-t / rel) * Math.min(1, t / 0.003)
      const out = v * 0.085 * accent * lv.pluck
      dry.L[i] += out * gl
      dry.R[i] += out * gr
    }
  }
  // ping-pong delay, dotted eighth
  const d = Math.round(BEAT * 0.75 * SR)
  const fbk = 0.32
  const wet = 0.26
  const lp = [new SVF(3200, 0.5), new SVF(3200, 0.5)]
  const dl = new Float32Array(dry.n)
  const dr = new Float32Array(dry.n)
  for (let i = 0; i < dry.n; i++) {
    const inL = dry.L[i] + (i >= d ? dr[i - d] * fbk : 0)
    const inR = dry.R[i] + (i >= d ? dl[i - d] * fbk : 0)
    dl[i] = lp[0].lp(inR)
    dr[i] = lp[1].lp(inL)
    const oL = dry.L[i] + (i >= d ? dl[i - d] * wet : 0)
    const oR = dry.R[i] + (i >= d ? dr[i - d] * wet : 0)
    bus.L[i] += oL
    bus.R[i] += oR
    send.L[i] += oL * 0.55
    send.R[i] += oR * 0.55
  }
}

/* Sine bass with a touch of second harmonic so it reads on small speakers. In
   full sections the second half of the bar is split, with a short pickup on
   the "and of 4" that pushes into the next chord. */
function renderBass(bus, duration, sections) {
  const half = BAR / 2
  const steps = Math.ceil(duration / half)
  for (let s = 0; s < steps; s++) {
    const t0 = s * half
    const lv = levelAt(sections, t0)
    if (lv.bass <= 0.01) continue
    const chord = chordAt(t0)
    const notes = [{ at: t0, m: chord.bass, dur: half * 0.96 }]
    if (lv.kickEvery === 1 && s % 2 === 1) {
      notes[0].dur = half * 0.62
      notes.push({ at: t0 + half * 0.75, m: chordAt(t0 + half).bass, dur: half * 0.22 })
    }
    for (const nt of notes) {
      const f = mtof(nt.m)
      const i0 = Math.floor(nt.at * SR)
      const i1 = Math.min(bus.n, i0 + Math.floor((nt.dur + 0.15) * SR))
      for (let i = i0; i < i1; i++) {
        const t = (i - i0) / SR
        let env = Math.min(1, t / 0.012)
        if (t > nt.dur) env *= Math.exp(-(t - nt.dur) / 0.05)
        env *= 0.85 + 0.15 * Math.exp(-t / 0.2)
        const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) + 0.06 * Math.sin(2 * Math.PI * 3 * f * t)) * env * 0.16 * lv.bass
        bus.L[i] += v
        bus.R[i] += v
      }
    }
  }
}

function kick(bus, sidechain, t0, g, rand) {
  const i0 = Math.floor(t0 * SR)
  for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.45 * SR)); i++) {
    const t = (i - i0) / SR
    const ph = 2 * Math.PI * (46 * t + 95 * 0.04 * (1 - Math.exp(-t / 0.04)))
    const v = (Math.sin(ph) * Math.exp(-t / 0.22) + (t < 0.004 ? (rand() - 0.5) * 0.4 : 0)) * 0.34 * g
    bus.L[i] += v
    bus.R[i] += v
  }
  for (let i = i0; i < Math.min(sidechain.length, i0 + Math.floor(0.5 * SR)); i++) {
    const t = (i - i0) / SR
    sidechain[i] = Math.min(sidechain[i], 1 - 0.38 * g * Math.exp(-t / 0.16))
  }
}

function snare(bus, send, t0, g, rand, { tone = 190, len = 0.3 } = {}) {
  const i0 = Math.floor(t0 * SR)
  const bp = new SVF(1700, 0.9)
  for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(len * SR)); i++) {
    const t = (i - i0) / SR
    const n = bp.bp(rand() * 2 - 1) * Math.exp(-t / 0.11)
    const body = Math.sin(2 * Math.PI * tone * t) * Math.exp(-t / 0.05) * 0.4
    const v = (n + body) * 0.11 * g
    bus.L[i] += v
    bus.R[i] += v
    send.L[i] += v * 0.6
    send.R[i] += v * 0.6
  }
}

function renderDrums(bus, send, duration, sections, sidechain) {
  const rand = rng(7)
  const eighth = BEAT / 2
  const steps = Math.ceil(duration / eighth)
  for (let s = 0; s < steps; s++) {
    const t0 = s * eighth
    const lv = levelAt(sections, t0)
    const i0 = Math.floor(t0 * SR)
    const beatPos = s % 8
    if (lv.kick > 0.01 && lv.kickEvery > 0) {
      const onBeat = s % 2 === 0 && (beatPos / 2) % lv.kickEvery === 0
      // the groove keeps a pickup on the "and" of 4 every other bar
      const pickup = lv.kickEvery === 2 && beatPos === 7 && Math.floor(s / 8) % 2 === 1
      if (onBeat || pickup) kick(bus, sidechain, t0, lv.kick * (pickup ? 0.55 : 1), rand)
    }
    // hats on every eighth, off-beats louder
    if (lv.hat > 0.01) {
      const hp = new SVF(8200, 0.7)
      const vel = (s % 2 === 1 ? 1 : 0.55) * (0.85 + rand() * 0.3) * lv.hat
      const [gl, gr] = panGains(0.25)
      for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.08 * SR)); i++) {
        const t = (i - i0) / SR
        const v = hp.hp(rand() * 2 - 1) * Math.exp(-t / 0.028) * 0.05 * vel
        bus.L[i] += v * gl
        bus.R[i] += v * gr
      }
    }
    // soft snare/clap on 2 and 4
    if ((beatPos === 2 || beatPos === 6) && lv.snare > 0.01) snare(bus, send, t0, lv.snare, rand)
  }

  /* A banner is a chapter turning: a 32nd-note roll climbs into the moment it
     lands, and a hit — crash, kick, low tom, the bar's chord — marks it. The
     banner slides in at its section start, so that is where the hit goes,
     whether or not it falls on a beat. */
  for (const s of sections) {
    if (kindOf(s) !== 'banner') continue
    const g = LEVELS.banner.snare
    for (let k = 0; k < 8; k++) {
      const at = s.start - 0.6 + k * 0.075
      if (at < 0) continue
      snare(bus, send, at, g * (0.35 + 0.65 * (k / 7)), rand, { tone: 150 + k * 22, len: 0.12 })
    }
    kick(bus, sidechain, s.start, 1.0, rand)
    const i0 = Math.floor(s.start * SR)
    const hp = new SVF(4500, 0.6)
    const chord = chordAt(s.start)
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(1.4 * SR)); i++) {
      const t = (i - i0) / SR
      const crash = hp.hp(rand() * 2 - 1) * Math.exp(-t / 0.42) * 0.09
      const tom = Math.sin(2 * Math.PI * (95 + 60 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.18) * 0.22
      let stab = 0
      for (const m of chord.pad) stab += Math.sin(2 * Math.PI * mtof(m) * t + 1.5 * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * mtof(m) * 2 * t))
      stab *= Math.exp(-t / 0.5) * 0.035
      const v = (crash + tom + stab) * Math.min(1, t / 0.002)
      bus.L[i] += v
      bus.R[i] += v
      send.L[i] += v * 0.7
      send.R[i] += v * 0.7
    }
  }
}

/* --- Sound effects -------------------------------------------------------- */
/* Every effect renders into its own short clip, is trimmed to a stated peak
   and only then joins the bus — so "−16 dBFS per key" is a number in a table
   rather than a gain someone tuned by ear against whatever else was playing.
   `len` and `lead` are seconds: how long the clip is, and how far before the
   event time it starts (whooshes arrive; a click happens). `wet` is the
   reverb send — keys and clicks stay dry, they are in the room with the viewer.
   The little generators below take an `add(i, v)` that has the pan baked in. */
const monoPan = (c, pan) => {
  const [gl, gr] = panGains(pan ?? 0)
  return (i, v) => {
    if (i < 0 || i >= c.n) return
    c.L[i] += v * gl
    c.R[i] += v * gr
  }
}

/* A filtered noise burst: `tau` is the decay time constant, `dur` the window. */
function burst(add, t0, { fc, q = 1, mode = 'bp', tau, dur, amp = 1 }, rand) {
  const f = new SVF(fc, q)
  const i0 = Math.floor(t0 * SR)
  const n = Math.floor(dur * SR)
  for (let k = 0; k < n; k++) {
    const x = rand() * 2 - 1
    const y = mode === 'bp' ? f.bp(x) : mode === 'lp' ? f.lp(x) : f.hp(x)
    add(i0 + k, y * Math.exp(-k / SR / tau) * amp)
  }
}

/* A decaying sine whose pitch may start higher and fall — a knock, a thump. */
function ping(add, t0, { f, drop = 0, dropTau = 0.004, tau, dur, amp = 1, harm = 0 }) {
  const i0 = Math.floor(t0 * SR)
  const n = Math.floor(dur * SR)
  let ph = 0
  for (let k = 0; k < n; k++) {
    const t = k / SR
    ph += (f + drop * Math.exp(-t / dropTau)) / SR
    const env = Math.exp(-t / tau) * Math.min(1, t / 0.0004)
    add(i0 + k, (Math.sin(2 * Math.PI * ph) + harm * Math.sin(4 * Math.PI * ph)) * env * amp)
  }
}

const DEEP_KEYS = new Set([' ', 'Space', 'Enter', 'Backspace', 'Shift'])
/* 'Control+z' is two keys under two fingers; a single '+' is one key. */
const chordKeys = (key) => (key == null ? ['x'] : key.length <= 1 ? [key] : key.split('+').filter(Boolean))

/* One Cherry MX Blue press, at `at` seconds into the clip. The jacket click is
   a high, very short tick; 12 ms later the stem bottoms out on the plate — a
   duller, noisier knock with the housing's resonance. The finger lifts 90–140
   ms later and the jacket clicks back up, softer and a shade higher. The big
   keys (space, enter, backspace, shift) have a stabiliser bar and more
   plastic, so their bottom-out is deeper and a little louder. */
function mxPress(add, at, key, rand) {
  const kr = rng(hashStr(key))
  const deep = DEEP_KEYS.has(key)
  const fc = 4800 * (1 + (kr() * 2 - 1) * 0.12) * (1 + (rand() * 2 - 1) * 0.03)
  const res = deep ? 700 : 1100 + kr() * 300
  const release = 0.09 + kr() * 0.05 + (rand() - 0.5) * 0.012
  const body = deep ? dbToGain(3) : 1
  // press: the jacket tick — the crisp part, so it peaks close to the bottom-out despite lasting 3 ms
  burst(add, at, { fc, q: 2.0, tau: 0.0009, dur: 0.0035, amp: 1.9 }, rand)
  burst(add, at, { fc: fc * 1.9, q: 1.2, tau: 0.0005, dur: 0.002, amp: 0.5 }, rand)
  // bottom-out
  const bo = at + 0.012
  burst(add, bo, { fc: deep ? 1500 : 2500, q: 0.7, mode: 'lp', tau: deep ? 0.0032 : 0.0025, dur: deep ? 0.012 : 0.008, amp: 0.85 * body }, rand)
  ping(add, bo, { f: res, drop: res * 0.25, dropTau: 0.002, tau: deep ? 0.007 : 0.0045, dur: 0.03, amp: 0.55 * body, harm: 0.2 })
  if (deep) ping(add, bo, { f: 240, drop: 60, tau: 0.012, dur: 0.05, amp: 0.3 })
  // release: a softer tick, and the stem tapping the top of its travel
  const up = at + release
  burst(add, up, { fc: fc * 1.15, q: 2.0, tau: 0.0008, dur: 0.003, amp: 1.0 }, rand)
  burst(add, up + 0.003, { fc: 2200, q: 0.7, mode: 'lp', tau: 0.002, dur: 0.006, amp: 0.3 * body }, rand)
}

const SFX = {
  mxblue: {
    peak: -16,
    wet: 0.05,
    len: () => 0.26,
    render(c, o, rand) {
      const keys = chordKeys(o.key)
      // the keyboard sits a little left of centre on screen; a hand on the right half of it is the same
      const add = monoPan(c, o.pan ?? -0.08 + (rng(hashStr(keys[keys.length - 1]))() - 0.5) * 0.18)
      let at = 0
      for (const k of keys) {
        mxPress(add, at, k, rand)
        at += 0.035 + rand() * 0.03 // a chord's keys go down one after the other
      }
    },
  },
  /* A mouse click: short, dry, slightly bassy. Press is a 3 ms transient with
     its energy at 3–5 kHz over a 280 Hz knock from the shell; the button comes
     back up 70 ms later at 60 %. Panned by the cursor. */
  click: {
    peak: -18,
    wet: 0.03,
    len: () => 0.16,
    render(c, o, rand) {
      const add = monoPan(c, o.pan)
      const j = 1 + (rand() - 0.5) * 0.08
      burst(add, 0, { fc: 4000 * j, q: 1.3, tau: 0.0008, dur: 0.003, amp: 1.2 }, rand)
      burst(add, 0, { fc: 9000, q: 0.7, mode: 'hp', tau: 0.0004, dur: 0.0015, amp: 0.15 }, rand)
      ping(add, 0, { f: 280 * j, drop: 140, dropTau: 0.003, tau: 0.005, dur: 0.02, amp: 0.8, harm: 0.15 })
      ping(add, 0.0005, { f: 1650 * j, drop: 200, tau: 0.0025, dur: 0.012, amp: 0.25 })
      const up = 0.07 + (rand() - 0.5) * 0.008
      burst(add, up, { fc: 3400 * j, q: 1.3, tau: 0.0007, dur: 0.0025, amp: 0.7 }, rand)
      ping(add, up, { f: 320 * j, drop: 120, dropTau: 0.003, tau: 0.004, dur: 0.015, amp: 0.45, harm: 0.15 })
    },
  },
  /* A marker on a whiteboard for as long as the stroke lasts: a low felt drag
     the whole way, and a squeak — one partial with a 6 Hz waver and breathy
     noise around it — that comes and goes as the hand's pressure changes. */
  marker: {
    peak: -24,
    wet: 0.12,
    len: (o) => (o.dur ?? 0.8) + 0.15,
    render(c, o, rand) {
      const dur = o.dur ?? 0.8
      const add = monoPan(c, o.pan ?? -0.15)
      const base = 1900 + rand() * 1200
      const breath = new SVF(base, 5)
      const drag = new SVF(1100, 0.5)
      let ph = 0
      let sq = 0
      let sqTarget = 0.6
      let nextPick = 0
      for (let i = 0; i < c.n; i++) {
        const t = i / SR
        if (t >= nextPick) {
          // squeak on for 150–400 ms, then mostly off
          sqTarget = rand() < 0.6 ? 0.45 + 0.55 * rand() : 0.04
          nextPick = t + 0.15 + rand() * 0.25
        }
        sq += (sqTarget - sq) * 0.0006
        const gate = Math.min(1, t / 0.02) * (t > dur ? Math.exp(-(t - dur) / 0.03) : 1)
        const f = base * (1 + 0.015 * Math.sin(2 * Math.PI * 6 * t)) * (1 + 0.02 * (sq - 0.5))
        if ((i & 63) === 0) breath.set(f, 5)
        ph += f / SR
        const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * 6 * t + 1)
        const x = rand() * 2 - 1
        const tone = Math.sin(2 * Math.PI * ph) * 0.45 * trem
        const air = breath.bp(x) * 0.25
        const felt = drag.lp(x) * 0.5
        add(i, (tone * sq + air * sq + felt) * gate)
      }
    },
  },
  /* A spring — the mascot leaving the ground: the pitch climbs a tenth over a
     quarter second while a 14 Hz wobble on it dies away. */
  boing: {
    peak: -15,
    wet: 0.15,
    len: () => 0.5,
    render(c, o) {
      const add = monoPan(c, o.pan)
      let ph = 0
      for (let i = 0; i < c.n; i++) {
        const t = i / SR
        const x = Math.min(1, t / 0.28)
        const ease = 1 - (1 - x) * (1 - x)
        const f = 160 * Math.pow(3.25, ease) * (1 + 0.08 * Math.exp(-t / 0.12) * Math.sin(2 * Math.PI * 14 * t))
        ph += f / SR
        const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.16)
        add(i, (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph) * Math.exp(-t / 0.08)) * env)
      }
    },
  },
  /* Landing: a 90 Hz thump with a fast pitch drop, and a puff of noise. */
  land: {
    peak: -14,
    wet: 0.08,
    len: () => 0.3,
    render(c, o, rand) {
      const add = monoPan(c, o.pan)
      ping(add, 0, { f: 90, drop: 130, dropTau: 0.02, tau: 0.09, dur: 0.3, amp: 1, harm: 0.1 })
      burst(add, 0, { fc: 3000, q: 0.6, mode: 'lp', tau: 0.006, dur: 0.025, amp: 0.7 }, rand)
    },
  },
  /* Three bell partials, each sliding up a fifth into its note, 70 ms apart. */
  sparkle: {
    peak: -20,
    wet: 0.35,
    len: () => 1.1,
    render(c, o) {
      const notes = [86, 90, 93]
      notes.forEach((m, k) => {
        const add = monoPan(c, -0.3 + k * 0.3)
        const f1 = mtof(m)
        const i0 = Math.floor(k * 0.07 * SR)
        let ph = 0
        let ph2 = 0
        for (let i = i0; i < c.n; i++) {
          const t = (i - i0) / SR
          const g = 1 - Math.exp(-t / 0.06)
          const f = f1 * Math.pow(2, (-7 / 12) * (1 - g))
          ph += f / SR
          ph2 += (f * 2.76) / SR
          const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.45) + 0.25 * Math.sin(2 * Math.PI * ph2) * Math.exp(-t / 0.12)
          add(i, v * Math.min(1, t / 0.003))
        }
      })
    },
  },
  /* A short bright whoosh for a banner sliding through — noise swept up
     through 1.5–7 kHz and back, panned across in the banner's direction. */
  swoosh: {
    peak: -16,
    wet: 0.2,
    len: (o) => o.dur ?? 0.38,
    lead: (o) => (o.dur ?? 0.38) * 0.35,
    render(c, o, rand) {
      const dir = o.dir ?? 1
      const f = new SVF(1500, 1.1)
      for (let i = 0; i < c.n; i++) {
        const x = i / c.n
        if ((i & 15) === 0) f.set(1500 * Math.pow(4.7, Math.sin(Math.PI * x)), 1.1)
        const env = Math.pow(Math.sin(Math.PI * x), 1.4)
        const [gl, gr] = panGains(dir * (x * 1.6 - 0.8))
        const v = f.bp(rand() * 2 - 1) * env
        c.L[i] += v * gl
        c.R[i] += v * gr
      }
    },
  },
  /* Air moving past — band-passed noise sweeping up then down, panned across. */
  whoosh: {
    peak: -12,
    wet: 0.35,
    len: (o) => o.dur ?? 0.7,
    lead: (o) => (o.dur ?? 0.7) * 0.55,
    render(c, o, rand) {
      const dir = o.dir ?? 1
      const f = new SVF(400, 1.4)
      const f2 = new SVF(400, 1.4)
      for (let k = 0; k < c.n; k++) {
        const x = k / c.n
        const cutoff = 250 * Math.pow(18, Math.sin(Math.PI * x))
        if ((k & 15) === 0) {
          f.set(cutoff, 1.3)
          f2.set(cutoff * 1.15, 1.3)
        }
        const env = Math.pow(Math.sin(Math.PI * x), 1.6)
        const [gl, gr] = panGains(dir * (x * 1.4 - 0.7))
        c.L[k] += f.bp(rand() * 2 - 1) * env * gl
        c.R[k] += f2.bp(rand() * 2 - 1) * env * gr
      }
    },
  },
  /* A rising swell into a title — noise and a gliding sine, cut at the hit. */
  riser: {
    peak: -12,
    wet: 0.4,
    len: (o) => o.dur ?? 1.6,
    lead: (o) => o.dur ?? 1.6,
    render(c, o, rand) {
      const hp = new SVF(600, 0.8)
      let ph = 0
      for (let k = 0; k < c.n; k++) {
        const x = k / c.n
        if ((k & 31) === 0) hp.set(500 + 6000 * x * x, 0.8)
        ph += (220 * Math.pow(4, x)) / SR
        const env = Math.pow(x, 2.2) * (1 - Math.pow(x, 24))
        const v = (hp.hp(rand() * 2 - 1) * 0.35 + Math.sin(2 * Math.PI * ph) * 0.12) * env
        c.L[k] += v
        c.R[k] += v
      }
    },
  },
  /* The spotlight landing — a pair of bell partials, bright and short. */
  chime: {
    peak: -20,
    wet: 0.4,
    len: () => 1.2,
    render(c, o) {
      chimeInto(monoPan(c, o.pan), 0, o.root ?? 86, 1)
    },
  },
  /* Something shipped — D major arpeggio, bell-like, with a tail. */
  success: {
    peak: -15,
    wet: 0.4,
    len: () => 1.6,
    render(c) {
      ;[74, 78, 81, 86].forEach((m, k) => chimeInto(monoPan(c, -0.3 + k * 0.2), k * 0.085, m, 1 - k * 0.08))
    },
  },
  /* A low, soft thump for a camera move or a card landing. */
  thump: {
    peak: -14,
    wet: 0.1,
    len: () => 0.35,
    render(c, o) {
      ping(monoPan(c, o.pan), 0, { f: 70, drop: 60, dropTau: 0.03, tau: 0.12, dur: 0.35 })
    },
  },
  /* Light UI pop — a toggle, a chip appearing. */
  pop: {
    peak: -20,
    wet: 0.2,
    len: () => 0.12,
    render(c, o) {
      ping(monoPan(c, o.pan), 0, { f: 520, drop: 900, dropTau: 0.015, tau: 0.035, dur: 0.12 })
    },
  },
}
SFX.key = SFX.mxblue // v1 name
export const SFX_NAMES = Object.keys(SFX).filter((k) => k !== 'key')

function chimeInto(add, at, root, amp) {
  const f0 = mtof(root)
  const partials = [
    [f0, 1, 0.5],
    [mtof(root + 7), 0.55, 0.38],
    [f0 * 2.76, 0.18, 0.12],
  ]
  const i0 = Math.floor(at * SR)
  for (let k = 0; k < Math.floor(1.2 * SR); k++) {
    const t = k / SR
    let v = 0
    for (const [f, a, d] of partials) v += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t / d)
    add(i0 + k, v * Math.min(1, t / 0.003) * amp)
  }
}

/* Render one effect into a fresh clip and trim it to its stated peak. */
function makeClip(type, o, rand) {
  const fx = SFX[type]
  if (!fx) return null
  const lead = fx.lead ? fx.lead(o) : 0
  const c = new Bus(fx.len(o))
  fx.render(c, o, rand)
  const pk = c.peak()
  const g = pk > 0 ? (dbToGain(fx.peak) / pk) * (o.gain ?? 1) : 0
  for (let i = 0; i < c.n; i++) {
    c.L[i] *= g
    c.R[i] *= g
  }
  return { c, lead, wet: fx.wet }
}

export function renderClip(type, opts = {}, seed = 1) {
  const r = makeClip(type, { gain: 1, ...opts }, rng(seed))
  if (!r) throw new Error(`unknown sfx: ${type}`)
  return { L: r.c.L, R: r.c.R, lead: r.lead }
}

/* --- Voice ---------------------------------------------------------------- */
/* The music steps back while someone speaks: a follower on the voice bus (150
   ms attack, 600 ms release, so it does not pump between syllables) pulls the
   music down by up to 7 dB. It reads 50 ms ahead so the bed is already on its
   way down when the first word lands. */
function duckLane(voice, n) {
  const out = new Float32Array(n).fill(1)
  const floor = dbToGain(-7)
  const ca = Math.exp(-1 / (0.15 * SR))
  const cr = Math.exp(-1 / (0.6 * SR))
  const ahead = Math.round(0.05 * SR)
  const env = new Float32Array(n)
  let e = 0
  for (let i = 0; i < n; i++) {
    const x = Math.abs(voice[i])
    e = x > e ? x + (e - x) * ca : x + (e - x) * cr
    env[i] = e
  }
  let deepest = 1
  for (let i = 0; i < n; i++) {
    const amt = clamp01(env[Math.min(n - 1, i + ahead)] / 0.12)
    out[i] = 1 - (1 - floor) * amt
    deepest = Math.min(deepest, out[i])
  }
  return { lane: out, deepest }
}

/* --- Master ---------------------------------------------------------------- */
export async function renderAudio({ duration, sections = [], events = [], vo = [], outFile, musicDb = -2, sfxDb = 0, voiceDb = 0 }) {
  const music = new Bus(duration)
  const send = new Bus(duration)
  const drums = new Bus(duration)
  const sidechain = new Float32Array(music.n).fill(1)

  renderDrums(drums, send, duration, sections, sidechain)
  const padBus = new Bus(duration)
  renderPad(padBus, duration, sections)
  const bassBus = new Bus(duration)
  renderBass(bassBus, duration, sections)
  const pluckBus = new Bus(duration)
  renderPluck(pluckBus, send, duration, sections)

  for (let i = 0; i < music.n; i++) {
    const sc = sidechain[i]
    music.L[i] = padBus.L[i] * sc + bassBus.L[i] * sc + pluckBus.L[i] + drums.L[i]
    music.R[i] = padBus.R[i] * sc + bassBus.R[i] * sc + pluckBus.R[i] + drums.R[i]
    send.L[i] += padBus.L[i] * 0.45
    send.R[i] += padBus.R[i] * 0.45
  }
  const verb = freeverb(send, { room: 0.86, damp: 0.4, width: 1 })

  // effects: each clip trimmed to its peak, then placed dry and sent to its own small room
  const sfx = new Bus(duration)
  const sfxSend = new Bus(duration)
  const rand = rng(1234)
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const r = makeClip(e.type, { gain: 1, ...e }, rand)
    if (!r) continue
    const i0 = Math.floor((e.t - r.lead) * SR)
    for (let k = 0; k < r.c.n; k++) {
      sfx.add(i0 + k, r.c.L[k], r.c.R[k])
      sfxSend.add(i0 + k, r.c.L[k] * r.wet, r.c.R[k] * r.wet)
    }
  }
  const sfxVerb = freeverb(sfxSend, { room: 0.55, damp: 0.5, width: 0.8 })

  // voice: every line where the edit put it, the bus peak-normalised to −3 dBFS
  const voice = new Float32Array(music.n)
  for (const v of vo) {
    const i0 = Math.floor(v.t * SR)
    const s = v.samples
    for (let k = 0; k < s.length; k++) {
      const i = i0 + k
      if (i >= 0 && i < voice.length) voice[i] += s[k]
    }
  }
  let vpk = 0
  for (let i = 0; i < voice.length; i++) vpk = Math.max(vpk, Math.abs(voice[i]))
  const vnorm = vpk > 0 ? dbToGain(-3) / vpk : 0
  for (let i = 0; i < voice.length; i++) voice[i] *= vnorm
  const duck = duckLane(voice, music.n)

  const mg = dbToGain(musicDb)
  const sg = dbToGain(sfxDb)
  const vg = dbToGain(voiceDb)
  const L = new Float32Array(music.n)
  const R = new Float32Array(music.n)
  const fadeIn = 1.2 * SR
  const fadeOut = 3.5 * SR
  const edge = 0.02 * SR
  let peak = 0
  let musicSq = 0
  for (let i = 0; i < music.n; i++) {
    // the bed fades in and out with the film; the voice and the effects only get a click guard at the edges
    let g = 1
    if (i < fadeIn) g = i / fadeIn
    if (i > music.n - fadeOut) g = Math.max(0, (music.n - i) / fadeOut)
    const m = mg * g * duck.lane[i]
    const ml = (music.L[i] + verb.L[i] * 0.9) * m
    const mr = (music.R[i] + verb.R[i] * 0.9) * m
    musicSq += ml * ml + mr * mr
    let l = ml + (sfx.L[i] + sfxVerb.L[i]) * sg + voice[i] * vg
    let r = mr + (sfx.R[i] + sfxVerb.R[i]) * sg + voice[i] * vg
    let eg = 1
    if (i < edge) eg = i / edge
    if (i > music.n - edge) eg = Math.max(0, (music.n - i) / edge)
    l *= eg
    r *= eg
    L[i] = l
    R[i] = r
    peak = Math.max(peak, Math.abs(l), Math.abs(r))
  }
  // gentle bus saturation, then normalise to -1 dBFS
  const drive = 1.25
  const norm = Math.tanh(drive)
  let peak2 = 0
  let sumSq = 0
  for (let i = 0; i < L.length; i++) {
    L[i] = Math.tanh(L[i] * drive) / norm
    R[i] = Math.tanh(R[i] * drive) / norm
    peak2 = Math.max(peak2, Math.abs(L[i]), Math.abs(R[i]))
    sumSq += L[i] * L[i] + R[i] * R[i]
  }
  const target = dbToGain(-1)
  const k = peak2 > 0 ? target / peak2 : 1
  const dither = rng(99)
  const bytes = Buffer.alloc(44 + L.length * 4)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + L.length * 4, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(2, 22)
  bytes.writeUInt32LE(SR, 24)
  bytes.writeUInt32LE(SR * 4, 28)
  bytes.writeUInt16LE(4, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(L.length * 4, 40)
  for (let i = 0; i < L.length; i++) {
    const dl = (dither() - dither()) / 32768
    const dr = (dither() - dither()) / 32768
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((L[i] * k + dl) * 32767))), 44 + i * 4)
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((R[i] * k + dr) * 32767))), 46 + i * 4)
  }
  await writeFile(outFile, bytes)
  const rms = Math.sqrt(sumSq / (L.length * 2)) * k
  const musicRms = Math.sqrt(musicSq / (L.length * 2)) * k
  return {
    seconds: duration,
    preLimiterPeak: peak,
    rmsDb: gainToDb(rms),
    musicRmsDb: gainToDb(musicRms),
    voicePeakDb: vpk > 0 ? -3 + gainToDb(vg) + gainToDb(k) : -Infinity,
    duckMaxDb: gainToDb(duck.deepest),
    gain: k,
  }
}

/* CLI: a 60-second audition of every section kind and the v1 effects. The v2
   audition with keys, clicks and a voice is audio/audition-v2.mjs. */
if (process.argv[1] && process.argv[1].endsWith('synth.mjs')) {
  const out = process.argv[2] ?? 'audition.wav'
  const sections = [
    { start: 0, end: 12, kind: 'intro' },
    { start: 12, end: 20, kind: 'title' },
    { start: 20, end: 44, kind: 'demo' },
    { start: 44, end: 50, kind: 'chapter' },
    { start: 50, end: 60, kind: 'outro' },
  ]
  const events = []
  for (let t = 21; t < 43; t += 1.7) events.push({ type: 'click', t })
  for (let t = 30; t < 32; t += 0.09) events.push({ type: 'key', t })
  events.push({ type: 'riser', t: 12 }, { type: 'whoosh', t: 12.2 }, { type: 'chime', t: 25 }, { type: 'success', t: 40 }, { type: 'whoosh', t: 44, dir: -1 }, { type: 'thump', t: 44.1 }, { type: 'pop', t: 35 })
  const t0 = performance.now()
  const res = await renderAudio({ duration: 60, sections, events, outFile: out })
  console.log(res, `${Math.round(performance.now() - t0)}ms`)
}
