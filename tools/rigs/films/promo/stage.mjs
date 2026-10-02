/* -----------------------------------------------------------------------------
   The stage for Film A — the whole dashboard is the set.

   The console sits live in a browser window on the ground. When the story
   needs one thing looked at, a photograph of that exact thing LIFTS off the
   dashboard toward the camera — the window blurs and steps back behind it —
   the thing is worked on out there, and then it settles back into place. That
   is what "make the builder pop out, focus on the rule, show how it's made"
   asked for, and it is what the reference films do with their UI: composed
   motion, not a recording of somebody clicking.

   Layers, bottom to top:
     #ground   the light
     #win      the live console in its window (off / on / dim / zoomed)
     #fx       drawn things: connector lines, the map ring, the reading bar,
               ticks, warm borders — an SVG the size of the frame
     #lift     the popped-out fragment: one box, two images for a cross-fade,
               a shadow that grows as it comes forward
     #type     typography and the situation cards
   No cursor anywhere in this film.

   Fragments are photographs of the real console at 2x (rec/promo/capture.mjs),
   handed in as data URIs; the manifest gives each its CSS size so it lands at
   exactly the size it has in the dashboard before it grows.
   -------------------------------------------------------------------------- */

export const APP_W = 1440
export const APP_H = 760
export const SCALE = 1.1528
export const WIN = { x: 130, y: 26, w: 1660, h: 920, chrome: 44 }

