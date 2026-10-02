const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
// node saved.cjs prefix w h savedText frames [dark]
const [,, prefix, w, h, saved, framesArg, dark] = process.argv;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, colorScheme: dark ? 'dark' : 'light' });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLEERR', m.text().slice(0, 300)); });
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Sign-in tests/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Saved sign-ins/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${prefix}-list.png` });
  await page.getByText(saved, { exact: false }).first().click();
  await page.waitForTimeout(600);
  const run = page.getByRole('button', { name: /^Run$/ });
  if (await run.count()) { await run.first().click(); }
  await page.waitForSelector('.tplay', { timeout: 30000 });
  const t0 = Date.now();
  await page.locator('.tsee').first().scrollIntoViewIfNeeded();
  const m = await page.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width), Math.round(b.height)]; }; return { foot: r('.tj-hero__foot'), tsee: r('.tsee'), stage: r('.tplay__stage'), tpw: r('.tpw'), card: r('.tpw__card') }; });
  console.log(JSON.stringify(m));
  for (const f of (framesArg || '3000,6000,9000').split(',').map(Number)) {
    const wait = f - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
    await page.locator('.tsee').first().screenshot({ path: `${prefix}-${String(f).padStart(5, '0')}.png` });
  }
  await page.screenshot({ path: `${prefix}-full.png` });
  console.log(JSON.stringify(await page.locator('.tplay__chips').first().innerText()));
  await browser.close();
})();
