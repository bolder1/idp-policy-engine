/* -----------------------------------------------------------------------------
   The stage for the big film, second cut.

   Two registers. DRAWN: six scenes — intro, zone, device, outcome, order,
   close — as SVG/HTML compositions with named STEPS; the film toggles
   `.s-<step>` on the scene root in time with the voice and CSS does the rest.
   No cards, no panels, no rounded white boxes with text in them: every object
   stands on the ground. CONSOLE: the live showcase in a browser window, with
   the subtitle band, the push-in, the ring and label, and the cursor the rig
   draws.

   Layers, bottom to top:
     #ground / #night   light ground; the dark one only under the intro
     #win               the console (off / on / sunk)
     #fx                drawn bars over the console
     #scene             the drawn scenes (stop above the band)
     #band              subtitles — the foot of the frame, nothing else there
     #ring / #tip       the pointer
   -------------------------------------------------------------------------- */

export const APP_W = 1440
export const APP_H = 760
export const SCALE = 1.1528
export const WIN = { x: 130, y: 26, w: 1660, h: 920, chrome: 44 }

const GROUND = `radial-gradient(1200px 620px at 18% -10%, #ffffff 0%, rgba(255,255,255,0) 60%),
      radial-gradient(900px 500px at 92% 8%, #fdece6 0%, rgba(253,236,230,0) 62%),
      linear-gradient(180deg, #f2f4f8 0%, #e7ebf2 100%)`
const NIGHT = `radial-gradient(1100px 600px at 20% -10%, #1c2130 0%, rgba(28,33,48,0) 60%),
      radial-gradient(900px 520px at 90% 10%, #2a1a14 0%, rgba(42,26,20,0) 62%),
      linear-gradient(180deg, #12151c 0%, #0d1015 100%)`

/* --- glyphs -------------------------------------------------------------- */
const G = {
  office: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="22" height="36" rx="2"/><path d="M14 13h4M20 13h4M14 20h4M20 20h4M14 27h4M20 27h4"/><rect x="30" y="24" width="12" height="9" rx="1.5"/><path d="M28 36h16"/></svg>`,
  user: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="24" cy="17" r="9"/><path d="M8 42c2-9 8-14 16-14s14 5 16 14"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg>`,
}
const LAPTOP = `<svg viewBox="0 0 340 240"><rect class="scr" x="20" y="10" width="300" height="180" rx="16"/><path class="base" d="M0 214h340"/><path class="hinge" d="M20 190L4 214M320 190l16 24"/></svg>`
const TICK = '<svg viewBox="0 0 24 24"><path class="tk" d="M5 12.5l4.5 4.5L19 7.5"/></svg>'

/* A rough India, for the zone scene: nothing more than a recognisable shape. */
const INDIA = 'M1040 110 L1100 150 L1150 232 L1214 300 L1292 328 L1352 300 L1432 292 L1470 332 L1420 380 L1360 402 L1330 452 L1298 470 L1250 472 L1224 522 L1200 600 L1160 700 L1120 792 L1092 830 L1060 782 L1022 682 L992 592 L962 512 L902 432 L862 372 L882 322 L932 302 L952 242 L982 172 L1010 130 Z'
/* the world: four soft continents, only so the first push has something to leave */
const WORLD = [
  'M120 200 C 260 120, 460 140, 600 220 C 700 300, 620 420, 520 470 C 400 520, 260 480, 200 400 C 140 340, 80 280, 120 200 Z',
  'M760 140 C 900 90, 1120 110, 1280 170 C 1440 220, 1640 240, 1760 340 C 1700 440, 1560 470, 1440 440 C 1340 520, 1180 560, 1080 480 C 980 420, 900 360, 820 300 C 740 240, 700 190, 760 140 Z',
  'M300 560 C 400 520, 520 560, 560 660 C 580 760, 500 860, 420 880 C 340 860, 280 760, 300 560 Z',
  'M1500 640 C 1600 600, 1740 640, 1760 720 C 1740 800, 1620 820, 1540 780 C 1480 740, 1460 680, 1500 640 Z',
]

