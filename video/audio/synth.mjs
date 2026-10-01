/* -----------------------------------------------------------------------------
   The soundtrack — composed and mixed in code, no samples, no services.

   Two buses. MUSIC is a calm, forward-moving bed in D major at 96 BPM: a warm
   pad, a soft FM pluck arpeggio with a ping-pong delay, a sine bass and light
   percussion that comes and goes with the edit. SFX is the interface: a click
   for every click the cursor makes, a whoosh for every transition, a chime for
   every spotlight, soft ticks for typing and a small arpeggio when something
   is published.

   The arrangement is driven by the edit, not the other way round: the renderer
   hands over `sections` (what kind of material is on screen when) and `events`
   (every click, transition and highlight, to the frame), so the music thins
   under dense explanation and opens up on the title cards.

   Everything is deterministic (seeded noise), so the same edit renders the same
   file byte for byte.
   -------------------------------------------------------------------------- */
import { writeFile } from 'node:fs/promises'

const SR = 48000
const BPM = 96
const BEAT = 60 / BPM
const BAR = BEAT * 4

/* --- utilities ------------------------------------------------------------ */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
const dbToGain = (db) => Math.pow(10, db / 20)

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
/* IV – V – iii – vi in D: hopeful, never resolves hard, loops forever without
   the loop being audible. Voicings sit between G3 and C#5, clear of the UI
   clicks above and the bass below. */
const CHORDS = [
  { bass: 43, pad: [55, 59, 62, 66], arp: [67, 71, 74, 78, 79, 74] }, // Gmaj7
  { bass: 45, pad: [57, 61, 64, 66], arp: [69, 73, 76, 78, 81, 76] }, // A6
  { bass: 42, pad: [54, 57, 61, 64], arp: [66, 69, 73, 76, 78, 73] }, // F#m7
  { bass: 47, pad: [59, 62, 66, 73], arp: [71, 74, 78, 81, 83, 78] }, // Bm9
]

/* How dense each kind of material wants the music. `demo` is the default for
   product footage: the viewer is reading subtitles and watching a cursor, so
   the groove stays but the busy parts step back. */
const LEVELS = {
  intro: { pad: 1.0, pluck: 0.55, bass: 0.6, kick: 0.0, hat: 0.25, snare: 0.0, filter: 1500 },
  title: { pad: 1.0, pluck: 0.9, bass: 0.9, kick: 0.85, hat: 0.7, snare: 0.5, filter: 2600 },
  chapter: { pad: 0.95, pluck: 0.85, bass: 0.9, kick: 0.9, hat: 0.7, snare: 0.55, filter: 2400 },
  demo: { pad: 0.8, pluck: 0.45, bass: 0.75, kick: 0.55, hat: 0.4, snare: 0.0, filter: 1700 },
  outro: { pad: 1.0, pluck: 0.7, bass: 0.7, kick: 0.0, hat: 0.2, snare: 0.0, filter: 1900 },
  silent: { pad: 0.0, pluck: 0.0, bass: 0.0, kick: 0.0, hat: 0.0, snare: 0.0, filter: 800 },
}

