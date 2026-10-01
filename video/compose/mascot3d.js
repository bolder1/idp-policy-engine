/* -----------------------------------------------------------------------------
   The orange, in three dimensions.

   A procedural character built from primitives — a peel-textured sphere for the
   head, extruded leaves, dark glossy eyes with a catchlight, a raised brow, the
   keyhole nose, a mouth that opens with the voice, a black jacket over a white
   hoodie, capsule arms with a pointing finger and a thumbs-up, legs and
   sneakers — lit like a product shot and rendered by WebGL into a transparent
   canvas that sits in the compositor where the picture used to be.

   Same contract as compose/mascot.js (window.MASCOT), so engine.js can use
   either:  init · stateAt · render · headPoint · fingertip.
   Screen mapping is orthographic — one world unit is one pixel, y down — so a
   state's (x, y, size) place the character exactly like the 2D rig did, and the
   3D depth only adds shading and a turn of the head.

   Pure function of time: stateAt() derives every pose from (t, keys); render()
   paints it. Noise for the peel is seeded. No timers.
   -------------------------------------------------------------------------- */
import * as THREE from '/vendor/three/build/three.module.js'
import { RoundedBoxGeometry } from '/vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js'

const C = window.COMPOSE || {}
const clamp = C.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)))
const lerp = C.lerp || ((a, b, t) => a + (b - a) * t)
const easeInOut = C.easeInOut || ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
const easeOut = C.easeOut || ((t) => 1 - Math.pow(1 - t, 3))
const easeIn = C.easeIn || ((t) => t * t * t)
const easeOutBack =
  C.easeOutBack ||
  ((t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  })

const W = 1920
const H = 1080
const RATIO = 0.66 // width / height of the standing character
const EMOTE_LIFE = 1.3
/* landmarks in unit space: x toward the facing side, y up from the feet */
const LM = {
  head: { x: 0.0, y: 0.73 },
  headTop: { x: 0.0, y: 1.0 },
  finger: { x: 0.44, y: 0.5 }, // tip of the pointing hand, arm out to the facing side
  handUp: { x: -0.28, y: 0.62 }, // the thumbs-up hand
}

const COL = {
  orange: 0xf37a1e,
  orangeDark: 0xdc5f14,
  peelHi: 0xff9a3d,
  leaf: 0x3fae4f,
  leafDark: 0x2e8b3b,
  ink: 0x1b1f24,
  brow: 0x24160e,
  eye: 0x2b160c,
  mouth: 0x4d160f,
  tongue: 0xe0524a,
  teeth: 0xfff7ee,
  white: 0xf4f4f4,
  brand: 0xeb5424,
  sole: 0xeb5424,
}

let root = null
let el = {}
let R = null // renderer bits
let CH = null // character parts
let blinks = []
let lastSeed = null
let ready = false

/* --- seeded helpers --------------------------------------------------------- */
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
function blinkTimes(seed) {
  if (lastSeed === seed && blinks.length) return blinks
  const r = rng(seed * 7919 + 13)
  const out = []
  let t = 1.1 + r() * 2
  while (t < 1200) {
    out.push(t)
    if (r() < 0.1) out.push(t + 0.26)
    t += 3 + r() * 2
  }
  blinks = out
  lastSeed = seed
  return out
}
function blinkAt(t, seed, slow = 1) {
  let k = 0
  for (const b of blinkTimes(seed)) {
    const dt = (t - b) / slow
    if (dt < -0.01) break
    if (dt >= 0 && dt < 0.06) k = Math.max(k, dt / 0.06)
    else if (dt >= 0.06 && dt < 0.15) k = Math.max(k, 1 - (dt - 0.06) / 0.09)
  }
  return k
}

