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
  await page.locator('#open-library').click();
  const jar = page.getByRole('button', { name: 'pandas documentation', exact: true });
  await jar.waitFor(); assert.equal(await jar.getAttribute('aria-pressed'), 'true');
  await jar.click(); assert.equal(await jar.getAttribute('aria-pressed'), 'false');
  await page.reload(); await page.locator('#open-library').click();
  await jar.waitFor(); assert.equal(await jar.getAttribute('aria-pressed'), 'false');
  await page.locator('#sauce-search').fill('klaviyo'); assert.equal(await jar.count(), 0);
  await page.locator('#sauce-search').fill(''); await jar.click();
  await page.screenshot({ path: '/tmp/sauceygpt-source-shelf.png' });
  await page.locator('#add-sauce').click();
  await page.locator('[data-site=klaviyo]').click();
  assert.match(await page.locator('#site-url').inputValue(), /en\/docs\/get_started$/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#library-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: '/tmp/sauceygpt-source-shelf-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('Source shelf passed: active jars, persisted selection, search, presets, desktop/mobile layout.');
} finally { await browser.close(); }
