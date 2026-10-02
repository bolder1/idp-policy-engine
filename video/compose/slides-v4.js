/* -----------------------------------------------------------------------------
   The bookends, fifth take: type on the film's own ground.

   INTRO (`hook`). The wordmark, the product's name and one sentence — nothing
   else. Each rises a little as it fades in; once the line has been spoken the
   sentence, the name and the wordmark leave in that order, and the slide ends
   on bare ground so the edit can cut to the rule card rising in.

   OUTRO (`outro`). The same wordmark and name, a claim line and the address,
   arriving in turn while the last window dissolves beneath them; then
   everything holds still to the end.

   The section is transparent: the compositor's #bg is the only ground. Every
   value is a function of the slide's clock `t`. The intro's exits are keyed to
   the end of its spoken line (`params.cues[id] = { at, dur }` from the EDL), so
   a longer voice is never cut off. The two register into `window.SLIDES3`
   alongside the seventh cut's slides (bento, concept, priority), which win over
   the older slides of the same names; nothing here replaces the object.
   -------------------------------------------------------------------------- */
;(() => {
  const C = window.COMPOSE
  const { clamp, lerp } = C
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1))
  const q = (el, s) => el.querySelector(s)
  const LOGO = '/app/xecurify-logo.png'

  /* A CSS cubic-bezier as a function of progress: x(u) is monotonic, so solve
     x(u) = p for u by bisection and read y(u) there. */
  const bezier = (x1, y1, x2, y2) => {
    const at = (a, b, u) => 3 * a * (1 - u) * (1 - u) * u + 3 * b * (1 - u) * u * u + u * u * u
    return (p) => {
      if (p <= 0) return 0
      if (p >= 1) return 1
      let lo = 0
      let hi = 1
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (at(x1, x2, mid) < p) lo = mid
        else hi = mid
      }
      return at(y1, y2, (lo + hi) / 2)
    }
  }
  const OUT_B = bezier(0, 0.4, 0, 1) // entrances that move
  const OUT_P = bezier(0.4, 1, 0.6, 1) // fades in
  const IN_P = bezier(0.6, 0, 0.8, 0.6) // exits of type

  /* One element's life: it fades in (OUT-P) while rising `rise` px into place
     (OUT-B), holds, then fades out (IN-P) lifting `lift` px — a lift of 0 is a
     plain fade. `enter` and `leave` are [start, end] in slide seconds; no
     `leave` means it stays. Returns the entrance progress for callers that
     drive one more property off it. */
  function life(el, t, enter, rise, leave, lift = 0) {
    const kin = seg(t, enter[0], enter[1])
    const kout = leave ? IN_P(seg(t, leave[0], leave[1])) : 0
    const y = (1 - OUT_B(kin)) * rise - kout * lift
    el.style.opacity = (OUT_P(kin) * (1 - kout)).toFixed(4)
    el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
    return kin
  }
  // the name's tracking settles from -0.010em to -0.025em as it arrives
  const track = (el, kin) => {
    el.style.letterSpacing = `${lerp(-0.01, -0.025, OUT_B(kin)).toFixed(4)}em`
  }

  /* ============================================================================
     INTRO
     ============================================================================ */
  const hook = {
    build(el) {
      el.innerHTML = `
        <div class="v4 v4--hook">
          <img class="v4-lockup" src="${LOGO}" alt="" width="362" height="97">
          <div class="v4-name">Policy Engine</div>
          <div class="v4-sub">Who gets in, from where, and what they have to prove.</div>
        </div>`
    },
    update(el, t, dur, params) {
      if (!q(el, '.v4')) hook.build(el)
      /* E: when the spoken line ends; the exits start after it, never before 7.0 s.
         hk.1 is two sentences now (about 8 s spoken), so E lands well past 7.0 and
         the slide's own length (lead + line + tail) leaves the bare ground after. */
      const cues = params?.cues ?? {}
      const ids = Object.keys(cues)
      const cue = cues['hk.1'] ?? (ids.length ? cues[ids[0]] : null)
      const E = cue ? cue.at + cue.dur : dur - 1.4
      const X = Math.max(7.0, E + 0.2)
      life(q(el, '.v4-lockup'), t, [0.6, 1.3], 12, [X + 0.2, X + 0.7], 0)
      const name = q(el, '.v4-name')
      track(name, life(name, t, [1.2, 1.9], 20, [X + 0.1, X + 0.6], 10))
      life(q(el, '.v4-sub'), t, [2.4, 3.0], 12, [X, X + 0.45], 10)
    },
  }

  /* ============================================================================
     OUTRO — mirrors the intro; nothing leaves, the last frame is held
     ============================================================================ */
  const outro = {
    build(el) {
      el.innerHTML = `
        <div class="v4 v4--outro">
          <img class="v4-lockup" src="${LOGO}" alt="" width="362" height="97">
          <div class="v4-name v4-name--outro">Policy Engine</div>
          <div class="v4-line">Access policy, in plain English.</div>
          <div class="v4-url">idp.xecurify.com</div>
        </div>`
    },
    update(el, t) {
      if (!q(el, '.v4')) outro.build(el)
      // the first 0.8 s belong to the window before it, dissolving to ground
      life(q(el, '.v4-lockup'), t, [0.6, 1.3], 12)
      const name = q(el, '.v4-name')
      track(name, life(name, t, [1.0, 1.7], 16))
      life(q(el, '.v4-line'), t, [2.2, 2.8], 10)
      life(q(el, '.v4-url'), t, [3.4, 4.0], 8)
    },
  }

  // add to the registry, never overwrite it: other slide files register into the same object
  window.SLIDES3 = Object.assign(window.SLIDES3 || {}, { hook, outro })
})()