/* a soft peel: low-frequency seeded noise, used as a bump map */
function peelTexture(seed) {
  const n = 128
  const r = rng(seed)
  const data = new Uint8Array(n * n * 4)
  // value noise: a coarse grid, bilinear
  const g = 16
  const grid = new Float32Array((g + 1) * (g + 1))
  for (let i = 0; i < grid.length; i++) grid[i] = r()
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx = (x / n) * g
      const gy = (y / n) * g
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const fx = gx - x0
      const fy = gy - y0
      const at = (i, j) => grid[(j % g) * (g + 1) + (i % g)]
      const v = lerp(lerp(at(x0, y0), at(x0 + 1, y0), fx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy)
      const fine = 0.5 + 0.5 * Math.sin(x * 1.7 + y * 2.3) * Math.sin(x * 0.9 - y * 1.1)
      const val = Math.round(255 * (0.55 + 0.35 * v + 0.1 * fine))
      const o = (y * n + x) * 4
      data[o] = data[o + 1] = data[o + 2] = val
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, n, n)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3)
  tex.needsUpdate = true
  return tex
}

function shadowTexture() {
  const n = 128
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - n / 2) / (n / 2)
      const dy = (y - n / 2) / (n / 2)
      const d = Math.sqrt(dx * dx + dy * dy)
      const a = clamp(1 - d, 0, 1)
      const o = (y * n + x) * 4
      data[o] = data[o + 1] = data[o + 2] = 10
      data[o + 3] = Math.round(255 * a * a * 0.55)
    }
  }
  const tex = new THREE.DataTexture(data, n, n)
  tex.needsUpdate = true
  return tex
}

/* --- the character ------------------------------------------------------------ */
function capsule(r, len, mat) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat)
}
function rbox(w, h, d, radius, mat) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), mat)
}

