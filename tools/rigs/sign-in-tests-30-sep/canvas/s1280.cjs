const { launch, tests } = require('./lib.cjs');
(async () => {
  const { b, p, errors } = await launch(1280, 800);
  await tests(p);
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText: 'Maya' }).first().click();
  await p.waitForTimeout(9000);
  await p.mouse.move(640, 790);
  await p.screenshot({ path: 's1280-settled.png' });
  await p.getByRole('button', { name: 'Edit sign-in' }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: 's1280-panel.png' });
  // the conflict line in the outcome
  await p.getByRole('button', { name: 'Edit sign-in' }).click().catch(() => {});
  const btn = p.locator('.tj-hero__conflictbtn');
  console.log('conflict btn', await btn.count());
  if (await btn.count()) { await btn.first().click(); await p.waitForTimeout(900); await p.screenshot({ path: 's1280-conflict.png' }); console.log('focus', await p.evaluate(() => document.activeElement?.textContent?.slice(0, 60))); }
  console.log(errors.slice(0, 5));
  await b.close();
})();
