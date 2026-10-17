import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
try {
  const code = 'const campaign = { name: "Example <script>" };\nawait client.post("/campaigns", campaign);';
  await page.route('**/api/chat', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', answer: 'Create a draft.', blocks: [[{text:'Create a draft first, then configure its content.',kind:'paragraph',citations:[1]}],[{text:'Choose a campaign name.',kind:'step',citations:[1]}],[{text:code,kind:'code',language:'javascript',citations:[1]}]], sources:[{id:1,title:'Example API',url:'https://example.org', evidence:[{claim:code,quote:'Create a draft with POST /campaigns and a name field.',locationURL:'https://example.org/#draft'}]}] })+'\n' }));
  await page.goto('http://localhost:3001'); await page.locator('#question').fill('Show an example'); await page.locator('#send').click();
  await page.locator('pre code').waitFor(); assert.equal(await page.locator('pre code').innerText(),code);
  assert.equal(await page.locator('pre script').count(),0);
  assert.equal((await page.locator('.step-number').innerText()).trim(),'1.');
  await page.screenshot({path:'/tmp/sauceygpt-code-answer.png'});
  await page.locator('.code-example .citation').click(); assert.match(await page.locator('#evidence-body blockquote').innerText(), /POST \/campaigns/);
  await page.locator('#close-evidence').click(); await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('Code rendering passed: inert code, steps, supporting excerpt, mobile overflow.');
} finally { await browser.close(); }
