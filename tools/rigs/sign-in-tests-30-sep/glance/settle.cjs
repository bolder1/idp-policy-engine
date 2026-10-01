const { launch, tests, saved, fit } = require('./lib.cjs');
(async () => {
  const who = process.argv[2] || 'Devon';
  const [w, h] = (process.argv[3] || '1440x900').split('x').map(Number);
  const tag = process.argv[4] || '';
  const { b, p, errors } = await launch(w, h);
  await tests(p);
  await saved(p, who);
  await p.waitForTimeout(10000);
  await p.mouse.move(5, h - 5);
  const name = `settled-${who.split(' ')[0]}-${w}${tag}.png`;
  await p.screenshot({ path: name });
  console.log(name, JSON.stringify(await fit(p)));
  console.log(errors.slice(0, 5));
  await b.close();
})();
