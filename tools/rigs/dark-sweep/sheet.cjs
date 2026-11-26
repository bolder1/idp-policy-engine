// A contact sheet: four screenshots in a 2x2 grid, labelled, as one 1440x930 image, so a review reads four screens at a
// glance. node tools/rigs/dark-sweep/sheet.cjs <out.png> <a.png> [b.png c.png d.png]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

async function main() {
  const [out, ...shots] = process.argv.slice(2)
  const cells = shots
    .slice(0, 4)
    .map((p) => {
      const data = fs.readFileSync(p).toString('base64')
      return `<figure><img src="data:image/png;base64,${data}"><figcaption>${path.basename(p, '.png')}</figcaption></figure>`
    })
    .join('')
  const html = `<html><body style="margin:0;background:#333;font:13px system-ui;color:#fff">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px">${cells}</div>
    <style>figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 4px}</style></body></html>`
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 930 } })
  await page.setContent(html)
  await page.screenshot({ path: out })
  await browser.close()
}
main()