function buildCharacter(seed) {
  const orange = new THREE.MeshStandardMaterial({ color: COL.orange, roughness: 0.62, metalness: 0, bumpMap: peelTexture(seed), bumpScale: 0.006 })
  const orangeFlat = new THREE.MeshStandardMaterial({ color: COL.orange, roughness: 0.6 })
  const orangeDark = new THREE.MeshStandardMaterial({ color: COL.orangeDark, roughness: 0.55 })
  const leaf = new THREE.MeshStandardMaterial({ color: COL.leaf, roughness: 0.5 })
  const leafDark = new THREE.MeshStandardMaterial({ color: COL.leafDark, roughness: 0.5 })
  const ink = new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.85 })
  const white = new THREE.MeshStandardMaterial({ color: COL.white, roughness: 0.75 })
  const brand = new THREE.MeshStandardMaterial({ color: COL.brand, roughness: 0.6 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: COL.eye, roughness: 0.25, metalness: 0.05 })
  const browMat = new THREE.MeshStandardMaterial({ color: COL.brow, roughness: 0.7 })
  const hi = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const mouthMat = new THREE.MeshBasicMaterial({ color: COL.mouth })
  const tongueMat = new THREE.MeshBasicMaterial({ color: COL.tongue })
  const teethMat = new THREE.MeshBasicMaterial({ color: COL.teeth })

  const body = new THREE.Group() // feet at y = 0, height 1

  // ground contact shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }))
  sh.rotation.x = -Math.PI / 2
  sh.position.set(0, 0.004, 0.02)
  body.add(sh)

  // legs + sneakers
  const legs = []
  for (const s of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(s * 0.085, 0.24, 0)
    const leg = capsule(0.052, 0.13, ink)
    leg.position.set(0, -0.09, 0)
    hip.add(leg)
    const shoe = new THREE.Group()
    shoe.position.set(0, -0.2, 0.03)
    const sole = rbox(0.13, 0.03, 0.2, 0.012, brand)
    sole.position.set(0, -0.02, 0)
    const upper = rbox(0.125, 0.07, 0.19, 0.03, white)
    upper.position.set(0, 0.02, 0)
    const cap = rbox(0.125, 0.05, 0.09, 0.025, ink)
    cap.position.set(0, 0.035, 0.055)
    shoe.add(sole, upper, cap)
    hip.add(shoe)
    body.add(hip)
    legs.push(hip)
  }

  // torso: jacket over hoodie, trims, backpack
  const torso = new THREE.Group()
  torso.position.set(0, 0.37, 0)
  const jacket = rbox(0.36, 0.32, 0.22, 0.07, ink)
  const hoodie = rbox(0.15, 0.27, 0.235, 0.05, white)
  hoodie.position.set(0, -0.01, 0.0)
  const hem = rbox(0.365, 0.022, 0.225, 0.008, brand)
  hem.position.set(0, -0.155, 0)
  const zipL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.26, 0.004), brand)
  zipL.position.set(-0.078, -0.01, 0.118)
  const zipR = zipL.clone()
  zipR.position.x = 0.078
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), brand)
  logo.position.set(0.12, 0.06, 0.113)
  const logoIn = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), ink)
  logoIn.position.set(0.12, 0.06, 0.114)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.034, 12, 28, Math.PI), brand)
  collar.rotation.x = Math.PI / 2
  collar.rotation.z = Math.PI
  collar.position.set(0, 0.16, 0.03)
  const pack = rbox(0.28, 0.27, 0.11, 0.05, ink)
  pack.position.set(0, -0.01, -0.14)
  const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.012), ink)
  strapL.position.set(-0.11, 0.0, 0.11)
  const strapR = strapL.clone()
  strapR.position.x = 0.11
  torso.add(jacket, hoodie, hem, zipL, zipR, logo, logoIn, collar, pack, strapL, strapR)
  body.add(torso)

  // arms: shoulder pivots; a pointing hand and a thumbs-up hand
  const arms = {}
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(s * 0.2, 0.49, 0.01)
    const sleeve = capsule(0.047, 0.15, ink)
    sleeve.position.set(0, -0.09, 0)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), brand)
    cuff.position.set(0, -0.175, 0)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.056, 24, 18), orangeFlat)
    hand.position.set(0, -0.215, 0)
    hand.scale.set(1, 0.95, 0.85)
    shoulder.add(sleeve, cuff, hand)
    // digits: a finger to point with, a thumb to raise
    const finger = capsule(0.017, 0.055, orangeFlat)
    finger.position.set(0, -0.28, 0.005)
    finger.visible = false
    const thumb = capsule(0.015, 0.045, orangeFlat)
    thumb.position.set(s * -0.03, -0.17, 0.045)
    thumb.rotation.z = s * 0.3
    thumb.visible = false
    shoulder.add(finger, thumb)
    body.add(shoulder)
    arms[s] = { shoulder, finger, thumb, hand }
  }

  // head
  const head = new THREE.Group()
  head.position.set(0, 0.72, 0)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 48, 32), orange)
  skull.scale.set(1, 0.97, 0.98)
  head.add(skull)

  // leaves
  const leafShape = new THREE.Shape()
  leafShape.moveTo(0, 0)
  leafShape.quadraticCurveTo(0.075, 0.05, 0.02, 0.16)
  leafShape.quadraticCurveTo(-0.06, 0.06, 0, 0)
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 })
  const leaf1 = new THREE.Mesh(leafGeo, leaf)
  leaf1.position.set(0.07, 0.235, -0.02)
  leaf1.rotation.set(-0.3, 0.2, -0.55)
  const leaf2 = new THREE.Mesh(leafGeo, leafDark)
  leaf2.position.set(0.11, 0.22, -0.03)
  leaf2.rotation.set(-0.5, 0.4, 0.35)
  leaf2.scale.set(0.8, 0.8, 0.8)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 10), leafDark)
  stem.position.set(0.09, 0.245, -0.02)
  head.add(leaf1, leaf2, stem)

  // eyes, catchlights, lids
  const eyes = {}
  for (const s of [-1, 1]) {
    const ex = s * 0.1
    const ey = 0.035
    const ez = Math.sqrt(Math.max(0, 0.27 * 0.27 - ex * ex - ey * ey)) - 0.012
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 28, 20), eyeMat)
    eye.position.set(ex, ey, ez)
    eye.scale.set(0.88, 1.12, 0.55)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), hi)
    glint.position.set(ex - 0.014, ey + 0.022, ez + 0.032)
    const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), hi)
    glint2.position.set(ex + 0.016, ey - 0.014, ez + 0.03)
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 18), orangeFlat)
    lid.position.set(ex, ey + 0.09, ez - 0.002)
    lid.scale.set(0.95, 1.05, 0.62)
    lid.visible = false
    head.add(eye, glint, glint2, lid)
    eyes[s] = { eye, glint, glint2, lid, base: { x: ex, y: ey, z: ez } }
  }

  // brows: the facing-side brow sits higher and steeper, as in the art
  const brows = {}
  for (const s of [-1, 1]) {
    const pts = s < 0 ? [new THREE.Vector3(-0.155, 0.105, 0.215), new THREE.Vector3(-0.1, 0.13, 0.235), new THREE.Vector3(-0.045, 0.115, 0.245)] : [new THREE.Vector3(0.045, 0.1, 0.245), new THREE.Vector3(0.1, 0.14, 0.235), new THREE.Vector3(0.16, 0.12, 0.21)]
    const curve = new THREE.CatmullRomCurve3(pts)
    const brow = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.014, 10, false), browMat)
    head.add(brow)
    brows[s] = brow
  }

  // keyhole nose
  const nose = new THREE.Group()
  nose.position.set(0.0, -0.015, 0.262)
  const noseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 24), orangeDark)
  noseTop.rotation.x = Math.PI / 2
  noseTop.position.set(0, 0.012, 0)
  const noseBot = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.022), orangeDark)
  noseBot.position.set(0, -0.026, 0)
  nose.add(noseTop, noseBot)
  head.add(nose)

  // mouth: a closed smile, or an opening that follows the voice
  const mouth = new THREE.Group()
  const mx = -0.035
  const my = -0.095
  const mz = Math.sqrt(Math.max(0, 0.27 * 0.27 - mx * mx - my * my)) - 0.004
  mouth.position.set(mx, my, mz)
  mouth.lookAt(new THREE.Vector3(mx * 3, my * 3, mz * 3))
  const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.06, 0.012, 0), new THREE.Vector3(0, -0.028, 0.004), new THREE.Vector3(0.06, 0.012, 0))
  const smile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 16, 0.007, 8, false), mouthMat)
  const open = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), mouthMat)
  open.position.z = 0.002
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), tongueMat)
  tongue.position.set(0, -0.016, 0.003)
  const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.016), teethMat)
  teeth.position.set(0, 0.027, 0.003)
  mouth.add(smile, open, tongue, teeth)
  head.add(mouth)
  body.add(head)

  return { body, head, skull, torso, arms, legs, eyes, brows, mouthParts: { smile, open, tongue, teeth }, shadow: sh }
}

