/* -----------------------------------------------------------------------------
   The stage — everything in the frame that is not the product.

   The console no longer fills the picture. It sits in a browser window on a
   quiet ground, and the bottom of the frame is reserved: subtitles live there
   and nothing else does, so a caption can never cover the thing it is
   describing (owner, 23 Sep 2026: "whatever you add blocks the dashboard, fix
   the subtitle position, at the bottom give it a dedicated part").

   This is how the product demos the owner pointed at are built — Google's,
   Atlassian's, YouTube's. Three things they all do and this now does:

   · the product is INSET, in a device frame with a soft shadow, never
     edge-to-edge screen capture;
   · a concept is explained on a SCENE of its own, not over a static screenshot
     of the app sitting there doing nothing;
   · what is being talked about is POINTED AT — a ring on the control, a short
     label beside it — so the eye is never hunting.

   It is one HTML page with the app in an iframe, rather than a composite built
   in ffmpeg afterwards. Everything here is CSS that can be tuned by looking at
   a frame, the app's own coordinates come back through `boundingBox` already
   in stage space, and there is no second rendering pass to keep in sync.

   THE APP RENDERS AT 1440x760 AND IS SCALED UP by 1.1528 to fill the window.
   That is the whole reason the frame is worth its width: at a true 1920 the
   console's 14px body text lands at 14px in a 1080p film and is unreadable on
   anything but a monitor.
   -------------------------------------------------------------------------- */

export const APP_W = 1440
export const APP_H = 760
export const SCALE = 1.1528

