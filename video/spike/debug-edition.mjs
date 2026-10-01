import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(process.env.APP_URL, { waitUntil: 'load' })
await page.getByRole('button', { name: 'New policy', exact: true }).waitFor()
const info = await page.evaluate(() => {
  const root = document.getElementById('root')
  const keys = Object.keys(root)
  const key = keys.find((k) => k.startsWith('__reactContainer$'))
  const out = { keys, visited: 0, providers: [] }
  if (!key) return out
  const stack = [root[key]]
  while (stack.length) {
    const f = stack.pop()
    if (!f) continue
    out.visited++
    const p = f.memoizedProps
    if (p && typeof p === 'object' && 'value' in p && p.value && typeof p.value === 'object') {
      out.providers.push({ tag: f.tag, type: typeof f.type === 'object' ? Object.keys(f.type || {}).slice(0, 4) : String(f.type).slice(0, 30), keys: Object.keys(p.value).slice(0, 12), hasSet: typeof p.value.setEdition })
    }
    if (f.sibling) stack.push(f.sibling)
    if (f.child) stack.push(f.child)
  }
  return out
})
console.log(JSON.stringify(info, null, 1).slice(0, 4000))
await browser.close()
