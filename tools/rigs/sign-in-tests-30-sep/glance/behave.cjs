const { launch, tests, saved, fit } = require('./lib.cjs');
(async () => {
  // 2. skip
  {
    const { b, p, errors } = await launch(1440, 900);
    await tests(p);
    await saved(p, 'Devon');
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Skip' }).click();
    await p.waitForTimeout(80);
    await p.screenshot({ path: 'b-skip-80.png', clip: { x: 64, y: 100, width: 1376, height: 800 } });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: 'b-skip.png' });
    console.log('skip', JSON.stringify(await fit(p)));
    // revisit: go to Policies and back
    await p.locator('.bbtop').getByText('Policies', { exact: true }).first().click();
    await p.waitForTimeout(800);
    await tests(p);
    await p.waitForTimeout(100);
    await p.screenshot({ path: 'b-revisit-100.png', clip: { x: 64, y: 100, width: 1376, height: 800 } });
    await p.waitForTimeout(1500);
    console.log('revisit', JSON.stringify(await fit(p)));
    console.log('errors', errors.slice(0, 3));
    await b.close();
  }
  // 3. reduced motion
  {
    const { b, p, errors } = await launch(1280, 800, { reduced: true });
    await tests(p);
    await saved(p, 'Arun Patel in the office');
    await p.waitForTimeout(100);
    await p.screenshot({ path: 'b-reduced-100.png', clip: { x: 64, y: 100, width: 1216, height: 700 } });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: 'b-reduced.png' });
    console.log('reduced', JSON.stringify(await fit(p)));
    console.log('errors', errors.slice(0, 3));
    await b.close();
  }
})();
