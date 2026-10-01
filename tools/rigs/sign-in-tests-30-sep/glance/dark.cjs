const { launch, tests, scenario, fit } = require('./lib.cjs');
(async () => {
  const { b, p, errors } = await launch(1440, 900, { dark: true });
  await tests(p);
  await scenario(p, 'maya');
  await p.waitForTimeout(10500);
  await p.mouse.move(5, 895);
  await p.screenshot({ path: 'dark-maya-1440.png' });
  console.log(JSON.stringify(await fit(p)), errors.slice(0, 3));
  await b.close();
})();
