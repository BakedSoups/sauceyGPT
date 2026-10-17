import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
try {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/library', route => route.fulfill({ json: { documents: [
    { id: 'a'.repeat(64), title: 'pandas documentation', chapters: [], chunkCount: 10 },
    { id: 'b'.repeat(64), title: 'Klaviyo documentation', chapters: [], chunkCount: 10 }
  ] } }));
  await page.goto('http://localhost:3001');
  await page.locator('#library-count').getByText(/active/).waitFor();
  const input = page.locator('#question');
  await input.fill('use :');
  assert.equal(await page.locator('.sauce-option').count(), 2);
  await input.fill('use: pan');
  assert.equal(await page.locator('.sauce-option').count(), 1);
  assert.match(await page.locator('.sauce-option').innerText(), /pandas/);
  await page.screenshot({ path: '/tmp/sauceygpt-using-picker.png' });
  await input.press('Enter');
  assert.equal(await page.locator('.message.user').count(), 0);
  assert.equal(await page.locator('.sauce-chip').count(), 1);
  assert.match(await page.locator('.sauce-chip').innerText(), /Using pandas sauce/);
  assert.equal(await page.locator('.welcome-sauces img').count(), 2);
  assert.equal(await input.inputValue(), 'using: pandas sauce; ');
  await input.fill('What is a DataFrame? using: klav'); await input.press('Tab');
  assert.equal(await page.locator('.sauce-chip').count(), 2);
  await input.fill('What is a DataFrame?');
  await page.getByRole('button', { name: 'Remove Klaviyo documentation' }).click();
  assert.equal(await page.locator('.sauce-chip').count(), 1);
  let request;
  await page.route('**/api/chat', async route => {
    request = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', answer: 'Test answer.', sources: [], blocks: [[{ text: 'Test answer.' }]] }) + '\n' });
  });
  await input.fill('using: pandas sauce; What is a DataFrame?');
  await input.press('Enter'); await page.locator('.claim').waitFor();
  assert.equal(await page.locator('.message.user').innerText(), 'using: pandas sauce; What is a DataFrame?');
  assert.equal(request.libraryMode, 'prefer'); assert.equal(request.documentIds.length, 1);
  assert.equal(request.message, 'What is a DataFrame?');
  assert.equal(await page.locator('.sauce-chip').count(), 1);
  await page.getByRole('button', { name: 'Remove pandas documentation' }).click();
  await input.fill('using: zzzzz'); assert.equal(await page.locator('.sauce-option').count(), 0);
  await input.press('Escape'); assert.equal(await page.locator('#sauce-picker').isHidden(), true);
  await input.fill('using:'); await input.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-activedescendant'), 'sauce-option-1');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/sauceygpt-using-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('using: passed filtering, keyboard selection, multiple sources, removal, scoped request, hidden draft, and mobile layout.');
} finally { await browser.close(); }
