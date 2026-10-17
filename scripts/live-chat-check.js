// Billable end-to-end check against the running app: real browser, API and sources.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
const page = await browser.newPage();
const results = [];
try {
  await page.goto(process.env.APP_URL || 'http://localhost:3001');
  for (const question of ['What happened to Napoleon? Keep it to three short sentences.', 'Did he die in that battle?', 'Different topic: why does Earth have seasons? Two sentences please.']) {
    const start = Date.now();
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST', { timeout: 240000 });
    await page.locator('#question').fill(question);
    await page.locator('#question').press('Enter');
    const response = await responsePromise;
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const result = events.find(e => e.type === 'result');
    assert.ok(result, JSON.stringify(events.filter(e => e.type === 'error')));
    const sent = response.request().postDataJSON();
    assert.equal(sent.history.length, results.length * 2, 'Follow-up lost conversation history');
    if (question === 'Did he die in that battle?') {
      assert.match(result.answer, /Napoleon/i);
      assert.match(result.answer, /1821/);
      assert.match(result.answer, /Helena/i);
    }
    if (question.startsWith('Different topic:')) {
      assert.match(result.answer, /tilt/i);
      assert.doesNotMatch(result.answer, /Napoleon|Waterloo/i);
    }
    await page.locator('#send').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    const answer = page.locator('.assistant').last();
    const citations = answer.locator('.citation');
    assert.ok(await citations.count(), 'No excerpt-backed citations');
    for (const segment of result.blocks.flat().filter(s => s.citations?.length)) {
      for (const id of segment.citations) assert.ok(result.sources.find(s => s.id === id)?.evidence?.some(e => e.claim === segment.text), 'Citation lacks matching evidence');
    }
    await citations.first().click();
    assert.ok(await page.locator('#evidence-dialog blockquote').count(), 'No supporting quote displayed');
    await page.locator('#close-evidence').click();
    results.push({ question, elapsedMs: Date.now() - start, ...result });
    console.log(JSON.stringify({ question, answer: result.answer, citations: await citations.count(), elapsedMs: Date.now() - start, notice: result.notice }));
  }
  await page.screenshot({ path: '/tmp/sauceygpt-live-chat.png', fullPage: true });
} finally {
  await writeFile('/tmp/sauceygpt-live-chat-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
