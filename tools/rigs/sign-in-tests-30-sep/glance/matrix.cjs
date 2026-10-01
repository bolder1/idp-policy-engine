const { launch, tests, fit, scenario } = require('./lib.cjs');
(async () => {
  const ids = (process.argv[2] || 'devon,kavya,arun-home,maya').split(',');
  const sizes = (process.argv[3] || '1440x900,1280x800').split(',');
  const tag = process.argv[4] || '';
  for (const size of sizes) {
    const [w, h] = size.split('x').map(Number);
    for (const id of ids) {
      const { b, p, errors } = await launch(w, h);
      await tests(p);
      await scenario(p, id);
      await p.waitForTimeout(10500);
      await p.mouse.move(5, h - 5);
      await p.waitForTimeout(300);
      const name = `m-${id}-${w}${tag}.png`;
      await p.screenshot({ path: name });
      const f = await fit(p);
      console.log(name, 'fits', f.fits, 'chainBottom', f.chainBottom, 'visible', f.visibleBottom, 'scroll', f.scrollTop, '/', f.scrollMax, 'hero', JSON.stringify(f.hero), 'see', JSON.stringify(f.see), 'page', JSON.stringify(f.page));
      if (errors.length) console.log('  errors', errors.slice(0, 3));
      await b.close();
    }
  }
})();
