/* -----------------------------------------------------------------------------
   The on-screen keyboard — a small 60% board in a corner of the frame that
   plays back every key the recorder pressed, so a viewer sees the shortcut
   and not just its effect.

   API (window.KEYBOARD)
     init(rootEl)
         Builds the board once inside rootEl — a layer that fills the frame
         (position:absolute; inset:0), the way #ov does. Returns the board.
     update(t, keyEvents, { corner })
         Renders the board for time t (seconds). keyEvents = [{ t, key }] in
         absolute seconds; `key` is a Playwright key string: a character
         ('a', 'W', ' ', '?', '—'), a name ('Backspace', 'Enter', 'Escape',
         'ArrowDown') or a chord ('Control+z', 'Alt+ArrowDown', 'Shift+?',
         'Control+Backslash'). Any other field on an event — the recorder's
         press() also writes `dur` (its `seconds`) and `label` — is ignored:
         how long the board stays is LINGER below, not the event's, and the
         v1 pill that showed a label is gone. corner is 'br' (default) or
         'bl'. Returns the board's presence 0..1 — 0 means nothing was drawn.
     presence(t, keyEvents)     the visibility alone, 0..1
     capsFor(key)               the cap ids a key string lights (may be empty)
     presses(t, keyEvents)      { capId: 0..1 } — how far each cap is down at t
     rect(corner, W, H)         the plate's box in frame pixels, so the caller
                                can keep the mascot or a cloud out of it
     SIZE                       { width, height, margin }
     TIMING                     { IN, LINGER, OUT, HOLD, RELEASE } in seconds

   Everything is a pure function of t: the same t renders the same pixels,
   whatever was rendered before. No timers, no transitions.

   Timing: the board slides up 14 px and fades in over 0.25 s so that it is
   FULLY up at the instant of the first key — the fade-in is pre-rolled by
   0.25 s, which the compositor can do because it has the whole event list
   ahead of time. Without the pre-roll a lone shortcut was never seen: its
   cap had released (250 ms) by the time the board had faded in (250 ms),
   peaking at a quarter of its orange. It stays while events keep coming and
   leaves 1.1 s after the last one (fade + slide down, 0.25 s). A pressed cap
   sinks 3 px and turns brand orange for 90 ms, then eases back over 160 ms.
   A chord lights every cap in it; a shifted character lights Shift too.

   Layout: the plan's five rows verbatim — `` ` 1–0 - = ⌫ ``, `Tab Q–P [ ] \`,
   `Caps A–L ; ' Enter`, `Shift Z–M , . / Shift`, `Ctrl Alt Space Alt Ctrl
   ← ↑ ↓ →` — with the four arrows in a line at the end of the bottom row.

   Mapping notes for a 60% board: Delete lights ⌫ (Delete is Fn+⌫ on this
   layout), Escape lights the top-left key (where Esc lives on a 60%), Meta
   lights nothing (no Win key), and characters with no cap ('—', 'é') light
   nothing but still bring the board on screen.
   -------------------------------------------------------------------------- */
