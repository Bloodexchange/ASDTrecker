import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-01-15T12:00:00Z')});
 let requests=0;
 await page.route('**/api/auth/get-session',route=>route.fulfill({json:null}));
 await page.route('**/api/rates',route=>{requests++;return route.fulfill({json:{result:'success',base_code:'USD',provider:'currencyapi',frequency:'intraday',refreshAfterSeconds:60,rates:{USD:1,UZS:requests>1?12200:12100,EUR:.9,TRY:40},time_last_update_unix:1768478400+requests*60,previousRates:{USD:1,UZS:12000,EUR:1,TRY:39},previousAt:1768435199,comparison:'previous-close',checkedAt:1768478400000,central:[]}});});
 await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:4180');
 console.log('FX UI: page loaded');
 await page.locator('[data-action=fx-open]').click();
 await page.locator('#fx-status').getByText(/каждые 1 мин/).waitFor();
 console.log('FX UI: minute source displayed');
 await page.locator('#fx-search').fill('TRY');
 assert.ok((await page.locator('#fx-rows').textContent()).includes('TRY'));
 await page.clock.fastForward(61000);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('asdtrecker.preview.v1')).rates.UZS===12200);
 assert.equal(await page.locator('#fx-search').inputValue(),'TRY');
 assert.equal(await page.locator('#fx-search').evaluate(e=>e===document.activeElement),true);
 assert.ok((await page.locator('#fx-rows').textContent()).includes('предыдущего дня'));
 assert.ok(requests>=2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/fx-intraday-mobile.png'});
 console.log('FX UI PASS: 60-second polling, live table refresh, cross-rate baseline, currency search, retained focus. Provider responses are controlled test fixtures.');
}finally{await browser.close();}
