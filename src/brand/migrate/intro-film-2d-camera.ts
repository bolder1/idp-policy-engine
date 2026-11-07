/* The 2D Explainer's camera (intro-film-2d.tsx). Owner, 6 Nov 2026: "a little more isometric with a pan camera,
   but the content and readability first; the camera traces the eye from one place to another; transitions as simple
   and smooth as you can".

   - One path, not stop and go: every value runs through a monotone cubic over its keyframes, so the camera keeps its
     speed through a keyframe and never overshoots. Holds are written as a slow drift, so the picture is never still.
   - One light tilt over the whole film (a quarter of the way to isometric), deeper on the wall of 146, back again for
     the reading. The scene draws in world space inside the tilt; the camera aims at the tilted point.
   Its own file so the scene file exports components only. */

const END = 88

/** Monotone cubic (Fritsch-Carlson) through (ts, vs), read at t. */
function monotone(ts: readonly number[], vs: readonly number[], t: number): number {
  const n = ts.length
  if (t <= ts[0]) return vs[0]
  if (t >= ts[n - 1]) return vs[n - 1]
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      m[i] = k * a * d[i]
      m[i + 1] = k * b * d[i]
    }
  }
  let i = 0
  while (i < n - 2 && t >= ts[i + 1]) i++
  const h = ts[i + 1] - ts[i]
  const u = (t - ts[i]) / h
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m[i + 1]
}

/* Where the camera looks (world x, world y, width). */
const CAM: [number, number, number, number][] = [
  [0, -420, -40, 650],
  [10.4, -420, -56, 600],
  [12.6, -380, -110, 760],
  [14.4, 0, -126, 1240],
  [16, 10, -120, 1300],
  /* the wall of 146: tilted, panned across slowly */
  [17.8, -360, -230, 1280],
  [21.6, 340, 40, 1240],
  /* into Salesforce's copy, out again for the copies edited by hand */
  [23.4, -430, -110, 640],
  [24.8, -424, -108, 610],
  [26, 0, -90, 1700],
  [28.2, 0, -80, 1640],
  /* taken apart: the old Adaptive policy, its checks lifting out */
  [30.2, 0, -30, 960],
  [34, -30, 0, 900],
  [38, 30, 0, 900],
  [41.2, 0, 0, 920],
  /* the builder: the Library and the canvas, then rule 1 with its Inspector */
  [43.6, -90, 0, 1150],
  [46.6, 260, -30, 1000],
  [56, 250, -20, 960],
  [58.2, 110, 0, 1000],
  /* many rules on: the builder is the subject, the Library steps back */
  [61, 80, 10, 980],
  [64.6, 70, -40, 1040],
  [71.6, 70, -30, 1010],
  [74, 160, -20, 980],
  [81.8, 150, -20, 950],
  [84.6, 60, -20, 1040],
  [END, 60, -20, 1070],
]
const T = CAM.map((c) => c[0])
const X = CAM.map((c) => c[1])
const Y = CAM.map((c) => c[2])
const W = CAM.map((c) => c[3])

/* How far toward isometric the world is tilted (0 flat, 1 full). */
/* Owner, 6 Nov 2026: "we don't need the isometric everywhere ... wherever we take an action and convert something,
   a normal view; for the transitions and the whole piece, isometric; a balanced mix". Flat: reading Salesforce,
   editing the copy, taking the checks apart, building rule 1, Check access. Tilted: the four applications, the wall
   of 146, the step into the builder, many rules and the end. */
const TILT: [number, number][] = [
  [0, 0],
  [11.6, 0],
  [14, 0.36],
  [16, 0.4],
  [17.8, 0.8],
  [21.6, 0.8],
  [23.2, 0],
  [28, 0],
  [28.9, 0.32],
  [30.2, 0],
  [41, 0],
  [43.2, 0.36],
  [45.6, 0],
  [59, 0],
  [61.4, 0.38],
  [71.2, 0.38],
  [73.2, 0],
  [82.2, 0],
  [84.4, 0.34],
  [END, 0.36],
]
const TT = TILT.map((x) => x[0])
const TV = TILT.map((x) => x[1])
const C = 0.866
const S = 0.5
export function tilt2D(t: number): number {
  return monotone(TT, TV, t)
}
/** The tilt as an SVG matrix: a quarter-turn toward isometric, scaled by k. */
export function tiltMatrix(k: number): [number, number, number, number] {
  return [1 + (C - 1) * k, S * k, -C * k, 1 + (S - 1) * k]
}

/** The camera at t, in screen space: centre x, centre y, width. */
export function cam2D(t: number): [number, number, number] {
  const [a, b, c, d] = tiltMatrix(tilt2D(t))
  const x = monotone(T, X, t)
  const y = monotone(T, Y, t)
  return [a * x + c * y, b * x + d * y, monotone(T, W, t)]
}

export function camera2D(t: number): string {
  const [x, y, w] = cam2D(t)
  const h = w * 0.5625
  return `${(x - w / 2).toFixed(1)} ${(y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
}
