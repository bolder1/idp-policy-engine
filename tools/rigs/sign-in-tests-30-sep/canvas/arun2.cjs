const { launch, tests } = require('./lib.cjs');
(async () => {
  const { b, p, errors } = await launch(1440, 900);
  await tests(p);
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText: 'Arun Patel in the office' }).first().click();
  await p.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Edit sign-in' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Network: Branch office' }).click();
  await p.waitForTimeout(400);
  const opts = await p.locator('[role=option]').allInnerTexts();
  console.log('opts', opts.join(' | '));
  await p.locator('[role=option]', { hasText: 'Home broadband' }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Run', exact: true }).click();
  const t0 = Date.now();
  const lines = [];
  for (let i = 0; i < 36; i++) {
    const f = `f-arun-${String(i).padStart(2, '0')}.png`;
    await p.screenshot({ path: f, clip: { x: 64, y: 100, width: 1376, height: 800 } });
    const info = await p.evaluate(() => { const sc = document.querySelector('.tj-scroll'); const line = document.querySelector('.tj-engine__text'); return { top: sc ? Math.round(sc.scrollTop) : -1, text: line ? line.textContent : '', h: document.querySelector('.tj-chain')?.offsetHeight }; });
    lines.push(`${f} t=${Date.now() - t0} top=${info.top} h=${info.h} ${info.text}`);
    const wait = t0 + (i + 1) * 250 - Date.now();
    if (wait > 0) await p.waitForTimeout(wait);
  }
  console.log(lines.join('\n'));
  const m = await p.evaluate(() => ({ chain: document.querySelector('.tj-chain')?.offsetHeight, player: document.querySelector('.tj-hero__foot')?.offsetHeight }));
  console.log(JSON.stringify(m));
  console.log(errors.slice(0, 5));
  await b.close();
})();
