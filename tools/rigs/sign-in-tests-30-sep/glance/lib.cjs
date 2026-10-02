const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
const BASE = process.env.BASE || 'http://localhost:5173/';
async function launch(w, h, opts = {}) {
  const b = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen','1'); localStorage.setItem('idp.tour.seen','1'); } catch {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e) + ' @@ ' + String(e.stack || '').split(String.fromCharCode(10)).slice(0, 8).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  return { b, p, errors };
}
async function tests(p) {
  await p.getByRole('button', { name: 'Sign-in tests' }).first().click();
  await p.waitForTimeout(900);
}
async function saved(p, hasText) {
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText }).first().click();
}
async function savedNames(p) {
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  const n = await p.locator('.tbar-saved__opt').allInnerTexts();
  await p.keyboard.press('Escape');
  return n;
}
async function fit(p) {
  return p.evaluate(() => {
    const sc = document.querySelector('.tj-scroll');
    const chain = document.querySelector('.tj-chain');
    const dock = document.querySelector('.sit__dock .bb__dockbar') || document.querySelector('.bb__dock');
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const scr = sc.getBoundingClientRect();
    const cb = chain.getBoundingClientRect();
    const db = dock ? dock.getBoundingClientRect() : null;
    const d = document.scrollingElement;
    return {
      canvas: r(sc), chain: r(chain), dock: r(dock), hero: r(document.querySelector('.tj-hero')),
      person: r(document.querySelector('[data-node="sign-in"]')), policy: r(document.querySelector('[data-node="which"]')),
      see: r(document.querySelector('.tj-hero .tplay__stage')),
      chainBottom: Math.round(cb.bottom), visibleBottom: Math.round(db ? Math.min(scr.bottom, db.top) : scr.bottom),
      fits: cb.bottom <= (db ? Math.min(scr.bottom, db.top) : scr.bottom) + 0.5 && cb.top >= scr.top,
      scrollTop: sc.scrollTop, scrollMax: sc.scrollHeight - sc.clientHeight,
      page: [d.scrollHeight - d.clientHeight, d.scrollWidth - d.clientWidth],
      zoom: getComputedStyle(document.querySelector('.tj-canvas')).getPropertyValue('--sit-z'),
    };
  });
}
module.exports = { launch, tests, saved, savedNames, fit, BASE };

async function scenario(p, id) {
  const S = { devon: 'Devon Rao on Android 12', kavya: 'Kavya Menon in the office', maya: 'Maya Iyer on GitHub', arun: 'Arun Patel in the office' };
  if (id !== 'arun-home') { await saved(p, S[id]); return; }
  await saved(p, S.arun);
  await p.waitForTimeout(9000);
  await p.getByRole('button', { name: 'Edit sign-in' }).click();
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: /^Network: / }).click();
  await p.waitForTimeout(400);
  await p.locator('.tsent-opt', { hasText: 'Home broadband' }).click();
  await p.waitForTimeout(6000);
  await p.locator('.sit-panel').getByRole('button', { name: 'Run', exact: true }).click();
}
module.exports.scenario = scenario;