/* --- setup ----------------------------------------------------------------------- */
export function init(rootEl, rig, { seed = 7 } = {}) {
  root = rootEl
  root.innerHTML = `<canvas class="m3-canvas" width="${W}" height="${H}"></canvas><div class="m-emote"></div><div class="m3-badge"></div>`
  const canvas = root.querySelector('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, -3000, 3000)
  camera.position.set(0, 0, 1500)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c2cc, 0.9))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(-600, 900, 1200)
  const fill = new THREE.DirectionalLight(0xffe9dc, 0.55)
  fill.position.set(900, 200, 800)
  const rim = new THREE.DirectionalLight(0xffffff, 0.7)
  rim.position.set(200, 600, -900)
  scene.add(key, fill, rim)

  CH = buildCharacter(seed)
  const pivot = new THREE.Group() // at the body's centre; rotation lives here
  const squash = new THREE.Group() // at the feet; squash lives here
  squash.position.set(0, -0.5, 0)
  squash.add(CH.body)
  pivot.add(squash)
  scene.add(pivot)

  R = { renderer, scene, camera, pivot, squash }
  el = { emote: root.querySelector('.m-emote'), badge: root.querySelector('.m3-badge'), canvas }
  ready = true
  return canvas
}

/* --- poses (the same solver as the 2D rig, with 3D landmarks) ------------------------- */
const widthOf = (size) => size * RATIO

