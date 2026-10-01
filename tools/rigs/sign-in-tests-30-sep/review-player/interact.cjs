const { chromium } = require('playwright');
// screenshots land in ./out next to this file (gitignored)
{ const out = require('path').join(__dirname, 'out'); require('fs').mkdirSync(out, { recursive: true }); process.chdir(out) }
const prefix = 'ix';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1'); });
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 300)));
  await page.goto((process.env.BASE || 'http://localhost:5173/'));
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Sign-in tests/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Saved sign-ins/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Arun Patel in the office').first().click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /Office network|Branch office/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(/Home broadband/).first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  const dev = page.getByRole('button', { name: /laptop|registered|Windows/ }).first();
  await dev.click(); await page.waitForTimeout(400);
  await page.getByText('Any device', { exact: true }).first().click(); await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Run$/ }).first().click();
  await page.waitForSelector('.tplay', { timeout: 30000, state: 'attached' });
  await page.locator('.tsee').first().scrollIntoViewIfNeeded();
  const state = () => page.evaluate(() => ({ on: document.querySelector('.tplay__chip.is-on')?.textContent, fill: !!document.querySelector('.tplay__fill'), page: document.querySelector('.tpw__screen')?.className, h: document.querySelector('.tpw__h')?.textContent, dev: !!document.querySelector('.tpdev'), seg: [...document.querySelectorAll('.tsee [aria-checked="true"], .tsee [aria-pressed="true"], .tsee [aria-selected="true"]')].map(e => e.textContent) }));
  await page.waitForTimeout(3000);
  console.log('3s', JSON.stringify(await state()));
  // switch to Deny mid-play
  await page.locator('.tsee').getByText('Deny', { exact: true }).first().click();
  await page.waitForTimeout(200);
  console.log('deny+0.2', JSON.stringify(await state()));
  await page.waitForTimeout(1500);
  console.log('deny+1.7', JSON.stringify(await state()));
  await page.locator('.tsee').first().screenshot({ path: `${prefix}-deny17.png` });
  await page.waitForTimeout(5000);
  console.log('deny+6.7', JSON.stringify(await state()));
  await page.locator('.tsee').first().screenshot({ path: `${prefix}-deny67.png` });
  // back to allow; after 1s click chip 2
  await page.locator('.tsee').getByText('Allow with 2FA', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  console.log('allow+1.5', JSON.stringify(await state()));
  await page.locator('.tplay__chip').nth(1).click();
  await page.waitForTimeout(300);
  console.log('chip2+0.3', JSON.stringify(await state()));
  await page.locator('.tsee').first().screenshot({ path: `${prefix}-chip2.png` });
  await page.waitForTimeout(6000);
  console.log('chip2+6.3', JSON.stringify(await state()));
  await page.locator('.tplay__replay').click();
  await page.waitForTimeout(400);
  console.log('replay+0.4', JSON.stringify(await state()));
  await page.waitForTimeout(9000);
  console.log('replay+9.4', JSON.stringify(await state()));
  // Run again same inputs: does it play again?
  await page.getByRole('button', { name: /^Run$/ }).first().click();
  await page.waitForTimeout(600);
  console.log('rerun+0.6', JSON.stringify(await state()));
  await page.waitForTimeout(3500);
  console.log('rerun+4.1', JSON.stringify(await state()));
  await page.locator('.tsee').first().screenshot({ path: `${prefix}-rerun.png` });
  await page.waitForTimeout(5000);
  console.log('rerun+9', JSON.stringify(await state()));
  await browser.close();
})();
