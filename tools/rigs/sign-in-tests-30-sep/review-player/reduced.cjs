const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const RD = await import(res.find(n => n.includes('/node_modules/.vite/deps/react-dom_client.js')));
    const createRoot = RD.createRoot ?? RD.default.createRoot;
    const Rm = await import(res.find(n => /\/node_modules\/\.vite\/deps\/react\.js/.test(n))); const React = Rm.default ?? Rm;
    const { SignInPlayer } = await import('/src/brand/screens/testing/player/SignInPlayer.tsx');
    const { combinations } = await import('/src/brand/screens/testing/player/combinations.ts');
    const all = combinations();
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:16px;display:flex;gap:16px;flex-wrap:wrap';
    document.body.appendChild(host);
    for (const k of ['2fa/password/mo-push/remember', '2fa/password/otp-call', '2fa/password/unavailable']) {
      const box = document.createElement('div'); box.style.width = '420px'; box.className = 'hw'; host.appendChild(box);
      createRoot(box).render(React.createElement(SignInPlayer, { screens: all.find(x => x.key === k).screens, appId: 'github', appName: 'GitHub Enterprise' }));
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'red-a.png' });
  const hs = page.locator('.hw');
  for (let i = 0; i < 3; i++) await hs.nth(i).locator('.tplay__chip').nth(1).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'red-b.png' });
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.hw')].map(h => ({ replay: !!h.querySelector('.tplay__replay'), label: h.querySelector('.tplay__stage').getAttribute('aria-label'), on: h.querySelector('.tplay__chip.is-on')?.textContent })))));
  await browser.close();
})();