;(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const easeOut = (t) => 1 - Math.pow(1 - t, 3)

  /* --- geometry ---------------------------------------------------------------

     1u is the pitch of one key. The plate is 620 px wide for 15u, which puts
     the pitch at 40 px and a cap at 36 px — big enough that a two-line legend
     stays readable at 1080p, small enough to sit under the product window. */
  const U = 40
  const CAP = 36
  const PAD = 12
  const SKIRT = 3
  const COLS = 15
  const ROWS = 5
  const SIZE = { width: PAD * 2 + COLS * U - (U - CAP), height: PAD * 2 + ROWS * U - (U - CAP) + SKIRT, margin: 40 }

  const IN = 0.25 // slide-up + fade, ending at the key
  const LINGER = 1.1 // after the last key
  const OUT = 0.25 // fade + slide-down
  const HOLD = 0.09 // orange, fully down
  const RELEASE = 0.16 // easing back
  const SINK = 3
  const TIMING = { IN, LINGER, OUT, HOLD, RELEASE }

  const CAP_RGB = [43, 52, 64] // #2b3440
  const HOT_RGB = [235, 84, 36] // #eb5424, the brand
  const SKIRT_RGB = [14, 20, 27] // #0e141b, as keyboard.css
  const HOT_SKIRT_RGB = [166, 52, 16]

  /* --- the layout -------------------------------------------------------------

     Each row is [capId, width in u, legend]. A legend is a string (one line),
     [top, bottom] (a shifted symbol over its plain one), or { svg } for the
     glyphs DM Sans has no characters for. Every row is 15u. The bottom row's
     four arrows take 4u, so its modifiers share 11u: 1.25 Ctrl, 1.25 Alt,
     a 6.25 space bar, a 1u right Alt (the one that shrinks on compact
     boards) and 1.25 Ctrl. */
  const svg = (d, w = 16, h = 12) =>
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const ARROW = {
    up: svg('<path d="M8 11V1.5"/><path d="M3.5 6 8 1.5 12.5 6"/>', 16, 12),
    down: svg('<path d="M8 1v9.5"/><path d="M3.5 6 8 10.5 12.5 6"/>', 16, 12),
    left: svg('<path d="M14 6H2.5"/><path d="M7 1.5 2.5 6 7 10.5"/>', 16, 12),
    right: svg('<path d="M2 6h11.5"/><path d="M9 1.5 13.5 6 9 10.5"/>', 16, 12),
  }
  const BACKSPACE = svg('<path d="M6.5 1.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11L1.5 6z"/><path d="m9.5 4 4 4"/><path d="m13.5 4-4 4"/>', 20, 13)

  const ROWS_DEF = [
    [
      ['Backquote', 1, ['~', '`']],
      ['Digit1', 1, ['!', '1']],
      ['Digit2', 1, ['@', '2']],
      ['Digit3', 1, ['#', '3']],
      ['Digit4', 1, ['$', '4']],
      ['Digit5', 1, ['%', '5']],
      ['Digit6', 1, ['^', '6']],
      ['Digit7', 1, ['&', '7']],
      ['Digit8', 1, ['*', '8']],
      ['Digit9', 1, ['(', '9']],
      ['Digit0', 1, [')', '0']],
      ['Minus', 1, ['_', '-']],
      ['Equal', 1, ['+', '=']],
      ['Backspace', 2, { svg: BACKSPACE }],
    ],
    [
      ['Tab', 1.5, 'Tab'],
      ['KeyQ', 1, 'Q'],
      ['KeyW', 1, 'W'],
      ['KeyE', 1, 'E'],
      ['KeyR', 1, 'R'],
      ['KeyT', 1, 'T'],
      ['KeyY', 1, 'Y'],
      ['KeyU', 1, 'U'],
      ['KeyI', 1, 'I'],
      ['KeyO', 1, 'O'],
      ['KeyP', 1, 'P'],
      ['BracketLeft', 1, ['{', '[']],
      ['BracketRight', 1, ['}', ']']],
      ['Backslash', 1.5, ['|', '\\']],
    ],
    [
      ['CapsLock', 1.75, 'Caps'],
      ['KeyA', 1, 'A'],
      ['KeyS', 1, 'S'],
      ['KeyD', 1, 'D'],
      ['KeyF', 1, 'F'],
      ['KeyG', 1, 'G'],
      ['KeyH', 1, 'H'],
      ['KeyJ', 1, 'J'],
      ['KeyK', 1, 'K'],
      ['KeyL', 1, 'L'],
      ['Semicolon', 1, [':', ';']],
      ['Quote', 1, ['"', "'"]],
      ['Enter', 2.25, 'Enter'],
    ],
    [
      ['ShiftLeft', 2.25, 'Shift'],
      ['KeyZ', 1, 'Z'],
      ['KeyX', 1, 'X'],
      ['KeyC', 1, 'C'],
      ['KeyV', 1, 'V'],
      ['KeyB', 1, 'B'],
      ['KeyN', 1, 'N'],
      ['KeyM', 1, 'M'],
      ['Comma', 1, ['<', ',']],
      ['Period', 1, ['>', '.']],
      ['Slash', 1, ['?', '/']],
      ['ShiftRight', 2.75, 'Shift'],
    ],
    [
      ['ControlLeft', 1.25, 'Ctrl'],
      ['AltLeft', 1.25, 'Alt'],
      ['Space', 6.25, ''],
      ['AltRight', 1, 'Alt'],
      ['ControlRight', 1.25, 'Ctrl'],
      ['ArrowLeft', 1, { svg: ARROW.left }],
      ['ArrowUp', 1, { svg: ARROW.up }],
      ['ArrowDown', 1, { svg: ARROW.down }],
      ['ArrowRight', 1, { svg: ARROW.right }],
    ],
  ]

  /* --- key strings → caps ------------------------------------------------------ */
  const SHIFT = 'ShiftLeft'
  const CHARS = {
    '`': ['Backquote'], '~': [SHIFT, 'Backquote'],
    '-': ['Minus'], _: [SHIFT, 'Minus'],
    '=': ['Equal'], '+': [SHIFT, 'Equal'],
    '[': ['BracketLeft'], '{': [SHIFT, 'BracketLeft'],
    ']': ['BracketRight'], '}': [SHIFT, 'BracketRight'],
    '\\': ['Backslash'], '|': [SHIFT, 'Backslash'],
    ';': ['Semicolon'], ':': [SHIFT, 'Semicolon'],
    "'": ['Quote'], '"': [SHIFT, 'Quote'],
    ',': ['Comma'], '<': [SHIFT, 'Comma'],
    '.': ['Period'], '>': [SHIFT, 'Period'],
    '/': ['Slash'], '?': [SHIFT, 'Slash'],
    ' ': ['Space'], '\n': ['Enter'], '\r': ['Enter'], '\t': ['Tab'],
  }
  const SHIFTED_DIGITS = ')!@#$%^&*('
  const NAMES = {
    Control: 'ControlLeft', Ctrl: 'ControlLeft', ControlLeft: 'ControlLeft', ControlRight: 'ControlRight',
    Shift: SHIFT, ShiftLeft: SHIFT, ShiftRight: 'ShiftRight',
    Alt: 'AltLeft', AltLeft: 'AltLeft', AltRight: 'AltRight',
    Enter: 'Enter', Return: 'Enter', Tab: 'Tab', CapsLock: 'CapsLock', Space: 'Space',
    Backspace: 'Backspace', Delete: 'Backspace', Escape: 'Backquote', Esc: 'Backquote',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Backquote: 'Backquote', Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight',
    Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash',
  }
  for (let i = 0; i < 10; i++) NAMES[`Digit${i}`] = `Digit${i}`
  for (let c = 65; c <= 90; c++) NAMES[`Key${String.fromCharCode(c)}`] = `Key${String.fromCharCode(c)}`

  function capsForChar(ch) {
    if (CHARS[ch]) return CHARS[ch]
    if (/^[a-z]$/.test(ch)) return [`Key${ch.toUpperCase()}`]
    if (/^[A-Z]$/.test(ch)) return [SHIFT, `Key${ch}`]
    if (/^[0-9]$/.test(ch)) return [`Digit${ch}`]
    const d = SHIFTED_DIGITS.indexOf(ch)
    if (d >= 0) return [SHIFT, `Digit${d}`]
    return []
  }

  /* 'Control+z' → ['Control', 'z']; 'Shift++' is Playwright for a '+' typed
     with Shift held, so a trailing '++' keeps its last '+' as the key. */
  function tokens(key) {
    if (typeof key !== 'string') return []
    if (key.length <= 1) return [key]
    const parts = key.endsWith('++') ? [...key.slice(0, -2).split('+'), '+'] : key.split('+')
    return parts.filter((p) => p !== '')
  }

  const capsCache = new Map()
  function capsFor(key) {
    let out = capsCache.get(key)
    if (out) return out
    out = []
    for (const tok of tokens(key)) {
      const ids = tok.length === 1 ? capsForChar(tok) : NAMES[tok] ? [NAMES[tok]] : []
      for (const id of ids) if (!out.includes(id)) out.push(id)
    }
    capsCache.set(key, out)
    return out
  }

  /* --- time → state ------------------------------------------------------------ */

  /* One event keeps the board up from IN before its moment (so the cap is
     seen on a board that is already there) until LINGER after it, with soft
     edges either side; the board is as present as its most present event,
     so a key struck during a fade-out simply turns the fade around. */
  function presence(t, events) {
    let k = 0
    for (const e of events) {
      const start = e.t - IN
      if (t < start) continue
      const end = e.t + LINGER + OUT
      if (t > end) continue
      const a = clamp((t - start) / IN, 0, 1)
      const b = clamp((end - t) / OUT, 0, 1)
      k = Math.max(k, easeInOut(Math.min(a, b)))
      if (k >= 1) break
    }
    return k
  }

  /* How far down a cap is, dt seconds after its strike: fully for HOLD, then a
     quick-start ease back — a spring returning, not a lift. */
  /* `extra` lengthens the hold: a key that also brings the board up would
     otherwise have released before the board is fully visible. */
  function press(dt, extra = 0) {
    if (dt < 0 || dt >= HOLD + extra + RELEASE) return 0
    if (dt < HOLD + extra) return 1
    return 1 - easeOut((dt - HOLD - extra) / RELEASE)
  }

  function presses(t, events) {
    const out = {}
    for (const e of events) {
      // a lone key raises the board: hold it down until the board has arrived
      const boardWasUp = events.some((o) => o !== e && o.t < e.t && e.t <= o.t + LINGER)
      const v = press(t - e.t, boardWasUp ? 0 : IN + 0.1)
      if (v <= 0) continue
      for (const id of capsFor(e.key)) out[id] = Math.max(out[id] ?? 0, v)
    }
    return out
  }

  const mix = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`

  /* --- DOM ---------------------------------------------------------------------- */
  let board = null
  const keys = new Map() // capId → { el, p }

  function legendHtml(legend) {
    if (typeof legend === 'string') return legend ? `<span class="kbd__leg">${legend}</span>` : ''
    if (Array.isArray(legend)) return `<span class="kbd__leg kbd__leg--top">${esc(legend[0])}</span><span class="kbd__leg kbd__leg--bot">${esc(legend[1])}</span>`
    return legend.svg
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  function init(rootEl) {
    if (board) return board
    board = document.createElement('div')
    board.className = 'kbd'
    board.dataset.corner = 'br'
    board.style.display = 'none'
    const plate = document.createElement('div')
    plate.className = 'kbd__plate'
    board.appendChild(plate)
    ROWS_DEF.forEach((row, r) => {
      let x = 0
      for (const [id, w, legend] of row) {
        const el = document.createElement('div')
        const kind = typeof legend === 'string' ? (legend.length > 1 ? 'word' : 'glyph') : Array.isArray(legend) ? 'sym' : 'icon'
        el.className = `kbd__key kbd__key--${kind}`
        el.dataset.cap = id
        el.style.left = `${PAD + x * U}px`
        el.style.top = `${PAD + r * U}px`
        el.style.width = `${w * U - (U - CAP)}px`
        el.style.height = `${CAP}px`
        el.innerHTML = legendHtml(legend)
        plate.appendChild(el)
        keys.set(id, { el, p: 0 })
        x += w
      }
    })
    rootEl.appendChild(board)
    return board
  }

  function update(t, events = [], { corner = 'br' } = {}) {
    if (!board) throw new Error('KEYBOARD.init(rootEl) first')
    if (board.dataset.corner !== corner) board.dataset.corner = corner
    const k = presence(t, events)
    if (k <= 0) {
      if (board.style.display !== 'none') {
        board.style.display = 'none'
        for (const key of keys.values()) if (key.p !== 0) setPress(key, 0)
      }
      return 0
    }
    board.style.display = ''
    board.style.opacity = k.toFixed(3)
    board.style.transform = `translateY(${((1 - k) * 14).toFixed(2)}px)`

    const down = presses(t, events)
    for (const [id, key] of keys) {
      const v = down[id] ?? 0
      if (v !== key.p) setPress(key, v)
    }
    return k
  }

  /* Only caps whose depth changed are touched; at rest the stylesheet owns
     the look, so a released cap is exactly the cap that was never pressed. */
  function setPress(key, v) {
    key.p = v
    const s = key.el.style
    if (v <= 0) {
      s.transform = ''
      s.background = ''
      s.boxShadow = ''
      return
    }
    s.transform = `translateY(${(SINK * v).toFixed(2)}px)`
    s.background = mix(CAP_RGB, HOT_RGB, v)
    s.boxShadow = `0 ${(SKIRT * (1 - v)).toFixed(2)}px 0 ${mix(SKIRT_RGB, HOT_SKIRT_RGB, v)}`
  }

  function rect(corner = 'br', W = 1920, H = 1080) {
    const x = corner === 'bl' ? SIZE.margin : W - SIZE.margin - SIZE.width
    return { x, y: H - SIZE.margin - SIZE.height, width: SIZE.width, height: SIZE.height }
  }

  window.KEYBOARD = { init, update, presence, presses, capsFor, rect, SIZE, TIMING }
})()