function fingerOffset(size, face) {
  const dir = face === 'left' ? -1 : 1
  return { dx: dir * LM.finger.x * size, dy: -LM.finger.y * size }
}

function restOf(k, prev) {
  const size = k.size ?? prev?.size ?? 300
  const w = widthOf(size)
  const face = k.face ?? prev?.face ?? 'right'
  switch (k.pose) {
    case 'lie':
      return { cx: k.x, cy: k.y - w / 2, rot: face === 'left' ? -90 : 90, size, face, lying: true }
    case 'jump': {
      const f = fingerOffset(size, face)
      return { cx: k.x - f.dx, cy: k.y - f.dy - size / 2, rot: 0, size, face, lying: false }
    }
    case 'hide':
      return { cx: k.x, cy: k.y + size * 0.6, rot: 0, size, face, lying: false, hidden: true }
    default:
      return { cx: k.x, cy: k.y - size / 2, rot: 0, size, face, lying: false }
  }
}

function spring(t, amp = 0.14, freq = 4, decay = 0.18) {
  if (t < 0) return 0
  return amp * Math.exp(-t / decay) * Math.cos(2 * Math.PI * freq * t)
}

export function stateAt(t, keys, { talkOpen = 0, wordOnsets = [], seed = 1, screen = null, emote = null } = {}) {
  if (!keys || !keys.length) return { hidden: true }
  let i = -1
  for (let n = 0; n < keys.length; n++) if (keys[n].t <= t) i = n
  if (i < 0) return { hidden: true }
  const k = keys[i]
  let prevRest = null
  for (let n = 0; n <= i - 1; n++) prevRest = restOf(keys[n], prevRest)
  const rest = restOf(k, prevRest)
  const from = prevRest ?? { ...rest, cy: rest.cy + rest.size * 0.8, hidden: true }
  const secs = Math.max(0.01, k.seconds ?? 0.6)
  const dt = t - k.t
  const p = clamp(dt / secs, 0, 1)

  let cx
  let cy
  let rot
  let size
  let sx = 1
  let sy = 1
  let alpha = 1
  let squint = 0
  let blinkSlow = 1
  let hidden = false
  let selfEmote = null
  let arm = 'rest' // rest · point · cheer · think · lie
  let armK = 1
  let yawTo = null // screen point the head turns toward

  switch (k.pose) {
    case 'jump': {
      const T = secs
      if (dt < T) {
        const q = easeInOut(p)
        const fx = from.cx
        const fy = from.cy + (from.lying ? widthOf(from.size) / 2 : from.size / 2)
        const tx = rest.cx
        const ty = rest.cy + rest.size / 2
        const apex = Math.abs(fy - ty) / 2 + 120
        const feetX = lerp(fx, tx, q)
        const feetY = lerp(fy, ty, q) - apex * 4 * q * (1 - q)
        size = lerp(from.size, rest.size, q)
        cx = feetX
        cy = feetY - size / 2
        rot = lerp(from.lying ? from.rot : 0, 0, clamp(dt / 0.25, 0, 1))
        if (dt < 0.12) {
          sy = lerp(1, 0.92, easeOut(dt / 0.12))
          sx = 1 + (1 - sy) * 0.6
        } else {
          sy = 1.06
          sx = 0.97
        }
        arm = 'point'
        armK = clamp((dt - 0.12) / 0.3, 0, 1)
      } else {
        const s = spring(dt - T)
        cx = rest.cx
        cy = rest.cy
        size = rest.size
        rot = 0
        sy = 1 - s
        sx = 1 + s * 0.7
        squint = 0.35 * clamp(1 - (dt - T) / 0.6, 0, 1)
        arm = 'point'
      }
      break
    }
    case 'peek': {
      const q = easeOutBack(p)
      cx = rest.cx
      cy = lerp(rest.cy + rest.size * 1.05, rest.cy, q)
      size = rest.size
      rot = 0
      break
    }
    case 'hide': {
      const q = easeIn(p)
      cx = from.cx
      cy = from.cy + q * from.size * 1.2
      size = from.size
      rot = from.rot
      alpha = 1 - q
      hidden = p >= 1
      break
    }
    default: {
      const q = easeInOut(p)
      cx = lerp(from.cx, rest.cx, q)
      cy = lerp(from.cy, rest.cy, q)
      size = lerp(from.size, rest.size, q)
      rot = lerp(from.rot, rest.rot, q)
      alpha = from.hidden ? clamp(p * 3, 0, 1) : 1
      if (p >= 1 && !rest.lying) {
        const s = spring(dt - secs, 0.05, 3.2, 0.16)
        sy = 1 - s
        sx = 1 + s * 0.6
      }
      if (k.pose === 'point') {
        arm = 'point'
        armK = easeOut(p)
        yawTo = k.toward ?? null
        squint = 0.18
        const dir = k.toward ? Math.sign(k.toward.x - rest.cx) || 1 : rest.face === 'left' ? -1 : 1
        rot += 5 * dir * easeOut(p)
      }
      if (k.pose === 'think') {
        arm = 'think'
        armK = easeOut(p)
        rot += -5 * easeOut(p)
        blinkSlow = 1.8
        squint = 0.12
      }
      if (k.pose === 'cheer') {
        const b = clamp(dt / 0.8, 0, 1)
        const hop = Math.abs(Math.sin(Math.PI * 2 * b)) * 42 * (1 - b * 0.6)
        cy -= hop
        const s = Math.sin(Math.PI * 4 * b) * 0.05
        sy = 1 + s
        sx = 1 - s * 0.6
        squint = 0.5
        arm = 'cheer'
        armK = easeOut(clamp(dt / 0.35, 0, 1))
        if (dt < EMOTE_LIFE) selfEmote = { glyph: 'sparkle', k: dt / EMOTE_LIFE }
      }
      if (k.pose === 'lie') arm = 'lie'
    }
  }

  if (!rest.lying && k.pose !== 'jump' && k.pose !== 'hide') {
    cy += 3 * Math.sin(2 * Math.PI * 0.45 * t)
    sy *= 1 + 0.012 * Math.sin(2 * Math.PI * 0.3 * t)
  }
  let nod = 0
  for (const o of wordOnsets) {
    const d = t - o
    if (d >= 0 && d < 0.25) nod += 1.5 * Math.sin(Math.PI * (d / 0.25)) * (1 - d / 0.25)
  }
  const blink = Math.max(blinkAt(t, seed, blinkSlow), squint)

  return {
    hidden: hidden || !!rest.hidden,
    x: cx,
    y: cy + size / 2,
    cx,
    cy,
    size,
    w: widthOf(size),
    rot,
    sx,
    sy,
    alpha,
    face: rest.face,
    lying: rest.lying,
    blink,
    nod,
    sway: 0.05 * Math.sin(2 * Math.PI * 0.21 * t + 1),
    mouthOpen: clamp(talkOpen, 0, 1),
    arm,
    armK,
    yawTo,
    screen,
    emote: emote ?? selfEmote,
  }
}

