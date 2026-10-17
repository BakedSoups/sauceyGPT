// Billable integration check against the running local app and Qdrant.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const base = process.env.APP_URL || 'http://localhost:3001';
const bytes = Buffer.from('# Equipment\nThe cobalt kettle is stored on shelf seven in the workshop.\n\n# Hours\nThe workshop opens at 08:15 every Tuesday. Visitors must bring their own cups.');
let document;
try {
  await page.goto(base);
  await page.locator('#open-library').click();
  await page.locator('#add-sauce').click();
  await page.locator('#document-title').fill('Workshop handbook');
  const uploaded = page.waitForResponse(r => r.url().endsWith('/api/library/upload'), { timeout: 120000 });
  await page.locator('#document-file').setInputFiles({ name: 'workshop-check.md', mimeType: 'text/markdown', buffer: bytes });
  const upload = await uploaded; document = await upload.json();
  assert.equal(upload.status(), 200, JSON.stringify(document));
  assert.equal(document.chapters.length, 2);
  await page.getByText('Workshop handbook', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'About Workshop handbook' }).click();
  await page.locator('.document-toc summary').last().click();
  await page.screenshot({ path: '/tmp/sauceygpt-library.png' });
  await page.locator('#close-sauce-info').click();
  await page.locator('#close-library').click();
  await page.locator('#library-mode').selectOption('only');
  const start = Date.now();
  const completed = page.waitForResponse(r => r.url().endsWith('/api/chat'), { timeout: 120000 });
  await page.locator('#question').fill('In the Workshop handbook, where is the cobalt kettle stored and when does the workshop open?');
  await page.locator('#send').click();
  const events = (await (await completed).text()).trim().split('\n').map(JSON.parse);
  const result = events.find(e => e.type === 'result');
  assert.ok(result, JSON.stringify(events));
  assert.equal(result.provider, 'Document library');
  assert.match(result.answer, /seven|7/); assert.match(result.answer, /08:15|8:15/);
  assert.ok(result.sources.every(s => s.local && s.evidence.length));
  await page.locator('.citation').first().click();
  assert.match(await page.locator('#evidence-dialog blockquote').first().innerText(), /shelf seven|08:15/);
  assert.match(await page.locator('.passage-link').first().getAttribute('href'), /api\/library/);
  await page.screenshot({ path: '/tmp/sauceygpt-library-answer.png' });
  await page.locator('#close-evidence').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log(JSON.stringify({ answer: result.answer, elapsedMs: Date.now() - start, chapters: document.chapters.map(c => c.id), sources: result.sources.length }));
} finally {
  if (document?.id) await page.request.delete(`${base}/api/library/${document.id}`);
  await browser.close();
}
