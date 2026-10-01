const { launch, tests, saved, fit } = require('./lib.cjs');
(async () => {
  const [w, h] = (process.argv[2] || '1280x800').split('x').map(Number);
  const { b, p, errors } = await launch(w, h);
  await tests(p);
  await saved(p, process.argv[3] || 'Maya');
  await p.waitForTimeout(10000);
  await p.getByRole('button', { name: 'Edit sign-in' }).click();
  await p.waitForTimeout(1200);
  await p.mouse.move(5, h - 5);
  await p.screenshot({ path: `narrow-${w}.png` });
  console.log(JSON.stringify(await fit(p)));
  // expand all
  await p.getByRole('button', { name: 'Close the panel' }).click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Expand all' }).click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `expand-${w}.png` });
  console.log('expanded', JSON.stringify(await fit(p)));
  await p.getByRole('button', { name: 'Collapse all' }).click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `collapse-${w}.png` });
  console.log('collapsed', JSON.stringify(await fit(p)));
  console.log(errors.slice(0, 3));
  await b.close();
})();
