import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
let finish, emit;
const server = createApp({ run: async (question, history, send, signal) => {
  emit = send;
  send({ type: 'progress', message: 'Drafting an answer…' });
  send({ type: 'draft_delta', delta: 'Hidden tentative claim' });
  send({ type: 'draft', text: 'Hidden full draft' });
  await new Promise(resolve => { finish = resolve; signal.addEventListener('abort', resolve, { once: true }); });
  return { blocks: [[{ text: 'Final checked answer.' }]], sources: [], answer: 'Final checked answer.' };
} }, true).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#question').fill('Test progress');
  await page.locator('#send').click();
  await page.getByText('Planning what to look up…', { exact: true }).waitFor();
  while (!emit) await new Promise(resolve => setTimeout(resolve, 10));
  assert.doesNotMatch(await page.locator('#thread').innerText(), /Hidden/);
  emit({ type: 'progress', message: 'Reading the articles…' });
  await page.getByText('Reading the articles…', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('.assistant').innerText(), /Hidden/);
  await page.screenshot({ path: '/tmp/sauceygpt-progress.png' });
  finish();
  await page.getByText('Final checked answer.', { exact: true }).waitFor();
  assert.equal(await page.locator('.research-steps').count(), 0);
  await page.waitForFunction(() => !document.querySelector('#send').disabled);
  await page.locator('#question').fill('Stop test');
  await page.locator('#send').click();
  await page.getByText('Planning what to look up…', { exact: true }).waitFor();
  await page.locator('#stop').click();
  await page.getByText('Research stopped', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('#thread').innerText(), /Hidden/);
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0);
  console.log('Progress checks passed: loading only, hidden drafts, final replacement, cancellation.');
} finally { finish?.(); await browser.close(); server.close(); }
