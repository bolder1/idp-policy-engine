// The dark-mode audit, run inside the page (page.evaluate(audit)). Shared by audit.cjs and scenes.cjs.
// Flags, grouped by tag and first two classes:
//   light-fill      an opaque light background bigger than a knob or a dot
//   light-gradient  a gradient with a light stop
//   faint-text      words under 3:1 on the ground they actually sit on
//   light-svg       a drawn shape filled light (an illustration still on its white paper)
//   dark-svg        a drawn shape filled near-black (a mark that vanishes on the night ground)
function audit() {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  })
  const ratio = (x, y) => {
    const a = lum(x)
    const b = lum(y)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }
  const base = parse(getComputedStyle(document.body).backgroundColor)
  const page = base && base.a >= 0.99 ? base : { r: 7, g: 9, b: 13, a: 1 }
  const ground = (el) => {
    const stack = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) {
        stack.push(c)
        if (c.a >= 0.99) break
      }
    }
    let g = page
    for (let i = stack.length - 1; i >= 0; i--) g = over(stack[i], g)
    return g
  }
  const key = (el) => {
    const raw = typeof el.className === 'string' ? el.className : el.className && el.className.baseVal
    const cls = (raw || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }
  const visible = (el, r) => {
    if (r.width < 1 || r.height < 1) return false
    if (r.bottom < 0 || r.top > innerHeight * 3) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const found = new Map()
  const note = (kind, el, detail) => {
    const k = kind + ' ' + key(el)
    const f = found.get(k) || { kind, key: key(el), n: 0, detail, text: '' }
    f.n++
    if (!f.text) f.text = (el.textContent || '').trim().slice(0, 40)
    found.set(k, f)
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!visible(el, r)) continue
    const s = getComputedStyle(el)
    const inSvg = el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg'
    if (inSvg) {
      if (!/^(rect|path|circle|ellipse|polygon)$/i.test(el.tagName)) continue
      const fill = parse(s.fill)
      const area = r.width * r.height
      if (fill && fill.a > 0.5 && Number(s.fillOpacity) > 0.5) {
        if (lum(fill) > 0.6 && area > 900) note('light-svg', el, hex(fill) + ' in ' + key(el.closest('svg')))
        if (lum(fill) < 0.012 && area > 120) note('dark-svg', el, hex(fill) + ' in ' + key(el.closest('svg')))
      }
      continue
    }
    const bg = parse(s.backgroundColor)
    if (bg && bg.a > 0.5 && lum(bg) > 0.3 && r.width * r.height > 500) note('light-fill', el, hex(bg))
    if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
      const stops = [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c) => c && c.a > 0.5)
      if (stops.some((c) => lum(c) > 0.45) && r.width * r.height > 500) note('light-gradient', el, s.backgroundImage.slice(0, 90))
    }
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (own) {
      const fg = parse(s.color)
      if (fg && fg.a > 0) {
        const g = ground(el)
        const c = ratio(over(fg, g), g)
        if (c < 3) note('faint-text', el, `${hex(over(fg, g))} on ${hex(g)} = ${c.toFixed(2)}`)
      }
    }
  }
  return [...found.values()].sort((a, b) => b.n - a.n)
}

module.exports = { audit }
