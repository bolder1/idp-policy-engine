const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
async function launch(w, h, opts = {}) {
  const b = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen','1'); localStorage.setItem('idp.tour.seen','1'); } catch {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto((process.env.BASE || 'http://localhost:5173/'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  return { b, p, errors };
}
async function tests(p) {
  await p.getByRole('button', { name: 'Sign-in tests' }).first().click();
  await p.waitForTimeout(900);
}
async function builder(p) {
  // open the first policy in the builder
  const row = p.locator('.blist tbody tr, table tbody tr').first();
  await row.locator('button, a').first().click();
  await p.waitForTimeout(1200);
}
async function scroll(p) {
  return p.evaluate(() => {
    const d = document.scrollingElement; const m = document.querySelector('.bshell__main');
    return { doc: [d.scrollHeight - d.clientHeight, d.scrollWidth - d.clientWidth], main: m ? [m.scrollHeight - m.clientHeight, m.scrollWidth - m.clientWidth] : null };
  });
}
async function geo(p) {
  return p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return { rail: r('.bshell__rail'), bar: r('.bbtop'), bb: r('.bb'), stage: r('.bb__stage') || r('.sit__stage'), insp: r('.bb__insp'), dock: r('.bb__dock'), foot: r('.bb__inspfoot') };
  });
}
module.exports = { launch, tests, builder, scroll, geo };
