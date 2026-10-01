const { launch, tests } = require('./lib.cjs');
(async () => {
  const { b, p, errors } = await launch(1440, 900, { reduced: true });
  await tests(p);
  await p.getByRole('button', { name: 'Saved sign-ins' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.tbar-saved__opt', { hasText: 'Maya' }).first().click();
  await p.waitForTimeout(1500);
  const state = () => p.evaluate(() => ({
    rules: [...document.querySelectorAll('.tj-rcard .bb__card')].map((c) => (c.classList.contains('is-open') ? 'O' : '-') + (c.className.match(/is-t-[a-z-]+/) || [''])[0].slice(5)),
    person: document.querySelector('.tj-pnode.is-person')?.classList.contains('is-open'),
    policy: document.querySelector('.tj-pnode.is-policy')?.classList.contains('is-open'),
    hero: document.querySelector('.tj-hero')?.classList.contains('is-open'),
    h: document.querySelector('.tj-chain')?.offsetHeight,
    zoom: getComputedStyle(document.querySelector('.tj-stage')).zoom,
  }));
  console.log('landed', JSON.stringify(await state()));
  // press folded rule 2 card body
  await p.locator('.tj-rcard').nth(1).locator('.bb__card').click({ position: { x: 300, y: 12 } });
  await p.waitForTimeout(400);
  console.log('rule2 pressed', JSON.stringify(await state()));
  await p.screenshot({ path: 'fold-1-rule2.png' });
  // fold via title button of rule 2
  await p.locator('.tj-rcard').nth(1).locator('.bb__titlebtn').click();
  await p.waitForTimeout(300);
  console.log('rule2 title', JSON.stringify(await state()));
  // hover person and fold
  await p.locator('.tj-pnode.is-person').hover();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'fold-2-hover.png' });
  await p.locator('.tj-pnode.is-person .bb__fold__btn').click();
  await p.waitForTimeout(300);
  console.log('person folded', JSON.stringify(await state()));
  await p.getByRole('button', { name: 'Collapse all' }).click().catch(async () => { await p.getByRole('button', { name: 'Expand all' }).click(); });
  await p.waitForTimeout(700);
  console.log('dock 1', JSON.stringify(await state()), await p.locator('.bb__densitybtn').innerText());
  await p.screenshot({ path: 'fold-3-dock1.png' });
  await p.locator('.bb__densitybtn').click();
  await p.waitForTimeout(700);
  console.log('dock 2', JSON.stringify(await state()), await p.locator('.bb__densitybtn').innerText());
  await p.screenshot({ path: 'fold-4-dock2.png' });
  await p.locator('.bb__densitybtn').click();
  await p.waitForTimeout(700);
  console.log('dock 3', JSON.stringify(await state()), await p.locator('.bb__densitybtn').innerText());
  await p.screenshot({ path: 'fold-5-dock3.png' });
  // conflict line
  console.log(errors.slice(0, 5));
  await b.close();
})();
