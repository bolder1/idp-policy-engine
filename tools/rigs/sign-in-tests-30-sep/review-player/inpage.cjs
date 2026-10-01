const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
// node inpage.cjs key prefix widths frames(ms list) [dark] [reduced] [appId]
const [,, key, prefix, widths, framesArg, dark, reduced, appId] = process.argv;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, colorScheme: dark === 'dark' ? 'dark' : 'light', reducedMotion: reduced === 'reduced' ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)); });
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1500);
  if (dark === 'dark') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const info = await page.evaluate(async ({ key, widths, appId }) => {
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const rdom = res.find(n => n.includes('/node_modules/.vite/deps/react-dom_client.js'));
    const react = res.find(n => /\/node_modules\/\.vite\/deps\/react\.js/.test(n));
    const RD = await import(rdom); const createRoot = RD.createRoot ?? RD.default?.createRoot;
    const React = (await import(react)).default ?? (await import(react));
    const { SignInPlayer } = await import('/src/brand/screens/testing/player/SignInPlayer.tsx');
    const { combinations } = await import('/src/brand/screens/testing/player/combinations.ts');
    const all = combinations();
    const c = key.startsWith('{') ? { key: 'custom', screens: JSON.parse(key) } : all.find(x => x.key === key);
    if (!c) return { err: 'no key', keys: all.map(x => x.key).filter(k => k.includes(key.split('/')[1] || '')).slice(0, 40) };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--surface-page, var(--surface-base));padding:16px;display:flex;flex-direction:column;gap:16px;';
    document.body.appendChild(host);
    const root = createRoot(host);
    const ws = widths.split(',').map(Number);
    root.render(React.createElement(React.Fragment, null, ws.map(w => React.createElement('div', { key: w, className: 'hw', 'data-w': w, style: { width: w + 'px' } }, React.createElement(SignInPlayer, { screens: c.screens, appId: appId || 'github', appName: appId === 'hrms' ? 'HRMS' : 'GitHub Enterprise' })))));
    window.__root = root;
    return { ok: c.key, plays: c.plays };
  }, { key, widths: widths || '334,498', appId });
  console.log(JSON.stringify(info));
  const t0 = Date.now();
  const frames = (framesArg || '1000,3000,6000,10000').split(',').map(Number);
  for (const f of frames) {
    const wait = f - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
    const b = await page.evaluate(() => { const hs = [...document.querySelectorAll('.hw')]; const last = hs.at(-1).getBoundingClientRect(); return { h: Math.ceil(last.bottom + 16), w: Math.ceil(Math.max(...hs.map(h => h.getBoundingClientRect().right)) + 16) }; });
    await page.screenshot({ path: `${prefix}-${String(f).padStart(5, '0')}.png`, clip: { x: 0, y: 0, width: b.w, height: b.h } });
    const st = await page.evaluate(() => [...document.querySelectorAll('.hw')].map(h => { const r = s => { const e = h.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)]; }; return { w: h.dataset.w, card: r('.tpw__card'), page: r('.tpw__page'), dev: r('.tpdev > *'), url: r('.tpw__url'), sheet: r('.tps__sheet'), view: r('.tpw__view'), on: h.querySelector('.tplay__chip.is-on')?.textContent }; }));
    console.log(f, JSON.stringify(st));
  }
  await browser.close();
})();
