// Makes public/xecurify-logo-dark.png from public/xecurify-logo.png for the console in dark (26 Nov 2026): the grey and
// black ink of the wordmark turns to the night text colour (#f4f7fb), the orange mark and any coloured pixel stay as
// drawn, alpha is kept. Run from the repo root: node tools/rigs/dark-sweep/logo-dark.cjs
const { chromium } = require('playwright')
const fs = require('fs')

async function main() {
  const src = 'data:image/png;base64,' + fs.readFileSync('public/xecurify-logo.png').toString('base64')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  const out = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height)
    const p = d.data
    let inked = 0
    for (let i = 0; i < p.length; i += 4) {
      const [r, g, b, a] = [p[i], p[i + 1], p[i + 2], p[i + 3]]
      if (!a) continue
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max
      /* Ink: unsaturated and not white. Its darkness becomes how far it moves to the night text colour, so the
         anti-aliased edges stay soft. */
      if (sat < 0.25 && max < 200) {
        const t = 1 - max / 200
        p[i] = Math.round(r + (244 - r) * Math.min(1, t * 1.4))
        p[i + 1] = Math.round(g + (247 - g) * Math.min(1, t * 1.4))
        p[i + 2] = Math.round(b + (251 - b) * Math.min(1, t * 1.4))
        inked++
      }
    }
    x.putImageData(d, 0, 0)
    return { url: c.toDataURL('image/png'), inked }
  }, src)
  fs.writeFileSync('public/xecurify-logo-dark.png', Buffer.from(out.url.split(',')[1], 'base64'))
  console.log('re-inked pixels:', out.inked)
  await browser.close()
}
main()
