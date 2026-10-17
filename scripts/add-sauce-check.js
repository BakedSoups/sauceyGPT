import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:1200,height:900}});
try {
 let docs=[];
 await page.route('**/api/library',r=>r.fulfill({json:{documents:docs}}));
 await page.route('**/api/library/site',r=>{const body=r.request().postDataJSON();assert.match(body.url,/docs.godotengine.org/);assert.equal(body.maxPages,5);docs=[{id:'c'.repeat(64),title:body.title,chapters:[],pageCount:5,chunkCount:20,partial:true}];return r.fulfill({json:docs[0]});});
 await page.goto('http://localhost:3001');await page.locator('#open-library').click();await page.locator('#add-sauce').click();
 assert.equal(await page.locator('#shelf-view').isHidden(),true);
 await page.locator('[data-site=pandas]').click();assert.match(await page.locator('#site-url').inputValue(),/pandas.pydata.org/);
 await page.locator('[data-site=godot]').click();assert.equal(await page.locator('#document-title').inputValue(),'Godot documentation');
 await page.locator('#site-limit').selectOption('5');
 await page.screenshot({path:'/tmp/sauceygpt-add-sauce.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#library-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 await page.locator('#import-site').click();await page.getByRole('button',{name:'Godot documentation',exact:true}).waitFor();
 assert.equal(await page.locator('#add-sauce-view').isHidden(),true);
 assert.match(await page.locator('#library-status').innerText(),/5 pages/);
 await page.locator('#add-sauce').click();await page.locator('#back-to-shelf').click();assert.equal(await page.locator('#shelf-view').isVisible(),true);
 console.log('Add sauce menu passed: presets, scoped request, new jar, return navigation, mobile layout.');
}finally{await browser.close();}
