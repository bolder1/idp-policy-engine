const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
const [,, key] = process.argv;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1500);
  await page.evaluate(async ({ key }) => {
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const RD = await import(res.find(n => n.includes('/node_modules/.vite/deps/react-dom_client.js')));
    const createRoot = RD.createRoot ?? RD.default.createRoot;
    const Rm = await import(res.find(n => /\/node_modules\/\.vite\/deps\/react\.js/.test(n))); const React = Rm.default ?? Rm;
    const { SignInPlayer } = await import('/src/brand/screens/testing/player/SignInPlayer.tsx');
    const { combinations } = await import('/src/brand/screens/testing/player/combinations.ts');
    const c = combinations().find(x => x.key === key);
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:16px;';
    document.body.appendChild(host);
    const box = document.createElement('div'); box.style.width = '498px'; host.appendChild(box);
    createRoot(box).render(React.createElement(SignInPlayer, { screens: c.screens, appId: 'github', appName: 'GitHub Enterprise' }));
    window.__log = []; const t0 = performance.now(); let last = '';
    const tick = () => {
      const q = s => !!document.querySelector(s);
      const st = [q('.tpp__scanline') && 'scanline', q('.tpp__finder.is-done') && 'finder-done', q('.tps__ring') && 'ring', q('.tps__print.is-done') && 'print-done', q('.tph__glow') && 'glow', q('.tph__pad.is-done') && 'pad-done', q('.tpp__bioring') && 'bioring', q('.tpw__wait.is-done') && 'page-done', document.querySelector('.tplay__chip.is-on')?.textContent].filter(Boolean).join(' ');
      if (st !== last) { window.__log.push(Math.round(performance.now() - t0) + ' ' + st); last = st; }
      requestAnimationFrame(tick);
    }; tick();
  }, { key });
  await page.waitForTimeout(10000);
  console.log((await page.evaluate(() => window.__log)).join('\n'));
  await browser.close();
})();