function levelAt(sections, t) {
  for (const s of sections) if (t >= s.start && t < s.end) return LEVELS[s.kind] ?? LEVELS.demo
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
  const release = 1.4
  const voices = []
  for (let b = 0; b < bars; b++) {
    const chord = CHORDS[b % CHORDS.length]
    chord.pad.forEach((m, vi) => {
      voices.push({ start: b * BAR, end: (b + 1) * BAR, m, pan: [-0.55, -0.18, 0.18, 0.55][vi] })
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
    const i1 = Math.min(tmp.n, Math.floor((v.end + release) * SR))
    for (let i = i0; i < i1; i++) {
      const t = i / SR
      let env = Math.min(1, (t - v.start) / attack)
      if (t > v.end) env *= Math.exp(-(t - v.end) / (release * 0.35))
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

function renderPluck(bus, send, duration, sections) {
  const eighth = BEAT / 2
  const steps = Math.ceil(duration / eighth)
  const pattern = [0, 2, 4, 3, 1, 3, 5, 2]
  const dry = new Bus(duration)
  for (let s = 0; s < steps; s++) {
    const t0 = s * eighth
    const lv = levelAt(sections, t0).pluck
    if (lv <= 0.01) continue
    const bar = Math.floor(t0 / BAR)
    const chord = CHORDS[bar % CHORDS.length]
    const m = chord.arp[pattern[s % 8] % chord.arp.length]
    const accent = s % 8 === 0 ? 1 : s % 2 === 0 ? 0.78 : 0.6
    const f = mtof(m)
    const [gl, gr] = panGains(Math.sin(s * 0.9) * 0.45)
    const dur = 0.9
    const i0 = Math.floor(t0 * SR)
    const i1 = Math.min(dry.n, i0 + Math.floor(dur * SR))
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR
      const index = 2.0 * Math.exp(-t / 0.07)
      const v = Math.sin(2 * Math.PI * f * t + index * Math.sin(2 * Math.PI * 2 * f * t)) * Math.exp(-t / 0.32) * Math.min(1, t / 0.004)
      const out = v * 0.085 * accent * lv
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

function renderBass(bus, duration, sections) {
  const half = BAR / 2
  const steps = Math.ceil(duration / half)
  for (let s = 0; s < steps; s++) {
    const t0 = s * half
    const lv = levelAt(sections, t0).bass
    if (lv <= 0.01) continue
    const chord = CHORDS[Math.floor(t0 / BAR) % CHORDS.length]
    const m = chord.bass - 12 + (s % 2 === 1 ? 12 : 0) * 0
    const f = mtof(m)
    const dur = half * 0.96
    const i0 = Math.floor(t0 * SR)
    const i1 = Math.min(bus.n, i0 + Math.floor((dur + 0.15) * SR))
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR
      let env = Math.min(1, t / 0.012)
      if (t > dur) env *= Math.exp(-(t - dur) / 0.05)
      env *= 0.85 + 0.15 * Math.exp(-t / 0.2)
      const v = (Math.sin(2 * Math.PI * f * t) + 0.22 * Math.sin(2 * Math.PI * 2 * f * t) + 0.06 * Math.sin(2 * Math.PI * 3 * f * t)) * env * 0.16 * lv
      bus.L[i] += v
      bus.R[i] += v
    }
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
    // kick on 1 and 3, a pickup on the "and" of 4 every other bar
    const kick = beatPos === 0 || beatPos === 4 || (beatPos === 7 && Math.floor(s / 8) % 2 === 1)
    if (kick && lv.kick > 0.01) {
      const g = lv.kick * (beatPos === 7 ? 0.55 : 1)
      for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.45 * SR)); i++) {
        const t = (i - i0) / SR
        const f = 44 + 90 * Math.exp(-t / 0.04)
        const ph = 2 * Math.PI * (44 * t + 90 * 0.04 * (1 - Math.exp(-t / 0.04)))
        const v = (Math.sin(ph) * Math.exp(-t / 0.24) + (t < 0.004 ? (rand() - 0.5) * 0.4 : 0)) * 0.34 * g
        void f
        bus.L[i] += v
        bus.R[i] += v
      }
      for (let i = i0; i < Math.min(sidechain.length, i0 + Math.floor(0.5 * SR)); i++) {
        const t = (i - i0) / SR
        sidechain[i] = Math.min(sidechain[i], 1 - 0.38 * g * Math.exp(-t / 0.16))
      }
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
    if ((beatPos === 2 || beatPos === 6) && lv.snare > 0.01) {
      const bp = new SVF(1700, 0.9)
      for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.3 * SR)); i++) {
        const t = (i - i0) / SR
        const n = bp.bp(rand() * 2 - 1) * Math.exp(-t / 0.11)
        const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.4
        const v = (n + tone) * 0.11 * lv.snare
        bus.L[i] += v
        bus.R[i] += v
        send.L[i] += v * 0.6
        send.R[i] += v * 0.6
      }
    }
  }
}

/* --- Sound effects -------------------------------------------------------- */
const SFX = {
  /* A soft, glassy press — two short partials and a tick of noise. Quiet on
     purpose: there are a hundred of these, and a click that is loud once is
     annoying by the tenth. */
  click(bus, t, { gain = 1, pan = 0 } = {}, rand) {
    const i0 = Math.floor(t * SR)
    const [gl, gr] = panGains(pan)
    const bp = new SVF(3500, 1.2)
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.09 * SR)); i++) {
      const tt = (i - i0) / SR
      const tone = Math.sin(2 * Math.PI * (1250 - 500 * Math.min(1, tt / 0.02)) * tt) * Math.exp(-tt / 0.018)
      const tick = bp.bp(rand() * 2 - 1) * Math.exp(-tt / 0.006)
      const v = (tone * 0.5 + tick * 0.9) * 0.2 * gain
      bus.L[i] += v * gl
      bus.R[i] += v * gr
    }
  },
  /* A key under a finger — shorter and duller than a click. */
  key(bus, t, { gain = 1 } = {}, rand) {
    const i0 = Math.floor(t * SR)
    const bp = new SVF(2200 + rand() * 900, 1.0)
    const pan = (rand() - 0.5) * 0.3
    const [gl, gr] = panGains(pan)
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.05 * SR)); i++) {
      const tt = (i - i0) / SR
      const v = bp.bp(rand() * 2 - 1) * Math.exp(-tt / 0.009) * 0.13 * gain * (0.8 + rand() * 0.2)
      bus.L[i] += v * gl
      bus.R[i] += v * gr
    }
  },
  /* Air moving past — band-passed noise sweeping up then down, panned across. */
  whoosh(bus, t, { gain = 1, dur = 0.7, dir = 1 } = {}, rand) {
    const i0 = Math.floor((t - dur * 0.55) * SR)
    const n = Math.floor(dur * SR)
    const f = new SVF(400, 1.4)
    const f2 = new SVF(400, 1.4)
    for (let k = 0; k < n; k++) {
      const i = i0 + k
      const x = k / n
      const cutoff = 250 * Math.pow(18, Math.sin(Math.PI * x))
      if ((k & 15) === 0) {
        f.set(cutoff, 1.3)
        f2.set(cutoff * 1.15, 1.3)
      }
      const env = Math.pow(Math.sin(Math.PI * x), 1.6)
      const [gl, gr] = panGains(dir * (x * 1.4 - 0.7))
      const v = f.bp(rand() * 2 - 1) * env * 0.5 * gain
      const v2 = f2.bp(rand() * 2 - 1) * env * 0.5 * gain
      if (i >= 0 && i < bus.n) {
        bus.L[i] += v * gl
        bus.R[i] += v2 * gr
      }
    }
  },
  /* A rising swell into a title — noise and a gliding sine, cut at the hit. */
  riser(bus, t, { gain = 1, dur = 1.6 } = {}, rand) {
    const i0 = Math.floor((t - dur) * SR)
    const n = Math.floor(dur * SR)
    const hp = new SVF(600, 0.8)
    let ph = 0
    for (let k = 0; k < n; k++) {
      const i = i0 + k
      const x = k / n
      if ((k & 31) === 0) hp.set(500 + 6000 * x * x, 0.8)
      const f = 220 * Math.pow(4, x)
      ph += f / SR
      const env = Math.pow(x, 2.2) * (1 - Math.pow(x, 24))
      const v = (hp.hp(rand() * 2 - 1) * 0.35 + Math.sin(2 * Math.PI * ph) * 0.12) * env * gain * 0.5
      if (i >= 0 && i < bus.n) {
        bus.L[i] += v
        bus.R[i] += v
      }
    }
  },
  /* The spotlight landing — a pair of bell partials, bright and short. */
  chime(bus, t, { gain = 1, pan = 0, root = 86 } = {}) {
    const i0 = Math.floor(t * SR)
    const [gl, gr] = panGains(pan)
    const partials = [
      [mtof(root), 1, 0.5],
      [mtof(root + 7), 0.55, 0.38],
      [mtof(root) * 2.76, 0.18, 0.12],
    ]
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(1.2 * SR)); i++) {
      const tt = (i - i0) / SR
      let v = 0
      for (const [f, a, d] of partials) v += Math.sin(2 * Math.PI * f * tt) * a * Math.exp(-tt / d)
      v *= Math.min(1, tt / 0.003) * 0.06 * gain
      bus.L[i] += v * gl
      bus.R[i] += v * gr
    }
  },
  /* Something shipped — D major arpeggio, bell-like, with a tail. */
  success(bus, t, { gain = 1 } = {}) {
    const notes = [74, 78, 81, 86]
    notes.forEach((m, k) => SFX.chime(bus, t + k * 0.085, { gain: gain * (1 - k * 0.08), pan: -0.3 + k * 0.2, root: m }))
  },
  /* A low, soft thump for a camera move or a card landing. */
  thump(bus, t, { gain = 1 } = {}) {
    const i0 = Math.floor(t * SR)
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.35 * SR)); i++) {
      const tt = (i - i0) / SR
      const v = Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-tt / 0.03)) * tt) * Math.exp(-tt / 0.12) * 0.16 * gain
      bus.L[i] += v
      bus.R[i] += v
    }
  },
  /* Light UI pop — a toggle, a chip appearing. */
  pop(bus, t, { gain = 1, pan = 0 } = {}) {
    const i0 = Math.floor(t * SR)
    const [gl, gr] = panGains(pan)
    for (let i = i0; i < Math.min(bus.n, i0 + Math.floor(0.12 * SR)); i++) {
      const tt = (i - i0) / SR
      const f = 520 + 900 * Math.exp(-tt / 0.015)
      const v = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt / 0.035) * 0.09 * gain
      bus.L[i] += v * gl
      bus.R[i] += v * gr
    }
  },
}

