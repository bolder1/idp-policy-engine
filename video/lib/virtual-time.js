/* -----------------------------------------------------------------------------
   Virtual time — injected into the app before any of its own scripts run.

   The recorder does not film the app in real time. It stops the app's clock,
   takes a picture, moves the clock forward by exactly one frame, and takes the
   next picture. A screenshot of a 2880×1800 page takes longer than a frame
   lasts, so a real-time recording drops frames and stutters; a stepped one
   cannot, and every spring, fade and hover lands on the frame it belongs to.

   Three clocks have to be stopped together, or the app tears:

   1. JavaScript time — performance.now, Date, setTimeout/setInterval and
      requestAnimationFrame. Motion's springs and React's scheduler read these.
   2. The browser's animation clock — Web Animations, CSS transitions and CSS
      keyframes run on the document timeline, which is REAL time and cannot be
      replaced. Every animation is therefore owned here: paused the moment it
      exists, and its currentTime set from the virtual clock each frame.
   3. The frame loop — rAF callbacks are queued, not run, until advance() hands
      them the new virtual timestamp.

   The trap that shaped (2), found the hard way: Motion creates a WAAPI
   animation and immediately sets `animation.startTime = performance.now()`,
   assuming that equals `document.timeline.currentTime`. Under a virtual clock
   it does not — the two drift apart by seconds — so the animation either lands
   "already finished" before anything can see it (entrance fades vanish) or
   starts seconds in the future (an exit never finishes, and a closed dialog
   stays mounted forever). So the app's own startTime and currentTime writes
   are read as VIRTUAL times and never reach the real timeline.

   `freeRun(true)` pumps the virtual clock from the real one, for booting the
   app and for setup nobody films.
   -------------------------------------------------------------------------- */