/* --- geometry: a unit-space point (x toward the facing side, y up from the feet) → screen */
export function localToScreen(st, ux, uy) {
  const dir = st.face === 'left' ? -1 : 1
  const size = st.size
  const fx = st.cx
  const fy = st.cy + size / 2
  let px = fx + dir * ux * size * st.sx
  let py = fy - uy * size * st.sy
  const a = (st.rot * Math.PI) / 180
  const cxp = st.cx
  const cyp = st.cy
  const rx = px - cxp
  const ry = py - cyp
  return { x: cxp + rx * Math.cos(a) - ry * Math.sin(a), y: cyp + rx * Math.sin(a) + ry * Math.cos(a) }
}
export const headPoint = (st) => (st && !st.hidden ? localToScreen(st, LM.head.x, LM.head.y) : { x: 0, y: 0 })
export const fingertip = (st) => (st && !st.hidden ? localToScreen(st, LM.finger.x, LM.finger.y) : { x: 0, y: 0 })

/* --- painting ------------------------------------------------------------------------ */
const EMOTES = {
  '!': `<span class="m-badge">!</span>`,
  '?': `<span class="m-badge">?</span>`,
  '✓': `<span class="m-badge m-badge--ok"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>`,
  '♪': `<span class="m-badge m-badge--note">♪</span>`,
  sparkle: `<svg class="m-sparkle" viewBox="0 0 120 80" width="120" height="80"><path d="M30 10 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" fill="#eb5424"/><path d="M78 6 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z" fill="#f5c452"/><path d="M62 44 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5z" fill="#eb5424"/></svg>`,
  heart: `<span class="m-badge m-badge--heart">♥</span>`,
}
const SCREENS = {
  allow: `<span class="m3-verdict is-allow"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>ALLOW</span>`,
  mfa: `<span class="m3-verdict is-mfa"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>2ND FACTOR</span>`,
  deny: `<span class="m3-verdict is-deny"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>DENY</span>`,
}

