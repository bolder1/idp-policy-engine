const { launch, tests, saved } = require('./lib.cjs');
(async () => {
  const who = process.argv[2] || 'Maya';
  const [w, h] = (process.argv[3] || '1440x900').split('x').map(Number);
  const { b, p, errors } = await launch(w, h);
  await tests(p);
  await saved(p, who);
  // wait until the hero is visible (landed)
  const t0 = Date.now();
  await p.waitForFunction(() => { const o = document.querySelector('.tj-out'); return o && !o.classList.contains('is-waiting'); }, null, { timeout: 20000, polling: 30 });
  const tl = Date.now() - t0;
  const rows = [];
  for (let i = 0; i < 16; i++) {
    const m = await p.evaluate(() => { const sc = document.querySelector('.tj-scroll'); const hero = document.querySelector('.tj-hero').getBoundingClientRect(); const pol = document.querySelector('[data-node="which"]').getBoundingClientRect(); return { st: Math.round(sc.scrollTop), heroTop: Math.round(hero.top), polH: Math.round(pol.height), eng: document.querySelector('.tj-engine')?.className }; });
    rows.push(`${i} +${Date.now() - t0 - tl}ms ${JSON.stringify(m)}`);
    await p.screenshot({ path: `land-${who.split(' ')[0]}-${String(i).padStart(2, '0')}.png`, clip: { x: 64, y: 100, width: w - 64, height: h - 100 } });
    await p.waitForTimeout(90);
  }
  console.log('landed at', tl); console.log(rows.join('\n'));
  console.log(errors.slice(0, 3));
  await b.close();
})();
