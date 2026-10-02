const { launch, tests } = require('./lib.cjs');
const who = process.argv[2] || 'Maya';
const out = process.argv[3] || 'tall.png';
(async () => {
  const { b, p, errors } = await launch(1440, 2000, { reduced: true });
  await tests(p);
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText: who }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out });
  const h = await p.evaluate(() => { const c = document.querySelector('.tj-chain'); return c ? c.getBoundingClientRect().height : null });
  console.log('chain h', h);
  console.log(errors.slice(0, 5));
  await b.close();
})();
