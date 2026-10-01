const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
// node arun.cjs prefix w h mode(push|nodevice|android) frames [dark] [reduced]
const [,, prefix, w, h, mode, framesArg, dark, reduced] = process.argv;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, colorScheme: dark === 'dark' ? 'dark' : 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 300)));
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Sign-in tests/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Saved sign-ins/ }).first().click();
  await page.waitForTimeout(500);
  const who = mode === 'android' ? 'Devon Rao' : 'Arun Patel in the office';
  await page.getByText(who, { exact: false }).first().click();
  await page.waitForTimeout(3000);
  if (mode === 'push' || mode === 'nodevice') {
    await page.getByRole('button', { name: /Office network|Branch office/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(/Home broadband/).first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }
  if (mode === 'nodevice') {
    const dev = page.getByRole('button', { name: /laptop|registered|Windows/ }).first();
    await dev.click(); await page.waitForTimeout(500);
    const none = page.getByText('Any device', { exact: true }).first();
    if (await none.count()) { await none.click(); await page.waitForTimeout(400); }
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: `${prefix}-bar.png` });
  if (mode !== 'android') await page.getByRole('button', { name: /^Run$/ }).first().click();
  await page.waitForSelector('.tplay', { timeout: 30000, state: 'attached' });
  const t0 = Date.now();
  await page.locator('.tsee').first().scrollIntoViewIfNeeded();
  const m = await page.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width), Math.round(b.height)]; }; return { tsee: r('.tsee'), stage: r('.tplay__stage'), tpw: r('.tpw'), card: r('.tpw__card') }; });
  console.log(JSON.stringify(m));
  const log = [];
  for (const f of (framesArg || '3000,6000,9000').split(',').map(Number)) {
    const wait = f - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
    await page.locator('.tsee').first().scrollIntoViewIfNeeded();
    await page.locator('.tsee').first().screenshot({ path: `${prefix}-${String(f).padStart(5, '0')}.png` });
    log.push(await page.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; }; return { card: r('.tpw__card'), dev: r('.tpdev > *'), chipOn: document.querySelector('.tplay__chip.is-on')?.textContent }; }));
  }
  console.log(JSON.stringify(log));
  await page.screenshot({ path: `${prefix}-full.png` });
  console.log(JSON.stringify(await page.locator('.tplay__chips').first().innerText()));
  await browser.close();
})();