export const html = (appUrl) => `<!doctype html>
<meta charset="utf-8">
<title>stage</title>
<style>
  :root { --brand: #eb5424; --ink: #101828; --muted: #5b6577; --line: #e3e8ef; --ease: cubic-bezier(.2,0,0,1); --sym: cubic-bezier(.65,0,.35,1);
    --good: #14663a; --goodbg: #e8f7ee; --bad: #b42318; --badbg: #fdecea; --grey: #98a2b3; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; font-family: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--ink); background: #eceff5; }
  #ground { position: fixed; inset: 0; background: ${GROUND}; }
  #night { position: fixed; inset: 0; background: ${NIGHT}; opacity: 0; transition: opacity .9s ease; }
  body.dark #night { opacity: 1; }

  /* --- the window ------------------------------------------------------- */
  #win { position: fixed; left: ${WIN.x}px; top: ${WIN.y}px; width: ${WIN.w}px; height: ${WIN.h}px; z-index: 10;
    border-radius: 16px; overflow: hidden; background: #fff;
    box-shadow: 0 40px 80px rgba(16,24,40,.20), 0 8px 20px rgba(16,24,40,.08), 0 0 0 1px rgba(16,24,40,.06);
    transform-origin: 50% 40%; transition: transform .5s var(--ease), opacity .6s var(--ease), filter .6s var(--ease); }
  #win.off { opacity: 0; transform: translateY(70px) scale(.98); }
  #win.sunk { transform: translateY(38px) scale(.975); filter: brightness(.62) saturate(.8); }
  #chrome { height: ${WIN.chrome}px; background: #f6f7f9; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 16px; padding: 0 16px; }
  .dots { display: flex; gap: 8px; } .dots i { width: 11px; height: 11px; border-radius: 50%; display: block; }
  #url { flex: 1; height: 26px; border-radius: 13px; background: #eceef2; border: 1px solid #e1e5ec; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12.5px; color: #64707f; max-width: 520px; margin: 0 auto; }
  #url b { font-weight: 500; color: #3c4553; }
  #vp { width: ${WIN.w}px; height: ${WIN.h - WIN.chrome}px; overflow: hidden; }
  #app { width: ${APP_W}px; height: ${APP_H}px; border: 0; display: block; transform: scale(${SCALE}); transform-origin: 0 0; }
  body.scened #cur { opacity: 0; } #cur { transition: opacity .3s ease; }

  /* --- the band ---------------------------------------------------------- */
  #band { position: fixed; left: 0; right: 0; top: 962px; height: 118px; z-index: 40; pointer-events: none; display: flex; align-items: center; justify-content: center; padding: 0 160px;
    background: ${GROUND}; background-attachment: fixed; }
  #band::after { content: ''; position: absolute; inset: 0; background: ${NIGHT}; background-attachment: fixed; opacity: 0; transition: opacity .9s ease; }
  body.dark #band::after { opacity: 1; }
  #sub { position: relative; z-index: 1; font-size: 30px; line-height: 1.32; font-weight: 500; letter-spacing: .1px; text-align: center; color: #1b2431; max-width: 1400px;
    opacity: 0; transform: translateY(6px); transition: opacity .22s ease, transform .22s ease, color .6s; }
  #sub.on { opacity: 1; transform: none; }
  body.dark #sub { color: #eef1f6; }

  /* --- the pointer -------------------------------------------------------- */
  #ring { position: fixed; z-index: 50; border: 3px solid var(--brand); border-radius: 12px; box-shadow: 0 0 0 4000px rgba(16,24,40,.28); pointer-events: none;
    opacity: 0; transition: opacity .3s ease, left .45s var(--ease), top .45s var(--ease), width .45s var(--ease), height .45s var(--ease); }
  #ring.on { opacity: 1; }
  /* pointer-events none, or the last label — invisible after unring — sits over the next control and eats its press. */
  #tip { position: fixed; z-index: 51; pointer-events: none; padding: 10px 16px; border-radius: 10px; background: var(--ink); color: #fff; font-size: 21px; font-weight: 500; white-space: nowrap; opacity: 0; transition: opacity .3s ease; box-shadow: 0 10px 26px rgba(16,24,40,.3); }
  #tip.on { opacity: 1; }
  #tip::after { content: ''; position: absolute; left: 24px; bottom: -6px; width: 12px; height: 12px; background: var(--ink); transform: rotate(45deg); }
  #tip.above::after { bottom: auto; top: -6px; }

  /* --- drawn things over the console ---------------------------------------- */
  #fx { position: fixed; inset: 0; z-index: 25; pointer-events: none; }
  #fx .bar { fill: rgba(235,84,36,.13); stroke: rgba(235,84,36,.55); stroke-width: 1.5; transition: transform .9s var(--ease), opacity .3s; opacity: 0; }
  #fx .bar.on { opacity: 1; }

  /* --- motion, shared -------------------------------------------------------- */
  @keyframes land { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
  @keyframes fadeout { to { opacity: 0; transform: translateY(-14px); } }
  @keyframes pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08); opacity: 1 } 100% { transform: none; opacity: 1 } }
  @keyframes stampin { from { opacity: 0; transform: scale(1.5) rotate(-4deg); } to { opacity: 1; transform: none; } }
  @keyframes blink { to { opacity: 0 } }
  @keyframes shake { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-5px) } 50% { transform: translateX(5px) } 75% { transform: translateX(-3px) } }
  @keyframes squash { from { transform: scaleX(1) } to { transform: scaleX(.55) } }

  /* --- scenes ------------------------------------------------------------------ */
  #scene { position: fixed; left: 0; right: 0; top: 0; bottom: 118px; z-index: 30; opacity: 0; pointer-events: none; transition: opacity .42s ease; background: ${GROUND}; overflow: hidden; }
  #scene.on { opacity: 1; }
  #scene.over { background: rgba(240,243,248,.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
  .sc { position: absolute; inset: 0; }
  .sc .title { position: absolute; left: 160px; top: 64px; }
  .kick { display: block; font-size: 21px; font-weight: 600; color: var(--brand); letter-spacing: .4px; text-transform: uppercase; }
  .sc .title h1 { margin: 8px 0 0; font-size: 52px; font-weight: 700; letter-spacing: -1.2px; line-height: 1.1; }
  .sc .title .kick, .sc .title h1 { animation: land .5s var(--ease) both; } .sc .title h1 { animation-delay: .08s; }
  .caps { font-size: 17px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; }
  .tag { position: absolute; padding: 8px 16px; border-radius: 10px; background: var(--ink); color: #fff; font-size: 22px; font-weight: 600; white-space: nowrap; }
  .tk { fill: none; stroke: var(--good); stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; }

  /* ======================= INTRO ======================= */
  .sc-intro { color: #fff; }
  .sc-intro .nightbg { position: absolute; inset: 0; background: ${NIGHT}; transition: opacity .9s ease; }
  .sc-intro svg.isvg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-intro .rail { stroke: rgba(255,255,255,.14); stroke-width: 1; stroke-dasharray: 1920; stroke-dashoffset: 1920; transition: stroke-dashoffset .6s var(--ease), stroke .6s, opacity .3s; }
  .sc-intro.s-rail .rail { stroke-dashoffset: 0; }
  .sc-intro .wash { stroke: #3ddc84; stroke-width: 4; opacity: 0; transition: opacity .8s; }
  .sc-intro.s-burst .wash { opacity: .9; }
  .sc-intro .gates { transform-origin: 960px 481px; transform: scaleY(0); transition: transform .4s var(--ease), opacity .3s; }
  .sc-intro.s-rail .gates { transform: none; }
  .sc-intro .g { fill: rgba(255,255,255,.8); transition: transform .6s var(--sym), fill .5s; }
  .sc-intro.s-turn .g { fill: var(--brand); } .sc-intro.s-turn .g1 { transform: translateX(-200px); } .sc-intro.s-turn .g3 { transform: translateX(200px); }
  .sc-intro .pw { position: absolute; left: 0; right: 0; top: 296px; text-align: center; font-size: 44px; font-weight: 600; opacity: 0; transition: opacity .3s; }
  .sc-intro.s-rail .pw { opacity: 1; } .sc-intro.s-turn .pw { opacity: 0; }
  .sc-intro .pw i { display: inline-block; width: 3px; height: 44px; background: #fff; vertical-align: -6px; margin-left: 4px; animation: blink 1s steps(2) infinite; }
  .sc-intro .pk { position: absolute; left: 0; top: 0; width: 0; height: 0; offset-path: path('M-40 481 H1960'); offset-distance: 0%; offset-rotate: 0deg; opacity: 0; }
  .sc-intro .pk .dot { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 0 16px 4px rgba(255,255,255,.55); }
  .sc-intro .pk .cp { position: absolute; left: 0; top: 40px; transform: translateX(-50%); font-size: 22px; font-weight: 500; color: rgba(255,255,255,.6); white-space: nowrap; }
  @keyframes run { from { offset-distance: 0%; opacity: 1 } 96% { opacity: 1 } to { offset-distance: 100%; opacity: 0 } }
  @keyframes turn { 0%, 51% { background: #fff; box-shadow: 0 0 16px 4px rgba(255,255,255,.55) } 52%, 100% { background: #3ddc84; box-shadow: 0 0 16px 4px rgba(61,220,132,.6) } }
  .sc-intro.s-p1 .pk1, .sc-intro.s-p2 .pk2, .sc-intro.s-p3 .pk3 { animation: run var(--d, .9s) cubic-bezier(.45,0,.2,1) forwards; }
  .sc-intro.s-p1 .pk1 .dot, .sc-intro.s-p2 .pk2 .dot, .sc-intro.s-p3 .pk3 .dot { animation: turn var(--d, .9s) linear forwards; }
  .sc-intro.s-burst .pkb { animation: run .6s cubic-bezier(.45,0,.2,1) forwards; animation-delay: var(--dl); }
  .sc-intro.s-burst .pkb .dot { animation: turn .6s linear forwards; animation-delay: var(--dl); }
  .sc-intro .pkh { offset-path: path('M-40 481 H620'); }
  @keyframes runhalt { from { offset-distance: 0%; opacity: 1 } to { offset-distance: 100%; opacity: 1 } }
  .sc-intro.s-halt .pkh { animation: runhalt .7s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-intro.s-halt .gates, .sc-intro.s-halt .rail, .sc-intro.s-halt .wash { opacity: .35; }
  .sc-intro .stamps span { position: absolute; left: 1010px; font-size: 18px; letter-spacing: .16em; text-transform: uppercase; color: #3ddc84; font-weight: 600; opacity: 0; }
  .sc-intro.s-p1 .stamps .st1, .sc-intro.s-p2 .stamps .st2, .sc-intro.s-p3 .stamps .st3 { animation: stampin .16s cubic-bezier(.2,1.4,.4,1) .55s forwards; }
  .sc-intro .head { position: absolute; left: 0; right: 0; top: 170px; text-align: center; font-size: 64px; font-weight: 600; letter-spacing: -1px; opacity: 0; }
  .sc-intro .head span { display: block; font-size: 60px; color: rgba(255,255,255,.6); margin-top: 8px; opacity: 0; }
  .sc-intro.s-head .head { animation: land .5s var(--ease) forwards; }
  .sc-intro.s-head .pw { opacity: 0; }
  .sc-intro.s-head2 .head span { animation: land .5s var(--ease) forwards; }
  .sc-intro.s-turn .head, .sc-intro.s-turn .stamps, .sc-intro.s-turn .pkh, .sc-intro.s-turn .pk1, .sc-intro.s-turn .pk2, .sc-intro.s-turn .pk3, .sc-intro.s-turn .pkb, .sc-intro.s-turn .wash { opacity: 0 !important; transition: opacity .3s; animation: none; }
  .sc-intro.s-turn .gates, .sc-intro.s-turn .rail { opacity: 1; }
  .sc-intro .glabels span { position: absolute; top: 620px; width: 200px; margin-left: -100px; text-align: center; font-size: 18px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.7); opacity: 0; transition: color .6s; }
  .sc-intro .glabels .l1 { left: 760px } .sc-intro .glabels .l2 { left: 960px } .sc-intro .glabels .l3 { left: 1160px }
  .sc-intro.s-turn .glabels span { animation: land .45s var(--ease) forwards; } .sc-intro.s-turn .glabels .l2 { animation-delay: .1s } .sc-intro.s-turn .glabels .l3 { animation-delay: .2s }
  .sc-intro .pkf { offset-path: path('M-40 481 H1180'); }
  .sc-intro .pkf .dot { background: #fff; box-shadow: 0 0 18px 6px rgba(235,84,36,.6); transition: background .6s, box-shadow .6s; }
  .sc-intro.s-read .pkf { animation: runhalt 1.4s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-intro .reads span { position: absolute; top: 322px; width: 240px; margin-left: -120px; text-align: center; font-size: 20px; font-weight: 500; color: rgba(255,255,255,.75); opacity: 0; transition: color .6s; }
  .sc-intro .reads .r1 { left: 760px } .sc-intro .reads .r2 { left: 960px } .sc-intro .reads .r3 { left: 1160px }
  .sc-intro.s-read .reads span { animation: land .35s var(--ease) forwards; } .sc-intro.s-read .reads .r1 { animation-delay: .55s } .sc-intro.s-read .reads .r2 { animation-delay: .75s } .sc-intro.s-read .reads .r3 { animation-delay: .95s }
  .sc-intro.s-day .nightbg { opacity: 0; }
  .sc-intro.s-day .rail { stroke: rgba(16,24,40,.18); }
  .sc-intro.s-day .glabels span, .sc-intro.s-day .reads span { color: var(--ink); }
  .sc-intro.s-day .pkf .dot { background: var(--brand); box-shadow: 0 0 18px 4px rgba(235,84,36,.35); }
  .sc-intro.s-brand .gates, .sc-intro.s-brand .glabels, .sc-intro.s-brand .reads { opacity: 0 !important; transition: opacity .4s; }
  .sc-intro .brand { position: absolute; right: 752px; top: 436px; text-align: right; opacity: 0; }
  .sc-intro .brand b { display: block; font-size: 56px; font-weight: 600; color: var(--ink); letter-spacing: -1px; line-height: 1; }
  .sc-intro .brand span { display: block; font-size: 24px; letter-spacing: .12em; color: rgba(16,24,40,.5); margin-top: 14px; }
  .sc-intro.s-brand .brand { animation: land .5s var(--ease) forwards; }
  .sc-intro.s-out { opacity: 0; transition: opacity .4s; }

  /* ======================= ZONE ======================= */
  .sc-zone2 .layer { position: absolute; inset: 0; transform-origin: 1120px 520px; transition: transform 1s var(--sym), opacity 1s; will-change: transform; }
  .sc-zone2 .layer svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-zone2 .l1 { opacity: 0; } .sc-zone2.s-map .l1 { opacity: 1; }
  .sc-zone2 .l2, .sc-zone2 .l3 { opacity: 0; transform: scale(.385); }
  .sc-zone2.s-z1 .l1 { transform: scale(2.6); opacity: 0; } .sc-zone2.s-z1 .l2 { transform: none; opacity: 1; }
  .sc-zone2.s-z3 .l2 { transform: scale(2.6); opacity: 0; } .sc-zone2.s-z3 .l3 { transform: none; opacity: 1; }
  .sc-zone2 .land { fill: url(#dots); }
  .sc-zone2 .india { fill: url(#dotsw); stroke: var(--brand); stroke-width: 1.5; stroke-dasharray: 3200; stroke-dashoffset: 3200; }
  .sc-zone2.s-z1 .india { transition: stroke-dashoffset .8s var(--ease) .3s; stroke-dashoffset: 0; }
  .sc-zone2 .grid { fill: url(#dotsf); }
  .sc-zone2 .crumb { position: absolute; left: 160px; top: 190px; font-size: 22px; font-weight: 500; color: var(--muted); }
  .sc-zone2 .crumb span { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; transition: opacity .2s; }
  .sc-zone2.s-z1 .c1, .sc-zone2.s-z2 .c2, .sc-zone2.s-z3 .c3 { opacity: 1; }
  .sc-zone2.s-z2 .c1, .sc-zone2.s-z3 .c1, .sc-zone2.s-z3 .c2 { opacity: 0; }
  .sc-zone2 .trav { position: absolute; left: 0; top: 0; width: 0; height: 0; offset-rotate: 0deg; opacity: 0; }
  .sc-zone2 .trav i { position: absolute; left: -5px; top: -5px; width: 10px; height: 10px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 10px rgba(235,84,36,.5); }
  .sc-zone2 .trav b { position: absolute; left: 12px; top: -30px; font-size: 18px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
  @keyframes fly { from { offset-distance: 0%; opacity: 1 } to { offset-distance: 100%; opacity: 1 } }
  .sc-zone2.s-fly .t1 { animation: fly 2s cubic-bezier(.45,0,.2,1) forwards; } .sc-zone2.s-fly .t2 { animation: fly 1.6s cubic-bezier(.45,0,.2,1) .2s forwards; } .sc-zone2.s-fly .t3 { animation: fly 1.4s cubic-bezier(.45,0,.2,1) .4s forwards; }
  .sc-zone2 .mk { fill: var(--ink); } .sc-zone2 .mkl { font-size: 22px; fill: var(--muted); font-family: Inter, system-ui; font-weight: 500; }
  .sc-zone2 .ring { fill: rgba(235,84,36,.08); stroke: var(--brand); stroke-width: 2.5; transform-box: fill-box; transform-origin: center; transform: scale(0); }
  @keyframes ringspring { 0% { transform: scale(0) } 70% { transform: scale(1.05) } 100% { transform: scale(1) } }
  .sc-zone2.s-z3 .ring { animation: ringspring 1.1s cubic-bezier(.34,1.56,.64,1) .4s forwards; }
  .sc-zone2 .radial { stroke: var(--brand); stroke-width: 1.5; stroke-dasharray: 300; stroke-dashoffset: 300; }
  .sc-zone2.s-z3 .radial { transition: stroke-dashoffset .6s var(--ease) 1.2s; stroke-dashoffset: 0; }
  .sc-zone2 .km { position: absolute; left: 1290px; top: 486px; font-size: 22px; font-weight: 600; opacity: 0; transition: opacity .3s 1.3s; font-variant-numeric: tabular-nums; }
  .sc-zone2.s-z3 .km { opacity: 1; }
  .sc-zone2 .office { position: absolute; left: 1480px; top: 560px; width: 120px; height: 120px; border-radius: 16px; border: 2px dashed var(--brand); display: grid; place-items: center; color: var(--ink); opacity: 0; transform: scale(.8); transition: opacity .4s, transform .5s var(--ease); }
  .sc-zone2 .office svg { width: 52px; height: 52px; }
  .sc-zone2.s-net .office { opacity: 1; transform: none; }
  .sc-zone2 .olbl { position: absolute; left: 1380px; top: 700px; width: 320px; text-align: center; font-size: 19px; color: var(--muted); opacity: 0; transition: opacity .4s .3s; }
  .sc-zone2.s-net .olbl { opacity: 1; }
  .sc-zone2 .olink { stroke: var(--brand); stroke-width: 2; stroke-dasharray: 6 6; opacity: 0; transition: opacity .4s .4s; }
  .sc-zone2.s-net .olink { opacity: 1; }
  .sc-zone2 .pin { position: absolute; width: 0; height: 0; opacity: 0; }
  .sc-zone2 .pin .beam { position: absolute; left: -1px; bottom: 0; width: 2px; height: 700px; background: var(--brand); transform-origin: top; transform: translateY(-700px); }
  .sc-zone2 .pin .ipl { position: absolute; left: 12px; top: -44px; font-size: 18px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; opacity: 0; }
  .sc-zone2 .pin .pd { position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; border-radius: 50%; background: var(--grey); transform: scale(0); }
  .sc-zone2 .pin .rip { position: absolute; left: -25px; top: -6px; width: 50px; height: 12px; border-radius: 50%; border: 2px solid var(--brand); transform: scale(0); opacity: 0; }
  .sc-zone2 .pin .ptk { position: absolute; left: 12px; top: -18px; width: 16px; height: 16px; opacity: 0; }
  .sc-zone2 .pin .ptk .tk { stroke: var(--brand); }
  @keyframes beamdrop { 0% { transform: translateY(-700px) } 60% { transform: translateY(0) } 100% { transform: translateY(0) scaleY(0) } }
  @keyframes ripple { 0% { transform: scale(0); opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }
  @keyframes pinland { 0% { transform: scale(0) } 60% { transform: scale(1.4) } 100% { transform: scale(1) } }
  .sc-zone2 .pin.on { opacity: 1; }
  .sc-zone2 .pin.on .beam { animation: beamdrop .75s cubic-bezier(.4,0,1,1) forwards; }
  .sc-zone2 .pin.on .ipl { animation: land .3s var(--ease) .1s forwards; }
  .sc-zone2 .pin.on .rip { animation: ripple .5s ease-out .45s forwards; }
  .sc-zone2 .pin.on .pd { animation: pinland .4s var(--ease) .45s forwards; }
  .sc-zone2 .pin.in .pd { background: var(--brand); box-shadow: 0 0 10px rgba(235,84,36,.5); }
  .sc-zone2 .pin.in.on .ptk { opacity: 1; transition: opacity .2s .8s; } .sc-zone2 .pin.in.on .ptk .tk { transition: stroke-dashoffset .26s var(--ease) .85s; stroke-dashoffset: 0; }
  .sc-zone2 .pin.out .ipl { color: var(--grey); }
  .sc-zone2 .rain { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--grey); opacity: 0; transform: translateY(-40px); }
  .sc-zone2 .rain.in { background: var(--brand); }
  .sc-zone2.s-rain .rain { animation: raindrop .35s cubic-bezier(.4,0,1,1) forwards; animation-delay: var(--dl); }
  @keyframes raindrop { from { opacity: 0; transform: translateY(-40px) } 60% { opacity: 1 } to { opacity: 1; transform: none } }
  .sc-zone2 .ztag { position: absolute; left: 1120px; top: 205px; transform: translate(-50%, -50%); font-size: 28px; padding: 12px 24px; border-radius: 999px; opacity: 0; transition: left .7s var(--ease), top .7s var(--ease), font-size .7s, opacity .4s; }
  .sc-zone2.s-tag .ztag { animation: stampin .25s cubic-bezier(.2,1.4,.4,1) forwards; }
  .sc-zone2.s-rules .l3 { opacity: .35; }
  .sc-zone2.s-rules .ztag { left: 640px; top: 300px; font-size: 24px; animation: none; opacity: 1; }
  .sc-zone2.s-bloom .ztag { opacity: .6; }
  .sc-zone2 .rules { position: absolute; left: 700px; top: 380px; }
  .sc-zone2 .rule { position: relative; height: 100px; font-size: 34px; font-weight: 500; white-space: nowrap; opacity: 0; display: flex; align-items: center; gap: 14px; }
  .sc-zone2.s-rules .rule { animation: land .35s var(--ease) forwards; } .sc-zone2.s-rules .rule:nth-child(2) { animation-delay: .25s } .sc-zone2.s-rules .rule:nth-child(3) { animation-delay: .5s }
  .sc-zone2 .slot { display: inline-flex; align-items: center; justify-content: center; min-width: 220px; height: 52px; padding: 0 18px; border-radius: 8px; border: 1.5px dashed #c6ccd6; color: transparent; font-size: 24px; font-weight: 600; transition: border-color .3s, background .3s, color .3s; }
  .sc-zone2.s-link .slot { border-style: solid; border-color: var(--ink); background: var(--ink); color: #fff; }
  .sc-zone2.s-link .rule:nth-child(2) .slot { transition-delay: .15s } .sc-zone2.s-link .rule:nth-child(3) .slot { transition-delay: .3s }
  @keyframes bloomchip { 0%, 100% { box-shadow: 0 0 0 0 rgba(235,84,36,0) } 40% { box-shadow: 0 0 0 10px rgba(235,84,36,.25) } }
  .sc-zone2.s-bloom .slot { animation: bloomchip .4s ease forwards; } .sc-zone2.s-bloom .rule:nth-child(2) .slot { animation-delay: .2s } .sc-zone2.s-bloom .rule:nth-child(3) .slot { animation-delay: .4s }
  .sc-zone2.s-out .rules, .sc-zone2.s-out .ztag { transform: translateY(-400px); opacity: 0; transition: transform .5s ease-in, opacity .4s; }
  .sc-zone2.s-out .l3 { opacity: 0; transition: opacity .5s; }

  /* ======================= DEVICE ======================= */
  .sc-gate .world { position: absolute; inset: 0; transition: transform 1s var(--ease), opacity .8s; will-change: transform; }
  .sc-gate.s-pan .world { transform: translateX(-900px); }
  .sc-gate.s-word .world { transform: translateX(-1200px); opacity: 0; }
  .sc-gate .st { position: absolute; top: 0; left: 0; width: 1920px; height: 962px; }
  .sc-gate .st2 { left: 900px; opacity: 0; transition: opacity .4s; }
  .sc-gate.s-pan .st2 { opacity: 1; }
  .sc-gate .lane { position: absolute; left: 0; top: 700px; width: 1920px; height: 2px; background: var(--line); transform: scaleX(0); transform-origin: left; transition: transform .6s var(--ease); }
  .sc-gate.s-in .lane { transform: none; }
  .sc-gate .portal { position: absolute; left: 760px; top: 200px; width: 400px; height: 620px; border-radius: 36px; border: 3px solid rgba(16,24,40,.14); }
  .sc-gate .pcap { position: absolute; left: 700px; top: 160px; width: 520px; text-align: center; color: var(--brand); }
  .sc-gate .lap { position: absolute; left: 800px; top: 470px; width: 340px; height: 240px; transform: translateX(-1300px); transition: transform 1.2s var(--ease); }
  .sc-gate.s-in .lap { transform: none; }
  .sc-gate .lap svg { width: 100%; height: 100%; }
  .sc-gate .scr { fill: rgba(255,255,255,.55); stroke: var(--ink); stroke-width: 2.5; } .sc-gate .base, .sc-gate .hinge { stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; fill: none; }
  .sc-gate .xray { clip-path: inset(0 100% 0 0); transition: clip-path 1.2s linear; }
  .sc-gate .xray .scr { fill: rgba(16,24,40,.9); }
  .sc-gate .xray .xg { position: absolute; color: #cbd5e1; font-size: 22px; font-weight: 600; width: 60px; height: 44px; display: grid; place-items: center; border: 1.5px solid #cbd5e1; border-radius: 8px; }
  .sc-gate .xray .xg svg { width: 26px; height: 26px; }
  .sc-gate .beam { position: absolute; left: 790px; top: 210px; width: 4px; height: 600px; background: var(--brand); box-shadow: 0 0 24px 6px rgba(235,84,36,.35); opacity: 0; }
  .sc-gate.s-scan .beam { opacity: 1; animation: beam 1.2s linear forwards; }
  @keyframes beam { from { transform: translateX(0) } 96% { opacity: 1 } to { transform: translateX(340px); opacity: 0 } }
  .sc-gate.s-scan .xray { clip-path: inset(0 0 0 0); }
  .sc-gate .ro { position: absolute; left: 1230px; display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 600; white-space: nowrap; opacity: 0; transform: translateY(12px); transition: opacity .35s, transform .35s var(--ease); }
  .sc-gate .ro .rg { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #c6ccd6; display: grid; place-items: center; transition: border-color .2s, background .2s; }
  .sc-gate .ro .rg svg { width: 16px; height: 16px; }
  .sc-gate.s-tags .ro { opacity: 1; transform: none; }
  .sc-gate.s-tags .ro .rg { border-color: var(--good); background: var(--goodbg); transition-delay: .35s; }
  .sc-gate.s-tags .ro .tk { transition: stroke-dashoffset .26s var(--ease) .45s; stroke-dashoffset: 0; }
  .sc-gate.s-tags .ro:nth-of-type(2) { transition-delay: .13s } .sc-gate.s-tags .ro:nth-of-type(3) { transition-delay: .26s } .sc-gate.s-tags .ro:nth-of-type(4) { transition-delay: .39s }
  .sc-gate .lead { stroke: #9aa4b5; stroke-width: 1.5; stroke-dasharray: 400; stroke-dashoffset: 400; }
  .sc-gate.s-tags .lead { transition: stroke-dashoffset .3s var(--ease); stroke-dashoffset: 0; }
  .sc-gate.s-tags .lead:nth-of-type(2) { transition-delay: .13s } .sc-gate.s-tags .lead:nth-of-type(3) { transition-delay: .26s } .sc-gate.s-tags .lead:nth-of-type(4) { transition-delay: .39s }
  .sc-gate.s-floor .lap, .sc-gate.s-floor .beam { transform: translateX(1000px); opacity: 0; transition: transform .5s var(--ease), opacity .4s; }
  .sc-gate.s-floor .lead { opacity: 0; transition: opacity .3s; }
  .sc-gate.s-floor .ro:not(.win) { opacity: .35; }
  .sc-gate .ro.win { transition: transform .6s var(--ease), opacity .35s; }
  .sc-gate.s-floor .ro.win { transform: translate(-690px, 212px); }
  .sc-gate .floor { position: absolute; left: 720px; top: 557px; width: 480px; height: 6px; background: var(--brand); border-radius: 3px; transform: scaleX(0); transform-origin: left; transition: transform .6s var(--ease) .3s; }
  .sc-gate.s-floor .floor { transform: none; }
  .sc-gate .newer { position: absolute; left: 960px; top: 528px; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; color: var(--brand); font-weight: 700; opacity: 0; transition: opacity .3s .8s; }
  .sc-gate.s-floor .newer { opacity: 1; }
  .sc-gate .pbase { position: absolute; left: 780px; top: 760px; width: 360px; height: 2px; background: var(--line); opacity: 0; transition: opacity .3s .3s; }
  .sc-gate.s-floor .pbase { opacity: 1; }
  .sc-gate .col { position: absolute; width: 64px; height: 0; top: 760px; border-radius: 10px 10px 0 0; background: rgba(16,24,40,.85); transform-origin: bottom; transition: height .6s var(--ease), transform .6s var(--ease), background .3s; }
  .sc-gate .col .cv { position: absolute; left: 0; right: 0; top: -44px; text-align: center; font-size: 22px; font-weight: 700; opacity: 0; transition: opacity .3s .4s; }
  .sc-gate .col .ok, .sc-gate .col .no { position: absolute; left: 50%; top: -14px; width: 28px; height: 28px; margin-left: -14px; border-radius: 50%; display: grid; place-items: center; opacity: 0; }
  .sc-gate .col .ok { background: var(--goodbg); } .sc-gate .col .ok svg { width: 18px; height: 18px } .sc-gate .col .ok .tk { stroke-dashoffset: 0; }
  .sc-gate .col .no { color: var(--bad); font-size: 30px; font-weight: 700; }
  .sc-gate .c1 { left: 832px } .sc-gate .c2 { left: 928px } .sc-gate .c3 { left: 1024px }
  .sc-gate.s-c1 .c1 { height: 200px; transform: translateY(-200px); } .sc-gate.s-c1 .c1 .cv, .sc-gate.s-c1 .c1 .ok { opacity: 1; } .sc-gate.s-c1 .c1 .ok { animation: pop .3s var(--ease) .6s both; }
  @keyframes flash { 0%, 100% { box-shadow: none } 40% { box-shadow: 0 0 0 4px rgba(235,84,36,.35) } }
  .sc-gate.s-c1 .floor { animation: flash .6s ease .55s; }
  .sc-gate.s-c2 .c2 { height: 330px; transform: translateY(-330px); } .sc-gate.s-c2 .c2 .cv, .sc-gate.s-c2 .c2 .ok { opacity: 1; } .sc-gate.s-c2 .c2 .ok { animation: pop .3s var(--ease) .6s both; }
  .sc-gate.s-c3 .c3 { height: 148px; transform: translateY(-148px); background: var(--bad); } .sc-gate.s-c3 .c3 .cv, .sc-gate.s-c3 .c3 .no { opacity: 1; } .sc-gate.s-c3 .c3 .no { animation: pop .3s var(--ease) .6s both; }
  .sc-gate.s-pan .st1 { opacity: 0; transition: opacity .4s; }
  .sc-gate .slot2 { position: absolute; left: 830px; top: 800px; width: 260px; height: 10px; border-radius: 5px; background: var(--brand); box-shadow: 0 0 22px rgba(235,84,36,.45); }
  .sc-gate .lap2 { transform: translateX(700px); opacity: 0; transition: transform .7s var(--ease), opacity .4s; }
  .sc-gate.s-lap .lap2 { transform: none; opacity: 1; }
  .sc-gate .sig { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-gate .sig .sd { fill: var(--ink); transform-box: fill-box; transform-origin: center; transform: scale(0); transition: transform .25s var(--ease), fill .2s; }
  .sc-gate.s-sig .sig .sd { transform: none; }
  .sc-gate.s-sig .sig .sd:nth-of-type(2) { transition-delay: .06s } .sc-gate.s-sig .sig .sd:nth-of-type(3) { transition-delay: .12s } .sc-gate.s-sig .sig .sd:nth-of-type(4) { transition-delay: .18s } .sc-gate.s-sig .sig .sd:nth-of-type(5) { transition-delay: .24s } .sc-gate.s-sig .sig .sd:nth-of-type(6) { transition-delay: .3s } .sc-gate.s-sig .sig .sd:nth-of-type(7) { transition-delay: .36s }
  .sc-gate .sig .sl { fill: none; stroke: var(--brand); stroke-width: 2; stroke-dasharray: 1200; stroke-dashoffset: 1200; }
  .sc-gate.s-sig .sig .sl { transition: stroke-dashoffset .8s var(--ease) .3s; stroke-dashoffset: 0; }
  .sc-gate .ghost { opacity: 0; transform: translateY(180px); transition: transform .8s var(--ease), opacity .6s; }
  .sc-gate .ghost .sd { fill: #9aa4b5; } .sc-gate .ghost .sl { stroke: #9aa4b5; stroke-dasharray: 6 6; stroke-dashoffset: 0; }
  .sc-gate.s-ghost .ghost { opacity: .9; transform: translateY(10px); }
  .sc-gate .gcap { position: absolute; left: 1110px; top: 792px; font-size: 19px; color: var(--muted); opacity: 0; transition: opacity .4s .3s; white-space: nowrap; }
  .sc-gate.s-ghost .gcap { opacity: 1; }
  .sc-gate.s-snap .ghost { transform: none; opacity: 0; transition: transform .25s var(--ease), opacity .3s .25s; }
  .sc-gate.s-snap .live .sd { fill: var(--brand); animation: pop .3s var(--ease) both; animation-delay: calc(var(--n) * 50ms); }
  .sc-gate .stampw { position: absolute; left: 930px; top: 380px; transform: rotate(-6deg); opacity: 0; }
  .sc-gate .stampw b { display: block; padding: 8px 18px; font-size: 30px; font-weight: 800; color: var(--good); border: 2px solid var(--good); border-radius: 8px; background: #fff; }
  .sc-gate.s-snap .stampw { animation: stampin .35s cubic-bezier(.2,1.4,.4,1) .3s forwards; }
  .sc-gate .final { position: absolute; inset: 0; opacity: 0; transition: opacity .6s .3s; }
  .sc-gate.s-word .final { opacity: 1; }
  .sc-gate .fl { position: absolute; left: 200px; display: flex; align-items: center; gap: 18px; font-size: 24px; font-weight: 600; transform: translateX(-40px); opacity: 0; transition: transform .4s var(--ease), opacity .4s; }
  .sc-gate.s-word .fl { transform: none; opacity: 1; } .sc-gate.s-word .fl2 { transition-delay: .12s }
  .sc-gate .fl .ic { width: 40px; height: 40px; border-radius: 12px; border: 3px solid var(--brand); transition: border-color .3s; }
  .sc-gate .fl2 .ic { border-radius: 50%; border-style: dotted; }
  .sc-gate.s-flip .fl1 .ic { border-color: var(--bad); }
  .sc-gate .fcap { position: absolute; left: 700px; top: 290px; color: var(--muted); }
  .sc-gate .wordw { position: absolute; left: 700px; top: 300px; perspective: 900px; }
  .sc-gate .wordw .y, .sc-gate .wordw .n { display: block; font-size: 200px; font-weight: 800; letter-spacing: -8px; line-height: 1; transform-origin: 50% 50%; backface-visibility: hidden; }
  .sc-gate .wordw .y { color: var(--good); opacity: 0; transition: transform .35s ease-in; }
  .sc-gate .wordw .n { position: absolute; left: 0; top: 0; color: var(--bad); transform: rotateX(90deg); transition: transform .35s ease-out .35s; white-space: nowrap; }
  .sc-gate.s-match .wordw .y { animation: pop .5s var(--ease) forwards; }
  .sc-gate .under { position: absolute; left: 706px; top: 520px; width: 520px; height: 4px; background: var(--good); transform: scaleX(0); transform-origin: left; transition: transform .6s var(--ease) .3s, background .3s; }
  .sc-gate.s-match .under { transform: none; }
  .sc-gate.s-flip .wordw .y { animation: none; opacity: 1; transform: rotateX(-90deg); } .sc-gate.s-flip .wordw .n { transform: rotateX(0); } .sc-gate.s-flip .under { background: var(--bad); }
  .sc-gate .drop { position: absolute; left: 370px; top: 396px; transform: rotate(5deg) translateY(-500px); opacity: 0; }
  @keyframes pindrop { from { transform: rotate(5deg) translateY(-500px); opacity: 0 } 60% { opacity: 1 } to { transform: rotate(5deg) translateY(0); opacity: 1 } }
  .sc-gate.s-flip .drop { animation: pindrop .5s cubic-bezier(.4,0,1,1) forwards; }
  .sc-gate.s-lift .drop { animation: none; transform: rotate(5deg) translateY(-120px); opacity: 0; transition: transform .4s, opacity .4s; }
  .sc-gate.s-lift .wordw .y { opacity: 1; transform: none; transition: transform .35s ease-out .35s; }
  .sc-gate.s-out { opacity: 0; transition: opacity .5s; }

  /* ======================= OUTCOME ======================= */
  .sc-rail svg.rsvg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-rail .rl { stroke: #d9dde5; stroke-width: 4; fill: none; stroke-dasharray: 1600; stroke-dashoffset: 1600; }
  .sc-rail.s-rail .rl { transition: stroke-dashoffset .6s var(--ease); stroke-dashoffset: 0; }
  .sc-rail .usr { position: absolute; left: 138px; top: 498px; width: 44px; height: 44px; color: var(--ink); opacity: 0; transition: opacity .4s .3s; }
  .sc-rail .usr svg { width: 100%; height: 100%; }
  .sc-rail .utag { position: absolute; left: 140px; top: 560px; font-size: 26px; font-weight: 500; color: var(--muted); opacity: 0; transition: opacity .4s .5s; }
  .sc-rail.s-rail .usr, .sc-rail.s-rail .utag { opacity: 1; }
  .sc-rail .word { position: absolute; left: 160px; top: 120px; font-size: 96px; font-weight: 600; letter-spacing: -.02em; line-height: 1; opacity: 0; transform: translateY(36px); transition: opacity .4s, transform .4s cubic-bezier(.2,.8,.2,1); white-space: nowrap; }
  .sc-rail .word.w2 { font-size: 72px; top: 132px; } .sc-rail .word.w3 { color: var(--bad); }
  .sc-rail.s-a1 .w1, .sc-rail.s-a2 .w2, .sc-rail.s-deny .w3 { opacity: 1; transform: none; }
  .sc-rail.s-a2 .w1, .sc-rail.s-deny .w2 { opacity: 0; transform: translateY(-14px); }
  .sc-rail .comet { position: absolute; left: 0; top: 0; width: 0; height: 0; offset-path: path('M160 520 H1760'); offset-distance: 0%; offset-rotate: 0deg; opacity: 0; }
  .sc-rail .comet .core { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 12px 3px rgba(235,84,36,.5); }
  .sc-rail .comet .tail { position: absolute; left: -150px; top: -5px; width: 140px; height: 10px; border-radius: 5px; background: linear-gradient(90deg, rgba(235,84,36,0), var(--brand)); }
  @keyframes c1 { from { offset-distance: 2.5%; opacity: 1 } 96% { opacity: 1 } to { offset-distance: 96.25%; opacity: 0 } }
  @keyframes c2a { from { offset-distance: 2.5%; opacity: 1 } to { offset-distance: 63.75%; opacity: 1 } }
  @keyframes c2b { from { offset-distance: 63.75%; opacity: 1 } 90% { opacity: 1 } to { offset-distance: 96.25%; opacity: 0 } }
  @keyframes c3 { from { offset-distance: 2.5%; opacity: 1 } to { offset-distance: 77.9%; opacity: 1 } }
  .sc-rail.s-a1 .cm1 { animation: c1 1.6s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-rail.s-run2 .cm2 { animation: c2a 1s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-rail.s-go2 .cm2 { animation: c2b .7s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-rail.s-run3 .cm3 { animation: c3 1.2s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-rail.s-hit .cm3 .core { background: var(--bad); box-shadow: 0 0 12px 3px rgba(180,35,24,.5); animation: squash .09s forwards; }
  .sc-rail.s-hit .cm3 .tail { opacity: 0; transition: opacity .15s; }
  .sc-rail .pw { position: absolute; left: 900px; top: 452px; padding: 6px 14px; border-radius: 999px; border: 1px solid #cfd4dc; font-size: 26px; font-weight: 500; opacity: 0; }
  @keyframes pwpop { 0% { opacity: 0; transform: scale(.7) } 30% { opacity: 1; transform: none } 80% { opacity: 1 } 100% { opacity: 0; transform: translateY(-8px) } }
  .sc-rail.s-a1 .pw1 { animation: pwpop .7s ease .75s forwards; } .sc-rail.s-run2 .pw2 { animation: pwpop .7s ease .6s forwards; } .sc-rail.s-run3 .pw3 { animation: pwpop .7s ease .55s forwards; }
  .sc-rail .bloom { transform-box: fill-box; transform-origin: center; transform: scale(0); }
  .sc-rail .bloom .bd { fill: var(--good); } .sc-rail .bloom .bt { fill: none; stroke: #fff; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 100; stroke-dashoffset: 100; }
  .sc-rail .bring { fill: none; stroke: var(--good); stroke-width: 3; transform-box: fill-box; transform-origin: center; transform: scale(.3); opacity: 0; }
  .sc-rail.s-bloom .bloom { animation: pop .3s cubic-bezier(.34,1.56,.64,1) forwards; }
  .sc-rail.s-bloom .bloom .bt { transition: stroke-dashoffset .25s .2s; stroke-dashoffset: 0; }
  @keyframes bring { from { transform: scale(.3); opacity: .5 } to { transform: scale(3.3); opacity: 0 } }
  .sc-rail.s-bloom .bring { animation: bring .5s ease-out .1s forwards; }
  .sc-rail.s-a2 .bloom, .sc-rail.s-a2 .bring, .sc-rail.s-a2 .cm1 { opacity: 0 !important; transition: opacity .3s; animation: none; }
  .sc-rail.s-deny .bloom, .sc-rail.s-deny .bring, .sc-rail.s-deny .cm2 { opacity: 0 !important; transition: opacity .3s; animation: none; }
  .sc-rail .chk { fill: none; stroke: var(--brand); stroke-width: 4; transform-box: fill-box; transform-origin: center; transform: scale(.6); opacity: 0; transition: transform .4s var(--ease), opacity .3s, stroke .3s; filter: drop-shadow(0 0 8px rgba(235,84,36,.4)); }
  .sc-rail.s-a2 .chk { transform: none; opacity: 1; }
  @keyframes chkpulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.12) } }
  .sc-rail.s-run2 .chk { animation: chkpulse .6s ease 1s 2; }
  .sc-rail.s-open .chk { stroke: var(--good); transform: scaleX(0); transition: transform .25s, stroke .2s; animation: none; }
  .sc-rail.s-deny .chk { opacity: 0; transition: opacity .3s; }
  .sc-rail .phone { position: absolute; left: 1135px; top: 300px; width: 90px; height: 160px; border: 2px solid var(--ink); border-radius: 18px; opacity: 0; transition: opacity .4s .2s; }
  .sc-rail.s-a2 .phone { opacity: 1; } .sc-rail.s-deny .phone { opacity: 0; transition: opacity .3s; }
  .sc-rail .slots { position: absolute; left: 1120px; top: 372px; width: 120px; display: flex; justify-content: center; gap: 4px; opacity: 0; transition: opacity .3s; }
  .sc-rail.s-a2 .slots { opacity: 1; } .sc-rail.s-deny .slots { opacity: 0; }
  .sc-rail .slots i { width: 14px; height: 20px; border-bottom: 2px solid #c6ccd6; font-style: normal; font-size: 22px; font-weight: 600; color: var(--brand); text-align: center; line-height: 20px; }
  .sc-rail .slots i b { opacity: 0; display: block; }
  .sc-rail.s-code .slots i b { animation: pop .2s var(--ease) forwards; animation-delay: calc(var(--n) * .1s); }
  .sc-rail .flash { position: absolute; left: 1180px; top: 380px; width: 0; height: 0; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px rgba(235,84,36,.4); opacity: 0; }
  @keyframes flashring { from { width: 0; height: 0; margin: 0; opacity: 1 } to { width: 180px; height: 180px; margin: -90px 0 0 -90px; opacity: 0 } }
  .sc-rail.s-code .flash { animation: flashring .3s ease-out .6s forwards; }
  .sc-rail .plate { fill: var(--ink); transform-box: fill-box; transform-origin: center; transform: scaleY(0); transition: transform .3s cubic-bezier(.34,1.56,.64,1); }
  .sc-rail.s-deny .plate { transform: none; }
  .sc-rail.s-hit .plate { animation: shake .12s linear; }
  .sc-rail .msg { position: absolute; left: 1470px; top: 500px; font-size: 34px; font-weight: 500; white-space: nowrap; overflow: hidden; width: 0; border-right: 3px solid transparent; }
  .sc-rail.s-msg .msg { animation: typing 1.4s steps(28) forwards, caretb 1s steps(2) infinite; }
  @keyframes typing { from { width: 0 } to { width: 380px } } @keyframes caretb { 0%, 100% { border-color: var(--ink) } 50% { border-color: transparent } }
  .sc-rail .ymsg { position: absolute; left: 1470px; top: 446px; padding: 4px 12px; border: 1px solid var(--brand); border-radius: 999px; font-size: 22px; font-weight: 500; color: var(--brand); opacity: 0; }
  .sc-rail.s-msg .ymsg { animation: pop .3s var(--ease) 1.5s forwards; }
  .sc-rail .marks { position: absolute; left: 1360px; top: 820px; display: flex; gap: 126px; opacity: 0; transition: opacity .5s; }
  .sc-rail .marks i { width: 44px; height: 44px; border-radius: 50%; display: block; }
  .sc-rail .marks .m1 { background: var(--good); } .sc-rail .marks .m2 { border: 4px solid var(--brand); } .sc-rail .marks .m3 { background: var(--ink); border-radius: 8px; width: 14px; margin: 0 15px; }
  .sc-rail.s-recap .marks { opacity: 1; }
  .sc-rail.s-recap .rl, .sc-rail.s-recap .usr, .sc-rail.s-recap .utag, .sc-rail.s-recap .w3, .sc-rail.s-recap .plate, .sc-rail.s-recap .cm3, .sc-rail.s-recap .msg, .sc-rail.s-recap .ymsg { opacity: 0 !important; transition: opacity .4s; animation: none; }
  .sc-rail.s-out { opacity: 0; transition: opacity .5s; }

  /* ======================= ORDER ======================= */
  .sc-drop .title h1 { position: relative; height: 60px; width: 800px; }
  .sc-drop .title h1 span { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; transition: opacity .3s; }
  .sc-drop .title h1 .h1 { opacity: 1; } .sc-drop.s-h2 .title h1 .h1 { opacity: 0 } .sc-drop.s-h2 .title h1 .h2 { opacity: 1 } .sc-drop.s-h3 .title h1 .h2 { opacity: 0 } .sc-drop.s-h3 .title h1 .h3 { opacity: 1 }
  .sc-drop svg.dsvg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-drop .rl { stroke: #d9dde5; stroke-width: 2; stroke-dasharray: 720; stroke-dashoffset: 720; }
  .sc-drop.s-set .rl { transition: stroke-dashoffset .6s var(--ease); stroke-dashoffset: 0; }
  .sc-drop .shelf { position: absolute; left: 660px; width: 600px; height: 10px; transform: translateX(-1400px); transition: transform .45s cubic-bezier(.2,.8,.2,1), top .6s var(--sym), opacity .3s; }
  .sc-drop.s-set .shelf { transform: none; } .sc-drop.s-set .sh2 { transition-delay: .12s } .sc-drop.s-set .sh3 { transition-delay: .24s }
  .sc-drop.s-swap .shelf, .sc-drop.s-del .shelf { transition-delay: 0s; }
  .sc-drop .sh1 { top: 300px } .sc-drop .sh2 { top: 460px } .sc-drop .sh3 { top: 620px }
  .sc-drop .shelf .ha, .sc-drop .shelf .hb { position: absolute; top: 0; height: 10px; width: 280px; border-radius: 5px; background: var(--ink); transition: transform .18s var(--sym), background .3s, filter .3s; }
  .sc-drop .shelf .ha { left: 20px } .sc-drop .shelf .hb { left: 300px }
  .sc-drop .shelf.open .ha { transform: translateX(-90px) } .sc-drop .shelf.open .hb { transform: translateX(90px) }
  .sc-drop .shelf.good .ha, .sc-drop .shelf.good .hb { background: var(--good); filter: drop-shadow(0 0 16px rgba(20,102,58,.6)); }
  .sc-drop .shelf.warm .ha, .sc-drop .shelf.warm .hb { background: var(--brand); filter: drop-shadow(0 0 16px rgba(235,84,36,.6)); }
  .sc-drop .shelf .lb { position: absolute; right: calc(100% + 34px); top: -14px; font-size: 30px; font-weight: 500; white-space: nowrap; }
  .sc-drop .shelf .mk { position: absolute; left: calc(100% + 40px); top: -17px; width: 44px; height: 44px; transform: scale(0); transition: transform .3s var(--ease); }
  .sc-drop.s-set .shelf .mk { transform: none; transition-delay: .5s; }
  .sc-drop .mk.deny { background: var(--ink); border-radius: 10px; } .sc-drop .mk.deny::after { content: ''; position: absolute; left: 10px; right: 10px; top: 20px; height: 4px; background: #fff; border-radius: 2px; }
  .sc-drop .mk.allow { background: var(--good); border-radius: 50%; } .sc-drop .mk.allow svg { width: 100%; height: 100%; padding: 10px; } .sc-drop .mk.allow .tk { stroke: #fff; stroke-dashoffset: 0; }
  .sc-drop .mk.mfa { border: 4px solid var(--brand); border-radius: 50%; }
  .sc-drop.s-set .shelf.good .mk, .sc-drop.s-set .shelf.warm .mk { transform: scale(1.4); transition-delay: 0s; }
  .sc-drop .shelf .x { position: absolute; left: 565px; top: -14px; font-size: 22px; color: #9a9ea6; opacity: 0; transition: opacity .3s; }
  .sc-drop.s-x .shelf .x { opacity: 1; }
  .sc-drop .num { position: absolute; left: 676px; width: 40px; text-align: left; font-size: 26px; font-weight: 600; color: var(--brand); transition: transform .25s, opacity .3s; }
  .sc-drop .n1 { top: 262px } .sc-drop .n2 { top: 422px } .sc-drop .n3 { top: 582px }
  .sc-drop .floor { position: absolute; left: 660px; top: 800px; width: 600px; height: 22px; background: var(--ink); border-radius: 4px; transform: translateY(200px); transition: transform .35s cubic-bezier(.34,1.56,.64,1); transform-origin: bottom; }
  .sc-drop.s-set .floor { transform: none; transition-delay: .4s; }
  .sc-drop .flbl { position: absolute; left: 660px; top: 836px; width: 600px; text-align: center; font-size: 26px; font-weight: 500; color: var(--muted); opacity: 0; transition: opacity .4s .7s, color .3s; }
  .sc-drop.s-set .flbl { opacity: 1; }
  .sc-drop .lock { position: absolute; left: 1218px; top: 776px; width: 22px; height: 22px; color: #fff; opacity: 0; transition: opacity .3s .8s; transform-origin: 50% 100%; }
  .sc-drop .lock svg { width: 100%; height: 100%; }
  .sc-drop.s-set .lock { opacity: 1; }
  @keyframes lockshake { 0%, 100% { transform: rotate(0) } 25% { transform: rotate(-8deg) } 50% { transform: rotate(8deg) } 75% { transform: rotate(-4deg) } }
  .sc-drop.s-del .lock { animation: lockshake .3s ease .3s; }
  .sc-drop .read { position: absolute; left: 680px; top: 120px; width: 560px; height: 3px; background: var(--brand); box-shadow: 0 0 24px 6px rgba(235,84,36,.5); opacity: 0; transition: transform 1s linear, opacity .3s; }
  .sc-drop.s-read .read { opacity: 1; transform: translateY(680px); }
  .sc-drop.s-s1 .read { opacity: 0; }
  .sc-drop .ball { position: absolute; left: 942px; top: 112px; width: 36px; height: 36px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 8px rgba(235,84,36,.16); display: grid; place-items: center; color: #fff; opacity: 0; transform: scale(.6); transition: opacity .3s, transform .3s var(--ease), top .35s cubic-bezier(.4,0,1,1); }
  .sc-drop .ball svg { width: 22px; height: 22px; }
  .sc-drop .ball.grey { background: var(--grey); box-shadow: 0 0 0 8px rgba(152,162,179,.2); }
  .sc-drop .ball.on { opacity: 1; transform: none; }
  @keyframes squashb { 0% { transform: scale(1) } 40% { transform: scale(1.1, .85) } 100% { transform: scale(1) } }
  .sc-drop .ball.land { animation: squashb .25s ease; }
  .sc-drop .btag { position: absolute; left: 700px; top: 78px; width: 520px; text-align: center; font-size: 24px; font-weight: 500; color: var(--muted); opacity: 0; transition: opacity .3s; white-space: nowrap; }
  .sc-drop .btag.on { opacity: 1; }
  .sc-drop .out { position: absolute; left: 1400px; font-size: 72px; font-weight: 600; letter-spacing: -1.5px; opacity: 0; transform: translateX(20px); transition: opacity .4s, transform .4s var(--ease); white-space: nowrap; }
  .sc-drop .out.on { opacity: 1; transform: none; }
  .sc-drop .o1 { top: 410px; color: var(--good) } .sc-drop .o2 { top: 410px; color: var(--brand) } .sc-drop .o3 { top: 764px; left: 1300px; font-size: 44px; color: #3d4654 }
  .sc-drop .veil { position: absolute; left: 640px; width: 640px; top: 470px; height: 360px; background: linear-gradient(to bottom, rgba(242,244,248,0), rgba(242,244,248,.72) 120px); opacity: 0; transition: opacity .4s; pointer-events: none; }
  .sc-drop .veil.on { opacity: 1; }
  .sc-drop .dotted { position: absolute; left: 959px; top: 480px; width: 2px; height: 320px; background: repeating-linear-gradient(to bottom, var(--brand) 0 2px, transparent 2px 10px); transform: scaleY(0); transform-origin: top; opacity: 0; transition: transform .4s var(--ease), opacity .4s; }
  .sc-drop .dotted.on { transform: none; opacity: .6; }
  .sc-drop.s-swap .sh2 { top: 620px; } .sc-drop.s-swap .sh3 { top: 460px; }
  .sc-drop .shelf.gone { transform: translateY(-30px); opacity: 0; transition: transform .3s, opacity .3s; }
  .sc-drop.s-swap.s-del .sh2 { top: 460px; }
  .sc-drop.s-del .n3 { opacity: 0; }
  @keyframes thud { 0% { transform: scaleY(1) } 30% { transform: scaleY(.82) } 60% { transform: scaleY(1.04) } 100% { transform: scaleY(1) } }
  .sc-drop.s-thud .floor { animation: thud .25s ease; } .sc-drop.s-thud .flbl { color: var(--ink); }
  .sc-drop .thring { position: absolute; left: 660px; top: 800px; width: 600px; height: 22px; border-radius: 4px; border: 1px solid #3d4654; opacity: 0; transform-origin: center; }
  @keyframes thring { from { transform: scale(1); opacity: .5 } to { transform: scale(1.6, 4); opacity: 0 } }
  .sc-drop.s-thud .thring { animation: thring .5s ease-out; }
  .sc-drop.s-out { opacity: 0; transition: opacity .6s; }

  /* ======================= CLOSE ======================= */
  .sc-answers svg.asvg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .sc-answers .rail { stroke: rgba(16,24,40,.18); stroke-width: 1; }
  .sc-answers .g { fill: var(--brand); }
  .sc-answers .setgrp { opacity: 0; transition: opacity .4s; } .sc-answers.s-set .setgrp { opacity: 1; }
  .sc-answers .glabels span { position: absolute; top: 620px; width: 200px; margin-left: -100px; text-align: center; font-size: 18px; letter-spacing: .2em; text-transform: uppercase; color: rgba(16,24,40,.45); opacity: 0; transition: opacity .4s; }
  .sc-answers .glabels .l1 { left: 760px } .sc-answers .glabels .l2 { left: 960px } .sc-answers .glabels .l3 { left: 1160px }
  .sc-answers.s-set .glabels span { opacity: 1; }
  .sc-answers .mark { fill: none; stroke: rgba(16,24,40,.4); stroke-width: 2; transition: fill .3s, opacity .3s; }
  .sc-answers .pk { position: absolute; left: 0; top: 0; width: 0; height: 0; offset-path: path('M-40 481 H1800'); offset-distance: 0%; offset-rotate: 0deg; opacity: 0; }
  .sc-answers .pk .dot { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 12px 3px rgba(235,84,36,.5); transition: background .3s, box-shadow .3s; }
  .sc-answers .pk .cp { position: absolute; right: 14px; top: 40px; font-size: 22px; font-weight: 500; color: var(--muted); white-space: nowrap; text-align: right; }
  @keyframes a1 { from { offset-distance: 0%; opacity: 1 } to { offset-distance: 100%; opacity: 1 } }
  @keyframes a2a { from { offset-distance: 0%; opacity: 1 } to { offset-distance: 79.3%; opacity: 1 } }
  @keyframes a2b { from { offset-distance: 79.3%; opacity: 1 } to { offset-distance: 100%; opacity: 1 } }
  @keyframes a3 { from { offset-distance: 0%; opacity: 1 } to { offset-distance: 78.6%; opacity: 1 } }
  .sc-answers.s-p1 .pk1 { animation: a1 1.8s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-answers.s-p1 .pk1 .dot { background: var(--good); box-shadow: 0 0 12px 3px rgba(20,102,58,.4); transition-delay: 1.4s; }
  .sc-answers .railgood { stroke: var(--good); stroke-width: 4; stroke-dasharray: 640; stroke-dashoffset: 640; opacity: 0; }
  .sc-answers.s-p1 .railgood { opacity: 1; transition: stroke-dashoffset .5s var(--ease) 1.2s, opacity .1s 1.2s; stroke-dashoffset: 0; }
  .sc-answers .bloom { transform-box: fill-box; transform-origin: center; transform: scale(0); }
  .sc-answers .bloom .bd { fill: var(--good); } .sc-answers .bloom .bt { fill: none; stroke: #fff; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 100; stroke-dashoffset: 100; }
  .sc-answers.s-p1 .bloom { animation: pop .3s cubic-bezier(.34,1.56,.64,1) 1.5s forwards; }
  .sc-answers.s-p1 .bloom .bt { transition: stroke-dashoffset .25s 1.7s; stroke-dashoffset: 0; }
  .sc-answers.s-go2 .bloom { animation: pop .3s cubic-bezier(.34,1.56,.64,1) .6s forwards; }
  .sc-answers.s-go2 .bloom .bt { transition: stroke-dashoffset .25s .8s; stroke-dashoffset: 0; }
  .sc-answers.s-p1 .mark { fill: var(--goodbg); transition-delay: 1.6s; }
  .sc-answers .ans { position: absolute; left: 1190px; top: 300px; font-size: 40px; font-weight: 600; opacity: 0; white-space: nowrap; }
  .sc-answers .ans.a1 { color: var(--good) } .sc-answers .ans.a2 { color: var(--brand) } .sc-answers .ans.a2 span { color: var(--muted) } .sc-answers .ans.a3 { color: var(--bad) }
  .sc-answers .ans .q { display: block; font-size: 24px; font-weight: 500; color: rgba(16,24,40,.5); margin-top: 8px; }
  .sc-answers.s-p1 .a1 { animation: stampin .16s cubic-bezier(.2,1.4,.4,1) 1.55s forwards; }
  .sc-answers.s-p2 .pk1, .sc-answers.s-p2 .railgood, .sc-answers.s-p2 .bloom, .sc-answers.s-p2 .a1 { opacity: 0 !important; transition: opacity .3s; animation: none; }
  .sc-answers.s-p2 .mark { fill: none; transition-delay: 0s; }
  .sc-answers.s-p2 .pk2 { animation: a2a 1.2s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-answers.s-go2 .pk2 { animation: a2b .7s cubic-bezier(.45,0,.2,1) forwards; }
  .sc-answers.s-go2 .pk2 .dot { background: var(--good); box-shadow: 0 0 12px 3px rgba(20,102,58,.4); transition-delay: .5s; }
  .sc-answers .chk { fill: none; stroke: var(--brand); stroke-width: 4; transform-box: fill-box; transform-origin: center; opacity: 0; transition: opacity .3s, stroke .2s, transform .25s; }
  .sc-answers.s-p2 .chk { opacity: 1; } .sc-answers.s-open .chk { stroke: var(--good); transform: scaleX(0); } .sc-answers.s-p3 .chk { opacity: 0; }
  .sc-answers .phone { position: absolute; left: 1375px; top: 150px; width: 90px; height: 160px; border: 2px solid var(--ink); border-radius: 18px; opacity: 0; transition: opacity .4s; }
  .sc-answers.s-p2 .phone { opacity: 1; } .sc-answers.s-p3 .phone { opacity: 0; }
  .sc-answers .slots { position: absolute; left: 1360px; top: 222px; width: 120px; display: flex; justify-content: center; gap: 4px; }
  .sc-answers .slots i { width: 14px; height: 20px; border-bottom: 2px solid #c6ccd6; font-style: normal; font-size: 22px; font-weight: 600; color: var(--brand); text-align: center; line-height: 20px; opacity: 0; transition: opacity .3s; }
  .sc-answers.s-p2 .slots i { opacity: 1; }
  .sc-answers .slots i b { opacity: 0; display: block; }
  .sc-answers.s-code .slots i b { animation: pop .2s var(--ease) forwards; animation-delay: calc(var(--n) * .1s); }
  .sc-answers.s-go2 .a2 { animation: stampin .16s cubic-bezier(.2,1.4,.4,1) .2s forwards; }
  .sc-answers.s-p3 .pk2, .sc-answers.s-p3 .bloom, .sc-answers.s-p3 .a2, .sc-answers.s-p3 .slots { opacity: 0 !important; transition: opacity .3s; animation: none; }
  .sc-answers .plate { fill: var(--ink); transform-box: fill-box; transform-origin: center; transform: scaleY(0); transition: transform .3s cubic-bezier(.34,1.56,.64,1) .7s; }
  .sc-answers.s-p3 .plate { transform: none; }
  .sc-answers.s-p3 .pk3 { animation: a3 1.1s cubic-bezier(.45,0,.2,1) .2s forwards; }
  .sc-answers.s-hit .pk3 .dot { background: var(--bad); box-shadow: 0 0 12px 3px rgba(180,35,24,.45); animation: squash .12s forwards; }
  .sc-answers.s-hit .plate { animation: shake .12s linear; } .sc-answers.s-hit .mark { opacity: .3; }
  .sc-answers.s-hit .a3 { animation: stampin .16s cubic-bezier(.2,1.4,.4,1) .15s forwards; }
  .sc-answers .stage { position: absolute; inset: 0; transition: transform .5s var(--sym), opacity .5s; }
  .sc-answers.s-sweep .stage { transform: translateX(-420px); opacity: 0; }
  .sc-answers .brand { position: absolute; left: 0; right: 0; top: 430px; text-align: center; opacity: 0; }
  .sc-answers .brand b { display: block; font-size: 56px; font-weight: 600; letter-spacing: -1px; line-height: 1; }
  .sc-answers .brand b i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--brand); margin-left: 4px; }
  .sc-answers .brand span { display: block; font-size: 24px; letter-spacing: .12em; color: rgba(16,24,40,.5); margin-top: 16px; }
  .sc-answers .brand em { display: block; font-style: normal; font-size: 20px; color: rgba(16,24,40,.45); margin-top: 40px; }
  .sc-answers.s-brand .brand { animation: land .5s var(--ease) forwards; }
  .sc-answers.s-out { opacity: 0; transition: opacity .6s; }
</style>
<div id="ground"></div><div id="night"></div>
<div id="win" class="off">
  <div id="chrome">
    <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    <span id="url">🔒 <b>login.xecurify.com</b>/admin/policies</span><span style="width:64px"></span>
  </div>
  <div id="vp"><iframe id="app" src="${appUrl}"></iframe></div>
</div>
<svg id="fx" viewBox="0 0 1920 1080" width="1920" height="1080"></svg>
<div id="scene"></div>
<div id="band"><div id="sub"></div></div>
<div id="ring"></div>
<div id="tip"></div>
<script>
  const $ = (s) => document.querySelector(s)
  const SVG = 'http://www.w3.org/2000/svg'
  const G = ${JSON.stringify(G)}
  const LAPTOP = ${JSON.stringify(LAPTOP)}
  const TICK = ${JSON.stringify(TICK)}
  const INDIA = ${JSON.stringify(INDIA)}
  const WORLD = ${JSON.stringify(WORLD)}

  const SC = {
    intro: () => {
      const pk = (cls, cap, extra = '') => '<div class="pk ' + cls + '" ' + extra + '><div class="dot"></div>' + (cap ? '<div class="cp">' + cap + '</div>' : '') + '</div>'
      const burst = ['Café wifi', 'Old browser', 'New phone', 'No screen lock', 'Windows 10', 'Rooted', 'Café wifi', 'Old browser', 'New phone', 'No screen lock']
      const delays = [0, .3, .55, .75, .92, 1.07, 1.2, 1.32, 1.44, 1.56]
      return '<div class="sc sc-intro"><div class="nightbg"></div>' +
        '<svg class="isvg" viewBox="0 0 1920 962"><line class="rail" x1="0" y1="481" x2="1920" y2="481"/><line class="wash" x1="960" y1="481" x2="1920" y2="481"/>' +
        '<g class="gates"><rect class="g g1" x="957" y="371" width="6" height="220" rx="3"/><rect class="g g2" x="957" y="371" width="6" height="220" rx="3"/><rect class="g g3" x="957" y="371" width="6" height="220" rx="3"/></g></svg>' +
        '<div class="pw">Password?<i></i></div>' +
        pk('pk1', 'Pune · known laptop', 'style="--d:.9s"') + pk('pk2', 'Unknown IP · rooted phone', 'style="--d:.8s"') + pk('pk3', 'Lagos · 3:12 am', 'style="--d:.7s"') +
        burst.map((c, i) => pk('pkb', c, 'style="--dl:' + delays[i] + 's"')).join('') +
        pk('pkh', 'Rooted phone · unknown IP') + pk('pkf', '') +
        '<div class="stamps"><span class="st1" style="top:462px">Allowed</span><span class="st2" style="top:490px">Allowed</span><span class="st3" style="top:518px">Allowed</span></div>' +
        '<div class="head">A password knows who typed it.<span>Not where. Not on what.</span></div>' +
        '<div class="glabels"><span class="l1">Where</span><span class="l2">Device</span><span class="l3">Who</span></div>' +
        '<div class="reads"><span class="r1">Pune office</span><span class="r2">Office laptop</span><span class="r3">Priya</span></div>' +
        '<div class="brand"><b>Xecurify</b><span>Policy engine</span></div></div>'
    },
    zone2: () => {
      const defs = '<defs><pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.5" fill="#c5ccd6"/></pattern>' +
        '<pattern id="dotsw" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.5" fill="#f0b9a4"/></pattern>' +
        '<pattern id="dotsf" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2" fill="rgba(197,204,214,.35)"/></pattern></defs>'
      const trav = (cls, ip, from, to, ctrl) => '<div class="trav ' + cls + '" style="offset-path: path(&quot;M' + from + ' Q ' + ctrl + ' ' + to + '&quot;)"><i></i><b>' + ip + '</b></div>'
      const pin = (cls, ip, x, y, inside) => '<div class="pin ' + cls + ' ' + (inside ? 'in' : 'out') + '" style="left:' + x + 'px;top:' + y + 'px"><div class="beam"></div><div class="ipl">' + ip + '</div><div class="rip"></div><div class="pd"></div><div class="ptk">' + TICK + '</div></div>'
      const rain = [[980, 600, 1], [1250, 380, 1], [1560, 640, 1], [320, 300, 0], [1700, 300, 0], [700, 760, 0]]
      return '<div class="sc sc-zone2">' +
        '<div class="title"><span class="kick">01 · Zone</span><h1>A named place.</h1></div>' +
        '<div class="crumb"><span class="c1">India</span><span class="c2">Maharashtra</span><span class="c3">Pune · 25 km</span></div>' +
        '<div class="layer l1"><svg viewBox="0 0 1920 962">' + defs + WORLD.map((d) => '<path class="land" d="' + d + '"/>').join('') + '<path d="' + INDIA + '" fill="#f3c9b8" opacity=".5" transform="translate(1120 520) scale(.32) translate(-1120 -520)"/></svg>' +
        trav('t1', '203.0.113.42', '430 330', '1120 520', '700 200') + trav('t2', '198.51.100.7', '1000 290', '1120 520', '1150 380') + trav('t3', '49.207.212.18', '1440 560', '1120 520', '1300 640') + '</div>' +
        '<div class="layer l2"><svg viewBox="0 0 1920 962">' + defs + '<path class="india" d="' + INDIA + '"/><circle class="mk" cx="1120" cy="520" r="8"/><text class="mkl" x="1140" y="528">Pune</text><circle class="mk" cx="1060" cy="500" r="6"/><text class="mkl" x="990" y="490">Mumbai</text></svg></div>' +
        '<div class="layer l3"><svg viewBox="0 0 1920 962">' + defs + '<rect class="grid" x="0" y="0" width="1920" height="962"/>' +
        '<circle class="ring" cx="1120" cy="520" r="300"/><line class="radial" x1="1120" y1="520" x2="1420" y2="520"/><circle class="mk" cx="1120" cy="520" r="9"/><text class="mkl" x="1140" y="512">Pune</text>' +
        '<line class="olink" x1="1420" y1="560" x2="1480" y2="600"/></svg>' +
        '<div class="km">0 km</div>' +
        '<div class="office">' + G.office + '</div><div class="olbl">Office network · 203.0.113.0/24</div>' +
        pin('p1', '49.207.212.18', 1180, 430, true) + pin('p2', '203.0.113.42', 1540, 620, true) + pin('p3', '198.51.100.7', 560, 720, false) +
        rain.map((r, i) => '<div class="rain ' + (r[2] ? 'in' : '') + '" style="left:' + r[0] + 'px;top:' + r[1] + 'px;--dl:' + (i * .22) + 's"></div>').join('') +
        '</div>' +
        '<div class="ztag tag">Pune office</div>' +
        '<div class="rules"><div class="rule">If <span class="slot">Pune office</span> → Allow</div><div class="rule">If not <span class="slot">Pune office</span> → Allow, after a second factor</div><div class="rule">If <span class="slot">Pune office</span> and not Office laptops → Deny</div></div>' +
        '</div>'
    },
    gate: () => {
      const ro = (cls, y, txt) => '<div class="ro ' + cls + '" style="top:' + y + 'px"><span class="rg">' + TICK + '</span>' + txt + '</div>'
      const sigs = [[860, 520], [1000, 500], [1085, 560], [935, 600], [1050, 630], [875, 640], [980, 555]]
      const order = [0, 1, 2, 4, 5, 3, 6, 0]
      const poly = order.map((i) => sigs[i].join(',')).join(' ')
      const sigsvg = (cls) => '<svg class="sig ' + cls + '" viewBox="0 0 1920 962"><polyline class="sl" points="' + poly + '"/>' + sigs.map(([x, y], i) => '<circle class="sd" cx="' + x + '" cy="' + y + '" r="7" style="--n:' + i + '"/>').join('') + '</svg>'
      return '<div class="sc sc-gate">' +
        '<div class="title"><span class="kick">02 · Device profile</span><h1>Two kinds. One word.</h1></div>' +
        '<div class="world">' +
        '<div class="st st1"><div class="lane"></div><div class="pcap caps">Health check</div><div class="portal"></div>' +
        '<div class="lap">' + LAPTOP + '</div><div class="lap xray">' + LAPTOP + '<div class="xg" style="left:66px;top:36px">OS</div><div class="xg" style="left:216px;top:36px">' + G.lock + '</div><div class="xg" style="left:66px;top:118px">' + G.shield + '</div><div class="xg" style="left:216px;top:118px">6.4</div></div>' +
        '<div class="beam"></div>' +
        '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 1920 962"><line class="lead" x1="896" y1="528" x2="1226" y2="313"/><line class="lead" x1="1046" y1="528" x2="1226" y2="393"/><line class="lead" x1="896" y1="610" x2="1226" y2="473"/><line class="lead" x1="1046" y1="610" x2="1226" y2="553"/></svg>' +
        ro('win', 300, 'OS · Windows 11') + ro('', 380, 'Screen lock · on') + ro('', 460, 'Integrity · intact') + ro('', 540, 'Authenticator · 6.4') +
        '<div class="floor"></div><div class="newer">Or newer →</div><div class="pbase"></div>' +
        '<div class="col c1"><span class="cv">11</span><span class="ok">' + TICK + '</span></div><div class="col c2"><span class="cv">14</span><span class="ok">' + TICK + '</span></div><div class="col c3"><span class="cv">10</span><span class="no">✕</span></div>' +
        '</div>' +
        '<div class="st st2"><div class="pcap caps">Trusted device</div><div class="portal"></div><div class="slot2"></div>' +
        '<div class="lap lap2">' + LAPTOP + '</div>' + sigsvg('live') + sigsvg('ghost') +
        '<div class="gcap">stored · first seen 12 Mar</div><div class="stampw"><b>Seen before</b></div>' +
        '</div></div>' +
        '<div class="final"><div class="fl fl1" style="top:400px"><span class="ic"></span>HEALTH · Office laptops</div><div class="fl fl2" style="top:480px"><span class="ic"></span>TRUSTED · Known laptops</div>' +
        '<div class="fcap caps">A rule hears one word</div><div class="wordw"><span class="y">match</span><span class="n">no match</span></div><div class="under"></div>' +
        '<div class="drop tag">Windows 10</div></div>' +
        '</div>'
    },
    rail: () => '<div class="sc sc-rail">' +
      '<div class="title"><span class="kick">03 · Outcome</span></div>' +
      '<div class="word w1">Allow</div><div class="word w2">Allow after a second factor</div><div class="word w3">Deny</div>' +
      '<svg class="rsvg" viewBox="0 0 1920 962"><path class="rl" d="M160 520 H1760"/>' +
      '<ellipse class="chk" cx="1180" cy="520" rx="13" ry="50"/>' +
      '<rect class="plate" x="1413" y="430" width="14" height="180" rx="4"/>' +
      '<circle class="bring" cx="1700" cy="520" r="48"/><g class="bloom"><circle class="bd" cx="1700" cy="520" r="48"/><path class="bt" d="M1682 520l12 12 24-26"/></g></svg>' +
      '<div class="usr">' + G.user + '</div><div class="utag">priya · password ok</div>' +
      '<div class="comet cm1"><div class="tail"></div><div class="core"></div></div><div class="comet cm2"><div class="tail"></div><div class="core"></div></div><div class="comet cm3"><div class="tail"></div><div class="core"></div></div>' +
      '<div class="pw pw1">password ✓</div><div class="pw pw2">password ✓</div><div class="pw pw3">password ✓</div>' +
      '<div class="phone"></div><div class="slots">' + '482913'.split('').map((d, i) => '<i style="--n:' + i + '"><b>' + d + '</b></i>').join('') + '</div><div class="flash"></div>' +
      '<div class="ymsg">your message</div><div class="msg">Use a company device.</div>' +
      '<div class="marks"><i class="m1"></i><i class="m2"></i><i class="m3"></i></div>' +
      '</div>',
    drop: () => {
      const shelf = (cls, label, mk) => '<div class="shelf ' + cls + '"><span class="lb">' + label + '</span><div class="ha"></div><div class="hb"></div><span class="mk ' + mk + '">' + (mk === 'allow' ? TICK : '') + '</span><span class="x">✕</span></div>'
      return '<div class="sc sc-drop">' +
        '<div class="title"><span class="kick">04 · Order</span><h1><span class="h1">Read from the top.</span><span class="h2">Swap two rules.</span><span class="h3">The default stays at the foot.</span></h1></div>' +
        '<svg class="dsvg" viewBox="0 0 1920 962"><line class="rl" x1="660" y1="110" x2="660" y2="822"/><line class="rl" x1="1260" y1="110" x2="1260" y2="822"/></svg>' +
        '<span class="num n1">1</span><span class="num n2">2</span><span class="num n3">3</span>' +
        shelf('sh1', 'Rooted or jailbroken', 'deny') + shelf('sh2', 'Office laptop in Pune', 'allow') + shelf('sh3', 'Everyone else', 'mfa') +
        '<div class="veil"></div><div class="dotted"></div>' +
        '<div class="floor"></div><div class="thring"></div><div class="lock">' + G.lock + '</div><div class="flbl">Nothing else matched</div>' +
        '<div class="read"></div>' +
        '<div class="btag t1">priya · Pune office · Office laptop</div><div class="btag t2">contractor · Berlin · unknown laptop</div>' +
        '<div class="ball b1">' + G.user + '</div><div class="ball b2 grey">' + G.user + '</div>' +
        '<div class="out o1">Allow</div><div class="out o2">Second factor</div><div class="out o3">Nothing else matched</div>' +
        '</div>'
    },
    answers: () => {
      const pk = (cls, cap) => '<div class="pk ' + cls + '"><div class="dot"></div><div class="cp">' + cap + '</div></div>'
      return '<div class="sc sc-answers"><div class="stage">' +
        '<svg class="asvg" viewBox="0 0 1920 962"><g class="setgrp"><line class="rail" x1="0" y1="481" x2="1920" y2="481"/>' +
        '<rect class="g" x="757" y="371" width="6" height="220" rx="3"/><rect class="g" x="957" y="371" width="6" height="220" rx="3"/><rect class="g" x="1157" y="371" width="6" height="220" rx="3"/>' +
        '<rect class="mark" x="1772" y="453" width="56" height="56" rx="12"/></g>' +
        '<line class="railgood" x1="1160" y1="481" x2="1800" y2="481"/>' +
        '<ellipse class="chk" cx="1420" cy="481" rx="13" ry="50"/><rect class="plate" x="1413" y="391" width="14" height="180" rx="4"/>' +
        '<g class="bloom"><circle class="bd" cx="1700" cy="481" r="48"/><path class="bt" d="M1682 481l12 12 24-26"/></g></svg>' +
        '<div class="glabels"><span class="l1">Where</span><span class="l2">Device</span><span class="l3">Who</span></div>' +
        pk('pk1', 'priya · Pune office · Office laptop') + pk('pk2', 'priya · hotel wifi · Office laptop') + pk('pk3', 'unknown laptop · unknown IP') +
        '<div class="phone"></div><div class="slots">' + '482913'.split('').map((d, i) => '<i style="--n:' + i + '"><b>' + d + '</b></i>').join('') + '</div>' +
        '<div class="ans a1">Allow</div><div class="ans a2">Allow, <span>after a second factor</span></div><div class="ans a3">Deny<span class="q">“Use a company device to sign in.”</span></div>' +
        '</div>' +
        '<div class="brand"><b>Xecurify<i></i></b><span>Policy engine</span><em>xecurify.com</em></div>' +
        '</div>'
    },
  }

  let kmTimer = null
  window.__st = {
    dark(on) { document.body.classList.toggle('dark', !!on) },
    win(state) { const w = $('#win'); w.classList.remove('off', 'sunk'); if (state && state !== 'on') w.classList.add(state) },
    zoom(scale, ox, oy) { const w = $('#win'); w.style.transformOrigin = (ox ?? 50) + '% ' + (oy ?? 40) + '%'; w.style.transform = scale === 1 ? '' : 'scale(' + scale + ')' },
    url(p) { $('#url').innerHTML = '🔒 <b>login.xecurify.com</b>' + p },
    sub(html) { const e = $('#sub'); if (!html) { e.classList.remove('on'); return } e.innerHTML = html; e.classList.add('on') },
    point(box, label, where) {
      const r = $('#ring'), t = $('#tip')
      if (!box) { r.classList.remove('on'); t.classList.remove('on'); return }
      const pad = 8
      r.style.left = (box.x - pad) + 'px'; r.style.top = (box.y - pad) + 'px'; r.style.width = (box.width + pad * 2) + 'px'; r.style.height = (box.height + pad * 2) + 'px'
      r.classList.add('on')
      if (!label) { t.classList.remove('on'); return }
      t.innerHTML = label; t.classList.add('on')
      const above = where === 'above'; t.classList.toggle('above', !above)
      const tw = t.offsetWidth, th = t.offsetHeight
      let x = box.x - pad; if (x + tw > 1880) x = 1880 - tw
      t.style.left = Math.max(40, x) + 'px'
      t.style.top = (above ? box.y - pad - th - 14 : box.y + box.height + pad + 14) + 'px'
    },
    scene(name, over) {
      const e = $('#scene'); document.body.classList.toggle('scened', !!name)
      if (kmTimer) { clearInterval(kmTimer); kmTimer = null }
      if (!name) { e.classList.remove('on'); setTimeout(() => { if (!e.classList.contains('on')) e.innerHTML = '' }, 450); return }
      e.innerHTML = SC[name](); e.classList.toggle('over', !!over); e.classList.add('on')
    },
    step(name, on) {
      const r = $('#scene .sc'); if (!r) return
      r.classList.toggle('s-' + name, on !== false)
      /* the km counter, the one piece of JS a scene needs */
      if (name === 'z3' && on !== false) { const k = r.querySelector('.km'); let v = 0; setTimeout(() => { kmTimer = setInterval(() => { v += 1; if (k) k.textContent = v + ' km'; if (v >= 25) { clearInterval(kmTimer); kmTimer = null } }, 36) }, 1300) }
    },
    sc(sel, name, on) { document.querySelectorAll('#scene ' + sel).forEach((el) => el.classList.toggle(name, on !== false)) },
    scss(sel, prop, val) { document.querySelectorAll('#scene ' + sel).forEach((el) => el.style.setProperty(prop, val)) },
    bar(x, y, w, h) { const svg = $('#fx'); let b = svg.querySelector('#bar'); if (!b) { b = document.createElementNS(SVG, 'rect'); b.id = 'bar'; b.setAttribute('class', 'bar'); svg.appendChild(b) } b.setAttribute('x', x); b.setAttribute('width', w); b.setAttribute('height', h); b.setAttribute('y', 0); b.setAttribute('rx', 10); b.style.transform = 'translateY(' + y + 'px)'; requestAnimationFrame(() => b.classList.add('on')) },
    clearFx() { $('#fx').innerHTML = '' },
  }
</script>`
