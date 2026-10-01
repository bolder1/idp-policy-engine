const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async () => {
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const RD = await import(res.find(n => n.includes('/node_modules/.vite/deps/react-dom_client.js')));
    const createRoot = RD.createRoot ?? RD.default.createRoot;
    const Rm = await import(res.find(n => /\/node_modules\/\.vite\/deps\/react\.js/.test(n))); const React = Rm.default ?? Rm;
    const { SignInPlayer } = await import('/src/brand/screens/testing/player/SignInPlayer.tsx');
    const { combinations } = await import('/src/brand/screens/testing/player/combinations.ts');
    const all = combinations().filter(c => !c.key.includes('/first:') || c.key.startsWith('1fa'));
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;overflow:auto;display:flex;flex-wrap:wrap;gap:8px';
    document.body.appendChild(host);
    const small = new Set(); const clipped = new Set();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (const c of all) {
      const box = document.createElement('div'); box.style.width = '334px'; host.appendChild(box);
      const root = createRoot(box);
      root.render(React.createElement(SignInPlayer, { screens: c.screens, appId: 'github', appName: 'GitHub Enterprise' }));
      await sleep(30);
      const chips = box.querySelectorAll('.tplay__chip');
      for (let i = 0; i < chips.length; i++) {
        chips[i].click(); await sleep(40);
        box.querySelectorAll('.tplay__stage *').forEach(el => {
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12) small.add(el.className + ':' + fs);
        });
        const view = box.querySelector('.tpw__view')?.getBoundingClientRect();
        const pg = box.querySelector('.tpw__page, .tpw__home');
        const dev = box.querySelector('.tpdev > *')?.getBoundingClientRect();
        if (view && pg) { const b = pg.getBoundingClientRect(); if (b.bottom > view.bottom + 0.5) clipped.add(c.key + '#' + i + ' bottom+' + Math.round(b.bottom - view.bottom)); if (dev && b.right > dev.left + 0.5) clipped.add(c.key + '#' + i + ' underdevice+' + Math.round(b.right - dev.left)); }
      }
      root.unmount(); box.remove();
    }
    return { small: [...small], clipped: [...clipped] };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
