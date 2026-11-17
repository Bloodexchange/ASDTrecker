import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshState} from '../web/core.js';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
 const state=freshState();state.currency='CNY';state.accounts[0].currency='CNY';state.accounts[0].name='Юани';
 state.rates={USD:1,UZS:12000,CNY:7.2,EUR:.9,RUB:90,KZT:500,GBP:.8,JPY:150,AED:3.67};state.ratesAt=Date.now();state.fetchedAt=Date.now();
 await context.addInitScript(s=>localStorage.setItem('asdtrecker.preview.v1',JSON.stringify(s)),state);
 await context.route('**/api/auth/get-session',r=>r.fulfill({json:null}));
 await context.route('**/api/rates',r=>r.fulfill({json:{result:'success',base_code:'USD',rates:state.rates,time_last_update_unix:Math.floor(state.ratesAt/1000),provider:'exchange-rate-api',frequency:'daily',checkedAt:Date.now(),central:[]}}));
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const click=async a=>page.locator(`[data-action="${a}"]:visible`).first().click();
 const nav=async id=>page.locator(`[data-action=nav][data-id=${id}]:visible`).first().click();
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('asdtrecker.preview.v1')));
 await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:4180');
 await nav('converter');assert.ok((await page.locator('#converter-result').textContent()).includes('60'));
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/liquid-converter-desktop.png',fullPage:true});
 await page.locator('#converter-amount').fill('200000 сум');assert.ok((await page.locator('.converted-number').textContent()).includes('120'));
 await click('converter-swap');assert.equal(await page.locator('#converter-from').inputValue(),'CNY');assert.equal(await page.locator('#converter-to').inputValue(),'UZS');assert.ok((await page.locator('.converted-number').textContent()).replace(/\s/g,'').includes('200000'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/liquid-converter-mobile.png',fullPage:true});
 await click('fx-open');await page.locator('#fx-search').fill('JPY');await page.getByText('JPY',{exact:true}).waitFor();await click('close');await page.waitForSelector('.modal',{state:'detached'});
 await nav('overview');await click('add-expense');await page.locator('#amount').fill('100000 сум');await page.locator('#tx-note').fill('Покупка с пересчётом в юани');
 assert.equal(await page.locator('#tx-currency').inputValue(),'CNY');assert.ok((await page.locator('#tx-conversion-preview strong').textContent()).includes('60'));
 await page.screenshot({path:'artifacts/liquid-entry-mobile.png',fullPage:true});
 await page.locator('#transaction-form [type=submit]').click();await page.waitForSelector('.modal',{state:'detached'});
 let s=await stored();assert.equal(s.transactions[0].amount,6000);assert.equal(s.transactions[0].accountAmount,6000);assert.equal(s.transactions[0].enteredCurrency,'UZS');assert.equal(s.transactions[0].enteredAmount,10000000);
 await click('detail');await page.getByText('Введено до пересчёта',{exact:true}).waitFor();await click('transaction-edit');await page.locator('#tx-note').fill('Изменено только описание');await page.locator('#transaction-form [type=submit]').click();await page.waitForSelector('.modal',{state:'detached'});
 s=await stored();assert.equal(s.transactions[0].amount,6000);assert.equal(s.transactions[0].enteredAmount,10000000);
 await click('budget-add');await page.locator('#budget-limit').fill('100000 UZS');assert.ok((await page.locator('#budget-limit-conversion').textContent()).includes('60 CNY'));await page.locator('#budget-form [type=submit]').click();await page.waitForSelector('.modal',{state:'detached'});assert.equal((await stored()).budgets[0].limit,6000);
 await click('settings');await click('demo');await page.waitForSelector('.modal',{state:'detached'});await page.screenshot({path:'artifacts/liquid-overview-mobile.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const id of ['history','analytics','plans','wallets','converter','overview']){await nav(id);await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow on ${id}`);}
 await page.setViewportSize({width:320,height:740});await nav('converter');await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'320px converter');
 await page.setViewportSize({width:1440,height:1050});await nav('overview');await page.waitForTimeout(650);await page.screenshot({path:'artifacts/liquid-overview-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('CONVERTER UI PASS: UZS→CNY live preview, saved original/converted values, account debit, edit preservation, budget conversion, all-currency search, six animated routes, 320/390/1440px layouts.');
}finally{await browser.close();}