export const html = (appUrl) => `<!doctype html>
<meta charset="utf-8">
<title>stage</title>
<style>
  :root { --brand: #eb5424; --ink: #101828; --muted: #5b6577; --line: #e3e8ef; --ease: cubic-bezier(.2,0,0,1); }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden;
    font-family: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--ink); background: #eceff5; }
  #ground { position: fixed; inset: 0; background:
      radial-gradient(1200px 620px at 18% -10%, #ffffff 0%, rgba(255,255,255,0) 60%),
      radial-gradient(900px 500px at 92% 8%, #fdece6 0%, rgba(253,236,230,0) 62%),
      linear-gradient(180deg, #f2f4f8 0%, #e7ebf2 100%); }

  /* --- the window ------------------------------------------------------- */
  #win { position: fixed; left: ${WIN.x}px; top: ${WIN.y}px; width: ${WIN.w}px; height: ${WIN.h}px; z-index: 10;
    border-radius: 16px; overflow: hidden; background: #fff;
    box-shadow: 0 40px 80px rgba(16,24,40,.20), 0 8px 20px rgba(16,24,40,.08), 0 0 0 1px rgba(16,24,40,.06);
    transform-origin: 50% 45%;
    transition: transform .7s var(--ease), opacity .6s var(--ease), filter .6s var(--ease); }
  #win.off { opacity: 0; transform: translateY(70px) scale(.98); }
  #win.dim { filter: blur(9px) brightness(.58) saturate(.7); transform: scale(.965); }
  #chrome { height: ${WIN.chrome}px; background: #f6f7f9; border-bottom: 1px solid var(--line);
    display: flex; align-items: center; gap: 16px; padding: 0 16px; }
  .dots { display: flex; gap: 8px; } .dots i { width: 11px; height: 11px; border-radius: 50%; display: block; }
  #url { flex: 1; height: 26px; border-radius: 13px; background: #eceef2; border: 1px solid #e1e5ec;
    display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12.5px; color: #64707f; max-width: 520px; margin: 0 auto; }
  #url b { font-weight: 500; color: #3c4553; }
  #vp { width: ${WIN.w}px; height: ${WIN.h - WIN.chrome}px; overflow: hidden; }
  #app { width: ${APP_W}px; height: ${APP_H}px; border: 0; display: block; transform: scale(${SCALE}); transform-origin: 0 0; }

  /* --- drawn things ----------------------------------------------------- */
  #fx { position: fixed; inset: 0; z-index: 25; pointer-events: none; }
  #fx .ln { fill: none; stroke: var(--brand); stroke-width: 3; stroke-linecap: round;
    stroke-dasharray: 2000; stroke-dashoffset: 2000; transition: stroke-dashoffset .55s var(--ease), opacity .3s; }
  #fx .ln.on { stroke-dashoffset: 0; }
  #fx .ring { fill: none; stroke: var(--brand); stroke-width: 3; opacity: 0; transform-origin: center; transform-box: fill-box; }
  #fx .ring.go { animation: ringout 1.1s var(--ease) 2; }
  @keyframes ringout { 0% { opacity: .9; transform: scale(.08); } 100% { opacity: 0; transform: scale(1); } }
  #fx .pin { fill: var(--brand); }
  #fx .bar { fill: rgba(235,84,36,.13); stroke: rgba(235,84,36,.55); stroke-width: 1.5;
    transition: transform .9s var(--ease), opacity .3s; opacity: 0; }
  #fx .bar.on { opacity: 1; }
  #fx .warm { fill: none; stroke: var(--brand); stroke-width: 3; rx: 12; opacity: 0; transition: opacity .35s; }
  #fx .warm.on { opacity: 1; }
  #fx .shade { fill: rgba(236,239,245,.72); opacity: 0; transition: opacity .5s; }
  #fx .shade.on { opacity: 1; }
  #fx .tick { fill: none; stroke: #14663a; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 60; stroke-dashoffset: 60; transition: stroke-dashoffset .32s var(--ease); }
  #fx .tick.on { stroke-dashoffset: 0; }

  /* --- the lift --------------------------------------------------------- */
  #lift { position: fixed; z-index: 30; left: 0; top: 0; width: 0; height: 0; opacity: 0;
    border-radius: 14px; overflow: hidden; background: #fff;
    box-shadow: 0 6px 14px rgba(16,24,40,.10);
    transition: left .62s var(--ease), top .62s var(--ease), width .62s var(--ease), height .62s var(--ease),
      box-shadow .62s var(--ease), opacity .25s ease; }
  #lift.on { opacity: 1; }
  #lift.up { box-shadow: 0 48px 90px rgba(16,24,40,.32), 0 14px 30px rgba(16,24,40,.14); }
  #lift img { position: absolute; left: 0; top: 0; width: 100%; height: auto; display: block;
    transition: opacity .38s ease; }
  #lift img.b { opacity: 0; }
  #lift.swap img.a { opacity: 0; } #lift.swap img.b { opacity: 1; }
  #lift .hl { position: absolute; left: 0; right: 0; background: rgba(235,84,36,.14); opacity: 0;
    transition: opacity .3s, top .45s var(--ease), height .45s var(--ease); }
  #lift .hl.on { opacity: 1; }
  #lift .hlz { position: absolute; inset: 0; border-radius: 14px; box-shadow: inset 0 0 0 3px var(--brand); opacity: 0;
    transition: opacity .3s; }
  #lift .hlz.on { opacity: 1; animation: pulse 1.2s ease 1; }
  @keyframes pulse { 0%,100% { box-shadow: inset 0 0 0 3px var(--brand); } 50% { box-shadow: inset 0 0 0 6px var(--brand); } }

  /* --- typography ------------------------------------------------------- */
  #type { position: fixed; inset: 0; z-index: 40; pointer-events: none; padding: 0 180px;
    display: flex; flex-direction: column; justify-content: center; }
  #type > * { margin: 0; }
  .kick { font-size: 21px; font-weight: 600; color: var(--brand); letter-spacing: .4px; text-transform: uppercase; }
  .h1 { font-size: 84px; line-height: 1.06; font-weight: 700; letter-spacing: -2px; max-width: 1400px; }
  .h1 em { font-style: normal; color: var(--brand); }
  .h1 .q { color: var(--brand); }
  .h2 { font-size: 46px; line-height: 1.2; font-weight: 600; letter-spacing: -.6px; color: #1b2431; max-width: 1300px; }
  .h2.grey { color: #98a2b3; }
  .sub { font-size: 29px; color: var(--muted); margin-top: 18px; }
  .land { opacity: 0; transform: translateY(18px) scale(1.04); animation: land .55s var(--ease) forwards; }
  .land.d1 { animation-delay: .12s } .land.d2 { animation-delay: .24s } .land.d3 { animation-delay: .36s }
  @keyframes land { to { opacity: 1; transform: none; } }
  .fadeout { animation: fadeout .5s ease forwards !important; }
  @keyframes fadeout { to { opacity: 0; transform: translateY(-14px); } }

  .frag { display: block; opacity: 0; transform: translateY(26px); animation: land .5s var(--ease) forwards;
    filter: drop-shadow(0 18px 34px rgba(16,24,40,.18)); border-radius: 12px; }

  /* the three situations */
  .cards { display: flex; gap: 26px; margin-top: 8px; transition: filter .5s ease, opacity .5s ease, transform .55s var(--ease); }
  .card { flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 30px 32px 28px;
    box-shadow: 0 16px 36px rgba(16,24,40,.08); opacity: 0; transform: translateY(40px);
    animation: land .42s var(--ease) forwards; }
  .card .ic { width: 52px; height: 52px; border-radius: 14px; background: #fdece6; color: var(--brand);
    display: grid; place-items: center; margin-bottom: 18px; }
  .card .ic svg { width: 26px; height: 26px; }
  .card b { display: block; font-size: 30px; font-weight: 650; line-height: 1.25; letter-spacing: -.4px; }
  .cards.grey { filter: saturate(0) brightness(1.02); opacity: .55; }
  .cards.line { transform: scaleY(.02); opacity: .35; }
  .stamp { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1.5); opacity: 0;
    display: inline-flex; align-items: center; gap: 14px; padding: 18px 30px; border-radius: 16px; background: #fff;
    border: 1px solid var(--line); box-shadow: 0 30px 70px rgba(16,24,40,.28); font-size: 34px; font-weight: 600;
    animation: stamp .28s cubic-bezier(.3,1.4,.5,1) forwards; }
  .stamp .allow { padding: 8px 18px; border-radius: 10px; background: #e8f7ee; color: #14663a; }
  .stamp em { font-style: normal; color: var(--muted); font-weight: 500; }
  .stamp em b { color: var(--ink); font-weight: 600; }
  @keyframes stamp { to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

  /* the checkbox form that is not this product */
  .form { position: absolute; left: 190px; top: 50%; transform: translateY(-50%) translateX(-60px); width: 560px;
    background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 24px 28px; opacity: 0;
    filter: blur(1px) saturate(0); transition: transform .55s var(--ease), opacity .45s;
    box-shadow: 0 20px 44px rgba(16,24,40,.10); }
  .form.on { opacity: .85; transform: translateY(-50%); }
  .form.out { opacity: 0; transform: translateY(-40%) translateX(-80px); }
  .form i { display: flex; align-items: center; gap: 12px; height: 34px; }
  .form i::before { content: ''; width: 16px; height: 16px; border: 1.5px solid #c6ccd6; border-radius: 4px; }
  .form i::after { content: ''; flex: 1; height: 10px; border-radius: 5px; background: #e6e9ef; max-width: var(--w); }

  .shelf { position: absolute; left: 200px; top: 84px; display: flex; gap: 22px; align-items: flex-start; }
  .lockup { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; }
  .lockup img { width: 320px; display: block; }
  .lockup .name { font-size: 30px; color: var(--muted); font-weight: 500; letter-spacing: .2px; }
</style>
<div id="ground"></div>
<div id="win" class="off">
  <div id="chrome">
    <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    <span id="url">🔒 <b>login.xecurify.com</b>/admin/policies</span><span style="width:64px"></span>
  </div>
  <div id="vp"><iframe id="app" src="${appUrl}"></iframe></div>
</div>
<svg id="fx" viewBox="0 0 1920 1080" width="1920" height="1080"></svg>
<div id="lift"><img class="a"><img class="b"><div class="hl"></div><div class="hlz"></div></div>
<div id="type"></div>
<script>
  const $ = (s) => document.querySelector(s)
  const SVG = 'http://www.w3.org/2000/svg'
  const FR = {}   // name → { src, w, h }
  let liftFrom = null, liftK = 1
  window.__st = {
    frags(map) { Object.assign(FR, map) },
    src(name) { return FR[name]?.src },

    /* --- the window --- */
    win(state) { const w = $('#win'); w.classList.remove('off', 'dim'); if (state === 'off') w.classList.add('off'); if (state === 'dim') w.classList.add('dim') },
    zoom(scale, ox, oy) { const w = $('#win'); w.style.transformOrigin = (ox ?? 50) + '% ' + (oy ?? 45) + '%'; w.style.transform = scale === 1 ? '' : 'scale(' + scale + ')' },
    url(p) { $('#url').innerHTML = '🔒 <b>login.xecurify.com</b>' + p },

    /* --- type --- */
    type(html) { const t = $('#type'); t.innerHTML = html ?? '' },
    add(html, sel) { const host = sel ? $('#type ' + sel) : $('#type'); host.insertAdjacentHTML('beforeend', html) },
    cls(sel, name, on) { document.querySelectorAll('#type ' + sel).forEach((e) => e.classList.toggle(name, on !== false)) },
    out() { $('#type').querySelectorAll(':scope > *').forEach((e) => e.classList.add('fadeout')) },

    /* --- the lift --- */
    lift(name, from, to) {
      const f = FR[name]; const L = $('#lift')
      liftFrom = from; liftK = to.width / f.w
      L.classList.remove('swap', 'up'); L.querySelector('.hl').classList.remove('on'); L.querySelector('.hlz').classList.remove('on')
      L.querySelector('img.a').src = f.src; L.querySelector('img.b').removeAttribute('src')
      L.style.transition = 'none'
      L.style.left = from.x + 'px'; L.style.top = from.y + 'px'; L.style.width = from.width + 'px'; L.style.height = from.height + 'px'
      L.classList.add('on')
      L.getBoundingClientRect()
      L.style.transition = ''
      requestAnimationFrame(() => {
        L.style.left = to.x + 'px'; L.style.top = to.y + 'px'; L.style.width = to.width + 'px'; L.style.height = (f.h * liftK) + 'px'
        L.classList.add('up')
      })
    },
    swap(name) {
      const f = FR[name]; const L = $('#lift')
      const a = L.querySelector('img.a'), b = L.querySelector('img.b')
      if (L.classList.contains('swap')) { a.src = f.src; L.classList.remove('swap') } else { b.src = f.src; L.classList.add('swap') }
      L.style.height = (f.h * liftK) + 'px'
    },
    hl(frac0, frac1) { const h = $('#lift .hl'); if (frac0 == null) { h.classList.remove('on'); return }
      const H = parseFloat($('#lift').style.height); h.style.top = (H * frac0) + 'px'; h.style.height = (H * (frac1 - frac0)) + 'px'; h.classList.add('on') },
    hlz(on) { const z = $('#lift .hlz'); z.classList.remove('on'); if (on) { z.getBoundingClientRect(); z.classList.add('on') } },
    drop() {
      const L = $('#lift'); const f = liftFrom
      L.classList.remove('up'); L.querySelector('.hl').classList.remove('on')
      if (f) { L.style.left = f.x + 'px'; L.style.top = f.y + 'px'; L.style.width = f.width + 'px'; L.style.height = f.height + 'px' }
      setTimeout(() => L.classList.remove('on'), 560)
    },
    liftRect() { const r = $('#lift').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } },

    /* --- drawn things --- */
    fx(kind, id, attrs) {
      const svg = $('#fx'); let el = svg.querySelector('#' + id)
      const tag = { line: 'path', ring: 'circle', pin: 'circle', bar: 'rect', warm: 'rect', shade: 'rect', tick: 'path' }[kind]
      if (!el) { el = document.createElementNS(SVG, tag); el.id = id; el.setAttribute('class', kind === 'line' ? 'ln' : kind); svg.appendChild(el) }
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v)
      return el
    },
    on(id, on) { const el = $('#fx #' + id); if (!el) return; if (on === false) el.classList.remove('on', 'go'); else el.classList.add(on === 'go' ? 'go' : 'on') },
    clearFx() { $('#fx').innerHTML = '' },
    line(id, x1, y1, x2, y2) { const dx = (x2 - x1) * .5; this.fx('line', id, { d: 'M' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2 }); requestAnimationFrame(() => this.on(id)) },
    ring(x, y) { this.fx('pin', 'pin', { cx: x, cy: y, r: 7 }); const r = this.fx('ring', 'ring', { cx: x, cy: y, r: 150 }); r.classList.remove('go'); r.getBoundingClientRect(); r.classList.add('go') },
    bar(x, y, w, h) { const b = this.fx('bar', 'bar', { x, width: w, height: h, y: 0, rx: 10 }); b.style.transform = 'translateY(' + y + 'px)'; requestAnimationFrame(() => b.classList.add('on')) },
    warm(id, r) { this.fx('warm', id, { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 }); requestAnimationFrame(() => this.on(id)) },
    shade(id, r) { this.fx('shade', id, { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16, rx: 12 }); requestAnimationFrame(() => this.on(id)) },
    tick(id, x, y) { this.fx('tick', id, { d: 'M' + (x) + ' ' + (y + 12) + ' l 9 9 l 20 -22' }); requestAnimationFrame(() => this.on(id)) },
  }
</script>`