export const html = (appUrl) => `<!doctype html>
<meta charset="utf-8">
<title>stage</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  :root {
    --brand: #eb5424;
    --ink: #101828;
    --muted: #5b6577;
    --line: #e3e8ef;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden;
    font-family: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #eceff5; color: var(--ink); }
  /* A ground with a little light in it, so the white window has something to
     sit on. Flat grey reads as "screenshot on a slide". */
  /* One ground, used by the page AND by the scene layer. Two different
     near-whites met at the top of the subtitle band and drew a seam across the
     frame — visible on every explainer. */
  #ground, #scene { background:
      radial-gradient(1200px 620px at 18% -10%, #ffffff 0%, rgba(255,255,255,0) 60%),
      radial-gradient(900px 500px at 92% 8%, #fdece6 0%, rgba(253,236,230,0) 62%),
      linear-gradient(180deg, #f2f4f8 0%, #e7ebf2 100%); }
  #ground { position: fixed; inset: 0; }

  /* --- the window ------------------------------------------------------- */
  #win { position: fixed; left: 130px; top: 26px; width: 1660px; height: 920px;
    border-radius: 16px; overflow: hidden; background: #fff;
    box-shadow: 0 40px 80px rgba(16,24,40,.20), 0 8px 20px rgba(16,24,40,.08), 0 0 0 1px rgba(16,24,40,.06);
    transform-origin: 50% 40%; }
  #chrome { height: 44px; background: #f6f7f9; border-bottom: 1px solid var(--line);
    display: flex; align-items: center; gap: 16px; padding: 0 16px; }
  .dots { display: flex; gap: 8px; }
  .dots i { width: 11px; height: 11px; border-radius: 50%; display: block; }
  #url { flex: 1; height: 26px; border-radius: 13px; background: #eceef2; border: 1px solid #e1e5ec;
    display: flex; align-items: center; justify-content: center; gap: 7px;
    font-size: 12.5px; color: #64707f; max-width: 520px; margin: 0 auto; }
  #url b { font-weight: 500; color: #3c4553; }
  #vp { width: 1660px; height: 876px; overflow: hidden; }
  #app { width: ${APP_W}px; height: ${APP_H}px; border: 0; display: block;
    transform: scale(${SCALE}); transform-origin: 0 0; }

  /* --- the subtitle band ------------------------------------------------ */
  /* Its own strip of the frame. Nothing else is ever drawn here, and the
     window above never grows into it. */
  /* ABOVE the scene layer, always. A subtitle that vanishes whenever the film
     cuts to an explainer is not a subtitle — and the scenes are exactly the
     moments with the most words in them. The scene stops at the top of this
     band rather than covering it. */
  #band { position: fixed; left: 0; right: 0; top: 962px; height: 118px; z-index: 40;
    display: flex; align-items: center; justify-content: center; padding: 0 160px;
    /* The ground's own gradient, fixed to the viewport so it is pixel-identical
       to what is behind it — and OPAQUE, so a window pushed in toward a control
       cannot slide its foot under the words. It was transparent, and the zone
       list's pagination showed through the subtitle. */
    background:
      radial-gradient(1200px 620px at 18% -10%, #ffffff 0%, rgba(255,255,255,0) 60%),
      radial-gradient(900px 500px at 92% 8%, #fdece6 0%, rgba(253,236,230,0) 62%),
      linear-gradient(180deg, #f2f4f8 0%, #e7ebf2 100%);
    background-attachment: fixed; }
  #sub { font-size: 30px; line-height: 1.32; font-weight: 500; letter-spacing: .1px;
    text-align: center; color: #1b2431; max-width: 1400px;
    opacity: 0; transform: translateY(6px); transition: opacity .22s ease, transform .22s ease; }
  #sub.on { opacity: 1; transform: none; }
  #sub b { color: var(--brand); font-weight: 600; }

  /* --- the pointer ------------------------------------------------------ */
  #ring { position: fixed; z-index: 50; border: 3px solid var(--brand); border-radius: 12px;
    box-shadow: 0 0 0 4000px rgba(16,24,40,.28); pointer-events: none;
    opacity: 0; transition: opacity .3s ease, left .45s cubic-bezier(.2,0,0,1), top .45s cubic-bezier(.2,0,0,1),
      width .45s cubic-bezier(.2,0,0,1), height .45s cubic-bezier(.2,0,0,1); }
  #ring.on { opacity: 1; }
  #tip { position: fixed; z-index: 51; padding: 10px 16px; border-radius: 10px; background: var(--ink); color: #fff;
    font-size: 21px; font-weight: 500; white-space: nowrap; opacity: 0; transition: opacity .3s ease;
    box-shadow: 0 10px 26px rgba(16,24,40,.3); }
  #tip.on { opacity: 1; }
  #tip::after { content: ''; position: absolute; left: 24px; bottom: -6px; width: 12px; height: 12px;
    background: var(--ink); transform: rotate(45deg); }
  #tip.above::after { bottom: auto; top: -6px; }

  /* --- scenes and cards -------------------------------------------------- */
  #scene { position: fixed; left: 0; right: 0; top: 0; bottom: 118px; z-index: 30;
    opacity: 0; pointer-events: none;
    transition: opacity .42s ease; display: flex; align-items: center; justify-content: center; }
  #scene.on { opacity: 1; }

  /* --- motion ------------------------------------------------------------ */
  /* One entrance, used everywhere: rise 18px and settle, half a second. The
     explainer scenes stagger their parts through it 110ms apart, which is the
     difference between a slide appearing and a composition being built. */
  @keyframes land { from { opacity: 0; transform: translateY(18px) scale(1.03); } to { opacity: 1; transform: none; } }
  .land { animation: land .5s cubic-bezier(.2,0,0,1) both; }
  .land.d1 { animation-delay: .12s } .land.d2 { animation-delay: .24s } .land.d3 { animation-delay: .36s }
  #scene.on .flow .b, #scene.on .stack .r, #scene.on .chips span { animation: land .5s cubic-bezier(.2,0,0,1) both; }
  #scene.on .flow .b:nth-child(1), #scene.on .stack .r:nth-child(1), #scene.on .chips span:nth-child(1) { animation-delay: .25s }
  #scene.on .flow .b:nth-child(2), #scene.on .stack .r:nth-child(2), #scene.on .chips span:nth-child(2) { animation-delay: .36s }
  #scene.on .flow .b:nth-child(3), #scene.on .stack .r:nth-child(3), #scene.on .chips span:nth-child(3) { animation-delay: .47s }
  #scene.on .flow .b:nth-child(4), #scene.on .stack .r:nth-child(4), #scene.on .chips span:nth-child(4) { animation-delay: .58s }
  #scene.on .flow .b:nth-child(5), #scene.on .chips span:nth-child(5) { animation-delay: .69s }
  #scene.on .kick { animation: land .45s cubic-bezier(.2,0,0,1) both; }
  #scene.on h1 { animation: land .5s cubic-bezier(.2,0,0,1) .08s both; }
  #scene.on p { animation: land .5s cubic-bezier(.2,0,0,1) .16s both; }
  /* The lit row in the "order" stack lights up AFTER it has landed, so the
     reader sees the list first and the answer second. */
  @keyframes lit { from { border-color: var(--line); background: #fff; } to { border-color: var(--brand); background: #fff7f4; } }
  #scene.on .stack .r.is-on { animation: land .5s cubic-bezier(.2,0,0,1) .25s both, lit .45s ease 1.1s both; }

  /* --- chapter cards, over a window that steps back ----------------------- */
  /* Not a cut to a slide. The window sinks and dims, and the card floats over
     it on frosted glass; when the card goes, the window rises back. The scene
     layer stays opaque for the explainers, which are compositions of their
     own — this layer is for the five chapter titles. */
  #card { position: fixed; left: 0; right: 0; top: 0; bottom: 118px; z-index: 31; pointer-events: none;
    background: rgba(240,243,248,.80); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    opacity: 0; transition: opacity .45s ease; display: flex; align-items: center; justify-content: center; }
  #card.on { opacity: 1; }
  body.carded #win { transform: translateY(38px) scale(.975); filter: brightness(.62) saturate(.8); }
  #win { transition: transform .6s cubic-bezier(.2,0,0,1), filter .6s cubic-bezier(.2,0,0,1); }
  body.carded #cur { opacity: 0; }
  /* The hand leaves while a scene is up. A cursor parked in the middle of a
     title card is the one thing that says "this is a screen recording" about a
     frame that is otherwise a slide. */
  body.scened #cur { opacity: 0; }
  #cur { transition: opacity .3s ease; }
  .card { width: 100%; padding: 0 180px; }
  .kick { font-size: 21px; font-weight: 600; color: var(--brand); letter-spacing: .4px; text-transform: uppercase; }
  .card h1 { font-size: 72px; line-height: 1.08; margin: 16px 0 20px; font-weight: 700; letter-spacing: -1.6px; }
  .card p { font-size: 29px; line-height: 1.45; margin: 0; color: var(--muted); max-width: 1180px; }
  .chips { display: flex; gap: 12px; margin-top: 34px; flex-wrap: wrap; }
  .chips span { padding: 10px 20px; border-radius: 999px; background: #fff; border: 1px solid var(--line);
    font-size: 21px; font-weight: 500; color: #33405a; }

  /* A row of three things with an arrow between them: the shape most of these
     explainers want, and cheaper to read than an illustration. */
  .flow { display: flex; align-items: stretch; gap: 26px; margin-top: 44px; }
  .flow .b { flex: 1; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 26px 28px;
    box-shadow: 0 12px 28px rgba(16,24,40,.06); }
  .flow .b u { text-decoration: none; display: block; font-size: 18px; font-weight: 600; color: var(--brand);
    letter-spacing: .3px; text-transform: uppercase; margin-bottom: 12px; }
  .flow .b strong { display: block; font-size: 30px; font-weight: 650; margin-bottom: 8px; }
  .flow .b em { font-style: normal; font-size: 21px; color: var(--muted); line-height: 1.4; }
  .flow .b.is-on { border-color: var(--brand); box-shadow: 0 16px 34px rgba(235,84,36,.16); }
  .flow .arw { align-self: center; font-size: 34px; color: #9aa4b5; }

  /* A stack that reads top to bottom, for "first match wins". */
  .stack { margin-top: 40px; display: flex; flex-direction: column; gap: 14px; max-width: 1180px; }
  .stack .r { display: flex; align-items: center; gap: 20px; background: #fff; border: 1px solid var(--line);
    border-radius: 14px; padding: 20px 26px; font-size: 26px; }
  .stack .r i { font-style: normal; width: 38px; height: 38px; border-radius: 10px; background: #eef1f6;
    display: grid; place-items: center; font-size: 19px; font-weight: 600; color: #64707f; }
  .stack .r.is-on { border-color: var(--brand); background: #fff7f4; }
  .stack .r.is-on i { background: var(--brand); color: #fff; }
  .stack .r span { color: var(--muted); font-size: 22px; margin-left: auto; }
  .stack .r.is-off { opacity: .45; }
</style>
<div id="ground"></div>
<div id="win">
  <div id="chrome">
    <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    <span id="url">🔒 <b>login.xecurify.com</b>/admin/policies</span>
    <span style="width:64px"></span>
  </div>
  <div id="vp"><iframe id="app" src="${appUrl}"></iframe></div>
</div>
<div id="band"><div id="sub"></div></div>
<div id="ring"></div>
<div id="tip"></div>
<div id="scene"></div>
<div id="card"></div>
<script>
  const $ = (s) => document.querySelector(s)
  window.__stage = {
    sub(html) { const e = $('#sub'); if (!html) { e.classList.remove('on'); return } e.innerHTML = html; e.classList.add('on') },
    scene(html) {
      const e = $('#scene')
      document.body.classList.toggle('scened', !!html)
      if (!html) { e.classList.remove('on'); return }
      e.innerHTML = html; e.classList.add('on')
    },
    url(path) { $('#url').innerHTML = '🔒 <b>login.xecurify.com</b>' + path },
    card(html) {
      const e = $('#card')
      document.body.classList.toggle('carded', !!html)
      if (!html) { e.classList.remove('on'); return }
      e.innerHTML = html; e.classList.add('on')
    },
    /* A ring on a control, in STAGE coordinates — the film reads them off the
       app's own boundingBox, which already accounts for the iframe's scale. */
    point(box, label, where) {
      const r = $('#ring'), t = $('#tip')
      if (!box) { r.classList.remove('on'); t.classList.remove('on'); return }
      const pad = 8
      r.style.left = (box.x - pad) + 'px'; r.style.top = (box.y - pad) + 'px'
      r.style.width = (box.width + pad * 2) + 'px'; r.style.height = (box.height + pad * 2) + 'px'
      r.classList.add('on')
      if (!label) { t.classList.remove('on'); return }
      t.innerHTML = label
      t.classList.add('on')
      const above = where === 'above'
      t.classList.toggle('above', !above)
      const tw = t.offsetWidth, th = t.offsetHeight
      let x = box.x - pad
      if (x + tw > 1880) x = 1880 - tw
      t.style.left = Math.max(40, x) + 'px'
      t.style.top = (above ? box.y - pad - th - 14 : box.y + box.height + pad + 14) + 'px'
    },
    /* A slow push in on the window, for the moments that deserve one. */
    zoom(scale, ox, oy) {
      const w = $('#win')
      w.style.transformOrigin = (ox ?? 50) + '% ' + (oy ?? 40) + '%'
      w.style.transform = scale === 1 ? 'none' : 'scale(' + scale + ')'
    },
  }
</script>`
