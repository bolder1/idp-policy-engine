/* The stage shell for the third cut: the page the camera films. Styles and
   page code live in stage3.css / stage3.js (plain files, no escaping). */
import fs from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dirname
export const APP_W = 1440
export const APP_H = 760
export const SCALE = 1.2
export const WIN = { x: 96, y: 34, w: Math.round(APP_W * SCALE), h: Math.round(APP_H * SCALE) + 40, chrome: 40 }

/* A rough India, only ever drawn as dots — the dot matrix makes the rough edge read as a style. */
const INDIA = 'M1040 110 L1100 150 L1150 232 L1214 300 L1292 328 L1352 300 L1432 292 L1470 332 L1420 380 L1360 402 L1330 452 L1298 470 L1250 472 L1224 522 L1200 600 L1160 700 L1120 792 L1092 830 L1060 782 L1022 682 L992 592 L962 512 L902 432 L862 372 L882 322 L932 302 L952 242 L982 172 L1010 130 Z'

export const html = (appUrl) => {
  const css = fs.readFileSync(path.join(HERE, 'stage3.css'), 'utf8')
  const js = fs.readFileSync(path.join(HERE, 'stage3.js'), 'utf8')
  return `<!doctype html><meta charset="utf-8"><title>stage</title>
<style>:root{--wx:${WIN.x}px;--wy:${WIN.y}px;--ww:${WIN.w}px;--wh:${WIN.h}px;--wc:${WIN.chrome}px}
#vp{width:${WIN.w}px;height:${WIN.h - WIN.chrome}px}#app{width:${APP_W}px;height:${APP_H}px;transform:scale(${SCALE})}
${css}</style>
<body class="warm">
<div id="dark"><div class="bloom bb"></div><div class="bloom bo"></div></div>
<div id="light"><div class="bloom lb1"></div><div class="bloom lb2"></div></div>
<div id="persp"><div id="hold" class="off"><div id="win"><div id="chrome"><div class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div id="url"></div><div style="width:52px"></div></div>
<div id="vp">${appUrl ? `<iframe id="app" src="${appUrl}"></iframe>` : ''}</div></div></div></div>
<div id="scene"></div>
<div id="vig"></div><div id="grain"></div>
<div id="cap"></div>
<script>window.__WIN=${JSON.stringify(WIN)};window.__INDIA=${JSON.stringify(INDIA)}</script>
<script>${js}</script>`
}
