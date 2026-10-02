const { launch, tests } = require('./lib.cjs');
const who = process.argv[2] || 'Maya';
const tag = process.argv[3] || 'maya';
const W = Number(process.argv[4] || 1440), H = Number(process.argv[5] || 900);
(async () => {
  const { b, p, errors } = await launch(W, H);
  await tests(p);
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText: who }).first().click();
  const t0 = Date.now();
  const frames = [];
  for (let i = 0; i < 40; i++) {
    const f = `f-${tag}-${String(i).padStart(2, '0')}.png`;
    await p.screenshot({ path: f, clip: { x: 64, y: 100, width: W - 64, height: H - 100 } });
    const info = await p.evaluate(() => { const sc = document.querySelector('.tj-scroll'); const line = document.querySelector('.tj-engine__text'); return { top: sc ? Math.round(sc.scrollTop) : -1, text: line ? line.textContent : '', h: Math.round(document.querySelector('.tj-chain')?.getBoundingClientRect().height ?? 0) }; });
    frames.push(`${f} t=${Date.now() - t0} top=${info.top} h=${info.h} ${info.text}`);
    const next = t0 + (i + 1) * 250;
    const wait = next - Date.now();
    if (wait > 0) await p.waitForTimeout(wait);
  }
  console.log(frames.join('\n'));
  console.log(errors.slice(0, 5));
  await b.close();
})();