(() => {
  if (window.__vt) return

  const nativeRAF = window.requestAnimationFrame.bind(window)
  const nativeSetTimeout = window.setTimeout.bind(window)
  const nativePerfNow = performance.now.bind(performance)
  const NativeDate = Date

  let now = nativePerfNow()
  const dateOffset = NativeDate.now() - now
  let nextId = 1
  /** @type {Map<number, {due:number, cb:Function, args:any[], every:number, seq:number}>} */
  const timers = new Map()
  /** @type {Map<number, Function>} */
  let rafQueue = new Map()

  const errors = []
  const report = (e) => {
    if (errors.length < 50) errors.push(String((e && e.stack) || e).slice(0, 400))
  }

  /* --- 1 · JS time ------------------------------------------------------------ */
  try {
    performance.now = () => now
  } catch (e) {
    report(e)
  }

  class VDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) super(now + dateOffset)
      else super(...args)
    }
    static now() {
      return Math.floor(now + dateOffset)
    }
  }
  Object.defineProperty(VDate, 'name', { value: 'Date' })
  window.Date = VDate

  const toFn = (cb) => (typeof cb === 'function' ? cb : () => (0, eval)(String(cb)))

  window.setTimeout = (cb, ms, ...args) => {
    const id = nextId++
    timers.set(id, { due: now + Math.max(0, Number(ms) || 0), cb: toFn(cb), args, every: 0, seq: id })
    return id
  }
  window.setInterval = (cb, ms, ...args) => {
    const id = nextId++
    const every = Math.max(1, Number(ms) || 0)
    timers.set(id, { due: now + every, cb: toFn(cb), args, every, seq: id })
    return id
  }
  window.clearTimeout = (id) => {
    timers.delete(id)
  }
  window.clearInterval = window.clearTimeout

  window.requestAnimationFrame = (cb) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    rafQueue.delete(id)
  }

  /* --- 2 · the animation clock -------------------------------------------------- */
  const AP = Animation.prototype
  const nativePause = AP.pause
  const nativePlay = AP.play
  const nativeFinish = AP.finish
  const startDesc = Object.getOwnPropertyDescriptor(AP, 'startTime')
  const currentDesc = Object.getOwnPropertyDescriptor(AP, 'currentTime')
  const readCurrent = (a) => {
    const v = currentDesc.get.call(a)
    return typeof v === 'number' ? v : v && typeof v.value === 'number' ? v.value : null
  }

  /** virtual ms at which each animation's local time was 0 */
  const startOf = new WeakMap()
  /** animations the APP has paused — left exactly where it put them */
  const held = new WeakSet()

  const adopt = (a, start) => {
    startOf.set(a, start)
    try {
      nativePause.call(a)
      currentDesc.set.call(a, Math.max(0, now - start))
    } catch (e) {
      report(e)
    }
  }

  const nativeAnimate = Element.prototype.animate
  Element.prototype.animate = function (...args) {
    const a = nativeAnimate.apply(this, args)
    adopt(a, now)
    return a
  }

  try {
    Object.defineProperty(AP, 'startTime', {
      configurable: true,
      enumerable: startDesc.enumerable,
      get() {
        const s = startOf.get(this)
        return s !== undefined && !held.has(this) ? s : startDesc.get.call(this)
      },
      set(v) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          held.delete(this)
          adopt(this, v)
        } else {
          startDesc.set.call(this, v)
        }
      },
    })
    Object.defineProperty(AP, 'currentTime', {
      configurable: true,
      enumerable: currentDesc.enumerable,
      get() {
        return currentDesc.get.call(this)
      },
      set(v) {
        if (typeof v === 'number' && Number.isFinite(v)) startOf.set(this, now - v)
        currentDesc.set.call(this, v)
      },
    })
    AP.pause = function () {
      held.add(this)
      return nativePause.call(this)
    }
    AP.play = function () {
      held.delete(this)
      const r = nativePlay.call(this)
      // play() on a finished animation rewinds it; read where it really is now
      const ct = readCurrent(this)
      adopt(this, now - (ct ?? 0))
      return r
    }
  } catch (e) {
    report(e)
  }

  /* --- change detection ------------------------------------------------------------
     A frame where nothing mutated, no animation is live and no rAF work ran is
     pixel-identical to the one before it, so the recorder can reuse the last
     picture instead of taking a new one. Most of a demo is somebody reading. */
  let mutated = true
  let rafRan = false
  const watch = () => {
    try {
      new MutationObserver(() => {
        mutated = true
      }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
    } catch (e) {
      report(e)
    }
  }
  if (document.documentElement) watch()
  else document.addEventListener('DOMContentLoaded', watch)

  let live = 0
  const syncAnimations = () => {
    let list
    try {
      // also flushes style, so a transition this frame started exists now
      list = document.getAnimations()
    } catch {
      return
    }
    live = 0
    for (const a of list) {
      let s = startOf.get(a)
      if (s === undefined) {
        // a CSS transition or keyframe animation, seen for the first time
        s = now
        startOf.set(a, s)
      }
      const state = a.playState
      if (state === 'idle' || held.has(a)) continue
      if (state === 'finished') continue
      try {
        if (state !== 'paused') nativePause.call(a)
        const t = now - s
        let end = Infinity
        try {
          end = a.effect ? a.effect.getComputedTiming().endTime : Infinity
        } catch {
          /* keep Infinity */
        }
        if (Number.isFinite(end) && t >= end) {
          nativeFinish.call(a)
        } else {
          currentDesc.set.call(a, Math.max(0, t))
          live++
        }
      } catch (e) {
        report(e)
      }
    }
  }

  const macrotask = () => new Promise((r) => nativeSetTimeout(r, 0))

  let busy = false
  const advance = async (ms) => {
    busy = true
    const target = now + Math.max(0, ms)
    try {
      for (let guard = 0; guard < 5000; guard++) {
        let pick = null
        for (const [id, t] of timers) {
          if (t.due > target) continue
          if (!pick || t.due < pick.t.due || (t.due === pick.t.due && t.seq < pick.t.seq)) pick = { id, t }
        }
        if (!pick) break
        if (pick.t.due > now) now = pick.t.due
        if (pick.t.every) {
          pick.t.due += pick.t.every
          pick.t.seq = nextId++
        } else {
          timers.delete(pick.id)
        }
        try {
          pick.t.cb(...pick.t.args)
        } catch (e) {
          report(e)
        }
        // let promise reactions queued by the callback run, as between two real timer tasks
        await null
      }
      now = target

      const queue = rafQueue
      rafQueue = new Map()
      rafRan = queue.size > 0
      for (const cb of queue.values()) {
        try {
          cb(now)
        } catch (e) {
          report(e)
        }
      }
      await null
      // React renders and flushes effects on MessageChannel tasks; give them a
      // real turn of the event loop before the picture is taken.
      await macrotask()
      await macrotask()
      syncAnimations()
    } finally {
      busy = false
    }
  }

  /* --- free run ------------------------------------------------------------------ */
  let free = false
  let lastReal = 0
  const pump = async () => {
    if (!free) return
    const real = nativePerfNow()
    const d = Math.min(100, real - lastReal)
    lastReal = real
    if (!busy) await advance(d)
    if (free) nativeRAF(pump)
  }

  window.__vt = {
    advance,
    now: () => now,
    freeRun(on) {
      free = !!on
      if (free) {
        lastReal = nativePerfNow()
        nativeRAF(pump)
      }
    },
    /** Consume and report whether the last step could have changed a pixel. */
    takeDirty() {
      const d = mutated || rafRan || live > 0
      mutated = false
      rafRan = false
      return d
    },
    stats: () => ({ now, timers: timers.size, raf: rafQueue.size, live, errors: errors.slice() }),
  }
})()