let lastEmoteKey = null
let lastScreenKey = null

export function render(st) {
  if (!ready) return
  if (!st || st.hidden) {
    root.style.display = 'none'
    return
  }
  root.style.display = ''
  const { renderer, scene, camera, pivot, squash } = R
  const size = st.size
  const dir = st.face === 'left' ? -1 : 1

  // place: centre → pivot; rotation about the centre; squash about the feet
  pivot.position.set(st.cx, -st.cy, 0)
  pivot.rotation.set(0, 0, (-st.rot * Math.PI) / 180)
  pivot.scale.set(size, size, size)
  squash.scale.set(st.sx, st.sy, 1)

  // the body turns three-quarters toward the side it faces, plus a slow sway
  const yawBase = dir * 0.42 + st.sway
  CH.body.rotation.y = yawBase

  // the head looks at what is being pointed at, and nods on words
  let headYaw = 0
  let headPitch = 0
  if (st.yawTo) {
    const hp = headPoint(st)
    const dx = st.yawTo.x - hp.x
    const dy = st.yawTo.y - hp.y
    headYaw = clamp(dx / 900, -0.45, 0.45)
    headPitch = clamp(dy / 900, -0.25, 0.35)
  }
  CH.head.rotation.set(headPitch + (st.nod * Math.PI) / 180 * 2.5, headYaw, 0)

  // eyelids and catchlights
  for (const s of [-1, 1]) {
    const e = CH.eyes[s]
    const b = st.blink
    e.lid.visible = b > 0.02
    e.lid.position.y = e.base.y + 0.09 * (1 - b)
    e.glint.position.x = e.base.x - 0.014 + headYaw * 0.02
    e.glint.position.y = e.base.y + 0.022 - headPitch * 0.02
  }

  // mouth
  const m = CH.mouthParts
  const open = st.mouthOpen
  if (open < 0.08) {
    m.smile.visible = true
    m.open.visible = m.tongue.visible = m.teeth.visible = false
  } else {
    m.smile.visible = false
    m.open.visible = m.tongue.visible = m.teeth.visible = true
    const oy = 0.25 + 0.75 * open
    const ox = 0.7 + 0.3 * open
    m.open.scale.set(ox, oy, 1)
    m.tongue.scale.set(ox * 0.9, oy * 0.8, 1)
    m.tongue.position.y = -0.03 * oy
    m.teeth.position.y = 0.042 * oy
    m.teeth.scale.set(ox, oy * 0.6, 1)
  }

  // arms
  const armsPose = (mode, k) => {
    const near = CH.arms[dir] // the arm on the facing side
    const far = CH.arms[-dir]
    for (const a of [near, far]) {
      a.finger.visible = false
      a.thumb.visible = false
    }
    // rest: near arm hangs a little forward, far hand tucked
    let nearZ = dir * -0.25
    let nearX = 0.15
    let farZ = dir * 0.35
    let farX = -0.1
    if (mode === 'point') {
      nearZ = lerp(dir * -0.25, dir * -1.45, k)
      nearX = lerp(0.15, -0.35, k)
      near.finger.visible = k > 0.5
      farZ = lerp(dir * 0.35, dir * 1.0, k)
      farX = lerp(-0.1, -0.6, k)
      far.thumb.visible = k > 0.5
    } else if (mode === 'cheer') {
      nearZ = lerp(dir * -0.25, dir * -2.6, k)
      farZ = lerp(dir * 0.35, dir * 2.6, k)
      nearX = farX = lerp(0.1, -0.3, k)
      near.thumb.visible = far.thumb.visible = k > 0.5
    } else if (mode === 'think') {
      nearZ = lerp(dir * -0.25, dir * -0.9, k)
      nearX = lerp(0.15, -1.6, k) // hand up to the chin
      farZ = dir * 0.4
      farX = -0.1
    } else if (mode === 'lie') {
      nearZ = dir * -0.6
      nearX = -0.4
      farZ = dir * 0.5
      farX = -0.3
    }
    near.shoulder.rotation.set(nearX, 0, nearZ)
    far.shoulder.rotation.set(farX, 0, farZ)
  }
  armsPose(st.arm, st.armK)

  // legs: a small stance
  CH.legs[0].rotation.set(0, 0, 0.06)
  CH.legs[1].rotation.set(0, 0, -0.06)
  CH.shadow.visible = !st.lying
  CH.shadow.material.opacity = st.alpha

  // fade: scale the materials' opacity would be costly; use the canvas alpha
  el.canvas.style.opacity = String(clamp(st.alpha, 0, 1))

  // draw only where the character is
  renderer.setScissorTest(false)
  renderer.clear()
  const pad = size * 0.3
  const bx = Math.max(0, st.cx - size * 0.75 - pad)
  const by = Math.max(0, st.cy - size * 0.75 - pad)
  const bw = Math.min(W - bx, size * 1.5 + pad * 2)
  const bh = Math.min(H - by, size * 1.5 + pad * 2)
  renderer.setScissorTest(true)
  renderer.setScissor(bx, H - by - bh, bw, bh)
  renderer.render(scene, camera)
  renderer.setScissorTest(false)

  // emote above the head
  const em = st.emote
  if (em && em.glyph && EMOTES[em.glyph]) {
    if (lastEmoteKey !== em.glyph) {
      el.emote.innerHTML = EMOTES[em.glyph]
      lastEmoteKey = em.glyph
    }
    const kk = clamp(em.k, 0, 1)
    const pop = easeOutBack(clamp(kk / 0.25, 0, 1))
    const fade = 1 - clamp((kk - 0.55) / 0.45, 0, 1)
    const head = headPoint(st)
    const top = localToScreen(st, LM.headTop.x, LM.headTop.y)
    const ex = head.x + dir * size * 0.14
    const ey = top.y - 14 - kk * 10
    el.emote.style.display = ''
    el.emote.style.transform = `translate(${ex - 60}px, ${ey - 80}px) scale(${pop.toFixed(3)})`
    el.emote.style.opacity = String(fade)
  } else el.emote.style.display = 'none'

  // the verdict badge floats above the thumbs-up hand
  const scr = st.screen
  if (scr && SCREENS[scr]) {
    if (lastScreenKey !== scr) {
      el.badge.innerHTML = SCREENS[scr]
      lastScreenKey = scr
    }
    const hp = localToScreen(st, LM.handUp.x, LM.handUp.y)
    el.badge.style.display = ''
    el.badge.style.transform = `translate(${hp.x}px, ${hp.y - size * 0.16}px) translate(-50%, -100%)`
  } else el.badge.style.display = 'none'
}

window.MASCOT3D = { init, stateAt, render, headPoint, fingertip, localToScreen }
window.dispatchEvent(new Event('mascot3d-ready'))