/* --- Master ---------------------------------------------------------------- */
export async function renderAudio({ duration, sections = [], events = [], outFile, musicDb = -3, sfxDb = 0 }) {
  const music = new Bus(duration)
  const send = new Bus(duration)
  const drums = new Bus(duration)
  const sfx = new Bus(duration)
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

  const rand = rng(1234)
  for (const e of events) {
    const fx = SFX[e.type]
    if (fx) fx(sfx, e.t, e, rand)
  }
  const sfxVerb = freeverb(sfx, { room: 0.55, damp: 0.5, width: 0.8 })

  const mg = dbToGain(musicDb)
  const sg = dbToGain(sfxDb)
  const L = new Float32Array(music.n)
  const R = new Float32Array(music.n)
  const fadeIn = 1.2 * SR
  const fadeOut = 3.5 * SR
  let peak = 0
  for (let i = 0; i < music.n; i++) {
    let l = (music.L[i] + verb.L[i] * 0.9) * mg + (sfx.L[i] + sfxVerb.L[i] * 0.35) * sg
    let r = (music.R[i] + verb.R[i] * 0.9) * mg + (sfx.R[i] + sfxVerb.R[i] * 0.35) * sg
    let g = 1
    if (i < fadeIn) g = i / fadeIn
    if (i > music.n - fadeOut) g = Math.max(0, (music.n - i) / fadeOut)
    l *= g
    r *= g
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
  return { seconds: duration, preLimiterPeak: peak, rmsDb: 20 * Math.log10(rms), gain: k }
}

/* CLI: a 60-second audition of every section kind and every effect. */
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
